// Characters that stay mirrored with the line in rtl (ported from latex-svg rtl.js).
// Everything else is flipped back so it keeps its normal shape.
// Phase 1 adds the horizontal arrows (decision: arrows point the way Arabic reads).

export const keepMirroredCharacters = new Set([
  0x221a, // square root
  0x222b, // integral
  0x2211, // summation

  0x28, 0x29, // parentheses
  0x239b, 0x239c, 0x239d, // left parenthesis pieces
  0x239e, 0x239f, 0x23a0, // right parenthesis pieces

  0x5b, 0x5d, // square brackets
  0x23a1, 0x23a2, 0x23a3, // left square bracket pieces
  0x23a4, 0x23a5, 0x23a6, // right square bracket pieces
  0x2308, 0x2309, // ceiling
  0x230a, 0x230b, // floor

  0x7b, 0x7d, // braces
  0x23a7, 0x23a8, 0x23a9, 0x23aa, 0x23ab, 0x23ac, 0x23ad, // brace pieces
  0x23b0, 0x23b1, // group and moustache
  0x27ee, 0x27ef,

  0x27e8, 0x27e9, // angle brackets
  0x2329, 0x232a,
  0x3008, 0x3009,

  0x231c, 0x231d, 0x231e, 0x231f, // corner brackets

  0x7c, 0x2223, 0x2758, // single vertical bars
  0x2016, 0x2225, // double vertical bars

  0x23dc, 0x23dd, 0x23de, 0x23df, // over and under braces
  0x2322, 0x2323,
  0xe150, 0xe151, 0xe152, 0xe153, 0xe154, 0xe155, 0xe156,
  0x23b4, 0x23b5, // horizontal square brackets
  0x250c, 0x2510, 0x2514, 0x2518,

  // New in latex-hw: horizontal arrows and the pieces of extensible arrows.
  0x2190, 0x2192, 0x2194, // ← → ↔
  0x21d0, 0x21d2, 0x21d4, // ⇐ ⇒ ⇔
  0x21a6, 0x21a4, // ↦ ↤
  0x27f5, 0x27f6, 0x27f7, // ⟵ ⟶ ⟷
  0x27f8, 0x27f9, 0x27fa, // ⟸ ⟹ ⟺
  0x27fc, // ⟼
  0x21aa, 0x21a9, // ↪ ↩
  0x21c0, 0x21c1, 0x21bc, 0x21bd, // harpoons
  0x21cc, 0x21cb, // ⇌ ⇋
  0x219e, 0x21a0, // two-headed arrows
  0x21dd, // squiggle arrow
  0x20d6, 0x20d7, 0x20e1, // \overleftarrow-style combining arrows (\vec)
  0x23b7, // radical bottom piece
]);

// Left-right symmetric symbols whose strokes are mirrored in rtl anyway, so
// their horizontal strokes run right to left like the rest of the line. The
// shape does not change, only the pen direction (and data-mirrored="true").
export const rtlStrokeDirection = new Set([0x3d, 0x2212, 0x2d, 0x2b, 0xb1, 0x2213, 0xd7, 0xf7, 0x2261, 0x22c5, 0xb7, 0x2248]);

// Relations Unicode marks Bidi_Mirrored, with their Bidi_Mirroring_Glyph pairs
// (BidiMirroring.txt). In rtl they are mirrored by default (`mirrorRelations: true`),
// as Unicode bidi shows them in Arabic text: "س < ٥" is drawn with the point toward
// س, so it still reads "س is less than ٥" right to left. Each pair is listed once.
const RELATION_PAIRS = [
  [0x3c, 0x3e], // < >
  [0x2264, 0x2265], [0x2266, 0x2267], [0x2268, 0x2269], // ≤ ≥  ≦ ≧  ≨ ≩
  [0x2a7d, 0x2a7e], [0x2a85, 0x2a86], [0x2a87, 0x2a88], [0x2a89, 0x2a8a], [0x2a95, 0x2a96], // ⩽ ⩾ …
  [0x226a, 0x226b], [0x226e, 0x226f], [0x2270, 0x2271], // ≪ ≫  ≮ ≯  ≰ ≱
  [0x2272, 0x2273], [0x2274, 0x2275], [0x2276, 0x2277], // ≲ ≳  ≴ ≵  ≶ ≷
  [0x227a, 0x227b], [0x227c, 0x227d], [0x227e, 0x227f], [0x2280, 0x2281], [0x2aaf, 0x2ab0], // ≺ ≻ …
  [0x22d6, 0x22d7], [0x22d8, 0x22d9], [0x22da, 0x22db], [0x22dc, 0x22dd], [0x22de, 0x22df], // ⋖ ⋗ …
  [0x22e6, 0x22e7], [0x22e8, 0x22e9],
  [0x2282, 0x2283], [0x2284, 0x2285], [0x2286, 0x2287], [0x2288, 0x2289], [0x228a, 0x228b], // ⊂ ⊃ ⊄ ⊅ ⊆ ⊇ ⊈ ⊉ ⊊ ⊋
  [0x2ac5, 0x2ac6], [0x2acb, 0x2acc], [0x22d0, 0x22d1], // ⫅ ⫆  ⫋ ⫌  ⋐ ⋑
  [0x228f, 0x2290], [0x2291, 0x2292], // ⊏ ⊐  ⊑ ⊒
  [0x2208, 0x220b], [0x2209, 0x220c], [0x220a, 0x220d], // ∈ ∋  ∉ ∌  ∊ ∍
  [0x22a2, 0x22a3], // ⊢ ⊣
  [0x22a8, 0x2ae4], [0x22a9, 0x2ae3], [0x22ab, 0x2ae5], // ⊨ ⫤  ⊩ ⫣  ⊫ ⫥
  [0x22b2, 0x22b3], [0x22b4, 0x22b5], [0x22b0, 0x22b1], // ⊲ ⊳  ⊴ ⊵  ⊰ ⊱
];
// Not mirrored (judged): ∠ ∡ ∢ ∟ (shapes, not relations), ∕ ∖ ⧵ (slashes), ∝ ≃ ∼ (the
// mirrored form is unusual in Arabic school books).

/** code -> its mirror-image partner */
export const relationPairs = new Map(RELATION_PAIRS.flatMap(([a, b]) => [[a, b], [b, a]]));
export const mirroredRelations = new Set(relationPairs.keys());

/**
 * How an rtl glyph is drawn. Returns { keep, drawCode }:
 * - keep: true -> the glyph stays mirrored with the line (no pre-flip).
 * - drawCode: a different character to draw upright instead (a relation's
 *   mirror partner), so the strokes keep that glyph's own natural order,
 *   direction and slant instead of a reflected copy.
 * `has(code)` says whether the handwriting font has strokes for a character.
 */
export function rtlGlyphPolicy(code, opts, has = () => false) {
  if (keepMirroredCharacters.has(code) || rtlStrokeDirection.has(code)) return { keep: true, drawCode: code };
  if (opts.mirrorRelations && mirroredRelations.has(code)) {
    const pair = relationPairs.get(code);
    if (pair && has(code) && has(pair)) return { keep: false, drawCode: pair, relation: true };
    return { keep: true, drawCode: code, relation: true };
  }
  return { keep: false, drawCode: code };
}
