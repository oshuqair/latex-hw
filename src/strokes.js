// Stages 5 and 6: turn flattened leaves into pen strokes.
// All coordinates here are MathJax root-frame units (1000 per em, y down).
// Text-size Caveat glyphs are drawn from their own origin (the advance MathJax
// was given in metrics.js). Size variants stay fitted to the TeX box.
// In rtl, `G` mirrors the whole layout; glyphs not in keepMirroredCharacters
// are pre-flipped around their own centre so they read normally (latex-svg rule).

import { apply, emptyBox, addPoint, parsePath, polylineLength, sizeOf } from './geom.js';
import { plainChar, classifyStretchy, PIECE_RANGE, DELIMITER_CODES, ALIASES } from './chars.js';
import { rtlGlyphPolicy } from './mirror-set.js';
import { isLatinText, latinRunLayout } from './metrics.js';

const LARGE_VARIANTS = new Set(['LO', 'SO', 'S1', 'S2', 'S3', 'S4']);
// Tegaki's default glyph speed is ~3000 font units/s; synthesized strokes use a
// similar pace in MathJax units.
const SYNTH_SPEED = 2600; // units per second
const MIN_DUR = 0.06;
const HAMZA_CARRIERS = new Set(['أ', 'إ', 'آ', 'ؤ', 'ئ']);

function bboxOfStrokes(strokes) {
  const b = emptyBox();
  for (const s of strokes) for (const [x, y] of s.pts) addPoint(b, x, y);
  return b;
}

function caveatInk(glyph) {
  const b = emptyBox();
  for (const s of glyph.s) for (const p of s.p) addPoint(b, p[0], p[1]);
  return b; // y-down font units
}

export function createStrokeBuilder(ctx) {
  const { latin, arabicShaper, arabic, rtl, viewBox, pen, warn, opts, usesCaveat } = ctx;
  const caveatEm = usesCaveat ?? (() => false);
  const mirrorAxis = 2 * viewBox.x + viewBox.w;
  const G = rtl ? (x, y) => [mirrorAxis - x, y] : (x, y) => [x, y];
  const caveatCache = new Map();
  const getCaveat = (ch) => {
    if (!caveatCache.has(ch)) {
      const g = latin.glyphData[ch] ?? latin.glyphData[ch.normalize('NFKC')] ?? null;
      caveatCache.set(ch, g && g.s?.length ? { g, ink: caveatInk(g) } : null);
    }
    return caveatCache.get(ch);
  };
  const penFor = (sigma) => pen * Math.min(1, Math.max(0.7, Math.sqrt(sigma)));
  const nodeName = (chain) => chain.filter((n) => n !== 'math').join('/');

  const hasCaveat = (code) => !!getCaveat(plainChar(code));
  /** rtl drawing policy for a TeX glyph code ({ keep, drawCode, relation }); ltr: drawn as is. */
  const glyphPolicy = (code) => (rtl ? rtlGlyphPolicy(code, opts, hasCaveat) : { keep: false, drawCode: code });

  /**
   * Where a glyph's strokes sit in its local frame (y up, origin at the left
   * of the advance). `em`: Caveat's own origin, matching the advance MathJax
   * laid out. `box`: centred on the TeX outline (size variants, aliases).
   * `cx` is the x the rtl pre-flip turns around.
   */
  function placement(leaf) {
    const ch = plainChar(leaf.code);
    const policy = glyphPolicy(leaf.code);
    const drawCh = policy.drawCode !== leaf.code ? plainChar(policy.drawCode) : ch;
    const alias = ALIASES.get(leaf.code);
    const cav = getCaveat(drawCh) ?? (alias ? getCaveat(alias) : null);
    const tb = leaf.inkLocal;
    const texCx = (tb.x0 + tb.x1) / 2;
    const big = LARGE_VARIANTS.has(leaf.variant);
    const aliasFit = !!(alias && !getCaveat(ch));
    const em = !!(cav && !big && !aliasFit && caveatEm(leaf.code, leaf.variant));
    const cx = em ? ((cav.ink.x0 + cav.ink.x1) / 2) * opts.latinScale : texCx;
    return { ch, policy, drawCh, cav, aliasFit, big, em, cx, texCx, texCy: (tb.y0 + tb.y1) / 2 };
  }

  /** Strokes of a TeX glyph (<use>) from Caveat Math, or the outline fallback. */
  function glyphUnit(leaf) {
    const place = placement(leaf);
    const { ch, policy, drawCh, cav } = place;
    const keep = policy.keep;
    // A mirrored relation drawn as its partner glyph (< as >): upright strokes, natural order.
    const mirrored = rtl && (keep || drawCh !== ch);
    const sigma = sizeOf(leaf.M);
    const w = penFor(sigma);
    const tb = leaf.inkLocal; // y-up local units
    const flipLocal = rtl && !keep;
    const toRoot = (X, Y) => G(...apply(leaf.M, flipLocal ? 2 * place.cx - X : X, Y));
    const base = { source: 'glyph', char: ch, font: 'latin', mirrored, node: nodeName(leaf.chain), ...(drawCh !== ch ? { glyphId: drawCh } : {}) };
    if (!cav) return fallbackFromOutline(leaf.subpaths, toRoot, w, { ...base, source: 'fallback' }, ch, 'latin');
    const { g, ink } = cav;
    const cw = ink.x1 - ink.x0;
    const chh = ink.y1 - ink.y0;
    const ccx = (ink.x0 + ink.x1) / 2;
    const ccy = -(ink.y0 + ink.y1) / 2; // y-up
    let kx = opts.latinScale;
    let ky = kx;
    if (!place.em && place.big) {
      // Large operators and size variants: fit the TeX box height.
      ky = kx = Math.max(0.3, (tb.y1 - tb.y0 - pen) / Math.max(chh, 1));
      // A taller ( [ { is drawn longer, not fatter: keep it inside its TeX box width.
      if (DELIMITER_CODES.has(leaf.code)) kx = Math.min(kx, Math.max(0.3, (tb.x1 - tb.x0) / Math.max(cw, 1)) * 1.1);
    } else if (!place.em && place.aliasFit) {
      // Borrowed glyph: fit the TeX box.
      kx = Math.max(0.1, (tb.x1 - tb.x0 - pen * 0.5) / Math.max(cw, 1));
      ky = Math.min(kx * 1.5, Math.max(0.1, (tb.y1 - tb.y0) / Math.max(chh, 1)));
    }
    const strokes = [];
    let prevEnd = 0;
    g.s.forEach((s, idx) => {
      // em: Caveat font units from the advance origin. box: centred on the TeX outline.
      const pts = s.p.map((p) => (place.em
        ? toRoot(p[0] * kx, -p[1] * ky)
        : toRoot(place.texCx + (p[0] - ccx) * kx, place.texCy + (-p[1] - ccy) * ky)));
      const scaleT = Math.sqrt(sigma * kx);
      const gap = idx === 0 ? 0 : Math.max(0, (s.d - prevEnd)) * scaleT;
      prevEnd = s.d + s.a;
      strokes.push({ ...base, pts, smooth: true, w, dur: Math.max(MIN_DUR, s.a * scaleT), gap, priority: s.r ?? 0 });
    });
    return { kind: 'glyph', strokes, box: bboxOfStrokes(strokes) };
  }

  /** Each closed contour of an outline becomes one thin stroke; reported as a warning. */
  function fallbackFromOutline(subpaths, toRoot, w, base, ch, font) {
    const allDots = subpaths.length > 0 && subpaths.every((sp) => {
      const b = emptyBox();
      for (const [x, y] of sp.points) addPoint(b, ...toRoot(x, y));
      return Math.max(b.x1 - b.x0, b.y1 - b.y0) < 2.4 * w;
    });
    if (!allDots) warn('fallback-glyph', `No handwriting strokes for "${ch}" (U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}) in the ${font} bundle; drew its outline instead.`, ch);
    const strokes = subpaths.map((sp) => {
      const pts = sp.points.map(([x, y]) => toRoot(x, y));
      const b = emptyBox();
      for (const [x, y] of pts) addPoint(b, x, y);
      // A dot-sized contour (i-dot, ⋯, ٫) becomes one pen dab, not a tiny ring.
      if (Math.max(b.x1 - b.x0, b.y1 - b.y0) < 2.4 * w) {
        const c = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
        return { ...base, source: allDots ? 'dots' : 'fallback', pts: [c, [c[0] + 0.5, c[1] + 0.5]], smooth: false, w: Math.max(w, Math.min(b.x1 - b.x0, b.y1 - b.y0)), dur: MIN_DUR, gap: 0.03, priority: 0 };
      }
      const len = polylineLength(pts);
      return { ...base, source: 'fallback', pts, smooth: false, w: w * 0.45, dur: Math.max(MIN_DUR, len / SYNTH_SPEED), gap: 0.03, priority: 0 };
    });
    return { kind: 'glyph', strokes, box: bboxOfStrokes(strokes) };
  }

  /**
   * A Latin \\text{} (He, H2O) drawn with Caveat, letters left to right.
   * On an RTL page `adv - X` cancels the page mirror, so the word stays LTR.
   */
  function latinTextUnit(leaf, node, sigma, w) {
    const upem = latin.unitsPerEm || 1000;
    const run = latinRunLayout(leaf.text, latin.glyphData, upem);
    const k = (leaf.fontSize / upem) * opts.latinScale;
    const adv = run.advance * k;
    const toRoot = (X, Y) => G(...apply(leaf.M, rtl ? adv - X : X, Y));
    const strokes = [];
    for (const item of run.glyphs) {
      if (item.space) continue;
      const base = { source: 'glyph', char: item.char, font: 'latin', mirrored: false, node };
      if (!item.g) {
        warn('fallback-glyph', `No handwriting strokes for "${item.char}" (U+${(item.char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}) in the latin bundle; nothing drawn for it.`, item.char);
        continue;
      }
      let prevEnd = 0;
      item.g.s.forEach((st, idx) => {
        const pts = st.p.map((p) => toRoot((item.x + p[0]) * k, p[1] * k));
        const scaleT = Math.sqrt(sigma * k);
        const gap = idx === 0 ? 0 : Math.max(0, (st.d - prevEnd)) * scaleT;
        prevEnd = st.d + st.a;
        strokes.push({ ...base, pts, smooth: true, w, dur: Math.max(MIN_DUR, st.a * scaleT), gap, priority: st.r ?? 0 });
      });
    }
    return { kind: 'text', strokes, box: bboxOfStrokes(strokes) };
  }

  /** An Arabic (or other non-TeX) text run, shaped with harfbuzzjs + Amiri. */
  function textUnit(leaf) {
    const node = nodeName(leaf.chain);
    const sigma = sizeOf(leaf.M);
    const w = penFor(sigma);
    const chars = [...leaf.text];
    const hasArabic = chars.some((c) => /[\u0600-\u06FF]/u.test(c));
    const hasLatin = chars.some((c) => /[A-Za-z]/.test(c));
    if (hasArabic && hasLatin) warn('mixed-script-text', `\\text{${leaf.text}} mixes Arabic and Latin; one script per \\text{} is supported.`, leaf.text);
    // Latin words are an LTR island. Arabic (and anything else) keeps the shaper.
    if (isLatinText(leaf.text)) return latinTextUnit(leaf, node, sigma, w);
    if (!arabicShaper) {
      warn('no-arabic-font', `No Arabic font loaded; "${leaf.text}" skipped.`, leaf.text);
      return { kind: 'text', strokes: [], box: leaf.box };
    }
    const s = (leaf.fontSize / arabicShaper.upem) * opts.arabicScale;
    const shaped = arabicShaper.shapeRun(leaf.text);
    const adv = shaped.advance * s;
    const toRoot = (X, Y) => G(...apply(leaf.M, rtl ? adv - X : X, Y));
    // Logical order: cluster ascending (harfbuzz rtl output is visual, i.e. reversed).
    const logical = shaped.glyphs.map((g, i) => ({ g, i })).sort((a, b) => a.g.cl - b.g.cl || (a.g.ltr ? a.i - b.i : b.i - a.i)).map((e) => e.g);
    // Split into words at spaces.
    const words = [[]];
    for (const g of logical) {
      if (g.kind === 'space') { if (words.at(-1).length) words.push([]); continue; }
      words.at(-1).push(g);
    }
    const all = [];
    for (const word of words) {
      if (!word.length) continue;
      const tiers = new Map(); // priority -> strokes
      for (const g of word) {
        const base = { source: 'glyph', char: g.char, font: 'arabic', glyphId: g.gid, mirrored: false, node };
        if (g.kind === 'glyph') {
          let prevEnd = 0;
          // Amiri's bundle draws the hamza of أ إ آ ؤ ئ first, at body priority. People write
          // the letter body first, so short strokes of those letters are moved to the mark tier.
          const lens = g.data.s.map((st) => polylineLength(st.p));
          const longest = Math.max(...lens);
          const hamzaCarrier = HAMZA_CARRIERS.has(g.char);
          g.data.s.forEach((st, idx) => {
            const pts = st.p.map((p) => toRoot((g.x + p[0]) * s, (p[1] - g.y) * s));
            const pr = st.r ?? (hamzaCarrier && lens[idx] < 0.45 * longest ? -1 : 0);
            const scaleT = Math.sqrt(sigma * s);
            const gap = idx === 0 || pr !== 0 ? 0 : Math.max(0, st.d - prevEnd) * scaleT;
            prevEnd = st.d + st.a;
            if (!tiers.has(pr)) tiers.set(pr, []);
            tiers.get(pr).push({ ...base, pts, smooth: true, w: opts.strokeWidth === 'stroke' ? meanWidth(st) * s * sigma : w, dur: Math.max(MIN_DUR, st.a * scaleT), gap, priority: pr });
          });
        } else if (g.kind === 'missing') {
          const cav = getCaveat(g.char);
          if (cav) {
            // A math symbol Amiri lacks (≠ ≤ ∞ …) inside Arabic text: Caveat Math's strokes,
            // centred in the slot the shaper gave it, at the Arabic size.
            const { g: cg, ink } = cav;
            const ccx = (ink.x0 + ink.x1) / 2;
            const k = opts.latinScale / opts.arabicScale;
            const slotC = g.x + g.ax / 2;
            let prevEnd = 0;
            if (!tiers.has(0)) tiers.set(0, []);
            cg.s.forEach((st, idx) => {
              const pts = st.p.map((p) => toRoot((slotC + (p[0] - ccx) * k) * s, (p[1] * k - g.y) * s));
              const scaleT = Math.sqrt(sigma * s * k);
              const gap = idx === 0 ? 0 : Math.max(0, st.d - prevEnd) * scaleT;
              prevEnd = st.d + st.a;
              tiers.get(0).push({ ...base, font: 'latin', glyphId: undefined, pts, smooth: true, w, dur: Math.max(MIN_DUR, st.a * scaleT), gap, priority: 0 });
            });
          } else if (g.outline) {
            const sub = parsePath(g.outline, 6);
            const fb = fallbackFromOutline(sub, (x, y) => toRoot((g.x + x) * s, (-y - g.y) * s), w, base, g.char, 'arabic');
            if (!tiers.has(0)) tiers.set(0, []);
            tiers.get(0).push(...fb.strokes);
          } else {
            warn('missing-glyph', `"${g.char}" is in neither Amiri font; nothing drawn for it.`, g.char);
          }
        }
      }
      const order = [...tiers.keys()].sort((a, b) => b - a);
      for (const pr of order) {
        tiers.get(pr).forEach((st, k) => { if (k === 0 && pr !== 0) st.gap = 0.08; all.push(st); });
      }
    }
    return { kind: 'text', strokes: all, box: bboxOfStrokes(all) };
  }

  function meanWidth(st) {
    let sum = 0;
    for (const p of st.p) sum += p[2] ?? 0;
    return st.p.length ? sum / st.p.length : 0;
  }


  /** A rule (fraction bar, overline, \hline): one pen line along its long axis. */
  function ruleUnit(leaf, sigma = 1) {
    const b = leaf.box;
    const w = Math.min(penFor(sigma), Math.max(b.y1 - b.y0, b.x1 - b.x0));
    const horizontal = b.x1 - b.x0 >= b.y1 - b.y0;
    let pts;
    if (horizontal) {
      const cy = (b.y0 + b.y1) / 2;
      const a = b.x0 + w / 2, z = b.x1 - w / 2;
      const sag = (z - a) * 0.004;
      pts = [[a, cy], [(a + z) / 2, cy + sag], [z, cy]];
    } else {
      const cx = (b.x0 + b.x1) / 2;
      pts = [[cx, b.y0 + w / 2], [cx, b.y1 - w / 2]];
    }
    pts = pts.map(([x, y]) => G(x, y));
    const len = polylineLength(pts);
    const st = { source: 'rule', mirrored: rtl, node: nodeName(leaf.chain), pts, smooth: horizontal, w, dur: Math.max(MIN_DUR, len / SYNTH_SPEED), gap: 0, priority: 0 };
    return { kind: 'rule', strokes: [st], box: bboxOfStrokes([st]) };
  }

  /** Stretchy delimiter / arrow / brace: one synthesized stroke fitted to the box (LTR frame, then G). */
  function stretchyUnit(node, leaves) {
    let b = emptyBox();
    for (const l of leaves) b = { x0: Math.min(b.x0, l.box.x0), y0: Math.min(b.y0, l.box.y0), x1: Math.max(b.x1, l.box.x1), y1: Math.max(b.y1, l.box.y1) };
    const codes = leaves.filter((l) => l.kind === 'glyph').map((l) => l.code);
    const shape = classifyStretchy(codes);
    const sigma = Math.max(...leaves.map((l) => (l.M ? sizeOf(l.M) : 1)), 0.5);
    const w = penFor(sigma);
    const nodeStr = nodeName(node.chain);
    const ch = codes.length ? plainChar(codes[0]) : '';
    if (!shape) return null;
    const paths = synthShape(shape, b, w);
    if (!paths) return null;
    const strokes = paths.map((p, k) => {
      const pts = p.pts.map(([x, y]) => G(x, y));
      const len = polylineLength(pts);
      return { source: shape.includes('rrow') || shape === 'mapsto' ? 'arrow' : 'delimiter', char: ch, font: 'latin', mirrored: rtl, node: nodeStr, pts, smooth: p.smooth, w, dur: Math.max(MIN_DUR, len / SYNTH_SPEED), gap: k ? 0.05 : 0, priority: 0, shape };
    });
    return { kind: 'stretchy', strokes, box: bboxOfStrokes(strokes) };
  }

  /** √ sign and its bar as one stroke. */
  function radicalUnit(node, surdLeaves, bar) {
    let b = emptyBox();
    for (const l of surdLeaves) b = { x0: Math.min(b.x0, l.box.x0), y0: Math.min(b.y0, l.box.y0), x1: Math.max(b.x1, l.box.x1), y1: Math.max(b.y1, l.box.y1) };
    const sigma = Math.max(...surdLeaves.map((l) => sizeOf(l.M)), 0.5);
    const w = penFor(sigma);
    const top = bar ? (bar.box.y0 + bar.box.y1) / 2 : b.y0 + w / 2;
    const bottom = b.y1 - w / 2;
    const H = bottom - top;
    const xTop = b.x1 - w * 0.3; // where the long up-stroke meets the bar
    // A hand-drawn √ is a short tick, a steep down-stroke and a long up-stroke whose
    // slant grows with the height. TeX's tall surds are narrow (≈0.9 em for any
    // height), so the sign may reach left of its box, by up to half the box width.
    let tick = Math.min(0.05 * H + 90, 240);
    let down = 0.07 * H + 80;
    let up = Math.min(0.2 * H, 450 + 0.1 * H);
    const need = tick + down + up;
    const room = xTop - (b.x0 + w / 2);
    const maxRoom = room + 0.5 * (b.x1 - b.x0);
    const k = need <= room ? Math.min(room / need, 1.7) : need <= maxRoom ? 1 : maxRoom / need;
    tick *= k; down *= k; up *= k;
    const xBottom = xTop - up;
    const xTickEnd = xBottom - down;
    const x0 = xTickEnd - tick;
    const tickY = bottom - Math.min(0.42 * H, 300 + 0.25 * H);
    const pts = [
      [x0, tickY + 0.25 * tick],
      [xTickEnd, tickY - 0.2 * tick],
      [xBottom, bottom],
      [xTop, top],
    ];
    if (bar) pts.push([bar.box.x1 - w / 2, top]);
    const root = pts.map(([x, y]) => G(x, y));
    const st = { source: 'radical', char: '√', font: 'latin', mirrored: rtl, node: nodeName(node.chain), pts: root, smooth: false, w, dur: Math.max(MIN_DUR, polylineLength(root) / SYNTH_SPEED), gap: 0, priority: 0 };
    return { kind: 'radical', strokes: [st], box: bboxOfStrokes([st]) };
  }

  function isStretchyMo(node, leaves) {
    if (node.mml !== 'mo') return false;
    const glyphs = leaves.filter((l) => l.kind === 'glyph');
    if (!glyphs.length) return false;
    const hasNested = (n) => n.kind === 'node' && (n.nestedSvg || n.children.some(hasNested));
    if (hasNested(node)) return true;
    if (glyphs.some((l) => PIECE_RANGE(l.code))) return true;
    if (glyphs.length === 1 && /^S[1-4]$/.test(glyphs[0].variant) && DELIMITER_CODES.has(glyphs[0].code)) return true;
    return false;
  }

  return { glyphUnit, textUnit, ruleUnit, stretchyUnit, radicalUnit, isStretchyMo, glyphPolicy, placement, G };
}

/** Shapes in the LTR frame, inside box b (y down), pen width w. */
export function synthShape(shape, b, w) {
  const x0 = b.x0 + w / 2, x1 = b.x1 - w / 2, y0 = b.y0 + w / 2, y1 = b.y1 - w / 2;
  const W = x1 - x0, H = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const flipX = (paths) => paths.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [x0 + x1 - x, y]) }));
  const flipY = (paths) => paths.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [x, y0 + y1 - y]) }));
  const curve = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
  switch (shape) {
    case 'lparen': {
      // A hand-drawn ( is one long arc: its ends stay inside the box, the bow grows
      // with the height (a tall paren is not just a stretched small one).
      const xr = x1 - 0.1 * W;
      const depth = Math.min(0.8 * W, 0.16 * H + 0.2 * W);
      return [{ smooth: true, pts: curve(12, (t) => [xr - depth * Math.sin(Math.PI * t) ** 0.65, y0 + H * t]) }];
    }
    case 'rparen': return flipX(synthShape('lparen', b, w));
    case 'lbrack': return [{ smooth: false, pts: [[x1, y0], [x0 + 0.15 * W, y0], [x0 + 0.15 * W, y1], [x1, y1]] }];
    case 'rbrack': return flipX(synthShape('lbrack', b, w));
    case 'lceil': return [{ smooth: false, pts: [[x0 + 0.15 * W, y1], [x0 + 0.15 * W, y0], [x1, y0]] }];
    case 'rceil': return flipX(synthShape('lceil', b, w));
    case 'lfloor': return [{ smooth: false, pts: [[x0 + 0.15 * W, y0], [x0 + 0.15 * W, y1], [x1, y1]] }];
    case 'rfloor': return flipX(synthShape('lfloor', b, w));
    case 'langle': return [{ smooth: false, pts: [[x1, y0], [x0 + 0.1 * W, cy], [x1, y1]] }];
    case 'rangle': return flipX(synthShape('langle', b, w));
    case 'bar': return [{ smooth: false, pts: [[cx, y0], [cx, y1]] }];
    case 'dbar': return [{ smooth: false, pts: [[x0 + 0.25 * W, y0], [x0 + 0.25 * W, y1]] }, { smooth: false, pts: [[x1 - 0.25 * W, y0], [x1 - 0.25 * W, y1]] }];
    case 'lbrace': {
      const xm = cx;
      return [{ smooth: true, pts: [[x1, y0], [xm + 0.12 * W, y0 + 0.04 * H], [xm, y0 + 0.16 * H], [xm, cy - 0.12 * H], [x0, cy], [xm, cy + 0.12 * H], [xm, y1 - 0.16 * H], [xm + 0.12 * W, y1 - 0.04 * H], [x1, y1]] }];
    }
    case 'rbrace': return flipX(synthShape('lbrace', b, w));
    case 'overbrace': {
      const ym = cy;
      return [{ smooth: true, pts: [[x0, y1], [x0 + 0.04 * W, ym + 0.12 * H], [x0 + 0.12 * W, ym], [cx - 0.08 * W, ym], [cx, y0], [cx + 0.08 * W, ym], [x1 - 0.12 * W, ym], [x1 - 0.04 * W, ym + 0.12 * H], [x1, y1]] }];
    }
    case 'underbrace': return flipY(synthShape('overbrace', b, w));
    case 'rarrow': case 'larrow': case 'barrow': case 'rArrow': case 'lArrow': case 'bArrow': case 'mapsto': {
      const dbl = /A/.test(shape);
      const hl = Math.min(0.45 * W, Math.max(H * 0.6, 160));
      const hh = Math.min(H / 2, hl * 0.75);
      const out = [];
      const gapY = dbl ? Math.min(H * 0.18, 70) : 0;
      const ys = dbl ? [cy - gapY, cy + gapY] : [cy];
      const right = shape !== 'larrow' && shape !== 'lArrow';
      const left = shape === 'larrow' || shape === 'lArrow' || shape === 'barrow' || shape === 'bArrow';
      if (shape === 'mapsto') out.push({ smooth: false, pts: [[x0, cy - hh], [x0, cy + hh]] });
      for (const y of ys) out.push({ smooth: false, pts: left && !right ? [[x1, y], [x0 + (dbl ? hl * 0.4 : 0), y]] : [[x0 + (left && dbl ? hl * 0.4 : 0), y], [x1 - (dbl ? hl * 0.4 : 0), y]] });
      if (right) out.push({ smooth: false, pts: [[x1 - hl, cy - hh], [x1, cy], [x1 - hl, cy + hh]] });
      if (left) out.push({ smooth: false, pts: [[x0 + hl, cy - hh], [x0, cy], [x0 + hl, cy + hh]] });
      return out;
    }
    default: return null;
  }
}
