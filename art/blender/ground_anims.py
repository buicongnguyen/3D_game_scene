"""Ground interactions shared by Mika and the village kids. Metres, 30 fps, root stays at zero."""
import math
from mathutils import Vector
from anims import sn, cs, smooth, clamp, bump
from human_lib import eul

V = Vector
GROUND_CLIPS = ['Crouch', 'CrouchWalk', 'CrouchReach', 'CrouchReachHold', 'Kneel', 'Pickup', 'SitGrass']


def squat(A, p, breathe=True):
    k = A.k
    hip_z = (A.hip['L'].z + A.hip['R'].z) / 2
    br = 0.003 * k * sn(p, 2) if breathe else 0
    s = A.standing({}, p if breathe else 0, breathe=0.3, shift=0, lk=0)
    s['hips@loc'] = (0, 0.045 * k, 0.34 * k - hip_z + br)
    s['hips'] = (18, 0, 0)
    s['spine'] = (8 + (0.5 * sn(p, 2) if breathe else 0), 0, 0)
    s['chest'] = (4, 0, 0)
    s['neck'] = (-12, 0, 0)
    s['head'] = (-17, 0, 0)
    for S in 'LR':
        sx = A.sx(S)
        A.plant(s, S, (sx * 0.045 * k, -0.045 * k, 0), pole=(sx * 0.25, -1, 0.1))
        A.arm_ik(s, S, V((sx * 0.18 * k, -0.28 * k, (0.37 * k + br))),
                 pole=(sx, 0.4, -0.4), end=(25, 0, sx * -12), frame='world')
    A.secondary(s, p if breathe else 0, drag=12, k=2, amp=0.15 if breathe else 0)
    return s


def crouch(A):
    return 'Crouch', 90, lambda p: squat(A, p), True


def crouch_walk(A):
    # Stance follows a 0.6 m/s straight track; toes stay flat during the low shuffle.
    def pose(p):
        s = squat(A, p, False)
        s['hips@loc'] = (0, 0.045 * A.k, 0.34 * A.k - (A.hip['L'].z + A.hip['R'].z) / 2 + 0.004 * A.k * -cs(p, 2))
        for S, phase in (('L', 0), ('R', 0.5)):
            at, pitch = A.foot_track(S, (p + phase) % 1, 0.6 * 0.9, 0.66, 0.035 * A.k, 0, 0, -0.045 * A.k)
            at.x += A.sx(S) * 0.045 * A.k
            s.setdefault('ik', {})['leg_' + S] = dict(target=at, end=eul((0, 0, 0)), pole=(A.sx(S) * 0.25, -1, 0.1))
            A.arm_ik(s, S, V((A.sx(S) * 0.2 * A.k, -0.34 * A.k, 0.42 * A.k)),
                     pole=(A.sx(S), 0.4, -0.4), end=(20, 0, 0), frame='world')
        A.secondary(s, p, drag=14, k=2, amp=0.2)
        return s
    return 'CrouchWalk', 27, pose, True


def reach(A, hold=False):
    def pose(p):
        s = squat(A, p if hold else 0, hold)
        g = 1 if hold else smooth(min(p / 0.38, (1 - p) / 0.3))
        # Bring the shoulder over the object: reaching from the upright squat would
        # exceed the short rig's arm length and the IK solver would clamp at the knee.
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x, y, z - 0.02 * A.k * g)
        s['hips'] = (18 + 18 * g, 0, 0)
        s['spine'] = (8 + 20 * g, 0, 0)
        s['chest'] = (4 + 6 * g, 0, 0)
        rest = V((-0.18 * A.k, -0.28 * A.k, 0.37 * A.k))
        target = V((-0.055 * A.k, -0.5 * A.k, 0.20 * A.k + (0.003 * A.k * sn(p) if hold else 0)))
        A.arm_ik(s, 'R', rest.lerp(target, g), pole=(-1, 0.5, -0.4), end=(35 * g, 0, 0), frame='world')
        s['head'] = (-6 + 1.5 * g, 0, -3 * g)
        return s
    return ('CrouchReachHold', 45, pose, True) if hold else ('CrouchReach', 24, pose, False)


def kneel(A):
    def pose(p):
        k = A.k
        s = squat(A, p)
        s['hips@loc'] = (-0.02 * k, 0.015 * k, 0.35 * k - (A.hip['L'].z + A.hip['R'].z) / 2)
        A.plant(s, 'L', (0.025 * k, -0.20 * k, 0), pole=(0.1, -1, 0.4))
        A.plant(s, 'R', (-0.015 * k, 0.34 * k, 0.015 * k), pole=(-0.1, -0.35, -1))
        for S in 'LR':
            A.arm_ik(s, S, V((A.sx(S) * 0.15 * k, -0.30 * k, 0.35 * k)),
                     pole=(A.sx(S), 0.4, -0.3), end=(15, 0, 0), frame='world')
        s['head'] = (0, 0, 0)
        return s
    return 'Kneel', 90, pose, True


def pickup(A):
    """Grab at frame 12/30 (0.4 s); the story event remains instant at the runtime."""
    def pose(p):
        k = A.k
        bend = smooth(p / 0.4) if p <= 0.4 else 1 - smooth((p - 0.4) / 0.48)
        s = A.standing({}, 0, breathe=0, shift=0, lk=0)
        s['hips@loc'] = (0, 0.075 * k * bend, -0.34 * k * bend)
        s['hips'] = (44 * bend, 0, -3 * bend)
        s['spine'] = (26 * bend, 0, 0)
        s['chest'] = (10 * bend, 0, 0)
        s['head'] = (8 * bend, 0, 0)
        A.plant(s, 'L', (0.015 * k, -0.04 * k, 0))
        A.plant(s, 'R', (-0.015 * k, 0.04 * k, 0))
        grab = V((-0.055 * k, -0.39 * k, 0.14 * k))
        chest = V((-0.075 * k, -0.2 * k, 0.85 * k))
        if p <= 0.4:
            target = A.wr['R'].lerp(grab, smooth(p / 0.4))
        elif p <= 0.88:
            target = grab.lerp(chest, smooth((p - 0.4) / 0.48))
        else:
            target = chest.lerp(A.wr['R'], smooth((p - 0.88) / 0.12))
        A.arm_ik(s, 'R', target, pole=(-1, 0.5, -0.4), end=(25 * bend, 0, 0), frame='world')
        left = A.wr['L'].lerp(V((0.15 * k, -0.19 * k, 0.42 * k)), bend)
        A.arm_ik(s, 'L', left, pole=(1, 0.5, -0.4), end=(20 * bend, 0, 0), frame='world')
        A.secondary(s, p, drag=20 * bend, k=2, amp=0)
        return s
    return 'Pickup', 30, pose, False


def sit_grass(A):
    # Reuse the proved crossed-leg geometry, keep the boots and coat hem clear of the grass.
    from player_anims import sit_floor
    _, _, floor_pose, _ = sit_floor(A)
    def pose(p):
        s = floor_pose(p)
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x, y, z + 0.02 * A.k)
        s['hips'] = (-3, 0, 0)
        s['spine'] = (5 + 1.0 * sn(p), 0, 0.8 * sn(p))
        s['head'] = (-4, 0, 1.2 * sn(p, 1, 0.15))
        return s
    return 'SitGrass', 120, pose, True


def extras(A):
    return dict(Crouch=lambda: crouch(A), CrouchWalk=lambda: crouch_walk(A),
                CrouchReach=lambda: reach(A), CrouchReachHold=lambda: reach(A, True),
                Kneel=lambda: kneel(A), Pickup=lambda: pickup(A), SitGrass=lambda: sit_grass(A))
