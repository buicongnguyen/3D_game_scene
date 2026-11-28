"""Kotone on the full Mixamo skeleton: her light game models and her dance pack, from the VRoid Project sample "nu-2"
(the ktvgo "desktop-mixamo65" GLB, read only) and Mixamo FBX moves (read only).

    blender -b --factory-startup --python art/blender/vroid_mixamo.py -- [--only full,lite,pack] [--out public/models]
        [--src <nu-2-mixamo65.glb>] [--moves <Mixamo FBX folder>] [--clips Idle,Walk] [--member nu-1]

--member <id>: one of the other seven samples (MEMBERS) instead of Kotone, built the same way into vroid-<id>.glb,
vroid-<id>.lite.glb and moves-vroid-<id>.glb (always all three in one run: Blender 5.x's exporter orders the roots by name).

Writes kotone.glb (PC: <= 14k tris, 1024 px atlas), kotone.lite.glb (phone: <= 8k tris, 512 px atlas) and
moves-kotone.glb (her armature, no mesh, the dances and the singing: fetched by the game only for her evening show).
Every file starts from the same import and the same rig step, so the two models and the pack have the same bones in the
same order with the same rest pose (tests/assets.test.mjs checks it).

1. Skeleton. Her source already stands on the Mixamo skeleton (65 bones: three spine bones, collarbones, toes, three
   joints a finger). Those 65 are kept, renamed to the game's names (hips, spine, spine1, chest, neck, head, head_end,
   shoulder_L, upperarm_L, forearm_L, hand_L, thumb1_L..pinky4_L, thigh_L, shin_L, foot_L, toe_L, toe_end_L, ...),
   plus root, grip_R (props) and eye_L / eye_R (gaze, actors/face.js). Her rest pose is the source's T-pose.
2. Weights. Every other source bone (hair, skirt, bust, sleeve helpers, the jaw, the eye mounts) folds into the nearest
   kept bone: hair rides the head, the skirt half on the hips and half on the thigh (a skirt that followed a thigh alone
   would tear between the legs), the sleeves on the arm. Four influences, normalised.
3. Mesh and material: as vroid_lite.py (hidden skin cut, decimated to the target, the face untouched with its three
   morphs blink / mouthA / mouthO plus smile / smileEyes / browUp / wink (add_happy_keys), one baked atlas, one MASK material, one draw).
4. Moves. Each Mixamo FBX is imported and retargeted bone by bone in world space: the target bone turns by the source
   bone's change from ITS rest, applied to the target's rest swung onto the source's rest direction (both are T-poses,
   so that swing is a few degrees: the thumbs, the slightly lower VRoid arms). The hips' travel is scaled by the hip
   heights and any drift across the ground is taken out (the game moves her); a section cut from a long dance gets a
   crossfaded seam so it loops. Only rotations of bones that move and the hips' position are written; the keys are then
   thinned within a fraction of a degree (art/blender/trim_clips.mjs).
"""
import bpy, sys, os, json, math, subprocess
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import vroid_lite as VL                       # mesh, atlas and morph steps (no side effects on import)

P = 'mixamorig:'
FPS = 30

# ------------------------------------------------------------------------------------------------ names
FING = {'Thumb': 'thumb', 'Index': 'index', 'Middle': 'middle', 'Ring': 'ring', 'Pinky': 'pinky'}
MX = {'Hips': 'hips', 'Spine': 'spine', 'Spine1': 'spine1', 'Spine2': 'chest', 'Neck': 'neck', 'Head': 'head', 'HeadTop_End': 'head_end'}
CHILD = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head', 'Head': 'HeadTop_End'}
for S, s in (('Left', 'L'), ('Right', 'R')):
    MX.update({f'{S}Shoulder': f'shoulder_{s}', f'{S}Arm': f'upperarm_{s}', f'{S}ForeArm': f'forearm_{s}', f'{S}Hand': f'hand_{s}',
               f'{S}UpLeg': f'thigh_{s}', f'{S}Leg': f'shin_{s}', f'{S}Foot': f'foot_{s}', f'{S}ToeBase': f'toe_{s}', f'{S}Toe_End': f'toe_end_{s}'})
    CHILD.update({f'{S}Shoulder': f'{S}Arm', f'{S}Arm': f'{S}ForeArm', f'{S}ForeArm': f'{S}Hand', f'{S}Hand': f'{S}HandMiddle1',
                  f'{S}UpLeg': f'{S}Leg', f'{S}Leg': f'{S}Foot', f'{S}Foot': f'{S}ToeBase', f'{S}ToeBase': f'{S}Toe_End'})
    for F, f in FING.items():
        for i in (1, 2, 3, 4): MX[f'{S}Hand{F}{i}'] = f'{f}{i}_{s}'
        for i in (1, 2, 3): CHILD[f'{S}Hand{F}{i}'] = f'{S}Hand{F}{i + 1}'
assert len(MX) == 65
GAME = set(MX.values()) | {'root', 'grip_R', 'eye_L', 'eye_R'}
# the upper body: what a layered clip (SingUpper) moves, leaving the legs and hips to Walk / Run / Idle
UPPER = {b for b in MX.values() if not b.startswith(('hips', 'spine', 'thigh', 'shin', 'foot', 'toe'))} | {'spine1'}

# ------------------------------------------------------------------------------------------------ moves
# (clip name, Mixamo file, options). range: the seconds of the file to keep (a long dance is cut to a loop; its seam is
# crossfaded over `blend` seconds into the frames just before the cut).
MODEL_CLIPS = [
    ('Idle', 'Happy Idle', {}),
    ('Walk', 'Walking', {}),                          # 0.96 m/s at speed 1 (gait.js)
    ('Run', 'Running', {}),                           # 4.08 m/s
    ('Talk', 'Talking (1)', {'range': (0.6, 5.0)}),
    ('Wave', 'Waving (1)', {'repeat': 3}),
    ('Cheer', 'Cheering', {}),
    ('Bow', 'Quick Informal Bow', {}),
    ('LookAround', 'Look Around', {}),
    ('Point', 'Pointing', {}),
]
# the evening show (picked from contact sheets of 20 Mixamo dances: lively, readable from a distance, modest in a short
# skirt; left out: deep bends and squats, twerking, partner dances, travelling ones; Gangnam Style was built and dropped:
# its high knee lifts push the thigh through the short skirt)
PACK_CLIPS = [
    ('DanceHipHop', 'Hip Hop Dancing (3)', {'range': (4.0, 11.0)}),
    ('DanceArms', 'Arms Hip Hop Dance', {'range': (2.0, 9.0)}),
    ('DanceHouse', 'House Dancing', {'range': (2.0, 9.0)}),
    ('DanceRunningMan', 'Dancing Running Man', {'range': (1.0, 8.0)}),
    ('DanceSamba', 'Samba Dancing', {'range': (2.0, 9.0)}),
    ('DanceYmca', 'Ymca Dance', {'range': (1.0, 4.5)}),
    ('DanceWave', 'Dancing (2)', {'range': (2.0, 9.0)}),
    ('Sing', 'Talking (1)', {'range': (5.0, 10.2)}),
    ('SingUpper', 'Talking (1)', {'range': (5.0, 10.2), 'upper': True}),
]
# her height (m, the top of the hair to the soles), or None for the source's own (1.616 m). Owner 2026-11-28: 1.52 was
# tried and taken back (her moves looked wrong to the owner); the source height is kept.
HEIGHT = None
SCALE = None            # (a member's whole-body scale instead of a height: MEMBERS below)
PACK_TOL = 2.4          # the dances' keys are thinned more (1.2 deg body, 4.8 deg fingers): she is seen from a few metres
SOURCE_OF = lambda sid: (f'VRoid Project sample character ({sid}), VRoid Hub licence: anyone, commercial use, modification and '
                         'redistribution allowed; credit "VRoid Project". Moves: Mixamo animations.')
SOURCE = SOURCE_OF('nu-2')
# The other seven VRoid Project samples, built exactly like Kotone for the group performance (game/perform/troupe.js) and
# for later use: `--member nu-1` writes vroid-nu1.glb, vroid-nu1.lite.glb, moves-vroid-nu1.glb. The girls keep the
# source's height (1.60-1.74 m); the boys are scaled to one skull height (1.66 m, the cast's 1.71-1.76 m with hair):
# nam-1 and nam-3 share one body (skull 1.703 m), nam-2 is taller (1.827 m). Scaling is applied in the build, so the rest
# pose, the bones and the hips' travel all follow and the feet stay on the ground.
MEMBERS = {'nam-1': 0.975, 'nam-2': 0.909, 'nam-3': 0.975, 'nu-1': None, 'nu-3': None, 'nu-4': None, 'nu-5': None}
member_stem = lambda sid: 'vroid-' + sid.replace('-', '')


def cli():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'src': 'E:/repo/ktvgo_live/characters/glb/desktop-mixamo65-candidates/nu-2-mixamo65.glb',
         'moves': 'C:/Users/n/source/repos/pitch_intent/new_animation', 'out': os.path.join(REPO, 'public/models'),
         'work': os.path.join(REPO, '.tools/vroid/work'), 'only': 'full,lite,pack', 'name': 'kotone', 'clips': '', 'skirt': '0.5', 'list': '', 'packlist': ''}
    k = None
    for x in a:
        if x.startswith('--'): k = x[2:]
        elif k: o[k] = x; k = None
    if o.get('member'):
        sid = o['member']; assert sid in MEMBERS, f'unknown member {sid} (one of {", ".join(MEMBERS)})'
        o['src'] = o['src'].replace('nu-2-mixamo65', f'{sid}-mixamo65'); o['name'] = member_stem(sid)
        o['work'] = os.path.join(o['work'], o['name'])
    for p in ('src', 'moves', 'out', 'work'): o[p] = os.path.abspath(o[p])
    os.makedirs(o['work'], exist_ok=True); os.makedirs(o['out'], exist_ok=True)
    return o


short = VL.short
select_only = VL.select_only


# ------------------------------------------------------------------------------------------------ skeleton + weights
def import_source(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS; sc.render.fps_base = 1
    va, meshes = VL.import_vroid(path)
    va.name = 'Armature'
    if HEIGHT: fit_height(va, meshes, HEIGHT)
    elif SCALE: fit_height(va, meshes, body_height(meshes) * SCALE)
    else: print('HEIGHT', json.dumps({'source': round(body_height(meshes), 4)}))
    return va, meshes


def body_height(meshes):
    zs = [(m.matrix_world @ Vector(c)).z for m in meshes for c in m.bound_box]
    return max(zs) - min(zs)


def fit_height(va, meshes, height):
    """Scale the whole import (armature, skin, shape keys) so she stands `height` metres tall, and apply it: the rest pose,
    the bones' lengths and the hips' travel (retarget scales it by the hip heights) all follow, so every file agrees."""
    h0 = body_height(meshes); k = height / h0
    va.scale = va.scale * k
    bpy.context.view_layer.update()
    select_only([va] + meshes, va)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.view_layer.update()
    print('HEIGHT', json.dumps({'before': round(h0, 4), 'scale': round(k, 4), 'after': round(body_height(meshes), 4)}))


def fold_target(parent_of, skirt):
    """Source bone -> [(game bone, share)]."""
    cache = {}

    def target(n):
        if n in cache: return cache[n]
        m, t = n, None
        while m:
            if short(m) in MX: t = MX[short(m)]; break
            if m in GAME: t = m; break                  # (a group Blender already renamed with its bone)
            m = parent_of.get(m)
        t = t or 'hips'
        out = [(t, 1.0)]
        if 'Skirt' in n and t.startswith('thigh_'): out = [('hips', skirt), (t, 1 - skirt)]
        cache[n] = out
        return out
    return target


def fold_weights(o, target):
    names = {g.index: g.name for g in o.vertex_groups}
    per = []
    for v in o.data.vertices:
        acc = {}
        for g in v.groups:
            if g.weight <= 0: continue
            for t, f in target(names[g.group]): acc[t] = acc.get(t, 0) + g.weight * f
        top = sorted(acc.items(), key=lambda x: -x[1])[:4]
        s = sum(w for _, w in top) or 1
        per.append([(t, w / s) for t, w in top] or [('hips', 1.0)])
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    groups = {}
    for i, ws in enumerate(per):
        for t, w in ws:
            if t not in groups: groups[t] = o.vertex_groups.new(name=t)
            groups[t].add([i], w, 'REPLACE')


def rebuild_rig(va):
    """Keep the 65 Mixamo bones (renamed), root, eye_L/eye_R; add grip_R in the right palm."""
    select_only([va])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = va.data.edit_bones
    eb[P + 'Hips'].parent = eb['root']
    for s in ('L', 'R'): eb[f'eye_{s}'].parent = eb[P + 'Head']
    keep = {P + k for k in MX} | {'root', 'eye_L', 'eye_R'}
    for b in list(eb):
        if b.name not in keep: eb.remove(b)
    hand, mid = eb[P + 'RightHand'], eb[P + 'RightHandMiddle1']
    g = eb.new('grip_R')
    g.head = hand.head.lerp(mid.head, 0.6)
    g.tail = g.head + (mid.head - hand.head).normalized() * 0.05
    g.roll = hand.roll
    g.parent = hand
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in va.data.bones:
        if b.name.startswith(P): b.name = MX[short(b.name)]
    assert {b.name for b in va.data.bones} == GAME, sorted({b.name for b in va.data.bones} ^ GAME)
    for pb in va.pose.bones: pb.rotation_mode = 'QUATERNION'


# ------------------------------------------------------------------------------------------------ retarget
def wq(m):
    return m.to_3x3().normalized().to_quaternion()


def import_fbx(path):
    before = set(bpy.data.objects); acts = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=False, use_anim=True)
    new = [o for o in bpy.data.objects if o not in before]
    fa = next(o for o in new if o.type == 'ARMATURE')
    return fa, new, [a for a in bpy.data.actions if a not in acts]


def rest_dir(arm, name, child, world):
    b, c = arm.data.bones.get(name), arm.data.bones.get(child) if child else None
    if not b or not c: return None
    return ((world @ c.head_local) - (world @ b.head_local)).normalized()


def retarget(va, fbx_path, opts):
    """-> (frames: [{bone: basis Quaternion}], hips: [basis location], info)."""
    fa, new, acts = import_fbx(fbx_path)
    first = fa.data.bones[0].name
    pre = first.split(':')[0] + ':' if ':' in first else ''
    act = fa.animation_data.action
    sc = bpy.context.scene
    # the FBX importer sets the scene to the file's rate (Mixamo: often 60): sample it at FPS in time, by sub-frames
    sfps = sc.render.fps / sc.render.fps_base
    base = act.frame_range[0]
    f0, f1 = 0, int(round((act.frame_range[1] - base) / sfps * FPS))
    sc.render.fps, sc.render.fps_base = FPS, 1
    Wf = fa.matrix_world.copy(); Sw = wq(Wf)
    tb = va.data.bones
    src = {MX[k]: pre + k for k in MX if pre + k in fa.data.bones}
    rev = {v: k for k, v in MX.items()}
    RsW, RtW = {}, {}
    for t, s in src.items():
        RsW[t] = Sw @ wq(fa.data.bones[s].matrix_local)
        m = rev[t]
        ds = rest_dir(fa, s, pre + CHILD[m] if m in CHILD else None, Wf)
        dt = rest_dir(va, t, MX[CHILD[m]] if m in CHILD else None, Matrix())
        swing = dt.rotation_difference(ds) if ds and dt else Quaternion()
        RtW[t] = swing @ wq(tb[t].matrix_local)          # her rest swung onto the source's rest direction
    restRel = {b.name: (wq(b.parent.matrix_local).inverted() @ wq(b.matrix_local)) if b.parent else wq(b.matrix_local) for b in tb}
    hs_rest = Wf @ fa.data.bones[pre + 'Hips'].head_local
    k = tb['hips'].head_local.z / hs_rest.z
    a0, a1 = f0, f1
    if 'range' in opts:
        a0 = f0 + int(round(opts['range'][0] * FPS)); a1 = min(f1, f0 + int(round(opts['range'][1] * FPS)))
    blend = int(round(opts.get('blend', 0.5) * FPS)) if 'range' in opts else 0
    lo = max(f0, a0 - blend)
    blend = a0 - lo
    raw = {}

    def fill(b, posed):
        if b.name in posed: return posed[b.name]
        q = (fill(b.parent, posed) @ restRel[b.name]) if b.parent else wq(b.matrix_local)
        posed[b.name] = q
        return q
    for f in range(lo, a1 + 1):
        x = base + f * sfps / FPS
        sc.frame_set(int(x), subframe=x - int(x))
        posed = {t: Sw @ wq(fa.pose.bones[s].matrix) @ RsW[t].inverted() @ RtW[t] for t, s in src.items()}
        for b in tb: fill(b, posed)
        rot = {}
        for t in src:
            b = tb[t]
            pq = posed[b.parent.name] if b.parent else Quaternion()
            rot[t] = (restRel[t].inverted() @ pq.inverted() @ posed[t]).normalized()
        hp = Wf @ fa.pose.bones[pre + 'Hips'].head
        raw[f] = (rot, (hp - hs_rest) * k)
    sc.render.fps, sc.render.fps_base = FPS, 1
    keys = list(range(a0, a1 + 1))
    d0, d1 = raw[a0][1], raw[a1][1]
    n = max(1, a1 - a0)
    flat = {}
    for f in raw:
        d = raw[f][1] - d0.lerp(d1, (f - a0) / n)          # (frames before a0 extrapolate the same drift)
        flat[f] = Vector((d.x, d.y, raw[f][1].z))
    mx = sum(flat[f].x for f in keys) / len(keys); my = sum(flat[f].y for f in keys) / len(keys)
    for f in flat: flat[f] = Vector((flat[f].x - mx, flat[f].y - my, flat[f].z))
    drift = (d1 - d0); drift.z = 0
    frames, hips = [], []
    for f in keys:
        rot, loc = raw[f][0], flat[f]
        if blend and f > a1 - blend:
            w = (f - (a1 - blend)) / blend
            w = w * w * (3 - 2 * w)
            g = a0 - (a1 - f)
            rot = {b: rot[b].slerp(raw[g][0][b], w) for b in rot}
            loc = loc.lerp(flat[g], w)
        frames.append(rot); hips.append(loc)
    if opts.get('repeat'):                          # a short gesture played a few times over (its first frame = its last)
        frames = frames[:-1] * (opts['repeat'] - 1) + frames; hips = hips[:-1] * (opts['repeat'] - 1) + hips
    M = tb['hips'].matrix_local.to_3x3().inverted()
    hips = [M @ v for v in hips]
    for o in new:
        try: bpy.data.objects.remove(o, do_unlink=True)
        except ReferenceError: pass
    for a in acts: bpy.data.actions.remove(a)
    info = {'file': os.path.basename(fbx_path), 'frames': len(frames), 'sec': round((len(frames) - 1) / FPS, 3),
            'from': round((a0 - f0) / FPS, 2), 'to': round((a1 - f0) / FPS, 2), 'driftM': round(drift.length, 3)}
    return frames, hips, info


def action_curves(act):
    out = []
    try:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags: out += list(cb.fcurves)
    except AttributeError:
        pass
    return out or list(act.fcurves)


def set_curve(fc, values):
    fc.keyframe_points.clear()
    fc.keyframe_points.add(len(values))
    fc.keyframe_points.foreach_set('co', [c for j, v in enumerate(values) for c in (j + 1, v)])
    for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
    fc.update()


def write_action(va, name, frames, hips, upper=False):
    """One action: rotations of the bones that move (any key > 0.05 deg off rest) and the hips' location. upper: the upper
    body only (from spine1 up, no hips), to lay over Walk / Run / Idle as a second action (see the pack's SingUpper)."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    va.animation_data_create()
    va.animation_data.action = act
    moving = [b for b in frames[0] if (not upper or b in UPPER) and max(2 * math.degrees(math.acos(min(1, abs(fr[b].w)))) for fr in frames) > 0.05]
    pbs = va.pose.bones
    for b in moving:
        pbs[b].rotation_quaternion = frames[0][b]
        pbs[b].keyframe_insert('rotation_quaternion', frame=1)
    if not upper:
        pbs['hips'].location = hips[0]
        pbs['hips'].keyframe_insert('location', frame=1)
    curves = {(fc.data_path, fc.array_index): fc for fc in action_curves(act)}
    for b in moving:
        prev, qs = None, []
        for fr in frames:
            q = fr[b].copy()
            if prev is not None and prev.dot(q) < 0: q.negate()
            qs.append(q); prev = q
        for i in range(4): set_curve(curves[(f'pose.bones["{b}"].rotation_quaternion', i)], [q[i] for q in qs])
    for i in range(3 if not upper else 0): set_curve(curves[('pose.bones["hips"].location', i)], [v[i] for v in hips])
    act.frame_range = (1, len(frames))
    act.use_frame_range = True
    for pb in pbs: pb.rotation_quaternion = Quaternion(); pb.location = Vector()
    return act, moving


def foot_stats(va, act, n):
    """Ground speed implied by the planted feet (m/s: their backward slide in her own frame; she faces -Y) and the slip
    left at that speed. A foot within 1.5 cm of its lowest point counts as planted."""
    va.animation_data.action = act
    sc = bpy.context.scene
    pos = {'L': [], 'R': []}
    for f in range(1, n + 1):
        sc.frame_set(f)
        for s in pos: pos[s].append((va.matrix_world @ va.pose.bones[f'foot_{s}'].head).copy())
    speeds = []
    for ps in pos.values():
        low = min(p.z for p in ps)
        for i in range(1, n):
            if ps[i].z < low + 0.015 and ps[i - 1].z < low + 0.015: speeds.append((ps[i].y - ps[i - 1].y) * FPS)
    v = sorted(speeds)[len(speeds) // 2] if speeds else 0
    slip = 0
    for ps in pos.values():
        low = min(p.z for p in ps)
        run = []
        for i in range(n + 1):
            if i < n and ps[i].z < low + 0.015: run.append(Vector((ps[i].x, ps[i].y - v * i / FPS, 0)))
            elif run:
                if len(run) > 2: slip = max(slip, max((p - run[0]).length for p in run))
                run = []
    va.animation_data.action = None
    return round(v, 3), round(slip, 4)


def make_clips(va, L, which, clip_filter):
    info = {}
    for name, fname, opt in L:
        if clip_filter and name not in clip_filter: continue
        fr, hp, inf = retarget(va, os.path.join(MOVES, fname + '.fbx'), opt)
        act, moving = write_action(va, name, fr, hp, upper=opt.get('upper', False))
        inf['bones'] = len(moving); inf['set'] = which
        if name.startswith(('Walk', 'Run', 'Fem')): inf['speed'], inf['slip'] = foot_stats(va, act, len(fr))
        info[name] = inf
        print('CLIP', name, json.dumps(inf))
    va.animation_data.action = None
    bpy.context.scene.frame_set(1)
    return info


# ------------------------------------------------------------------------------------------------ build
# Two happy shapes from each sample's own VRoid expressions (owner 2026-11-28: "all the faces look a little sad"):
#   smile      the closed-mouth smile with the brows lifted a little (Fcl_MTH_Fun x1 + Fcl_BRW_Fun x0.9, mixed into one key)
#   smileEyes  the eye smile (Fcl_EYE_Joy: the lower lids up into a "^^" at 1; actors/face.js keeps it to a soft 0.15-0.4)
#   browUp     a lively brow lift (Fcl_BRW_Surprised; face.js pulses it to ~0.5 on a phrase's start now and then)
#   wink       her right eye's smile closed (Fcl_EYE_Joy_R; a playful wink after a chorus line now and then)
# The look follows the Avatar Studio anime girls' singing face (its src/sing-expression.js: a soft Duchenne smile, eyes
# narrowing with it, brow lifts on phrase starts). Mouth shapes stay their own keys (mouthA / mouthO): actors/face.js
# lowers the smile while the mouth opens wide.
HAPPY_MIX = {'smile': {'Fcl_MTH_Fun': 1.0, 'Fcl_BRW_Fun': 0.9}}
HAPPY_COPY = {'Fcl_EYE_Joy': 'smileEyes', 'Fcl_BRW_Surprised': 'browUp', 'Fcl_EYE_Joy_R': 'wink'}


def add_happy_keys(face):
    keys = face.data.shape_keys.key_blocks
    find = lambda suffix: next((k for k in keys if k.name.endswith(suffix)), None)
    for name, parts in HAPPY_MIX.items():
        for k in keys: k.value = 0
        got = [find(s) for s in parts]
        assert all(got), f'{face.name}: missing {[s for s, k in zip(parts, got) if not k]}'
        for k, w in zip(got, parts.values()): k.value = w
        face.shape_key_add(name=f'happy_{name}', from_mix=True)
        for k in keys: k.value = 0
        VL.MORPHS[f'happy_{name}'] = name
    for src, dst in HAPPY_COPY.items():
        assert find(src), f'{face.name}: missing {src}'
        VL.MORPHS[src] = dst


def build_mesh(o, va, meshes, tris, atlas, stem, parent_of):
    target = fold_target(parent_of, float(o['skirt']))
    face = next(m for m in meshes if m.data.shape_keys)
    src_tris = sum(VL.tri_count(m) for m in meshes)
    for m in meshes:
        fold_weights(m, target)
        m.modifiers.clear()
    for m in meshes:
        mw = m.matrix_world.copy(); m.parent = None; m.matrix_world = mw
        select_only([m]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for m in meshes:          # one UV set, one name: a join keeps layers by name (others lose their UVs)
        uvs = m.data.uv_layers
        for l in list(uvs)[1:]: uvs.remove(l)
        uvs[0].name = 'UVMap'
    add_happy_keys(face)
    morphs = VL.keep_morphs(face)
    VL.delete_faces(face, lambda f: 'EyeExtra' in (face.material_slots[f.material_index].material.name if face.material_slots else ''))
    rest = [m for m in meshes if m is not face]
    select_only(rest, rest[0]); bpy.ops.object.join() if len(rest) > 1 else None
    body = bpy.context.view_layer.objects.active
    culled = VL.cull_hidden_skin(body)
    face_tris = VL.tri_count(face)
    VL.decimate_to(body, max(tris - face_tris, 1500))
    for p in body.data.polygons: p.use_smooth = True
    select_only([face, body], face); bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active; obj.name = 'Body'; obj.data.name = 'Body'
    VL.build_atlas(obj, atlas, 1.2, os.path.join(o['work'], f'{stem}.atlas.png'))
    return obj, {'srcTris': src_tris, 'faceTris': face_tris, 'culledSkin': culled, 'morphs': morphs}


def export(path, objs, active):
    select_only(objs, active)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_normals=True, export_tangents=False, export_cameras=False, export_lights=False, export_materials='EXPORT',
        export_image_format='WEBP', export_image_quality=90, export_vertex_color='NONE',
        export_skins=True, export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_optimize_animation_size=True, export_reset_pose_bones=True, export_def_bones=False,
        export_frame_range=False, export_extras=True, export_morph=True, export_morph_normal=False, export_try_sparse_sk=True)


def trim(path, k=1.0):
    """Thin the keys and drop the tracks that do nothing (art/blender/trim_clips.mjs, run with node)."""
    r = subprocess.run(['node', os.path.join(HERE, 'trim_clips.mjs'), path, str(k)], capture_output=True, text=True, cwd=REPO)
    if r.returncode: print(r.stdout, r.stderr)
    assert r.returncode == 0, 'trim_clips.mjs failed'
    return json.loads(r.stdout.strip().splitlines()[-1])


def run(o):
    only = set(o['only'].split(','))
    flt = set(o['clips'].split(',')) if o['clips'] else None
    report, clips = {}, {}
    for kind, tris, atlas, suffix in (('full', 14000, 1024, ''), ('lite', 8000, 512, '.lite'), ('pack', 0, 0, '')):
        if kind not in only: continue
        va, meshes = import_source(o['src'])
        parent_of = {b.name: b.parent.name if b.parent else None for b in va.data.bones}     # (the source's, before the rig step)
        rebuild_rig(va)
        extras = {'source': SOURCE, 'generator': 'art/blender/vroid_mixamo.py'}
        if kind == 'pack':
            for m in meshes: bpy.data.objects.remove(m, do_unlink=True)
            info = make_clips(va, PACK_CLIPS, 'pack', flt)
            path = os.path.join(o['out'], f'moves-{o["name"]}.glb')
            export(path, [va], va)
            stem = f'moves-{o["name"]}'
            rep = {'bones': len(va.data.bones)}
        else:
            stem = o['name'] + suffix
            obj, rep = build_mesh(o, va, meshes, tris, atlas, stem, parent_of)
            obj.parent = va
            mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = va
            info = make_clips(va, MODEL_CLIPS, 'model', flt)
            path = os.path.join(o['out'], f'{stem}.glb')
            export(path, [va, obj], va)
            rep.update({'tris': VL.tri_count(obj), 'bones': len(va.data.bones)})
            speed = {n: info[n]['speed'] for n in ('Walk', 'Run') if n in info}
            extras['gait'] = speed
        VL.patch_glb(path, extras) if kind != 'pack' else patch_extras(path, extras)
        rep['rawBytesBeforeTrim'] = os.path.getsize(path)
        rep['trim'] = trim(path, PACK_TOL if kind == 'pack' else 1.0)
        rep['bytes'] = os.path.getsize(path)
        report[stem] = rep
        clips.update(info)
        print('BUILT', stem, json.dumps(rep))
    rp = os.path.join(o['work'], 'mixamo-report.json')
    old = json.load(open(rp)) if os.path.exists(rp) else {}
    old.update(report); old.setdefault('clips', {}).update(clips)
    json.dump(old, open(rp, 'w'), indent=1)


def patch_extras(path, extras):
    """asset.extras of a file without materials (the pack): the same GLB rewrite as VL.patch_glb, extras only."""
    import struct
    data = open(path, 'rb').read()
    jl = struct.unpack_from('<I', data, 12)[0]
    js = json.loads(data[20:20 + jl]); rest = data[20 + jl:]
    js.setdefault('asset', {}).setdefault('extras', {}).update(extras)
    j = json.dumps(js, separators=(',', ':')).encode()
    j += b' ' * ((4 - len(j) % 4) % 4)
    open(path, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + len(rest)) + struct.pack('<II', len(j), 0x4E4F534A) + j + rest)


if __name__ == '__main__':
    O = cli()
    MOVES = O['moves']
    if O.get('member'): SCALE = MEMBERS[O['member']]; SOURCE = SOURCE_OF(O['member'])
    if O['packlist']: PACK_CLIPS = [tuple(x) for x in json.load(open(O['packlist']))]
    if O['list']: MODEL_CLIPS = [tuple(x) for x in json.load(open(O['list']))]     # (trying other moves: [[name, file, opts], ...])
    run(O)
