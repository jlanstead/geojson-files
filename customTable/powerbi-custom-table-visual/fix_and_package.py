#!/usr/bin/env python3
"""
fix_and_package.py

Single-run fixer: cleans src to a minimal visual, updates package/tsconfig/eslint to sane values,
adds required deps (powerbi-visuals-api, core-js, regenerator-runtime), installs, and attempts to package.

Run from the visual folder:
  /bin/python3 fix_and_package.py

This will move existing src -> src_backup_TIMESTAMP, write minimal files, run npm install, then npx pbiviz package.
"""
import json, os, shutil, subprocess, sys, time
from pathlib import Path
from uuid import uuid4

ROOT = Path(".").resolve()
SRC = ROOT / "src"
BACKUP = ROOT / f"src_backup_{int(time.time())}"
PKG = ROOT / "package.json"
TSC = ROOT / "tsconfig.json"
ESLINT = ROOT / ".eslintrc.json"
PBIVIZ = ROOT / "pbiviz.json"

def run(cmd, check=True):
    print(f"\nRUN: {cmd}")
    res = subprocess.run(cmd, shell=True)
    if check and res.returncode != 0:
        print(f"Command failed: {cmd}", file=sys.stderr)
        sys.exit(res.returncode)
    return res.returncode

def backup_src():
    if SRC.exists():
        print(f"Backing up existing src -> {BACKUP}")
        shutil.move(str(SRC), str(BACKUP))

def write_minimal_src():
    SRC.mkdir(parents=True, exist_ok=True)
    visual_ts = """import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

export class Visual implements IVisual {
  private root: HTMLElement;
  constructor(options: any) {
    this.root = options.element;
    this.root.innerHTML = "<div style='padding:12px;font-family:Segoe UI, Arial, sans-serif;color:#222'>Minimal Custom Table Visual</div>";
  }
  public update(options: VisualUpdateOptions) {}
  public destroy() {}
}
"""
    (SRC / "visual.ts").write_text(visual_ts, encoding="utf-8")
    print("WROTE src/visual.ts")

def ensure_package_json():
    pkg = {}
    if PKG.exists():
        pkg = json.loads(PKG.read_text(encoding="utf-8"))
    # ensure basic fields and required deps
    pkg.setdefault("name", "custom-table-visual")
    pkg.setdefault("version", "1.0.0")
    pkg.setdefault("description", "Minimal Power BI custom visual scaffold")
    pkg.setdefault("scripts", {})
    pkg["scripts"]["package"] = "pbiviz package"
    deps = pkg.get("dependencies", {})
    # ensure API version matches pbiviz.json apiVersion if present
    api_ver = None
    if PBIVIZ.exists():
        try:
            pb = json.loads(PBIVIZ.read_text(encoding="utf-8"))
            api_ver = pb.get("apiVersion")
        except Exception:
            api_ver = None
    deps["powerbi-visuals-api"] = api_ver or "5.11.0"
    # ensure runtime polyfills required by toolchain
    deps["core-js"] = "^3.32.2"
    deps["regenerator-runtime"] = "^0.13.11"
    pkg["dependencies"] = deps
    PKG.write_text(json.dumps(pkg, indent=2), encoding="utf-8")
    print("WROTE package.json")

def ensure_tsconfig():
    ts = {
      "compilerOptions": {
        "target": "ES5",
        "module": "commonjs",
        # rootDir set to project root so generated .tmp files are under rootDir
        "rootDir": ".",
        "outDir": "./.tmp/build",
        "strict": True,
        "esModuleInterop": True,
        "skipLibCheck": True
      },
      # point at our minimal visual
      "files": ["./src/visual.ts"]
    }
    TSC.write_text(json.dumps(ts, indent=2), encoding="utf-8")
    print("WROTE tsconfig.json")

def ensure_eslint():
    # ESLint parserOptions.tsconfigRootDir must be absolute path for the linter
    eslint = {
      "parser": "@typescript-eslint/parser",
      "parserOptions": {"tsconfigRootDir": str(ROOT), "project": "./tsconfig.json"},
      "plugins": ["@typescript-eslint"],
      "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
      "rules": {"no-unused-vars": "off", "@typescript-eslint/no-unused-vars": ["error"]}
    }
    ESLINT.write_text(json.dumps(eslint, indent=2), encoding="utf-8")
    print("WROTE .eslintrc.json")

def ensure_pbiviz():
    if PBIVIZ.exists():
        try:
            pb = json.loads(PBIVIZ.read_text(encoding="utf-8"))
        except Exception:
            pb = {}
    else:
        pb = {}
    vis = pb.setdefault("visual", {})
    vis.setdefault("name", "CustomTableVisual")
    vis.setdefault("displayName", "Custom Table Visual")
    vis.setdefault("guid", f"CTV{uuid4().hex[:10]}")
    vis.setdefault("visualClassName", "Visual")
    # ensure 4-part version
    vis["version"] = vis.get("version", "1.0.0.0")
    pb["apiVersion"] = pb.get("apiVersion", "5.11.0")
    pb.setdefault("assets", {"icon": "assets/icon.png"})
    PBIVIZ.write_text(json.dumps(pb, indent=2), encoding="utf-8")
    print("WROTE pbiviz.json")

def ensure_icon():
    assets = ROOT / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    icon = assets / "icon.png"
    if not icon.exists():
        # tiny 1x1 transparent PNG
        b = bytes.fromhex(
            "89504E470D0A1A0A0000000D4948445200000001000000010806000000" \
            "1F15C4890000000A49444154789C63F8000000020001E2D27F2000000000" \
            "49454E44AE426082"
        )
        icon.write_bytes(b)
        print("WROTE assets/icon.png (1x1 png)")
    else:
        print("SKIP existing assets/icon.png")

def main():
    print("=== fix_and_package.py — preparing minimal visual and packaging ===")
    backup_src()
    write_minimal_src()
    ensure_package_json()
    ensure_tsconfig()
    ensure_eslint()
    ensure_pbiviz()
    ensure_icon()

    # install deps
    run("npm cache verify || true")
    run("npm install --no-audit --no-fund")

    # attempt packaging
    try:
        run("npx pbiviz package --verbose")
        print("\nPackaging completed — check dist/*.pbiviz")
    except SystemExit as e:
        print("\nPackaging failed. See above output for errors.")
        print("If errors remain, paste them here and I will provide the next minimal fix.")
        sys.exit(1)

if __name__ == '__main__':
    main()