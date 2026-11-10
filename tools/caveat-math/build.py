"""Build Caveat Math: Caveat Regular + hand-drawn arithmetic & logic symbols.

Every new symbol is written as single-line pen strokes (centerlines, in pen order and
direction), given a little hand wobble + Caveat's slant, then inked with a round
brush at Caveat's stem width. Each pen stroke stays its own contour (strokes overlap
but are not merged), so Tegaki's geometry pipeline sees one clean region per stroke.
The same centerlines are exported as a Tegaki drawn stroke-order dataset.
"""
import math, random, json, sys, copy
import numpy as np
import pathops
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen, DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib.tables._g_l_y_f import Glyph

import os
HERE = os.path.dirname(os.path.abspath(__file__))
# Vendored in latex-hw (tools/caveat-math). Source font and letter refs sit next to this script.
SRC = os.environ.get('CAVEAT_SRC', os.path.join(HERE, 'Caveat-GF-Regular.ttf'))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out', 'CaveatMath-Regular.ttf'))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
A = 209          # math axis (centre of Caveat's minus)
W = 62           # Caveat stem width (minus bar is 63 units tall)
SHEAR = 0.10     # Caveat's rightward lean, applied about the math axis
WSUP = 46        # pen width for superscript / subscript symbols

font = TTFont(SRC)
gs = font.getGlyphSet()
cmap = font.getBestCmap()

# ------------------------------------------------------------------ geometry helpers
def line(a, b):
    return [tuple(a), tuple(b)]

def poly(*pts):
    return [tuple(p) for p in pts]

def arc(cx, cy, rx, ry, a0, a1, step=4):
    n = max(2, int(abs(a1 - a0) / step))
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

def spline(*pts, n=16):
    """Catmull-Rom through pts."""
    P = [np.array(p, float) for p in pts]
    P = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)))
    out.append(tuple(P[-2]))
    return out

def cat(*segs):
    out = []
    for s in segs:
        for p in s:
            if not out or math.dist(out[-1], p) > 1e-6:
                out.append(tuple(p))
    return out

def wave(x0, x1, y, amp, n=40):
    return [(x0 + (x1 - x0) * i / n, y + amp * math.sin(2 * math.pi * i / n)) for i in range(n + 1)]

def tx(stroke, dx=0, dy=0, sx=1, sy=1, cx=0, cy=0):
    return [(cx + (x - cx) * sx + dx, cy + (y - cy) * sy + dy) for x, y in stroke]

def mirror_x(strokes, cx=250):
    return [[(2 * cx - x, y) for x, y in s] for s in strokes]

def resample(pts, step=6.0):
    if len(pts) == 1:
        return list(pts)
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        d = math.dist(a, b)
        n = max(1, int(math.ceil(d / step)))
        for i in range(1, n + 1):
            out.append((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n))
    return out

# ------------------------------------------------------------------ hand wobble
def wobble(strokes, seed, amp=3.2, jitter=4.0, rot=1.2, shear=SHEAR):
    rnd = random.Random(seed)
    out = []
    for s in strokes:
        s = resample(s)
        if len(s) > 1:
            L = [0.0]
            for a, b in zip(s, s[1:]):
                L.append(L[-1] + math.dist(a, b))
            l1, l2 = rnd.uniform(240, 420), rnd.uniform(90, 150)
            f1, f2 = rnd.uniform(0, 6.28), rnd.uniform(0, 6.28)
            a1, a2 = amp, amp * 0.4
            ns = []
            for i, (x, y) in enumerate(s):
                j0, j1 = max(0, i - 1), min(len(s) - 1, i + 1)
                dx, dy = s[j1][0] - s[j0][0], s[j1][1] - s[j0][1]
                d = math.hypot(dx, dy) or 1
                nx, ny = -dy / d, dx / d
                o = a1 * math.sin(2 * math.pi * L[i] / l1 + f1) + a2 * math.sin(2 * math.pi * L[i] / l2 + f2)
                ns.append((x + nx * o, y + ny * o))
            s = ns
            # small per-stroke rotation about its centre + offset
            cx = sum(p[0] for p in s) / len(s); cy = sum(p[1] for p in s) / len(s)
            th = math.radians(rnd.uniform(-rot, rot)); c, si = math.cos(th), math.sin(th)
            ox, oy = rnd.uniform(-jitter, jitter), rnd.uniform(-jitter, jitter)
            s = [(cx + (x - cx) * c - (y - cy) * si + ox, cy + (x - cx) * si + (y - cy) * c + oy) for x, y in s]
        out.append([(x + shear * (y - A), y) for x, y in s])
    return out

# ------------------------------------------------------------------ brush
def circle_path(p, x, y, r, n=40):
    p.moveTo(x + r, y)
    for i in range(1, n):
        a = 2 * math.pi * i / n
        p.lineTo(x + r * math.cos(a), y + r * math.sin(a))
    p.close()

def brush(stroke, width):
    """Ink one centerline with a round pen (Skia's stroker: clean, notch-free outline)."""
    p = pathops.Path()
    if len(stroke) == 1:
        circle_path(p, stroke[0][0], stroke[0][1], width / 2 * 1.25, n=48)
        p.simplify(fix_winding=True, clockwise=True)
        return p
    p.moveTo(*stroke[0])
    for sg in split_corners(stroke):
        pts = resample_even(sg, 28.0)
        if len(pts) <= 2:
            p.lineTo(*pts[-1]); continue
        # quadratic B-spline: control points = samples, on-curve = midpoints
        for i in range(1, len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            end = b if i == len(pts) - 2 else ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            p.quadTo(a[0], a[1], end[0], end[1])
    p.stroke(width, pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4)
    p.convertConicsToQuads()
    p.simplify(fix_winding=True, clockwise=True)
    return p

def split_corners(pts, deg=25):
    segs, cur = [], [pts[0]]
    for i in range(1, len(pts) - 1):
        cur.append(pts[i])
        v1 = (pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]); v2 = (pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1])
        n1, n2 = math.hypot(*v1), math.hypot(*v2)
        if n1 and n2 and math.degrees(math.acos(max(-1, min(1, (v1[0]*v2[0] + v1[1]*v2[1]) / (n1 * n2))))) > deg:
            segs.append(cur); cur = [pts[i]]
    cur.append(pts[-1]); segs.append(cur)
    return segs

def resample_even(pts, step):
    """Even arc-length resampling that keeps sharp corners (turn > 25 deg) exactly."""
    if len(pts) < 2:
        return pts
    # split at corners
    segs, cur = [], [pts[0]]
    for i in range(1, len(pts) - 1):
        cur.append(pts[i])
        v1 = (pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]); v2 = (pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1])
        n1, n2 = math.hypot(*v1), math.hypot(*v2)
        if n1 and n2 and math.degrees(math.acos(max(-1, min(1, (v1[0]*v2[0] + v1[1]*v2[1]) / (n1 * n2))))) > 25:
            segs.append(cur); cur = [pts[i]]
    cur.append(pts[-1]); segs.append(cur)
    out = []
    for sg in segs:
        L = [0.0]
        for a, b in zip(sg, sg[1:]):
            L.append(L[-1] + math.dist(a, b))
        tot = L[-1]
        n = max(1, int(round(tot / step)))
        j = 0
        res = []
        for k in range(n + 1):
            t = tot * k / n
            while j < len(L) - 2 and L[j + 1] < t:
                j += 1
            seg = L[j + 1] - L[j] or 1
            u = (t - L[j]) / seg
            res.append((sg[j][0] + (sg[j + 1][0] - sg[j][0]) * u, sg[j][1] + (sg[j + 1][1] - sg[j][1]) * u))
        if out:
            res = res[1:]
        out.extend(res)
    return out

def brush_stamp(stroke, width):
    """Ink one centerline with a round pen, slightly heavier where the pen lands."""
    pts = stroke
    paths = []
    R0 = width / 2
    if len(pts) == 1:
        p = pathops.Path(); circle_path(p, pts[0][0], pts[0][1], R0 * 1.25); paths.append(p)
    else:
        L = [0.0]
        for a, b in zip(pts, pts[1:]):
            L.append(L[-1] + math.dist(a, b))
        tot = L[-1] or 1
        rad = [R0 * (1.05 - 0.10 * (l / tot)) for l in L]
        for i, (a, b) in enumerate(zip(pts, pts[1:])):
            d = math.dist(a, b)
            if d < 1e-6:
                continue
            nx, ny = -(b[1] - a[1]) / d, (b[0] - a[0]) / d
            ra, rb = rad[i], rad[i + 1]
            q = pathops.Path()
            q.moveTo(a[0] + nx * ra, a[1] + ny * ra); q.lineTo(b[0] + nx * rb, b[1] + ny * rb)
            q.lineTo(b[0] - nx * rb, b[1] - ny * rb); q.lineTo(a[0] - nx * ra, a[1] - ny * ra); q.close()
            paths.append(q)
        for i in range(len(pts)):
            turn = 0
            if 0 < i < len(pts) - 1:
                v1 = (pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]); v2 = (pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1])
                n1, n2 = math.hypot(*v1), math.hypot(*v2)
                if n1 and n2:
                    turn = math.degrees(math.acos(max(-1, min(1, (v1[0]*v2[0] + v1[1]*v2[1]) / (n1 * n2)))))
            if i in (0, len(pts) - 1) or turn > 6:
                c = pathops.Path(); circle_path(c, pts[i][0], pts[i][1], rad[i]); paths.append(c)
    b = pathops.OpBuilder(fix_winding=True, keep_starting_points=False)
    for q in paths:
        b.add(q, pathops.PathOp.UNION)
    res = b.resolve()
    res.simplify(fix_winding=True, clockwise=True)
    return res

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a; L = np.hypot(*ab)
    P = np.array(pts)
    if L == 0:
        d = np.hypot(*(P - a).T)
    else:
        d = np.abs(ab[0] * (P[:, 1] - a[1]) - ab[1] * (P[:, 0] - a[0])) / L
    i = int(np.argmax(d))
    if d[i] > eps:
        return rdp(pts[:i + 1], eps)[:-1] + rdp(pts[i:], eps)
    return [pts[0], pts[-1]]

def path_to_pen(path, pen, eps=0.6):
    from fontTools.pens.cu2quPen import Cu2QuPen
    path.draw(Cu2QuPen(pen, 0.5, reverse_direction=False))

def path_to_pen_poly(path, pen, eps=0.6):
    """Polygonal pathops result -> simplified closed polygons drawn as smooth quadratic outlines."""
    rec = RecordingPen(); path.draw(rec)
    contours, cur = [], []
    for op, args in rec.value:
        if op == 'moveTo':
            cur = [args[0]]
        elif op == 'lineTo':
            cur.append(args[0])
        elif op in ('qCurveTo', 'curveTo'):
            cur.extend(args)
        elif op in ('closePath', 'endPath'):
            if len(cur) > 2:
                contours.append(cur)
            cur = []
    for c in contours:
        c = c + [c[0]]
        s = rdp(c, eps)[:-1]
        if len(s) < 3:
            continue
        pen.moveTo(s[0])
        for p in s[1:]:
            pen.lineTo(p)
        pen.closePath()

# ------------------------------------------------------------------ copying Caveat's own outlines
def copy_glyph(name, pen, m=(1, 0, 0, 1, 0, 0), contours=None):
    rec = DecomposingRecordingPen(gs); gs[name].draw(rec)
    det = m[0] * m[3] - m[1] * m[2]
    tgt = TransformPen(pen, m)
    if det < 0:
        tgt = ReverseContourPen(tgt)
    # optionally pick contours by index
    idx, buf = 0, []
    for op, args in rec.value:
        buf.append((op, args))
        if op in ('closePath', 'endPath'):
            if contours is None or idx in contours:
                for o, a in buf:
                    getattr(tgt, o)(*a)
            idx += 1; buf = []

def gbounds(name, contours=None):
    rec = DecomposingRecordingPen(gs); gs[name].draw(rec)
    bp = BoundsPen(None); idx = 0; buf = []
    for op, args in rec.value:
        buf.append((op, args))
        if op in ('closePath', 'endPath'):
            if contours is None or idx in contours:
                for o, a in buf: getattr(bp, o)(*a)
            idx += 1; buf = []
    return bp.bounds

def gcenter(name, contours=None):
    b = gbounds(name, contours); return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)

# ------------------------------------------------------------------ glyph specs
# piece kinds:
#   ('pen', [strokes], width)            hand-drawn centerlines (wobbled, inked, exported as reference)
#   ('copy', glyphname, matrix, ref)     a Caveat outline, transformed; ref = its centerlines for the dataset
SPECS = {}
def G(cp, name=None, lsb=55, rsb=30, adv=None):
    def deco(fn):
        SPECS[cp] = dict(fn=fn, name=name or ('uni%04X' % cp if cp < 0x10000 else 'u%05X' % cp), lsb=lsb, rsb=rsb, adv=adv)
        return fn
    return deco

def pen(*strokes, w=W):
    return ('pen', list(strokes), w)

def dot(x, y, scale=1.0, src='period'):
    cx, cy = gcenter(src)
    return ('copy', src, (scale, 0, 0, scale, x - cx * scale, y - cy * scale), [[(x, y)]])

def circ(cx, cy, r, ry=None, start=95, sweep=372):
    return arc(cx, cy, r, ry or r, start, start + sweep)

h = 158  # half size of a binary operator (Caveat '+')
X0, X1, XC = 250 - h, 250 + h, 250

def bars(*ys, x0=X0, x1=X1):
    return [line((x0, y), (x1, y)) for y in ys]

def slash_through(cy=A, half=215, cx=XC, lean=0.42):
    return line((cx - half * lean, cy - half), (cx + half * lean, cy + half))

# --- arithmetic / relations
@G(0x2213)
def _(): return [pen(line((X0, A + 180), (X1, A + 180)), line((X0, A - 40), (X1, A - 40)), line((XC, A + 75), (XC, A - 195)))]
@G(0x2261)
def _(): return [pen(*bars(A + 130, A, A - 130))]
@G(0x2262)
def _(): return [pen(*bars(A + 130, A, A - 130), slash_through(half=235))]
@G(0x2243)
def _(): return [pen(wave(X0, X1, A + 75, 36), line((X0, A - 75), (X1, A - 75)))]
@G(0x2245)
def _(): return [pen(wave(X0, X1, A + 150, 34), *bars(A + 5, A - 125))]
@G(0x2249)
def _(): return [('copy', 'approxequal', (1, 0, 0, 1, 0, 0), None), pen(line((205, A - 220), (395, A + 230)))]
@G(0x226E)
def _(): return [('copy', 'less', (1, 0, 0, 1, 0, 0), [[(432, 374), (155, 228), (432, 82)]]), pen(line((215, A - 230), (390, A + 235)))]
@G(0x226F)
def _(): return [('copy', 'greater', (1, 0, 0, 1, 0, 0), [[(172, 365), (448, 218), (172, 73)]]), pen(line((215, A - 230), (390, A + 235)))]
@G(0x223C)
def _():
    cx, cy = gcenter('asciitilde')
    return [('copy', 'asciitilde', (1, 0, 0, 1, 0, A - cy), [wave(110, 470, A, 40)])]
@G(0x221D, lsb=50)
def _():
    return [pen(spline((440, A + 120), (345, A + 72), (255, A - 2), (175, A - 92), (100, A - 62), (88, A + 40),
                       (160, A + 100), (250, A + 2), (340, A - 72), (445, A - 120)))]
@G(0x221E, lsb=45, rsb=35)
def _():
    pts = []
    for i in range(0, 361, 3):
        t = math.pi / 2 + math.radians(i)
        d = 1 + math.sin(t) ** 2
        pts.append((265 + 215 * math.cos(t) / d, A - 1.55 * 215 * math.sin(t) * math.cos(t) / d))
    return [pen(pts)]
@G(0x221A, lsb=40, rsb=10)
def _(): return [pen(poly((45, 245), (105, 290), (200, -15), (335, 720), (590, 720)))]

def small3(cx, cy, s=1.0):
    r = 44 * s
    top = arc(cx, cy + r, r * 1.05, r, 150, -85)
    bot = arc(cx, cy - r * 0.95, r * 1.2, r * 1.05, 90, -160)
    return cat(top, bot)
@G(0x221B, lsb=40, rsb=10)
def _():
    return [pen(small3(110, 515)), pen(poly((45, 245), (105, 290), (200, -15), (335, 720), (590, 720)))[1][0:1] and
            pen(poly((45, 245), (105, 290), (200, -15), (335, 720), (590, 720)))][0:0] + \
           [pen(small3(105, 510), w=42), pen(poly((45, 245), (105, 290), (200, -15), (335, 720), (590, 720)))]
@G(0x221C, lsb=40, rsb=10)
def _():
    four = [poly((150, 600), (60, 455), (175, 455)), line((140, 545), (130, 400))]
    return [pen(*four, w=42), pen(poly((45, 245), (105, 290), (200, -15), (335, 720), (590, 720)))]

# --- big operators
@G(0x2211, lsb=45, rsb=35)
def _(): return [pen(poly((470, 680), (85, 685), (300, 270), (80, -135), (480, -130)))]
@G(0x220F, lsb=40, rsb=35)
def _(): return [pen(line((70, 680), (520, 688)), line((165, 682), (160, -130)), line((425, 686), (432, -130)))]
@G(0x2210, lsb=40, rsb=35)
def _(): return [pen(line((165, 690), (160, -125)), line((425, 690), (432, -125)), line((70, -128), (520, -125)))]
INTEG = [(455, 680), (420, 742), (350, 750), (302, 682), (278, 520), (257, 250), (236, 20), (205, -130), (140, -190), (75, -140)]
@G(0x222B, lsb=35, rsb=20)
def _(): return [pen(spline(*INTEG))]
@G(0x222C, lsb=35, rsb=20)
def _(): return [pen(spline(*INTEG), spline(*[(x + 175, y) for x, y in INTEG]))]
@G(0x222D, lsb=35, rsb=20)
def _(): return [pen(spline(*INTEG), spline(*[(x + 175, y) for x, y in INTEG]), spline(*[(x + 350, y) for x, y in INTEG]))]
@G(0x222E, lsb=35, rsb=20)
def _(): return [pen(spline(*INTEG), circ(266, 250, 88, 95))]
@G(0x2202, lsb=40, rsb=20)
def _():
    return [pen(spline((165, 540), (235, 620), (340, 630), (410, 545), (422, 385), (385, 195), (305, 45), (210, 2),
                       (128, 42), (110, 160), (160, 268), (262, 308), (348, 282), (408, 228)))]
@G(0x2206, lsb=35, rsb=25)
def _(): return [pen(poly((285, 655), (60, 0), (505, 4), (278, 640)))]
@G(0x2207, lsb=35, rsb=25)
def _(): return [pen(poly((60, 650), (505, 655), (285, 0), (68, 640)))]

# --- small operators
@G(0x2218)
def _(): return [pen(circ(XC, A, 88))]
@G(0x22C5, lsb=45, rsb=40)
def _():
    cx, cy = gcenter('periodcentered')
    return [('copy', 'periodcentered', (1, 0, 0, 1, 0, A + 30 - cy), [[(cx, A + 30)]])]
@G(0x2217, lsb=55, rsb=35)
def _():
    cx, cy = gcenter('asterisk')
    return [('copy', 'asterisk', (1, 0, 0, 1, -40, A + 10 - cy), None)]
@G(0x2219)  # bullet operator exists? (keep if missing)
def _(): return [pen([(XC, A)], w=95)]

# --- bars
BAR_REF = [[(410, 735), (135, -118)]]
@G(0x2016, lsb=60, rsb=10)
def _(): return [('copy', 'bar', (1, 0, 0, 1, 0, 0), BAR_REF), ('copy', 'bar', (1, 0, 0, 1, 150, 0), [[(560, 735), (285, -118)]])]
@G(0x2225, lsb=60, rsb=10)
def _(): return [('copy', 'bar', (1, 0, 0, 1, 0, 0), BAR_REF), ('copy', 'bar', (1, 0, 0, 1, 150, 0), [[(560, 735), (285, -118)]])]
def short_bar(dx=0):
    by = (gbounds('bar')[1] + gbounds('bar')[3]) / 2
    s = 0.78
    m = (1, 0, 0, s, dx, A - by * s)
    ref = [[(410 + dx - (735 - by) * 0.0, A + (735 - by) * s), (135 + dx, A + (-118 - by) * s)]]
    return ('copy', 'bar', m, ref)
@G(0x2223, lsb=60, rsb=10)
def _(): return [short_bar()]
@G(0x2224, lsb=50, rsb=10)
def _(): return [short_bar(), pen(line((170, A - 85), (385, A + 95)))]
@G(0x2226, lsb=50, rsb=10)
def _(): return [('copy', 'bar', (1, 0, 0, 1, 0, 0), BAR_REF), ('copy', 'bar', (1, 0, 0, 1, 150, 0), [[(560, 735), (285, -118)]]),
                 pen(line((150, 215), (520, 395)))]

# --- logic
@G(0x2227)
def _(): return [pen(poly((72, -5), (250, 455), (428, -5)))]
@G(0x2228)
def _(): return [pen(poly((72, 455), (250, -5), (428, 455)))]
@G(0x22BB)
def _(): return [pen(poly((92, 540), (250, 120), (408, 540)), line((80, -20), (420, -15)))]
@G(0x22BC)
def _(): return [pen(poly((92, -10), (250, 420), (408, -10)), line((80, 560), (420, 565)))]
@G(0x22BD)
def _(): return [pen(poly((92, 420), (250, -10), (408, 420)), line((80, 560), (420, 565)))]
R_CIRC = 188
ARM = R_CIRC - W - 8   # arms stop just short of the ring (touching contours confuse the ink graph)
@G(0x2295, lsb=45, rsb=30)
def _(): return [pen(circ(XC, A, R_CIRC), line((XC - ARM, A), (XC + ARM, A)), line((XC, A + ARM), (XC, A - ARM)))]
@G(0x2296, lsb=45, rsb=30)
def _(): return [pen(circ(XC, A, R_CIRC), line((XC - ARM, A), (XC + ARM, A)))]
@G(0x2297, lsb=45, rsb=30)
def _(): k = ARM / 1.414; return [pen(circ(XC, A, R_CIRC), line((XC - k, A + k), (XC + k, A - k)), line((XC + k, A + k), (XC - k, A - k)))]
@G(0x2299, lsb=45, rsb=30)
def _(): return [pen(circ(XC, A, R_CIRC)), dot(XC, A, 0.95)]
@G(0x2298, lsb=45, rsb=30)
def _(): k = 130; return [pen(circ(XC, A, R_CIRC), line((XC - k, A - k), (XC + k, A + k)))]

# arrows
def head_r(x, y, s=1.0): return poly((x - 125 * s, y + 118 * s), (x, y), (x - 125 * s, y - 112 * s))
def head_l(x, y, s=1.0): return poly((x + 125 * s, y + 118 * s), (x, y), (x + 125 * s, y - 112 * s))
@G(0x2192, lsb=45, rsb=30)
def _(): return [pen(line((60, A), (540, A + 4)), head_r(548, A + 4))]
@G(0x2190, lsb=45, rsb=30)
def _(): return [pen(line((540, A + 4), (60, A)), head_l(52, A))]
@G(0x2194, lsb=45, rsb=30)
def _(): return [pen(line((60, A), (610, A + 4)), head_l(52, A), head_r(618, A + 4))]
@G(0x2191, lsb=55, rsb=40)
def _(): return [pen(line((250, -60), (250, 560)), poly((135, 440), (250, 568), (365, 445)))]
@G(0x2193, lsb=55, rsb=40)
def _(): return [pen(line((250, 560), (250, -60)), poly((135, 60), (250, -68), (365, 55)))]
@G(0x21A6, lsb=45, rsb=30)
def _(): return [pen(line((60, A + 115), (60, A - 115)), line((60, A), (540, A + 4)), head_r(548, A + 4))]
def dhead_r(x, y): return poly((x - 170, y + 180), (x, y), (x - 170, y - 172))
def dhead_l(x, y): return poly((x + 170, y + 180), (x, y), (x + 170, y - 172))
@G(0x21D2, lsb=45, rsb=30)
def _(): return [pen(line((60, A + 70), (470, A + 72)), line((60, A - 70), (470, A - 68)), dhead_r(548, A + 2))]
@G(0x21D0, lsb=45, rsb=30)
def _(): return [pen(line((540, A + 70), (130, A + 72)), line((540, A - 70), (130, A - 68)), dhead_l(52, A + 2))]
@G(0x21D4, lsb=45, rsb=30)
def _(): return [pen(line((120, A + 70), (560, A + 72)), line((120, A - 70), (560, A - 68)), dhead_l(42, A + 2), dhead_r(638, A + 2))]

# quantifiers & turnstiles
@G(0x2200, lsb=45, rsb=30)
def _(): return [pen(poly((48, 645), (252, -2), (456, 645)), line((140, 318), (368, 321)))]
@G(0x2203, lsb=50, rsb=25)
def _(): return [pen(poly((90, 640), (418, 645), (420, 2), (88, 0)), line((135, 322), (418, 325)))]
@G(0x2204, lsb=40, rsb=25)
def _(): return [pen(poly((90, 640), (418, 645), (420, 2), (88, 0)), line((135, 322), (418, 325)), line((95, -95), (420, 740)))]
@G(0x2234)
def _(): return [dot(250, 390), dot(100, 60), dot(400, 60)]
@G(0x2235)
def _(): return [dot(100, 390), dot(400, 390), dot(250, 60)]
@G(0x2236, lsb=50, rsb=40)
def _(): return [dot(150, A + 115), dot(150, A - 115)]
@G(0x2237)
def _(): return [dot(100, A + 115), dot(100, A - 115), dot(360, A + 115), dot(360, A - 115)]
@G(0x22A4)
def _(): return [pen(line((70, 600), (440, 604)), line((255, 600), (255, 0)))]
@G(0x22A5)
def _(): return [pen(line((255, 600), (255, 4)), line((70, 0), (440, 4)))]
@G(0x22A2)
def _(): return [pen(line((100, 600), (100, 0)), line((100, 300), (430, 303)))]
@G(0x22A3)
def _(): return [pen(line((400, 600), (400, 0)), line((70, 300), (400, 303)))]
@G(0x22A8)
def _(): return [pen(line((100, 600), (100, 0)), line((100, 385), (430, 388)), line((100, 215), (430, 218)))]

# sets
def elem(cx=290, cy=A, rx=195, ry=208, right=440):
    return cat([(right, cy + ry)], arc(cx, cy, rx, ry, 90, 270), [(right, cy - ry)])
@G(0x2208)
def _(): return [pen(elem(), line((100, A), (410, A + 2)))]
@G(0x2209)
def _(): return [pen(elem(), line((100, A), (410, A + 2)), line((175, A - 265), (380, A + 275)))]
@G(0x220B)
def _(): return [pen(*mirror_x([elem(), line((100, A), (410, A + 2))]))]
@G(0x220A)
def _(): return [pen(tx(elem(), sx=0.72, sy=0.72, cx=250, cy=A), tx(line((100, A), (410, A + 2)), sx=0.72, sy=0.72, cx=250, cy=A), w=56)]
@G(0x220C)
def _(): return [pen(*mirror_x([elem(), line((100, A), (410, A + 2))]), line((175, A - 265), (380, A + 275)))]
@G(0x2282)
def _(): return [pen(elem(ry=200))]
@G(0x2283)
def _(): return [pen(*mirror_x([elem(ry=200)]))]
@G(0x2284)
def _(): return [pen(elem(ry=200), line((175, A - 265), (380, A + 275)))]
@G(0x2285)
def _(): return [pen(*mirror_x([elem(ry=200)]), line((175, A - 265), (380, A + 275)))]
SUBE = lambda: elem(cy=A + 70, ry=178)
@G(0x2286)
def _(): return [pen(SUBE(), line((95, A - 205), (440, A - 202)))]
@G(0x2287)
def _(): return [pen(*mirror_x([SUBE(), line((95, A - 205), (440, A - 202))]))]
@G(0x228A)
def _(): return [pen(SUBE(), line((95, A - 205), (440, A - 202)), line((235, A - 300), (325, A - 110)))]
@G(0x228B)
def _(): return [pen(*mirror_x([SUBE(), line((95, A - 205), (440, A - 202))]), line((235, A - 300), (325, A - 110)))]
@G(0x222A)
def _(): return [pen(cat([(98, 445)], arc(255, 190, 157, 192, 180, 360), [(412, 445)]))]
@G(0x2229)
def _(): return [pen(cat([(98, -5)], arc(255, 250, 157, 192, 180, 0), [(412, -5)]))]
@G(0x2205, lsb=45, rsb=25)
def _(): return [pen(circ(270, 290, 175, 252), line((92, -75), (452, 655)))]
@G(0x2216, lsb=45, rsb=25)
def _(): return [pen(line((105, 565), (395, -45)))]
@G(0x2201)
def _(): return [pen(cat(arc(260, 300, 170, 290, 60, 300)))]

# floor / ceiling
@G(0x230A, lsb=80, rsb=0)
def _(): return [pen(poly((150, 735), (150, -130), (335, -128)))]
@G(0x230B, lsb=20, rsb=40)
def _(): return [pen(poly((235, 735), (235, -130), (50, -128)))]
@G(0x2308, lsb=80, rsb=0)
def _(): return [pen(poly((335, 738), (150, 735), (150, -130)))]
@G(0x2309, lsb=20, rsb=40)
def _(): return [pen(poly((50, 738), (235, 735), (235, -130)))]

@G(0x226A, lsb=60, rsb=0)
def _(): return [('copy', 'less', (1, 0, 0, 1, 0, 0), [[(432, 374), (155, 228), (432, 82)]]),
                 ('copy', 'less', (1, 0, 0, 1, 200, 0), [[(632, 374), (355, 228), (632, 82)]])]
@G(0x226B, lsb=60, rsb=0)
def _(): return [('copy', 'greater', (1, 0, 0, 1, 0, 0), [[(172, 365), (448, 218), (172, 73)]]),
                 ('copy', 'greater', (1, 0, 0, 1, 200, 0), [[(372, 365), (648, 218), (372, 73)]])]
@G(0x2254, lsb=50, rsb=30)
def _(): return [dot(100, A + 72, 0.8), dot(100, A - 72, 0.8), pen(line((200, A + 72), (480, A + 74)), line((200, A - 72), (480, A - 70)))]
@G(0x225C)
def _(): return [pen(*bars(A - 10, A - 140)), pen(poly((250, A + 270), (178, A + 85), (322, A + 88), (246, A + 258)), w=44)]
@G(0x2250)
def _(): return [pen(*bars(A - 10, A - 140)), dot(250, A + 150, 0.85)]
@G(0x2259)
def _(): return [pen(*bars(A - 10, A - 140)), pen(poly((165, A + 90), (250, A + 270), (335, A + 90)), w=44)]
@G(0x2220, lsb=45, rsb=25)
def _(): return [pen(poly((445, 470), (80, 2), (485, 5)))]
@G(0x2221, lsb=45, rsb=25)
def _(): return [pen(poly((445, 470), (80, 2), (485, 5)), arc(80, 2, 250, 250, 47, -8))]
@G(0x22C6)
def _(): # star operator
    pts = [(XC + 150 * math.sin(math.radians(144 * i)), A + 150 * math.cos(math.radians(144 * i))) for i in range(6)]
    return [pen(*[line(pts[i], pts[i + 1]) for i in range(5)], w=50)]
@G(0x2032 + 2, name='uni2034', lsb=60, rsb=10)
def _():
    return [('copy', 'minute', (1, 0, 0, 1, 0, 0), None), ('copy', 'minute', (1, 0, 0, 1, 130, 0), None), ('copy', 'minute', (1, 0, 0, 1, 260, 0), None)]

@G(0x03C0, lsb=35, rsb=20)
def _(): return [pen(spline((40, 360), (150, 378), (300, 386), (455, 402)),
                     spline((168, 382), (162, 250), (142, 95), (115, 0)),
                     spline((338, 388), (332, 250), (342, 95), (375, 12), (430, 24)))]

# --- superscripts / subscripts
SUP_Y, SUB_Y, SH = 525, -20, 112
def sup_plus(cy): return [line((160 - SH, cy), (160 + SH, cy)), line((160, cy + SH), (160, cy - SH))]
def sup_minus(cy): return [line((160 - SH, cy), (160 + SH, cy))]
def sup_eq(cy): return [line((160 - SH, cy + 50), (160 + SH, cy + 50)), line((160 - SH, cy - 50), (160 + SH, cy - 50))]
def sup_lp(cy): return [spline((215, cy + 235), (150, cy + 140), (128, cy), (150, cy - 140), (215, cy - 235))]
def sup_rp(cy): return [spline((105, cy + 235), (170, cy + 140), (192, cy), (170, cy - 140), (105, cy - 235))]
for cp, f, cy in [(0x207A, sup_plus, SUP_Y), (0x207B, sup_minus, SUP_Y), (0x207C, sup_eq, SUP_Y), (0x207D, sup_lp, SUP_Y), (0x207E, sup_rp, SUP_Y),
                  (0x208A, sup_plus, SUB_Y), (0x208B, sup_minus, SUB_Y), (0x208C, sup_eq, SUB_Y), (0x208D, sup_lp, SUB_Y), (0x208E, sup_rp, SUB_Y)]:
    G(cp, lsb=None, rsb=None, adv=320)((lambda f=f, cy=cy: [pen(*[tx(s_, dx=210 if cy > 0 else 40) for s_ in f(cy)], w=WSUP)]))
@G(0x207F, lsb=None, rsb=None, adv=320)
def _(): return [pen(*[tx(s_, dx=200) for s_ in (line((105, 525), (98, 305)), spline((100, 410), (140, 488), (205, 505), (250, 460), (255, 380), (262, 305)))], w=WSUP)]

@G(0x2099, lsb=None, rsb=None, adv=320)
def _(): return [pen(*[tx(s_, dx=30, dy=-545) for s_ in (line((105, 525), (98, 305)), spline((100, 410), (140, 488), (205, 505), (250, 460), (255, 380), (262, 305)))], w=WSUP)]

# --- vulgar fractions from Caveat's own superior / inferior figures + the ½ fraction bar
SUPD = {d: cmap[ord(c)] for d, c in zip('0123456789', '⁰¹²³⁴⁵⁶⁷⁸⁹')}
SUBD = {d: cmap[ord(c)] for d, c in zip('0123456789', '₀₁₂₃₄₅₆₇₈₉')}
def frac(num, den):
    pieces = [('copy', 'onehalf', (1, 0, 0, 1, 0, 0), None)]
    pieces[0] = ('copyc', 'onehalf', (1, 0, 0, 1, 0, 0), [0])   # the slash only
    nx = 319  # numerator centre x in ½
    ncx, ncy = gcenter(SUPD[num])
    pieces.append(('copy', SUPD[num], (1, 0, 0, 1, nx - ncx, -100), None))
    x = 640 if len(den) == 1 else 600
    for i, d in enumerate(den):
        dcx, _ = gcenter(SUBD[d])
        pieces.append(('copy', SUBD[d], (1, 0, 0, 1, x + i * 190 - dcx, 200), None))
    return pieces
for cp, nd in {0x2155: '1/5', 0x2156: '2/5', 0x2157: '3/5', 0x2158: '4/5', 0x2159: '1/6', 0x215A: '5/6',
               0x2150: '1/7', 0x2151: '1/9', 0x2152: '1/10'}.items():
    n, d = nd.split('/')
    G(cp, lsb=None, rsb=None, adv=800 if len(d) == 1 else 960)((lambda n=n, d=d: frac(n, d)))

# --- double-struck letters: Caveat's letter + a second, parallel pen line
def ink_runs(gname):
    """Rasterise a glyph (1 unit = 1 px) and return, per row y, the x-runs of ink."""
    from PIL import Image, ImageDraw
    rec = DecomposingRecordingPen(gs); gs[gname].draw(rec)
    p = pathops.Path(); rec.replay(p.getPen())
    # flatten with pathops -> points
    img = Image.new('L', (1200, 1400), 0); d = ImageDraw.Draw(img)
    flat = RecordingPen()
    from fontTools.pens.basePen import BasePen
    class Flat(BasePen):
        def __init__(s): super().__init__(None); s.polys = []; s.cur = []
        def _moveTo(s, p): s.cur = [p]
        def _lineTo(s, p): s.cur.append(p)
        def _curveToOne(s, a, b, c):
            p0 = s.cur[-1]
            for i in range(1, 17):
                t = i / 16
                s.cur.append(tuple((1-t)**3*p0[k] + 3*(1-t)**2*t*a[k] + 3*(1-t)*t*t*b[k] + t**3*c[k] for k in range(2)))
        def _closePath(s): s.polys.append(s.cur); s.cur = []
    fp = Flat(); p.draw(fp)
    arr = np.zeros((1400, 1200), bool)
    for poly_ in fp.polys:
        m = Image.new('L', (1200, 1400), 0)
        ImageDraw.Draw(m).polygon([(x + 200, 1000 - y) for x, y in poly_], fill=255)
        arr ^= np.array(m) > 127
    return arr

def left_stem(gname, y0, y1):
    arr = ink_runs(gname); pts = []
    for y in range(y0, y1, 8):
        row = arr[1000 - y]
        xs = np.nonzero(row)[0]
        if len(xs) == 0: continue
        x = xs[0]; e = x
        while e + 1 < len(row) and row[e + 1]: e += 1
        pts.append(((x + e) / 2 - 200, y))
    return pts

def fit_line(pts):
    ys = np.array([p[1] for p in pts]); xs = np.array([p[0] for p in pts])
    k, b = np.polyfit(ys, xs, 1)
    return k, b

def double_struck(letter, y0, y1, dx, curved=False, w=54):
    gname = cmap[ord(letter)]
    pts = left_stem(gname, y0, y1)
    if curved:
        sm = []
        for i in range(len(pts)):
            win = pts[max(0, i - 3): i + 4]
            sm.append((sum(p[0] for p in win) / len(win) + dx, pts[i][1]))
        stroke = sm[::-1]
    else:
        k, b = fit_line(pts)
        stroke = [(k * y1 + b + dx, y1), (k * y0 + b + dx, y0)]
    return [('copy', gname, (1, 0, 0, 1, 0, 0), None), ('rawpen', [stroke], w)]

@G(0x211D, lsb=None, rsb=None)
def _(): return double_struck('R', 20, 600, 105, w=50)
@G(0x2115, lsb=None, rsb=None)
def _(): return double_struck('N', 0, 640, 105, w=50)
@G(0x2102, lsb=None, rsb=None)
def _(): return double_struck('C', 120, 560, 112, curved=True, w=48)
@G(0x211A, lsb=None, rsb=None)
def _(): return double_struck('Q', 140, 540, 112, curved=True, w=48)
@G(0x2124, lsb=None, rsb=None)
def _():
    gname = cmap[ord('Z')]; arr = ink_runs(gname); pts = []
    for y in range(170, 470, 8):
        xs = np.nonzero(arr[1000 - y])[0]
        if len(xs): pts.append(((xs[0] + xs[-1]) / 2 - 200, y))
    k, b = fit_line(pts)
    return [('copy', gname, (1, 0, 0, 1, 0, 0), None), ('rawpen', [[(k * 505 + b + 100, 505), (k * 120 + b + 100, 120)]], 50)]


# ------------------------------------------------------------------ Greek (added in Caveat Math 1.1)
# Lowercase: x-height ~380, ascender ~650, descender ~-210 (Caveat's own a, d, p).
# Capitals: cap height ~650. Every stroke starts where a hand starts it.
GREEK_LC = dict(lsb=45, rsb=25)
GREEK_UC = dict(lsb=50, rsb=30)

@G(0x03B1, **GREEK_LC)   # alpha: tail-tip at top right, down through the bowl, back up and out
def _(): return [pen(spline((395, 375), (350, 215), (285, 75), (195, 12), (110, 60), (95, 215), (170, 360), (270, 350),
                            (340, 200), (390, 50), (450, 5)))]
@G(0x03B2, **GREEK_LC)   # beta: from the descender up the stem, two bumps on the right
def _(): return [pen(cat(spline((120, -205), (118, 150), (125, 470), (165, 610), (245, 655), (325, 615), (335, 520),
                                (275, 445), (195, 425)),
                         spline((195, 425), (320, 395), (385, 280), (365, 120), (270, 25), (165, 30), (125, 90))))]
@G(0x03B3, **GREEK_LC)   # gamma: left arm into a small loop below the baseline, then the right arm
def _(): return [pen(spline((55, 315), (115, 372), (175, 300), (225, 120), (240, -90), (220, -195), (190, -150),
                            (215, -20), (300, 220), (395, 380)))]
@G(0x03B4, **GREEK_LC)   # delta: hook at the top, down into the bowl
def _(): return [pen(spline((365, 615), (265, 655), (175, 610), (180, 525), (290, 440), (375, 320), (365, 130),
                            (265, 20), (150, 25), (95, 150), (140, 290), (245, 400)))]
@G(0x03B5, **GREEK_LC)   # varepsilon (ε): two bowls, one stroke
def _(): return [pen(cat(spline((345, 330), (250, 380), (140, 345), (130, 260), (230, 205)),
                         spline((230, 205), (130, 190), (80, 95), (150, 15), (280, 10), (365, 60))))]
@G(0x03F5, **GREEK_LC)   # lunate epsilon (ϵ, TeX \epsilon): arc, then the middle bar
def _(): return [pen(spline((360, 355), (240, 375), (130, 300), (100, 185), (140, 65), (250, 10), (365, 30)),
                     line((115, 195), (305, 198)))]
@G(0x03B6, **GREEK_LC)   # zeta
def _(): return [pen(cat(spline((140, 640), (220, 655), (330, 650)),
                         spline((330, 650), (190, 520), (100, 330), (120, 130), (235, 40), (330, 0), (335, -95),
                                (270, -195))))]
@G(0x03B7, **GREEK_LC)   # eta: short stem, then the arch with a long right leg
def _(): return [pen(spline((70, 330), (110, 380), (122, 250), (115, 0)),
                     spline((122, 250), (195, 360), (290, 380), (345, 300), (350, 100), (345, -205)))]
@G(0x03B8, **GREEK_LC)   # theta: tall oval from the top, counterclockwise, then the bar
def _(): return [pen(circ(240, 325, 150, 325, start=90, sweep=368), line((100, 330), (380, 332)))]
@G(0x03D1, **GREEK_LC)   # vartheta (ϑ)
def _(): return [pen(spline((50, 290), (110, 360), (160, 270), (150, 90), (205, 5), (300, 60), (345, 260), (350, 500),
                            (300, 640), (215, 630), (195, 500), (280, 390), (390, 375), (460, 390)))]
@G(0x03B9, lsb=55, rsb=30)  # iota
def _(): return [pen(spline((150, 375), (142, 180), (150, 45), (200, 0), (265, 25)))]
@G(0x03BA, **GREEK_LC)   # kappa: stem, then the arm in one stroke
def _(): return [pen(line((115, 375), (105, 0)),
                     cat(spline((345, 365), (250, 300), (130, 195)), spline((130, 195), (240, 120), (360, 0))))]
@G(0x03BB, **GREEK_LC)   # lambda: long stroke from top left to bottom right, then the short leg
def _(): return [pen(spline((80, 630), (150, 640), (210, 520), (300, 230), (385, 0)),
                     line((240, 405), (60, 0)))]
@G(0x03BD, **GREEK_LC)   # nu
def _(): return [pen(cat(spline((60, 345), (110, 375), (150, 250), (190, 0)),
                         spline((190, 0), (300, 150), (360, 270), (375, 380))))]
@G(0x03BE, **GREEK_LC)   # xi: three bowls stacked, one stroke
def _(): return [pen(cat(spline((140, 650), (230, 660), (330, 655)),
                         spline((330, 655), (210, 620), (165, 545), (230, 485), (310, 475)),
                         spline((310, 475), (180, 445), (105, 340), (130, 200), (230, 110)),
                         spline((230, 110), (150, 90), (130, 20), (230, -5), (325, -50), (320, -140), (260, -200))))]
@G(0x03BF, lsb=None, rsb=None)  # omicron = Caveat's o
def _(): return [('copy', 'o', (1, 0, 0, 1, 0, 0), None)]
@G(0x03D6, **GREEK_LC)   # varpi (ϖ)
def _(): return [pen(spline((40, 360), (230, 375), (470, 385)),
                     cat(spline((105, 330), (80, 150), (150, 10), (250, 90), (260, 200)),
                         spline((260, 200), (290, 70), (360, 5), (440, 130), (420, 330))))]
@G(0x03C1, **GREEK_LC)   # rho: up from the descender, round the bowl clockwise
def _(): return [pen(spline((115, -210), (112, 30), (125, 220), (180, 345), (270, 380), (355, 300), (360, 125),
                            (275, 15), (170, 20), (115, 100)))]
@G(0x03F1, **GREEK_LC)   # varrho (ϱ): bowl first, then the tail curling right
def _(): return [pen(spline((120, 120), (190, 25), (300, 20), (365, 130), (355, 300), (270, 380), (175, 335),
                            (120, 200), (110, 0), (130, -140), (230, -175), (380, -160)))]
@G(0x03C3, **GREEK_LC)   # sigma: the bar from the right, round the bowl
def _(): return [pen(spline((440, 372), (320, 368), (215, 360), (110, 250), (120, 80), (230, 10), (335, 70),
                            (360, 220), (300, 345), (215, 360)))]
@G(0x03C2, **GREEK_LC)   # final sigma (ς)
def _(): return [pen(spline((370, 345), (255, 380), (140, 310), (110, 150), (175, 45), (300, 0), (335, -90),
                            (275, -185)))]
@G(0x03C4, **GREEK_LC)   # tau: bar, then the stem with a small foot
def _(): return [pen(line((50, 360), (410, 372)), spline((235, 368), (225, 180), (230, 50), (280, 0), (345, 25)))]
@G(0x03C5, **GREEK_LC)   # upsilon
def _(): return [pen(spline((65, 330), (115, 375), (125, 150), (200, 20), (315, 30), (380, 170), (380, 300),
                            (345, 380)))]
@G(0x03D5, **GREEK_LC)   # phi (ϕ, TeX \phi): oval, then the stem through it
def _(): return [pen(circ(250, 190, 155, 185, start=90, sweep=368), line((262, 590), (238, -210)))]
@G(0x03C6, **GREEK_LC)   # varphi (φ): loop on the left, round the right, down the stem
def _(): return [pen(spline((120, 330), (75, 200), (110, 70), (230, 5), (370, 60), (410, 200), (370, 340),
                            (290, 375), (240, 300), (240, 100), (235, -210)))]
@G(0x03C7, **GREEK_LC)   # chi
def _(): return [pen(spline((55, 340), (120, 375), (190, 250), (300, -50), (380, -205)),
                     line((370, 370), (70, -195)))]
@G(0x03C8, **GREEK_LC)   # psi: the cup, then the stem
def _(): return [pen(spline((60, 320), (110, 375), (115, 170), (190, 40), (300, 35), (385, 150), (390, 300),
                            (355, 380)),
                     line((262, 640), (238, -210)))]
@G(0x03C9, **GREEK_LC)   # omega
def _(): return [pen(cat(spline((130, 370), (75, 230), (100, 60), (180, 5), (250, 80), (262, 220)),
                         spline((262, 220), (290, 70), (360, 5), (440, 70), (460, 230), (400, 370))))]

def penC(*strokes, w=W, k=0.09):
    """A capital: Caveat's capitals lean further than its symbols, so add a little more shear."""
    return ('pen', [[(x + k * y, y) for x, y in st] for st in strokes], w)

# capitals
@G(0x0393, **GREEK_UC)   # Gamma
def _(): return [penC(line((130, 655), (122, 0)), line((115, 652), (455, 660)))]
@G(0x0394, lsb=35, rsb=25)   # Delta (same hand as the increment sign)
def _(): return [penC(poly((285, 655), (60, 0), (505, 4), (278, 640)))]
@G(0x0398, **GREEK_UC)   # Theta
def _(): return [penC(circ(290, 325, 215, 335, start=95, sweep=368), line((175, 330), (405, 333)))]
@G(0x039B, **GREEK_UC)   # Lambda
def _(): return [penC(poly((55, 0), (275, 660), (500, 0)))]
@G(0x039E, **GREEK_UC)   # Xi
def _(): return [penC(line((85, 652), (470, 660)), line((150, 330), (405, 334)), line((75, 0), (480, 6)))]
@G(0x03A0, **GREEK_UC)   # Pi: left leg, then the top bar running into the right leg
def _(): return [penC(line((150, 650), (145, 0)), poly((95, 650), (435, 660), (430, 0)))]
@G(0x03A3, **GREEK_UC)   # Sigma
def _(): return [penC(poly((455, 652), (80, 658), (295, 330), (75, 2), (465, 6)))]
@G(0x03A5, **GREEK_UC)   # Upsilon: left arm curling down into the stem, then the right arm
def _(): return [penC(spline((55, 560), (125, 655), (230, 590), (272, 380), (268, 0)),
                     spline((495, 560), (425, 655), (320, 590), (278, 400)))]
@G(0x03A6, **GREEK_UC)   # Phi: oval, then the stem
def _(): return [penC(circ(285, 330, 225, 185, start=90, sweep=368), line((290, 660), (280, 0)))]
@G(0x03A8, **GREEK_UC)   # Psi: the cup, then the stem
def _(): return [penC(spline((55, 575), (80, 370), (170, 245), (285, 225), (400, 245), (485, 370), (505, 575)),
                     line((285, 665), (278, 0)))]
@G(0x03A9, **GREEK_UC)   # Omega: one stroke, foot to foot
def _(): return [penC(cat(spline((55, 5), (205, 10)),
                         spline((205, 10), (115, 170), (85, 380), (165, 590), (290, 655), (420, 590), (490, 380),
                                (455, 170), (370, 10)),
                         spline((370, 10), (520, 5))))]

# capitals that look like Latin ones: Caveat's own letters (Tegaki orders them as it does the Latin)
for cp, latin in zip([0x0391, 0x0392, 0x0395, 0x0396, 0x0397, 0x0399, 0x039A, 0x039C, 0x039D, 0x039F, 0x03A1,
                      0x03A4, 0x03A7], 'ABEZHIKMNOPTX'):
    G(cp, lsb=None, rsb=None)((lambda latin=latin: [('copy', cmap[ord(latin)], (1, 0, 0, 1, 0, 0), None)]))

# ------------------------------------------------------------------ build
def build():
    order = font.getGlyphOrder()
    glyf, hmtx = font['glyf'], font['hmtx']
    reference = {}
    added = []
    for cp, spec in sorted(SPECS.items()):
        if cp in cmap:
            continue
        name = spec['name']
        pieces = spec['fn']()
        tpen = TTGlyphPen(None)
        refs = []
        complete = True
        for pc in pieces:
            kind = pc[0]
            if kind == 'pen':
                strokes = wobble(pc[1], seed=cp * 7 + len(refs))
                for s in strokes:
                    path_to_pen(brush(s, pc[2]), tpen)
                    refs.append(s)
            elif kind == 'rawpen':   # strokes already in Caveat's own (slanted) space
                strokes = wobble(pc[1], seed=cp * 7 + len(refs), shear=0.0, amp=2.0)
                for s in strokes:
                    path_to_pen(brush(s, pc[2]), tpen)
                    refs.append(s)
            elif kind in ('copy', 'copyc'):
                contours = pc[3] if kind == 'copyc' else None
                copy_glyph(pc[1], tpen, pc[2], contours=contours)
                if not pc[3] or kind == 'copyc':
                    complete = False
                if kind == 'copy' and pc[3]:
                    m = pc[2]
                    if pc[1] in ('period', 'periodcentered'):
                        refs.extend(pc[3])
                    else:
                        for s in pc[3]:
                            refs.append([(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]) for x, y in s])
        g = tpen.glyph()
        g.recalcBounds(glyf)
        if spec['lsb'] is None:          # keep the coordinates as drawn (fractions, double-struck)
            if spec['adv']:
                adv = spec['adv']
            else:
                base = [pc[1] for pc in pieces if pc[0] == 'copy'][0]
                adv = hmtx[base][0]
            shift = 0
        else:
            shift = spec['lsb'] - g.xMin
            adv = (g.xMax - g.xMin) + spec['lsb'] + spec['rsb']
        if shift:
            tp2 = TTGlyphPen(None)
            g.draw(TransformPen(tp2, (1, 0, 0, 1, shift, 0)), glyf)
            g = tp2.glyph(); g.recalcBounds(glyf)
            refs = [[(x + shift, y) for x, y in s] for s in refs]
        glyf[name] = g
        hmtx[name] = (int(round(adv)), g.xMin)
        if name not in order:
            order.append(name)
        for t in font['cmap'].tables:
            if t.isUnicode():
                if t.format in (4,) and cp > 0xFFFF:
                    continue
                t.cmap[cp] = name
        added.append((cp, name, len(pieces)))
        # reference: thousandths of an em, baseline origin, y down
        if refs and complete:
            reference[chr(cp)] = [[[round(x, 1), round(-y, 1)] for x, y in (rdp(s, 1.5) if len(s) > 2 else s)] for s in refs]
    font.setGlyphOrder(order)
    # GDEF: mark the new glyphs as base glyphs
    if 'GDEF' in font and font['GDEF'].table.GlyphClassDef:
        cd = font['GDEF'].table.GlyphClassDef.classDefs
        for _, name, _ in added: cd[name] = 1
    font['maxp'].numGlyphs = len(order)
    if 'post' in font and hasattr(font['post'], 'extraNames'):
        pass
    # names
    nm = font['name']
    for rec in nm.names:
        s = rec.toUnicode()
        if rec.nameID in (1, 4, 16, 18, 21):
            rec.string = s.replace('Caveat', 'Caveat Math')
        elif rec.nameID == 3:
            rec.string = s.replace('Caveat', 'CaveatMath')
        elif rec.nameID == 6:
            rec.string = s.replace('Caveat', 'CaveatMath')
        elif rec.nameID == 5:
            rec.string = s + '; Caveat Math symbols 1.1 (with Greek)'
    nm.setName('Caveat Math is a modified version of Caveat (OFL-1.1) with hand-drawn arithmetic and logic symbols and Greek letters added.', 10, 3, 1, 0x409)
    font['OS/2'].usLastCharIndex = min(0xFFFF, max(font.getBestCmap()))
    font['head'].checkSumAdjustment = 0
    font.save(OUT)
    extra = os.path.join(HERE, 'letter_refs.json')
    if os.path.exists(extra):   # double-struck letters: Tegaki's own strokes for them, re-ordered stem-first
        reference.update(json.load(open(extra)))
    json.dump({'format': 'tegaki-stroke-order', 'version': 1, 'name': 'caveat-math-symbols',
               'description': 'Pen order of the symbols added in Caveat Math, as drawn by its build script',
               'license': 'OFL-1.1', 'glyphs': reference},
              open(OUT.rsplit('/', 1)[0] + '/caveat-math.strokes.json', 'w'))
    return added

if __name__ == '__main__':
    added = build()
    print(len(added), 'glyphs added')
    print(''.join(chr(c) for c, _, _ in added))
