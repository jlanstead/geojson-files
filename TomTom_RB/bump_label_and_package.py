#!/usr/bin/env python3
"""
bump_label_and_package.py

- Updates pbiviz.json fields (PY number, version, displayName, guid)
- Packages the visual under Node 18 even if your shell default is Node 22

Usage:
  python3 bump_label_and_package.py
  python3 bump_label_and_package.py --set 8 --sync-version-to-n
  python3 bump_label_and_package.py --no-package
"""
import argparse, json, re, subprocess, sys, os
from pathlib import Path
from uuid import uuid4

PBIVIZ = Path("pbiviz.json")
NODE_TARGET = "18"          # what we want to run pbiviz under
NODE_MIN = 16               # inclusive
NODE_MAX_EXCL = 20          # exclusive (i.e., <20)

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

def parse_current_py_number(data: dict):
    vis = data.get("visual", {})
    for s in [vis.get("name") or "", vis.get("displayName") or ""]:
        m = re.search(r"\bPY(\d+)\b", s, re.IGNORECASE)
        if m:
            return int(m.group(1))
    return None

def bump_version_str(v: str) -> str:
    parts = [int(x) if x.isdigit() else 0 for x in (v or "1.0.0.0").split(".")]
    while len(parts) < 4: parts.append(0)
    parts[-1] += 1
    return ".".join(map(str, parts))

def set_version_last_to_n(v: str, n: int) -> str:
    parts = [int(x) if x.isdigit() else 0 for x in (v or "1.0.0.0").split(".")]
    while len(parts) < 4: parts.append(0)
    parts[-1] = int(n)
    return ".".join(map(str, parts))

def have_nvm() -> bool:
    nvm_dir = Path(os.environ.get("NVM_DIR", str(Path.home() / ".nvm")))
    return (nvm_dir / "nvm.sh").exists()

def run_with_nvm(cmd: str):
    """Run a command in a bash subshell that sources nvm and selects Node 18."""
    nvm_dir = os.environ.get("NVM_DIR", str(Path.home() / ".nvm"))
    nvm_init = f'export NVM_DIR="{nvm_dir}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'
    wrapped = f"bash -lc '{nvm_init} && nvm install {NODE_TARGET} >/dev/null 2>&1 || true && nvm use {NODE_TARGET} >/dev/null && {cmd}'"
    subprocess.check_call(wrapped, shell=True)

def node_version_tuple():
    try:
        out = subprocess.check_output(["node", "-v"], text=True).strip()
        if out.startswith("v"): out = out[1:]
        major, minor, patch = (out.split(".") + ["0","0"])[:3]
        return (int(major), int(minor), int(patch))
    except Exception:
        return None

def ensure_node_ok_or_exit():
    vt = node_version_tuple()
    if not vt:
        print("ERROR: Node not found. Either install Node 18 or install nvm and rerun.", file=sys.stderr)
        sys.exit(3)
    if not (NODE_MIN <= vt[0] < NODE_MAX_EXCL):
        print(f"ERROR: Node >= {NODE_MIN} and < {NODE_MAX_EXCL} required. Current: v{vt[0]}.{vt[1]}.{vt[2]}. "
              f"Install nvm and run `nvm use {NODE_TARGET}`.", file=sys.stderr)
        sys.exit(3)

def package():
    # Always try nvm path first (Codespaces/Unix). If nvm missing, fall back to current Node after checking range.
    if have_nvm():
        run_with_nvm("node -v && npm -v")
        run_with_nvm("npm ci")
        run_with_nvm("npx pbiviz --version")
        run_with_nvm("npx pbiviz package --verbose")
    else:
        ensure_node_ok_or_exit()
        subprocess.check_call("npm ci", shell=True)
        subprocess.check_call("npx pbiviz --version", shell=True)
        subprocess.check_call("npx pbiviz package --verbose", shell=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", type=int, dest="set_n", help="Explicitly set the PY number (e.g., 7).")
    ap.add_argument("--sync-version-to-n", action="store_true",
                    help="Force visual.version to 1.0.0.N instead of bumping last digit.")
    ap.add_argument("--no-package", action="store_true",
                    help="Only update pbiviz.json; do not run npm/pbiviz.")
    args = ap.parse_args()

    data = read_pbiviz()
    vis = data.setdefault("visual", {})

    # Determine next PY number
    current_n = parse_current_py_number(data)
    new_n = args.set_n if args.set_n is not None else (current_n or 0) + 1

    # Version
    current_version = vis.get("version", "1.0.0.0")
    new_version = set_version_last_to_n(current_version, new_n) if args.sync_version_to_n else bump_version_str(current_version)

    # Update fields
    vis["name"] = f"PY{new_n}"
    vis["version"] = new_version
    vis["displayName"] = f"PY{new_n} v{new_version}"
    vis["guid"] = f"PY{new_n}{uuid4().hex[:10]}"

    write_pbiviz(data)

    print("Updated pbiviz.json:")
    print(f"  name        = {vis['name']}")
    print(f"  version     = {vis['version']}")
    print(f"  displayName = {vis['displayName']}")
    print(f"  guid        = {vis['guid']}")

    if not args.no_package:
        print("\nPackaging…")
        package()
        print("\nDone. Import the newest dist/*.pbiviz and remove older ones in Power BI.")

if __name__ == "__main__":
    main()
