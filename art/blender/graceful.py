"""The graceful body option: a dancer's proportions and posture on the people's own skeleton.

The village cast is built as stiff tubes (a straight box torso, square shoulders, thick straight arms held out, short
legs, flat feet, little neck). This module is the other body the character generator can build: the dancers of family
games and festival scenes, wholesome and age-appropriate, shaped mostly by their clothes.

    b = graceful_body('f')            # a young woman, 1.62 m      ('m': a slim young man, 1.72 m)
    hd, parts = head(b, M, ...)       # the house-style head on a longer neck, at ~6 heads tall
    parts += hands(b, M)              # small hands, four real fingers and a thumb that pose (finger bones)
    parts += arm(b, 'L', ...)         # slim arms with a deltoid, elbow and wrist; a sleeve of any length
    parts += leg(b, 'L', ...)         # long slim legs: thigh, knee, calf, ankle

What changes against the village body (numbers for the young woman next to villager-woman, both ~1.62 m):
  * proportions  head 0.27 m (6.0 heads; the villager's 0.32 m is 5.1), hip joint at 52% of the height (46%), a 5 cm
                 visible neck (2 cm), shoulder joints 0.27 m apart (0.28) on a 34-degree trapezius slope (flat)
  * torso        waist 0.20 x 0.14 m between a modest chest and gentle hips (a straight tube): the garments in
                 wardrobe.py follow torso_keys(), so the waist comes from a fitted top, a sash or a skirt's waistband
  * arms         upper arm 3.7 cm, elbow 3.1, forearm 3.3, wrist 2.3 cm radius (a sleeve of 5-5.6 cm), hanging 8 degrees
                 from the body (17); the elbows soft, 8 degrees
  * hands        a 5.8 cm palm, fingers 4.3-5.7 cm long on five finger bones a hand (thumb, index, index2, fingers,
                 fingers2), so a hand can open, point, hold a fan or a hat, clap or make a heart
  * legs         thigh 7.4 / knee 4.7 / calf 5.2 / ankle 3.1 cm; light shoes (wardrobe.py)
  * posture      GRACE / GRACE_M clip styles: upright (lean 0.5), chin a little up, shoulders open, soft elbows, a gentle
                 arm swing; and a fixed scale (b.k = 1): the joints are where they are written, so every performer
                 built on one body shares the very same skeleton (and her clothes fit them all)

Bone names are the people's own (HUMAN_BONES in tests/asset-contracts.mjs) plus optional extras (finger bones, hair,
panels), so every clip of anims.py / player_anims.py / ground_anims.py plays on it.
"""
import math
import bpy
from mathutils import Vector, Matrix, Quaternion
from human_lib import *
from human_lib import SDF
from char_parts import Body, Head, head_sdf, Face, nose, ears
from garments import torso_rings, dense, neck_weights, torso_weights

V = Vector

# ---------------------------------------------------------------------------------------------- proportions
# Final metres (no height normalisation, no leg warp: b.k = 1).
FEMALE = dict(H=1.62, hip_z=0.84, hip_x=0.077, knee_z=0.465, ankle_z=0.072, ankle_y=0.022, toe_y=-0.128,
              spine_z=0.99, chest_z=1.10, neck_z=1.272, headj_z=1.385, sh_x=0.13, sh_z=1.205, sh_y=0.008,
              upper=0.262, fore=0.232, hand=0.078, arm_out=9.0, elbow_bend=8.0, head_c=(0, 0.004, 1.46), foot_out=6.0)
MALE = dict(H=1.72, hip_z=0.895, hip_x=0.085, knee_z=0.495, ankle_z=0.076, ankle_y=0.024, toe_y=-0.142,
            spine_z=1.05, chest_z=1.18, neck_z=1.366, headj_z=1.48, sh_x=0.155, sh_z=1.296, sh_y=0.008,
            upper=0.285, fore=0.252, hand=0.086, arm_out=10.0, elbow_bend=8.0, head_c=(0, 0.004, 1.553), foot_out=7.0)
HEAD_SCALE = {'f': 0.85, 'm': 0.87}

# Torso surface (z, half width, front depth, back depth) in metres: the garments add their own thickness on top.
TORSO = {
    'f': [(0.760, 0.134, 0.077, 0.092), (0.800, 0.139, 0.080, 0.099), (0.850, 0.135, 0.079, 0.096),
          (0.900, 0.121, 0.074, 0.086), (0.950, 0.104, 0.069, 0.074), (1.000, 0.099, 0.067, 0.069),
          (1.060, 0.106, 0.075, 0.071), (1.120, 0.118, 0.085, 0.075), (1.170, 0.124, 0.087, 0.077),
          (1.212, 0.126, 0.079, 0.074), (1.243, 0.117, 0.068, 0.068), (1.262, 0.093, 0.060, 0.062),
          (1.280, 0.062, 0.050, 0.052), (1.300, 0.046, 0.040, 0.044)],
    'm': [(0.820, 0.132, 0.080, 0.090), (0.860, 0.135, 0.082, 0.094), (0.910, 0.131, 0.080, 0.090),
          (0.970, 0.124, 0.078, 0.082), (1.030, 0.121, 0.077, 0.078), (1.090, 0.126, 0.082, 0.079),
          (1.160, 0.141, 0.093, 0.083), (1.230, 0.150, 0.096, 0.086), (1.290, 0.154, 0.088, 0.083),
          (1.330, 0.146, 0.074, 0.074), (1.352, 0.110, 0.064, 0.066), (1.372, 0.070, 0.054, 0.056),
          (1.392, 0.052, 0.045, 0.048)],
}

# Clip styles (anims.STYLE keys): upright, chin a little up, shoulders open, soft elbows, a gentle arm swing.
GRACE = dict(energy=0.95, bounce=0.8, arm_swing=0.7, sway=0.9, lean=0.5, head_up=2.0, elbow=14.0, arm_out=-3.5,
             step=0.9, walk_lift=0.9)
GRACE_M = dict(energy=1.0, bounce=0.85, arm_swing=0.8, sway=0.6, lean=1.0, head_up=1.5, elbow=13.0, arm_out=-3.0,
               step=0.95, walk_lift=1.0)

FINGER_BONES = ('thumb', 'index', 'index2', 'fingers', 'fingers2')


def graceful_body(kind='f', **over):
    """A Body (char_parts) at the graceful proportions, with finger bones in b.extra and a fixed scale (b.k = 1)."""
    P = dict(FEMALE if kind == 'f' else MALE)
    P.update(over)
    H = P.pop('H')
    b = Body(H, **P)
    b.kind = kind
    b.k = 1.0
    b.head_scale = HEAD_SCALE[kind]
    b.hs = 1.04 if kind == 'f' else 1.14          # hand size
    b.fingers = {S: finger_layout(b, S) for S in 'LR'}
    for S in 'LR':
        F = b.fingers[S]
        hand = 'hand_' + S
        b.extra += [('thumb_' + S, F['thumb'][0], F['thumb'][1], hand),
                    ('index_' + S, F['index'][0], F['index'][1], hand),
                    ('index2_' + S, F['index'][1], F['index'][2], 'index_' + S),
                    ('fingers_' + S, F['middle'][0], F['middle'][1], hand),
                    ('fingers2_' + S, F['middle'][1], F['middle'][2], 'fingers_' + S)]
    return b


def finish(b):
    """Graceful bodies are authored at their final size: no warp, no normalisation (body_shape is not applied)."""
    b.k = 1.0
    return 1.0


def torso_keys(b, off=0.0, front=0.0, back=0.0, width=0.0, z0=None, z1=None, flare=None):
    """The torso surface rings for this body, grown by `off` (cloth thickness) and optional extra width/depth.
    flare(z) -> extra half width / depth below the waist (a peplum, a tunic's hem)."""
    out = []
    for z, a, f, g in TORSO[b.kind]:
        if z0 is not None and z < z0 - 1e-6:
            continue
        if z1 is not None and z > z1 + 1e-6:
            continue
        e = flare(z) if flare else 0.0
        out.append((z, a + off + width + e, f + off + front + e * 0.8, g + off + back + e * 0.9))
    return out


def torso_at(b, z):
    """(half width, front depth, back depth) of the bare torso at height z."""
    keys = [(k[0], k[1:]) for k in TORSO[b.kind]]
    return interp(keys, z)

# ---------------------------------------------------------------------------------------------- weights


def top_weights(b, collar=None, tail=0.0):
    """Tops: hips -> spine -> chest along z, the collar onto the neck, and below the hips a share on the thighs."""
    base = torso_weights(b, chest_top=collar)
    zh = b.hip_z

    def fn(co):
        w = base(co)
        if tail > 0 and co.z < zh + 0.04:
            f = tail * sstep(zh + 0.04, zh - 0.16, co.z)
            s = sstep(-0.05, 0.05, co.x)
            w = mix_w((w, 1 - f), ({'thigh_L': s, 'thigh_R': 1 - s}, f))
        return w
    return fn


def skirt_weights(b, top=None, follow=0.85, shins=True, side=1.0):
    """Skirts, panels and coat tails: front and sides ride on the thighs (they lie on the lap in Sit and swing with the
    legs), below the knee the front hangs from the shins. Depends smoothly on position, so two layers a centimetre
    apart bend alike and never cross."""
    zt = b.hip_z + 0.05 if top is None else top
    kz = b.knee_z
    base = torso_weights(b)

    def fn(co):
        w = base(co)
        if co.z < zt:
            front = sstep(0.06, -0.04, co.y)
            f = sstep(zt, zt - 0.3, co.z) * (follow * (0.72 + 0.26 * front))
            g = sstep(kz + 0.06, kz - 0.12, co.z) * (0.25 + 0.65 * front) if shins else 0.0
            s = sstep(-0.06 * side, 0.06 * side, co.x)
            w = mix_w((w, 1 - f), ({'thigh_L': s * (1 - g), 'thigh_R': (1 - s) * (1 - g),
                                    'shin_L': s * g, 'shin_R': (1 - s) * g}, f))
        return w
    return fn


def arm_w(b, S, elbow=0.032):
    sh, el, wr = (getattr(b, k + '_' + S) for k in ('sh', 'el', 'wr'))
    up = (el - sh).normalized()
    fd = (wr - el).normalized()

    def fn(co):
        u = (co - el).dot(up)
        v = (co - wr).dot(fd)
        if v > -0.004:
            return blend2('forearm_' + S, 'hand_' + S, (v + 0.004) / 0.03)
        w = blend2('upperarm_' + S, 'forearm_' + S, (u + elbow) / (2 * elbow))
        # the top of the deltoid shares a little with the chest, so a raised arm does not pinch the shoulder
        ush = (co - sh).dot(up)
        if ush < 0.02:
            c = 0.25 * sstep(0.02, -0.03, ush)
            w = mix_w((w, 1 - c), ({'chest': 1.0}, c))
        return w
    return fn


def leg_w(b, S):
    hip, knee, ank = (getattr(b, k + '_' + S) for k in ('hip', 'knee', 'ank'))

    def fn(co):
        z = co.z
        if z > knee.z - 0.005:
            w = blend2('shin_' + S, 'thigh_' + S, (z - (knee.z - 0.025)) / 0.06)
            # the top of the thigh shares a little with the hips (the seat)
            if z > hip.z - 0.06:
                c = 0.35 * sstep(hip.z - 0.06, hip.z + 0.04, z)
                w = mix_w((w, 1 - c), ({'hips': 1.0}, c))
            return w
        return blend2('foot_' + S, 'shin_' + S, (z - (ank.z + 0.004)) / 0.05)
    return fn

# ---------------------------------------------------------------------------------------------- head and neck


def adult_sdf(c, s, kind='f', w=1.0, jaw=1.0, cheek=1.0, chin=1.0, length=1.0, k=0.034):
    """A young adult's head in the house style: the same smooth union of cranium, jaw, cheeks and chin as head_sdf, with
    a narrower jaw, smaller cheeks and the chin set lower (a longer, slimmer face than the children's round ones)."""
    c = V(c)
    m = kind == 'm'
    f = SDF(k * s)
    f.add(c + V((0, 0.014, 0.024)) * s, (0.137 * s * w, 0.147 * s, 0.148 * s))
    f.add(c + V((0, -0.024, -0.058 * length)) * s, ((0.1 if m else 0.093) * s * w * jaw, 0.098 * s, 0.084 * s * length))
    for sx in (1, -1):
        f.add(c + V((sx * 0.053 * w, -0.06, -0.052)) * s, (0.045 * s * cheek, 0.04 * s * cheek, 0.042 * s * cheek))
        # the angle of the jaw: high and back, so the face narrows to a soft V
        f.add(c + V((sx * (0.056 if m else 0.05) * w * jaw, -0.012, -0.085 * length)) * s,
              (0.032 * s * jaw, 0.036 * s, 0.028 * s))
    f.add(c + V((0, -0.066, -0.124 * length)) * s, ((0.031 if m else 0.026) * s * chin, 0.026 * s * chin, 0.026 * s * chin))
    return f


def head(b, M, sdf=None, seg=40, rings=30):
    """The sculpted head at the graceful scale: a young adult's face (adult_sdf). Returns (Head, parts)."""
    s = b.head_scale
    kw = dict(w=0.92, jaw=0.94, cheek=1.0, chin=1.0, length=0.9)
    if b.kind == 'm':
        kw.update(w=0.95, jaw=1.0, cheek=0.85, chin=1.0, length=1.02)
    kw.update(sdf or {})
    hd = Head(b.head_c, adult_sdf(b.head_c, s, b.kind, **kw), M['skin'], seg=seg, rings=rings)
    return hd, [weigh(hd.ob, 'head')]


def neck(b, M, r=None):
    """A longer, slimmer neck with a slight forward tilt; its foot flares under the collar, its top sinks into the head."""
    r = r or (0.0425 if b.kind == 'f' else 0.05)
    c = b.head_c
    z0, z1 = b.neck_z - 0.035, c.z - 0.06
    pts = [V((0, 0.012, z0)), V((0, 0.012, b.neck_z + 0.012)), V((0, 0.008, (b.neck_z + z1) / 2 + 0.012)), V((0, 0.004, z1))]
    pts = resample(catmull(pts, 4), 14)
    mb = MB('neck')
    # a wide foot (the trapezius, under the collar), a slim column, a little fuller under the jaw
    sweep(mb, pts, M['skin'], rfn=lambda t: (r * interp([(0, 1.55), (0.22, 1.12), (0.5, 0.98), (0.8, 1.02), (1, 1.06)], t),
                                             r * interp([(0, 1.3), (0.22, 1.02), (0.5, 0.9), (0.8, 0.94), (1, 0.97)], t)),
          n=20, cap0='flat', cap1='flat')

    def w(co):
        if co.z > b.headj_z - 0.01:
            return blend2('neck', 'head', (co.z - (b.headj_z - 0.01)) / 0.03)
        return neck_weights(b)(co)
    return weigh(mb.build('neck', angle=80), w)

# ---------------------------------------------------------------------------------------------- hands


def finger_layout(b, S):
    """Joint points of the rest hand: thumb (base, tip), index (MCP, PIP, tip), middle (MCP, PIP, tip), ring, pinky."""
    o, a, p, t = b.hand_frame(S)
    hs = b.hs
    F = {}
    lat = {'index': 0.0185, 'middle': 0.006, 'ring': -0.0065, 'pinky': -0.0175}
    lens = {'index': 0.052, 'middle': 0.057, 'ring': 0.053, 'pinky': 0.043}
    mcp_u = {'index': 0.058, 'middle': 0.060, 'ring': 0.058, 'pinky': 0.053}
    for k in lat:
        L = lens[k] * hs
        base = o + a * (mcp_u[k] * hs) + t * (lat[k] * hs)
        F[k] = (base, base + a * (L * 0.46), base + a * L)
    tb = o + a * (0.017 * hs) + t * (0.021 * hs) + p * (0.006 * hs)
    td = (a * 0.62 + t * 0.55 + p * 0.38).normalized()
    F['thumb'] = (tb, tb + td * (0.042 * hs))
    F['frame'] = (o, a, p, t)
    return F


def curl_axis(b, S):
    """Rest-space axis about which the fingers curl toward the palm (a positive angle closes the hand)."""
    o, a, p, t = b.hand_frame(S)
    return a.cross(p).normalized()


def finger_rots(b, S, prox=0.0, dist=None, index=None, index2=None, thumb=0.0, spread=0.0):
    """Pose spec entries (Quaternions in rest armature space) for one hand's finger bones. Angles in degrees:
    prox/dist curl the middle, ring and little fingers (dist defaults to 1.2 x prox), index/index2 the index finger
    (default: as the others), thumb folds the thumb across the palm."""
    o, a, p, t = b.hand_frame(S)
    ax = a.cross(p).normalized()
    dist = prox * 1.2 if dist is None else dist
    index = prox if index is None else index
    index2 = dist if index2 is None else index2
    tax = (a.cross(t)).normalized()             # the thumb folds toward the palm about this axis
    out = {
        'fingers_' + S: Quaternion(ax, math.radians(prox)) @ Quaternion(p, math.radians(-spread * 0.5)),
        'fingers2_' + S: Quaternion(ax, math.radians(dist)),
        'index_' + S: Quaternion(ax, math.radians(index)) @ Quaternion(p, math.radians(spread)),
        'index2_' + S: Quaternion(ax, math.radians(index2)),
        'thumb_' + S: Quaternion(tax, math.radians(-thumb)),
    }
    return out


HAND_POSES = {
    # (prox, dist, index, index2, thumb, spread)
    'rest': (0, 0, 0, 0, 0, 0),
    'open': (-6, -4, -6, -4, -10, 6),           # a dancer's open hand: fingers long, a little apart
    'soft': (14, 16, 10, 12, 8, 0),
    'fist': (82, 95, 82, 95, 42, 0),
    'point': (82, 95, -4, -2, 38, 0),
    'hold': (58, 62, 52, 58, 34, 0),            # around a mic, a fan handle or a hat's rim
    'heart': (62, 70, 60, 70, -18, 0),           # curled fingers, thumbs out: two hands meet as a heart
    'clap': (-4, -2, -4, -2, -8, 0),
    'v': (82, 95, -4, -2, 38, 14),
}


def hand_pose(b, S, name_or_tuple, k=1.0):
    v = HAND_POSES[name_or_tuple] if isinstance(name_or_tuple, str) else name_or_tuple
    prox, dist, index, index2, thumb, spread = (x * k for x in v)
    return finger_rots(b, S, prox, dist, index, index2, thumb, spread)


def mix_pose(b, S, a_, b_, t):
    A_ = HAND_POSES[a_] if isinstance(a_, str) else a_
    B_ = HAND_POSES[b_] if isinstance(b_, str) else b_
    return hand_pose(b, S, tuple(x + (y - x) * t for x, y in zip(A_, B_)))


def hands(b, M, n=10):
    """Both hands: a softly cupped palm with knuckles, four fingers of three segments and a thumb, each finger weighted
    to its finger bones so the hand can pose."""
    out = []
    for S in 'LR':
        out += hand(b, S, M['skin'], n=n)
    return out


def hand(b, S, m, n=10):
    F = b.fingers[S]
    o, a, p, t = F['frame']
    hs = b.hs
    pw, pt = 0.0285 * hs, 0.0128 * hs
    parts = []
    # palm: wrist stub (inside the cuff) -> knuckles, a rounded section a little cupped on the palm side
    mb = MB('palm_' + S)
    rings, cs = [], []
    prof = [(-0.016, 0.66, 0.86), (-0.004, 0.68, 0.86), (0.008, 0.78, 0.9), (0.022, 0.92, 0.98), (0.036, 0.99, 1.0),
            (0.048, 1.0, 0.96), (0.057, 0.96, 0.86), (0.063, 0.86, 0.72)]
    for u, kw, kt in prof:
        c = o + a * (u * hs) - p * (0.0015 * hs)
        rr = ring(c, t, p, pw * kw, pt * kt, 18, 2.5)
        # cup the palm: pull the middle of the palm face in a little
        rr = [q - p * (0.0018 * hs * max(0.0, (q - c).normalized().dot(p)) ** 2 * (1 if 0.0 < u < 0.055 else 0)) for q in rr]
        rings.append(rr)
        cs.append(c)
    mb.loft(rings, m, cs, cap0=o + a * (-0.02 * hs), cap1=o + a * (0.067 * hs) - p * (0.002 * hs))
    # thenar pad (the ball of the thumb) blended into the palm
    ellipsoid(mb, o + a * (0.022 * hs) + t * (0.016 * hs) + p * (0.006 * hs), (0.012 * hs, 0.017 * hs, 0.009 * hs), m, 10, 7,
              M=Matrix((t, a, p)).transposed())
    palm = mb.build('palm_' + S, angle=70)
    parts.append(weigh(palm, lambda co: blend2('hand_' + S, 'thumb_' + S, ((co - F['thumb'][0]).dot(t) - 0.004 * hs) / 0.01)
                       if (co - o).dot(a) < 0.04 * hs and (co - o).dot(t) > 0.012 * hs else {'hand_' + S: 1.0}))
    # fingers
    rest = {'index': (5, 8, 5), 'middle': (6, 10, 6), 'ring': (7, 11, 7), 'pinky': (8, 12, 8)}
    rad = {'index': 0.0071, 'middle': 0.0074, 'ring': 0.0069, 'pinky': 0.0061}
    ax = a.cross(p).normalized()
    for k in ('index', 'middle', 'ring', 'pinky'):
        mcp, pip, tip = F[k]
        L = (tip - mcp).length
        segs = [L * 0.46, L * 0.30, L * 0.24]
        dirv = a.copy()
        spr = {'index': 3, 'middle': 0, 'ring': -3, 'pinky': -7}[k]
        dirv = (Quaternion(p, math.radians(spr)) @ dirv).normalized()
        pts = [mcp - dirv * 0.012 * hs, mcp]
        cur = mcp.copy()
        joints = [mcp]
        for i, sl in enumerate(segs):
            dirv = (Quaternion(ax, math.radians(rest[k][i])) @ dirv).normalized()
            cur = cur + dirv * sl
            pts.append(cur.copy())
            joints.append(cur.copy())
        r0 = rad[k] * hs
        fm = MB('finger')
        path = catmull(pts, 3)

        def rfn(tt, r0=r0):
            # knuckle, a slim middle, a soft fingertip pad
            k_ = 1.0 + 0.08 * math.exp(-((tt - 0.12) / 0.06) ** 2) + 0.05 * math.exp(-((tt - 0.55) / 0.05) ** 2) - 0.14 * tt
            return (r0 * k_, r0 * 0.86 * k_)
        sweep(fm, path, m, rfn=rfn, n=n, up_fn=lambda q, T: p, cap0=None, cap1='round')
        fob = fm.build('finger', angle=70)
        b1, b2 = ('index_', 'index2_') if k == 'index' else ('fingers_', 'fingers2_')
        pip_pt = joints[1]
        d1 = (joints[1] - joints[0]).normalized()
        d2 = (joints[2] - joints[1]).normalized()

        def fw(co, mcp=mcp, pip_pt=pip_pt, d1=d1, d2=d2, b1=b1, b2=b2):
            u0 = (co - mcp).dot(d1)
            if u0 < 0.004 * hs:
                return blend2('hand_' + S, b1 + S, (u0 + 0.005 * hs) / (0.009 * hs))
            u1 = (co - pip_pt).dot(d2)
            return blend2(b1 + S, b2 + S, (u1 + 0.003 * hs) / (0.006 * hs))
        parts.append(weigh(fob, fw))
    # thumb: from inside the thenar pad, two segments, curving toward the palm
    tb, tt_ = F['thumb']
    td = (tt_ - tb).normalized()
    tax = a.cross(t).normalized()
    d2 = (Quaternion(tax, math.radians(-14)) @ td).normalized()
    pts = [tb - td * 0.01 * hs, tb, tb + td * 0.02 * hs, tb + td * 0.02 * hs + d2 * 0.022 * hs]
    tm = MB('thumb')
    sweep(tm, catmull(pts, 3), m, rfn=lambda u: (0.0094 * hs * (1.04 - 0.2 * u), 0.0082 * hs * (1.04 - 0.18 * u)), n=n,
          up_fn=lambda q, T: p, cap0='round', cap1='round')
    parts.append(weigh(tm.build('thumb', angle=70),
                       lambda co: blend2('hand_' + S, 'thumb_' + S, ((co - tb).dot(td) + 0.006 * hs) / (0.012 * hs))))
    return parts

# ---------------------------------------------------------------------------------------------- arms and legs


def arm(b, S, m_sleeve, m_skin, sleeve=1.0, prof=None, cuff=None, m_cuff=None, puff=0.0, n=16, fold=0.035,
        ball=True, wrist_r=None, m_ball=None):
    """One arm from the shoulder to the wrist. `sleeve` is how far the sleeve reaches over the whole arm (0 = sleeveless,
    0.45 = to above the elbow, 1 = to the wrist); bare skin below it. prof: sleeve radius over the sleeve [(t, r)].
    puff: extra volume at the top of a short sleeve. Returns parts."""
    sh, el, wr = (getattr(b, k + '_' + S) for k in ('sh', 'el', 'wr'))
    up_l, fo_l = (el - sh).length, (wr - el).length
    L = up_l + fo_l
    kk = 1.0 if b.kind == 'f' else 1.12
    # the bare arm's radius along it (0 shoulder, 1 wrist): deltoid, biceps, elbow, forearm, wrist
    skin_r = [(0.0, 0.041), (0.12, 0.039), (0.3, 0.0355), (0.48, 0.0305), (0.54, 0.0305), (0.64, 0.032), (0.82, 0.027),
              (1.0, 0.0225)]
    wrist_r = wrist_r or 0.0232 * kk

    def at(u):
        if u <= up_l / L:
            return sh.lerp(el, u / (up_l / L))
        return el.lerp(wr, (u - up_l / L) / (fo_l / L))
    parts = []
    w = arm_w(b, S)
    us = [0.0, 0.12, 0.25, 0.38, up_l / L - 0.04, up_l / L, up_l / L + 0.05, 0.68, 0.84, 1.0]
    if sleeve > 0:
        u_end = min(sleeve, 1.0)
        ss = [u for u in us if u < u_end - 0.02] + [u_end]
        pts = [at(0.0) + (sh - el).normalized() * 0.004] + [at(u) for u in ss]
        prof = prof or [(0, 0.05), (0.5, 0.047), (1, 0.044)]

        def rfn(tt, u_end=u_end):
            u = tt * u_end
            r = max(interp(prof, tt), interp(skin_r, u) * kk + 0.006)
            r += puff * math.exp(-((tt - 0.25) / 0.25) ** 2)
            return r

        def sfold(tt, ang):
            kf = math.exp(-((tt - 0.55) / 0.2) ** 2)
            return 1 + fold * kf * math.sin(ang * 3 + 1.0 + tt * 4) + fold * 0.4 * math.sin(ang * 5 + tt * 9)
        mb = MB('sleeve')
        if u_end >= 1:
            # a long sleeve stops just short of the wrist joint, open, so the hand comes out of it
            pts[-1] = wr - (wr - el).normalized() * 0.006
        sweep(mb, resample(catmull(pts, 4), 22), m_sleeve, rfn=rfn, n=n, cap0='flat', cap1=None, fold=sfold)
        if True:
            # the sleeve's turned edge: a short inner wall so its open end never shows a gap
            e = pts[-1]
            d = (pts[-1] - at(u_end - 0.04)).normalized()
            r_e = rfn(1.0)
            ringo = ring(e, d.orthogonal().normalized(), d.cross(d.orthogonal().normalized()).normalized(), r_e, r_e, n)
            ringi = [e + (q - e) * 0.82 - d * 0.012 for q in ringo]
            mb.loft([ringo, ringi], m_cuff or m_sleeve, [e, e - d * 0.012])
        parts.append(weigh(mb.build('sleeve', angle=70), w))
        if cuff:
            d = (wr - el).normalized()
            cm = MB('cuff')
            sweep(cm, [wr - d * (cuff + 0.022), wr - d * 0.018], m_cuff or m_sleeve,
                  rfn=lambda tt: interp(prof, 1.0) + 0.004, n=n, cap0='flat', cap1='flat')
            parts.append(weigh(cm.build('cuff', angle=60), w))
    if sleeve < 1:
        u0 = max(0.0, sleeve - 0.05)
        ss = [u0] + [u for u in us if u > u0 + 0.02]
        pts = [at(u) for u in ss]
        pts[-1] = wr + (wr - el).normalized() * 0.008
        mb = MB('bare_arm')
        sweep(mb, resample(catmull(pts, 4), max(6, int(22 * (1 - u0)))), m_skin, rfn=lambda tt, u0=u0: interp(skin_r, u0 + (1 - u0) * tt) * kk,
              n=n, cap0='round' if sleeve <= 0 else None, cap1='flat')
        parts.append(weigh(mb.build('bare_arm', angle=70), w))
    if ball:
        bm = MB('shoulder')
        sx = 1 if S == 'L' else -1
        rb = (0.04 if sleeve > 0.05 else 0.037) * kk
        # the round of the shoulder: a soft oval at the joint (flush with the trapezius line), filling the top of the arm
        # when it is raised
        tilt = Matrix.Rotation(math.radians(-sx * 18), 3, 'Y')
        ellipsoid(bm, sh + V((-sx * 0.006, 0.002, 0.0)), (rb * 1.0, rb * 0.98, rb * 0.9), m_ball or (m_sleeve if sleeve > 0.05 else m_skin),
                  16, 10, M=tilt)
        parts.append(weigh(bm.build('shoulder', angle=70), {'upperarm_' + S: 0.7, 'chest': 0.3}))
    return parts


LEG_SKIN = [(0.0, 0.068), (0.1, 0.074), (0.25, 0.067), (0.4, 0.056), (0.49, 0.046), (0.53, 0.045), (0.6, 0.049),
            (0.68, 0.053), (0.76, 0.049), (0.88, 0.036), (1.0, 0.03)]


def leg(b, S, m, prof=None, top=-0.035, end=1.0, n=16, fold=0.0, start=0.0, cap1='round', name='leg'):
    """One leg tube from the hip (start = 0) to `end` (1 = the ankle); prof: radius over the WHOLE leg [(u, r)] (default
    the bare leg: thigh, knee, calf, ankle). Returns the part."""
    hip, knee, ank = (getattr(b, k + '_' + S) for k in ('hip', 'knee', 'ank'))
    l1, l2 = (knee - hip).length, (ank - knee).length
    Lt = l1 + l2
    kk = 1.0 if b.kind == 'f' else 1.1

    def at(u):
        if u <= l1 / Lt:
            return hip.lerp(knee, u / (l1 / Lt))
        return knee.lerp(ank, (u - l1 / Lt) / (l2 / Lt))
    prof = prof or [(u, r * kk) for u, r in LEG_SKIN]
    us = [u for u in (0.0, 0.1, 0.22, 0.35, l1 / Lt - 0.05, l1 / Lt, l1 / Lt + 0.05, 0.68, 0.84, 0.94, 1.0) if start - 1e-6 <= u <= end + 1e-6]
    if us[0] > start + 1e-6:
        us = [start] + us
    if us[-1] < end - 1e-6:
        us.append(end)
    pts = [at(u) for u in us]
    if start <= 0:
        pts[0] = pts[0] + V((0, 0, top))
    if end >= 1:
        pts[-1] = pts[-1] + V((0, 0, -0.012))
    mb = MB(name)
    f = (lambda tt, ang: 1 + fold * math.exp(-((tt - 0.5) / 0.25) ** 2) * math.sin(ang * 3 + tt * 5)) if fold else None
    sweep(mb, resample(catmull(pts, 4), max(8, int(30 * (end - start)))), m, rfn=lambda tt: interp(prof, start + (end - start) * tt), n=n,
          cap0='round' if start <= 0 else None, cap1=cap1, fold=f)
    return weigh(mb.build(name, angle=70), leg_w(b, S))


def pelvis(b, m, z_top, z_bot, off=0.004, n=32, weights=None, name='pelvis'):
    """The seat / waist shell the legs come out of (shorts, leggings' top, trousers' seat)."""
    keys = [(z, a, f, g) for z, a, f, g in torso_keys(b, off) if z <= z_top + 1e-6]
    keys.append((z_top, *[x + off for x in torso_at(b, z_top)]))
    keys = sorted({round(k[0], 4): k for k in keys}.values())
    keys = [k for k in keys if k[0] >= z_bot - 1e-6] or keys[:2]
    zs = dense(keys[0][0], keys[-1][0], 10)
    rings, cs = torso_rings(keys, n, zs, e=2.3)
    mb = MB(name)
    bot = V((0, 0.004, keys[0][0] - 0.035))
    mb.loft(rings, m, cs, cap0=bot)
    zh = b.hip_z

    def w(co):
        ww = torso_weights(b)(co)
        if co.z < zh:
            f = 0.7 * sstep(zh, zh - 0.08, co.z)
            s = sstep(-0.04, 0.04, co.x)
            ww = mix_w((ww, 1 - f), ({'thigh_L': s, 'thigh_R': 1 - s}, f))
        return ww
    return weigh(mb.build(name, angle=60), weights or w)


def subdivide(ob, levels=1):
    """Catmull-Clark the part once (smooth silhouettes on the performers); vertex groups follow."""
    mod = ob.modifiers.new('sub', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    try:
        mod.uv_smooth = 'NONE'
    except Exception:
        pass
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob
