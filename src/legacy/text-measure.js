// latex-hw port of latex-svg's text-measure.js.
// Was: `hb-shape` CLI + macOS system fonts (GeezaPro / Arial Unicode).
// Now: harfbuzzjs (WASM) + the bundled Amiri subset font, so it runs anywhere.
// Same contract: measureTextBox(text, fontSize) -> { advance, center } | null.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createArabicShaper } from '../arabic.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const bytes = (p) => {
  const b = readFileSync(here(p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

let shaper = null;
function getShaper() {
  shaper ??= createArabicShaper({
    font: bytes('../../fonts/amiri/amiri-7df37680.ttf'),
    fullFont: bytes('../../fonts/amiri/Amiri-Regular.ttf'),
    bundle: { glyphDataById: JSON.parse(readFileSync(here('../../fonts/amiri/glyphDataById.json'), 'utf8')), features: ['ccmp', 'liga', 'locl', 'rlig'] },
  });
  return shaper;
}

export function measureTextBox(text, fontSize) {
  const run = getShaper().shapeRun(text);
  if (!run.glyphs.length || run.advance <= 0) return null;
  const k = fontSize / getShaper().upem;
  return { advance: run.advance * k, center: (run.advance * k) / 2 };
}
