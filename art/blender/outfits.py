"""Wardrobe for the graceful performers (graceful.py): swappable clothes on the shared skeleton.

Every garment is self-contained over its slot, so any top goes with any bottom and any shoes:
  Top_*     neck to wrists: the torso layer(s) and both arms (sleeves and the bare skin below them)
  Bottom_*  waist to ankles: waistband, skirt or trousers, and the legs (tights, leggings or bare)
  Shoes_*   ankles down
  Hat_*     over the hair
The body mesh (build_performers.py) is the head, hair, neck and hands only. Layers overlap at the joins (a top's hem
covers the waistband, a sleeve's cuff the wrist, trousers' hems the shoe collars), never leave a gap.

Each builder returns [(part, region)] where region is how the body-shape morphs move it (shapes.py): 'torso' (radial
about the body's axis), 'drape' (a skirt or coat tail: follows the hips all the way down), 'arm_L/R', 'leg_L/R',
'foot', 'hand', 'head'. Material names are the slots' roles ('Top', 'Top trim', 'Inner', 'Bottom', 'Bottom trim',
'Legwear', 'Shoes', 'Shoe sole', 'Hat'): the runtime recolours a look by those names (src/content/performers.js).
"""
import math
import bpy
from mathutils import Vector, Matrix, Quaternion
from human_lib import *
from garments import torso_rings, dense, ring_band, surface_strip, patch, rounded_rect
import graceful as G

V = Vector


def Z(b):
    """Heights of one body the garments are cut to (so the same pattern fits the young woman and the young man)."""
    return dict(waist=b.spine_z + 0.01, hip=b.hip_z, crotch=b.hip_z - 0.08, knee=b.knee_z, ank=b.ankle_z, chest=b.chest_z,
                top=G.TORSO[b.kind][-1][0])


def _keys_with(b, keys, z):
    """Make sure a ring sits exactly at z (interpolated)."""
    if any(abs(k[0] - z) < 1e-5 for k in keys):
        return keys
    a = interp([(k[0], k[1:]) for k in keys], z)
    return sorted(keys + [(z, *a)], key=lambda k: k[0])


def shell(b, m, z_bot, z_top, off=0.005, n=40, rows=None, fn=None, flare=None, e=2.25, name='shell', lip=0.02,
          front_gap=0.0, cap=None, front=0.8):
    """A torso layer from z_bot to z_top: the body's torso rings grown by `off`, optional flare(z) and folds fn(z, ang).
    front_gap: half-angle (degrees) left open at the front (a jacket worn open). Returns the object."""
    rows = rows or max(8, int((z_top - z_bot) / 0.016))
    zs = dense(z_bot, z_top, rows)
    # one ring per row, the flare worked out at every row (below the hips the torso keeps its hip size)
    t0 = G.TORSO[b.kind]
    keys = []
    for z in zs:
        a_, bf, bb = G.torso_at(b, min(max(z, t0[0][0]), t0[-1][0]))
        e_ = flare(z) if flare else 0.0
        keys.append((z, a_ + off + e_, bf + off + e_ * front, bb + off + e_ * 0.9))
    mb = MB(name)
    if front_gap <= 0:
        rings, cs = torso_rings(keys, n, zs, e=e, fn=fn)
        inner = [[cs[0] + (p - cs[0]) * (1 - lip / 0.12) + V((0, 0, lip)) for p in rings[0]]]
        mb.loft(inner + rings, m, [cs[0] + V((0, 0, lip))] + cs, cap1=cap)
        return mb.build(name, angle=60)
    # open front: the rings run from +gap round the back to -gap, with a thickness edge at both fronts
    g = math.radians(front_gap)
    outer, inner_r, cs = [], [], []
    for z in zs:
        a_, bf, bb = interp([(k[0], k[1:]) for k in keys], z)
        c = V((0, 0, z))
        row_o, row_i = [], []
        for j in range(n + 1):
            ang = -math.pi / 2 + g + (2 * math.pi - 2 * g) * j / n
            ca, sa = math.cos(ang), math.sin(ang)
            ry = bb if sa >= 0 else bf
            f = fn(z, ang) if fn else 1.0
            k2 = 2.0 / e
            p = c + V((a_ * spow(ca, k2) * f, ry * spow(sa, k2) * f, 0))
            row_o.append(p)
            row_i.append(c + (p - c) * (1 - 0.012 / max((p - c).length, 0.05)))
        outer.append(row_o)
        inner_r.append(row_i)
        cs.append(c)
    thick_rows(mb, outer, inner_r, m, cs)
    return mb.build(name, angle=60)


def thick_rows(mb, outer, inner, m, cs, close_top=True):
    """A cloth sheet with thickness from matching rows of outer and inner points (rows run bottom -> top, columns
    left -> right, not wrapped): outer faces point away from the row centres, inner faces toward them, and the four
    edges (hem, top, both fronts) are closed."""
    oo = [[mb.vert(p) for p in r] for r in outer]
    ii = [[mb.vert(p) for p in r] for r in inner]
    nr, nc = len(oo), len(oo[0])
    for i in range(nr - 1):
        c = (cs[i] + cs[i + 1]) / 2
        for j in range(nc - 1):
            q = [oo[i][j], oo[i][j + 1], oo[i + 1][j + 1], oo[i + 1][j]]
            mb.face(q, m, inside=c)
            q = [ii[i][j], ii[i][j + 1], ii[i + 1][j + 1], ii[i + 1][j]]
            pc = sum((mb.V[k] for k in q), V()) / 4
            mb.face(q, m, out=c - pc)
    for i in range(nr - 1):
        for j in (0, nc - 1):
            q = [oo[i][j], oo[i + 1][j], ii[i + 1][j], ii[i][j]]
            pc = sum((mb.V[k] for k in q), V()) / 4
            nb = mb.V[oo[i][1 if j == 0 else nc - 2]]
            mb.face(q, m, out=pc - nb)
    for i, d in ((0, V((0, 0, -1))), (nr - 1, V((0, 0, 1)))):
        if i == nr - 1 and not close_top:
            continue
        for j in range(nc - 1):
            mb.face([oo[i][j], oo[i][j + 1], ii[i][j + 1], ii[i][j]], m, out=d)


def pleats(count=18, depth=0.07, z_top=None, z_full=None):
    """Fold function for a pleated skirt: knife pleats (a saw-tooth in the radius) that open toward the hem."""
    def fn(z, ang):
        t = 1.0 if z_top is None else sstep(z_top, z_full, z)
        x = (ang / (2 * math.pi) * count) % 1.0
        saw = (x * 1.2 if x < 0.8 else (1.0 - x) * 4.8) - 0.48
        return 1 + depth * t * saw
    return fn


def soft_folds(amp=0.03, k=7, z_top=None, z_full=None, ph=0.4):
    def fn(z, ang):
        t = 1.0 if z_top is None else sstep(z_top, z_full, z)
        return 1 + amp * t * (math.sin(ang * k + ph) * 0.7 + 0.3 * math.sin(ang * (k * 2 - 1) + 1.3))
    return fn

# ================================================================================================ tops


def top_inner(b, M, m='Inner', z_bot=None, sleeve=0.4, collar=True, sleeve_prof=None, n=40, puff=0.0, m_arm=None):
    """A fitted top / tee (tucked into the bottom's waistband) with sleeves to `sleeve` of the arm."""
    mt = M[m]
    out = []
    zz = Z(b)
    z_bot = zz['hip'] + 0.04 if z_bot is None else z_bot
    zt = G.TORSO[b.kind][-1][0] - 0.014
    loose = z_bot < zz['hip']
    # worn over the bottom (untucked): it stands clear of the waistband and rides on the thighs below the hips
    flare = (lambda z: 0.013 * sstep(zz['waist'] + 0.03, zz['waist'] - 0.03, z) + 0.032 * sstep(zz['hip'] + 0.02, z_bot, z)) if loose else None
    body = shell(b, mt, z_bot, zt, off=0.006, n=n, fn=soft_folds(0.008, 9), name='inner', flare=flare)
    out.append((weigh(body, G.top_weights(b, collar=b.neck_z + 0.02, tail=0.75 if loose else 0.0)), 'drape' if loose else 'torso'))
    if collar:
        cz = zt - 0.003
        a_, bf, bb = G.torso_at(b, cz)
        out.append((weigh(ring_band((0, 0.003, cz), a_ + 0.008, (bf + bb) / 2 + 0.007, 0.0055, mt, 32, 'collar', squash=0.6, sides=8),
                          G.top_weights(b, collar=b.neck_z + 0.02)), 'torso'))
    if sleeve is not None:
        for S in 'LR':
            for p in G.arm(b, S, mt, M['skin'] if m_arm is None else M[m_arm], sleeve=sleeve,
                           prof=sleeve_prof or [(0, 0.05), (0.5, 0.047), (1, 0.046)], puff=puff):
                out.append((p, 'arm_' + S))
    return out


def top_crop_jacket(b, M, m='Top', trim='Top trim', inner='Inner', z_crop=None, n=44, gap=17, inner_bot=None):
    """A cropped stage jacket worn open over a fitted top: boxy shoulders, long sleeves with trimmed cuffs, a shiny trim
    down the fronts and round the hem."""
    zz = Z(b)
    z_crop = zz['waist'] + 0.03 if z_crop is None else z_crop
    out = top_inner(b, M, inner, z_bot=inner_bot, sleeve=None, collar=True)
    mt, mtr = M[m], M[trim]
    zt = G.TORSO[b.kind][-1][0] - 0.012

    def flare(z):
        # below the waist (a hip-length jacket) it stands clear of a loose tee worn under it
        return (0.004 * sstep(z_crop + 0.09, z_crop, z) + 0.014 * sstep(zz['waist'] + 0.06, zz['waist'] - 0.01, z)
                + 0.024 * sstep(zz['waist'] - 0.02, zz['hip'] - 0.02, z))
    jk = shell(b, mt, z_crop, zt - 0.006, off=0.016, n=n, flare=flare, front_gap=gap, name='jacket',
               fn=lambda z, ang: 1 + 0.006 * math.sin(ang * 6 + z * 30))
    out.append((weigh(jk, G.top_weights(b, collar=b.neck_z + 0.01)), 'torso'))
    jsurf = Surface([jk])
    # shiny trim: down both fronts and round the hem
    for sx in (1, -1):
        ang = -math.pi / 2 + sx * math.radians(gap + 0.5)
        pts = []
        for z in dense(z_crop + 0.004, zt - 0.02, 9):
            a_, bf, bb = G.torso_at(b, z)
            pts.append(V((math.cos(ang) * (a_ + 0.06), math.sin(ang) * (bf + 0.06), z)))
        st = surface_strip(jsurf, pts, mtr, 0.014, 0.004, off=0.002, name='trim', out_ref=(0, 0.02, 1.1), samples=18)
        out.append((weigh(st, G.top_weights(b)), 'torso'))
    a_, bf, bb = G.torso_at(b, z_crop + 0.008)
    hem = []
    for j in range(31):
        ang = -math.pi / 2 + math.radians(gap + 0.5) + (2 * math.pi - 2 * math.radians(gap + 0.5)) * j / 30
        ry = bb if math.sin(ang) >= 0 else bf
        hem.append(V((math.cos(ang) * (a_ + 0.03), math.sin(ang) * (ry + 0.03), z_crop + 0.008)))
    out.append((weigh(surface_strip(jsurf, hem, mtr, 0.016, 0.004, off=0.002, name='hemtrim', out_ref=(0, 0, z_crop + 0.1),
                                    samples=40), G.top_weights(b)), 'torso'))
    # sleeves: long, a little puffed at the shoulder, trimmed cuffs
    for S in 'LR':
        for p in G.arm(b, S, mt, M['skin'], sleeve=1.0, prof=[(0, 0.05), (0.3, 0.047), (0.55, 0.043), (0.85, 0.039), (1, 0.04)],
                       cuff=0.02, m_cuff=mtr, puff=0.0, fold=0.035):
            out.append((p, 'arm_' + S))
    return out


def top_long_shirt(b, M, m='Top', trim='Top trim', z_bot=None, sleeve=0.42, n=44):
    """A long, easy shirt to the upper thigh, worn over the bottom: a soft hem that rides on the thighs, sleeves to
    `sleeve`, a contrast neckband and hem band."""
    mt, mtr = M[m], M[trim]
    out = []
    zz = Z(b)
    z_bot = zz['hip'] - 0.12 if z_bot is None else z_bot
    zt = G.TORSO[b.kind][-1][0] - 0.004
    za, zb = zz['waist'] - 0.05, zz['hip'] - 0.09

    def flare(z):
        # a tunic's A-line: it clears any bottom under it (the pleated skirt's flare included)
        return 0.006 + 0.072 * sstep(zz['waist'], z_bot, z) ** 1.3
    sh = shell(b, mt, z_bot, zt, off=0.015, n=n, flare=flare, name='shirt', fn=soft_folds(0.02, 7, za, zb))
    out.append((weigh(sh, G.top_weights(b, collar=b.neck_z + 0.02, tail=0.75)), 'drape'))
    a_, bf, bb = G.torso_at(b, z_bot + 0.012)
    e = flare(z_bot)
    out.append((weigh(ring_band((0, 0.004, z_bot + 0.012), a_ + 0.012 + e + 0.002, (bf + bb) / 2 + 0.012 + e, 0.008, mtr, 40,
                                'hemband', squash=0.7, sides=8), G.top_weights(b, tail=0.75)), 'drape'))
    cz = G.TORSO[b.kind][-1][0] - 0.01
    a_, bf, bb = G.torso_at(b, cz)
    out.append((weigh(ring_band((0, 0.003, cz), a_ + 0.013, (bf + bb) / 2 + 0.01, 0.007, mtr, 28, 'neckband', squash=0.6, sides=8),
                      G.top_weights(b, collar=b.neck_z + 0.02)), 'torso'))
    for S in 'LR':
        for p in G.arm(b, S, mt, M['skin'], sleeve=sleeve, prof=[(0, 0.052), (0.5, 0.05), (1, 0.049)], puff=0.0,
                       m_cuff=mtr, fold=0.05):
            out.append((p, 'arm_' + S))
    return out

# ================================================================================================ bottoms


def legs(b, M, m='Legwear', n=16):
    out = []
    for S in 'LR':
        out.append((G.leg(b, S, M[m], n=n), 'leg_' + S))
    return out


def bottom_skirt_short(b, M, m='Bottom', trim='Bottom trim', legwear='Legwear', hem=None, n=72):
    """A pleated skirt to mid-thigh over leggings: a waistband, knife pleats opening toward the hem."""
    mb_, mt = M[m], M[trim]
    out = []
    zz = Z(b)
    zw = zz['waist']
    hem = zz['knee'] + 0.19 if hem is None else hem
    keys = []
    for z in dense(hem, zw, 12):
        a_, bf, bb = G.torso_at(b, max(z, zz['crotch'] + 0.02))
        fl = 0.072 * sstep(zw - 0.015, hem, z) ** 0.9
        keys.append((z, a_ + 0.013 + fl, bf + 0.013 + fl * 0.85, bb + 0.013 + fl * 0.95))
    zs = dense(hem, zw, 18)
    rings, cs = torso_rings(keys, n, zs, e=2.3, fn=pleats(24, 0.06, zw - 0.05, hem))
    sk = MB('skirt')
    inner = [[cs[0] + (p - cs[0]) * 0.95 + V((0, 0, 0.02)) for p in rings[0]]]
    sk.loft(inner + rings, mb_, [cs[0] + V((0, 0, 0.02))] + cs)
    out.append((weigh(sk.build('skirt', angle=35), G.skirt_weights(b, top=b.hip_z + 0.11, follow=0.95, shins=False)), 'drape'))
    a_, bf, bb = G.torso_at(b, zw - 0.012)
    out.append((weigh(ring_band((0, 0.002, zw - 0.012), a_ + 0.011, (bf + bb) / 2 + 0.01, 0.0075, mt, 40, 'waistband', squash=0.55,
                                sides=8, e=2.3), G.top_weights(b)), 'torso'))
    out.append((G.pelvis(b, M[legwear], zw - 0.05, zz['crotch'], off=0.002), 'torso'))
    out += legs(b, M, legwear)
    return out


def bottom_trousers_wide(b, M, m='Bottom', trim='Bottom trim', n=20):
    """Wide trousers: a fitted seat and waistband, legs that fall straight and wide to the shoe, soft folds."""
    mb_, mt = M[m], M[trim]
    zz = Z(b)
    out = [(G.pelvis(b, mb_, zz['waist'], zz['crotch'], off=0.007), 'torso')]
    zb = zz['waist'] - 0.015
    a_, bf, bb = G.torso_at(b, zb)
    out.append((weigh(ring_band((0, 0.002, zb), a_ + 0.009, (bf + bb) / 2 + 0.008, 0.007, mt, 40, 'waistband', squash=0.55,
                                sides=8, e=2.3), G.top_weights(b)), 'torso'))
    kk = 1.0 if b.kind == 'f' else 1.12
    for S in 'LR':
        prof = [(u, r * kk) for u, r in [(0.0, 0.07), (0.12, 0.08), (0.35, 0.077), (0.5, 0.073), (0.75, 0.074), (0.95, 0.079), (1.0, 0.08)]]
        out.append((G.leg(b, S, mb_, prof=prof, n=n, fold=0.035, top=-0.03, cap1=None, name='trouser'), 'leg_' + S))
        # the hem's inner wall (the open end never shows a gap)
        ank = getattr(b, 'ank_' + S)
        c = V((ank.x, ank.y, ank.z - 0.012))
        ro = ring(c, V((1, 0, 0)), V((0, 1, 0)), 0.08 * kk, 0.08 * kk, n)
        ri = [c + (q - c) * 0.85 + V((0, 0, 0.02)) for q in ro]
        hm = MB('hem')
        hm.loft([ro, ri], mb_, [c, c + V((0, 0, 0.02))])
        out.append((weigh(hm.build('hem', angle=60), G.leg_w(b, S)), 'leg_' + S))
    return out

# ================================================================================================ shoes


def foot_last(b, S, m_upper, m_sole, length=None, width=0.043, height=0.075, sole=0.022, toe=0.5, collar=0.11,
              collar_r=0.04, heel=0.0, name='shoe', n=20, chunky=1.0, accent=None):
    """A shoe on the foot: a last-shaped upper from heel to toe, a sole slab (thick for sneakers), a padded collar
    round the ankle. Returns a list of parts (weighted to the foot and shin)."""
    sx = 1 if S == 'L' else -1
    ank = getattr(b, 'ank_' + S)
    toe_p = getattr(b, 'toe_' + S)
    if b.kind == 'm':
        width, height, collar_r = width * 1.1, height * 1.06, collar_r * 1.12
    fo = math.radians(b.foot_out) * sx
    R = Matrix.Rotation(fo, 3, 'Z')
    L = length or (abs(toe_p.y - ank.y) + 0.065)
    y_heel = ank.y + 0.055
    base = V((ank.x, 0, 0))

    def P(x, y, z):
        return base + R @ V((x, y, z))
    rings, cs = [], []
    ts = [0.0, 0.05, 0.14, 0.28, 0.45, 0.62, 0.76, 0.87, 0.95, 1.0]
    for t in ts:
        y = y_heel - L * t
        hh = interp([(0, 0.62), (0.1, 0.92), (0.3, 1.0), (0.5, 0.8), (0.7, 0.58), (0.9, 0.44), (1.0, 0.26)], t) * height * chunky
        ww = interp([(0, 0.66), (0.12, 0.84), (0.4, 0.96), (0.68, 1.04), (0.86, 0.92), (1.0, 0.42)], t) * width * (1 + 0.1 * (chunky - 1))
        zc = sole + hh * 0.5 - 0.003
        c = P(0, y, zc)
        rr = ring(c, R @ V((1, 0, 0)), V((0, 0, 1)), ww, hh * 0.5, n, 2.6 if t < 0.85 else 2.2)
        rr = [V((q.x, q.y, max(q.z, sole - 0.002))) for q in rr]
        rings.append(rr)
        cs.append(c)
    mb = MB(name)
    mb.loft(rings, m_upper, cs, cap0=P(0, y_heel + 0.006, sole + 0.03 * chunky), cap1=P(0, y_heel - L - 0.004, sole + height * 0.11))
    # sole slab
    outline = []
    for i in range(28):
        a = TAU * i / 28
        t = 0.5 - 0.5 * math.sin(a)          # 0 heel .. 1 toe
        y = y_heel + 0.006 - (L + 0.01) * t
        ww = interp([(0, 0.7), (0.12, 0.86), (0.4, 0.98), (0.68, 1.06), (0.88, 0.94), (1.0, 0.5)], t) * width * 1.12 * (1 + 0.08 * (chunky - 1))
        outline.append((ww * math.cos(a) * (1 if math.cos(a) >= 0 else 1), y))
    srings = [[P(u, v, z) for u, v in outline] for z in (0.0, sole * 0.5, sole)]
    srings[1] = [P(u * 1.03, v, sole * 0.5) for u, v in outline]
    mb.loft(srings, m_sole, [P(0, y_heel - L / 2, z) for z in (0.0, sole * 0.5, sole)], cap0='flat', cap1='flat')
    if heel > 0:
        hb = [(u * 0.7, y_heel - 0.004 + (v - y_heel) * 0.28) for u, v in outline]
        mb.loft([[P(u, v, -heel) for u, v in hb], [P(u, v, 0.0005) for u, v in hb]], m_sole, [P(0, y_heel - 0.03, -heel), P(0, y_heel - 0.03, 0)],
                cap0='flat', cap1=None)
    # ankle collar (padded ring) and the tongue
    cc = V((ank.x, ank.y + 0.006, collar))
    sweep(mb, [cc + V((0, 0, -0.035)), cc], m_upper, rfn=lambda t: (collar_r * (1.05 - 0.05 * t), collar_r * 1.1), n=n, cap0=None, cap1=None)
    ring_pts = [cc + V((math.cos(a) * collar_r * 1.04, math.sin(a) * collar_r * 1.14, 0)) for a in [TAU * j / 22 for j in range(22)]]
    sweep(mb, ring_pts + ring_pts[:2], accent or m_upper, radius=0.007 * chunky, n=8, cap0=None, cap1=None)
    out = [weigh(mb.build(name, angle=50), G.leg_w(b, S))]
    return out


def shoes_sneakers(b, M, m='Shoes', sole='Shoe sole', accent='Shoe accent'):
    out = []
    for S in 'LR':
        for p in foot_last(b, S, M[m], M[sole], width=0.046, height=0.074, sole=0.03, chunky=1.12, collar=0.105, collar_r=0.037,
                           accent=M.get(accent) or M[sole], name="sneaker"):
            out.append((p, 'foot'))
        # a stripe on each side (the brand-free sporty swoosh is just a soft band)
    return out


def shoes_flats(b, M, m='Shoes', sole='Shoe sole'):
    out = []
    for S in 'LR':
        for p in foot_last(b, S, M[m], M[sole], width=0.04, height=0.048, sole=0.008, chunky=0.92, collar=0.085, collar_r=0.033,
                           name='flat'):
            out.append((p, 'foot'))
    return out


def shoes_boots(b, M, m='Shoes', sole='Shoe sole', top=None):
    out = []
    for S in 'LR':
        for p in foot_last(b, S, M[m], M[sole], width=0.044, height=0.07, sole=0.018, chunky=1.0, collar=0.11, collar_r=0.036,
                           heel=0.0, name='boot'):
            out.append((p, 'foot'))
        # the shaft up the calf
        ank, knee = getattr(b, 'ank_' + S), getattr(b, 'knee_' + S)
        top = knee.z - 0.125 if top is None else top
        mb = MB('shaft')
        pts = [ank + V((0, 0.004, -0.02)), ank.lerp(knee, 0.4), ank.lerp(knee, (top - ank.z) / (knee.z - ank.z))]
        sweep(mb, pts, M[m], rfn=lambda t: interp([(0, 0.044), (0.5, 0.058), (1, 0.06)], t), n=20, cap0=None, cap1=None)
        c = pts[-1]
        ro = ring(c, V((1, 0, 0)), V((0, 1, 0)), 0.06, 0.06, 20)
        ri = [c + (q - c) * 0.86 + V((0, 0, -0.015)) for q in ro]
        mb.loft([ro, ri], M[m], [c, c + V((0, 0, -0.015))])
        out.append((weigh(mb.build('shaft', angle=60), G.leg_w(b, S)), 'leg_' + S))
    return out


def bottom_skirt_long(b, M, m='Bottom', trim='Bottom trim', legwear='Legwear', hem=None, n=56):
    """A long A-line skirt to the ankle: a waistband, soft folds that deepen toward the hem, enough flare for a full
    stride; tights under it."""
    mb_, mt = M[m], M[trim]
    out = []
    zz = Z(b)
    zw = zz['waist']
    hem = zz['ank'] + 0.058 if hem is None else hem
    keys = []
    for z in dense(hem, zw, 16):
        a_, bf, bb = G.torso_at(b, max(z, zz['crotch'] + 0.02))
        fl = 0.115 * sstep(zw - 0.015, hem, z) ** 0.6          # (out from the hips at once: room for a striding thigh)
        keys.append((z, a_ + 0.013 + fl, bf + 0.013 + fl * 0.95, bb + 0.013 + fl * 0.95))
    zs = dense(hem, zw, 24)
    rings, cs = torso_rings(keys, n, zs, e=2.3, fn=soft_folds(0.055, 10, zw - 0.07, hem))
    sk = MB('skirt')
    inner = [[cs[0] + (p - cs[0]) * 0.96 + V((0, 0, 0.03)) for p in rings[0]]]
    sk.loft(inner + rings, mb_, [cs[0] + V((0, 0, 0.03))] + cs)
    out.append((weigh(sk.build('skirt', angle=50), G.skirt_weights(b, top=b.hip_z + 0.1, follow=0.92, shins=True)), 'drape'))
    a_, bf, bb = G.torso_at(b, zw - 0.012)
    out.append((weigh(ring_band((0, 0.002, zw - 0.012), a_ + 0.014, (bf + bb) / 2 + 0.013, 0.011, mt, 40, 'waistband', squash=0.55,
                                sides=8, e=2.3), G.top_weights(b)), 'torso'))
    out.append((G.pelvis(b, M[legwear], zw - 0.05, zz['crotch'], off=0.002), 'torso'))
    out += legs(b, M, legwear)
    return out


def top_coat(b, M, m='Top', trim='Top trim', inner='Inner', hem=None, n=48):
    """A long coat to the knee over a fitted top: closed to the waist with a row of buttons, opening below into two
    fronts; a turned-down collar, long sleeves with trimmed cuffs."""
    zz = Z(b)
    hem = zz['knee'] + 0.035 if hem is None else hem
    out = top_inner(b, M, inner, sleeve=None, collar=True)
    mt, mtr = M[m], M[trim]
    zt = G.TORSO[b.kind][-1][0] - 0.016
    z0 = zz['hip'] + 0.06

    def flare(z):
        return 0.004 + 0.095 * sstep(z0, hem, z) ** 0.85
    # upper coat (closed): waist to collar
    up = shell(b, mt, z0, zt, off=0.02, n=n, flare=flare, name='coat', fn=lambda z, ang: 1 + 0.005 * math.sin(ang * 5))
    out.append((weigh(up, G.top_weights(b, collar=b.neck_z + 0.01)), 'torso'))
    # coat skirt (open front): from the waist to the hem
    sk = shell(b, mt, hem, z0 + 0.01, off=0.026, n=n, flare=flare, front_gap=13, name='coatskirt', front=1.2,
               fn=soft_folds(0.03, 7, z0 - 0.02, hem))
    out.append((weigh(sk, G.skirt_weights(b, top=b.hip_z + 0.1, follow=0.95, shins=True)), 'drape'))
    surf = Surface([up])
    # buttons down the front and a belt
    bt = MB('buttons')
    for z in dense(zz['chest'] + 0.06, zz['waist'] - 0.05, 4):
        loc, nrm = surf.nearest(V((0.0, -0.3, z)))
        ellipsoid(bt, loc + nrm * 0.006, (0.009, 0.009, 0.009), mtr, 8, 6)
    out.append((weigh(bt.build('buttons', angle=60), G.top_weights(b)), 'torso'))
    zb = zz['waist'] - 0.015
    a_, bf, bb = G.torso_at(b, zb)
    out.append((weigh(ring_band((0, 0.003, zb), a_ + 0.026, (bf + bb) / 2 + 0.024, 0.012, mtr, 40, 'belt', squash=0.5, sides=8, e=2.3),
                      G.top_weights(b)), 'torso'))
    # turned-down collar: a band round the neck line
    cz = zt - 0.01
    a_, bf, bb = G.torso_at(b, cz)
    out.append((weigh(ring_band((0, 0.004, cz - 0.008), a_ + 0.03, (bf + bb) / 2 + 0.027, 0.012, mt, 32, 'collar', squash=0.45, sides=8,
                                tilt=Matrix.Rotation(math.radians(-6), 3, 'X')), G.top_weights(b, collar=b.neck_z + 0.01)), 'torso'))
    for S in 'LR':
        for p in G.arm(b, S, mt, M['skin'], sleeve=1.0, prof=[(0, 0.053), (0.3, 0.05), (0.55, 0.047), (0.85, 0.045), (1, 0.048)],
                       cuff=0.03, m_cuff=mtr, puff=0.002, fold=0.035):
            out.append((p, 'arm_' + S))
    return out


def hat_cap(b, hd, M, m='Hat', trim='Hat trim', tilt=0.0):
    """A soft baseball cap over the hair: a six-panel crown, a curved peak, a button on top."""
    from npcs import cap_crown, brim
    band_el = lambda az: interp([(0, 26), (90, 16), (180, 4)], abs(((az + 180) % 360) - 180))
    crown, band, c0 = cap_crown(hd, M[m], band_el, [(0.016, 1.02), (0.036, 0.98), (0.054, 0.86), (0.066, 0.62), (0.071, 0.28)], off=0.032,
                                seg=32, name='crown', tilt=tilt)
    out = [(weigh(crown, 'head'), 'head')]
    out.append((weigh(brim(band, c0, M[trim], front_az=0, span=150, depth=0.075, thick=0.01, droop=0.012, name='peak'), 'head'), 'head'))
    bm = MB('button')
    top = c0 + V((0, 0.0, 0.071 + 0.004))
    ellipsoid(bm, top, (0.012, 0.012, 0.007), M[trim], 10, 6)
    out.append((weigh(bm.build('button'), 'head'), 'head'))
    return out


def panel(b, m, a0, a1, z_top, hem, off=0.012, flare=0.07, folds=0.03, rows=26, cols=22, name='panel'):
    """A hanging cloth panel (an ao dai's front or back) round the body between angles a0..a1 (radians, 0 = her left, the
    front is -pi/2), from z_top to hem: it follows the hips, then falls in a soft A-line with folds. A sheet with
    thickness, closed at every edge."""
    zz = Z(b)
    outer, inner, cs = [], [], []
    for z in dense(hem, z_top, rows):
        a_, bf, bb = G.torso_at(b, max(z, zz['crotch'] + 0.03))
        t = sstep(zz['hip'] + 0.02, hem, z)
        fl = flare * t ** 0.9 + (off - 0.008) * sstep(z_top, zz['hip'] - 0.01, z) - (off - 0.008)
        c = V((0, 0, z))
        ro, ri = [], []
        for j in range(cols):
            ang = a0 + (a1 - a0) * j / (cols - 1)
            ca, sa = math.cos(ang), math.sin(ang)
            ry = bb if sa >= 0 else bf
            f = 1 + folds * t * (math.sin(ang * 9 + 0.6) * 0.7 + 0.3 * math.sin(ang * 17 + 1.1))
            r = V((ca * (a_ + off + fl), sa * (ry + off + fl * 0.9), 0)) * f
            ro.append(c + r)
            ri.append(c + r * (1 - 0.006 / max(r.length, 0.05)))
        outer.append(ro)
        inner.append(ri)
        cs.append(c)
    mb = MB(name)
    thick_rows(mb, outer, inner, m, cs)
    return mb.build(name, angle=45)


def top_aodai(b, M, m='Top', trim='Top trim', hem=None, n=48, motif=True):
    """The ao dai: a fitted tunic with a standing mandarin collar, a diagonal closure to the right arm, long slim raglan
    sleeves, and below the waist two long panels (front and back) with high side slits over the wide trousers."""
    zz = Z(b)
    hem = zz['knee'] - 0.17 if hem is None else hem
    mt, mtr = M[m], M[trim]
    out = []
    zt = G.TORSO[b.kind][-1][0] - 0.006
    z_slit = zz['waist'] + 0.005
    bod = shell(b, mt, z_slit - 0.03, zt, off=0.006, n=n, name='bodice', fn=soft_folds(0.006, 9))
    out.append((weigh(bod, G.top_weights(b, collar=b.neck_z + 0.02)), 'torso'))
    surf = Surface([bod])
    # the mandarin collar: a short standing band round the neck
    c = b.head_c
    r = (0.04 if b.kind == 'f' else 0.047)
    cm = MB('collar')
    zc0 = zt - 0.012
    sweep(cm, [V((0, 0.012, zc0)), V((0, 0.011, zc0 + 0.02)), V((0, 0.01, zc0 + 0.034))], mt,
          rfn=lambda t: (r * (1.42 - 0.3 * t), r * (1.3 - 0.28 * t)), n=28, cap0=None, cap1=None)
    ro = ring(V((0, 0.01, zc0 + 0.034)), V((1, 0, 0)), V((0, 1, 0)), r * 1.12, r * 1.02, 28, a0=-math.pi / 2)
    ri = [p + (V((0, 0.01, zc0 + 0.034)) - p) * 0.12 + V((0, 0, -0.006)) for p in ro]
    cm.loft([ro, ri], mtr, [V((0, 0.01, zc0 + 0.034)), V((0, 0.01, zc0 + 0.028))])
    cw = lambda co: blend2('chest', 'neck', (co.z - (b.neck_z - 0.005)) / 0.03)
    out.append((weigh(cm.build('collar', angle=60), cw), 'torso'))
    # the diagonal closure from the collar to under the right arm, with three small buttons
    a_, bf, bb = G.torso_at(b, b.chest_z + 0.08)
    pts = [V((-0.01, -0.3, zc0 - 0.004)), V((-0.04, -0.3, zt - 0.05)), V((-0.08, -0.3, b.chest_z + 0.08)), V((-a_ * 0.92, -0.06, b.chest_z + 0.02))]
    out.append((weigh(surface_strip(surf, pts, mtr, 0.011, 0.003, off=0.0015, name='closure', out_ref=(0, 0.02, b.chest_z), samples=20),
                      G.top_weights(b)), 'torso'))
    bt = MB('buttons')
    for q in (pts[1], pts[2], pts[3].lerp(pts[2], 0.4)):
        loc, nrm = surf.nearest(q)
        ellipsoid(bt, loc + nrm * 0.004, (0.006, 0.006, 0.006), mtr, 8, 6)
    out.append((weigh(bt.build('buttons'), G.top_weights(b)), 'torso'))
    # the two long panels, split at the sides from the waist
    sw = G.skirt_weights(b, top=b.hip_z + 0.13, follow=0.97, shins=True)
    half = math.radians(64)
    for nm, mid in (('front', -math.pi / 2), ('back', math.pi / 2)):
        pn = panel(b, mt, mid - half, mid + half, z_slit + 0.012, hem, off=0.028, flare=0.075, name='panel_' + nm)
        out.append((weigh(pn, sw), 'drape'))
        psurf = Surface([pn])
        # a gold band along the hem
        a_, bf, bb = G.torso_at(b, hem + 0.02)
        hp = []
        for j in range(19):
            ang = mid - half * 0.97 + 2 * half * 0.97 * j / 18
            ry = bb if math.sin(ang) >= 0 else bf
            hp.append(V((math.cos(ang) * (a_ + 0.2), math.sin(ang) * (ry + 0.2), hem + 0.022)))
        out.append((weigh(surface_strip(psurf, hp, mtr, 0.018, 0.0025, off=0.0012, name='hemtrim', out_ref=(0, 0, hem + 0.2), samples=40),
                          sw), 'drape'))
        if motif and nm == 'front':
            mm = MB('lotus')
            d = Decal(psurf, V((0.02, 0, hem + 0.16)), V((0, -1, 0)))
            s_ = 2.4
            for k in range(5):
                ang = math.radians(-64 + 32 * k)
                ln = 1.0 if k == 2 else 0.86 if k in (1, 3) else 0.7
                pts2 = ellipse_pts(math.sin(ang) * 0.011 * s_ * ln, math.cos(ang) * 0.011 * s_ * ln, 0.0055 * s_, 0.012 * s_ * ln, 14,
                                   rot=-math.degrees(ang))
                try:
                    d.fill(mm, pts2, mtr, lift=0.0014, rings=1)
                except Exception:
                    pass
            for sx in (1, -1):
                try:
                    d.fill(mm, ellipse_pts(sx * 0.03 * s_ * 0.5, -0.016, 0.026, 0.008, 14, rot=sx * 12), mtr, lift=0.0012, rings=1)
                except Exception:
                    pass
            if mm.F:
                out.append((weigh(mm.build('lotus', angle=60), sw), 'drape'))
    for S in 'LR':
        for p in G.arm(b, S, mt, M['skin'], sleeve=1.0, prof=[(0, 0.044), (0.3, 0.042), (0.55, 0.038), (0.85, 0.035), (1, 0.033)],
                       puff=0.0, fold=0.02):
            out.append((p, 'arm_' + S))
    return out
