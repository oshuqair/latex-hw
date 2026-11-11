// Vite's dep prebundler (esbuild, Vite ≤7) leaves `new URL(..., import.meta.url)`
// pointing at `node_modules/.vite/`, and the dev server answers with index.html.
// Rolldown (Vite 8) and `vite build` rewrite a static file URL; these two fixes
// cover the prebundler that does not. Neither runs for a normal file URL.

const VITE_DEP_FONTS = '/node_modules/.vite/fonts/';
const VITE_DEP_WASM = /\/node_modules\/\.vite\/deps\/harfbuzz\.wasm(?:[?#]|$)/;

/** Point a prebundled font href back at this package. Other hrefs pass through. */
export function shippedFontUrl(href, packageName = 'latex-hw') {
  const at = href.indexOf(VITE_DEP_FONTS);
  if (at === -1) return href;
  return `${href.slice(0, at)}/node_modules/${packageName}/fonts/${href.slice(at + VITE_DEP_FONTS.length)}`;
}

/** harfbuzzjs loads `new URL("harfbuzz.wasm", import.meta.url)` from the prebundled chunk. */
export function shippedWasmUrl(url) {
  if (!VITE_DEP_WASM.test(url)) return url;
  return new URL('../../harfbuzzjs/dist/harfbuzz.wasm', url).href;
}

function inputUrl(input) {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href;
  if (input && typeof input.url === 'string') return input.url;
  return '';
}

function withUrl(input, url) {
  if (typeof input === 'string' || (typeof URL !== 'undefined' && input instanceof URL)) return url;
  if (typeof Request === 'function' && input instanceof Request) return new Request(url, input);
  return url;
}

// Installed by importing this module, which browser.js does before harfbuzzjs loads.
if (typeof globalThis.fetch === 'function' && !globalThis.fetch.__latexHwWasm) {
  const fetchImpl = globalThis.fetch.bind(globalThis);
  const wrapped = (input, init) => {
    const url = inputUrl(input);
    const fixed = shippedWasmUrl(url);
    if (fixed !== url) input = withUrl(input, fixed);
    return fetchImpl(input, init);
  };
  wrapped.__latexHwWasm = true;
  globalThis.fetch = wrapped;
}
