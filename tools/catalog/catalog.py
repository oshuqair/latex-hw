#!/usr/bin/env python3
"""Stroke catalogs for the bundled fonts.

One SVG sheet and one JSON index per font, plus an HTML dictionary that links
each character to its cell. Reads the Tegaki bundles already in fonts/. Same
inputs always write the same bytes.

    python3 tools/catalog/catalog.py
    python3 tools/catalog/catalog.py -o examples/catalog

For a handful of characters, tools/caveat-math/ordersheet.py still draws a
smaller sheet (SVG and PNG). This script covers every glyph in the bundle.
"""

import argparse
import json
import math
import subprocess
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CELL_W = 196
CELL_H = 210
LABEL_H = 36
PAD = 8
COLS = 6
PAGE_H = 56
# Cap so an x-height (~450 units) is about 100px. Taller glyphs shrink to fit
# their own cell; the baseline stays at the same height in every cell.
MAX_SCALE = 0.22
BASE_FRAC = 0.72
HEADER_H = 32
FONT = 'ui-sans-serif, system-ui, sans-serif'
COLORS = ['#e6194b', '#f58231', '#3cb44b', '#4363d8', '#911eb4', '#42d4f4', '#f032e6', '#9a6324']

BLOCKS = [
    (0x0000, 0x007F, 'Basic Latin'),
    (0x0080, 0x00FF, 'Latin-1 Supplement'),
    (0x0100, 0x017F, 'Latin Extended-A'),
    (0x0180, 0x024F, 'Latin Extended-B'),
    (0x0250, 0x02AF, 'IPA Extensions'),
    (0x02B0, 0x02FF, 'Spacing Modifier Letters'),
    (0x0300, 0x036F, 'Combining Diacritical Marks'),
    (0x0370, 0x03FF, 'Greek and Coptic'),
    (0x0400, 0x04FF, 'Cyrillic'),
    (0x0500, 0x052F, 'Cyrillic Supplement'),
    (0x1E00, 0x1EFF, 'Latin Extended Additional'),
    (0x1F00, 0x1FFF, 'Greek Extended'),
    (0x2000, 0x206F, 'General Punctuation'),
    (0x2070, 0x209F, 'Superscripts and Subscripts'),
    (0x20A0, 0x20CF, 'Currency Symbols'),
    (0x20D0, 0x20FF, 'Combining Diacritical Marks for Symbols'),
    (0x2100, 0x214F, 'Letterlike Symbols'),
    (0x2150, 0x218F, 'Number Forms'),
    (0x2190, 0x21FF, 'Arrows'),
    (0x2200, 0x22FF, 'Mathematical Operators'),
    (0x2300, 0x23FF, 'Miscellaneous Technical'),
    (0x2460, 0x24FF, 'Enclosed Alphanumerics'),
    (0x25A0, 0x25FF, 'Geometric Shapes'),
    (0x2600, 0x26FF, 'Miscellaneous Symbols'),
    (0x2700, 0x27BF, 'Dingbats'),
    (0x27C0, 0x27EF, 'Miscellaneous Mathematical Symbols-A'),
    (0x27F0, 0x27FF, 'Supplemental Arrows-A'),
    (0x2900, 0x297F, 'Supplemental Arrows-B'),
    (0x2980, 0x29FF, 'Miscellaneous Mathematical Symbols-B'),
    (0x2A00, 0x2AFF, 'Supplemental Mathematical Operators'),
    (0x2B00, 0x2BFF, 'Miscellaneous Symbols and Arrows'),
    (0xFB00, 0xFB4F, 'Alphabetic Presentation Forms'),
    (0x1D400, 0x1D7FF, 'Mathematical Alphanumeric Symbols'),
    (0x0600, 0x06FF, 'Arabic'),
    (0x0750, 0x077F, 'Arabic Supplement'),
    (0x08A0, 0x08FF, 'Arabic Extended-A'),
    (0xFB50, 0xFDFF, 'Arabic Presentation Forms-A'),
    (0xFE70, 0xFEFF, 'Arabic Presentation Forms-B'),
]

FORM_ROLES = [
    ('init', 'Initial'),
    ('medi', 'Medial'),
    ('fina', 'Final'),
    ('liga', 'Ligatures'),
    ('mark', 'Marks on a letter'),
    ('other', 'Other drawn forms'),
]


def block_for(cp):
    for start, end, name in BLOCKS:
        if start <= cp <= end:
            return name
    return f'U+{cp & ~0x7F:04X}'


def xml(text):
    # XML 1.0 rejects NUL and the other C0 controls. The Caveat bundle has a
    # U+0000 entry; show it as U+FFFD in text, and keep the real character in JSON.
    kept = []
    for ch in text:
        cp = ord(ch)
        if cp in (0x9, 0xA, 0xD) or 0x20 <= cp <= 0xD7FF or 0xE000 <= cp <= 0xFFFD or cp >= 0x10000:
            kept.append(ch)
        else:
            kept.append('\uFFFD')
    text = ''.join(kept)
    return (text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;'))


def fmt(n):
    text = f'{n:.1f}'
    return '0.0' if text == '-0.0' else text


def cp_label(cp):
    return f'U+{cp:04X}' if cp <= 0xFFFF else f'U+{cp:06X}'


def char_entries(glyph_data):
    entries = []
    for ch in sorted(glyph_data, key=lambda c: tuple(ord(ch) for ch in c)):
        g = glyph_data[ch]
        cp = ord(ch) if len(ch) == 1 else None
        name = unicodedata.name(ch, '') if len(ch) == 1 else ' '.join(
            unicodedata.name(c, cp_label(ord(c))) for c in ch)
        shown = ch
        if len(ch) == 1 and unicodedata.category(ch) == 'Mn':
            shown = '\u25CC' + ch
        entries.append({
            'sort': tuple(ord(c) for c in ch),
            'anchor': 'g-' + '-'.join(f'{ord(c):04X}' for c in ch),
            'id': cp_label(cp) if cp is not None else ' '.join(cp_label(ord(c)) for c in ch),
            'char': ch,
            'shown': shown,
            'name': name,
            'block': block_for(ord(ch[0])),
            'advance': g.get('w', 0),
            'duration': None if g.get('t') is None else round(float(g['t']), 3),
            'strokes': g.get('s') or [],
            'role': None,
            'gid': None,
        })
    return entries


def group_by_block(entries):
    groups = []
    for entry in entries:
        if not groups or groups[-1][0] != entry['block']:
            groups.append((entry['block'], []))
        groups[-1][1].append(entry)
    return groups


def amiri_labels():
    proc = subprocess.run(
        ['node', str(ROOT / 'tools/catalog/amiri-labels.mjs'), str(ROOT)],
        cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(proc.stdout)


def form_entries(by_id, labels):
    entries = []
    for gid in sorted(by_id, key=int):
        label = labels.get(gid)
        role = label['role'] if label else 'other'
        if role == 'isol':
            continue
        g = by_id[gid]
        char = label['char'] if label else ''
        if label and label.get('focus'):
            focus = label['focus']
            partner = label['partner']
            name = (role + ' · ' + unicodedata.name(focus, cp_label(ord(focus)))
                    + ' ' + label['side'] + ' '
                    + unicodedata.name(partner, cp_label(ord(partner))))
            shown = focus
        elif label:
            parts = [unicodedata.name(c, cp_label(ord(c))) for c in char]
            name = role + ' · ' + ' + '.join(parts)
            shown = char
        else:
            name = f'glyph {gid}'
            shown = ''
        entries.append({
            'sort': (role, tuple(ord(c) for c in char), int(gid)),
            'anchor': f'g-gid-{gid}',
            'id': f'gid {gid}',
            'char': char,
            'shown': shown or f'#{gid}',
            'name': name,
            'block': role,
            'advance': g.get('w', 0),
            'duration': None if g.get('t') is None else round(float(g['t']), 3),
            'strokes': g.get('s') or [],
            'role': role,
            'gid': int(gid),
        })
    groups = []
    by_role = {role: [] for role, _heading in FORM_ROLES}
    for entry in entries:
        by_role.setdefault(entry['role'], []).append(entry)
    for role, heading in FORM_ROLES:
        items = by_role.get(role) or []
        if not items:
            continue
        items.sort(key=lambda e: (e['sort'][1], e['sort'][2]))
        groups.append((heading, items))
    return groups


def glyph_frame(entry):
    """Scale and origin for one glyph. Baseline (font y = 0) is shared."""
    min_x = 0.0
    min_y = 0.0
    max_x = float(entry['advance'] or 0)
    max_y = 0.0
    for stroke in entry['strokes']:
        for point in stroke.get('p') or []:
            min_x = min(min_x, point[0])
            max_x = max(max_x, point[0])
            min_y = min(min_y, point[1])
            max_y = max(max_y, point[1])
    # Half a stem, so the round pen stays inside the cell.
    pen = 36
    min_x -= pen
    max_x += pen
    min_y -= pen
    max_y += pen
    inner_w = CELL_W - 2 * PAD
    inner_h = CELL_H - LABEL_H - 2 * PAD
    above = max(0.0, -min_y)
    below = max(0.0, max_y)
    scale = MAX_SCALE
    if above:
        scale = min(scale, (inner_h * BASE_FRAC) / above)
    if below:
        scale = min(scale, (inner_h * (1 - BASE_FRAC)) / below)
    width = max_x - min_x
    if width:
        scale = min(scale, inner_w / width)
    ox = PAD + (inner_w - width * scale) / 2 - min_x * scale
    oy = LABEL_H + PAD + inner_h * BASE_FRAC
    return scale, ox, oy


def layout(groups):
    y = PAGE_H
    placed = []
    for title, items in groups:
        placed.append(('header', title, len(items), y))
        y += HEADER_H
        rows = (len(items) + COLS - 1) // COLS if items else 0
        for i, entry in enumerate(items):
            placed.append(('cell', entry, (i % COLS) * CELL_W, y + (i // COLS) * CELL_H))
        y += rows * CELL_H
    return placed, y


def _arrow(pts, ox, oy, scale):
    """A short arrow at the pen-up end. Samples are dense there, so walk back
    until the direction is stable instead of using the last tiny segment."""
    x2, y2 = pts[-1][0], pts[-1][1]
    chosen = None
    fallback = None
    for point in reversed(pts[:-1]):
        dx = (x2 - point[0]) * scale
        dy = (y2 - point[1]) * scale
        dist = math.hypot(dx, dy)
        if dist >= 4 and fallback is None:
            fallback = (dx, dy, dist)
        if dist >= 16:
            chosen = (dx, dy, dist)
            break
    chosen = chosen or fallback
    if chosen is None:
        return None
    dx, dy, length = chosen
    ex = ox + x2 * scale
    ey = oy + y2 * scale
    return (ex - dx / length * 13, ey - dy / length * 13, ex, ey)


def _nudge(x, y, placed):
    for _ in range(6):
        if all((x - px) ** 2 + (y - py) ** 2 > 15 ** 2 for px, py in placed):
            break
        x += 12
    return (min(max(x, 10), CELL_W - 10), min(max(y, LABEL_H + 8), CELL_H - 10))


def render_sheet(path, title, count, groups):
    placed, height = layout(groups)
    width = COLS * CELL_W
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<!-- generated by tools/catalog/catalog.py — do not edit -->',
        f'<rect width="100%" height="100%" fill="#fafaf9"/>',
        '<defs><marker id="pen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">'
        '<path d="M0,1 L10,5 L0,9 z" fill="#292524"/></marker></defs>',
        f'<text x="12" y="22" font-size="16" font-family="{FONT}" font-weight="600" fill="#1c1917">{xml(title)}</text>',
        f'<text x="12" y="42" font-size="12" font-family="{FONT}" fill="#57534e">{count} glyphs · color is writing order · arrow is pen direction · square badge is a dot or hamza · red line is the baseline</text>',
    ]
    for kind, *rest in placed:
        if kind == 'header':
            heading, n, y = rest
            anchor = 'block-' + ''.join(ch.lower() if ch.isalnum() else '-' for ch in heading).strip('-')
            parts.append(f'<g id="{anchor}">')
            parts.append(f'<rect x="0" y="{y}" width="{width}" height="{HEADER_H}" fill="#f5f5f4"/>')
            parts.append(
                f'<text x="12" y="{y + 21}" font-size="14" font-family="{FONT}" font-weight="600" fill="#1c1917">{xml(heading)} · {n}</text>')
            parts.append('</g>')
        else:
            entry, x, y = rest
            parts.append(cell_svg(entry, x, y))
    parts.append('</svg>\n')
    path.write_text(''.join(parts), encoding='utf-8')
    return width, height


def cell_svg(entry, x, y):
    scale, ox, oy = glyph_frame(entry)
    parts = [f'<g id="{entry["anchor"]}" transform="translate({x},{y})">']
    title = entry['id']
    if entry['name']:
        title += ' ' + entry['name']
    n = len(entry['strokes'])
    title += f' · {n} stroke' + ('' if n == 1 else 's')
    parts.append(f'<title>{xml(title)}</title>')
    parts.append(f'<rect width="{CELL_W}" height="{CELL_H}" fill="#fff" stroke="#e7e5e4"/>')
    parts.append(
        f'<text x="8" y="16" font-size="16" font-family="{FONT}" fill="#1c1917">{xml(entry["shown"])}</text>')
    parts.append(
        f'<text x="{CELL_W - 8}" y="15" font-size="11" text-anchor="end" font-family="{FONT}" fill="#78716c">{n}</text>')
    parts.append(
        f'<text x="8" y="30" font-size="10" font-family="{FONT}" fill="#a8a29e">{xml(entry["id"])}</text>')
    parts.append(
        f'<line x1="{PAD}" y1="{fmt(oy)}" x2="{CELL_W - PAD}" y2="{fmt(oy)}" stroke="#f3c6c6" stroke-width="1"/>')

    badges = []
    for k, stroke in enumerate(entry['strokes']):
        pts = stroke.get('p') or []
        if not pts:
            continue
        color = COLORS[k % len(COLORS)]
        width = max(sum(p[2] for p in pts) / len(pts) * scale, 1.25)
        if len(pts) == 1 or all(p[0] == pts[0][0] and p[1] == pts[0][1] for p in pts):
            r = max(pts[0][2] * scale / 2, 2.5)
            parts.append(
                f'<circle cx="{fmt(ox + pts[0][0] * scale)}" cy="{fmt(oy + pts[0][1] * scale)}" r="{fmt(r)}" fill="{color}" opacity="0.85"/>')
        else:
            d = 'M' + ' L'.join(f'{fmt(ox + p[0] * scale)},{fmt(oy + p[1] * scale)}' for p in pts)
            parts.append(
                f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{fmt(width)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>')
            end = _arrow(pts, ox, oy, scale)
            if end:
                parts.append(
                    f'<line x1="{fmt(end[0])}" y1="{fmt(end[1])}" x2="{fmt(end[2])}" y2="{fmt(end[3])}" stroke="#292524" stroke-width="1.2" marker-end="url(#pen)"/>')
        badges.append((ox + pts[0][0] * scale, oy + pts[0][1] * scale, k, stroke.get('r') == -1))

    placed_badges = []
    for bx, by, k, mark in badges:
        bx, by = _nudge(bx, by, placed_badges)
        placed_badges.append((bx, by))
        if mark:
            parts.append(
                f'<rect x="{fmt(bx - 7)}" y="{fmt(by - 7)}" width="14" height="14" rx="2" fill="#fff" stroke="#292524" stroke-width="1"/>')
        else:
            parts.append(
                f'<circle cx="{fmt(bx)}" cy="{fmt(by)}" r="7" fill="#fff" stroke="#292524" stroke-width="1"/>')
        parts.append(
            f'<text x="{fmt(bx)}" y="{fmt(by + 3.5)}" font-size="10" text-anchor="middle" font-family="{FONT}" font-weight="700" fill="#1c1917">{k + 1}</text>')
    parts.append('</g>')
    return ''.join(parts)


def write_html(path, sheets):
    nav = []
    sections = []
    for i, sheet in enumerate(sheets):
        nav.append(
            f'<button type="button" data-sheet="{xml(sheet["file"])}" class="{"on" if i == 0 else ""}">{xml(sheet["title"])}'
            f'<span>{sheet["count"]}</span></button>')
        blocks = []
        for heading, items in sheet['groups']:
            chips = []
            for entry in items:
                key = ' '.join([
                    entry['id'], entry['char'], entry['name'], heading, entry['shown'],
                ]).lower()
                chips.append(
                    f'<a class="glyph" href="{xml(sheet["file"])}#{entry["anchor"]}" data-k="{xml(key)}">'
                    f'<b>{xml(entry["shown"])}</b><span>{xml(entry["id"])}</span>'
                    f'<span>{len(entry["strokes"])}</span></a>')
            blocks.append(
                f'<details class="block"><summary>{xml(heading)} · {len(items)}</summary>'
                f'<div class="chips">{"".join(chips)}</div></details>')
        hidden = '' if i == 0 else ' hidden'
        sections.append(
            f'<section data-file="{xml(sheet["file"])}"{hidden}>'
            f'<p class="blurb">{xml(sheet["blurb"])} <a href="{xml(sheet["file"])}">Open the SVG</a></p>'
            f'<div class="blocks">{"".join(blocks)}</div></section>')
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>latex-hw font catalogs</title>
<style>
  body {{ margin: 0; font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; color: #1c1917; background: #f6f4f1; }}
  header {{ padding: 20px 28px 0; }}
  h1 {{ font-size: 22px; font-weight: 650; margin: 0 0 6px; }}
  header p {{ margin: 0; color: #57534e; max-width: 72ch; }}
  code {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }}
  .bar {{ display: flex; gap: 8px; align-items: center; padding: 14px 28px; position: sticky; top: 0; background: #f6f4f1; z-index: 1; }}
  button {{ border: 1px solid #e7e5e4; background: #fff; border-radius: 8px; padding: 6px 10px; font: inherit; cursor: pointer; }}
  button.on {{ border-color: #1c1917; }}
  button span {{ margin-left: 8px; color: #78716c; font-variant-numeric: tabular-nums; }}
  #q {{ margin-left: auto; border: 1px solid #e7e5e4; border-radius: 8px; padding: 6px 10px; font: inherit; min-width: 220px; background: #fff; }}
  main {{ padding: 0 28px 40px; }}
  iframe {{ width: 100%; height: 70vh; border: 1px solid #e7e5e4; background: #fff; }}
  .blurb {{ color: #57534e; }}
  details {{ margin: 0 0 8px; background: #fff; border: 1px solid #e7e5e4; border-radius: 8px; padding: 6px 10px; }}
  summary {{ cursor: pointer; font-weight: 600; }}
  .chips {{ margin-top: 8px; }}
  a.glyph {{ display: inline-flex; gap: 6px; align-items: baseline; margin: 0 6px 6px 0; padding: 3px 7px; text-decoration: none; color: inherit; background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 6px; }}
  a.glyph b {{ font-weight: 650; }}
  a.glyph span {{ color: #78716c; font-size: 11px; font-variant-numeric: tabular-nums; }}
  a.glyph[hidden], details[hidden], section[hidden] {{ display: none; }}
</style>
</head>
<body>
<header>
  <h1>Font stroke catalogs</h1>
  <p>Every glyph in the Caveat Math and Amiri bundles, drawn as pen strokes. Color is writing order, the number is where the pen starts, the arrow is the direction. Rebuild after a font change with <code>python3 tools/catalog/catalog.py</code>.</p>
</header>
<div class="bar">
  {''.join(nav)}
  <input id="q" type="search" placeholder="U+03C0, alpha, س, init…" autocomplete="off">
</div>
<main>
  <iframe id="sheet" title="Stroke sheet" src="{xml(sheets[0]["file"])}"></iframe>
  {''.join(sections)}
</main>
<script>
const frame = document.querySelector('#sheet');
const buttons = document.querySelectorAll('.bar button');
const sections = document.querySelectorAll('main section');
function show(file) {{
  frame.src = file;
  for (const button of buttons) button.classList.toggle('on', button.dataset.sheet === file);
  for (const section of sections) section.hidden = section.dataset.file !== file;
}}
for (const button of buttons) button.addEventListener('click', () => show(button.dataset.sheet));
document.body.addEventListener('click', (ev) => {{
  const link = ev.target.closest('a.glyph');
  if (!link) return;
  ev.preventDefault();
  frame.src = link.getAttribute('href');
}});
document.querySelector('#q').addEventListener('input', (ev) => {{
  const needle = ev.target.value.trim().toLowerCase();
  for (const section of sections) {{
    if (section.hidden) continue;
    for (const link of section.querySelectorAll('a.glyph')) {{
      link.hidden = needle !== '' && !link.dataset.k.includes(needle);
    }}
    for (const block of section.querySelectorAll('details.block')) {{
      const any = block.querySelector('a.glyph:not([hidden])');
      block.hidden = !any;
      if (needle && any) block.open = true;
    }}
  }}
}});
</script>
</body>
</html>
'''
    path.write_text(html, encoding='utf-8')


def index_glyphs(sheet):
    glyphs = []
    for heading, items in sheet['groups']:
        for entry in items:
            row = {
                'id': entry['id'],
                'char': entry['char'],
                'name': entry['name'],
                'block': heading,
                'advance': entry['advance'],
                'strokes': len(entry['strokes']),
            }
            if entry['duration'] is not None:
                row['duration'] = entry['duration']
            if entry['role']:
                row['role'] = entry['role']
                row['gid'] = entry['gid']
            glyphs.append(row)
    return {
        'font': sheet['title'],
        'source': sheet['source'],
        'count': len(glyphs),
        'glyphs': glyphs,
    }


def main():
    parser = argparse.ArgumentParser(description='Write SVG stroke catalogs for the bundled fonts.')
    parser.add_argument('-o', '--out', type=Path, default=ROOT / 'examples' / 'catalog')
    args = parser.parse_args()
    out = args.out
    out.mkdir(parents=True, exist_ok=True)

    sheets = []
    for spec in (
        ('caveat-math', 'Caveat Math', 'fonts/caveat-math/glyphData.json',
         'Latin, Greek, digits and math symbols drawn with Caveat Math.'),
        ('amiri', 'Amiri', 'fonts/amiri/glyphData.json',
         'Characters the Amiri bundle draws. Positional forms and ligatures are on the next sheet.'),
    ):
        file_id, title, source, blurb = spec
        data = json.loads((ROOT / source).read_text(encoding='utf-8'))
        entries = char_entries(data)
        groups = group_by_block(entries)
        svg = out / f'{file_id}.svg'
        render_sheet(svg, title, len(entries), groups)
        sheet = {
            'file': svg.name, 'title': title, 'source': source, 'count': len(entries),
            'blurb': blurb, 'groups': groups,
        }
        (out / f'{file_id}.json').write_text(
            json.dumps(index_glyphs(sheet), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        sheets.append(sheet)
        print(f'{file_id}: {len(entries)} glyphs -> {svg}')

    labels = amiri_labels()
    by_id = json.loads((ROOT / 'fonts/amiri/glyphDataById.json').read_text(encoding='utf-8'))
    groups = form_entries(by_id, labels)
    count = sum(len(items) for _h, items in groups)
    svg = out / 'amiri-forms.svg'
    render_sheet(svg, 'Amiri positional forms', count, groups)
    sheet = {
        'file': svg.name, 'title': 'Amiri forms', 'source': 'fonts/amiri/glyphDataById.json',
        'count': count,
        'blurb': 'Shaped forms from the Amiri subset (initial, medial, final, ligatures, marks), plus drawn glyphs shaping did not name.',
        'groups': groups,
    }
    (out / 'amiri-forms.json').write_text(
        json.dumps(index_glyphs(sheet), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    sheets.append(sheet)
    print(f'amiri-forms: {count} glyphs -> {svg}')
    for heading, items in groups:
        print(f'  {heading}: {len(items)}')

    write_html(out / 'index.html', sheets)
    print(f'index -> {out / "index.html"}')


if __name__ == '__main__':
    main()
