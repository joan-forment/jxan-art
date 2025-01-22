/* JXAN — 3D disc carousel (Three.js). Data lives in music.js */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const N = RELEASES.length;
  const TAU = Math.PI * 2;
  const isTouch = matchMedia("(hover: none)").matches;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const body = document.body;

  /* ================= DOM: index, progress, info ================= */
  $("#indexMenu").innerHTML = RELEASES.map((r, i) =>
    `<li><button data-i="${i}"><span>${esc(r.title)}</span><span>${esc(r.year)}</span></button></li>`).join("");
  $("#progress").innerHTML = RELEASES.map((r, i) => `<button data-i="${i}">${String(i + 1).padStart(2, "0")}</button>`).join("");
  $("#navSpotify").href = ARTIST_SPOTIFY;

  function starsHTML(n) {
    const pct = clamp(n, 0, 5) / 5 * 100;
    return `<span class="stars" aria-label="${n} de 5"><span class="bg">★★★★★</span><span class="fg" style="width:${pct}%">★★★★★</span></span>`;
  }
  function renderInfo(i) {
    const r = RELEASES[i];
    const rows = Object.entries(r.credits || {}).map(([k, v]) =>
      `<div class="info__row fx"><dt class="cap">${esc(k)}</dt><dd>${[].concat(v).map(esc).join("<br>")}</dd></div>`).join("");
    $("#info").innerHTML = `<dl>${r.upcoming ? `<span class="soon fx">Muy pronto</span>` : ""}<h2 class="info__title fx">${esc(r.title)}</h2><svg class="brush" viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M4 10 C 60 3, 120 14, 182 8 S 268 5, 296 9"/></svg>${rows}</dl>`;
    // museum-style placard for the disc on show
    const media = ["óleo sobre disco compacto, 12 cm", "pigmento y sonido sobre policarbonato", "técnica mixta sobre cd, 12 cm"];
    $("#placard").innerHTML = `<p class="placard__t fx"><b>${esc(r.title)}</b>, ${esc(r.year)}</p><p class="fx">${esc(ARTIST)}</p><p class="placard__m fx">${r.upcoming ? "Obra en proceso · muy pronto" : media[i % media.length]}</p>`;
    if (r.upcoming) {
      $("#quotes").innerHTML = `<button class="presave fx" id="notifyBtn" type="button"></button>`;
      paintNotify();
    } else $("#quotes").innerHTML = (r.quotes || []).slice(0, 2).map((q) =>
      `<figure class="quote fx">${starsHTML(q.stars ?? 5)}<span class="cap">${esc(q.by)}</span><p>“${esc(q.text)}”</p></figure>`).join("");
    document.querySelectorAll("#progress button, #indexMenu button").forEach((b) => b.classList.toggle("is-current", +b.dataset.i === i));
  }

  /* ================= Aviso de la cuenta atrás ================= */
  const NOTIFY_TEXT = {
    idle: "Avísame",
    busy: "…",
    on: "Te avisaré",
    denied: "Avisos bloqueados en el navegador",
    ios: "Añade la web a inicio para los avisos",
    unsupported: "Este navegador no admite avisos",
    error: "No se pudo, inténtalo otra vez",
  };
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const canPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let notifyState = "idle";

  function paintNotify() {
    const b = $("#notifyBtn");
    if (!b) return;
    b.textContent = NOTIFY_TEXT[notifyState];
    b.disabled = !["idle", "error"].includes(notifyState);
    b.classList.toggle("presave--small", ["denied", "ios", "unsupported", "error"].includes(notifyState));
  }
  function setNotify(state) { notifyState = state; paintNotify(); }

  function keyBytes(b64) {
    const raw = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  async function subscribeNotify() {
    if (isIOS && !navigator.standalone) return setNotify("ios");
    if (!canPush) return setNotify("unsupported");
    setNotify("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setNotify(permission === "denied" ? "denied" : "idle");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(NOTIFY_KEY) });
      const res = await fetch("/api/subscribe.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      if (!res.ok) { await sub.unsubscribe(); throw new Error("subscribe " + res.status); }
      setNotify("on");
    } catch (err) {
      console.error(err);
      setNotify("error");
    }
  }

  $("#quotes").addEventListener("click", (e) => { if (e.target.closest("#notifyBtn")) subscribeNotify(); });

  if (canPush) {
    if (Notification.permission === "denied") notifyState = "denied";
    navigator.serviceWorker.getRegistration("/")
      .then((reg) => reg && reg.pushManager.getSubscription())
      .then((sub) => { if (sub) setNotify("on"); })
      .catch(() => {});
  }

  /* ================= Info panel ================= */
  const about = $("#sobre");
  function setAbout(open) {
    about.classList.toggle("is-open", open);
    if (open) { if (location.hash !== "#sobre") history.pushState(null, "", "#sobre"); }
    else if (location.hash === "#sobre") history.pushState(null, "", location.pathname + location.search);
  }
  $("#aboutOpen").addEventListener("click", (e) => { e.preventDefault(); setAbout(true); });
  $("#aboutClose").addEventListener("click", () => setAbout(false));
  addEventListener("popstate", () => about.classList.toggle("is-open", location.hash === "#sobre"));
  if (location.hash === "#sobre") about.classList.add("is-open");

  /* ================= WebGL setup ================= */
  const canvas = $("#gl");
  // weak hardware: skip MSAA and start with fewer pixels (iOS reports no memory, so it counts as capable)
  const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowEnd, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    // Sin WebGL: el panel de texto ya tiene todos los lanzamientos y enlaces.
    body.classList.add("no-gl");
    body.classList.remove("is-loading");
    $("#loader").classList.add("is-done");
    about.classList.add("is-open");
    return;
  }
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x000000, 0);
  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), lowEnd ? 4 : 8);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  // Studio environment: grey room + soft boxes → silver rims & iridescent sheen
  (function buildEnv() {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), new THREE.MeshBasicMaterial({ color: 0x9a7466, side: THREE.BackSide }))); // warm room → rims pick up the orange
    const panel = (w, h, x, y, z, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(14, 4, 0, 10, 4, 5);     // top strip
    panel(4, 10, -10, 2, 5, 3);    // left box
    panel(3, 9, 10, -1, 6, 2.2);   // right box
    panel(14, 8, 0, 0, 11, 1.25);  // front fill
    panel(6, 2, 4, -10, 2, 1.6);   // floor bounce
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.035).texture;
    pm.dispose();
  })();

  /* ================= Disc geometry & materials ================= */
  const R_HOLE = 0.125, R_HUB = 0.255, T = 0.024;
  const faceGeo = new THREE.RingGeometry(R_HUB, 1, 160, 1);
  const hubGeo = new THREE.RingGeometry(R_HOLE, R_HUB, 96, 1);
  const stackGeo = new THREE.RingGeometry(0.165, 0.225, 96, 1);
  const lipGeo = new THREE.RingGeometry(R_HOLE, R_HOLE + 0.012, 96, 1);
  const rimGeo = new THREE.RingGeometry(0.984, 1.001, 160, 1);
  const edgeGeo = new THREE.CylinderGeometry(1, 1, T, 160, 1, true); edgeGeo.rotateX(Math.PI / 2);
  const holePickGeo = new THREE.CircleGeometry(R_HUB, 32);
  const holePickMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide, depthWrite: false });
  const holeGeo = new THREE.CylinderGeometry(R_HOLE, R_HOLE, T, 64, 1, true); holeGeo.rotateX(Math.PI / 2);

  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xc9cace, metalness: 0.9, roughness: 0.3 });
  const hubMat = new THREE.MeshPhysicalMaterial({
    color: 0xd3d8e0, metalness: 0, roughness: 0.1, clearcoat: 1,
    transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide,
  });
  const stackMat = new THREE.MeshPhysicalMaterial({ color: 0x9aa3b2, metalness: 0.2, roughness: 0.2, clearcoat: 1, transparent: true, opacity: 0.92, depthWrite: false });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, metalness: 0.4, roughness: 0.15, transparent: true, opacity: 0.95, depthWrite: false });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f6, metalness: 0.7, roughness: 0.25 });

  // very subtle light streak so the disc still reads as glossy plastic
  const glossMat = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 512, 512);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(.42, "rgba(255,255,255,0)");
    gr.addColorStop(.5, "rgba(255,255,255,1)"); gr.addColorStop(.58, "rgba(255,255,255,0)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: .07, depthWrite: false, blending: THREE.AdditiveBlending });
  })();

  // soft contact shadow texture
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"), gr = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    gr.addColorStop(0, "rgba(30,25,22,.68)");
    gr.addColorStop(.5, "rgba(38,32,28,.4)");
    gr.addColorStop(.78, "rgba(45,40,36,.16)");
    gr.addColorStop(1, "rgba(45,40,36,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(2.9, 2.9);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: .52 });

  /* ================= Disc label (canvas texture) ================= */
  // label resolution: 2048 only when the centre disc really covers that many device pixels
  const S = !lowEnd && innerWidth >= 900 && innerHeight * Math.min(devicePixelRatio || 1, 2) * .65 > 1100 ? 2048 : 1024;
  const coverSrc = (cover) => cover.replace(/^covers\/(.+)\.\w+$/, `covers/web/$1-${S > 1024 ? 1600 : 1024}.webp`);
  function drawFace(d) {
    const r = d.r, c = d.ctx;
    c.save();
    c.clearRect(0, 0, S, S);
    if (d.img) {
      const im = d.img, s = Math.max(S / im.width, S / im.height);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
      c.drawImage(im, (S - im.width * s) / 2, (S - im.height * s) / 2, im.width * s, im.height * s);
    } else {
      const [a, b] = r.colors || ["#888", "#222"];
      let g = c.createLinearGradient(0, S, S, 0);
      g.addColorStop(0, b); g.addColorStop(1, a);
      c.fillStyle = g; c.fillRect(0, 0, S, S);
      g = c.createRadialGradient(S * .32, S * .3, 0, S * .32, S * .3, S * .75);
      g.addColorStop(0, a); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.fillRect(0, 0, S, S);
      // cover still on its way: the gradient alone stands in until it arrives
      if (d.pending) { c.restore(); d.tex.needsUpdate = true; return; }
      // print grain
      for (let k = 0; k < 14000; k++) {
        c.fillStyle = Math.random() < .5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.06)";
        c.fillRect(Math.random() * S, Math.random() * S, 2, 2);
      }
      // title block
      c.textAlign = "center"; c.textBaseline = "alphabetic";
      c.fillStyle = "rgba(255,255,255,.62)";
      let fs = S * .11;
      const title = r.title.toLocaleLowerCase("es");
      c.font = `400 ${fs}px "Dirtyline36Daysoftype2022"`;
      const w = c.measureText(title).width;
      if (w > S * .6) { fs *= S * .6 / w; c.font = `400 ${fs}px "Dirtyline36Daysoftype2022"`; }
      if ("letterSpacing" in c) c.letterSpacing = `${-fs * .05}px`;
      c.fillText(title, S / 2, S * .25);
      if ("letterSpacing" in c) c.letterSpacing = "0px";
      c.font = `400 ${fs * .4}px "Dirtyline36Daysoftype2022"`;
      c.fillText(ARTIST.toLocaleLowerCase("es"), S / 2, S * .25 + fs * .52);
    }
    // ring credits text
    c.fillStyle = d.img ? "rgba(255,255,255,.82)" : "rgba(255,255,255,.7)";
    c.shadowColor = "rgba(0,0,0,.25)"; c.shadowBlur = 3;
    c.font = `400 ${S * .0175}px "Dirtyline36Daysoftype2022"`;
    c.textAlign = "center"; c.textBaseline = "middle";
    const credits = Object.values(r.credits || {}).flat().filter((v) => String(v) !== String(r.year));
    // Keep each release title's original letter case on the disc label.
    const txt = [ARTIST, r.title, r.type, ...(r.upcoming ? ["Muy pronto"] : []), ...credits, r.year].join("   ·   ").toLocaleLowerCase("es") + "   ·   ";
    const rad = S * .458, start = Math.PI * .75, end = start + TAU * .62;
    let ang = start, k = 0;
    while (ang < end) {
      const ch = txt[k++ % txt.length], cw = c.measureText(ch).width + S * .0042;
      ang += cw / 2 / rad;
      c.save();
      c.translate(S / 2 + Math.cos(ang) * rad, S / 2 + Math.sin(ang) * rad);
      c.rotate(ang + Math.PI / 2);
      c.fillText(ch, 0, 0);
      c.restore();
      ang += cw / 2 / rad;
    }
    c.restore();
    d.tex.needsUpdate = true;
  }

  /* ================= Build discs ================= */
  const IDLE_SPIN = 0.1; // rad/s — one full turn every ~63 s
  const REST = -0.25; // starting label angle (≈20° further to the left than before) // resting label angle: title reads slightly rising to the right
  // one label texture + material per release, shared by every copy of that disc
  const labels = RELEASES.map((r) => {
    const cvs = document.createElement("canvas"); cvs.width = cvs.height = S;
    const tex = new THREE.CanvasTexture(cvs);
    tex.encoding = THREE.sRGBEncoding; tex.anisotropy = maxAniso;
    // Cover is painted with its exact colours: no lighting, no reflections on top of the artwork.
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    return { r, cvs, ctx: cvs.getContext("2d"), tex, mat, img: null };
  });

  // Infinite loop: enough copies on the ring that the wrap-around always happens off-screen
  const M = N * Math.ceil(8 / N);
  const B = M - 2.5; // offsets live in [-(M-2.5), 2.5)
  const wrap = (x) => ((x % M) + M) % M;
  const offsetOf = (slot, p) => wrap(slot - p + B) - B;

  const pickables = [];
  const discs = Array.from({ length: M }, (_, i) => {
    const rel = i % N, r = RELEASES[rel], faceMat = labels[rel].mat;

    const root = new THREE.Group(), tilt = new THREE.Group(), spin = new THREE.Group();
    tilt.rotation.order = "ZXY";
    root.add(tilt); tilt.add(spin);

    const face = new THREE.Mesh(faceGeo, faceMat); face.position.z = T / 2;
    const back = new THREE.Mesh(faceGeo, edgeMat); back.rotation.y = Math.PI; back.position.z = -T / 2;
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    const hole = new THREE.Mesh(holeGeo, edgeMat);
    const hubF = new THREE.Mesh(hubGeo, hubMat); hubF.position.z = T / 2;
    const hubB = new THREE.Mesh(hubGeo, hubMat); hubB.position.z = -T / 2;
    const stack = new THREE.Mesh(stackGeo, stackMat); stack.position.z = T / 2 + .006;
    const lip = new THREE.Mesh(lipGeo, lipMat); lip.position.z = T / 2 + .002;
    const rim = new THREE.Mesh(rimGeo, rimMat); rim.position.z = T / 2 + .001;
    const gloss = new THREE.Mesh(faceGeo, glossMat); gloss.position.z = T / 2 + .0015;
    tilt.add(gloss); // on tilt, not spin: the highlight stays put while the disc turns
    spin.add(face, back, edge, hole, hubF, stack, lip, rim);

    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.set(.08, -.2, -.45);
    shadow.renderOrder = -1;
    tilt.add(shadow);

    // invisible disc so a tap on the centre hole counts as a tap on the disc
    const holePick = new THREE.Mesh(holePickGeo, holePickMat); holePick.position.z = T / 2;
    spin.add(holePick);
    [face, back, hubF, edge, holePick].forEach((m) => { m.userData.i = i; pickables.push(m); });
    scene.add(root);
    const d = { r, i, rel, root, tilt, spin, shadow, hx: 0, hy: 0, mx: 0, my: 0, sc: 0, spinV: 0, spinBase: REST, settle: null };
    d.spin.rotation.z = REST;
    return d;
  });

  const scrib = { disc: -1, p: null, on: false, offT: 0, key: null, seen: new THREE.Matrix4() };

  /* ================= Layout ================= */
  // Disc tilted ~41° back, rotated ~49° → long axis rising to the right
  const BASE_X = -0.72, BASE_Z = 0.86;
  const CAM_Z = 14;
  const TANF = 2 * Math.tan(THREE.MathUtils.degToRad(35 / 2)); // visible height per unit of depth
  function params() {
    const visH = CAM_Z * TANF, visW = visH * camera.aspect;
    const mobile = innerWidth < 900;
    if (mobile) return { mobile, R: 1, f: 1, oy: 0 }; // phones use phoneDisc()
    return { mobile, R: visH * .325 * Math.min(1, camera.aspect / 1.6), f: Math.min(1, camera.aspect / 1.6), oy: .02 };
  }
  /* Path of a disc at offset d from the centre, in screen units (fractions of viewport height).
     Next discs (d>0) spread out up-right and come closer to the camera.
     Previous discs (d<0) bunch up down-left like a fanned stack: each one closer to the last,
     further away and turned a little flatter. Continuous in d so motion stays fluid. */
  function pathAt(d, L) {
    if (d >= 0) return { x: d * .69, y: d * .212, z: d * 2.3, rz: d * -.04 };
    const a = -d;
    return {
      x: -2.51 * (1 - Math.pow(.8, a)),
      y: -.22 * (1 - Math.exp(-1.1 * a)),
      z: -3.2 * (1 - Math.exp(-.7 * a)),
      rz: -.42 * (1 - Math.exp(-1.5 * a)),
    };
  }
  /* Rendered pixels: capped by screen density and total count, then lowered further by watchFrames(). */
  const QUALITY = [1, .85, .72, .6];
  const perf = { level: 0, n: 0, sum: 0, before: 0, settled: false, ema: 1 / 60 };
  function pixelRatio() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cap = Math.sqrt((lowEnd ? 2e6 : 5e6) / (innerWidth * innerHeight));
    return Math.max(Math.min(dpr, .75), Math.min(dpr, cap) * QUALITY[perf.level]);
  }
  function resize() {
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    scrib.key = null;
  }
  let resizeDue = false;
  addEventListener("resize", () => { resizeDue = true; });
  /* Measured only while the discs move, which is when a drop in frame rate shows. If a step down
     does not help, the limit is elsewhere (battery saver caps the rate, say): undo it and stop trying. */
  function watchFrames(dt) {
    if (perf.settled || dt > .25) return;
    perf.sum += dt;
    if (++perf.n < 30) return;
    const avg = perf.sum / perf.n;
    perf.sum = perf.n = 0;
    if (perf.before && avg > perf.before * .92) { perf.level--; perf.settled = true; resize(); return; }
    perf.before = 0;
    if (avg > 1 / 40 && perf.level < QUALITY.length - 1) { perf.before = avg; perf.level++; resize(); }
  }

  /* ================= State ================= */
  let pos = 0, target = 0, active = -1, activeSlot = 0, vel = 0, pv = 0, lastInput = 0;
  const isPhone = () => innerWidth < 900;
  // phone motion: the finger moves the list 1:1, release glides with this curve
  const glideEase = (t) => {
    // cubic-bezier(.32, .72, 0, 1)
    let u = t;
    for (let i = 0; i < 6; i++) {
      const x = 3 * (1 - u) * (1 - u) * u * .32 + 3 * (1 - u) * u * u * 0 + u * u * u;
      const dx = 3 * (1 - u) * (1 - u) * .32 + 6 * (1 - u) * u * (0 - .32) + 3 * u * u * (1 - 0);
      if (Math.abs(dx) < 1e-5) break;
      u = clamp(u - (x - t) / dx, 0, 1);
    }
    return 3 * (1 - u) * (1 - u) * u * .72 + 3 * (1 - u) * u * u + u * u * u;
  };
  let glide = null, glideOpts = null, flow = 0, prevPos = 0;
  const setClickGlide = (delta) => { const t = Math.abs(delta); glideOpts = { dur: clamp(.45 + t * .11, .46, 1.05), kick: Math.min(5, t * 1.4) }; };
  let bootStart = performance.now(), introStart = 0, loading = true;
  /* Intro (own design):
     1. while loading, the first disc rises out of the depth alone and spins fast over the counter
     2. when loading ends it brakes with inertia and lands with its title upright
     3. then the rest of the discs drop in around it, nearest first */
  const easeInOut = (t) => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  function introEase(d, now, dd) {
    if (d.i === 0) return easeInOut((now - bootStart - 250) / 1300);
    if (!introStart) return 0;
    return easeInOut((now - introStart - 300 - Math.abs(Math.round(dd)) * 160) / 1100);
  }
  function settleSpin(d) {
    // land on the next resting angle "ahead" of the current spin direction
    const ahead = d.spinBase + d.spinV / 2.6;
    const rest = isPhone() ? 0 : REST;
    d.settle = rest + Math.floor((ahead - rest) / TAU) * TAU;
  }
  function goToRelease(ri) {
    if (focus) exitFocus();
    const cur = wrap(Math.round(target)) % N;
    let delta = ((ri - cur) % N + N) % N;
    if (delta > N / 2) delta -= N;
    if (isPhone()) setClickGlide(delta);
    target = Math.round(target) + delta;
    lastInput = performance.now();
  }
  function goToSlot(s) {
    if (focus) exitFocus();
    const delta = Math.round(offsetOf(s, Math.round(target)));
    if (isPhone()) setClickGlide(delta);
    target = Math.round(target) + delta;
    lastInput = performance.now();
  }
  let hovered = -1, focus = false, focusAmt = 0, ready = false;
  const pointer = { x: 0, y: 0, nx: 0, ny: 0, has: false, moved: false };
  const raycaster = new THREE.Raycaster();
  const tmpV = new THREE.Vector3();


  function pick(cx, cy) {
    raycaster.setFromCamera({ x: (cx / innerWidth) * 2 - 1, y: -(cy / innerHeight) * 2 + 1 }, camera);
    const hit = raycaster.intersectObjects(pickables, false).find((h) => h.object.parent.parent.parent.visible);
    return hit ? hit.object.userData.i : -1;
  }
  function toScreen(v) { v.project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }

  /* ================= Scribble (hand-drawn loop on hover) ================= */
  const scribPath = $("#scribble path");
  function scribbleIn(i) {
    const rnd = Math.random;
    scrib.disc = i; scrib.on = true;
    scrib.p = { a0: rnd() * TAU, turns: 1.75 + rnd() * .3, dir: rnd() < .5 ? 1 : -1, p1: rnd() * TAU, p2: rnd() * TAU, p3: rnd() * TAU };
    scrib.key = null;
    buildScribble();
    scribPath.style.transition = "none";
    scribPath.style.strokeDashoffset = "1";
    scribPath.getBoundingClientRect();
    scribPath.style.transition = "stroke-dashoffset .8s cubic-bezier(.3,.55,.15,1)";
    scribPath.style.strokeDashoffset = "0";
  }
  function scribbleOut() {
    if (!scrib.on) return;
    scrib.on = false;
    scribPath.style.transition = "stroke-dashoffset .45s cubic-bezier(.5,0,.75,0)";
    scribPath.style.strokeDashoffset = "-1";
    clearTimeout(scrib.offT);
    scrib.offT = setTimeout(() => { if (!scrib.on) scrib.disc = -1; }, 600);
  }
  function buildScribble() {
    const d = discs[scrib.disc], p = scrib.p;
    if (!d) return;
    d.root.updateWorldMatrix(false, true);
    // the loop follows the tilt, not the spin: nothing to redo while the disc only turns
    if (scrib.key === d.i && scrib.seen.equals(d.tilt.matrixWorld)) return;
    scrib.key = d.i; scrib.seen.copy(d.tilt.matrixWorld);
    const n = Math.round(70 * p.turns), pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, a = p.a0 + p.dir * t * p.turns * TAU;
      // hugs the rim: wobbles between ~1.02 and ~1.09 of the radius
      let rr = 1.05 + .022 * Math.sin(a * 2 + p.p1) + .014 * Math.sin(a * 3.3 + p.p2) + .012 * Math.sin(t * 11 + p.p3) + t * .02;
      if (t < .05) rr += (.05 - t) * .9;            // entry stroke
      if (t > .95) rr += (t - .95) * 1.1;           // small flick out
      tmpV.set(Math.cos(a) * rr, Math.sin(a) * rr, T).applyMatrix4(d.tilt.matrixWorld);
      pts.push(toScreen(tmpV));
    }
    let s = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let k = 1; k < pts.length - 1; k++) {
      const mx = (pts[k].x + pts[k + 1].x) / 2, my = (pts[k].y + pts[k + 1].y) / 2;
      s += `Q${pts[k].x.toFixed(1)} ${pts[k].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    scribPath.setAttribute("d", s);
  }

  /* ================= Focus (after clicking the centre disc) ================= */
  function openRelease(i) {
    const r = RELEASES[i];
    window.open((r.link || r.spotify), "_blank", "noopener");
    focus = true;
    body.classList.add("is-focus");
    $("#focusTitle").textContent = r.title;
    $("#focusLink").href = (r.link || r.spotify);
    const platform = r.platform || "Spotify";
    $("#focusLink").textContent = `Abrir en ${platform} ↗`;
    scribbleOut();
  }
  function exitFocus() { focus = false; body.classList.remove("is-focus"); }
  $("#focusBack").addEventListener("click", exitFocus);

  /* ================= Input ================= */
  addEventListener("wheel", (e) => {
    if (about.classList.contains("is-open")) return; // deja hacer scroll en el panel
    e.preventDefault();
    if (!ready) return;
    if (focus) { exitFocus(); return; }
    // one scroll gesture = one disc (trackpad inertia is swallowed until the gesture ends)
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    lastInput = performance.now();
    clearTimeout(wheelIdle);
    wheelIdle = setTimeout(() => { wheelLock = false; wheelAcc = 0; }, 180);
    if (wheelLock) return;
    wheelAcc += delta * (e.deltaMode === 1 ? 30 : 1);
    if (Math.abs(wheelAcc) > 25) {
      target = Math.round(target) + Math.sign(wheelAcc);
      wheelLock = true; wheelAcc = 0;
      setTimeout(() => { wheelLock = false; }, 900);
    }
  }, { passive: false });
  let wheelLock = false, wheelAcc = 0, wheelIdle;

  addEventListener("keydown", (e) => {
    if (about.classList.contains("is-open")) { if (e.key === "Escape") setAbout(false); return; }
    if (!ready) return;
    if (["ArrowDown", "ArrowRight", "PageDown"].includes(e.key)) { e.preventDefault(); target = Math.round(target) + 1; lastInput = performance.now(); }
    if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); target = Math.round(target) - 1; lastInput = performance.now(); }
    if (e.key === "Enter" && !focus && document.activeElement === body) openRelease(active);
    if (e.key === "Escape") { exitFocus(); setIndex(false); }
  });

  // drag (mouse + touch)
  let drag = null, dragMoved = false;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, t: target, lastX: e.clientX, lastT: performance.now(), v: 0 };
    dragMoved = false;
  });
  addEventListener("pointermove", (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.has = true; pointer.moved = true;
    pointer.nx = e.clientX / innerWidth * 2 - 1; pointer.ny = -(e.clientY / innerHeight) * 2 + 1;
    if (drag && ready && !focus && isPhone()) {
      if (!dragMoved && Math.hypot(drag.x - e.clientX, drag.y - e.clientY) < 5) return;
      if (!dragMoved) { dragMoved = true; glide = null; drag.lastX = e.clientX; drag.lastT = performance.now(); }
      const t = performance.now();
      const step = -(e.clientX - drag.lastX) / innerWidth * 2;
      const inst = clamp(16.667 / Math.max(8, t - drag.lastT) * step, -.5, .5);
      drag.v += (inst - drag.v) * .32;
      drag.lastX = e.clientX; drag.lastT = t;
      target += step;
      lastInput = t;
      return;
    }
    if (drag && ready && !focus) {
      const dx = drag.x - e.clientX, dy = drag.y - e.clientY;
      const dist = dx + dy * .7;
      if (Math.abs(dx) + Math.abs(dy) > 8) dragMoved = true;
      if (dragMoved) { target = drag.t + dist / (innerWidth * .45); lastInput = performance.now(); }
    }
  });
  addEventListener("pointerup", () => {
    if (drag && dragMoved) {
      if (isPhone()) {
        const dir = Math.abs(drag.v) >= .035 ? Math.sign(drag.v) : 0;
        const next = dir > 0 ? Math.floor(target) + 1 : dir < 0 ? Math.ceil(target) - 1 : Math.round(target);
        glideOpts = { dur: .56, kick: 0 };
        target = next;
      } else target = Math.round(target);
    }
    drag = null;
  });
  addEventListener("pointercancel", () => { drag = null; target = Math.round(target); });

  canvas.addEventListener("click", (e) => {
    if (!ready || dragMoved) return;
    if (focus) { exitFocus(); return; }
    const slot = pick(e.clientX, e.clientY);
    if (slot < 0) return;
    if (slot !== activeSlot || Math.abs(target - pos) > .05) { goToSlot(slot); return; }
    openRelease(active);
  });

  // index + progress
  const indexBtn = $("#indexBtn"), indexMenu = $("#indexMenu");
  function setIndex(open) { indexMenu.classList.toggle("is-open", open); indexBtn.setAttribute("aria-expanded", open); }
  indexBtn.addEventListener("click", (e) => { e.stopPropagation(); setIndex(!indexMenu.classList.contains("is-open")); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("#indexMenu button, #progress button");
    if (b) { goToRelease(+b.dataset.i); setIndex(false); return; }
    if (!e.target.closest(".nav__index")) setIndex(false);
  });
  $("#logo").addEventListener("click", (e) => { e.preventDefault(); goToRelease(0); });

  /* ================= Cursor label ================= */
  function updateCursor() {
    if (!isTouch) canvas.classList.toggle("is-pointer", hovered >= 0);
  }

  /* ================= Loop ================= */
  let last = performance.now();
  /* Phone layout: camera 40deg at 4.4, gallery turned -30/-30, active disc 1.5x, neighbours .6x centred on the
     screen edges. Every disc eases to its target, the further from the centre the lazier. */
  const PHONE_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 6, -Math.PI / 6, 0, "XYZ"));
  const PHONE_FOCUS_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.5, 0, .15, "ZXY"));
  const phoneEuler = new THREE.Euler(0, 0, 0, "XYZ"), phoneTurn = new THREE.Quaternion();
  const TAN20 = Math.tan(Math.PI / 9);
  function phoneScale() {
    const t = TAN20 * camera.aspect;
    const fit = clamp(4.4 * t / (2.2 - .5 * t), 1.08 * .3, 1.08 * 3); // neighbour centres land on the screen edges
    return Math.min(fit, .6 * 4.4 * TAN20 / 1.5);                      // active disc never taller than 60% of the screen
  }
  function phoneDisc(d, dd, isA, fz, e, dt, lean, dip) {
    const r = phoneScale(), h = Math.abs(dd);
    const sd = dd * (1 + (isA ? 0 : fz * 1.2)), n = Math.min(Math.abs(sd), 2.5);
    tmpV.set(0, ((isA ? .06 : 0) - dip * (isA ? .7 : 1)) * r, 0).applyQuaternion(PHONE_Q);
    const tx = sd * 2.2 * r + tmpV.x, ty = -n * r + tmpV.y, tz = -n * .5 * r + tmpV.z;
    const yaw = clamp(-dd, 0, 1) * Math.PI / 3 + lean * (isA ? 1 : 1.12);
    const bank = -lean * .32 * (isA ? .7 : 1);
    const ts = (isA ? 1.5 : Math.max(.6, 1 - h * .4)) * r * (1 - fz * .3);
    const wrapped = d.lastDd !== undefined && Math.abs(dd - d.lastDd) > M / 2;
    d.lastDd = dd;
    if (d.px === undefined || wrapped) { d.px = tx; d.py = ty; d.pz = tz; d.ry = yaw; d.rb = bank; d.sc = ts; }
    else {
      const a = Math.min(1, dt * clamp((drag && dragMoved ? 15 : 11) - h * 1.15, 6.5, 15));
      d.px += (tx - d.px) * a; d.py += (ty - d.py) * a; d.pz += (tz - d.pz) * a;
      d.ry += (yaw - d.ry) * a; d.rb += (bank - d.rb) * a; d.sc += (ts - d.sc) * a;
    }
    d.root.position.set(d.px, d.py, d.pz);
    d.root.scale.setScalar(Math.max(d.sc * e, 1e-4));
    d.root.visible = e > 0 && h < 2.6;
    phoneEuler.set(0, d.ry, d.rb);
    d.tilt.quaternion.copy(PHONE_Q).multiply(phoneTurn.setFromEuler(phoneEuler));
    if (fz > 0) d.tilt.quaternion.slerp(PHONE_FOCUS_Q, fz);
  }

  resize();
  let lastMoving = 0, skipRender = false;
  function frame(now) {
    const rawDt = (now - last) / 1000;
    const dt = Math.min(rawDt, 1 / 20); last = now;
    if (resizeDue) { resizeDue = false; resize(); }
    if (rawDt < .25) perf.ema += (rawDt - perf.ema) * .1;
    const k = 1 - Math.pow(.9, dt * 60);       // main easing
    const kSoft = 1 - Math.pow(.94, dt * 60);  // softer easing

    const phone = isPhone();
    if (phone) {
      if (drag && dragMoved) { pos = target; glide = null; }
      else {
        if (!glide || glide.to !== target) {
          if (target !== pos) {
            const o = glideOpts || { dur: .51, kick: 2.5 }; // wheel / keys
            glide = { from: pos, to: target, t0: now, dur: o.dur };
            flow = clamp(flow + Math.sign(target - pos) * o.kick, -12, 12);
          }
          glideOpts = null;
        }
        if (glide) {
          const t = clamp((now - glide.t0) / (glide.dur * 1000), 0, 1);
          pos = glide.from + (glide.to - glide.from) * glideEase(t);
          if (t >= 1) { pos = glide.to; glide = null; }
        }
      }
      const instV = clamp((pos - prevPos) / Math.max(dt, .001), -40, 40);
      flow += (instV - flow) * Math.min(1, dt * (Math.abs(instV) > Math.abs(flow) ? 14 : 6));
      if (Math.abs(flow) < .01) flow = 0;
      pv = instV;
    } else {
    // critically-damped spring: eases in AND out, never snaps
    const W = 6.2, steps = 3, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      pv += (W * W * (target - pos) - 2 * W * pv) * h;
      pos += pv * h;
    }
    if (Math.abs(target - pos) < 1e-4 && Math.abs(pv) < 1e-3) { pos = target; pv = 0; }
    }
    prevPos = pos;
    vel = pv;

    const moving = !ready || Math.abs(target - pos) > .015 || now - lastInput < 90;
    if (moving) lastMoving = now;
    const settling = now - lastMoving < 500;
    if (ready && moving) watchFrames(rawDt);
    if (ready && Math.abs(pos) > .3) body.classList.add("has-scrolled");
    body.classList.toggle("is-moving", moving);
    focusAmt += ((focus ? 1 : 0) - focusAmt) * kSoft;

    activeSlot = wrap(Math.round(pos));
    const now_i = activeSlot % N;
    if (now_i !== active) { active = now_i; renderInfo(active); }

    // hover
    if (isTouch || !pointer.has || !ready) hovered = -1;
    else if (pointer.moved || settling) { hovered = pick(pointer.x, pointer.y); pointer.moved = false; }
    // touch screens have no hover: the loop is drawn on the centre disc each time it settles
    const hoverActive = (isTouch ? ready && !phone : hovered === activeSlot) && !moving && !focus;
    if (hoverActive && !scrib.on) scribbleIn(activeSlot);
    if ((!hoverActive || scrib.disc !== activeSlot) && scrib.on) scribbleOut();
    updateCursor(moving);

    // fixed camera
    const L = params();
    const wantFov = L.mobile ? 40 : 35;
    if (camera.fov !== wantFov) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
    // the camera is much closer on phones: keep the hub from blowing out to plain white
    hubMat.envMapIntensity = stackMat.envMapIntensity = lipMat.envMapIntensity = L.mobile ? .25 : 1;
    camera.position.set(0, 0, L.mobile ? 4.4 : 14);
    camera.lookAt(0, 0, 0);

    const idleSpin = IDLE_SPIN;
    const lean = L.mobile ? clamp(Math.sign(flow) * Math.sqrt(Math.abs(flow)) * .055, -.3, .3) : 0;
    const dip = L.mobile ? Math.min(.09, Math.abs(flow) * .014) : 0;
    discs.forEach((d) => {
      const dd = offsetOf(d.i, pos), isA = d.i === activeSlot;
      const fz = isA ? focusAmt : 0;
      const e = introEase(d, now, dd);
      d.shadow.visible = !L.mobile;
      if (L.mobile) phoneDisc(d, dd, isA, fz, e, dt, lean, dip);
      else {
      d.px = undefined;
      const spread = 1 + (isA ? 0 : focusAmt * 1.2);

      // screen-space path → world (perspective does the sizing)
      const p = pathAt(dd * spread, L);
      const hAt = (CAM_Z - p.z) * TANF;
      const bx = p.x * L.f * hAt, by = (p.y + L.oy * (1 - fz)) * hAt;
      const hov = hovered === d.i && !moving && !focus;

      // magnetic pull: the hovered disc drifts a touch toward the cursor
      let tmx = 0, tmy = 0;
      if (hov) {
        const c = toScreen(tmpV.set(bx, by, p.z));
        const wpp = hAt / innerHeight;
        tmx = (pointer.x - c.x) * .035 * wpp;
        tmy = -(pointer.y - c.y) * .035 * wpp;
      }
      d.mx += (tmx - d.mx) * kSoft; d.my += (tmy - d.my) * kSoft;

      d.root.position.set(bx + d.mx, by + d.my, p.z + (hov && !isA ? .25 : 0)); // grows in place
      d.root.visible = e > 0 && dd > -3.6 && dd < 2.2;
      d.rz = p.rz;

      const ts = L.R * (1 - fz * .3) * (hov && isA ? 1.015 : 1);
      d.sc = d.sc ? d.sc + (ts - d.sc) * k : ts;
      d.root.scale.setScalar(Math.max(d.sc * e, 1e-4)); // intro: 0% → 100%

      // gentle tilt toward the cursor
      let thx = 0, thy = 0;
      if (hov) {
        const c = toScreen(tmpV.copy(d.root.position));
        const rpx = innerHeight * .33;
        thx = clamp((pointer.y - c.y) / rpx, -1, 1) * .12;
        thy = clamp((pointer.x - c.x) / rpx, -1, 1) * .12;
      }
      d.hx += (thx - d.hx) * kSoft; d.hy += (thy - d.hy) * kSoft;

      d.tilt.rotation.x = lerp(BASE_X, -.5, fz) + d.hx;
      d.tilt.rotation.y = d.hy;
      d.tilt.rotation.z = lerp(BASE_Z + d.rz, .15, fz);
      }

      // spin: the loading disc whirls; on landing a spring brakes it onto its resting angle;
      // otherwise discs stay still and only the "playing" disc turns
      if (d.settle !== null) {
        // the landing target itself keeps turning at the idle speed, so the brake
        // blends straight into the slow idle spin instead of coming to a dead stop
        d.settle -= idleSpin * dt;
        const Ws = 2.6;
        for (let s = 0; s < 3; s++) {
          const hh = dt / 3;
          d.spinV += (Ws * Ws * (d.settle - d.spinBase) - 2 * Ws * (d.spinV + idleSpin)) * hh;
          d.spinBase += d.spinV * hh;
        }
        // hand over to the idle spin once it has (almost) caught up
        if (Math.abs(d.settle - d.spinBase) < .01 && Math.abs(d.spinV + idleSpin) < .02) { d.spinV = -idleSpin; d.settle = null; }
      } else {
        const want = (loading && d.i === 0) ? -9 : -(idleSpin + fz * 1.4); // slow constant turn, faster when "playing"
        d.spinV += (want - d.spinV) * kSoft * .6;
        d.spinBase += d.spinV * dt;
      }
      d.spin.rotation.z = d.spinBase + (d.i === 0 ? 0 : (1 - e) * 3.2);
    });

    if (scrib.disc >= 0) buildScribble();

    // Nothing to see behind the text panel. When only the slow spin is left, every other frame is
    // enough at 60 Hz or more: that keeps phones from heating up and throttling.
    const quiet = ready && !settling && !drag && hovered < 0 && !focus && focusAmt < .001 && discs[0].settle === null && perf.ema < .02;
    skipRender = quiet && !skipRender;
    if (!skipRender && !about.classList.contains("is-open")) renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* ================= Load fonts + covers, then intro ================= */
  (async function boot() {
    const years = RELEASES.map((r) => +r.year);
    $("#loaderYear").textContent = Math.max(...years);
    const count = $("#loaderCount");
    count.replaceChildren();
    const countTracks = [];
    const counterMilestones = [
      { value: 0, digits: ["", "", "0"] },
      { value: 25, digits: ["", "2", "5"] },
      { value: 50, digits: ["", "5", "0"] },
      { value: 75, digits: ["", "7", "5"] },
      { value: 100, digits: ["1", "0", "0"] },
    ];
    for (let i = 0; i < 3; i++) {
      const digit = document.createElement("span");
      const track = document.createElement("span");
      digit.className = "loader__digit";
      digit.setAttribute("aria-hidden", "true");
      track.className = "loader__track";
      track.style.setProperty("--counter-offset", "0em");
      track.style.setProperty("--counter-delay", `${i * 90}ms`);
      [...counterMilestones.map((milestone) => milestone.digits[i]), ""].forEach((value) => {
        const row = document.createElement("span");
        row.textContent = value;
        track.append(row);
      });
      digit.append(track);
      count.append(digit);
      countTracks.push(track);
    }
    count.setAttribute("aria-label", "0%");
    requestAnimationFrame(() => count.classList.add("is-ready"));
    const fontsReady = Promise.all([
      document.fonts.load(`400 40px "Dirtyline36Daysoftype2022"`),
      document.fonts.load(`400 20px "Dirtyline36Daysoftype2022"`),
    ]).catch((error) => { console.warn("Could not load the Dirtyline font:", error); });
    // decoded off the main thread, so drawing the cover doesn't stall the spinning disc
    const loadCover = (src) => new Promise((res) => {
      const im = new Image();
      im.decoding = "async";
      im.src = src;
      im.decode().then(() => res(im), () => res(null));
    });
    const nextFrame = () => new Promise((res) => requestAnimationFrame(res));
    // covers go to the GPU one per frame, as they arrive, instead of all at once on first sight
    let paintQueue = fontsReady;
    const labelJobs = labels.map(async (d) => {
      if (d.r.cover && location.protocol === "file:") console.warn("Covers need a local server (Live Server / npx serve) to show in 3D. Using placeholders.");
      else if (d.r.cover) {
        d.img = await loadCover(coverSrc(d.r.cover)) || await loadCover(d.r.cover); // a new cover may not have a web version yet
        if (!d.img) console.warn("Cover not found:", d.r.cover);
      }
      d.pending = false;
      paintQueue = paintQueue.then(nextFrame).then(() => { drawFace(d); renderer.initTexture(d.tex); });
      return paintQueue;
    });

    labels.forEach((d) => { d.pending = !!d.r.cover; drawFace(d); });
    renderInfo(0);
    requestAnimationFrame(frame);

    const t0 = performance.now();
    const counterInterval = 900;
    const counterInitialDelay = 500;
    const counterDuration = counterInitialDelay + counterInterval * (counterMilestones.length - 1);
    let lastMilestone = -1;
    (function step() {
      const elapsed = performance.now() - t0;
      const milestone = elapsed < counterInitialDelay
        ? 0
        : Math.min(
          counterMilestones.length - 1,
          1 + Math.floor((elapsed - counterInitialDelay) / counterInterval),
        );
      if (milestone !== lastMilestone) {
        lastMilestone = milestone;
        if (milestone > 0) {
          countTracks.forEach((track) => track.style.setProperty("--counter-offset", `-${milestone}em`));
        }
        count.setAttribute("aria-label", `${counterMilestones[milestone].value}%`);
      }
      if (elapsed < counterDuration) return requestAnimationFrame(step);
    })();
    // only the disc on show holds up the intro; a slow network can't keep the site behind the loader
    await Promise.race([labelJobs[0], new Promise((r) => setTimeout(r, 8000))]);
    await new Promise((r) => setTimeout(r, Math.max(0, counterDuration - (performance.now() - t0))));
    // brake the spinning disc onto its resting angle, then bring everything else in
    loading = false;
    settleSpin(discs[0]);
    countTracks.forEach((track, i) => {
      track.style.setProperty("--counter-offset", "-5em");
      track.style.setProperty("--counter-delay", `${i * 90}ms`);
    });
    $("#loader").classList.add("is-done");
    body.classList.remove("is-loading");
    introStart = performance.now();
    setTimeout(() => { ready = true; $("#loader").remove(); }, 1800);
  })();
})();
