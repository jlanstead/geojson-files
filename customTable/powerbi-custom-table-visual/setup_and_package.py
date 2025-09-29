#!/usr/bin/env python3
"""
Create minimal Power BI visual scaffold, ensure icon exists (no network), and run pbiviz package.
One-shot: runs npm install (if needed) and then `npx pbiviz package --verbose`.
"""
import base64, json, os, subprocess, sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(".").resolve()
ASSETS = ROOT / "assets"
SRC = ROOT / "src"
PBIVIZ = ROOT / "pbiviz.json"
PKG = ROOT / "package.json"
TSC = ROOT / "tsconfig.json"
ESLINT = ROOT / ".eslintrc.json"
CAP = ROOT / "capabilities.json"
ICON = ASSETS / "icon.png"

def write_if_missing(path: Path, content: str, overwrite=False):
    if path.exists() and not overwrite:
        print(f"SKIP existing: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"WROTE {path}")

def write_binary(path: Path, b: bytes, overwrite=False):
    if path.exists() and not overwrite:
        print(f"SKIP existing: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b)
    print(f"WROTE {path}")

def run(cmd):
    print(f"RUN: {cmd}")
    proc = subprocess.run(cmd, shell=True)
    if proc.returncode != 0:
        raise SystemExit(f"Command failed: {cmd}")

def main():
    confirm = input("This will create/overwrite minimal project files and attempt to package. Proceed? (yes/no): ").strip().lower()
    if confirm not in ("y","yes"):
        print("Aborted.")
        return

    # pbiviz.json (minimal, version must be 4 parts)
    pb = {
      "visual": {
        "name": "CustomTableVisual",
        "displayName": "Custom Table Visual",
        "guid": f"CTV{uuid4().hex[:10]}",
        "visualClassName": "Visual",
        "version": "1.0.0.0",
        "description": "Minimal custom table-like visual"
      },
      "apiVersion": "5.11.0",
      "author": {"name": "", "email": ""},
      "assets": {"icon": "assets/icon.png"},
      "capabilities": "capabilities.json",
      "externalJS": None,
      "style": "style/visual.less"
    }
    write_if_missing(PBIVIZ, json.dumps(pb, indent=2), overwrite=True)

    # package.json minimal
    pkg = {
      "name": "custom-table-visual",
      "version": "1.0.0",
      "description": "Minimal Power BI custom visual scaffold",
      "scripts": {"package": "pbiviz package"},
      "devDependencies": {}
    }
    write_if_missing(PKG, json.dumps(pkg, indent=2), overwrite=True)

    # tsconfig.json with files pointing to src/visual.ts
    ts = {
      "compilerOptions": {
        "target": "ES5",
        "module": "commonjs",
        "outDir": "./.tmp/build",
        "rootDir": "./src",
        "strict": True,
        "esModuleInterop": True,
        "skipLibCheck": True
      },
      "files": ["./src/visual.ts"]
    }
    write_if_missing(TSC, json.dumps(ts, indent=2), overwrite=True)

    # ESLint: tsconfigRootDir must be a string in JSON
    eslint = {
      "parser": "@typescript-eslint/parser",
      "parserOptions": {"tsconfigRootDir": ".", "project": "./tsconfig.json"},
      "plugins": ["@typescript-eslint"],
      "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
      "rules": {"no-unused-vars": "off", "@typescript-eslint/no-unused-vars": ["error"]}
    }
    write_if_missing(ESLINT, json.dumps(eslint, indent=2), overwrite=True)

    # minimal capabilities.json (table)
    cap = {
      "dataRoles": [
        {"name": "Values", "displayName": "Values", "kind": "Measure"},
        {"name": "Rows", "displayName": "Rows", "kind": "Grouping"}
      ],
      "dataViewMappings": [
        {
          "table": {
            "rows": {"select": [{"for": {"in": "Rows"}}, {"for": {"in": "Values"}}]}
          }
        }
      ],
      "version": "1.0.0.0"
    }
    write_if_missing(CAP, json.dumps(cap, indent=2), overwrite=True)

    # minimal src/visual.ts
    SRC.mkdir(parents=True, exist_ok=True)
    visual_ts = """import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

export class Visual implements IVisual {
  private root: HTMLElement;
  constructor(options: any) {
    this.root = options.element;
    this.root.style.fontFamily = "Segoe UI, Arial, sans-serif";
    this.root.innerHTML = "<div style='padding:8px;color:#333'>Custom Table Visual — minimal scaffold</div>";
  }
  public update(options: VisualUpdateOptions) { /* minimal no-op */ }
  public destroy() {}
}
"""
    write_if_missing(SRC / "visual.ts", visual_ts, overwrite=False)

    # create a tiny placeholder PNG (1x1 transparent) from base64 to avoid network
    png_b64 = b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ea9S2sAAAAASUVORK5CYII="
    write_binary(ICON, base64.b64decode(png_b64), overwrite=True)

    # ensure assets folder exists
    (ROOT / "assets").mkdir(parents=True, exist_ok=True)

    # run npm install (this will be quick with minimal package.json)
    try:
        run("npm install")
    except SystemExit as e:
        print(e)
        print("Continuing to try packaging (pbiviz may still work if global powerbi-visuals-tools is installed).")

    # run packaging
    try:
        run("npx pbiviz package --verbose")
        print("Packaging completed — see dist/*.pbiviz")
    except SystemExit as e:
        print(e)
        print("Packaging failed. Inspect output above for details.")

if __name__ == '__main__':
    main()