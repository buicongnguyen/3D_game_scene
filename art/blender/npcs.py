"""Starline supporting cast: Genzo, Rin, Ota, Hana and the three recolourable villagers.

Each build_<name>() resets the scene, models the character around a Body skeleton, weights every part,
normalises the height to the contract, skins (with baked AO), authors clips and exports the GLB.
"""
import math, random
import bpy
from mathutils import Vector, Matrix, Quaternion
from kit import reset, mat, box, apply_transform
from rig import skin, export_rigged
from human_lib import *
from char_parts import *
from garments import *
import anims
import player_anims as PA

V = Vector
AO = dict(rays=64, distance=0.22, strength=0.6, ground=0.0)

# ================================================================ shared NPC parts


# How a real limb's thickness varies along it, as a multiplier on a garment's radius profile (u = 0 at the shoulder /
# hip, 1 at the wrist / ankle): full deltoid and thigh, a slim elbow and knee, a forearm and calf, a slim wrist and
# ankle. `shape` (0..1) is how much of it a garment gets: 0 keeps its own profile (wide sleeves, long robes).
ARM_SHAPE = [(0.0, 0.86), (0.1, 0.98), (0.22, 1.05), (0.36, 1.0), (0.5, 0.89), (0.64, 0.97), (0.85, 0.9), (1.0, 0.8)]
LEG_SHAPE = [(0.0, 1.03), (0.14, 1.08), (0.36, 1.0), (0.5, 0.86), (0.68, 1.06), (0.86, 0.92), (1.0, 0.8)]


def taper(curve, u, shape):
    return 1.0 + shape * (interp(curve, u) - 1.0)


def arm_parts(b, M, sleeve_m, prof, hand_m, sleeve_end=1.0, roll=None, roll_m=None, ball=0.055, hand_kw=None,
              fold_amp=0.05, glove=None, bare_m=None, n=12, cuff=None, cuff_m=None, shape=1.0):
    """Sleeve from the shoulder to `sleeve_end` (fraction of the forearm), optional rolled cuff, bare forearm,
    hand or glove. prof: radius profile [(t, r)] along the sleeve (t over the full arm); shape: how much of the
    anatomical taper (ARM_SHAPE) the sleeve gets."""
    parts = []
    # t runs over the sleeve; u over the whole arm (shoulder to wrist)
    uf = (b.upper + sleeve_end * b.fore) / (b.upper + b.fore) if sleeve_end > 0 else 0.5
    for S in 'LR':
        sh, el, wr = (getattr(b, k + '_' + S) for k in ('sh', 'el', 'wr'))
        fd = (wr - el).normalized()
        end = el.lerp(wr, sleeve_end) - (fd * 0.028 if sleeve_end >= 1 else V((0, 0, 0)))
        pts = [sh + (sh - el).normalized() * 0.005, sh.lerp(el, 0.5), el, el.lerp(end, 0.5), end]

        def sfold(t, ang):
            k = math.exp(-((t - 0.5) / 0.14) ** 2)
            return 1 + fold_amp * k * math.sin(ang * 3 + 1.0) + fold_amp * 0.5 * math.sin(ang * 5 + t * 9)
        sl = limb(pts, sleeve_m, lambda t: interp(prof, t) * taper(ARM_SHAPE, t * uf, shape), n=n, name='sleeve',
                  cap0='round', cap1=None, fold=sfold, per=2)
        parts.append(weigh(sl, arm_weights(S, b)))
        if ball:
            bm = MB('shoulder')
            ball *= 0.9
            ellipsoid(bm, sh + V((-0.008 if S == 'L' else 0.008, 0, -0.012)), (ball, ball * 1.02, ball * 0.96),
                      sleeve_m, 10, 6)
            parts.append(weigh(bm.build('shoulder'), {'upperarm_' + S: 0.8, 'chest': 0.2}))
        r_end = interp(prof, 1.0) * taper(ARM_SHAPE, uf, shape)
        if roll:
            # rolled-up sleeve: a fat torus-ish band at the sleeve end
            rb = limb([end - fd * roll * 0.9, end + fd * roll * 0.25], roll_m or sleeve_m,
                      lambda t: r_end * 1.12 + 0.006 * math.sin(math.pi * t), n=n, name='roll', cap0='flat', cap1='flat')
            parts.append(weigh(rb, arm_weights(S, b)))
        if cuff:
            cf = limb([wr - fd * (cuff + 0.02), wr - fd * 0.004], cuff_m or sleeve_m, lambda t: r_end + 0.006, n=n,
                      name='cuff', cap0='flat', cap1='flat')
            parts.append(weigh(cf, 'forearm_' + S))
        if sleeve_end < 1:
            fa = limb([end - fd * 0.01, wr + fd * 0.01], bare_m or hand_m, lambda t: lerp(r_end * 0.82, 0.034 * b.H / 1.45, t),
                      n=10, name='forearm', cap0='flat', cap1='round', per=2)
            parts.append(weigh(fa, arm_weights(S, b)))
        kw = dict(hand_kw or {})
        hnd = hand(b, S, hand_m, **kw)
        parts.append(weigh(hnd, 'hand_' + S))
        if glove:
            # flared gauntlet cuff
            g = limb([wr - fd * 0.045, wr + fd * 0.02], hand_m, lambda t: lerp(glove * 0.78, glove, t), n=12,
                     name='gauntlet', cap0='flat', cap1=None)
            parts.append(weigh(g, blend_fn_wrist(S, b)))
    return parts


def blend_fn_wrist(S, b):
    wr, el = getattr(b, 'wr_' + S), getattr(b, 'el_' + S)
    fd = (wr - el).normalized()

    def fn(co):
        u = (co - wr).dot(fd)
        return blend2('forearm_' + S, 'hand_' + S, (u + 0.02) / 0.04)
    return fn


def leg_parts(b, M, trouser_m, prof, top=0.03, cuff=None, cuff_m=None, n=10, bare=None, bare_prof=None,
              trouser_end=1.0, knee=False, shape=1.0):
    """Trouser tube from the hip to trouser_end (fraction hip->ankle), optional turned cuff, bare shin. shape: how
    much of the anatomical taper (LEG_SHAPE: thigh, knee, calf, ankle) the leg gets."""
    parts = []
    for S in 'LR':
        hip, knee_, ank = (getattr(b, k + '_' + S) for k in ('hip', 'knee', 'ank'))
        L = (knee_ - hip).length + (ank - knee_).length
        def at(t):
            d1 = (knee_ - hip).length / L
            return hip.lerp(knee_, t / d1) if t < d1 else knee_.lerp(ank, (t - d1) / (1 - d1))
        tend = trouser_end
        pts = [hip + V((0, 0, top)), at(0.25), at(0.5), at(0.5 + 0.25 * (tend - 0.5) / 0.5 * 1.0), at(tend)]
        tr = limb(pts, trouser_m, lambda t: interp(prof, t) * taper(LEG_SHAPE, t * tend, shape), n=n, name='trouser',
                  cap0='round', cap1=None, per=2,
                  fold=lambda t, a: 1 + 0.035 * math.exp(-((t - 0.55) / 0.12) ** 2) * math.sin(a * 3 + 0.5))
        parts.append(weigh(tr, leg_weights(S, b)))
        if cuff:
            c0 = at(tend)
            d = (at(tend) - at(tend - 0.05)).normalized()
            cf = limb([c0 - d * cuff, c0 + d * 0.004], cuff_m or trouser_m,
                      lambda t: interp(prof, 1.0) * taper(LEG_SHAPE, tend, shape) + 0.008, n=n,
                      name='tcuff', cap0='flat', cap1='flat')
            parts.append(weigh(cf, leg_weights(S, b)))
        if bare:
            bp = limb([at(max(0.0, tend - 0.08)), at(1.0) + V((0, 0, 0.03))], bare,
                      lambda t: interp(bare_prof, t) * taper(LEG_SHAPE, lerp(max(0.0, tend - 0.08), 1.0, t), shape),
                      n=10, name='shin', cap0='round', cap1='round', per=2)
            parts.append(weigh(bp, leg_weights(S, b)))
        if knee:
            kc = MB('knee')
            ellipsoid(kc, knee_ + V((0, -0.02, 0.006)), (0.04, 0.03, 0.045), trouser_m, 8, 6)
            parts.append(weigh(kc.build('knee'), {'thigh_' + S: 0.35, 'shin_' + S: 0.65}))
    return parts


def pelvis(b, m, keys, n=20, z0=None, name='pelvis', skirt=0.5):
    """Lower-body shell (shorts/overall seat) that the leg tubes emerge from."""
    zs = dense(keys[0][0], keys[-1][0], 6)
    rings, cs = torso_rings(keys, n, zs, e=2.3)
    mb = MB(name)
    bot = V((0, cs[0].y, keys[0][0] - 0.03))
    mb.loft(rings, m, cs, cap0=bot)
    ob = mb.build(name, angle=60)
    return weigh(ob, torso_weights(b, skirt=skirt, skirt_top=b.hip_z + 0.02))


def std_head(b, M, sdf_kw=None, seg=28, rings=21):
    hd = Head(b.head_c, head_sdf(b.head_c, **(sdf_kw or {})), M['skin'], seg=seg, rings=rings)
    return hd


def neck_part(b, M, r=0.045, top=None):
    c = b.head_c
    return weigh(limb([V((0, 0.008, b.neck_z - 0.03)), V((0, 0.01, (top or c.z - 0.08)))], M['skin'],
                      lambda t: r, n=12, name='neck', cap0='flat', cap1='flat'), neck_weights(b))


def bushy(head, m, az, el, n=5, length=0.05, width=0.028, thick=0.018, spread=18, droop=0.0, out=0.012, seed=1,
          up=0.2, s=1.0, samples=5):
    """A bushy brow / tuft: several short locks fanning outward from (az, el)."""
    mb = MB('tuft')
    rnd = random.Random(seed)
    side = 1 if az >= 0 else -1
    for i in range(n):
        f = i / max(n - 1, 1)
        a0 = az + side * (f - 0.5) * spread * 0.6
        e0 = el + rnd.uniform(-2, 2)
        start = head.pt(a0, e0, out * s)
        d = head.dir(a0, e0)
        tang = V((side * math.cos(math.radians(a0)), math.sin(math.radians(a0)) * side, 0)).normalized()
        tang = (tang - d * tang.dot(d)).normalized()
        upv = V((0, 0, 1))
        dirv = (tang * (0.8 + 0.4 * f) + upv * (up - droop * f) + d * 0.3).normalized()
        L = length * s * (0.7 + 0.5 * math.sin(math.pi * f)) * rnd.uniform(0.85, 1.1)
        mid = start + dirv * L * 0.5 + d * 0.006 * s
        end = start + dirv * L + upv * (-droop * L * 0.6) + d * 0.004 * s
        lock(mb, [start - dirv * L * 0.1, mid, end], m, width * s * rnd.uniform(0.8, 1.1), thick * s, head.c, n=6,
             samples=samples, flat_in=0.7)
    return mb.build('tuft', angle=180)


def cap_crown(head, m, band_el, profile, off=0.006, seg=28, tilt=0.0, name='cap'):
    """A soft cap/hat crown built up from a band that hugs the skull at band_el(az) degrees.
    profile: [(dz, scale)] rings above the band (scale relative to the band radius)."""
    band = [head.pt(-180 + 360 * j / seg, band_el(-180 + 360 * j / seg), off) for j in range(seg)]
    c0 = sum(band, V()) / seg
    rings, cs = [band], [c0]
    for dz, sc in profile:
        rr = [c0 + (p - c0) * sc + V((0, 0, dz)) for p in band]
        rings.append(rr)
        cs.append(c0 + V((0, 0, dz)))
    mb = MB(name)
    top = cs[-1] + V((0, 0, 0.004))
    mb.loft(rings, m, cs, cap1=top)
    # inner lip so the open bottom never shows a gap
    inner = [c0 + (p - c0) * 0.94 + V((0, 0, 0.012)) for p in band]
    mb.loft([inner, band], m, [c0 + V((0, 0, 0.012)), c0])
    ob = mb.build(name, angle=50)
    if tilt:
        ob.data.transform(Matrix.Translation(head.c) @ Matrix.Rotation(math.radians(tilt), 4, 'X') @
                          Matrix.Translation(-head.c))
    return ob, band, c0


def brim(band, c0, m, front_az=0.0, span=150, depth=0.07, thick=0.012, droop=0.02, seg=16, name='brim', full=False):
    """A curved peak (engineer cap) or a full brim (straw hat) extending from the band outward."""
    mb = MB(name)
    n = len(band)
    rows_in, rows_out = [], []
    idx = []
    for j in range(n):
        p = band[j]
        d = (p - c0)
        az = math.degrees(math.atan2(d.x, -d.y))
        diff = ((az - front_az + 180) % 360) - 180
        if full or abs(diff) <= span / 2:
            idx.append((diff, j))
    idx.sort()
    for diff, j in idx:
        p = band[j]
        rad = V((p.x - c0.x, p.y - c0.y, 0)).normalized()
        w = 1.0 if full else math.cos(math.radians(diff) * 180 / span) ** 0.6
        o = p + rad * depth * w - V((0, 0, droop * w))
        rows_in.append(p)
        rows_out.append(o)
    top_in = [q + V((0, 0, thick * 0.5)) for q in rows_in]
    top_out = [q + V((0, 0, thick * 0.3)) for q in rows_out]
    bot_in = [q - V((0, 0, thick * 0.5)) for q in rows_in]
    bot_out = [q - V((0, 0, thick * 0.3)) for q in rows_out]
    cyc = full
    ids = [[mb.vert(q) for q in r] for r in (top_in, top_out, bot_out, bot_in)]
    m_ = len(rows_in)
    span_n = m_ if cyc else m_ - 1
    for a, b_ in ((0, 1), (1, 2), (2, 3), (3, 0)):
        for j in range(span_n):
            q = [ids[a][j], ids[a][(j + 1) % m_], ids[b_][(j + 1) % m_], ids[b_][j]]
            cc = sum((mb.V[i] for i in q), V()) / 4
            ref = {0: V((0, 0, 1)), 1: (cc - c0) * V((1, 1, 0)), 2: V((0, 0, -1)), 3: -(cc - c0) * V((1, 1, 0))}[a]
            mb.face(q, m, out=ref)
    if not cyc:
        for j in (0, m_ - 1):
            q = [ids[0][j], ids[1][j], ids[2][j], ids[3][j]]
            cc = sum((mb.V[i] for i in q), V()) / 4
            mb.face(q, m, out=(cc - c0).cross(V((0, 0, 1))) * (1 if j == 0 else -1))
    return mb.build(name, angle=40)


# ================================================================ Genzo


def build_genzo():
    reset()
    M = dict(skin=mat('Skin', '#eeb48c', .55), hair=mat('Hair', '#f2eee6', .55), eye=mat('Eye white', '#f6f3ec', .18),
             iris=mat('Iris', '#6b4226', .25), dark=mat('Dark', '#262028', .45), over=mat('Overalls', '#2d4a7a', .62),
             shirt=mat('Shirt', '#7fa6d6', .7), kerchief=mat('Kerchief', '#d8342c', .72),
             leather=mat('Leather', '#9a6232', .55), brass=mat('Brass', '#e0ac45', .28, .85))
    M['lash'] = M['dark']
    b = Body(1.62, hip_z=0.6, hip_x=0.105, knee_z=0.33, ankle_z=0.095, ankle_y=0.022, toe_y=-0.135, spine_z=0.74,
             chest_z=0.93, neck_z=1.16, headj_z=1.23, sh_x=0.19, sh_z=1.11, sh_y=0.015, upper=0.215, fore=0.2,
             hand=0.1, arm_out=22.0, head_c=(0, 0.0, 1.405), elbow_bend=10)
    parts = []
    c = b.head_c
    hd = std_head(b, M, dict(w=1.06, jaw=1.22, cheek=1.2, chin=0.85, scale=1.05, depth=1.0))
    parts.append(weigh(hd.ob, 'head'))
    f = Face(hd, M, s=1.05)
    f.eyes(az=23, el=-7, w=0.0165, h=0.018, iris_w=0.85, iris_h=1.0, iris_dv=0.05, pupil=(0.42, 0.5), top=0.62,
           lid_w=0.0065, tilt=-4, squint=0.0, lower=True)
    f.mouth(el=-33, w=0.014, smile=0.003, open_=0.0, thick=0.0026)
    parts.append(weigh(f.build(), 'head'))
    parts.append(weigh(nose(hd, M['skin'], el=-17, size=(0.024, 0.02, 0.02), off=-0.01, seg=12), 'head'))
    parts.append(weigh(ears(hd, M['skin'], el=-10, s=1.12), 'head'))
    parts.append(neck_part(b, M, r=0.058))
    # bushy white brows (3D tufts), walrus moustache, sideburns and back hair under the cap
    for sx in (1, -1):
        parts.append(weigh(bushy(hd, M['hair'], sx * 20, 11, n=6, length=0.05, width=0.026, thick=0.02, spread=26,
                                 droop=0.25, out=0.004, seed=3 + sx, up=0.35, s=1.05), 'head'))
    mo = MB('moustache')
    rnd = random.Random(7)
    for sx in (1, -1):
        for i in range(6):
            f_ = i / 5
            az0 = sx * (2 + 19 * f_)
            s0 = hd.pt(az0, -21 + 1.5 * f_, 0.016 + 0.004 * (1 - f_))
            out = V((sx * 1.0, -0.3, 0)).normalized()
            mid = s0 + out * (0.024 + 0.018 * f_) + V((0, -0.018, -0.012 - 0.01 * f_))
            end = s0 + out * (0.034 + 0.03 * f_) + V((0, -0.01, -0.05 - 0.02 * f_))
            tip = end + out * (0.012 + 0.01 * f_) + V((0, 0.004, 0.006 + 0.01 * f_))
            lock(mo, [s0 - out * 0.01, mid, end, tip], M['hair'], 0.042 - 0.008 * f_, 0.028 - 0.006 * f_, hd.c, n=8,
                 samples=7, flat_in=0.75, out_fn=lambda p: (p - hd.c) * V((1, 1, 0.3)),
                 wfn=lambda t: 0.7 + 0.4 * math.sin(math.pi * min(1, t * 1.3)) - 0.75 * max(0, t - 0.7) / 0.3)
    parts.append(weigh(radial_normals(mo.build('moustache', angle=180), hd.pt(0, -30, -0.06), 0.45), 'head'))
    hb = MB('backhair')
    for i, az in enumerate((88, 112, 138, 162, 186, 210, 234, 258, 280)):
        s0 = hd.pt(az, 10, 0.012)
        el_end = -20 if abs(((az + 180) % 360) - 180) > 110 else -12
        e0 = hd.pt(az + rnd.uniform(-8, 8), el_end + rnd.uniform(-4, 3), 0.026)
        mid = s0.lerp(e0, 0.5) + (s0 - hd.c).normalized() * 0.016
        lock(hb, [s0, mid, e0 + (e0 - hd.c).normalized() * 0.008 + V((0, 0, 0.012))], M['hair'], 0.062, 0.026,
             hd.c, n=8, samples=5, flat_in=0.6, wfn=lambda t: 0.8 + 0.2 * math.sin(math.pi * t) - 0.75 * max(0, t - 0.6) / 0.4)
    for sx in (1, -1):
        s0 = hd.pt(sx * 76, 14, 0.008)
        e0 = hd.pt(sx * 70, -26, 0.014)
        lock(hb, [s0, s0.lerp(e0, 0.5) + (s0 - hd.c).normalized() * 0.01, e0], M['hair'], 0.04, 0.02, hd.c, n=8,
             samples=5, wfn=lambda t: 0.85 + 0.15 * math.sin(math.pi * t) - 0.7 * max(0, t - 0.6) / 0.4)
    parts.append(weigh(radial_normals(hb.build('backhair', angle=180), hd.c, 0.5), 'head'))
    # navy engineer cap: puffy crown, short peak, band and brass badge
    band_el = lambda az: interp([(0, 24), (90, 12), (180, -2)], abs(((az + 180) % 360) - 180))
    crown, band, c0 = cap_crown(hd, M['over'], band_el, [(0.04, 1.07), (0.085, 1.13), (0.12, 1.14), (0.14, 1.06),
                                                        (0.152, 0.8), (0.158, 0.4)], off=0.012, seg=26, tilt=0)
    parts.append(weigh(crown, 'head'))
    parts.append(weigh(brim(band, c0, M['dark'], span=170, depth=0.075, thick=0.011, droop=0.02, name='peak'), 'head'))
    bd = MB('capband')
    sweep(bd, band + band[:1], M['dark'], radius=0.009, n=6, cap0=None, cap1=None,
          up_fn=lambda p, T: p - c0)
    parts.append(weigh(bd.build('capband'), 'head'))
    bp = hd.pt(0, 36, 0.045)
    badge = MB('badge')
    ellipsoid(badge, bp, (0.02, 0.008, 0.016), M['brass'], 12, 6)
    parts.append(weigh(badge.build('badge'), 'head'))

    # ---- torso: stout shirt, overall seat and bib with straps
    sk = [(0.62, 0.2, 0.18, 0.155), (0.72, 0.22, 0.215, 0.165), (0.84, 0.232, 0.24, 0.168), (0.96, 0.23, 0.215, 0.165),
          (1.04, 0.222, 0.18, 0.158), (1.09, 0.208, 0.15, 0.148), (1.13, 0.17, 0.12, 0.122), (1.17, 0.11, 0.088, 0.09),
          (1.2, 0.075, 0.07, 0.072)]
    zs = dense(0.62, 1.2, 15)
    rings, cs = torso_rings(sk, 24, zs, e=2.3)
    shirt = MB('shirt')
    shirt.loft(rings, M['shirt'], cs)
    shirt_ob = shirt.build('shirt', angle=60)
    ssurf = Surface([shirt_ob])
    parts.append(weigh(shirt_ob, torso_weights(b, chest_top=1.17)))
    ok = [(0.56, 0.2, 0.15, 0.15), (0.62, 0.218, 0.19, 0.168), (0.72, 0.234, 0.228, 0.176), (0.84, 0.242, 0.252, 0.178),
          (0.93, 0.24, 0.235, 0.176)]
    over = MB('overall')
    zs = dense(0.56, 0.93, 8)
    rings, cs = torso_rings(ok, 24, zs, e=2.3)
    over.loft(rings, M['over'], cs, cap0=V((0, 0, 0.53)))
    over_ob = over.build('overall', angle=60)
    parts.append(weigh(over_ob, torso_weights(b, skirt=0.5, skirt_top=0.62)))
    osurf = Surface([over_ob])
    bib = patch(ssurf, (0, 0, 0.99), (0, -1, 0.05), rounded_rect(0.22, 0.2, 0.02, cv=0.0), M['over'], lift=0.009,
                name='bib')
    parts.append(weigh(bib, torso_weights(b)))
    pk = patch(ssurf, (0, 0, 1.0), (0.05, -1, 0.06), rounded_rect(0.1, 0.075, 0.012), M['over'], lift=0.016,
               name='bibpocket')
    parts.append(weigh(pk, torso_weights(b)))
    for sx in (1, -1):
        st = surface_strip(ssurf, [V((sx * 0.1, -0.3, 1.08)), V((sx * 0.13, -0.1, 1.15)), V((sx * 0.12, 0.1, 1.15)),
                                   V((sx * 0.06, 0.3, 1.02)), V((-sx * 0.07, 0.3, 0.9))], M['over'], 0.042, 0.007,
                           off=0.006, name='strap', out_ref=(0, 0, 0.95), samples=18)
        parts.append(weigh(st, torso_weights(b, chest_top=1.17)))
        loc, nrm = ssurf.nearest(V((sx * 0.1, -0.3, 1.075)))
        bk = MB('buckle')
        ellipsoid(bk, loc + nrm * 0.016, (0.02, 0.008, 0.016), M['brass'], 10, 6)
        parts.append(weigh(bk.build('buckle'), torso_weights(b)))
        # side buttons on the overall
        loc, nrm = osurf.nearest(V((sx * 0.4, -0.05, 0.86)))
        bt = MB('btn')
        ellipsoid(bt, loc + nrm * 0.006, (0.012, 0.012, 0.012), M['brass'], 8, 5)
        parts.append(weigh(bt.build('btn'), torso_weights(b)))
    # neckerchief: wrap, knot and a triangular point on the chest
    parts.append(weigh(ring_band((0, 0.004, 1.18), 0.1, 0.092, 0.022, M['kerchief'], 18, 'wrap', squash=0.8, sides=8),
                       neck_weights(b)))
    kn = MB('knot')
    ellipsoid(kn, (0.0, -0.1, 1.165), (0.03, 0.022, 0.026), M['kerchief'], 10, 6)
    tri = [V((0.0, -0.1, 1.16)), V((0.0, -0.13, 1.11)), V((0.0, -0.15, 1.06))]
    sweep(kn, tri, M['kerchief'], rfn=lambda t: (0.045 * (1 - t) + 0.006, 0.008), n=8, up_fn=lambda p, T: V((0, -1, 0)),
          e=3.0, cap0='round', cap1='round')
    parts.append(weigh(kn.build('knot'), 'chest'))

    # ---- arms: chambray sleeves rolled to mid-forearm, big leather work gloves
    parts += arm_parts(b, M, M['shirt'], [(0, 0.07), (0.4, 0.064), (0.55, 0.06), (1.0, 0.058)], M['leather'],
                       sleeve_end=0.45, roll=0.03, ball=0.068, glove=0.066, bare_m=M['skin'],
                       hand_kw=dict(curl=0.4, s=1.5, n=6, width=1.1))
    # ---- legs: wide navy trouser legs with turn-ups, dark work boots
    parts += leg_parts(b, M, M['over'], [(0, 0.11), (0.3, 0.098), (0.6, 0.088), (1.0, 0.082)], cuff=0.03,
                       trouser_end=0.9)
    for S in 'LR':
        bt = boot(b, S, M['dark'], M['leather'], shaft_top=0.2, shaft_r=0.062, width=0.058, toe_h=0.07, cuff=None,
                  flare=1.05, heel=0.055, tab=False, sole_t=0.026)
        parts.append(weigh(bt, leg_weights(S, b)))

    k = normalize_height(parts, b, 1.62, style='stocky', head=hd)
    from char_parts import make_armature
    arm = make_armature('Genzo', b)
    body = skin(parts, arm, 'Genzo', ao=AO)
    smooth_colors(body, 3, {'Skin'})
    face_tints(body, hd, k, blush=0.45, blush_col=(1.0, 0.7, 0.66), az=42, el=-22,
               soot=(tuple(hd.pt(-44, -14) * k), 0.04 * k, 1.0))
    anims.humanoid_clips(arm, b, 'genzo', ['Idle', 'Walk', 'Talk', 'Wave', 'Sad', 'ArmsCrossed', 'Bow'],
                         energy=0.8, bounce=0.8, arm_swing=0.75, sway=1.3, stout=0.4, lean=1.0, step=0.9,
                         idle_hands=PA.hands_on_belly, arm_out=4.0, stance=0.01)
    return export_rigged('genzo', arm)



# ================================================================ Rin


def build_rin():
    reset()
    M = dict(skin=mat('Skin', '#d9965e', .52), hair=mat('Hair', '#2b1b16', .42), eye=mat('Eye white', '#f6f3ec', .16),
             iris=mat('Iris', '#8c5022', .22), dark=mat('Dark', '#241c27', .42), happi=mat('Happi', '#1fa5a0', .55),
             trousers=mat('Trousers', '#f1dca6', .75), boots=mat('Boots', '#f0762a', .32),
             straw=mat('Straw', '#e9bf55', .72), sash=mat('Sash', '#cf3a2c', .6))
    M['lash'] = M['dark']
    b = Body(1.5, arm_out=14.0, sh_x=0.143, upper=0.205, fore=0.19, hand=0.082)
    c = b.head_c
    b.extra = [('hat', (0, 0.0, c.z + 0.15), (0, 0.0, c.z + 0.3), 'head'),
               ('hair_1', (0, 0.155, c.z - 0.01), (0, 0.2, c.z - 0.08), 'head'),
               ('hair_2', (0, 0.2, c.z - 0.08), (0, 0.23, c.z - 0.16), 'hair_1')]
    parts = []
    hd = std_head(b, M, dict(w=1.0, jaw=1.02, cheek=0.95, chin=1.05, scale=1.03), seg=26, rings=19)
    parts.append(weigh(hd.ob, 'head'))
    f = Face(hd, M, s=1.03)
    f.eyes(az=24, el=-8, w=0.021, h=0.024, lashes=1, brow=M['hair'], brow_el=10, brow_arch=0.003, brow_w=0.0062,
           brow_tilt=9, tilt=5, iris_w=0.84, iris_h=1.0, iris_dv=0.06, pupil=(0.36, 0.48), top=0.8)
    f.mouth(el=-28, w=0.024, smile=0.007, open_=0.013, m=M['dark'])
    # teeth strip in the grin and freckles
    md = f.decal(0, -28)
    teeth = [(-0.018, 0.0012), (0.018, 0.0012), (0.016, -0.0028), (-0.016, -0.0028)]
    md.fill(f.mb, teeth, M['eye'], lift=0.0019, rings=1)
    rnd = random.Random(11)
    for sx in (1, -1):
        for i in range(4):
            fd = f.decal(sx * (30 + rnd.uniform(-7, 7)), -19 + rnd.uniform(-4, 3))
            fd.fill(f.mb, ellipse_pts(0, 0, 0.0028, 0.0026, 6), M['iris'], lift=0.0008, rings=1)
    parts.append(weigh(f.build(), 'head'))
    parts.append(weigh(nose(hd, M['skin'], el=-16, size=(0.011, 0.009, 0.0085), off=-0.005, seg=10), 'head'))
    parts.append(weigh(ears(hd, M['skin'], el=-9, s=1.0), 'head'))
    parts.append(neck_part(b, M, r=0.043))

    # ---- hair: hairline cap, messy bangs, side locks, gathered back and a short ponytail
    def hairline(az):
        a = abs(((az + 180) % 360) - 180)
        return interp([(0, 34), (45, 28), (75, 6), (100, -12), (150, -26), (180, -28)], a)
    parts.append(weigh(hair_cap(hd, M['hair'], hairline, off=0.007, seg=22, rows=7), 'head'))
    lk = MB('locks')
    for i, (az, el, w) in enumerate([(-46, 14, 0.05), (-30, 12, 0.056), (-14, 18, 0.056), (2, 12, 0.058),
                                     (18, 16, 0.056), (34, 12, 0.054), (48, 18, 0.048)]):
        r0 = (az * 0.25 - 6)
        tipflick = 6 if i % 2 else -6
        keys = [(r0, 80, 0.008), (lerp(r0, az, 0.5), 60, 0.022), (az, 36, 0.026), (az + tipflick * 0.5, el + 8, 0.02),
                (az + tipflick, el, 0.014)]
        lock(lk, lock_path(hd, keys), M['hair'], w, 0.022, hd.c, n=8, samples=8, flat_in=0.6,
             wfn=lambda t: 0.72 + 0.28 * math.sin(math.pi * t) - 0.7 * max(0, t - 0.66) / 0.34)
    for sx in (1, -1):
        keys = [(sx * 40, 70, 0.008), (sx * 62, 40, 0.02), (sx * 66, 8, 0.024), (sx * 60, -24, 0.02), (sx * 54, -34, 0.012)]
        lock(lk, lock_path(hd, keys), M['hair'], 0.05, 0.022, hd.c, n=8, samples=8)
    tie = hd.pt(180, -4, 0.02)
    for az in (100, 132, 164, 196, 228, 260):
        keys = [(az * 0.4, 80, 0.008), (az, 40, 0.024), (lerp(az, 180, 0.4), 12, 0.026)]
        pts = lock_path(hd, keys) + [tie + (hd.pt(az, 0, 0) - tie) * 0.25]
        lock(lk, pts, M['hair'], 0.07, 0.024, hd.c, n=8, samples=7, flat_in=0.55,
             wfn=lambda t: 0.8 + 0.2 * math.sin(math.pi * t) - 0.5 * t)
    parts.append(weigh(radial_normals(lk.build('locks', angle=180), hd.c, 0.5), 'head'))
    pt_ = MB('ponytail')
    ring_c = tie + V((0, 0.012, 0))
    for i in range(4):
        a = TAU * i / 4 + 0.4
        off = V((math.cos(a) * 0.016, 0, math.sin(a) * 0.014))
        p0 = ring_c + off
        p1 = p0 + V((math.cos(a) * 0.02, 0.05, -0.03 + math.sin(a) * 0.012))
        p2 = p1 + V((math.cos(a) * 0.022, 0.03, -0.075 + math.sin(a) * 0.01))
        p3 = p2 + V((math.cos(a) * 0.012, 0.0, -0.045))
        lock(pt_, [p0, p1, p2, p3], M['hair'], 0.048, 0.028, ring_c + V((0, 0.08, -0.06)), n=8, samples=8, flat_in=0.8,
             out_fn=lambda q, a=a: V((math.cos(a), 0.2, math.sin(a))))
    tie_ob = MB('tie')
    sweep(tie_ob, [ring_c + V((0, -0.008, 0)), ring_c + V((0, 0.012, 0))], M['sash'], radius=0.02, n=10,
          cap0='round', cap1='round')
    parts.append(weigh(tie_ob.build('tie'), 'head'))

    def tail_w(co):
        t = (co - ring_c).dot(V((0, 0.4, -1)).normalized()) / 0.16
        if t < 0.05:
            return {'head': 1.0}
        return blend2('hair_1', 'hair_2', (t - 0.45) / 0.4) if t > 0.25 else blend2('head', 'hair_1', t / 0.25)
    parts.append(weigh(radial_normals(pt_.build('ponytail', angle=180), ring_c + V((0, 0.03, -0.06)), 0.45), tail_w))

    # ---- straw hat on the 'hat' bone: rounded crown, wide brim, red band
    band_el = lambda az: interp([(0, 30), (90, 22), (180, 14)], abs(((az + 180) % 360) - 180))
    crown, band, c0 = cap_crown(hd, M['straw'], band_el, [(0.025, 1.02), (0.06, 0.99), (0.095, 0.9), (0.12, 0.7),
                                                         (0.132, 0.36)], off=0.03, seg=22, name='crown')
    parts.append(weigh(crown, 'hat'))
    parts.append(weigh(brim(band, c0, M['straw'], full=True, depth=0.15, thick=0.012, droop=0.035, name='brim'), 'hat'))
    hb = MB('hatband')
    bandpts = [c0 + (p - c0) * 1.035 + V((0, 0, 0.018)) for p in band]
    sweep(hb, bandpts + bandpts[:1], M['sash'], rfn=lambda t: (0.006, 0.014), n=6, cap0=None, cap1=None,
          up_fn=lambda p, T: p - c0)
    parts.append(weigh(hb.build('hatband'), 'hat'))

    # ---- happi jacket (boxy, hip length), white wave band, red sash
    jk = [(0.56, 0.19, 0.145, 0.155), (0.62, 0.184, 0.14, 0.15), (0.72, 0.17, 0.128, 0.138), (0.82, 0.165, 0.126, 0.132),
          (0.92, 0.162, 0.122, 0.128), (0.98, 0.155, 0.112, 0.118), (1.02, 0.135, 0.097, 0.104), (1.05, 0.1, 0.078, 0.082),
          (1.075, 0.066, 0.058, 0.06)]
    zs = dense(0.56, 1.075, 16)
    rings, cs = torso_rings([(z * b.H / 1.45, a * b.H / 1.45, f_ * b.H / 1.45, g * b.H / 1.45) for z, a, f_, g in jk],
                            26, [z * b.H / 1.45 for z in zs], e=2.6,
                            fn=lambda z, ang: 1 + 0.015 * sstep(0.75, 0.56, z) * math.sin(ang * 6))
    jak = MB('happi')
    inner = [[cs[0] + (p - cs[0]) * 0.94 + V((0, 0, 0.03)) for p in rings[0]]]
    jak.loft(inner + rings, M['happi'], [cs[0] + V((0, 0, 0.03))] + cs)
    jak_ob = jak.build('happi', angle=60)
    jsurf = Surface([jak_ob])
    tw = torso_weights(b, skirt=0.45, skirt_top=b.hip_z)
    parts.append(weigh(jak_ob, tw))
    k0 = b.H / 1.45
    hem_z = 0.56 * k0
    band_ob = ring_band((0, 0.005, hem_z + 0.018), 0.19 * k0 * 1.02, 0.155 * k0 * 1.02, 0.02, M['eye'], 22, 'waveband',
                        squash=0.45, sides=8, e=2.6)
    parts.append(weigh(band_ob, tw))
    wsurf = Surface([band_ob])
    wv = MB('waves')
    for i in range(14):
        ang = TAU * i / 14
        d = V((math.cos(ang), math.sin(ang), 0))
        dec = Decal(wsurf, V((0, 0, hem_z + 0.018)), d)
        crest = []
        for j in range(9):
            a = math.pi * j / 8
            crest.append((0.018 * math.cos(a), -0.009 + 0.016 * math.sin(a)))
        crest += [(0.008, -0.009), (-0.008, -0.009)][::-1]
        try:
            dec.fill(wv, _ccw2(crest), M['happi'], lift=0.0012, rings=1)
        except RuntimeError:
            pass
    parts.append(weigh(wv.build('waves', angle=80), tw))
    # collar band: around the neck and down the overlapping front (left over right)
    col = [V((0.1, -0.2, 0.62 * k0)), V((0.07, -0.2, 0.78 * k0)), V((0.02, -0.2, 0.9 * k0)), V((-0.04, -0.2, 0.98 * k0)),
           V((-0.07, -0.1, 1.05 * k0)), V((-0.04, 0.1, 1.08 * k0)), V((0.04, 0.1, 1.08 * k0)), V((0.07, -0.1, 1.05 * k0)),
           V((0.06, -0.2, 0.99 * k0))]
    parts.append(weigh(surface_strip(jsurf, col, M['eye'], 0.032, 0.006, off=0.004, name='collar', out_ref=(0, 0, 0.85),
                                     samples=30), torso_weights(b, chest_top=1.06 * k0)))
    sash = ring_band((0, 0.006, 0.735 * k0), 0.174 * k0, 0.142 * k0, 0.026, M['sash'], 22, 'sash', squash=0.4,
                     sides=8, e=3.0)
    parts.append(weigh(sash, tw))
    kn = MB('sashknot')
    kp = V((-0.1 * k0, -0.12 * k0, 0.735 * k0))
    ellipsoid(kn, kp, (0.026, 0.02, 0.024), M['sash'], 10, 6)
    for dx, ln in ((-0.012, 0.09), (0.014, 0.07)):
        sweep(kn, [kp + V((dx, -0.008, -0.01)), kp + V((dx * 1.6, -0.014, -ln * 0.5)), kp + V((dx * 2, -0.01, -ln))],
              M['sash'], rfn=lambda t: (0.017, 0.006), n=8, up_fn=lambda p, T: V((0, -1, 0)), e=3, cap0='round',
              cap1='flat')
    parts.append(weigh(kn.build('sashknot'), tw))

    # ---- wide happi sleeves to mid-forearm with a white cuff band, brown forearms
    parts += arm_parts(b, M, M['happi'], [(0, 0.062), (0.4, 0.068), (0.6, 0.075), (1.0, 0.08)], M['skin'],
                       sleeve_end=0.5, roll=0.018, roll_m=M['eye'], ball=0.056, bare_m=M['skin'],
                       hand_kw=dict(curl=0.4, s=1.08, n=6))
    # ---- rolled cream trousers, bare shins, orange boots
    parts.append(pelvis(b, M['trousers'], [(0.52 * k0, 0.16 * k0, 0.12 * k0, 0.13 * k0),
                                           (0.6 * k0, 0.172 * k0, 0.13 * k0, 0.14 * k0), (0.7 * k0, 0.17 * k0, 0.128 * k0, 0.135 * k0)]))
    parts += leg_parts(b, M, M['trousers'], [(0, 0.074), (0.4, 0.068), (0.7, 0.064), (1.0, 0.066)], cuff=0.028,
                       trouser_end=0.66, bare=M['skin'], bare_prof=[(0, 0.045), (1, 0.04)], knee=False)
    for S in 'LR':
        bt = boot(b, S, M['boots'], M['dark'], shaft_top=0.26 * k0, shaft_r=0.05, width=0.05, cuff=0.01, flare=1.12)
        parts.append(weigh(bt, leg_weights(S, b)))

    k = normalize_height(parts, b, 1.5, style='teen', head=hd)
    arm = make_armature('Rin', b)
    body = skin(parts, arm, 'Rin', ao=AO)
    smooth_colors(body, 3, {'Skin'})
    face_tints(body, hd, k, blush=0.55, blush_col=(1.0, 0.66, 0.6))
    anims.humanoid_clips(arm, b, 'rin', ['Idle', 'Walk', 'Run', 'Talk', 'Wave', 'Cast', 'Reel', 'Pole', 'Cheer'],
                         energy=1.35, bounce=1.3, arm_swing=1.25, lean=4.0, step=1.0, head_up=2,
                         idle_hands=lambda A, s, p: PA.hands_on_hips(A, s, p, 'R'))
    return export_rigged('rin', arm)


def _ccw2(pts):
    a = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    return pts if a > 0 else pts[::-1]


# ================================================================ Ota


def build_ota():
    reset()
    M = dict(skin=mat('Skin', '#ebb48c', .56), hair=mat('Hair', '#f1ede4', .6), eye=mat('Eye white', '#f6f3ec', .18),
             iris=mat('Iris', '#4a3226', .25), dark=mat('Dark', '#262230', .5), haori=mat('Haori', '#8c4b2a', .66),
             kimono=mat('Kimono', '#5f7090', .7), wood=mat('Wood', '#7a5234', .62))
    M['lash'] = M['dark']
    b = Body(1.58, arm_out=13.0, sh_x=0.15, hip_x=0.085, upper=0.215, fore=0.2, hand=0.088, elbow_bend=10)
    c = b.head_c
    k0 = b.H / 1.45
    parts = []
    hd = std_head(b, M, dict(w=0.98, jaw=0.95, cheek=0.85, chin=1.1, scale=1.02, depth=1.02, crown=1.05), seg=26,
                  rings=19)
    parts.append(weigh(hd.ob, 'head'))
    f = Face(hd, M, s=1.02)
    f.eyes(az=23, el=-9, w=0.016, h=0.017, iris_w=0.85, iris_h=1.0, iris_dv=0.02, pupil=(0.42, 0.5), top=0.5,
           lid_w=0.006, tilt=-6, lower=True)
    f.mouth(el=-31, w=0.016, smile=0.0015, open_=0.0, thick=0.003)
    # wrinkles: raised skin folds on the brow and at the eye corners (AO makes them read)
    for v in (0.0, 0.013, 0.026):
        d = f.decal(0, 22 + v * 300)
        path = [(-0.05 + 0.1 * t, 0.004 * math.sin(math.pi * t) * (1 if v != 0.013 else -1)) for t in [i / 8 for i in range(9)]]
        d.strip(f.mb, path, [0.004 * math.sin(math.pi * (0.1 + 0.8 * i / 8)) + 0.001 for i in range(9)], M['skin'],
                lift=0.0005, thick=0.0016)
    for sx in (1, -1):
        for j in range(2):
            d = f.decal(sx * 41, -8 - 5 * j)
            path = [(sx * 0.0, 0.0), (sx * 0.012, -0.002 - 0.003 * j), (sx * 0.02, -0.006 - 0.004 * j)]
            d.strip(f.mb, path, [0.0022, 0.0018, 0.0006], M['skin'], lift=0.0004, thick=0.0012)
    parts.append(weigh(f.build(), 'head'))
    parts.append(weigh(nose(hd, M['skin'], el=-17, size=(0.016, 0.02, 0.019), off=-0.008, seg=12), 'head'))
    parts.append(weigh(ears(hd, M['skin'], el=-10, s=1.25), 'head'))
    parts.append(neck_part(b, M, r=0.044))
    # huge drooping brows, fluffy side tufts, a wisp of chin beard
    for sx in (1, -1):
        parts.append(weigh(bushy(hd, M['hair'], sx * 21, 9, n=7, length=0.072, width=0.03, thick=0.022, spread=30,
                                 droop=0.9, out=0.004, seed=5 + sx, up=0.3, s=1.02, samples=6), 'head'))
    tf = MB('tufts')
    rnd = random.Random(3)
    for sx in (1, -1):
        for i in range(6):
            az = sx * (70 + i * 16)
            s0 = hd.pt(az, 18 - i * 2, 0.0)
            e0 = hd.pt(az + sx * rnd.uniform(0, 10), -8 + rnd.uniform(-6, 6), 0.05 + rnd.uniform(0, 0.012))
            mid = s0.lerp(e0, 0.5) + (s0 - hd.c).normalized() * 0.03 + V((0, 0, 0.012))
            lock(tf, [s0, mid, e0], M['hair'], 0.046, 0.03, hd.c, n=8, samples=6, flat_in=0.7,
                 wfn=lambda t: 0.8 + 0.3 * math.sin(math.pi * t) - 0.85 * max(0, t - 0.55) / 0.45)
    for i, (az, el) in enumerate(((150, 2), (180, -2), (210, 2))):
        s0 = hd.pt(az, el + 10, 0.0)
        e0 = hd.pt(az + rnd.uniform(-5, 5), el - 18, 0.03)
        lock(tf, [s0, s0.lerp(e0, 0.5) + (s0 - hd.c).normalized() * 0.018, e0], M['hair'], 0.06, 0.03, hd.c, n=8,
             samples=6, flat_in=0.7)
    s0 = hd.pt(0, -44, 0.0)
    lock(tf, [s0 + V((0, 0.01, 0.01)), s0 + V((0, -0.012, -0.02)), s0 + V((0.004, -0.016, -0.05))], M['hair'], 0.034,
         0.02, hd.c, n=8, samples=6, out_fn=lambda q: V((0, -1, -0.3)))
    parts.append(weigh(radial_normals(tf.build('tufts', angle=180), hd.c, 0.45), 'head'))

    # ---- kimono (long, slate) with a dark obi, brown haori over it with wide hanging sleeves
    kk = [(0.1, 0.19, 0.16, 0.17), (0.3, 0.172, 0.14, 0.15), (0.55, 0.16, 0.128, 0.14), (0.72, 0.15, 0.12, 0.128),
          (0.85, 0.148, 0.118, 0.125), (0.95, 0.148, 0.112, 0.12), (1.0, 0.14, 0.104, 0.112), (1.035, 0.12, 0.09, 0.098),
          (1.065, 0.085, 0.07, 0.074), (1.085, 0.06, 0.056, 0.058)]
    kk = [(z * k0, a * k0, f_ * k0, g * k0) for z, a, f_, g in kk]
    zs = [z * k0 for z in dense(0.1, 1.085, 18)]
    rings, cs = torso_rings(kk, 24, zs, e=2.3, fn=lambda z, ang: 1 + 0.018 * sstep(0.6 * k0, 0.1, z) * math.sin(ang * 5 + 1))
    km = MB('kimono')
    inner = [[cs[0] + (p - cs[0]) * 0.94 + V((0, 0, 0.04)) for p in rings[0]]]
    km.loft(inner + rings, M['kimono'], [cs[0] + V((0, 0, 0.04))] + cs)
    km_ob = km.build('kimono', angle=60)
    ksurf = Surface([km_ob])
    kz = b.knee_z

    def robe_w(co):
        w = torso_weights(b)(co)
        if co.z < b.hip_z:
            f_ = sstep(b.hip_z, b.hip_z - 0.25, co.z) * 0.62
            g = sstep(kz, 0.1, co.z) * 0.25
            s_ = sstep(-0.05, 0.05, co.x)
            w = mix_w((w, 1 - f_), ({'thigh_L': s_ * (1 - g), 'thigh_R': (1 - s_) * (1 - g), 'shin_L': s_ * g,
                                     'shin_R': (1 - s_) * g}, f_))
        return w
    parts.append(weigh(km_ob, robe_w))
    # crossed collar (left over right) in the kimono colour, a darker under-collar in the haori opening
    col = [V((0.06, -0.2, 0.78 * k0)), V((0.0, -0.2, 0.86 * k0)), V((-0.05, -0.2, 0.95 * k0)), V((-0.07, -0.1, 1.04 * k0)),
           V((-0.03, 0.1, 1.08 * k0)), V((0.03, 0.1, 1.08 * k0)), V((0.07, -0.1, 1.04 * k0)), V((0.05, -0.2, 0.96 * k0))]
    parts.append(weigh(surface_strip(ksurf, col, M['dark'], 0.026, 0.005, off=0.003, name='collar', out_ref=(0, 0, 0.9),
                                     samples=26), torso_weights(b, chest_top=1.06 * k0)))
    obi = ring_band((0, -0.007, 0.74 * k0), 0.155 * k0, 0.128 * k0, 0.04, M['dark'], 22, 'obi', squash=0.3, sides=8, e=3.0)
    parts.append(weigh(obi, torso_weights(b)))
    # haori: open front, to mid-thigh
    hk = [(0.46, 0.2, 0.15, 0.165), (0.6, 0.186, 0.14, 0.155), (0.75, 0.172, 0.13, 0.142), (0.88, 0.166, 0.126, 0.136),
          (0.97, 0.162, 0.12, 0.13), (1.01, 0.15, 0.11, 0.12), (1.045, 0.126, 0.095, 0.104), (1.07, 0.092, 0.078, 0.082)]
    hk = [(z * k0, a * k0, f_ * k0, g * k0) for z, a, f_, g in hk]
    zs = [z * k0 for z in dense(0.46, 1.07, 14)]
    hr = MB('haori')
    rings, cs = [], []
    for z in zs:
        a, bf, bb = interp(keys_to(hk), z)
        cc = V((0, 0, z))
        # open front: an arc from -150 deg to +150 deg around the back (gap widens toward the neck)
        gap = math.radians(lerp(22, 48, sstep(0.75 * k0, 1.07 * k0, z)))
        row = []
        n = 22
        for j in range(n):
            t = j / (n - 1)
            ang = -math.pi / 2 + gap + t * (TAU - 2 * gap)
            ca, sa = math.cos(ang), math.sin(ang)
            ry = bb if sa > 0 else bf
            row.append(cc + V((a * spow(ca, 2 / 2.4), ry * spow(sa, 2 / 2.4), 0)) * 1.0)
        rings.append(row)
        cs.append(cc)
    ids = hr.loft(rings, M['haori'], cs, wrap=False)
    # thickness: inner shell
    inner_rings = [[cc + (p - cc) * 0.95 for p in r] for r, cc in zip(rings, cs)]
    hr.loft(inner_rings, M['haori'], [cc + V((0, 0, 0)) for cc in cs], wrap=False, orient=True)
    for i in range(len(hr.F) // 2, len(hr.F)):
        hr.F[i] = tuple(reversed(hr.F[i]))
    hr_ob = hr.build('haori', angle=60)
    parts.append(weigh(hr_ob, torso_weights(b, skirt=0.5, skirt_top=b.hip_z)))
    hsurf = Surface([hr_ob])
    # haori lapel bands (darker brown via the kimono colour), himo tie and family crests
    for sx in (1, -1):
        lp = [V((sx * 0.05, -0.25, 0.47 * k0)), V((sx * 0.055, -0.25, 0.7 * k0)), V((sx * 0.07, -0.25, 0.9 * k0)),
              V((sx * 0.085, -0.15, 1.02 * k0)), V((sx * 0.06, 0.1, 1.07 * k0)), V((0, 0.12, 1.075 * k0))]
        parts.append(weigh(surface_strip(hsurf, lp, M['haori'], 0.03, 0.007, off=0.003, name='lapel',
                                         out_ref=(0, 0, 0.8), samples=18), torso_weights(b, skirt=0.5, skirt_top=b.hip_z)))
    hm = MB('himo')
    hp = V((0.0, -0.145 * k0, 0.9 * k0))
    ellipsoid(hm, hp, (0.018, 0.012, 0.016), M['eye'], 10, 6)
    for sx in (1, -1):
        sweep(hm, [hp + V((sx * 0.012, -0.004, 0)), hp + V((sx * 0.045, 0.0, 0.01))], M['eye'], radius=0.005, n=6)
        sweep(hm, [hp + V((sx * 0.006, -0.006, -0.01)), hp + V((sx * 0.01, -0.008, -0.05))], M['eye'],
              rfn=lambda t: 0.004 + 0.006 * t, n=6, cap1='round')
    parts.append(weigh(hm.build('himo'), torso_weights(b)))
    for d_ in (V((0, 1, 0.1)), V((0.55, -1, 0.35)), V((-0.55, -1, 0.35))):
        try:
            dec = Decal(hsurf, V((0, 0, 0.98 * k0)), d_)
            cm = MB('crest')
            dec.fill(cm, ellipse_pts(0, 0, 0.018, 0.018, 16), M['eye'], lift=0.0015, rings=1)
            dec.fill(cm, ellipse_pts(0, 0, 0.011, 0.011, 12), M['haori'], lift=0.0024, rings=1)
            parts.append(weigh(cm.build('crest', angle=80), torso_weights(b)))
        except RuntimeError:
            pass

    # ---- arms: wide kimono sleeves with a hanging pouch, bare wrists, hands; cane in the right hand
    parts += arm_parts(b, M, M['haori'], [(0, 0.066), (0.35, 0.078), (0.55, 0.088), (1.0, 0.094)], M['skin'],
                       sleeve_end=0.86, roll=None, ball=0.06, bare_m=M['skin'],
                       hand_kw=dict(curl=0.5, s=1.05, n=6), n=12)
    for S in 'LR':
        el, wr = getattr(b, 'el_' + S), getattr(b, 'wr_' + S)
        end = el.lerp(wr, 0.86)
        pch = MB('pouch')
        mid = el.lerp(end, 0.62)
        fd = (wr - el).normalized()
        # the deep kimono sleeve pouch hanging below the forearm
        sweep(pch, [mid - fd * 0.07 + V((0, 0.015, -0.03)), mid + V((0, 0.02, -0.075)), mid + fd * 0.07 + V((0, 0.015, -0.06))],
              M['haori'], rfn=lambda t: (0.07 * math.sin(math.pi * (0.2 + 0.6 * t)) + 0.02, 0.045), n=10,
              up_fn=lambda q, T: V((1 if S == 'L' else -1, 0, 0)), cap0='round', cap1='round')
        parts.append(weigh(pch.build('pouch'), arm_weights(S, b)))
    # gnarled cane from the right palm to the ground, crook handle above the fist
    g = b.palm_center('R')
    tip = V((g.x - 0.01, g.y - 0.03, 0.015))
    cn = MB('cane')
    pts = []
    rnd2 = random.Random(8)
    for i in range(9):
        t = i / 8
        q = g.lerp(tip, t)
        if 0 < i < 8:
            q += V((rnd2.uniform(-1, 1) * 0.006, rnd2.uniform(-1, 1) * 0.006, 0))
        pts.append(q)
    sweep(cn, pts, M['wood'], rfn=lambda t: 0.014 + 0.004 * math.sin(t * 25) ** 2 - 0.002 * t, n=8, cap0='round',
          cap1='round')
    crook = [g + V((0, 0.0, -0.01)), g + V((0, -0.005, 0.05)), g + V((0.0, -0.045, 0.075)), g + V((0, -0.08, 0.055)),
             g + V((0, -0.085, 0.03))]
    sweep(cn, catmull(crook, 3), M['wood'], radius=0.015, n=8, cap0='round', cap1='round')
    for zz in (0.25, 0.45):
        q = g.lerp(tip, 1 - zz / g.z)
        ellipsoid(cn, q, (0.02, 0.02, 0.014), M['wood'], 8, 5)
    parts.append(weigh(cn.build('cane', angle=60), 'hand_R'))

    # ---- legs (inside the robe), white tabi socks and geta
    parts += leg_parts(b, M, M['kimono'], [(0, 0.07), (0.5, 0.058), (1.0, 0.045)], n=8, shape=0)   # under the robe
    for S in 'LR':
        ank = getattr(b, 'ank_' + S)
        tb = MB('tabi')
        sweep(tb, [ank + V((0, 0.0, 0.1)), ank + V((0, 0.0, 0.0)), ank + V((0, -0.04, -0.035)),
                   ank + V((0, -0.11, -0.04))], M['eye'], rfn=lambda t: (0.046 - 0.006 * t, 0.042 - 0.012 * t), n=10,
              cap0='flat', cap1='round', up_fn=lambda p, T: V((0, 0, 1)) if abs(T.z) < 0.9 else V((0, -1, 0)))
        parts.append(weigh(tb.build('tabi'), leg_weights(S, b)))
        gt = MB('geta')
        y0, y1 = ank.y + 0.06, ank.y - 0.15
        from kit import box as kbox
        top = kbox('geta_top', (0.1, y0 - y1, 0.03), (ank.x, (y0 + y1) / 2, 0.045), M['wood'], bevel=0.008, segments=2)
        t1 = kbox('geta_t1', (0.09, 0.03, 0.035), (ank.x, y0 - 0.045, 0.0175), M['wood'], bevel=0.005, segments=1)
        t2 = kbox('geta_t2', (0.09, 0.03, 0.035), (ank.x, y1 + 0.05, 0.0175), M['wood'], bevel=0.005, segments=1)
        strap = MB('hanao')
        sweep(strap, [ank + V((0.045, -0.02, -0.02)), ank + V((0.0, -0.075, -0.012)), ank + V((-0.045, -0.02, -0.02))],
              M['dark'], radius=0.009, n=6)
        parts.append(weigh(strap.build('hanao'), 'foot_' + S))
        for o in (top, t1, t2):
            parts.append(weigh(o, 'foot_' + S))

    k = normalize_height(parts, b, 1.58, style='elder', head=hd)
    arm = make_armature('Ota', b)
    body = skin(parts, arm, 'Ota', ao=AO)
    smooth_colors(body, 3, {'Skin'})
    face_tints(body, hd, k, blush=0.35, blush_col=(1.0, 0.72, 0.66), az=40)
    tip_k = tip * k
    anims.humanoid_clips(arm, b, 'ota', ['Idle', 'Walk', 'Talk', 'Wave', 'Bow', 'Sad'], energy=0.7, bounce=0.6,
                         arm_swing=0.6, hunch=10.0, lean=4.0, step=0.8, wave_side='L', walk_lift=0.7,
                         cane=dict(tip=tip_k), idle_hands=lambda A, s, p: PA.hand_behind_back(A, s, p, 'L'))
    return export_rigged('ota', arm)


# ================================================================ Hana


def build_hana():
    reset()
    M = dict(skin=mat('Skin', '#f4c09a', .52), hair=mat('Hair', '#3b2219', .42), eye=mat('Eye white', '#f6f3ec', .16),
             iris=mat('Iris', '#7a4a2a', .22), dark=mat('Dark', '#2a2028', .42), scarf=mat('Headscarf', '#e0567a', .62),
             apron=mat('Apron', '#fffbf2', .8), dress=mat('Dress', '#4a78c8', .66), leather=mat('Leather', '#8a5530', .5),
             brass=mat('Brass', '#e0ac45', .28, .85))
    M['lash'] = M['dark']
    b = Body(1.6, arm_out=17.0, sh_x=0.158, hip_x=0.092, upper=0.21, fore=0.195, hand=0.085, elbow_bend=10)
    c = b.head_c
    k0 = b.H / 1.45
    parts = []
    hd = std_head(b, M, dict(w=1.05, jaw=1.08, cheek=1.22, chin=0.92, scale=1.02), seg=26, rings=19)
    parts.append(weigh(hd.ob, 'head'))
    f = Face(hd, M, s=1.02)
    f.eyes(az=24, el=-8, w=0.02, h=0.022, lashes=2, brow=M['hair'], brow_el=9, brow_arch=0.006, brow_w=0.0048, tilt=-2,
           iris_w=0.85, iris_h=1.0, iris_dv=0.05, pupil=(0.38, 0.48), top=0.74)
    f.mouth(el=-29, w=0.022, smile=0.007, open_=0.01, m=M['dark'])
    md = f.decal(0, -29)
    md.fill(f.mb, [(-0.016, 0.0014), (0.016, 0.0014), (0.014, -0.0022), (-0.014, -0.0022)], M['eye'], lift=0.0019, rings=1)
    parts.append(weigh(f.build(), 'head'))
    parts.append(weigh(nose(hd, M['skin'], el=-16, size=(0.013, 0.011, 0.011), off=-0.005, seg=10), 'head'))
    parts.append(weigh(ears(hd, M['skin'], el=-9, s=1.0), 'head'))
    parts.append(neck_part(b, M, r=0.05))

    # ---- hair swept back into a bun, rose headscarf band with a bow at the top
    def hairline(az):
        a = abs(((az + 180) % 360) - 180)
        return interp([(0, 30), (45, 24), (80, 0), (110, -16), (150, -26), (180, -28)], a)
    parts.append(weigh(hair_cap(hd, M['hair'], hairline, off=0.008, seg=22, rows=7), 'head'))
    lk = MB('locks')
    bun_c = hd.pt(180, 52, 0.05)
    for az in (-60, -38, -16, 16, 38, 60, 90, -90, 125, -125):
        e_top = 70
        keys = [(az, hairline(az) + 4, 0.012), (az * 0.9, 45, 0.022), (az * 0.6 + (180 if az > 0 else -180) * 0.4, 62, 0.022)]
        pts = lock_path(hd, keys) + [bun_c + (hd.pt(az, 60, 0.02) - bun_c) * 0.3]
        lock(lk, pts, M['hair'], 0.06, 0.02, hd.c, n=8, samples=7, flat_in=0.6,
             wfn=lambda t: 0.85 + 0.15 * math.sin(math.pi * t) - 0.5 * t)
    for i in range(6):
        a = TAU * i / 6
        d = hd.dir(180, 52)
        X = d.cross(V((0, 0, 1))).normalized()
        Y = d.cross(X).normalized()
        p0 = bun_c + (X * math.cos(a) + Y * math.sin(a)) * 0.03
        p1 = bun_c + d * 0.035 + (X * math.cos(a + 1.2) + Y * math.sin(a + 1.2)) * 0.028
        p2 = bun_c + d * 0.05 + (X * math.cos(a + 2.4) + Y * math.sin(a + 2.4)) * 0.01
        lock(lk, [p0, p1, p2], M['hair'], 0.05, 0.03, bun_c, n=8, samples=6, flat_in=0.8)
    for sx in (1, -1):
        keys = [(sx * 50, 40, 0.01), (sx * 72, 5, 0.02), (sx * 70, -22, 0.02), (sx * 60, -32, 0.01)]
        lock(lk, lock_path(hd, keys), M['hair'], 0.04, 0.018, hd.c, n=8, samples=7)
    parts.append(weigh(radial_normals(lk.build('locks', angle=180), hd.c, 0.5), 'head'))
    # scarf band: a wide soft band from the forehead over the ears, knotted in a bow on top
    band = MB('scarf')
    rows = []
    for k, (el_off, off) in enumerate(((0, 0.034), (7, 0.042), (17, 0.044), (26, 0.038), (32, 0.026))):
        row = []
        for j in range(24):
            az = -180 + 360 * j / 24
            base_el = interp([(0, 34), (90, 14), (180, 4)], abs(az)) + el_off
            ripple = 0.004 * math.sin(math.radians(az) * 5 + k) * (1 if 0 < k < 4 else 0)
            row.append(hd.pt(az, base_el, off + ripple))
        rows.append(row)
    band.loft(rows, M['scarf'], [hd.c + V((0, 0, 0.0))] * 5)
    inner = [[hd.c + (p - hd.c) * 0.97 for p in rows[0]]]
    band.loft(inner + [rows[0]], M['scarf'], [hd.c] * 2)
    top_c = hd.pt(-14, 50, 0.06)
    ellipsoid(band, top_c, (0.03, 0.024, 0.024), M['scarf'], 10, 6)
    for sx in (1, -1):
        loop_c = top_c + V((sx * 0.045, 0.004, 0.012))
        ellipsoid(band, loop_c, (0.042, 0.02, 0.03), M['scarf'], 10, 6,
                  M=Matrix.Rotation(math.radians(sx * -18), 3, 'Y'))
        sweep(band, [top_c + V((sx * 0.01, -0.01, -0.01)), top_c + V((sx * 0.035, -0.022, -0.04)),
                     top_c + V((sx * 0.05, -0.02, -0.065))], M['scarf'], rfn=lambda t: (0.02 - 0.006 * t, 0.006), n=8,
              up_fn=lambda q, T: V((0, -1, 0.3)), e=3, cap0='round', cap1='flat')
    parts.append(weigh(band.build('scarf', angle=60), 'head'))

    # ---- dress: plump bodice, full skirt below the knee
    dk = [(0.3, 0.215, 0.18, 0.19), (0.45, 0.212, 0.178, 0.188), (0.6, 0.205, 0.172, 0.18), (0.7, 0.19, 0.16, 0.165),
          (0.8, 0.178, 0.165, 0.158), (0.9, 0.182, 0.175, 0.152), (0.97, 0.18, 0.16, 0.145), (1.01, 0.165, 0.13, 0.13),
          (1.04, 0.14, 0.1, 0.11), (1.065, 0.098, 0.078, 0.082), (1.085, 0.066, 0.06, 0.062)]
    dk = [(z * k0, a * k0, f_ * k0, g * k0) for z, a, f_, g in dk]
    zs = [z * k0 for z in dense(0.3, 1.085, 18)]
    rings, cs = torso_rings(dk, 26, zs, e=2.2, fn=lambda z, ang: 1 + 0.03 * sstep(0.62 * k0, 0.3 * k0, z) *
                            math.sin(ang * 7 + 0.4))
    dr = MB('dress')
    inner = [[cs[0] + (p - cs[0]) * 0.94 + V((0, 0, 0.04)) for p in rings[0]]]
    dr.loft(inner + rings, M['dress'], [cs[0] + V((0, 0, 0.04))] + cs)
    dr_ob = dr.build('dress', angle=60)
    dsurf = Surface([dr_ob])
    kz = b.knee_z

    def skirt_w(co):
        w = torso_weights(b)(co)
        if co.z < b.hip_z + 0.02:
            front = sstep(0.0, -0.1, co.y)
            f_ = sstep(b.hip_z + 0.02, b.hip_z - 0.3, co.z) * (0.62 + 0.25 * front)
            g = sstep(kz + 0.05, kz - 0.1, co.z) * (0.2 + 0.25 * front)
            s_ = sstep(-0.05, 0.05, co.x)
            w = mix_w((w, 1 - f_), ({'thigh_L': s_ * (1 - g), 'thigh_R': (1 - s_) * (1 - g), 'shin_L': s_ * g,
                                     'shin_R': (1 - s_) * g}, f_))
        return w
    parts.append(weigh(dr_ob, skirt_w))
    parts.append(weigh(ring_band((0, 0.005, 0.31 * k0), 0.216 * k0, 0.186 * k0, 0.012, M['dress'], 22, 'hem',
                                 sides=8), skirt_w))
    # apron: bib + skirt panel, neck strap, waist ties with a bow at the back, pocket
    rows = []
    for z in [zz * k0 for zz in (0.78, 0.84, 0.9, 0.96, 1.0)]:
        row = []
        for t in range(9):
            ang = math.radians(lerp(-34, 34, t / 8) * (1 - 0.15 * sstep(0.9 * k0, 1.0 * k0, z)))
            d = V((math.sin(ang), -math.cos(ang), 0))
            loc, nrm = dsurf.hit(V((0, 0, z)) + d * 0.5, -d)
            row.append(loc + nrm * 0.009)
        rows.append(row)
    bibm = MB('bib')
    top_row = [q + V((0, 0, 0.012)) for q in rows[-1]]
    bibm.loft(rows + [top_row], M['apron'], [V((0, 0.05, r[0].z)) for r in rows + [top_row]], wrap=False)
    parts.append(weigh(bibm.build('bib', angle=60), torso_weights(b)))
    ap = []
    for i in range(12):
        t = i / 11
        ang = math.radians(lerp(-62, 62, t))
        ap.append(ang)
    rows = []
    for z in [zz * k0 for zz in (0.36, 0.45, 0.55, 0.65, 0.73, 0.78)]:
        a_, bf, bb = interp(keys_to(dk), z)
        row = []
        for ang in ap:
            d = V((math.sin(ang), -math.cos(ang), 0))
            loc, nrm = dsurf.hit(V((0, 0, z)) + d * 0.5, -d)
            if loc is None:
                loc = V((0, 0, z)) + d * bf
            row.append(loc + (nrm if nrm is not None else d) * (0.012 + 0.01 * sstep(0.6 * k0, 0.36 * k0, z)))
        rows.append(row)
    apm = MB('apron')
    ids = apm.loft(rows, M['apron'], [V((0, 0.05, r[0].z)) for r in rows], wrap=False)
    apm_ob = apm.build('apron', angle=60)
    parts.append(weigh(apm_ob, skirt_w))
    asurf = Surface([apm_ob])
    parts.append(weigh(patch(asurf, (0, 0, 0.55 * k0), (0.25, -1, 0), rounded_rect(0.1, 0.08, 0.012), M['apron'],
                             lift=0.006, name='pocket'), skirt_w))
    tie = ring_band((0, 0.006, 0.785 * k0), 0.186 * k0, 0.172 * k0, 0.012, M['apron'], 22, 'tie', squash=0.5, sides=6,
                    e=2.6)
    parts.append(weigh(tie, torso_weights(b)))
    bow = MB('bow')
    bc = V((0, 0.17 * k0, 0.785 * k0))
    ellipsoid(bow, bc, (0.02, 0.015, 0.018), M['apron'], 8, 6)
    for sx in (1, -1):
        ellipsoid(bow, bc + V((sx * 0.038, 0.004, 0.006)), (0.036, 0.012, 0.024), M['apron'], 10, 6,
                  M=Matrix.Rotation(math.radians(sx * 15), 3, 'Y'))
        sweep(bow, [bc + V((sx * 0.01, 0.01, -0.01)), bc + V((sx * 0.03, 0.02, -0.08)), bc + V((sx * 0.04, 0.018, -0.14))],
              M['apron'], rfn=lambda t: (0.016, 0.004), n=6, up_fn=lambda q, T: V((0, 1, 0)), e=3, cap0='round',
              cap1='flat')
    parts.append(weigh(bow.build('bow'), torso_weights(b)))
    for sx in (1, -1):
        st = surface_strip(dsurf, [V((sx * 0.09, -0.3, 1.02 * k0)), V((sx * 0.08, -0.1, 1.07 * k0)),
                                   V((sx * 0.05, 0.1, 1.08 * k0)), V((0, 0.12, 1.085 * k0))], M['apron'], 0.022, 0.005,
                           off=0.004, name='neckstrap', out_ref=(0, 0, 0.95), samples=12)
        parts.append(weigh(st, torso_weights(b, chest_top=1.06 * k0)))
    # collar
    parts.append(weigh(ring_band((0, 0.002, 1.08 * k0), 0.075 * k0, 0.068 * k0, 0.012, M['apron'], 18, 'collar',
                                 squash=0.5, sides=6), neck_weights(b)))

    # ---- rolled sleeves to the elbow, plump forearms; low leather boots
    parts += arm_parts(b, M, M['dress'], [(0, 0.066), (0.35, 0.066), (0.5, 0.064), (1.0, 0.062)], M['skin'],
                       sleeve_end=0.12, roll=0.035, ball=0.064, bare_m=M['skin'], hand_kw=dict(curl=0.4, s=1.1, n=6))
    parts += leg_parts(b, M, M['skin'], [(0, 0.07), (0.5, 0.058), (0.8, 0.05), (1.0, 0.046)], n=10, shape=0)   # under the skirt
    for S in 'LR':
        bt = boot(b, S, M['leather'], M['dark'], shaft_top=0.17 * k0, shaft_r=0.05, width=0.05, toe_h=0.058,
                  cuff=None, flare=1.06, tab=False)
        parts.append(weigh(bt, leg_weights(S, b)))

    k = normalize_height(parts, b, 1.6, style='woman', head=hd)
    arm = make_armature('Hana', b)
    body = skin(parts, arm, 'Hana', ao=AO)
    smooth_colors(body, 3, {'Skin'})
    face_tints(body, hd, k, blush=0.95, blush_col=(1.0, 0.56, 0.56), radius=0.04, az=42)
    # flour: the apron is authored white; tint it cream everywhere except for flour dustings
    rnd = random.Random(5)
    spots = [(V((rnd.uniform(-0.12, 0.12), -0.2, rnd.uniform(0.4, 0.95))) * k, rnd.uniform(0.02, 0.04) * k)
             for _ in range(9)]

    def flour(co, n):
        base = V((0.97, 0.9, 0.76))
        m_ = 0.0
        for pc, r in spots:
            d = V((co.x - pc.x, 0, co.z - pc.z)).length
            m_ = max(m_, math.exp(-(d / r) ** 2))
        t = base.lerp(V((1, 1, 1)), m_)
        return (t.x, t.y, t.z)
    tint(body, flour, {'Apron'})
    anims.humanoid_clips(arm, b, 'hana', ['Idle', 'Walk', 'Talk', 'Wave', 'Knead', 'Cheer', 'Bow'], energy=0.95,
                         bounce=0.9, sway=1.25, stout=0.25, step=0.9, idle_hands=PA.hands_clasped_front,
                         arm_out=3.0)
    return export_rigged('hana', arm)


# ================================================================ villagers (recoloured per instance)


def build_villager(kind):
    """kind: 'man' (1.72 m), 'woman' (1.62 m) or 'kid' (1.20 m). Uses the contract recolour materials
    'Villager shirt', 'Villager trousers', 'Villager hair' for everything the runtime tints."""
    reset()
    H = {'man': 1.72, 'woman': 1.62, 'kid': 1.2}[kind]
    skin_c = {'man': '#e9ae82', 'woman': '#f3c29e', 'kid': '#f0b88f'}[kind]
    M = dict(skin=mat('Skin', skin_c, .55), hair=mat('Villager hair', '#3a2419', .45),
             eye=mat('Eye white', '#f6f3ec', .18), iris=mat('Iris', '#5a3a24', .25), dark=mat('Dark', '#272129', .45),
             shirt=mat('Villager shirt', '#d8823a', .65), trousers=mat('Villager trousers', '#3e5c8c', .7),
             shoes=mat('Shoes', '#6a4228', .5))
    M['lash'] = M['dark']
    if kind == 'man':
        b = Body(1.72, arm_out=13.0, sh_x=0.16, hip_x=0.085, hip_z=0.8, knee_z=0.45, ankle_z=0.09, spine_z=0.92,
                 chest_z=1.08, neck_z=1.3, headj_z=1.38, sh_z=1.26, upper=0.26, fore=0.235, hand=0.095,
                 head_c=(0, 0, 1.52), toe_y=-0.13)
        head_kw = dict(w=0.98, jaw=1.2, cheek=0.8, chin=1.2, scale=1.02)
        tk = [(0.72, 0.18, 0.13, 0.13), (0.82, 0.172, 0.125, 0.128), (0.95, 0.165, 0.122, 0.125), (1.08, 0.175, 0.12, 0.125),
              (1.18, 0.182, 0.118, 0.12), (1.23, 0.17, 0.106, 0.11), (1.27, 0.14, 0.09, 0.094), (1.305, 0.095, 0.07, 0.074),
              (1.33, 0.066, 0.058, 0.06)]
    elif kind == 'woman':
        b = Body(1.62, arm_out=14.0, sh_x=0.145, hip_x=0.085, hip_z=0.74, knee_z=0.41, ankle_z=0.085, spine_z=0.86,
                 chest_z=1.0, neck_z=1.2, headj_z=1.28, sh_z=1.16, upper=0.23, fore=0.21, hand=0.088,
                 head_c=(0, 0, 1.415), toe_y=-0.12)
        head_kw = dict(w=0.98, jaw=0.98, cheek=1.0, chin=0.98, scale=1.0)
        tk = [(0.34, 0.2, 0.17, 0.175), (0.5, 0.19, 0.16, 0.165), (0.66, 0.175, 0.145, 0.15), (0.78, 0.155, 0.125, 0.13),
              (0.88, 0.148, 0.125, 0.12), (0.98, 0.158, 0.135, 0.12), (1.07, 0.16, 0.12, 0.115), (1.12, 0.15, 0.1, 0.104),
              (1.16, 0.125, 0.086, 0.09), (1.195, 0.086, 0.066, 0.07), (1.22, 0.06, 0.054, 0.056)]
    else:
        b = Body(1.2, arm_out=15.0, sh_x=0.12, hip_x=0.07, hip_z=0.5, knee_z=0.27, ankle_z=0.07, spine_z=0.58,
                 chest_z=0.68, neck_z=0.83, headj_z=0.89, sh_z=0.8, upper=0.16, fore=0.15, hand=0.068,
                 head_c=(0, 0, 1.02), toe_y=-0.095, ankle_y=0.016)
        head_kw = dict(w=1.02, jaw=1.0, cheek=1.12, chin=0.95, scale=0.93)
        tk = [(0.46, 0.15, 0.115, 0.118), (0.54, 0.145, 0.112, 0.115), (0.62, 0.14, 0.11, 0.112), (0.7, 0.138, 0.105, 0.108),
              (0.76, 0.132, 0.096, 0.1), (0.8, 0.112, 0.082, 0.086), (0.83, 0.078, 0.06, 0.064), (0.85, 0.055, 0.05, 0.052)]
    hs = head_kw['scale']
    parts = []
    hd = std_head(b, M, head_kw, seg=24, rings=18)
    parts.append(weigh(hd.ob, 'head'))
    f = Face(hd, M, s=hs)
    if kind == 'man':
        f.eyes(az=23, el=-8, w=0.017, h=0.018, brow=M['hair'], brow_el=7, brow_w=0.0072, brow_arch=0.002, tilt=-3,
               iris_w=0.85, iris_dv=0.04, top=0.66)
        f.mouth(el=-30, w=0.018, smile=0.004)
    elif kind == 'woman':
        f.eyes(az=24, el=-8, w=0.02, h=0.023, lashes=2, brow=M['hair'], brow_el=9, brow_arch=0.005, tilt=2,
               iris_w=0.85, iris_dv=0.06, top=0.78)
        f.mouth(el=-29, w=0.016, smile=0.005, open_=0.006)
    else:
        f.eyes(az=24, el=-9, w=0.023, h=0.027, lashes=0, brow=M['hair'], brow_el=9, brow_arch=0.005, tilt=2,
               iris_w=0.86, iris_dv=0.07, top=0.86, pupil=(0.38, 0.5))
        f.mouth(el=-28, w=0.018, smile=0.006, open_=0.009)
    parts.append(weigh(f.build(), 'head'))
    parts.append(weigh(nose(hd, M['skin'], el=-16, size=(0.013, 0.012, 0.011) if kind == 'man' else (0.01, 0.009, 0.0085),
                            off=-0.006, seg=10, s=hs), 'head'))
    parts.append(weigh(ears(hd, M['skin'], el=-9, s=hs), 'head'))
    parts.append(neck_part(b, M, r=0.05 if kind == 'man' else (0.043 if kind == 'woman' else 0.036)))

    # ---- hair
    lk = MB('locks')
    rnd = random.Random({'man': 1, 'woman': 2, 'kid': 3}[kind])
    if kind == 'man':
        hl = lambda az: interp([(0, 40), (45, 34), (80, 14), (110, -2), (150, -14), (180, -16)], abs(((az + 180) % 360) - 180))
        parts.append(weigh(hair_cap(hd, M['hair'], hl, off=0.008, seg=20, rows=6), 'head'))
        for az in range(-150, 181, 30):
            keys = [(az * 0.2 + 20, 84, 0.01), (az, 55, 0.022), (az, 25, 0.02), (az + 5, hl(az) + 2, 0.012)]
            lock(lk, lock_path(hd, keys), M['hair'], 0.07, 0.022, hd.c, n=6, samples=6, flat_in=0.6)
        for az, el in ((-30, 44), (-10, 42), (12, 44), (34, 40)):
            keys = [(-22, 80, 0.012), (lerp(-22, az, 0.6), 62, 0.026), (az + 12, el, 0.02)]
            lock(lk, lock_path(hd, keys), M['hair'], 0.06, 0.024, hd.c, n=6, samples=6)
    elif kind == 'woman':
        hl = lambda az: interp([(0, 32), (45, 26), (80, 2), (110, -14), (150, -24), (180, -26)], abs(((az + 180) % 360) - 180))
        parts.append(weigh(hair_cap(hd, M['hair'], hl, off=0.008, seg=20, rows=6), 'head'))
        bun_c = hd.pt(180, 2, 0.05)
        for az in (-70, -45, -20, 20, 45, 70, 110, -110, 145, -145):
            keys = [(0, 80, 0.012), (az, 45, 0.024), (lerp(az, 180 if az > 0 else -180, 0.5), 18, 0.024)]
            pts = lock_path(hd, keys) + [bun_c + (hd.pt(az, 10, 0.02) - bun_c) * 0.3]
            lock(lk, pts, M['hair'], 0.07, 0.02, hd.c, n=6, samples=6, flat_in=0.6)
        for i in range(5):
            a = TAU * i / 5
            d = hd.dir(180, 2)
            X = d.cross(V((0, 0, 1))).normalized()
            Y = d.cross(X).normalized()
            lock(lk, [bun_c + (X * math.cos(a) + Y * math.sin(a)) * 0.028, bun_c + d * 0.03 +
                      (X * math.cos(a + 1.3) + Y * math.sin(a + 1.3)) * 0.026, bun_c + d * 0.046], M['hair'], 0.05,
                 0.028, bun_c, n=6, samples=5, flat_in=0.8)
        for sx in (1, -1):
            lock(lk, lock_path(hd, [(sx * 30, 60, 0.012), (sx * 60, 20, 0.022), (sx * 66, -12, 0.018),
                                    (sx * 60, -28, 0.01)]), M['hair'], 0.04, 0.018, hd.c, n=6, samples=6)
    else:
        hl = lambda az: interp([(0, 26), (45, 22), (80, 0), (110, -14), (150, -22), (180, -24)], abs(((az + 180) % 360) - 180))
        parts.append(weigh(hair_cap(hd, M['hair'], hl, off=0.008, seg=20, rows=6), 'head'))
        for az in range(-165, 181, 22):
            el_end = hl(az) - 4 + rnd.uniform(-3, 3)
            keys = [(az * 0.3, 86, 0.01), (az, 50, 0.026), (az + rnd.uniform(-8, 8), el_end + 10, 0.026),
                    (az + rnd.uniform(-10, 10), el_end, 0.016)]
            lock(lk, lock_path(hd, keys), M['hair'], 0.075, 0.026, hd.c, n=6, samples=6, flat_in=0.6,
                 wfn=lambda t: 0.75 + 0.25 * math.sin(math.pi * t) - 0.65 * max(0, t - 0.65) / 0.35)
        for i in range(3):
            az = rnd.uniform(-40, 40)
            keys = [(az, 84, 0.02), (az + 10, 95, 0.05)]
            s0 = hd.pt(az, 82, 0.02)
            lock(lk, [s0, s0 + V((0.01, 0.01, 0.03)), s0 + V((0.025, 0.02, 0.045))], M['hair'], 0.035, 0.018, hd.c, n=6,
                 samples=4)
    parts.append(weigh(radial_normals(lk.build('locks', angle=180), hd.c, 0.5), 'head'))

    # ---- torso garment in 'Villager shirt'
    zs = dense(tk[0][0], tk[-1][0], 14)
    rings, cs = torso_rings(tk, 22, zs, e=2.3,
                            fn=lambda z, ang: 1 + 0.02 * sstep(tk[2][0], tk[0][0], z) * math.sin(ang * 6 + 1))
    sh = MB('shirt')
    inner = [[cs[0] + (p - cs[0]) * 0.94 + V((0, 0, 0.03)) for p in rings[0]]]
    sh.loft(inner + rings, M['shirt'], [cs[0] + V((0, 0, 0.03))] + cs)
    sh_ob = sh.build('shirt', angle=60)
    ssurf = Surface([sh_ob])
    top = tk[-1][0]
    if kind == 'woman':
        kz = b.knee_z

        def tw(co):
            w = torso_weights(b)(co)
            if co.z < b.hip_z + 0.02:
                front = sstep(0.0, -0.1, co.y)
                f_ = sstep(b.hip_z + 0.02, b.hip_z - 0.3, co.z) * (0.62 + 0.25 * front)
                g = sstep(kz + 0.05, kz - 0.1, co.z) * (0.2 + 0.25 * front)
                s_ = sstep(-0.05, 0.05, co.x)
                w = mix_w((w, 1 - f_), ({'thigh_L': s_ * (1 - g), 'thigh_R': (1 - s_) * (1 - g), 'shin_L': s_ * g,
                                         'shin_R': (1 - s_) * g}, f_))
            return w
        # the long skirt is the trousers material; the blouse is the shirt material (split at the waist)
        me = sh_ob.data
        mi_tr = len(me.materials)
        me.materials.append(M['trousers'])
        for poly in me.polygons:
            if poly.center.z < 0.8 * H / 1.62:
                poly.material_index = mi_tr
        parts.append(weigh(sh_ob, tw))
        parts.append(weigh(ring_band((0, 0.004, 0.8 * H / 1.62), 0.158, 0.13, 0.024, M['dark'], 20, 'sash', squash=0.4,
                                     sides=6, e=3), torso_weights(b)))
        bow = MB('bow')
        bc = V((0, 0.13, 0.8 * H / 1.62))
        ellipsoid(bow, bc, (0.018, 0.014, 0.016), M['dark'], 8, 5)
        for sx in (1, -1):
            ellipsoid(bow, bc + V((sx * 0.034, 0.004, 0.004)), (0.032, 0.011, 0.02), M['dark'], 8, 5,
                      M=Matrix.Rotation(math.radians(sx * 15), 3, 'Y'))
            sweep(bow, [bc + V((sx * 0.008, 0.01, -0.01)), bc + V((sx * 0.024, 0.02, -0.07)),
                        bc + V((sx * 0.03, 0.02, -0.12))], M['dark'], rfn=lambda t: (0.014, 0.004), n=6,
                  up_fn=lambda q, T: V((0, 1, 0)), e=3, cap0='round', cap1='flat')
        parts.append(weigh(bow.build('bow'), torso_weights(b)))
    else:
        tw = torso_weights(b, skirt=0.5, skirt_top=b.hip_z + 0.02)
        parts.append(weigh(sh_ob, tw))
        # collar and placket buttons
        parts.append(weigh(ring_band((0, 0.004, top - 0.005), tk[-1][1] + 0.01, tk[-1][2] + 0.008, 0.012, M['shirt'], 16,
                                     'collar', squash=0.5, sides=6), neck_weights(b)))
        for i in range(3 if kind == 'man' else 2):
            z = top - 0.08 - i * 0.09 * H / 1.72
            loc, nrm = ssurf.nearest(V((0, -0.3, z)))
            bt = MB('btn')
            ellipsoid(bt, loc + nrm * 0.004, (0.008, 0.008, 0.008), M['dark'], 6, 4)
            parts.append(weigh(bt.build('btn'), tw))
        if kind == 'man':
            # belt and a white neck towel
            parts.append(weigh(ring_band((0, 0.002, b.hip_z + 0.07), tk[0][1] * 0.99, tk[0][2] + 0.005, 0.016,
                                         M['dark'], 20, 'belt', squash=0.35, sides=6, e=3), torso_weights(b)))
            # a tenugui towel slung over the right shoulder
            tw_ = MB('towel')
            tp = [V((-0.1, -0.13, 1.06)), V((-0.12, -0.09, 1.2)), V((-0.11, -0.02, 1.27)), V((-0.1, 0.07, 1.25)),
                  V((-0.1, 0.13, 1.14))]
            loc_pts = []
            for q in tp:
                l_, n_ = ssurf.nearest(q)
                loc_pts.append(l_ + n_ * 0.012)
            sweep(tw_, catmull(loc_pts, 3), M['eye'], rfn=lambda t: (0.03, 0.007), n=6,
                  up_fn=lambda q, T: (q - V((0, 0, 1.1))), e=3, cap0='flat', cap1='flat')
            parts.append(weigh(tw_.build('towel'), torso_weights(b, chest_top=1.3)))
    # ---- pelvis + legs + shoes
    if kind != 'woman':
        hz = b.hip_z
        parts.append(pelvis(b, M['trousers'], [(hz - 0.1, tk[0][1] * 0.84, tk[0][2] * 0.83, tk[0][3] * 0.86),
                                               (hz - 0.03, tk[0][1] * 0.9, tk[0][2] * 0.87, tk[0][3] * 0.9),
                                               (tk[0][0] + 0.06, tk[0][1] * 0.9, tk[0][2] * 0.87, tk[0][3] * 0.9)], n=18))
    if kind == 'man':
        parts += leg_parts(b, M, M['trousers'], [(0, 0.085), (0.5, 0.072), (1.0, 0.066)], n=10, cuff=0.025,
                           trouser_end=0.94)
    elif kind == 'woman':
        parts += leg_parts(b, M, M['skin'], [(0, 0.07), (0.5, 0.055), (1.0, 0.044)], n=8, shape=0)   # under the skirt (the taper would poke through it mid-stride)
    else:
        parts += leg_parts(b, M, M['trousers'], [(0, 0.07), (0.6, 0.066), (1.0, 0.066)], n=10, cuff=0.018,
                           trouser_end=0.36, bare=M['skin'], bare_prof=[(0, 0.042), (0.6, 0.036), (1, 0.032)])
    for S in 'LR':
        bt = boot(b, S, M['shoes'], M['dark'], shaft_top=0.13 * H / 1.45 if kind != 'kid' else 0.11,
                  shaft_r=0.05 * H / 1.45 if kind != 'kid' else 0.042, width=0.05 * H / 1.5, toe_h=0.058 * H / 1.5,
                  cuff=None, flare=1.04, tab=False, s=H / 1.5 if kind != 'kid' else 0.9, heel=0.05)
        parts.append(weigh(bt, leg_weights(S, b)))
    # ---- arms: sleeves (rolled for the man, short for the kid), mitten hands
    if kind == 'man':
        parts += arm_parts(b, M, M['shirt'], [(0, 0.064), (0.5, 0.058), (1.0, 0.054)], M['skin'], sleeve_end=0.35,
                           roll=0.03, ball=0.062, bare_m=M['skin'], hand_kw=dict(curl=0.4, s=1.15, mitten=True), n=10)
    elif kind == 'woman':
        parts += arm_parts(b, M, M['shirt'], [(0, 0.056), (0.5, 0.05), (1.0, 0.048)], M['skin'], sleeve_end=1.0,
                           ball=0.056, hand_kw=dict(curl=0.4, s=1.0, mitten=True), n=10, cuff=0.02)
    else:
        parts += arm_parts(b, M, M['shirt'], [(0, 0.05), (0.3, 0.05), (0.45, 0.052), (1.0, 0.05)], M['skin'],
                           sleeve_end=-0.55, roll=0.012, ball=0.048, bare_m=M['skin'],
                           hand_kw=dict(curl=0.4, s=0.85, mitten=True), n=10)
    k = normalize_height(parts, b, H, style={'man': 'man', 'woman': 'villager-woman', 'kid': 'kid'}[kind], head=hd)
    arm = make_armature('Villager', b)
    body = skin(parts, arm, 'villager-' + kind, ao=AO)
    smooth_colors(body, 3, {'Skin'})
    face_tints(body, hd, k, blush={'man': 0.3, 'woman': 0.6, 'kid': 0.75}[kind], az=40)
    style = {'man': dict(energy=0.9, arm_swing=0.9), 'woman': dict(energy=0.9, idle_hands=PA.hands_clasped_front, sway=1.1),
             'kid': dict(energy=1.35, bounce=1.4, arm_swing=1.3, step=1.05)}[kind]
    anims.humanoid_clips(arm, b, 'villager-' + kind, ['Idle', 'Walk', 'Talk', 'Wave', 'Cheer'], **style)
    return export_rigged('villager-' + kind, arm)


BUILDERS = {'genzo': build_genzo, 'rin': build_rin, 'ota': build_ota, 'hana': build_hana,
            'villager-man': lambda: build_villager('man'), 'villager-woman': lambda: build_villager('woman'),
            'villager-kid': lambda: build_villager('kid')}
