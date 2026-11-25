// Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { newGame, apply, replay, legalMoves, destination, PENDING, TURN_MS, REVEAL_MS, current } from "../js/rules.js";
import { BASE, HOME, LANE0, globalIndex, TRACK, ARROW_TAIL } from "../js/board.js";

const players = (n) => Array.from({ length: n }, (_, i) => ({ seat: i, uid: `u${i}`, name: `P${i}`, anchor: "0".repeat(64) }));
const start = (n = 2, mode = "classic", rerolls = 0) => ({ a: "start", mode, code: "123456", players: players(n), rerolls, ts: 0, u: "u0" });

// A tiny driver: rolls come from a scripted list, all present seats included.
function driver(n, mode, dice, rerolls = 0) {
  let s = newGame(start(n, mode, rerolls));
  let ts = 1;
  const log = [start(n, mode, rerolls)];
  const dieByK = new Map();
  const dieOf = (e) => dieByK.get(e.k);
  const push = (e) => { log.push(e); const r = apply(s, e, dieOf); assert.notEqual(r, PENDING); s = r; return s; };
  return {
    get s() { return s; }, log, dieOf,
    roll(d) {
      const p = current(s);
      const w = {}; s.players.forEach((q) => { if (!q.out && !q.left) w[q.seat] = true; });
      dieByK.set(s.k, d ?? dice.shift());
      return push({ a: "roll", s: p.seat, k: s.k, x: "x", w, ts: ts++, u: p.uid });
    },
    move(t) { const p = current(s); return push({ a: "move", s: p.seat, t, ts: ts++, u: p.uid }); },
    raw(e) { return push({ ts: ts++, ...e }); },
    set(fn) { fn(s); },
  };
}

test("track has 52 distinct squares with corners 13 apart", () => {
  assert.equal(new Set(TRACK.map(String)).size, 52);
  assert.equal(globalIndex(1, 0), 13);
  assert.equal(globalIndex(3, 51), 38);
});

test("a 6 is needed to leave the base, and it gives another roll", () => {
  const g = driver(2, "classic", []);
  g.roll(3);
  assert.equal(g.s.turn, 1, "no move possible on a 3, turn passes");
  g.roll(6);
  assert.equal(g.s.players[1].tokens[0], 0, "only one distinct move, so it is played automatically");
  assert.equal(g.s.turn, 1, "a 6 gives another roll");
  assert.equal(g.s.phase, "roll");
});

test("three 6s in a row end the turn without moving", () => {
  const g = driver(2, "classic", []);
  g.roll(6);            // only move: bring a token out
  g.roll(6);            // two choices now
  assert.equal(g.s.phase, "move");
  g.move(0);
  const before = g.s.players[0].tokens.slice();
  g.roll(6);
  assert.deepEqual(g.s.players[0].tokens, before);
  assert.equal(g.s.turn, 1);
  assert.equal(g.s.event.type, "three6");
});

test("capturing a lone token sends it home to base and gives another roll", () => {
  const g = driver(2, "classic", []);
  // seat 0 (corner 0) token at rel 10; seat 1 (corner 2) token on the square 3 ahead
  g.set((s) => {
    s.players[0].tokens = [10, BASE, BASE, BASE];
    const target = globalIndex(0, 13 + 0); // rel 13 for corner 0 is the corner-1 start (safe), pick rel 12 instead
    void target;
    const g12 = globalIndex(0, 12);
    s.players[1].tokens = [(g12 - 26 + 52) % 52, BASE, BASE, BASE];
  });
  g.roll(2);
  assert.equal(g.s.players[1].tokens[0], BASE);
  assert.equal(g.s.players[0].kills, 1);
  assert.equal(g.s.turn, 0, "capture gives another roll");
});

test("tokens on safe squares and doubled tokens cannot be captured", () => {
  const g = driver(2, "classic", []);
  g.set((s) => {
    s.players[0].tokens = [5, 9, BASE, BASE];
    const star = 8; // global 8 is a star; corner 2 relative = 8 - 26 + 52 = 34
    s.players[1].tokens = [34, (globalIndex(0, 11) - 26 + 52) % 52, (globalIndex(0, 11) - 26 + 52) % 52, BASE];
    void star;
  });
  g.roll(3); // two choices: token0 5->8 (star) or token1 9->12
  assert.equal(g.s.phase, "move");
  g.move(0);
  assert.equal(g.s.players[1].tokens[0], 34, "star square is safe");
  assert.equal(g.s.turn, 1);
  g.set((s) => { s.turn = 0; s.phase = "roll"; });
  g.roll(2); // token1 9->11 lands on a doubled pair; token0 8->10 also possible
  g.move(1);
  assert.equal(g.s.players[1].tokens.filter((t) => t !== BASE).length, 3, "a pair protects itself");
});

test("an exact roll is needed to reach home", () => {
  const g = driver(2, "classic", []);
  g.set((s) => { s.players[0].tokens = [LANE0 + 3, HOME, HOME, HOME]; });
  g.roll(4);
  assert.equal(g.s.players[0].tokens[0], LANE0 + 3, "overshoot is not allowed");
  assert.equal(g.s.turn, 1);
  g.set((s) => { s.turn = 0; s.phase = "roll"; });
  g.roll(2);
  assert.equal(g.s.players[0].place, 1);
  assert.ok(g.s.over, "two-player game ends at the first finisher");
});

test("classic keeps playing for places with 3 players", () => {
  const g = driver(3, "classic", []);
  g.set((s) => { s.players[0].tokens = [LANE0 + 4, HOME, HOME, HOME]; });
  g.roll(1);
  assert.equal(g.s.players[0].place, 1);
  assert.ok(!g.s.over);
  assert.equal(g.s.turn, 1);
});

test("arrow mode: landing exactly on your arrow tail flies into your home lane, with another roll", () => {
  const g = driver(2, "arrow", []);
  assert.equal(ARROW_TAIL, 48);
  assert.deepEqual(TRACK[globalIndex(0, ARROW_TAIL)], [1, 8], "top-left colour's tail is (1,8)");
  assert.deepEqual(TRACK[globalIndex(1, ARROW_TAIL)], [6, 1], "top-right colour's tail is (6,1)");
  g.set((s) => { s.players[0].tokens = [45, BASE, BASE, BASE]; });
  g.roll(3);
  assert.equal(g.s.players[0].tokens[0], LANE0, "flew from 48 into the lane");
  assert.equal(g.s.event.arrow, true);
  assert.equal(g.s.turn, 0, "arrow gives another roll");
  g.set((s) => { s.players[0].tokens = [45, BASE, BASE, BASE]; s.phase = "roll"; });
  g.roll(4);
  assert.equal(g.s.players[0].tokens[0], 49, "passing over the tail does nothing");
  assert.equal(g.s.turn, 1);
});

test("arrow mode: no capture needed for the lane, all four home to win", () => {
  const g = driver(2, "arrow", []);
  g.set((s) => { s.players[0].tokens = [48, BASE, BASE, BASE]; });
  g.roll(3);
  assert.equal(g.s.players[0].tokens[0], LANE0, "lane open without a capture (48 -> 49 -> 50 -> lane)");
  const h = driver(2, "arrow", []);
  h.set((s) => { s.players[0].tokens = [LANE0 + 4, BASE, BASE, BASE]; });
  h.roll(1);
  assert.ok(!h.s.over, "one guti home is not a win in Arrow");
  h.set((s) => { s.turn = 0; s.phase = "roll"; s.players[0].tokens = [LANE0 + 4, HOME, HOME, HOME]; });
  h.roll(1);
  assert.ok(h.s.over);
  assert.equal(h.s.winner, 0);
});

test("classic has no arrows", () => {
  const g = driver(2, "classic", []);
  g.set((s) => { s.players[0].tokens = [45, BASE, BASE, BASE]; });
  g.roll(3);
  assert.equal(g.s.players[0].tokens[0], 48);
});

test("wrong player, wrong k, early exclusion and unknown dice are rejected", () => {
  const g = driver(3, "classic", []);
  const s0 = g.s;
  assert.equal(apply(s0, { a: "roll", s: 1, k: 1, x: "x", w: { 0: true, 1: true, 2: true }, ts: 5, u: "u1" }, () => 6), s0);
  assert.equal(apply(s0, { a: "roll", s: 0, k: 2, x: "x", w: { 0: true, 1: true, 2: true }, ts: 5, u: "u0" }, () => 6), s0);
  assert.equal(apply(s0, { a: "roll", s: 0, k: 1, x: "x", w: { 0: true, 1: true }, ts: 5, u: "u0" }, () => 6), s0, "excluding seat 2 before the wait");
  assert.notEqual(apply(s0, { a: "roll", s: 0, k: 1, x: "x", w: { 0: true, 1: true }, ts: REVEAL_MS + 1, u: "u0" }, () => 6), s0, "allowed after the wait");
  assert.equal(apply(s0, { a: "roll", s: 0, k: 1, x: "x", w: { 0: true }, ts: REVEAL_MS + 1, u: "u0" }, () => 6), s0, "needs at least one other player");
  assert.equal(apply(s0, { a: "roll", s: 0, k: 1, x: "x", w: { 0: true, 1: true, 2: true }, ts: 5, u: "u0" }, () => null), PENDING);
  assert.equal(apply(s0, { a: "roll", s: 0, k: 1, x: "x", w: { 0: true, 1: true, 2: true }, ts: 5, u: "u0" }, () => false), s0, "failed proof is ignored");
});

test("timeouts: skip only after the turn limit, three misses put a player out", () => {
  const g = driver(3, "classic", []);
  const early = apply(g.s, { a: "skip", s: 0, ts: TURN_MS - 1, u: "u1" }, g.dieOf);
  assert.equal(early, g.s);
  let ts = TURN_MS;
  for (let i = 0; i < 3; i++) {
    // seat 0 never acts; others pass on 3s
    g.raw({ a: "skip", s: 0, ts: (ts += TURN_MS), u: "u1" });
    g.roll(3); g.roll(3);
    g.set((s) => { s.turnTs = ts; });
  }
  assert.ok(g.s.players[0].out);
  assert.equal(g.s.players.filter((p) => !p.out).length, 2);
});

test("leaving ends a 2-player game for the other player", () => {
  const g = driver(2, "classic", []);
  g.raw({ a: "leave", s: 1, u: "u1" });
  assert.ok(g.s.over);
  assert.equal(g.s.winner, 0);
});

test("random games always finish and keep 4 tokens per player", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (const mode of ["classic", "arrow"]) {
    for (let n = 2; n <= 4; n++) {
      for (let game = 0; game < 30; game++) {
        const g = driver(n, mode, []);
        let guard = 0;
        while (!g.s.over && guard++ < 20000) {
          if (g.s.phase === "roll") g.roll(1 + Math.floor(rnd() * 6));
          else {
            const p = current(g.s);
            const moves = legalMoves(g.s, p, g.s.die);
            g.move(moves[Math.floor(rnd() * moves.length)].t);
          }
          for (const p of g.s.players) assert.equal(p.tokens.length, 4);
        }
        assert.ok(g.s.over, `${mode} ${n}p game ${game} finished`);
        const places = g.s.players.map((p) => p.place).filter(Boolean).sort();
        assert.ok(places.length >= 1);
        // replaying the same log gives the same state
        const r = replay(g.log, g.dieOf);
        assert.deepEqual(r.state.players.map((p) => p.tokens), g.s.players.map((p) => p.tokens));
      }
    }
  }
});

test("destination never overshoots home", () => {
  const g = driver(2, "classic", []);
  const p = g.s.players[0];
  p.tokens = [LANE0 + 2, BASE, BASE, BASE];
  assert.equal(destination(g.s, p, 0, 3).pos, HOME);
  assert.equal(destination(g.s, p, 0, 4), null);
});

test("re-rolls: equal allowance, choice window, discarded roll stays in the log", () => {
  const g = driver(2, "classic", [], 2);
  assert.equal(g.s.players[1].rerolls, 2);
  g.roll(3);
  assert.equal(g.s.phase, "move");
  assert.deepEqual(g.s.choice, { three: false, moves: 0 });
  g.raw({ a: "reroll", s: 0, u: "u0" });
  assert.equal(g.s.players[0].rerolls, 1);
  assert.equal(g.s.phase, "roll");
  assert.equal(g.s.rolls[0].rerolled, true);
  g.roll(6);
  assert.equal(g.s.choice.moves, 1);
  g.raw({ a: "keep", s: 0, u: "u0" });
  assert.equal(g.s.players[0].tokens[0], 0, "keep plays the only move");
  assert.equal(g.s.turn, 0, "the 6 still gives another roll");
  g.roll(2);
  g.raw({ a: "reroll", s: 0, u: "u0" });
  assert.equal(g.s.players[0].rerolls, 0);
  g.roll(2);
  assert.equal(g.s.players[0].tokens[0], 2, "no re-rolls left: resolves at once");
  assert.equal(g.raw({ a: "reroll", s: 1, u: "u1" }).players[1].rerolls, 2, "re-roll only in a choice window");
});

test("re-rolls: a third 6 can be re-rolled and the six count goes back", () => {
  const g = driver(2, "classic", [], 1);
  g.set((s) => { s.sixes = 2; s.players[0].tokens = [5, BASE, BASE, BASE]; });
  g.roll(6);
  assert.equal(g.s.choice.three, true);
  assert.equal(g.move(0).players[0].tokens[0], 5, "no move on a third 6");
  g.raw({ a: "reroll", s: 0, u: "u0" });
  assert.equal(g.s.sixes, 2);
  assert.equal(g.s.phase, "roll");
});

test("re-rolls: timing out during the choice resolves the roll", () => {
  const g = driver(2, "classic", [], 3);
  g.roll(4);
  g.raw({ a: "skip", s: 0, ts: TURN_MS + 10, u: "u1" });
  assert.equal(g.s.turn, 1);
  assert.equal(g.s.players[0].misses, 1);
});

test("random games with re-rolls finish", () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (const mode of ["classic", "arrow"]) {
    for (let game = 0; game < 20; game++) {
      const g = driver(3, mode, [], 3);
      let guard = 0;
      while (!g.s.over && guard++ < 20000) {
        const p = current(g.s);
        if (g.s.phase === "roll") g.roll(1 + Math.floor(rnd() * 6));
        else if (g.s.choice && p.rerolls > 0 && rnd() < 0.3) g.raw({ a: "reroll", s: p.seat, u: p.uid });
        else if (g.s.choice && (g.s.choice.three || g.s.choice.moves <= 1)) g.raw({ a: "keep", s: p.seat, u: p.uid });
        else {
          const moves = legalMoves(g.s, p, g.s.die);
          g.move(moves[Math.floor(rnd() * moves.length)].t);
        }
      }
      assert.ok(g.s.over);
      assert.deepEqual(replay(g.log, g.dieOf).state.players.map((q) => q.tokens), g.s.players.map((q) => q.tokens));
    }
  }
});
