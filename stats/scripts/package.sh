#!/usr/bin/env bash
# Builds stats/dist/function.zip: package.json, src/ and production node_modules.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/bundle
cp package.json package-lock.json dist/bundle/
cp -R src dist/bundle/src
(cd dist/bundle && npm ci --omit=dev --ignore-scripts --silent)
# Fixed timestamps keep the zip (and its hash) stable when nothing changed.
find dist/bundle -exec touch -h -t 202601010000 {} +
(cd dist/bundle && find . -type f | LC_ALL=C sort | zip -X -q ../function.zip -@)
rm -rf dist/bundle
echo "dist/function.zip $(shasum -a 256 dist/function.zip | cut -d' ' -f1)"
