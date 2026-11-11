# AGENTS.md — latex-hw handoff

Read this file before changing anything. It lists what the owner (Othman) decided, how the code is laid
out, how to run and check it, and what is left to do. `README.md` is the user-facing doc; this file is
for agents and maintainers. The original design page ("LaTeX Handwriting Library — Requirements &
Design") is mirrored in the sections below; the code is the source of truth where they differ.

## 1. Purpose

One portable JavaScript library: **LaTeX math in, a static SVG of ordered handwriting pen strokes out**,
in English (left to right) or Arabic (right to left). Every glyph, fraction bar, radical and stretchy
delimiter becomes pen strokes, one `<path>` per stroke, in the order a person writes them, plus the
same strokes as JSON. The caller animates them (the library never animates).

```js
import { render, layout } from 'latex-hw/node';         // browser: createBrowserRenderer() from 'latex-hw/browser'
const { svg, strokes, warnings, width, height, baseline, totalDuration } = await render(latex, { dir: 'rtl' });
```

It reuses, rather than rewrites: **MathJax 3.2.2** (layout), the owner's **latex-svg** mirroring project
(`rtl.js`, `convert.js`, `dictionary.md`), **Tegaki** stroke bundles (format + generator), **Caveat Math**
(Caveat + hand-drawn math symbols + Greek, made for this project) and **Amiri** (Tegaki bundle), and
**harfbuzzjs** for Arabic shaping.

## 2. Owner decisions (do not change without asking)

| Topic | Decision |
|---|---|
| Runtime | Browser **and** Node (>= 20; CI runs 20, 22, 24), same code, ESM |
| Output | Static SVG of ordered stroke paths + JSON; **no animation in the library** ("I animate them myself") |
| API | `render(latex, { dir, display, scale, … })` → `{ svg, strokes, warnings }`; **direction is an input** |
| Determinism | "Same input always gives identical strokes" — byte-identical SVG, and browser == Node bytes |
| Fonts | **Two fonts only**: Amiri for Arabic, Caveat Math for Latin, Greek, digits 0–9 and all math symbols |
| Arabic input | `\text{س}` works. Bare Arabic is wrapped (`autoWrapArabic`, default on): one letter is a variable (`س^2` → `\text{س}^2`); two adjacent letters stay two variables (`أج` → `\text{أ}\text{ج}`, so write `\text{كح}` for a two-letter name); three or more letters are one word. `لا` stays one ligature |
| Digits | **Kept exactly as written**: 0–9 drawn with Caveat Math, ٠–٩ with Amiri; never converted |
| Scope | School math first (fractions, roots, scripts, ∑ ∫ lim, brackets, matrices, cases, arrows) |
| Mixing | One script per `\text{}`; no Arabic+Latin mixing inside one `\text{}` (warns `mixed-script-text`) |
| Arrows in rtl | Horizontal arrows are mirrored (→ points left), including `\vec`, `\xrightarrow` |
| Operator words | `\sin \cos \log \lim …` → جا جتا لو نهـــا … (from `dictionary.md`), drawn as **one joined word** |
| Relations in rtl | `< > ≤ ≥ ⊂ ∈ ⊢ …` **mirrored by default** ("yes do the right enhancements"); `mirrorRelations:false` restores latex-svg |
| Repo | New repo `latex-hw`; local commits only unless the owner asks to push |

Pending confirmation from the owner: ∠ ∡ ∟, ∕ ∖ and ∝ ≃ ∼ are **not** mirrored in rtl (agent's judgement).

## 3. Architecture and pipeline

```
latex ─► preprocess ─► MathJax TeX→SVG ─► flatten ─► rtl mirror (G) ─► strokes ─► writing order ─► emit SVG+JSON
         dictionary     liteAdaptor,       affine     keep / partner    Caveat,     order.js          svg.js
         (rtl)          harfbuzz widths    matrices   glyph policy      Amiri, synth
```

| Stage | File | What it does |
|---|---|---|
| entry | `src/index.js` | `createRenderer({ fonts, fontData, dictionary })` → `{ render, layout }`; DEFAULTS; TeX errors → drawn message + `tex-error` warning |
| Node / browser loaders | `src/node.js`, `src/browser.js` | load `fonts/` from disk / via `fetch` of static `new URL('../fonts/…file', import.meta.url)` (Vite emits those; a passed `base` is still a fonts/ directory). `src/bundler-assets.js` fixes Vite ≤7 prebundle URLs that would otherwise hit index.html. The `browser` export condition serves `dist/latex-hw.browser.js` so a bundler does not load MathJax's CommonJS as raw ESM |
| preprocess | `src/autowrap.js`, `src/dictionary.js`, `dictionary.md` | bare Arabic → `\text{}` (`autoWrapArabic`); rtl operator translation: `\mathop{\text{جا}}\nolimits`; limit words (lim, max, min…) keep limits |
| layout | `src/mathjax.js`, `src/metrics.js` | MathJax 3.2.2 (AllPackages minus noerrors/noundefined), TeX reset per call, `keepPhrasesTogether` patch (Arabic `\text{}` = one run), text widths from harfbuzzjs via `setTextMeasurer`. Text-size char advances, heights and depths are Caveat's (`latinScale` scales them); large-op and stretchy size variants stay TeX |
| flatten | `src/flatten.js` | SVG tree → nodes (`mml`, chain) and leaves (glyph `<use>`, rule `<rect>`, text) with absolute matrices, nested `<svg>` viewports |
| rtl policy | `src/mirror-set.js` | `keepMirroredCharacters`, `rtlStrokeDirection`, `relationPairs`, `mirroredRelations`, `rtlGlyphPolicy()` |
| strokes | `src/strokes.js` | `glyphUnit` (Caveat strokes from the glyph origin when the advance is Caveat's; size variants still fitted to the TeX box), `textUnit` (Amiri words), `ruleUnit`, `radicalUnit`, `stretchyUnit` + `synthShape`, outline fallback |
| Arabic shaping | `src/arabic.js` | harfbuzzjs on the subset Amiri font whose glyph ids match `glyphDataById`; minimal bidi (digit runs LTR) |
| chars | `src/chars.js` | math-alphanumeric → plain char, stretchy classification, piece ranges, aliases (U+20D7 → →) |
| order | `src/order.js` | writing-order rules (§4) |
| element list | `src/elements.js` | `layout()` output: glyph / text-run / rule / stretchy with final boxes and matrices |
| emit | `src/svg.js` | px conversion, margin, timing, 2-decimal numbers, `data-*` attributes |
| geometry | `src/geom.js` | affine math, path parsing/flattening, Catmull-Rom smoothing |
| types | `src/index.d.ts`, `node.d.ts`, `browser.d.ts` | public API types — keep in sync with the code |
| legacy | `src/legacy/` | latex-svg converter (SVG-transform output) kept for comparison; only `text-measure.js` was rewritten (harfbuzzjs) |
| CLI | `bin/latex-hw.js` | `--dir -o -j --layout -f -i -s --scale --color --no-mirror-relations --no-translate --no-auto-wrap` |

Coordinates inside the pipeline: MathJax root units (1000 per em, y down). Caveat/Amiri bundle points are
font units, baseline origin, y down. In rtl, `G(x) = 2·vb.x + vb.w − x` mirrors the whole layout.

Output SVG: root `data-dir data-baseline data-stroke-count data-total-duration`; each
`<path class="hw-stroke">` has `d stroke-width pathLength data-i data-start data-dur data-len data-source
data-char data-font data-glyph data-mirrored data-node data-priority` (absent attributes are omitted).
`data-source` ∈ glyph | rule | radical | delimiter | arrow | dots | fallback. Timing: Tegaki `d`/`a` for
glyph strokes, 2600 units/s for synthesized strokes, `unitPause` 0.12 s between units.

## 4. Writing-order rules (`src/order.js`)

- Default: reading sort of child groups by box — ltr by `x0` ascending, rtl by `x1` descending (ties keep DOM order).
- `mfrac`: numerator → bar → denominator.
- `msqrt` / `mroot`: radical sign + bar (**one stroke**) → index → radicand.
- `msubsup`: base → superscript → subscript. `msup`/`msub`/`munder`/`mover`/`munderover`: DOM order (base first).
- `mtable`: rows top to bottom; `mtr`: reading sort (so rtl cells go right to left).
- A row containing an `mtable` (matrices, `cases`): fence delimiters first, then the cells.
- Inside a glyph: the bundle's stroke order. Arabic words: logical order, letter **bodies first, then the
  mark tiers** (dots/hamza, Tegaki `r = -1`), word by word. For أ إ آ ؤ ئ the short hamza strokes are moved to
  the mark tier (`HAMZA_CARRIERS` in `strokes.js`) because Amiri's data draws hamza first.
- Tests enforce these (`test/render.test.js`).

## 5. RTL rules

1. Mirror the whole layout with `G`. Every Latin glyph is then **pre-flipped around its own ink centre**
   so it reads normally — unless `rtlGlyphPolicy(code)` says otherwise:
   - `keepMirroredCharacters` (latex-svg list + horizontal arrows + `\vec` combining arrows + U+23B7):
     stays mirrored (√ ∫ ∑, brackets and their pieces, floor/ceil, ⟨⟩, bars, braces, arrows).
   - `rtlStrokeDirection` (= − - + ± ∓ × ÷ ≡ ⋅ · ≈): shape unchanged (symmetric) but strokes run right to left.
   - `mirroredRelations` (Bidi_Mirrored relation pairs, `relationPairs`), when `mirrorRelations` (default
     true): if **both** the char and its partner have Caveat strokes, draw the **partner glyph upright**
     (`<` drawn as `>`; `data-char="<"`, `data-glyph=">"`, `data-mirrored="true"`), so stroke order,
     direction and Caveat's slant stay natural. Otherwise (⊨ ⊩, or no Caveat data) reflect the glyph.
2. Arabic text runs are **not** flipped: shaped RTL by harfbuzzjs (digit runs and their separators
   shaped LTR inside), placed in the mirrored box.
3. Synthesized strokes (rules, radicals, delimiters, arrows) are built in the LTR frame and mirrored by `G`
   — a mirrored radical starts at its tick on the right.
4. Operator dictionary (`dictionary.md`, embedded as `DEFAULT_DICTIONARY` in `src/dictionary.js` — keep
   both in sync): `sin→جا cos→جتا tan→ظا cot→ظتا sec→قا csc→قتا log→لو ln→لوط lim→نهـــا …`. Non-limit
   words get `\nolimits` so `\sin^2` puts ٢ beside جا; `translateOperators:false` / `--no-translate` disables.
5. Inside Arabic `\text{}`, a math symbol Amiri lacks (≠ ∞ …) is drawn with Caveat Math strokes in its slot.
6. Bare Arabic is wrapped before that dictionary (`autoWrapArabic`, default on; `--no-auto-wrap` leaves the old
   isolated letters). A single letter stays a variable, two adjacent letters stay two variables, three or more
   join as a word, and `لا`/`لأ`/`لإ`/`لآ` stay one ligature. Arabic-Indic digits are wrapped as one number;
   Western digits stay Caveat. Text already inside `\text{}`, `\textbf`, `\hbox` and the other text commands
   is not wrapped again.

## 6. Determinism and parity (non-negotiable)

- Same input + options ⇒ byte-identical SVG. No `Math.random`, `Date`, locale, Map/Set iteration over
  unordered input, or environment-dependent formatting in the output path. Numbers are fixed to 2 decimals.
- Browser output must be **byte-identical** to Node output. Check with `scripts/parity.sh` (below).
- Fonts are data passed into `createRenderer`; the core never touches the filesystem or network.

## 7. Commands (all verified on Node 24, Nov 2026)

```sh
npm install
npm test                       # node --test test/*.test.js — 28 tests, must all pass
npm run smoke -- --strict      # CI form: exits 1 on any error or warning
npm run smoke                  # 176 rtl expressions from samples/*.txt → examples/smoke-report.json; must be 0 errors, 0 warnings
npm run examples               # all targets in scripts/examples.js → examples/*.svg|json|png|order.png (+ index.json)
node scripts/examples.js rtl-relations   # just one target
npm run build:browser          # dist/latex-hw.browser.js + dist/harfbuzz.wasm + dist/fonts/ (dist/ is gitignored)
npm run demo                   # http://localhost:8787/demo/ (PORT env to change)
npm run parity                 # after build:browser: starts the demo server, runs parity.sh rtl + ltr, stops it (what CI runs)
./scripts/parity.sh            # needs build:browser + demo running + google-chrome; default = rtl quadratic
./scripts/parity.sh '\sqrt{\frac{a}{b}}' ltr
node bin/latex-hw.js '\text{س} < \text{٥}' --dir rtl -o out.svg -j out.json
python3 scripts/raster.py final|order in.svg out.png [--scale 2]     # needs python3 + cairosvg
python3 scripts/raster.py anim  in.svg out.gif|out.mp4 [--fps 15] [--scale 1.2]   # + ffmpeg
```

Examples are regenerated by `npm run examples` (PNGs need cairosvg). GIF/MP4 are made separately:
`rtl-quadratic`, `rtl-relations`, `rtl-discriminant` (gif `--fps 15 --scale 1.2`, mp4 `--fps 30 --scale 2`).

## 8. Fonts and how to rebuild them

Everything needed is in the repo (`/workspace/caveat-math` on the original box is **not** required).

### Caveat Math (`fonts/caveat-math/`, source in `tools/caveat-math/`)
- `tools/caveat-math/build.py` draws every added glyph as single-line pen centrelines (natural order and
  direction), adds wobble (seeded, deterministic) and Caveat's 0.10 lean, inks them with Skia's stroker
  (round pen 62 units = Caveat's stem; 46 for super/subscripts; capitals Greek +0.09 shear), and writes the
  TTF plus `caveat-math.strokes.json` (the Tegaki stroke-order reference for the drawn glyphs; `letter_refs.json`
  adds refs for copied Latin-looking letters). Source font: `tools/caveat-math/Caveat-GF-Regular.ttf` (OFL).
  It skips any code point Caveat already has, so **existing glyphs never change**.
- Rebuild + install: `TEGAKI_DIR=/path/to/tegaki tools/caveat-math/rebuild.sh` (Tegaki: `git clone
  https://github.com/gkurt/tegaki && bun install`; python3 with fontTools, skia-pathops, numpy, Pillow).
  It runs `generate --font-file … -c true -p geometry --reference-file …` and copies `glyphData.json`,
  the TTF and the strokes JSON into `fonts/caveat-math/`. `--no-install` leaves output in `tools/caveat-math/out/`.
  Verified 2026-11-10: `--no-install` rebuilds of both Caveat Math and Amiri produce glyph JSON byte-identical to the committed `fonts/` files (Tegaki generation is deterministic), so `cmp` against `fonts/` is a valid regression check.
- Check: `python3 tools/caveat-math/ordersheet.py fonts/caveat-math "αβγ" /tmp/sheet` (numbered order sheet),
  Tegaki `stroke-order-report` / `coverage-report` (see `tools/caveat-math/CAVEAT-MATH.md`, reports in
  `tools/caveat-math/reports/`). Current: 174 added glyphs (122 symbols + 52 Greek), 924 bundle glyphs.
- To add a glyph: write a `@G(0xCODE)` spec in `build.py` (pen strokes in writing order), rebuild, look at the
  order sheet, confirm the extracted stroke count equals the drawn count, then run tests + smoke + examples.

### Amiri (`fonts/amiri/`, script in `tools/amiri/`)
- `amiri-8c2d3b63.ttf` = Tegaki's subset font; `glyphDataById.json` ids refer to **this** file. `Amiri-Regular.ttf`
  = full font (fallback outlines/advances). `chars.txt` = Tegaki's 142 Arabic-set chars + ؤ ، ؛ ؟ ٪ ٫ ٬ ـ.
- Rebuild: `TEGAKI_DIR=/path/to/tegaki tools/amiri/rebuild.sh`. If `chars.txt` changes, the subset hash in the
  file name changes: update `src/node.js`, `src/browser.js`, `src/legacy/text-measure.js` (and `bundle.ts`).
- Arabic letters' strokes are identical to Tegaki's shipped Amiri bundle; new punctuation has no Tegaki
  stroke-order dataset (heuristic order, checked by eye: `fonts/amiri/reports/new-chars-stroke-order.png`).

## 9. QA checklist (before every commit that touches output)

1. `npm test` — all pass.
2. `npm run smoke` — 0 errors **and 0 warnings** (176 clean). A new warning is a regression unless explained.
3. `npm run examples`, then **look at the PNGs yourself** (`examples/*.png` and `*.order.png`): rtl reads right
   to left, numerator→bar→denominator, √ before radicand, Arabic bodies before dots, relations point the right
   way, nothing overlaps, no ugly hooks on tall delimiters. Iterate until it looks right.
4. Determinism: render twice, compare bytes (the test does this). If browser-visible code changed:
   `npm run build:browser`, `npm run demo`, `./scripts/parity.sh` (rtl and ltr).
5. If fonts changed: order sheets + Tegaki reports; confirm existing glyphs are unchanged.
6. Update README.md / this file / types when behaviour or options change.

## 10. Conventions

- `src/legacy/` is the owner's latex-svg code, ported almost verbatim; don't modify it casually (only for
  compatibility, e.g. the font file name). New behaviour goes in `src/`.
- Ported logic from latex-svg (`keepMirroredCharacters`, dictionary, `keepPhrasesTogether`) keeps its
  semantics; additions are marked as latex-hw additions in comments.
- Plain ESM JavaScript + hand-written `.d.ts`; no build step for Node. Keep dependencies minimal
  (`mathjax-full` pinned 3.2.2, `harfbuzzjs` 1.6.2; `esbuild` dev only).
- Warnings, not silence: anything not drawn by hand must produce a warning (`fallback-glyph`,
  `missing-glyph`, `stretchy-fallback`, `mixed-script-text`, `tex-error`, `no-arabic-font`).
- Commits: local, small, imperative summary prefixed by area or phase, e.g. `Arabic: draw hamza after the
  letter body`, `Phase 2 start: …`. Regenerated examples go in the same commit as the change that caused them.
  Don't push unless the owner asks.
- Scratch work goes in `scratch/` (gitignored), font build output in `tools/*/out/` (gitignored).
- CI and releases: `.github/workflows/ci.yml` (push/PR to master, Node 20/22/24: test, smoke --strict,
  examples byte check, build:browser, parity, npm pack + artifacts) and `release.yml` (tag `vX.Y.Z` that
  matches `package.json`: same checks, GitHub Release with the .tgz and browser zip, `npm publish
  --provenance` only when the `NPM_TOKEN` secret exists). The package name is `latex-hw` (free on npm as of
  2026-11-11). Keep the `files` whitelist in `package.json` and `THIRD_PARTY_NOTICES.md` current when you
  add a dependency, font or shipped folder. Lint edited workflows with actionlint (https://github.com/rhysd/actionlint, with shellcheck installed).

## 11. Backlog (prioritized)

1. **Slanted `|` for `\mid`**: Caveat's `|` leans strongly and can read as `/`; draw a near-vertical bar for
   `\mid`, `|x|`, `\vert` (synthesized or a new upright glyph in Caveat Math).
2. **Cramped ≠ (and other math symbols) inside Arabic `\text{}`**: they sit in Amiri's .notdef slot (364 units);
   measure with Caveat's advance instead (must stay consistent between `setTextMeasurer` and `textUnit`).
3. **ℵ ℘ ∎ (and ᵢ ₓ ⊦ ≺ ≻)**: add to Caveat Math via `tools/caveat-math/build.py`; they use the outline fallback now.
4. **∠ ∖ ∝ in rtl**: unmirrored pending the owner's confirmation — if confirmed, add to `RELATION_PAIRS`/policy.
5. Remaining roadmap:
   - Phase 2 rest: Arabic size/width balance vs Caveat (`arabicScale`), letter-like symbols, Tegaki drawn order for ∘ ∷ ⋆.
   - Phase 3 broad MathJax: math alphabets (bold, calligraphic, fraktur, script, sans, mono), `\big…\Bigg`,
     `\overset/\underset/\stackrel`, `\cancel`, `\boxed`, `\phantom`, `aligned/array` + `\hline`, matrix variants,
     `align` with tags, amscd, accents (`\widehat` size variants fall back today), `\color`, `\newcommand`, mhchem, siunitx;
     double-struck letters readable below 60 px; pen-width variation on the added symbols.
   - Phase 4 rest: MathJax font parameters (axis height, mu skips, fraction clearance, script scale) are still
     the TeX font's. Glyph advances, heights and depths are Caveat's.


6. **Subset the browser bundle** (~1.8 MB minified JS + ~2 MB font JSON): ship only the math charset of
   Caveat Math, lazy-load Amiri for rtl only.

## 12. Status (Nov 11, 2026)

Phase 0, Phase 1 and the first Phase 2 items are done: Greek (Caveat Math 1.1), Arabic punctuation and
tatweel in the Amiri bundle, rtl relations mirrored with partner glyphs, natural tall radicals and delimiters.
Bare Arabic is auto-wrapped (`autoWrapArabic`): `س^2` is a variable, `إذا` joins, `أج` stays أ × ج.
Phase 4 spacing: text-size glyphs use Caveat's advance, height and depth (`src/metrics.js`), drawn from
Caveat's origin. `latinScale` (default 1.2) scales the em and the strokes together. Large operators, stretched
delimiters and wide accents keep their TeX boxes. MathJax 4 was not adopted: it still lays out from compiled
font data rather than a TTF MATH table, and its SVG output would have to be re-flattened. Smoke: 176/176
clean. 24 example targets in `examples/`.
