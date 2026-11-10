import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoWrapArabic } from '../src/autowrap.js';

const wrap = autoWrapArabic;

test('a bare letter is its own variable, scripts and operators stay outside', () => {
  assert.equal(wrap('س^2'), '\\text{س}^2');
  assert.equal(wrap('س^٢'), '\\text{س}^\\text{٢}');
  assert.equal(wrap('س+ص'), '\\text{س}+\\text{ص}');
  assert.equal(wrap('س ص'), '\\text{س} \\text{ص}');
  assert.equal(wrap('س_١'), '\\text{س}_\\text{١}');
  assert.equal(wrap('ب^{٢}'), '\\text{ب}^{\\text{٢}}');
  assert.equal(wrap('2س'), '2\\text{س}');
});

test('two adjacent letters stay two variables; three or more join as a word', () => {
  assert.equal(wrap('أج'), '\\text{أ}\\text{ج}');
  assert.equal(wrap('كح'), '\\text{ك}\\text{ح}');
  assert.equal(wrap('٤أج'), '\\text{٤}\\text{أ}\\text{ج}');
  assert.equal(wrap('إذا'), '\\text{إذا}');
  assert.equal(wrap('إذا كان س'), '\\text{إذا} \\text{كان} \\text{س}');
  assert.equal(wrap('النسبة'), '\\text{النسبة}');
  assert.equal(wrap('نهـــا'), '\\text{نهـــا}');
});

test('lam-alef stays one token, and a haraka stays on its letter', () => {
  assert.equal(wrap('لا'), '\\text{لا}');
  assert.equal(wrap('لأ'), '\\text{لأ}');
  assert.equal(wrap('لإ'), '\\text{لإ}');
  assert.equal(wrap('لآ'), '\\text{لآ}');
  assert.equal(wrap('لَا'), '\\text{لَا}');
  assert.equal(wrap('سّ'), '\\text{سّ}');
  assert.equal(wrap('أّج'), '\\text{أّ}\\text{ج}');
  assert.equal(wrap('ل ا'), '\\text{ل} \\text{ا}');
});

test('Arabic-Indic numbers stay one run; Arabic punctuation is wrapped on its own', () => {
  assert.equal(wrap('٤٢'), '\\text{٤٢}');
  assert.equal(wrap('٣٫٥'), '\\text{٣٫٥}');
  assert.equal(wrap('١٬٠٠٠'), '\\text{١٬٠٠٠}');
  assert.equal(wrap('٪٥٠'), '\\text{٪٥٠}');
  assert.equal(wrap('٥٠٪'), '\\text{٥٠٪}');
  assert.equal(wrap('لماذا؟'), '\\text{لماذا}\\text{؟}');
  assert.equal(wrap('س،'), '\\text{س}\\text{،}');
});

test('the quadratic written without \\text matches the explicit form', () => {
  const bare = 'س = \\frac{-ب \\pm \\sqrt{ب^٢ - ٤أج}}{٢أ}';
  const explicit = '\\text{س} = \\frac{-\\text{ب} \\pm \\sqrt{\\text{ب}^\\text{٢} - \\text{٤}\\text{أ}\\text{ج}}}{\\text{٢}\\text{أ}}';
  assert.equal(wrap(bare), explicit);
});

test('existing \\text and other text commands are not wrapped again', () => {
  assert.equal(wrap('\\text{س}^2'), '\\text{س}^2');
  assert.equal(wrap('\\text{كح}'), '\\text{كح}');
  assert.equal(wrap('\\text {س}'), '\\text {س}');
  assert.equal(wrap('\\frac{\\text{س}}{2}'), '\\frac{\\text{س}}{2}');
  assert.equal(wrap('\\textbf{إذا}'), '\\textbf{إذا}');
  assert.equal(wrap('\\hbox{كح}'), '\\hbox{كح}');
  assert.equal(wrap('\\text{س} + ص'), '\\text{س} + \\text{ص}');
  assert.equal(wrap('\\sqrt{س^٢}'), '\\sqrt{\\text{س}^\\text{٢}}');
});

test('Latin, commands and comments are left alone, and wrapping is idempotent', () => {
  assert.equal(wrap('x^2'), 'x^2');
  assert.equal(wrap('a+b'), 'a+b');
  assert.equal(wrap('\\sin \\text{س}'), '\\sin \\text{س}');
  assert.equal(wrap('% س^2\nص'), '% س^2\n\\text{ص}');
  assert.equal(wrap('\\%س'), '\\%\\text{س}');
  const once = wrap('س^2 + إذا');
  assert.equal(wrap(once), once);
});
