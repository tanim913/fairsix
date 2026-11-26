// Firebase access: anonymous sign-in, rooms, the action log and reveals.
import {
  initializeApp, initializeAuth, browserLocalPersistence, signInAnonymously, onAuthStateChanged,
  getDatabase, ref, get, set, update, remove, onValue, onChildAdded, onChildChanged,
  onDisconnect, serverTimestamp, forceWebSockets,
} from "../vendor/firebase.js?v=202611260704";
import { firebaseConfig } from "./config.js?v=202611260704";

let db = null;
export let uid = null;
let offset = 0;
let connected = false;
const connListeners = new Set();

export const serverNow = () => Date.now() + offset;
export const isConnected = () => connected;
export function onConnection(fn) { connListeners.add(fn); fn(connected); return () => connListeners.delete(fn); }

let connecting = null;
export function connect() {
  connecting ||= doConnect().catch((e) => { connecting = null; throw e; });
  return connecting;
}

// Rejects with a named error instead of waiting forever.
export function within(p, ms, what) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out`)), ms); })]).finally(() => clearTimeout(t));
}

let app = null, auth = null;
async function doConnect() {
  app ||= initializeApp(firebaseConfig);
  auth ||= initializeAuth(app, { persistence: browserLocalPersistence });
  if (!db) {
    // WebSockets only. After one dropped socket (a phone backgrounding the app or
    // switching networks) the SDK otherwise remembers a "failure" and starts with
    // long polling, which loads scripts from the database host; this page's CSP
    // blocks those, so the database would never answer again on that device.
    try { localStorage.removeItem("firebase:previous_websocket_failure"); } catch { /* storage blocked */ }
    forceWebSockets();
    db = getDatabase(app);
  }
  uid = await within(new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) { stop(); resolve(user.uid); }
    });
    signInIfNeeded(auth).catch((e) => { stop(); reject(e); });
  }), 15000, "sign-in");
  // The database picks up the sign-in token a moment after sign-in completes.
  // Wait until a read that needs it succeeds, so the first real write is not refused.
  let ok = false, last = null;
  for (let i = 0; i < 12 && !ok; i++) {
    try { await within(get(ref(db, "rooms/000000/meta")), 6000, "database"); ok = true; }
    catch (e) { last = e; await new Promise((r) => setTimeout(r, 150 + i * 50)); }
  }
  if (!ok) throw new Error(`database: ${last?.message || "no answer"}`);
  onValue(ref(db, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
  onValue(ref(db, ".info/connected"), (s) => {
    connected = s.val() === true;
    connListeners.forEach((fn) => fn(connected));
  });
  return uid;
}

async function signInIfNeeded(auth) {
  await auth.authStateReady?.();
  if (!auth.currentUser) await signInAnonymously(auth);
}

const roomRef = (code, path = "") => ref(db, `rooms/${code}${path ? "/" + path : ""}`);

export function randomCode() {
  // 6 digits, no modulo bias: draw 32-bit values below the largest multiple of 900000.
  const limit = Math.floor(2 ** 32 / 900000) * 900000;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return String(100000 + (buf[0] % 900000));
}

export async function createRoom({ mode, cap, name, anchor, dice, rerolls = 3 }) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    try {
      await set(roomRef(code), {
        meta: { host: uid, mode, cap, rerolls, created: serverTimestamp(), status: "lobby" },
        seats: { 0: { uid, name, anchor, dice, joined: serverTimestamp() } },
      });
      return code;
    } catch (e) {
      if (!String(e?.message || e).includes("PERMISSION_DENIED")) throw e;
    }
  }
  throw new Error("Could not find a free room code. Try again.");
}

export async function readRoom(code) {
  const snap = await within(get(roomRef(code, "meta")), 12000, "reading the room");
  if (!snap.exists()) return null;
  const seats = (await within(get(roomRef(code, "seats")), 12000, "reading the seats")).val() || {};
  return { meta: snap.val(), seats };
}

export async function takeSeat(code, cap, seats, name, anchor, dice) {
  for (let i = 0; i < cap; i++) {
    if (seats[i]) continue;
    try {
      await set(roomRef(code, `seats/${i}`), { uid, name, anchor, dice, joined: serverTimestamp() });
      return i;
    } catch (e) {
      if (!String(e?.message || e).includes("PERMISSION_DENIED")) throw e;
    }
  }
  return -1;
}

export const updateSeat = (code, seat, patch) => update(roomRef(code, `seats/${seat}`), patch);
export const leaveSeat = (code, seat) => remove(roomRef(code, `seats/${seat}`));
export const setMeta = (code, patch) => update(roomRef(code, "meta"), patch);

export function startGame(code, start) {
  return update(roomRef(code), {
    "meta/status": "live",
    "log/0": { ...start, u: uid, ts: serverTimestamp() },
  });
}

// Appends at index n. Rejects with "taken" when someone else wrote there first.
export async function append(code, n, entry) {
  try {
    await set(roomRef(code, `log/${n}`), { ...entry, u: uid, ts: serverTimestamp() });
  } catch (e) {
    if (String(e?.message || e).includes("PERMISSION_DENIED")) throw new Error("taken");
    throw e;
  }
}

export async function reveal(code, k, seat, hex) {
  try {
    await set(roomRef(code, `rv/${k}/${seat}`), hex);
  } catch (e) {
    if (!String(e?.message || e).includes("PERMISSION_DENIED")) throw e; // already there
  }
}

// Subscribes to everything a room client needs. Returns an unsubscribe function.
export function watchRoom(code, h) {
  const stops = [];
  stops.push(onValue(roomRef(code, "meta"), (s) => h.meta?.(s.val())));
  stops.push(onValue(roomRef(code, "seats"), (s) => h.seats?.(s.val() || {})));
  stops.push(onValue(roomRef(code, "on"), (s) => h.online?.(s.val() || {})));
  stops.push(onChildAdded(roomRef(code, "log"), (s) => h.entry?.(Number(s.key), s.val())));
  const rv = (s) => h.reveals?.(Number(s.key), s.val() || {});
  stops.push(onChildAdded(roomRef(code, "rv"), rv));
  stops.push(onChildChanged(roomRef(code, "rv"), rv));

  const me = roomRef(code, `on/${uid}`);
  const markOnline = (isOn) => {
    if (!isOn) return;
    onDisconnect(me).remove().then(() => set(me, true)).catch(() => {});
  };
  stops.push(onConnection(markOnline));
  return () => {
    stops.forEach((f) => { try { f(); } catch { /* already stopped */ } });
    remove(me).catch(() => {});
  };
}
