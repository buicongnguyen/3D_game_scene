"""The keepsakes found in the rooms (build_interiors.py). Floating pickups centred on the origin (the runtime bobs
and spins them like every item), about 0.35 m across so they read from the follow camera, each <= 1.2k triangles.

keepsake-photo    the old festival photo: young Sora, Genzo, Ota and Hana in front of the Star Train (hand-tinted)
keepsake-recipe   Hana's festival peach-bun recipe card, floury, clipped with a clothes peg
keepsake-float    Ota and Genzo's two fishing floats, tied together with twine and a little tag
keepsake-ticket   Kobo's first ticket: a card ticket No. 0001 with its punched hole, and its torn stub
Painted details sit 6 mm proud of the surface under them.
"""
import math, random
from mathutils import Vector, Matrix
import arch_lib
from interior_lib import *  # noqa: F401,F403

V = Vector
BUILD = {}


def builder(name):
    def deco(fn):
        BUILD[name] = fn
        return fn
    return deco


def item(name):
    return Room(name, 1, 1, 1, 1)


def finish_item(R, rays=40, dist=.08, strength=.5):
    return R.finish_room(ao_distance=dist, ao_strength=strength, rays=rays)


def star_pts(c, R_, r_, n=5, rot=math.pi / 2):
    return [(c[0] + math.cos(rot + math.pi * i / n) * (R_ if i % 2 == 0 else r_),
             c[1] + math.sin(rot + math.pi * i / n) * (R_ if i % 2 == 0 else r_)) for i in range(2 * n)]


def disc_on(R, face, u, z, d, r, col, key='P', n=10, tag='disc'):
    R.B(key).append(bm_cyl(r, .004, n), arch_lib.xform(face.p(u, z, d), (math.pi / 2, 0, face.rot)), R.t(key, col),
                    smooth=0, tag=tag)


def figure(R, face, u, z, d, h, body, head='#f0c8a0', hat=None, hair=None, wide=1.0):
    """A little hand-tinted figure on the photo: body, hair, head, optional cap or headscarf (6 mm layers)."""
    face.box(R.B('P'), u, z + h * .32, d, h * .36 * wide, h * .64, .004, tint=R.t('P', body), tag='photo people')
    if hair:
        disc_on(R, face, u, z + h * .84, d + .006, h * .16, hair, tag='photo people')
    disc_on(R, face, u, z + h * .8, d + .012, h * .145, head, tag='photo people')
    if hat:
        face.box(R.B('P'), u, z + h * .93, d + .018, h * .34, h * .1, .004, tint=R.t('P', hat), tag='photo people')


@builder('keepsake-photo')
def build_photo():
    """A standing framed photo, 0.36 x 0.29 m: amber frame with a gold fillet, a brass star on top, an easel stand."""
    R = item('keepsake-photo')
    W_, H_, T_ = .36, .29, .035
    f = Face((-W_ / 2, -T_ / 2, -H_ / 2), (0, -1, 0))           # the front; u runs +X, z up, d toward the viewer
    fw = .045
    for (u, z, su, sz) in ((W_ / 2, H_ - fw / 2, W_, fw), (W_ / 2, fw / 2, W_, fw), (fw / 2, H_ / 2, fw, H_ - 2 * fw),
                           (W_ - fw / 2, H_ / 2, fw, H_ - 2 * fw)):
        f.box(R.B('W'), u, z, -T_ / 2, su, sz, T_, ch=.008, tint=R.t('W', '#b8742e'), tag='frame')
    for (u, z, su, sz) in ((W_ / 2, H_ - fw - .005, W_ - 2 * fw + .01, .01), (W_ / 2, fw + .005, W_ - 2 * fw + .01, .01),
                           (fw + .005, H_ / 2, .01, H_ - 2 * fw), (W_ - fw - .005, H_ / 2, .01, H_ - 2 * fw)):
        f.box(R.B('M'), u, z, .002, su, sz, .012, tint=R.t('M', '#e8b84a'), tag='fillet')
    f.box(R.B('P'), W_ / 2, H_ / 2, -T_ + .008, W_ - .02, H_ - .02, .01, tint=R.t('P', '#6b4027'), tag='backing')
    # the photo: sepia sky, the hills, the Star Train hung with lanterns, four friends in a row
    pu0, pu1, pz0, pz1 = fw + .01, W_ - fw - .01, fw + .01, H_ - fw - .01
    d = -.014
    f.box(R.B('P'), W_ / 2, (pz0 + pz1) / 2, d, pu1 - pu0, pz1 - pz0, .004, tint=R.t('P', '#ecd6a8'), tag='photo')
    d += .006
    f.box(R.B('P'), W_ / 2, pz0 + (pz1 - pz0) * .3, d, pu1 - pu0, (pz1 - pz0) * .22, .004, tint=R.t('P', '#b99a6a'),
          tag='photo')
    eu = pu0 + (pu1 - pu0) * .34
    tz = pz0 + .092
    f.box(R.B('P'), eu, tz, d + .006, .1, .045, .004, tint=R.t('P', '#c8453a'), tag='photo train')
    f.box(R.B('P'), eu + .035, tz + .03, d + .012, .03, .04, .004, tint=R.t('P', '#4a3024'), tag='photo train')
    f.box(R.B('P'), eu - .035, tz + .03, d + .012, .015, .03, .004, tint=R.t('P', '#4a3024'), tag='photo train')
    f.box(R.B('P'), eu + .115, tz + .005, d + .006, .1, .05, .004, tint=R.t('P', '#d9c08a'), tag='photo train')
    f.box(R.B('P'), W_ / 2, pz1 - .024, d + .006, pu1 - pu0, .003, .004, tint=R.t('P', '#6a4a30'), tag='photo lanterns')
    for k in range(9):
        uu = pu0 + .012 + k * (pu1 - pu0 - .024) / 8
        zz = pz1 - .03 - .012 * math.sin(math.pi * k / 8)
        f.box(R.B('K'), uu, zz, d + .012, .012, .015, .004, tint=R.t('K', ['#ff8a3a', '#ffd35a', '#e8412c'][k % 3]),
              tag='photo lanterns')
    base = pz0 + .004
    d2 = d + .018
    figure(R, f, pu0 + .045, base, d2, .105, '#3a4a6a', hat='#2d3a5a', wide=1.35)        # Genzo
    figure(R, f, pu0 + .1, base, d2, .088, '#2f6f7a', hair='#3a2418')                    # young Sora
    figure(R, f, pu0 + .155, base, d2, .095, '#7a4a2c', hair='#efe6d6')                  # Ota
    figure(R, f, pu0 + .212, base, d2, .09, '#c86a7a', hat='#e0567a')                    # Hana
    f.box(R.B('K'), pu0 + .122, base + .03, d2 + .018, .014, .02, .004, tint=R.t('K', '#e8412c'), tag='photo lantern')
    R.extrude('K', star_pts((0, 0), .034, .015), .012, (0, -T_ / 2 - .006, H_ / 2 - .005), '#f2b62e', tag='star')
    f.box(R.B('M'), W_ / 2, fw / 2, .006, .1, .022, .006, tint=R.t('M', '#e8b84a'), tag='plate')
    R.beam('W', (0, T_ / 2 - .01, H_ * .1), (0, T_ / 2 + .11, -H_ / 2 + .005), .03, .014, '#8a5a32', ch=.004, tag='stand')
    return finish_item(R)


@builder('keepsake-recipe')
def build_recipe():
    """Hana's recipe card, 0.34 x 0.24 m, gently curled, rose border, a drawn peach bun, handwriting, a floury
    thumbprint, one dog-eared corner, and a wooden clothes peg on top."""
    R = item('keepsake-recipe')
    W_, H_ = .34, .24
    n = 8
    bend = lambda s: .018 * math.sin(math.pi * s / W_) ** 2     # the card curls back towards its middle
    cols = [-W_ / 2 + W_ * i / n for i in range(n + 1)]
    mb = R.B('P')

    def P(u, z, d=0.0):
        return V((u, bend(u + W_ / 2) + d, z))
    for a, b in zip(cols, cols[1:]):
        mb.poly([P(a, -H_ / 2, -.003), P(b, -H_ / 2, -.003), P(b, H_ / 2, -.003), P(a, H_ / 2, -.003)],
                tint=R.t('P', '#f8ecd2'), normal=(0, -1, 0), tag='card')
        mb.poly([P(a, H_ / 2, .003), P(b, H_ / 2, .003), P(b, -H_ / 2, .003), P(a, -H_ / 2, .003)],
                tint=R.t('P', '#eadcbc'), normal=(0, 1, 0), tag='card')
        for z in (-H_ / 2, H_ / 2):
            mb.poly([P(a, z, -.003), P(b, z, -.003), P(b, z, .003), P(a, z, .003)], tint=R.t('P', '#e0d0b0'),
                    normal=(0, 0, 1 if z > 0 else -1), tag='card')
    for u in (-W_ / 2, W_ / 2):
        mb.poly([P(u, -H_ / 2, -.003), P(u, H_ / 2, -.003), P(u, H_ / 2, .003), P(u, -H_ / 2, .003)],
                tint=R.t('P', '#e0d0b0'), normal=(1 if u > 0 else -1, 0, 0), tag='card')

    def strip(u0, u1, z0, z1, col, d=-.009, tag='ink'):
        k = max(1, int((u1 - u0) / .045))
        us = [u0 + (u1 - u0) * i / k for i in range(k + 1)]
        for a, b in zip(us, us[1:]):
            mb.poly([P(a, z0, d), P(b, z0, d), P(b, z1, d), P(a, z1, d)], tint=R.t('P', col), normal=(0, -1, 0), tag=tag)
    bw, e = .014, .008
    strip(-W_ / 2 + e, W_ / 2 - e, H_ / 2 - e - bw, H_ / 2 - e, '#e0567a', tag='border')
    strip(-W_ / 2 + e, W_ / 2 - e, -H_ / 2 + e, -H_ / 2 + e + bw, '#e0567a', tag='border')
    strip(-W_ / 2 + e, -W_ / 2 + e + bw, -H_ / 2 + e + bw, H_ / 2 - e - bw, '#e0567a', tag='border')
    strip(W_ / 2 - e - bw, W_ / 2 - e, -H_ / 2 + e + bw, H_ / 2 - e - bw, '#e0567a', tag='border')
    strip(-.05, .13, H_ / 2 - .055, H_ / 2 - .035, '#8a3a2a', tag='title')
    # the drawn peach bun: cream round, rosy blush, a leaf
    bc = (-.095, .035)
    for k, (r, col, dd) in enumerate(((.046, '#f6d7b0', -.009), (.024, '#f58aa8', -.015))):
        mb.poly([P(bc[0] + math.cos(TAU * i / 12) * r, bc[1] + math.sin(TAU * i / 12) * r * .85 + (.01 if k else 0), dd)
                 for i in range(12)], tint=R.t('P', col), normal=(0, -1, 0), tag='drawing')
    mb.poly([P(bc[0] + .03, bc[1] + .03, -.015), P(bc[0] + .065, bc[1] + .05, -.015), P(bc[0] + .035, bc[1] + .058, -.015)],
            tint=R.t('P', '#5a9a3a'), normal=(0, -1, 0), tag='drawing')
    rng = random.Random(4)
    for r in range(5):
        z = .035 - r * .03
        u = -.03 if r < 2 else -.14
        while u < .14:
            L = rng.uniform(.02, .05)
            strip(u, min(u + L, .145), z, z + .006, '#5a3a2a', tag='ink')
            u += L + rng.uniform(.008, .015)
    mb.poly([P(.1 + math.cos(TAU * i / 10) * .022, -.078 + math.sin(TAU * i / 10) * .028, -.015) for i in range(10)],
            tint=R.t('P', '#fffaf0'), normal=(0, -1, 0), tag='flour')
    c = V((W_ / 2, 0, -H_ / 2))
    mb.poly([c + V((-.055, -.009, 0)), c + V((0, -.009, .055)), c + V((-.042, -.026, .042))], tint=R.t('P', '#e0d0b0'),
            normal=(0, -1, 0), tag='corner')
    pg = V((.02, bend(W_ / 2 + .02), H_ / 2 - .01))
    for s in (-1, 1):
        R.box('W', pg + V((0, s * .012, 0)), (.024, .012, .11), '#d9a468', ch=.004, tag='peg')
    R.box('M', pg + V((0, 0, .02)), (.028, .036, .012), '#c9ccd2', ch=.003, tag='peg')
    return finish_item(R, dist=.06)


@builder('keepsake-float')
def build_float():
    """Two old wooden fishing floats, 0.38 m tall, red and teal caps over cream bodies, leaning together and tied
    with twine; a little wooden tag with two carved stars hangs from the knot."""
    R = item('keepsake-float')
    prof = [(0, -.19), (.012, -.185), (.03, -.15), (.055, -.08), (.07, -.01), (.068, .04), (.05, .09), (.028, .13),
            (.012, .15), (0, .155)]

    def one(c, tilt, cap, band):
        c = V(c)
        ax = V((math.sin(tilt), 0, math.cos(tilt)))
        R.lathe('K', prof, c, lambda cc, nn: R.t('K', cap if (cc - c).dot(ax) > .012 else '#f4ead2'), n=14,
                rot=(0, tilt, 0), tag='floats', smooth=60)
        R.torus('K', c + ax * .012, .071, .007, band, maj=14, mn=4, rot=(0, tilt, 0), tag='floats')
        R.rod('W', c + ax * .15, c + ax * .3, .007, '#d9c060', n=5, r2=.004, tag='quills')
        R.torus('M', c - ax * .205, .013, .004, '#d9a441', maj=8, mn=3, rot=(math.pi / 2, tilt, 0), tag='eyes')
    one((-.045, 0, 0), -.2, '#d8342c', '#2a8f9a')
    one((.045, 0, 0), .2, '#2a8f9a', '#e0a93a')
    R.torus('P', (0, 0, .0), .1, .007, '#c9a062', maj=14, mn=4, tag='twine')
    R.torus('P', (0, 0, .022), .096, .006, '#c9a062', maj=14, mn=4, tag='twine')
    R.sphere('P', (0, -.098, .012), .016, '#b8904a', seg=6, rings=4, tag='twine')
    R.rod('P', (0, -.102, .006), (.022, -.11, -.075), .004, '#c9a062', n=3, tag='twine')
    tg = V((.026, -.114, -.105))
    R.box('W', tg, (.052, .008, .066), '#c98f55', ch=.003, rot=(0, .15, 0), tag='tag')
    for dz in (.013, -.014):
        R.extrude('W', star_pts((0, 0), .01, .0045), .004, tg + V((0, -.007, dz)), '#6b4027', rot=(0, .15, 0), tag='tag')
    return finish_item(R, dist=.05)


@builder('keepsake-ticket')
def build_ticket():
    """Kobo's first ticket: a card ticket 0.3 x 0.18 m, pale green with a red band, printed lines, a gold star and
    "No. 0001", its punched hole, and the torn stub tucked behind it at an angle."""
    R = item('keepsake-ticket')
    T_ = .012

    def card(c, w, h, rot, col, band, punch=True, stub=False, seed=0):
        c = V(c)
        Rm = Matrix.Rotation(rot, 3, 'Y')
        nrm = Rm @ V((0, -1, 0))

        def P(x, z, d=0.0):
            return c + Rm @ V((x, -T_ / 2 - d, z))
        R.box('P', c, (w, T_, h), col, ch=.003, rot=(0, rot, 0), tag='card')
        R.B('P').poly([P(-w * .1, -h / 2 + .006, .006), P(w * .12, -h / 2 + .006, .006), P(w * .02, h / 2 - .006, .006),
                       P(-w * .2, h / 2 - .006, .006)], tint=R.t('P', band), normal=nrm, tag='band')
        rng = random.Random(seed)
        for r in range(4):
            z = h / 2 - .035 - r * .03
            x = -w / 2 + .02
            while x < w / 2 - .04:
                L_ = rng.uniform(.02, .05)
                x1 = min(x + L_, w / 2 - .02)
                if x1 < -w * .22 or x > w * .14:
                    R.B('P').poly([P(x, z, .012), P(x1, z, .012), P(x1, z + .008, .012), P(x, z + .008, .012)],
                                  tint=R.t('P', '#2a3a30'), normal=nrm, tag='print')
                x += L_ + .012
        if not stub:
            R.B('K').poly([P(w * .3 + x_, -h * .2 + z_, .018) for x_, z_ in star_pts((0, 0), .03, .013)],
                          tint=R.t('K', '#f2b62e'), normal=nrm, tag='star')
            for k in range(4):
                x0 = -w * .42 + k * .026
                R.B('P').poly([P(x0, -h / 2 + .022, .012), P(x0 + .018, -h / 2 + .022, .012), P(x0 + .018, -h / 2 + .052, .012),
                               P(x0, -h / 2 + .052, .012)], tint=R.t('P', '#c8322a' if k == 3 else '#2a3a30'), normal=nrm,
                              tag='number')
        if punch:
            R.cyl('P', P(w * .38, h * .3, -T_ / 2), .014, T_ + .01, '#1d2430', n=10, rot=(math.pi / 2, 0, 0), tag='punch')
    card((0, 0, 0), .3, .18, .12, '#cfe6c0', '#d8342c', seed=1)
    card((.1, .03, .05), .12, .16, -.35, '#e6f0d8', '#d8342c', punch=False, stub=True, seed=2)
    return finish_item(R, dist=.05)
