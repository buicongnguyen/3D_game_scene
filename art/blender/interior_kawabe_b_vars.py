"""Decor variants of Kawabe house B: Var_1 young family with a baby, Var_2 retired teacher, Var_3 tailor's home.

Pivot groups of small decor only (no colliders); everything sits on or against the base room's furniture."""
import math, random
from mathutils import Vector
from interior_lib import *  # noqa: F401,F403
from interior_rooms import IRON, BRASS, POST
from interior_kawabe_common import *  # noqa: F401,F403

V = Vector
SOFA_SEAT = .55
COFFEE_TOP = .40 + .02
DINE_TOP = .755
BUF_TOP = .85 + .024
CHEST_TOP = .9 + .024
SEW_TOP = .785
LOFT = 2.2 + .03


def book_blocks(R, L, x0, x1, z, rng, palette, hmax=.28, hmin=.16, depth=.2, w=(.05, .09)):
    """Chunky books standing on a shelf board (local x from x0 to x1): one 12-triangle box per book."""
    x = x0
    while x < x1 - .05:
        bw = rng.uniform(*w)
        h = rng.uniform(hmin, hmax)
        R.box('K', L.p(x + bw / 2, -.03, z + h / 2), (bw, depth, h), rng.choice(palette), ch=0, rot=L.rz, tag='books')
        x += bw + .004


def seat_pads(R, e, cols):
    for (x, y), col in zip(((1.25, 1.8), (1.95, 1.8), (1.25, .0), (1.95, .0)), cols):
        R.box('P', (x, y, .475), (.4, .4, .045), col, ch=0, tag='seat pads')


def around_irori(R, e, cols):
    ic = e['ic']
    for (dx, dy, rot), col in zip(((-.88, 0, .05), (.88, 0, .2), (0, .88, .3), (0, -.88, -.1)), cols):
        cushion_lean(R, (ic.x + dx, ic.y + dy, 0), s=.5, col=col, rot=rot)


def sofa_rug(R, col, border, stripe):
    rug(R, 1.2, -2.7, 3.6, -.5, 0, col, border, stripe=stripe)


def pillow(R, c, col, rot=0.0, s=.3):
    R.box('P', V(c) + V((0, 0, .08)), (s, .1, s * .9), col, ch=.03, rot=(.0, -.25, rot), tag='pillow')


def var_family_b(e):
    R, rng, fc, dt, ct = e['R'], random.Random(5), e['fc'], e['dt'], e['ct']
    BL, tops = e['BL'], e['tops']
    with group(R, 'Var_1'):
        around_irori(R, e, ['#f0b429', '#e8644a', '#4aa3df', '#f06a8a'])
        seat_pads(R, e, ['#f0b429', '#e8644a', '#4aa3df', '#f06a8a'])
        sofa_rug(R, '#f6c85a', '#e8644a', '#fff1c9')
        # sofa: yellow stripy blanket, pillows, a bear
        R.box('P', (2.4, -1.17, SOFA_SEAT + .005), (1.5, .5, .03), '#f6d36a', ch=0, tag='blanket')
        R.box('P', (2.4, -1.17, SOFA_SEAT + .022), (1.5, .08, .006), '#e8644a', ch=0, tag='blanket')
        pillow(R, (1.85, -1.4, SOFA_SEAT + .05), '#e8644a', rot=.1)
        pillow(R, (2.75, -1.4, SOFA_SEAT + .05), '#4aa3df', rot=-.1)
        # coffee table: baby bottle and a picture book
        R.cyl('K', (ct.x - .2, ct.y, COFFEE_TOP + .06), .03, .12, '#bfe8f0', n=6, tag='bottle')
        R.box('P', (ct.x + .15, ct.y - .02, COFFEE_TOP + .01), (.24, .18, .02), '#e8644a', ch=0, rot=(0, 0, .3), tag='book')
        # play mat with blocks, a train, a ball and a mobile hanging over it
        for k, col in enumerate(('#e8644a', '#4aa3df', '#f0b429', '#3f9a4a')):
            R.box('K', (-.6 + (k % 2) * .52, -2.1 + (k // 2) * .52, .012), (.5, .5, .024), col, ch=0, tag='play mat')
        blocks(R, (-.7, -2.05, 0), rng, n=5, z=.024)
        toy_train(R, (-.45, -1.7, .024), rot=-.4)
        plush_bear(R, (-.2, -1.95, .024), s=1.1, col='#e8b87a', rot=1.2)
        R.sphere('K', (-.05, -2.2, .09), .06, '#ef5a4a', seg=5, rings=3, tag='ball')
        R.rod('W', (-.2, -1.8, 3.6), (-.2, -1.8, 2.45), .006, '#7a5a3a', n=3, tag='mobile')
        R.rod('W', (-.42, -1.8, 2.45), (.02, -1.8, 2.45), .008, '#c9a062', n=3, tag='mobile')
        R.rod('W', (-.2, -2.02, 2.45), (-.2, -1.58, 2.45), .008, '#c9a062', n=3, tag='mobile')
        for dx, dy, col in ((-.42, 0, '#f06a8a'), (.02, 0, '#4aa3df'), (0, .22, '#3f9a4a')):
            p = V((-.2 + dx, -1.8 + dy, 2.45))
            R.rod('W', p, p + V((0, 0, -.18)), .003, '#7a5a3a', n=3, tag='mobile')
            R.sphere('K', p + V((0, 0, -.23)), .045, col, seg=5, rings=3, tag='mobile')
        # dining table: sunny runner, plates with rice balls, a juice cup and a little vase
        R.box('P', (dt.x, dt.y, DINE_TOP + .004), (1.3, .3, .008), '#fbe38a', ch=0, tag='runner')
        for k, (dx, col) in enumerate(((-.45, '#e8644a'), (.0, '#4aa3df'), (.45, '#f0b429'))):
            plate(R, (dt.x + dx, dt.y - .26, DINE_TOP + .008), .1, '#f4efe2', rim=col)
        onigiri(R, (dt.x - .45, dt.y - .26, DINE_TOP + .022), .2)
        onigiri(R, (dt.x + .45, dt.y - .26, DINE_TOP + .022), -.3)
        R.cyl('K', (dt.x + .12, dt.y + .22, DINE_TOP + .05), .033, .1, '#f06a8a', n=6, tag='cup')
        plant_lean(R, (dt.x - .1, dt.y + .02, DINE_TOP), r=.06, h=.09, pot='#f06a8a', leaf='#4f9a3a', flowers='#fff1c9', seed=3)
        # bookcase: toys, a toy box, picture books
        for i in (1, 2, 3):
            z = tops[i]
            if i == 1:
                blocks(R, BL.p(-.55, -.05, 0), rng, n=4, z=z)
                R.sphere('K', BL.p(.2, -.03, z + .06), .06, '#ef5a4a', seg=5, rings=3, tag='ball')
            elif i == 2:
                book_blocks(R, BL, -.7, .1, z, rng, ('#e8644a', '#4aa3df', '#f0b429', '#3f9a4a'), hmax=.26, hmin=.16,
                            w=(.08, .12))
            else:
                book_blocks(R, BL, -.7, .7, z, rng, ('#e8644a', '#4aa3df', '#f0b429', '#3f9a4a'), hmax=.3, hmin=.18,
                            w=(.09, .14))
        basket_lean(R, BL.p(0, -.03, tops[0]), r=.24, h=.2, fill='#e8644a', n=3, rng=rng, fr=.06)
        # walls: kids' drawings and a height chart on the right wall, bunting by the kitchen
        fr = fc['right'][0]
        for k, (y, z, w, h, col) in enumerate(((-2.35, 1.9, .34, .26, '#f06a8a'), (-1.7, 1.7, .26, .34, '#4aa3df'))):
            picture(R, fr, R.u_of('right', y=y), z, w, h, frame=col, kind='landscape', seed=40 + k)
        R.fbox(fr, 'W', R.u_of('right', y=-.75), 1.1, .02, .12, 1.5, .02, '#e8d8b4', ch=0, tag='height chart')
        for k in range(3):
            R.fbox(fr, 'K', R.u_of('right', y=-.75), .6 + k * .4, .035, .08, .015, .006, '#e8644a', tag='height chart')
        # back wall: clock; chest top and buffet: bottle warmer, bright plates
        wall_clock(R, fc['back'][0], R.u_of('back', x=.1), 1.7, r=.17)
        # sewing table: a tiny onesie being mended; chest top: nappy basket and the family photo
        R.box('P', (-3.15, -2.45, SEW_TOP + .008), (.16, .14, .016), '#fbe38a', ch=0, tag='onesie')
        for k in range(3):
            R.box('P', (-3.68, -1.45, CHEST_TOP + .02 + k * .035), (.26, .2, .03), ['#fff1c9', '#bfe8f0', '#fbe38a'][k], ch=0, tag='nappies')
        R.box('W', (-3.74, -.95, CHEST_TOP + .1), (.03, .22, .2), '#c9a062', ch=0, rot=(0, -.12, 0), tag='photo')
        # loft: a rolled playpen mattress and a stuffed rabbit
        R.box('P', (.1, 2.45, LOFT + .08), (.6, .4, .1), '#f6c85a', ch=0, tag='loft toys')
        plush_bear(R, (.45, 2.5, LOFT + .13), s=.9, col='#f4efe2', rot=3.1)


def var_teacher_b(e):
    R, rng, fc, dt, ct = e['R'], random.Random(6), e['fc'], e['dt'], e['ct']
    BL, tops = e['BL'], e['tops']
    pal = ('#8a3a2a', '#2f5a6a', '#6a7a3a', '#a07a3a', '#5a3a6a', '#3a4a6a')
    with group(R, 'Var_2'):
        around_irori(R, e, ['#7a5a3a', '#5a7a4a', '#8a6a4a', '#5a7a4a'])
        seat_pads(R, e, ['#5a7a4a', '#7a5a3a', '#7a5a3a', '#5a7a4a'])
        sofa_rug(R, '#3f5a3f', '#c9a062', '#e8dcc0')
        # sofa: grey knitted blanket, a pillow, a book left open
        R.box('P', (2.0, -1.17, SOFA_SEAT + .005), (1.1, .5, .03), '#a89880', ch=0, tag='blanket')
        R.box('P', (2.0, -1.17, SOFA_SEAT + .022), (1.1, .06, .006), '#6a5a48', ch=0, tag='blanket')
        pillow(R, (2.95, -1.4, SOFA_SEAT + .05), '#5a7a4a', rot=-.1)
        R.box('P', (2.8, -1.0, SOFA_SEAT + .02), (.26, .2, .03), '#f1ece0', ch=0, rot=(0, 0, .4), tag='open book')
        # coffee table: go board with stones, a tea tray, a stack of books
        R.box('W', (ct.x - .15, ct.y, COFFEE_TOP + .02), (.4, .4, .04), '#d9b060', ch=0, tag='go board')
        for k, col in enumerate(('#1c1c22', '#f4efe2', '#1c1c22', '#f4efe2', '#1c1c22')):
            R.sphere('K', (ct.x - .27 + (k % 3) * .1, ct.y - .1 + (k // 3) * .12, COFFEE_TOP + .06), .02, col, seg=4, rings=3, tag='go stones')
        book_stack(R, (ct.x + .4, ct.y + .15, COFFEE_TOP), rng, n=3, palette=pal)
        # dining table: cloth, tea set and flowers, the evening paper
        R.cyl('P', (dt.x, dt.y, DINE_TOP + .004), .3, .008, '#e8e4d0', n=10, tag='cloth')
        tea_tray(R, (dt.x - .1, dt.y + .05, DINE_TOP), rot=.1, cols=('#5a7a4a', '#e8e0ce'), cups=1)
        R.box('P', (dt.x + .4, dt.y - .2, DINE_TOP + .006), (.28, .2, .012), '#ebe6d8', ch=0, rot=(0, 0, -.3), tag='paper')
        plant_lean(R, (dt.x + .3, dt.y + .22, DINE_TOP), r=.07, h=.1, pot='#6b4a2a', leaf='#3f7f3a', seed=4)
        # bookcase: full of books
        for i in (0, 1, 2, 3, 4):
            book_blocks(R, BL, -.7, .72, tops[i], rng, pal, hmax=.3 if i == 0 else .27, hmin=.2 if i == 0 else .17,
                        w=(.14, .2))
        plant_lean(R, BL.p(0, -.05, 2.15 + .04), r=.1, h=.1, pot='#a8723c', leaf='#3f7f3a', kind='tall', seed=8)
        # walls: a world map, two framed certificates, a clock
        fr = fc['right'][0]
        picture(R, fr, R.u_of('right', y=-2.0), 1.85, .9, .56, frame='#4a2e20', kind='map', seed=3)
        R.fbox(fr, 'W', R.u_of('right', y=-1.0), 1.8, .025, .3, .4, .03, '#6b4027', ch=0, tag='frames')
        R.fbox(fr, 'P', R.u_of('right', y=-1.0), 1.8, .042, .24, .34, .006, '#e8dcc0', ch=0, tag='frames')
        wall_clock(R, fc['back'][0], R.u_of('back', x=.1), 1.7, r=.17, rim='#4a2e20')
        # back chest top: a globe, a green reading lamp and stacked books
        gx, gy = (-.35, e['BC'].o.y - .25 + .0)
        gy = 2.65
        R.cyl('W', (-.35, gy, CHEST_TOP + .015), .1, .03, '#4a2e20', n=8, tag='globe')
        R.rod('M', (-.35, gy, CHEST_TOP + .03), (-.35, gy, CHEST_TOP + .2), .012, BRASS, n=4, tag='globe')
        R.sphere('K', (-.35, gy, CHEST_TOP + .27), .1, '#3f7ab0', seg=6, rings=4, tag='globe')
        R.sphere('K', (-.32, gy - .05, CHEST_TOP + .3), .06, '#6aa04a', seg=4, rings=3, tag='globe')
        book_stack(R, (.45, gy, CHEST_TOP), rng, n=4, palette=pal)
        R.cyl('K', (.75, gy, CHEST_TOP + .02), .07, .03, '#23785a', n=8, tag='lamp')
        R.rod('M', (.75, gy, CHEST_TOP + .03), (.75, gy, CHEST_TOP + .3), .012, BRASS, n=4, tag='lamp')
        R.lathe('K', [(0.01, .0), (.03, .02), (.1, -.05), (.0, .0)], (.75, gy, CHEST_TOP + .33), '#23785a', n=8, tag='lamp')
        # buffet: a tea service and a fruit bowl; sewing table: papers and an inkwell; chest: the old radio
        bowl(R, (2.2, 2.62, BUF_TOP), r=.12, col='#e8e0ce')
        for k in range(2):
            R.sphere('K', (2.17 + k * .06, 2.62, BUF_TOP + .1), .04, ['#d8342c', '#9ac83a'][k], seg=5, rings=3, tag='fruit')
        book_stack(R, (-3.15, -2.45, SEW_TOP), rng, n=3, palette=pal)
        R.cyl('K', (-2.8, -2.55, SEW_TOP + .03), .03, .06, '#1a1c22', n=6, tag='inkwell')
        R.box('W', (-3.68, -1.2, CHEST_TOP + .1), (.3, .16, .2), '#6b4027', ch=0, tag='radio')
        R.box('K', (-3.6, -1.2, CHEST_TOP + .1), (.01, .22, .12), '#c9a062', ch=0, tag='radio')
        # loft: a crate of books
        R.box('W', (.2, 2.5, LOFT + .1), (.5, .36, .2), '#a07a3a', ch=0, tag='loft books')
        book_stack(R, (-.2, 2.5, LOFT + .0), rng, n=4, palette=pal)


def var_tailor_b(e):
    R, rng, fc, dt, ct = e['R'], random.Random(7), e['fc'], e['dt'], e['ct']
    BL, tops = e['BL'], e['tops']
    pat = ('#d8408a', '#2f9a9a', '#e0a93a', '#7a4a9a', '#4aa3df', '#e8644a')
    with group(R, 'Var_3'):
        around_irori(R, e, ['#a050a0', '#2f8a8a', '#e0689a', '#2f8a8a'])
        seat_pads(R, e, ['#d8408a', '#2f9a9a', '#e0a93a', '#7a4a9a'])
        sofa_rug(R, '#7a4a8a', '#e0a93a', '#2f9a9a')
        # sofa: patchwork quilt of coloured squares and two pillows
        for k in range(6):
            R.box('P', (1.7 + (k % 3) * .38, -1.3 + (k // 3) * .3, SOFA_SEAT + .008), (.37, .29, .02), pat[k], ch=0, tag='patchwork')
        pillow(R, (3.0, -1.4, SOFA_SEAT + .05), '#e0689a', rot=-.1)
        # coffee table: a basket of yarn and a pincushion
        for k, col in enumerate(('#d8408a', '#2f9a9a', '#e0a93a')):
            R.sphere('P', (ct.x - .2 + (k - 1) * .1, ct.y + (k % 2) * .06, COFFEE_TOP + .05), .06, col, seg=5, rings=3, tag='yarn')
        R.sphere('P', (ct.x + .25, ct.y, COFFEE_TOP + .03), .04, '#d8342c', seg=5, rings=3, tag='pincushion')
        # dining table: patchwork runner, a pot of tea, fabric swatches
        for k in range(5):
            R.box('P', (dt.x - .5 + k * .25, dt.y, DINE_TOP + .006), (.24, .3, .01), pat[k], ch=0, tag='runner')
        tea_tray(R, (dt.x, dt.y - .2, DINE_TOP), rot=0.0, cols=('#7a4a9a', '#e8e0ce'), cups=1)
        # the sewing table in full swing: fabric stack, scissors, spools, a pattern sheet
        for k in range(3):
            R.box('P', (-3.35, -2.5, SEW_TOP + .02 + k * .035), (.34, .26, .03), pat[k], ch=0, rot=(0, 0, .15 * k), tag='fabric')
        R.box('M', (-2.55, -2.4, SEW_TOP + .006), (.16, .02, .006), '#c9ccd2', ch=0, rot=(0, 0, .5), tag='scissors')
        R.box('M', (-2.55, -2.4, SEW_TOP + .006), (.16, .02, .006), '#c9ccd2', ch=0, rot=(0, 0, 1.0), tag='scissors')
        for k, col in enumerate(('#d8342c', '#e0a93a', '#2d78c8')):
            R.cyl('K', (-2.7 + k * .06, -2.7, SEW_TOP + .035), .025, .07, col, n=6, tag='spools')
        R.box('P', (-3.0, -2.75, SEW_TOP + .004), (.4, .2, .008), '#f1ead8', ch=0, rot=(0, 0, -.1), tag='pattern')
        # dress form on the sewing chest wearing a half-pinned dress
        mx, my = -3.68, -1.0
        R.cyl('W', (mx, my, CHEST_TOP + .015), .1, .03, '#4a2e20', n=8, tag='dress form')
        R.rod('W', (mx, my, CHEST_TOP + .03), (mx, my, CHEST_TOP + .3), .015, '#6b4027', n=4, tag='dress form')
        R.lathe('P', [(0, 0), (.14, .0), (.2, .1), (.12, .28), (.1, .42), (.07, .5), (0, .55)], (mx, my, CHEST_TOP + .1), '#d8408a', n=8, tag='dress')
        # bookcase: bolts of fabric and baskets of yarn
        for i in (1, 2, 3):
            x = -.7
            for k in range(4):
                R.box('P', BL.p(x + .18, -.04, tops[i] + .09), (.34, .22, .17), pat[(i * 2 + k) % 6], ch=0, rot=BL.rz, tag='bolts')
                x += .37
        basket_lean(R, BL.p(0, -.03, tops[0]), r=.24, h=.2, col='#a47c44', fill=None, n=2, rng=rng)
        for k, col in enumerate(('#d8408a', '#2f9a9a', '#e0a93a')):
            R.sphere('P', BL.p((k - 1) * .13, 0, tops[0] + .26), .08, col, seg=5, rings=3, tag='yarn')
        # walls: a patchwork quilt hung on the right wall, patterns pinned up, dresses on a rail by the kitchen door
        fr = fc['right'][0]
        uq = R.u_of('right', y=-1.5)
        for k in range(9):
            R.fbox(fr, 'P', uq + (k % 3 - 1) * .27, 1.55 + (1 - k // 3) * .27, .02, .26, .26, .012, pat[(k * 5) % 6], ch=0, tag='quilt')
        R.fbox(fr, 'W', uq, 2.05, .035, .9, .03, .03, '#6b4027', ch=0, tag='quilt rod')
        fl = fc['left'][0]
        for k in range(3):
            R.fbox(fl, 'P', R.u_of('left', y=-2.55 + k * .38), 1.35, .09, .24, .32, .006, ['#f1ead8', '#e8dcc0', '#f6e6e0'][k],
                   ch=0, tag='pinned patterns')
        R.rod('W', (-3.78, -.45, 1.85), (-3.78, .75, 1.85), .02, '#c8c060', n=4, tag='clothes rail')
        for y in (-.4, .7):
            R.box('W', (-3.84, y, 1.85), (.1, .04, .04), '#6b4027', ch=0, tag='clothes rail')
        for k, (y, col, col2) in enumerate(((-.1, '#d8408a', '#a02a68'), (.25, '#2f9a9a', '#1f6a6a'), (.55, '#7a4a9a', '#4a2a6a'))):
            hanger_cloth(R, (-3.78, y, 1.83), 'robe', col, w=.4, h=.6, rot=math.pi / 2, col2=col2)
        wall_clock(R, fc['back'][0], R.u_of('back', x=.1), 1.7, r=.16, rim='#7a4a9a')
        # buffet and chest tops: fabric rolls, a teapot; loft: a stack of fabric bolts
        for k in range(3):
            R.box('P', (1.6 + k * .24, 2.62, BUF_TOP + .07), (.2, .3, .13), pat[(k + 2) % 6], ch=0, tag='bolts')
        R.box('P', (-.3, 2.62, CHEST_TOP + .05), (.6, .3, .1), '#e0689a', ch=0, tag='fabric')
        R.box('P', (-.3, 2.62, CHEST_TOP + .13), (.5, .26, .06), '#2f9a9a', ch=0, tag='fabric')
        for k in range(3):
            R.box('P', (-.1 + k * .24, 2.5, LOFT + .1), (.22, .36, .18), pat[k], ch=0, tag='loft bolts')
        R.box('P', (.9, 2.5, LOFT + .1), (.3, .36, .18), pat[4], ch=0, tag='loft bolts')
