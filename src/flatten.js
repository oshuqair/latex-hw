// Stage 4: flatten MathJax's SVG into a tree whose leaves carry absolute
// matrices (MathJax units, 1000 per em, y down, in the root viewBox frame).
// Structure (data-mml-node) is kept on the inner nodes for writing order.

import { IDENTITY, apply, emptyBox, addPoint, intersectBox, mul, parsePath, parseTransform, pathBox, scale, transformBox, translate } from './geom.js';

function parseViewBox(value) {
  const parts = String(value ?? '').trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

const VARIANT_RE = /TEX-([A-Z0-9]+)-([0-9A-F]+)$/;

/**
 * @returns {{ root: object, viewBox: {x,y,w,h}, leaves: object[] }}
 * Leaf kinds:
 *  - glyph: { code, variant, d, subpaths, M, inkLocal, box }
 *  - rule:  { box }
 *  - text:  { text, fontSize, M, box }   (M maps text-local y-down units)
 */
export function flatten(adaptor, svg, { measure } = {}) {
  const viewBox = parseViewBox(adaptor.getAttribute(svg, 'viewBox'));
  if (!viewBox) throw new Error('The SVG has no viewBox.');
  const defs = new Map();
  for (const path of adaptor.tags(svg, 'path')) {
    const id = adaptor.getAttribute(path, 'id');
    if (id) defs.set(id, adaptor.getAttribute(path, 'd') || '');
  }
  const parsed = new Map();
  const leaves = [];

  const walk = (node, M, clip, chain) => {
    const kind = adaptor.kind(node);
    if (kind === '#text' || kind === '#comment' || kind === 'defs' || kind === 'title') return null;
    const own = parseTransform(adaptor.getAttribute(node, 'transform'));
    let M2 = mul(M, own);
    if (kind === 'g' || kind === 'svg' || kind === 'a') {
      let clip2 = clip;
      if (kind === 'svg') {
        const x = Number(adaptor.getAttribute(node, 'x') || 0);
        const y = Number(adaptor.getAttribute(node, 'y') || 0);
        const w = Number(adaptor.getAttribute(node, 'width') || 0);
        const h = Number(adaptor.getAttribute(node, 'height') || 0);
        const vb = parseViewBox(adaptor.getAttribute(node, 'viewBox'));
        const port = transformBox(M2, { x0: x, y0: y, x1: x + w, y1: y + h });
        clip2 = clip ? intersectBox(clip, port) : port;
        if (vb && vb.w && vb.h) M2 = mul(M2, mul(translate(x, y), mul(scale(w / vb.w, h / vb.h), translate(-vb.x, -vb.y))));
        else M2 = mul(M2, translate(x, y));
      }
      const mml = adaptor.getAttribute(node, 'data-mml-node') || (kind === 'svg' ? 'svg' : 'g');
      const out = {
        kind: 'node',
        mml,
        texclass: adaptor.getAttribute(node, 'data-mjx-texclass') || null,
        chain: mml === 'g' ? chain : [...chain, mml],
        children: [],
        nestedSvg: kind === 'svg',
      };
      for (const child of adaptor.childNodes(node)) {
        const c = walk(child, M2, clip2, out.chain);
        if (c) out.children.push(c);
      }
      return out;
    }
    if (kind === 'use') {
      const href = (adaptor.getAttribute(node, 'xlink:href') || adaptor.getAttribute(node, 'href') || '').replace(/^#/, '');
      const d = defs.get(href) || '';
      if (!d.trim()) return null; // spaces, U+2061 and other invisible glyphs
      const code = Number.parseInt(adaptor.getAttribute(node, 'data-c') || '', 16);
      const m = VARIANT_RE.exec(href);
      if (!parsed.has(href)) parsed.set(href, parsePath(d, 6));
      const subpaths = parsed.get(href);
      const inkLocal = pathBox(subpaths);
      // Box in root frame: transform the flattened outline points.
      let box = emptyBox();
      for (const s of subpaths) for (const [px, py] of s.points) addPoint(box, ...apply(M2, px, py));
      if (clip) box = intersectBox(box, clip);
      const leaf = { kind: 'glyph', code, variant: m ? m[1] : 'N', href, d, subpaths, M: M2, inkLocal, box, chain, clipped: !!clip };
      leaves.push(leaf);
      return leaf;
    }
    if (kind === 'rect') {
      const x = Number(adaptor.getAttribute(node, 'x') || 0);
      const y = Number(adaptor.getAttribute(node, 'y') || 0);
      const w = Number(adaptor.getAttribute(node, 'width') || 0);
      const h = Number(adaptor.getAttribute(node, 'height') || 0);
      if (!(w > 0 && h > 0)) return null;
      let box = transformBox(M2, { x0: x, y0: y, x1: x + w, y1: y + h });
      if (clip) box = intersectBox(box, clip);
      const leaf = { kind: 'rule', box, chain };
      leaves.push(leaf);
      return leaf;
    }
    if (kind === 'text') {
      const text = adaptor.textContent(node);
      if (!text || !text.trim()) return null;
      const fontSize = Number.parseFloat(adaptor.getAttribute(node, 'font-size')) || 884;
      const advance = (measure && measure(text, fontSize)) ?? fontSize * 0.6 * [...text].length;
      // text-local frame is y-down (MathJax wraps <text> in scale(1,-1))
      const box = transformBox(M2, { x0: 0, y0: -fontSize * 0.8, x1: advance, y1: fontSize * 0.3 });
      const leaf = { kind: 'text', text, fontSize, advance, M: M2, box, chain, variant: adaptor.getAttribute(node, 'data-variant') || 'normal' };
      leaves.push(leaf);
      return leaf;
    }
    return null;
  };

  // The root <svg> has viewBox in its own frame; its first <g> carries scale(1,-1).
  const root = { kind: 'node', mml: 'root', chain: [], children: [] };
  for (const child of adaptor.childNodes(svg)) {
    const c = walk(child, IDENTITY, null, []);
    if (c) root.children.push(c);
  }
  return { root, viewBox, leaves };
}
