#!/usr/bin/env python3
# safe_package.py — build guard + packaging for pbiviz
# - Fails fast on Node >= 20 (pbiviz 6.x + webpack logger blows up there)
# - Pins engines in package.json and engine-strict in .npmrc
# - Ensures .eslintrc.js with absolute tsconfigRootDir (avoids pbiviz eslint parser error)
# - Runs npm install + pbiviz package

import json, os, re, subprocess, sys
from pathlib import Path

ROOT = Path.cwd()
PKG = ROOT / "package.json"
NPMRC = ROOT / ".npmrc"
ESLINTRC = ROOT / ".eslintrc.js"

def sh(cmd, cwd=None):
    print(f"==> $ {cmd}")
    return subprocess.call(cmd, shell=True, cwd=cwd)

def get_node_version():
    try:
        out = subprocess.check_output("node -v", shell=True, text=True).strip()
    except subprocess.CalledProcessError:
        return None
    # v18.20.8 -> (18,20,8)
    m = re.match(r"v(\d+)\.(\d+)\.(\d+)", out)
    return tuple(map(int, m.groups())) if m else None

def ensure_engines():
    if not PKG.exists():
        print("ERROR: package.json not found.")
        sys.exit(2)
    pkg = json.loads(PKG.read_text(encoding="utf-8"))
    pkg.setdefault("engines", {})
    # Allow Node 16 or 18. Block >=20 which breaks pbiviz 6.1.3
    pkg["engines"]["node"] = ">=16 <20"
    PKG.write_text(json.dumps(pkg, indent=2), encoding="utf-8")
    print("✓ pinned package.json engines: node >=16 <20")

    # Make npm actually enforce engines locally
    if not NPMRC.exists():
        NPMRC.write_text("engine-strict=true\n", encoding="utf-8")
        print("✓ wrote .npmrc (engine-strict=true)")
    else:
        lines = NPMRC.read_text(encoding="utf-8").splitlines()
        if not any(l.strip().startswith("engine-strict=") for l in lines):
            lines.append("engine-strict=true")
            NPMRC.write_text("\n".join(lines) + "\n", encoding="utf-8")
            print("✓ updated .npmrc (engine-strict=true)")

def ensure_eslint_abs_root():
    # pbiviz runs its own eslint; having a legacy .eslintrc.js with absolute tsconfigRootDir
    # quells "tsconfigRootDir must be an absolute path" errors.
    content = """const path = require('path');
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: [path.join(__dirname, 'tsconfig.json')],
    tsconfigRootDir: __dirname
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
  }
};
"""
    ESLINTRC.write_text(content, encoding="utf-8")
    print("✓ ensured .eslintrc.js with absolute tsconfigRootDir")

def main():
    if not (ROOT / "pbiviz.json").exists():
        print("ERROR: Run this from your visual project folder (must contain pbiviz.json).")
        sys.exit(2)

    node_ver = get_node_version()
    if node_ver is None:
        print("ERROR: Node.js not found on PATH.")
        sys.exit(2)

    print(f"Detected Node: v{'.'.join(map(str,node_ver))}")
    if node_ver[0] >= 20:
        print("\n❌ powerbi-visuals-tools 6.1.3 is NOT compatible with Node >= 20.")
        print("   Use Node 18 LTS (or Node 16). For example:")
        print("     nvm install 18.20.4 && nvm use 18.20.4")
        print("   or on asdf:")
        print("     asdf install nodejs 18.20.4 && asdf local nodejs 18.20.4")
        print("   Then re-run: python3 safe_package.py")
        sys.exit(1)

    ensure_engines()
    ensure_eslint_abs_root()

    # Install + package
    rc = sh("npm install", cwd=str(ROOT))
    if rc != 0: sys.exit(rc)

    rc = sh("npx pbiviz --version", cwd=str(ROOT))
    if rc != 0: sys.exit(rc)

    rc = sh("npx pbiviz package --verbose", cwd=str(ROOT))
    if rc != 0:
        print("\nBuild failed. If you recently switched Node versions in the same shell,")
        print("open a fresh terminal to ensure PATH uses Node 18, then re-run this script.")
        sys.exit(rc)

    print("\n✅ Build completed. Import the newest dist/*.pbiviz and remove older ones")
    print("   in Desktop (… → Get more visuals → My visuals → Remove).")

if __name__ == "__main__":
    main()
