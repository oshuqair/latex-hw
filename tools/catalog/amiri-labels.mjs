// Label Amiri glyph ids from harfbuzz shaping: isol / init / medi / fina / liga / mark.
// Stdout is JSON { "<gid>": { "char", "role", "cp" } }. Same font bytes ⇒ same labels.
import { readFileSync } from 'node:fs';
import { Blob, Buffer as HbBuffer, Direction, Face, Font, shape } from 'harfbuzzjs';

const root = process.argv[2];
const fontBuf = readFileSync(`${root}/fonts/amiri/amiri-8c2d3b63.ttf`);
const face = new Face(new Blob(fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength)), 0);
const font = new Font(face);
const glyphData = JSON.parse(readFileSync(`${root}/fonts/amiri/glyphData.json`, 'utf8'));
const byId = JSON.parse(readFileSync(`${root}/fonts/amiri/glyphDataById.json`, 'utf8'));

const chars = Object.keys(glyphData).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));

function isArab(ch) {
  const cp = ch.codePointAt(0);
  return (cp >= 0x0600 && cp <= 0x06FF) || (cp >= 0xFB50 && cp <= 0xFDFF) || (cp >= 0xFE70 && cp <= 0xFEFF);
}

function shapeText(text, rtl) {
  const buffer = new HbBuffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  buffer.setDirection(rtl ? Direction.RTL : Direction.LTR);
  if (rtl) buffer.setScript('Arab');
  shape(font, buffer, []);
  return buffer.getGlyphInfosAndPositions();
}

const RANK = { isol: 1, fina: 2, init: 2, medi: 3, mark: 3, liga: 4 };
const best = new Map();

function consider(gid, rec) {
  if (!gid || gid === '0' || !byId[gid]) return;
  const cur = best.get(gid);
  if (!cur || rec.rank > cur.rank) best.set(gid, rec);
}

function cpOf(ch) {
  const cp = ch.codePointAt(0);
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}

const isolGid = new Map();
for (const ch of chars) {
  const hit = shapeText(ch, isArab(ch)).find((g) => g.cluster === 0 && g.codepoint);
  if (!hit) continue;
  const gid = String(hit.codepoint);
  isolGid.set(ch, gid);
  consider(gid, { char: ch, role: 'isol', rank: RANK.isol, cp: cpOf(ch) });
}

const MARKS = [...'ًٌٍَُِّْ'].filter((ch) => chars.includes(ch));
const SKIP = new Set([...MARKS, 'ـ', '،', '؛', '؟', '٪', '٫', '٬']);
const LETTERS = chars.filter((ch) => isArab(ch) && !SKIP.has(ch) && !/[\u0660-\u0669]/.test(ch));
const BEH = 'ب';
const initOf = new Map();
const finaOf = new Map();

for (const ch of LETTERS) {
  const isol = isolGid.get(ch);
  const cp = cpOf(ch);
  for (const g of shapeText(ch + BEH, true)) {
    if (g.cluster !== 0 || !g.codepoint) continue;
    const gid = String(g.codepoint);
    if (gid !== isol) {
      initOf.set(ch, gid);
      consider(gid, { char: ch, role: 'init', rank: RANK.init, cp });
    }
  }
  for (const g of shapeText(BEH + ch, true)) {
    if (g.cluster !== 1 || !g.codepoint) continue;
    const gid = String(g.codepoint);
    if (gid !== isol) {
      finaOf.set(ch, gid);
      consider(gid, { char: ch, role: 'fina', rank: RANK.fina, cp });
    }
  }
  for (const g of shapeText(BEH + ch + BEH, true)) {
    if (g.cluster !== 1 || !g.codepoint) continue;
    const gid = String(g.codepoint);
    if (gid !== isol) consider(gid, { char: ch, role: 'medi', rank: RANK.medi, cp });
  }
}

// A pair that is not the ordinary initial/final form: lam-alef, and the other
// contextual joins Amiri draws as their own glyphs. When several pairs share a
// glyph, prefer the one with plain alef (ا), then the lowest code point.
const liga = new Map();
const prefer = (ch) => (ch === 'ا' ? 0 : 1);
function betterPair(next, cur) {
  const byPartner = prefer(next.partner) - prefer(cur.partner);
  if (byPartner) return byPartner < 0;
  return next.partner.codePointAt(0) < cur.partner.codePointAt(0);
}
for (const a of LETTERS) {
  for (const b of LETTERS) {
    const infos = shapeText(a + b, true);
    for (const g of infos) {
      if (!g.codepoint) continue;
      const gid = String(g.codepoint);
      let rec = null;
      if (g.cluster === 0 && gid !== isolGid.get(a) && gid !== initOf.get(a)) {
        rec = { char: a + b, focus: a, partner: b, side: 'before', role: 'liga', rank: RANK.liga, cp: cpOf(a) };
      } else if (g.cluster === 1 && gid !== isolGid.get(b) && gid !== finaOf.get(b)) {
        rec = { char: a + b, focus: b, partner: a, side: 'after', role: 'liga', rank: RANK.liga, cp: cpOf(b) };
      }
      if (!rec) continue;
      const cur = liga.get(gid);
      if (!cur || betterPair(rec, cur)) liga.set(gid, rec);
    }
  }
}
for (const [gid, rec] of liga) consider(gid, rec);

for (const base of LETTERS) {
  for (const mark of MARKS) {
    for (const g of shapeText(base + mark, true)) {
      if (!g.codepoint) continue;
      const gid = String(g.codepoint);
      const owner = g.cluster === 0 ? base : mark;
      if (gid === isolGid.get(owner)) continue;
      consider(gid, { char: base + mark, role: 'mark', rank: RANK.mark, cp: cpOf(base) });
    }
  }
}

const out = {};
for (const gid of [...best.keys()].sort((a, b) => Number(a) - Number(b))) {
  const rec = best.get(gid);
  const row = { char: rec.char, role: rec.role, cp: rec.cp };
  if (rec.focus) {
    row.focus = rec.focus;
    row.partner = rec.partner;
    row.side = rec.side;
  }
  out[gid] = row;
}
process.stdout.write(JSON.stringify(out));
