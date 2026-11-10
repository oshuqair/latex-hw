#!/usr/bin/env python3
"""Review helpers (dev only): rasterize a latex-hw SVG.

  raster.py final  in.svg out.png [--scale 2]
  raster.py order  in.svg out.png [--scale 2]     numbered stroke-order overlay
  raster.py anim   in.svg out.gif|out.mp4 [--fps 20] [--scale 1.5]
"""
import re, sys, colorsys, subprocess, tempfile, os, math
import cairosvg

def load(path):
    s = open(path, encoding='utf8').read()
    m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', s)
    W, H = float(m.group(1)), float(m.group(2))
    strokes = []
    for pm in re.finditer(r'<path ([^>]*)/>', s):
        a = dict(re.findall(r'([\w-]+)="([^"]*)"', pm.group(1)))
        strokes.append(a)
    return W, H, strokes

def start_point(d):
    m = re.match(r'M(-?[\d.]+) (-?[\d.]+)', d)
    return float(m.group(1)), float(m.group(2))

def head(W, H, pad=0):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H+pad}" width="{W}" height="{H+pad}"><rect width="100%" height="100%" fill="#fff"/>'

def to_png(svg, out, scale):
    cairosvg.svg2png(bytestring=svg.encode('utf8'), write_to=out, scale=scale)

def final(src, out, scale=2.0):
    W, H, st = load(src)
    body = ''.join(f'<path d="{a["d"]}" stroke-width="{a["stroke-width"]}" fill="none" stroke="#111" stroke-linecap="round" stroke-linejoin="round"/>' for a in st)
    to_png(head(W, H) + body + '</svg>', out, scale)

def order(src, out, scale=2.0):
    W, H, st = load(src)
    n = max(1, len(st))
    body = ''
    labels = ''
    fs = max(7.0, min(11.0, H / 12))
    for i, a in enumerate(st):
        r, g, b = colorsys.hsv_to_rgb(0.66 * i / n, 0.85, 0.8)
        col = '#%02x%02x%02x' % (int(r * 255), int(g * 255), int(b * 255))
        body += f'<path d="{a["d"]}" stroke-width="{a["stroke-width"]}" fill="none" stroke="{col}" stroke-opacity="0.75" stroke-linecap="round" stroke-linejoin="round"/>'
        x, y = start_point(a['d'])
        labels += f'<circle cx="{x}" cy="{y}" r="{fs*0.75}" fill="#fff" stroke="{col}" stroke-width="0.8"/>'
        labels += f'<text x="{x}" y="{y + fs*0.33}" font-size="{fs*0.85}" font-family="DejaVu Sans" text-anchor="middle" fill="{col}">{i+1}</text>'
    to_png(head(W, H) + body + labels + '</svg>', out, scale)

def frame_svg(W, H, st, t):
    body = ''
    for a in st:
        s0, du = float(a['data-start']), float(a['data-dur'])
        if t < s0:
            continue
        L = float(a['data-len'])
        p = 1.0 if t >= s0 + du else (t - s0) / du
        p = 1 - (1 - p) ** 2  # ease-out like Tegaki
        dash = '' if p >= 1 else f' stroke-dasharray="{L+2} {L+2}" stroke-dashoffset="{(L+2)*(1-p)}"'
        body += f'<path d="{a["d"]}" stroke-width="{a["stroke-width"]}" fill="none" stroke="#111" stroke-linecap="round" stroke-linejoin="round"{dash}/>'
    return head(W, H) + body + '</svg>'

def anim(src, out, fps=20, scale=1.5, hold=1.5):
    W, H, st = load(src)
    total = max(float(a['data-start']) + float(a['data-dur']) for a in st)
    n = int(math.ceil((total + hold) * fps))
    tmp = tempfile.mkdtemp()
    for k in range(n + 1):
        to_png(frame_svg(W, H, st, k / fps), os.path.join(tmp, f'f{k:05d}.png'), scale)
    w = int(W * scale) // 2 * 2
    h = int(H * scale) // 2 * 2
    if out.endswith('.gif'):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(tmp, 'f%05d.png'),
                        '-vf', f'scale={w}:{h},split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse', out], check=True)
    else:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(tmp, 'f%05d.png'),
                        '-vf', f'scale={w}:{h}', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', out], check=True)

if __name__ == '__main__':
    cmd, src, out = sys.argv[1:4]
    kw = {}
    args = sys.argv[4:]
    for i in range(0, len(args), 2):
        kw[args[i].lstrip('-')] = float(args[i + 1])
    {'final': final, 'order': order, 'anim': anim}[cmd](src, out, **kw)
