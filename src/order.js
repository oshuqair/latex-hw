// Stage 7: writing order. Walks the flattened tree and returns units (one
// glyph, rule, text run, radical or stretchy delimiter each) in the order a
// person writes them.

import { emptyBox, unionBox, isFiniteBox } from './geom.js';

export function orderUnits(root, builder, { rtl, warn }) {
  const leavesOf = (n, out = []) => {
    if (n.kind !== 'node') out.push(n);
    else for (const c of n.children) leavesOf(c, out);
    return out;
  };
  const boxOf = (units) => units.reduce((b, u) => unionBox(b, u.box), emptyBox());
  const readingSort = (groups) => {
    const keyed = groups
      .map((units, i) => ({ units, i, box: boxOf(units) }))
      .filter((g) => g.units.length);
    keyed.sort((a, b) => {
      if (!isFiniteBox(a.box) || !isFiniteBox(b.box)) return a.i - b.i;
      const ka = rtl ? -a.box.x1 : a.box.x0;
      const kb = rtl ? -b.box.x1 : b.box.x0;
      return Math.abs(ka - kb) < 1 ? a.i - b.i : ka - kb;
    });
    return keyed.flatMap((g) => g.units);
  };

  function build(n) {
    if (n.kind === 'glyph') return [builder.glyphUnit(n)];
    if (n.kind === 'rule') return [builder.ruleUnit(n)];
    if (n.kind === 'text') return [builder.textUnit(n)];
    const kids = n.children;
    if (n.mml === 'mo' && builder.isStretchyMo(n, leavesOf(n))) {
      const u = builder.stretchyUnit(n, leavesOf(n));
      if (u) return [u];
      warn('stretchy-fallback', 'A stretchy symbol has no synthesized shape; drew its pieces.', null);
    }
    switch (n.mml) {
      case 'mfrac': {
        const bar = kids.find((c) => c.kind === 'rule');
        const [num, den] = kids.filter((c) => c !== bar);
        return [...(num ? build(num) : []), ...(bar ? [builder.ruleUnit(bar)] : []), ...(den ? build(den) : [])];
      }
      case 'msqrt':
      case 'mroot': {
        const mo = kids.find((c) => c.kind === 'node' && c.mml === 'mo');
        const bar = kids.find((c) => c.kind === 'rule');
        const rest = kids.filter((c) => c !== mo && c !== bar);
        const radical = mo ? [builder.radicalUnit(n, leavesOf(mo).filter((l) => l.kind === 'glyph'), bar)] : bar ? [builder.ruleUnit(bar)] : [];
        const [base, index] = rest;
        return [...radical, ...(index ? build(index) : []), ...(base ? build(base) : [])];
      }
      case 'msubsup': {
        const [base, sub, sup] = kids;
        return [base, sup, sub].filter(Boolean).flatMap(build);
      }
      case 'msup': case 'msub': case 'munder': case 'mover': case 'munderover': case 'mmultiscripts':
        return kids.flatMap(build);
      case 'mtable':
        return kids.flatMap(build); // rows top to bottom
      case 'mtr': case 'mlabeledtr':
        return readingSort(kids.map(build));
      default: {
        const groups = kids.map(build);
        // Matrices: draw the brackets before the cells.
        if (kids.some((c) => c.kind === 'node' && c.mml === 'mtable')) {
          const fences = [], rest = [];
          groups.forEach((g, i) => (kids[i].kind === 'node' && kids[i].mml === 'mo' && g.length && g.every((u) => u.kind === 'stretchy') ? fences : rest).push(g));
          return [...readingSort(fences), ...readingSort(rest)];
        }
        return readingSort(groups);
      }
    }
  }
  return build(root);
}
