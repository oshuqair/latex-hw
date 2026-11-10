#!/usr/bin/env node
// Smoke test: render every expression in samples/arabic-samples.txt and
// samples/gpt-samples.txt in rtl; report errors and warnings.
import { writeFileSync, mkdirSync } from 'node:fs';
import { render } from '../src/node.js';
import { loadSamples } from './smoke-lib.js';

const samples = loadSamples();
const rows = [];
const codes = {};
let clean = 0, errors = 0;
const t0 = Date.now();
for (const [i, s] of samples.entries()) {
  try {
    const r = await render(s.tex, { dir: 'rtl' });
    const w = r.warnings;
    if (!w.length) clean++;
    for (const x of w) { const k = x.code + (x.char ? ` ${x.char}` : ''); codes[k] = (codes[k] ?? 0) + 1; }
    rows.push({ i, set: s.set, strokes: r.strokes.length, warnings: w.map((x) => x.code + (x.char ? `:${x.char}` : '')).join(' '), tex: s.tex });
  } catch (e) {
    errors++;
    rows.push({ i, set: s.set, error: String(e.message), tex: s.tex });
  }
}
const report = { total: samples.length, clean, withWarnings: samples.length - clean - errors, errors, ms: Date.now() - t0, warningCounts: codes, rows };
mkdirSync(new URL('../examples/', import.meta.url), { recursive: true });
writeFileSync(new URL('../examples/smoke-report.json', import.meta.url), JSON.stringify(report, null, 1));
console.log(`${report.total} expressions: ${clean} clean, ${report.withWarnings} with warnings, ${errors} errors (${report.ms} ms)`);
console.log(Object.entries(codes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${v}× ${k}`).join('\n'));
