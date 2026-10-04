"""Takamori house B interior (build_interiors.py): a compact, tidy, bright home behind the veranda door.

One main room: cream plaster over sky-blue wainscot, pale birch floor, a raised tatami area with a window over it, a
round dining table, a small kitchen corner with a cast-iron stove, a wardrobe and the front door onto the veranda.
Three decor variants (Var_1 a young couple's first home, Var_2 a bell-ringer's family, Var_3 a grandmother's sunny
sewing room) are meshes-only groups; the game shows exactly one. Large furniture and colliders are all in the base.
"""
import math, random
from mathutils import Vector, Matrix
import arch_lib
from interior_lib import *  # noqa: F401,F403
from interior_rooms import builder, IRON, BRASS
from interior_takamori_a import (face_rot, install_vars, begin_var, end_vars, npc_spot, chair, table, curtains, sill_pot,
                                 plant, jar, mug, plate, vase, round_cushion, chest_lite, pendant_lite, sack_lite,
                                 hang_pot, group_report, wall_clock, WALNUT, DARKW)

V = Vector
CRM, BLUE, GREEN, YEL, ROSE, NAVY, TEAL = '#f9f0dc', '#82b8dc', '#58a878', '#f2c14e', '#e0657a', '#2f4c86', '#2a9a9a'
BIRCH = '#e8c48c'
LIGHTW = '#d9b07a'


@builder('interior-takamori-b')
def build_takamori_b():
    W, D, H = 4.9, 4.5, 3.1
    R = Room('interior-takamori-b', W, D, H, ceil=3.7, cam_top=3.02)
    fire_mat(R)
    install_vars(R)
    rng = random.Random(41)
    fc = R.faces()
    PZ = .24
    DOOR = (1.95, 2.95, 0, 2.1)
    holes = {
        'front': [DOOR, (3.25, 4.1, .85, 2.05), (.8, 1.65, .85, 2.05)],
        'back': [(1.0, 2.0, .85, 2.05), (3.0, 3.9, 0, 2.05)],
        'left': [(2.45, 3.35, .85, 2.05), (.85, 1.75, .85, 2.05)],
        'right': [(1.85, 2.85, .85, 2.05)],
    }
    posts = {s: [.06, (W if s in ('back', 'front') else D) - .06] for s in fc}
    WB = 1.0
    for side, (f, L) in fc.items():
        plaster_wall(R, f, L, WB, H + .1, holes[side], CRM, du=1.3, dz=1.0, mottle=.04, us=post_splits(posts[side], .16),
                     zs=[2.5, 2.58])
        wainscot(R, f, L, 0, WB, [h for h in holes[side] if h[2] < WB], BLUE, board=.3, cap='#ffffff', seed=len(side))
        for u in posts[side]:
            R.fbox(f, 'W', u, H / 2, .04, .15, H, .08, LIGHTW, tag='posts')
        for a, b in spans(0, L, 2.54, holes[side]):
            R.fbox(f, 'K', (a + b) / 2, 2.54, .02, b - a, .06, .04, GREEN, tag='picture rail')
    for y in (-.7, 1.3):
        R.box('W', (0, y, H + .12), (W + .1, .22, .24), LIGHTW, ch=0, tag='beams')
    board_ceiling(R, 3.7, col='#f1dcb0', board=.34, along='y')
    shadow_shell(R, holes)

    # ---- floors: pale birch planks, blue-and-cream tiles by the stove
    plank_floor(R, -W / 2, W / 2, -D / 2, D / 2, base=BIRCH, board=.26, seg=1.7, along='y', seed=6)
    tile_floor(R, 1.5, W / 2, .5, D / 2, z=.016, tile=.4, cols=('#f6f0e0', '#8fc4e0', '#f6f0e0'), grout='#9aa8b0',
               checker=True, tag='kitchen tiles')
    R.box('W', (1.5, (.5 + D / 2) / 2, .012), (.05, D / 2 - .5, .02), LIGHTW, ch=0, tag='tile edge')
    R.box('W', ((1.5 + W / 2) / 2, .5, .012), (W / 2 - 1.5, .05, .02), LIGHTW, ch=0, tag='tile edge')

    # ---- front: veranda door, two windows with flower boxes outside
    door_inside(R, 'front', W / 2, w=1.0, h=2.1, col=GREEN, frame=CRM)
    ff, Lf = fc['front']
    for k, h in enumerate(holes['front'][1:]):
        window(R, ff, h, depth=.24, kind='valley', nu=6, nv=5, seed=2 + k, frame='#ffffff', cols=2, rows=2, frame_key='K')
    # wardrobe (front-right corner), umbrella and boots by the door
    wl = Loc((2.1, -D / 2 + .27), AGAINST['front'])
    R.box('W', wl.p(0, 0, 1.0), (.7, .5, 1.9), '#6fb8a0', ch=0, rot=wl.rz, tag='wardrobe')
    R.box('W', wl.p(0, 0, 1.97), (.78, .56, .08), '#4f9a82', ch=0, rot=wl.rz, tag='wardrobe')
    R.box('W', wl.p(0, 0, .04), (.74, .5, .08), '#3f7a68', ch=0, rot=wl.rz, tag='wardrobe')
    for sx in (-1, 1):
        R.box('K', wl.p(sx * .165, -.255, 1.0), (.3, .02, 1.6), '#86cbb4', ch=0, rot=wl.rz, tag='wardrobe doors')
        R.box('M', wl.p(sx * .04, -.285, 1.0), (.025, .02, .12), BRASS, ch=0, rot=wl.rz, tag='wardrobe doors')
    R.col_c('wardrobe', (2.1, -D / 2 + .27, 0), (.74, .54, 2.0))
    R.cyl('K', (-1.95, -D / 2 + .3, .22), .12, .44, '#2f4c86', n=8, tag='umbrella stand')
    R.lathe('P', [(0, 1.0), (.04, .95), (.09, .7), (.08, .45), (.03, .44), (0, .44)], (-1.95, -D / 2 + .3, 0), YEL, n=6,
            tag='umbrella')
    R.rod('W', (-1.95, -D / 2 + .3, .1), (-1.95, -D / 2 + .3, 1.12), .012, '#c9a062', n=4, tag='umbrella')
    for x, col in ((-1.5, '#3f8a5a'), (-1.25, '#3f8a5a')):
        R.box('K', (x, -D / 2 + .2, .14), (.1, .13, .28), col, ch=0, tag='boots')
        R.box('K', (x, -D / 2 + .15, .04), (.1, .2, .08), col, ch=0, tag='boots')

    # ---- left wall: window over a sideboard, plant bits
    fl, Ll = fc['left']
    for k, h in enumerate(holes['left']):
        window(R, fl, h, depth=.24, kind='village', nu=6, nv=5, seed=5 + k, frame='#ffffff', cols=2, rows=2, frame_key='K')
    sb = Loc((-W / 2 + .23, -1.0), AGAINST['left'])
    chest_lite(R, sb, 1.0, .42, .76, 2, '#d99a5a', pull=BRASS, cols=2)
    R.col_c('sideboard', (-W / 2 + .23, -1.0, 0), (.44, 1.04, .8))
    plant(R, (-W / 2 + .35, -D / 2 + .55, 0), r=.22, h=.3, pot=YEL, leaf='#4f9a3a', kind='tall', seed=5)
    R.col_c('floor plant', (-W / 2 + .35, -D / 2 + .55, 0), (.5, .5, .9))

    # ---- right wall: window, low chest with plant, kitchen corner with counter, stove and wood box
    fr, Lr = fc['right']
    window(R, fr, holes['right'][0], depth=.24, kind='village', nu=6, nv=5, seed=8, frame='#ffffff', cols=2, rows=2, frame_key='K')
    rc = Loc((W / 2 - .23, -1.25), AGAINST['right'])
    chest_lite(R, rc, .85, .42, .75, 2, '#d99a5a', pull=BRASS, cols=2)
    plant(R, rc.p(0, 0, .77), r=.1, h=.14, pot='#2a9a9a', leaf='#5aa04a', flowers='#f06a8a', seed=3)
    R.col_c('right chest', (W / 2 - .23, -1.25, 0), (.44, .9, .8))
    cx0 = W / 2 - .52
    R.box('K', (W / 2 - .27, .95, .43), (.5, .8, .86), '#a9d0e8', ch=0, tag='counter')
    for k in range(2):
        R.box('K', (cx0 - .01, .75 + k * .4, .42), (.02, .32, .6), '#c3e0f2', ch=0, tag='counter doors')
        R.box('M', (cx0 - .03, .75 + k * .4, .62), (.02, .04, .1), BRASS, ch=0, tag='counter doors')
    R.box('W', (W / 2 - .25, .95, .89), (.56, .86, .05), '#d9a468', ch=0, tag='counter top')
    R.box('K', (W / 2 - .27, .85, .925), (.34, .4, .02), '#cfd6d8', ch=0, tag='sink')
    R.box('K', (W / 2 - .27, .85, .93), (.28, .34, .01), '#7a8a90', ch=0, tag='sink')
    R.rod('M', (W / 2 - .08, .85, .92), (W / 2 - .08, .85, 1.15), .012, BRASS, n=5, tag='tap')
    R.col('counter', (cx0 - .06, .52, -.5), (W / 2, 1.38, .93))
    # cast-iron stove with a glowing door and a pipe up the wall
    sx0, sy0, sy1 = W / 2 - .5, 1.4, 2.0
    R.box('M', (W / 2 - .27, (sy0 + sy1) / 2, .45), (.5, sy1 - sy0, .84), '#2f6a5a', ch=0, tag='stove')
    R.box('M', (W / 2 - .27, (sy0 + sy1) / 2, .89), (.54, sy1 - sy0 + .04, .05), '#1f3a34', ch=0, tag='stove')
    R.box('M', (W / 2 - .27, (sy0 + sy1) / 2, .22), (.56, sy1 - sy0 - .08, .06), '#1f3a34', ch=0, tag='stove')
    R.poly('F', [(sx0 - .012, sy0 + .15, .3), (sx0 - .012, sy1 - .15, .3), (sx0 - .012, sy1 - .15, .62), (sx0 - .012, sy0 + .15, .62)],
           '#ffb060', normal=(-1, 0, 0), tag='stove fire')
    R.box('M', (sx0 - .02, (sy0 + sy1) / 2, .66), (.02, sy1 - sy0 - .18, .04), BRASS, ch=0, tag='stove')
    R.box('M', (sx0 - .02, (sy0 + sy1) / 2, .26), (.02, sy1 - sy0 - .18, .04), BRASS, ch=0, tag='stove')
    R.cyl('M', (W / 2 - .2, (sy0 + sy1) / 2, 2.0), .06, 2.2, '#2a2e34', n=8, tag='stove pipe')
    R.cyl('M', (W / 2 - .2, (sy0 + sy1) / 2, 1.0), .085, .04, BRASS, n=8, tag='stove pipe')
    R.node('Light_3', (sx0 - .1, (sy0 + sy1) / 2, .5))['fire'] = 1
    R.col('stove', (sx0 - .05, sy0 - .05, -.5), (W / 2, sy1 + .05, 1.0))
    # wood box and shelves above the counter
    R.box('W', (W / 2 - .25, 2.12, .2), (.44, .3, .4), '#a8693a', ch=0, tag='wood box')
    for r in range(2):
        for k in range(2):
            R.cyl('W', (W / 2 - .25 + (k - .5) * .16, 2.12, .44 + r * .09), .07, .26, '#8a5a32', n=5, rot=(math.pi / 2, 0, 0), tag='firewood')
    R.col('wood box', (W / 2 - .52, 1.97, -.5), (W / 2, 2.27, .64))
    for z in (1.5, 1.9):
        R.fbox(fr, 'W', D / 2 - 1.3, z, .1, 1.0, .035, .2, '#a8693a', tag='kitchen shelf')

    # ---- back wall: window, back door, hooks
    fb, Lb = fc['back']
    window(R, fb, holes['back'][0], depth=.24, kind='valley', nu=6, nv=5, seed=11, frame='#ffffff', cols=2, rows=2, frame_key='K')
    door_inside(R, 'back', 3.45, w=.9, h=2.05, col=BLUE, frame=CRM)
    R.fbox(fb, 'W', 4.35, 1.6, .03, .5, .07, .03, WALNUT, tag='hooks')
    for u in (4.2, 4.5):
        R.B('M').rod(fb.p(u, 1.6, .04), fb.p(u, 1.58, .12), .01, n=4, tint=R.t('M', BRASS), tag='hooks')

    # narrow bookcase between the window and the back door
    bk = Loc((.05, D / 2 - .17), AGAINST['back'])
    for sx in (-1, 1):
        R.box('W', bk.p(sx * .36, 0, .85), (.04, .3, 1.7), '#d99a5a', ch=0, rot=bk.rz, tag='bookcase')
    R.box('W', bk.p(0, 0, 1.72), (.8, .32, .04), '#c98a4a', ch=0, rot=bk.rz, tag='bookcase')
    R.box('W', bk.p(0, .14, .85), (.7, .02, 1.7), '#b87a3a', ch=0, rot=bk.rz, tag='bookcase')
    for z in (.04, .5, .95, 1.4):
        R.box('W', bk.p(0, 0, z), (.7, .28, .03), '#d99a5a', ch=0, rot=bk.rz, tag='bookcase')
    for z, y0 in ((.52, 0), (.97, 1), (1.42, 0)):
        x = -.31
        while x < .3:
            w_ = rng.uniform(.03, .06)
            hh = rng.uniform(.22, .34)
            R.box('K', bk.p(x + w_ / 2, -.01, z + hh / 2), (w_ - .005, .2, hh), rng.choice([BLUE, GREEN, YEL, ROSE, '#f4efe2', NAVY]),
                  ch=0, rot=bk.rz, tag='books')
            x += w_
    R.col_c('bookcase', (.05, D / 2 - .17, 0), (.84, .34, 1.78))

    # ---- raised tatami area (back-left)
    nx0, nx1, ny0, ny1 = -W / 2, -.65, .45, D / 2
    R.box('W', ((nx0 + nx1) / 2, (ny0 + ny1) / 2, PZ / 2 - .01), (nx1 - nx0, ny1 - ny0, PZ), '#c98f58', ch=0, tag='tatami area')
    R.box('W', ((nx0 + nx1) / 2, ny0 + .012, PZ / 2 - .02), (nx1 - nx0, .03, PZ - .04), '#a8693a', ch=0, tag='tatami area')
    R.box('W', (nx1 - .006, (ny0 + ny1) / 2, PZ / 2 - .02), (.03, ny1 - ny0, PZ - .04), '#a8693a', ch=0, tag='tatami area')
    for k in range(2):
        tatami(R, nx0 + .9 * k, ny0, along_x=False, z=PZ, straw='#e0d484', heri='#2f6f8a', rng=rng)
    R.col('tatami area', (nx0 - .2, ny0, -.5), (nx1, ny1 + .2, PZ + .06), walk=True, surface='wood')
    R.box('W', ((nx0 + nx1) / 2, ny0 - .15, .06), (1.2, .3, .12), '#d9a468', ch=0, tag='step')
    # a low shelf at the back end of the tatami
    R.box('W', (nx0 + .3, ny1 - .2, PZ + .22), (.5, .36, .44), '#d99a5a', ch=0, tag='tatami shelf')
    R.col('tatami shelf', (nx0, ny1 - .42, PZ - .2), (nx0 + .56, ny1, PZ + .64))
    R.B('P').cyl((nx0 + .3, ny1 - .2, PZ + .46), .09, .05, n=8, tint=R.t('P', '#f4efe2'), tag='tatami shelf')

    # ---- table and chairs
    tcn = (.9, .8)
    R.cyl('W', (tcn[0], tcn[1], .745), .5, .05, '#e6b878', n=16, tag='table')
    R.cyl('W', (tcn[0], tcn[1], .36), .06, .72, '#8a5a32', n=6, tag='table')
    R.cyl('W', (tcn[0], tcn[1], .03), .3, .06, '#8a5a32', n=10, tag='table')
    chair(R, (tcn[0], tcn[1] - .68), tcn, '#5aa0c8', '#f4d488')
    chair(R, (tcn[0], tcn[1] + .68), tcn, '#5aa0c8', '#f4d488')
    R.col('table set', (.38, -.1, -.4), (1.42, 1.7, .95))
    pendant_lite(R, (tcn[0], tcn[1], 2.3), r=.26, col=YEL, cord=H + .6 - 2.3)
    R.node('Light_1', (tcn[0], tcn[1], 2.15))
    paper_lamp(R, (-1.55, 1.35, 2.3), r=.2, h=.34, cord=H + .6 - 2.3)
    R.node('Light_2', (-1.55, 1.35, 2.3))

    # ---- NPC spots, spawn, exit
    npc_spot(R, 'Spot_npc_1', (-.2, 1.45), (tcn[0], tcn[1]))
    npc_spot(R, 'Spot_npc_2', (1.6, -.8), (tcn[0], tcn[1]))
    R.node('Spawn', (0, -D / 2 + 2.0, 0))
    R.node('Exit', (0, -D / 2 + .55, 0))

    # ================================================================ variants (meshes only)
    ctx = dict(fc=fc, holes=holes, W=W, D=D, H=H, PZ=PZ, tc=tcn, nook=(nx0, nx1, ny0, ny1), DOOR=DOOR)
    begin_var(R, 1)
    var_couple(R, ctx)
    begin_var(R, 2)
    var_ringer(R, ctx)
    begin_var(R, 3)
    var_granny(R, ctx)
    end_vars(R)
    R.shell_cols(surface='wood')
    group_report(R)
    return R.finish_room()


def dress_b(R, ctx, cur, fold, rug_col, rug_border, rug_stripe, futon, pillow, pic, door_col=None):
    """What every variant has, recoloured: curtains (door + three windows), rug under the table, futon and pillow."""
    fc, holes = ctx['fc'], ctx['holes']
    curtains(R, fc['front'][0], ctx['DOOR'], door_col or cur, fold=fold, drop=.55)
    for side, idx in (('front', 2), ('back', 0), ('left', 0)):
        curtains(R, fc[side][0], holes[side][idx], cur, fold=fold)
    rug(R, .0, -.1, 1.8, 1.7, 0.0, rug_col, rug_border, stripe=rug_stripe)
    nx0, nx1, ny0, ny1 = ctx['nook']
    PZ = ctx['PZ']
    R.box('P', (nx0 + .85, (ny0 + ny1) / 2 + .1, PZ + .05 + .06), (1.55, 1.4, .12), futon, ch=.04, tag='futon')
    R.box('P', (nx0 + .85, ny1 - .3, PZ + .05 + .14), (.6, .3, .1), pillow, ch=.04, tag='pillow')
    for k, (side, u, z, w, h, kind, fr_) in enumerate(pic):
        picture(R, fc[side][0], u, z, w, h, frame=fr_, kind=kind, seed=k + 5)


def var_couple(R, ctx):
    """Var_1: a young couple's first home: half-unpacked boxes, a bright new rug, wedding photo, fresh flowers."""
    rng = random.Random(51)
    tc, W, D = ctx['tc'], ctx['W'], ctx['D']
    dress_b(R, ctx, '#f6d46a', '#e8b83a', '#8fd0b8', '#fbf3e0', '#f6d46a', '#9ac8e8', '#fbf3e0',
            [('right', D / 2 + .95, 1.7, .5, .62, 'portrait', '#f6d46a'), ])
    # boxes: a stack in the front-left corner by the door, one open box with things spilling out
    def cardboard(c, s, rot=0.0):
        R.box('P', (c[0], c[1], c[2] + s[2] / 2), s, '#c8a068', ch=0, rot=(0, 0, rot), tag='boxes')
        R.box('P', (c[0], c[1], c[2] + s[2] * .5), (s[0] + .004, .04, s[2] + .004), '#e0c08c', ch=0, rot=(0, 0, rot), tag='boxes')
    cardboard((-1.55, -1.7, 0), (.55, .45, .4), .15)
    cardboard((-1.55, -1.7, .4), (.5, .4, .35), -.2)
    cardboard((-.85, -1.85, 0), (.45, .4, .32), .5)
    cardboard((-.2, 1.9, 0), (.5, .4, .38), .3)
    R.box('P', (.35, 1.95, .12), (.5, .4, .24), '#c8a068', ch=0, rot=(0, 0, -.2), tag='boxes')
    R.box('P', (.33, 1.95, .27), (.46, .36, .1), '#2f4c86', ch=0, rot=(0, 0, -.2), tag='books')
    R.box('P', (.37, 1.95, .34), (.4, .3, .05), '#e0657a', ch=0, rot=(0, 0, -.1), tag='books')
    plant(R, (.8, 1.95, 0), r=.13, h=.18, pot='#f6d46a', leaf='#5aa04a', kind='tall', seed=2)
    # rolled-up old rug against the table-side wall, mugs, flowers and a cake on the table
    R.cyl('P', (-.4, -1.9, .3), .12, .6, '#d9724a', n=8, rot=(.08, 0, 0), tag='rolled rug')
    mug(R, (tc[0] - .2, tc[1] - .1, .77), '#e0657a')
    mug(R, (tc[0] + .15, tc[1] + .15, .77), '#2a9a9a')
    vase(R, (tc[0] + .05, tc[1] - .3, .77), col='#f4efe2', flowers=('#f06a8a', '#ffd35a', '#f4efe2'), h=.16, seed=4)
    # shoes by the door, a hung heart garland over the tatami window (left wall)
    R.box('K', (-.35, -D / 2 + .3, .04), (.12, .24, .08), '#e0657a', ch=0, rot=(0, 0, .3), tag='shoes')
    R.box('K', (-.18, -D / 2 + .32, .04), (.12, .24, .08), '#e0657a', ch=0, rot=(0, 0, .1), tag='shoes')
    fl = ctx['fc']['left'][0]
    for k in range(5):
        u = 2.5 + k * .17
        R.box('P', fl.p(u, 2.35 - .05 * math.sin(k * 1.3), .12), (.1, .02, .1), [ROSE, YEL, '#82b8dc', ROSE, YEL][k],
              ch=0, rot=(0, 0, 0), tag='garland')


def var_ringer(R, ctx):
    """Var_2: a bell-ringer's family: handbells on a rack, a coiled bell rope, a wall clock, red and navy colours."""
    rng = random.Random(52)
    tc, W, D = ctx['tc'], ctx['W'], ctx['D']
    dress_b(R, ctx, '#d8503c', '#b83a2c', '#2f4c86', '#f4efe2', '#d8503c', '#2f4c86', '#fbf3e0',
            [('right', D / 2 + .95, 1.65, .5, .6, 'night', '#8a5a32'), ])
    # handbell rack on the left wall over the tatami: a rail with eight brass bells hung by loops
    fl = ctx['fc']['left'][0]
    R.fbox(fl, 'W', 3.15, 1.5, .08, 1.5, .05, .14, '#8a5a32', tag='bell rack')
    for k in range(7):
        u = 2.5 + k * .13
        hh = .13 - .006 * k
        R.lathe('M', [(0, 0), (.05 + .002 * (6 - k), 0), (.04, hh * .6), (.018, hh), (0, hh)], fl.p(u, 1.47, .14),
                BRASS if k % 2 == 0 else '#e0b84a', n=6, rot=(math.pi, 0, 0), tag='bells')
    # rope coil by the door and the bell-rope hook
    for k in range(3):
        R.torus('P', (-1.2, -1.75, .03 + .05 * k), .2 - .01 * k, .025, '#d9c08a', maj=10, mn=4, tag='rope')
    R.rod('W', (-1.2, -1.55, .1), (-1.0, -1.45, .5), .02, '#d9c08a', n=4, tag='rope')
    # wall clock over the table side and a framed bell-tower picture
    wall_clock(R, ctx['fc']['back'][0], 4.35, 1.95, r=.2, t=(10, 8))
    # table: bell and cups, a ledger
    R.lathe('M', [(0, 0), (.07, 0), (.06, .06), (.025, .11), (.012, .13), (0, .13)], (tc[0] + .1, tc[1] - .1, .77), BRASS, n=8, tag='bells')
    mug(R, (tc[0] - .25, tc[1] + .12, .77), '#d8503c')
    R.box('K', (tc[0] - .1, tc[1] - .3, .775), (.2, .28, .03), '#6b4027', ch=0, rot=(0, 0, .2), tag='ledger')
    # a small bell on the tatami shelf and a bright lantern runner
    R.lathe('M', [(0, 0), (.04, 0), (.035, .05), (.015, .09), (0, .09)], (-W / 2 + .3, ctx['D'] / 2 - .2, ctx['PZ'] + .5), BRASS, n=6,
            tag='bells')


def var_granny(R, ctx):
    """Var_3: a grandmother's sunny sewing room: a patchwork quilt, a spinning wheel, a tea tray, rose florals."""
    rng = random.Random(53)
    tc, W, D, PZ = ctx['tc'], ctx['W'], ctx['D'], ctx['PZ']
    dress_b(R, ctx, '#f4a8b8', '#e07a94', '#d8a8e0', '#fbf3e0', '#f6d46a', '#f4d0d8', '#fbf3e0',
            [('right', D / 2 + .95, 1.65, .5, .6, 'landscape', '#e07a94'), ], door_col='#f4a8b8')
    nx0, nx1, ny0, ny1 = ctx['nook']
    # patchwork quilt folded over the futon: a grid of coloured patches
    cols = ['#e0657a', '#f6d46a', '#82b8dc', '#f4efe2', '#58a878', '#f4a8b8']
    for i in range(4):
        for j in range(3):
            x0 = nx0 + .2 + i * .37
            y0 = ny0 + .15 + j * .37
            R.poly('P', [(x0, y0, PZ + .182), (x0 + .35, y0, PZ + .182), (x0 + .35, y0 + .35, PZ + .182), (x0, y0 + .35, PZ + .182)],
                   cols[(i * 2 + j * 3) % 6], normal=(0, 0, 1), tag='quilt')
    # spinning wheel in the front-left corner (wheel, spokes, frame, treadle)
    sw = V((-1.9, -1.55, 0))
    R.torus('W', sw + V((0, 0, .6)), .27, .018, '#8a5a32', maj=12, mn=3, rot=(0, math.pi / 2, 0), tag='spinning wheel')
    R.rod('W', sw + V((0, 0, .6)), sw + V((0, 0, .6 + .27)), .008, '#8a5a32', n=3, tag='spinning wheel')
    R.rod('W', sw + V((0, 0, .6)), sw + V((0, .27, .6)), .008, '#8a5a32', n=3, tag='spinning wheel')
    R.rod('W', sw + V((0, 0, .6)), sw + V((0, -.27, .6)), .008, '#8a5a32', n=3, tag='spinning wheel')
    R.box('W', sw + V((0, 0, .35)), (.05, .05, .7), '#6b4027', ch=0, tag='spinning wheel')
    R.box('W', sw + V((0, .12, .3)), (.06, .5, .04), '#6b4027', ch=0, rot=(.0, 0, 0), tag='spinning wheel')
    R.box('W', sw + V((0, .42, .4)), (.05, .05, .5), '#6b4027', ch=0, tag='spinning wheel')
    R.box('W', sw + V((0, .42, .66)), (.05, .3, .04), '#6b4027', ch=0, tag='spinning wheel')
    R.box('W', sw + V((0, .08, .08)), (.3, .5, .03), '#8a5a32', ch=0, tag='spinning wheel')
    # tea tray on the table: pot, two cups, a plate of biscuits
    R.box('W', (tc[0], tc[1], .78), (.5, .32, .02), '#c9a062', ch=0, tag='tea tray')
    teapot(R, (tc[0] - .1, tc[1], .79), '#f4a8b8', .075)
    teacup(R, (tc[0] + .12, tc[1] - .08, .79), '#f4efe2')
    teacup(R, (tc[0] + .12, tc[1] + .08, .79), '#f4efe2')
    plate(R, (tc[0] + .3, tc[1] - .3, .77), '#f4efe2', .09, '#e07a94')
    # knitting basket by the tatami step, floral pots on the sills, a doily
    basket(R, (-.2, .2, 0), r=.17, h=.14, col='#c9a062', fill='#f4a8b8', n=3, rng=rng, fr=.07)
    sill_pot(R, ctx['fc']['front'][0], 3.5, .85, r=.07, h=.09, pot='#f4efe2', flowers='#f06a8a', seed=3)
    sill_pot(R, ctx['fc']['front'][0], 1.2, .85, r=.07, h=.09, pot='#e07a94', flowers='#ffd35a', seed=4)
