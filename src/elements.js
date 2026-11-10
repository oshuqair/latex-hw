// The positioned element list (design stage 4 output): every glyph, rule,
// stretchy part and text run with its final box and absolute affine matrix,
// after the rtl mirror. Units: MathJax units (1000 per em), y down, in the
// MathJax viewBox frame. This is what golden/snapshot tests compare.

import { IDENTITY, mul, transformBox, emptyBox, unionBox } from './geom.js';
import { plainChar, classifyStretchy } from './chars.js';

const r2 = (n) => Math.round(n * 100) / 100;
const box = (b) => ({ x: r2(b.x0), y: r2(b.y0), w: r2(b.x1 - b.x0), h: r2(b.y1 - b.y0) });
const mat = (m) => m.map(r2);

export function elementList(flat, builder, { rtl, opts }) {
  const axis = 2 * flat.viewBox.x + flat.viewBox.w;
  const G = rtl ? [-1, 0, 0, 1, axis, 0] : IDENTITY;
  const out = [];
  const leavesOf = (n, acc = []) => {
    if (n.kind !== 'node') acc.push(n);
    else for (const c of n.children) leavesOf(c, acc);
    return acc;
  };
  const node = (chain) => chain.filter((x) => x !== 'math').join('/');
  const walk = (n, parent) => {
    if (n.kind === 'node') {
      if (n.mml === 'mo' && builder.isStretchyMo(n, leavesOf(n))) {
        const parts = leavesOf(n);
        const b = transformBox(G, parts.reduce((acc, l) => unionBox(acc, l.box), emptyBox()));
        const codes = parts.filter((l) => l.kind === 'glyph').map((l) => l.code);
        const shape = parent?.mml === 'msqrt' || parent?.mml === 'mroot' ? 'radical' : classifyStretchy(codes);
        out.push({ kind: 'stretchy', shape, char: codes.length ? plainChar(codes[0]) : '', box: box(b), mirrored: rtl, node: node(n.chain), parts: codes.map((c) => c.toString(16)) });
        return;
      }
      for (const c of n.children) walk(c, n);
      return;
    }
    if (n.kind === 'glyph') {
      const place = builder.placement(n);
      const policy = place.policy;
      const keep = policy.keep;
      const L = rtl && !keep ? [-1, 0, 0, 1, 2 * place.cx, 0] : IDENTITY;
      const isSurd = (parent?.mml === 'mo') && (n.code === 0x221a);
      const swapped = policy.drawCode !== n.code;
      // Caveat-spaced glyphs: the box is the handwriting ink, not the TeX outline.
      let glyphBox = n.box;
      if (place.em && place.cav) {
        const k = opts.latinScale;
        const ink = place.cav.ink;
        let local = { x0: ink.x0 * k, x1: ink.x1 * k, y0: -ink.y1 * k, y1: -ink.y0 * k };
        if (rtl && !keep) local = { x0: 2 * place.cx - local.x1, x1: 2 * place.cx - local.x0, y0: local.y0, y1: local.y1 };
        glyphBox = transformBox(n.M, local);
      }
      out.push({ kind: isSurd ? 'stretchy' : 'glyph', ...(isSurd ? { shape: 'radical' } : {}), char: plainChar(n.code), code: n.code, ...(swapped ? { drawnAs: plainChar(policy.drawCode) } : {}), variant: n.variant, font: 'latin', box: box(transformBox(G, glyphBox)), matrix: mat(mul(G, mul(n.M, L))), mirrored: rtl && (keep || swapped), node: node(n.chain) });
    } else if (n.kind === 'rule') {
      out.push({ kind: 'rule', box: box(transformBox(G, n.box)), node: node(n.chain) });
    } else if (n.kind === 'text') {
      const L = rtl ? [-1, 0, 0, 1, n.advance, 0] : IDENTITY;
      out.push({ kind: 'text-run', text: n.text, font: /[\u0600-\u06FF]/u.test(n.text) ? 'arabic' : 'latin', fontSize: n.fontSize, advance: r2(n.advance), box: box(transformBox(G, n.box)), matrix: mat(mul(G, mul(n.M, L))), mirrored: false, node: node(n.chain) });
    }
  };
  walk(flat.root, null);
  return out;
}
