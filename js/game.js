// Room client: follows a room's log, checks every roll's proof, and does this
// device's part (revealing its values, rolling, moving, timing out idle players).
import * as net from "./net.js?v=202611260632";
import {
  newGame, apply, PENDING, current, present, bySeat, legalMoves, poolMoves, TURN_MS, REVEAL_MS, RULES_VERSION,
} from "./rules.js?v=202611260632";

export const KEEP_MS = 3000; // re-roll window when the roll has at most one move
import {
  buildChain, ChainVerifier, dieFace, newSeed, rollerIndex, helperIndex, MAX_ROLLS,
} from "./fair.js?v=202611260632";

const seedKey = (code) => `fairsix:seed:${code}:${net.uid}`;

export async function makeSeed() {
  const seed = newSeed();
  const chain = await buildChain(seed);
  return { seed, chain, anchor: chain[0] };
}

export function saveSeed(code, seed) {
  try { localStorage.setItem(seedKey(code), seed); } catch { /* private mode: this device cannot resume */ }
}

export async function loadSeed(code) {
  let seed = null;
  try { seed = localStorage.getItem(seedKey(code)); } catch { /* storage blocked */ }
  if (!seed) return null;
  const chain = await buildChain(seed);
  return { seed, chain, anchor: chain[0] };
}

export class Room {
  constructor(code, secret, onChange) {
    this.code = code;
    this.secret = secret;          // {chain, anchor} or null when this device has no seed
    this.onChange = onChange;
    this.meta = null;
    this.seats = {};
    this.online = {};
    this.entries = [];
    this.rv = new Map();           // k -> {seat: hex}
    this.dice = new Map();         // log index -> face | false
    this.inflight = new Set();
    this.verifier = new ChainVerifier();
    this.state = null;
    this.applied = 0;
    this.pending = false;
    this.problem = null;
    this.revealed = new Set();
    this.busy = false;
    this.skipTried = -1;
    this.keepTried = -1;
    this.ticker = null;
  }

  get mySeat() {
    if (this.state) return this.state.players.find((p) => p.uid === net.uid)?.seat ?? -1;
    for (const [i, s] of Object.entries(this.seats)) if (s?.uid === net.uid) return Number(i);
    return -1;
  }

  start() {
    this.stop = net.watchRoom(this.code, {
      meta: (m) => { this.meta = m; this.emit(); },
      seats: (s) => { this.seats = s; this.checkStart(); this.emit(); },
      online: (o) => { this.online = o; this.emit(); },
      entry: (n, e) => { this.entries[n] = { ...e, _n: n }; this.advance(); },
      reveals: (k, obj) => { this.rv.set(k, obj); if (this.pending) this.advance(); else this.emit(); },
    });
    this.ticker = setInterval(() => { this.duties(); this.emit(); }, 500);
  }

  close() {
    clearInterval(this.ticker);
    this.stop?.();
  }

  emit() { this.onChange?.(this); }
  now() { return net.serverNow(); }

  // ---- replay ----

  checkStart() {
    const s0 = this.entries[0];
    if (s0 && s0.ver !== RULES_VERSION) {
      this.problem = "This game was started on a different version of Fairsix. Reload the page on every phone and start a new room.";
      return;
    }
    if (!s0 || !Object.keys(this.seats).length) return;
    for (const p of s0.players || []) {
      const seat = this.seats[p.seat];
      if (!seat || seat.uid !== p.uid || seat.anchor !== p.anchor) {
        this.problem = "The game's start record does not match the players who joined. Rolls in this room cannot be trusted.";
      }
      if (p.uid === net.uid && this.secret && p.anchor !== this.secret.anchor) {
        this.problem = "This game started with a different dice seal than the one this device made.";
      }
    }
  }

  advance() {
    if (!this.state) {
      const s0 = this.entries[0];
      if (!s0 || s0.a !== "start") { this.emit(); return; }
      this.state = newGame(s0);
      for (const p of s0.players) this.verifier.setAnchor(p.seat, p.anchor);
      this.applied = 1;
      this.checkStart();
    }
    const dieOf = (e) => this.dieOf(e);
    this.pending = false;
    while (this.entries[this.applied]) {
      const r = apply(this.state, this.entries[this.applied], dieOf);
      if (r === PENDING) { this.pending = true; break; }
      this.state = r;
      this.applied++;
    }
    this.emit();
    this.duties();
  }

  dieOf(e) {
    if (this.dice.has(e._n)) return this.dice.get(e._n);
    this.computeDie(e);
    return null;
  }

  async computeDie(e) {
    if (this.inflight.has(e._n)) return;
    const k = Number(e.k);
    const seats = Object.keys(e.w || {}).filter((s) => e.w[s] === true).map(Number);
    const values = {};
    for (const seat of seats) {
      if (seat === e.s) continue;
      const hex = this.rv.get(k)?.[seat];
      if (!hex) return; // not arrived yet; the reveals listener retries
      values[seat] = hex;
    }
    this.inflight.add(e._n);
    try {
      let ok = k >= 1 && k <= MAX_ROLLS && (await this.verifier.verify(e.s, rollerIndex(k), e.x));
      for (const seat of Object.keys(values)) {
        if (!ok) break;
        ok = await this.verifier.verify(Number(seat), helperIndex(k), values[seat]);
      }
      values[e.s] = e.x;
      this.dice.set(e._n, ok ? await dieFace(this.code, k, values) : false);
    } finally {
      this.inflight.delete(e._n);
    }
    this.advance();
  }

  // ---- this device's part ----

  others() {
    return this.state.players.filter((p) => present(p) && p.seat !== this.mySeat);
  }

  revealsIn(k) {
    const r = this.rv.get(k) || {};
    return this.others().filter((p) => r[p.seat]);
  }

  rollStatus() {
    const s = this.state;
    if (!s || s.over || this.pending || this.problem) return { can: false };
    if (s.phase !== "roll" || current(s).seat !== this.mySeat) return { can: false };
    if (!this.secret) return { can: false, why: "This device lost its dice seal for this room." };
    const others = this.others();
    const ready = this.revealsIn(s.k);
    const waited = net.serverNow() - s.turnTs >= REVEAL_MS + 300;
    const can = !this.busy && ready.length > 0 && (ready.length === others.length || waited);
    return { can, ready: ready.length, total: others.length, waiting: !can && !this.busy };
  }

  duties() {
    const s = this.state;
    if (!s || s.over || this.problem) return;
    const me = bySeat(s, this.mySeat);
    if (!me || !present(me) || !this.secret) return;
    const k = s.k;
    const cur = current(s);

    if (cur.seat !== me.seat && !this.revealed.has(k) && !(this.rv.get(k) || {})[me.seat]) {
      this.revealed.add(k);
      net.reveal(this.code, k, me.seat, this.secret.chain[helperIndex(k)]).catch(() => this.revealed.delete(k));
    }

    // Re-roll window: with nothing to roll and at most one possible move, keep the roll after a moment.
    if (cur.seat === me.seat && s.choice && (s.choice.three || (s.owed === 0 && poolMoves(s, me).length <= 1))
        && !this.busy && this.keepTried !== s.turnTs && net.serverNow() - s.turnTs >= KEEP_MS) {
      this.keepTried = s.turnTs;
      this.write({ a: "keep", s: me.seat });
    }

    // Time out an idle player. Others wait a little longer each, by seat order,
    // so usually only one device writes the skip.
    if (cur.seat !== me.seat && !this.pending && this.skipTried !== s.turnTs) {
      const rank = this.others().filter((p) => p.seat !== cur.seat).findIndex((p) => p.seat === me.seat);
      if (net.serverNow() - s.turnTs >= TURN_MS + 600 + 900 * Math.max(0, rank)) {
        this.skipTried = s.turnTs;
        this.write({ a: "skip", s: cur.seat });
      }
    }
  }

  async write(entry) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await net.append(this.code, this.entries.length, entry);
        return true;
      } catch (e) {
        if (e.message !== "taken") throw e;
        await new Promise((r) => setTimeout(r, 250));
        if (!this.stillValid(entry)) return false;
      }
    }
    return false;
  }

  stillValid(entry) {
    const s = this.state;
    if (!s || s.over) return false;
    if (entry.a === "leave") return true;
    if (entry.a === "skip") return current(s).seat === entry.s && net.serverNow() - s.turnTs >= TURN_MS;
    return current(s).seat === this.mySeat;
  }

  async roll() {
    const st = this.rollStatus();
    if (!st.can) return false;
    const s = this.state;
    const k = s.k;
    const r = this.rv.get(k) || {};
    const w = { [this.mySeat]: true };
    for (const p of this.others()) if (r[p.seat]) w[p.seat] = true;
    this.busy = true;
    this.emit();
    try {
      await net.append(this.code, this.entries.length, { a: "roll", s: this.mySeat, k: String(k), x: this.secret.chain[rollerIndex(k)], w });
      return true;
    } catch {
      return false; // a reveal or another entry landed first; the button comes back
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  // Die values this player can use right now (empty when a roll is owed).
  usableDice() {
    const s = this.state;
    if (!s || s.over || s.owed > 0 || current(s).seat !== this.mySeat || this.busy || s.choice?.three || this.pending) return [];
    const p = current(s);
    return [...new Set(s.pool)].filter((v) => legalMoves(s, p, v).length);
  }

  movable(v) {
    if (!this.usableDice().includes(v)) return [];
    return legalMoves(this.state, current(this.state), v);
  }

  async move(t, v) {
    if (!this.movable(v).length) return;
    this.busy = true;
    this.emit();
    try { await this.write({ a: "move", s: this.mySeat, t, v }); } finally { this.busy = false; this.emit(); }
  }

  canReroll() {
    const s = this.state;
    return !!s && !s.over && !this.pending && !this.busy && !!s.choice
      && current(s).seat === this.mySeat && current(s).rerolls > 0;
  }

  async reroll() {
    if (!this.canReroll()) return;
    this.busy = true;
    this.emit();
    try { await this.write({ a: "reroll", s: this.mySeat }); } finally { this.busy = false; this.emit(); }
  }

  leave() {
    if (this.state && !this.state.over && this.mySeat >= 0) return this.write({ a: "leave", s: this.mySeat });
    return Promise.resolve();
  }

  // ---- proof ----

  // Recomputes every accepted roll from scratch with a fresh verifier.
  async verifyAll(onProgress) {
    const s0 = this.entries[0];
    if (!s0) return { ok: 0, bad: 0 };
    const v = new ChainVerifier();
    for (const p of s0.players) v.setAnchor(p.seat, p.anchor);
    let ok = 0, bad = 0;
    const rolls = this.state?.rolls || [];
    const byK = new Map();
    for (const e of this.entries) if (e?.a === "roll") byK.set(`${e.k}:${e.s}`, e);
    for (let i = 0; i < rolls.length; i++) {
      const r = rolls[i];
      const e = byK.get(`${r.k}:${r.s}`);
      const values = { [e.s]: e.x };
      let good = await v.verify(e.s, rollerIndex(r.k), e.x);
      for (const seat of Object.keys(e.w)) {
        if (Number(seat) === e.s || e.w[seat] !== true) continue;
        const hex = this.rv.get(r.k)?.[seat];
        good = good && !!hex && (await v.verify(Number(seat), helperIndex(r.k), hex));
        values[seat] = hex;
      }
      good = good && (await dieFace(this.code, r.k, values)) === r.die;
      if (good) ok++; else bad++;
      if (i % 20 === 0) onProgress?.(i + 1, rolls.length);
    }
    return { ok, bad };
  }
}
