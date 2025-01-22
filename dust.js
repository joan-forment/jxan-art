/* Specks of dust drifting in the light, on a 2D canvas between the painting and the discs.
   They rise slowly, twinkle, and get nudged sideways by the disc scroll. */
(() => {
  const cvs = document.getElementById("birds");
  if (!cvs) return;
  const ctx = cvs.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cvs.width = W * dpr; cvs.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", resize); resize();

  const R = (a, b) => a + Math.random() * (b - a);
  const dust = Array.from({ length: 55 }, () => ({ x: R(0, 1), y: R(0, 1), r: R(.5, 1.7), vy: R(-.012, -.004), vx: R(.002, .008), ph: R(0, 6.3), d: R(.3, 1) }));

  let last = performance.now(), t = 0;
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, .05); last = now; t += dt;
    const s = window.__jx || { vel: 0 };
    ctx.clearRect(0, 0, W, H);
    for (const p of dust) {
      if (!still) {
        p.x += (p.vx - s.vel * .02 * p.d) * dt; p.y += p.vy * dt;
        if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); }
        p.x = (p.x + 1.04) % 1.04 - .02;
      }
      const a = .12 + .28 * (.5 + .5 * Math.sin(t * 1.3 + p.ph));
      ctx.fillStyle = `rgba(255,246,226,${a * p.d})`;
      ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(loop);
  })(last);
})();
