import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConverter } from '../src/legacy/convert.js';

test('legacy latex-svg path (SVG transforms) still works, now with harfbuzzjs', async () => {
  const toSvg = await createConverter();
  const svg = toSvg('\\text{س} = \\frac{\\text{ب}}{\\text{٢}}');
  assert.ok(svg.includes('scale(-1,1)'));
  assert.ok(svg.includes('<text'));
});
