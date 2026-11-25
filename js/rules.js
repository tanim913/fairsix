// Game rules as a pure reducer over the shared action log.
//
// Every device replays the same log with the same rules, so all of them reach the
// same state. An entry that breaks a rule is ignored identically everywhere.
// Dice values come from a lookup (see fair.js); a roll whose proof has not been
// checked yet stops the replay until it has.
//
// Log entries (ts is the Firebase server time, u the writer's anonymous uid):
//   {a:"start", mode, code, players:[{seat, uid, name, anchor}], ts, u}
//   {a:"roll",  s, k, x, w:{seat:true|false}, ts, u}   roller reveals x[k]
//   {a:"move",  s, t, ts, u}                            move token t
//   {a:"reroll", s, ts, u}                              discard the roll and roll again
//   {a:"keep",  s, ts, u}                               keep the roll (when re-rolls are on)
//   {a:"skip",  s, ts, u}                               turn timed out (any player)
//   {a:"leave", s, ts, u}                               player quits

import {
  BASE, HOME, LANE0, LAST_MAIN, PRE_START, SAFE, ARROW_TAIL,
  cornersFor, globalIndex,
} from "./board.js";

export const TURN_MS = 30000;     // time to roll, and again to move
export const REVEAL_MS = 4000;    // wait for slow devices before rolling without them
export const MAX_MISSES = 3;      // missed turns in a row before a player is out
export const PENDING = Symbol("pending");

export const MODES = {
  classic: { label: "Classic", tokensToWin: 4, killToEnter: false, arrows: false },
  arrow: { label: "Arrow", tokensToWin: 4, killToEnter: false, arrows: true },
};

export function newGame(start) {
  const n = start.players.length;
  const corners = cornersFor(n);
  const players = start.players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((p, i) => ({
      seat: p.seat, uid: p.uid, name: p.name, anchor: p.anchor,
      corner: corners[i],
      tokens: [BASE, BASE, BASE, BASE],
      kills: 0, misses: 0, sixesTotal: 0,
      rerolls: Math.max(0, Math.min(5, Number(start.rerolls) || 0)),
      out: false, left: false, place: 0,
    }));
  return {
    mode: start.mode, code: start.code,
    players,
    turn: 0, phase: "roll", die: null, sixes: 0, sixesBefore: 0, choice: null,
    k: 1, turnTs: start.ts,
    places: 0, over: false, winner: null,
    rolls: [],      // {k, s, die, w}
    event: null,    // last visible event, for animation and messages
    seq: 0,         // number of entries applied
  };
}

const clone = (s) => ({
  ...s,
  players: s.players.map((p) => ({ ...p, tokens: p.tokens.slice() })),
  rolls: s.rolls,
});

export const current = (s) => s.players[s.turn];
export const active = (p) => !p.out && !p.left && !p.place;
export const present = (p) => !p.out && !p.left;
export const bySeat = (s, seat) => s.players.find((p) => p.seat === seat);

// ---- movement ----

function unlocked(state, p) {
  return !MODES[state.mode].killToEnter || p.kills > 0;
}

function step(pos, open) {
  if (pos >= 0 && pos < LAST_MAIN) return pos + 1;
  if (pos === LAST_MAIN) return open ? LANE0 : PRE_START;
  if (pos === PRE_START) return 0;
  if (pos >= LANE0 && pos < HOME) return pos + 1;
  return null;
}

// Destination of token t for die d, or null when the move is not allowed.
export function destination(state, p, t, d) {
  const pos = p.tokens[t];
  if (pos === HOME) return null;
  if (pos === BASE) return d === 6 ? { pos: 0, arrow: false } : null;
  const open = unlocked(state, p);
  let cur = pos;
  for (let i = 0; i < d; i++) {
    cur = step(cur, open);
    if (cur === null) return null;
  }
  // Landing exactly on your own arrow's tail flies you into your home lane.
  if (MODES[state.mode].arrows && cur === ARROW_TAIL && open) {
    return { pos: LANE0, arrow: true, via: cur };
  }
  return { pos: cur, arrow: false };
}

// Legal moves, one per distinct (from, to), keeping the lowest token index.
export function legalMoves(state, p, d) {
  const seen = new Set();
  const out = [];
  for (let t = 0; t < 4; t++) {
    const dest = destination(state, p, t, d);
    if (!dest) continue;
    const key = `${p.tokens[t]}>${dest.pos}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ t, ...dest });
  }
  return out;
}

// Opponent tokens that a token landing on relative position `pos` would capture.
export function capturesAt(state, p, pos) {
  if (pos < 0 || pos > PRE_START) return [];
  const g = globalIndex(p.corner, pos);
  if (SAFE.has(g)) return [];
  const hits = [];
  for (const o of state.players) {
    if (o === p || !present(o)) continue;
    const here = [];
    o.tokens.forEach((tp, i) => { if (tp >= 0 && tp <= PRE_START && globalIndex(o.corner, tp) === g) here.push(i); });
    if (here.length === 1) hits.push({ seat: o.seat, t: here[0] }); // two of a colour protect each other
  }
  return hits;
}

const progress = (pos) => (pos === BASE ? -1 : pos >= LANE0 ? 60 + pos - LANE0 : pos);

// Deterministic choice for a timed-out move: capture, then reach home, then the
// furthest token.
export function autoMove(state, p, d) {
  const moves = legalMoves(state, p, d);
  if (!moves.length) return null;
  const score = (m) =>
    (capturesAt(state, p, m.pos).length ? 1000 : 0) + (m.pos === HOME ? 500 : 0) + (m.arrow ? 50 : 0) + progress(p.tokens[m.t]);
  return moves.reduce((best, m) => (score(m) > score(best) ? m : best));
}

// ---- turn flow ----

function checkOver(s, ts) {
  const left = s.players.filter(active);
  if (s.over) return;
  if (s.winner !== null && MODES[s.mode].tokensToWin === 1) { s.over = true; return; }
  if (left.length <= 1 && s.players.length > 1) {
    if (left.length === 1) {
      left[0].place = ++s.places;
      if (s.winner === null) s.winner = left[0].seat;
    }
    s.over = true;
    s.phase = "over";
    s.event = { ...(s.event || {}), over: true, ts };
  }
}

function endTurn(s, ts) {
  s.phase = "roll";
  s.die = null;
  s.sixes = 0;
  s.choice = null;
  s.turnTs = ts;
  checkOver(s, ts);
  if (s.over) { s.phase = "over"; return; }
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (s.turn + i) % n;
    if (active(s.players[idx])) { s.turn = idx; return; }
  }
}

function again(s, ts) {
  s.phase = "roll";
  s.die = null;
  s.choice = null;
  s.turnTs = ts;
}

function applyMove(s, p, m, d, ts) {
  const from = p.tokens[m.t];
  p.tokens[m.t] = m.pos;
  const caps = capturesAt(s, p, m.pos);
  for (const c of caps) bySeat(s, c.seat).tokens[c.t] = BASE;
  p.kills += caps.length;
  const home = m.pos === HOME;
  s.event = { type: "move", seat: p.seat, t: m.t, from, to: m.pos, via: m.via, arrow: m.arrow, caps, home, die: d, ts };

  const need = MODES[s.mode].tokensToWin;
  if (p.tokens.filter((x) => x === HOME).length >= need) {
    p.place = ++s.places;
    if (s.winner === null) s.winner = p.seat;
    s.event.finished = true;
    endTurn(s, ts);
    return;
  }
  if (d === 6 || caps.length || home || m.arrow) again(s, ts);
  else endTurn(s, ts);
}

// After a roll is known. With re-rolls left the player gets a choice first;
// otherwise the roll resolves straight away.
function afterRoll(s, p, d, ts) {
  s.sixesBefore = s.sixes;
  s.sixes = d === 6 ? s.sixes + 1 : 0;
  const three = d === 6 && s.sixes >= 3;
  const moves = three ? [] : legalMoves(s, p, d);
  if (p.rerolls > 0) {
    s.phase = "move";
    s.die = d;
    s.turnTs = ts;
    s.choice = { three, moves: moves.length };
    s.event = { type: "rolled", seat: p.seat, die: d, ts, choice: true };
    return;
  }
  resolveRoll(s, p, d, ts, three, moves);
}

// Pass, auto-move, or wait for a move.
function resolveRoll(s, p, d, ts, three, moves) {
  s.choice = null;
  if (three) {
    s.event = { type: "three6", seat: p.seat, die: d, ts };
    endTurn(s, ts);
    return;
  }
  if (!moves.length) {
    s.event = { type: "nomove", seat: p.seat, die: d, ts };
    if (d === 6) again(s, ts); else endTurn(s, ts);
    return;
  }
  if (moves.length === 1) {
    applyMove(s, p, moves[0], d, ts);
    s.event.auto = true;
    return;
  }
  s.phase = "move";
  s.die = d;
  s.turnTs = ts;
  s.event = { type: "rolled", seat: p.seat, die: d, ts };
}

function forfeit(s, p, ts, why) {
  if (why === "left") p.left = true; else p.out = true;
  if (!p.place) p.tokens = p.tokens.map(() => BASE);
  s.event = { type: why, seat: p.seat, ts };
}

// Seats that must be in `w` (everyone still present), and whether excluding one is
// allowed yet.
export function rollRule(s, entry) {
  const p = current(s);
  const w = entry.w || {};
  const presentSeats = s.players.filter(present).map((q) => q.seat);
  if (w[p.seat] !== true) return "roller missing";
  for (const seat of Object.keys(w)) {
    if (w[seat] === true && !presentSeats.includes(Number(seat))) return "unknown seat";
  }
  const others = presentSeats.filter((seat) => seat !== p.seat);
  const included = others.filter((seat) => w[seat] === true);
  if (others.length && !included.length) return "needs another player";
  if (included.length < others.length && entry.ts - s.turnTs < REVEAL_MS) return "excluded too early";
  return null;
}

// Applies one entry. Returns the new state, the same state when the entry is
// ignored, or PENDING when a roll's proof is not available yet.
export function apply(s, entry, dieOf) {
  if (!entry || typeof entry !== "object") return s;
  if (entry.a === "start") return s; // only valid as the first entry, handled by replay
  if (s.over) return s;
  const p = current(s);

  if (entry.a === "leave") {
    const q = bySeat(s, entry.s);
    if (!q || q.uid !== entry.u || !present(q)) return s;
    const n = clone(s);
    const nq = bySeat(n, entry.s);
    forfeit(n, nq, entry.ts, "left");
    if (n.players[n.turn].seat === nq.seat) endTurn(n, entry.ts);
    else checkOver(n, entry.ts);
    if (n.over) n.phase = "over";
    n.seq++;
    return n;
  }

  if (entry.s !== p.seat) return s;

  if (entry.a === "roll") {
    if (s.phase !== "roll" || entry.u !== p.uid || Number(entry.k) !== s.k) return s;
    if (rollRule(s, entry)) return s;
    const d = dieOf(entry);
    if (d === null || d === undefined) return PENDING;
    if (!(d >= 1 && d <= 6)) return s; // proof failed
    const n = clone(s);
    const np = current(n);
    np.misses = 0;
    if (d === 6) np.sixesTotal++;
    n.k = s.k + 1;
    n.rolls = s.rolls.concat({ k: s.k, s: np.seat, die: d, w: entry.w, ts: entry.ts });
    afterRoll(n, np, d, entry.ts);
    n.seq++;
    return n;
  }

  if (entry.a === "reroll") {
    if (s.phase !== "move" || !s.choice || entry.u !== p.uid || p.rerolls < 1) return s;
    const n = clone(s);
    const np = current(n);
    np.rerolls -= 1;
    np.misses = 0;
    const last = n.rolls[n.rolls.length - 1];
    n.rolls = n.rolls.slice(0, -1).concat({ ...last, rerolled: true });
    n.sixes = s.sixesBefore;
    n.phase = "roll";
    n.die = null;
    n.choice = null;
    n.turnTs = entry.ts;
    n.event = { type: "reroll", seat: np.seat, die: s.die, ts: entry.ts };
    n.seq++;
    return n;
  }

  if (entry.a === "keep") {
    if (s.phase !== "move" || !s.choice || entry.u !== p.uid) return s;
    const n = clone(s);
    const np = current(n);
    np.misses = 0;
    if (s.choice.three || s.choice.moves <= 1) resolveRoll(n, np, s.die, entry.ts, s.choice.three, legalMoves(n, np, s.die));
    else n.choice = null;
    n.seq++;
    return n;
  }

  if (entry.a === "move") {
    if (s.phase !== "move" || entry.u !== p.uid || s.choice?.three) return s;
    if (!Number.isInteger(entry.t) || entry.t < 0 || entry.t > 3) return s;
    const dest = destination(s, p, entry.t, s.die);
    if (!dest) return s;
    const m = { t: entry.t, ...dest };
    const n = clone(s);
    const np = current(n);
    np.misses = 0;
    applyMove(n, np, m, s.die, entry.ts);
    n.seq++;
    return n;
  }

  if (entry.a === "skip") {
    const by = s.players.find((q) => q.uid === entry.u && present(q));
    if (!by || entry.ts - s.turnTs < TURN_MS) return s;
    const n = clone(s);
    const np = current(n);
    np.misses += 1;
    if (s.phase === "move" && s.choice && (s.choice.three || s.choice.moves <= 1)) {
      resolveRoll(n, np, s.die, entry.ts, s.choice.three, legalMoves(n, np, s.die));
      n.event = { ...n.event, timeout: true };
    } else if (s.phase === "move") {
      const m = autoMove(n, np, s.die);
      if (m) applyMove(n, np, m, s.die, entry.ts); else endTurn(n, entry.ts);
      n.event = { ...n.event, timeout: true };
    } else {
      n.event = { type: "timeout", seat: np.seat, ts: entry.ts };
      endTurn(n, entry.ts);
    }
    if (np.misses >= MAX_MISSES && present(np) && !np.place) {
      forfeit(n, np, entry.ts, "out");
      if (n.players[n.turn].seat === np.seat) endTurn(n, entry.ts);
      checkOver(n, entry.ts);
      if (n.over) n.phase = "over";
    }
    n.seq++;
    return n;
  }

  return s;
}

// Replays a whole log. Returns {state, pendingAt} where pendingAt is the index of
// the first roll still waiting for its proof (or -1).
export function replay(entries, dieOf) {
  const start = entries[0];
  if (!start || start.a !== "start") return { state: null, pendingAt: -1 };
  let s = newGame(start);
  for (let i = 1; i < entries.length; i++) {
    const r = apply(s, entries[i], dieOf);
    if (r === PENDING) return { state: s, pendingAt: i };
    s = r;
  }
  return { state: s, pendingAt: -1 };
}
