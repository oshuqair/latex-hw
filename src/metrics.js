// Caveat Math metrics for MathJax's TeX font data.
// Glyphs used to be drawn inside Latin Modern boxes, so the gaps were TeX's.
// Text-size characters that Caveat has are given Caveat's advance, height, depth
// and italic correction (scaled by latinScale, since the strokes are too), and
// drawn from Caveat's own origin. Size variants (large operators, stretched
// delimiters, wide accents) keep TeX's boxes: those strokes are fitted or synthesized.

import { plainChar, PIECE_RANGE } from './chars.js';

const ARABIC_LETTER = /[\u0600-\u06FF]/u;
const LATIN_LETTER = /[A-Za-z]/;
// A word space inside a Latin \\text{} run, in ems. Caveat has no space glyph.
const LATIN_SPACE_EM = 0.25;
const LATIN_MISSING_EM = 0.5;

/** A \\text{} run of Latin letters (digits and spaces may ride along), with no Arabic. */
export function isLatinText(text) {
  return LATIN_LETTER.test(text) && !ARABIC_LETTER.test(text);
}

/**
 * Left-to-right placement of a Latin \\text{} run in Caveat font units.
 * `x` is the pen at the left of each character. Missing glyphs keep a slot
 * (`g` null) so the advance matches what is drawn.
 */
export function latinRunLayout(text, glyphData, upem = 1000) {
  const u = upem || 1000;
  const glyphs = [];
  let pen = 0;
  for (const ch of text) {
    if (/\s/u.test(ch)) {
      const w = LATIN_SPACE_EM * u;
      glyphs.push({ char: ch, x: pen, w, space: true, g: null });
      pen += w;
      continue;
    }
    const g = glyphData?.[ch] ?? glyphData?.[ch.normalize('NFKC')] ?? null;
    const known = !!(g?.s?.length && g.w > 0);
    const w = known ? g.w : LATIN_MISSING_EM * u;
    glyphs.push({ char: ch, x: pen, w, space: false, g: known ? g : null });
    pen += w;
  }
  return { glyphs, advance: pen };
}

// MathJax SVG cache id → font variant name (tex.js variantCacheIds).
const CACHE_TO_VARIANT = {
  N: 'normal', B: 'bold', I: 'italic', BI: 'bold-italic',
  D: 'double-struck', F: 'fraktur', BF: 'bold-fraktur',
  S: 'script', BS: 'bold-script', SS: 'sans-serif', BSS: 'bold-sans-serif',
  SSI: 'sans-serif-italic', SSBI: 'sans-serif-bold-italic', M: 'monospace',
  SO: '-smallop', LO: '-largeop', S3: '-size3', S4: '-size4',
  C: '-tex-calligraphic', BC: '-tex-bold-calligraphic',
  MI: '-tex-mathit', OS: '-tex-oldstyle', BOS: '-tex-bold-oldstyle',
  V: '-tex-variant',
};

// Big glyphs and wide accents: the path is a size variant, not Caveat's text glyph.
const SKIP_VARIANTS = new Set(['-smallop', '-largeop', '-size3', '-size4', '-tex-variant']);
// The radical is synthesized from the TeX surd box, so its metrics stay TeX's.
const SKIP_CODES = new Set([0x221a, 0x23b7]);

const r4 = (n) => Math.round(n * 10000) / 10000;

function expandedInk(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let topX = 0, topN = 0, topCut = 0;
  const pts = [];
  for (const s of g.s) for (const p of s.p) {
    const r = (p[2] ?? 0) / 2;
    x0 = Math.min(x0, p[0] - r);
    y0 = Math.min(y0, p[1] - r);
    x1 = Math.max(x1, p[0] + r);
    y1 = Math.max(y1, p[1] + r);
    pts.push(p);
  }
  // y is down. The accent wants the x of the top of the letter, not the right overhang.
  topCut = y0 + 0.18 * (y1 - y0);
  for (const p of pts) if (p[1] <= topCut) { topX += p[0]; topN += 1; }
  return { x0, y0, x1, y1, topX: topN ? topX / topN : (x0 + x1) / 2 };
}

/** char → { w, h, d, ic, sk } in em, before latinScale. */
export function caveatMetrics(glyphData, upem = 1000) {
  const u = upem || 1000;
  const map = new Map();
  for (const [ch, g] of Object.entries(glyphData)) {
    if (!g?.s?.length || !(g.w > 0)) continue;
    const ink = expandedInk(g);
    const w = g.w / u;
    const h = Math.max(0, -ink.y0) / u;
    const d = Math.max(0, ink.y1) / u;
    // MathJax adds a math-italic letter's italic correction to its width, so ic
    // would open a gap on top of Caveat's advance. Keep ic at 0 and let the
    // advance be the whole gap (Caveat's overhang tucks into the next letter,
    // as it does in the font). sk puts accents over the top of the letter.
    const sk = (ink.topX - g.w / 2) / u;
    const m = { w, h, d, ic: 0, sk: r4(sk) };
    map.set(ch, m);
    const n = ch.normalize('NFKC');
    if (n !== ch && !map.has(n)) map.set(n, m);
  }
  return map;
}

function codesOf(chars) {
  const out = [];
  for (let o = chars; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const k of Object.keys(o)) {
      const n = +k;
      if (Number.isInteger(n) && n >= 0) out.push(n);
    }
  }
  return out;
}

// The char arrays to rewrite, discovered once (the TeX font object is a singleton).
let patchSlots = null;
function slotsFor(font) {
  if (patchSlots) return patchSlots;
  const list = [];
  const seen = new Set();
  for (const name of Object.keys(font.variant)) {
    if (SKIP_VARIANTS.has(name)) continue;
    const chars = font.variant[name].chars;
    for (const code of codesOf(chars)) {
      if (SKIP_CODES.has(code) || PIECE_RANGE(code)) continue;
      const data = chars[code];
      if (!data || typeof data[2] !== 'number' || !(data[2] > 0) || seen.has(data)) continue;
      const opt = data[3];
      if (opt?.c || opt?.unknown || opt?.smp != null) continue;
      const ch = plainChar(code);
      if (!ch) continue;
      seen.add(data);
      list.push({ data, ch });
    }
  }
  patchSlots = list;
  return list;
}

/**
 * Overwrite text-size char metrics with Caveat's. Called before every convert
 * because latinScale is per render and the MathJax font is a singleton.
 * Size-variant tables are left alone.
 */
export function applyCaveatMetrics(font, metrics, scale) {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  for (const { data, ch } of slotsFor(font)) {
    const m = metrics.get(ch);
    if (!m) continue;
    data[0] = r4(m.h * s);
    data[1] = r4(m.d * s);
    data[2] = r4(m.w * s);
    if (!data[3]) data[3] = {};
    data[3].ic = r4(m.ic * s);
    data[3].sk = r4(m.sk * s);
  }
}

/** True when this glyph's layout advance is Caveat's (so strokes use Caveat's origin). */
export function layoutUsesCaveat(font, metrics, code, variantCacheId, scale) {
  const name = CACHE_TO_VARIANT[variantCacheId];
  if (!name || SKIP_VARIANTS.has(name)) return false;
  if (SKIP_CODES.has(code) || PIECE_RANGE(code)) return false;
  const ch = plainChar(code);
  const m = ch ? metrics.get(ch) : null;
  if (!m) return false;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const data = font.getChar(name, code);
  return !!data && typeof data[2] === 'number' && Math.abs(data[2] - r4(m.w * s)) < 0.00005;
}
