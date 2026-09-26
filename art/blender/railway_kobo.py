"""Kobo: Genzo's tomato-red 0-6-0 side-tank engine (railway family).

Blender frame: faces -Y (smokebox at -Y), +X is the engine's left (driver's side), rail top z=0,
standard gauge (wheel treads centred on x = +-0.7175).
Contract nodes: Wheel1..3 (axle pivots front to back, rotate about X, identity rest), Rod (both coupling
rods; origin at the middle crank pin; at rest every crank pin sits 0.22 m directly BELOW its axle, so
Rod rests at (0, 0, 0.43) and should be moved to axle + R_x(angle) * (0, 0, -0.22)), Smoke (chimney top),
CouplerRear (rear buffer face centre), Cab (driver's standing spot on the cab floor). 'Headlamp glass'.
"""
import math
from mathutils import Vector
from railway_common import *

R_WHEEL = .65
AXLE_Z = .65
AXLES = (-1.55, 0.0, 1.55)
CRANK = .22
FP = 1.46            # footplate top
BZ = 2.22            # boiler axis height
BR = .72             # boiler radius
SBR = .78            # smokebox radius
BUF_Z = 1.10
BUF_X = .87


# ------------------------------------------------------------------ wheels and rods

def wheel_side(M, y, side, parts, spokes=9):
    """One driving wheel (both sides share the axle pivot). parts: dict material-key -> list."""
    c = (0, y, AXLE_Z)
    s = side
    tyre = [(.585, .785), (.648, .785), (.66, .665), (.70, .648), (.705, .628), (.585, .625)]
    parts['steel'].append(revolve('Tyre', tyre, M['steel'], seg=24, axis='X', center=c, side=s, smooth=50))
    rim = [(.6, .77), (.535, .762), (.535, .69)]
    parts['red'].append(revolve('Rim', rim, M['red'], seg=16, axis='X', center=c, side=s, closed=False,
                                outward=-1, smooth=50))
    hub = [(0, .69), (.17, .69), (.17, .775), (.13, .805), (0, .805)]
    parts['red'].append(revolve('Hub', hub, M['red'], seg=10, axis='X', center=c, side=s, smooth=50))
    cap = [(.085, .80), (.075, .84), (0, .855)]
    parts['brass'].append(revolve('Axle cap', cap, M['brass'], seg=8, axis='X', center=c, side=s, closed=False,
                                  outward=-1, smooth=60))
    acc = Acc('Spokes', M['red'], smooth=60)
    xs = s * .735
    for k in range(spokes):
        t = TAU * k / spokes + math.pi / spokes
        d = Vector((0, math.cos(t), math.sin(t)))
        base = Vector((xs, y, AXLE_Z)) + d * .14
        acc.add_cone(base, d, .038, .027, .41, seg=5, cap1=False)
    parts['red'].append(acc.obj())
    # counterweight opposite the crank pin (pin is at the bottom at rest, so the weight sits on top)
    out = [(math.cos(a) * .525, math.sin(a) * .525) for a in
           [math.radians(90 + 58 - 116 * i / 8) for i in range(9)]]
    inn = [(math.cos(a) * .2, math.sin(a) * .2) for a in
           [math.radians(90 - 50 + 100 * i / 4) for i in range(5)]]
    outline = [(y + u, AXLE_Z + v) for u, v in out + inn]
    parts['red'].append(prism('Counterweight', outline, s * .705, s * .79, M['red'], axis='X', smooth=30))
    # crank boss and pin, 0.22 m below the axle
    pz = AXLE_Z - CRANK
    parts['red'].append(cyl('Crank boss', .12, .12, (s * .76, y, pz), M['red'], verts=10, rot=(0, D90, 0)))
    parts['steel'].append(cyl('Crank pin', .046, .19, (s * .905, y, pz), M['steel'], verts=8, rot=(0, D90, 0)))
    parts['steel'].append(cyl('Crank nut', .068, .045, (s * .975, y, pz), M['steel'], verts=6, rot=(0, D90, 0)))


def build_wheels(M):
    pivots = []
    for i, y in enumerate(AXLES):
        piv = empty(f'Wheel{i + 1}', (0, y, AXLE_Z))
        parts = {'steel': [], 'red': [], 'brass': []}
        for s in (-1, 1):
            wheel_side(M, y, s, parts)
        parts['steel'].append(cyl('Axle', .075, 1.3, (0, y, AXLE_Z), M['steel'], verts=8, rot=(0, D90, 0), cap=False))
        pivots.append((piv, [o for v in parts.values() for o in v]))
    return pivots


def build_rod(M):
    pz = AXLE_Z - CRANK
    piv = empty('Rod', (0, 0, pz))
    kids = []
    for s in (-1, 1):
        x0, x1 = s * .87, s * .935
        for ya, yb in zip(AXLES, AXLES[1:]):
            n = 6    # fish-bellied bar between bosses
            top = [(ya + (yb - ya) * i / n, pz + .05 + .018 * math.sin(math.pi * i / n)) for i in range(n + 1)]
            bot = [(y, 2 * pz - z) for y, z in reversed(top)]
            kids.append(prism('Coupling rod', top + bot, min(x0, x1), max(x0, x1), M['steel'], axis='X', smooth=30))
        for y in AXLES:
            kids.append(cyl('Rod boss', .1, abs(x1 - x0) + .012, ((x0 + x1) / 2, y, pz), M['steel'], verts=12,
                            rot=(0, D90, 0)))
            kids.append(cyl('Oil cup', .028, .07, ((x0 + x1) / 2, y, pz + .13), M['brass'], verts=8, r2=.02))
        kids.append(cyl('Knuckle', .035, .09, ((x0 + x1) / 2, .32, pz), M['brass'], verts=8, rot=(0, D90, 0)))
    return piv, kids


# ------------------------------------------------------------------ nameplate lettering

def letters(text, center, U, V, N, h, material, depth=.02):
    """Chunky raised capitals built from strokes (K, O, B)."""
    c, U, V, N = Vector(center), Vector(U), Vector(V), Vector(N)
    acc = Acc('Nameplate letters', material, smooth=40)
    w, st = h * .72, h * .2
    pitch = w + h * .28
    x = -(pitch * len(text) - h * .28) / 2

    def P(u, v, n=0.0):
        return c + U * u + V * v + N * n

    def bar(u0, v0, u1, v1):
        a, b = Vector((u0, v0)), Vector((u1, v1))
        mid, d = (a + b) / 2, (b - a)
        du = d.normalized()
        acc.add_box(P(mid.x, mid.y, depth / 2), U * du.x + V * du.y, U * -du.y + V * du.x, N, d.length + st * .3, st,
                    depth)

    def ring(uc, vc, a, b, a0=0.0, a1=TAU, n=12):
        full = abs(a1 - a0 - TAU) < 1e-6
        m = n if full else n + 1
        outer, inner = [], []
        for i in range(m):
            t = a0 + (a1 - a0) * i / n
            outer.append((uc + math.cos(t) * a, vc + math.sin(t) * b))
            inner.append((uc + math.cos(t) * (a - st), vc + math.sin(t) * (b - st)))
        bm = acc.bm
        of = [bm.verts.new(P(u, v, depth)) for u, v in outer]
        inf = [bm.verts.new(P(u, v, depth)) for u, v in inner]
        ob = [bm.verts.new(P(u, v, 0)) for u, v in outer]
        ib = [bm.verts.new(P(u, v, 0)) for u, v in inner]
        for i in (range(m) if full else range(m - 1)):
            j = (i + 1) % m
            for f in ((inf[i], of[i], of[j], inf[j]), (of[i], ob[i], ob[j], of[j]), (ib[i], inf[i], inf[j], ib[j])):
                bm.faces.new(f)
        if not full:
            for k in (0, m - 1):
                bm.faces.new((ib[k], ob[k], of[k], inf[k]))

    for ch in text:
        u0 = x
        if ch == 'K':
            bar(u0 + st / 2, -h / 2 + st * .15, u0 + st / 2, h / 2 - st * .15)
            bar(u0 + st * .8, -h * .02, u0 + w - st * .4, h / 2 - st * .45)
            bar(u0 + st * 1.4, h * .05, u0 + w - st * .4, -h / 2 + st * .45)
        elif ch == 'O':
            ring(u0 + w / 2, 0, w / 2, h / 2)
        elif ch == 'B':
            bar(u0 + st / 2, -h / 2 + st * .15, u0 + st / 2, h / 2 - st * .15)
            ring(u0 + w * .38, h / 4, w * .55, h / 4 + st / 2 - .002, -D90, D90, n=8)
            ring(u0 + w * .38, -h / 4, w * .62, h / 4 + st / 2 - .002, -D90, D90, n=8)
            bar(u0 + st * .5, h / 2 - st / 2, u0 + w * .38, h / 2 - st / 2)
            bar(u0 + st * .5, -h / 2 + st / 2, u0 + w * .38, -h / 2 + st / 2)
            bar(u0 + st * .5, 0, u0 + w * .38, 0)
        x += pitch
    return fix_normals(acc.obj())


def lining(name, outline, origin, U, V, N, material, w=.028, h=.012):
    """Raised lining strip following a closed 2D outline drawn on a panel (U right, V up, N out)."""
    o, U, V, N = Vector(origin), Vector(U), Vector(V), Vector(N)
    pts = [o + U * u + V * v for u, v in outline]
    return sweep(name, pts, [(w / 2, -.002), (w / 2, h), (-w / 2, h), (-w / 2, -.002)], material, closed_path=True,
                 up=N, smooth=40, closed_section=False)


# ------------------------------------------------------------------ the engine

def build(out_name='kobo'):
    reset()
    M = palette_railway()
    M['glass'] = mat('Cab glass', '#2b4a5c', rough=.06, metal=.3)
    M['lamp'] = glow('Headlamp glass', '#fff2cf', '#ffe6a8', strength=.35, rough=.08)
    M['coal'] = mat('Coal', '#1f232b', rough=.38, metal=.12)
    M['oak'] = mat('Cab oak', '#9a6238', rough=.68)
    red, black, brass, steel = M['red'], M['black'], M['brass'], M['steel']
    P = []   # static parts

    # ---------------------------------------------------------------- frames & running gear (static)
    for s in (-1, 1):
        frame = [(-3.1, .86), (-2.72, .56), (-2.2, .46), (2.2, .46), (2.72, .56), (3.1, .86), (3.1, FP - .08),
                 (-3.1, FP - .08)]
        P.append(prism('Frame', frame, s * .5, s * .57, black, axis='X', bevel=.015))
        for y in AXLES:
            P.append(box('Axlebox', (.1, .34, .4), (s * .6, y, AXLE_Z + .02), black, bevel=0))
            P.append(cyl('Axlebox cap', .06, .03, (s * .655, y, AXLE_Z + .12), brass, verts=6, rot=(0, D90, 0)))
            P.append(obox('Brake block', (s * .715, y + .70, AXLE_Z - .02), (1, 0, 0), (0, .25, 1), (0, 1, -.25),
                          .14, .34, .08, black))
            P.append(rod('Brake hanger', (s * .66, y + .72, AXLE_Z + .12), (s * .57, y + .76, FP - .12), .025, black,
                         verts=4))
    P.append(box('Frame stretcher', (1.0, .12, .5), (0, -2.9, 1.1), black, bevel=0))
    P.append(box('Frame stretcher', (1.0, .12, .5), (0, 2.9, 1.1), black, bevel=0))
    P.append(box('Ashpan', (1.0, 1.4, .34), (0, .78, 1.12), black, bevel=0))

    # ---------------------------------------------------------------- footplate, valance, buffer beams
    P.append(box('Footplate', (2.6, 6.24, .08), (0, 0, FP - .04), black, bevel=.025, segments=2))
    for s in (-1, 1):
        P.append(box('Valance', (.05, 6.2, .24), (s * 1.285, 0, FP - .15), red, bevel=.018, segments=1))
        P.append(box('Valance lining', (.012, 6.1, .026), (s * 1.312, 0, FP - .15), brass, bevel=0))
    for sy in (-1, 1):
        yb = sy * 3.16
        P.append(box('Buffer beam', (2.6, .13, .62), (0, yb, FP - .3), red, bevel=.03, segments=1))
        P.append(box('Beam lining', (2.44, .012, .03), (0, yb + sy * .066, FP - .07), brass, bevel=0))
        P.append(box('Beam lining', (2.44, .012, .03), (0, yb + sy * .066, FP - .54), brass, bevel=0))
        for s in (-1, 1):
            x = s * BUF_X
            P.append(box('Buffer plate', (.38, .04, .38), (x, yb + sy * .085, BUF_Z), black, bevel=0))
            P.append(rivets('Plate bolts', [(x + u, yb + sy * .105, BUF_Z + v) for u in (-.14, .14) for v in (-.14, .14)],
                            (0, sy, 0), steel, r=.022, h=.018))
            P.append(cyl('Buffer stock', .145, .26, (x, yb + sy * .2, BUF_Z), black, verts=12, r2=.11,
                         rot=(-sy * D90, 0, 0)))
            P.append(cyl('Buffer ram', .075, .12, (x, yb + sy * .33, BUF_Z), steel, verts=8, rot=(D90, 0, 0)))
            head = [(0, .0), (.225, .0), (.23, .03), (.21, .052), (.13, .066), (0, .07)]
            P.append(revolve('Buffer head', head, steel, seg=12, axis='Y', center=(x, yb + sy * .365, BUF_Z), side=sy,
                             smooth=50))
        # coupling hook (J-shaped) + screw coupling links
        hook = [(0, yb + sy * .05, BUF_Z + .06), (0, yb + sy * .3, BUF_Z + .06), (0, yb + sy * .4, BUF_Z + .02),
                (0, yb + sy * .42, BUF_Z - .06), (0, yb + sy * .37, BUF_Z - .1), (0, yb + sy * .33, BUF_Z - .06)]
        P.append(tube('Coupling hook', hook, .035, steel, verts=6, squash=1.6))
        P.append(torus('Coupling link', .075, .018, (0, yb + sy * .36, BUF_Z - .17), steel, maj=10, mn=4,
                       rot=(0, D90, 0)))
        for s in (-1, 1):
            P.append(obox('Lamp iron', (s * .55, yb + sy * .08, FP + .08), (1, 0, 0), (0, 0, 1), (0, 1, 0),
                          .05, .18, .04, black))

    # ---------------------------------------------------------------- smokebox, boiler, fittings
    sb = [(SBR, -1.85), (SBR, -2.84), (SBR - .025, -2.9), (.67, -2.915)]
    P.append(revolve('Smokebox', sb, black, seg=32, axis='Y', center=(0, 0, BZ), closed=False, outward=1))
    door = [(.66, -2.915), (.64, -2.95), (.52, -2.995), (.3, -3.025), (0, -3.035)]
    P.append(revolve('Smokebox door', door, black, seg=28, axis='Y', center=(0, 0, BZ), closed=False, outward=1,
                     smooth=70))
    P.append(torus('Door rim', .655, .03, (0, -2.925, BZ), black, maj=28, mn=4, rot=(D90, 0, 0)))
    for dz in (.3, -.3):          # hinge straps (hinged on the engine's right = -X)
        z = BZ + dz
        pts = []
        for i in range(9):
            xx = .52 - 1.2 * i / 8
            rr = math.hypot(xx, dz)
            pts.append((xx, -2.915 - .12 * max(0, 1 - (rr / .66) ** 2) - .012, z))
        P.append(sweep('Hinge strap', pts, [(-.028, -.04), (.014, -.04), (.014, .04), (-.028, .04)], black,
                       up=(0, 0, 1), smooth=40))
        P.append(cyl('Hinge knuckle', .045, .14, (-.72, -2.9, z), steel, verts=8))
        P.append(rivets('Strap bolts', [(xx, -2.915 - .12 * max(0, 1 - (math.hypot(xx, dz) / .66) ** 2) - .04, z)
                                        for xx in (.4, 0.0, -.4)], (0, -1, 0), steel, r=.024, h=.02))
    P.append(prism('Door star', [(x, BZ + z) for x, z in star_outline(.2, .085)], -3.035, -3.075, brass, axis='Y',
                   bevel=.012, segments=1, smooth=30))
    P.append(cyl('Star boss', .05, .06, (0, -3.08, BZ), brass, verts=10, rot=(D90, 0, 0)))
    P.append(tube('Door handrail', [(math.cos(a) * .72, -2.99, BZ + math.sin(a) * .72) for a in
                                    [math.radians(35 + 110 * i / 12) for i in range(13)]], .018, steel, verts=6))
    for a in (35, 145):
        a = math.radians(a)
        P.append(rod('Handrail stanchion', (math.cos(a) * .72, -2.9, BZ + math.sin(a) * .72),
                     (math.cos(a) * .72, -3.0, BZ + math.sin(a) * .72), .016, brass, verts=6))
    P.append(box('Smokebox saddle', (1.1, .9, .2), (0, -2.42, FP + .06), black, bevel=.03, segments=1))
    P.append(rivets('Smokebox rivets', [(math.cos(a) * (SBR + .002), -2.84, BZ + math.sin(a) * (SBR + .002))
                                         for a in [math.radians(10 + 160 * i / 12) for i in range(13)]] +
                    [(math.cos(a) * (SBR + .002), -1.9, BZ + math.sin(a) * (SBR + .002))
                     for a in [math.radians(10 + 160 * i / 12) for i in range(13)]], (0, 0, 1), black, r=.02, h=.014))

    boiler = [(BR, .95), (BR, -1.86)]
    P.append(revolve('Boiler', boiler, red, seg=32, axis='Y', center=(0, 0, BZ), closed=False, outward=1))
    for yb in (-1.74, -.98, -.18, .78):
        band = [(BR - .002, yb + .045), (BR + .014, yb + .032), (BR + .014, yb - .032), (BR - .002, yb - .045)]
        P.append(revolve('Boiler band', band, brass, seg=14, axis='Y', center=(0, 0, BZ), closed=False, outward=1,
                         arc=(math.radians(-20), math.radians(200))))
    # clack valves and brass feed pipes along the boiler shoulders
    for s in (-1, 1):
        a = math.radians(90 - s * 52)
        cx, cz = math.cos(a) * (BR + .03), BZ + math.sin(a) * (BR + .03)
        P.append(cyl('Clack valve', .06, .14, (cx, -1.3, cz), brass, verts=10, rot=(0, D90 * s, 0)))
        P.append(cyl('Clack cap', .045, .06, (cx, -1.3, cz + .08), brass, verts=8))
        P.append(tube('Feed pipe', [(cx, -1.3, cz), (cx + s * .04, -1.1, cz - .04), (cx + s * .06, .5, cz - .07),
                                    (cx + s * .06, .95, cz - .07)], .026, brass, verts=6))

    # chimney (black, brass cap) — Smoke empty at the top
    cy_ = -2.28
    chim = [(.37, 2.86), (.345, 2.96), (.27, 3.04), (.215, 3.16), (.2, 3.34), (.225, 3.47), (.28, 3.56), (.3, 3.58)]
    P.append(lathe('Chimney', chim, black, seg=20, loc=(0, cy_, 0)))
    capp = [(.29, 3.56), (.345, 3.6), (.35, 3.665), (.32, 3.7), (.25, 3.7), (.235, 3.64), (.22, 3.6)]
    P.append(revolve('Chimney cap', capp, brass, seg=20, axis='Z', center=(0, cy_, 0), closed=False, outward=-1))
    P.append(cyl('Chimney soot', .23, .02, (0, cy_, 3.63), black, verts=12))
    # steam dome, safety valves, whistle
    dome = [(.41, 2.8), (.41, 2.9), (.38, 2.97), (.36, 3.1), (.32, 3.25), (.23, 3.36), (.12, 3.415), (0, 3.43)]
    P.append(lathe('Dome', dome, brass, seg=32, loc=(0, -.62, 0)))
    P.append(torus('Dome skirt', .415, .025, (0, -.62, 2.9), brass, maj=24, mn=4))
    sv = [(.17, 2.86), (.16, 2.96), (.1, 3.04), (.075, 3.12), (.085, 3.2), (.125, 3.27), (.13, 3.3), (.1, 3.31), (0, 3.31)]
    P.append(lathe('Safety valve', sv, brass, seg=14, loc=(0, .5, 0)))
    for s in (-1, 1):
        P.append(cyl('Valve column', .035, .1, (s * .04, .5, 3.35), brass, verts=8))
    P.append(cyl('Whistle stem', .025, .3, (-.34, .82, 2.94), brass, verts=8))
    P.append(lathe('Whistle bell', [(.03, 3.06), (.07, 3.08), (.065, 3.24), (.05, 3.28), (0, 3.3)], brass, seg=12,
                   loc=(-.34, .82, 0)))
    P.append(rod('Whistle lever', (-.34, .82, 3.12), (-.18, .9, 3.18), .012, steel, verts=5))
    # headlamp: the engine's big bright eye, on the smokebox top front
    lz, ly = 3.24, -2.78
    P.append(box('Lamp bracket', (.26, .34, .24), (0, ly + .04, 3.0), black, bevel=.03, segments=1))
    housing = [(.2, .22), (.245, .18), (.25, .12), (.255, -.15)]
    P.append(revolve('Lamp housing', housing, black, seg=24, axis='Y', center=(0, ly, lz), closed=False, outward=1))
    P.append(lathe('Lamp back', [(.2, 0), (.12, -.04), (0, -.05)], black, seg=16, loc=(0, -2.56, lz),
                   rot=(D90, 0, 0)))
    P.append(torus('Lamp bezel', .235, .04, (0, -2.94, lz), brass, maj=20, mn=5, rot=(D90, 0, 0)))
    lens = [(.215, -2.93), (.19, -2.965), (.11, -2.99), (0, -2.998)]
    P.append(revolve('Headlamp lens', lens, M['lamp'], seg=24, axis='Y', center=(0, 0, lz), closed=False, outward=1,
                     smooth=80))
    P.append(revolve('Lamp visor', [(.27, -2.66), (.285, -2.99)], brass, seg=12, axis='Y', center=(0, 0, lz),
                     closed=False, outward=1, arc=(math.radians(15), math.radians(165))))
    P.append(cyl('Lamp chimney', .05, .1, (0, -2.72, lz + .28), black, verts=10, r2=.04))
    P.append(cyl('Lamp chimney cap', .075, .03, (0, -2.72, lz + .345), brass, verts=10))

    # ---------------------------------------------------------------- side tanks: rounded front, lining, rivets, nameplate
    TY0, TY1, TZ1 = -1.72, .92, 2.62
    tank_outline = rounded_poly([(TY0, FP - .01), (TY1, FP - .01), (TY1, TZ1), (TY0, TZ1)], [.03, .03, .09, .42], k=5)
    lining_outline = rounded_poly([(TY0 + .15, FP + .13), (TY1 - .14, FP + .13), (TY1 - .14, TZ1 - .13),
                                   (TY0 + .15, TZ1 - .13)], [.05, .05, .07, .28], k=4)
    for s in (-1, 1):
        xo = s * 1.28
        P.append(prism('Side tank', tank_outline, s * .73, xo, red, axis='X', bevel=.05, segments=2, smooth=40))
        U, V, N = Vector((0, s, 0)), Vector((0, 0, 1)), Vector((s, 0, 0))
        P.append(lining('Tank lining', [(y * s, z) for y, z in lining_outline], (xo, 0, 0), U, V, N, brass))
        pts = []
        n = 13
        for i in range(n):
            y = TY0 + .45 + (TY1 - .1 - TY0 - .45) * i / (n - 1)
            pts.append((xo, y, TZ1 - .06))
        for i in range(n + 3):
            pts.append((xo, TY0 + .1 + (TY1 - TY0 - .2) * i / (n + 2), FP + .07))
        for i in range(1, 6):
            z = FP + .07 + (TZ1 - FP - .14) * i / 6
            pts.append((xo, TY1 - .1, z))
            if z < TZ1 - .4:
                pts.append((xo, TY0 + .1, z))
        P.append(rivets('Tank rivets', pts, (s, 0, 0), red, r=.02, h=.018))
        P.append(cyl('Tank filler', .1, .07, (s * 1.0, TY0 + .75, TZ1 + .03), brass, verts=10))
        P.append(cyl('Filler hinge', .02, .12, (s * 1.0, TY0 + .87, TZ1 + .05), brass, verts=6, rot=(0, D90, 0)))
        # nameplate KOBO
        pc = Vector((xo, -.34, 2.02))
        P.append(plane_map(prism('Nameplate', rounded_rect(1.0, .34, .08), 0, .03, brass, axis='Z'), pc, U, V, N))
        P.append(obox('Nameplate field', pc + N * .036, U, V, N, .88, .24, .012, black))
        P.append(letters('KOBO', pc + N * .034, U, V, N, .17, brass, depth=.024))
        P.append(rivets('Plate bolts', [pc + U * (k * .455) + N * .03 for k in (-1, 1)], N, brass, r=.018, h=.014,
                        dome=True))

    # sand boxes on the front footplate + sand pipes
    for s in (-1, 1):
        P.append(box('Sand box', (.36, .5, .4), (s * 1.02, -2.4, FP + .2), red, bevel=.05, segments=1))
        P.append(cyl('Sand lid', .09, .04, (s * 1.02, -2.4, FP + .42), brass, verts=8))
        P.append(tube('Sand pipe', [(s * 1.0, -2.28, FP - .08), (s * .9, -2.28, 1.0), (s * .74, -2.28, .5),
                                    (s * .72, -2.26, .18)], .022, black, verts=6))

    # handrails along the boiler (steel on brass knobs)
    for s in (-1, 1):
        hx, hz = s * .67, BZ + .45
        P.append(rod('Boiler handrail', (hx, -2.2, hz), (hx, .9, hz), .018, steel, verts=6))
        for y in (-2.05, -1.25, -.3, .55):
            P.append(rod('Handrail knob', (s * .6, y, BZ + .39), (hx, y, hz), .02, brass, verts=6))

    # front steps
    for s in (-1, 1):
        P.append(box('Front step', (.26, .2, .035), (s * 1.12, -2.92, .9), black, bevel=0))
        P.append(box('Step hanger', (.03, .03, .5), (s * 1.12, -2.92, 1.15), black, bevel=0))

    # ---------------------------------------------------------------- cab
    CY0, CY1, CZ1 = .92, 2.56, 3.28
    P.append(box('Cab front', (2.48, .07, CZ1 - FP), (0, CY0 + .035, (FP + CZ1) / 2), red, bevel=.02, segments=1))
    for s in (-1, 1):
        P.append(torus('Spectacle rim', .17, .032, (s * .8, CY0 - .01, 3.0), brass, maj=16, mn=4, rot=(D90, 0, 0)))
        P.append(cyl('Spectacle glass', .165, .02, (s * .8, CY0 - .002, 3.0), M['glass'], verts=12, rot=(D90, 0, 0)))
    cut = [(1.3, FP)] + [(1.3 + .41 * (1 - math.cos(a)), 2.72 + .26 * math.sin(a)) for a in
                          [math.pi * i / 8 for i in range(9)]] + [(2.12, FP)]
    side = [(CY0, FP)] + cut + [(CY1, FP), (CY1, CZ1), (CY0, CZ1)]
    cab_lining = rounded_poly([(CY0 + .1, FP + .12), (1.18, FP + .12), (1.18, CZ1 - .12), (CY0 + .1, CZ1 - .12)],
                              .04, k=2)
    cab_lining2 = rounded_poly([(2.24, FP + .12), (CY1 - .1, FP + .12), (CY1 - .1, CZ1 - .12), (2.24, CZ1 - .12)],
                               .04, k=2)
    for s in (-1, 1):
        U, V, N = Vector((0, s, 0)), Vector((0, 0, 1)), Vector((s, 0, 0))
        P.append(prism('Cab side', [(y, z) for y, z in side], s * 1.2, s * 1.26, red, axis='X', smooth=30))
        P.append(tube('Cab beading', [(s * 1.265, y, z) for y, z in cut], .024, black, verts=5))
        for lo in (cab_lining, cab_lining2):
            P.append(lining('Cab lining', [(y * s, z) for y, z in lo], (s * 1.26, 0, 0), U, V, N, brass, w=.024))
        P.append(obox('Cab side window', (s * 1.262, 1.05, 3.0), (0, 1, 0), (0, 0, 1), (1, 0, 0), .16, .28, .012,
                      M['glass']))
        for y in (1.24, 2.18):          # doorway handrails
            P.append(rod('Cab handrail', (s * 1.3, y, FP + .12), (s * 1.3, y, 2.66), .018, brass, verts=6))
            for z in (FP + .12, 2.66):
                P.append(rod('Handrail stanchion', (s * 1.25, y, z), (s * 1.3, y, z), .016, brass, verts=5))
        P.append(box('Cab step', (.26, .34, .035), (s * 1.16, 1.71, .98), black, bevel=0))
        P.append(box('Cab step', (.26, .34, .035), (s * 1.16, 1.71, .56), black, bevel=0))
        for y in (1.55, 1.87):
            P.append(box('Step hanger', (.03, .03, .92), (s * 1.16, y, .96), black, bevel=0))
    P.append(box('Cab rear', (2.48, .07, CZ1 - 2.3), (0, CY1 - .035, (2.3 + CZ1) / 2), red, bevel=.02, segments=1))
    for s in (-1, 1):
        P.append(obox('Rear window', (s * .62, CY1 + .003, 2.86), (1, 0, 0), (0, 0, 1), (0, 1, 0), .44, .36, .012,
                      M['glass']))
        P.append(tube('Rear window frame', [(s * .62 + u, CY1 + .012, 2.86 + v) for u, v in
                                            rounded_rect(.48, .4, .06, 2)], .018, brass, verts=4, closed=True))
        for k in range(3):
            xk = s * .62 - .15 + .15 * k
            P.append(rod('Window guard', (xk, CY1 + .05, 2.64), (xk, CY1 + .05, 3.08), .012, steel, verts=5))
    arc = [(1.31 * (i / 7 - 1), CZ1 + .26 * (1 - (i / 7 - 1) ** 2) - .02) for i in range(15)]
    outline = arc + [(x, z - .07) for x, z in reversed(arc)]
    P.append(prism('Cab roof', outline, CY0 - .16, CY1 + .18, black, axis='Y', bevel=.02, segments=1, smooth=40))
    for s in (-1, 1):
        P.append(rod('Rain strip', (s * 1.27, CY0 - .12, CZ1 + .02), (s * 1.27, CY1 + .14, CZ1 + .02), .018, black,
                     verts=6))
    P.append(box('Roof vent', (.5, .6, .1), (0, 1.75, CZ1 + .27), black, bevel=.03, segments=2))
    # cab interior: floor, backhead, gauges, regulator, seat
    P.append(box('Cab floor', (2.44, 1.52, .04), (0, 1.74, FP + .02), M['oak'], bevel=.01, segments=1))
    for k in range(6):
        P.append(box('Floor plank', (2.44, .012, .006), (0, 1.0 + .25 * k, FP + .043), black, bevel=0))
    P.append(box('Backhead', (1.2, .12, 1.25), (0, CY0 + .1, FP + .66), black, bevel=.05, segments=1))
    P.append(cyl('Firehole door', .19, .04, (0, CY0 + .17, FP + .5), black, verts=14, rot=(D90, 0, 0)))
    P.append(torus('Firehole ring', .2, .025, (0, CY0 + .18, FP + .5), brass, maj=14, mn=4, rot=(D90, 0, 0)))
    for s in (-1, 1):
        P.append(cyl('Gauge', .09, .05, (s * .3, CY0 + .17, FP + 1.08), brass, verts=8, rot=(D90, 0, 0)))
        P.append(cyl('Gauge face', .07, .01, (s * .3, CY0 + .197, FP + 1.08), M['lamp'], verts=8, rot=(D90, 0, 0)))
        P.append(rod('Gauge glass', (s * .5, CY0 + .2, FP + .6), (s * .5, CY0 + .2, FP + .95), .022, M['glass'],
                     verts=6))
    P.append(rod('Regulator', (0, CY0 + .18, FP + .98), (.42, CY0 + .3, FP + 1.0), .02, steel, verts=6))
    P.append(box('Driver seat', (.36, .36, .06), (.9, 2.25, FP + .7), M['oak'], bevel=.02, segments=1))
    P.append(box('Seat post', (.06, .06, .66), (.9, 2.25, FP + .35), black, bevel=0))
    # a little red good-luck charm (omamori) hanging by the driver's window: Genzo's touch
    P.append(rod('Charm cord', (1.12, 1.35, 3.2), (1.12, 1.35, 2.98), .006, M['oak'], verts=4))
    P.append(box('Charm', (.02, .07, .1), (1.12, 1.35, 2.93), red, bevel=.01, segments=1))

    # ---------------------------------------------------------------- bunker, coal, rear details
    BY0, BY1, BZ1 = CY1, 3.1, 2.3
    P.append(box('Bunker', (2.4, BY1 - BY0 + .04, BZ1 - FP), (0, (BY0 + BY1) / 2, (FP + BZ1) / 2), red, bevel=.06,
                 segments=2))
    for s in (-1, 1):
        U, V, N = Vector((0, s, 0)), Vector((0, 0, 1)), Vector((s, 0, 0))
        P.append(lining('Bunker lining', [(y * s, z) for y, z in rounded_poly(
            [(BY0 + .1, FP + .12), (BY1 - .1, FP + .12), (BY1 - .1, BZ1 - .12), (BY0 + .1, BZ1 - .12)], .04, k=2)],
            (s * 1.2, 0, 0), U, V, N, brass, w=.024))
        P.append(rod('Bunker handrail', (s * 1.1, BY1 + .08, FP + .1), (s * 1.1, BY1 + .08, BZ1 - .08), .018, brass,
                     verts=6))
        for z in (FP + .1, BZ1 - .08):
            P.append(rod('Handrail stanchion', (s * 1.1, BY1 + .01, z), (s * 1.1, BY1 + .08, z), .016, brass, verts=6))
    P.append(box('Coal rail', (2.36, .05, .16), (0, BY1 - .01, BZ1 + .06), black, bevel=.015, segments=1))
    for s in (-1, 1):
        P.append(box('Coal rail', (.05, BY1 - BY0, .16), (s * 1.17, (BY0 + BY1) / 2, BZ1 + .06), black, bevel=.015,
                     segments=1))
    # coal heap: chunky faceted lumps heaped above the coal rails
    coal = sphere('Coal', (1.12, .27, .2), (0, 2.83, BZ1 + .1), M['coal'], seg=16, rings=6)
    for v in coal.data.vertices:
        v.co.z = max(v.co.z, -.12)
    displace(coal, strength=.05, scale=7.0, seed=3)
    for p_ in coal.data.polygons:
        p_.use_smooth = False
    P.append(coal)
    rng = random.Random(4)
    for k in range(9):
        c = (-.88 + k * .22 + rng.uniform(-.05, .05), 2.75 + rng.uniform(-.1, .16), BZ1 + .2 + rng.uniform(0, .05))
        r3 = (.09 + rng.random() * .05, .08 + rng.random() * .04, .06 + rng.random() * .03)
        lump = sphere('Coal lump', r3, c, M['coal'], seg=5, rings=3,
                      rot=(rng.random(), rng.random(), rng.random() * 3))
        for p_ in lump.data.polygons:
            p_.use_smooth = False
        P.append(lump)
    # Starline star emblems on the bunker sides
    for s in (-1, 1):
        U, V, N = Vector((0, s, 0)), Vector((0, 0, 1)), Vector((s, 0, 0))
        P.append(plane_map(prism('Bunker star', star_outline(.13, .055), 0, .025, brass, axis='Z', bevel=.008,
                                 segments=1), (s * 1.2, 2.83, 1.88), U, V, N))
    for k in range(3):
        P.append(rod('Rear lamp iron', (-.5 + .5 * k, BY1 + .02, BZ1 - .05), (-.5 + .5 * k, BY1 + .1, BZ1 - .05),
                     .02, black, verts=5))
    P.append(box('Toolbox', (.8, .26, .22), (0, 3.02, BZ1 + .02), black, bevel=.03, segments=1))

    # ---------------------------------------------------------------- weathering: grime low down, soot up top
    init_color(P)

    def grime(p, n, fi, ob):
        g = 1.0 - .2 * max(0.0, min(1.0, (1.25 - p.z) / 1.25))
        if p.z > 3.3 and abs(p.y - cy_) < .45:
            g *= .8
        if p.z > FP + .1 and n.z > .7 and ob.data.materials[0].name == red.name:
            g *= .97
        return (g, g * .985, g * .97)
    paint(P, grime)

    # ---------------------------------------------------------------- nodes
    wheels = build_wheels(M)
    rod_piv, rod_kids = build_rod(M)
    smoke = empty('Smoke', (0, cy_, 3.7))
    cab = empty('Cab', (.5, 1.82, FP + .04))
    coupler = empty('CouplerRear', (0, 3.6, BUF_Z))
    pivots = wheels + [(rod_piv, rod_kids), (smoke, []), (cab, []), (coupler, [])]
    return finish(out_name, P, pivots, ao=(.55, .6), ground=0.0, tinted=True)
