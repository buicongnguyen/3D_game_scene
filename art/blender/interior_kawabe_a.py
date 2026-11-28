# © 2026 Bui Cong Nguyen · solluxlabs.com
"""Interior of Kawabe house A (build_interiors.py): a cosy riverside family home behind the lattice front door.

Stone genkan with a getabako, a raised tatami area with a low table, an oshiire (futon cupboard), laundry hung to dry
on bamboo poles, and a stone-floored kitchen corner with a clay kamado (kettle on the fire), a sink under the river
window and a dish cupboard. The door is in the -Y wall at x = 0, like the exterior's lattice door.

Contract extras for the homes: Spot_npc_1 / Spot_npc_2 (resident spots, +Z toward where they look) and three decor
variants Var_1..Var_3 (pivot groups, meshes only, no colliders): 1 young family, 2 elderly couple, 3 fisher's home.
"""
import math, random
from mathutils import Vector
import arch_lib
from interior_lib import *  # noqa: F401,F403
from interior_rooms import builder, drawer_chest, shelf_unit, bun, IRON, BRASS, DARKW, POST
from interior_kawabe_common import *  # noqa: F401,F403
from interior_kawabe_a_vars import var_family, var_elders, var_fisher

V = Vector
PLASTER = '#f6e6c2'
BLUE = '#6f93a8'        # river-blue wainscot
BENG = '#9a3b2a'        # bengara red (the lattice door)
SAGE = '#5f8a6a'


def kotatsu(R, c, s=1.3, top_s=1.0, h=.39, quilt='#c8473a', border='#f1e6cc', board='#9a5a32'):
    """A horigotatsu: a quilt-draped low table over a sunken foot well (people sit on the cushions with their legs down
    under the quilt, which is how the Sit clip's 0.45 m seat height works at a low table). Returns the board top."""
    c = V(c)
    R.box('P', c + V((0, 0, .15)), (s, s, .3), quilt, ch=.02, tag='kotatsu quilt')
    R.box('P', c + V((0, 0, .33)), (s - .12, s - .12, .06), shade(quilt, 1.08), ch=.02, tag='kotatsu quilt')
    for k in (-1, 1):
        R.box('P', c + V((k * (s / 2 + .004), 0, .14)), (.006, s - .1, .07), border, ch=0, tag='kotatsu quilt')
        R.box('P', c + V((0, k * (s / 2 + .004), .14)), (s - .1, .006, .07), border, ch=0, tag='kotatsu quilt')
    R.box('W', c + V((0, 0, h - .015)), (top_s, top_s, .03), board, ch=.01, tag='kotatsu board')
    return c.z + h


def cranes_set(R, tc, top):
    """Var_scene_cranes: paper cranes, coloured squares, a teapot and two cups in the corner between Granny's (north)
    and Yui's (west) cushions. One Paint mesh."""
    with group(R, 'Var_scene_cranes'):
        def crane(c, s, rot, col):
            L = Loc(c, rot)
            P = lambda x, y, z: L.p(x * s, y * s, z * s)
            tris = [[P(-.03, 0, .02), P(.03, 0, .02), P(0, -.07, .045)], [P(-.03, 0, .02), P(.03, 0, .02), P(0, .07, .045)],
                    [P(-.035, 0, .02), P(.035, 0, .02), P(0, 0, 0)], [P(.015, 0, .02), P(.035, 0, .02), P(.075, 0, .075)],
                    [P(-.015, 0, .02), P(-.035, 0, .02), P(-.075, 0, .06)]]
            for t in tris:
                R.poly('K', t, col, tag='cranes')
                R.poly('K', t[::-1], col, tag='cranes')
        x0, y0 = tc.x - .22, tc.y + .2
        for k, (dx, dy, rot, col) in enumerate(((-.1, .1, .4, '#e8504a'), (.06, .16, -.6, '#f0b429'), (-.16, -.06, 1.2, '#4aa3df'),
                                                (.12, -.02, 2.4, '#f06a8a'), (.0, .0, -1.8, '#f4efe2'))):
            crane((x0 + dx, y0 + dy, top + .002), 1.25 if k == 4 else 1.0, rot, col)
        for k, (dx, dy, rot, col) in enumerate(((-.05, -.2, .2, '#3f9a4a'), (.1, -.16, -.3, '#e8504a'), (.2, .1, .5, '#a050a0'),
                                                (-.22, .2, .1, '#f0b429'), (.18, -.22, .9, '#4aa3df'), (-.25, -.15, -.4, '#f06a8a'))):
            R.box('K', (x0 + dx, y0 + dy, top + .002 + k * .0012), (.15, .15, .003), col, ch=0, rot=(0, 0, rot), tag='paper squares')
        teapot_lean(R, (tc.x + .2, tc.y + .28, top), col='#2f4c86', r=.065)
        for dx, dy in ((-.32, .38 - .2), (.0, .36)):
            R.lathe('K', [(0, 0), (.025, 0), (.035, .055), (.03, .055), (0, .006)], (tc.x + dx, tc.y + dy, top), '#e8e0ce', n=8,
                    tag='cups')


@builder('interior-kawabe-a')
def build_kawabe_a():
    with lean_boxes():
        return _build_kawabe_a()


def _build_kawabe_a():
    W, D, H = 7.2, 6.0, 3.3          # 2026-11-28: enlarged from 6.0 x 5.0 (kotatsu for four, the cranes scene)
    CEIL = 3.7
    R = Room('interior-kawabe-a', W, D, H, ceil=CEIL, cam_top=3.3)
    fire_mat(R)
    make_variants(R)
    R.pivot('Var_scene_cranes', V((0, 0, 0)))
    rng = random.Random(1717)
    fc = R.faces()
    PZ = .26                       # raised floor
    TS = PZ + .05                  # tatami surface
    GY = -1.95                     # step edge (front genkan strip is y < GY)
    KX = 1.9                       # the raised floor ends here; the stone kitchen zone is x > KX
    xs = lambda x: W / 2 - x       # front/right wall u from x

    holes = {
        'front': [(W / 2 - .5, W / 2 + .5, 0, 2.1), (5.2, 6.6, 1.05, 2.15), (.6, 2.0, 1.05, 2.15)],
        'back': [(1.25, 2.25, 0, 2.3), (5.5, 6.8, 1.2, 2.25)],
        'left': [(2.9, 3.9, 1.1, 2.1)],
        'right': [(2.0, 3.1, 1.1, 2.1)],
    }
    posts = {'back': [.07, W - .07], 'front': [.07, 2.85, 4.35, W - .07],
             'left': [.07, 2.65, D - .07], 'right': [.07, 1.7, 3.28, D - .07]}
    rails = [(2.5, .1), (H - .08, .16)]
    for side, (f, L) in fc.items():
        plaster_wall(R, f, L, .95, CEIL + .05, holes[side], PLASTER, mottle=.07, tag="plaster", du=3, dz=3,
                     us=post_splits(posts[side]), zs=rail_splits(rails))
        wainscot(R, f, L, 0, .95, holes[side], BLUE, board=.5, cap=DARKW, seed=len(side))
        posts_and_rails(R, f, L, 0, H, posts[side], rails, col=POST, holes=holes[side])
    # raised-floor skirting
    fl, fb = fc['left'][0], fc['back'][0]
    for a_, b_ in spans(GY + D / 2 + .16, D, PZ + .05, []):
        R.fbox(fl, 'W', (a_ + b_) / 2, PZ + .05, .02, b_ - a_, .1, .03, DARKW, tag='skirting')
    for a_, b_ in spans(0, KX + W / 2, PZ + .05, holes['back']):
        R.fbox(fb, 'W', (a_ + b_) / 2, PZ + .05, .02, b_ - a_, .1, .03, DARKW, tag='skirting')
    # tie beams, ceiling
    for y in (-1.2, 1.8):
        R.box('W', (0, y, H + .14), (W + .1, .22, .28), DARKW, ch=.02, tag='beams')
    R.box('W', (0, .3, 3.55), (.18, D + .1, .18), DARKW, ch=.02, tag='beams')
    board_ceiling(R, CEIL, col='#c89058', board=.34, along='y')
    shadow_shell(R, {k: [h for h in v] for k, v in holes.items()})

    # ---- floors: stone genkan + kitchen zone, polished step, plank base and tatami on the raised floor
    stones = ('#b3a794', '#a39a8c', '#c2b49c', '#9d958a')
    tile_floor(R, -W / 2, W / 2, -D / 2, GY, z=0, tile=.52, cols=stones, grout='#6e665c', checker=False,
               tag='genkan stones')
    tile_floor(R, KX, W / 2, GY, D / 2, z=0, tile=.52, cols=stones, grout='#6e665c', checker=False,
               tag='kitchen stones')
    R.box('W', ((-W / 2 + KX) / 2, GY + .01, PZ / 2), (W / 2 + KX, .02, PZ), '#6b4027', ch=0, tag='step')
    R.box('W', ((-W / 2 + KX) / 2, GY + .08, PZ - .045), (W / 2 + KX, .16, .09), '#7a4a2c', ch=.015, tag='step')
    R.box('W', (KX + .01, (GY + D / 2) / 2, PZ / 2), (.02, D / 2 - GY, PZ), '#6b4027', ch=0, tag='step')
    R.box('W', (KX - .08, (GY + .16 + D / 2) / 2, PZ - .045), (.16, D / 2 - GY - .16, .09), '#7a4a2c', ch=.015,
          tag='step')
    plank_floor(R, -W / 2, KX, GY + .16, D / 2, z=PZ, board=.3, seg=2.0, base='#c98f58', along='x', seed=2)
    for ix, x0 in enumerate((-2.9, -1.1)):
        for iy, y0 in enumerate((-1.75, -.85, .05, .95, 1.85)):
            tatami_lean(R, x0, y0, PZ, along_x=True, straw='#d4c86e', heri='#2d4f8a', rng=rng)
    R.col('platform', (-W / 2 - .2, GY, -.5), (KX, D / 2 + .2, PZ), walk=True, surface='wood')

    # ---- front: bengara-red door, windows onto the lane, getabako, umbrella stand, boots, broom
    door_inside(R, 'front', W / 2, w=1.0, h=2.1, col=BENG, frame=POST)
    ff = fc['front'][0]
    window(R, ff, holes['front'][1], depth=.24, kind='village', seed=5, frame=POST, cols=2, rows=1, nu=4, nv=3)
    window(R, ff, holes['front'][2], depth=.24, kind='village', seed=8, frame=POST, cols=2, rows=1, nu=4, nv=3)
    L = Loc((-2.5, -D / 2 + .22), AGAINST['front'])
    chest_lean(R, L, 1.6, .4, .9, 2, '#8a4a2a', pull=IRON, cols_top=3)
    plant_lean(R, L.p(-.5, 0, .93), r=.1, h=.14, pot='#2f6f9a', leaf='#4f9a3a', flowers='#f07aa0', seed=3)
    R.cyl('K', L.p(.45, 0, .94), .06, .012, '#2d4f8a', n=10, tag='getabako mat')
    R.col_c('getabako', (-2.5, -D / 2 + .22, 0), (1.64, .44, .9), top=.94)
    uc = V((.95, -D / 2 + .3, 0))
    R.cyl('K', uc + V((0, 0, .25)), .13, .5, '#2f4c86', n=12, ch=.01, tag='umbrella stand')
    R.lathe('P', [(0.0, 1.05), (.05, 1.0), (.1, .7), (.09, .45), (.03, .42), (0, .42)], uc, '#d8342c', n=8,
            tag='umbrella')
    R.rod('W', uc + V((0, 0, .1)), uc + V((0, 0, 1.18)), .012, '#c9a062', n=5, tag='umbrella')
    R.col_c('umbrella', (uc.x, uc.y, 0), (.32, .32, 1.1))
    for i, x in enumerate((1.5, 1.8)):
        R.box('K', (x, -2.7, .17), (.1, .13, .34), '#3f6a8a', ch=0, tag='boots')
        R.box('K', (x, -2.75, .04), (.1, .2, .08), '#3f6a8a', ch=0, tag='boots')
    for x in (-.3, -.05):
        R.box('W', (x, -2.5, .03), (.1, .24, .03), '#c9a062', ch=.008, tag='geta')
        R.box('W', (x, -2.5, .012), (.08, .03, .03), DARKW, ch=0, tag='geta')
    R.rod('W', (3.15, -2.92, .05), (3.22, -2.88, 1.1), .014, '#b08a4a', n=5, tag='broom')
    R.box('W', (3.17, -2.9, .12), (.2, .1, .22), '#c9b060', ch=.02, rot=(0, 0, .3), tag='broom')
    # peg board on the right wall, over the genkan: variants hang coats and hats here
    fr = fc['right'][0]
    ub = R.u_of('right', y=-2.4)
    R.fbox(fr, 'W', ub, 1.55, .03, 1.0, .1, .035, POST, ch=.01, tag='peg board')
    for k in range(4):
        R.B('M').rod(fr.p(ub - .36 + k * .24, 1.55, .05), fr.p(ub - .36 + k * .24, 1.52, .13), .01, n=5,
                     tint=R.t('M', BRASS), tag='pegs')

    # ---- left: tansu with the family corner above it, window, oshiire (futon cupboard)
    LT = Loc((-W / 2 + .23, -.88, PZ), AGAINST['left'])
    chest_lean(R, LT, 1.05, .44, .95, 3, '#8a4a2a', pull=IRON, cols_top=2)
    R.col_c('tansu', (-W / 2 + .23, -.88, PZ), (.48, 1.09, .95), top=PZ + .97)
    window(R, fl, holes['left'][0], depth=.22, kind='village', seed=14, frame=POST, cols=2, rows=2, casing=False)
    fr_ = fc['right'][0]
    window(R, fr_, holes['right'][0], depth=.26, kind='river', seed=6, frame=POST, cols=3, rows=2, casing=False, nu=4, nv=3)
    # oshiire: carcass shell, two fusuma panels (one slid open to the futons)
    y0, y1, zt = 1.6, D / 2, 2.05
    cx = -W / 2 + .375
    R.box('P', (-W / 2 + .03, (y0 + y1) / 2, (PZ + 2.6) / 2), (.06, y1 - y0, 2.6 - PZ), '#e0cba0', ch=0, tag='oshiire')
    for y in (y0 + .02, y1 - .02):
        R.box('P', (cx, y, (PZ + 2.6) / 2), (.75, .04, 2.6 - PZ), '#e0cba0', ch=0, tag='oshiire')
    R.box('W', (cx, (y0 + y1) / 2, PZ + .02), (.75, y1 - y0, .04), '#c89058', ch=0, tag='oshiire')
    R.box('W', (cx, (y0 + y1) / 2, PZ + .84), (.75, y1 - y0, .04), '#b07a44', ch=.006, tag='oshiire')
    R.box('W', (cx, (y0 + y1) / 2, zt), (.78, y1 - y0 + .04, .05), '#8a5a32', ch=.006, tag='oshiire')
    R.box('W', (cx, (y0 + y1) / 2, 2.62), (.78, y1 - y0 + .04, .04), '#8a5a32', ch=.006, tag='oshiire')
    fy = (2.32 + y1) / 2
    zz = PZ + .06
    for k, col in enumerate(['#2d4f8a', '#f1e6cc', '#c8473a', '#e0a93a']):
        hh = .13 if k != 1 else .1
        R.box('P', (cx - .02, fy + rng.uniform(-.02, .02), zz + hh / 2), (.6, .62, hh), col, ch=0, tag='futon')
        zz += hh
    R.box('P', (cx - .02, fy, zz + .04), (.45, .3, .08), '#f4ead0', ch=0, tag='futon')
    R.box('P', (cx - .02, fy, PZ + 1.0), (.5, .5, .24), '#8a3a6a', ch=0, tag='bundles')
    xf = -W / 2 + .75
    for ya, yb, dx in ((y0 + .02, 2.34, .0),):
        yc = (ya + yb) / 2
        R.box('P', (xf + dx, yc, (PZ + zt) / 2), (.03, yb - ya - .02, zt - PZ - .04), '#f6edd6', ch=0, tag='fusuma')
        for j, (py, s, col) in enumerate(((.25, .34, '#4f86c0'), (.5, .28, '#2d4f8a'), (.62, .22, '#7aa6d0'))):
            R.poly('P', [(xf + dx + .018, ya + py - s, PZ + .3), (xf + dx + .018, ya + py + s, PZ + .3),
                         (xf + dx + .018, ya + py, PZ + .3 + s * 1.6)], col, normal=(1, 0, 0), tag='fusuma')
        R.cyl('K', (xf + dx + .02, ya + .5, PZ + 1.45), .1, .006, '#e8b640', n=14, rot=(0, math.pi / 2, 0),
              tag='fusuma')
        for (py, pz, sy, sz) in ((yc, PZ + .03, yb - ya, .05), (yc, zt - .03, yb - ya, .05), (ya + .02, (PZ + zt) / 2, .05, zt - PZ),
                                 (yb - .02, (PZ + zt) / 2, .05, zt - PZ)):
            R.box('W', (xf + dx + .005, py, pz), (.04, sy, sz), '#3a2418', ch=.006, tag='fusuma')
        R.box('M', (xf + dx + .03, yb - .12, PZ + .9), (.012, .05, .09), IRON, ch=0, tag='fusuma')
    # second panel, slid behind the first (only its frame edge shows)
    R.box('P', (xf - .05, 2.12, (PZ + zt) / 2), (.025, .6, zt - PZ - .04), '#efe3c8', ch=0, tag='fusuma')
    R.box('P', (xf - .01, (y0 + y1) / 2, 2.34), (.03, y1 - y0 - .04, .56), '#f6edd6', ch=0, tag='fusuma')
    R.box('W', (xf + .005, (y0 + y1) / 2, 2.34), (.04, .04, .56), '#3a2418', ch=0, tag='fusuma')
    R.col('oshiire', (-W / 2 - .2, y0 - .05, -.5), (-W / 2 + .8, y1 + .1, 2.65))

    # ---- back: the back door (to the garden), a display shelf, the kitchen window and counter
    fb = fc['back'][0]
    door_inside(R, 'back', 1.75, w=1.0, h=2.3, col=SAGE, frame=POST)
    window(R, fb, holes['back'][1], depth=.26, kind='river', seed=3, frame=POST, cols=3, rows=2, casing=False, nu=4, nv=3)
    for k, z in enumerate((1.55, 2.02)):
        R.box('W', (.25, D / 2 - .12, z), (1.7, .24, .04), '#9a5a32', ch=.008, tag='display shelf')
        for x in (-.5, 1.0):
            R.box('W', (x, D / 2 - .06, z - .1), (.04, .1, .18), POST, ch=.004, tag='display shelf')
    # ---- kitchen: counter with a sink under the river window, dish cupboard in the corner
    cc = V((2.58, D / 2 - .31, 0))
    R.box('W', cc + V((0, 0, .4)), (1.26, .6, .8), '#8a5a32', ch=.012, tag='counter')
    for k in range(2):
        R.box('W', cc + V((-.31 + k * .62, -.305, .4)), (.56, .012, .7), '#a46e3e', ch=.006, tag='counter doors')
        R.box('M', cc + V((-.31 + k * .62 + (.2 if k == 0 else -.2), -.325, .5)), (.025, .02, .12), IRON, ch=0,
              tag='counter pulls')
    R.box('W', cc + V((0, 0, .835)), (1.32, .66, .05), '#c98f55', ch=.012, tag='counter top')
    R.box('M', cc + V((-.28, .02, .862)), (.52, .38, .01), '#8a9298', ch=.003, tag='sink')
    R.box('M', cc + V((-.28, .02, .868)), (.46, .32, .008), '#4a5058', ch=0, tag='sink')
    R.rod('M', cc + V((-.28, .24, .86)), cc + V((-.28, .24, 1.08)), .015, '#c9a062', n=6, tag='tap')
    R.rod('M', cc + V((-.28, .24, 1.08)), cc + V((-.28, .12, 1.08)), .015, '#c9a062', n=6, tag='tap')
    R.col_c('counter', (cc.x, cc.y, 0), (1.34, .68, .9), top=.9)
    mz = V((3.4, D / 2 - .55, 0))
    R.box('W', mz + V((0, 0, .85)), (.42, 1.06, 1.7), '#9a5a32', ch=.012, tag='dish cupboard')
    for k in range(2):
        R.box('W', mz + V((-.221, -.26 + k * .52, 1.2)), (.012, .48, .62), '#b07a44', ch=.006, tag='dish cupboard')
        R.box('W', mz + V((-.221, -.26 + k * .52, .4)), (.012, .48, .62), '#a46e3e', ch=.006, tag='dish cupboard')
        R.box('M', mz + V((-.235, -.08 + k * .52, .8)), (.02, .03, .12), IRON, ch=0, tag='dish cupboard')
    R.box('W', mz + V((0, 0, 1.71)), (.46, 1.1, .04), '#7a4a2a', ch=.006, tag='dish cupboard')
    R.col_c('dish cupboard', (mz.x, mz.y, 0), (.46, 1.1, 1.72))
    # right wall: water jar by the window
    jc = V((3.35, .5, 0))
    R.lathe('K', [(0, 0), (.2, 0), (.26, .2), (.26, .42), (.2, .58), (.16, .62), (.2, .64), (0, .64)], jc, '#6b5a4a', n=12,
            tag='water jar')
    R.cyl('W', jc + V((0, 0, .66)), .21, .03, '#c9a062', n=12, ch=.006, tag='water jar')
    R.rod('W', jc + V((.1, .0, .7)), jc + V((.35, .0, .92)), .012, '#c9a062', n=5, tag='ladle')
    R.col_c('water jar', (jc.x, jc.y, 0), (.54, .54, .7))

    # ---- the kamado: clay stove with two fire mouths, an iron kettle on top, hood and chimney
    KL = Loc((3.32, -.65, 0), AGAINST['right'])
    w_, d_, h_ = 1.0, .56, .78
    R.box('P', KL.p(0, 0, .12), (w_ + .04, d_ + .04, .24), '#8a8070', ch=.02, rot=KL.rz, tag='kamado base')
    R.box('P', KL.p(0, 0, .24 + (h_ - .24) / 2), (w_, d_, h_ - .24), '#d8c8a8', ch=.025, rot=KL.rz, tag='kamado')
    R.box('K', KL.p(0, 0, h_ + .02), (w_ + .06, d_ + .06, .04), '#3a2e28', ch=.01, rot=KL.rz, tag='kamado top')
    for s in (-1, 1):
        R.box('K', KL.p(s * .24, -d_ / 2 - .006, .46), (.26, .02, .24), '#1a1210', ch=.004, rot=KL.rz, tag='kamado mouth')
        R.box('F', KL.p(s * .24, -d_ / 2 - .02, .4), (.19, .012, .13), '#ff9a3a', ch=0, rot=KL.rz, tag='kamado fire')
        R.cyl('W', KL.p(s * .24, -d_ / 2 - .035, .34), .028, .22, '#4a2e20', n=5, rot=(0, math.pi / 2, KL.r),
              tag='kamado log')
        R.cyl('M', KL.p(s * .24, 0, h_ + .046), .1, .012, '#2a2d36', n=10, tag='kamado ring')
    kettle(R, KL.p(-.24, 0, h_ + .05), r=.11)
    R.lathe('M', [(0, 0), (.14, 0), (.17, .1), (.15, .17), (0, .18)], KL.p(.24, 0, h_ + .05), '#2a2d36', n=12, tag='pot')
    R.cyl('W', KL.p(.24, 0, h_ + .24), .15, .03, '#c9a062', n=12, tag='pot')
    R.sphere('W', KL.p(.24, 0, h_ + .28), .03, '#6b4a2a', seg=5, rings=3, tag='pot')
    R.box('P', KL.p(0, .02, 1.62), (.82, .5, .34), '#e8dcc0', ch=.02, rot=KL.rz, tag='hood')
    R.box('P', KL.p(0, .04, 1.98), (.34, .36, .4), '#d9cdb0', ch=.01, rot=KL.rz, tag='hood')
    R.box('P', KL.p(0, .06, (2.18 + CEIL + .05) / 2), (.34, .34, CEIL + .05 - 2.18), '#bfae8c', ch=.008, rot=KL.rz,
          tag='chimney')
    for k, x in enumerate((-.3, -.05, .22)):
        R.rod('M', KL.p(x, -.27, 1.74), KL.p(x, -.27, 1.62), .005, IRON, n=3, tag='hood hooks')
    R.rod('W', KL.p(-.3, -.28, 1.6), KL.p(-.3, -.28, 1.3), .014, '#c9a062', n=5, tag='ladle')
    R.sphere('M', KL.p(-.3, -.28, 1.27), .05, '#7a8088', seg=7, rings=4, tag='ladle')
    R.cyl('M', KL.p(.22, -.29, 1.4), .11, .02, '#30343e', n=10, rot=(math.pi / 2, 0, KL.r), tag='pan')
    R.rod('M', KL.p(.22, -.3, 1.4), KL.p(.22, -.3, 1.62), .012, '#30343e', n=5, tag='pan')
    R.col_c('kamado', (3.32, -.65, 0), (.64, 1.06, .8))
    R.node('Light_3', KL.p(0, -d_ / 2 - .12, .42))['fire'] = 1
    # firewood basket by the stove
    basket_lean(R, (2.93, -1.28, 0), r=.24, h=.3, col='#a47c44', fill=None, n=2, rng=rng)
    for k in range(5):
        R.rod('W', (2.82 + k * .05, -1.3 + (k % 2) * .06, .3), (2.88 + k * .05, -1.26 + (k % 2) * .06, .5 + .03 * k), .03,
              '#8a5a32', n=5, tag='firewood')
    R.col_c('firewood', (2.93, -1.28, 0), (.52, .52, .55))

    # ---- centre: the low table, tea light overhead, laundry poles and hanging strings
    tc = V((-.7, .55, TS))
    top = kotatsu(R, tc)
    R.col_c('table', (tc.x, tc.y, PZ), (1.3, 1.3, .4), top=top)
    paper_lamp_lean(R, (tc.x, tc.y, 2.35), r=.27, h=.44, cord=CEIL - 2.35 - .22)
    R.node('Light_1', (tc.x, tc.y, 2.2))
    pendant_lean(R, (2.6, 1.0, 2.35), r=.2, col='#23889a', cord=CEIL - 2.35 - .16)
    R.node('Light_2', (2.6, 1.0, 2.2))
    laundry_poles(R, -2.6, .4, 2.3, 2.45, H)
    for x0, kind in ((2.15, 'chili'), (3.05, 'garlic')):
        top_z = H
        y = .15 + (0 if kind == 'chili' else .8)
        R.rod('W', (x0, y, top_z), (x0, y, top_z - .9), .006, '#7a5a3a', n=3, tag='hung strings')
        for k in range(4):
            if kind == 'chili':
                R.B('K').append(bm_sphere((.022, .022, .07), 5, 3), arch_lib.xform((x0 + (k % 2) * .02, y, top_z - .22 - k * .13),
                                (0, 0, 0)), R.t('K', '#d8342c'), smooth=80, tag='chili')
            else:
                R.sphere('P', (x0 + (k % 2) * .02, y, top_z - .22 - k * .14), .045, '#f4ead0', seg=5, rings=3, tag='garlic')

    # ---- resident spots: Spot_npc_1 sits at the table, Spot_npc_2 stands at the kamado
    spot(R, 'Spot_npc_1', (tc.x - 1.0, tc.y, TS), (tc.x, tc.y, 0))
    spot(R, 'Spot_npc_2', (2.45, -.7, 0), (3.4, -.65, 0))
    R.node('Spawn', (.25, -1.05, TS))
    R.node('Exit', (0, -D / 2 + .55, 0))
    # ---- "Grandma and grandchild" (cranes): everyone at the kotatsu sits on a cushion with the legs down in the foot
    # well, so the roots stand 0.45 m under the cushion tops (z = TS + .1 - .45); Granny north, Yui west
    fz = TS + .1 - .45
    scene_seat(R, 'Seat_1', (tc.x, tc.y + .75, fz), (tc.x, tc.y, 0), 'sit')           # Granny Tsuru
    scene_seat(R, 'Seat_2', (tc.x - .75, tc.y, fz), (tc.x, tc.y, 0), 'sit')           # Yui
    scene_seat(R, 'Seat_3', (tc.x + .75, tc.y, fz), (tc.x, tc.y, 0), 'sit')
    scene_seat(R, 'Seat_4', (tc.x, tc.y - .75, fz), (tc.x, tc.y, 0), 'sit')
    scene_seat(R, 'Spot_mika', (tc.x + 1.3, tc.y - .7, TS), (tc.x, tc.y, 0), 'stand')
    scene_cam(R, 'Cam_wide', (1.4, -2.2, 2.2), (tc.x - .1, tc.y + .05, .9))
    scene_cam(R, 'Cam_a', (tc.x - 1.6, tc.y - .55, 1.25), (tc.x, tc.y + .7, .85))      # over Yui to Granny
    scene_cam(R, 'Cam_b', (tc.x + .5, tc.y + 1.75, 1.45), (tc.x - .6, tc.y - .1, .95))  # over Granny to Yui
    cranes_set(R, tc, top)
    R.shell_cols(surface='stone')

    # ============================================================== the three variants
    env = dict(R=R, W=W, D=D, H=H, CEIL=CEIL, PZ=PZ, TS=TS, tc=tc, top=top, fc=fc, LT=LT, rng=rng)
    var_family(env)
    var_elders(env)
    var_fisher(env)
    return R.finish_room()
