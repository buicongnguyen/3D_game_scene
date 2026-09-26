"""Architecture toolkit for the Starline buildings (used by build_architecture.py).

Design notes
  * Geometry is accumulated straight into per-material mesh builders (MB). An asset therefore ends up as
    one mesh per material (the join_by_material rule) without thousands of throwaway Blender objects.
  * Every builder carries a per-corner 'tint' colour. After the AO bake the tint is multiplied into COLOR_0,
    which gives tile / plank / stone variety and lets one wood material read as dark structural timber
    and as light planks without spending another material slot.
  * Pivot groups (Wheel, Deck, Bell, ChestLid ...) get their own builders parented to an empty that sits on
    the rotation axis with identity rotation.
  * Roofs come from a single height-field generator (Roof + Slope): stepped tile courses, round cover-tile
    lines with end discs, standing seams or staggered shingles, fascias, verges, soffits, rafters, ridges,
    hip caps and onigawara. Gables, hips, irimoya and pent roofs are just different slope polygons.
"""
import bpy, bmesh, math, random
import numpy as np
from mathutils import Vector, Matrix, Euler, Quaternion, noise
import kit
from kit import mat, srgb, link, empty, set_parent, bake_ao, TAU

V = Vector
Z = V((0, 0, 1))
OUT_DIR = [None]  # override (e.g. scratch dir for smoke tests); None -> public/models


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def tmul(t, k):
    """Scale a tint that may be a scalar or an rgb tuple."""
    if isinstance(t, (tuple, list)):
        return tuple(x * k for x in t)
    return t * k


def clamp(x, a, b):
    return max(a, min(b, x))

# ---------------------------------------------------------------- materials


def bsdf(m):
    return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def glow(name, base, emit_color, rough=.3, metal=0.):
    """Contract glow material: emission colour set, strength 0 (the runtime ramps it)."""
    m = mat(name, base, rough=rough, metal=metal)
    b = bsdf(m)
    b.inputs['Emission Color'].default_value = (*srgb(emit_color), 1)
    b.inputs['Emission Strength'].default_value = 0.0
    return m


def window_glow():
    return glow('Window glow', '#2b3d52', '#ffb347', rough=.12)


def lantern_glow():
    return glow('Lantern glow', '#e2482f', '#ffb347', rough=.55)

# ---------------------------------------------------------------- matrices


def rot3(rot):
    if rot is None:
        return Matrix.Identity(3)
    if isinstance(rot, Matrix):
        return rot.to_3x3()
    if isinstance(rot, Quaternion):
        return rot.to_matrix()
    if isinstance(rot, (int, float)):
        return Matrix.Rotation(rot, 3, 'Z')
    return Euler(rot).to_matrix()


def xform(c=(0, 0, 0), rot=None, scale=None):
    m = Matrix.Translation(V(c)) @ rot3(rot).to_4x4()
    if scale is not None:
        s = scale if isinstance(scale, (tuple, list)) else (scale,) * 3
        m = m @ Matrix.Diagonal((*s, 1))
    return m


def frame_x(xdir, up=Z):
    """3x3 rotation whose local X is xdir and local Z is as close to `up` as possible."""
    x = V(xdir).normalized()
    u = V(up)
    z = u - x * u.dot(x)
    if z.length < 1e-6:
        z = V((0, 1, 0)) - x * x.y
    z.normalize()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()

# ---------------------------------------------------------------- bmesh primitives (unit space)


def bm_box(size, ch=0., seg=1, taper=None, front=False):
    """Box with optional chamfer; front=True bevels only the edges of the local -Y face (the side that is seen)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = V((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if taper and v.co.z > 0:
            v.co.x *= taper[0]
            v.co.y *= taper[1]
    if ch > 0:
        edges = [e for e in bm.edges if all(v.co.y < 0 for v in e.verts)] if front else list(bm.edges)
        bmesh.ops.bevel(bm, geom=edges, offset=min(ch, min(size) * .45), offset_type='OFFSET',
                        segments=seg, profile=.5, affect='EDGES', clamp_overlap=True)
    return bm


def bm_cyl(r, h, n=12, r2=None, cap=True, ch=0., seg=1):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=n, radius1=r,
                          radius2=r if r2 is None else r2, depth=h)
    if ch > 0 and cap:
        rim = [e for e in bm.edges if all(abs(abs(v.co.z) - h / 2) < 1e-5 for v in e.verts)
               and len(e.link_faces) == 2 and any(len(f.verts) > 4 for f in e.link_faces)]
        bmesh.ops.bevel(bm, geom=rim, offset=min(ch, r * .45, h * .45), offset_type='OFFSET', segments=seg,
                        profile=.5, affect='EDGES', clamp_overlap=True)
    return bm


def bm_sphere(r, seg=10, rings=6):
    rr = r if isinstance(r, (tuple, list)) else (r,) * 3
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    for v in bm.verts:
        v.co = V((v.co.x * rr[0], v.co.y * rr[1], v.co.z * rr[2]))
    return bm


def bm_lathe(profile, n=16):
    """Revolve [(r, z), ...] about Z. r<=0 closes with a pole."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(TAU * i / n), r * math.sin(TAU * i / n), z)) for i in range(n)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for i in range(n):
            j = (i + 1) % n
            if len(a) == 1:
                bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[i], b[0], a[j]))
            else:
                bm.faces.new((a[i], b[i], b[j], a[j]))
    for ring in (rings[0], rings[-1]):
        if len(ring) > 2:
            bm.faces.new(ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bm_extrude(outline, depth, bevel=0., seg=1):
    """Outline [(u, v)] in the XZ plane, extruded along Y (centred)."""
    bm = bmesh.new()
    vs = [bm.verts.new((u, -depth / 2, v)) for u, v in outline]
    f = bm.faces.new(vs)
    ret = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [e for e in ret['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=V((0, depth, 0)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type='OFFSET', segments=seg, profile=.5,
                        affect='EDGES', clamp_overlap=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    return bm


def bm_loft(path, profile, up=Z, closed=True, caps=True, ups=None):
    """Sweep a 2D profile [(side, up)] along a 3D path. Frame: X = tangent, Z ~ up."""
    pts = [V(p) for p in path]
    bm = bmesh.new()
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        R = frame_x(t, ups[i] if ups else up)
        yv, zv = R.col[1], R.col[2]
        rings.append([bm.verts.new(p + yv * a + zv * b) for a, b in profile])
    m = len(profile)
    span = m if closed else m - 1
    for a, b in zip(rings, rings[1:]):
        for j in range(span):
            k = (j + 1) % m
            bm.faces.new((a[j], a[k], b[k], b[j]))
    if caps and closed and m > 2:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    else:
        # open sweep: every face points away from the path
        bm.normal_update()
        for f in bm.faces:
            c = f.calc_center_median()
            q = min(pts, key=lambda p: (p - c).length_squared)
            if f.normal.dot(c - q) < 0:
                f.normal_flip()
    return bm


def bm_poly(pts):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(V(p)) for p in pts])
    return bm

# ---------------------------------------------------------------- mesh builder


def _rgb(t):
    if t is None:
        return (1.0, 1.0, 1.0, 1.0)
    if isinstance(t, (int, float)):
        return (t, t, t, 1.0)
    return (t[0], t[1], t[2], 1.0)


class MB:
    """Per-material mesh accumulator with a per-corner 'tint' layer."""

    def __init__(self, material):
        self.material = material
        self.bm = bmesh.new()
        self.lay = self.bm.loops.layers.float_color.new('tint')
        self.tris = {}

    def append(self, src, M=None, tint=None, smooth=None, flat=False, tag='misc', weld=False):
        """Copy bmesh `src` (freed afterwards). smooth=angle in degrees derives sharp edges from the
        dihedral angle; None keeps the source flags. tint: scalar | rgb | callable(center, normal)->tint."""
        if weld:
            bmesh.ops.remove_doubles(src, verts=src.verts, dist=1e-5)
        if smooth is not None or flat:
            src.normal_update()
            lim = math.radians(smooth or 0)
            for f in src.faces:
                f.smooth = not flat
            for e in src.edges:
                e.smooth = (not flat) and (len(e.link_faces) != 2 or e.calc_face_angle(0.0) < lim)
        M = M if M is not None else Matrix.Identity(4)
        flip = M.to_3x3().determinant() < 0
        vm = {v: self.bm.verts.new(M @ v.co) for v in src.verts}
        n = 0
        fixed = None if callable(tint) else _rgb(tint)
        for f in src.faces:
            vs = [vm[v] for v in f.verts]
            if flip:
                vs.reverse()
            try:
                nf = self.bm.faces.new(vs)
            except ValueError:
                continue
            nf.smooth = f.smooth
            if fixed is None:
                nf.normal_update()
                col = _rgb(tint(nf.calc_center_median(), nf.normal))
            else:
                col = fixed
            for l in nf.loops:
                l[self.lay] = col
            n += len(vs) - 2
        for e in src.edges:
            if not e.smooth:
                ne = self.bm.edges.get((vm[e.verts[0]], vm[e.verts[1]]))
                if ne:
                    ne.smooth = False
        self.tris[tag] = self.tris.get(tag, 0) + n
        src.free()
        return self

    # --- convenience primitives (world space)
    def box(self, c, size, rot=None, ch=0., seg=1, tint=None, taper=None, tag='box', smooth=50, front=False):
        return self.append(bm_box(size, ch, seg, taper, front), xform(c, rot), tint, smooth=smooth, tag=tag)

    def beam(self, a, b, w, h, up=Z, ch=0., seg=1, tint=None, tag='beam', ext=0., smooth=50):
        a, b = V(a), V(b)
        d = b - a
        L = d.length + 2 * ext
        R = frame_x(d, up)
        return self.append(bm_box((L, w, h), ch, seg), Matrix.Translation((a + b) / 2) @ R.to_4x4(), tint,
                           smooth=smooth, tag=tag)

    def cyl(self, c, r, h, n=12, r2=None, rot=None, ch=0., seg=1, cap=True, tint=None, tag='cyl', smooth=50):
        return self.append(bm_cyl(r, h, n, r2, cap, ch, seg), xform(c, rot), tint, smooth=smooth, tag=tag)

    def rod(self, a, b, r, n=8, r2=None, tint=None, tag='rod', smooth=60, cap=True):
        a, b = V(a), V(b)
        d = b - a
        q = d.to_track_quat('Z', 'Y')
        return self.append(bm_cyl(r, d.length, n, r2, cap), xform((a + b) / 2, q), tint, smooth=smooth, tag=tag)

    def sphere(self, c, r, seg=10, rings=6, rot=None, tint=None, tag='sphere', smooth=80):
        return self.append(bm_sphere(r, seg, rings), xform(c, rot), tint, smooth=smooth, tag=tag)

    def lathe(self, profile, c=(0, 0, 0), n=16, rot=None, tint=None, tag='lathe', smooth=50, scale=None):
        return self.append(bm_lathe(profile, n), xform(c, rot, scale), tint, smooth=smooth, tag=tag)

    def extrude(self, outline, depth, c=(0, 0, 0), rot=None, bevel=0., seg=1, tint=None, tag='extrude', smooth=35):
        return self.append(bm_extrude(outline, depth, bevel, seg), xform(c, rot), tint, smooth=smooth, tag=tag)

    def loft(self, path, profile, up=Z, closed=True, caps=True, tint=None, tag='loft', smooth=50, ups=None):
        return self.append(bm_loft(path, profile, up, closed, caps, ups), None, tint, smooth=smooth, tag=tag)

    def poly(self, pts, tint=None, tag='poly', normal=None, smooth=None, flat=True):
        pts = [V(p) for p in pts]
        if normal is not None:
            nrm = (pts[1] - pts[0]).cross(pts[2] - pts[0])
            if nrm.dot(V(normal)) < 0:
                pts.reverse()
        return self.append(bm_poly(pts), None, tint, smooth=smooth, flat=flat and smooth is None, tag=tag)

    def torus(self, c, R, r, maj=12, mn=6, rot=None, tint=None, tag='torus', arc=1.0):
        bm = bmesh.new()
        rings = []
        n = maj if arc >= 1 else maj + 1
        for i in range(n):
            a = TAU * arc * i / maj
            ca, sa = math.cos(a), math.sin(a)
            rings.append([bm.verts.new(((R + r * math.cos(TAU * j / mn)) * ca, (R + r * math.cos(TAU * j / mn)) * sa,
                                        r * math.sin(TAU * j / mn))) for j in range(mn)])
        for i in range(len(rings) - (0 if arc >= 1 else 1)):
            r0, r1 = rings[i], rings[(i + 1) % len(rings)]
            for j in range(mn):
                bm.faces.new((r0[j], r1[j], r1[(j + 1) % mn], r0[(j + 1) % mn]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self.append(bm, xform(c, rot), tint, smooth=70, tag=tag)

    def take(self, ob, tint=None, tag='obj', smooth=None):
        """Absorb a Blender mesh object (e.g. from kit.*) and delete it."""
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        M = ob.matrix_world.copy()
        me = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if me.users == 0:
            bpy.data.meshes.remove(me)
        return self.append(bm, M, tint, smooth=smooth, tag=tag)

    def count(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def build(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        ob = link(bpy.data.objects.new(name, me))
        me.materials.append(self.material)
        return ob

# ---------------------------------------------------------------- asset


class Asset:
    """One exported model: static builders + pivot groups under a root empty."""

    def __init__(self, name, root_name):
        kit.reset()
        self.name, self.root_name = name, root_name
        self.root = empty(root_name)
        self.groups = {None: {}}
        self.pivots = {}
        self.pivot_cfg = {}
        self.markers = []
        self.rng = random.Random(hash(name) & 0xffff)

    def mb(self, material, group=None):
        g = self.groups.setdefault(group, {})
        if material.name not in g:
            g[material.name] = MB(material)
        return g[material.name]

    def pivot(self, name, loc, parent=None, ground=None, with_statics=False):
        """Create a pivot empty (identity rotation) and return its group key."""
        par = self.pivots[parent] if parent else self.root
        e = empty(name, loc)
        set_parent(e, par)
        self.pivots[name] = e
        self.groups.setdefault(name, {})
        self.pivot_cfg[name] = dict(ground=ground, with_statics=with_statics)
        return name

    def marker(self, name, loc, parent=None):
        """Plain contract empty (Flame, Chimney, PorchFlame, Noticeboard ...)."""
        par = self.pivots[parent] if parent else self.root
        e = empty(name, loc)
        set_parent(e, par)
        self.markers.append(e)
        return e

    def tri_report(self):
        rows = {}
        for g, mbs in self.groups.items():
            for mname, mb in mbs.items():
                for tag, n in mb.tris.items():
                    rows[tag] = rows.get(tag, 0) + n
        return sorted(rows.items(), key=lambda kv: -kv[1])

    def finish(self, ao_distance=1.2, ao_strength=.6, rays=40, ground=0.0, occluders=(), weighted=True):
        report = self.tri_report()
        total = sum(n for _, n in report)
        print(f'--- {self.name}: {total} tris')
        for tag, n in report[:40]:
            print(f'    {tag:28s} {n:6d}')
        objs = {}
        for g, mbs in self.groups.items():
            lst = []
            for mname, mb in mbs.items():
                if not mb.bm.faces:
                    mb.bm.free()
                    continue
                label = f'{self.root_name} {mname}' if g is None else f'{g} {mname}'
                lst.append(mb.build(label))
            objs[g] = lst
        statics = objs.get(None, [])
        movers = [o for g, l in objs.items() if g is not None for o in l]
        occ = list(occluders)
        bake_ao(statics, rays=rays, distance=ao_distance, strength=ao_strength, ground=ground,
                extra_occluders=movers + occ)
        for g, lst in objs.items():
            if g is None or not lst:
                continue
            cfg = self.pivot_cfg.get(g, {})
            bake_ao(lst, rays=rays, distance=ao_distance, strength=ao_strength, ground=cfg.get('ground'),
                    extra_occluders=(statics + occ) if cfg.get('with_statics') else ())
        for o in occ:
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if me and me.users == 0:
                bpy.data.meshes.remove(me)
        for g, lst in objs.items():
            parent = self.root if g is None else self.pivots[g]
            for o in lst:
                apply_tint(o)
                if weighted:
                    weighted_normals(o)
                set_parent(o, parent)
        return kit.export(self.name, [self.root], out_dir=OUT_DIR[0])


def apply_tint(ob):
    me = ob.data
    t = me.color_attributes.get('tint')
    c = me.color_attributes.get('Color')
    if t is None or c is None:
        return
    n = len(me.loops)
    a = np.empty(n * 4, dtype=np.float32)
    b = np.empty(n * 4, dtype=np.float32)
    c.data.foreach_get('color', a)
    t.data.foreach_get('color', b)
    out = np.clip(a * b, 0, 1)
    out[3::4] = 1.0
    c.data.foreach_set('color', out)
    me.color_attributes.remove(t)
    c = me.color_attributes.get('Color')
    me.color_attributes.active_color = c
    try:
        me.color_attributes.render_color_index = me.color_attributes.find('Color')
    except Exception:
        pass


def weighted_normals(ob, weight=50):
    """Face-area weighted normals that keep sharp edges: big planes stay flat, chamfers read soft."""
    mod = ob.modifiers.new('WN', 'WEIGHTED_NORMAL')
    mod.mode = 'FACE_AREA'
    mod.weight = weight
    mod.keep_sharp = True
    kit.apply_mods(ob)


def ground_occluder(poly, z=0.0):
    """A temporary occluder plane (partial ground, e.g. only the land side of a quay)."""
    me = bpy.data.meshes.new('occ')
    me.from_pydata([V((p[0], p[1], z)) for p in poly], [], [list(range(len(poly)))])
    return link(bpy.data.objects.new('occ', me))

# ---------------------------------------------------------------- 2D helpers


def clip_poly(poly, n, c):
    """Keep the part of convex polygon `poly` (list of 2D Vectors) where dot(p, n) >= c."""
    out = []
    m = len(poly)
    for i in range(m):
        a, b = poly[i], poly[(i + 1) % m]
        da, db = a.dot(n) - c, b.dot(n) - c
        if da >= -1e-9:
            out.append(a)
        if (da >= -1e-9) != (db >= -1e-9):
            t = da / (da - db)
            out.append(a + (b - a) * t)
    res = []
    for p in out:
        if not res or (p - res[-1]).length > 1e-6:
            res.append(p)
    if len(res) > 1 and (res[0] - res[-1]).length < 1e-6:
        res.pop()
    return res


def poly_area(poly):
    return .5 * sum(poly[i].x * poly[(i + 1) % len(poly)].y - poly[(i + 1) % len(poly)].x * poly[i].y
                    for i in range(len(poly)))


def line_range(poly, p0, dirv):
    """Parameter range [t0, t1] where p0 + dirv * t lies inside convex CCW polygon."""
    t0, t1 = -1e9, 1e9
    m = len(poly)
    for i in range(m):
        a, b = poly[i], poly[(i + 1) % m]
        e = b - a
        nrm = V((-e.y, e.x))
        c = nrm.dot(a)
        k = nrm.dot(dirv)
        base = nrm.dot(p0) - c
        if abs(k) < 1e-9:
            if base < 0:
                return None
            continue
        t = -base / k
        if k > 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
    return (t0, t1) if t1 > t0 else None

# ---------------------------------------------------------------- roofs


class Roof:
    """Shared height field: z = eave_z + g(d) + lift(p), d = plan distance from the slope's eave line.
    g is concave (flatter at the eave, steeper near the ridge) with `sag` in 0..0.5."""

    def __init__(self, eave_z, pitch, D0, sag=.22, lift=None):
        self.eave_z, self.pitch, self.D0, self.sag, self.lift = eave_z, pitch, D0, sag, lift

    def g(self, d):
        return self.pitch * d * (1 - self.sag + self.sag * d / self.D0)

    def z(self, p, d):
        return self.eave_z + self.g(d) + (self.lift(p) if self.lift else 0.0)


class Slope:
    """One roof plane over a convex plan polygon, eave line a->b. edges: per polygon edge i (poly[i]->poly[i+1])
    one of 'eave', 'verge', 'ridge', 'hip', 'wall' (decides fascia / side faces)."""

    def __init__(self, roof, poly, a, b, edges=None):
        self.roof = roof
        poly = [V((p[0], p[1])) for p in poly]
        if poly_area(poly) < 0:
            poly.reverse()
            if edges:
                edges = list(reversed(edges[:-1])) + [edges[-1]]
                edges = edges  # caller should pass CCW; kept for safety
        self.poly = poly
        self.a, self.b = V((a[0], a[1])), V((b[0], b[1]))
        self.t = (self.b - self.a).normalized()
        self.n = V((-self.t.y, self.t.x))
        cen = sum(poly, V((0, 0))) / len(poly)
        if (cen - self.a).dot(self.n) < 0:
            self.n = -self.n
        self.edges = edges or ['eave'] * len(poly)
        self.dmax = max(self.d(p) for p in poly)
        self.umin = min(self.u(p) for p in poly)
        self.umax = max(self.u(p) for p in poly)

    def d(self, p):
        return (V((p[0], p[1])) - self.a).dot(self.n)

    def u(self, p):
        return (V((p[0], p[1])) - self.a).dot(self.t)

    def pt(self, u, d):
        return self.a + self.t * u + self.n * d

    def z(self, p):
        return self.roof.z(p, self.d(p))

    def P(self, p, off=0.0):
        return V((p[0], p[1], self.z(p) + off))

    def normal(self, p):
        e = .05
        p = V((p[0], p[1]))
        du = self.P(p + self.t * e) - self.P(p - self.t * e)
        dd = self.P(p + self.n * e) - self.P(p - self.n * e)
        nrm = du.cross(dd).normalized()
        return nrm if nrm.z > 0 else -nrm

    def down(self, p):
        """3D unit vector pointing down-slope (toward the eave) along the surface."""
        p = V((p[0], p[1]))
        e = .05
        return (self.P(p - self.n * e) - self.P(p + self.n * e)).normalized()

    def edge_kind(self, a, b):
        """Kind of the polygon edge that segment a-b lies on (or None)."""
        m = len(self.poly)
        for i in range(m):
            p, q = self.poly[i], self.poly[(i + 1) % m]
            e = q - p
            L = e.length
            if L < 1e-9:
                continue
            nrm = V((-e.y, e.x)) / L
            if abs(nrm.dot(a - p)) < 1e-4 and abs(nrm.dot(b - p)) < 1e-4:
                return self.edges[i]
        return None


ROOF_STYLES = {
    # Kawabe hongawara: stepped courses, round cover-tile lines with end discs
    'kawara': dict(course=.42, lip=.05, pitch=.42, line_r=.085, line_sides=4, caps=True, thick=.2, cells=True,
                   var=.12, seam=False, stagger=False),
    # Takamori flat tiles / shingles: staggered cells with per-tile tone, stepped courses
    'shingle': dict(course=.34, lip=.045, pitch=.40, line_r=0, caps=False, thick=.18, cells=True, var=.16,
                    seam=False, stagger=True),
    # tin roof with standing seams
    'seam': dict(course=1.6, lip=.02, pitch=.46, line_r=.035, line_sides=0, caps=False, thick=.14, cells=False,
                 var=.05, seam=True, stagger=False),
    # small plain tiled roofs (lamps, gates)
    'plain': dict(course=.3, lip=.035, pitch=0, line_r=0, caps=False, thick=.12, cells=False, var=.08,
                  seam=False, stagger=False),
}


def tile_slope(A, slope, roof_mat, st, under_mat=None, fascia_mat=None, seed=0, group=None, tag='roof',
               soffit=True):
    """Build pan courses, cover lines, fascia, verge sides and soffit for one slope."""
    rng = random.Random(seed)
    mb = A.mb(roof_mat, group)
    ub = A.mb(under_mat or roof_mat, group)
    fb = A.mb(fascia_mat or roof_mat, group)
    course, lip, thick = st['course'], st['lip'], st['thick']
    K = max(1, int(math.ceil(slope.dmax / course - 1e-6)))
    ds = [min(slope.dmax, k * course) for k in range(K + 1)]
    ds[-1] = slope.dmax
    t3 = V((slope.t.x, slope.t.y, 0))
    dn3 = -V((slope.n.x, slope.n.y, 0))
    ucen = (slope.umin + slope.umax) / 2
    nc = slope.n.dot(slope.a)
    tc = slope.t.dot(slope.a)

    def saw(d, k):
        span = max(ds[k + 1] - ds[k], 1e-6)
        return lip * (1 - (d - ds[k]) / span)

    bm = bmesh.new()
    colmap = {}

    def face(pts, want, col):
        try:
            f = bm.faces.new([bm.verts.new(p) for p in pts])
        except ValueError:
            return None
        f.normal_update()
        if f.normal.dot(want) < 0:
            f.normal_flip()
        colmap[f] = col
        return f

    for k in range(K):
        band = clip_poly(slope.poly, slope.n, nc + ds[k])
        band = clip_poly(band, -slope.n, -(nc + ds[k + 1]))
        if len(band) < 3:
            continue
        cw = st['pitch'] * st.get('cell_mult', 1) if st['cells'] else 1.3
        off = (cw / 2 if (st['stagger'] and k % 2) else 0.0)
        j0 = math.floor((slope.umin - ucen - off) / cw) - 1
        j1 = math.ceil((slope.umax - ucen - off) / cw) + 1
        course_tone = 1 - st['var'] * .5 * rng.random()
        for j in range(j0, j1):
            ua, ub_ = ucen + off + j * cw, ucen + off + (j + 1) * cw
            cell = clip_poly(band, slope.t, tc + ua)
            if len(cell) < 3:
                continue
            cell = clip_poly(cell, -slope.t, -(tc + ub_))
            if len(cell) < 3 or abs(poly_area(cell)) < 1e-5:
                continue
            tone = course_tone * (1 - st['var'] * rng.random()) if st['cells'] else course_tone
            warm = 1 + .05 * (rng.random() - .5)
            col = (tone * warm, tone, tone / warm)
            dark = (col[0] * .62, col[1] * .62, col[2] * .66)
            face([slope.P(p, saw(slope.d(p), k)) for p in cell], Z, col)
            m = len(cell)
            for i in range(m):
                p, q = cell[i], cell[(i + 1) % m]
                dp, dq = slope.d(p), slope.d(q)
                kind = slope.edge_kind(p, q)
                if abs(dp - ds[k]) < 1e-4 and abs(dq - ds[k]) < 1e-4:
                    if k == 0:
                        if kind in ('eave', None):
                            face([slope.P(q, saw(dq, k)), slope.P(p, saw(dp, k)), slope.P(p, -thick * .45),
                                  slope.P(q, -thick * .45)], dn3, dark)
                            fb.poly([slope.P(q, -thick * .45), slope.P(p, -thick * .45), slope.P(p, -thick),
                                     slope.P(q, -thick)], tint=.9, normal=dn3, tag=tag + ' fascia')
                    else:
                        face([slope.P(q, lip), slope.P(p, lip), slope.P(p, 0), slope.P(q, 0)], dn3, dark)
                elif kind == 'verge':
                    e = q - p
                    out = V((e.y, -e.x, 0)).normalized()
                    face([slope.P(q, saw(dq, k)), slope.P(p, saw(dp, k)), slope.P(p, -thick), slope.P(q, -thick)],
                         out, dark)
    _append_colored(mb, bm, colmap, tag=tag + ' pan', smooth=30)

    # --- soffit (underside) in bands of two courses
    if soffit:
        ubm = bmesh.new()
        for k in range(0, K, 2):
            k2 = min(K, k + 2)
            band = clip_poly(slope.poly, slope.n, nc + ds[k])
            band = clip_poly(band, -slope.n, -(nc + ds[k2]))
            if len(band) < 3:
                continue
            f = ubm.faces.new([ubm.verts.new(slope.P(p, -thick)) for p in band])
            f.normal_update()
            if f.normal.z > 0:
                f.normal_flip()
        ub.append(ubm, tint=.85, smooth=20, tag=tag + ' soffit')

    # --- cover lines (round tiles or standing seams)
    if st['line_r'] > 0:
        r = st['line_r']
        pu = st['pitch']
        j0 = math.floor((slope.umin - ucen) / pu) - 1
        j1 = math.ceil((slope.umax - ucen) / pu) + 1
        for j in range(j0, j1 + 1):
            u = ucen + j * pu + pu / 2
            rg = line_range(slope.poly, slope.pt(u, 0), slope.n)
            if rg is None:
                continue
            d0, d1 = max(rg[0], 0.0), rg[1] - .03
            if d1 - d0 < .12:
                continue
            if min(u - slope.umin, slope.umax - u) < r * 1.6:
                continue
            dd = [d0] + [x for x in ds if d0 + .02 < x < d1 - .02] + [d1]
            path, ups = [], []
            for d in dd:
                p = slope.pt(u, d)
                ups.append(slope.normal(p))
                path.append(slope.P(p, lip * .45))
            tone = 1 - st['var'] * .8 * rng.random()
            if st['seam']:
                prof = [(-r * .5, -.01), (r * .5, -.01), (r * .5, r * 1.3), (-r * .5, r * 1.3)]
                mb.append(bm_loft(path, prof, ups=ups), None, tint=tone * .95, smooth=30, tag=tag + ' seams')
            else:
                ns = st['line_sides']
                prof = []
                for i in range(ns + 1):
                    th = math.radians(-12 + 204 * i / ns)
                    prof.append((math.cos(th) * r, math.sin(th) * r * .95))
                bml = bm_loft(path, prof, closed=False, caps=False, ups=ups)
                mb.append(bml, None, tint=(tone, tone * .98, tone * .96), smooth=65, tag=tag + ' lines')
                if st['caps']:
                    p0 = slope.pt(u, d0)
                    c0 = path[0]
                    dn = slope.down(p0)
                    side = t3.normalized()
                    upv = ups[0]
                    ring = [c0 + dn * .014 + side * math.cos(TAU * i / 8) * r * 1.12 + upv * math.sin(TAU * i / 8) * r * 1.05
                            for i in range(8)]
                    mb.poly(ring, tint=tone * .8, normal=dn, tag=tag + ' caps')
    return slope


def _append_colored(mb, bm, colmap, tag, smooth=30):
    """Append bmesh with per-face colours (dict face->rgb)."""
    bm.normal_update()
    lim = math.radians(smooth)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = len(e.link_faces) != 2 or e.calc_face_angle(0.0) < lim
    vm = {v: mb.bm.verts.new(v.co) for v in bm.verts}
    n = 0
    for f in bm.faces:
        vs = [vm[v] for v in f.verts]
        try:
            nf = mb.bm.faces.new(vs)
        except ValueError:
            continue
        nf.smooth = True
        col = _rgb(colmap.get(f, (1, 1, 1)))
        for l in nf.loops:
            l[mb.lay] = col
        n += len(vs) - 2
    for e in bm.edges:
        if not e.smooth:
            ne = mb.bm.edges.get((vm[e.verts[0]], vm[e.verts[1]]))
            if ne:
                ne.smooth = False
    mb.tris[tag] = mb.tris.get(tag, 0) + n
    bm.free()


def ridge(A, mat_, path, w=.36, layers=2, lh=.075, cap_r=.13, tint=.92, group=None, tag='ridge', n_cap=6):
    """Stacked noshi-gawara ridge with a round cap tile, lofted along a 3D path (list of points)."""
    prof = []
    half = [w / 2 - i * .028 for i in range(layers)]
    prof.append((-half[0], -.12))
    for i in range(layers):
        prof.append((-half[i], i * lh + lh * .15))
        prof.append((-half[i], (i + 1) * lh))
        if i + 1 < layers:
            prof.append((-half[i + 1], (i + 1) * lh))
    top = layers * lh
    cr = min(cap_r, half[-1] + .01)
    for i in range(n_cap + 1):
        th = math.pi - math.pi * i / n_cap
        prof.append((math.cos(th) * cr, top + math.sin(th) * cr * .9))
    rhs = [(-a, b) for a, b in reversed(prof[:-(n_cap + 1)])]
    prof = prof + rhs
    # remove near duplicates
    clean = []
    for p in prof:
        if not clean or (V(p) - V(clean[-1])).length > 1e-4:
            clean.append(p)
    A.mb(mat_, group).loft(path, clean, closed=True, caps=True, tint=tint, tag=tag, smooth=40)


def onigawara(A, mat_, c, facing, size=.62, tint=.8, group=None, tag='oni'):
    """Stylised ridge-end tile: a chunky shield with horns and a boss, facing along `facing` (2D)."""
    s = size
    out = [(-.5, 0), (.5, 0), (.52, .45), (.66, .78), (.44, .7), (.3, .92), (0, 1.0), (-.3, .92), (-.44, .7),
           (-.66, .78), (-.52, .45)]
    outline = [(x * s * .8, y * s) for x, y in out]
    f = V((facing[0], facing[1], 0)).normalized()
    ang = math.atan2(f.y, f.x) - math.pi / 2  # extrude along local Y -> facing
    mb = A.mb(mat_, group)
    mb.extrude(outline, .12, c, (0, 0, ang), bevel=0, tint=tint, tag=tag)
    mb.cyl(V(c) + f * .07 + V((0, 0, s * .52)), s * .2, .06, n=8, rot=f.to_track_quat('Z', 'Y'),
           tint=tint * .9, tag=tag)


def hip_cap(A, mat_, slope_a, p_low, p_high, n=6, w=.26, tint=.9, group=None, tag='hip', lift=.02):
    """Ridge cap along a hip line (plan points); heights from slope_a."""
    path = []
    for i in range(n + 1):
        t = i / n
        p = V(p_low).lerp(V(p_high), t)
        path.append(slope_a.P(p, lift))
    ridge(A, mat_, path, w=w, layers=1, lh=.06, cap_r=.1, tint=tint, group=group, tag=tag, n_cap=5)


def rafters(A, mat_, slope, d_wall, spacing=.45, w=.08, h=.1, tint=.45, margin=.25, group=None, tag='rafters',
            thick=None):
    st_thick = thick if thick is not None else .2
    mb = A.mb(mat_, group)
    L = slope.umax - slope.umin
    n = int(L / spacing)
    for i in range(n + 1):
        u = slope.umin + (L - n * spacing) / 2 + i * spacing
        rg = line_range(slope.poly, slope.pt(u, 0), slope.n)
        if rg is None or rg[0] > .05:
            continue
        if u - slope.umin < margin or slope.umax - u < margin:
            continue
        pa, pb = slope.pt(u, .06), slope.pt(u, min(d_wall + .05, rg[1]))
        za = slope.P(pa, -st_thick - h / 2)
        zb = slope.P(pb, -st_thick - h / 2)
        mb.beam(za, zb, w, h, up=Z, ch=0, tint=tint, tag=tag)


def gable_roof(A, roof_mat, x0, x1, y0, y1, eave_z, pitch, sag=.2, style='kawara', under_mat=None,
               fascia_mat=None, ridge_mat=None, oni=True, lift=None, seed=1, group=None, ridge_w=.36,
               ridge_layers=2, ridge_tint=.9):
    """Gable roof with the ridge along X at y=(y0+y1)/2. Returns (front slope, back slope, roof)."""
    st = ROOF_STYLES[style] if isinstance(style, str) else style
    yc = (y0 + y1) / 2
    D = (y1 - y0) / 2
    roof = Roof(eave_z, pitch, D, sag, lift)
    front = Slope(roof, [(x0, y0), (x1, y0), (x1, yc), (x0, yc)], (x0, y0), (x1, y0),
                  ['eave', 'verge', 'ridge', 'verge'])
    back = Slope(roof, [(x1, y1), (x0, y1), (x0, yc), (x1, yc)], (x1, y1), (x0, y1),
                 ['eave', 'verge', 'ridge', 'verge'])
    for i, s in enumerate((front, back)):
        tile_slope(A, s, roof_mat, st, under_mat, fascia_mat, seed=seed + i, group=group)
    if ridge_mat is not False:
        rm = ridge_mat or roof_mat
        path = []
        for i in range(13):
            t = i / 12
            x = lerp(x0 - .04, x1 + .04, t)
            up = .1 * smoothstep(.72, 1.0, abs(t - .5) * 2) ** 1.3
            path.append(V((x, yc, front.z(V((x, yc))) + up)))
        ridge(A, rm, path, w=ridge_w, layers=ridge_layers, tint=ridge_tint, group=group)
        if oni:
            for sx, p in ((-1, path[0]), (1, path[-1])):
                onigawara(A, rm, p + V((sx * .02, 0, -.1)), (sx, 0), size=.5 + ridge_layers * .06, group=group)
    return front, back, roof


def bargeboard(A, mat_, slope, p_eave, p_top, h=.3, t=.08, tint=.5, n=8, group=None, tag='barge', top_off=.06,
               out=None):
    """Board along a verge from plan point p_eave to p_top, sitting just outside the verge."""
    p_eave, p_top = V(p_eave), V(p_top)
    e = p_top - p_eave
    o = out if out is not None else V((e.y, -e.x)).normalized()
    cen = sum(slope.poly, V((0, 0))) / len(slope.poly)
    if o.dot(p_eave - cen) < 0:
        o = -o
    path = []
    for i in range(n + 1):
        p = p_eave.lerp(p_top, i / n)
        q = p + o * (t / 2 + .005)
        path.append(V((q.x, q.y, slope.z(p) + top_off)))
    prof = [(-t / 2, -h), (t / 2, -h), (t / 2, 0), (-t / 2, 0)]
    A.mb(mat_, group).loft(path, prof, up=Z, tint=tint, tag=tag, smooth=30)


# ---------------------------------------------------------------- walls


class Face:
    """A wall plane: origin at its left-bottom (as seen from outside), outward normal n (horizontal).
    Local coords: u to the viewer's right, z up, d outward."""

    def __init__(self, origin, normal):
        self.o = V(origin)
        self.n = V(normal).normalized()
        self.u = Z.cross(self.n).normalized()

    def p(self, u, z, d=0.):
        return self.o + self.u * u + Z * z + self.n * d

    @property
    def rot(self):
        return math.atan2(self.u.y, self.u.x)

    def box(self, mb, u, z, d, su, sz, sd, ch=0., seg=1, tint=None, tag='fbox', taper=None, front=True):
        """Box centred at (u, z, d) with sizes along u, z, d. Chamfers only the outward face by default."""
        return mb.box(self.p(u, z, d), (su, sd, sz), rot=(0, 0, self.rot), ch=ch, seg=seg, tint=tint, tag=tag,
                      taper=taper, front=front)

    def quad(self, mb, u0, z0, u1, z1, d=0., tint=None, tag='fquad'):
        pts = [self.p(u0, z0, d), self.p(u1, z0, d), self.p(u1, z1, d), self.p(u0, z1, d)]
        return mb.poly(pts, tint=tint, tag=tag)


def rect_face(x0, x1, y0, y1, side):
    """Face helpers for an axis-aligned footprint: side in '-y', '+x', '+y', '-x'."""
    if side == '-y':
        return Face((x0, y0, 0), (0, -1, 0)), x1 - x0
    if side == '+x':
        return Face((x1, y0, 0), (1, 0, 0)), y1 - y0
    if side == '+y':
        return Face((x1, y1, 0), (0, 1, 0)), x1 - x0
    return Face((x0, y1, 0), (-1, 0, 0)), y1 - y0


def _split(vals, a, b, step):
    s = {a, b}
    for v in vals:
        if a < v < b:
            s.add(v)
    n = max(1, int(round((b - a) / step)))
    for i in range(1, n):
        s.add(a + (b - a) * i / n)
    out = []
    for v in sorted(s):
        if not out or v - out[-1] > 1e-4:
            out.append(v)
    return out


def panel(mb, face, u0, u1, z0, z1, holes=(), d=0., du=1.2, dz=.5, tint=None, tag='wall', top=None):
    """Flat wall panel with rectangular holes [(ua, ub, za, zb)], subdivided for AO sampling.
    top: optional callable u -> z (gable / sloped top; may carry a .breaks list of kink positions)."""
    extra = [h[0] for h in holes] + [h[1] for h in holes]
    if top is not None:
        extra += list(getattr(top, 'breaks', []))
    us = _split(extra, u0, u1, du)
    zmax = z1 if top is None else max(z1, max(top(u) for u in us))
    zs = _split([h[2] for h in holes] + [h[3] for h in holes], z0, zmax, dz)
    bm = bmesh.new()
    cache = {}

    def vert(u, z):
        key = (round(u, 5), round(z, 5))
        if key not in cache:
            cache[key] = bm.verts.new(face.p(u, z, d))
        return cache[key]

    for i in range(len(us) - 1):
        for j in range(len(zs) - 1):
            ua, ub, za, zb = us[i], us[i + 1], zs[j], zs[j + 1]
            cu, cz = (ua + ub) / 2, (za + zb) / 2
            if any(h[0] - 1e-6 <= cu <= h[1] + 1e-6 and h[2] - 1e-6 <= cz <= h[3] + 1e-6 for h in holes):
                continue
            cell = [V((ua, za)), V((ub, za)), V((ub, zb)), V((ua, zb))]
            if top is not None:
                ta, tb = top(ua), top(ub)
                if max(ta, tb) <= za + 1e-6:
                    continue
                if min(ta, tb) < zb - 1e-6:
                    s = (tb - ta) / (ub - ua)
                    cell = clip_poly(cell, V((s, -1)), s * ua - ta)
                    if len(cell) < 3 or abs(poly_area(cell)) < 1e-6:
                        continue
            try:
                bm.faces.new([vert(p.x, p.y) for p in cell])
            except ValueError:
                pass
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(face.n) < 0:
            f.normal_flip()
    mb.append(bm, tint=tint, smooth=10, tag=tag)


def gable_top(z_eave, z_apex, u_apex, u0, u1):
    """Callable top line for a gable wall (kink at the apex)."""
    def f(u):
        if u <= u_apex:
            return z_eave + (z_apex - z_eave) * (u - u0) / max(u_apex - u0, 1e-6)
        return z_eave + (z_apex - z_eave) * (u1 - u) / max(u1 - u_apex, 1e-6)
    f.breaks = [u_apex]
    return f


def reveal(mb, face, hole, depth, d=0., tint=.8, tag='reveal', sides='lrtb'):
    ua, ub, za, zb = hole
    q = []
    if 'l' in sides:
        q.append(([face.p(ua, za, d), face.p(ua, zb, d), face.p(ua, zb, d - depth), face.p(ua, za, d - depth)], face.u))
    if 'r' in sides:
        q.append(([face.p(ub, za, d), face.p(ub, zb, d), face.p(ub, zb, d - depth), face.p(ub, za, d - depth)], -face.u))
    if 't' in sides:
        q.append(([face.p(ua, zb, d), face.p(ub, zb, d), face.p(ub, zb, d - depth), face.p(ua, zb, d - depth)], -Z))
    if 'b' in sides:
        q.append(([face.p(ua, za, d), face.p(ub, za, d), face.p(ub, za, d - depth), face.p(ua, za, d - depth)], Z))
    for pts, nrm in q:
        mb.poly(pts, tint=tint, normal=nrm, tag=tag)


def clapboard(mb, face, u0, u1, z0, z1, holes=(), d=0., board=.2, lap=.035, rng=None, var=.08, tag='clapboard',
              top=None, du=1.6):
    """Lap siding: each board tilts out at its bottom edge and has a shadowed lip.
    top: optional callable u -> z (gable) clipping boards."""
    rng = rng or random.Random(3)
    bm = bmesh.new()
    colmap = {}
    zmax = z1 if top is None else max(z1, top(u0), top(u1), top((u0 + u1) / 2))
    nrows = int(math.ceil((zmax - z0) / board - 1e-6))
    for r in range(nrows):
        zb, zt = z0 + r * board, z0 + (r + 1) * board
        tone = 1 - var * rng.random()
        # free u intervals for this row
        cuts = []
        for h in holes:
            if h[2] < zt - 1e-6 and h[3] > zb + 1e-6:
                cuts.append(h)
        us = _split([h[0] for h in cuts] + [h[1] for h in cuts] + list(getattr(top, 'breaks', [])), u0, u1, du)
        for i in range(len(us) - 1):
            ua, ub = us[i], us[i + 1]
            cu = (ua + ub) / 2
            za, zc = zb, zt
            skip = False
            for h in cuts:
                if h[0] - 1e-6 <= cu <= h[1] + 1e-6:
                    if h[2] <= zb + 1e-6 and h[3] >= zt - 1e-6:
                        skip = True
                    elif h[2] > zb:
                        zc = min(zc, h[2])
                    else:
                        za = max(za, h[3])
            if skip or zc - za < 1e-4:
                continue
            if top is not None:
                ta, tb = top(ua), top(ub)
                if min(ta, tb) <= za:
                    if max(ta, tb) <= za + 1e-4:
                        continue
                    # shrink interval to where the top is above za
                    if ta < tb:
                        ua = ua + (ub - ua) * (za - ta) / (tb - ta)
                    else:
                        ub = ub - (ub - ua) * (za - tb) / (ta - tb)
                    ta, tb = top(ua), top(ub)
                zca, zcb = min(zc, ta), min(zc, tb)
            else:
                zca = zcb = zc

            def dep(z):
                return d + lap * (1 - (z - zb) / board)
            vs = [bm.verts.new(face.p(ua, za, dep(za))), bm.verts.new(face.p(ub, za, dep(za))),
                  bm.verts.new(face.p(ub, zcb, dep(zcb))), bm.verts.new(face.p(ua, zca, dep(zca)))]
            f = bm.faces.new(vs)
            colmap[f] = (tone, tone, tone)
            if za == zb:
                vl = [bm.verts.new(face.p(ua, zb, d)), bm.verts.new(face.p(ub, zb, d)),
                      bm.verts.new(face.p(ub, zb, d + lap)), bm.verts.new(face.p(ua, zb, d + lap))]
                f2 = bm.faces.new(vl)
                colmap[f2] = (tone * .55, tone * .55, tone * .6)
    bm.normal_update()
    for f in bm.faces:
        if abs(f.normal.z) > .7:
            if f.normal.z > 0:
                f.normal_flip()
        elif f.normal.dot(face.n) < 0:
            f.normal_flip()
    _append_colored(mb, bm, colmap, tag=tag, smooth=20)


def boards_v(mb, face, u0, u1, z0, z1, d=0., w=.24, rng=None, var=.14, tag='boards', batten=None, groove=.012,
             holes=(), base=1.0, top=None):
    """Vertical board cladding: per-board tone with shallow V grooves. batten=(mb, every) adds battens."""
    rng = rng or random.Random(5)
    n = max(1, int(round((u1 - u0) / w)))
    bw = (u1 - u0) / n
    bm = bmesh.new()
    colmap = {}
    for i in range(n):
        ua, ub = u0 + i * bw, u0 + (i + 1) * bw
        cu = (ua + ub) / 2
        zt = z1 if top is None else min(z1, top(cu))
        if zt <= z0 + .02:
            continue
        segs = [(z0, zt)]
        for h in holes:
            if h[0] - 1e-6 <= cu <= h[1] + 1e-6:
                new = []
                for a, b in segs:
                    if h[3] <= a or h[2] >= b:
                        new.append((a, b))
                    else:
                        if h[2] > a:
                            new.append((a, h[2]))
                        if h[3] < b:
                            new.append((h[3], b))
                segs = new
        tone = base * (1 - var * rng.random())
        for za, zb in segs:
            zs = _split([], za, zb, .7)
            for j in range(len(zs) - 1):
                pts = [face.p(ua + groove, zs[j], d), face.p(ub - groove, zs[j], d),
                       face.p(ub - groove, zs[j + 1], d), face.p(ua + groove, zs[j + 1], d)]
                f = bm.faces.new([bm.verts.new(p) for p in pts])
                colmap[f] = (tone, tone, tone)
                if groove > 0:
                    for ue, ui in ((ua, ua + groove), (ub, ub - groove)):
                        g = [face.p(ue, zs[j], d - groove), face.p(ui, zs[j], d), face.p(ui, zs[j + 1], d),
                             face.p(ue, zs[j + 1], d - groove)]
                        f2 = bm.faces.new([bm.verts.new(p) for p in g])
                        colmap[f2] = (tone * .6, tone * .6, tone * .6)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(face.n) < 0:
            f.normal_flip()
    _append_colored(mb, bm, colmap, tag=tag, smooth=20)
    if batten:
        bmb, every = batten
        for i in range(0, n + 1, every):
            u = u0 + i * bw
            if u0 + .05 < u < u1 - .05:
                zt_ = z1 if top is None else min(z1, top(u))
                face.box(bmb, u, (z0 + zt_) / 2, d + .02, .06, zt_ - z0, .04, tint=base * .9, tag=tag + ' batten')

# ---------------------------------------------------------------- stone work


def stone(mb, c, size, rot=0., rng=None, tint=None, ch=None, tag='stone', seg=1, lumpy=.18):
    """A chunky dressed stone: chamfered box with a slightly domed, jittered face."""
    rng = rng or random.Random(1)
    sx, sy, sz = size
    bm = bm_box(size, 0, taper=(1 - .12 * rng.random(), 1 - .12 * rng.random()))
    cw = ch if ch is not None else min(sx, sy, sz) * .22
    front = [e for e in bm.edges if all(v.co.y < 0 for v in e.verts)]
    bmesh.ops.bevel(bm, geom=front, offset=cw, offset_type='OFFSET', segments=seg, profile=.5, affect='EDGES',
                    clamp_overlap=True)
    for v in bm.verts:
        v.co.x += (rng.random() - .5) * sx * .08
        v.co.z += (rng.random() - .5) * sz * .08
        if v.co.y < 0:  # front face bulge (local -Y faces the outside)
            v.co.y -= lumpy * min(sx, sz) * (1 - (2 * v.co.x / sx) ** 2) * .3
    if tint is None:
        k = .82 + .18 * rng.random()
        tint = (k * (1 + .03 * (rng.random() - .5)), k, k * (1 - .03 * rng.random()))
    mb.append(bm, xform(c, (0, 0, rot)), tint, smooth=40, tag=tag)


def stone_band(mb, face, u0, u1, z0, z1, d=0., rows=1, rng=None, wmin=.45, wmax=.85, depth=.28, tone=None,
               tag='stones', gap=.03, moss=None):
    """Rows of individual stones laid along a face between z0 and z1 (running bond)."""
    rng = rng or random.Random(7)
    h = (z1 - z0) / rows
    for r in range(rows):
        u = u0 - (rng.uniform(0, wmin) if r % 2 else 0)
        while u < u1 - .05:
            w = rng.uniform(wmin, wmax)
            ua, ub = max(u, u0), min(u + w, u1)
            if ub - ua > .12:
                hh = h * rng.uniform(.9, 1.04)
                col = stone_tint(rng, tone or 1.0, moss=bool(moss) and r == 0 and rng.random() < .35)
                stone(mb, face.p((ua + ub) / 2, z0 + r * h + h / 2, d + rng.uniform(-.015, .02)),
                      (ub - ua - gap, depth, hh - gap), face.rot, rng, tint=col, tag=tag)
            u += w


def plinth(A, mat_, x0, x1, y0, y1, z_top=.3, z_bot=-.8, rows=1, stone_top=None, rng=None, sides='-y+x+y-x',
           tone=1.0, tag='plinth', inset=.0, wmin=.45, wmax=.85, depth=.26, moss=True):
    """Stone plinth: a hidden core box down to z_bot plus individual stones on the visible band."""
    rng = rng or random.Random(11)
    mb = A.mb(mat_)
    mb.box(((x0 + x1) / 2, (y0 + y1) / 2, (z_top + z_bot) / 2 - .02), (x1 - x0 - .06, y1 - y0 - .06, z_top - z_bot - .04),
           ch=.03, tint=stone_tint(rng, tone * .8), tag=tag + ' core')
    lo = stone_top if stone_top is not None else -.25
    for side in ('-y', '+x', '+y', '-x'):
        if side not in sides:
            continue
        f, L = rect_face(x0, x1, y0, y1, side)
        e = depth * .8 if side in ('+x', '-x') else 0.0
        stone_band(mb, f, e, L - e, lo, z_top, d=-depth / 2 + .05, rows=rows, rng=rng, depth=depth, tone=tone,
                   tag=tag, wmin=wmin, wmax=wmax, moss=moss)

# ---------------------------------------------------------------- details


def chochin(A, glow_mat, dark_mat, c, r=.2, h=.44, hang=.25, group=None, tag='chochin', n=10, tint=1.0):
    """Red paper lantern (Lantern glow) with ribbed body, dark caps and a hook."""
    c = V(c)
    prof = []
    ribs = 5
    for i in range(ribs * 2 + 1):
        t = i / (ribs * 2)
        z = -h / 2 + h * t
        rr = r * math.sin(math.pi * (.12 + .76 * t)) ** .7
        rr *= .96 if i % 2 else 1.0
        prof.append((rr, z))
    A.mb(glow_mat, group).lathe(prof, c, n=n, tint=tint, tag=tag, smooth=60)
    dm = A.mb(dark_mat, group)
    dm.cyl(c + V((0, 0, h / 2 - .01)), r * .52, .06, n=n, ch=.01, tint=.35, tag=tag)
    dm.cyl(c + V((0, 0, -h / 2 + .01)), r * .52, .06, n=n, ch=.01, tint=.35, tag=tag)
    if hang > 0:
        dm.rod(c + V((0, 0, h / 2)), c + V((0, 0, h / 2 + hang)), .012, n=4, tint=.3, tag=tag)


def potted_plant(A, pot_mat, leaf_mat, c, r=.2, h=.28, kind='bush', rng=None, flower_mat=None, tag='plant',
                 pot_tint=None, leaf_tint=None):
    rng = rng or random.Random(3)
    c = V(c)
    A.mb(pot_mat).lathe([(0, 0), (r * .75, 0), (r, h * .86), (r * 1.1, h * .88), (r * 1.1, h), (r * .95, h),
                         (0, h * .9)], c, n=8, tint=pot_tint or .9, tag=tag + ' pot', smooth=50)
    lm = A.mb(leaf_mat)
    if kind == 'bush':
        for i in range(4):
            a = TAU * i / 4 + rng.random()
            p = c + V((math.cos(a) * r * .45, math.sin(a) * r * .45, h + r * .55 + rng.random() * r * .3))
            lm.sphere(p, (r * .72, r * .72, r * .62), seg=6, rings=4, tint=leaf_tint or (.85 + .15 * rng.random()),
                      tag=tag)
        lm.sphere(c + V((0, 0, h + r * 1.05)), r * .7, seg=6, rings=4, tint=leaf_tint or 1.0, tag=tag)
    elif kind == 'tall':
        for i in range(6):
            a = TAU * i / 6 + rng.random() * .4
            base = c + V((0, 0, h * .9))
            tip = base + V((math.cos(a) * r * 1.1, math.sin(a) * r * 1.1, r * 3.2 + rng.random() * r))
            mid = base.lerp(tip, .5) + V((math.cos(a) * r * .3, math.sin(a) * r * .3, 0))
            lm.append(bm_loft([base, mid, tip], [(-.035, 0), (.035, 0), (0, .02)], closed=True, caps=False),
                      None, tint=leaf_tint or (.8 + .2 * rng.random()), smooth=70, tag=tag)
    if flower_mat is not None:
        fm = A.mb(flower_mat)
        for i in range(5):
            a = TAU * i / 5 + rng.random()
            p = c + V((math.cos(a) * r * .6, math.sin(a) * r * .6, h + r * 1.1 + rng.random() * r * .35))
            fm.sphere(p, r * .2, seg=6, rings=4, tint=.9 + .1 * rng.random(), tag=tag + ' flowers')


def steps(A, mat_, c, w, n, rise=.16, run=.3, rot=0., tint=.85, tag='steps', rng=None, ch=.03):
    """Straight flight going up toward +Y (local) from c (bottom front centre)."""
    rng = rng or random.Random(4)
    mb = A.mb(mat_)
    R = Matrix.Rotation(rot, 3, 'Z')
    for i in range(n):
        top = rise * (i + 1)
        y = run * i + run / 2
        p = V(c) + R @ V((0, y + (n - i - 1) * run / 2, top / 2 - .1))
        mb.box(p, (w - .02 * rng.random(), run * (n - i) + .02, top + .2), rot=(0, 0, rot), ch=ch,
               tint=tint * (.9 + .1 * rng.random()), tag=tag)


def flower_cluster(A, leaf_mat, flower_mat, c, r=.35, n=6, rng=None, tag='flowers', leaf_tint=None, fl_tints=None,
                   h=.3):
    rng = rng or random.Random(9)
    c = V(c)
    lm, fm = A.mb(leaf_mat), A.mb(flower_mat)
    for i in range(3):
        a = TAU * i / 3 + rng.random()
        lm.sphere(c + V((math.cos(a) * r * .4, math.sin(a) * r * .4, h * .45)), (r * .55, r * .55, h * .5), seg=7,
                  rings=4, tint=leaf_tint or (.8 + .2 * rng.random()), tag=tag)
    for i in range(n):
        a = rng.random() * TAU
        rr = r * math.sqrt(rng.random()) * .8
        p = c + V((math.cos(a) * rr, math.sin(a) * rr, h * .75 + rng.random() * h * .3))
        t = fl_tints[i % len(fl_tints)] if fl_tints else .85 + .15 * rng.random()
        fm.sphere(p, r * .16, seg=6, rings=4, tint=t, tag=tag)

# ---------------------------------------------------------------- openings and dressing

WOOD_DARK, WOOD_MID, WOOD_LIGHT = .36, .66, 1.0
STONE = (.44, .42, .45)


def stone_tint(rng, k=1.0, moss=False):
    a = k * (.8 + .24 * rng.random())
    h = rng.random()
    if h < .3:       # warm ochre stones
        hue = (1.08, 1.0, .86)
    elif h < .5:     # cool blue-grey stones
        hue = (.94, .98, 1.06)
    else:
        hue = (1.0 + .04 * (rng.random() - .5), 1.0, 1.0 + .05 * (rng.random() - .5))
    t = (STONE[0] * a * hue[0], STONE[1] * a * hue[1], STONE[2] * a * hue[2])
    if moss:
        t = (t[0] * .88, t[1] * .97, t[2] * .8)
    return t


def sash(A, face, hole, frame_mat, glass_mat, reveal_mb, cols=2, rows=3, depth=.12, frame_tint=WOOD_DARK,
         bar=.04, sash_w=.06, casing=None, casing_w=.09, casing_tint=None, sill_mat=None, sill_tint=None,
         reveal_tint=.78, tag='window', mid_rail=True):
    """Glazed window in `hole` (ua, ub, za, zb): reveal, glass, sash frame, muntins, casing and sill."""
    ua, ub, za, zb = hole
    w, h = ub - ua, zb - za
    uc, zc = (ua + ub) / 2, (za + zb) / 2
    reveal(reveal_mb, face, hole, depth, tint=reveal_tint, tag=tag + ' reveal')
    face.quad(A.mb(glass_mat), ua, za, ub, zb, d=-depth + .02, tag=tag + ' glass')
    fm = A.mb(frame_mat)
    dd = -depth + .05
    face.box(fm, uc, zb - sash_w / 2, dd, w, sash_w, .05, tint=frame_tint, tag=tag)
    face.box(fm, uc, za + sash_w / 2, dd, w, sash_w, .05, tint=frame_tint, tag=tag)
    face.box(fm, ua + sash_w / 2, zc, dd, sash_w, h, .05, tint=frame_tint, tag=tag)
    face.box(fm, ub - sash_w / 2, zc, dd, sash_w, h, .05, tint=frame_tint, tag=tag)
    iw, ih = w - 2 * sash_w, h - 2 * sash_w
    for i in range(1, cols):
        face.box(fm, ua + sash_w + iw * i / cols, zc, dd + .005, bar, ih, .035, tint=frame_tint, tag=tag)
    for j in range(1, rows):
        thick = bar * (1.6 if (mid_rail and rows % 2 == 0 and j == rows // 2) else 1)
        face.box(fm, uc, za + sash_w + ih * j / rows, dd + .005, iw, thick, .035, tint=frame_tint, tag=tag)
    if casing is not None:
        cm = A.mb(casing)
        ct = casing_tint if casing_tint is not None else frame_tint
        cw = casing_w
        face.box(cm, uc, zb + cw / 2, .025, w + 2 * cw, cw, .05, tint=ct, tag=tag + ' casing')
        face.box(cm, ua - cw / 2, zc, .025, cw, h, .05, tint=ct, tag=tag + ' casing')
        face.box(cm, ub + cw / 2, zc, .025, cw, h, .05, tint=ct, tag=tag + ' casing')
    if sill_mat is not None:
        face.box(A.mb(sill_mat), uc, za - .035, .05, w + .26, .07, .16,
                 tint=sill_tint if sill_tint is not None else frame_tint, tag=tag + ' sill')


def koshi(A, face, hole, wood_mat, glass_mat, reveal_mb, depth=.12, slat=.05, gap=.09, tint=WOOD_DARK,
          rails=2, tag='koshi', frame=True):
    """Kawabe lattice (koshi) window: vertical slats in front of glowing glass."""
    ua, ub, za, zb = hole
    w, h = ub - ua, zb - za
    uc, zc = (ua + ub) / 2, (za + zb) / 2
    reveal(reveal_mb, face, hole, depth, tint=.75, tag=tag + ' reveal')
    face.quad(A.mb(glass_mat), ua, za, ub, zb, d=-depth + .01, tag=tag + ' glass')
    wm = A.mb(wood_mat)
    n = max(2, int(round((w - .04) / (slat + gap))))
    step = (w - .02) / n
    for i in range(n):
        u = ua + .01 + step * (i + .5)
        face.box(wm, u, zc, -.03, slat, h, .05, tint=tmul(tint, .92 + .08 * ((i * 7) % 3) / 2), tag=tag)
    for j in range(rails):
        z = za + h * (j + 1) / (rails + 1)
        face.box(wm, uc, z, -.06, w, .035, .03, tint=tmul(tint, .9), tag=tag)
    if frame:
        fw = .08
        face.box(wm, uc, zb + fw / 2, .02, w + 2 * fw, fw, .07, tint=tint, tag=tag + ' frame')
        face.box(wm, uc, za - fw / 2, .02, w + 2 * fw, fw, .09, tint=tint, tag=tag + ' frame')
        face.box(wm, ua - fw / 2, zc, .02, fw, h, .07, tint=tint, tag=tag + ' frame')
        face.box(wm, ub + fw / 2, zc, .02, fw, h, .07, tint=tint, tag=tag + ' frame')


def panel_door(A, face, hole, leaf_mat, reveal_mb, depth=.12, leaf_tint=1.0, frame_mat=None, frame_tint=WOOD_DARK,
               knob_mat=None, glass_mat=None, panels=2, tag='door', frame_w=.1, group=None):
    """Hinged panel door with raised panels, optional glazed top light and knob."""
    ua, ub, za, zb = hole
    w, h = ub - ua, zb - za
    uc = (ua + ub) / 2
    reveal(reveal_mb, face, hole, depth, tint=.75, tag=tag + ' reveal', sides='lrt')
    lm = A.mb(leaf_mat, group)
    dl = -depth + .04
    face.box(lm, uc, za + h / 2, dl, w - .02, h - .01, .05, ch=.012, tint=leaf_tint, tag=tag)
    top = za + h
    if glass_mat is not None:
        gh = h * .26
        face.box(A.mb(glass_mat, group), uc, top - .12 - gh / 2, dl + .026, w * .6, gh, .01, tint=1, tag=tag)
        face.box(lm, uc, top - .12 - gh / 2, dl + .03, .035, gh, .012, tint=leaf_tint * .8, tag=tag)
        top = top - .12 - gh - .04
    ph = (top - za - .14 - .08 * (panels - 1)) / panels
    for i in range(panels):
        z = za + .14 + ph / 2 + i * (ph + .08)
        for s in (-1, 1):
            face.box(lm, uc + s * w * .22, z, dl + .03, w * .3, ph, .02, ch=.012, tint=leaf_tint * .88, tag=tag)
    if knob_mat is not None:
        km = A.mb(knob_mat, group)
        km.sphere(face.p(ub - .12, za + 1.0, dl + .07), .035, seg=8, rings=5, tag=tag)
        face.box(km, ub - .12, za + 1.0, dl + .03, .05, .16, .02, ch=.008, tag=tag)
    if frame_mat is not None:
        fm = A.mb(frame_mat)
        fw = frame_w
        face.box(fm, uc, zb + fw / 2, .02, w + 2 * fw, fw, .08, ch=.015, tint=frame_tint, tag=tag + ' frame')
        face.box(fm, ua - fw / 2, (za + zb) / 2, .02, fw, h, .08, ch=.015, tint=frame_tint, tag=tag + ' frame')
        face.box(fm, ub + fw / 2, (za + zb) / 2, .02, fw, h, .08, ch=.015, tint=frame_tint, tag=tag + ' frame')


def flower_box(A, face, u, z, w, box_mat, leaf_mat, flower_mat, rng, box_tint=WOOD_MID, fl_tints=None, d=.12,
               tag='flowerbox', flower_mat2=None):
    """Planter under a window sill with leafy mounds and flower heads."""
    face.box(A.mb(box_mat), u, z + .1, d + .1, w, .2, .22, ch=.02, tint=box_tint, tag=tag)
    lm, fm = A.mb(leaf_mat), A.mb(flower_mat)
    fm2 = A.mb(flower_mat2) if flower_mat2 else fm
    n = max(3, int(w / .22))
    for i in range(n):
        uu = u - w / 2 + .1 + (w - .2) * i / (n - 1)
        lm.sphere(face.p(uu, z + .24 + rng.random() * .03, d + .1 + (rng.random() - .5) * .06), (.14, .11, .1), seg=6,
                  rings=4, tint=.75 + .25 * rng.random(), tag=tag)
    for i in range(n + 2):
        uu = u - w / 2 + .06 + (w - .12) * rng.random()
        m = fm if i % 3 else fm2
        t = fl_tints[i % len(fl_tints)] if fl_tints else .85 + .15 * rng.random()
        m.sphere(face.p(uu, z + .3 + rng.random() * .07, d + .06 + rng.random() * .1), .05, seg=5, rings=3, tint=t,
                 tag=tag)


def _endgrain(R):
    def f(c, n):
        return (1.0, .9, .78) if abs((R.transposed() @ n).y) > .8 else (.55, .5, .47)
    return f


def firewood(A, wood_mat, c, length=1.4, rows=4, depth=.5, rot=0., rng=None, tag='firewood'):
    """Stacked split logs (end grain lighter) along local X."""
    rng = rng or random.Random(2)
    mb = A.mb(wood_mat)
    R = Matrix.Rotation(rot, 3, 'Z')
    r = .075
    q = Matrix.Rotation(math.pi / 2, 3, 'X')
    for row in range(rows):
        n = int(length / (2 * r)) - (row % 2)
        for i in range(n):
            x = -length / 2 + r + i * 2 * r + (r if row % 2 else 0)
            z = r + row * r * 1.7
            p = V(c) + R @ V((x, 0, z))
            rr = r * rng.uniform(.85, 1.02)
            mb.append(bm_cyl(rr, depth * rng.uniform(.9, 1.0), 6, cap=True), xform(p, (R @ q).to_quaternion()),
                      tint=_endgrain(R), smooth=50, tag=tag)


def leafy(mb, c, r, rng, seg=8, rings=5, jitter=.18, tint=None, tag='leafy', squash=1.0):
    """A lumpy leaf clump: jittered low-poly sphere (reads as a bush / cabbage rather than a ball)."""
    rr = r if isinstance(r, (tuple, list)) else (r, r, r * squash)
    bm = bm_sphere(rr, seg, rings)
    off = V((rng.random() * 9, rng.random() * 9, rng.random() * 9))
    for v in bm.verts:
        k = 1 + jitter * noise.noise(v.co * (3.0 / max(rr)) + off)
        v.co = V((v.co.x * k, v.co.y * k, v.co.z * k))
    mb.append(bm, xform(c), tint if tint is not None else (.85 + .15 * rng.random()), smooth=70, tag=tag)


# ---------------------------------------------------------------- masonry


def masonry(mb, face, u0, u1, z0, z1, holes=(), d=0., rng=None, course=(.26, .4), length=(.4, .95), gap=.035,
            pillow=.045, tint_fn=None, mortar=True, tag='masonry', wet=None, relief=.014, jitter=.4):
    """Coursed rubble masonry: pillow-shaped stones (4 tris each) over a recessed mortar plane.
    tint_fn(rng, u, z) -> rgb overrides the stone colour; wet=z below which stones darken (water line)."""
    rng = rng or random.Random(17)
    if mortar:
        panel(mb, face, u0, u1, z0, z1, holes, d=d - .005, du=3.0, dz=3.0, tint=(STONE[0] * .55, STONE[1] * .55, STONE[2] * .56),
              tag=tag + ' mortar')
    bm = bmesh.new()
    colmap = {}
    z = z0
    row = 0
    while z < z1 - .05:
        h = rng.uniform(*course)
        if z1 - (z + h) < course[0] * .6:
            h = z1 - z
        za, zb = z, min(z1, z + h)
        cuts = [hh for hh in holes if hh[2] < zb - 1e-4 and hh[3] > za + 1e-4]
        u = u0 - rng.uniform(0, length[0]) * (row % 2)
        while u < u1 - .02:
            w = rng.uniform(*length)
            ua, ub = max(u, u0), min(u + w, u1)
            u += w
            segs = [(ua, ub)]
            for hh in cuts:
                new = []
                for s0, s1 in segs:
                    if hh[1] <= s0 or hh[0] >= s1:
                        new.append((s0, s1))
                    else:
                        if hh[0] > s0:
                            new.append((s0, hh[0]))
                        if hh[1] < s1:
                            new.append((hh[1], s1))
                segs = new
            for s0, s1 in segs:
                if s1 - s0 < .12:
                    continue
                g = gap / 2
                a0, a1 = s0 + (g if s0 > u0 + 1e-4 else 0), s1 - (g if s1 < u1 - 1e-4 else 0)
                b0, b1 = za + (g if za > z0 + 1e-4 else 0), zb - (g if zb < z1 - 1e-4 else 0)
                dz = d + relief * rng.random()
                pl = pillow * min(1.0, (a1 - a0) / .4, (b1 - b0) / .25)
                cu, cz = (a0 + a1) / 2 + (rng.random() - .5) * (a1 - a0) * .2, (b0 + b1) / 2
                j = gap * jitter

                def jt(val, lo_edge, hi_edge):
                    return val if (lo_edge or hi_edge) else val + rng.uniform(-j, j)
                c0 = (jt(a0, a0 <= u0 + 1e-4, False), jt(b0, b0 <= z0 + 1e-4, False))
                c1 = (jt(a1, a1 >= u1 - 1e-4, False), jt(b0, b0 <= z0 + 1e-4, False))
                c2 = (jt(a1, a1 >= u1 - 1e-4, False), jt(b1, b1 >= z1 - 1e-4, False))
                c3 = (jt(a0, a0 <= u0 + 1e-4, False), jt(b1, b1 >= z1 - 1e-4, False))
                vs = [bm.verts.new(face.p(c[0], c[1], dz + rng.uniform(0, relief * .5))) for c in (c0, c1, c2, c3)]
                col = tint_fn(rng, (a0 + a1) / 2, (b0 + b1) / 2) if tint_fn else stone_tint(rng)
                if wet is not None and cz < wet:
                    k = .62 if cz < wet - .4 else .8
                    col = (col[0] * k * .92, col[1] * k, col[2] * k * .9)
                if pillow <= 0:
                    colmap[bm.faces.new(vs)] = col
                    continue
                vc = bm.verts.new(face.p(cu, cz, dz + pl))
                for i in range(4):
                    f = bm.faces.new((vs[i], vs[(i + 1) % 4], vc))
                    colmap[f] = col
        z = zb
        row += 1
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(face.n) < 0:
            f.normal_flip()
    _append_colored(mb, bm, colmap, tag=tag, smooth=55)


def quoins(mb, face, u, z0, z1, rng, d=0., course=.36, long=.62, short=.38, depth=.3, side=1, tag='quoins',
           tint_fn=None, ch=.03):
    """Alternating corner blocks at face-local u (side=+1: block extends toward -u, i.e. into this face)."""
    z = z0
    i = 0
    while z < z1 - .05:
        h = min(course, z1 - z)
        L = long if i % 2 == 0 else short
        col = tint_fn(rng, u, z) if tint_fn else stone_tint(rng, 1.08)
        c = face.p(u - side * L / 2 + side * .02, z + h / 2, d - depth / 2 + .045)
        mb.box(c, (L, depth, h - .03), rot=(0, 0, face.rot), ch=ch, tint=col, tag=tag, front=True)
        z += h
        i += 1


def chimney(A, stone_mat, pot_mat, cx, cy, z0, z1, rng, w=.7, d=.7, tint_fn=None, tag='chimney', pot=True,
            course=(.17, .26), length=(.2, .42)):
    """Masonry chimney stack with a cap slab and a clay pot. Returns the flue-top point."""
    pm = A.mb(stone_mat)
    pm.box((cx, cy, (z0 + z1) / 2), (w - .03, d - .03, z1 - z0), tint=stone_tint(rng, .5), tag=tag)
    for side in ('-y', '+x', '+y', '-x'):
        f, L = rect_face(cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, side)
        masonry(pm, f, 0, L, z0, z1, (), rng=rng, mortar=False, course=course, length=length, tint_fn=tint_fn,
                gap=.03, pillow=.03, tag=tag)
    pm.box((cx, cy, z1 + .05), (w + .16, d + .16, .1), ch=.025, tint=stone_tint(rng, 1.12), tag=tag)
    pm.box((cx, cy, z1 + .14), (w - .06, d - .06, .08), ch=.02, tint=stone_tint(rng, .95), tag=tag)
    top = V((cx, cy, z1 + .18))
    if pot:
        A.mb(pot_mat).lathe([(0, 0), (.15, 0), (.13, .2), (.15, .26), (.1, .26), (0, .2)], top, n=10, tint=.85,
                            tag=tag)
        top = top + V((0, 0, .26))
    return top


# ---------------------------------------------------------------- irimoya (hip-and-gable)


def irimoya(A, roof_mat, X, y0, y1, eave_z, pitch, dc, sag=.2, style='kawara', under_mat=None, fascia_mat=None,
            seed=1, group=None, xc=0.0, ridge_mat=None, ridge_w=.4, ridge_layers=3, wood=None, barge_tint=.36,
            lift=None, oni_size=.6):
    """Hip-and-gable roof over the eave rectangle [xc-X, xc+X] x [y0, y1]; the hips stop at plan depth dc where
    the small gables rise. Returns dict(front, back, right, left, roof, yc, D, zc)."""
    st = ROOF_STYLES[style] if isinstance(style, str) else style
    yc, D = (y0 + y1) / 2, (y1 - y0) / 2
    roof = Roof(eave_z, pitch, D, sag, lift)
    xa, xb = xc - X, xc + X
    front = Slope(roof, [(xa, y0), (xb, y0), (xb - dc, y0 + dc), (xb - dc, yc), (xa + dc, yc), (xa + dc, y0 + dc)],
                  (xa, y0), (xb, y0), ['eave', 'hip', 'verge', 'ridge', 'verge', 'hip'])
    back = Slope(roof, [(xb, y1), (xa, y1), (xa + dc, y1 - dc), (xa + dc, yc), (xb - dc, yc), (xb - dc, y1 - dc)],
                 (xb, y1), (xa, y1), ['eave', 'hip', 'verge', 'ridge', 'verge', 'hip'])
    right = Slope(roof, [(xb, y0), (xb, y1), (xb - dc, y1 - dc), (xb - dc, y0 + dc)], (xb, y0), (xb, y1),
                  ['eave', 'hip', 'wall', 'hip'])
    left = Slope(roof, [(xa, y1), (xa, y0), (xa + dc, y0 + dc), (xa + dc, y1 - dc)], (xa, y1), (xa, y0),
                 ['eave', 'hip', 'wall', 'hip'])
    for i, s in enumerate((front, back, right, left)):
        tile_slope(A, s, roof_mat, st, under_mat, fascia_mat, seed=seed + i, group=group)
    rm = ridge_mat or roof_mat
    # main ridge between the two gables, with a gentle upsweep and oni tiles
    path = []
    for i in range(11):
        t = i / 10
        x = lerp(xa + dc - .06, xb - dc + .06, t)
        up = .12 * smoothstep(.7, 1, abs(t - .5) * 2) ** 1.3
        path.append(V((x, yc, front.z(V((x, yc))) + up)))
    ridge(A, rm, path, w=ridge_w, layers=ridge_layers, tint=.88, group=group)
    for p, sx in ((path[0], -1), (path[-1], 1)):
        onigawara(A, rm, p + V((sx * .03, 0, -.12)), (sx, 0), size=oni_size, group=group)
    # hips (front and back slopes carry them) and the short ridge at the foot of each gable
    for s, corners in ((front, ((xa, y0, 1), (xb, y0, -1))), (back, ((xa, y1, 1), (xb, y1, -1)))):
        for cx_, cy_, sx in corners:
            p_low = V((cx_, cy_))
            p_hi = V((cx_ + sx * dc, cy_ + (dc if cy_ < yc else -dc)))
            hip_cap(A, rm, s, p_low + (p_hi - p_low) * .02, p_hi, n=5, w=.26, group=group)
    zc = eave_z + roof.g(dc)
    for sx, s in ((1, right), (-1, left)):
        x = xc + sx * (X - dc)
        pts = [V((x - sx * .02, lerp(y0 + dc, y1 - dc, t / 6), zc + .02)) for t in range(7)]
        ridge(A, rm, pts, w=.26, layers=1, lh=.06, cap_r=.1, tint=.86, group=group, tag='gable foot', n_cap=4)
    if wood is not None:
        for sx in (-1, 1):
            x = xc + sx * (X - dc)
            for s, ye in ((front, y0 + dc), (back, y1 - dc)):
                bargeboard(A, wood, s, (x, ye), (x, yc), h=.36, t=.09, tint=barge_tint, out=V((sx, 0)), group=group)
    return dict(front=front, back=back, right=right, left=left, roof=roof, yc=yc, D=D, zc=zc)


# ---------------------------------------------------------------- rectangular hip roof and polygon (bay) roofs


def hip_rect(A, roof_mat, x0, x1, y0, y1, eave_z, pitch, sag=.12, style='shingle', under_mat=None, fascia_mat=None,
             cap_mat=None, seed=1, group=None, lift=None, ridge_w=.24):
    """Hipped roof over the eave rectangle (ridge along the longer axis). Returns dict of slopes and roof."""
    st = ROOF_STYLES[style] if isinstance(style, str) else style
    X, Y = (x1 - x0) / 2, (y1 - y0) / 2
    xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
    D = min(X, Y)
    roof = Roof(eave_z, pitch, D, sag, lift)
    if X >= Y:
        r0, r1 = (x0 + D, yc), (x1 - D, yc)
        front = Slope(roof, [(x0, y0), (x1, y0), r1, r0], (x0, y0), (x1, y0), ['eave', 'hip', 'ridge', 'hip'])
        back = Slope(roof, [(x1, y1), (x0, y1), r0, r1], (x1, y1), (x0, y1), ['eave', 'hip', 'ridge', 'hip'])
        right = Slope(roof, [(x1, y0), (x1, y1), r1], (x1, y0), (x1, y1), ['eave', 'hip', 'hip'])
        left = Slope(roof, [(x0, y1), (x0, y0), r0], (x0, y1), (x0, y0), ['eave', 'hip', 'hip'])
        hips = [(front, (x0, y0), r0), (front, (x1, y0), r1), (back, (x0, y1), r0), (back, (x1, y1), r1)]
    else:
        r0, r1 = (xc, y0 + D), (xc, y1 - D)
        front = Slope(roof, [(x0, y0), (x1, y0), r0], (x0, y0), (x1, y0), ['eave', 'hip', 'hip'])
        back = Slope(roof, [(x1, y1), (x0, y1), r1], (x1, y1), (x0, y1), ['eave', 'hip', 'hip'])
        right = Slope(roof, [(x1, y0), (x1, y1), r1, r0], (x1, y0), (x1, y1), ['eave', 'hip', 'ridge', 'hip'])
        left = Slope(roof, [(x0, y1), (x0, y0), r0, r1], (x0, y1), (x0, y0), ['eave', 'hip', 'ridge', 'hip'])
        hips = [(right, (x1, y0), r0), (right, (x1, y1), r1), (left, (x0, y0), r0), (left, (x0, y1), r1)]
    for i, s in enumerate((front, back, right, left)):
        tile_slope(A, s, roof_mat, st, under_mat, fascia_mat, seed=seed + i, group=group)
    cm_ = cap_mat or roof_mat
    for s, lo, hi in hips:
        lo, hi = V(lo), V(hi)
        hip_cap(A, cm_, s, lo + (hi - lo) * .02, hi, n=5, w=ridge_w * .8, group=group)
    if (V(r1) - V(r0)).length > .05:
        path = [V((p.x, p.y, front.z(p) if X >= Y else right.z(p))) for p in (V(r0).lerp(V(r1), t / 6) for t in range(7))]
        ridge(A, cm_, path, w=ridge_w, layers=1, lh=.06, cap_r=.1, tint=.9, group=group, n_cap=5)
    return dict(front=front, back=back, right=right, left=left, roof=roof)


def poly_roof(A, roof_mat, pts, eave_z, pitch, style='shingle', under_mat=None, fascia_mat=None, cap_mat=None, seed=1):
    """Lean-to hipped roof over a polygonal bay. pts: plan outline of the eaves, first and last points on the wall
    line (CCW seen from above, bay side first). Each facet rises toward the wall; hips follow the angle bisectors."""
    st = ROOF_STYLES[style] if isinstance(style, str) else style
    pts = [V((p[0], p[1])) for p in pts]
    wa, wb = pts[0], pts[-1]
    wdir = (wb - wa).normalized()
    wn = V((-wdir.y, wdir.x))
    mid = sum(pts[1:-1], V((0, 0))) / (len(pts) - 2)
    if (mid - wa).dot(wn) > 0:
        wn = -wn          # wn points from the bay toward the wall side

    def to_wall(p, d):
        den = d.dot(wn)
        if abs(den) < 1e-9:
            return p
        t = (wa - p).dot(wn) / den
        return p + d * t
    inner = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        bis = (a - b).normalized() + (c - b).normalized()
        if bis.length < 1e-6 or bis.dot(wn) <= 0:
            bis = wn
        inner.append(to_wall(b, bis.normalized()))
    inner.append(pts[-1])
    Dmax = max(abs((p - wa).dot(wn)) for p in pts)
    roof = Roof(eave_z, pitch, max(Dmax, .3), .05)
    slopes = []
    for k in range(len(pts) - 1):
        poly = [pts[k], pts[k + 1], inner[k + 1], inner[k]]
        kinds = ['eave', 'hip', 'wall', 'hip']
        clean, ck = [], []
        for p, kd in zip(poly, kinds):
            if not clean or (p - clean[-1]).length > 1e-5:
                clean.append(p)
                ck.append(kd)
        if (clean[0] - clean[-1]).length < 1e-5:
            clean.pop()
            ck.pop()
        if len(clean) < 3:
            continue
        s = Slope(roof, clean, pts[k], pts[k + 1], ck)
        tile_slope(A, s, roof_mat, st, under_mat, fascia_mat, seed=seed + k)
        slopes.append(s)
    for i in range(1, len(pts) - 1):
        s = slopes[min(i, len(slopes) - 1)]
        hip_cap(A, cap_mat or roof_mat, s, pts[i] + (inner[i] - pts[i]) * .03, inner[i], n=3, w=.16)
    return slopes, roof
