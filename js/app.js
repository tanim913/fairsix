import * as net from "./net.js?v=202611260704";
import { Room, makeSeed, saveSeed, loadSeed, KEEP_MS } from "./game.js?v=202611260704";
import { LocalRoom, newSoloGame, savedGame, clearSaved } from "./solo.js?v=202611260704";
import { drawBoard, showLive, Tokens, tokenCell, moveChain } from "./render.js?v=202611260704";
import { current, present, bySeat, MODES, TURN_MS, RULES_VERSION, legalMoves } from "./rules.js?v=202611260704";
import { HOME, cornersFor } from "./board.js?v=202611260704";
import { sfx, unlock, isMuted, setMuted } from "./sfx.js?v=202611260704";

export const APP_VERSION = "202611260704";
const COLOR = ["Ruby", "Green", "Amber", "Cobalt"];
const SKINS = [
  { id: "glass", name: "Glass" },
  { id: "marbles", name: "Marbles" },
  { id: "kitty", name: "Kitty" },
  { id: "mochi", name: "Mochi" },
  { id: "starry", name: "Starry" },
];
const SKIN_IDS = SKINS.map((k) => k.id);
const REROLL_OPTIONS = [0, 1, 3, 5];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtCode = (c) => `${c.slice(0, 3)} ${c.slice(3)}`;
const ordinal = (n) => ["", "1st", "2nd", "3rd", "4th"][n] || `${n}th`;
const marble = (corner, extra = "", face = true) =>
  `<span class="guti-demo c${corner} ${extra}" aria-hidden="true">${face ? '<span class="eyes"><i></i><i></i></span>' : ""}</span>`;
const pips = "<i></i>".repeat(9);
const miniDie = (skin, face, extra = "") => `<span class="mini-die skin-${skinOf(skin)} ${extra}" data-face="${face}" aria-hidden="true">${pips}</span>`;
const skinOf = (k) => (SKIN_IDS.includes(k) ? k : "glass");

let room = null;
let tokens = null;
let boardKey = "";
let shownRolls = -1;
let eventSeq = -1;
let lastTurnKey = "";
let resultShown = false;
let rafPending = false;
let wakeLock = null;
let holdUntil = 0;           // tokens wait for the die to land
let mixingSeat = null;       // whose die is tumbling right now
let lastPlayerCount = 0;
let settingsKey = "";
let diceKey = "";
const secrets = new Map();   // code -> secret made on this page load
let pendingName = "-";
let selV = null;             // a die the player picked to filter by (null: any die)

let myDice = "glass";
try { myDice = skinOf(localStorage.getItem("fairsix:dice")); } catch { /* default */ }

// ---------- small UI helpers ----------

function setView(v) {
  document.body.dataset.view = v;
  if (v !== "game") releaseWake();
}

let toastTimer;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function msg(id, text, err = false) {
  const m = $(id);
  m.textContent = text || "";
  m.classList.toggle("err", !!err);
}

function nameOf(p) {
  return !p.name || p.name === "-" ? COLOR[p.corner] : p.name;
}

function cleanName(v) {
  const s = (v || "").trim().replace(/\s+/g, " ").slice(0, 16);
  return s || "-";
}

async function requestWake() {
  try {
    if (!wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch { /* not allowed: fine */ }
}
function releaseWake() { wakeLock?.release().catch(() => {}); wakeLock = null; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && document.body.dataset.view === "game") requestWake(); });

// Audio can only start after a tap.
document.addEventListener("pointerdown", unlock, { passive: true });
document.addEventListener("keydown", unlock);

// ---------- theme, sound, sheets ----------

$("theme").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("fairsix:theme", root.dataset.theme); } catch { /* not saved */ }
});

function showMute() {
  $("mute").setAttribute("aria-pressed", String(isMuted()));
  $("mute").setAttribute("aria-label", isMuted() ? "Sound and vibration off" : "Sound and vibration on");
}
$("mute").addEventListener("click", () => { setMuted(!isMuted()); showMute(); if (!isMuted()) { unlock(); sfx.tap(); } });
showMute();

for (const d of document.querySelectorAll("dialog.sheet")) {
  d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
}
$("open-rules").addEventListener("click", () => $("rules").showModal());
$("open-proof").addEventListener("click", openProof);
$("result-proof-btn").addEventListener("click", () => { $("result").close(); openProof(); });
$("result-close").addEventListener("click", () => $("result").close());
$("again").addEventListener("click", () => {
  $("result").close();
  if (room?.solo && lastSolo) startSolo(lastSolo); else leaveToHome();
});
$("brand").addEventListener("click", (e) => { e.preventDefault(); leaveToHome(); });

// ---------- home ----------

$("join-code").addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 6);
  e.target.value = d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
  msg("join-msg", "");
});

$("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = $("create-btn");
  btn.disabled = true;
  btn.textContent = "Sealing your dice…";
  try {
    await net.connect();
    const secret = await makeSeed();
    const code = await net.createRoom({ mode: f.get("mode"), cap: Number(f.get("cap")), name: cleanName(f.get("name")), anchor: secret.anchor, dice: myDice });
    saveSeed(code, secret.seed);
    secrets.set(code, secret);
    location.hash = code;
  } catch (err) {
    toast(err.message || "Could not make a room. Check your connection.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Make a room";
  }
});

$("join-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = $("join-code").value.replace(/\D/g, "");
  if (code.length !== 6) { msg("join-msg", "Room codes have 6 digits.", true); return; }
  pendingName = cleanName($("join-name").value);
  if (location.hash.replace("#", "") === code) route(); else location.hash = code;
});

// ---------- routing ----------

function route() {
  const code = location.hash.replace(/\D/g, "");
  if (location.hash === "#computer") openSolo();
  else if (code.length === 6) openRoom(code);
  else { closeRoom(); setView("home"); $("bar-mid").innerHTML = ""; showResume(); }
}

// ---------- play the computer ----------

const SOLO_DICE = ["kitty", "mochi", "starry", "marbles", "glass"];
let lastSolo = null;

function showResume() {
  const g = savedGame();
  $("solo-resume").hidden = !g || g.entries.length < 2;
}

async function startSolo(opts) {
  const btn = $("solo-btn");
  btn.disabled = true;
  btn.textContent = "Sealing the dice…";
  try {
    lastSolo = opts;
    await newSoloGame({ ...opts, dice: myDice, botDice: SOLO_DICE.find((d) => d !== myDice) });
    if (location.hash === "#computer") { closeRoom(); route(); } else location.hash = "computer";
  } catch (err) {
    toast("Could not start the game.");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Play";
  }
}

// The same die picker as in a room's lobby, for games against the computer.
function renderSoloDice() {
  $("solo-dice").innerHTML = `<fieldset class="dice-pick"><legend class="label">Your die <em>looks only, never the luck</em></legend>${SKINS.map((k) =>
    `<label><input type="radio" name="sdice" value="${k.id}" ${myDice === k.id ? "checked" : ""}>${miniDie(k.id, k.id === "kitty" ? 1 : 5)}<span>${k.name}</span></label>`).join("")}</fieldset>`;
  $("solo-dice").querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
    myDice = inp.value;
    try { localStorage.setItem("fairsix:dice", myDice); } catch { /* not saved */ }
    sfx.tap();
  }));
}
renderSoloDice();

$("solo-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  clearSaved();
  startSolo({ mode: f.get("smode"), level: f.get("level"), rerolls: 3 });
});
$("solo-resume").addEventListener("click", () => { location.hash = "computer"; });

async function openSolo() {
  if (room?.solo) return;
  closeRoom();
  const g = savedGame();
  if (!g) { history.replaceState(null, "", location.pathname); setView("home"); showResume(); return; }
  lastSolo = { mode: g.entries[0].mode, level: g.level, rerolls: g.entries[0].rerolls };
  room = new LocalRoom(g, schedule);
  await room.start();
  schedule();
}

function leaveToHome() {
  history.pushState(null, "", location.pathname);
  route();
}

function closeRoom() {
  room?.close();
  room = null;
  boardKey = "";
  shownRolls = -1;
  eventSeq = -1;
  lastTurnKey = "";
  resultShown = false;
  holdUntil = 0;
  mixingSeat = null;
  lastPlayerCount = 0;
  settingsKey = "";
  diceKey = "";
  if (tokens) { $("tokens").innerHTML = ""; tokens = null; }
}

async function openRoom(code) {
  if (room?.code === code) return;
  closeRoom();
  setView("home");
  msg("join-msg", "Opening room…");
  try {
    await net.connect();
    const info = await net.readRoom(code);
    if (!info) { msg("join-msg", "No room has that code. Check the digits.", true); history.replaceState(null, "", location.pathname); return; }
    const mine = Object.entries(info.seats).find(([, s]) => s?.uid === net.uid);
    let secret = secrets.get(code) || null;
    if (mine && !secret) secret = await loadSeed(code);
    if (!mine && info.meta.status === "lobby") {
      const seated = Object.values(info.seats).filter(Boolean).length;
      if (seated >= info.meta.cap) { msg("join-msg", "That room is full.", true); history.replaceState(null, "", location.pathname); return; }
      msg("join-msg", "Sealing your dice…");
      secret = await makeSeed();
      const seat = await net.takeSeat(code, info.meta.cap, info.seats, pendingName, secret.anchor, myDice);
      if (seat < 0) { msg("join-msg", "That room just filled up.", true); history.replaceState(null, "", location.pathname); return; }
      saveSeed(code, secret.seed);
      secrets.set(code, secret);
    }
    msg("join-msg", "");
    room = new Room(code, secret, schedule);
    room.start();
    schedule();
  } catch (err) {
    msg("join-msg", `Could not open the room (${err?.code || err?.message || err}). Check your connection and try again.`, true);
    console.error(err);
  }
}

function schedule() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; render(); });
}

function render() {
  if (!room) return;
  if (!room.state) renderLobby();
  else renderGame();
}

// ---------- lobby ----------

function lobbyPlayers() {
  const seated = Object.entries(room.seats).filter(([, s]) => s).map(([i, s]) => ({ seat: Number(i), ...s })).sort((a, b) => a.seat - b.seat);
  const corners = cornersFor(Math.max(2, seated.length));
  seated.forEach((p, i) => { p.corner = corners[i] ?? i; });
  return seated;
}

function renderLobby() {
  const m = room.meta;
  if (!m) return;
  setView("lobby");
  const players = lobbyPlayers();
  const isHost = m.host === net.uid;
  const me = players.find((p) => p.uid === net.uid);
  const rerolls = m.rerolls ?? 0;
  $("lobby-code").textContent = fmtCode(room.code);
  $("bar-mid").innerHTML = `<span class="room-pill">${fmtCode(room.code)} <small>${MODES[m.mode].label}</small></span>`;
  if (players.length > lastPlayerCount && lastPlayerCount) sfx.join();
  lastPlayerCount = players.length;

  let rows = "";
  for (let i = 0; i < m.cap; i++) {
    const p = players.find((q) => q.seat === i);
    if (!p) { rows += `<li class="seat-row empty"><span class="hole" aria-hidden="true"></span><span>Waiting for a player</span></li>`; continue; }
    const tags = [p.uid === m.host ? '<span class="tag">Host</span>' : "", p.uid === net.uid ? '<span class="tag">You</span>' : "", room.online[p.uid] ? "" : '<span class="tag">Away</span>'].join("");
    rows += `<li class="seat-row ${p.uid === net.uid ? "me" : ""}">${marble(p.corner)}<b>${esc(nameOf(p))}</b><span class="tags">${tags}${miniDie(p.dice, 5)}</span></li>`;
  }
  $("seat-list").innerHTML = rows;

  // Die picker for this player.
  const dk = `${me ? me.seat : -1}|${me?.dice}`;
  if (dk !== diceKey) {
    diceKey = dk;
    if (!me) $("dice-pick-wrap").innerHTML = "";
    else {
      $("dice-pick-wrap").innerHTML = `<fieldset class="dice-pick"><legend class="label">Your die <em>looks only, never the luck</em></legend>${SKINS.map((k) =>
        `<label><input type="radio" name="dice" value="${k.id}" ${skinOf(me.dice) === k.id ? "checked" : ""}>${miniDie(k.id, k.id === "kitty" ? 1 : 5)}<span>${k.name}</span></label>`).join("")}</fieldset>`;
      $("dice-pick-wrap").querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
        myDice = inp.value;
        try { localStorage.setItem("fairsix:dice", myDice); } catch { /* not saved */ }
        renderSoloDice();
        sfx.tap();
        net.updateSeat(room.code, me.seat, { dice: myDice }).catch(() => toast("Could not change your die. Try again."));
      }));
    }
  }

  const key = `${isHost}|${m.mode}|${m.cap}|${rerolls}|${players.length}|${Math.max(-1, ...players.map((p) => p.seat))}`;
  if (key !== settingsKey) {
    settingsKey = key;
    if (isHost) {
      const minCap = Math.max(2, players.length, Math.max(0, ...players.map((p) => p.seat)) + 1);
      $("lobby-settings").innerHTML = `
        <fieldset class="seg" aria-label="Game mode"><legend class="label">Mode</legend>
          <label><input type="radio" name="lmode" value="classic" ${m.mode === "classic" ? "checked" : ""}><span>Classic<small>All four pieces home</small></span></label>
          <label><input type="radio" name="lmode" value="arrow" ${m.mode === "arrow" ? "checked" : ""}><span>Arrow<small>Shortcut arrows home</small></span></label>
        </fieldset>
        <fieldset class="seg seg-n" aria-label="Players"><legend class="label">Players</legend>
          ${[2, 3, 4].map((n) => `<label><input type="radio" name="lcap" value="${n}" ${m.cap === n ? "checked" : ""} ${n < minCap ? "disabled" : ""}><span>${n}</span></label>`).join("")}
        </fieldset>
        <fieldset class="seg seg-4" aria-label="Re-rolls for each player"><legend class="label">Re-rolls each <em>same for everyone</em></legend>
          ${REROLL_OPTIONS.map((n) => `<label><input type="radio" name="lrr" value="${n}" ${rerolls === n ? "checked" : ""}><span>${n === 0 ? "Off" : n}</span></label>`).join("")}
        </fieldset>`;
      $("lobby-settings").querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
        const patch = inp.name === "lmode" ? { mode: inp.value } : inp.name === "lcap" ? { cap: Number(inp.value) } : { rerolls: Number(inp.value) };
        sfx.tap();
        net.setMeta(room.code, patch).catch(() => toast("Could not change that. Try again."));
      }));
    } else {
      $("lobby-settings").innerHTML = `<p class="fine">${MODES[m.mode].label} · up to ${m.cap} players · ${rerolls ? `${rerolls} re-roll${rerolls > 1 ? "s" : ""} each` : "no re-rolls"}. The host picks the rules.</p>`;
    }
  }

  const start = $("start-btn");
  start.hidden = !isHost;
  start.disabled = players.length < 2;
  const hostHere = players.some((p) => p.uid === m.host);
  if (!me) msg("lobby-msg", "You are watching this room.");
  else if (!hostHere) msg("lobby-msg", "The host left this room. Make a new room to play.", true);
  else if (isHost) msg("lobby-msg", players.length < 2 ? "Share the code. You can start once someone joins." : `${players.length} players ready. Start whenever you like.`);
  else msg("lobby-msg", "Waiting for the host to start.");
}

$("start-btn").addEventListener("click", async () => {
  const players = lobbyPlayers().map(({ seat, uid, name, anchor, dice }) => ({ seat, uid, name, anchor, dice: skinOf(dice) }));
  if (players.length < 2) return;
  $("start-btn").disabled = true;
  try {
    await net.startGame(room.code, { a: "start", ver: RULES_VERSION, mode: room.meta.mode, code: room.code, rerolls: room.meta.rerolls ?? 0, players });
  } catch {
    toast("Could not start. Someone may have just joined or left.");
    $("start-btn").disabled = false;
  }
});

$("lobby-leave").addEventListener("click", async () => {
  const seat = Object.entries(room?.seats || {}).find(([, s]) => s?.uid === net.uid)?.[0];
  if (room && seat !== undefined) await net.leaveSeat(room.code, seat).catch(() => {});
  leaveToHome();
});

$("copy-code").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(room.code); toast("Code copied"); } catch { toast(fmtCode(room.code)); }
});
$("share-link").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}#${room.code}`;
  const text = `Join my Fairsix Ludo room: ${fmtCode(room.code)}`;
  try {
    if (window.FairsixAndroid?.share) window.FairsixAndroid.share(`${text}\n${url}`);
    else if (navigator.share) await navigator.share({ title: "Fairsix", text, url });
    else { await navigator.clipboard.writeText(`${text}\n${url}`); toast("Link copied"); }
  } catch { /* share sheet closed */ }
});

// ---------- game ----------

function ensureBoard(s) {
  const used = s.players.map((p) => p.corner);
  const me = bySeat(s, room.mySeat);
  const rot = me ? (3 - me.corner + 4) % 4 : 0; // your colour bottom-left
  const key = `${s.mode}|${used.join(",")}|${rot}`;
  if (key === boardKey) return;
  boardKey = key;
  drawBoard($("board"), s.mode, used, rot);
  $("tokens").innerHTML = "";
  tokens = new Tokens($("tokens"), $("board-wrap"), (seat, t) => onPick(seat, t));
  tokens.rot = rot;
  tokens.onStep = (i, n, fly) => {
    if (fly) sfx.arrow();
    else sfx.hop(i);
    if (i === n - 1) sfx.stepBuzz();
  };
}

// Dice that can move this guti right now (respecting a die the player picked).
function fitsFor(s, p, t) {
  const pos = p.tokens[t];
  return room.usableDice().filter((d) => (selV === null || d === selV) && legalMoves(s, p, d).some((x) => p.tokens[x.t] === pos));
}

function onPick(seat, t) {
  if (!room || seat !== room.mySeat) return;
  const s = room.state;
  const p = bySeat(s, seat);
  const fits = fitsFor(s, p, t);
  if (!fits.length) return;
  if (fits.length === 1) { closeChooser(); moveWith(p, t, fits[0]); return; }
  sfx.tap();
  openChooser(p, t, fits);
}

function moveWith(p, t, v) {
  const pos = p.tokens[t];
  const m = room.movable(v).find((x) => p.tokens[x.t] === pos);
  if (m) { sfx.tap(); room.move(m.t, v); }
}

// A little bubble beside the tapped guti offering each die that can move it.
let chooser = null;
function openChooser(p, t, fits) {
  chooser = { seat: p.seat, t, fits, pos: p.tokens[t] };
  const el = $("chooser");
  const [x, y] = tokens.view(...tokenCell(p.corner, p.tokens[t], t));
  const u = $("board-wrap").clientWidth / 15;
  el.innerHTML = fits.map((v) => `<button type="button" data-v="${v}" aria-label="Move ${v}">${miniDie(p.dice, v)}<span>${v}</span></button>`).join("");
  el.style.left = `${x * u}px`;
  el.style.top = `${y * u}px`;
  el.classList.toggle("below", y < 3);
  el.hidden = false;
  schedule();
}
function closeChooser() {
  if (!chooser) return;
  chooser = null;
  $("chooser").hidden = true;
  schedule();
}
$("chooser").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]");
  if (!b || !chooser || !room?.state) return;
  const p = bySeat(room.state, chooser.seat);
  const { t } = chooser;
  closeChooser();
  moveWith(p, t, Number(b.dataset.v));
});
document.addEventListener("pointerdown", (e) => {
  if (chooser && !e.target.closest("#chooser") && !e.target.closest(".guti")) closeChooser();
});

function eventText(s, ev) {
  if (!ev) return "";
  const who = (seat) => { const p = bySeat(s, seat); return p ? nameOf(p) : "Someone"; };
  switch (ev.type) {
    case "rolled": return `${who(ev.seat)} rolled ${ev.die}${ev.again ? ". Roll again!" : ""}`;
    case "reroll": return `${who(ev.seat)} re-rolled a ${ev.die}`;
    case "nomove": return `${who(ev.seat)} rolled ${(ev.dice || [ev.die]).join(" + ")}. No move.`;
    case "three6": return `${who(ev.seat)} rolled a third 6. Turn over.`;
    case "timeout": return `${who(ev.seat)} ran out of time.`;
    case "out": return `${who(ev.seat)} missed three turns and is out.`;
    case "left": return `${who(ev.seat)} left the game.`;
    case "auto": return ev.seat === room.mySeat ? "Auto-play is on. Tap I'm back to play again." : `${who(ev.seat)} is on auto-play.`;
    case "back": return ev.seat === room.mySeat ? "You're back." : `${who(ev.seat)} is back.`;
    case "move": {
      if (ev.caps?.length) return `${who(ev.seat)} captured ${ev.caps.map((c) => who(c.seat)).join(" and ")}!`;
      if (ev.finished) return `${who(ev.seat)} finished!`;
      if (ev.home) return `${who(ev.seat)} brought a piece home.`;
      if (ev.arrow) return `${who(ev.seat)} flew up an arrow.`;
      return `${who(ev.seat)} moved ${ev.die}${ev.timeout ? " (timed out)" : ""}.`;
    }
    default: return "";
  }
}

// Sounds for an entry: each move in a chain sounds when its hop lands.
function eventSound(s, ev) {
  if (!ev) return;
  const me = room.mySeat;
  for (const { ev: m, at, hopMs } of moveChain(s)) {
    const t = at + hopMs;
    if (m.caps?.length) setTimeout(() => (m.caps.some((c) => c.seat === me) ? sfx.captured() : sfx.capture()), t);
    else if (m.home || m.finished) setTimeout(() => sfx.home(), t);
  }
  if (ev.type === "nomove") sfx.nomove();
  else if (ev.type === "three6") sfx.three6();
  else if (ev.type === "reroll") sfx.tap();
}

function animateBar(el, turnTs, key) {
  const remaining = Math.max(0, TURN_MS - (room.now() - turnTs));
  el.getAnimations().forEach((a) => a.cancel());
  el.animate([{ transform: `scaleX(${remaining / TURN_MS})` }, { transform: "scaleX(0)" }], { duration: remaining, fill: "forwards" });
  el.dataset.key = key;
}

function lastRollOf(s, seat) {
  for (let i = s.rolls.length - 1; i >= 0; i--) if (s.rolls[i].s === seat) return s.rolls[i];
  return null;
}

function renderGame() {
  const s = room.state;
  setView("game");
  requestWake();
  ensureBoard(s);
  const me = bySeat(s, room.mySeat);
  const cur = current(s);
  const myTurn = !s.over && cur.seat === room.mySeat;
  for (const p of s.players) p.label = nameOf(p);
  const now = Date.now();

  $("bar-mid").innerHTML = `<span class="room-pill">${room.solo ? "Computer" : fmtCode(room.code)} <small>${MODES[s.mode].label}</small></span>`;

  // A new roll: seal-and-mix, then let the board catch up.
  const last = s.rolls[s.rolls.length - 1];
  if (shownRolls === -1) { shownRolls = s.rolls.length; if (last) setFace(last.die, bySeat(s, last.s)?.dice); }
  else if (s.rolls.length > shownRolls) {
    const jump = s.rolls.length - shownRolls > 1;
    shownRolls = s.rolls.length;
    if (jump) setFace(last.die, bySeat(s, last.s)?.dice);
    else holdUntil = now + sealAndMix(s, last);
  }
  const holding = now < holdUntil;
  if (holding) setTimeout(schedule, holdUntil - now + 10);
  const rollingSeat = room.pending ? cur.seat : holding ? mixingSeat : null;

  // seats: each with its own live die
  const need = MODES[s.mode].tokensToWin;
  const rr = s.players.some((p) => p.rerolls > 0) || (room.entries[0]?.rerolls ?? 0) > 0;
  $("seats").style.setProperty("--n", s.players.length);
  $("seats").innerHTML = s.players.map((p) => {
    const homes = p.tokens.filter((x) => x === HOME).length;
    let sub;
    if (p.place) sub = ordinal(p.place);
    else if (p.left) sub = "Left";
    else if (p.out) sub = "Out";
    else if (!s.over && p.seat === cur.seat) sub = p.auto ? "Auto-play" : p.seat === room.mySeat ? "Your turn" : s.owed > 0 ? "Rolling" : "Moving";
    else if (p.auto && present(p)) sub = "Auto-play";
    else if (!room.online[p.uid]) sub = "Away";
    else sub = p.seat === room.mySeat ? "You" : "Waiting";
    if (rr && !p.place && present(p)) sub += ` · ${p.rerolls} re-roll${p.rerolls === 1 ? "" : "s"}`;
    const dots = Array.from({ length: need === 1 ? 1 : 4 }, (_, i) => `<span class="${i < homes ? "in" : ""}"></span>`).join("");
    const turn = !s.over && p.seat === cur.seat;
    const lr = lastRollOf(s, p.seat);
    const face = rollingSeat === p.seat ? 0 : lr ? lr.die : 0;
    return `<li class="seat c${p.corner} ${turn ? "turn" : ""} ${p.seat === room.mySeat ? "mine" : ""} ${present(p) || p.place ? "" : "gone"}">${marble(p.corner)}<span class="seat-text"><b>${esc(nameOf(p))}</b><small>${sub}</small></span><span class="homes" aria-label="${homes} home">${dots}${p.seat === room.mySeat ? '<em class="you">you</em>' : ""}</span>${miniDie(p.dice, face, rollingSeat === p.seat ? "tumble" : "")}${turn && !room.solo ? '<span class="tbar"></span>' : ""}</li>`;
  }).join("");

  // turn timer
  const turnKey = `${s.turnTs}|${cur.seat}|${s.phase}`;
  const tb = document.querySelector("#seats .tbar");
  $("timer").hidden = !!room.solo;
  if (!s.over && !room.solo) {
    if (tb) animateBar(tb, s.turnTs, turnKey);
    const timer = $("timer").firstElementChild;
    $("timer").style.setProperty("--c", `var(--c${cur.corner})`);
    if (timer.dataset.key !== turnKey) animateBar(timer, s.turnTs, turnKey);
  }
  if (turnKey !== lastTurnKey) {
    const was = lastTurnKey;
    lastTurnKey = turnKey;
    if (myTurn && was && s.phase === "roll" && Number(was.split("|")[1]) !== cur.seat) sfx.yourTurn();
  }

  if (!holding) $("die").classList.toggle("tumble", (room.busy && myTurn && s.phase === "roll") || room.pending);

  // guti and events wait until the die has landed
  const usable = room.usableDice();
  if (selV !== null && !usable.includes(selV)) selV = null;
  const dice = selV === null ? usable : [selV];
  const moves = dice.flatMap((v) => room.movable(v).map((m) => ({ ...m, v })));
  if (chooser && (!myTurn || !usable.length || me?.tokens[chooser.t] !== chooser.pos)) { chooser = null; $("chooser").hidden = true; }
  if (!holding) {
    const movable = new Set();
    const live = [];
    if (me && moves.length) {
      for (const m of moves) me.tokens.forEach((pos, t) => { if (pos === me.tokens[m.t]) movable.add(`${me.seat}:${t}`); });
      // Light up landing squares: for the guti whose chooser is open, or when there is only one die.
      const shown = chooser ? moves.filter((m) => me.tokens[m.t] === chooser.pos && chooser.fits.includes(m.v)) : dice.length === 1 ? moves : [];
      for (const m of shown) live.push(tokenCell(me.corner, m.pos, 0));
    }
    tokens.render(s, movable, true);
    showLive($("board"), live);

    if (s.event && s.seq !== eventSeq) {
      const first = eventSeq === -1;
      eventSeq = s.seq;
      const text = eventText(s, s.event);
      $("status").dataset.text = text;
      if (!first) {
        eventSound(s, s.event);
        if (s.event.caps?.length || s.event.type === "out" || s.event.type === "three6" || s.event.finished
            || (s.event.type === "auto" && s.event.seat === room.mySeat)) toast(text);
      }
    }
  }

  // roll button, tappable die, dice pool, re-roll
  const roll = $("roll");
  roll.className = "roll";
  const st = room.rollStatus();
  let label;
  const away = !!me?.auto && !s.over && present(me);
  if (s.over) label = "Game over";
  else if (!me) label = "Watching";
  else if (away) { label = "I'm back"; roll.classList.add("ready", "back", `c${me.corner}`); roll.style.setProperty("--c", `var(--c${me.corner})`); }
  else if (room.problem) label = "Can't play";
  else if (myTurn && s.owed > 0 && !s.choice?.three) {
    roll.classList.add(`c${me.corner}`);
    roll.style.setProperty("--c", `var(--c${me.corner})`);
    if (st.can) { label = s.pool.length ? "Roll again" : "Roll"; roll.classList.add("ready"); }
    else if (room.busy) label = "Rolling…";
    else if (st.why) label = "Can't roll";
    else label = `Sealing ${st.ready}/${st.total}`;
  } else if (myTurn && s.choice?.three) label = "Third 6";
  else if (myTurn && usable.length > 1) label = "Tap a glowing piece";
  else if (myTurn && moves.length) label = "Tap a glowing piece";
  else if (myTurn) label = "…";
  else label = `${nameOf(cur)}'s turn`;
  roll.textContent = label;
  roll.disabled = !st.can && !away;
  const well = $("die-well");
  well.disabled = !st.can;
  well.classList.toggle("can", st.can);
  well.setAttribute("aria-label", st.can ? "Roll the die" : "Die");

  const showPool = !s.over && s.pool.length > 0 && !holding;
  $("pool-row").hidden = !showPool && !room.canReroll();
  const mine = myTurn && !s.owed;
  let picked = false;
  $("pool").innerHTML = showPool ? s.pool.map((v) => {
    const ok = mine && usable.includes(v);
    const sel = ok && v === selV && !picked;
    if (sel) picked = true;
    return `<button type="button" data-v="${v}" class="${sel ? "sel" : ""} ${mine && !ok ? "dead-die" : ""}" ${ok ? "" : "disabled"} aria-pressed="${sel}" aria-label="Die ${v}">${miniDie(cur.dice, v)}</button>`;
  }).join("") : "";
  const rrBtn = $("reroll");
  rrBtn.hidden = !room.canReroll() || holding;
  if (!rrBtn.hidden) $("reroll-label").textContent = `Re-roll ${s.die} · ${me.rerolls} left`;

  // status
  let status = $("status").dataset.text || "";
  if (room.problem) status = room.problem;
  else if (away) status = "Auto-play is playing for you. Tap I'm back to take over.";
  else if (me && !room.secret) status = "This device lost its dice seal for this room, so it can't roll. The game goes on without it.";
  else if (myTurn && s.choice && !holding && (s.choice.three || (s.owed === 0 && usable.length <= 1 && moves.length <= 1))) {
    const left = Math.max(0, Math.ceil((KEEP_MS - (room.now() - s.turnTs)) / 1000));
    status = s.choice.three ? `Third 6. Re-roll, or your turn ends in ${left}` : `You rolled ${s.die}. Keeping it in ${left}…`;
  } else if (myTurn && !holding && s.owed > 0 && s.pool.length) status = `You have ${s.pool.join(" + ")}. Roll again!`;
  else if (myTurn && !holding && usable.length > 1) status = `You have ${s.pool.join(" + ")}. Tap a piece to move it.`;
  else if (!s.over && myTurn && s.owed > 0 && st.can && !holding) status = "Your roll";
  $("status").textContent = holding ? "" : status;

  // seed line
  const others = room.others ? room.others().length : 0;
  if (room.solo) $("seed-line").textContent = last ? `Roll ${last.k} sealed by you and the computer` : "Dice sealed by you and the computer";
  else if (!s.over && myTurn && s.phase === "roll") $("seed-line").textContent = `Roll ${s.k} · ${st.ready ?? 0} of ${st.total ?? others} other seals in`;
  else if (last) $("seed-line").textContent = `Roll ${last.k} sealed by ${Object.values(last.w).filter((v) => v === true).length} players`;
  else $("seed-line").textContent = "Dice sealed by every player";

  // roll log (wide screens)
  $("roll-log").innerHTML = s.rolls.slice(-40).reverse().map((r) => {
    const p = bySeat(s, r.s);
    return `<li><span class="k">#${r.k}</span>${marble(p.corner, "", false)}<span>${esc(nameOf(p))}${r.rerolled ? " <em>re-rolled</em>" : ""}</span><b>${r.die}</b></li>`;
  }).join("");

  if (s.over && !resultShown) {
    resultShown = true;
    setTimeout(() => { (s.winner === room.mySeat ? sfx.win : sfx.lose)(); showResult(); }, 900);
  }
  if ($("proof").open) renderProof();
}

function setFace(n, skin) {
  const die = $("die");
  die.className = `die skin-${skinOf(skin)}`;
  die.dataset.face = String(n);
  die.setAttribute("aria-label", `Die shows ${n}`);
}

// Beads from every sealing player fall into the glass, the die tumbles and lands.
// Returns how long the moment takes.
function sealAndMix(s, r) {
  const die = $("die");
  const beads = $("beads");
  const skin = bySeat(s, r.s)?.dice;
  const seats = Object.keys(r.w).filter((k) => r.w[k] === true).map(Number);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ms = reduce ? 0 : 560 + seats.length * 50;
  mixingSeat = r.s;
  beads.innerHTML = seats.map((seat) => `<span class="bead c${bySeat(s, seat).corner}"></span>`).join("");
  sfx.rattle();
  if (!reduce) {
    [...beads.children].forEach((b, i) => {
      const a = (i / seats.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * 46, y = Math.sin(a) * 46;
      b.animate([
        { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 0 },
        { transform: `translate(${x * 0.8}px, ${y * 0.8}px) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: "translate(0, 0) scale(0.3)", opacity: 0 },
      ], { duration: 520, delay: i * 50, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" });
    });
  }
  die.className = `die skin-${skinOf(skin)} tumble`;
  setTimeout(() => {
    setFace(r.die, skin);
    void die.offsetWidth;
    die.classList.add("land");
    sfx.land(r.die);
    mixingSeat = null;
    setTimeout(() => die.classList.remove("land"), 520);
  }, ms);
  return ms;
}

$("roll").addEventListener("click", () => {
  if (!room?.state) return;
  const me = bySeat(room.state, room.mySeat);
  if (me?.auto && !room.state.over) { sfx.tap(); room.back(); } else room.roll();
});
$("die-well").addEventListener("click", () => { if (room?.state && room.rollStatus().can) room.roll(); });
$("reroll").addEventListener("click", () => { if (room?.canReroll()) { sfx.tap(); room.reroll(); } });
$("pool").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]");
  if (!b || b.disabled) return;
  const v = Number(b.dataset.v);
  selV = selV === v ? null : v;
  closeChooser();
  sfx.tap();
  schedule();
});
// Leaving a live game hands the win to the others, so it takes a second tap.
let leaveArmed = 0;
function disarmLeave() {
  leaveArmed = 0;
  $("game-leave").classList.remove("confirm");
  $("game-leave-label").textContent = "Leave game";
}
$("game-leave").addEventListener("click", async () => {
  const live = room?.state && !room.state.over && room.mySeat >= 0;
  if (live && Date.now() > leaveArmed) {
    leaveArmed = Date.now() + 3000;
    $("game-leave").classList.add("confirm");
    $("game-leave-label").textContent = "Tap again to leave";
    sfx.tap();
    setTimeout(() => { if (Date.now() >= leaveArmed) disarmLeave(); }, 3100);
    return;
  }
  disarmLeave();
  if (live) {
    $("game-leave").disabled = true;
    await room.leave().catch(() => {});
    $("game-leave").disabled = false;
  }
  leaveToHome();
});

// ---------- result ----------

function showResult() {
  const s = room?.state;
  if (!s) return;
  const winner = bySeat(s, s.winner);
  const iWon = s.winner === room.mySeat;
  $("result-title").textContent = winner ? (iWon ? "You won!" : `${nameOf(winner)} wins`) : "Game over";
  $("result-marble").innerHTML = winner ? marble(winner.corner) : "";
  const ranked = s.players.slice().sort((a, b) => (a.place || 9) - (b.place || 9));
  $("places").innerHTML = ranked.map((p) => `<li><span class="pos">${p.place || "–"}</span>${marble(p.corner, "", false)}<span>${esc(nameOf(p))}</span><span class="fine end">${p.left ? "left" : p.out ? "out" : ""}</span></li>`).join("");
  const sixes = s.rolls.filter((r) => r.die === 6).length;
  $("result-proof").textContent = `${s.rolls.length} rolls, ${sixes} sixes. Every roll was sealed by ${room.solo ? "you and the computer" : "the players"} and can be rechecked.`;
  $("again").textContent = room.solo ? "Play again" : "New room";
  $("result").showModal();
}

// ---------- proof ----------

function openProof() {
  if (!room?.state) { $("rules").showModal(); return; }
  renderProof();
  msg("verify-msg", "");
  $("proof").showModal();
}

function renderProof() {
  const s = room.state;
  const rows = [{ label: "All players", corner: null, rolls: s.rolls }]
    .concat(s.players.map((p) => ({ label: nameOf(p), corner: p.corner, rolls: s.rolls.filter((r) => r.s === p.seat) })));
  $("faces").innerHTML = `<div class="face-row head"><span></span>${[1, 2, 3, 4, 5, 6].map((f) => `<span class="n">${f}</span>`).join("")}</div>` +
    rows.map((r) => {
      const c = [0, 0, 0, 0, 0, 0];
      r.rolls.forEach((x) => c[x.die - 1]++);
      return `<div class="face-row"><span class="who">${r.corner === null ? "" : marble(r.corner, "", false)}${esc(r.label)}</span>${c.map((n) => `<span class="n">${n}</span>`).join("")}</div>`;
    }).join("");
  $("proof-list").innerHTML = s.rolls.slice().reverse().map((r) => {
    const p = bySeat(s, r.s);
    const mix = Object.keys(r.w).filter((k) => r.w[k] === true).map((k) => `<span class="bead c${bySeat(s, Number(k)).corner}"></span>`).join("");
    return `<li><span>#${r.k}</span>${marble(p.corner, "", false)}<span>${esc(nameOf(p))} rolled <b>${r.die}</b>${r.rerolled ? " · re-rolled" : ""}</span><span class="mix" aria-label="sealed by ${Object.values(r.w).filter((v) => v === true).length} players">${mix}</span></li>`;
  }).join("") || "<li><span></span><span></span><span>No rolls yet.</span><span></span></li>";
}

$("verify-all").addEventListener("click", async () => {
  if (!room?.state) return;
  const btn = $("verify-all");
  btn.disabled = true;
  msg("verify-msg", "Checking…");
  try {
    const r = await room.verifyAll((i, n) => msg("verify-msg", `Checking ${i} of ${n}…`));
    if (!r.ok && !r.bad) msg("verify-msg", "No rolls yet.");
    else if (r.bad) msg("verify-msg", `${r.bad} of ${r.ok + r.bad} rolls did not check out.`, true);
    else msg("verify-msg", `All ${r.ok} rolls check out against the players' seals.`);
  } catch {
    msg("verify-msg", "Could not finish the check. Try again.", true);
  } finally {
    btn.disabled = false;
  }
});

// ---------- updates ----------
// Every phone in a game must run the same rules. When a newer version is
// published, reload as soon as this phone is not in the middle of a game.
let updateReady = false;
async function checkUpdate() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    const { v } = await r.json();
    if (APP_VERSION && v && v !== APP_VERSION) updateReady = true;
  } catch { /* offline: try later */ }
  if (updateReady && (document.body.dataset.view !== "game" || room?.state?.over)) location.reload();
}
setInterval(checkUpdate, 90000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
checkUpdate();

// ---------- start ----------

window.addEventListener("hashchange", route);
net.connect().catch(() => msg("join-msg", "Can't reach the game server. Check your connection.", true));
route();
