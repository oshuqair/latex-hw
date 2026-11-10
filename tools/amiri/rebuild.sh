#!/usr/bin/env bash
# Regenerate the Amiri Tegaki bundle from the full Amiri font for fonts/amiri/chars.txt.
#   TEGAKI_DIR=/path/to/tegaki tools/amiri/rebuild.sh [--no-install]
# Output: tools/amiri/out/ (gitignored). Takes ~1.5 min.
# The subset font is named amiri-<hash>.ttf; the hash changes when chars.txt changes, and then
# src/node.js, src/browser.js and src/legacy/text-measure.js must point at the new file name.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/out"
: "${TEGAKI_DIR:?set TEGAKI_DIR to a Tegaki clone (with bun install done)}"
mkdir -p "$OUT"
( cd "$TEGAKI_DIR" && bun --filter tegaki-generator start generate \
    --font-file "$ROOT/fonts/amiri/Amiri-Regular.ttf" --full-font true \
    -c "$(cat "$ROOT/fonts/amiri/chars.txt")" -p geometry -o "$OUT/bundle" )
ls "$OUT/bundle"
if [[ "${1:-}" != "--no-install" ]]; then
  cp "$OUT/bundle/glyphData.json" "$OUT/bundle/glyphDataById.json" "$OUT/bundle/bundle.ts" "$OUT"/bundle/amiri-*.ttf "$ROOT/fonts/amiri/"
  echo "installed into fonts/amiri/ — check the amiri-<hash>.ttf name in src/node.js, src/browser.js, src/legacy/text-measure.js"
fi
