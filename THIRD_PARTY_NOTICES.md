# Third-party notices

latex-hw's own code is MIT (`LICENSE`, Copyright (c) 2026 Othman Shuqair). This file lists
everything in the repository, the npm package or the release assets that comes from elsewhere,
with its license. Full license texts are in `LICENSES/`.

| Component | Where it appears | License | Text |
|---|---|---|---|
| Caveat (Copyright 2014 The Caveat Project Authors) and Caveat Math, the derived font with the added math symbols and Greek letters | `fonts/caveat-math/` (TTF and Tegaki stroke data), `tools/caveat-math/Caveat-GF-Regular.ttf` (build source, repo only) | SIL OFL 1.1 | `LICENSES/OFL-Caveat-Math.txt`, `fonts/caveat-math/OFL.txt` |
| Amiri (Copyright 2010-2022 The Amiri Project Authors) | `fonts/amiri/` (full TTF, the subset `amiri-8c2d3b63.ttf`, Tegaki stroke data) | SIL OFL 1.1 | `LICENSES/OFL-Amiri.txt`, `fonts/amiri/OFL.txt` |
| Tegaki (Copyright (c) 2026 Gokhan Kurt), https://github.com/gkurt/tegaki | Not vendored. Its generator produced the stroke bundles in `fonts/`; `src/arabic.js` is modelled on its harfbuzz shaper | MIT | `LICENSES/MIT-Tegaki.txt` |
| MathJax `mathjax-full` 3.2.2 (Copyright The MathJax Consortium) | npm dependency; bundled into `dist/latex-hw.browser.js` | Apache-2.0 | `LICENSES/Apache-2.0-MathJax.txt` |
| `mhchemparser` 4.2.1 (Martin Hensel), a MathJax dependency | bundled into `dist/latex-hw.browser.js` | Apache-2.0 | `LICENSES/Apache-2.0-MathJax.txt` |
| harfbuzzjs 1.6.2 (Copyright 2019-2026 The harfbuzzjs project authors) | npm dependency; bundled into `dist/latex-hw.browser.js`, `dist/harfbuzz.wasm` copied from it | MIT | `LICENSES/MIT-harfbuzzjs.txt` |
| latex-svg (Othman Shuqair) | `src/legacy/`, parts of `src/mathjax.js`, `src/mirror-set.js`, `src/dictionary.js` | Relicensed MIT by its author as part of latex-hw | `LICENSE` |

## Notes on the fonts

- The fonts and the stroke data derived from them stay under the SIL Open Font License 1.1.
  They are **not** MIT, which is why the package's SPDX license is `MIT AND OFL-1.1`.
- The OFL allows the fonts to be bundled and redistributed with software, including commercially,
  as long as the copyright notice and the license go with them (they do: `LICENSES/`,
  `fonts/*/OFL.txt`) and the fonts are not sold on their own.
- Neither Caveat nor Amiri declares a Reserved Font Name, so the modified font may be called
  "Caveat Math" and the subset "Amiri Tegaki 8c2d3b63".
- Any SVG or PNG that latex-hw renders is a document made with the fonts. The OFL does not
  apply to it (OFL section "Permission & Conditions", last paragraph).

## Build-time only (not redistributed)

esbuild (MIT) builds the browser bundle. The Caveat Math build (`tools/caveat-math/build.py`)
uses fontTools (MIT), skia-pathops (BSD-3-Clause), numpy (BSD-3-Clause) and Pillow (MIT-CMU),
and the stroke bundles are generated with Tegaki (MIT) under Bun.
