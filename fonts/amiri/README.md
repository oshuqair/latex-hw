# Amiri Tegaki bundle (latex-hw)

Regenerated from the full Amiri Regular (`Amiri-Regular.ttf`, the same file as Tegaki's
`packages/renderer/fonts/amiri/amiri.ttf`) with the Tegaki generator, geometry pipeline, defaults:

```sh
bun --filter tegaki-generator start generate --font-file /abs/amiri.ttf --full-font true \
  -c "$(cat chars.txt)" -p geometry -o out/amiri
```

`chars.txt` = Tegaki's original 142 Amiri characters + ؤ ، ؛ ؟ ٪ ٫ ٬ ـ. The subset font
`amiri-8c2d3b63.ttf` is the one the glyph ids in `glyphDataById.json` refer to.
All Arabic strokes are identical to Tegaki's shipped Amiri bundle; the new characters were checked
with `coverage-report` (mean unpainted 0.47 %, 0 glyphs over 2 %) and by eye
(`reports/new-chars-stroke-order.png`). Tegaki has no stroke-order dataset for Arabic punctuation,
so their order is Tegaki's heuristic; latex-hw additionally draws the hamza of أ إ آ ؤ ئ after the body.
