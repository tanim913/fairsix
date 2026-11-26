// Fireworks behind the result sheet when you win. The canvas is a fixed layer
// under the modal sheet: while it runs, the sheet's own backdrop is cleared and
// the canvas carries the same dim, so the bursts show around the sheet without
// covering its text. It never takes a tap. Sounds come from onLaunch and onBurst.

const COLORS = ["#ff4d66", "#2fc27d", "#ffb526", "#5a7dff", "#ffe08a", "#b484ff"];
const G = 900;        // rocket gravity, px/s²
const SPARK_G = 160;  // spark gravity, px/s²

let stopCurrent = null;

export function stopFireworks() {
  if (stopCurrent) stopCurrent();
}

export function fireworks({ sheet, color, seconds = 5, onLaunch, onBurst } = {}) {
  stopFireworks();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const cv = document.createElement("canvas");
  cv.className = "fireworks";
  cv.setAttribute("aria-hidden", "true");
  document.body.append(cv);
  sheet?.classList.add("celebrate");

  const ctx = cv.getContext("2d");
  let W = 0, H = 0;
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener("resize", size);

  const palette = color ? [color, color, color, ...COLORS] : COLORS;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const pan = (x) => Math.max(-0.8, Math.min(0.8, (x / W) * 2 - 1));
  const rockets = [];
  const sparks = [];

  const scale = () => Math.min(1, W / 520);
  const launch = (big = false) => {
    const x = W * (0.12 + Math.random() * 0.76);
    const top = H * (0.08 + Math.random() * 0.27);
    const vy = -Math.sqrt(2 * G * (H + 10 - top));
    rockets.push({ x, y: H + 10, vx: (Math.random() - 0.5) * 70, vy, c: pick(palette), big });
    onLaunch?.(pan(x));
  };

  const burst = (r) => {
    const n = r.big ? 110 : 60 + Math.floor(Math.random() * 30);
    const speed = ((r.big ? 330 : 220) + Math.random() * 80) * (0.6 + 0.4 * scale());
    const ring = Math.random() < 0.45;
    const second = Math.random() < 0.35 ? pick(COLORS) : r.c;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const v = speed * (ring ? 0.85 + Math.random() * 0.15 : Math.sqrt(Math.random()));
      const life = 1.1 + Math.random() * 0.7;
      sparks.push({ x: r.x, y: r.y, px: r.x, py: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, c: i % 3 ? r.c : second, tw: Math.random() < 0.3 });
    }
    onBurst?.(pan(r.x), r.big);
  };

  // Two rockets right away, then a steady show, then one big finale.
  const plan = [0.05, 0.3];
  for (let t = 0.85; t < seconds - 1.2; t += 0.35 + Math.random() * 0.4) plan.push(t);
  const finale = seconds - 1;
  let planned = 0;
  let finaleDone = false;

  const t0 = performance.now();
  let last = t0;
  let raf = 0;
  let done = false;

  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    while (planned < plan.length && plan[planned] <= t) { launch(); planned++; }
    if (!finaleDone && t >= finale) { finaleDone = true; launch(true); launch(); launch(); }

    // Fade what is already drawn, which leaves short trails.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      const px = r.x, py = r.y;
      r.vy += G * dt; r.x += r.vx * dt; r.y += r.vy * dt;
      ctx.strokeStyle = r.c; ctx.globalAlpha = 0.9; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(r.x, r.y); ctx.stroke();
      if (r.vy >= -40) { rockets.splice(i, 1); burst(r); }
    }

    const drag = Math.pow(0.32, dt);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.px = s.x; s.py = s.y;
      s.vx *= drag; s.vy = s.vy * drag + SPARK_G * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const k = s.life / s.max;
      if (s.tw && k < 0.5 && Math.random() < 0.5) continue;
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.strokeStyle = s.c; ctx.lineWidth = 1 + 1.8 * k;
      ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(s.x, s.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (finaleDone && !rockets.length && !sparks.length) { stop(); return; }
    raf = requestAnimationFrame(frame);
  };

  function stop() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", size);
    cv.remove();
    sheet?.classList.remove("celebrate");
    if (stopCurrent === stop) stopCurrent = null;
  }
  stopCurrent = stop;
  raf = requestAnimationFrame(frame);
}
