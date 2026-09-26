"""Starline humanoid clips.

Clips are authored as pose functions p (0..1) -> Poser spec. Feet are driven by two-bone IK:
  * gaits (Walk/Run) move each ankle along a planned track: during stance the heel / toe contact
    point travels backward at exactly the runtime speed (1.6 m/s Walk, 4.2 m/s Run, root motion in
    place), so there is no foot sliding; the foot rolls heel -> flat -> toe.
  * standing clips plant the feet at their rest positions while the hips shift and bob.
Arms are FK (swings) or IK with targets expressed in the chest's posed frame (gestures).
Secondary motion (scarf, hair, hat) lags the torso with phase offsets.

Axis reminders (rig.py): -X swings a hanging limb forward, +X backward; +X on spine/head pitches
forward; +Z turns left; for the LEFT arm -Y raises it sideways (right arm +Y).
"""
import math
from mathutils import Vector, Quaternion, Euler, Matrix
from human_lib import Poser, record, eul, clamp, smooth, sstep, lerp, interp

V = Vector
TAU = math.tau
WALK_SPEED, RUN_SPEED = 1.6, 4.2


def sn(p, k=1.0, ph=0.0):
    return math.sin(TAU * (p * k + ph))


def cs(p, k=1.0, ph=0.0):
    return math.cos(TAU * (p * k + ph))


def ease(t):
    t = clamp(t)
    return t * t * t * (t * (6 * t - 15) + 10)


def bump(t, a, b):
    """0 outside [a, b], smooth hump inside."""
    if t <= a or t >= b:
        return 0.0
    return math.sin(math.pi * (t - a) / (b - a)) ** 2


def env(t, a, b, c, d):
    """Trapezoid envelope: 0 before a, ramps to 1 by b, holds, back to 0 from c to d."""
    return smooth((t - a) / max(b - a, 1e-6)) * (1 - smooth((t - c) / max(d - c, 1e-6)))


def add(*rots):
    return tuple(sum(r[i] for r in rots if r is not None) for i in range(3))


STYLE = dict(
    energy=1.0, bounce=1.0, arm_swing=1.0, sway=1.0, lean=3.0, stance=0.0, hunch=0.0, head_up=0.0,
    wave_side='R', elbow=12.0, arm_out=0.0, walk_lift=1.0, step=0.95, run_step=1.0, cane=False,
    idle_hands=None, talk='open', stout=0.0, scarf=False, hair=False, hat=False, ponytail=False,
)


class Anim:
    def __init__(self, arm, body, who, **style):
        self.arm, self.body, self.who = arm, body, who
        self.st = dict(STYLE, **style)
        self.P = Poser(arm)
        h, t = self.P.h, self.P.t
        self.k = body.H / 1.45
        self.hip = {S: h['thigh_' + S].copy() for S in 'LR'}
        self.knee = {S: h['shin_' + S].copy() for S in 'LR'}
        self.ank = {S: h['foot_' + S].copy() for S in 'LR'}
        self.toe = {S: t['foot_' + S].copy() for S in 'LR'}
        self.sh = {S: h['upperarm_' + S].copy() for S in 'LR'}
        self.wr = {S: h['hand_' + S].copy() for S in 'LR'}
        self.l_leg = (self.knee['L'] - self.hip['L']).length + (self.ank['L'] - self.knee['L']).length
        self.l_arm = (h['forearm_L'] - h['upperarm_L']).length + (h['hand_L'] - h['forearm_L']).length
        self.heel_len = 0.054 * self.k
        self.chest_h = h['chest'].copy()
        self.head_h = h['head'].copy()
        self.bones = set(self.P.order)

    # ------------------------------------------------------------ helpers
    def sx(self, S):
        return 1 if S == 'L' else -1

    def arm_rot(self, S, fwd=0.0, out=0.0, twist=0.0):
        s = self.sx(S)
        return (-fwd, -s * out, s * twist)

    def chest_pt(self, local):
        """IK target: a rest-space point carried by the chest's posed transform."""
        pt = V(local)
        return lambda P, D: P.apply(D['chest'], pt)

    def hips_pt(self, local):
        pt = V(local)
        return lambda P, D: P.apply(D['hips'], pt)

    def plant(self, spec, S, offset=(0, 0, 0), pitch=0.0, yaw=0.0, pole=None):
        spec.setdefault('ik', {})['leg_' + S] = dict(
            target=self.ank[S] + V(offset), end=eul((pitch, 0, yaw)),
            pole=pole or (self.sx(S) * 0.15, -1, 0.0))

    def plant_both(self, spec, spread=0.0):
        for S in 'LR':
            self.plant(spec, S, (self.sx(S) * spread, 0, 0))

    def secondary(self, spec, p, drag=0.0, sway=0.0, k=1.0, ph=0.0, amp=1.0, up=0.0):
        """Scarf / hair / hat follow-through: drag (deg backward), oscillation lagging the body."""
        if 'scarf_1' in self.bones:
            spec['scarf_1'] = (drag * 0.6 + amp * 7 * sn(p, k, ph - 0.1) + up, amp * 4 * sn(p, k / 2 if k > 1 else k, ph - 0.15) + sway, 0)
            spec['scarf_2'] = (drag * 0.5 + amp * 10 * sn(p, k, ph - 0.22) + up * 0.6, amp * 6 * sn(p, k / 2 if k > 1 else k, ph - 0.28) + sway * 1.3, 0)
        if 'hair_1' in self.bones:
            spec['hair_1'] = (drag * 0.15 + amp * 3.5 * sn(p, k, ph - 0.12), amp * 2 * sn(p, k / 2 if k > 1 else k, ph - 0.2), 0)
        if 'hair_2' in self.bones:
            spec['hair_2'] = (drag * 0.25 + amp * 7 * sn(p, k, ph - 0.24), amp * 4 * sn(p, k / 2 if k > 1 else k, ph - 0.3), 0)
        if 'hat' in self.bones:
            spec['hat'] = (amp * 1.8 * sn(p, k, ph - 0.1) - drag * 0.05, 0, amp * 1.2 * sn(p, k / 2 if k > 1 else k, ph - 0.15))

    # ------------------------------------------------------------ gait
    def foot_track(self, S, phi, S_len, beta, lift, th_hs, th_to, yc):
        A0 = self.ank[S]
        heel_y = A0.y + self.heel_len
        toe_y = self.toe[S].y - 0.03 * self.k
        y0 = yc - S_len * beta / 2

        def stance(ph):
            Fy = y0 + S_len * ph
            h_end, t_start = 0.2 * beta, 0.6 * beta
            if ph < h_end:
                th = -th_hs * (1 - smooth(ph / h_end))
            elif ph < t_start:
                th = 0.0
            else:
                u = (ph - t_start) / (beta - t_start)
                th = th_to * u * u
            if th < 0:
                piv = V((A0.x, Fy + (heel_y - A0.y), 0))
                rel = V((0, A0.y - heel_y, A0.z))
            else:
                piv = V((A0.x, Fy + (toe_y - A0.y), 0))
                rel = V((0, A0.y - toe_y, A0.z))
            q = Quaternion((1, 0, 0), math.radians(th))
            return piv + q @ rel, th
        if phi <= beta:
            return stance(phi)
        s = (phi - beta) / (1 - beta)
        a, tha = stance(beta)
        b, thb = stance(0.0)
        y = lerp(a.y, b.y, ease(s))
        z = lerp(a.z, b.z, smooth(s)) + lift * math.sin(math.pi * min(1, s ** 0.75)) ** 1.1
        th = interp([(0, tha), (0.45, -4), (0.8, thb * 0.7), (1.0, thb)], s)
        return V((A0.x, y, z)), th

    def gait_setup(self, speed, frames, beta, lift, th_hs, th_to, bob, reach=0.965, yc=0.0):
        T = frames / 30.0
        S_len = speed * T
        g = dict(S=S_len, beta=beta, lift=lift, th_hs=th_hs, th_to=th_to, yc=yc, frames=frames)
        Lmax = self.l_leg * reach
        drop = 0.0
        for i in range(120):
            p = i / 120
            z_nom = bob(p)
            for S, off in (('L', 0.0), ('R', 0.5)):
                a, _ = self.foot_track(S, (p + off) % 1, S_len, beta, lift, th_hs, th_to, yc)
                H0 = self.hip[S]
                dy = H0.y - a.y
                dx = H0.x - a.x
                rem = Lmax * Lmax - dy * dy - dx * dx
                zlim = a.z - H0.z + math.sqrt(max(rem, 0))
                drop = max(drop, z_nom - zlim)
        g['drop'] = drop
        return g

    def gait_legs(self, spec, g, p):
        ik = spec.setdefault('ik', {})
        for S, off in (('L', 0.0), ('R', 0.5)):
            a, th = self.foot_track(S, (p + off) % 1, g['S'], g['beta'], g['lift'], g['th_hs'], g['th_to'], g['yc'])
            ik['leg_' + S] = dict(target=a, end=eul((th, 0, 0)), pole=(self.sx(S) * 0.12, -1, 0.1))

    # ------------------------------------------------------------ clips
    def walk(self, frames=None):
        st = self.st
        e = st['energy']
        leg = self.l_leg
        if frames is None:
            step = st['step'] * leg
            frames = max(16, int(round(2 * step / WALK_SPEED * 30)))
        bob_a = 0.014 * self.k * st['bounce']

        def bob(p):
            return bob_a * (-cs(p, 2, -0.1))
        g = self.gait_setup(WALK_SPEED, frames, 0.6, 0.075 * leg * st['walk_lift'], 16, 34, bob, reach=0.95)
        self._walk_g = g
        sway = 0.012 * self.k * st['sway'] * (1 + st['stout'])
        yaw = 5.0 * e
        roll = 3.0 * st['sway'] * (1 + st['stout'])
        swing = 20.0 * st['arm_swing']
        lean = st['lean']

        def pose(p):
            s = {}
            z = bob(p) - g['drop']
            s['hips@loc'] = (sway * sn(p, 1, 0.0), 0, z)
            s['hips'] = (lean * 0.3, -roll * sn(p, 1, 0.02), -yaw * cs(p))
            s['spine'] = (lean * 0.4 + 1.2 * cs(p, 2, -0.15) + st['hunch'] * 0.5, roll * 0.4 * sn(p, 1, 0.05), yaw * 0.7 * cs(p, 1, 0.03))
            s['chest'] = (lean * 0.3 + st['hunch'] * 0.5, roll * 0.3 * sn(p, 1, 0.08), yaw * 0.9 * cs(p, 1, 0.05))
            s['neck'] = (-lean * 0.3 - st['hunch'] * 0.4, 0, -yaw * 0.4 * cs(p, 1, 0.06))
            s['head'] = (-lean * 0.4 - st['head_up'] - 1.5 * cs(p, 2, -0.2) - st['hunch'] * 0.3, -roll * 0.3 * sn(p, 1, 0.1), -yaw * 0.5 * cs(p, 1, 0.08))
            self.gait_legs(s, g, p)
            for S in 'LR':
                sg = self.sx(S)
                a = swing * cs(p, 1, 0.5 if S == 'L' else 0.0)  # forward when the opposite leg is forward
                a_lag = swing * cs(p, 1, (0.5 if S == 'L' else 0.0) - 0.05)
                s['upperarm_' + S] = self.arm_rot(S, fwd=a_lag - 2, out=1 + st['arm_out'] + 1.5 * sn(p, 2), twist=0)
                fl = st['elbow'] + 14 * max(0, math.sin(TAU * (p + (0.5 if S == 'L' else 0.0)) + 1.2)) * st['arm_swing']
                s['forearm_' + S] = (-fl, 0, 0)
                s['hand_' + S] = (-4 - 5 * cs(p, 1, (0.5 if S == 'L' else 0.0) - 0.12), 0, 0)
            self.secondary(s, p, drag=12 * e, k=2, ph=0.0, amp=1.0)
            return s
        return 'Walk', frames, pose, True

    def run(self, frames=None):
        st = self.st
        leg = self.l_leg
        if frames is None:
            frames = max(12, int(round(2 * 1.02 * leg * st['run_step'] / RUN_SPEED * 30 * 1.55)))
        bob_a = 0.03 * self.k * st['bounce']

        def bob(p):
            return bob_a * (-cs(p, 2, -0.22))
        g = self.gait_setup(RUN_SPEED, frames, 0.36, 0.16 * leg, 10, 48, bob, reach=0.975, yc=-0.03 * self.k)
        lean = 11.0 + st['lean']

        def pose(p):
            s = {}
            z = bob(p) - g['drop']
            s['hips@loc'] = (0.01 * self.k * sn(p), 0, z)
            s['hips'] = (lean * 0.35, -2.5 * sn(p, 1, 0.02), -8 * cs(p))
            s['spine'] = (lean * 0.35 + 2.5 * cs(p, 2, -0.18), 1.2 * sn(p), 6 * cs(p, 1, 0.03))
            s['chest'] = (lean * 0.3, 0, 9 * cs(p, 1, 0.05))
            s['neck'] = (-lean * 0.4, 0, -6 * cs(p, 1, 0.06))
            s['head'] = (-lean * 0.55 - 2.5 * cs(p, 2, -0.25), 0, -6 * cs(p, 1, 0.08))
            self.gait_legs(s, g, p)
            for S in 'LR':
                ph = 0.5 if S == 'L' else 0.0
                a = 42 * st['arm_swing'] * cs(p, 1, ph - 0.04)
                s['upperarm_' + S] = self.arm_rot(S, fwd=a + 6, out=10 + st['arm_out'], twist=0)
                s['forearm_' + S] = (-(75 + 20 * cs(p, 1, ph - 0.1)), 0, self.sx(S) * 10)
                s['hand_' + S] = (-8, 0, 0)
            self.secondary(s, p, drag=38, k=2, ph=0.0, amp=1.4, up=10)
            return s
        return 'Run', frames, pose, True

    def standing(self, s, p, breathe=1.0, shift=1.0, lk=1.0, hunch=None):
        """Idle base: breathing (2 per loop), weight shift (1 per loop), feet planted."""
        st = self.st
        hn = st['hunch'] if hunch is None else hunch
        b = sn(p, 2)
        w = sn(p, 1)
        s['hips@loc'] = (0.016 * self.k * shift * w, 0.003 * self.k * sn(p, 1, 0.25), -0.006 * self.k * abs(w) * shift - 0.004 * self.k)
        s['hips'] = (0, -2.2 * shift * w, 1.5 * shift * sn(p, 1, 0.1))
        s['spine'] = (1.2 * breathe * b + hn * 0.5 + st['lean'] * 0.3, 1.6 * shift * w, -1.0 * shift * sn(p, 1, 0.1))
        s['chest'] = (-1.4 * breathe * b + hn * 0.5, 0.8 * shift * w, 0)
        s['neck'] = (0.6 * breathe * b - hn * 0.4, 0, 0)
        s['head'] = (-st['head_up'] - hn * 0.4 + 1.2 * sn(p, 2, 0.15), -1.5 * shift * w + 2 * lk * sn(p, 1, 0.35),
                     6 * lk * sn(p, 1, 0.3) * sstep(0, 0.2, abs(sn(p, 1, 0.3))))
        self.plant_both(s, st['stance'])
        for S in 'LR':
            s['upperarm_' + S] = self.arm_rot(S, fwd=1.5 + 1.2 * breathe * sn(p, 2, 0.1), out=3 + st['arm_out'] - self.sx(S) * 1.2 * w,
                                              twist=4)
            s['forearm_' + S] = (-(st['elbow'] + 3 * sn(p, 2, 0.05)), 0, 0)
            s['hand_' + S] = (-5, 0, self.sx(S) * 4)
        self.secondary(s, p, drag=4, k=2, ph=0.0, amp=0.35)
        return s

    def idle(self, frames=120):
        def pose(p):
            s = self.standing({}, p)
            ih = self.st['idle_hands']
            if ih:
                ih(self, s, p)
            return s
        return 'Idle', frames, pose, True

    def talk(self, frames=120):
        st = self.st
        e = st['energy']

        def pose(p):
            s = self.standing({}, p, breathe=0.8, shift=0.7, lk=0.3)
            s['head'] = add(s['head'], (4 * e * sn(p, 4, 0.1) * bump(p, 0.05, 0.95), 3 * sn(p, 1, 0.2), 4 * sn(p, 1, 0.6)))
            s['chest'] = add(s['chest'], (1.5 * sn(p, 2, 0.3), 0, 5 * e * sn(p, 1, 0.1)))
            # right hand presents (palm up) in the first half, left in the second, a shrug at the end
            gR = env(p, 0.06, 0.16, 0.42, 0.55)
            gL = env(p, 0.4, 0.5, 0.7, 0.8)
            sh = env(p, 0.74, 0.8, 0.9, 0.99)
            for S, gk in (('R', gR), ('L', gL)):
                beat = sn(p, 6, 0.1 if S == 'R' else 0.35) * gk
                pos = self.L(0.15 + 0.03 * beat * e, -0.2 - 0.03 * e, 0.8 + 0.035 * beat * e, S)
                shrug = self.L(0.25, -0.1, 0.76, S)
                g = max(gk, sh)
                tgt = pos if gk >= sh else shrug
                self.arm_to(s, S, g, tgt, pole=(self.sx(S) * 1.0, 0.4, -0.8),
                            end_rel=(-10, 0, self.sx(S) * (-70 if gk >= sh else -80)))
            s['upperarm_L'] = s['upperarm_R'] = None
            s['chest'] = add(s['chest'], (0, 0, 0))
            s['neck'] = add(s['neck'], (-3 * sh, 0, 0))
            s['head'] = add(s['head'], (-4 * sh, 6 * sh, 0))
            if 'talk_extra' in st:
                st['talk_extra'](self, s, p)
            return s
        return 'Talk', frames, pose, True

    def wave(self, frames=48, side=None):
        S = side or self.st['wave_side']
        sg = self.sx(S)
        e = self.st['energy']

        def pose(p):
            s = self.standing({}, p * 0.4, breathe=0.5, shift=0.3, lk=0)
            up = env(p, 0.0, 0.2, 0.78, 1.0)
            wv = sn(clamp((p - 0.18) / 0.62), 3) * env(p, 0.18, 0.25, 0.72, 0.8)
            s['upperarm_' + S] = add(tuple(x * (1 - up) for x in s['upperarm_' + S]),
                                     tuple(x * up for x in self.arm_rot(S, fwd=20, out=128 * (0.85 + 0.15 * e), twist=0)))
            s['forearm_' + S] = (-(35 + 8 * wv) * up, 0, sg * 22 * wv * up)
            s['hand_' + S] = (0, sg * 10 * wv * up, sg * 18 * wv * up)
            s['chest'] = add(s['chest'], (0, -sg * 4 * up, sg * 5 * up))
            s['head'] = add(s['head'], (-3 * up, -sg * 5 * up, sg * 6 * up))
            s['hips@loc'] = (s['hips@loc'][0] - sg * 0.012 * self.k * up, s['hips@loc'][1], s['hips@loc'][2])
            self.secondary(s, p, drag=3, k=3, amp=0.6)
            return s
        return 'Wave', frames, pose, False

    def cheer(self, frames=40, jump=0.16):
        e = self.st['energy']

        def pose(p):
            s = {}
            # 0-.18 crouch, .18-.3 launch, .3-.62 air, .62-.72 land, -> settle
            crouch = env(p, 0.0, 0.16, 0.2, 0.28) + 0.85 * env(p, 0.6, 0.66, 0.7, 0.9)
            air = bump(p, 0.2, 0.66)
            hz = -0.07 * self.k * crouch + jump * self.k * e * air
            s['hips@loc'] = (0, 0, hz)
            s['hips'] = (8 * crouch - 4 * air, 0, 0)
            s['spine'] = (6 * crouch - 6 * air, 0, 0)
            s['chest'] = (4 * crouch - 6 * air, 0, 0)
            s['neck'] = (-4 * crouch, 0, 0)
            s['head'] = (-6 * air - 6 * env(p, 0.6, 0.7, 0.85, 1.0), 0, 0)
            tuck = air * 0.9
            for S in 'LR':
                sg = self.sx(S)
                off = V((sg * 0.01, 0.02 * tuck, 0.12 * self.k * tuck + max(0, hz) * 0.0))
                self.plant(s, S, off + V((0, 0, max(0, hz) - 0.0)) * 1.0, pitch=18 * tuck)
                arms = env(p, 0.14, 0.3, 0.72, 0.96)
                pump = sn(p, 4) * bump(p, 0.3, 0.7)
                s['upperarm_' + S] = add(self.arm_rot(S, fwd=-10 * crouch, out=5, twist=0),
                                         tuple(x * arms for x in self.arm_rot(S, fwd=12, out=148 + 8 * pump, twist=10)))
                s['forearm_' + S] = (-(15 + 50 * arms * (0.5 + 0.5 * abs(pump))), 0, 0)
                s['hand_' + S] = (-10 * arms, 0, 0)
            self.secondary(s, p, drag=0, k=2, amp=1.5, up=-15 * air)
            return s
        return 'Cheer', frames, pose, False

    def bow(self, frames=54, depth=38):
        def pose(p):
            s = self.standing({}, 0.0, breathe=0.3, shift=0, lk=0)
            b = env(p, 0.05, 0.35, 0.6, 0.92)
            s['hips'] = (depth * 0.45 * b, 0, 0)
            s['hips@loc'] = (0, 0.03 * self.k * b, -0.01 * self.k * b)
            s['spine'] = (depth * 0.3 * b, 0, 0)
            s['chest'] = (depth * 0.2 * b, 0, 0)
            s['neck'] = (depth * 0.1 * b, 0, 0)
            s['head'] = (depth * 0.15 * b, 0, 0)
            for S in 'LR':
                s['upperarm_' + S] = self.arm_rot(S, fwd=-4 + 26 * b, out=2 - 4 * b, twist=6)
                s['forearm_' + S] = (-(10 + 25 * b), 0, self.sx(S) * 15 * b)
                s['hand_' + S] = (0, 0, self.sx(S) * 10 * b)
            self.plant_both(s, self.st['stance'])
            self.secondary(s, p, drag=0, k=1, amp=0.3, up=-20 * b)
            return s
        return 'Bow', frames, pose, False

    def sad(self, frames=120):
        def pose(p):
            s = self.standing({}, p, breathe=1.3, shift=0.4, lk=0.2, hunch=12)
            sigh = bump(p, 0.35, 0.75)
            s['head'] = add(s['head'], (22 + 5 * sigh, 0, 6 * sn(p, 1, 0.2)))
            s['neck'] = add(s['neck'], (8, 0, 0))
            s['chest'] = add(s['chest'], (6 + 3 * sigh, 0, 0))
            for S in 'LR':
                s['upperarm_' + S] = self.arm_rot(S, fwd=4 + 2 * sigh, out=0 + self.st['arm_out'], twist=10)
                s['forearm_' + S] = (-10, 0, 0)
            self.secondary(s, p, drag=0, k=1, amp=0.2, up=-10)
            return s
        return 'Sad', frames, pose, True

    # ------------------------------------------------------------ airborne (player)
    def jump(self, frames=12):
        def pose(p):
            s = {}
            push = env(p, 0.0, 0.12, 0.2, 0.42)
            ext = bump(p, 0.18, 0.62)
            tuck = smooth((p - 0.45) / 0.55)
            s['hips@loc'] = (0, 0, -0.05 * self.k * push + 0.02 * self.k * ext)
            s['hips'] = (10 * push - 4 * ext + 4 * tuck, 0, 0)
            s['spine'] = (6 * push - 5 * ext + 3 * tuck, 0, 0)
            s['chest'] = (-6 * ext, 0, 0)
            s['head'] = (-6 * ext - 4 * tuck, 0, 0)
            for S in 'LR':
                sg = self.sx(S)
                lift = V((0, (-0.02 if S == 'L' else 0.03) * tuck, (0.16 if S == 'L' else 0.08) * self.k * tuck))
                self.plant(s, S, lift + V((0, 0, 0.02 * self.k * ext)), pitch=25 * ext + 15 * tuck)
                s['upperarm_' + S] = add(self.arm_rot(S, fwd=-25 * push, out=6),
                                         tuple(x * max(ext, tuck) for x in self.arm_rot(S, fwd=40 if S == 'R' else 20, out=45, twist=0)))
                s['forearm_' + S] = (-(15 + 35 * tuck), 0, 0)
                s['hand_' + S] = (-10, 0, 0)
            self.secondary(s, p, drag=-10 * tuck, k=1, amp=0.8, up=-25 * ext)
            return s
        return 'Jump', frames, pose, False

    def fall(self, frames=24):
        def pose(p):
            s = {}
            s['hips@loc'] = (0, 0, 0.0)
            s['hips'] = (4, 1.5 * sn(p), 0)
            s['spine'] = (2 + 1.5 * sn(p, 1, 0.2), 0, 0)
            s['chest'] = (-3, 0, 2 * sn(p, 1, 0.3))
            s['head'] = (-8 + 2 * sn(p, 1, 0.4), 0, 0)
            for S in 'LR':
                sg = self.sx(S)
                ph = 0 if S == 'L' else 0.5
                self.plant(s, S, V((0, -0.02 * sn(p, 1, ph), (0.12 + 0.04 * sn(p, 1, ph)) * self.k)), pitch=18)
                flail = sn(p, 1, ph + 0.25)
                s['upperarm_' + S] = self.arm_rot(S, fwd=18 + 12 * flail, out=80 + 12 * sn(p, 2, ph), twist=0)
                s['forearm_' + S] = (-(30 + 15 * sn(p, 1, ph + 0.1)), 0, 0)
                s['hand_' + S] = (-15 + 10 * flail, 0, 0)
            self.secondary(s, p, drag=0, k=2, amp=1.6, up=-75)
            return s
        return 'Fall', frames, pose, True

    def land(self, frames=15):
        def pose(p):
            s = {}
            imp = math.exp(-((p - 0.12) / 0.12) ** 2) if p > 0.12 else 1.0 - (1 - p / 0.12) * 0.7
            rec = 1 - smooth((p - 0.2) / 0.8)
            d = imp * 0.6 + 0.4 * rec * (1 - smooth((p - 0.1) / 0.9))
            s['hips@loc'] = (0, 0.01 * self.k * d, -0.11 * self.k * d)
            s['hips'] = (14 * d, 0, 0)
            s['spine'] = (8 * d, 0, 0)
            s['chest'] = (4 * d, 0, 0)
            s['head'] = (-12 * d, 0, 0)
            for S in 'LR':
                self.plant(s, S, (self.sx(S) * 0.01 * d, 0, 0))
                s['upperarm_' + S] = self.arm_rot(S, fwd=22 * d, out=26 * d + 4, twist=0)
                s['forearm_' + S] = (-(15 + 25 * d), 0, 0)
                s['hand_' + S] = (-10 * d, 0, 0)
            self.secondary(s, p, drag=0, k=1.5, amp=1.2 * d, up=30 * d)
            return s
        return 'Land', frames, pose, False

    # ------------------------------------------------------------ utility
    def arm_to(self, s, S, g, pos, pole=None, end_rel=(0, 0, 0), rest_off=(0, 0, 0)):
        """IK arm blended from the rest wrist (g=0) to pos (g=1), both in chest rest space
        (the chest's posed transform carries them)."""
        k = self.k
        rest = self.wr[S] + V(rest_off)
        tgt = rest.lerp(V(pos), clamp(g))
        er = tuple(x * clamp(g) for x in end_rel)
        default_pole = V((self.sx(S) * 0.7, 0.8, -0.3))
        pl = default_pole.lerp(V(pole), clamp(g)) if pole is not None else default_pole
        s.setdefault('ik', {})['arm_' + S] = dict(target=self.chest_pt(tgt), pole=tuple(pl), end_rel=er)

    def L(self, x, y, z, S='R'):
        """Scaled chest-space point; x is given for the RIGHT side (which is -X: the rig faces -Y, its left
        shoulder is +X) and mirrored for the left. (Before this was fixed, right-hand targets landed on the
        left, crossing the arms in Cast, Point, Swim, Tread and Talk.)"""
        k = self.k
        return V((x * k * (-1 if S == 'R' else 1), y * k, z * k))

    def arm_ik(self, s, S, target_local, pole=None, end_rel=(0, 0, 0), frame='chest', end=None):
        tgt = self.chest_pt(target_local) if frame == 'chest' else (
            self.hips_pt(target_local) if frame == 'hips' else V(target_local))
        g = dict(target=tgt, pole=pole or (self.sx(S) * 0.6, 0.6, -0.5), end_rel=end_rel)
        if end is not None:
            g['end'] = end
        s.setdefault('ik', {})['arm_' + S] = g


def make_clips(A, names, extra=None):
    table = {
        'Idle': A.idle, 'Walk': A.walk, 'Run': A.run, 'Talk': A.talk, 'Wave': A.wave, 'Cheer': A.cheer,
        'Bow': A.bow, 'Sad': A.sad, 'Jump': A.jump, 'Fall': A.fall, 'Land': A.land,
    }
    if extra:
        table.update(extra)
    out = []
    post = A.st.get('post')
    for n in names:
        nm, frames, fn, loop = table[n]()
        if post:
            fn = (lambda f, n: (lambda p: post(A, f(p), p, n)))(fn, n)
        record(A.arm, A.P, n, frames, fn, loop=loop)
        out.append((n, frames, loop))
    print('  clips:', ', '.join(f'{n}({f}{"" if l else " once"})' for n, f, l in out))
    return out


def humanoid_clips(arm, body, who, names=None, extra=None, **style):
    import player_anims
    A = Anim(arm, body, who, **style)
    if A.st.get('cane'):
        A.st['post'] = player_anims.cane_post
    ex = player_anims.extras(A, who)
    if extra:
        ex.update(extra(A))
    return make_clips(A, names, ex)


# ================================================================ Tamo

def tamo_clips(arm):
    P = Poser(arm)

    def arms(s, aL, aR):
        # the arm points swing in the face plane (about Y): positive raises them
        s['arm_L'] = (0, -aL, 0)
        s['arm_R'] = (0, aR, 0)

    def floatp(p):
        s = {'root@loc': (0, 0, 0.025 * sn(p, 1)), 'body': (3 * sn(p, 1, 0.2), 5 * sn(p, 1, 0.35), 4 * sn(p, 1, 0.1))}
        arms(s, 10 * sn(p, 2, 0.1), 10 * sn(p, 2, 0.35))
        return s

    def happy(p):
        spin = 360 * ease(clamp((p - 0.1) / 0.6))
        hop = bump(p, 0.05, 0.45) * 0.12 + bump(p, 0.45, 0.75) * 0.05
        s = {'root@loc': (0, 0, hop), 'body': (0, 12 * sn(p, 2) * bump(p, 0, 1), spin)}
        wave = 40 * bump(p, 0.0, 1.0)
        arms(s, wave + 20 * sn(p, 6), wave + 20 * sn(p, 6, 0.5))
        return s

    def talk(p):
        s = {'root@loc': (0, 0, 0.018 * sn(p, 2)), 'body': (5 * sn(p, 4, 0.1), 6 * sn(p, 1), 6 * sn(p, 1, 0.3))}
        arms(s, 25 + 20 * sn(p, 3), 15 + 25 * sn(p, 3, 0.4))
        return s

    def sad(p):
        s = {'root@loc': (0, 0, -0.03 + 0.01 * sn(p, 1)), 'body': (18 + 3 * sn(p, 1), 6 * sn(p, 1, 0.25), 0)}
        arms(s, -35 + 4 * sn(p, 1), -35 + 4 * sn(p, 1, 0.2))
        return s

    def fire(p):
        k = math.exp(-((p - 0.12) / 0.1) ** 2) if p > 0.12 else smooth(p / 0.12)
        s = {'root@loc': (0, 0.06 * k, 0.01 * k), 'body': (-28 * k, 0, 0)}
        arms(s, 35 * k, 35 * k)
        return s
    for name, frames, fn, loop in (('Float', 90, floatp, True), ('Happy', 40, happy, False), ('Talk', 60, talk, True),
                                   ('Sad', 90, sad, True), ('Fire', 18, fire, False)):
        record(arm, P, name, frames, fn, loop=loop)
