import { readFileSync } from 'node:fs';

export function loadSamples() {
  const root = new URL('../samples/', import.meta.url);
  // One expression per line, except environments and \left…\right that span lines; plain English lines are titles.
  const arabic = [];
  let buf = [];
  let depth = 0;
  for (const raw of readFileSync(new URL('arabic-samples.txt', root), 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || (/^[A-Za-z ]+$/.test(line) && !depth)) continue;
    buf.push(line);
    depth += (line.match(/\\begin\{|\\left(?![a-z])/g) ?? []).length - (line.match(/\\end\{|\\right(?![a-z])/g) ?? []).length;
    if (depth <= 0) { arabic.push(buf.join(' ')); buf = []; depth = 0; }
  }
  if (buf.length) arabic.push(buf.join(' '));
  const gpt = [...readFileSync(new URL('gpt-samples.txt', root), 'utf8').matchAll(/\\\[([\s\S]*?)\\\]/g)].map((m) => m[1].trim()).filter(Boolean);
  return [...arabic.map((tex) => ({ set: 'arabic-samples', tex })), ...gpt.map((tex) => ({ set: 'gpt-samples', tex }))];
}

