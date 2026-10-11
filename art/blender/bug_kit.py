"""Shared leg rigging for the Starline bugs (cricket, grasshopper, mantis; the beetles in build_tricks2.py use the same maths).

A leg is two bones: `leg` (hip > knee, the thigh) and `shin` (knee > claw). Walk, Idle and the rest are not authored by
hand: for every frame the clip asks "where should the claw be?" and `leg_ik` returns the two rotations that put it there,
so a planted claw stays exactly where it is while the body breathes, sways or rears over it.

  planted(L, p)  -> claw position in ARMATURE space (the world: a planted foot does not move with the body)
  local(L, p)    -> claw position in the BODY's rest space, or None (a raised leg, a kicking leg, a leg held in the air)

Armature space is the space the bones were built in (z up, the bug faces -Y). `head` is the body bone's head: the body
rotates about it, `body_rot(p)` in degrees XYZ as rig.clip expects, `body_loc(p)` in metres.
"""
import math
from mathutils import Vector, Euler, Quaternion

CLAMPED = [0]            # targets that were out of reach (a straight leg is returned); strict clips assert this is 0


def V(*a):
    return Vector(a)


def sx(p, s):
    return Vector((p[0] * s, p[1], p[2]))


def make_legs(specs):
    """specs: [{n, hip, knee, foot, leg=None, shin=None, tag=None}] for the LEFT side (+X); both sides are returned.
    Default bone names are leg{n}_{L|R} and shin{n}_{L|R}; `tag` overrides n in the planted-gait group test."""
    legs = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        for sp in specs:
            n = sp['n']
            legs.append(dict(n=n, sd=sd, leg=(sp.get('leg') or f'leg{n}') + f'_{sd}', shin=(sp.get('shin') or f'shin{n}') + f'_{sd}',
                             hip=sx(sp['hip'], s), knee=sx(sp['knee'], s), foot=sx(sp['foot'], s)))
    return legs


def leg_bones(legs, parent='body'):
    return [b for L in legs for b in ((L['leg'], L['hip'], L['knee'], parent), (L['shin'], L['knee'], L['foot'], L['leg']))]


def q_deg(q):
    e = q.to_euler('XYZ')
    return (math.degrees(e.x), math.degrees(e.y), math.degrees(e.z))


def leg_ik(L, T):
    """Two-bone IK in the body's rest space: put the claw on T, the knee bending the way it is modelled. Returns the
    rotations rig.clip wants (about armature axes): the thigh's, and the shin's on top of it."""
    H, K0, F0 = L['hip'], L['knee'], L['foot']
    a, b = (K0 - H).length, (F0 - K0).length
    d = T - H
    dl = max(abs(a - b) + 1e-5, min(a + b - 1e-5, d.length))
    if abs(dl - d.length) > 1e-7:
        CLAMPED[0] += 1
    u = d.normalized()
    pole = (K0 - H) - u * (K0 - H).dot(u)
    if pole.length < 1e-7:
        pole = Vector((0, 0, 1)) - u * u.z
    pole.normalize()
    ca = (a * a + dl * dl - b * b) / (2 * a * dl)
    K = H + (u * ca + pole * math.sqrt(max(0.0, 1 - ca * ca))) * a
    q1 = (K0 - H).rotation_difference(K - H)
    q2 = (q1 @ (F0 - K0)).rotation_difference(H + u * dl - K) @ q1
    return q1, q1.inverted() @ q2


def solve_legs(legs, head, body_rot, body_loc, planted, local=None):
    """Clip channels for every thigh and shin."""
    ch = {}
    for L in legs:
        def sol(p, L=L):
            T = local(L, p) if local else None
            if T is None:
                qb = Euler([math.radians(x) for x in body_rot(p)], 'XYZ').to_quaternion()
                T = head + qb.inverted() @ (planted(L, p) - head - Vector(body_loc(p)))
            return leg_ik(L, T)
        ch[L['leg']] = lambda p, f=sol: q_deg(f(p)[0])
        ch[L['shin']] = lambda p, f=sol: q_deg(f(p)[1])
    return ch


def body_xform(head, body_rot, body_loc, p, v):
    """Where a point v of the body's rest space is at time p (for targets that follow the body)."""
    qb = Euler([math.radians(x) for x in body_rot(p)], 'XYZ').to_quaternion()
    return head + qb @ (v - head) + Vector(body_loc(p))


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def stride_target(L, p, group_a, stride, duty, lift, off=0.0, foot=None):
    """A claw that is planted for `duty` of the loop, travelling straight back `stride`, then lifts and swings forward.
    group_a is the set of (n, side) that step first; the others are half a loop behind."""
    ph = (p + off + (0 if (L['n'], L['sd']) in group_a else .5)) % 1.0
    f = L['foot'] if foot is None else foot
    if ph < duty:
        return f + Vector((0, stride * (ph / duty - .5), 0))
    u = (ph - duty) / (1 - duty)
    return f + Vector((0, stride * (.5 - smooth(u)), lift * math.sin(math.pi * u)))


def to_body(head, body_rot, body_loc, p, world):
    """A point of the world (armature space) expressed in the body's rest space at time p: a planted claw as the
    body sees it."""
    qb = Euler([math.radians(x) for x in body_rot(p)], 'XYZ').to_quaternion()
    return head + qb.inverted() @ (world - head - Vector(body_loc(p)))


def skinned_leg(tube_fn, name, L, pts, radii, material, verts=3, leg_rings=2, squash=1.0):
    """One tube hip > knee > claw (points `pts`, radius per point). The first `leg_rings` rings (hip .. knee) ride the
    thigh bone, the rest the shin bone, so the knee bends without a gap and the claw sits where the shin puts it.
    The last ring is a point-like tip: pass a tiny radius. Returns the (unbound, unpainted) object."""
    n = len(pts) - 1
    ob = tube_fn(name, pts, 1.0, material, verts=verts, caps=False, squash=squash,
                 radius_fn=lambda t: radii[min(len(radii) - 1, int(round(t * n)))])
    ob.vertex_groups.new(name=L['leg']).add(list(range(0, leg_rings * verts)), 1.0, 'REPLACE')
    ob.vertex_groups.new(name=L['shin']).add(list(range(leg_rings * verts, len(pts) * verts)), 1.0, 'REPLACE')
    return ob
