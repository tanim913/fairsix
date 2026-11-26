// Run: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { newGame, apply, replay, legalMoves, destination, poolMoves, PENDING, TURN_MS, REVEAL_MS, current, AUTO_AFTER, AUTO_SKIP_MS, MAX_MISSES } from "../js/rules.js";
import { BASE, HOME, LANE0, globalIndex, TRACK, ARROW_TAIL, START } from "../js/board.js";

// Relative position for player q of the square that is `rel` for player p.
const same = (p, rel, q) => (globalIndex(p.corner, rel) - START[q.corner] + 52) % 52;

const players = (n) => Array.from({ length: n }, (_, i) => ({ seat: i, uid: `u${i}`, name: `P${i}`, anchor: "0".repeat(64) }));
const start = (n = 2, mode = "classic", rerolls = 0) => ({ a: "start", mode, code: "123456", players: players(n), rerolls, ts: 0, u: "u0" });

// A tiny driver: rolls come from the test, all present seats included.
function driver(n, mode, rerolls = 0) {
  let s = newGame(start(n, mode, rerolls));
  let ts = 1;
  const log = [start(n, mode, rerolls)];
  const dieByK = new Map();
  const dieOf = (e) => dieByK.get(Number(e.k));
  const push = (e) => { log.push(e); const r = apply(s, e, dieOf); assert.notEqual(r, PENDING); s = r; return s; };
  return {
    get s() { return s; }, log, dieOf,
    roll(d) {
      const p = current(s);
      const w = {}; s.players.forEach((q) => { if (!q.out && !q.left) w[q.seat] = true; });
      dieByK.set(s.k, d);
      return push({ a: "roll", s: p.seat, k: String(s.k), x: "x", w, ts: ts++, u: p.uid });
    },
    move(t, v) { const p = current(s); return push({ a: "move", s: p.seat, t, v, ts: ts++, u: p.uid }); },
    raw(e) { return push({ ts: ts++, ...e }); },
    // Put the current player at the start of a fresh turn.
    fresh(fn) { fn?.(s); s.phase = "roll"; s.owed = 1; s.pool = s.pool?.length && s.sixes ? s.pool : []; s.choice = null; if (!fn) s.sixes = 0; },
  };
}

test("track has 52 distinct squares with corners 13 apart", () => {
  assert.equal(new Set(TRACK.map(String)).size, 52);
  assert.equal(globalIndex(1, 0), 13);
  assert.equal(globalIndex(3, 51), 38);
});

test("a 6 is needed to leave the base; a 6 is rolled again before any move", () => {
  const g = driver(2, "classic");
  g.roll(3);
  assert.equal(g.s.turn, 1, "no move possible on a 3, turn passes");
  g.roll(6);
  assert.equal(g.s.turn, 1);
  assert.equal(g.s.phase, "roll", "must roll again before moving");
  assert.deepEqual(g.s.pool, [6]);
  assert.equal(g.s.players[1].tokens[0], BASE, "nothing moved yet");
  g.roll(2);
  assert.equal(g.s.players[1].tokens[0], 2, "6 brought it out, then 2 moved it (only one way to play both)");
  assert.equal(g.s.turn, 0);
});

test("dice stack up and the player chooses which die moves which guti", () => {
  const g = driver(2, "classic");
  g.fresh((s) => { s.players[0].tokens = [10, 20, BASE, BASE]; });
  g.roll(6);
  g.roll(4);
  assert.deepEqual(g.s.pool, [6, 4]);
  assert.equal(g.s.phase, "move");
  g.move(1, 4);
  assert.equal(g.s.players[0].tokens[1], 24);
  assert.deepEqual(g.s.pool, [6]);
  assert.equal(g.s.phase, "move", "6 can still bring a guti out or move either guti");
  g.move(0, 6);
  assert.equal(g.s.players[0].tokens[0], 16);
  assert.equal(g.s.turn, 1, "pool spent, turn over");
});

test("three 6s in a row cancel the turn, dice unused", () => {
  const g = driver(2, "classic");
  g.roll(6); g.roll(6); g.roll(6);
  assert.deepEqual(g.s.players[0].tokens, [BASE, BASE, BASE, BASE]);
  assert.equal(g.s.turn, 1);
  assert.equal(g.s.event.type, "three6");
});

test("a capture owes another roll, taken before the rest of the pool", () => {
  const g = driver(2, "classic");
  g.fresh((s) => { s.players[0].tokens = [10, 30, BASE, BASE]; s.players[1].tokens = [same(s.players[0], 12, s.players[1]), BASE, BASE, BASE]; });
  g.roll(6);
  g.roll(2);
  g.move(0, 2);
  assert.equal(g.s.players[1].tokens[0], BASE, "captured");
  assert.equal(g.s.players[0].kills, 1);
  assert.equal(g.s.phase, "roll", "capture bonus must be rolled first");
  assert.deepEqual(g.s.pool, [6]);
  assert.equal(g.raw({ a: "move", s: 0, t: 1, v: 6, u: "u0" }).players[0].tokens[1], 30, "cannot move while a roll is owed");
  g.roll(3);
  assert.deepEqual(g.s.pool, [6, 3]);
  assert.equal(g.s.phase, "move");
});

test("tokens on safe squares and doubled tokens cannot be captured", () => {
  const g = driver(2, "classic");
  let star, p11;
  g.fresh((s) => {
    const [a, b] = s.players;
    star = same(a, 8, b); p11 = same(a, 11, b);
    a.tokens = [5, 9, BASE, BASE]; b.tokens = [star, p11, p11, BASE];
  });
  g.roll(3);
  assert.equal(g.s.phase, "move");
  g.move(0, 3);
  assert.equal(g.s.players[1].tokens[0], star, "star square is safe");
  assert.equal(g.s.turn, 1);
  g.fresh((s) => { s.turn = 0; });
  g.roll(2);
  g.move(1, 2);
  assert.equal(g.s.players[1].tokens.filter((t) => t !== BASE).length, 3, "a pair protects itself");
});

test("an exact roll is needed to reach home", () => {
  const g = driver(2, "classic");
  g.fresh((s) => { s.players[0].tokens = [LANE0 + 3, HOME, HOME, HOME]; });
  g.roll(4);
  assert.equal(g.s.players[0].tokens[0], LANE0 + 3, "overshoot is not allowed");
  assert.equal(g.s.turn, 1);
  g.fresh((s) => { s.turn = 0; });
  g.roll(2);
  assert.equal(g.s.players[0].place, 1);
  assert.ok(g.s.over, "two-player game ends at the first finisher");
});

test("classic keeps playing for places with 3 players", () => {
  const g = driver(3, "classic");
  g.fresh((s) => { s.players[0].tokens = [LANE0 + 4, HOME, HOME, HOME]; });
  g.roll(1);
  assert.equal(g.s.players[0].place, 1);
  assert.ok(!g.s.over);
  assert.equal(g.s.turn, 1);
});

test("arrow mode: landing exactly on your own arrow tail flies into your home lane, with another roll", () => {
  const g = driver(2, "arrow");
  assert.equal(ARROW_TAIL, 48);
  assert.deepEqual(TRACK[globalIndex(0, ARROW_TAIL)], [1, 8], "top-left colour's tail is (1,8)");
  assert.deepEqual(TRACK[globalIndex(1, ARROW_TAIL)], [6, 1], "top-right colour's tail is (6,1)");
  g.fresh((s) => { s.players[0].tokens = [45, BASE, BASE, BASE]; });
  g.roll(3);
  assert.equal(g.s.players[0].tokens[0], LANE0, "flew from 48 into the lane");
  assert.equal(g.s.event.arrow, true);
  assert.equal(g.s.phase, "roll");
  assert.equal(g.s.turn, 0, "arrow gives another roll");
  g.fresh((s) => { s.players[0].tokens = [45, BASE, BASE, BASE]; });
  g.roll(4);
  assert.equal(g.s.players[0].tokens[0], 49, "passing over the tail does nothing");
  assert.equal(g.s.turn, 1);
});

test("arrow mode: another colour's arrow tail is an ordinary square (no jump, no extra roll)", () => {
  const g = driver(2, "arrow");
  // Seat 1 stands on seat 0's arrow tail.
  const rel = same(g.s.players[0], ARROW_TAIL, g.s.players[1]);
  g.fresh((s) => { s.turn = 1; s.players[1].tokens = [rel - 2, BASE, BASE, BASE]; });
  g.roll(2);
  assert.equal(g.s.players[1].tokens[0], rel, "stays on the other colour's tail");
  assert.ok(!g.s.event.arrow);
  assert.equal(g.s.turn, 0, "no extra roll");
});

test("arrow mode: no capture needed for the lane, all four home to win", () => {
  const g = driver(2, "arrow");
  g.fresh((s) => { s.players[0].tokens = [48, BASE, BASE, BASE]; });
  g.roll(3);
  assert.equal(g.s.players[0].tokens[0], LANE0, "lane open without a capture (48 -> 49 -> 50 -> lane)");
  const h = driver(2, "arrow");
  h.fresh((s) => { s.players[0].tokens = [LANE0 + 4, BASE, BASE, BASE]; });
  h.roll(1);
  assert.ok(!h.s.over, "one guti home is not a win in Arrow");
  h.fresh((s) => { s.turn = 0; s.players[0].tokens = [LANE0 + 4, HOME, HOME, HOME]; });
  h.roll(1);
  assert.ok(h.s.over);
  assert.equal(h.s.winner, 0);
});

test("classic has no arrows", () => {
  const g = driver(2, "classic");
  g.fresh((s) => { s.players[0].tokens = [45, BASE, BASE, BASE]; });
  g.roll(3);
  assert.equal(g.s.players[0].tokens[0], 48);
});

test("wrong player, wrong k, early exclusion and unknown dice are rejected", () => {
  const g = driver(3, "classic");
  const s0 = g.s;
  assert.equal(apply(s0, { a: "roll", s: 1, k: "1", x: "x", w: { 0: true, 1: true, 2: true }, ts: 5, u: "u1" }, () => 6), s0);
  assert.equal(apply(s0, { a: "roll", s: 0, k: "2", x: "x", w: { 0: true, 1: true, 2: true }, ts: 5, u: "u0" }, () => 6), s0);
  assert.equal(apply(s0, { a: "roll", s: 0, k: "1", x: "x", w: { 0: true, 1: true }, ts: 5, u: "u0" }, () => 6), s0, "excluding seat 2 before the wait");
  assert.notEqual(apply(s0, { a: "roll", s: 0, k: "1", x: "x", w: { 0: true, 1: true }, ts: REVEAL_MS + 1, u: "u0" }, () => 6), s0, "allowed after the wait");
  assert.equal(apply(s0, { a: "roll", s: 0, k: "1", x: "x", w: { 0: true }, ts: REVEAL_MS + 1, u: "u0" }, () => 6), s0, "needs at least one other player");
  assert.equal(apply(s0, { a: "roll", s: 0, k: "1", x: "x", w: { 0: true, 1: true, 2: true }, ts: 5, u: "u0" }, () => null), PENDING);
  assert.equal(apply(s0, { a: "roll", s: 0, k: "1", x: "x", w: { 0: true, 1: true, 2: true }, ts: 5, u: "u0" }, () => false), s0, "failed proof is ignored");
});

test("timeouts: skip only after the turn limit, three misses put a player out", () => {
  const g = driver(3, "classic");
  const early = apply(g.s, { a: "skip", s: 0, ts: TURN_MS - 1, u: "u1" }, g.dieOf);
  assert.equal(early, g.s);
  let ts = TURN_MS;
  for (let i = 0; i < 3; i++) {
    g.raw({ a: "skip", s: 0, ts: (ts += TURN_MS), u: "u1" });
    g.roll(3); g.roll(3);
    g.s.turnTs = ts;
  }
  assert.ok(g.s.players[0].out);
  assert.equal(g.s.players.filter((p) => !p.out).length, 2);
});

test("a timeout with dice in the pool plays them out", () => {
  const g = driver(2, "classic");
  g.fresh((s) => { s.players[0].tokens = [10, 20, BASE, BASE]; });
  g.roll(6); g.roll(4);
  g.raw({ a: "skip", s: 0, ts: TURN_MS + 100, u: "u1" });
  assert.equal(g.s.turn, 1);
  const moved = g.s.players[0].tokens.filter((t) => t !== BASE).reduce((a, t) => a + t, 0);
  assert.ok(moved === 40 || g.s.players[0].tokens.includes(0), "both dice were used");
});

test("leaving ends a 2-player game for the other player", () => {
  const g = driver(2, "classic");
  g.raw({ a: "leave", s: 1, u: "u1" });
  assert.ok(g.s.over);
  assert.equal(g.s.winner, 0);
});

test("destination never overshoots home", () => {
  const g = driver(2, "classic");
  const p = g.s.players[0];
  p.tokens = [LANE0 + 2, BASE, BASE, BASE];
  assert.equal(destination(g.s, p, 0, 3).pos, HOME);
  assert.equal(destination(g.s, p, 0, 4), null);
});

test("re-rolls: equal allowance, window on the latest die, discarded roll stays in the log", () => {
  const g = driver(2, "classic", 2);
  assert.equal(g.s.players[1].rerolls, 2);
  g.roll(3);
  assert.ok(g.s.choice);
  g.raw({ a: "reroll", s: 0, u: "u0" });
  assert.equal(g.s.players[0].rerolls, 1);
  assert.equal(g.s.phase, "roll");
  assert.deepEqual(g.s.pool, []);
  assert.equal(g.s.rolls[0].rerolled, true);
  g.roll(6);
  assert.equal(g.s.phase, "roll", "a kept 6 still owes a roll");
  g.roll(2); // rolling again keeps the 6
  assert.deepEqual(g.s.pool, [6, 2]);
  g.raw({ a: "keep", s: 0, u: "u0" });
  assert.equal(g.s.players[0].tokens[0], 2, "only way to play: 6 out, then 2");
  assert.equal(g.s.turn, 1);
});

test("re-rolls: a third 6 can be re-rolled and the six count goes back", () => {
  const g = driver(2, "classic", 1);
  g.fresh((s) => { s.players[0].tokens = [5, BASE, BASE, BASE]; s.sixes = 2; s.pool = [6, 6]; });
  g.roll(6);
  assert.equal(g.s.choice.three, true);
  assert.equal(g.move(0, 6).players[0].tokens[0], 5, "no move on a third 6");
  g.raw({ a: "reroll", s: 0, u: "u0" });
  assert.equal(g.s.sixes, 2);
  assert.equal(g.s.phase, "roll");
  assert.deepEqual(g.s.pool, [6, 6]);
});

test("re-rolls: timing out on a third 6 ends the turn without moving", () => {
  const g = driver(2, "classic", 1);
  g.fresh((s) => { s.players[0].tokens = [5, BASE, BASE, BASE]; s.sixes = 2; s.pool = [6, 6]; });
  g.roll(6);
  g.raw({ a: "skip", s: 0, ts: TURN_MS + 100, u: "u1" });
  assert.equal(g.s.players[0].tokens[0], 5);
  assert.equal(g.s.turn, 1);
});

function randomGames(rerolls, seed0) {
  let seed = seed0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (const mode of ["classic", "arrow"]) {
    for (let n = 2; n <= 4; n++) {
      for (let game = 0; game < 15; game++) {
        const g = driver(n, mode, rerolls);
        let guard = 0;
        while (!g.s.over && guard++ < 30000) {
          const p = current(g.s);
          if (g.s.choice && p.rerolls > 0 && rnd() < 0.2) { g.raw({ a: "reroll", s: p.seat, u: p.uid }); continue; }
          if (g.s.choice?.three) { g.raw({ a: "keep", s: p.seat, u: p.uid }); continue; }
          if (g.s.owed > 0) { g.roll(1 + Math.floor(rnd() * 6)); continue; }
          const opts = poolMoves(g.s, p);
          if (g.s.choice && opts.length <= 1) { g.raw({ a: "keep", s: p.seat, u: p.uid }); continue; }
          const m = opts[Math.floor(rnd() * opts.length)];
          g.move(m.t, m.v);
          for (const q of g.s.players) assert.equal(q.tokens.length, 4);
        }
        assert.ok(g.s.over, `${mode} ${n}p game ${game} finished`);
        const r = replay(g.log, g.dieOf);
        assert.deepEqual(r.state.players.map((q) => q.tokens), g.s.players.map((q) => q.tokens));
      }
    }
  }
}

test("random games always finish and replay identically", () => randomGames(0, 7));
test("random games with re-rolls finish and replay identically", () => randomGames(3, 11));

test("four guti in base are one distinct move on a 6", () => {
  const g = driver(2, "classic");
  const p = g.s.players[0];
  assert.equal(legalMoves(g.s, p, 6).length, 1);
});

test("two players sit bottom-left and top-right", () => {
  const g = driver(2, "classic");
  assert.deepEqual(g.s.players.map((p) => p.corner), [3, 1]);
});

test("arrow mode: corner arrows move any colour one square on, with another roll", () => {
  const g = driver(2, "arrow");
  // Relative square 4 is a corner-arrow tail for every colour.
  g.fresh((s) => { s.players[0].tokens = [1, BASE, BASE, BASE]; });
  g.roll(3);
  assert.equal(g.s.players[0].tokens[0], 5, "landed on the tail at 4, moved on to 5");
  assert.equal(g.s.event.arrow, true);
  assert.equal(g.s.phase, "roll", "and earned another roll");
  g.fresh((s) => { s.players[0].tokens = [1, BASE, BASE, BASE]; });
  g.roll(4);
  assert.equal(g.s.players[0].tokens[0], 5, "passing over the tail is a normal move");
  assert.equal(g.s.turn, 1);
  const c = driver(2, "classic");
  c.fresh((s) => { s.players[0].tokens = [1, BASE, BASE, BASE]; });
  c.roll(3);
  assert.equal(c.s.players[0].tokens[0], 4, "no corner arrows in Classic");
});

test("auto-play: own phone turns it on late in the turn, plays, and I'm back turns it off", () => {
  const dice = new Map();
  const dieOf = (e) => dice.get(Number(e.k));
  const w = { 0: true, 1: true };
  let s = newGame(start(2, "classic"));
  const step = (e) => { const n = apply(s, e, dieOf); assert.notEqual(n, PENDING); return n; };

  // Too early, or written by someone else: ignored.
  assert.equal(step({ a: "auto", s: 0, ts: AUTO_AFTER - 1, u: "u0" }), s);
  assert.equal(step({ a: "auto", s: 0, ts: AUTO_AFTER, u: "u1" }), s);
  // A roll marked auto while auto-play is off: ignored.
  dice.set(1, 3);
  assert.equal(step({ a: "roll", s: 0, k: "1", x: "x", w, ts: 10, u: "u0", auto: true }), s);

  s = step({ a: "auto", s: 0, ts: AUTO_AFTER, u: "u0" });
  assert.equal(s.players[0].auto, true);
  assert.equal(s.event.type, "auto");

  // Auto-play rolls (a 3 with all guti in base: no move, turn passes) and stays on.
  s = step({ a: "roll", s: 0, k: "1", x: "x", w, ts: AUTO_AFTER + 1000, u: "u0", auto: true });
  assert.equal(s.players[0].auto, true);
  assert.equal(current(s).seat, 1);

  // "I'm back" works even on someone else's turn; only the player can send it.
  assert.equal(step({ a: "back", s: 0, ts: AUTO_AFTER + 1500, u: "u1" }), s);
  s = step({ a: "back", s: 0, ts: AUTO_AFTER + 1500, u: "u0" });
  assert.equal(s.players[0].auto, false);
  assert.equal(s.event.type, "back");
  assert.equal(step({ a: "back", s: 0, ts: AUTO_AFTER + 1600, u: "u0" }), s, "back without auto-play is ignored");
});

test("auto-play: a manual roll turns it off; a quiet auto player is skipped sooner, then out", () => {
  const dice = new Map();
  const dieOf = (e) => dice.get(Number(e.k));
  const w = { 0: true, 1: true };
  let s = newGame(start(2, "classic"));
  const step = (e) => apply(s, e, dieOf);

  // Player 0 never acts: player 1 skips them after the full turn time; that turns auto-play on.
  s = step({ a: "skip", s: 0, ts: TURN_MS, u: "u1" });
  assert.equal(s.players[0].auto, true);
  assert.equal(s.players[0].misses, 1);
  // Player 1 rolls a 2 (no move), so it's player 0's turn again.
  dice.set(1, 2);
  s = step({ a: "roll", s: 1, k: "1", x: "x", w, ts: TURN_MS + 100, u: "u1" });
  assert.equal(current(s).seat, 0);
  const t0 = s.turnTs;
  // On auto-play the skip comes after AUTO_SKIP_MS, not the full turn.
  assert.equal(step({ a: "skip", s: 0, ts: t0 + AUTO_SKIP_MS - 1, u: "u1" }), s);
  const skipped = step({ a: "skip", s: 0, ts: t0 + AUTO_SKIP_MS, u: "u1" });
  assert.equal(skipped.players[0].misses, 2);

  // Instead, player 0 comes back and rolls by hand: auto-play off, misses reset.
  dice.set(2, 4);
  const manual = step({ a: "roll", s: 0, k: "2", x: "x", w, ts: t0 + 2000, u: "u0" });
  assert.equal(manual.players[0].auto, false);
  assert.equal(manual.players[0].misses, 0);

  // A phone that stays gone is out after MAX_MISSES skips in a row.
  s = skipped;
  let k = 2;
  while (!s.players[0].out) {
    if (current(s).seat === 1) { dice.set(k, 1); s = step({ a: "roll", s: 1, k: String(k++), x: "x", w, ts: s.turnTs + 50, u: "u1" }); continue; }
    s = step({ a: "skip", s: 0, ts: s.turnTs + AUTO_SKIP_MS, u: "u1" });
  }
  assert.equal(s.players[0].misses, MAX_MISSES);
  assert.ok(s.over);
});
