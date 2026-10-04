"""Shared helpers for the two Kawabe riverside homes (interior_kawabe_a / interior_kawabe_b).

Everything here only builds on interior_lib / interior_rooms. The decor variants are pivot groups `Var_1..Var_3`
(empty children of the scene root holding meshes only): `group(R, 'Var_2')` makes every R.box / cushion / plant call
inside the `with` block land in that group, so the toolkit helpers work unchanged for variants.
"""
import math, random
from contextlib import contextmanager
from mathutils import Vector
import arch_lib
from interior_lib import *  # noqa: F401,F403
from interior_rooms import IRON, BRASS, DARKW, POST

V = Vector


@contextmanager
def group(R, name):
    """Route every R.B(...) call without an explicit group into pivot group `name`."""
    base = R.B
    R.B = lambda key, group=None: base(key, name if group is None else group)
    try:
        yield
    finally:
        del R.B


@contextmanager
def lean_boxes():
    """Triangle diet while a Kawabe room builds: no chamfer on thin boxes, at most a 2 cm chamfer elsewhere, one segment
    per box, and low-poly spheres, cylinders, lathes, tori and rods (a chamfered box is 44 triangles, a plain one 12).
    Everything is restored afterwards so other rooms are unaffected."""
    MB = arch_lib.MB
    orig = {k: getattr(MB, k) for k in ('box', 'sphere', 'cyl', 'lathe', 'torus', 'rod')}

    def box(self, c, size, rot=None, ch=0., seg=1, tint=None, taper=None, tag='box', smooth=50, front=False):
        ch = 0. if min(size) < .09 else min(ch, .02)
        return orig['box'](self, c, size, rot=rot, ch=ch, seg=1, tint=tint, taper=taper, tag=tag, smooth=smooth,
                           front=front)

    def sphere(self, c, r, seg=10, rings=6, **kw):
        return orig['sphere'](self, c, r, seg=min(seg, 5), rings=min(rings, 3), **kw)

    def cyl(self, c, r, h, n=12, ch=0., seg=1, **kw):
        return orig['cyl'](self, c, r, h, n=min(n, 8) if r < .2 else min(n, 12), ch=0. if r < .12 else min(ch, .012), seg=1, **kw)

    def lathe(self, profile, c=(0, 0, 0), n=16, **kw):
        return orig['lathe'](self, profile, c, n=min(n, 8), **kw)

    def torus(self, c, R, r, maj=12, mn=6, **kw):
        return orig['torus'](self, c, R, r, maj=min(maj, 8), mn=min(mn, 3), **kw)

    def rod(self, a, b, r, n=8, **kw):
        return orig['rod'](self, a, b, r, n=min(n, 4), **kw)
    for k, f in (('box', box), ('sphere', sphere), ('cyl', cyl), ('lathe', lathe), ('torus', torus), ('rod', rod)):
        setattr(MB, k, f)
    try:
        yield
    finally:
        for k, f in orig.items():
            setattr(MB, k, f)


def make_variants(R):
    for n in ('Var_1', 'Var_2', 'Var_3'):
        R.pivot(n, V((0, 0, 0)))


def yaw_to(a, b):
    """Blender rotation_euler.z that turns a node's three.js +Z (Blender -Y) toward b as seen from a."""
    return math.atan2(b[0] - a[0], -(b[1] - a[1]))


def spot(R, name, loc, look_at):
    n = R.node(name, loc)
    n.rotation_euler = (0, 0, yaw_to(loc, look_at))
    return n


def ell(R, key, c, radii, col, rot=(0, 0, 0), seg=5, rings=3, tag='ell'):
    """Low-poly ellipsoid (fish, plush, loaves)."""
    R.B(key).append(bm_sphere(radii, seg, rings), arch_lib.xform(V(c), rot), R.t(key, col), smooth=80, tag=tag)


# ---------------------------------------------------------------- cute small props

def plush_bear(R, c, s=1.0, col='#c98a52', rot=0.0, sit=True):
    c = V(c)
    ell(R, 'P', c + V((0, 0, .09 * s)), (.075 * s, .07 * s, .09 * s), col, rot=(0, 0, rot), tag='plush')
    ell(R, 'P', c + V((0, 0, .21 * s)), (.06 * s, .055 * s, .055 * s), col, rot=(0, 0, rot), tag='plush')
    for sx in (-1, 1):
        R.box('P', c + V((sx * .045 * s, 0, .262 * s)), (.03 * s, .03 * s, .03 * s), shade(col, .85), ch=0, tag='plush')


def plush_cat(R, c, col='#e8e0d0', rot=0.0, s=1.0):
    """A curled-up sleeping cat."""
    c = V(c)
    ell(R, 'P', c + V((0, 0, .07 * s)), (.17 * s, .12 * s, .07 * s), col, rot=(0, 0, rot), tag='cat')
    d = V((math.cos(rot), math.sin(rot), 0))
    ell(R, 'P', c + d * .13 * s + V((0, 0, .09 * s)), (.065 * s, .06 * s, .055 * s), col, rot=(0, 0, rot), tag='cat')
    for sy in (-1, 1):
        R.box('P', c + d * .13 * s + V((0, 0, .15 * s)) + V((-d.y * sy * .04 * s, d.x * sy * .04 * s, 0)),
              (.025 * s, .025 * s, .035 * s), shade(col, .8), ch=0, tag='cat')
    R.box('P', c - d * .16 * s + V((0, 0, .05 * s)), (.12 * s, .03 * s, .03 * s), shade(col, .85), ch=0,
          rot=(0, 0, rot + .6), tag='cat')


def blocks(R, c, rng, n=6, z=0.0, palette=('#d8342c', '#e0a93a', '#2d78c8', '#3f9a4a', '#e8e0d0')):
    """Little toy letter blocks, stacked at random."""
    c = V(c)
    for i in range(n):
        s = .07
        x = (i % 3) * .085 + rng.uniform(-.01, .01)
        y = (i // 3) * .09 + rng.uniform(-.01, .01)
        lvl = 1 if i == n - 1 and n > 3 else 0
        R.box('K', c + V((x, y, z + s / 2 + lvl * s)), (s, s, s), rng.choice(palette), ch=.008,
              rot=(0, 0, rng.uniform(-.4, .4)), tag='blocks')


def toy_train(R, c, rot=0.0, cols=('#d8342c', '#e0a93a', '#2d78c8')):
    c = V(c)
    L = Loc(c, rot)
    for i, col in enumerate(cols):
        R.box('K', L.p(i * .13, 0, .04), (.11, .06, .05), col, ch=0, rot=L.rz, tag='toy train')
        R.box('M', L.p(i * .13, 0, .012), (.1, .07, .02), '#30343e', ch=0, rot=L.rz, tag='toy train')
    R.box('K', L.p(-.02, 0, .085), (.05, .06, .05), cols[0], ch=0, rot=L.rz, tag='toy train')
    R.box('K', L.p(.0, 0, .12), (.03, .03, .05), '#30343e', ch=0, rot=L.rz, tag='toy train')


def onigiri(R, c, rot=0.0):
    R.cyl('P', V(c) + V((0, 0, .02)), .04, .035, '#f8f4ea', n=3, rot=(0, 0, rot), ch=.006, tag='onigiri')
    R.box('K', V(c) + V((0, 0, .02)), (.03, .082, .02), '#1e2a24', ch=0, rot=(0, 0, rot + .3), tag='onigiri')


def plate(R, c, r=.09, col='#f4efe2', rim=None):
    R.cyl('K', V(c) + V((0, 0, .008)), r, .016, rim or col, n=10, tag='plate')
    if rim:
        R.cyl('K', V(c) + V((0, 0, .0175)), r * .8, .003, col, n=10, tag='plate')


def bowl(R, c, r=.06, col='#2f4c86', fill=None):
    c = V(c)
    R.lathe('K', [(0, 0), (r * .5, 0), (r, r * .95), (r * .55, r * .1), (0, .008)], c, col, n=8,
            tag='bowl')
    if fill:
        R.cyl('K', c + V((0, 0, r * .66)), r * .86, .012, fill, n=8, tag='bowl')


def tokkuri(R, c, col='#e8e0d0', band='#2f4c86'):
    c = V(c)
    R.lathe('K', [(0, 0), (.03, 0), (.04, .05), (.03, .1), (.014, .13), (.016, .16), (0, .16)], c, col, n=9,
            tag='sake')
    R.cyl('K', c + V((0, 0, .06)), .041, .02, band, n=9, tag='sake')


def grilled_fish(R, c, rot=0.0, col='#c98a4a', L=.2):
    c = V(c)
    ell(R, 'K', c + V((0, 0, .025)), (L / 2, L * .16, .025), col, rot=(0, 0, rot), seg=7, rings=3, tag='fish')
    d = V((math.cos(rot), math.sin(rot), 0))
    R.box('K', c - d * (L * .54) + V((0, 0, .02)), (.05, .05, .01), shade(col, .8), ch=0, rot=(0, 0, rot + .78),
          tag='fish')


def dried_fish(R, c, L=.2, col='#cdd6dc', rot=0.0):
    """A small fish hanging head-up from `c` (the hanging point); the cord is part of the pole's string."""
    c = V(c)
    R.B('K').append(bm_sphere((.022, .012, L / 2), 5, 3), arch_lib.xform(c + V((0, 0, -.04 - L / 2)), (0, 0, rot)),
                    R.t('K', col), smooth=80, tag='fish')
    R.box('K', c + V((0, 0, -.04 - L - .012)), (.045, .006, .04), shade(col, .8), ch=0, rot=(0, 0, rot), tag='fish')


def float_ball(R, c, r=.04, col='#e8352c'):
    R.sphere('K', c, r, col, seg=5, rings=3, tag='floats')


def teapot_lean(R, c, col='#2f4c86', r=.07):
    c = V(c)
    R.lathe('K', [(0, 0), (r * .8, 0), (r, r * .6), (r * .6, r * 1.3), (0, r * 1.45)], c, col, n=8, tag='tea')
    R.rod('K', c + V((r * .85, 0, r * .6)), c + V((r * 1.6, 0, r * 1.15)), r * .15, col, n=4, tag='tea')


def tea_tray(R, c, rot=0.0, cols=('#2d4f8a', '#e8e0ce'), cups=2):
    """Tray with a teapot and cups; c is the table surface point."""
    c = V(c)
    L = Loc(c, rot)
    R.box('W', L.p(0, 0, .008), (.36, .24, .016), '#6b4027', ch=.005, rot=L.rz, tag='tray')
    teapot_lean(R, L.p(-.07, 0, .016), col=cols[0], r=.07)
    for k in range(cups):
        teacup(R, L.p(.07 + k * .008, -.06 + k * .11, .016), col=cols[1], r=.032)


def kettle(R, c, col='#2a2d36', r=.1):
    """Cast-iron kettle (tetsubin) with a swing handle."""
    c = V(c)
    R.lathe('M', [(0, 0), (r * .8, 0), (r, r * .5), (r * .9, r * 1.0), (r * .5, r * 1.15), (r * .34, r * 1.12),
                  (0, r * 1.2)], c, col, n=12, tag='kettle')
    R.rod('M', c + V((r * .85, 0, r * .45)), c + V((r * 1.55, 0, r * 1.05)), r * .15, col, n=5, r2=r * .08, tag='kettle')
    R.torus('M', c + V((0, 0, r * 1.1)), r * .9, .008, col, maj=12, mn=3, rot=(math.pi / 2, 0, 0), tag='kettle', arc=.5)
    R.sphere('M', c + V((0, 0, r * 1.22)), r * .12, '#d9a441', seg=5, rings=3, tag='kettle')


def hanger_cloth(R, top, kind, col, w=.34, h=.5, rot=0.0, col2=None):
    """Clothes hanging from a bamboo pole (top = the pole point). Thin double-sided boxes: cheap but readable."""
    t = V(top)
    L = Loc(t, rot)
    col2 = col2 or shade(col, .85)
    th = .014
    if kind == 'shirt':
        R.box('P', L.p(0, 0, -.06 - h * .38), (w * .6, th, h * .76), col, ch=.004, rot=L.rz, tag='laundry')
        for s in (-1, 1):
            R.box('P', L.p(s * w * .38, 0, -.07 - h * .1), (w * .26, th, h * .24), col2, ch=.004,
                  rot=(0, .5 * s, rot), tag='laundry')
    elif kind == 'towel':
        R.box('P', L.p(0, 0, -.03 - h / 2), (w, th, h), col, ch=.004, rot=L.rz, tag='laundry')
        R.box('P', L.p(0, -th, -.03 - h + .03), (w, th, .05), col2, ch=0, rot=L.rz, tag='laundry')
    elif kind == 'pants':
        for s in (-1, 1):
            R.box('P', L.p(s * w * .24, 0, -.05 - h * .45), (w * .42, th, h * .9), col, ch=.004, rot=L.rz,
                  tag='laundry')
        R.box('P', L.p(0, 0, -.1), (w * .9, th, .16), col2, ch=0, rot=L.rz, tag='laundry')
    elif kind == 'robe':
        R.box('P', L.p(0, 0, -.06 - h * .5), (w * .5, th, h), col, ch=.004, rot=L.rz, tag='laundry')
        for s in (-1, 1):
            R.box('P', L.p(s * w * .4, 0, -.12 - h * .17), (w * .3, th, h * .34), col2, ch=.004, rot=L.rz,
                  tag='laundry')
        R.box('K', L.p(0, -th, -.06 - h * .46), (w * .52, th, .06), '#d8342c' if col2 != '#c8322a' else '#2f4c86',
              ch=0, rot=L.rz, tag='laundry')
    elif kind == 'sock':
        for s in (-1, 1):
            R.box('P', L.p(s * .05, 0, -.04 - .06), (.05, th, .12), col, ch=.003, rot=L.rz, tag='laundry')
            R.box('P', L.p(s * .05 + s * .02, 0, -.04 - .14), (.07, th, .04), col2, ch=.003, rot=L.rz, tag='laundry')
    elif kind == 'sheet':
        R.box('P', L.p(0, 0, -.03 - h / 2), (w, th, h), col, ch=.004, rot=L.rz, tag='laundry')
        R.box('P', L.p(0, -th, -.03 - h + .08), (w, th, .05), col2, ch=0, rot=L.rz, tag='laundry')


def laundry_poles(R, x0, x1, y, z, ceil_z):
    """Two bamboo poles on cords from the ceiling beam (base room)."""
    for dy in (-.1, .1):
        R.rod('W', (x0, y + dy, z), (x1, y + dy, z), .02, '#c8c060', n=6, tag='laundry poles')
    for x in (x0 + .2, x1 - .2):
        for dy in (-.1, .1):
            R.rod('W', (x, y + dy, z), (x, y, ceil_z), .006, '#7a5a3a', n=3, tag='laundry cords')


def wall_net(R, face, u0, u1, z0, z1, d=.03, col='#8a7248', mesh=.16, floats=True, seed=1):
    """A fishing net draped on a wall: border ropes plus a grid of cords (thin rods), cork floats along the top."""
    rng = random.Random(seed)
    nu = max(2, int((u1 - u0) / mesh))
    nz = max(2, int((z1 - z0) / mesh))
    for i in range(nu + 1):
        u = u0 + (u1 - u0) * i / nu
        sag = .05 * math.sin(math.pi * i / nu)
        R.rod('W', face.p(u, z1 - sag, d), face.p(u + rng.uniform(-.01, .01), z0 + sag * 2 + (u - u0) * .0, d), .004,
              col, n=3, tag='net')
    for j in range(nz + 1):
        z = z1 - (z1 - z0) * j / nz
        R.rod('W', face.p(u0, z - .03 * math.sin(math.pi * j / nz), d + .004),
              face.p(u1, z - .03 * math.sin(math.pi * j / nz), d + .004), .004, col, n=3, tag='net')
    R.rod('W', face.p(u0 - .02, z1 + .01, d + .008), face.p(u1 + .02, z1 + .01, d + .008), .012, '#a88a52', n=5,
          tag='net rope')
    if floats:
        for i in range(0, nu + 1, 3):
            u = u0 + (u1 - u0) * i / nu
            p = face.p(u, z1 + .035, d + .02)
            float_ball(R, p, r=.032, col=['#e8352c', '#f4efe2', '#e0a93a'][i // 3 % 3])


def fish_rod(R, a, b, col='#9a7a3a', r=.012):
    R.rod('W', a, b, r, col, r2=r * .35, n=4, tag='rods')
    d = (V(b) - V(a))
    R.box('M', V(a) + d * .2, (.04, .04, .04), '#30343e', ch=0, tag='rods')


def book_stack(R, c, rng, n=4, palette=('#b8342c', '#2f4c86', '#2f8a6a', '#e0a93a', '#7a3a6a')):
    c = V(c)
    z = 0.0
    for i in range(n):
        h = rng.uniform(.03, .05)
        R.box('K', c + V((rng.uniform(-.01, .01), rng.uniform(-.01, .01), z + h / 2)),
              (rng.uniform(.17, .22), rng.uniform(.13, .17), h), rng.choice(palette), ch=.004,
              rot=(0, 0, rng.uniform(-.3, .3)), tag='books')
        z += h
    return z


def wall_clock(R, face, u, z, r=.16, rim='#6b4027'):
    R.B('W').cyl(face.p(u, z, .035), r, .05, n=14, rot=(math.pi / 2, 0, face.rot), tint=R.t('W', rim), tag='clock')
    R.B('K').cyl(face.p(u, z, .062), r * .84, .012, n=14, rot=(math.pi / 2, 0, face.rot), tint=R.t('K', '#f8f3e6'),
                 tag='clock')
    R.fbox(face, 'M', u, z + r * .24, .075, .012, r * .5, .008, IRON, tag='clock')
    R.fbox(face, 'M', u + r * .22, z, .075, r * .38, .012, .008, IRON, tag='clock')


def paper_stars(R, a, b, n, rng, z_drop=.0, cols=('#f06a8a', '#ffd35a', '#6ab8e8', '#6fcf8a')):
    """A garland of little paper flags between two points (flags hang below the line)."""
    a, b = V(a), V(b)
    R.rod('W', a, b, .004, '#7a5a3a', n=3, tag='garland')
    for i in range(n):
        t = (i + .5) / n
        p = a.lerp(b, t) + V((0, 0, -.12 * math.sin(math.pi * t)))
        w = (b - a).length / n * .7
        d = (b - a).normalized()
        q = p - d * w / 2
        e = p + d * w / 2
        col = cols[i % len(cols)]
        nrm = V((-d.y, d.x, 0))
        R.poly('P', [q, e, p + V((0, 0, -.14))], col, normal=nrm, tag='garland')
        R.poly('P', [e, q, p + V((0, 0, -.14))], col, normal=-nrm, tag='garland')


def window_curtain(R, face, u0, u1, z0, z1, col, d=.06, folds=5, rod_col='#6b4027'):
    """A cafe curtain: a row of slightly offset panels with a rod."""
    w = (u1 - u0) / folds
    for i in range(folds):
        R.fbox(face, 'P', u0 + w * (i + .5), (z0 + z1) / 2, d + (.012 if i % 2 else 0), w * .94, z1 - z0, .012,
               shade(col, .92 + .08 * (i % 2)), ch=.003, tag='curtain')
    R.B('W').rod(face.p(u0 - .03, z1 + .02, d + .02), face.p(u1 + .03, z1 + .02, d + .02), .012, tint=R.t('W', rod_col),
                 tag='curtain rod')


def tatami_lean(R, x0, y0, z, along_x=True, L=1.8, Wd=.9, straw='#d4c86e', heri='#2d4f8a', rng=None):
    """Cheap tatami: a flat slab, a few woven stripes and two flat indigo borders (about 26 triangles)."""
    rng = rng or random.Random(3)
    th = .05
    sx, sy = (L, Wd) if along_x else (Wd, L)
    mb = R.B('P')
    mb.box(V((x0 + sx / 2, y0 + sy / 2, z + th / 2 - .01)), (sx - .01, sy - .01, th), tint=R.t('P', shade(straw, .8)),
           tag='tatami')
    n = 3
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        if along_x:
            xa, xb, ya, yb = x0 + .005 + (sx - .01) * t0, x0 + .005 + (sx - .01) * t1, y0 + .005, y0 + sy - .005
        else:
            ya, yb, xa, xb = y0 + .005 + (sy - .01) * t0, y0 + .005 + (sy - .01) * t1, x0 + .005, x0 + sx - .005
        k = (.96 + .04 * rng.random()) * (1.0 if i % 2 else .93)
        mb.poly([(xa, ya, z + th), (xb, ya, z + th), (xb, yb, z + th), (xa, yb, z + th)],
                tint=R.t('P', shade(straw, k)), normal=(0, 0, 1), tag='tatami')
    for s_ in (-1, 1):
        if along_x:
            yy = y0 + sy / 2 + s_ * (sy / 2 - .03)
            pts = [(x0 + .005, yy - .025, z + th + .002), (x0 + sx - .005, yy - .025, z + th + .002),
                   (x0 + sx - .005, yy + .025, z + th + .002), (x0 + .005, yy + .025, z + th + .002)]
        else:
            xx = x0 + sx / 2 + s_ * (sx / 2 - .03)
            pts = [(xx - .025, y0 + .005, z + th + .002), (xx + .025, y0 + .005, z + th + .002),
                   (xx + .025, y0 + sy - .005, z + th + .002), (xx - .025, y0 + sy - .005, z + th + .002)]
        mb.poly(pts, tint=R.t('P', heri), normal=(0, 0, 1), tag='tatami heri')


def plant_lean(R, c, r=.1, h=.12, pot='#c9683f', leaf='#4f9a3a', flowers=None, seed=1, kind='bush'):
    """A small potted plant (about 90 triangles): pot, three leaf blobs, optional flower dots."""
    rng = random.Random(seed)
    c = V(c)
    R.lathe('K', [(0, 0), (r * .75, 0), (r, h), (r * .95, h), (0, h * .9)], c, pot, n=8, tag='plant pot')
    if kind == 'tall':
        for i in range(4):
            a = TAU * i / 4 + rng.random() * .4
            base = c + V((0, 0, h * .9))
            tip = base + V((math.cos(a) * r * 1.2, math.sin(a) * r * 1.2, r * 2.8 + rng.random() * r))
            R.B('P').append(bm_loft([base, base.lerp(tip, .5) + V((0, 0, r * .3)), tip], [(-.03, 0), (.03, 0), (0, .02)],
                                    closed=True, caps=False), None, tint=R.t('P', shade(leaf, .8 + .25 * rng.random())),
                            smooth=70, tag='plant')
    else:
        for i in range(3):
            a = TAU * i / 3 + rng.random()
            R.sphere('P', c + V((math.cos(a) * r * .45, math.sin(a) * r * .45, h + r * .5 + rng.random() * r * .3)),
                     r * .65, shade(leaf, .85 + .2 * rng.random()), seg=5, rings=3, tag='plant')
    if flowers:
        for i in range(3):
            a = TAU * i / 3 + rng.random()
            R.sphere('K', c + V((math.cos(a) * r * .6, math.sin(a) * r * .6, h + r * 1.1)), r * .2, flowers, seg=4,
                     rings=2, tag='plant flowers')


def chest_lean(R, L, w, d, h, rows, col, pull='#2a2a30', legs=.06, cols_top=2):
    """Chest of drawers with about 130 triangles: body, top lip, drawer fronts (thin boxes), one pull per drawer."""
    R.box('W', L.p(0, 0, legs + (h - legs) / 2), (w, d, h - legs), col, ch=0, rot=L.rz, tag='chest')
    R.box('W', L.p(0, 0, h + .012), (w + .03, d + .02, .024), shade(col, .85), ch=0, rot=L.rz, tag='chest')
    R.box('W', L.p(0, 0, legs / 2), (w - .06, d - .04, legs), shade(col, .6), ch=0, rot=L.rz, tag='chest')
    z0, z1 = legs + .03, h - .03
    rh = (z1 - z0) / rows
    for r in range(rows):
        zc = z0 + rh * (r + .5)
        n = cols_top if r == rows - 1 else 1
        for k in range(n):
            dw = (w - .06) / n
            xc = -w / 2 + .03 + dw * (k + .5)
            R.box('W', L.p(xc, -d / 2 - .008, zc), (dw - .02, .02, rh - .02), shade(col, 1.08), ch=0, rot=L.rz, tag='chest')
            R.box('M', L.p(xc, -d / 2 - .026, zc + rh * .06), (min(.1, dw * .3), .018, .022), pull, ch=0, rot=L.rz,
                  tag='chest pulls')


def paper_lamp_lean(R, c, r=.26, h=.42, cord=.9, col='#f6d6a0'):
    """Round paper lantern (about 110 triangles): glowing lathe body, two wooden caps, a cord."""
    c = V(c)
    prof = [(r * .5, -h / 2), (r * .95, -h * .2), (r, h * .05), (r * .8, h * .38), (r * .45, h / 2)]
    R.lathe('G', prof, c, col, n=8, tag='paper lamp', smooth=70)
    R.cyl('W', c + V((0, 0, h / 2)), r * .42, .05, '#3a2418', n=6, tag='paper lamp')
    R.cyl('W', c + V((0, 0, -h / 2)), r * .45, .04, '#3a2418', n=6, tag='paper lamp')
    R.rod('W', c + V((0, 0, h / 2)), c + V((0, 0, h / 2 + cord)), .008, '#2a1c14', n=3, tag='paper lamp')


def pendant_lean(R, c, r=.26, col='#23889a', cord=.8):
    c = V(c)
    R.lathe('K', [(0.02, .16), (.07, .1), (r * .55, .02), (r, -.09), (r * .5, -.0), (0.0, .1)], c, col, n=8, tag='pendant')
    R.sphere('G', c + V((0, 0, -.06)), .06, '#fff6dc', seg=5, rings=3, tag='pendant')
    R.rod('W', c + V((0, 0, .16)), c + V((0, 0, .16 + cord)), .008, '#2a1c14', n=3, tag='pendant')


def cushion_lean(R, c, s=.5, col='#d8342c', h=.1, rot=0.0):
    R.box('P', V(c) + V((0, 0, h / 2)), (s, s * .92, h), col, ch=.03, rot=(0, 0, rot), tag='cushion')


def basket_lean(R, c, r=.22, h=.16, col='#c9a062', fill=None, n=3, rng=None, fr=.05, handle=False):
    """Woven basket in one low-poly lathe (about 40 triangles), optionally heaped with round fruit or toys."""
    rng = rng or random.Random(3)
    c = V(c)
    R.lathe('W', [(0, 0), (r * .78, 0), (r, h * .95), (r * .9, h), (0, h * .9)], c, col, n=8, tag='baskets')
    if fill:
        for i in range(n):
            a = TAU * i / max(1, n) + rng.random()
            rr = r * .45 if n > 1 else 0
            R.sphere('K', c + V((math.cos(a) * rr, math.sin(a) * rr, h * .95 + fr * .3)), fr, shade(fill, .9 + .15 * rng.random()),
                     seg=5, rings=3, tag='basket fill')
