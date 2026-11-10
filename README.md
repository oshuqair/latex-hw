# latex-hw

LaTeX math in, handwriting out. `latex-hw` lays out an expression with MathJax 3,
optionally mirrors it for Arabic right-to-left math, and replaces every glyph,
rule and stretchy delimiter with pen strokes. The result is a **static SVG with
one `<path>` per pen stroke, in writing order**, plus the same strokes as JSON,
so you can animate them one by one.

- Latin letters, digits and math symbols: **Caveat Math** (Caveat + 122 math symbols), Tegaki stroke data.
- Arabic letters, Arabic-Indic digits and operator words (جا, لو, نهـــا…): **Amiri**, Tegaki stroke data, shaped with harfbuzzjs (joined forms).
- Runs in Node (>= 18) and in the browser (same code, byte-identical output; see `scripts/parity.sh`).
- Deterministic: the same input and options always give the same bytes.

Status: Phase 0 + Phase 1 vertical slice (see "Status and known gaps").

## Install and run

```sh
npm install
npm test                      # 15 tests: order rules, rtl, determinism, fallbacks, legacy path
npm run examples              # renders examples/*.svg|json|png|order.png
npm run smoke                 # all of samples/arabic-samples.txt + gpt-samples.txt in rtl
```

PNG export in `npm run examples` and the GIF/MP4 helper need `python3` with `cairosvg`
(and `ffmpeg` for animations); the library itself does not.

### CLI

```sh
node bin/latex-hw.js '\frac{a+b}{2} = \sqrt{x^2+1}' -o out.svg
node bin/latex-hw.js '\text{س} = \frac{-\text{ب} \pm \sqrt{\text{ب}^\text{٢} - \text{٤}\text{أ}\text{ج}}}{\text{٢}\text{أ}}' --dir rtl -o quad.svg -j quad.json
node bin/latex-hw.js --help
```

(`npm link` or `npx latex-hw …` exposes it as `latex-hw`.) Options: `--dir ltr|rtl`,
`-j strokes.json`, `--layout elements.json`, `-s/--font-size px`, `--scale`, `--inline`,
`--color`, `--mirror-relations`, `--no-translate`. Warnings go to stderr.

### API (Node)

```js
import { render, layout } from 'latex-hw/node';   // or './src/node.js' in this repo

const { svg, strokes, warnings, width, height, totalDuration } =
  await render('\\sqrt{x^2+1}', { dir: 'ltr', fontSize: 48 });

const elements = await layout('\\text{س}^\\text{٢}', { dir: 'rtl' }); // positioned element list
```

### API (browser / any bundler)

```js
import { createBrowserRenderer } from 'latex-hw/browser';
const r = await createBrowserRenderer('/path/to/latex-hw/fonts/');   // fetches the font data once
const { svg } = r.render('\\frac{1}{2}', { dir: 'rtl' });           // synchronous after that
```

`npm run build:browser` writes a ready ESM bundle to `dist/latex-hw.browser.js` with
`dist/harfbuzz.wasm` and `dist/fonts/` next to it. The core (`src/index.js`,
`createRenderer({ fonts, fontData })`) never touches the filesystem or network: fonts
are passed in as data.

### Options

| option | default | meaning |
|---|---|---|
| `dir` | `'ltr'` | `'rtl'` mirrors the layout (latex-svg rules) and translates operators |
| `display` | `true` | display or inline style (`$…$` / `\(...\)` select inline) |
| `fontSize` / `scale` | `48` / `1` | px per em |
| `translateOperators` | `true` | rtl: `\sin`→جا, `\log`→لو, `\lim`→نهـــا … (`dictionary.md`) |
| `mirrorRelations` | `false` | rtl: keep `< > ≤ ≥ ⊂ ∈` mirrored as Unicode bidi does (latex-svg flips them back) |
| `penScale` | `0.85` | pen width relative to Caveat's mean stroke width |
| `latinScale` / `arabicScale` | `1.2` / `1` | glyph size factors against the TeX boxes |
| `strokeWidth` | `'uniform'` | one pen for everything; `'stroke'` keeps Amiri's per-stroke mean width |
| `unitPause` | `0.12` | seconds between glyphs / rules / delimiters in the suggested timing |
| `color` | `'#000'` | stroke colour |

### Output

```xml
<svg viewBox="0 0 W H" data-dir="rtl" data-baseline=".." data-stroke-count="28" data-total-duration="13.27">
  <g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">
    <path class="hw-stroke" d="M…" stroke-width="2.43" pathLength="38.6"
          data-i="0" data-start="0" data-dur="0.42" data-len="38.6" data-source="glyph"
          data-char="س" data-font="arabic" data-glyph="27" data-node="mtext"/>
    …
```

Absolute px, y down, no transforms inside, constant width per stroke, round caps, 2-decimal
numbers. `data-source` is one of `glyph`, `rule`, `radical`, `delimiter`, `arrow`, `kashida`,
`dots`, `fallback`. `data-priority="-1"` marks Arabic dots / marks. The JSON `strokes` array
carries the same fields. Animate it yourself, for example:

```js
for (const p of svg.querySelectorAll('path.hw-stroke')) {
  const len = p.dataset.len;
  p.style.strokeDasharray = p.style.strokeDashoffset = len;
  p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
    { delay: p.dataset.start * 1000, duration: p.dataset.dur * 1000, fill: 'both' });
}
```

### Demo

```sh
npm run build:browser && npm run demo     # http://localhost:8787/demo/
```

Pick an example, load any output SVG, or type LaTeX and render it in the browser; the page
animates the strokes with `stroke-dashoffset`. The demo is the only place with animation.

## How it works

| stage | file | notes |
|---|---|---|
| preprocess | `src/mathjax.js`, `src/dictionary.js` | delimiter stripping, operator dictionary (rtl), TeX reset per call — from latex-svg `convert.js` |
| layout | `src/mathjax.js` | MathJax 3.2.2 TeX→SVG, liteAdaptor, keepPhrasesTogether patch; text measured with harfbuzzjs + Amiri instead of `hb-shape` |
| flatten | `src/flatten.js` | SVG tree → leaves with absolute matrices (nested `<svg>` viewports included) |
| rtl | `src/mirror-set.js`, `src/strokes.js`, `src/elements.js` | same rule as latex-svg `rtl.js`: mirror the layout, flip glyphs back unless in `keepMirroredCharacters` (now + horizontal arrows) |
| glyphs | `src/strokes.js` | Caveat Math strokes fitted to the MathJax glyph box; Arabic runs shaped with `src/arabic.js` → `glyphDataById` |
| geometry | `src/strokes.js` | rules → one pen line; √ + bar → one stroke; tall ( [ { | ‖ ⟨ ⌊ ⌈, braces and long arrows → synthesized fitted strokes |
| order | `src/order.js` | reading direction; numerator → bar → denominator; radical → index → radicand; base → sup → sub; matrix brackets → cells row by row |
| emit | `src/svg.js` | px conversion, suggested timing, SVG + JSON |

Arabic words: letter bodies first, then dots / hamza (Tegaki stroke `priority`), word by word.
Numbers inside Arabic text keep their left-to-right order (١٠٠).

### Choices recorded in Phase 1

- **Tatweel (ـ) in نهـــا**: the dictionary is unchanged. Amiri's Tegaki bundle has no strokes for U+0640,
  so each tatweel is drawn as a synthesized kashida stroke (right to left, at Amiri's joining height,
  `data-source="kashida"`), with Amiri's real tatweel advance. No warning, nothing dropped.
- **Operator words** (جا, لو, …) get `\nolimits`, so `\sin^2` puts the ٢ beside جا. latex-svg used a
  bare `\mathop`, which stacked the exponent above the word in display style. `\lim` keeps its limits below.
- **Symmetric operators** (= − + ± × ÷ ≡ ·) are drawn with mirrored strokes in rtl so horizontal strokes run
  right to left; their shape is unchanged.
- **Missing glyphs**: drawn from the font outline (one thin stroke per contour, dot-sized contours as one dab)
  with a `fallback-glyph` warning. Pure dot glyphs (⋯ ⋮ ⋱) are drawn as dabs with no warning.
- **TeX errors**: the error message is drawn as text and returned as a `tex-error` warning.
- **Legacy path**: `src/legacy/` is the latex-svg converter (SVG-transform output) with `hb-shape`
  replaced by harfbuzzjs + Amiri, kept for comparison (`node src/legacy/cli.js …`).

## Status and known gaps

Smoke test (`npm run smoke`, 176 rtl expressions from the two sample files): 0 errors, 148 with no
warnings; the other 28 only warn about Greek letters drawn from outlines.

- Greek letters (θ α β γ λ ρ Δ …) are not in Caveat Math yet (only μ π): outline fallback + warning. Phase 2.
- Amiri lacks ؤ ، ؛ ؟ ٪ ٫ ٬ strokes: outline / dab fallback from the full Amiri font.
- Glyphs are fitted into MathJax's Latin Modern boxes, so spacing is TeX's, not Caveat's (Phase 4: a MATH table).
- Tall radicals follow TeX's narrow surd box, so the long stroke is nearly vertical.
- Stretchy shapes without a synthesizer (e.g. `\widehat` size variants, `\overbrace` pieces other than the brace) fall back to stretched glyphs or outlines.
- `< > ≤ ≥` follow latex-svg (flipped back to LTR shape in rtl); use `mirrorRelations: true` for bidi-style mirrored relations.
- Caveat's own `n`/`m` have small entry flicks from Tegaki's extraction; they are drawn as the bundle has them.
- Bundle size: Caveat Math glyph data is 0.9 MB, Amiri 1 MB of JSON; not subset yet.

## Repository layout

```
src/            library (ESM JavaScript + .d.ts)
src/legacy/     latex-svg converter, ported (SVG transforms; for comparison)
bin/latex-hw.js CLI
fonts/          Caveat Math and Amiri: TTFs + Tegaki stroke data (OFL-1.1)
samples/        arabic-samples.txt, gpt-samples.txt, test.json (from latex-svg)
examples/       rendered targets: .svg, .json, .png, .order.png, rtl-quadratic.gif/.mp4, smoke-report.json
demo/           animation demo page
scripts/        examples, smoke test, raster/GIF helper, browser build, parity check
test/           node:test suite (+ browser parity page)
```

## Licenses

Code: MIT (see `LICENSE`). Fonts and their stroke data: SIL OFL 1.1 (`LICENSES/`).
Reused upstream code: Tegaki (MIT, Gokhan Kurt) for the stroke format and the shaping
approach; MathJax (Apache-2.0) and harfbuzzjs (MIT) as dependencies; latex-svg by its owner.
