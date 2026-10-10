"""Starline rural tricks (docs/RURAL-TRICKS.md, Phase 2): kite, dew webs, sweet potato roast, beetle sap trap.

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_tricks2.py [-- --only beetle-rhino,moth]
    [--review <dir>]   also writes sweet-potato-raw / sweet-potato-roasted there (one variant each, for review renders)
blender -b --factory-startup --python art/blender/build_tricks2.py -- --icons
    -> .tools/review/trick-scenes/trick-{kite,dew,roast,beetles}.glb (review-only scenes), then render them with
       render_icons.py -- --models .tools/review/trick-scenes trick-kite trick-dew trick-roast trick-beetles
       and the item icons with render_icons.py -- beetle-rhino beetle-stag sweet-potato
Afterwards: node art/blender/validate_glb.mjs   (flipped faces, z-fighting, openings, skin, loop seams, skating feet)

Conventions as build_critters.py / build_tricks.py (real size, colour painted into COLOR_0 over baked AO,
<= 3 materials, small budgets, z up, creatures face -Y = three +Z, origin on the ground under the body):
  beetle-rhino  6.5 cm with the horn  Idle (3 s), Walk (loop 0.8 s, feet planted, 15.6 mm/s at 1x)
                bones head, antenna_*, and per leg leg{1..3}_{L,R} (hip) > shin{1..3}_{L,R} (knee)
  beetle-stag   6.6 cm with the jaws  same clips and leg rig; also jaw_L / jaw_R
  moth          4 cm span             Idle (3 s: wings folded back in a delta, small flutters), Fly (loop 0.33 s)
  kite-paper    0.58 x 0.74 m diamond + 0.3 m bow tail. Root 'kite' (an empty at the cross of the two bamboo
                spars = the bridle point) with three children the game shows one by one: 'frame' (bamboo),
                'kite_paper' (the painted sail) and 'tail' (thread and bows). Painted face toward -Y (three +Z).
  sweet-potato  17 cm. Two root nodes at the same spot: 'raw' and 'roasted' (broken in two, golden flesh).
  straw-pile    1.1 m heap. Root 'straw' (an empty) with two children: 'straw_pile' (the heap and its sheaves; the
                game shrinks this node as the fire burns) and 'embers' (material 'Straw embers'), a bed of coals on
                the ground under the heap that is left when the straw has gone.
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
from mathutils import Matrix, Quaternion, Euler

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
    """Paint multiplier that turns the material colour `base` into `target` (both sRGB hex). COLOR_0 is
    exported normalised, so a multiplier above 1 is clipped: make the material the brightest colour."""
    t, b = srgb(target), srgb(base)
    return tuple(min(1.0, t[k] / max(b[k], 1e-4)) for k in range(3))


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


def cap_end(ob, n):
    """Close the far end of an uncapped tube (its last ring of n vertices) with one face."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    bm.faces.new(bm.verts[-n:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def baked(parts, name, ao=None):
    for o in parts:
        if 'Paint' not in o.data.color_attributes:
            paint(o, 1.0)
    ob = join(parts, name)
    bake_ao([ob], **(ao or dict(rays=32, distance=.05, strength=.5)))
    bake_paint(ob)
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


def check(name, info, budget):
    RESULTS[name] = dict(tris=info['tris'], bytes=info['bytes'], mats=info['materials'],
                         clips=info.get('animations', []))
    assert info['tris'] <= budget, f'{name}: {info["tris"]} tris > {budget}'
    assert info['materials'] <= 3, f'{name}: {info["materials"]} materials'

# ====================================================================== BEETLES


GROUP_A = {(1, 'L'), (3, 'L'), (2, 'R')}       # the tripod that steps first: front + hind of one side, middle of the other
STRIDE, DUTY = .0070, .56                      # 7 mm per step, planted 56% of the loop -> 15.6 mm/s over a 0.8 s loop


def beetle_legs(specs):
    """specs: (hip, knee, foot) for the left side, front to back -> one dict per leg, both sides."""
    legs = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        for i, (hip, knee, foot) in enumerate(specs):
            legs.append(dict(n=i + 1, sd=sd, leg=f'leg{i + 1}_{sd}', shin=f'shin{i + 1}_{sd}',
                             hip=sx(hip, s), knee=sx(knee, s), foot=sx(foot, s)))
    return legs


def leg_bones(legs):
    return [b for L in legs for b in ((L['leg'], L['hip'], L['knee'], 'body'), (L['shin'], L['knee'], L['foot'], L['leg']))]


def leg_mesh(P, name, L, radius, material, col):
    """One three-sided tube hip > knee > claw. The hip and knee rings ride the thigh bone, the claw ring the
    shin bone, so the knee bends without a gap and the claw sits exactly where the shin puts it."""
    ob = tube(name, [L['hip'], L['knee'], L['foot']], radius, material, verts=3, caps=False,
              radius_fn=lambda t: (1.0, .86, .1)[int(round(t * 2))])
    paint(ob, col)
    ob.vertex_groups.new(name=L['leg']).add([0, 1, 2, 3, 4, 5], 1.0, 'REPLACE')
    ob.vertex_groups.new(name=L['shin']).add([6, 7, 8], 1.0, 'REPLACE')
    P.append(ob)


def q_deg(q):
    e = q.to_euler('XYZ')
    return (math.degrees(e.x), math.degrees(e.y), math.degrees(e.z))


CLAMPED = [0]


def leg_ik(L, T):
    """Two-bone IK in the body's rest space: put the claw on T, the knee bending the way it is modelled.
    Returns the rotations rig.clip wants (about armature axes): the thigh's, and the shin's on top of it."""
    H, K0, F0 = L['hip'], L['knee'], L['foot']
    a, b = (K0 - H).length, (F0 - K0).length
    d = T - H
    dl = max(abs(a - b) + 1e-5, min(a + b - 1e-5, d.length))
    if abs(dl - d.length) > 1e-7:
        CLAMPED[0] += 1
    u = d.normalized()
    pole = (K0 - H) - u * (K0 - H).dot(u)
    pole.normalize()
    ca = (a * a + dl * dl - b * b) / (2 * a * dl)
    K = H + (u * ca + pole * math.sqrt(max(0.0, 1 - ca * ca))) * a
    q1 = (K0 - H).rotation_difference(K - H)
    q2 = (q1 @ (F0 - K0)).rotation_difference(H + u * dl - K) @ q1
    return q1, q1.inverted() @ q2


def gait(legs, head, body_rot, body_loc, target):
    """Clip channels for every thigh and shin so that each claw is at target(L, p) in armature space, whatever
    the body bone (head at `head`, rotated by body_rot(p), moved by body_loc(p)) is doing."""
    ch = {}
    for L in legs:
        def solve(p, L=L):
            qb = Euler([math.radians(x) for x in body_rot(p)], 'XYZ').to_quaternion()
            return leg_ik(L, head + qb.inverted() @ (target(L, p) - head - Vector(body_loc(p))))
        ch[L['leg']] = lambda p, f=solve: q_deg(f(p)[0])
        ch[L['shin']] = lambda p, f=solve: q_deg(f(p)[1])
    return ch


def beetle_clips(arm, legs, head, idle_extra, walk_extra):
    """Idle (3 s): breathing, the head lifts and looks, antennae twitch, three legs lift and reset one after
    another; every other claw stays where it is while the body breathes over it.
    Walk (loop 0.8 s): the insect tripod gait. Each claw is planted for 56% of the loop and travels straight back
    7 mm under the body at a steady speed, then lifts 3 mm and swings forward: 15.6 mm/s at 1x, no skating."""
    def twitch(p, ph=0.0):
        return pulse(p, .16 + ph, .035) + pulse(p, .58 + ph, .03) + pulse(p, .66 + ph, .03)

    def antennae(p, amp=1.0):
        return {'antenna_L': (-10 * twitch(p) * amp, 0, 9 * S(p, 1, .1) * amp + 8 * twitch(p)),
                'antenna_R': (-10 * twitch(p, .21) * amp, 0, -9 * S(p, 1, .35) * amp - 8 * twitch(p, .21))}

    # ---- Idle
    body_rot = lambda p: (.8 * S(p, 3), 0, 1.5 * S(p, 1))
    body_loc = lambda p: (0, 0, .00022 * S(p, 3))
    taps = {'leg1_R': .3, 'leg2_L': .62, 'leg3_R': .85}

    def rest(L, p):
        at = taps.get(L['leg'])
        k = pulse(p, at, .06) if at else 0.0
        return L['foot'] + V(0, -.0016 * k, .0030 * k)
    ch = {'body@loc': body_loc, 'body': body_rot,
          'head': lambda p: (2.5 * S(p, 1, .1) - 7 * pulse(p, .45, .09), 0, 4 * S(p, 1, .3))}
    ch.update(gait(legs, head, body_rot, body_loc, rest))
    for b in ('antenna_L', 'antenna_R'):
        ch[b] = (lambda b: lambda p: antennae(p)[b])(b)
    ch.update(idle_extra)
    clip(arm, 'Idle', 90, ch)

    # ---- Walk
    body_rot = lambda p: (0, 1.6 * S(p, 1), 1.2 * S(p, 1, .25))
    body_loc = lambda p: (0, 0, .0003 * C(p, 2))

    def step(L, p):
        ph = (p + (0 if (L['n'], L['sd']) in GROUP_A else .5)) % 1.0
        if ph < DUTY:
            return L['foot'] + V(0, STRIDE * (ph / DUTY - .5), 0)
        u = (ph - DUTY) / (1 - DUTY)
        return L['foot'] + V(0, STRIDE * (.5 - smooth(u)), .0030 * math.sin(math.pi * u))
    ch = {'body@loc': body_loc, 'body': body_rot,
          'head': lambda p: (1.5 * S(p, 2), 0, -2 * S(p, 1, .25))}
    ch.update(gait(legs, head, body_rot, body_loc, step))
    for b in ('antenna_L', 'antenna_R'):
        ch[b] = (lambda b: lambda p: antennae(p, .6)[b])(b)
    ch.update(walk_extra)
    clip(arm, 'Walk', 24, ch)
    assert not CLAMPED[0], f'{CLAMPED[0]} leg targets out of reach: lengthen the legs or shorten the stride'


def shoulders(ob, c, r, pw=3.4):
    """Square the front of a wing case: an ellipsoid tapers to a point where it meets the thorax shield, which
    reads as a waist from above. Widen the front half toward a blunt, broad-shouldered outline."""
    for v in ob.data.vertices:
        u = (v.co.y - c[1]) / r[1]
        if u < 0:
            w = math.sqrt(max(1e-6, 1 - u * u))
            v.co.x = c[0] + (v.co.x - c[0]) * min(1.9, (1 - abs(u) ** pw) ** (1 / pw) / w)
    return ob


def export_bug(name, arm):
    info = export_rigged(name, arm)
    check(name, info, BUDGET[name])
    return info


def build_beetle_rhino():
    """Japanese rhinoceros beetle (kabutomushi, male), 4.6 cm body + horn: a chunky oval. Glossy chestnut wing
    cases with a dark seam and broad shoulders, a darker domed thorax shield as wide as they are, a small head
    carrying the thick up-curved horn whose tip forks in two and each branch in two again (four tips), a short
    thorax horn above it, six stout dark legs with knees (front pair on the shield, two pairs under the wing
    cases) and stubby antennae."""
    reset()
    BASE = '#96401a'
    shell = mat('Rhino shell', BASE, rough=.5)
    eye_m = mat('Rhino eye', '#17110f', rough=.15)
    A, Ar = V(0, .0100, .0130), (.0128, .0160, .0102)
    T, Tr = V(0, -.0088, .0122), (.0126, .0096, .0090)
    H, Hr = V(0, -.0192, .0092), (.0062, .0052, .0048)
    MAIN, DARK, HORN = tint('#863616', BASE), tint('#4a1c0e', BASE), tint('#33130a', BASE)

    legs = beetle_legs([(V(.0066, -.0125, .0062), V(.0128, -.0180, .0118), V(.0166, -.0232, .0004)),
                        (V(.0080, -.0005, .0060), V(.0160, .0002, .0116), V(.0204, .0036, .0004)),
                        (V(.0080, .0095, .0060), V(.0142, .0158, .0114), V(.0176, .0234, .0004))])
    head = V(0, .004, .011)
    bones = [('root', (0, 0, 0), (0, 0, .004), None),
             ('body', head, (0, -.010, .011), 'root'),
             ('head', (0, -.0160, .0100), (0, -.0240, .0100), 'body')]
    ant = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        ant[sd] = (sx(V(.0036, -.0228, .0086), s), sx(V(.0070, -.0262, .0092), s))
        bones.append((f'antenna_{sd}', ant[sd][0], ant[sd][1], 'head'))
    bones += leg_bones(legs)
    arm = build_armature('BeetleRhino', bones)

    P = Parts()
    P.add(sphere('Rhino belly', (.0110, .0205, .0048), V(0, .0030, .0076), shell, seg=6, rings=3), 'body', HORN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        a0, a1 = (.4, 104) if s > 0 else (-104, -.4)     # no gap at the seam: the cases are one-sided, a gap leaks daylight
        case = shoulders(ell_patch(f'Rhino wing case {sd}', A, Ar, a0, a1, math.radians(28), math.radians(174), 3, 4, shell),
                         A, Ar)

        def coat(co):                                     # dark seam and rim, the brightest band along the top
            if abs(co.x) < .0016:
                return tint('#3e170c', BASE)
            if co.z < .0085:
                return tint('#5e230f', BASE)
            return MAIN if co.z < .0205 else 1.0
        P.add(case, 'body', coat)
    P.add(squarish(sphere('Rhino shield', Tr, T, shell, seg=8, rings=4), .72), 'body',
          lambda co: tint('#6e2a12', BASE) if co.z > .0105 else DARK)
    P.add(sphere('Rhino head', Hr, H, shell, seg=6, rings=3), 'head', DARK)
    # head horn: thick, rises forward and up in a curve, then forks; each prong carries a short outer tine.
    # Every tip tapers to a point and the shaft is closed where the prongs leave it: no tube can be looked into.
    F = V(0, -.0372, .0238)
    P.add(cap_end(stick('Rhino horn', [V(0, -.0222, .0100), V(0, -.0300, .0118), V(0, -.0352, .0172), F], .0028, shell,
                        verts=4, taper=.72), 4), 'head', HORN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        mid, tip = sx(V(.0042, -.0388, .0282), s), sx(V(.0056, -.0370, .0322), s)
        P.add(tube(f'Rhino horn prong {sd}', [F + V(0, .0010, -.0014), mid, tip], .0020, shell, verts=3, caps=False,
                   radius_fn=lambda t: (1.0, .8, .12)[int(round(t * 2))]), 'head', HORN)
        P.add(stick(f'Rhino horn tine {sd}', [mid, sx(V(.0074, -.0400, .0292), s)], .0016, shell, taper=.12), 'head', HORN)
    # thorax horn: a short spike pointing forward over the head
    P.add(tube('Rhino thorax horn', [V(0, -.0140, .0188), V(0, -.0196, .0222), V(0, -.0232, .0232)], .0024, shell, verts=4,
               caps=False, radius_fn=lambda t: (1.0, .7, .12)[int(round(t * 2))]), 'body', HORN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        P.add(sphere(f'Rhino eye {sd}', .0020, sx(V(.0052, -.0206, .0100), s), eye_m, seg=5, rings=3), 'head')
        P.add(stick(f'Rhino antenna {sd}', list(ant[sd]), .0007, shell, taper=1.8, caps=True), f'antenna_{sd}', HORN)
    for L in legs:
        leg_mesh(P, f'Rhino {L["leg"]}', L, .0027, shell, lambda co: HORN if co.z < .004 else DARK)
    finish('beetle-rhino', arm, P, dict(rays=32, distance=.014, strength=.5, ground=0.0))
    beetle_clips(arm, legs, head, {}, {})
    export_bug('beetle-rhino', arm)


def build_beetle_stag():
    """Stag beetle (kuwagata, male), 4.3 cm body + jaws: flat and broad, head, shield and wing cases the same
    width and close together. Near-black with a red-brown sheen along the wing cases, a wide square head and two
    big antler jaws (five-sided, flattened, warm brown so they stand off the head) that curve inward to pointed
    tips with a stout inner tooth each, short elbowed antennae and six legs with knees. The jaws ride their own
    bones (jaw_L, jaw_R)."""
    reset()
    BASE = '#7a3a22'
    shell = mat('Stag shell', BASE, rough=.5)
    eye_m = mat('Stag eye', '#120d0c', rough=.15)
    A, Ar = V(0, .0110, .0080), (.0114, .0158, .0056)
    T, Tr = V(0, -.0070, .0078), (.0118, .0070, .0052)
    H, Hr = V(0, -.0160, .0074), (.0104, .0056, .0046)
    BLACK, DEEP, JAW = tint('#2a1712', BASE), tint('#1c100d', BASE), tint('#532318', BASE)

    legs = beetle_legs([(V(.0070, -.0090, .0048), V(.0136, -.0146, .0094), V(.0176, -.0200, .0004)),
                        (V(.0066, .0015, .0054), V(.0162, .0022, .0092), V(.0210, .0058, .0004)),
                        (V(.0064, .0105, .0054), V(.0142, .0170, .0090), V(.0176, .0246, .0004))])
    head = V(0, .004, .008)
    bones = [('root', (0, 0, 0), (0, 0, .004), None),
             ('body', head, (0, -.008, .008), 'root'),
             ('head', (0, -.0120, .0076), (0, -.0200, .0076), 'body')]
    jaw, ant = {}, {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        jaw[sd] = [sx(V(.0058, -.0200, .0076), s), sx(V(.0110, -.0270, .0086), s), sx(V(.0106, -.0352, .0092), s),
                   sx(V(.0050, -.0410, .0090), s)]
        ant[sd] = [sx(V(.0090, -.0190, .0082), s), sx(V(.0126, -.0212, .0092), s), sx(V(.0132, -.0246, .0090), s)]
        bones += [(f'jaw_{sd}', jaw[sd][0], jaw[sd][1], 'head'),
                  (f'antenna_{sd}', ant[sd][0], ant[sd][1], 'head')]
    bones += leg_bones(legs)
    arm = build_armature('BeetleStag', bones)

    P = Parts()
    P.add(sphere('Stag belly', (.0098, .0196, .0032), V(0, .0040, .0054), shell, seg=6, rings=3), 'body', DEEP)
    for s, sd in ((1, 'L'), (-1, 'R')):
        a0, a1 = (.4, 102) if s > 0 else (-102, -.4)     # no gap at the seam (see the rhinoceros beetle)
        case = shoulders(ell_patch(f'Stag wing case {sd}', A, Ar, a0, a1, math.radians(26), math.radians(174), 3, 4, shell),
                         A, Ar)

        def coat(co):                                     # near-black with a warm brown sheen along each case
            if abs(co.x) < .0016 or co.z < .0060:
                return DEEP
            return tint('#7a3a22', BASE) if .0030 < abs(co.x) < .0090 and co.z > .0112 else tint('#3a2019', BASE)
        P.add(case, 'body', coat)
    P.add(squarish(sphere('Stag shield', Tr, T, shell, seg=8, rings=3), .62), 'body',
          lambda co: tint('#46251a', BASE) if co.z > .0098 else BLACK)
    P.add(squarish(sphere('Stag head', Hr, H, shell, seg=8, rings=3), .62), 'head',
          lambda co: tint('#3e2119', BASE) if co.z > .0090 else BLACK)
    for s, sd in ((1, 'L'), (-1, 'R')):
        P.add(tube(f'Stag jaw {sd}', jaw[sd], .0022, shell, verts=5, caps=False, squash=1.3,
                   radius_fn=lambda t: (1.0, .9, .66, .12)[int(round(t * 3))]), f'jaw_{sd}',
              lambda co: JAW if co.z > .0082 else tint('#35160f', BASE))
        P.add(stick(f'Stag jaw tooth {sd}', [sx(V(.0104, -.0316, .0090), s), sx(V(.0046, -.0338, .0092), s)], .0020, shell,
                    taper=.12), f'jaw_{sd}', JAW)
        P.add(sphere(f'Stag eye {sd}', .0018, sx(V(.0102, -.0176, .0084), s), eye_m, seg=5, rings=3), 'head')
        P.add(stick(f'Stag antenna {sd}', ant[sd], .0007, shell, taper=1.6, caps=True), f'antenna_{sd}', BLACK)
    for L in legs:
        leg_mesh(P, f'Stag {L["leg"]}', L, .0025, shell, lambda co: DEEP if co.z < .004 else BLACK)
    finish('beetle-stag', arm, P, dict(rays=32, distance=.014, strength=.45, ground=0.0))

    def gape(p):
        return 9 * pulse(p, .45, .1) + 3 * S(p, 2)
    beetle_clips(arm, legs, head,
                 {'jaw_L': lambda p: (0, 0, gape(p)), 'jaw_R': lambda p: (0, 0, -gape(p))},
                 {'jaw_L': lambda p: (0, 0, 2 + 2 * S(p, 1)), 'jaw_R': lambda p: (0, 0, -2 - 2 * S(p, 1))})
    export_bug('beetle-stag', arm)

# ====================================================================== MOTH


def build_moth():
    """Small pale moth, 4 cm span: a plump cream body, a round head with dark eyes and two feathery antennae,
    four cream wings with a soft tan root and edge (fore wings over hind wings) and six thin legs. The file's
    rest pose has the wings spread flat; Idle folds them back into the delta a resting moth makes. The cream
    stays under the game's bloom threshold, so the wings do not glow white in sunlight."""
    reset()
    BASE = '#eddcb8'
    wing_m = mat('Moth wing', BASE, rough=.8, double=True)
    body_m = mat('Moth body', '#e4cc9c', rough=.85)
    bones = [('root', (0, 0, 0), (0, 0, .003), None),
             ('body', (0, .002, .0045), (0, -.006, .0045), 'root')]
    fore_r, hind_r = V(.0015, -.0030, .0058), V(.0016, .0006, .0052)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'wing_{sd}', sx(fore_r, s), sx(fore_r + V(.008, 0, 0), s), 'body'),
                  (f'hind_{sd}', sx(hind_r, s), sx(hind_r + V(.008, 0, 0), s), 'body')]
    arm = build_armature('Moth', bones)

    P = Parts()
    body = sphere('Moth body', (.0032, .0031, .0074), V(0, .0024, .0044), body_m, seg=8, rings=4, rot=(math.radians(90), 0, 0))
    for v in body.data.vertices:                              # fat furry thorax, tapering abdomen (local -z = world +y)
        if v.co.z < 0:
            v.co.x *= .76
            v.co.y *= .76
    P.add(body, 'body', lambda co: .8 if co.z < .0036 else (.9 if co.y > .004 and int(co.y / .0025) % 2 else 1.0))
    P.add(sphere('Moth head', .0025, V(0, -.0060, .0048), body_m, seg=6, rings=4), 'body',
          lambda co: .14 if co.y < -.0066 and abs(co.x) > .0008 and co.z > .0044 else 1.0)
    TAN, EDGE = tint('#dcb478', BASE), tint('#d6a460', BASE)
    # outlines start and end well clear of the root: slivers there used to come out flipped
    fore = [(.0010, -.0056), (.0090, -.0076), (.0188, -.0080), (.0206, -.0018), (.0140, .0036), (.0012, .0024)]
    hindw = [(.0014, -.0010), (.0088, .0028), (.0132, .0092), (.0070, .0132), (.0008, .0078)]
    for s, sd in ((1, 'L'), (-1, 'R')):
        for bone, root, outline in ((f'wing_{sd}', fore_r, fore), (f'hind_{sd}', hind_r, hindw)):
            out = [sx(V(root.x + x, y, root.z), s) for x, y in outline]
            P.add(wing(f'Moth {bone}', sx(root, s), out, wing_m, rings=(.62,), colors=[TAN, 1.0, EDGE]), bone)
        # feathery antennae: a narrow flat leaf each (two triangles)
        a0, tip = sx(V(.0008, -.0078, .0062), s), sx(V(.0038, -.0124, .0090), s)
        mid, side = a0.lerp(tip, .55), sx(V(.0007, .0004, 0), s)
        P.add(polys(f'Moth antenna {sd}', [[a0, mid + side, tip], [a0, tip, mid - side]], wing_m, up=Zv), 'body',
              tint('#a87840', BASE))
        for k, (y, y1) in enumerate(((-.0040, -.0070), (-.0016, -.0014), (.0010, .0044))):
            hip, foot = sx(V(.0012, y, .0030), s), sx(V(.0046, y1, .0002), s)
            P.add(polys(f'Moth leg {sd}{k}', [[hip - V(0, .0005, 0), hip + V(0, .0005, 0), foot]], wing_m), 'body',
                  tint('#7a5c3a', BASE))
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


PAPER, BAMBOO = '#f4e6c4', '#e0b34f'
RED, INDIGO, GOLD = '#ec3b2a', '#2f5fd6', '#f4a81c'
LAYER = .0025                 # painted motifs sit in layers this far apart: no two overlapping faces share a plane


def kite_parts(tail=((.022, -.60), (-.020, -.70), (.014, -.80)), bow=.05):
    """Home-made diamond kite in the XZ plane, painted face toward -Y, the cross of the spars at the origin.
    Returns {'kite_paper': [...], 'frame': [...], 'tail': [...]}: the sail with its motifs, the bamboo, and the
    bow tail (tail = (x, z) of each paper bow under the bottom tip).
    Motifs are separate faces in front of the sail, painted on the one paper material. Each kind has its own
    layer (2.5 mm apart: border, sun and fins; then the fish; then its eye; then the pupil) and faces within a
    layer never overlap, so nothing z-fights, also 40 m up at 2.4x. The bamboo lies 4-21 mm behind the sail."""
    paper = mat('Kite paper', PAPER, rough=.8, double=True)
    bamboo = mat('Kite bamboo', BAMBOO, rough=.6)
    red, blue, gold = tint(RED, PAPER), tint(INDIGO, PAPER), tint(GOLD, PAPER)
    Tp, Bp, Rp, Lp = V(0, 0, .24), V(0, 0, -.50), V(.29, 0, 0), V(-.29, 0, 0)
    sail = []
    sheet = fan('Kite sheet', V(0, 0, 0), [Tp, Rp, Bp, Lp], paper, up=-Yv)
    sail.append(paint(sheet, lambda co: 1.0 if co.length < .01 else (1.0, .95, .86)))
    # layer 1: the red border (a band inside each edge), the sun with eight short rays, the fish's gold fins
    y1 = V(0, -LAYER, 0)
    corners = [Tp, Rp, Bp, Lp]
    band = [[a + y1, b + y1, b * .88 + y1, a * .88 + y1] for a, b in zip(corners, corners[1:] + corners[:1])]
    sail.append(paint(polys('Kite border', band, paper, up=-Yv), red))
    sc, sr = V(0, 0, .050) + y1, .056
    sail.append(paint(fan('Kite sun', sc, [sc + V(math.cos(TAU * i / 10) * sr, 0, math.sin(TAU * i / 10) * sr)
                                           for i in range(10)], paper, up=-Yv), red))
    rays = []
    for i in range(8):
        a = TAU * (i + .5) / 8
        d, t = V(math.cos(a), 0, math.sin(a)), V(-math.sin(a), 0, math.cos(a))
        rays.append([sc + d * (sr + .012) + t * .012, sc + d * (sr + .012) - t * .012, sc + d * (sr + .040)])
    sail.append(paint(polys('Kite sun rays', rays, paper, up=-Yv), red))
    # the fish: an indigo carp swimming up toward the sun, gold fins, a cream eye
    fc, ang = V(.004, 0, -.200), math.radians(64)
    U, W = V(math.cos(ang), 0, math.sin(ang)), V(-math.sin(ang), 0, math.cos(ang))

    def fp(u, w, layer):
        return fc + U * u + W * w + V(0, -LAYER * layer, 0)
    sail.append(paint(polys('Kite fish fins', [[fp(.034, .020, 1), fp(-.030, .024, 1), fp(-.012, .074, 1)],
                                               [fp(.024, -.020, 1), fp(-.026, -.024, 1), fp(-.014, -.066, 1)]], paper, up=-Yv), gold))
    # layer 2: the body and, just touching it, the forked tail
    body = [fp(.086 * math.cos(TAU * i / 10), .041 * math.sin(TAU * i / 10), 2) for i in range(10)]
    sail.append(paint(fan('Kite fish', fp(.01, 0, 2), body, paper, up=-Yv), blue))
    sail.append(paint(polys('Kite fish tail', [[fp(-.084, 0, 2), fp(-.138, .052, 2), fp(-.116, 0, 2)],
                                               [fp(-.084, 0, 2), fp(-.116, 0, 2), fp(-.138, -.052, 2)]], paper, up=-Yv), blue))
    ec = fp(.048, .010, 3)                                 # layer 3: the eye; layer 4: its pupil
    sail.append(paint(fan('Kite fish eye', ec, [ec + U * .013, ec + W * .013, ec - U * .013, ec - W * .013], paper, up=-Yv), 1.0))
    pc = fp(.051, .010, 4)
    sail.append(paint(polys('Kite fish pupil', [[pc + U * .006, pc + W * .006, pc - U * .006, pc - W * .006]], paper, up=-Yv), .1))
    # bamboo: the spine and a slightly bowed cross spar, lashed with red thread where they cross
    spine = tube('Kite spine', [Tp + V(0, .0100, -.004), Bp + V(0, .0100, .004)], .0056, bamboo, verts=4, caps=True)
    cross = tube('Kite cross spar', [Lp + V(.004, .0155, 0), V(0, .0215, 0), Rp + V(-.004, .0155, 0)], .0050, bamboo, verts=4,
                 caps=True)
    lash = sphere('Kite lashing', (.012, .011, .012), (0, .0170, 0), bamboo, seg=5, rings=3)
    frame = [paint(spine, lambda co: .78 if co.y > .013 else 1.0), paint(cross, lambda co: .8 if co.y > .020 else 1.0),
             paint(lash, tint('#d8362a', BAMBOO))]
    # the bow tail: a thread from the bottom tip with paper bows knotted on
    pts = [Bp] + [V(x, 0, z) for x, z in tail]
    tl = [paint(stick('Kite tail thread', pts, .0022, paper), 1.0)]
    for k, p in enumerate(pts[1:]):
        t = (pts[k + 1] - pts[k]).normalized()
        n = V(t.z, 0, -t.x)
        y = V(0, -LAYER * (1 + k % 2), 0)                  # in front of the thread, neighbours on different layers
        faces = [[p + y, p + y + n * sg * bow + t * bow * .55, p + y + n * sg * bow - t * bow * .55] for sg in (1, -1)]
        tl.append(paint(polys(f'Kite bow {k}', faces, paper, up=-Yv), (red, blue, gold)[k % 3]))
    return {'kite_paper': sail, 'frame': frame, 'tail': tl}


def build_kite_paper():
    reset()
    groups = kite_parts()
    print('kite-paper', tri_count([o for g in groups.values() for o in g]), 'tris before export')
    root = empty('kite', (0, 0, 0))
    for name, parts in groups.items():
        set_parent(baked(parts, name, dict(rays=24, distance=.03, strength=.3)), root)
    info = export('kite-paper', [root])
    check('kite-paper', info, BUDGET['kite-paper'])
    return info

# ====================================================================== SWEET POTATO


SKIN, FLESH = '#b82a56', '#ffcb38'
SPUD_R = .029
LAST_RING = {}                # spud(): the last station's vertices, for welding a face onto an open end


def spud(name, stations, material, sides=8, bend=.010, tip=True, end=True):
    """A lumpy spindle along X: stations are (x, radius as a fraction of 2.9 cm), bowed a little sideways.
    tip / end close the first / last station with a single pole vertex (give them radius 0)."""
    bm = bmesh.new()
    L = .085

    def centre(x):
        return V(x, bend * math.cos(x / L * math.pi / 2) - bend * .5, .003 * math.sin(x / L * 3.0))
    rings = []
    for k, (x, r) in enumerate(stations):
        c = centre(x)
        if r <= 0:
            rings.append([bm.verts.new(c)])
        else:
            rings.append([bm.verts.new(c + V(0, math.cos(TAU * i / sides), math.sin(TAU * i / sides)) * r * SPUD_R)
                          for i in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            if len(a) == 1:
                bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[i], b[0], a[j]))
            else:
                bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = from_bmesh(name, bm, material, smooth_angle=80)
    LAST_RING[name] = [v.co.copy() for v in ob.data.vertices][-len(rings[-1]):]
    return ob


def potato_raw():
    skin = mat('Potato skin', SKIN, rough=.6)
    ob = spud('raw', [(-.085, 0), (-.062, .58), (-.032, .90), (0, 1.0), (.030, .92), (.060, .60), (.085, 0)], skin)
    for v in ob.data.vertices:                              # a slightly lopsided, hand-dug look
        v.co.z *= 1 + .10 * math.sin(v.co.x * 55)
    ob.location.z = .0285
    apply_transform(ob)
    lo = min(v.co.z for v in ob.data.vertices)
    ob.location.z = -lo
    apply_transform(ob)
    paint(ob, lambda co: tint('#862046', SKIN) if abs(co.x) > .080 else (.82 if co.z < .014 else 1.0))
    return baked([ob], 'raw', dict(rays=32, distance=.05, strength=.45, ground=0.0))


def potato_roasted():
    """The same potato after the fire: skin darkened and scorched, broken in the middle. One half lies toward
    the viewer showing its round golden face, the other is turned away behind it showing skin and a sliver of
    gold: two pieces of one potato, not a mirrored pair. The face is an eight-sided fan welded to the skin's
    rim (gold in the middle, caramel at the edge), so each half is one closed shell."""
    skin = mat('Potato skin', SKIN, rough=.6)
    flesh = mat('Potato flesh', FLESH, rough=.45)
    ROAST, CHAR = tint('#8c2f44', SKIN), tint('#4a1f22', SKIN)
    halves = []
    for k, (turn, tilt, yaw, at, sc) in enumerate(((0, -34, -28, V(-.020, -.006, 0), 1.0), (180, 22, 62, V(.026, .016, 0), .9))):
        h = spud(f'Roast half {k}', [(-.085, 0), (-.060, .62), (-.030, .95), (0, 1.0)], skin, bend=.004)
        ring = LAST_RING[h.name]
        mid = sum(ring, Vector()) / len(ring) + V(.0060, 0, 0)
        f = fan(f'Roast flesh {k}', mid, ring, flesh, up=Xv)
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
        c = (m @ mid) - V(0, 0, lo)
        paint(f, lambda co, c=c: 1.0 if (co - c).length < .004 else tint('#e88a1a', FLESH))
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


STRAW = '#dcb450'
EMBER, EMBER_Z = '#7a2c18', .020


def straw_parts(seed=5):
    """A heap of rice straw for the field fire: a ragged dome, four tied sheaves leaning against it, loose stalks
    down its sides and out over the ground. Returns (heap parts, ember parts): the embers are a bed of charcoal
    with five coals lying on the ground under the heap, seen once the straw has burnt away."""
    straw = mat('Straw', STRAW, rough=.9, double=True)
    ember = mat('Straw embers', EMBER, rough=.95, emit=.03, emit_color='#ff5a14')
    rng = random.Random(seed)
    N = 10
    prof = [(0, .360), (.13, .340), (.27, .270), (.39, .160), (.48, .060), (.54, 0)]
    mound = lathe('Straw mound', prof, straw, seg=N, smooth_angle=60)
    bm = bmesh.new()
    bm.from_mesh(mound.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.co.z < 1e-5 for v in f.verts)], context='FACES')
    bm.to_mesh(mound.data)
    bm.free()

    def wob(a):
        return 1 + .09 * math.sin(3 * a + 1.3) + .06 * math.sin(5 * a + .4)

    def top(r, a):                                          # height of the heap's surface
        r = r / wob(a)
        for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
            if r <= r1:
                return lerp(z0, z1, (r - r0) / (r1 - r0))
        return 0.0
    for v in mound.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if r > .05:
            a = math.atan2(v.co.y, v.co.x)
            k = wob(a) * (1 + (rng.uniform(-.08, .12) if r > .5 else rng.uniform(-.04, .04)))
            v.co.x *= k
            v.co.y *= k
            if v.co.z > .01:
                v.co.z *= rng.uniform(.93, 1.07)
    SHADE, DEEP, PALE, TIE = tint('#c9a03c', STRAW), tint('#a87a26', STRAW), 1.0, tint('#7a5018', STRAW)
    paint(mound, lambda co: DEEP if co.z < .05 else (SHADE if int((math.atan2(co.y, co.x) + math.pi) / TAU * N + .5) % 2 else 1.0))
    parts = [mound]
    # sheaves: bundles of stalks tied round the middle, butts on the ground, heads resting on the heap
    for k, a in enumerate((.35, 1.95, 3.5, 5.05)):
        a += rng.uniform(-.12, .12)
        out = V(math.cos(a), math.sin(a), 0)
        foot, head = out * .62 + V(0, 0, .082), out * .19 + V(0, 0, top(.19, a) + .075)
        sh = tube(f'Sheaf {k}', [foot, foot.lerp(head, .5), head], .056, straw, verts=5, caps=True,
                  radius_fn=lambda t: (1.3, .55, 1.1)[int(round(t * 2))])
        shade(sh, 80)
        mid = foot.lerp(head, .5)
        paint(sh, lambda co, mid=mid, foot=foot, head=head: TIE if (co - mid).length < .05 else
              (PALE if (co - mid).dot(head - foot) > 0 else SHADE))
        parts.append(sh)
    # loose stalks: flat strips lying down the slopes and out flat on the ground
    strips = []
    for i in range(16):
        a = TAU * (i + rng.uniform(-.3, .3)) / 16
        out = V(math.cos(a), math.sin(a), 0)
        d = Quaternion(Zv, rng.uniform(-.5, .5)) @ out
        r0 = rng.uniform(.10, .30)
        ln = rng.uniform(.24, .34)
        base = out * r0 * wob(a) + V(0, 0, top(r0 * wob(a), a) + .012)
        end = base + d * ln
        end.z = top(math.hypot(end.x, end.y), math.atan2(end.y, end.x)) + .012
        w = Zv.cross(d).normalized() * rng.uniform(.012, .018)
        strips.append([base - w, base + w, end + w * .7, end - w * .7])
    for i in range(8):
        a = TAU * (i + rng.uniform(-.35, .35)) / 8
        out = V(math.cos(a), math.sin(a), 0)
        d = Quaternion(Zv, rng.uniform(-.5, .5)) @ out
        base = out * rng.uniform(.42, .50) * wob(a) + V(0, 0, .055)
        end = base + d * rng.uniform(.18, .26)
        end.z = .004
        w = Zv.cross(d).normalized() * rng.uniform(.012, .018)
        strips.append([base - w, base + w, end + w * .7, end - w * .7])
    for q in strips:                                        # nothing dips under the ground
        for p in q:
            p.z = max(p.z, .004)
    stalks = polys('Straw stalks', strips, straw)
    pick = [rng.choice((PALE, PALE, SHADE, DEEP)) for _ in strips]
    paint(stalks, 1.0)
    col = stalks.data.color_attributes['Paint']
    for p in stalks.data.polygons:
        c = pick[p.index]
        c = (c, c, c) if isinstance(c, (int, float)) else c
        for li in p.loop_indices:
            col.data[li].color = (c[0], c[1], c[2], 1.0)
    parts.append(stalks)
    # ember bed: a ragged disc of charcoal on the ground with five coals (dull red on top, black below)
    COAL = tint('#241b19', EMBER)
    ec = V(0, 0, EMBER_Z)
    ring = [ec + V(math.cos(TAU * i / 10), math.sin(TAU * i / 10), 0) * (.30 + .03 * math.sin(i * 2.4)) for i in range(10)]
    bed = fan('Ember bed', ec + V(0, 0, .012), ring, ember, up=Zv)
    paint(bed, lambda co: COAL if math.hypot(co.x, co.y) > .12 else tint('#3a2420', EMBER))
    coals = [bed]
    for i in range(5):
        a = TAU * i / 5 + rng.uniform(-.3, .3)
        rr = rng.uniform(.09, .19) if i else 0.0
        c = sphere(f'Coal {i}', (rng.uniform(.050, .066), rng.uniform(.044, .058), .034), ec + V(math.cos(a) * rr, math.sin(a) * rr, .026),
                   ember, seg=4, rings=2, rot=(0, 0, rng.uniform(0, 3)))
        paint(c, lambda co: tint('#5a2418', EMBER) if co.z > EMBER_Z + .045 else COAL)
        coals.append(c)
    return parts, coals


def build_straw_pile():
    reset()
    parts, coals = straw_parts()
    print('straw-pile', tri_count(parts + coals), 'tris before export')
    root = empty('straw', (0, 0, 0))
    embers = baked(coals, 'embers', dict(rays=16, distance=.06, strength=.3))
    # the node's own origin sits at the middle of the bed (handy for a glow sprite or a point light)
    embers.data.transform(Matrix.Translation((0, 0, -EMBER_Z)))
    embers.location = (0, 0, EMBER_Z)
    pile = baked(parts, 'straw_pile', dict(rays=32, distance=.12, strength=.5, ground=0.0))
    # siblings, not parent and child: the game shrinks 'straw_pile' as the fire burns and the coals must stay
    set_parent(pile, root)
    set_parent(embers, root)
    info = export('straw-pile', [root])
    check('straw-pile', info, BUDGET['straw-pile'])
    return info

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
    parts = [o for g in kite_parts(tail=tail, bow=.07).values() for o in g]
    place(parts, Matrix.Rotation(math.radians(-20), 4, 'Y') @ Matrix.Rotation(math.radians(10), 4, 'X'))
    cloud = mat('Cloud', '#ffffff', rough=.9)
    for k, (x, z, r) in enumerate(((-.36, -.20, .085), (-.27, -.17, .105), (-.18, -.215, .08), (-.28, -.24, .075))):
        parts.append(paint(sphere(f'Cloud {k}', (r, r * .6, r * .8), (x, .16, z), cloud, seg=10, rings=6),
                           lambda co, z=z: (.84, .92, 1.0) if co.z < z - .02 else 1.0))
    finish_static('trick-kite', parts, 'trick_kite', ao=dict(rays=16, distance=.03, strength=.25), out_dir=SCENES)


def scene_dew():
    """A dew-hung web at sunrise: a round dawn-sky medallion (deep blue above, so the white silk stands off it),
    the sun coming up, fat silk and a few big bright drops with a white glint each."""
    reset()
    sky = mat('Dawn sky', '#ffffff', rough=.8)
    sun_m = mat('Dawn sun', '#ffd23a', emit=.9, emit_color='#ffb81f')
    twig = mat('Twig', '#8a5a33', rough=.7)
    leaf = mat('Leaf', '#4fbf3f', rough=.5, double=True)
    glint = mat('Glint', '#ffffff', emit=1.2, emit_color='#ffffff')
    mat('Web dew', '#58c8ff', rough=.05, emit=.7, emit_color='#8fe0ff')     # bluer drops than the model's, to read on white silk
    disc = cyl('Sky', .37, .02, (0, .03, -.01), sky, verts=36, rot=(math.radians(90), 0, 0))
    lo, hi = srgb('#ff8a4e'), srgb('#2f6fd8')

    def dawn(co):
        t = smooth((co.z + .34) / .46)
        return tuple(lerp(lo[k], hi[k], t) for k in range(3))
    paint(disc, dawn)
    parts = [disc]
    parts.append(paint(sphere('Sun', (.12, .02, .12), (.0, .022, -.31), sun_m, seg=14, rings=6), 1.0))
    web, d = web_parts(width=2.6, bead=1.0)
    bpy.data.objects.remove(d, do_unlink=True)             # the model's twelve small drops: too fine for a 48 px icon
    parts.append(paint(web, 1.0))
    dew_m = mat('Web dew', '#58c8ff')
    for k, (x, z, r) in enumerate(((-.115, .075, .034), (.085, .125, .030), (.150, -.040, .036), (-.040, -.120, .032),
                                   (-.175, -.070, .026), (.020, .015, .028))):
        parts.append(paint(sphere(f'Drop {k}', (r, r * .8, r * 1.12), (x, -.012, z), dew_m, seg=10, rings=6),
                           lambda co, z=z, r=r: (.62, .8, 1.0) if co.z < z - r * .3 else 1.0))
        parts.append(paint(sphere(f'Glint {k}', r * .26, (x - r * .34, -.012 - r * .78, z + r * .42), glint, seg=6, rings=4), 1.0))
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
    for k, (x, y, h, r, tones) in enumerate(((0, .02, .62, .19, ('#ffd23a', '#ff5a14')), (-.17, -.02, .42, .13, ('#ffc02a', '#ff4a10')),
                                             (.17, .0, .46, .13, ('#ffc02a', '#ff4a10')), (.0, -.10, .32, .10, ('#fff3a0', '#ffc02a')))):
        prof = [(0, 0), (r, h * .16), (r * .82, h * .42), (r * .36, h * .78), (0, h)]
        z0 = .24
        fl = lathe(f'Flame {k}', prof, flame, seg=8, loc=(x, y, z0))
        apply_transform(fl)
        for v in fl.data.vertices:
            v.co.x += .07 * ((v.co.z - z0) / h) ** 2 * math.sin(k * 2.1 + 1)
        lo, hi = srgb(tones[0]), srgb(tones[1])
        parts.append(paint(fl, lambda co, h=h, lo=lo, hi=hi, z0=z0: tuple(lerp(lo[i], hi[i], smooth((co.z - z0) / h * 1.2)) for i in range(3))))
    for c in coals:
        bpy.data.objects.remove(c, do_unlink=True)          # hidden under the heap while it burns
    place(parts, Matrix.Scale(.86, 4))
    roasted = potato_roasted()
    place([roasted], Matrix.Translation((.02, -.62, 0)) @ Matrix.Scale(4.4, 4))
    root = baked(parts, 'trick_roast', dict(rays=24, distance=.12, strength=.45, ground=0.0))
    set_parent(roasted, root)
    export('trick-roast', [root], out_dir=SCENES)


def scene_beetles():
    """The rhinoceros beetle at the sap: the beetle fills the card, standing on a short slanting oak branch with
    golden sap running down the bark under its horn."""
    reset()
    BARK = '#c9925a'
    bark = mat('Bark', BARK, rough=.8)
    sap = mat('Sap', '#ffb21c', rough=.1, emit=.5, emit_color='#ff9a10')
    R = .024
    a, b = V(.056, 0, -.016), V(-.066, 0, .004)
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
    # sap: a big glossy patch on the viewer's side of the branch with two fat drips
    sc = a.lerp(b, .80) + (up * .55 - Yv * .83).normalized() * (R + .0014)
    n = (sc - a.lerp(b, .80)).normalized()
    w = axis.cross(n)
    ring = [sc + axis * math.cos(TAU * i / 8) * (.026 + .005 * math.sin(i * 2)) + w * math.sin(TAU * i / 8) * .016 for i in range(8)]
    parts.append(paint(fan('Sap', sc + n * .004, ring, sap, up=n), 1.0))
    for k, (t, dz, r) in enumerate(((.86, -.020, .0075), (.72, -.014, .0055))):
        parts.append(paint(sphere(f'Sap drip {k}', (r, r, r * 1.9), a.lerp(b, t) + V(0, -R - .001, dz), sap, seg=6, rings=4), 1.0))
    root = baked(parts, 'trick_beetles', dict(rays=24, distance=.03, strength=.4))
    beetle = posed_copy('beetle-rhino', 'Idle', .45, 'Beetle')
    slope = math.atan2(axis.z, -axis.x)                     # the branch climbs toward -X
    beetle.matrix_world = (Matrix.Translation(a.lerp(b, .40) + up * (R - .001)) @ Matrix.Rotation(-slope, 4, 'Y')
                           @ Matrix.Rotation(math.radians(-90), 4, 'Z') @ Matrix.Scale(2.35, 4))
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
