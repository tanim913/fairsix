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
//   {a:"move",  s, t, v, ts, u}                         move token t with die value v
//   {a:"reroll", s, ts, u}                              discard the roll and roll again
//   {a:"keep",  s, ts, u}                               keep the roll (when re-rolls are on)
//   {a:"skip",  s, ts, u}                               turn timed out (any player)
//   {a:"leave", s, ts, u}                               player quits

import {
  BASE, HOME, LANE0, LAST_MAIN, PRE_START, SAFE, ARROW_TAIL, CORNER_TAILS,
  cornersFor, globalIndex,
} from "./board.js?v=202611260641";

export const TURN_MS = 30000;     // time to roll, and again to move
export const REVEAL_MS = 4000;    // wait for slow devices before rolling without them
export const MAX_MISSES = 3;      // missed turns in a row before a player is out
export const PENDING = Symbol("pending");
// Bump whenever a rule changes: a game only plays on the version it started with.
export const RULES_VERSION = 4;

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
      seat: p.seat, uid: p.uid, name: p.name, anchor: p.anchor, dice: p.dice,
      corner: corners[i],
      tokens: [BASE, BASE, BASE, BASE],
      kills: 0, misses: 0, sixesTotal: 0,
      rerolls: Math.max(0, Math.min(5, Number(start.rerolls) || 0)),
      out: false, left: false, place: 0,
    }));
  return {
    mode: start.mode, code: start.code,
    players,
    turn: 0, phase: "roll", die: null, sixes: 0, choice: null, pool: [], owed: 1, moves: [],
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
  pool: (s.pool || []).slice(),
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
  if (MODES[state.mode].arrows) {
    // Landing exactly on your own colour's curved arrow flies you into your home lane.
    if (cur === ARROW_TAIL && open) return { pos: LANE0, arrow: true, via: cur };
    // Landing exactly on a corner arrow moves you one square on, for every colour.
    if (cur <= PRE_START && CORNER_TAILS.has(globalIndex(p.corner, cur))) return { pos: cur + 1, arrow: true, via: cur };
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
//
// A turn starts with one roll owed. Every 6 owes another roll, and so does every
// capture, guti reaching home, or arrow. Owed rolls are always taken first; the
// dice collect in a pool, and once nothing is owed the player spends the pool,
// choosing which die moves which guti. A third 6 in a row cancels the turn.

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

function freshTurn(s, ts) {
  s.phase = "roll";
  s.pool = [];
  s.owed = 1;
  s.die = null;
  s.sixes = 0;
  s.choice = null;
  s.turnTs = ts;
}

function endTurn(s, ts) {
  freshTurn(s, ts);
  checkOver(s, ts);
  if (s.over) { s.phase = "over"; return; }
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (s.turn + i) % n;
    if (active(s.players[idx])) { s.turn = idx; return; }
  }
}

// Every (die, guti) move the pool allows right now, one per distinct outcome.
export function poolMoves(s, p) {
  const out = [];
  for (const v of new Set(s.pool || [])) for (const m of legalMoves(s, p, v)) out.push({ v, ...m });
  return out;
}

// Moves token m.t by m.v; returns true when it finished the player.
function moveToken(s, p, m, ts, extra = {}) {
  const from = p.tokens[m.t];
  p.tokens[m.t] = m.pos;
  const caps = capturesAt(s, p, m.pos);
  for (const c of caps) bySeat(s, c.seat).tokens[c.t] = BASE;
  p.kills += caps.length;
  const home = m.pos === HOME;
  const ev = { type: "move", seat: p.seat, t: m.t, from, to: m.pos, via: m.via, arrow: m.arrow, caps, home, die: m.v, ts, ...extra };
  s.moves.push(ev);
  s.event = ev;
  const i = s.pool.indexOf(m.v);
  if (i >= 0) s.pool.splice(i, 1);
  if (p.tokens.filter((x) => x === HOME).length >= MODES[s.mode].tokensToWin) {
    p.place = ++s.places;
    if (s.winner === null) s.winner = p.seat;
    ev.finished = true;
    return true;
  }
  if (caps.length || home || m.arrow) s.owed += 1;
  return false;
}

// Nothing owed: play the only possible move by itself, wait for a choice, or
// end the turn when the pool cannot be used.
function settle(s, p, ts) {
  for (;;) {
    if (s.owed > 0) { s.phase = "roll"; s.turnTs = ts; return; }
    if (!s.pool.length) { endTurn(s, ts); return; }
    const opts = poolMoves(s, p);
    if (!opts.length) {
      s.event = { type: "nomove", seat: p.seat, dice: s.pool.slice(), ts };
      endTurn(s, ts);
      return;
    }
    if (opts.length > 1) { s.phase = "move"; s.turnTs = ts; return; }
    if (moveToken(s, p, opts[0], ts, { auto: true })) { endTurn(s, ts); return; }
  }
}

// A roll is final (kept): roll again, or move on to spending the pool.
function proceed(s, p, ts) {
  const three = s.choice?.three;
  s.choice = null;
  if (three) {
    s.event = { type: "three6", seat: p.seat, die: 6, ts };
    endTurn(s, ts);
    return;
  }
  settle(s, p, ts);
}

function afterRoll(s, p, d, ts) {
  const prev = { owed: s.owed, sixes: s.sixes };
  s.owed -= 1;
  s.die = d;
  let three = false;
  if (d === 6) {
    s.sixes += 1;
    if (s.sixes >= 3) three = true; else s.owed += 1;
  } else {
    s.sixes = 0;
  }
  if (!three) s.pool.push(d);
  s.turnTs = ts;
  s.choice = { three, prev };
  s.event = { type: "rolled", seat: p.seat, die: d, dice: s.pool.slice(), ts, again: !three && s.owed > 0 };
  if (p.rerolls > 0) {
    // Re-roll window: phase follows what comes next if the roll is kept.
    s.phase = three || s.owed === 0 ? "move" : "roll";
    return;
  }
  proceed(s, p, ts);
}

// Plays out what is left of a turn for a player who ran out of time.
function autoplay(s, p, ts) {
  s.choice = null;
  s.owed = 0;
  for (let guard = 0; guard < 12 && s.pool.length; guard++) {
    const opts = poolMoves(s, p);
    if (!opts.length) break;
    const score = (m) => (capturesAt(s, p, m.pos).length ? 1000 : 0) + (m.pos === HOME ? 500 : 0) + (m.arrow ? 50 : 0) + progress(p.tokens[m.t]) + m.v / 10;
    const m = opts.reduce((best, x) => (score(x) > score(best) ? x : best));
    if (moveToken(s, p, m, ts, { timeout: true })) break;
    s.owed = 0;
  }
  endTurn(s, ts);
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
  const fresh = () => { const n = clone(s); n.moves = []; return n; };

  if (entry.a === "leave") {
    const q = bySeat(s, entry.s);
    if (!q || q.uid !== entry.u || !present(q)) return s;
    const n = fresh();
    const nq = bySeat(n, entry.s);
    forfeit(n, nq, entry.ts, "left");
    if (n.players[n.turn].seat === nq.seat) endTurn(n, entry.ts);
    else checkOver(n, entry.ts);
    if (n.over) n.phase = "over";
    n.seq++;
    return n;
  }

  if (entry.s !== p.seat || entry.u !== p.uid && entry.a !== "skip") return s;

  if (entry.a === "roll") {
    if (s.owed < 1 || s.choice?.three || Number(entry.k) !== s.k) return s;
    if (rollRule(s, entry)) return s;
    const d = dieOf(entry);
    if (d === null || d === undefined) return PENDING;
    if (!(d >= 1 && d <= 6)) return s; // proof failed
    const n = fresh();
    const np = current(n);
    np.misses = 0;
    n.choice = null; // rolling again keeps the previous roll
    if (d === 6) np.sixesTotal++;
    n.k = s.k + 1;
    n.rolls = s.rolls.concat({ k: s.k, s: np.seat, die: d, w: entry.w, ts: entry.ts });
    afterRoll(n, np, d, entry.ts);
    n.seq++;
    return n;
  }

  if (entry.a === "reroll") {
    if (!s.choice || p.rerolls < 1) return s;
    const n = fresh();
    const np = current(n);
    np.rerolls -= 1;
    np.misses = 0;
    const last = n.rolls[n.rolls.length - 1];
    n.rolls = n.rolls.slice(0, -1).concat({ ...last, rerolled: true });
    if (!s.choice.three) n.pool = n.pool.slice(0, -1);
    n.owed = s.choice.prev.owed;
    n.sixes = s.choice.prev.sixes;
    n.phase = "roll";
    n.choice = null;
    n.turnTs = entry.ts;
    n.event = { type: "reroll", seat: np.seat, die: s.die, ts: entry.ts };
    n.seq++;
    return n;
  }

  if (entry.a === "keep") {
    if (!s.choice) return s;
    const n = fresh();
    const np = current(n);
    np.misses = 0;
    proceed(n, np, entry.ts);
    n.seq++;
    return n;
  }

  if (entry.a === "move") {
    if (s.owed > 0 || !s.pool.length || s.choice?.three) return s;
    if (!Number.isInteger(entry.t) || entry.t < 0 || entry.t > 3) return s;
    const v = entry.v === undefined ? s.pool[0] : Number(entry.v);
    if (!s.pool.includes(v)) return s;
    const dest = destination(s, p, entry.t, v);
    if (!dest) return s;
    const n = fresh();
    const np = current(n);
    np.misses = 0;
    n.choice = null; // moving keeps the roll
    if (moveToken(n, np, { t: entry.t, v, ...dest }, entry.ts)) endTurn(n, entry.ts);
    else settle(n, np, entry.ts);
    n.seq++;
    return n;
  }

  if (entry.a === "skip") {
    const by = s.players.find((q) => q.uid === entry.u && present(q));
    if (!by || entry.ts - s.turnTs < TURN_MS) return s;
    const n = fresh();
    const np = current(n);
    np.misses += 1;
    const hadDice = n.pool.length > 0 && !s.choice?.three;
    if (s.choice?.three) proceed(n, np, entry.ts);
    else autoplay(n, np, entry.ts);
    if (!hadDice) n.event = { type: "timeout", seat: np.seat, ts: entry.ts };
    else n.event = { ...(n.event || {}), timeout: true };
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
