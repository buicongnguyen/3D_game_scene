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


def hang(A, frames=72):
    """Hanging from the Star Kite's handle bar: both arms reach up and a little forward in a dead hang
    (straight, hands gripping over the bar in front of the forehead), the head tipped back to look up
    and out at the view, legs dangling with knees soft and toes pointed, swinging idly like a kid on a
    swing; the scarf and hair stream back in the wind. The runtime pins the palms to the bar, so the
    hips' slow sway becomes a pendulum swing of the whole body about the hands."""
    k = A.k

    def pose(p):
        s = {}
        s['hips@loc'] = (0, 0, 0)
        s['hips'] = (-2 + 1.5 * sn(p, 1, 0.1), 2.0 * sn(p, 1, 0.3), 3.5 * sn(p, 1))
        s['spine'] = (-3 + 0.8 * sn(p, 2), 0.6 * sn(p, 1, 0.35), -1.2 * sn(p, 1, 0.05))
        s['chest'] = (-3 - 0.8 * sn(p, 2, 0.1), 0, -1.0 * sn(p, 1, 0.1))
        s['neck'] = (-7, 0, 3 * sn(p, 1, 0.45))
        s['head'] = (-9 + 1.5 * sn(p, 2, 0.2), -2 * sn(p, 1, 0.5), 7 * sn(p, 1, 0.5))
        for S in 'LR':
            sx = A.sx(S)
            # dead hang: straight arms up, slightly out and forward so the bar clears the fringe
            d = V((sx * 0.377, -0.458, 0.804)).normalized()
            tgt = A.sh[S] + d * (A.l_arm * 0.999)
            A.arm_to(s, S, 1, tgt, pole=(sx * 1.0, 0.5, 0.1), end_rel=(38, 0, sx * -6))
            # dangling legs: soft knees, pointed toes, an idle alternating swing
            ph = 0.0 if S == 'L' else 0.5
            sw = sn(p, 1, ph)
            s['thigh_' + S] = (-12 + 9 * sw, sx * -3, sx * 2)
            s['shin_' + S] = (22 + 12 * sn(p, 1, ph + 0.12), 0, 0)
            s['foot_' + S] = (38 + 8 * sn(p, 1, ph + 0.2), 0, 0)
        A.secondary(s, p, drag=72, k=3, amp=1.3, up=8)
        return s
    return 'Hang', frames, pose, True


# ---------------------------------------------------------------- villagers (Town Life)

SEAT_H = 0.45   # Sit: seat top above the feet's ground (m); the clip drops the hips onto it
SIT_TOE = 24.0  # Sit: grown-ups point their toes down by up to this many degrees to reach the ground


def hop(A, frames=24):
    """In-place two-footed hop (hopscotch); the root stays put, the runtime may slide it forward
    during the air time (p 0.3-0.7). Kids get more height from their bounce style."""
    hgt = 0.13 * A.st['bounce']

    def pose(p):
        s = {}
        crouch = env(p, 0.0, 0.18, 0.22, 0.3) + 0.8 * env(p, 0.68, 0.74, 0.78, 0.98)
        air = bump(p, 0.24, 0.74)
        hz = -0.06 * A.k * crouch + hgt * A.k * air
        s['hips@loc'] = (0, 0, hz)
        s['hips'] = (10 * crouch - 3 * air, 0, 0)
        s['spine'] = (6 * crouch - 4 * air, 0, 0)
        s['chest'] = (3 * crouch - 3 * air, 0, 0)
        s['head'] = (-4 * crouch + 4 * air, 0, 0)
        tuck = air
        for S in 'LR':
            A.plant(s, S, (0, 0.01 * A.k * tuck, 0.1 * A.k * tuck * A.st['bounce']), pitch=22 * tuck)
            arms = env(p, 0.12, 0.3, 0.62, 0.9)
            s['upperarm_' + S] = add(A.arm_rot(S, fwd=-22 * crouch, out=6),
                                     tuple(x * arms for x in A.arm_rot(S, fwd=28, out=26, twist=0)))
            s['forearm_' + S] = (-(20 + 30 * arms), 0, 0)
            s['hand_' + S] = (-8, 0, 0)
        A.secondary(s, p, drag=0, k=2, amp=1.2, up=-15 * air)
        return s
    return 'Jump', frames, pose, False


BROOM_GRIP = (0.603, -0.457, 3.086)   # three.js Euler XYZ of the broom on grip_R with Sweep (src/game/townlife.js GRIP)


def three_euler(r):
    """three.js Euler XYZ (radians) as a quaternion: R = Rx @ Ry @ Rz."""
    return (Quaternion((1, 0, 0), r[0]) @ Quaternion((0, 1, 0), r[1]) @ Quaternion((0, 0, 1), r[2]))


def grip_point(A, D, euler, local):
    """Posed armature-space position of a point of a prop parented to grip_R with the three.js Euler `euler`;
    `local` is in the prop's three.js space (+Y = Blender +Z of the prop)."""
    P = A.P
    rest = P.h['grip_R'] + P.R['grip_R'] @ (three_euler(euler) @ V(local))
    return P.apply(D['grip_R'], rest)


def left_grasp(A, at, axis, fingers=(0, -1, 0), radius=0.014):
    """IK spec for the LEFT hand closed round a pole through `at` along `axis` (armature space): fingers point along
    `fingers` (made perpendicular to the pole), the palm faces the pole."""
    from human_lib import _frame_rot
    P = A.P
    u = V(axis).normalized()
    a0 = (P.t['hand_L'] - P.h['hand_L']).normalized()
    p0 = V((-1, 0, 0))
    p0 = (p0 - a0 * p0.dot(a0)).normalized()
    a1 = V(fingers)
    a1 = (a1 - u * a1.dot(u)).normalized()
    p1 = a1.cross(u)
    if p1.x > 0:                       # the left hand comes from the left: its palm faces -X
        p1 = -p1
    R = _frame_rot(a0, p0, a1, p1)
    g = P.h['grip_R']
    palm0 = V((-g.x, g.y, g.z))        # the left palm centre (mirror of grip_R)
    wrist = V(at) - R @ (palm0 - P.h['hand_L']) - p1 * radius
    return dict(target=wrist, pole=(1, 0.5, -0.5), end=R)


def sweep(A, frames=48):
    """Straw-broom sweeping: two strokes per loop. Right hand low on the handle (the broom is on grip_R with
    BROOM_GRIP), left hand closed round the handle 0.36 m higher; each stroke pushes the bristles from the right
    foot toward the centre, then a lighter lifted return. The right wrist height is solved so the bristle tips
    brush the ground (kids hold a 0.75x broom), and the left hand is put on the handle where it really is."""
    bs = 0.75 if A.st['bounce'] > 1.2 else 1.0      # the runtime scales a kid's broom to 0.75
    top_l = (0, 0.33 * bs, 0)
    tips = [(sx_ * 0.17 * bs, -0.79 * bs, 0) for sx_ in (-1, 0, 1)]      # the straw fan's lower edge

    def pose(p):
        s = A.standing({}, p, breathe=0.3, shift=0.2, lk=0)
        u = (p * 2) % 1.0
        x = (1 - ease(u / 0.55)) if u < 0.55 else ease((u - 0.55) / 0.45)   # 1 = right end, 0 = centre
        lift = bump(u, 0.55, 1.0)
        yaw = -10 + 16 * (1 - x)
        s['hips@loc'] = (-0.01 * A.k * x, 0.01 * A.k, -0.03 * A.k)
        s['hips'] = (8, 0, yaw * 0.3)
        s['spine'] = (8, 0, yaw * 0.3)
        s['chest'] = (6, 0, yaw * 0.3)
        s['head'] = (14, 0, -yaw * 0.4)
        A.plant(s, 'L', (0.03 * A.k, -0.04 * A.k, 0), yaw=8)
        A.plant(s, 'R', (-0.04 * A.k, 0.03 * A.k, 0), yaw=-10)
        dx = 0.06 * (x - 0.5)
        pt = A.L(0.12 + dx, -0.3, 0.64 + 0.02 * lift)
        A.arm_to(s, 'L', 1, A.L(0.02 + dx * 0.4, -0.16, 0.9 + 0.01 * lift), pole=(1, 0.4, -0.6), end_rel=(0, 0, 0))
        want = (0.004 + 0.035 * lift) * A.k
        # Solve once with a relaxed wrist, then put the lowest bristle tip at `want`: first by tipping the broom
        # about the grip (up to 16 degrees of wrist: the handle top swings away from the face), the rest by moving
        # the wrist straight up or down with the hand's orientation kept (pure translation, so it is exact).
        s['ik']['arm_R'] = dict(target=A.chest_pt(pt), pole=(-1, 0.6, -0.3), end_rel=(0, 0, 0))
        A.P.solve(s)
        D = A.P.D
        hand_q = D['hand_R'][0].copy()
        wrist = A.P.apply(D['hand_R'], A.P.h['hand_R'])
        g0 = grip_point(A, D, BROOM_GRIP, (0, 0, 0))
        tp = [grip_point(A, D, BROOM_GRIP, t) for t in tips]
        ax = (tp[1] - g0).cross(V((0, 0, 1)))
        best = (1e9, Quaternion())
        if ax.length > 1e-5:
            for i in range(-16, 17):
                q = Quaternion(ax.normalized(), math.radians(i))
                e = abs(want - min((g0 + q @ (t - g0)).z for t in tp)) + 0.0004 * abs(i)
                if e < best[0]:
                    best = (e, q)
        q = best[1]
        dz = want - min((g0 + q @ (t - g0)).z for t in tp)
        s['ik']['arm_R'] = dict(target=g0 + q @ (wrist - g0) + V((0, 0, dz)), pole=(-1, 0.6, -0.3), end=q @ hand_q)
        A.P.solve(s)
        D = A.P.D
        g0, g1 = grip_point(A, D, BROOM_GRIP, (0, 0, 0)), grip_point(A, D, BROOM_GRIP, top_l)
        s['ik']['arm_L'] = left_grasp(A, g1, g1 - g0)
        A.secondary(s, p, drag=0, k=2, amp=0.4)
        return s
    return 'Sweep', frames, pose, True


def carry(A, frames=48):
    """Holding a bucket / basket handle in front with both hands at waist height (forearms forward);
    loops as an idle with a gentle breath and weight shift. The prop hangs from the right grip."""
    def pose(p):
        s = A.standing({}, p, breathe=0.8, shift=0.4, lk=0.5)
        s['spine'] = add(s['spine'], (-3, 0, 0))     # leans back a touch against the weight
        s['chest'] = add(s['chest'], (-2, 0, 0))
        s['head'] = add(s['head'], (5, 0, 0))
        br = 0.004 * A.k * sn(p, 2)
        for S in 'RL':
            A.arm_to(s, S, 1, A.L(0.075, -0.27, 0.72, S) + V((0, 0, br)), pole=(A.sx(S), 0.6, -0.3),
                     end_rel=(-30, 0, A.sx(S) * -70))
        return s
    return 'Carry', frames, pose, True


def sit(A, frames=60):
    """Sitting upright on a seat SEAT_H high, hands resting on the thighs. Rotation clip plus a hips
    drop (hips@loc), so the runtime keeps the root ON THE GROUND directly under the hips, i.e. at the
    seat's centre line, facing away from the backrest. Kids swing their dangling feet."""
    k = A.k
    hip0 = (A.hip['L'] + A.hip['R']) / 2
    drop = (SEAT_H + 0.075 * k) - hip0.z          # hip joints sit ~7.5 cm (scaled) above the seat top
    l_th = (A.knee['L'] - A.hip['L']).length
    l_sh = (A.ank['L'] - A.knee['L']).length
    kid = A.st['bounce'] > 1.2
    # The seat is tall for these short-legged people: with level thighs nobody's feet reach the ground. Grown-ups
    # let the thighs slope down over the seat's front edge (the knee drops up to 4.5 cm) and point the toes down to
    # the ground (up to SIT_TOE degrees); who still cannot reach (Mika, Sora) dangles relaxed, toes down.
    miss = (hip0.z + drop - l_sh * 0.97) - A.ank['L'].z
    slope = 0.0 if kid else clamp(miss, 0.0, 0.045 * k)
    foot_l = (V((A.toe['L'].x, A.toe['L'].y, 0)) - V((A.ank['L'].x, A.ank['L'].y, 0))).length
    gap = max(0.0, miss - slope)
    toe = 0.0 if kid else min(SIT_TOE, math.degrees(math.asin(min(1.0, gap / max(foot_l, 1e-3)))))

    def pose(p):
        s = A.standing({}, p, breathe=0.9, shift=0.0, lk=0.8)
        s['hips@loc'] = (0, 0, drop)
        s['hips'] = (-4, 0, 0)
        s['spine'] = add(s['spine'], (5, 0, 0))
        s['chest'] = add(s['chest'], (3, 0, 0))
        for S in 'LR':
            sx = A.sx(S)
            knee = A.hip[S] + V((sx * 0.02 * k, -math.sqrt(l_th ** 2 - slope ** 2), drop - slope))
            ank_y = knee.y + 0.04 * k
            ank_z = knee.z - l_sh * 0.97
            swing = 0.0
            if kid:
                swing = sn(p, 2, 0.0 if S == 'L' else 0.5)
            if ank_z < A.ank[S].z:               # feet reach the ground: rest them flat, a little forward
                ank_z = A.ank[S].z
                ank_y = knee.y - math.sqrt(max((l_sh * 0.97) ** 2 - (knee.z - ank_z) ** 2, 0)) * 0.35
            tgt = V((A.ank[S].x + sx * 0.02 * k, ank_y - 0.07 * k * swing, ank_z + 0.03 * k * max(swing, 0)))
            A.plant(s, S, tgt - A.ank[S], pitch=(15 * swing if kid else toe), pole=(sx * 0.1, -1, 0.2))
            # hands on the thighs, a little in front of the hip
            wr = A.hip[S] + V((sx * 0.01 * k, -0.17 * k, 0.07 * k + drop - slope * 0.17 * k / l_th + A.st.get('lap', 0.0)))
            wr = wr + V((0, 0, 0.003 * k * sn(p, 2)))
            A.arm_ik(s, S, wr, pole=(sx * 0.8, 0.6, 0.0), end=(70, 0, 0))
            s['ik']['arm_' + S]['target'] = wr
        A.secondary(s, p, drag=2, k=1, amp=0.3)
        return s
    return 'Sit', frames, pose, True


def throw(A, frames=30):
    """Underarm toss with the right hand (ball in grip_R): back-swing 0-.4, forward swing, release at
    p = 0.55 (frame 16 of 30), follow-through."""
    def pose(p):
        s = A.standing({}, 0.0, breathe=0.2, shift=0.0, lk=0)
        back = env(p, 0.0, 0.38, 0.4, 0.55)
        fwd = smooth((p - 0.4) / 0.2) * (1 - smooth((p - 0.75) / 0.25))
        a = -45 * back + 85 * fwd
        s['hips@loc'] = (0, (0.02 * back - 0.03 * fwd) * A.k, -0.02 * A.k * back)
        s['hips'] = (4 * back, 0, -8 * back + 6 * fwd)
        s['spine'] = (6 * back - 4 * fwd, 0, -6 * back + 6 * fwd)
        s['chest'] = (2 * back - 3 * fwd, 0, -4 * back + 4 * fwd)
        s['head'] = (-4 * fwd, 0, 4 * back - 6 * fwd)
        A.plant(s, 'L', (0.0, -0.08 * A.k, 0), yaw=4)
        A.plant(s, 'R', (-0.01 * A.k, 0.08 * A.k, 0), yaw=-10)
        s['upperarm_R'] = A.arm_rot('R', fwd=a, out=6, twist=6)
        s['forearm_R'] = (-(12 + 18 * fwd), 0, 0)
        s['hand_R'] = (-15 * back + 25 * fwd, 0, 0)
        s['upperarm_L'] = A.arm_rot('L', fwd=20 * back - 15 * fwd, out=14, twist=0)
        s['forearm_L'] = (-25, 0, 0)
        A.secondary(s, p, drag=0, k=2, amp=0.8 * (back + fwd))
        return s
    return 'Throw', frames, pose, False


def kick(A, frames=30):
    """Right-foot kick of a ball lying ~0.3 m (adult scale) in front of the right foot: wind-up back
    0-.35, strike at p = 0.48 (frame 14 of 30), follow-through, recover. Left foot planted."""
    k = A.k

    def pose(p):
        s = A.standing({}, 0.0, breathe=0.2, shift=0.0, lk=0)
        wind = env(p, 0.0, 0.32, 0.36, 0.48)
        hit = env(p, 0.38, 0.5, 0.58, 0.9)
        s['hips@loc'] = (-0.03 * k * (wind + hit), 0.0, -0.02 * k * (wind + hit))
        s['hips'] = (6 * wind - 8 * hit, 0, 0)
        s['spine'] = (4 * wind + 6 * hit, 0, 0)
        s['chest'] = (2 * wind + 4 * hit, 0, 0)
        s['head'] = (8 * wind + 10 * hit, 0, 0)
        A.plant(s, 'L', (0.0, 0.0, 0))
        y = 0.18 * k * wind - 0.32 * k * hit
        z = 0.12 * k * wind + 0.14 * k * hit
        A.plant(s, 'R', (0.0, y, z), pitch=-40 * wind + 25 * hit)
        for S in 'LR':
            c = 1 if S == 'L' else -1
            s['upperarm_' + S] = A.arm_rot(S, fwd=c * (20 * hit - 15 * wind), out=22 * (wind + hit) + 4, twist=0)
            s['forearm_' + S] = (-(20 + 15 * hit), 0, 0)
        A.secondary(s, p, drag=0, k=2, amp=1.0 * (wind + hit))
        return s
    return 'Kick', frames, pose, False


CUSHION_H = 0.10   # SitFloor: floor-cushion top (m); root on the floor at the cushion centre


def sit_floor(A, frames=90):
    """Cross-legged on a floor cushion CUSHION_H high: hips rest on the cushion (root on the floor at
    its centre, facing -Y like every clip), knees out to the sides on the floor, ankles crossed in
    front, hands resting on the knees; slow breath and a look-around head turn."""
    k = A.k
    hip0 = (A.hip['L'] + A.hip['R']) / 2
    drop = (CUSHION_H + 0.085 * k) - hip0.z
    l_th = (A.knee['L'] - A.hip['L']).length
    l_sh = (A.ank['L'] - A.knee['L']).length
    # joint heights that keep the boots, shins and knees ON the floor (they were up to 4 cm under it)
    knee_z, ank_z = 0.092 * k, {'L': 0.095 * k, 'R': 0.105 * k}

    def flat(v, z, length, d):
        dz = z - v.z
        h = math.sqrt(max(length ** 2 - dz ** 2, 1e-6))
        d = V((d[0], d[1], 0)).normalized()
        return V((v.x + d.x * h, v.y + d.y * h, z))

    def pose(p):
        s = A.standing({}, p, breathe=0.9, shift=0.0, lk=1.0)
        s['hips@loc'] = (0, 0.01 * k, drop)
        s['hips'] = (-6, 0, 0)
        s['spine'] = add(s['spine'], (9, 0, 0))
        s['chest'] = add(s['chest'], (4, 0, 0))
        s['head'] = add(s['head'], (-6, 0, 0))
        for S in 'LR':
            sx = A.sx(S)
            hp = A.hip[S] + V((0, 0.01 * k, drop))
            knee = flat(hp, knee_z, l_th, (sx * 0.85, -0.5))
            ank = flat(knee, ank_z[S], l_sh * 0.99, (-sx * 0.9, -0.35 if S == 'L' else -0.15))
            s.setdefault('ik', {})['leg_' + S] = dict(target=ank, end=eul((-10, sx * 35, -sx * 70)),
                                                      pole=tuple(knee - hp))
            br = 0.003 * k * sn(p, 2)
            wr = knee + V((-sx * 0.03 * k, -0.01 * k, 0.085 * k + br))
            A.arm_ik(s, S, wr, pole=(sx * 0.8, 0.5, -0.2), end=(60, 0, sx * -20))
            s['ik']['arm_' + S]['target'] = wr
        A.secondary(s, p, drag=2, k=1, amp=0.3)
        return s
    return 'SitFloor', frames, pose, True


def pet(A, frames=42):
    """Crouch and stroke something at knee height ~0.5 m (scaled) in front: down 0-.3, two strokes of
    the right hand .3-.8, back up. Left hand braces on the left knee. Root stays put."""
    k = A.k

    def pose(p):
        s = A.standing({}, 0.0, breathe=0.2, shift=0.0, lk=0)
        g = smooth(env(p, 0.0, 0.3, 0.8, 1.0))
        u = clamp((p - 0.3) / 0.5)
        stroke = sn(u, 2, -0.25) * bump(p, 0.28, 0.82)
        s['hips@loc'] = (0, 0.07 * k * g, -0.3 * k * g)
        s['hips'] = (30 * g, 0, 0)
        s['spine'] = (20 * g, 0, -4 * g)
        s['chest'] = (8 * g, 0, -3 * g)
        s['head'] = (6 * g, 0, 4 * g)
        A.plant(s, 'L', (0.01 * k * g, -0.06 * k * g, 0), pole=(0.3, -1, 0.2))
        A.plant(s, 'R', (-0.02 * k * g, 0.06 * k * g, 0), pole=(-0.3, -1, 0.2))
        tgt = V((-0.05 * k, -0.4 * k - 0.05 * k * stroke, 0.36 * k + 0.012 * k * abs(stroke)))
        rest = A.wr['R']
        A.arm_ik(s, 'R', rest.lerp(tgt, g), pole=(-0.8, 0.5, -0.4), end=(20 * g + 5 * stroke, 0, 0))
        s['ik']['arm_R']['target'] = rest.lerp(tgt, g)
        knee = A.knee['L'] + V((0.01 * k, -0.15 * k, -0.18 * k))
        wl = A.wr['L'].lerp(knee + V((0, -0.02 * k, 0.07 * k)), g)
        A.arm_ik(s, 'L', wl, pole=(0.8, 0.6, -0.2), end=(60 * g, 0, 0))
        s['ik']['arm_L']['target'] = wl
        A.secondary(s, p, drag=-6 * g, k=2, amp=0.4)
        return s
    return 'Pet', frames, pose, False


def extras(A, who):
    ex = {}
    if who.startswith('villager-'):
        ex.update(Interact=lambda: interact(A), Hammer=lambda: hammer(A), Jump=lambda: hop(A), Sweep=lambda: sweep(A),
                  Carry=lambda: carry(A), Sit=lambda: sit(A), Throw=lambda: throw(A), Kick=lambda: kick(A))
    if who == 'mika':
        ex.update(Aim=lambda: aim(A), Point=lambda: point(A), Cast=lambda: cast(A), Reel=lambda: reel(A),
                  Interact=lambda: interact(A), Stir=lambda: stir(A), Hammer=lambda: hammer(A),
                  Swim=lambda: swim(A), Tread=lambda: tread(A), Hang=lambda: hang(A),
                  Sit=lambda: sit(A), SitFloor=lambda: sit_floor(A), Pet=lambda: pet(A))
    if who == 'rin':
        ex.update(Cast=lambda: cast(A, energy=1.4), Reel=lambda: reel(A), Pole=lambda: pole(A))
    if who == 'genzo':
        ex.update(ArmsCrossed=lambda: arms_crossed(A))
    if who == 'hana':
        ex.update(Knead=lambda: knead(A))
    return ex
