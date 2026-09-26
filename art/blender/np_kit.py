"""Shared helpers for the nature and props generators (build_nature.py, build_props.py).

Builds on kit.py (never edits it). Adds organic modelling tools:
  * lobe() / cull_hidden(): clumpy sculpted canopies from many overlapping displaced lobes,
    with faces buried inside neighbouring lobes removed so the budget goes to the silhouette.
  * trunk(): swept trunks with root flare, bark fluting and twist.
  * plane_hull() / boulder(): faceted chamfered rocks; moss_cap() grows a moss shell on the
    up-facing facets.
  * tint(): multiplies hand-painted tonal variation into the baked AO colour (COLOR_0).
  * pivot_mesh(): joins parts into one runtime node whose origin sits on a pivot.
  * finish(): merges static parts per material under one root and exports.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *  # noqa: F401,F403
import kit


# ---------------------------------------------------------------- CLI

def parse_only(all_names):
    """`-- --only a,b` (or bare names after --) limits a build. Returns (names, full_build)."""
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = []
    i = 0
    while i < len(args):
        if args[i] == '--only' and i + 1 < len(args):
            only += [s.strip() for s in args[i + 1].split(',') if s.strip()]
            i += 2
        else:
            if not args[i].startswith('--'):
                only.append(args[i])
            i += 1
    bad = [n for n in only if n not in all_names]
    if bad:
        raise SystemExit(f'unknown model(s): {bad}; known: {all_names}')
    return (only or list(all_names)), not only


# ---------------------------------------------------------------- math

def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def V(*a):
    return Vector(a if len(a) == 3 else a[0])


def tri_count(objs):
    n = 0
    for o in objs:
        if o and o.type == 'MESH':
            n += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return n


# ---------------------------------------------------------------- colour

def tint(objs, fn):
    """Multiply the baked AO colour by fn(world_pos, world_normal, face) -> float | (r, g, b)."""
    for o in objs if isinstance(objs, (list, tuple)) else [objs]:
        if o is None or o.type != 'MESH':
            continue
        me = o.data
        mw = o.matrix_world
        nm = mw.to_3x3().inverted_safe().transposed()
        attr = me.color_attributes.get('Color')
        if attr is None:
            ensure_color([o])
            attr = me.color_attributes['Color']
        for f in me.polygons:
            for li in f.loop_indices:
                vi = me.loops[li].vertex_index
                v = me.vertices[vi]
                k = fn(mw @ v.co, (nm @ v.normal).normalized(), f)
                if not isinstance(k, (tuple, list)):
                    k = (k, k, k)
                c = attr.data[li].color
                attr.data[li].color = (min(1, c[0] * k[0]), min(1, c[1] * k[1]), min(1, c[2] * k[2]), 1)


def tone(objs, k):
    """Uniform multiplier (per-part tonal variation)."""
    kk = k if isinstance(k, (tuple, list)) else (k, k, k)
    tint(objs, lambda p, n, f: kk)


# ---------------------------------------------------------------- mesh building

def rings_mesh(name, rings, material, cap_start=False, cap_end=False, closed=True, smooth_angle=50,
               flat=False, pole_start=None, pole_end=None, outward=None):
    """Loft equal-length vertex rings into quads (see race3D build_scenery.rings_mesh)."""
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    span = n if closed else n - 1
    for a, b in zip(vr, vr[1:]):
        for j in range(span):
            k = (j + 1) % n
            bm.faces.new((a[j], b[j], b[k], a[k]))
    if pole_start is not None:
        p = bm.verts.new(pole_start)
        for j in range(span):
            bm.faces.new((p, vr[0][(j + 1) % n], vr[0][j]))
    elif cap_start and closed:
        bm.faces.new(list(reversed(vr[0])))
    if pole_end is not None:
        p = bm.verts.new(pole_end)
        for j in range(span):
            bm.faces.new((vr[-1][j], vr[-1][(j + 1) % n], p))
    elif cap_end and closed:
        bm.faces.new(vr[-1])
    bm.normal_update()
    if outward is None:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    else:
        vote = sum(f.normal.dot(outward(f.calc_center_median())) * f.calc_area() for f in bm.faces)
        if vote < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return from_bmesh(name, bm, material, smooth_angle=smooth_angle, flat=flat)


def away_from(pt):
    p = Vector(pt)
    return lambda c: c - p


def away_from_path(points):
    pts = [Vector(p) for p in points]
    return lambda c: c - min(pts, key=lambda q: (q - c).length)


def radial_from(axis_pt):
    a = Vector(axis_pt)
    return lambda c: Vector((c.x - a.x, c.y - a.y, 0)) + Vector((0, 0, 1e-3))


def weighted_normals(ob, weight=50):
    for p in ob.data.polygons:
        p.use_smooth = True
    mod = ob.modifiers.new('WN', 'WEIGHTED_NORMAL')
    mod.mode = 'FACE_AREA'
    mod.weight = weight
    mod.keep_sharp = True
    return apply_mods(ob)


def delete_faces(ob, pred):
    """Remove faces where pred(world_center, world_normal) is true (hidden/buried faces)."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    mw = ob.matrix_world
    nm = mw.to_3x3().inverted_safe().transposed()
    dead = [f for f in bm.faces if pred(mw @ f.calc_center_median(), (nm @ f.normal).normalized())]
    if dead:
        bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(me)
    bm.free()
    me.update()
    return ob


def below(z):
    return lambda c, n: c.z < z


def spline(points, count):
    """Catmull-Rom resample of control points into `count` points."""
    P = [Vector(p) for p in points]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    segs = len(P) - 3
    for i in range(count):
        t = i / (count - 1) * segs
        k = min(int(t), segs - 1)
        u = t - k
        p0, p1, p2, p3 = P[k:k + 4]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
                          (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))
    return out


def sweep(name, points, radius_fn, material, sides=8, caps=True, twist=0.0, squash=1.0, smooth_angle=70,
          pole_end=None, ridge=0.0, ridge_count=0, noise_amp=0.0, seed=0, profile=None):
    """Sweep along a polyline. radius_fn(t) -> radius; ridge adds bark fluting; noise_amp adds
    lumpy irregularity; profile(t, angle) -> extra radial factor (root buttresses, knots)."""
    fr = kit._frames(points)
    rings = []
    count = len(fr)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for i, (p, t, n, b) in enumerate(fr):
        s = i / max(count - 1, 1)
        R = radius_fn(s)
        ring = []
        for j in range(sides):
            a = TAU * j / sides + twist * s
            rr = R
            if ridge_count:
                rr *= 1 - ridge * (0.5 + 0.5 * math.cos(ridge_count * a))
            if profile is not None:
                rr *= profile(s, a)
            d = n * math.cos(a) * squash + b * math.sin(a)
            q = p + d * rr
            if noise_amp:
                rr *= 1 + noise_amp * noise.noise(q * 1.7 + off)
                q = p + d * rr
            ring.append(q)
        rings.append(ring)
    kw = {}
    if pole_end is not None:
        kw['pole_end'] = pole_end
    elif caps:
        kw['cap_end'] = True
    return rings_mesh(name, rings, material, cap_start=caps, smooth_angle=smooth_angle,
                      outward=away_from_path(points), **kw)


# ---------------------------------------------------------------- foliage

def lobe(name, c, r, material, seed=0, subdiv=2, amp=.12, freq=1.1, flat=.35, bumps=.05, bump_freq=3.2,
         rot=0.0, lean=(0, 0)):
    """Displaced icosphere 'cloud lobe': radii r, flattened underside, low-frequency lumps plus
    leaf-clump bumps. Stores its implicit shape for cull_hidden()."""
    r = r if isinstance(r, (tuple, list)) else (r, r, r)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1)
    off = Vector((seed * 7.13 + 1.3, seed * 3.71 + 2.1, seed * 5.17 + .7))
    cr, sr = math.cos(rot), math.sin(rot)
    for v in bm.verts:
        d = v.co.normalized()
        z = d.z * (1 - flat) if d.z < 0 else d.z
        k = 1 + amp * noise.noise(d * freq + off) + bumps * noise.noise(d * bump_freq + off * 1.7)
        x, y = d.x * r[0] * k, d.y * r[1] * k
        z = z * r[2] * k
        x, y = x * cr - y * sr, x * sr + y * cr
        x += lean[0] * z
        y += lean[1] * z
        v.co = Vector((x, y, z))
    ob = from_bmesh(name, bm, material, loc=c, smooth_angle=89)
    ob['lobe'] = [float(c[0]), float(c[1]), float(c[2]), float(r[0]), float(r[1]), float(r[2]),
                  float(amp + bumps), float(flat), float(rot)]
    return ob


def _inside_lobe(p, spec, margin):
    cx, cy, cz, rx, ry, rz, a, flat, rot = spec
    d = p - Vector((cx, cy, cz))
    cr, sr = math.cos(-rot), math.sin(-rot)
    x, y = d.x * cr - d.y * sr, d.x * sr + d.y * cr
    zz = rz * (1 - flat) if d.z < 0 else rz
    s = 1 - a - margin
    return (x / rx) ** 2 + (y / ry) ** 2 + (d.z / zz) ** 2 < s * s


def cull_hidden(lobes, margin=.05, extra=()):
    """Delete lobe faces whose vertices are all buried inside another lobe (or an extra
    predicate(p) -> bool), so overlapping clumps cost only their visible shells."""
    bpy.context.view_layer.update()
    specs = [list(o['lobe']) for o in lobes]
    before = tri_count(lobes)
    for i, o in enumerate(lobes):
        me = o.data
        bm = bmesh.new()
        bm.from_mesh(me)
        mw = o.matrix_world
        others = [s for j, s in enumerate(specs) if j != i]

        def hidden(p):
            return any(_inside_lobe(p, s, margin) for s in others) or any(e(p) for e in extra)
        buried = {v.index: hidden(mw @ v.co) for v in bm.verts}
        dead = [f for f in bm.faces if all(buried[v.index] for v in f.verts)]
        if dead:
            bmesh.ops.delete(bm, geom=dead, context='FACES')
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
        bm.to_mesh(me)
        bm.free()
        me.update()
    print(f'  cull_hidden: {before} -> {tri_count(lobes)} tris')
    return lobes


def _cells(p, scale, off):
    """Voronoi leaf-cluster field: returns (edge, cell_id, f1) where edge = F2 - F1 (0 on a crease
    between two clusters) and f1 the distance to the cluster centre, in cell units."""
    d, pts = noise.voronoi(p / scale + off, distance_metric='DISTANCE')
    c = pts[0]
    cid = (math.sin(c.x * 12.9898 + c.y * 78.233 + c.z * 37.719) * 43758.5453) % 1.0
    return d[1] - d[0], cid, d[0]


def sculpt(objs, name, material, voxel=.1, target=2400, cells=.6, cell_amp=.14, crease=.45, seed=0,
           smooth=4, lumps=0.0, lump_scale=1.5, normal_smooth=6):
    """Union overlapping lobes into one sculpted shell: voxel remesh, relax, scallop into leaf
    clusters (Voronoi domes with creases between them), then decimate to the triangle target.
    Stores the cell parameters on the object for cell_tint()."""
    bpy.context.view_layer.update()
    ob = join(objs, name)
    apply_transform(ob)
    mod = ob.modifiers.new('Remesh', 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = voxel
    mod.adaptivity = 0.0
    try:
        mod.use_smooth_shade = True
    except Exception:
        pass
    apply_mods(ob)
    if smooth:
        mod = ob.modifiers.new('Smooth', 'SMOOTH')
        mod.iterations = smooth
        mod.factor = .6
        apply_mods(ob)
    me = ob.data
    off = Vector((seed * 1.37 + .31, seed * 2.11 + .17, seed * .73 + .59))
    normals = [v.normal.copy() for v in me.vertices]
    for v, n in zip(me.vertices, normals):
        p = v.co.copy()
        if cell_amp:
            e, _, f1 = _cells(p, cells, off)
            # rounded puff per cluster: a spherical cap on F1, pinched into a crease where F2~F1
            dome = math.sqrt(max(0.0, 1 - min(1.0, f1 / .9) ** 2))
            pinch = smoothstep(0, crease, e)
            v.co += n * cell_amp * (dome * (.55 + .45 * pinch) - .5)
        if lumps:
            v.co += n * lumps * noise.noise(p / lump_scale + off * 3.1)
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    t = tri_count([ob])
    hi = None
    if t > target:
        # keep the dense sculpt as the normal source so the decimated shell shades smoothly
        hi = link(bpy.data.objects.new(name + ' hi', me.copy()))
        if normal_smooth:
            m2 = hi.modifiers.new('Smooth', 'SMOOTH')
            m2.iterations = normal_smooth
            m2.factor = .5
            apply_mods(hi)
        mod = ob.modifiers.new('Decimate', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = target / t
        mod.use_collapse_triangulate = True
        apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    if hi is not None:
        transfer_normals(ob, hi)
        bpy.data.objects.remove(hi, do_unlink=True)
    ob['cells'] = [cells, float(seed), crease]
    print(f'  sculpt {name}: {t} -> {tri_count([ob])} tris')
    return ob


def transfer_normals(ob, src):
    """Bake smooth custom split normals from a dense source mesh onto a low-poly shell."""
    mod = ob.modifiers.new('Normals', 'DATA_TRANSFER')
    mod.object = src
    mod.use_loop_data = True
    mod.data_types_loops = {'CUSTOM_NORMAL'}
    mod.loop_mapping = 'POLYINTERP_NEAREST'
    mod.mix_mode = 'REPLACE'
    mod.mix_factor = 1.0
    apply_mods(ob)
    return ob


def cell_tint(ob, crease_dark=.28, spread=.14, hue=.05, crease_rgb=(1, 1, 1)):
    """Darken the creases between leaf clusters (optionally toward a hue, crease_rgb) and vary each
    cluster's tone and hue slightly."""
    cells, seed, crease = ob['cells']
    off = Vector((seed * 1.37 + .31, seed * 2.11 + .17, seed * .73 + .59))
    def f(p, n, face):
        e, cid, _ = _cells(p, cells, off)
        w = 1 - smoothstep(0, crease * .8, e)
        k = 1 - crease_dark * w
        k *= 1 - spread * cid
        h = (cid - .5) * 2 * hue
        return (k * (1 + h) * lerp(1, crease_rgb[0], w), k * lerp(1, crease_rgb[1], w),
                k * (1 - h) * lerp(1, crease_rgb[2], w))
    tint(ob, f)


def foliage_tint(objs, lo_z, hi_z, centre, seed=1, dark=.5, hue=.06, warm=.12, core=.25, core_r=2.0, cool=.12):
    """Hand-painted canopy shading multiplied into AO: cool dark underside and heart, warm sunlit
    crown, per-lobe tone and slight hue shifts so the clumps separate."""
    rng = random.Random(seed)
    c = Vector(centre)
    for o in objs:
        k0 = rng.uniform(.88, 1.0)
        h = rng.uniform(-1, 1) * hue
        def f(p, n, face, k0=k0, h=h):
            t = smoothstep(lo_z, hi_z, p.z)
            k = (dark + (1 - dark) * t) * k0
            up = max(0.0, n.z)
            k *= .84 + .16 * up
            rr = (Vector((p.x, p.y, (p.z - c.z) * 1.2)) - Vector((c.x, c.y, 0))).length
            k *= 1 - core * (1 - smoothstep(core_r * .35, core_r, rr))
            sun = up * t
            shade_ = 1 - t
            return (k * (1 + h) * (1 - cool * shade_), k,
                    k * (1 - h) * (1 - warm * sun) * (1 + cool * .6 * shade_))
        tint(o, f)


# ---------------------------------------------------------------- rocks

def plane_hull(planes, box=20):
    """Convex polyhedron = intersection of half-spaces [(point, outward normal), ...]."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=box)
    for co, no in planes:
        no = Vector(no).normalized()
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no,
                               clear_outer=True)
        edges = [e for e in bm.edges if len(e.link_faces) < 2]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def boulder_planes(rng, rx, ry, rz, bottom, sides=7, shoulders=6, top_tilt=.12, jitter=.08,
                   side_tilt=(.02, .3), shoulder_tilt=(.55, 1.0), top=.97):
    def support(n):
        return math.sqrt((rx * n.x) ** 2 + (ry * n.y) ** 2 + (rz * n.z) ** 2)
    planes = [((0, 0, bottom), (0, 0, -1))]
    off = rng.uniform(0, TAU)
    for i in range(sides):
        a = off + TAU * (i + rng.uniform(-.28, .28)) / sides
        t = rng.uniform(side_tilt[0], side_tilt[1])
        n = Vector((math.cos(a) * math.cos(t), math.sin(a) * math.cos(t), math.sin(t)))
        planes.append((n * support(n) * rng.uniform(1 - jitter, 1), n))
    for i in range(shoulders):
        a = off + TAU * (i + .5 + rng.uniform(-.2, .2)) / shoulders
        t = rng.uniform(*shoulder_tilt)
        n = Vector((math.cos(a) * math.cos(t), math.sin(a) * math.cos(t), math.sin(t)))
        planes.append((n * support(n) * rng.uniform(.84, .97), n))
    a = rng.uniform(0, TAU)
    n = Vector((math.cos(a) * top_tilt, math.sin(a) * top_tilt, 1)).normalized()
    planes.append((n * support(n) * top, n))
    return planes


def fit_bm(bm, lo, hi):
    cs = [v.co for v in bm.verts]
    blo = [min(c[i] for c in cs) for i in range(3)]
    bhi = [max(c[i] for c in cs) for i in range(3)]
    for v in bm.verts:
        v.co = Vector([lo[i] + (v.co[i] - blo[i]) / (bhi[i] - blo[i]) * (hi[i] - lo[i]) for i in range(3)])
    return bm


def soft_facets(name, bm, material, chamfer, segments=1):
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=chamfer, offset_type='OFFSET', segments=segments,
                    profile=.5, affect='EDGES', clamp_overlap=True)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    ob = from_bmesh(name, bm, material, smooth_angle=180)
    return weighted_normals(ob)


def boulder(name, material, seed, radii, lo, hi, chamfer=.06, sides=7, shoulders=5, top_tilt=.15,
            lean=(0, 0), spin=0.0, seg=1, **kw):
    rng = random.Random(seed)
    bm = plane_hull(boulder_planes(rng, *radii, bottom=-radii[2] * .9, sides=sides, shoulders=shoulders,
                                   top_tilt=top_tilt, **kw))
    if spin:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(spin, 3, 'Z'))
    if lean != (0, 0):
        for v in bm.verts:
            h = max(0.0, v.co.z + radii[2] * .3)
            v.co.x += lean[0] * h
            v.co.y += lean[1] * h
    fit_bm(bm, lo, hi)
    return soft_facets(name, bm, material, chamfer, segments=seg)


def facet_tone(rng, spread=.1):
    cache = {}
    def f(face):
        key = (face.id_data.name,) + tuple(round(c * 4) for c in face.normal)
        if key not in cache:
            cache[key] = rng.uniform(1 - spread, 1)
        return cache[key]
    return f


def moss_cap(name, rock, material, seed=0, up=.5, thick=.035, lip=.05, edge_noise=.25, below_z=None,
             noise_scale=1.3):
    """Moss shell over the up-facing facets of `rock`: those faces copied, pushed out along the
    normal and given a rounded rolled lip so the patch reads as a soft cushion."""
    me = rock.data
    mw = rock.matrix_world
    nm = mw.to_3x3().inverted_safe().transposed()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(mw)
    bm.normal_update()
    off = Vector((seed * 2.3, seed * 1.1, seed * .7))
    keep = set()
    for f in bm.faces:
        c = f.calc_center_median()
        k = f.normal.z + edge_noise * noise.noise(c * noise_scale + off)
        if k > up and (below_z is None or c.z < below_z):
            keep.add(f)
    dead = [f for f in bm.faces if f not in keep]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    if not bm.faces:
        bm.free()
        return None
    bm.normal_update()
    # push the patch out along its normals; the boundary rolls down toward the rock
    boundary = {v for e in bm.edges if e.is_boundary for v in e.verts}
    normals = {}
    for v in bm.verts:
        n = v.normal.copy()
        v.co += n * (thick * (.55 if v in boundary else 1.0))
        normals[tuple(round(c, 5) for c in v.co)] = n
    # extrude the boundary back into the rock surface to make a soft tucked lip
    bedges = [e for e in bm.edges if e.is_boundary]
    if bedges:
        ret = bmesh.ops.extrude_edge_only(bm, edges=bedges)
        newv = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]
        for v in newv:
            n = normals.get(tuple(round(c, 5) for c in v.co), Vector((0, 0, 1)))
            v.co += -n * thick * 1.6 + Vector((0, 0, -lip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    centre = sum((mw @ Vector(c) for c in rock.bound_box), Vector()) / 8
    vote = sum(f.normal.dot(f.calc_center_median() - centre) * f.calc_area() for f in bm.faces)
    if vote < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    ob = from_bmesh(name, bm, material, smooth_angle=70)
    return ob


def moss_blanket(name, rock, material, seed=0, up=.45, thick=.05, target=220, noise_scale=1.6, edge_noise=.35,
                 levels=3, lip=.03, min_z=None, voxel=.025, cells=.14, cell_amp=.025):
    """Organic moss cushion: the rock is densely subdivided (for this shell only), faces facing up
    (plus noise, so the outline wanders) are kept, puffed out thicker toward the middle of the
    patch, tucked into the rock at the rim, then decimated to `target` triangles."""
    bpy.context.view_layer.update()
    me = rock.data.copy()
    tmp = link(bpy.data.objects.new(name, me))
    tmp.matrix_world = rock.matrix_world.copy()
    apply_transform(tmp)
    mod = tmp.modifiers.new('Sub', 'SUBSURF')
    mod.subdivision_type = 'SIMPLE'
    mod.levels = levels
    apply_mods(tmp)
    bm = bmesh.new()
    bm.from_mesh(tmp.data)
    bm.normal_update()
    off = Vector((seed * 2.3 + .4, seed * 1.1 + .2, seed * .7 + .9))
    def score(f):
        c = f.calc_center_median()
        return f.normal.z + edge_noise * noise.noise(c * noise_scale + off) - up
    sc = {f: score(f) for f in bm.faces}
    dead = [f for f in bm.faces if sc[f] <= 0 or (min_z is not None and f.calc_center_median().z < min_z)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    if len(bm.faces) < 4:
        bm.free()
        bpy.data.objects.remove(tmp, do_unlink=True)
        return None
    # remove tiny islands (speckles)
    bm.normal_update()
    boundary = {v for e in bm.edges if e.is_boundary for v in e.verts}
    # distance-to-rim proxy: grow rings inward from the boundary
    ring = {v: 0 for v in boundary}
    frontier = list(boundary)
    d = 0
    while frontier:
        d += 1
        nxt = []
        for v in frontier:
            for e in v.link_edges:
                w = e.other_vert(v)
                if w not in ring:
                    ring[w] = d
                    nxt.append(w)
        frontier = nxt
    normals = {v: v.normal.copy() for v in bm.verts}
    for v in bm.verts:
        k = smoothstep(0, 3.5, ring.get(v, 4))
        v.co += normals[v] * thick * (.25 + .75 * k) * (1 + .35 * noise.noise(v.co * 3.1 + off))
    bedges = [e for e in bm.edges if e.is_boundary]
    if bedges:
        keymap = {tuple(round(c, 5) for c in v.co): normals[v] for v in boundary}
        ret = bmesh.ops.extrude_edge_only(bm, edges=bedges)
        for v in [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]:
            n = keymap.get(tuple(round(c, 5) for c in v.co), Vector((0, 0, 1)))
            v.co += -n * (thick * .45 + lip)
    bm.normal_update()
    centre = sum((Vector(c) for c in rock.bound_box), Vector()) / 8
    centre = rock.matrix_world @ centre
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    vote = sum(f.normal.dot(f.calc_center_median() - centre) * f.calc_area() for f in bm.faces)
    if vote < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(tmp.data)
    bm.free()
    tmp.data.update()
    tmp.data.materials.clear()
    tmp.data.materials.append(material)
    # give the sheet body, then remesh it into a soft cushion with puffy tufts
    mod = tmp.modifiers.new('Solid', 'SOLIDIFY')
    mod.thickness = thick * 1.6
    mod.offset = -1
    apply_mods(tmp)
    return sculpt([tmp], name, material, voxel=voxel, target=target, cells=cells, cell_amp=cell_amp, crease=.5,
                  seed=seed, smooth=3, normal_smooth=4)


def moss_cushions(name, rock, material, seed=0, count=4, size=.35, target=200, up=.55, spacing=.9,
                  flat=.24, voxel=.03, cells=.13, cell_amp=.025, reach=1.0):
    """Stylised moss: soft flattened cushions settled on the rock's up-facing shoulders, merged
    into one puffy patch (remesh), then decimated to `target`."""
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(rock, deps)
    mw = rock.matrix_world
    pts = [mw @ Vector(c) for c in rock.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    rng = random.Random(seed)
    cand = []
    N = 14
    for i in range(N):
        for j in range(N):
            x = lerp(lo.x, hi.x, (i + rng.random()) / N)
            y = lerp(lo.y, hi.y, (j + rng.random()) / N)
            loc, nrm, _, _ = tree.ray_cast(Vector((x, y, hi.z + 1)), Vector((0, 0, -1)), 50)
            if loc is not None and nrm.z > up:
                cand.append((loc, nrm))
    if not cand:
        return None
    top = max(c[0].z for c in cand)
    cand.sort(key=lambda c: -(c[0].z - top * .0) - rng.uniform(0, (hi.z - lo.z) * .35 * reach))
    chosen = []
    for p, n in cand:
        if len(chosen) >= count:
            break
        if any((p - q).length < size * spacing for q, _ in chosen):
            continue
        chosen.append((p, n))
    blobs = []
    for k, (p, n) in enumerate(chosen):
        s = size * rng.uniform(.75, 1.15) * (1.0 if k == 0 else .85)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1)
        off = Vector((rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)))
        for v in bm.verts:
            d = v.co.normalized()
            kk = 1 + .12 * noise.noise(d * 1.4 + off)
            v.co = Vector((d.x * s * kk, d.y * s * .85 * kk, d.z * s * flat * kk))
        q = n.to_track_quat('Z', 'Y').to_matrix().to_4x4() @ Matrix.Rotation(rng.uniform(0, TAU), 4, 'Z')
        bm.transform(Matrix.Translation(p - n * s * flat * .35) @ q)
        blobs.append(from_bmesh(name, bm, material))
    return sculpt(blobs, name, material, voxel=voxel, target=target, cells=cells, cell_amp=cell_amp, crease=.5,
                  seed=seed, smooth=3, normal_smooth=4)


# ---------------------------------------------------------------- flowers

def orient(bm, centre, normal, spin=0.0):
    """Transform a bmesh built around the origin facing +Z to `centre`, facing `normal`."""
    q = Vector(normal).normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bm.transform(Matrix.Translation(Vector(centre)) @ q @ Matrix.Rotation(spin, 4, 'Z'))
    return bm


def petal_disc(name, centre, normal, R, material, petals=8, inner=.42, cup=.18, spin=0.0, centre_lift=.0):
    """Star-polygon flower face: petal tips at R, valleys at R*inner, cupped upward by `cup` (x R)."""
    bm = bmesh.new()
    c = bm.verts.new((0, 0, R * centre_lift))
    rim = []
    for i in range(petals * 2):
        a = TAU * i / (petals * 2)
        rr = R * (1.0 if i % 2 == 0 else inner)
        rim.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, cup * R * (rr / R) ** 2)))
    for i in range(len(rim)):
        bm.faces.new((c, rim[i], rim[(i + 1) % len(rim)]))
    orient(bm, centre, normal, spin)
    return from_bmesh(name, bm, material, smooth_angle=60)


def dome(name, centre, normal, r, h, material, seg=6):
    """Small raised disc (flower centre, bud cap)."""
    bm = bmesh.new()
    top = bm.verts.new((0, 0, h))
    ring = [bm.verts.new((math.cos(TAU * i / seg) * r, math.sin(TAU * i / seg) * r, 0)) for i in range(seg)]
    for i in range(seg):
        bm.faces.new((top, ring[i], ring[(i + 1) % seg]))
    orient(bm, centre, normal)
    return from_bmesh(name, bm, material, smooth_angle=70)


# ---------------------------------------------------------------- nodes & export

def sink(objs, depth=.03, ref=None):
    """Lower parts together so the lowest vertex of `ref` (default: all) sits `depth` below z=0,
    so remeshed shells never float above the terrain."""
    bpy.context.view_layer.update()
    src = ref or objs
    lo = min((o.matrix_world @ v.co).z for o in src if o.type == 'MESH' for v in o.data.vertices)
    for o in objs:
        o.location.z -= lo + depth
    bpy.context.view_layer.update()
    return objs


def pivot_mesh(name, objs, pivot):
    """Join objs into one node whose origin is `pivot` (world), identity rotation."""
    objs = [o for o in objs if o is not None and o.type == 'MESH']
    for o in objs:
        if o.parent is not None:
            w = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = w
    ob = join(objs, name)
    apply_transform(ob)
    ob.data.transform(Matrix.Translation(-Vector(pivot)))
    ob.location = Vector(pivot)
    ob.name = name
    ob.data.name = name
    return ob


def finish(name, parts, root_name, keep=(), empties=()):
    """Merge static parts per material under one root; keep pivot nodes and empties separate."""
    keep = [k for k in keep if k is not None]
    parts = [p for p in parts if p is not None and p not in keep and p.type == 'MESH']
    root = empty(root_name)
    objs = join_by_material(parts, root_name)
    for o in objs:
        if o.parent is None:
            apply_transform(o)  # merged meshes sit at the root's origin with identity transforms
        set_parent(o, root)
    for k in list(keep) + list(empties):
        if k.parent is None:
            set_parent(k, root)
    print(f'{name}: {tri_count(objs + keep)} tris before export')
    return export(name, [root])


def report(results):
    print('\n==== SUMMARY ====')
    for name, info in results:
        print(f'{name:22s} {info["tris"]:6d} tris {info["bytes"] // 1024:5d} KB  {info["materials"]} mats')
