"""The dance game's performers on the graceful body (graceful.py), with swappable outfits (outfits.py).

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_performers.py -- [--only nabi,haru] [--out DIR]
      [--review] [--no-lite-src]

Each performer is one GLB in public/models: the armature (the people's skeleton + finger and hair bones), a 'Body'
mesh (head, face, hair, neck, hands) and one mesh per wardrobe part ('Top_crop', 'Bottom_skirtS', 'Shoes_sneakers',
'Hat_cap' ...), every one skinned to the same bones, plus the clips. The runtime shows one look at a time
(src/engine/wardrobe.js, looks in src/content/performers.js). --review also writes a copy with every check clip
(swim, ride, kneel ...) to .tools/review/models for the clip sheets.
"""
import sys, os, math, time, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector, Matrix, Quaternion
from kit import reset, mat, OUT, ROOT, bake_ao, ensure_color, glb_summary
from rig import export_rigged
from human_lib import *
from char_parts import Face, nose, ears, hair_cap, lock_path, make_armature
from garments import face_tints, dense, ring_band
import graceful as G
import outfits as O
import anims
import dance_anims as DA
import player_anims as PA
import ground_anims as GA

STANDARD = ['Idle', 'Walk', 'Run', 'Talk', 'Wave', 'Cheer', 'Bow']
REVIEW = ['Sit', 'SitGrass', 'Kneel', 'Crouch', 'CrouchWalk', 'Pickup', 'RideCow', 'Swim', 'Tread', 'Interact', 'Carry']


def clip_extras(sets):
    def fn(A):
        t = DA.extras(A, sets)
        t.update(Sit=lambda: PA.sit(A), RideCow=lambda: PA.ride_cow(A), Swim=lambda: PA.swim(A), Tread=lambda: PA.tread(A),
                 Interact=lambda: PA.interact(A), Carry=lambda: PA.carry(A))
        t.update(GA.extras(A))
        return t
    return fn


def performer_clips(arm, b, who, sets, own, style, review=False):
    """Author the standard clips, the performer's dance set(s) and (review) every check clip on this rig."""
    st = dict(style)
    st.update(idle_hands=DA.idle_grace, post=DA.finger_post)
    names = STANDARD + own + (REVIEW if review else [])
    return anims.humanoid_clips(arm, b, who, names, extra=clip_extras(sets), **st)

V = Vector
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    if name in ARGS:
        i = ARGS.index(name)
        return ARGS[i + 1] if i + 1 < len(ARGS) and not ARGS[i + 1].startswith('--') else True
    return default


ORDER = ['nabi', 'haru', 'byeol', 'hoa']
ONLY = [s.strip() for s in str(arg('--only', ','.join(ORDER))).split(',') if s.strip()]
OUT_DIR = os.path.join(ROOT, arg('--out')) if arg('--out') else OUT
AO = dict(rays=64, distance=0.22, strength=0.6, ground=0.0)


# ------------------------------------------------------------------------------------------------ shared pieces

def materials(colors):
    """Role materials: {'Skin': ('#hex', rough[, metal])}. Returns the dict keyed by role name and short keys."""
    M = {}
    for name, spec in colors.items():
        c, r = spec[0], spec[1]
        metal = spec[2] if len(spec) > 2 else 0.0
        M[name] = mat(name, c, r, metal)
    M['skin'] = M['Skin']
    M['hair'] = M['Hair']
    M['eye'] = M['Eye white']
    M['iris'] = M['Iris']
    M['dark'] = M['Dark']
    M['lash'] = M['Dark']
    return M


def tag(parts_regions):
    """[(part, region)] -> parts with an integer 'region' attribute the shape morphs read (shapes.py)."""
    import shapes
    out = []
    for p, r in parts_regions:
        shapes.tag(p, r)
        out.append(p)
    return out


def skin_group(parts, arm, name, occluders=(), ao=AO):
    """Join weighted parts into one skinned mesh object under the armature (AO baked with the occluders present)."""
    from kit import join
    parts = [p for p in parts if p is not None]
    for p in parts:
        if not p.vertex_groups:
            raise ValueError(f'part {p.name} has no bone weights')
    mesh = join(parts, name)
    bake_ao([mesh], extra_occluders=[o for o in occluders if o is not None and o is not mesh], **ao)
    ensure_color([mesh])
    bpy.context.view_layer.update()
    w = mesh.matrix_world.copy()
    mesh.parent = arm
    mesh.matrix_parent_inverse = arm.matrix_world.inverted()
    mesh.matrix_world = w
    mod = mesh.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    return mesh


def export_glb(path, arm, meshes, sampled=False):
    """Export the armature, the given meshes and every action. sampled=False writes only the keyed channels (rotations,
    and the hips' location): no constant translation / scale tracks, so the runtime may set bone scales and offsets
    (the body-shape controls, src/engine/wardrobe.js) without a clip overwriting them."""
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.selected_objects:
        o.select_set(False)
    objs = [arm] + list(meshes)
    for o in objs:
        o.select_set(True)
    ensure_color([o for o in meshes])
    if arm.animation_data:
        arm.animation_data.action = None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True,
        export_apply=False, export_vertex_color='ACTIVE', export_all_vertex_colors=False,
        export_normals=True, export_cameras=False, export_lights=False, export_materials='EXPORT',
        export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=sampled, export_optimize_animation_size=True, export_reset_pose_bones=True,
        export_def_bones=False, export_frame_range=False, export_extras=True, export_morph=True,
        export_morph_normal=False, export_try_sparse_sk=True)
    info = glb_summary(path)
    print(f'EXPORTED {os.path.basename(path)}: {info["tris"]} tris, {info["materials"]} materials, {info["bytes"] // 1024} KB')
    return info


def finish_performer(name, b, hd, body, wardrobe, default, sets, own, style, review=False, blush=0.7, blush_col=(1.0, 0.64, 0.62),
                     lips=0.85, body_fn=None):
    """Skin the body and every wardrobe part to one armature, bake AO (each part with the body and the default look
    present), tint the face and hair, write the body-shape keys, author the clips and export the GLB (and the default
    look as one mesh for light_people.py)."""
    import shapes
    built = {k: tag(fn()) for k, fn in wardrobe.items()}
    G.finish(b)
    arm = make_armature(name.capitalize(), b)
    meshes = {'Body': skin_group(body, arm, 'Body', ao=AO)}
    defaults = [k for k in default if k in built]
    for k in defaults:
        meshes[k] = skin_group(built[k], arm, k, occluders=[meshes['Body']])
    for k, parts in built.items():
        if k not in meshes:
            meshes[k] = skin_group(parts, arm, k, occluders=[meshes['Body']])
    for ob in meshes.values():
        warm_skin(ob)
    face_tints(meshes['Body'], hd, 1.0, blush=blush, blush_col=blush_col, radius=0.03, az=40)
    lip_tint(meshes['Body'], hd, amount=lips)
    hair_gloss(meshes['Body'], hd)
    made = {}
    for k, ob in meshes.items():
        made[k] = shapes.add(ob, b)
    print('  shape keys:', {k: v for k, v in made.items() if v})
    performer_clips(arm, b, name, sets, own, style, review)
    order = ['Body'] + sorted(k for k in meshes if k != 'Body')
    info = export_glb(os.path.join(OUT_DIR, name + '.glb'), arm, [meshes[k] for k in order])
    info['parts'] = {k: sum(len(p.vertices) - 2 for p in meshes[k].data.polygons) for k in order}
    # the default look alone (full resolution) for the dialogue portrait (art/blender/performer_portraits.py)
    export_glb(os.path.join(ROOT, '.tools', 'portrait-src', name + '.glb'), arm, [meshes[k] for k in ['Body'] + sorted(defaults)])
    if not arg('--no-lite-src'):
        # the default look as one mesh for the light version, rebuilt at a lower resolution (fewer sides round every
        # tube, fewer rings, fewer samples along each lock) on the same armature, with the same clips
        from kit import join
        with lowres():
            lhd, lbody = body_fn() if body_fn else (hd, body)
            lparts = list(lbody)
            for k in sorted(defaults):          # (the order the standard file lists the parts: its palette order)
                lparts += tag(wardrobe[k]())
        for p in lparts:
            p.parent = None
        lite = skin_group(lparts, arm, name + '_lite', ao=dict(AO, rays=32))
        warm_skin(lite)
        face_tints(lite, lhd, 1.0, blush=blush, blush_col=blush_col, radius=0.03, az=40)
        lip_tint(lite, lhd, amount=lips)
        hair_gloss(lite, lhd)
        lite.name = name
        export_glb(os.path.join(ROOT, '.tools', 'lite-src', name + '.glb'), arm, [lite])
        bpy.data.objects.remove(lite, do_unlink=True)
    print('  parts (tris):', info['parts'])
    return info


class lowres:
    """Within the block every tube, ring loft, lock and head the builders make is made at about half the resolution."""
    F = 0.5

    def __enter__(self):
        import human_lib, char_parts, garments
        F = self.F
        self.saved = []

        def patch(mod, name, fn):
            self.saved.append((mod, name, getattr(mod, name)))
            setattr(mod, name, fn)
        sw0, lk0, tr0, hd0 = human_lib.sweep, human_lib.lock, garments.torso_rings, char_parts.Head

        def sweep_lo(mb, points, m, *a, n=12, **k):
            pts = list(points)
            if len(pts) > 6:
                pts = resample(pts, max(4, int(len(pts) * F + 0.5)))
            return sw0(mb, pts, m, *a, n=max(5, int(n * 0.6 + 0.5)), **k)

        def lock_lo(mb, path, m, width, thick, head_c, n=8, samples=10, **k):
            return lk0(mb, path, m, width, thick, head_c, n=max(5, int(n * 0.6 + 0.5)), samples=max(4, int(samples * 0.55 + 0.5)), **k)

        def rings_lo(keys, n=28, zs=None, *a, **k):
            if zs and len(zs) > 6:
                zs = zs[::2] + ([zs[-1]] if (len(zs) - 1) % 2 else [])
            return tr0(keys, max(12, int(n * F + 0.5)), zs, *a, **k)

        def head_lo(center, sdf, m, seg=32, rings=24):
            return hd0(center, sdf, m, seg=max(20, int(seg * 0.6)), rings=max(14, int(rings * 0.6)))
        for mod in (G, O, sys.modules[__name__]):
            if hasattr(mod, 'sweep'):
                patch(mod, 'sweep', sweep_lo)
            if hasattr(mod, 'lock'):
                patch(mod, 'lock', lock_lo)
            if hasattr(mod, 'torso_rings'):
                patch(mod, 'torso_rings', rings_lo)
            if hasattr(mod, 'Head'):
                patch(mod, 'Head', head_lo)
        import npcs
        patch(npcs, 'cap_crown', npcs.cap_crown)
        return self

    def __exit__(self, *exc):
        for mod, name, fn in reversed(self.saved):
            setattr(mod, name, fn)
        return False


def face_kit(b, hd, M, eyes=None, mouth=None, brows=True):
    s = b.head_scale
    f = Face(hd, M, s=s)
    ek = dict(az=24, el=-6, w=0.0245, h=0.0285, lashes=3, brow=M['hair'] if brows else None, brow_el=10, brow_arch=0.0055,
              brow_w=0.0042, brow_len=1.02, tilt=3, iris_w=0.83, iris_h=1.0, iris_dv=0.07, pupil=(0.36, 0.46), top=0.84,
              lid_w=0.0068, highlight=1.25)
    ek.update(eyes or {})
    f.eyes(**ek)
    mk = dict(el=-25, w=0.016, smile=0.0055, open_=0.006, m=M['dark'])
    mk.update(mouth or {})
    f.mouth(**mk)
    parts = [weigh(f.build(), 'head')]
    parts.append(weigh(nose(hd, M['skin'], el=-14, size=(0.0082, 0.0085, 0.0105), off=-0.0058, seg=12, s=s), 'head'))
    parts.append(weigh(ears(hd, M['skin'], el=-8, s=s * 0.98), 'head'))
    return parts


def lip_tint(body, hd, el=-25.5, col=(1.0, 0.72, 0.74), w=0.014, h=0.007, amount=0.85):
    """Rosy lips: the skin round the mouth line warmed toward rose in a soft oval (no extra material)."""
    p = hd.pt(0, el)
    up = V((0, 0, 1))

    def fn(co, n):
        d = co - p
        e = (d.x / w) ** 2 + (d.z / h) ** 2 + (d.y / 0.02) ** 2
        k = math.exp(-e) * amount
        if k < 0.02:
            return None
        return (1 - k * (1 - col[0]), 1 - k * (1 - col[1]), 1 - k * (1 - col[2]))
    tint(body, fn, {'Skin'})


def warm_skin(ob, k=(0.9, 0.84, 0.8)):
    """Skin under the game's bright sky and tone mapping: a warm multiplier on the skin's shading (ambient occlusion
    stays), so fair skin reads peachy and luminous instead of grey-pink (the village cast's skin sits at ~0.65 of its
    colour through their heavier occlusion; this brings the performers into the same warm range)."""
    tint(ob, lambda co, n: k, {'Skin'})
    smooth_colors(ob, 2, {'Skin'}, amount=0.5)


def hair_gloss(body, hd, k=1.0, band_el=38, width=13):
    """Glossy hair: the AO multiplier is lowered a little everywhere but in a soft ring round the crown (the 'angel
    ring' highlight a light from above draws on shiny hair). Colour is the material's; this only shades it."""
    c = hd.c

    def fn(co, n):
        d = co - c
        r = d.length
        if r < 1e-6:
            return None
        el = math.degrees(math.asin(max(-1, min(1, d.z / r))))
        ring_ = math.exp(-((el - band_el) / (width * 0.5)) ** 2)
        side = max(0.0, n.dot(V((0, -0.3, 1)).normalized()) * 0.5 + 0.5)
        v = 0.78 + 0.22 * ring_ * (0.6 + 0.4 * side)
        return (v, v, v)
    tint(body, fn, {'Hair'})


# ------------------------------------------------------------------------------------------------ Nabi

NABI_COLORS = {
    'Skin': ('#f8c4a6', 0.5), 'Hair': ('#4a3029', 0.36), 'Eye white': ('#fbf8f2', 0.12), 'Iris': ('#7b4b2a', 0.16),
    'Dark': ('#2b1f2a', 0.4), 'Hair accent': ('#ff4f9a', 0.45),
    'Top': ('#ff4f9a', 0.42), 'Top trim': ('#f6c344', 0.32, 0.75), 'Inner': ('#fffaf4', 0.6),
    'Bottom': ('#8f73ff', 0.5), 'Bottom trim': ('#f6c344', 0.32, 0.75), 'Legwear': ('#2e3566', 0.55),
    'Shoes': ('#fffaf6', 0.45), 'Shoe sole': ('#ff7ab4', 0.5),
}


def hair_nabi(b, hd, M):
    """A high ponytail tied with a pink ribbon: sleek sides swept up to the tie, side-swept wispy bangs from a parting on
    her left, two long face-framing tendrils."""
    parts = []
    c = hd.c

    def hairline(az):
        a = abs(((az + 180) % 360) - 180)
        return interp([(0, 30), (40, 26), (65, 14), (85, 8), (100, 2), (120, -14), (150, -22), (180, -24)], a)
    parts.append(weigh(hair_cap(hd, M['hair'], hairline, off=0.004, seg=36, rows=10), 'head'))
    lk = MB('locks')
    tie = hd.pt(180, 34, 0.026)
    rnd = random.Random(7)
    # sleek locks from the hairline up to the tie (sides and back), hugging the skull
    for az in [a for a in range(-176, 177, 14) if abs(a) >= 44]:
        el0 = hairline(az) + 4
        tw = 180 if az > 0 else -180
        keys = [(az, el0, 0.003), (lerp(az, tw, 0.18), lerp(el0, 34, 0.42), 0.008), (lerp(az, tw, 0.5), lerp(el0, 34, 0.8), 0.012)]
        pts = lock_path(hd, keys) + [tie + (hd.pt(lerp(az, tw, 0.5), 36, 0.012) - tie) * 0.25]
        lock(lk, pts, M['hair'], 0.05 + rnd.uniform(-0.004, 0.004), 0.009, c, n=10, samples=10, flat_in=0.4,
             wfn=lambda t: 0.92 + 0.08 * math.sin(math.pi * t) - 0.5 * t * t)
    # crown: from the parting back to the tie
    for az in (-44, -28, -12, 4, 20, 46, 60):
        keys = [(30 + (az - 30) * 0.2, 80, 0.004), (az, 66, 0.01), (lerp(az, 180 if az >= 0 else -180, 0.45), 52, 0.013)]
        pts = lock_path(hd, keys) + [tie + V((0, -0.008, 0.006))]
        lock(lk, pts, M['hair'], 0.062, 0.01, c, n=10, samples=10, flat_in=0.4)
    # bangs swept from the parting (az +30) across the forehead toward her right: broad soft strands that overlap, lying
    # close to the forehead, their tips at uneven heights
    part_az = 30
    tips = [(44, 22, 0.058), (30, 18, 0.064), (16, 14, 0.066), (2, 13, 0.066), (-12, 15, 0.064), (-26, 12, 0.06),
            (-40, 6, 0.054), (-54, -4, 0.046)]
    for i, (az, el, w) in enumerate(tips):
        r0 = part_az + rnd.uniform(-4, 4)
        keys = [(r0, 80, 0.004), (lerp(r0, az, 0.45), 66, 0.012), (lerp(r0, az, 0.85), 44, 0.013), (az, el + 12, 0.009),
                (az - 5, el + rnd.uniform(-3, 2), 0.006)]
        lock(lk, lock_path(hd, keys), M['hair'], w, 0.011, c, n=10, samples=12, flat_in=0.55,
             wfn=lambda t: 0.8 + 0.2 * math.sin(math.pi * min(1.0, t * 1.1)) - 0.7 * max(0, t - 0.78) / 0.22)
    # long face-framing tendrils in front of the ears, a soft S down to the chin
    for sx in (1, -1):
        keys = [(sx * 46, 52, 0.006), (sx * 60, 26, 0.014), (sx * 66, -6, 0.018), (sx * 64, -34, 0.02), (sx * 58, -56, 0.016),
                (sx * 54, -70, 0.012)]
        lock(lk, lock_path(hd, keys), M['hair'], 0.026, 0.009, c, n=10, samples=14, flat_in=0.6,
             wfn=lambda t: 0.8 + 0.2 * math.sin(math.pi * t) - 0.75 * max(0, t - 0.72) / 0.28)
    locks = radial_normals(lk.build('locks', angle=180), c + V((0, 0.01, 0.0)), 0.45)
    parts.append(weigh(locks, 'head'))
    # ponytail: six thick locks from the tie, falling to the shoulder blades with a soft S
    pt = MB('ponytail')
    tc = tie + V((0, 0.018, 0.004))
    for i in range(9):
        a = TAU * i / 9 + 0.3
        ln = 1.0 + 0.12 * math.sin(i * 2.3)
        off = V((math.cos(a) * 0.017, 0.0, math.sin(a) * 0.015))
        p0 = tc + off
        p1 = p0 + V((math.cos(a) * 0.024, 0.055, 0.025 + math.sin(a) * 0.012))
        p2 = p1 + V((math.cos(a) * 0.02, 0.04, -0.09 * ln + math.sin(a) * 0.01))
        p3 = p2 + V((math.cos(a) * 0.006, 0.006, -0.12 * ln))
        p4 = p3 + V((-math.cos(a) * 0.012, -0.016, -0.08 * ln))
        lock(pt, [p0, p1, p2, p3, p4], M['hair'], 0.048, 0.026, tc + V((0, 0.1, -0.12)), n=10, samples=14, flat_in=0.8,
             wfn=lambda t: 0.85 + 0.25 * math.sin(math.pi * min(1, t * 1.3)) - 0.8 * max(0, t - 0.7) / 0.3,
             out_fn=lambda q, a=a: V((math.cos(a), 0.3, math.sin(a))))
    pt_ob = radial_normals(pt.build('ponytail', angle=180), tc + V((0, 0.06, -0.12)), 0.45)
    b.extra += [('hair_1', tuple(tc + V((0, 0.01, 0))), tuple(tc + V((0, 0.07, -0.08))), 'head'),
                ('hair_2', tuple(tc + V((0, 0.07, -0.08))), tuple(tc + V((0, 0.07, -0.28))), 'hair_1')]

    def tail_w(co):
        t = (tc.z - co.z) / 0.28
        if co.y < tc.y - 0.005 and co.z > tc.z - 0.02:
            return {'head': 1.0}
        if t < 0.12:
            return blend2('head', 'hair_1', t / 0.12)
        return blend2('hair_1', 'hair_2', (t - 0.3) / 0.35)
    parts.append(weigh(pt_ob, tail_w))
    # the ribbon: a band round the tie, a bow with two loops and two tails
    rb = MB('ribbon')
    sweep(rb, [tc + V((0, -0.012, 0)), tc + V((0, 0.014, 0))], M['Hair accent'], radius=0.021, n=12, cap0='round', cap1='round')
    bc = tc + V((0, 0.006, 0.026))
    ellipsoid(rb, bc, (0.014, 0.012, 0.012), M['Hair accent'], 10, 7)
    for sx in (1, -1):
        ellipsoid(rb, bc + V((sx * 0.03, 0.004, 0.008)), (0.03, 0.01, 0.019), M['Hair accent'], 12, 7,
                  M=Matrix.Rotation(math.radians(sx * -20), 3, 'Y'))
        sweep(rb, [bc + V((sx * 0.008, 0.012, -0.008)), bc + V((sx * 0.02, 0.03, -0.05)), bc + V((sx * 0.026, 0.036, -0.09))],
              M['Hair accent'], rfn=lambda t: (0.012 - 0.002 * t, 0.003), n=8, up_fn=lambda q, T: V((0, 1, 0)), e=3, cap0='round', cap1='flat')
    parts.append(weigh(rb.build('ribbon', angle=60), lambda co: 'head' if co.z > tc.z - 0.03 else blend2('head', 'hair_1', (tc.z - 0.03 - co.z) / 0.04)))
    return parts


def build_nabi(review=False):
    reset()
    M = materials(NABI_COLORS)
    b = G.graceful_body('f')

    def body_fn():
        hd, heads = G.head(b, M)
        heads += face_kit(b, hd, M)
        heads += hair_nabi(b, hd, M)
        return hd, tag([(p, 'head') for p in heads] + [(G.neck(b, M), 'neck')] + [(p, 'hand') for p in G.hands(b, M)])
    hd, body = body_fn()
    wardrobe = {
        'Top_crop': lambda: O.top_crop_jacket(b, M),
        'Top_long': lambda: O.top_long_shirt(b, M),
        'Bottom_skirtS': lambda: O.bottom_skirt_short(b, M),
        'Bottom_trousers': lambda: O.bottom_trousers_wide(b, M),
        'Bottom_skirtL': lambda: O.bottom_skirt_long(b, M),
        'Shoes_sneakers': lambda: O.shoes_sneakers(b, M),
        'Shoes_flats': lambda: O.shoes_flats(b, M),
    }
    return finish_performer('nabi', b, hd, body, wardrobe, ['Top_crop', 'Bottom_skirtS', 'Shoes_sneakers'], ('kpop',), DA.KPOP,
                            G.GRACE, review, blush=0.75, body_fn=body_fn)


# ------------------------------------------------------------------------------------------------ Haru

HARU_COLORS = {
    'Skin': ('#f8c4a6', 0.52), 'Hair': ('#2f2220', 0.38), 'Eye white': ('#fbf8f2', 0.12), 'Iris': ('#5a3a24', 0.16),
    'Dark': ('#272029', 0.42),
    'Top': ('#2f6bff', 0.42), 'Top trim': ('#dfe7f2', 0.3, 0.8), 'Inner': ('#fbfbfb', 0.6),
    'Bottom': ('#2c3040', 0.55), 'Bottom trim': ('#dfe7f2', 0.3, 0.8), 'Legwear': ('#2c3040', 0.55),
    'Shoes': ('#fbfbfb', 0.45), 'Shoe sole': ('#2f6bff', 0.5), 'Hat': ('#2c3040', 0.55), 'Hat trim': ('#dfe7f2', 0.35, 0.6),
}


def hair_haru(b, hd, M):
    """Short layered hair: close sides and back, volume on top, a soft fringe swept to his right from a parting on his left."""
    parts = []
    c = hd.c

    def hairline(az):
        a = abs(((az + 180) % 360) - 180)
        return interp([(0, 28), (35, 26), (60, 18), (85, 8), (105, 0), (130, -10), (160, -16), (180, -18)], a)
    parts.append(weigh(hair_cap(hd, M['hair'], hairline, off=0.005, seg=36, rows=10), 'head'))
    lk = MB('locks')
    rnd = random.Random(21)
    # close-cropped sides and back: short layered locks from the crown ring down to the hairline
    for az in range(-170, 171, 17):
        if abs(az) < 50:
            continue
        el0 = hairline(az)
        keys = [(az + rnd.uniform(-4, 4), 62, 0.016), (az, lerp(62, el0, 0.55), 0.01), (az + rnd.uniform(-3, 3), el0 + 3, 0.005)]
        lock(lk, lock_path(hd, keys), M['hair'], 0.058, 0.011, c, n=10, samples=8, flat_in=0.45,
             wfn=lambda t: 0.85 + 0.15 * math.sin(math.pi * t) - 0.6 * max(0, t - 0.7) / 0.3)
    # the top: longer layered locks from the crown whorl (back, a little to his left) forward, with volume
    whorl = (150, 80)
    for i, az in enumerate(range(-60, 61, 12)):
        keys = [(whorl[0] + az * 0.3, whorl[1], 0.01), (az * 0.8 + 180 * 0.0, 70, 0.02), (az * 0.95, 54, 0.022), (az, 42, 0.018)]
        lock(lk, lock_path(hd, keys), M['hair'], 0.07, 0.016, c, n=10, samples=10, flat_in=0.5,
             wfn=lambda t: 0.8 + 0.2 * math.sin(math.pi * t) - 0.55 * max(0, t - 0.7) / 0.3)
    # the fringe: swept from a parting on his left (az +34) toward his right, tips at the brows
    part_az = 34
    tips = [(40, 26, 0.05), (26, 20, 0.058), (12, 17, 0.062), (-2, 16, 0.062), (-16, 18, 0.06), (-30, 16, 0.056), (-44, 10, 0.05)]
    for (az, el, w) in tips:
        r0 = part_az + rnd.uniform(-4, 4)
        keys = [(r0, 76, 0.01), (lerp(r0, az, 0.45), 64, 0.026), (lerp(r0, az, 0.85), 44, 0.024), (az, el + 9, 0.014), (az - 6, el, 0.008)]
        lock(lk, lock_path(hd, keys), M['hair'], w, 0.014, c, n=10, samples=12, flat_in=0.55,
             wfn=lambda t: 0.8 + 0.2 * math.sin(math.pi * min(1.0, t * 1.1)) - 0.75 * max(0, t - 0.74) / 0.26)
    # sideburns
    for sx in (1, -1):
        keys = [(sx * 70, 30, 0.006), (sx * 76, 10, 0.006), (sx * 78, -4, 0.004)]
        lock(lk, lock_path(hd, keys), M['hair'], 0.03, 0.007, c, n=8, samples=6, flat_in=0.5)
    parts.append(weigh(radial_normals(lk.build('locks', angle=180), c + V((0, 0.0, -0.01)), 0.45), 'head'))
    return parts


def build_haru(review=False):
    reset()
    M = materials(HARU_COLORS)
    b = G.graceful_body('m')

    def body_fn():
        hd, heads = G.head(b, M)
        heads += face_kit(b, hd, M, eyes=dict(w=0.024, h=0.0235, lashes=1, top=0.78, tilt=2, brow_w=0.0062, brow_el=9, brow_arch=0.003,
                                              brow_len=1.08, iris_w=0.84, highlight=1.15, lid_w=0.0072),
                          mouth=dict(w=0.017, smile=0.0042, open_=0.0))
        heads += hair_haru(b, hd, M)
        return hd, tag([(p, 'head') for p in heads] + [(G.neck(b, M), 'neck')] + [(p, 'hand') for p in G.hands(b, M)])
    hd, body = body_fn()
    wardrobe = {
        'Top_jacket': lambda: O.top_crop_jacket(b, M, z_crop=b.hip_z - 0.02, gap=15, inner_bot=b.hip_z - 0.09),
        'Top_long': lambda: O.top_long_shirt(b, M, sleeve=0.44),
        'Top_coat': lambda: O.top_coat(b, M),
        'Bottom_trousers': lambda: O.bottom_trousers_wide(b, M),
        'Shoes_sneakers': lambda: O.shoes_sneakers(b, M),
        'Shoes_boots': lambda: O.shoes_boots(b, M),
        'Hat_cap': lambda: O.hat_cap(b, hd, M),
    }
    return finish_performer('haru', b, hd, body, wardrobe, ['Top_jacket', 'Bottom_trousers', 'Shoes_sneakers', 'Hat_cap'],
                            ('boy',), DA.BOY, G.GRACE_M, review, blush=0.35, lips=0.3, body_fn=body_fn)


# ------------------------------------------------------------------------------------------------ Byeol

BYEOL_COLORS = {
    'Skin': ('#fdd2bb', 0.5), 'Hair': ('#43291f', 0.36), 'Eye white': ('#fbf8f2', 0.12), 'Iris': ('#6b3f2a', 0.16),
    'Dark': ('#2b1f2a', 0.4), 'Hair accent': ('#ffd25e', 0.3, 0.85),
    'Top': ('#5bb8ff', 0.42), 'Top trim': ('#eef2f8', 0.3, 0.85), 'Inner': ('#fffaf6', 0.6),
    'Bottom': ('#c58cff', 0.5), 'Bottom trim': ('#eef2f8', 0.3, 0.85), 'Legwear': ('#f6e6ef', 0.6),
    'Shoes': ('#fdfdfd', 0.42), 'Shoe sole': ('#c9d3e0', 0.4, 0.5),
}


def hair_byeol(b, hd, M):
    """Long soft waves to the middle of the back from a side parting, tucked behind the shoulders, a gold star clip."""
    parts = []
    c = hd.c

    def hairline(az):
        a = abs(((az + 180) % 360) - 180)
        return interp([(0, 30), (40, 26), (70, 6), (95, -14), (130, -24), (180, -28)], a)
    parts.append(weigh(hair_cap(hd, M['hair'], hairline, off=0.006, seg=36, rows=10), 'head'))
    lk, lg = MB('locks'), MB('long')
    rnd = random.Random(33)
    part_az = 26
    # the crown: from the parting outward and down
    for az in list(range(-170, 171, 15)):
        if abs(az - part_az) < 8:
            continue
        side = 1 if az > part_az else -1
        keys = [(part_az + side * 4, 82, 0.008), (lerp(part_az, az, 0.6), 62, 0.018), (az, 36, 0.024), (az, 8, 0.026)]
        lock(lk, lock_path(hd, keys), M['hair'], 0.07, 0.014, c, n=10, samples=10, flat_in=0.45)
    # long waves: from below the crown down the back (az 85..275), each a gentle S ending at mid-back
    nape = hd.c + V((0, 0.06, -0.12))
    for i, az in enumerate([a for a in range(-180, 181, 13) if abs(a) >= 84]):
        ln = 1.0 + 0.08 * math.sin(i * 1.9)
        p0 = hd.pt(az, 10, 0.026)
        d_out = V((p0.x - c.x, p0.y - c.y, 0)).normalized()
        down = V((0, 0, -1))
        w = 0.024 * math.sin(i * 1.3)
        pts = [hd.pt(az, 22, 0.022), p0]
        for k in range(1, 6):
            t = k / 5
            wave = 0.016 * math.sin(t * math.pi * 2.2 + i * 0.7)
            q = p0 + down * (0.32 * ln * t) + d_out * (0.03 + 0.02 * t + wave) + V((0, 0.03 * t, 0))
            q.y = max(q.y, c.y + 0.07 + 0.05 * t)
            pts.append(q)
        lock(lg, pts, M['hair'], 0.062, 0.022, nape, n=8, samples=12, flat_in=0.6,
             wfn=lambda t: 0.9 + 0.1 * math.sin(math.pi * t) - 0.7 * max(0, t - 0.75) / 0.25)
    # side locks tucked behind the ears, ending at the collarbone behind the shoulder line
    for sx in (1, -1):
        for k, az in enumerate((62, 74)):
            keys = [(sx * az, 40, 0.012), (sx * (az + 10), 10, 0.02), (sx * (az + 18), -18, 0.024)]
            pts = lock_path(hd, keys)
            q = pts[-1]
            pts += [q + V((sx * 0.012, 0.03, -0.08)), q + V((sx * 0.018, 0.06, -0.16))]
            lock(lg, pts, M['hair'], 0.05, 0.018, nape, n=10, samples=12, flat_in=0.6,
                 wfn=lambda t: 0.9 + 0.1 * math.sin(math.pi * t) - 0.7 * max(0, t - 0.75) / 0.25)
    # soft side-swept bangs
    for (az, el, w) in [(40, 20, 0.05), (24, 14, 0.058), (8, 12, 0.06), (-8, 12, 0.058), (-24, 10, 0.054), (-40, 2, 0.046)]:
        r0 = part_az + rnd.uniform(-3, 3)
        keys = [(r0, 80, 0.006), (lerp(r0, az, 0.5), 62, 0.016), (lerp(r0, az, 0.9), 40, 0.016), (az, el + 10, 0.01), (az - 5, el, 0.006)]
        lock(lk, lock_path(hd, keys), M['hair'], w, 0.012, c, n=10, samples=12, flat_in=0.55,
             wfn=lambda t: 0.8 + 0.2 * math.sin(math.pi * min(1.0, t * 1.1)) - 0.7 * max(0, t - 0.78) / 0.22)
    parts.append(weigh(radial_normals(lk.build('locks', angle=180), c, 0.45), 'head'))
    b.extra += [('hair_1', tuple(nape + V((0, 0.0, 0.02))), tuple(nape + V((0, 0.04, -0.14))), 'head'),
                ('hair_2', tuple(nape + V((0, 0.04, -0.14))), tuple(nape + V((0, 0.06, -0.3))), 'hair_1')]

    def long_w(co):
        t = (nape.z + 0.02 - co.z) / 0.32
        if t < 0.0:
            return {'head': 1.0}
        if t < 0.35:
            return blend2('head', 'hair_1', t / 0.35)
        return blend2('hair_1', 'hair_2', (t - 0.45) / 0.4)
    parts.append(weigh(radial_normals(lg.build('long', angle=180), nape + V((0, -0.02, 0.0)), 0.4), long_w))
    # the star clip above her left ear
    st = MB('clip')
    sp = hd.pt(64, 30, 0.03)
    sd = hd.dir(64, 30)
    X = sd.cross(V((0, 0, 1))).normalized()
    Y = sd.cross(X).normalized()
    pts = [(0.024 if k % 2 == 0 else 0.011) for k in range(10)]
    top = [sp + (X * math.cos(math.pi / 2 + TAU * k / 10) + Y * math.sin(math.pi / 2 + TAU * k / 10)) * r + sd * 0.006 for k, r in enumerate(pts)]
    bot = [sp + (X * math.cos(math.pi / 2 + TAU * k / 10) + Y * math.sin(math.pi / 2 + TAU * k / 10)) * r * 0.9 - sd * 0.002 for k, r in enumerate(pts)]
    ct, cb = st.vert(sp + sd * 0.012), st.vert(sp - sd * 0.003)
    it = [st.vert(q) for q in top]
    ib = [st.vert(q) for q in bot]
    for k in range(10):
        st.face([it[k], it[(k + 1) % 10], ct], M['Hair accent'], out=sd)
        st.face([ib[k], cb, ib[(k + 1) % 10]], M['Hair accent'], out=-sd)
        st.face([it[k], ib[k], ib[(k + 1) % 10], it[(k + 1) % 10]], M['Hair accent'], inside=sp)
    parts.append(weigh(st.build('clip', flat=True), 'head'))
    return parts


def build_byeol(review=False):
    reset()
    M = materials(BYEOL_COLORS)
    b = G.graceful_body('f')

    def body_fn():
        hd, heads = G.head(b, M, sdf=dict(w=0.91, jaw=0.92, cheek=0.98, chin=0.98, length=0.92))
        heads += face_kit(b, hd, M, eyes=dict(w=0.025, h=0.029, tilt=1, iris_w=0.86, iris_dv=0.06, pupil=(0.34, 0.44), highlight=1.35,
                                              brow_arch=0.0062, brow_el=11), mouth=dict(w=0.0155, smile=0.006, open_=0.007))
        heads += hair_byeol(b, hd, M)
        return hd, tag([(p, 'head') for p in heads] + [(G.neck(b, M), 'neck')] + [(p, 'hand') for p in G.hands(b, M)])
    hd, body = body_fn()
    wardrobe = {
        'Top_coat': lambda: O.top_coat(b, M, n=40),
        'Top_long': lambda: O.top_long_shirt(b, M, sleeve=1.0),
        'Top_crop': lambda: O.top_crop_jacket(b, M),
        'Bottom_skirtL': lambda: O.bottom_skirt_long(b, M),
        'Bottom_skirtS': lambda: O.bottom_skirt_short(b, M),
        'Bottom_trousers': lambda: O.bottom_trousers_wide(b, M),
        'Shoes_boots': lambda: O.shoes_boots(b, M),
        'Shoes_flats': lambda: O.shoes_flats(b, M),
    }
    return finish_performer('byeol', b, hd, body, wardrobe, ['Top_coat', 'Bottom_skirtL', 'Shoes_boots'], ('singer', 'kpop'),
                            DA.SINGER + ['KpopIdle', 'SideL', 'SideR', 'HeartHands', 'CrowdWave'], G.GRACE, review, blush=0.7, body_fn=body_fn)


# ------------------------------------------------------------------------------------------------ Hoa

HOA_COLORS = {
    'Skin': ('#efb68f', 0.5), 'Hair': ('#231a1b', 0.34), 'Eye white': ('#fbf8f2', 0.12), 'Iris': ('#4a3026', 0.16),
    'Dark': ('#261c22', 0.4), 'Hair accent': ('#ff8fb1', 0.45),
    'Top': ('#e8473e', 0.42), 'Top trim': ('#f2c14e', 0.3, 0.8), 'Inner': ('#fff6ea', 0.6),
    'Bottom': ('#fffaf0', 0.5), 'Bottom trim': ('#f2c14e', 0.3, 0.8), 'Legwear': ('#f4dccc', 0.6),
    'Shoes': ('#e8473e', 0.45), 'Shoe sole': ('#f2c14e', 0.4, 0.6),
}


def hair_hoa(b, hd, M):
    """Black hair smoothed back from a side parting into a low bun at the nape, a pink flower pin, two soft strands."""
    parts = []
    c = hd.c

    def hairline(az):
        a = abs(((az + 180) % 360) - 180)
        return interp([(0, 31), (40, 27), (65, 12), (85, 6), (100, 0), (120, -14), (150, -22), (180, -26)], a)
    parts.append(weigh(hair_cap(hd, M['hair'], hairline, off=0.004, seg=36, rows=10), 'head'))
    lk = MB('locks')
    bun = hd.pt(180, -8, 0.05)
    part_az = -22
    for az in [a for a in range(-176, 177, 12)]:
        if abs(az - part_az) < 6:
            continue
        side = 1 if az > part_az else -1
        el0 = hairline(az) + 3
        tw = 180 if az > 0 else -180
        if abs(az) < 70:
            keys = [(part_az + side * 3, 82, 0.003), (lerp(part_az, az, 0.7), 60, 0.007), (az, el0 + 6, 0.008),
                    (lerp(az, tw, 0.35), lerp(el0, -6, 0.6), 0.008)]
        else:
            keys = [(az, el0, 0.003), (lerp(az, tw, 0.3), lerp(el0, -6, 0.5), 0.006)]
        pts = lock_path(hd, keys) + [bun + (hd.pt(lerp(az, tw, 0.6), -2, 0.008) - bun) * 0.4]
        lock(lk, pts, M['hair'], 0.06, 0.008, c, n=10, samples=10, flat_in=0.4,
             wfn=lambda t: 0.95 + 0.05 * math.sin(math.pi * t) - 0.45 * t * t)
    # the bun: a wound coil of thick locks
    d = hd.dir(180, -8)
    X = d.cross(V((0, 0, 1))).normalized()
    Y = d.cross(X).normalized()
    for i in range(8):
        a = TAU * i / 8
        p0 = bun + (X * math.cos(a) + Y * math.sin(a)) * 0.036
        p1 = bun + d * 0.03 + (X * math.cos(a + 1.1) + Y * math.sin(a + 1.1)) * 0.034
        p2 = bun + d * 0.048 + (X * math.cos(a + 2.2) + Y * math.sin(a + 2.2)) * 0.014
        lock(lk, [p0, p1, p2], M['hair'], 0.05, 0.03, bun, n=10, samples=8, flat_in=0.8)
    # two soft strands by the temples
    for sx in (1, -1):
        keys = [(sx * 44, 46, 0.006), (sx * 58, 18, 0.012), (sx * 62, -12, 0.014), (sx * 58, -36, 0.01)]
        lock(lk, lock_path(hd, keys), M['hair'], 0.02, 0.007, c, n=8, samples=10, flat_in=0.6,
             wfn=lambda t: 0.8 + 0.2 * math.sin(math.pi * t) - 0.7 * max(0, t - 0.7) / 0.3)
    parts.append(weigh(radial_normals(lk.build('locks', angle=180), c, 0.45), 'head'))
    # the flower pin beside the bun: five round petals and a gold heart
    fl = MB('flower')
    fc = bun + X * 0.045 + Y * 0.02 + d * 0.02
    fd = (d * 0.6 + X * 0.8).normalized()
    FX = fd.cross(V((0, 0, 1))).normalized()
    FY = fd.cross(FX).normalized()
    for k in range(5):
        a = TAU * k / 5
        ellipsoid(fl, fc + (FX * math.cos(a) + FY * math.sin(a)) * 0.016, (0.012, 0.012, 0.005), M['Hair accent'], 10, 6,
                  M=Matrix((FX, FY, fd)).transposed())
    ellipsoid(fl, fc + fd * 0.004, (0.007, 0.007, 0.005), M['Hair accent'], 8, 6)
    parts.append(weigh(fl.build('flower', angle=60), 'head'))
    return parts


def build_hoa(review=False):
    reset()
    M = materials(HOA_COLORS)
    b = G.graceful_body('f')

    def body_fn():
        hd, heads = G.head(b, M, sdf=dict(w=0.9, jaw=0.92, cheek=0.94, chin=1.0, length=0.95))
        heads += face_kit(b, hd, M, eyes=dict(w=0.0245, h=0.0262, tilt=5, top=0.8, iris_w=0.84, iris_dv=0.08, pupil=(0.38, 0.47),
                                              brow_arch=0.006, brow_el=10, brow_len=1.05), mouth=dict(w=0.0155, smile=0.0058, open_=0.0045))
        heads += hair_hoa(b, hd, M)
        return hd, tag([(p, 'head') for p in heads] + [(G.neck(b, M), 'neck')] + [(p, 'hand') for p in G.hands(b, M)])
    hd, body = body_fn()
    wardrobe = {
        'Top_aodai': lambda: O.top_aodai(b, M),
        'Top_long': lambda: O.top_long_shirt(b, M, sleeve=0.6),
        'Bottom_trousers': lambda: O.bottom_trousers_wide(b, M),
        'Bottom_skirtL': lambda: O.bottom_skirt_long(b, M),
        'Shoes_flats': lambda: O.shoes_flats(b, M),
    }
    return finish_performer('hoa', b, hd, body, wardrobe, ['Top_aodai', 'Bottom_trousers', 'Shoes_flats'], ('festival',),
                            DA.FESTIVAL, G.GRACE, review, blush=0.7, body_fn=body_fn)


BUILDERS = {'nabi': build_nabi, 'haru': build_haru, 'byeol': build_byeol, 'hoa': build_hoa}


def main():
    t0 = time.time()
    res = {}
    for n in ORDER:
        if n in ONLY and n in BUILDERS:
            t = time.time()
            res[n] = BUILDERS[n](review=bool(arg('--review')))
            print(f'BUILT {n} in {time.time() - t:.1f}s')
    print('DONE', {k: (v['tris'], v['bytes'] // 1024) for k, v in res.items()}, f'{time.time() - t0:.1f}s')


if __name__ == '__main__' and not os.environ.get('PERFORMERS_NO_MAIN'):
    main()
