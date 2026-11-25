// Provably fair dice.
//
// Before the game starts, every player's device picks a secret 32-byte seed and
// builds a hash chain from it: x[N] = seed, x[i-1] = SHA-256(x[i]). Only the end
// of the chain, x[0] (the "anchor"), is published when the player joins.
//
// Roll k of the game uses x[2k-1] from every other player who revealed it in
// time (they reveal as soon as roll k becomes the next roll), then x[2k] from the
// roller, who reveals it by rolling. Each value is checked against the published
// anchor (hashing it i times must give x[0]), so nobody can change a value after
// joining, and nobody sees a value before it is revealed. Odd and even positions
// keep a player's helper reveal from ever exposing their own next roll value.
// The die face comes from SHA-256 over all revealed values, mapped to 1..6
// without modulo bias. Anyone can recompute every roll from the public log.

export const MAX_ROLLS = 4096;
export const CHAIN_LENGTH = 2 * MAX_ROLLS;
export const rollerIndex = (k) => 2 * k;
export const helperIndex = (k) => 2 * k - 1;
const enc = new TextEncoder();

export function toHex(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export const isHex64 = (s) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export function newSeed() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

// Returns the whole chain as hex strings, index 0 (anchor) .. n (seed).
export async function buildChain(seedHex, n = CHAIN_LENGTH) {
  const chain = new Array(n + 1);
  let cur = fromHex(seedHex);
  chain[n] = seedHex;
  for (let i = n - 1; i >= 0; i--) {
    cur = await sha256(cur);
    chain[i] = toHex(cur);
  }
  return chain;
}

// Checks revealed chain values against each seat's anchor. Remembers every value
// it has verified, so checking roll k usually costs one hash.
export class ChainVerifier {
  constructor() {
    this.known = new Map(); // seat -> Map(index -> hex)
  }

  setAnchor(seat, anchor) {
    if (!this.known.has(seat)) this.known.set(seat, new Map([[0, anchor]]));
  }

  async verify(seat, k, hex) {
    const m = this.known.get(seat);
    if (!m || !isHex64(hex) || !Number.isInteger(k) || k < 1 || k > CHAIN_LENGTH) return false;
    if (m.has(k)) return m.get(k) === hex;
    let j = -1;
    for (const idx of m.keys()) if (idx < k && idx > j) j = idx;
    const steps = [];
    let cur = fromHex(hex);
    steps.push(hex);
    for (let i = k; i > j; i--) {
      cur = await sha256(cur);
      steps.push(toHex(cur));
    }
    // steps[0] = x[k], steps[k - j] should equal x[j]
    if (steps[k - j] !== m.get(j)) return false;
    for (let i = 0; i < k - j; i++) m.set(k - i, steps[i]);
    return true;
  }
}

// The die for roll k: SHA-256 over the room code, k and every included seat's
// value (the roller's x[2k], the others' x[2k-1]) in seat order. The first byte below 252 (= 42 * 6) decides the face;
// bytes 252..255 are skipped so each face has probability exactly 1/6.
export async function dieFace(code, k, reveals) {
  const seats = Object.keys(reveals).map(Number).sort((a, b) => a - b);
  let msg = `fairsix|v1|${code}|${k}|` + seats.map((s) => `${s}:${reveals[s]}`).join(",");
  for (;;) {
    const h = await sha256(enc.encode(msg));
    for (const b of h) if (b < 252) return (b % 6) + 1;
    msg = toHex(h); // all 32 bytes >= 252: probability (4/256)^32, rehash
  }
}
