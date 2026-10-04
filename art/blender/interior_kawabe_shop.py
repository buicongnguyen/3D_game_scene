"""The Kawabe general store interior (build_interiors.py): ochre wainscot under cream plaster, a real little shop.

Base room (identical in all variants): the shop counter with scale, abacus, till and bell, goods shelves, barrels, rice
sacks, a stack of crates, the tall apothecary drawers, a pot stove with a kettle, a sleepy cat in her basket on the
window ledge, a hatch counter with a tea set, a noren over the back door, a hanging shop sign, a lantern and a pendant.
Variants (empty groups Var_1..Var_3, one shown per building): 1 grocer, 2 stationery and sweets, 3 hardware and rope.
Nodes: Spawn, Exit, Light_1..3 (Light_3 = stove, fire 1), Spot_npc_1 (behind the counter), Spot_npc_2 (customer)."""
import math, random
from mathutils import Vector, Matrix
import arch_lib
from interior_lib import *  # noqa: F401,F403
from interior_rooms import builder, IRON, BRASS, DARKW
from interior_kb_props import *  # noqa: F401,F403

V = Vector
PLASTER, OCHRE, CAP = '#f6e6c0', '#c9733c', '#6b4027'
INDIGO, CREAM, RED, TEAL, MUST = '#2d4a7a', '#f4efe2', '#d63a2a', '#2a8f9a', '#e0a93a'


def face_node(R, name, loc, face_dir):
    """Empty on the floor whose +Z (three.js) axis points along face_dir (x, y)."""
    e = R.node(name, loc)
    e.rotation_euler = (0, 0, math.atan2(face_dir[0], -face_dir[1]))
    return e


def goods(R, c, kind, rng, rot=0.0):
    """One piece of everyday shop stock standing at c."""
    c = V(c)
    if kind == 'jar':
        jar(R, c, r=.055, h=.15, col=rng.choice(['#d9c9a8', '#c9805a', '#9ab8a0', '#e8d8b8']), lid='#8a5a32', n=6)
    elif kind == 'tin':
        R.cyl('K', c + V((0, 0, .07)), .05, .14, rng.choice([RED, TEAL, MUST, '#2f4c86', '#f4efe2']), n=6, tag='tins')
    elif kind == 'box':
        w, h = rng.uniform(.1, .15), rng.uniform(.13, .22)
        col = rng.choice(['#e8c48a', '#d9a468', '#f0d8a0', '#a8c8a0'])
        R.box('P', c + V((0, 0, h / 2)), (w, .09, h), col, ch=0, rot=(0, 0, rot), tag='boxes')
        R.box('K', c + V((0, 0, h * .55)), (w + .004, .092, h * .3), rng.choice([RED, TEAL, '#2f4c86']), ch=0,
              rot=(0, 0, rot), tag='boxes')
    elif kind == 'cloth':
        for k in range(2):
            R.box('P', c + V((0, 0, .03 + k * .055)), (.26, .2, .05), rng.choice([INDIGO, '#c8322a', '#e8c48a', TEAL]),
                  ch=0, rot=(0, 0, rot + .05 * k), tag='cloth')
    elif kind == 'bag':
        R.box('P', c + V((0, 0, .1)), (.14, .08, .2), rng.choice(['#d9c28c', '#efe2c4']), ch=.015, rot=(0, 0, rot), tag='bags')


def stock_shelf(R, L, w, tops, rng, levels=(0, 2)):
    """Base goods on shelf levels (the other levels stay free for the variants)."""
    for i in levels:
        z = tops[i]
        x = -w / 2 + .1
        while x < w / 2 - .12:
            kind = rng.choice(['jar', 'tin', 'box', 'tin', 'box', 'cloth', 'bag'])
            wd = {'cloth': .3, 'box': .15, 'bag': .17}.get(kind, .13)
            goods(R, L.p(x + wd / 2, .02, z), kind, rng, rot=L.r)
            x += wd + .07


def abacus(R, c, rot=0.0):
    c = V(c)
    L = Loc(c, rot)
    R.box('W', L.p(0, 0, .03), (.38, .16, .06), '#6b4027', ch=0, rot=L.rz, tag='abacus')
    for k in range(4):
        x = -.12 + k * .08
        R.box('K', L.p(x, 0, .075), (.03, .1, .035), '#c9402a', ch=0, rot=L.rz, tag='abacus')
        R.box('K', L.p(x, 0, .105), (.03, .1, .02), '#e8c48a', ch=0, rot=L.rz, tag='abacus')


def balance(R, c, rot=0.0):
    """Counter balance scale. Returns the two pan centres (the grocer variant heaps apples on one)."""
    c = V(c)
    L = Loc(c, rot)
    R.cyl('M', L.p(0, 0, .015), .07, .03, '#c8322a', n=8, tag='scale')
    R.rod('M', L.p(0, 0, .03), L.p(0, 0, .34), .01, BRASS, n=5, tag='scale')
    R.rod('M', L.p(-.18, 0, .33), L.p(.18, 0, .33), .008, BRASS, n=5, tag='scale')
    out = []
    for s in (-1, 1):
        for k in (-1, 1):
            R.rod('M', L.p(s * .18, 0, .33), L.p(s * .18 + k * .06, 0, .14), .003, '#b8bcc4', n=3, tag='scale')
        R.lathe('M', [(.07, .018), (.095, .018), (.07, 0), (0, 0)], L.p(s * .18, 0, .13), BRASS, n=8, tag='scale')
        out.append(L.p(s * .18, 0, .15))
    return out


def noren_inside(R, face, u, z_top, w, h, cloth=INDIGO, panels=3):
    R.fbox(face, 'W', u, z_top + .03, .06, w + .16, .04, .05, '#3a2418', ch=0, tag='noren')
    pw = (w - .02 * (panels - 1)) / panels
    mb = R.B('P')
    for i in range(panels):
        ua = u - w / 2 + i * (pw + .02)
        pts = [(ua, z_top), (ua + pw, z_top), (ua + pw, z_top - h), (ua, z_top - h)]
        for dd, rev in ((.075, False), (.073, True)):
            q = [face.p(a, b, dd) for a, b in pts]
            mb.poly(q[::-1] if rev else q, tint=R.t('P', cloth), normal=face.n * (-1 if rev else 1), tag='noren')
    R.fbox(face, 'K', u, z_top - h * .42, .08, .22, .22, .006, CREAM, tag='noren crest')


def cat(R, c, rot=0.0):
    """A cat curled up asleep (tabby)."""
    c = V(c)
    L = Loc(c, rot)
    tabby, cream = '#e8943a', '#f4e6c4'
    R.sphere('P', L.p(0, 0, .07), (.15, .1, .075), tabby, seg=7, rings=4, tag='cat')
    R.sphere('P', L.p(-.1, -.02, .12), (.07, .065, .06), tabby, seg=6, rings=4, tag='cat')
    R.sphere('P', L.p(-.14, -.045, .115), (.03, .02, .025), cream, seg=4, rings=3, tag='cat')
    for s in (-1, 1):
        R.cyl('P', L.p(-.1, -.02 + s * .04, .18), .02, .035, tabby, r2=.004, n=4, tag='cat')
    R.torus('P', L.p(.02, .0, .06), .12, .022, tabby, maj=8, mn=3, rot=(0, 0, rot), tag='cat', arc=.7)


def mini_plant(R, c, r=.08, h=.1, pot='#c65f3a', leaf='#4f9a3a', flowers=None, seed=1):
    rng = random.Random(seed)
    c = V(c)
    R.lathe('K', [(r * .7, 0), (r, h), (r * .9, h), (0, h * .9)], c, pot, n=6, tag='plant pot')
    for i in range(3):
        a = 2.1 * i + rng.random()
        R.sphere('P', c + V((math.cos(a) * r * .4, math.sin(a) * r * .4, h + r * .55)), (r * .7, r * .7, r * .6),
                 shade(leaf, .85 + .25 * rng.random()), seg=5, rings=3, tag='plant')
    if flowers:
        for i in range(2):
            a = 3.0 * i + 1
            R.sphere('K', c + V((math.cos(a) * r * .5, math.sin(a) * r * .5, h + r * 1.05)), r * .2, flowers, seg=4, rings=3,
                     tag='plant flowers')


def mini_teapot(R, c, col='#2f4c86', r=.08):
    c = V(c)
    R.lathe('K', [(r * .7, 0), (r, r * .6), (r * .85, r * 1.2), (r * .35, r * 1.5), (0, r * 1.5)], c, col, n=8, tag='tea')
    R.rod('K', c + V((r * .85, 0, r * .6)), c + V((r * 1.5, 0, r * 1.2)), r * .14, col, n=4, r2=r * .08, tag='tea')
    R.torus('W', c + V((-r * .1, 0, r * 1.0)), r * .85, .008, '#6b4a2a', maj=6, mn=3, rot=(math.pi / 2, 0, math.pi / 2),
            tag='tea', arc=.5)


@builder('interior-kawabe-shop')
def build_shop():
    W, D, H = 5.0, 4.3, 3.15
    R = Room('interior-kawabe-shop', W, D, H, ceil=3.75, cam_top=3.1)
    fire_mat(R)
    make_vars(R)
    rng = random.Random(61)
    fc = R.faces()
    holes = {
        'front': [(W / 2 - .65, W / 2 + .65, 0, 2.2), (3.7, 4.85, .95, 2.15), (.15, 1.35, 1.0, 2.15)],
        'back': [(3.4, 4.3, 0, 2.1), (.9, 1.9, 1.1, 2.0)],
        'left': [(1.8, 2.8, 1.2, 2.0)],
        'right': [(1.6, 2.6, 1.1, 2.0)],
    }
    posts = {'back': [.06, W - .06], 'front': [.06, W - .06], 'left': [.06, D - .06], 'right': [.06, D - .06]}
    WS = 1.0
    for side, (f, L) in fc.items():
        plaster_wall(R, f, L, WS, H + .1, holes[side], PLASTER, mottle=.06, du=1.3, dz=1.3, us=post_splits(posts[side], .16), zs=[2.45, 2.53])
        wainscot(R, f, L, 0, WS, holes[side], OCHRE, board=.28, cap=CAP, seed=len(side) + 2)
        for u in posts[side]:
            R.fbox(f, 'W', u, H / 2, .04, .16, H, .08, CAP, ch=.012, tag='posts')
        for a, b in spans(0, L, 2.5, holes[side]):
            R.fbox(f, 'W', (a + b) / 2, 2.5, .02, b - a, .08, .04, CAP, ch=0, tag='picture rail')
    for y in (-.95, 1.0):
        R.box('W', (0, y, H + .14), (W + .1, .2, .28), '#6b4027', ch=.02, tag='beams')
    board_ceiling(R, 3.75, col='#d9a468', board=.28, along='x')
    shadow_shell(R, holes)

    # ---- floor: warm planks along the room, an indigo rug in the customer area
    plank_floor(R, -W / 2, W / 2, -D / 2, D / 2, board=.18, seg=1.0, base='#b9824f', var=.15, along='y', seed=6)
    rug(R, -1.85, -1.0, -.15, 1.55, 0, '#3f5f95', '#e0a93a', stripe='#f4efe2')

    # ---- windows and doors
    ff, Lf = fc['front']
    fb, Lb = fc['back']
    fl, Ll = fc['left']
    fr, Lr = fc['right']
    door_inside(R, 'front', W / 2, w=1.3, h=2.2, col='#c8452a', frame=CAP)
    window(R, ff, holes['front'][1], depth=.24, kind='village', seed=3, frame=CREAM, cols=3, rows=1, frame_key='K', nu=4, nv=4)
    window(R, ff, holes['front'][2], depth=.24, kind='village', seed=7, frame=CREAM, cols=2, rows=2, frame_key='K', nu=4, nv=4)
    window(R, fb, holes['back'][1], depth=.24, kind='valley', seed=11, frame=CREAM, cols=2, rows=2, frame_key='K', nu=4, nv=4)
    window(R, fl, holes['left'][0], depth=.24, kind='river', seed=13, frame=CREAM, cols=2, rows=2, frame_key='K', nu=4, nv=4)
    window(R, fr, holes['right'][0], depth=.24, kind='valley', seed=17, frame=CREAM, cols=2, rows=2, frame_key='K', nu=4, nv=4)
    # back door (storeroom) with a noren
    door_inside(R, 'back', 3.85, w=.9, h=2.1, col='#8a5a32', frame=CAP, glass=False)
    noren_inside(R, fb, 3.85, 1.98, .9, .72)

    # ---- front: hatch counter (left) with a tea set; the cat's window ledge (right)
    cx_hatch = -1.775
    R.box('W', (cx_hatch, -D / 2 + .2, .44), (1.25, .36, .88), '#8a5a32', ch=.014, tag='hatch cabinet')
    for k in range(3):
        R.box('W', (cx_hatch - .4 + k * .4, -D / 2 + .385, .44), (.34, .02, .7), '#a8703c', ch=0, tag='hatch cabinet')
        R.box('M', (cx_hatch - .4 + k * .4, -D / 2 + .4, .56), (.05, .02, .03), BRASS, ch=0, tag='hatch cabinet')
    R.box('W', (cx_hatch, -D / 2 + .21, .9), (1.4, .42, .045), '#d9a468', ch=.012, tag='hatch counter')
    mini_teapot(R, (cx_hatch - .3, -D / 2 + .22, .92), col='#2f4c86', r=.08)
    for k in range(3):
        R.lathe('K', [(.025, 0), (.04, .06), (0, .0)], (cx_hatch + .0 + k * .12, -D / 2 + .3, .92),
                ['#e0567a', TEAL, MUST][k], n=6, tag='tea')
    mini_plant(R, (cx_hatch + .45, -D / 2 + .22, .92), r=.09, h=.12, pot='#c65f3a', leaf='#4f9a3a', flowers='#e8506a', seed=3)
    R.col('hatch cabinet', (cx_hatch - .65, -D / 2, -.5), (cx_hatch + .65, -D / 2 + .44, .92))
    # window ledge cabinet + sleepy cat
    cxr = 1.75
    R.box('W', (cxr, -D / 2 + .19, .42), (1.25, .34, .84), '#8a5a32', ch=.014, tag='ledge cabinet')
    for k in range(2):
        R.box('W', (cxr - .3 + k * .6, -D / 2 + .355, .42), (.52, .02, .66), '#a8703c', ch=0, tag='ledge cabinet')
        R.box('M', (cxr - .1 + k * .6, -D / 2 + .37, .5), (.04, .02, .05), BRASS, ch=0, tag='ledge cabinet')
    R.box('W', (cxr, -D / 2 + .2, .86), (1.38, .4, .045), '#d9a468', ch=.012, tag='ledge top')
    R.lathe('W', [(.15, 0), (.24, .08), (.2, .085), (.12, .03), (0, .03)], (cxr - .35, -D / 2 + .22, .885),
            '#c9a062', n=8, tag='cat bed')
    R.cyl('P', (cxr - .35, -D / 2 + .22, .92), .17, .03, '#e0567a', n=8, ch=0, tag='cat bed')
    cat(R, (cxr - .35, -D / 2 + .22, .93), rot=.4)
    R.col('ledge cabinet', (cxr - .65, -D / 2, -.5), (cxr + .65, -D / 2 + .42, .9))
    # notice board left of the door, a hat and an apron on hooks right of it
    ub = R.u_of('front', x=-.9)
    R.fbox(ff, 'W', ub, 1.55, .02, .75, .6, .03, CAP, ch=0, tag='notice board')
    R.fbox(ff, 'P', ub, 1.55, .04, .69, .54, .01, '#e9d7a8', tag='notice board')
    for k in range(4):
        R.fbox(ff, 'P', ub + rng.uniform(-.2, .2), 1.55 + rng.uniform(-.17, .17), .052, .17, .22, .004,
               rng.choice([CREAM, '#f6dfe0', '#dfe8c8']), ch=0, tag='notices')
    R.fbox(ff, 'W', R.u_of('front', x=.9), 1.55, .04, .5, .08, .05, CAP, ch=0, tag='hooks')
    for xx in (.8, 1.0):
        R.fbox(ff, 'M', R.u_of('front', x=xx), 1.54, .08, .02, .02, .05, BRASS, tag='hooks')
    R.fbox(ff, 'W', R.u_of('front', x=.8), 1.38, .12, .3, .05, .1, '#e0c070', ch=.012, tag='hats')
    R.fbox(ff, 'W', R.u_of('front', x=.8), 1.44, .13, .14, .07, .1, '#d9b060', ch=.012, tag='hats')
    R.fbox(ff, 'P', R.u_of('front', x=1.0), 1.25, .075, .2, .5, .014, INDIGO, ch=0, tag='aprons')

    # ---- left wall: goods shelves, pickle barrels under the window
    shelves = []
    for yc, w in ((-1.1, 1.0), (1.4, 1.15)):
        L = Loc((-W / 2 + .2, yc), AGAINST['left'])
        tops = shelf_lite(R, L, w, .36, 2.0, 4, '#c9803c', back='#8a5a32', key='W')
        stock_shelf(R, L, w, tops, rng)
        shelves.append((L, w, tops))
        R.col('shelf left %d' % len(shelves), (-W / 2 - .2, yc - w / 2, -.5), (-W / 2 + .4, yc + w / 2, 2.05), view=True)
    for (x, y, r_, h_) in ((-2.08, -.12, .28, .74), (-2.03, .45, .26, .7)):
        barrel(R, (x, y, 0), r=r_, h=h_, col='#a8703c', fill='#c9a85a' if y < 0 else '#6a8a4a', n=8)
    R.col('barrels', (-2.4, -.42, -.5), (-1.74, .74, .76))
    # ---- right wall: shelves, the potbelly stove with its kettle
    L = Loc((W / 2 - .2, -1.0), AGAINST['right'])
    tops = shelf_lite(R, L, 1.0, .36, 2.0, 4, '#c9803c', back='#8a5a32', key='W')
    stock_shelf(R, L, 1.0, tops, rng)
    shelves.append((L, 1.0, tops))
    R.col('shelf right', (W / 2 - .4, -1.5, -.5), (W / 2 + .2, -.5, 2.05), view=True)
    sv = V((2.12, 1.72, 0))
    R.box('P', sv + V((0, 0, .02)), (.7, .7, .04), '#8a3a28', ch=.01, tag='stove plate')
    R.lathe('M', [(.2, .1), (.26, .2), (.27, .42), (.22, .62), (.14, .72), (.12, .8), (.14, .86), (0, .86)], sv, '#4a403c',
            n=10, tag='stove')
    R.rod('M', sv + V((0, 0, .86)), sv + V((0, 0, H + .4)), .05, '#2a2e38', n=6, tag='stove pipe')
    R.box('M', sv + V((-.265, 0, .38)), (.03, .22, .22), '#1a1c22', ch=0, tag='stove')
    R.poly('F', [sv + V((-.285, -.07, .31)), sv + V((-.285, .07, .31)), sv + V((-.285, .07, .45)), sv + V((-.285, -.07, .45))],
           '#ffb060', normal=(-1, 0, 0), tag='stove fire')
    R.lathe('M', [(.1, 0), (.13, .08), (.1, .16), (.05, .2), (0, .2)], sv + V((0, 0, .86)), '#c9a441', n=8, tag='kettle')
    R.rod('M', sv + V((.1, 0, 1.0)), sv + V((.2, 0, 1.0)), .012, '#3a3e48', n=4, tag='kettle')
    R.col('stove', (1.78, 1.38, -.5), (2.46, 2.1, 1.05))
    R.node('Light_3', sv + V((-.4, 0, .45)))['fire'] = 1

    # ---- back wall: crates, rice sacks, the apothecary drawers, a clock and the price board
    for k, (x, y, rot) in enumerate(((-.95, 1.8, .05), (-.95, 1.8, -.04))):
        crate(R, (x, y, k * .45), s=.5, col='#b07a44', rot=rot, rng=rng)
    R.col('crates', (-1.25, 1.52, -.5), (-.65, 2.1, 1.0))
    for k, (x, y, hh) in enumerate(((-1.82, 1.82, .62), (-1.78, 1.36, .56))):
        sack_lite(R, (x, y, 0), h=hh, r=.24, rot=rng.random(), seed=k)
    R.col('sacks', (-2.1, 1.1, -.5), (-1.5, 2.1, .8))
    ch = Loc((.1, D / 2 - .22), AGAINST['back'])
    chest_lite(R, ch, .95, .36, 1.35, 5, '#9a5a32')
    R.col('drawers', (-.4, D / 2 - .42, -.5), (.6, D / 2, 1.4))
    ub = R.u_of('back', x=.1)
    R.fbox(fb, 'W', ub, 1.95, .03, .8, .34, .03, CAP, ch=.01, tag='price board')
    R.fbox(fb, 'K', ub, 1.95, .05, .74, .28, .01, '#2a2e2a', tag='price board')
    for k in range(3):
        R.fbox(fb, 'P', ub + rng.uniform(-.06, .06), 2.03 - k * .08, .062, rng.uniform(.3, .55), .02, .004, CREAM, tag='price board')
    cl = fb.p(R.u_of('back', x=.1), 2.28, .03)
    R.cyl('W', cl + V((0, -.03, 0)), .2, .05, '#8a5a32', n=10, ch=0, rot=(math.pi / 2, 0, 0), tag='wall clock')
    R.cyl('K', cl + V((0, -.06, 0)), .17, .012, '#f4efe2', n=10, rot=(math.pi / 2, 0, 0), tag='wall clock')
    R.rod('K', cl + V((0, -.07, 0)), cl + V((0, -.07, .12)), .008, '#1d2430', n=3, tag='wall clock')
    R.rod('K', cl + V((0, -.07, 0)), cl + V((.08, -.07, -.03)), .008, '#1d2430', n=3, tag='wall clock')

    # ---- the shop counter (clerk side east), with abacus, scale, till and bell
    cx0, cx1, cy0, cy1, cz = .65, 1.4, -1.0, 1.3, .95
    R.box('K', ((cx0 + cx1) / 2, (cy0 + cy1) / 2, cz / 2), (cx1 - cx0, cy1 - cy0, cz - .05), '#a8482e', ch=.02, tag='counter')
    for k in range(5):
        y = cy0 + .25 + k * (cy1 - cy0 - .5) / 4
        R.box('K', (cx0 - .012, y, .5), (.02, .38, .55), '#c25a38', ch=0, tag='counter')
    R.box('K', (cx0 - .016, (cy0 + cy1) / 2, .12), (.03, cy1 - cy0, .1), MUST, ch=0, tag='counter')
    R.box('W', ((cx0 + cx1) / 2 - .03, (cy0 + cy1) / 2, cz), (cx1 - cx0 + .12, cy1 - cy0 + .08, .06), '#d9a468', ch=.012, tag='counter top')
    abacus(R, (.95, .75, cz + .03), rot=math.pi / 2)
    pans = balance(R, (1.0, -.45, cz + .03), rot=math.pi / 2)
    R.box('W', (1.1, .1, cz + .1), (.3, .22, .16), '#6b4027', ch=.012, rot=(0, 0, .1), tag='till')
    R.box('M', (.94, .1, cz + .14), (.01, .16, .05), BRASS, ch=0, tag='till')
    R.lathe('M', [(.06, .02), (.035, .05), (.04, .09), (.012, .1), (0, .13)], (1.0, 1.1, cz + .03), BRASS, n=8, tag='bell')
    R.box('P', (1.05, -.05, cz + .045), (.12, .09, .03), '#f0d8a0', ch=0, rot=(0, 0, .3), tag='paper bags')
    R.col('counter', (cx0 - .05, cy0 - .05, -.5), (cx1 + .05, cy1 + .05, cz + .1))

    # ---- display table in the customer area, lanterns and the hanging sign
    tb = V((-1.0, .3, 0))
    R.box('W', tb + V((0, 0, .76)), (1.0, .62, .045), '#d9a468', ch=.012, tag='table')
    for sx in (-1, 1):
        for sy in (-1, 1):
            R.box('W', tb + V((sx * .44, sy * .26, .37)), (.06, .06, .74), '#8a5a32', ch=0, tag='table')
    R.box('W', tb + V((0, 0, .2)), (.9, .52, .03), '#8a5a32', ch=0, tag='table')
    R.col_c('display table', (tb.x, tb.y, 0), (1.04, .66, .8))
    paper_lamp_lite(R, (-1.0, .3, 2.5), r=.26, h=.4, cord=H + .6 - 2.7, col='#f6c070')
    R.node('Light_1', (-1.0, .3, 2.45))
    pendant_lite(R, (1.05, .15, 2.35), r=.22, col='#c8452a', cord=H + .6 - 2.35)
    R.node('Light_2', (1.05, .15, 2.2))
    sign_plank(R, (-.35, -.7, 2.35), w=.85, h=.32, col='#f0d8a0', mark='#d8342c', cord=.75)
    lantern(R, (-2.0, -1.75, 2.4), r=.15, h=.3, cord=.9, col='#e8503a')
    mini_plant(R, (-W / 2 + .15, .15, 1.2), r=.07, h=.11, pot='#c65f3a', leaf='#4f9a3a', flowers='#e8506a', seed=5)
    mini_plant(R, (W / 2 - .15, .05, 1.1), r=.07, h=.11, pot='#23889a', leaf='#6fb84a', flowers='#f4efe2', seed=8)

    # framed pictures above the picture rail, a lucky cat on the counter
    for (face_, u_, z_, kind_, sd) in ((fl, R.u_of('left', y=-1.1), 2.78, 'landscape', 1), (fl, R.u_of('left', y=1.4), 2.78, 'sepia', 2),
                                      (fr, R.u_of('right', y=-1.0), 2.78, 'map', 3)):
        picture(R, face_, u_, z_, .6, .42, frame='#6b4027', kind=kind_, seed=sd)
    nk = V((.95, -.95, cz + .03))
    R.sphere('P', nk + V((0, 0, .06)), (.055, .045, .06), CREAM, seg=6, rings=3, tag='lucky cat')
    R.sphere('P', nk + V((0, 0, .15)), (.05, .045, .04), CREAM, seg=6, rings=3, tag='lucky cat')
    R.box('P', nk + V((.04, -.04, .15)), (.02, .02, .07), CREAM, ch=0, tag='lucky cat')
    R.box('K', nk + V((0, -.045, .095)), (.07, .008, .03), RED, ch=0, tag='lucky cat')
    R.cyl('M', nk + V((0, -.047, .06)), .018, .006, BRASS, n=6, rot=(math.pi / 2, 0, 0), tag='lucky cat')

    # ---- nodes
    R.node('Spawn', (0, -.2, 0))
    R.node('Exit', (0, -D / 2 + .5, 0))
    face_node(R, 'Spot_npc_1', (1.85, .1, 0), (-1, 0))
    face_node(R, 'Spot_npc_2', (.2, .85, 0), (1, 0))
    R.shell_cols(surface='wood')

    # ================= variants (decor only, no colliders)
    TZ = .79                                  # display table top
    CT = cz + .03                             # counter top
    # --- 1 grocer: produce crates, pickle jars, onion strings, the scale with apples
    with var_group(R, 'Var_1'):
        vr = random.Random(11)
        for k, kind in enumerate(('apple', 'cabbage', 'radish')):
            veg_crate(R, (tb.x - .33 + .33 * k, tb.y, TZ), w=.3, d=.34, h=.12, kind=kind, rng=vr, rot=.05 * k)
        veg_crate(R, (-.95, 1.8, .95), w=.44, d=.4, h=.12, kind='tomato', rng=vr)
        for k in range(3):
            apple(R, pans[0] + V((math.cos(k * 2.1) * .03, math.sin(k * 2.1) * .03, .005 + (.05 if k == 2 else 0))))
        for k, col in enumerate(('#8aaa5a', '#d9a05a', '#8aaa5a')):
            jar(R, (.9, .55 + .15 * k, CT), r=.06, h=.17, col=col, lid='#8a5a32')
        L, w, tops = shelves[0]
        for k in range(4):
            jar(R, L.p(-.36 + k * .24, .02, tops[1]), r=.07, h=.2, col=['#8aaa5a', '#d9a05a', '#e0402a', '#8aaa5a'][k])
            for j in range(2):
                apple(R, L.p(-.36 + k * .24 + (j - .5) * .1, .0, tops[3]), r=.045, col=['#d8342c', '#e8a02a', '#8ccf5a', '#d8342c'][k])
        L, w, tops = shelves[1]
        for k in range(4):
            cabbage(R, L.p(-.4 + k * .27, 0, tops[1]), r=.08, col=['#8ccf5a', '#6fb84a', '#a5d86a', '#8ccf5a'][k])
            if k < 3:
                veg_crate(R, L.p(-.3 + k * .3, 0, tops[3]), w=.24, d=.24, h=.06, kind='tomato' if k % 2 else 'pear', rng=vr, rot=L.r)
        L, w, tops = shelves[2]
        for k in range(3):
            veg_crate(R, L.p(-.3 + k * .3, 0, tops[1]), w=.24, d=.28, h=.08, kind='pumpkin' if k == 1 else 'onion', rng=vr, rot=L.r)
        for k, (x, y) in enumerate(((-.2, -.45), (.45, -.8))):
            R.rod('P', (x, y, H + .1), (x, y, 2.05), .008, '#c9a062', n=3, tag='onions')
            for j in range(3):
                R.sphere('K', (x + (.03 if j % 2 else -.03), y, 2.0 - .12 * j), (.05, .05, .045), '#e0b070' if k else '#c8a8d0',
                         seg=5, rings=3, tag='onions')
    # --- 2 stationery and sweets: paper rolls, ink bottles, candy jars, kites
    with var_group(R, 'Var_2'):
        cols = [RED, '#f4a0a8', MUST, TEAL, '#8aaa5a', '#2f4c86', '#c9a8d8']
        pap = [CREAM, '#f6dfe0', '#e0f0e0']
        for k in range(6):
            x, y = .87 + (k % 2) * .24, -.65 + (k // 2) * .28
            jar(R, (x, y, CT), r=.075, h=.2, col=cols[k], lid='#f4efe2')
            R.sphere('K', (x, y, CT + .22), .03, cols[(k + 3) % 7], seg=5, rings=3, tag='candy')
        for k in range(5):
            R.cyl('P', (tb.x - .4 + (k % 3) * .26, tb.y - .1 + (k // 3) * .2, TZ + .18), .045, .36, pap[k % 3], n=6, tag='paper rolls')
        for k in range(3):
            R.cyl('P', (tb.x + .3, tb.y - .15 + k * .14, TZ + .05), .05, .1, [RED, TEAL, MUST][k], n=6, rot=(math.pi / 2, 0, 0), tag='paper rolls')
        L, w, tops = shelves[0]
        for k in range(6):
            R.lathe('K', [(.032, 0), (.034, .05), (.018, .08), (0, .08)], L.p(-.38 + k * .14, .02, tops[1]),
                    ['#2f4c86', '#c8322a', '#1d2430', '#2f8a6a'][k % 4], n=6, tag='ink')
        for k in range(3):
            jar(R, L.p(-.3 + k * .3, .02, tops[3]), r=.08, h=.2, col=cols[k + 1], lid='#f4efe2')
        L, w, tops = shelves[1]
        for k in range(6):
            R.box('P', L.p(-.4 + k * .17, 0, tops[1] + .1), (.13, .16, .2), pap[k % 3], ch=0, rot=L.rz, tag='notebooks')
        for k in range(4):
            R.cyl('P', L.p(-.4 + k * .27, 0, tops[3] + .045), .045, .3, [RED, MUST, CREAM, TEAL][k % 4], n=6, rot=(0, math.pi / 2, L.r), tag='paper rolls')
        L, w, tops = shelves[2]
        for k in range(3):
            jar(R, L.p(-.3 + k * .3, 0, tops[1]), r=.07, h=.18, col=cols[(k + 2) % 7], lid='#f4efe2')
            R.box('P', L.p(-.3 + k * .2, 0, tops[3] + .1), (.13, .14, .2), pap[k % 3], ch=0, rot=L.rz, tag='notebooks')
        kite(R, fr, R.u_of('right', y=1.2), 1.8, .02, s=.62, cols=('#e0567a', CREAM), seed=1)
        kite(R, ff, R.u_of('front', x=-.2), 1.3, .02, s=.5, cols=(TEAL, MUST), seed=2)
        kite(R, fb, R.u_of('back', x=-2.0), 1.7, .02, s=.5, cols=(MUST, '#2f4c86'), seed=3)
        R.rod('P', (-.3, .0, H + .1), (-.3, .0, 2.55), .006, '#c9a062', n=3, tag='kites')
        for sgn, colr in ((1, '#e0567a'), (-1, CREAM)):
            R.B('K').append(bm_poly([(0, 0, .3), (.13 * sgn, 0, 0), (0, 0, -.3)]), arch_lib.xform((-.3, .0, 2.25), (0, 0, .5)),
                            tint=R.t('K', colr), flat=True, tag='kites')
    # --- 3 hardware and rope: tools on the wall, lanterns, rope coils, buckets
    with var_group(R, 'Var_3'):
        rope_coil(R, (tb.x - .25, tb.y, TZ), r=.2, col='#c9a062', turns=2)
        rope_coil(R, (tb.x + .22, tb.y + .05, TZ), r=.16, col='#a8c28a', turns=1)
        bucket(R, (.95, .75, CT), r=.1, h=.14, col='#8aa0b0', n=7)
        bucket(R, (.95, .75, CT + .13), r=.085, h=.13, col='#b07a44', n=7, handle=False)
        for k in range(2):
            lantern(R, (-.6 + k * 1.1, -.3 + (k % 2) * .9, 2.45), r=.14, h=.28, cord=.7, col=['#e8503a', '#f6c070', '#e8503a'][k])
        for k in range(1):
            hurricane_lamp(R, (.85 + k * .22, -.75, CT), col=['#2f5a50', '#8a3a28'][k])
        ub = R.u_of('back', x=.1)
        for k, (kind, dx) in enumerate((('hammer', -.55), ('saw', -.3), ('wrench', -.05), ('hammer', .2), ('saw', .45))):
            uu = ub + dx
            R.fbox(fb, 'W', uu, 1.7 if kind == 'hammer' else 1.78, .05, .03, .24, .02, '#a8703c', tag='tools')
            R.fbox(fb, 'M', uu, 2.0 if kind != 'saw' else 1.95, .06, .12 if kind != 'saw' else .04, .05 if kind != 'saw' else .28, .014, '#9aa0aa', tag='tools')
        L, w, tops = shelves[0]
        for k in range(4):
            R.box('P', L.p(-.36 + k * .24, .02, tops[1] + .06), (.14, .08, .12), '#d9b070', ch=0, rot=L.rz, tag='nail boxes')
            R.box('K', L.p(-.36 + k * .24, 0, tops[1] + .06), (.142, .082, .04), '#c8322a', ch=0, rot=L.rz, tag='nail boxes')
        for k in range(2):
            hurricane_lamp(R, L.p(-.2 + k * .35, .02, tops[3]), col=['#2f5a50', '#8a3a28', '#2f4c86'][k])
        L, w, tops = shelves[1]
        for k in range(3):
            rope_coil(R, L.p(-.3 + k * .3, 0, tops[1]), r=.12, col='#c9a062', turns=1)
        for k in range(4):
            bucket(R, L.p(-.4 + k * .27, .0, tops[3]), r=.08, h=.14, col=['#8aa0b0', '#b07a44', '#c8322a', '#8aa0b0'][k], n=6, handle=False)
        L, w, tops = shelves[2]
        for k in range(3):
            R.box('M', L.p(-.3 + k * .3, 0, tops[1] + .03), (.18, .09, .06), '#6a7078', ch=0, rot=L.rz, tag='tool kits')
            R.cyl('M', L.p(-.3 + k * .3, 0, tops[3] + .09), .035, .18, '#b8bcc4', n=6, tag='tool kits')
    return R.finish_room()
