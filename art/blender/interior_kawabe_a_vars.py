"""Decor variants of Kawabe house A (Var_1 young family, Var_2 elderly couple, Var_3 fisher's home).

Each variant is a pivot group holding only small decor (no colliders), placed on or against the base room's furniture,
so the three look different while the layout and every collider stay the same."""
import math, random
from mathutils import Vector
from interior_lib import *  # noqa: F401,F403
from interior_rooms import bun, IRON, BRASS, POST
from interior_kawabe_common import *  # noqa: F401,F403

V = Vector
CHEST_TOP = .26 + .974        # tansu top surface
SHELF_Z = (1.57, 2.04)        # display shelf board surfaces
COUNTER_Z = .86 + .05 + .025


def common_decor(e, rug_col, rug_border, rug_stripe, cushions, curtain, laundry):
    """Things every variant has but in its own colours: rug, cushions, curtains, laundry."""
    R, TS, tc = e['R'], e['TS'], e['tc']
    fc = e['fc']
    rug(R, -1.7, -.4, .7, 1.5, TS, rug_col, rug_border, stripe=rug_stripe)
    for (dx, dy, rot), col in zip(((-.88, 0, .05), (0, -.82, .3), (.9, .02, -.2)), cushions):
        cushion_lean(R, (tc.x + dx, tc.y + dy, TS), s=.5, col=col, rot=rot)
    ff = fc['front'][0]
    for hole in ((4.0, 5.4, 1.05, 2.15), (.6, 2.0, 1.05, 2.15)):
        window_curtain(R, ff, hole[0] - .02, hole[1] + .02, hole[2] + .06, hole[3] - .05, curtain, d=.1, folds=3)
    for i, (x, kind, col, col2, y) in enumerate(laundry):
        hanger_cloth(R, (x, y, 2.43), kind, col, w=.34 if kind != 'sock' else .2,
                     h=.5 if kind in ('shirt', 'pants') else .42, rot=0.0, col2=col2)


def var_family(e):
    R, TS, tc, top, fc, rng = e['R'], e['TS'], e['tc'], e['top'], e['fc'], random.Random(11)
    with group(R, 'Var_1'):
        common_decor(e, '#f6c85a', '#e8644a', '#fff1c9', ['#f0b429', '#e8644a', '#4aa3df'], '#fbe38a',
                     [(-1.65, 'shirt', '#f6c85a', '#e8644a', 1.45), (-1.2, 'shirt', '#6ab8e8', '#2d78c8', 1.65),
                      (-.5, 'sock', '#e8644a', '#fff1c9', 1.45), (.1, 'pants', '#4aa3df', '#2d78c8', 1.65)])
        # table: cloth, lunch plates with rice balls, a kid's cup, mikan
        R.cyl('P', (tc.x, tc.y, top + .004), .4, .008, '#fff3c8', n=12, tag='table cloth')
        plate(R, (tc.x - .12, tc.y - .12, top + .008), .09, '#f4efe2', rim='#e8644a')
        plate(R, (tc.x + .12, tc.y - .14, top + .008), .09, '#f4efe2', rim='#4aa3df')
        onigiri(R, (tc.x - .12, tc.y - .12, top + .02), .2)
        onigiri(R, (tc.x + .12, tc.y - .14, top + .02), -.3)
        R.cyl('K', (tc.x + .22, tc.y + .14, top + .05), .033, .1, '#f06a8a', n=8, tag='kid cup')
        for k in range(3):
            R.sphere('K', (tc.x - .2 + k * .045, tc.y + .17 + (k % 2) * .03, top + .035), .035,
                     ['#f08a24', '#f08a24', '#e8641a'][k], seg=5, rings=3, tag='fruit')
        # the kids' corner: round rug, blocks, a toy train, a plush bear and a picture book
        R.cyl('P', (-1.7, -.85, TS + .005), .46, .01, '#8fd0e8', n=12, tag='kids rug')
        R.cyl('P', (-1.7, -.85, TS + .012), .34, .006, '#fff1c9', n=12, tag='kids rug')
        blocks(R, (-1.95, -.98, 0), rng, n=5, z=TS)
        toy_train(R, (-1.62, -.62, TS), rot=.35)
        plush_bear(R, (-1.36, -.98, TS), s=1.15, col='#c98a52', rot=2.4)
        R.box('P', (-1.25, -.6, TS + .008), (.2, .15, .016), '#e8644a', ch=0, rot=(0, 0, .5), tag='picture book')
        # tansu top: toy basket, family photo, rubber duck
        basket_lean(R, (-2.75, -1.18, CHEST_TOP), r=.15, h=.12, fill='#e8644a', n=3, rng=rng, fr=.045)
        R.box('W', (-2.9, -.6, CHEST_TOP + .1), (.03, .22, .2), '#c9a062', ch=0, rot=(0, -.12, 0), tag='photo')
        ell(R, 'K', (-2.78, -.7, CHEST_TOP + .04), (.04, .035, .035), '#ffd23a', tag='duck')
        R.box('K', (-2.78, -.65, CHEST_TOP + .08), (.04, .04, .035), '#ffd23a', ch=0, tag='duck')
        # wall: drawings by the kids, an alphabet poster, paper garland on the beam
        fl = fc['left'][0]
        for k, (y, z, w, h, kind, col) in enumerate(((-1.22, 1.86, .3, .22, 'landscape', '#f06a8a'),
                                                     (-.78, 1.72, .22, .3, 'landscape', '#4aa3df'))):
            picture(R, fl, R.u_of('left', y=y), z, w, h, frame=col, kind=kind, seed=20 + k)
        R.fbox(fl, 'P', R.u_of('left', y=-.6), 1.42, .02, .26, .3, .01, '#fbe9a8', tag='poster')
        for i in range(4):
            R.fbox(fl, 'P', R.u_of('left', y=-.6) + (i % 2 - .5) * .1, 1.42 + (.5 - i // 2) * .1, .03, .06, .06, .006,
                   ['#e8644a', '#4aa3df', '#3f9a4a', '#f0b429'][i], tag='poster')
        paper_stars(R, (-2.8, -1.03, 3.28), (1.2, -1.03, 3.28), 10, rng)
        # back shelf: books, a bear, blocks, a little plant
        z0, z1 = SHELF_Z
        book_row(R, -.5, -.2, 2.35, z0, depth=.18, rng=rng, h=(.14, .22),
                 palette=('#e8644a', '#4aa3df', '#f0b429', '#3f9a4a'))
        plush_bear(R, (.3, 2.38, z0), s=1.0, col='#e8b87a', rot=math.pi)
        blocks(R, (-.45, 2.36, 0), rng, n=3, z=z1)
        plant_lean(R, (.5, 2.36, z1), r=.07, h=.1, pot='#f06a8a', leaf='#4f9a3a', flowers='#fff1c9', seed=5)
        # kitchen: colourful plates in the dish rack
        cc = (1.98, 2.19)
        for k in range(2):
            R.cyl('K', (cc[0] + .3, cc[1] + .05, COUNTER_Z + .1), .09, .014, ['#f06a8a', '#4aa3df'][k], n=8,
                  rot=(1.25, 0, .4 * k), tag='dish rack')
        R.box('W', (cc[0] + .3, cc[1] + .05, COUNTER_Z + .02), (.26, .2, .04), '#c9a062', ch=0, tag='dish rack')
        # genkan: kids' yellow boots and a little rain coat on the peg board
        for k, x in enumerate((1.25, 1.4)):
            R.box('K', (x, -2.26, .08), (.07, .1, .16), '#ffd23a', ch=0, tag='kid boots')
        fr = fc['right'][0]
        ub = R.u_of('right', y=-1.9)
        R.fbox(fr, 'P', ub - .36, 1.28, .09, .26, .48, .02, '#ffd23a', ch=0, tag='raincoat')
        R.fbox(fr, 'P', ub - .12, 1.4, .08, .2, .22, .02, '#e8644a', ch=0, tag='bag')
        R.lathe('P', [(0, .12), (.07, .11), (.1, .05), (.2, .02), (.21, 0), (0, 0)], fr.p(ub + .12, 1.5, .12), '#ffd23a',
                n=8, rot=(math.pi / 2, 0, 0), tag='hat')


def var_elders(e):
    R, TS, tc, top, fc, rng = e['R'], e['TS'], e['tc'], e['top'], e['fc'], random.Random(22)
    with group(R, 'Var_2'):
        common_decor(e, '#34457a', '#c9a062', '#e8dcc0', ['#8a4a6a', '#5a6a4a', '#8a4a6a'], '#c7b4dc',
                     [(-1.6, 'robe', '#2d4f8a', '#e8e4d8', 1.45), (-1.1, 'robe', '#f1ece0', '#c8322a', 1.65),
                      (-.55, 'towel', '#e8e4d8', '#2d4f8a', 1.45), (.1, 'sheet', '#f4f1e8', '#e8e4d8', 1.65)])
        # table: tea set, sweets, reading glasses and the folded paper
        tea_tray(R, (tc.x - .02, tc.y + .02, top), rot=.2, cols=('#2d4f8a', '#e8e0ce'), cups=1)
        plate(R, (tc.x + .22, tc.y - .12, top), .1, '#e8e0ce', rim='#8a4a6a')
        for k in range(2):
            bun(R, (tc.x + .2 + (k - .5) * .07, tc.y - .12, top + .012), r=.035, col='#d99448', blush=None)
        R.box('P', (tc.x - .22, tc.y - .2, top + .008), (.22, .16, .016), '#e8e4d8', ch=0, rot=(0, 0, .35), tag='paper')
        R.box('M', (tc.x - .3, tc.y + .15, top + .008), (.07, .03, .006), BRASS, ch=0, rot=(0, 0, .3), tag='glasses')
        # butsudan altar on the tansu: lacquered shrine, gold interior, photo, incense, candle, flowers
        ax, ay, az = -2.8, -.88, CHEST_TOP
        R.box('K', (ax, ay, az + .26), (.34, .5, .52), '#2a1a14', ch=0, tag='altar')
        R.box('K', (ax, ay, az + .55), (.4, .56, .05), '#3a2418', ch=0, tag='altar')
        R.box('K', (ax + .16, ay, az + .26), (.012, .4, .42), '#d9a441', ch=0, tag='altar gold')
        R.lathe('M', [(0, 0), (.04, 0), (.03, .08), (.02, .16), (0, .2)], (ax + .1, ay, az + .02), BRASS, n=6,
                tag='altar buddha')
        for s_ in (-1, 1):
            R.box('K', (ax + .22, ay + s_ * .2, az + .26), (.012, .2, .4), '#2a1a14', ch=0, rot=(0, 0, s_ * .9),
                  tag='altar doors')
        R.box('W', (ax + .24, ay - .12, az + .09), (.014, .1, .13), '#c9a062', ch=0, tag='altar photo')
        R.cyl('M', (ax + .27, ay + .08, az + .03), .045, .05, '#3a3a42', n=8, tag='incense')
        R.cyl('P', (ax + .27, ay + .22, az + .06), .016, .08, '#f8f0d8', n=6, tag='candle')
        R.sphere('G', (ax + .27, ay + .22, az + .12), .012, '#fff0b0', seg=4, rings=2, tag='candle')
        R.lathe('K', [(0, 0), (.025, 0), (.035, .06), (.02, .1), (0, .12)], (ax + .27, ay - .22, az), '#e8e0ce', n=6,
                tag='altar vase')
        for k in range(2):
            R.sphere('K', (ax + .27 + (k - .5) * .04, ay - .22, az + .16 + .02 * k), .026, ['#f4f1e8', '#f0a0b0'][k],
                     seg=4, rings=2, tag='altar flowers')
        # wall: a hanging scroll and a wall clock
        fl = fc['left'][0]
        us = R.u_of('left', y=-1.15)
        R.fbox(fl, 'P', us, 1.82, .025, .3, .9, .012, '#34457a', ch=0, tag='scroll')
        R.fbox(fl, 'P', us, 1.84, .035, .22, .74, .008, '#efe4c8', ch=0, tag='scroll')
        R.poly('K', [fl.p(us - .08, 1.55, .048), fl.p(us + .08, 1.55, .048), fl.p(us, 1.88, .048)], '#4a5a6a',
               normal=fl.n, tag='scroll')
        wall_clock(R, fl, R.u_of('left', y=-.62), 1.9, r=.15)
        # the cat on its cushion and the knitting basket
        R.box('P', (-1.9, -.9, TS + .03), (.34, .3, .06), '#c8473a', ch=0, tag='cat cushion')
        plush_cat(R, (-1.9, -.9, TS + .06), col='#d99a58', rot=.7)
        basket_lean(R, (-1.4, -1.0, TS), r=.17, h=.12, fill=None, n=2, rng=rng)
        for k, col in enumerate(('#c8322a', '#2d78c8', '#f0b429')):
            R.sphere('P', (-1.4 + (k - 1) * .08, -1.0 + (k % 2) * .05, TS + .15), .055, col, seg=5, rings=3, tag='yarn')
        # back shelf: bonsai, tea canisters, a radio, framed photo
        z0, z1 = SHELF_Z
        plant_lean(R, (-.35, 2.38, z0), r=.1, h=.07, pot='#6b4a2a', leaf='#3f7f3a', seed=7)
        for k, col in enumerate(('#8a3a2a', '#2f6a5a')):
            R.cyl('K', (.0 + k * .13, 2.38, z0 + .07), .045, .14, col, n=8, tag='canisters')
        R.box('W', (.62, 2.38, z0 + .09), (.26, .12, .18), '#6b4027', ch=0, tag='radio')
        R.box('K', (.62, 2.31, z0 + .09), (.2, .01, .1), '#c9a062', ch=0, tag='radio')
        R.box('W', (-.2, 2.38, z1 + .09), (.2, .03, .17), '#c9a062', ch=0, tag='photo')
        R.cyl('K', (.3, 2.38, z1 + .06), .06, .12, '#4a6a8a', n=8, tag='jar')
        # kitchen: a pickling crock
        R.lathe('K', [(0, 0), (.1, 0), (.14, .1), (.14, .2), (.1, .26), (0, .28)], (2.3, 2.2, COUNTER_Z), '#6b5a4a', n=8,
                tag='crock')
        # genkan: slippers by the step, walking cane in the stand, a shawl and sun hat on the pegs
        for x in (-.55, -.4):
            R.box('K', (x, -1.62, .03), (.1, .24, .04), '#8a4a6a', ch=0, tag='slippers')
        R.rod('W', (.97, -2.18, .15), (.97, -2.18, 1.0), .014, '#6b4027', n=4, tag='cane')
        R.box('W', (.93, -2.18, 1.0), (.1, .03, .03), '#6b4027', ch=0, tag='cane')
        fr = fc['right'][0]
        ub = R.u_of('right', y=-1.9)
        R.fbox(fr, 'P', ub - .36, 1.25, .09, .3, .6, .02, '#8a4a6a', ch=0, tag='shawl')
        R.lathe('P', [(0, .12), (.07, .11), (.1, .05), (.2, .02), (.21, 0), (0, 0)], fr.p(ub + .12, 1.5, .12), '#e8d28a',
                n=8, rot=(math.pi / 2, 0, 0), tag='hat')


def var_fisher(e):
    R, TS, tc, top, fc, rng = e['R'], e['TS'], e['tc'], e['top'], e['fc'], random.Random(33)
    with group(R, 'Var_3'):
        common_decor(e, '#2a7f86', '#e08a3a', '#f4e6c4', ['#2d4f8a', '#2f8a8a', '#2d4f8a'], '#2d4f8a',
                     [(-1.65, 'shirt', '#2d4f8a', '#1f386a', 1.45), (-1.2, 'shirt', '#f1ece0', '#2d4f8a', 1.65),
                      (-.7, 'pants', '#34457a', '#1f386a', 1.45), (-.1, 'towel', '#e08a3a', '#f4f1e8', 1.65)])
        # table: grilled fish, rice bowls, sake
        plate(R, (tc.x - .12, tc.y - .14, top), .12, '#f4efe2', rim='#2f4c86')
        grilled_fish(R, (tc.x - .12, tc.y - .14, top + .02), rot=.15, L=.2)
        plate(R, (tc.x + .14, tc.y - .1, top), .12, '#f4efe2', rim='#2f4c86')
        grilled_fish(R, (tc.x + .14, tc.y - .1, top + .02), rot=-.2, L=.2, col='#d99448')
        bowl(R, (tc.x - .2, tc.y + .17, top), r=.06, col='#e8e0ce', fill='#f8f4ea')
        bowl(R, (tc.x + .02, tc.y + .2, top), r=.06, col='#e8e0ce', fill='#f8f4ea')
        tokkuri(R, (tc.x + .24, tc.y + .12, top))
        # wall: a draped net with cork floats, a rack of fishing rods
        fl = fc['left'][0]
        wall_net(R, fl, R.u_of('left', y=-1.36), R.u_of('left', y=-.46), 1.35, 2.35, d=.03, seed=3)
        for z in (1.62, 2.0, 2.38):
            for y in (-2.25, -1.62):
                R.box('W', (-3 + .05, y, z - .02), (.1, .04, .04), POST, ch=0, tag='rod rack')
            fish_rod(R, (-2.92, -2.38, z + .02), (-2.92, -1.46, z + .02),
                     col=['#9a7a3a', '#6a8a3a', '#b08a4a'][int(z * 2) % 3])
        # tansu top: tackle box, lure jar, oil lantern
        R.box('K', (-2.78, -1.1, CHEST_TOP + .1), (.3, .2, .2), '#d8342c', ch=0, tag='tackle box')
        R.box('K', (-2.78, -1.1, CHEST_TOP + .21), (.32, .22, .03), '#a82a22', ch=0, tag='tackle box')
        R.lathe('K', [(0, 0), (.05, 0), (.06, .06), (.06, .16), (0, .18)], (-2.8, -.6, CHEST_TOP), '#cfe8e8', n=6,
                tag='lure jar')
        for k, col in enumerate(('#f08a24', '#d8342c')):
            R.sphere('K', (-2.8, -.6, CHEST_TOP + .06 + k * .05), .025, col, seg=4, rings=3, tag='lures')
        R.cyl('M', (-2.8, -.74, CHEST_TOP + .02), .05, .04, IRON, n=8, tag='lantern')
        R.cyl('G', (-2.8, -.74, CHEST_TOP + .1), .045, .1, '#ffe2a0', n=8, tag='lantern')
        # drying fish on a pole over the kitchen, glass floats along the beam
        R.rod('W', (1.5, .55, 2.55), (2.6, .55, 2.55), .02, '#c8c060', n=4, tag='fish pole')
        for x in (1.6, 2.5):
            R.rod('W', (x, .55, 2.55), (x, .55, 3.2), .006, '#7a5a3a', n=3, tag='fish pole')
        for k in range(5):
            dried_fish(R, (1.64 + k * .2, .55 + (k % 2) * .03, 2.54), L=.16 + .03 * (k % 3),
                       col=['#cdd6dc', '#b8c6cc', '#dfe4e0'][k % 3])
        a, b = V((-2.8, -1.03, 3.28)), V((1.2, -1.03, 3.28))
        R.rod('W', a, b, .005, '#7a5a3a', n=3, tag='float line')
        for k in range(5):
            t = (k + .5) / 5
            p = a.lerp(b, t) + V((0, 0, -.1 * math.sin(math.pi * t)))
            R.sphere('K', p + V((0, 0, -.1)), .07, ['#4fb8a8', '#5a9ad8', '#8ad0c0'][k % 3], seg=5, rings=3,
                     tag='glass floats')
        # back shelf: cork floats, a rope coil, bait jars, a toy boat
        z0, z1 = SHELF_Z
        for k in range(4):
            float_ball(R, (-.4 + k * .1, 2.38, z0 + .035), r=.035, col=['#e8352c', '#f4efe2', '#e0a93a'][k % 3])
        R.torus('W', (.2, 2.36, z0 + .05), .1, .035, '#c9b48a', maj=8, mn=3, tag='rope coil')
        R.box('K', (.7, 2.38, z0 + .04), (.22, .08, .06), '#2d4f8a', ch=0, tag='boat')
        R.poly('P', [(.62, 2.38, z0 + .07), (.78, 2.38, z0 + .07), (.7, 2.38, z0 + .22)], '#f4efe2',
               normal=(0, -1, 0), tag='boat')
        R.poly('P', [(.78, 2.38, z0 + .07), (.62, 2.38, z0 + .07), (.7, 2.38, z0 + .22)], '#f4efe2',
               normal=(0, 1, 0), tag='boat')
        for k in range(2):
            R.lathe('K', [(0, 0), (.04, 0), (.045, .06), (0, .09)], (-.35 + k * .12, 2.38, z1), '#cfe8e8', n=6,
                    tag='bait jars')
        # genkan: bucket with a catch, straw raincoat and hat on the pegs
        R.lathe('K', [(0, 0), (.14, 0), (.17, .3), (.15, .3), (0, .02)], (2.85, -2.15, 0), '#6a8a9a', n=8, tag='bucket')
        grilled_fish(R, (2.85, -2.15, .27), rot=.6, L=.2, col='#9ab0b8')
        fr = fc['right'][0]
        ub = R.u_of('right', y=-1.9)
        R.B('P').lathe([(0, .5), (.06, .46), (.17, .26), (.25, .02), (.0, .0)], fr.p(ub - .36, 1.2, .16),
                       tint=R.t('P', '#c9a85c'), n=8, tag='mino')
        R.lathe('P', [(0, .12), (.07, .11), (.1, .05), (.2, .02), (.21, 0), (0, 0)], fr.p(ub + .12, 1.5, .12), '#c9a85c',
                n=8, rot=(math.pi / 2, 0, 0), tag='hat')
        R.box('W', fr.p(ub - .1, 1.2, .1), (.2, .16, .15), '#b08a4a', ch=0, tag='creel')
