"""Starline rural tricks (docs/RURAL-TRICKS.md, Phase 2): kite, dew webs, sweet potato roast, beetle sap trap.

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_tricks2.py [-- --only beetle-rhino,moth]
    [--review <dir>]   also writes sweet-potato-raw / sweet-potato-roasted there (one variant each, for review renders)
blender -b --factory-startup --python art/blender/build_tricks2.py -- --icons
    -> .tools/review/trick-scenes/trick-{kite,dew,roast,beetles}.glb (review-only scenes), then render them with
       render_icons.py -- --models .tools/review/trick-scenes trick-kite trick-dew trick-roast trick-beetles
       and the item icons with render_icons.py -- beetle-rhino beetle-stag sweet-potato

Conventions as build_critters.py / build_tricks.py (real size, colour painted into COLOR_0 over baked AO,
<= 3 materials, small budgets, z up, creatures face -Y = three +Z, origin on the ground under the body):
  beetle-rhino  7 cm with the horn   Idle (3 s), Walk (loop 0.8 s, ~0.02 m/s)   bones head, antenna_*, leg1..3_*
  beetle-stag   6.5 cm with the jaws same clips; bones head, jaw_L/jaw_R, antenna_*, leg1..3_*
  moth          4 cm span            Idle (3 s: wings folded back in a delta, small flutters), Fly (loop 0.33 s)
  kite-paper    0.58 x 0.74 m diamond + 0.3 m bow tail. Origin at the cross of the two bamboo spars (the bridle
                point), painted face toward -Y (three +Z), up +Z (three +Y), bamboo on the back.
  sweet-potato  17 cm. Two root nodes at the same spot: 'raw' and 'roasted' (broken in two, golden flesh).
  straw-pile    1.05 m mound with a hollow; child node 'embers' (material 'Straw embers') in the hollow.
The dew web is build_critters.py's 'spider-web' (its drops are the child node 'dew').
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *  # noqa: F401,F403
from kit import ROOT
from rig import build_armature, clip, export_rigged
from animal_kit import S, C, pulse, smooth, lerp, tri_count
from build_critters import (paint, bake_paint, fan, wing, stick, ell_patch, rot, Parts, finish, web_parts,
                            V, sx, Xv, Yv, Zv)
from mathutils import Matrix, Quaternion

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ALL = ['beetle-rhino', 'beetle-stag', 'moth', 'kite-paper', 'sweet-potato', 'straw-pile']
ONLY = ALL
if '--only' in ARGV:
    ONLY = [n.strip() for n in ARGV[ARGV.index('--only') + 1].split(',') if n.strip()]
REVIEW = ARGV[ARGV.index('--review') + 1] if '--review' in ARGV else None
BUDGET = {'beetle-rhino': 350, 'beetle-stag': 350, 'moth': 150, 'kite-paper': 200, 'sweet-potato': 200,
          'straw-pile': 300}
SCENES = os.path.join(ROOT, '.tools', 'review', 'trick-scenes')
RESULTS = {}


def tint(target, base):
    """Paint multiplier that turns the material colour `base` into `target` (both sRGB hex)."""
    t, b = srgb(target), srgb(base)
    return tuple(t[k] / max(b[k], 1e-4) for k in range(3))


def polys(name, faces, material, up=None, smooth_angle=80):
    """Loose flat polygons (each a list of points); up flips them to face it."""
    bm = bmesh.new()
    for pts in faces:
        f = bm.faces.new([bm.verts.new(Vector(p)) for p in pts])
        f.normal_update()
        if up is not None and f.normal.dot(up) < 0:
            f.normal_flip()
    return from_bmesh(name, bm, material, smooth_angle=smooth_angle)


def squarish(ob, pw=.7, axes=(0, 1)):
    """Push a sphere toward a rounded box along the given local axes (pw < 1 squares it)."""
    r = [max(abs(v.co[k]) for v in ob.data.vertices) for k in range(3)]
    for v in ob.data.vertices:
        for k in axes:
            u = v.co[k] / r[k]
            v.co[k] = math.copysign(abs(u) ** pw, u) * r[k]
    return ob


def finish_static(name, parts, root_name, children=(), ao=None, out_dir=None, budget=None):
    """AO (on the joined parts) x Paint into COLOR_0; children (already finished) are parented to the root."""
    root = baked(parts, root_name, ao)
    for e in children:
        set_parent(e, root)
    info = export(name, [root], out_dir=out_dir)
    if budget:
        check(name, info, budget)
    return info


def baked(parts, name, ao=None):
    for o in parts:
        if 'Paint' not in o.data.color_attributes:
            paint(o, 1.0)
    ob = join(parts, name)
    bake_ao([ob], **(ao or dict(rays=32, distance=.05, strength=.5)))
    bake_paint(ob)
    return ob


def check(name, info, budget):
    RESULTS[name] = dict(tris=info['tris'], bytes=info['bytes'], mats=info['materials'],
                         clips=info.get('animations', []))
    assert info['tris'] <= budget, f'{name}: {info["tris"]} tris > {budget}'
    assert info['materials'] <= 3, f'{name}: {info["materials"]} materials'

# ====================================================================== BEETLES


def beetle_legs(specs):
    """specs: (hip, knee, foot) for the left side, front to back -> [(bone, side, reach_dir, hip, knee, foot)]."""
    legs = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        for i, (hip, knee, foot) in enumerate(specs):
            hip, knee, foot = sx(hip, s), sx(knee, s), sx(foot, s)
            h = Vector((foot.x - hip.x, foot.y - hip.y, 0)).normalized()
            legs.append((f'leg{i + 1}_{sd}', s, h, hip, knee, foot))
    return legs


def beetle_clips(arm, legs, idle_extra, walk_extra):
    """Idle (3 s): breathing, the head lifts and looks, antennae twitch, three legs shift one after another.
    Walk (loop 0.8 s): the insect tripod gait (front + hind of one side with the middle of the other), each
    rigid leg sweeping +/-13 degrees about its hip; ~0.02 m/s at 1x."""
    group_a = {'leg1_L', 'leg3_L', 'leg2_R'}

    def leg_rot(s, h, yaw, lift):
        return rot((Zv, s * yaw), (h.cross(Zv), lift))

    def twitch(p, ph=0.0):
        return pulse(p, .16 + ph, .035) + pulse(p, .58 + ph, .03) + pulse(p, .66 + ph, .03)

    def antennae(p, amp=1.0):
        return {'antenna_L': (-10 * twitch(p) * amp, 0, 9 * S(p, 1, .1) * amp + 8 * twitch(p)),
                'antenna_R': (-10 * twitch(p, .21) * amp, 0, -9 * S(p, 1, .35) * amp - 8 * twitch(p, .21))}

    ch = {'body@loc': lambda p: (0, 0, .00022 * S(p, 3)),
          'body': lambda p: (.8 * S(p, 3), 0, 1.5 * S(p, 1)),
          'head': lambda p: (2.5 * S(p, 1, .1) - 7 * pulse(p, .45, .09), 0, 4 * S(p, 1, .3))}
    taps = {'leg1_R': .3, 'leg2_L': .62, 'leg3_R': .85}
    for nm, s, h, *_ in legs:
        at = taps.get(nm)
        ch[nm] = (lambda s, h, at: lambda p: leg_rot(s, h, 7 * pulse(p, at, .06) if at else 0,
                                                     20 * pulse(p, at, .06) if at else 0))(s, h, at)
    for b in ('antenna_L', 'antenna_R'):
        ch[b] = (lambda b: lambda p: antennae(p)[b])(b)
    ch.update(idle_extra)
    clip(arm, 'Idle', 90, ch)

    ch = {'body@loc': lambda p: (0, 0, .0004 * C(p, 2)),
          'body': lambda p: (0, 2.2 * S(p, 1), 1.6 * S(p, 1, .25)),
          'head': lambda p: (1.5 * S(p, 2), 0, -2 * S(p, 1, .25))}
    A_ = 13
    for nm, s, h, *_ in legs:
        off = 0 if nm in group_a else .5

        def fn(p, s=s, h=h, off=off):
            ph = (p + off) % 1.0
            if ph < .5:
                yaw, lift = lerp(-A_, A_, ph / .5), 0.0
            else:
                u = (ph - .5) / .5
                yaw, lift = lerp(A_, -A_, smooth(u)), 22 * math.sin(math.pi * u)
            return leg_rot(s, h, yaw, lift)
        ch[nm] = fn
    for b in ('antenna_L', 'antenna_R'):
        ch[b] = (lambda b: lambda p: antennae(p, .6)[b])(b)
    ch.update(walk_extra)
    clip(arm, 'Walk', 24, ch)


def export_bug(name, arm):
    info = export_rigged(name, arm)
    check(name, info, BUDGET[name])
    return info


def build_beetle_rhino():
    """Japanese rhinoceros beetle (kabutomushi, male), 4.6 cm body + horn: a chunky oval. Glossy chestnut wing
    cases with a dark seam, a darker domed thorax shield almost as wide, a small head carrying the thick
    up-curved horn whose tip forks in two and each branch in two again (four tips), a short thorax horn
    above it, six stout dark legs (front pair on the shield, two pairs under the wing cases) and stubby antennae."""
    reset()
    BASE = '#8e3a15'
    shell = mat('Rhino shell', BASE, rough=.38)
    eye_m = mat('Rhino eye', '#17110f', rough=.1)
    A, Ar = V(0, .0100, .0130), (.0128, .0160, .0102)
    T, Tr = V(0, -.0090, .0122), (.0124, .0094, .0090)
    H, Hr = V(0, -.0192, .0092), (.0062, .0052, .0048)
    DARK = tint('#4a1c0e', BASE)
    HORN = tint('#33130a', BASE)

    legs = beetle_legs([(V(.0066, -.0125, .0064), V(.0138, -.0172, .0090), V(.0170, -.0235, .0004)),
                        (V(.0080, -.0005, .0060), V(.0165, .0005, .0088), V(.0205, .0040, .0004)),
                        (V(.0080, .0095, .0060), V(.0150, .0160, .0086), V(.0178, .0238, .0004))])
    bones = [('root', (0, 0, 0), (0, 0, .004), None),
             ('body', (0, .004, .011), (0, -.010, .011), 'root'),
             ('head', (0, -.0160, .0100), (0, -.0240, .0100), 'body')]
    ant = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        ant[sd] = (sx(V(.0036, -.0228, .0086), s), sx(V(.0070, -.0262, .0092), s))
        bones.append((f'antenna_{sd}', ant[sd][0], ant[sd][1], 'head'))
    bones += [(nm, hip, knee, 'body') for nm, s, h, hip, knee, foot in legs]
    arm = build_armature('BeetleRhino', bones)

    P = Parts()
    P.add(sphere('Rhino belly', (.0110, .0205, .0048), V(0, .0030, .0076), shell, seg=6, rings=3), 'body', HORN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        a0, a1 = (2.5, 104) if s > 0 else (-104, -2.5)

        def coat(co):                                     # dark seam and rim, a lighter band where the light catches
            if abs(co.x) < .0013:
                return tint('#3e170c', BASE)
            if co.z < .0085:
                return tint('#5e230f', BASE)
            return 1.0 if co.z < .0205 else tint('#a64a1b', BASE)
        P.add(ell_patch(f'Rhino wing case {sd}', A, Ar, a0, a1, math.radians(28), math.radians(174), 3, 4, shell),
              'body', coat)
    P.add(squarish(sphere('Rhino shield', Tr, T, shell, seg=8, rings=4), .85), 'body',
          lambda co: tint('#6e2a12', BASE) if co.z > .0105 else DARK)
    P.add(sphere('Rhino head', Hr, H, shell, seg=6, rings=3), 'head', DARK)
    # head horn: thick, rises forward and up in a curve, then forks; each prong carries a short outer tine
    F = V(0, -.0372, .0238)
    P.add(stick('Rhino horn', [V(0, -.0222, .0100), V(0, -.0300, .0118), V(0, -.0352, .0172), F], .0028, shell, verts=4,
                taper=.72), 'head', HORN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        mid, tip = sx(V(.0042, -.0388, .0282), s), sx(V(.0056, -.0370, .0322), s)
        P.add(stick(f'Rhino horn prong {sd}', [F - V(0, 0, .0008), mid, tip], .0020, shell, taper=.5), 'head', HORN)
        P.add(stick(f'Rhino horn tine {sd}', [mid, sx(V(.0074, -.0400, .0292), s)], .0016, shell, taper=.4), 'head', HORN)
    # thorax horn: a short blunt spike pointing forward over the head
    P.add(stick('Rhino thorax horn', [V(0, -.0140, .0188), V(0, -.0196, .0222), V(0, -.0232, .0232)], .0024, shell, verts=4,
                taper=.35, caps=True), 'body', HORN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        P.add(sphere(f'Rhino eye {sd}', .0020, sx(V(.0052, -.0206, .0100), s), eye_m, seg=5, rings=3), 'head')
        P.add(stick(f'Rhino antenna {sd}', list(ant[sd]), .0006, shell, taper=2.2), f'antenna_{sd}', HORN)
    for nm, s, h, hip, knee, foot in legs:
        P.add(stick(f'Rhino {nm}', [hip, knee, foot], .0021, shell, taper=.5), nm,
              lambda co: HORN if co.z < .004 else DARK)
    finish('beetle-rhino', arm, P, dict(rays=32, distance=.014, strength=.5, ground=0.0))
    beetle_clips(arm, legs, {}, {})
    export_bug('beetle-rhino', arm)


def build_beetle_stag():
    """Stag beetle (kuwagata, male), 4.3 cm body + jaws: flat and broad, head, shield and wing cases nearly the
    same width and close together. Near-black with a red-brown sheen along the wing cases, a wide square
    head and two big antler jaws that curve inward to pointed tips with one inner tooth each, short elbowed
    antennae and six legs. The jaws ride their own bones (jaw_L, jaw_R)."""
    reset()
    BASE = '#6e3421'
    shell = mat('Stag shell', BASE, rough=.36)
    eye_m = mat('Stag eye', '#120d0c', rough=.1)
    A, Ar = V(0, .0110, .0080), (.0112, .0158, .0056)
    T, Tr = V(0, -.0072, .0078), (.0118, .0068, .0052)
    H, Hr = V(0, -.0160, .0074), (.0102, .0056, .0046)
    BLACK = tint('#2a1712', BASE)
    DEEP = tint('#1c100d', BASE)
    JAW = tint('#4a2014', BASE)

    legs = beetle_legs([(V(.0070, -.0090, .0048), V(.0146, -.0140, .0076), V(.0178, -.0204, .0004)),
                        (V(.0078, .0015, .0046), V(.0170, .0025, .0074), V(.0212, .0062, .0004)),
                        (V(.0076, .0105, .0046), V(.0150, .0172, .0072), V(.0178, .0250, .0004))])
    bones = [('root', (0, 0, 0), (0, 0, .004), None),
             ('body', (0, .004, .008), (0, -.008, .008), 'root'),
             ('head', (0, -.0120, .0076), (0, -.0200, .0076), 'body')]
    jaw, ant = {}, {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        jaw[sd] = [sx(V(.0058, -.0200, .0076), s), sx(V(.0108, -.0270, .0086), s), sx(V(.0104, -.0352, .0092), s),
                   sx(V(.0050, -.0408, .0090), s)]
        ant[sd] = [sx(V(.0090, -.0190, .0082), s), sx(V(.0126, -.0212, .0092), s), sx(V(.0132, -.0246, .0090), s)]
        bones += [(f'jaw_{sd}', jaw[sd][0], jaw[sd][1], 'head'),
                  (f'antenna_{sd}', ant[sd][0], ant[sd][1], 'head')]
    bones += [(nm, hip, knee, 'body') for nm, s, h, hip, knee, foot in legs]
    arm = build_armature('BeetleStag', bones)

    P = Parts()
    P.add(sphere('Stag belly', (.0098, .0196, .0032), V(0, .0040, .0054), shell, seg=6, rings=3), 'body', DEEP)
    for s, sd in ((1, 'L'), (-1, 'R')):
        a0, a1 = (3, 102) if s > 0 else (-102, -3)

        def coat(co):                                     # near-black with a warm brown sheen along each case
            if abs(co.x) < .0012 or co.z < .0060:
                return DEEP
            return tint('#7c3d23', BASE) if .0030 < abs(co.x) < .0086 and co.z > .0112 else tint('#3a2019', BASE)
        P.add(ell_patch(f'Stag wing case {sd}', A, Ar, a0, a1, math.radians(26), math.radians(174), 3, 4, shell),
              'body', coat)
    P.add(squarish(sphere('Stag shield', Tr, T, shell, seg=8, rings=3), .7), 'body',
          lambda co: tint('#46251a', BASE) if co.z > .0098 else BLACK)
    P.add(squarish(sphere('Stag head', Hr, H, shell, seg=8, rings=3), .65), 'head',
          lambda co: tint('#3e2119', BASE) if co.z > .0090 else BLACK)
    for s, sd in ((1, 'L'), (-1, 'R')):
        P.add(stick(f'Stag jaw {sd}', jaw[sd], .0025, shell, verts=4, taper=.3), f'jaw_{sd}',
              lambda co: JAW if co.z > .0086 else BLACK)
        P.add(stick(f'Stag jaw tooth {sd}', [sx(V(.0106, -.0312, .0090), s), sx(V(.0062, -.0324, .0092), s)], .0016, shell,
                    taper=.3), f'jaw_{sd}', JAW)
        P.add(sphere(f'Stag eye {sd}', .0018, sx(V(.0100, -.0176, .0084), s), eye_m, seg=5, rings=3), 'head')
        P.add(stick(f'Stag antenna {sd}', ant[sd], .0006, shell, taper=1.9), f'antenna_{sd}', BLACK)
    for nm, s, h, hip, knee, foot in legs:
        P.add(stick(f'Stag {nm}', [hip, knee, foot], .0020, shell, taper=.5), nm,
              lambda co: DEEP if co.z < .004 else BLACK)
    finish('beetle-stag', arm, P, dict(rays=32, distance=.014, strength=.45, ground=0.0))

    def gape(p):
        return 9 * pulse(p, .45, .1) + 3 * S(p, 2)
    beetle_clips(arm, legs,
                 {'jaw_L': lambda p: (0, 0, gape(p)), 'jaw_R': lambda p: (0, 0, -gape(p))},
                 {'jaw_L': lambda p: (0, 0, 2 + 2 * S(p, 1)), 'jaw_R': lambda p: (0, 0, -2 - 2 * S(p, 1))})
    export_bug('beetle-stag', arm)

# ====================================================================== MOTH


def build_moth():
    """Small pale moth, 4 cm span: a plump cream body, a round head with dark eyes and two feathery antennae,
    four cream wings with a soft tan root and edge (fore wings over hind wings) and six thin legs. The file's
    rest pose has the wings spread flat; Idle folds them back into the delta a resting moth makes."""
    reset()
    BASE = '#fff4dc'
    wing_m = mat('Moth wing', BASE, rough=.7, double=True)
    body_m = mat('Moth body', '#f6dfb2', rough=.8)
    bones = [('root', (0, 0, 0), (0, 0, .003), None),
             ('body', (0, .002, .0045), (0, -.006, .0045), 'root')]
    fore_r, hind_r = V(.0015, -.0030, .0058), V(.0016, .0006, .0052)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'wing_{sd}', sx(fore_r, s), sx(fore_r + V(.008, 0, 0), s), 'body'),
                  (f'hind_{sd}', sx(hind_r, s), sx(hind_r + V(.008, 0, 0), s), 'body')]
    arm = build_armature('Moth', bones)

    P = Parts()
    body = sphere('Moth body', (.0031, .0030, .0074), V(0, .0024, .0044), body_m, seg=6, rings=4, rot=(math.radians(90), 0, 0))
    for v in body.data.vertices:                              # fat furry thorax, tapering abdomen (local -z = world +y)
        if v.co.z < 0:
            v.co.x *= .78
            v.co.y *= .78
    P.add(body, 'body', lambda co: .82 if co.z < .0036 else 1.0)
    P.add(sphere('Moth head', .0025, V(0, -.0060, .0048), body_m, seg=6, rings=4), 'body',
          lambda co: .14 if co.y < -.0066 and abs(co.x) > .0008 and co.z > .0044 else 1.0)
    TAN, EDGE = tint('#f1c98a', BASE), tint('#e9b56c', BASE)
    fore = [(.0003, -.0028), (.0090, -.0074), (.0188, -.0078), (.0206, -.0016), (.0140, .0038), (.0012, .0026)]
    hindw = [(.0006, .0016), (.0088, .0030), (.0132, .0092), (.0070, .0132), (.0008, .0078)]
    for s, sd in ((1, 'L'), (-1, 'R')):
        for bone, root, outline in ((f'wing_{sd}', fore_r, fore), (f'hind_{sd}', hind_r, hindw)):
            out = [sx(V(root.x + x, y, root.z), s) for x, y in outline]
            P.add(wing(f'Moth {bone}', sx(root, s), out, wing_m, rings=(.62,), colors=[TAN, 1.0, EDGE]), bone)
        # feathery antennae: a little flat leaf each
        a0 = sx(V(.0008, -.0078, .0062), s)
        tip = sx(V(.0040, -.0128, .0092), s)
        side = sx(V(.0010, .0006, 0), s)
        P.add(fan(f'Moth antenna {sd}', a0.lerp(tip, .5), [a0, a0.lerp(tip, .55) + side, tip, a0.lerp(tip, .55) - side],
                  wing_m, up=Zv), 'body', tint('#c9955a', BASE))
        for k, (y, y1) in enumerate(((-.0040, -.0070), (-.0016, -.0014), (.0010, .0044))):
            hip, foot = sx(V(.0012, y, .0030), s), sx(V(.0046, y1, .0002), s)
            P.add(polys(f'Moth leg {sd}{k}', [[hip - V(0, .0005, 0), hip + V(0, .0005, 0), foot]], wing_m), 'body',
                  tint('#8a6a44', BASE))
    finish('moth', arm, P, dict(rays=24, distance=.006, strength=.4))

    # Idle (loop 3 s): wings folded back into a delta and tented a little, two quick flutters, slow breathing
    def flut(p):
        return (pulse(p, .34, .05) + pulse(p, .78, .04)) * S(p, 30)

    def fold(s, sweep, roll):
        return lambda p: rot((Yv, s * (roll - 9 * flut(p))), (Zv, s * (sweep - 5 * abs(flut(p)))))
    ch = {'body@loc': lambda p: (0, 0, .00006 * S(p, 2)),
          'body': lambda p: (1.0 * S(p, 2), 0, 0)}
    for s, sd in ((1, 'L'), (-1, 'R')):
        ch[f'wing_{sd}'] = fold(s, 44, 12)
        ch[f'hind_{sd}'] = fold(s, 26, 12)
    clip(arm, 'Idle', 90, ch)

    # Fly (loop 0.33 s): all four wings beat together from 62 degrees up to 28 down; the body bobs against the beat
    def flap(p):
        return 17 + 45 * C(p, 1)
    ch = {'body@loc': lambda p: (0, 0, -.0014 * C(p, 1, .1)),
          'body': lambda p: (-8 - 3 * S(p, 1), 0, 0)}
    for s, sd in ((1, 'L'), (-1, 'R')):
        ch[f'wing_{sd}'] = (lambda s: lambda p: (0, -s * flap(p), 0))(s)
        ch[f'hind_{sd}'] = (lambda s: lambda p: (0, -s * (flap(p) * .9 - 4), 0))(s)
    clip(arm, 'Fly', 10, ch)
    export_bug('moth', arm)

# ====================================================================== KITE


PAPER = '#fff3d4'
RED, INDIGO, GOLD = '#ec3b2a', '#2f5fd6', '#ffb629'


def kite_parts(tail=((.022, -.60), (-.020, -.70), (.014, -.80)), bow=.05):
    """Home-made diamond kite in the XZ plane, painted face toward -Y, the cross of the spars at the origin.
    tail: (x, z) of each paper bow under the bottom tip. Motifs are separate faces 3 mm in front of the paper
    (painted red / indigo on the one paper material), the bamboo cross lies 6-16 mm behind it."""
    paper = mat('Kite paper', PAPER, rough=.8, double=True)
    bamboo = mat('Kite bamboo', '#e0b34f', rough=.55)
    red, blue, gold = tint(RED, PAPER), tint(INDIGO, PAPER), tint(GOLD, PAPER)
    Tp, Bp, Rp, Lp = V(0, 0, .24), V(0, 0, -.50), V(.29, 0, 0), V(-.29, 0, 0)
    parts = []
    sheet = fan('Kite sheet', V(0, 0, 0), [Tp, Rp, Bp, Lp], paper, up=-Yv)
    paint(sheet, lambda co: 1.0 if co.length < .01 else (1.0, .95, .86))
    parts.append(sheet)
    # red painted border: a band inside each edge
    y1 = -.0015
    band = []
    corners = [Tp, Rp, Bp, Lp]
    for a, b in zip(corners, corners[1:] + corners[:1]):
        band.append([a + V(0, y1, 0), b + V(0, y1, 0), b * .88 + V(0, y1, 0), a * .88 + V(0, y1, 0)])
    parts.append(paint(polys('Kite border', band, paper, up=-Yv), red))
    # the sun: a red disc with eight short rays, above the cross
    y2 = -.003
    sc, sr = V(0, y2, .052), .062
    parts.append(paint(fan('Kite sun', sc, [sc + V(math.cos(TAU * i / 10) * sr, 0, math.sin(TAU * i / 10) * sr)
                                            for i in range(10)], paper, up=-Yv), red))
    rays = []
    for i in range(8):
        a = TAU * (i + .5) / 8
        d, t = V(math.cos(a), 0, math.sin(a)), V(-math.sin(a), 0, math.cos(a))
        rays.append([sc + d * (sr + .014) + t * .013, sc + d * (sr + .014) - t * .013, sc + d * (sr + .046)])
    parts.append(paint(polys('Kite sun rays', rays, paper, up=-Yv), red))
    # the fish: an indigo carp swimming up toward the sun, gold fins, a cream eye
    fc, ang = V(.004, y2, -.215), math.radians(64)
    U, W = V(math.cos(ang), 0, math.sin(ang)), V(-math.sin(ang), 0, math.cos(ang))

    def fp(u, w, dy=0.0):
        return fc + U * u + W * w + V(0, dy, 0)
    body = [fp(.092 * math.cos(TAU * i / 10) - .012 * (math.cos(TAU * i / 10) < -.3), .043 * math.sin(TAU * i / 10))
            for i in range(10)]
    parts.append(paint(fan('Kite fish', fp(.01, 0), body, paper, up=-Yv), blue))
    parts.append(paint(fan('Kite fish tail', fp(-.092, 0), [fp(-.078, .016), fp(-.150, .058), fp(-.124, 0), fp(-.150, -.058),
                                                           fp(-.078, -.016)], paper, up=-Yv), blue))
    parts.append(paint(polys('Kite fish fins', [[fp(.030, .036), fp(-.030, .040), fp(-.012, .078)],
                                                [fp(.020, -.036), fp(-.026, -.038), fp(-.014, -.070)]], paper, up=-Yv), gold))
    ec = fp(.052, .010, -.0015)
    parts.append(paint(fan('Kite fish eye', ec, [ec + U * .013, ec + W * .013, ec - U * .013, ec - W * .013], paper,
                           up=-Yv), 1.0))
    pc = fp(.055, .010, -.003)
    parts.append(paint(polys('Kite fish pupil', [[pc + U * .006, pc + W * .006, pc - U * .006, pc - W * .006]], paper,
                             up=-Yv), .1))
    # bamboo: the spine and a slightly bowed cross spar, lashed with red thread where they cross
    spine = tube('Kite spine', [Tp + V(0, .007, -.004), Bp + V(0, .007, .004)], .0058, bamboo, verts=4, caps=True)
    cross = tube('Kite cross spar', [Lp + V(.004, .017, 0), V(0, .021, 0), Rp + V(-.004, .017, 0)], .0052, bamboo, verts=4,
                 caps=True)
    parts += [paint(spine, lambda co: .78 if co.y > .010 else 1.0), paint(cross, lambda co: .8 if co.y > .020 else 1.0)]
    parts.append(paint(sphere('Kite lashing', (.013, .013, .013), (0, .014, 0), paper, seg=5, rings=3), red))
    # the bow tail: a thread from the bottom tip with paper bows knotted on
    pts = [Bp] + [V(x, 0, z) for x, z in tail]
    parts.append(paint(stick('Kite tail thread', pts, .0022, paper), 1.0))
    bows = []
    for k, p in enumerate(pts[1:]):
        t = (pts[k + 1] - pts[k]).normalized()
        n = V(t.z, 0, -t.x)
        for sg in (1, -1):
            bows.append((k, [p, p + n * sg * bow + t * bow * .55, p + n * sg * bow - t * bow * .55]))
    for k in sorted({k for k, _ in bows}):
        col = (red, blue, gold)[k % 3]
        parts.append(paint(polys(f'Kite bow {k}', [f for kk, f in bows if kk == k], paper, up=-Yv), col))
    return parts


def build_kite_paper():
    reset()
    parts = kite_parts()
    print('kite-paper', tri_count(parts), 'tris before export')
    return finish_static('kite-paper', parts, 'kite_paper', ao=dict(rays=24, distance=.03, strength=.3),
                         budget=BUDGET['kite-paper'])

# ====================================================================== SWEET POTATO


SKIN, FLESH = '#b82a56', '#ffcb38'
SPUD_R = (.10, .56, .88, 1.0, .97, .80, .50, .10)


def spud_tube(name, xs, radii, material, bend=.010, verts=6):
    """A lumpy spindle along X (radii are fractions of 2.9 cm), bowed a little sideways."""
    L = .085
    pts = [V(x, bend * math.cos(x / L * math.pi / 2) - bend * .5, .003 * math.sin(x / L * 3.0)) for x in xs]
    n = len(pts) - 1
    return tube(name, pts, .029, material, verts=verts, caps=True,
                radius_fn=lambda t: radii[min(n, int(round(t * n)))])


def potato_raw():
    skin = mat('Potato skin', SKIN, rough=.6)
    xs = [-.085 + .170 * i / 7 for i in range(8)]
    ob = spud_tube('raw', xs, SPUD_R, skin)
    for v in ob.data.vertices:                              # a slightly lopsided, hand-dug look
        v.co.z *= 1 + .10 * math.sin(v.co.x * 55)
    ob.location.z = .0285
    apply_transform(ob)
    paint(ob, lambda co: tint('#862046', SKIN) if abs(co.x) > .080 else (.82 if co.z < .014 else 1.0))
    return baked([ob], 'raw', dict(rays=32, distance=.05, strength=.45, ground=0.0))


def potato_roasted():
    """The same potato after the fire: skin darkened and scorched, broken in the middle, the two halves lying
    in an open V so both golden faces show from the front and from above."""
    skin = mat('Potato skin', SKIN, rough=.6)
    flesh = mat('Potato flesh', FLESH, rough=.45)
    ROAST, CHAR = tint('#8c2f44', SKIN), tint('#4a1f22', SKIN)
    halves = []
    for k, (turn, tilt, yaw, at, sc) in enumerate(((0, -30, -40, V(-.022, 0, 0), 1.0), (180, 30, 40, V(.021, .002, 0), .92))):
        xs = [-.085, -.060, -.030, 0.0]
        h = spud_tube(f'Roast half {k}', xs, (.12, .62, .95, 1.0), skin, bend=.004)
        ring = [V(.0012, .0252 * math.cos(TAU * i / 6), .0252 * math.sin(TAU * i / 6)) for i in range(6)]
        f = fan(f'Roast flesh {k}', V(.0065, 0, 0), ring, flesh, up=Xv)
        m = (Matrix.Translation(at) @ Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Rotation(math.radians(tilt), 4, 'Y')
             @ Matrix.Rotation(math.radians(turn), 4, 'Z') @ Matrix.Scale(sc, 4))
        for o in (h, f):
            o.matrix_world = m
            apply_transform(o)
        lo = min(v.co.z for v in h.data.vertices)
        for o in (h, f):
            o.location.z = -lo
            apply_transform(o)
        paint(h, lambda co, k=k: CHAR if (math.sin(co.x * 190 + k) * math.sin(co.y * 230) > .35) else ROAST)
        paint(f, lambda co, c=(m @ V(.0065, 0, 0)) - V(0, 0, lo): 1.0 if (co - c).length < .004 else tint('#f79a1c', FLESH))
        halves += [h, f]
    return baked(halves, 'roasted', dict(rays=32, distance=.04, strength=.4, ground=0.0))


def build_sweet_potato():
    reset()
    raw = potato_raw()
    roasted = potato_roasted()
    info = export('sweet-potato', [raw, roasted])
    check('sweet-potato', info, BUDGET['sweet-potato'])
    if REVIEW:
        os.makedirs(REVIEW, exist_ok=True)
        export('sweet-potato-raw', [raw], out_dir=REVIEW)
        export('sweet-potato-roasted', [roasted], out_dir=REVIEW)
    return info

# ====================================================================== STRAW PILE


STRAW = '#ffd55a'
EMBER_Z = .062


def straw_parts(seed=5):
    """A low ragged mound of rice straw with a hollow in the middle, loose stalks lying down its slopes and
    out over the ground. Returns (mound parts, ember parts): a dark bed with a few coals in the hollow."""
    straw = mat('Straw', STRAW, rough=.85, double=True)
    ember = mat('Straw embers', '#7a2a14', rough=.9, emit=.25, emit_color='#ff5a14')
    rng = random.Random(seed)
    N = 12
    prof = [(0, .050), (.10, .056), (.19, .150), (.27, .172), (.38, .104), (.47, .034), (.535, 0)]
    mound = lathe('Straw mound', prof, straw, seg=N, smooth_angle=60)
    bm = bmesh.new()
    bm.from_mesh(mound.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.co.z < 1e-5 for v in f.verts)], context='FACES')
    bm.to_mesh(mound.data)
    bm.free()

    def wob(a):
        return 1 + .10 * math.sin(3 * a + 1.3) + .07 * math.sin(5 * a + .4)

    def lift(a):
        return 1 + .20 * math.sin(2 * a + .5) + .10 * math.sin(7 * a)
    for v in mound.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if r > .15:
            a = math.atan2(v.co.y, v.co.x)
            k = wob(a) * (1 + (rng.uniform(-.09, .13) if r > .45 else rng.uniform(-.04, .04)))
            v.co.x *= k
            v.co.y *= k
            if v.co.z > .01:
                v.co.z *= lift(a) * rng.uniform(.92, 1.08)
    SOOT, SHADE, DEEP, PALE = tint('#5a3a1c', STRAW), tint('#eeb640', STRAW), tint('#cf922c', STRAW), tint('#fff0a8', STRAW)

    def coat(co):
        r = math.hypot(co.x, co.y)
        if r < .15:
            return SOOT
        if co.z < .05:
            return DEEP
        return SHADE if int((math.atan2(co.y, co.x) + math.pi) / TAU * N + .5) % 2 else 1.0
    paint(mound, coat)
    # loose stalks: flat strips lying down the slopes, some standing off the rim, some out flat on the ground
    strips = []
    for i in range(24):
        a = TAU * (i + rng.uniform(-.3, .3)) / 24
        out = V(math.cos(a), math.sin(a), 0)
        d = Quaternion(Zv, rng.uniform(-.6, .6)) @ out
        up = i % 6 == 0
        r0 = rng.uniform(.20, .30)
        ln = rng.uniform(.24, .34) * (.6 if up else 1.0)
        base = out * r0 * wob(a) + V(0, 0, .168 * lift(a) + .006 - (.03 if up else 0))
        end = base + d * ln * (.45 if up else .92) + V(0, 0, ln * (.75 if up else -.44))
        w = Zv.cross(d).normalized() * rng.uniform(.012, .019)
        strips.append([base - w, base + w, end + w * .7, end - w * .7])
    for i in range(14):
        a = TAU * (i + rng.uniform(-.35, .35)) / 14
        out = V(math.cos(a), math.sin(a), 0)
        d = Quaternion(Zv, rng.uniform(-.5, .5)) @ out
        base = out * rng.uniform(.40, .47) * wob(a) + V(0, 0, .05)
        end = base + d * rng.uniform(.18, .26)
        end.z = .004
        w = Zv.cross(d).normalized() * rng.uniform(.012, .018)
        strips.append([base - w, base + w, end + w * .7, end - w * .7])
    stalks = polys('Straw stalks', strips, straw)
    pick = [rng.choice((PALE, PALE, 1.0, DEEP)) for _ in strips]
    paint(stalks, 1.0)
    col = stalks.data.color_attributes['Paint']
    for p in stalks.data.polygons:
        c = pick[p.index]
        c = (c, c, c) if isinstance(c, (int, float)) else c
        for li in p.loop_indices:
            col.data[li].color = (c[0], c[1], c[2], 1.0)
    # ember bed: a ragged dark disc with six coals
    ec = V(0, 0, EMBER_Z)
    ring = [ec + V(math.cos(TAU * i / 10), math.sin(TAU * i / 10), 0) * (.150 + .018 * math.sin(i * 2.4)) for i in range(10)]
    bed = fan('Ember bed', ec + V(0, 0, .010), ring, ember, up=Zv)
    paint(bed, lambda co: .26 if math.hypot(co.x, co.y) > .08 else .4)
    coals = [bed]
    for i in range(6):
        a = TAU * i / 6 + rng.uniform(-.3, .3)
        rr = rng.uniform(.035, .095) if i else 0.0
        c = sphere(f'Coal {i}', (rng.uniform(.022, .032), rng.uniform(.020, .028), .017), ec + V(math.cos(a) * rr, math.sin(a) * rr, .016),
                   ember, seg=4, rings=2, rot=(0, 0, rng.uniform(0, 3)))
        paint(c, lambda co: 1.0 if co.z > EMBER_Z + .02 else .55)
        coals.append(c)
    return [mound, stalks], coals


def build_straw_pile():
    reset()
    parts, coals = straw_parts()
    print('straw-pile', tri_count(parts + coals), 'tris before export')
    embers = baked(coals, 'embers', dict(rays=16, distance=.04, strength=.3))
    # the node's own origin sits at the middle of the bed (handy for a glow sprite or a point light)
    embers.data.transform(Matrix.Translation((0, 0, -EMBER_Z)))
    embers.location = (0, 0, EMBER_Z)
    return finish_static('straw-pile', parts, 'straw_pile', [embers], dict(rays=32, distance=.12, strength=.5, ground=0.0),
                         budget=BUDGET['straw-pile'])

# ====================================================================== TRICK ICON SCENES (review-only GLBs)


def place(obs, m):
    for o in obs:
        o.matrix_world = m @ o.matrix_world
    bpy.context.view_layer.update()
    return obs


def posed_copy(model, clip_name, frac, name):
    """Import a rigged GLB, pose it at `frac` of a clip and return a plain mesh copy (COLOR_0 kept)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, model + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    act = bpy.data.actions[clip_name]
    arm.animation_data_create()
    arm.animation_data.action = act
    try:
        arm.animation_data.action_slot = act.slots[0]
    except Exception:
        pass
    bpy.context.scene.frame_set(int(act.frame_range[1] * frac))
    src = next(o for o in new if o.type == 'MESH' and o.modifiers)
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(src.evaluated_get(deps), depsgraph=deps)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = src.matrix_world.copy()
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Icosphere')]:
        bpy.data.objects.remove(o, do_unlink=True)
    return ob


def scene_kite():
    """The kite leaning into the wind, its bow tail curling up beside it, a puff of cloud behind one corner."""
    reset()
    tail = [(.09, -.565), (.19, -.555), (.275, -.50), (.33, -.415), (.40, -.36)]
    parts = kite_parts(tail=tail, bow=.07)
    place(parts, Matrix.Rotation(math.radians(-20), 4, 'Y') @ Matrix.Rotation(math.radians(10), 4, 'X'))
    cloud = mat('Cloud', '#ffffff', rough=.9)
    for k, (x, z, r) in enumerate(((-.36, -.20, .085), (-.27, -.17, .105), (-.18, -.215, .08), (-.28, -.24, .075))):
        parts.append(paint(sphere(f'Cloud {k}', (r, r * .6, r * .8), (x, .16, z), cloud, seg=10, rings=6),
                           lambda co, z=z: (.84, .92, 1.0) if co.z < z - .02 else 1.0))
    finish_static('trick-kite', parts, 'trick_kite', ao=dict(rays=16, distance=.03, strength=.25), out_dir=SCENES)


def scene_dew():
    """A dew-hung web at sunrise: a round dawn-sky medallion, the sun coming up, fat silk and big bright drops."""
    reset()
    sky = mat('Dawn sky', '#ffffff', rough=.8)
    sun_m = mat('Dawn sun', '#ffd23a', emit=.9, emit_color='#ffb81f')
    twig = mat('Twig', '#8a5a33', rough=.7)
    leaf = mat('Leaf', '#4fbf3f', rough=.5, double=True)
    mat('Web dew', '#7fd8ff', rough=.05, emit=.9, emit_color='#bff0ff')     # brighter, bluer drops than the model's
    disc = cyl('Sky', .37, .02, (0, .03, -.01), sky, verts=36, rot=(math.radians(90), 0, 0))
    lo, hi = srgb('#ff8f5e'), srgb('#3f8fe8')

    def dawn(co):
        t = smooth((co.z + .30) / .50)
        return tuple(lerp(lo[k], hi[k], t) for k in range(3))
    paint(disc, dawn)
    parts = [disc]
    parts.append(paint(sphere('Sun', (.12, .02, .12), (.0, .022, -.31), sun_m, seg=14, rings=6), 1.0))
    web, d = web_parts(width=2.4, bead=2.6)
    paint(web, 1.0)
    paint(d, 1.0)
    parts += [web, d]
    tw = tube('Twig', [V(-.40, .0, .20), V(-.20, 0, .30), V(.04, 0, .345), V(.30, 0, .30)], .016, twig, verts=5, caps=True,
              radius_fn=lambda t: lerp(1.0, .55, t))
    parts.append(paint(tw, 1.0))
    for k, (x, z, a) in enumerate(((-.30, .285, 2.4), (.19, .345, .5))):
        c = V(x, -.004, z)
        u, w = V(math.cos(a), 0, math.sin(a)), V(-math.sin(a), 0, math.cos(a))
        lf = fan(f'Leaf {k}', c + u * .05, [c, c + u * .05 + w * .034, c + u * .12, c + u * .05 - w * .034], leaf, up=-Yv)
        parts.append(paint(lf, lambda co, c=c: .78 if (co - c).length < .03 else 1.0))
    finish_static('trick-dew', parts, 'trick_dew', ao=dict(rays=16, distance=.03, strength=.2), out_dir=SCENES)


def scene_roast():
    """The straw fire burning, and a roasted sweet potato broken open in front of it."""
    reset()
    parts, coals = straw_parts()
    flame = mat('Flame', '#ffffff', emit=.55, emit_color='#ff7a14')
    for k, (x, y, h, r, tones) in enumerate(((0, .06, .60, .17, ('#ffd23a', '#ff5a14')), (-.15, .0, .40, .12, ('#ffc02a', '#ff4a10')),
                                             (.15, .02, .44, .12, ('#ffc02a', '#ff4a10')), (.0, -.04, .30, .09, ('#fff3a0', '#ffc02a')))):
        prof = [(0, 0), (r, h * .16), (r * .82, h * .42), (r * .36, h * .78), (0, h)]
        fl = lathe(f'Flame {k}', prof, flame, seg=8, loc=(x, y, .07))
        apply_transform(fl)
        for v in fl.data.vertices:
            v.co.x += .07 * ((v.co.z - .07) / h) ** 2 * math.sin(k * 2.1 + 1)
        lo, hi = srgb(tones[0]), srgb(tones[1])
        parts.append(paint(fl, lambda co, h=h, lo=lo, hi=hi: tuple(lerp(lo[i], hi[i], smooth((co.z - .07) / h * 1.2)) for i in range(3))))
    parts += [paint(c, 1.0) if 'Paint' not in c.data.color_attributes else c for c in coals]
    place(parts, Matrix.Scale(.86, 4))
    roasted = potato_roasted()
    place([roasted], Matrix.Translation((.05, -.50, 0)) @ Matrix.Scale(4.6, 4))
    root = baked(parts, 'trick_roast', dict(rays=24, distance=.12, strength=.45, ground=0.0))
    set_parent(roasted, root)
    export('trick-roast', [root], out_dir=SCENES)


def scene_beetles():
    """The rhinoceros beetle at the sap: big on a slanting oak branch, a patch of golden sap in front of its horn."""
    reset()
    BARK = '#c9925a'
    bark = mat('Bark', BARK, rough=.8)
    sap = mat('Sap', '#ffb21c', rough=.1, emit=.5, emit_color='#ff9a10')
    leaf = mat('Leaf', '#4fbf3f', rough=.5, double=True)
    R = .026
    a, b = V(.080, 0, -.022), V(-.080, 0, .004)
    axis = (b - a).normalized()
    up = axis.cross(Yv).normalized()
    if up.z < 0:
        up = -up
    log = tube('Branch', [a, a.lerp(b, .5), b], R, bark, verts=10, caps=True)
    paint(log, lambda co: tint('#96633a', BARK) if (int((math.atan2((co - a).dot(up), co.y) + math.pi) * 5 / math.pi) % 2 or
                                                    (co - a).dot(up) < -.012) else 1.0)
    parts = [log]
    for k, t in enumerate((0.0, 1.0)):                     # pale cut ends
        c = a.lerp(b, t) + axis * (.0008 if t else -.0008)
        e = fan(f'Branch end {k}', c, [c + (Quaternion(axis, TAU * i / 10) @ Yv) * R * .8 for i in range(10)], bark,
                up=axis if t else -axis)
        parts.append(paint(e, tint('#f6dfa8', BARK)))
    # sap: a glossy patch on the top toward the viewer with a drip running down the front
    sc = a.lerp(b, .86) + (up * .8 - Yv * .6).normalized() * (R + .0012)
    n = (sc - a.lerp(b, .86)).normalized()
    w = axis.cross(n)
    ring = [sc + axis * math.cos(TAU * i / 8) * (.024 + .005 * math.sin(i * 2)) + w * math.sin(TAU * i / 8) * .017 for i in range(8)]
    parts.append(paint(fan('Sap', sc + n * .003, ring, sap, up=n), 1.0))
    parts.append(paint(sphere('Sap drip', (.0055, .0055, .011), a.lerp(b, .84) + V(0, -R - .001, -.010), sap, seg=6, rings=4), 1.0))
    lc = a.lerp(b, .04) + up * (R - .004) + V(0, .008, 0)
    lu, lw = V(.62, .2, .76).normalized(), V(.5, -.7, -.3).normalized()
    lf = fan('Leaf', lc + lu * .026, [lc, lc + lu * .024 + lw * .016, lc + lu * .058, lc + lu * .024 - lw * .016], leaf)
    parts.append(paint(lf, lambda co: .78 if (co - lc).length < .014 else 1.0))
    root = baked(parts, 'trick_beetles', dict(rays=24, distance=.03, strength=.4))
    beetle = posed_copy('beetle-rhino', 'Idle', .45, 'Beetle')
    slope = math.atan2(axis.z, -axis.x)                     # the branch climbs toward -X
    beetle.matrix_world = (Matrix.Translation(a.lerp(b, .36) + up * (R - .001)) @ Matrix.Rotation(-slope, 4, 'Y')
                           @ Matrix.Rotation(math.radians(-90), 4, 'Z') @ Matrix.Scale(2.0, 4))
    set_parent(beetle, root)
    export('trick-beetles', [root], out_dir=SCENES)


BUILDERS = {'beetle-rhino': build_beetle_rhino, 'beetle-stag': build_beetle_stag, 'moth': build_moth,
            'kite-paper': build_kite_paper, 'sweet-potato': build_sweet_potato, 'straw-pile': build_straw_pile}

if __name__ == '__main__':
    if '--icons' in ARGV:
        os.makedirs(SCENES, exist_ok=True)
        for fn in (scene_kite, scene_dew, scene_roast, scene_beetles):
            fn()
    else:
        for nm in ONLY:
            BUILDERS[nm]()
        print('RESULTS')
        for nm, r in RESULTS.items():
            print(f'  {nm:14s} {r["tris"]:5d} tris {r["bytes"]:7d} B mats={r["mats"]} clips={r["clips"]}')
        if '--no-save' not in ARGV:
            save_kit('tricks2', [n for n in ALL if os.path.exists(os.path.join(OUT, n + '.glb'))], spacing=.1)
