import { measureTextBox } from "./text-measure.js"; // harfbuzzjs + Amiri (was hb-shape)

/**
 * These glyphs stay mirrored with the line.
 * Add a Unicode code point to keep another character from being turned back upright.
 * Bracket entries include the separate pieces MathJax uses once a delimiter is tall.
 */
export const keepMirroredCharacters = new Set([
  0x221a, // square root
  0x222b, // integral
  0x2211, // summation

  0x28, 0x29, // parentheses
  0x239b, 0x239c, 0x239d, // left parenthesis pieces
  0x239e, 0x239f, 0x23a0, // right parenthesis pieces

  0x5b, 0x5d, // square brackets
  0x23a1, 0x23a2, 0x23a3, // left square bracket pieces
  0x23a4, 0x23a5, 0x23a6, // right square bracket pieces
  0x2308, 0x2309, // ceiling
  0x230a, 0x230b, // floor

  0x7b, 0x7d, // braces
  0x23a7, 0x23a8, 0x23a9, 0x23aa, 0x23ab, 0x23ac, 0x23ad, // brace pieces
  0x23b0, 0x23b1, // group and moustache
  0x27ee, 0x27ef,

  0x27e8, 0x27e9, // angle brackets
  0x2329, 0x232a,
  0x3008, 0x3009,

  0x231c, 0x231d, 0x231e, 0x231f, // corner brackets

  0x7c, 0x2223, 0x2758, // single vertical bars
  0x2016, 0x2225, // double vertical bars

  0x23dc, 0x23dd, 0x23de, 0x23df, // over and under braces
  0x2322, 0x2323,
  0xe150, 0xe151, 0xe152, 0xe153, 0xe154, 0xe155, 0xe156,
  0x23b4, 0x23b5, // horizontal square brackets
  0x250c, 0x2510, 0x2514, 0x2518,
]);

const COMMAND = /[A-Za-z]/;

function format(value) {
  return String(Math.round(value * 1000) / 1000);
}

function parseViewBox(value) {
  const parts = String(value ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error("The SVG has no viewBox, so it cannot be mirrored.");
  }
  return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
}

function pathBounds(d) {
  const tokens = String(d).match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return null;

  let index = 0;
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let controlX = null;
  let controlY = null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const add = (px, py) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  };

  const cubicAt = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  };

  const roots = (p0, p1, p2, p3) => {
    const a = -3 * p0 + 9 * p1 - 9 * p2 + 3 * p3;
    const b = 6 * p0 - 12 * p1 + 6 * p2;
    const c = 3 * (p1 - p0);
    const found = [];
    if (Math.abs(a) < 1e-8) {
      if (Math.abs(b) > 1e-8) found.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const root = Math.sqrt(disc);
        found.push((-b + root) / (2 * a), (-b - root) / (2 * a));
      }
    }
    return found.filter((t) => t > 0 && t < 1);
  };

  const addCubic = (x0, y0, x1, y1, x2, y2, x3, y3) => {
    add(x0, y0);
    add(x3, y3);
    const samples = new Set([...roots(x0, x1, x2, x3), ...roots(y0, y1, y2, y3)]);
    for (const t of samples) {
      add(cubicAt(x0, x1, x2, x3, t), cubicAt(y0, y1, y2, y3, t));
    }
  };

  const quadAt = (p0, p1, p2, t) => {
    const u = 1 - t;
    return u * u * p0 + 2 * u * t * p1 + t * t * p2;
  };

  const quadRoot = (p0, p1, p2) => {
    const denom = p0 - 2 * p1 + p2;
    if (Math.abs(denom) < 1e-8) return [];
    const t = (p0 - p1) / denom;
    return t > 0 && t < 1 ? [t] : [];
  };

  const addQuad = (x0, y0, x1, y1, x2, y2) => {
    add(x0, y0);
    add(x2, y2);
    for (const t of quadRoot(x0, x1, x2)) add(quadAt(x0, x1, x2, t), quadAt(y0, y1, y2, t));
    for (const t of quadRoot(y0, y1, y2)) add(quadAt(x0, x1, x2, t), quadAt(y0, y1, y2, t));
  };

  const read = () => Number(tokens[index++]);
  const absolute = (value, origin) => (command === command.toUpperCase() ? value : origin + value);

  while (index < tokens.length) {
    if (COMMAND.test(tokens[index])) command = tokens[index++];
    const name = command.toUpperCase();

    if (name === "Z") {
      x = startX;
      y = startY;
      controlX = null;
      controlY = null;
      continue;
    }

    if (name === "H") {
      x = absolute(read(), x);
      add(x, y);
      controlX = null;
      controlY = null;
    } else if (name === "V") {
      y = absolute(read(), y);
      add(x, y);
      controlX = null;
      controlY = null;
    } else if (name === "M" || name === "L" || name === "T") {
      const nx = absolute(read(), x);
      const ny = absolute(read(), y);
      if (name === "T") {
        const cx = controlX == null ? x : 2 * x - controlX;
        const cy = controlY == null ? y : 2 * y - controlY;
        addQuad(x, y, cx, cy, nx, ny);
        controlX = cx;
        controlY = cy;
      } else {
        add(nx, ny);
        controlX = null;
        controlY = null;
      }
      x = nx;
      y = ny;
      if (name === "M") {
        startX = x;
        startY = y;
        command = command === "m" ? "l" : "L";
      }
    } else if (name === "Q") {
      const cx = absolute(read(), x);
      const cy = absolute(read(), y);
      const nx = absolute(read(), x);
      const ny = absolute(read(), y);
      addQuad(x, y, cx, cy, nx, ny);
      controlX = cx;
      controlY = cy;
      x = nx;
      y = ny;
    } else if (name === "C" || name === "S") {
      let x1;
      let y1;
      if (name === "S") {
        x1 = controlX == null ? x : 2 * x - controlX;
        y1 = controlY == null ? y : 2 * y - controlY;
      } else {
        x1 = absolute(read(), x);
        y1 = absolute(read(), y);
      }
      const x2 = absolute(read(), x);
      const y2 = absolute(read(), y);
      const nx = absolute(read(), x);
      const ny = absolute(read(), y);
      addCubic(x, y, x1, y1, x2, y2, nx, ny);
      controlX = x2;
      controlY = y2;
      x = nx;
      y = ny;
    } else if (name === "A") {
      read();
      read();
      read();
      read();
      read();
      x = absolute(read(), x);
      y = absolute(read(), y);
      add(x, y);
      controlX = null;
      controlY = null;
    } else {
      throw new Error(`Unsupported SVG path command "${command}".`);
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function flipAroundVerticalCenter(adaptor, node, center) {
  const flip = `translate(${format(center)},0) scale(-1,1) translate(${format(-center)},0)`;
  const current = adaptor.getAttribute(node, "transform");
  adaptor.setAttribute(node, "transform", current ? `${current} ${flip}` : flip);
}

/**
 * The line mirror turns every glyph backwards.
 * Flip each glyph around its own center so the shape reads normally again.
 */
function restoreGlyphShapes(adaptor, svg) {
  const bounds = new Map();
  for (const path of adaptor.tags(svg, "path")) {
    const id = adaptor.getAttribute(path, "id");
    const data = adaptor.getAttribute(path, "d");
    if (id && data) bounds.set(id, pathBounds(data));
  }

  for (const use of adaptor.tags(svg, "use")) {
    if (adaptor.parent(use)?.kind === "defs") continue;
    const code = Number.parseInt(adaptor.getAttribute(use, "data-c") || "", 16);
    if (keepMirroredCharacters.has(code)) continue;
    const href = adaptor.getAttribute(use, "xlink:href") || adaptor.getAttribute(use, "href") || "";
    const box = bounds.get(href.replace(/^#/, ""));
    if (!box) continue;
    flipAroundVerticalCenter(adaptor, use, (box.minX + box.maxX) / 2);
  }
}

function staysMirroredText(content) {
  for (const char of content) {
    const code = char.codePointAt(0);
    if (keepMirroredCharacters.has(code)) continue;
    if (/^\p{Ps}$|^\p{Pe}$/u.test(char)) continue;
    return false;
  }
  return true;
}

/**
 * Flip each text run once. A phrase such as نهـــا is one run,
 * so its letters turn together instead of one by one.
 */
function restoreTextShapes(adaptor, svg) {
  for (const text of adaptor.tags(svg, "text")) {
    const content = adaptor.textContent(text);
    if (!content.trim() || staysMirroredText(content)) continue;
    const fontSize = Number.parseFloat(adaptor.getAttribute(text, "font-size")) || 884;
    const box = measureTextBox(content, fontSize);
    const center = box ? box.center : fontSize * 0.45;
    flipAroundVerticalCenter(adaptor, text, center);
  }
}

/**
 * Mirror the whole graphic across its vertical center, then restore each glyph.
 * The expression reads right to left, and every character has its normal shape.
 */
export function layoutRightToLeft(adaptor, svg) {
  restoreGlyphShapes(adaptor, svg);
  restoreTextShapes(adaptor, svg);
  const { minX, width } = parseViewBox(adaptor.getAttribute(svg, "viewBox"));
  const wrapper = adaptor.create("g");
  adaptor.setAttribute(
    wrapper,
    "transform",
    `translate(${format(minX * 2 + width)},0) scale(-1,1)`,
  );

  for (const child of adaptor.childNodes(svg)) {
    const kind = adaptor.kind(child);
    if (kind === "defs" || kind === "#text" || kind === "#comment") continue;
    adaptor.append(wrapper, child);
  }
  adaptor.append(svg, wrapper);
}
