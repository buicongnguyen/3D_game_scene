"""River props for the Starline railway family: Rin's ferry, rowboat, jetty module, stepping stones, festival
lantern boat and the landslide scar. All face -Y in Blender; boats have their origin at the waterline."""
import math, random
from mathutils import Vector, noise
from railway_common import *
from railway_viaduct import Mason, courses_between, hsweep, joint_path, MORTAR


def worn(objs, base=1.0, amount=.18, scale=2.5, seed=0):
    """Worn-paint mottling in COLOR_0 (lighter scuffs and darker grime)."""
    off = Vector((seed * 3.1, seed * 1.7, seed * .9))

    def fn(p, n, fi, ob):
        k = base + amount * noise.noise(p * scale + off) + .06 * noise.noise(p * scale * 4 + off)
        return (k, k * .99, k * .97)
    paint(objs, fn)


# ------------------------------------------------------------------ ferry

def build_ferry(out_name='ferry'):
    """Rin's flat-bottom river ferry: planked teal hull with a red sheer strake, deck boards, side rails,
    a bench, a bow lantern post (Lantern glow), a mooring bollard and rope coils. PoleSpot at the stern."""
    reset()
    teal = mat('Ferry paint', '#1d8f94', rough=.55)
    red = mat('Ferry trim', '#c8432f', rough=.5)
    wood = mat('Ferry wood', '#b07a45', rough=.7)
    rope = mat('Rope', '#c9a56b', rough=.9)
    lant = glow('Lantern glow', '#f04a2e', '#ffc45a', strength=0.0, rough=.6)
    black = mat('Iron', '#2c323c', rough=.5, metal=.5)
    P = []
    ms = Mason(3)
    HW, L, ZT, ZB = 1.18, 2.6, .42, -.24   # half width, half length, gunwale, bottom

    def half_len(z):     # raked ends: the hull is shorter at the bottom
        return L - .55 * (ZT - z) / (ZT - ZB)
    # planked sides (three strakes; the top strake is the red sheer band)
    for sx in (-1, 1):
        def pt(u, v, sx=sx):
            flare = .06 * (v - ZB) / (ZT - ZB)
            return Vector((sx * (HW - .06 + flare), u, v))
        ms.wall(pt, lambda u, v, sx=sx: Vector((sx, 0, 0)), lambda v: (-half_len(v), half_len(v)),
                courses_between(ZB, ZT - .16, .2), block=6.0, chamfer=.025, depth=.015, joints=False, var=.5)
    sides = ms.flush('Hull sides')[-1:]
    for sy in (-1, 1):       # raked ends, planked across
        def pe(u, v, sy=sy):
            return Vector((u * (HW - .06 + .06 * (v - ZB) / (ZT - ZB)), sy * half_len(v), v))
        ms.wall(pe, lambda u, v, sy=sy: Vector((0, sy * .9, .45)).normalized(), lambda v: (-1.0, 1.0),
                courses_between(ZB, ZT - .16, .2), block=6.0, chamfer=.025, depth=.015, joints=False, var=.5)
    ends = ms.flush('Hull ends')[-1:]
    for o in ends:
        o.data.materials.append(teal)
    # sheer strake (red) + gunwale cap (wood) following the hull outline
    outline = [(-HW, -L + .02), (HW, -L + .02), (HW, L - .02), (-HW, L - .02)]
    ring = [(x * 1.0, y) for x, y in rounded_poly(outline, .35, k=3)]
    P.append(hsweep('Sheer strake', ring, [(-.05, ZT - .17), (.035, ZT - .17), (.035, ZT - .01), (-.05, ZT - .01)], red,
                    closed=True))
    P.append(hsweep('Gunwale', ring, [(-.1, ZT - .01), (.06, ZT - .01), (.06, ZT + .05), (-.1, ZT + .05)], wood,
                    closed=True))
    # inner planking above the floor boards (so the hull reads solid from inside)
    for sx in (-1, 1):
        P.append(box('Inner planking', (.04, 2 * L - .7, .24), (sx * (HW - .1), 0, .31), wood, bevel=0))
    for sy in (-1, 1):
        P.append(box('Inner planking', (2 * HW - .2, .04, .24), (0, sy * (L - .2), .31), wood, bevel=0))
    # floor boards along the length
    dm = Mason(5)
    dm.wall(lambda u, v: Vector((v, u, .2)), lambda u, v: Vector((0, 0, 1)), lambda v: (-L + .3, L - .3),
            courses_between(-HW + .08, HW - .08, .22), block=2.4, chamfer=.015, depth=.012, joints=True, jw=.02,
            var=.6)
    deck = dm.flush('Deck boards')
    for o in deck:
        o.data.materials.append(wood)
    P += deck
    P.append(box('Bottom', (2 * HW - .1, 2 * (L - .55), .06), (0, 0, ZB + .03), teal, bevel=0))
    P.append(box('Hull fill', (2 * HW - .14, 2 * L - .5, .02), (0, 0, .18), wood, bevel=0))
    # side rails: posts and a top rail (open at the stern so Rin can pole)
    for sx in (-1, 1):
        ys = [-1.9, -1.1, -.3, .5, 1.3]
        for y in ys:
            P.append(box('Rail post', (.08, .08, .6), (sx * (HW - .02), y, ZT + .32), wood, bevel=.015, segments=1))
        P.append(box('Top rail', (.1, ys[-1] - ys[0] + .16, .07), (sx * (HW - .02), (ys[0] + ys[-1]) / 2, ZT + .64),
                     wood, bevel=.02, segments=1))
        P.append(tube('Rail rope', [(sx * (HW - .02), ys[0] + (ys[-1] - ys[0]) * t,
                                     ZT + .38 - .06 * math.sin(math.pi * ((t * 4) % 1))) for t in
                                    [i / 16 for i in range(17)]], .014, rope, verts=4))
    # bench across the middle
    P.append(box('Bench seat', (2 * HW - .3, .38, .06), (0, .2, .62), wood, bevel=.02, segments=1))
    for sx in (-1, 1):
        P.append(box('Bench leg', (.06, .3, .4), (sx * (HW - .35), .2, .4), wood, bevel=0))
    # bow lantern post with a hanging red chochin (Lantern glow)
    lp = Vector((.72, -L + .45, .2))
    P.append(box('Lantern post', (.12, .12, 1.22), lp + Vector((0, 0, .61)), wood, bevel=.025, segments=1))
    P.append(box('Lantern arm', (.08, .62, .08), lp + Vector((0, -.26, 1.16)), wood, bevel=.02, segments=1))
    P.append(rod('Arm brace', lp + Vector((0, 0, .86)), lp + Vector((0, -.34, 1.13)), .022, wood, verts=4))
    lc = lp + Vector((0, -.5, .84))
    prof = [(.1, .23), (.18, .15), (.21, 0), (.18, -.15), (.1, -.23)]
    P.append(lathe('Chochin', [(r, z) for r, z in prof], lant, seg=12, loc=lc))
    for dz in (.24, -.24):
        P.append(cyl('Chochin cap', .105, .04, lc + Vector((0, 0, dz)), black, verts=8))
    P.append(rod('Chochin cord', lc + Vector((0, 0, .26)), lc + Vector((0, 0, .32)), .008, black, verts=4))
    # rope fenders hanging over both sides, a spare bamboo pole, a crate and a bucket
    for sx in (-1, 1):
        for y in (-1.5, 0.1, 1.6):
            c = Vector((sx * (HW + .08), y, .05))
            P.append(cyl('Fender', .09, .28, c, rope, verts=8, bevel=.03, segments=1))
            P.append(rod('Fender line', c + Vector((0, 0, .14)), Vector((sx * (HW - .02), y, ZT + .06)), .012, rope,
                         verts=4))
    P.append(rod('Spare pole', (HW - .02, -2.3, ZT + .7), (HW - .02, 2.2, ZT + .7), .035, mat('Bamboo', '#c9b36a',
                                                                                        rough=.6), verts=7))
    for y in (-1.6, -.4, .8, 2.0):
        P.append(cyl('Pole node', .042, .03, (HW - .02, y, ZT + .7), wood, verts=7, rot=(D90, 0, 0)))
    P.append(box('Crate', (.46, .4, .34), (.62, 1.75, .38), wood, bevel=.025, segments=1))
    P.append(box('Crate slat', (.48, .42, .04), (.62, 1.75, .45), rope, bevel=0))
    P.append(lathe('Bucket', [(.14, 0), (.17, .3), (.155, .3), (.125, .03), (0, .03)], wood, seg=10,
                   loc=(.12, 1.9, .21)))
    # mooring bollard at the bow, cleat at the stern, rope coils
    P.append(cyl('Bollard', .1, .5, (-.72, -L + .5, .45), wood, verts=10, bevel=.03, segments=1))
    P.append(cyl('Bollard cap', .13, .06, (-.72, -L + .5, .72), wood, verts=10, bevel=.02, segments=1))
    for k in range(3):
        P.append(torus('Rope coil', .2 - k * .03, .03, (-.55, L - .6, .24 + k * .05), rope, maj=14, mn=5))
    P.append(tube('Mooring line', [(-.72, -L + .5, .62), (-.9, -L + .3, .55), (-1.05, -L + .05, .38)], .025, rope,
                  verts=5))
    P.append(box('Stern cleat', (.1, .3, .06), (0, L - .3, ZT + .08), black, bevel=.02, segments=1))
    for o in sides:
        o.data.materials.append(teal)
    P += sides + ends
    init_color([o for o in P if not o.data.color_attributes.get('Color')])
    worn(P, amount=.16, seed=2)
    spot = empty('PoleSpot', (0, L - .45, .23))
    return finish(out_name, P, [(spot, [])], ao=(.5, .55), ground=None, tinted=True)


# ------------------------------------------------------------------ rowboat

def build_rowboat(out_name='rowboat'):
    """A clinker-built rowboat: cream hull with a teal sheer strake, varnished interior, ribs, two thwarts and
    a pair of oars stowed fore-and-aft across the thwarts. Origin at the waterline."""
    reset()
    paint_m = mat('Boat paint', '#f1e3c4', rough=.5)
    trim = mat('Boat trim', '#1f8c96', rough=.45)
    wood = mat('Boat wood', '#b8793f', rough=.6)
    iron = mat('Iron', '#2c323c', rough=.5, metal=.5)
    rope = mat('Rope', '#c9a56b', rough=.9)
    L, W, ZK, ZG = 1.68, .66, -.2, .52
    NS = 12

    def station(t):
        """t in [-1 (bow, -Y), 1 (stern)] -> (y, half beam, keel z, sheer z)."""
        y = t * L
        if t < 0:
            b = W * math.sqrt(max(0.0, 1 - (abs(t) ** 2.2))) + .02
        else:
            b = W * (1 - .38 * t ** 2.5)
        sheer = ZG + .12 * (abs(t) ** 2.2) * (1.3 if t < 0 else .8)
        keel = ZK + .1 * abs(t) ** 3
        return y, b, keel, sheer
    strakes = 4
    ts = [-1 + 2 * i / (NS - 1) for i in range(NS)]
    outer, inner = [], []
    for t in ts:
        y, b, zk, zs = station(t)
        ring_o, ring_i = [], []
        for side in (-1, 1):
            pts = []
            for k in range(strakes + 1):
                f = k / strakes
                x = b * math.sin(f * D90) ** .7
                z = zk + (zs - zk) * (1 - math.cos(f * D90)) ** .9
                if 0 < k < strakes:          # clinker lap: a small outward step
                    pts.append((x * 1.0 + .018, z - .012))
                pts.append((x, z))
            if side < 0:
                ring_o = [(-x, z) for x, z in reversed(pts)] + ring_o
            else:
                ring_o = ring_o + pts[1:]
        outer.append([Vector((x, y, z)) for x, z in ring_o])
        inner.append([Vector((x * .93, y, z + .03)) for x, z in ring_o[::2]])

    def loft(rings, name, material, flip=False, tint=None):
        bm = bmesh.new()
        vs = [[bm.verts.new(p) for p in r] for r in rings]
        for A, B in zip(vs, vs[1:]):
            for i in range(len(A) - 1):
                f = bm.faces.new((A[i], A[i + 1], B[i + 1], B[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = from_bmesh(name, bm, material, smooth_angle=30)
        return ob
    hull = loft(outer, 'Hull', paint_m)
    # outward normals: flip if the average normal points inward
    me = hull.data
    s_ = sum((p.normal.x * p.center.x + p.normal.z * (p.center.z - .1) for p in me.polygons))
    if s_ < 0:
        me.flip_normals()
    interior = loft(inner, 'Interior', wood)
    me = interior.data
    s_ = sum((p.normal.x * p.center.x + p.normal.z * (p.center.z - .1) for p in me.polygons))
    if s_ > 0:
        me.flip_normals()
    P = [hull, interior]
    # the top strake painted in trim colour via a separate thin band following the sheer
    for side in (-1, 1):
        pts_hi, pts_lo = [], []
        for t in ts:
            y, b, zk, zs = station(t)
            pts_hi.append(Vector((side * (b + .004), y, zs - .005)))
            pts_lo.append(Vector((side * (b * .985 + .02), y, zs - .1)))
        bm = bmesh.new()
        A = [bm.verts.new(p) for p in pts_hi]
        B = [bm.verts.new(p) for p in pts_lo]
        for i in range(len(A) - 1):
            f = bm.faces.new((A[i], A[i + 1], B[i + 1], B[i]))
            f.normal_update()
            if f.normal.x * side < 0:
                f.normal_flip()
        P.append(from_bmesh('Sheer band', bm, trim, smooth_angle=40))
        P.append(tube('Gunwale', [Vector((side * station(t)[1], station(t)[0], station(t)[3] + .01)) for t in ts],
                      .03, wood, verts=5))
    # transom and stem
    y, b, zk, zs = station(1)
    tr = [(-b, zs), (b, zs), (b * .55, zk + .12), (-b * .55, zk + .12)]
    P.append(prism('Transom', [(x, z) for x, z in tr], y - .02, y + .04, trim, axis='Y', bevel=.012, segments=1))
    stem = [Vector((0, station(t)[0] - .02, station(t)[2] - .02)) for t in (-1, -.9, -.7, -.3, .3, .9)]
    stem = [Vector((0, -L - .04, station(-1)[3] + .04)), Vector((0, -L - .02, 0))] + stem
    P.append(tube('Keel', stem, .035, wood, verts=5))
    # ribs, thwarts, rowlocks
    for t in (-.6, -.35, -.1, .15, .4, .62):
        y, b, zk, zs = station(t)
        pts = [Vector((-b * .9, y, zs - .05)), Vector((-b * .6, y, zk + .08)), Vector((0, y, zk + .05)),
               Vector((b * .6, y, zk + .08)), Vector((b * .9, y, zs - .05))]
        P.append(tube('Rib', pts, .018, wood, verts=4))
    for t, h in ((-.25, .3), (.3, .3), (.8, .26)):
        y, b, zk, zs = station(t)
        P.append(box('Thwart', (2 * b * .92, .24, .04), (0, y, zs - h + .12), wood, bevel=.012, segments=1))
    rl = []
    for side in (-1, 1):
        y, b, zk, zs = station(-.02)
        rl.append(Vector((side * (b + .01), y, zs + .02)))
        P.append(cyl('Rowlock', .02, .12, rl[-1] + Vector((0, 0, .06)), iron, verts=5))
    # oars stowed: lying fore-and-aft on the thwarts, blades toward the stern (the boat is moored)
    for side in (-1, 1):
        zt = station(-.25)[3] - .3 + .12 + .045
        grip = Vector((side * .2, -1.05, zt + .03))
        blade = Vector((side * .28, 1.2, zt + .09))
        P.append(rod('Oar shaft', grip, blade, .024, wood, verts=6))
        d = (blade - grip).normalized()
        P.append(obox('Oar blade', blade + d * .22, d, Vector((0, 0, 1)).cross(d).normalized(), d.cross(
            Vector((0, 0, 1)).cross(d)).normalized(), .5, .15, .025, wood))
        P.append(cyl('Oar grip', .03, .12, grip - d * .06, wood, verts=6, rot=Vector((0, 0, 1)).rotation_difference(
            d).to_euler()))
    # bow painter rope coiled on the fore deck
    y, b, zk, zs = station(-.82)
    P.append(torus('Painter', .1, .02, (0, y + .1, zk + .2), rope, maj=10, mn=4))
    P.append(tube('Painter line', [Vector((0, -L - .02, station(-1)[3] - .05)), Vector((0, -L + .1, zk + .3)),
                                   Vector((0, y + .02, zk + .22))], .016, rope, verts=4))
    init_color(P)
    worn(P, amount=.16, seed=4)
    return finish(out_name, P, [], ao=(.4, .55), ground=None, tinted=True)


# ------------------------------------------------------------------ dock

def build_dock(out_name='dock'):
    """Timber jetty module 2.6 (X) x 4 (Y): plank deck top at z=0, two stringers, six piles to z=-3 (inset from
    the module ends so modules chain every 4 m along Y), cross bracing, kerb logs and iron mooring cleats."""
    reset()
    wood = mat('Dock wood', '#a8743f', rough=.75)
    pile = mat('Pile wood', '#6e5138', rough=.85)
    iron = mat('Iron', '#2c323c', rough=.5, metal=.5)
    rope = mat('Rope', '#c9a56b', rough=.9)
    rng = random.Random(9)
    P = []
    n = 16
    for i in range(n):
        y = -2 + (i + .5) * 4 / n
        w = 4 / n - .025
        dz = rng.uniform(-.012, .006)
        P.append(box('Plank', (2.6 - rng.uniform(0, .06), w, .06), (rng.uniform(-.02, .02), y, -.03 + dz), wood,
                     bevel=.012, segments=1, rot=(0, rng.uniform(-.01, .01), rng.uniform(-.008, .008))))
    for sx in (-1, 1):
        P.append(box('Stringer', (.18, 4.0, .24), (sx * .9, 0, -.18), pile, bevel=.02, segments=1))
        P.append(box('Kerb log', (.14, 3.96, .12), (sx * 1.24, 0, .06), wood, bevel=.03, segments=1))
    for sx in (-1, 1):
        for y in (-1.5, 1.5):
            P.append(cyl('Pile', .13, 3.25, (sx * 1.1, y, -1.4), pile, verts=8))
            P.append(cyl('Pile cap', .15, .06, (sx * 1.1, y, .2), iron, verts=6))
        P.append(cyl('Pile', .12, 3.1, (sx * .35, 0, -1.55), pile, verts=8))
        a, b = Vector((sx * 1.1, -1.5, -.4)), Vector((sx * 1.1, 1.5, -2.4))
        P.append(rod('Brace', a, b, .06, pile, verts=5))
        P.append(rod('Brace', Vector((sx * 1.1, 1.5, -.4)), Vector((sx * 1.1, -1.5, -2.4)), .06, pile, verts=5))
    for y in (-1.5, 1.5):
        P.append(box('Cap beam', (2.5, .16, .16), (0, y, -.36), pile, bevel=.02, segments=1))
    for sx, y in ((1, -1.0), (-1, 1.0)):
        c = Vector((sx * 1.18, y, .13))
        P.append(box('Cleat base', (.14, .12, .06), c, iron, bevel=0))
        P.append(box('Cleat horn', (.08, .34, .05), c + Vector((0, 0, .06)), iron, bevel=.015, segments=1))
    P.append(tube('Rope', [Vector((1.18, -1.1, .2)), Vector((1.3, -1.3, .1)), Vector((1.34, -1.6, -.3))], .02, rope,
                  verts=4))
    init_color(P)
    worn(P, amount=.18, seed=6)
    paint(P, lambda p, n, fi, ob: (1 - .35 * max(0, min(1, (-p.z - .3) / 1.5)) * .9,) * 3)   # wet piles
    return finish(out_name, P, [], ao=(.5, .55), ground=None, tinted=True)


# ------------------------------------------------------------------ stepping stones

def build_stone(out_name='stepping-stone', seed=1):
    """Flat-topped river boulder about 1.5 x 1.3: a broad jumpable top at z=0.35 with rounded shoulders, chunky
    faceted flanks swelling below the waterline, base at z=-1; moss patches on the top, a dark wet band."""
    reset()
    rock = mat('River stone', '#8e8f89', rough=.62)
    moss = mat('Moss', '#5e8c3a', rough=.9)
    rng = random.Random(seed * 17)
    sx_, sy_ = (1.5, 1.3) if seed == 1 else (1.45, 1.2)
    ob = box('Stone', (sx_ * .88, sy_ * .88, 1.35), (0, 0, -.325), rock, bevel=.42, segments=4)
    bake_transform(ob)
    me = ob.data
    off = Vector((seed * 5.3, seed * 2.1, 0))
    for v in me.vertices:
        p = v.co
        ang = math.atan2(p.y, p.x)
        swell = 1.0 + .1 * max(0.0, 1 - abs(p.z + .15) / .6)          # widest around the waterline
        swell *= 1 - .22 * max(0.0, min(1.0, (-p.z - .35) / .65))     # tuck in toward the river bed
        lobe = 1 + .09 * math.sin(ang * (2 if seed == 1 else 3) + seed)
        p.x *= swell * lobe
        p.y *= swell * lobe
        p += Vector((noise.noise(p * 1.1 + off), noise.noise(p * 1.1 + off + Vector((4, 0, 0))),
                     .5 * noise.noise(p * 1.1 + off + Vector((0, 7, 0))))) * .17
        p += Vector((noise.noise(p * 3.2 + off), noise.noise(p * 3.2 + off + Vector((2, 0, 0))), 0)) * .05
        if p.z > .2:
            p.z = .35 - (.35 - p.z) * .35 + .025 * noise.noise(p * 3 + off)
        p.z = max(-1.0, p.z)
    me.update()
    ob.rotation_euler = (0, 0, rng.uniform(-.4, .4))
    bake_transform(ob)
    zmax = max(v.co.z for v in me.vertices)
    for v in me.vertices:
        v.co.z = max(-1.0, v.co.z + .35 - zmax)
    me.update()
    shade(ob, 32)
    ob.data.materials.append(moss)
    for p in me.polygons:
        c = p.center
        if p.normal.z > .45 and c.z > .12 and (noise.noise(c * 1.8 + off) > -.12 or math.hypot(c.x, c.y) > .6):
            p.material_index = 1
    init_color([ob])

    def tint(p, n, fi, o):
        k = .92 + .12 * noise.noise(p * 2.7 + off)
        w = .5 + .5 * noise.noise(p * .9 + off + Vector((0, 0, 3)))
        warm = (1.04 * w + .96 * (1 - w), 1.0, .94 * w + 1.05 * (1 - w))
        if p.z < .1:
            k *= .72
        if p.z > .3 and noise.noise(p * 6 + off) > .35:
            k *= 1.12                                  # pale lichen flecks
        return (k * warm[0], k * warm[1], k * warm[2])
    paint([ob], tint)
    return finish(out_name, [ob], [], ao=(.5, .5), ground=None, tinted=True)


# ------------------------------------------------------------------ lantern boat

def build_lantern_boat(out_name='lantern-boat'):
    """Toro-nagashi floating lantern: a small wooden raft with a paper lantern box (Lantern glow) in a thin
    frame, a little roof and a painted star on the paper. Origin at the waterline."""
    reset()
    wood = mat('Lantern wood', '#a36b3a', rough=.7)
    paper = glow('Lantern glow', '#ffe9b8', '#ffc45a', strength=0.0, rough=.7)
    red = mat('Lantern trim', '#c8432f', rough=.5)
    P = []
    P.append(box('Raft', (.56, .76, .08), (0, 0, .0), wood, bevel=.02, segments=1))
    for sx in (-1, 1):
        P.append(box('Raft runner', (.08, .78, .06), (sx * .22, 0, -.06), wood, bevel=.015, segments=1))
    P.append(box('Tray rim', (.46, .46, .03), (0, 0, .055), red, bevel=.01, segments=1))
    W, H, Z0 = .34, .4, .07
    P.append(box('Paper box', (W - .02, W - .02, H), (0, 0, Z0 + H / 2), paper, bevel=.01, segments=1))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(box('Frame post', (.03, .03, H + .04), (sx * W / 2, sy * W / 2, Z0 + H / 2), wood, bevel=0))
    for z in (Z0 + .01, Z0 + H):
        for sx in (-1, 1):
            P.append(box('Frame rail', (.03, W + .03, .03), (sx * W / 2, 0, z), wood, bevel=0))
            P.append(box('Frame rail', (W + .03, .03, .03), (0, sx * W / 2, z), wood, bevel=0))
    # little pyramid roof and a ring handle
    P.append(cyl('Roof', .3, .12, (0, 0, Z0 + H + .08), red, verts=4, r2=.03, rot=(0, 0, math.pi / 4)))
    P.append(torus('Handle', .04, .01, (0, 0, Z0 + H + .17), wood, maj=8, mn=4, rot=(D90, 0, 0)))
    # painted stars on the four paper faces
    for k in range(4):
        a = k * D90
        n = Vector((math.cos(a), math.sin(a), 0))
        t = Vector((-n.y, n.x, 0))
        P.append(plane_map(prism('Paper star', star_outline(.07, .03), 0, .004, red, axis='Z'),
                           n * (W / 2 - .009) + Vector((0, 0, Z0 + H * .55)), t, Vector((0, 0, 1)), n))
    init_color(P)
    return finish(out_name, P, [], ao=(.2, .5), ground=None, tinted=True)


# ------------------------------------------------------------------ landslide

def build_landslide(out_name='landslide'):
    """The upriver landslide scar (story evidence that the flood was natural): a raw earth chute torn out of the
    wooded hillside with a steep curved headscarp, banded strata and rock slabs, torn turf lips with dangling
    roots, snapped cedar trunks (one tipped over with its root plate) and a lumpy debris lobe at the toe.
    Origin at the toe (y=0); the hillside rises toward +Y to z~9 at y=11, the lobe spreads to y=-5."""
    reset()
    earth = mat('Earth', '#a06a3a', rough=.95)
    rockm = mat('Rock', '#8f8a82', rough=.72)
    turf = mat('Turf', '#5e8c3a', rough=.9)
    bark = mat('Bark', '#6a4431', rough=.85)
    fresh = mat('Fresh wood', '#e2b57c', rough=.75)
    root = mat('Roots', '#4b3324', rough=.9)
    rng = random.Random(12)
    P = []
    X0, X1, Y0, Y1 = -11.0, 11.0, -5.0, 11.0
    HEAD = 9.6                    # headscarp line (y)

    def ground(x, y):
        t = max(0.0, min(1.0, y / Y1))
        return 9.0 * (t * t * (3 - 2 * t)) * .55 + 9.0 * t * .45 + .5 * noise.noise(Vector((x * .13, y * .13, 1.0)))

    def scar_w(y):
        return 2.8 + 3.8 * max(0.0, min(1.0, (y + 1.5) / (HEAD + 1.5))) ** .8

    def depth(x, y):
        w = scar_w(y) * (1 + .08 * noise.noise(Vector((y * .4, 0, 7))))
        u = abs(x) / w
        if u >= 1 or y < -1.5:
            return 0.0
        D = .6 + 2.9 * max(0.0, min(1.0, (y + 1.5) / (HEAD + 1.5))) ** 1.3
        if y > HEAD:
            D *= max(0.0, 1 - (y - HEAD) / .7)
        return D * (1 - u ** 5)

    def lobe(x, y):
        if y >= 1.0:
            return 0.0
        f = max(0.0, 1 - math.hypot(x / 7.5, (y - .2) / 4.8))
        return 1.5 * f ** 1.4 * (1 + .25 * noise.noise(Vector((x * .5, y * .5, 4))))
    xs = [X0 + (X1 - X0) * i / 40 for i in range(41)]
    ys = sorted(set([Y0 + (HEAD - .6 - Y0) * j / 22 for j in range(23)] +
                    [HEAD - .4, HEAD - .15, HEAD + .1, HEAD + .35, HEAD + .7] +
                    [HEAD + .7 + (Y1 - HEAD - .7) * j / 2 for j in range(1, 3)]))
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new('Color')
    grid = []
    for y in ys:
        row = []
        for x in xs:
            d = depth(x, y)
            z = ground(x, y) - d + lobe(x, y) + .1 * noise.noise(Vector((x * .9, y * .9, 3.0)))
            if d > .05:
                z += .12 * noise.noise(Vector((x * 1.7, y * 1.7, 9.0)))
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    STRATA = ((1.1, .92, .68), (1.0, .76, .6), (.88, .86, .82), (1.08, .86, .6), (.95, .8, .7))
    for f in bm.faces:
        c = f.calc_center_median()
        d = depth(c.x, c.y)
        in_lobe = lobe(c.x, c.y) > .12
        f.material_index = 0 if (d > .12 or in_lobe) else 1
        for l in f.loops:
            p = l.vert.co
            if f.material_index == 0:
                below = ground(p.x, p.y) - p.z          # depth below the old surface
                idx = int((p.z * 1.6 + 2 * noise.noise(Vector((p.x * .25, p.y * .25, 0)))) % len(STRATA))
                c3 = STRATA[idx]
                if below < .45 and not in_lobe:
                    c3 = (.55, .45, .38)                # dark humus right under the turf
                k = .9 + .1 * noise.noise(Vector((p.x * 2, p.y * 2, p.z * 2)))
                l[col] = (c3[0] * k, c3[1] * k, c3[2] * k, 1)
            else:
                k = .82 + .2 * noise.noise(Vector((p.x * .45, p.y * .45, 5)))
                l[col] = (k * .95, k, k * .85, 1)
    slope = from_bmesh('Slope', bm, earth, smooth_angle=55)
    slope.data.materials.append(turf)
    P.append(slope)
    # torn turf lips along the scar sides and over the headscarp, with dangling roots
    lip_paths = []
    for sx in (-1, 1):
        lip_paths.append([Vector((sx * (scar_w(y) + .05), y, 0)) for y in
                          [-.5 + (HEAD - .2 + .5) * j / 10 for j in range(11)]])
    lip_paths.append([Vector((x, HEAD + .55, 0)) for x in
                      [-scar_w(HEAD) + (2 * scar_w(HEAD)) * i / 10 for i in range(11)]])
    for k, path in enumerate(lip_paths):
        pts = [Vector((p.x, p.y, ground(p.x, p.y) + .05)) for p in path]
        lip = sweep('Turf lip', pts, [(-.4, -.3), (.25, -.25), (.35, .06), (-.35, .12)], turf, up=(0, 0, 1))
        displace(lip, strength=.1, scale=1.6, seed=k + 3)
        P.append(lip)
        for j in range(1, len(pts) - 1, 2):
            a = pts[j]
            inward = Vector((-a.x, 0, 0)).normalized() if k < 2 else Vector((0, -1, 0))
            P.append(tube('Dangling root', [a + Vector((0, 0, -.15)), a + inward * .3 + Vector((0, .05, -.7)),
                                            a + inward * .35 + Vector((.1, -.1, -1.3))], .035, root, verts=4))
    # angular rock slabs jutting from the headscarp, boulders in the chute and on the lobe
    for k in range(7):
        x = rng.uniform(-scar_w(HEAD) * .8, scar_w(HEAD) * .8)
        y = HEAD - rng.uniform(.1, .5)
        z = ground(x, y) - depth(x, y) * rng.uniform(.3, .8)
        b = box('Rock slab', (rng.uniform(.9, 1.8), rng.uniform(.5, .9), rng.uniform(.35, .7)), (x, y, z), rockm,
                bevel=.08, segments=1, rot=(rng.uniform(-.5, .2), rng.uniform(-.3, .3), rng.uniform(-.4, .4)))
        for p in b.data.polygons:
            p.use_smooth = False
        P.append(b)
    for k in range(20):
        if k < 9:
            y = rng.uniform(1.0, HEAD - 1.0)
            x = rng.uniform(-scar_w(y) * .7, scar_w(y) * .7)
        else:
            y = rng.uniform(-4.2, .8)
            x = rng.uniform(-6.0, 6.0)
        z = ground(x, y) - depth(x, y) + lobe(x, y)
        r = rng.uniform(.4, 1.1) * (1.15 if k >= 9 else 1)
        b = sphere('Boulder', (r, r * rng.uniform(.7, 1), r * rng.uniform(.55, .8)), (x, y, z + r * .15), rockm,
                   seg=7, rings=5, rot=(rng.random(), rng.random(), rng.random() * 3))
        displace(b, strength=r * .2, scale=1.6 / r, seed=k)
        for p in b.data.polygons:
            p.use_smooth = False
        P.append(b)

    def trunk(a, b, r, root_plate=False):
        a, b = Vector(a), Vector(b)
        P.append(rod('Cedar trunk', a, b, r, bark, verts=10, r2=r * .75))
        d = (b - a).normalized()
        u = d.orthogonal().normalized()
        v = d.cross(u)
        acc = Acc('Splinters', fresh, smooth=20)
        for i in range(7):
            ang = TAU * i / 7
            base = b + (u * math.cos(ang) + v * math.sin(ang)) * r * .5
            acc.add_cone(base - d * .05, (d + (u * math.cos(ang) + v * math.sin(ang)) * .2).normalized(), r * .26,
                         0.0, rng.uniform(.3, .75), seg=4)
        P.append(acc.obj())
        P.append(cyl('Heartwood', r * .72, .05, b, fresh, verts=10,
                     rot=Vector((0, 0, 1)).rotation_difference(d).to_euler()))
        for i in range(4):     # stubby broken branches
            t = .25 + .17 * i
            p = a.lerp(b, t)
            ang = rng.random() * TAU
            dirn = (u * math.cos(ang) + v * math.sin(ang) + d * .4).normalized()
            P.append(rod('Branch stub', p, p + dirn * rng.uniform(.6, 1.3), r * .2, bark, verts=5, r2=r * .07))
        if root_plate:
            plate = cyl('Root plate', r * 4.0, .6, a - d * .25, earth, verts=12, r2=r * 3.2,
                        rot=Vector((0, 0, 1)).rotation_difference(d).to_euler())
            displace(plate, strength=.25, scale=1.3, seed=7)
            init_color([plate])
            paint([plate], lambda p_, n_, fi, ob: (.62, .5, .42))
            P.append(plate)
            for i in range(10):
                ang = TAU * i / 10 + rng.random() * .4
                o = a - d * .5 + (u * math.cos(ang) + v * math.sin(ang)) * r * rng.uniform(2.6, 4.2)
                P.append(tube('Root', [a - d * .3, a - d * .45 + (o - a) * .55, o - d * .35], .07, root, verts=4))
    # the big cedar that fell with the slide, tipped over at the headscarp with its root plate in the air
    ya = HEAD - .8
    trunk((1.2, ya, ground(1.2, ya) - depth(1.2, ya) + 1.4),
          (-2.0, 1.2, ground(-2.0, 1.2) - depth(-2.0, 1.2) + .45), .42, root_plate=True)
    trunk((-6.2, -2.4, lobe(-6.2, -2.4) + .45), (4.6, -1.0, lobe(4.6, -1.0) + .5), .36)
    trunk((5.5, 5.0, ground(5.5, 5.0) - depth(5.5, 5.0) + .45), (1.8, .6, ground(1.8, .6) - depth(1.8, .6) + .35), .28)
    x, y = -(scar_w(8.5) + 1.0), 8.5
    P.append(rod('Stump', (x, y, ground(x, y) - .3), (x, y, ground(x, y) + 1.6), .38, bark, verts=10, r2=.34))
    acc = Acc('Stump splinters', fresh, smooth=20)
    for i in range(6):
        ang = TAU * i / 6
        acc.add_cone((x + math.cos(ang) * .2, y + math.sin(ang) * .2, ground(x, y) + 1.55), (0, 0, 1), .11, 0.0,
                     rng.uniform(.35, .8), seg=4)
    P.append(acc.obj())
    for k in range(16):
        x, y = rng.uniform(-6.0, 6.0), rng.uniform(-4.5, 1.0)
        r = rng.uniform(.12, .32)
        c = sphere('Clod', (r, r * .9, r * .6), (x, y, lobe(x, y) + .05), rockm if k % 3 else earth, seg=5, rings=3)
        for p in c.data.polygons:
            p.use_smooth = False
        P.append(c)
    init_color([o for o in P if not o.data.color_attributes.get('Color')])
    paint([o for o in P if o.data.materials[0].name == 'Rock'],
          lambda p, n, fi, ob: (lambda k: (k, k * .98, k * .95))(.8 + .22 * noise.noise(p * 1.7)))
    return finish(out_name, P, [], ao=(1.4, .6), ground=None, tinted=True)
