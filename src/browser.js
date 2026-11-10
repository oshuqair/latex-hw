// Browser helper: fetch the bundled fonts from a base URL and create a renderer.
// The core (index.js) is the same code Node uses; only the font loading differs.
import { createRenderer, setDefaultRenderer } from './index.js';

export * from './index.js';

/** `base` is the URL of the package's fonts/ folder (default: next to this module). */
export async function loadFonts(base = new URL('../fonts/', import.meta.url).href) {
  const url = (p) => new URL(p, base.endsWith('/') ? base : `${base}/`).href;
  const json = async (p) => (await fetch(url(p))).json();
  const bin = async (p) => (await fetch(url(p))).arrayBuffer();
  const [latinGlyphs, arabicGlyphs, arabicById, arabicFont, arabicFull] = await Promise.all([
    json('caveat-math/glyphData.json'),
    json('amiri/glyphData.json'),
    json('amiri/glyphDataById.json'),
    bin('amiri/amiri-7df37680.ttf'),
    bin('amiri/Amiri-Regular.ttf'),
  ]);
  return {
    fonts: {
      latin: { family: 'Caveat Math', unitsPerEm: 1000, glyphData: latinGlyphs },
      arabic: { family: 'Amiri Tegaki 7df37680', unitsPerEm: 1000, glyphData: arabicGlyphs, glyphDataById: arabicById, features: ['ccmp', 'dnom', 'fina', 'init', 'liga', 'locl', 'medi', 'numr', 'pnum', 'rlig'] },
    },
    fontData: { arabic: arabicFont, arabicFull },
  };
}

export async function createBrowserRenderer(base) {
  const r = await createRenderer(await loadFonts(base));
  setDefaultRenderer(r);
  return r;
}
