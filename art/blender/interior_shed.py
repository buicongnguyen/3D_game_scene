"""The engine shed workshop (build_interiors.py): the old locomotive shed west of Hoshi Station where Kobo was repaired.

Warm red brick below, cream plaster above, timber trusses and an overhead hoist rail. A short length of track runs
through the middle with a red handcar on it, the big workbench with vice and pegboard tool wall stands on the left, a
mechanic's sleeping nook in the front-left corner, shelves of spare parts and the coal bin on the back wall, the forge
in the back-right corner, a loft with a ladder over the right wall and an oil-drum corner by the door.

Nodes: Spawn, Exit, Light_1..3 (Light_3 = forge, fire:1), Spot_npc_1 (mechanic at the bench) and Spot_npc_2 (visitor
by the handcar): empties on the floor, +Z = the way the resident faces. Var_1 / Var_2 / Var_3 are empty groups of decor
(busy workshop / tidy museum corner / festival prep); the game shows one of them. Colliders are identical in all."""
import math, random
from mathutils import Vector
import arch_lib
from interior_lib import *  # noqa: F401,F403
from interior_rooms import builder, IRON, BRASS, DARKW

V = Vector
TIMBER, TIMBER_D = '#7a4a2c', '#4f2f1d'
BRICKS = ['#b4533a', '#c4684a', '#a24632', '#cf7a54', '#b86446']
CREAM = '#f1dfb8'
RED, TEAL, NAVY = '#c8322a', '#2f7f6f', '#2d4a7a'


def fb(R, face, key, u, z, d, su, sz, sd, col, group=None, ch=0., tag='fbox'):
    """Face-aligned box that can go into a variant group."""
    face.box(R.B(key, group), u, z, d, su, sz, sd, ch=ch, tint=R.t(key, col), tag=tag, front=True)


def wheel(R, c, r, axis, col, spokes=8, group=None, missing=(), hub=None, tag='wheel'):
    """Spoked wheel: axis 'x' (railway wheelset, flange on the rim) or 'z' (flat on a bench)."""
    c = V(c)
    hub = hub or r * .26
    if axis == 'x':
        rot = (0, math.pi / 2, 0)
        R.torus('M', c, r, r * .13, col, maj=10, mn=3, rot=rot, group=group, tag=tag)
        R.cyl('M', c + V((.0, 0, 0)), r * .27, .09, shade(col, .8), n=6, rot=rot, group=group, tag=tag)
        for k in range(spokes):
            if k in missing:
                continue
            a = TAU * k / spokes
            d = V((0, math.cos(a), math.sin(a)))
            R.rod('M', c + d * hub * .6, c + d * (r * .95), r * .07, col, n=3, group=group, tag=tag)
    else:
        R.torus('M', c, r, r * .13, col, maj=10, mn=3, group=group, tag=tag)
        R.cyl('M', c, hub, .08, shade(col, .8), n=10, group=group, tag=tag)
        for k in range(spokes):
            if k in missing:
                continue
            a = TAU * k / spokes
            d = V((math.cos(a), math.sin(a), 0))
            R.rod('M', c + d * hub * .6, c + d * (r * .95), r * .07, col, n=3, group=group, tag=tag)


def cog(R, c, r, col, group=None, rot=None):
    R.cyl('M', c, r * 1.08, .04, col, n=8, group=group, rot=rot, tag='cogs')


def oil_can(R, c, col='#c8322a', group=None, rot=0.0):
    c = V(c)
    R.box('M', c + V((0, 0, .06)), (.11, .08, .12), col, ch=0, rot=(0, 0, rot), group=group, tag='oil cans')
    R.rod('M', c + V((0, 0, .12)), c + V((0, 0, .17)), .014, '#c9ccd2', n=5, group=group, tag='oil cans')


def lantern(R, c, col=BRASS, group=None, glow='#ffe2a0'):
    """A railway hand lantern: brass base and cap, glass globe."""
    c = V(c)
    R.sphere('G', c + V((0, 0, .08)), (.05, .05, .08), glow, seg=5, rings=3, group=group, tag='lanterns')
    R.cyl('M', c + V((0, 0, .17)), .05, .05, col, n=5, r2=.015, group=group, tag='lanterns')


def star_poly(R, face, u, z, d, r, col, group=None, tag='star'):
    pts = [(u + math.cos(math.pi / 2 + TAU * k / 10) * (r if k % 2 == 0 else r * .45),
            z + math.sin(math.pi / 2 + TAU * k / 10) * (r if k % 2 == 0 else r * .45)) for k in range(10)]
    R.B('K', group).poly([face.p(a, b, d) for a, b in pts], tint=R.t('K', col), normal=face.n, tag=tag)


def small_pendant(R, c, r=.26, col='#23889a', cord=.8):
    c = V(c)
    R.lathe('K', [(0.02, .16), (.06, .12), (r * .6, .02), (r, -.08), (r * .9, -.08), (.05, .08)], c, col, n=6, tag='pendant')
    R.sphere('G', c + V((0, 0, -.06)), .06, '#fff6dc', seg=5, rings=3, tag='pendant')
    R.rod('W', c + V((0, 0, .16)), c + V((0, 0, .16 + cord)), .008, '#2a1c14', n=3, tag='pendant')


def crate(R, c, s=.55, col='#b07a44', rot=0.0, rng=None):
    c = V(c)
    R.box('W', c + V((0, 0, s / 2)), (s, s, s), shade(col, .95), ch=.015, rot=(0, 0, rot), tag='crates')
    R.box('W', c + V((0, 0, s * .85)), (s + .02, s + .02, .06), shade(col, .7), ch=0, rot=(0, 0, rot), tag='crates')


def drum(R, c, col, h=.85, r=.29):
    c = V(c)
    R.cyl('K', c + V((0, 0, h / 2)), r, h, col, n=8, ch=0, tag='drums')
    R.cyl('M', c + V((0, 0, h * .5)), r + .01, .05, shade(col, .72), n=8, tag='drums')
    R.cyl('M', c + V((.1, .08, h + .005)), .045, .02, '#c9ccd2', n=5, tag='drums')


def glass_lantern_row(R, lo, hi, z, n, group, rng):
    for k in range(n):
        x = lo + (hi - lo) * (k + .5) / n
        lantern(R, (x, hi * 0 + 4.62, z), col=[BRASS, '#e8b84a', '#c9ccd2'][k % 3], group=group)


@builder('interior-shed')
def build_shed():
    W, D, H = 8.0, 10.0, 4.6
    CAM = 3.7
    R = Room('interior-shed', W, D, H, ceil=H, cam_top=CAM)
    fire_mat(R)
    rng = random.Random(171)
    fc = R.faces()
    SB = 1.25                                       # brick base height

    def hole(side, c, w, z0, z1):
        u = R.u_of(side, x=c) if side in ('back', 'front') else R.u_of(side, y=c)
        return (u - w / 2, u + w / 2, z0, z1)

    DOOR_X = 1.7
    door_h = (R.u_of('front', x=DOOR_X) - .65, R.u_of('front', x=DOOR_X) + .65, 0.0, 2.35)
    holes = {
        'front': [door_h],
        'back': [hole('back', .5, 1.9, 1.75, 3.45)],
        'left': [hole('left', y, 1.3, 2.45, 3.5) for y in (-2.9, .9)],
        'right': [hole('right', y, 1.3, 2.6, 3.5) for y in (-3.3, .7)],
    }
    posts = {'back': [.07, 1.55, 3.0, 4.4, 5.5, 6.6, W - .07], 'front': [.07, 1.55, 5.2, 6.9, W - .07],
             'left': [.07, 2.2, 4.0, 5.9, 7.7, D - .07], 'right': [.07, 2.2, 4.0, 6.0, 7.8, D - .07]}
    for side, (f, L) in fc.items():
        courses(R, f, 0, L, 0, SB, BRICKS, key='P', course=.22, length=(.5, .72), mortar='#8a6a52', proud=.016,
                holes=holes[side], seed=len(side) + 3, tag='brick base')
        plaster_wall(R, f, L, SB, H + .1, holes[side], CREAM, du=1.8, dz=1.8, mottle=.07, us=post_splits(posts[side], .17),
                     zs=[2.5])
        for u in posts[side]:
            R.fbox(f, 'W', u, (SB + H) / 2, .05, .17, H - SB, .1, TIMBER_D, ch=0, tag='posts')
        for a, b in spans(0, L, SB, holes[side]):
            R.fbox(f, 'W', (a + b) / 2, SB + .04, .03, b - a, .09, .08, TIMBER_D, ch=.01, tag='base rail')
        for a, b in spans(0, L, H - .1, holes[side]):
            R.fbox(f, 'W', (a + b) / 2, H - .1, .03, b - a, .2, .07, TIMBER_D, ch=.01, tag='cornice')
    # roof trusses: tie beams, knee braces and the hoist rail (all above the camera ceiling)
    for y in (-3.2, 0, 3.2):
        R.box('W', (0, y, 4.12), (W + .1, .22, .3), TIMBER, ch=0, tag='trusses')
        for sx in (-1, 1):
            R.beam('W', (sx * (W / 2 - .05), y, 3.55), (sx * 1.6, y, 4.0), .16, .12, TIMBER_D, ch=0, tag='trusses')
    R.B('W').poly([(-W / 2 - .05, -D / 2 - .05, H), (W / 2 + .05, -D / 2 - .05, H), (W / 2 + .05, D / 2 + .05, H), (-W / 2 - .05, D / 2 + .05, H)][::-1],
                  tint=R.t('W', '#c9985c'), normal=(0, 0, -1), tag='ceiling')
    for x in (-3.2, -2.0, -.8, .4, 1.6, 2.8):
        R.box('W', (x, 0, H - .03), (.07, D, .05), shade('#c9985c', .7), ch=0, tag='ceiling')
    shadow_shell(R, holes)

    # ---- floor: worn plank floor and a track bed down the middle
    plank_floor(R, -W / 2, W / 2, -D / 2, D / 2, board=.25, seg=3.5, base='#9c7248', var=.2, along='y', seed=9,
                worn=lambda c: .45 * max(0.0, 1 - abs(c.x + 1.4) / 1.3))
    rug(R, DOOR_X - .8, -D / 2 + .15, DOOR_X + .8, -D / 2 + 1.05, 0, '#9a3a2c', '#e0a93a', stripe='#f4e6c4')
    rug(R, -3.6, -4.6, -2.0, -3.1, 0, '#2f6a7a', '#f4e6c4')       # by the cot

    # ---- big sliding doors on the front wall (the track leaves through them), hanging rail above
    ff, Lf = fc['front']
    bu0, bu1 = R.u_of('front', x=-.1), R.u_of('front', x=-2.7)
    nb = 12
    bw = (bu1 - bu0) / nb
    for i in range(nb):
        k = .88 + .14 * rng.random()
        fb(R, ff, 'W', bu0 + bw * (i + .5), 1.6, .045, bw - .012, 3.2, .05, shade('#8a5a38', k), ch=0, tag='sliding doors')
    for z in (.55, 1.65, 2.75):
        fb(R, ff, 'M', (bu0 + bu1) / 2, z, .085, bu1 - bu0, .12, .03, IRON, tag='sliding doors')
    R.B('W').beam(ff.p(bu0 + .1, .3, .09), ff.p(bu1 - .1, 3.1, .09), .13, .04, up=ff.n, tint=R.t('W', TIMBER_D), tag='sliding doors')
    R.B('W').beam(ff.p(bu0 + .1, 3.1, .09), ff.p(bu1 - .1, .3, .09), .13, .04, up=ff.n, tint=R.t('W', TIMBER_D), tag='sliding doors')
    fb(R, ff, 'M', (bu0 + bu1) / 2, 3.4, .1, bu1 - bu0 + 1.2, .08, .1, IRON, tag='door track')
    for k in range(3):
        R.B('M').cyl(ff.p(bu0 - .35 + k * 1.05 * (bu1 - bu0 + .7) / 2.1, 3.34, .1), .05, .06, n=8, rot=(math.pi / 2, 0, ff.rot),
                     tint=R.t('M', IRON), tag='door track')
    door_inside(R, 'front', R.u_of('front', x=DOOR_X), w=1.3, h=2.35, col='#2f6a5a', frame=TIMBER_D)
    R.fbox(ff, 'P', R.u_of('front', x=DOOR_X), 2.35 + .45, .06, .9, .28, .012, '#f4efe2', tag='door sign')
    star_poly(R, ff, R.u_of('front', x=DOOR_X), 2.35 + .45, .075, .1, '#d6a02a', tag='door sign')

    # ---- high windows with painted views
    for side, kinds in (('back', ['valley']), ('left', ['platform', 'valley']), ('right', ['valley', 'platform'])):
        f_ = fc[side][0]
        for k, h_ in enumerate(holes[side]):
            window(R, f_, h_, depth=.28, kind=kinds[k], seed=40 + k + len(side), frame=TIMBER_D, cols=3, rows=2, nu=6, nv=5)

    # ---- track, handcar, hoist rail
    TX = -1.4
    ty0, ty1 = -4.85, 4.5
    R.box('P', (TX, (ty0 + ty1) / 2, .03), (2.0, ty1 - ty0, .06), '#6b6258', ch=.01, tag='ballast')
    for y in [ty0 + .3 + .8 * i for i in range(int((ty1 - ty0) / .8))]:
        R.box('W', (TX, y, .085), (1.7, .17, .06), '#4a2e20', ch=0, tag='sleepers')
    for sx in (-1, 1):
        R.box('M', (TX + sx * .4, (ty0 + ty1) / 2, .135), (.07, ty1 - ty0, .06), '#7a7e86', ch=0, tag='rails')
    # buffer stop
    for sx in (-1, 1):
        R.box('W', (TX + sx * .5, ty1 + .1, .4), (.14, .14, .8), TIMBER_D, ch=.01, tag='buffer')
    R.box('K', (TX, ty1 + .1, .72), (1.3, .16, .2), RED, ch=.012, tag='buffer')
    for k in range(4):
        R.box('K', (TX - .5 + k * .33, ty1 + .01, .72), (.14, .02, .21), '#f4efe2', ch=0, tag='buffer')
    # the handcar
    HC = V((TX, 1.0, 0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            wheel(R, HC + V((sx * .4, sy * .55, .34)), .2, 'x', '#2a2e38', spokes=3, tag='handcar')
        R.rod('M', HC + V((sx * .4, -.55, .34)), HC + V((sx * .4, .55, .34)), .02, IRON, n=5, tag='handcar')
    for sy in (-1, 1):
        R.rod('M', HC + V((-.5, sy * .55, .34)), HC + V((.5, sy * .55, .34)), .025, IRON, n=5, tag='handcar')
    R.box('W', HC + V((0, 0, .6)), (1.0, 1.7, .1), RED, ch=0, tag='handcar')
    R.box('W', HC + V((0, 0, .66)), (.92, 1.62, .03), '#9a6438', ch=0, tag='handcar')
    for sy in (-1, 1):
        R.box('W', HC + V((0, sy * .82, .78)), (1.0, .07, .22), shade(RED, .85), ch=0, tag='handcar')
    for sx in (-1, 1):
        R.box('W', HC + V((sx * .47, 0, .76)), (.06, 1.6, .14), shade(RED, .85), ch=0, tag='handcar')
    R.box('W', HC + V((0, -.5, .8)), (.7, .26, .06), '#e0a93a', ch=0, tag='handcar')      # seat
    R.box('W', HC + V((0, -.62, .93)), (.7, .05, .2), '#e0a93a', ch=0, tag='handcar')
    R.box('M', HC + V((0, .15, .86)), (.14, .14, .46), IRON, ch=0, tag='handcar')            # pump post
    R.beam('M', HC + V((-.78, .15, .98)), HC + V((.78, .15, 1.22)), .1, .05, '#8a5a38', ch=0, tag='handcar')
    for sx in (-1, 1):
        R.rod('W', HC + V((sx * .78, .15, 1.02)), HC + V((sx * .78, .15, 1.26)), .02, '#c9a062', n=5, tag='handcar')
    R.sphere('M', HC + V((0, .15, 1.1)), .05, BRASS, seg=6, rings=4, tag='handcar')
    R.rod('M', HC + V((0, .82, .8)), HC + V((0, .82, 1.0)), .02, IRON, n=5, tag='handcar')
    R.sphere('G', HC + V((0, .82, 1.06)), (.1, .08, .1), '#ffe9b0', seg=8, rings=5, tag='handcar')
    R.cyl('M', HC + V((0, .82, 1.15)), .08, .03, BRASS, n=8, tag='handcar')
    R.col_c('handcar', (HC.x, HC.y), (1.15, 1.95), top=1.0)
    # hoist rail and trolley overhead
    R.box('M', (TX, 0, 3.98), (.26, D - .3, .08), IRON, ch=0, tag='hoist')
    R.box('M', (TX, 0, 3.82), (.08, D - .3, .22), IRON, ch=0, tag='hoist')
    R.box('M', (TX, 0, 3.68), (.26, D - .3, .08), IRON, ch=0, tag='hoist')
    R.box('M', (TX, 1.0, 3.5), (.4, .5, .3), '#d9a441', ch=.02, tag='hoist')
    R.rod('M', (TX, 1.0, 3.35), (TX, 1.0, 2.7), .015, IRON, n=4, tag='hoist')

    # ---- left wall: bench with vice and pegboard, tool wall, sleeping nook
    fl, Ll = fc['left']
    by, bl = .9, 3.4
    bx = -W / 2 + .45
    R.box('W', (bx, by, .88), (.8, bl, .08), '#b07a44', ch=.015, tag='workbench')
    R.box('W', (bx, by, .8), (.7, bl - .1, .08), TIMBER_D, ch=.008, tag='workbench')
    for sy in (-1, 1):
        R.box('W', (bx, by + sy * (bl / 2 - .1), .4), (.7, .12, .8), TIMBER, ch=0, tag='workbench')
    R.box('W', (bx, by, .22), (.68, bl - .2, .05), '#9a6438', ch=.008, tag='workbench')
    for i in range(3):                                      # drawers under the top
        yy = by - 1.0 + i * 1.0
        R.box('W', (bx + .36, yy, .64), (.03, .85, .22), shade(TIMBER, 1.1), ch=0, tag='workbench')
        R.box('M', (bx + .39, yy, .66), (.02, .22, .03), BRASS, ch=0, tag='workbench')
    R.box('W', (bx + .15, by + bl / 2 - .05, .95), (.5, .1, .08), '#8a5a38', ch=.01, tag='workbench')
    # vice at the near end
    vy = by - bl / 2 + .35
    R.box('M', (bx + .15, vy, .98), (.2, .22, .12), '#3a6a8a', ch=.012, tag='vice')
    R.box('M', (bx + .27, vy, 1.0), (.04, .22, .16), '#3a6a8a', ch=.01, tag='vice')
    R.rod('M', (bx + .3, vy, .98), (bx + .52, vy, .98), .014, IRON, n=5, tag='vice')
    R.rod('M', (bx + .52, vy - .07, .98), (bx + .52, vy + .07, .98), .012, IRON, n=4, tag='vice')
    # a bench lamp and a mug, tool tray
    lampc = V((bx + .1, by + .9, .92))
    R.cyl('M', lampc + V((0, 0, .02)), .07, .04, BRASS, n=10, tag='bench lamp')
    R.rod('M', lampc + V((0, 0, .04)), lampc + V((0, 0, .34)), .012, BRASS, n=5, tag='bench lamp')
    R.sphere('G', lampc + V((.05, 0, .38)), (.08, .08, .07), '#fff2c8', seg=8, rings=5, tag='bench lamp')
    R.cyl('M', lampc + V((.05, 0, .43)), .07, .03, '#2f6a5a', n=10, tag='bench lamp')
    R.lathe('K', [(0, 0), (.04, 0), (.045, .09), (0, .09)], (bx + .15, by - .4, .92), '#e8e0ce', n=8, tag='mug')
    R.box('W', (bx - .1, by + .3, .94), (.3, .5, .03), '#c9a062', ch=.006, tag='tool tray')
    R.box('W', (bx - .24, by + .3, .98), (.03, .5, .06), '#c9a062', ch=.004, tag='tool tray')
    R.col('workbench', (-W / 2, by - bl / 2 - .05, -.4), (bx + .42, by + bl / 2 + .05, 1.0))
    # pegboard with painted tool silhouettes
    pu = R.u_of('left', y=by)
    pz, pw, ph = 1.7, 3.2, 1.0
    fb(R, fl, 'W', pu, pz, .03, pw + .1, ph + .1, .05, TIMBER_D, ch=.01, tag='pegboard')
    fb(R, fl, 'P', pu, pz, .06, pw, ph, .012, '#d9b87a', tag='pegboard')
    for i in range(int(pw / .18)):
        for j in (-2, 0, 2):
            pass
    tools = [(-1.4, 'hammer'), (-1.05, 'wrench'), (-.7, 'saw'), (-.3, 'saw'), (.05, 'wrench'), (.4, 'hammer'),
             (.75, 'oil'), (1.1, 'saw'), (1.45, 'hammer')]
    IR_ = '#2a2e38'
    for k, (du, kind) in enumerate(tools):
        u = pu + du
        z0 = pz + .05
        if kind == 'hammer':
            fb(R, fl, 'M', u, z0 - .06, .075, .035, .6, .006, '#8a5a38', tag='tool silhouettes')
            fb(R, fl, 'M', u, z0 + .27, .075, .2, .09, .006, IR_, tag='tool silhouettes')
        elif kind == 'wrench':
            fb(R, fl, 'M', u, z0 - .02, .075, .05, .6, .006, IR_, tag='tool silhouettes')
            fb(R, fl, 'M', u, z0 + .32, .075, .13, .1, .006, IR_, tag='tool silhouettes')
            fb(R, fl, 'M', u, z0 - .36, .075, .1, .07, .006, IR_, tag='tool silhouettes')
        elif kind == 'saw':
            fb(R, fl, 'M', u, z0 - .1, .075, .16, .5, .006, '#9aa0aa', tag='tool silhouettes')
            fb(R, fl, 'M', u, z0 + .2, .075, .06, .12, .006, '#8a5a38', tag='tool silhouettes')
        elif kind == 'pliers':
            for s in (-1, 1):
                fb(R, fl, 'M', u + s * .02, z0 - .1, .075, .03, .45, .006, '#c8322a', tag='tool silhouettes')
            fb(R, fl, 'M', u, z0 + .18, .075, .09, .12, .006, IR_, tag='tool silhouettes')
        else:
            fb(R, fl, 'M', u, z0 - .05, .075, .16, .2, .02, '#c8322a', tag='tool silhouettes')
            fb(R, fl, 'M', u + .12, z0 + .03, .075, .1, .03, .006, '#c9ccd2', tag='tool silhouettes')
    for du in (-1.5, 1.5):
        fb(R, fl, 'M', pu + du, pz - .38, .08, .08, .06, .02, IR_, tag='tool silhouettes')
    # window casing lamp-board above the pegboard: a timetable board
    fb(R, fl, 'W', R.u_of('left', y=-.9), 2.1, .03, .01, .01, .01, TIMBER_D, tag='tool silhouettes')
    # sleeping nook: cot, blanket, pillow, a crate-table with the kettle
    cx, cy = -W / 2 + .62, -3.7
    cl = 2.0
    for sx in (-1, 1):
        for sy in (-1, 1):
            R.rod('W', (cx + sx * .36, cy + sy * (cl / 2 - .05), 0), (cx + sx * .36, cy + sy * (cl / 2 - .05), .38), .03, TIMBER_D, n=5, tag='cot')
    for sx in (-1, 1):
        R.box('W', (cx + sx * .38, cy, .4), (.06, cl, .1), TIMBER, ch=.01, tag='cot')
    R.box('P', (cx, cy, .43), (.72, cl - .06, .06), '#c9a062', ch=.005, tag='cot')
    R.box('P', (cx, cy, .53), (.72, cl - .08, .16), '#e8dcc0', ch=.04, tag='cot')
    R.box('P', (cx, cy + .3, .63), (.76, cl * .62, .06), '#b8342c', ch=.025, tag='blanket')
    for k in range(2):
        R.box('P', (cx, cy + .1 + k * .5, .67), (.76, .06, .012), '#f4e6c4', ch=0, tag='blanket')
    R.box('P', (cx, cy - cl / 2 + .3, .67), (.5, .34, .12), '#f4efe2', ch=.04, tag='pillow')
    R.col('cot', (-W / 2, cy - cl / 2 - .05, -.4), (cx + .5, cy + cl / 2 + .05, .8))
    tc = V((-W / 2 + .5, -2.15, 0))
    R.box('W', tc + V((0, 0, .5)), (.5, .5, .06), '#b07a44', ch=.01, tag='nook table')
    for sx in (-1, 1):
        for sy in (-1, 1):
            R.rod('W', tc + V((sx * .2, sy * .2, 0)), tc + V((sx * .2, sy * .2, .5)), .025, TIMBER_D, n=5, tag='nook table')
    R.lathe('K', [(0, 0), (.1, 0), (.13, .09), (.1, .17), (.03, .2), (0, .2)], tc + V((-.04, 0, .53)), '#b8342c', n=10, tag='kettle')
    R.rod('K', tc + V((.07, 0, .6)), tc + V((.2, 0, .68)), .014, '#b8342c', n=4, tag='kettle')
    R.torus('M', tc + V((-.04, 0, .74)), .075, .008, IRON, maj=8, mn=3, rot=(math.pi / 2, 0, 0), arc=.5, tag='kettle')
    R.lathe('K', [(0, 0), (.035, 0), (.04, .08), (0, .08)], tc + V((.12, .14, .53)), '#e8e0ce', n=8, tag='mug')
    R.col_c('nook table', (tc.x, tc.y), (.55, .55), top=.8)
    picture(R, fl, R.u_of('left', y=cy), 1.7, .5, .36, frame=DARKW, kind='sepia', seed=2)
    picture(R, fl, R.u_of('left', y=-2.15), 1.55, .32, .42, frame=DARKW, kind='engine', seed=3)

    # blueprint of Kobo and a hung wheel on the left wall above the coal bin
    uk = R.u_of('left', y=3.9)
    picture(R, fl, uk, 2.75, 1.0, .65, frame=DARKW, kind='map', seed=8)
    wheel(R, (-W / 2 + .1, 3.9, 1.85), .38, 'x', '#2a2e38', spokes=4, tag='hung wheel')

    # ---- back wall: coal bin, shelves of spare parts, window with an anvil below, forge
    fk, Lk = fc['back']
    # coal bin (back-left corner)
    cbx, cby = -W / 2 + .85, D / 2 - .6
    R.box('W', (cbx, cby, .45), (1.5, 1.0, .08), TIMBER_D, ch=.01, tag='coal bin')
    R.box('W', (cbx, cby - .5, .5), (1.5, .06, .95), TIMBER, ch=.012, tag='coal bin')
    R.box('W', (cbx + .75, cby, .5), (.06, 1.0, .95), TIMBER, ch=.012, tag='coal bin')
    for k in range(3):
        R.box('W', (cbx, cby - .53, .2 + k * .3), (1.55, .02, .04), TIMBER_D, ch=0, tag='coal bin')
    for k in range(5):
        a = TAU * k / 5
        R.sphere('P', (cbx + math.cos(a * 2) * .5 * (.4 + .6 * rng.random()), cby + math.sin(a * 3) * .3, .55 + .1 * rng.random()),
                 (.16, .14, .1), '#1d2430' if k % 3 else '#2a303c', seg=5, rings=3, tag='coal')
    R.rod('M', (cbx + .35, cby - .2, .72), (cbx + .1, cby - .55, 1.55), .014, '#8a5a38', n=5, tag='shovel')
    R.box('M', (cbx + .33, cby - .12, .72), (.2, .02, .24), IRON, ch=.004, rot=(0, .3, 0), tag='shovel')
    R.col('coal bin', (-W / 2, cby - .55, -.4), (cbx + .8, D / 2, 1.0))
    # shelves of spare parts
    sh = Loc((-1.15, D / 2 - .22), 0)
    sw_, sd_, shh = 2.0, .38, 2.3
    for sx in (-1, 1):
        R.box('W', sh.p(sx * (sw_ / 2 - .03), 0, shh / 2), (.06, sd_, shh), TIMBER_D, ch=.01, tag='shelves')
    R.box('W', sh.p(0, .18, shh / 2), (sw_, .02, shh), '#5a3a28', ch=0, tag='shelves')
    levels = [.12, .72, 1.3, 1.88]
    for z in levels:
        R.box('W', sh.p(0, 0, z), (sw_, sd_, .04), '#b07a44', ch=.008, tag='shelves')
    R.box('W', sh.p(0, 0, shh), (sw_ + .06, sd_ + .04, .05), TIMBER_D, ch=.01, tag='shelves')
    R.col('shelves', (sh.o.x - sw_ / 2, sh.o.y - sd_ / 2, -.4), (sh.o.x + sw_ / 2, D / 2, shh))
    for k in range(4):                                      # level 1: cogs of all sizes
        cog(R, sh.p(-.75 + k * .5, -.02, levels[1] + .03 + .02 * (k % 2)), .08 + .03 * (k % 3), ['#c0a050', '#7a7e86', '#b87a44'][k % 3])
    for k in range(4):                                      # level 1 (lower): bolt boxes and an oil can
        R.box('W', sh.p(-.8 + k * .45, 0, levels[0] + .09), (.3, .24, .14), '#9a6438', ch=.01, tag='bolt boxes')
        R.cyl('M', sh.p(-.8 + k * .45, -.02, levels[0] + .19), .02, .06, '#c9ccd2', n=4, tag='bolts')
    oil_can(R, sh.p(.8, -.02, levels[0] + .04), '#2f6aae')
    oil_can(R, sh.p(.62, .02, levels[0] + .04), '#c8322a', rot=.6)
    for k in range(2):                                      # level 3: lamps
        lantern(R, sh.p(-.7 + k * .6, -.02, levels[2] + .02), col=[BRASS, '#c9ccd2', '#e8b84a'][k])
    for k in range(3):                                      # level 3 right: a pile of wheels and tins
        R.cyl('M', sh.p(.45 + k * .22, -.02, levels[2] + .1), .09, .16, ['#c8322a', '#2f7f6f', '#e0a93a'][k], n=8, tag='tins')
    for k in range(3):                                      # top: paint tins and a coiled rope
        R.cyl('M', sh.p(-.8 + k * .28, 0, levels[3] + .08), .075, .13, ['#e0a93a', '#2f7f6f', '#c8322a', '#2d4a7a'][k], n=8, tag='tins')
    R.torus('P', sh.p(.5, 0, levels[3] + .06), .13, .04, '#c9a062', maj=10, mn=4, tag='rope')
    # anvil on a stump under the window
    an = V((.55, D / 2 - .7, 0))
    R.cyl('W', an + V((0, 0, .27)), .3, .54, '#9a6438', n=10, ch=.01, tag='stump')
    R.torus('M', an + V((0, 0, .2)), .3, .014, IRON, maj=10, mn=3, tag='stump')
    R.box('M', an + V((0, 0, .6)), (.24, .2, .12), '#2a2e38', ch=.012, tag='anvil')
    R.box('M', an + V((0, 0, .72)), (.62, .17, .13), '#3a3f4a', ch=.012, tag='anvil')
    R.cyl('M', an + V((.42, 0, .72)), .07, .24, '#3a3f4a', n=8, r2=.015, rot=(0, math.pi / 2, 0), tag='anvil')
    R.col_c('anvil', (an.x, an.y), (.75, .5), top=.85)
    # forge in the back-right corner: brick hearth, glowing fire, hood and chimney
    fg = V((W / 2 - .95, D / 2 - .85, 0))
    R.box('P', fg + V((0, 0, .4)), (1.7, 1.5, .8), '#b4533a', ch=.015, tag='forge')
    for k in range(4):
        R.box('P', fg + V((0, -.76, .14 + k * .2)), (1.72, .02, .015), '#8a6a52', ch=0, tag='forge')
    R.box('M', fg + V((0, 0, .83)), (1.7, 1.5, .06), '#2a2e38', ch=.01, tag='forge')
    R.box('M', fg + V((0, -.05, .88)), (.8, .8, .06), '#1d2430', ch=.01, tag='forge')
    R.box('F', fg + V((0, -.05, .93)), (.5, .5, .06), '#ffb060', ch=0, tag='forge fire')
    for k in range(5):
        R.sphere('P', fg + V((-.28 + k * .14, -.05 + ((k * 7) % 3 - 1) * .1, .93)), (.07, .06, .04), '#c8322a' if k % 2 else '#ffb060', seg=5, rings=3, tag='forge fire')
    R.cyl('M', fg + V((0, .15, 2.3)), 1.0, .7, '#3b424e', n=4, r2=.25, rot=(0, 0, math.pi / 4), tag='forge hood')
    R.rod('M', fg + V((0, .15, 2.6)), fg + V((0, .15, H + .2)), .22, '#3b424e', n=10, tag='chimney')
    # bellows on the right side of the hearth, tongs hanging
    R.col_c('forge', (fg.x, fg.y), (1.75, 1.55), top=1.0)
    R.node('Light_3', fg + V((0, -.55, 1.0)))['fire'] = 1
    window_h = holes['back'][0]
    # tool leaning: tongs
    for s in (-1, 1):
        R.rod('M', V((fg.x - 1.0, D / 2 - .06, 1.7)), V((fg.x - 1.05 + s * .04, D / 2 - .1, 1.15)), .012, IRON, n=4, tag='tongs')

    # ---- right wall: loft with ladder and rail, crates and sacks under, hooks, oil-drum corner
    fr, Lr = fc['right']
    lx0, lx1 = W / 2 - 1.15, W / 2 - .05
    ly0, ly1 = -2.15, 2.1
    R.box('W', ((lx0 + lx1) / 2, (ly0 + ly1) / 2, 1.97), (lx1 - lx0, ly1 - ly0, .08), '#b07a44', ch=.012, tag='loft')
    for y in [ly0 + .06 + k * .5 for k in range(9)]:
        R.box('W', ((lx0 + lx1) / 2, y, 1.87), (lx1 - lx0, .12, .14), TIMBER_D, ch=0, tag='loft')
    for y in (ly0 + .05, (ly0 + ly1) / 2, ly1 - .05):
        R.box('W', (lx0 + .05, y, .95), (.1, .1, 1.9), TIMBER_D, ch=.01, tag='loft')
        R.col_c(f'loft post {int((y - ly0) * 10)}', (lx0 + .05, y), (.22, .22), top=2.0)
    R.beam('W', (lx0 + .05, ly0 + .05, 2.5), (lx0 + .05, ly1 - .05, 2.5), .07, .08, TIMBER, ch=.01, tag='loft rail')
    for k in range(7):
        R.rod('W', (lx0 + .05, ly0 + .1 + k * .65, 1.99), (lx0 + .05, ly0 + .1 + k * .65, 2.48), .014, TIMBER_D, n=4, tag='loft rail')
    # ladder
    ld_y = ly0 - .35
    for s in (-1, 1):
        R.rod('W', (W / 2 - .12, ld_y + s * .22, 0), (W / 2 - .12, ld_y + s * .22, 2.35), .028, '#c9a062', n=5, tag='ladder')
    for k in range(9):
        R.rod('W', (W / 2 - .12, ld_y - .22, .25 + k * .24), (W / 2 - .12, ld_y + .22, .25 + k * .24), .018, '#a07a48', n=4, tag='ladder')
    R.col('ladder', (W / 2 - .3, ld_y - .3, -.4), (W / 2, ld_y + .3, 2.1))
    # loft goods
    for k, (y, s) in enumerate(((-1.4, .4), (-.3, .36))):
        crate(R, (lx0 + .5, y, 2.01), s=s, col=['#b07a44', '#a06a3c', '#c18a52'][k], rot=.2 * k, rng=rng)
    # under the loft: crates, sacks and a wheel against the wall
    for k, (y, s) in enumerate(((-1.3, .55), (-.4, .6), (.5, .55), (1.4, .55))):
        crate(R, (W / 2 - .45 - (.05 if k % 2 else 0), y, 0), s=s, col=['#b07a44', '#a06a3c', '#c18a52', '#9a6438'][k], rot=.08 * (k - 2), rng=rng)
    R.col('crates', (W / 2 - 1.0, -1.7, -.4), (W / 2, 1.8, 1.05))
    # hooks: the mechanic's cap and overalls, an apron, a hand lamp
    hu = R.u_of('right', y=3.0)
    fb(R, fr, 'W', hu, 1.75, .03, 1.3, .1, .05, TIMBER_D, ch=.008, tag='hooks')
    for k, du in enumerate((-.5, -.15, .2, .55)):
        R.B('M').rod(fr.p(hu + du, 1.75, .06), fr.p(hu + du, 1.72, .15), .012, n=4, tint=R.t('M', BRASS), tag='hooks')
    R.B('K').lathe([(0, .0), (.1, .0), (.12, .04), (.1, .09), (0, .1)], fr.p(hu - .5, 1.58, .2), n=12, tint=R.t('K', NAVY), tag='cap', smooth=50)
    fb(R, fr, 'P', hu - .15, 1.2, .1, .34, .55, .06, '#2d4a7a', tag='overalls')
    fb(R, fr, 'P', hu - .15, .75, .1, .3, .36, .05, shade('#2d4a7a', .9), tag='overalls')
    fb(R, fr, 'P', hu + .2, 1.3, .1, .3, .6, .05, '#d9c28c', tag='apron')
    # oil-drum corner by the door
    for k, (x, y, col) in enumerate(((W / 2 - .38, -D / 2 + .42, '#3a6aa8'), (W / 2 - .98, -D / 2 + .38, '#b8342c'),
                                     (W / 2 - .45, -D / 2 + 1.05, '#d9a441'))):
        drum(R, (x, y, 0), col)
    R.col('drums', (W / 2 - 1.4, -D / 2 - .1, -.4), (W / 2, -D / 2 + 1.4, .95))
    R.box('W', (W / 2 - .7, -D / 2 + 1.95, .22), (.7, .55, .44), '#9a6438', ch=0, tag='drum crate')
    oil_can(R, (W / 2 - .7, -D / 2 + 1.9, .44), '#e0a93a')
    R.col_c('drum crate', (W / 2 - .7, -D / 2 + 1.95), (.75, .6), top=.7)

    # ---- centre: a hanging lamp over the handcar, the bench lamp, and clock; ropes and sundries
    small_pendant(R, (TX, -1.5, 3.0), r=.3, col='#2f7f6f', cord=H - 3.0 - .1)
    R.node('Light_1', (TX, -1.5, 2.75))
    small_pendant(R, (-2.7, by, 2.9), r=.26, col='#c8322a', cord=H - 2.9 - .1)
    R.node('Light_2', (-2.7, by, 2.65))
    small_pendant(R, (1.6, 0, 3.1), r=.26, col='#e0a93a', cord=H - 3.1 - .1)
    # a round station clock over the door
    ck = V((DOOR_X - 1.9, -D / 2 + .1, 2.7))
    R.cyl('W', ck, .3, .08, TIMBER_D, n=12, ch=.01, rot=(math.pi / 2, 0, 0), tag='clock')
    R.cyl('K', ck + V((0, .05, 0)), .26, .015, '#f4efe2', n=12, rot=(math.pi / 2, 0, 0), tag='clock')
    R.box('K', ck + V((.04, .06, .06)), (.1, .008, .016), '#1d2430', ch=0, rot=(0, -.7, 0), tag='clock')
    R.box('K', ck + V((0, .06, .08)), (.016, .008, .16), '#1d2430', ch=0, tag='clock')

    # ---- contract nodes
    R.node('Spawn', (DOOR_X, -D / 2 + 2.0, 0))
    R.node('Exit', (DOOR_X, -D / 2 + .55, 0))
    for nm, (x, y), face in (('Spot_npc_1', (-2.55, by), (-1, 0)), ('Spot_npc_2', (.5, 0.2), (-1, .3))):
        e = R.node(nm, (x, y, 0))
        e.rotation_euler = (0, 0, math.atan2(face[0], -face[1]))
    R.shell_cols(surface='wood')

    # ---- decor variants: meshes only, hung on walls / standing on furniture (colliders stay identical)
    varrng = random.Random(7)
    v1 = R.pivot('Var_1', (0, 0, 0))
    v2 = R.pivot('Var_2', (0, 0, 0))
    v3 = R.pivot('Var_3', (0, 0, 0))
    bz = .92
    # 1: busy workshop: a half-assembled wheel on the bench, tools out, oil cans, rags, an open toolbox, steam from a mug
    wheel(R, (bx + .0, by + .05, bz + .06), .3, 'z', '#7a7e86', spokes=8, group=v1, missing=(1, 2, 5), tag='half wheel')
    for k in (1, 2, 5):
        a = TAU * k / 8
    R.rod('M', (bx - .2, by + 1.3, bz + .03), (bx + .1, by + 1.45, bz + .03), .018, '#7a7e86', n=4, group=v1, tag='loose spokes')
    R.rod('M', (bx - .1, by + 1.2, bz + .03), (bx + .2, by + 1.2, bz + .03), .018, '#7a7e86', n=4, group=v1, tag='loose spokes')
    R.box('M', (bx + .1, by - .85, bz + .03), (.08, .3, .03), IRON, ch=.004, rot=(0, 0, .4), group=v1, tag='tools out')   # wrench
    R.box('M', (bx - .1, by - .6, bz + .03), (.04, .26, .03), '#8a5a38', ch=.004, rot=(0, 0, -.2), group=v1, tag='tools out')
    R.box('M', (bx - .1, by - .73, bz + .05), (.14, .05, .05), IRON, ch=.004, rot=(0, 0, -.2), group=v1, tag='tools out')
    oil_can(R, (bx + .15, by + .55, bz), '#c8322a', group=v1, rot=.4)
    oil_can(R, (bx - .15, by + 1.0, bz), '#2f6aae', group=v1, rot=-.5)
    oil_can(R, (W / 2 - .45, -D / 2 + 1.05, .85), '#e0a93a', group=v1, rot=.2)
    R.box('P', (bx + .1, by - 1.3, bz + .02), (.3, .22, .02), '#c8322a', ch=.004, rot=(0, 0, .5), group=v1, tag='rags')
    R.box('K', (-3.0, -1.2, .09), (.5, .26, .18), '#c8322a', ch=.015, group=v1, tag='toolbox')
    R.box('K', (-3.15, -1.2, .27), (.04, .24, .12), shade('#c8322a', .85), ch=.006, rot=(0, -.9, 0), group=v1, tag='toolbox')
    R.rod('M', (-3.05, -1.25, .2), (-3.0, -1.1, .22), .02, '#c9ccd2', n=4, group=v1, tag='toolbox')
    for k in range(2):
        cog(R, (-.1 + k * .22, 4.3, .02 + .03 * k), .1, ['#c0a050', '#7a7e86', '#b87a44'][k], group=v1)
    # the hoist holds a wheelset
    wheel(R, (TX, 1.0, 2.2), .24, 'x', '#2a2e38', spokes=4, group=v1, tag='hoisted wheelset')
    R.rod('M', (TX, 1.0, 2.2 + .24), (TX, 1.0, 2.66), .012, IRON, n=4, group=v1, tag='hoisted wheelset')
    # 2: tidy museum corner: framed photos of old trains, a polished lantern collection, a model locomotive on a shelf
    sc = 0
    for (y, z, kind, w, h) in ((-3.5, 1.8, 'engine', .55, .4), (-2.7, 1.75, 'sepia', .4, .5), (-4.2, 1.7, 'sepia', .38, .3)):
        picture_group(R, fr, R.u_of('right', y=y), z, w, h, kind, v2, sc)
        sc += 1
    for x, z, kind, w, h in ((3.2, 1.9, 'engine', .5, .4),):
        picture_group(R, ff, R.u_of('front', x=x), z, w, h, kind, v2, sc)
        sc += 1
    # wall shelf under the back window: lanterns + the model locomotive
    sx0, sx1, sy_, sz_ = -.6, 1.6, D / 2 - .15, 1.2
    R.box('W', ((sx0 + sx1) / 2, sy_, sz_), (sx1 - sx0, .26, .04), '#c9985c', ch=.008, group=v2, tag='museum shelf')
    for k in range(4):
        lantern(R, (sx0 + .22 + k * .22, sy_, sz_ + .02), col=[BRASS, '#e8b84a', '#c9ccd2', BRASS][k], group=v2)
    # model locomotive (red boiler, black chimney, gold dome, wheels)
    mx, mz = sx1 - .65, sz_ + .02
    R.cyl('K', (mx, sy_, mz + .12), .06, .3, RED, n=10, rot=(0, math.pi / 2, 0), group=v2, tag='model loco')
    R.box('K', (mx + .17, sy_, mz + .1), (.12, .14, .17), '#1d2430', ch=.01, group=v2, tag='model loco')
    R.cyl('K', (mx - .12, sy_, mz + .23), .028, .08, '#1d2430', n=8, group=v2, tag='model loco')
    R.sphere('M', (mx, sy_, mz + .19), .03, BRASS, seg=6, rings=4, group=v2, tag='model loco')
    for k in range(2):
        R.cyl('K', (mx - .1 + k * .2, sy_ - .075, mz + .05), .035, .012, '#262c38', n=6, rot=(math.pi / 2, 0, 0), group=v2, tag='model loco')
        R.cyl('K', (mx - .1 + k * .2, sy_ + .075, mz + .05), .035, .012, '#262c38', n=6, rot=(math.pi / 2, 0, 0), group=v2, tag='model loco')
    # lanterns polished on the bench and in a row on the loft rail
    for k in range(2):
        lantern(R, (bx - .1, by - .6 + k * .8, bz), col=BRASS, group=v2)
    lantern(R, (W / 2 - .7, -D / 2 + 1.95, .44), col=BRASS, group=v2)
    # a velvet rope museum plinth card on the handcar seat
    R.box('P', HC + V((0, -.5, .85)), (.3, .08, .02), '#f4efe2', ch=0, group=v2, tag='plinth card')
    # 3: festival prep: bunting, paper lanterns, painted star boards
    cols = ['#c8322a', '#e0a93a', '#2f7f6f', '#2d4a7a', '#f08aa0', '#f4efe2']
    for si, (ya, yb, za, zb) in enumerate(((-3.0, -3.0, 3.45, 3.45), (-.6, -.6, 3.5, 3.5), (2.2, 2.2, 3.45, 3.45))):
        xs = [-W / 2 + .1 + (W - .2) * i / 8 for i in range(9)]
        pts = [(x, ya, za - .28 * math.sin(math.pi * (x + W / 2) / W)) for x in xs]
        for a, b in zip(pts, pts[1:]):
            R.rod('P', a, b, .008, '#3a2418', n=3, group=v3, tag='bunting string', cap=False)
        for i in range(1, 8):
            x, y, z = pts[i]
            col = cols[(i + si) % len(cols)]
            R.cyl('P', (x, y, z - .13), .01, .26, col, n=3, r2=.11, group=v3, tag='bunting', rot=(0, 0, math.pi / 2))
    for k, (x, y, z, col) in enumerate(((-.5, -2.0, 3.3, '#ff7a6a'), (.9, -.2, 3.2, '#ffd35a'), (1.8, 1.9, 3.3, '#ff9ab0'), (-2.8, 2.8, 3.3, '#ffd35a'),
                                         (2.4, -3.3, 3.2, '#ff7a6a'))):
        prof = [(.02, -.15), (.12, -.04), (.12, .05), (.02, .15)]
        R.lathe('G', prof, (x, y, z - .2), col, n=6, group=v3, tag='festival lanterns', smooth=70)
        R.rod('P', (x, y, z - .02), (x, y, z + .5), .006, '#3a2418', n=3, group=v3, tag='festival lanterns')
    # painted star boards on the walls and a lantern line on the handcar
    for (f_, u, z, w, h, col, sr) in ((fl, R.u_of('left', y=cy), 2.15, .9, .6, '#2d4a7a', .2), (ff, R.u_of('front', x=3.15), 2.05, .8, .6, '#2f7f6f', .18),
                                      (fr, R.u_of('right', y=-3.3), 1.8, .8, .55, '#c8322a', .18)):
        fb(R, f_, 'W', u, z, .03, w + .1, h + .1, .04, TIMBER_D, group=v3, ch=.01, tag='star boards')
        fb(R, f_, 'P', u, z, .06, w, h, .01, col, group=v3, tag='star boards')
        star_poly(R, f_, u, z, .075, sr, '#ffd35a', group=v3, tag='star boards')
        for s_ in (-1, 1):
            star_poly(R, f_, u + s_ * w * .36, z - h * .18, .08, sr * .3, '#f4efe2', group=v3, tag='star boards')
    for k in range(3):
        lantern(R, (bx - .1, by - 1.0 + k * .9, bz), col=['#c8322a', BRASS, '#2f7f6f'][k % 3], group=v3, glow='#ffd0a0')

    return R.finish_room()


def picture_group(R, face, u, z, w, h, kind, group, seed):
    """A framed photo like interior_lib.picture but into a variant group (frame + painted matt)."""
    fb(R, face, 'W', u, z, .025, w, h, .03, '#c9a062', group=group, ch=0, tag='museum frames')
    fb(R, face, 'P', u, z, .045, w - .07, h - .07, .004, '#d9c29a' if kind == 'sepia' else '#e9dcc0', group=group, tag='museum frames')
    if kind == 'engine':
        fb(R, face, 'P', u, z - h * .08, .052, (w - .07) * .6, (h - .07) * .3, .004, '#d63a2a', group=group, tag='museum frames')
        fb(R, face, 'P', u + w * .15, z + h * .12, .052, w * .16, h * .22, .004, '#1d2430', group=group, tag='museum frames')
    else:
        for k in range(3):
            fb(R, face, 'P', u + (-.25 + k * .25) * w, z - h * .1, .052, w * .1, h * .42, .004, '#6a4a30', group=group, tag='museum frames')
