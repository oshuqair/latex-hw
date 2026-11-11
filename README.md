# latex-hw

[![CI](https://github.com/oshuqair/latex-hw/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/oshuqair/latex-hw/actions/workflows/ci.yml)

LaTeX math in, handwriting out. `latex-hw` lays out an expression with MathJax 3,
optionally mirrors it for Arabic right-to-left math, and replaces every glyph,
rule and stretchy delimiter with pen strokes. The result is a **static SVG with
one `<path>` per pen stroke, in writing order**, plus the same strokes as JSON,
so you can animate them one by one.

- Latin and Greek letters, digits and math symbols: **Caveat Math** (Caveat + 122 math symbols + 52 Greek letters), Tegaki stroke data.
- Arabic letters, Arabic-Indic digits, Arabic punctuation (، ؛ ؟ ٪ ٫ ٬ ـ) and operator words (جا, لو, نهـــا…): **Amiri**, Tegaki stroke data, shaped with harfbuzzjs (joined forms).
- Runs in Node (>= 20) and in the browser (same code, byte-identical output; see `scripts/parity.sh`).
- Deterministic: the same input and options always give the same bytes.

Status: Phase 0 + Phase 1, plus the first Phase 2 items: Greek, Arabic punctuation, mirrored rtl relations, natural tall radicals (see "Status and known gaps").

## Install

```sh
npm install latex-hw           # once a release is published to npm (see "Releases")
```

Until then, install a release tarball from GitHub (`npm install https://github.com/oshuqair/latex-hw/releases/download/vX.Y.Z/latex-hw-X.Y.Z.tgz`)
or work from a clone. For a page without a bundler, download `latex-hw-browser-X.Y.Z.zip` from the
release: it holds `latex-hw.browser.js`, `harfbuzz.wasm` and `fonts/`; pass the URL of that `fonts/`
folder to `createBrowserRenderer`. Bundlers resolve `latex-hw/browser` to `dist/latex-hw.browser.js`
(the `browser` export) and that bundle finds the package's `fonts/` by itself. Node resolves the same
entry to `src/browser.js`.

## Run from a clone

```sh
npm ci
npm test                      # order rules, rtl, relations, Greek, Arabic punctuation, auto-wrap, determinism, fallbacks, legacy path
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
`--color`, `--no-mirror-relations`, `--no-translate`, `--no-auto-wrap`. Warnings go to stderr.

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
const r = await createBrowserRenderer();                             // fonts shipped with the package
// or createBrowserRenderer(new URL('./fonts/', import.meta.url).href) to fetch another fonts/ folder
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
| `autoWrapArabic` | `true` | bare Arabic → `\text{}`: one letter is a variable (`س^2`), two adjacent letters stay two variables (`أج`; write `\text{كح}` for a two-letter name), three or more join as a word. `لا` stays one ligature. `--no-auto-wrap` turns it off |
| `mirrorRelations` | `true` | rtl: draw `< > ≤ ≥ ≪ ≫ ⊂ ⊃ ⊆ ⊇ ∈ ∋ ∉ ⊢ ⊣ …` mirrored, as Unicode bidi does; `false` = latex-svg (LTR shapes) |
| `penScale` | `0.85` | pen width relative to Caveat's mean stroke width |
| `latinScale` / `arabicScale` | `1.2` / `1` | Caveat em relative to MathJax's em (advances and strokes); Amiri size factor |
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
numbers. `data-source` is one of `glyph`, `rule`, `radical`, `delimiter`, `arrow`,
`dots`, `fallback`. For a mirrored rtl relation drawn as its partner, `data-char` is the TeX
character (`<`) and `data-glyph` the one drawn (`>`). `data-priority="-1"` marks Arabic dots / marks. The JSON `strokes` array
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
| preprocess | `src/mathjax.js`, `src/autowrap.js`, `src/dictionary.js` | delimiter stripping, bare Arabic → `\text{}`, operator dictionary (rtl), TeX reset per call — from latex-svg `convert.js` |
| layout | `src/mathjax.js`, `src/metrics.js` | MathJax 3.2.2 TeX→SVG, liteAdaptor, keepPhrasesTogether patch; text measured with harfbuzzjs + Amiri. Text-size advances and heights are Caveat's (`latinScale`) |
| flatten | `src/flatten.js` | SVG tree → leaves with absolute matrices (nested `<svg>` viewports included) |
| rtl | `src/mirror-set.js`, `src/strokes.js`, `src/elements.js` | same rule as latex-svg `rtl.js`: mirror the layout, flip glyphs back unless in `keepMirroredCharacters` (now + horizontal arrows); Bidi_Mirrored relations drawn as their mirror partner (`rtlGlyphPolicy`) |
| glyphs | `src/strokes.js` | Caveat Math strokes drawn from the glyph's own origin (size variants still fitted to the TeX box); Arabic runs shaped with `src/arabic.js` → `glyphDataById` |
| geometry | `src/strokes.js` | rules → one pen line; √ + bar → one stroke; tall ( [ { | ‖ ⟨ ⌊ ⌈, braces and long arrows → synthesized fitted strokes |
| order | `src/order.js` | reading direction; numerator → bar → denominator; radical → index → radicand; base → sup → sub; matrix brackets → cells row by row |
| emit | `src/svg.js` | px conversion, suggested timing, SVG + JSON |

Arabic words: letter bodies first, then dots / hamza (Tegaki stroke `priority`), word by word.
Numbers inside Arabic text keep their left-to-right order (١٠٠).

### Choices recorded

- **Relations in rtl (default since 0.2)**: `< > ≤ ≥ ≦ ≧ ≪ ≫ ≮ ≯ ≰ ≱ ≺ ≻ ⊂ ⊃ ⊆ ⊇ ⊄ ⊅ ⊊ ⊋ ⊏ ⊐ ∈ ∋ ∉ ∌ ⊢ ⊣ ⊲ ⊳ …`
  (Unicode Bidi_Mirrored relations) are mirrored, so `\text{س} < \text{٥}` has its point toward س, as in
  Arabic school books and Unicode bidi text. When the mirror partner is in Caveat Math (< → >, ≤ → ≥, ⊂ → ⊃,
  ∈ → ∋, ∉ → ∌, ⊢ → ⊣ …), the partner glyph is drawn upright, so the strokes keep their own natural order,
  direction and Caveat's slant. Relations without a partner glyph (⊨ ⊩ …) are reflected. Not mirrored, by
  choice: ∠ ∡ ∟ (shapes), ∕ ∖ (slashes), ∝ ≃ ∼. `mirrorRelations: false` / `--no-mirror-relations` restores
  the latex-svg behaviour.
- **Greek** comes from Caveat Math 1.1 (hand-drawn α–ω, ϑ ϕ ϖ ϱ ϵ ς, Γ Δ Θ Λ Ξ Π Σ Υ Φ Ψ Ω and the Latin-looking
  capitals), so no Greek letter falls back any more.
- **Amiri bundle** regenerated with Tegaki from the full Amiri font (geometry pipeline, defaults) for the old
  142 characters plus ؤ ، ؛ ؟ ٪ ٫ ٬ ـ (`fonts/amiri/chars.txt`, reports in `fonts/amiri/reports/`). Every Arabic
  glyph's strokes are identical to the previous bundle; only some Latin letters (not used here) changed.
- **Tatweel (ـ) in نهـــا**: now drawn from the bundle (Amiri even joins ـــا into one long kashida glyph). The
  synthesized kashida stroke is gone.
- **Hamza**: for أ إ آ ؤ ئ the letter body is drawn first and the hamza after (Amiri's data has hamza first).
- **Bare Arabic is wrapped** (`autoWrapArabic`, default on). `س^2` becomes `\text{س}^2`, so the superscript sits on the Amiri letter. A word of three or more letters joins (`إذا`); two adjacent letters stay separate variables (`٤أج` is ٤ × أ × ج). `لا` / `لأ` / `لإ` / `لآ` stay one ligature. A two-letter name is still written `\text{كح}`. Arabic-Indic digits are wrapped (`٣٫٥`); Western digits stay Caveat. `--no-auto-wrap` leaves the old isolated letters.
- **Arabic `\text{}` is one shaped run** even when it contains `=`, `≠`, `%`, digits or punctuation, so letters
  join and numbers keep their order. A math symbol Amiri lacks (≠ ≤ ∞ …) inside Arabic text is drawn with
  Caveat Math's strokes in its slot.
- **Radicals**: a short tick, a steep down-stroke and a long up-stroke whose slant grows with the content height.
  For tall content the sign may reach left (rtl: right) of TeX's narrow surd box, by up to half its width.
- **Tall delimiters**: Caveat's ( [ { size variants keep their TeX box width (they grow longer, not fatter);
  synthesized parens are one long arc with a bow that grows with the height.
- **Operator words** (جا, لو, …) get `\nolimits`, so `\sin^2` puts the ٢ beside جا. `\lim` keeps its limits below.
- **Symmetric operators** (= − + ± × ÷ ≡ ·) are drawn with mirrored strokes in rtl so horizontal strokes run
  right to left; their shape is unchanged.
- **Missing glyphs**: drawn from the font outline (one thin stroke per contour, dot-sized contours as one dab)
  with a `fallback-glyph` warning (e.g. `\aleph`). Pure dot glyphs (⋯ ⋮ ⋱) are drawn as dabs with no warning.
- **TeX errors**: the error message is drawn as text and returned as a `tex-error` warning.
- **Legacy path**: `src/legacy/` is the latex-svg converter (SVG-transform output) with `hb-shape`
  replaced by harfbuzzjs + Amiri, kept for comparison (`node src/legacy/cli.js …`).

## Status and known gaps

Smoke test (`npm run smoke`, 176 rtl expressions from the two sample files): **176 clean** — 0 errors,
0 warnings.

- Text-size spacing follows Caveat's advances (scaled by `latinScale`). MathJax's mu skips, axis height and fraction clearance are still the TeX font's. Large operators and stretched delimiters keep TeX's boxes.
- A math symbol inside Arabic `\text{}` that Amiri lacks sits in Amiri's .notdef slot, so it can look tight.
- Characters in neither font (ℵ ℘ ∎ …) still use the outline fallback with a warning.
- Stretchy shapes without a synthesizer (e.g. `\widehat` size variants, `\overbrace` pieces other than the brace) fall back to stretched glyphs or outlines.
- Caveat's own `|` leans strongly, so `\mid` can read like a slash.
- Caveat's own `n`/`m` have small entry flicks from Tegaki's extraction; they are drawn as the bundle has them.
- Bundle size: Caveat Math glyph data is 0.95 MB, Amiri 1 MB of JSON; not subset yet.

## Repository layout

```
src/            library (ESM JavaScript + .d.ts)
src/legacy/     latex-svg converter, ported (SVG transforms; for comparison)
bin/latex-hw.js CLI
fonts/          Caveat Math and Amiri: TTFs + Tegaki stroke data (OFL-1.1)
samples/        arabic-samples.txt, gpt-samples.txt, test.json (from latex-svg)
examples/       rendered targets: .svg, .json, .png, .order.png, GIF/MP4 of rtl-quadratic, rtl-relations, rtl-discriminant, smoke-report.json
demo/           animation demo page
scripts/        examples, smoke test, raster/GIF helper, browser build, parity check
test/           node:test suite (+ browser parity page)
tools/          Caveat Math and Amiri font/stroke rebuild scripts (see AGENTS.md)
.github/        CI and release workflows
```

## Releases

CI (`.github/workflows/ci.yml`) runs on every push and pull request to `master`, on Node 20, 22 and 24:
`npm test`, `npm run smoke -- --strict`, the examples determinism check, `npm run build:browser`,
the headless-Chrome browser/Node parity check (`npm run parity`), and `npm pack`. The package
tarball, the `dist/` bundle and `examples/` are kept as run artifacts.

To ship a version:

1. Bump `version` in `package.json` (`npm version 0.3.0 --no-git-tag-version`), commit, push to `master`.
2. Tag it with the same version and push the tag:
   ```sh
   git tag v0.3.0 && git push origin v0.3.0
   ```
3. `.github/workflows/release.yml` reruns all CI checks, fails if the tag is not `v` + the
   `package.json` version, runs `npm pack` (its `prepack` builds `dist/`) and creates a GitHub
   Release with auto-generated notes and these assets: `latex-hw-X.Y.Z.tgz`,
   `latex-hw-browser-X.Y.Z.zip` and `latex-hw.browser.js`.
4. npm: add an npm automation (or granular publish) token as the repository secret **`NPM_TOKEN`**
   (Settings → Secrets and variables → Actions). With it the release job runs
   `npm publish --provenance --access public`; without it the job skips npm and leaves a notice.

The npm package holds `src/`, `bin/`, `fonts/` (without build reports), `dist/latex-hw.browser.js`,
`dist/harfbuzz.wasm`, `dictionary.md` and the license files: about 1.8 MB packed, 5.4 MB unpacked
(`npm pack --dry-run` lists it). `dist/` is not in git; CI and `prepack` build it.

## Licenses

- **Code** (`src/`, `bin/`, `scripts/`, `demo/`, `test/`, `tools/`): MIT, Copyright (c) 2026 Othman Shuqair (`LICENSE`).
  This includes the ported latex-svg code (same author).
- **Fonts and their stroke data** (`fonts/caveat-math/`, `fonts/amiri/`, `tools/caveat-math/Caveat-GF-Regular.ttf`):
  SIL Open Font License 1.1, **not** MIT. Caveat Math is a modified Caveat (Copyright 2014 The Caveat
  Project Authors); Amiri is Copyright 2010-2022 The Amiri Project Authors. Texts: `LICENSES/OFL-*.txt`
  and `fonts/*/OFL.txt`. The OFL lets the fonts ship inside this package (with their license, never
  sold on their own). SVGs and PNGs that latex-hw renders are documents, and the OFL does not cover them.
  So the package's SPDX license is `MIT AND OFL-1.1`.
- **Third-party code**: MathJax and mhchemparser (Apache-2.0) and harfbuzzjs (MIT) are npm dependencies,
  bundled into `dist/latex-hw.browser.js`. The Tegaki generator (MIT, Gokhan Kurt) produced the stroke
  data, and the shaping approach follows it. See `THIRD_PARTY_NOTICES.md`.
