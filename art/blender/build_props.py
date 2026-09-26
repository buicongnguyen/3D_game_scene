"""Props and items family for Starline: story pickups, held tools and village set dressing.

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_props.py [-- --only a,b]

* Pickup items (cog, peach, journal-page, fallen-star, ...) are centred on their origin because the
  runtime floats and bobs them; no ground AO.
* Held props (hand-lantern, fishing-rod, hammer) have their origin at the grip.
* Everything else stands on z=0 facing -Y with ground-contact AO.
* Pivot nodes (Bell, Gate) keep identity rest rotation with the origin on the rotation axis;
  empties (Flame, Tip, Fire) are exported as nodes.
A full build also saves art/blender/source/props.blend. Item icons: art/blender/render_icons.py.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from np_kit import *  # noqa: F401,F403

# ---------------------------------------------------------------- palette

PALETTE = {
    'Brass': dict(color='#d9a441', rough=.3, metal=.85),
    'Dark brass': dict(color='#9c6a2a', rough=.4, metal=.8),
    'Iron': dict(color='#3b424e', rough=.45, metal=.7),
    'Dark iron': dict(color='#262c38', rough=.5, metal=.6),
    'Wood': dict(color='#9a6438', rough=.75),
    'Dark wood': dict(color='#5a3726', rough=.8),
    'Fresh wood': dict(color='#d99a5c', rough=.7),
    'Wood end': dict(color='#ebc088', rough=.7),
    'Red lacquer': dict(color='#c8322a', rough=.35),
    'Red paint': dict(color='#d8392b', rough=.4),
    'Teal paint': dict(color='#23889a', rough=.4),
    'Mustard paint': dict(color='#e0a93a', rough=.4),
    'Cream paint': dict(color='#f3ead6', rough=.45),
    'Paper': dict(color='#f4ead0', rough=.8),
    'Rope': dict(color='#c9a062', rough=.85),
    'Straw': dict(color='#e3bb58', rough=.8),
    'Stone': dict(color='#a79f94', rough=.85),
    'Moss': dict(color='#548a2e', rough=.9),
    'Fabric red': dict(color='#d8342c', rough=.8),
    'Fabric indigo': dict(color='#2d4f8a', rough=.8),
    'Fabric teal': dict(color='#1f9aa0', rough=.8),
    'Fabric cream': dict(color='#f1e6cc', rough=.8),
    'Burlap': dict(color='#c49a5c', rough=.9),
    'Leaves': dict(color='#5aa632', rough=.6),
    'Bamboo': dict(color='#b8b54a', rough=.45),
    'Soil': dict(color='#6b4a33', rough=.95),
}


def M(name, **kw):
    spec = dict(PALETTE.get(name, {}))
    spec.update(kw)
    color = spec.pop('color', '#ff00ff')
    return mat(name, color, **spec)


def lantern_glow(strength=1.2):
    return mat('Lantern glow', '#ffcf80', rough=.3, emit=strength, emit_color='#ffb347')


# ---------------------------------------------------------------- modelling helpers


def beam(name, a, b, w, h, material, bevel=.012, segments=1, up=(0, 0, 1), roll=0.0):
    """Bevelled box from point a to point b with cross-section w (side) x h (up)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    z = d.normalized()
    upv = Vector(up)
    if abs(z.dot(upv.normalized())) > .95:
        upv = Vector((0, 1, 0)) if abs(z.y) < .9 else Vector((1, 0, 0))
    x = upv.cross(z).normalized()
    y = z.cross(x).normalized()
    m = Matrix((x, y, z)).transposed().to_4x4()
    ob = box(name, (w, h, L), material=material, bevel=bevel, segments=segments)
    ob.matrix_world = Matrix.Translation((a + b) / 2) @ m @ Matrix.Rotation(roll, 4, 'Z')
    apply_transform(ob)
    return ob


def ring_rod(name, centre, radius, r, material, axis=(0, 0, 1), maj=20, mn=6, arc=1.0, rot=0.0):
    """Torus oriented so its axis is `axis`."""
    ob = torus(name, radius, r, (0, 0, 0), material, maj=maj, mn=mn, arc=arc)
    q = Vector(axis).normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    ob.matrix_world = Matrix.Translation(Vector(centre)) @ q @ Matrix.Rotation(rot, 4, 'Z')
    apply_transform(ob)
    return ob


def cylinder_between(name, a, b, r, material, verts=8, r2=None, bevel=0.0, cap=True):
    return rod(name, a, b, r, material, verts=verts, r2=r2, bevel=bevel, cap=cap)


def disc(name, centre, normal, r, material, seg=12, depth=.004, bevel=0.0):
    ob = cyl(name, r, depth, (0, 0, 0), material, verts=seg, bevel=bevel)
    q = Vector(normal).normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    ob.matrix_world = Matrix.Translation(Vector(centre)) @ q
    apply_transform(ob)
    return ob


def star_outline(R, r, points=5, rot=math.pi / 2):
    out = []
    for i in range(points * 2):
        a = rot + math.pi * i / points
        rr = R if i % 2 == 0 else r
        out.append((math.cos(a) * rr, math.sin(a) * rr))
    return out


def transform_all(objs, m):
    """Apply a world transform to every part (matrices refreshed first, so parts created with a
    location that the depsgraph has not evaluated yet are not snapped back to the origin)."""
    bpy.context.view_layer.update()
    for o in objs:
        o.matrix_world = m @ o.matrix_world
    bpy.context.view_layer.update()
    for o in objs:
        apply_transform(o)


def face_up(objs, axis=(0, 0, 1)):
    """Flip faces of thin single sheets (fins, leaves) so they face `axis` (lit side up)."""
    a = Vector(axis)
    for o in objs if isinstance(objs, (list, tuple)) else [objs]:
        me = o.data
        for poly in me.polygons:
            if poly.normal.dot(a) < 0:
                poly.flip()
        me.update()
    return objs


def bbox(objs):
    bpy.context.view_layer.update()
    pts = []
    for o in objs:
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def recentre(objs, empties=()):
    """Pickup items: move everything so the bounding-box centre sits on the origin."""
    lo, hi = bbox(objs)
    c = (lo + hi) / 2
    for o in list(objs) + list(empties):
        if o.parent is None:
            o.location -= c
    bpy.context.view_layer.update()
    return c


def ground_parts(objs):
    """Grounded props: lift/lower so the lowest point sits on z=0 (ignores parts meant to sink)."""
    lo, hi = bbox(objs)
    for o in objs:
        if o.parent is None:
            o.location.z -= lo.z
    bpy.context.view_layer.update()


def finish_prop(name, parts, root_name, keep=(), empties=(), ground=0.0, dist=None, strength=.62, rays=48,
                min_value=.3, tints=None):
    """AO bake (ground plane at z=ground for grounded props, None for floating items), optional
    painted tints, then merge per material and export."""
    meshes = [p for p in parts if p is not None and p.type == 'MESH']
    keep_meshes = [k for k in keep if k is not None and k.type == 'MESH']
    lo, hi = bbox(meshes + keep_meshes)
    size = (hi - lo).length
    bake_ao(meshes + keep_meshes, rays=rays, distance=dist or max(.08, size * .35), strength=strength,
            ground=ground, min_value=min_value)
    if tints:
        tints()
    return finish(name, meshes, root_name, keep=list(keep), empties=list(empties))


def grain(objs, axis='z', freq=18.0, amp=.12, seed=0):
    """Painted wood grain streaks along an axis (multiplies COLOR_0)."""
    off = Vector((seed * 1.7, seed * 2.9, seed * .3))
    def f(p, n, face):
        q = Vector((p.x, p.y, p.z))
        if axis == 'x':
            q = Vector((p.x * .15, p.y * freq, p.z * freq))
        elif axis == 'y':
            q = Vector((p.x * freq, p.y * .15, p.z * freq))
        else:
            q = Vector((p.x * freq, p.y * freq, p.z * .15))
        v = noise.noise(q + off)
        k = 1 - amp * (.5 + .5 * v)
        return (k, k * .98, k * .95)
    tint(objs, f)


def up_light(objs, lo_k=.8):
    """Gentle top-lit gradient from the normals (painted key light)."""
    tint(objs, lambda p, n, f: lo_k + (1 - lo_k) * (.5 + .5 * n.z))


# ================================================================ HAND LANTERN (hero)


def build_hand_lantern():
    """Sora's brass hand lantern (Meiji railway style), 0.32 m, origin at the handle grip.
    A bail handle with a wooden grip sleeve, a vented hood with a red enamel band and a star crown,
    a glowing glass globe in a brass guard cage, and a fount with a wick knob."""
    reset()
    brass, dbrass = M('Brass'), M('Dark brass')
    red = M('Red lacquer', color='#c42f28', rough=.3)
    wood = M('Dark wood', color='#4a2c1e', rough=.55)
    glass = lantern_glow(1.2)
    parts = []
    # grip sleeve at the origin (handle bar runs along Y) and the bail arc down to the hood lugs
    parts.append(cyl('Grip', .014, .07, (0, 0, 0), wood, verts=10, bevel=.004, rot=(math.pi / 2, 0, 0)))
    # tall wire bail from the grip down to pivots on the hood's red band
    bail = [Vector((0, .0805 * math.cos(math.pi * k / 12), -.124 + .124 * math.sin(math.pi * k / 12)))
            for k in range(13)]
    parts.append(tube('Bail', bail, .0045, brass, verts=5, caps=True))
    for s in (-1, 1):
        parts.append(sphere('Lug', (.008, .006, .008), (0, s * .08, -.125), brass, seg=6, rings=3))
    # hood: domed brass cap with red enamel band, vent chimney and a five-point star crown
    zt = -.1
    parts.append(lathe('Hood', [(0, zt + .018), (.026, zt + .014), (.05, zt - .004),
                                (.068, zt - .022), (.076, zt - .031), (.066, zt - .036),
                                (0, zt - .036)], brass, seg=16, smooth_angle=40))
    parts.append(lathe('Hood band', [(.0695, zt - .018), (.0775, zt - .026), (.0785, zt - .031),
                                     (.0715, zt - .031)], red, seg=16, smooth_angle=40))
    parts.append(cyl('Vent', .018, .02, (0, 0, zt + .026), brass, verts=10, bevel=0.0))
    parts.append(cyl('Vent cap', .026, .006, (0, 0, zt + .039), dbrass, verts=10, bevel=0.0))
    star = extrude('Crown star', star_outline(.022, .0095), .006, brass, bevel=.0015, segments=1,
                   loc=(0, 0, zt + .056))
    parts.append(star)
    # globe: glass bulge between two brass collars
    z0, z1 = zt - .036, -.245
    prof = []
    for k in range(7):
        t = k / 6
        prof.append((.052 + .016 * math.sin(math.pi * t), lerp(z0, z1, t)))
    parts.append(lathe('Globe', [(0, z0)] + prof + [(0, z1)], glass, seg=16, smooth_angle=60))
    parts.append(ring_rod('Collar', (0, 0, z0 - .002), .056, .0065, brass, maj=18, mn=4))
    parts.append(ring_rod('Collar', (0, 0, z1 + .002), .056, .0065, brass, maj=18, mn=4))
    # guard cage: four bowed wires and a mid hoop
    zm = (z0 + z1) / 2
    for i in range(4):
        a = TAU * i / 4 + TAU / 8
        pts = []
        for k in range(6):
            t = k / 5
            r = .06 + .019 * math.sin(math.pi * t)
            pts.append(Vector((math.cos(a) * r, math.sin(a) * r, lerp(z0 - .002, z1 + .002, t))))
        parts.append(tube('Guard', pts, .0034, brass, verts=4, caps=False))
    parts.append(ring_rod('Hoop', (0, 0, zm), .0775, .0038, brass, maj=18, mn=4))
    # fount: brass reservoir with a flared rim and a small wick knob
    zf = z1
    parts.append(lathe('Fount', [(0, zf - .002), (.066, zf - .002), (.074, zf - .016),
                                 (.07, zf - .06), (.079, zf - .068), (.074, zf - .078),
                                 (0, zf - .078)], brass, seg=18, smooth_angle=40))
    parts.append(lathe('Fount band', [(.0735, zf - .034), (.0765, zf - .038), (.0765, zf - .05),
                                      (.0725, zf - .054)], red, seg=16, smooth_angle=40))
    parts.append(cylinder_between('Knob stem', (.07, 0, zf - .022), (.088, 0, zf - .022), .004, dbrass, verts=6))
    parts.append(cyl('Knob', .009, .006, (.091, 0, zf - .022), dbrass, verts=6, bevel=0.0,
                     rot=(0, math.pi / 2, 0)))
    flame = empty('Flame', (0, 0, zm))
    print('hand-lantern', tri_count(parts))

    def tints():
        metal = [p for p in parts if p.data.materials[0] in (brass, dbrass)]
        up_light(metal, .78)
        tint([p for p in parts if p.name.startswith('Globe')],
             lambda p, n, f: (1.0, .92 + .08 * smoothstep(z1, z0, p.z), .8 + .2 * smoothstep(z1, z0, p.z)))
    return finish_prop('hand-lantern', parts, 'Hand lantern', empties=[flame], ground=None, dist=.06,
                       strength=.55, tints=tints)


# ================================================================ FALLEN STAR (hero)


def build_fallen_star():
    """A faceted star crystal, 0.35 m tip to tip: gem-cut facets that step in toward a raised
    table on both faces, a glowing `Lamp star` body with three small orbiting shards."""
    reset()
    star_m = mat('Lamp star', '#ffc93a', rough=.16, emit=.6, emit_color='#ffb01c')
    core_m = mat('Star core', '#ffe27e', rough=.12, emit=.9, emit_color='#ffcc45')
    R, r = .175, .08
    outline = star_outline(R, r)
    bm = bmesh.new()
    def ring(scale, z):
        return [bm.verts.new((x * scale, y * scale, z)) for x, y in outline]
    rings_top = [ring(1.0, .026), ring(.72, .07), ring(.4, .098)]
    rings_bot = [ring(1.0, -.026), ring(.72, -.07), ring(.4, -.098)]
    top_c = bm.verts.new((0, 0, .108))
    bot_c = bm.verts.new((0, 0, -.108))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((rings_bot[0][i], rings_bot[0][j], rings_top[0][j], rings_top[0][i]))
        for a_, b_ in zip(rings_top, rings_top[1:]):
            bm.faces.new((a_[i], a_[j], b_[j], b_[i]))
        for a_, b_ in zip(rings_bot, rings_bot[1:]):
            bm.faces.new((a_[j], a_[i], b_[i], b_[j]))
        bm.faces.new((rings_top[-1][i], rings_top[-1][j], top_c))
        bm.faces.new((rings_bot[-1][j], rings_bot[-1][i], bot_c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    body = from_bmesh('Star', bm, star_m, flat=True)
    # a glowing inner table on each face (the heart of the crystal)
    tables = []
    for sgn in (1, -1):
        tb = bmesh.new()
        pts = [tb.verts.new((x * .26, y * .26, sgn * .1035)) for x, y in outline]
        c = tb.verts.new((0, 0, sgn * .1105))
        for i in range(n):
            tb.faces.new((pts[i], pts[(i + 1) % n], c) if sgn > 0 else (pts[(i + 1) % n], pts[i], c))
        tables.append(from_bmesh('Star core', tb, core_m, flat=True))
    shards = []
    rng = random.Random(4)
    for k in range(3):
        a = TAU * k / 3 + .5
        p = Vector((math.cos(a) * .22, rng.uniform(-.05, .05), math.sin(a) * .22))
        sb = bmesh.new()
        bmesh.ops.create_cone(sb, cap_ends=True, segments=4, radius1=.022, radius2=0, depth=.03)
        for v in sb.verts:
            if v.co.z < 0:
                v.co.z -= .02
        sb.transform(Euler((rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 3))).to_matrix().to_4x4())
        shards.append(from_bmesh('Shard', sb, star_m, loc=p, flat=True))
    # stand upright facing -Y (the runtime bobs and spins it)
    parts = [body] + tables + shards
    for o in parts:
        o.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.view_layer.update()
    for o in parts:
        apply_transform(o)
    print('fallen-star', tri_count(parts))

    def tints():
        def f(p, n, face):
            d = Vector((p.x, p.z)).length / R
            k = 1 - .28 * smoothstep(.3, 1.0, d)  # deeper amber toward the tips
            facet = .86 + .14 * abs(n.dot(Vector((.4, -.8, .45)).normalized()))
            return (k * facet, k * facet * .93, k * facet * .8)
        tint(body, f)
    return finish_prop('fallen-star', parts, 'Fallen star', ground=None, dist=.05, strength=.35, tints=tints)


# ================================================================ COG (hero)


def gear_ring(name, teeth, r_root, r_tip, r_in, thick, material, tooth_frac=.5, top_frac=.6, chamfer=.006):
    """Spur gear rim with trapezoid teeth around an inner hole; axis along Y (face toward -Y).
    The hole uses half as many vertices as the toothed outline (each hole vertex fans to two)."""
    bm = bmesh.new()
    outer = []
    for i in range(teeth):
        a0 = TAU * i / teeth
        w = TAU / teeth
        tb = w * tooth_frac
        tt = tb * top_frac
        for a, rr in ((a0 - tb / 2, r_root), (a0 - tt / 2, r_tip), (a0 + tt / 2, r_tip), (a0 + tb / 2, r_root)):
            outer.append((math.cos(a) * rr, math.sin(a) * rr))
    n = len(outer)
    m = n // 2
    inner = [(math.cos(TAU * k / m - TAU / teeth * tooth_frac / 2) * r_in,
              math.sin(TAU * k / m - TAU / teeth * tooth_frac / 2) * r_in) for k in range(m)]
    fo = [bm.verts.new((x, -thick / 2, y)) for x, y in outer]
    bo = [bm.verts.new((x, thick / 2, y)) for x, y in outer]
    fi = [bm.verts.new((x, -thick / 2, y)) for x, y in inner]
    bi = [bm.verts.new((x, thick / 2, y)) for x, y in inner]
    for k in range(m):
        k1 = (k + 1) % m
        o0, o1, o2 = 2 * k, 2 * k + 1, (2 * k + 2) % n
        bm.faces.new((fo[o0], fo[o1], fo[o2], fi[k1], fi[k]))
        bm.faces.new((bo[o2], bo[o1], bo[o0], bi[k], bi[k1]))
        bm.faces.new((fi[k], fi[k1], bi[k1], bi[k]))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((fo[j], fo[i], bo[i], bo[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    rim = set(fo) | set(bo)
    rim_edges = [e for e in bm.edges if e.verts[0] in rim and e.verts[1] in rim
                 and abs(e.verts[0].co.y - e.verts[1].co.y) < 1e-6]
    bmesh.ops.bevel(bm, geom=rim_edges, offset=chamfer, offset_type='OFFSET', segments=1, profile=.5,
                    affect='EDGES', clamp_overlap=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    return from_bmesh(name, bm, material, smooth_angle=35)


def build_cog():
    """Brass mill cog, 0.5 m: 12 chamfered teeth, four spokes with open windows, a stepped iron
    hub with a square axle key and rivets, and green-brown patina in the recesses."""
    reset()
    brass = M('Brass', color='#d8a03c')
    iron = M('Iron')
    parts = [gear_ring('Rim', 12, .205, .25, .163, .07, brass, chamfer=.008)]
    for i in range(4):
        a = TAU * i / 4 + TAU / 8
        d = Vector((math.cos(a), 0, math.sin(a)))
        parts.append(beam('Spoke', d * .05, d * .17, .05, .046, brass, bevel=.008, up=(0, 1, 0)))
    parts.append(cyl('Hub', .064, .1, (0, 0, 0), iron, verts=10, bevel=.012, rot=(math.pi / 2, 0, 0)))
    parts.append(box('Axle key', (.036, .112, .036), (0, 0, 0), M('Brass'), bevel=0.0))
    print('cog', tri_count(parts))

    def tints():
        metal = [p for p in parts if p.data.materials[0] == brass]
        up_light(metal, .8)
        # patina: AO-darkened recesses shift toward green-brown
        for o in metal:
            attr = o.data.color_attributes['Color']
            for d in attr.data:
                c = d.color
                a = c[0]
                w = smoothstep(.95, .6, a)
                d.color = (a * (1 - .25 * w), a * (1 - .05 * w), a * (1 - .1 * w), 1)
    return finish_prop('cog', parts, 'Cog', ground=None, dist=.08, strength=.6, tints=tints)


# ================================================================ STORY ITEMS


def grid_sheet(name, nx, ny, sx, sy, fn, material, origin=(0, 0, 0)):
    """A (nx x ny)-quad sheet spanning sx x sy centred on origin; fn(u, v) -> z offset (u,v in -1..1)."""
    bm = bmesh.new()
    vs = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u, v = i / nx * 2 - 1, j / ny * 2 - 1
            p = fn(u, v)
            if isinstance(p, (tuple, list, Vector)):
                row.append(bm.verts.new(Vector(origin) + Vector(p)))
            else:
                row.append(bm.verts.new(Vector(origin) + Vector((u * sx / 2, v * sy / 2, p))))
        vs.append(row)
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    return from_bmesh(name, bm, material, smooth_angle=70)


def build_journal_page():
    """Sora's journal page: a folded cream letter tied with red cord and a bow, lines of blue ink
    on the flap and a red wax seal stamped with a star."""
    reset()
    paper = M('Paper', double=True)
    ink = mat('Ink', '#2b3f6e', rough=.6)
    cord = M('Fabric red', color='#d63a2e', rough=.7)
    wax = mat('Wax seal', '#b3241f', rough=.35)
    W, H = .27, .2
    parts = []
    # bottom leaf, gently curled
    parts.append(grid_sheet('Leaf', 6, 4, W, H, lambda u, v: .012 * u * u + .004 * v, paper))
    # folded flap, hinged at the top edge (+Y), slightly open with a lifted free corner
    def flap(u, v):
        t = (v + 1) / 2  # 0 at free edge (-Y) .. 1 at hinge (+Y)
        y = H / 2 - (1 - t) * H * .97
        z = .014 + .012 * u * u + .03 * (1 - t) ** 1.6 + .012 * max(0.0, -u) * (1 - t)
        return (u * W / 2 * .985, y, z)
    parts.append(grid_sheet('Flap', 6, 4, W, H, flap, paper))
    # hinge roll joining the leaves
    parts.append(tube('Fold', [Vector((-W / 2 * .985, H / 2 + .002, .007)), Vector((W / 2 * .985, H / 2 + .002, .007))],
                      .0075, paper, verts=6, caps=False))
    # handwriting: wavy ink strokes on the flap
    rng = random.Random(5)
    for k in range(5):
        yy = H / 2 - .04 - k * .028
        x0 = -W / 2 + .03 + (0.04 if k == 0 else 0)
        x1 = W / 2 - .03 - rng.uniform(0, .07)
        bm = bmesh.new()
        seg = 8
        prev = None
        for i in range(seg + 1):
            x = lerp(x0, x1, i / seg)
            u = x / (W / 2)
            t = (yy - (H / 2 - H * .97)) / (H * .97)
            y = yy + .003 * math.sin(i * 2.3 + k)
            z = .0155 + .012 * u * u + .03 * (1 - t) ** 1.6 + .012 * max(0.0, -u) * (1 - t) + .0008
            a = bm.verts.new((x, y - .0028, z))
            b_ = bm.verts.new((x, y + .0028, z))
            if prev:
                bm.faces.new((prev[0], a, b_, prev[1]))
            prev = (a, b_)
        parts.append(from_bmesh('Ink', bm, ink, smooth_angle=80))
    # cord wrapped around the packet, with a bow and tails at the front
    x = .05
    loop = [Vector((x, -H / 2 - .004, .006)), Vector((x, -H / 2 - .006, .03)), Vector((x, -.02, .052)),
            Vector((x, H / 2 - .02, .03)), Vector((x, H / 2 + .012, .012)), Vector((x, H / 2 + .004, -.006)),
            Vector((x, 0, -.009)), Vector((x, -H / 2 + .004, -.006))]
    parts.append(tube('Cord', spline(loop + [loop[0]], 18), .0036, cord, verts=5, caps=False, closed=False))
    knot = Vector((x, -.035, .052))
    for s in (-1, 1):
        parts.append(ring_rod('Bow', knot + Vector((s * .022, .004, .004)), .018, .0034, cord, axis=(0, .25, 1),
                              maj=12, mn=4))
        parts.append(tube('Tail', [knot, knot + Vector((s * .012, -.03, .004)), knot + Vector((s * .02, -.06, -.004))],
                          .0034, cord, verts=4, caps=True))
    parts.append(disc('Seal', knot + Vector((0, 0, .006)), (0, -.15, 1), .02, wax, seg=12, depth=.008, bevel=.003))
    st = extrude('Seal star', star_outline(.011, .0048), .003, wax, bevel=0.0, plane='XY',
                 loc=knot + Vector((0, 0, .0115)))
    parts.append(st)
    # present it upright, tilted back, facing -Y
    transform_all(parts, Matrix.Rotation(math.radians(62), 4, 'X'))
    recentre(parts)
    print('journal-page', tri_count(parts))

    def tints():
        tint([p for p in parts if p.data.materials[0] == paper],
             lambda p, n, f: (1.0, .97, .9 + .1 * max(0.0, n.y * -1)))
    return finish_prop('journal-page', parts, 'Journal page', ground=None, dist=.05, strength=.5, tints=tints)


def peach_body(name, r, material, subdiv=3, tip=.08, seed=2):
    """Peach/momo shape: plump round body, the suture groove, a small pointed tip on top."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1)
    cleft = Vector((1, 0, 0))
    for v in bm.verts:
        d = v.co.normalized()
        groove = .085 * math.exp(-(d.dot(cleft) / .13) ** 2) * (1 - abs(d.z)) ** .4 * (1 if d.y < 0 else .6)
        k = 1 - groove
        z = d.z
        if z > .6:  # pointed tip
            z += tip * ((z - .6) / .4) ** 2.2
        if z < -.8:
            z = -.8 - (-.8 - z) * .55  # flattish seat
        v.co = Vector((d.x * k * 1.02, d.y * k, z)) * r
    return from_bmesh(name, bm, material, smooth_angle=89)


def leaf_pair(prefix, base, material, size=.07, yaw=0.0, lift=.35):
    out = []
    for s in (-1, 1):
        a = yaw + s * .7
        d = Vector((math.cos(a), math.sin(a), lift))
        out.append(blade(prefix, base, d, size, size * .45, material, bend=.25, segs=3, fold=.25))
    return out


def build_peach():
    reset()
    skin = mat('Peach', '#ffb466', rough=.5)
    leaf = M('Leaves', double=True)
    stem_m = M('Dark wood')
    body = peach_body('Peach', .1, skin, subdiv=3)
    parts = [body, rod('Stem', (0, 0, .085), (.006, -.004, .118), .006, stem_m, verts=6)]
    parts += leaf_pair('Leaf', Vector((.004, -.002, .108)), leaf, size=.085, yaw=-.4)
    recentre(parts)
    print('peach', tri_count(parts))

    def tints():
        side = Vector((-.55, -.7, .45)).normalized()
        def f(p, n, face):
            w = smoothstep(-.35, .75, n.dot(side))
            top = smoothstep(.2, .95, n.z) * .35
            w = min(1.0, w * .85 + top)
            return (1.0, 1 - .62 * w, 1 - .5 * w)
        tint(body, f)
    return finish_prop('peach', parts, 'Peach', ground=None, dist=.06, strength=.45, tints=tints)


def build_peach_bun():
    """Hana's peach bun (momo manju): a snowy bun with a rosy tip and two leaves, sitting in an
    opened furoshiki with a checker (ichimatsu) weave and flared corners."""
    reset()
    dough = mat('Bun', '#fbf1e2', rough=.55)
    leaf = M('Leaves', double=True)
    cloth = M('Fabric teal', color='#1f8f9a', double=True)
    bun = peach_body('Bun', .085, dough, subdiv=3, tip=.12)
    bun.location = (0, 0, .07)
    parts = [bun]
    parts += leaf_pair('Leaf', Vector((0, -.07, .045)), leaf, size=.075, yaw=-math.pi / 2, lift=.1)
    def drape(u, v):
        r = max(abs(u), abs(v))
        corner = abs(u) * abs(v)
        z = .012 + .05 * smoothstep(.45, 1.0, r) + .09 * corner ** 1.5
        pull = 1 - .18 * corner
        return (u * .17 * pull, v * .17 * pull, z - .004 * math.cos(u * 5) * math.cos(v * 5))
    parts.append(grid_sheet('Cloth', 8, 8, .34, .34, drape, cloth))
    recentre(parts)
    print('peach-bun', tri_count(parts))

    def tints():
        c = bun.matrix_world.translation.copy()
        def f(p, n, face):
            w = smoothstep(.1, .95, n.z) * smoothstep(c.z, c.z + .1, p.z)
            return (1.0, 1 - .55 * w, 1 - .38 * w)
        tint(bun, f)
        cl = [p for p in parts if p.data.materials[0] == cloth][0]
        def chk(p, n, face):  # ichimatsu checker from face centres
            fc = face.center
            i = int(math.floor((fc.x + 1) / .0425)) + int(math.floor((fc.y + 1) / .0425))
            return 1.0 if i % 2 else (.62, .7, .8)
        tint(cl, chk)
    return finish_prop('peach-bun', parts, 'Peach bun', ground=None, dist=.06, strength=.5, tints=tints)


def fish_body(name, L, h, w, material, sides=8, rings=11, bend=0.0):
    """Trout body along +X (head at -X), deep in Y (dorsal +Y), thin in Z (lying on its side)."""
    pts = [Vector((-L / 2 + L * i / (rings - 1), bend * math.sin(i / (rings - 1) * math.pi) * L, 0))
           for i in range(rings)]
    prof = lambda t: max(.2, math.sin(math.pi * (.05 + .9 * t)) ** .5 * (1 - .5 * t))
    rings_ = []
    for i, p in enumerate(pts):
        t = i / (rings - 1)
        k = max(.06, prof(t))
        ring = []
        for j in range(sides):
            a = TAU * j / sides
            ring.append(p + Vector((0, math.cos(a) * h / 2 * k, math.sin(a) * w / 2 * k)))
        rings_.append(ring)
    return rings_mesh(name, rings_, material, pole_start=pts[0] - Vector((L * .03, 0, 0)),
                      pole_end=pts[-1] + Vector((L * .01, 0, 0)), smooth_angle=70,
                      outward=away_from_path(pts))


def build_plate_trout():
    """Salt-grilled trout on a long indigo-glazed dish, with grated daikon, a sudachi half and a
    shiso leaf; char stripes and salted fins painted into COLOR_0."""
    reset()
    glaze = mat('Dish glaze', '#2a5595', rough=.25)
    cream = mat('Dish cream', '#f1e7d0', rough=.35)
    skin = mat('Trout skin', '#cf9451', rough=.35)
    eye_m = mat('Eye', '#1d2430', rough=.2)
    daikon = mat('Daikon', '#f7f3ea', rough=.7)
    citrus = mat('Sudachi', '#7cc23c', rough=.45)
    leaf = M('Leaves', color='#3f9a3a', double=True)
    parts = [box('Dish', (.5, .22, .03), (0, 0, .015), glaze, bevel=.012, segments=2),
             box('Dish top', (.455, .178, .006), (0, 0, .031), cream, bevel=.003, segments=1)]
    L, h, w = .3, .12, .06
    fx = -.06
    fish = fish_body('Trout', L, h, w, skin, bend=.025)
    fish.location = (fx, -.012, .034 + w * .42)
    parts.append(fish)
    zc = .034 + w * .42
    # tail and fins lie flat in the fish's side plane (it rests on its flank)
    def fin(name, pts):
        bm = bmesh.new()
        vs = [bm.verts.new((x, y - .012, zc + z)) for x, y, z in pts]
        bm.faces.new(vs)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        return from_bmesh(name, bm, skin, smooth_angle=30)
    x0 = fx + L / 2 - .018
    parts.append(fin('Tail', [(x0, -.02, 0), (x0 + .075, -.06, .002), (x0 + .052, 0, .004), (x0 + .075, .06, .002),
                              (x0, .02, 0)]))
    parts.append(fin('Dorsal', [(fx - .045, h * .4, .012), (fx + .025, h * .36, .012), (fx - .02, h * .4 + .04, .014)]))
    parts.append(fin('Belly fin', [(fx + .03, -h * .36, .012), (fx + .085, -h * .3, .012), (fx + .07, -h * .36 - .03, .014)]))
    parts.append(sphere('Eye', (.014, .014, .006), (fx - .118, .002, zc + w * .4), eye_m, seg=8, rings=4))
    parts.append(sphere('Daikon', (.034, .03, .022), (.19, -.03, .05), daikon, seg=8, rings=4))
    parts.append(lathe('Sudachi', [(0, 0), (.026, .002), (.028, .012), (0, .016)], citrus, seg=10,
                       loc=(.19, .045, .036), rot=(math.radians(-70), 0, 0)))
    parts.append(blade('Shiso', (.14, .0, .036), (1, .3, .05), .1, .075, leaf, bend=-.05, segs=2, fold=.08))
    face_up([p for p in parts if p.name.startswith(('Tail', 'Dorsal', 'Belly', 'Shiso'))])
    # present it tilted toward the viewer
    transform_all(parts, Matrix.Rotation(math.radians(20), 4, 'X'))
    recentre(parts)
    print('plate-trout', tri_count(parts))

    def tints():
        def f(p, n, face):
            # grill stripes across the body, darker along the back, golden flanks
            s = .5 + .5 * math.sin(p.x * 95 + p.y * 30)
            char = .45 * smoothstep(.72, 1.0, s)
            back = .15 * smoothstep(0, .05, p.y + .02)
            k = 1 - char - back
            return (k, k * .92, k * .85)
        tint(fish, f)
        tint([p for p in parts if p.name.startswith(('Tail', 'Dorsal', 'Pectoral'))],
             lambda p, n, f: (1.0, 1.0, 1.0))
    return finish_prop('plate-trout', parts, 'Plate trout', ground=None, dist=.06, strength=.5, tints=tints)


def chestnut_nut(name, c, r, material, base_m, flat_dir=None, tilt=(0, 0)):
    """Glossy chestnut: round belly, pointed tip with tuft, flat pale seat (separate material)."""
    prof = [(0, r * 1.25), (r * .22, r * 1.08), (r * .62, r * .85), (r * .95, r * .45), (r * 1.02, 0),
            (r * .9, -r * .35), (r * .7, -r * .5)]
    rot = Vector((tilt[0], tilt[1], 1)).to_track_quat('Z', 'Y').to_euler()
    shell = lathe(name, prof, material, seg=10, loc=c, rot=rot, smooth_angle=60)
    if flat_dir is not None:  # squash one flank (chestnuts sit flat against each other)
        me = shell.data
        fd = Vector(flat_dir).normalized()
        for v in me.vertices:
            d = v.co.dot(fd)
            if d > 0:
                v.co -= fd * d * .45
        me.update()
    seat = lathe(name + ' seat', [(r * .7, -r * .5), (r * .45, -r * .56), (0, -r * .58)], base_m, seg=10, loc=c,
                 rot=rot, smooth_angle=60)
    return [shell, seat]


def spiky_burr_cup(name, r, material, inner_m, seed=0):
    """Opened chestnut burr: a four-lobed cup with a pale felt lining and spines on the outside."""
    rng = random.Random(seed)
    seg, rings = 16, 5
    outer, inner = [], []
    for k in range(rings):
        t = k / (rings - 1)
        el = -math.pi / 2 + t * math.pi * .62
        ring_o, ring_i = [], []
        for j in range(seg):
            a = TAU * j / seg
            lobe_ = .5 + .5 * math.cos(4 * a)
            ee = el + t * .35 * lobe_  # the four lobes reach higher and flare
            rr = r * (1 + .25 * t * t * lobe_)
            p = Vector((math.cos(a) * math.cos(ee) * rr, math.sin(a) * math.cos(ee) * rr, math.sin(ee) * rr))
            ring_o.append(p)
            ring_i.append(p * .86 + Vector((0, 0, r * .05)))
        outer.append(ring_o)
        inner.append(ring_i)
    shell = rings_mesh(name, outer, material, pole_start=Vector((0, 0, -r)), outward=away_from((0, 0, r * .3)),
                       smooth_angle=60)
    lining = rings_mesh(name + ' lining', inner, inner_m, pole_start=Vector((0, 0, -r * .8)),
                        outward=lambda c: Vector((0, 0, r * .6)) - c, smooth_angle=60)
    spines = []
    for k in range(1, rings):
        for j in range(0, seg, 1 if k > 1 else 2):
            p = outer[k][j]
            n = (p - Vector((0, 0, -r * .2))).normalized()
            L = r * rng.uniform(.35, .5)
            sb = bmesh.new()
            bmesh.ops.create_cone(sb, cap_ends=False, segments=3, radius1=r * .06, radius2=0, depth=L)
            sb.transform(Matrix.Translation(p + n * L * .45) @ n.to_track_quat('Z', 'Y').to_matrix().to_4x4())
            spines.append(from_bmesh('Spine', sb, material, smooth_angle=30))
    return [shell, lining] + spines


def build_chestnut():
    """Two glossy chestnuts nestled in an opened spiny burr."""
    reset()
    shell_m = mat('Chestnut', '#7d3a1b', rough=.22)
    seat_m = mat('Chestnut seat', '#d9b98a', rough=.8)
    burr_m = mat('Burr', '#8fb83a', rough=.6)
    lining_m = mat('Burr lining', '#e8d9b0', rough=.9)
    parts = spiky_burr_cup('Burr', .1, burr_m, lining_m, seed=3)
    parts += chestnut_nut('Chestnut', (-.038, 0, .03), .058, shell_m, seat_m, flat_dir=(1, 0, 0), tilt=(-.25, 0))
    parts += chestnut_nut('Chestnut', (.04, .005, .028), .056, shell_m, seat_m, flat_dir=(-1, 0, 0), tilt=(.25, .05))
    recentre(parts)
    print('chestnut', tri_count(parts))

    def tints():
        tint([p for p in parts if p.data.materials[0] == shell_m],
             lambda p, n, f: (.75 + .25 * smoothstep(-.2, .9, n.z),) * 3)
        tint([p for p in parts if p.data.materials[0] == burr_m],
             lambda p, n, f: (1.0, .9 + .1 * smoothstep(-.05, .05, p.z), .85))
    return finish_prop('chestnut', parts, 'Chestnut', ground=None, dist=.06, strength=.55, tints=tints)


def mushroom_item_part(prefix, base, h, r, cap_m, gill_m, stem_m, tilt=(0, 0), seg=16):
    rot = Vector((tilt[0], tilt[1], 1)).to_track_quat('Z', 'Y')
    top = Vector(base) + rot @ Vector((0, 0, h))
    parts = [lathe(prefix + ' stem', [(r * .3, 0), (r * .34, h * .08), (r * .26, h * .55), (r * .22, h * .96),
                                       (0, h * .96)], stem_m, seg=max(8, seg - 6), loc=base, rot=rot.to_euler())]
    ch = r * .66
    prof = [(r * .98, 0), (r * 1.02, ch * .18), (r * .92, ch * .55), (r * .62, ch * .88), (r * .28, ch * 1.0),
            (0, ch * 1.02)]
    cap_loc = top - rot @ Vector((0, 0, ch * .1))
    parts.append(lathe(prefix + ' cap', prof, cap_m, seg=seg, loc=cap_loc, rot=rot.to_euler(), smooth_angle=70))
    parts.append(lathe(prefix + ' gills', [(r * .98, 0), (r * .6, -ch * .12), (r * .22, -ch * .18), (0, -ch * .15)],
                       gill_m, seg=seg, loc=cap_loc, rot=rot.to_euler(), smooth_angle=70))
    return parts


def build_mushroom_item():
    """A plump forest mushroom with a little one beside it: chestnut-brown caps flecked cream,
    pale gills, stout stems, and a leaf."""
    reset()
    cap_m = mat('Mushroom cap', '#b8582a', rough=.45)
    gill_m = mat('Mushroom gill', '#e9d2a6', rough=.8)
    stem_m = mat('Mushroom stem', '#f3e6ca', rough=.7)
    leaf = M('Leaves', color='#6aaa36', double=True)
    parts = mushroom_item_part('Big', Vector((-.02, 0, 0)), .15, .11, cap_m, gill_m, stem_m, tilt=(-.12, .05))
    parts += mushroom_item_part('Small', Vector((.085, -.03, 0)), .09, .06, cap_m, gill_m, stem_m, tilt=(.35, -.1),
                                seg=12)
    parts.append(blade('Leaf', (.02, -.05, .004), (1, -.6, .08), .11, .07, leaf, bend=-.05, segs=2, fold=.12))
    recentre(parts)
    print('mushroom-item', tri_count(parts))

    def tints():
        off = Vector((2.3, .7, 1.1))
        def cap_tone(p, n, f):
            k = .72 + .28 * smoothstep(-.1, .9, n.z)
            fleck = smoothstep(.45, .7, noise.noise(p * 48 + off)) * smoothstep(.3, .9, n.z)
            return (k * (1 + .35 * fleck), k * (1 + .6 * fleck), k * (1 + .9 * fleck))
        tint([p for p in parts if p.data.materials[0] == cap_m], cap_tone)
    return finish_prop('mushroom-item', parts, 'Mushroom', ground=None, dist=.06, strength=.55, tints=tints)


def build_honeycomb():
    """A broken chunk of honeycomb: hexagonal wax cells (some capped, some brimming with honey)
    on the front face, and golden drips from the lower edge."""
    reset()
    wax = mat('Wax', '#f0b43a', rough=.5)
    honey = mat('Honey', '#ee8f12', rough=.05)
    cap_m = mat('Wax cap', '#fbd98a', rough=.55)
    pitch = .052
    ro = pitch / math.sqrt(3) * 1.0
    T = .05
    outline = []
    rng = random.Random(4)
    for i in range(11):
        a = TAU * i / 11
        rr = .14 * (1 + .12 * math.sin(a * 3 + 1) + rng.uniform(-.05, .05))
        outline.append((math.cos(a) * rr * 1.1, math.sin(a) * rr * .9))
    slab = extrude('Comb', outline, T, wax, bevel=.008, segments=1, plane='XZ')
    parts = [slab]
    def inside(x, z):
        # point-in-polygon on the outline (XZ), shrunk
        c = 0
        n = len(outline)
        for i in range(n):
            x1, z1 = outline[i]
            x2, z2 = outline[(i + 1) % n]
            if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
                c += 1
        return c % 2 == 1
    cells = []
    for row in range(-4, 5):
        for col in range(-4, 5):
            x = col * pitch + (pitch / 2 if row % 2 else 0)
            z = row * pitch * math.sqrt(3) / 2
            ok = all(inside(x + math.cos(TAU * k / 6) * ro * 1.15, z + math.sin(TAU * k / 6) * ro * 1.15)
                     for k in range(6))
            if ok:
                cells.append((x, z))
    yf = -T / 2 - .002
    for idx, (x, z) in enumerate(cells):
        capped = (idx * 7) % 5 == 0
        bm = bmesh.new()
        outer = [bm.verts.new((x + math.cos(TAU * k / 6 + TAU / 12) * ro, yf, z + math.sin(TAU * k / 6 + TAU / 12) * ro))
                 for k in range(6)]
        inner = [bm.verts.new((x + math.cos(TAU * k / 6 + TAU / 12) * ro * .78, yf - .004,
                               z + math.sin(TAU * k / 6 + TAU / 12) * ro * .78)) for k in range(6)]
        for k in range(6):
            k1 = (k + 1) % 6
            bm.faces.new((outer[k], outer[k1], inner[k1], inner[k]))
        rim = from_bmesh('Rim', bm, wax, smooth_angle=40)
        parts.append(rim)
        fb = bmesh.new()
        depth = .004 if capped else -.006
        fl = [fb.verts.new((x + math.cos(TAU * k / 6 + TAU / 12) * ro * .78, yf - depth,
                            z + math.sin(TAU * k / 6 + TAU / 12) * ro * .78)) for k in range(6)]
        fb.faces.new(fl)
        bmesh.ops.recalc_face_normals(fb, faces=fb.faces)
        for f in fb.faces:
            if f.normal.y > 0:
                f.normal_flip()
        if not capped:
            walls = []
            top = [fb.verts.new((v.co.x, yf - .004, v.co.z)) for v in fl]
            for k in range(6):
                k1 = (k + 1) % 6
                fb.faces.new((top[k], top[k1], fl[k1], fl[k]))
            bmesh.ops.recalc_face_normals(fb, faces=fb.faces)
        parts.append(from_bmesh('Cell', fb, cap_m if capped else honey, smooth_angle=40))
    transform_all(parts, Matrix.Rotation(math.radians(-12), 4, 'X') @ Matrix.Rotation(math.radians(8), 4, 'Z'))
    recentre(parts)
    print('honeycomb', tri_count(parts), 'cells', len(cells))
    return finish_prop('honeycomb', parts, 'Honeycomb', ground=None, dist=.05, strength=.55)


def build_bowl_chestnuts():
    """Honey-glazed chestnuts heaped in an indigo rice bowl with a cream glaze inside and chopsticks."""
    reset()
    glaze = mat('Bowl glaze', '#2a4f94', rough=.22)
    inner_m = mat('Bowl inner', '#f2e6cc', rough=.3)
    nut_m = mat('Honey chestnut', '#e9a526', rough=.14)
    syrup = mat('Honey', '#d9790c', rough=.06)
    sticks = mat('Chopsticks', '#b8323a', rough=.35)
    parts = [lathe('Bowl', [(0, 0), (.05, 0), (.052, .012), (.047, .016), (.085, .045), (.112, .092),
                            (.118, .105)], glaze, seg=14, smooth_angle=45),
             lathe('Bowl inside', [(.118, .105), (.112, .108), (.104, .102), (.075, .055), (0, .04)], inner_m,
                   seg=14, smooth_angle=45)]
    # foot ring and a band of cream around the waist (painted accent)
    parts.append(lathe('Band', [(.0935, .061), (.1005, .07), (.1008, .076), (.0945, .067)], inner_m, seg=14))
    parts.append(cyl('Syrup', .085, .004, (0, 0, .068), syrup, verts=14))
    rng = random.Random(2)
    spots = [(-.045, -.02, .082), (.04, -.03, .082), (.0, .045, .082), (-.05, .035, .08), (.05, .03, .08),
             (-.012, -.012, .118), (.022, .02, .115)]
    for i, (x, y, z) in enumerate(spots):
        r = .03 if i < 5 else .028
        parts.append(lathe('Nut', [(0, r * 1.1), (r * .6, r * .85), (r * .98, r * .25), (r * .9, -r * .45),
                                   (0, -r * .6)], nut_m, seg=7, loc=(x, y, z),
                           rot=(rng.uniform(-.5, .5), rng.uniform(-.5, .5), rng.uniform(0, 3))))
    parts.append(rod('Chopstick', (-.12, .075, .115), (.13, .06, .128), .0045, sticks, verts=5, r2=.0028))
    parts.append(rod('Chopstick', (-.12, .092, .116), (.13, .082, .13), .0045, sticks, verts=5, r2=.0028))
    recentre(parts)
    print('bowl-chestnuts', tri_count(parts))

    def tints():
        tint([p for p in parts if p.data.materials[0] == nut_m],
             lambda p, n, f: (1.0, .82 + .18 * smoothstep(-.3, .9, n.z), .7 + .3 * smoothstep(-.3, .9, n.z)))
    return finish_prop('bowl-chestnuts', parts, 'Bowl chestnuts', ground=None, dist=.06, strength=.55, tints=tints)


def square_end(name, centre, axis, w, h, material, rings=3):
    """Sawn square beam end with concentric square loops (so rings can be painted)."""
    bm = bmesh.new()
    c = bm.verts.new((0, 0, 0))
    loops = []
    for k in range(1, rings + 1):
        s = k / rings
        loops.append([bm.verts.new((x * w / 2 * s, y * h / 2 * s, 0))
                      for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for i in range(4):
        bm.faces.new((c, loops[0][i], loops[0][(i + 1) % 4]))
    for a, b in zip(loops, loops[1:]):
        for i in range(4):
            bm.faces.new((a[i], b[i], b[(i + 1) % 4], a[(i + 1) % 4]))
    q = Vector(axis).normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bm.transform(Matrix.Translation(Vector(centre)) @ q)
    ob = from_bmesh(name, bm, material, flat=True)
    ob['end'] = [float(x) for x in centre] + [float(x) for x in Vector(axis).normalized()] + [float(max(w, h) * .6)]
    return ob


def end_rings(obs, count=4.0):
    for o in obs:
        cx, cy, cz, ax, ay, az, r = o['end']
        c = Vector((cx, cy, cz))
        off = Vector((cx * 13, cy * 7, cz * 5))
        def f(p, n, face, c=c, r=r):
            d = (p - c).length / r + .08 * noise.noise(p * 40 + off)
            band = .5 + .5 * math.cos(d * count * TAU)
            k = 1 - .18 * band - .2 * smoothstep(.85, 1.1, d)
            return (k, k * .95, k * .88)
        tint(o, f)


def build_timber():
    """Kawabe timber: four fresh-cut beams lashed with rope, sawn ends showing growth rings and a
    red village brand."""
    reset()
    wood = M('Fresh wood', color='#dc9d5e')
    end_m = M('Wood end', color='#f0c88f')
    rope = M('Rope')
    brand = M('Red paint', color='#c8302a')
    L, w = .9, .1
    parts = []
    offs = [(-.052, -.052), (.052, -.052), (-.052, .052), (.052, .052)]
    for i, (y, z) in enumerate(offs):
        dx = (i % 3) * .015 - .015
        parts.append(box('Beam', (L, w, w), (dx, y, z), wood, bevel=.008, segments=1))
        parts.append(square_end('End', (dx - L / 2 - .0005, y, z), (-1, 0, 0), w * .96, w * .96, end_m))
        parts.append(square_end('End', (dx + L / 2 + .0005, y, z), (1, 0, 0), w * .96, w * .96, end_m))
    for x in (-.26, .26):
        path = []
        for k in range(12):
            a = TAU * k / 12 + TAU / 24
            rr = .108 / max(abs(math.cos(a)), abs(math.sin(a))) ** .35
            path.append(Vector((x + .004 * math.sin(k * 2), math.cos(a) * rr, math.sin(a) * rr)))
        parts.append(tube('Lashing', path, .011, rope, verts=5, caps=False, closed=True))
        parts.append(sphere('Knot', .02, (x, -.12, .07), rope, seg=6, rings=4))
    parts.append(disc('Brand', (-L / 2 - .003 - .015, -.052, .052), (-1, 0, 0), .026, brand, seg=10, depth=.002))
    transform_all(parts, Matrix.Rotation(math.radians(-25), 4, 'Z'))
    recentre(parts)
    print('timber', tri_count(parts))

    def tints():
        grain([p for p in parts if p.data.materials[0] == wood], axis='x', freq=30, amp=.2, seed=2)
        end_rings([p for p in parts if 'end' in p])
    return finish_prop('timber', parts, 'Timber', ground=None, dist=.08, strength=.6, tints=tints)


def hex_bolt(prefix, base, direction, L, r, iron_m, nut=False):
    d = Vector(direction).normalized()
    b = Vector(base)
    parts = [rod(prefix + ' shaft', b, b + d * L, r * .55, iron_m, verts=6, cap=False),
             rod(prefix + ' head', b - d * r * .7, b + d * .002, r * 1.15, iron_m, verts=6)]
    if nut:
        parts.append(rod(prefix + ' nut', b + d * (L - r * 1.2), b + d * (L - r * .3), r * 1.1, iron_m, verts=6))
    return parts


def build_iron_bolts():
    """Takamori iron: a small slatted crate of big hex bolts with iron corner straps and a teal
    stencilled band."""
    reset()
    wood = M('Wood', color='#b4773f')
    iron = M('Iron', color='#4a5260')
    teal = M('Teal paint')
    parts = []
    W, D, H = .34, .26, .17
    # slats (two per side) and corner posts
    for y in (-D / 2, D / 2):
        for z in (.045, .12):
            parts.append(box('Slat', (W, .016, .06), (0, y, z), wood, bevel=.005, segments=1))
    for x in (-W / 2, W / 2):
        for z in (.045, .12):
            parts.append(box('Slat', (.016, D - .01, .06), (x, 0, z), wood, bevel=.005, segments=1))
    parts.append(box('Bottom', (W, D, .012), (0, 0, .006), wood, bevel=0.0))
    for x in (-W / 2, W / 2):
        for y in (-D / 2, D / 2):
            parts.append(box('Strap', (.03, .03, H), (x, y, H / 2), iron, bevel=.004, segments=1))
    parts.append(box('Band', (.12, .004, .05), (-.03, -D / 2 - .009, .12), teal, bevel=0.0))
    rng = random.Random(3)
    for i, (x, y) in enumerate(((-.1, -.06), (-.02, -.07), (.07, -.05), (-.08, .04), (.02, .05), (.1, .04))):
        tiltv = Vector((rng.uniform(-.25, .25), rng.uniform(-.25, .25), 1))
        parts += hex_bolt('Bolt', (x, y, H + .03), -tiltv, .16, .018, iron)
    parts += hex_bolt('Loose bolt', (-.06, -.02, H + .05), (1, .2, .08), .2, .02, iron, nut=True)
    recentre(parts)
    print('iron-bolts', tri_count(parts))

    def tints():
        grain([p for p in parts if p.data.materials[0] == wood], axis='x', freq=26, amp=.18, seed=1)
        up_light([p for p in parts if p.data.materials[0] == iron], .75)
    return finish_prop('iron-bolts', parts, 'Iron bolts', ground=None, dist=.06, strength=.6, tints=tints)


def build_key():
    """The bell-tower key: a big blackened-iron key with a star-in-ring bow, brass collar and
    a red silk tassel."""
    reset()
    iron = M('Iron', color='#3c4452')
    brass = M('Brass')
    silk = M('Fabric red', color='#d6302c', rough=.55)
    parts = [ring_rod('Bow', (0, 0, 0), .05, .012, iron, axis=(0, 1, 0), maj=18, mn=6)]
    parts.append(extrude('Star', star_outline(.04, .017), .012, brass, bevel=.002, segments=1))
    parts.append(cylinder_between('Neck', (0, 0, -.058), (0, 0, -.075), .015, brass, verts=10))
    parts.append(cylinder_between('Collar', (0, 0, -.08), (0, 0, -.092), .019, iron, verts=10))
    parts.append(cylinder_between('Shaft', (0, 0, -.09), (0, 0, -.27), .011, iron, verts=8))
    parts.append(cylinder_between('Tip', (0, 0, -.27), (0, 0, -.282), .014, iron, verts=8))
    for z, w in ((-.215, .05), (-.245, .038)):
        parts.append(box('Bit', (w, .01, .022), (w / 2 + .008, 0, z), iron, bevel=.002, segments=1))
    parts.append(box('Bit', (.012, .01, .06), (.052, 0, -.23), iron, bevel=.002, segments=1))
    # tassel tied through the bow
    parts.append(ring_rod('Cord', (-.052, 0, .032), .016, .003, silk, axis=(0, 1, 0), maj=10, mn=4))
    parts.append(tube('Cord', [Vector((-.064, 0, .02)), Vector((-.08, -.004, -.01)), Vector((-.085, -.006, -.04))],
                      .003, silk, verts=4, caps=False))
    parts.append(sphere('Knot', .009, (-.085, -.006, -.045), silk, seg=8, rings=4))
    parts.append(lathe('Tassel', [(0, 0), (.009, -.005), (.013, -.03), (.018, -.06), (0, -.062)], silk, seg=8,
                       loc=(-.085, -.006, -.05)))
    transform_all(parts, Matrix.Rotation(math.radians(-35), 4, 'Y'))
    recentre(parts)
    print('key', tri_count(parts))

    def tints():
        up_light([p for p in parts if p.data.materials[0] in (iron, brass)], .75)
    return finish_prop('key', parts, 'Key', ground=None, dist=.05, strength=.55, tints=tints)


# ================================================================ HELD TOOLS


def build_fishing_rod():
    """Rin's bamboo rod, 2.2 m: grip at the origin, butt behind (+Y), rod along -Y bending up to
    the tip (node `Tip`). Red thread-wrapped grip, node rings, wire guides and a wooden reel."""
    reset()
    bamboo = M('Bamboo', color='#c8b453', rough=.4)
    thread = M('Fabric red', color='#cc3a2c', rough=.6)
    wood = M('Dark wood', color='#6a4128', rough=.5)
    line_m = mat('Line', '#f4f1e8', rough=.4)
    brass = M('Brass')
    spine = [Vector((0, .3, -.03)), Vector((0, 0, 0)), Vector((0, -.6, .07)), Vector((0, -1.15, .25)),
             Vector((0, -1.55, .55)), Vector((0, -1.78, .92))]
    P = spline(spine, 21)
    nodes = [.18, .34, .5, .64, .77, .88]
    def rad(t):
        base = lerp(.021, .0065, t ** .9)
        bump = sum(math.exp(-((t - c) / .012) ** 2) for c in nodes) * .18
        return base * (1 + bump)
    parts = [sweep('Rod', P, rad, bamboo, sides=6, caps=True, pole_end=P[-1] + (P[-1] - P[-2]).normalized() * .01)]
    # grip wrap: a thicker banded sleeve
    G = [p for p in spline(spine[:3], 12) if -.14 < p.y < .27]
    parts.append(sweep('Grip', G, lambda t: .026 * (1 + .06 * math.cos(t * 40)), thread, sides=8, caps=True))
    parts.append(ring_rod('Ferrule', spline(spine[:3], 12)[3], .02, .004, brass, axis=(0, 1, 0), maj=10, mn=4))
    # reel on a bracket under the grip
    rc = Vector((0, .1, -.058))
    parts.append(beam('Reel foot', (0, .06, -.02), (0, .14, -.02), .012, .01, brass, bevel=0.0))
    parts.append(cyl('Reel', .032, .026, rc, wood, verts=12, bevel=.004, rot=(0, math.pi / 2, 0)))
    parts.append(cyl('Reel spool', .022, .03, rc, line_m, verts=10, rot=(0, math.pi / 2, 0)))
    parts.append(rod('Reel handle', rc + Vector((.016, 0, .018)), rc + Vector((.034, 0, .018)), .004, brass, verts=5))
    parts.append(sphere('Reel knob', .008, rc + Vector((.036, 0, .018)), wood, seg=6, rings=4))
    # guides and the line running up them to the tip
    guides = []
    for t in (.4, .62, .82):
        i = int(t * (len(P) - 1))
        p = P[i]
        d = (P[i + 1] - P[i - 1]).normalized()
        down = d.cross(Vector((1, 0, 0))).normalized()
        if down.z > 0:
            down = -down
        g = p + down * .02
        guides.append(g)
        parts.append(ring_rod('Guide', g, .007, .0018, brass, axis=d, maj=6, mn=3))
    line = [rc + Vector((0, -.01, -.02)), *guides, P[-1]]
    parts.append(tube('Line', line, .0012, line_m, verts=3, caps=False))
    tip = empty('Tip', P[-1])
    print('fishing-rod', tri_count(parts))

    def tints():
        def band(p, n, f):
            t = min(1.0, max(0.0, (.3 - p.y) / 2.2))
            k = 1 - .25 * sum(math.exp(-((t - c) / .015) ** 2) for c in nodes)
            return (k, k * .97, k * .85)
        tint(parts[0], band)
    return finish_prop('fishing-rod', parts, 'Fishing rod', empties=[tip], ground=None, dist=.05, strength=.5,
                       tints=tints)


def build_hammer():
    """Wooden mallet (kizuchi): barrel head with iron hoops, a slim handle; origin at the grip."""
    reset()
    head_m = M('Wood', color='#b87a44')
    handle_m = M('Dark wood', color='#7a4a2c')
    iron = M('Iron')
    parts = [lathe('Handle', [(0, -.13), (.016, -.128), (.018, -.1), (.014, .05), (.013, .2), (0, .205)],
                   handle_m, seg=8, smooth_angle=50)]
    hz = .23
    parts.append(lathe('Head', [(0, -.1), (.048, -.1), (.056, -.085), (.058, 0), (.056, .085), (.048, .1),
                                (0, .1)], head_m, seg=12, loc=(0, 0, hz), rot=(0, math.pi / 2, 0), smooth_angle=40))
    for s in (-1, 1):
        parts.append(lathe('Hoop', [(.0575, -.012), (.0615, -.01), (.0615, .01), (.0575, .012)], iron, seg=12,
                           loc=(s * .078, 0, hz), rot=(0, math.pi / 2, 0)))
    parts.append(cyl('Wedge', .016, .004, (0, 0, hz + .057), handle_m, verts=6))
    print('hammer', tri_count(parts))

    def tints():
        grain([parts[0]], axis='z', freq=40, amp=.15)
        grain([parts[1]], axis='x', freq=30, amp=.15)
    return finish_prop('hammer', parts, 'Hammer', ground=None, dist=.05, strength=.5, tints=tints)


def build_hearth():
    """The shrine's outdoor hearth: a ring of mossy stones round an ash bed, crossed logs with
    glowing embers, a lashed tripod holding an iron pot of honey chestnuts by a hook chain, and
    a wooden ladle. Node `Fire` sits at the flame base."""
    reset()
    stone = M('Stone')
    wood = mat('Log', '#7b5134', rough=.85)
    char_m = mat('Char', '#2c2622', rough=.9)
    ember = mat('Ember', '#ff7a1c', rough=.6, emit=2.2, emit_color='#ff6a14')
    iron = M('Iron', color='#30363f')
    rope = M('Rope')
    stew = mat('Honey stew', '#d98a1c', rough=.12)
    ash = mat('Ash', '#6d6660', rough=.95)
    parts = []
    rng = random.Random(6)
    for i in range(9):
        a = TAU * i / 9 + rng.uniform(-.08, .08)
        c = Vector((math.cos(a) * .55, math.sin(a) * .55, 0))
        s = rng.uniform(.13, .17)
        b = boulder('Stone', stone, 50 + i, (s, s * .8, s * .7), c - Vector((s, s * .8, .03)),
                    c + Vector((s, s * .8, s * 1.1)), chamfer=.025, sides=6, shoulders=4, top_tilt=.2,
                    spin=a)
        parts.append(b)
    parts.append(cyl('Ash', .44, .03, (0, 0, .01), ash, verts=14))
    for i in range(4):  # logs crossed in the fire
        a = TAU * i / 4 + .4
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = d * .38 + Vector((0, 0, .05))
        p1 = d * .04 + Vector((0, 0, .13))
        parts.append(rod('Log', p0, p1, .045, wood, verts=7, r2=.038))
        parts.append(disc('Char', p1 + (p1 - p0).normalized() * .002, (p1 - p0), .037, char_m, seg=7, depth=.004))
    for i in range(6):  # embers
        a = rng.uniform(0, TAU)
        r = rng.uniform(.05, .2)
        sb = bmesh.new()
        bmesh.ops.create_icosphere(sb, subdivisions=1, radius=rng.uniform(.025, .04))
        parts.append(from_bmesh('Ember', sb, ember, loc=(math.cos(a) * r, math.sin(a) * r, .04), flat=True))
    # tripod
    top = Vector((0, 0, 1.25))
    feet = []
    for i in range(3):
        a = TAU * i / 3 + .3
        f = Vector((math.cos(a) * .72, math.sin(a) * .72, -.05))
        feet.append(f)
        parts.append(rod('Pole', f, top + (top - f).normalized() * .12, .028, wood, verts=6, r2=.022))
    parts.append(ring_rod('Lashing', top, .04, .014, rope, maj=10, mn=4))
    # chain of links and the pot
    z = top.z - .05
    for k in range(4):
        parts.append(ring_rod('Link', (0, 0, z - .045 * k), .02, .006, iron, axis=(1, 0, 0) if k % 2 else (0, 1, 0),
                              maj=8, mn=4))
    hook = z - .045 * 4
    parts.append(tube('Hook', [Vector((0, 0, hook + .02)), Vector((0, 0, hook - .03)), Vector((.02, 0, hook - .05)),
                               Vector((.035, 0, hook - .03))], .006, iron, verts=4, caps=False))
    pz = .42
    parts.append(lathe('Pot', [(0, pz), (.12, pz + .005), (.2, pz + .06), (.225, pz + .15), (.21, pz + .25),
                               (.225, pz + .27), (.232, pz + .285)], iron, seg=16, smooth_angle=45))
    parts.append(lathe('Pot inside', [(.232, pz + .285), (.214, pz + .28), (.2, pz + .24), (0, pz + .2)], iron,
                       seg=16, smooth_angle=45))
    parts.append(cyl('Stew', .205, .005, (0, 0, pz + .235), stew, verts=16))
    for i in range(5):  # chestnuts bobbing in the honey
        a = TAU * i / 5 + .3
        parts.append(sphere('Nut', (.03, .028, .022), (math.cos(a) * .1, math.sin(a) * .1, pz + .24), stew,
                            seg=6, rings=4))
    parts.append(ring_rod('Bail', (0, 0, pz + .29), .23, .007, iron, axis=(0, 1, 0), maj=14, mn=4, arc=.5))
    for s in (-1, 1):
        parts.append(sphere('Ear', .018, (s * .232, 0, pz + .27), iron, seg=6, rings=4))
    parts.append(tube('Hanger', [Vector((0, 0, pz + .52)), Vector((0, 0, hook - .03))], .005, iron, verts=4, caps=False))
    parts.append(rod('Ladle', (.05, -.05, pz + .2), (.24, -.16, pz + .5), .012, wood, verts=5))
    parts.append(sphere('Ladle bowl', (.04, .04, .018), (.05, -.05, pz + .21), wood, seg=8, rings=4))
    fire = empty('Fire', (0, 0, .12))
    print('hearth', tri_count(parts))

    def tints():
        rock_ft = facet_tone(random.Random(2), .18)
        tint([p for p in parts if p.data.materials[0] == stone],
             lambda p, n, f: (.72 + .28 * max(0.0, n.z)) * rock_ft(f) * (1 - .35 * smoothstep(.62, .35, Vector((p.x, p.y, 0)).length)))
        grain([p for p in parts if p.data.materials[0] == wood], axis='z', freq=30, amp=.18)
        tint([p for p in parts if p.data.materials[0] == wood],
             lambda p, n, f: 1 - .5 * smoothstep(.25, .04, Vector((p.x, p.y, 0)).length) * smoothstep(.3, 0, p.z))
        up_light([p for p in parts if p.data.materials[0] == iron], .7)
    return finish_prop('hearth', parts, 'Hearth', empties=[fire], ground=0.0, dist=.4, strength=.6, tints=tints)


# ================================================================ SET DRESSING


def build_crate():
    """Kawabe shipping crate, 0.8 m: bevelled corner battens and rims framing plank faces, with a
    red painted village mark."""
    reset()
    wood = M('Wood', color='#b27540')
    dark = M('Dark wood', color='#6b4128')
    paint = M('Red paint', color='#c9352a')
    S = .8
    t = .07
    parts = []
    h = S / 2
    for x in (-1, 1):
        for y in (-1, 1):
            parts.append(box('Post', (t, t, S), (x * (h - t / 2), y * (h - t / 2), h), dark, bevel=.012, segments=1))
    for z in (t / 2, S - t / 2):
        for y in (-1, 1):
            parts.append(box('Rim', (S - 2 * t, t, t), (0, y * (h - t / 2), z), dark, bevel=.012, segments=1))
        for x in (-1, 1):
            parts.append(box('Rim', (t, S - 2 * t, t), (x * (h - t / 2), 0, z), dark, bevel=.012, segments=1))
    # plank faces, slightly inset, three boards each with a gap
    bw = (S - 2 * t) / 3
    for k in range(3):
        o = -h + t + bw * (k + .5)
        for y in (-1, 1):
            parts.append(box('Plank', (S - 2 * t, .03, bw - .008), (0, y * (h - .03), t + bw * (k + .5)), wood,
                             bevel=0.0))
        for x in (-1, 1):
            parts.append(box('Plank', (.03, S - 2 * t, bw - .008), (x * (h - .03), 0, t + bw * (k + .5)), wood,
                             bevel=0.0))
        parts.append(box('Plank', (bw - .008, S - 2 * t, .03), (o, 0, S - .03), wood, bevel=0.0))
    # diagonal brace on the front face
    parts.append(beam('Brace', (-h + t, -h + .005, t), (h - t, -h + .005, S - t), .06, .035, dark, bevel=.008,
                      up=(0, -1, 0)))
    parts.append(disc('Mark', (-.17, -h - .004, .56), (0, -1, 0), .085, paint, seg=14, depth=.002))
    parts.append(disc('Mark hole', (-.17, -h - .006, .56), (0, -1, 0), .045, wood, seg=12, depth=.002))
    print('crate', tri_count(parts))

    def tints():
        grain([p for p in parts if p.data.materials[0] == wood], axis='x', freq=22, amp=.22, seed=3)
        grain([p for p in parts if p.data.materials[0] == dark], axis='z', freq=22, amp=.15, seed=4)
    return finish_prop('crate', parts, 'Crate', tints=tints)


def build_barrel():
    """Stave barrel with iron hoops, a plank lid and a red painted label disc."""
    reset()
    wood = M('Wood', color='#a86a3a')
    iron = M('Iron', color='#3b424e')
    lid_m = M('Wood end', color='#c98d55')
    paint = M('Red paint', color='#c9352a')
    H, R = .95, .34
    seg = 14
    prof = []
    for k in range(9):
        t = k / 8
        prof.append((R * (.86 + .14 * math.sin(math.pi * t)), H * t))
    body = lathe('Barrel', [(0, 0)] + prof + [(0, H)], wood, seg=seg, smooth_angle=5)
    # staves: shade alternate staves (painted), keep the vertical seams crisp
    parts = [body]
    for z in (.08, .3, H - .3, H - .08):
        t = z / H
        r = R * (.86 + .14 * math.sin(math.pi * t)) + .006
        parts.append(lathe('Hoop', [(r - .004, z - .022), (r + .004, z - .02), (r + .004, z + .02),
                                    (r - .004, z + .022)], iron, seg=seg, smooth_angle=40))
    parts.append(cyl('Lid', R * .83, .012, (0, 0, H - .02), lid_m, verts=seg))
    parts.append(disc('Label', (0, -R * .99, H * .5), (0, -1, .0), .11, paint, seg=12, depth=.004))
    print('barrel', tri_count(parts))

    def tints():
        def stave(p, n, face):
            a = math.atan2(p.y, p.x)
            k = int(((a + math.pi) / TAU) * seg) % 3
            return (.86, .9, 1.0)[k]
        tint(body, stave)
        grain([body], axis='z', freq=30, amp=.18, seed=2)
        tint([parts[-2]], lambda p, n, f: 1 - .2 * (int((p.x + 1) / .1) % 2))
    return finish_prop('barrel', parts, 'Barrel', tints=tints)


def sack_mesh(name, h, r, material, rng):
    """Rice sack: a squarish slumped body (superellipse section, flat seat), shoulders gathered
    into a tied neck and a frilled tuft of cloth above the tie."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=9, radius=1)
    off = Vector((rng.uniform(0, 9), rng.uniform(0, 9), rng.uniform(0, 9)))
    p_ = 3.0
    for v in bm.verts:
        d = v.co.copy()
        z = (d.z + 1) / 2
        a = math.atan2(d.y, d.x)
        se = 1 / ((abs(math.cos(a)) ** p_ + abs(math.sin(a)) ** p_) ** (1 / p_))
        if z < .1:
            w = r * (.82 + .18 * z / .1)
            zz = h * z * .5
        elif z < .6:
            w = r * (1 + .07 * math.sin(math.pi * (z - .1) / .5))
            zz = h * lerp(.05, .6, (z - .1) / .5)
        elif z < .84:
            t = smoothstep(.6, .84, z)
            w = r * lerp(1.0, .2, t)
            zz = h * lerp(.6, .8, (z - .6) / .24)
            se = lerp(se, 1.0, t)
        else:
            t = (z - .84) / .16
            w = r * (.2 + .34 * t) * (1 + .25 * math.sin(a * 5 + off.x))
            zz = h * (.8 + .16 * t)
            se = 1.0
        v.co = Vector((math.cos(a) * w * se * 1.12, math.sin(a) * w * se * .82, zz))
        v.co += Vector((noise.noise(v.co * 5 + off), noise.noise(v.co * 5 + off + Vector((3, 0, 0))),
                        .5 * noise.noise(v.co * 5 + off + Vector((0, 3, 0))))) * r * .07
    return from_bmesh(name, bm, material, smooth_angle=80)


def build_sacks():
    """Three burlap rice sacks (two standing, one lying), tied with rope, stamped with marks."""
    reset()
    burlap = M('Burlap')
    rope = M('Rope', color='#a8804a')
    ink = mat('Stamp', '#2d4f8a', rough=.8)
    red = M('Red paint', color='#c9352a')
    rng = random.Random(5)
    parts = []
    specs = [((-.28, .05, 0), .78, .3, 0.0, ink), ((.3, .12, 0), .7, .28, .4, red)]
    for (x, y, z), h, r, spin, stamp in specs:
        s = sack_mesh('Sack', h, r, burlap, rng)
        s.location = (x, y, z)
        s.rotation_euler = (0, 0, spin)
        parts.append(s)
        parts.append(ring_rod('Tie', (x, y, h * .8), r * .24, .02, rope, maj=10, mn=4))
        parts.append(disc('Stamp', (x, y - r * .86, h * .36), (0, -1, 0), r * .4, stamp, seg=10, depth=.003))
    lying = sack_mesh('Sack', .72, .27, burlap, rng)
    lying.location = (.02, -.42, .25)
    lying.rotation_euler = (math.radians(-86), 0, math.radians(-75))
    parts.append(lying)
    bpy.context.view_layer.update()
    tie_p = lying.matrix_world @ Vector((0, 0, .72 * .8))
    tie_d = (lying.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
    parts.append(ring_rod('Tie', tie_p, .27 * .24, .02, rope, axis=tie_d, maj=10, mn=4))
    print('sacks', tri_count(parts))

    def tints():
        def weave(p, n, face):
            v = .5 + .5 * math.sin(p.x * 160) * math.sin(p.z * 160 + p.y * 160)
            return (.92 + .08 * v) * (.8 + .2 * smoothstep(-.2, .8, n.z))
        tint([p for p in parts if p.data.materials[0] == burlap], weave)
    return finish_prop('sacks', parts, 'Sacks', tints=tints)


def build_fence_wood():
    """2 m Kawabe fence segment: dark timber posts with caps and three horizontal boards."""
    reset()
    dark = M('Dark wood', color='#5f3a27')
    board = M('Wood', color='#8c5a36')
    parts = []
    for x in (-.94, .94):
        parts.append(box('Post', (.11, .11, 1.25), (x, 0, .56), dark, bevel=.012, segments=1))
        parts.append(box('Cap', (.15, .15, .04), (x, 0, 1.2), dark, bevel=.01, segments=1, taper=(.5, .5)))
    for z in (.3, .62, .94):
        parts.append(box('Board', (2.0, .035, .17), (0, -.075, z), board, bevel=.008, segments=1))
    print('fence-wood', tri_count(parts))

    def tints():
        grain([p for p in parts if p.data.materials[0] == board], axis='x', freq=18, amp=.25, seed=1)
        tint(parts, lambda p, n, f: .8 + .2 * smoothstep(0, .5, p.z))
    return finish_prop('fence-wood', parts, 'Fence wood', dist=.3, tints=tints)


def build_fence_bamboo():
    """2 m yotsume-gaki bamboo fence: posts, three rails and alternating verticals tied with black
    rope knots."""
    reset()
    bamboo = M('Bamboo', color='#bdb04a', rough=.4)
    post_m = M('Bamboo', color='#bdb04a', rough=.4)
    knot_m = mat('Black rope', '#262a33', rough=.8)
    parts = []
    for x in (-.95, .95):
        parts.append(cyl('Post', .045, 1.25, (x, 0, .6), bamboo, verts=7))
    for z in (.3, .65, 1.0):
        parts.append(rod('Rail', (-1.0, 0, z), (1.0, 0, z), .018, bamboo, verts=5))
    for i in range(7):
        x = -.72 + i * .24
        y = .03 if i % 2 else -.03
        parts.append(cyl('Upright', .016, 1.08, (x, y, .5), bamboo, verts=5))
    for i in range(0, 7, 2):
        x = -.72 + i * .24
        for z in (.65,):
            parts.append(box('Knot', (.05, .05, .035), (x, 0, z), knot_m, bevel=0.0))
    print('fence-bamboo', tri_count(parts))

    def tints():
        def nodes_(p, n, f):
            k = 1 - .3 * smoothstep(.9, 1.0, math.cos(p.z * 11))
            return (k, k, k * .9)
        tint([p for p in parts if p.data.materials[0] == bamboo], nodes_)
    return finish_prop('fence-bamboo', parts, 'Fence bamboo', dist=.25, tints=tints)


def build_wall_stone():
    """2 m dry-stone wall segment, 1.1 m high: two courses of big chamfered blocks under long cap
    stones, mossy on top."""
    reset()
    stone = M('Stone')
    rng = random.Random(8)
    parts = []
    rows = [(0.0, .42, [.62, .76, .62]), (.42, .4, [.5, .72, .78]), (.82, .28, [1.02, .98])]
    for z0, hh, widths in rows:
        x = -1.0
        for w in widths:
            d = .5 if hh > .3 else .56
            b = box('Stone', (w - .025, d, hh - .02), (x + w / 2, rng.uniform(-.02, .02), z0 + hh / 2),
                    stone, bevel=.045, segments=1)
            b.rotation_euler = (rng.uniform(-.02, .02), rng.uniform(-.03, .03), rng.uniform(-.03, .03))
            parts.append(b)
            x += w
    print('wall-stone', tri_count(parts))

    def tints():
        ft = {}
        def f(p, n, face):
            key = face.id_data.name
            if key not in ft:
                ft[key] = (rng.uniform(.82, 1.0), rng.uniform(-.06, .06))
            k, h = ft[key]
            moss = smoothstep(.95, 1.1, p.z) * max(0.0, n.z) * (.5 + .5 * noise.noise(p * 3))
            k *= .75 + .25 * smoothstep(0, .6, p.z)
            return (k * (1 + h) * (1 - .45 * moss), k * (1 + .1 * moss), k * (1 - h) * (1 - .55 * moss))
        tint(parts, f)
    return finish_prop('wall-stone', parts, 'Wall stone', dist=.35, tints=tints)


def build_bench():
    """Meiji park bench: teal cast-iron ends with scrolled arms, varnished wooden slats."""
    reset()
    wood = M('Wood', color='#b8743a')
    iron = M('Teal paint', color='#1f7f8c', rough=.35, metal=.3)
    parts = []
    W = 1.6
    side = [(-.24, 0), (-.2, 0), (-.18, .42), (.2, .42), (.22, 0), (.26, 0), (.24, .46), (.26, .62),
            (.2, .66), (.16, .6), (.2, .5), (-.14, .5), (-.2, .95), (-.26, .95), (-.24, .5)]
    for x in (-W / 2 + .1, W / 2 - .1):
        parts.append(extrude('End', [(y, z) for y, z in side], .045, iron, bevel=.008, segments=1,
                             loc=(x, 0, 0), rot=(0, 0, math.pi / 2)))
    for k in range(4):
        parts.append(box('Seat slat', (W, .085, .035), (0, -.2 + k * .105, .44), wood, bevel=.01, segments=1))
    for k in range(3):
        z = .58 + k * .12
        parts.append(box('Back slat', (W, .03, .085), (0, .2 + (z - .5) * .12 + .03, z), wood, bevel=.01, segments=1))
        parts[-1].rotation_euler = (math.radians(-8), 0, 0)
    print('bench', tri_count(parts))

    def tints():
        grain([p for p in parts if p.data.materials[0] == wood], axis='x', freq=24, amp=.2, seed=4)
    return finish_prop('bench', parts, 'Bench', dist=.3, tints=tints)


def build_well():
    """Stone well with a timber frame, little gable roof, pulley, rope and a wooden bucket."""
    reset()
    stone = M('Stone', color='#a39a8e')
    wood = M('Dark wood', color='#6a4128')
    roof_m = mat('Roof', '#a8432c', rough=.55)
    rope = M('Rope')
    bucket_m = M('Wood', color='#b87a44')
    iron = M('Iron')
    water = mat('Water', '#1f4f6a', rough=.05)
    R = .6
    wall = [(R * .78, -.05), (R, -.05)]
    for k in range(5):  # five bulging stone courses with mortar grooves between them
        z0 = -.05 + k * .135
        wall += [(R * 1.022, z0 + .0675), (R * 1.0, z0 + .135)]
    wall += [(R * 1.08, .66), (R * 1.08, .74), (R * .98, .76), (R * .8, .74), (R * .78, .2)]
    parts = [lathe('Well', wall, stone, seg=16, smooth_angle=60),
             cyl('Water', R * .79, .01, (0, 0, .3), water, verts=16)]
    for x in (-R * .95, R * .95):
        parts.append(box('Post', (.09, .09, 1.55), (x, 0, .78), wood, bevel=.01, segments=1))
    parts.append(box('Beam', (R * 2.2, .1, .09), (0, 0, 1.52), wood, bevel=.01, segments=1))
    for s in (-1, 1):
        r = box('Roof', (R * 2.5, .5, .04), (0, s * .2, 1.72), roof_m, bevel=.012, segments=1)
        r.rotation_euler = (s * math.radians(-32), 0, 0)
        parts.append(r)
    parts.append(box('Ridge', (R * 2.6, .07, .06), (0, 0, 1.86), wood, bevel=.01, segments=1))
    parts.append(cyl('Pulley', .09, .04, (0, 0, 1.4), iron, verts=12, bevel=.01, rot=(0, math.pi / 2, 0)))
    parts.append(rod('Rope', (0, -.09, 1.4), (0, -.09, .75), .008, rope, verts=4))
    parts.append(rod('Rope', (0, .09, 1.4), (.12, .35, .92), .008, rope, verts=4))
    b = lathe('Bucket', [(0, 0), (.1, 0), (.12, .2), (.105, .2), (.09, .03), (0, .03)], bucket_m, seg=10,
              loc=(.12, -.42, .76))
    parts.append(b)
    parts.append(ring_rod('Bucket band', (.12, -.42, .1 + .76), .115, .007, iron, maj=10, mn=3))
    print('well', tri_count(parts))

    def tints():
        def courses(p, n, f):
            row = int((p.z + .05) / .135)
            a = math.atan2(p.y, p.x)
            col = int((a + math.pi) / (TAU / 10) + (row % 2) * .5)
            k = .8 + .2 * ((row * 7 + col * 13) % 5) / 4
            mortar = 1 - smoothstep(.0, .25, abs(math.sin((p.z + .05) / .135 * math.pi)))
            return (k * (1 - .35 * mortar) * (.7 + .3 * smoothstep(0, .6, p.z)),) * 2 + (k * (1 - .3 * mortar) * .97,)
        tint(parts[0], courses)
        grain([p for p in parts if p.data.materials[0] == wood], axis='z', freq=20, amp=.15)
    return finish_prop('well', parts, 'Well', dist=.5, tints=tints)


def build_market_stall():
    """Fish and fruit stall: a timber table with a striped awning (red and cream), crates of
    oranges and peaches, fish on a tray of ice and a hanging price board."""
    reset()
    wood = M('Wood', color='#9a6438')
    dark = M('Dark wood', color='#5a3726')
    red = M('Fabric red', color='#d8342c', rough=.6)
    cream = M('Fabric cream', color='#f3ead6', rough=.6)
    fruit_o = mat('Orange', '#ff8a1e', rough=.45)
    fruit_p = mat('Peach', '#ff9f7a', rough=.5)
    fish_m = mat('Fish', '#8fa7b8', rough=.25, metal=.3)
    parts = []
    W, D = 1.8, .8
    parts.append(box('Table', (W, D, .06), (0, 0, .82), wood, bevel=.012, segments=1))
    parts.append(box('Skirt', (W - .04, .03, .5), (0, -D / 2 + .03, .55), dark, bevel=.008, segments=1))
    for x in (-W / 2 + .06, W / 2 - .06):
        parts.append(box('Post', (.07, .07, 2.3), (x, D / 2 - .05, 1.15), dark, bevel=.01, segments=1))
        parts.append(box('Leg', (.06, .06, .8), (x, -D / 2 + .06, .4), dark, bevel=.008, segments=1))
    # awning: alternating red/cream panels sloping forward, with a scalloped valance
    n = 6
    for i in range(n):
        x = -W / 2 - .05 + (W + .1) * (i + .5) / n
        m = red if i % 2 == 0 else cream
        p = box('Awning', ((W + .1) / n + .003, 1.15, .02), (x, -.15, 2.05), m, bevel=0.0)
        p.rotation_euler = (math.radians(18), 0, 0)
        parts.append(p)
        v = extrude('Valance', [(-(W + .1) / n / 2, 0), ((W + .1) / n / 2, 0), (0, -.13)], .01,
                    m, bevel=0.0, loc=(x, -.7, 1.87))
        parts.append(v)
    # crates of fruit and a tray of fish
    for cx, fm in ((-.55, fruit_o), (-.1, fruit_p)):
        parts.append(box('Crate', (.4, .34, .12), (cx, .05, .91), wood, bevel=.01, segments=1))
        for k in range(6):
            fx = cx - .12 + (k % 3) * .12
            fy = .05 - .07 + (k // 3) * .14
            parts.append(sphere('Fruit', .06, (fx, fy, .99), fm, seg=6, rings=4))
    parts.append(box('Tray', (.55, .36, .04), (.5, .02, .87), M('Cream paint', color='#dfe9ee'), bevel=.01,
                     segments=1))
    for k in range(3):
        pts = [Vector((.3, -.08 + k * .09, .905)), Vector((.5, -.08 + k * .09 + .01, .915)),
               Vector((.68, -.08 + k * .09, .905))]
        parts.append(sweep('Fish', spline(pts, 5), lambda t: .032 * math.sin(math.pi * min(1, t * 1.1 + .08)) + .006,
                           fish_m, sides=6, caps=True, squash=.55))
        parts.append(blade('Tail', (.68, -.08 + k * .09, .905), (1, 0, 0), .05, .06, fish_m, bend=0, segs=1, fold=0,
                           taper=False, up=(0, 0, 1)))
    parts.append(box('Sign', (.5, .02, .2), (0, -.62, 1.62), cream, bevel=.008, segments=1))
    parts.append(rod('Sign cord', (-.2, -.62, 1.72), (-.2, -.55, 1.93), .005, dark, verts=4))
    parts.append(rod('Sign cord', (.2, -.62, 1.72), (.2, -.55, 1.93), .005, dark, verts=4))
    print('market-stall', tri_count(parts))

    def tints():
        grain([p for p in parts if p.data.materials[0] in (wood, dark)], axis='x', freq=20, amp=.18)
        tint([p for p in parts if p.data.materials[0] == fish_m],
             lambda p, n, f: (.75 + .25 * max(0.0, n.z),) * 3)
    return finish_prop('market-stall', parts, 'Market stall', dist=.5, tints=tints)


def build_street_lamp():
    """Meiji gas lamp on a wooden post: stone footing, iron bracket, a four-pane lantern box
    (`Street glow`) under a pyramid hood with a finial."""
    reset()
    wood = M('Dark wood', color='#5a3726')
    stone = M('Stone')
    iron = M('Iron', color='#2f3642')
    glow = mat('Street glow', '#ffd07a', rough=.2, emit=.0, emit_color='#ffc45a')
    parts = [box('Footing', (.34, .34, .25), (0, 0, .1), stone, bevel=.03, segments=1),
             box('Post', (.12, .12, 2.7), (0, 0, 1.45), wood, bevel=.015, segments=1),
             box('Collar', (.16, .16, .05), (0, 0, 2.62), iron, bevel=.01, segments=1)]
    zc = 2.9
    s = .15
    parts.append(box('Lamp base', (.3, .3, .04), (0, 0, zc - .2), iron, bevel=.008, segments=1))
    parts.append(box('Lamp top', (.34, .34, .04), (0, 0, zc + .2), iron, bevel=.008, segments=1))
    for x in (-1, 1):
        for y in (-1, 1):
            parts.append(box('Frame', (.025, .025, .4), (x * s, y * s, zc), iron, bevel=.004, segments=1))
    parts.append(box('Panes', (.28, .28, .36), (0, 0, zc), glow, bevel=.006, segments=1))
    parts.append(lathe('Hood', [(.25, zc + .22), (.24, zc + .25), (.03, zc + .42), (0, zc + .43)], iron, seg=4,
                       rot=(0, 0, math.pi / 4), smooth_angle=20))
    parts.append(sphere('Finial', .035, (0, 0, zc + .46), iron, seg=8, rings=5))
    parts.append(cyl('Chimney', .03, .06, (0, 0, zc + .38), iron, verts=8))
    parts.append(cyl('Lamp stem', .05, .2, (0, 0, zc - .3), iron, verts=8))
    for a in (0, math.pi / 2, math.pi, 1.5 * math.pi):
        d = Vector((math.cos(a), math.sin(a), 0))
        parts.append(tube('Scroll', [d * .06 + Vector((0, 0, 2.6)), d * .16 + Vector((0, 0, 2.62)),
                                     d * .13 + Vector((0, 0, 2.7))], .012, iron, verts=4))
    print('street-lamp', tri_count(parts))

    def tints():
        grain([parts[1]], axis='z', freq=18, amp=.2)
        tint([parts[0]], lambda p, n, f: .75 + .25 * max(0.0, n.z))
    return finish_prop('street-lamp', parts, 'Street lamp', dist=.4, tints=tints)


def build_postbox():
    """Red round Meiji postbox: domed cap with a brim, a slot under a hood, a white collection
    plate and a near-black plinth."""
    reset()
    red = M('Red paint', color='#d8342a', rough=.35)
    black = mat('Postbox base', '#262c38', rough=.45, metal=.3)
    plate = M('Cream paint', color='#f4f1e8')
    slot_m = mat('Slot', '#1d2430', rough=.6)
    R = .22
    parts = [cyl('Plinth', R * 1.08, .16, (0, 0, .08), black, verts=18, bevel=.02),
             lathe('Body', [(R, .16), (R * 1.01, .9), (R * 1.08, .93), (R * 1.1, .98), (R * 1.02, 1.0),
                            (R * .8, 1.1), (R * .45, 1.16), (0, 1.18)], red, seg=18, smooth_angle=45),
             lathe('Knob', [(0, 1.17), (.03, 1.18), (.035, 1.22), (0, 1.24)], red, seg=8)]
    parts.append(box('Slot hood', (.22, .06, .05), (0, -R - .01, .8), red, bevel=.012, segments=1))
    parts.append(box('Slot', (.18, .02, .025), (0, -R + .005, .76), slot_m, bevel=0.0))
    parts.append(box('Plate', (.12, .012, .16), (0, -R - .002, .5), plate, bevel=.004, segments=1))
    parts.append(box('Door', (.2, .01, .24), (0, -R + .006, .32), red, bevel=.004, segments=1))
    parts.append(cyl('Lock', .012, .012, (.07, -R - .003, .32), M('Brass'), verts=8, rot=(math.pi / 2, 0, 0)))
    print('postbox', tri_count(parts))

    def tints():
        up_light([p for p in parts if p.data.materials[0] == red], .78)
    return finish_prop('postbox', parts, 'Postbox', dist=.3, tints=tints)


def build_signpost():
    """Wooden signpost under a tiny gable roof with three painted arrow boards."""
    reset()
    wood = M('Dark wood', color='#6a4128')
    roof_m = mat('Roof', '#a8432c', rough=.55)
    board = M('Cream paint', color='#f1e4c6', rough=.6)
    tips = [M('Red paint'), M('Teal paint'), M('Mustard paint')]
    parts = [box('Post', (.12, .12, 2.2), (0, 0, 1.05), wood, bevel=.012, segments=1),
             box('Footing', (.22, .22, .12), (0, 0, .05), M('Stone'), bevel=.02, segments=1)]
    for s in (-1, 1):
        r = box('Roof', (.44, .24, .03), (0, s * .09, 2.2), roof_m, bevel=.008, segments=1)
        r.rotation_euler = (s * math.radians(-35), 0, 0)
        parts.append(r)
    arrow = [(-.34, -.1), (.26, -.1), (.26, -.15), (.46, 0), (.26, .15), (.26, .1), (-.34, .1)]
    for i, (z, yaw) in enumerate(((1.8, .15), (1.5, 2.75), (1.2, -.55))):
        a = extrude('Arrow', arrow, .035, board, bevel=.008, segments=1, loc=(0, 0, z), rot=(0, 0, yaw))
        parts.append(a)
        tipb = extrude('Arrow tip', [(.26, -.15), (.46, 0), (.26, .15)], .04, tips[i], bevel=.005, segments=1,
                       loc=(0, 0, z), rot=(0, 0, yaw))
        parts.append(tipb)
        band_ = extrude('Arrow band', [(-.34, -.1), (-.26, -.1), (-.26, .1), (-.34, .1)], .04, tips[i], bevel=0.0,
                        loc=(0, 0, z), rot=(0, 0, yaw))
        parts.append(band_)
        # the board is offset along its own axis so it hangs off the post
        for o in (a, tipb, band_):
            o.location += Vector((math.cos(yaw), math.sin(yaw), 0)) * .3
    print('signpost', tri_count(parts))

    def tints():
        grain([p for p in parts if p.data.materials[0] == wood], axis='z', freq=20, amp=.2)
    return finish_prop('signpost', parts, 'Signpost', dist=.3, tints=tints)


def cart_wheel(name, c, R, wood, iron):
    parts = [ring_rod(name + ' rim', c, R, .038, wood, axis=(1, 0, 0), maj=16, mn=4),
             ring_rod(name + ' tyre', c, R + .03, .012, iron, axis=(1, 0, 0), maj=14, mn=3),
             cyl(name + ' hub', .07, .14, c, wood, verts=8, bevel=0.0, rot=(0, math.pi / 2, 0))]
    for k in range(6):
        a = TAU * k / 6
        d = Vector((0, math.cos(a), math.sin(a)))
        parts.append(beam(name + ' spoke', Vector(c) + d * .06, Vector(c) + d * (R - .02), .035, .03, wood,
                          bevel=0.0))
    return parts


def build_cart():
    """Daihachi-guruma handcart: a plank bed on two big spoked wheels with long pull handles."""
    reset()
    wood = M('Wood', color='#a86e3c')
    dark = M('Dark wood', color='#5a3726')
    iron = M('Iron')
    R = .5
    parts = []
    for k in range(5):
        parts.append(box('Bed plank', (1.0, .3, .04), (0, -.6 + k * .3, R + .1), wood, bevel=.008, segments=1))
    for x in (-.52, .52):
        parts.append(box('Rail', (.07, 2.9, .08), (x, -.3, R + .04), dark, bevel=.01, segments=1))
    parts.append(box('Cross', (1.15, .07, .06), (0, -1.75, R + .04), dark, bevel=.01, segments=1))
    parts.append(box('Side', (.04, 1.5, .14), (-.5, 0, R + .19), dark, bevel=.008, segments=1))
    parts.append(box('Side', (.04, 1.5, .14), (.5, 0, R + .19), dark, bevel=.008, segments=1))
    parts.append(rod('Axle', (-.66, 0, R), (.66, 0, R), .03, iron, verts=6))
    for x in (-.64, .64):
        parts += cart_wheel('Wheel', (x, 0, R), R, wood, iron)
    parts.append(box('Rest', (.06, .06, .5), (0, -1.6, .25), dark, bevel=.008, segments=1))
    print('cart', tri_count(parts))

    def tints():
        grain([p for p in parts if p.data.materials[0] == wood], axis='y', freq=20, amp=.2, seed=3)
    return finish_prop('cart', parts, 'Cart', dist=.5, tints=tints)


def build_haybale():
    """Rectangular straw bale with twine bands and loose straw poking out, straw fibres painted."""
    reset()
    straw = M('Straw', color='#e8c05a')
    twine = M('Rope', color='#b0343a')
    b = box('Bale', (1.0, .55, .5), (0, 0, .25), straw, bevel=.07, segments=2)
    mod = b.modifiers.new('Sub', 'SUBSURF')
    mod.subdivision_type = 'SIMPLE'
    mod.levels = 1
    apply_mods(b)
    displace(b, strength=.02, scale=7.0, seed=3)
    parts = [b]
    for x in (-.25, .25):
        path = [Vector((x, -.282, .02)), Vector((x, -.284, .44)), Vector((x, -.262, .492)), Vector((x, -.2, .506)),
                Vector((x, .2, .506)), Vector((x, .262, .492)), Vector((x, .284, .44)), Vector((x, .282, .02))]
        parts.append(tube('Twine', path, .012, twine, verts=4, caps=False))
    rng = random.Random(4)
    for i in range(8):
        a = rng.uniform(0, TAU)
        root = Vector((rng.uniform(-.45, .45), rng.choice((-.27, .27)), rng.uniform(.1, .45)))
        d = Vector((rng.uniform(-.5, .5), root.y * 2, rng.uniform(-.3, .6)))
        parts.append(blade('Straw', root, d, rng.uniform(.12, .2), .02, straw, bend=.2, segs=2, fold=0))
    print('haybale', tri_count(parts))

    def tints():
        def fib(p, n, f):
            v = noise.noise(Vector((p.x * 3, p.y * 40, p.z * 40)))
            return (.85 + .15 * v) * (.8 + .2 * smoothstep(-.3, .9, n.z))
        tint([b], fib)
    return finish_prop('haybale', parts, 'Haybale', dist=.3, tints=tints)


def build_scarecrow():
    """Kakashi: a straw-hatted scarecrow on a pole cross, cloth-sack head with a drawn face, a
    patched indigo coat with straw cuffs and a brass bell on the right arm (node `Bell`, pivot at
    the bell's hanging point, swings about X)."""
    reset()
    wood = M('Dark wood', color='#6a4128')
    straw = M('Straw', color='#e3bb58')
    sack = M('Burlap', color='#e4cfa4')
    coat = M('Fabric indigo', color='#2f5a9e')
    patch = M('Fabric red', color='#d8423a')
    ink = mat('Ink', '#1d2430', rough=.8)
    brass = M('Brass')
    parts = [cyl('Pole', .04, 1.9, (0, 0, .9), wood, verts=6),
             rod('Arm pole', (-.72, 0, 1.3), (.72, 0, 1.3), .03, wood, verts=6)]
    head = sphere('Head', (.17, .15, .18), (0, 0, 1.66), sack, seg=10, rings=7)
    parts.append(head)
    parts.append(lathe('Hat', [(0, 1.98), (.1, 1.93), (.38, 1.74), (.39, 1.72), (0, 1.8)], straw, seg=12,
                       smooth_angle=40))
    # drawn face: two eyes, brows and a smile
    for s in (-1, 1):
        parts.append(disc('Eye', (s * .06, -.145, 1.68), (s * .2, -1, 0), .018, ink, seg=6, depth=.004))
        parts.append(box('Brow', (.05, .006, .01), (s * .06, -.147, 1.73), ink, bevel=0.0))
    parts.append(tube('Mouth', [Vector((-.05, -.143, 1.61)), Vector((0, -.152, 1.595)), Vector((.05, -.143, 1.61))],
                      .005, ink, verts=3, caps=False))
    # coat: a flared body with sleeves along the arm pole
    parts.append(lathe('Coat', [(.1, 1.48), (.2, 1.38), (.22, 1.1), (.28, .8), (0, .78)], coat, seg=10,
                       smooth_angle=40))
    for s in (-1, 1):
        parts.append(rod('Sleeve', (s * .12, 0, 1.35), (s * .58, 0, 1.3), .075, coat, verts=7, r2=.065))
        for k in range(3):
            parts.append(blade('Cuff straw', (s * .6, 0, 1.3), (s, (k - 1) * .5, -.2 - k * .2), .14, .03,
                               straw, bend=.2, segs=2, fold=0))
    parts.append(box('Patch', (.1, .01, .09), (.08, -.235, 1.0), patch, bevel=0.0))
    for k in range(5):
        a = TAU * k / 5
        parts.append(blade('Hem straw', (math.cos(a) * .2, math.sin(a) * .2, .82), (math.cos(a) * .4, math.sin(a) * .4, -1),
                           .16, .035, straw, bend=.1, segs=2, fold=0))
    # the bell on a cord from the right arm
    hang = Vector((.45, 0, 1.27))
    bell_parts = [rod('Bell cord', hang, hang - Vector((0, 0, .12)), .006, M('Rope'), verts=4),
                  lathe('Bell', [(0, -.12), (.02, -.125), (.045, -.16), (.06, -.22), (.07, -.24), (0, -.235)],
                        brass, seg=10, loc=hang, smooth_angle=40),
                  sphere('Clapper', .016, hang - Vector((0, 0, .245)), brass, seg=6, rings=4)]
    print('scarecrow', tri_count(parts + bell_parts))
    bake_ao(parts + bell_parts, rays=48, distance=.35, strength=.62, ground=0.0, min_value=.3)
    up_light([p for p in bell_parts if p.data.materials[0] == brass], .75)
    grain([p for p in parts if p.data.materials[0] == wood], axis='z', freq=20, amp=.2)
    bell = pivot_mesh('Bell', bell_parts, hang)
    return finish('scarecrow', parts, 'Scarecrow', keep=[bell])


def build_sheep_pen():
    """Round sheep pen, 10 m across: bevelled posts with two rails, a 2 m opening on -Y closed
    by a braced gate (node `Gate`, hinge pivot on the -X side, swings about Z), and a trough."""
    reset()
    wood = M('Wood', color='#9a6438')
    post_m = M('Dark wood', color='#5f3a27')
    water = mat('Water', '#2b6a86', rough=.05)
    R = 5.0
    gap = 2.0
    half = math.asin(gap / 2 / R)
    posts = 18
    start = -math.pi / 2 + half
    span = TAU - 2 * half
    parts = []
    pts = []
    for i in range(posts):
        a = start + span * i / (posts - 1)
        p = Vector((math.cos(a) * R, math.sin(a) * R, 0))
        pts.append(p)
        b = box('Post', (.13, .13, 1.2), p + Vector((0, 0, .55)), post_m, bevel=.015, segments=1)
        b.rotation_euler = (0, 0, a)
        parts.append(b)
    for a_, b_ in zip(pts, pts[1:]):
        for z in (.45, .9):
            parts.append(beam('Rail', a_ + Vector((0, 0, z)), b_ + Vector((0, 0, z)), .05, .1, wood, bevel=0.0))
    # gate: hinge at the -X side of the opening, closed across it
    h0 = pts[-1]  # end of the fence on the -X side
    h1 = pts[0]
    hinge = Vector((h0.x, h0.y, 0))
    L = (h1 - h0).length - .12
    d = (h1 - h0).normalized()
    g = []
    for z in (.3, .6, .9):
        g.append(beam('Gate rail', hinge + d * .08 + Vector((0, 0, z)), hinge + d * L + Vector((0, 0, z)), .045, .09,
                      wood, bevel=.008))
    for t in (.08, L):
        g.append(beam('Gate stile', hinge + d * t + Vector((0, 0, .18)), hinge + d * t + Vector((0, 0, 1.02)),
                      .07, .07, wood, bevel=.008))
    g.append(beam('Gate brace', hinge + d * .1 + Vector((0, 0, .3)), hinge + d * (L - .03) + Vector((0, 0, .9)),
                  .04, .08, wood, bevel=.006))
    # trough inside the pen
    parts.append(box('Trough', (1.4, .45, .35), (1.6, 1.4, .18), wood, bevel=.03, segments=1))
    parts.append(box('Trough water', (1.25, .32, .02), (1.6, 1.4, .33), water, bevel=0.0))
    print('sheep-pen', tri_count(parts + g))
    bake_ao(parts + g, rays=32, distance=.6, strength=.55, ground=0.0, min_value=.35)
    grain([p for p in parts + g if p.data.materials[0] == wood], axis='x', freq=10, amp=.2)
    gate = pivot_mesh('Gate', g, hinge)
    return finish('sheep-pen', parts, 'Sheep pen', keep=[gate])


def cloth_panel(name, w, h, material, top, sway=.03, seed=0, nx=4, ny=3):
    """A hanging cloth (shirt, towel): grid hanging from `top` centre, rippled."""
    def f(u, v):
        x = u * w / 2
        z = -(v + 1) / 2 * h
        y = sway * math.sin(u * 3 + seed) * ((v + 1) / 2) + .01 * math.sin(v * 4 + seed)
        return (top[0] + x, top[1] + y, top[2] + z)
    return grid_sheet(name, nx, ny, w, h, f, material)


def build_laundry_line():
    """A washing line between two bamboo T-poles: a yukata, a red towel and a shirt with pegs."""
    reset()
    bamboo = M('Bamboo', color='#bdb04a')
    line_m = M('Rope', color='#e8dcc0')
    yukata = M('Fabric indigo', color='#2d5aa0', double=True)
    towel = M('Fabric red', color='#e0463a', double=True)
    shirt = M('Fabric cream', color='#f4efe2', double=True)
    peg = M('Wood', color='#c8925a')
    parts = []
    for x in (-1.3, 1.3):
        parts.append(cyl('Pole', .035, 1.9, (x, 0, .9), bamboo, verts=6))
        parts.append(rod('T bar', (x, -.25, 1.8), (x, .25, 1.8), .025, bamboo, verts=5))
    line = [Vector((-1.3, 0, 1.78)), Vector((0, 0, 1.68)), Vector((1.3, 0, 1.78))]
    parts.append(tube('Line', spline(line, 7), .006, line_m, verts=3, caps=False))
    def line_z(x):
        return 1.68 + .1 * (x / 1.3) ** 2
    # yukata: a T-shape (body + sleeves)
    parts.append(cloth_panel('Yukata', .5, .9, yukata, (-.62, 0, line_z(-.62)), seed=1))
    parts.append(cloth_panel('Yukata', .95, .3, yukata, (-.62, .005, line_z(-.62) - .01), seed=2, nx=5, ny=2))
    parts.append(cloth_panel('Towel', .42, .55, towel, (.1, 0, line_z(.1)), seed=3))
    parts.append(cloth_panel('Shirt', .45, .5, shirt, (.75, 0, line_z(.75)), seed=4))
    for x in (-.85, -.4, -.1, .3, .55, .95):
        parts.append(box('Peg', (.02, .03, .07), (x, 0, line_z(x) + .005), peg, bevel=0.0))
    print('laundry-line', tri_count(parts))

    def tints():
        tint([p for p in parts if p.data.materials[0] == yukata],
             lambda p, n, f: 1.0 if (int(p.x * 18) + int(p.z * 18)) % 5 else (1.6, 1.5, 1.2))
        tint([p for p in parts if p.data.materials[0] == towel],
             lambda p, n, f: 1.0 if int((p.z + 5) * 20) % 4 else (1.2, 1.4, 1.4))
    return finish_prop('laundry-line', parts, 'Laundry line', dist=.4, tints=tints)


def build_flowerpot():
    """Glazed terracotta pot of scarlet geraniums for Takamori's window boxes and doorsteps."""
    reset()
    clay = mat('Terracotta', '#c8643a', rough=.6)
    soil = M('Soil')
    leaves = M('Leaves', color='#4f9a36')
    bloom = mat('Geranium', '#ee2f48', rough=.5, double=True)
    parts = [lathe('Pot', [(0, 0), (.13, 0), (.16, .24), (.19, .26), (.19, .31), (.165, .31), (.15, .27), (0, .25)],
                   clay, seg=14, smooth_angle=40),
             cyl('Soil', .15, .01, (0, 0, .27), soil, verts=14)]
    rng = random.Random(6)
    lobes = [lobe('Leaves', (0, 0, .4), (.22, .2, .14), leaves, seed=1, subdiv=3, amp=.1, flat=.3)]
    for i in range(5):
        a = TAU * i / 5 + rng.uniform(-.2, .2)
        lobes.append(lobe('Leaves', (math.cos(a) * .15, math.sin(a) * .15, .37), (.12, .11, .09), leaves,
                          seed=rng.randint(0, 99), subdiv=3, amp=.1, flat=.3))
    mound = sculpt(lobes, 'Leaves', leaves, voxel=.02, target=320, cells=.08, cell_amp=.02, crease=.5, seed=2,
                   smooth=3)
    parts.append(mound)
    for i in range(5):
        a = TAU * i / 5 + .3
        c = Vector((math.cos(a) * .14, math.sin(a) * .14, .52 + rng.uniform(0, .05)))
        if i == 4:
            c = Vector((0, 0, .6))
        parts.append(rod('Stalk', c - Vector((0, 0, .12)), c, .006, leaves, verts=3))
        parts.append(sphere('Bloom core', .045, c, bloom, seg=6, rings=4))
        for k in range(6):
            aa = TAU * k / 6 + i
            nrm = Vector((math.cos(aa), math.sin(aa), .7)).normalized() if k else Vector((0, 0, 1))
            parts.append(petal_disc('Floret', c + nrm * .042, nrm, .045, bloom, petals=5, inner=.74, cup=.12,
                                    spin=aa))
    print('flowerpot', tri_count(parts))

    def tints():
        zs = [(mound.matrix_world @ Vector(c)).z for c in mound.bound_box]
        foliage_tint([mound], min(zs), max(zs), Vector((0, 0, .4)), dark=.55, hue=0, core=.1, core_r=.3)
        cell_tint(mound, crease_dark=.3)
        tint(parts[0], lambda p, n, f: (1.0, .92 + .08 * smoothstep(.2, .31, p.z), .88 + .12 * smoothstep(.2, .31, p.z)))
    return finish_prop('flowerpot', parts, 'Flowerpot', dist=.2, tints=tints)


def build_noren_lantern():
    """Hanging red chochin: ribbed paper body (`Lantern glow`) between black lacquer caps, a white
    star crest, a hanging cord from the hook and a tassel. Origin at the hanging point."""
    reset()
    paper = mat('Lantern glow', '#d8302a', rough=.45, emit=.25, emit_color='#ff5a2a')
    black = mat('Lacquer', '#262c38', rough=.3)
    crest = M('Cream paint', color='#f7efe0')
    cord = M('Rope', color='#c9302c')
    H, R = .55, .2
    top = -.14
    prof = [(R * .55, top)]
    ribs = 11
    for k in range(ribs + 1):
        t = k / ribs
        r = R * (.55 + .45 * math.sin(math.pi * (.08 + .84 * t)))
        prof.append((r * (1.0 if k % 2 == 0 else .965), top - t * H))
    prof.append((R * .55, top - H))
    parts = [lathe('Chochin', [(0, top + .001)] + prof + [(0, top - H - .001)], paper, seg=14, smooth_angle=50)]
    parts.append(cyl('Cap', R * .6, .05, (0, 0, top + .015), black, verts=14, bevel=.01))
    parts.append(cyl('Cap', R * .6, .05, (0, 0, top - H - .015), black, verts=14, bevel=.01))
    parts.append(ring_rod('Hook', (0, 0, -.03), .03, .006, black, axis=(1, 0, 0), maj=10, mn=3))
    parts.append(rod('Cord', (0, 0, -.06), (0, 0, top + .04), .006, cord, verts=4))
    parts.append(extrude('Crest', star_outline(.07, .03), .004, crest, bevel=0.0, loc=(0, -R - .002, top - H / 2)))
    parts.append(ring_rod('Crest ring', (0, -R + .002, top - H / 2), .085, .007, crest, axis=(0, 1, 0), maj=14, mn=3))
    parts.append(lathe('Tassel', [(0, 0), (.02, -.01), (.03, -.08), (0, -.085)], cord, seg=8,
                       loc=(0, 0, top - H - .04)))
    print('noren-lantern', tri_count(parts))

    def tints():  # bamboo ribs read as darker rings in the paper
        rows = sorted({round(z, 4) for _, z in prof})
        ribz = [z for i, z in enumerate(rows) if i % 2 == 1]
        tint(parts[0], lambda p, n, f: 1 - .22 * max(math.exp(-((p.z - z) / .008) ** 2) for z in ribz))
    return finish_prop('noren-lantern', parts, 'Noren lantern', ground=None, dist=.2, strength=.5, tints=tints)


def build_fireworks_rack():
    """Festival fireworks rack: a timber A-frame holding six paper-wrapped mortar tubes with
    fuses, and a crate of round shells."""
    reset()
    wood = M('Wood', color='#9a6438')
    dark = M('Dark wood')
    tube_m = M('Fabric red', color='#d8342c', rough=.55)
    band = M('Mustard paint', color='#f0b43a')
    inside = mat('Tube inside', '#1d2430', rough=.9)
    fuse = mat('Fuse', '#3a2a1e', rough=.8)
    shell = M('Cream paint', color='#efe3c6')
    parts = []
    for x in (-.7, .7):
        parts.append(beam('Leg', (x, -.4, 0), (x, 0, 1.0), .07, .07, dark, bevel=.01))
        parts.append(beam('Leg', (x, .4, 0), (x, 0, 1.0), .07, .07, dark, bevel=.01))
    parts.append(beam('Top', (-.8, 0, .98), (.8, 0, .98), .08, .08, dark, bevel=.01))
    parts.append(beam('Shelf', (-.8, -.2, .45), (.8, -.2, .45), .5, .04, wood, bevel=.008))
    for i in range(6):
        x = -.55 + i * .22
        a = Vector((x, -.2, .47))
        tilt = Vector(((i - 2.5) * .06, -.25, 1)).normalized()
        b = a + tilt * .5
        parts.append(rod('Mortar', a, b, .055, tube_m, verts=8))
        parts.append(ring_rod('Band', a + tilt * .38, .057, .012, band, axis=tilt, maj=8, mn=3))
        parts.append(disc('Mouth', b + tilt * .001, tilt, .042, inside, seg=8, depth=.004))
        parts.append(tube('Fuse', [a + tilt * .08 + Vector((0, -.055, 0)), a + Vector((0, -.12, -.02)),
                                   a + Vector((0, -.2, -.06))], .006, fuse, verts=3, caps=False))
    parts.append(box('Shell crate', (.5, .36, .2), (.45, .55, .1), wood, bevel=.012, segments=1))
    for k in range(4):
        parts.append(sphere('Shell', .075, (.33 + (k % 2) * .24, .49 + (k // 2) * .13, .25), shell, seg=6, rings=4))
    print('fireworks-rack', tri_count(parts))

    def tints():
        grain([p for p in parts if p.data.materials[0] in (wood, dark)], axis='x', freq=18, amp=.2)
    return finish_prop('fireworks-rack', parts, 'Fireworks rack', dist=.4, tints=tints)


def build_festival_stall():
    """Yatai food stall for the star-fall festival: a timber frame and counter, a gabled roof,
    a red-and-white striped noren, three red chochin (`Lantern glow`) and a hot plate of
    takoyaki."""
    reset()
    wood = M('Wood', color='#a86e3c')
    dark = M('Dark wood', color='#5a3726')
    roof_m = mat('Roof', '#a8432c', rough=.55)
    red = M('Fabric red', color='#d8342c', double=True)
    white = M('Fabric cream', color='#f7f0e2', double=True)
    lantern = mat('Lantern glow', '#e8412c', rough=.45, emit=.35, emit_color='#ff6a2a')
    iron = M('Iron')
    food = mat('Takoyaki', '#c9823a', rough=.4)
    W, D = 2.0, 1.0
    parts = []
    for x in (-W / 2 + .06, W / 2 - .06):
        for y in (-D / 2 + .06, D / 2 - .06):
            parts.append(box('Post', (.08, .08, 2.25), (x, y, 1.12), dark, bevel=.01, segments=1))
    parts.append(box('Counter', (W + .1, D * .55, .07), (0, -D / 2 + .22, .95), wood, bevel=.012, segments=1))
    parts.append(box('Counter front', (W, .04, .9), (0, -D / 2 - .03, .47), wood, bevel=.008, segments=1))
    for s in (-1, 1):
        r = box('Roof', (W + .45, D * .72, .05), (0, s * D * .27, 2.42), roof_m, bevel=.015, segments=1)
        r.rotation_euler = (s * math.radians(-25), 0, 0)
        parts.append(r)
    parts.append(box('Ridge', (W + .5, .09, .08), (0, 0, 2.58), dark, bevel=.01, segments=1))
    # striped noren across the front beam
    n = 7
    for i in range(n):
        x = -W / 2 + W * (i + .5) / n
        m = red if i % 2 == 0 else white
        parts.append(cloth_panel('Noren', W / n - .02, .38, m, (x, -D / 2 - .02, 2.12), sway=.01, seed=i, nx=1, ny=2))
    parts.append(box('Noren bar', (W + .1, .04, .04), (0, -D / 2 - .02, 2.13), dark, bevel=0.0))
    for x in (-.7, 0, .7):
        c = Vector((x, -D / 2 - .1, 1.78))
        parts.append(lathe('Chochin', [(0, .16), (.07, .15), (.1, .08), (.1, -.04), (.07, -.11), (0, -.12)],
                           lantern, seg=10, loc=c))
        parts.append(rod('Cord', c + Vector((0, 0, .16)), c + Vector((0, 0, .34)), .005, dark, verts=3))
    parts.append(box('Hot plate', (.6, .4, .06), (.35, -.25, 1.02), iron, bevel=.01, segments=1))
    for k in range(6):
        parts.append(sphere('Takoyaki', .045, (.2 + (k % 3) * .15, -.33 + (k // 3) * .15, 1.07), food, seg=6,
                            rings=4))
    print('festival-stall', tri_count(parts))

    def tints():
        grain([p for p in parts if p.data.materials[0] in (wood, dark)], axis='x', freq=18, amp=.2)
    return finish_prop('festival-stall', parts, 'Festival stall', dist=.5, tints=tints)


# ================================================================ registry

BUILDERS = {
    'hand-lantern': build_hand_lantern,
    'fallen-star': build_fallen_star,
    'cog': build_cog,
    'journal-page': build_journal_page,
    'hearth': build_hearth,
    'fishing-rod': build_fishing_rod,
    'peach': build_peach,
    'peach-bun': build_peach_bun,
    'plate-trout': build_plate_trout,
    'chestnut': build_chestnut,
    'mushroom-item': build_mushroom_item,
    'honeycomb': build_honeycomb,
    'bowl-chestnuts': build_bowl_chestnuts,
    'timber': build_timber,
    'iron-bolts': build_iron_bolts,
    'key': build_key,
    'hammer': build_hammer,
    'crate': build_crate,
    'barrel': build_barrel,
    'sacks': build_sacks,
    'fence-wood': build_fence_wood,
    'fence-bamboo': build_fence_bamboo,
    'wall-stone': build_wall_stone,
    'bench': build_bench,
    'well': build_well,
    'market-stall': build_market_stall,
    'street-lamp': build_street_lamp,
    'postbox': build_postbox,
    'signpost': build_signpost,
    'cart': build_cart,
    'haybale': build_haybale,
    'scarecrow': build_scarecrow,
    'sheep-pen': build_sheep_pen,
    'laundry-line': build_laundry_line,
    'flowerpot': build_flowerpot,
    'noren-lantern': build_noren_lantern,
    'fireworks-rack': build_fireworks_rack,
    'festival-stall': build_festival_stall,
}

if __name__ == '__main__':
    names, full = parse_only(list(BUILDERS))
    results = []
    for n in names:
        print('BUILD', n)
        results.append((n, BUILDERS[n]()))
    report(results)
    if full:
        save_kit('props', list(BUILDERS), spacing=1.0)
