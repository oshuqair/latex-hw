// Operator dictionary: English TeX function names -> Arabic words, used in rtl.
// Ported from latex-svg's dictionary.md / dictionary.js, but embedded as data so
// the core needs no filesystem (browser + Node). `parseDictionary` reads the
// same `name -> word` markdown format if a caller wants to load their own.

export const DEFAULT_DICTIONARY_MD = `# English to Arabic

log -> لو
ln -> لوط
lim -> نهـــا
sin -> جا
cos -> جتا
tan -> ظا
cot -> ظتا
sec -> قا
csc -> قتا
cosec -> قتا
`;

export function parseDictionary(markdown) {
  const entries = [];
  for (const line of String(markdown).split('\n')) {
    const match = line.match(/^([A-Za-z]+)\s*->\s*(.+?)\s*$/);
    if (match) entries.push([match[1], match[2]]);
  }
  entries.sort((a, b) => b[0].length - a[0].length);
  return entries;
}

export const DEFAULT_DICTIONARY = parseDictionary(DEFAULT_DICTIONARY_MD);

// Operators that take limits under/over them in display style, like TeX's \lim.
// Every other word gets \nolimits so `\sin^2` puts the 2 beside جا, not above it
// (latex-svg used a bare \mathop, which stacked the exponent).
export const LIMIT_OPERATORS = new Set(['lim', 'limsup', 'liminf', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'Pr']);

/** Replace `\sin` etc. with `\mathop{\text{جا}}\nolimits` (and `\lim` with `\mathop{\text{نهـــا}}`). */
export function translateOperators(tex, entries = DEFAULT_DICTIONARY) {
  let result = tex;
  for (const [english, arabic] of entries) {
    const pattern = new RegExp(`\\\\${english}(?![A-Za-z])`, 'g');
    const limits = LIMIT_OPERATORS.has(english) ? '' : '\\nolimits';
    result = result.replace(pattern, () => `\\mathop{\\text{${arabic}}}${limits} `);
  }
  return result;
}
