#!/usr/bin/env node
// Bundle the library for browsers: dist/latex-hw.browser.js (ESM) + harfbuzz.wasm + fonts/.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
const root = new URL('../', import.meta.url).pathname;
mkdirSync(`${root}dist`, { recursive: true });
await build({
  entryPoints: [`${root}src/browser.js`],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: `${root}dist/latex-hw.browser.js`,
  external: ['module', 'fs', 'path', 'url'],
  minify: true,
  legalComments: 'eof',
  logLevel: 'info',
});
cpSync(`${root}node_modules/harfbuzzjs/dist/harfbuzz.wasm`, `${root}dist/harfbuzz.wasm`);
cpSync(`${root}fonts`, `${root}dist/fonts`, { recursive: true });
console.log('dist/ ready: latex-hw.browser.js, harfbuzz.wasm, fonts/');
