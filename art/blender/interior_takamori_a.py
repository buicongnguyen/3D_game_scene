"""Takamori house A interior (build_interiors.py): a roomy two-zone hill-town home behind the porch door.

Wooden living/dining zone (table, four chairs, plate dresser, window seat in the bay), a tiled kitchen with a brick
hearth, hanging pots and a sink under the back window, and a raised tatami sleeping nook. Three decor variants
(Var_1 baker's family, Var_2 musician's home, Var_3 gardener's/herbalist's home) are empty groups of meshes only; the
game shows exactly one. All large furniture and every collider live in the base room.

This module also holds the helpers shared with interior_takamori_b (variant groups, NPC spots, curtains, chairs).
"""
import math, random
from mathutils import Vector, Matrix
import arch_lib
from interior_lib import *  # noqa: F401,F403
from interior_rooms import builder, shelf_unit, drawer_chest, bun, IRON, BRASS

V = Vector
WALNUT, DARKW = '#6b4027', '#4a2e20'

# ================================================================ shared helpers (also used by house B)


def face_rot(dx, dy):
    """Z rotation that turns a node's three.js +Z axis (blender -Y) / a Loc's local -Y towards (dx, dy)."""
    return math.atan2(dx, -dy)


SOFT = ('cushion', 'futon', 'pillow')


def install_vars(R):
    """Route every primitive into the current variant group (R.cur) so helpers need no group argument, and keep the
    triangle budget: chamfers only on big or soft pieces."""
    R.cur = None
    orig = R.B
    R.B = lambda key, group=None: orig(key, group if group else R.cur)
    obox = R.box

    def box(key, c, size, col=None, ch=.012, rot=None, tag='box', seg=1, **kw):
        if not (tag in SOFT or (ch >= .01 and min(size) >= .2 and max(size) >= 1.0)):
            ch = 0.
        return obox(key, c, size, col, ch=ch, rot=rot, tag=tag, seg=1, **kw)
    R.box = box
    ofb = R.fbox
    R.fbox = lambda face, key, u, z, d, su, sz, sd, col=None, ch=0., tag='fbox', front=True: ofb(
        face, key, u, z, d, su, sz, sd, col, ch=0., tag=tag, front=front)


def group_report(R):
    for g, mbs in R.groups.items():
        tags = {}
        for mb in mbs.values():
            for t, n in mb.tris.items():
                tags[t] = tags.get(t, 0) + n
        top = ', '.join(f'{t} {n}' for t, n in sorted(tags.items(), key=lambda kv: -kv[1])[:14])
        print(f'    GROUP {g or "base":8s} {sum(tags.values()):6d} tris: {top}')


def begin_var(R, n):
    name = f'Var_{n}'
    R.pivot(name, (0, 0, 0), with_statics=True)
    R.cur = name


def end_vars(R):
    R.cur = None


def npc_spot(R, name, pos, look):
    e = R.node(name, (pos[0], pos[1], 0.0))
    e.rotation_euler = (0, 0, face_rot(look[0] - pos[0], look[1] - pos[1]))
    return e


def chair(R, c, look, col='#a8693a', seat='#e0b070', tall=True):
    L = Loc(c, face_rot(look[0] - c[0], look[1] - c[1]))
    for sx in (-1, 1):
        R.box('W', L.p(sx * .18, -.17, .22), (.04, .04, .44), col, ch=0, rot=L.rz, tag='chairs')
        R.box('W', L.p(sx * .18, .17, .45), (.04, .04, .9), col, ch=0, rot=L.rz, tag='chairs')
    R.box('W', L.p(0, 0, .455), (.42, .4, .04), seat, ch=0, rot=L.rz, tag='chairs')
    R.box('W', L.p(0, .17, .72), (.34, .03, .16), col, ch=0, rot=L.rz, tag='chairs')


def chest_lite(R, L, w, d, h, rows, col, pull=BRASS, cols=2, legs=.05):
    """Cheap chest of drawers: body, framed drawer fronts and one pull per drawer (about 20 tris per drawer)."""
    R.box('W', L.p(0, 0, legs + (h - legs) / 2), (w, d, h - legs), col, ch=0, rot=L.rz, tag='chest')
    R.box('W', L.p(0, 0, h + .012), (w + .03, d + .02, .024), shade(col, .8), ch=0, rot=L.rz, tag='chest')
    for sx in (-1, 1):
        R.box('W', L.p(sx * (w / 2 - .04), 0, legs / 2), (.06, d - .04, legs), shade(col, .6), ch=0, rot=L.rz, tag='chest')
    z0, z1 = legs + .03, h - .03
    rh = (z1 - z0) / rows
    for r in range(rows):
        n = cols if r == rows - 1 else 1
        for k in range(n):
            dw = (w - .06) / n
            xc = -w / 2 + .03 + dw * (k + .5)
            zc = z0 + rh * (r + .5)
            R.box('W', L.p(xc, -d / 2 - .008, zc), (dw - .03, .02, rh - .03), shade(col, 1.1), ch=0, rot=L.rz, tag='chest')
            R.box('M', L.p(xc, -d / 2 - .025, zc), (min(.12, dw * .35), .015, .025), pull, ch=0, rot=L.rz, tag='chest')


def table(R, c, w, d, h, top='#d9a468', leg='#8a5a32', rot=0.0, tag='table'):
    L = Loc(c, rot)
    R.box('W', L.p(0, 0, h - .025), (w, d, .05), top, ch=.01, rot=L.rz, tag=tag)
    R.box('W', L.p(0, 0, h - .08), (w - .16, d - .16, .06), shade(leg, .85), ch=0, rot=L.rz, tag=tag)
    for sx in (-1, 1):
        for sy in (-1, 1):
            R.box('W', L.p(sx * (w / 2 - .07), sy * (d / 2 - .07), (h - .05) / 2), (.07, .07, h - .05), leg, ch=0,
                  rot=L.rz, tag=tag)


def curtains(R, face, hole, col, trim=None, fold=None, drop=None, tie=True, rod='#5a3726'):
    """Two curtain panels and a rod over a window hole (about 60 tris; all 6+ mm proud of the casing)."""
    ua, ub, za, zb = hole
    w = ub - ua
    zt = zb + .15
    zbot = drop if drop is not None else za - .08
    fold = fold or shade(col, .86)
    R.fbox(face, 'W', (ua + ub) / 2, zt + .03, .12, w + .45, .03, .035, rod, tag='curtain rod')
    pw = max(.26, w * .3)
    hgt = zt - zbot
    R.fbox(face, 'P', (ua + ub) / 2, zb + .06, .11, w + .2, .16, .03, col, tag='curtains')
    R.fbox(face, 'P', (ua + ub) / 2, zb - .02, .125, w + .2, .03, .03, trim or fold, tag='curtains')
    for s_ in (-1, 1):
        u0 = ua - .1 if s_ < 0 else ub + .1
        c = u0 + s_ * pw / 2
        R.fbox(face, 'P', c, (zt + zbot) / 2, .1, pw, hgt, .03, col, tag='curtains')
        R.fbox(face, 'P', c - s_ * pw * .15, (zt + zbot) / 2 - .02, .13, pw * .38, hgt - .06, .03, fold, tag='curtains')


def sill_pot(R, face, u, z, r=.07, h=.1, pot='#c8643c', leaf='#4f9a3a', flowers=None, seed=1, kind='bush'):
    """A small pot standing on a window sill (face-local u, sill-top z)."""
    plant(R, face.p(u, z, .13), r=r, h=h, pot=pot, leaf=leaf, flowers=flowers, seed=seed, kind=kind)


def pendant_lite(R, c, r=.26, col='#23889a', cord=.8):
    """Enamel pendant lamp, cheap version (about 150 tris)."""
    c = V(c)
    R.lathe('K', [(.03, .14), (.07, .1), (r * .6, .02), (r, -.08), (r * .55, -.03), (.05, .07)], c, col, n=8, tag='pendant')
    R.sphere('G', c + V((0, 0, -.05)), .07, '#fff6dc', seg=6, rings=4, tag='pendant')
    R.rod('W', c + V((0, 0, .14)), c + V((0, 0, .14 + cord)), .008, '#2a1c14', n=3, tag='pendant')


def sack_lite(R, c, h=.5, r=.2, col='#efe2c4', rot=0.0, seed=0):
    rng = random.Random(seed)
    R.lathe('P', [(0, 0), (r * .9, .01), (r, h * .35), (r * .85, h * .7), (r * .25, h * .88), (0, h * .95)], V(c),
            shade(col, .92 + .1 * rng.random()), n=6, rot=(0, 0, rot), tag='sacks', scale=(1.0, .75, 1.0), smooth=60)


def wall_rail(R, face, a, b, z, key='W', col=WALNUT, d=.04):
    R.fbox(face, key, (a + b) / 2, z, d, b - a, .035, .05, col, ch=.006, tag='wall rail')


def hang_pot(R, c, r=.1, h=.12, col='#c97a3a', rim=None, lid=False):
    """Copper/enamel pot hanging from a hook at c (top) on a loop handle (about 90 tris)."""
    c = V(c)
    R.lathe('M', [(0, 0), (r * .9, 0), (r, h * .35), (r, h), (0, h * .92)], c + V((0, 0, -h)), col, n=8,
            tag='hanging pots', smooth=40)
    R.torus('M', c + V((0, 0, -h * .1)), r * .9, .008, rim or BRASS, maj=6, mn=3, rot=(math.pi / 2, 0, 0),
            tag='hanging pots', arc=.5)
    R.rod('M', c + V((0, 0, .08)), c + V((0, 0, -h * .1 + .02)), .005, IRON, n=3, tag='hanging pots')


def plant(R, c, r=.2, h=.26, pot='#c9683f', leaf='#4f9a3a', kind='bush', flowers=None, seed=1):
    """Low-poly potted plant (about 200 tris)."""
    rng = random.Random(seed)
    c = V(c)
    R.lathe('K', [(0, 0), (r * .75, 0), (r, h), (r * .9, h), (0, h * .9)], c, pot, n=8, tag='plant pot', smooth=50)
    if kind == 'bush':
        for i in range(3):
            a = TAU * i / 3 + rng.random()
            R.sphere('P', c + V((math.cos(a) * r * .45, math.sin(a) * r * .45, h + r * .55 + rng.random() * r * .3)),
                     (r * .7, r * .7, r * .6), shade(leaf, .82 + .2 * rng.random()), seg=6, rings=4, tag='plant')
        R.sphere('P', c + V((0, 0, h + r * 1.0)), r * .62, shade(leaf, 1.05), seg=6, rings=4, tag='plant')
    else:
        for i in range(5):
            a = TAU * i / 5 + rng.random() * .4
            base = c + V((0, 0, h * .9))
            tip = base + V((math.cos(a) * r * 1.3, math.sin(a) * r * 1.3, r * 2.6 + rng.random() * r))
            mid = base.lerp(tip, .5) + V((math.cos(a) * r * .3, math.sin(a) * r * .3, r * .3))
            R.B('P').append(bm_loft([base, mid, tip], [(-.035, 0), (.035, 0), (0, .022)], closed=True, caps=False),
                            None, tint=R.t('P', shade(leaf, .8 + .25 * rng.random())), smooth=70, tag='plant')
    if flowers:
        for i in range(3):
            a = TAU * i / 3 + rng.random()
            R.sphere('K', c + V((math.cos(a) * r * .65, math.sin(a) * r * .65, h + r * 1.1 + rng.random() * r * .3)),
                     r * .2, flowers, seg=5, rings=3, tag='plant flowers')


def jar(R, c, col='#e8f2f0', fill='#c8643c', h=.12, r=.045, lid='#8a5a32'):
    c = V(c)
    R.lathe('K', [(0, 0), (r, 0), (r, h), (r * .8, h + .015), (0, h + .015)], c, fill, n=6, tag='jars')
    R.cyl('W', c + V((0, 0, h + .03)), r * .8, .025, lid, n=6, tag='jars')


def book_stack(R, c, n=3, rng=None, w=.2, d=.14, pal=('#b8342c', '#2f4c86', '#2f8a6a', '#e0a93a', '#7a3a6a')):
    rng = rng or random.Random(4)
    z = c[2]
    for i in range(n):
        hh = rng.uniform(.025, .04)
        R.box('K', (c[0] + rng.uniform(-.01, .01), c[1] + rng.uniform(-.01, .01), z + hh / 2),
              (w * rng.uniform(.9, 1.05), d, hh), rng.choice(pal), ch=0, rot=(0, 0, rng.uniform(-.2, .2)), tag='books')
        z += hh


def round_cushion(R, c, r=.2, col='#d8342c', h=.08):
    R.sphere('P', V(c) + V((0, 0, h / 2)), (r, r, h), col, seg=8, rings=4, tag='cushion')


def mug(R, c, col='#f4efe2', r=.03):
    R.lathe('K', [(0, 0), (r, 0), (r * 1.05, r * 1.7), (r * .85, r * 1.7), (r * .85, .008), (0, .008)], c, col, n=8,
            tag='mugs')


def plate(R, c, col='#f4efe2', r=.1, rim='#2a9a9a'):
    R.cyl('K', V(c) + V((0, 0, .008)), r, .016, col, n=14, tag='plates')
    R.cyl('K', V(c) + V((0, 0, .018)), r * .62, .006, rim, n=12, tag='plates')


def vase(R, c, col='#2a8fb0', flowers=('#f06a8a', '#ffd35a', '#f4efe2'), h=.2, seed=2):
    rng = random.Random(seed)
    c = V(c)
    R.lathe('K', [(0, 0), (.05, 0), (.07, h * .35), (.04, h * .8), (.05, h), (0, h * .96)], c, col, n=10, tag='vase')
    for i in range(5):
        a = TAU * i / 5 + rng.random()
        R.sphere('K', c + V((math.cos(a) * .05, math.sin(a) * .05, h + .04 + rng.random() * .05)), .035,
                 flowers[i % len(flowers)], seg=6, rings=3, tag='flowers')
    R.sphere('P', c + V((0, 0, h * .9)), .06, '#5aa04a', seg=6, rings=3, tag='flowers')


def wall_clock(R, face, u, z, r=.2, col='#fbf3e0', rim='#6b4027', t=(10, 8)):
    c = face.p(u, z, .06)
    ang = math.atan2(face.u.y, face.u.x)
    rot = (math.pi / 2, 0, ang)
    R.cyl('W', c, r * 1.12, .05, rim, n=20, rot=rot, ch=.005, tag='clock')
    R.cyl('K', face.p(u, z, .09), r, .014, col, n=20, rot=rot, tag='clock')
    for k in range(12):
        a = TAU * k / 12
        R.fbox(face, 'K', u + math.sin(a) * r * .84, z + math.cos(a) * r * .84, .102, .016, .03 if k % 3 == 0 else .016,
               .006, '#2a2a30', tag='clock')
    for ln, hr, w in ((r * .55, t[0] / 12 * TAU, .014), (r * .78, t[1] / 60 * TAU, .01)):
        R.B('M').rod(face.p(u, z, .106), face.p(u + math.sin(hr) * ln, z + math.cos(hr) * ln, .106), w / 2, n=4,
                     tint=R.t('M', '#2a2a30'), tag='clock')


# ================================================================ house A

CRM, BUTTER, SAGE, TERRA, TEAL, ROSE, INDIGO = '#fbf3e0', '#f6dcaa', '#74ac8c', '#c8643c', '#2a9a9a', '#e0657a', '#2f4c86'
HONEY = '#d09a5e'


@builder('interior-takamori-a')
def build_takamori_a():
    W, D, H = 6.9, 5.6, 3.2
    R = Room('interior-takamori-a', W, D, H, ceil=3.8, cam_top=3.12)
    fire_mat(R)
    install_vars(R)
    rng = random.Random(21)
    fc = R.faces()
    PZ = .24                                  # raised tatami nook
    holes = {
        'front': [(1.7, 2.7, 0, 2.15), (4.05, 6.25, .9, 2.2)],                       # door x 1.25 ; bay window
        'back': [(4.65, 5.85, 1.0, 2.2), (.9, 1.8, .85, 2.2), (2.28, 3.22, 0, 2.1)],  # kitchen, nook, back door
        'left': [(3.25, 4.15, .85, 2.15), (1.35, 2.25, .85, 2.15)],
        'right': [(3.25, 4.15, .85, 2.15)],
    }
    posts = {'back': [.06, W - .06], 'front': [.06, W - .06], 'left': [.06, D - .06], 'right': [.06, D - .06]}
    WB = 1.0
    for side, (f, L) in fc.items():
        plaster_wall(R, f, L, WB, H + .1, holes[side], BUTTER, du=1.3, dz=1.0, mottle=.06, us=post_splits(posts[side], .18),
                     zs=[2.5, 2.6])
        wainscot(R, f, L, 0, WB, [h for h in holes[side] if h[2] < WB], SAGE, board=.3, cap=CRM, seed=len(side))
        for u in posts[side]:
            R.fbox(f, 'W', u, H / 2, .04, .17, H, .08, WALNUT, ch=.012, tag='posts')
        for a, b in spans(0, L, 2.55, holes[side]):
            R.fbox(f, 'K', (a + b) / 2, 2.55, .02, b - a, .07, .04, TERRA, ch=.008, tag='picture rail')
    for y in (-1.7, .35, 2.2):
        R.box('W', (0, y, H + .14), (W + .1, .24, .28), WALNUT, ch=.02, tag='beams')
    for x in (-2.2, 2.2):
        R.box('W', (x, .35, H + .5), (.1, .1, .45), WALNUT, ch=.01, tag='beams')
    board_ceiling(R, 3.8, col='#e2b87a', board=.32, along='x')
    shadow_shell(R, holes)

    # ---- floors: honey planks everywhere, cream-and-teal tiles in the kitchen
    plank_floor(R, -W / 2, W / 2, -D / 2, D / 2, base=HONEY, board=.26, seg=1.7, along='x', seed=4)
    tile_floor(R, .2, W / 2, .6, D / 2, z=.016, tile=.43, cols=('#f1e4c6', '#e6d3a8', '#7fb8b4'), grout='#8f7a5c',
               checker=False, tag='kitchen tiles')
    R.box('W', (.2, (.6 + D / 2) / 2, .012), (.06, D / 2 - .6, .02), WALNUT, ch=.004, tag='tile edge')

    # ---- front wall: door, bay window and window seat, plate dresser, hooks
    door_inside(R, 'front', 2.2, w=1.0, h=2.15, col=TEAL, frame=CRM)
    ff, Lf = fc['front']
    window(R, ff, holes['front'][1], depth=.24, kind='valley', nu=7, nv=5, seed=3, frame=CRM, cols=3, rows=2, frame_key='K')
    # window seat in the bay
    sx0, sx1 = -2.8, -.6
    R.box('W', ((sx0 + sx1) / 2, -D / 2 + .22, .21), (sx1 - sx0, .4, .42), '#8f5a30', ch=.01, tag='window seat')
    for k in range(3):
        xc = sx0 + (sx1 - sx0) * (k + .5) / 3
        R.box('W', (xc, -D / 2 + .43, .21), (.62, .02, .32), '#a8693a', ch=.006, tag='window seat')
        R.box('M', (xc, -D / 2 + .45, .3), (.12, .015, .025), BRASS, ch=0, tag='window seat')
    R.box('W', ((sx0 + sx1) / 2, -D / 2 + .22, .44), (sx1 - sx0 + .04, .44, .035), '#c98f55', ch=.008, tag='window seat')
    R.col_c('window seat', ((sx0 + sx1) / 2, -D / 2 + .22, 0), (sx1 - sx0 + .04, .44, .46))
    # tall plate dresser to the right of the door
    dc = (2.65, -D / 2 + .24)
    L = Loc(dc, AGAINST['front'])
    chest_lite(R, L, 1.5, .44, .92, 2, '#a5612f', pull=BRASS, cols=2)
    Lu = Loc((dc[0], dc[1] + .06, .95), AGAINST['front'])
    shelf_unit(R, Lu, 1.5, .3, 1.1, 2, '#a5612f', back=TEAL)
    for k, x in enumerate((-.4, .4)):
        for z in (.58, 1.07):
            col = ('#f4efe2', '#e0a93a', '#e0657a')[(k + (z > .8)) % 3]
            R.cyl('K', L.p(x, .12, z + .36 - .05), .1, .014, col, n=8, rot=(math.pi / 2, 0, 0), tag='plates')
    R.col_c('dresser', dc, (1.54, .48, 0), top=2.0)
    # coat hooks, cap and shawl by the door
    R.fbox(ff, 'W', 3.95 - .25 + .3, 1.65, .03, .7, .08, .03, WALNUT, ch=.008, tag='hooks')
    for u in (3.65, 3.9, 4.15):
        R.B('M').rod(ff.p(u - .0, 1.65, .04), ff.p(u, 1.62, .12), .01, n=4, tint=R.t('M', BRASS), tag='hooks')
    R.B('P').append(bm_loft([ff.p(3.65, 1.62, .13), ff.p(3.65, 1.15, .15), ff.p(3.72, .85, .12)],
                            [(-.1, 0), (.1, 0), (.09, .03), (-.09, .03)], closed=True, caps=True), None,
                    tint=R.t('P', '#c8643c'), smooth=40, tag='shawl')
    R.lathe('P', [(0, .1), (.06, .09), (.09, .04), (.17, .015), (.18, 0), (0, 0)], ff.p(4.15, 1.5, .12), '#e3bb58', n=12,
            rot=(math.pi / 2, 0, ff.rot), tag='hat')
    for x, col in ((.05, '#3f8a5a'), (.3, '#3f8a5a')):
        R.box('K', (x, -D / 2 + .22, .15), (.1, .13, .3), col, ch=.02, seg=2, tag='boots')
        R.box('K', (x, -D / 2 + .17, .04), (.1, .2, .08), col, ch=.02, seg=2, tag='boots')

    # ---- left wall: low cabinet with a picture, bay-side plant, bookshelf bits
    fl, Ll = fc['left']
    window(R, fl, holes['left'][0], depth=.24, kind='village', nu=6, nv=5, seed=5, frame=CRM, cols=2, rows=1, frame_key='K')
    window(R, fl, holes['left'][1], depth=.24, kind='village', nu=6, nv=5, seed=6, frame=CRM, cols=2, rows=1, frame_key='K')
    Lc = Loc((-W / 2 + .24, 0, 0), AGAINST['left'])
    chest_lite(R, Lc, 1.0, .42, .85, 3, '#a5612f', pull=BRASS, cols=2)
    R.col_c('low cabinet', (-W / 2 + .24, 0, 0), (.44, 1.04, .88))
    picture(R, fl, D / 2, 1.65, .8, .6, frame=WALNUT, kind='landscape', seed=2)
    plant(R, (-W / 2 + .38, -D / 2 + .42, 0), r=.24, h=.34, pot=TERRA, leaf='#4f9a3a', kind='tall', seed=5)
    R.col_c('floor plant', (-W / 2 + .38, -D / 2 + .42, 0), (.54, .54, .9))

    # ---- right wall: hearth with brick breast, window over the dining side, firewood
    fr, Lr = fc['right']
    window(R, fr, holes['right'][0], depth=.24, kind='village', nu=6, nv=5, seed=7, frame=CRM, cols=2, rows=1, frame_key='K')
    bx0, y0h, y1h = W / 2 - .56, .15, 1.65
    fo = Face((bx0, y1h, 0), (-1, 0, 0))                 # front of the breast, u runs -Y from y1h
    mouth = (.25, 1.25, .16, 1.1)
    brick_cols = ['#b8553a', '#c4623e', '#a84a32', '#cf7048', '#9c4630']
    courses(R, fo, 0, y1h - y0h, 0, H + .08, brick_cols, key='P', course=.16, length=(.34, .42), mortar='#d9c8ae',
            holes=[mouth], seed=4, tag='hearth bricks')
    for k, fs in enumerate((Face((W / 2, y1h, 0), (0, 1, 0)), Face((bx0, y0h, 0), (0, -1, 0)))):
        courses(R, fs, 0, .56, 0, H + .08, brick_cols, key='P', course=.16, length=(.34, .42), mortar='#d9c8ae',
                seed=7 + k, tag='hearth bricks')
    mu0, mu1, mz0, mz1 = mouth
    mc = (mu0 + mu1) / 2
    rr = (mu1 - mu0) / 2
    for k in range(7):
        am = math.pi * (k + .5) / 7
        p = fo.p(mc + math.cos(am) * (rr + .08), mz1 - .12 + math.sin(am) * (rr + .08) * .5, .03)
        R.box('P', p, (.09, .06, .14), shade('#8a3a28', .9 + .2 * rng.random()), ch=0, rot=(0, -am + math.pi / 2, fo.rot),
              tag='hearth arch')
    reveal(R.B('P'), fo, mouth, .4, tint=R.t('P', '#3a2018'), sides='lrt')
    R.poly('F', [fo.p(mu0, mz0, -.36), fo.p(mu1, mz0, -.36), fo.p(mu1, mz1, -.36), fo.p(mu0, mz1, -.36)], '#b8401a',
           normal=(1, 0, 0), tag='hearth fire')
    for k in range(4):
        u = mu0 + .14 + k * .22
        R.cyl('F', fo.p(u, mz0 + .06, -.2), .04, .4, '#f09040' if k % 2 else '#d05a24', n=6,
              rot=(math.pi / 2, 0, fo.rot + .3 * k), tag='hearth fire')
    R.box('P', fo.p(mc, mz0 - .1, .22), (mu1 - mu0 + .5, .5, .14), '#b8a894', ch=.012, rot=(0, 0, fo.rot), tag='hearth slab')
    R.fbox(fo, 'W', mc, 1.38, .1, 1.7, .08, .24, '#8f5a30', ch=.012, tag='mantel')
    R.fbox(fo, 'W', mc, 1.32, .05, 1.5, .06, .14, '#74441f', ch=0, tag='mantel')
    R.node('Light_3', fo.p(mc, .5, -.06))['fire'] = 1
    R.col('hearth', (bx0 - .22, y0h - .1, -.5), (W / 2 + .1, y1h + .1, H + .4), view=True)
    # firewood by the hearth
    for r in range(3):
        for k in range(3 - r % 2 - (r == 2)):
            y = y1h + .24 + k * .17 + (.08 if r % 2 else 0)
            R.cyl('W', (W / 2 - .3, y, .09 + r * .16), .08, .5, lambda cc, nn: R.t('W', '#e8c48a' if abs(nn.x) > .7 else '#8a5a32'),
                  n=7, rot=(0, math.pi / 2, 0), tag='firewood')
    R.col('firewood', (W / 2 - .6, y1h + .1, -.5), (W / 2, y1h + .72, .66))

    # ---- back wall: counter with sink under the kitchen window, spice shelf, nook window, back door
    fb, Lb = fc['back']
    window(R, fb, holes['back'][0], depth=.24, kind='village', nu=6, nv=5, seed=9, frame=CRM, cols=2, rows=1, frame_key='K')
    window(R, fb, holes['back'][1], depth=.24, kind='valley', nu=7, nv=5, seed=10, frame=CRM, cols=2, rows=1, frame_key='K')
    door_inside(R, 'back', 2.75, w=.94, h=2.1, col='#3f8a5a', frame=CRM, glass=True)
    cx0, cx1, cy0, cy1, cz = .2, W / 2 - .02, D / 2 - .5, D / 2 - .02, .88
    R.box('K', ((cx0 + cx1) / 2, (cy0 + cy1) / 2, cz / 2 - .02), (cx1 - cx0, cy1 - cy0, cz - .06), '#a9d0c0', ch=.015, tag='counter')
    for k in range(6):
        x = cx0 + .3 + k * (cx1 - cx0 - .6) / 5
        R.box('K', (x, cy0 - .01, cz / 2 - .02), (.5, .02, .62), '#c3e0d2', ch=.006, tag='counter doors')
        R.box('M', (x + .18, cy0 - .03, cz - .22), (.04, .02, .12), BRASS, ch=0, tag='counter doors')
    R.box('W', ((cx0 + cx1) / 2, (cy0 + cy1) / 2 - .02, cz), (cx1 - cx0 + .04, cy1 - cy0 + .07, .06), '#d9a468', ch=.012, tag='counter top')
    R.box('K', (1.8, cy1 - .22, cz + .026), (.62, .38, .02), '#cfd6d8', ch=.006, tag='sink')
    R.box('K', (1.8, cy1 - .22, cz + .031), (.5, .28, .012), '#7a8a90', ch=0, tag='sink')
    R.rod('M', (1.8, cy1 - .06, cz + .03), (1.8, cy1 - .06, cz + .25), .012, BRASS, n=6, tag='tap')
    R.rod('M', (1.8, cy1 - .06, cz + .25), (1.8, cy1 - .17, cz + .25), .012, BRASS, n=6, tag='tap')
    R.col('counter', (cx0 - .05, cy0 - .05, -.5), (cx1 + .1, cy1 + .1, cz + .1))
    # spice shelf left of the window, towel bar right
    ub0 = W / 2 + .3
    for z in (1.45, 1.85):
        R.fbox(fb, 'W', ub0 + .45, z, .1, 1.0, .035, .2, '#8f5a30', ch=.008, tag='spice shelf')
    # pot rack over the counter front
    for x in (.45, 1.95):
        R.rod('W', (x, 2.0, H + .02), (x, 2.0, 2.45), .006, '#2a1c14', n=4, tag='pot rack')
    R.rod('M', (.45, 2.0, 2.45), (1.95, 2.0, 2.45), .014, IRON, n=6, tag='pot rack')
    for k, (x, r, hh, col) in enumerate(((.7, .11, .13, '#c97a3a'), (1.35, .1, .12, '#2a9a9a'))):
        hang_pot(R, (x, 2.0, 2.43), r=r, h=hh, col=col, lid=k % 2 == 0)
    # nook window sill pot and the lantern chest
    # ---- tatami nook (left/back corner)
    nx0, nx1, ny0, ny1 = -W / 2, -1.65, 1.0, D / 2
    R.box('W', ((nx0 + nx1) / 2, (ny0 + ny1) / 2, PZ / 2 - .01), (nx1 - nx0, ny1 - ny0, PZ), '#8f5a30', ch=.01, tag='nook')
    R.box('W', ((nx0 + nx1) / 2, ny0 + .012, PZ / 2 - .02), (nx1 - nx0, .03, PZ - .04), '#74441f', ch=0, tag='nook')
    R.box('W', (nx1 - .006, (ny0 + ny1) / 2, PZ / 2 - .02), (.03, ny1 - ny0, PZ - .04), '#74441f', ch=0, tag='nook')
    for k in range(2):
        tatami(R, nx0 + .9 * k, ny0, along_x=False, z=PZ, straw='#d9cc78', heri='#2f6f8a', rng=rng)
    R.col('nook', (nx0 - .2, ny0, -.5), (nx1, ny1 + .2, PZ + .06), walk=True, surface='wood')
    # a pair of small step stones to the nook
    R.box('W', ((nx0 + nx1) / 2, ny0 - .16, .06), (1.2, .3, .12), '#a8693a', ch=.01, tag='step')
    # bedside chest and lantern at the back of the nook
    R.box('W', (nx1 - .28, ny1 - .26, PZ + .17), (.44, .4, .34), '#a5612f', ch=.01, tag='bedside')
    R.box('M', (nx1 - .28, ny1 - .26 - .205, PZ + .2), (.1, .012, .025), BRASS, ch=0, tag='bedside')
    R.col('bedside', (nx1 - .52, ny1 - .48, PZ - .2), (nx1 - .04, ny1 - .04, PZ + .64))
    R.lathe('G', [(0, 0), (.07, .02), (.09, .1), (.07, .2), (.03, .22), (0, .22)], (nx1 - .28, ny1 - .26, PZ + .34),
            '#ffe7b0', n=10, tag='lantern')
    R.cyl('W', (nx1 - .28, ny1 - .26, PZ + .345), .08, .02, '#3a2418', n=8, tag='lantern')

    # ---- lights and dining set
    pendant_lite(R, (-1.1, -.35, 2.3), r=.28, col=TERRA, cord=H + .6 - 2.3)
    R.node('Light_1', (-1.1, -.35, 2.2))
    pendant_lite(R, (1.7, 1.55, 2.45), r=.24, col=TEAL, cord=H + .6 - 2.45)
    R.node('Light_2', (1.7, 1.55, 2.3))
    tc = (-1.1, -.35)
    table(R, tc, 1.55, .88, .76, top='#dcab6e', leg='#8a5a32')
    for x in (-.45, .45):
        chair(R, (tc[0] + x, tc[1] + .62), tc, '#a8693a', '#e2b574')
        chair(R, (tc[0] + x, tc[1] - .62), tc, '#a8693a', '#e2b574')
    R.col('dining set', (-2.15, -1.28, -.4), (.1, .6, .95))

    # ---- NPC spots and the door
    npc_spot(R, 'Spot_npc_1', (2.05, .5), (-1.1, -.35))
    npc_spot(R, 'Spot_npc_2', (.25, 1.0), (-1.1, -.35))
    R.node('Spawn', (1.25, -D / 2 + 2.0, 0))
    R.node('Exit', (1.25, -D / 2 + .55, 0))

    # ================================================================ variants (meshes only)
    ctx = dict(fc=fc, holes=holes, W=W, D=D, H=H, PZ=PZ, tc=tc, nook=(nx0, nx1, ny0, ny1), cz=cz)
    begin_var(R, 1)
    var_baker(R, ctx)
    begin_var(R, 2)
    var_musician(R, ctx)
    begin_var(R, 3)
    var_gardener(R, ctx)
    end_vars(R)
    R.shell_cols(surface='wood')
    group_report(R)
    return R.finish_room()


def common_dress(R, ctx, c_main, c_trim, c_fold, rug_col, rug_border, rug_stripe, seat_col, futon, futon2, pic):
    """Pieces every variant has, recoloured: curtains, rug under the dining set, window-seat cushions, futon."""
    fc, holes = ctx['fc'], ctx['holes']
    for side, idx in (('front', 1), ('back', 1), ('left', 0)):
        curtains(R, fc[side][0], holes[side][idx], c_main, trim=c_trim, fold=c_fold, tie=True)
    rug(R, -2.3, -1.45, .1, .75, 0.0, rug_col, rug_border, stripe=rug_stripe)
    for k, x in enumerate((-2.4, -1.5)):
        R.box('P', (x, -2.58, .46 + .05), (.4, .37, .1), seat_col[k % len(seat_col)], ch=.03, rot=(0, 0, .1 * (k - 1)), tag='cushion')
    nx0, nx1, ny0, ny1 = ctx['nook']
    PZ = ctx['PZ']
    R.box('P', (nx0 + .85, (ny0 + ny1) / 2 + .05, PZ + .05 + .06), (1.55, 1.5, .12), futon, ch=.04, seg=2, tag='futon')
    R.box('P', (nx0 + .85, ny1 - .45, PZ + .05 + .14), (.62, .34, .1), '#fbf3e0', ch=.04, seg=2, tag='pillow')
    R.box('P', (nx0 + .85, ny0 + .75, PZ + .05 + .14), (1.57, .62, .06), futon2, ch=.03, seg=2, tag='futon')
    for (k, (u, z, w, h, kind, fr)) in enumerate(pic):
        side, uu = u
        picture(R, fc[side][0], uu, z, w, h, frame=fr, kind=kind, seed=k + 3)
        break


def var_baker(R, ctx):
    """Var_1: the baker's family. Peach curtains, terracotta rug, flour sacks, loaves, a bread basket, a rolling pin."""
    rng = random.Random(31)
    tc, W, D, cz = ctx['tc'], ctx['W'], ctx['D'], ctx['cz']
    common_dress(R, ctx, '#f4b896', TERRA, '#e8946e', '#d9724a', '#f4e2bc', '#f4e2bc', [TERRA, '#e8b640'],
                 '#e8a05a', '#fbf3e0',
                 [(('right', 3.7), 1.7, .62, .46, 'landscape', WALNUT), (('left', 4.9), 1.65, .46, .6, 'portrait', WALNUT)])
    for k, (x, y, hh) in enumerate(((.55, 1.7, .62), (.98, 1.76, .55))):
        sack_lite(R, (x, y, 0), h=hh, r=.21, col='#efe2c4', rot=rng.random(), seed=k)
    sack_lite(R, (.6, -D / 2 + .45, 0), h=.45, r=.17, col='#efe2c4', rot=.4, seed=9)
    # table: basket of loaves, rolling pin, plate of peach buns, mugs
    basket(R, (tc[0] - .3, tc[1] + .05, .76), r=.2, h=.1, col='#c9a062', n=2, rng=rng, fr=.04)
    for k, a in enumerate((0, 2.1)):
        R.B('K').append(bm_sphere((.17, .06, .05), 7, 4), arch_lib.xform(
            V((tc[0] - .3 + math.cos(a) * .07, tc[1] + .05 + math.sin(a) * .07, .76 + .1 + .03 * k)), (0, 0, a)),
            R.t('K', '#d9954a'), smooth=80, tag='bread')
    R.cyl('W', (tc[0] + .35, tc[1] - .1, .76 + .035), .035, .5, '#e8c48a', n=6, rot=(0, math.pi / 2, .15), tag='rolling pin')
    plate(R, (tc[0] + .3, tc[1] + .22, .76), '#f4efe2', .12, TERRA)
    for k in range(2):
        bun(R, (tc[0] + .3 + (k - .5) * .08, tc[1] + .22 + (k % 2) * .03, .78), r=.04, col='#f6d7b0', blush='#f58aa8')
    mug(R, (tc[0] - .7, tc[1] - .25, .76), TERRA)
    # counter: loaves and a board; peel on the wall; tins and jars on the spice shelf
    for k, x in enumerate((.5, .85)):
        R.B('K').append(bm_sphere((.17, .06, .055), 7, 4), arch_lib.xform(V((x, 2.62, cz + .06)), (0, 0, .3 * k)),
                        R.t('K', '#d99448'), smooth=80, tag='bread')
    R.rod('W', (3.15, 2.1, .05), (3.3, 2.2, 1.9), .02, '#c98f55', n=5, tag='peel')
    R.box('W', (3.31, 2.22, 2.05), (.3, .02, .32), '#d9a468', ch=0, rot=(.1, 0, .0), tag='peel')
    ub0 = W / 2 + .3 + .45
    fb = ctx['fc']['back'][0]
    for k in range(2):
        jar(R, fb.p(ub0 - .2 + k * .35, 1.85 + .02, .1), fill=['#c8643c', '#e0657a'][k], h=.1)
    # wheat sheaf above the hearth
    fo = Face((W / 2 - .56, 1.65, 0), (-1, 0, 0))
    for k in range(5):
        a = (k - 2) * .13
        R.rod('W', fo.p(.75, 1.58, .24), fo.p(.75 + math.sin(a) * .34, 1.58 + math.cos(a) * .36, .26), .007, '#d9b04a', n=3, tag='wheat')


def var_musician(R, ctx):
    """Var_2: a musician's home. Indigo curtains and rug, a koto on a stand, a drum, a lute, sheet music."""
    tc, W, D = ctx['tc'], ctx['W'], ctx['D']
    common_dress(R, ctx, '#3f6aa8', '#e8c860', '#34588c', '#2f5a8a', '#e8d6a0', '#e8b640', ['#2a9a9a', '#e8c860'],
                 '#5a86c8', '#e8d6a0',
                 [(('right', 3.7), 1.7, .5, .62, 'night', DARKW), (('left', 4.9), 1.65, .46, .6, 'landscape', DARKW)])
    kc = V((-2.62, -1.0, 0))
    for sy in (-.7, .7):
        R.box('W', kc + V((0, sy, .15)), (.34, .05, .3), '#5a3726', ch=0, tag='koto stand')
    R.box('W', kc + V((0, 0, .34)), (.26, 1.9, .07), '#8f4a22', ch=0, tag='koto')
    R.box('W', kc + V((0, 0, .385)), (.22, 1.86, .02), '#b87238', ch=0, tag='koto')
    for k in range(7):
        R.box('K', kc + V((0, -.7 + k * .23, .43)), (.05, .02, .05), '#f4efe2', ch=0, tag='koto bridges')
    for dx in (-.06, .06):
        R.B('M').rod(kc + V((dx, -.86, .41)), kc + V((dx, .86, .41)), .003, n=3, tint=R.t('M', '#f4efe2'), tag='koto strings')
    R.box('W', kc + V((0, .9, .4)), (.28, .04, .06), '#3a2418', ch=0, tag='koto')
    # taiko-style drum on a rack by the dresser
    dcn = V((3.0, -1.55, 0))
    R.cyl('W', dcn + V((0, 0, .38)), .26, .32, '#a5342c', n=12, ch=0, tag='drum')
    R.cyl('K', dcn + V((0, 0, .545)), .255, .012, '#f0e2c0', n=12, tag='drum')
    for sx in (-1, 1):
        R.box('W', dcn + V((sx * .22, 0, .12)), (.05, .5, .24), '#5a3726', ch=0, tag='drum rack')
    R.rod('W', dcn + V((-.1, 0, .56)), dcn + V((-.1, .15, .72)), .012, '#e8c48a', n=4, tag='drumsticks')
    R.rod('W', dcn + V((.1, 0, .56)), dcn + V((.12, -.14, .72)), .012, '#e8c48a', n=4, tag='drumsticks')
    # sheet music on the table, a lute on the left wall, a music stand, a flute and a cup on the mantel
    for k, (dx, dy, rz) in enumerate(((-.2, .05, .1), (.2, -.05, -.2))):
        R.box('K', (tc[0] + dx, tc[1] + dy, .76 + .004 + k * .003), (.22, .3, .004), '#f6f0dc', ch=0, rot=(0, 0, rz), tag='sheet music')
        R.box('K', (tc[0] + dx, tc[1] + dy, .76 + .008 + k * .003), (.17, .06, .002), '#3a3a40', ch=0, rot=(0, 0, rz), tag='sheet music')
    plate(R, (tc[0] - .5, tc[1] - .2, .76), '#f4efe2', .1, INDIGO)
    mug(R, (tc[0] + .6, tc[1] + .25, .76), '#e8c860')
    fl = ctx['fc']['left'][0]
    R.sphere('W', fl.p(D / 2, 1.9, .1), (.1, .06, .17), '#a8602a', seg=8, rings=5, tag='lute')
    R.B('W').rod(fl.p(D / 2, 2.0, .1), fl.p(D / 2, 2.35, .1), .02, n=5, tint=R.t('W', '#5a3726'), tag='lute')
    R.sphere('K', fl.p(D / 2, 1.9, .2), (.04, .01, .04), '#3a2418', seg=5, rings=3, tag='lute')
    R.box('W', fl.p(D / 2, 2.4, .1), (.06, .04, .1), '#3a2418', ch=0, tag='lute')
    R.box('W', (-.85, 1.2, .5), (.04, .04, 1.0), '#3a2418', ch=0, tag='music stand')
    R.box('W', (-.85, 1.2, .1), (.4, .04, .04), '#3a2418', ch=0, tag='music stand')
    R.box('K', (-.85, 1.17, 1.0), (.36, .02, .26), '#f6f0dc', ch=0, rot=(-.3, 0, 0), tag='music stand')
    fo = Face((W / 2 - .56, 1.65, 0), (-1, 0, 0))
    R.B('W').rod(fo.p(.45, 1.47, .15), fo.p(.95, 1.47, .15), .012, n=5, tint=R.t('W', '#e8c48a'), tag='flute')
    teacup(R, fo.p(1.2, 1.42, .1), '#f4efe2')


def var_gardener(R, ctx):
    """Var_3: a gardener's / herbalist's home. Leaf-green curtains and rug, hanging herbs, pots, seed jars."""
    rng = random.Random(33)
    tc, W, D, cz = ctx['tc'], ctx['W'], ctx['D'], ctx['cz']
    fc = ctx['fc']
    common_dress(R, ctx, '#a8cc78', '#4f9a3a', '#8cb85c', '#6fa85a', '#f1e4b0', '#e8d060', ['#f4efe2', '#e8d060'],
                 '#9acb7a', '#f4efe2',
                 [(('right', 3.7), 1.7, .56, .5, 'landscape', '#8a5a32'), (('left', 4.9), 1.65, .6, .46, 'landscape', '#8a5a32')])
    # herbs hang from a rail slung under the middle beam, and a few more from the ceiling over the table
    for x in (.25, 2.85):
        R.rod('W', (x, .35, 2.62), (x, .35, 3.2), .005, '#2a1c14', n=3, tag='herb rail')
    R.rod('W', (.25, .35, 2.62), (2.85, .35, 2.62), .012, '#3a2418', n=4, tag='herb rail')
    for k, x in enumerate((.7, 1.3, 1.9, 2.5)):
        col = ['#6aa84a', '#b8a040', '#7a4a8a', '#c87a8a'][k]
        R.rod('W', (x, .35, 2.62), (x, .35, 2.52), .004, '#2a1c14', n=3, tag='herbs')
        R.lathe('P', [(0, 0), (.04, 0), (.075, -.12), (.05, -.26), (0, -.3)], (x, .35, 2.52), col, n=5, tag='herbs', smooth=60)
    # table: potted mint, seed jars, a vase of flowers, a mug
    for k in range(2):
        jar(R, (tc[0] - .5 + k * .13, tc[1] - .2, .76), fill=['#c87a3a', '#7ab85a'][k], h=.1)
    vase(R, (tc[0] + .1, tc[1] - .05, .76), col='#f4efe2', flowers=('#f06a8a', '#ffd35a', '#c07ad8'), h=.18, seed=3)
    mug(R, (tc[0] - .1, tc[1] + .15, .76), '#f4efe2')
    # watering can near the door, pots on the sills, a trailing plant on the mantel, baskets of vegetables
    wc = V((.25, -1.9, 0))
    R.cyl('M', wc + V((0, 0, .13)), .09, .26, '#4a8a9a', n=8, tag='watering can')
    R.rod('M', wc + V((.07, 0, .12)), wc + V((.28, 0, .3)), .012, '#4a8a9a', n=4, tag='watering can')
    fb = fc['back'][0]
    sill_pot(R, fb, 5.05, 1.0, r=.08, h=.1, pot='#c8643c', flowers='#f06a8a', seed=1)
    sill_pot(R, fc['front'][0], 4.9, .9, r=.07, h=.09, pot='#f4efe2', flowers='#ffd35a', seed=7)
    fo = Face((W / 2 - .56, 1.65, 0), (-1, 0, 0))
    plant(R, fo.p(.6, 1.42, .1), r=.1, h=.12, pot='#c8643c', leaf='#4f9a3a', kind='tall', seed=11)
    R.box('W', (.55, 2.6, cz + .03), (.2, .14, .03), '#8a5a32', ch=0, tag='tray')
