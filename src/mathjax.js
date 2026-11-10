// MathJax 3.2 setup, ported from latex-svg src/convert.js:
// AllPackages minus noerrors/noundefined, liteAdaptor (browser + Node), per-call
// TeX reset, user macro clearing, delimiter stripping, keepPhrasesTogether.
// Changed: text runs are measured by a pluggable measurer (harfbuzzjs + Amiri)
// instead of the hb-shape CLI.

import mathjaxModule from 'mathjax-full/js/mathjax.js';
import texModule from 'mathjax-full/js/input/tex.js';
import svgModule from 'mathjax-full/js/output/svg.js';
import liteModule from 'mathjax-full/js/adaptors/liteAdaptor.js';
import htmlModule from 'mathjax-full/js/handlers/html.js';
import allPackagesModule from 'mathjax-full/js/input/tex/AllPackages.js';
import textNodeModule from 'mathjax-full/js/output/svg/Wrappers/TextNode.js';

const { mathjax } = mathjaxModule;
const { TeX } = texModule;
const { SVG } = svgModule;
const { liteAdaptor } = liteModule;
const { RegisterHTMLHandler } = htmlModule;
const { AllPackages } = allPackagesModule;
const { SVGTextNode } = textNodeModule;

/** Current text measurer: (text, fontSize) => advance in the same units as fontSize, or null. */
let currentMeasurer = null;
export function setTextMeasurer(fn) {
  currentMeasurer = fn;
}

function isSpacer(code) {
  return /\s/u.test(String.fromCodePoint(code));
}

/** A phrase such as النسبة المئوية is one run, spaces included (latex-svg). */
function isConnectedPhrase(wrapper) {
  const variant = wrapper.parent?.variant;
  const text = wrapper.node?.getText?.() ?? '';
  if (!variant || variant === '-explicitFont' || [...text].length < 2) return false;
  // Arabic text (one script per \\text{}): the whole run goes to the Arabic shaper,
  // digits, = ≠ % and punctuation included, so letters join and numbers keep their order.
  if (/[\u0600-\u06FF]/u.test(text) && !/[A-Za-z]/.test(text)) return true;
  const chars = wrapper.remappedText(text, variant);
  if (chars.length < 2) return false;
  let letters = 0;
  for (const code of chars) {
    if (wrapper.getVariantChar(variant, code)[3]?.unknown) {
      letters += 1;
      continue;
    }
    if (isSpacer(code)) continue;
    return false;
  }
  return letters > 0;
}

export function keepPhrasesTogether() {
  if (SVGTextNode.prototype.__latexHwPatched) return;
  SVGTextNode.prototype.__latexHwPatched = true;
  const drawText = SVGTextNode.prototype.toSVG;
  const measureText = SVGTextNode.prototype.computeBBox;
  SVGTextNode.prototype.toSVG = function (parent) {
    if (!isConnectedPhrase(this)) return drawText.call(this, parent);
    this.adaptor.append(parent, this.jax.unknownText(this.node.getText(), this.parent.variant));
  };
  SVGTextNode.prototype.computeBBox = function (bbox, recompute) {
    if (!isConnectedPhrase(this)) return measureText.call(this, bbox, recompute);
    const box = this.jax.measureText(this.node.getText(), this.parent.variant);
    bbox.empty();
    bbox.w = box.w;
    bbox.h = box.h;
    bbox.d = box.d;
    bbox.clean();
  };
}

const USER_MAPS = new Set(['new-Command', 'new-Delimiter', 'new-Environment']);

export function stripDelimiters(input) {
  const text = String(input ?? '').trim();
  const pairs = [['$$', '$$', true], ['\\[', '\\]', true], ['\\(', '\\)', false], ['$', '$', false]];
  for (const [open, close, display] of pairs) {
    if (text.startsWith(open) && text.endsWith(close) && text.length > open.length + close.length) {
      return { tex: text.slice(open.length, -close.length).trim(), display };
    }
  }
  return { tex: text, display: null };
}

function clearUserMacros(tex) {
  const groups = tex.parseOptions?.handlers?.map;
  if (!groups) return;
  for (const group of groups.values()) {
    for (const entry of group._configuration) {
      const symbolMap = entry.item;
      if (USER_MAPS.has(symbolMap?.name)) symbolMap.map?.clear();
    }
  }
}

function findSvg(adaptor, node) {
  if (!node || typeof node === 'string') return null;
  if (adaptor.kind(node) === 'svg') return node;
  for (const child of adaptor.childNodes(node)) {
    const found = findSvg(adaptor, child);
    if (found) return found;
  }
  return null;
}

let engine = null;

/** Load MathJax once. Returns { adaptor, convert(tex, { display }) -> svg lite node }. */
export function getMathJax() {
  if (engine) return engine;
  const adaptor = liteAdaptor();
  const fallbackSize = adaptor.nodeSize.bind(adaptor);
  adaptor.nodeSize = (node, em, local) => {
    if (adaptor.kind(node) === 'text' && currentMeasurer) {
      const content = adaptor.textContent(node);
      const fontSize = Number.parseFloat(adaptor.getAttribute(node, 'font-size')) || 884;
      const advance = content ? currentMeasurer(content, fontSize) : null;
      if (advance != null) return [advance / 1000, 0.8];
    }
    return fallbackSize(node, em, local);
  };
  RegisterHTMLHandler(adaptor);
  const packages = AllPackages.filter((name) => name !== 'noerrors' && name !== 'noundefined');
  const tex = new TeX({
    packages,
    formatError(_jax, err) {
      const message = String(err?.message || 'Could not parse that expression.').split('\n')[0];
      throw new Error(message);
    },
  });
  keepPhrasesTogether();
  const svg = new SVG({ fontCache: 'local' });
  const document = mathjax.document('', { InputJax: tex, OutputJax: svg });
  const BASE_EM = 16;

  function convert(expression, { display = true } = {}) {
    tex.reset(0);
    clearUserMacros(tex);
    const node = document.convert(expression, { display, em: BASE_EM, ex: BASE_EM / 2, containerWidth: 80 * BASE_EM });
    const svgNode = findSvg(adaptor, node);
    if (!svgNode) throw new Error('MathJax did not produce an SVG.');
    return svgNode;
  }

  engine = { adaptor, convert, font: svg.font };
  return engine;
}

/** The shared TeX font data (metrics are overwritten per render; see metrics.js). */
export function mathJaxFont() {
  return getMathJax().font;
}
