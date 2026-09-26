"""Shared helpers for the Starline railway family (build_railway.py).

Geometry helpers that the generic kit does not have: revolve about any axis with reliable
outward normals, oriented boxes, rivet rows, stone-course walls with per-block tint, pivot
parenting that leaves identity local transforms, and a finish() that bakes AO, merges static
parts per material and exports.

Track geometry shared with the runtime: standard gauge, rail centres at x = +-RAIL_X, rail top at z=0.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise
from kit import *

GAUGE = 1.435
RAIL_X = GAUGE / 2
D90 = math.pi / 2


# ------------------------------------------------------------------ materials

def palette_railway():
    """Materials shared across the family (cached by name inside kit.mat)."""
    return dict(
        red=mat('Engine red', '#d63a2a', rough=.3, metal=.05),
        black=mat('Engine black', '#232a36', rough=.42, metal=.15),
        brass=mat('Brass', '#d9a441', rough=.26, metal=.85),
        steel=mat('Steel', '#a4adb8', rough=.3, metal=.8),
    )


def glow(name, color, emit_color, strength=0.0, rough=.35):
    """Contract glow material: base colour for daytime, emission colour ready for the runtime."""
    if name in MATS:
        return MATS[name]
    m = mat(name, color, rough=rough, emit=max(strength, 1e-4), emit_color=emit_color)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Emission Strength'].default_value = strength
    return m


# ------------------------------------------------------------------ transforms

def parent_baked(child, parent):
    """Parent with the mesh re-expressed in the parent's frame, leaving an identity local transform."""
    bpy.context.view_layer.update()
    if child.type == 'MESH':
        child.data.transform(parent.matrix_world.inverted() @ child.matrix_world)
        child.data.update()
        child.parent = parent
        child.matrix_parent_inverse = Matrix.Identity(4)
        child.matrix_basis = Matrix.Identity(4)
    else:
        set_parent(child, parent)
    return child


def bake_transform(ob):
    """Apply the object transform into mesh data (identity object matrix)."""
    bpy.context.view_layer.update()
    ob.data.transform(ob.matrix_world)
    ob.data.update()
    ob.parent = None
    ob.matrix_basis = Matrix.Identity(4)
    return ob


# ------------------------------------------------------------------ bmesh accumulation

class Acc:
    """Accumulate many small primitives of one material into a single bmesh (fast, one object)."""

    def __init__(self, name, material, smooth=40):
        self.name, self.material, self.smooth = name, material, smooth
        self.bm = bmesh.new()

    def add_box(self, center, U, V, N, su, sv, sn, taper=1.0):
        c, U, V, N = Vector(center), Vector(U).normalized(), Vector(V).normalized(), Vector(N).normalized()
        vs = {}
        for i in (-1, 1):
            for j in (-1, 1):
                for k in (-1, 1):
                    t = taper if k > 0 else 1.0
                    vs[i, j, k] = self.bm.verts.new(c + U * (i * su / 2 * t) + V * (j * sv / 2 * t) + N * (k * sn / 2))
        quads = (((-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)), ((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)),
                 ((-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)), ((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)),
                 ((-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)), ((-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)))
        faces = [self.bm.faces.new([vs[x] for x in q]) for q in quads]
        # orient outward
        for f in faces:
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - c) < 0:
                f.normal_flip()
        return faces

    def add_cone(self, base, axis, r0, r1, length, seg=6, cap0=False, cap1=True, phase=0.0):
        """Cone/cylinder from `base` along `axis`. r1=0 gives a pointed tip (rivet)."""
        b, a = Vector(base), Vector(axis).normalized()
        u = a.orthogonal().normalized()
        v = a.cross(u).normalized()
        ring0 = [self.bm.verts.new(b + (u * math.cos(TAU * i / seg + phase) + v * math.sin(TAU * i / seg + phase)) * r0)
                 for i in range(seg)]
        top = b + a * length
        if r1 <= 1e-6:
            tip = self.bm.verts.new(top)
            for i in range(seg):
                self.bm.faces.new((ring0[i], ring0[(i + 1) % seg], tip))
        else:
            ring1 = [self.bm.verts.new(top + (u * math.cos(TAU * i / seg + phase) + v * math.sin(TAU * i / seg + phase)) * r1)
                     for i in range(seg)]
            for i in range(seg):
                j = (i + 1) % seg
                self.bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
            if cap1:
                self.bm.faces.new(ring1)
        if cap0:
            self.bm.faces.new(list(reversed(ring0)))

    def add_dome(self, center, axis, r, h, seg=6):
        """Low rivet/bolt head: a ring + a raised centre (2*seg tris)."""
        c, a = Vector(center), Vector(axis).normalized()
        u = a.orthogonal().normalized()
        v = a.cross(u).normalized()
        ring = [self.bm.verts.new(c + (u * math.cos(TAU * i / seg) + v * math.sin(TAU * i / seg)) * r - a * .004)
                for i in range(seg)]
        mid = [self.bm.verts.new(c + (u * math.cos(TAU * i / seg) + v * math.sin(TAU * i / seg)) * r * .6 + a * h * .7)
               for i in range(seg)]
        tip = self.bm.verts.new(c + a * h)
        for i in range(seg):
            j = (i + 1) % seg
            self.bm.faces.new((ring[i], ring[j], mid[j], mid[i]))
            self.bm.faces.new((mid[i], mid[j], tip))

    def add_pyramid(self, center, axis, r, h, seg=6):
        """Tiny rivet head: a ring and a tip (seg tris)."""
        c, a = Vector(center), Vector(axis).normalized()
        u = a.orthogonal().normalized()
        v = a.cross(u).normalized()
        ring = [self.bm.verts.new(c + (u * math.cos(TAU * i / seg) + v * math.sin(TAU * i / seg)) * r - a * .003)
                for i in range(seg)]
        tip = self.bm.verts.new(c + a * h)
        for i in range(seg):
            self.bm.faces.new((ring[i], ring[(i + 1) % seg], tip))

    def obj(self, name=None, flat=False):
        ob = from_bmesh(name or self.name, self.bm, self.material, smooth_angle=self.smooth, flat=flat)
        self.bm = bmesh.new()
        return ob


def obox(name, center, U, V, N, su, sv, sn, material, taper=1.0, flat=True):
    acc = Acc(name, material)
    acc.add_box(center, U, V, N, su, sv, sn, taper)
    return acc.obj(flat=flat)


def rivets(name, points, normal, material, r=.022, h=.018, seg=6, dome=False):
    acc = Acc(name, material, smooth=80)
    for p in points:
        if dome:
            acc.add_dome(p, normal, r, h, seg)
        else:
            acc.add_pyramid(p, normal, r, h, seg)
    return acc.obj()


def fix_normals(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def star_outline(r_out, r_in, n=5, rot=D90):
    pts = []
    for i in range(n * 2):
        r = r_out if i % 2 == 0 else r_in
        a = rot + math.pi * i / n
        pts.append((math.cos(a) * r, math.sin(a) * r))
    return pts


def rounded_poly(corners, radii, k=4):
    """Fillet each corner of a 2D polygon with its own radius (quadratic arcs, k segments)."""
    pts = [Vector(c) for c in corners]
    n = len(pts)
    out = []
    for i in range(n):
        a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        if r <= 1e-6:
            out.append((b.x, b.y))
            continue
        r = min(r, (a - b).length * .49, (c - b).length * .49)
        p1, p2 = b + (a - b).normalized() * r, b + (c - b).normalized() * r
        for j in range(k + 1):
            t = j / k
            q = p1 * (1 - t) ** 2 + b * 2 * t * (1 - t) + p2 * t * t
            out.append((q.x, q.y))
    return out


def plane_map(ob, origin, U, V, N):
    """Re-map an object built in local XY(Z) onto a plane: x->U, y->V, z->N (then fix normals)."""
    o, U, V, N = Vector(origin), Vector(U), Vector(V), Vector(N)
    me = ob.data
    for v in me.vertices:
        x, y, z = v.co
        v.co = o + U * x + V * y + N * z
    me.update()
    return fix_normals(ob)


# ------------------------------------------------------------------ revolve

def revolve(name, profile, material, seg=32, axis='X', center=(0, 0, 0), side=1, closed=True, smooth=55,
            outward=1, arc=None, phase=0.0):
    """Revolve [(r, a), ...] about an axis through `center`. `a` is the axial offset (multiplied by
    `side` so mirrored wheels share one profile). Faces point away from the solid: for a closed profile
    this is detected from the winding; for an open one `outward=+1` means the right-hand side of the
    profile direction (in (a, r) coordinates) is visible, -1 the left.
    arc=(a0, a1) builds a partial revolve (radians)."""
    c = Vector(center)
    ax = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}[axis]
    e1 = {'X': Vector((0, 1, 0)), 'Y': Vector((0, 0, 1)), 'Z': Vector((1, 0, 0))}[axis]
    e2 = ax.cross(e1)
    pts = [(r, a * side) for r, a in profile]
    if closed:
        area = sum((pts[i][1] * pts[(i + 1) % len(pts)][0] - pts[(i + 1) % len(pts)][1] * pts[i][0])
                   for i in range(len(pts)))
        outward = 1 if area > 0 else -1   # (a, r) CCW -> right side is outside
    else:
        outward *= 1 if side > 0 else -1
    full = arc is None
    n = seg if full else seg + 1
    a0, a1 = (0.0, TAU) if full else arc
    bm = bmesh.new()
    rings = []
    for r, a in pts:
        ring = []
        for i in range(n):
            t = a0 + (a1 - a0) * i / seg + phase
            if r < 1e-6:
                ring.append(None)
            else:
                ring.append(bm.verts.new(c + ax * a + (e1 * math.cos(t) + e2 * math.sin(t)) * r))
        if r < 1e-6:
            pole = bm.verts.new(c + ax * a)
            ring = [pole] * n
        rings.append(ring)
    pairs = list(range(len(pts) - 1)) + ([len(pts) - 1] if closed else [])
    for k in pairs:
        A, B = rings[k], rings[(k + 1) % len(pts)]
        pa, pb = pts[k], pts[(k + 1) % len(pts)]
        da, dr = pb[1] - pa[1], pb[0] - pa[0]
        n2a, n2r = dr * outward, -da * outward    # right-hand normal of (da, dr) in (a, r)
        for i in range(n if full else n - 1):
            j = (i + 1) % n
            vs = [A[i], B[i], B[j], A[j]]
            uniq = []
            for v in vs:
                if v not in uniq:
                    uniq.append(v)
            if len(uniq) < 3:
                continue
            try:
                f = bm.faces.new(uniq)
            except ValueError:
                continue
            f.normal_update()
            t = a0 + (a1 - a0) * (i + .5) / seg + phase
            want = ax * n2a + (e1 * math.cos(t) + e2 * math.sin(t)) * n2r
            if f.normal.dot(want) < 0:
                f.normal_flip()
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    return from_bmesh(name, bm, material, smooth_angle=smooth)


# ------------------------------------------------------------------ sweeps

def sweep(name, path, section, material, closed_path=False, cap=True, smooth=50, up=(0, 0, 1), closed_section=True):
    """Sweep a 2D section [(u, v)] along a 3D polyline. u is along the path's side vector, v along `up`
    projected perpendicular to the path. Section should be CCW for outward normals."""
    pts = [Vector(p) for p in path]
    upv = Vector(up)
    bm = bmesh.new()
    rings = []
    m = len(pts)
    for i, p in enumerate(pts):
        if closed_path:
            t = (pts[(i + 1) % m] - pts[i - 1]).normalized()
        else:
            t = (pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]).normalized()
        side = t.cross(upv)
        if side.length < 1e-5:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        vv = side.cross(t).normalized()
        rings.append([bm.verts.new(p + side * u + vv * v) for u, v in section])
    k = len(section)
    seq = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed_path else [])
    for A, B in seq:
        for i in range(k if closed_section else k - 1):
            j = (i + 1) % k
            bm.faces.new((A[i], A[j], B[j], B[i]))
    if cap and not closed_path and closed_section:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm, material, smooth_angle=smooth)


def rounded_rect(w, h, r, k=3):
    """2D rounded rectangle outline centred at 0 (CCW)."""
    out = []
    for cx, cy, a0 in ((w / 2 - r, -h / 2 + r, -D90), (w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, D90),
                       (-w / 2 + r, -h / 2 + r, math.pi)):
        for i in range(k + 1):
            a = a0 + D90 * i / k
            out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out


def arc_pts(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def prism(name, outline, a0, a1, material, axis='Y', bevel=0.0, segments=1, smooth=35, flat=False, bevel_angle=30):
    """Extrude a 2D outline between a0 and a1 along an axis. axis='Y': outline is (x, z);
    'X': outline is (y, z); 'Z': outline is (x, y). Outline may be any winding."""
    bm = bmesh.new()

    def P(u, v, a):
        if axis == 'Y':
            return (u, a, v)
        if axis == 'X':
            return (a, u, v)
        return (u, v, a)
    A = [bm.verts.new(P(u, v, a0)) for u, v in outline]
    B = [bm.verts.new(P(u, v, a1)) for u, v in outline]
    n = len(outline)
    bm.faces.new(A)
    bm.faces.new(list(reversed(B)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((A[i], A[j], B[j], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        edges = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(bevel_angle)]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type='OFFSET', segments=segments,
                        profile=.5, affect='EDGES', clamp_overlap=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    return from_bmesh(name, bm, material, smooth_angle=smooth, flat=flat)


# ------------------------------------------------------------------ vertex colour painting

def paint(objs, fn, mode='multiply'):
    """Multiply (or set) the 'Color' corner attribute by fn(world_pos, world_normal, face_index, ob) -> (r,g,b)."""
    bpy.context.view_layer.update()
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        attr = me.color_attributes.get('Color')
        if attr is None:
            attr = me.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
            for d in attr.data:
                d.color = (1, 1, 1, 1)
        mw = o.matrix_world
        nm = mw.to_3x3().inverted_safe().transposed()
        for p in me.polygons:
            n = (nm @ p.normal).normalized()
            for li in p.loop_indices:
                v = me.vertices[me.loops[li].vertex_index]
                c = fn(mw @ v.co, n, p.index, o)
                if mode == 'multiply':
                    old = attr.data[li].color
                    attr.data[li].color = (old[0] * c[0], old[1] * c[1], old[2] * c[2], 1)
                else:
                    attr.data[li].color = (c[0], c[1], c[2], 1)
        me.color_attributes.active_color = attr


def init_color(objs, value=1.0):
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        attr = me.color_attributes.get('Color') or me.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
        for d in attr.data:
            d.color = (value, value, value, 1)
        me.color_attributes.active_color = attr


def bake_ao_keep(objs, **kw):
    """bake_ao that multiplies into an existing tint instead of overwriting it."""
    saved = {}
    for o in objs:
        if o.type == 'MESH' and o.data.color_attributes.get('Color'):
            saved[o.name] = [tuple(d.color) for d in o.data.color_attributes['Color'].data]
    bake_ao(objs, **kw)
    for o in objs:
        if o.name in saved:
            attr = o.data.color_attributes['Color']
            for d, s in zip(attr.data, saved[o.name]):
                c = d.color
                d.color = (c[0] * s[0], c[1] * s[1], c[2] * s[2], 1)


# ------------------------------------------------------------------ reporting & finishing

def tri_count(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH')


def tri_report(name, objs):
    tally = {}
    for o in objs:
        if o.type == 'MESH':
            k = o.name.split('.')[0]
            tally[k] = tally.get(k, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
    rows = sorted(tally.items(), key=lambda kv: -kv[1])
    print(f'TRIS {name} ({sum(tally.values())}): ' + ', '.join(f'{k}={v}' for k, v in rows))


def finish(name, static, pivots=(), ao=(.5, .55), ground=0.0, tinted=False, root_name=None, report=True,
           floor_strength=None):
    """Bake AO on static parts (pivot children occlude), merge per material, parent to a root, export.
    pivots: list of (pivot_empty, [child meshes]) — children are baked on their own (they move)."""
    bpy.context.view_layer.update()
    kids_all = [k for _, kids in pivots for k in kids]
    if report:
        tri_report(name, list(static) + kids_all)
    bake = bake_ao_keep if tinted else bake_ao
    bake(static, rays=40, distance=ao[0], strength=ao[1], ground=ground, extra_occluders=kids_all)
    root = empty(root_name or name)
    merged = join_by_material(static, name)
    for m in merged:
        parent_baked(m, root)
    for piv, kids in pivots:
        if kids:
            bake(kids, rays=32, distance=ao[0] * .6, strength=ao[1] * .8, ground=None)
            joined = join_by_material(kids, piv.name)
            for k in joined:
                parent_baked(k, piv)
        set_parent(piv, root)
    return export(name, [root])
