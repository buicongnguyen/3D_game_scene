"""Character-specific Starline clips (Mika's gameplay set, Rin's fishing/ferry, Genzo, Hana, Ota).

Every function returns (name, frames, pose_fn, loop). Hand targets are in chest rest space via
A.L(x, y, z, side) (x given for the RIGHT side, mirrored for the left), so gestures ride on the torso.
"""
import math
from mathutils import Vector, Quaternion
from anims import sn, cs, env, bump, add, ease, smooth, clamp, lerp, sstep
from human_lib import eul

TAU = math.tau

V = Vector


# ---------------------------------------------------------------- Mika (player)

def aim(A, frames=60):
    """Lantern raised forward in the right hand, left hand pointing the way; loops while held."""
    def pose(p):
        s = A.standing({}, p, breathe=0.6, shift=0.15, lk=0)
        s['hips@loc'] = (0, 0.01 * A.k, -0.025 * A.k)
        s['hips'] = (4, 0, -8)
        s['spine'] = (4 + 0.8 * sn(p, 2), 0, 4)
        s['chest'] = (-2 + 0.8 * sn(p, 2, 0.2), 0, 6)
        s['neck'] = (-2, 0, -2)
        s['head'] = (-6 + 0.6 * sn(p, 2, 0.3), -2, 0)
        A.plant(s, 'L', (0.01 * A.k, -0.05 * A.k, 0), yaw=4)
        A.plant(s, 'R', (-0.02 * A.k, 0.07 * A.k, 0), yaw=-10)
        wob = 0.006 * A.k * sn(p, 1, 0.2)
        A.arm_to(s, 'R', 1, A.L(0.07, -0.31, 0.98) + V((0, 0, wob)), pole=(-1, 0.3, -1), end_rel=(20, 0, 0))
        A.arm_to(s, 'L', 1, A.L(0.06, -0.37, 1.02, 'L') + V((0, 0, wob * 0.5)), pole=(1, 0.5, -0.6), end_rel=(0, 0, 60))
        A.secondary(s, p, drag=4, k=2, amp=0.3)
        return s
    return 'Aim', frames, pose, True


def point(A, frames=36):
    def pose(p):
        s = A.standing({}, p * 0.3, breathe=0.4, shift=0.2, lk=0)
        g = env(p, 0.0, 0.22, 0.72, 1.0)
        pulse = bump(p, 0.22, 0.4) * 0.5
        s['chest'] = add(s['chest'], (-3 * g, 0, 8 * g))
        s['head'] = add(s['head'], (-7 * g, -3 * g, 4 * g))
        s['hips'] = add(s['hips'], (0, 0, 4 * g))
        A.arm_to(s, 'L', g, A.L(0.13, -0.36 - 0.03 * pulse, 1.1 + 0.02 * pulse, 'L'), pole=(1, 0.4, -0.8),
                 end_rel=(-8, 0, 50))
        A.secondary(s, p, drag=3, k=2, amp=0.5 * g)
        return s
    return 'Point', frames, pose, False


def cast(A, frames=40, energy=1.0):
    """Overhead fishing cast with the rod in the right hand, ending in the Reel pose."""
    def pose(p):
        s = A.standing({}, 0.0, breathe=0.2, shift=0.0, lk=0)
        wind = env(p, 0.0, 0.32, 0.36, 0.5)
        whip = env(p, 0.36, 0.5, 2.0, 3.0)
        settle = smooth((p - 0.5) / 0.5)
        yaw = -22 * wind + 16 * whip * (1 - settle) + 6 * settle
        s['hips@loc'] = (0, (0.02 * wind - 0.03 * whip) * A.k, -0.015 * A.k * whip)
        s['hips'] = (0, 0, yaw * 0.4)
        s['spine'] = (-6 * wind + 10 * whip * (1 - settle * 0.6), 0, yaw * 0.3)
        s['chest'] = (-4 * wind + 6 * whip * (1 - settle), 0, yaw * 0.3)
        s['head'] = (4 * wind - 8 * whip, 0, -yaw * 0.5)
        A.plant(s, 'L', (0.0, -0.06 * A.k, 0), yaw=5)
        A.plant(s, 'R', (-0.01 * A.k, 0.06 * A.k, 0), yaw=-8)
        up = A.L(0.2, 0.04, 1.24)
        fwd = A.L(0.12, -0.34, 1.0)
        reel_p = A.L(0.1, -0.27, 0.84)
        if p < 0.36:
            tgt = A.wr['R'].lerp(up, ease(p / 0.32))
        elif p < 0.5:
            tgt = up.lerp(fwd, ease((p - 0.36) / 0.14))
        else:
            tgt = fwd.lerp(reel_p, settle)
        er = (lerp(0, -40, wind) + 30 * whip * (1 - settle), 0, 0)
        A.arm_to(s, 'R', 1, tgt, pole=(-1, 0.4, -0.6), end_rel=er)
        ltgt = A.L(0.02, -0.22, 0.86, 'L').lerp(A.L(-0.06, -0.26, 0.84, 'L'), settle)
        A.arm_to(s, 'L', env(p, 0.0, 0.3, 2, 3) * 0.7 + 0.3 * settle, ltgt, pole=(1, 0.3, -0.8))
        A.secondary(s, p, drag=0, k=2, amp=1.2 * energy)
        return s
    return 'Cast', frames, pose, False


def reel(A, frames=30):
    def pose(p):
        s = A.standing({}, p, breathe=0.5, shift=0.2, lk=0)
        s['hips'] = add(s['hips'], (0, 0, 6))
        s['chest'] = add(s['chest'], (3, 0, 0))
        s['head'] = add(s['head'], (4, 0, 0))
        A.plant(s, 'L', (0.0, -0.06 * A.k, 0), yaw=5)
        A.plant(s, 'R', (-0.01 * A.k, 0.06 * A.k, 0), yaw=-8)
        A.arm_to(s, 'R', 1, A.L(0.1, -0.27, 0.84) + V((0, 0, 0.004 * A.k * sn(p, 2))), pole=(-1, 0.3, -0.8))
        c = A.L(-0.06, -0.26, 0.84, 'L')
        r = 0.032 * A.k
        a = math.tau * 2 * p
        tgt = c + V((0, math.cos(a) * r, math.sin(a) * r))
        A.arm_to(s, 'L', 1, tgt, pole=(1, 0.3, -0.8), end_rel=(0, 0, 30))
        A.secondary(s, p, drag=2, k=2, amp=0.3)
        return s
    return 'Reel', frames, pose, True


def interact(A, frames=36):
    def pose(p):
        s = A.standing({}, p * 0.2, breathe=0.3, shift=0.1, lk=0)
        g = env(p, 0.0, 0.35, 0.62, 1.0)
        grab = bump(p, 0.35, 0.6)
        s['hips@loc'] = (0, 0.02 * A.k * g, -0.05 * A.k * g)
        s['hips'] = (14 * g, 0, -4 * g)
        s['spine'] = (8 * g, 0, 0)
        s['chest'] = (4 * g, 0, 0)
        s['head'] = (4 * g, 0, 0)
        A.plant(s, 'L', (0, -0.05 * A.k * g, 0))
        A.plant(s, 'R', (0, 0.03 * A.k * g, 0))
        A.arm_to(s, 'R', g, A.L(0.08, -0.4 - 0.02 * grab, 0.72 - 0.02 * grab), pole=(-1, 0.5, -0.4),
                 end_rel=(20 * grab, 0, 0))
        s['upperarm_L'] = add(s['upperarm_L'], A.arm_rot('L', fwd=10 * g, out=6 * g))
        A.secondary(s, p, drag=0, k=1.5, amp=0.6 * g)
        return s
    return 'Interact', frames, pose, False


def stir(A, frames=36):
    def pose(p):
        s = A.standing({}, p, breathe=0.4, shift=0.3, lk=0)
        a = math.tau * p
        s['hips@loc'] = (0.008 * A.k * math.cos(a), 0.005 * A.k, -0.02 * A.k)
        s['hips'] = (6, 0, 2 * math.sin(a))
        s['spine'] = (6, 1.5 * math.cos(a), 3 * math.sin(a))
        s['chest'] = (4, 0, 3 * math.sin(a))
        s['head'] = (10, 0, -3 * math.sin(a))
        A.plant_both(s, 0.02 * A.k)
        c = A.L(0.05, -0.33, 0.74)
        r = 0.06 * A.k
        A.arm_to(s, 'R', 1, c + V((math.cos(a) * r, math.sin(a) * r * 0.8, 0)), pole=(-1, 0.6, -0.4),
                 end_rel=(30, 0, 0))
        A.arm_to(s, 'L', 1, A.L(0.13, -0.3, 0.72, 'L'), pole=(1, 0.5, -0.5), end_rel=(10, 0, 40))
        A.secondary(s, p, drag=2, k=1, amp=0.3)
        return s
    return 'Stir', frames, pose, True


def hammer(A, frames=24):
    def pose(p):
        s = A.standing({}, p, breathe=0.2, shift=0.1, lk=0)
        # raise 0-.55 (slow), strike .55-.68 (fast), rebound .68-1
        if p < 0.55:
            r = ease(p / 0.55)
        elif p < 0.68:
            r = 1 - ease((p - 0.55) / 0.13)
        else:
            r = 0.12 * bump(p, 0.68, 1.0)
        hit = bump(p, 0.62, 0.85)
        s['hips@loc'] = (0, 0.01 * A.k, (-0.02 - 0.025 * hit) * A.k)
        s['hips'] = (6 + 4 * hit, 0, 4)
        s['spine'] = (4 - 6 * r + 8 * hit, 0, 3 * r)
        s['chest'] = (2 - 4 * r + 6 * hit, 0, 4 * r)
        s['head'] = (10 - 4 * r, 0, 0)
        A.plant_both(s, 0.03 * A.k)
        s['upperarm_R'] = A.arm_rot('R', fwd=lerp(55, 150, r), out=lerp(8, 18, r), twist=-10)
        s['forearm_R'] = (-lerp(25, 95, r), 0, 0)
        s['hand_R'] = (lerp(10, -25, r), 0, 0)
        A.arm_to(s, 'L', 1, A.L(0.1, -0.34, 0.7, 'L'), pole=(1, 0.5, -0.5), end_rel=(0, 0, 40))
        A.secondary(s, p, drag=0, k=1, amp=0.7 * (0.3 + hit))
        return s
    return 'Hammer', frames, pose, True


# ---------------------------------------------------------------- Rin

def pole(A, frames=60):
    """Ferry poling on the right side: plant, push down and back, recover."""
    def pose(p):
        s = A.standing({}, p, breathe=0.4, shift=0.3, lk=0)
        push = ease(p / 0.55) if p < 0.55 else 1 - ease((p - 0.55) / 0.45)
        s['hips@loc'] = (0, (0.02 - 0.04 * push) * A.k, (-0.02 - 0.03 * push) * A.k)
        s['hips'] = (6 + 10 * push, 0, -10)
        s['spine'] = (4 + 8 * push, -3 * push, -6)
        s['chest'] = (2 + 4 * push, 0, -8 + 4 * push)
        s['head'] = (-6 - 6 * push, 3 * push, 12)
        A.plant(s, 'L', (0.0, -0.1 * A.k, 0), yaw=-6)
        A.plant(s, 'R', (-0.02 * A.k, 0.1 * A.k, 0), yaw=-14)
        top = A.L(0.2, -0.16, 1.08).lerp(A.L(0.24, 0.02, 0.9), push)
        low = A.L(0.22, -0.1, 0.84).lerp(A.L(0.26, 0.08, 0.66), push)
        A.arm_to(s, 'L', 1, top, pole=(1, 0.2, -1), end_rel=(0, 0, -40))
        A.arm_to(s, 'R', 1, low, pole=(-1, 0.4, -0.6), end_rel=(0, 0, 30))
        A.secondary(s, p, drag=6, k=1, amp=0.8)
        return s
    return 'Pole', frames, pose, True


# ---------------------------------------------------------------- Genzo

def arms_crossed(A, frames=120):
    def pose(p):
        s = A.standing({}, p, breathe=1.1, shift=0.8, lk=0.8)
        s['head'] = add(s['head'], (2, 4 * sn(p, 1, 0.1), 0))
        tap = bump((p * 4) % 1, 0.0, 0.3) * env(p, 0.5, 0.55, 0.85, 0.9)
        A.plant(s, 'R', (0, 0, 0.02 * A.k * tap), pitch=-12 * tap)
        br = 0.004 * A.k * sn(p, 2)
        A.arm_to(s, 'R', 1, A.L(-0.1, -0.2, 0.86) + V((0, 0, br)), pole=(-1, 0.2, -0.4), end_rel=(0, 0, 70))
        A.arm_to(s, 'L', 1, A.L(-0.1, -0.17, 0.83, 'L') + V((0, 0, br)), pole=(1, 0.2, -0.5), end_rel=(0, 0, -70))
        return s
    return 'ArmsCrossed', frames, pose, True


# ---------------------------------------------------------------- Hana

def knead(A, frames=40):
    def pose(p):
        s = A.standing({}, p, breathe=0.4, shift=0.2, lk=0)
        push = ease(p / 0.45) if p < 0.45 else 1 - ease((p - 0.45) / 0.55)
        s['hips@loc'] = (0, -0.01 * A.k * push, -0.01 * A.k)
        s['hips'] = (6 + 4 * push, 0, 0)
        s['spine'] = (5 + 5 * push, 0, 0)
        s['chest'] = (3 + 3 * push, 0, 0)
        s['head'] = (8, 0, 3 * sn(p))
        A.plant_both(s, 0.02 * A.k)
        for S in 'RL':
            tgt = A.L(0.08, -0.3 - 0.07 * push, 0.8 - 0.05 * push, S)
            A.arm_to(s, S, 1, tgt, pole=(A.sx(S) * 1, 0.5, -0.5), end_rel=(-35 - 15 * push, 0, A.sx(S) * 10))
        return s
    return 'Knead', frames, pose, True


# ---------------------------------------------------------------- idle flavours

def hands_on_hips(A, s, p, sides='LR'):
    for S in sides:
        A.arm_to(s, S, 1, A.L(0.19, 0.0, 0.72, S) + V((0, 0, 0.003 * A.k * sn(p, 2))), pole=(A.sx(S), 0.6, 0.1),
                 end_rel=(0, 0, A.sx(S) * -80))


def hands_clasped_front(A, s, p):
    for S in 'LR':
        A.arm_to(s, S, 1, A.L(0.035, -0.2, 0.72, S) + V((0, 0, 0.004 * A.k * sn(p, 2))), pole=(A.sx(S), 0.5, -0.4),
                 end_rel=(0, 0, A.sx(S) * -60))


def hands_on_belly(A, s, p):
    for S in 'LR':
        A.arm_to(s, S, 1, A.L(0.06, -0.26, 0.78, S) + V((0, 0, 0.005 * A.k * sn(p, 2))), pole=(A.sx(S), 0.4, -0.5),
                 end_rel=(0, 0, A.sx(S) * -70))


def hand_behind_back(A, s, p, S='L'):
    A.arm_to(s, S, 1, A.L(0.07, 0.2, 0.74, S) + V((0, 0, 0.003 * A.k * sn(p, 2))), pole=(A.sx(S), 0.2, -0.4),
             end_rel=(30, 0, A.sx(S) * -20))


def cane_post(A, s, p, clip):
    """Ota: the right hand always holds the cane with its tip on the ground (planted or walking)."""
    c = A.st['cane']
    tip0 = V(c['tip'])
    wr0 = A.wr['R']
    if clip == 'Walk':
        g = A._walk_g
        # the cane moves with the LEFT foot (the weak side), same stance timing
        a, th = A.foot_track('L', p % 1, g['S'], g['beta'], g['lift'] * 0.8, 0, 0, g['yc'])
        tip = V((tip0.x - 0.03 * A.k, a.y - A.ank['L'].y + tip0.y - 0.08 * A.k, max(0.0, a.z - A.ank['L'].z)))
        tilt = (-6 - 6 * sn(p, 1, 0.1), 0, 0)
    else:
        tip = tip0 + V((0.0, -0.1 * A.k, 0))
        tilt = (-5, 3, 0)
    R = eul(tilt)
    wrist = tip + R @ (wr0 - tip0)
    s.setdefault('ik', {})['arm_R'] = dict(target=wrist, pole=(-1, 0.6, -0.3), end=R)
    return s


def _loop_path(keys, u):
    """Cyclic path through (t, Vector) keys (t ascending in [0, 1)); eased between keys."""
    n = len(keys)
    for i in range(n):
        t0, a = keys[i]
        t1, b = keys[(i + 1) % n]
        if i == n - 1:
            t1 += 1.0
        uu = u if u >= t0 else u + 1.0
        if t0 <= uu < t1:
            k = (uu - t0) / (t1 - t0)
            k = k * k * (3 - 2 * k)
            return a.lerp(b, k)
    return keys[0][1].copy()


def swim(A, frames=34):
    """Head-up front crawl, authored upright: the runtime tips the body forward about the hips, so
    armature 'up' becomes 'ahead' and 'in front of the chest' becomes 'under the body'.
    Alternating arm strokes (reach, pull under, high-elbow recovery over the back), a flutter kick,
    body roll about the long axis and the head held up out of the water."""
    k = A.k

    def arm_path(S):
        return [
            (0.00, A.L(0.13, -0.10, 1.58, S)),   # entry: reaching ahead
            (0.20, A.L(0.15, -0.26, 1.24, S)),   # catch: pressing down/back under the chest
            (0.42, A.L(0.17, -0.18, 0.86, S)),   # pull
            (0.55, A.L(0.19, -0.06, 0.64, S)),   # finish at the hip
            (0.72, A.L(0.33, 0.12, 0.92, S)),    # recovery: elbow high over the back
            (0.88, A.L(0.24, 0.04, 1.36, S)),
        ]
    paths = {S: arm_path(S) for S in 'LR'}

    def pose(p):
        s = {}
        roll = 16 * sn(p, 1, 0.1)                   # rolls toward the pulling arm
        s['hips@loc'] = (0, 0, 0.006 * k * sn(p, 2))
        s['hips'] = (2, 0, roll * 0.7)
        s['spine'] = (3, 0, roll * 0.25)
        s['chest'] = (2, 0, roll * 0.2)
        s['neck'] = (-22, 0, -roll * 0.5)
        s['head'] = (-34 + 3 * sn(p, 2, 0.2), 0, -roll * 0.4)
        for S in 'LR':
            ph = 0.0 if S == 'R' else 0.5
            u = (p + ph) % 1.0
            A.arm_to(s, S, 1, _loop_path(paths[S], u), pole=(A.sx(S) * 0.9, 0.9, 0.2),
                     end_rel=(-20 * bump(u, 0.12, 0.55), 0, 0))
            # flutter kick: two beats per stroke, toes pointed, knees nearly straight
            kick = sn(p, 2, 0.0 if S == 'L' else 0.5)
            A.plant(s, S, (A.sx(S) * -0.01 * k, 0.11 * k * kick, 0.04 * k + 0.02 * k * abs(kick)), pitch=62)
        A.secondary(s, p, drag=-30, k=2, amp=0.8, up=-50)
        return s
    return 'Swim', frames, pose, True


def tread(A, frames=48):
    """Treading water, upright: slow eggbeater legs, hands sculling flat at chest height."""
    k = A.k

    def pose(p):
        s = {}
        s['hips@loc'] = (0, 0, 0.012 * k * sn(p, 2, 0.1))
        s['hips'] = (10, 0, 2 * sn(p))
        s['spine'] = (2 + 1.5 * sn(p, 2), 0, -1.5 * sn(p))
        s['chest'] = (-2, 0, 0)
        s['neck'] = (-4, 0, 0)
        s['head'] = (-6 + 2 * sn(p, 2, 0.3), 0, 6 * sn(p, 1, 0.35))
        for S in 'LR':
            ph = 0.0 if S == 'L' else 0.5
            sc = sn(p, 2, ph)
            A.arm_to(s, S, 1, A.L(0.30 + 0.09 * sc, -0.24 + 0.03 * cs(p, 2, ph), 0.9, S), pole=(A.sx(S) * 0.9, 0.5, -0.4),
                     end_rel=(0, 0, A.sx(S) * (35 * sc)))
            a = TAU * (p + ph)
            A.plant(s, S, (A.sx(S) * 0.05 * k + 0.05 * k * math.cos(a), -0.04 * k + 0.07 * k * math.sin(a), 0.2 * k + 0.04 * k * math.sin(a)),
                    pitch=35 + 10 * math.sin(a), yaw=A.sx(S) * 25)
        A.secondary(s, p, drag=-8, k=1, amp=0.7, up=-30)
        return s
    return 'Tread', frames, pose, True


def extras(A, who):
    ex = {}
    if who == 'mika':
        ex.update(Aim=lambda: aim(A), Point=lambda: point(A), Cast=lambda: cast(A), Reel=lambda: reel(A),
                  Interact=lambda: interact(A), Stir=lambda: stir(A), Hammer=lambda: hammer(A),
                  Swim=lambda: swim(A), Tread=lambda: tread(A))
    if who == 'rin':
        ex.update(Cast=lambda: cast(A, energy=1.4), Reel=lambda: reel(A), Pole=lambda: pole(A))
    if who == 'genzo':
        ex.update(ArmsCrossed=lambda: arms_crossed(A))
    if who == 'hana':
        ex.update(Knead=lambda: knead(A))
    return ex
