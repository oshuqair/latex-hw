#!/usr/bin/env bash
# Rebuild Caveat Math (font + Tegaki bundle) and install it into fonts/caveat-math/.
#   TEGAKI_DIR=/path/to/tegaki tools/caveat-math/rebuild.sh [--no-install]
# Needs: python3 with fontTools, skia-pathops, numpy, Pillow; bun; a Tegaki clone
# (git clone https://github.com/gkurt/tegaki && cd tegaki && bun install).
# Output goes to tools/caveat-math/out/ (gitignored). The Tegaki step takes ~2.5 min.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/out"
: "${TEGAKI_DIR:?set TEGAKI_DIR to a Tegaki clone (with bun install done)}"
mkdir -p "$OUT"
python3 "$HERE/build.py" "$OUT/CaveatMath-Regular.ttf"          # also writes $OUT/caveat-math.strokes.json
( cd "$TEGAKI_DIR" && bun --filter tegaki-generator start generate \
    --font-file "$OUT/CaveatMath-Regular.ttf" -c true -p geometry \
    --reference-file "$OUT/caveat-math.strokes.json" -o "$OUT/bundle" )
if [[ "${1:-}" != "--no-install" ]]; then
  cp "$OUT/bundle/glyphData.json" "$OUT/bundle/CaveatMath-Regular.ttf" "$OUT/caveat-math.strokes.json" "$ROOT/fonts/caveat-math/"
  echo "installed into fonts/caveat-math/ — now run: npm test && npm run smoke && npm run examples"
fi
