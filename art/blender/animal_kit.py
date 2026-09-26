"""Helpers for build_animals.py (Blender 4.5): organic lofts, cartoon eyes with blink lids, chain
skinning, and an animation player with analytic two-bone leg IK so paws plant on the ground.

The loft toolkit (Catmull-Rom cross-section keys -> exact triangle counts, per-face colour regions)
is adapted from the race3D_game wildlife builder. Everything else follows rig.py conventions:
channel rotations are about ARMATURE axes, applied at the bone head, relative to the parent's pose.

Verified axis facts (Blender, animal faces -Y, up +Z, animal's left = +X):
  +X on a hanging limb swings it BACKWARD; +X on a forward-pointing bone tips its tail DOWN.
  +Z turns LEFT.  +Y tilts the top toward +X (the animal's LEFT; rig.py's docstring says -X, which
  is wrong).
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Quaternion, Euler, noise
from kit import *  # noqa: F401,F403  (sphere, mat, from_bmesh, TAU, ...)
from kit import from_bmesh, sphere, TAU
import rig
from rig import FPS

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
D = math.radians


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def tri_count(obs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs if o and o.type == 'MESH')

# ---------------------------------------------------------------- loft toolkit


def _cr(a, b, c, d, t):
    return .5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t ** 3)


def spline_at(keys, u):
    """Catmull-Rom through key tuples (x, y, z, w, h, ...) at parameter u in [0, len-1]."""
    n = len(keys)
    i = max(0, min(int(math.floor(u)), n - 2))
    t = u - i
    k = (keys[max(i - 1, 0)], keys[i], keys[i + 1], keys[min(i + 2, n - 1)])
    return [_cr(k[0][j], k[1][j], k[2][j], k[3][j], t) for j in range(len(keys[0]))]


def spline_pts(keys, count):
    last = len(keys) - 1
    return [Vector(spline_at(keys, last * i / (count - 1))[:3]) for i in range(count)]


DOME = {3: ((.42, .9), (.72, .68), (.92, .38)), 2: ((.5, .86), (.84, .52)), 1: ((.72, .66),)}


def loft(name, keys, mats, n=12, sub=2, us=None, side=X, angles=None, dome=(0, 0), dome_n=2,
         mat_fn=None, shift_fn=None, rad_fn=None, smooth_angle=80):
    """Sweep elliptical sections (half-width w along `side`, half-height h across it) through
    Catmull-Rom keys (x, y, z, w, h). dome=(start, end) rounds the ends.
    mat_fn(u, a) -> material index; shift_fn(u, a) -> offset along the spine;
    rad_fn(u, a) -> radius multiplier (clumpy / scalloped sections). a = 0 is +side, pi/2 is 'up'."""
    if not isinstance(mats, (list, tuple)):
        mats = [mats]
    keys = [tuple(float(v) for v in k) for k in keys]
    last = len(keys) - 1
    if us is None:
        us = [i / sub for i in range(last * sub + 1)]
    if angles is None:
        angles = [TAU * j / n for j in range(n)]
    samp = [spline_at(keys, u) for u in us]
    pts = [Vector(s[:3]) for s in samp]
    m = len(pts)
    side = Vector(side)
    tans = [(pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(m)]

    def frame(t):
        sv = side - t * side.dot(t)
        if sv.length < 1e-4:
            sv = Z - t * t.z
        if sv.length < 1e-4:
            sv = Y - t * t.y
        sv.normalize()
        return sv, t.cross(sv).normalized()

    _, u0 = frame(tans[0])
    flip = -1.0 if (u0.z < -1e-6 or (abs(u0.z) <= 1e-6 and u0.y > 0)) else 1.0
    rings = []
    for i in range(m):
        sv, uv = frame(tans[i])
        rings.append((us[i], pts[i], tans[i], sv, uv * flip, max(samp[i][3], 1e-3), max(samp[i][4], 1e-3)))

    def dome_list(r, sgn, f):
        u, p, t, sv, uv, w, h = r
        ln = min(w, h) * f
        return [(u, p + t * sgn * ln * o, t, sv, uv, w * k, h * k) for o, k in DOME[dome_n]], p + t * sgn * ln

    poles = [rings[0][1], rings[-1][1]]
    if dome[0] > 0:
        d, poles[0] = dome_list(rings[0], -1, dome[0])
        rings = d[::-1] + rings
    if dome[1] > 0:
        d, poles[1] = dome_list(rings[-1], 1, dome[1])
        rings = rings + d
    bm = bmesh.new()
    vr = []
    for (u, p, t, sv, uv, w, h) in rings:
        ring = []
        for a in angles:
            k = rad_fn(u, a) if rad_fn else 1.0
            off = (sv * (math.cos(a) * w) + uv * (math.sin(a) * h)) * k
            if shift_fn:
                off = off + t * shift_fn(u, a)
            ring.append(bm.verts.new(p + off))
        vr.append(ring)
    na = len(angles)

    def amid(j):
        a1 = angles[(j + 1) % na] + (TAU if j == na - 1 else 0)
        return (angles[j] + a1) / 2

    for i in range(len(vr) - 1):
        um = (rings[i][0] + rings[i + 1][0]) / 2
        for j in range(na):
            f = bm.faces.new((vr[i][j], vr[i + 1][j], vr[i + 1][(j + 1) % na], vr[i][(j + 1) % na]))
            if mat_fn:
                f.material_index = mat_fn(um, amid(j))
    for ring, pole, u in ((vr[0], poles[0], rings[0][0]), (vr[-1], poles[1], rings[-1][0])):
        pv = bm.verts.new(pole)
        for j in range(na):
            f = bm.faces.new((ring[j], ring[(j + 1) % na], pv))
            if mat_fn:
                f.material_index = mat_fn(u, amid(j))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = from_bmesh(name, bm, mats[0], smooth_angle=smooth_angle)
    for mm in mats[1:]:
        ob.data.materials.append(mm)
    return ob


def lobe(name, pts, w, material, side=X, n=6, flat=.8, tip=.35, dome_end=1.1, dome_start=0.0, mats=None,
         mat_fn=None):
    """Rounded tapering tuft (fur clump, feather plume, wool lock) through 3+ points."""
    k = len(pts)
    keys = []
    for i, p in enumerate(pts):
        f = 1 - (1 - tip) * (i / (k - 1)) ** 1.25
        keys.append((p[0], p[1], p[2], w * f, w * f * flat))
    return loft(name, keys, mats or material, n=n, sub=1, side=side, dome=(dome_start, dome_end), dome_n=2,
                mat_fn=mat_fn)


def puff(name, c, r, material, seg=8, rings=6, lump=.18, seed=0, squash=1.0):
    """Lumpy low-poly ball (wool clump, cloud tuft)."""
    ob = sphere(name, (r, r, r * squash), c, material, seg=seg, rings=rings)
    me = ob.data
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in me.vertices:
        d = v.co.normalized()
        k = 1 + lump * noise.noise(d * 2.2 + off)
        v.co = v.co * k
    me.update()
    return ob


def plate(name, outline, thick, material, plane_x, plane_y, origin, bevel=.004, segments=1, bulge=0.0):
    """Thin extruded 2D outline placed on an arbitrary plane (fins, bibs, leaves).
    outline: [(u, v)] in plane coordinates; the plate is centred on the plane with `thick`.
    bulge pushes the middle outward along the normal (a slight cushion)."""
    px, py = Vector(plane_x).normalized(), Vector(plane_y).normalized()
    nz = px.cross(py).normalized()
    o = Vector(origin)
    bm = bmesh.new()
    vs = [bm.verts.new((u, v, -thick / 2)) for u, v in outline]
    f = bm.faces.new(vs)
    ret = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [e for e in ret['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0, thick)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type='OFFSET', segments=segments,
                        profile=.5, affect='EDGES', clamp_overlap=True)
    bmesh.ops.triangulate(bm, faces=[ff for ff in bm.faces if len(ff.verts) > 4])
    if bulge:
        us = [u for u, _ in outline]
        vs2 = [v for _, v in outline]
        cu, cv = (max(us) + min(us)) / 2, (max(vs2) + min(vs2)) / 2
        ru, rv = (max(us) - min(us)) / 2 + 1e-6, (max(vs2) - min(vs2)) / 2 + 1e-6
        for v in bm.verts:
            q = 1 - min(1, ((v.co.x - cu) / ru) ** 2 + ((v.co.y - cv) / rv) ** 2)
            v.co.z += bulge * q * (1 if v.co.z > 0 else .3)
    M = Matrix((px, py, nz)).transposed()
    for v in bm.verts:
        v.co = o + M @ v.co
    return from_bmesh(name, bm, material, smooth_angle=40)


def feather(name, root, direction, length, width, material, up=Z, segs=4, droop=.06, crease=.08, tipw=.14):
    """Paddle feather: wide root, round tip (single strip; material should be double-sided)."""
    d = Vector(direction).normalized()
    side = d.cross(Vector(up))
    if side.length < 1e-4:
        side = d.cross(X)
    side.normalize()
    upv = side.cross(d).normalized()
    bm = bmesh.new()
    rows = []
    for i in range(segs + 1):
        t = i / segs
        w = width * (.78 + .22 * math.sin(math.pi * t))
        if t > .55:
            w *= max(math.sqrt(max(0.0, 1 - ((t - .55) / .45) ** 2)), tipw)
        c = Vector(root) + d * (length * t) - upv * (droop * length * t * t)
        rows.append([bm.verts.new(c - side * w / 2 - upv * crease * w), bm.verts.new(c + upv * crease * w * .5),
                     bm.verts.new(c + side * w / 2 - upv * crease * w)])
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], b[0], b[1], a[1]))
        bm.faces.new((a[1], b[1], b[2], a[2]))
    return from_bmesh(name, bm, material, smooth_angle=80)


def slab_feather(name, root, direction, length, width, thick, material, up=Z, droop=.05, segs=4, tip=.3,
                 curl=0.0):
    """Closed, thin feather/plate with a round tip (no backface issues)."""
    d = Vector(direction).normalized()
    side = d.cross(Vector(up))
    if side.length < 1e-4:
        side = d.cross(X)
    side.normalize()
    upv = side.cross(d).normalized()
    keys = []
    for i in range(segs + 1):
        t = i / segs
        w = width * (.75 + .25 * math.sin(math.pi * min(1, t * 1.3)))
        if t > .5:
            w *= max(math.sqrt(max(0.0, 1 - ((t - .5) / .5) ** 2)), tip)
        c = Vector(root) + d * (length * t) - upv * (droop * length * t * t) + side * (curl * length * t * t)
        keys.append((c.x, c.y, c.z, w / 2, thick / 2))
    return loft(name, keys, material, n=6, sub=1, side=side, dome=(0, .6), dome_n=1)

# ---------------------------------------------------------------- eyes


def _cap(name, c, R, axis, up, ang_s, ang_u, seg, rings, material, skirt=.94):
    """Spherical cap on a sphere of radius R about `axis`, elliptical (ang_s wide, ang_u tall), with a
    short skirt tucked inward so the edge is clean against the sclera."""
    a = Vector(axis).normalized()
    u = (Vector(up) - a * a.dot(Vector(up))).normalized()
    s = u.cross(a).normalized()
    bm = bmesh.new()
    pole = bm.verts.new(c + a * R)
    rows = []
    for i in range(1, rings + 1):
        f = i / rings
        row = []
        for j in range(seg):
            ph = TAU * j / seg
            ts, tu = ang_s * f * math.cos(ph), ang_u * f * math.sin(ph)
            th = math.hypot(ts, tu)
            dirt = (s * ts + u * tu)
            dirt = dirt.normalized() if dirt.length > 1e-9 else s
            p = a * math.cos(th) + dirt * math.sin(th)
            row.append(bm.verts.new(c + p * R))
        rows.append(row)
    last = rows[-1]
    rows.append([bm.verts.new(c + (v.co - c) * skirt) for v in last])
    for j in range(seg):
        bm.faces.new((pole, rows[0][j], rows[0][(j + 1) % seg]))
    for r0, r1 in zip(rows, rows[1:]):
        for j in range(seg):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % seg], r0[(j + 1) % seg]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm, material, smooth_angle=70)


class Eye:
    """A cartoon eye: sphere sclera (embedded), coloured iris, pupil, two highlights, and an optional
    lune-shaped upper lid (+ dark lash line) that rotates about the eye's side axis to blink."""

    def __init__(self, prefix, c, nrm, r, white, pupil_m, iris_m=None, up=Z, iris=.62, pupil=.36,
                 look=(0, 0), tall=1.12, seg=14, rings=8, lid_m=None, lash_m=None, lid_open=22, lid_res=(7, 10),
                 shine_m=None, shine=.2, low=False):
        self.c = Vector(c)
        n = Vector(nrm).normalized()
        u = (Vector(up) - n * n.dot(Vector(up))).normalized()
        self.n, self.u = n, u
        self.s = u.cross(n).normalized()           # +rotation about s closes the lid
        self.r = r
        self.parts, self.lid_parts = [], []
        q = n.to_track_quat('Z', 'Y')
        self.parts.append(sphere(prefix + ' white', r, self.c, white, seg=seg, rings=rings, rot=q.to_euler()))
        g = (n + self.s * look[0] + u * look[1]).normalized()
        cs = 10 if low else 14
        if iris_m is not None:
            self.parts.append(_cap(prefix + ' iris', self.c, r * 1.012, g, u, iris, iris * tall, cs, 2, iris_m))
        self.parts.append(_cap(prefix + ' pupil', self.c, r * 1.024, g, u, pupil, pupil * tall, cs - 2, 2,
                               pupil_m))
        sm = shine_m or white
        # highlights sit in the same world corner on both eyes (upper, toward +X), plus a small low glint
        for k, (du, dx, rr) in enumerate(((.62, .42, shine), (-.5, -.35, shine * .45))):
            d = (g + u * du * (iris + .1) * 1.4 + X * dx * (iris + .1)).normalized()
            self.parts.append(sphere(f'{prefix} shine {k}', (r * rr, r * rr, r * rr * .5), self.c + d * r * 1.03, sm,
                                     seg=6, rings=3 if low else 4, rot=d.to_track_quat('Z', 'Y').to_euler()))
        if lid_m is not None:
            self._lid(prefix, lid_m, lash_m, lid_open, lid_res)

    def _lid(self, prefix, lid_m, lash_m, open_deg, res):
        """Lune between the meridians alpha0..alpha1 (alpha 0 = top, 90 = front) through the +-s poles."""
        R = self.r * 1.07
        a1 = D(open_deg)
        a0 = a1 - D(175)
        na, nb = res
        c, u, n, s = self.c, self.u, self.n, self.s

        def P(al, be, rr=R):
            return c + (math.cos(be) * (u * math.cos(al) + n * math.sin(al)) + s * math.sin(be)) * rr
        bm = bmesh.new()
        poles = (bm.verts.new(P(0, -math.pi / 2)), bm.verts.new(P(0, math.pi / 2)))
        grid = []
        for i in range(na + 1):
            al = a0 + (a1 - a0) * i / na
            grid.append([bm.verts.new(P(al, -math.pi / 2 + math.pi * j / nb)) for j in range(1, nb)])
        for i in range(na):
            r0, r1 = grid[i], grid[i + 1]
            for j in range(nb - 2):
                bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
            bm.faces.new((poles[0], r1[0], r0[0]))
            bm.faces.new((poles[1], r0[-1], r1[-1]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        # make normals point outward from the eye centre
        bm.normal_update()
        f0 = bm.faces[0]
        if f0.normal.dot(f0.calc_center_median() - c) < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        self.lid_parts.append(from_bmesh(prefix + ' lid', bm, lid_m, smooth_angle=80))
        if lash_m is not None:
            pts = [P(a1 + .02, -math.pi / 2 * .96 + math.pi * .96 * j / 10, R * 1.005) for j in range(11)]
            from kit import tube
            self.lid_parts.append(tube(prefix + ' lash', pts, self.r * .075, lash_m, verts=5,
                                       radius_fn=lambda t: .45 + .55 * math.sin(math.pi * t)))

    def lid_rot(self, deg):
        """Armature-space rotation that closes the lid by `deg` degrees (0 = rest)."""
        return Quaternion(self.s, D(deg))


# ---------------------------------------------------------------- skinning


def bind_chain(part, segs, blend=.05):
    """Weight a part along a chain of bone segments [(bone, a, b), ...] (consecutive; a bone may repeat).
    Each vertex goes to its closest segment, cross-fading with smoothstep over +-blend metres around
    each shared joint, so spines, necks, tails and legs bend smoothly."""
    bpy.context.view_layer.update()
    mw = part.matrix_world
    segs = [(b, Vector(a), Vector(c)) for b, a, c in segs]
    groups = {}
    for b, _, _ in segs:
        if b not in groups:
            groups[b] = part.vertex_groups.get(b) or part.vertex_groups.new(name=b)
    n = len(segs)
    for v in part.data.vertices:
        p = mw @ v.co
        best = (1e9, 0, 0.0)
        for i, (_, a, c) in enumerate(segs):
            ab = c - a
            L2 = ab.length_squared
            t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, (p - a).dot(ab) / L2))
            d = (a + ab * t - p).length
            if d < best[0] - 1e-7:
                best = (d, i, t)
        _, i, t = best
        L = (segs[i][2] - segs[i][1]).length
        x = t * L
        sp = (.5 - .5 * smooth(x / blend)) if (i > 0 and x < blend) else 0.0
        sn = (.5 - .5 * smooth((L - x) / blend)) if (i < n - 1 and (L - x) < blend) else 0.0
        w = {}
        w[segs[i][0]] = w.get(segs[i][0], 0) + 1 - sp - sn
        if sp:
            w[segs[i - 1][0]] = w.get(segs[i - 1][0], 0) + sp
        if sn:
            w[segs[i + 1][0]] = w.get(segs[i + 1][0], 0) + sn
        for b, val in w.items():
            if val > 1e-4:
                groups[b].add([v.index], val, 'REPLACE')
    return part


def bind_fn(part, fn):
    """Custom weights: fn(world_co) -> {bone: weight} (normalised here)."""
    bpy.context.view_layer.update()
    mw = part.matrix_world
    for v in part.data.vertices:
        w = fn(mw @ v.co)
        tot = sum(w.values()) or 1
        for b, val in w.items():
            if val / tot > 1e-4:
                g = part.vertex_groups.get(b) or part.vertex_groups.new(name=b)
                g.add([v.index], val / tot, 'REPLACE')
    return part


def mirror_x(v):
    return (-v[0], v[1], v[2])

# ---------------------------------------------------------------- animation player with leg IK


def _wrap(a):
    while a > math.pi:
        a -= TAU
    while a < -math.pi:
        a += TAU
    return a


def _ang(v):
    return math.atan2(v.z, v.y)


class Player:
    """Samples pose functions into actions. A pose is a dict:
         'bone': (rx, ry, rz) degrees about armature axes, or a Quaternion (armature space)
         'bone@loc': (dx, dy, dz) metres (armature space, relative to the parent's pose)
         'bone@scale': s or (sx, sy, sz)
         'ik': {leg: ((x, y, z) paw contact target in armature space, paw pitch in degrees)}
    Leg IK is solved in the leg parent's posed frame, so it follows any body motion.
    """

    def __init__(self, arm):
        self.arm = arm
        bones = arm.data.bones
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        order, seen = [], set()

        def visit(b):
            if b.name in seen:
                return
            if b.parent:
                visit(b.parent)
            seen.add(b.name)
            order.append(b.name)
        for b in bones:
            visit(b)
        self.order = order
        self.legs = {}
        self.report = {}

    def leg(self, name, upper, lower, foot, plane=None, yaw=False):
        """Register a 3-bone leg (upper, lower, foot) whose foot tail is the ground contact.
        plane: horizontal in-plane direction (default +Y, i.e. a sagittal leg bending about X);
        yaw: also swing the leg about Z at the hip to follow off-plane targets (crab legs)."""
        bs = self.arm.data.bones
        H, K, A, T = (bs[upper].head_local.copy(), bs[lower].head_local.copy(), bs[foot].head_local.copy(),
                      bs[foot].tail_local.copy())
        h = Vector(plane).normalized() if plane is not None else Vector((0, 1, 0))
        h.z = 0
        h.normalize()
        ax = h.cross(Vector((0, 0, 1))).normalized()
        L = dict(bones=(upper, lower, foot), parent=self.parent[upper], H=H, K=K, A=A, T=T, h=h, ax=ax, yaw=yaw,
                 L1=(K - H).length, L2=(A - K).length, L3=(T - A).length)
        uv = lambda v: (v.dot(h), v.z)
        k2, a2 = uv(K - H), uv(A - H)
        L['sign'] = 1 if (k2[0] * a2[1] - k2[1] * a2[0]) > 0 else -1
        L['r1'] = math.atan2(*reversed(uv(K - H)))
        L['r2'] = math.atan2(*reversed(uv(A - K)))
        L['r3'] = math.atan2(*reversed(uv(T - A)))
        self.legs[name] = L
        return L

    @staticmethod
    def _q(v):
        if isinstance(v, Quaternion):
            return v.copy()
        return Euler([D(a) for a in v], 'XYZ').to_quaternion()

    def _fk(self, rots, locs, scales):
        M = {}
        for nm in self.order:
            rest = self.rest[nm]
            rr = rest.to_quaternion()
            q = rots.get(nm)
            ql = (rr.inverted() @ q @ rr) if q is not None else Quaternion()
            d = locs.get(nm)
            ll = (rest.to_3x3().inverted() @ Vector(d)) if d is not None else Vector()
            s = scales.get(nm, (1, 1, 1))
            basis = Matrix.Translation(ll) @ ql.to_matrix().to_4x4() @ Matrix.Diagonal((*s, 1))
            p = self.parent[nm]
            M[nm] = (M[p] @ self.rest[p].inverted() @ rest @ basis) if p else rest @ basis
        return M

    def world(self, pose, bone, point=None):
        """Posed armature-space position of a rest-space point carried by `bone` (default: its head)."""
        rots, locs, scales = self._split(pose)
        M = self._fk(rots, locs, scales)
        rest = self.rest[bone]
        pt = rest.translation if point is None else Vector(point)
        return M[bone] @ rest.inverted() @ pt

    def _split(self, pose):
        rots, locs, scales = {}, {}, {}
        for k, v in pose.items():
            if k == 'ik':
                continue
            if k.endswith('@loc'):
                locs[k[:-4]] = Vector(v)
            elif k.endswith('@scale'):
                scales[k[:-6]] = tuple(v) if isinstance(v, (tuple, list)) else (v, v, v)
            else:
                rots[k] = self._q(v)
        return rots, locs, scales

    def solve(self, leg, M, target, foot_deg):
        """Analytic IK in the leg's plane (parent-posed frame). Returns ([q1, q2, q3] armature-space
        quaternions, reach error)."""
        L = self.legs[leg]
        P = L['parent']
        Dm = M[P] @ self.rest[P].inverted()
        Di = Dm.inverted()
        t = Di @ Vector(target)
        H, h, ax = L['H'], L['h'], L['ax']
        Zv = Vector((0, 0, 1))
        psi = 0.0
        if L['yaw']:
            side = Zv.cross(h)
            d0 = t - H
            psi = math.atan2(d0.dot(side), d0.dot(h))
            t = H + Matrix.Rotation(-psi, 3, 'Z') @ (t - H)
        L1, L2 = L['L1'], L['L2']
        reach = (L1 + L2) * .999

        def uv(v):
            return Vector((v.dot(h), v.z))

        def wrist(deg):
            fw = Matrix.Rotation(D(deg), 3, ax) @ (L['T'] - L['A']).normalized()
            fp = Di.to_3x3() @ fw
            if psi:
                fp = Matrix.Rotation(-psi, 3, 'Z') @ fp
            f2 = uv(fp)
            f2 = f2.normalized() if f2.length > 1e-6 else Vector((0, -1))
            return uv(t - H) - f2 * L['L3'], f2
        a, fp2 = wrist(foot_deg)
        if a.length > reach:
            for step in range(1, 19):
                done = False
                for sg in (1, -1):
                    a2, f2 = wrist(foot_deg + sg * step * 5)
                    if a2.length <= reach:
                        a, fp2, done = a2, f2, True
                        break
                if done:
                    break
        du, dv = a.x, a.y
        d = math.hypot(du, dv)
        dc = max(abs(L1 - L2) + 1e-4, min(d, (L1 + L2) * .9995))
        err = abs(d - dc)
        base = math.atan2(dv, du)
        g = math.acos(max(-1, min(1, (L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc))))
        best = None
        for sg in (1, -1):
            th = base + sg * g
            ku, kv = L1 * math.cos(th), L1 * math.sin(th)
            cr = ku * dv - kv * du
            if (cr > 0) == (L['sign'] > 0):
                best = (ku, kv)
        if best is None:
            best = (L1 * math.cos(base), L1 * math.sin(base))
        ku, kv = best
        au, av = du * dc / max(d, 1e-9), dv * dc / max(d, 1e-9)
        n1 = math.atan2(kv, ku)
        n2 = math.atan2(av - kv, au - ku)
        n3 = math.atan2(fp2.y, fp2.x)
        c1 = _wrap(n1 - L['r1'])
        c2 = _wrap((n2 - L['r2']) - (n1 - L['r1']))
        c3 = _wrap((n3 - L['r3']) - (n2 - L['r2']))
        q1 = Quaternion(ax, c1)
        if psi:
            q1 = Quaternion(Zv, psi) @ q1
        return [q1, Quaternion(ax, c2), Quaternion(ax, c3)], err

    def aim_chain(self, pose, bones, points):
        """Point each bone of a chain at the next waypoint (armature space), like a spline IK for tails
        and necks. Returns the pose with quaternion channels for `bones` (other channels untouched)."""
        pose = dict(pose)
        for b, target in zip(bones, points):
            rots, locs, scales = self._split(pose)
            M = self._fk(rots, locs, scales)
            par = self.parent[b]
            Dp = (M[par] @ self.rest[par].inverted()).to_quaternion() if par else Quaternion()
            rest = self.arm.data.bones[b]
            d_rest = (rest.tail_local - rest.head_local).normalized()
            head = (M[par] @ self.rest[par].inverted() @ rest.head_local) if par else rest.head_local
            d_cur = Dp @ d_rest
            want = (Vector(target) - head).normalized()
            qw = d_cur.rotation_difference(want)
            pose[b] = Dp.inverted() @ qw @ Dp
        return pose

    def pose_quats(self, pose):
        """Resolve a pose (incl. IK) into {bone: (armature-space quaternion, loc, scale)}."""
        rots, locs, scales = self._split(pose)
        ik = pose.get('ik') or {}
        if ik:
            M = self._fk(rots, locs, scales)
            for leg, (target, fdeg) in ik.items():
                angs, err = self.solve(leg, M, target, fdeg)
                if err > getattr(self, '_err', 0):
                    self._err, self._errw = err, (leg, round(getattr(self, '_p', 0), 3))
                for b, q in zip(self.legs[leg]['bones'], angs):
                    rots[b] = q
        return rots, locs, scales

    def apply(self, pose):
        """Set a pose on the armature (no keys) for measuring."""
        rots, locs, scales = self.pose_quats(pose)
        for nm in self.order:
            pb = self.arm.pose.bones[nm]
            rest = self.rest[nm]
            rr = rest.to_quaternion()
            q = rots.get(nm)
            pb.rotation_quaternion = (rr.inverted() @ q @ rr) if q is not None else Quaternion()
            d = locs.get(nm)
            pb.location = (rest.to_3x3().inverted() @ Vector(d)) if d is not None else Vector()
            pb.scale = scales.get(nm, (1, 1, 1))
        bpy.context.view_layer.update()

    def reset_pose(self):
        for pb in self.arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
        bpy.context.view_layer.update()

    def low_point(self, mesh, pose, bones):
        """Lowest z of the deformed vertices whose strongest bone is in `bones` (posed)."""
        self.apply(pose)
        names = {g.index: g.name for g in mesh.vertex_groups}
        deps = bpy.context.evaluated_depsgraph_get()
        ev = mesh.evaluated_get(deps)
        me = ev.to_mesh()
        mw = ev.matrix_world
        lo = 1e9
        for v, vv in zip(mesh.data.vertices, me.vertices):
            if not v.groups:
                continue
            g = max(v.groups, key=lambda gg: gg.weight)
            if names.get(g.group) in bones:
                lo = min(lo, (mw @ vv.co).z)
        ev.to_mesh_clear()
        self.reset_pose()
        return lo

    def clip(self, name, frames, pose_fn, loop=True):
        arm = self.arm
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        arm.animation_data_create()
        arm.animation_data.action = act
        self._err = 0.0
        samples = []
        for f in range(frames + 1):
            p = f / frames
            if loop and f == frames:
                p = 0.0
            self._p = p
            samples.append((f, self.pose_quats(pose_fn(p))))
        prev = {}
        # only key location/scale on bones that actually move/scale in this clip (smaller files)
        use_loc = {nm for _, (r, l, sc) in samples for nm, d in l.items() if Vector(d).length > 1e-6}
        use_scale = {nm for _, (r, l, sc) in samples for nm, v in sc.items() if any(abs(x - 1) > 1e-6 for x in v)}
        for f, (rots, locs, scales) in samples:
            for nm in self.order:
                pb = arm.pose.bones[nm]
                rest = self.rest[nm]
                rr = rest.to_quaternion()
                q = rots.get(nm)
                ql = (rr.inverted() @ q @ rr) if q is not None else Quaternion()
                ql.normalize()
                if nm in prev and prev[nm].dot(ql) < 0:
                    ql.negate()
                prev[nm] = ql.copy()
                pb.rotation_quaternion = ql
                d = locs.get(nm)
                pb.location = (rest.to_3x3().inverted() @ Vector(d)) if d is not None else Vector()
                pb.scale = scales.get(nm, (1, 1, 1))
                pb.keyframe_insert('rotation_quaternion', frame=f)
                if nm in use_loc:
                    pb.keyframe_insert('location', frame=f)
                if nm in use_scale:
                    pb.keyframe_insert('scale', frame=f)
        act.use_frame_range = True
        act.frame_start = 0
        act.frame_end = frames
        act.use_cyclic = loop
        for pb in arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
        arm.animation_data.action = None
        self.report[name] = (frames, round(self._err, 4))
        if self._err > .01:
            print(f'  IK reach warning in {name}: max miss {self._err:.3f} m (leg, phase) {getattr(self, "_errw", None)}')
        return act

# ---------------------------------------------------------------- pose authoring helpers


def add(pose, key, val):
    """Accumulate Euler/loc tuples into a pose dict."""
    if key in pose and not isinstance(pose[key], Quaternion):
        pose[key] = tuple(a + b for a, b in zip(pose[key], val))
    else:
        pose[key] = tuple(val)
    return pose


def keyed(p, keys, loop=False, tension=1.0):
    """Interpolate flat pose dicts {key: tuple} through (t, pose) keys with a cardinal (Catmull-Rom
    style) spline in time. Once-clips hold still at the ends. 'ik' entries are {'leg': (x, y, z, deg)}."""
    ts = [k[0] for k in keys]
    n = len(keys)
    if loop:
        p = p % 1.0
    if p <= ts[0]:
        i = 0
        s = 0.0
    elif p >= ts[-1]:
        i = n - 2
        s = 1.0
    else:
        i = max(j for j in range(n - 1) if ts[j] <= p)
        s = (p - ts[i]) / max(ts[i + 1] - ts[i], 1e-9)
    names = set()
    for _, ps in keys:
        names.update(ps.keys())

    def val(ps, k):
        v = ps.get(k)
        if v is None:
            if k.endswith('@scale'):
                return (1.0, 1.0, 1.0)
            return None
        return tuple(v) if isinstance(v, (tuple, list)) else (v, v, v) if k.endswith('@scale') else v

    out = {'ik': {}}
    t0, t1 = ts[i], ts[i + 1]
    dt = t1 - t0
    for k in names:
        vals = [val(ps, k) for _, ps in keys]
        if vals[i] is None and vals[i + 1] is None:
            continue
        ln = len(next(v for v in vals if v is not None))
        vals = [v if v is not None else (0.0,) * ln for v in vals]

        def tang(j):
            if loop:
                jm, jp = (j - 1) % n, (j + 1) % n
                tm, tp = ts[jm] - (1 if jm > j else 0), ts[jp] + (1 if jp < j else 0)
            else:
                if j == 0 or j == n - 1:
                    return (0.0,) * ln
                jm, jp = j - 1, j + 1
                tm, tp = ts[jm], ts[jp]
            return tuple(tension * (b - a) / max(tp - tm, 1e-9) for a, b in zip(vals[jm], vals[jp]))
        m0, m1 = tang(i), tang(i + 1)
        h00, h10, h01, h11 = 2 * s ** 3 - 3 * s ** 2 + 1, s ** 3 - 2 * s ** 2 + s, -2 * s ** 3 + 3 * s ** 2, s ** 3 - s ** 2
        res = tuple(h00 * a + h10 * dt * ma + h01 * b + h11 * dt * mb
                    for a, b, ma, mb in zip(vals[i], vals[i + 1], m0, m1))
        if k.startswith('ik:'):
            out['ik'][k[3:]] = (Vector(res[:3]), res[3])
        else:
            out[k] = res
    if not out['ik']:
        del out['ik']
    return out


def merge(*poses):
    """Add several pose dicts together (Euler/loc tuples add, scale multiplies, IK: last wins)."""
    out = {}
    for ps in poses:
        for k, v in ps.items():
            if k == 'ik':
                out.setdefault('ik', {}).update(v)
            elif k.endswith('@scale'):
                v = v if isinstance(v, (tuple, list)) else (v, v, v)
                o = out.get(k, (1, 1, 1))
                out[k] = tuple(a * b for a, b in zip(o, v))
            elif isinstance(v, Quaternion) or isinstance(out.get(k), Quaternion):
                out[k] = v if k not in out else (Player._q(v) @ Player._q(out[k]))
            else:
                add(out, k, v)
    return out


def S(p, cycles=1.0, phase=0.0):
    return math.sin(TAU * (p * cycles + phase))


def C(p, cycles=1.0, phase=0.0):
    return math.cos(TAU * (p * cycles + phase))


def pulse(p, at, width):
    """Smooth 0..1..0 bump centred at `at` (cyclic, 0..1) with half-width `width`."""
    d = abs(((p - at + .5) % 1.0) - .5)
    return smooth(1 - d / width) if d < width else 0.0


def window(p, a, b, ease=.3):
    """Smooth 0->1->0 plateau between a and b (not cyclic); ease is the ramp fraction of (b-a)."""
    if p <= a or p >= b:
        return 0.0
    e = (b - a) * ease
    return smooth((p - a) / e) * smooth((b - p) / e)


def foot_path(p, phase, duty, sweep, lift, back_bias=0.0, curl=40.0, roll=12.0, tangent=.55):
    """Foot trajectory for one leg in body space: returns (dy, dz, paw_pitch_deg).
    Stance moves the contact point from -sweep/2 (front) to +sweep/2 (back) at constant speed; swing
    returns along a raised Hermite arc whose end velocities match the stance so there is no kink."""
    q = (p - phase) % 1.0
    if q < duty:
        s = q / duty
        y = -sweep / 2 + sweep * s
        # heel/toe roll: small lift of the heel near toe-off
        pitch = roll * smooth((s - .75) / .25)
        return y + back_bias, 0.0, pitch
    s = (q - duty) / (1 - duty)
    y0, y1 = sweep / 2, -sweep / 2
    m = sweep / duty * (1 - duty) * tangent
    h00, h10, h01, h11 = 2 * s ** 3 - 3 * s ** 2 + 1, s ** 3 - 2 * s ** 2 + s, -2 * s ** 3 + 3 * s ** 2, s ** 3 - s ** 2
    y = h00 * y0 + h10 * m + h01 * y1 + h11 * m
    z = lift * math.sin(math.pi * s) ** .9
    pitch = roll * (1 - smooth(s)) + curl * math.sin(math.pi * s) ** 1.2
    return y + back_bias, z, pitch

# ---------------------------------------------------------------- surface-conforming details

from mathutils.bvhtree import BVHTree


class Surface:
    """Nearest-point queries on a set of (world-space) meshes, for placing tufts, spots and clothing so
    they hug the body instead of floating or poking out."""

    def __init__(self, objs):
        bpy.context.view_layer.update()
        verts, polys = [], []
        for o in objs:
            mw = o.matrix_world
            base = len(verts)
            verts.extend(mw @ v.co for v in o.data.vertices)
            polys.extend([base + i for i in p.vertices] for p in o.data.polygons)
        self.tree = BVHTree.FromPolygons(verts, polys, epsilon=0.0)

    def near(self, p):
        loc, nrm, _, _ = self.tree.find_nearest(Vector(p))
        return loc, nrm.normalized()

    def ray(self, p, d, dist=2.0):
        loc, nrm, _, _ = self.tree.ray_cast(Vector(p), Vector(d).normalized(), dist)
        return (loc, nrm.normalized()) if loc is not None else self.near(p)

    def tuft(self, name, p, direction, length, width, material, lift=.3, flat=.55, tip=.25, n=6, sink=.35,
             curl=.0, mats=None, mat_fn=None):
        """Fur clump that starts embedded at the surface near p and sweeps along `direction` (projected
        onto the surface) with a gentle lift, like a sculpted lock."""
        a, na = self.near(p)
        d = Vector(direction)
        d = (d - na * d.dot(na)).normalized()
        b, nb = self.near(a + d * length * .55)
        c, nc = self.near(a + d * length)
        side = na.cross(d).normalized()
        pts = [a - na * width * sink, b + nb * width * (lift * .9) + side * curl * length * .3,
               c + nc * width * lift * 1.4 + side * curl * length]
        return lobe(name, pts, width, material, side=side, n=n, flat=flat, tip=tip, mats=mats, mat_fn=mat_fn)

    def spot(self, name, p, r, material, thick=.25, seg=8, rings=3, squash=None, dirn=None):
        """Flat oval decal-like bump lying on the surface (spots, patches, pads)."""
        loc, nrm = self.near(p) if dirn is None else self.ray(Vector(p) - Vector(dirn) * .3, dirn)
        rr = r if isinstance(r, (tuple, list)) else (r, r)
        q = nrm.to_track_quat('Z', 'Y')
        return sphere(name, (rr[0], rr[1], min(rr) * thick), loc + nrm * min(rr) * thick * .15, material,
                      seg=seg, rings=rings, rot=q.to_euler())


def conform_patch(name, surf, origin, px, py, v0, v1, width_fn, rows, cols, offset, thick, material,
                  rim_m=None, rim_r=0.0, smooth_iters=2, sink_edges=0.0, center_fn=None, ray_axis=None):
    """Cloth-like patch hugging a Surface: a parametric grid (rows along py from v0 to v1, each row
    spanning +-width_fn(t) along px) projected onto the surface, offset outward and given thickness.
    Rows are exact, so the outline is smooth (no stair-stepped face selection). ray_axis(p) -> origin
    projects each grid point by a ray cast from that origin (e.g. the body axis) instead of the nearest
    surface point, so markings can wrap around a body without folding."""
    origin, px, py = Vector(origin), Vector(px).normalized(), Vector(py).normalized()
    grid = []
    for i in range(rows + 1):
        t = i / rows
        v = v0 + (v1 - v0) * t
        w = max(width_fn(t), 1e-4)
        row = []
        cu = center_fn(t) if center_fn else 0.0
        for j in range(cols + 1):
            u = cu + w * (2 * j / cols - 1)
            q = origin + px * u + py * v
            if ray_axis is not None:
                o = Vector(ray_axis(q))
                loc, n = surf.ray(o, q - o, 2.0)
            else:
                loc, n = surf.near(q)
            row.append([loc, n])
        grid.append(row)
    for _ in range(smooth_iters):
        new = [[[r[0].copy(), r[1].copy()] for r in row] for row in grid]
        for i in range(1, rows):
            for j in range(1, cols):
                avg = (grid[i - 1][j][0] + grid[i + 1][j][0] + grid[i][j - 1][0] + grid[i][j + 1][0]) / 4
                new[i][j][0] = grid[i][j][0].lerp(avg, .5)
                nn = (grid[i - 1][j][1] + grid[i + 1][j][1] + grid[i][j - 1][1] + grid[i][j + 1][1] + grid[i][j][1])
                new[i][j][1] = nn.normalized()
        grid = new
    # smoothing moves points along chords (inside a convex body): project them back onto the surface
    for i in range(rows + 1):
        for j in range(cols + 1):
            q = grid[i][j][0]
            if ray_axis is not None:
                o = Vector(ray_axis(q))
                loc, n = surf.ray(o, q - o, 2.0)
            else:
                loc, n = surf.near(q)
            grid[i][j] = [loc, (n + grid[i][j][1]).normalized()]
    bm = bmesh.new()
    outer, inner = [], []
    for i, row in enumerate(grid):
        ro, ri = [], []
        for j, (p, n) in enumerate(row):
            edge = (i in (0, rows)) or (j in (0, cols))
            o = offset - (sink_edges if edge else 0)
            ro.append(bm.verts.new(p + n * (o + thick)))
            ri.append(bm.verts.new(p + n * o))
        outer.append(ro)
        inner.append(ri)
    for i in range(rows):
        for j in range(cols):
            bm.faces.new((outer[i][j], outer[i][j + 1], outer[i + 1][j + 1], outer[i + 1][j]))
            bm.faces.new((inner[i][j], inner[i + 1][j], inner[i + 1][j + 1], inner[i][j + 1]))
    loop = [(i, 0) for i in range(rows + 1)] + [(rows, j) for j in range(1, cols + 1)] + \
           [(i, cols) for i in range(rows - 1, -1, -1)] + [(0, j) for j in range(cols - 1, 0, -1)]
    for k in range(len(loop)):
        a, b = loop[k], loop[(k + 1) % len(loop)]
        try:
            bm.faces.new((outer[a[0]][a[1]], outer[b[0]][b[1]], inner[b[0]][b[1]], inner[a[0]][a[1]]))
        except ValueError:
            pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = from_bmesh(name, bm, material, smooth_angle=60)
    out = [ob]
    if rim_m is not None and rim_r > 0:
        from kit import tube
        pts = [grid[i][j][0] + grid[i][j][1] * (offset + thick * .5) for (i, j) in loop]
        out.append(tube(name + ' rim', pts, rim_r, rim_m, verts=4, closed=True))
    return out
