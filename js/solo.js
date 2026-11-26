// One player against the robot, all on this device. Uses the same rules and the
// same sealed dice as an online room: you and the robot each seal a hash chain,
// both reveal into every roll, and every roll can be rechecked in Proof. The robot
// decides from the board alone (bot.js); it never reads an unrevealed value.
import { Room, KEEP_MS } from "./game.js?v=202611260641";
import { buildChain, newSeed, rollerIndex, helperIndex } from "./fair.js?v=202611260641";
import { current, poolMoves, RULES_VERSION } from "./rules.js?v=202611260641";
import { chooseMove, wantsReroll } from "./bot.js?v=202611260641";
import { moveChain } from "./render.js?v=202611260641";

const KEY = "fairsix:robot";
export const ME = "you";
export const BOT = "robot";
const ROBOT_SEAT = 1;

export function savedGame() {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) || "null");
    return g && g.entries?.[0]?.ver === RULES_VERSION ? g : null;
  } catch { return null; }
}

export function clearSaved() {
  try { localStorage.removeItem(KEY); } catch { /* nothing saved */ }
}

// Seals both players' dice and writes the start of a new game. Returns the saved game.
export async function newSoloGame({ mode, level, rerolls, dice, botDice }) {
  const seeds = [newSeed(), newSeed()];
  const chains = await Promise.all(seeds.map((s) => buildChain(s)));
  const start = {
    a: "start", ver: RULES_VERSION, mode, code: "robot", rerolls,
    players: [
      { seat: 0, uid: ME, name: "-", anchor: chains[0][0], dice },
      { seat: ROBOT_SEAT, uid: BOT, name: "Computer", anchor: chains[1][0], dice: botDice },
    ],
    u: ME, ts: Date.now(),
  };
  const game = { level, seeds, entries: [start] };
  try { localStorage.setItem(KEY, JSON.stringify(game)); } catch { /* plays, but cannot resume */ }
  return game;
}

export class LocalRoom extends Room {
  constructor(game, onChange) {
    super("robot", null, onChange);
    this.solo = true;
    this.level = game.level;
    this.game = game;
    this.online = { [ME]: true, [BOT]: true };
    this.botTimer = null;
    this.botKey = "";
  }

  get mySeat() { return 0; }
  now() { return Date.now(); }

  async start() {
    this.chains = await Promise.all(this.game.seeds.map((s) => buildChain(s)));
    this.secret = { chain: this.chains[0], anchor: this.chains[0][0] };
    this.entries = this.game.entries.map((e, n) => ({ ...e, _n: n }));
    this.advance();
    this.ticker = setInterval(() => { this.duties(); this.emit(); }, 500);
  }

  close() {
    clearInterval(this.ticker);
    clearTimeout(this.botTimer);
    this.closed = true;
  }

  // Both players reveal their helper value for roll k as soon as it is needed.
  dieOf(e) {
    const k = Number(e.k);
    if (!this.rv.has(k) && this.chains) {
      this.rv.set(k, { 0: this.chains[0][helperIndex(k)], [ROBOT_SEAT]: this.chains[1][helperIndex(k)] });
    }
    return super.dieOf(e);
  }

  async write(entry) {
    if (this.closed) return false;
    const e = { ...entry, u: entry.s === ROBOT_SEAT ? BOT : ME, ts: Date.now() };
    this.entries.push({ ...e, _n: this.entries.length });
    this.game.entries.push(e);
    this.advance();
    try {
      if (this.state?.over) clearSaved();
      else localStorage.setItem(KEY, JSON.stringify(this.game));
    } catch { /* not saved */ }
    return true;
  }

  // A roll's die is worked out a moment later, so the game can end after write().
  advance() {
    super.advance();
    if (this.state?.over && !this.closed) clearSaved();
  }

  rollStatus() {
    const s = this.state;
    if (!s || s.over || this.pending || this.problem) return { can: false };
    if (s.phase !== "roll" || current(s).seat !== 0 || s.owed < 1 || s.choice?.three) return { can: false };
    return { can: !this.busy, ready: 1, total: 1 };
  }

  roll(seat = 0) {
    const s = this.state;
    if (seat === 0 && !this.rollStatus().can) return Promise.resolve(false);
    if (!s || s.over || this.pending || current(s).seat !== seat || s.owed < 1 || s.choice?.three) return Promise.resolve(false);
    const k = s.k;
    return this.write({ a: "roll", s: seat, k: String(k), x: this.chains[seat === 0 ? 0 : 1][rollerIndex(k)], w: { 0: true, [ROBOT_SEAT]: true } });
  }

  leave() {
    const r = this.state && !this.state.over ? this.write({ a: "leave", s: 0 }) : Promise.resolve();
    clearSaved();
    return r;
  }

  duties() {
    const s = this.state;
    if (!s || s.over || this.pending || this.closed) return;
    const cur = current(s);
    if (cur.seat === 0) {
      // Same re-roll window as online: keep an obvious roll after a moment.
      if (s.choice && (s.choice.three || (s.owed === 0 && poolMoves(s, cur).length <= 1))
          && this.keepTried !== s.turnTs && Date.now() - s.turnTs >= KEEP_MS) {
        this.keepTried = s.turnTs;
        this.write({ a: "keep", s: 0 });
      }
      return;
    }
    // The robot's turn: act once per state, after the board has caught up.
    const key = `${s.seq}`;
    if (this.botKey === key) return;
    this.botKey = key;
    clearTimeout(this.botTimer);
    const chain = moveChain(s);
    const tail = chain.length ? chain[chain.length - 1] : null;
    const anim = tail ? tail.at + tail.hopMs : 0;
    const think = s.event?.type === "rolled" ? 950 : 700;
    this.botTimer = setTimeout(() => this.botAct(key), anim + think + Math.random() * 300);
  }

  botAct(key) {
    const s = this.state;
    if (this.closed || !s || s.over || this.pending || `${s.seq}` !== key) return;
    const p = current(s);
    if (p.seat !== ROBOT_SEAT) return;
    if (s.choice) {
      if (wantsReroll(s, p, this.level)) return this.write({ a: "reroll", s: ROBOT_SEAT });
      if (s.owed > 0 && !s.choice.three) return this.roll(ROBOT_SEAT);
      return this.write({ a: "keep", s: ROBOT_SEAT });
    }
    if (s.owed > 0) return this.roll(ROBOT_SEAT);
    const m = chooseMove(s, p, this.level);
    if (m) return this.write({ a: "move", s: ROBOT_SEAT, t: m.t, v: m.v });
  }
}
