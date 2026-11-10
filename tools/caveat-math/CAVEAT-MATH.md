# Caveat Math — Caveat + hand-drawn arithmetic & logic symbols, with a Tegaki bundle

**Font:** `Caveat Math` Regular (PostScript `CaveatMath-Regular`), 1000 UPM, round caps.
It is Caveat Regular (Google Fonts static build v23, the same file Tegaki downloads) with **174 new glyphs** added: 122 arithmetic and logic symbols, and (v1.1) 52 Greek letters
(927 mapped characters in total, up from 753). Caveat is OFL-1.1 and has **no Reserved Font Name**, so the name could
have stayed the same. I renamed it anyway so it won't collide with the real Caveat on a system. The license is in `font/OFL.txt`.

## What was added (174)

- **Arithmetic & relations** (28): ∓ ≡ ≢ ≃ ≅ ≉ ∼ ∝ ∞ ≪ ≫ ≮ ≯ ≔ ≐ ≜ ≙ ∗ ∘ ⋅ ⋆ ∣ ∤ ∥ ∦ ‖ ∠ ∡
- **Roots, big operators, calculus** (14): √ ∛ ∜ ∑ ∏ ∐ ∫ ∬ ∭ ∮ ∂ ∆ ∇ π
- **Logic** (22): ∧ ∨ ⊻ ⊼ ⊽ ⊕ ⊖ ⊗ ⊘ ⊙ ⊤ ⊥ ⊢ ⊣ ⊨ ∀ ∃ ∄ ∴ ∵ ∶ ∷
- **Arrows** (9): → ← ↔ ↑ ↓ ↦ ⇒ ⇐ ⇔
- **Sets & number sets** (23): ∈ ∉ ∊ ∋ ∌ ⊂ ⊃ ⊄ ⊅ ⊆ ⊇ ⊊ ⊋ ∪ ∩ ∅ ∖ ∁ ℕ ℤ ℚ ℝ ℂ
- **Floor / ceiling** (4): ⌊ ⌋ ⌈ ⌉
- **Super/subscripts & primes** (13): ⁺ ⁻ ⁼ ⁽ ⁾ ⁿ ₊ ₋ ₌ ₍ ₎ ₙ ‴
- **Fractions** (9): ⅐ ⅑ ⅒ ⅕ ⅖ ⅗ ⅘ ⅙ ⅚
- **Greek, v1.1** (52): lowercase α β γ δ ε ζ η θ ι κ λ ν ξ ο ρ ς σ τ υ φ χ ψ ω, the variants ϑ ϕ ϖ ϱ ϵ, capitals Γ Δ Θ Λ Ξ Π Σ Υ Φ Ψ Ω, and the Latin-looking capitals Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Χ (μ was already in Caveat, π was in the 122)

Already in Caveat, so left untouched (66): + − × ÷ = ≠ ± < > ≤ ≥ ≈ % ‰ ° ′ ″ · ∙ / ∕ ( ) [ ] { } | ¬ ½ ¼ ¾ ⅓ ⅔ ⅛ ⅜ ⅝ ⅞ - * ^ ~ ! & ⁄ µ ⁰–⁹ ₀–₉.

### How the glyphs were made
- Each symbol is written as **single-line pen strokes** (centerlines in natural pen order and direction), in `source/build.py`.
  The strokes get a small hand wobble (low-frequency normal offset, ±1.2° per-stroke rotation, ±4-unit jitter) and Caveat's
  rightward lean (shear 0.10 about the math axis). They're then inked with Skia's stroker using a **round pen 62 units wide**,
  which matches Caveat's minus bar (63 units).
- Metrics follow Caveat: math axis **y = 209** (the centre of Caveat's `−`), operator half-size 158 (Caveat's `+`),
  x-height ~400, caps/big operators ~650, brackets −130…735. Superscripts and subscripts use a 46-unit pen at Caveat's superior and inferior figure positions.
- **Each pen stroke is its own contour.** Strokes overlap, but they are never merged. Tegaki's geometry pipeline treats
  overlapping contours as independent stroke regions, so each stroke is extracted cleanly with no junction guessing.
  For example, ⊕ is drawn as a ring plus two arms that stop just inside it, because arms that touch the ring confused the ink graph.
- Where Caveat already had the right shape, its own outlines are reused: ∼ (~), ∗ (* lowered to the axis), ⋅ (·), ‖ ∥ ∦ ∣ ∤ (|),
  ≪ ≫ ≮ ≯ (< >), ≉ (≈), ‴ (′), the dots in ∴ ∵ ∶ ∷ ≔ ≐ ⊙ (.), the fractions (Caveat's superior and inferior figures plus the ½ bar),
  and ℕ ℤ ℚ ℝ ℂ (Caveat's letter plus a second, parallel pen line).
- Features (calt, frac, liga, locl …), GPOS, and every existing glyph are unchanged. The Latin Extended reports below are identical before and after.

### Greek (v1.1)
- Drawn the same way as the symbols: single-line pen strokes in `source/build.py` (section "Greek"), the same wobble, 62-unit round pen and 0.10 lean.
  Capitals get 0.09 extra shear so they lean like Caveat's own capitals.
- Lowercase sits on Caveat's metrics: x-height ~380, ascender ~650, descender ~−210; capitals are 650 high.
- Pen order follows common school handwriting: β and ρ start at the bottom of the stem and go up; θ and Θ are an oval first, then the bar;
  ϕ, Φ, ψ, Ψ draw the bowl or cup first, then the stem; λ the long stroke first; π, τ, Γ, Ξ start with the top or the stem as usual; ω, Ω are one stroke.
- `ο` and the 13 Latin-looking capitals reuse Caveat's own o, A, B, E, Z, H, I, K, M, N, O, P, T, X outlines. Their stroke-order references are the strokes
  Tegaki extracted for those Latin letters (in `source/letter_refs.json`), so they are drawn exactly like the Latin letters.
- Every existing glyph is unchanged: the 875 old outlines and advances are identical, and all 872 old entries in `glyphData.json` are byte-identical.
- Tegaki (geometry, defaults, `--reference-file`): 924 glyphs processed; every Greek letter extracted with exactly its drawn stroke count.
  stroke-order-report: dataset coverage 52/52, count agreement 52/52, applied 52/52 (6 via re-grouping), mean cost 0.038 (worst σ 0.089).
  coverage-report: mean unpainted 0.25 % (geometry), 1 glyph over 2 %. Reports in `reports/caveatmath-*-greek-ref.*`, order sheet in `screenshots/greek-stroke-order.png`.

## Files
| Path | What |
|---|---|
| `font/CaveatMath-Regular.ttf` / `.woff2` | the extended font |
| `font/caveat-math.strokes.json` | Tegaki drawn stroke-order dataset for the new symbols (`--reference-file`, or Studio → Reference → Upload) |
| `bundle/caveat-math/` | the Tegaki bundle: `bundle.ts`, `glyphData.json`, `glyphDataById.json`, the TTF, plus OFL.txt and the stroke dataset |
| `caveat-math-tegaki-bundle.zip` | zip of `bundle/caveat-math/` |
| `screenshots/` | renderer QA: (a) all new symbols finished, (b) mid-animation frames, (c) sample texts finished, (d) stroke-order sheets (numbered by order, arrow = pen direction), the static specimen, and the GIF/MP4 of the sample text |
| `reports/` | coverage-report and stroke-order-report output (txt + full JSON) |
| `source/` | font build script, stroke-order sheet, specimen script, and the headless renderer harness used for QA |

## Tegaki settings
Pipeline **geometry**, every other setting at its **default**, and the stroke-order dataset added as a reference:

```bash
git clone https://github.com/gkurt/tegaki && cd tegaki && bun install
bun start generate --font-file /abs/path/CaveatMath-Regular.ttf -c true -p geometry \
  --reference-file /abs/path/caveat-math.strokes.json -o /abs/path/out/caveat-math
```
`--font-file` is built into the CLI, so no patching was needed. With `-c true` and no `--full-font`, the whole TTF goes into the bundle (924 glyphs processed, 1141 variants).
The defaults already extract every new symbol with exactly the number of strokes it was drawn with, so no pipeline knob needed changing.
The reference file only fixes order and direction. Defaults kept: drawing speed 3000 u/s, stroke pause 0.15 s, line cap auto→round, extraction ink-graph, stroke order auto.

## Scores (before → after)
| Set | Metric | without dataset | with `--reference-file` |
|---|---|---|---|
| 122 new symbols | coverage (mean unpainted ink, geometry) | 0.17 %, 0 glyphs > 2 % | 0.17 %, 0 glyphs > 2 % |
| 122 new symbols | stroke-order: dataset coverage | 1/122 (only π matches a built-in) | **110/122** |
| 122 new symbols | count agreement / applied | 1/1 / 1/1 | **110/110 / 108/110**, mean cost 0.042 |
| Latin Extended (337) | coverage, Caveat → Caveat Math | 0.25 % → 0.25 % (identical) | |
| Latin Extended (337) | stroke-order, Caveat → Caveat Math | 229 matched, 179 applied, cost 0.092 → identical | |

The first QA pass used a stamped-brush outline, which had micro-notches. It fragmented badly: ∂ came out as 207 strokes, and the full sheet took about 1240 s to draw.
Switching to Skia's stroker brought every symbol down to its drawn stroke count, with about 74 s total for all 122. In the dataset run, ∘ (cost 0.195) and ∷ (0.150) were just over the 0.15 match threshold, so they kept Tegaki's heuristic order, which still looks natural.
12 glyphs have no dataset entry: the fractions, ‴, ∗, and ≉ are built from Caveat outlines, and Tegaki orders them itself.

## Drop into the renderer
```tsx
import { TegakiRenderer } from 'tegaki/react';
import caveatMath from './caveat-math/bundle.ts';   // the folder from the zip

<TegakiRenderer font={caveatMath} style={{ fontSize: '48px' }}>
  2 + 3 × 4 ≠ 15, ¬(p ∧ q) ⇔ ¬p ∨ ¬q, ∀x ∈ ℝ
</TegakiRenderer>
```
Vanilla: `new TegakiEngine(el, { font: caveatMath, text: '…' })` from `tegaki/core`. The bundle loads its TTF with
`import … with { type: 'url' }`. On Vite ≤7 dev, add `optimizeDeps: { exclude: ['tegaki'] }` (see tegaki.ink/guides/bundlers).
QA used the Tegaki engine from the repo (`tegaki/core`, canvas, `quality.clipText: 1.2` like the studio), rendered headless in Chrome.
In the Studio you can also **Upload font** → `CaveatMath-Regular.ttf` and Reference → Upload → `caveat-math.strokes.json`.

## Known issues
- The double-struck letters ℂ ℚ (and less so ℝ ℕ ℤ) read as a bold letter at small sizes (below ~60 px). The second line only shows clearly when larger.
- ∘ and ∷ use Tegaki's heuristic order rather than the drawn one (see above). ⋆ is drawn as 5 straight strokes.
- My symbols use a constant-width pen. Caveat's own glyphs swell slightly in places, so up close the new symbols look a little more even.
- Superscripts and subscripts follow Caveat's own superior and inferior figures, which sit high and low. ₙ therefore sits well below the baseline, like ₀–₉.
- No ᵢ ₓ ⊦ ∎ ℵ ≺ ≻ yet. Greek has no final-form or archaic letters beyond ς ϑ ϕ ϖ ϱ ϵ (no ϝ ϙ ϡ, no Ϝ, no accented Greek).
