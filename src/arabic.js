// Arabic shaping with harfbuzzjs (WASM) against the Amiri subset font that the
// Tegaki Amiri bundle was generated from, so shaped glyph ids index straight
// into the bundle's `glyphDataById`. Replaces latex-svg's `hb-shape` CLI call
// with macOS fonts (text-measure.js), so it runs in Node and in the browser.
//
// Modelled on tegaki/packages/renderer/src/shaper-harfbuzz (MIT, Gokhan Kurt),
// reduced to the single-script, single-direction runs latex-hw needs
// (decision: one script per \text{}).

import { Blob, Buffer as HbBuffer, Direction, Face, Feature, Font, shape } from 'harfbuzzjs';

// Features harfbuzz manages itself for Arabic; the bundle's list is filtered like Tegaki does.
const SHAPER_MANAGED = new Set(['init', 'medi', 'fina', 'isol', 'rlig', 'frac', 'numr', 'dnom']);

function openFont(buffer) {
  const face = new Face(new Blob(buffer), 0);
  const font = new Font(face);
  return { face, font, cmap: new Set(face.collectUnicodes()), upem: face.upem || 1000 };
}

/**
 * @param {object} opts
 * @param {ArrayBuffer} opts.font      the subset TTF the bundle's glyph ids refer to
 * @param {ArrayBuffer} [opts.fullFont] the full font, for outlines/advances of characters the subset lacks
 * @param {object} opts.bundle         Tegaki bundle ({ glyphDataById, features, unitsPerEm })
 */
export function createArabicShaper({ font, fullFont, bundle }) {
  const main = openFont(font);
  const full = fullFont ? openFont(fullFont) : null;
  const features = (bundle.features ?? [])
    .filter((t) => !SHAPER_MANAGED.has(t))
    .map((t) => Feature.fromString(t))
    .filter(Boolean);
  const byId = bundle.glyphDataById ?? {};
  const cache = new Map();

  const run = (f, text, ltr = false) => {
    const buffer = new HbBuffer();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    buffer.setDirection(ltr ? Direction.LTR : Direction.RTL);
    buffer.setScript('Arab');
    shape(f.font, buffer, f === main ? features : []);
    return buffer.getGlyphInfosAndPositions();
  };

  /**
   * Shape one run right to left. Returns glyphs in visual order (left to right)
   * with `x` = pen position from the run's left edge in font units, plus
   * `kind`: 'glyph' (strokes in the bundle), 'space', or 'missing'.
   */
  function shapeRun(text) {
    if (cache.has(text)) return cache.get(text);
    const chars = [...text];
    // UTF-16 offset -> character
    const charAt = new Map();
    let off = 0;
    for (const ch of chars) { charAt.set(off, ch); off += ch.length; }
    // Minimal bidi: numbers (Western or Arabic-Indic digits) read left to right
    // inside the right-to-left run, so ١٠٠ stays ١٠٠. Runs are laid out
    // right to left; each number run keeps its own left-to-right order.
    const segs = [];
    const NUM = /[0-9\u0660-\u0669\u06F0-\u06F9]/u;
    let segStart = 0, segLtr = null;
    for (let k = 0, o = 0; k < chars.length; o += chars[k].length, k++) {
      const ch = chars[k];
      const isSep = /[.,\u066B\u066C]/u.test(ch) && segLtr && NUM.test(chars[k + 1] ?? '');
      const ltr = NUM.test(ch) || !!isSep;
      if (segLtr === null) segLtr = ltr;
      else if (ltr !== segLtr) { segs.push({ start: segStart, end: o, ltr: segLtr }); segStart = o; segLtr = ltr; }
    }
    segs.push({ start: segStart, end: text.length, ltr: !!segLtr });
    const infos = [];
    for (const seg of segs.reverse()) {
      for (const g of run(main, text.slice(seg.start, seg.end), seg.ltr)) infos.push({ ...g, cluster: g.cluster + seg.start, ltr: seg.ltr });
    }
    const glyphs = [];
    let pen = 0;
    for (const g of infos) {
      const ch = charAt.get(g.cluster) ?? '';
      const cp = ch.codePointAt(0) ?? 0;
      const gid = String(g.codepoint);
      let ax = g.xAdvance ?? 0;
      let kind = 'glyph';
      let outline = null;
      if (/\s/u.test(ch)) kind = 'space';
      else if (g.codepoint === 0 || !byId[gid]) {
        kind = 'missing';
        if (full && full.cmap.has(cp)) {
          const alone = run(full, ch)[0];
          ax = alone?.xAdvance ?? ax;
          outline = full.font.glyphToPath(alone.codepoint);
        } else if (g.codepoint !== 0) {
          outline = main.font.glyphToPath(g.codepoint);
        }
      }
      glyphs.push({ gid, cl: g.cluster, ltr: g.ltr, char: ch, x: pen + (g.xOffset ?? 0), y: g.yOffset ?? 0, ax, kind, outline, data: kind === 'glyph' ? byId[gid] : null });
      pen += ax;
    }
    const result = { glyphs, advance: pen };
    cache.set(text, result);
    return result;
  }

  return {
    upem: main.upem,
    shapeRun,
    advance: (text) => shapeRun(text).advance,
    covers: (cp) => main.cmap.has(cp) || (full?.cmap.has(cp) ?? false),
  };
}

export const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
export function isArabicText(text) {
  return ARABIC_RE.test(text);
}
