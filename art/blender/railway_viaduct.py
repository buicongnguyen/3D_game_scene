"""Starline viaduct, lamp tower, sleeper and tunnel portal (railway family).

Viaduct tiles chain along X every 14 m. Each span tile owns x in [-7, +7]: one semicircular arch (clear span
11.6 m, springing at z=-7.2) and a HALF pier at each end (x in [+-5.8, +-7]); two chained tiles therefore form a
full 2.4 m pier centred on the shared x=+7 / x=-7 line, with pointed cutwaters on both river faces and a
corbelled refuge bay in the parapet above every pier (refuge floor x in [pier-1.1, pier+1.1],
|y| in [2.3, 3.7] at deck level; the Viaduct Lamp tower stands in the -Y refuge at (pier_x, -3.0, 0)).
Deck top z=0, parapets 1.0 m high with inner faces at |y|=2.3. The abutment's +X face (x=+5) meets a span
whose origin is 12 m further along +X; mirror the abutment (rotate 180 deg about Z) for the far end.
"""
import math, random
from mathutils import Vector, noise
from railway_common import *

ZS = -7.2          # arch springing height
RI = 5.8           # intrados radius (clear span 11.6)
FY = 2.6           # spandrel / pier face |y|
PX = 5.8           # pier face |x| (half pier from PX to 7)
HALF = 7.0
BASE = -24.0
BATTER = .022      # pier batter per metre below the springing
CW_TIP = .8        # cutwater projection beyond the pier face (at the springing)
COR0, COR1 = -.45, -.12   # cornice band
PAR_IN, PAR_OUT, PAR_H = 2.3, 2.7, 1.0
REF_X0 = 5.5       # refuge return wall starts (|x|), wall .4 thick
REF_IN, REF_OUT = 3.7, 4.1
STONE = '#a99a86'
MORTAR = (.46, .44, .43)
MOSS_SPOTS = []


def stone_mats():
    return dict(stone=mat('Viaduct stone', STONE, rough=.82),
                moss=mat('Moss', '#5e8c3a', rough=.9),
                ballast=mat('Ballast', '#8b7a66', rough=.95))


# ------------------------------------------------------------------ masonry mesh builder

class Mason:
    """One bmesh of stone faces with a per-corner colour layer (block tints, mortar)."""

    def __init__(self, seed=0):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Color')
        self.rng = random.Random(seed)

    FAMILIES = ((1.1, .98, .8), (1.07, .92, .86), (.88, .95, 1.07), (1.0, .99, .95), (1.12, .92, .78), (.95, .98, 1.0))

    def tint(self, var=1.0):
        r = self.rng
        v = 1 - var * (.32 * r.random())
        f = self.FAMILIES[r.randrange(len(self.FAMILIES))]
        f = tuple(1 + (c - 1) * var for c in f)
        return (v * f[0], v * f[1], v * f[2])

    def face(self, pts, out, tint):
        vs = [self.bm.verts.new(p) for p in pts]
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f.normal_update()
        if f.normal.dot(out) < 0:
            f.normal_flip()
        for l in f.loops:
            l[self.col] = (tint[0], tint[1], tint[2], 1.0)
        return f

    def wall(self, pt, out, u_range, courses, block=1.2, chamfer=.06, depth=.05, joints=True, jw=.035,
             stagger=True, keep=None, var=1.0):
        """Coursed ashlar on a parametric face. pt(u, v) -> Vector; out(u, v) -> outward normal;
        u_range(v) -> (lo, hi) or None; courses = [(v0, v1), ...]. Each block: a front face with top/bottom
        chamfers into recessed bed joints; optional recessed vertical joint strips (mortar tint)."""
        rng = self.rng
        for ci, (v0, v1) in enumerate(courses):
            r0, r1 = u_range(v0), u_range(v1)
            rm = u_range((v0 + v1) / 2)
            if not r0 or not r1 or not rm:
                continue
            lo, hi = min(r0[0], r1[0]), max(r0[1], r1[1])
            # block joints
            L = block
            u = lo + (L * (.5 if ci % 2 and stagger else 0.0)) - L * rng.random() * .3
            cuts = [lo]
            while True:
                u += L * rng.uniform(.8, 1.2)
                if u >= hi - L * .35:
                    break
                if u > lo + L * .35:
                    cuts.append(u)
            cuts.append(hi)
            c = min(chamfer, (v1 - v0) * .3)
            rows = [v0, v0 + c, v1 - c, v1]
            for a, b in zip(cuts, cuts[1:]):
                segs = [(a + (jw / 2 if joints and a > lo else 0), b - (jw / 2 if joints and b < hi else 0), False)]
                if joints and b < hi:
                    segs.append((b - jw / 2, b + jw / 2, True))
                for ua, ub, is_joint in segs:
                    if keep and not is_joint and not keep((ua + ub) / 2, (v0 + v1) / 2):
                        continue
                    if keep and is_joint and not keep(ub, (v0 + v1) / 2):
                        continue
                    t = MORTAR if is_joint else self.tint(var)
                    grid = []
                    for k, v in enumerate(rows):
                        rr = u_range(v) or (lo, hi)
                        ea, eb = max(ua, rr[0]), min(ub, rr[1])
                        if eb < ea:
                            eb = ea
                        row = []
                        for uu, boundary in ((ea, ea <= rr[0] + 1e-6), (eb, eb >= rr[1] - 1e-6)):
                            p = pt(uu, v)
                            recess = is_joint or k in (0, 3)
                            if recess and not boundary:
                                p = p - out(uu, v) * depth
                            row.append(p)
                        grid.append(row)
                    n = out((ua + ub) / 2, (v0 + v1) / 2)
                    for k in range(3):
                        (pa, pb), (qa, qb) = grid[k], grid[k + 1]
                        if (pb - pa).length < 1e-4 and (qb - qa).length < 1e-4:
                            continue
                        if (pb - pa).length < 1e-4:
                            self.face([pa, qb, qa], n, t)
                        elif (qb - qa).length < 1e-4:
                            self.face([pa, pb, qa], n, t)
                        else:
                            self.face([pa, pb, qb, qa], n, t)

    def flush(self, name):
        """Close the current group into its own object (for per-part triangle reports)."""
        self.groups = getattr(self, 'groups', [])
        if len(self.bm.faces):
            self.groups.append(self.obj(name, None))
        return self.groups

    def obj(self, name, material, smooth=30):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        ob = from_bmesh(name, self.bm, material, smooth_angle=smooth)
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Color')
        return ob


def courses_between(v0, v1, h, jitter=0.0, rng=None):
    n = max(1, round((v1 - v0) / h))
    edges = [v0 + (v1 - v0) * i / n for i in range(n + 1)]
    if jitter and rng:
        edges = [edges[0]] + [e + rng.uniform(-jitter, jitter) for e in edges[1:-1]] + [edges[-1]]
    return list(zip(edges, edges[1:]))


def hsweep(name, path, profile, material, tints=None, closed=False):
    """Sweep a profile [(u_out, z)] along a horizontal XY polyline with mitred corners. u_out points to the
    RIGHT of the path direction. tints[i] colours segment i (per-corner colour layer)."""
    pts = [Vector((p[0], p[1], 0)) for p in path]
    m = len(pts)
    sides = []
    for i in range(m):
        dirs = []
        if i > 0 or closed:
            dirs.append((pts[i] - pts[i - 1]).normalized())
        if i < m - 1 or closed:
            dirs.append((pts[(i + 1) % m] - pts[i]).normalized())
        rs = [Vector((d.y, -d.x, 0)) for d in dirs]
        s = sum(rs, Vector()).normalized()
        scale = 1 / max(.3, s.dot(rs[0]))
        sides.append(s * scale)
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new('Color')
    rings = [[bm.verts.new(pts[i] + sides[i] * u + Vector((0, 0, z))) for u, z in profile] for i in range(m)]
    k = len(profile)
    seq = list(range(m - 1)) + ([m - 1] if closed else [])
    for si in seq:
        A, B = rings[si], rings[(si + 1) % m]
        t = tints[si] if tints else (1, 1, 1)
        for i in range(k):
            j = (i + 1) % k
            f = bm.faces.new((A[i], A[j], B[j], B[i]))
            for l in f.loops:
                l[col] = (*t, 1)
    if not closed:
        for ring in (rings[0], list(reversed(rings[-1]))):
            f = bm.faces.new(ring)
            for l in f.loops:
                l[col] = (*(tints[0] if tints else (1, 1, 1)), 1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    return from_bmesh(name, bm, material, smooth_angle=35)


def joint_path(path, seg=1.1, jw=.03, rng=None):
    """Split a polyline into ~seg-long stones with thin mortar joints: returns (points, tints)."""
    out, tints = [], []
    rng = rng or random.Random(1)
    for a, b in zip(path, path[1:]):
        a, b = Vector(a), Vector(b)
        L = (b - a).length
        n = max(1, round(L / seg))
        for i in range(n):
            p0 = a + (b - a) * (i / n)
            p1 = a + (b - a) * ((i + 1) / n)
            d = (p1 - p0).normalized()
            if not out:
                out.append(p0)
            if i < n - 1 or True:
                out.append(p1 - d * jw / 2 if i < n - 1 else p1)
                v = .82 + rng.random() * .24
                tints.append((v * 1.02, v, v * .96))
                if i < n - 1:
                    out.append(p1 + d * jw / 2)
                    tints.append(MORTAR)
    return [(p.x, p.y) for p in out], tints


def clip_x(path, sx, xb):
    """Keep the part of a polyline with sx * x >= xb (path runs monotonically in x apart from returns)."""
    out = []
    for a, b in zip(path, path[1:]):
        fa, fb = sx * a[0] - xb, sx * b[0] - xb
        if fa >= 0 and (not out or out[-1] != a):
            out.append(a)
        if (fa < 0) != (fb < 0):
            t = fa / (fa - fb)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    if sx * path[-1][0] - xb >= 0:
        out.append(path[-1])
    return out


# ------------------------------------------------------------------ span tile

def batter(z):
    return BATTER * max(0.0, ZS - z)


def half_pier(ms, sx, seed, keep=None, top=COR0, inner=True):
    """Half pier at x in [sx*PX, sx*7]: inner arch-facing face, cutwater faces, impost band, footing."""
    rng = random.Random(seed)
    parts = []
    lo_courses = courses_between(BASE, ZS, .84, .05, rng)
    # inner face (facing the arch opening, -sx), y from -FY' to +FY'
    def pt_in(u, v):
        b = batter(v)
        return Vector((sx * (PX - b), u, v))

    def out_in(u, v):
        return Vector((-sx, 0, 0))

    split = [c for c in lo_courses if c[1] <= -15.0], [c for c in lo_courses if c[1] > -15.0]
    if inner:
        ms.wall(pt_in, out_in, lambda v: (-(FY + batter(v)), FY + batter(v)), split[0], block=2.0, keep=keep,
                joints=False)
        ms.wall(pt_in, out_in, lambda v: (-(FY + batter(v)), FY + batter(v)), split[1], block=2.0, keep=keep)
        ms.flush('Pier face')
    # cutwater faces on both river sides: from the pier corner to the tip on the tile line x = sx*7
    up_courses = courses_between(BASE, ZS, .84, .05, rng) + courses_between(ZS, top - 1.05, .62, .04, rng)
    for sy in (-1, 1):
        def pt_cw(u, v, sy=sy):
            b = batter(v)
            a = Vector((sx * (PX - b), sy * (FY + b), v))
            tip = Vector((sx * HALF, sy * (FY + CW_TIP + b * 1.4), v))
            return a.lerp(tip, u)

        def out_cw(u, v, sy=sy):
            b = batter(v)
            d = Vector((sx * (HALF - PX + b), sy * (CW_TIP + b * .4), 0))
            n = Vector((-d.y, d.x, 0)) if sx * sy > 0 else Vector((d.y, -d.x, 0))
            n.normalize()
            if n.y * sy < 0:
                n = -n
            return n
        ms.wall(pt_cw, out_cw, lambda v: (0.0, 1.0), up_courses, block=5.0, joints=False, keep=keep, var=.45)
    ms.flush('Cutwater')
    # impost band at the springing and a footing course
    for z0, z1, grow in ((ZS - .32, ZS, .1), (BASE, BASE + .6, .25)):
        b = batter(z0) + grow
        outline = [(sx * HALF, -(FY + CW_TIP + b * 1.4)), (sx * (PX - b), -(FY + b)), (sx * (PX - b), FY + b),
                   (sx * HALF, FY + CW_TIP + b * 1.4)]
        if sx < 0:
            outline = list(reversed(outline))
        ob = prism('Impost', outline, z0, z1, None, axis='Z')
        parts.append(ob)
    return parts


def corbel_refuge(ms, sx, sy, seed, M, parts):
    """Stepped corbel table under the refuge bay above the cutwater (x in [sx*5.45, sx*7])."""
    rng = random.Random(seed)
    steps = [(-1.55, -1.18, FY + CW_TIP + .15, PX - .05), (-1.18, -.82, FY + CW_TIP + .6, PX - .25),
             (-.82, COR0, REF_OUT + .02, REF_X0 - .03)]
    for z0, z1, yo, x0 in steps:
        outline = [(sx * x0, sy * (FY - .05)), (sx * HALF, sy * (FY - .05)), (sx * HALF, sy * yo), (sx * x0, sy * yo)]
        if sx * sy < 0:
            outline = list(reversed(outline))
        ob = prism('Corbel', outline, z0, z1, None, axis='Z', bevel=.035 if z1 == COR0 else 0.0, segments=1)
        v = .78 + rng.random() * .2
        init_color([ob], 1.0)
        paint([ob], lambda p, n, fi, o, v=v: (v * 1.02, v, v * .95), mode='set')
        parts.append(ob)


def span_geometry(M, seed=11, keep=None, xb=None):
    """Build every stone part of a span tile. keep(x, y, z) filters blocks (for the broken span).
    Returns (stone_parts, moss_parts, ballast_parts)."""
    ms = Mason(seed)
    rng = random.Random(seed)
    parts, moss, ballast = [], [], []

    def K(fn):
        if not keep:
            return None
        return fn

    # half piers at both ends
    for sx in (-1, 1):
        parts += half_pier(ms, sx, seed + (7 if sx > 0 else 3),
                           keep=K(lambda u, v, sx=sx: keep(sx * 6.4, u, v)))
        for sy in (-1, 1):
            corbel_refuge(ms, sx, sy, seed + sx * 5 + sy, M, parts)

    # spandrel walls (both faces), clipped outside the arch ring
    RS = 6.55
    for sy in (-1, 1):
        def pt_sp(u, v, sy=sy):
            return Vector((u, sy * FY, v))

        def rng_sp(v, sx=1):
            h = v - ZS
            xc = math.sqrt(max(0.0, RS * RS - h * h)) if h < RS else 0.0
            return (xc, PX) if xc < PX else None
        for sx in (-1, 1):
            if sx > 0:
                ur = rng_sp
                ptf = pt_sp
            else:
                ur = (lambda v, f=rng_sp: (lambda r: (-r[1], -r[0]) if r else None)(f(v)))
                ptf = pt_sp
            ms.wall(ptf, lambda u, v, sy=sy: Vector((0, sy, 0)), ur, courses_between(ZS, COR0, .6, .04, rng),
                    block=1.3, keep=K(lambda u, v, sy=sy: keep(u, sy * FY, v)))
        # backing plane behind the spandrel blocks (closes joints / ring gaps), mortar tinted
        for sx in (-1, 1):
            pts = [Vector((sx * PX, sy * (FY - .08), COR0)), Vector((sx * PX, sy * (FY - .08), ZS))]
            for i in range(1, 13):
                a = D90 * i / 12
                pts.append(Vector((sx * RI * math.cos(a), sy * (FY - .08), ZS + RI * math.sin(a))))
            pts.append(Vector((0, sy * (FY - .08), COR0)))
            if xb:
                c = xb[sx] - .15
                a_c = math.acos(min(1.0, c / RI))
                pts = pts[:2] + [q for q in pts[2:-1] if abs(q.x) >= c] + [
                    Vector((sx * c, sy * (FY - .08), ZS + RI * math.sin(a_c))), Vector((sx * c, sy * (FY - .08), COR0))]
            bm = ms.bm
            vs = [bm.verts.new(p) for p in pts]
            try:
                f = bm.faces.new(vs)
                f.normal_update()
                if f.normal.y * sy < 0:
                    f.normal_flip()
                for l in f.loops:
                    l[ms.col] = (*MORTAR, 1)
                if keep:
                    pass
            except ValueError:
                pass
    ms.flush('Spandrel')

    # arch ring voussoirs on both faces, keystone with a Starline star
    NV = 25
    for sy in (-1, 1):
        for i in range(NV):
            a0, a1 = math.pi * i / NV, math.pi * (i + 1) / NV
            key = i == NV // 2
            ro = 6.8 if i % 2 else 6.55          # alternating long/short voussoirs (stepped extrados)
            if key:
                ro = COR0 - ZS
            proud = .16 if key else .08
            am = (a0 + a1) / 2
            if keep and not keep(math.cos(am) * 6.2, sy * FY, ZS + math.sin(am) * 6.2):
                continue
            t = ms.tint()
            t = (t[0] * .97, t[1] * .97, t[2] * .97)
            ch = .05
            back, front = sy * (FY - .02), sy * (FY + proud)
            gap = .012

            def P(r, a, y):
                return Vector((math.cos(a) * r, y, ZS + math.sin(a) * r))
            ia, ib = a0 + gap / RI, a1 - gap / RI
            corners_b = [P(RI, ia, back), P(ro, ia, back), P(ro, ib, back), P(RI, ib, back)]
            # front face inset by the chamfer
            fa, fb = a0 + (gap + ch) / RI, a1 - (gap + ch) / RI
            if key:
                # keystone: a wedge whose top is flat under the cornice
                corners_b = [P(RI, ia, back), Vector((math.cos(ia) * RI - .12, back, COR0)),
                             Vector((math.cos(ib) * RI + .12, back, COR0)), P(RI, ib, back)]
                corners_f = [P(RI + ch, fa, front), Vector((math.cos(ia) * RI - .08, front, COR0 - ch)),
                             Vector((math.cos(ib) * RI + .08, front, COR0 - ch)), P(RI + ch, fb, front)]
            else:
                corners_f = [P(RI + ch, fa, front), P(ro - ch, fa, front), P(ro - ch, fb, front), P(RI + ch, fb, front)]
            n = Vector((0, sy, 0))
            ms.face(corners_f, n, t)
            for k in range(4):
                j = (k + 1) % 4
                mid = (corners_f[k] + corners_f[j]) / 2
                cen = sum(corners_f, Vector()) / 4
                outd = (mid - cen)
                outd.y = 0
                outd = outd.normalized() + n * .8
                ms.face([corners_b[k], corners_b[j], corners_f[j], corners_f[k]], outd, t)
        # star relief on the keystone
        star = [(x, COR0 - .55 + z) for x, z in star_outline(.2, .085)]
        ob = prism('Key star', star, sy * (FY + .16), sy * (FY + .21), None, axis='Y')
        if not keep or keep(0, sy * FY, -1):
            init_color([ob], 1.08)
            parts.append(ob)
        else:
            bpy.data.objects.remove(ob)

    ms.flush('Voussoirs')
    # soffit barrel (voussoir courses continue under the arch)
    def pt_so(u, v):
        return Vector((math.cos(v) * RI, u, ZS + math.sin(v) * RI))

    def out_so(u, v):
        return -Vector((math.cos(v), 0, math.sin(v)))
    ms.wall(pt_so, out_so, lambda v: (-FY + .02, FY - .02), [(math.pi * i / NV, math.pi * (i + 1) / NV)
                                                               for i in range(NV)], block=2.7, chamfer=.009,
            depth=.04, joints=False, keep=K(lambda u, v: keep(math.cos(v) * RI, u, ZS + math.sin(v) * RI)))

    ms.flush('Soffit')
    # parapets: main walls, refuge returns and fronts (masonry both faces)
    pc = courses_between(COR1, PAR_H, .56, 0, rng)
    pci = courses_between(0.0, PAR_H, .5, 0, rng)
    for sy in (-1, 1):
        n_out, n_in = Vector((0, sy, 0)), Vector((0, -sy, 0))
        # outer face of the main parapet (x from -REF_X0 to REF_X0)
        ms.wall(lambda u, v, sy=sy: Vector((u, sy * PAR_OUT, v)), lambda u, v, n=n_out: n, lambda v: (-REF_X0, REF_X0),
                pc, block=1.3, keep=K(lambda u, v, sy=sy: keep(u, sy * PAR_OUT, v)))
        ms.wall(lambda u, v, sy=sy: Vector((u, sy * PAR_IN, v)), lambda u, v, n=n_in: n,
                lambda v: (-REF_X0 - .4, REF_X0 + .4), pci, block=1.3, joints=False,
                keep=K(lambda u, v, sy=sy: keep(u, sy * PAR_IN, v)))
        for sx in (-1, 1):
            # refuge return wall: outer face (x = sx*REF_X0) and inner face (x = sx*(REF_X0+.4))
            ms.wall(lambda u, v, sx=sx: Vector((sx * REF_X0, u, v)), lambda u, v, sx=sx: Vector((-sx, 0, 0)),
                    lambda v, sy=sy: (min(sy * PAR_OUT, sy * REF_OUT), max(sy * PAR_OUT, sy * REF_OUT)), pc,
                    block=1.4, joints=False, keep=K(lambda u, v, sx=sx: keep(sx * REF_X0, u, v)))
            ms.wall(lambda u, v, sx=sx: Vector((sx * (REF_X0 + .4), u, v)), lambda u, v, sx=sx: Vector((sx, 0, 0)),
                    lambda v, sy=sy: (min(sy * PAR_IN, sy * REF_IN), max(sy * PAR_IN, sy * REF_IN)), pci,
                    block=1.4, joints=False, keep=K(lambda u, v, sx=sx: keep(sx * REF_X0, u, v)))
            # refuge front wall: outer (|y|=REF_OUT) and inner (|y|=REF_IN)
            ms.wall(lambda u, v, sy=sy: Vector((u, sy * REF_OUT, v)), lambda u, v, n=n_out: n,
                    lambda v, sx=sx: (min(sx * REF_X0, sx * HALF), max(sx * REF_X0, sx * HALF)), pc, block=1.5,
                    keep=K(lambda u, v, sy=sy: keep(u, sy * REF_OUT, v)))
            ms.wall(lambda u, v, sy=sy: Vector((u, sy * REF_IN, v)), lambda u, v, n=n_in: n,
                    lambda v, sx=sx: (min(sx * (REF_X0 + .4), sx * HALF), max(sx * (REF_X0 + .4), sx * HALF)), pci,
                    block=1.5, keep=K(lambda u, v, sy=sy: keep(u, sy * REF_IN, v)))

    ms.flush('Parapet')
    # coping (rounded caps with stone joints) and cornice, following the refuge outline
    cop = [(-.28, 0), (.28, 0), (.28, .08), (.14, .16), (-.14, .16), (-.28, .08)]
    cor = [(-.14, COR0), (.1, COR0), (.2, COR0 + .12), (.2, COR1 - .06), (.12, COR1),
           (-.14, COR1)]
    for sy in (-1, 1):
        mid = (PAR_IN + PAR_OUT) / 2
        rmid = (REF_IN + REF_OUT) / 2
        cop_path = [(-HALF, sy * rmid), (-REF_X0 - .2, sy * rmid), (-REF_X0 - .2, sy * mid), (REF_X0 + .2, sy * mid),
                    (REF_X0 + .2, sy * rmid), (HALF, sy * rmid)]
        cor_path = [(-HALF, sy * REF_OUT), (-REF_X0, sy * REF_OUT), (-REF_X0, sy * PAR_OUT), (REF_X0, sy * PAR_OUT),
                    (REF_X0, sy * REF_OUT), (HALF, sy * REF_OUT)]
        if sy > 0:
            cop_path = cop_path[::-1]
            cor_path = cor_path[::-1]
        pieces = [(cop_path, cor_path)]
        if xb:
            pieces = [(clip_x(cop_path, sx, xb[sx] + .1), clip_x(cor_path, sx, xb[sx] + .1)) for sx in (-1, 1)]
        for cp, cr in pieces:
            pts, tints = joint_path(cp, 1.75, .03, rng)
            parts.append(hsweep('Coping', pts, [(u, PAR_H + z) for u, z in cop], None, tints))
            pts, tints = joint_path(cr, 2.3, .03, rng)
            parts.append(hsweep('Cornice', pts, cor, None, tints))

    # deck: flagstone walkways along both parapets, a mottled ballast bed between, flagged refuge floors
    for sy in (-1, 1):
        lo_, hi_ = sorted((sy * (PAR_IN - .6), sy * PAR_IN))
        ms.wall(lambda u, v: Vector((u, v, .02)), lambda u, v: Vector((0, 0, 1)), lambda v: (-HALF, HALF),
                [(lo_, hi_)], block=1.2, chamfer=.03, depth=.02, keep=K(lambda u, v: keep(u, v, 0)))
        for sx in (-1, 1):
            a0, a1 = sorted((sx * (REF_X0 + .4), sx * HALF))
            b0, b1 = sorted((sy * PAR_IN, sy * REF_IN))
            ms.wall(lambda u, v: Vector((u, v, .02)), lambda u, v: Vector((0, 0, 1)), lambda v, a0=a0, a1=a1: (a0, a1),
                    courses_between(b0, b1, .7), block=1.1, chamfer=.03, depth=.02,
                    keep=K(lambda u, v: keep(u, v, 0)))
    ms.flush('Flagstones')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=28, y_segments=4, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * HALF, v.co.y * (PAR_IN - .58), 0.0))
    deck = from_bmesh('Deck', bm, M['ballast'], smooth_angle=10)
    if keep:
        me = deck.data
        bm = bmesh.new()
        bm.from_mesh(me)
        dead = [f for f in bm.faces if not keep(f.calc_center_median().x, f.calc_center_median().y, 0)]
        bmesh.ops.delete(bm, geom=dead, context='FACES')
        bm.to_mesh(me)
        bm.free()
    init_color([deck])
    paint([deck], lambda p, n, fi, ob: (lambda k: (k * 1.02, k, k * .96))(
        .82 + .3 * noise.noise(Vector((p.x * 1.3, p.y * 1.3, 0))) + .08 * noise.noise(Vector((p.x * 7, p.y * 7, 1)))))
    ballast.append(deck)
    # moss cushions on ledges (footings, impost bands, cornice) with green seep streaks painted below
    mrng = random.Random(seed + 99)
    spots = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            b0 = batter(BASE + .6)
            spots.append((sx * (PX - b0 - .05), sy * mrng.uniform(.5, 2.2), BASE + .6, .55, 'x'))
            spots.append((sx * (PX + .35), sy * (FY + CW_TIP * .3 + b0 + .15), BASE + .6, .5, 'y'))
            spots.append((sx * (PX - .02), sy * mrng.uniform(.4, 2.0), ZS, .42, 'x'))
        for k in range(2):
            spots.append((sx * mrng.uniform(1.0, 4.8), mrng.choice((-1, 1)) * 2.8, COR1, .38, 'y'))
    MOSS_SPOTS[:] = [(x, y, z, r) for x, y, z, r, _ in spots]
    for i, (x, y, z, r, ax) in enumerate(spots):
        if keep and not keep(x, y, z):
            continue
        rr = (r * .45, r, r * .38) if ax == 'x' else (r, r * .45, r * .38)
        blob = sphere('Moss', rr, (x, y, z), M['moss'], seg=6, rings=3)
        displace(blob, strength=.06, scale=5.0, seed=i)
        moss.append(blob)
    parts += ms.flush('Masonry')
    for p in parts:
        p.data.materials.clear()
        p.data.materials.append(M['stone'])
    return parts, moss, ballast


def weather(parts, ground=None):
    """Water streaks below the cornice, damp darkening low on the piers, a greenish tide band."""
    def fn(p, n, fi, ob):
        k = 1.0
        # vertical streaks hanging from the cornice and refuge corbels
        s = noise.noise(Vector((p.x * 1.7, p.y * .3, 0.0)))
        drop = max(0.0, min(1.0, (-p.z - .5) / 6))
        k *= 1 - .22 * max(0.0, s) * (1 - drop) * (1 if abs(n.z) < .5 else 0)
        # damp low courses
        wet = max(0.0, min(1.0, (BASE + 6 - p.z) / 6))
        g = (1 - .25 * wet, 1 - .12 * wet, 1 - .3 * wet)
        # green seep below moss cushions
        for x, y, z, r in MOSS_SPOTS:
            dz = z - p.z
            if -.1 < dz < 2.6 and abs(p.x - x) < r * 1.3 and abs(p.y - y) < r * 1.3 + .3:
                f = (1 - dz / 2.6) * (1 - abs(p.x - x) / (r * 1.3)) * .5
                g = (g[0] * (1 - .3 * f), g[1] * (1 - .05 * f), g[2] * (1 - .45 * f))
        # soft mottling
        m = noise.noise(Vector((p.x * .35, p.y * .35, p.z * .35))) * .06
        return (k * g[0] * (1 + m), k * g[1] * (1 + m), k * g[2] * (1 + m))
    paint(parts, fn)


def build_span(out_name='viaduct-span'):
    reset()
    M = stone_mats()
    stone, moss, ballast = span_geometry(M)
    init_color(moss)
    weather(stone)
    return finish(out_name, stone + moss + ballast, [], ao=(1.2, .55), ground=None, tinted=True)


def break_x(sx, y, z):
    """|x| where the broken arch ends on side sx (jagged, a little further out at the top)."""
    n = noise.noise(Vector((y * .85 + sx * 7.3, z * .8, 1.7)))
    return 3.55 + .75 * (n + .5) + .08 * z


def timber_mats():
    return dict(timber=mat('Fresh timber', '#dca86a', rough=.72),
                iron=mat('Iron', '#3a3f48', rough=.5, metal=.6),
                rope=mat('Rope', '#c9a56b', rough=.9))


def build_broken(out_name='viaduct-broken'):
    reset()
    M = stone_mats()
    M.update(timber_mats())
    rng = random.Random(5)

    def keep(x, y, z):
        sx = 1 if x >= 0 else -1
        return abs(x) >= break_x(sx, y, z)
    xb = {sx: max(break_x(sx, y, 0) for y in (-2.6, -1.3, 0, 1.3, 2.6)) for sx in (-1, 1)}
    xb_min = {sx: min(break_x(sx, y, z) for y in (-2.6, 0, 2.6) for z in (-3, -1.5, 0)) for sx in (-1, 1)}
    stone, moss, ballast = span_geometry(M, seed=23, keep=keep, xb=xb_min)
    for o in [m for m in moss if abs(m.location.z - ZS) < .2]:  # budget: no cushions on the broken tile's imposts
        moss.remove(o)
        bpy.data.objects.remove(o)
    # rubble core exposed where the arch tore away: a jagged cap following the break + broken stones
    ms = Mason(77)
    extra = []
    for sx in (-1, 1):
        ny, nz = 9, 7
        ys = [-(FY + .02) + (2 * FY + .04) * i / (ny - 1) for i in range(ny)]
        grid = []
        for j in range(nz):
            row = []
            for y in ys:
                z_lo = ZS + math.sqrt(max(0.0, RI * RI - 4.2 ** 2))
                z = z_lo + (0.02 - z_lo) * j / (nz - 1)
                x = sx * (break_x(sx, y, z) - .05)
                x += sx * .25 * noise.noise(Vector((y * 2.3, z * 2.1, sx * 3.0)))
                row.append(Vector((x, y, z)))
            grid.append(row)
        for j in range(nz - 1):
            for i in range(ny - 1):
                t = ms.tint(.8)
                t = (t[0] * .62, t[1] * .58, t[2] * .55)
                ms.face([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]], Vector((-sx, 0, 0)), t)
        # parapet stumps (closing the broken parapet ends) and loose broken blocks at the edge
        for sy in (-1, 1):
            x0 = sx * (break_x(sx, sy * 2.5, .5) - .05)
            ms.face([Vector((x0, sy * PAR_IN, 0)), Vector((x0, sy * (PAR_OUT + .05), COR0)),
                     Vector((x0 + sx * .25, sy * (PAR_OUT + .05), PAR_H + .1)), Vector((x0 + sx * .1, sy * PAR_IN, PAR_H))],
                    Vector((-sx, 0, 0)), (.55, .52, .5))
        for k in range(6):
            y = rng.uniform(-2.4, 2.4)
            z = rng.uniform(-2.8, -.2)
            x = sx * (break_x(sx, y, z) + rng.uniform(-.25, .1))
            b = box('Broken block', (rng.uniform(.35, .7), rng.uniform(.3, .6), rng.uniform(.25, .45)), (x, y, z), None,
                    bevel=0, rot=(rng.uniform(-.5, .5), rng.uniform(-.5, .5), rng.uniform(-.5, .5)))
            v = .7 + rng.random() * .25
            init_color([b], v)
            extra.append(b)
    extra += ms.flush('Rubble core')
    # debris heap in the river bed between the piers
    for k in range(9):
        x = rng.uniform(-3.8, 3.8)
        y = rng.uniform(-3.2, 3.2)
        sz = rng.uniform(.6, 1.4)
        b = box('Fallen block', (sz * rng.uniform(.9, 1.5), sz, sz * .7), (x, y, BASE + sz * .3), None,
                bevel=0, rot=(rng.uniform(-.4, .4), rng.uniform(-.4, .4), rng.uniform(0, 3)))
        init_color([b], .75 + rng.random() * .25)
        extra.append(b)
    heap = sphere('Rubble heap', (4.2, 3.4, 1.3), (0, 0, BASE), None, seg=14, rings=6)
    displace(heap, strength=.6, scale=1.1, seed=4)
    for v in heap.data.vertices:
        v.co.z = max(v.co.z, -.35)
    for f in heap.data.polygons:
        f.use_smooth = False
    init_color([heap], .62)
    extra.append(heap)
    for o in extra:
        o.data.materials.clear()
        o.data.materials.append(M['stone'])
    stone += extra
    # dangling rails and sleepers hanging into the gap
    iron = []
    for sx in (-1, 1):
        edge = min(xb[sx], 4.6)
        for k, ry in enumerate((-RAIL_X, RAIL_X)):
            droop = 3.2 + 2.4 * k + rng.uniform(-.4, .4)
            pts = [(sx * 6.95, ry, .16), (sx * (edge + .9), ry, .16), (sx * (edge + .2), ry, .12)]
            for i in range(1, 6):
                t = i / 5
                pts.append((sx * (edge - .1 - 1.3 * t + .4 * t * t), ry + sx * .5 * t * t * (1 if k else -1),
                            .08 - droop * (t ** 1.3)))
            iron.append(sweep('Rail', pts, [(-.035, 0), (.035, 0), (.035, .14), (-.035, .14)], M['iron'],
                              up=(0, 0, 1), smooth=30))
        for i in range(5):
            x = sx * (6.6 - i * .62)
            if abs(x) < edge + .2:
                break
            extra_sl = box('Sleeper', (2.4, .26, .16), (x, 0, .08), M['timber'], bevel=0, rot=(0, 0, D90))
            ballast.append(extra_sl)
        for i in range(2):
            z = -1.2 - i * 1.6
            s2 = box('Hanging sleeper', (2.2, .26, .16), (sx * (edge - .6 - .25 * i), 0, z), M['timber'], bevel=0,
                     rot=(rng.uniform(.6, 1.2), rng.uniform(-.3, .3), D90 + rng.uniform(-.4, .4)))
            ballast.append(s2)
    init_color(moss + iron + [b for b in ballast if b.name.startswith(('Sleeper', 'Hanging'))])
    weather(stone)
    return finish(out_name, stone + moss + ballast + iron, [], ao=(1.2, .55), ground=None, tinted=True)


def build_repair(out_name='viaduct-repair'):
    """Timber repair overlay for the broken tile: raking-strut trestles from both pier imposts carry three big
    deck beams (Beam1..3, top at z=0), Howe-truss side rails replace the lost parapets, and a lashed ladder
    scaffold (Scaffold) surrounds the Viaduct Lamp in the -Y refuge at the -X pier."""
    reset()
    M = timber_mats()
    tim, iron, rope = M['timber'], M['iron'], M['rope']
    rng = random.Random(8)
    P = []
    L = 12.6
    # trestle: raking struts from sills on both pier imposts up to cap beams under the deck beams
    for sx in (-1, 1):
        P.append(box('Impost sill', (.4, 2 * FY + .2, .35), (sx * (PX - .25), 0, ZS + .18), tim, bevel=.03, segments=1))
        for y in (-1.6, 0.0, 1.6):
            foot = Vector((sx * (PX - .3), y, ZS + .35))
            for xt in (4.4, 2.8, 1.2):
                top = Vector((sx * xt, y, -.72))
                P.append(obox('Raking strut', (foot + top) / 2, (top - foot).normalized(), Vector((0, 1, 0)).cross(
                    (top - foot).normalized()).normalized(), Vector((0, 1, 0)), (top - foot).length + .1, .22, .22, tim))
            P.append(box('Strut cap', (.3, .3, .12), (sx * (PX - .3), y, ZS + .42), iron, bevel=.01, segments=1))
        for xt in (4.4, 2.8, 1.2):
            P.append(box('Cap beam', (.36, 2 * FY - .6, .3), (sx * xt, 0, -.6), tim, bevel=.02, segments=1))
            for y in (-1.6, 0.0, 1.6):
                P.append(box('Strap', (.4, .26, .05), (sx * xt, y, -.76), iron, bevel=0))
        # cross bracing between the strut planes
        for ya, yb in ((-1.6, 0.0), (0.0, 1.6)):
            a = Vector((sx * (PX - .6), ya, ZS + 1.4))
            b = Vector((sx * 3.4, yb, -1.4))
            P.append(rod('Brace', a, b, .08, tim, verts=6))
            a = Vector((sx * (PX - .6), yb, ZS + 1.4))
            b = Vector((sx * 3.4, ya, -1.4))
            P.append(rod('Brace', a, b, .08, tim, verts=6))
    P.append(box('Centre cap', (.36, 2 * FY - .6, .3), (0, 0, -.6), tim, bevel=.02, segments=1))
    # Howe-truss side rails (replace the lost parapets) on both sides
    for sy in (-1, 1):
        y = sy * 2.1
        P.append(box('Truss chord', (L, .2, .22), (0, y, .11), tim, bevel=.02, segments=1))
        P.append(box('Truss chord', (L, .2, .2), (0, y, 1.2), tim, bevel=.02, segments=1))
        n = 8
        for i in range(n + 1):
            x = -L / 2 + L * i / n
            P.append(box('Truss post', (.16, .18, 1.0), (x, y, .66), tim, bevel=.02, segments=1))
            P.append(rod('Tie rod', (x + .12, y + sy * .12, .1), (x + .12, y + sy * .12, 1.3), .025, iron, verts=5))
            if i < n:
                xa, xb2 = x, x + L / n
                d = 1 if i < n / 2 else -1
                a = Vector((xa if d > 0 else xb2, y, .22))
                b = Vector((xb2 if d > 0 else xa, y, 1.1))
                P.append(obox('Truss diagonal', (a + b) / 2, (b - a).normalized(), Vector((0, 1, 0)).cross(
                    (b - a).normalized()), Vector((0, 1, 0)), (b - a).length, .14, .14, tim))
        for x in (-L / 2 + .3, L / 2 - .3):
            P.append(box('Bearing block', (.6, .4, .3), (x, y, -.15), tim, bevel=.02, segments=1))
    # bolts on the chords
    P.append(rivets('Bolt heads', [(-L / 2 + L * i / 8, sy * (2.1 + .105), z) for i in range(9) for sy in (-1, 1)
                                   for z in (.11, 1.2)], (0, 1, 0), iron, r=.035, h=.025, seg=6))
    init_color(P)
    paint(P, lambda p, n, fi, ob: (lambda k: (k, k * .98, k * .94))(
        .88 + .12 * noise.noise(Vector((p.x * .9, p.y * 2.1, p.z * .9)))))

    # the three deck beams (runtime hides each until the player places it)
    pivots = []
    for i, y in enumerate((-RAIL_X, 0.0, RAIL_X)):
        piv = empty(f'Beam{i + 1}', (0, y, -.225))
        kids = [box(f'Beam{i + 1} timber', (L + .6, .34, .45), (0, y, -.225), tim, bevel=.03, segments=2)]
        for x in (-5.8, -3.0, 0.0, 3.0, 5.8):
            kids.append(box('Beam strap', (.08, .38, .49), (x, y, -.225), iron, bevel=0))
        init_color(kids)
        paint(kids[:1], lambda p, n, fi, ob: (lambda k: (k, k * .97, k * .92))(
            .9 + .1 * noise.noise(Vector((p.x * 1.4, p.y * 3, p.z * 3)))))
        pivots.append((piv, kids))

    # scaffold around the Viaduct Lamp: tower in the -Y refuge at the -X pier (x=-7, y=-3.0), up to z=+9
    sc = empty('Scaffold', (-HALF, -3.0, 0))
    S = []
    cx, cy = -HALF, -3.0
    # the river-side poles stand on the refuge parapet coping (y = cy - .9), the track-side ones on the deck
    xs, ys = (cx - 1.2, cx + 1.2), (cy - .9, cy + 1.22)
    for x in xs:
        for y in ys:
            z0 = PAR_H + .17 if y < cy else 0.0
            S.append(cyl('Scaffold pole', .06, 9.0 - z0, (x, y, (9.0 + z0) / 2), tim, verts=7))
            S.append(box('Pole foot', (.3, .3, .06), (x, y, z0 + .03), tim, bevel=.01, segments=1))
    for z in (1.5, 3.2, 4.9, 6.6, 8.2):
        for y in ys:
            S.append(rod('Ledger', (xs[0] - .1, y, z), (xs[1] + .1, y, z), .045, tim, verts=6))
        for x in xs:
            S.append(rod('Transom', (x, ys[0] - .1, z), (x, ys[1] + .1, z), .045, tim, verts=6))
        for x in xs:
            for y in ys:
                S.append(cyl('Lashing', .085, .12, (x, y, z), rope, verts=6))
    for z in (3.2, 6.6):
        for k in range(4):
            yk = ys[1] - .15 - k * .22
            S.append(box('Plank', (2.5, .2, .05), (cx, yk, z + .07), tim, bevel=.01, segments=1))
    S.append(box('Top plank', (2.5, .2, .05), (cx, ys[1] - .15, 8.27), tim, bevel=.01, segments=1))
    S.append(box('Top plank', (2.5, .2, .05), (cx, ys[0] + .12, 8.27), tim, bevel=.01, segments=1))
    for x in xs:   # diagonal braces on the ends
        S.append(rod('Scaffold brace', (x, ys[0], .2), (x, ys[1], 4.8), .04, tim, verts=5))
        S.append(rod('Scaffold brace', (x, ys[1], 4.8), (x, ys[0], 8.8), .04, tim, verts=5))
    # ladders on the track side, staggered between the lifts
    for (x0, z0, z1) in ((cx - .6, 0.0, 3.35), (cx + .6, 3.2, 6.75), (cx - .6, 6.6, 8.4)):
        yl = ys[1] + .12
        for s in (-1, 1):
            S.append(rod('Ladder rail', (x0 + s * .24, yl, z0), (x0 + s * .24, yl + .25, z1 + .8), .035, tim, verts=6))
        n = int((z1 - z0) / .3)
        for i in range(1, n + 1):
            t = i / (n + 1)
            z = z0 + (z1 + .8 - z0) * t
            S.append(rod('Rung', (x0 - .24, yl + .25 * t, z), (x0 + .24, yl + .25 * t, z), .022, tim, verts=5))
    init_color(S)
    paint(S, lambda p, n, fi, ob: (lambda k: (k, k * .97, k * .92))(
        .86 + .14 * noise.noise(Vector((p.x * 3.1, p.y * 3.1, p.z * .7)))))
    pivots.append((sc, S))
    return finish(out_name, P, pivots, ao=(.8, .5), ground=None, tinted=True)


def build_abutment(out_name='viaduct-abutment'):
    """End block x in [-5, 5]: its +X face meets a span whose origin is 12 m further along +X (the span's half
    pier completes the mirrored half cutwater and refuge built here); the -X end runs into the hillside behind
    square terminal pillars. Deck top z=0, masonry down to z=-20 on a stepped footing."""
    reset()
    M = stone_mats()
    rng = random.Random(31)
    ms = Mason(31)
    parts, moss, ballast = [], [], []
    X0, X1, ZB = -5.0, 5.0, -20.0
    XC = X1 - (HALF - PX)          # where the mirrored half cutwater starts (3.8)
    # the span tile's +X half pier (cutwaters, impost, corbelled refuge) shifted onto this block's +X end
    pm = Mason(33)
    shifted = half_pier(pm, 1, 35, inner=False)
    shifted += pm.flush('Cutwater')
    for sy in (-1, 1):
        corbel_refuge(pm, 1, sy, 36 + sy, M, shifted)
    for o in shifted:
        o.location.x += X1 - HALF
        bake_transform(o)
        # the half pier stops at the abutment's foot
        for v in o.data.vertices:
            v.co.z = max(v.co.z, ZB)
    parts += shifted
    # side faces (battered like the piers) from the hill end to the cutwater
    def side_courses(z0, z1):
        return courses_between(z0, z1, .84, .05, rng)
    for sy in (-1, 1):
        ms.wall(lambda u, v, sy=sy: Vector((u, sy * (FY + batter(v)), v)), lambda u, v, sy=sy: Vector((0, sy, 0)),
                lambda v: (X0, XC - batter(v)), side_courses(ZB, COR0), block=2.1, joints=False)
    # hill-side end face
    ms.wall(lambda u, v: Vector((X0, u, v)), lambda u, v: Vector((-1, 0, 0)),
            lambda v: (-(FY + batter(v)), FY + batter(v)), side_courses(ZB, COR0), block=2.2, joints=False)
    ms.flush('Abutment walls')
    # stepped footing flaring into the hillside
    for k, (z0, grow) in enumerate(((ZB, .9), (ZB + .7, .55), (ZB + 1.3, .25))):
        outline = [(X0 - grow, -(FY + batter(z0) + grow)), (XC + grow * .6, -(FY + batter(z0) + grow)),
                   (X1, -(FY + CW_TIP + batter(z0) * 1.4 + grow)), (X1, FY + CW_TIP + batter(z0) * 1.4 + grow),
                   (XC + grow * .6, FY + batter(z0) + grow), (X0 - grow, FY + batter(z0) + grow)]
        ob = prism('Footing', outline, z0, z0 + .7, None, axis='Z', bevel=.05 if k == 2 else 0.0, segments=1)
        init_color([ob], .8 + .06 * k)
        parts.append(ob)
    # string course at the springing level, like the piers
    ob = prism('Impost', [(X0 - .1, -(FY + .1)), (XC + .05, -(FY + .1)), (XC + .05, FY + .1), (X0 - .1, FY + .1)],
               ZS - .32, ZS, None, axis='Z')
    init_color([ob], .95)
    parts.append(ob)
    # parapets: main walls from the terminal pillars to the refuge return, refuge half at the +X end
    RX = X1 - (HALF - REF_X0)      # refuge return wall outer face (3.5)
    pc = courses_between(COR1, PAR_H, .56, 0, rng)
    pci = courses_between(0.0, PAR_H, .5, 0, rng)
    XP = X0 + .8                   # terminal pillar inner edge
    for sy in (-1, 1):
        n_out, n_in = Vector((0, sy, 0)), Vector((0, -sy, 0))
        ms.wall(lambda u, v, sy=sy: Vector((u, sy * PAR_OUT, v)), lambda u, v, n=n_out: n, lambda v: (XP, RX), pc,
                block=1.3)
        ms.wall(lambda u, v, sy=sy: Vector((u, sy * PAR_IN, v)), lambda u, v, n=n_in: n, lambda v: (XP, RX + .4), pci,
                block=1.3, joints=False)
        ms.wall(lambda u, v: Vector((RX, u, v)), lambda u, v: Vector((-1, 0, 0)),
                lambda v, sy=sy: (min(sy * PAR_OUT, sy * REF_OUT), max(sy * PAR_OUT, sy * REF_OUT)), pc, block=1.4,
                joints=False)
        ms.wall(lambda u, v: Vector((RX + .4, u, v)), lambda u, v: Vector((1, 0, 0)),
                lambda v, sy=sy: (min(sy * PAR_IN, sy * REF_IN), max(sy * PAR_IN, sy * REF_IN)), pci, block=1.4,
                joints=False)
        ms.wall(lambda u, v, sy=sy: Vector((u, sy * REF_OUT, v)), lambda u, v, n=n_out: n, lambda v: (RX, X1), pc,
                block=1.5)
        ms.wall(lambda u, v, sy=sy: Vector((u, sy * REF_IN, v)), lambda u, v, n=n_in: n, lambda v: (RX + .4, X1), pci,
                block=1.5)
        # terminal pillar with a pyramid cap
        pil = box('Terminal pillar', (.85, .85, 1.5), (X0 + .42, sy * 2.5, .6), None, bevel=.04, segments=1)
        cap = cyl('Pillar cap', .66, .42, (X0 + .42, sy * 2.5, 1.56), None, verts=4, r2=.08, rot=(0, 0, math.pi / 4))
        band = box('Pillar band', (.95, .95, .14), (X0 + .42, sy * 2.5, 1.3), None, bevel=.03, segments=1)
        for o, v in ((pil, .95), (cap, .88), (band, 1.02)):
            init_color([o], v)
            parts.append(o)
    ms.flush('Parapet')
    cop = [(-.28, 0), (.28, 0), (.28, .08), (.14, .16), (-.14, .16), (-.28, .08)]
    cor = [(-.14, COR0), (.1, COR0), (.2, COR0 + .12), (.2, COR1 - .06), (.12, COR1), (-.14, COR1)]
    mid, rmid = (PAR_IN + PAR_OUT) / 2, (REF_IN + REF_OUT) / 2
    for sy in (-1, 1):
        cop_path = [(XP, sy * mid), (RX + .2, sy * mid), (RX + .2, sy * rmid), (X1, sy * rmid)]
        cor_path = [(X0, sy * PAR_OUT), (RX, sy * PAR_OUT), (RX, sy * REF_OUT), (X1, sy * REF_OUT)]
        if sy > 0:
            cop_path, cor_path = cop_path[::-1], cor_path[::-1]
        pts, tints = joint_path(cop_path, 1.75, .03, rng)
        parts.append(hsweep('Coping', pts, [(u, PAR_H + z) for u, z in cop], None, tints))
        pts, tints = joint_path(cor_path, 2.3, .03, rng)
        parts.append(hsweep('Cornice', pts, cor, None, tints))
    # deck: flagstones along the parapets, ballast between, refuge floor
    for sy in (-1, 1):
        lo_, hi_ = sorted((sy * (PAR_IN - .6), sy * PAR_IN))
        ms.wall(lambda u, v: Vector((u, v, .02)), lambda u, v: Vector((0, 0, 1)), lambda v: (X0, X1), [(lo_, hi_)],
                block=1.2, chamfer=.03, depth=.02)
        b0, b1 = sorted((sy * PAR_IN, sy * REF_IN))
        ms.wall(lambda u, v: Vector((u, v, .02)), lambda u, v: Vector((0, 0, 1)), lambda v: (RX + .4, X1),
                courses_between(b0, b1, .7), block=1.1, chamfer=.03, depth=.02)
    parts += ms.flush('Flagstones')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=20, y_segments=4, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * (X1 - X0) / 2, v.co.y * (PAR_IN - .58), 0.0))
    deck = from_bmesh('Deck', bm, M['ballast'], smooth_angle=10)
    init_color([deck])
    paint([deck], lambda p, n, fi, ob: (lambda k: (k * 1.02, k, k * .96))(
        .82 + .3 * noise.noise(Vector((p.x * 1.3, p.y * 1.3, 0))) + .08 * noise.noise(Vector((p.x * 7, p.y * 7, 1)))))
    ballast.append(deck)
    for i, (x, y, z, r) in enumerate(((X0 + .3, 2.2, ZB + 2.0, .7), (X0 + 1.5, -3.5, ZB + 2.0, .8),
                                      (XC - 1.0, 3.4, ZB + 2.0, .6), (X0 + 2.5, -2.82, COR1, .4),
                                      (X0 + .42, 2.5, 1.62, .3), (-.5, 2.82, COR1, .35), (X0 + .1, -1.2, ZS, .45))):
        blob = sphere('Moss', (r, r * .7, r * .38), (x, y, z), M['moss'], seg=6, rings=3)
        displace(blob, strength=.06, scale=5.0, seed=i)
        moss.append(blob)
    MOSS_SPOTS[:] = [(o.location.x, o.location.y, o.location.z, .5) for o in moss]
    for p_ in parts:
        p_.data.materials.clear()
        p_.data.materials.append(M['stone'])
    init_color(moss)
    weather(parts)
    return finish(out_name, parts + moss + ballast, [], ao=(1.2, .55), ground=ZB, tinted=True)


def build_lamp(out_name='lamp-viaduct'):
    """The Viaduct Lamp: an ornate Meiji-era cast-iron lattice tower (painted deep teal with gilt details) on a
    granite footing, a glazed octagonal lamp chamber at the top (Lamp glass), an onion roof and a star finial
    (Lamp star). Flame = chamber centre. Ladder on the +Y face (the track side when it stands in a -Y refuge).
    The base is 1.2 m square so it fits the 1.4 m deep refuge; ornaments reach about 1.6 m across."""
    reset()
    iron = mat('Lamp iron', '#1d6b66', rough=.38, metal=.55)
    gold = mat('Brass', '#d9a441', rough=.26, metal=.85)
    glass = glow('Lamp glass', '#50666e', '#ffc45a', strength=0.0, rough=.05)
    star_m = glow('Lamp star', '#f2c14e', '#ffd45a', strength=0.0, rough=.25)
    next(n for n in star_m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Metallic'].default_value = .75
    stone = mat('Viaduct stone', STONE, rough=.82)
    P = []
    # granite footing and cast-iron pedestal with raised panels
    P.append(box('Footing', (1.3, 1.3, .3), (0, 0, .15), stone, bevel=.05, segments=1))
    P.append(box('Pedestal', (1.0, 1.0, .85), (0, 0, .72), iron, bevel=.06, segments=2))
    P.append(box('Pedestal cap', (1.16, 1.16, .12), (0, 0, 1.2), iron, bevel=.04, segments=1))
    P.append(box('Pedestal plinth', (1.12, 1.12, .12), (0, 0, .36), iron, bevel=.03, segments=1))
    for a in range(4):
        ang = a * D90
        n = Vector((math.cos(ang), math.sin(ang), 0))
        t = Vector((-n.y, n.x, 0))
        P.append(obox('Panel', n * .505 + Vector((0, 0, .74)), t, Vector((0, 0, 1)), n, .62, .5, .03, iron))
        P.append(plane_map(prism('Panel star', star_outline(.15, .064), 0, .02, gold, axis='Z'),
                           n * .52 + Vector((0, 0, .74)), t, Vector((0, 0, 1)), n))
    # lattice shaft: four corner posts tapering from .8 to .5, bands, X lattice in five bays, scroll feet
    z0, z1 = 1.26, 6.1
    w0, w1 = .4, .25

    def corner(k, z):
        w = w0 + (w1 - w0) * (z - z0) / (z1 - z0)
        return Vector(((1 if k in (0, 3) else -1) * w, (1 if k in (0, 1) else -1) * w, z))
    for k in range(4):
        P.append(rod('Corner post', corner(k, z0), corner(k, z1 + .1), .045, iron, verts=8))
    bays = 5
    for b in range(bays + 1):
        z = z0 + (z1 - z0) * b / bays
        ring = [corner(k, z) for k in range(4)]
        for k in range(4):
            P.append(rod('Band', ring[k], ring[(k + 1) % 4], .026, gold if b in (0, bays) else iron, verts=5))
        if b < bays:
            zt = z0 + (z1 - z0) * (b + 1) / bays
            for k in range(4):
                a0, a1 = corner(k, z), corner((k + 1) % 4, z)
                b0, b1 = corner(k, zt), corner((k + 1) % 4, zt)
                P.append(rod('Lattice', a0, b1, .018, iron, verts=4))
                P.append(rod('Lattice', a1, b0, .018, iron, verts=4))
                c = (a0 + a1 + b0 + b1) / 4
                P.append(sphere('Rosette', .045, c, gold, seg=6, rings=3))
    for k in range(4):     # scroll feet at the shaft base
        c = corner(k, z0)
        d = Vector((c.x, c.y, 0)).normalized()
        pts = [c + d * (.02 + .28 * math.sin(t * math.pi * .8)) + Vector((0, 0, .5 * (1 - t) + .02))
               for t in [i / 7 for i in range(8)]]
        P.append(tube('Scroll foot', pts, .03, iron, verts=5))
        P.append(sphere('Scroll curl', .06, pts[-1], gold, seg=6, rings=3))
    # gallery: a round balcony with railing under the lamp chamber, scroll brackets beneath
    zg = z1 + .1
    P.append(cyl('Gallery floor', .78, .08, (0, 0, zg), iron, verts=16, bevel=.02, segments=1))
    P.append(torus('Gallery rail', .76, .025, (0, 0, zg + .55), gold, maj=20, mn=4))
    P.append(torus('Gallery mid rail', .76, .018, (0, 0, zg + .28), iron, maj=20, mn=4))
    for i in range(12):
        a = TAU * i / 12
        P.append(rod('Baluster', (math.cos(a) * .76, math.sin(a) * .76, zg), (math.cos(a) * .76, math.sin(a) * .76,
                                                                            zg + .55), .014, iron, verts=4))
    for k in range(4):
        a = TAU * k / 4 + math.pi / 4
        d = Vector((math.cos(a), math.sin(a), 0))
        base = corner(k, z1 - .6)
        pts = [base.lerp(d * .72 + Vector((0, 0, zg - .05)), t) + Vector((0, 0, .12 * math.sin(t * math.pi)))
               for t in [i / 6 for i in range(7)]]
        P.append(tube('Gallery bracket', pts, .03, iron, verts=5))
        P.append(sphere('Bracket curl', .05, pts[3] + Vector((0, 0, -.07)), gold, seg=6, rings=3))
    # lamp chamber: octagonal, glazed, with gilt mullions and rings
    zc0, zc1 = zg + .15, zg + 1.3
    R = .5
    P.append(cyl('Chamber base', R + .08, .12, (0, 0, zc0), iron, verts=8, rot=(0, 0, math.pi / 8)))
    P.append(cyl('Chamber head', R + .1, .1, (0, 0, zc1), gold, verts=8, rot=(0, 0, math.pi / 8)))
    P.append(cyl('Lamp glass', R * .97, zc1 - zc0 - .06, (0, 0, (zc0 + zc1) / 2), glass, verts=8,
                 rot=(0, 0, math.pi / 8)))
    for i in range(8):
        a = TAU * i / 8
        P.append(rod('Mullion', (math.cos(a) * R, math.sin(a) * R, zc0), (math.cos(a) * R, math.sin(a) * R, zc1),
                     .025, gold, verts=5))
    P.append(torus('Chamber belt', R + .01, .02, (0, 0, (zc0 + zc1) / 2 + .2), iron, maj=16, mn=4))
    # onion roof with gilt ribs and a crown of little points
    roof = [(R + .16, zc1 + .04), (R + .12, zc1 + .1), (R + .02, zc1 + .2), (R - .08, zc1 + .38), (R - .2, zc1 + .56),
            (.14, zc1 + .72), (.07, zc1 + .84), (.05, zc1 + .95), (0, zc1 + .98)]
    P.append(lathe('Onion roof', roof, iron, seg=16))
    for i in range(8):
        a = TAU * i / 8 + math.pi / 8
        pts = [Vector((math.cos(a) * r * 1.02, math.sin(a) * r * 1.02, z)) for r, z in roof[:7]]
        P.append(tube('Roof rib', pts, .018, gold, verts=4))
        P.append(cyl('Crown point', .035, .14, (math.cos(a) * (R + .15), math.sin(a) * (R + .15), zc1 + .14), gold,
                     verts=4, r2=0.0))
    # star finial: a chunky 5-point star standing on a gilt stem, facing +-Y
    zs = zc1 + 1.3
    P.append(cyl('Finial stem', .03, .3, (0, 0, zc1 + 1.0), gold, verts=6))
    P.append(sphere('Finial ball', .06, (0, 0, zc1 + .97), gold, seg=8, rings=4))
    st = prism('Lamp star', star_outline(.3, .125), -.06, .06, star_m, axis='Y', bevel=.035, segments=1, smooth=30)
    st.location = (0, 0, zs)
    P.append(st)
    # ladder on the +Y face from the pedestal to the gallery
    yl = w0 + .1
    for s_ in (-1, 1):
        P.append(rod('Ladder rail', (s_ * .2, yl + .05, z0), (s_ * .2, w1 + .1, zg), .02, iron, verts=5))
    n = 16
    for i in range(1, n):
        t = i / n
        z = z0 + (zg - z0) * t
        y = yl + .05 + (w1 + .1 - yl - .05) * t
        P.append(rod('Rung', (-.2, y, z), (.2, y, z), .014, iron, verts=4))
    init_color(P)
    flame = empty('Flame', (0, 0, (zc0 + zc1) / 2))
    return finish(out_name, P, [(flame, [])], ao=(.5, .5), ground=0.0, tinted=True)


def build_sleeper(out_name='sleeper'):
    """One creosoted timber sleeper, origin at its top centre, with tie plates and spikes at the rail seats
    (x = +-0.7175, standard gauge)."""
    reset()
    wood = mat('Sleeper wood', '#5b4533', rough=.85)
    iron = mat('Iron', '#3a3f48', rough=.5, metal=.6)
    P = [box('Sleeper', (2.4, .26, .16), (0, 0, -.08), wood, bevel=.02, segments=1)]
    acc = Acc('Spikes', iron, smooth=60)
    for s_ in (-1, 1):
        P.append(box('Tie plate', (.2, .3, .02), (s_ * RAIL_X, 0, .008), iron, bevel=0))
        for dx in (-.07, .07):
            acc.add_pyramid((s_ * RAIL_X + dx, dx * 1.2, .018), (0, 0, 1), .025, .025, seg=4)
    P.append(acc.obj())
    init_color(P)
    paint(P[:1], lambda p, n, fi, ob: (lambda k: (k, k * .97, k * .93))(.85 + .15 * noise.noise(Vector((p.x * 4, p.y * 9, 3)))))
    return finish(out_name, P, [], ao=(.2, .45), ground=-.16, tinted=True)


def build_tunnel(out_name='tunnel-portal'):
    """Stone tunnel mouth set into a mountain face. Opening 4.6 m wide x 5.4 m tall on -Y (semicircular head,
    springing at 3.1 m), origin at rail-top centre of the opening face; the lined tunnel runs 6 m toward +Y
    and fades to near-black. Wing walls flare back into the hillside; parapet on top at 8.2-9 m."""
    reset()
    M = stone_mats()
    rng = random.Random(41)
    ms = Mason(41)
    parts, moss, ballast = [], [], []
    W, H0, R = 2.3, 3.1, 2.3            # opening half width, springing, arch radius
    RR = 3.0                            # ring outer radius
    HX, TOP = 3.3, 8.2                  # headwall half width, headwall top (cornice at 7.5..7.8)
    FACE = 0.0

    def xc(v):
        if v <= H0:
            return W + .7
        h = v - H0
        return math.sqrt(max(0.0, RR * RR - h * h)) if h < RR else None
    cr = courses_between(-.4, 7.45, .56, .03, rng)
    lower = [c for c in cr if c[0] < H0 + RR - .2]
    upper = [c for c in cr if c[0] >= H0 + RR - .2]
    for sx in (-1, 1):
        def ur(v, sx=sx):
            c = xc(v)
            if c is None:
                return (-HX, HX) if sx > 0 else None
            return (c, HX) if sx > 0 else (-HX, -c)
        ms.wall(lambda u, v: Vector((u, FACE, v)), lambda u, v: Vector((0, -1, 0)), ur, lower, block=1.25)
    ms.wall(lambda u, v: Vector((u, FACE, v)), lambda u, v: Vector((0, -1, 0)), lambda v: (-HX, HX), upper, block=1.25)
    # backing for the ring gaps
    pts = [Vector((-HX + .2, FACE + .06, H0))]
    for i in range(13):
        a = math.pi - math.pi * i / 12
        pts.append(Vector((math.cos(a) * (W + .1), FACE + .06, H0 + math.sin(a) * (W + .1))))
    pts += [Vector((HX - .2, FACE + .06, H0)), Vector((HX - .2, FACE + .06, H0 + RR + .3)),
            Vector((-HX + .2, FACE + .06, H0 + RR + .3))]
    ms.face(pts, Vector((0, -1, 0)), MORTAR)
    ms.flush('Headwall')
    # voussoirs + jamb quoins, keystone with a plaque carrying the Starline star
    NV = 15
    for i in range(NV):
        a0, a1 = math.pi * i / NV, math.pi * (i + 1) / NV
        key = i == NV // 2
        ro = RR + (.25 if i % 2 else 0) + (.35 if key else 0)
        proud = .14 if key else .08
        t = ms.tint()
        gap, ch = .012, .045

        def P_(r, a, y):
            return Vector((math.cos(a) * r, y, H0 + math.sin(a) * r))
        ia, ib = a0 + gap / R, a1 - gap / R
        fa, fb = a0 + (gap + ch) / R, a1 - (gap + ch) / R
        back, front = FACE + .02, FACE - proud
        cb = [P_(R, ia, back), P_(ro, ia, back), P_(ro, ib, back), P_(R, ib, back)]
        cf = [P_(R + ch, fa, front), P_(ro - ch, fa, front), P_(ro - ch, fb, front), P_(R + ch, fb, front)]
        ms.face(cf, Vector((0, -1, 0)), t)
        cen = sum(cf, Vector()) / 4
        for k in range(4):
            j = (k + 1) % 4
            mid = (cf[k] + cf[j]) / 2
            od = mid - cen
            od.y = 0
            ms.face([cb[k], cb[j], cf[j], cf[k]], od.normalized() + Vector((0, -.8, 0)), t)
    for sx in (-1, 1):
        z = -.35
        k = 0
        while z < H0 - .05:
            h = min(.62, H0 - z)
            wq = .75 if k % 2 == 0 else .5
            x0_, x1_ = sx * W, sx * (W + wq)
            b = box('Quoin', (abs(x1_ - x0_), .12, h - .03), ((x0_ + x1_) / 2, FACE - .04, z + h / 2), None, bevel=.03,
                    segments=1)
            init_color([b], .92 + rng.random() * .12)
            parts.append(b)
            z += h
            k += 1
    parts.append(box('Keystone plaque', (1.0, .1, .55), (0, FACE - .2, H0 + RR + .75), None, bevel=.03, segments=1))
    init_color(parts[-1:], 1.06)
    ob = plane_map(prism('Plaque star', star_outline(.17, .07), 0, .04, None, axis='Z'), (0, FACE - .25, H0 + RR + .75),
                   Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0)))
    init_color([ob], 1.12)
    parts.append(ob)
    ms.flush('Voussoirs')
    # pilasters, cornice, parapet with coping
    for sx in (-1, 1):
        pil = box('Pilaster', (.55, .5, 7.9), (sx * (HX + .1), FACE - .05, 3.55), None, bevel=.05, segments=1)
        init_color([pil], .98)
        parts.append(pil)
        for zz in range(0, 8):
            parts.append(box('Pilaster course', (.6, .52, .04), (sx * (HX + .1), FACE - .05, -.4 + zz * .98), None,
                             bevel=0))
            init_color(parts[-1:], .62)
    cor = box('Cornice', (2 * HX + 1.3, .8, .32), (0, FACE + .15, 7.62), None, bevel=.06, segments=2)
    init_color([cor], 1.02)
    parts.append(cor)
    ms.wall(lambda u, v: Vector((u, FACE + .05, v)), lambda u, v: Vector((0, -1, 0)), lambda v: (-HX - .5, HX + .5),
            courses_between(7.78, 8.55, .77), block=1.2)
    pts, tints = joint_path([(HX + .55, FACE + .3), (-HX - .55, FACE + .3)], 1.3, .03, rng)
    parts.append(hsweep('Coping', pts, [(-.3, 8.55), (.3, 8.55), (.3, 8.64), (.16, 8.74), (-.16, 8.74), (-.3, 8.64)],
                        None, tints))
    # wing walls flaring back into the hillside, tops stepping down
    for sx in (-1, 1):
        a = Vector((sx * (HX + .35), FACE + .1, 0))
        b = Vector((sx * 4.5, FACE + 3.6, 0))
        d = (b - a).normalized()
        n = Vector((d.y, -d.x, 0)) * (1 if sx < 0 else -1)
        if n.y > 0:
            n = -n
        L = (b - a).length

        def top(u):
            return 7.3 - 4.0 * (u / L)

        def pt_w(u, v, a=a, d=d):
            return a + d * u + Vector((0, 0, v))
        cw = courses_between(-.4, 7.3, .6, .03, rng)
        ms.wall(pt_w, lambda u, v, n=n: n, lambda v, L=L: (0.0, min(L, L * (7.3 - v) / 4.0)) if v < 7.3 else None,
                cw, block=1.3, joints=False)
        cap = [a + d * u + Vector((0, 0, top(u) + .02)) for u in (0.0, L)]
        parts.append(sweep('Wing coping', cap, [(-.3, 0), (.3, 0), (.25, .16), (-.25, .16)], None, up=(0, 0, 1)))
        init_color(parts[-1:], .95)
    ms.flush('Wing walls')
    # tunnel lining: vertical walls + barrel, 6 m deep, fading to near-black; black end cap
    DEPTH = 6.0

    def fade(y):
        return max(.03, 1 - (y / DEPTH) ** .7 * .97)
    lm = Mason(43)
    for sx in (-1, 1):
        lm.wall(lambda u, v, sx=sx: Vector((sx * W, u, v)), lambda u, v, sx=sx: Vector((-sx, 0, 0)),
                lambda v: (FACE, DEPTH), courses_between(-.4, H0, .6), block=1.5, joints=False, var=.6)
    lm.wall(lambda u, v: Vector((math.cos(v) * R, u, H0 + math.sin(v) * R)),
            lambda u, v: -Vector((math.cos(v), 0, math.sin(v))), lambda v: (FACE, DEPTH),
            [(math.pi * i / 10, math.pi * (i + 1) / 10) for i in range(10)], block=1.5, chamfer=.01, depth=.03,
            joints=False, var=.6)
    cap = [Vector((-W, DEPTH, -.4))] + [Vector((math.cos(a) * R, DEPTH, H0 + math.sin(a) * R))
                                        for a in [math.pi - math.pi * i / 10 for i in range(11)]] + [Vector((W, DEPTH, -.4))]
    lm.face(cap, Vector((0, -1, 0)), (.02, .02, .025))
    lining = lm.flush('Lining')
    paint(lining, lambda p, n, fi, ob: (fade(p.y),) * 3)
    parts += lining
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=4, y_segments=8, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * W, (v.co.y + 1) / 2 * (DEPTH + 1.5) - 1.5, -.02))
    floor = from_bmesh('Tunnel floor', bm, M['ballast'], smooth_angle=10)
    init_color([floor])
    paint([floor], lambda p, n, fi, ob: (fade(max(0, p.y)) * (.85 + .15 * noise.noise(Vector((p.x * 3, p.y * 3, 0)))),) * 3)
    ballast.append(floor)
    for i, (x, z, r) in enumerate(((-2.4, 8.76, .5), (1.2, 8.76, .45), (3.0, 7.8, .4), (-3.4, 7.8, .35))):
        blob = sphere('Moss', (r, r * .6, r * .35), (x, FACE + .25, z), M['moss'], seg=6, rings=3)
        displace(blob, strength=.05, scale=5.0, seed=i)
        moss.append(blob)
    for p_ in parts:
        p_.data.materials.clear()
        p_.data.materials.append(M['stone'])
    parts += ms.flush('Parapet')
    for p_ in parts:
        if not p_.data.materials:
            p_.data.materials.append(M['stone'])
    init_color(moss)
    MOSS_SPOTS[:] = [(o.location.x, o.location.y, o.location.z, .5) for o in moss]

    def tweather(p, n, fi, ob):
        s_ = noise.noise(Vector((p.x * 1.9, 0, 2.0)))
        k = 1 - .2 * max(0.0, s_) * (1 if p.z < 7.5 and p.y < .5 else 0)
        return (k * .99, k, k * .98)
    paint(parts, tweather)
    return finish(out_name, parts + moss + ballast, [], ao=(1.0, .55), ground=-.4, tinted=True)
