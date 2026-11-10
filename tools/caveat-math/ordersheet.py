"""Stroke-order sheet for a Tegaki bundle: numbered start points, arrow = pen direction.
usage: python3 ordersheet.py <bundle-dir with glyphData.json> "<chars>" <out-prefix> [cols] [cell]
writes <out-prefix>.svg and <out-prefix>.png (needs cairosvg)."""
import json, sys
import cairosvg
bundle, chars, out = sys.argv[1], sys.argv[2], sys.argv[3]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 12
cell = int(sys.argv[5]) if len(sys.argv) > 5 else 150
d = json.load(open(bundle + '/glyphData.json'))
COL = ['#e6194b', '#f58231', '#3cb44b', '#4363d8', '#911eb4', '#42d4f4', '#f032e6', '#9a6324']
s = cell / 1150
rows = (len(chars) + cols - 1) // cols
P = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{cols*cell}" height="{rows*cell}"><rect width="100%" height="100%" fill="white"/>',
     '<defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="black"/></marker></defs>']
for i, c in enumerate(chars):
    g = d.get(c); x0 = (i % cols) * cell; y0 = (i // cols) * cell
    P.append(f'<rect x="{x0}" y="{y0}" width="{cell}" height="{cell}" fill="none" stroke="#eee"/>')
    P.append(f'<text x="{x0+4}" y="{y0+14}" font-size="11" font-family="sans-serif" fill="#999">U+{ord(c):04X} {len(g["s"]) if g else "-"}</text>')
    if not g: continue
    P.append(f'<g transform="translate({x0+18},{y0+cell*0.72}) scale({s})">')
    P.append(f'<line x1="-100" x2="{g["w"]+100}" y1="0" y2="0" stroke="#fdd" stroke-width="6"/>')
    for k, st in enumerate(g['s']):
        col = COL[k % len(COL)]; pts = st['p']
        if len(pts) == 1:
            P.append(f'<circle cx="{pts[0][0]}" cy="{pts[0][1]}" r="{max(pts[0][2],20)/2}" fill="{col}" opacity="0.8"/>')
        else:
            dpath = 'M' + ' L'.join(f'{p[0]:.1f},{p[1]:.1f}' for p in pts)
            w = sum(p[2] for p in pts) / len(pts)
            P.append(f'<path d="{dpath}" fill="none" stroke="{col}" stroke-width="{w:.1f}" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>')
            ax, ay = pts[-1][0], pts[-1][1]; bx, by = pts[max(0, len(pts)-3)][0], pts[max(0, len(pts)-3)][1]
            P.append(f'<line x1="{bx}" y1="{by}" x2="{ax}" y2="{ay}" stroke="black" stroke-width="10" marker-end="url(#a)"/>')
        P.append(f'<circle cx="{pts[0][0]}" cy="{pts[0][1]}" r="22" fill="white" stroke="black" stroke-width="6"/>')
        P.append(f'<text x="{pts[0][0]}" y="{pts[0][1]+12}" font-size="36" text-anchor="middle" font-family="sans-serif" font-weight="bold">{k+1}</text>')
    P.append('</g>')
P.append('</svg>')
open(out + '.svg', 'w').write(''.join(P))
cairosvg.svg2png(url=out + '.svg', write_to=out + '.png')
