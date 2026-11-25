// Board drawing (SVG) and guti (HTML marbles over the board). Guti only ever
// animate `transform`, so movement stays on the compositor and does not lag.
import {
  TRACK, LANES, START, STARS, ARROWS, BASE, HOME, LANE0, LAST_MAIN, PRE_START,
  cellOf, globalIndex,
} from "./board.js";

const r2 = (n) => Math.round(n * 1000) / 1000;

function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.48 : r;
    pts.push(`${r2(cx + rr * Math.cos(a))},${r2(cy + rr * Math.sin(a))}`);
  }
  return `<polygon class="star" points="${pts.join(" ")}"/>`;
}

const BASE_ORIGIN = [[0, 0], [9, 0], [9, 9], [0, 9]];

export function drawBoard(svg, mode, usedCorners) {
  const used = new Set(usedCorners);
  let s = "";
  for (let c = 0; c < 4; c++) {
    const [ox, oy] = BASE_ORIGIN[c];
    const dim = used.has(c) ? "" : " unused";
    s += `<g class="${dim}"><rect class="base${c}" x="${ox + 0.14}" y="${oy + 0.14}" width="5.72" height="5.72" rx="1"/>`;
    s += `<rect class="well" x="${ox + 0.85}" y="${oy + 0.85}" width="4.3" height="4.3" rx="1.1"/>`;
    for (const [sx, sy] of [[2, 2], [4, 2], [2, 4], [4, 4]]) s += `<circle class="slot" cx="${ox + sx}" cy="${oy + sy}" r="0.5"/>`;
    s += "</g>";
  }
  TRACK.forEach(([x, y], i) => {
    const c = START.indexOf(i);
    const cls = c >= 0 ? `start${c}${used.has(c) ? "" : " unused"}` : "tile";
    s += `<rect class="${cls}" x="${x + 0.07}" y="${y + 0.07}" width="0.86" height="0.86" rx="0.26"/>`;
    if (c >= 0) s += `<circle class="start-mark" cx="${x + 0.5}" cy="${y + 0.5}" r="0.2"/>`;
    if (STARS.includes(i)) s += star(x + 0.5, y + 0.52, 0.3);
  });
  LANES.forEach((lane, c) => {
    for (const [x, y] of lane) s += `<rect class="lane${c}${used.has(c) ? "" : " unused"}" x="${x + 0.07}" y="${y + 0.07}" width="0.86" height="0.86" rx="0.26"/>`;
  });
  // Home: four petals with rounded corners (a same-colour stroke rounds the joins).
  s += `<rect class="tile" x="6.07" y="6.07" width="2.86" height="2.86" rx="0.5"/>`;
  s += `<path class="petal petal0" d="M6.32 6.42 L7.32 7.5 L6.32 8.58Z"/>`;
  s += `<path class="petal petal1" d="M6.42 6.32 L8.58 6.32 L7.5 7.32Z"/>`;
  s += `<path class="petal petal2" d="M8.68 6.42 L8.68 8.58 L7.68 7.5Z"/>`;
  s += `<path class="petal petal3" d="M6.42 8.68 L8.58 8.68 L7.5 7.68Z"/>`;
  if (mode === "arrow") {
    for (const a of ARROWS) {
      const [tx, ty] = TRACK[a.tail];
      const [hx, hy] = TRACK[a.head];
      const x1 = tx + 0.5, y1 = ty + 0.5, x2 = hx + 0.5, y2 = hy + 0.5;
      const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
      const ex = x2 - dx * 0.18, ey = y2 - dy * 0.18;
      const px = -dy * 0.28, py = dx * 0.28;
      s += `<circle class="arrow-tail" cx="${x1}" cy="${y1}" r="0.3"/>`;
      s += `<path class="arrow" d="M${x1 + dx * 0.3} ${y1 + dy * 0.3} L${ex} ${ey} M${ex - dx * 0.3 + px} ${ey - dy * 0.3 + py} L${ex} ${ey} L${ex - dx * 0.3 - px} ${ey - dy * 0.3 - py}"/>`;
    }
  }
  s += `<g id="live-layer"></g>`;
  svg.innerHTML = s;
}

export function showLive(svg, cells) {
  const g = svg.querySelector("#live-layer");
  if (!g) return;
  g.innerHTML = cells.map(([x, y]) => `<rect class="live" x="${r2(x - 0.43)}" y="${r2(y - 0.43)}" width="0.86" height="0.86" rx="0.26"/>`).join("");
}

// Cell centre of a token position (base tokens use their own slot).
export function tokenCell(corner, pos, t) {
  return cellOf(corner, pos, t);
}

// Path of cell centres a move passes through, for the hop animation.
export function movePath(corner, from, to, die, via, arrow) {
  if (from === BASE) return [cellOf(corner, 0)];
  const open = to >= LANE0 || (via !== undefined && via >= LANE0);
  const cells = [];
  let cur = from;
  const end = arrow ? via : to;
  for (let i = 0; i < die && cur !== end; i++) {
    if (cur >= 0 && cur < LAST_MAIN) cur += 1;
    else if (cur === LAST_MAIN) cur = open ? LANE0 : PRE_START;
    else if (cur === PRE_START) cur = 0;
    else if (cur >= LANE0 && cur < HOME) cur += 1;
    cells.push(cellOf(corner, cur));
  }
  if (arrow) cells.push(cellOf(corner, to));
  return cells;
}

const STEP_MS = 150;
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Tokens {
  constructor(layer, wrap, onPick) {
    this.layer = layer;
    this.wrap = wrap;
    this.onPick = onPick;
    this.els = new Map();     // "seat:t" -> element
    this.busy = new Set();    // keys being animated
    this.lastSeq = -1;
    this.state = null;
    new ResizeObserver(() => this.layout(false)).observe(wrap);
  }

  unit() { return this.wrap.clientWidth / 15; }

  ensure(state) {
    const want = new Set();
    for (const p of state.players) {
      for (let t = 0; t < 4; t++) {
        const key = `${p.seat}:${t}`;
        want.add(key);
        if (this.els.has(key)) continue;
        const el = document.createElement("button");
        el.type = "button";
        el.className = `guti c${p.corner}`;
        el.innerHTML = `<span class="eyes"><i></i><i></i></span>`;
        el.style.setProperty("--blink", `${((p.seat * 4 + t) * 1.37) % 5}s`);
        el.addEventListener("click", () => this.onPick?.(p.seat, t));
        this.layer.appendChild(el);
        this.els.set(key, el);
      }
    }
    for (const [key, el] of this.els) if (!want.has(key)) { el.remove(); this.els.delete(key); }
  }

  // Where every token should sit, with stacks spread out and scaled down.
  targets(state) {
    const groups = new Map();
    const out = new Map();
    for (const p of state.players) {
      if (p.out || p.left) {
        if (!p.place) continue;
      }
      p.tokens.forEach((pos, t) => {
        const [x, y] = tokenCell(p.corner, pos, t);
        const key = pos === BASE ? `b${p.seat}:${t}` : `${x.toFixed(2)},${y.toFixed(2)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ id: `${p.seat}:${t}`, x, y, home: pos === HOME });
      });
    }
    for (const list of groups.values()) {
      const n = list.length;
      list.forEach((it, i) => {
        let dx = 0, dy = 0, s = 1;
        if (it.home) { s = 0.6; dx = (i % 2 ? 0.2 : -0.2) * (n > 1 ? 1 : 0); dy = (i > 1 ? 0.2 : -0.2) * (n > 2 ? 1 : 0); }
        else if (n === 2) { s = 0.74; dx = i ? 0.18 : -0.18; dy = i ? 0.1 : -0.1; }
        else if (n >= 3) { s = 0.6; dx = (i % 2 ? 0.22 : -0.22); dy = (i > 1 ? 0.22 : -0.22); }
        out.set(it.id, { x: it.x + dx, y: it.y + dy, s });
      });
    }
    return out;
  }

  transformFor({ x, y, s }) {
    const u = this.unit();
    return `translate3d(${(x * u).toFixed(1)}px, ${(y * u).toFixed(1)}px, 0) scale(${s})`;
  }

  layout(animate) {
    if (!this.state) return;
    const targets = this.targets(this.state);
    for (const [key, el] of this.els) {
      const t = targets.get(key);
      el.hidden = !t;
      if (!t || this.busy.has(key)) continue;
      const next = this.transformFor(t);
      if (animate && el.style.transform && el.style.transform !== next && !reduce()) {
        el.animate([{ transform: el.style.transform }, { transform: next }], { duration: 220, easing: "cubic-bezier(.22,1,.36,1)" });
      }
      el.style.transform = next;
    }
  }

  render(state, movable, mySeatCanMove) {
    this.ensure(state);
    const fresh = this.state === null;
    const ev = state.event;
    const animateMove = !fresh && ev && ev.type === "move" && state.seq === this.lastSeq + 1 && !reduce();
    this.state = state;
    this.lastSeq = state.seq;

    for (const [key, el] of this.els) {
      const [seat, t] = key.split(":").map(Number);
      const can = movable.has(key);
      el.classList.toggle("can", can && mySeatCanMove);
      el.disabled = !(can && mySeatCanMove);
      const p = state.players.find((q) => q.seat === seat);
      el.setAttribute("aria-label", `${p?.label || "Guti"} ${t + 1}${can && mySeatCanMove ? ", tap to move" : ""}`);
    }

    if (animateMove) this.playMove(state, ev);
    this.layout(!fresh);
  }

  playMove(state, ev) {
    const p = state.players.find((q) => q.seat === ev.seat);
    if (!p) return;
    const key = `${ev.seat}:${ev.t}`;
    const el = this.els.get(key);
    if (!el) return;
    const u = this.unit();
    const start = tokenCell(p.corner, ev.from, ev.t);
    const cells = movePath(p.corner, ev.from, ev.to, ev.die, ev.via, ev.arrow);
    const frames = [{ transform: this.transformFor({ x: start[0], y: start[1], s: 1 }), offset: 0 }];
    const n = cells.length;
    let prev = start;
    cells.forEach(([x, y], i) => {
      const isFly = ev.arrow && i === n - 1;
      const mx = (prev[0] + x) / 2, my = (prev[1] + y) / 2 - (isFly ? 0.9 : 0.34);
      frames.push({ transform: `translate3d(${(mx * u).toFixed(1)}px, ${(my * u).toFixed(1)}px, 0) scale(${isFly ? 1.25 : 1.1}, ${isFly ? 1.25 : 0.94})`, offset: (i + 0.5) / n });
      frames.push({ transform: `translate3d(${(x * u).toFixed(1)}px, ${(y * u).toFixed(1)}px, 0) scale(1.06, 0.92)`, offset: (i + 1) / n });
      prev = [x, y];
    });
    this.busy.add(key);
    el.classList.add("moving");
    const final = this.targets(state).get(key);
    if (final) el.style.transform = this.transformFor(final);
    const total = STEP_MS * n + (ev.arrow ? 260 : 0);
    const anim = el.animate(frames, { duration: total, easing: "linear" });
    if (this.onStep) for (let i = 0; i < n; i++) setTimeout(() => this.onStep(i, n, ev.arrow && i === n - 1), (total * (i + 1)) / n - 20);
    const done = () => {
      this.busy.delete(key);
      el.classList.remove("moving");
      this.layout(false);
      for (const c of ev.caps || []) this.playCapture(c, ev);
    };
    anim.onfinish = done;
    anim.oncancel = done;
    // Captured tokens stay put until the mover lands on them.
    for (const c of ev.caps || []) {
      const ckey = `${c.seat}:${c.t}`;
      const q = state.players.find((x) => x.seat === c.seat);
      const cel = this.els.get(ckey);
      if (!q || !cel) continue;
      this.busy.add(ckey);
      const g = globalIndex(p.corner, ev.to);
      const [cx, cy] = TRACK[g];
      cel.style.transform = this.transformFor({ x: cx + 0.5, y: cy + 0.5, s: 1 });
    }
  }

  playCapture(c) {
    const key = `${c.seat}:${c.t}`;
    const el = this.els.get(key);
    if (!el) return;
    const from = el.style.transform;
    this.busy.delete(key);
    const targets = this.targets(this.state);
    const to = this.transformFor(targets.get(key));
    el.classList.add("dead", "moving");
    // Big enough mid-flight that the x_x face reads at board scale.
    const a = el.animate(
      [
        { transform: from },
        { transform: `${from} scale(1.9) rotate(-18deg)`, offset: 0.18 },
        { transform: `${from} scale(1.8) rotate(12deg)`, offset: 0.45 },
        { transform: `${to} scale(1.25)`, offset: 0.85 },
        { transform: to },
      ],
      { duration: 1100, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    el.style.transform = to;
    a.onfinish = () => { el.classList.remove("moving"); setTimeout(() => el.classList.remove("dead"), 1600); };
  }
}
