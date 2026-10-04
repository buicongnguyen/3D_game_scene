"""Interior of Kawabe house B (build_interiors.py): the larger home behind the front veranda.

A wooden-floor living room that opens through a wall of sliding glass doors onto the veranda (painted valley view),
a sunken irori hearth with a hanging kettle, a low sofa, a dining table with four chairs, a sewing and hobby corner
in the front-left corner, a bookcase, a stone-floored kitchen along the back-left wall and a stair-less loft shelf
over the back wall. The player comes in through the glass doors at x = 0 (the -Y wall).

Contract extras for the homes: Spot_npc_1 / Spot_npc_2 and decor variants Var_1..Var_3 (pivot groups, meshes only,
no colliders): 1 young family with a baby, 2 retired teacher (books), 3 tailor's home (fabric and patchwork).
"""
import math, random
from mathutils import Vector
import arch_lib
from interior_lib import *  # noqa: F401,F403
from interior_rooms import builder, shelf_unit, IRON, BRASS, DARKW, POST
from interior_kawabe_common import *  # noqa: F401,F403
from interior_kawabe_b_vars import var_family_b, var_teacher_b, var_tailor_b

V = Vector
PLASTER = '#f8e4c4'
SAGE = '#7e9c7a'
HONEY = '#c98f58'


def chair(R, x, y, rot, col='#a8723c', seat='#c98f58'):
    L = Loc((x, y), rot)
    R.box('W', L.p(0, 0, .43), (.42, .42, .05), seat, ch=0, rot=L.rz, tag='chairs')
    R.box('W', L.p(0, .19, .68), (.42, .04, .42), col, ch=0, rot=L.rz, tag='chairs')
    for s in (-1, 1):
        R.box('W', L.p(s * .19, 0, .2), (.04, .4, .4), shade(col, .85), ch=0, rot=L.rz, tag='chairs')
    R.col_c('chair', (x, y, 0), (.46, .46, .9))


def sofa(R, c, rot, col, w=1.8):
    L = Loc(c, rot)
    R.box('P', L.p(0, 0, .2), (w, .82, .4), shade(col, .8), ch=.02, rot=L.rz, tag='sofa')
    R.box('P', L.p(0, .33, .62), (w, .18, .46), col, ch=0, rot=L.rz, tag='sofa')
    for s in (-1, 1):
        R.box('P', L.p(s * (w / 2 - .09), -.05, .4), (.18, .72, .24), shade(col, .9), ch=0, rot=L.rz, tag='sofa')
    for s in (-1, 1):
        R.box('P', L.p(s * (w / 4 - .02), -.04, .47), (w / 2 - .22, .58, .14), shade(col, 1.12), ch=.02, rot=L.rz,
              tag='sofa')
    R.col_c('sofa', (L.o.x, L.o.y, 0), (w + .06, .88, .85))


@builder('interior-kawabe-b')
def build_kawabe_b():
    with lean_boxes():
        return _build_kawabe_b()


def _build_kawabe_b():
    W, D, H = 7.8, 5.8, 3.2
    CEIL = 3.6
    R = Room('interior-kawabe-b', W, D, H, ceil=CEIL, cam_top=3.1)
    fire_mat(R)
    make_variants(R)
    rng = random.Random(2727)
    fc = R.faces()
    xs = lambda x: x + W / 2           # back/left u from x  (back wall)
    FW = .6                            # glass starts here (wooden lower panels below)
    holes = {
        'front': [(.25, W - .25, FW, 2.35)],
        'back': [(1.3, 2.6, 1.1, 2.15), (5.2, 6.5, 1.1, 2.15)],
        'left': [(3.8, 5.1, 0, 2.2)],
        'right': [(1.9, 3.2, 1.1, 2.15)],
    }
    posts = {'back': [.07, 3.0, 5.0, W - .07], 'front': [.07, W - .07], 'left': [.07, 2.6, D - .07],
             'right': [.07, 1.65, 3.45, D - .07]}
    rails = [(2.5, .1), (H - .08, .16)]
    for side, (f, L) in fc.items():
        z0 = FW if side == 'front' else .95
        plaster_wall(R, f, L, 0 if side == 'front' else .95, CEIL + .05, holes[side], PLASTER, mottle=.07, tag='plaster',
                     du=3, dz=3, us=post_splits(posts[side]), zs=rail_splits(rails))
        if side != 'front':
            wainscot(R, f, L, 0, .95, holes[side], SAGE, board=.5, cap=DARKW, seed=len(side))
        posts_and_rails(R, f, L, 0, H, posts[side], rails, col=POST, holes=holes[side])
    # beams and ceiling
    for y in (-.3, 1.6):
        R.box('W', (0, y, H + .14), (W + .1, .3, .3), DARKW, ch=0, tag='beams')
    R.box('W', (0, 1.0, 3.45), (.2, D + .1, .18), DARKW, ch=0, tag='beams')
    board_ceiling(R, CEIL, col='#c89058', board=.6, along='y')
    shadow_shell(R, holes)

    # ---- floors: honey planks, stone kitchen floor in the back-left corner
    KX, KY = -1.6, .7
    plank_floor(R, KX, W / 2, -D / 2, D / 2, z=0, board=.3, seg=2.2, base=HONEY, along='x', seed=3)
    plank_floor(R, -W / 2, KX, -D / 2, KY, z=0, board=.3, seg=2.2, base=HONEY, along='x', seed=4)
    tile_floor(R, -W / 2, KX, KY, D / 2, z=0, tile=.55, cols=('#b3a794', '#a39a8c', '#c2b49c', '#9d958a'), grout='#6e665c',
               checker=False, tag='kitchen stones')
    R.box('W', (KX / 2 - W / 4 + .0, KY, .012), (W / 2 + KX, .06, .024), '#6b4027', ch=0, tag='threshold')
    R.box('W', (KX, (KY + D / 2) / 2, .012), (.06, D / 2 - KY, .024), '#6b4027', ch=0, tag='threshold')

    # ---- front: the wall of sliding glass doors onto the veranda (four bays), wooden lower panels
    ff = fc['front'][0]
    window(R, ff, holes['front'][0], depth=.3, kind='valley', seed=7, frame=POST, cols=4, rows=2, nu=10, nv=4,
           sill=False)
    bays = [.25 + (W - .5) * k / 4 for k in range(5)]
    for u in bays:
        R.fbox(ff, 'W', u, (FW + 2.35) / 2, .02, .12, 2.35 - FW + .12, .1, POST, ch=0, tag='door posts')
    for a, b in zip(bays, bays[1:]):
        R.fbox(ff, 'W', (a + b) / 2, FW / 2, .02, b - a - .12, FW - .06, .03, '#a8723c', ch=0, tag='door boards')
        R.fbox(ff, 'W', (a + b) / 2, FW / 2, .04, b - a - .3, FW - .24, .02, '#c08a52', ch=0, tag='door boards')
    R.fbox(ff, 'W', W / 2 - .02, 1.1, .08, .03, .22, .03, BRASS, ch=0, tag='handles')
    R.fbox(ff, 'W', W / 2 + .02, 1.1, .08, .03, .22, .03, BRASS, ch=0, tag='handles')
    # ---- left: the plank door of the kitchen, the sewing corner
    fl = fc['left'][0]
    door_inside(R, 'left', 4.45, w=1.3, h=2.2, col='#8a5a32', frame=POST, glass=False)
    # sewing corner (front-left): table in front of the glass, chest on the left wall, pegboard above
    sl = Loc((-3.0, -2.5), 0.0)
    R.box('W', sl.p(0, 0, .76), (1.3, .7, .05), '#c98f58', ch=0, rot=sl.rz, tag='sewing table')
    for s in (-1, 1):
        R.box('W', sl.p(s * .6, 0, .37), (.06, .62, .74), '#a8723c', ch=0, rot=sl.rz, tag='sewing table')
    R.box('W', sl.p(0, .3, .5), (1.2, .03, .4), '#8a5a32', ch=0, rot=sl.rz, tag='sewing table')
    R.col_c('sewing table', (-3.0, -2.5, 0), (1.34, .74, .8))
    # sewing machine
    mc = sl.p(.1, .05, .785)
    R.box('K', mc + V((0, 0, .03)), (.34, .16, .06), '#2a2a30', ch=0, tag='sewing machine')
    R.box('K', mc + V((.12, .03, .17)), (.1, .1, .22), '#d9d4c8', ch=0, tag='sewing machine')
    R.box('K', mc + V((-.02, .03, .27)), (.34, .09, .08), '#d9d4c8', ch=0, tag='sewing machine')
    R.cyl('M', mc + V((.2, .0, .14)), .05, .02, '#30343e', n=8, rot=(math.pi / 2, 0, 0), tag='sewing machine')
    # stool
    st = V((-3.0, -1.9, 0))
    R.cyl('W', st + V((0, 0, .44)), .19, .05, '#a8723c', n=8, tag='stool')
    for a in range(3):
        ang = a * TAU / 3 + .5
        R.rod('W', st + V((math.cos(ang) * .12, math.sin(ang) * .12, .02)), st + V((math.cos(ang) * .15, math.sin(ang) * .15, .43)),
              .02, '#8a5a32', n=4, tag='stool')
    LT = Loc((-W / 2 + .23, -1.2, 0), AGAINST['left'])
    chest_lean(R, LT, .95, .44, .9, 3, '#8a4a2a', pull=IRON, cols_top=2)
    R.col_c('sewing chest', (-W / 2 + .23, -1.2, 0), (.48, .99, .9), top=.92)
    # pegboard with spools
    ub = R.u_of('left', y=-2.3)
    R.fbox(fl, 'W', ub, 1.7, .03, 1.1, .8, .03, '#c08a52', ch=0, tag='pegboard')
    for k, col in enumerate(('#d8342c', '#e0a93a', '#2d78c8', '#3f9a4a', '#a050a0', '#f4efe2')):
        R.fbox(fl, 'K', ub - .42 + (k % 3) * .42, 1.9 - (k // 3) * .35, .07, .08, .1, .06, col, ch=0, tag='spools')
    # ---- kitchen: iron stove, sink counter under the window, tall dish cupboard
    fb = fc['back'][0]
    window(R, fb, holes['back'][0], depth=.26, kind='river', seed=3, frame=POST, cols=2, rows=2, nu=4, nv=3, casing=False)
    window(R, fb, holes['back'][1], depth=.26, kind='village', seed=11, frame=POST, cols=2, rows=2, nu=4, nv=3,
           casing=False)
    fr_ = fc['right'][0]
    window(R, fr_, holes['right'][0], depth=.26, kind='river', seed=6, frame=POST, cols=2, rows=2, nu=4, nv=3,
           casing=False)
    cc = V((-2.05, D / 2 - .31, 0))
    R.box('W', cc + V((0, 0, .4)), (1.6, .6, .8), '#8a5a32', ch=0, tag='counter')
    for k in range(3):
        R.box('W', cc + V((-.5 + k * .5, -.305, .4)), (.46, .012, .7), '#a46e3e', ch=0, tag='counter doors')
    R.box('W', cc + V((0, 0, .835)), (1.66, .66, .05), '#c98f55', ch=0, tag='counter top')
    R.box('M', cc + V((.3, .02, .862)), (.55, .38, .01), '#8a9298', ch=0, tag='sink')
    R.box('M', cc + V((.3, .02, .868)), (.49, .32, .008), '#4a5058', ch=0, tag='sink')
    R.rod('M', cc + V((.3, .24, .86)), cc + V((.3, .24, 1.1)), .015, '#c9a062', n=4, tag='tap')
    R.rod('M', cc + V((.3, .24, 1.1)), cc + V((.3, .12, 1.1)), .015, '#c9a062', n=4, tag='tap')
    R.col_c('counter', (cc.x, cc.y, 0), (1.66, .66, .9), top=.9)
    # iron stove at the left end of the counter, pipe to the ceiling
    sc = V((-3.3, D / 2 - .33, 0))
    R.box('K', sc + V((0, 0, .5)), (.6, .56, .7), '#2a2d36', ch=0, tag='stove')
    R.box('K', sc + V((0, 0, .87)), (.64, .6, .04), '#1a1c22', ch=0, tag='stove')
    R.box('K', sc + V((.0, -.285, .52)), (.3, .01, .22), '#5a4030', ch=0, tag='stove')
    for dx in (-.14, .14):
        R.cyl('K', sc + V((dx, 0, .9)), .09, .01, '#101216', n=8, tag='stove')
    R.rod('M', sc + V((0, .12, .9)), sc + V((0, .12, CEIL + .05)), .045, '#30343e', n=6, tag='stove pipe')
    R.lathe('M', [(0, 0), (.12, 0), (.15, .1), (.13, .16), (0, .17)], sc + V((-.14, 0, .9)), '#44485a', n=8, tag='stove pot')
    R.col_c('stove', (sc.x, sc.y, 0), (.66, .62, .9), top=.92)
    # back wall centre: chest under the loft shelf, the loft with its rail and ladder
    LC = Loc((.1, D / 2 - .23, 0), AGAINST['back'])
    chest_lean(R, LC, 1.9, .44, .9, 3, '#8a4a2a', pull=IRON, cols_top=3)
    R.col_c('back chest', (.1, D / 2 - .23, 0), (1.94, .48, .9), top=.92)
    lz = 2.2
    R.box('W', (.1, D / 2 - .34, lz), (2.2, .68, .06), '#9a5a32', ch=0, tag='loft')
    for x in (-.7, .1, .9):
        R.beam('W', (x, D / 2 - .03, 1.7), (x, D / 2 - .62, lz - .03), .06, .05, '#6b4027', ch=0, tag='loft braces')
    R.rod('W', (-.98, D / 2 - .68, lz + .5), (1.18, D / 2 - .68, lz + .5), .025, '#6b4027', n=4, tag='loft rail')
    for k in range(7):
        x = -.98 + 2.16 * k / 6
        R.rod('W', (x, D / 2 - .68, lz + .03), (x, D / 2 - .68, lz + .5), .015, '#8a5a32', n=3, tag='loft rail')
    # stacked futons and wicker baskets up on the loft
    for k, col in enumerate(('#2d4f8a', '#f1e6cc', '#c8473a')):
        R.box('P', (-.55, D / 2 - .38, lz + .1 + k * .17), (.7, .5, .15), col, ch=0, tag='loft futon')
    basket_lean(R, (.55, D / 2 - .4, lz + .03), r=.2, h=.2, col='#a47c44', fill=None, n=2, rng=rng)
    R.box('W', (1.0, D / 2 - .42, lz + .15), (.28, .34, .24), '#b07a44', ch=0, tag='loft crate')
    # wall ladder to the loft
    lx = -1.03
    for s in (-1, 1):
        R.box('W', (lx + s * .17, D / 2 - .06, (lz + .1) / 2), (.05, .05, lz + .1), '#a8723c', ch=0, tag='ladder')
    for k in range(7):
        R.box('W', (lx, D / 2 - .06, .3 + k * .3), (.34, .04, .04), '#8a5a32', ch=0, tag='ladder')
    # buffet under the right window
    BC = Loc((2.05, D / 2 - .23, 0), AGAINST['back'])
    chest_lean(R, BC, 1.85, .44, .85, 2, '#9a5a32', pull=IRON, cols_top=3)
    R.col_c('buffet', (2.05, D / 2 - .23, 0), (1.89, .48, .87), top=.9)

    # ---- right: bookcase, window
    BL = Loc((W / 2 - .2, 2.0, 0), AGAINST['right'])
    tops = shelf_unit(R, BL, 1.6, .36, 2.15, 5, '#9a5a32', back='#6b4027')
    R.col_c('bookcase', (W / 2 - .2, 2.0, 0), (.4, 1.64, 2.15), top=2.15, view=True)

    # ---- the irori hearth with its hanging kettle
    ic = V((-1.1, -.3, 0))
    for s in (-1, 1):
        R.box('W', ic + V((0, s * .415, .05)), (.97, .13, .1), '#5a3726', ch=0, tag='irori')
        R.box('W', ic + V((s * .415, 0, .05)), (.13, .7, .1), '#5a3726', ch=0, tag='irori')
    R.box('P', ic + V((0, 0, .04)), (.7, .7, .02), '#6a625a', ch=0, tag='irori ash')
    R.box('F', ic + V((0, 0, .06)), (.34, .34, .03), '#ff8a30', ch=0, tag='irori fire')
    for k in range(3):
        R.cyl('W', ic + V((0, 0, .09)), .03, .38, '#4a2e20', n=5, rot=(0, math.pi / 2, k * 1.05 + .3), tag='irori logs')
    R.rod('M', (ic.x, ic.y, 3.2), (ic.x, ic.y, 1.27), .015, IRON, n=4, tag='hook')
    R.box('W', (ic.x, ic.y, 1.27), (.5, .04, .04), '#4a2e20', ch=0, tag='hook')
    kettle(R, (ic.x, ic.y, 1.0), r=.13)
    R.col_c('irori', (ic.x, ic.y, 0), (1.04, 1.04, .62))
    R.node('Light_3', (ic.x, ic.y, .3))['fire'] = 1
    # ---- dining table and chairs, living-room sofa and coffee table
    dt = V((1.6, .9, 0))
    R.box('W', dt + V((0, 0, .73)), (1.5, .9, .05), '#c98f58', ch=0, tag='dining table')
    for sx in (-1, 1):
        for sy in (-1, 1):
            R.box('W', dt + V((sx * .66, sy * .36, .35)), (.07, .07, .7), '#a8723c', ch=0, tag='dining table')
    R.col_c('dining table', (dt.x, dt.y, 0), (1.54, .94, .78))
    for x in (1.25, 1.95):
        chair(R, x, 1.8, 0.0)
        chair(R, x, .0, math.pi)
    pendant_lean(R, (dt.x, dt.y, 2.25), r=.24, col='#2f9a8a', cord=CEIL - 2.25 - .16)
    R.node('Light_1', (dt.x, dt.y, 2.1))
    sofa(R, (2.4, -1.15), 0.0, '#6f9a86')
    ct = V((2.4, -2.1, 0))
    R.box('W', ct + V((0, 0, .38)), (1.0, .5, .04), '#c98f58', ch=0, tag='coffee table')
    for sx in (-1, 1):
        R.box('W', ct + V((sx * .44, 0, .18)), (.05, .44, .36), '#a8723c', ch=0, tag='coffee table')
    R.col_c('coffee table', (ct.x, ct.y, 0), (1.04, .54, .42))
    paper_lamp_lean(R, (2.4, -1.6, 2.4), r=.27, h=.44, cord=CEIL - 2.4 - .22)
    R.node('Light_2', (2.4, -1.6, 2.25))

    # ---- residents, spawn, exit
    spot(R, 'Spot_npc_1', (-2.0, -.3, 0), (ic.x, ic.y, 0))
    spot(R, 'Spot_npc_2', (-2.3, 1.55, 0), (0, 0, 0))
    R.node('Spawn', (0.0, -.95, 0))
    R.node('Exit', (0, -D / 2 + .55, 0))
    R.shell_cols(surface='wood')

    env = dict(R=R, W=W, D=D, H=H, CEIL=CEIL, fc=fc, ic=ic, dt=dt, ct=ct, rng=rng, BL=BL, tops=tops, LT=LT, LC=LC, BC=BC)
    var_family_b(env)
    var_teacher_b(env)
    var_tailor_b(env)
    return R.finish_room()
