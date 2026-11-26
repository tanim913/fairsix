// Sound and vibration, synthesised with the Web Audio API (no audio files).
// Everything is short and quiet; one master gain keeps it subtle.

let ctx = null;
let master = null;
let muted = false;
try { muted = localStorage.getItem("fairsix:mute") === "1"; } catch { /* default on */ }

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem("fairsix:mute", m ? "1" : "0"); } catch { /* not saved */ }
}

// Browsers only start audio after a user gesture; call this from any tap.
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

function ready() {
  return !muted && ctx && ctx.state === "running";
}

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

// A plucked tone: quick attack, exponential decay.
function tone(freq, { at = 0, dur = 0.12, type = "sine", vol = 0.5, glide = 0, overtone = 0, out = master } = {}) {
  const t = ctx.currentTime + at;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * glide), t + dur);
  o.connect(g);
  o.start(t);
  o.stop(t + dur + 0.02);
  if (overtone) {
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    g2.gain.value = overtone;
    o2.type = "sine";
    o2.frequency.setValueAtTime(freq * 2.76, t); // marimba-like partial
    o2.connect(g2).connect(g);
    o2.start(t);
    o2.stop(t + dur * 0.5);
  }
}

// A filtered noise burst: clicks, rattles, whooshes.
function hiss({ at = 0, dur = 0.05, freq = 2500, q = 1.2, vol = 0.4, sweep = 0, type = "bandpass", out = master } = {}) {
  const t = ctx.currentTime + at;
  const src = noise();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.02);
}

// Sends a sound left or right (-1 to 1), where the browser can.
function panTo(pan) {
  if (!ctx.createStereoPanner) return master;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(master);
  return p;
}

function buzz(pattern) {
  if (muted) return;
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

export const sfx = {
  tap() { if (ready()) tone(1400, { dur: 0.035, vol: 0.12, type: "triangle" }); },

  // Dice shaken in a glass: a handful of small clicks.
  rattle() {
    buzz(12);
    if (!ready()) return;
    for (let i = 0; i < 7; i++) hiss({ at: i * 0.055 + Math.random() * 0.02, dur: 0.03, freq: 2600 + Math.random() * 1800, q: 4, vol: 0.28 });
  },

  // Die settles: a soft wooden knock, brighter for a six.
  land(face) {
    buzz(face === 6 ? [18, 40, 18] : 16);
    if (!ready()) return;
    tone(320, { dur: 0.09, vol: 0.5, type: "sine", glide: 0.7 });
    hiss({ dur: 0.025, freq: 1800, q: 2, vol: 0.25 });
    if (face === 6) [1319, 1568, 2093].forEach((f, i) => tone(f, { at: 0.08 + i * 0.07, dur: 0.18, vol: 0.16, type: "triangle" }));
  },

  // One hop of a guti: a tiny marble tick, rising through the move.
  hop(i) {
    if (!ready()) return;
    tone(740 * Math.pow(1.045, Math.min(i, 8)), { dur: 0.06, vol: 0.22, type: "sine", overtone: 0.25 });
  },

  stepBuzz() { buzz(7); },

  arrow() {
    buzz([10, 30, 25]);
    if (!ready()) return;
    hiss({ dur: 0.32, freq: 500, sweep: 6, q: 0.8, vol: 0.3 });
    tone(523, { at: 0.18, dur: 0.16, vol: 0.18, type: "triangle", glide: 1.5 });
  },

  // You captured someone.
  capture() {
    buzz([25, 35, 45]);
    if (!ready()) return;
    tone(880, { dur: 0.08, vol: 0.3, type: "triangle" });
    tone(660, { at: 0.07, dur: 0.32, vol: 0.32, type: "sine", glide: 0.25 });
    hiss({ at: 0.02, dur: 0.06, freq: 1200, q: 1, vol: 0.2 });
  },

  // Your guti was captured.
  captured() {
    buzz([70, 50, 90]);
    if (!ready()) return;
    tone(392, { dur: 0.16, vol: 0.28, type: "triangle", glide: 0.85 });
    tone(294, { at: 0.15, dur: 0.34, vol: 0.28, type: "triangle", glide: 0.6 });
  },

  home() {
    buzz([15, 30, 15]);
    if (!ready()) return;
    [1047, 1319, 1568].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.35, vol: 0.18, type: "sine", overtone: 0.2 }));
  },

  yourTurn() {
    buzz([20, 70, 20]);
    if (!ready()) return;
    tone(988, { dur: 0.22, vol: 0.2, type: "sine", overtone: 0.3 });
    tone(1319, { at: 0.11, dur: 0.3, vol: 0.2, type: "sine", overtone: 0.3 });
  },

  nomove() {
    if (!ready()) return;
    tone(330, { dur: 0.14, vol: 0.18, type: "triangle", glide: 0.9 });
  },

  three6() {
    buzz([40, 40, 40]);
    if (!ready()) return;
    [440, 370, 311].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.16, vol: 0.2, type: "triangle" }));
  },

  // A party popper as the result opens, then a rising chime.
  win() {
    buzz([30, 50, 30, 50, 90]);
    if (!ready()) return;
    hiss({ dur: 0.06, freq: 900, q: 0.8, vol: 0.55 });
    tone(220, { dur: 0.08, vol: 0.35, type: "sine", glide: 0.5 });
    hiss({ at: 0.03, dur: 0.5, freq: 6000, q: 0.6, vol: 0.12, type: "highpass" });
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, { at: 0.12 + i * 0.09, dur: 0.5, vol: 0.18, type: "sine", overtone: 0.25 }));
  },

  // Fireworks: a thin whistle going up, then a boom and a crackle where it bursts.
  launch(pan = 0) {
    if (!ready()) return;
    const out = panTo(pan);
    tone(620, { dur: 0.9, vol: 0.045, type: "sine", glide: 2.6, out });
    hiss({ dur: 0.8, freq: 2400, sweep: 2.2, q: 5, vol: 0.05, out });
  },

  burst(pan = 0, big = false) {
    if (big) buzz(40);
    if (!ready()) return;
    const out = panTo(pan);
    hiss({ dur: big ? 0.8 : 0.55, freq: 220, q: 0.7, vol: big ? 0.95 : 0.7, type: "lowpass", out });
    tone(big ? 80 : 110, { dur: 0.4, vol: big ? 0.5 : 0.38, type: "sine", glide: 0.45, out });
    const n = big ? 26 : 14;
    for (let i = 0; i < n; i++) {
      hiss({ at: 0.2 + Math.random() * (big ? 1.0 : 0.7), dur: 0.01 + Math.random() * 0.02, freq: 2500 + Math.random() * 4500, q: 2, vol: 0.1 + Math.random() * 0.12, out });
    }
  },

  lose() {
    if (!ready()) return;
    [523, 440, 392].forEach((f, i) => tone(f, { at: i * 0.14, dur: 0.3, vol: 0.16, type: "triangle" }));
  },

  join() {
    if (!ready()) return;
    tone(660, { dur: 0.1, vol: 0.16, type: "sine", overtone: 0.3 });
    tone(880, { at: 0.07, dur: 0.14, vol: 0.16, type: "sine", overtone: 0.3 });
  },
};
