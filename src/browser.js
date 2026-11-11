// Browser helper: fetch the bundled fonts and create a renderer.
// The core (index.js) is the same code Node uses; only the font loading differs.
// This import runs first, so the wasm fetch fix is in place before harfbuzzjs loads.
import { shippedFontUrl } from './bundler-assets.js';
import { createRenderer, setDefaultRenderer } from './index.js';

export * from './index.js';

// Static file URLs. Vite rewrites each one into a real asset (dev and production).
// A directory URL such as `new URL('../fonts/', import.meta.url)` is not a file, so
// `vite build` leaves it alone and the app fetches index.html. Keep these literals.
const latinGlyphsUrl = new URL('../fonts/caveat-math/glyphData.json', import.meta.url);
const arabicGlyphsUrl = new URL('../fonts/amiri/glyphData.json', import.meta.url);
const arabicByIdUrl = new URL('../fonts/amiri/glyphDataById.json', import.meta.url);
const arabicFontUrl = new URL('../fonts/amiri/amiri-8c2d3b63.ttf', import.meta.url);
const arabicFullUrl = new URL('../fonts/amiri/Amiri-Regular.ttf', import.meta.url);

function fontUrl(fileUrl, base, rel) {
  if (base == null || base === '') return shippedFontUrl(fileUrl.href);
  const root = base.endsWith('/') ? base : `${base}/`;
  return new URL(rel, root).href;
}

function fontFetchError(url, status) {
  return new Error(`Failed to load font file ${url} (${status})`);
}

async function fetchFont(url) {
  const response = await fetch(url);
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || type.includes('text/html')) throw fontFetchError(url, response.status);
  return response;
}

async function fetchJsonFont(url) {
  const response = await fetchFont(url);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw fontFetchError(url, response.status);
  }
}

/** `base` is the URL of a fonts/ folder. Omit it to fetch the files shipped with the package. */
export async function loadFonts(base) {
  const url = (fileUrl, rel) => fontUrl(fileUrl, base, rel);
  const [latinGlyphs, arabicGlyphs, arabicById, arabicFont, arabicFull] = await Promise.all([
    fetchJsonFont(url(latinGlyphsUrl, 'caveat-math/glyphData.json')),
    fetchJsonFont(url(arabicGlyphsUrl, 'amiri/glyphData.json')),
    fetchJsonFont(url(arabicByIdUrl, 'amiri/glyphDataById.json')),
    fetchFont(url(arabicFontUrl, 'amiri/amiri-8c2d3b63.ttf')).then((response) => response.arrayBuffer()),
    fetchFont(url(arabicFullUrl, 'amiri/Amiri-Regular.ttf')).then((response) => response.arrayBuffer()),
  ]);
  return {
    fonts: {
      latin: { family: 'Caveat Math', unitsPerEm: 1000, glyphData: latinGlyphs },
      arabic: { family: 'Amiri Tegaki 8c2d3b63', unitsPerEm: 1000, glyphData: arabicGlyphs, glyphDataById: arabicById, features: ['ccmp', 'dnom', 'fina', 'init', 'liga', 'locl', 'medi', 'numr', 'pnum', 'rlig'] },
    },
    fontData: { arabic: arabicFont, arabicFull },
  };
}

/** `base` optional: URL of a fonts/ folder. Omit it to use the fonts shipped with the package. */
export async function createBrowserRenderer(base) {
  const r = await createRenderer(await loadFonts(base));
  setDefaultRenderer(r);
  return r;
}
