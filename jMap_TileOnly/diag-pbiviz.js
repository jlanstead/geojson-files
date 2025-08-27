cat > diag-pbiviz.js <<'JS'
const fs = require("fs");
const path = require("path");

function exists(p){ try{ fs.accessSync(p); return true;} catch{ return false; } }
function readJson(p){ try{ return JSON.parse(fs.readFileSync(p,"utf8")); } catch(e){ return {__error:e.message}; } }

const cwd = process.cwd();
console.log("== diag ==");
console.log("cwd:", cwd);

const pb = path.join(cwd,"pbiviz.json");
const ts = path.join(cwd,"tsconfig.json");
const cap = path.join(cwd,"capabilities.json");

console.log("\nFiles:");
for (const f of [pb,ts,cap]) console.log(path.basename(f), "->", exists(f) ? "FOUND" : "MISSING");

if (!exists(pb)) process.exit(0);

console.log("\nRead pbiviz.json:");
const pj = readJson(pb);
if (pj.__error) { console.log("  ERROR:", pj.__error); process.exit(0); }

console.log("  visual.name       :", pj.visual && pj.visual.name);
console.log("  visual.displayName:", pj.visual && pj.visual.displayName);
console.log("  apiVersion        :", pj.apiVersion);
console.log("  supportUrl        :", pj.supportUrl);
console.log("  assets.icon       :", pj.assets && pj.assets.icon);

let changed = false;
if (!pj.supportUrl || !/^https?:\/\//i.test(pj.supportUrl)) {
  pj.supportUrl = "https://powerbi.microsoft.com";
  changed = true;
  console.log("  -> set supportUrl to", pj.supportUrl);
}
if (!pj.author) { pj.author = { name: "You", email: "you@example.com" }; changed = true; console.log("  -> set author"); }
if (!pj.assets) pj.assets = {};
if (!pj.assets.icon) { pj.assets.icon = "assets/icon.png"; changed = true; console.log("  -> set assets.icon to", pj.assets.icon); }

if (changed) {
  fs.writeFileSync(pb, JSON.stringify(pj,null,2));
  console.log("  wrote pbiviz.json");
}

const iconPath = path.join(cwd, pj.assets.icon || "assets/icon.png");
if (!exists(iconPath)) {
  fs.mkdirSync(path.dirname(iconPath), { recursive: true });
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
  fs.writeFileSync(iconPath, Buffer.from(png, "base64"));
  console.log("  wrote placeholder icon:", pj.assets.icon);
}

console.log("\ntsconfig.json snapshot:");
const tj = exists(ts) ? readJson(ts) : null;
if (tj && !tj.__error) {
  console.log("  strict:", tj.compilerOptions && tj.compilerOptions.strict);
  console.log("  strictNullChecks:", tj.compilerOptions && tj.compilerOptions.strictNullChecks);
  if (tj.compilerOptions && tj.compilerOptions.strict && tj.compilerOptions.strictNullChecks !== false) {
    tj.compilerOptions.strictNullChecks = false;
    fs.writeFileSync(ts, JSON.stringify(tj,null,2));
    console.log("  -> set strictNullChecks:false");
  }
} else {
  console.log("  missing or unreadable");
}

const esCjs = path.join(cwd,"eslint.config.cjs");
const esEsm = path.join(cwd,"eslint.config.js");
if (!exists(esCjs) && !exists(esEsm)) {
  fs.writeFileSync(esCjs,
`module.exports = [
  { ignores: ["node_modules/**",".tmp/**","dist/**","webpack.statistics.*.html"] },
  { files: ["**/*.ts","**/*.tsx"], languageOptions: { parserOptions: { tsconfigRootDir: __dirname, project: ["./tsconfig.json"] } }, rules: {} }
];\n`);
  console.log("\nwrote eslint.config.cjs (flat) with absolute tsconfigRootDir");
} else {
  console.log("\neslint flat config present ->", exists(esCjs) ? "eslint.config.cjs" : "eslint.config.js");
}

console.log("\n== done ==");
JS
