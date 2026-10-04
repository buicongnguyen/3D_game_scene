"""Starline animals: modelled, rigged, animated and exported from code (Blender 4.5).

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_animals.py [-- --only fox,bear]

Writes public/models/<name>.glb (see art/CONTRACTS.md, "Animal rigs") and the editable
art/blender/source/animals.blend (every exported animal side by side, with its actions).

Conventions: origin at ground centre, animal faces -Y, stands on z=0 (fish: origin at body centre,
swimming along -Y). Root motion stays in place; clips only bob the hips. Legs are driven by
analytic IK (animal_kit.Player) so paws plant without sliding at these runtime speeds (1.0x):

  fox   Walk 1.2 m/s, Run 5.0 m/s      sheep  Walk 0.8 m/s, Run 3.5 m/s     bear  Walk 1.0 m/s
  cat   Walk 0.6 m/s                   deer   Walk 1.3 m/s                  chicken Walk 0.5 m/s
  rabbit Hop 1.6 m/s                   crab   Walk 0.35 m/s sideways (+X, the crab's left)
  cow   Walk 0.7 m/s                   pig    Walk 0.9 m/s                   goat   Walk 1.0 m/s
  dog   Walk 1.1 m/s, Run 4.5 m/s      (the farm animals are authored at real size, no export scale)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *  # noqa: F401,F403
from rig import build_armature, bind, bind_blend, skin, export_rigged, FPS
from animal_kit import *  # noqa: F401,F403
from farm_animal_kit import *  # noqa: F401,F403  (farm animals: cow, pig, goat, dog)

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ALL = ['fox', 'bear', 'sheep', 'crab', 'crow', 'fish-trout', 'fish-starfin', 'fish-koi', 'chicken', 'rabbit',
       'cat', 'duck', 'deer', 'cow', 'pig', 'goat', 'dog']
ONLY = ALL
if '--only' in ARGV:
    ONLY = [n.strip() for n in ARGV[ARGV.index('--only') + 1].split(',') if n.strip()]
NO_SAVE = '--no-save' in ARGV
RESULTS = {}


def V(*a):
    return Vector(a)


def sym(p, s):
    """Mirror a left-side (+X) point to side s (+1 left, -1 right)."""
    return Vector((p[0] * s, p[1], p[2]))


def keys_sym(keys, s):
    return [(k[0] * s,) + tuple(k[1:]) for k in keys]


def eye_mats(prefix, iris=None):
    white = mat(prefix + ' eye', '#f7f4ec', rough=.12, emit=.08)
    pupil = mat(prefix + ' pupil', '#1a1d26', rough=.1)
    ir = mat(prefix + ' iris', iris, rough=.15) if iris else None
    return white, pupil, ir


def make_skin(name, arm, parts, ao):
    parts = [p for p in parts if p is not None]
    heavy = sorted(((tri_count([p]), p.name) for p in parts), reverse=True)[:10]
    print(f'{name}: {tri_count(parts)} tris before export; heaviest {heavy}')
    return skin(parts, arm, name.replace('-', '_') + '_body', ao=ao)


def export_animal(name, arm, player=None, scale=1.0):
    """Export via rig.export_rigged. `scale` uniformly scales the armature object (and so the skinned
    mesh and every clip) to hit the contract size; gaits are authored at speed / scale so paws still plant
    at the stated runtime speeds."""
    if scale != 1.0:
        arm.scale = (scale, scale, scale)
        bpy.context.view_layer.update()
    info = export_rigged(name, arm)
    RESULTS[name] = dict(tris=info['tris'], kb=info['bytes'] // 1024, clips=info['animations'],
                         mats=info['materials'], ik=(player.report if player else {}))
    return info


def realize(flat, eyes=None, lid_deg=125):
    """Flat channel dict (tuples; 'ik:LEG' -> (x, y, z, pitch); 'lids' -> (close, bias, 0)) -> Player pose."""
    pose = {}
    ik = {}
    for k, v in flat.items():
        if k == 'ik':
            for leg, (t, d) in v.items():
                ik[leg] = (Vector(t), d)
        elif k.startswith('ik:'):
            ik[k[3:]] = (Vector(v[:3]), v[3])
        elif k == 'lids':
            if eyes:
                set_lids(pose, eyes, v[0], lid_deg, v[1] if len(v) > 1 else 0.0)
        else:
            pose[k] = v
    if ik:
        pose['ik'] = ik
    return pose


def limb(name, pts, radii, mats, mat_fn=None, n=8, sub=2, dome=(.5, 0), side=X):
    """Loft through points with per-point (w, h) half-sizes."""
    keys = [(p[0], p[1], p[2], r[0], r[1]) for p, r in zip(pts, radii)]
    return loft(name, keys, mats, n=n, sub=sub, dome=dome, mat_fn=mat_fn, side=side)


def paw(name, c, size, material, toes=3, toe_r=None, seg=10, rings=6, spread=None, toe_mat=None):
    """Rounded paw (flattened ellipsoid) with toe bumps across its front edge."""
    c = Vector(c)
    out = [sphere(name, size, c, material, seg=seg, rings=rings)]
    tr = toe_r or (size[0] * .38, size[1] * .32, size[2] * .62)
    sp = spread if spread is not None else size[0] * .62
    for k in range(toes):
        f = (k - (toes - 1) / 2)
        out.append(sphere(f'{name} toe {k}', tr, c + V(f * sp, -size[1] * .72 + abs(f) * size[1] * .12, -size[2] * .25),
                          toe_mat or material, seg=6, rings=4))
    return out


def blink(p, times, width=.018):
    return max([pulse(p, t, width) for t in times] + [0])


def set_lids(pose, eyes, close, deg=125, bias=0.0):
    for sd, e in eyes.items():
        pose[f'lid_{sd}'] = e.lid_rot(close * deg + bias)
    return pose


def add_eyes(parts, prefix, eyes, c, n, r, white_m, pupil_m, iris_m, lid_m, lash_m, head='head', **kw):
    """Paired eyes (+X side first); lids bound to lid_L / lid_R when lid_m is given."""
    for s, sd in ((1, 'L'), (-1, 'R')):
        look = kw.get('look', (0, 0))
        kk = dict(kw)
        kk['look'] = (look[0] * s, look[1])
        e = Eye(f'{prefix} eye {sd}', sym(c, s), sym(n, s), r, white_m, pupil_m, iris_m, lid_m=lid_m, lash_m=lash_m, **kk)
        for p_ in e.parts:
            parts.append(bind(p_, head))
        for p_ in e.lid_parts:
            parts.append(bind(p_, f'lid_{sd}'))
        eyes[sd] = e
    return eyes


def seat_eye(surf, c, n, r, depth=.45):
    """Move an eye centre along its normal so the sclera sits `depth` radii into the surface."""
    c, n = Vector(c), Vector(n).normalized()
    loc, _ = surf.ray(c + n * .6, -n, 1.5)
    return loc - n * r * depth


def lid_bones(bones, c, n, head='head'):
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones.append((f'lid_{sd}', sym(c, s), sym(Vector(c) + Vector(n).normalized() * .03, s), head))


def chain_bones(bones, prefix, pts, parent):
    for i in range(len(pts) - 1):
        bones.append((f'{prefix}_{i + 1}', pts[i], pts[i + 1], parent if i == 0 else f'{prefix}_{i}'))


def chain_segs(prefix, pts, lead=None):
    segs = [lead] if lead else []
    return segs + [(f'{prefix}_{i + 1}', Vector(pts[i]), Vector(pts[i + 1])) for i in range(len(pts) - 1)]


def sway(pose, prefix, count, p, amp, cycles=1.0, lag=.12, axis=2, grow=.25, base=None):
    """Travelling wave down a bone chain (tails, fish bodies)."""
    for i in range(count):
        v = [0.0, 0.0, 0.0]
        v[axis] = amp * (.5 + grow * i) * S(p, cycles, -lag * i)
        if base:
            v = [a + b for a, b in zip(v, base[i] if isinstance(base[0], (tuple, list)) else base)]
        add(pose, f'{prefix}_{i + 1}', tuple(v))
    return pose


def gait(P, rest_T, p, phases, duty, sweep, lift, curl=(50, 35), roll=12, tangent=.55, offset=None):
    """IK targets for legs {name: touchdown phase}. Names starting with F are forelegs."""
    ik = {}
    for leg, ph in phases.items():
        front = leg[0] == 'F'
        lf = lift[0] if isinstance(lift, (tuple, list)) and front else (lift[1] if isinstance(lift, (tuple, list)) else lift)
        dy, dz, pit = foot_path(p, ph, duty, sweep, lf, curl=curl[0] if front else curl[1], roll=roll, tangent=tangent)
        o = (offset or {}).get(leg, V(0, 0, 0))
        ik[leg] = (rest_T[leg] + V(0, dy, dz) + o, pit)
    return ik


# ====================================================================== FOX (Kon)


def build_fox():
    """Kon, the shrine fox: big head and ears, bright orange, white cheeks/chest/tail tip, dark socks and
    ear backs, a red shrine bib (yodarekake) with a brass bell, and a big upswept brush tail."""
    reset()
    K = .925                                   # export scale -> 0.95 m long, 0.44 m at the shoulder
    fur = mat('Fox fur', '#ee6d1c', rough=.6)
    white = mat('Fox white', '#f6efe2', rough=.66)
    sock = mat('Fox socks', '#3a2729', rough=.62)
    bib = mat('Fox bib', '#d9262a', rough=.55)
    brass = mat('Fox bell', '#e6ad3e', rough=.28, metal=.8)
    ew, dark, iris = eye_mats('Fox', '#f3a21b')

    # ---------------------------------------------------------------- skeleton
    SH, EL, WR, FT = V(.066, -.10, .33), V(.072, -.068, .195), V(.072, -.094, .058), V(.072, -.142, 0)
    HP, KN, HK, HT = V(.07, .12, .32), V(.079, .058, .2), V(.079, .142, .082), V(.079, .096, 0)
    eyeC, eyeN, eyeR = V(.066, -.33, .603), V(.56, -.8, .22), .039
    tail = [V(0, .18, .372), V(0, .262, .358), V(0, .345, .326), V(0, .425, .318), V(0, .49, .392)]
    earB, earT = V(.064, -.24, .657), V(.112, -.234, .84)
    bones = [('root', (0, 0, 0), (0, 0, .1), None),
             ('hips', (0, .12, .35), (0, .02, .35), 'root'),
             ('spine', (0, .02, .35), (0, -.075, .352), 'hips'),
             ('chest', (0, -.075, .352), (0, -.16, .372), 'spine'),
             ('neck', (0, -.17, .40), (0, -.232, .535), 'chest'),
             ('head', (0, -.238, .555), (0, -.42, .555), 'neck')]
    chain_bones(bones, 'tail', tail, 'hips')
    lid_bones(bones, eyeC, eyeN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'ear_{sd}', sym(earB, s), sym(earT, s), 'head'),
                  (f'upperarm_{sd}', sym(SH, s), sym(EL, s), 'chest'),
                  (f'forearm_{sd}', sym(EL, s), sym(WR, s), f'upperarm_{sd}'),
                  (f'paw_{sd}', sym(WR, s), sym(FT, s), f'forearm_{sd}'),
                  (f'thigh_{sd}', sym(HP, s), sym(KN, s), 'hips'),
                  (f'shin_{sd}', sym(KN, s), sym(HK, s), f'thigh_{sd}'),
                  (f'foot_{sd}', sym(HK, s), sym(HT, s), f'shin_{sd}')]
    arm = build_armature('Fox', bones)
    parts = []

    # ---------------------------------------------------------------- torso + neck
    spine_segs = [('hips', V(0, .28, .35), V(0, .02, .35)), ('spine', V(0, .02, .35), V(0, -.075, .352)),
                  ('chest', V(0, -.075, .352), V(0, -.17, .40)), ('neck', V(0, -.17, .40), V(0, -.238, .555)),
                  ('head', V(0, -.238, .555), V(0, -.32, .575))]
    tk = [(0, .212, .345, .07, .072), (0, .158, .35, .114, .11), (0, .065, .345, .101, .098),
          (0, -.035, .35, .11, .112), (0, -.115, .36, .106, .114), (0, -.172, .41, .084, .092),
          (0, -.21, .49, .072, .075), (0, -.236, .555, .064, .064)]

    def torso_mat(u, a):
        sa = math.sin(a)
        if u > 3.3 and sa < -.2:
            return 1
        if 2.2 < u <= 3.3 and sa < -.6:
            return 1
        return 0
    body = loft('Fox torso', tk, [fur, white], n=14, sub=3, dome=(.9, 0), mat_fn=torso_mat)
    parts.append(bind_chain(body, spine_segs, blend=.06))
    surf = Surface([body])
    # sculpted fur: neck ruff sweeping back, shoulder and haunch locks, white chest fluff under the bib
    tufts = []
    for sg in (1, -1):
        for k, (y, z, ln, w) in enumerate(((-.205, .51, .1, .034), (-.19, .45, .1, .036))):
            tufts.append(surf.tuft(f'Fox ruff {sg}{k}', V(.08 * sg, y, z), V(.25 * sg, .9, -.45), ln, w, fur, lift=.45))
    for k, x in enumerate((-.035, 0, .035)):
        tufts.append(surf.tuft(f'Fox chest fluff {k}', V(x, -.2, .3 - abs(x) * .4), V(x * 2, .3, -1), .045, .034, white,
                               lift=.55, tip=.55, flat=.6))
    for t_ in tufts:
        parts.append(bind_chain(t_, spine_segs, .06))

    # ---------------------------------------------------------------- head
    hk = [(0, -0.192, 0.590, .08, .08), (0, -0.244, 0.595, .125, .108), (0, -0.304, 0.580, .118, .097),
          (0, -0.358, 0.547, .072, .062), (0, -0.408, 0.527, .044, .04), (0, -0.440, 0.520, .028, .027)]

    def head_mat(u, a):
        sa = math.sin(a)
        if u > 1.55 and sa < -.1:
            return 1
        if 1.0 < u <= 1.55 and sa < -.45:
            return 1
        return 0
    parts.append(bind(loft('Fox head', hk, [fur, white], n=16, sub=2, dome=(.9, .7), mat_fn=head_mat), 'head'))
    parts.append(bind(sphere('Fox nose', (.026, .021, .019), (0, -.466, .532), dark, seg=10, rings=6), 'head'))
    parts.append(bind(tube('Fox mouth', [V(-.024, -0.432, 0.501), V(-.011, -0.448, 0.495), V(0, -0.452, 0.502), V(.011, -0.448, 0.495),
                                         V(.024, -0.432, 0.501)], .0035, dark, verts=4), 'head'))
    for s in (1, -1):
        # white cheek ruff: two pointed tufts sweeping out and back
        for k, (dz, ln) in enumerate(((0, 1.0), (-.038, .75))):
            parts.append(bind(lobe(f'Fox cheek {s}{k}', [sym(V(.082, -0.297, 0.545 + dz), s), sym(V(.082 + .055 * ln, -0.288, 0.525 + dz), s),
                                                         sym(V(.082 + .095 * ln, -0.270, 0.497 + dz), s)], .04, white,
                                   side=Z, n=6, flat=.62, tip=.2), 'head'))
        parts.append(bind(lobe(f'Fox brow {s}', [sym(V(.045, -0.327, 0.653), s), sym(V(.072, -0.318, 0.663), s),
                                                  sym(V(.098, -0.302, 0.657), s)], .012, white, side=Z, n=5, flat=.6, tip=.4),
                          'head'))
        sd = 'L' if s > 0 else 'R'
        base, tip = sym(earB, s), sym(earT, s)
        ax = (tip - base).normalized()
        side = ax.cross(Y).normalized() * -1
        ek = []
        for t, w, h in ((0, .056, .022), (.33, .046, .019), (.66, .029, .014), (.9, .011, .008), (1.0, .004, .004)):
            c = base.lerp(tip, t)
            ek.append((c.x, c.y, c.z, w, h))
        ear = loft(f'Fox ear {s}', ek, [fur, sock], n=8, sub=2, side=side, dome=(0, .6),
                   mat_fn=lambda u, a: 1 if (u > 2.6 or (math.sin(a) < -.25 and u > .7)) else 0)
        inner = lobe(f'Fox ear inner {s}', [base + V(0, -0.011, 0.047), base.lerp(tip, .45) + V(0, -0.006, 0.035),
                                            base.lerp(tip, .8) + V(0, 0.001, 0.035)], .034, white, side=side, n=6, flat=.35,
                     tip=.25)
        for p_ in (ear, inner):
            parts.append(bind_chain(p_, [('head', base - ax * .03, base), (f'ear_{sd}', base, tip)], .02))
    eyes = add_eyes(parts, 'Fox', {}, eyeC, eyeN, eyeR, ew, dark, iris, fur, dark, iris=.64, pupil=.42,
                    look=(-.05, .02), lid_open=4, seg=12, rings=7, lid_res=(6, 8))

    # ---------------------------------------------------------------- bib, collar and bell
    nb, na = V(0, -.2, .455), V(0, -.46, .89).normalized()
    parts.append(bind_chain(torus('Fox collar', .079, .012, nb, bib, maj=14, mn=4,
                                  rot=na.to_track_quat('Z', 'Y').to_euler()), spine_segs, .05))
    bibs = conform_patch('Fox bib', surf, V(0, -.3, .37), X, V(0, .28, .96), .04, -.125,
                         lambda t: .105 * max(math.cos(t * math.pi / 2), 0) ** .7 + .004, 6, 6, .006, .008, bib,
                         rim_m=white, rim_r=.0045)
    for p_ in bibs:
        parts.append(bind_chain(p_, spine_segs, .06))
    bl, bn = surf.near(V(0, -.3, .415))
    bell_c = bl + bn * .026
    parts.append(bind(sphere('Fox bell', .022, bell_c, brass, seg=10, rings=7), 'chest'))
    parts.append(bind(torus('Fox bell slot', .013, .0035, bell_c + V(0, -.013, -.007), dark, maj=8, mn=4,
                            rot=(math.radians(70), 0, 0)), 'chest'))

    # ---------------------------------------------------------------- tail
    tkeys = [(0, .185, .37, .036, .036), (0, .255, .36, .056, .055), (0, .33, .332, .077, .075),
             (0, .4, .318, .088, .086), (0, .455, .332, .082, .08), (0, .49, .372, .062, .06), (0, .5, .425, .028, .028)]
    tl = loft('Fox tail', tkeys, [fur, white], n=14, sub=2, dome=(0, 1.0),
              mat_fn=lambda u, a: 1 if u > 4.35 else 0,
              rad_fn=lambda u, a: 1 + .14 * math.cos(6 * a + u * 2.4) * smooth((u - .4) / 1.2) * (1 - smooth((u - 5.4) / .6)))
    parts.append(bind_chain(tl, chain_segs('tail', tail, ('hips', V(0, .12, .36), tail[0])), .05))

    # ---------------------------------------------------------------- legs
    for s, sd in ((1, 'L'), (-1, 'R')):
        fl = limb(f'Fox foreleg {s}', [sym(p, s) for p in (SH + V(-.003, -.006, .035), SH + V(0, .006, -.03), EL,
                                                             WR + V(0, .006, .04), WR, WR + V(0, -.02, -.02))],
                  [(.047, .058), (.044, .05), (.032, .034), (.028, .029), (.028, .029), (.03, .03)], [fur, sock],
                  mat_fn=lambda u, a: 1 if u > 2.3 else 0, n=8)
        fsegs = [('chest', sym(SH + V(0, 0, .09), s), sym(SH, s)), (f'upperarm_{sd}', sym(SH, s), sym(EL, s)),
                 (f'forearm_{sd}', sym(EL, s), sym(WR, s)), (f'paw_{sd}', sym(WR, s), sym(FT, s))]
        parts.append(bind_chain(fl, fsegs, .03))
        for p_ in paw(f'Fox fpaw {s}', sym(V(.072, -.118, .03), s), (.038, .05, .03), sock, toes=0, seg=10, rings=6):
            parts.append(bind(p_, f'paw_{sd}'))
        hl = limb(f'Fox hindleg {s}', [sym(p, s) for p in (HP + V(-.01, .01, .04), HP + V(.006, 0, -.05), KN,
                                                             KN.lerp(HK, .5), HK, HK.lerp(HT, .5) + V(0, .008, 0))],
                  [(.046, .07), (.056, .078), (.037, .042), (.027, .029), (.025, .027), (.026, .027)], [fur, sock],
                  mat_fn=lambda u, a: 1 if u > 3.3 else 0, n=8)
        hsegs = [('hips', sym(HP + V(0, 0, .09), s), sym(HP, s)), (f'thigh_{sd}', sym(HP, s), sym(KN, s)),
                 (f'shin_{sd}', sym(KN, s), sym(HK, s)), (f'foot_{sd}', sym(HK, s), sym(HT, s))]
        parts.append(bind_chain(hl, hsegs, .03))
        for p_ in paw(f'Fox hpaw {s}', sym(V(.079, .115, .03), s), (.038, .05, .03), sock, toes=0, seg=10, rings=6):
            parts.append(bind(p_, f'foot_{sd}'))

    # ---------------------------------------------------------------- animation
    P = Player(arm)
    for sd in 'LR':
        P.leg(f'F{sd}', f'upperarm_{sd}', f'forearm_{sd}', f'paw_{sd}')
        P.leg(f'H{sd}', f'thigh_{sd}', f'shin_{sd}', f'foot_{sd}')
    rest_T = {k: v['T'].copy() for k, v in P.legs.items()}

    def stand_ik():
        return {k: (rest_T[k].copy(), 0.0) for k in rest_T}

    # Idle: breathe, look around, ear flicks, blinks, tail sway
    def idle(p):
        pose = {'ik': stand_ik()}
        br = S(p, 3)
        add(pose, 'spine', (.8 * br, 0, 0))
        add(pose, 'chest', (-.5 * br, 0, 0))
        add(pose, 'hips@loc', (.004 * S(p, 1), 0, .003 * br - .003))
        look = keyed(p, [(0, {'y': (0, 0, 0)}), (.14, {'y': (0, 0, 0)}), (.24, {'y': (6, 10, 18)}),
                         (.44, {'y': (4, 8, 16)}), (.54, {'y': (-4, -6, -14)}), (.78, {'y': (-3, -5, -12)}),
                         (.9, {'y': (0, 0, 0)}), (1.0, {'y': (0, 0, 0)})])['y']
        add(pose, 'neck', (-look[0] * .5, 0, look[2] * .4))
        add(pose, 'head', (-look[0] * .5 + br, look[1], look[2] * .6))
        add(pose, 'ear_L', (-22 * pulse(p, .31, .03), 0, 14 * pulse(p, .31, .03)))
        add(pose, 'ear_R', (-22 * pulse(p, .73, .03) - 16 * pulse(p, .77, .025), 0, -14 * pulse(p, .73, .03)))
        sway(pose, 'tail', 4, p, 9, 1, .1, base=(-4, 0, 0))
        set_lids(pose, eyes, blink(p, (.12, .6, .66)))
        return pose
    P.clip('Idle', 120, idle)

    # Walk: four-beat lateral sequence (HL, FL, HR, FR); 1.2 m/s
    WF, WD = 13, .62
    wsweep = 1.2 / K * WF / FPS * WD

    def walk(p):
        pose = {'ik': gait(P, rest_T, p, {'HL': 0, 'FL': .25, 'HR': .5, 'FR': .75}, WD, wsweep, (.06, .055),
                           curl=(55, 35), roll=14, offset={'HL': V(0, -.005, 0), 'HR': V(0, -.005, 0),
                                                           'FL': V(0, .02, 0), 'FR': V(0, .02, 0)})}
        bob = C(p, 2, -.05)
        add(pose, 'hips@loc', (0, 0, -.018 + .007 * bob))
        add(pose, 'hips', (1.2 * S(p, 2), 2.5 * S(p, 1), 3 * S(p, 1, .1)))
        add(pose, 'spine', (0, 0, -2 * S(p, 1, .1)))
        add(pose, 'chest', (-1 * S(p, 2), -2 * S(p, 1), -2 * S(p, 1, .15)))
        add(pose, 'neck', (2 + 2 * S(p, 2, .1), 0, 2 * S(p, 1, .3)))
        add(pose, 'head', (-2 - 2.5 * S(p, 2, .15), 0, 2 * S(p, 1, .35)))
        add(pose, 'ear_L', (6 * S(p, 2, .3), 0, 0))
        add(pose, 'ear_R', (6 * S(p, 2, .3), 0, 0))
        sway(pose, 'tail', 4, p, 12, 1, .1, base=(-6, 0, 0))
        return pose
    P.clip('Walk', WF, walk)

    # Run: rotary gallop with spine flex and a gathered suspension; 5 m/s
    RF, RD = 9, .2
    rsweep = 5.0 / K * RF / FPS * RD

    def run(p):
        pose = {'ik': gait(P, rest_T, p, {'HL': 0, 'HR': .1, 'FR': .44, 'FL': .54}, RD, rsweep, (.1, .09),
                           curl=(80, 50), roll=20, tangent=.4,
                           offset={'FL': V(0, .035, 0), 'FR': V(0, .035, 0), 'HL': V(0, -.01, 0), 'HR': V(0, -.01, 0)})}
        flex = C(p, 1, -.93)            # +1 gathered (arched), -1 extended
        add(pose, 'hips@loc', (0, 0, -.045 + .03 * C(p, 1, -.88)))
        add(pose, 'hips', (-3.5 * flex + 2 * S(p, 1, .1), 0, 0))
        add(pose, 'spine', (6 * flex, 0, 0))
        add(pose, 'chest', (3 * flex, 0, 0))
        add(pose, 'neck', (-2 - 4 * flex, 0, 0))
        add(pose, 'head', (6 + 2 * flex, 0, 0))
        add(pose, 'ear_L', (35, 0, -8))
        add(pose, 'ear_R', (35, 0, 8))
        for i, base in enumerate((-22, -6, 2, 10)):
            add(pose, f'tail_{i + 1}', (base + 7 * S(p, 1, -.12 * i), 0, 4 * S(p, 1, -.1 * i)))
        return pose
    P.clip('Run', RF, run)

    # Sit: bum down, forelegs straight, hind feet flat, tail wrapped round the paws
    def sit(p):
        pose = {'ik': {'FL': (rest_T['FL'] + V(0, .045, 0), 0), 'FR': (rest_T['FR'] + V(0, .045, 0), 0),
                       'HL': (rest_T['HL'] + V(.012, -.05, 0), -62), 'HR': (rest_T['HR'] + V(-.012, -.05, 0), -62)}}
        add(pose, 'hips@loc', (0, .03, -.2))
        add(pose, 'hips', (-40, 0, 0))
        add(pose, 'spine', (-6, 0, 0))
        add(pose, 'chest', (-4, 0, 0))
        add(pose, 'neck', (22, 0, 0))
        add(pose, 'head', (26, 0, 0))
        for i, (x, z) in enumerate(((52, 30), (6, 40), (0, 45), (-6, 50))):
            add(pose, f'tail_{i + 1}', (x, 0, z))
        br = S(p, 2)
        add(pose, 'chest', (-.8 * br, 0, 0))
        add(pose, 'hips@loc', (0, 0, .002 * br))
        add(pose, 'head', (-3 * pulse(p, .45, .12), 0, 8 * pulse(p, .45, .14)))
        add(pose, 'ear_L', (-18 * pulse(p, .2, .03), 0, 10 * pulse(p, .2, .03)))
        add(pose, 'ear_R', (-18 * pulse(p, .62, .03), 0, -10 * pulse(p, .62, .03)))
        add(pose, 'tail_4', (0, 0, 14 * pulse(p, .8, .06) - 10 * pulse(p, .86, .05)))
        set_lids(pose, eyes, blink(p, (.3, .9)))
        return pose
    P.clip('Sit', 90, sit)

    # Look (once): glance back over the left shoulder at the player, ears up, tail wag, then back
    def look(p):
        pose = idle(0.0)
        k = window(p, .08, .86, .28)
        add(pose, 'chest', (0, 0, 14 * k))
        add(pose, 'neck', (-8 * k, 6 * k, 38 * k))
        add(pose, 'head', (-6 * k, 12 * k, 40 * k))
        add(pose, 'hips', (0, 0, -6 * k))
        add(pose, 'ear_L', (-14 * k, 0, 10 * k))
        add(pose, 'ear_R', (-14 * k, 0, -10 * k))
        wag = window(p, .2, .8, .2)
        for i in range(4):
            add(pose, f'tail_{i + 1}', (-8 * wag, 0, 22 * wag * S(p, 5, -.1 * i)))
        set_lids(pose, eyes, pulse(p, .52, .03))
        return pose
    P.clip('Look', 66, look, loop=False)

    make_skin('fox', arm, parts, dict(rays=40, distance=.22, strength=.6, ground=0.0))
    export_animal('fox', arm, P, scale=K)


# ====================================================================== BEAR (Okuma)


def build_bear():
    """Okuma, the Great Bear: huge, round and soft. Chocolate fur with soft sculpted clumps, a big round
    head with a cream muzzle, a cream moon crescent on the chest, pink paw pads, a red maple leaf on his
    head and moss (and a tiny mushroom) on his back from years of sleeping on the shrine steps."""
    reset()
    K = .91                                    # export scale -> 2.4 m long
    fur = mat('Bear fur', '#7a4122', rough=.7)
    dfur = mat('Bear dark', '#43231a', rough=.72)
    cream = mat('Bear cream', '#f2d6a0', rough=.62)
    nose = mat('Bear nose', '#231b1f', rough=.18)
    ew = mat('Bear eye', '#f7f4ec', rough=.12, emit=.08)
    pads = mat('Bear pads', '#d07f6a', rough=.5)
    moss = mat('Bear moss', '#72a32e', rough=.8)
    leaf = mat('Bear leaf', '#e8421d', rough=.5)

    SH, EL, WR, FT = V(.4, -.34, .86), V(.43, -.22, .47), V(.43, -.34, .13), V(.43, -.6, 0)
    HP, KN, HK, HT = V(.42, .52, .86), V(.45, .33, .48), V(.45, .52, .15), V(.45, .25, 0)
    parts = []

    # ---------------------------------------------------------------- head first (eyes are seated on it)
    hk = [(0, -.62, 1.28, .34, .34), (0, -.74, 1.32, .5, .48), (0, -.9, 1.33, .54, .5), (0, -1.04, 1.28, .47, .43),
          (0, -1.13, 1.2, .32, .31)]
    head = loft('Bear head', hk, fur, n=18, sub=2, dome=(.8, .6))
    hs = Surface([head])
    eyeR, eyeN = .088, V(.42, -.86, .3)
    eyeC = seat_eye(hs, V(.21, -1.02, 1.38), eyeN, eyeR, .42)

    bones = [('root', (0, 0, 0), (0, 0, .3), None),
             ('hips', (0, .55, .96), (0, .18, .98), 'root'),
             ('spine', (0, .18, .98), (0, -.18, 1.02), 'hips'),
             ('chest', (0, -.18, 1.02), (0, -.5, 1.06), 'spine'),
             ('neck', (0, -.52, 1.1), (0, -.72, 1.2), 'chest'),
             ('head', (0, -.74, 1.24), (0, -1.2, 1.24), 'neck'),
             ('jaw', (0, -.92, 1.1), (0, -1.3, 1.02), 'head'),
             ('tail_1', (0, .86, 1.05), (0, 1.0, 1.08), 'hips')]
    lid_bones(bones, eyeC, eyeN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'ear_{sd}', sym(V(.33, -.76, 1.6), s), sym(V(.4, -.76, 1.78), s), 'head'),
                  (f'upperarm_{sd}', sym(SH, s), sym(EL, s), 'chest'),
                  (f'forearm_{sd}', sym(EL, s), sym(WR, s), f'upperarm_{sd}'),
                  (f'paw_{sd}', sym(WR, s), sym(FT, s), f'forearm_{sd}'),
                  (f'thigh_{sd}', sym(HP, s), sym(KN, s), 'hips'),
                  (f'shin_{sd}', sym(KN, s), sym(HK, s), f'thigh_{sd}'),
                  (f'foot_{sd}', sym(HK, s), sym(HT, s), f'shin_{sd}')]
    arm = build_armature('Bear', bones)
    spine_segs = [('hips', V(0, 1.0, .97), V(0, .18, .98)), ('spine', V(0, .18, .98), V(0, -.18, 1.02)),
                  ('chest', V(0, -.18, 1.02), V(0, -.52, 1.1)), ('neck', V(0, -.52, 1.1), V(0, -.74, 1.24)),
                  ('head', V(0, -.74, 1.24), V(0, -.9, 1.26))]
    parts.append(bind(head, 'head'))

    # ---------------------------------------------------------------- body
    tk = [(0, .88, .98, .38, .4), (0, .7, .98, .6, .6), (0, .4, .97, .69, .65), (0, .05, .99, .7, .66),
          (0, -.28, 1.04, .64, .64), (0, -.5, 1.1, .52, .54), (0, -.66, 1.17, .42, .44), (0, -.76, 1.22, .34, .36)]
    body = loft('Bear body', tk, fur, n=18, sub=3, dome=(.8, 0))
    parts.append(bind_chain(body, spine_segs, .22))
    surf = Surface([body])
    # moon crescent (tsukinowa) on the lower chest: faces forward when he sits up
    for p_ in conform_patch('Bear crescent', surf, V(0, -.56, .4), V(0, -.6, .8), X, -.36, .36,
                            lambda t: .065 * math.sin(math.pi * t) ** .8 + .004, 10, 2, .004, .014, cream,
                            center_fn=lambda t: .22 * abs(2 * t - 1) ** 1.3):
        parts.append(bind_chain(p_, spine_segs, .22))
    # soft fur clumps (round-tipped, hugging): shoulders, flanks, rump, neck ruff
    tufts = []
    for sg in (1, -1):
        for k, (p0, d, ln, w) in enumerate(((V(.42, -.44, 1.46), V(.3, .8, -.5), .3, .16),
                                            (V(.5, -.62, 1.1), V(.5, .5, -.7), .24, .14))):
            tufts.append(surf.tuft(f'Bear tuft {sg}{k}', sym(p0, sg), sym(d, sg), ln, w, fur, lift=.2, tip=.65, flat=.6,
                                   sink=.5))
    for k, x in enumerate((-.26, 0, .26)):
        tufts.append(surf.tuft(f'Bear ruff {k}', V(x, -.72, 1.58 - abs(x) * .3), V(x * .5, .9, -.35), .3, .17, fur,
                               lift=.25, tip=.6, flat=.7))
    for t_ in tufts:
        parts.append(bind_chain(t_, spine_segs, .22))
    # moss and a tiny mushroom on his back
    for k, (x, y, r) in enumerate(((.18, .25, .13), (-.14, .38, .11), (.02, .06, .1), (-.32, .02, .085), (.32, .55, .09),
                                   (-.06, .62, .11))):
        loc, n = surf.near(V(x, y, 1.9))
        parts.append(bind_chain(puff(f'Bear moss {k}', loc + n * r * .15, r, moss, seg=8, rings=5, lump=.25, seed=k,
                                     squash=.55), spine_segs, .22))
    loc, n = surf.near(V(-.12, .42, 1.9))
    parts.append(bind_chain(rod('Bear shroom stem', loc - n * .02, loc + n * .13, .024, cream, verts=8), spine_segs, .22))
    parts.append(bind_chain(sphere('Bear shroom cap', (.075, .075, .045), loc + n * .13, leaf, seg=10, rings=5),
                            spine_segs, .22))
    parts.append(bind(sphere('Bear tail', (.13, .1, .11), (0, .98, 1.06), fur, seg=10, rings=6), 'tail_1'))

    # ---------------------------------------------------------------- face
    parts.append(bind(loft('Bear muzzle', [(0, -1.0, 1.14, .25, .2), (0, -1.14, 1.12, .23, .175), (0, -1.26, 1.11, .18, .14),
                                           (0, -1.32, 1.11, .12, .1)], cream, n=14, sub=2, dome=(0, .8)), 'head'))
    parts.append(bind(sphere('Bear nose', (.11, .075, .08), (0, -1.37, 1.17), nose, seg=12, rings=7,
                             rot=(math.radians(-15), 0, 0)), 'head'))
    parts.append(bind(tube('Bear mouth', [V(-.1, -1.26, 1.065), V(-.045, -1.325, 1.06), V(0, -1.34, 1.075),
                                          V(.045, -1.325, 1.06), V(.1, -1.26, 1.065)], .009, nose, verts=4), 'head'))
    parts.append(bind(rod('Bear philtrum', V(0, -1.345, 1.12), V(0, -1.34, 1.078), .007, nose, verts=4), 'head'))
    parts.append(bind(sphere('Bear mouth inside', (.13, .15, .06), (0, -1.14, 1.05), pads, seg=10, rings=5), 'head'))
    parts.append(bind(loft('Bear chin', [(0, -.96, 1.03, .18, .1), (0, -1.12, 1.015, .17, .09), (0, -1.25, 1.025, .12, .065)],
                           cream, n=12, sub=2, dome=(.6, .8)), 'jaw'))
    parts.append(bind(sphere('Bear tongue', (.08, .1, .026), (0, -1.14, 1.045), pads, seg=8, rings=4), 'jaw'))
    for sg in (1, -1):
        sd = 'L' if sg > 0 else 'R'
        for k, (p0, d) in enumerate(((V(.4, -.98, 1.1), V(.7, .35, -.55)), (V(.46, -.84, 1.22), V(.8, .45, -.25)))):
            parts.append(bind(hs.tuft(f'Bear cheek {sg}{k}', sym(p0, sg), sym(d, sg), .2, .12, fur, lift=.35, tip=.55,
                                      flat=.75), 'head'))
        ear = sphere(f'Bear ear {sg}', (.18, .08, .17), sym(V(.34, -.76, 1.68), sg), fur, seg=12, rings=7,
                     rot=(0, math.radians(-25 * sg), 0))
        inner = sphere(f'Bear ear inner {sg}', (.11, .03, .1), sym(V(.345, -.83, 1.67), sg), dfur, seg=10, rings=5,
                       rot=(0, math.radians(-25 * sg), 0))
        for p_ in (ear, inner):
            parts.append(bind_chain(p_, [('head', sym(V(.3, -.76, 1.45), sg), sym(V(.33, -.76, 1.6), sg)),
                                         (f'ear_{sd}', sym(V(.33, -.76, 1.6), sg), sym(V(.4, -.76, 1.78), sg))], .05))
        parts.append(bind(hs.tuft(f'Bear brow {sg}', sym(eyeC + V(-.06, -.02, .12), sg), sym(V(.9, .2, .15), sg), .13, .035,
                                  dfur, lift=.3, flat=.5), 'head'))
    eyes = add_eyes(parts, 'Bear', {}, eyeC, eyeN, eyeR, ew, nose, dfur, fur, nose, iris=.8, pupil=.5,
                    look=(-.06, .04), lid_open=24, seg=12, rings=7, lid_res=(6, 8))
    # maple leaf resting on his head
    lo = []
    for k in range(5):
        a0 = math.radians(90 + 72 * k)
        for rr, da in ((.07, -30), (.15, -16), (.22, 0), (.15, 16)):
            a = a0 + math.radians(da)
            lo.append((rr * math.cos(a), rr * math.sin(a)))
    ltop, ln_ = hs.near(V(.16, -.8, 2.0))
    lq = Quaternion(Z, D(20))
    parts.append(bind(plate('Bear leaf', lo, .014, leaf, lq @ V(1, 0, .15), lq @ V(0, 1, .1), ltop + ln_ * .02, bevel=.004,
                            bulge=.012), 'head'))
    parts.append(bind(rod('Bear leaf stem', ltop + ln_ * .02 + lq @ V(0, -.05, 0), ltop + ln_ * .04 + lq @ V(.03, -.2, .02),
                          .009, dfur, verts=4), 'head'))

    # ---------------------------------------------------------------- legs and paws
    for s, sd in ((1, 'L'), (-1, 'R')):
        fl = limb(f'Bear foreleg {s}', [sym(p, s) for p in (SH + V(-.04, 0, .16), SH, EL, WR + V(0, .01, .12), WR)],
                  [(.2, .24), (.21, .23), (.17, .18), (.155, .16), (.15, .15)], fur, n=12)
        fsegs = [('chest', sym(SH + V(0, 0, .3), s), sym(SH, s)), (f'upperarm_{sd}', sym(SH, s), sym(EL, s)),
                 (f'forearm_{sd}', sym(EL, s), sym(WR, s)), (f'paw_{sd}', sym(WR, s), sym(FT, s))]
        parts.append(bind_chain(fl, fsegs, .1))
        pc = sym(V(.43, -.44, .095), s)
        parts.append(bind(sphere(f'Bear fpaw {s}', (.19, .23, .1), pc, fur, seg=12, rings=8), f'paw_{sd}'))
        for k in range(4):
            f = k - 1.5
            parts.append(bind(rod(f'Bear fclaw {s}{k}', pc + V(f * .085 * s, -.19 + abs(f) * .03, -.02),
                                  pc + V(f * .1 * s, -.28 + abs(f) * .03, -.07), .026, cream, verts=6, r2=.006), f'paw_{sd}'))
        hl = limb(f'Bear hindleg {s}', [sym(p, s) for p in (HP + V(-.04, 0, .16), HP + V(0, -.04, -.1), KN, KN.lerp(HK, .5), HK)],
                  [(.24, .3), (.25, .3), (.19, .21), (.16, .17), (.15, .15)], fur, n=12)
        hsegs = [('hips', sym(HP + V(0, 0, .3), s), sym(HP, s)), (f'thigh_{sd}', sym(HP, s), sym(KN, s)),
                 (f'shin_{sd}', sym(KN, s), sym(HK, s)), (f'foot_{sd}', sym(HK, s), sym(HT, s))]
        parts.append(bind_chain(hl, hsegs, .1))
        hc = sym(V(.45, .41, .085), s)
        parts.append(bind(sphere(f'Bear hpaw {s}', (.18, .29, .09), hc, fur, seg=12, rings=8), f'foot_{sd}'))
        parts.append(bind(sphere(f'Bear sole {s}', (.12, .13, .02), hc + V(0, .06, -.075), pads, seg=10, rings=4), f'foot_{sd}'))
        for k in range(4):
            f = k - 1.5
            parts.append(bind(sphere(f'Bear bean {s}{k}', (.035, .04, .018), hc + V(f * .07 * s, -.12 + abs(f) * .02, -.07),
                                     pads, seg=8, rings=3), f'foot_{sd}'))
            parts.append(bind(rod(f'Bear hclaw {s}{k}', hc + V(f * .08 * s, -.24 + abs(f) * .03, -.02),
                                  hc + V(f * .09 * s, -.32 + abs(f) * .03, -.06), .024, cream, verts=6, r2=.006), f'foot_{sd}'))

    mesh = make_skin('bear', arm, parts, dict(rays=40, distance=.6, strength=.6, ground=0.0))

    # ---------------------------------------------------------------- animation
    P = Player(arm)
    for sd in 'LR':
        P.leg(f'F{sd}', f'upperarm_{sd}', f'forearm_{sd}', f'paw_{sd}')
        P.leg(f'H{sd}', f'thigh_{sd}', f'shin_{sd}', f'foot_{sd}')
    T = {k: v['T'].copy() for k, v in P.legs.items()}

    def ikv(leg, d=(0, 0, 0), pitch=0.0):
        t = T[leg] + Vector(d)
        return (t.x, t.y, t.z, pitch)

    def lie_flat(dz):
        # belly on the ground, forepaws crossed under the chin, head resting on them, tilted
        return {'hips@loc': (0, .05, dz), 'hips': (2, 0, 0), 'chest': (8, 0, 0),
                'neck': (26, 0, 0), 'head': (-34, 12, 6), 'ear_L': (18, 0, -10), 'ear_R': (18, 0, 10), 'jaw': (0, 0, 0),
                'tail_1': (10, 0, 0),
                'ik:FL': ikv('FL', (-.3, -.42, 0), 0), 'ik:FR': ikv('FR', (.26, -.36, .09), 0),
                'ik:HL': ikv('HL', (.12, .02, 0), 0), 'ik:HR': ikv('HR', (-.12, .02, 0), 0), 'lids': (1, 0, 0)}

    def sit_flat(dz, dy):
        return {'hips@loc': (0, dy, dz), 'hips': (-66, 0, 0), 'spine': (-4, 0, 0), 'chest': (-2, 0, 0),
                'neck': (34, 0, 0), 'head': (36, 0, 0), 'ear_L': (0, 0, 0), 'ear_R': (0, 0, 0), 'jaw': (0, 0, 0),
                'tail_1': (40, 0, 0),
                'ik:HL': ikv('HL', (.1, -.78, .36), -112), 'ik:HR': ikv('HR', (-.1, -.78, .36), -112), 'lids': (0, 0, 0)}

    lie_dz = -.34
    for _ in range(2):
        lie_dz -= P.low_point(mesh, realize(lie_flat(lie_dz)), {'spine', 'chest'}) - .015
    sit_dz, sit_dy = -.5, -.2
    for _ in range(3):
        sit_dz -= P.low_point(mesh, realize(sit_flat(sit_dz, sit_dy)), {'hips', 'tail_1'}) - .01
    print(f'  bear settle: lie dz {lie_dz:.3f}, sit dz {sit_dz:.3f}')
    LIE = lie_flat(lie_dz)
    SIT = sit_flat(sit_dz, sit_dy)
    for leg, x in (('FL', .34), ('FR', -.34)):
        pt = P.world(realize(SIT), 'spine', V(x, -.05, .4))
        SIT[f'ik:{leg}'] = (pt.x * .8, pt.y - .1, pt.z + .03, -60)

    def with_(base, **kw):
        f = dict(base)
        for k, v in kw.items():
            f[k.replace('__', '@')] = v
        return f

    def add_flat(f, key, v):
        f = dict(f)
        f[key] = tuple(a + b for a, b in zip(f.get(key, (0,) * len(v)), v))
        return f

    # Sleep: slow breathing (belly swells), a snore with a nose-twitch and ear flick on the second breath
    def sleep(p):
        br = (S(p, 2, -.25) + 1) / 2
        f = dict(LIE)
        f = add_flat(f, 'hips@loc', (0, 0, .025 * br))
        f = add_flat(f, 'spine', (-2 * br, 0, 0))
        f = add_flat(f, 'chest', (2 * br, 0, 0))
        sn = pulse(p, .8, .08)
        tw = pulse(p, .86, .02)
        f = add_flat(f, 'jaw', (12 * sn, 0, 0))
        f = add_flat(f, 'head', (-5 * sn - 4 * tw, 0, 0))
        f = add_flat(f, 'ear_L', (-24 * tw, 0, 12 * tw))
        f = add_flat(f, 'ear_R', (-14 * pulse(p, .9, .02), 0, 0))
        f = add_flat(f, 'tail_1', (0, 0, 14 * pulse(p, .4, .05)))
        pose = realize(f, eyes)
        pose['chest@scale'] = (1 + .04 * br, 1, 1 + .05 * br)
        pose['spine@scale'] = (1 + .05 * br, 1, 1 + .04 * br)
        return pose
    P.clip('Sleep', 150, sleep)

    # Wake (once): stir, open eyes, huge yawn, push up into a sit, big stretch, settle exactly on Sit's first frame
    yawn = with_(LIE, neck=(-10, 0, 0), head=(-44, -4, 0), jaw=(42, 0, 0), lids=(1, 0, 0), ear_L=(24, 0, -14),
                 ear_R=(24, 0, 14))
    up = with_(LIE, hips__loc=(0, .02, lie_dz + .14), hips=(-20, 0, 0), neck=(4, 0, 0), head=(6, 0, 0), lids=(.15, 0, 0),
               ear_L=(0, 0, 0), ear_R=(0, 0, 0))
    stretch = dict(SIT)
    stretch.update({'ik:FL': (SIT['ik:FL'][0] + .2, SIT['ik:FL'][1] - .1, SIT['ik:FL'][2] + 1.0, -160),
                    'ik:FR': (SIT['ik:FR'][0] - .2, SIT['ik:FR'][1] - .1, SIT['ik:FR'][2] + 1.0, -160),
                    'neck': (22, 0, 0), 'head': (10, 0, 0), 'jaw': (22, 0, 0), 'lids': (1, 0, 0), 'spine': (-12, 0, 0),
                    'chest': (-10, 0, 0)})

    def wake(p):
        f = keyed(p, [(0, LIE), (.12, with_(LIE, head=(-36, 18, 8), ear_L=(0, 0, 0))),
                      (.2, with_(LIE, neck=(12, 0, 0), head=(-24, 4, 2), lids=(.55, 0, 0), ear_L=(0, 0, 0), ear_R=(0, 0, 0))),
                      (.3, yawn), (.4, with_(LIE, neck=(8, 0, 0), head=(-20, 0, 0), lids=(.1, 0, 0), ear_L=(0, 0, 0),
                                             ear_R=(0, 0, 0))),
                      (.55, up), (.7, dict(SIT, lids=(.1, 0, 0))), (.82, stretch), (.93, dict(SIT)), (1.0, SIT)])
        f = add_flat(f, 'lids', (pulse(p, .47, .02) + pulse(p, .63, .02) * .9, 0, 0))
        return realize(f, eyes)
    P.clip('Wake', 150, wake, loop=False)

    # Sit: breathing, blinks, a look around and ear flicks (first frame == Wake's last frame)
    def sit(p):
        f = add_flat(SIT, 'spine', (-1 * S(p, 1), 0, 0))
        f = add_flat(f, 'head', (-2 * pulse(p, .5, .15), 0, 14 * pulse(p, .5, .16)))
        f = add_flat(f, 'ear_L', (-16 * pulse(p, .3, .03), 0, 8 * pulse(p, .3, .03)))
        f = add_flat(f, 'ear_R', (-16 * pulse(p, .75, .03), 0, -8 * pulse(p, .75, .03)))
        f = add_flat(f, 'lids', (blink(p, (.2, .82), .025), 0, 0))
        pose = realize(f, eyes)
        pose['chest@scale'] = (1 + .012 * (1 - C(p)), 1, 1 + .015 * (1 - C(p)))
        return pose
    P.clip('Sit', 120, sit)

    # Eat: scoop honey chestnuts from a bowl between the feet, paw to mouth, happy munching
    bowl = V(0, -.62, .5)          # honey-chestnut bowl held on his lap between the feet

    def eat(p):
        f = dict(SIT)
        for leg, ph, x in (('FR', 0.0, -.12), ('FL', .5, .12)):
            q = (p - ph) % 1.0
            rest = Vector(SIT[f'ik:{leg}'][:3])
            mouth = P.world(realize(SIT), 'head', V(x * .4, -1.25, 1.02)) + V(0, -.06, -.1)
            if q < .16:
                t, pitch = rest.lerp(bowl + V(x, 0, 0), smooth(q / .16)), -60 + 50 * smooth(q / .16)
            elif q < .34:
                t, pitch = (bowl + V(x, 0, 0)).lerp(mouth, smooth((q - .16) / .18)), -10 - 120 * smooth((q - .16) / .18)
            elif q < .5:
                t, pitch = mouth.lerp(rest, smooth((q - .34) / .16)), -130 + 70 * smooth((q - .34) / .16)
            else:
                t, pitch = rest, -60
            f[f'ik:{leg}'] = (t.x, t.y, t.z, pitch)
        chew = max(pulse(p, .3, .16), pulse(p, .8, .16))
        f = add_flat(f, 'jaw', (14 * chew * (.5 + .5 * S(p, 12)), 0, 0))
        f = add_flat(f, 'head', (6 * max(pulse(p, .12, .1), pulse(p, .62, .1)) + 3 * chew * S(p, 6), 0,
                                 6 * pulse(p, .12, .1) - 6 * pulse(p, .62, .1)))
        f = add_flat(f, 'neck', (8 * max(pulse(p, .12, .1), pulse(p, .62, .1)), 0, 0))
        f = add_flat(f, 'lids', (.9 * chew, 0, 0))
        f = add_flat(f, 'ear_L', (-10 * chew * S(p, 6), 0, 0))
        f = add_flat(f, 'ear_R', (-10 * chew * S(p, 6, .5), 0, 0))
        return realize(f, eyes)
    P.clip('Eat', 120, eat)

    # Walk: slow four-beat amble with a rolling body and swinging head; 1.0 m/s
    WF, WD = 26, .65
    wsweep = 1.0 / K * WF / FPS * WD

    def walk(p):
        pose = {'ik': gait(P, T, p, {'HL': 0, 'FL': .22, 'HR': .5, 'FR': .72}, WD, wsweep, (.14, .12),
                           curl=(50, 30), roll=15, offset={'FL': V(0, .08, 0), 'FR': V(0, .08, 0),
                                                           'HL': V(0, -.04, 0), 'HR': V(0, -.04, 0)})}
        add(pose, 'hips@loc', (.02 * S(p, 1, .1), 0, -.06 + .02 * C(p, 2, -.1)))
        add(pose, 'hips', (1.5 * S(p, 2), 4 * S(p, 1, .1), 3 * S(p, 1)))
        add(pose, 'spine', (0, -2 * S(p, 1, .15), -2 * S(p, 1, .1)))
        add(pose, 'chest', (-1 * S(p, 2, .1), -3 * S(p, 1, .2), -2 * S(p, 1, .2)))
        add(pose, 'neck', (4 + 2 * S(p, 2, .2), 0, 4 * S(p, 1, .35)))
        add(pose, 'head', (-2 * S(p, 2, .25), 3 * S(p, 1, .4), 4 * S(p, 1, .45)))
        add(pose, 'ear_L', (5 * S(p, 2, .4), 0, 0))
        add(pose, 'ear_R', (5 * S(p, 2, .4), 0, 0))
        add(pose, 'tail_1', (0, 0, 8 * S(p, 1, .3)))
        return pose
    P.clip('Walk', WF, walk)

    export_animal('bear', arm, P, scale=K)


# ====================================================================== SHEEP


def build_sheep():
    """Takamori sheep: a chunky cloud of wool clumps, dark face and legs, amber eyes with sleepy lids and
    horizontal pupils, ears sticking out, a woolly topknot, and a red collar with a brass bell."""
    reset()
    K = .84                                    # export scale -> 1.1 m long
    wool = mat('Sheep wool', '#f7f0e0', rough=.85)
    face = mat('Sheep face', '#3a2d33', rough=.6)
    pink = mat('Sheep pink', '#e98b86', rough=.5)
    ew, dark, iris = eye_mats('Sheep', '#e7a72c')
    collar = mat('Sheep collar', '#d7302a', rough=.5)

    SH, EL, WR, FT = V(.14, -.2, .42), V(.145, -.18, .25), V(.145, -.2, .075), V(.145, -.235, 0)
    HP, KN, HK, HT = V(.14, .24, .44), V(.145, .19, .28), V(.145, .27, .11), V(.145, .245, 0)
    parts = []

    # ---------------------------------------------------------------- head first
    hk = [(0, -.36, .75, .095, .11), (0, -.43, .765, .12, .125), (0, -.52, .735, .1, .105), (0, -.6, .68, .074, .076),
          (0, -.645, .65, .056, .056)]
    head = loft('Sheep head', hk, face, n=12, sub=2, dome=(.6, .8))
    hs = Surface([head])
    eyeR, eyeN = .056, V(.68, -.66, .3)
    eyeC = seat_eye(hs, V(.085, -.47, .81), eyeN, eyeR, .42)

    bones = [('root', (0, 0, 0), (0, 0, .2), None),
             ('hips', (0, .24, .58), (0, .06, .6), 'root'),
             ('spine', (0, .06, .6), (0, -.1, .61), 'hips'),
             ('chest', (0, -.1, .61), (0, -.24, .63), 'spine'),
             ('neck', (0, -.26, .64), (0, -.36, .72), 'chest'),
             ('head', (0, -.37, .74), (0, -.6, .7), 'neck'),
             ('jaw', (0, -.48, .68), (0, -.63, .61), 'head')]
    tail = [V(0, .4, .6), V(0, .47, .56), V(0, .5, .48)]
    chain_bones(bones, 'tail', tail, 'hips')
    lid_bones(bones, eyeC, eyeN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'ear_{sd}', sym(V(.085, -.39, .8), s), sym(V(.21, -.37, .77), s), 'head'),
                  (f'upperarm_{sd}', sym(SH, s), sym(EL, s), 'chest'),
                  (f'forearm_{sd}', sym(EL, s), sym(WR, s), f'upperarm_{sd}'),
                  (f'paw_{sd}', sym(WR, s), sym(FT, s), f'forearm_{sd}'),
                  (f'thigh_{sd}', sym(HP, s), sym(KN, s), 'hips'),
                  (f'shin_{sd}', sym(KN, s), sym(HK, s), f'thigh_{sd}'),
                  (f'foot_{sd}', sym(HK, s), sym(HT, s), f'shin_{sd}')]
    arm = build_armature('Sheep', bones)
    spine_segs = [('hips', V(0, .5, .58), V(0, .06, .6)), ('spine', V(0, .06, .6), V(0, -.1, .61)),
                  ('chest', V(0, -.1, .61), V(0, -.26, .64)), ('neck', V(0, -.26, .64), V(0, -.37, .74)),
                  ('head', V(0, -.37, .74), V(0, -.45, .76))]
    parts.append(bind(head, 'head'))
    body_segs = spine_segs[:3]

    # ---------------------------------------------------------------- wool body: lumpy base + clumps
    tk = [(0, .44, .6, .2, .2), (0, .32, .6, .3, .29), (0, .08, .6, .33, .31), (0, -.14, .62, .32, .3),
          (0, -.28, .66, .24, .24), (0, -.36, .72, .15, .15)]
    body = loft('Sheep fleece', tk, wool, n=10, sub=2, dome=(.9, 0),
                rad_fn=lambda u, a: 1 + .07 * math.cos(5 * a) * math.cos(u * 3.1) + .04 * math.sin(7 * a + u * 2))
    parts.append(bind_chain(body, body_segs + [('neck', V(0, -.26, .64), V(0, -.3, .67))], .08))
    surf = Surface([body])
    # a short dark neck that shows when the head goes down to graze
    parts.append(bind_chain(loft('Sheep neck', [(0, -.24, .63, .075, .085), (0, -.31, .69, .072, .08), (0, -.37, .74, .07, .075)],
                                 face, n=8, sub=1), spine_segs[2:], .05))
    clumps = []
    k = 0
    for ring, (y, rr, cnt, off) in enumerate(((.36, .14, 4, 0), (.14, .15, 5, .5), (-.08, .15, 5, 0), (-.26, .13, 4, .5))):
        for j in range(cnt):
            a = math.radians(-15 + 210 * (j + off) / (cnt - 1 + off * 2))
            d = V(math.cos(a), 0, math.sin(a))
            loc, n = surf.near(V(0, y, .6) + d * .6)
            r = rr * (1 + .1 * math.sin(k * 2.3))
            clumps.append(puff(f'Sheep clump {k}', loc + n * r * .05, r, wool, seg=8, rings=6, lump=.14, seed=k))
            k += 1
    for c in clumps:
        parts.append(bind_chain(c, body_segs, .08))
    # woolly topknot and cheeks
    for j, (x, y, z, r) in enumerate(((0, -.4, .86, .075), (.06, -.36, .845, .06), (-.06, -.36, .845, .06))):
        parts.append(bind(puff(f'Sheep topknot {j}', V(x, y, z), r, wool, seg=8, rings=5, lump=.15, seed=40 + j), 'head'))
    parts.append(bind(puff('Sheep tail', V(0, .5, .52), .075, wool, seg=7, rings=5, lump=.2, seed=60), 'tail_2'))

    # ---------------------------------------------------------------- face details
    parts.append(bind(sphere('Sheep nose', (.03, .018, .018), (0, -.668, .655), pink, seg=8, rings=5), 'head'))
    parts.append(bind(tube('Sheep mouth', [V(-.028, -.64, .608), V(0, -.662, .622), V(.028, -.64, .608)], .004, dark,
                           verts=4), 'head'))
    parts.append(bind(rod('Sheep philtrum', V(0, -.664, .64), V(0, -.662, .622), .0035, dark, verts=4), 'head'))
    parts.append(bind(loft('Sheep chin', [(0, -.5, .665, .055, .035), (0, -.58, .625, .048, .03), (0, -.63, .612, .032, .022)],
                           face, n=8, sub=1, dome=(.5, .8)), 'jaw'))
    parts.append(bind(sphere('Sheep mouth inside', (.04, .06, .025), (0, -.58, .64), pink, seg=8, rings=4), 'head'))
    for s in (1, -1):
        sd = 'L' if s > 0 else 'R'
        base, tip = sym(V(.085, -.39, .8), s), sym(V(.22, -.37, .76), s)
        ek = []
        for t, w, h in ((0, .025, .012), (.4, .042, .014), (.8, .03, .011), (1.0, .01, .006)):
            c = base.lerp(tip, t)
            ek.append((c.x, c.y, c.z, w, h))
        side = Y
        ear = loft(f'Sheep ear {s}', ek, [face, pink], n=6, sub=2, side=side, dome=(0, .7),
                   mat_fn=lambda u, a: 1 if (math.sin(a) < -.3 and .5 < u < 2.6) else 0)
        parts.append(bind_chain(ear, [('head', base - (tip - base).normalized() * .03, base), (f'ear_{sd}', base, tip)], .02))
    eyes = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        e = Eye(f'Sheep eye {sd}', sym(eyeC, s), sym(eyeN, s), eyeR, ew, dark, iris, iris=.72, pupil=.5, tall=.42,
                look=(-.1 * s, 0), lid_m=face, lash_m=dark, lid_open=34, seg=10, rings=6, lid_res=(5, 8))
        for p_ in e.parts:
            parts.append(bind(p_, 'head'))
        for p_ in e.lid_parts:
            parts.append(bind(p_, f'lid_{sd}'))
        eyes[sd] = e
    # farm ear tag (the accent colour): a little red tag clipped through the left ear
    tb = V(.16, -.395, .77)
    parts.append(bind(plate('Sheep ear tag', [(-.022, -.05), (.022, -.05), (.026, -.012), (.012, 0), (-.012, 0), (-.026, -.012)],
                            .008, collar, V(1, .15, 0), V(0, 0, 1), tb + V(0, -.012, 0), bevel=.003), 'ear_L'))
    parts.append(bind(cyl('Sheep ear tag pin', .009, .03, tb + V(0, .002, 0), collar, verts=8, rot=(math.pi / 2, 0, 0)),
                      'ear_L'))

    # ---------------------------------------------------------------- legs
    for s, sd in ((1, 'L'), (-1, 'R')):
        fl = limb(f'Sheep foreleg {s}', [sym(p, s) for p in (SH + V(0, 0, .1), SH, EL, WR + V(0, .005, .05), WR)],
                  [(.05, .06), (.046, .05), (.04, .042), (.035, .036), (.036, .037)], face, n=6)
        fsegs = [('chest', sym(SH + V(0, 0, .15), s), sym(SH, s)), (f'upperarm_{sd}', sym(SH, s), sym(EL, s)),
                 (f'forearm_{sd}', sym(EL, s), sym(WR, s)), (f'paw_{sd}', sym(WR, s), sym(FT, s))]
        parts.append(bind_chain(fl, fsegs, .03))
        parts.append(bind(cyl(f'Sheep fhoof {s}', .04, .07, sym(WR + V(0, -.012, -.04), s), dark, verts=8, r2=.036,
                              bevel=.012), f'paw_{sd}'))
        hl = limb(f'Sheep hindleg {s}', [sym(p, s) for p in (HP + V(0, 0, .1), HP, KN, HK, HK + V(0, -.012, -.05))],
                  [(.06, .07), (.056, .065), (.042, .044), (.035, .036), (.036, .037)], face, n=6)
        hsegs = [('hips', sym(HP + V(0, 0, .15), s), sym(HP, s)), (f'thigh_{sd}', sym(HP, s), sym(KN, s)),
                 (f'shin_{sd}', sym(KN, s), sym(HK, s)), (f'foot_{sd}', sym(HK, s), sym(HT, s))]
        parts.append(bind_chain(hl, hsegs, .03))
        parts.append(bind(cyl(f'Sheep hhoof {s}', .04, .07, sym(HK + V(0, -.02, -.075), s), dark, verts=8, r2=.036,
                              bevel=.012), f'foot_{sd}'))
        # wool "trousers" on the upper legs
        parts.append(bind_chain(puff(f'Sheep leg wool f{s}', sym(SH + V(0, .01, .0), s), .085, wool, seg=6, rings=4, lump=.12,
                                     seed=70 + s), fsegs[:2], .04))
        parts.append(bind_chain(puff(f'Sheep leg wool h{s}', sym(HP + V(0, .02, -.02), s), .1, wool, seg=6, rings=4, lump=.12,
                                     seed=80 + s), hsegs[:2], .04))

    mesh = make_skin('sheep', arm, parts, dict(rays=36, distance=.25, strength=.6, ground=0.0))

    # ---------------------------------------------------------------- animation
    P = Player(arm)
    for sd in 'LR':
        P.leg(f'F{sd}', f'upperarm_{sd}', f'forearm_{sd}', f'paw_{sd}')
        P.leg(f'H{sd}', f'thigh_{sd}', f'shin_{sd}', f'foot_{sd}')
    T = {k: v['T'].copy() for k, v in P.legs.items()}

    def stand():
        return {k: (T[k].copy(), 0.0) for k in T}

    # Idle: graze (head down nibbling), lift up chewing and look around, ear flicks, tail wag, blinks
    def idle(p):
        pose = {'ik': stand()}
        g = window(p, .08, .56, .18)          # head down
        add(pose, 'chest', (6 * g, 0, 0))
        add(pose, 'neck', (48 * g, 0, 4 * g))
        add(pose, 'head', (22 * g + 3 * g * S(p, 9), 0, 0))
        add(pose, 'hips@loc', (0, 0, -.01 * g))
        chew = max(g * .6, window(p, .58, .9, .15))
        add(pose, 'jaw', (7 * chew * (.5 + .5 * S(p, 14)), 0, 3 * chew * S(p, 7)))
        lk = window(p, .62, .92, .25)
        add(pose, 'head', (-4 * lk, 0, 18 * lk * S(p, 1.5, .1)))
        add(pose, 'ear_L', (0, 0, -18 * pulse(p, .66, .02) + 10 * g))
        add(pose, 'ear_R', (0, 0, 18 * pulse(p, .8, .02) - 10 * g))
        sway(pose, 'tail', 2, p, 18 * pulse(p, .35, .06) + 3, 6, .1)
        set_lids(pose, eyes, blink(p, (.6, .95), .02), deg=100)
        add(pose, 'spine', (.8 * S(p, 3), 0, 0))
        return pose
    P.clip('Idle', 150, idle)

    # Walk: four-beat; 0.8 m/s
    WF, WD = 16, .62
    wsweep = .8 / K * WF / FPS * WD

    def walk(p):
        pose = {'ik': gait(P, T, p, {'HL': 0, 'FL': .25, 'HR': .5, 'FR': .75}, WD, wsweep, (.07, .065),
                           curl=(45, 30), roll=12, offset={'FL': V(0, .02, 0), 'FR': V(0, .02, 0)})}
        add(pose, 'hips@loc', (0, 0, -.012 + .008 * C(p, 2)))
        add(pose, 'hips', (1 * S(p, 2), 3 * S(p, 1, .1), 3 * S(p, 1)))
        add(pose, 'chest', (-1 * S(p, 2), -3 * S(p, 1), -2 * S(p, 1, .1)))
        add(pose, 'neck', (4 + 3 * S(p, 2, .1), 0, 3 * S(p, 1, .3)))
        add(pose, 'head', (-3 * S(p, 2, .2), 2 * S(p, 1, .3), 2 * S(p, 1, .4)))
        add(pose, 'ear_L', (0, 5 * S(p, 2, .3), 0))
        add(pose, 'ear_R', (0, -5 * S(p, 2, .3), 0))
        sway(pose, 'tail', 2, p, 8, 2, .1)
        set_lids(pose, eyes, 0, deg=100)
        return pose
    P.clip('Walk', WF, walk)

    # Run: bouncy bound (forelegs together, hind legs together); 3.5 m/s
    RF, RD = 10, .28
    rsweep = 3.5 / K * RF / FPS * RD

    def run(p):
        pose = {'ik': gait(P, T, p, {'HL': 0, 'HR': .06, 'FL': .5, 'FR': .56}, RD, rsweep, (.1, .1), curl=(70, 50),
                           roll=18, tangent=.4, offset={'FL': V(0, .03, 0), 'FR': V(0, .03, 0)})}
        add(pose, 'hips@loc', (0, 0, -.03 + .045 * max(0, C(p, 2, -.2))))
        add(pose, 'hips', (-6 * S(p, 1, .1), 0, 0))
        add(pose, 'spine', (4 * S(p, 1, .1), 0, 0))
        add(pose, 'chest', (3 * S(p, 1, .15), 0, 0))
        add(pose, 'neck', (-6 + 5 * S(p, 1, .3), 0, 0))
        add(pose, 'head', (4 - 4 * S(p, 1, .35), 0, 0))
        add(pose, 'ear_L', (30, 0, -10 + 10 * S(p, 2)))
        add(pose, 'ear_R', (30, 0, 10 - 10 * S(p, 2)))
        sway(pose, 'tail', 2, p, 10, 2, .1, base=(-20, 0, 0))
        set_lids(pose, eyes, 0, deg=100)
        return pose
    P.clip('Run', RF, run)

    # Bleat (once): head up, mouth wide with a wobbling "baa", ears back, eyes squeezed
    def bleat(p):
        pose = idle(0.0)
        k = window(p, .08, .9, .25)
        b = window(p, .28, .78, .15)
        add(pose, 'neck', (-18 * k, 0, 0))
        add(pose, 'head', (-26 * k, 0, 4 * k))
        add(pose, 'jaw', (30 * b + 6 * b * S(p, 9), 0, 0))
        add(pose, 'ear_L', (20 * k, 0, -18 * k + 6 * b * S(p, 9)))
        add(pose, 'ear_R', (20 * k, 0, 18 * k - 6 * b * S(p, 9, .5)))
        add(pose, 'chest', (-3 * b, 0, 0))
        pose['chest@scale'] = (1 + .03 * b, 1, 1 + .02 * b)
        set_lids(pose, eyes, .85 * b, deg=100)
        return pose
    P.clip('Bleat', 60, bleat, loop=False)

    export_animal('sheep', arm, P, scale=K)


# ====================================================================== CRAB


def build_crab():
    """Sandbar crab: glossy red-orange domed shell with a serrated rim and darker spots, cream-orange
    belly, big chunky pincers with maroon tips, eyes on stalks with little brows that knit when it is
    offended. Walk is sideways toward +X (the crab's left)."""
    reset()
    shell = mat('Crab shell', '#e8462a', rough=.35)
    belly = mat('Crab belly', '#f7b567', rough=.5)
    tips = mat('Crab tips', '#5b1a1f', rough=.35)
    spots = mat('Crab spots', '#b92f22', rough=.4)
    ew, dark, _ = eye_mats('Crab')
    parts = []

    bones = [('root', (0, 0, 0), (0, 0, .05), None),
             ('body', (0, 0, .11), (0, -.06, .11), 'root')]
    eyeC = V(.047, -.1, .228)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'eye_{sd}', sym(V(.034, -.083, .15), s), sym(V(.045, -.098, .21), s), 'body'),
                  (f'brow_{sd}', sym(V(.047, -.1, .262), s), sym(V(.047, -.13, .262), s), f'eye_{sd}'),
                  (f'arm_{sd}', sym(V(.1, -.06, .1), s), sym(V(.17, -.11, .11), s), 'body'),
                  (f'wrist_{sd}', sym(V(.17, -.11, .11), s), sym(V(.185, -.16, .125), s), f'arm_{sd}'),
                  (f'hand_{sd}', sym(V(.185, -.16, .125), s), sym(V(.18, -.27, .13), s), f'wrist_{sd}'),
                  (f'finger_{sd}', sym(V(.186, -.205, .158), s), sym(V(.18, -.29, .15), s), f'hand_{sd}')]
    legs = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        for i, (y, ang) in enumerate(((-.035, -24), (.0, -6), (.035, 12), (.07, 30))):
            h = V(math.cos(math.radians(ang)) * s, math.sin(math.radians(ang)), 0)
            J0 = V(.115 * s, y, .1)
            J1 = J0 + h * .058 + V(0, 0, .05)
            J2 = J1 + h * .048 + V(0, 0, -.045)
            J3 = J2 + h * .02 + V(0, 0, -J2.z + .0)
            nm = f'leg{i + 1}_{sd}'
            bones += [(f'{nm}_1', J0, J1, 'body'), (f'{nm}_2', J1, J2, f'{nm}_1'), (f'{nm}_3', J2, J3, f'{nm}_2')]
            legs.append((nm, s, h, (J0, J1, J2, J3)))
    arm = build_armature('Crab', bones)

    # ---------------------------------------------------------------- shell
    ck = [(0, .1, .115, .085, .04), (0, .06, .125, .142, .066), (0, -.02, .13, .158, .076), (0, -.08, .125, .132, .06),
          (0, -.108, .115, .09, .04)]
    body = loft('Crab carapace', ck, [shell, belly], n=14, sub=2, dome=(.7, .6),
                rad_fn=lambda u, a: .55 if math.sin(a) < -.05 else 1.0,
                mat_fn=lambda u, a: 1 if math.sin(a) < -.1 else 0)
    parts.append(bind(body, 'body'))
    surf = Surface([body])
    for k in range(5):          # serrated front rim
        a = math.radians(-56 + 28 * k)
        p0 = V(.15 * math.sin(a), -.02 - .085 * math.cos(a), .125)
        loc, n = surf.near(p0)
        parts.append(bind(sphere(f'Crab rim {k}', (.016, .016, .012), loc + n * .004, shell, seg=6, rings=4), 'body'))
    for k, (x, y, r) in enumerate(((0, -.02, .03), (.07, .02, .02), (-.07, .02, .02), (0, .06, .018))):
        parts.append(bind(surf.spot(f'Crab spot {k}', V(x, y, .3), r, spots, thick=.3, seg=8, rings=3,
                                    dirn=V(0, 0, -1)), 'body'))
    # ---------------------------------------------------------------- eyes on stalks, brows
    eyes = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        parts.append(bind(rod(f'Crab stalk {s}', sym(V(.03, -.078, .13), s), sym(V(.045, -.098, .215), s), .011, shell,
                              verts=6), f'eye_{sd}'))
        e = Eye(f'Crab eye {sd}', sym(eyeC, s), sym(V(.25, -1, .15), s), .03, ew, dark, None, pupil=.62, tall=1.15,
                look=(-.1 * s, .05), seg=10, rings=5, low=True)
        for p_ in e.parts:
            parts.append(bind(p_, f'eye_{sd}'))
        parts.append(bind(lobe(f'Crab brow {s}', [sym(V(.022, -.112, .258), s), sym(V(.047, -.118, .265), s),
                                                  sym(V(.07, -.11, .258), s)], .009, tips, side=Z, n=5, flat=.6, tip=.5),
                          f'brow_{sd}'))

    # ---------------------------------------------------------------- claws
    for s, sd in ((1, 'L'), (-1, 'R')):
        parts.append(bind_chain(limb(f'Crab arm {s}', [sym(p, s) for p in (V(.09, -.055, .1), V(.17, -.11, .11), V(.185, -.16, .125))],
                                     [(.02, .018), (.024, .02), (.026, .024)], shell, n=6, sub=2, dome=(.5, .5)),
                                [('body', sym(V(.06, -.04, .1), s), sym(V(.1, -.06, .1), s)),
                                 (f'arm_{sd}', sym(V(.1, -.06, .1), s), sym(V(.17, -.11, .11), s)),
                                 (f'wrist_{sd}', sym(V(.17, -.11, .11), s), sym(V(.185, -.16, .125), s))], .02))
        hand = loft(f'Crab hand {s}', keys_sym([(.186, -.158, .128, .034, .03), (.19, -.2, .133, .05, .044),
                                                (.186, -.24, .126, .042, .034), (.18, -.275, .118, .02, .016),
                                                (.178, -.295, .114, .008, .007)], s),
                    [shell, tips], n=8, sub=2, dome=(.6, .6), mat_fn=lambda u, a: 1 if u > 2.6 else 0)
        parts.append(bind(hand, f'hand_{sd}'))
        finger = loft(f'Crab finger {s}', keys_sym([(.186, -.205, .158, .022, .018), (.184, -.245, .166, .018, .015),
                                                    (.18, -.28, .158, .01, .009), (.179, -.296, .148, .005, .005)], s),
                      [shell, tips], n=6, sub=2, dome=(.6, .6), mat_fn=lambda u, a: 1 if u > 1.8 else 0)
        parts.append(bind(finger, f'finger_{sd}'))

    # ---------------------------------------------------------------- legs
    for nm, s, h, (J0, J1, J2, J3) in legs:
        lg = limb(f'Crab {nm}', [J0 - h * .01, J1, J2, J3 + V(0, 0, .006)], [(.02, .016), (.018, .014), (.014, .012), (.005, .005)],
                  [shell, tips], n=5, sub=2, dome=(0, .5), side=X,
                  mat_fn=lambda u, a: 1 if u > 2.5 else 0)
        parts.append(bind_chain(lg, [('body', J0 - h * .03, J0), (f'{nm}_1', J0, J1), (f'{nm}_2', J1, J2),
                                     (f'{nm}_3', J2, J3)], .012))

    make_skin('crab', arm, parts, dict(rays=32, distance=.12, strength=.6, ground=0.0))

    # ---------------------------------------------------------------- animation
    P = Player(arm)
    for nm, s, h, _ in legs:
        P.leg(nm, f'{nm}_1', f'{nm}_2', f'{nm}_3', plane=h, yaw=True)
    T = {k: v['T'].copy() for k, v in P.legs.items()}
    group_a = {'leg1_L', 'leg3_L', 'leg2_R', 'leg4_R'}

    def stand(dz=0.0):
        return {k: (T[k] + V(0, 0, dz), 0.0) for k in T}

    def claws(pose, p, open_l, open_r, raise_=0.0, spread=0.0):
        for sd, sg, op in (('L', 1, open_l), ('R', -1, open_r)):
            add(pose, f'arm_{sd}', (-raise_, 0, spread * sg))
            add(pose, f'wrist_{sd}', (-raise_ * .6, 0, -spread * .5 * sg))
            add(pose, f'finger_{sd}', (-op, 0, 0))
        return pose

    # Idle: breathing bob, lazy claw clicks, eye stalks swivel, a leg shuffles
    def idle(p):
        pose = {'ik': stand()}
        tap = pulse(p, .55, .06)
        pose['ik']['leg2_L'] = (T['leg2_L'] + V(0, 0, .03 * tap), 0.0)
        pose['ik']['leg3_R'] = (T['leg3_R'] + V(0, 0, .03 * pulse(p, .2, .06)), 0.0)
        add(pose, 'body@loc', (0, 0, .004 * S(p, 2)))
        add(pose, 'body', (1.5 * S(p, 2, .1), 0, 3 * S(p, 1)))
        claws(pose, p, 22 * pulse(p, .3, .05) + 8, 22 * pulse(p, .38, .05) + 8, 4 + 3 * S(p, 1), 4 * S(p, 1, .2))
        add(pose, 'eye_L', (0, 0, 20 * S(p, 1, .1)))
        add(pose, 'eye_R', (0, 0, 20 * S(p, 1, .15)))
        return pose
    P.clip('Idle', 90, idle)

    # Walk: sideways (toward +X) alternating tetrapod; 0.35 m/s
    WF, WD = 16, .5
    sweep = .35 * WF / FPS * WD

    def walk(p):
        ik = {}
        for nm in T:
            ph = 0 if nm in group_a else .5
            dy, dz, _ = foot_path(p, ph, WD, sweep, .035, curl=0, roll=0)
            ik[nm] = (T[nm] + V(-dy, 0, dz), 0.0)
        pose = {'ik': ik}
        add(pose, 'body@loc', (0, 0, .006 * C(p, 2)))
        add(pose, 'body', (0, 3 * S(p, 2), 3 * S(p, 1)))
        claws(pose, p, 10 + 6 * S(p, 2), 10 + 6 * S(p, 2, .5), 10, 6 * S(p, 1))
        add(pose, 'eye_L', (-6 * S(p, 2), 0, 8))
        add(pose, 'eye_R', (-6 * S(p, 2, .2), 0, 8))
        return pose
    P.clip('Walk', WF, walk)

    # Angry: rears up on its legs, claws raised high and wide, snapping, stomping, brows knitted
    def angry(p):
        pose = {'ik': {}}
        for nm in T:
            st = pulse(p, .25 if nm in group_a else .75, .08)
            pose['ik'][nm] = (T[nm] + V(0, 0, .03 * st), 0.0)
        add(pose, 'body@loc', (0, 0, .035 + .006 * S(p, 4)))
        add(pose, 'body', (-10, 4 * S(p, 2), 0))
        snapl = 40 * max(0, S(p, 4)) ** .5
        snapr = 40 * max(0, S(p, 4, .5)) ** .5
        claws(pose, p, snapl, snapr, 55 + 6 * S(p, 2), 28)
        add(pose, 'hand_L', (-20, 0, 10 * S(p, 2)))
        add(pose, 'hand_R', (-20, 0, -10 * S(p, 2)))
        add(pose, 'eye_L', (8, 0, -14))
        add(pose, 'eye_R', (8, 0, 14))
        add(pose, 'brow_L', (0, -28, 0))
        add(pose, 'brow_R', (0, 28, 0))
        return pose
    P.clip('Angry', 40, angry)

    export_animal('crab', arm, P)


# ====================================================================== CROW


# ---------------------------------------------------------------------- bird helpers


def mirror_q(q):
    """Mirror an armature-space rotation across the X=0 plane (left wing -> right wing)."""
    return Quaternion((q.w, q.x, -q.y, -q.z))


def fold_frame(back, down_hint):
    """Rotation taking an extended left wing (span +X, chord +Y, dorsal +Z) to a folded wing lying
    along the body (span -> back, chord -> down)."""
    b = Vector(back).normalized()
    d = Vector(down_hint)
    d = (d - b * b.dot(d)).normalized()
    return Matrix((b, d, b.cross(d))).transposed()


def build_wing(prefix, S, R, span, chord, thick, mats, primaries, prim_len, secondaries, sec_len,
               bones_out, parent, sheen_fn=None, tip_up=0.0, feather_m=None):
    """Left wing modelled spread (span along +X from shoulder S), then rotated into its folded pose by R.
    Returns (parts, segs, unfold quaternion). Bones wing1..3 are appended to bones_out, then mirrored
    by the caller for the right side."""
    S = Vector(S)
    pts = [S + V(span * f, dy, dz) for f, dy, dz in ((0, 0, 0), (.33, -.002, .004), (.6, -.006, .006), (1.0, .03, tip_up))]
    parts = []
    stations = [(0, chord * .5, thick), (.33, chord * .52, thick * .75), (.6, chord * .45, thick * .55),
                (.82, chord * .32, thick * .4)]
    keys = []
    for f, w, h in stations:
        c = S + V(span * f, chord * .28 + f * chord * .1, 0)
        keys.append((c.x, c.y, c.z, w, h))
    wm = loft(f'{prefix} wing', keys, mats, n=6, sub=2, side=Y, dome=(.2, .8),
              mat_fn=(lambda u, a: sheen_fn(u, a)) if sheen_fn else None)
    parts.append(wm)
    fm = feather_m or (mats[-1] if isinstance(mats, (list, tuple)) else mats)
    for k in range(primaries):
        f = k / max(primaries - 1, 1)
        root = S + V(span * (.62 + .2 * f), chord * (.3 + .22 * f), 0)
        ang = math.radians(8 + 58 * f)
        parts.append(slab_feather(f'{prefix} primary {k}', root, V(math.cos(ang), math.sin(ang), 0), prim_len * (1 - .18 * f),
                                  chord * .3, thick * .3, fm, up=Z, droop=.0, segs=2, tip=.35))
    for k in range(secondaries):
        f = k / max(secondaries - 1, 1)
        root = S + V(span * (.08 + .5 * f), chord * .5, -thick * .1)
        parts.append(slab_feather(f'{prefix} secondary {k}', root, V(.12, 1, 0), sec_len, chord * .34, thick * .3, fm,
                                  up=Z, droop=.0, segs=2, tip=.45))
    # fold: rotate every vertex about the shoulder
    for ob in parts:
        for v in ob.data.vertices:
            v.co = S + R @ (ob.matrix_world @ v.co - S)
        ob.data.update()
    fp = [S + R @ (p - S) for p in pts]
    bones_out += [(f'wing1_L', fp[0], fp[1], parent), (f'wing2_L', fp[1], fp[2], 'wing1_L'),
                  (f'wing3_L', fp[2], fp[3], 'wing2_L')]
    segs = [(parent, fp[0] - (fp[1] - fp[0]) * .3, fp[0]), ('wing1_L', fp[0], fp[1]), ('wing2_L', fp[1], fp[2]),
            ('wing3_L', fp[2], fp[3])]
    return parts, segs, R.to_quaternion().inverted()


def mirror_part(ob, name):
    """Mirror a built (unparented, world-space) part across X into a new object."""
    new = mirror_copy(ob, name)
    return new


def bird_leg(prefix, s, hip, knee, ankle, toe, mats, r=.012, toes=((-35, 1.0), (0, 1.15), (35, 1.0)), back_toe=.5,
             toe_len=.045):
    """Scaly bird leg: thigh (feathered, bound by caller), tarsus and three forward toes + hallux."""
    out = []
    out.append(limb(f'{prefix} tarsus {s}', [knee, ankle], [(r, r), (r * .9, r * .9)], mats, n=6, sub=2, dome=(.5, .5)))
    for k, (ang, ln) in enumerate(toes):
        a = math.radians(ang) * s
        d = V(math.sin(a), -math.cos(a), 0)
        out.append(limb(f'{prefix} toe {s}{k}', [ankle + V(0, 0, -.004), ankle + d * toe_len * ln * .6 + V(0, 0, -ankle.z + r * .6),
                                                 ankle + d * toe_len * ln + V(0, 0, -ankle.z + r * .5)],
                        [(r * .8, r * .7), (r * .65, r * .55), (r * .35, r * .3)], mats, n=5, sub=1, dome=(0, .8)))
    out.append(limb(f'{prefix} hallux {s}', [ankle, ankle + V(0, toe_len * back_toe, -ankle.z + r * .5)],
                    [(r * .7, r * .6), (r * .35, r * .3)], mats, n=5, sub=1, dome=(0, .8)))
    return out

def build_crow():
    """Orchard crow: glossy blue-black with blue-violet sheen on the wing coverts and tail, a heavy dark
    beak, bright cartoon eyes, scruffy throat hackles. Wings fold along the body and spread to a
    0.5 m span in Fly."""
    reset()
    plum = mat('Crow plumage', '#222a40', rough=.28)
    sheen = mat('Crow sheen', '#2b3868', rough=.22)
    beak = mat('Crow beak', '#454a57', rough=.32)
    legm = mat('Crow legs', '#383c47', rough=.45)
    ew, dark, _ = eye_mats('Crow')
    parts = []

    # body and head
    bk = [(0, .1, .14, .045, .04), (0, .05, .15, .07, .07), (0, -.02, .165, .078, .08), (0, -.07, .19, .06, .065),
          (0, -.1, .225, .045, .048)]
    body = loft('Crow body', bk, plum, n=10, sub=2, dome=(.6, 0))
    hk = [(0, -.08, .245, .04, .042), (0, -.115, .255, .054, .054), (0, -.15, .25, .048, .046), (0, -.17, .242, .03, .03)]
    head = loft('Crow head', hk, plum, n=10, sub=2, dome=(.8, .5))
    hs = Surface([head])
    eyeN, eyeR = V(.72, -.62, .25), .02
    eyeC = seat_eye(hs, V(.03, -.14, .262), eyeN, eyeR, .35)

    SHO = V(.052, -.04, .19)
    R = fold_frame(V(.12, 1, -.12), V(.25, 0, -1))
    bones = [('root', (0, 0, 0), (0, 0, .05), None),
             ('body', (0, .0, .15), (0, -.06, .17), 'root'),
             ('neck', (0, -.065, .2), (0, -.09, .23), 'body'),
             ('head', (0, -.09, .245), (0, -.18, .245), 'neck'),
             ('jaw', (0, -.16, .232), (0, -.245, .218), 'head')]
    tail = [V(0, .08, .14), V(0, .15, .12), V(0, .22, .1)]
    chain_bones(bones, 'tail', tail, 'body')
    wing_parts, wsegs, unfold = build_wing('Crow L', SHO, R, .22, .115, .018, [plum, sheen], 4, .12, 3, .06, bones, 'body',
                                           sheen_fn=lambda u, a: 1 if (math.sin(a) > .2 and u < 4.2) else 0, tip_up=.01,
                                           feather_m=plum)
    # right wing: mirror geometry and bones
    for b in [b for b in bones if b[0].startswith('wing')]:
        bones.append((b[0].replace('_L', '_R'), mirror_x(b[1]), mirror_x(b[2]),
                      b[3].replace('_L', '_R') if b[3].startswith('wing') else b[3]))
    hip, knee, ankle = V(.03, .01, .125), V(.034, -.005, .075), V(.034, .01, .022)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'thigh_{sd}', sym(hip, s), sym(knee, s), 'body'), (f'shin_{sd}', sym(knee, s), sym(ankle, s), f'thigh_{sd}'),
                  (f'foot_{sd}', sym(ankle, s), sym(V(.034, -.035, 0), s), f'shin_{sd}')]
    arm = build_armature('Crow', bones)
    body_segs = [('tail_1', V(0, .14, .13), V(0, .08, .14)), ('body', V(0, .08, .14), V(0, -.06, .17)),
                 ('neck', V(0, -.06, .17), V(0, -.09, .24)), ('head', V(0, -.09, .24), V(0, -.14, .25))]
    parts.append(bind_chain(body, body_segs, .03))
    parts.append(bind(head, 'head'))
    for p_ in wing_parts:
        mp = mirror_copy(p_, p_.name.replace(' L ', ' R '))
        parts.append(bind_chain(p_, wsegs, .02))
        rsegs = [(b.replace('_L', '_R'), mirror_x(a), mirror_x(c)) for b, a, c in wsegs]
        parts.append(bind_chain(mp, rsegs, .02))

    # beak (upper on head, lower on jaw), throat hackles, crown tuft
    parts.append(bind(loft('Crow beak top', [(0, -.16, .25, .022, .02), (0, -.2, .243, .017, .014), (0, -.235, .235, .01, .008),
                                             (0, -.255, .228, .004, .004)], beak, n=6, sub=2, dome=(0, .6)), 'head'))
    parts.append(bind(loft('Crow beak low', [(0, -.16, .232, .018, .011), (0, -.2, .229, .014, .009), (0, -.24, .226, .006, .005)],
                           beak, n=6, sub=1, dome=(0, .6)), 'jaw'))
    for k, x in enumerate((-.012, .012)):
        parts.append(bind(lobe(f'Crow hackle {k}', [V(x, -.135, .215), V(x * 1.3, -.14, .195), V(x * 1.5, -.13, .178)], .016,
                               plum, side=X, n=5, flat=.6, tip=.3), 'neck'))
    for k, x in enumerate((0,)):
        parts.append(bind(lobe(f'Crow crown {k}', [V(x, -.1, .292), V(x, -.08, .306), V(x, -.06, .303)], .016,
                               plum, side=X, n=5, flat=.6, tip=.3), 'head'))
    eyes = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        e = Eye(f'Crow eye {sd}', sym(eyeC, s), sym(eyeN, s), eyeR, ew, dark, None, pupil=.62, tall=1.1,
                look=(-.15 * s, .04), seg=8, rings=5, low=True)
        for p_ in e.parts:
            parts.append(bind(p_, 'head'))
    # tail fan: five feathers, sheen edges
    for k in range(4):
        f = (k - 1.5) / 1.5
        root = V(f * .012, .08, .14)
        parts.append(bind_chain(slab_feather(f'Crow tail {k}', root, V(f * .26, 1, -.28), .13 - abs(f) * .012, .038, .006,
                                             sheen if k in (0, 3) else plum, up=Z, droop=.02, segs=3, tip=.5),
                                chain_segs('tail', tail, ('body', V(0, .02, .15), tail[0])), .02))
    # legs
    for s, sd in ((1, 'L'), (-1, 'R')):
        parts.append(bind_chain(lobe(f'Crow thigh {s}', [sym(hip + V(0, 0, .02), s), sym(hip.lerp(knee, .6), s), sym(knee, s)], .022,
                                     plum, side=X, n=6, flat=.9, tip=.6),
                                [('body', sym(hip + V(0, 0, .04), s), sym(hip, s)), (f'thigh_{sd}', sym(hip, s), sym(knee, s))], .015))
        for p_ in bird_leg('Crow', s, sym(hip, s), sym(knee, s), sym(ankle, s), None, legm, r=.006, toe_len=.04):
            parts.append(bind_chain(p_, [(f'shin_{sd}', sym(knee, s), sym(ankle, s)), (f'foot_{sd}', sym(ankle, s),
                                                                                        sym(V(.034, -.035, 0), s))], .004))

    make_skin('crow', arm, parts, dict(rays=32, distance=.08, strength=.55, ground=0.0))

    # ---------------------------------------------------------------- animation
    P = Player(arm)
    for sd in 'LR':
        P.leg(sd, f'thigh_{sd}', f'shin_{sd}', f'foot_{sd}')
    T = {k: v['T'].copy() for k, v in P.legs.items()}
    fold_l, fold_r = Quaternion(), Quaternion()
    unfold_r = mirror_q(unfold)
    chord_axis = R @ Y                      # the spread wing's chord axis, in folded (rest) space
    span_axis = R @ X

    def wings(pose, open_k, flap_deg, bend_deg=0.0, twist=0.0):
        """open_k 0 = folded, 1 = spread. flap about world Y (+ up), bend of the outer wing about the chord."""
        qo = Quaternion().slerp(unfold, open_k)
        qf = Quaternion(Y, D(-flap_deg))
        pose['wing1_L'] = qf @ qo
        pose['wing1_R'] = mirror_q(qf) @ mirror_q(qo)
        qb = Quaternion(chord_axis, D(-bend_deg)) @ Quaternion(span_axis, D(twist))
        pose['wing2_L'] = qb
        pose['wing2_R'] = mirror_q(qb)
        pose['wing3_L'] = Quaternion(chord_axis, D(-bend_deg * .6))
        pose['wing3_R'] = mirror_q(pose['wing3_L'])
        return pose

    def perch(dz=0.0):
        return {k: (T[k].copy(), 0.0) for k in T}

    # Idle: head cocks and turns, tail bobs, a feather ruffle and a caw
    def idle(p):
        pose = {'ik': perch()}
        look = keyed(p, [(0, {'h': (0, 0, 0)}), (.15, {'h': (0, 0, 0)}), (.22, {'h': (-6, 18, 35)}), (.42, {'h': (-6, 18, 35)}),
                         (.5, {'h': (4, -10, -30)}), (.68, {'h': (4, -10, -30)}), (.76, {'h': (0, 0, 0)}), (1, {'h': (0, 0, 0)})])['h']
        add(pose, 'head', look)
        add(pose, 'neck', (look[0] * .5, 0, look[2] * .3))
        caw = pulse(p, .86, .05)
        add(pose, 'jaw', (26 * caw, 0, 0))
        add(pose, 'neck', (-10 * caw, 0, 0))
        add(pose, 'body', (-4 * caw, 0, 0))
        add(pose, 'body@loc', (0, 0, .002 * S(p, 4)))
        add(pose, 'tail_1', (-10 * pulse(p, .3, .03) - 10 * pulse(p, .87, .04), 0, 0))
        ruf = pulse(p, .6, .04)
        wings(pose, .12 * ruf, 8 * ruf)
        pose['body@scale'] = (1 + .08 * ruf, 1, 1 + .06 * ruf)
        return pose
    P.clip('Idle', 120, idle)

    # Hop (once): crouch, spring up with a half-open flick of the wings, land and settle
    def hop(p):
        pose = {'ik': perch()}
        crouch = window(p, .02, .3, .4) - .6 * window(p, .6, .85, .4)
        air = window(p, .22, .66, .35)
        z = .07 * math.sin(math.pi * max(0, min(1, (p - .22) / .44))) if .22 < p < .66 else 0.0
        add(pose, 'body@loc', (0, 0, -.02 * crouch + z))
        for k in T:
            pose['ik'][k] = (T[k] + V(0, 0, z * .85), 25 * air)
        add(pose, 'body', (8 * crouch - 12 * air, 0, 0))
        add(pose, 'neck', (-6 * air, 0, 0))
        add(pose, 'tail_1', (-20 * air + 10 * crouch, 0, 0))
        wings(pose, .45 * air, 25 * air * math.sin(p * 18))
        return pose
    P.clip('Hop', 30, hop, loop=False)

    # Fly: wings spread to 0.5 m and flap; body level, legs tucked, tail fanned
    def fly(p):
        pose = {'ik': {k: (T[k] + V(0, .08, .09), 80.0) for k in T}}
        f = S(p, 1)
        add(pose, 'body', (20 - 3 * f, 0, 0))
        add(pose, 'body@loc', (0, 0, .03 - .012 * f))
        add(pose, 'neck', (-12, 0, 0))
        add(pose, 'head', (-8 + 3 * f, 0, 0))
        add(pose, 'tail_1', (-16 + 4 * f, 0, 0))
        pose['tail_1@scale'] = (1.5, 1, 1)
        wings(pose, 1.0, 38 * f + 4, bend_deg=22 * C(p, 1, .1), twist=10 * C(p, 1))
        return pose
    P.clip('Fly', 20, fly)

    export_animal('crow', arm, P, scale=.82)       # 0.5 m wingspan in Fly


# ====================================================================== FISH (trout, starfin, koi)


def star_outline(r_out, r_in, points=5, rot=0.0):
    out = []
    for k in range(points * 2):
        a = rot + math.pi / 2 + math.pi * k / points
        r = r_out if k % 2 == 0 else r_in
        out.append((r * math.cos(a), r * math.sin(a)))
    return out


def build_fish(name, variant):
    """0.45 m fish, origin at body centre, swimming along -Y. Body wave on spine_1..3 + tail (yaw), head
    counter-sways, jaw gapes and pectoral fins flutter."""
    reset()
    ew, dark, _ = eye_mats(variant.capitalize())
    if variant == 'trout':
        back = mat('Trout back', '#4f8c3c', rough=.3)
        band = mat('Trout band', '#f06a78', rough=.28)
        belly = mat('Trout belly', '#f5ecda', rough=.3)
        spot = mat('Trout spots', '#26302a', rough=.35)
        finm = mat('Trout fins', '#c79a4e', rough=.35)
        mats = [back, band, belly]

        def body_mat(u, a):
            sa = math.sin(a)
            if sa < -.38:
                return 2
            if -.38 <= sa < .08 and 1.0 < u < 5.6:
                return 1
            return 0
    elif variant == 'koi':
        white = mat('Koi white', '#f7f1e6', rough=.28)
        red = mat('Koi red', '#ec4a1c', rough=.28)
        spot = mat('Koi black', '#231f26', rough=.3)
        finm = white
        mats = [white, red]

        def body_mat(u, a):
            return 0
    else:
        deep = mat('Starfin blue', '#1c3c9e', rough=.25)
        light = mat('Starfin belly', '#3f73d8', rough=.3)
        spot = mat('Lamp star', '#ffc45a', rough=.3, emit=1.6)
        finm = spot
        mats = [deep, light]

        def body_mat(u, a):
            return 1 if math.sin(a) < -.35 else 0

    bones = [('root', (0, 0, 0), (0, 0, .04), None),
             ('head', (0, -.075, 0), (0, -.2, 0), 'root'),
             ('jaw', (0, -.175, -.018), (0, -.228, -.014), 'head'),
             ('spine_1', (0, -.075, 0), (0, -.01, 0), 'root'),
             ('spine_2', (0, -.01, 0), (0, .06, 0), 'spine_1'),
             ('spine_3', (0, .06, 0), (0, .125, 0), 'spine_2'),
             ('tail', (0, .125, 0), (0, .23, 0), 'spine_3'),
             ('fin_L', (.05, -.1, -.03), (.08, -.06, -.045), 'head'),
             ('fin_R', (-.05, -.1, -.03), (-.08, -.06, -.045), 'head')]
    arm = build_armature(name.replace('-', '_'), bones)
    segs = [('head', V(0, -.25, 0), V(0, -.075, 0)), ('spine_1', V(0, -.075, 0), V(0, -.01, 0)),
            ('spine_2', V(0, -.01, 0), V(0, .06, 0)), ('spine_3', V(0, .06, 0), V(0, .125, 0)),
            ('tail', V(0, .125, 0), V(0, .26, 0))]
    parts = []
    keys = [(0, -.222, -.004, .018, .016), (0, -.195, .002, .042, .05), (0, -.13, .006, .06, .074), (0, -.04, .007, .06, .076),
            (0, .05, .004, .047, .058), (0, .12, 0, .024, .032), (0, .15, 0, .014, .02)]
    if variant == 'koi':
        keys = [(0, -.222, -.004, .02, .016), (0, -.195, .0, .045, .045), (0, -.13, .004, .066, .068), (0, -.04, .006, .066, .07),
                (0, .05, .004, .05, .052), (0, .12, 0, .025, .03), (0, .15, 0, .015, .02)]
    body = loft(f'{name} body', keys, mats, n=12 if variant != 'koi' else 10, sub=2, dome=(.8, .3), mat_fn=body_mat)
    parts.append(bind_chain(body, segs, .03))
    surf = Surface([body])
    # lower lip on the jaw bone, mouth inside
    parts.append(bind(loft(f'{name} lip', [(0, -.18, -.02, .022, .01), (0, -.205, -.02, .018, .009), (0, -.225, -.017, .009, .006)],
                           mats[-1] if variant != 'koi' else mats[0], n=6, sub=1, dome=(0, .6)), 'jaw'))
    parts.append(bind(sphere(f'{name} mouth', (.015, .02, .01), (0, -.205, -.012), dark, seg=6, rings=3), 'head'))
    # eyes (fish have no lids)
    eyeN, eyeR = V(.85, -.45, .18), .019
    eyeC = seat_eye(surf, V(.03, -.165, .022), eyeN, eyeR, .35)
    for s in (1, -1):
        e = Eye(f'{name} eye {s}', sym(eyeC, s), sym(eyeN, s), eyeR, ew, dark, None, pupil=.66, tall=1.0,
                look=(0, 0), seg=8, rings=5, low=True)
        for p_ in e.parts:
            parts.append(bind(p_, 'head'))

    # ---------------------------------------------------------------- fins
    def fin(nm, outline, bone_or_segs, m=None, thick=.006):
        f = plate(f'{name} {nm}', outline, thick, m or finm, Y, Z, V(0, 0, 0), bevel=.0025, segments=1)
        if isinstance(bone_or_segs, str):
            parts.append(bind(f, bone_or_segs))
        else:
            parts.append(bind_chain(f, bone_or_segs, .03))
    if variant == 'koi':
        caudal = [(.13, .02), (.19, .085), (.27, .12), (.3, .09), (.27, .03), (.255, 0), (.27, -.03), (.3, -.09), (.27, -.12),
                  (.19, -.085), (.13, -.02)]
        dorsal = [(-.09, .06), (-.06, .095), (0, .1), (.06, .085), (.1, .045)]
    elif variant == 'starfin':
        caudal = [(.13, .02), (.18, .07), (.2, .13), (.225, .085), (.27, .1), (.25, .03), (.24, 0), (.25, -.03), (.27, -.1),
                  (.225, -.085), (.2, -.13), (.18, -.07), (.13, -.02)]
        dorsal = [(-.09, .07), (-.075, .15), (-.045, .1), (-.02, .165), (.005, .1), (.035, .14), (.06, .065)]
    else:
        caudal = [(.13, .02), (.18, .065), (.235, .095), (.252, .075), (.225, .02), (.215, 0), (.225, -.02), (.252, -.075),
                  (.235, -.095), (.18, -.065), (.13, -.02)]
        dorsal = [(-.07, .07), (-.045, .125), (.0, .128), (.04, .09), (.052, .058)]
    fin('caudal', caudal, [('spine_3', V(0, .06, 0), V(0, .125, 0)), ('tail', V(0, .125, 0), V(0, .3, 0))])
    fin('dorsal', dorsal, segs[1:4])
    fin('anal', [(.04, -.045), (.065, -.085), (.1, -.08), (.105, -.035)], segs[2:4])
    if variant == 'trout':
        fin('adipose', [(.09, .04), (.1, .065), (.12, .06), (.125, .03)], segs[3:4])
    for s, sd in ((1, 'L'), (-1, 'R')):
        ln = .085 if variant != 'trout' else .065
        pec = lobe(f'{name} pectoral {s}', [sym(V(.045, -.11, -.028), s), sym(V(.075, -.08, -.045), s),
                                            sym(V(.05 + ln, -.11 + ln * .7, -.06), s)], .026 if variant != 'trout' else .022,
                   finm, side=Z, n=5, flat=.18, tip=.45)
        parts.append(bind(pec, f'fin_{sd}'))
        pel = lobe(f'{name} pelvic {s}', [sym(V(.03, .0, -.06), s), sym(V(.05, .035, -.075), s)], .016, finm, side=Z, n=5,
                   flat=.2, tip=.4)
        parts.append(bind_chain(pel, segs[1:3], .03))

    # ---------------------------------------------------------------- markings
    if variant == 'trout':
        for k, (u, a) in enumerate(((1.8, 60), (2.6, 44), (3.4, 66), (4.3, 50), (5.0, 60), (2.2, 120), (3.1, 136), (4.0, 118))):
            p = spline_at(keys, u)
            ar = math.radians(a)
            pos = V(math.cos(ar) * p[3] * 1.4, p[1], p[2] + math.sin(ar) * p[4] * 1.4)
            parts.append(bind_chain(surf.spot(f'{name} spot {k}', pos, .0085, spot, thick=.35, seg=6, rings=2), segs, .03))
    elif variant == 'koi':
        # kohaku red saddles with smooth outlines, conformed to the body
        for k, (y0, y1, w, cx) in enumerate(((-.205, -.13, .05, .0), (-.095, .025, .085, .012), (.05, .12, .06, -.01))):
            for p_ in conform_patch(f'{name} red {k}', surf, V(cx, 0, .03), X, Y, y0, y1,
                                    lambda t, w=w: w * math.sin(math.pi * min(1, .12 + t * .88)) ** .55 + .004, 4, 4, .0015,
                                    .003, red, ray_axis=lambda q: V(0, q.y, .0)):
                parts.append(bind_chain(p_, segs, .03))
        for k, (u, a) in enumerate(((2.6, 65), (4.1, 115))):
            p = spline_at(keys, u)
            ar = math.radians(a)
            pos = V(math.cos(ar) * p[3] * 1.4, p[1], p[2] + math.sin(ar) * p[4] * 1.4)
            parts.append(bind_chain(surf.spot(f'{name} spot {k}', pos, (.018, .013), spot, thick=.25, seg=8, rings=2), segs, .03))
        for s in (1, -1):      # barbels
            parts.append(bind(tube(f'{name} barbel {s}', [sym(V(.012, -.212, -.012), s), sym(V(.03, -.22, -.03), s),
                                                          sym(V(.042, -.21, -.05), s)], .0035, finm, verts=4), 'head'))
    else:
        for k, (u, a, r) in enumerate(((1.6, 60, .014), (2.4, 100, .012), (3.1, 50, .016), (3.8, 125, .011), (4.5, 70, .012),
                                       (2.0, 130, .01))):
            p = spline_at(keys, u)
            ar = math.radians(a)
            pos = V(math.cos(ar) * p[3], p[1], p[2] + math.sin(ar) * p[4])
            loc, n = surf.near(pos * 1.2)
            tang = n.cross(Y).normalized()
            parts.append(bind_chain(plate(f'{name} star {k}', star_outline(r, r * .45, rot=k * .4), .003, spot,
                                          tang, n.cross(tang), loc + n * .002, bevel=0), segs, .03))
    make_skin(name, arm, parts, dict(rays=28, distance=.06, strength=.5, ground=None))

    # ---------------------------------------------------------------- animation
    P = Player(arm)

    def wave(pose, p, amp, cycles=1.0, lag=.13):
        for i, (b, k) in enumerate((('spine_1', .25), ('spine_2', .5), ('spine_3', .8), ('tail', 1.15))):
            add(pose, b, (0, 0, amp * k * S(p, cycles, -lag * (i + 1))))
        add(pose, 'head', (0, 0, -amp * .2 * S(p, cycles, 0)))
        return pose

    # Swim: travelling S-wave, fins sculling
    def swim(p):
        pose = {}
        wave(pose, p, 16)
        add(pose, 'root', (0, 2 * S(p, 1, .25), 0))
        add(pose, 'root@loc', (.004 * S(p, 1, .1), 0, .003 * S(p, 2)))
        add(pose, 'fin_L', (0, 14 * S(p, 2), 10 + 10 * S(p, 2)))
        add(pose, 'fin_R', (0, -14 * S(p, 2, .5), -10 - 10 * S(p, 2, .5)))
        add(pose, 'jaw', (6 + 5 * S(p, 2), 0, 0))
        return pose
    P.clip('Swim', 30, swim)

    # Flop: thrashing on the hook - big alternating C-curls, gaping jaw, flared fins, body roll
    def flop(p):
        pose = {}
        c = S(p, 1)
        for b, k in (('spine_1', 12), ('spine_2', 16), ('spine_3', 20), ('tail', 26)):
            add(pose, b, (0, 0, k * c + 5 * S(p, 2, .1)))
        add(pose, 'head', (-6 * S(p, 2), 0, -10 * c))
        add(pose, 'root', (8 * S(p, 2, .2), 18 * c, 0))
        add(pose, 'root@loc', (0, 0, .01 * S(p, 2)))
        add(pose, 'jaw', (20 + 14 * S(p, 3), 0, 0))
        add(pose, 'fin_L', (0, 25 + 15 * S(p, 3), 35))
        add(pose, 'fin_R', (0, -25 - 15 * S(p, 3, .5), -35))
        return pose
    P.clip('Flop', 16, flop)

    export_animal(name, arm, P, scale={'trout': .92, 'starfin': .9, 'koi': .85}[variant])   # 0.45 m long


def build_trout():
    build_fish('fish-trout', 'trout')


def build_starfin():
    build_fish('fish-starfin', 'starfin')


def build_koi():
    build_fish('fish-koi', 'koi')


# ====================================================================== CHICKEN


def build_chicken():
    """Farm hen: plump chestnut body, golden neck hackles, an upturned dark tail fan, a big red comb and
    wattles, yellow beak and scaly yellow legs. Walk 0.5 m/s with the classic head-lock bob."""
    reset()
    body_m = mat('Hen chestnut', '#c2521f', rough=.6)
    gold = mat('Hen hackle', '#e89a3c', rough=.6)
    tailm = mat('Hen tail', '#35262a', rough=.35)
    comb = mat('Hen comb', '#e42a24', rough=.4)
    yellow = mat('Hen beak', '#f4b534', rough=.4)
    ew, dark, _ = eye_mats('Hen')
    parts = []

    bk = [(0, .13, .22, .06, .07), (0, .08, .215, .11, .115), (0, -.0, .215, .125, .125), (0, -.08, .235, .1, .1),
          (0, -.12, .28, .065, .065), (0, -.13, .33, .05, .05)]
    body = loft('Hen body', bk, [body_m, gold], n=10, sub=2, dome=(.8, 0),
                mat_fn=lambda u, a: 1 if u > 3.4 else 0)
    hk = [(0, -.1, .37, .045, .047), (0, -.135, .38, .058, .058), (0, -.17, .372, .045, .045), (0, -.185, .362, .03, .03)]
    head = loft('Hen head', hk, gold, n=8, sub=2, dome=(.8, .5))
    hs = Surface([head])
    eyeN, eyeR = V(.8, -.5, .25), .018
    eyeC = seat_eye(hs, V(.035, -.155, .385), eyeN, eyeR, .35)

    SHO = V(.1, -.04, .27)
    R = fold_frame(V(.2, 1, -.25), V(.2, 0, -1))
    bones = [('root', (0, 0, 0), (0, 0, .05), None),
             ('body', (0, .02, .2), (0, -.06, .22), 'root'),
             ('neck', (0, -.09, .26), (0, -.12, .33), 'body'),
             ('head', (0, -.12, .36), (0, -.2, .36), 'neck'),
             ('jaw', (0, -.18, .352), (0, -.22, .345), 'head')]
    tail = [V(0, .1, .25), V(0, .15, .32), V(0, .17, .4)]
    chain_bones(bones, 'tail', tail, 'body')
    wing_parts, wsegs, unfold = build_wing('Hen L', SHO, R, .13, .1, .02, [body_m, body_m], 2, .08, 2, .03, bones, 'body',
                                           feather_m=body_m)
    for b in [b for b in bones if b[0].startswith('wing')]:
        bones.append((b[0].replace('_L', '_R'), mirror_x(b[1]), mirror_x(b[2]),
                      b[3].replace('_L', '_R') if b[3].startswith('wing') else b[3]))
    hip, knee, ankle, toe = V(.05, .02, .15), V(.055, .0, .085), V(.055, .015, .025), V(.055, -.045, 0)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'thigh_{sd}', sym(hip, s), sym(knee, s), 'body'), (f'shin_{sd}', sym(knee, s), sym(ankle, s), f'thigh_{sd}'),
                  (f'foot_{sd}', sym(ankle, s), sym(toe, s), f'shin_{sd}')]
    arm = build_armature('Hen', bones)
    body_segs = [('tail_1', V(0, .2, .23), V(0, .1, .22)), ('body', V(0, .1, .22), V(0, -.09, .26)),
                 ('neck', V(0, -.09, .26), V(0, -.12, .36)), ('head', V(0, -.12, .36), V(0, -.16, .37))]
    parts.append(bind_chain(body, body_segs, .03))
    parts.append(bind(head, 'head'))
    for p_ in wing_parts:
        mp = mirror_copy(p_, p_.name.replace(' L ', ' R '))
        parts.append(bind_chain(p_, wsegs, .02))
        parts.append(bind_chain(mp, [(b.replace('_L', '_R'), mirror_x(a), mirror_x(c)) for b, a, c in wsegs], .02))
    # comb, wattles, beak
    for k, (y, z, r) in enumerate(((-.12, .43, .022), (-.145, .44, .026), (-.17, .425, .02))):
        parts.append(bind(sphere(f'Hen comb {k}', (.009, r * .9, r), V(0, y, z), comb, seg=6, rings=4), 'head'))
    for s in (1, -1):
        parts.append(bind(sphere(f'Hen wattle {s}', (.009, .012, .02), sym(V(.008, -.19, .32), s), comb, seg=6, rings=4), 'head'))
    parts.append(bind(loft('Hen beak top', [(0, -.18, .372, .016, .013), (0, -.205, .365, .011, .008), (0, -.222, .358, .003, .003)],
                           yellow, n=5, sub=1, dome=(0, .5)), 'head'))
    parts.append(bind(loft('Hen beak low', [(0, -.18, .356, .012, .006), (0, -.205, .354, .008, .005), (0, -.215, .352, .003, .003)],
                           yellow, n=6, sub=1, dome=(0, .5)), 'jaw'))
    for s, sd in ((1, 'L'), (-1, 'R')):
        e = Eye(f'Hen eye {sd}', sym(eyeC, s), sym(eyeN, s), eyeR, ew, dark, None, pupil=.6, tall=1.1,
                look=(-.1 * s, .03), seg=8, rings=5, low=True)
        for p_ in e.parts:
            parts.append(bind(p_, 'head'))
    # golden hackle feathers down the neck
    surf = Surface([body])
    for k in range(4):
        a = math.radians(-54 + 36 * k)
        p0 = V(.05 * math.sin(a), -.1 - .03 * math.cos(a), .31)
        parts.append(bind_chain(surf.tuft(f'Hen hackle {k}', p0, V(math.sin(a) * .5, .5, -1), .06, .026, gold, lift=.35, tip=.35),
                                body_segs, .03))
    # tail fan: dark sickle feathers sweeping up and back
    for k in range(4):
        f = (k - 1.5) / 1.5
        parts.append(bind_chain(slab_feather(f'Hen tail {k}', V(f * .02, .1, .25), V(f * .35, .55, 1), .13 - abs(f) * .02, .04,
                                             .007, tailm, up=Y, droop=-.25, segs=3, tip=.4),
                                chain_segs('tail', tail, ('body', V(0, .04, .22), tail[0])), .02))
    # legs
    for s, sd in ((1, 'L'), (-1, 'R')):
        parts.append(bind_chain(lobe(f'Hen thigh {s}', [sym(hip + V(0, 0, .03), s), sym(hip.lerp(knee, .6), s), sym(knee, s)], .03,
                                     body_m, side=X, n=6, flat=.9, tip=.6),
                                [('body', sym(hip + V(0, 0, .05), s), sym(hip, s)), (f'thigh_{sd}', sym(hip, s), sym(knee, s))], .02))
        for p_ in bird_leg('Hen', s, sym(hip, s), sym(knee, s), sym(ankle, s), None, yellow, r=.008, toe_len=.05):
            parts.append(bind_chain(p_, [(f'shin_{sd}', sym(knee, s), sym(ankle, s)), (f'foot_{sd}', sym(ankle, s), sym(toe, s))], .005))

    make_skin('chicken', arm, parts, dict(rays=32, distance=.1, strength=.55, ground=0.0))

    # ---------------------------------------------------------------- animation
    P = Player(arm)
    for sd in 'LR':
        P.leg(sd, f'thigh_{sd}', f'shin_{sd}', f'foot_{sd}')
    T = {k: v['T'].copy() for k, v in P.legs.items()}
    chord_axis = R @ Y

    def wings(pose, open_k, flap_deg, bend=0.0):
        qo = Quaternion().slerp(unfold, open_k)
        qf = Quaternion(Y, D(-flap_deg))
        pose['wing1_L'] = qf @ qo
        pose['wing1_R'] = mirror_q(qf) @ mirror_q(qo)
        qb = Quaternion(chord_axis, D(-bend))
        pose['wing2_L'] = qb
        pose['wing2_R'] = mirror_q(qb)
        return pose

    def stand():
        return {k: (T[k].copy(), 0.0) for k in T}

    # Idle: three quick pecks at the ground, then a head-cocked look around and a tail flick
    def idle(p):
        pose = {'ik': stand()}
        pk = sum(pulse(p, t, .035) for t in (.1, .2, .3))
        down = window(p, .04, .38, .15)
        add(pose, 'body', (18 * down, 0, 0))
        add(pose, 'neck', (40 * down + 18 * pk, 0, 0))
        add(pose, 'head', (20 * down + 12 * pk, 0, 0))
        add(pose, 'jaw', (14 * pk, 0, 0))
        look = keyed(p, [(0, {'h': (0, 0, 0)}), (.45, {'h': (0, 0, 0)}), (.52, {'h': (-6, 28, 30)}), (.68, {'h': (-6, 28, 30)}),
                         (.74, {'h': (4, -20, -35)}), (.88, {'h': (4, -20, -35)}), (.95, {'h': (0, 0, 0)}), (1, {'h': (0, 0, 0)})])['h']
        add(pose, 'head', look)
        add(pose, 'tail_1', (-10 * pulse(p, .9, .03), 0, 8 * pulse(p, .9, .03)))
        add(pose, 'body@loc', (0, 0, -.006 * down))
        wings(pose, .06 * pulse(p, .6, .05), 0)
        return pose
    P.clip('Idle', 96, idle)

    # Walk: bipedal, 0.5 m/s; the head locks in space then jerks forward twice per cycle
    WF, WD = 12, .6
    sweep = .5 * WF / FPS * WD

    def walk(p):
        ik = {}
        for leg, ph in (('L', 0), ('R', .5)):
            dy, dz, pit = foot_path(p, ph, WD, sweep, .05, curl=40, roll=10)
            ik[leg] = (T[leg] + V(0, dy, dz), pit)
        pose = {'ik': ik}
        add(pose, 'body@loc', (.01 * S(p, 1), 0, -.01 + .006 * C(p, 2)))
        add(pose, 'body', (4, 4 * S(p, 1), 5 * S(p, 1, .1)))
        q = (p * 2) % 1.0
        lock = (q / .75) if q < .75 else (1 - (q - .75) / .25)
        add(pose, 'neck@loc', (0, .04 * lock - .02, 0))
        add(pose, 'head', (-4 + 6 * pulse(q, .8, .12), 0, -3 * S(p, 1)))
        add(pose, 'tail_1', (0, 0, 6 * S(p, 1, .2)))
        wings(pose, .05, 4 * S(p, 2))
        return pose
    P.clip('Walk', WF, walk)

    # Flap (once): crouch, a flapping hop with wings spread, land and settle
    def flap(p):
        pose = {'ik': stand()}
        air = window(p, .2, .72, .3)
        z = .09 * math.sin(math.pi * max(0, min(1, (p - .25) / .45))) if .25 < p < .7 else 0.0
        crouch = window(p, .02, .28, .4) + .7 * window(p, .66, .9, .4)
        add(pose, 'body@loc', (0, 0, -.025 * crouch + z))
        for k in T:
            pose['ik'][k] = (T[k] + V(0, 0, z * .9), 30 * air)
        add(pose, 'body', (8 * crouch - 18 * air, 0, 0))
        add(pose, 'neck', (-12 * air, 0, 0))
        add(pose, 'head', (8 * air, 0, 0))
        add(pose, 'jaw', (20 * window(p, .3, .6, .3), 0, 0))
        add(pose, 'tail_1', (-15 * air, 0, 0))
        wings(pose, .95 * air, 45 * air * S(p, 5), bend=15 * air * C(p, 5))
        return pose
    P.clip('Flap', 40, flap, loop=False)

    export_animal('chicken', arm, P)


# ====================================================================== RABBIT


def build_rabbit():
    """Caramel bunny: round crouched body, cream chest/cheeks/cotton tail, long pink-lined ears on two
    bones each, big dark eyes, whiskers and long hind feet. Hop 1.6 m/s."""
    reset()
    fur = mat('Rabbit fur', '#c9773a', rough=.65)
    cream = mat('Rabbit cream', '#f6e7cf', rough=.68)
    pink = mat('Rabbit pink', '#ef8e9b', rough=.5)
    ew, dark, iris = eye_mats('Rabbit', '#5a3322')
    parts = []

    hk = [(0, -.075, .225, .05, .05), (0, -.115, .235, .066, .06), (0, -.158, .222, .054, .05), (0, -.19, .205, .032, .032)]
    head = loft('Rabbit head', hk, [fur, cream], n=10, sub=2, dome=(.8, .6),
                mat_fn=lambda u, a: 1 if (u > 1.4 and math.sin(a) < -.2) else 0)
    hs = Surface([head])
    eyeN, eyeR = V(.78, -.55, .22), .026
    eyeC = seat_eye(hs, V(.045, -.14, .245), eyeN, eyeR, .4)

    SH, EL, WR, FT = V(.034, -.055, .1), V(.038, -.045, .052), V(.038, -.062, .013), V(.038, -.09, 0)
    HP, KN, HK, HT = V(.056, .085, .115), V(.062, .015, .07), V(.062, .1, .018), V(.062, -.03, 0)
    bones = [('root', (0, 0, 0), (0, 0, .05), None),
             ('hips', (0, .09, .14), (0, .0, .145), 'root'),
             ('spine', (0, .0, .145), (0, -.06, .155), 'hips'),
             ('neck', (0, -.065, .17), (0, -.085, .205), 'spine'),
             ('head', (0, -.085, .225), (0, -.2, .225), 'neck'),
             ('tail_1', (0, .15, .14), (0, .19, .15), 'hips')]
    lid_bones(bones, eyeC, eyeN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        e0, e1, e2 = sym(V(.026, -.1, .27), s), sym(V(.036, -.09, .35), s), sym(V(.046, -.078, .445), s)
        bones += [(f'ear_{sd}_1', e0, e1, 'head'), (f'ear_{sd}_2', e1, e2, f'ear_{sd}_1'),
                  (f'upperarm_{sd}', sym(SH, s), sym(EL, s), 'spine'),
                  (f'forearm_{sd}', sym(EL, s), sym(WR, s), f'upperarm_{sd}'),
                  (f'paw_{sd}', sym(WR, s), sym(FT, s), f'forearm_{sd}'),
                  (f'thigh_{sd}', sym(HP, s), sym(KN, s), 'hips'),
                  (f'shin_{sd}', sym(KN, s), sym(HK, s), f'thigh_{sd}'),
                  (f'foot_{sd}', sym(HK, s), sym(HT, s), f'shin_{sd}')]
    arm = build_armature('Rabbit', bones)
    segs = [('hips', V(0, .2, .14), V(0, .0, .145)), ('spine', V(0, .0, .145), V(0, -.065, .17)),
            ('neck', V(0, -.065, .17), V(0, -.085, .225)), ('head', V(0, -.085, .225), V(0, -.12, .235))]
    parts.append(bind(head, 'head'))

    bk = [(0, .16, .13, .065, .07), (0, .11, .14, .1, .105), (0, .03, .14, .096, .1), (0, -.04, .15, .075, .085),
          (0, -.075, .185, .055, .06), (0, -.085, .22, .045, .045)]
    body = loft('Rabbit body', bk, [fur, cream], n=10, sub=2, dome=(.9, 0),
                mat_fn=lambda u, a: 1 if (u > 2.4 and math.sin(a) < -.1) else 0)
    parts.append(bind_chain(body, segs, .03))
    surf = Surface([body])
    # haunches: round thigh bulges that hug the body
    for s, sd in ((1, 'L'), (-1, 'R')):
        hau = sphere(f'Rabbit haunch {s}', (.05, .075, .06), sym(V(.055, .07, .105), s), fur, seg=8, rings=6)
        parts.append(bind_chain(hau, [('hips', sym(V(.03, .1, .16), s), sym(HP, s)), (f'thigh_{sd}', sym(HP, s), sym(KN, s))], .04))
    parts.append(bind(puff('Rabbit tail', V(0, .185, .15), .035, cream, seg=8, rings=6, lump=.18, seed=3), 'tail_1'))
    # face
    parts.append(bind(sphere('Rabbit nose', (.012, .008, .008), (0, -.2, .215), pink, seg=8, rings=4), 'head'))
    parts.append(bind(tube('Rabbit mouth', [V(-.012, -.193, .187), V(0, -.2, .195), V(.012, -.193, .187)], .0025, dark, verts=4),
                      'head'))
    parts.append(bind(rod('Rabbit philtrum', V(0, -.201, .207), V(0, -.2, .195), .0022, dark, verts=4), 'head'))
    for s in (1, -1):
        parts.append(bind(sphere(f'Rabbit cheek {s}', (.03, .03, .025), sym(V(.03, -.175, .2), s), cream, seg=8, rings=5), 'head'))
        for k, (dz, dy) in enumerate(((.006, .0), (-.004, .01))):
            parts.append(bind(tube(f'Rabbit whisker {s}{k}', [sym(V(.035, -.19, .2 + dz), s), sym(V(.075, -.185 + dy, .203 + dz * 2), s),
                                                             sym(V(.11, -.17 + dy, .2 + dz * 3), s)], .0012, cream, verts=3),
                              'head'))
    eyes = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        e = Eye(f'Rabbit eye {sd}', sym(eyeC, s), sym(eyeN, s), eyeR, ew, dark, iris, iris=.82, pupil=.46, tall=1.08,
                look=(-.1 * s, .03), lid_m=fur, lash_m=dark, lid_open=14, seg=10, rings=6, lid_res=(5, 7))
        for p_ in e.parts:
            parts.append(bind(p_, 'head'))
        for p_ in e.lid_parts:
            parts.append(bind(p_, f'lid_{sd}'))
        eyes[sd] = e
    # ears
    for s, sd in ((1, 'L'), (-1, 'R')):
        e0, e1, e2 = sym(V(.026, -.1, .27), s), sym(V(.036, -.09, .35), s), sym(V(.046, -.078, .445), s)
        ek = []
        for t, w, h in ((0, .02, .012), (.25, .03, .012), (.6, .033, .011), (.88, .022, .009), (1.0, .006, .005)):
            c = e0.lerp(e2, t) if t < 1 else e2
            ek.append((c.x, c.y, c.z, w, h))
        ear = loft(f'Rabbit ear {s}', ek, [fur, pink], n=6, sub=2, side=X, dome=(0, .6),
                   mat_fn=lambda u, a: 1 if (math.sin(a) > .35 and .4 < u < 3.5) else 0)
        parts.append(bind_chain(ear, [('head', e0 - V(0, 0, .03), e0), (f'ear_{sd}_1', e0, e1), (f'ear_{sd}_2', e1, e2)], .02))
    # legs
    for s, sd in ((1, 'L'), (-1, 'R')):
        fl = limb(f'Rabbit foreleg {s}', [sym(p, s) for p in (SH + V(0, 0, .03), SH, EL, WR)],
                  [(.02, .024), (.019, .022), (.016, .017), (.015, .015)], [fur, cream], n=5,
                  mat_fn=lambda u, a: 1 if u > 1.6 else 0)
        fsegs = [('spine', sym(SH + V(0, 0, .05), s), sym(SH, s)), (f'upperarm_{sd}', sym(SH, s), sym(EL, s)),
                 (f'forearm_{sd}', sym(EL, s), sym(WR, s)), (f'paw_{sd}', sym(WR, s), sym(FT, s))]
        parts.append(bind_chain(fl, fsegs, .015))
        parts.append(bind(sphere(f'Rabbit fpaw {s}', (.017, .026, .013), sym(V(.038, -.073, .012), s), cream, seg=8, rings=5),
                          f'paw_{sd}'))
        hl = limb(f'Rabbit hindleg {s}', [sym(p, s) for p in (KN, KN.lerp(HK, .5), HK)], [(.022, .024), (.018, .02), (.016, .016)],
                  fur, n=6)
        hsegs = [(f'thigh_{sd}', sym(HP, s), sym(KN, s)), (f'shin_{sd}', sym(KN, s), sym(HK, s)),
                 (f'foot_{sd}', sym(HK, s), sym(HT, s))]
        parts.append(bind_chain(hl, hsegs, .015))
        foot = loft(f'Rabbit hfoot {s}', keys_sym([(.062, .105, .016, .02, .016), (.062, .05, .014, .024, .014),
                                                   (.062, -.01, .012, .022, .012), (.062, -.035, .012, .014, .01)], s),
                    [fur, cream], n=6, sub=2, dome=(.6, .8), mat_fn=lambda u, a: 1 if (u > 1.8 or math.sin(a) < -.3) else 0)
        parts.append(bind(foot, f'foot_{sd}'))

    make_skin('rabbit', arm, parts, dict(rays=32, distance=.08, strength=.55, ground=0.0))

    # ---------------------------------------------------------------- animation
    P = Player(arm)
    for sd in 'LR':
        P.leg(f'F{sd}', f'upperarm_{sd}', f'forearm_{sd}', f'paw_{sd}')
        P.leg(f'H{sd}', f'thigh_{sd}', f'shin_{sd}', f'foot_{sd}')
    T = {k: v['T'].copy() for k, v in P.legs.items()}

    def stand():
        return {k: (T[k].copy(), 0.0) for k in T}

    def ears(pose, l, r, back=0.0):
        add(pose, 'ear_L_1', (back + l[0], 0, l[1]))
        add(pose, 'ear_R_1', (back + r[0], 0, r[1]))
        add(pose, 'ear_L_2', (back * .6 + l[0] * .5, 0, 0))
        add(pose, 'ear_R_2', (back * .6 + r[0] * .5, 0, 0))

    # Idle: nose twitches, ear swivels, blinks, and a "periscope" sit-up to look around
    def idle(p):
        pose = {'ik': stand()}
        tw = max(window(p, .05, .22, .1), window(p, .72, .86, .1))
        add(pose, 'head', (2.5 * tw * S(p, 30), 0, 0))
        up = window(p, .34, .64, .3)
        add(pose, 'hips', (-34 * up, 0, 0))
        add(pose, 'hips@loc', (0, .01 * up, .012 * up))
        add(pose, 'spine', (-10 * up, 0, 0))
        add(pose, 'neck', (30 * up, 0, 0))
        add(pose, 'head', (14 * up, 0, 22 * up * S(p, 1.5, .1)))
        for leg in ('FL', 'FR'):
            pose['ik'][leg] = (T[leg] + V(0, .03 * up, .11 * up), -60 * up)
        ears(pose, (-14 * pulse(p, .28, .03), 30 * pulse(p, .28, .04)), (0, -30 * pulse(p, .8, .04)), back=-8 * up)
        set_lids(pose, eyes, blink(p, (.25, .9), .02), deg=110)
        add(pose, 'spine', (1.2 * S(p, 4), 0, 0))
        return pose
    P.clip('Idle', 150, idle)

    # Hop: hind legs push together, airborne arc, forepaws land, hind feet land ahead of them; 1.6 m/s
    HF = 12
    pace = 1.6 * HF / FPS          # body travel per cycle

    def hop(p):
        ik = {}
        for leg, td, duty, lift in (('FL', .5, .2, .05), ('FR', .54, .2, .05), ('HL', .74, .22, .06), ('HR', .74, .22, .06)):
            sweep = pace * duty
            dy, dz, pit = foot_path(p, td, duty, sweep, lift, curl=40 if leg[0] == 'F' else 25, roll=18, tangent=.45)
            off = V(0, -.01, 0) if leg[0] == 'H' else V(0, .01, 0)
            ik[leg] = (T[leg] + V(0, dy, dz) + off, pit)
        pose = {'ik': ik}
        z = .06 * max(0, math.sin(math.pi * ((p - .12) / .38))) if .12 < p < .5 else 0.0
        add(pose, 'hips@loc', (0, 0, z + .01 * C(p, 1, .2)))
        add(pose, 'hips', (-10 * S(p, 1, -.05), 0, 0))
        add(pose, 'spine', (8 * S(p, 1, -.02), 0, 0))
        add(pose, 'neck', (-6 * S(p, 1, .1), 0, 0))
        ears(pose, (0, 0), (0, 0), back=18 * max(0, S(p, 1, -.05)) + 4)
        add(pose, 'tail_1', (-15 * max(0, S(p, 1)), 0, 0))
        return pose
    P.clip('Hop', HF, hop)

    export_animal('rabbit', arm, P)


# ====================================================================== CAT


def build_cat():
    """Calico cat: white with orange and black patches (smooth conformed shapes), one orange and one
    black ear, green eyes with slow-blink lids, pink nose and whiskers, a tall hooked tail. Walk 0.6 m/s."""
    reset()
    white = mat('Cat white', '#f6f0e5', rough=.62)
    orange = mat('Cat orange', '#ec8a2c', rough=.6)
    black = mat('Cat black', '#2d2629', rough=.6)
    pink = mat('Cat pink', '#f0939f', rough=.5)
    ew, dark, iris = eye_mats('Cat', '#86c43a')
    parts = []

    hk = [(0, -.15, .31, .055, .055), (0, -.18, .318, .078, .068), (0, -.222, .31, .072, .062), (0, -.255, .29, .042, .04),
          (0, -.27, .282, .022, .022)]
    head = loft('Cat head', hk, white, n=14, sub=2, dome=(.8, .6))
    hs = Surface([head])
    eyeN, eyeR = V(.5, -.82, .2), .025
    eyeC = seat_eye(hs, V(.04, -.24, .33), eyeN, eyeR, .42)

    SH, EL, WR, FT = V(.048, -.1, .18), V(.052, -.078, .1), V(.052, -.095, .028), V(.052, -.122, 0)
    HP, KN, HK, HT = V(.05, .12, .19), V(.056, .075, .11), V(.056, .14, .042), V(.056, .108, 0)
    tail = [V(0, .17, .215), V(0, .225, .27), V(0, .245, .35), V(0, .235, .42), V(0, .2, .465)]
    bones = [('root', (0, 0, 0), (0, 0, .05), None),
             ('hips', (0, .12, .2), (0, .03, .2), 'root'),
             ('spine', (0, .03, .2), (0, -.05, .202), 'hips'),
             ('chest', (0, -.05, .202), (0, -.12, .215), 'spine'),
             ('neck', (0, -.13, .235), (0, -.155, .29), 'chest'),
             ('head', (0, -.158, .31), (0, -.27, .31), 'neck')]
    chain_bones(bones, 'tail', tail, 'hips')
    lid_bones(bones, eyeC, eyeN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'ear_{sd}', sym(V(.045, -.18, .36), s), sym(V(.07, -.176, .435), s), 'head'),
                  (f'upperarm_{sd}', sym(SH, s), sym(EL, s), 'chest'),
                  (f'forearm_{sd}', sym(EL, s), sym(WR, s), f'upperarm_{sd}'),
                  (f'paw_{sd}', sym(WR, s), sym(FT, s), f'forearm_{sd}'),
                  (f'thigh_{sd}', sym(HP, s), sym(KN, s), 'hips'),
                  (f'shin_{sd}', sym(KN, s), sym(HK, s), f'thigh_{sd}'),
                  (f'foot_{sd}', sym(HK, s), sym(HT, s), f'shin_{sd}')]
    arm = build_armature('Cat', bones)
    segs = [('hips', V(0, .22, .2), V(0, .03, .2)), ('spine', V(0, .03, .2), V(0, -.05, .202)),
            ('chest', V(0, -.05, .202), V(0, -.13, .235)), ('neck', V(0, -.13, .235), V(0, -.158, .31)),
            ('head', V(0, -.158, .31), V(0, -.2, .32))]
    parts.append(bind(head, 'head'))

    bk = [(0, .175, .2, .052, .055), (0, .13, .2, .074, .078), (0, .04, .196, .066, .07), (0, -.05, .2, .07, .076),
          (0, -.11, .21, .064, .07), (0, -.145, .245, .05, .052), (0, -.16, .29, .044, .044)]
    body = loft('Cat body', bk, white, n=12, sub=2, dome=(.9, 0))
    parts.append(bind_chain(body, segs, .03))
    surf = Surface([body])
    # calico patches (orange saddle, black patches), conformed with smooth outlines
    axis = lambda q: V(0, q.y, .2)
    for nm, m, o, px, v0, v1, w, cf in (('saddle', orange, V(0, 0, .26), X, -.06, .12, .075, lambda t: .015 * math.sin(t * 5)),
                                        ('black back', black, V(.02, 0, .26), X, .06, .15, .045, lambda t: .03),
                                        ('black shoulder', black, V(-.03, 0, .26), X, -.12, -.04, .04, lambda t: -.04)):
        for p_ in conform_patch(f'Cat {nm}', surf, o, px, Y, v0, v1,
                                lambda t, w=w: w * math.sin(math.pi * min(1, .1 + .9 * t)) ** .5 + .004, 5, 5, .0015, .003, m,
                                center_fn=cf, ray_axis=axis):
            parts.append(bind_chain(p_, segs, .03))
    hc = lambda q: V(0, -.215, .31)
    for p_ in conform_patch('Cat eye patch', hs, V(.045, -.25, .345), V(1, 0, .2), V(0, .3, 1), -.035, .045,
                            lambda t: .032 * math.sin(math.pi * min(1, .15 + .85 * t)) ** .5 + .003, 4, 4, .0012, .0025, orange,
                            ray_axis=hc):
        parts.append(bind(p_, 'head'))
    for p_ in conform_patch('Cat crown patch', hs, V(-.035, -.2, .37), V(1, 0, 0), V(0, 1, .3), -.035, .03,
                            lambda t: .03 * math.sin(math.pi * min(1, .15 + .85 * t)) ** .5 + .003, 4, 4, .0012, .0025, black,
                            ray_axis=hc):
        parts.append(bind(p_, 'head'))
    # face
    parts.append(bind(sphere('Cat nose', (.011, .007, .007), (0, -.272, .292), pink, seg=8, rings=4), 'head'))
    parts.append(bind(tube('Cat mouth', [V(-.016, -.262, .268), V(-.007, -.272, .266), V(0, -.27, .274), V(.007, -.272, .266),
                                         V(.016, -.262, .268)], .0022, dark, verts=4), 'head'))
    for s in (1, -1):
        parts.append(bind(sphere(f'Cat muzzle {s}', (.022, .02, .017), sym(V(.016, -.262, .276), s), white, seg=8, rings=5),
                          'head'))
        for k, dz in enumerate((.005, -.004)):
            parts.append(bind(tube(f'Cat whisker {s}{k}', [sym(V(.03, -.262, .277 + dz), s), sym(V(.07, -.255, .28 + dz * 2), s),
                                                          sym(V(.105, -.24, .276 + dz * 3), s)], .001, white, verts=3), 'head'))
    eyes = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        e = Eye(f'Cat eye {sd}', sym(eyeC, s), sym(eyeN, s), eyeR, ew, dark, iris, iris=.8, pupil=.52, tall=1.15,
                look=(-.05 * s, .02), lid_m=orange if s > 0 else white, lash_m=dark, lid_open=22, seg=10, rings=6,
                lid_res=(5, 7))
        for p_ in e.parts:
            parts.append(bind(p_, 'head'))
        for p_ in e.lid_parts:
            parts.append(bind(p_, f'lid_{sd}'))
        eyes[sd] = e
    for s, sd, m in ((1, 'L', orange), (-1, 'R', black)):
        base, tip = sym(V(.045, -.18, .36), s), sym(V(.07, -.176, .44), s)
        ax = (tip - base).normalized()
        side = ax.cross(Y).normalized() * -1
        ek = []
        for t, w, h in ((0, .034, .014), (.4, .028, .012), (.8, .012, .007), (1.0, .003, .003)):
            c = base.lerp(tip, t)
            ek.append((c.x, c.y, c.z, w, h))
        ear = loft(f'Cat ear {s}', ek, m, n=8, sub=2, side=side, dome=(0, .6))
        inner = lobe(f'Cat ear inner {s}', [base + V(0, -.012, .008), base.lerp(tip, .5) + V(0, -.009, 0)], .022, pink,
                     side=side, n=5, flat=.3, tip=.3)
        for p_ in (ear, inner):
            parts.append(bind_chain(p_, [('head', base - ax * .02, base), (f'ear_{sd}', base, tip)], .012))
    # tail: orange with a black tip
    tk = [(t.x, t.y, t.z, .022 - .004 * i / 4, .022 - .004 * i / 4) for i, t in enumerate(tail)]
    tl = loft('Cat tail', tk, [orange, black], n=8, sub=2, dome=(0, 1.0), mat_fn=lambda u, a: 1 if u > 3.1 else 0)
    parts.append(bind_chain(tl, chain_segs('tail', tail, ('hips', V(0, .12, .205), tail[0])), .025))
    # legs (white socks everywhere)
    for s, sd in ((1, 'L'), (-1, 'R')):
        fl = limb(f'Cat foreleg {s}', [sym(p, s) for p in (SH + V(0, 0, .03), SH, EL, WR)], [(.026, .03), (.025, .028), (.019, .02),
                                                                                              (.019, .02)], white, n=6)
        fsegs = [('chest', sym(SH + V(0, 0, .05), s), sym(SH, s)), (f'upperarm_{sd}', sym(SH, s), sym(EL, s)),
                 (f'forearm_{sd}', sym(EL, s), sym(WR, s)), (f'paw_{sd}', sym(WR, s), sym(FT, s))]
        parts.append(bind_chain(fl, fsegs, .015))
        parts.append(bind(sphere(f'Cat fpaw {s}', (.022, .03, .016), sym(V(.052, -.108, .016), s), white, seg=8, rings=5),
                          f'paw_{sd}'))
        hl = limb(f'Cat hindleg {s}', [sym(p, s) for p in (HP + V(0, 0, .03), HP, KN, HK)], [(.03, .04), (.034, .042), (.02, .022),
                                                                                             (.016, .017)], white, n=6)
        hsegs = [('hips', sym(HP + V(0, 0, .05), s), sym(HP, s)), (f'thigh_{sd}', sym(HP, s), sym(KN, s)),
                 (f'shin_{sd}', sym(KN, s), sym(HK, s)), (f'foot_{sd}', sym(HK, s), sym(HT, s))]
        parts.append(bind_chain(hl, hsegs, .015))
        parts.append(bind(limb(f'Cat hfoot {s}', [sym(HK, s), sym(V(.056, .115, .014), s)], [(.016, .017), (.02, .014)], white,
                               n=6, sub=1, dome=(.4, .8)), f'foot_{sd}'))

    mesh = make_skin('cat', arm, parts, dict(rays=32, distance=.08, strength=.55, ground=0.0))

    # ---------------------------------------------------------------- animation
    P = Player(arm)
    for sd in 'LR':
        P.leg(f'F{sd}', f'upperarm_{sd}', f'forearm_{sd}', f'paw_{sd}')
        P.leg(f'H{sd}', f'thigh_{sd}', f'shin_{sd}', f'foot_{sd}')
    T = {k: v['T'].copy() for k, v in P.legs.items()}

    def stand():
        return {k: (T[k].copy(), 0.0) for k in T}

    # Idle: breathing, a slow affectionate blink, ear swivels, a head tilt and a lazy S-curve tail
    def idle(p):
        pose = {'ik': stand()}
        add(pose, 'spine', (.8 * S(p, 3), 0, 0))
        add(pose, 'head', (0, 12 * window(p, .3, .6, .3), 8 * window(p, .3, .6, .3)))
        add(pose, 'ear_L', (-18 * pulse(p, .7, .03), 0, 16 * pulse(p, .7, .03)))
        add(pose, 'ear_R', (-10 * pulse(p, .15, .03), 0, -20 * pulse(p, .15, .03)))
        for i in range(4):
            add(pose, f'tail_{i + 1}', (4 * S(p, 1, -.1 * i), 0, (6 + 5 * i) * S(p, 1, -.12 * i)))
        set_lids(pose, eyes, max(window(p, .42, .54, .4) * .92, blink(p, (.85,), .02)), deg=110)
        return pose
    P.clip('Idle', 150, idle)

    # Walk: four-beat, tail up; 0.6 m/s
    WF, WD = 14, .62
    sweep = .6 * WF / FPS * WD

    def walk(p):
        pose = {'ik': gait(P, T, p, {'HL': 0, 'FL': .25, 'HR': .5, 'FR': .75}, WD, sweep, (.04, .035), curl=(50, 30), roll=12)}
        add(pose, 'hips@loc', (0, 0, -.008 + .004 * C(p, 2)))
        add(pose, 'hips', (0, 3 * S(p, 1, .1), 3 * S(p, 1)))
        add(pose, 'chest', (0, -3 * S(p, 1), -3 * S(p, 1, .15)))
        add(pose, 'neck', (2 * S(p, 2, .1), 0, 2 * S(p, 1, .3)))
        add(pose, 'head', (-2 * S(p, 2, .2), 0, 2 * S(p, 1, .4)))
        for i in range(4):
            add(pose, f'tail_{i + 1}', (3 * S(p, 2, -.1 * i), 0, (4 + 3 * i) * S(p, 1, -.1 * i)))
        return pose
    P.clip('Walk', WF, walk)

    # Sit: upright, forelegs straight, tail wrapped round the front paws
    SIT_TAIL = [V(.035 * math.sin(D(a)) + .0, .03 + .085 * math.cos(D(a)), .022) for a in (25, 75, 125, 165)]

    def sit(p):
        pose = {'ik': {'FL': (T['FL'] + V(0, .06, 0), 0), 'FR': (T['FR'] + V(0, .06, 0), 0),
                       'HL': (T['HL'] + V(.008, -.035, 0), -62), 'HR': (T['HR'] + V(-.008, -.035, 0), -62)}}
        add(pose, 'hips@loc', (0, .015, -.125))
        add(pose, 'hips', (-36, 0, 0))
        add(pose, 'spine', (-6, 0, 0))
        add(pose, 'neck', (20, 0, 0))
        add(pose, 'head', (22, 0, 0))
        pose = P.aim_chain(pose, ['tail_1', 'tail_2', 'tail_3', 'tail_4'], SIT_TAIL)
        add(pose, 'chest', (-.8 * S(p, 2), 0, 0))
        pose['tail_4'] = Quaternion(Z, D(20 * pulse(p, .6, .06))) @ pose['tail_4']
        add(pose, 'ear_L', (-16 * pulse(p, .3, .03), 0, 10 * pulse(p, .3, .03)))
        set_lids(pose, eyes, max(window(p, .75, .88, .4) * .9, blink(p, (.2,), .025)), deg=110)
        return pose
    P.clip('Sit', 120, sit)

    # Sleep: a curled loaf - legs tucked, chin down on the paws, tail wrapped round, slow breathing
    def loaf(dz):
        return {'ik': {'FL': (T['FL'] + V(.0, .06, .0), -80), 'FR': (T['FR'] + V(.0, .06, .0), -80),
                       'HL': (T['HL'] + V(.01, -.03, 0), -62), 'HR': (T['HR'] + V(-.01, -.03, 0), -62)},
                'hips@loc': (0, 0, dz), 'neck': (26, 0, 0), 'head': (-4, 10, 22), 'ear_L': (20, 0, -12), 'ear_R': (20, 0, 12),
                }
    dz = -.1
    for _ in range(2):
        dz -= P.low_point(mesh, loaf(dz), {'spine', 'chest'}) - .006

    SLEEP_TAIL = [V(.1 * math.sin(D(a)), .03 + .13 * math.cos(D(a)), .03) for a in (30, 80, 125, 160)]

    def sleep(p):
        pose = P.aim_chain(loaf(dz), ['tail_1', 'tail_2', 'tail_3', 'tail_4'], SLEEP_TAIL)
        br = (S(p, 2, -.25) + 1) / 2
        pose['chest@scale'] = (1 + .04 * br, 1, 1 + .05 * br)
        pose['spine@scale'] = (1 + .05 * br, 1, 1 + .04 * br)
        pose['hips@loc'] = (0, 0, dz + .004 * br)
        add(pose, 'ear_R', (-14 * pulse(p, .7, .02), 0, 0))
        pose['tail_4'] = Quaternion(Z, D(14 * pulse(p, .3, .05))) @ pose['tail_4']
        set_lids(pose, eyes, 1.0, deg=110)
        return pose
    P.clip('Sleep', 150, sleep)

    export_animal('cat', arm, P)


# ====================================================================== DUCK


def build_duck():
    """Mallard drake: glossy emerald head, white neck ring, chestnut breast, pearl flanks, brown back,
    sunny yellow bill, orange webbed feet and the drake's curled tail feather.
    Idle stands on z=0. Swim lowers the body so z=0 is the waterline (feet paddle below it)."""
    reset()
    green = mat('Duck green', '#1d7d4c', rough=.25)
    ring = mat('Duck eye', '#f5f2ea', rough=.3, emit=.05)
    chest = mat('Duck chestnut', '#8e3a20', rough=.5)
    pearl = mat('Duck pearl', '#dcdad6', rough=.55)
    brown = mat('Duck back', '#7c5a3e', rough=.55)
    bill = mat('Duck bill', '#f3c12b', rough=.35)
    feet = mat('Duck feet', '#f1862a', rough=.45)
    dark = mat('Duck pupil', '#1c1e26', rough=.1)
    parts = []

    hk = [(0, -.115, .27, .036, .038), (0, -.145, .282, .046, .044), (0, -.175, .272, .034, .032), (0, -.19, .262, .02, .02)]
    head = loft('Duck head', hk, green, n=8, sub=2, dome=(.8, .4))
    hs = Surface([head])
    eyeN, eyeR = V(.85, -.4, .25), .014
    eyeC = seat_eye(hs, V(.03, -.155, .292), eyeN, eyeR, .35)
    SHO = V(.075, -.03, .15)
    R = fold_frame(V(.08, 1, .1), V(.3, 0, -1))
    hip, knee, ankle, toe = V(.04, .03, .08), V(.045, .015, .05), V(.045, .025, .018), V(.045, -.03, 0)
    bones = [('root', (0, 0, 0), (0, 0, .04), None),
             ('body', (0, .03, .1), (0, -.06, .11), 'root'),
             ('neck', (0, -.1, .15), (0, -.12, .21), 'body'),
             ('head', (0, -.12, .25), (0, -.2, .26), 'neck'),
             ('jaw', (0, -.18, .252), (0, -.235, .244), 'head'),
             ('tail_1', (0, .13, .12), (0, .18, .135), 'body')]
    wing_parts, wsegs, unfold = build_wing('Duck L', SHO, R, .11, .075, .016, brown, 2, .07, 0, .035, bones, 'body',
                                           feather_m=brown)
    for b in [b for b in bones if b[0].startswith('wing')]:
        bones.append((b[0].replace('_L', '_R'), mirror_x(b[1]), mirror_x(b[2]),
                      b[3].replace('_L', '_R') if b[3].startswith('wing') else b[3]))
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'thigh_{sd}', sym(hip, s), sym(knee, s), 'body'), (f'shin_{sd}', sym(knee, s), sym(ankle, s), f'thigh_{sd}'),
                  (f'foot_{sd}', sym(ankle, s), sym(toe, s), f'shin_{sd}')]
    arm = build_armature('Duck', bones)
    segs = [('tail_1', V(0, .2, .12), V(0, .13, .12)), ('body', V(0, .13, .12), V(0, -.1, .15)),
            ('neck', V(0, -.1, .15), V(0, -.12, .25)), ('head', V(0, -.12, .25), V(0, -.15, .27))]
    parts.append(bind(head, 'head'))

    bk = [(0, .16, .115, .03, .025), (0, .12, .11, .075, .06), (0, .03, .105, .095, .075), (0, -.05, .11, .09, .078),
          (0, -.1, .135, .06, .065)]
    body = loft('Duck body', bk, [pearl, chest, brown], n=10, sub=2, dome=(.6, .8),
                mat_fn=lambda u, a: 1 if (u > 2.9 and math.sin(a) > -.8) else (2 if (math.sin(a) > .55 and u < 3.2) else 0))
    parts.append(bind_chain(body, segs, .03))
    neck = loft('Duck neck', [(0, -.1, .15, .042, .045), (0, -.115, .2, .033, .034), (0, -.12, .245, .032, .032)], [chest, green],
                n=8, sub=2, mat_fn=lambda u, a: 1 if u > 1.1 else 0)
    parts.append(bind_chain(neck, segs, .03))
    parts.append(bind_chain(torus('Duck ring', .035, .006, V(0, -.113, .2), ring, maj=10, mn=3,
                                  rot=(math.radians(-15), 0, 0)), segs, .03))
    # bill: wide and flat, lower mandible on the jaw
    parts.append(bind(loft('Duck bill top', [(0, -.18, .262, .02, .011), (0, -.215, .254, .02, .008), (0, -.243, .249, .015, .006)],
                           bill, n=8, sub=1, dome=(0, .8)), 'head'))
    parts.append(bind(sphere('Duck nail', (.006, .005, .003), (0, -.25, .252), brown, seg=6, rings=3), 'head'))
    parts.append(bind(loft('Duck bill low', [(0, -.182, .25, .016, .005), (0, -.22, .246, .016, .004), (0, -.24, .244, .012, .004)],
                           bill, n=6, sub=1, dome=(0, .8)), 'jaw'))
    for s in (1, -1):
        e = Eye(f'Duck eye {s}', sym(eyeC, s), sym(eyeN, s), eyeR, ring, dark, None, pupil=.7, tall=1.0, look=(-.1 * s, 0),
                seg=8, rings=5, low=True)
        for p_ in e.parts:
            parts.append(bind(p_, 'head'))
    for p_ in wing_parts:
        mp = mirror_copy(p_, p_.name.replace(' L ', ' R '))
        parts.append(bind_chain(p_, wsegs, .02))
        parts.append(bind_chain(mp, [(b.replace('_L', '_R'), mirror_x(a), mirror_x(c)) for b, a, c in wsegs], .02))
    # tail: short dark fan and the drake's curl
    parts.append(bind(lobe('Duck tail', [V(0, .13, .12), V(0, .17, .125), V(0, .2, .13)], .035, dark, side=X, n=6, flat=.35,
                           tip=.3), 'tail_1'))
    parts.append(bind(tube('Duck curl', [V(0, .15, .135), V(0, .165, .16), V(0, .155, .178), V(0, .14, .172)], .006, dark, verts=5),
                      'tail_1'))
    # legs with webbed feet
    for s, sd in ((1, 'L'), (-1, 'R')):
        parts.append(bind_chain(limb(f'Duck leg {s}', [sym(knee, s), sym(ankle, s)], [(.009, .009), (.007, .007)], feet, n=6, sub=1),
                                [(f'shin_{sd}', sym(knee, s), sym(ankle, s))], .01))
        web = plate(f'Duck web {s}', [(-.022, -.05), (-.008, -.042), (0, -.056), (.008, -.042), (.022, -.05), (.006, 0), (-.006, 0)],
                    .005, feet, X, Y, sym(ankle, s) + V(0, .01, -.016), bevel=0)
        parts.append(bind(web, f'foot_{sd}'))

    make_skin('duck', arm, parts, dict(rays=28, distance=.07, strength=.55, ground=0.0))

    # ---------------------------------------------------------------- animation
    P = Player(arm)
    for sd in 'LR':
        P.leg(sd, f'thigh_{sd}', f'shin_{sd}', f'foot_{sd}')
    T = {k: v['T'].copy() for k, v in P.legs.items()}

    def wings(pose, open_k, flap_deg):
        qo = Quaternion().slerp(unfold, open_k)
        qf = Quaternion(Y, D(-flap_deg))
        pose['wing1_L'] = qf @ qo
        pose['wing1_R'] = mirror_q(qf) @ mirror_q(qo)
        return pose

    # Idle (standing): looks about, a tail waggle, a quack and a little wing shuffle
    def idle(p):
        pose = {'ik': {k: (T[k].copy(), 0.0) for k in T}}
        look = keyed(p, [(0, {'h': (0, 0, 0)}), (.15, {'h': (0, 0, 0)}), (.22, {'h': (-4, 14, 32)}), (.4, {'h': (-4, 14, 32)}),
                         (.48, {'h': (2, -10, -28)}), (.62, {'h': (2, -10, -28)}), (.7, {'h': (0, 0, 0)}), (1, {'h': (0, 0, 0)})])['h']
        add(pose, 'head', look)
        q = pulse(p, .82, .04)
        add(pose, 'jaw', (24 * q, 0, 0))
        add(pose, 'neck', (-8 * q, 0, 0))
        add(pose, 'body', (-3 * q, 0, 0))
        wg = window(p, .72, .78, .5)
        add(pose, 'tail_1', (0, 0, 22 * wg * S(p, 30)))
        wings(pose, .08 * pulse(p, .5, .03), 6 * pulse(p, .5, .03))
        add(pose, 'body@loc', (0, 0, .002 * S(p, 3)))
        return pose
    P.clip('Idle', 120, idle)

    # Swim: floating (waterline at z=0), gentle bob and head-bob, feet paddling under the water
    def swim(p):
        pose = {}
        add(pose, 'body@loc', (0, 0, -.075 + .004 * S(p, 2)))
        add(pose, 'body', (1.5 * S(p, 2, .2), 1.5 * S(p, 1), 0))
        add(pose, 'neck@loc', (0, .012 * S(p, 2, .1), 0))
        add(pose, 'head', (-2 * S(p, 2, .3), 0, 3 * S(p, 1, .2)))
        add(pose, 'tail_1', (0, 0, 10 * S(p, 1, .3)))
        for sd, ph in (('L', 0), ('R', .5)):
            k = S(p, 1, ph)
            add(pose, f'thigh_{sd}', (20 + 30 * k, 0, 0))
            add(pose, f'shin_{sd}', (25 + 25 * k, 0, 0))
            add(pose, f'foot_{sd}', (40 * max(0, k) - 30, 0, 0))
        return pose
    P.clip('Swim', 40, swim)

    export_animal('duck', arm, P, scale=.87)       # 0.4 m long


# ====================================================================== DEER


def build_deer():
    """Sika stag (the shrine-park deer of Japan): warm chestnut coat with white summer spots, a dark
    dorsal stripe, white rump patch, cream belly and ear insides, big lashed eyes, black nose, three-tined
    antlers and slender legs with dark hooves. Walk 1.3 m/s."""
    reset()
    coat = mat('Deer coat', '#c4662b', rough=.62)
    cream = mat('Deer cream', '#f5ead6', rough=.65)
    dark = mat('Deer dark', '#3a2622', rough=.45)
    antler = mat('Deer antler', '#efd6a2', rough=.5)
    ew, pupil, _ = eye_mats('Deer')
    parts = []

    hk = [(0, -.56, 1.17, .07, .075), (0, -.62, 1.19, .1, .095), (0, -.7, 1.16, .08, .075), (0, -.79, 1.1, .055, .052),
          (0, -.85, 1.07, .042, .042)]
    head = loft('Deer head', hk, [coat, cream], n=14, sub=2, dome=(.8, .6),
                mat_fn=lambda u, a: 1 if (u > 2.2 and math.sin(a) < -.25) else 0)
    hs = Surface([head])
    eyeN, eyeR = V(.8, -.5, .25), .03
    eyeC = seat_eye(hs, V(.07, -.68, 1.21), eyeN, eyeR, .4)

    SH, EL, WR, FT = V(.12, -.26, .72), V(.13, -.22, .44), V(.13, -.26, .13), V(.13, -.31, 0)
    HP, KN, HK, HT = V(.12, .36, .74), V(.13, .27, .47), V(.13, .44, .2), V(.13, .39, 0)
    bones = [('root', (0, 0, 0), (0, 0, .2), None),
             ('hips', (0, .36, .8), (0, .1, .8), 'root'),
             ('spine', (0, .1, .8), (0, -.12, .81), 'hips'),
             ('chest', (0, -.12, .81), (0, -.33, .85), 'spine'),
             ('neck_1', (0, -.36, .9), (0, -.45, 1.0), 'chest'),
             ('neck_2', (0, -.45, 1.0), (0, -.53, 1.12), 'neck_1'),
             ('head', (0, -.55, 1.17), (0, -.86, 1.12), 'neck_2'),
             ('jaw', (0, -.72, 1.07), (0, -.85, 1.045), 'head'),
             ('tail_1', (0, .52, .86), (0, .6, .8), 'hips')]
    lid_bones(bones, eyeC, eyeN)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'ear_{sd}', sym(V(.07, -.57, 1.26), s), sym(V(.2, -.55, 1.33), s), 'head'),
                  (f'upperarm_{sd}', sym(SH, s), sym(EL, s), 'chest'),
                  (f'forearm_{sd}', sym(EL, s), sym(WR, s), f'upperarm_{sd}'),
                  (f'paw_{sd}', sym(WR, s), sym(FT, s), f'forearm_{sd}'),
                  (f'thigh_{sd}', sym(HP, s), sym(KN, s), 'hips'),
                  (f'shin_{sd}', sym(KN, s), sym(HK, s), f'thigh_{sd}'),
                  (f'foot_{sd}', sym(HK, s), sym(HT, s), f'shin_{sd}')]
    arm = build_armature('Deer', bones)
    segs = [('hips', V(0, .6, .8), V(0, .1, .8)), ('spine', V(0, .1, .8), V(0, -.12, .81)),
            ('chest', V(0, -.12, .81), V(0, -.36, .9)), ('neck_1', V(0, -.36, .9), V(0, -.45, 1.0)),
            ('neck_2', V(0, -.45, 1.0), V(0, -.55, 1.17)), ('head', V(0, -.55, 1.17), V(0, -.62, 1.19))]
    parts.append(bind(head, 'head'))

    tk = [(0, .5, .8, .1, .12), (0, .42, .8, .165, .19), (0, .22, .79, .16, .185), (0, .0, .79, .16, .19),
          (0, -.2, .8, .165, .2), (0, -.32, .84, .13, .16), (0, -.42, .95, .085, .1), (0, -.5, 1.08, .07, .08),
          (0, -.54, 1.16, .065, .07)]
    body = loft('Deer body', tk, [coat, cream], n=16, sub=2, dome=(.8, 0),
                mat_fn=lambda u, a: 1 if (math.sin(a) < -.62 and 1 < u < 5.5) or (u > 5.3 and math.sin(a) < -.35) else 0)
    parts.append(bind_chain(body, segs, .06))
    surf = Surface([body])
    # dorsal stripe, white rump patch, summer spots
    axis = lambda q: V(0, q.y, .8)
    for p_ in conform_patch('Deer stripe', surf, V(0, 0, 1.1), X, Y, -.36, .46, lambda t: .016 * math.sin(math.pi * t) ** .3 + .004,
                            12, 2, .002, .004, dark, ray_axis=axis):
        parts.append(bind_chain(p_, segs, .06))
    for p_ in conform_patch('Deer rump', surf, V(0, .6, .82), X, Z, -.12, .1, lambda t: .09 * math.sin(math.pi * min(1, .1 + .9 * t)) ** .5 + .01,
                            5, 5, .002, .005, cream, rim_m=dark, rim_r=.008, ray_axis=lambda q: V(0, .3, q.z)):
        parts.append(bind_chain(p_, segs, .06))
    for s in (1, -1):
        for k, (y, a, r) in enumerate(((-.18, 58, .022), (-.05, 62, .025), (.08, 60, .024), (.21, 58, .024), (.34, 55, .021),
                                       (-.1, 38, .019), (.03, 40, .021), (.16, 40, .021), (.28, 36, .019), (.12, 22, .016))):
            ar = math.radians(a)
            pos = V(s * math.cos(ar) * .3, y, .8 + math.sin(ar) * .3)
            parts.append(bind_chain(surf.spot(f'Deer spot {s}{k}', pos, r, cream, thick=.25, seg=8, rings=2,
                                              dirn=(V(0, y, .8) - pos).normalized()), segs, .06))
    parts.append(bind(lobe('Deer tail', [V(0, .5, .88), V(0, .56, .84), V(0, .6, .77)], .038, dark, side=X, n=6, flat=.6, tip=.5,
                           mats=[dark, cream], mat_fn=lambda u, a: 1 if math.sin(a) < -.2 else 0), 'tail_1'))
    # face
    parts.append(bind(sphere('Deer nose', (.038, .025, .028), (0, -.87, 1.08), dark, seg=10, rings=6), 'head'))
    parts.append(bind(loft('Deer chin', [(0, -.72, 1.05, .045, .03), (0, -.8, 1.035, .038, .024), (0, -.85, 1.035, .025, .018)],
                           cream, n=8, sub=1, dome=(.5, .8)), 'jaw'))
    parts.append(bind(tube('Deer mouth', [V(-.03, -.83, 1.045), V(0, -.855, 1.05), V(.03, -.83, 1.045)], .004, dark, verts=4), 'head'))
    eyes = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        e = Eye(f'Deer eye {sd}', sym(eyeC, s), sym(eyeN, s), eyeR, ew, pupil, dark, iris=.8, pupil=.46, tall=1.1,
                look=(-.1 * s, .03), lid_m=coat, lash_m=pupil, lid_open=18, seg=10, rings=6, lid_res=(5, 7))
        for p_ in e.parts:
            parts.append(bind(p_, 'head'))
        for p_ in e.lid_parts:
            parts.append(bind(p_, f'lid_{sd}'))
        eyes[sd] = e
        # ears: broad leaves with cream insides
        base, tip = sym(V(.07, -.57, 1.26), s), sym(V(.21, -.55, 1.34), s)
        ek = []
        for t, w, h in ((0, .035, .015), (.35, .06, .016), (.75, .05, .013), (1.0, .01, .008)):
            c = base.lerp(tip, t)
            ek.append((c.x, c.y, c.z, w, h))
        ear = loft(f'Deer ear {s}', ek, [coat, cream], n=8, sub=2, side=Y, dome=(0, .7),
                   mat_fn=lambda u, a: 1 if (math.sin(a) > .3 and .4 < u < 3.2) else 0)
        parts.append(bind_chain(ear, [('head', base - (tip - base).normalized() * .04, base), (f'ear_{sd}', base, tip)], .02))
        # antlers: a beam sweeping up and back with three tines
        b0 = sym(V(.045, -.6, 1.25), s)
        beam = [b0, b0 + sym(V(.03, .02, .1), s), b0 + sym(V(.07, .06, .2), s), b0 + sym(V(.09, .12, .29), s),
                b0 + sym(V(.08, .19, .36), s)]
        parts.append(bind(tube(f'Deer beam {s}', beam, .027, antler, verts=6, radius_fn=lambda t: 1 - .55 * t), 'head'))
        for k, (i, d, ln) in enumerate(((1, V(0, -1, .5), .1), (2, V(.2, -.8, .9), .11), (3, V(.3, -.5, 1), .09))):
            st = beam[i]
            dd = sym(d, s).normalized()
            parts.append(bind(tube(f'Deer tine {s}{k}', [st, st + dd * ln * .5 + V(0, 0, .01), st + dd * ln], .016, antler, verts=5,
                                   radius_fn=lambda t: 1 - .7 * t), 'head'))
    # legs
    for s, sd in ((1, 'L'), (-1, 'R')):
        fl = limb(f'Deer foreleg {s}', [sym(p, s) for p in (SH + V(0, 0, .08), SH, EL, WR + V(0, .005, .1), WR, WR.lerp(FT, .5))],
                  [(.07, .08), (.065, .075), (.04, .045), (.032, .034), (.031, .033), (.031, .031)], [coat, cream], n=8,
                  mat_fn=lambda u, a: 1 if (u < 2.5 and math.cos(a) * s < -.5) else 0)
        fsegs = [('chest', sym(SH + V(0, 0, .15), s), sym(SH, s)), (f'upperarm_{sd}', sym(SH, s), sym(EL, s)),
                 (f'forearm_{sd}', sym(EL, s), sym(WR, s)), (f'paw_{sd}', sym(WR, s), sym(FT, s))]
        parts.append(bind_chain(fl, fsegs, .04))
        parts.append(bind(cyl(f'Deer fhoof {s}', .034, .06, sym(V(.13, -.3, .03), s), dark, verts=8, r2=.03, bevel=.01),
                          f'paw_{sd}'))
        hl = limb(f'Deer hindleg {s}', [sym(p, s) for p in (HP + V(0, 0, .08), HP, KN, HK + V(0, .005, .06), HK, HK.lerp(HT, .6))],
                  [(.085, .12), (.085, .11), (.045, .05), (.033, .035), (.031, .033), (.031, .031)], [coat, cream], n=8,
                  mat_fn=lambda u, a: 1 if (u < 2.5 and math.cos(a) * s < -.5) else 0)
        hsegs = [('hips', sym(HP + V(0, 0, .15), s), sym(HP, s)), (f'thigh_{sd}', sym(HP, s), sym(KN, s)),
                 (f'shin_{sd}', sym(KN, s), sym(HK, s)), (f'foot_{sd}', sym(HK, s), sym(HT, s))]
        parts.append(bind_chain(hl, hsegs, .04))
        parts.append(bind(cyl(f'Deer hhoof {s}', .034, .06, sym(V(.13, .395, .03), s), dark, verts=8, r2=.03, bevel=.01),
                          f'foot_{sd}'))

    make_skin('deer', arm, parts, dict(rays=36, distance=.3, strength=.6, ground=0.0))

    # ---------------------------------------------------------------- animation
    P = Player(arm)
    for sd in 'LR':
        P.leg(f'F{sd}', f'upperarm_{sd}', f'forearm_{sd}', f'paw_{sd}')
        P.leg(f'H{sd}', f'thigh_{sd}', f'shin_{sd}', f'foot_{sd}')
    T = {k: v['T'].copy() for k, v in P.legs.items()}

    def stand():
        return {k: (T[k].copy(), 0.0) for k in T}

    # Idle: alert and calm - ear flicks, tail flicks, a head turn, blinks, a hoof shift
    def idle(p):
        pose = {'ik': stand()}
        add(pose, 'spine', (.6 * S(p, 3), 0, 0))
        look = window(p, .3, .62, .25)
        add(pose, 'neck_1', (0, 0, 10 * look))
        add(pose, 'neck_2', (-6 * look, 0, 10 * look))
        add(pose, 'head', (-4 * look, 6 * look, 14 * look))
        add(pose, 'ear_L', (-20 * pulse(p, .18, .025), 0, 18 * pulse(p, .18, .025)))
        add(pose, 'ear_R', (-20 * pulse(p, .75, .025), 0, -18 * pulse(p, .75, .025)))
        add(pose, 'tail_1', (-30 * pulse(p, .5, .025) - 30 * pulse(p, .56, .025), 0, 0))
        st = pulse(p, .85, .04)
        pose['ik']['FR'] = (T['FR'] + V(0, -.02 * st, .06 * st), 25 * st)
        set_lids(pose, eyes, blink(p, (.1, .7), .015), deg=110)
        return pose
    P.clip('Idle', 150, idle)

    # Walk: four-beat; 1.3 m/s
    WF, WD = 24, .62
    sweep = 1.3 * WF / FPS * WD

    def walk(p):
        pose = {'ik': gait(P, T, p, {'HL': 0, 'FL': .25, 'HR': .5, 'FR': .75}, WD, sweep, (.1, .09), curl=(60, 40), roll=14,
                           offset={'FL': V(0, .03, 0), 'FR': V(0, .03, 0)})}
        add(pose, 'hips@loc', (0, 0, -.02 + .012 * C(p, 2, -.05)))
        add(pose, 'hips', (1 * S(p, 2), 2 * S(p, 1, .1), 3 * S(p, 1)))
        add(pose, 'chest', (-1 * S(p, 2), -2 * S(p, 1), -2 * S(p, 1, .15)))
        add(pose, 'neck_1', (3 * S(p, 2, .1), 0, 2 * S(p, 1, .3)))
        add(pose, 'neck_2', (2 * S(p, 2, .15), 0, 0))
        add(pose, 'head', (-4 * S(p, 2, .2), 0, 2 * S(p, 1, .4)))
        add(pose, 'ear_L', (5 * S(p, 2, .3), 0, 0))
        add(pose, 'ear_R', (5 * S(p, 2, .3), 0, 0))
        add(pose, 'tail_1', (0, 0, 8 * S(p, 1, .3)))
        return pose
    P.clip('Walk', WF, walk)

    # Graze: head down to the grass, nibbling and chewing, a brief alert look up, then back down
    def graze_body(k):
        pose = {'ik': stand()}
        pose['ik']['FL'] = (T['FL'] + V(.05, -.08 * k, 0), 0)
        pose['ik']['FR'] = (T['FR'] + V(-.05, -.02 * k, 0), 0)
        add(pose, 'hips@loc', (0, .0, -.05 * k))
        add(pose, 'chest', (10 * k, 0, 0))
        return pose
    GAIM = P.aim_chain(graze_body(1), ['neck_1', 'neck_2', 'head'], [V(0, -.52, .74), V(0, -.66, .5), V(0, -.74, .07)])

    def graze_base(k):
        pose = graze_body(k)
        for bn in ('neck_1', 'neck_2', 'head'):
            pose[bn] = Quaternion().slerp(GAIM[bn], k)
        return pose
    gk = 1.0

    def graze(p):
        up = window(p, .55, .78, .3)
        dn = 1 - up
        pose = graze_base(gk * dn)
        pose['head'] = Euler((D(4 * dn * S(p, 8)), 0, D(4 * dn * S(p, 1))), 'XYZ').to_quaternion() @ pose['head']
        add(pose, 'jaw', (8 * (.5 + .5 * S(p, 12)), 0, 3 * S(p, 6)))
        add(pose, 'ear_L', (-18 * up, 0, 10 * up - 14 * pulse(p, .3, .03)))
        add(pose, 'ear_R', (-18 * up, 0, -10 * up))
        pose['head'] = Euler((D(-6 * up), 0, D(18 * up * S(p, 2, .1))), 'XYZ').to_quaternion() @ pose['head']
        add(pose, 'tail_1', (-25 * pulse(p, .65, .03), 0, 0))
        set_lids(pose, eyes, blink(p, (.25,), .015) + .25 * dn, deg=110)
        return pose
    P.clip('Graze', 150, graze)

    export_animal('deer', arm, P)


# FARM-BEGIN
# ====================================================================== FARM ANIMALS (cow, pig, goat, dog)
# Shared helpers live in farm_animal_kit.py; each builder authors at real size (no export scale), so the
# Walk/Run sweeps below are simply speed * cycle time * duty.


def farm_eyes(parts, prefix, eyeC, eyeN, r, ew, dark, iris, lid_ms, look=(-.1, .02), iris_k=.8, pupil=.5, tall=1.1,
              lid_open=22, seg=10, rings=6, lid_res=(5, 8), lash=None, shine=.2, glint2=True):
    eyes = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        e = Eye(f'{prefix} eye {sd}', sym(eyeC, s), sym(eyeN, s), r, ew, dark, iris, iris=iris_k, pupil=pupil, tall=tall,
                look=(look[0] * s, look[1]), lid_m=lid_ms[sd], lash_m=lash or dark, lid_open=lid_open, seg=seg, rings=rings,
                lid_res=lid_res, shine=shine)
        for p_ in e.parts:
            if not glint2 and p_.name.endswith(' shine 1'):
                bpy.data.objects.remove(p_, do_unlink=True)
                continue
            parts.append(bind(p_, 'head'))
        for p_ in e.lid_parts:
            parts.append(bind(p_, f'lid_{sd}'))
        eyes[sd] = e
    return eyes


def side_patch(surf, name, s, yc, zc, ry, rz, material, axis_z, wob=0.0, off=.002, thick=.004, rows=4, cols=5, seed=0,
               rim=None):
    """A soft blob of coat colour hugging the flank (s = +1 left / -1 right), centred (yc, zc), half sizes (ry, rz)."""
    out = []
    ph = seed * 1.7
    fn = lambda t: ry * (math.sin(math.pi * (.06 + .88 * t)) ** .6) * (1 + .18 * math.sin(3.1 * t + ph)) + .004
    cf = lambda t: wob * math.sin(2.3 * t + ph)
    for p_ in conform_patch(name, surf, V(s * .6, yc, zc), Y, Z, -rz, rz, fn, rows, cols, off, thick, material,
                            center_fn=cf, ray_axis=lambda q: V(0, q.y, axis_z), rim_m=rim, rim_r=.006 if rim else 0.0):
        out.append(p_)
    return out


def slit_pupils(parts, eyes, prefix, material, w=.03, h=.011, vertical=False):
    """Rectangular (goat) or slit pupils laid on the iris of each Eye (rounded boxes oriented to the eye normal)."""
    for sd, e in eyes.items():
        pos = e.c + e.n * e.r * 1.03
        q = e.n.to_track_quat('Z', 'Y')
        size = (h, w, .004) if vertical else (w, h, .004)
        parts.append(bind(box(f'{prefix} pupil slit {sd}', size, pos, material, bevel=.0016, segments=1, rot=q.to_euler()),
                          'head'))


def build_cow():
    """Village dairy cow: a chunky black-and-white Holstein (reads on green grass and gold stubble), a big
    chibi head with a pink muzzle, nostrils, lashed amber-brown eyes, small cream horns, leaf ears, a forelock tuft,
    cloven hooves, an udder, a tufted tail and a brass bell on a red collar (the bell swings). About 1.9 m nose to tail,
    1.3 m at the back. Clips: Idle, Walk (0.7 m/s), Graze, Moo (once), Sleep."""
    reset()
    hide = mat('Cow hide', '#f6f1e7', rough=.7)
    patch = mat('Cow patch', '#29232a', rough=.7)
    pink = mat('Cow nose', '#f3a2a8', rough=.5)
    horn = mat('Cow horn', '#f1e2b6', rough=.5)
    hoof = mat('Cow hoof', '#3b2c28', rough=.5)
    collar = mat('Cow collar', '#d7302a', rough=.5)
    brass = mat('Cow bell', '#e3a823', rough=.28, metal=.85)
    ew, dark, iris = eye_mats('Cow', '#6a4224')
    horn = hide                                # shared materials keep the draw calls down (<= 8)
    hoof = patch
    parts = []

    NECK1 = (V(0, -.5, 1.0), V(0, -.63, 1.07))
    NECK2 = (NECK1[1], V(0, -.76, 1.15))
    hk = [(0, -.78, 1.17, .15, .17), (0, -.88, 1.19, .2, .215), (0, -1.02, 1.13, .19, .19), (0, -1.14, 1.07, .18, .15),
          (0, -1.21, 1.04, .17, .13)]
    head = loft('Cow head', hk, [hide, pink], n=14, sub=2, dome=(.8, .7), mat_fn=lambda u, a: 1 if u > 3.35 else 0)
    hs = Surface([head])
    eyeN, eyeR = V(.8, -.5, .28), .052
    eyeC = seat_eye(hs, V(.16, -.95, 1.2), eyeN, eyeR, .42)

    SH, EL, WR, FT = V(.2, -.36, .85), V(.205, -.34, .54), V(.205, -.37, .22), V(.205, -.39, 0)
    HP, KN, HK, HT = V(.2, .42, .85), V(.215, .36, .55), V(.215, .46, .27), V(.215, .44, 0)
    bones = [('root', (0, 0, 0), (0, 0, .2), None),
             ('hips', (0, .55, .95), (0, .2, .93), 'root'),
             ('spine', (0, .2, .93), (0, -.15, .93), 'hips'),
             ('chest', (0, -.15, .93), (0, -.5, .98), 'spine'),
             ('neck_1', NECK1[0], NECK1[1], 'chest'),
             ('neck_2', NECK2[0], NECK2[1], 'neck_1'),
             ('head', (0, -.78, 1.17), (0, -1.2, 1.05), 'neck_2'),
             ('jaw', (0, -1.04, 1.0), (0, -1.2, .95), 'head'),
             ('bell', (0, -.65, .85), (0, -.65, .73), 'neck_1')]
    tail = [V(0, .66, 1.0), V(0, .78, .92), V(0, .81, .72), V(0, .81, .5)]
    chain_bones(bones, 'tail', tail, 'hips')
    lid_bones(bones, eyeC, eyeN)
    EARB = V(.13, -.86, 1.25)
    EART = V(.35, -.85, 1.19)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear_{sd}', sym(EARB, s), sym(EART, s), 'head'))
    leg_bones(bones, (SH, EL, WR, FT), (HP, KN, HK, HT))
    arm = build_armature('Cow', bones)
    segs = [('hips', V(0, .7, .95), V(0, .2, .93)), ('spine', V(0, .2, .93), V(0, -.15, .93)),
            ('chest', V(0, -.15, .93), V(0, -.5, .98)), ('neck_1', NECK1[0], NECK1[1]), ('neck_2', NECK2[0], NECK2[1]),
            ('head', V(0, -.76, 1.15), V(0, -.82, 1.17))]
    parts.append(bind(head, 'head'))

    tk = [(0, .7, 1.0, .15, .18), (0, .58, .99, .29, .33), (0, .3, .93, .35, .4), (0, .0, .91, .36, .41),
          (0, -.28, .93, .35, .4), (0, -.5, .99, .3, .35), (0, -.65, 1.07, .22, .26), (0, -.78, 1.15, .19, .22)]
    body = loft('Cow body', tk, hide, n=14, sub=2, dome=(.8, 0))
    parts.append(bind_chain(body, segs, .07))
    surf = Surface([body])
    axz = .93
    # black patches (flanks differ, like a real Holstein), one over the back, one on the neck
    for nm, s, yc, zc, ry, rz, w in (('flank L', 1, .08, .98, .23, .22, .03), ('rump L', 1, .52, .84, .14, .16, -.02),
                                     ('flank R', -1, -.16, .93, .24, .21, -.03), ('rump R', -1, .42, 1.07, .17, .15, .02),
                                     ('neck L', 1, -.5, 1.0, .1, .14, 0), ('belly R', -1, .12, .72, .12, .1, 0)):
        for p_ in side_patch(surf, f'Cow {nm}', s, yc, zc, ry, rz, patch, axz, wob=w, seed=len(nm)):
            parts.append(bind_chain(p_, segs, .07))
    for p_ in conform_patch('Cow saddle', surf, V(0, .3, 1.5), X, Y, -.15, .13,
                            lambda t: .17 * math.sin(math.pi * (.08 + .84 * t)) ** .5 + .02, 5, 5, .002, .004, patch,
                            center_fn=lambda t: .03 * math.sin(4 * t), ray_axis=lambda q: V(0, q.y, axz)):
        parts.append(bind_chain(p_, segs, .07))
    # head: dark patch around the left eye and a spot over the right ear
    hax = lambda q: V(0, -.95, 1.05)
    for nm, s, org, w in (('eye patch', 1, V(.45, -.9, 1.1), .075), ('crown patch', -1, V(-.45, -.8, 1.15), .06)):
        for p_ in conform_patch(f'Cow {nm}', hs, org, Y, Z, -.07, .075,
                                lambda t, w=w: w * math.sin(math.pi * (.1 + .8 * t)) ** .5 + .006, 5, 5, .0015, .003, patch,
                                ray_axis=hax):
            parts.append(bind(p_, 'head'))
    # udder with teats
    ud = sphere('Cow udder', (.095, .12, .075), (0, .3, .5), pink, seg=10, rings=6)
    parts.append(bind(ud, 'hips'))
    for k, (x, y) in enumerate(((.045, .24), (-.045, .24), (.045, .35), (-.045, .35))):
        parts.append(bind(cyl(f'Cow teat {k}', .016, .06, V(x, y, .44), pink, verts=7, r2=.012, bevel=.005), 'hips'))
    # tail with a tuft
    tk2 = [(t.x, t.y, t.z, .028 - .007 * i / 3, .028 - .007 * i / 3) for i, t in enumerate(tail)]
    tl = loft('Cow tail', tk2, hide, n=8, sub=2, dome=(0, 0))
    parts.append(bind_chain(tl, chain_segs('tail', tail, ('hips', V(0, .6, 1.0), tail[0])), .04))
    tuft = loft('Cow tail tuft', [(0, .81, .56, .03, .03), (0, .815, .46, .052, .05), (0, .81, .36, .03, .03)], patch, n=8, sub=2,
                dome=(.8, 1.2))
    parts.append(bind(tuft, 'tail_3'))
    # face
    for s in (1, -1):
        parts.append(bind(sphere(f'Cow nostril {s}', (.016, .01, .02), sym(V(.065, -1.205, 1.0), s), dark, seg=6, rings=4,
                                 rot=(.5, 0, 0)), 'head'))
    parts.append(bind(loft('Cow chin', [(0, -1.02, .96, .09, .04), (0, -1.12, .935, .115, .04), (0, -1.2, .93, .12, .035)], pink,
                           n=10, sub=1, dome=(.5, .9)), 'jaw'))
    parts.append(bind(tube('Cow mouth', [V(-.09, -1.15, .985), V(-.045, -1.2, .985), V(0, -1.215, .99), V(.045, -1.2, .985),
                                         V(.09, -1.15, .985)], .0045, dark, verts=4), 'head'))
    eyes = farm_eyes(parts, 'Cow', eyeC, eyeN, eyeR, ew, dark, iris, {'L': patch, 'R': hide}, look=(-.1, .03), lid_open=26)
    parts.append(bind(puff('Cow forelock', V(0, -.8, 1.24), .075, hide, seg=8, rings=5, lump=.2, seed=3), 'head'))
    parts.append(bind(puff('Cow forelock b', V(.045, -.76, 1.22), .05, patch, seg=7, rings=4, lump=.2, seed=5), 'head'))
    for s, sd in ((1, 'L'), (-1, 'R')):
        ear = leaf_ear(f'Cow ear {s}', sym(EARB, s), sym(EART, s), .085, .026, [patch, pink], Y,
                       mat_fn=lambda u, a: 1 if (math.sin(a) < -.35 and .4 < u < 3.4) else 0, shape=((0, .7), (.3, 1.0), (.75, .9), (1, .12)))
        parts.append(bind_chain(ear, [('head', sym(EARB, s) - sym(EART - EARB, s).normalized() * .04, sym(EARB, s)),
                                      (f'ear_{sd}', sym(EARB, s), sym(EART, s))], .03))
        # small curved horns
        b0 = sym(V(.08, -.8, 1.27), s)
        pts = [b0 - V(0, 0, .03) * 1, b0 + sym(V(.03, 0, .04), s), b0 + sym(V(.09, .005, .09), s), b0 + sym(V(.14, .0, .17), s)]
        parts.append(bind(tube(f'Cow horn {s}', pts, .036, horn, verts=7, radius_fn=lambda t: 1 - .62 * t), 'head'))
    # collar and bell
    for p_ in (band('Cow collar', Surface([body]), V(0, -.64, 1.08), V(0, -.7, .5), collar, width=.05, grow=.014),):
        parts.append(bind_chain(p_, segs, .03))
    parts.append(bind(tube('Cow bell strap', [V(0, -.66, .84), V(0, -.65, .81), V(0, -.65, .78)], .01, collar, verts=5), 'neck_1'))
    bell = lathe('Cow bell', [(0, .045), (.035, .04), (.05, .0), (.058, -.045), (.062, -.062), (.0, -.062)], brass, seg=14,
                 loc=V(0, -.65, .74))
    parts.append(bind(bell, 'bell'))
    parts.append(bind(sphere('Cow bell clapper', .014, (0, -.65, .675), brass, seg=6, rings=4), 'bell'))

    # legs
    def cow_hoof(s, sd, kind, bone):
        y = -.4 if kind == 'f' else .42
        x = .205 if kind == 'f' else .215
        out = []
        for k, dx in enumerate((-.026, .026)):
            out.append(cyl(f'Cow {kind}hoof {s}{k}', .033, .085, V((x + dx) * s, y, .04), hoof, verts=8,
                           r2=.036, bevel=.01))
        return out
    fp = [SH + V(0, 0, .1), SH, EL, WR + V(0, .005, .1), WR, WR.lerp(FT, .55)]
    fr = [(.1, .11), (.098, .105), (.065, .07), (.055, .057), (.054, .056), (.056, .057)]
    hp = [HP + V(0, 0, .1), HP, KN, HK + V(0, .005, .1), HK, HK.lerp(HT, .55)]
    hr = [(.12, .14), (.115, .13), (.07, .08), (.056, .06), (.054, .056), (.056, .057)]
    build_legs(parts, 'Cow', (SH, EL, WR, FT), (HP, KN, HK, HT), fp, fr, hp, hr, hide, hoof=cow_hoof, blend=.045, n=6)

    mesh = make_skin('cow', arm, parts, dict(rays=36, distance=.3, strength=.6, ground=0.0))

    # ---------------------------------------------------------------- animation
    P, T = quad_player(arm)

    def stand():
        return {k: (T[k].copy(), 0.0) for k in T}

    # Idle: slow breathing, chewing the cud, ear flicks, a tail swish, a head turn, blinks
    def idle(p):
        pose = {'ik': stand()}
        br = S(p, 3)
        add(pose, 'spine', (.8 * br, 0, 0))
        add(pose, 'chest', (-.5 * br, 0, 0))
        lk = window(p, .35, .7, .28)
        add(pose, 'neck_1', (0, 0, 8 * lk))
        add(pose, 'neck_2', (-2 * lk, 0, 8 * lk))
        add(pose, 'head', (2 + 2 * lk * S(p, 2), 3 * lk, 8 * lk))
        add(pose, 'jaw', (3 * (.5 + .5 * S(p, 10)), 0, 2 * S(p, 5)))
        add(pose, 'ear_L', (0, 0, -22 * pulse(p, .2, .03) - 6 * S(p, 3, .2)))
        add(pose, 'ear_R', (0, 0, 22 * pulse(p, .55, .03) + 6 * S(p, 3)))
        sw = S(p, 1) * (.4 + .6 * window(p, .5, .95, .3))
        for i in range(3):
            add(pose, f'tail_{i + 1}', (0, 0, (8 + 7 * i) * sw * S(p, 2, -.08 * i) * .6 + 6 * sw))
        add(pose, 'bell', (3 * S(p, 3, .2) + 12 * lk * S(p, 4), 0, 0))
        set_lids(pose, eyes, blink(p, (.12, .78), .018), deg=105)
        return pose
    P.clip('Idle', 150, idle)

    # Walk: slow four-beat lateral walk, 0.7 m/s
    WF, WD = 36, .66
    sweep = .7 * WF / FPS * WD

    def walk(p):
        pose = {'ik': gait(P, T, p, {'HL': 0, 'FL': .25, 'HR': .5, 'FR': .75}, WD, sweep, (.09, .085), curl=(50, 38), roll=12,
                           offset={'FL': V(0, .0, 0), 'FR': V(0, .0, 0)})}
        add(pose, 'hips@loc', (0, 0, -.047 + .01 * C(p, 2, -.05)))
        add(pose, 'hips', (1.2 * S(p, 2), 2.5 * S(p, 1, .1), 3 * S(p, 1)))
        add(pose, 'spine', (0, 0, -1.5 * S(p, 1, .1)))
        add(pose, 'chest', (-1 * S(p, 2), -2 * S(p, 1), -2 * S(p, 1, .15)))
        add(pose, 'neck_1', (2 + 2 * S(p, 2, .1), 0, 3 * S(p, 1, .3)))
        add(pose, 'neck_2', (3 * S(p, 2, .15), 0, 2 * S(p, 1, .3)))
        add(pose, 'head', (-2 + -3 * S(p, 2, .2), 0, 2 * S(p, 1, .4)))
        add(pose, 'ear_L', (0, 0, 6 * S(p, 2, .3)))
        add(pose, 'ear_R', (0, 0, -6 * S(p, 2, .3)))
        wave_chain(pose, ['tail_1', 'tail_2', 'tail_3'], p, 8, 1, .12)
        add(pose, 'bell', (14 * S(p, 2, .1), 0, 0))
        set_lids(pose, eyes, 0, deg=105)
        return pose
    P.clip('Walk', WF, walk)
    foot_report(P, 'cow Walk', walk, WF, .7)

    # Graze: head down to the grass, tearing and chewing, a brief look up in the middle
    def graze_body(k):
        pose = {'ik': stand()}
        pose['ik']['FL'] = (T['FL'] + V(.0, -.07 * k, 0), 0)
        pose['ik']['FR'] = (T['FR'] + V(-.0, -.01 * k, 0), 0)
        add(pose, 'hips@loc', (0, 0, -.07 * k))
        add(pose, 'chest', (15 * k, 0, 0))
        return pose
    GAIM = P.aim_chain(graze_body(1), ['neck_1', 'neck_2', 'head'], [V(0, -.62, .74), V(0, -.74, .52), V(0, -.84, .16)])

    def graze_base(k):
        pose = graze_body(k)
        for bn in ('neck_1', 'neck_2', 'head'):
            pose[bn] = Quaternion().slerp(GAIM[bn], k)
        return pose

    def graze(p):
        up = window(p, .6, .8, .3)
        dn = 1 - up
        pose = graze_base(dn)
        pose['head'] = Euler((D(5 * dn * S(p, 6)), 0, D(4 * dn * S(p, 1))), 'XYZ').to_quaternion() @ pose['head']
        add(pose, 'jaw', (7 * (.5 + .5 * S(p, 12)) * (.4 + .6 * up), 0, 3 * S(p, 6)))
        add(pose, 'ear_L', (0, 0, -20 * pulse(p, .3, .03) + 8 * up))
        add(pose, 'ear_R', (0, 0, 20 * pulse(p, .45, .03) - 8 * up))
        pose['head'] = Euler((D(-5 * up), 0, D(14 * up * S(p, 2, .1))), 'XYZ').to_quaternion() @ pose['head']
        wave_chain(pose, ['tail_1', 'tail_2', 'tail_3'], p, 7, 2, .1)
        add(pose, 'bell', (10 * dn * S(p, 6) + 4 * up * S(p, 2), 0, 0))
        set_lids(pose, eyes, blink(p, (.25,), .015) + .15 * dn, deg=105)
        return pose
    P.clip('Graze', 150, graze)

    # Moo (once): head up, big mouth open with a throat pulse, ears out, tail lifts
    def moo(p):
        pose = idle(0.0)
        k = window(p, .08, .92, .26)
        m = window(p, .3, .78, .15)
        add(pose, 'chest', (-3 * k, 0, 0))
        add(pose, 'neck_1', (-14 * k, 0, 0))
        add(pose, 'neck_2', (-16 * k, 0, 0))
        add(pose, 'head', (-14 * k, 0, 0))
        add(pose, 'jaw', (22 * m + 4 * m * S(p, 8), 0, 0))
        add(pose, 'ear_L', (0, 0, -14 * k))
        add(pose, 'ear_R', (0, 0, 14 * k))
        pose['neck_1@scale'] = (1 + .05 * m * S(p, 6) ** 2, 1, 1 + .06 * m)
        add(pose, 'tail_1', (-16 * k, 0, 0))
        add(pose, 'bell', (16 * k * S(p, 5), 0, 0))
        set_lids(pose, eyes, .6 * m, deg=105)
        return pose
    P.clip('Moo', 75, moo, loop=False)

    # Sleep: lying on the belly with the legs folded, head resting round to the flank, slow breathing
    def lie(dz):
        return {'ik': {'FL': (T['FL'] + V(-.04, -.14, .095), -75), 'FR': (T['FR'] + V(.04, -.14, .095), -75),
                       'HL': (T['HL'] + V(-.12, -.18, .095), -70), 'HR': (T['HR'] + V(.12, -.18, .095), -70)},
                'hips@loc': (0, 0, dz), 'chest': (-2, 0, 0), 'neck_1': (6, 0, 26), 'neck_2': (4, 0, 32), 'head': (4, 10, 30),
                'ear_L': (0, 0, 14), 'ear_R': (0, 0, -14)}
    ldz = lying_dz(P, mesh, lie, {'spine', 'chest', 'hips'}, start=-.25)

    def sleep(p):
        pose = lie(ldz)
        br = (S(p, 2, -.25) + 1) / 2
        pose['chest@scale'] = (1 + .03 * br, 1, 1 + .035 * br)
        pose['spine@scale'] = (1 + .035 * br, 1, 1 + .03 * br)
        pose['hips@loc'] = (0, 0, ldz + .004 * br)
        add(pose, 'ear_R', (0, 0, 16 * pulse(p, .7, .02)))
        add(pose, 'tail_2', (0, 0, 12 * pulse(p, .3, .05)))
        add(pose, 'jaw', (1.5 * (.5 + .5 * S(p, 8)), 0, 0))
        set_lids(pose, eyes, 1.0, deg=105)
        return pose
    P.clip('Sleep', 150, sleep)

    export_animal('cow', arm, P)


def build_pig():
    """Village pig: round pink porker with a big chibi head, a lighter disc snout with two nostrils, big floppy ears
    (one with a yellow farm tag), cheek blush, lashed eyes, a soft charcoal saddle and rump patch, short legs with
    cloven hooves and a proper curly tail. About 1.2 m long. Clips: Idle, Walk (0.9 m/s), Snuffle (nose to the
    ground), Oink (once), Sleep."""
    reset()
    skin_m = mat('Pig skin', '#f4a3a8', rough=.55)
    patch = mat('Pig patch', '#5d4a54', rough=.65)
    snout_m = mat('Pig snout', '#f9bcc0', rough=.45)
    inner = mat('Pig ear inner', '#e98592', rough=.55)
    nostril = mat('Pig nostril', '#b24d5c', rough=.4)
    blush = mat('Pig blush', '#ef7886', rough=.55)
    hoof = mat('Pig hoof', '#4b3a3a', rough=.5)
    tag = mat('Pig ear tag', '#f2c230', rough=.4)
    ew, dark, iris = eye_mats('Pig', '#6a3b1e')
    blush = nostril = inner                    # shared materials keep the draw calls down (<= 8)
    hoof = patch
    parts = []

    hk = [(0, -.4, .52, .17, .19), (0, -.52, .54, .235, .235), (0, -.64, .53, .21, .2), (0, -.7, .5, .16, .15)]
    head = loft('Pig head', hk, skin_m, n=14, sub=2, dome=(.8, .3))
    hs = Surface([head])
    eyeN, eyeR = V(.75, -.55, .3), .04
    eyeC = seat_eye(hs, V(.16, -.6, .63), eyeN, eyeR, .42)

    SH, EL, WR, FT = V(.16, -.2, .4), V(.165, -.19, .23), V(.165, -.21, .09), V(.165, -.23, 0)
    HP, KN, HK, HT = V(.16, .27, .4), V(.17, .23, .23), V(.17, .3, .1), V(.17, .28, 0)
    bones = [('root', (0, 0, 0), (0, 0, .2), None),
             ('hips', (0, .42, .5), (0, .1, .48), 'root'),
             ('spine', (0, .1, .48), (0, -.15, .48), 'hips'),
             ('chest', (0, -.15, .48), (0, -.34, .49), 'spine'),
             ('neck', (0, -.36, .5), (0, -.47, .52), 'chest'),
             ('head', (0, -.47, .52), (0, -.8, .49), 'neck'),
             ('jaw', (0, -.58, .45), (0, -.73, .42), 'head')]
    tail = [V(0, .44, .6), V(0, .52, .62), V(0, .56, .7), V(0, .5, .74)]
    chain_bones(bones, 'tail', tail, 'hips')
    lid_bones(bones, eyeC, eyeN)
    EARB, EARM, EART = V(.1, -.5, .73), V(.19, -.55, .75), V(.25, -.66, .65)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear_{sd}', sym(EARB, s), sym(EART, s), 'head'))
    leg_bones(bones, (SH, EL, WR, FT), (HP, KN, HK, HT))
    arm = build_armature('Pig', bones)
    segs = [('hips', V(0, .56, .52), V(0, .1, .48)), ('spine', V(0, .1, .48), V(0, -.15, .48)),
            ('chest', V(0, -.15, .48), V(0, -.34, .49)), ('neck', V(0, -.36, .5), V(0, -.47, .52)),
            ('head', V(0, -.47, .52), V(0, -.55, .53))]
    parts.append(bind(head, 'head'))

    tk = [(0, .46, .52, .15, .18), (0, .36, .5, .25, .28), (0, .12, .48, .31, .31), (0, -.12, .48, .31, .31),
          (0, -.3, .49, .27, .28), (0, -.44, .51, .21, .22)]
    body = loft('Pig body', tk, skin_m, n=16, sub=2, dome=(.9, 0))
    parts.append(bind_chain(body, segs, .06))
    surf = Surface([body])
    axz = .48
    for nm, s, yc, zc, ry, rz, w in (('saddle', -1, .02, .5, .24, .24, .03), ('rump', 1, .32, .56, .14, .15, 0)):
        for p_ in side_patch(surf, f'Pig {nm}', s, yc, zc, ry, rz, patch, axz, wob=w, seed=len(nm), rows=5, cols=6):
            parts.append(bind_chain(p_, segs, .06))
    hax = lambda q: V(0, -.62, .5)
    for p_ in conform_patch('Pig eye patch', hs, V(-.45, -.6, .56), Y, Z, -.07, .07,
                            lambda t: .08 * math.sin(math.pi * (.1 + .8 * t)) ** .5 + .006, 5, 5, .0015, .003, patch,
                            ray_axis=hax):
        parts.append(bind(p_, 'head'))
    for s in (1, -1):
        parts.append(bind(hs.spot(f'Pig blush {s}', V(s * .4, -.6, .46), (.045, .035), blush, thick=.3,
                                  dirn=V(-s, 0, 0)), 'head'))
    # disc snout, nostrils, mouth, chin
    snout = cyl('Pig snout', .095, .06, V(0, -.745, .49), snout_m, verts=14, r2=.09, bevel=.016, segments=2,
                rot=(math.pi / 2 + .1, 0, 0))
    parts.append(bind(snout, 'head'))
    for s in (1, -1):
        parts.append(bind(sphere(f'Pig nostril {s}', (.017, .01, .026), V(s * .038, -.777, .49), nostril, seg=8, rings=5,
                                 rot=(0, 0, s * .15)), 'head'))
    parts.append(bind(loft('Pig chin', [(0, -.56, .43, .09, .035), (0, -.64, .415, .1, .035), (0, -.7, .415, .085, .03)], skin_m,
                           n=10, sub=1, dome=(.5, .9)), 'jaw'))
    parts.append(bind(tube('Pig mouth', [V(-.07, -.64, .41), V(-.035, -.69, .405), V(0, -.705, .41), V(.035, -.69, .405),
                                         V(.07, -.64, .41)], .004, dark, verts=4), 'head'))
    lids = {'L': skin_m, 'R': patch}
    eyes = farm_eyes(parts, 'Pig', eyeC, eyeN, eyeR, ew, dark, iris, lids, look=(-.1, .02), lid_open=58)
    # floppy ears folded forward, one tagged
    for s, sd in ((1, 'L'), (-1, 'R')):
        pts = [sym(EARB, s), sym(EARM, s), sym(EART, s)]
        keys = [(pts[0].x, pts[0].y, pts[0].z, .05, .014), (pts[1].x, pts[1].y, pts[1].z, .085, .016),
                (pts[2].x, pts[2].y, pts[2].z, .045, .012)]
        side_v = (pts[2] - pts[0]).cross(V(.6 * s, -.3, .75)).normalized()
        ear = loft(f'Pig ear {s}', keys, [skin_m, inner], n=8, sub=2, side=side_v, dome=(0, .8),
                   mat_fn=lambda u, a: 1 if (math.sin(a) < -.4 and .3 < u < 1.7) else 0)
        parts.append(bind_chain(ear, [('head', sym(EARB, s) - V(0, 0, .03), sym(EARB, s)), (f'ear_{sd}', sym(EARB, s), sym(EART, s))],
                                .03))
    tb = V(.205, -.58, .735)
    parts.append(bind(plate('Pig tag', [(-.014, -.03), (.014, -.03), (.017, -.004), (.008, .004), (-.008, .004), (-.017, -.004)],
                            .006, tag, V(.3, -1, 0), V(0, 0, 1), tb + V(.02, -.012, -.03), bevel=.002), 'ear_L'))
    # curly tail
    cp = curl_points(V(0, .55, .68), .05, -150, 215, 14, Y, Z, shrink=.55)
    cp[0] = V(0, .43, .59)
    cp.insert(1, V(0, .475, .6))
    ct = tube('Pig tail', cp, .014, skin_m, verts=6, radius_fn=lambda t: 1 - .45 * t)
    parts.append(bind_chain(ct, chain_segs('tail', tail, ('hips', V(0, .38, .58), tail[0])), .02))

    # legs
    def pig_hoof(s, sd, kind, bone):
        y, x = (-.23, .18) if kind == 'f' else (.28, .19)
        return [cyl(f'Pig {kind}hoof {s}{k}', .024, .05, V((x + dx) * s, y, .022), hoof, verts=7, r2=.026, bevel=.007)
                for k, dx in enumerate((-.017, .017))]
    fp = [SH + V(0, 0, .08), SH, EL, WR + V(0, .003, .05), WR, WR.lerp(FT, .5)]
    fr = [(.075, .08), (.078, .08), (.06, .062), (.05, .05), (.05, .05), (.05, .05)]
    hp = [HP + V(0, 0, .08), HP, KN, HK + V(0, .003, .05), HK, HK.lerp(HT, .5)]
    hr = [(.08, .09), (.088, .095), (.065, .068), (.05, .052), (.05, .05), (.05, .05)]
    build_legs(parts, 'Pig', (SH, EL, WR, FT), (HP, KN, HK, HT), fp, fr, hp, hr, skin_m, hoof=pig_hoof, blend=.035, n=7)

    mesh = make_skin('pig', arm, parts, dict(rays=36, distance=.2, strength=.6, ground=0.0))

    # ---------------------------------------------------------------- animation
    P, T = quad_player(arm)
    TAILB = ['tail_1', 'tail_2', 'tail_3']

    def stand():
        return {k: (T[k].copy(), 0.0) for k in T}

    # Idle: breathing, snout twitch, ear flicks, tail wiggle, a little look round, blinks
    def idle(p):
        pose = {'ik': stand()}
        br = S(p, 3)
        add(pose, 'spine', (1.0 * br, 0, 0))
        add(pose, 'chest', (-.6 * br, 0, 0))
        lk = window(p, .4, .72, .25)
        add(pose, 'neck', (0, 0, 10 * lk))
        add(pose, 'head', (-2 * lk + 1.5 * S(p, 6) * pulse(p, .2, .08), 0, 12 * lk))
        add(pose, 'jaw', (1.2 * (.5 + .5 * S(p, 9)), 0, 0))
        add(pose, 'ear_L', (0, 0, -16 * pulse(p, .25, .03) + 3 * S(p, 3, .2)))
        add(pose, 'ear_R', (0, 0, 16 * pulse(p, .62, .03) - 3 * S(p, 3)))
        for i, nm in enumerate(TAILB):
            add(pose, nm, (0, 0, (10 + 7 * i) * S(p, 3, -.1 * i) * (.5 + .5 * pulse(p, .5, .3))))
        set_lids(pose, eyes, blink(p, (.1, .55, .9), .018), deg=105)
        return pose
    P.clip('Idle', 150, idle)

    # Walk: brisk short-legged walk, 0.9 m/s
    WF, WD = 18, .64
    K = .95
    sweep = .9 / K * WF / FPS * WD

    def walk(p):
        pose = {'ik': gait(P, T, p, {'HL': 0, 'FL': .25, 'HR': .5, 'FR': .75}, WD, sweep, (.05, .05), curl=(45, 35), roll=10)}
        add(pose, 'hips@loc', (0, 0, -.034 + .008 * C(p, 2, -.05)))
        add(pose, 'hips', (1.5 * S(p, 2), 2.5 * S(p, 1, .1), 4 * S(p, 1)))
        add(pose, 'chest', (-1 * S(p, 2), -2 * S(p, 1), -3 * S(p, 1, .15)))
        add(pose, 'neck', (3 + 2 * S(p, 2, .1), 0, 3 * S(p, 1, .3)))
        add(pose, 'head', (3 + 3 * S(p, 2, .2), 0, 3 * S(p, 1, .4)))
        add(pose, 'ear_L', (0, 0, 7 * S(p, 2, .3)))
        add(pose, 'ear_R', (0, 0, -7 * S(p, 2, .3)))
        for i, nm in enumerate(TAILB):
            add(pose, nm, (0, 0, (6 + 5 * i) * S(p, 2, -.1 * i)))
        set_lids(pose, eyes, 0, deg=105)
        return pose
    P.clip('Walk', WF, walk)
    foot_report(P, 'pig Walk', walk, WF, .9, K)

    # Snuffle: nose rooting along the ground, side to side, tail wiggling
    def sn_body(k):
        pose = {'ik': stand()}
        add(pose, 'hips@loc', (0, 0, -.025 * k))
        add(pose, 'chest', (6 * k, 0, 0))
        return pose
    SAIM = P.aim_chain(sn_body(1), ['neck', 'head'], [V(0, -.52, .33), V(0, -.66, .08)])

    def snuffle(p):
        pose = sn_body(1)
        for bn in ('neck', 'head'):
            pose[bn] = SAIM[bn]
        pose['head'] = Euler((D(5 * S(p, 6)), 0, D(14 * S(p, 3))), 'XYZ').to_quaternion() @ pose['head']
        pose['neck'] = Euler((0, 0, D(6 * S(p, 3, .1))), 'XYZ').to_quaternion() @ pose['neck']
        add(pose, 'jaw', (2 * (.5 + .5 * S(p, 12)), 0, 0))
        add(pose, 'ear_L', (0, 0, 8 + 5 * S(p, 6)))
        add(pose, 'ear_R', (0, 0, -8 - 5 * S(p, 6)))
        for i, nm in enumerate(TAILB):
            add(pose, nm, (0, 0, (8 + 6 * i) * S(p, 6, -.1 * i)))
        set_lids(pose, eyes, blink(p, (.5,), .02) + .2, deg=105)
        return pose
    P.clip('Snuffle', 90, snuffle)

    # Oink (once): head tosses up, mouth opens, ears flap, tail springs
    def oink(p):
        pose = idle(0.0)
        k = window(p, .06, .94, .3)
        m = window(p, .3, .7, .2)
        add(pose, 'chest', (-2 * k, 0, 0))
        add(pose, 'neck', (-14 * k, 0, 0))
        add(pose, 'head', (-20 * k + 3 * m * S(p, 7), 0, 0))
        add(pose, 'jaw', (16 * m, 0, 0))
        add(pose, 'ear_L', (0, 0, -18 * k * (1 + .5 * S(p, 6))))
        add(pose, 'ear_R', (0, 0, 18 * k * (1 + .5 * S(p, 6, .3))))
        for i, nm in enumerate(TAILB):
            add(pose, nm, (0, 0, 14 * k * S(p, 4, -.1 * i)))
        pose['chest@scale'] = (1 + .03 * m, 1, 1 + .025 * m)
        set_lids(pose, eyes, .5 * m, deg=105)
        return pose
    P.clip('Oink', 60, oink, loop=False)

    # Sleep: lying on its belly, legs folded, snout resting on the ground, curled
    def lie(dz):
        return {'ik': {'FL': (T['FL'] + V(-.03, -.06, .06), -70), 'FR': (T['FR'] + V(.03, -.06, .06), -70),
                       'HL': (T['HL'] + V(-.07, -.1, .06), -70), 'HR': (T['HR'] + V(.07, -.1, .06), -70)},
                'hips@loc': (0, 0, dz), 'neck': (14, 0, 16), 'head': (14, 10, 22), 'ear_L': (0, 0, 10), 'ear_R': (0, 0, -10)}
    ldz = lying_dz(P, mesh, lie, {'spine', 'chest', 'hips'}, start=-.15)

    def sleep(p):
        pose = lie(ldz)
        br = (S(p, 2, -.25) + 1) / 2
        pose['chest@scale'] = (1 + .035 * br, 1, 1 + .04 * br)
        pose['spine@scale'] = (1 + .04 * br, 1, 1 + .035 * br)
        pose['hips@loc'] = (0, 0, ldz + .004 * br)
        add(pose, 'ear_R', (0, 0, 12 * pulse(p, .7, .02)))
        for i, nm in enumerate(TAILB):
            add(pose, nm, (0, 0, 8 * pulse(p, .3, .06)))
        add(pose, 'jaw', (1.5 * (.5 + .5 * S(p, 8)), 0, 0))
        set_lids(pose, eyes, 1.0, deg=105)
        return pose
    P.clip('Sleep', 150, sleep)

    export_animal('pig', arm, P, scale=K)


def build_goat():
    """Hill goat: white coat with tan patches and tan stockings, a wedge head with amber eyes and rectangular
    pupils, swept-back ridged horns, sideways ears, a wagging beard, a pink-grey nose and a little tail held up.
    About 1.0 m long. Clips: Idle, Walk (1.0 m/s), Graze, Bleat (once, beard wag), Sleep."""
    reset()
    wool = mat('Goat coat', '#f7f3ea', rough=.75)
    tan = mat('Goat patch', '#c98c52', rough=.75)
    tan_d = mat('Goat tan dark', '#8e5a33', rough=.7)
    nose_m = mat('Goat nose', '#b88a86', rough=.5)
    pink = mat('Goat pink', '#eba2a2', rough=.55)
    horn = mat('Goat horn', '#d8c49a', rough=.55)
    hoof = mat('Goat hoof', '#46372f', rough=.5)
    beard_m = mat('Goat beard', '#ebdcc0', rough=.8)
    ew, dark, iris = eye_mats('Goat', '#eaa51e')
    pink = nose_m                              # shared materials keep the draw calls down (<= 8)
    beard_m = wool
    parts = []
    K = .92

    hk = [(0, -.37, .85, .095, .11), (0, -.45, .87, .125, .13), (0, -.55, .81, .105, .105), (0, -.63, .745, .076, .074),
          (0, -.68, .715, .062, .058)]
    head = loft('Goat head', hk, wool, n=14, sub=2, dome=(.8, .7))
    hs = Surface([head])
    eyeN, eyeR = V(.85, -.42, .22), .04
    eyeC = seat_eye(hs, V(.085, -.5, .89), eyeN, eyeR, .4)

    SH, EL, WR, FT = V(.1, -.2, .62), V(.1, -.18, .4), V(.1, -.2, .14), V(.1, -.215, 0)
    HP, KN, HK, HT = V(.1, .25, .62), V(.11, .21, .4), V(.11, .29, .2), V(.11, .27, 0)
    bones = [('root', (0, 0, 0), (0, 0, .2), None),
             ('hips', (0, .33, .66), (0, .08, .63), 'root'),
             ('spine', (0, .08, .63), (0, -.12, .63), 'hips'),
             ('chest', (0, -.12, .63), (0, -.3, .68), 'spine'),
             ('neck_1', (0, -.3, .7), (0, -.36, .78), 'chest'),
             ('neck_2', (0, -.36, .78), (0, -.41, .86), 'neck_1'),
             ('head', (0, -.41, .86), (0, -.69, .71), 'neck_2'),
             ('jaw', (0, -.55, .75), (0, -.67, .67), 'head')]
    beard = [V(0, -.6, .69), V(0, -.615, .6), V(0, -.62, .52)]
    chain_bones(bones, 'beard', beard, 'jaw')
    tail = [V(0, .38, .72), V(0, .43, .8), V(0, .44, .87)]
    chain_bones(bones, 'tail', tail, 'hips')
    lid_bones(bones, eyeC, eyeN)
    EARB, EART = V(.07, -.43, .9), V(.21, -.42, .83)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear_{sd}', sym(EARB, s), sym(EART, s), 'head'))
    leg_bones(bones, (SH, EL, WR, FT), (HP, KN, HK, HT))
    arm = build_armature('Goat', bones)
    segs = [('hips', V(0, .44, .7), V(0, .08, .63)), ('spine', V(0, .08, .63), V(0, -.12, .63)),
            ('chest', V(0, -.12, .63), V(0, -.3, .68)), ('neck_1', V(0, -.3, .7), V(0, -.36, .78)),
            ('neck_2', V(0, -.36, .78), V(0, -.41, .86)), ('head', V(0, -.41, .86), V(0, -.47, .86))]
    parts.append(bind(head, 'head'))

    tk = [(0, .4, .7, .1, .13), (0, .32, .68, .17, .2), (0, .1, .63, .2, .22), (0, -.1, .63, .2, .22),
          (0, -.26, .67, .17, .2), (0, -.34, .74, .12, .14), (0, -.4, .83, .095, .11)]
    body = loft('Goat body', tk, wool, n=14, sub=2, dome=(.8, 0))
    parts.append(bind_chain(body, segs, .06))
    surf = Surface([body])
    axz = .64
    for nm, s, yc, zc, ry, rz, w in (('flank L', 1, .1, .66, .17, .17, .02), ('rump R', -1, .26, .72, .13, .13, 0),
                                     ('shoulder R', -1, -.16, .62, .1, .14, .01)):
        for p_ in side_patch(surf, f'Goat {nm}', s, yc, zc, ry, rz, tan, axz, wob=w, seed=len(nm)):
            parts.append(bind_chain(p_, segs, .06))
    for p_ in conform_patch('Goat saddle', surf, V(0, .05, 1.2), X, Y, -.12, .1,
                            lambda t: .13 * math.sin(math.pi * (.08 + .84 * t)) ** .5 + .02, 5, 5, .002, .004, tan,
                            center_fn=lambda t: .02 * math.sin(3 * t), ray_axis=lambda q: V(0, q.y, axz)):
        parts.append(bind_chain(p_, segs, .06))
    hax = lambda q: V(0, -.52, .8)
    for p_ in conform_patch('Goat cheek patch', hs, V(-.45, -.52, .84), Y, Z, -.07, .075,
                            lambda t: .075 * math.sin(math.pi * (.1 + .8 * t)) ** .5 + .006, 5, 5, .0015, .003, tan,
                            ray_axis=hax):
        parts.append(bind(p_, 'head'))
    # face
    parts.append(bind(sphere('Goat nose', (.034, .02, .022), (0, -.7, .715), nose_m, seg=8, rings=5), 'head'))
    for s in (1, -1):
        parts.append(bind(sphere(f'Goat nostril {s}', (.009, .006, .011), V(s * .018, -.718, .72), dark, seg=6, rings=4), 'head'))
    parts.append(bind(loft('Goat chin', [(0, -.55, .735, .055, .03), (0, -.63, .685, .05, .028), (0, -.675, .67, .036, .022)],
                           wool, n=8, sub=1, dome=(.5, .8)), 'jaw'))
    parts.append(bind(tube('Goat mouth', [V(-.038, -.64, .69), V(-.016, -.685, .69), V(0, -.693, .695), V(.016, -.685, .69),
                                          V(.038, -.64, .69)], .004, dark, verts=4), 'head'))
    parts.append(bind(sphere('Goat mouth inside', (.04, .06, .02), (0, -.6, .715), pink, seg=8, rings=4), 'head'))
    eyes = farm_eyes(parts, 'Goat', eyeC, eyeN, eyeR, ew, dark, iris, {'L': wool, 'R': wool}, look=(-.1, .0), lid_open=34,
                     iris_k=.95, pupil=.02, tall=.9)
    slit_pupils(parts, eyes, 'Goat', dark, w=.034, h=.012)
    # tuft between the horns
    parts.append(bind(puff('Goat forelock', V(0, -.4, .96), .05, wool, seg=7, rings=5, lump=.2, seed=2), 'head'))
    # ears (tan, pink inside), horns
    for s, sd in ((1, 'L'), (-1, 'R')):
        ear = leaf_ear(f'Goat ear {s}', sym(EARB, s), sym(EART, s), .055, .016, [tan, pink], Y,
                       mat_fn=lambda u, a: 1 if (math.sin(a) < -.35 and .4 < u < 3.4) else 0,
                       shape=((0, .7), (.3, 1.0), (.75, .8), (1, .1)))
        parts.append(bind_chain(ear, [('head', sym(EARB, s) - V(.03 * s, 0, 0), sym(EARB, s)), (f'ear_{sd}', sym(EARB, s), sym(EART, s))], .02))
        b0 = sym(V(.04, -.42, .93), s)
        pts = [b0 - V(0, 0, .02), b0 + sym(V(.012, .0, .05), s), b0 + sym(V(.03, .03, .105), s), b0 + sym(V(.04, .09, .14), s),
               b0 + sym(V(.032, .15, .145), s), b0 + sym(V(.02, .2, .12), s)]
        parts.append(bind(tube(f'Goat horn {s}', pts, .026, horn, verts=7, radius_fn=lambda t: 1 - .7 * t), 'head'))
        for k in range(1, 4):                 # growth ridges
            c = pts[k] + (pts[k + 1] - pts[k]) * .3
            d = (pts[k + 1] - pts[k]).normalized()
            parts.append(bind(cyl(f'Goat horn ridge {s}{k}', .0285 * (1 - .7 * (k / 5)), .008, c, horn, verts=7,
                                  rot=d.to_track_quat('Z', 'Y').to_euler()), 'head'))
    # beard and tail
    bk = [(beard[0].x, beard[0].y, beard[0].z, .02, .022), (beard[1].x, beard[1].y, beard[1].z, .027, .024),
          (beard[2].x, beard[2].y, beard[2].z, .012, .012)]
    bd = loft('Goat beard', bk, beard_m, n=7, sub=2, dome=(.5, 1.2))
    parts.append(bind_chain(bd, chain_segs('beard', beard, ('jaw', V(0, -.56, .72), beard[0])), .02))
    tl = loft('Goat tail', [(0, .38, .72, .034, .036), (0, .43, .8, .034, .036), (0, .445, .89, .016, .018)], [wool, tan], n=7, sub=2,
              dome=(.4, 1.0), mat_fn=lambda u, a: 1 if u > 1.5 else 0)
    parts.append(bind_chain(tl, chain_segs('tail', tail, ('hips', V(0, .34, .7), tail[0])), .02))
    # legs: white with tan stockings, dark cloven hooves
    def goat_hoof(s, sd, kind, bone):
        y, x = (-.215, .1) if kind == 'f' else (.27, .11)
        return [cyl(f'Goat {kind}hoof {s}{k}', .018, .05, V((x + dx) * s, y, .024), hoof, verts=7, r2=.02, bevel=.006)
                for k, dx in enumerate((-.013, .013))]
    fp = [SH + V(0, 0, .09), SH, EL, WR + V(0, .003, .08), WR, WR.lerp(FT, .5)]
    fr = [(.05, .065), (.052, .062), (.038, .042), (.03, .032), (.03, .031), (.031, .032)]
    hp = [HP + V(0, 0, .09), HP, KN, HK + V(0, .003, .08), HK, HK.lerp(HT, .5)]
    hr = [(.058, .08), (.06, .078), (.042, .046), (.031, .034), (.03, .031), (.031, .032)]
    mf = lambda u, a, s: 1 if u > 3.5 else 0
    build_legs(parts, 'Goat', (SH, EL, WR, FT), (HP, KN, HK, HT), fp, fr, hp, hr, [wool, tan], mat_fn=mf, hoof=goat_hoof,
               blend=.03, n=7)

    mesh = make_skin('goat', arm, parts, dict(rays=36, distance=.22, strength=.6, ground=0.0))

    # ---------------------------------------------------------------- animation
    P, T = quad_player(arm)
    TAILB = ['tail_1', 'tail_2']
    BEARD = ['beard_1', 'beard_2']

    def stand():
        return {k: (T[k].copy(), 0.0) for k in T}

    # Idle: chewing, beard swing, ear swivels, a look round, tail flicks, blinks
    def idle(p):
        pose = {'ik': stand()}
        br = S(p, 3)
        add(pose, 'spine', (.9 * br, 0, 0))
        add(pose, 'chest', (-.6 * br, 0, 0))
        lk = window(p, .3, .62, .25)
        add(pose, 'neck_1', (0, 0, 9 * lk))
        add(pose, 'neck_2', (-3 * lk, 0, 9 * lk))
        add(pose, 'head', (-3 * lk + 1.5 * S(p, 2), 4 * lk, 12 * lk))
        add(pose, 'jaw', (4 * (.5 + .5 * S(p, 10)), 0, 3 * S(p, 5)))
        add(pose, 'ear_L', (0, 0, -20 * pulse(p, .2, .03) + 4 * S(p, 3, .2)))
        add(pose, 'ear_R', (0, 0, 20 * pulse(p, .7, .03) - 4 * S(p, 3)))
        for i, nm in enumerate(BEARD):
            add(pose, nm, (6 * S(p, 10, -.1 * i), 0, 8 * S(p, 5, -.1 * i)))
        add(pose, 'tail_1', (-18 * pulse(p, .5, .04) - 12 * pulse(p, .58, .03), 0, 0))
        set_lids(pose, eyes, blink(p, (.1, .45, .85), .016), deg=105)
        return pose
    P.clip('Idle', 150, idle)

    # Walk: nimble four-beat, 1.0 m/s (authored at 1.0 / export scale)
    WF, WD = 22, .62
    sweep = 1.0 / K * WF / FPS * WD

    def walk(p):
        pose = {'ik': gait(P, T, p, {'HL': 0, 'FL': .25, 'HR': .5, 'FR': .75}, WD, sweep, (.075, .07), curl=(55, 38), roll=12,
                           offset={'FL': V(0, .0, 0), 'FR': V(0, .0, 0)})}
        add(pose, 'hips@loc', (0, 0, -.047 + .01 * C(p, 2, -.05)))
        add(pose, 'hips', (1.2 * S(p, 2), 2.5 * S(p, 1, .1), 3 * S(p, 1)))
        add(pose, 'chest', (-1 * S(p, 2), -2 * S(p, 1), -2 * S(p, 1, .15)))
        add(pose, 'neck_1', (2 + 2 * S(p, 2, .1), 0, 2 * S(p, 1, .3)))
        add(pose, 'neck_2', (2 * S(p, 2, .15), 0, 2 * S(p, 1, .3)))
        add(pose, 'head', (-2 - 3 * S(p, 2, .2), 0, 2 * S(p, 1, .4)))
        add(pose, 'ear_L', (0, 0, 7 * S(p, 2, .3)))
        add(pose, 'ear_R', (0, 0, -7 * S(p, 2, .3)))
        for i, nm in enumerate(BEARD):
            add(pose, nm, (8 * S(p, 2, -.15 * i), 0, 4 * S(p, 1, -.1 * i)))
        add(pose, 'tail_1', (-6 * S(p, 2, .1), 0, 6 * S(p, 1, .3)))
        set_lids(pose, eyes, 0, deg=105)
        return pose
    P.clip('Walk', WF, walk)
    foot_report(P, 'goat Walk', walk, WF, 1.0, K)

    # Graze: head down nibbling the grass, chewing, a quick look up
    def gz_body(k):
        pose = {'ik': stand()}
        pose['ik']['FL'] = (T['FL'] + V(0, -.05 * k, 0), 0)
        add(pose, 'hips@loc', (0, 0, -.06 * k))
        add(pose, 'chest', (15 * k, 0, 0))
        return pose
    GAIM = P.aim_chain(gz_body(1), ['neck_1', 'neck_2', 'head'], [V(0, -.38, .6), V(0, -.46, .44), V(0, -.52, .12)])

    def gz_base(k):
        pose = gz_body(k)
        for bn in ('neck_1', 'neck_2', 'head'):
            pose[bn] = Quaternion().slerp(GAIM[bn], k)
        return pose

    def graze(p):
        up = window(p, .62, .82, .3)
        dn = 1 - up
        pose = gz_base(dn)
        pose['head'] = Euler((D(5 * dn * S(p, 8)), 0, D(4 * dn * S(p, 1))), 'XYZ').to_quaternion() @ pose['head']
        add(pose, 'jaw', (7 * (.5 + .5 * S(p, 14)), 0, 3 * S(p, 7)))
        add(pose, 'ear_L', (0, 0, -18 * pulse(p, .3, .03) + 6 * up))
        add(pose, 'ear_R', (0, 0, 18 * pulse(p, .45, .03) - 6 * up))
        pose['head'] = Euler((D(-5 * up), 0, D(16 * up * S(p, 2, .1))), 'XYZ').to_quaternion() @ pose['head']
        for i, nm in enumerate(BEARD):
            add(pose, nm, (6 * S(p, 8, -.1 * i), 0, 0))
        add(pose, 'tail_1', (-14 * pulse(p, .7, .03), 0, 0))
        set_lids(pose, eyes, blink(p, (.3,), .015) + .15 * dn, deg=105)
        return pose
    P.clip('Graze', 150, graze)

    # Bleat (once): head thrown up, mouth wide, beard wagging, ears back
    def bleat(p):
        pose = idle(0.0)
        k = window(p, .08, .92, .26)
        b = window(p, .26, .8, .15)
        add(pose, 'chest', (-3 * k, 0, 0))
        add(pose, 'neck_1', (-12 * k, 0, 0))
        add(pose, 'neck_2', (-14 * k, 0, 0))
        add(pose, 'head', (-10 * k, 0, 3 * k))
        add(pose, 'jaw', (26 * b + 6 * b * S(p, 9), 0, 0))
        add(pose, 'ear_L', (0, 0, -20 * k + 6 * b * S(p, 9)))
        add(pose, 'ear_R', (0, 0, 20 * k - 6 * b * S(p, 9, .5)))
        for i, nm in enumerate(BEARD):
            add(pose, nm, (10 * b * S(p, 9, -.1 * i), 0, 26 * b * S(p, 4.5, -.12 * i)))
        pose['neck_2@scale'] = (1 + .04 * b * S(p, 9) ** 2, 1, 1 + .05 * b)
        add(pose, 'tail_1', (-16 * k, 0, 0))
        set_lids(pose, eyes, .55 * b, deg=105)
        return pose
    P.clip('Bleat', 60, bleat, loop=False)

    # Sleep: lying with the legs tucked, head turned back along the flank, chewing slowly
    def lie(dz):
        return {'ik': {'FL': (T['FL'] + V(-.03, -.1, .06), -75), 'FR': (T['FR'] + V(.03, -.1, .06), -75),
                       'HL': (T['HL'] + V(-.08, -.12, .06), -70), 'HR': (T['HR'] + V(.08, -.12, .06), -70)},
                'hips@loc': (0, 0, dz), 'chest': (-2, 0, 0), 'neck_1': (10, 0, 24), 'neck_2': (6, 0, 34), 'head': (6, 8, 34),
                'ear_L': (0, 0, 14), 'ear_R': (0, 0, -14)}
    ldz = lying_dz(P, mesh, lie, {'spine', 'chest', 'hips'}, start=-.2)

    def sleep(p):
        pose = lie(ldz)
        br = (S(p, 2, -.25) + 1) / 2
        pose['chest@scale'] = (1 + .03 * br, 1, 1 + .04 * br)
        pose['spine@scale'] = (1 + .035 * br, 1, 1 + .03 * br)
        pose['hips@loc'] = (0, 0, ldz + .004 * br)
        add(pose, 'ear_R', (0, 0, 14 * pulse(p, .7, .02)))
        add(pose, 'jaw', (2 * (.5 + .5 * S(p, 6)), 0, 0))
        add(pose, 'tail_1', (0, 0, 10 * pulse(p, .35, .05)))
        set_lids(pose, eyes, 1.0, deg=105)
        return pose
    P.clip('Sleep', 150, sleep)

    export_animal('goat', arm, P, scale=K)


def build_dog():
    """Village shiba: a cream-and-orange pup with urajiro white cheeks, muzzle, chest and socks, cream brow dots,
    pricked triangle ears, big shiny eyes, a fat curled tail, a darker sesame saddle and a red collar with a
    small brass bell. About 0.85 m nose to rump, 0.5 m at the back. Clips: Idle, Walk (1.1 m/s), Run (4.5 m/s
    gallop), Sit, Wag (sitting, big tail wag, 2 s, once), Bark (once, hop), Sleep (curled up)."""
    reset()
    fur = mat('Dog fur', '#ea8d3b', rough=.7)
    saddle_m = mat('Dog saddle', '#dc7a2e', rough=.72)
    cream = mat('Dog cream', '#fcf1de', rough=.72)
    nose_m = mat('Dog nose', '#2b2226', rough=.35)
    pink = mat('Dog tongue', '#ef7b8c', rough=.5)
    collar = mat('Dog collar', '#d7302a', rough=.5)
    brass = mat('Dog bell', '#e3a823', rough=.28, metal=.85)
    ew, dark, iris = eye_mats('Dog', '#3b2418')
    saddle_m = fur                             # shared materials keep the draw calls down (<= 8)
    nose_m = dark
    parts = []

    hk = [(0, -.3, .47, .088, .095), (0, -.35, .488, .122, .113), (0, -.405, .47, .116, .102), (0, -.44, .45, .09, .08)]
    head = loft('Dog head', hk, fur, n=14, sub=2, dome=(.8, .5))
    hs = Surface([head])
    muzzle = loft('Dog muzzle', [(0, -.4, .432, .078, .062), (0, -.48, .415, .064, .052), (0, -.53, .405, .054, .046)],
                  [cream, fur], n=12, sub=2, dome=(.3, .45), mat_fn=lambda u, a: 1 if math.sin(a) > .55 else 0)
    eyeN, eyeR = V(.75, -.6, .25), .027
    eyeC = seat_eye(hs, V(.062, -.425, .515), eyeN, eyeR, .4)

    SH, EL, WR, FT = V(.09, -.17, .33), V(.095, -.155, .2), V(.095, -.175, .085), V(.095, -.19, 0)
    HP, KN, HK, HT = V(.09, .2, .33), V(.105, .15, .2), V(.105, .22, .1), V(.105, .2, 0)
    bones = [('root', (0, 0, 0), (0, 0, .2), None),
             ('hips', (0, .27, .35), (0, .08, .32), 'root'),
             ('spine', (0, .08, .32), (0, -.1, .33), 'hips'),
             ('chest', (0, -.1, .33), (0, -.24, .36), 'spine'),
             ('neck', (0, -.25, .38), (0, -.31, .45), 'chest'),
             ('head', (0, -.31, .47), (0, -.54, .4), 'neck'),
             ('jaw', (0, -.41, .4), (0, -.52, .38), 'head'),
             ('bell', (0, -.275, .325), (0, -.275, .285), 'neck')]
    tail = [V(0, .3, .38), V(0, .37, .43), V(0, .385, .52), V(0, .335, .575), V(0, .27, .56)]
    chain_bones(bones, 'tail', tail, 'hips')
    lid_bones(bones, eyeC, eyeN)
    EARB, EART = V(.058, -.355, .56), V(.085, -.335, .665)
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear_{sd}', sym(EARB, s), sym(EART, s), 'head'))
    leg_bones(bones, (SH, EL, WR, FT), (HP, KN, HK, HT))
    arm = build_armature('Dog', bones)
    segs = [('hips', V(0, .36, .38), V(0, .08, .32)), ('spine', V(0, .08, .32), V(0, -.1, .33)),
            ('chest', V(0, -.1, .33), V(0, -.24, .36)), ('neck', V(0, -.25, .38), V(0, -.31, .45)),
            ('head', V(0, -.31, .47), V(0, -.37, .48))]
    parts.append(bind(head, 'head'))
    parts.append(bind(muzzle, 'head'))

    tk = [(0, .29, .36, .075, .095), (0, .22, .35, .128, .148), (0, .07, .32, .152, .162), (0, -.09, .33, .157, .166),
          (0, -.2, .36, .134, .152), (0, -.265, .41, .1, .11), (0, -.3, .46, .09, .1)]
    body = loft('Dog body', tk, [fur, cream], n=14, sub=2, dome=(.8, 0),
                mat_fn=lambda u, a: 1 if (math.sin(a) < -.55 or (u > 3.9 and math.sin(a) < .2)) else 0)
    parts.append(bind_chain(body, segs, .05))
    surf = Surface([body])
    axz = .33
    for p_ in conform_patch('Dog saddle', surf, V(0, 0, .62), X, Y, -.2, .24,
                            lambda t: .2 * math.sin(math.pi * (.06 + .88 * t)) ** .45 + .012, 7, 6, .0015, .003, saddle_m,
                            center_fn=lambda t: .012 * math.sin(4 * t), ray_axis=lambda q: V(0, q.y, axz)):
        parts.append(bind_chain(p_, segs, .05))
    # face: nose, mouth, chin, tongue, cheek fluff, brow dots
    parts.append(bind(sphere('Dog nose', (.03, .022, .022), (0, -.548, .412), nose_m, seg=10, rings=6), 'head'))
    parts.append(bind(tube('Dog mouth', [V(-.052, -.455, .385), V(-.03, -.505, .379), V(-.012, -.528, .39), V(0, -.534, .396), V(.012, -.528, .39), V(.03, -.505, .379),
                                         V(.052, -.455, .385)], .0028, dark, verts=4), 'head'))
    parts.append(bind(rod('Dog philtrum', V(0, -.55, .405), V(0, -.546, .393), .0028, dark, verts=4), 'head'))
    parts.append(bind(loft('Dog chin', [(0, -.41, .405, .06, .026), (0, -.47, .385, .052, .022), (0, -.515, .38, .036, .018)],
                           cream, n=8, sub=1, dome=(.5, .8)), 'jaw'))
    parts.append(bind(sphere('Dog tongue', (.022, .045, .009), (0, -.47, .39), pink, seg=8, rings=4), 'jaw'))
    for s in (1, -1):
        parts.append(bind(puff(f'Dog cheek {s}', V(s * .075, -.4, .43), .042, cream, seg=8, rings=5, lump=.16, seed=7 + s),
                          'head'))
        for k, (dx, dy, dz) in enumerate(((.05, .0, -.035), (.07, .03, -.005))):
            parts.append(bind(hs.tuft(f'Dog cheek tuft {s}{k}', V(s * (.1 + dx * .4), -.4 + dy, .42 + dz), V(s * .5, .9, -.25),
                                      .065, .026, cream, lift=.3, flat=.55, tip=.2), 'head'))
        parts.append(bind(hs.spot(f'Dog brow dot {s}', V(s * .1, -.45, .56), (.014, .011), cream, thick=.3,
                                  dirn=V(-s * .3, 0, -1)), 'head'))
    eyes = farm_eyes(parts, 'Dog', eyeC, eyeN, eyeR, ew, dark, iris, {'L': fur, 'R': fur}, look=(-.08, .02), lid_open=36,
                     iris_k=1.1, pupil=.78, tall=1.0, shine=.26, glint2=False)
    # ears: pricked triangles, orange outside, cream inside
    for s, sd in ((1, 'L'), (-1, 'R')):
        ear = leaf_ear(f'Dog ear {s}', sym(EARB, s), sym(EART, s), .048, .026, [fur, cream], X,
                       mat_fn=lambda u, a: 1 if (math.sin(a) < -.2 and .25 < u < 1.8) else 0,
                       shape=((0, 1.0), (.5, .78), (1.0, .08)))
        parts.append(bind_chain(ear, [('head', sym(EARB, s) - V(0, 0, .03), sym(EARB, s)), (f'ear_{sd}', sym(EARB, s), sym(EART, s))],
                                .02))
    parts.append(bind(puff('Dog chest fluff', V(0, -.27, .335), .062, cream, seg=8, rings=5, lump=.18, seed=11), 'chest'))
    # curled tail
    tk2 = [(0, .3, .38, .03, .034), (0, .37, .43, .036, .04), (0, .385, .52, .042, .046), (0, .335, .575, .04, .044),
           (0, .27, .56, .03, .033)]
    tl = loft('Dog tail', tk2, [fur, cream], n=9, sub=2, dome=(0, 1.0), mat_fn=lambda u, a: 1 if u > 3.1 else 0)
    parts.append(bind_chain(tl, chain_segs('tail', tail, ('hips', V(0, .26, .36), tail[0])), .03))
    # collar and bell
    for p_ in (band('Dog collar', Surface([body]), V(0, -.275, .41), V(0, -.06, .07), collar, width=.026, grow=.005),):
        parts.append(bind_chain(p_, segs, .02))
    parts.append(bind(tube('Dog bell strap', [V(0, -.28, .328), V(0, -.28, .312), V(0, -.28, .3)], .005, collar, verts=5), 'neck'))
    bell = lathe('Dog bell', [(0, .02), (.016, .018), (.022, .0), (.026, -.02), (.028, -.028), (0, -.028)], brass, seg=12,
                 loc=V(0, -.28, .278))
    parts.append(bind(bell, 'bell'))

    # legs: orange with cream socks, cream paws
    def dog_paw(s, sd, kind, bone):
        y, x = (-.19, .095) if kind == 'f' else (.2, .105)
        return paw(f'Dog {kind}paw {s}', V(x * s, y - .006, .026), (.034, .05, .026), cream, toes=3, seg=8, rings=5)
    fp = [SH + V(0, 0, .07), SH, EL, WR + V(0, .003, .05), WR, WR.lerp(FT, .45)]
    fr = [(.05, .058), (.05, .057), (.037, .041), (.031, .033), (.031, .032), (.033, .033)]
    hp = [HP + V(0, 0, .07), HP, KN, HK + V(0, .003, .05), HK, HK.lerp(HT, .45)]
    hr = [(.06, .078), (.062, .074), (.043, .048), (.033, .036), (.032, .033), (.033, .033)]
    mf = lambda u, a, s: 1 if u > 2.5 else 0
    build_legs(parts, 'Dog', (SH, EL, WR, FT), (HP, KN, HK, HT), fp, fr, hp, hr, [fur, cream], mat_fn=mf, hoof=dog_paw, blend=.03,
               n=7, top=.06)

    mesh = make_skin('dog', arm, parts, dict(rays=36, distance=.15, strength=.6, ground=0.0))

    # ---------------------------------------------------------------- animation
    P, T = quad_player(arm)
    TAILB = ['tail_1', 'tail_2', 'tail_3', 'tail_4']

    def stand():
        return {k: (T[k].copy(), 0.0) for k in T}

    def tail_wag(pose, amp, p, cycles, lag=.08, base=(0, 0, 0)):
        for i, nm in enumerate(TAILB):
            add(pose, nm, (base[0], base[1], amp * (.5 + .22 * i) * S(p, cycles, -lag * i)))
        return pose

    # Idle: panting-calm breathing, ear swivels, head tilt, tail wiggles, blinks
    def idle(p):
        pose = {'ik': stand()}
        br = S(p, 3)
        add(pose, 'spine', (.8 * br, 0, 0))
        add(pose, 'chest', (-.5 * br, 0, 0))
        lk = window(p, .35, .65, .25)
        add(pose, 'neck', (-3 * lk, 0, 8 * lk))
        add(pose, 'head', (-3 * lk, 12 * lk, 14 * lk))
        add(pose, 'jaw', (2.0 * (.5 + .5 * S(p, 6)) * window(p, .0, .3, .3), 0, 0))
        add(pose, 'ear_L', (-16 * pulse(p, .2, .03), 0, 12 * pulse(p, .2, .03)))
        add(pose, 'ear_R', (-16 * pulse(p, .75, .03), 0, -12 * pulse(p, .75, .03)))
        tail_wag(pose, 8, p, 2, base=(0, 0, 0))
        add(pose, 'bell', (3 * S(p, 3, .2), 0, 0))
        set_lids(pose, eyes, blink(p, (.1, .55, .88), .016), deg=105)
        return pose
    P.clip('Idle', 150, idle)

    # Walk: trotty four-beat, 1.1 m/s, tail bobbing
    WF, WD = 16, .6
    K = .88                                    # export scale -> ~0.88 m nose to tail tip
    sweep = 1.1 / K * WF / FPS * WD

    def walk(p):
        pose = {'ik': gait(P, T, p, {'HL': 0, 'FL': .25, 'HR': .5, 'FR': .75}, WD, sweep, (.06, .055), curl=(55, 38), roll=12)}
        add(pose, 'hips@loc', (0, 0, -.057 + .008 * C(p, 2, -.05)))
        add(pose, 'hips', (1.5 * S(p, 2), 3 * S(p, 1, .1), 3 * S(p, 1)))
        add(pose, 'spine', (0, 0, -2 * S(p, 1, .1)))
        add(pose, 'chest', (-1 * S(p, 2), -2.5 * S(p, 1), -2.5 * S(p, 1, .15)))
        add(pose, 'neck', (2 + 2 * S(p, 2, .1), 0, 2 * S(p, 1, .3)))
        add(pose, 'head', (-2 - 2.5 * S(p, 2, .15), 0, 2 * S(p, 1, .35)))
        add(pose, 'ear_L', (5 * S(p, 2, .3), 0, 0))
        add(pose, 'ear_R', (5 * S(p, 2, .3), 0, 0))
        tail_wag(pose, 10, p, 2, base=(0, 0, 0))
        add(pose, 'bell', (12 * S(p, 2, .1), 0, 0))
        set_lids(pose, eyes, 0, deg=105)
        return pose
    P.clip('Walk', WF, walk)
    foot_report(P, 'dog Walk', walk, WF, 1.1, K)

    # Run: rotary gallop with spine flex and a gathered suspension, 4.5 m/s
    RF, RD = 9, .22
    rsweep = 4.5 / K * RF / FPS * RD

    def run(p):
        pose = {'ik': gait(P, T, p, {'HL': 0, 'HR': .1, 'FR': .44, 'FL': .54}, RD, rsweep, (.09, .08), curl=(75, 50), roll=18,
                           tangent=.4, offset={'FL': V(0, .03, 0), 'FR': V(0, .03, 0)})}
        flex = C(p, 1, -.93)
        add(pose, 'hips@loc', (0, 0, -.07 + .035 * C(p, 1, -.88)))
        add(pose, 'hips', (-4 * flex + 2 * S(p, 1, .1), 0, 0))
        add(pose, 'spine', (7 * flex, 0, 0))
        add(pose, 'chest', (3 * flex, 0, 0))
        add(pose, 'neck', (-3 - 4 * flex, 0, 0))
        add(pose, 'head', (6 + 2 * flex, 0, 0))
        add(pose, 'ear_L', (40, 0, -8 + 6 * S(p, 1)))
        add(pose, 'ear_R', (40, 0, 8 - 6 * S(p, 1)))
        add(pose, 'jaw', (10 * (.5 + .5 * S(p, 1, .2)), 0, 0))
        for i, nm in enumerate(TAILB):
            add(pose, nm, (-8 + 3 * i, 0, 5 * S(p, 1, -.1 * i)))
        add(pose, 'bell', (18 * S(p, 1, .1), 0, 0))
        set_lids(pose, eyes, 0, deg=105)
        return pose
    P.clip('Run', RF, run)
    foot_report(P, 'dog Run', run, RF, 4.5, K)

    # Sit: bum down, forelegs straight, hind feet flat, tail curled behind
    def sit_pose():
        pose = {'ik': {'FL': (T['FL'] + V(0, .045, 0), 0), 'FR': (T['FR'] + V(0, .045, 0), 0),
                       'HL': (T['HL'] + V(.01, -.07, 0), -62), 'HR': (T['HR'] + V(-.01, -.07, 0), -62)}}
        add(pose, 'hips@loc', (0, .05, -.24))
        add(pose, 'hips', (-29, 0, 0))
        add(pose, 'spine', (-5, 0, 0))
        add(pose, 'chest', (-2, 0, 0))
        add(pose, 'neck', (14, 0, 0))
        add(pose, 'head', (16, 0, 0))
        return pose

    def sit(p):
        pose = sit_pose()
        br = S(p, 2)
        add(pose, 'chest', (-.8 * br, 0, 0))
        add(pose, 'head', (-3 * pulse(p, .45, .12), 0, 8 * pulse(p, .45, .14)))
        add(pose, 'ear_L', (-16 * pulse(p, .2, .03), 0, 10 * pulse(p, .2, .03)))
        add(pose, 'ear_R', (-16 * pulse(p, .62, .03), 0, -10 * pulse(p, .62, .03)))
        tail_wag(pose, 6, p, 1)
        add(pose, 'jaw', (3 * window(p, .7, .95, .3) * (.5 + .5 * S(p, 6)), 0, 0))
        set_lids(pose, eyes, blink(p, (.3, .9), .02), deg=105)
        return pose
    P.clip('Sit', 90, sit)

    # Wag (once, 2 s): sitting and wagging the whole tail hard, ears up, happy head tilt, pant
    def wag(p):
        pose = sit_pose()
        k = min(1.0, smooth(p / .1)) * min(1.0, smooth((1 - p) / .1))
        tail_wag(pose, 38 * k, p, 6, lag=.07)
        add(pose, 'hips', (0, 0, 4 * k * S(p, 6, .05)))
        add(pose, 'chest', (-1.2 * S(p, 2), 0, -2 * k * S(p, 6, .2)))
        add(pose, 'head', (-6 * k, 10 * k * S(p, 1.5), 4 * k * S(p, 3)))
        add(pose, 'neck', (-3 * k, 0, 0))
        add(pose, 'ear_L', (-6 * k, 0, 8 * k + 3 * S(p, 3)))
        add(pose, 'ear_R', (-6 * k, 0, -8 * k - 3 * S(p, 3)))
        add(pose, 'jaw', (7 * k * (.5 + .5 * S(p, 6, .1)), 0, 0))
        add(pose, 'bell', (8 * k * S(p, 6, .1), 0, 0))
        set_lids(pose, eyes, blink(p, (.35, .8), .02), deg=105)
        return pose
    P.clip('Wag', 60, wag, loop=False)

    # Bark (once): a crouch, a hop with the head thrown up and the mouth open, then settle
    def bark(p):
        cr = window(p, .0, .28, .6)
        hop = math.sin(math.pi * max(0.0, min(1.0, (p - .22) / .3))) if .22 < p < .52 else 0.0
        land = window(p, .5, .72, .5)
        h = .075 * hop
        pose = {'ik': {}}
        for k in T:
            lift = h * (1.1 if k[0] == 'F' else 1.0)
            tuck = 20 * hop
            pose['ik'][k] = (T[k] + V(0, -.04 * hop if k[0] == 'H' else .05 * hop, lift), tuck if k[0] == 'F' else -tuck * .5)
        add(pose, 'hips@loc', (0, 0, -.025 * cr - .02 * land + h + 0.0))
        k2 = window(p, .1, .85, .3)
        m = max(pulse(p, .36, .07), pulse(p, .5, .06))
        add(pose, 'chest', (6 * cr - 8 * hop - 3 * m, 0, 0))
        add(pose, 'neck', (8 * cr - 14 * k2, 0, 0))
        add(pose, 'head', (6 * cr - 12 * k2 - 6 * m, 0, 0))
        add(pose, 'jaw', (28 * m, 0, 0))
        add(pose, 'ear_L', (-10 * k2, 0, 8 * k2))
        add(pose, 'ear_R', (-10 * k2, 0, -8 * k2))
        for i, nm in enumerate(TAILB):
            add(pose, nm, (-6 * hop, 0, 6 * k2 * S(p, 4, -.1 * i)))
        add(pose, 'bell', (20 * hop, 0, 0))
        set_lids(pose, eyes, .3 * m, deg=105)
        return pose
    P.clip('Bark', 36, bark, loop=False)

    # Sleep: curled up on the ground like a donut, chin on the paws, tail wrapped round
    def curl(dz):
        pose = {'ik': {'FL': (T['FL'] + V(-.02, .02, .04), -80), 'FR': (T['FR'] + V(.02, .0, .04), -80),
                       'HL': (T['HL'] + V(.0, -.07, .0), -62), 'HR': (T['HR'] + V(-.02, -.07, 0), -62)},
                'hips@loc': (0, 0, dz), 'spine': (0, 0, 8), 'chest': (10, 0, 22), 'neck': (30, 0, 26), 'head': (4, 14, 26),
                'ear_L': (20, 0, -12), 'ear_R': (20, 0, 12)}
        return pose
    ldz = lying_dz(P, mesh, curl, {'spine', 'chest', 'hips'}, start=-.2, margin=.004)
    WRAP = [V(.1, .36, .06), V(.18, .3, .06), V(.19, .18, .06), V(.17, .08, .05)]

    def sleep(p):
        pose = curl(ldz)
        pose = P.aim_chain(pose, TAILB, WRAP)
        br = (S(p, 2, -.25) + 1) / 2
        pose['chest@scale'] = (1 + .04 * br, 1, 1 + .05 * br)
        pose['spine@scale'] = (1 + .05 * br, 1, 1 + .04 * br)
        pose['hips@loc'] = (0, 0, ldz + .004 * br)
        add(pose, 'ear_R', (-12 * pulse(p, .7, .02), 0, 0))
        pose['tail_4'] = Quaternion(Z, D(12 * pulse(p, .3, .05))) @ pose['tail_4']
        set_lids(pose, eyes, 1.0, deg=105)
        return pose
    P.clip('Sleep', 150, sleep)

    export_animal('dog', arm, P, scale=K)
# FARM-END


BUILDERS = {'fox': build_fox, 'bear': build_bear, 'sheep': build_sheep, 'crab': build_crab, 'crow': build_crow, 'fish-trout': build_trout, 'fish-starfin': build_starfin, 'fish-koi': build_koi, 'chicken': build_chicken, 'rabbit': build_rabbit, 'cat': build_cat, 'duck': build_duck, 'deer': build_deer,
            'cow': build_cow, 'pig': build_pig, 'goat': build_goat, 'dog': build_dog}


def main():
    for nm in ONLY:
        if nm not in BUILDERS:
            print('SKIP (no builder yet)', nm)
            continue
        BUILDERS[nm]()
    print('RESULTS')
    for nm, r in RESULTS.items():
        print(f'  {nm:14s} {r["tris"]:6d} tris {r["kb"]:5d} KB mats={r["mats"]} clips={r["clips"]} ik={r["ik"]}')
    if not NO_SAVE:
        have = [n for n in ALL if os.path.exists(os.path.join(OUT, n + '.glb'))]
        save_kit('animals', have, spacing=1.0)


main()
