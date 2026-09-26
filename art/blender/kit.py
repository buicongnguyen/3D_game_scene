"""Shared toolkit for the Starline art pass (Blender 4.5 LTS).

Adapted from the race3D_game AAA kit (art/aaa/aaa_kit.py).

Style target: chunky, toy-like kart-racer forms (Mario Kart 8 is the quality
reference, never the source of designs). Every hard edge is bevelled, curved
parts are smooth shaded, materials are saturated PBR and each asset carries a
baked ambient-occlusion color attribute exported as glTF COLOR_0.

Conventions shared with the runtime (src/engine/assets.js):
  * Blender is Z-up; assets face -Y in Blender, which becomes +Z in three.js.
  * Exported with export_yup, so Blender (x, y, z) -> glTF (x, z, -y).
  * Node and material names listed in art/CONTRACTS.md are read by gameplay
    code and tests and must stay exact.

Usage from a family script:
    import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from kit import *
"""
import bpy, bmesh, math, os, random, json, struct
from mathutils import Vector, Matrix, Euler, noise
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'models')
TAU = math.tau

# ---------------------------------------------------------------- scene

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()
    return bpy.context.scene


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def empty(name, loc=(0, 0, 0), parent=None, rot=(0, 0, 0), **extras):
    """Pivot object. extras become glTF node extras when exported with extras=True."""
    ob = link(bpy.data.objects.new(name, None))
    ob.empty_display_size = .2
    ob.location = loc
    ob.rotation_euler = rot
    for k, v in extras.items():
        ob[k] = v
    if parent is not None:
        set_parent(ob, parent)
    return ob


def set_parent(child, parent):
    """Parent while keeping the child's world transform."""
    bpy.context.view_layer.update()
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    child.matrix_world = world
    return child


def descendants(obs):
    out, stack = [], list(obs)
    while stack:
        o = stack.pop()
        if o in out:
            continue
        out.append(o)
        stack.extend(o.children)
    return out

# ---------------------------------------------------------------- materials

MATS = {}


def srgb(h):
    """'#rrggbb' (sRGB) -> linear RGB tuple. Tuples pass through as linear."""
    if isinstance(h, str):
        h = h.lstrip('#')
        c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)
    return tuple(h[:3])


def mat(name, color, rough=.5, metal=0., emit=0., alpha=1., double=False, emit_color=None):
    """Named Principled material, cached by name so runtime name contracts hold."""
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    c = srgb(color)
    b.inputs['Base Color'].default_value = (*c, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*srgb(emit_color or color), 1)
        b.inputs['Emission Strength'].default_value = emit
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
    m.use_backface_culling = not double
    m.diffuse_color = (*c, alpha)
    MATS[name] = m
    return m

# ---------------------------------------------------------------- mesh helpers


def _object(name, bm, material, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, smooth_angle=38, flat=False):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    if material is not None:
        me.materials.append(material)
    ob.location = loc
    ob.rotation_euler = rot
    if flat:
        for p in me.polygons:
            p.use_smooth = False
    else:
        shade(ob, smooth_angle)
    if parent is not None:
        set_parent(ob, parent)
    return ob


def from_bmesh(name, bm, material=None, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, smooth_angle=38, flat=False):
    """Public wrapper: turn a bmesh into a shaded object (the bmesh is freed)."""
    return _object(name, bm, material, loc, rot, parent, smooth_angle, flat)


def shade(ob, angle=38):
    """Smooth shading with hard edges kept above `angle` degrees."""
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except Exception:
        pass
    return ob


def _bevel_all(bm, width, segments, clamp=True):
    if width <= 0:
        return
    bmesh.ops.bevel(bm, geom=list(bm.edges),
                    offset=width, offset_type='OFFSET', segments=segments, profile=.5,
                    affect='EDGES', clamp_overlap=clamp)


def box(name, size, loc=(0, 0, 0), material=None, bevel=.03, segments=3, rot=(0, 0, 0), parent=None, taper=None):
    """Bevelled box. size = full extents. taper=(sx, sy) scales the top face for wedge/trapezoid forms."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if taper and v.co.z > 0:
            v.co.x *= taper[0]
            v.co.y *= taper[1]
    _bevel_all(bm, min(bevel, min(size) * .45), segments)
    return _object(name, bm, material, loc, rot, parent)


def cyl(name, radius, depth, loc=(0, 0, 0), material=None, verts=24, r2=None, bevel=0., segments=2,
        rot=(0, 0, 0), parent=None, cap=True):
    """Cylinder/cone along local Z, centred at loc."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=verts, radius1=radius,
                          radius2=radius if r2 is None else r2, depth=depth)
    if bevel > 0 and cap:
        rim = [e for e in bm.edges if all(abs(abs(v.co.z) - depth / 2) < 1e-5 for v in e.verts)
               and len(e.link_faces) == 2 and any(len(f.verts) > 4 for f in e.link_faces)]
        bmesh.ops.bevel(bm, geom=rim, offset=min(bevel, radius * .45, depth * .45), offset_type='OFFSET',
                        segments=segments, profile=.5, affect='EDGES', clamp_overlap=True)
    return _object(name, bm, material, loc, rot, parent)


def sphere(name, radius, loc=(0, 0, 0), material=None, seg=24, rings=12, rot=(0, 0, 0), parent=None):
    """UV sphere; radius may be a scalar or (rx, ry, rz) for an ellipsoid."""
    r = radius if isinstance(radius, (tuple, list)) else (radius,) * 3
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2]))
    return _object(name, bm, material, loc, rot, parent, smooth_angle=80)


def _frame(a, b):
    d = (Vector(b) - Vector(a))
    return d.length, d.to_track_quat('Z', 'Y').to_euler(), (Vector(a) + Vector(b)) / 2


def rod(name, a, b, radius, material=None, verts=12, r2=None, bevel=0., parent=None, cap=True):
    """Cylinder from point a to point b."""
    length, rot, mid = _frame(a, b)
    return cyl(name, radius, length, mid, material, verts, r2, bevel, 2, rot, parent, cap)


def capsule(name, a, b, radius, material=None, seg=16, rings=8, parent=None, r2=None):
    """Rounded capsule from a to b (optionally tapering to r2 at b)."""
    length, rot, mid = _frame(a, b)
    rb = radius if r2 is None else r2
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings * 2, radius=1)
    for v in bm.verts:
        top = v.co.z >= 0
        rr = rb if top else radius
        v.co = Vector((v.co.x * rr, v.co.y * rr, v.co.z * rr + (length / 2 if top else -length / 2)))
    return _object(name, bm, material, mid, rot, parent, smooth_angle=80)


def torus(name, R, r, loc=(0, 0, 0), material=None, maj=32, mn=12, rot=(0, 0, 0), parent=None, arc=1.0):
    """Torus in the local XY plane (axis Z). arc<1 builds an open arc."""
    bm = bmesh.new()
    rings = []
    n = maj if arc >= 1 else maj + 1
    for i in range(n):
        a = TAU * arc * i / maj
        c, s = math.cos(a), math.sin(a)
        ring = []
        for j in range(mn):
            b = TAU * j / mn
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((rr * c, rr * s, r * math.sin(b))))
        rings.append(ring)
    for i in range(len(rings) - (0 if arc >= 1 else 1)):
        r0, r1 = rings[i], rings[(i + 1) % len(rings)]
        for j in range(mn):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % mn], r0[(j + 1) % mn]))
    return _object(name, bm, material, loc, rot, parent, smooth_angle=80)


def lathe(name, profile, material=None, seg=32, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, smooth_angle=50):
    """Revolve [(radius, z), ...] around local Z. Zero radius ends are closed with poles."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(TAU * i / seg), r * math.sin(TAU * i / seg), z))
                          for i in range(seg)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for i in range(seg):
            if len(a) == 1:
                bm.faces.new((a[0], b[i], b[(i + 1) % seg]))
            elif len(b) == 1:
                bm.faces.new((a[i], b[0], a[(i + 1) % seg]))
            else:
                bm.faces.new((a[i], b[i], b[(i + 1) % seg], a[(i + 1) % seg]))
    for ring in (rings[0], rings[-1]):
        if len(ring) > 1:
            f = bm.faces.new(ring if ring is rings[-1] else list(reversed(ring)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, material, loc, rot, parent, smooth_angle)


def extrude(name, outline, depth, material=None, bevel=0.01, segments=2, loc=(0, 0, 0), rot=(0, 0, 0),
            parent=None, plane='XZ'):
    """Extrude a 2D outline [(u, v), ...]. plane='XZ' makes a sign-like shape (depth along Y),
    'XY' makes a floor shape (depth along Z)."""
    bm = bmesh.new()
    if plane == 'XZ':
        vs = [bm.verts.new((u, -depth / 2, v)) for u, v in outline]
        axis = Vector((0, depth, 0))
    else:
        vs = [bm.verts.new((u, v, -depth / 2)) for u, v in outline]
        axis = Vector((0, 0, depth))
    f = bm.faces.new(vs)
    ret = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [e for e in ret['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=axis, verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type='OFFSET', segments=segments,
                        profile=.5, affect='EDGES', clamp_overlap=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    return _object(name, bm, material, loc, rot, parent, smooth_angle=35)


def _frames(points):
    """Parallel-transport frames along a polyline."""
    pts = [Vector(p) for p in points]
    tangents = []
    for i in range(len(pts)):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        tangents.append((b - a).normalized())
    up = Vector((0, 0, 1)) if abs(tangents[0].z) < .9 else Vector((1, 0, 0))
    n = tangents[0].cross(up).normalized()
    frames = []
    for i, t in enumerate(tangents):
        if i:
            prev = tangents[i - 1]
            axis = prev.cross(t)
            if axis.length > 1e-6:
                ang = math.asin(min(1, axis.length))
                if prev.dot(t) < 0:
                    ang = math.pi - ang
                n = (Matrix.Rotation(ang, 3, axis.normalized()) @ n).normalized()
        b = t.cross(n).normalized()
        frames.append((pts[i], t, n, b))
    return frames


def tube(name, points, radius, material=None, verts=10, parent=None, caps=True, radius_fn=None, closed=False,
         squash=1.0):
    """Sweep a circle along a polyline. radius_fn(t in 0..1) scales the radius; squash flattens it."""
    fr = _frames(points)
    bm = bmesh.new()
    rings = []
    count = len(fr)
    for i, (p, t, n, b) in enumerate(fr):
        k = radius * (radius_fn(i / max(count - 1, 1)) if radius_fn else 1)
        rings.append([bm.verts.new(p + (n * math.cos(TAU * j / verts) * squash + b * math.sin(TAU * j / verts)) * k)
                      for j in range(verts)])
    seq = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for r0, r1 in seq:
        for j in range(verts):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % verts], r0[(j + 1) % verts]))
    if caps and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, material, parent=parent, smooth_angle=70)


def blade(name, root, direction, length, width, material=None, bend=0.3, twist=0., segs=6, parent=None,
          up=(0, 0, 1), fold=0.15, taper=True, tip=0.05):
    """A curved, creased leaf/feather/frond strip. Double-sided via material.double."""
    d = Vector(direction).normalized()
    side = d.cross(Vector(up))
    if side.length < 1e-4:
        side = d.cross(Vector((1, 0, 0)))
    side.normalize()
    upv = side.cross(d).normalized()
    bm = bmesh.new()
    rows = []
    for i in range(segs + 1):
        t = i / segs
        w = width * (math.sin(math.pi * min(1, t * 1.15 + .08)) if taper else 1) * (1 - t * (1 - tip))
        w = max(w, width * tip)
        center = Vector(root) + d * (length * t) - upv * (bend * length * t * t)
        tw = twist * t
        s = side * math.cos(tw) + upv * math.sin(tw)
        crease = upv * (fold * w)
        rows.append([bm.verts.new(center - s * w / 2 - crease), bm.verts.new(center + crease * .6),
                     bm.verts.new(center + s * w / 2 - crease)])
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], b[0], b[1], a[1]))
        bm.faces.new((a[1], b[1], b[2], a[2]))
    return _object(name, bm, material, parent=parent, smooth_angle=80)

# ---------------------------------------------------------------- modifiers


def subsurf(ob, levels=1):
    mod = ob.modifiers.new('Subdivision', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    return apply_mods(ob)


def bevel_mod(ob, width=.02, segments=2, angle=35):
    mod = ob.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = False
    return apply_mods(ob)


def weld(ob, dist=1e-4):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def decimate(ob, ratio):
    mod = ob.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = ratio
    return apply_mods(ob)


def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    return ob


def displace(ob, strength=.1, scale=1.0, seed=0, octaves=3, axis_scale=(1, 1, 1), along_normal=True):
    """Fractal noise displacement (object space). Subdivide first for organic surfaces."""
    me = ob.data
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    for v in me.vertices:
        p = Vector((v.co.x * axis_scale[0], v.co.y * axis_scale[1], v.co.z * axis_scale[2])) * scale + off
        n = noise.fractal(p, 1.0, 2.0, octaves, noise_basis='PERLIN_ORIGINAL')
        if along_normal:
            v.co += v.normal * n * strength
        else:
            v.co += Vector((noise.noise(p + Vector((5, 0, 0))), noise.noise(p + Vector((0, 5, 0))),
                            noise.noise(p + Vector((0, 0, 5))))) * strength
    me.update()
    return ob


def apply_transform(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def mirror_copy(ob, name=None, axis=0):
    """World-space mirrored duplicate (default across X). The copy's transform is baked, so its
    origin is the world origin; build pivoted left/right parts explicitly instead."""
    bpy.context.view_layer.update()
    new = link(bpy.data.objects.new(name or ob.name, ob.data.copy()))
    new.data.transform(ob.matrix_world)
    s = [1, 1, 1]
    s[axis] = -1
    new.data.transform(Matrix.Diagonal((*s, 1)))
    new.data.flip_normals()
    new.data.update()
    return new


def join(objs, name):
    """Join meshes into the first one (world transforms preserved)."""
    objs = [o for o in objs if o and o.type == 'MESH']
    if not objs:
        return None
    bpy.context.view_layer.update()
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def join_by_material(objs, prefix):
    """Merge static parts per material to cut nodes/draw overhead. Returns new objects."""
    groups = {}
    for o in objs:
        if o.type != 'MESH' or not o.data.materials:
            continue
        groups.setdefault(o.data.materials[0].name, []).append(o)
    out = []
    for mname, group in groups.items():
        parent = group[0].parent
        pw = parent.matrix_world.copy() if parent else None
        for o in group:
            if o.parent is not parent:
                w = o.matrix_world.copy()
                o.parent = parent
                o.matrix_world = w
        ob = join(group, f'{prefix} {mname}')
        out.append(ob)
    return out

# ---------------------------------------------------------------- ambient occlusion


def bake_ao(objs, rays=48, distance=0.6, strength=0.7, ground=None, ground_size=50., floor_strength=None,
            seed=7, min_value=0.25, tint=(1.0, 1.0, 1.0), extra_occluders=()):
    """Ray-traced AO into a CORNER color attribute named 'Color' (exported as COLOR_0).

    objs: meshes that receive AO (all also occlude). ground: z height of an implied floor plane
    for grounded props (None for floating pickups). Values are linear multipliers.
    """
    bpy.context.view_layer.update()
    meshes = [o for o in objs if o.type == 'MESH']
    occ = meshes + [o for o in extra_occluders if o.type == 'MESH']
    verts, polys = [], []
    for o in occ:
        mw = o.matrix_world
        base = len(verts)
        verts.extend(mw @ v.co for v in o.data.vertices)
        polys.extend([base + i for i in p.vertices] for p in o.data.polygons)
    if ground is not None:
        g = ground_size
        base = len(verts)
        verts.extend([Vector((-g, -g, ground)), Vector((g, -g, ground)), Vector((g, g, ground)),
                      Vector((-g, g, ground))])
        polys.append([base, base + 1, base + 2, base + 3])
    tree = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    rng = random.Random(seed)
    # Cosine-weighted hemisphere samples around +Z, rotated per vertex.
    samples = []
    for i in range(rays):
        u, v = (i + rng.random()) / rays, rng.random()
        r = math.sqrt(u)
        a = TAU * v
        samples.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(max(0, 1 - u)))))
    for o in meshes:
        me = o.data
        mw = o.matrix_world
        nm = mw.to_3x3().inverted_safe().transposed()
        values = []
        for v in me.vertices:
            p = mw @ v.co
            n = (nm @ v.normal).normalized()
            if n.length < .5:
                values.append(1.0)
                continue
            q = n.to_track_quat('Z', 'Y')
            hit = 0.0
            origin = p + n * max(distance * .004, 1e-4)
            for s in samples:
                d = q @ s
                loc, _, _, dist = tree.ray_cast(origin, d, distance)
                if loc is not None:
                    hit += (1 - dist / distance) ** .5
            ao = 1 - strength * hit / rays
            values.append(max(min_value, ao))
        attr = me.color_attributes.get('Color') or me.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
        for li, loop in enumerate(me.loops):
            a = values[loop.vertex_index]
            attr.data[li].color = (a * tint[0], a * tint[1], a * tint[2], 1.0)
        me.color_attributes.active_color = attr
        try:
            me.color_attributes.render_color_index = me.color_attributes.find('Color')
        except Exception:
            pass
    return objs


def ensure_color(objs, value=1.0):
    """Give meshes without AO a flat white color attribute so every part exports COLOR_0."""
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        if me.color_attributes.get('Color'):
            continue
        attr = me.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
        for d in attr.data:
            d.color = (value, value, value, 1)
        me.color_attributes.active_color = attr

# ---------------------------------------------------------------- export & checks


def export(name, roots, extras=False, out_dir=None):
    """Export roots and all descendants to public/models/<name>.glb."""
    objs = descendants(roots)
    ensure_color(objs)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    path = os.path.join(out_dir or OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_extras=extras, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_normals=True, export_animations=False,
                              export_cameras=False, export_lights=False, export_materials='EXPORT')
    info = glb_summary(path)
    print(f'EXPORTED {name}: {info["tris"]} tris, {info["meshes"]} meshes, {info["materials"]} materials, '
          f'{info["bytes"] // 1024} KB')
    return info


def glb_summary(path):
    with open(path, 'rb') as f:
        data = f.read()
    n = struct.unpack_from('<I', data, 12)[0]
    j = json.loads(data[20:20 + n])
    tris = 0
    for m in j.get('meshes', []):
        for p in m['primitives']:
            acc = j['accessors'][p['indices']] if 'indices' in p else j['accessors'][p['attributes']['POSITION']]
            tris += acc['count'] // 3
    return dict(tris=tris, meshes=len(j.get('meshes', [])), nodes=[nd.get('name') for nd in j.get('nodes', [])],
                materials=len(j.get('materials', [])), bytes=len(data))


def clear_scene_objects():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)


def save_kit(family, names, spacing=6.0):
    """Assemble the exported GLBs side by side in one editable art/blender/source/<family>.blend."""
    reset()
    x = 0.0
    for name in names:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + '.glb'))
        new = [o for o in bpy.data.objects if o not in before]
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
        bpy.context.view_layer.update()
        xs = [(o.matrix_world @ Vector(c)).x for o in new if o.type == 'MESH' for c in o.bound_box] or [0]
        width = max(xs) - min(xs)
        for o in new:
            for c in list(o.users_collection):
                c.objects.unlink(o)
            col.objects.link(o)
            if o.parent is None:
                o.location.x += x - min(xs)
        x += width + spacing
    path = os.path.join(ROOT, 'art', 'blender', 'source', family + '.blend')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print('SAVED', path)
