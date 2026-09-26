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
# The slide's ground is analytic and noise-free so the runtime can mirror it exactly (src/world/landslide.js):
# the terrain is sunk out of sight under the scar and the player's feet follow this surface. Keep both in sync.
# Footprint 24 x 18 m with its edges on the 6 m lines shared by the 2 m and 3 m terrain grids (placed at x -50,
# z -168), so the terrain always covers the model's outer rim exactly.
SLIDE_X0, SLIDE_X1, SLIDE_Y0, SLIDE_Y1 = -12.0, 12.0, -6.0, 12.0
SLIDE_RUN, SLIDE_RISE = 12.5, 9.0      # the hillside rises 9 m over 12.5 m (at most ~41 deg), then a plateau
SLIDE_HEAD, SLIDE_HC = 9.4, 2.6        # headscarp line at the centre; the crown arcs 2.6 m downhill at the sides
SLIDE_W0, SLIDE_WMAX = 3.0, 7.8        # scar half-width at the chute mouth and at its widest (a spoon-shaped scar)


def slide_wob(a, b, s):
    """Smooth deterministic wobble in [-1, 1] (mirrored in JS, which mathutils noise could not be)."""
    return (.5 * math.sin(a * 1.31 + b * .47 + s) + .35 * math.sin(a * .53 - b * 1.19 + s * 2.3)
            + .15 * math.sin((a + b) * 2.03 + s * .7))


def _slide_sm(a, b, v):
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def slide_ground(y):
    t = max(0.0, min(1.0, y / SLIDE_RUN))
    return SLIDE_RISE * (.4 * t * t * (3 - 2 * t) + .6 * t)


def slide_scar_w(y):
    t = max(0.0, min(1.0, (y + 2.0) / 10.0))
    return SLIDE_W0 + (SLIDE_WMAX - SLIDE_W0) * math.sin(t * math.pi / 2) ** 1.3


def slide_edge(y):
    return slide_scar_w(y) * (1 + .08 * slide_wob(y * .55, 0.0, 7.0))


def slide_head(x):
    u = x / SLIDE_WMAX
    return SLIDE_HEAD - SLIDE_HC * u * u


def slide_depth(x, y):
    w = slide_edge(y)
    u = abs(x) / w
    if u >= 1:
        return 0.0
    D = (.7 + 3.1 * max(0.0, min(1.0, (y + 1.5) / (SLIDE_HEAD + 1.5))) ** 1.2) * _slide_sm(-2.5, -.5, y)
    hy = slide_head(x)
    if y > hy:
        D *= max(0.0, 1 - (y - hy) / .7)
    return D * (1 - u ** 4)


def slide_lobe(x, y):
    ry = 5.0 if y < .2 else 3.6
    f = max(0.0, 1 - math.hypot(x / 8.5, (y - .2) / ry))
    return 1.6 * f ** 1.4 * (1 + .3 * slide_wob(x * .45, y * .5, 4.0))


def slide_surface(x, y):
    d, lb = slide_depth(x, y), slide_lobe(x, y)
    k = _slide_sm(.05, .5, d + lb)
    return (slide_ground(y) - d + lb +
            k * (.16 * slide_wob(x * .75, y * .7, 3.0) + .08 * slide_wob(x * 1.7, y * 1.5, 9.0)))


def slide_lattice():
    """Vertex columns/rows of the ground mesh (rows packed tight across the arc of the headscarp)."""
    xs = [SLIDE_X0 + (SLIDE_X1 - SLIDE_X0) * i / 44 for i in range(45)]
    ys = ([SLIDE_Y0 + (6.2 - SLIDE_Y0) * j / 20 for j in range(21)] +
          [6.2 + .35 * j for j in range(1, 13)] +
          [10.4 + (SLIDE_Y1 - 10.4) * j / 3 for j in range(1, 4)])
    return xs, ys


def build_landslide(out_name='landslide'):
    """The upriver landslide scar (story evidence that the flood was natural): a raw earth chute torn out of the
    wooded hillside with a steep curved headscarp, banded strata and rock slabs, torn turf lips with dangling
    roots, snapped cedar trunks (one tipped over with its root plate) and a lumpy debris lobe at the toe.
    Origin at the toe (y=0); the hillside rises toward +Y to z=9 at y=11 (plateau to y=12), the lobe spreads to
    y=-4.6; footprint x -12..12, y -6..12. The ground surface is slide_surface() on slide_lattice(), split into
    triangles along the (i, j)-(i+1, j+1) diagonal, exactly as src/world/landslide.js interpolates it.
    'Turf' takes the terrain shader at runtime; 'Turf lip' is tinted with the season's grass."""
    import json
    reset()
    earth = mat('Earth', '#a06a3a', rough=.95)
    rockm = mat('Rock', '#8f8a82', rough=.72)
    turf = mat('Turf', '#5e8c3a', rough=.9)
    lipm = mat('Turf lip', '#6f8f3e', rough=.9)
    bark = mat('Bark', '#6a4431', rough=.85)
    fresh = mat('Fresh wood', '#e2b57c', rough=.75)
    root = mat('Roots', '#4b3324', rough=.9)
    rng = random.Random(12)
    P = []
    solids = []          # walkable/blocking shapes for the runtime colliders (printed as LANDSLIDE_SOLIDS)
    HEAD = SLIDE_HEAD
    ground, depth, lobe, surf, head = slide_ground, slide_depth, slide_lobe, slide_surface, slide_head
    scar_w, edge = slide_scar_w, slide_edge
    xs, ys = slide_lattice()
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new('Color')
    grid = [[bm.verts.new((x, y, surf(x, y))) for x in xs] for y in ys]
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            a, b, c, d = grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]
            bm.faces.new((a, b, c))
            bm.faces.new((a, c, d))
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    STRATA = ((1.2, 1.0, .76), (.9, .68, .54), (1.08, 1.04, .96), (1.14, .9, .64), (.78, .6, .5), (1.02, .84, .68))
    for f in bm.faces:
        c = f.calc_center_median()
        # (a jittered threshold tears the lobe's edge irregularly instead of into regular saw teeth)
        in_lobe = lobe(c.x, c.y) > .12 + .2 * (.5 + .5 * noise.noise(Vector((c.x * .8, c.y * .8, 11.0))))
        # every triangle that dips into the scar is raw earth (a steep turf triangle would take the terrain
        # shader's rock colour and fringe the rim with pale teeth)
        f.material_index = 0 if (in_lobe or max(depth(v.co.x, v.co.y) for v in f.verts) > .03) else 1
        for l in f.loops:
            p = l.vert.co
            if f.material_index == 0:
                below = ground(p.y) - p.z          # depth below the old surface
                idx = int((p.z * 1.9 + 1.6 * noise.noise(Vector((p.x * .22, p.y * .22, 0)))) % len(STRATA))
                c3 = STRATA[idx]
                if below < .4 and not in_lobe:
                    c3 = (.5, .4, .33)                  # dark humus right under the turf
                u = abs(p.x) / edge(p.y)
                damp = .8 + .2 * _slide_sm(.5, .85, u) if not in_lobe else .9   # the chute floor is darker debris
                k = (.88 + .14 * noise.noise(Vector((p.x * 2, p.y * 2, p.z * 2)))) * damp
                l[col] = (c3[0] * k, c3[1] * k, c3[2] * k, 1)
            else:                                        # neutral: the terrain shader colours the turf
                k = .93 + .07 * noise.noise(Vector((p.x * .45, p.y * .45, 5)))
                l[col] = (k, k, k, 1)
    slope = from_bmesh('Slope', bm, earth, smooth_angle=55)
    slope.data.materials.append(turf)
    # hard edge between turf and earth: rim turf normals must not lean into the scar (the terrain shader would
    # paint that steep-looking turf with its pale rock colour)
    fmat = {}
    for poly in slope.data.polygons:
        for ek in poly.edge_keys:
            fmat.setdefault(ek, set()).add(poly.material_index)
    for e in slope.data.edges:
        if len(fmat.get(e.key, ())) > 1:
            e.use_edge_sharp = True
    P.append(slope)

    # the rim: roots dangling from the torn sides, a turf lip overhanging the curved crown
    def crown(x):
        return head(x) + .7
    side_ys = []
    y = 1.5
    while y < crown(edge(y)) - .45:
        side_ys.append(y)
        y += .5
    x_top = edge(side_ys[-1]) - .1
    def chunks(pts, sizes):     # torn into pieces with gaps, not one continuous ribbon
        out, i = [], 0
        for n in sizes:
            if i + 1 < len(pts):
                out.append(pts[i:i + n])
            i += n + 1
        return [c for c in out if len(c) > 1]
    for sx in (-1, 1):              # roots hanging from the torn side edges
        for y in side_ys[1::2]:
            a = Vector((sx * (edge(y) - .05), y, ground(y) + lobe(sx * edge(y), y) - .05))
            inward = Vector((-sx, 0, 0))
            P.append(tube('Dangling root', [a, a + inward * .25 + Vector((0, .05, -.6)),
                                            a + inward * .3 + Vector((.1, -.1, -1.1))], .035, root, verts=4))
    # the torn turf lip overhanging the crown of the headscarp
    crown_pts = [Vector((x, head(x) + .55, 0)) for x in [-x_top + 2 * x_top * i / 22 for i in range(23)]]
    for k, path in enumerate(chunks(crown_pts, (6, 4, 7, 6))):
        pts = [Vector((p.x, p.y, ground(p.y) + .05)) for p in path]
        lip = sweep('Turf lip', pts, [(-.28, -.12), (.14, -.1), (.24, .02), (0, .06), (-.24, .04)], lipm, up=(0, 0, 1))
        displace(lip, strength=.08, scale=2.6, seed=k + 3)
        P.append(lip)
        for j in range(1, len(pts) - 1, 2):
            a = pts[j]
            P.append(tube('Dangling root', [a + Vector((0, 0, -.15)), a + Vector((0, -.25, -.7)),
                                            a + Vector((.1, -.45, -1.3))], .035, root, verts=4))
    # angular rock slabs jutting from the headscarp, boulders in the chute and on the lobe
    for k in range(7):
        x = rng.uniform(-scar_w(HEAD) * .8, scar_w(HEAD) * .8)
        y = head(x) - rng.uniform(.1, .5)
        z = ground(y) - depth(x, y) * rng.uniform(.3, .8)
        b = box('Rock slab', (rng.uniform(.9, 1.8), rng.uniform(.5, .9), rng.uniform(.35, .7)), (x, y, z), rockm,
                bevel=.08, segments=1, rot=(rng.uniform(-.5, .2), rng.uniform(-.3, .3), rng.uniform(-.4, .4)))
        for p in b.data.polygons:
            p.use_smooth = False
        P.append(b)

    def extent(ob):
        bpy.context.view_layer.update()
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        return (min(v.x for v in bb), max(v.x for v in bb), min(v.y for v in bb), max(v.y for v in bb),
                max(v.z for v in bb))
    for k in range(20):
        if k < 9:
            y = rng.uniform(1.0, HEAD - 1.0)
            x = rng.uniform(-scar_w(y) * .7, scar_w(y) * .7)
        else:
            y = rng.uniform(-4.2, .8)
            x = rng.uniform(-6.0, 6.0)
        z = surf(x, y)
        r = rng.uniform(.4, 1.1) * (1.15 if k >= 9 else 1)
        b = sphere('Boulder', (r, r * rng.uniform(.7, 1), r * rng.uniform(.55, .8)), (x, y, z + r * .15), rockm,
                   seg=7, rings=5, rot=(rng.random(), rng.random(), rng.random() * 3))
        displace(b, strength=r * .2, scale=1.6 / r, seed=k)
        for p in b.data.polygons:
            p.use_smooth = False
        P.append(b)
        x0, x1, y0, y1, top = extent(b)
        if r > .5:
            solids.append(['rock', round((x0 + x1) / 2, 2), round((y0 + y1) / 2, 2),
                           round(min(x1 - x0, y1 - y0) * .4, 2), round(top - .04, 2)])

    def trunk(a, b, r, root_plate=False):
        a, b = Vector(a), Vector(b)
        solids.append(['log', round(a.x, 2), round(a.y, 2), round(a.z, 2), round(b.x, 2), round(b.y, 2),
                       round(b.z, 2), round(r, 2)])
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
    trunk((1.2, ya, surf(1.2, ya) + 1.4), (-2.0, 1.2, surf(-2.0, 1.2) + .45), .42, root_plate=True)
    trunk((-6.2, -2.4, surf(-6.2, -2.4) + .45), (4.6, -1.0, surf(4.6, -1.0) + .5), .36)
    trunk((5.5, 5.0, surf(5.5, 5.0) + .45), (1.8, .6, surf(1.8, .6) + .35), .28)
    x, y = -(scar_w(8.5) + 1.0), 8.5
    P.append(rod('Stump', (x, y, ground(y) - .3), (x, y, ground(y) + 1.6), .38, bark, verts=10, r2=.34))
    solids.append(['stump', round(x, 2), round(y, 2), .4, round(ground(y) + 1.6, 2)])
    acc = Acc('Stump splinters', fresh, smooth=20)
    for i in range(6):
        ang = TAU * i / 6
        acc.add_cone((x + math.cos(ang) * .2, y + math.sin(ang) * .2, ground(y) + 1.55), (0, 0, 1), .11, 0.0,
                     rng.uniform(.35, .8), seg=4)
    P.append(acc.obj())
    for k in range(16):
        x, y = rng.uniform(-6.0, 6.0), rng.uniform(-4.5, 1.0)
        r = rng.uniform(.12, .32)
        c = sphere('Clod', (r, r * .9, r * .6), (x, y, surf(x, y) + .05), rockm if k % 3 else earth, seg=5, rings=3)
        for p in c.data.polygons:
            p.use_smooth = False
        P.append(c)
    crng = random.Random(99)          # clods and pebbles strewn along the edge of the lobe
    for k in range(22):
        a = -math.pi * (k + crng.uniform(.1, .9)) / 22 + (crng.uniform(-.35, .35) if k in (0, 21) else 0)
        f0 = .83 + crng.uniform(-.08, .1)
        x, y = 8.5 * f0 * math.cos(a), .2 + 5.0 * f0 * math.sin(a)
        r = crng.uniform(.09, .24)
        c = sphere('Clod', (r, r * .9, r * .6), (x, y, surf(x, y) + .03), rockm if k % 2 else earth, seg=5, rings=3,
                   rot=(0, 0, crng.random() * 3))
        for p in c.data.polygons:
            p.use_smooth = False
        P.append(c)
    init_color([o for o in P if not o.data.color_attributes.get('Color')])
    paint([o for o in P if o.data.materials[0].name == 'Rock'],
          lambda p, n, fi, ob: (lambda k: (k, k * .98, k * .95))(.8 + .22 * noise.noise(p * 1.7)))
    # lips: grass on top (tinted by the season at runtime), a dark torn soil mat underneath
    paint([o for o in P if o.data.materials[0].name == 'Turf lip'],
          lambda p, n, fi, ob: (1.0, 1.0, 1.0) if n.z > .45 else (.42, .31, .22))
    print('LANDSLIDE_SOLIDS ' + json.dumps(solids))
    return finish(out_name, P, [], ao=(1.4, .6), ground=None, tinted=True)
