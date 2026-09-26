"""Hana's bakery interior (build_interiors.py): checker tiles, teal wainscot, the brick oven "older than the viaduct",
shelves of bread, the shop counter with trays of peach buns, the kneading table with her festival bun recipe, peach
baskets, festival bunting under the beams and a little cafe table by the shop window."""
import math, random
from mathutils import Vector, Matrix
import arch_lib
from interior_lib import *  # noqa: F401,F403
from interior_rooms import builder, shelf_unit, bun, IRON, BRASS

V = Vector
CREAM, TEAL, MUST, ROSE = '#f6e2bc', '#2a8f9a', '#e0a93a', '#e0567a'


def loaf(R, c, kind, rng, rot=0.0, col=None):
    """Bread on the shelves: round loaf, bloomer, bun, peach bun, baguette. Glazed crust on the Paint base."""
    c = V(c)
    crust = col or rng.choice(['#c9803a', '#d99448', '#b86a2e', '#e0a257'])
    if kind == 'round':
        R.sphere('K', c + V((0, 0, .055)), (.1, .1, .07), crust, seg=8, rings=4, tag='bread')
        R.box('K', c + V((0, 0, .118)), (.12, .012, .008), shade(crust, 1.25), ch=0, rot=(0, 0, rot + .5), tag='bread')
    elif kind == 'bloomer':
        R.B('K').append(bm_sphere((.16, .075, .065), 8, 4), arch_lib.xform(c + V((0, 0, .055)), (0, 0, rot)),
                        R.t('K', crust), smooth=80, tag='bread')
        for k in (-1, 0, 1):
            R.box('K', c + Matrix.Rotation(rot, 3, 'Z') @ V((k * .07, 0, .114)), (.012, .1, .008), shade(crust, 1.3),
                  ch=0, rot=(0, 0, rot + .4), tag='bread')
    elif kind == 'bun':
        bun(R, c, r=.05, col=shade(crust, 1.1), blush=None)
    elif kind == 'peach':
        bun(R, c, r=.05, col='#f6d7b0', blush='#f58aa8')
    elif kind == 'baguette':
        R.B('K').append(bm_sphere((.3, .04, .04), 8, 4), arch_lib.xform(c + V((0, 0, .04)), (0, 0, rot)),
                        R.t('K', crust), smooth=80, tag='bread')


@builder('interior-bakery')
def build_bakery():
    W, D, H = 7.6, 6.6, 3.3
    R = Room('interior-bakery', W, D, H, ceil=3.95, cam_top=3.22)
    fire_mat(R)
    rng = random.Random(8)
    fc = R.faces()
    holes = {
        'front': [(W / 2 - .5, W / 2 + .5, 0, 2.2), (W / 2 + 1.0, W / 2 + 3.2, .8, 2.45), (W / 2 - 3.2, W / 2 - 1.0, .8, 2.45)],
        'back': [(W / 2 + 2.25, W / 2 + 3.15, 1.35, 2.35)],
        'right': [(D / 2 - 1.1, D / 2 + .1, 1.35, 2.35)],
        'left': [],
    }
    # ---- walls: teal wainscot, cream plaster, mustard picture rail, corner posts
    posts = {'back': [.06, W - .06], 'front': [.06, W - .06], 'left': [.06, D - .06], 'right': [.06, D - .06]}
    for side, (f, L) in fc.items():
        plaster_wall(R, f, L, 1.12, H + .1, holes[side], CREAM, mottle=.05, us=post_splits(posts[side], .18),
                     zs=[2.55, 2.65])
        wainscot(R, f, L, 0, 1.12, holes[side], TEAL, board=.13, cap=MUST, seed=len(side))
        for u in posts[side]:
            R.fbox(f, 'W', u, H / 2, .04, .18, H, .08, '#8a5a32', ch=.012, tag='posts')
        for a, b in spans(0, L, 2.6, holes[side]):
            R.fbox(f, 'K', (a + b) / 2, 2.6, .02, b - a, .08, .04, MUST, ch=.008, tag='picture rail')
    for y in (-1.6, .6):
        R.box('W', (0, y, H + .14), (W + .1, .24, .28), '#8a5a32', ch=.02, tag='beams')
        for x in (-2.4, 2.4):
            R.box('W', (x, y, H + .5), (.1, .1, .45), '#8a5a32', ch=.01, tag='beams')
    board_ceiling(R, 3.95, col='#e0b070', board=.3, along='x')
    shadow_shell(R, holes)
    # festival bunting along both beams (double-sided flags)
    cols = [ROSE, '#f4efe2', TEAL, MUST]
    for y in (-1.6, .6):
        n = 16
        for i in range(n):
            x0 = -W / 2 + .25 + (W - .5) * i / n
            x1 = x0 + (W - .5) / n * .9
            zt = H + .01 - .12 * math.sin(math.pi * (i + .5) / n)
            R.poly('P', [(x0, y - .13, zt), (x1, y - .13, zt), ((x0 + x1) / 2, y - .13, zt - .2)], cols[i % 4],
                   normal=(0, -1, 0), tag='bunting')
            R.poly('P', [(x1, y - .136, zt), (x0, y - .136, zt), ((x0 + x1) / 2, y - .136, zt - .2)], cols[i % 4],
                   normal=(0, 1, 0), tag='bunting')

    # ---- floor: terracotta and cream checker
    tile_floor(R, -W / 2, W / 2, -D / 2, D / 2, tile=.475, cols=('#c65f3a', '#f1e2c4'), grout='#7a5a44', checker=True)

    # ---- front: door, two shop windows onto the lane, geraniums, the cafe table
    door_inside(R, 'front', W / 2, w=1.0, h=2.2, col=ROSE, frame='#8a5a32')
    ff, Lf = fc['front']
    for k, hole in enumerate(holes['front'][1:]):
        window(R, ff, hole, depth=.24, kind='village', seed=3 + k, frame='#f4efe2', cols=4, rows=2, frame_key='K', nu=12,
               nv=8)
    for x in (-2.1, 2.1):
        plant(R, (x, -D / 2 + .1, .8), r=.09, h=.13, pot='#c65f3a', leaf='#4f9a3a', flowers='#e8506a', seed=int(x * 10))
    tcx, tcy = -2.3, -2.2
    R.cyl('K', (tcx, tcy, .74), .38, .03, '#f4efe2', n=20, ch=.008, tag='cafe')
    R.cyl('M', (tcx, tcy, .37), .03, .72, IRON, n=8, tag='cafe')
    R.cyl('M', (tcx, tcy, .02), .2, .04, IRON, n=12, tag='cafe')
    R.lathe('K', [(0, 0), (.03, 0), (.04, .1), (.025, .16), (0, .16)], (tcx, tcy, .755), '#23889a', n=8, tag='cafe')
    R.sphere('K', (tcx, tcy, .95), .05, '#ffd35a', seg=6, rings=4, tag='cafe')
    for a in (math.pi * .15, math.pi * 1.1):
        cx, cy = tcx + math.cos(a) * .55, tcy + math.sin(a) * .55
        L = Loc((cx, cy), a + math.pi / 2)
        R.box('K', L.p(0, 0, .46), (.36, .36, .04), TEAL, ch=.01, rot=L.rz, tag='cafe')
        for sx in (-1, 1):
            for sy in (-1, 1):
                R.rod('M', L.p(sx * .14, sy * .14, 0), L.p(sx * .14, sy * .14, .45), .012, IRON, n=5, tag='cafe')
        R.box('K', L.p(0, .16, .72), (.34, .03, .3), TEAL, ch=.01, rot=L.rz, tag='cafe')
    R.col_c('cafe', (tcx, tcy, 0), (1.5, 1.5, .8))

    # ---- back: the brick oven with its chimney breast, firewood, peels, sacks
    ox0, ox1, oy0 = -1.5, 1.5, D / 2 - 1.45
    fo = Face((ox0, oy0, 0), (0, -1, 0))        # front of the oven, u runs +X from ox0
    mouth = (1.1, 1.9, .95, 1.5)
    brick_cols = ['#b8553a', '#c4623e', '#a84a32', '#cf7048', '#9c4630']
    courses(R, fo, 0, ox1 - ox0, 0, 1.75, brick_cols, key='P', course=.1, length=(.24, .3), mortar='#d9c8ae',
            holes=[mouth], seed=4, tag='oven bricks')
    for k, fs in enumerate((Face((ox0, D / 2, 0), (-1, 0, 0)), Face((ox1, oy0, 0), (1, 0, 0)))):
        courses(R, fs, 0, D / 2 - oy0, 0, 1.75, brick_cols, key='P', course=.1, length=(.24, .3), mortar='#d9c8ae',
                seed=7 + k, tag='oven bricks')
        R.box('P', fs.p((D / 2 - oy0) / 2, 1.8, .02), (D / 2 - oy0 + .04, .1, .1), '#9c4630', ch=.012, rot=(0, 0, fs.rot),
              tag='oven body')
    R.box('P', ((ox0 + ox1) / 2, (oy0 + D / 2) / 2, 1.76), (ox1 - ox0, D / 2 - oy0, .02), '#9c4630', ch=0, tag='oven body')
    mu0, mu1, mz0, mz1 = mouth
    mc = (mu0 + mu1) / 2
    rr = (mu1 - mu0) / 2
    for k in range(9):
        am = math.pi * (k + .5) / 9
        p = fo.p(mc + math.cos(am) * (rr + .07), mz1 - .1 + math.sin(am) * (rr + .07) * .7, .03)
        R.box('P', p, (.09, .06, .13), shade('#8a3a28', .9 + .2 * rng.random()), ch=.008, rot=(0, -am + math.pi / 2, 0),
              tag='oven arch')
    R.poly('F', [fo.p(mu0, mz0, -.4), fo.p(mu1, mz0, -.4), fo.p(mu1, mz1, -.4), fo.p(mu0, mz1, -.4)], '#b8401a',
           normal=(0, -1, 0), tag='oven fire')
    for k in range(4):
        u = mu0 + .12 + k * .17
        R.cyl('F', fo.p(u, mz0 + .05, -.25), .04, .5, '#f09040' if k % 2 else '#d05a24', n=6, rot=(math.pi / 2, 0, .3 * k),
              tag='oven fire')
    reveal(R.B('P'), fo, mouth, .4, tint=R.t('P', '#3a2018'), sides='lrt')
    R.box('P', fo.p(mc, mz0 - .04, .1), (mu1 - mu0 + .4, .22, .08), '#b0a090', ch=.015, tag='oven sill')
    R.box('M', fo.p(mc + .75, .45, .12), (.55, .05, .5), IRON, ch=.01, rot=(0, .12, 0), tag='oven door')
    R.box('M', fo.p(mc + .75, .52, .155), (.12, .04, .04), BRASS, ch=.006, tag='oven door')
    R.box('M', fo.p(mc - .7, 1.62, .025), (.36, .02, .12), BRASS, ch=.006, tag='oven plaque')
    # chimney breast up to the ceiling, cream with a mustard band, a shelf of spice jars
    R.box('P', (0, D / 2 - .5, 2.6), (2.1, 1.0, 1.7), CREAM, ch=.02, taper=(.72, 1.0), tag='chimney breast')
    R.box('K', (0, D / 2 - 1.0, 1.82), (2.2, .08, .1), MUST, ch=.012, tag='chimney breast')
    R.box('W', (0, D / 2 - 1.05, 2.2), (1.6, .2, .04), '#8a5a32', ch=.008, tag='chimney shelf')
    for k in range(6):
        col = ['#23889a', '#e0a93a', ROSE, '#f4efe2', '#2f8a6a', '#c65f3a'][k]
        R.lathe('K', [(0, 0), (.05, 0), (.055, .1), (.04, .13), (.045, .15), (0, .15)], (-.65 + k * .26, D / 2 - 1.07, 2.22),
                col, n=8, tag='jars')
    R.col('oven', (ox0 - .05, oy0 - .15, -.5), (ox1 + .05, D / 2 + .1, 3.5), view=True)
    R.node('Light_3', fo.p(mc, 1.2, -.05))['fire'] = 1
    # firewood stack right of the oven
    for r in range(4):
        for k in range(5 - r % 2):
            x = 1.85 + k * .19 + (.09 if r % 2 else 0)
            R.cyl('W', (x, D / 2 - .35, .09 + r * .165), .085, .6,
                  lambda cc, nn: R.t('W', '#e8c48a' if abs(nn.y) > .7 else '#8a5a32'), n=7, rot=(math.pi / 2, 0, 0),
                  tag='firewood')
    R.col('firewood', (1.7, D / 2 - .7, -.5), (2.85, D / 2, .8))
    for k, x in enumerate((1.62, 1.72)):
        R.rod('W', (x, D / 2 - .85, .02), (x + .15, D / 2 - .72, 2.0), .02, '#c98f55', n=6, tag='peels')
        R.box('W', (x + .16, D / 2 - .72, 2.15), (.3, .02, .35), '#d9a468', ch=.01, rot=(.1, 0, .05), tag='peels')
    # flour sacks left of the oven
    for k, (x, y, h_) in enumerate(((-2.1, 2.85, .7), (-2.6, 2.9, .75), (-3.1, 2.8, .68), (-2.4, 2.35, .55))):
        sack(R, (x, y, 0), h=h_, r=.24, col='#efe2c4', rot=rng.random(), seed=k)
    R.box('P', (-2.75, 2.3, .14), (.8, .5, .28), '#e8d8b4', ch=.08, seg=2, rot=(0, 0, .25), tag='sacks')
    R.col('sacks', (-3.5, 2.0, -.5), (-1.8, D / 2, .9))

    # ---- left: the bread wall (two teal shelf units) and a tall basket of baguettes
    kinds = ['round', 'bloomer', 'bun', 'peach', 'baguette']
    for k, yc in enumerate((-1.25, .75)):
        L = Loc((-W / 2 + .24, yc), AGAINST['left'])
        tops = shelf_unit(R, L, 1.9, .42, 2.25, 4, TEAL, back='#1f6f78', key='K')
        for i, z in enumerate(tops[1:]):
            x = -.82
            while x < .78:
                kd = kinds[(i + int(x * 7) + k) % len(kinds)] if rng.random() < .8 else 'basket'
                if kd == 'basket':
                    basket(R, L.p(x + .14, -.02, z), r=.13, h=.09, fill='#d99448', n=4, rng=rng, fr=.045)
                    x += .3
                elif kd in ('bun', 'peach'):
                    for j in range(3):
                        loaf(R, L.p(x + .06 + j * .1, -.05 + (j % 2) * .1, z), kd, rng)
                    x += .32
                elif kd == 'baguette':
                    loaf(R, L.p(x + .3, -.02, z), kd, rng, rot=L.r)
                    x += .62
                else:
                    loaf(R, L.p(x + .12, -.02, z), kd, rng, rot=L.r + math.pi / 2 * (kd == 'bloomer'))
                    x += .24
        R.box('K', L.p(0, -.2, 2.08), (1.9, .02, .14), ROSE, ch=0, rot=L.rz, tag='shelf label')
    bc = V((-W / 2 + .35, 2.2, 0))
    R.cyl('W', bc + V((0, 0, .3)), .18, .6, '#c9a062', n=12, ch=.01, tag='baguette basket')
    for k in range(6):
        a = TAU * k / 6
        R.B('K').append(bm_sphere((.04, .04, .32), 6, 4), arch_lib.xform(bc + V((math.cos(a) * .08, math.sin(a) * .08, .75)),
                        (math.sin(a) * .12, -math.cos(a) * .12, 0)), R.t('K', '#d99448'), smooth=80, tag='bread')
    R.col('bread wall', (-W / 2 - .2, -2.25, -.5), (-W / 2 + .47, 1.8, 2.3), view=True)
    R.col_c('baguettes', (bc.x, bc.y, 0), (.42, .42, .9))

    # ---- centre: kneading table with dough, flour, a tray of peach buns and the recipe spot
    tx0, tx1, ty0, ty1, tz = -1.35, .95, -.05, 1.1, .9
    R.box('W', ((tx0 + tx1) / 2, (ty0 + ty1) / 2, tz - .04), (tx1 - tx0, ty1 - ty0, .08), '#d9a468', ch=.015, tag='table')
    for x in (tx0 + .08, tx1 - .08):
        for y in (ty0 + .08, ty1 - .08):
            R.box('W', (x, y, (tz - .08) / 2), (.08, .08, tz - .08), '#8a5a32', ch=.01, tag='table')
    R.box('W', ((tx0 + tx1) / 2, (ty0 + ty1) / 2, .2), (tx1 - tx0 - .1, ty1 - ty0 - .1, .03), '#8a5a32', ch=.006, tag='table')
    for k, x in enumerate((-1.0, -.55, -.1, .4)):
        R.lathe('K', [(0, 0), (.12, 0), (.18, .1), (.17, .11), (0, .03)], (x, (ty0 + ty1) / 2, .22),
                ['#f4efe2', TEAL, MUST, '#f4efe2'][k], n=12, tag='bowls')
    R.poly('P', [(-1.2, .1, tz + .006), (-.3, .05, tz + .006), (-.25, .7, tz + .006), (-1.15, .8, tz + .006)], '#fbf6ea',
           normal=(0, 0, 1), tag='flour')
    for k in range(5):
        R.sphere('K', (-1.0 + (k % 3) * .2, .25 + (k // 3) * .25, tz + .045), (.08, .08, .05), '#f6e6c8', seg=8, rings=5,
                 tag='dough')
    R.cyl('W', (-.55, .72, tz + .035), .035, .5, '#e8c48a', n=8, rot=(0, math.pi / 2, .2), tag='rolling pin')
    R.box('W', (.25, .45, tz + .012), (.5, .36, .024), '#8a5a32', ch=.006, tag='tray')
    for j in range(6):
        loaf(R, (.1 + (j % 3) * .14, .38 + (j // 3) * .15, tz + .025), 'peach', rng)
    R.box('W', (.72, .9, tz + .06), (.16, .1, .12), ROSE, ch=.01, tag='recipe box')
    R.node('Item_keepsake', (.62, .15, tz + .26))
    R.col_c('table', ((tx0 + tx1) / 2, (ty0 + ty1) / 2, 0), (tx1 - tx0 + .04, ty1 - ty0 + .04, tz))
    pendant(R, (-.2, .52, 2.35), r=.25, col=TEAL, cord=H + .6 - 2.35)
    R.node('Light_1', (-.2, .52, 2.2))

    # ---- right: the shop counter with trays of buns, the scale, bell and till; tins and jars behind
    cx0, cx1, cy0, cy1, cz = 1.85, 2.55, -2.45, 1.05, .95
    R.box('K', ((cx0 + cx1) / 2, (cy0 + cy1) / 2, cz / 2), (cx1 - cx0, cy1 - cy0, cz - .05), TEAL, ch=.02, tag='counter')
    for k in range(5):
        y = cy0 + .35 + k * (cy1 - cy0 - .7) / 4
        R.box('K', (cx0 - .012, y, .5), (.02, .55, .55), shade(TEAL, 1.15), ch=.008, tag='counter')
    R.box('K', (cx0 - .016, (cy0 + cy1) / 2, .12), (.03, cy1 - cy0, .1), MUST, ch=.006, tag='counter')
    R.box('W', ((cx0 + cx1) / 2 - .03, (cy0 + cy1) / 2, cz), (cx1 - cx0 + .12, cy1 - cy0 + .08, .06), '#d9a468', ch=.012,
          tag='counter top')
    for k, y in enumerate((-2.05, -1.35, -.65)):
        R.box('W', (2.2, y, cz + .045), (.46, .56, .03), '#8a5a32', ch=.006, tag='trays')
        for j in range(6):
            loaf(R, (2.07 + (j % 2) * .25, y - .18 + (j // 2) * .18, cz + .06), ['peach', 'bun', 'peach'][k], rng)
    sc = V((2.2, .05, cz + .03))
    R.box('M', sc + V((0, 0, .06)), (.2, .16, .12), '#c8322a', ch=.02, tag='scale')
    R.cyl('M', sc + V((0, 0, .14)), .12, .02, BRASS, n=14, tag='scale')
    R.cyl('K', sc + V((-.105, 0, .07)), .045, .006, '#f4efe2', n=12, rot=(0, math.pi / 2, 0), tag='scale')
    R.lathe('M', [(0, 0), (.06, 0), (.06, .02), (.035, .05), (.04, .09), (.012, .1), (.012, .13), (0, .14)],
            (2.25, .55, cz + .03), BRASS, n=12, tag='bell')
    R.box('W', (2.2, .85, cz + .1), (.3, .22, .16), '#6b4027', ch=.015, tag='till')
    R.box('M', (2.05, .85, cz + .14), (.01, .16, .05), BRASS, ch=0, tag='till')
    R.col('counter', (cx0 - .05, cy0 - .05, -.5), (cx1 + .05, cy1 + .05, cz + .1))
    fr, Lr = fc['right']
    for z in (1.05, 1.45, 1.85):
        R.box('W', (W / 2 - .15, -.8, z), (.26, 2.8, .035), '#8a5a32', ch=.006, tag='tin shelves')
        y = -2.1
        while y < .5:
            col = rng.choice([TEAL, ROSE, MUST, '#f4efe2', '#c8322a', '#2f4c86'])
            if rng.random() < .6:
                R.cyl('K', (W / 2 - .15, y, z + .088), .055, .14, col, n=8, tag='tins')
            else:
                R.lathe('K', [(0, 0), (.055, 0), (.055, .12), (.035, .15), (0, .15)], (W / 2 - .15, y, z + .018),
                        rng.choice(['#e8f2f0', '#f0c860', '#f4a0a8']), n=7, tag='jars')
            y += rng.uniform(.14, .2)
    R.col('tins', (W / 2 - .3, -2.3, -.5), (W / 2, .7, 2.0))
    ub = R.u_of('right', y=1.6)
    R.fbox(fr, 'W', ub, 1.9, .015, .98, .78, .03, '#8a5a32', ch=.008, tag='chalkboard')
    R.fbox(fr, 'K', ub, 1.9, .035, .9, .7, .012, '#2a2e2a', ch=0, tag='chalkboard')
    for k in range(5):
        R.fbox(fr, 'P', ub + rng.uniform(-.08, .08), 2.1 - k * .11, .046, rng.uniform(.3, .6), .025, .004, '#f4efe2',
               tag='chalkboard')
    window(R, fr, holes['right'][0], depth=.24, kind='village', seed=9, frame='#f4efe2', cols=2, rows=2, frame_key='K')
    window(R, fc['back'][0], holes['back'][0], depth=.24, kind='village', seed=12, frame='#f4efe2', cols=2, rows=2,
           frame_key='K')
    pendant(R, (2.2, -1.0, 2.35), r=.25, col=ROSE, cord=H + .6 - 2.35)
    R.node('Light_2', (2.2, -1.0, 2.2))

    # ---- peach baskets on the floor by the counter
    for k, (x, y) in enumerate(((1.35, -2.2), (1.3, -1.55), (1.4, -.3))):
        basket(R, (x, y, 0), r=.25, h=.22, fill='#ff9a6a', blush='#ff6a7a', n=6, rng=rng, fr=.07, handle=k == 1)
    R.col('baskets', (1.05, -2.5, -.5), (1.65, -1.25, .62))
    R.col_c('basket3', (1.4, -.3, 0), (.56, .56, .3))

    R.node('Spawn', (0, -1.05, 0))
    R.node('Exit', (0, -D / 2 + .55, 0))
    R.shell_cols(surface='stone')
    return R.finish_room()
