// Stage 8: timing + static SVG / JSON output. Coordinates become absolute px,
// y down, origin at the ink box's top-left plus a margin. No transforms inside.

import { emptyBox, addPoint, linePath, polylineLength, smoothPath } from './geom.js';

const fmt = (n) => {
  const v = Math.round(n * 100) / 100;
  return (Object.is(v, -0) ? 0 : v).toString();
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function emitSvg(units, opts) {
  const u = opts.fontSize / 1000; // px per MathJax unit
  const ink = emptyBox();
  const all = [];
  for (const unit of units) for (const s of unit.strokes) {
    all.push({ s, unit });
    for (const [x, y] of s.pts) {
      addPoint(ink, x - s.w / 2, y - s.w / 2);
      addPoint(ink, x + s.w / 2, y + s.w / 2);
    }
  }
  const margin = opts.margin ?? Math.max(4, opts.pen * u * 2);
  if (!all.length) { ink.x0 = ink.y0 = 0; ink.x1 = ink.y1 = 1; }
  const ox = ink.x0, oy = ink.y0;
  const W = (ink.x1 - ink.x0) * u + 2 * margin;
  const H = (ink.y1 - ink.y0) * u + 2 * margin;
  const px = ([x, y]) => [(x - ox) * u + margin, (y - oy) * u + margin];

  let t = 0;
  let first = true;
  const strokes = [];
  for (const unit of units) {
    unit.strokes.forEach((s, k) => {
      const gap = first ? 0 : k === 0 ? opts.unitPause : s.gap ?? 0;
      first = false;
      const pts = s.pts.map(px);
      const { d, samples } = s.smooth ? smoothPath(pts, fmt) : linePath(pts, fmt);
      const length = Math.max(0.01, polylineLength(samples));
      const start = t + gap;
      const duration = s.dur;
      t = start + duration;
      strokes.push({
        index: strokes.length,
        d,
        width: Math.round(s.w * u * 100) / 100,
        length: Math.round(length * 100) / 100,
        start: Math.round(start * 1000) / 1000,
        duration: Math.round(duration * 1000) / 1000,
        source: s.source,
        ...(s.char ? { char: s.char } : {}),
        ...(s.font ? { font: s.font } : {}),
        ...(s.glyphId ? { glyphId: s.glyphId } : {}),
        mirrored: !!s.mirrored,
        node: s.node || '',
        priority: s.priority ?? 0,
      });
    });
  }
  const total = Math.round(t * 1000) / 1000;
  const baseline = (0 - oy) * u + margin;
  const lines = strokes.map((s) => {
    const attrs = [
      `class="hw-stroke"`,
      `d="${s.d}"`,
      `stroke-width="${fmt(s.width)}"`,
      `pathLength="${fmt(s.length)}"`,
      `data-i="${s.index}"`,
      `data-start="${s.start}"`,
      `data-dur="${s.duration}"`,
      `data-len="${fmt(s.length)}"`,
      `data-source="${s.source}"`,
      s.char ? `data-char="${esc(s.char)}"` : '',
      s.font ? `data-font="${s.font}"` : '',
      s.glyphId ? `data-glyph="${esc(s.glyphId)}"` : '',
      s.mirrored ? `data-mirrored="true"` : '',
      s.node ? `data-node="${esc(s.node)}"` : '',
      s.priority ? `data-priority="${s.priority}"` : '',
    ].filter(Boolean);
    return `    <path ${attrs.join(' ')}/>`;
  });
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(W)} ${fmt(H)}" width="${fmt(W)}" height="${fmt(H)}" data-dir="${opts.rtl ? 'rtl' : 'ltr'}" data-baseline="${fmt(baseline)}" data-stroke-count="${strokes.length}" data-total-duration="${total}">`,
    `  <g fill="none" stroke="${esc(opts.color)}" stroke-linecap="round" stroke-linejoin="round">`,
    ...lines,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
  return { svg, strokes, width: Math.round(W * 100) / 100, height: Math.round(H * 100) / 100, baseline: Math.round(baseline * 100) / 100, totalDuration: total };
}
