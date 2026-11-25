// Stamps one version on every file the page loads, so a browser never mixes old
// and new modules (GitHub Pages lets browsers cache files for 10 minutes).
// Run before each commit that changes the site: node scripts/stamp.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const v = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const tag = (s) => s.replace(/\?v=[0-9a-z]+/g, "");

let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = tag(html).replace(/(href|src)="(css\/style\.css|js\/theme\.js|js\/app\.js|manifest\.webmanifest)"/g, `$1="$2?v=${v}"`);
fs.writeFileSync(path.join(root, "index.html"), html);

for (const f of fs.readdirSync(path.join(root, "js"))) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(root, "js", f);
  let s = tag(fs.readFileSync(p, "utf8"));
  s = s.replace(/(from\s+"(?:\.\/|\.\.\/vendor\/)[\w-]+\.js)"/g, `$1?v=${v}"`);
  s = s.replace(/export const APP_VERSION = "[0-9a-z]*";/, `export const APP_VERSION = "${v}";`);
  fs.writeFileSync(p, s);
}
fs.writeFileSync(path.join(root, "version.json"), JSON.stringify({ v }) + "\n");
console.log("stamped", v);
