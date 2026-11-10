// Node helpers: load the bundled fonts from disk and create a renderer.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRenderer, setDefaultRenderer } from './index.js';

export * from './index.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const json = (p) => JSON.parse(readFileSync(here(p), 'utf8'));
const bytes = (p) => {
  const b = readFileSync(here(p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

export function loadDefaultFonts() {
  return {
    fonts: {
      latin: { family: 'Caveat Math', unitsPerEm: 1000, glyphData: json('../fonts/caveat-math/glyphData.json') },
      arabic: {
        family: 'Amiri Tegaki 7df37680',
        unitsPerEm: 1000,
        glyphData: json('../fonts/amiri/glyphData.json'),
        glyphDataById: json('../fonts/amiri/glyphDataById.json'),
        features: ['ccmp', 'dnom', 'fina', 'init', 'liga', 'locl', 'medi', 'numr', 'pnum', 'rlig'],
      },
    },
    fontData: { arabic: bytes('../fonts/amiri/amiri-7df37680.ttf'), arabicFull: bytes('../fonts/amiri/Amiri-Regular.ttf') },
  };
}

let cached = null;
export function createNodeRenderer() {
  cached ??= createRenderer(loadDefaultFonts());
  setDefaultRenderer(cached);
  return cached;
}
createNodeRenderer();
