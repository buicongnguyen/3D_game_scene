"""Shared helpers for the Starline farm animals (cow, pig, goat, dog) built in build_animals.py.

Everything here is pure toolkit: leg lofts + bone chains for a standard four-legged rig, a body-girth probe for
collars, curled tails, floppy ears, a "lying down" solver that lowers the hips until the belly rests on the
ground, and a few pose-shaping helpers. build_animals.py star-imports this after animal_kit.
"""
import math
from mathutils import Vector, Quaternion, Euler
from kit import *  # noqa: F401,F403
from rig import bind
from animal_kit import *  # noqa: F401,F403


def V(*a):
    return Vector(a)


def sym(p, s):
    return Vector((p[0] * s, p[1], p[2]))


def leg_bones(bones, F, H, parent_f='chest', parent_h='hips'):
    """Append the six leg bones per side. F = (shoulder, elbow, wrist, foot-tip), H = (hip, knee, hock, toe) (left side)."""
    SH, EL, WR, FT = F
    HP, KN, HK, HT = H
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'upperarm_{sd}', sym(SH, s), sym(EL, s), parent_f),
                  (f'forearm_{sd}', sym(EL, s), sym(WR, s), f'upperarm_{sd}'),
                  (f'paw_{sd}', sym(WR, s), sym(FT, s), f'forearm_{sd}'),
                  (f'thigh_{sd}', sym(HP, s), sym(KN, s), parent_h),
                  (f'shin_{sd}', sym(KN, s), sym(HK, s), f'thigh_{sd}'),
                  (f'foot_{sd}', sym(HK, s), sym(HT, s), f'shin_{sd}')]


def lofted(name, pts, radii, mats, mat_fn=None, n=8, sub=2, dome=(.5, 0), side=X):
    keys = [(p[0], p[1], p[2], r[0], r[1]) for p, r in zip(pts, radii)]
    return loft(name, keys, mats, n=n, sub=sub, dome=dome, mat_fn=mat_fn, side=side)


def build_legs(parts, species, F, H, fpts, frad, hpts, hrad, mats, mat_fn=None, hoof=None, blend=.035, n=8,
               top=.15):
    """Lofted legs bound along their IK chains. fpts/hpts are left-side centre lines (any number of points, starting
    above the shoulder/hip); frad/hrad the matching (w, h) half sizes. mat_fn(u, a, s) -> material index.
    hoof(s, sd, kind, bone) is called per leg to add feet (kind 'f' or 'h') and must return a list of parts."""
    SH, EL, WR, FT = F
    HP, KN, HK, HT = H
    for s, sd in ((1, 'L'), (-1, 'R')):
        mf = (lambda u, a, s=s: mat_fn(u, a, s)) if mat_fn else None
        fl = lofted(f'{species} foreleg {s}', [sym(p, s) for p in fpts], frad, mats, mf, n=n)
        fsegs = [('chest', sym(SH + V(0, 0, top), s), sym(SH, s)), (f'upperarm_{sd}', sym(SH, s), sym(EL, s)),
                 (f'forearm_{sd}', sym(EL, s), sym(WR, s)), (f'paw_{sd}', sym(WR, s), sym(FT, s))]
        parts.append(bind_chain(fl, fsegs, blend))
        hl = lofted(f'{species} hindleg {s}', [sym(p, s) for p in hpts], hrad, mats, mf, n=n)
        hsegs = [('hips', sym(HP + V(0, 0, top), s), sym(HP, s)), (f'thigh_{sd}', sym(HP, s), sym(KN, s)),
                 (f'shin_{sd}', sym(KN, s), sym(HK, s)), (f'foot_{sd}', sym(HK, s), sym(HT, s))]
        parts.append(bind_chain(hl, hsegs, blend))
        if hoof:
            for kind, bone in (('f', f'paw_{sd}'), ('h', f'foot_{sd}')):
                for p_ in hoof(s, sd, kind, bone):
                    parts.append(bind(p_, bone))


def quad_player(arm):
    P = Player(arm)
    for sd in 'LR':
        P.leg(f'F{sd}', f'upperarm_{sd}', f'forearm_{sd}', f'paw_{sd}')
        P.leg(f'H{sd}', f'thigh_{sd}', f'shin_{sd}', f'foot_{sd}')
    T = {k: v['T'].copy() for k, v in P.legs.items()}
    return P, T


def girth(surf, p, tang=None):
    """Half width (X) and half height (along the section's up) of a body surface around centre p."""
    p = Vector(p)
    _, nx = surf.ray(p + X * 1.0, -X, 2.0)
    lx, _ = surf.ray(p + X * 1.0, -X, 2.0)
    lz, _ = surf.ray(p + Z * 1.0, -Z, 2.0)
    lb, _ = surf.ray(p - Z * 1.0, Z, 2.0)
    return abs(lx.x - p.x), (lz.z - lb.z) / 2, (lz.z + lb.z) / 2


def band(name, surf, centre, tang, mat_, width=.05, grow=.012, n=14):
    """A collar: a short elliptical tube hugging the body at `centre`, along the neck/body tangent."""
    t = Vector(tang).normalized()
    w, h, zc = girth(surf, centre)
    c = Vector(centre)
    c.z = zc
    keys = [(c.x - t.x * width / 2, c.y - t.y * width / 2, c.z - t.z * width / 2, w + grow, h + grow),
            (c.x, c.y, c.z, w + grow * 1.2, h + grow * 1.2),
            (c.x + t.x * width / 2, c.y + t.y * width / 2, c.z + t.z * width / 2, w + grow, h + grow)]
    return loft(name, keys, mat_, n=n, sub=1, dome=(0, 0))


def leaf_ear(name, base, tip, w, thick, mats, side, mat_fn=None, shape=((0, 1.0), (.35, 1.0), (.75, .72), (1.0, .08)),
             n=8, back=.03, bone='head'):
    """A rounded ear lobe from base to tip. shape = [(t, width factor)]. Returns (loft, chain segments) for bind_chain."""
    base, tip = Vector(base), Vector(tip)
    ek = []
    for t, f in shape:
        c = base.lerp(tip, t)
        ek.append((c.x, c.y, c.z, w * f, thick * (1 - .35 * t)))
    ear = loft(name, ek, mats, n=n, sub=2, side=side, dome=(0, .7), mat_fn=mat_fn)
    return ear


def curl_points(c, r, a0, a1, count, axis_u, axis_v, climb=Vector((0, 0, 0)), shrink=1.0):
    """Points on a (shrinking) spiral: c + (u cos + v sin) r + climb * t."""
    pts = []
    for i in range(count):
        t = i / (count - 1)
        a = math.radians(a0 + (a1 - a0) * t)
        rr = r * (1 - (1 - shrink) * t)
        pts.append(Vector(c) + (axis_u * math.cos(a) + axis_v * math.sin(a)) * rr + climb * t)
    return pts


def lying_dz(P, mesh, pose_fn, bones, start=-.2, iters=3, margin=.004):
    """Lower the hips (hips@loc z) until the lowest vertex of `bones` (belly/chest/hips) just touches z=0.
    pose_fn(dz) -> pose dict that includes 'hips@loc'."""
    dz = start
    for _ in range(iters):
        dz -= P.low_point(mesh, pose_fn(dz), bones) - margin
    return dz


def wave_chain(pose, names, p, amp, cycles=1.0, lag=.1, axis=2, grow=.3):
    """Travelling wave along a bone list (tails)."""
    for i, nm in enumerate(names):
        v = [0.0, 0.0, 0.0]
        v[axis] = amp * (.6 + grow * i) * S(p, cycles, -lag * i)
        add(pose, nm, tuple(v))
    return pose


def foot_report(P, label, pose_fn, frames, speed, K=1.0, tol=.004):
    """Self-check for a gait clip: samples every frame, solves the IK and reports the world speed of each foot
    contact point while it is on the ground (should equal `speed` in m/s, no sliding)."""
    dt = 1.0 / FPS
    out = []
    for leg, L in P.legs.items():
        bone, tip = L['bones'][2], L['T']
        pts = []
        for f in range(frames):
            rots, locs, scales = P.pose_quats(pose_fn(f / frames))
            M = P._fk(rots, locs, scales)
            w = M[bone] @ P.rest[bone].inverted() @ tip
            pts.append((w.y * K, w.z * K))
        vs = []
        for i in range(frames):
            a, b = pts[i], pts[(i + 1) % frames]
            if a[1] < tol * K and b[1] < tol * K:
                vs.append((b[0] - a[0]) / dt)
        if vs:
            out.append(f'{leg} on ground {len(vs)}/{frames} frames, speed {min(vs):.2f}..{max(vs):.2f} (mean {sum(vs) / len(vs):.2f})')
        else:
            out.append(f'{leg} never reaches the ground')
    print(f'FOOTCHECK {label} target {speed} m/s: ' + ' | '.join(out))
