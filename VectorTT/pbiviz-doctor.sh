#!/usr/bin/env bash
set -euo pipefail

LOG="pbiviz-build.log"
SMOKE="${1:-}" # pass --smoke to run a no-deps visual build

say() { printf "\n=== %s ===\n" "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

say "ENV"
echo "pwd: $(pwd)"
echo "node: $(command -v node || true)"; node -v || true
echo "npm : $(command -v npm  || true)"; npm  -v || true
echo "npx : $(command -v npx  || true)"
echo "tsc : $(command -v tsc  || true)"

say "PBIVIZ"
if ! have npx; then echo "npx missing"; exit 1; fi
npx pbiviz --version || true

say "PACKAGE/CONFIG SNAPSHOT"
if [ -f package.json ]; then
  node -e "const p=require('./package.json'); console.log(JSON.stringify({deps:p.dependencies,dev:p.devDependencies},null,2))" || true
else
  echo "package.json missing"; exit 2
fi
[ -f pbiviz.json ] && node -e "console.log(require('./pbiviz.json'))" | sed -n '1,40p' || echo "pbiviz.json missing"
[ -f tsconfig.json ] && sed -n '1,120p' tsconfig.json || echo "tsconfig.json missing"

say "ESLINT CONFIG CHECK"
FLAT="eslint.config.cjs"
LEG=".eslintrc.js"
[ -f "$FLAT" ] && echo "Found $FLAT"
[ -f "$LEG" ]  && echo "Found $LEG"
if [ -f "$FLAT" ] && [ -f "$LEG" ]; then
  echo "WARNING: Both flat and legacy ESLint configs exist. pbiviz 6.x may pick the wrong one and throw tsconfigRootDir errors."
fi

say "DEPENDENCIES ON DISK"
ls -d node_modules/powerbi-visuals-api 2>/dev/null || echo "MISSING: node_modules/powerbi-visuals-api"
ls -d node_modules/maplibre-gl          2>/dev/null || echo "MISSING: node_modules/maplibre-gl"

say "RESOLVE PATHS (node)"
node -e "try{console.log('pbi api:',require.resolve('powerbi-visuals-api'))}catch(e){console.log('pbi api resolve FAIL',e.message)}"
node -e "try{console.log('maplibre :',require.resolve('maplibre-gl/dist/maplibre-gl.js'))}catch(e){console.log('maplibre resolve FAIL',e.message)}"

say "ESLINT RUN (captured)"
if [ -d src ]; then
  npx eslint 'src/**/*.{ts,tsx}' || true
else
  echo "No src/ dir."
fi

say "TSC DRY COMPILE (no emit)"
if have tsc; then
  npx tsc --noEmit || true
else
  echo "tsc not installed (ok, pbiviz will still build)."
fi

ORIG_TS="src/visual.ts"
BAK_TS="src/visual.ts.bak"
if [ "$SMOKE" = "--smoke" ]; then
  say "SMOKE MODE: replace src/visual.ts with minimal visual (no imports)"
  if [ -f "$ORIG_TS" ] && [ ! -f "$BAK_TS" ]; then
    cp "$ORIG_TS" "$BAK_TS"
  fi
  mkdir -p src
  cat > src/visual.ts <<'TS'
import powerbi from "powerbi-visuals-api";
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

export class Visual implements powerbi.extensibility.visual.IVisual {
  private root: HTMLElement;
  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.root = options.element;
    this.root.innerHTML = "<div style='display:flex;align-items:center;justify-content:center;width:100%;height:100%;font:14px sans-serif'>Hello Visual</div>";
  }
  public update(_o: VisualUpdateOptions): void {}
  public destroy(): void { this.root.innerHTML = ""; }
}
TS
fi

say "PBIVIZ PACKAGE (verbose) -> $LOG"
set +e
npx pbiviz package --verbose | tee "$LOG"
RC=${PIPESTATUS[0]}
set -e

say "RESULT"
if [ $RC -ne 0 ]; then
  echo "pbiviz failed (rc=$RC). Tail of $LOG:"
  tail -n 80 "$LOG" || true
  echo
  echo "ACTIONABLE HINTS:"
  echo "- If you see 'parserOptions.tsconfigRootDir must be an absolute path':"
  echo "    Use ONLY a legacy .eslintrc.js with absolute tsconfigRootDir, or delete eslint.config.cjs."
  echo "- If you see 'Cannot find type definition file for powerbi-visuals-api':"
  echo "    Remove \"types\": [\"powerbi-visuals-api\"] from tsconfig.json, run npm i, try again."
  echo "- If precompile complains about VisualConstructorOptions | undefined:"
  echo "    That's a pbiviz precompile strict quirk; ensure tsconfig \"strict\": false and \"skipLibCheck\": true."
else
  echo "pbiviz succeeded."
  ls -lh dist/*.pbiviz 2>/dev/null || echo "No artifact in dist/"
fi

if [ "$SMOKE" = "--smoke" ] && [ -f "$BAK_TS" ]; then
  say "RESTORE original src/visual.ts"
  mv -f "$BAK_TS" "$ORIG_TS"
fi

say "DONE"
