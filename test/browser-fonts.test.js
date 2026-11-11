import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shippedFontUrl, shippedWasmUrl } from '../src/bundler-assets.js';
import { loadFonts } from '../src/browser.js';

const SHIPPED = [
  '../fonts/caveat-math/glyphData.json',
  '../fonts/amiri/glyphData.json',
  '../fonts/amiri/glyphDataById.json',
  '../fonts/amiri/amiri-8c2d3b63.ttf',
  '../fonts/amiri/Amiri-Regular.ttf',
];

test('shipped font URLs are static file literals Vite can emit', () => {
  const src = readFileSync(new URL('../src/browser.js', import.meta.url), 'utf8');
  const found = [...src.matchAll(/new URL\('(\.\.\/fonts\/[^']+)', import\.meta\.url\)/g)].map((m) => m[1]);
  assert.deepEqual(found, SHIPPED);
  const browser = new URL('../src/browser.js', import.meta.url);
  for (const rel of SHIPPED) assert.equal(existsSync(fileURLToPath(new URL(rel, browser))), true, rel);
});

test('prebundled .vite/fonts href is rewritten to the package fonts', () => {
  const broken = 'http://localhost:5173/node_modules/.vite/fonts/caveat-math/glyphData.json';
  assert.equal(
    shippedFontUrl(broken),
    'http://localhost:5173/node_modules/latex-hw/fonts/caveat-math/glyphData.json',
  );
  const ok = 'http://localhost:5173/node_modules/latex-hw/fonts/amiri/amiri-8c2d3b63.ttf';
  assert.equal(shippedFontUrl(ok), ok);
  assert.equal(shippedFontUrl('http://localhost:5173/assets/glyphData-abc123.json'), 'http://localhost:5173/assets/glyphData-abc123.json');
});

test('prebundled harfbuzz.wasm href points at the real file', () => {
  const broken = 'http://localhost:5173/node_modules/.vite/deps/harfbuzz.wasm';
  assert.equal(
    shippedWasmUrl(broken),
    'http://localhost:5173/node_modules/harfbuzzjs/dist/harfbuzz.wasm',
  );
  const query = 'http://localhost:5173/node_modules/.vite/deps/harfbuzz.wasm?import';
  assert.equal(shippedWasmUrl(query), 'http://localhost:5173/node_modules/harfbuzzjs/dist/harfbuzz.wasm');
  const ok = 'http://localhost:5173/node_modules/harfbuzzjs/dist/harfbuzz.wasm';
  assert.equal(shippedWasmUrl(ok), ok);
  assert.equal(shippedWasmUrl('http://localhost:5173/assets/harfbuzz-abc.wasm'), 'http://localhost:5173/assets/harfbuzz-abc.wasm');
});

function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('a font miss names the URL and the status, not a JSON parse of index.html', async () => {
  const cases = [
    { status: 404, type: 'text/html; charset=utf-8', body: '<!doctype html><html></html>' },
    { status: 200, type: 'text/html', body: '<!doctype html><html>index</html>' },
  ];
  for (const item of cases) {
    const server = await listen((_req, res) => {
      res.writeHead(item.status, { 'content-type': item.type });
      res.end(item.body);
    });
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/fonts`;
    try {
      await assert.rejects(() => loadFonts(base), (err) => {
        assert.equal(err instanceof SyntaxError, false);
        assert.match(err.message, new RegExp(`\\(${item.status}\\)`));
        assert.match(err.message, /glyphData\.json/);
        assert.match(err.message, new RegExp(`127\\.0\\.0\\.1:${port}`));
        assert.doesNotMatch(err.message, /Unexpected token|<!doctype/i);
        return true;
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
