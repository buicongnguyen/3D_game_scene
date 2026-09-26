"""Genzo's station office (build_interiors.py): green wainscot and cream plaster, the pot-belly stove with its kettle,
the big timetable board and the pendulum clock, the ticket window with its counter, dating press and pigeonhole rack
of card tickets, the signal lever frame, Genzo's desk with the green lamp (where Kobo's first ticket waits), his cap on
the hook, a bench, flags, and photos of Kobo on the walls.

Pivot: Pendulum (the clock's pendulum, swings about X; src/world/interiors.js drives it)."""
import math, random
from mathutils import Vector
import arch_lib
from interior_lib import *  # noqa: F401,F403
from interior_rooms import builder, drawer_chest, IRON, BRASS, DARKW

V = Vector
GREEN, CREAM, RED, NAVY = '#2f7f6f', '#f4e6c4', '#d63a2a', '#2d4a7a'


def lever(R, c, col, pulled=False):
    """One signal lever: a tall painted lever rising from the frame slot, a brass handle and a number plate."""
    c = V(c)
    tilt = -.35 if pulled else .12
    top = c + V((0, math.sin(tilt) * 1.1, 1.1 * math.cos(tilt)))
    R.beam('K', c, top, .05, .035, col, ch=.006, tag='levers')
    R.beam('M', top, top + (top - c).normalized() * .16, .03, .03, '#c9ccd2', ch=.004, tag='levers')
    R.rod('M', top + V((-.07, 0, -.1)), top + V((.07, 0, -.1)), .012, BRASS, n=5, tag='levers')
    R.box('M', c + V((0, -.03, .6)), (.07, .012, .08), BRASS, ch=0, tag='levers')


@builder('interior-station')
def build_station():
    W, D, H = 7.4, 6.2, 3.3
    R = Room('interior-station', W, D, H, ceil=3.9, cam_top=3.22)
    fire_mat(R)
    rng = random.Random(141)
    fc = R.faces()
    holes = {
        'front': [(W / 2 - .5, W / 2 + .5, 0, 2.2), (W / 2 + 1.7, W / 2 + 3.1, 1.05, 2.4), (W / 2 - 3.1, W / 2 - 1.7, 1.05, 2.4)],
        'back': [(W / 2 + 1.25, W / 2 + 2.55, 1.2, 2.4)],
        'right': [(D / 2 - .6, D / 2 + .6, 1.05, 1.9)],
        'left': [],
    }
    posts = {'back': [.06, W - .06], 'front': [.06, W - .06], 'left': [.06, D - .06], 'right': [.06, D - .06]}
    for side, (f, L) in fc.items():
        plaster_wall(R, f, L, 1.1, H + .1, holes[side], CREAM, mottle=.05, us=post_splits(posts[side], .16),
                     zs=[2.36, 2.44])
        wainscot(R, f, L, 0, 1.1, holes[side], GREEN, board=.16, cap=DARKW, seed=len(side))
        for u in posts[side]:
            R.fbox(f, 'W', u, H / 2, .04, .16, H, .08, DARKW, ch=.012, tag='posts')
        for a, b in spans(0, L, 2.4, holes[side]):
            R.fbox(f, 'W', (a + b) / 2, 2.4, .02, b - a, .07, .04, DARKW, ch=.008, tag='picture rail')
        for a, b in spans(0, L, H - .08, holes[side]):
            R.fbox(f, 'W', (a + b) / 2, H - .08, .03, b - a, .16, .06, DARKW, ch=.01, tag='cornice')
    for x in (-1.6, 1.6):
        R.box('W', (x, 0, H + .14), (.22, D + .1, .28), '#6b4027', ch=.02, tag='beams')
    board_ceiling(R, 3.9, col='#c9985c', board=.24, along='x')
    shadow_shell(R, holes)

    # ---- floor: planks along the room, a red runner rug under the desk
    plank_floor(R, -W / 2, W / 2, -D / 2, D / 2, board=.17, seg=1.0, base='#b27a48', var=.15, along='y', seed=4)
    rug(R, -1.6, -1.0, 1.4, 1.9, 0, '#b8342c', '#e0a93a', stripe='#f4e6c4')

    # ---- front: door and two windows onto the platform, bench, the lever frame
    door_inside(R, 'front', W / 2, w=1.0, h=2.2, col='#6b4027', frame=DARKW)
    ff, Lf = fc['front']
    for k, h in enumerate(holes['front'][1:]):
        window(R, ff, h, depth=.24, kind='platform', seed=20 + k, frame=DARKW, cols=2, rows=3, nu=10, nv=8)
    lf = V((2.8, -D / 2 + .55, 0))
    R.box('W', lf + V((0, 0, .15)), (1.3, .5, .3), '#6b4027', ch=.02, tag='lever frame')
    R.box('M', lf + V((0, 0, .31)), (1.25, .08, .03), IRON, ch=0, tag='lever frame')
    for k, (col, pulled) in enumerate(((RED, False), (RED, True), ('#e0a93a', False), ('#2f5fae', False))):
        lever(R, lf + V((-.45 + k * .3, 0, .3)), col, pulled)
    R.box('W', lf + V((0, .3, 1.55)), (1.3, .05, .3), DARKW, ch=.01, tag='lever frame')
    for k in range(4):
        R.box('K', lf + V((-.45 + k * .3, .27, 1.55)), (.2, .012, .16), '#f4efe2', ch=0, tag='lever frame')
    R.col('levers', (lf.x - .7, lf.y - .35, -.5), (lf.x + .7, lf.y + .35, 1.4))

    # ---- left: the pot-belly stove, coal scuttle, bench, hooks with Genzo's cap and coat, flags
    sv = V((-2.75, .6, 0))
    R.box('P', sv + V((0, 0, .02)), (1.0, 1.0, .04), '#8a3a28', ch=.01, tag='stove plate')
    R.lathe('M', [(0, .1), (.26, .1), (.3, .2), (.32, .5), (.3, .75), (.22, .88), (.2, .95), (.24, .98), (.24, 1.02),
                  (0, 1.02)], sv, '#262c38', n=14, tag='stove')
    for k in range(3):
        a = TAU * k / 3 + .5
        R.rod('M', sv + V((math.cos(a) * .22, math.sin(a) * .22, .12)), sv + V((math.cos(a) * .28, math.sin(a) * .28, 0)),
              .025, '#262c38', n=5, tag='stove')
    R.torus('M', sv + V((0, 0, .5)), .325, .02, BRASS, maj=14, mn=3, tag='stove')
    R.box('F', sv + V((.3, 0, .42)), (.03, .18, .12), '#ff9a3a', ch=0, tag='stove fire')
    R.box('M', sv + V((.32, 0, .42)), (.02, .24, .18), '#262c38', ch=0, tag='stove door')
    for k in range(3):
        R.box('M', sv + V((.335, -.06 + k * .06, .42)), (.012, .012, .14), '#262c38', ch=0, tag='stove door')
    R.rod('M', sv + V((0, 0, 1.0)), sv + V((0, 0, 2.7)), .075, '#3b424e', n=10, tag='stovepipe')
    R.rod('M', sv + V((0, 0, 2.7)), V((-W / 2, sv.y, 2.9)), .075, '#3b424e', n=10, tag='stovepipe')
    R.lathe('M', [(0, 0), (.1, 0), (.12, .08), (.09, .14), (.03, .16), (0, .17)], sv + V((-.05, 0, 1.02)), '#b8342c', n=10,
            tag='kettle')
    R.rod('M', sv + V((.07, 0, 1.08)), sv + V((.2, 0, 1.16)), .014, '#b8342c', n=4, tag='kettle')
    R.col_c('stove', (sv.x, sv.y, 0), (.8, .8, 1.1), view=False)
    R.node('Light_3', sv + V((.45, 0, .45)))['fire'] = 1
    R.lathe('M', [(0, 0), (.16, 0), (.18, .3), (.12, .36), (0, .36)], (-3.25, 1.5, 0), '#262c38', n=10, tag='scuttle')
    for k in range(5):
        R.sphere('P', (-3.25 + math.cos(k) * .07, 1.5 + math.sin(k) * .07, .32), .04, '#1d2430', seg=5, rings=3, tag='coal')
    R.col_c('scuttle', (-3.25, 1.5, 0), (.4, .4, .4))
    # bench along the left wall
    by0, by1 = -2.6, -.9
    R.box('W', (-W / 2 + .25, (by0 + by1) / 2, .45), (.42, by1 - by0, .05), '#9a6438', ch=.012, tag='bench')
    R.box('W', (-W / 2 + .06, (by0 + by1) / 2, .75), (.04, by1 - by0, .35), '#9a6438', ch=.01, tag='bench')
    for y in (by0 + .08, by1 - .08):
        R.box('W', (-W / 2 + .25, y, .22), (.38, .06, .44), DARKW, ch=.008, tag='bench')
    R.box('P', (-W / 2 + .27, by0 + .45, .5), (.34, .34, .06), NAVY, ch=.02, tag='bench cushion')
    R.col('bench', (-W / 2 - .2, by0, -.5), (-W / 2 + .48, by1, .7))
    # hook rail by the door: Genzo's cap, coat, the lantern; red and green flags in a holder
    fl, Ll = fc['left']
    R.fbox(fl, 'W', R.u_of('left', y=-2.75), 1.85, .03, .7, .09, .03, DARKW, ch=.008, tag='hooks')
    for y in (-3.0, -2.75, -2.5):
        R.rod('M', (-W / 2 + .05, y, 1.85), (-W / 2 + .14, y, 1.82), .01, BRASS, n=4, tag='hooks')
    cap = V((-W / 2 + .19, -3.0, 1.72))
    R.lathe('P', [(0, .16), (.09, .155), (.11, .1), (.1, .03), (0, .03)], cap, NAVY, n=14, rot=(0, -1.25, 0), tag='cap')
    R.cyl('K', cap + V((.02, 0, .04)), .105, .02, '#1d2430', n=14, rot=(0, -1.25, 0), tag='cap')
    R.box('K', cap + V((.1, 0, .04)), (.1, .12, .015), '#1d2430', ch=.004, rot=(0, -1.25, 0), tag='cap')
    R.box('M', cap + V((.1, 0, .12)), (.012, .05, .04), BRASS, ch=0, tag='cap')
    R.B('P').append(bm_loft([V((-W / 2 + .14, -2.75, 1.82)), V((-W / 2 + .2, -2.75, 1.3)), V((-W / 2 + .22, -2.75, .7))],
                            [(-.2, 0), (.2, 0), (.18, .06), (-.18, .06)], closed=True, caps=True), None, tint=R.t('P', NAVY),
                    smooth=40, tag='coat')
    fh = V((-W / 2 + .2, -2.25, 0))
    R.cyl('K', fh + V((0, 0, .3)), .08, .6, '#6b4027', n=10, tag='flags')
    for k, col in enumerate((RED, '#2fae5a')):
        top = fh + V((0, .02 * (k * 2 - 1), 1.25))
        R.rod('W', fh + V((0, .02 * (k * 2 - 1), .1)), top, .012, '#c9a062', n=4, tag='flags')
        R.box('P', top + V((0, .18 * (k * 2 - 1), -.12)), (.02, .34, .24), col, ch=0, tag='flags')
    R.col_c('flags', (fh.x, fh.y, 0), (.3, .3, 1.3))

    # ---- back: timetable board, pendulum clock, window onto the valley, photos of Kobo
    fb, Lb = fc['back']
    tu = R.u_of('back', x=-.5)
    R.fbox(fb, 'W', tu, 1.95, .02, 2.3, 1.4, .05, DARKW, ch=.012, tag='timetable')
    R.fbox(fb, 'K', tu, 1.92, .05, 2.14, 1.16, .012, '#1f4a3a', ch=0, tag='timetable')
    R.fbox(fb, 'M', tu, 2.58, .05, 1.1, .12, .02, BRASS, ch=.006, tag='timetable')
    for r in range(7):
        z = 2.35 - r * .15
        for c_, (cu, cw) in enumerate(((-.8, .35), (-.3, .5), (.3, .3), (.72, .3))):
            R.fbox(fb, 'P', tu + cu, z, .062, cw * rng.uniform(.7, 1.0), .05, .004,
                   '#f4efe2' if c_ != 2 else '#ffd35a', tag='timetable slats')
    ck = V((-2.7, D / 2 - .09, 2.15))
    R.box('W', ck + V((0, 0, -.35)), (.4, .14, 1.1), '#7a4a2c', ch=.02, tag='clock')
    R.cyl('W', ck + V((0, -.02, .2)), .24, .12, '#7a4a2c', n=18, ch=.02, rot=(math.pi / 2, 0, 0), tag='clock')
    R.cyl('K', ck + V((0, -.085, .2)), .2, .01, '#f4efe2', n=18, rot=(math.pi / 2, 0, 0), tag='clock')
    R.torus('M', ck + V((0, -.09, .2)), .205, .012, BRASS, maj=18, mn=3, rot=(math.pi / 2, 0, 0), tag='clock')
    for k in range(12):
        a = TAU * k / 12
        R.box('K', ck + V((math.cos(a) * .16, -.095, .2 + math.sin(a) * .16)), (.012, .006, .03), '#1d2430', ch=0,
              rot=(0, -a + math.pi / 2, 0), tag='clock')
    R.box('K', ck + V((.04, -.1, .24)), (.1, .006, .012), '#1d2430', ch=0, rot=(0, -.8, 0), tag='clock')
    R.box('K', ck + V((0, -.1, .27)), (.012, .006, .14), '#1d2430', ch=0, tag='clock')
    R.box('K', ck + V((0, -.075, -.45)), (.3, .01, .7), '#e8e0ce', ch=0, tag='clock')
    pv = R.pivot('Pendulum', ck + V((0, -.09, .02)), ground=None, with_statics=True)
    R.rod('M', ck + V((0, -.09, .02)), ck + V((0, -.09, -.62)), .008, BRASS, n=4, group=pv, tag='pendulum')
    R.cyl('M', ck + V((0, -.09, -.66)), .07, .02, BRASS, n=14, rot=(math.pi / 2, 0, 0), group=pv, tag='pendulum')
    window(R, fb, holes['back'][0], depth=.24, kind='valley', seed=31, frame=DARKW, cols=2, rows=3, nu=10, nv=8)
    for k, (x, z, kind) in enumerate(((.95, 2.8, 'engine'), (1.9, 2.75, 'sepia'))):
        picture(R, fb, R.u_of('back', x=x), z, .42, .3, frame=DARKW, kind=kind, seed=k)
    picture(R, fc['left'][0], R.u_of('left', y=2.0), 1.75, .7, .45, frame=DARKW, kind='map', seed=5)
    picture(R, fc['left'][0], R.u_of('left', y=-1.55), 1.9, .36, .28, frame=DARKW, kind='engine', seed=6)

    # ---- right: ticket window with counter, dating press, the pigeonhole ticket rack
    fr, Lr = fc['right']
    window(R, fr, holes['right'][0], depth=.2, kind='platform', seed=40, frame=DARKW, cols=1, rows=1, nu=6, nv=5)
    th = holes['right'][0]
    for k in range(6):
        R.fbox(fr, 'M', th[0] + (th[1] - th[0]) * (k + .5) / 6, (th[2] + th[3]) / 2, .02, .012, th[3] - th[2], .012, BRASS,
               tag='grille')
    R.fbox(fr, 'W', (th[0] + th[1]) / 2, th[3] + .2, .03, 1.2, .24, .05, DARKW, ch=.01, tag='ticket sign')
    R.fbox(fr, 'P', (th[0] + th[1]) / 2, th[3] + .2, .06, 1.0, .12, .004, '#f4efe2', tag='ticket sign')
    cy0, cy1 = -1.3, 1.1
    R.box('W', (W / 2 - .35, (cy0 + cy1) / 2, .95), (.7, cy1 - cy0, .06), '#9a6438', ch=.012, tag='counter')
    R.box('K', (W / 2 - .32, (cy0 + cy1) / 2, .46), (.62, cy1 - cy0 - .04, .92), GREEN, ch=.015, tag='counter')
    for k in range(3):
        R.box('K', (W / 2 - .64, cy0 + .4 + k * .8, .5), (.02, .62, .6), shade(GREEN, 1.15), ch=.006, tag='counter')
    dp = V((W / 2 - .35, .7, .98))
    R.box('M', dp + V((0, 0, .06)), (.22, .16, .12), '#262c38', ch=.015, tag='dating press')
    R.box('M', dp + V((0, 0, .15)), (.08, .08, .08), BRASS, ch=.008, tag='dating press')
    R.rod('M', dp + V((0, 0, .18)), dp + V((0, .12, .34)), .012, BRASS, n=5, tag='dating press')
    R.sphere('K', dp + V((0, .13, .35)), .025, '#1d2430', seg=6, rings=4, tag='dating press')
    for k in range(4):
        R.box('P', (W / 2 - .45 + (k % 2) * .08, -.6 + k * .05, .985), (.06, .035, .004), ['#f0e0b0', '#f4c0c0', '#c0e0f0', '#f0e0b0'][k],
              ch=0, rot=(0, 0, .2 * k), tag='tickets')
    # pigeonhole rack of card tickets, back-right
    rk = Loc((W / 2 - .2, 2.0), AGAINST['right'])
    R.box('W', rk.p(0, 0, 1.45), (1.3, .3, 1.2), '#7a4a2c', ch=.015, rot=rk.rz, tag='ticket rack')
    for r in range(6):
        for c_ in range(8):
            u = -.56 + c_ * .16
            z = 1.0 + r * .17
            R.box('W', rk.p(u, -.14, z + .07), (.13, .02, .13), '#3a2418', ch=0, rot=rk.rz, tag='ticket rack')
            col = ['#f0e0b0', '#f4c0c0', '#c0e0f0', '#c8e8b0', '#f8f0d8'][(r + c_) % 5]
            R.box('P', rk.p(u, -.155, z + .06), (.09, .006, .09 + .03 * ((r * 3 + c_) % 3)), col, ch=0, rot=rk.rz,
                  tag='tickets')
    R.box('W', rk.p(0, -.02, .5), (1.3, .3, .9), '#6b4027', ch=.015, rot=rk.rz, tag='ticket rack')
    R.col('counter', (W / 2 - .75, cy0 - .05, -.5), (W / 2, cy1 + .05, 1.0))
    R.col('rack', (W / 2 - .4, 1.3, -.5), (W / 2, 2.7, 2.1), view=True)
    R.box('W', (W / 2 - 1.05, -.1, .45), (.32, .32, .04), '#9a6438', ch=.01, tag='stool')
    for sx in (-1, 1):
        for sy in (-1, 1):
            R.rod('W', (W / 2 - 1.05 + sx * .12, -.1 + sy * .12, 0), (W / 2 - 1.05 + sx * .1, -.1 + sy * .1, .44), .018,
                  DARKW, n=5, tag='stool')
    R.col_c('stool', (W / 2 - 1.05, -.1, 0), (.36, .36, .47))

    # ---- centre: Genzo's desk: green lamp, ledger, telephone, Kobo model, the first ticket
    dx0, dx1, dy0, dy1, dz = -1.0, .9, .45, 1.3, .78
    L = Loc(((dx0 + dx1) / 2, (dy0 + dy1) / 2, 0), 0)
    R.box('W', L.p(0, 0, dz - .03), (dx1 - dx0, dy1 - dy0, .06), '#7a4a2c', ch=.015, tag='desk')
    R.box('P', L.p(-.1, -.05, dz + .003), (1.1, .55, .006), '#2f6a4a', ch=0, tag='desk blotter')
    for s in (-1, 1):
        R.box('W', L.p(s * .72, 0, (dz - .06) / 2), (.42, .8, dz - .06), '#6b4027', ch=.015, tag='desk')
        for k in range(3):
            R.box('W', L.p(s * .72, -.405, .15 + k * .22), (.36, .02, .18), '#7a4a2c', ch=.006, tag='desk')
            R.box('M', L.p(s * .72, -.42, .17 + k * .22), (.1, .012, .02), BRASS, ch=0, tag='desk')
    lampc = L.p(-.65, .2, dz)
    R.cyl('M', lampc + V((0, 0, .02)), .08, .04, BRASS, n=12, tag='desk lamp')
    R.rod('M', lampc + V((0, 0, .04)), lampc + V((0, 0, .36)), .012, BRASS, n=5, tag='desk lamp')
    R.B('K').append(bm_sphere((.18, .09, .07), 12, 5), arch_lib.xform(lampc + V((0, -.04, .4))), R.t('K', '#1f7a4a'),
                    smooth=70, tag='desk lamp')
    R.cyl('G', lampc + V((0, -.04, .34)), .1, .02, '#fff2c8', n=10, tag='desk lamp')
    R.node('Light_2', lampc + V((0, -.2, .25)))
    R.box('K', L.p(-.15, -.08, dz + .03), (.34, .26, .05), '#8a3a28', ch=.008, rot=(0, 0, .08), tag='ledger')
    R.box('P', L.p(-.15, -.08, dz + .058), (.32, .24, .006), '#f4ead0', ch=0, rot=(0, 0, .08), tag='ledger')
    R.lathe('K', [(0, 0), (.04, 0), (.045, .09), (0, .09)], L.p(.2, .2, dz), '#e8e0ce', n=8, tag='mug')
    tel = L.p(.55, .22, dz)
    R.cyl('M', tel + V((0, 0, .02)), .07, .04, '#1d2430', n=10, tag='telephone')
    R.rod('M', tel + V((0, 0, .04)), tel + V((0, 0, .28)), .018, '#1d2430', n=6, tag='telephone')
    R.lathe('M', [(0, 0), (.04, 0), (.045, .03), (0, .04)], tel + V((0, 0, .28)), BRASS, n=8, rot=(1.2, 0, 0), tag='telephone')
    R.rod('M', tel + V((.06, 0, .1)), tel + V((.06, 0, .24)), .015, '#1d2430', n=5, tag='telephone')
    ko = L.p(.62, -.2, dz)
    R.box('K', ko + V((0, 0, .05)), (.1, .22, .08), RED, ch=.01, tag='kobo model')
    R.cyl('K', ko + V((0, -.02, .1)), .04, .16, RED, n=10, rot=(math.pi / 2, 0, 0), tag='kobo model')
    R.box('K', ko + V((0, .08, .12)), (.1, .07, .1), '#1d2430', ch=.01, tag='kobo model')
    R.cyl('K', ko + V((0, -.08, .15)), .015, .06, '#1d2430', n=6, tag='kobo model')
    for k in range(3):
        for s in (-1, 1):
            R.cyl('K', ko + V((s * .055, -.07 + k * .07, .025)), .025, .015, '#262c38', n=8, rot=(0, math.pi / 2, 0),
                  tag='kobo model')
    R.box('P', L.p(.25, -.25, dz + .004), (.14, .08, .006), '#f0e0b0', ch=0, rot=(0, 0, -.2), tag='tickets')
    R.node('Item_keepsake', L.p(.18, -.22, dz + .24))
    R.col('desk', (dx0 - .1, dy0 - .05, -.5), (dx1 + .1, dy1 + .05, dz + .02))
    # chair behind the desk
    ch_ = L.p(0, .75, 0)
    R.box('W', ch_ + V((0, 0, .46)), (.46, .44, .05), '#9a6438', ch=.012, tag='chair')
    for sx in (-1, 1):
        for sy in (-1, 1):
            R.rod('W', ch_ + V((sx * .19, sy * .18, 0)), ch_ + V((sx * .19, sy * .18, .45)), .02, DARKW, n=5, tag='chair')
    R.box('W', ch_ + V((0, .2, .75)), (.44, .04, .5), '#9a6438', ch=.012, tag='chair')
    R.col_c('chair', (ch_.x, ch_.y, 0), (.5, .5, .5))
    pendant(R, (0, .2, 2.6), r=.28, col='#2f7f6f', cord=H + .6 - 2.6)
    R.node('Light_1', (0, .2, 2.45))
    plant(R, (W / 2 - .35, -2.6, 0), r=.2, h=.34, pot='#2f5f8a', kind='tall', leaf='#3f8f3a', seed=12)
    R.col_c('plant', (W / 2 - .35, -2.6, 0), (.45, .45, .9))

    R.node('Spawn', (0, -.95, 0))
    R.node('Exit', (0, -D / 2 + .55, 0))
    R.shell_cols(surface='wood')
    return R.finish_room()
