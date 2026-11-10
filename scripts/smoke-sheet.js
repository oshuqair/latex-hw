#!/usr/bin/env node
// Dev QA: render every smoke sample to scratch/smoke/NNN.svg (rasterize + tile with smoke-sheet.py).
import { mkdirSync, writeFileSync } from 'node:fs';
import { render } from '../src/node.js';
import { loadSamples } from './smoke-lib.js';
const dir = new URL('../scratch/smoke/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
for (const [i, s] of loadSamples().entries()) writeFileSync(`${dir}${String(i).padStart(3, '0')}.svg`, (await render(s.tex, { dir: 'rtl', fontSize: 32 })).svg);
