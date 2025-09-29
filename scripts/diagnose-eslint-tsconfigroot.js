const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const glob = require("glob");

function runPrintConfig(targetFile = "src/visual.ts") {
  try {
    console.log("Running: eslint --print-config", targetFile);
    const out = execSync(`npx eslint --print-config ${targetFile}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const outPath = path.resolve("/tmp/eslint_print_config.json");
    fs.writeFileSync(outPath, out, "utf8");
    console.log("Saved merged ESLint config to:", outPath);
  } catch (err) {
    console.error("eslint --print-config failed:", err.message);
  }
}

function grepForTsconfigRootDir(rootDir = ".") {
  console.log(`Searching for "tsconfigRootDir" string under ${rootDir} (this may take a few seconds)...`);
  const patterns = [
    `${rootDir}/**/*.js`,
    `${rootDir}/**/*.cjs`,
    `${rootDir}/**/*.json`,
    `${rootDir}/**/*.mjs`
  ];
  const seen = new Set();
  for (const pat of patterns) {
    for (const file of glob.sync(pat, { nodir: true, ignore: ["**/node_modules/.bin/**"] })) {
      try {
        const txt = fs.readFileSync(file, "utf8");
        if (txt.includes("tsconfigRootDir")) {
          const rel = path.relative(process.cwd(), file);
          if (!seen.has(rel)) {
            seen.add(rel);
            // print a small excerpt
            const lines = txt.split(/\r?\n/);
            const excerpt = [];
            for (let i = 0; i < Math.min(200, lines.length); i++) {
              if (lines[i].includes("tsconfigRootDir")) {
                const start = Math.max(0, i - 3);
                const end = Math.min(lines.length, i + 4);
                excerpt.push(`--- ${rel} (lines ${start + 1}-${end}) ---`);
                excerpt.push(lines.slice(start, end).join("\n"));
                break;
              }
            }
            console.log(excerpt.join("\n"));
          }
        }
      } catch (e) {
        // ignore unreadable files
      }
    }
  }
  if (seen.size === 0) console.log("No occurrences of tsconfigRootDir found in searched files.");
}

function showDeps() {
  const pkg = path.resolve("package.json");
  if (fs.existsSync(pkg)) {
    try {
      const pj = JSON.parse(fs.readFileSync(pkg, "utf8"));
      console.log("package.json relevant deps:");
      ["eslint", "@typescript-eslint/parser", "@typescript-eslint/eslint-plugin", "eslint-config", "powerbi-visuals-tools", "powerbi-visuals-api"].forEach((k) => {
        if (pj.dependencies && pj.dependencies[k]) console.log(" dep:", k, pj.dependencies[k]);
        if (pj.devDependencies && pj.devDependencies[k]) console.log(" dev:", k, pj.devDependencies[k]);
      });
    } catch {}
  } else {
    console.log("No package.json at repo root");
  }
}

function main() {
  console.log("Diagnose ESLint tsconfigRootDir issue\nWorking dir:", process.cwd(), "\n");
  runPrintConfig(process.argv[2] || "src/visual.ts");
  console.log("");
  grepForTsconfigRootDir("node_modules");
  console.log("");
  grepForTsconfigRootDir(".");
  console.log("");
  showDeps();
  console.log("\nDone. Check /tmp/eslint_print_config.json and the printed excerpts above.");
}

main();