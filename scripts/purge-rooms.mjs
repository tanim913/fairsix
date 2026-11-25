// Deletes Fairsix rooms where nothing has happened (created, joined, any move) for
// --hours (default 168 = 7 days). Runs weekly from GitHub Actions with a Firebase
// service-account key in the FIREBASE_SERVICE_ACCOUNT secret. No dependencies.
//   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/purge-rooms.mjs [--hours 168] [--dry-run]
import crypto from "node:crypto";

const DB = "https://fairsix-xh2wo-default-rtdb.asia-southeast1.firebasedatabase.app";
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const hours = Number(args[args.indexOf("--hours") + 1]) || 168;

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "null");
if (!sa?.client_email || !sa?.private_key) { console.error("FIREBASE_SERVICE_ACCOUNT is missing or not a service-account JSON key."); process.exit(1); }

// OAuth access token from a signed JWT (RS256).
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const iat = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
  iss: sa.client_email,
  scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
  aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600,
})}`;
const jwt = `${unsigned}.${crypto.sign("RSA-SHA256", Buffer.from(unsigned), sa.private_key).toString("base64url")}`;
const tok = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
});
if (!tok.ok) { console.error(`token: ${tok.status} ${await tok.text()}`); process.exit(1); }
const H = { Authorization: `Bearer ${(await tok.json()).access_token}` };

async function get(path, query = "") {
  const r = await fetch(`${DB}/${path}.json${query ? `?${query}` : ""}`, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${path}: ${await r.text()}`);
  return r.json();
}

const codes = Object.keys((await get("rooms", "shallow=true")) || {});
const cutoff = Date.now() - hours * 3600 * 1000;
const doomed = [];
for (const code of codes) {
  const meta = (await get(`rooms/${code}/meta`)) || {};
  const last = await get(`rooms/${code}/log`, 'orderBy="$key"&limitToLast=1');
  const seen = Math.max(meta.created || 0, last ? Object.values(last)[0]?.ts || 0 : 0);
  if (seen <= cutoff) doomed.push(code);
}
if (!dry) {
  for (let i = 0; i < doomed.length; i += 200) {
    const body = Object.fromEntries(doomed.slice(i, i + 200).map((c) => [c, null]));
    const r = await fetch(`${DB}/rooms.json`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`delete: ${r.status} ${await r.text()}`);
  }
}
console.log(`${dry ? "Dry run. " : ""}Rooms: ${codes.length}, ${dry ? "would delete" : "deleted"} ${doomed.length} idle over ${hours}h, kept ${codes.length - doomed.length}.`);
