// latex-hw: LaTeX math in, a static SVG of ordered handwriting strokes out.
// Pipeline: preprocess -> MathJax 3 TeX->SVG -> flatten -> (rtl mirror) ->
// glyph / geometry strokes -> writing order + timing -> SVG + JSON.

import { getMathJax, setTextMeasurer, stripDelimiters } from './mathjax.js';
import { flatten } from './flatten.js';
import { createStrokeBuilder } from './strokes.js';
import { orderUnits } from './order.js';
import { createArabicShaper } from './arabic.js';
import { translateOperators, DEFAULT_DICTIONARY, parseDictionary } from './dictionary.js';
import { emitSvg } from './svg.js';
import { elementList } from './elements.js';

export { keepMirroredCharacters, mirroredRelations, relationPairs, rtlStrokeDirection, rtlGlyphPolicy } from './mirror-set.js';
export { translateOperators, parseDictionary, DEFAULT_DICTIONARY } from './dictionary.js';
export { stripDelimiters } from './mathjax.js';
export { synthShape } from './strokes.js';

const DEFAULTS = {
  dir: 'ltr',
  display: undefined,
  fontSize: 48,
  scale: 1,
  translateOperators: true,
  color: '#000',
  latinScale: 1.2,
  arabicScale: 1.0,
  penScale: 0.85,
  strokeWidth: 'uniform',
  margin: undefined,
  unitPause: 0.12,
  mirrorRelations: true,
};

function meanBundleWidth(glyphData, chars = 'abcdexyz0123456789+=') {
  let sum = 0, n = 0;
  for (const ch of chars) {
    const g = glyphData[ch];
    if (!g) continue;
    for (const s of g.s) for (const p of s.p) { sum += p[2] ?? 0; n += 1; }
  }
  return n ? sum / n : 55;
}

/**
 * @param {object} init
 * @param {object} init.fonts  { latin: TegakiBundle-like ({ glyphData }), arabic?: ({ glyphDataById, features }) }
 * @param {object} [init.fontData] { arabic: ArrayBuffer (subset TTF for the bundle ids), arabicFull?: ArrayBuffer }
 */
export async function createRenderer(init = {}) {
  const latin = init.fonts?.latin;
  if (!latin?.glyphData) throw new Error('createRenderer: fonts.latin (a Tegaki bundle with glyphData) is required. In Node use createNodeRenderer() from "latex-hw/node".');
  const arabic = init.fonts?.arabic ?? null;
  let arabicShaper = null;
  if (arabic && init.fontData?.arabic) {
    arabicShaper = createArabicShaper({ font: init.fontData.arabic, fullFont: init.fontData.arabicFull, bundle: arabic });
  }
  const mj = getMathJax();
  const latinPen = meanBundleWidth(latin.glyphData);
  const dictionary = init.dictionary ? (typeof init.dictionary === 'string' ? parseDictionary(init.dictionary) : init.dictionary) : DEFAULT_DICTIONARY;

  function prepare(latex, options) {
    const opts = { ...DEFAULTS, ...options };
    const warnings = [];
    const seen = new Set();
    const warn = (code, message, char) => {
      const key = `${code}|${message}`;
      if (seen.has(key)) return;
      seen.add(key);
      warnings.push(char ? { code, message, char } : { code, message });
    };
    const rtl = opts.dir === 'rtl';
    const source = String(latex ?? '');
    if (!source.trim()) throw new Error('Enter a LaTeX expression.');
    const stripped = stripDelimiters(source);
    const display = opts.display ?? stripped.display ?? true;
    let expression = stripped.tex;
    if (rtl && opts.translateOperators) expression = translateOperators(expression, dictionary);

    const measure = (text, fontSize) => {
      if (!arabicShaper) return null;
      return arabicShaper.advance(text) * (fontSize / arabicShaper.upem) * opts.arabicScale;
    };
    setTextMeasurer(measure);
    let svgNode;
    try {
      svgNode = mj.convert(expression, { display });
    } catch (err) {
      warn('tex-error', String(err.message || err));
      // Draw the error message itself so nothing disappears silently.
      const safe = String(err.message || 'TeX error').replace(/[\\{}$&#^_%~]/g, ' ').slice(0, 120);
      svgNode = mj.convert(`\\text{${safe}}`, { display });
    }
    const flat = flatten(mj.adaptor, svgNode, { measure });
    const pen = latinPen * opts.latinScale * opts.penScale;
    const builder = createStrokeBuilder({ latin, arabic, arabicShaper, rtl, viewBox: flat.viewBox, pen, warn, opts });
    return { opts, rtl, flat, builder, pen, warn, warnings, expression };
  }

  /** LaTeX -> { svg, strokes, width, height, baseline, totalDuration, warnings }. */
  function render(latex, options = {}) {
    const { opts, rtl, flat, builder, pen, warn, warnings, expression } = prepare(latex, options);
    const units = orderUnits(flat.root, builder, { rtl, warn });
    const result = emitSvg(units, { ...opts, rtl, viewBox: flat.viewBox, pen, fontSize: opts.fontSize * opts.scale });
    return { ...result, warnings, expression };
  }

  /** The flat positioned element list (MathJax units, y down, after the rtl mirror). */
  function layout(latex, options = {}) {
    const { opts, rtl, flat, builder, warnings, expression } = prepare(latex, options);
    return { unitsPerEm: 1000, viewBox: flat.viewBox, dir: rtl ? 'rtl' : 'ltr', elements: elementList(flat, builder, { rtl, opts }), warnings, expression };
  }

  return { render, layout };
}

let defaultRenderer = null;
/** Register the renderer used by the one-shot `render()` (the Node helper does this for you). */
export function setDefaultRenderer(r) {
  defaultRenderer = r;
}
export async function render(latex, options) {
  if (!defaultRenderer) throw new Error('No default renderer: call setDefaultRenderer(await createRenderer({...})) or use latex-hw/node.');
  return (await defaultRenderer).render(latex, options);
}
export async function layout(latex, options) {
  if (!defaultRenderer) throw new Error('No default renderer: call setDefaultRenderer(await createRenderer({...})) or use latex-hw/node.');
  return (await defaultRenderer).layout(latex, options);
}
