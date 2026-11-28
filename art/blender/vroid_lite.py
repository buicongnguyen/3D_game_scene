# © 2026 Bui Cong Nguyen · solluxlabs.com
"""Light game models from the VRoid Project sample characters (ktvgo "desktop-mixamo65" GLBs).

    blender -b --factory-startup --python art/blender/vroid_lite.py -- \
        --src E:/repo/ktvgo_live/characters/glb/desktop-mixamo65-candidates --out .tools/vroid/lite \
        [--names nu-1,nam-2] [--tris 8000] [--atlas 512] [--suffix .lite] [--name <file stem>]

Source: the eight VRoid Project sample avatars (VRoid Hub licence in their VRM meta: anyone, commercial use,
modification and redistribution allowed, credit unnecessary; the game credits "VRoid Project" anyway), already
converted by the ktvgo tools to a Mixamo skeleton with jaw + eye_L + eye_R (read only here).

What the script does, per character:
1. Skeleton. The game's performers' skeleton (hoa.glb: root/hips/spine/chest/neck/head, arms, legs, five finger
   bones a hand, grip_R) is taken WITH its clips. The VRoid arms are posed down onto Hoa's rest directions and that
   pose is baked into the mesh (it becomes the rest), then Hoa's bones are moved onto the VRoid joints keeping Hoa's
   exact rest orientations, so Hoa's clips (rotations in bone space) play unchanged; the hips' position keys are
   scaled by the leg length. eye_L / eye_R stay (gaze), the jaw is dropped (the authored mouth shapes are better).
2. Weights. Every VRoid bone folds into the nearest mapped bone: hair and accessories ride rigidly on the head,
   sleeves on the arm, skirts half on the hips and half on the thigh (so a skirt does not tear between the legs),
   fingers into the five game finger bones, the shoulder and spine1 into chest/spine. Four influences, normalised.
3. Mesh. Body skin hidden under clothes is cut (ray test, grown two rings), EyeExtra is removed, body + clothes +
   hair are decimated (symmetric collapse) to the triangle target; the face stays untouched (three morphs:
   blink, mouthA, mouthO from the authored Fcl_EYE_Close / Fcl_MTH_A / Fcl_MTH_O).
4. Material. Every source material's base colour and alpha are baked (Cycles, emission) into ONE atlas; one
   material, alpha MASK, double sided -> one draw call. Texel share per material follows its source texture size,
   the face and eyes get extra; texels stay square (u by the source's width, v by its height), islands of one material
   that read the same texels share them (hair cards), and the packer is kept from "correcting" for a picture's aspect
   (build_atlas: the boys' faces came out 16 : 1 before 2026-11-28).
5. The mouth (MOUTH, 2026-11-28): the lips tinted and the mouth's inside darkened in the atlas, so a face reads as
   singing from a few metres (pink-coral lips for the girls, a faint rose for the boys; mouth_masks / mouth_look).
"""
import bpy, bmesh, sys, os, json, math, struct
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
NAMES = ['nam-1', 'nam-2', 'nam-3', 'nu-1', 'nu-2', 'nu-3', 'nu-4', 'nu-5']
CLIPS = ['Idle', 'Walk', 'Talk', 'Wave', 'Bow', 'Cheer', 'Turn']
MORPHS = {'Fcl_EYE_Close': 'blink', 'Fcl_MTH_A': 'mouthA', 'Fcl_MTH_O': 'mouthO'}
P = 'mixamorig:'


def cli():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'src': 'E:/repo/ktvgo_live/characters/glb/desktop-mixamo65-candidates', 'out': os.path.join(REPO, '.tools/vroid/lite'),
         'names': ','.join(NAMES), 'tris': '8000', 'atlas': '512', 'suffix': '', 'name': '', 'ref': os.path.join(REPO, 'public/models/hoa.glb'),
         'face': '1.2', 'work': os.path.join(REPO, '.tools/vroid/work')}
    k = None
    for x in a:
        if x.startswith('--'): k = x[2:]
        elif k: o[k] = x; k = None
    o['out'] = os.path.abspath(o['out']); o['work'] = os.path.abspath(o['work']); os.makedirs(o['work'], exist_ok=True); o['src'] = os.path.abspath(o['src']); o['ref'] = os.path.abspath(o['ref'])
    return o


# ------------------------------------------------------------------------------------------------ bone mapping
BASE = {'Hips': 'hips', 'Spine': 'spine', 'Spine1': 'spine', 'Spine2': 'chest', 'Neck': 'neck', 'Head': 'head',
        'HeadTop_End': 'head', 'jaw': 'head', 'eye_L': 'eye_L', 'eye_R': 'eye_R', 'root': 'hips'}
for S, s in (('Left', 'L'), ('Right', 'R')):
    BASE.update({f'{S}Shoulder': 'chest', f'{S}Arm': f'upperarm_{s}', f'{S}ForeArm': f'forearm_{s}', f'{S}Hand': f'hand_{s}',
                 f'{S}UpLeg': f'thigh_{s}', f'{S}Leg': f'shin_{s}', f'{S}Foot': f'foot_{s}', f'{S}ToeBase': f'foot_{s}',
                 f'{S}Toe_End': f'foot_{s}', f'{S}HandIndex1': f'index_{s}'})
    for i in (1, 2, 3, 4): BASE[f'{S}HandThumb{i}'] = f'thumb_{s}'
    for i in (2, 3, 4): BASE[f'{S}HandIndex{i}'] = f'index2_{s}'
    for f in ('Middle', 'Ring', 'Pinky'):
        BASE[f'{S}Hand{f}1'] = f'fingers_{s}'
        for i in (2, 3, 4): BASE[f'{S}Hand{f}{i}'] = f'fingers2_{s}'
# where each game bone sits on the VRoid body
JOINT = {'hips': 'Hips', 'spine': 'Spine', 'chest': 'Spine2', 'neck': 'Neck', 'head': 'Head'}
for S, s in (('Left', 'L'), ('Right', 'R')):
    JOINT.update({f'upperarm_{s}': f'{S}Arm', f'forearm_{s}': f'{S}ForeArm', f'hand_{s}': f'{S}Hand', f'thumb_{s}': f'{S}HandThumb1',
                  f'index_{s}': f'{S}HandIndex1', f'index2_{s}': f'{S}HandIndex2', f'fingers_{s}': f'{S}HandMiddle1',
                  f'fingers2_{s}': f'{S}HandMiddle2', f'thigh_{s}': f'{S}UpLeg', f'shin_{s}': f'{S}Leg', f'foot_{s}': f'{S}Foot'})


def short(n): return n[len(P):] if n.startswith(P) else n


def select_only(objs, active=None):
    bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def tri_count(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    m = ev.to_mesh()
    n = sum(len(p.vertices) - 2 for p in m.polygons)
    ev.to_mesh_clear()
    return n


# ------------------------------------------------------------------------------------------------ steps
def import_ref(path):
    bpy.ops.import_scene.gltf(filepath=path)
    ref = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    for o in list(bpy.context.scene.objects):
        if o is not ref: bpy.data.objects.remove(o, do_unlink=True)
    assert all(abs(ref.matrix_world[i][j] - (i == j)) < 1e-6 for i in range(4) for j in range(4)), 'reference rig not at the origin'
    rest = {b.name: {'head': b.head_local.copy(), 'm': b.matrix_local.to_3x3().copy(), 'len': b.length,
                     'parent': b.parent.name if b.parent else None} for b in ref.data.bones}
    ref.name = 'Armature'
    return ref, rest


def import_vroid(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    va = next(o for o in new if o.type == 'ARMATURE')
    meshes = [o for o in new if o.type == 'MESH' and o.parent is not None and any(m.type == 'ARMATURE' for m in o.modifiers)]
    for o in new:
        if o is not va and o not in meshes: bpy.data.objects.remove(o, do_unlink=True)
    return va, meshes


def pose_arms_down(va, rest):
    select_only([va])
    bpy.ops.object.mode_set(mode='POSE')
    pb = va.pose.bones
    rd = lambda a, b: rest[b]['head'] - rest[a]['head']

    def align(bone, child, target):
        b = pb[P + bone]
        h = b.head.copy()
        q = (pb[P + child].head - h).normalized().rotation_difference(target.normalized())
        b.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ b.matrix
        bpy.context.view_layer.update()
    for S, s in (('Left', 'L'), ('Right', 'R')):
        align(f'{S}Arm', f'{S}ForeArm', rd(f'upperarm_{s}', f'forearm_{s}'))
        align(f'{S}ForeArm', f'{S}Hand', rd(f'forearm_{s}', f'hand_{s}'))
        align(f'{S}Hand', f'{S}HandMiddle1', rd(f'hand_{s}', f'fingers_{s}'))
    joints = {short(b.name): (va.matrix_world @ b.head) for b in pb}
    bpy.ops.object.mode_set(mode='OBJECT')
    return joints


def bake_pose_into_meshes(va, meshes):
    moved = {P + n for n in BASE if any(k in n for k in ('Arm', 'Hand', 'Shoulder'))}
    for o in meshes:
        if o.data.shape_keys:
            # the face: must not hang on anything that was posed
            idx = {g.index for g in o.vertex_groups if g.name in moved}
            bad = sum(1 for v in o.data.vertices for g in v.groups if g.group in idx and g.weight > 1e-4)
            assert bad == 0, f'{o.name}: {bad} shape-keyed vertices on posed bones'
            continue
        select_only([o])
        mod = next(m for m in o.modifiers if m.type == 'ARMATURE')
        bpy.ops.object.modifier_apply(modifier=mod.name)


def fold_weights(o, parent_of, skirt_hips=0.5):
    me = o.data
    names = {g.index: g.name for g in o.vertex_groups}
    cache = {}

    def target(n):
        if n in cache: return cache[n]
        m, sec = n, False
        while m:
            t = BASE.get(short(m))
            if t:
                break
            sec = sec or short(m).startswith('J_')
            m = parent_of.get(m)
        t = t or 'hips'
        out = [(t, 1.0)]
        if sec and t.startswith('thigh_'): out = [('hips', skirt_hips), (t, 1 - skirt_hips)]
        cache[n] = out
        return out
    per = []
    for v in me.vertices:
        acc = {}
        for g in v.groups:
            if g.weight <= 0: continue
            for t, f in target(names[g.group]):
                acc[t] = acc.get(t, 0) + g.weight * f
        top = sorted(acc.items(), key=lambda x: -x[1])[:4]
        s = sum(w for _, w in top) or 1
        per.append([(t, w / s) for t, w in top] or [('hips', 1.0)])
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    groups = {}
    for i, ws in enumerate(per):
        for t, w in ws:
            if t not in groups: groups[t] = o.vertex_groups.new(name=t)
            groups[t].add([i], w, 'REPLACE')


def rebuild_rig(ref, rest, J, sc):
    select_only([ref])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = ref.data.edit_bones
    for b in eb: b.use_connect = False
    hand = (J['RightHandMiddle1'] - J['RightHand']).length / (rest['fingers_R']['head'] - rest['hand_R']['head']).length
    for name, r in rest.items():
        if name == 'root': h = Vector((0, 0, 0))
        elif name in JOINT: h = J[JOINT[name]]
        elif name == 'grip_R': h = J['RightHand'] + (r['head'] - rest['hand_R']['head']) * hand
        else:
            p = r['parent']
            h = J[JOINT[p]] + (r['head'] - rest[p]['head']) * sc if p in JOINT else r['head'] * sc
        e = eb[name]
        e.matrix = Matrix.Translation(h) @ r['m'].to_4x4()
        e.length = max(r['len'] * (hand if any(k in name for k in ('thumb', 'index', 'fingers', 'grip')) else sc), 0.005)
    for s in ('L', 'R'):
        e = eb.new(f'eye_{s}')
        e.matrix = Matrix.Translation(J[f'eye_{s}']) @ rest['head']['m'].to_4x4()
        e.length = 0.02
        e.parent = eb['head']
    bpy.ops.object.mode_set(mode='OBJECT')


def scale_hip_keys(r):
    for act in bpy.data.actions:
        curves = []
        try:
            for layer in act.layers:
                for strip in layer.strips:
                    for cb in strip.channelbags: curves += list(cb.fcurves)
        except AttributeError:
            curves = list(act.fcurves)
        for fc in curves:
            if fc.data_path.endswith('.location'):
                for k in fc.keyframe_points:
                    k.co[1] *= r; k.handle_left[1] *= r; k.handle_right[1] *= r


def keep_morphs(face):
    keys = face.data.shape_keys.key_blocks
    keep = {}
    for kb in keys:
        for src, dst in MORPHS.items():
            if kb.name.endswith(src) and dst not in keep.values(): keep[kb.name] = dst
    for kb in list(keys):
        if kb.name != keys[0].name and kb.name not in keep: face.shape_key_remove(kb)
    for kb in face.data.shape_keys.key_blocks:
        if kb.name in keep: kb.name = keep[kb.name]
    return sorted(keep.values())


def delete_faces(o, test):
    bm = bmesh.new(); bm.from_mesh(o.data)
    gone = [f for f in bm.faces if test(f)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bm.to_mesh(o.data); bm.free()
    return len(gone)


def sphere_dirs(n):
    out = []
    for i in range(n):
        phi = math.acos(1 - 2 * (i + 0.5) / n); th = math.pi * (1 + 5 ** 0.5) * (i + 0.5)
        out.append(Vector((math.cos(th) * math.sin(phi), math.sin(th) * math.sin(phi), math.cos(phi))))
    return out


def cull_hidden_skin(o, rings=2, reach=0.35):
    """Body skin under the clothes, shoes and hair: a skin triangle no ray from it (outward half sphere) leaves
    without hitting a non-skin surface within `reach` metres is cut, after growing the seen set `rings` rings."""
    mats = [s.material.name if s.material else '' for s in o.material_slots]
    skin = {i for i, n in enumerate(mats) if 'Body' in n and 'SKIN' in n}
    if not skin: return 0
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
    occ = [f for f in bm.faces if f.material_index not in skin]
    if not occ: bm.free(); return 0
    verts = [v.co.copy() for v in bm.verts]
    bvh = BVHTree.FromPolygons(verts, [[v.index for v in f.verts] for f in occ], all_triangles=False)
    dirs = sphere_dirs(64)
    seen = set()
    for f in bm.faces:
        if f.material_index not in skin: continue
        n = f.normal; c = f.calc_center_median()
        for d in dirs:
            if d.dot(n) < 0.05: continue
            hit = bvh.ray_cast(c + n * 1e-4, d, reach)
            if hit[0] is None: seen.add(f.index); break
    for _ in range(rings):
        grow = set()
        for i in seen:
            for v in bm.faces[i].verts:
                for g in v.link_faces: grow.add(g.index)
        seen |= grow
    gone = [f for f in bm.faces if f.material_index in skin and f.index not in seen]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(o.data); bm.free()
    return len(gone)


def decimate_to(o, target):
    have = tri_count(o)
    if have <= target: return have
    mod = o.modifiers.new('dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'; mod.use_symmetry = True; mod.symmetry_axis = 'X'; mod.use_collapse_triangulate = True
    lo, hi = 0.02, 1.0
    for _ in range(14):
        mod.ratio = (lo + hi) / 2
        n = tri_count(o)
        if n > target: hi = mod.ratio
        else: lo = mod.ratio
        # (close enough only from below: a step just over the target used to stop here and fall back to lo = 0.02, the
        # whole body cut to 2 % - AvatarSample_F's 21.6k body met 0.51 -> 10994 tris against 10914)
        if n <= target and target - n < target * 0.01: break
    mod.ratio = lo if tri_count(o) > target else mod.ratio
    select_only([o])
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return tri_count(o)


def find_source(mat):
    """(image or None, rgba factor, uses texture alpha) of a glTF-imported material's base colour."""
    # the ktvgo files are unlit (KHR_materials_unlit -> Emission + Transparent mix); a lit one has a Principled BSDF
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    em = next((n for n in nt.nodes if n.type == 'EMISSION'), None)
    sock = bsdf.inputs['Base Color'] if bsdf else em.inputs['Color'] if em else None
    if sock is None: return None, (1, 1, 1, 1), False
    img, fac = None, list(sock.default_value) if not sock.is_linked else [1, 1, 1, 1]
    stack = [sock]
    while stack:
        s = stack.pop()
        for l in s.links:
            n = l.from_node
            if n.type == 'TEX_IMAGE': img = n.image
            for i in n.inputs:
                if i.is_linked: stack.append(i)
                elif i.type == 'RGBA' and n.type in ('MIX', 'MIX_RGB') and i.enabled: fac = list(i.default_value)
    uses_alpha = any(l.from_socket.name == 'Alpha' and l.from_node.type == 'TEX_IMAGE' for l in nt.links)
    if bsdf and not bsdf.inputs['Alpha'].is_linked: fac[3] = bsdf.inputs['Alpha'].default_value
    else: fac[3] = 1.0
    return img, tuple(fac), uses_alpha


# ------------------------------------------------------------------------------------------------ the mouth
# The mouth read from a few metres (2026-11-28, round 3 of the faces; docs/GROUP-PERFORMANCE.md, face-speech-motion
# references/faces-at-distance.md). The VRoid faces paint the lips as one thin line on pale skin, so a closed mouth is
# gone by ~6 m, and the open mouth's inside (a mid red) is close to the skin's brightness. Two masks over the atlas:
#   lips    the face skin within a few mm of the mouth's slit (the skin edges along the mouth's inside), upper lip thinner
#           than the lower, fading toward the corners
#   inside  the mouth's own sheet (FaceMouth: teeth, tongue, throat)
# and per character kind a soft multiply: lips toward a pink-coral (girls) or a faint natural rose (boys), the inside
# darker except the teeth. Both in the picture: no draws, materials or shader work, the same on PC and Low.
# Measured (round 3, frozen Sing & Play frames, 2-12 m): with the inside darker, singing changes the mouth's pixels
# 14-29 % more for the girls and 42-55 % for the boys at 2-6 m than with the shipped atlas (the open mouth reads as a dark
# shape instead of a red one at the skin's brightness); a lip band of a few mm changed a closed mouth by only 1-2 CIE76 units (unseen), the wider one
# below by 3-4.5 at 2-6 m (just seen: soft pink lips, no lipstick). The narrow band stays for the boys (a faint tint).
MOUTH = {
    # tint: multiply colour at full lip weight; lip: its strength; up / down: the lip band above / below the slit as
    # (share of the mouth's width, at most metres: the slits are 16-40 mm wide); inner: how much darker the inside gets
    # (teeth kept)
    'girl': {'tint': (1.0, 0.62, 0.64), 'lip': 0.88, 'up': (0.15, 0.0032), 'down': (0.32, 0.0068), 'inner': 0.6},
    'boy': {'tint': (1.0, 0.82, 0.80), 'lip': 0.35, 'up': (0.08, 0.002), 'down': (0.15, 0.004), 'inner': 0.6},
}
MOUTH_KIND = 'girl'                                         # (set per character by the caller: vroid_mixamo.py)
MOUTH_ON = os.environ.get('VROID_MOUTH', 'on') != 'off'     # off: the atlas as baked
# measuring (env VROID_MOUTH_VARIANTS=1): each choice written beside the atlas as <stem>.atlas.<name>.png
MOUTH_VARIANTS = {'none': {'lip': 0, 'inner': 0}, 'a': {'lip': 1, 'inner': 0}, 'b': {'lip': 0, 'inner': 1},
                  'c': {'lip': 1, 'inner': 1}, 'a2': {'lip': 1.6, 'inner': 0}, 'c2': {'lip': 1.6, 'inner': 1.3}}
LAST_ATLAS = {}                                             # the last build_atlas's numbers (texels, mouth) for reports


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def tri_texels(uv3, p3, size):
    """Texel centres inside one atlas triangle (uv3: 3 x 2, 0..1; p3: 3 x 3 rest positions) -> (flat indices, 3D points)."""
    P = uv3 * size
    x0, y0 = np.maximum(np.floor(P.min(0)).astype(int), 0); x1, y1 = np.minimum(np.ceil(P.max(0)).astype(int), size - 1)
    if x1 < x0 or y1 < y0: return None, None
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    xs, ys = xs.ravel(), ys.ravel(); X, Y = xs + 0.5, ys + 0.5
    (ax, ay), (bx, by), (cx, cy) = P
    d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(d) < 1e-12: return None, None
    l0 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / d
    l1 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / d
    l2 = 1 - l0 - l1
    ins = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
    if not ins.any(): return None, None
    pts = l0[ins, None] * p3[0] + l1[ins, None] * p3[1] + l2[ins, None] * p3[2]
    return ys[ins] * size + xs[ins], pts


def mouth_masks(o, size, names):
    """(lips, inside): per texel weights 0..1 over the size x size atlas (rows from the bottom, as Blender's pixels), from
    the face skin and the mouth sheet's triangles in the 'atlas' UV map; also the atlas's texels per face sheet into
    LAST_ATLAS. names: the source material of each slot."""
    me = o.data
    lip = np.zeros(size * size, np.float32); inner = np.zeros(size * size, np.float32)
    mouth = {i for i, n in enumerate(names) if 'FaceMouth' in n}
    skin = {i for i, n in enumerate(names) if 'Face' in n and 'SKIN' in n and 'Body' not in n}
    # texels per face sheet (UV area x size^2; the hair cards share theirs, so these are the real texels)
    me.calc_loop_triangles()
    au = me.uv_layers['atlas'].data
    sheets = {'skin': skin, 'mouth': mouth}
    for k, key in (('brow', 'FaceBrow'), ('eyeline', 'FaceEyeline'), ('lash', 'FaceEyelash'), ('iris', 'EyeIris'), ('white', 'EyeWhite')):
        sheets[k] = {i for i, n in enumerate(names) if key in n}
    tex = {k: 0.0 for k in sheets}
    tris = list(me.loop_triangles)
    for t in tris:
        a, b, c = (au[li].uv for li in t.loops)
        area = abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2 * size * size
        for k, s in sheets.items():
            if t.material_index in s: tex[k] += area
    rep = {'texels': {k: int(round(v)) for k, v in tex.items()}}
    LAST_ATLAS.clear(); LAST_ATLAS.update(rep)
    if not mouth or not skin: rep['mouth'] = None; print('MOUTH none', names); return lip, inner
    co = np.array([v.co[:] for v in me.vertices])      # rest positions (the shape keys' basis)
    uvl = np.array([l.uv[:] for l in au])

    def raster(want, mask, weight=None, near=None):
        n = 0
        for t in tris:
            if t.material_index not in want: continue
            vi = list(t.vertices)
            # (a triangle whose box meets the region: the face's triangles round the mouth are larger than the lip band)
            if near is not None and ((co[vi].max(0) < near[0]).any() or (co[vi].min(0) > near[1]).any()): continue
            ix, pts = tri_texels(uvl[list(t.loops)], co[vi], size)
            if ix is None: continue
            if weight: np.maximum.at(mask, ix, weight(pts))
            else: mask[ix] = 1.0
            n += len(ix)
        return n
    # the slit: face-skin edges with one skin face that border the mouth's sheet or end the skin inside the mouth's box
    bm = bmesh.new(); bm.from_mesh(me)
    mv = np.array([v.co[:] for f in bm.faces if f.material_index in mouth for v in f.verts])
    lo, hi = mv.min(0) - 0.003, mv.max(0) + 0.003
    inbox = lambda v: (np.array(v.co[:]) >= lo).all() and (np.array(v.co[:]) <= hi).all()
    segs = []
    for e in bm.edges:
        fs = e.link_faces
        if sum(f.material_index in skin for f in fs) != 1: continue
        if not any(f.material_index in mouth for f in fs) and not (len(fs) == 1 and all(inbox(v) for v in e.verts)): continue
        segs.append((e.verts[0].co[:], e.verts[1].co[:]))
    bm.free()
    if not segs: rep['mouth'] = None; print('MOUTH no slit'); return lip, inner
    A = np.array([s[0] for s in segs]); B = np.array([s[1] for s in segs]); AB = B - A; L2 = np.maximum((AB * AB).sum(1), 1e-12)
    ends = np.concatenate([A, B]); cx = (ends[:, 0].min() + ends[:, 0].max()) / 2; hw = (ends[:, 0].max() - ends[:, 0].min()) / 2
    width = 2 * hw

    def lip_weight(P, up, down):
        t = np.clip(((P[:, None, :] - A[None]) * AB[None]).sum(2) / L2[None], 0, 1)
        Q = A[None] + t[..., None] * AB[None]
        d2 = ((P[:, None, :] - Q) ** 2).sum(2); k = d2.argmin(1)
        q = Q[np.arange(len(P)), k]; d = np.sqrt(d2[np.arange(len(P)), k])
        R = np.where(P[:, 2] > q[:, 2], up, down)
        band = 1 - smoothstep(0.25, 1.0, d / R)
        along = 1 - smoothstep(0.55, 1.0, np.abs(P[:, 0] - cx) / hw)
        return (band * along).astype(np.float32)
    k = MOUTH[MOUTH_KIND]
    up, down = (min(f * width, mx) for f, mx in (k['up'], k['down']))       # metres
    reach = max(up, down) + 0.002
    near = (np.array([cx - hw - reach, lo[1] - reach, lo[2] - reach]), np.array([cx + hw + reach, hi[1] + reach, hi[2] + reach]))
    raster(skin, lip, lambda P: lip_weight(P, up, down), near)
    ni = raster(mouth, inner)
    # the inside's bake margin (4 px around the sheet) darkened with it, where no other sheet's triangles are
    other = np.zeros(size * size, np.float32)
    ilo, ihi = uvl[[li for t in tris if t.material_index in mouth for li in t.loops]].min(0) - 6 / size, uvl[[li for t in tris if t.material_index in mouth for li in t.loops]].max(0) + 6 / size
    for t in tris:
        if t.material_index in mouth: continue
        U3 = uvl[list(t.loops)]
        if (U3.max(0) < ilo).any() or (U3.min(0) > ihi).any(): continue
        ix, _ = tri_texels(U3, co[list(t.vertices)], size)
        if ix is not None: other[ix] = 1
    g = inner.reshape(size, size).copy()
    for _ in range(4):
        h = g.copy()
        h[1:] = np.maximum(h[1:], g[:-1]); h[:-1] = np.maximum(h[:-1], g[1:]); h[:, 1:] = np.maximum(h[:, 1:], g[:, :-1]); h[:, :-1] = np.maximum(h[:, :-1], g[:, 1:])
        g = h
    inner = np.where(other > 0, inner, g.ravel()).astype(np.float32)
    rep['mouth'] = {'widthMm': round(width * 1000, 1), 'lipUpMm': round(up * 1000, 1), 'lipDownMm': round(down * 1000, 1), 'slitEdges': len(segs), 'lipTexels': int((lip > 0.05).sum()), 'insideTexels': ni}
    LAST_ATLAS.update(rep)
    print('MOUTH', json.dumps(rep))
    return lip, inner


def mouth_look(c, lip, inner, kind, k=None):
    """The atlas's pixels (n x 4, sRGB 0..1) with the lips tinted and the inside darkened for this kind ('girl' / 'boy') or
    measuring variant (MOUTH_VARIANTS name: the kind's strengths scaled)."""
    m = MOUTH[MOUTH_KIND] if kind in MOUTH_VARIANTS else MOUTH[kind]
    s = MOUTH_VARIANTS.get(kind, {'lip': 1, 'inner': 1})
    T = np.array(m['tint'], np.float32)
    wl = np.clip(lip * m['lip'] * s['lip'], 0, 1)[:, None]
    c[:, :3] *= 1 - wl * (1 - T[None])
    rgb = c[:, :3]; lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32); sat = rgb.max(1) - rgb.min(1)
    teeth = smoothstep(0.55, 0.75, lum) * (1 - smoothstep(0.12, 0.25, sat))
    wi = np.clip(inner * m['inner'] * s['inner'], 0, 0.9) * (1 - teeth)
    c[:, :3] *= (1 - wi)[:, None]
    return c


def save_png(px, size, path):
    img = bpy.data.images.new(os.path.basename(path), size, size, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(px, np.float32).ravel())
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)


def build_atlas(o, size, face_boost, out_png):
    me = o.data
    src = me.uv_layers[0].name
    atlas = me.uv_layers.new(name='atlas')
    me.uv_layers.active = atlas
    info = [find_source(s.material) for s in o.material_slots]
    if os.environ.get('VROID_DEBUG'):
        for (img, fac, ua), s in zip(info, o.material_slots):
            print('SRC', s.material.name, img.name if img else None, img.size[:] if img else None, [round(x, 3) for x in fac], ua)
    # each island in source texels: u by the source picture's width, v by its height, so a texel stays square in the atlas
    # (a 1024 x 256 brow / eye-line / lash sheet scaled by sqrt(w * h) both ways came out 4 : 1, the 1024 x 512 eyes 2 : 1)
    scale = []
    for (img, fac, _), s in zip(info, o.material_slots):
        w, h = (img.size[0], img.size[1]) if img and img.size[0] else (102.4, 102.4)
        n = s.material.name
        boost = face_boost if any(k in n for k in ('_FACE', '_EYE', 'Face_00_SKIN')) else 1.0
        scale.append((w / 1024 * boost, h / 1024 * boost))
    # Each material on a tile of its own (u + 8 x its slot), so islands of one material that read the same part of its
    # picture can share their texels (merge_overlap) and two materials never do: nam-2's 83 hair cards each read the whole
    # hair sheet and took ~85 % of his atlas as ~170 copies of it, his face skin 112 x 112 texels.
    uv = atlas.data
    for p in me.polygons:
        kx, ky = scale[p.material_index]
        off = 8.0 * p.material_index
        for li in p.loop_indices: uv[li].uv = (uv[li].uv.x * kx + off, uv[li].uv.y * ky)
    select_only([o])
    # The packer corrects islands for the aspect of their material's picture (the boys' first slot is the 1024 x 256 brow
    # sheet): an island it turned 90 deg came back squashed by that aspect squared, the boys' face skin 16 : 1 in a strip
    # 60 texels wide, with 36-45 % of the atlas left empty (2026-11-28, face-speech-motion faces-at-distance.md). One
    # picture-less material on every slot while packing: no correction, the islands keep the square texels set above.
    keep = [s.material for s in o.material_slots]
    plain = bpy.data.materials.new('pack_plain')
    for s in o.material_slots: s.material = plain
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    # (into the 0..1 square: the default puts each island in the UDIM tile nearest to it, the material tiles above)
    bpy.ops.uv.pack_islands(udim_source='ACTIVE_UDIM', rotate=True, scale=True, margin=0.006, merge_overlap=True, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    for s, m in zip(o.material_slots, keep): s.material = m
    bpy.data.materials.remove(plain)
    U = np.array([l.uv[:] for l in o.data.uv_layers['atlas'].data])
    assert U.min() > -0.01 and U.max() < 1.01, f'atlas UVs outside the picture: {U.min(0)} .. {U.max(0)}'
    # the mouth's two masks (lips, inside), read off the source materials before the bake replaces them
    lip, inner = mouth_masks(o, size, [m.name for m in keep])
    # bake: each source material as emission (colour, then alpha) into the atlas
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 4
    sc.render.bake.margin = 4; sc.render.bake.use_clear = True; sc.render.bake.target = 'IMAGE_TEXTURES'
    col = bpy.data.images.new('bakeC', size, size, alpha=False)
    alp = bpy.data.images.new('bakeA', size, size, alpha=False); alp.colorspace_settings.name = 'Non-Color'
    passes = {'c': [], 'a': []}

    def bake_mat(img, fac, ua, which):
        """A fresh material that emits the source's colour ('c') or alpha ('a'), with the atlas target active."""
        m = bpy.data.materials.new(f'bake_{which}'); m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes): nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(em.outputs[0], out.inputs['Surface'])
        rgb = nt.nodes.new('ShaderNodeRGB'); rgb.outputs[0].default_value = fac[:3] + (1,)
        val = nt.nodes.new('ShaderNodeValue'); val.outputs[0].default_value = fac[3]
        if img:
            uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = src
            tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Linear'
            nt.links.new(uvn.outputs[0], tex.inputs[0])
            mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
            nt.links.new(tex.outputs['Color'], mul.inputs[6]); nt.links.new(rgb.outputs[0], mul.inputs[7])
            c_out = mul.outputs[2]
            if ua:
                ma = nt.nodes.new('ShaderNodeMath'); ma.operation = 'MULTIPLY'
                nt.links.new(tex.outputs['Alpha'], ma.inputs[0]); nt.links.new(val.outputs[0], ma.inputs[1])
                a_out = ma.outputs[0]
            else: a_out = val.outputs[0]
        else:
            c_out, a_out = rgb.outputs[0], val.outputs[0]
        nt.links.new(c_out if which == 'c' else a_out, em.inputs['Color'])
        tgt = nt.nodes.new('ShaderNodeTexImage'); tgt.image = col if which == 'c' else alp
        nt.nodes.active = tgt
        return m
    for (img, fac, ua), s in zip(info, o.material_slots):
        for w in passes: passes[w].append(bake_mat(img, fac, ua, w))
    select_only([o])
    # (one bake per material set: re-wiring a material between two bakes is not picked up)
    for w in ('c', 'a'):
        for i, m in enumerate(passes[w]): o.material_slots[i].material = m
        bpy.context.view_layer.update()
        bpy.ops.object.bake(type='EMIT')
    c = np.array(col.pixels[:], dtype=np.float32).reshape(-1, 4)
    a = np.array(alp.pixels[:], dtype=np.float32).reshape(-1, 4)
    c[:, 3] = np.clip(a[:, 0], 0, 1)
    if os.environ.get('VROID_DEBUG'):
        su, au = me.uv_layers[src].data, me.uv_layers['atlas'].data
        cache = {}
        for (img, fac, ua), s in zip(info, o.material_slots):
            if not img: continue
            if img.name not in cache: cache[img.name] = np.array(img.pixels[:], np.float32).reshape(img.size[1], img.size[0], 4)
            px = cache[img.name]
            polys = [p for p in me.polygons if o.material_slots[p.material_index] == s][:2]
            for p in polys:
                li = p.loop_indices[0]
                u, v = su[li].uv; x, y = atlas_uv = au[li].uv
                sp = px[int(v % 1 * img.size[1]) % img.size[1], int(u % 1 * img.size[0]) % img.size[0]]
                bp = c.reshape(size, size, 4)[min(int(y * size), size - 1), min(int(x * size), size - 1)]
                print('PIX', s.material.name[-14:], 'src', (round(u, 3), round(v, 3)), sp.round(2), 'atlas', (round(x, 3), round(y, 3)), bp.round(2))
    if os.environ.get('VROID_MOUTH_VARIANTS'):   # (measuring: each choice written beside the atlas, the atlas left as baked)
        for v in MOUTH_VARIANTS:
            save_png(mouth_look(c.copy(), lip, inner, v), size, out_png.replace('.atlas.png', f'.atlas.{v}.png'))
        save_png(np.repeat(np.stack([lip, inner, np.zeros_like(lip), np.ones_like(lip)], 1), 1, 0), size, out_png.replace('.atlas.png', '.mouthmask.png'))
    elif MOUTH_ON:
        c = mouth_look(c, lip, inner, MOUTH_KIND)
    final = bpy.data.images.new('VRoid atlas', size, size, alpha=True)
    final.pixels = c.ravel().tolist()
    final.filepath_raw = out_png; final.file_format = 'PNG'; final.save()
    # one material
    m = bpy.data.materials.new('VRoid atlas'); m.use_nodes = True
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = final
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.72; bsdf.inputs['Metallic'].default_value = 0.0
    me.materials.clear(); me.materials.append(m)
    for p in me.polygons: p.material_index = 0
    me.uv_layers.remove(me.uv_layers[src])
    return final


def patch_glb(path, extras):
    data = open(path, 'rb').read()
    jl = struct.unpack_from('<I', data, 12)[0]
    js = json.loads(data[20:20 + jl]); rest = data[20 + jl:]
    for m in js.get('materials', []):
        m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.5; m['doubleSided'] = True
        m.setdefault('pbrMetallicRoughness', {})['metallicFactor'] = 0.0
        m['pbrMetallicRoughness']['roughnessFactor'] = 0.72
        m.pop('extensions', None)
    used = set()
    for m in js.get('materials', []): used |= set((m.get('extensions') or {}).keys())
    js.setdefault('asset', {}).setdefault('extras', {}).update(extras)
    for k in ('extensionsUsed', 'extensionsRequired'):
        if k in js: js[k] = [e for e in js[k] if not e.startswith('KHR_materials') or e in used]
        if k in js and not js[k]: del js[k]
    j = json.dumps(js, separators=(',', ':')).encode()
    j += b' ' * ((4 - len(j) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + len(rest)) + struct.pack('<II', len(j), 0x4E4F534A) + j + rest
    open(path, 'wb').write(out)


def run(o, name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ref, rest = import_ref(o['ref'])
    va, meshes = import_vroid(os.path.join(o['src'], f'{name}-mixamo65.glb'))
    parent_of = {b.name: b.parent.name if b.parent else None for b in va.data.bones}
    J = pose_arms_down(va, rest)
    bake_pose_into_meshes(va, meshes)
    face = next(m for m in meshes if m.data.shape_keys)
    rest_tris = sum(tri_count(m) for m in meshes)
    for m in meshes:
        fold_weights(m, parent_of)
        m.modifiers.clear()
    for m in meshes:
        mw = m.matrix_world.copy(); m.parent = None; m.matrix_world = mw
        select_only([m]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.data.objects.remove(va, do_unlink=True)
    for m in meshes:          # one UV set, one name: a join keeps layers by name (others lose their UVs)
        uvs = m.data.uv_layers
        for l in list(uvs)[1:]: uvs.remove(l)
        uvs[0].name = 'UVMap'
    morphs = keep_morphs(face)
    delete_faces(face, lambda f: 'EyeExtra' in (face.material_slots[f.material_index].material.name if face.material_slots else ''))
    rest_parts = [m for m in meshes if m is not face]
    select_only(rest_parts, rest_parts[0]); bpy.ops.object.join() if len(rest_parts) > 1 else None
    body = bpy.context.view_layer.objects.active
    culled = cull_hidden_skin(body)
    face_tris = tri_count(face)
    body_tris = decimate_to(body, max(int(o['tris']) - face_tris, 1500))
    for p in body.data.polygons: p.use_smooth = True
    select_only([face, body], face); bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active; obj.name = 'Body'; obj.data.name = 'Body'
    os.makedirs(o['out'], exist_ok=True)
    stem = o['name'] or name
    globals()['MOUTH_KIND'] = 'boy' if name.startswith('nam-') else 'girl'      # (the mouth's tint: MOUTH)
    build_atlas(obj, int(o['atlas']), float(o['face']), os.path.join(o['work'], f'{stem}{o["suffix"]}.atlas.png'))
    # rig
    sc = J['Hips'].z / rest['hips']['head'].z
    rebuild_rig(ref, rest, J, sc)
    scale_hip_keys(sc)
    for a in list(bpy.data.actions):
        if a.name not in CLIPS: bpy.data.actions.remove(a)
    obj.parent = ref
    mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = ref
    path = os.path.join(o['out'], f'{stem}{o["suffix"]}.glb')
    select_only([ref, obj], ref)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_normals=True, export_tangents=False, export_cameras=False, export_lights=False, export_materials='EXPORT',
        export_image_format='WEBP', export_image_quality=90, export_vertex_color='NONE',
        export_skins=True, export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_optimize_animation_size=True, export_reset_pose_bones=True, export_def_bones=False,
        export_frame_range=False, export_extras=True, export_morph=True, export_morph_normal=False, export_try_sparse_sk=True)
    dims = obj.dimensions
    patch_glb(path, {'source': f'VRoid Project sample character ({name}), VRoid Hub licence: anyone, commercial use, '
                               'modification and redistribution allowed; credit "VRoid Project"',
                     'generator': 'art/blender/vroid_lite.py', 'walkScale': round(sc, 4)})
    rep = {'name': stem, 'src': name, 'srcTris': rest_tris, 'tris': tri_count(obj), 'faceTris': face_tris, 'bodyTris': body_tris,
           'culledSkin': culled, 'verts': len(obj.data.vertices), 'bones': len(ref.data.bones), 'morphs': morphs,
           'atlas': int(o['atlas']), 'bytes': os.path.getsize(path), 'height': round(dims.z, 3), 'hips': round(J['Hips'].z, 3),
           'walkScale': round(sc, 4), 'clips': sorted(a.name for a in bpy.data.actions)}
    print('VROID', json.dumps(rep))
    return rep


if __name__ == '__main__':
    o = cli()
    reps = [run(o, n) for n in o['names'].split(',')]
    rp = os.path.join(o['work'], 'report.json')
    old = json.load(open(rp)) if os.path.exists(rp) else {}
    old.update({r['name']: r for r in reps})
    json.dump(old, open(rp, 'w'), indent=1)
