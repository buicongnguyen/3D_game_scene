"""The four enterable rooms (build_interiors.py): Sora's cottage, Hana's bakery, Ota's mill, Genzo's station office.

Each room is built in its own space: floor z=0, centred on the origin, door in the -Y wall. Furniture uses Loc frames
(local -Y is a piece's front) and every colour is a tint painted over the near-white bases of the family materials.
"""
import math, random
from mathutils import Vector, Matrix
from interior_lib import *  # noqa: F401,F403

V = Vector
BUILD = {}


def builder(name):
    def deco(fn):
        BUILD[name] = fn
        return fn
    return deco


POST = '#5a3726'
DARKW = '#4a2e20'
BRASS = '#d9a441'
IRON = '#30343e'

# ================================================================ shared furniture


def letters(R, c, rng, n=None, rot=0.0):
    """A little stack of letter bundles tied with string."""
    c = V(c)
    n = n or rng.randint(1, 3)
    z = 0.0
    for k in range(n):
        w, d, h = rng.uniform(.15, .21), rng.uniform(.1, .13), rng.uniform(.03, .06)
        col = rng.choice(['#f4ead0', '#e8eef6', '#f6dfe0', '#efe2c4', '#e3f0e6'])
        a = rot + rng.uniform(-.12, .12)
        R.box('P', c + V((0, 0, z + h / 2)), (w, d, h), col, ch=0, rot=(0, 0, a), tag='letters')
        s = rng.choice(['#c8322a', '#2f4c86', '#c9a062'])
        R.box('P', c + V((0, 0, z + h / 2)), (w + .014, .014, h + .014), s, ch=0, rot=(0, 0, a), tag='letters')
        R.box('P', c + V((0, 0, z + h / 2)), (.014, d + .014, h + .014), s, ch=0, rot=(0, 0, a), tag='letters')
        z += h
    return z


def shelf_unit(R, L, w, d, h, levels, col, back=None, top_over=.02, key='W'):
    """Open shelves: sides, top, bottom, back and shelf boards. Returns the shelf top heights (local z)."""
    t = .035
    for s in (-1, 1):
        R.box(key, L.p(s * (w / 2 - t / 2), 0, h / 2), (t, d, h), col, ch=.008, rot=L.rz, tag='shelves')
    R.box(key, L.p(0, 0, h - t / 2), (w + top_over * 2, d + top_over, t), col, ch=.01, rot=L.rz, tag='shelves')
    R.box(key, L.p(0, 0, .05), (w - 2 * t, d, .1), shade(col, .8), ch=.006, rot=L.rz, tag='shelves')
    R.box(key, L.p(0, d / 2 - .01, h / 2), (w - 2 * t, .02, h - .02), back or shade(col, .7), ch=0, rot=L.rz,
          tag='shelves')
    tops = [.1]
    for i in range(1, levels):
        z = .1 + (h - .1 - t) * i / levels
        R.box(key, L.p(0, 0, z - .012), (w - 2 * t, d - .02, .025), col, ch=.005, rot=L.rz, tag='shelves')
        tops.append(z)
    return tops


def drawer_chest(R, L, w, d, h, rows, col, pull='#2a2a30', legs=.06, cols_top=2, key='W', metal_key='M'):
    """Chest of drawers (tansu): body, framed drawer fronts 8 mm proud, pulls and corner fittings."""
    R.box(key, L.p(0, 0, legs + (h - legs) / 2), (w, d, h - legs), col, ch=.012, rot=L.rz, tag='chest')
    R.box(key, L.p(0, 0, h + .012), (w + .03, d + .02, .024), shade(col, .85), ch=.008, rot=L.rz, tag='chest')
    for s in (-1, 1):
        R.box(key, L.p(s * (w / 2 - .04), -d / 2 + .06, legs / 2), (.06, .06, legs), shade(col, .6), ch=0, rot=L.rz,
              tag='chest')
        R.box(key, L.p(s * (w / 2 - .04), d / 2 - .06, legs / 2), (.06, .06, legs), shade(col, .6), ch=0, rot=L.rz,
              tag='chest')
    z0, z1 = legs + .03, h - .03
    rh = (z1 - z0) / rows
    for r in range(rows):
        zc = z0 + rh * (r + .5)
        n = cols_top if r == rows - 1 else 1
        for k in range(n):
            dw = (w - .06) / n
            xc = -w / 2 + .03 + dw * (k + .5)
            R.box(key, L.p(xc, -d / 2 - .008, zc), (dw - .02, .02, rh - .02), shade(col, 1.08), ch=.006, rot=L.rz,
                  tag='chest')
            R.box(metal_key, L.p(xc, -d / 2 - .03, zc + rh * .08), (min(.12, dw * .35), .02, .025), pull, ch=0,
                  rot=L.rz, tag='chest pulls')
            R.box(metal_key, L.p(xc, -d / 2 - .022, zc + rh * .08), (.05, .012, .05), pull, ch=0, rot=L.rz,
                  tag='chest pulls')
    for sx in (-1, 1):
        for sz in (legs + .02, h - .02):
            R.box(metal_key, L.p(sx * (w / 2 - .015), -d / 2 - .004, sz), (.05, .012, .05), pull, ch=0, rot=L.rz,
                  tag='chest pulls')


def chabudai(R, c, r=.48, h=.3, col='#9a5a32'):
    c = V(c)
    R.cyl('W', c + V((0, 0, h - .02)), r, .04, col, n=24, ch=.012, tag='table')
    R.cyl('W', c + V((0, 0, h - .06)), r * .92, .04, shade(col, .75), n=20, ch=0, tag='table')
    for a in range(4):
        ang = TAU * a / 4 + TAU / 8
        p = c + V((math.cos(ang) * r * .62, math.sin(ang) * r * .62, 0))
        R.box('W', p + V((0, 0, (h - .08) / 2)), (.05, .05, h - .08), shade(col, .7), ch=.008, rot=(0, 0, ang),
              tag='table')
    return c.z + h


def bun(R, c, r=.05, col='#f2c48a', blush='#f08aa0', key='K'):
    c = V(c)
    R.sphere(key, c + V((0, 0, r * .4)), (r, r, r * .72), col, seg=7, rings=4, tag='buns')
    if blush:
        R.sphere(key, c + V((0, 0, r * .96)), (r * .42, r * .42, r * .16), blush, seg=5, rings=2, tag='buns')


def arm_lamp(R, c, rot=0.0, reach=.45, h=.5, col='#23889a'):
    """Brass-jointed desk lamp with an enamel shade pointing down-forward."""
    c = V(c)
    L = Loc(c, rot)
    R.cyl('M', c + V((0, 0, .015)), .09, .03, BRASS, n=14, ch=.008, tag='arm lamp')
    a = L.p(0, 0, .03)
    b = L.p(0, -reach * .25, h)
    e = L.p(0, -reach, h * .95)
    R.rod('M', a, b, .012, BRASS, n=6, tag='arm lamp')
    R.rod('M', b, e, .012, BRASS, n=6, tag='arm lamp')
    R.sphere('M', b, .022, BRASS, seg=8, rings=4, tag='arm lamp')
    R.lathe('K', [(0.0, .08), (.03, .08), (.05, .05), (.1, -.04), (.11, -.06), (.1, -.06), (.045, .02), (0, .03)],
            e + V((0, 0, -.04)), col, n=14, rot=(.35, 0, rot), tag='arm lamp')
    R.sphere('G', e + V((0, 0, -.08)), .04, '#fff6dc', seg=8, rings=5, tag='arm lamp')
    return e + V((0, 0, -.1))


def star_frame(R, c, r=.45, rot=0.0, col='#c9a062', face_axis='x'):
    """A spare star-shaped kite frame of bamboo spars (hung on the tool wall)."""
    c = V(c)
    pts = []
    for i in range(10):
        a = math.pi / 2 + TAU * i / 10
        rr = r if i % 2 == 0 else r * .45
        if face_axis == 'x':
            pts.append(c + V((0, math.cos(a) * rr, math.sin(a) * rr)))
        else:
            pts.append(c + V((math.cos(a) * rr, 0, math.sin(a) * rr)))
    for i in range(10):
        R.rod('W', pts[i], pts[(i + 1) % 10], .009, col, n=4, tag='kite frame')
    for i in range(0, 10, 2):
        R.rod('W', c, pts[i], .006, shade(col, .9), n=4, tag='kite frame')

# ================================================================ SORA'S COTTAGE


@builder('interior-cottage')
def build_cottage():
    """Sora's home: genkan and raised floor, six tatami, low table and tea set, a shelf of Mika's letters, the photo
    wall with one frame missing, the oshiire with futons, and the workbench by the window where the Star Kite rests.
    Railway-signal keepsakes along the right wall: a semaphore arm, a signal lamp head, a hand lamp."""
    W, D, H = 7.2, 6.4, 3.2
    R = Room('interior-cottage', W, D, H, ceil=3.8, cam_top=3.12)
    rng = random.Random(5)
    PZ = .24                      # raised floor
    GY = -D / 2 + 1.15            # genkan step edge
    fc = R.faces()
    PL = '#f0d6a6'
    holes = {
        'front': [(W / 2 - .5, W / 2 + .5, 0, 2.08), (W / 2 + 1.3, W / 2 + 2.5, 1.1, 2.05)],
        'back': [(W / 2 + .9, W / 2 + 3.0, 1.25, 2.5)],
        'right': [(D / 2 - .9, D / 2 + .7, 1.05, 2.1)],
        'left': [(D / 2 + .2, D / 2 + 2.75, PZ, 2.0)],          # oshiire opening (recessed closet)
    }
    shell_holes = {k: [h for h in v if not (k == 'left')] for k, v in holes.items()}

    # ---- walls: clay plaster, dark posts and rails
    posts = {'back': [.07, 2.3, 4.34, 6.76, W - .07], 'front': [.07, 3.02, 4.18, 4.8, 6.2, W - .07],
             'left': [.07, 1.15, 3.1, 3.38, 6.02, D - .07], 'right': [.07, 2.22, 3.98, 5.25, D - .07]}
    rails = [(2.2, .1), (H - .08, .16)]
    for side, (f, L) in fc.items():
        plaster_wall(R, f, L, -.05, H + .1, holes[side], PL, mottle=.07, tag='plaster', us=post_splits(posts[side]),
                     zs=rail_splits(rails + [(.06, .12), (PZ + .05, .1)]))
        posts_and_rails(R, f, L, 0, H, posts[side], rails, col=POST, holes=holes[side])
        # skirting: stone-floor part at z .06, raised part at PZ + .05
        for a, b in spans(0, L, .06, holes[side]):
            if side == 'front':
                R.fbox(f, 'W', (a + b) / 2, .06, .02, b - a, .12, .03, DARKW, tag='skirting')
            elif side in ('left', 'right'):
                cut = 1.15 if side == 'left' else L - 1.15
                for aa, bb, z in ((a, min(b, cut), .06), (max(a, cut), b, PZ + .05)) if side == 'left' else \
                        ((a, min(b, cut), PZ + .05), (max(a, cut), b, .06)):
                    if bb - aa > .05:
                        R.fbox(f, 'W', (aa + bb) / 2, z, .02, bb - aa, .1, .03, DARKW, tag='skirting')
            else:
                R.fbox(f, 'W', (a + b) / 2, PZ + .05, .02, b - a, .1, .03, DARKW, tag='skirting')
    # tie beams and ceiling
    for y in (-.9, 1.5):
        R.box('W', (0, y, H + .14), (W + .1, .22, .28), DARKW, ch=.02, tag='beams')
    R.box('W', (0, .3, 3.62), (.2, D + .1, .2), DARKW, ch=.02, tag='beams')
    for x in (-1.8, 1.8):
        R.box('W', (x, .3, H + .45), (.1, .1, .5), DARKW, ch=.01, tag='beams')
    board_ceiling(R, 3.8, col='#c89058', board=.34, along='y')
    shadow_shell(R, shell_holes, gaps={'left': 1.0})

    # ---- floor: stone genkan, polished step, plank floor, six tatami
    tile_floor(R, -W / 2, W / 2, -D / 2, GY, z=0, tile=.46, cols=('#b3a794', '#a39a8c', '#c2b49c', '#9d958a'),
               grout='#6e665c', checker=False, tag='genkan stones')
    R.box('W', (0, GY + .01, PZ / 2), (W, .02, PZ), '#6b4027', ch=0, tag='step')
    R.box('W', (0, GY + .08, PZ - .045), (W, .16, .09), '#7a4a2c', ch=.015, tag='step')
    plank_floor(R, -W / 2, W / 2, GY + .16, D / 2, z=PZ, board=.2, base='#c98f58', along='x', seed=2)
    mats = [(-2.75, -1.1, True), (-.95, -1.1, True), (-2.75, -.2, False), (-1.85, -.2, True), (-1.85, .7, True),
            (-.05, -.2, False)]
    for x, y, ax in mats:
        tatami(R, x, y, along_x=ax, z=PZ, straw='#d4c66c', heri='#2d4f8a', rng=rng)
    R.col('platform', (-W / 2 - .2, GY, -.5), (W / 2 + .2, D / 2 + .2, PZ), walk=True, surface='wood')
    R.col('tatami', (-2.75, -1.1, -.5), (.85, 1.6, PZ + .04), walk=True, surface='wood')

    # ---- front: door, getabako, umbrella stand, boots
    door_inside(R, 'front', W / 2, w=1.0, h=2.08, col='#d8342c', frame=POST)
    window(R, fc['front'][0], holes['front'][1], depth=.22, shoji=True, frame=POST, cols=3, rows=4, sill=False)
    L = Loc((2.3, -D / 2 + .21), AGAINST['front'])
    drawer_chest(R, L, 1.7, .38, .88, 3, '#8a4a2a', pull=IRON, cols_top=3)
    plant(R, L.p(-.5, 0, .9), r=.1, h=.14, pot='#2f6f9a', leaf='#4f9a3a', flowers='#f07aa0', seed=3)
    R.cyl('K', L.p(.45, 0, .91), .05, .02, BRASS, n=10, tag='bell')
    R.lathe('M', [(0, 0), (.05, .0), (.05, .03), (.02, .06), (0, .07)], L.p(.45, 0, .92), BRASS, n=10, tag='bell')
    R.col_c('getabako', (2.3, -D / 2 + .21, 0), (1.74, .42, .88), top=.92)
    # umbrella stand + red janome umbrella
    uc = V((-1.0, -D / 2 + .32, 0))
    R.cyl('K', uc + V((0, 0, .25)), .13, .5, '#2f4c86', n=12, ch=.01, tag='umbrella')
    R.lathe('P', [(0.0, 1.05), (.05, 1.0), (.1, .7), (.09, .45), (.03, .42), (0, .42)], uc, '#d8342c', n=8,
            tag='umbrella')
    R.rod('W', uc + V((0, 0, .1)), uc + V((0, 0, 1.18)), .012, '#c9a062', n=5, tag='umbrella')
    R.col_c('umbrella', (-1.0, -D / 2 + .32, 0), (.32, .32, 1.1))
    for i, (x, col) in enumerate(((.95, '#3f8a3a'), (1.25, '#3f8a3a'))):
        bc = V((x, -2.55 - i * .05, 0))
        R.box('K', bc + V((0, 0, .17)), (.1, .13, .34), col, ch=.03, seg=2, tag='boots')
        R.box('K', bc + V((0, -.05, .04)), (.1, .2, .08), col, ch=.03, seg=2, tag='boots')
    for x in (-.3, -.05):
        R.box('W', (x, -2.6, .03), (.1, .24, .03), '#c9a062', ch=.008, tag='geta')
        R.box('W', (x, -2.6, .012), (.08, .03, .03), DARKW, ch=0, tag='geta')
    # coat hooks with Sora's shawl and straw hat (right wall, over the genkan)
    fr, Lr = fc['right']
    R.fbox(fr, 'W', D - .65, 1.75, .03, .9, .09, .03, POST, ch=.01, tag='hooks')
    for k, u in enumerate((D - .95, D - .65, D - .35)):
        R.B('M').rod(fr.p(u, 1.75, .04), fr.p(u, 1.72, .12), .01, n=5, tint=R.t('M', BRASS), tag='hooks')
    R.B('P').append(bm_loft([fr.p(D - .98, 1.72, .1), fr.p(D - .98, 1.2, .14), fr.p(D - .9, .8, .12)],
                            [(-.12, 0), (.12, 0), (.1, .03), (-.1, .03)], closed=True, caps=True), None,
                    tint=R.t('P', '#2f8a8a'), smooth=40, tag='shawl')
    hat = fr.p(D - .38, 1.62, .15)
    R.lathe('P', [(0, .12), (.07, .11), (.1, .05), (.2, .02), (.21, 0), (.2, -.01), (0, .0)], hat, '#e3bb58', n=14,
            rot=(0, math.pi / 2 * .9, -math.pi / 2), tag='hat')

    # ---- left: oshiire (recessed closet), tansu with the keepsake spot, photo wall, andon
    fl, Ll = fc['left']
    ya, yb, zt = .2, 2.75, 2.0
    depth = .8
    x_in = -W / 2 - depth
    R.box('P', (x_in + .01, (ya + yb) / 2, (PZ + zt) / 2), (.02, yb - ya, zt - PZ), '#d9c29a', ch=0, tag='oshiire')
    for y in (ya, yb):
        R.box('P', (-W / 2 - depth / 2, y + (.01 if y == ya else -.01), (PZ + zt) / 2), (depth, .02, zt - PZ),
              '#d9c29a', ch=0, tag='oshiire')
    R.box('W', (-W / 2 - depth / 2, (ya + yb) / 2, zt + .01), (depth, yb - ya, .02), '#c89058', ch=0, tag='oshiire')
    R.box('W', (-W / 2 - depth / 2, (ya + yb) / 2, PZ + .01), (depth, yb - ya, .02), '#c89058', ch=0, tag='oshiire')
    R.box('W', (-W / 2 - depth / 2 + .02, (ya + yb) / 2, PZ + .82), (depth - .02, yb - ya - .02, .04), '#b07a44',
          ch=.006, tag='oshiire')
    R.box('W', (-W / 2 + .02, (ya + yb) / 2, PZ + .82), (.06, yb - ya, .06), POST, ch=.008, tag='oshiire')
    # futon stack in the open (back) half, bundles above
    fy = (1.5 + yb) / 2
    zz = PZ + .03
    for k, col in enumerate(['#2d4f8a', '#f1e6cc', '#d8342c', '#e0a93a']):
        hh = .13 if k != 1 else .1
        R.box('P', (-W / 2 - .42, fy + rng.uniform(-.03, .03), zz + hh / 2), (.66, 1.05, hh), col, ch=.045, seg=2,
              tag='futon')
        zz += hh
    R.box('P', (-W / 2 - .42, fy, zz + .04), (.5, .3, .08), '#f4ead0', ch=.035, seg=2, tag='futon')
    for k, (dy, col) in enumerate(((-.35, '#8a3a6a'), (.05, '#2f8a6a'), (.4, '#e0a93a'))):
        R.box('P', (-W / 2 - .4, fy + dy, PZ + .95), (.36, .3, .22), col, ch=.06, seg=2, tag='bundles')
    # fusuma: closed panel over the front half, the back one slid behind it
    for k, (y0, y1, dx) in enumerate(((ya, 1.52, .03), (ya + .05, 1.57, -.01))):
        yc = (y0 + y1) / 2
        R.box('P', (-W / 2 + dx, yc, (PZ + zt) / 2), (.03, y1 - y0 - .04, zt - PZ - .03), '#f6edd6', ch=0,
              tag='fusuma')
        if k == 0:
            # painted mountains and a gold moon on the washi
            for j, (py, pz, s, col) in enumerate(((.3, .65, .5, '#3b6fb0'), (.62, .75, .42, '#2d4f8a'),
                                                  (.95, .6, .38, '#4f86c0'))):
                R.poly('P', [(-W / 2 + dx + .018, y0 + py - s, PZ + .35), (-W / 2 + dx + .018, y0 + py + s, PZ + .35),
                             (-W / 2 + dx + .018, y0 + py, PZ + .35 + pz)], col, normal=(1, 0, 0), tag='fusuma')
            R.cyl('K', (-W / 2 + dx + .02, y0 + .95, PZ + 1.45), .13, .006, '#e8b640', n=16,
                  rot=(0, math.pi / 2, 0), tag='fusuma')
            R.cyl('M', (-W / 2 + dx + .02, y1 - .12, PZ + .85), .03, .01, IRON, n=10, rot=(0, math.pi / 2, 0),
                  tag='fusuma')
        for (py, pz, sy, sz) in ((yc, PZ + .02, y1 - y0 - .02, .04), (yc, zt - .02, y1 - y0 - .02, .04),
                                 (y0 + .02, (PZ + zt) / 2, .04, zt - PZ), (y1 - .02, (PZ + zt) / 2, .04, zt - PZ)):
            R.box('W', (-W / 2 + dx + .005, py, pz), (.04, sy, sz), '#3a2418', ch=.006, tag='fusuma')
    # upper small closet doors (tenbukuro)
    R.box('P', (-W / 2 + .01, (ya + yb) / 2, 2.6), (.02, yb - ya, .6), '#f6edd6', ch=0, tag='fusuma')
    R.box('W', (-W / 2 + .03, (ya + yb) / 2, 2.6), (.04, .04, .6), '#3a2418', ch=0, tag='fusuma')
    R.box('W', (-W / 2 + .03, (ya + yb) / 2, 2.3), (.04, yb - ya, .04), '#3a2418', ch=0, tag='fusuma')
    R.col('oshiire', (-W / 2 - 1.2, ya - .1, -.5), (-W / 2 + .06, yb + .1, 2.4))
    # tansu with the keepsake spot, photo wall above
    L = Loc((-W / 2 + .23, -1.15, PZ), AGAINST['left'])
    drawer_chest(R, L, 1.2, .44, 1.02, 4, '#8a4a2a', pull=IRON, cols_top=2)
    for k, z in enumerate((0,)):
        pass
    R.col_c('tansu', (-W / 2 + .23, -1.15, PZ), (.48, 1.24, 1.02), top=PZ + 1.04, rot=0)
    # the dish, reading glasses on the tansu
    R.cyl('K', (-W / 2 + .25, -.7, PZ + 1.05), .07, .02, '#1f9aa0', n=12, tag='dish')
    R.lathe('K', [(0, 0), (.045, 0), (.05, .06), (.03, .14), (.035, .16), (0, .16)], (-W / 2 + .2, -1.62, PZ + 1.04),
            '#e8e0ce', n=10, tag='vase')
    for k in range(3):
        R.rod('P', (-W / 2 + .2, -1.62, PZ + 1.18), (-W / 2 + .2 + rng.uniform(-.08, .08), -1.62 + rng.uniform(-.1, .1),
                                                       PZ + 1.42 + .05 * k), .004, '#4f8a3a', n=3, tag='vase')
        R.sphere('K', (-W / 2 + .2 + (k - 1) * .06, -1.62 + (k - 1) * .04, PZ + 1.42 + .05 * k), .03,
                 ['#f07aa0', '#ffd35a', '#f4f1e8'][k], seg=6, rings=4, tag='vase')
    R.node('Item_keepsake', (-W / 2 + .26, -1.12, PZ + 1.04 + .24))
    # photo wall: four frames and the pale rectangle where the festival photo hung
    for (y, z, w, h, kind, fcol) in ((-1.68, 1.84, .24, .3, 'sepia', '#3a2418'), (-1.38, 2.0, .3, .22, 'landscape', '#c9a062'),
                                     (-.8, 1.78, .22, .28, 'portrait', '#3a2418'), (-.52, 1.96, .2, .2, 'night', '#8a4a2a')):
        picture(R, fl, R.u_of('left', y=y), z, w, h, frame=fcol, kind=kind, seed=int(y * 10))
    ue = R.u_of('left', y=-1.08)
    R.fbox(fl, 'P', ue, 1.8, .007, .3, .24, .004, '#f9e8c4', tag='pale spot')
    R.B('M').rod(fl.p(ue, 1.96, .0), fl.p(ue, 1.96, .03), .006, n=4, tint=R.t('M', IRON), tag='nail')
    # andon floor lamp
    ac = V((-W / 2 + .3, -.25, PZ))
    for sx in (-1, 1):
        for sy in (-1, 1):
            R.box('W', ac + V((sx * .13, sy * .13, .36)), (.03, .03, .72), POST, ch=.006, tag='andon')
    R.box('G', ac + V((0, 0, .44)), (.24, .24, .44), '#f6d6a0', ch=.006, tag='andon')
    R.box('W', ac + V((0, 0, .7)), (.3, .3, .03), POST, ch=.006, tag='andon')
    R.box('W', ac + V((0, 0, .18)), (.3, .3, .03), POST, ch=.006, tag='andon')
    R.col_c('andon', (ac.x, ac.y, PZ), (.36, .36, .74))
    R.node('Light_3', ac + V((0, 0, .46)))

    # ---- centre: six-mat room with the low table, cushions and tea
    tc = V((-.95, .25, PZ + .05))
    top = chabudai(R, tc, r=.5, h=.31, col='#9a5a32')
    R.col_c('table', (tc.x, tc.y, PZ), (1.04, 1.04, .36), top=top)
    for (dx, dy, col, rot) in ((0, -.82, '#d8342c', .05), (-.85, .12, '#2d4f8a', .3), (.82, .2, '#e0a93a', -.2)):
        cushion(R, tc + V((dx, dy, 0)), s=.5, col=col, rot=rot)
    R.box('W', tc + V((.08, .05, top - tc.z + .008)), (.36, .24, .016), '#6b4027', ch=.005, tag='tray')
    teapot(R, tc + V((.0, .06, top - tc.z + .016)), col='#2d4f8a', r=.075)
    for k, (dx, dy) in enumerate(((.17, .1), (.18, -.03), (-.2, -.12))):
        teacup(R, tc + V((dx, dy, top - tc.z + (.016 if k < 2 else .0))), col=['#1f9aa0', '#e8e0ce', '#1f9aa0'][k], r=.035)
    R.cyl('K', tc + V((-.18, .2, top - tc.z + .006)), .1, .012, '#f4efe2', n=16, tag='plate')
    for dx in (-.04, .04):
        bun(R, tc + V((-.18 + dx, .2, top - tc.z + .012)), r=.04, col='#f6d7b0', blush='#f58aa8')
    R.box('P', tc + V((.22, -.26, top - tc.z + .003)), (.18, .13, .006), '#f4ead0', ch=0, rot=(0, 0, .3), tag='letter')
    R.torus('M', tc + V((-.28, -.18, top - tc.z + .012)), .028, .004, BRASS, maj=10, mn=3, tag='glasses')
    R.torus('M', tc + V((-.21, -.16, top - tc.z + .012)), .028, .004, BRASS, maj=10, mn=3, tag='glasses')
    paper_lamp(R, (tc.x, tc.y, 2.35), r=.27, h=.44, cord=3.8 - 2.35 - .22)
    R.node('Light_1', (tc.x, tc.y, 2.2))

    # ---- back left: the shelf of letters
    L = Loc((-1.8, D / 2 - .19, PZ), AGAINST['back'])
    tops = shelf_unit(R, L, 1.8, .36, 2.0, 5, '#9a5a32', back='#6b4027')
    for i, z in enumerate(tops):
        x = -.82
        while x < .8:
            kind = rng.random()
            if kind < .55:
                letters(R, L.p(x + .1, -.02, z), rng, n=rng.randint(1, 3))
                x += .24
            elif kind < .8:
                wbox = rng.uniform(.22, .3)
                col = rng.choice(['#c8322a', '#2d4f8a', '#e0a93a', '#2f8a6a', '#f1e6cc'])
                R.box('P', L.p(x + wbox / 2, -.01, z + .07), (wbox, .26, .14), col, ch=.01, rot=L.rz, tag='boxes')
                R.box('P', L.p(x + wbox / 2, -.01, z + .145), (wbox + .01, .27, .02), shade(col, .8), ch=.004,
                      rot=L.rz, tag='boxes')
                x += wbox + .03
            else:
                book_row(R, L.o.x + x, L.o.x + x + .22, L.o.y - .02, L.o.z + z, depth=.22, rng=rng, h=(.18, .26))
                x += .25
    R.col_c('letters shelf', (-1.8, D / 2 - .19, PZ), (1.86, .4, 2.0), top=PZ + 2.0, view=True)

    # ---- back right: Sora's workbench under the big window, the Star Kite's cradle
    fb, Lb = fc['back']
    window(R, fb, holes['back'][0], depth=.26, kind='valley', seed=4, frame=POST, cols=3, rows=2, nu=14, nv=10)
    bx0, bx1 = .8, 3.12
    by = D / 2 - .33
    bt = PZ + .86
    R.box('W', ((bx0 + bx1) / 2, by, bt - .03), (bx1 - bx0, .66, .06), '#c98f55', ch=.015, tag='bench')
    for x in (bx0 + .06, bx1 - .06):
        for y in (by - .27, by + .27):
            R.box('W', (x, y, (PZ + bt - .06) / 2), (.07, .07, bt - .06 - PZ), '#8a5a32', ch=.008, tag='bench')
    R.box('W', ((bx0 + bx1) / 2, by, PZ + .2), (bx1 - bx0 - .1, .6, .03), '#8a5a32', ch=.006, tag='bench')
    R.box('W', ((bx0 + bx1) / 2, by + .3, PZ + .5), (bx1 - bx0 - .1, .02, .5), '#6b4027', ch=0, tag='bench')
    # under the bench: toolbox, bamboo spars, paper rolls
    R.box('K', (1.3, by - .05, PZ + .32), (.5, .26, .2), '#d8342c', ch=.015, tag='toolbox')
    R.box('M', (1.3, by - .05, PZ + .45), (.3, .04, .04), IRON, ch=.006, tag='toolbox')
    for k in range(7):
        R.rod('W', (2.0 + k * .03, by - .2 + (k % 3) * .06, PZ + .23), (2.9, by - .2 + (k % 3) * .06 + .02, PZ + .26 + k * .012),
              .01, '#d9c060', n=5, tag='spars')
    for k, col in enumerate(('#f6edd6', '#e8eef6', '#f07a60')):
        R.cyl('P', (2.2 + k * .12, by + .1, PZ + .28), .045, .45, col, n=8, rot=(0, math.pi / 2, 0), tag='paper rolls')
    # on the bench: two felt cradles for the kite, string spools, paint pots, a blueprint, the arm lamp
    for x in (1.35, 2.5):
        R.box('W', (x, by, bt + .04), (.1, .34, .08), '#6b4027', ch=.01, tag='cradle')
        R.box('P', (x, by, bt + .085), (.12, .36, .02), '#2f8a6a', ch=.006, tag='cradle')
    R.box('P', (1.9, by - .1, bt + .003), (.5, .34, .006), '#8fc2e8', ch=0, rot=(0, 0, -.08), tag='blueprint')
    for k, (x, col) in enumerate(((.98, '#d8342c'), (1.08, '#e0a93a'), (1.03, '#2f4c86'))):
        R.cyl('P', (x, by + .2 - k * .02, bt + .035 + (.07 if k == 2 else 0)), .035, .07, col, n=10, tag='spools')
    for k, (x, col) in enumerate(((2.85, '#d8342c'), (2.95, '#1f9aa0'), (2.9, '#e0a93a'))):
        R.cyl('K', (x, by - .2 + k * .03, bt + .04), .03, .08, col, n=10, tag='paint')
    light2 = arm_lamp(R, (3.0, by + .18, bt), rot=math.pi * .75, reach=.42, h=.55)
    R.node('Light_2', light2)
    # the Star Kite's stand in front of the bench: its handle bar (the kite's origin) rests in the padded cradle and the
    # 1.8 m canopy rises clear above the bench; the floor around it is kept free
    ks = V((1.95, 1.45, PZ))
    R.box('W', ks + V((0, 0, .03)), (.9, .36, .06), '#8a5a32', ch=.012, tag='kite stand')
    for sx in (-1, 1):
        R.box('W', ks + V((sx * .36, 0, .5)), (.07, .07, .94), '#9a6438', ch=.01, tag='kite stand')
        R.beam('W', ks + V((sx * .36, -.15, .06)), ks + V((sx * .36, 0, .5)), .05, .04, '#8a5a32', ch=.006, tag='kite stand')
        R.beam('W', ks + V((sx * .36, .15, .06)), ks + V((sx * .36, 0, .5)), .05, .04, '#8a5a32', ch=.006, tag='kite stand')
        R.box('W', ks + V((sx * .36, 0, .97)), (.1, .12, .06), '#6b4027', ch=.01, tag='kite stand')
        R.box('P', ks + V((sx * .36, 0, 1.01)), (.11, .13, .025), '#2f8a6a', ch=.008, tag='kite stand')
    R.box('W', ks + V((0, 0, .6)), (.72, .05, .05), '#8a5a32', ch=.008, tag='kite stand')
    R.node('Item_kite', ks + V((0, 0, 1.06)))
    R.col_c('kite stand', (ks.x, ks.y, PZ), (.9, .4, 1.0), top=PZ + 1.0)
    R.col('bench', (bx0 - .04, by - .36, -.5), (bx1 + .04, D / 2 + .1, bt + .02))
    # tool wall on the right, a spare star kite frame hanging from a peg
    fr, Lr = fc['right']
    R.fbox(fr, 'W', R.u_of('right', y=1.85), 1.75, .02, 1.1, .8, .025, '#b07a44', ch=.006, tag='tool board')
    for k, (y, z0, z1, col) in enumerate(((1.45, 1.95, 1.55, IRON), (1.62, 1.95, 1.6, IRON), (2.25, 1.95, 1.52, '#8a5a32'))):
        R.rod('M' if col == IRON else 'W', (W / 2 - .06, y, z0), (W / 2 - .06, y, z1), .012, col, n=5, tag='tools')
    R.box('W', (W / 2 - .07, 2.05, 1.42), (.05, .16, .08), '#8a5a32', ch=.01, tag='tools')
    R.box('M', (W / 2 - .05, 1.85, 1.62), (.01, .3, .09), '#c9ccd2', ch=0, tag='tools')
    R.box('W', (W / 2 - .06, 1.66, 1.62), (.04, .1, .05), '#6b4027', ch=.008, tag='tools')
    star_frame(R, (W / 2 - .08, 1.9, 2.55), r=.42, col='#c9a062', face_axis='x')
    plant(R, (W / 2 - .3, 2.12, PZ), r=.18, h=.3, pot='#2f6f9a', kind='tall', leaf='#3f8f3a', seed=6)
    R.col_c('plant', (W / 2 - .3, 2.12, PZ), (.4, .4, .9))

    # ---- right: shoji window, railway-signal memorabilia
    window(R, fr, holes['right'][0], depth=.22, shoji=True, frame=POST, cols=3, rows=4, sill=True)
    # semaphore arm high on the wall (pivot with the spectacle plate near the window side)
    sx = W / 2 - .09
    piv = V((sx, -.95, 2.55))
    R.cyl('M', piv, .06, .06, IRON, n=12, rot=(0, math.pi / 2, 0), tag='semaphore')
    R.box('K', (sx - .02, -1.75, 2.55), (.03, 1.45, .2), '#d8342c', ch=.012, tag='semaphore')
    R.box('K', (sx - .04, -2.25, 2.55), (.012, .14, .16), '#f4f1e8', ch=.004, tag='semaphore')
    R.box('K', (sx - .03, -.8, 2.42), (.02, .36, .12), IRON, ch=.006, tag='semaphore')
    for k, (dy, col) in enumerate(((-.17, '#e8352c'), (.1, '#2fbf6a'))):
        R.cyl('K', (sx - .045, -.8 + dy, 2.38), .065, .012, col, n=14, rot=(0, math.pi / 2, 0), tag='semaphore')
        R.torus('M', (sx - .05, -.8 + dy, 2.38), .068, .012, IRON, maj=14, mn=4, rot=(0, math.pi / 2, 0),
                tag='semaphore')
    # shelf with the brass hand lamp and a little model of the Viaduct Lamp
    R.box('W', (W / 2 - .13, -1.7, 1.55), (.24, 1.0, .04), '#9a5a32', ch=.008, tag='memento shelf')
    for y in (-2.1, -1.3):
        R.box('W', (W / 2 - .06, y, 1.45), (.04, .04, .18), POST, ch=.004, tag='memento shelf')
    hl = V((W / 2 - .14, -1.95, 1.57))
    R.lathe('M', [(0, 0), (.07, 0), (.075, .02), (.06, .05), (.065, .16), (.05, .2), (.02, .24), (0, .25)], hl, BRASS,
            n=12, tag='hand lamp')
    R.cyl('G', hl + V((-.06, 0, .1)), .045, .02, '#ff6a4a', n=12, rot=(0, math.pi / 2, 0), tag='hand lamp')
    R.torus('M', hl + V((0, 0, .29)), .05, .006, BRASS, maj=10, mn=4, rot=(math.pi / 2, 0, 0), tag='hand lamp')
    ml = V((W / 2 - .14, -1.45, 1.57))
    R.box('P', ml + V((0, 0, .05)), (.12, .12, .1), '#a79f94', ch=.01, tag='model lamp')
    R.box('P', ml + V((0, 0, .13)), (.09, .09, .06), '#a79f94', ch=.008, tag='model lamp')
    R.rod('W', ml + V((0, 0, .16)), ml + V((0, 0, .3)), .012, POST, n=5, tag='model lamp')
    R.box('G', ml + V((0, 0, .34)), (.07, .07, .08), '#ffd35a', ch=.006, tag='model lamp')
    R.extrude('K', [(math.cos(math.pi / 2 + TAU * i / 10) * (.05 if i % 2 == 0 else .022),
                     math.sin(math.pi / 2 + TAU * i / 10) * (.05 if i % 2 == 0 else .022)) for i in range(10)],
              .015, ml + V((0, 0, .42)), '#ffd35a', rot=(0, 0, math.pi / 2), tag='model lamp')
    picture(R, fr, R.u_of('right', y=-1.65), 1.95, .5, .3, frame='#3a2418', kind='map', seed=3)
    # the old signal lamp head from the viaduct, on a stand in the corner
    sc = V((W / 2 - .38, -2.0 + .3, PZ))
    R.cyl('W', sc + V((0, 0, .04)), .2, .08, '#6b4027', n=12, ch=.01, tag='signal lamp')
    R.rod('M', sc + V((0, 0, .08)), sc + V((0, 0, 1.05)), .03, IRON, n=8, tag='signal lamp')
    head = sc + V((0, 0, 1.22))
    R.cyl('K', head, .19, .3, '#262c38', n=16, ch=.02, rot=(0, math.pi / 2, 0), tag='signal lamp')
    R.cyl('G', head + V((-.16, 0, 0)), .12, .04, '#ff5a3a', n=16, rot=(0, math.pi / 2, 0), tag='signal lamp')
    R.torus('M', head + V((-.17, 0, 0)), .13, .018, BRASS, maj=16, mn=4, rot=(0, math.pi / 2, 0), tag='signal lamp')
    R.box('K', head + V((-.17, 0, .15)), (.08, .3, .02), '#262c38', ch=.004, rot=(0, -.3, 0), tag='signal lamp')
    R.cyl('K', head + V((0, 0, .22)), .06, .12, '#262c38', n=10, tag='signal lamp')
    R.col_c('signal lamp', (sc.x, sc.y, PZ), (.44, .44, 1.45), view=False)

    # ---- nodes, collision
    R.node('Spawn', (.1, -.85, PZ + .04))
    R.node('Exit', (0, -D / 2 + .55, 0))
    R.shell_cols(surface='stone')
    return R.finish_room()
