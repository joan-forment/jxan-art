/* Background: our own hand-drawn landscape in wax crayon / oil pastel, drawn live on a 2D canvas.
   A green field with a winding dirt path, grazing sheep, a little blue castle on the horizon
   and a scratchy blue sky. Scrolling the disc carousel walks you forward through the field
   FRAME BY FRAME (stop-motion): window.__jx.pos is quantised into frames, and every new frame
   re-draws all the crayon strokes with a slightly different wobble, like animation drawn by hand.
   Nothing moves while you don't scroll. Everything is procedural: no images, no video. */
(() => {
  let readyRes; window.__skyReady = new Promise((r) => (readyRes = r));
  const cvs = document.getElementById("bgfx");
  if (!cvs) return readyRes();
  const ctx = cvs.getContext("2d");

  const FPD = 12;     // frames drawn per disc step
  const STEP = .5;    // metres walked per frame
  const CAM_H = 1.5;  // eye height (m)
  const FAR = 48;     // how far the field strokes go (m)

  // ---------- deterministic randomness ----------
  const prng = (seed) => { let a = seed >>> 0; return () => {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  // ---------- palette (crayon box) ----------
  const SKY = ["#9cc0e4", "#7fa8d6", "#b9d3ec", "#6b93c9", "#d7e6f3"];
  const GRASS = ["#2f7d2e", "#3b9334", "#4ba63c", "#5fb446", "#78c24f", "#2a6a2a", "#93cc58"];
  const SPARK = ["#e9dfb0", "#e8cf55", "#f2ead0"];
  const PATH = ["#e8dbb2", "#d9c48e", "#efe5c6", "#cdb57d"];
  const BLUE = "#2a3da6", BLUE2 = "#1f2f86";

  let W = 0, H = 0, hz = 0, f = 0, frame = null, paper = null;

  function resize() {
    const s = Math.min(1, 720 / innerHeight);
    W = Math.round(innerWidth * s); H = Math.round(innerHeight * s);
    cvs.width = W; cvs.height = H;
    hz = Math.round(H * (W > H ? .5 : .46));
    f = Math.max(W, H) * .62;
    paper = makePaper();
    frame = null;
  }

  // paper tooth: light specks where the crayon skips over the grain
  function makePaper() {
    const c = document.createElement("canvas"); c.width = W + 8; c.height = H + 8;
    const g = c.getContext("2d"), r = prng(99);
    for (let i = 0; i < (W * H) / 60; i++) {
      g.fillStyle = `rgba(250,244,226,${.15 + r() * .35})`;
      g.fillRect(r() * c.width, r() * c.height, 1, 1 + r() * 1.5);
    }
    return c;
  }

  // ---------- crayon primitives ----------
  let J; // per-frame jitter source (makes the drawing "boil")
  const jit = (a) => (J() - .5) * 2 * a;

  function stroke(x1, y1, x2, y2, w, col, alpha) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x1 + jit(.8), y1 + jit(.8));
    ctx.quadraticCurveTo((x1 + x2) / 2 + jit(w * .6 + .6), (y1 + y2) / 2 + jit(w * .6 + .6), x2 + jit(.8), y2 + jit(.8));
    ctx.stroke();
    if (w > 2.2) { // waxy second pass, thinner and offset: leaves gaps like real crayon
      ctx.globalAlpha = alpha * .55; ctx.lineWidth = w * .45;
      ctx.beginPath(); ctx.moveTo(x1 + jit(w * .5), y1 + jit(w * .5)); ctx.lineTo(x2 + jit(w * .5), y2 + jit(w * .5)); ctx.stroke();
    }
  }

  // zig-zag scribble fill of a polygon (scanlines, slightly tilted, wobbly ends)
  function scribble(poly, col, step, alpha, tilt = .25) {
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of poly) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    ctx.strokeStyle = col; ctx.lineWidth = step * 1.15; ctx.globalAlpha = alpha;
    ctx.beginPath();
    let flip = false, started = false;
    for (let y = y0 + step * .4; y < y1; y += step) {
      const xs = [];
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
        if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      let a = xs[0] + jit(step * .8), b = xs[xs.length - 1] + jit(step * .8);
      if (flip) [a, b] = [b, a];
      const dy = (b - a) * tilt * .1;
      if (!started) { ctx.moveTo(a, y - dy); started = true; } else ctx.lineTo(a, y - dy + jit(step * .3));
      ctx.lineTo(b, y + dy + jit(step * .3));
      flip = !flip;
    }
    ctx.stroke();
  }
  const ellipse = (cx, cy, rx, ry, n = 14) =>
    Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

  // ---------- projection ----------
  const xHalf = () => (W / 2) / f * 1.15;           // half field width per metre of depth
  const sx = (x, z) => W / 2 + f * x / z;
  const sy = (z, h = 0) => hz + f * (CAM_H - h) / z;
  const pathX = (z) => Math.sin(z * .07) * 2.6 + Math.sin(z * .023 + 1) * 3.2;
  const PATH_W = .9;

  // ---------- scene ----------
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, "#5e88c6"); g.addColorStop(.7, "#8fb3dc"); g.addColorStop(1, "#c4d8ea");
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz + 2);
    // scratchy hatching all over the sky
    const r = prng(11), n = Math.round(W * hz / 260);
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * hz, len = 4 + r() * 12, a = -1.9 + r() * 1.1;
      const c = r() < .12 ? "#e9f0f6" : pick(r, SKY);
      stroke(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 1 + r() * 1.4, c, .18 + r() * .3);
    }
  }

  function drawHorizon() {
    // rusty strip of far fields
    ctx.globalAlpha = 1; ctx.fillStyle = "#b9763e"; ctx.fillRect(0, hz - 2, W, 6);
    const r = prng(31);
    for (let x = 0; x < W; x += 3) stroke(x, hz - 2 + r() * 3, x + 6 + r() * 8, hz - 1 + r() * 4, 1.6, r() < .5 ? "#c98a4a" : "#9c5f30", .7);
    // dark blue-green tree clumps
    const rt = prng(37), u = H / 100;
    for (let i = 0; i < 9; i++) {
      const x = rt() * W, w = (1.2 + rt() * 2.4) * u;
      scribble(ellipse(x, hz - w * .45, w, w * .6), rt() < .5 ? "#1e3b57" : "#264f45", 1.6, .9);
    }
    drawCastle(W * (W > H ? .27 : .24), hz + 2, Math.min(W, H) / 100 * (W > H ? .42 : .55));
  }

  // little ultramarine castle on the horizon (drawn in crayon, white walls showing through)
  function drawCastle(x, y, u) {
    const S = u;
    scribble(rect(x - 15 * S, y - 7 * S, 34 * S, 7 * S), BLUE2, 1.4, .95);               // base / rock
    scribble(rect(x - 10 * S, y - 16 * S, 18 * S, 10 * S), BLUE, 1.4, .95);              // main hall
    scribble(rect(x - 4 * S, y - 13 * S, 6 * S, 6 * S), "#f2f0e6", 1.2, .9);             // white wall
    scribble(rect(x - 13 * S, y - 19 * S, 5 * S, 13 * S), "#eceae0", 1.2, .9);           // left white tower
    scribble([[x - 14 * S, y - 19 * S], [x - 10.5 * S, y - 24 * S], [x - 7 * S, y - 19 * S]], BLUE2, 1.2, .95);
    scribble([[x - 8 * S, y - 16 * S], [x - 1 * S, y - 26 * S], [x + 6 * S, y - 16 * S]], BLUE, 1.2, .95); // central roof
    stroke(x - 1 * S, y - 26 * S, x - 1 * S, y - 31 * S, 1.2, BLUE2, .9);                // spire
    stroke(x - 1 * S, y - 31 * S, x + 2 * S, y - 30 * S, 2, "#d9462b", .9);             // flag
    scribble(rect(x + 8 * S, y - 13 * S, 5 * S, 7 * S), BLUE, 1.3, .95);                 // right tower
    scribble([[x + 7.5 * S, y - 13 * S], [x + 10.5 * S, y - 18 * S], [x + 13.5 * S, y - 13 * S]], BLUE2, 1.2, .95);
    scribble(rect(x + 14 * S, y - 10 * S, 7 * S, 4 * S), BLUE2, 1.2, .9);                // low wing
    for (let i = 0; i < 4; i++) stroke(x - 7 * S + i * 3 * S, y - 12 * S, x - 7 * S + i * 3 * S, y - 10 * S, 1.2, "#f2f0e6", .8); // windows
  }

  function drawField(fr) {
    const camZ = fr * STEP;
    const g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, "#5aa543"); g.addColorStop(.35, "#3f9536"); g.addColorStop(1, "#2f8130");
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, hz + 3, W, H - hz);

    // dirt path, winding off towards the horizon
    const L = [], R = [];
    for (let d = .6; d < FAR; d *= 1.12) {
      const z = camZ + d, px = pathX(z), w = PATH_W * (1 + .15 * Math.sin(z * .4));
      L.push([sx(px - w - camX(camZ), d), sy(d)]); R.unshift([sx(px + w - camX(camZ), d), sy(d)]);
    }
    scribble(L.concat(R), "#e4d6aa", 2.4, .9, 0);

    // strokes, cell by cell, far → near; sheep are drawn in depth order with them
    const xh = xHalf(), cx = camX(camZ);
    for (let c = Math.floor(camZ + FAR); c >= Math.floor(camZ); c--) {
      const r = prng(c * 7919 + 17);
      const n = 70;
      for (let i = 0; i < n; i++) {
        const z = c + r(), d = z - camZ;
        const xw = (r() * 2 - 1) * xh * Math.max(d, .5) + cx;
        const len = .25 + r() * .8, w = Math.max(1, f * .045 / Math.max(d, .5) * (.6 + r()));
        const pr = r(), onPath = Math.abs(xw - pathX(z)) < PATH_W * 1.05;
        if (d < .45 || d > FAR) continue;
        let col, a = .55 + r() * .4;
        if (onPath) col = pr < .15 ? pick(r, GRASS) : pick(r, PATH);
        else col = pr < .07 ? pick(r, SPARK) : pick(r, GRASS);
        const d2 = Math.max(d - len, .35);
        // streaks run along the depth (towards you), like the grass rushing past
        stroke(sx(xw - cx, d), sy(d), sx(xw - cx, d2) + jit(w), sy(d2), w, col, a);
      }
      // a sheep every few metres
      const rs = prng(c * 104729 + 5);
      if (rs() < .16) {
        const z = c + rs(), d = z - camZ;
        let xw = (rs() * 2 - 1) * xh * .9 * d + cx;
        if (Math.abs(xw - pathX(z)) < PATH_W * 1.8) xw += (xw > pathX(z) ? 1 : -1) * PATH_W * 2.2;
        if (d > 1.2 && d < FAR * .8) drawSheep(xw - cx, d, rs);
      }
    }
  }
  // the camera follows the path loosely, so the road swings left and right as you walk
  const camX = (camZ) => pathX(camZ + 3) * .7;

  function drawSheep(x, d, r) {
    const k = f / d;                       // px per metre at this depth
    const bx = sx(x, d), gy = sy(d);
    const face = r() < .5 ? -1 : 1, black = r() < .15;
    const bw = .55 * k, bh = .33 * k, by = gy - .55 * k;
    // shadow
    scribble(ellipse(bx + face * -.15 * k, gy, bw * 1.1, .07 * k, 10), "#1f5a22", Math.max(1, k * .03), .55, 0);
    // legs
    const lw = Math.max(1, k * .05);
    for (const o of [-.35, -.15, .15, .35]) stroke(bx + o * k, by + bh * .6, bx + o * k + jit(.5), gy, lw, "#151515", .9);
    // woolly body
    scribble(ellipse(bx, by, bw, bh), black ? "#252323" : "#efe7cf", Math.max(1, k * .05), .95, .6);
    if (!black) scribble(ellipse(bx - face * bw * .2, by - bh * .25, bw * .6, bh * .45), "#fbf7ea", Math.max(1, k * .04), .7, .6);
    // head + ear
    const hx = bx + face * bw * 1.02, hy = by - bh * .15;
    scribble(ellipse(hx, hy, .14 * k, .19 * k, 10), "#141414", Math.max(1, k * .035), .95, 0);
    stroke(hx - face * .06 * k, hy - .14 * k, hx - face * .2 * k, hy - .1 * k, Math.max(1, k * .04), "#141414", .9);
  }

  function draw(fr) {
    J = prng(fr * 2654435761 + 1);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    drawSky();
    drawHorizon();
    drawField(fr);
    // paper grain showing through the wax; it shifts a bit each frame
    ctx.globalAlpha = .3;
    ctx.drawImage(paper, -(fr % 3) * 3, -((fr >> 1) % 3) * 3);
    ctx.globalAlpha = 1;
  }

  addEventListener("resize", resize); resize();
  (function loop() {
    requestAnimationFrame(loop);
    const s = window.__jx || { pos: 0 };
    const fr = Math.floor(s.pos * FPD);
    if (fr !== frame) { frame = fr; draw(fr); }
  })();
  cvs.classList.add("is-on");
  readyRes();
})();
