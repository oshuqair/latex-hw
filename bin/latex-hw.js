#!/usr/bin/env node
// latex-hw CLI: LaTeX -> handwriting stroke SVG (+ optional strokes JSON / element list).
import { readFileSync, writeFileSync } from 'node:fs';
import { stdin, stderr, stdout } from 'node:process';
import { render, layout } from '../src/node.js';

const help = `latex-hw: LaTeX math -> SVG of ordered handwriting strokes.

Usage:
  latex-hw '<latex>' [options]
  latex-hw -f formula.tex --dir rtl -o formula.svg
  echo '\\frac{a}{b}' | latex-hw -o fraction.svg

Options:
  -d, --dir <ltr|rtl>     reading direction (default ltr); rtl mirrors the layout
  -o, --out <file>        write the SVG here (default: stdout)
  -j, --json <file>       also write { strokes, warnings, ... } as JSON
      --layout <file>     also write the positioned element list (JSON)
  -f, --file <file>       read the expression from a file
  -i, --inline            inline (text) style instead of display style
  -s, --font-size <px>    px per em (default 48)
      --scale <n>         size multiplier (default 1)
      --color <css>       stroke colour (default #000)
      --mirror-relations  rtl: keep < > ≤ ≥ ⊂ ∈ mirrored (Unicode bidi style)
      --no-translate      rtl: keep \\sin, \\log... as Latin words
  -h, --help              show this help

Use single quotes in the shell so backslashes reach latex-hw.
$$...$$, \\[...\\], $...$ and \\(...\\) wrappers are stripped.
Warnings go to stderr; the exit code is 0 even with warnings.
`;

function parse(argv) {
  const o = { dir: 'ltr', out: null, json: null, layout: null, file: null, display: true, fontSize: 48, scale: 1, color: '#000', mirrorRelations: false, translateOperators: true, parts: [] };
  const need = (i, f) => { if (i >= argv.length) throw new Error(`Missing value for ${f}`); return argv[i]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-d' || a === '--dir') o.dir = need(++i, a);
    else if (a === '-o' || a === '--out') o.out = need(++i, a);
    else if (a === '-j' || a === '--json') o.json = need(++i, a);
    else if (a === '--layout') o.layout = need(++i, a);
    else if (a === '-f' || a === '--file') o.file = need(++i, a);
    else if (a === '-i' || a === '--inline') o.display = false;
    else if (a === '-s' || a === '--font-size') o.fontSize = Number(need(++i, a));
    else if (a === '--scale') o.scale = Number(need(++i, a));
    else if (a === '--color') o.color = need(++i, a);
    else if (a === '--mirror-relations') o.mirrorRelations = true;
    else if (a === '--no-translate') o.translateOperators = false;
    else if (a === '--') { o.parts.push(...argv.slice(i + 1)); break; }
    else if (a.startsWith('-') && a.length > 1) throw new Error(`Unknown option: ${a}`);
    else o.parts.push(a);
  }
  if (o.dir !== 'ltr' && o.dir !== 'rtl') throw new Error('--dir must be ltr or rtl');
  return o;
}

const readStdin = () => new Promise((res, rej) => { const c = []; stdin.on('data', (d) => c.push(d)); stdin.on('end', () => res(Buffer.concat(c).toString('utf8'))); stdin.on('error', rej); });

async function main() {
  const o = parse(process.argv.slice(2));
  if (o.help) return void stdout.write(help);
  let tex = o.parts.join(' ');
  if (o.file && tex) throw new Error('Pass an expression or --file, not both.');
  if (o.file) tex = readFileSync(o.file, 'utf8');
  else if (!tex) {
    if (stdin.isTTY) return void stdout.write(help);
    tex = await readStdin();
  }
  const opts = { dir: o.dir, display: o.display, fontSize: o.fontSize, scale: o.scale, color: o.color, mirrorRelations: o.mirrorRelations, translateOperators: o.translateOperators };
  const r = await render(tex, opts);
  if (o.out) { writeFileSync(o.out, r.svg); stderr.write(`wrote ${o.out} (${r.strokes.length} strokes, ${r.totalDuration}s)\n`); }
  else stdout.write(r.svg);
  if (o.json) writeFileSync(o.json, JSON.stringify({ latex: tex, dir: o.dir, width: r.width, height: r.height, baseline: r.baseline, totalDuration: r.totalDuration, warnings: r.warnings, strokes: r.strokes }, null, 1));
  if (o.layout) writeFileSync(o.layout, JSON.stringify(await layout(tex, opts), null, 1));
  for (const w of r.warnings) stderr.write(`warning [${w.code}] ${w.message}\n`);
}

main().catch((e) => { stderr.write(`${e.message}\n`); process.exit(1); });
