"""Starline rural tricks (docs/RURAL-TRICKS.md, Phase 1): held props and the trick-card icon scenes.

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_tricks.py [-- --only glass-jar,bug-net]
blender -b --factory-startup --python art/blender/build_tricks.py -- --icons
    -> .tools/review/trick-scenes/trick-*.glb (review-only scenes), then render them with
       render_icons.py -- --models .tools/review/trick-scenes trick-firefly trick-river trick-stars trick-frogs

The frogs and the firefly live in build_critters.py. Conventions as build_critters.py (real size, colour
painted into COLOR_0 over baked AO, <= 3 materials, small budgets), z up:
  glass-jar  14 cm mason jar, cloth lid with air holes tied with string. Origin at the centre of the base,
             up +Z (three +Y). Node 'Inside' (empty at the jar's centre) for the runtime's firefly glows.
  bug-net    1.1 m bamboo handle + hoop and a gauzy net bag. Origin at the GRIP (0.15 m above the butt),
             handle along +Z (three +Y), hoop at the far end in the XZ plane, the bag hangs toward +Y
             (three -Z). Node 'Hoop' (empty at the hoop centre) for catch tests.
Grip rotations for Mika's grip_R: see "Rural tricks" in art/CONTRACTS.md.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *  # noqa: F401,F403
from kit import ROOT
from animal_kit import tri_count, lerp
from build_critters import paint, bake_paint, fan, V, Xv, Yv, Zv
from mathutils import Matrix

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ALL = ['glass-jar', 'bug-net']
ONLY = ALL
if '--only' in ARGV:
    ONLY = [n.strip() for n in ARGV[ARGV.index('--only') + 1].split(',') if n.strip()]
BUDGET = {'glass-jar': 300, 'bug-net': 300}
SCENES = os.path.join(ROOT, '.tools', 'review', 'trick-scenes')


def finish_static(name, parts, root_name, empties=(), ao=None, out_dir=None, budget=None):
    """AO (on the joined parts) x Paint into COLOR_0, export with the empties parented to the root."""
    for o in parts:
        if 'Paint' not in o.data.color_attributes:
            paint(o, 1.0)
    root = join(parts, root_name)
    bake_ao([root], **(ao or dict(rays=32, distance=.05, strength=.5)))
    bake_paint(root)
    for e in empties:
        set_parent(e, root)
    info = export(name, [root], out_dir=out_dir)
    if budget:
        assert info['tris'] <= budget, f'{name}: {info["tris"]} tris > {budget}'
        assert info['materials'] <= 3, f'{name}: {info["materials"]} materials'
    return info

# ====================================================================== GLASS JAR


def jar_parts(glow=False):
    """Mason jar, 14 cm: clear glass body with a shoulder and a threaded neck, a warm red cloth cap
    with five dark air holes, tied with a cream string. Origin at the base centre."""
    glass = mat('Jar glass', '#bfeaff', rough=.05, alpha=.22, emit=.06, emit_color='#eaf8ff')
    cloth = mat('Jar cloth', '#ea5a3a', rough=.8, double=True)
    string = mat('Jar string', '#f6e2ae', rough=.7)
    parts = []
    body = lathe('Jar glass', [(0, .0015), (.030, 0), (.0365, .004), (.0385, .014), (.0385, .086), (.034, .100),
                               (.0265, .108), (.0255, .118)], glass, seg=10, smooth_angle=70)
    paint(body, lambda co: 1.0 if co.z > .006 else .8)
    parts.append(body)
    # cloth cap: a soft dome over the mouth with a skirt that flares and ripples below the string
    prof = [(0, .1265), (.016, .1255), (.0265, .1215), (.0285, .1150), (.0370, .1010)]
    cap = lathe('Jar cloth', prof, cloth, seg=10, smooth_angle=80)
    for v in cap.data.vertices:
        if v.co.z < .107:
            a = math.atan2(v.co.y, v.co.x)
            v.co.z += .0035 * math.sin(5 * a)
            v.co.x *= 1 + .08 * math.cos(5 * a)
            v.co.y *= 1 + .08 * math.cos(5 * a)
    paint(cap, lambda co: (1.0, .96, .9) if co.z > .124 else (.9 if co.z < .11 else 1.0))
    parts.append(cap)
    # air holes: little dark discs on the dome (poked with a skewer)
    for k, (r, a) in enumerate(((0, 0), (.0095, 20), (.0095, 110), (.0095, 200), (.0095, 290))):
        c = Vector((r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), 0))
        c.z = .1265 - (.0010 if r else 0) + .0004
        ring = [c + Vector((math.cos(TAU * i / 4), math.sin(TAU * i / 4), 0)) * .0028 for i in range(4)]
        h = fan(f'Jar hole {k}', c, ring, cloth, up=Zv)
        paint(h, .12)
        parts.append(h)
    tie = torus('Jar string', .0300, .0024, (0, 0, .1140), string, maj=10, mn=3)
    paint(tie, 1.0)
    parts.append(tie)
    if glow:
        lum = mat('Firefly glow', '#d8ff3a', emit=1.4, emit_color='#c8ff2a')
        for k, p in enumerate(((.012, .006, .030), (-.014, -.004, .052), (.004, -.016, .070), (-.006, .014, .088),
                               (.016, -.010, .084), (-.016, .010, .026), (.002, .004, .046))):
            parts.append(sphere(f'Glow {k}', .0042, p, lum, seg=6, rings=4))
    return parts


def build_glass_jar(out_dir=None):
    reset()
    parts = jar_parts()
    print('glass-jar', tri_count(parts), 'tris before export')
    inside = empty('Inside', (0, 0, .058))
    return finish_static('glass-jar', parts, 'glass_jar', [inside], dict(rays=32, distance=.04, strength=.45),
                         out_dir, BUDGET['glass-jar'])

# ====================================================================== BUG NET


def build_bug_net():
    """Mika's bug net: a 1.1 m bamboo handle (nodes painted as darker bands), a bamboo hoop 0.30 m across
    lashed on with cord, and a gauzy white net bag (translucent, double-sided)."""
    reset()
    bamboo = mat('Net bamboo', '#e3bc5c', rough=.55)
    gauze = mat('Net mesh', '#ffffff', rough=.9, alpha=.5, double=True, emit=.1)
    cord = mat('Net cord', '#3b8d6a', rough=.7)
    BUTT, TOP, R = -.15, .95, .15
    parts = []
    pts = [V(0, 0, BUTT + (TOP - BUTT) * t / 4) for t in range(5)]
    handle = tube('Net handle', pts, .0115, bamboo, verts=6, caps=True,
                  radius_fn=lambda t: lerp(1.0, .78, t))
    node_z = [p.z for p in pts[1:-1]]
    paint(handle, lambda co: .62 if any(abs(co.z - z) < .004 for z in node_z) else (1.0 if co.x > -.004 else .86))
    parts.append(handle)
    # grip wrap where the hand goes (origin): green cord, also lashing the hoop on
    wrap = cyl('Net grip', .0135, .13, (0, 0, -.01), cord, verts=6)
    paint(wrap, lambda co: .78 if int((co.z + 1) / .013) % 2 else 1.0)
    parts.append(wrap)
    hoop_c = V(0, 0, TOP + R)
    hoop = torus('Net hoop', R, .0065, hoop_c, bamboo, maj=14, mn=3, rot=(math.radians(90), 0, 0))
    paint(hoop, .95)
    parts.append(hoop)
    lash = cyl('Net lash', .0145, .05, (0, 0, TOP - .01), cord, verts=6, cap=False)
    paint(lash, .9)
    parts.append(lash)
    # net bag: hoop ring -> two rings -> rounded tip, hanging toward +Y
    bm = bmesh.new()
    n = 14
    rings = []
    for depth, rr in ((0.0, R * .98), (.11, R * .86), (.24, R * .52)):
        rings.append([bm.verts.new(hoop_c + Vector((math.cos(TAU * i / n) * rr, depth, math.sin(TAU * i / n) * rr)))
                      for i in range(n)])
    tip = bm.verts.new(hoop_c + Vector((0, .36, -.03)))
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    for i in range(n):
        bm.faces.new((rings[-1][i], rings[-1][(i + 1) % n], tip))
    for v in rings[1] + rings[2] + [tip]:                       # the bag sags under gravity (-Z)
        v.co.z -= .045 * (v.co.y - hoop_c.y) / .36 * 2.2
    net = from_bmesh('Net mesh', bm, gauze, smooth_angle=80)
    paint(net, lambda co: .82 if (co.y - hoop_c.y) < .02 else 1.0)
    parts.append(net)
    print('bug-net', tri_count(parts), 'tris before export')
    hoop_e = empty('Hoop', tuple(hoop_c))
    return finish_static('bug-net', parts, 'bug_net', [hoop_e], dict(rays=32, distance=.08, strength=.45),
                         None, BUDGET['bug-net'])

# ====================================================================== TRICK ICON SCENES (review-only GLBs)


def scene_firefly():
    reset()
    finish_static('trick-firefly', jar_parts(glow=True), 'trick_firefly', ao=dict(rays=24, distance=.04, strength=.4),
                  out_dir=SCENES)


def koi(name, at, yaw, pitch, scale):
    """A tiny leaping koi seen from the side: a tapered white body with orange saddle patches (painted), a forked
    tail, a dorsal and a pectoral fin, a dark eye. Local head toward -Y, back up +Z."""
    white = mat('Koi', '#fff4e6', rough=.3, double=True)
    s = scale
    body = sphere(name, (.019 * s, .056 * s, .024 * s), (0, 0, 0), white, seg=10, rings=7)
    for v in body.data.vertices:                      # taper toward the tail, a blunt round head
        t = max(0.0, v.co.y / (.056 * s))
        v.co.x *= 1 - .62 * t
        v.co.z *= 1 - .5 * t
    orange = (1.0, .42, .08)

    def coat(co):
        l = body.matrix_world.inverted() @ co
        u = l.y / (.056 * s)
        if l.z > -.004 * s and (u < -.45 or -.12 < u < .38 or u > .7):
            return orange
        return 1.0
    obs = [body]
    y0 = .05 * s
    for k, zz in enumerate((1, -1)):                  # forked tail
        t_ = fan(f'{name} tail {k}', Vector((0, y0 - .008 * s, 0)),
                 [Vector((0, y0 - .008 * s, 0)), Vector((0, y0 + .034 * s, zz * .034 * s)),
                  Vector((0, y0 + .03 * s, zz * .012 * s)), Vector((0, y0 + .012 * s, 0))], white, up=Xv)
        obs.append(t_)
    obs.append(fan(name + ' dorsal', Vector((0, -.004 * s, .02 * s)),
                   [Vector((0, -.022 * s, .02 * s)), Vector((0, -.004 * s, .04 * s)), Vector((0, .022 * s, .03 * s)),
                    Vector((0, .028 * s, .014 * s))], white, up=Xv))
    for sx_ in (1, -1):
        obs.append(fan(f'{name} fin {sx_}', Vector((sx_ * .014 * s, -.02 * s, -.012 * s)),
                       [Vector((sx_ * .014 * s, -.03 * s, -.012 * s)), Vector((sx_ * .03 * s, -.012 * s, -.032 * s)),
                        Vector((sx_ * .018 * s, -.006 * s, -.016 * s))], white, up=Zv))
        obs.append(sphere(f'{name} eye {sx_}', .0048 * s, (sx_ * .0135 * s, -.04 * s, .006 * s), mat('Ink', '#1c1a22'),
                          seg=5, rings=3))
    m = Matrix.Translation(at) @ Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Rotation(math.radians(pitch), 4, 'X')
    for o in obs:
        o.matrix_world = m @ o.matrix_world
    bpy.context.view_layer.update()
    paint(body, coat)
    for o in obs[1:]:
        paint(o, orange if 'tail' in o.name or 'dorsal' in o.name else 1.0)
    return obs


def scene_river():
    """A toro-nagashi paper lantern glowing on dark water, with a koi leaping beside it."""
    reset()
    water = mat('Water', '#2a6fd0', rough=.15)
    wood = mat('Wood', '#9a5a2e', rough=.6)
    paper = mat('Lantern paper', '#ffd58a', rough=.6, emit=3.0, emit_color='#ffb547')
    parts = []
    w = cyl('Water', .17, .012, (0, 0, -.006), water, verts=28)
    paint(w, lambda co: 1.35 if (abs(math.hypot(co.x + .02, co.y - .01) - .085) < .006 or
                                 abs(math.hypot(co.x + .02, co.y - .01) - .13) < .005) else 1.0)
    parts.append(w)
    parts.append(box('Raft', (.11, .11, .016), (0, 0, .008), wood, bevel=.004, segments=1))
    for sx_, sy_ in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        parts.append(box(f'Post {sx_}{sy_}', (.010, .010, .095), (sx_ * .040, sy_ * .040, .062), wood, bevel=.002,
                         segments=1))
    parts.append(box('Paper', (.074, .074, .085), (0, 0, .060), paper, bevel=.002, segments=1))
    parts.append(box('Rim', (.098, .098, .010), (0, 0, .110), wood, bevel=.003, segments=1))
    parts += koi('Koi', Vector((.118, -.06, .07)), -52, 38, 1.55)
    for p in parts:
        if 'Paint' not in p.data.color_attributes:
            paint(p, 1.0)
    finish_static('trick-river', parts, 'trick_river', ao=dict(rays=24, distance=.06, strength=.4), out_dir=SCENES)


def scene_stars():
    """A round night-sky medallion: the Big Dipper picked out in big warm stars, small stars, a hill."""
    reset()
    sky = mat('Sky', '#1a2a6c', rough=.8)
    star = mat('Star', '#ffe27a', emit=1.3, emit_color='#ffd54a')
    hill = mat('Hill', '#2f8a4a', rough=.8)
    parts = []
    disc = cyl('Sky', .16, .02, (0, 0, 0), sky, verts=32, rot=(math.radians(90), 0, 0))
    paint(disc, lambda co: .55 + .45 * min(1.0, max(0.0, (co.z + .16) / .32)))
    parts.append(disc)
    dipper = [(-.098, .060), (-.058, .066), (-.025, .050), (.008, .030), (.020, -.012), (.072, -.010), (.078, .032)]
    lines = []
    for k, (x, z) in enumerate(dipper):
        parts.append(sphere(f'Dipper {k}', .0115 if k != 3 else .0095, (x, -.014, z), star, seg=8, rings=5))
    for a, b in zip(dipper, dipper[1:] + [dipper[3]]):
        lines.append((a, b))
    for k, (a, b) in enumerate(lines):
        ln = rod(f'Line {k}', (a[0], -.012, a[1]), (b[0], -.012, b[1]), .0018, star, verts=4, cap=False)
        parts.append(ln)
    for k, (x, z) in enumerate(((-.12, -.01), (-.06, .12), (.03, .125), (.11, .09), (.125, -.03), (-.03, -.04),
                                (.05, .085), (-.115, .085))):
        parts.append(sphere(f'Small star {k}', .0045, (x, -.012, z), star, seg=5, rings=3))
    h = sphere('Hill', (.17, .03, .06), (0, -.02, -.15), hill, seg=20, rings=8)
    paint(h, lambda co: .75 if co.z < -.11 else 1.0)
    parts.append(h)
    for p in parts:
        if 'Paint' not in p.data.color_attributes:
            paint(p, 1.0)
    finish_static('trick-stars', parts, 'trick_stars', ao=dict(rays=16, distance=.03, strength=.3), out_dir=SCENES)


def scene_frogs():
    """The tree frog mid-croak (sac full) on a lily pad with a pink bud."""
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, 'frog-tree.glb'))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    act = bpy.data.actions['Croak']
    arm.animation_data_create()
    arm.animation_data.action = act
    try:
        arm.animation_data.action_slot = act.slots[0]
    except Exception:
        pass
    bpy.context.scene.frame_set(int(act.frame_range[1] * .45))
    src = next(o for o in bpy.data.objects if o.type == 'MESH' and o.modifiers)
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(src.evaluated_get(deps), depsgraph=deps)
    frog = bpy.data.objects.new('Frog', me)
    bpy.context.scene.collection.objects.link(frog)
    frog.matrix_world = src.matrix_world.copy()
    for o in [o for o in bpy.data.objects if o is not frog]:
        bpy.data.objects.remove(o, do_unlink=True)
    frog.scale = (3.4, 3.4, 3.4)
    frog.location = (.005, .004, .006)
    frog.rotation_euler = (0, 0, math.radians(-20))
    bpy.context.view_layer.update()
    pad_m = mat('Lily pad', '#3fb04a', rough=.5)
    pink = mat('Lotus', '#ff8fb8', rough=.5)
    water = mat('Water', '#2a6fd0', rough=.15)
    ring = []
    for i in range(23):
        a = math.radians(30 + 300 * i / 22)                    # the notch faces +X/-Y
        ring.append(Vector((math.cos(a - math.radians(60)) * .085, math.sin(a - math.radians(60)) * .085, .006)))
    pad = fan('Pad', Vector((0, 0, .007)), [Vector((0, 0, .006))] + ring, pad_m, up=Zv)
    paint(pad, lambda co: .78 if math.hypot(co.x, co.y) < .01 else (.85 if math.hypot(co.x, co.y) > .078 else 1.0))
    w = cyl('Water', .14, .008, (0, 0, -.004), water, verts=28)
    paint(w, lambda co: 1.35 if abs(math.hypot(co.x, co.y) - .115) < .006 else 1.0)
    bud = sphere('Bud', (.016, .016, .026), (.085, .075, .026), pink, seg=8, rings=5)
    paint(bud, lambda co: (1.0, .55, .7) if co.z > .04 else 1.0)
    parts = [pad, w, bud]
    for p in parts:
        if 'Paint' not in p.data.color_attributes:
            paint(p, 1.0)
    pr = join(parts, 'trick_frogs')
    bake_ao([pr], rays=16, distance=.04, strength=.4)
    bake_paint(pr)
    set_parent(frog, pr)
    export('trick-frogs', [pr], out_dir=SCENES)


if '--icons' in ARGV:
    os.makedirs(SCENES, exist_ok=True)
    for fn in (scene_firefly, scene_river, scene_stars, scene_frogs):
        fn()
else:
    for nm in ONLY:
        {'glass-jar': build_glass_jar, 'bug-net': build_bug_net}[nm]()
    if '--no-save' not in ARGV:
        save_kit('tricks', [n for n in ALL if os.path.exists(os.path.join(OUT, n + '.glb'))], spacing=.2)
