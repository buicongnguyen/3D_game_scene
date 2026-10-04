"""Rin's boathouse interior (build_interiors.py): a riverside boat workshop, warm weathered boards over a teal
wainscot, a small boat on trestles in the middle (a walkable ring all round), oars on the wall, a workbench, a loft
shelf with its ladder, a sliding hatch onto the water at the far end, hanging lanterns, fishing gear, and a cosy
corner with a futon and a kettle on a hibachi.

Designed as if entered through the -Y wall (the runtime turns the whole room round for the boathouse's back door).
Variants (empty groups Var_1..Var_3, one shown per building): 1 Rin's fishing nook, 2 net mending, 3 a festival boat
being painted. Nodes: Spawn, Exit, Light_1..3 (Light_3 = hibachi, fire 1), Spot_npc_1 (Rin), Spot_npc_2 (at the bench)."""
import math, random
from mathutils import Vector, Matrix
import arch_lib
from interior_lib import *  # noqa: F401,F403
from interior_rooms import builder, IRON, BRASS, DARKW
from interior_kb_props import *  # noqa: F401,F403
from interior_kawabe_shop import mini_plant

V = Vector
BOARD, TEAL, CAP, CREAM, RED = '#c79a60', '#2f6f7a', '#5a3726', '#f4efe2', '#d63a2a'
MUST, INDIGO = '#e0a93a', '#2d4a7a'
BOAT = dict(L=3.0, beam=1.1, depth=.5)
BX, BY, KZ = -.1, .7, .5            # boat: centre x, centre y, keel height


def face_node(R, name, loc, face_dir):
    e = R.node(name, loc)
    e.rotation_euler = (0, 0, math.atan2(face_dir[0], -face_dir[1]))
    return e


def mino(R, face, u, z_top, col='#c9a062'):
    """A straw rain cape hung on the wall: three stacked double-sided trapezoids."""
    mb = R.B('P')
    for k in range(3):
        top, bot = z_top - k * .22, z_top - k * .22 - .3
        wt, wb = .22 + k * .06, .32 + k * .08
        pts = [(u - wt / 2, top), (u + wt / 2, top), (u + wb / 2, bot), (u - wb / 2, bot)]
        for dd, rev in ((.07 + k * .006, False), (.066 + k * .006, True)):
            q = [face.p(a, b, dd) for a, b in pts]
            mb.poly(q[::-1] if rev else q, tint=R.t('P', shade(col, .85 + .12 * k)), normal=face.n * (-1 if rev else 1),
                    tag='straw capes')


def sawhorse(R, c, w=1.1, h=.44):
    c = V(c)
    R.box('W', c + V((0, 0, h)), (w, .1, .08), '#8a5a32', ch=0, tag='trestles')
    for s in (-1, 1):
        R.rod('W', c + V((s * (w / 2 - .06), -.14, 0)), c + V((s * (w / 2 - .12), 0, h)), .035, '#8a5a32', n=4, tag='trestles')
        R.rod('W', c + V((s * (w / 2 - .06), .14, 0)), c + V((s * (w / 2 - .12), 0, h)), .035, '#8a5a32', n=4, tag='trestles')


def hat_straw(R, c, r=.2):
    c = V(c)
    R.lathe('W', [(r, 0), (r * .35, .06), (r * .3, .1), (0, .11)], c, '#e0c070', n=8, tag='hats')


def chabu(R, c, r=.36, h=.3):
    c = V(c)
    R.cyl('W', c + V((0, 0, h - .02)), r, .04, '#9a5a32', n=10, ch=0, tag='low table')
    R.cyl('W', c + V((0, 0, (h - .04) / 2)), r * .45, h - .04, '#7a4a28', n=6, ch=0, tag='low table')


def hibachi(R, c):
    """Charcoal brazier with a kettle: the 'Interior fire' coals glow under the iron kettle."""
    c = V(c)
    R.lathe('K', [(.1, 0), (.17, .04), (.17, .15), (.14, .15), (.14, .13), (0, .13)], c, '#8a4a32', n=8, tag='hibachi')
    R.cyl('F', c + V((0, 0, .135)), .125, .012, '#ffb060', n=8, tag='coals')
    R.lathe('M', [(.1, 0), (.13, .08), (.1, .15), (.05, .2), (0, .2)], c + V((0, 0, .16)), '#2e3238', n=8, tag='kettle')
    R.rod('M', c + V((.1, 0, .22)), c + V((.2, 0, .3)), .012, '#2e3238', n=4, tag='kettle')
    R.torus('M', c + V((0, 0, .36)), .1, .008, '#2e3238', maj=6, mn=3, rot=(math.pi / 2, 0, 0), tag='kettle', arc=.5)


def zabuton(R, c, col, rot=0.0):
    R.box('P', V(c) + V((0, 0, .04)), (.5, .5, .08), col, ch=0, rot=(0, 0, rot), tag='cushions')


@builder('interior-boathouse')
def build_boathouse():
    W, D, H = 5.0, 7.0, 3.5
    R = Room('interior-boathouse', W, D, H, ceil=4.35, cam_top=3.45)
    fire_mat(R)
    make_vars(R)
    rng = random.Random(77)
    fc = R.faces()
    holes = {
        'front': [(1.0, 2.0, 0, 2.2)],
        'left': [(1.9, 2.8, 1.1, 1.8)],
        'right': [(4.2, 5.1, 1.1, 1.8)],
        'back': [(1.0, 3.4, .35, 2.35)],
    }
    posts = {'back': [.06, W - .06], 'front': [.06, W - .06], 'left': [.06, D - .06], 'right': [.06, D - .06]}
    WS = 1.05
    for side, (f, L) in fc.items():
        plaster_wall(R, f, L, WS, H + .1, holes[side], BOARD, mottle=.1, du=.9, dz=.9, us=post_splits(posts[side], .16),
                     zs=[2.3, 2.38])
        wainscot(R, f, L, 0, WS, holes[side], TEAL, board=.36, cap=CAP, seed=len(side) + 5)
        for u in posts[side]:
            R.fbox(f, 'W', u, H / 2, .04, .16, H, .08, CAP, ch=0, tag='posts')
        for a, b in spans(0, L, 2.34, holes[side]):
            R.fbox(f, 'W', (a + b) / 2, 2.34, .03, b - a, .08, .05, CAP, ch=0, tag='rails')
    for y in (-2.6, -.9, .8, 2.5):
        R.box('W', (0, y, H + .16), (W + .1, .2, .32), '#6b4027', ch=0, tag='beams')
    R.box('W', (0, 0, H + .42), (.22, D + .1, .22), '#6b4027', ch=0, tag='beams')
    board_ceiling(R, 4.35, col='#c99a5c', board=.34, along='x')
    shadow_shell(R, holes)

    # ---- floor: wide worn boards
    plank_floor(R, -W / 2, W / 2, -D / 2, D / 2, board=.27, seg=1.4, base='#a47448', var=.18, along='y', seed=9)

    ff, Lf = fc['front']
    fb, Lb = fc['back']
    fl, Ll = fc['left']
    fr, Lr = fc['right']
    # ---- door, windows onto the river, the sliding hatch to the water
    door_inside(R, 'front', 1.5, w=1.0, h=2.2, col='#2f6f7a', frame=CAP, glass=False)
    window(R, fl, holes['left'][0], depth=.22, kind='river', seed=3, frame='#4a2e20', cols=2, rows=2, nu=4, nv=4)
    window(R, fr, holes['right'][0], depth=.22, kind='river', seed=5, frame='#4a2e20', cols=2, rows=2, nu=4, nv=4)
    hh = holes['back'][0]
    window(R, fb, hh, depth=.3, kind='river', seed=8, frame='#4a2e20', cols=4, rows=2, nu=6, nv=4, sill=True)
    # the sliding leaf, half across the opening, on an iron rail
    lu0, lu1 = 1.0, 2.35
    R.fbox(fb, 'W', (lu0 + lu1) / 2, 1.33, .16, lu1 - lu0, 2.0, .05, '#8a5a32', ch=0, tag='hatch door')
    for k in range(3):
        R.fbox(fb, 'W', lu0 + (k + .5) * (lu1 - lu0) / 3, 1.33, .2, .04, 1.9, .03, '#6b4027', ch=0, tag='hatch door')
    for z in (.6, 1.9):
        R.fbox(fb, 'M', (lu0 + lu1) / 2, z, .2, lu1 - lu0 - .1, .08, .02, IRON, tag='hatch door')
    R.fbox(fb, 'M', lu1 - .15, 1.2, .21, .08, .2, .02, BRASS, tag='hatch door')
    R.fbox(fb, 'M', 2.0, 2.45, .12, 3.0, .06, .06, IRON, tag='hatch rail')
    R.fbox(fb, 'W', 2.2, .3, .06, 2.7, .06, .12, '#6b4027', ch=0, tag='hatch sill')
    # lantern by the hatch and a tide chart
    ub = R.u_of('back', x=-1.9)
    R.fbox(fb, 'W', ub, 1.6, .03, .55, .75, .03, CAP, ch=0, tag='tide chart')
    R.fbox(fb, 'P', ub, 1.6, .05, .49, .69, .01, '#efe2c0', tag='tide chart')
    for k in range(6):
        R.fbox(fb, 'K', ub, 1.35 + k * .1, .062, .4, .02, .004, INDIGO if k % 2 == 0 else '#6a8fc0', tag='tide chart')

    # ---- the boat on trestles, in the middle of the room
    hull(R, (BX, BY, KZ), outer='#2f7f9a', inner='#e8c48a', trim=CREAM, band='#c8322a', **BOAT)
    for dy in (-.8, .8):
        sawhorse(R, (BX, BY + dy, 0), w=1.2, h=KZ - .06)
    R.box('W', (BX, BY, KZ - .05), (.12, 2.1, .1), '#6b4027', ch=0, tag='keel block')
    R.col('boat', (BX - .72, BY - 1.65, -.5), (BX + .72, BY + 1.65, 1.15))

    # ---- left wall: cosy corner (futon, low table with the hibachi), sea chest under the window, oars, workbench
    L = Loc((-W / 2 + .5, -D / 2 + 1.1), AGAINST['left'])
    R.box('P', (-W / 2 + .52, -D / 2 + 1.1, .08), (.95, 1.8, .16), '#efe2c4', ch=0, tag='futon')
    R.box('P', (-W / 2 + .52, -D / 2 + 1.35, .2), (.9, 1.2, .09), '#e0567a', ch=0, tag='futon')
    for sx in (-1, 1):
        R.box('K', (-W / 2 + .52 + sx * .2, -D / 2 + .38, .21), (.34, .28, .1), CREAM, ch=0, tag='futon')
    R.col('futon', (-W / 2 - .1, -D / 2 + .1, -.4), (-W / 2 + 1.03, -D / 2 + 2.0, .7))
    chabu(R, (-.9, -2.85, 0))
    hibachi(R, (-.9, -2.85, .3))
    zabuton(R, (-.9, -2.2, 0), '#3f5f95')
    zabuton(R, (-.15, -2.85, 0), '#c8322a', rot=.3)
    R.col_c('low table', (-.9, -2.85, 0), (.85, .85, .5))
    R.node('Light_3', (-.9, -2.85, .55))['fire'] = 1
    R.box('W', (-W / 2 + .3, -1.15, .3), (.55, 1.0, .6), '#7a4a28', ch=0, tag='sea chest')
    R.box('W', (-W / 2 + .3, -1.15, .63), (.6, 1.06, .06), '#8a5a32', ch=0, tag='sea chest')
    R.box('M', (-W / 2 + .59, -1.15, .45), (.02, .12, .1), BRASS, ch=0, tag='sea chest')
    R.col('sea chest', (-W / 2, -1.7, -.4), (-W / 2 + .6, -.6, .7))
    for k, (z, y0, y1) in enumerate(((2.0, .1, 2.45), (2.24, .25, 2.5), (2.48, .1, 2.4))):
        oar(R, (-W / 2 + .13, y0, z), (-W / 2 + .13, y1, z + .02 * k), blade=.4, col='#d9a468', bcol=['#c8322a', '#2f6f7a', MUST][k])
    for y in (.3, 1.4, 2.3):
        R.box('W', (-W / 2 + .1, y, 1.95), (.1, .08, .04), CAP, ch=0, tag='pegs')
        R.box('W', (-W / 2 + .1, y, 2.45), (.1, .08, .04), CAP, ch=0, tag='pegs')
    # workbench along the wall
    wl = Loc((-W / 2 + .38, 1.62), AGAINST['left'])
    R.box('W', wl.p(0, 0, .87), (1.95, .62, .06), '#c9985c', ch=0, rot=wl.rz, tag='workbench')
    R.box('W', wl.p(0, .02, .2), (1.85, .55, .04), '#8a5a32', ch=0, rot=wl.rz, tag='workbench')
    for sx in (-1, 1):
        for sy in (-1, 1):
            R.box('W', wl.p(sx * .9, sy * .25, .42), (.07, .07, .84), '#8a5a32', ch=0, rot=wl.rz, tag='workbench')
    R.box('W', wl.p(.45, 0, .55), (.7, .55, .5), '#7a4a28', ch=0, rot=wl.rz, tag='workbench')
    for k in range(2):
        R.box('W', wl.p(.45, -.285, .43 + k * .24), (.62, .02, .2), '#9a6a3c', ch=0, rot=wl.rz, tag='workbench')
        R.box('M', wl.p(.45, -.3, .44 + k * .24), (.1, .02, .025), BRASS, ch=0, rot=wl.rz, tag='workbench')
    R.box('M', wl.p(-.75, -.2, .98), (.14, .1, .14), IRON, ch=0, rot=wl.rz, tag='vise')
    R.box('W', wl.p(-.1, -.1, .93), (.25, .08, .05), '#d9a468', ch=0, rot=wl.rz, tag='bench tools')
    R.box('M', wl.p(.1, -.12, .915), (.3, .03, .04), '#b8bcc4', ch=0, rot=wl.rz, tag='bench tools')
    R.cyl('K', wl.p(.6, .1, .96), .045, .12, '#c8322a', n=6, tag='bench tools')
    R.cyl('K', wl.p(.72, .1, .96), .045, .12, TEAL, n=6, tag='bench tools')
    hurricane_lamp(R, wl.p(.85, .15, .9), col='#2f6f7a')
    R.col('workbench', (-W / 2 - .1, .55, -.4), (-W / 2 + .7, 2.7, .95))
    # pegboard of tools above the bench
    ubn = R.u_of('left', y=1.62)
    R.fbox(fl, 'W', ubn, 1.5, .02, 1.7, .5, .025, '#8a5a32', ch=0, tag='tool board')
    for k, dx in enumerate((-.65, -.3, .05, .4, .7)):
        R.fbox(fl, 'M', ubn + dx, 1.5 + (.06 if k % 2 else 0), .045, .03, .3, .015, '#9aa0aa', tag='wall tools')
        R.fbox(fl, 'W', ubn + dx, 1.35, .045, .035, .12, .02, '#a8703c', tag='wall tools')
    # ---- back-left: the net drying rack (A-frames and two poles)
    rx, ry0, ry1 = -1.95, 2.8, 3.4
    for y in (ry0, ry1):
        R.rod('W', (rx - .3, y, 0), (rx, y, 1.75), .035, '#8a5a32', n=4, tag='net rack')
        R.rod('W', (rx + .3, y, 0), (rx, y, 1.75), .035, '#8a5a32', n=4, tag='net rack')
    R.rod('W', (rx, ry0 - .05, 1.75), (rx, ry1 + .05, 1.75), .035, '#6b4027', n=5, tag='net rack')
    R.rod('W', (rx - .2, ry0, 1.0), (rx - .2, ry1, 1.0), .03, '#6b4027', n=4, tag='net rack')
    R.col('net rack', (rx - .42, ry0 - .15, -.4), (rx + .42, ry1 + .1, 1.8))

    # ---- front wall: bait bench (left of the door) and the little house-shrine (right)
    bb = V((-.45, -D / 2 + .3, 0))
    R.box('W', bb + V((0, 0, .78)), (1.5, .5, .05), '#c9985c', ch=0, tag='bench')
    for sx in (-1, 1):
        R.box('W', bb + V((sx * .68, 0, .38)), (.07, .42, .76), '#8a5a32', ch=0, tag='bench')
    R.box('W', bb + V((0, 0, .2)), (1.4, .42, .04), '#8a5a32', ch=0, tag='bench')
    R.col_c('bench', (bb.x, bb.y, 0), (1.5, .5, .82))
    ub = R.u_of('front', x=2.0)
    R.fbox(ff, 'W', ub, 1.9, .03, .6, .05, .22, '#8a5a32', ch=0, tag='shrine')
    R.fbox(ff, 'W', ub, 2.05, .06, .4, .2, .16, '#c9985c', ch=0, tag='shrine')
    R.fbox(ff, 'K', ub, 2.17, .06, .5, .04, .22, '#c8322a', ch=0, tag='shrine')
    R.fbox(ff, 'K', ub, 2.0, .15, .1, .1, .02, '#1d2430', tag='shrine')
    # ---- right wall: straw capes by the door, a loft shelf with its ladder
    for k, y in enumerate((-3.1, -2.6)):
        mino(R, fr, R.u_of('right', y=y), 1.9, col=['#c9a062', '#b8905a'][k])
    R.fbox(fr, 'W', R.u_of('right', y=-2.85), 2.0, .04, .85, .07, .05, CAP, ch=0, tag='hooks')
    lx0, ly0, ly1, lz = 1.35, 1.3, 3.4, 2.3
    R.box('W', ((lx0 + W / 2) / 2, (ly0 + ly1) / 2, lz), (W / 2 - lx0, ly1 - ly0, .08), '#b88850', ch=0, tag='loft')
    for y in (ly0 + .05, (ly0 + ly1) / 2, ly1 - .05):
        R.box('W', (lx0 + .05, y, lz / 2), (.09, .09, lz), '#6b4027', ch=0, tag='loft posts')
    R.box('W', (lx0 + .05, (ly0 + ly1) / 2, lz - .1), (.07, ly1 - ly0, .12), '#6b4027', ch=0, tag='loft')
    for z in (lz + .5, lz + .95):
        R.box('W', (lx0 + .05, (ly0 + ly1) / 2, z), (.05, ly1 - ly0, .05), '#8a5a32', ch=0, tag='loft rail')
    for y in (ly0 + .05, ly1 - .05):
        R.box('W', (lx0 + .05, y, lz + .5), (.06, .06, 1.0), '#6b4027', ch=0, tag='loft rail')
    R.col('loft', (lx0 - .05, ly0 - .08, -.4), (W / 2, ly1 + .1, lz + .1))
    # under the loft: barrels and rope (inside the collider)
    barrel(R, (2.15, 3.0, 0), r=.3, h=.8, col='#a8703c', fill='#6a8aa8', n=8)
    barrel(R, (2.15, 2.35, 0), r=.28, h=.74, col='#a8703c', n=8, lid='#8a5a32')
    # on the loft: crates, a rolled futon, a lantern
    crate(R, (2.1, 3.0, lz + .04), s=.5, col='#b07a44', rot=.1, rng=rng)
    crate(R, (1.8, 3.1, lz + .04), s=.38, col='#a06a3c', rot=-.15, rng=rng)
    R.cyl('P', (2.1, 2.2, lz + .2), .13, .9, '#e8c48a', n=7, rot=(math.pi / 2, 0, 0.0), tag='bedroll')
    R.cyl('K', (2.1, 2.2, lz + .2), .135, .06, RED, n=7, rot=(math.pi / 2, 0, 0.0), tag='bedroll')
    # ladder
    for sx in (-1, 1):
        R.rod('W', (1.78 + sx * .2 + .5 - .5, ly0 - .6, 0), (1.78 + sx * .2, ly0 + .02, lz + .3), .028, '#8a5a32', n=4, tag='ladder')
    for k in range(7):
        t = (k + .6) / 7.6
        R.box('W', (1.78, ly0 - .6 + (.62) * t, (lz + .3) * t), (.4, .035, .04), '#a8703c', ch=0, tag='ladder')
    R.col('ladder', (1.5, ly0 - .7, -.4), (2.1, ly0 + .05, 1.0))

    # ---- hanging lanterns and a hook of lamps
    lantern(R, (BX, BY - .2, 2.75), r=.2, h=.4, cord=H + .6 - 2.75 - .2, col='#e8503a')
    R.node('Light_1', (BX, BY - .2, 2.6))
    lantern(R, (-1.85, 1.6, 2.65), r=.16, h=.32, cord=H + .6 - 2.65 - .16, col='#f6c070')
    R.node('Light_2', (-1.6, 1.6, 2.5))
    lantern(R, (1.4, -2.0, 2.7), r=.15, h=.3, cord=.8, col='#e8503a')
    hurricane_lamp(R, (-W / 2 + .3, -1.15, .66), col='#8a3a28')

    # ---- wall pictures, a life ring over the door, tea things on the low table, plants, a rope coil
    picture(R, fr, R.u_of('right', y=.1), 2.7, .7, .45, frame='#4a2e20', kind='fish', seed=1)
    picture(R, fl, R.u_of('left', y=-1.15), 2.62, .6, .4, frame='#4a2e20', kind='landscape', seed=2)
    picture(R, ff, R.u_of('front', x=-1.0), 2.72, .6, .42, frame='#4a2e20', kind='sepia', seed=3)
    picture(R, fb, R.u_of('back', x=1.9), 2.95, .5, .36, frame='#4a2e20', kind='map', seed=4)
    ring = ff.p(R.u_of('front', x=1.0), 2.62, .07)
    R.torus('P', ring, .26, .055, '#f4efe2', maj=12, mn=4, rot=(math.pi / 2, 0, 0), tag='life ring')
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        R.sphere('K', ring + V((math.cos(a) * .26, 0, math.sin(a) * .26)), (.075, .06, .075), RED, seg=5, rings=3, tag='life ring')
    for k, (dx, dy) in enumerate(((.12, .0), (-.12, .1))):
        R.lathe('K', [(.025, 0), (.04, .06), (0, .0)], (-.9 + dx, -2.85 + dy, .34), ['#e0567a', TEAL][k], n=6, tag='tea')
    mini_plant(R, (W / 2 - .13, -1.15, 1.12), r=.07, h=.11, pot='#c65f3a', leaf='#4f9a3a', flowers='#e8506a', seed=5)
    mini_plant(R, (-W / 2 + .13, -1.15, 1.1), r=.07, h=.11, pot='#23889a', leaf='#6fb84a', flowers='#f4efe2', seed=8)
    rope_coil(R, (-.9, 3.0, 0), r=.28, col='#c9a062', turns=2)
    R.rod('W', (W / 2 - .12, -1.6, 1.45), (W / 2 - .12, -.8, 1.45), .012, '#6b4027', n=3, tag='rope')

    # ---- nodes
    R.node('Spawn', (1.0, -1.5, 0))
    R.node('Exit', (1.0, -D / 2 + .5, 0))
    face_node(R, 'Spot_npc_1', (-1.1, -1.2, 0), (1, -.14))
    face_node(R, 'Spot_npc_2', (-1.5, 1.55, 0), (-1, 0))
    R.shell_cols(surface='wood')

    # ================= variants (decor only, no colliders)
    BZ = .81                                     # bench top
    # --- 1 Rin's fishing nook: rods on the wall, lures, a bucket of fish, dried fish on a string
    with var_group(R, 'Var_1'):
        for k in range(5):
            xx = -1.05 + k * .24
            fishing_rod(R, (xx, -D / 2 + .1, 1.0), (xx + .06, -D / 2 + .1, 2.55), col=['#d9a468', '#c9985c', '#e0b878'][k % 3])
        R.fbox(ff, 'W', R.u_of('front', x=-.45), 1.2, .02, 1.4, .06, .06, CAP, ch=0, tag='rod rack')
        R.fbox(ff, 'W', R.u_of('front', x=-.45), 2.1, .02, 1.4, .06, .06, CAP, ch=0, tag='rod rack')
        bucket(R, (-.9, -D / 2 + .32, BZ), r=.14, h=.28, col='#6a8aa8', n=8, fill='#4a6a88')
        for k, (a, b) in enumerate(((0, .02), (.05, -.04), (-.04, -.05))):
            fish(R, (-.9 + a, -D / 2 + .32 + b, BZ + .3), L=.3, col=['#8aa6b4', '#c8786a', '#9ab08a'][k], rot=1.6 + k * .5, tilt=.3, pitch=-.5)
        R.box('K', (-.3, -D / 2 + .3, BZ + .06), (.34, .2, .1), '#c8322a', ch=0, tag='tackle box')
        R.box('K', (-.3, -D / 2 + .3, BZ + .13), (.36, .22, .04), '#8a2a22', ch=0, tag='tackle box')
        hat_straw(R, (.05, -D / 2 + .3, BZ), r=.2)
        ubd = R.u_of('front', x=-1.9)
        R.fbox(ff, 'W', ubd, 1.7, .03, .55, .5, .03, CAP, ch=0, tag='lure board')
        R.fbox(ff, 'P', ubd, 1.7, .05, .5, .45, .01, '#e8d8a8', tag='lure board')
        for k in range(6):
            R.fbox(ff, 'K', ubd - .18 + (k % 3) * .18, 1.82 - (k // 3) * .2, .07, .06, .1, .02,
                   [RED, MUST, TEAL, '#e0567a', '#8aaa5a', INDIGO][k], tag='lures')
        R.rod('P', (-.5, -2.0, H + .1), (-.5, -2.0, 2.45), .008, '#c9a062', n=3, tag='dried fish')
        for k in range(4):
            fish(R, (-.5 + (.05 if k % 2 else -.05), -2.0, 2.3 - k * .2), L=.26, col='#c9a878', belly='#e8d8b0', rot=0, pitch=math.pi / 2,
                 tilt=0)
    # --- 2 net mending: nets on the rack and the bench, floats, a needle stool
    with var_group(R, 'Var_2'):
        net_sheet(R, (rx + .05, ry0 + .0, 1.72), (rx + .05, ry1, 1.72), 1.2, sag=.14, col='#d8c9a0', step=.17)
        net_sheet(R, (rx - .08, ry0 + .05, 1.0), (rx - .08, ry1 - .05, 1.0), .8, sag=-.12, col='#b8a780', step=.17)
        for k in range(5):
            float_ball(R, (rx + .02, ry0 + .1 + k * .12, 1.78), r=.045, col=[RED, CREAM][k % 2])
        # a heap of net on the floor beside the boat and on the bench
        for k in range(5):
            R.sphere('P', (1.1 + (k % 3) * .22 - .1, .6 + (k // 3) * .25 + k * .05, .06), (.2, .17, .07), shade('#cdbb94', .85 + .06 * k), seg=5, rings=3, tag='net heap')
        for k in range(3):
            R.sphere('P', (-.7 + k * .3, -D / 2 + .3, BZ + .06), (.16, .15, .07), shade('#bba77a', .9 + .08 * k), seg=5, rings=3, tag='net heap')
        for k in range(6):
            float_ball(R, (-1.0 + (k % 3) * .13, -D / 2 + .4 + (k // 3) * .02 + .02 * (k // 3), BZ + .05), r=.05, col=[RED, MUST, CREAM][k % 3])
        R.rod('W', (.25, -D / 2 + .22, BZ + .01), (.5, -D / 2 + .35, BZ + .03), .012, '#c9985c', n=4, tag='needle')
        R.rod('P', (0.55, 1.1, 2.9), (-.8, 1.3, 2.9), .008, '#c9a062', n=3, tag='floats')
        for k in range(6):
            float_ball(R, (-.8 + .25 * k + .01, 1.3 - .033 * k * .0 + .0, 2.8), r=.06, col=[RED, CREAM][k % 2])
        R.sphere('P', (1.9, 0.3, .2), (.14, .17, .2), '#b8a780', seg=5, rings=3, tag='net heap')
    # --- 3 a festival boat being painted: paint pots, bunting, lanterns, painted eyes and a flag
    with var_group(R, 'Var_3'):
        for s in (-1, 1):
            R.cyl('K', (BX + s * .415, BY + 1.0, KZ + .26), .12, .012, CREAM, n=10, rot=(0, math.pi / 2, 0), tag='boat eyes')
            R.cyl('K', (BX + s * .42, BY + 1.02, KZ + .26), .055, .012, '#1d2430', n=8, rot=(0, math.pi / 2, 0), tag='boat eyes')
            R.box('K', (BX + s * .415, BY - .2, KZ + .36), (.012, 1.2, .07), MUST, ch=0, tag='boat paint')
        R.rod('W', (BX, BY - 1.35, KZ + .5), (BX, BY - 1.35, KZ + 1.5), .022, '#c9985c', n=5, tag='boat flag')
        for sgn, col in ((1, RED), (-1, RED)):
            R.B('K').append(bm_poly([(0, 0, 0), (.35 * sgn, 0, -.05), (0, 0, -.28)]), arch_lib.xform((BX, BY - 1.35, KZ + 1.48), (0, 0, 0)), tint=R.t('K', col),
                            flat=True, tag='boat flag')
        R.B('K').append(bm_poly([(0, 0, 0), (-.35, 0, -.05), (0, 0, -.28)][::-1]), arch_lib.xform((BX, BY - 1.35, KZ + 1.48), (0, 0, 0)), tint=R.t('K', RED),
                        flat=True, tag='boat flag')
        cols = [RED, CREAM, MUST, TEAL, '#e0567a']
        for k in range(4):
            px, py, pz = [(-.7, -D / 2 + .3, BZ), (-.3, -D / 2 + .3, BZ), (BX + .8, BY - .8, .0), (BX - .85, BY + .4, .0)][k]
            R.cyl('W', (px, py, pz + .07), .075, .14, '#c9985c', n=6, tag='paint pots')
            R.cyl('K', (px, py, pz + .145), .065, .012, cols[k], n=6, tag='paint pots')
        R.rod('W', (-.5, -D / 2 + .3, BZ + .15), (-.4, -D / 2 + .38, BZ + .27), .01, '#6b4027', n=3, tag='brush')
        R.rod('W', (BX + .85, BY - .8, .16), (BX + 1.0, BY - .7, .32), .01, '#6b4027', n=3, tag='brush')
        for y, z in ((-.6, 3.0), (1.8, 3.0)):
            n = 12
            R.rod('P', (-W / 2 + .1, y, z), (W / 2 - .1, y, z), .007, '#c9a062', n=3, tag='bunting')
            for i in range(n):
                x0 = -W / 2 + .2 + (W - .4) * i / n
                x1 = x0 + (W - .4) / n * .8
                zt = z - .09 * math.sin(math.pi * (i + .5) / n)
                tri = [(x0, y, zt), (x1, y, zt), ((x0 + x1) / 2, y, zt - .22)]
                R.poly('P', tri, cols[i % 5], normal=(0, -1, 0), tag='bunting')
                R.poly('P', tri[::-1], cols[i % 5], normal=(0, 1, 0), tag='bunting')
        for k in range(4):
            lantern(R, (BX - .9 + k * .6, BY + .2 + (k % 2) * .5, 2.5 - (k % 2) * .15), r=.14, h=.28, cord=H + .6 - 2.5,
                    col=[RED, CREAM, RED, CREAM][k])
        for k in range(3):
            lantern(R, (.9 + (k % 2) * .25, -.3 + k * .35, .13), r=.13, h=.26, cord=0, col=[RED, MUST, CREAM][k])
    return R.finish_room()
