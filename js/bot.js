// The robot opponent's choices. Pure functions over the game state: the robot
// sees the board and the dice already rolled, exactly like a person would. It
// never sees a future roll (those are sealed), and it gets no help from the dice.
import { BASE, HOME, LANE0, LAST_MAIN, PRE_START, SAFE, START, globalIndex } from "./board.js?v=202611260641";
import { poolMoves, capturesAt, present } from "./rules.js?v=202611260641";

export const LEVELS = {
  easy: { label: "Easy", note: "Plays for fun" },
  sharp: { label: "Sharp", note: "Plays to win" },
};

const onTrack = (pos) => pos >= 0 && pos <= PRE_START;

// How far along a guti is, 0 (base) .. 57 (home).
function progress(pos) {
  if (pos === BASE) return 0;
  if (pos >= LANE0) return 52 + (pos - LANE0);
  return pos + 1;
}

// How many opposing guti could land on relative square `pos` with one die (1..6).
// Two guti of one colour on a square block captures, so a pair counts as safe.
function threat(s, p, pos, tokens = p.tokens) {
  if (!onTrack(pos)) return 0;
  const g = globalIndex(p.corner, pos);
  if (SAFE.has(g)) return 0;
  if (tokens.filter((x) => x === pos).length > 1) return 0;
  let n = 0;
  for (const o of s.players) {
    if (o === p || !present(o) || o.place) continue;
    for (const tp of o.tokens) {
      if (tp === BASE) {
        // A guti leaving base lands on its own start square, which is safe.
        continue;
      }
      if (!onTrack(tp)) continue;
      const dist = (g - globalIndex(o.corner, tp) + 52) % 52;
      // It must reach the square before turning into its own home lane.
      if (dist >= 1 && dist <= 6 && tp + dist <= LAST_MAIN) n += 1;
    }
  }
  return n;
}

// Score a move for the sharp robot: bigger is better.
function score(s, p, m) {
  const from = p.tokens[m.t];
  const after = p.tokens.slice();
  after[m.t] = m.pos;
  let v = 0;
  const caps = capturesAt(s, p, m.pos);
  for (const c of caps) {
    const victim = s.players.find((q) => q.seat === c.seat);
    v += 60 + progress(victim.tokens[c.t]); // sending a far-along guti back hurts most
  }
  if (m.pos === HOME) v += 55;
  if (m.arrow) v += 30;
  if (from === BASE) v += p.tokens.filter((x) => x !== BASE && x !== HOME).length === 0 ? 50 : 26;
  if (m.pos >= LANE0 && from < LANE0) v += 22; // safe in the home lane
  // Danger: what this guti risks where it lands, against what it risked before.
  const worth = 8 + progress(m.pos) * 0.6;
  v -= threat(s, p, m.pos, after) * worth;
  if (from !== BASE) v += threat(s, p, from) * (8 + progress(from) * 0.6);
  // Leaving a partner alone on a shared square exposes it.
  if (from >= 0 && from <= PRE_START && p.tokens.filter((x) => x === from).length === 2) v -= threat(s, p, from, after) * 6;
  // Landing on a safe square or making a pair is worth a little.
  if (onTrack(m.pos) && SAFE.has(globalIndex(p.corner, m.pos))) v += 8;
  if (onTrack(m.pos) && after.filter((x) => x === m.pos).length > 1) v += 6;
  // Chase: being a few squares behind an opponent sets up a capture.
  if (onTrack(m.pos)) {
    const g = globalIndex(p.corner, m.pos);
    for (const o of s.players) {
      if (o === p || !present(o)) continue;
      for (const tp of o.tokens) {
        if (!onTrack(tp)) continue;
        const og = globalIndex(o.corner, tp);
        const ahead = (og - g + 52) % 52;
        if (ahead >= 1 && ahead <= 6 && !SAFE.has(og) && m.pos + ahead <= LAST_MAIN) v += 4;
      }
    }
  }
  // Otherwise, move forward, and prefer pushing the leader home.
  v += m.v * 0.4 + progress(from) * 0.05;
  // Never park on another colour's start square when they still have guti in base.
  if (onTrack(m.pos)) {
    const g = globalIndex(p.corner, m.pos);
    for (const o of s.players) {
      if (o !== p && present(o) && START[o.corner] === g && o.tokens.includes(BASE)) v -= 3;
    }
  }
  return v;
}

// rnd: () => number in [0, 1). Used only for the easy robot's mistakes and for
// breaking ties, never for anything the dice decide.
export function chooseMove(s, p, level = "sharp", rnd = Math.random) {
  const opts = poolMoves(s, p);
  if (!opts.length) return null;
  if (level === "easy") {
    // Mostly a sensible move, sometimes any move at all.
    if (rnd() < 0.45) return opts[Math.floor(rnd() * opts.length)];
    const simple = (m) => (capturesAt(s, p, m.pos).length ? 100 : 0) + (m.pos === HOME ? 60 : 0) + (p.tokens[m.t] === BASE ? 30 : 0) + m.v;
    return best(opts, simple, rnd);
  }
  return best(opts, (m) => score(s, p, m), rnd);
}

function best(opts, fn, rnd) {
  let top = -Infinity;
  let pick = [];
  for (const m of opts) {
    const v = fn(m);
    if (v > top + 1e-9) { top = v; pick = [m]; } else if (Math.abs(v - top) <= 1e-9) pick.push(m);
  }
  return pick[Math.floor(rnd() * pick.length)];
}

// Should the robot spend a re-roll on the roll it just made? Same allowance as
// the player; the sharp robot uses one when the roll is wasted.
export function wantsReroll(s, p, level = "sharp") {
  if (!s.choice || p.rerolls < 1) return false;
  if (s.choice.three) return true; // a third 6 would end the turn
  if (level === "easy") return false;
  if (s.owed > 0) return false; // more rolls are coming anyway
  const opts = poolMoves(s, p);
  // A wasted roll is worth another try, except while every guti still waits in
  // base: then a re-roll is just fishing for a 6, so save it for later.
  if (!opts.length) return p.tokens.some((x) => x !== BASE && x !== HOME);
  // Only a bad move available while a guti is in real danger: try again.
  const scored = opts.map((m) => score(s, p, m));
  return Math.max(...scored) < -25 && p.rerolls > 1;
}
