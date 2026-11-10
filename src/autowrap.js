// Bare Arabic in math mode is one `mi` per letter: `س^2` puts the superscript on an
// isolated letter, and `إذا` never joins. This wraps that input in `\text{}` before
// MathJax sees it. `\text{س}` itself is unchanged.
//
// A letter standing alone is a variable (`س^2` → `\text{س}^2`, `أج` → `\text{أ}\text{ج}`),
// so juxtaposition stays juxtaposition. Three or more letters with nothing between
// them are a word (`إذا` → `\text{إذا}`) and join. `لا` / `لأ` / `لإ` / `لآ` stay one
// token: lam-alef is a single letter shape. A two-letter name (`كح`, `نق`) still
// needs an explicit `\text{كح}`.
// Arabic-Indic digits stay one number (`٣٫٥`, `١٬٠٠٠`); Western digits stay outside
// `\text{}` so they keep Caveat. Already-wrapped text (`\text`, `\textbf`, `\hbox`, …)
// is left alone.

// A run of this many base letters is one word. Fewer are variables, one `\text{}` each.
const WORD_MIN = 3;

// Text-mode commands whose argument is already one run. Wrapping inside would nest.
const TEXT_COMMANDS = new Set([
  'text', 'mbox', 'hbox', 'textnormal', 'textrm', 'textit', 'textbf',
  'textsf', 'texttt', 'textsc', 'textup', 'emph',
]);

const ALEF = new Set(['ا', 'أ', 'إ', 'آ', 'ٱ']);

function isBaseLetter(cp) {
  return (cp >= 0x0621 && cp <= 0x063A)
    || (cp >= 0x0641 && cp <= 0x064A)
    || (cp >= 0x0671 && cp <= 0x06D3)
    || (cp >= 0x06FA && cp <= 0x06FC)
    || (cp >= 0x0750 && cp <= 0x077F)
    || (cp >= 0x08A0 && cp <= 0x08FF)
    || (cp >= 0xFB50 && cp <= 0xFDFF)
    || (cp >= 0xFE70 && cp <= 0xFEFC);
}

function isMark(cp) {
  return cp === 0x0640 // tatweel
    || (cp >= 0x064B && cp <= 0x065F)
    || cp === 0x0670
    || (cp >= 0x06D6 && cp <= 0x06ED)
    || cp === 0x200C
    || cp === 0x200D;
}

function isArabicDigit(cp) {
  return (cp >= 0x0660 && cp <= 0x0669) || (cp >= 0x06F0 && cp <= 0x06F9);
}

// ، ؛ ؟ ٪ ٫ ٬ ۔
function isPunct(cp) {
  return cp === 0x060C || cp === 0x061B || cp === 0x061F || cp === 0x066A
    || cp === 0x066B || cp === 0x066C || cp === 0x06D4;
}

function isArabicUnit(cp) {
  return isBaseLetter(cp) || isMark(cp) || isArabicDigit(cp) || isPunct(cp);
}

function textOf(body) {
  return `\\text{${body}}`;
}

function readControl(s, i) {
  let j = i + 1;
  if (j >= s.length) return { raw: '\\', name: '', end: j };
  if (/[A-Za-z]/.test(s[j])) {
    const start = j;
    while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
    return { raw: s.slice(i, j), name: s.slice(start, j), end: j };
  }
  return { raw: s.slice(i, j + 1), name: '', end: j + 1 };
}

/** Index just past the braced argument, including spaces before the `{`. `i` if there is none. */
function endOfBracedArg(s, i) {
  let j = i;
  while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n' || s[j] === '\r')) j++;
  if (s[j] !== '{') return i;
  let depth = 0;
  while (j < s.length) {
    if (s[j] === '\\') { j += 2; continue; }
    if (s[j] === '{') depth += 1;
    else if (s[j] === '}') {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
    j += 1;
  }
  return s.length;
}

function endOfArabic(s, i) {
  let j = i;
  while (j < s.length) {
    const cp = s.codePointAt(j);
    if (!isArabicUnit(cp)) break;
    j += cp > 0xFFFF ? 2 : 1;
  }
  return j;
}

/** One base letter plus the marks and tatweel that belong to it (they follow the letter). */
function letterClusters(str) {
  const chars = [...str];
  const clusters = [];
  let leading = '';
  for (const ch of chars) {
    const cp = ch.codePointAt(0);
    if (!isBaseLetter(cp)) {
      if (clusters.length) clusters[clusters.length - 1].text += ch;
      else leading += ch;
      continue;
    }
    clusters.push({ base: ch, text: leading + ch });
    leading = '';
  }
  if (leading) {
    if (clusters.length) clusters[clusters.length - 1].text += leading;
    else clusters.push({ base: '', text: leading });
  }
  return clusters;
}

function wrapLetters(str) {
  const clusters = letterClusters(str);
  const bases = clusters.filter((c) => c.base);
  if (bases.length >= WORD_MIN) return textOf(str);
  if (bases.length === 2 && bases[0].base === 'ل' && ALEF.has(bases[1].base)) return textOf(str);
  return clusters.map((c) => textOf(c.text)).join('');
}

// ٫ and ٬ join a number only when a digit follows them. ٪ may sit on either end.
function wrapSequence(seq) {
  const chars = [...seq];
  let out = '';
  let i = 0;
  while (i < chars.length) {
    const cp = chars[i].codePointAt(0);
    const nextDigit = i + 1 < chars.length && isArabicDigit(chars[i + 1].codePointAt(0));
    if (isArabicDigit(cp) || (cp === 0x066A && nextDigit)) {
      let j = cp === 0x066A ? i + 1 : i;
      while (j < chars.length) {
        const c = chars[j].codePointAt(0);
        if (isArabicDigit(c)) { j += 1; continue; }
        const sepNext = j + 1 < chars.length && isArabicDigit(chars[j + 1].codePointAt(0));
        if ((c === 0x066B || c === 0x066C) && sepNext) { j += 1; continue; }
        break;
      }
      if (j < chars.length && chars[j] === '٪') j += 1;
      out += textOf(chars.slice(i, j).join(''));
      i = j;
      continue;
    }
    if (isBaseLetter(cp) || isMark(cp)) {
      let j = i;
      while (j < chars.length) {
        const c = chars[j].codePointAt(0);
        if (isBaseLetter(c) || isMark(c)) j += 1;
        else break;
      }
      out += wrapLetters(chars.slice(i, j).join(''));
      i = j;
      continue;
    }
    out += textOf(chars[i]);
    i += 1;
  }
  return out;
}

/** Wrap bare Arabic letters, Arabic-Indic digits and Arabic punctuation in `\text{}`. */
export function autoWrapArabic(tex) {
  const s = String(tex);
  let i = 0;
  let out = '';
  while (i < s.length) {
    const ch = s[i];
    if (ch === '%') {
      let j = i + 1;
      while (j < s.length && s[j] !== '\n') j += 1;
      if (j < s.length) j += 1;
      out += s.slice(i, j);
      i = j;
      continue;
    }
    if (ch === '\\') {
      const cmd = readControl(s, i);
      out += cmd.raw;
      i = cmd.end;
      if (TEXT_COMMANDS.has(cmd.name)) {
        const end = endOfBracedArg(s, i);
        out += s.slice(i, end);
        i = end;
      }
      continue;
    }
    if (isArabicUnit(s.codePointAt(i))) {
      const end = endOfArabic(s, i);
      out += wrapSequence(s.slice(i, end));
      i = end;
      continue;
    }
    const cp = s.codePointAt(i);
    const n = cp > 0xFFFF ? 2 : 1;
    out += s.slice(i, i + n);
    i += n;
  }
  return out;
}
