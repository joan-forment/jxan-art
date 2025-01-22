<?php
// Guarda la dirección de notificación de un navegador. No guarda IP ni datos personales.
declare(strict_types=1);

header('Content-Type: application/json');
header('Cache-Control: no-store');

function reply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

const MAX_SUBSCRIPTIONS = 20000;

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reply(405, ['error' => 'method']);
if (($_SERVER['HTTP_ORIGIN'] ?? '') !== 'https://jxan.art') reply(403, ['error' => 'origin']);

$raw = file_get_contents('php://input', false, null, 0, 2049);
if ($raw === false || strlen($raw) > 2048) reply(413, ['error' => 'size']);

$data = json_decode($raw, true);
$endpoint = is_array($data) ? ($data['endpoint'] ?? null) : null;
if (!is_string($endpoint) || strlen($endpoint) > 1024) reply(422, ['error' => 'endpoint']);

// Solo servicios de notificación reales: send.php hará peticiones a estas direcciones.
$url = parse_url($endpoint);
$host = strtolower($url['host'] ?? '');
$validHost = (bool) preg_match(
    '/^(fcm\.googleapis\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)$/',
    $host
);
if (($url['scheme'] ?? '') !== 'https' || !$validHost || isset($url['port']) || isset($url['user'])) {
    reply(422, ['error' => 'endpoint']);
}

$dir = dirname(__DIR__, 4) . '/jxan-push/subs';
if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) reply(500, ['error' => 'storage']);

$file = $dir . '/' . hash('sha256', $endpoint) . '.sub';
if (!is_file($file)) {
    if (iterator_count(new FilesystemIterator($dir)) >= MAX_SUBSCRIPTIONS) reply(503, ['error' => 'full']);
    if (file_put_contents($file, $endpoint, LOCK_EX) === false) reply(500, ['error' => 'storage']);
    chmod($file, 0600);
}

reply(201, ['ok' => true]);
