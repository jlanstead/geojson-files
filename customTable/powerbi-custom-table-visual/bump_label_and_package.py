#!/usr/bin/env python3
"""
bump_label_and_package.py

What it does:
- Reads pbiviz.json and finds the current "PY" number (e.g., PY5).
- Computes the next number (or you can set it explicitly).
- Updates:
    visual.name        -> "PY{N}"
    visual.version     -> bumps last segment by 1 (or syncs to N if you want)
    visual.displayName -> "PY{N} v{version}"
    visual.guid        -> "PY{N}" + random suffix (new GUID to bust cache)
- Writes pbiviz.json
- Runs: npm install && npx pbiviz package --verbose

Usage:
# Auto-increment the PY number (PY5 -> PY6), bump version, new guid, package
python3 bump_label_and_package.py

# Explicitly set PY number to 8 and keep version synced to that number (1.0.0.8)
python3 bump_label_and_package.py --set 8 --sync-version-to-n

# Only write pbiviz.json; don't package (dry-run)
python3 bump_label_and_package.py --no-package
"""
import argparse, json, re, subprocess, sys, os
from pathlib import Path
from uuid import uuid4

PBIVIZ = Path("pbiviz.json")
NODE_TARGET = "18"          # Target Node.js version
NODE_MIN = 16               # Minimum supported Node.js version
NODE_MAX_EXCL = 20          # Maximum supported Node.js version (exclusive)

def read_pbiviz() -> dict:
    if not PBIVIZ.exists():
        print("ERROR: pbiviz.json not found in this folder.", file=sys.stderr)
        sys.exit(2)
    try:
        return json.loads(PBIVIZ.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"ERROR: failed to parse pbiviz.json: {e}", file=sys.stderr)
        sys.exit(2)

def write_pbiviz(data: dict) -> None:
    PBIVIZ.write_text(json.dumps(data, indent=2), encoding="utf-8")

def parse_current_py_number(data: dict) -> int | None:
    vis = data.get("visual", {})
    candidates = [vis.get("name") or "", vis.get("displayName") or ""]
    for s in candidates:
        m = re.search(r"\bPY(\d+)\b", s, re.IGNORECASE)
        if m:
            return int(m.group(1))
    return None

def bump_version_str(v: str) -> str:
    parts = [int(x) if x.isdigit() else 0 for x in (v or "1.0.0.0").split(".")]
    while len(parts) < 4:
        parts.append(0)
    parts[-1] += 1
    return ".".join(map(str, parts))

def set_version_last_to_n(v: str, n: int) -> str:
    parts = [int(x) if x.isdigit() else 0 for x in (v or "1.0.0.0").split(".")]
    while len(parts) < 4:
        parts.append(0)
    parts[-1] = int(n)
    return ".".join(map(str, parts))

def node_version_tuple():
    try:
        out = subprocess.check_output(["node", "-v"], text=True).strip()
        if out.startswith("v"): out = out[1:]
        major, minor, patch = (out.split(".") + ["0", "0"])[:3]
        return (int(major), int(minor), int(patch))
    except Exception:
        return None

def ensure_node_ok_or_exit():
    vt = node_version_tuple()
    if not vt:
        print("ERROR: Node.js not found. Install Node.js 18 or use nvm to manage versions.", file=sys.stderr)
        sys.exit(3)
    if not (NODE_MIN <= vt[0] < NODE_MAX_EXCL):
        print(f"ERROR: Node.js >= {NODE_MIN} and < {NODE_MAX_EXCL} required. Current: v{vt[0]}.{vt[1]}.{vt[2]}. "
              f"Install Node.js 18 or use nvm to switch versions.", file=sys.stderr)
        sys.exit(3)

def package():
    """
    Install dependencies and package the visual.
    If Node.js version mismatch occurs, retries with engine checks disabled.
    """
    def run_command(cmd, env=None):
        try:
            subprocess.check_call(cmd, shell=True, env=env)
        except subprocess.CalledProcessError as e:
            print(f"Command failed: {cmd}\nError: {e}", file=sys.stderr)
            raise

    env = os.environ.copy()
    try:
        print("Running: npm install")
        run_command("npm install", env=env)
    except subprocess.CalledProcessError:
        print("Retrying npm install with engine checks disabled...")
        env["npm_config_engine_strict"] = "false"
        run_command("npm install", env=env)

    print("Running: npx pbiviz --version")
    run_command("npx pbiviz --version", env=env)

    print("Running: npx pbiviz package --verbose")
    run_command("npx pbiviz package --verbose", env=env)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", type=int, dest="set_n",
                    help="Explicitly set the PY number (e.g., 7). If omitted, auto-increment.")
    ap.add_argument("--sync-version-to-n", action="store_true",
                    help="Force visual.version to 1.0.0.N (instead of just bumping last digit).")
    ap.add_argument("--no-package", action="store_true",
                    help="Only update pbiviz.json; do not run npm/pbiviz.")
    args = ap.parse_args()

    data = read_pbiviz()
    vis = data.setdefault("visual", {})

    # 1) Determine next PY number
    current_n = parse_current_py_number(data)
    if args.set_n is not None:
        new_n = args.set_n
    else:
        new_n = (current_n or 0) + 1

    # 2) Version
    current_version = vis.get("version", "1.0.0.0")
    if args.sync_version_to_n:
        new_version = set_version_last_to_n(current_version, new_n)
    else:
        new_version = bump_version_str(current_version)

    # 3) Update fields
    vis["name"] = f"PY{new_n}"
    vis["version"] = new_version
    vis["displayName"] = f"PY{new_n} v{new_version}"
    vis["guid"] = f"PY{new_n}{uuid4().hex[:10]}"

    # 4) Write back
    write_pbiviz(data)

    print("Updated pbiviz.json:")
    print(f"  name        = {vis['name']}")
    print(f"  version     = {vis['version']}")
    print(f"  displayName = {vis['displayName']}")
    print(f"  guid        = {vis['guid']}")

    # 5) Package (optional)
    if not args.no_package:
        print("\nPackaging…")
        package()
        print("\nDone. Import the newest dist/*.pbiviz and remove older ones in Power BI.")

if __name__ == "__main__":
    main()
