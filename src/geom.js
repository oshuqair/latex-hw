// Small 2D geometry helpers: affine matrices, SVG transform and path parsing.
// Matrices are [a, b, c, d, e, f] as in SVG: x' = a x + c y + e, y' = b x + d y + f.

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

/** m ∘ n: apply n first, then m. */
export function mul(m, n) {
  const [a, b, c, d, e, f] = m;
  const [A, B, C, D, E, F] = n;
  return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
}

export function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Uniform size factor of a matrix (sqrt of |det|). */
export function sizeOf(m) {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

export const translate = (x, y = 0) => [1, 0, 0, 1, x, y];
export const scale = (x, y = x) => [x, 0, 0, y, 0, 0];

/** Parse an SVG transform attribute into one matrix (left-to-right composition). */
export function parseTransform(str) {
  let m = IDENTITY;
  if (!str) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(str))) {
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let t;
    switch (match[1]) {
      case 'matrix': t = args.slice(0, 6); break;
      case 'translate': t = translate(args[0] ?? 0, args[1] ?? 0); break;
      case 'scale': t = scale(args[0] ?? 1, args[1] ?? args[0] ?? 1); break;
      case 'rotate': {
        const r = ((args[0] ?? 0) * Math.PI) / 180;
        const cx = args[1] ?? 0, cy = args[2] ?? 0;
        t = mul(translate(cx, cy), mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0], translate(-cx, -cy)));
        break;
      }
      case 'skewX': t = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      case 'skewY': t = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    m = mul(m, t);
  }
  return m;
}

export function emptyBox() {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}
export function addPoint(box, x, y) {
  if (x < box.x0) box.x0 = x;
  if (y < box.y0) box.y0 = y;
  if (x > box.x1) box.x1 = x;
  if (y > box.y1) box.y1 = y;
  return box;
}
export function unionBox(a, b) {
  if (!b || !isFiniteBox(b)) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}
export function isFiniteBox(b) {
  return b && Number.isFinite(b.x0) && Number.isFinite(b.x1) && Number.isFinite(b.y0) && Number.isFinite(b.y1);
}
export function intersectBox(a, b) {
  if (!b) return a;
  return { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
}
export function transformBox(m, b) {
  const out = emptyBox();
  for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) addPoint(out, ...apply(m, x, y));
  return out;
}

/**
 * Parse SVG path data into flattened subpaths: [{ points: [[x,y]...], closed }].
 * Curves are sampled with `steps` segments each. Handles absolute and relative
 * M L H V Q T C S A Z (arcs are approximated by their chord).
 */
export function parsePath(d, steps = 8) {
  const tokens = String(d || '').match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const subpaths = [];
  let cur = null;
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = null, cy = null;
  const num = () => Number(tokens[i++]);
  const push = (px, py) => cur.points.push([px, py]);
  const start = (px, py) => {
    cur = { points: [[px, py]], closed: false };
    subpaths.push(cur);
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ax = (v) => (rel ? x + v : v);
    const ay = (v) => (rel ? y + v : v);
    if (C === 'Z') {
      if (cur) { cur.closed = true; push(sx, sy); }
      x = sx; y = sy; cx = cy = null; cur = null;
      continue;
    }
    if (i >= tokens.length || /[A-Za-z]/.test(tokens[i])) { if (C !== 'Z') i++; continue; }
    if (C === 'M') {
      x = ax(num()); y = ay(num()); sx = x; sy = y; start(x, y);
      cmd = rel ? 'l' : 'L'; cx = cy = null;
      continue;
    }
    if (!cur) start(x, y);
    if (C === 'L') { x = ax(num()); y = ay(num()); push(x, y); cx = cy = null; }
    else if (C === 'H') { x = rel ? x + num() : num(); push(x, y); cx = cy = null; }
    else if (C === 'V') { y = rel ? y + num() : num(); push(x, y); cx = cy = null; }
    else if (C === 'Q' || C === 'T') {
      let qx, qy;
      if (C === 'Q') { qx = ax(num()); qy = ay(num()); }
      else { qx = cx == null ? x : 2 * x - cx; qy = cy == null ? y : 2 * y - cy; }
      const nx = ax(num()), ny = ay(num());
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, u = 1 - t;
        push(u * u * x + 2 * u * t * qx + t * t * nx, u * u * y + 2 * u * t * qy + t * t * ny);
      }
      cx = qx; cy = qy; x = nx; y = ny;
    } else if (C === 'C' || C === 'S') {
      let x1, y1;
      if (C === 'C') { x1 = ax(num()); y1 = ay(num()); }
      else { x1 = cx == null ? x : 2 * x - cx; y1 = cy == null ? y : 2 * y - cy; }
      const x2 = ax(num()), y2 = ay(num()), nx = ax(num()), ny = ay(num());
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, u = 1 - t;
        push(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * nx,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ny);
      }
      cx = x2; cy = y2; x = nx; y = ny;
    } else if (C === 'A') {
      num(); num(); num(); num(); num();
      x = ax(num()); y = ay(num()); push(x, y); cx = cy = null;
    } else {
      i++; // unknown command: skip a token
    }
  }
  return subpaths.filter((s) => s.points.length > 1);
}

export function pathBox(subpaths) {
  const b = emptyBox();
  for (const s of subpaths) for (const [x, y] of s.points) addPoint(b, x, y);
  return b;
}

export function polylineLength(pts) {
  let len = 0;
  for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  return len;
}

/**
 * Smooth a polyline with a uniform Catmull-Rom spline converted to cubic
 * Béziers. Returns { d, samples } with `samples` a dense polyline of the curve.
 */
export function smoothPath(pts, fmt) {
  if (pts.length === 1) {
    const [x, y] = pts[0];
    return { d: `M${fmt(x)} ${fmt(y)}l0 0`, samples: [pts[0]] };
  }
  if (pts.length === 2) {
    return { d: `M${fmt(pts[0][0])} ${fmt(pts[0][1])}L${fmt(pts[1][0])} ${fmt(pts[1][1])}`, samples: pts };
  }
  let d = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  const samples = [pts[0]];
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[k - 1] ?? pts[k];
    const p1 = pts[k];
    const p2 = pts[k + 1];
    const p3 = pts[k + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`;
    for (let s = 1; s <= 6; s++) {
      const t = s / 6, u = 1 - t;
      samples.push([
        u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
        u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
      ]);
    }
  }
  return { d, samples };
}

export function linePath(pts, fmt) {
  let d = '';
  pts.forEach(([x, y], k) => { d += `${k ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`; });
  if (pts.length === 1) d += 'l0 0';
  return { d, samples: pts };
}
