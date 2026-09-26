"""The Starline coach: a wooden bogie coach in cream and teal with gold lining (railway family).

Blender frame: faces -Y, rail top z=0, standard gauge. Contract nodes: Wheel1..Wheel4 (axle pivots, front to
back, rotate about X, identity rest), CouplerFront / CouplerRear (buffer face centres at y=-+4.75, z=1.10, the
same height as Kobo's), Garland (festival lantern strings on both sides, 'Lantern glow'; hidden by the runtime
until the finale), Seat1..Seat4 (cushion-top centres where passengers sit, facing -Y; Seat1/Seat2 are the
side-by-side front pair). 'Window glow' on the sash panes, door glass, clerestory lights and ceiling lamps.
"""
import math
from mathutils import Vector
from railway_common import *

AXLE_Z = .45
BOGIES = (-2.9, 2.9)
AXLES = (-3.7, -2.1, 2.1, 3.7)
BODY_Y = 3.55          # body ends
END_Y = 4.25           # headstock / balcony end
BUF_Z = 1.10
BUF_X = .87
FLOOR = 1.3
WAIST = 2.05
WIN0, WIN1 = 2.25, 2.85
EAVE = 3.05
WINDOWS = (-2.75, -1.65, -.55, .55, 1.65, 2.75)
WIN_W = .76


def coach_wheel(M, y, kids):
    for s in (-1, 1):
        c = (0, y, AXLE_Z)
        tyre = [(.39, .78), (.45, .775), (.495, .645), (.39, .625)]
        kids.append(revolve('Tyre', tyre, M['black'], seg=12, axis='X', center=c, side=s, smooth=50))
        disc = [(.395, .75), (.22, .735), (.1, .775), (0, .79)]
        kids.append(revolve('Wheel disc', disc, M['black'], seg=10, axis='X', center=c, side=s, closed=False,
                            outward=-1, smooth=60))
        kids.append(cyl('Hub cap', .07, .05, (s * .8, y, AXLE_Z), M['brass'], verts=6, rot=(0, D90, 0)))
    kids.append(cyl('Axle', .06, 1.3, (0, y, AXLE_Z), M['black'], verts=6, rot=(0, D90, 0), cap=False))


def buffers(P, M, yb, sy):
    """Buffers and hook on a headstock whose outer face is at y=yb (buffer faces end at yb + 0.44)."""
    for s in (-1, 1):
        x = s * BUF_X
        P.append(box('Buffer plate', (.34, .04, .34), (x, yb + sy * .02, BUF_Z), M['black'], bevel=0))
        P.append(cyl('Buffer stock', .13, .24, (x, yb + sy * .16, BUF_Z), M['black'], verts=8, r2=.1,
                     rot=(-sy * D90, 0, 0)))
        P.append(cyl('Buffer ram', .07, .12, (x, yb + sy * .31, BUF_Z), M['black'], verts=8, rot=(D90, 0, 0)))
        head = [(0, .0), (.2, .0), (.205, .03), (.12, .06), (0, .064)]
        P.append(revolve('Buffer head', head, M['black'], seg=12, axis='Y', center=(x, yb + sy * .376, BUF_Z),
                         side=sy, smooth=50))
    hook = [(0, yb + sy * .05, BUF_Z + .05), (0, yb + sy * .28, BUF_Z + .05), (0, yb + sy * .37, BUF_Z),
            (0, yb + sy * .38, BUF_Z - .07), (0, yb + sy * .32, BUF_Z - .1)]
    P.append(tube('Coupling hook', hook, .032, M['black'], verts=5, squash=1.6))


def lantern(acc_body, acc_cap, top, r=.085, h=.2):
    """Chochin paper lantern hanging from `top` (ribbed ellipsoid body + black caps)."""
    x, y, z = top
    zc = z - .03 - h / 2
    prof = [(r * .55, zc + h / 2), (r * .9, zc + h * .32), (r, zc), (r * .9, zc - h * .32), (r * .55, zc - h / 2)]
    seg = 7
    bm = acc_body.bm
    rings = [[bm.verts.new((x + rr * math.cos(TAU * i / seg), y + rr * math.sin(TAU * i / seg), zz))
              for i in range(seg)] for rr, zz in prof]
    for A, B in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            f = bm.faces.new((A[i], B[i], B[j], A[j]))
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - Vector((x, y, zc))) < 0:
                f.normal_flip()
    acc_cap.add_cone((x, y, zc + h / 2 - .01), (0, 0, 1), r * .6, r * .5, .04, seg=5, cap1=True)
    acc_cap.add_cone((x, y, zc - h / 2 + .01), (0, 0, -1), r * .6, r * .5, .035, seg=5, cap1=True)


def build(out_name='coach'):
    reset()
    M = palette_railway()
    M['teal'] = mat('Coach teal', '#177e87', rough=.36, metal=.05)
    M['cream'] = mat('Coach cream', '#f4e4c1', rough=.42)
    M['roof'] = mat('Coach roof', '#6e4034', rough=.58)
    M['wood'] = mat('Coach teak', '#a4632f', rough=.5)
    M['glow'] = glow('Window glow', '#3a5560', '#ffb347', strength=0.0, rough=.08)
    M['lantern'] = glow('Lantern glow', '#fff0c8', '#ffc45a', strength=0.0, rough=.6)
    black, brass, teal, cream, wood = M['black'], M['brass'], M['teal'], M['cream'], M['wood']
    P = []

    # ---------------------------------------------------------------- underframe
    for s in (-1, 1):
        P.append(box('Solebar', (.1, 2 * END_Y - .1, .26), (s * 1.18, 0, FLOOR - .2), black, bevel=.02, segments=1))
        pts = [(s * .9, -3.2, FLOOR - .3), (s * .9, -1.2, .82), (s * .9, 1.2, .82), (s * .9, 3.2, FLOOR - .3)]
        P.append(tube('Truss rod', pts, .025, black, verts=5))          # queen-post truss
        for y in (-1.2, 1.2):
            P.append(box('Queen post', (.06, .06, .36), (s * .9, y, .99), black, bevel=0))
    P.append(box('Floor', (2.5, 2 * END_Y, .1), (0, 0, FLOOR - .05), black, bevel=0))
    P.append(box('Battery box', (1.1, .8, .34), (0, 0, FLOOR - .32), black, bevel=.03, segments=1))
    for sy in (-1, 1):
        yb = sy * END_Y
        P.append(box('Headstock', (2.6, .12, .44), (0, yb, FLOOR - .2), black, bevel=.02, segments=1))
        buffers(P, M, yb + sy * .06, sy)

    # ---------------------------------------------------------------- bogies (static frames around spinning axles)
    for yc in BOGIES:
        for s in (-1, 1):
            frame = [(-1.18, .6), (-1.12, .78), (1.12, .78), (1.18, .6), (1.0, .56), (.4, .46), (-.4, .46), (-1.0, .56)]
            P.append(prism('Bogie frame', [(yc + u, v) for u, v in frame], s * .86, s * .92, black, axis='X',
                           bevel=.012))
            for dy in (-.8, .8):
                y = yc + dy
                P.append(box('Axlebox', (.12, .26, .26), (s * .98, y, AXLE_Z + .02), black, bevel=0))
                P.append(box('Axlebox lid', (.02, .18, .18), (s * 1.045, y, AXLE_Z + .02), brass, bevel=0))
                pts = [(s * .98, y + u * .42, AXLE_Z + .27 + .05 * (u * u)) for u in (-1, -.5, 0, .5, 1)]
                P.append(sweep('Spring leaf', pts, [(-.05, -.03), (.05, -.03), (.05, .03), (-.05, .03)], black,
                               up=(0, 0, 1), smooth=40))       # leaf spring pack
        P.append(box('Bolster', (1.9, .36, .2), (0, yc, .82), black, bevel=.02, segments=1))
        P.append(cyl('Pivot', .22, .16, (0, yc, .98), black, verts=10))

    # ---------------------------------------------------------------- body sides
    edges = [-BODY_Y] + [c + sgn * WIN_W / 2 for c in WINDOWS for sgn in (-1, 1)] + [BODY_Y]
    piers = list(zip(edges[0::2], edges[1::2]))
    for s in (-1, 1):
        xo = s * 1.27
        P.append(box('Lower panel', (.06, 2 * BODY_Y, WAIST - FLOOR), (xo, 0, (FLOOR + WAIST) / 2), teal, bevel=.015,
                     segments=1))
        P.append(box('Sill band', (.06, 2 * BODY_Y, WIN0 - WAIST), (xo, 0, (WAIST + WIN0) / 2), cream, bevel=.01,
                     segments=1))
        P.append(box('Top band', (.06, 2 * BODY_Y, EAVE - WIN1), (xo, 0, (WIN1 + EAVE) / 2), cream, bevel=.01,
                     segments=1))
        for a, b in piers:
            P.append(box('Pier', (.06, b - a, WIN1 - WIN0 + .02), (xo, (a + b) / 2, (WIN0 + WIN1) / 2), cream, bevel=0))
        xl = s * 1.303
        P.append(box('Waist rail', (.03, 2 * BODY_Y - .06, .05), (s * 1.3, 0, WAIST), brass, bevel=.008, segments=1))
        P.append(box('Cornice', (.07, 2 * BODY_Y, .06), (s * 1.3, 0, EAVE - .03), wood, bevel=.015, segments=1))
        for z in (FLOOR + .1, WAIST - .1):
            P.append(box('Lining', (.012, 2 * BODY_Y - .2, .025), (xl, 0, z), brass, bevel=0))
        for y in [(-BODY_Y + .1)] + [(a + b) / 2 for a, b in piers[1:-1]] + [BODY_Y - .1]:
            P.append(box('Lining', (.012, .025, WAIST - FLOOR - .2), (xl, y, (FLOOR + WAIST) / 2), brass, bevel=0))
        # windows: varnished teak frames, glazed upper sash (Window glow), lower sash dropped open
        for c in WINDOWS:
            for sgn in (-1, 1):
                P.append(box('Window frame', (.05, .045, WIN1 - WIN0), (s * 1.28, c + sgn * (WIN_W / 2 - .02),
                                                                          (WIN0 + WIN1) / 2), wood, bevel=0))
            P.append(box('Window sill', (.09, WIN_W, .04), (s * 1.29, c, WIN0 + .01), wood, bevel=0))
            P.append(box('Window head', (.05, WIN_W, .045), (s * 1.28, c, WIN1 - .02), wood, bevel=0))
            P.append(box('Sash rail', (.05, WIN_W - .06, .04), (s * 1.265, c, 2.55), wood, bevel=0))
            P.append(box('Sash glass', (.012, WIN_W - .06, .27), (s * 1.262, c, 2.69), M['glow'], bevel=0))
        U, V, N = Vector((0, s, 0)), Vector((0, 0, 1)), Vector((s, 0, 0))
        P.append(plane_map(prism('Coach star', star_outline(.18, .075), 0, .025, brass, axis='Z'), (s * 1.3, 0, 1.68),
                           U, V, N))
        for y in (-BODY_Y + .12, BODY_Y - .12):
            P.append(rod('Grab handle', (s * 1.33, y, 1.5), (s * 1.33, y, 2.0), .014, brass, verts=5))

    # ---------------------------------------------------------------- body ends with doors, open balconies
    for sy in (-1, 1):
        ye = sy * BODY_Y
        P.append(box('End lower', (2.6, .06, WAIST - FLOOR), (0, ye, (FLOOR + WAIST) / 2), teal, bevel=.015, segments=1))
        P.append(box('End upper', (2.6, .06, EAVE - WAIST), (0, ye, (WAIST + EAVE) / 2), cream, bevel=.015, segments=1))
        P.append(box('End door', (.72, .05, 1.62), (0, ye + sy * .03, FLOOR + .83), wood, bevel=.02, segments=1))
        P.append(box('Door glass', (.46, .012, .5), (0, ye + sy * .058, 2.5), M['glow'], bevel=0))
        P.append(cyl('Door knob', .03, .05, (.26, ye + sy * .07, 1.95), brass, verts=6, rot=(D90, 0, 0)))
        for x in (-.85, .85):
            P.append(box('End glass', (.36, .012, .44), (x, ye + sy * .033, 2.52), M['glow'], bevel=0))
            P.append(box('End frame', (.42, .03, .5), (x, ye + sy * .022, 2.52), wood, bevel=0))
        P.append(box('End lining', (2.4, .012, .025), (0, ye + sy * .033, WAIST), brass, bevel=0))
        P.append(box('Balcony floor', (2.56, END_Y - BODY_Y + .02, .08), (0, sy * (BODY_Y + END_Y) / 2, FLOOR - .04),
                     wood, bevel=.015, segments=1))
        yr = sy * (END_Y - .06)
        for s in (-1, 1):
            P.append(rod('Corner post', (s * 1.22, yr, FLOOR), (s * 1.22, yr, EAVE + .04), .03, brass, verts=6))
            P.append(rod('Rail top', (s * 1.22, yr, FLOOR + .95), (s * .38, yr, FLOOR + .95), .028, brass, verts=6))
            P.append(rod('Rail bottom', (s * 1.22, yr, FLOOR + .12), (s * .38, yr, FLOOR + .12), .02, black, verts=5))
            P.append(rod('Gate post', (s * .38, yr, FLOOR), (s * .38, yr, FLOOR + 1.0), .025, brass, verts=6))
            for k in range(1, 5):
                x = s * (.38 + (1.22 - .38) * k / 5)
                P.append(rod('Baluster', (x, yr, FLOOR + .12), (x, yr, FLOOR + .95), .012, black, verts=4))
            P.append(tube('Rail scroll', [(s * (.8 + .12 * math.cos(a)), yr, FLOOR + .53 + .18 * math.sin(a))
                                          for a in [TAU * i / 6 for i in range(6)]], .012, black, verts=3,
                           closed=True))
            ys = sy * (END_Y - .2)
            for z in (.95, .6):
                P.append(box('Step tread', (.3, .28, .04), (s * 1.16, ys, z), wood, bevel=0))
            for dy in (-.12, .12):
                P.append(box('Step hanger', (.03, .03, .72), (s * 1.28, ys + dy, .93), black, bevel=0))
            P.append(rod('Grab pole', (s * 1.3, sy * (BODY_Y + .1), FLOOR + .1), (s * 1.3, sy * (BODY_Y + .1), 2.4),
                         .02, brass, verts=5))
        P.append(tube('Gate chain', [(-.38, yr, FLOOR + .9), (-.2, yr, FLOOR + .78), (0, yr, FLOOR + .74),
                                     (.2, yr, FLOOR + .78), (.38, yr, FLOOR + .9)], .012, black, verts=4))

    # ---------------------------------------------------------------- roof: main arc over balconies + clerestory
    W = 1.32
    arc = [(W * (i / 6 - 1), EAVE + .02 + .26 * (1 - (i / 6 - 1) ** 2)) for i in range(13)]
    P.append(prism('Main roof', arc + [(x, z - .07) for x, z in reversed(arc)], -END_Y - .05, END_Y + .05, M['roof'],
                   axis='Y', bevel=.02, segments=1, smooth=40))
    CW, CZ0, CZ1 = .62, EAVE + .2, EAVE + .4
    P.append(prism('Clerestory', [(-CW, CZ0), (CW, CZ0), (CW, CZ1), (0, CZ1 + .06), (-CW, CZ1)], -BODY_Y + .05, BODY_Y - .05, cream,
                   axis='Y', bevel=.015, segments=1))
    carc = [(.74 * (i / 4 - 1), CZ1 + .12 * (1 - (i / 4 - 1) ** 2)) for i in range(9)]
    P.append(prism('Clerestory roof', carc + [(x, z - .05) for x, z in reversed(carc)], -BODY_Y - .08, BODY_Y + .08,
                   M['roof'], axis='Y', bevel=.015, segments=1, smooth=40))
    for s in (-1, 1):
        P.append(box('Clerestory lights', (.012, 2 * BODY_Y - .5, .12), (s * (CW + .004), 0, (CZ0 + CZ1) / 2),
                     M['glow'], bevel=0))
        for k in range(7):
            y = -BODY_Y + .25 + (2 * BODY_Y - .5) * k / 6
            P.append(box('Clerestory mullion', (.02, .04, .14), (s * (CW + .01), y, (CZ0 + CZ1) / 2), wood, bevel=0))
        P.append(rod('Rain strip', (s * 1.28, -END_Y, EAVE + .06), (s * 1.28, END_Y, EAVE + .06), .016, M['roof'],
                     verts=5))
    # canvas roof seams: thin raised battens across the main roof every ~1.1 m (darker via COLOR_0)
    seams = []
    for k in range(-3, 4):
        y = k * 1.12 + .56 * (1 if k < 0 else -1) * 0
        if abs(y) > BODY_Y + .3:
            continue
        bm = bmesh.new()
        pts = [(x, z + .006) for x, z in arc]
        A = [bm.verts.new((x, y - .035, z)) for x, z in pts]
        B = [bm.verts.new((x, y + .035, z + .018)) for x, z in pts]
        C = [bm.verts.new((x, y + .07, z)) for x, z in pts]
        for i in range(len(pts) - 1):
            for R0, R1 in ((A, B), (B, C)):
                f = bm.faces.new((R0[i], R0[i + 1], R1[i + 1], R1[i]))
                f.normal_update()
                if f.normal.z < 0:
                    f.normal_flip()
        ob = from_bmesh('Roof seam', bm, M['roof'], smooth_angle=60)
        seams.append(ob)
    P += seams
    for y in (-2.2, 0, 2.2):          # oil-lamp pots on the roof
        for s in (-1, 1):
            P.append(lathe('Roof lamp', [(.1, 0), (.1, .07), (.04, .15), (0, .17)], M['roof'], seg=6,
                           loc=(s * .98, y, EAVE + .12)))

    # ---------------------------------------------------------------- interior: floor, benches, lamps
    P.append(box('Saloon floor', (2.4, 2 * BODY_Y - .1, .03), (0, 0, FLOOR + .015), wood, bevel=0))
    for y in (-1.65, .55, 2.75):
        for s in (-1, 1):
            x = s * .66
            P.append(box('Bench seat', (.9, .5, .12), (x, y - .02, FLOOR + .4), teal, bevel=.03, segments=1))
            P.append(box('Bench back', (.9, .1, .6), (x, y + .27, FLOOR + .78), teal, bevel=0))
            P.append(box('Bench frame', (.94, .06, .4), (x, y + .27, FLOOR + .2), wood, bevel=0))
            P.append(box('Bench rail', (.94, .06, .05), (x, y + .27, FLOOR + 1.1), wood, bevel=0))
    for y in (-1.6, 1.6):
        P.append(sphere('Ceiling lamp', .09, (0, y, EAVE + .1), M['glow'], seg=8, rings=4))

    init_color(P)
    paint(P, lambda p, n, fi, ob: (1 - .16 * max(0, min(1, (1.3 - p.z) / 1.3)),) * 3)   # grime low down
    paint(seams, lambda p, n, fi, ob: (.72, .7, .7))

    # ---------------------------------------------------------------- nodes
    pivots = []
    for i, y in enumerate(AXLES):
        kids = []
        coach_wheel(M, y, kids)
        pivots.append((empty(f'Wheel{i + 1}', (0, y, AXLE_Z)), kids))
    # festival garland: strings swooping between hooks at the eaves, chochin lanterns at the low points,
    # alternating red and cream (red comes from the COLOR_0 tint so one 'Lantern glow' material serves both)
    g = empty('Garland', (0, 0, EAVE))
    body_acc = Acc('Garland lanterns', M['lantern'], smooth=60)
    cap_acc = Acc('Garland caps', black, smooth=40)
    gkids = []
    hooks = [-END_Y + .1] + list(WINDOWS) + [END_Y - .1]
    reds = []
    for s in (-1, 1):
        x = s * 1.39
        pts = []
        for a, b in zip(hooks, hooks[1:]):
            for k in range(4):
                t = k / 4
                pts.append((x, a + (b - a) * t, EAVE + .03 - .16 * math.sin(math.pi * t)))
        pts.append((x, hooks[-1], EAVE + .03))
        gkids.append(tube('Garland string', pts, .009, black, verts=3))
        for i, (a, b) in enumerate(zip(hooks, hooks[1:])):
            lantern(body_acc, cap_acc, (x, (a + b) / 2, EAVE + .03 - .16), r=.09, h=.24)
            if i % 2 == 0:
                reds.append((x, (a + b) / 2))
    lant = body_acc.obj()
    caps = cap_acc.obj()
    init_color([lant, caps] + gkids)
    paint([lant], lambda p, n, fi, ob: (1.0, .16, .1) if any(abs(p.x - x) < .2 and abs(p.y - y) < .2 for x, y in reds)
          else (1, 1, 1))
    gkids += [lant, caps]
    pivots.append((g, gkids))
    for i, (x, y) in enumerate(((-.66, -1.65), (.66, -1.65), (-.66, .55), (.66, .55))):
        pivots.append((empty(f'Seat{i + 1}', (x, y - .04, FLOOR + .46)), []))
    pivots.append((empty('CouplerFront', (0, -END_Y - .06 - .44, BUF_Z)), []))
    pivots.append((empty('CouplerRear', (0, END_Y + .06 + .44, BUF_Z)), []))
    return finish(out_name, P, pivots, ao=(.5, .55), ground=0.0, tinted=True)
