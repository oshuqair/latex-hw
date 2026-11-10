import { createRequire } from "node:module";
import { translateOperators } from "./dictionary.js";
import { layoutRightToLeft } from "./rtl.js";
import { measureTextBox } from "./text-measure.js"; // harfbuzzjs + Amiri (was hb-shape)

const require = createRequire(import.meta.url);
const { mathjax } = require("mathjax-full/js/mathjax.js");
const { TeX } = require("mathjax-full/js/input/tex.js");
const { SVG } = require("mathjax-full/js/output/svg.js");
const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js");
const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js");
const { AllPackages } = require("mathjax-full/js/input/tex/AllPackages.js");
const { SVGTextNode } = require("mathjax-full/js/output/svg/Wrappers/TextNode.js");

/**
 * A phrase such as النسبة المئوية is one run, spaces included.
 * MathJax otherwise draws each letter alone, and the line mirror then turns those letters one by one.
 */
function isSpacer(code) {
  return /\s/u.test(String.fromCodePoint(code));
}

function isConnectedPhrase(wrapper) {
  const variant = wrapper.parent?.variant;
  const text = wrapper.node?.getText?.() ?? "";
  if (!variant || variant === "-explicitFont" || [...text].length < 2) return false;
  const chars = wrapper.remappedText(text, variant);
  if (chars.length < 2) return false;

  let letters = 0;
  for (const code of chars) {
    if (wrapper.getVariantChar(variant, code)[3]?.unknown) {
      letters += 1;
      continue;
    }
    // A space is a real TeX glyph, so it used to split النسبة المئوية into separate letters.
    if (isSpacer(code)) continue;
    return false;
  }
  return letters > 0;
}

function keepPhrasesTogether() {
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

const BASE_EM = 16;
const USER_MAPS = new Set(["new-Command", "new-Delimiter", "new-Environment"]);

let converter;

function stripDelimiters(input) {
  const text = input.trim();
  const pairs = [
    ["$$", "$$", true],
    ["\\[", "\\]", true],
    ["\\(", "\\)", false],
    ["$", "$", false],
  ];

  for (const [open, close, display] of pairs) {
    if (
      text.startsWith(open) &&
      text.endsWith(close) &&
      text.length > open.length + close.length
    ) {
      return { tex: text.slice(open.length, -close.length).trim(), display };
    }
  }

  return { tex: text, display: null };
}

function findSvg(adaptor, node) {
  if (!node || typeof node === "string") return null;
  if (adaptor.kind(node) === "svg") return node;
  for (const child of adaptor.childNodes(node)) {
    const found = findSvg(adaptor, child);
    if (found) return found;
  }
  return null;
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

function toPixels(svg, ex) {
  return svg.replace(/(-?\d*\.?\d+)ex\b/g, (_, value) => {
    const px = Math.round(parseFloat(value) * ex * 1000) / 1000;
    return `${px}px`;
  });
}

/**
 * Load MathJax once and return a converter.
 * `fontCache: "local"` keeps glyph outlines inside the SVG, so the file stands alone.
 */
export async function createConverter() {
  if (converter) return converter;

  const adaptor = liteAdaptor();
  const fallbackSize = adaptor.nodeSize.bind(adaptor);
  adaptor.nodeSize = (node, em, local) => {
    if (adaptor.kind(node) === "text") {
      const content = adaptor.textContent(node);
      const fontSize = Number.parseFloat(adaptor.getAttribute(node, "font-size")) || 884;
      const box = content ? measureTextBox(content, fontSize) : null;
      if (box) return [box.advance / 1000, 0.8];
    }
    return fallbackSize(node, em, local);
  };
  RegisterHTMLHandler(adaptor);

  const packages = AllPackages.filter(
    (name) => name !== "noerrors" && name !== "noundefined",
  );
  const tex = new TeX({
    packages,
    formatError(_jax, err) {
      const message = String(err?.message || "Could not parse that expression.").split("\n")[0];
      throw new Error(message);
    },
  });
  keepPhrasesTogether();
  const svg = new SVG({ fontCache: "local" });
  const document = mathjax.document("", { InputJax: tex, OutputJax: svg });

  converter = function latexToSvg(input, options = {}) {
    const source = String(input ?? "");
    if (!source.trim()) {
      throw new Error("Enter a LaTeX expression.");
    }

    const scale = Number(options.scale ?? 1);
    if (!Number.isFinite(scale) || scale <= 0 || scale > 8) {
      throw new Error("Scale must be a number between 0 and 8.");
    }

    const stripped = stripDelimiters(source);
    const display = options.display ?? stripped.display ?? true;
    const expression = translateOperators(stripped.tex);
    const em = BASE_EM * scale;
    const ex = em / 2;

    tex.reset(0);
    clearUserMacros(tex);

    const node = document.convert(expression, {
      display,
      em,
      ex,
      containerWidth: 80 * em,
    });

    const svgNode = findSvg(adaptor, node);
    if (!svgNode) {
      throw new Error("MathJax did not produce an SVG.");
    }

    if (options.rightToLeft !== false) layoutRightToLeft(adaptor, svgNode);

    let markup = adaptor.outerHTML(svgNode);
    if (!/\sxmlns=/.test(markup)) {
      markup = markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    markup = markup.replace(/currentColor/g, "#000000");
    markup = toPixels(markup, ex);

    return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`;
  };

  return converter;
}
