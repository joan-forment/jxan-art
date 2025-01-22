<?php
// Envía el aviso a todos los suscritos. Requiere el token privado en la cabecera X-Push-Token.
// Cuerpo {"dry":true}: solo cuenta los suscritos, sin enviar nada.
declare(strict_types=1);

header('Content-Type: application/json');
header('Cache-Control: no-store');

function reply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

function b64url(string $bin): string {
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

// openssl devuelve la firma ECDSA en DER; JWT ES256 la necesita como r||s de 32 bytes cada uno.
function derToRaw(string $der): string {
    $rLen = ord($der[3]);
    $r = substr($der, 4, $rLen);
    $s = substr($der, 4 + $rLen + 2, ord($der[4 + $rLen + 1]));
    $pad = fn(string $n) => str_pad(ltrim($n, "\0"), 32, "\0", STR_PAD_LEFT);
    return $pad($r) . $pad($s);
}

$base = dirname(__DIR__, 4) . '/jxan-push';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reply(405, ['error' => 'method']);

$expected = @file_get_contents($base . '/token.sha256');
$token = (string) ($_SERVER['HTTP_X_PUSH_TOKEN'] ?? '');
if ($expected === false || $token === '' || !hash_equals(trim($expected), hash('sha256', $token))) {
    reply(403, ['error' => 'token']);
}

$files = glob($base . '/subs/*.sub') ?: [];
$input = json_decode((string) file_get_contents('php://input'), true);
if (is_array($input) && ($input['dry'] ?? false) === true) reply(200, ['subscribers' => count($files)]);

$key = openssl_pkey_get_private((string) file_get_contents($base . '/vapid-private.pem'));
if ($key === false) reply(500, ['error' => 'key']);
$ec = openssl_pkey_get_details($key)['ec'];
$publicKey = b64url("\x04" . str_pad($ec['x'], 32, "\0", STR_PAD_LEFT) . str_pad($ec['y'], 32, "\0", STR_PAD_LEFT));

set_time_limit(0);
$jwts = [];
$sent = 0;
$removed = 0;
$failed = [];

foreach ($files as $file) {
    $endpoint = trim((string) file_get_contents($file));
    $u = parse_url($endpoint);
    $aud = 'https://' . ($u['host'] ?? '');

    if (!isset($jwts[$aud])) {
        $unsigned = b64url('{"typ":"JWT","alg":"ES256"}') . '.'
            . b64url((string) json_encode(['aud' => $aud, 'exp' => time() + 43200, 'sub' => 'https://jxan.art/']));
        if (!openssl_sign($unsigned, $der, $key, OPENSSL_ALGO_SHA256)) reply(500, ['error' => 'sign']);
        $jwts[$aud] = $unsigned . '.' . b64url(derToRaw($der));
    }

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'TTL: 604800',
            'Urgency: normal',
            'Content-Length: 0',
            'Authorization: vapid t=' . $jwts[$aud] . ', k=' . $publicKey,
        ],
    ]);
    curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($status >= 200 && $status < 300) {
        $sent++;
    } elseif ($status === 404 || $status === 410) {
        unlink($file); // el navegador ya no existe o canceló el permiso
        $removed++;
    } else {
        $failed[(string) $status] = ($failed[(string) $status] ?? 0) + 1;
    }
}

reply(200, ['total' => count($files), 'sent' => $sent, 'removed' => $removed, 'failed' => $failed]);
