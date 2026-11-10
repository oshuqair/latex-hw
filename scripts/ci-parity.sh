#!/usr/bin/env bash
# Start the demo server, run the browser/Node parity check (rtl + ltr), stop the server.
# Needs: npm run build:browser first, and google-chrome (or CHROME=/path/to/chrome).
set -euo pipefail
cd "$(dirname "$0")/.."
export PORT=${PORT:-8787}
node scripts/serve-demo.js > /tmp/latex-hw-demo.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -sf "http://localhost:$PORT/test/browser/parity.html" > /dev/null && break; sleep 0.2; done
./scripts/parity.sh
./scripts/parity.sh '\sqrt{\frac{a}{b}} + \sum_{i=1}^{n} \alpha_i \neq \int_0^1 f(x)\,dx' ltr
