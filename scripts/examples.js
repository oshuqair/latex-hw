#!/usr/bin/env node
// Render the review targets into examples/: <name>.svg, <name>.json, and (when
// python3 + cairosvg are available) <name>.png and <name>.order.png.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { render } from '../src/node.js';

export const TARGETS = [
  ['ltr-fraction-sqrt', 'ltr', '\\frac{a+b}{2} = \\sqrt{x^2+1}'],
  ['ltr-quadratic', 'ltr', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'],
  ['ltr-limit', 'ltr', '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'],
  ['ltr-sum-integral', 'ltr', '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}, \\quad \\int_0^1 x^2 \\, dx = \\frac{1}{3}'],
  ['ltr-matrix', 'ltr', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\begin{bmatrix} x \\\\ y \\end{bmatrix} = \\left( \\frac{a}{b} \\right)'],
  ['rtl-quadratic', 'rtl', '\\text{س} = \\frac{-\\text{ب} \\pm \\sqrt{\\text{ب}^\\text{٢} - \\text{٤}\\text{أ}\\text{ج}}}{\\text{٢}\\text{أ}}'],
  ['rtl-pythagoras', 'rtl', '\\text{أ}^\\text{٢} + \\text{ب}^\\text{٢} = \\text{ج}^\\text{٢}'],
  ['rtl-limit-sin', 'rtl', '\\lim_{\\text{س} \\to \\text{٠}} \\frac{\\sin \\text{س}}{\\text{س}} = \\text{١}'],
  ['rtl-distance', 'rtl', '\\text{ف} = \\sqrt{(\\text{س}_\\text{٢} - \\text{س}_\\text{١})^\\text{٢} + (\\text{ص}_\\text{٢} - \\text{ص}_\\text{١})^\\text{٢}}'],
  ['rtl-sum', 'rtl', '\\sum_{\\text{ك} = \\text{١}}^{\\text{ن}} \\text{ك} = \\frac{\\text{ن}(\\text{ن} + \\text{١})}{\\text{٢}}'],
  ['rtl-integral', 'rtl', '\\int \\text{س}^\\text{ن} \\, d\\text{س} = \\frac{\\text{س}^{\\text{ن} + \\text{١}}}{\\text{ن} + \\text{١}} + \\text{ث}'],
  ['rtl-log', 'rtl', '\\log(\\text{س}\\text{ص}) = \\log \\text{س} + \\log \\text{ص}'],
  ['rtl-vmatrix', 'rtl', '\\begin{vmatrix} \\text{أ} & \\text{ب} \\\\ \\text{ج} & \\text{د} \\end{vmatrix} = \\text{أ}\\text{د} - \\text{ب}\\text{ج}'],
  ['rtl-trig-theta', 'rtl', '\\sin^\\text{٢}\\theta + \\cos^\\text{٢}\\theta = \\text{١}'],
  ['rtl-cases', 'rtl', '\\text{د}(\\text{س}) = \\begin{cases} \\text{أ}\\text{س} + \\text{ب} & \\text{س} < \\text{٠} \\\\ \\text{س}^\\text{٢} & \\text{٠} \\le \\text{س} < \\text{١} \\\\ \\text{س} + \\text{١} & \\text{س} \\ge \\text{١} \\end{cases}'],
  ['rtl-brackets', 'rtl', '\\left[ \\begin{matrix} \\text{أ} & \\text{ب} \\\\ \\text{ج} & \\text{د} \\end{matrix} \\right] \\left\\langle \\begin{matrix} \\text{س}_\\text{١} \\\\ \\text{س}_\\text{٢} \\end{matrix} \\right\\rangle \\left\\lfloor \\text{س} \\right\\rfloor \\left\\lceil \\frac{\\text{أ}}{\\text{ب}} \\right\\rceil'],
  ['ltr-vec-dots', 'ltr', '\\vec{F} = m\\vec{a}, \\quad a_1 + \\cdots + a_n, \\quad \\left\\{ x \\mid x > 0 \\right\\}'],
  ['rtl-phrase-arrow', 'rtl', '\\text{النسبة المئوية} = \\frac{\\text{الجزء}}{\\text{الكل}} \\times \\text{١٠٠} \\Rightarrow \\text{س} \\xrightarrow{} \\text{ص}'],
];

const outDir = new URL('../examples/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const only = process.argv.slice(2);
let havePy = true;
const summary = [];
for (const [name, dir, tex] of TARGETS) {
  if (only.length && !only.includes(name)) continue;
  const r = await render(tex, { dir });
  writeFileSync(`${outDir}${name}.svg`, r.svg);
  writeFileSync(`${outDir}${name}.json`, JSON.stringify({ latex: tex, dir, width: r.width, height: r.height, baseline: r.baseline, totalDuration: r.totalDuration, warnings: r.warnings, strokes: r.strokes }, null, 1));
  summary.push({ name, dir, strokes: r.strokes.length, seconds: r.totalDuration, warnings: r.warnings.map((w) => w.code + (w.char ? `:${w.char}` : '')) });
  if (havePy) {
    try {
      execFileSync('python3', ['scripts/raster.py', 'final', `${outDir}${name}.svg`, `${outDir}${name}.png`]);
      execFileSync('python3', ['scripts/raster.py', 'order', `${outDir}${name}.svg`, `${outDir}${name}.order.png`]);
    } catch (e) {
      havePy = false;
      console.warn('PNG export skipped (needs python3 + cairosvg):', e.message.split('\n')[0]);
    }
  }
}
console.table(summary);
if (!only.length) writeFileSync(`${outDir}index.json`, JSON.stringify(TARGETS.map(([name, dir, latex]) => ({ name, dir, latex })), null, 1));
