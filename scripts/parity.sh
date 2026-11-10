#!/usr/bin/env bash
# Browser/Node parity: render the same expression in headless Chrome (dist bundle) and Node; compare bytes.
# Needs: npm run build:browser, npm run demo (port 8787), google-chrome.
set -euo pipefail
TEX=${1:-'\text{س} = \frac{-\text{ب} \pm \sqrt{\text{ب}^\text{٢} - \text{٤}\text{أ}\text{ج}}}{\text{٢}\text{أ}}'}
DIR=${2:-rtl}
Q=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$TEX")
"${CHROME:-google-chrome}" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=20000 --dump-dom "http://localhost:${PORT:-8787}/test/browser/parity.html?dir=$DIR&tex=$Q" 2>/dev/null \
  | sed -n 's/.*<pre id="out">\([^<]*\)<\/pre>.*/\1/p' | base64 -d > /tmp/latex-hw-browser.svg
node bin/latex-hw.js "$TEX" --dir "$DIR" > /tmp/latex-hw-node.svg 2>/dev/null
if cmp -s /tmp/latex-hw-browser.svg /tmp/latex-hw-node.svg; then echo "parity OK ($(wc -c < /tmp/latex-hw-node.svg) bytes identical)"; else echo "parity MISMATCH"; diff <(tr '>' '\n' < /tmp/latex-hw-browser.svg) <(tr '>' '\n' < /tmp/latex-hw-node.svg) | head; exit 1; fi
