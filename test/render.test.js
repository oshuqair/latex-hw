import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, layout } from '../src/node.js';

const QUAD_RTL = '\\text{س} = \\frac{-\\text{ب} \\pm \\sqrt{\\text{ب}^\\text{٢} - \\text{٤}\\text{أ}\\text{ج}}}{\\text{٢}\\text{أ}}';
const centerX = (s) => {
  const xs = [...s.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]));
  return (Math.min(...xs) + Math.max(...xs)) / 2;
};

test('deterministic: same input gives byte-identical SVG', async () => {
  const a = await render(QUAD_RTL, { dir: 'rtl' });
  const b = await render(QUAD_RTL, { dir: 'rtl' });
  assert.equal(a.svg, b.svg);
  assert.deepEqual(a.strokes, b.strokes);
});

test('ltr slice renders with no warnings and one path per stroke', async () => {
  const r = await render('\\frac{a+b}{2} = \\sqrt{x^2+1}');
  assert.equal(r.warnings.length, 0);
  assert.equal((r.svg.match(/<path /g) || []).length, r.strokes.length);
  assert.ok(r.svg.includes('stroke-linecap="round"'));
  // every stroke has one constant width
  for (const s of r.strokes) assert.ok(s.width > 0);
});

test('fraction order: numerator, then bar, then denominator', async () => {
  const r = await render('\\frac{a+b}{2}');
  const bar = r.strokes.findIndex((s) => s.source === 'rule');
  assert.ok(bar > 0);
  assert.ok(r.strokes.slice(0, bar).every((s) => /mfrac\/mrow/.test(s.node)));
  assert.ok(r.strokes.slice(bar + 1).every((s) => s.char === '2'));
});

test('radical sign (with its bar) comes before the radicand, as one stroke', async () => {
  const r = await render('\\sqrt{x+1}');
  assert.equal(r.strokes[0].source, 'radical');
  assert.equal(r.strokes.filter((s) => s.source === 'radical').length, 1);
  assert.equal(r.strokes.filter((s) => s.source === 'rule').length, 0);
});

test('base before superscript', async () => {
  const r = await render('x^2');
  assert.equal(r.strokes[0].char, 'x');
  assert.equal(r.strokes.at(-1).char, '2');
});

test('rtl reads right to left at the top level', async () => {
  const r = await render('\\text{أ} + \\text{ب} = \\text{ج}', { dir: 'rtl' });
  const firstOf = (ch) => r.strokes.find((s) => s.char === ch);
  assert.ok(centerX(firstOf('أ')) > centerX(firstOf('ب')));
  assert.ok(centerX(firstOf('ب')) > centerX(firstOf('ج')));
  assert.equal(r.warnings.length, 0);
});

test('rtl quadratic formula: Amiri strokes, mirrored radical, no warnings', async () => {
  const r = await render(QUAD_RTL, { dir: 'rtl' });
  assert.equal(r.warnings.length, 0);
  assert.ok(r.strokes.some((s) => s.font === 'arabic' && s.glyphId));
  const rad = r.strokes.find((s) => s.source === 'radical');
  assert.ok(rad.mirrored);
  // a mirrored radical starts at its tick on the right
  const xs = [...rad.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(xs[0] > xs.at(-1));
});

test('Arabic dots come after letter bodies within a word', async () => {
  const r = await render('\\text{ب}', { dir: 'rtl' });
  const pr = r.strokes.map((s) => s.priority);
  const firstDot = pr.findIndex((p) => p < 0);
  assert.ok(firstDot > 0);
  assert.ok(pr.slice(firstDot).every((p) => p < 0));
});

test('operator words: \\sin -> جا joined, \\lim -> نهـــا with tatweel strokes from Amiri', async () => {
  const r = await render('\\lim_{\\text{س} \\to \\text{٠}} \\sin \\text{س}', { dir: 'rtl' });
  assert.equal(r.warnings.length, 0);
  // Amiri joins ـــا into one long kashida glyph; it is drawn from the bundle.
  const tatweel = r.strokes.filter((s) => s.char === 'ـ');
  assert.ok(tatweel.length >= 1);
  assert.ok(tatweel.every((s) => s.source === 'glyph' && s.font === 'arabic'));
  assert.ok(!r.strokes.some((s) => s.source === 'kashida'));
  assert.ok(r.expression.includes('\\mathop{\\text{جا}}\\nolimits'));
});

test('Arabic punctuation and ؤ come from the Amiri bundle, no fallback', async () => {
  const r = await render('\\text{ؤ، ؛ ؟ ٪ ٣٫٥ ١٬٠٠٠}', { dir: 'rtl' });
  assert.equal(r.warnings.length, 0);
  for (const c of 'ؤ،؛؟٪٫٬') assert.ok(r.strokes.some((s) => s.char === c && s.source === 'glyph'), c);
  // ؤ: the waw body before its hamza
  const w = r.strokes.filter((s) => s.char === 'ؤ');
  assert.ok(w[0].priority === 0 && w.at(-1).priority < 0);
});

test('Greek letters are drawn from Caveat Math, no fallback', async () => {
  const tex = '\\alpha\\beta\\gamma\\delta\\epsilon\\varepsilon\\zeta\\eta\\theta\\vartheta\\iota\\kappa\\lambda\\mu\\nu\\xi\\pi\\varpi\\rho\\varrho\\sigma\\varsigma\\tau\\upsilon\\phi\\varphi\\chi\\psi\\omega' +
    '\\Gamma\\Delta\\Theta\\Lambda\\Xi\\Pi\\Sigma\\Upsilon\\Phi\\Psi\\Omega';
  for (const dir of ['ltr', 'rtl']) {
    const r = await render(tex, { dir });
    assert.deepEqual(r.warnings, [], dir);
    assert.ok(r.strokes.every((s) => s.source === 'glyph'), dir);
  }
});

test('rtl relations are mirrored by default and drawn as their partner glyph', async () => {
  const r = await render('\\text{س} < \\text{٥} \\le \\text{ص}', { dir: 'rtl' });
  const lt = r.strokes.filter((s) => s.char === '<');
  const le = r.strokes.filter((s) => s.char === '≤');
  assert.ok(lt.length && lt.every((s) => s.mirrored && s.glyphId === '>'));
  assert.ok(le.length && le.every((s) => s.mirrored && s.glyphId === '≥'));
  // the point of < faces س, which is on the right in rtl
  const pts = [...lt[0].d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]));
  const mid = pts[Math.floor(pts.length / 2)];
  assert.ok(mid > pts[0] && mid > pts.at(-1), 'vertex on the right');
  const off = await render('\\text{س} < \\text{٥}', { dir: 'rtl', mirrorRelations: false });
  assert.ok(off.strokes.filter((s) => s.char === '<').every((s) => !s.glyphId));
});

test('rtl relations without a partner in Caveat Math are reflected (⊨)', async () => {
  const l = await layout('a \\models b', { dir: 'rtl' });
  const m = l.elements.find((e) => e.char === '⊨');
  assert.ok(m.mirrored && !m.drawnAs);
  const l2 = await layout('a \\in B', { dir: 'rtl' });
  assert.equal(l2.elements.find((e) => e.char === '∈').drawnAs, '∋');
});

test('horizontal arrows are mirrored in rtl', async () => {
  const l = await layout('\\text{س} \\to \\text{ص}', { dir: 'rtl' });
  const arrow = l.elements.find((e) => e.char === '→');
  assert.ok(arrow.mirrored);
});

test('digits keep their order in rtl text (١٠٠)', async () => {
  const r = await render('\\text{١٠٠}', { dir: 'rtl' });
  const one = r.strokes.find((s) => s.char === '١');
  const zero = r.strokes.find((s) => s.char === '٠');
  assert.ok(centerX(one) < centerX(zero), '١ is drawn left of the zeros');
});

test('unknown glyph falls back to its outline with a warning, never silently', async () => {
  const r = await render('\\aleph');
  assert.ok(r.strokes.length > 0);
  assert.ok(r.warnings.some((w) => w.code === 'fallback-glyph' && w.char === 'ℵ'));
});

test('TeX errors are reported and drawn, not dropped', async () => {
  const r = await render('\\frac{a}{b');
  assert.ok(r.warnings.some((w) => w.code === 'tex-error'));
  assert.ok(r.strokes.length > 0);
});

test('element list has glyphs, rules, stretchy parts and text runs with matrices', async () => {
  const l = await layout('\\left( \\begin{matrix} a \\\\ b \\\\ c \\end{matrix} \\right) \\frac{\\text{س}}{2}', { dir: 'rtl' });
  const kinds = new Set(l.elements.map((e) => e.kind));
  for (const k of ['glyph', 'rule', 'stretchy', 'text-run']) assert.ok(kinds.has(k), k);
  for (const e of l.elements) if (e.matrix) assert.equal(e.matrix.length, 6);
});
