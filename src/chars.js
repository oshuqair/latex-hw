// Character helpers: map MathJax code points (math italic etc.) back to the
// plain characters the handwriting bundles are keyed by.

const GREEK = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ∇αβγδεζηθικλμνξοπρςστυφχψω∂ϵϑϰϕϱϖ';
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SPECIAL = new Map([
  [0x210e, 'h'], [0x1d6a4, 'ı'], [0x1d6a5, 'ȷ'], [0x2032, '′'], [0x2033, '″'], [0x2034, '‴'],
  [0x2061, ''], [0x2062, ''], [0x2063, ''], [0x2064, ''],
]);

/** The plain character for a MathJax glyph code point. */
export function plainChar(code) {
  if (SPECIAL.has(code)) return SPECIAL.get(code);
  if (code >= 0x1d400 && code <= 0x1d6a3) return LATIN[(code - 0x1d400) % 52];
  if (code >= 0x1d6a8 && code <= 0x1d7c9) return [...GREEK][(code - 0x1d6a8) % 58];
  if (code >= 0x1d7ce && code <= 0x1d7ff) return String.fromCharCode(0x30 + ((code - 0x1d7ce) % 10));
  return String.fromCodePoint(code);
}

export function isLetterOrDigit(ch) {
  return /^[\p{L}\p{N}]$/u.test(ch);
}

// Stretchy delimiter classification from the code points a MathJax <mo> is built of.
const SETS = {
  lparen: [0x28, 0x239b, 0x239c, 0x239d],
  rparen: [0x29, 0x239e, 0x239f, 0x23a0],
  lbrack: [0x5b],
  rbrack: [0x5d],
  lbrace: [0x7b, 0x23a7, 0x23a8, 0x23a9],
  rbrace: [0x7d, 0x23ab, 0x23ac, 0x23ad],
  bar: [0x7c, 0x2223, 0x2758, 0x23d0],
  dbar: [0x2016, 0x2225],
  langle: [0x27e8, 0x2329, 0x3008],
  rangle: [0x27e9, 0x232a, 0x3009],
  lceil: [0x2308], rceil: [0x2309], lfloor: [0x230a], rfloor: [0x230b],
  overbrace: [0x23de], underbrace: [0x23df],
  radical: [0x221a, 0x23b7],
  rarrow: [0x2192, 0x27f6], larrow: [0x2190, 0x27f5], barrow: [0x2194, 0x27f7],
  rArrow: [0x21d2, 0x27f9], lArrow: [0x21d0, 0x27f8], bArrow: [0x21d4, 0x27fa],
  mapsto: [0x21a6, 0x27fc],
};
export const PIECE_RANGE = (c) => (c >= 0x239b && c <= 0x23b7) || c === 0x23d0 || (c >= 0xe000 && c <= 0xf8ff);

export function classifyStretchy(codes) {
  const has = (list) => list.some((c) => codes.includes(c));
  if (has([0x23a1, 0x23a2, 0x23a3])) {
    if (codes.includes(0x23a1) && codes.includes(0x23a3)) return 'lbrack';
    return codes.includes(0x23a1) ? 'lceil' : 'lfloor';
  }
  if (has([0x23a4, 0x23a5, 0x23a6])) {
    if (codes.includes(0x23a4) && codes.includes(0x23a6)) return 'rbrack';
    return codes.includes(0x23a4) ? 'rceil' : 'rfloor';
  }
  if (codes.includes(0x2190) && codes.includes(0x2192)) return 'barrow';
  if (codes.includes(0x21d0) && codes.includes(0x21d2)) return 'bArrow';
  for (const [name, list] of Object.entries(SETS)) if (has(list)) return name;
  if (codes.includes(0x23aa)) return 'lbrace';
  return null;
}

export const DELIMITER_CODES = new Set(
  ['lparen', 'rparen', 'lbrack', 'rbrack', 'lbrace', 'rbrace', 'bar', 'dbar', 'langle', 'rangle', 'lceil', 'rceil', 'lfloor', 'rfloor']
    .flatMap((k) => SETS[k]),
);

// Characters Caveat Math lacks but can borrow a close glyph for, fitted to the TeX box.
export const ALIASES = new Map([
  [0x20d7, '→'], [0x20d6, '←'], [0x20e1, '↔'], // combining vector arrows (\vec)
  [0x2c9, '¯'], [0x2ca, '´'], [0x2cb, '`'],
]);
