// Run: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { newGame, apply, current, poolMoves, PENDING } from "../js/rules.js";
import { chooseMove, wantsReroll } from "../js/bot.js";

// A seeded random source, so failures can be replayed.
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
}

// Plays a whole 2-player game where both seats are computers at the given levels.
function playGame(levels, mode, seed, rerolls = 3) {
  const r = rng(seed);
  const players = levels.map((_, i) => ({ seat: i, uid: `u${i}`, name: `P${i}`, anchor: "0".repeat(64) }));
  let s = newGame({ a: "start", mode, code: "000000", players, rerolls, ts: 0 });
  const dice = new Map();
  const dieOf = (e) => dice.get(Number(e.k));
  let ts = 1;
  const push = (e) => {
    const n = apply(s, { ts: ts++, ...e }, dieOf);
    assert.notEqual(n, PENDING);
    assert.notEqual(n, s, `entry ignored: ${JSON.stringify(e)} in phase ${s.phase}`);
    s = n;
  };
  for (let guard = 0; guard < 20000 && !s.over; guard++) {
    const p = current(s);
    const lvl = levels[p.seat];
    if (s.choice) {
      if (wantsReroll(s, p, lvl)) push({ a: "reroll", s: p.seat, u: p.uid });
      else if (s.owed > 0 && !s.choice.three) { dice.set(s.k, 1 + Math.floor(r() * 6)); push({ a: "roll", s: p.seat, k: String(s.k), x: "x", w: { 0: true, 1: true }, u: p.uid }); }
      else push({ a: "keep", s: p.seat, u: p.uid });
      continue;
    }
    if (s.owed > 0) {
      dice.set(s.k, 1 + Math.floor(r() * 6));
      push({ a: "roll", s: p.seat, k: String(s.k), x: "x", w: { 0: true, 1: true }, u: p.uid });
      continue;
    }
    const m = chooseMove(s, p, lvl, r);
    assert.ok(m, "a move was owed but the computer found none");
    assert.ok(poolMoves(s, p).some((x) => x.t === m.t && x.v === m.v), "computer picked an illegal move");
    push({ a: "move", s: p.seat, t: m.t, v: m.v, u: p.uid });
  }
  assert.ok(s.over, "game did not finish");
  return s.winner;
}

test("computer games always finish with legal moves, both modes and levels", () => {
  for (const mode of ["classic", "arrow"]) {
    for (let i = 0; i < 40; i++) playGame(i % 2 ? ["sharp", "easy"] : ["easy", "sharp"], mode, 1000 + i, i % 3 ? 3 : 0);
  }
});

test("sharp beats easy clearly over many games", () => {
  let sharp = 0;
  const N = 300;
  for (let i = 0; i < N; i++) {
    const levels = i % 2 ? ["sharp", "easy"] : ["easy", "sharp"]; // alternate who starts
    const w = playGame(levels, i % 4 < 2 ? "classic" : "arrow", 7 + i);
    if (levels[w] === "sharp") sharp++;
  }
  assert.ok(sharp / N > 0.6, `sharp won only ${sharp}/${N}`);
  console.log(`  sharp won ${sharp}/${N}`);
});
