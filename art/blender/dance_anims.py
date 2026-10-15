"""Dance clips on the people's skeleton: the festival dance (the hat dance, múa nón), the K-pop stage set, the singer's
set and the crowd's clapping, for the performers (graceful.py), Mika and the village kids alike.

Timing contract (src/game/tricks/dance.js plays these): 30 fps, authored at 90 BPM, so ONE BEAT = 20 FRAMES. A move is
40 frames (2 beats); it starts and ends in the ready pose of its idle, reaches its ACCENT (the pose the move is about)
at frame 10 (p = 0.25) and holds it to about frame 24 (p = 0.6). Play with speed = bpm / 90. L / R are the dancer's own
left / right.

Every target is worked out from the body's own landmarks (shoulders, arm and leg length, head), never from fixed
numbers, so one choreography fits a 1.2 m kid, Mika and a 1.72 m young man. Finger poses (graceful.HAND_POSES) are
added where the rig has finger bones.
"""
import math
from mathutils import Vector, Quaternion, Matrix
from anims import sn, cs, env, bump, add, ease, smooth, clamp, lerp, sstep
from human_lib import eul

V = Vector
BEAT = 20
MOVE = 40
ACC = 0.25

FESTIVAL = ['DanceIdle', 'SweepL', 'SweepR', 'FanUp', 'Turn', 'HatTilt', 'Flourish', 'DanceBow']
KPOP = ['KpopIdle', 'SideL', 'SideR', 'PointStep', 'JumpClap', 'Spin', 'HeartHands', 'CrowdWave']
BOY = ['KpopIdle', 'SideL', 'SideR', 'PointStep', 'JumpClap', 'Spin', 'CrowdWave', 'PowerPose', 'SlideL', 'SlideR']
SINGER = ['SingIdle', 'SingReach', 'MicRaise']
CROWD = ['Clap', 'StickWave']


# ------------------------------------------------------------------------------------------------ helpers

def has_fingers(A):
    return 'index_L' in A.bones


def fingers(A, s, S, pose, k=1.0):
    if not has_fingers(A):
        return
    import graceful as G
    s.update(G.hand_pose(A.body, S, pose, k))


def fingers_mix(A, s, S, a, b, t):
    if not has_fingers(A):
        return
    import graceful as G
    s.update(G.mix_pose(A.body, S, a, b, clamp(t)))


def go(p, a=0.0, acc=ACC, hold=0.6, back=1.0):
    """0 -> 1 by the accent, held, back to 0 by the end (smooth)."""
    return env(p, a, acc, hold, back)


def sx(S):
    return 1 if S == 'L' else -1


def other(S):
    return 'R' if S == 'L' else 'L'


class Rig:
    """Landmarks of one body for the choreography (rest armature space)."""

    def __init__(self, A):
        self.A = A
        P = A.P
        h = P.h
        self.leg = A.l_leg
        self.arm = A.l_arm
        self.k = A.k
        self.sh = {S: h['upperarm_' + S].copy() for S in 'LR'}
        self.wr = {S: h['hand_' + S].copy() for S in 'LR'}
        self.head = h['head'].copy()
        self.top = self.head + V((0, 0, (P.t['head'] - h['head']).length * 0.82))
        self.chest = h['chest'].copy()
        self.waist = h['spine'].copy()
        self.hip = {S: h['thigh_' + S].copy() for S in 'LR'}
        self.ank = {S: h['foot_' + S].copy() for S in 'LR'}
        self.foot = (A.toe['L'] - A.ank['L']).length
        sh_z = (self.sh['L'].z + self.sh['R'].z) / 2
        # both hands can meet above the head: long arms for the head (the young adults ~1.7 head-lengths of arm; Mika
        # and the kids, with their big heads, ~1.4-1.5)
        self.overhead = self.arm / (P.t['head'] - h['head']).length > 1.6
        self.sh_z = sh_z

    def high(self, fwd=0.0):
        """Where two hands meet up high: over the head when the arms reach; a child's short arms and big head cannot, so
        they meet in front of the chest instead, under the chin (never in front of the face)."""
        if self.overhead:
            return self.top + V((0, (-0.08 - fwd) * self.k, 0.08 * self.k))
        return V((0, -0.5 * self.arm, self.sh_z - 0.06 * self.arm))

    def reach(self, S, d, frac=0.95):
        """A hand target: from the shoulder along direction d (armature axes; x given for the LEFT arm and mirrored)."""
        d = V((d[0] * sx(S), d[1], d[2])).normalized()
        return self.sh[S] + d * (self.arm * frac)

    def rest_dir(self, S):
        return (self.wr[S] - self.sh[S]).normalized()


def arm_ik(A, s, S, target, pole, end_rel=(0, 0, 0), end=None):
    """IK arm to a target in chest REST space (the chest's posed transform carries it). end: the hand's absolute
    orientation (a Quaternion, see aim_hand) instead of end_rel (relative to the forearm)."""
    g = dict(target=A.chest_pt(V(target)), pole=tuple(pole), end_rel=tuple(end_rel))
    if end is not None:
        g['end'] = end
    s.setdefault('ik', {})['arm_' + S] = g
    s.pop('upperarm_' + S, None)


def side_dir(S, d):
    """A direction given for her own side (x > 0 = outward, away from the body's middle) in armature axes."""
    return V((d[0] * sx(S), d[1], d[2])).normalized()


def aim_hand(A, S, fingers, palm, g=1.0, twist=0.0):
    """The hand's absolute orientation: its fingers along `fingers`, its palm facing `palm` (both for her own side, see
    side_dir), blended from the rest hand by g; twist turns it about the fingers (degrees: the fan's flick). A hat or a
    fan in the hand faces where the palm faces, so a hat dance shows the hat's painted inside to the audience."""
    from human_lib import _frame_rot
    o, a, p, t = A.body.hand_frame(S)
    f, n = side_dir(S, fingers), side_dir(S, palm)
    q = _frame_rot(a, p, f, n)
    if twist:
        q = Quaternion(f, math.radians(twist * sx(S))) @ q
    return Quaternion().slerp(q, clamp(g))


def arc(R, S, d0, d1, t, f0=0.9, f1=0.95):
    """A hand travelling on a sphere round the shoulder from direction d0 to d1 (x for the LEFT arm, mirrored)."""
    a = V((d0[0] * sx(S), d0[1], d0[2])).normalized()
    b = V((d1[0] * sx(S), d1[1], d1[2])).normalized()
    q = a.rotation_difference(b)
    ang = q.angle
    axis = q.axis if ang > 1e-5 else V((0, 0, 1))
    d = Quaternion(axis, ang * clamp(t)) @ a
    return R.sh[S] + d * (R.arm * lerp(f0, f1, t))


def plant_rot(A, s, S, theta, off=(0, 0, 0), pitch=0.0, pole=None):
    """Plant a foot when the whole body (root) is turned by theta degrees about Z."""
    Rz = Matrix.Rotation(math.radians(theta), 3, 'Z')
    tgt = Rz @ (A.ank[S] + V(off))
    pl = Rz @ V(pole or (sx(S) * 0.15, -1, 0.0))
    s.setdefault('ik', {})['leg_' + S] = dict(target=tgt, end=eul((pitch, 0, theta)), pole=tuple(pl))


def toe_rise(R, deg):
    """(dy, dz) of the ankle when the heel lifts by `deg` about the toe joint."""
    a = math.radians(deg)
    L = R.foot * 0.78
    return (L * (1 - math.cos(a)) * -1, L * math.sin(a))


def kpop_hand(R, S):
    """Where a hand rests in the K-pop groove: a loose fist in front of the belly, elbows bent and relaxed."""
    return V((R.sh[S].x * 0.92, -0.19 * R.k, R.waist.z + 0.05 * R.k))


def ready(A, R, p=0.0, dip=0.0, sway=0.0, kpop=False, hat=True):
    """The ready pose: tall back, soft knees, arms relaxed a little forward with soft elbows. dip 0..1 bends the knees
    (the beat), sway -1..1 shifts the weight to the left (+) or right (-)."""
    leg = R.leg
    s = {}
    s['hips@loc'] = (0.022 * leg * sway, 0.0, -(0.012 + 0.028 * dip) * leg)
    s['hips'] = (1.5 * dip, -2.5 * sway, 1.5 * sway)
    s['spine'] = (-1.0 + 1.5 * dip, 1.6 * sway, -0.8 * sway)
    s['chest'] = (-2.0, 0.8 * sway, 0)
    s['neck'] = (1.0, 0, 0)
    s['head'] = (-2.5 + 1.5 * dip, -2.0 * sway, 0)
    for S in 'LR':
        A.plant(s, S, (sx(S) * 0.006 * leg, 0, 0), yaw=sx(S) * 3)
    for S in 'LR':
        if kpop:
            # a loose groove: elbows bent, loose fists in front of the waist
            tgt = kpop_hand(R, S) + V((0, 0, -0.03 * leg * dip))
            arm_ik(A, s, S, tgt, (sx(S) * 0.6, 0.5, -1.0), (-30, 0, -sx(S) * 40))
            fingers(A, s, S, 'soft', 1.6)
        else:
            tgt = R.wr[S] + V((-sx(S) * 0.012 * R.arm, -0.085 * R.arm, 0.075 * R.arm))
            arm_ik(A, s, S, tgt, (sx(S) * 0.8, 0.7, -0.4), (-8, 0, -sx(S) * 8))
            fingers(A, s, S, 'hold' if (hat and S == 'R') else 'soft')
    return s


def lean_to(s, side, g, roll=5.0, yaw=8.0, head_turn=16.0):
    """Lean and look toward a side (+1 her left, -1 her right) by g."""
    s['spine'] = add(s['spine'], (0, -roll * 0.6 * side * g, yaw * 0.5 * side * g))
    s['chest'] = add(s['chest'], (0, -roll * 0.4 * side * g, yaw * 0.5 * side * g))
    s['head'] = add(s['head'], (-4 * g, -3 * side * g, head_turn * side * g))


def step_side(A, R, s, S, p, dist=0.16, a=0.02, b=0.24, c=0.62, d=0.95, weight=0.7):
    """Step foot S out to its side and back: lifted while it travels, the hips carry the weight over it."""
    leg = R.leg
    out = sstep(a, b, p) * (1 - sstep(c, d, p))
    lift = 0.045 * leg * (bump(p, a, b) + bump(p, c, d))
    A.plant(s, S, (sx(S) * dist * leg * out, 0, lift), yaw=sx(S) * 8 * out, pitch=6 * (bump(p, a, b) + bump(p, c, d)))
    x, y, z = s['hips@loc']
    s['hips@loc'] = (x + sx(S) * dist * leg * 0.5 * weight * out, y, z - 0.012 * leg * bump(p, b - 0.06, b + 0.14))
    return out


def secondary(A, s, p, drag=0.0, sway=0.0, k=2, amp=0.6, up=0.0):
    A.secondary(s, p, drag=drag, sway=sway, k=k, amp=amp, up=up)


# ------------------------------------------------------------------------------------------------ festival set

def dance_idle(A):
    R = Rig(A)

    def pose(p):
        dip = 0.5 + 0.5 * cs(p, 4)              # down on every beat (4 a loop)
        sway = sn(p, 2, 0.25) * 0.8              # left and right every two beats
        s = ready(A, R, p, dip=dip * 0.6, sway=sway)
        s['head'] = add(s['head'], (0, -2 * sway, 3 * sway))
        secondary(A, s, p, drag=2, sway=2 * sway, k=2, amp=0.4)
        return s
    return 'DanceIdle', 80, pose, True


def sweep(A, S):
    R = Rig(A)
    O = other(S)
    side = sx(S)

    def pose(p):
        g = go(p)
        s = ready(A, R, p)
        step_side(A, R, s, S, p, dist=0.15)
        lean_to(s, side, g, roll=6, yaw=10, head_turn=18)
        # both arms sweep up and over to side S: the leading arm high and long, the other across the chest
        hi = arc(R, S, R.rest_dir('L') + V((0, -0.3, 0.3)), (0.78, -0.3, 0.62), g, 0.9, 0.97)
        lo = arc(R, O, R.rest_dir('L') + V((0, -0.3, 0.3)), (-0.5, -0.8, -0.12), g, 0.9, 0.86)
        arm_ik(A, s, S, hi, (side * 0.6, 0.6, -0.6), end=aim_hand(A, S, (0.62, -0.12, 0.78), (0.1, -1, 0.0), g))
        arm_ik(A, s, O, lo, (-side * 0.2, 0.4, -1.0), end=aim_hand(A, O, (-0.92, -0.3, -0.1), (0.0, -1, 0.1), g))
        fingers_mix(A, s, S, 'soft' if S == 'L' else 'hold', 'open' if S == 'L' else 'hold', g)
        fingers_mix(A, s, O, 'soft' if O == 'L' else 'hold', 'open' if O == 'L' else 'hold', g)
        secondary(A, s, p, drag=4, sway=-8 * side * g, k=1, amp=0.6)
        return s
    return 'Sweep' + S, MOVE, pose, False


def fan_up(A):
    R = Rig(A)

    def pose(p):
        g = go(p)
        s = ready(A, R, p)
        leg = R.leg
        # a small step forward on the right foot, rising onto the toes at the accent
        st = sstep(0.0, 0.22, p) * (1 - sstep(0.62, 0.95, p))
        dy, dz = toe_rise(R, 16 * g)
        A.plant(s, 'R', (-0.01 * leg, -0.1 * leg * st, dz + 0.04 * leg * (bump(p, 0.0, 0.22) + bump(p, 0.62, 0.95))), pitch=16 * g)
        A.plant(s, 'L', (0.006 * leg, dy, dz), pitch=16 * g)
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x, y - 0.035 * leg * st, z + dz * 0.95 + 0.012 * leg * g)
        s['spine'] = add(s['spine'], (-3 * g, 0, -4 * g))
        s['chest'] = add(s['chest'], (-3 * g, 0, -3 * g))
        s['head'] = add(s['head'], (-10 * g, 2 * g, -6 * g))
        # the right hand lifts the hat high and fans it (two flicks of the wrist while held)
        fan = sn(clamp((p - 0.22) / 0.4), 2) * env(p, 0.22, 0.28, 0.56, 0.64)
        hi = arc(R, 'R', R.rest_dir('L') + V((0, -0.3, 0.3)), (0.25, -0.25, 0.97), g, 0.9, 0.97)
        arm_ik(A, s, 'R', hi, (-0.6, 0.5, -0.4), end=aim_hand(A, 'R', (0.25, -0.1, 1.0), (0.0, -1, 0.1), g, twist=28 * fan))
        lo = arc(R, 'L', R.rest_dir('L') + V((0, -0.3, 0.3)), (0.85, -0.25, -0.42), g, 0.9, 0.96)
        arm_ik(A, s, 'L', lo, (0.4, 0.8, -0.3), end=aim_hand(A, 'L', (0.85, -0.2, -0.45), (0.0, -1, 0.3), g))
        fingers_mix(A, s, 'L', 'soft', 'open', g)
        fingers(A, s, 'R', 'hold')
        secondary(A, s, p, drag=-4 * g, k=2, amp=0.5)
        return s
    return 'FanUp', MOVE, pose, False


def turn(A, name='Turn', kpop=False):
    """A full turn in place to her left (counter-clockwise from above), arms opening to the sides; ends facing front."""
    R = Rig(A)

    def pose(p):
        u = clamp((p - 0.04) / 0.62)
        th = 360 * ease(u)
        g = env(p, 0.0, 0.18, 0.6, 0.95)
        s = ready(A, R, p, kpop=kpop)
        leg = R.leg
        s['root'] = (0, 0, th)
        # little steps round: the feet stay under her, lifted in turn
        for S, ph in (('L', 0.0), ('R', 0.5)):
            lift = 0.03 * leg * max(0.0, math.sin(math.pi * 3 * u + ph * math.pi)) * (1 if 0 < u < 1 else 0)
            dy, dz = toe_rise(R, 12 * g)
            plant_rot(A, s, S, th, (0, dy, dz + lift), pitch=12 * g)
        s.get('ik', {}).pop('leg_L_dummy', None)
        x, y, z = s['hips@loc']
        dy, dz = toe_rise(R, 12 * g)
        s['hips@loc'] = (x, y, z + dz * 0.9 - 0.015 * leg * (bump(p, 0.0, 0.1) + bump(p, 0.64, 0.86)))
        s['head'] = add(s['head'], (-4 * g, 0, 0))
        for S in 'LR':
            open_ = arc(R, S, R.rest_dir('L') + V((0, -0.3, 0.3)), (0.92, -0.3, 0.18) if not kpop else (0.5, -0.6, 0.05), g, 0.9, 0.93)
            arm_ik(A, s, S, open_, (sx(S) * 0.2, 0.8, -0.6), end=aim_hand(A, S, (0.95, -0.25, 0.15), (0.0, -1, 0.2), g))
            if not kpop:
                fingers_mix(A, s, S, 'soft' if S == 'L' else 'hold', 'open' if S == 'L' else 'hold', g)
            else:
                fingers_mix(A, s, S, 'soft', 'open', g)
        spin = math.sin(math.pi * u) if 0 < u < 1 else 0.0
        secondary(A, s, p, drag=30 * spin, sway=-25 * spin, k=1, amp=0.3)
        return s
    return name, MOVE, pose, False


def hat_tilt(A):
    R = Rig(A)

    def pose(p):
        g = go(p)
        s = ready(A, R, p, dip=0.4 * g)
        leg = R.leg
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x - 0.025 * leg * g, y, z)
        s['hips'] = add(s['hips'], (0, 3 * g, -4 * g))
        s['head'] = add(s['head'], (-2 * g, 13 * g, -10 * g))
        s['neck'] = add(s['neck'], (0, 4 * g, -4 * g))
        # the hat held up beside her head, its inside to the audience, her face peeping past it; the left hand on the waist
        hs = R.top.z - R.head.z
        by = V((R.sh['R'].x - 0.5 * hs, -0.03 * R.k, R.head.z - 0.12 * hs))
        rest = R.wr['R'] + V((0.012 * R.arm, -0.085 * R.arm, 0.075 * R.arm))
        arm_ik(A, s, 'R', rest.lerp(by, g), (-1.0, 0.25, -0.5), end=aim_hand(A, 'R', (0.62, -0.08, 0.78), (0.1, -1, 0.0), g))
        waist = V((R.sh['L'].x * 0.82, -0.025 * R.k, R.waist.z + 0.02 * R.k))
        rest = R.wr['L'] + V((-0.012 * R.arm, -0.085 * R.arm, 0.075 * R.arm))
        arm_ik(A, s, 'L', rest.lerp(waist, g), (1.0, 0.35, 0.0), (20 * g, 0, 70 * g))
        fingers(A, s, 'R', 'hold')
        fingers_mix(A, s, 'L', 'soft', (8, 10, 6, 8, 4, 0), g)
        secondary(A, s, p, drag=0, sway=8 * g, k=1, amp=0.4)
        return s
    return 'HatTilt', MOVE, pose, False


def flourish(A):
    R = Rig(A)

    def pose(p):
        g = go(p)
        s = ready(A, R, p)
        dy, dz = toe_rise(R, 14 * g)
        for S in 'LR':
            A.plant(s, S, (sx(S) * 0.006 * R.leg, dy, dz), pitch=14 * g, yaw=sx(S) * 3)
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x, y, z + dz * 0.95 + 0.01 * R.leg * g)
        s['chest'] = add(s['chest'], (-4 * g, 0, 0))
        s['head'] = add(s['head'], (-12 * g, 0, 0))
        twirl = sn(clamp((p - 0.2) / 0.45), 1.5) * env(p, 0.2, 0.3, 0.55, 0.66)
        for S in 'LR':
            up = arc(R, S, R.rest_dir('L') + V((0, -0.3, 0.3)), (0.42, -0.22, 0.88), g, 0.9, 0.97)
            arm_ik(A, s, S, up, (sx(S) * 0.8, 0.4, -0.2), end=aim_hand(A, S, (0.3, -0.12, 0.95), (0.0, -1, 0.05), g, twist=30 * twirl))
            if S == 'R':
                fingers(A, s, 'R', 'hold')
            else:
                fingers_mix(A, s, S, 'soft', 'open', g)
        secondary(A, s, p, drag=-3 * g, k=2, amp=0.5)
        return s
    return 'Flourish', MOVE, pose, False


def dance_bow(A):
    R = Rig(A)

    def pose(p):
        s = ready(A, R, p)
        leg = R.leg
        a = env(p, 0.02, 0.28, 0.75, 0.98)          # the curtsey step and the arms
        b = env(p, 0.22, 0.45, 0.62, 0.9)           # the bow itself
        A.plant(s, 'R', (-0.03 * leg * a, 0.11 * leg * a, 0.035 * leg * (bump(p, 0.02, 0.28) + bump(p, 0.75, 0.98))), pitch=10 * a)
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x - 0.01 * leg * a, y + 0.03 * leg * a + 0.03 * leg * b, z - 0.05 * leg * a)
        s['hips'] = add(s['hips'], (14 * b, 0, 4 * a))
        s['spine'] = add(s['spine'], (12 * b, 0, 0))
        s['chest'] = add(s['chest'], (6 * b, 0, 0))
        s['neck'] = add(s['neck'], (5 * b, 0, 0))
        s['head'] = add(s['head'], (8 * b, 0, 0))
        for S in 'LR':
            low = arc(R, S, R.rest_dir('L') + V((0, -0.3, 0.3)), (0.7, -0.45, -0.55), a, 0.9, 0.95)
            arm_ik(A, s, S, low, (sx(S) * 0.6, 0.8, -0.2), end=aim_hand(A, S, (0.55, -0.3, -0.78), (0.0, -1, -0.2), a))
            if S == 'R':
                fingers(A, s, 'R', 'hold')
            else:
                fingers_mix(A, s, S, 'soft', 'open', a)
        secondary(A, s, p, drag=0, k=1, amp=0.3, up=-15 * b)
        return s
    return 'DanceBow', 60, pose, False

# ------------------------------------------------------------------------------------------------ K-pop set


def kpop_ready(A, R, p, bounce=1.0):
    dip = 0.5 + 0.5 * cs(p, 2)                  # down on each beat (2 a loop of 40 frames)
    sway = sn(p, 1, 0.25) * 0.6
    s = ready(A, R, p, dip=dip * 0.8 * bounce, sway=sway, kpop=True)
    s['chest'] = add(s['chest'], (2 * dip * bounce, 0, 4 * sway))
    s['head'] = add(s['head'], (3 * dip * bounce, 0, -3 * sway))
    return s


def kpop_idle(A):
    R = Rig(A)

    def pose(p):
        s = kpop_ready(A, R, p)
        secondary(A, s, p, drag=4, k=2, amp=0.6)
        return s
    return 'KpopIdle', MOVE, pose, True


def side_wave(A, S):
    R = Rig(A)
    O = other(S)
    side = sx(S)

    def pose(p):
        g = go(p)
        s = kpop_ready(A, R, p, bounce=1 - g)
        step_side(A, R, s, S, p, dist=0.17)
        lean_to(s, side, g, roll=7, yaw=6, head_turn=12)
        # the arm on that side waves high, palm to the crowd; the other bends in front
        wv = sn(clamp((p - 0.18) / 0.44), 2) * env(p, 0.18, 0.26, 0.56, 0.64)
        up = arc(R, S, (0.3, -0.5, -0.4), (0.62, -0.42, 0.66), g, 0.8, 0.9)
        arm_ik(A, s, S, up, (side * 0.9, 0.3, -0.5), (0, side * 18 * wv, -side * (20 + 26 * wv)))
        fingers_mix(A, s, S, 'soft', 'open', g)
        fingers(A, s, O, 'soft', 1.4)
        secondary(A, s, p, drag=4, sway=-10 * side * g, k=2, amp=0.8)
        return s
    return 'Side' + S, MOVE, pose, False


def point_step(A):
    R = Rig(A)

    def pose(p):
        g = go(p)
        s = kpop_ready(A, R, p, bounce=1 - g)
        leg = R.leg
        tap = sstep(0.0, 0.2, p) * (1 - sstep(0.62, 0.92, p))
        A.plant(s, 'R', (-0.02 * leg, -0.16 * leg * tap, 0.035 * leg * (bump(p, 0.0, 0.2) + bump(p, 0.62, 0.92))), pitch=-10 * tap)
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x + 0.02 * leg * g, y - 0.02 * leg * tap, z)
        s['spine'] = add(s['spine'], (2 * g, 0, -8 * g))
        s['chest'] = add(s['chest'], (0, 0, -6 * g))
        s['head'] = add(s['head'], (-4 * g, -3 * g, 4 * g))
        # point at the crowd with the right hand, left hand on the hip
        fwd = arc(R, 'R', (0.3, -0.5, -0.4), (-0.12, -0.96, 0.24), g, 0.8, 0.97)
        arm_ik(A, s, 'R', fwd, (-0.9, 0.3, -0.4), (-6 * g, 0, 0))
        hipp = V((R.sh['L'].x * 0.95, 0.0, R.waist.z - 0.02 * R.k))
        rest = kpop_hand(R, 'L')
        arm_ik(A, s, 'L', rest.lerp(hipp, g), (1.0, 0.3, 0.0), (25 * g, 0, 75 * g))
        fingers_mix(A, s, 'R', 'soft', 'point', g * 1.6)
        fingers_mix(A, s, 'L', 'soft', (30, 30, 30, 30, 10, 0), g)
        secondary(A, s, p, drag=6 * g, k=2, amp=0.6)
        return s
    return 'PointStep', MOVE, pose, False


def jump_clap(A):
    R = Rig(A)

    def pose(p):
        s = kpop_ready(A, R, p, bounce=0.0)
        leg = R.leg
        crouch = env(p, 0.0, 0.08, 0.1, 0.16) + 0.9 * env(p, 0.4, 0.46, 0.5, 0.66)
        air = bump(p, 0.12, 0.42)
        hz = -0.06 * leg * crouch + 0.1 * leg * air
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x, y, z + hz)
        s['hips'] = add(s['hips'], (8 * crouch - 3 * air, 0, 0))
        s['spine'] = add(s['spine'], (5 * crouch - 4 * air, 0, 0))
        s['head'] = add(s['head'], (-8 * air - 3 * crouch, 0, 0))
        tuck = air * 0.8
        for S in 'LR':
            A.plant(s, S, (sx(S) * 0.01 * leg, 0.01 * leg * tuck, max(0.0, hz + 0.0) + 0.07 * leg * tuck), pitch=20 * tuck)
        g = env(p, 0.08, 0.25, 0.4, 0.62)
        clap = R.high()
        for S in 'LR':
            rest = kpop_hand(R, S)
            meet = clap + V((sx(S) * 0.018 * R.k, 0, 0))
            # the hands come up wide and meet over the head at the accent
            wide = R.sh[S] + V((sx(S) * 0.75, -0.25, 0.6)).normalized() * R.arm * 0.92
            t1 = clamp(g * 1.3)
            tgt = rest.lerp(wide, smooth(t1)).lerp(meet, smooth(clamp((g - 0.6) / 0.4))) if g < 1 else meet
            arm_ik(A, s, S, tgt, (sx(S) * 1.0, 0.2, -0.3), (20 * g, 0, -sx(S) * 70 * g))
            fingers_mix(A, s, S, 'soft', 'clap', g)
        secondary(A, s, p, drag=0, k=2, amp=1.2, up=-14 * air)
        return s
    return 'JumpClap', MOVE, pose, False


def heart_hands(A):
    R = Rig(A)

    def pose(p):
        g = go(p, hold=0.7)
        s = kpop_ready(A, R, p, bounce=1 - g)
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x + 0.012 * R.leg * g, y, z)
        s['hips'] = add(s['hips'], (0, -3 * g, 0))
        s['head'] = add(s['head'], (-6 * g, 5 * g, 0))
        # over the head (a big heart drawn with both arms), or for short arms a small heart in front of the chest
        top = R.top + V((0, -0.03 * R.k, 0.012 * R.k)) if R.overhead else R.high()
        for S in 'LR':
            rest = kpop_hand(R, S)
            wide = R.sh[S] + V((sx(S) * 0.75, -0.25, 0.6)).normalized() * R.arm * 0.9
            meet = top + V((sx(S) * 0.035 * R.k, 0, 0))
            tgt = rest.lerp(wide, smooth(clamp(g * 1.4))).lerp(meet, smooth(clamp((g - 0.55) / 0.45)))
            # elbows out and a little forward, wrists bent in: the arms round into a heart over the head
            arm_ik(A, s, S, tgt, (sx(S) * 1.0, -0.25, 0.35), (35 * g, 0, -sx(S) * 80 * g))
            fingers_mix(A, s, S, 'soft', 'heart', g)
        secondary(A, s, p, drag=0, sway=-6 * g, k=2, amp=0.5)
        return s
    return 'HeartHands', MOVE, pose, False


def crowd_wave(A):
    R = Rig(A)

    def pose(p):
        g = go(p, hold=0.72)
        s = kpop_ready(A, R, p, bounce=1 - g * 0.6)
        lean_to(s, -1, g * 0.5, roll=4, yaw=4, head_turn=6)
        wv = sn(clamp((p - 0.15) / 0.6), 2) * env(p, 0.15, 0.24, 0.66, 0.76)
        up = arc(R, 'R', (0.3, -0.5, -0.4), (0.28, -0.3, 0.92) if R.overhead else (0.62, -0.3, 0.72), g, 0.8, 0.96)
        arm_ik(A, s, 'R', up + V((-0.08 * wv * R.k, 0, 0)), (-0.8, 0.2, -0.4), (0, -20 * wv, 15 + 28 * wv))
        hipp = V((R.sh['L'].x * 0.95, 0.0, R.waist.z - 0.02 * R.k))
        rest = kpop_hand(R, 'L')
        arm_ik(A, s, 'L', rest.lerp(hipp, g), (1.0, 0.3, 0.0), (25 * g, 0, 75 * g))
        fingers_mix(A, s, 'R', 'soft', 'open', g)
        fingers_mix(A, s, 'L', 'soft', (30, 30, 30, 30, 10, 0), g)
        secondary(A, s, p, drag=2, k=2, amp=0.7)
        return s
    return 'CrowdWave', MOVE, pose, False


def power_pose(A):
    R = Rig(A)

    def pose(p):
        g = go(p)
        s = kpop_ready(A, R, p, bounce=1 - g)
        for S in 'LR':
            step_side(A, R, s, S, p, dist=0.1, weight=0.0)
        s['chest'] = add(s['chest'], (-6 * g, 0, 8 * g))
        s['spine'] = add(s['spine'], (-2 * g, 0, 4 * g))
        s['head'] = add(s['head'], (-8 * g, 0, -6 * g))
        up = arc(R, 'R', (0.3, -0.5, -0.4), (0.55, -0.15, 0.82), g, 0.8, 0.97)
        arm_ik(A, s, 'R', up, (-0.8, 0.4, -0.3), (0, 0, 0))
        hipp = V((R.sh['L'].x * 0.95, 0.0, R.waist.z - 0.02 * R.k))
        rest = kpop_hand(R, 'L')
        arm_ik(A, s, 'L', rest.lerp(hipp, g), (1.0, 0.3, 0.0), (20 * g, 0, 60 * g))
        fingers_mix(A, s, 'R', 'soft', 'fist', g)
        fingers_mix(A, s, 'L', 'soft', 'fist', g)
        secondary(A, s, p, drag=4 * g, k=2, amp=0.5)
        return s
    return 'PowerPose', MOVE, pose, False


def slide(A, S):
    R = Rig(A)
    O = other(S)
    side = sx(S)

    def pose(p):
        g = go(p)
        s = kpop_ready(A, R, p, bounce=1 - g)
        leg = R.leg
        out = sstep(0.0, 0.25, p) * (1 - sstep(0.6, 0.95, p))
        A.plant(s, S, (side * 0.22 * leg * out, 0, 0.006 * leg * bump(p, 0.0, 0.25)), yaw=side * 10 * out)
        drag = sstep(0.2, 0.45, p) * (1 - sstep(0.6, 0.95, p))
        A.plant(s, O, (side * 0.1 * leg * drag, 0.01 * leg * drag, 0.02 * leg * bump(p, 0.2, 0.45)), pitch=-6 * bump(p, 0.2, 0.45))
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x + side * 0.12 * leg * g, y, z - 0.02 * leg * g)
        lean_to(s, side, g, roll=8, yaw=10, head_turn=14)
        for T in 'LR':
            swing = arc(R, T, (0.3, -0.5, -0.4), (side * sx(T) * 0.8, -0.45, 0.05), g, 0.8, 0.9)
            arm_ik(A, s, T, swing, (sx(T) * 0.6, 0.6, -0.6), (-10 * g, 0, -sx(T) * 15 * g))
            fingers_mix(A, s, T, 'soft', 'open', g)
        secondary(A, s, p, drag=6, sway=-12 * side * g, k=2, amp=0.7)
        return s
    return 'Slide' + S, MOVE, pose, False

# ------------------------------------------------------------------------------------------------ singer


def mic_hand(A, R, s, g=1.0):
    """The right hand holds the mic just under the chin."""
    mouth = R.head + V((-0.012 * R.k, -0.115 * R.k, -0.075 * R.k))
    rest = R.wr['R'] + V((0.012 * R.arm, -0.085 * R.arm, 0.075 * R.arm))
    arm_ik(A, s, 'R', rest.lerp(mouth, g), (-0.9, 0.3, -0.9), (-70 * g, 0, -10 * g))
    fingers(A, s, 'R', 'hold')


def sing_idle(A):
    R = Rig(A)

    def pose(p):
        dip = 0.5 + 0.5 * cs(p, 4)
        sway = sn(p, 2, 0.25)
        s = ready(A, R, p, dip=dip * 0.4, sway=sway * 0.9, hat=False)
        s['head'] = add(s['head'], (2 * dip, -3 * sway, 4 * sway))
        mic_hand(A, R, s)
        # the free hand rises with the phrase and settles
        ph = env(p, 0.08, 0.3, 0.5, 0.75)
        rest = R.wr['L'] + V((-0.012 * R.arm, -0.085 * R.arm, 0.075 * R.arm))
        out = arc(R, 'L', R.rest_dir('L'), (0.75, -0.55, 0.05), 1.0, 0.95, 0.9)
        arm_ik(A, s, 'L', rest.lerp(out, ph * 0.85), (0.8, 0.6, -0.4), (-15 * ph, 0, -25 * ph))
        fingers_mix(A, s, 'L', 'soft', 'open', ph)
        secondary(A, s, p, drag=2, sway=3 * sway, k=2, amp=0.5)
        return s
    return 'SingIdle', 80, pose, True


def sing_reach(A):
    R = Rig(A)

    def pose(p):
        g = go(p)
        s = ready(A, R, p, hat=False)
        leg = R.leg
        st = sstep(0.0, 0.22, p) * (1 - sstep(0.62, 0.95, p))
        A.plant(s, 'L', (0.01 * leg, -0.12 * leg * st, 0.04 * leg * (bump(p, 0.0, 0.22) + bump(p, 0.62, 0.95))))
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x + 0.01 * leg * st, y - 0.04 * leg * st, z)
        s['spine'] = add(s['spine'], (4 * g, 0, 6 * g))
        s['head'] = add(s['head'], (-6 * g, -3 * g, 8 * g))
        mic_hand(A, R, s)
        reachp = arc(R, 'L', R.rest_dir('L'), (0.35, -0.92, 0.22), g, 0.9, 0.97)
        arm_ik(A, s, 'L', reachp, (0.8, 0.4, -0.6), (-25 * g, 0, -50 * g))
        fingers_mix(A, s, 'L', 'soft', 'open', g)
        secondary(A, s, p, drag=3, k=2, amp=0.6)
        return s
    return 'SingReach', MOVE, pose, False


def mic_raise(A):
    R = Rig(A)

    def pose(p):
        g = go(p)
        s = ready(A, R, p, hat=False)
        s['spine'] = add(s['spine'], (-4 * g, 0, -6 * g))
        s['chest'] = add(s['chest'], (-4 * g, 0, -4 * g))
        s['head'] = add(s['head'], (-8 * g, 6 * g, 6 * g))
        mouth = R.head + V((-0.012 * R.k, -0.115 * R.k, -0.075 * R.k))
        up = arc(R, 'R', (0.2, -0.9, 0.3), (0.1, -0.75, 0.66), g, 0.9, 0.96)
        rest = R.wr['R'] + V((0.012 * R.arm, -0.085 * R.arm, 0.075 * R.arm))
        start = rest.lerp(mouth, 1.0)
        arm_ik(A, s, 'R', start.lerp(up, g), (-0.9, 0.3, -0.6), (-70 + 40 * g, 0, -10))
        fingers(A, s, 'R', 'hold')
        ear = R.head + V((0.11 * R.k, -0.02 * R.k, 0.0))
        restL = R.wr['L'] + V((-0.012 * R.arm, -0.085 * R.arm, 0.075 * R.arm))
        arm_ik(A, s, 'L', restL.lerp(ear, g), (1.0, 0.3, -0.6), (-20 * g, 0, -60 * g))
        fingers_mix(A, s, 'L', 'soft', (30, 30, 20, 20, 0, 0), g)
        secondary(A, s, p, drag=-3 * g, k=2, amp=0.6)
        return s
    return 'MicRaise', MOVE, pose, False

# ------------------------------------------------------------------------------------------------ crowd


def clap(A):
    R = Rig(A)

    def pose(p):
        c = 0.5 + 0.5 * cs(p, 1)                # 1 at the beat (hands together), 0 half a beat later
        s = ready(A, R, p, dip=0.3 * c, hat=False)
        front = R.chest + V((0, -0.2 * R.k, -0.06 * R.k))
        for S in 'LR':
            tgt = front + V((sx(S) * (0.012 + 0.09 * (1 - c)) * R.k, 0, 0))
            arm_ik(A, s, S, tgt, (sx(S) * 1.0, 0.3, -0.7), (-20, 0, -sx(S) * 80))
            fingers(A, s, S, 'clap')
        secondary(A, s, p, drag=0, k=1, amp=0.3)
        return s
    return 'Clap', BEAT, pose, True


def stick_wave(A):
    R = Rig(A)

    def pose(p):
        w = sn(p, 1)                             # left on one beat, right on the next
        s = ready(A, R, p, dip=0.3 * (0.5 + 0.5 * cs(p, 2)), sway=0.4 * w, hat=False)
        up = R.reach('R', (0.15 - 0.35 * w, -0.35, 0.92), 0.9)
        arm_ik(A, s, 'R', up, (-0.8, 0.2, -0.5), (0, 0, 10 - 25 * w))
        fingers(A, s, 'R', 'hold')
        s['head'] = add(s['head'], (-6, 0, -4 * w))
        secondary(A, s, p, drag=0, k=1, amp=0.4)
        return s
    return 'StickWave', MOVE, pose, True


# ------------------------------------------------------------------------------------------------ tables

def extras(A, sets=('festival',)):
    t = {}
    if 'festival' in sets:
        t.update(DanceIdle=lambda: dance_idle(A), SweepL=lambda: sweep(A, 'L'), SweepR=lambda: sweep(A, 'R'),
                 FanUp=lambda: fan_up(A), Turn=lambda: turn(A), HatTilt=lambda: hat_tilt(A), Flourish=lambda: flourish(A),
                 DanceBow=lambda: dance_bow(A))
    if 'kpop' in sets or 'boy' in sets:
        t.update(KpopIdle=lambda: kpop_idle(A), SideL=lambda: side_wave(A, 'L'), SideR=lambda: side_wave(A, 'R'),
                 PointStep=lambda: point_step(A), JumpClap=lambda: jump_clap(A), Spin=lambda: turn(A, 'Spin', kpop=True),
                 HeartHands=lambda: heart_hands(A), CrowdWave=lambda: crowd_wave(A))
    if 'boy' in sets:
        t.update(PowerPose=lambda: power_pose(A), SlideL=lambda: slide(A, 'L'), SlideR=lambda: slide(A, 'R'))
    if 'singer' in sets:
        t.update(SingIdle=lambda: sing_idle(A), SingReach=lambda: sing_reach(A), MicRaise=lambda: mic_raise(A))
    if 'crowd' in sets:
        t.update(Clap=lambda: clap(A), StickWave=lambda: stick_wave(A))
    return t


def idle_grace(A, s, p):
    """A performer's everyday idle: arms soft, elbows a little bent, hands near the thighs, fingers relaxed."""
    for S in 'LR':
        s['upperarm_' + S] = add(s.get('upperarm_' + S, (0, 0, 0)), (-4, -sx(S) * 1.5, sx(S) * 6))
        s['forearm_' + S] = add(s.get('forearm_' + S, (0, 0, 0)), (-12, 0, sx(S) * 4))
        s['hand_' + S] = add(s.get('hand_' + S, (0, 0, 0)), (-6, 0, sx(S) * 6))
        fingers(A, s, S, 'soft', 0.8)


def finger_post(A, s, p, clip):
    """Finger poses for the standard clips on a rig with finger bones."""
    if not has_fingers(A):
        return s
    if clip in ('Wave',):
        S = A.st.get('wave_side', 'R')
        fingers(A, s, S, 'open')
        fingers(A, s, 'L' if S == 'R' else 'R', 'soft')
    elif clip in ('Cheer', 'Jump', 'Fall'):
        for S in 'LR':
            fingers(A, s, S, 'open')
    elif clip in ('Run',):
        for S in 'LR':
            fingers(A, s, S, 'soft', 1.8)
    elif clip in ('Talk',):
        for S in 'LR':
            fingers(A, s, S, 'soft', 0.6)
    elif not any(('index_' + S) in s for S in 'LR'):
        for S in 'LR':
            fingers(A, s, S, 'soft')
    return s
