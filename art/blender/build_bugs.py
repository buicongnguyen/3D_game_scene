"""Starline bugs for the bug-catching games: grasshopper, praying mantis, bug cage (+ the cricket, in build_critters.py).

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_bugs.py [-- --only grasshopper,mantis,bug-cage] [--no-save]
blender -b --factory-startup --python art/blender/build_bugs.py -- --icons
    -> .tools/review/trick-scenes/trick-{hoppers,cricket}.glb (review-only scenes), then
       render_icons.py -- --models .tools/review/trick-scenes trick-hoppers trick-cricket
       and render_icons.py -- grasshopper mantis bug-cage cricket
Afterwards: node art/blender/validate_glb.mjs grasshopper mantis bug-cage cricket   (must report 0 errors, 0 warnings)

Conventions as build_critters.py / build_tricks2.py: real size, z up, the bug faces -Y (three +Z), origin on the ground
under the body, colour painted into COLOR_0 over baked AO, <= 3 materials. Every leg is two bones (`leg{n}_{L|R}` = hip >
knee, `shin{n}_{L|R}` = knee > claw, n = 1 front, 2 middle, 3 hind) and the clips are posed by two-bone IK (bug_kit.py), so
claws stay planted in Idle / Walk and the body can breathe, sway or rear up over them.

  grasshopper  4 cm, Idle (3 s), Walk (0.8 s loop, 13 mm/s), Hop (0.6 s once), Struggle (0.4 s loop, held)
               materials 'Hopper body' (the tintable green: set its colour for the brown form), 'Hopper stripe', 'Hopper eye'
  mantis       8 cm, Idle, Walk (1.2 s loop), Look / LookR (0.8 s once), Strike (0.3 s once), Threat (1.2 s once, ends in the
               pose), Struggle (0.5 s loop); materials 'Mantis body', 'Mantis wing', 'Mantis eye'
  bug-cage     20 cm tall bamboo mushikago, child node 'lid' (origin at the rim, lift it by moving the node)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *  # noqa: F401,F403
from kit import ROOT
from rig import build_armature, clip, export_rigged
from animal_kit import S, C, pulse, window, smooth, lerp, tri_count
from build_critters import (paint, bake_paint, fan, wing, stick, ell_patch, rot, Parts, finish, Xv, Yv, Zv)
import bug_kit
from bug_kit import (V, sx, make_legs, leg_bones, solve_legs, stride_target, to_body, skinned_leg, leg_ik, CLAMPED)
from build_tricks2 import tint, polys, squarish, cap_end, baked, posed_copy, place
from mathutils import Matrix, Quaternion, Euler

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ALL = ['grasshopper', 'mantis', 'bug-cage']
ONLY = ALL
if '--only' in ARGV:
    ONLY = [n.strip() for n in ARGV[ARGV.index('--only') + 1].split(',') if n.strip()]
BUDGET = {'grasshopper': 350, 'mantis': 400, 'bug-cage': 300}
SCENES = os.path.join(ROOT, '.tools', 'review', 'trick-scenes')
RESULTS = {}


def ring_paint(ob, verts, colors):
    """Paint a tube by ring: colors[i] (r, g, b) for every vertex of ring i."""
    ob['_paint'] = [x for c in colors for _ in range(verts) for x in c]
    return paint(ob, 1.0)


def export_bug(name, arm):
    info = export_rigged(name, arm)
    RESULTS[name] = dict(tris=info['tris'], bytes=info['bytes'], mats=info['materials'], clips=info['animations'])
    assert info['tris'] <= BUDGET[name], f'{name}: {info["tris"]} tris > {BUDGET[name]}'
    assert info['materials'] <= 3, f'{name}: {info["materials"]} materials'
    return info


def twitch(p, ph=0.0):
    return pulse(p, .16 + ph, .035) + pulse(p, .58 + ph, .03) + pulse(p, .66 + ph, .03)


def antennae(p, amp=1.0):
    return {'antenna_L': (-10 * twitch(p) * amp, 0, 9 * S(p, 1, .1) * amp + 8 * twitch(p)),
            'antenna_R': (-10 * twitch(p, .21) * amp, 0, -9 * S(p, 1, .35) * amp - 8 * twitch(p, .21))}


def with_antennae(ch, amp=1.0):
    for b in ('antenna_L', 'antenna_R'):
        ch[b] = (lambda b: lambda p: antennae(p, amp)[b])(b)
    return ch


def reach(L):
    return (L['knee'] - L['hip']).length + (L['foot'] - L['knee']).length

# ====================================================================== GRASSHOPPER


def build_grasshopper():
    """Rice-field grasshopper (batta / chau chau), 4 cm: fresh green with a cream stripe down the back and the
    pronotum, a big round head and eye, long thin antennae, wing cases folded along the back past the abdomen, and
    the hind legs a grasshopper is known for: a fat femur folded back along the body, the tibia folded forward
    under it. All colour of the body is the material 'Hopper body' (the game sets its colour for the brown form;
    the stripe has its own material)."""
    reset()
    BASE = '#7cc83a'
    body_m = mat('Hopper body', BASE, rough=.5)
    body_m['variants'] = '#7cc83a,#a0703a'
    stripe_m = mat('Hopper stripe', '#efe7a4', rough=.55)
    eye_m = mat('Hopper eye', '#4a3114', rough=.15)
    PIV = V(0, .004, .0100)
    legs = make_legs([dict(n=1, hip=V(.0030, -.0092, .0098), knee=V(.0078, -.0150, .0135), foot=V(.0105, -.0195, .0004)),
                      dict(n=2, hip=V(.0030, -.0040, .0096), knee=V(.0085, -.0075, .0142), foot=V(.0125, -.0102, .0004)),
                      dict(n=3, hip=V(.0046, .0010, .0106), knee=V(.0078, .0205, .0152), foot=V(.0104, .0042, .0003))])
    bones = [('root', (0, 0, 0), (0, 0, .004), None),
             ('body', PIV, (0, -.010, .0100), 'root'),
             ('head', (0, -.0105, .0108), (0, -.0185, .0108), 'body')]
    ant = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        ant[sd] = [sx(V(.0016, -.0178, .0146), s), sx(V(.0050, -.0250, .0192), s), sx(V(.0086, -.0335, .0222), s)]
        bones.append((f'antenna_{sd}', ant[sd][0], ant[sd][2], 'head'))
    bones += leg_bones(legs)
    arm = build_armature('Grasshopper', bones)

    GREEN, BACK, BELLY = (.80, .94, .80), (.70, .86, .70), (.98, 1.0, .78)
    P = Parts()
    thorax = sphere('Hopper thorax', (.0044, .0135, .0042), V(0, .0065, .0098), body_m, seg=6, rings=4)
    for v in thorax.data.vertices:                              # tapers toward the tail
        t = max(0.0, (v.co.y - .0045) / .009)
        v.co.x *= 1 - .45 * t
        v.co.z *= 1 - .35 * t
    P.add(thorax, 'body', lambda co: BELLY if co.z < .0086 else (BACK if co.z > .0108 else GREEN))
    Pc, Pr = V(0, -.0066, .0115), (.0050, .0064, .0046)
    P.add(sphere('Hopper pronotum', Pr, Pc, body_m, seg=6, rings=4), 'body', lambda co: BACK if co.z > .0112 else GREEN)
    P.add(ell_patch('Hopper pronotum stripe', Pc, tuple(r * 1.08 for r in Pr), -16, 16, math.radians(28), math.radians(150), 1, 2,
                    stripe_m), 'body', 1.0)
    # wing cases folded along the back, reaching past the abdomen: a cream centre strip and one case on each side
    Wc, Wr = V(0, .0085, .0100), (.0052, .0160, .0050)
    t0, t1 = math.radians(58), math.radians(168)
    P.add(ell_patch('Hopper back stripe', Wc, Wr, -12, 12, t0, t1, 1, 4, stripe_m), 'body', 1.0)
    for s, sd in ((1, 'L'), (-1, 'R')):
        a0, a1 = (12, 72) if s > 0 else (-72, -12)
        P.add(ell_patch(f'Hopper wing case {sd}', Wc, Wr, a0, a1, t0, t1, 2, 4, body_m), 'body', (.66, .80, .52))
    P.add(sphere('Hopper head', (.0046, .0058, .0064), V(0, -.0152, .0108), body_m, seg=6, rings=4), 'head', (.86, .98, .78))
    for s, sd in ((1, 'L'), (-1, 'R')):
        P.add(sphere(f'Hopper eye {sd}', (.0021, .0026, .0027), sx(V(.0036, -.0158, .0128), s), eye_m, seg=5, rings=3), 'head',
              lambda co: .55 if co.y < -.0170 else 1.0)
        P.add(stick(f'Hopper antenna {sd}', ant[sd], .0006, body_m, taper=.15), f'antenna_{sd}', (.55, .7, .45))
    for L in legs:
        s = 1 if L['sd'] == 'L' else -1
        if L['n'] < 3:
            ob = skinned_leg(tube, f'Hopper leg{L["n"]} {L["sd"]}', L, [L['hip'], L['knee'], L['foot']], (.0012, .0010, .0003), body_m)
            ring_paint(ob, 3, [(.8, .94, .8), (.7, .86, .55), (.5, .4, .22)])
        else:
            mid = L['hip'].lerp(L['knee'], .45) + sx(V(.0004, 0, .0010), s)
            ob = skinned_leg(tube, f'Hopper hind leg {L["sd"]}', L, [L['hip'], mid, L['knee'], L['knee'].lerp(L['foot'], .5), L['foot']],
                             (.0028, .0044, .0022, .0013, .0004), body_m, verts=4, leg_rings=3)
            ring_paint(cap_end(ob, 4), 4, [(.66, .82, .56), (.62, .80, .50), (.5, .38, .2), (.92, .9, .52), (.5, .4, .22)])
        P.append(ob)
    finish('grasshopper', arm, P, dict(rays=32, distance=.012, strength=.5, ground=0.0))

    GROUP_A = {(1, 'L'), (3, 'L'), (2, 'R')}
    flat = lambda L, p: L['foot']

    # Idle (3 s): breathing, antenna twitches, chewing in two bursts, one hind claw lifts and sets down again
    rot_i = lambda p: (.8 * S(p, 3), 0, 1.0 * S(p, 1, .2))
    loc_i = lambda p: (0, 0, .0002 * S(p, 3))

    def idle_foot(L, p):
        k = pulse(p, .55, .05) if L['leg'] == 'leg3_L' else (pulse(p, .2, .05) if L['leg'] == 'leg1_R' else 0.0)
        return L['foot'] + V(0, -.0012 * k, .0028 * k)

    def chew(p):
        return window(p, .08, .42, .3) + window(p, .62, .9, .3)
    ch = {'body@loc': loc_i, 'body': rot_i,
          'head': lambda p: (3 * S(p, 9) * chew(p) + 1.5 * S(p, 1, .1), 0, 3 * S(p, 1, .3))}
    ch.update(solve_legs(legs, PIV, rot_i, loc_i, idle_foot))
    clip(arm, 'Idle', 90, with_antennae(ch))

    # Walk (loop 0.8 s): tripod gait, each claw planted 56% of the loop and travelling straight back 6 mm
    rot_w = lambda p: (0, 1.5 * S(p, 1), 1.2 * S(p, 1, .25))
    loc_w = lambda p: (0, 0, .0003 * C(p, 2))
    ch = {'body@loc': loc_w, 'body': rot_w, 'head': lambda p: (1.5 * S(p, 2), 0, -1.5 * S(p, 1, .25))}
    ch.update(solve_legs(legs, PIV, rot_w, loc_w, lambda L, p: stride_target(L, p, GROUP_A, .0060, .56, .0030)))
    clip(arm, 'Walk', 24, with_antennae(ch, .6))
    assert not CLAMPED[0], f'grasshopper walk: {CLAMPED[0]} leg targets out of reach'

    # Hop (once, 0.6 s, in place): crouch, the hind legs push and straighten as the body pitches nose-up, 3 cm arc with
    # the hind legs trailing straight back and the other legs tucked, then reach for the ground and settle
    def crouch(p):
        return window(p, 0, .28, .5) + .7 * window(p, .8, 1.0, .5)

    def air(p):
        return math.sin(math.pi * (p - .28) / .57) if .28 < p < .85 else 0.0
    rot_h = lambda p: (6 * crouch(p) - 36 * window(p, .24, .55, .4) + 22 * window(p, .55, .88, .4), 0, 0)
    loc_h = lambda p: (0, 0, .03 * air(p) - .0022 * crouch(p))

    def trail(L):
        d = Vector((.12 * (1 if L['sd'] == 'L' else -1), .9, -.36)).normalized()
        return L['hip'] + d * reach(L) * .985

    def hop_local(L, p):
        base = to_body(PIV, rot_h, loc_h, p, L['foot'])
        if L['n'] == 3:
            w = smooth((p - .26) / .16) * (1 - smooth((p - .80) / .13))
            return base.lerp(trail(L), w)
        return base + V(0, .004, .008) * window(p, .22, .84, .3)
    ch = {'body@loc': loc_h, 'body': rot_h, 'head': lambda p: (-8 * window(p, .25, .6, .4), 0, 0)}
    ch.update(solve_legs(legs, PIV, rot_h, loc_h, flat, hop_local))
    ch['antenna_L'] = lambda p: (28 * window(p, .22, .85, .3), 0, -8 * window(p, .22, .85, .3))
    ch['antenna_R'] = lambda p: (28 * window(p, .22, .85, .3), 0, 8 * window(p, .22, .85, .3))
    clip(arm, 'Hop', 18, ch, loop=False)
    CLAMPED[0] = 0

    # Struggle (loop 0.4 s, held in a hand): the hind legs kick in turn, the others flail in circles, the body writhes
    rot_s = lambda p: (4 * S(p, 2), 6 * S(p, 1), 14 * S(p, 2, .1))
    loc_s = lambda p: (0, 0, .0006 * S(p, 4))

    def str_local(L, p):
        ph = (0.0 if L['sd'] == 'L' else .5) + (L['n'] - 1) * .17
        if L['n'] == 3:
            k = .5 + .5 * S(p, 2, ph)
            ext = L['hip'] + Vector((.22 * (1 if L['sd'] == 'L' else -1), .9, .1)).normalized() * reach(L) * .96
            return (L['foot'] + V(0, 0, .004)).lerp(ext, k)
        a = TAU * (2 * p + ph)
        return L['foot'] + V(.0055 * math.cos(a), .0055 * math.sin(a), .0085 + .0025 * math.sin(a * .5))
    ch = {'body@loc': loc_s, 'body': rot_s, 'head': lambda p: (0, 0, 12 * S(p, 2, .5))}
    ch.update(solve_legs(legs, PIV, rot_s, loc_s, flat, str_local))
    clip(arm, 'Struggle', 12, with_antennae(ch, 1.6))
    CLAMPED[0] = 0
    export_bug('grasshopper', arm)

# ====================================================================== MANTIS


def build_mantis():
    """Praying mantis (kamakiri / bo ngua), 8 cm: slim green body, a triangular head on a long thin prothorax with big
    eyes, the two raptorial forelegs folded in the praying pose (spined, femur forward-up, tibia folded back), long thin
    middle and hind legs, two long wing cases folded along the back over the cream hind wings that Threat fans out."""
    reset()
    BASE = '#78bd38'
    body_m = mat('Mantis body', BASE, rough=.5)
    wing_m = mat('Mantis wing', '#e6dcb4', rough=.6, double=True)
    eye_m = mat('Mantis eye', '#d9d27a', rough=.2)
    PIV = V(0, .0140, .0165)
    legs = make_legs([dict(n=1, hip=V(.0030, -.0100, .0228), knee=V(.0042, -.0300, .0330), foot=V(.0030, -.0212, .0415)),
                      dict(n=2, hip=V(.0030, .0075, .0158), knee=V(.0125, .0020, .0255), foot=V(.0215, .0080, .0005)),
                      dict(n=3, hip=V(.0030, .0150, .0155), knee=V(.0120, .0190, .0250), foot=V(.0200, .0260, .0005))])
    NECK = V(0, -.0215, .0300)
    bones = [('root', (0, 0, 0), (0, 0, .004), None),
             ('body', PIV, (0, -.0050, .0180), 'root'),
             ('head', NECK, (0, -.0270, .0318), 'body')]
    ant, wr = {}, {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        ant[sd] = [sx(V(.0016, -.0268, .0350), s), sx(V(.0035, -.0320, .0390), s), sx(V(.0056, -.0385, .0426), s)]
        bones.append((f'antenna_{sd}', ant[sd][0], ant[sd][2], 'head'))
        bones += [(f'wing_{sd}', sx(V(.0010, .0010, .0212), s), sx(V(.0012, .0430, .0190), s), 'body'),
                  (f'hind_{sd}', sx(V(.0008, .0020, .0200), s), sx(V(.0010, .0360, .0185), s), 'body')]
    bones += leg_bones(legs)
    arm = build_armature('Mantis', bones)

    P = Parts()
    DK, LT = (.82, .94, .82), (.98, 1.0, .80)
    rings = [V(0, -.0030, .0178), V(0, .0070, .0172), V(0, .0180, .0168), V(0, .0290, .0162), V(0, .0385, .0152)]
    rad = (.0022, .0026, .0030, .0023, .0006)
    ab = cap_end(tube('Mantis body', rings, 1.0, body_m, verts=6, caps=False,
                      radius_fn=lambda t: rad[int(round(t * 4))]), 6)
    ring_paint(ab, 6, [DK, DK, (.76, .9, .76), (.74, .86, .62), (.6, .7, .45)])
    P.append(bind_all(ab, 'body'))
    pro = tube('Mantis prothorax', [V(0, -.0020, .0185), V(0, -.0125, .0245), NECK], 1.0, body_m, verts=5, caps=False,
               radius_fn=lambda t: (.0021, .0019, .0016)[int(round(t * 2))])
    ring_paint(cap_end(pro, 5), 5, [DK, (.9, 1.0, .85), (.95, 1.0, .85)])
    P.append(bind_all(pro, 'body'))
    head = sphere('Mantis head', (.0050, .0030, .0042), V(0, -.0252, .0318), body_m, seg=6, rings=4)
    for v in head.data.vertices:                              # a triangle: wide across the eyes, narrow at the mouth
        v.co.x *= lerp(.45, 1.0, (v.co.z / .0042 + 1) / 2)
    P.add(head, 'head', (.9, 1.0, .8))
    for s, sd in ((1, 'L'), (-1, 'R')):
        P.add(sphere(f'Mantis eye {sd}', (.0021, .0021, .0027), sx(V(.0044, -.0258, .0340), s), eye_m, seg=5, rings=3), 'head',
              lambda co: .28 if co.y < -.0264 else 1.0)
        P.add(stick(f'Mantis antenna {sd}', ant[sd], .0006, body_m, taper=.15), f'antenna_{sd}', (.6, .8, .5))
    for L in legs:
        s = 1 if L['sd'] == 'L' else -1
        if L['n'] == 1:
            S_, K, T = L['hip'], L['knee'], L['foot']
            ob = skinned_leg(tube, f'Mantis foreleg {L["sd"]}', L, [S_, S_.lerp(K, .5) + V(0, 0, -.0010), K, K.lerp(T, .5), T],
                             (.0015, .0026, .0017, .0011, .0004), body_m, verts=4, leg_rings=3)
            ring_paint(ob, 4, [(.8, .94, .8), (.92, 1.0, .8), (.86, .9, .62), (.9, .92, .66), (.5, .4, .22)])
            P.append(ob)
            # spines: cream teeth along the femur (pointing up toward the tibia) and the tibia (pointing down)
            for bone, a, b, tl, dirn, w in ((L['leg'], S_, K, (.3, .65), V(0, .0004, .0042), .0024),
                                            (L['shin'], K, T, (.4, .75), V(0, -.0006, -.0038), .0017)):
                u = (b - a).normalized()
                for t in tl:
                    p0 = a.lerp(b, t) + V(-.0006 * s, 0, 0)
                    P.add(polys(f'Mantis spine {L["sd"]}{bone}{t}', [[p0 - u * w, p0 + u * w, p0 + dirn + V(-.0004 * s, 0, 0)]], wing_m),
                          bone, (1.0, 1.0, .82))
        else:
            ob = skinned_leg(tube, f'Mantis leg{L["n"]} {L["sd"]}', L, [L['hip'], L['knee'], L['foot']], (.0015, .0012, .0004), body_m)
            ring_paint(ob, 3, [(.85, .96, .82), (.78, .92, .6), (.55, .5, .28)])
            P.append(ob)
    # wing cases (green) over the folded hind wings (cream): leaf-shaped, narrow, reaching past the tail
    tg = (tint('#6fb238', '#e6dcb4'), tint('#8cc84c', '#e6dcb4'), tint('#a6d65f', '#e6dcb4'))
    HW = (.96, .84, .82)
    for s, sd in ((1, 'L'), (-1, 'R')):
        out = [V(.0034, .0070, .0211), V(.0054, .0180, .0206), V(.0053, .0300, .0198), V(.0032, .0400, .0192),
               V(.0012, .0440, .0189), V(.0004, .0330, .0194), V(.0004, .0190, .0199), V(.0004, .0070, .0208)]
        P.add(wing(f'Mantis wing case {sd}', sx(V(.0010, .0010, .0212), s), [sx(o, s) for o in out], wing_m, rings=(.5,),
                   colors=[tg[0], tg[1], tg[2]]), f'wing_{sd}')
        hout = [V(.0044, .0070, .0199), V(.0046, .0170, .0194), V(.0036, .0290, .0188), V(.0016, .0370, .0184),
                V(.0006, .0290, .0189), V(.0006, .0150, .0195)]
        P.add(wing(f'Mantis hind wing {sd}', sx(V(.0008, .0020, .0200), s), [sx(o, s) for o in hout], wing_m, rings=(.5,),
                   colors=[HW, (1.0, .92, .88), (.9, .62, .55)]), f'hind_{sd}')
    finish('mantis', arm, P, dict(rays=32, distance=.014, strength=.5, ground=0.0))

    A_ = {(2, 'L'), (3, 'R')}
    fore = {L['leg']: L for L in legs if L['n'] == 1}
    flat = lambda L, p: L['foot']

    def held(L, p, dx=0.0, dy=0.0, dz=0.0):
        return L['foot'] + V(dx, dy, dz)

    # Idle (3 s): sways like a leaf in a light wind, forelegs and head tilt slowly, antennae drift, claws planted
    rot_i = lambda p: (.8 * S(p, 1, .1), 1.8 * S(p, 1), 3 * S(p, 1, .25))
    loc_i = lambda p: (0, 0, .0003 * S(p, 2))

    def idle_local(L, p):
        if L['n'] != 1:
            return None
        k = 1 if L['sd'] == 'L' else -1
        return held(L, p, .0008 * S(p, 1, .3) * k, .0010 * S(p, 1, .1), .0010 * S(p, 2, .2))
    ch = {'body@loc': loc_i, 'body': rot_i,
          'head': lambda p: (2 * S(p, 1, .3), -14 * pulse(p, .55, .14) + 3 * S(p, 1, .4), 8 * S(p, 1, .1) + 10 * pulse(p, .2, .08))}
    ch.update(solve_legs(legs, PIV, rot_i, loc_i, flat, idle_local))
    clip(arm, 'Idle', 90, with_antennae(ch, .8))

    # Walk (loop 1.2 s): slow stalking, diagonal pairs of the four walking legs, forelegs held up and swaying
    rot_w = lambda p: (0, 1.6 * S(p, 1), 3 * S(p, 1, .25))
    loc_w = lambda p: (0, 0, .0004 * C(p, 2))

    def walk_local(L, p):
        if L['n'] != 1:
            return None
        k = 1 if L['sd'] == 'L' else -1
        return held(L, p, .0010 * S(p, 1) * k, .0020 * S(p, 1, .25 if L['sd'] == 'L' else .75), .0012 * C(p, 2))
    ch = {'body@loc': loc_w, 'body': rot_w, 'head': lambda p: (1.2 * S(p, 2), 0, -3 * S(p, 1, .25))}
    ch.update(solve_legs(legs, PIV, rot_w, loc_w, lambda L, p: stride_target(L, p, A_, .0080, .60, .0035), walk_local))
    clip(arm, 'Walk', 36, with_antennae(ch, .5))
    assert not CLAMPED[0], f'mantis walk: {CLAMPED[0]} leg targets out of reach'

    # Look / LookR (0.8 s once): the head swivels 55 degrees to one side and tilts, holds a moment, comes back
    def look(sign):
        def f(p):
            h = window(p, 0, 1, .42)
            return (6 * h, -sign * 14 * h, sign * 55 * h)
        return f
    for nm, sign in (('Look', 1), ('LookR', -1)):
        rot_l = (lambda sg: lambda p: (0, 0, sg * 10 * window(p, 0, 1, .42)))(sign)
        ch = {'head': look(sign), 'body': rot_l, 'body@loc': lambda p: (0, 0, 0)}
        ch.update(solve_legs(legs, PIV, rot_l, lambda p: (0, 0, 0), flat, idle_local_rest(held)))
        clip(arm, nm, 24, with_antennae(ch, .5), loop=False)

    # Strike (0.3 s once): both forelegs snap straight out and back, the body lunges a little
    def sstr(p):
        return smooth(p / .3) * (1 - smooth((p - .45) / .5))
    tip = V(.0035, -.0425, .0310)
    rot_k = lambda p: (7 * sstr(p), 0, 0)
    loc_k = lambda p: (0, -.0008 * sstr(p), 0)

    def strike_local(L, p):
        if L['n'] != 1:
            return None
        return L['foot'].lerp(sx(tip, 1 if L['sd'] == 'L' else -1), sstr(p))
    ch = {'body': rot_k, 'body@loc': loc_k, 'head': lambda p: (-8 * sstr(p), 0, 0)}
    ch.update(solve_legs(legs, PIV, rot_k, loc_k, flat, strike_local))
    clip(arm, 'Strike', 9, ch, loop=False)
    CLAMPED[0] = 0

    # Threat (1.2 s once, ends in the pose): rears up on its four walking legs, forelegs spread wide, wings fanned
    def rise(p):
        return smooth(p / .3)
    rot_t = lambda p: (-38 * rise(p) + 1.2 * S(p, 5) * rise(p), 0, 2.5 * S(p, 3) * rise(p))
    loc_t = lambda p: (0, 0, .012 * rise(p))
    spread = V(.0210, -.0300, .0400)

    def threat_local(L, p):
        if L['n'] != 1:
            return None
        return L['foot'].lerp(sx(spread, 1 if L['sd'] == 'L' else -1), rise(p))
    ch = {'body': rot_t, 'body@loc': loc_t, 'head': lambda p: (22 * rise(p), 0, 4 * S(p, 4) * rise(p))}
    ch.update(solve_legs(legs, PIV, rot_t, loc_t, flat, threat_local))
    for s, sd in ((1, 'L'), (-1, 'R')):
        ch[f'wing_{sd}'] = (lambda s: lambda p: rot((Zv, -s * 38 * rise(p)), (Yv, -s * 28 * rise(p) + s * 3 * S(p, 6) * rise(p))))(s)
        ch[f'hind_{sd}'] = (lambda s: lambda p: rot((Zv, -s * 75 * rise(p)), (Yv, -s * 50 * rise(p) + s * 4 * S(p, 6, .25) * rise(p))))(s)
    ch['antenna_L'] = lambda p: (-18 * rise(p), 0, 10 * rise(p))
    ch['antenna_R'] = lambda p: (-18 * rise(p), 0, -10 * rise(p))
    clip(arm, 'Threat', 36, ch, loop=False)
    CLAMPED[0] = 0

    # Struggle (loop 0.5 s, held): every leg flails, the body twists, the wings buzz
    rot_s = lambda p: (6 * S(p, 2), 10 * S(p, 1), 18 * S(p, 2, .25))
    loc_s = lambda p: (0, 0, .001 * S(p, 2))

    def str_local(L, p):
        ph = (0.0 if L['sd'] == 'L' else .5) + (L['n'] - 1) * .17
        a = TAU * (2 * p + ph)
        if L['n'] == 1:
            return L['foot'] + V(.006 * math.cos(a), .008 * math.sin(a), .004 * math.cos(2 * a))
        return L['foot'] + V(.0060 * math.cos(a), .0060 * math.sin(a), .0095 + .0030 * math.sin(a * .5))
    ch = {'body@loc': loc_s, 'body': rot_s, 'head': lambda p: (0, 0, 14 * S(p, 2, .5))}
    ch.update(solve_legs(legs, PIV, rot_s, loc_s, flat, str_local))
    for s, sd in ((1, 'L'), (-1, 'R')):
        ch[f'wing_{sd}'] = (lambda s: lambda p: rot((Zv, -s * (9 + 8 * S(p, 4)))))(s)
    clip(arm, 'Struggle', 15, with_antennae(ch, 1.6))
    CLAMPED[0] = 0
    export_bug('mantis', arm)


def bind_all(ob, bone):
    from rig import bind
    return bind(ob, bone)


def idle_local_rest(held):
    """Look / LookR: the forelegs stay folded in the body's rest pose."""
    return lambda L, p: (L['foot'] if L['n'] == 1 else None)

# ====================================================================== BUG CAGE


def revolve(name, profile, seg, material):
    """A surface of revolution about Z from [(radius, z), ...] with no end caps (a zero radius closes into a pole)."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(TAU * i / seg), r * math.sin(TAU * i / seg), z)) for i in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            if len(b) == 1:
                bm.faces.new((a[i], b[0], a[j]))
            else:
                bm.faces.new((a[i], b[i], b[j], a[j]))
    return from_bmesh(name, bm, material, smooth_angle=60)


def build_bug_cage():
    """Mushikago, 20 cm tall: a round cage of 20 vertical bamboo slats with three bands of dark wood, a domed lid with a
    hook handle (child node 'lid', origin at the rim so the game can lift or tilt it) and a leaf and twig inside."""
    reset()
    bamboo = mat('Cage bamboo', '#d9b062', rough=.6, double=True)
    wood = mat('Cage wood', '#a56d34', rough=.7, double=True)
    leaf_m = mat('Cage leaf', '#4fb83a', rough=.6, double=True)
    R, H = .075, .125
    tint_w, tint_l = tint('#a56d34', '#d9b062'), tint('#4fb83a', '#d9b062')
    parts = []
    # slats: flat strips on the circle, alternating shades, a node (darker band) in the middle
    N = 20
    for i in range(N):
        a = TAU * i / N
        c = V(math.cos(a) * R, math.sin(a) * R, 0)
        t = V(-math.sin(a), math.cos(a), 0) * .0078
        q = [c - t + V(0, 0, .010), c + t + V(0, 0, .010), c + t + V(0, 0, H - .010), c - t + V(0, 0, H - .010)]
        parts.append(paint(polys(f'Slat {i}', [q], bamboo), (1.0, .96, .9) if i % 2 else (.92, .86, .74)))
    # three bands and the floor
    for k, (z0, z1) in enumerate(((0, .018), (.052, .060), (H - .018, H))):
        band = revolve(f'Band {k}', [(R + .004, z0), (R + .004, z1)], 16, wood)
        parts.append(paint(band, tint_w if k != 1 else (.78, .6, .42)))
    parts.append(paint(fan('Floor', V(0, 0, .012), [V(math.cos(TAU * i / 16) * (R + .002), math.sin(TAU * i / 16) * (R + .002), .012)
                                                      for i in range(16)], bamboo, up=Zv), (.7, .55, .38)))
    # inside: a twig leaning on the wall with two leaves
    twig = tube('Twig', [V(-.030, .020, .014), V(-.012, .004, .046), V(.010, -.012, .080)], .0042, wood, verts=3, caps=True,
                radius_fn=lambda t: (1.0, .8, .45)[int(round(t * 2))])
    parts.append(paint(twig, (.9, .8, .7)))
    for k, (c, u, w) in enumerate(((V(.010, -.012, .080), V(.55, -.3, .55).normalized(), V(.3, .9, 0).normalized()),
                                   (V(-.012, .004, .048), V(-.7, .2, .45).normalized(), V(.2, .6, .7).normalized()))):
        lf = fan(f'Leaf {k}', c + u * .020, [c, c + u * .018 + w * .014, c + u * .046, c + u * .018 - w * .014], leaf_m)
        parts.append(paint(lf, lambda co, c=c: tuple(x * .8 for x in tint_l) if (co - c).length < .012 else tint_l))
    print('bug-cage', tri_count(parts), 'tris before the lid')
    root = baked(parts, 'bug_cage', dict(rays=24, distance=.04, strength=.45, ground=0.0))
    # lid: a shallow dome with a hook handle, origin at the middle of its rim
    lid_parts = []
    dome = revolve('Lid dome', [(R + .010, 0), (R + .010, .012), (.056, .036), (0, .052)], 12, wood)
    lid_parts.append(paint(dome, lambda co: tint_w if co.z < .014 else (1.0, .9, .8)))
    arc = [V(math.cos(math.radians(a)) * .032, 0, .048 + math.sin(math.radians(a)) * .034) for a in (180, 150, 105, 75, 30, 0)]
    hook = tube('Lid hook', [V(.0, 0, .0) + p for p in arc], .0034, wood, verts=3, caps=True)
    lid_parts.append(paint(hook, (.9, .8, .7)))
    lid_parts = [o for o in lid_parts]
    for o in lid_parts:
        o.location.z = H
    bpy.context.view_layer.update()
    lid = baked(lid_parts, 'lid', dict(rays=16, distance=.03, strength=.35))
    assert abs(lid.location.z - H) < 1e-6, lid.location          # join keeps the first part's origin: the rim
    set_parent(lid, root)
    info = export('bug-cage', [root])
    RESULTS['bug-cage'] = dict(tris=info['tris'], bytes=info['bytes'], mats=info['materials'], clips=[])
    assert info['tris'] <= BUDGET['bug-cage'] and info['materials'] <= 3, info
    return info

# ====================================================================== ICON SCENES (review-only GLBs)


def scene_hoppers():
    """A grasshopper and a mantis on a curved grass blade, a round summer-meadow medallion behind."""
    reset()
    sky = mat('Sky', '#ffffff', rough=.8)
    hill = mat('Hill', '#ffffff', rough=.8)
    blade_m = mat('Blade', '#4fbf3f', rough=.5, double=True)
    disc = cyl('Sky', .27, .02, (0, .30, .02), sky, verts=36, rot=(math.radians(90), 0, 0))
    lo, hi = srgb('#d9f0ff'), srgb('#5fb4f0')
    paint(disc, lambda co: tuple(lerp(lo[k], hi[k], smooth((co.z + .10) / .45)) for k in range(3)))
    hl = sphere('Hill', (.34, .06, .10), (0, .27, -.21), hill, seg=20, rings=8)
    paint(hl, (.55, .85, .45))
    parts = [disc, hl]
    # the blade: a ribbon arching from the lower left to the upper right, widest in the middle
    pts = [(-.26, -.02, -.12), (-.13, -.02, -.10), (0.0, -.02, -.04), (.14, -.02, .06), (.27, -.02, .20)]
    bm = bmesh.new()
    rows = []
    for k, (x, y, z) in enumerate(pts):
        t = k / (len(pts) - 1)
        w = .060 * math.sin(math.pi * (.12 + .88 * t)) + .008
        rows.append((bm.verts.new((x, y + w, z)), bm.verts.new((x, y - w, z))))
    for (a0, a1), (b0, b1) in zip(rows, rows[1:]):
        bm.faces.new((a0, b0, b1, a1))
    blade = from_bmesh('Blade', bm, blade_m, smooth_angle=60)
    paint(blade, lambda co: (.78, .92, .7) if abs(co.y + .02) < .006 else 1.0)
    parts.append(blade)
    root = baked(parts, 'trick_hoppers', dict(rays=16, distance=.05, strength=.3))
    for model, clipn, frac, at, yaw, sc in (('grasshopper', 'Idle', .2, V(-.10, -.02, -.075), -62, 6.4),
                                            ('mantis', 'Idle', .4, V(.12, -.02, .045), 120, 4.4)):
        o = posed_copy(model, clipn, frac, model)
        o.matrix_world = Matrix.Translation(at) @ Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Rotation(math.radians(-34), 4, 'Y') @ Matrix.Scale(sc, 4)
        set_parent(o, root)
    export('trick-hoppers', [root], out_dir=SCENES)


def note(name, x, z, mat_, scale=1.0):
    """An eighth note in the XZ plane (head, stem, flag), facing -Y."""
    s = scale
    parts = [sphere(name + ' head', (.034 * s, .012 * s, .026 * s), (x, 0, z), mat_, seg=8, rings=5, rot=(0, math.radians(-22), 0)),
             rod(name + ' stem', (x + .030 * s, 0, z + .004 * s), (x + .030 * s, 0, z + .130 * s), .0062 * s, mat_, verts=5),
             polys(name + ' flag', [[V(x + .030 * s, 0, z + .130 * s), V(x + .074 * s, 0, z + .084 * s), V(x + .060 * s, 0, z + .052 * s),
                                     V(x + .030 * s, 0, z + .092 * s)]], mat_, up=-Yv)]
    return parts


def scene_cricket():
    """The singing cricket on a mound in the evening: a round dusk-sky medallion, a thin moon, music notes."""
    reset()
    sky = mat('Sky', '#ffffff', rough=.8)
    hill = mat('Hill', '#ffffff', rough=.8)
    glow = mat('Note', '#ffd23a', emit=1.1, emit_color='#ffb81f')
    moon_m = mat('Moon', '#fff3c0', emit=.9, emit_color='#ffe9a0')
    star_m = mat('Star', '#fff3c0', emit=1.0, emit_color='#ffe9a0')
    disc = cyl('Sky', .36, .02, (0, .26, .04), sky, verts=36, rot=(math.radians(90), 0, 0))
    top, mid, low = srgb('#1c2a78'), srgb('#7a3e8c'), srgb('#ff9a52')

    def dusk(co):
        t = smooth((co.z + .30) / .62)
        return tuple(lerp(lerp(low[k], mid[k], smooth(t * 2)), top[k], smooth(t * 2 - 1)) if t > .5 else lerp(low[k], mid[k], smooth(t * 2)) for k in range(3))
    paint(disc, dusk)
    hl = sphere('Hill', (.46, .12, .15), (0, .15, -.30), hill, seg=20, rings=8)
    paint(hl, (.20, .40, .24))
    parts = [disc, hl]
    parts.append(paint(sphere('Moon', .050, (.20, .24, .22), moon_m, seg=12, rings=8), 1.0))
    for k, (x, z) in enumerate(((-.22, .27), (-.05, .30), (.06, .22), (-.28, .12), (.26, .08))):
        parts.append(paint(sphere(f'Star {k}', .008, (x, .24, z), star_m, seg=5, rings=3), 1.0))
    mound = sphere('Mound', (.26, .16, .06), (0, -.02, -.20), hill, seg=14, rings=6)
    parts.append(paint(mound, (.26, .5, .28)))
    for k, (x, z, sc) in enumerate(((-.20, .15, 1.2), (.15, .20, 1.0), (-.03, .27, .8))):
        for o in note(f'Note {k}', x, z, glow, sc):
            parts.append(paint(o, 1.0))
    root = baked(parts, 'trick_cricket', dict(rays=12, distance=.05, strength=.2))
    o = posed_copy('cricket', 'Sing', .25, 'cricket')
    o.matrix_world = Matrix.Translation(V(.01, -.02, -.12)) @ Matrix.Rotation(math.radians(-50), 4, 'Z') @ Matrix.Scale(13, 4)
    set_parent(o, root)
    export('trick-cricket', [root], out_dir=SCENES)


BUILDERS = {'grasshopper': build_grasshopper, 'mantis': build_mantis, 'bug-cage': build_bug_cage}

if __name__ == '__main__':
    if '--icons' in ARGV:
        os.makedirs(SCENES, exist_ok=True)
        for fn in (scene_hoppers, scene_cricket):
            fn()
    else:
        for nm in ONLY:
            BUILDERS[nm]()
        print('RESULTS')
        for nm, r in RESULTS.items():
            print(f'  {nm:14s} {r["tris"]:5d} tris {r["bytes"]:7d} B mats={r["mats"]} clips={r["clips"]}')
        if '--no-save' not in ARGV:
            save_kit('bugs', [n for n in ALL if os.path.exists(os.path.join(OUT, n + '.glb'))], spacing=.1)
