#!/usr/bin/env bash
set -e

echo "=== Node & pbiviz ==="
which node || true
node -v || true
echo
echo "Global pbiviz:"
which pbiviz || true
pbiviz --version || true
echo
echo "Local pbiviz:"
npx --yes pbiviz --version || true

echo
echo "=== ESLint ==="
npx --yes eslint --version || true
echo "Flat config present?"; ls -la eslint.config.* || true
echo "Legacy config present?"; ls -la .eslintrc.* .eslintignore 2>/dev/null || echo "none"
echo

echo "=== pbiviz.json sanity ==="
jq '.visual.version, .visual.apiVersion' pbiviz.json 2>/dev/null || \
  (echo "pbiviz.json missing or jq not installed"; cat pbiviz.json 2>/dev/null || true)
echo

echo "=== Package deps of interest ==="
jq '.dependencies, .devDependencies' package.json 2>/dev/null || cat package.json
echo

echo "=== Attempt to print ESLint config for src/visual.ts ==="
npx --yes eslint --print-config src/visual.ts 1>/dev/null && echo "print-config OK" || echo "print-config not available or failed"
echo

echo "=== Files ==="
ls -la src || true
echo "Done."
