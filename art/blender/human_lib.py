"""Character-art library for Starline humans (Blender 4.5, used by build_characters.py).

Geometry
  MB             fast mesh builder (lofts, fans, per-face materials, outward orientation)
  sdf_head       star-shaped head sculpted from a smooth union of ellipsoids (cranium, jaw,
                 cheeks, chin) sampled on a clean UV-sphere topology
  Decals         2D shapes (eyes, brows, mouth, blush) projected onto a surface with a BVH
  lock           a sculpted hair lock: flattened lens section, swept along a path, pointed tip
  sweep          tube along a path with a radius profile and optional cloth folds
  hand           palm + four fingers + thumb (or mitten + thumb), built in a wrist frame

Rigging / animation
  weigh(ob, fn)  per-vertex multi-bone weights, fn(world_co) -> {bone: w}
  Poser          forward kinematics that reproduces Blender's pose maths, plus analytic
                 two-bone IK with an explicit hinge (elbows bend forward, knees backward)
  record         keys a clip from a pose function, keeping loops seamless and quaternions
                 sign-continuous

Axis convention (same as rig.py): character faces -Y, up +Z, the character's LEFT is +X.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Quaternion, Euler
from mathutils.bvhtree import BVHTree
from kit import link, shade

TAU = math.tau
V = Vector


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def smooth(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def sstep(a, b, x):
    return smooth((x - a) / (b - a)) if b != a else float(x >= a)


def lerp(a, b, t):
    return a + (b - a) * t


def spow(x, e):
    return math.copysign(abs(x) ** e, x)


def interp(keys, x):
    """Piecewise smooth (cosine) interpolation of [(x, value), ...] (values may be tuples)."""
    if x <= keys[0][0]:
        return keys[0][1]
    for (x0, v0), (x1, v1) in zip(keys, keys[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            t = (1 - math.cos(math.pi * t)) / 2
            if isinstance(v0, (tuple, list)):
                return tuple(a + (b - a) * t for a, b in zip(v0, v1))
            return v0 + (v1 - v0) * t
    return keys[-1][1]


def interp_lin(keys, x):
    if x <= keys[0][0]:
        return keys[0][1]
    for (x0, v0), (x1, v1) in zip(keys, keys[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            if isinstance(v0, (tuple, list)):
                return tuple(a + (b - a) * t for a, b in zip(v0, v1))
            return v0 + (v1 - v0) * t
    return keys[-1][1]


def catmull(pts, n_per=4):
    """Smooth a control polyline with a centripetal-ish Catmull-Rom spline."""
    P = [V(p) for p in pts]
    if len(P) < 3:
        return P
    ext = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(n_per):
            t = k / n_per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return out


def resample(pts, n):
    """Resample a polyline to n points evenly spaced by arc length."""
    P = [V(p) for p in pts]
    d = [0.0]
    for a, b in zip(P, P[1:]):
        d.append(d[-1] + (b - a).length)
    L = d[-1]
    out = []
    j = 0
    for i in range(n):
        s = L * i / (n - 1)
        while j < len(P) - 2 and d[j + 1] < s:
            j += 1
        seg = d[j + 1] - d[j]
        t = (s - d[j]) / seg if seg > 1e-9 else 0
        out.append(P[j].lerp(P[j + 1], clamp(t)))
    return out

# ================================================================ mesh builder


class MB:
    """Accumulates vertices and faces (with materials), then creates one object."""

    def __init__(self, name):
        self.name = name
        self.V, self.F, self.FM, self.mats = [], [], [], []

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def vert(self, co):
        self.V.append(V(co))
        return len(self.V) - 1

    def face(self, ids, m, out=None, inside=None):
        """Add a face; orient it so its normal points along `out` or away from `inside`."""
        if out is not None or inside is not None:
            pts = [self.V[i] for i in ids]
            n = V((0, 0, 0))
            for k in range(len(pts)):
                a, b = pts[k], pts[(k + 1) % len(pts)]
                n += V(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
            c = sum(pts, V()) / len(pts)
            ref = V(out) if out is not None else c - V(inside)
            if n.dot(ref) < 0:
                ids = list(reversed(ids))
        mm = m(sum((self.V[i] for i in ids), V()) / len(ids)) if callable(m) and not isinstance(
            m, bpy.types.Material) else m
        self.F.append(tuple(ids))
        self.FM.append(self.mi(mm))

    def loft(self, rings, m, centers=None, wrap=True, cap0=None, cap1=None, orient=True):
        """Connect equal-length rings with quads. centers: axis point per ring (faces point away
        from it). cap0/cap1: None, 'flat' or a pole Vector closing that end."""
        n = len(rings[0])
        if centers is None:
            centers = [sum((V(p) for p in r), V()) / n for r in rings]
        ids = [[self.vert(p) for p in r] for r in rings]
        span = n if wrap else n - 1
        for i in range(len(ids) - 1):
            ci = (V(centers[i]) + V(centers[i + 1])) / 2
            for j in range(span):
                q = [ids[i][j], ids[i][(j + 1) % n], ids[i + 1][(j + 1) % n], ids[i + 1][j]]
                self.face(q, m, inside=ci if orient else None)
        for cap, ring, c, other in ((cap0, ids[0], centers[0], centers[1] if len(centers) > 1 else None),
                                    (cap1, ids[-1], centers[-1], centers[-2] if len(centers) > 1 else None)):
            if cap is None:
                continue
            axis = (V(c) - V(other)) if other is not None else V((0, 0, 1))
            if isinstance(cap, str):
                self.face(list(ring), m, out=axis)
            else:
                p = self.vert(cap)
                for j in range(span):
                    self.face([ring[j], ring[(j + 1) % n], p], m, out=(self.V[p] - V(c)) + axis * 1e-3)
        return ids

    def extend(self, other):
        base = len(self.V)
        self.V.extend(v.copy() for v in other.V)
        for f, mi in zip(other.F, other.FM):
            self.F.append(tuple(i + base for i in f))
            self.FM.append(self.mi(other.mats[mi]))
        return self

    def transform(self, M, start=0):
        for i in range(start, len(self.V)):
            self.V[i] = M @ self.V[i]
        return self

    def tris(self):
        return sum(len(f) - 2 for f in self.F)

    def build(self, name=None, angle=60, flat=False):
        me = bpy.data.meshes.new(name or self.name)
        me.from_pydata([tuple(v) for v in self.V], [], [list(f) for f in self.F])
        for m in self.mats:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', self.FM)
        me.update()
        ob = link(bpy.data.objects.new(name or self.name, me))
        if flat:
            for p in me.polygons:
                p.use_smooth = False
        else:
            shade(ob, angle)
        return ob


def ring(c, X, Y, rx, ry, n=16, e=2.0, fn=None, a0=0.0, ry_neg=None, rx_neg=None):
    """Superellipse ring around c in the plane (X, Y). e=2 ellipse, >2 boxier.
    fn(angle) -> radial multiplier (folds). ry_neg/rx_neg: radii on the -Y / -X side."""
    c, X, Y = V(c), V(X), V(Y)
    pts = []
    k = 2.0 / e
    for j in range(n):
        a = a0 + TAU * j / n
        ca, sa = math.cos(a), math.sin(a)
        f = fn(a) if fn else 1.0
        rxx = rx if (ca >= 0 or rx_neg is None) else rx_neg
        ryy = ry if (sa >= 0 or ry_neg is None) else ry_neg
        pts.append(c + X * (rxx * spow(ca, k) * f) + Y * (ryy * spow(sa, k) * f))
    return pts


def frames(points, up_fn=None):
    """Frames (p, T, N, B) along a polyline. up_fn(p, T) gives the preferred N direction;
    otherwise parallel transport."""
    P = [V(p) for p in points]
    Ts = []
    for i in range(len(P)):
        a, b = P[max(i - 1, 0)], P[min(i + 1, len(P) - 1)]
        Ts.append((b - a).normalized())
    out = []
    if up_fn is None:
        ref = V((0, 0, 1)) if abs(Ts[0].z) < .9 else V((0, -1, 0))
        N = (ref - Ts[0] * ref.dot(Ts[0])).normalized()
        for i, T in enumerate(Ts):
            if i:
                q = Ts[i - 1].rotation_difference(T)
                N = (q @ N)
                N = (N - T * N.dot(T)).normalized()
            out.append((P[i], T, N, T.cross(N).normalized()))
        return out
    for p, T in zip(P, Ts):
        u = V(up_fn(p, T))
        N = (u - T * u.dot(T))
        if N.length < 1e-6:
            N = T.orthogonal()
        N.normalize()
        out.append((p, T, N, T.cross(N).normalized()))
    return out


def sweep(mb, points, m, radius=0.05, rfn=None, n=12, up_fn=None, e=2.0, squash=1.0, cap0='round', cap1='round',
          fold=None, twist=0.0):
    """Tube along points. rfn(t) -> radius (or (rx, ry)). fold(t, angle) -> radial multiplier.
    cap: 'round' (pole pushed out by the radius), 'flat', 'point', or None (open)."""
    fr = frames(points, up_fn)
    rings, centers = [], []
    cnt = len(fr)
    for i, (p, T, N, B) in enumerate(fr):
        t = i / max(cnt - 1, 1)
        r = rfn(t) if rfn else radius
        rx, ry = (r if isinstance(r, tuple) else (r, r * squash))
        f = (lambda a, t=t: fold(t, a)) if fold else None
        rings.append(ring(p, B, N, rx, ry, n, e, f, a0=twist * t))
        centers.append(p)
    caps = []
    for cap, (p, T, N, B), sgn in ((cap0, fr[0], -1), (cap1, fr[-1], 1)):
        r = rfn(0 if sgn < 0 else 1) if rfn else radius
        r = r[0] if isinstance(r, tuple) else r
        if cap == 'round':
            caps.append(p + T * sgn * r * .8)
        elif cap == 'point':
            caps.append(p + T * sgn * r * 2.0)
        elif cap == 'flat':
            caps.append('flat')
        else:
            caps.append(None)
    return mb.loft(rings, m, centers, cap0=caps[0], cap1=caps[1])


def ellipsoid(mb, c, r, m, seg=16, rings=10, M=None, fn=None):
    """UV ellipsoid (optionally rotated by the 3x3 M). fn(d) -> radial multiplier."""
    c = V(c)
    r = r if isinstance(r, (tuple, list)) else (r, r, r)
    M = M or Matrix.Identity(3)
    rr, cs = [], []
    for i in range(1, rings):
        a = math.pi * i / rings
        row = []
        for j in range(seg):
            b = TAU * j / seg
            d = V((math.sin(a) * math.cos(b), math.sin(a) * math.sin(b), math.cos(a)))
            k = fn(d) if fn else 1
            row.append(c + M @ V((d.x * r[0] * k, d.y * r[1] * k, d.z * r[2] * k)))
        rr.append(row)
        cs.append(c + M @ V((0, 0, math.cos(a) * r[2])))
    top = c + M @ V((0, 0, r[2] * (fn(V((0, 0, 1))) if fn else 1)))
    bot = c + M @ V((0, 0, -r[2] * (fn(V((0, 0, -1))) if fn else 1)))
    return mb.loft(rr, m, cs, cap0=top, cap1=bot)

# ================================================================ SDF sculpting


def sd_ellipsoid(p, c, r):
    q = V(((p.x - c[0]) / r[0], (p.y - c[1]) / r[1], (p.z - c[2]) / r[2]))
    k0 = q.length
    k1 = V(((p.x - c[0]) / (r[0] * r[0]), (p.y - c[1]) / (r[1] * r[1]), (p.z - c[2]) / (r[2] * r[2]))).length
    if k1 < 1e-9:
        return -min(r)
    return k0 * (k0 - 1.0) / k1


def smin(a, b, k):
    h = clamp(0.5 + 0.5 * (b - a) / k)
    return lerp(b, a, h) - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


class SDF:
    """Smooth union of ellipsoids with optional subtractive ellipsoids."""

    def __init__(self, k=0.02):
        self.adds, self.subs, self.k = [], [], k

    def add(self, c, r, k=None):
        self.adds.append((V(c), r, k))
        return self

    def sub(self, c, r, k=0.01):
        self.subs.append((V(c), r, k))
        return self

    def __call__(self, p):
        d = None
        for c, r, k in self.adds:
            e = sd_ellipsoid(p, c, r)
            d = e if d is None else smin(d, e, k or self.k)
        for c, r, k in self.subs:
            d = smax(d, -sd_ellipsoid(p, c, r), k)
        return d


def star_surface(sdf, center, d, rmax=0.5):
    """Distance along unit d from center to the SDF zero crossing (bisection)."""
    lo, hi = 0.0, rmax
    for _ in range(34):
        mid = (lo + hi) / 2
        if sdf(center + d * mid) < 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def sdf_mesh(mb, sdf, center, m, seg=32, rings=24, rmax=0.5, squash_poles=True):
    """Clean UV-sphere topology whose vertices sit on a star-shaped SDF surface."""
    center = V(center)
    rr, cs = [], []
    for i in range(1, rings):
        a = math.pi * i / rings
        row = []
        for j in range(seg):
            b = TAU * j / seg - math.pi / 2  # seam at the back
            d = V((math.sin(a) * math.cos(b), math.sin(a) * math.sin(b), math.cos(a)))
            row.append(center + d * star_surface(sdf, center, d, rmax))
        rr.append(row)
        cs.append(center + V((0, 0, math.cos(a) * 0.05)))
    top = center + V((0, 0, 1)) * star_surface(sdf, center, V((0, 0, 1)), rmax)
    bot = center + V((0, 0, -1)) * star_surface(sdf, center, V((0, 0, -1)), rmax)
    return mb.loft(rr, m, cs, cap0=top, cap1=bot)

# ================================================================ decals


class Surface:
    """BVH over one or more objects (world space) used to project decals and hair."""

    def __init__(self, objs):
        bpy.context.view_layer.update()
        verts, polys = [], []
        for o in objs:
            mw = o.matrix_world
            base = len(verts)
            verts.extend(mw @ v.co for v in o.data.vertices)
            polys.extend([base + i for i in p.vertices] for p in o.data.polygons)
        self.tree = BVHTree.FromPolygons(verts, polys)

    def hit(self, origin, direction, dist=2.0):
        loc, nrm, _, _ = self.tree.ray_cast(V(origin), V(direction).normalized(), dist)
        return loc, nrm

    def project_from(self, center, d):
        """Surface point and normal where the ray from far outside toward center along -d hits."""
        d = V(d).normalized()
        loc, nrm = self.hit(V(center) + d * 1.0, -d)
        return loc, nrm

    def nearest(self, p):
        loc, nrm, _, _ = self.tree.find_nearest(V(p))
        return loc, nrm


class Decal:
    """A 2D shape projected onto a Surface.

    Frame: anchor point on the surface, tangent U (character's left, +X-ish), V (up).
    Shapes are lists of (u, v) outlines in metres; they are triangulated with inner rings so
    they conform to curvature, then lifted along the surface normal.
    """

    def __init__(self, surf, center, direction, up=(0, 0, 1), roll=0.0):
        self.s = surf
        self.anchor, self.n = surf.project_from(center, direction)
        if self.anchor is None:
            raise RuntimeError('decal ray missed the surface')
        n = self.n
        u = V((1, 0, 0)) if abs(n.x) < .9 else V((0, 0, 1))
        U = (u - n * u.dot(n)).normalized()
        W = n.cross(U).normalized()  # up
        if W.dot(V(up)) < 0:
            W = -W
        if roll:
            q = Quaternion(n, math.radians(roll))
            U, W = q @ U, q @ W
        self.U, self.W = U, W

    def point(self, u, v, lift=0.001, dome=0.0):
        p = self.anchor + self.U * u + self.W * v + self.n * 0.05
        loc, nrm = self.s.hit(p, -self.n, 0.2)
        if loc is None:
            loc, nrm = self.s.nearest(self.anchor + self.U * u + self.W * v)
        return loc + nrm * (lift + dome)

    def fill(self, mb, outline, m, lift=0.001, rings=2, dome=0.0, center=None):
        """Filled polygon (convex or star-shaped around center)."""
        o = [tuple(p) for p in outline]
        cu = center[0] if center else sum(p[0] for p in o) / len(o)
        cv = center[1] if center else sum(p[1] for p in o) / len(o)
        levels = []
        for k in range(rings, 0, -1):
            f = k / rings
            levels.append([(cu + (u - cu) * f, cv + (v - cv) * f, 1 - f * f) for u, v in o])
        ids = []
        for lev in levels:
            ids.append([mb.vert(self.point(u, v, lift, dome * h)) for u, v, h in lev])
        c = mb.vert(self.point(cu, cv, lift, dome))
        n = len(o)
        for a, b in zip(ids, ids[1:]):
            for j in range(n):
                mb.face([a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]], m, out=self.n)
        for j in range(n):
            mb.face([ids[-1][j], ids[-1][(j + 1) % n], c], m, out=self.n)

    def strip(self, mb, path, widths, m, lift=0.001, thick=0.0):
        """A ribbon along a 2D path [(u, v), ...] with per-point widths (tapered strokes).
        thick > 0 extrudes a raised stroke (visible edges)."""
        P = [V((u, v, 0)) for u, v in path]
        n = len(P)
        L, R = [], []
        for i in range(n):
            a, b = P[max(i - 1, 0)], P[min(i + 1, n - 1)]
            t = (b - a).normalized()
            nn = V((-t.y, t.x, 0))
            w = widths[i] / 2
            L.append(P[i] + nn * w)
            R.append(P[i] - nn * w)
        top_l = [mb.vert(self.point(p.x, p.y, lift + thick)) for p in L]
        top_r = [mb.vert(self.point(p.x, p.y, lift + thick)) for p in R]
        for i in range(n - 1):
            mb.face([top_l[i], top_l[i + 1], top_r[i + 1], top_r[i]], m, out=self.n)
        if thick > 0:
            bl = [mb.vert(self.point(p.x, p.y, lift * .3)) for p in L]
            br = [mb.vert(self.point(p.x, p.y, lift * .3)) for p in R]
            c = self.anchor + self.U * P[n // 2].x + self.W * P[n // 2].y
            for i in range(n - 1):
                mb.face([top_l[i], bl[i], bl[i + 1], top_l[i + 1]], m, inside=c)
                mb.face([top_r[i], top_r[i + 1], br[i + 1], br[i]], m, inside=c)
            mb.face([top_l[0], top_r[0], br[0], bl[0]], m, inside=c)
            mb.face([top_l[-1], bl[-1], br[-1], top_r[-1]], m, inside=c)


def ellipse_pts(cu, cv, ru, rv, n=20, rot=0.0, e=2.0, fn=None):
    out = []
    cr, sr = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    for j in range(n):
        a = TAU * j / n
        k = fn(a) if fn else 1.0
        x = ru * spow(math.cos(a), 2 / e) * k
        y = rv * spow(math.sin(a), 2 / e) * k
        out.append((cu + x * cr - y * sr, cv + x * sr + y * cr))
    return out


def clip_poly(subject, clipper):
    """Sutherland-Hodgman: clip polygon `subject` by convex polygon `clipper` (CCW)."""
    def inside(p, a, b):
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0

    def inter(p, q, a, b):
        x1, y1, x2, y2 = p[0], p[1], q[0], q[1]
        x3, y3, x4, y4 = a[0], a[1], b[0], b[1]
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(den) < 1e-12:
            return q
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    out = list(subject)
    for i in range(len(clipper)):
        a, b = clipper[i], clipper[(i + 1) % len(clipper)]
        inp, out = out, []
        if not inp:
            break
        s = inp[-1]
        for e in inp:
            if inside(e, a, b):
                if not inside(s, a, b):
                    out.append(inter(s, e, a, b))
                out.append(e)
            elif inside(s, a, b):
                out.append(inter(s, e, a, b))
            s = e
    return out


def resample_poly(poly, n):
    """Resample a closed polygon to n points by perimeter length."""
    pts = [V((p[0], p[1], 0)) for p in poly] + [V((poly[0][0], poly[0][1], 0))]
    return [(p.x, p.y) for p in resample(pts, n + 1)[:-1]]

# ================================================================ hair


def lock(mb, path, m, width, thick, head_c, n=8, wfn=None, tfn=None, curl_in=0.0, samples=10, flat_in=0.6,
         twist=0.0, out_fn=None):
    """A chunky hair lock swept along `path` (smoothed). The section is a lens: convex outside,
    flatter inside, oriented so its flat faces the head. Tips come to a point."""
    pts = resample(catmull(path, 4), samples)
    head_c = V(head_c)

    def up(p, T):
        return V(out_fn(p)) if out_fn else (p - head_c)
    fr = frames(pts, up)
    rings, cs = [], []
    cnt = len(fr)
    for i, (p, T, N, B) in enumerate(fr):
        t = i / (cnt - 1)
        w = width * (wfn(t) if wfn else (math.sin(math.pi * min(1, 0.15 + t * 0.95)) ** 0.7 * (1 - t) ** 0.6 + .02))
        h = thick * (tfn(t) if tfn else (1 - 0.8 * t))
        ang = twist * t
        if ang:
            q = Quaternion(T, ang)
            N, B = q @ N, q @ B
        row = []
        for j in range(n):
            a = TAU * j / n
            ca, sa = math.cos(a), math.sin(a)
            hh = h * (sa if sa > 0 else sa * flat_in)
            row.append(p + B * (w * ca) + N * hh)
        rings.append(row)
        cs.append(p)
    tipd = fr[-1][1]
    tip = fr[-1][0] + tipd * width * 0.15
    root = fr[0][0] - fr[0][1] * width * 0.1
    return mb.loft(rings, m, cs, cap0=root, cap1=tip)


def on_sphere(c, r, az, el):
    """Point on a sphere around c. az: degrees around Z from the FRONT (-Y), positive toward the
    character's left (+X); el: degrees above the horizontal."""
    a, e = math.radians(az), math.radians(el)
    return V(c) + V((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * r

# ================================================================ weights


def weigh(ob, fn):
    """fn(world_co) -> bone name or {bone: weight}; weights are normalised per vertex."""
    bpy.context.view_layer.update()
    mw = ob.matrix_world
    groups = {}
    if not callable(fn):
        const = fn
        fn = lambda co: const
    for v in ob.data.vertices:
        w = fn(mw @ v.co)
        if isinstance(w, str):
            w = {w: 1.0}
        tot = sum(x for x in w.values() if x > 0)
        for b, x in w.items():
            if x <= 1e-4:
                continue
            g = groups.get(b)
            if g is None:
                g = ob.vertex_groups.get(b) or ob.vertex_groups.new(name=b)
                groups[b] = g
            g.add([v.index], x / tot, 'REPLACE')
    return ob


def blend2(a, b, t):
    t = smooth(t)
    if t <= 0:
        return {a: 1.0}
    if t >= 1:
        return {b: 1.0}
    return {a: 1 - t, b: t}


def chain_w(keys, x):
    """keys: [(bone, x_centre), ...] ascending; smooth blend between neighbouring centres."""
    if x <= keys[0][1]:
        return {keys[0][0]: 1.0}
    for (b0, x0), (b1, x1) in zip(keys, keys[1:]):
        if x <= x1:
            return blend2(b0, b1, (x - x0) / (x1 - x0))
    return {keys[-1][0]: 1.0}


def seg_t(co, a, b):
    a, b = V(a), V(b)
    d = b - a
    return (V(co) - a).dot(d) / d.length_squared


def mix_w(*pairs):
    """Combine weight dicts: mix_w((w1, f1), (w2, f2))."""
    out = {}
    for w, f in pairs:
        if f <= 0:
            continue
        for k, x in w.items():
            out[k] = out.get(k, 0) + x * f
    return out

# ================================================================ vertex colour tints


def tint(ob, fn, material_names=None):
    """Multiply the baked 'Color' attribute: fn(co_world, normal_world) -> (r, g, b) or None."""
    me = ob.data
    attr = me.color_attributes.get('Color')
    if attr is None:
        return
    mw = ob.matrix_world
    nm = mw.to_3x3().inverted_safe().transposed()
    names = [m.name if m else '' for m in me.materials]
    cache = {}
    for poly in me.polygons:
        if material_names is not None and names[poly.material_index] not in material_names:
            continue
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            if vi not in cache:
                v = me.vertices[vi]
                cache[vi] = fn(mw @ v.co, (nm @ v.normal).normalized())
            t = cache[vi]
            if t is None:
                continue
            c = attr.data[li].color
            attr.data[li].color = (c[0] * t[0], c[1] * t[1], c[2] * t[2], c[3])

# ================================================================ posing (FK / IK)


def eul(d):
    return Euler([math.radians(a) for a in d], 'XYZ').to_quaternion()


class Poser:
    """Reproduces Blender's pose maths for bones posed with 'armature-axis' rotations (rig.py
    semantics): each bone's rotation q is expressed in armature axes about the bone head, in the
    frame its parent has been moved to. Delta transform of a bone:  D_b = D_parent o T(h + t) o q o T(-h).
    """

    def __init__(self, arm):
        self.arm = arm
        bones = arm.data.bones
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.R = {b.name: b.matrix_local.to_quaternion() for b in bones}
        self.h = {b.name: b.head_local.copy() for b in bones}
        self.t = {b.name: b.tail_local.copy() for b in bones}
        order, seen = [], set()

        def visit(n):
            if n in seen:
                return
            p = self.parent[n]
            if p:
                visit(p)
            seen.add(n)
            order.append(n)
        for b in bones:
            visit(b.name)
        self.order = order

    def solve(self, spec):
        """spec: {'bone': (rx, ry, rz) degrees or Quaternion, 'bone@loc': (dx, dy, dz),
        'ik': {'arm_L': {...}, 'leg_R': {...}}}. Returns {bone: (q_armature_axes, t)}."""
        Q, T, D = {}, {}, {}
        ik = spec.get('ik', {})
        chains = {}
        for key, g in ik.items():
            kind, side = key.split('_')
            if kind == 'arm':
                chains['upperarm_' + side] = ('arm', side, g)
            else:
                chains['thigh_' + side] = ('leg', side, g)
        for n in self.order:
            p = self.parent[n]
            Dp = D[p] if p else (Quaternion(), V((0, 0, 0)))
            if n in chains:
                kind, side, g = chains[n]
                self._ik(kind, side, g, Dp, Q, T, D)
            if n not in Q:
                r = spec.get(n)
                if callable(r):
                    r = r(self, D)
                Q[n] = r if isinstance(r, Quaternion) else (eul(r) if r is not None else Quaternion())
                T[n] = V(spec.get(n + '@loc', (0, 0, 0)))
            D[n] = self._delta(n, Dp, Q[n], T[n])
        self.D = D
        return {n: (Q[n], T[n]) for n in self.order}

    def _delta(self, n, Dp, q, t):
        h = self.h[n]
        rot = Dp[0] @ q
        trans = Dp[0] @ (h + t - q @ h) + Dp[1]
        return (rot, trans)

    @staticmethod
    def apply(D, p):
        return D[0] @ V(p) + D[1]

    def world(self, n, local_point=None):
        """Posed armature-space position of a rest-space point on bone n (default its head)."""
        return self.apply(self.D[n], self.h[n] if local_point is None else local_point)

    def _ik(self, kind, side, g, Dp, Q, T, D):
        if kind == 'arm':
            b1, b2, b3 = 'upperarm_' + side, 'forearm_' + side, 'hand_' + side
            hinge0 = V((-1, 0, 0))
        else:
            b1, b2, b3 = 'thigh_' + side, 'shin_' + side, 'foot_' + side
            hinge0 = V((1, 0, 0))
        target = g['target'](self, D) if callable(g['target']) else V(g['target'])
        pole = V(g.get('pole', (0, 1, 0) if kind == 'arm' else (0, -1, 0)))
        h1, h2, h3 = self.h[b1], self.h[b2], self.h[b3]
        u0, f0 = h2 - h1, h3 - h2
        l1, l2 = u0.length, f0.length
        S = Dp[0] @ h1 + Dp[1]
        dvec = target - S
        d = clamp(dvec.length, abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995)
        nrm = dvec.normalized()
        a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
        hh = math.sqrt(max(l1 * l1 - a * a, 0))
        m = pole - nrm * pole.dot(nrm)
        if m.length < 1e-6:
            m = nrm.orthogonal()
        m.normalize()
        E = S + nrm * a + m * hh
        W = S + nrm * d
        ud, fd = (E - S).normalized(), (W - E).normalized()
        hinge = ud.cross(fd)
        if hinge.length < 1e-5:
            hinge = m.cross(nrm)
        hinge.normalize()
        # upper bone: map (u0, hinge0) -> (ud, hinge) in world, then express in the parent frame
        Wrot = _frame_rot(u0, hinge0, ud, hinge)
        q1 = Dp[0].inverted() @ Wrot
        t1 = V((0, 0, 0))
        D1 = self._delta(b1, Dp, q1, t1)
        cur = D1[0] @ f0
        q2w = cur.rotation_difference(fd)
        q2 = D1[0].inverted() @ q2w @ D1[0]
        D2 = self._delta(b2, D1, q2, V((0, 0, 0)))
        end = g.get('end')  # desired world delta rotation of the hand / foot
        if callable(end):
            end = end(self, D)
        if end is not None:
            end = end if isinstance(end, Quaternion) else eul(end)
            q3 = D2[0].inverted() @ end
        else:
            rel = g.get('end_rel', (0, 0, 0))
            q3 = rel if isinstance(rel, Quaternion) else eul(rel)
        Q[b1], T[b1] = q1, t1
        Q[b2], T[b2] = q2, V((0, 0, 0))
        Q[b3], T[b3] = q3, V((0, 0, 0))


def _frame_rot(a0, b0, a1, b1):
    """Rotation taking direction a0 -> a1 and (orthogonalised) b0 -> b1."""
    def basis(a, b):
        x = a.normalized()
        y = (b - x * b.dot(x))
        if y.length < 1e-6:
            y = x.orthogonal()
        y.normalize()
        z = x.cross(y)
        return Matrix((x, y, z)).transposed()
    M0, M1 = basis(a0, b0), basis(a1, b1)
    return (M1 @ M0.transposed()).to_quaternion()


def record(arm, poser, name, frames, pose_fn, loop=True, bones=None):
    """Key an action from pose_fn(p) -> spec (p in 0..1). Every bone gets rotation keys (so the
    runtime never inherits a stale pose); bones with '@loc' specs also get location keys."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    names = bones or poser.order
    prev = {}
    loc_bones = set()
    for f in range(frames + 1):
        p = f / frames
        if loop and f == frames:
            p = 0.0
        spec = pose_fn(p)
        res = poser.solve(spec)
        for k in spec:
            if k.endswith('@loc'):
                loc_bones.add(k[:-4])
        for n in names:
            q, t = res[n]
            R = poser.R[n]
            ql = R.inverted() @ q @ R
            if n in prev and prev[n].dot(ql) < 0:
                ql = -ql
            prev[n] = ql
            pb = arm.pose.bones[n]
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = ql
            pb.keyframe_insert('rotation_quaternion', frame=f)
            if n in loc_bones or n == 'hips':
                pb.location = R.to_matrix().inverted() @ t
                pb.keyframe_insert('location', frame=f)
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = frames
    act.use_cyclic = loop
    try:
        for fc in _fcurves(act):
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
    except Exception:
        pass
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    arm.animation_data.action = None
    return act


def _fcurves(act):
    try:
        return list(act.fcurves)
    except Exception:
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out.extend(bag.fcurves)
        return out


def pose_at(arm, poser, spec):
    """Apply one pose to the armature (for renders / portraits)."""
    res = poser.solve(spec)
    for n, (q, t) in res.items():
        R = poser.R[n]
        pb = arm.pose.bones[n]
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = R.inverted() @ q @ R
        pb.location = R.to_matrix().inverted() @ t
    bpy.context.view_layer.update()


def smooth_colors(ob, iters=2, material_names=None, amount=0.6):
    """Blur the 'Color' attribute over mesh neighbours (removes AO speckle under hair)."""
    me = ob.data
    attr = me.color_attributes.get('Color')
    if attr is None:
        return
    names = [m.name if m else '' for m in me.materials]
    sel = set()
    for poly in me.polygons:
        if material_names is None or names[poly.material_index] in material_names:
            sel.update(poly.vertices)
    nb = {i: set() for i in sel}
    for e in me.edges:
        a, b = e.vertices
        if a in sel and b in sel:
            nb[a].add(b)
            nb[b].add(a)
    val = {}
    cnt = {}
    for li, loop in enumerate(me.loops):
        vi = loop.vertex_index
        if vi in sel:
            c = attr.data[li].color
            val[vi] = val.get(vi, 0) + c[0]
            cnt[vi] = cnt.get(vi, 0) + 1
    val = {k: v / cnt[k] for k, v in val.items()}
    for _ in range(iters):
        new = {}
        for i, v in val.items():
            ns = [val[j] for j in nb[i] if j in val]
            new[i] = v * (1 - amount) + (sum(ns) / len(ns)) * amount if ns else v
        val = new
    for li, loop in enumerate(me.loops):
        vi = loop.vertex_index
        if vi in val:
            c = attr.data[li].color
            old = max(c[0], 1e-4)
            f = val[vi] / old
            attr.data[li].color = (c[0] * f, c[1] * f, c[2] * f, c[3])


def radial_normals(ob, center, amount=0.55, scale=(1.0, 1.0, 1.0)):
    """Blend the object's corner normals toward the direction from `center` (stylised hair shading:
    clumps keep their form but light flows across the whole volume, hiding lock facets)."""
    me = ob.data
    c = Vector(center)
    mw = ob.matrix_world
    me.update()
    out = []
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            co = mw @ me.vertices[vi].co
            n0 = me.corner_normals[li].vector if hasattr(me, 'corner_normals') else me.loops[li].normal
            r = (co - c)
            r = Vector((r.x * scale[0], r.y * scale[1], r.z * scale[2])).normalized()
            n = (Vector(n0) * (1 - amount) + r * amount).normalized()
            out.append(n)
    me.normals_split_custom_set(out)
    return ob
