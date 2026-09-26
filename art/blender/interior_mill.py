"""Ota's mill interior (build_interiors.py): stone and timber, the great pit wheel on the water wheel's axle, the
wallower and main shaft, the spur wheel and stone nut under the millstone tun and its hopper; a raised tatami corner
with the brazier and low table (and a plate of pickled radish), shelves of radish crocks and two pickling barrels
("ten years of radish"), daikon drying under the beam, and the fishing corner where Ota and Genzo's float waits.

Pivots follow the water wheel outside (glTF extras axis / ratio, read by src/world/interiors.js):
Gear_pit (axle, about X, 1:1), Gear_shaft (vertical, about three.js Y), Gear_nut (stone spindle)."""
import math, random
from mathutils import Vector
from interior_lib import *  # noqa: F401,F403
from interior_rooms import builder, chabudai, cushion, teacup, IRON, BRASS, DARKW

V = Vector
STONE = ['#a79f94', '#b8ab98', '#9c9488', '#c2b49c', '#a89a8a', '#8f8a84']


def gear_ring(R, group, c, r, width, n, axis, col, cog=(.12, .07, .09), face_sign=-1, arms=4, hub=.2):
    """A wooden gear: rim, crossed arms, hub and n pegs on one face (axis 'x') or around the rim (axis 'z')."""
    c = V(c)
    if axis == 'x':
        rot = (0, math.pi / 2, 0)
        R.torus('W', c, r, width / 2, col, maj=20, mn=4, rot=rot, group=group, tag='gears')
        R.torus('W', c, r * .8, width / 3, shade(col, .85), maj=16, mn=4, rot=rot, group=group, tag='gears')
        for k in range(arms):
            a = math.pi * k / arms
            d = V((0, math.cos(a), math.sin(a))) * r * 1.02
            R.beam('W', c - d, c + d, .1, .13, shade(col, .9), ch=.01, up=(1, 0, 0), group=group, tag='gears')
        R.cyl('W', c, hub, .34, shade(col, .8), n=10, rot=rot, group=group, tag='gears')
        for k in range(n):
            a = TAU * k / n
            p = c + V((face_sign * (width / 2 + cog[0] / 2), math.cos(a) * r * .95, math.sin(a) * r * .95))
            R.box('W', p, cog, '#e8c48a', ch=0, rot=(a, 0, 0), group=group, tag='gear cogs')
    else:
        R.torus('W', c, r, width / 2, col, maj=20, mn=4, group=group, tag='gears')
        for k in range(arms):
            a = math.pi * k / arms
            d = V((math.cos(a), math.sin(a), 0)) * r
            R.beam('W', c - d, c + d, .09, .1, shade(col, .9), ch=.01, group=group, tag='gears')
        for k in range(n):
            a = TAU * k / n
            p = c + V((math.cos(a), math.sin(a), 0)) * (r + width / 2 + cog[0] / 2 - .01)
            R.box('W', p, cog, '#e8c48a', ch=0, rot=(0, 0, a), group=group, tag='gear cogs')


def lantern_gear(R, group, c, r, h, n, col):
    """A lantern pinion (wallower / stone nut): two discs and n staves."""
    c = V(c)
    for z in (-h / 2, h / 2):
        R.cyl('W', c + V((0, 0, z)), r * 1.12, .06, col, n=12, ch=.01, group=group, tag='gears')
    for k in range(n):
        a = TAU * k / n
        p = c + V((math.cos(a) * r, math.sin(a) * r, 0))
        R.rod('W', p - V((0, 0, h / 2)), p + V((0, 0, h / 2)), .03, '#e8c48a', n=5, group=group, tag='gear cogs')


def crock(R, c, rng, h=None, col=None, radish=False):
    c = V(c)
    h = h or rng.uniform(.2, .3)
    r = h * rng.uniform(.42, .5)
    col = col or rng.choice(['#6b4a3a', '#2f4c86', '#8a5a3a', '#a86a3a', '#3a6a7a'])
    R.lathe('K', [(0, 0), (r * .8, 0), (r, h * .35), (r * .95, h * .8), (r * .62, h * .92), (r * .65, h), (0, h * .98)],
            c, col, n=8, tag='crocks')
    if radish:
        R.rod('K', c + V((0, 0, h * .7)), c + V((.03, .02, h + .08)), .03, '#f2cf3a', n=6, r2=.022, tag='radish')
    else:
        R.cyl('W', c + V((0, 0, h + .01)), r * .7, .03, '#c9a062', n=8, tag='crocks')


def pickle_barrel(R, c, r=.33, h=.52, rng=None):
    c = V(c)
    R.cyl('W', c + V((0, 0, h / 2)), r, h,
          lambda cc, nn: R.t('W', shade('#b07a44', .82 if int((math.atan2(nn.y, nn.x) + 4) * 4) % 2 else 1.0)),
          n=14, ch=.015, tag='barrels')
    for z in (.1, h - .1):
        R.torus('M', c + V((0, 0, z)), r + .008, .014, IRON, maj=14, mn=3, tag='barrels')
    R.cyl('W', c + V((0, 0, h - .02)), r * .86, .04, '#d9a468', n=12, tag='barrels')
    R.sphere('P', c + V((0, 0, h + .09)), (r * .6, r * .5, .13), '#9c9488', seg=8, rings=5, tag='barrel stone')


def daikon(R, a, b, n, rng):
    """Radishes drying on a string between a and b."""
    a, b = V(a), V(b)
    R.rod('P', a, b, .006, '#c9a062', n=3, tag='daikon')
    for k in range(n):
        p = a.lerp(b, (k + .5) / n) + V((0, 0, -.02))
        L = rng.uniform(.34, .46)
        R.rod('K', p, p + V((rng.uniform(-.03, .03), rng.uniform(-.03, .03), -L)), .045, '#f4ecd8', n=7, r2=.012, tag='daikon')
        for j in range(3):
            R.rod('P', p, p + V((math.cos(j * 2.1) * .08, math.sin(j * 2.1) * .08, .1)), .015, '#5a9a3a', n=3, r2=.005,
                  tag='daikon')


@builder('interior-mill')
def build_mill():
    W, D, H = 7.8, 7.0, 3.6
    R = Room('interior-mill', W, D, H, ceil=4.3, cam_top=3.45)
    fire_mat(R)
    rng = random.Random(33)
    fc = R.faces()
    PL = '#efdcb4'
    SB = 1.15                                  # stone base height
    axle = (D / 2 - .28, D / 2 + .28, 1.32, 1.88)
    holes = {
        'front': [(W / 2 - .8, W / 2 + .8, 0, 2.2), (W / 2 + 2.1, W / 2 + 3.1, 1.25, 2.1), (W / 2 - 3.1, W / 2 - 2.1, 1.25, 2.1)],
        'back': [(W / 2 - .9, W / 2 + .3, 1.4, 2.4)],
        'left': [(D / 2 + 1.4, D / 2 + 2.3, 1.6, 2.4)],
        'right': [(D / 2 + 2.0, D / 2 + 2.9, 1.35, 2.1), axle],
    }
    shell_holes = {k: [h for h in v if h is not axle] for k, v in holes.items()}
    posts = {'back': [.07, 1.9, 3.05, 4.45, 5.9, W - .07], 'front': [.07, 1.9, 3.0, 4.8, 5.9, W - .07],
             'left': [.07, 1.75, 3.5, 5.25, D - .07], 'right': [.07, 1.75, 3.1, 3.9, 5.25, D - .07]}
    rails = [(SB + .06, .12), (2.45, .12), (H - .1, .2)]
    for side, (f, L) in fc.items():
        courses(R, f, 0, L, 0, SB, STONE, key='P', course=.29, length=(.38, .72), mortar='#7d7266', proud=.018,
                holes=holes[side], seed=len(side), tag='stone base')
        plaster_wall(R, f, L, SB, H + .1, holes[side], PL, mottle=.08, us=post_splits(posts[side], .17),
                     zs=rail_splits(rails))
        for u in posts[side]:
            R.fbox(f, 'W', u, (SB + H) / 2, .05, .17, H - SB, .1, DARKW, ch=.014, tag='posts')
        for z, hh in rails:
            for a, b in spans(0, L, z, holes[side]):
                R.fbox(f, 'W', (a + b) / 2, z, .05, b - a, hh, .09, DARKW, ch=.012, tag='rails')
    # joists and the main beam, board ceiling
    for k in range(9):
        y = -D / 2 + .45 + k * (D - .9) / 8
        R.box('W', (0, y, H + .12), (W + .1, .16, .24), '#6b4027', ch=.015, tag='joists')
    R.box('W', (0, 0, H + .36), (.3, D + .1, .26), DARKW, ch=.02, tag='beams')
    board_ceiling(R, 4.3, col='#a87448', board=.32, along='x')
    shadow_shell(R, shell_holes)

    # ---- floor: wide old boards, flour-dusted round the millstones
    def dust(c):
        d = math.hypot(c.x - 2.3, c.y - 1.2)
        return max(0.0, .55 - d * .28)
    plank_floor(R, -W / 2, W / 2, -D / 2, D / 2, board=.28, seg=1.1, base='#a8744a', var=.2, along='y', dust=dust, seed=5)

    # ---- windows: river and trees outside, deep stone reveals
    for side, hl in holes.items():
        f, L = fc[side]
        for h in hl:
            if h[2] <= .05 or h is axle:
                continue
            window(R, f, h, depth=.36, kind='river', seed=int(h[0] * 10), frame=DARKW, cols=2, rows=2, nu=8, nv=6)
    # double plank doors
    ff, Lf = fc['front']
    dh = holes['front'][0]
    reveal(R.B('P'), ff, dh, .3, tint=R.t('P', '#6e665c'), sides='lrt')
    for s in (-1, 1):
        u0 = W / 2 + (0 if s > 0 else -.8)
        vboards(R, ff, 'W', u0 + .01, u0 + .79, .01, 2.18, '#9a6438', w=.16, d=-.26, tag='mill doors', seed=3 + s)
        for z in (.4, 1.75):
            R.fbox(ff, 'M', u0 + .4, z, -.235, .7, .07, .015, IRON, tag='door straps')
    R.fbox(ff, 'W', W / 2, 2.3, .03, 1.9, .2, .1, DARKW, ch=.015, tag='door lintel')
    R.fbox(ff, 'M', W / 2 + .12, 1.05, -.225, .05, .2, .03, IRON, tag='door straps')
    R.fbox(ff, 'M', W / 2 - .12, 1.05, -.225, .05, .2, .03, IRON, tag='door straps')

    # ---- the gear train on the right: pit wheel on the axle, wallower + main shaft + spur wheel, stone nut
    gp = R.pivot('Gear_pit', V((3.0, 0, 1.6)), ground=None, with_statics=True)
    R.pivots['Gear_pit']['axis'] = 'x'
    R.pivots['Gear_pit']['ratio'] = 1.0
    R.cyl('W', (3.3, 0, 1.6), .17, 1.35, '#6b4027', n=8, rot=(0, math.pi / 2, 0), group=gp, tag='axle')
    for x in (3.55, 3.8):
        R.cyl('M', (x, 0, 1.6), .18, .06, IRON, n=8, rot=(0, math.pi / 2, 0), group=gp, tag='axle')
    gear_ring(R, gp, (3.0, 0, 1.6), 1.15, .16, 24, 'x', '#8a5a32')
    R.box('P', (3.75, 0, .7), (.3, .6, 1.4), '#9c9488', ch=.03, tag='bearing')
    R.box('W', (3.72, 0, 1.4), (.36, .5, .14), DARKW, ch=.015, tag='bearing')
    gs = R.pivot('Gear_shaft', V((2.2, 0, 0)), ground=None, with_statics=True)
    R.pivots['Gear_shaft']['axis'] = 'y'
    R.pivots['Gear_shaft']['ratio'] = -3.0
    R.cyl('W', (2.2, 0, H / 2), .13, H + .1, '#7a4a2c', n=8, group=gs, tag='shaft')
    for z in (.25, 1.2, 2.2, 3.3):
        R.cyl('M', (2.2, 0, z), .145, .05, IRON, n=8, group=gs, tag='shaft')
    lantern_gear(R, gs, (2.2, 0, 2.72), .5, .3, 8, '#8a5a32')
    gear_ring(R, gs, (2.2, 0, .6), .8, .12, 20, 'z', '#8a5a32', cog=(.1, .06, .08))
    gn = R.pivot('Gear_nut', V((2.2, 1.12, .6)), ground=None, with_statics=True)
    R.pivots['Gear_nut']['axis'] = 'y'
    R.pivots['Gear_nut']['ratio'] = 6.0
    lantern_gear(R, gn, (2.2, 1.12, .6), .2, .16, 6, '#8a5a32')
    R.rod('M', (2.2, 1.12, .45), (2.2, 1.12, 1.0), .03, IRON, n=6, group=gn, tag='spindle')
    # hurst frame (platform) with the millstone tun, hopper on its horse, the flour chute and bin
    hx0, hx1, hy0, hy1, hz = 1.45, 3.35, .6, 2.25, 1.0
    for x in (hx0 + .07, hx1 - .07):
        for y in (hy0 + .07, hy1 - .07):
            R.box('W', (x, y, hz / 2), (.14, .14, hz), DARKW, ch=.015, tag='hurst')
    for y in (hy0 + .07, hy1 - .07):
        R.box('W', ((hx0 + hx1) / 2, y, hz - .08), (hx1 - hx0, .16, .16), DARKW, ch=.015, tag='hurst')
    for k in range(7):
        x = hx0 + .14 + k * (hx1 - hx0 - .28) / 6
        R.box('W', (x, (hy0 + hy1) / 2 + .35, hz + .02), ((hx1 - hx0 - .28) / 7 - .01, hy1 - hy0 - .7, .05),
              shade('#9a6438', .9 + .15 * rng.random()), ch=.004, tag='hurst')
        R.box('W', (x, hy0 + .2, hz + .02), ((hx1 - hx0 - .28) / 7 - .01, .4, .05), shade('#9a6438', .9 + .15 * rng.random()),
              ch=.004, tag='hurst')
    tun = V((2.2, 1.12, hz + .045))
    R.cyl('W', tun + V((0, 0, .22)), .66, .44,
          lambda cc, nn: R.t('W', shade('#b07a44', .8 if int((math.atan2(nn.y, nn.x) + 4) * 5) % 2 else 1.0)), n=18, ch=.02,
          tag='tun')
    R.cyl('W', tun + V((0, 0, .45)), .6, .04, '#8a5a32', n=18, tag='tun')
    for z in (.08, .36):
        R.torus('M', tun + V((0, 0, z)), .67, .014, IRON, maj=18, mn=3, tag='tun')
    for sx in (-1, 1):
        for sy in (-1, 1):
            R.rod('W', tun + V((sx * .42, sy * .42, .45)), tun + V((sx * .22, sy * .22, 1.0)), .03, DARKW, n=5, tag='horse')
    R.box('W', tun + V((0, 0, 1.18)), (.78, .78, .42), '#b07a44', ch=.015, taper=(1.0, 1.0), tag='hopper')
    R.box('W', tun + V((0, 0, .98)), (.3, .3, .06), '#8a5a32', ch=.008, tag='hopper')
    R.box('P', tun + V((0, 0, 1.38)), (.66, .66, .02), '#f4ecd8', ch=0, tag='hopper grain')
    R.beam('W', tun + V((-.6, 0, .1)), V((1.2, 1.1, .55)), .16, .1, '#8a5a32', ch=.01, tag='chute')
    R.box('W', (1.05, 1.1, .28), (.55, .5, .56), '#9a6438', ch=.02, tag='flour bin')
    R.box('P', (1.05, 1.1, .55), (.47, .42, .02), '#f8f2e4', ch=0, tag='flour bin')
    R.col('machinery', (1.35, -1.35, -.5), (W / 2 + .2, 2.35, 3.6), view=True)
    R.col_c('flour bin', (1.05, 1.1, 0), (.6, .55, .6))
    lamp_c = V((hx0 + .07, hy0 + .07, 2.0))
    R.rod('M', lamp_c + V((0, 0, .1)), lamp_c + V((-.3, 0, .1)), .012, IRON, n=4, tag='lantern')
    R.lathe('M', [(0, .2), (.07, .19), (.09, .12), (.07, -.1), (0, -.12)], lamp_c + V((-.32, 0, -.05)), BRASS, n=8, tag='lantern')
    R.cyl('G', lamp_c + V((-.32, 0, -.03)), .055, .16, '#ffe0a0', n=8, tag='lantern')
    R.node('Light_2', lamp_c + V((-.32, -.1, -.1)))
    # sack hoist chain from the beam
    for k in range(19):
        z = H - .05 - k * .085
        R.torus('M', (1.1, -.9, z), .05, .012, IRON, maj=8, mn=4, rot=(math.pi / 2, 0, math.pi / 2 * (k % 2)), tag='chain')
    R.torus('M', (1.1, -.9, H - 1.72), .08, .02, IRON, maj=10, mn=4, rot=(math.pi / 2, 0, 0), tag='chain', arc=.7)

    # ---- sacks and a balance scale, front right
    for k, (x, y, hh) in enumerate(((2.0, -2.9, .72), (2.55, -2.95, .78), (3.1, -2.85, .7), (2.3, -2.4, .62), (2.9, -2.35, .66))):
        sack(R, (x, y, 0), h=hh, r=.25, col='#e9dcc0', rot=rng.random(), seed=k)
    R.box('P', (2.6, -2.7, .86), (.85, .45, .26), '#e2d2b0', ch=.08, seg=2, rot=(0, 0, .1), tag='sacks')
    R.col('sacks', (1.7, -D / 2, -.5), (W / 2, -2.05, 1.0))
    sc = V((1.2, -2.7, 0))
    R.box('W', sc + V((0, 0, .06)), (.5, .4, .12), DARKW, ch=.015, tag='scale')
    R.rod('M', sc + V((0, 0, .12)), sc + V((0, 0, 1.0)), .025, IRON, n=6, tag='scale')
    R.box('M', sc + V((0, 0, 1.0)), (.7, .04, .04), BRASS, ch=.006, tag='scale')
    for s in (-1, 1):
        R.cyl('M', sc + V((s * .33, 0, .7)), .14, .025, BRASS, n=10, tag='scale')
        R.rod('M', sc + V((s * .33, 0, .72)), sc + V((s * .33, 0, 1.0)), .005, IRON, n=3, tag='scale')
    R.col_c('scale', (sc.x, sc.y, 0), (.55, .45, 1.05))

    # ---- left: radish crocks on shelves, pickling barrels, daikon drying under the beam
    for z in (.45, .95, 1.45):
        R.box('W', (-W / 2 + .2, -1.4, z), (.34, 3.2, .04), '#8a5a32', ch=.006, tag='crock shelves')
        y = -2.9
        while y < .1:
            crock(R, (-W / 2 + .2, y, z + .02), rng, radish=rng.random() < .3)
            y += rng.uniform(.26, .34)
    for y in (-3.0, .2):
        R.box('W', (-W / 2 + .2, y, .95), (.34, .05, 1.9), DARKW, ch=.008, tag='crock shelves')
    R.col('crocks', (-W / 2 - .2, -3.1, -.5), (-W / 2 + .4, .25, 1.9))
    pickle_barrel(R, (-2.9, -1.9, 0), rng=rng)
    pickle_barrel(R, (-2.85, -1.05, 0), r=.28, h=.46, rng=rng)
    R.col('barrels', (-3.25, -2.25, -.5), (-2.5, -.7, .75))
    daikon(R, (-3.5, -2.6, 2.95), (-3.5, -.2, 2.95), 8, rng)

    # ---- the living corner: raised tatami, low table with pickled radish, brazier, cushions
    px0, px1, py0, py1, pz = -W / 2, -1.95, .75, D / 2, .35
    R.box('W', ((px0 + px1) / 2, (py0 + py1) / 2, pz / 2), (px1 - px0, py1 - py0, pz), '#7a4a2c', ch=.015, tag='platform')
    R.box('W', (px1 - .06, (py0 + py1) / 2, pz - .04), (.12, py1 - py0, .08), '#9a6438', ch=.015, tag='platform')
    R.box('W', ((px0 + px1) / 2, py0 + .06, pz - .04), (px1 - px0, .12, .08), '#9a6438', ch=.015, tag='platform')
    for x, y, ax in ((-3.85, .82, False), (-2.95, .82, False), (-3.85, 2.62, True)):
        tatami(R, x, y, along_x=ax, z=pz - .02, straw='#cfc36a', heri='#3a2a20', rng=rng)
    R.col('platform', (px0 - .2, py0, -.5), (px1, py1 + .2, pz), walk=True, surface='wood')
    tc = V((-2.95, 1.75, pz + .03))
    top = chabudai(R, tc, r=.42, h=.28, col='#6b4027')
    R.col_c('table', (tc.x, tc.y, pz), (.9, .9, .3), top=top)
    R.cyl('K', tc + V((.1, .05, top - tc.z + .006)), .12, .012, '#f4efe2', n=14, tag='radish plate')
    for k in range(6):
        R.cyl('K', tc + V((.04 + (k % 3) * .06, -.01 + (k // 3) * .1, top - tc.z + .02)), .03, .012, '#f2cf3a', n=8,
              rot=(0, .3, 0), tag='radish plate')
    teacup(R, tc + V((-.15, -.1, top - tc.z)), col='#3a6a7a', r=.035)
    R.lathe('K', [(0, 0), (.035, 0), (.05, .08), (.02, .14), (.025, .17), (0, .17)], tc + V((-.2, .15, top - tc.z)), '#e8e0ce',
            n=8, tag='tokkuri')
    for (dx, dy, col) in ((0, -.72, '#2d4f8a'), (-.75, .1, '#8a3a2a')):
        cushion(R, tc + V((dx, dy, 0)), s=.46, col=col)
    hb = V((-2.35, 1.0, pz))
    R.lathe('K', [(0, 0), (.2, 0), (.26, .12), (.26, .3), (.22, .32), (0, .3)], hb, '#2f5f8a', n=12, tag='hibachi')
    R.cyl('P', hb + V((0, 0, .305)), .21, .01, '#a8a098', n=12, tag='hibachi')
    for k in range(5):
        R.sphere('F', hb + V((math.cos(k * 1.3) * .08, math.sin(k * 1.3) * .08, .325)), .04, '#ff8a3a', seg=6, rings=3,
                 tag='coals')
    for k in range(3):
        a = TAU * k / 3
        R.rod('M', hb + V((math.cos(a) * .15, math.sin(a) * .15, .31)), hb + V((math.cos(a) * .1, math.sin(a) * .1, .42)), .01,
              IRON, n=4, tag='trivet')
    R.lathe('M', [(0, 0), (.1, 0), (.13, .06), (.11, .13), (.04, .15), (0, .16)], hb + V((0, 0, .42)), '#262c38', n=10,
            tag='kettle')
    R.col_c('hibachi', (hb.x, hb.y, pz), (.55, .55, .5))
    R.node('Light_3', hb + V((0, 0, .5)))['fire'] = 1
    # hanging oil lamp over the corner
    ol = V((-2.95, 1.8, 2.35))
    R.rod('M', ol + V((0, 0, .2)), V((-2.95, 1.8, H)), .008, IRON, n=3, tag='oil lamp')
    R.lathe('M', [(0, .22), (.12, .2), (.16, .16), (.05, .14), (0, .14)], ol, BRASS, n=10, tag='oil lamp')
    R.lathe('G', [(0, -.1), (.07, -.08), (.075, .05), (.04, .14), (0, .14)], ol, '#ffe6b0', n=10, tag='oil lamp')
    R.cyl('M', ol + V((0, 0, -.12)), .09, .04, BRASS, n=10, tag='oil lamp')
    R.node('Light_1', ol + V((0, 0, -.05)))

    # ---- the fishing corner on the back wall: rods, a gyotaku print, creel, the keepsake shelf
    fb, Lb = fc['back']
    for k, z in enumerate((2.05, 2.3, 2.55)):
        a = V((-3.7, D / 2 - .1, z))
        R.rod('W', a, a + V((2.9 - k * .2, 0, .02)), .014, '#c9b060', n=5, r2=.007, tag='rods')
        R.cyl('M', a + V((.35, -.02, 0)), .04, .03, '#c8322a' if k == 1 else IRON, n=8, rot=(math.pi / 2, 0, 0), tag='rods')
    for x in (-3.5, -2.2):
        for z in (2.05, 2.3, 2.55):
            R.box('W', (x, D / 2 - .06, z - .03), (.04, .1, .03), DARKW, ch=0, tag='rods')
    picture(R, fb, R.u_of('back', x=-1.2), 2.0, .62, .42, frame=DARKW, kind='fish', seed=2)
    R.box('W', (-2.95, D / 2 - .14, 1.25), (.62, .26, .04), '#9a6438', ch=.008, tag='keepsake shelf')
    for x in (-3.2, -2.7):
        R.box('W', (x, D / 2 - .06, 1.17), (.04, .1, .12), DARKW, ch=0, tag='keepsake shelf')
    R.node('Item_keepsake', (-2.95, D / 2 - .18, 1.52))
    creel = V((-3.55, 3.1, pz))
    R.box('W', creel + V((0, 0, .15)), (.34, .24, .3), '#c9a062', ch=.04, seg=2, tag='creel')
    R.box('W', creel + V((0, 0, .31)), (.36, .26, .03), '#a8844a', ch=.01, tag='creel')
    R.lathe('P', [(0, .12), (.07, .11), (.1, .05), (.2, .02), (.21, 0), (0, .0)], (-2.3, 3.15, pz + .01), '#e3bb58', n=12,
            tag='hat')

    R.node('Spawn', (0, -1.3, 0))
    R.node('Exit', (0, -D / 2 + .55, 0))
    R.shell_cols(surface='wood')
    return R.finish_room()
