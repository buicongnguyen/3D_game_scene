"""Rewards family for Starline: the story's treasures and the thank-you gifts that fill Sora's cottage.

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_rewards.py [-- --only a,b]

* Treasures (music-box, golden-acorn, star-compass) are floating pickups centred on their origin (the runtime bobs
  and spins them); no ground AO. Pivot nodes keep identity rest rotation with the origin on their axis:
  `Train` (music-box: tiny Kobo and the carousel star, spins about three.js Y round the track centre) and
  `Needle` (star-compass: the star needle, turns about three.js Z, the dial normal).
* star-tree (grown from the golden acorn) stands on z=0 with its roots sunk to z=-0.25. Crown: `Star leaves`
  (emissive gold leaf clusters) and `Star blossom` (small emissive star flowers).
* Gifts (gift-*) stand on z=0 facing -Y, origin at the ground centre of the footprint, each <= 0.4 m, with contact
  AO. They sit at the interior-cottage `Item_gift_<friend>` nodes (8 mm above their surface); each node's Z rotation
  turns the gift's front toward the room.
Icons: art/blender/render_icons.py -- music-box golden-acorn star-compass gift-lure ... (public/icons/<name>.webp).
A full build also saves art/blender/source/rewards.blend.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from np_kit import *  # noqa: F401,F403
import build_props as BP
import build_nature as BN

star_outline = BP.star_outline
recentre, ground_parts, transform_all = BP.recentre, BP.ground_parts, BP.transform_all
finish_prop, up_light, ring_rod, beam = BP.finish_prop, BP.up_light, BP.ring_rod, BP.beam


# ================================================================ helpers


def M4(loc=(0, 0, 0), rot=(0, 0, 0)):
    return Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4()


def about(point, axis, angle):
    """Rotation by `angle` about the line through `point` along `axis`."""
    p = Vector(point)
    return Matrix.Translation(p) @ Matrix.Rotation(angle, 4, Vector(axis)) @ Matrix.Translation(-p)


def place(objs, m):
    transform_all(objs if isinstance(objs, (list, tuple)) else [objs], m)
    return objs


def lin(h):
    return srgb(h)


def factor(target, base):
    """Tint that turns material colour `base` into `target` (both '#hex' sRGB), for tint()."""
    t, b = lin(target), lin(base)
    return tuple(min(1.0, t[i] / max(b[i], 1e-4)) for i in range(3))


def star_plate(name, R_, r_, depth, material, loc=(0, 0, 0), normal=(0, -1, 0), spin=0.0, pts=None):
    """Extruded star (points up) centred on loc, its face toward `normal` (not straight +Y)."""
    ob = extrude(name, pts or star_outline(R_, r_), depth, material, bevel=0.0)
    q = Vector((0, -1, 0)).rotation_difference(Vector(normal).normalized()).to_matrix().to_4x4()
    ob.matrix_world = Matrix.Translation(Vector(loc)) @ q @ Matrix.Rotation(spin, 4, 'Y')
    apply_transform(ob)
    return ob


def puffy_star(name, c, normal, R_, material, inner=.45, puff=.32, spin=0.0):
    """Cushioned five-point star: a raised centre over a flat rim (10 tris), facing `normal`."""
    bm = bmesh.new()
    top = bm.verts.new((0, 0, R_ * puff))
    rim = []
    for i in range(10):
        a = spin + math.pi / 2 + math.pi * i / 5
        rr = R_ if i % 2 == 0 else R_ * inner
        rim.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, 0)))
    for i in range(10):
        bm.faces.new((top, rim[i], rim[(i + 1) % 10]))
    orient(bm, c, normal)
    return from_bmesh(name, bm, material, smooth_angle=45)


def rect_frame(name, w_out, d_out, w_in, d_in, z0, z1, material, loc=(0, 0, 0)):
    """Rectangular ring (a tray rim or a picture-frame moulding), closed solid, 32 tris."""
    bm = bmesh.new()

    def ring(w, d, z):
        return [bm.verts.new((sx * w / 2, sy * d / 2, z)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    ob_, ot_, ib_, it_ = ring(w_out, d_out, z0), ring(w_out, d_out, z1), ring(w_in, d_in, z0), ring(w_in, d_in, z1)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((ob_[i], ob_[j], ot_[j], ot_[i]))
        bm.faces.new((ib_[j], ib_[i], it_[i], it_[j]))
        bm.faces.new((ot_[i], ot_[j], it_[j], it_[i]))
        bm.faces.new((ob_[j], ob_[i], ib_[i], ib_[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm, material, loc=loc, smooth_angle=30)


def band(name, pts, width, thick, material, wdir=(0, 1, 0), closed=False, caps=True):
    """Flat ribbon along pts with a width x thick rectangular section; the width runs along wdir
    (a vector, or one vector per point), made perpendicular to the path."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    wds = wdir if (isinstance(wdir, list) and len(wdir) == n and hasattr(wdir[0], '__len__')) else [wdir] * n
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        if closed:
            a, b = pts[(i - 1) % n], pts[(i + 1) % n]
        else:
            a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
        t = (b - a).normalized()
        w = Vector(wds[i])
        w = (w - t * w.dot(t)).normalized()
        m = t.cross(w).normalized()
        hw, ht = w * width / 2, m * thick / 2
        rings.append([bm.verts.new(p + hw + ht), bm.verts.new(p - hw + ht), bm.verts.new(p - hw - ht),
                      bm.verts.new(p + hw - ht)])
    segs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for r0, r1 in segs:
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
    if caps and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm, material, smooth_angle=60)


def ribbon_bow(prefix, c, material, span=.034, h=.022, width=.01, thick=.0018, tail=.034, yaw=0.0, tilt=0.0):
    """A tied bow: two teardrop loops (their ribbon width running front-to-back), two hanging tails with the flat
    side to the front, and a knot. Built facing -Y, then turned by yaw (Z) and tilt (X). ~200 tris."""
    parts = []
    for s in (-1, 1):
        pts = []
        for i in range(8):
            th = TAU * i / 8
            x = s * span * (1 - math.cos(th)) / 2
            pts.append(Vector((x, 0, h / 2 * math.sin(th) + abs(x) * .28)))
        parts.append(band(prefix, pts, width, thick, material, (0, 1, 0), closed=True))
        tp = [Vector((s * .003, -.002, -.003)), Vector((s * tail * .3, -.003, -tail * .55)),
              Vector((s * tail * .46, -.0025, -tail))]
        parts.append(band(prefix, tp, width * .9, thick, material, (1, 0, 0)))
    parts.append(sphere(prefix, (width * .62, width * .5, width * .62), (0, -.0015, 0), material, seg=6, rings=4))
    place(parts, Matrix.Translation(Vector(c)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X'))
    return parts


def prof_r(prof, z):
    """Radius of a lathe profile at height z (first segment spanning z)."""
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if z1 != z0 and min(z0, z1) <= z <= max(z0, z1):
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return prof[-1][0]


def outward(bm, axis_pt=(0, 0, 0)):
    """Flip faces of an open sheet wrapped round the Z axis so they face away from it."""
    o = Vector(axis_pt)
    for f in bm.faces:
        f.normal_update()
        c = f.calc_center_median()
        rad = Vector((c.x - o.x, c.y - o.y, 0))
        if f.normal.dot(rad) < 0:
            f.normal_flip()


def wrap_panel(name, prof, a0, a1, z0, z1, material, nu=4, nz=2, lift=.0015, sy=1.0):
    """Curved sheet following a lathe surface between angles a0..a1 and heights z0..z1 (a label, a band)."""
    bm = bmesh.new()
    grid = []
    for j in range(nz + 1):
        z = z0 + (z1 - z0) * j / nz
        r = prof_r(prof, z) + lift
        grid.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r * sy, z))
                     for a in [a0 + (a1 - a0) * i / nu for i in range(nu + 1)]])
    for j in range(nz):
        for i in range(nu):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    outward(bm)
    return from_bmesh(name, bm, material, smooth_angle=70)


def wrap_poly(name, prof, pts, material, lift=.002):
    """Flat painted shape [(angle, z), ...] laid on a lathe surface (decals: paw prints, drawings)."""
    bm = bmesh.new()
    vs = []
    for a, z in pts:
        r = prof_r(prof, z) + lift
        vs.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
    bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    outward(bm)
    return from_bmesh(name, bm, material, smooth_angle=80)


def ellipse_az(prof, a_c, z_c, w, h, n=8, squash_top=1.0):
    """(angle, z) outline of an ellipse w x h (metres of surface) centred at angle a_c, height z_c."""
    r = prof_r(prof, z_c)
    out = []
    for i in range(n):
        t = TAU * i / n
        dz = math.sin(t) * h / 2 * (squash_top if math.sin(t) > 0 else 1)
        out.append((a_c + math.cos(t) * w / 2 / r, z_c + dz))
    return out


def disc_face(name, c, r, material, n=24, normal=(0, 0, 1)):
    """Single n-gon disc (a dial, a paper circle)."""
    bm = bmesh.new()
    vs = [bm.verts.new((math.cos(TAU * i / n) * r, math.sin(TAU * i / n) * r, 0)) for i in range(n)]
    bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    orient(bm, c, normal)
    return from_bmesh(name, bm, material, smooth_angle=10)


def leaf_sheet(name, root, direction, up, L, W_, material, lobes=0, bend=.25, fold=.2, n=10, lobe_depth=.3):
    """A creased leaf strip (3 verts per row); `lobes` rounded lobes per side (oak)."""
    d = Vector(direction).normalized()
    side = d.cross(Vector(up)).normalized()
    upv = side.cross(d).normalized()
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        t = i / n
        w = W_ * math.sin(math.pi * min(1.0, t * 1.04 + .02)) ** .7
        if lobes:
            w *= 1 - lobe_depth + lobe_depth * abs(math.cos(t * lobes * math.pi + .3))
        w = max(w, W_ * .05)
        c = Vector(root) + d * (L * t) - upv * (bend * L * t * t)
        crease = upv * (fold * w * .5)
        rows.append([bm.verts.new(c - side * w / 2 - crease), bm.verts.new(c + crease * .4),
                     bm.verts.new(c + side * w / 2 - crease)])
    for a, b in zip(rows, rows[1:]):
        bm.faces.new((a[0], b[0], b[1], a[1]))
        bm.faces.new((a[1], b[1], b[2], a[2]))
    return from_bmesh(name, bm, material, smooth_angle=80)


def paint(objs, col):
    """Uniform tint (a factor() or scalar) over parts."""
    tint(objs if isinstance(objs, (list, tuple)) else [objs], lambda p, n, f: col)


def tint_vi(ob, fn):
    """Multiply COLOR_0 by fn(vertex_index) (patterns tied to the mesh topology)."""
    me = ob.data
    attr = me.color_attributes.get('Color')
    for li, loop in enumerate(me.loops):
        k = fn(loop.vertex_index)
        k = k if isinstance(k, (tuple, list)) else (k, k, k)
        c = attr.data[li].color
        attr.data[li].color = (c[0] * k[0], c[1] * k[1], c[2] * k[2], 1)


def grow(parts, k):
    """Uniform scale about the origin (readability at game distance; grounded gifts keep z=0)."""
    place(parts, Matrix.Scale(k, 4))


def mats_of(parts, *mats):
    return [p for p in parts if p is not None and p.type == 'MESH' and p.data.materials[0] in mats]


# ================================================================ TREASURES


def build_music_box():
    """Sora's music box, 0.25 m: a red-lacquered box on gold ball feet with cream panels and gold star inlays, the
    lid standing open, a teal-velvet stage with a little circular track on which a tiny golden Kobo runs round a
    carousel star (node `Train`), and a gold butterfly winding key on the right side."""
    reset()
    red = mat('Red lacquer', '#c8322a', rough=.26)
    cream = mat('Cream enamel', '#f3e5c6', rough=.38)
    gold = mat('Gold', '#e9b443', rough=.24, metal=.9)
    velvet = mat('Teal velvet', '#1f8f9a', rough=.85)
    silver = mat('Silver', '#cfd3da', rough=.22, metal=.9)
    dark = mat('Dark wood', '#43281c', rough=.6)
    W, D = .24, .17
    z0, z1 = .02, .104
    parts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(sphere('Foot', (.016, .016, .014), (sx * .097, sy * .063, .014), gold, seg=6, rings=3))
    parts.append(box('Body', (W, D, z1 - z0), (0, 0, (z0 + z1) / 2), red, bevel=.007, segments=1))
    parts.append(box('Base band', (W + .01, D + .01, .012), (0, 0, z0 + .006), gold, bevel=0))
    zr = z1 + .018
    parts.append(rect_frame('Rim', W, D, W - .022, D - .022, z1 - .004, zr, red))
    parts.append(rect_frame('Rim bead', W + .006, D + .006, W - .018, D - .018, zr, zr + .004, gold))
    zv = z1 + .004
    parts.append(box('Velvet', (W - .02, D - .02, .008), (0, 0, z1), velvet, bevel=0))
    # front: cream panel in a gold moulding with the star inlay; cream side panels; the gold latch
    zc = (z0 + z1) / 2 + .004
    parts.append(box('Panel', (.17, .004, .052), (0, -D / 2 - .001, zc), cream, bevel=0))
    parts.append(place(rect_frame('Panel frame', .182, .064, .168, .05, -.0025, .0025, gold),
                       M4((0, -D / 2 - .003, zc), (math.pi / 2, 0, 0))))
    parts.append(star_plate('Star', .021, .009, .004, gold, (0, -D / 2 - .004, zc)))
    for s in (-1, 1):
        parts.append(box('Side panel', (.004, .12, .05), (s * (W / 2 + .001), 0, zc), cream, bevel=0))
    parts.append(box('Latch', (.022, .006, .016), (0, -D / 2 - .002, z1 + .006), gold, bevel=0))
    # the lid: red outside, cream panel and a big gold star inside, hinged open at the back
    zt = zr + .004
    lid = [box('Lid', (W + .008, D + .008, .026), (0, 0, zt + .013), red, bevel=.008, segments=1),
           box('Lid panel', (.19, .13, .004), (0, 0, zt - .001), cream, bevel=0),
           rect_frame('Lid frame', .2, .14, .19, .13, zt - .004, zt, gold),
           star_plate('Lid star', .036, .0155, .004, gold, (0, 0, zt - .005), normal=(0, 0, -1))]
    place(lid, about((0, D / 2 + .004, zt), (1, 0, 0), math.radians(-104)))
    for s in (-1, 1):
        parts.append(cyl('Hinge', .005, .03, (s * .07, D / 2 + .004, zt), gold, verts=8, rot=(0, math.pi / 2, 0)))
    parts += lid
    # the track: two silver rails on dark sleepers round the stage
    tc = Vector((0, .006, zv))
    for R_ in (.047, .059):
        parts.append(torus('Rail', R_, .0024, tc + Vector((0, 0, .0052)), silver, maj=20, mn=3))
    for i in range(10):
        a = TAU * i / 10 + .13
        parts.append(box('Tie', (.022, .005, .003), tc + Vector((math.cos(a) * .053, math.sin(a) * .053, .0015)),
                         dark, bevel=0, rot=(0, 0, a)))
    # tiny golden Kobo (0-6-0 tank engine, red cab roof and buffer beam), running anticlockwise
    tr = []
    for x in (-.013, 0, .013):
        for s in (-1, 1):
            tr.append(cyl('Wheel', .0058, .003, (x, s * .0063, .0048), gold, verts=6, rot=(math.pi / 2, 0, 0)))
    tr.append(box('Frame', (.048, .015, .004), (0, 0, .008), dark, bevel=0))
    tr.append(cyl('Boiler', .0075, .03, (.005, 0, .0175), gold, verts=8, rot=(0, math.pi / 2, 0)))
    tr.append(cyl('Smokebox', .0083, .006, (.0215, 0, .0175), gold, verts=8, rot=(0, math.pi / 2, 0)))
    tr.append(cyl('Chimney', .0032, .012, (.02, 0, .03), gold, verts=8, r2=.0046))
    tr.append(sphere('Dome', .0045, (.006, 0, .025), gold, seg=6, rings=4))
    tr.append(box('Cab', (.016, .017, .02), (-.015, 0, .02), gold, bevel=0))
    tr.append(box('Cab roof', (.021, .021, .003), (-.015, 0, .0315), red, bevel=0))
    tr.append(box('Buffer beam', (.003, .019, .005), (.0265, 0, .008), red, bevel=0))
    tr.append(sphere('Lamp', .0028, (.0255, 0, .0255), cream, seg=6, rings=4))
    for s in (-1, 1):
        tr.append(box('Cab window', (.007, .002, .006), (-.015, s * .0086, .023), dark, bevel=0))
    th = math.radians(-105)
    place(tr, M4(tc + Vector((math.cos(th) * .053, math.sin(th) * .053, .0073)), (0, 0, th + math.pi / 2)))
    # the carousel star in the middle turns with the train
    tr.append(rod('Post', tc, tc + Vector((0, 0, .05)), .0028, gold, verts=6))
    tr.append(star_plate('Top star', .025, .0105, .008, gold, tc + Vector((0, 0, .062))))
    # gold butterfly winding key on the right
    kx = W / 2 + .003
    parts.append(cyl('Key shaft', .004, .02, (kx + .008, 0, zc), gold, verts=8, rot=(0, math.pi / 2, 0)))
    parts.append(cyl('Key collar', .0065, .004, (kx + .002, 0, zc), gold, verts=10, rot=(0, math.pi / 2, 0)))
    wing = []
    for i in range(16):
        a = TAU * i / 16
        r = .015 * (.3 + .7 * abs(math.cos(a)) ** .7)
        wing.append((math.cos(a) * r, math.sin(a) * r * .78))
    parts.append(place(extrude('Key', wing, .004, gold, bevel=0.0), M4((kx + .02, 0, zc), (0, math.radians(20), math.pi / 2))))
    c = recentre(parts + tr)
    train = pivot_mesh('Train', tr, tc - c)
    print('music-box', tri_count(parts + [train]))

    def tints():
        up_light(mats_of(parts + [train], gold, silver), .78)
        tint(mats_of(parts, red), lambda p, n, f: .86 + .14 * smoothstep(-.06, .06, p.z))
        tint(mats_of(parts, velvet), lambda p, n, f: .8 + .2 * smoothstep(0, .07, Vector((p.x, p.y - .006)).length))
    return finish_prop('music-box', parts, 'Music box', keep=[train], ground=None, dist=.06, strength=.5,
                       tints=tints)


def build_golden_acorn():
    """A plump shining golden acorn, 0.15 m: a glossy gold nut with a little raised star, an antique-gold quilted
    cupule, a curled stem and a bright oak leaf."""
    reset()
    gold = mat('Gold', '#f5c03c', rough=.18, metal=.92, emit=.22, emit_color='#ffb52e')
    old = mat('Old gold', '#c48f2c', rough=.36, metal=.85)
    leaf = mat('Oak leaf', '#62b236', rough=.5, double=True)
    glow = mat('Star gold', '#ffe483', rough=.2, metal=.3, emit=.9, emit_color='#ffcf4a')
    nut_prof = [(0, -.012), (.0035, -.0085), (.0062, -.003), (.014, .004), (.026, .014), (.037, .028), (.0445, .044),
                (.047, .058), (.0455, .07), (.041, .08)]
    parts = [lathe('Nut', nut_prof, gold, seg=20, smooth_angle=70)]
    cap_prof = [(.04, .075), (.0478, .0705), (.052, .0758), (.0532, .0828), (.0512, .0898), (.0466, .0966),
                (.0392, .1026), (.0292, .1073), (.0176, .1104), (.007, .1119), (0, .1122)]
    cap = lathe('Cap', cap_prof, old, seg=24, smooth_angle=80)
    zs = [z for _, z in cap_prof]

    def ring_of(z):
        return min(range(len(zs)), key=lambda k: abs(zs[k] - z))

    def col_of(v):
        return round(math.atan2(v.y, v.x) / (TAU / 24))

    swell, valley = set(), set()
    for v in cap.data.vertices:  # quilted scales: alternate vertices of the scale rows swell out and down
        j = ring_of(v.co.z)
        if 1 <= j <= len(zs) - 3:
            if (col_of(v.co) + j) % 2 == 0:
                v.co += Vector((v.co.x, v.co.y, 0)).normalized() * .0027 + Vector((0, 0, -.0013))
                swell.add(v.index)
            else:
                valley.add(v.index)
    cap.data.update()
    parts.append(cap)
    parts.append(tube('Stem', [Vector((0, 0, .108)), Vector((.001, 0, .118)), Vector((.005, -.001, .126)),
                               Vector((.012, -.002, .1305))], .0048, old, verts=6, radius_fn=lambda t: 1 - .35 * t))
    lroot, ldir, lL, lbend = Vector((.003, -.002, .119)), Vector((.82, -.42, .34)).normalized(), .1, .28
    lf = leaf_sheet('Leaf', lroot, ldir, (0, 0, 1), lL, .054, leaf, lobes=4, bend=lbend, fold=.22, n=12,
                    lobe_depth=.32)
    parts.append(lf)
    lside = ldir.cross(Vector((0, 0, 1))).normalized()
    lup = lside.cross(ldir).normalized()
    parts.append(tube('Midrib', [lroot + ldir * (lL * t) - lup * (lbend * lL * t * t) + lup * .0012
                                 for t in (0, .3, .6, .85)], .0016, old, verts=4, radius_fn=lambda t: 1 - .5 * t))
    parts.append(star_plate('Star', .0115, .005, .0032, glow, (0, -.0462, .046), normal=(0, -1, -.05)))
    place(parts, Matrix.Rotation(math.radians(12), 4, 'Y') @ Matrix.Rotation(math.radians(-6), 4, 'X'))
    recentre(parts)
    print('golden-acorn', tri_count(parts))

    def tints():
        nut = parts[0]
        tint(nut, lambda p, n, f: (1.0, .9 + .1 * smoothstep(-.06, .01, p.z), .78 + .22 * smoothstep(-.06, .01, p.z)))

        tint_vi(cap, lambda vi: 1.0 if vi in swell else .66 if vi in valley else .9)
        tint(lf, lambda p, n, f: (1.0, 1.0, .75 + .25 * smoothstep(.05, -.02, p.x)))
    return finish_prop('golden-acorn', parts, 'Golden acorn', ground=None, dist=.04, strength=.5, tints=tints)


def build_star_compass():
    """Sora's brass pocket compass, 0.12 m across (0.2 m with its lid open like a locket): cream dial with an ink
    compass rose and a red north point, and a gold star needle with one long ray that finds the north (node
    `Needle`), a crown and bow on top, and an engraved star inside the hunter lid."""
    reset()
    brass = mat('Brass', '#d9a441', rough=.26, metal=.9)
    dial_m = mat('Dial', '#f4ead0', rough=.45)
    ink = mat('Ink', '#2d4f8a', rough=.5)
    red = mat('Red enamel', '#d8342c', rough=.35)
    starm = mat('Star gold', '#ffc93a', rough=.2, metal=.55, emit=.6, emit_color='#ffb01c')
    # built with the dial facing +Z and the bow at +Y, then stood up facing -Y
    case_prof = [(0, -.0105), (.033, -.0105), (.046, -.0065), (.0508, -.0005), (.0495, .0055), (.0445, .0085),
                 (.0412, .0065), (.0412, .003)]
    parts = [lathe('Case', case_prof, brass, seg=24, smooth_angle=50)]
    parts.append(disc_face('Dial', (0, 0, .0045), .0412, dial_m, n=24))
    zr = .0052
    for k in range(8):
        a = math.pi / 2 + TAU * k / 8
        L_, w_ = (.031, .0056) if k % 2 == 0 else (.0185, .0038)
        u = Vector((math.cos(a), math.sin(a), 0))
        s = Vector((-u.y, u.x, 0))
        o = Vector((0, 0, zr))
        m = red if k == 0 else ink
        bm = bmesh.new()
        vs = [bm.verts.new(o), bm.verts.new(o + u * L_ * .3 - s * w_), bm.verts.new(o + u * L_),
              bm.verts.new(o + u * L_ * .3 + s * w_)]
        fk = bm.faces.new(vs)
        fk.normal_update()
        if fk.normal.z < 0:
            fk.normal_flip()
        parts.append(from_bmesh('Rose', bm, m, flat=True))
    bm = bmesh.new()
    rin = [bm.verts.new((math.cos(TAU * i / 24) * .0355, math.sin(TAU * i / 24) * .0355, .0049)) for i in range(24)]
    rout = [bm.verts.new((math.cos(TAU * i / 24) * .0378, math.sin(TAU * i / 24) * .0378, .0049)) for i in range(24)]
    for i in range(24):
        j = (i + 1) % 24
        bm.faces.new((rin[i], rout[i], rout[j], rin[j]))
    parts.append(from_bmesh('Ring', bm, ink, flat=True))
    for k in range(4):  # cardinal ticks outside the ring
        a = math.pi / 2 + TAU * k / 4
        parts.append(box('Tick', (.0028, .006, .0012), (math.cos(a) * .0396, math.sin(a) * .0396, .0052),
                         red if k == 0 else ink, bevel=0, rot=(0, 0, a - math.pi / 2)))
    # the star needle and its pivot jewel
    pts = star_outline(.0135, .0058)
    pts[0] = (0.0, .0315)
    needle = [extrude('Needle star', pts, .0028, starm, bevel=0.0, plane='XY', loc=(0, 0, .0086)),
              cyl('Pivot', .0032, .003, (0, 0, .0112), red, verts=8)]
    # crown and bow
    parts.append(cyl('Stem', .0038, .012, (0, .0548, 0), brass, verts=8, rot=(math.pi / 2, 0, 0)))
    parts.append(cyl('Crown', .0068, .007, (0, .0625, 0), brass, verts=10, rot=(math.pi / 2, 0, 0)))
    parts.append(torus('Bow', .0125, .0027, (0, .0768, 0), brass, maj=16, mn=4))
    # the hunter lid, opened like a locket on its left hinge, an engraved star inside
    lid_prof = [(0, .0152), (.028, .0142), (.043, .0112), (.0502, .0062), (.0506, .0026), (.0455, .0024), (0, .0044)]
    lid = [lathe('Lid', lid_prof, brass, seg=24, smooth_angle=50),
           extrude('Lid star', star_outline(.021, .0092), .002, starm, bevel=0.0, plane='XY', loc=(0, 0, .0023),
                   rot=(0, math.pi, 0))]
    lid.append(torus('Lid ring', .033, .0012, (0, 0, .0034), starm, maj=24, mn=3))
    place(lid, about((-.0512, 0, .0042), (0, 1, 0), math.radians(160)))
    parts.append(cyl('Hinge', .0036, .013, (-.0512, 0, .0042), brass, verts=8, rot=(math.pi / 2, 0, 0)))
    parts += lid
    up = Matrix.Rotation(math.pi / 2, 4, 'X')
    place(parts + needle, up)
    c = recentre(parts + needle)
    nd = pivot_mesh('Needle', needle, up @ Vector((0, 0, .0086)) - c)
    dc = up @ Vector((0, 0, .0045)) - c
    print('star-compass', tri_count(parts + [nd]))

    def tints():
        up_light(mats_of(parts, brass), .74)
        tint(mats_of(parts, dial_m), lambda p, n, f: .86 + .14 * smoothstep(.045, .0, (p - dc).length))
    return finish_prop('star-compass', parts, 'Star compass', keep=[nd], ground=None, dist=.04, strength=.5,
                       tints=tints)


# ================================================================ STAR-TREE


def build_star_tree():
    """The star-tree grown from the golden acorn, 3 m: a slender young trunk with a gentle S-curve and root flare,
    five limbs into a full round crown of glowing gold and pale-yellow leaf clusters (`Star leaves`, emissive),
    dotted with small cushioned star blossoms (`Star blossom`)."""
    reset()
    bark = mat('Bark', '#7a4e34', rough=.85)
    leaves = mat('Star leaves', '#ffe474', rough=.5, emit=.42, emit_color='#ffb830')
    bloom = mat('Star blossom', '#fff8dc', rough=.4, emit=1.3, emit_color='#ffe9a6', double=True)
    rng = random.Random(21)
    bark_parts = [BN.make_trunk('Trunk', [(0, 0, -.25), (0, 0, .3), (.06, .02, .75), (-.02, -.01, 1.2),
                                          (.02, 0, 1.62)], .1, .045, bark, sides=9, roots=4, root_amp=.85,
                                root_h=.12, seed=3, rings=10, twist=.3)]
    crown = Vector((.02, 0, 2.14))
    for i in range(5):
        a = TAU * i / 5 + .35 + rng.uniform(-.2, .2)
        s0 = Vector((.0, 0, 1.12 + .09 * i))
        e = crown + Vector((math.cos(a) * .46, math.sin(a) * .46, rng.uniform(-.3, .05)))
        mid = s0.lerp(e, .5) + Vector((0, 0, .1))
        bark_parts.append(BN.make_limb('Limb', [s0, mid, e], .036, .014, bark, sides=5, seed=i, count=6))
    # a big heart cluster ringed by rounded leaf clusters: full and round, lumpy only at the cluster scale
    lobes = [lobe('Leaves', crown + Vector((0, 0, .08)), (.6, .58, .54), leaves, seed=3, subdiv=3, amp=.07, flat=.3)]
    for a, el, s in ((0, .12, .42), (72, .22, .4), (144, .06, .43), (216, .25, .39), (288, .14, .41),
                     (36, -.42, .35), (108, -.48, .33), (180, -.4, .36), (252, -.46, .34), (324, -.44, .35),
                     (20, .78, .37), (200, .72, .35)):
        a = math.radians(a) + rng.uniform(-.15, .15)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el) * .9))
        lobes.append(lobe('Leaves', crown + d * .56, (s, s * rng.uniform(.9, 1.0), s * .88), leaves,
                          seed=rng.randint(0, 999), subdiv=2, amp=.09, flat=.35, rot=rng.uniform(0, TAU)))
    n_stars = 34
    canopy = BN.leafy(lobes, 'Star leaves', leaves, voxel=.05,
                      target=4000 - tri_count(bark_parts) - n_stars * 10 - 40,
                      cells=.36, cell_amp=.07, crease=.5, seed=9, smooth=5)
    dirs = BN.fib_dirs(120, -.45, 1.0, seed=5)
    rng2 = random.Random(8)
    rng2.shuffle(dirs)
    spots = BN.surface_points(canopy, dirs, crown, offset=0.0)
    stars, used = [], []
    for p, n in spots:
        if len(stars) >= n_stars:
            break
        if any((p - q).length < .3 for q in used):
            continue
        used.append(p)
        stars.append(puffy_star('Star blossom', p + n * .014, n, rng2.uniform(.06, .082), bloom,
                                spin=rng2.uniform(0, TAU)))
    parts = bark_parts + [canopy] + stars
    bake_ao(parts, rays=48, distance=.9, strength=.62, ground=0.0, min_value=.3)
    zs = [(canopy.matrix_world @ Vector(cc)).z for cc in canopy.bound_box]
    lo_z, hi_z = min(zs), max(zs)

    def gold(p, n, f):
        t = smoothstep(lo_z + .05, hi_z - .15, p.z)
        k = .88 + .12 * max(0.0, n.z)
        return (k, k * lerp(.64, 1.0, t), k * lerp(.26, .95, t))
    tint(canopy, gold)
    cell_tint(canopy, crease_dark=.26, spread=.1, hue=.04, crease_rgb=(1.0, .76, .5))
    BN.bark_tint(bark_parts, lo_z, moss=.1)
    print('star-tree', tri_count(parts))
    return finish('star-tree', parts, 'Star tree')


# ================================================================ GIFTS (Sora's cottage)


def build_gift_lure():
    """Rin's lucky fishing lure on its shop card, 0.2 m tall: a teal card with a white wave band and a red seal,
    leaning back on a card strut; a red-and-gold minnow plug with a big eye, a silver diving lip and two hooks, tied
    on with thread; a red lucky tassel with a gold bead hanging from the corner."""
    reset()
    teal = mat('Card teal', '#1fa5a0', rough=.8)
    paper = mat('Paper', '#f4ead0', rough=.8)
    paint = mat('Lure paint', '#ffd23a', rough=.3)
    red = mat('Red', '#d8342c', rough=.5)
    silver = mat('Silver', '#cfd3da', rough=.22, metal=.9)
    ink = mat('Ink', '#1d2430', rough=.3)
    parts = [box('Card', (.15, .006, .2), (0, 0, .1), teal, bevel=.002, segments=1),
             box('Panel', (.126, .002, .14), (0, -.0035, .12), paper, bevel=0)]
    for k in range(5):  # seigaiha wave crests along the bottom band
        cx = -.056 + k * .028
        bm = bmesh.new()
        c0 = bm.verts.new((cx, -.0036, .012))
        arc = [bm.verts.new((cx + math.cos(math.pi * i / 6) * .013, -.0036, .012 + math.sin(math.pi * i / 6) * .013))
               for i in range(7)]
        for i in range(6):
            fw = bm.faces.new((c0, arc[i + 1], arc[i]))
            fw.normal_update()
            if fw.normal.y > 0:
                fw.normal_flip()
        parts.append(from_bmesh('Wave', bm, paper, flat=True))
    parts.append(box('Seal', (.02, .002, .02), (.042, -.005, .172), red, bevel=0))
    parts.append(star_plate('Seal star', .0075, .0032, .0015, paint, (.042, -.0065, .172)))
    # the lure, tilted up to the right across the panel
    ang = math.radians(24)
    ax = Vector((math.cos(ang), 0, math.sin(ang)))
    dors = Vector((-math.sin(ang), 0, math.cos(ang)))
    lc = Vector((0, -.018, .112))
    prof = [(0, -.052), (.006, -.048), (.011, -.036), (.0148, -.017), (.016, .004), (.0145, .024), (.0112, .039),
            (.0065, .048), (0, .052)]
    body = lathe('Lure', prof, paint, seg=10, smooth_angle=80)
    body.data.transform(Matrix.Diagonal((1, .72, 1, 1)))
    place(body, Matrix.Translation(lc) @ Matrix.Rotation(math.radians(90) - ang, 4, 'Y'))
    parts.append(body)
    nose = lc + ax * .052
    tailp = lc - ax * .052
    eye = lc + ax * .033 + dors * .003 + Vector((0, -.0098, 0))
    parts.append(sphere('Eye', (.0058, .003, .0058), eye, paper, seg=8, rings=4))
    parts.append(sphere('Pupil', (.0031, .002, .0031), eye + Vector((0, -.0022, 0)) + ax * .0008, ink, seg=6, rings=4))
    parts.append(box('Lip', (.016, .0015, .012), nose + ax * .005 - dors * .008, silver, bevel=0,
                     rot=(0, -ang + math.radians(40), 0)))
    parts.append(ring_rod('Tie ring', nose + ax * .004 + dors * .004, .0032, .0009, silver, axis=(0, 1, 0), maj=6, mn=3))
    for t_ in (.004, -.05):  # belly hanger and tail hanger, each with a hook
        at = lc + ax * t_ - dors * (.017 if t_ > 0 else 0) - (ax * .004 if t_ < 0 else Vector())
        parts.append(ring_rod('Hook ring', at, .0034, .0009, silver, axis=(0, 1, 0), maj=6, mn=3))
        h0 = at - Vector((0, 0, .0034))
        parts.append(tube('Hook', [h0, h0 + Vector((0, 0, -.017)), h0 + Vector((.003, 0, -.0225)),
                                   h0 + Vector((.0075, 0, -.02)), h0 + Vector((.0085, 0, -.013))], .0011, silver,
                          verts=4))
    for t_ in (-.022, .018):  # thread ties over the body
        parts.append(box('Thread', (.003, .003, .043), lc + ax * t_ + Vector((0, -.0105, 0)), paper, bevel=0,
                         rot=(0, -ang, 0)))
    # the lucky tassel on the top-left corner
    k0 = Vector((-.061, 0, .19))
    parts.append(ring_rod('Cord loop', k0, .0075, .0014, red, axis=(1, 0, 0), maj=8, mn=3))
    parts.append(tube('Cord', [k0 + Vector((-.004, 0, -.006)), k0 + Vector((-.018, -.002, -.025)),
                               k0 + Vector((-.022, -.003, -.05))], .0016, red, verts=4))
    kn = k0 + Vector((-.022, -.003, -.054))
    parts.append(sphere('Bead', .0055, kn, paint, seg=8, rings=4))
    parts.append(lathe('Tassel', [(0, 0), (.004, -.004), (.007, -.02), (.0095, -.036), (0, -.038)], red, seg=8,
                       loc=kn - Vector((0, 0, .005))))
    place(parts, Matrix.Rotation(math.radians(-12), 4, 'X'))
    back = Matrix.Rotation(math.radians(-12), 4, 'X') @ Vector((0, .004, .12))
    parts.append(beam('Strut', back, (0, .072, .002), .026, .004, teal, bevel=.001))
    ground_parts(parts)
    grow(parts, 1.4)
    tilt = Matrix.Rotation(math.radians(-12), 3, 'X')
    lc, dors = (tilt @ lc) * 1.4, tilt @ dors
    print('gift-lure', tri_count(parts))

    def tints():
        def fish(p, n, f):
            d = (p - lc).dot(dors)
            w = smoothstep(-.004, .012, d)
            return (1.0, 1 - .74 * w, 1 - .85 * w)
        tint(body, fish)
        up_light(mats_of(parts, silver), .8)
    return finish_prop('gift-lure', parts, 'Gift lure', ground=0.0, dist=.05, strength=.5, tints=tints)


def build_gift_radish():
    """Ota's jar of pickled radish, 0.17 m: an indigo-glazed crock with a cream drip glaze on the shoulder, the
    mouth covered with washi paper cinched by a red cord and a big bow, and a paper label drawn with three bright
    yellow takuan slices, brush strokes and a red stamp."""
    reset()
    glaze = mat('Indigo glaze', '#2d5aa6', rough=.22)
    cream = mat('Cream glaze', '#efe3c6', rough=.3)
    washi = mat('Washi', '#f7efdc', rough=.85, double=True)
    ribbon = mat('Ribbon', '#d8342c', rough=.45)
    prof = [(0, .005), (.05, .005), (.055, 0), (.063, .011), (.074, .045), (.077, .075), (.07, .105), (.057, .126),
            (.05, .136), (.052, .146), (.047, .15)]
    parts = [lathe('Crock', prof, glaze, seg=16, smooth_angle=60)]
    # cream drip glaze over the shoulder
    n = 24
    bm = bmesh.new()
    cols = []
    for i in range(n):
        a = TAU * i / n
        drip = .003 + .022 * max(0.0, math.sin(a * 4 + .6)) ** 3 * (.6 + .4 * math.sin(a * 1.7 + 1))
        zl = .108 - drip
        col = []
        for t in (0, .35, .7, 1):
            z = .128 + (zl - .128) * t
            r = prof_r(prof[3:], z) + .003
            col.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
        cols.append(col)
    for i in range(n):
        j = (i + 1) % n
        for t in range(3):
            bm.faces.new((cols[i][t], cols[i][t + 1], cols[j][t + 1], cols[j][t]))
    outward(bm)
    parts.append(from_bmesh('Drip glaze', bm, cream, smooth_angle=70))
    # washi cap: dome over the mouth, cinched at the neck, pleated hem
    m = 16
    bm = bmesh.new()
    pole = bm.verts.new((0, 0, .1645))
    rows = []
    for i in range(m):
        a = TAU * i / m
        fold = 1 if i % 2 else -1
        ring = [(.03, .1625), (.05, .1575), (.058, .151), (.0555, .141), (.061 + .003 * fold, .123 - .004 * fold)]
        rows.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)) for r, z in ring])
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((pole, rows[i][0], rows[j][0]))
        for k in range(4):
            bm.faces.new((rows[i][k], rows[i][k + 1], rows[j][k + 1], rows[j][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.normal_update()
        cc = f.calc_center_median()
        if f.normal.dot(cc - Vector((0, 0, .11))) < 0:
            f.normal_flip()
    parts.append(from_bmesh('Washi cap', bm, washi, smooth_angle=50))
    parts.append(torus('Cord', .0568, .0028, (0, 0, .141), ribbon, maj=16, mn=3))
    parts += ribbon_bow('Bow', (0, -.059, .141), ribbon, span=.032, h=.022, width=.0105, thick=.0018, tail=.036)
    # the label and its drawing
    lab = wrap_panel('Label', prof[3:], math.radians(-117), math.radians(-57), .042, .09, washi, nu=4, nz=4,
                     lift=.003)
    parts.append(lab)
    yellow, inkd = [], []
    for k, (da, z) in enumerate(((-12, .073), (0, .067), (12, .061))):
        yellow.append(wrap_poly('Takuan', prof[3:], ellipse_az(prof[3:], math.radians(-95 + da), z, .0165, .0155, n=8),
                                washi, lift=.0052))
    for k in range(3):
        a = math.radians(-74 + k * 4)
        inkd.append(wrap_poly('Brush', prof[3:], [(a - .012, .056), (a + .012, .056), (a + .01, .083 - k * .004),
                                                  (a - .014, .083 - k * .004)], washi, lift=.0052))
    stamp = wrap_poly('Stamp', prof[3:], [(math.radians(-66), .046), (math.radians(-61), .046),
                                          (math.radians(-61), .053), (math.radians(-66), .053)], washi, lift=.0052)
    parts += yellow + inkd + [stamp]
    grow(parts, 1.15)
    print('gift-radish', tri_count(parts))

    def tints():
        tint(parts[0], lambda p, n, f: .72 + .28 * smoothstep(.0, .1, p.z))
        paint(yellow, factor('#f5c234', '#f7efdc'))
        paint(inkd, factor('#3a2418', '#f7efdc'))
        paint(stamp, factor('#d8342c', '#f7efdc'))
    return finish_prop('gift-radish', parts, 'Gift radish', ground=0.0, dist=.06, strength=.55, tints=tints)


def bun_lathe(name, c, r, material, tilt=(0, 0), yaw=0.0):
    """Peach bun (momo manju): plump round base rising to a pointed tip."""
    prof = [(0, 0), (.72 * r, 0), (.97 * r, .22 * r), (r, .48 * r), (.88 * r, .8 * r), (.6 * r, 1.06 * r),
            (.28 * r, 1.3 * r), (.07 * r, 1.45 * r), (0, 1.5 * r)]
    ob = lathe(name, prof, material, seg=9, smooth_angle=80)
    m = M4(c, (tilt[0], tilt[1], yaw))
    place(ob, m)
    ob['bun'] = [*Vector(c), *(m.to_3x3() @ Vector((0, 0, 1))), r]
    return ob


def build_gift_buns():
    """Hana's basket of peach buns, 0.24 m: a round woven wicker basket with a twisted rim and a tall handle tied
    with a rose bow, three snowy peach buns with rosy pointed tips and a pair of leaves peeking out, and the back
    half under a rose gingham cloth whose corners fold over the rim."""
    reset()
    wick = mat('Wicker', '#caa062', rough=.8)
    dough = mat('Bun', '#fbf1e2', rough=.55)
    cloth = mat('Gingham', '#f8f2e6', rough=.8, double=True)
    leafm = mat('Bun leaf', '#5aa632', rough=.6, double=True)
    basket, course = woven_basket('Basket', wick)
    parts = [basket, torus('Rim', .109, .0068, (0, 0, .089), wick, maj=18, mn=3)]
    hp = [Vector((math.cos(math.pi * k / 9) * .104, 0, .088 + .118 * math.sin(math.pi * k / 9))) for k in range(10)]
    handle = tube('Handle', hp, .0066, wick, verts=6)
    parts.append(handle)
    buns = [bun_lathe('Bun', (-.037, -.04, .057), .04, dough, tilt=(.28, -.3)),
            bun_lathe('Bun', (.038, -.034, .058), .039, dough, tilt=(.24, .32), yaw=.5),
            bun_lathe('Bun', (-.002, .014, .066), .041, dough, tilt=(-.05, .05))]
    parts += buns
    tipm = M4((-.037, -.04, .057), (.28, -.3, 0))
    tip = tipm @ Vector((0, 0, .058))
    for s in (-1, 1):
        parts.append(blade('Bun leaf', tip + Vector((0, -.005, -.006)), (s * .8, -.7, .1), .032, .015, leafm, bend=.2,
                           segs=3, fold=.25))

    def drape(u, v):
        x = u * .138
        y = lerp(-.004, .17, (v + 1) / 2)
        r = math.hypot(x, y)
        if r <= .104:
            z = .101 + .018 * math.sqrt(max(0.0, 1 - (r / .104) ** 2)) + \
                .012 * math.exp(-((x + .002) ** 2 + (y - .014) ** 2) / .0012)
            return (x, y, z)
        d = r - .104
        rr = .114 + d * .1 + .006 * math.sin(u * 15 + v * 4)
        z = max(.1 - d * 1.8 + .007 * math.sin(u * 9 + v * 5), .045)
        return (x / r * rr, y / r * rr, z)
    cl = BP.grid_sheet('Cloth', 10, 7, .276, .174, drape, cloth)
    parts.append(cl)
    hem_pts = [Vector(drape(-1 + 2 * k / 10, -1)) + Vector((0, -.002, .003)) for k in range(11)]
    hem = tube('Hem', hem_pts, .0048, cloth, verts=4)
    parts.append(hem)
    bow = ribbon_bow('Bow', (-.062, -.004, .183), cloth, span=.026, h=.018, width=.009, thick=.0016, tail=.03)
    parts += bow
    print('gift-buns', tri_count(parts))
    rose = factor('#e0567a', '#f8f2e6')
    mid = tuple((1 + rose[i]) / 2 for i in range(3))

    def tints():
        def weave(p, n, f):
            fc = f.center
            if f.normal.z > .7 or fc.z > .089:
                return .9
            j = int(math.floor((fc.z - .006) / course))
            i = int(math.floor((math.atan2(fc.y, fc.x) + math.pi) / (TAU / 18)))
            return (.98, .96, .92) if (i + j) % 2 else (.8, .74, .66)
        tint(basket, weave)
        tint(handle, lambda p, n, f: .78 + .22 * (.5 + .5 * math.sin(math.atan2(p.z - .088, p.x) * 24 +
                                                                        math.atan2(n.y, n.z) * 2)))

        def blush(ob):
            b = list(ob['bun'])
            c, ax, r = Vector(b[:3]), Vector(b[3:6]), b[6]

            def fn(p, n, f):
                w = smoothstep(.5 * r, 1.42 * r, (p - c).dot(ax))
                return (1.0, 1 - .6 * w, 1 - .48 * w)
            tint(ob, fn)
        for b in buns:
            blush(b)

        def gingham(p, n, f):
            i, j = f.index % 10, f.index // 10
            a, b = i % 2, j % 2
            return rose if (a and b) else mid if (a or b) else 1.0
        tint(cl, gingham)
        paint([hem] + bow, rose)
    return finish_prop('gift-buns', parts, 'Gift buns', ground=0.0, dist=.06, strength=.55, tints=tints)


def build_gift_cap():
    """Genzo's old conductor's cap, 0.26 m: a navy wool crown flaring to a wide flat top with red piping, a dark
    band, a glossy black peak, a gold braid chin cord between two gold buttons, and the Hoshi Railway badge: a
    gold winged star on a red enamel disc."""
    reset()
    navy = mat('Navy wool', '#3a5a92', rough=.78)
    peak = mat('Peak', '#1d2430', rough=.16)
    gold = mat('Gold', '#e2b347', rough=.28, metal=.88)
    red = mat('Red piping', '#d8342c', rough=.5)
    sy = 1.08
    prof = [(0, .003), (.088, .003), (.0915, .006), (.0925, .042), (.0945, .048), (.107, .075), (.118, .097),
            (.1175, .1045), (.1, .1105), (.05, .1118), (0, .112)]
    crown = lathe('Crown', prof, navy, seg=24, smooth_angle=45)
    crown.data.transform(Matrix.Diagonal((1, sy, 1, 1)))
    parts = [crown]
    pip = torus('Piping', .1182, .0028, (0, 0, .1006), red, maj=24, mn=3)
    pip.data.transform(Matrix.Diagonal((1, sy, 1, 1)))
    parts.append(pip)
    # the peak: a drooping crescent in front of the band
    bm = bmesh.new()
    T_o, T_i, B_o, B_i = [], [], [], []
    for k in range(11):
        a = math.radians(lerp(-162, -18, k / 10))
        ca, sa = math.cos(a), math.sin(a)
        reach = math.sin(math.pi * k / 10)
        po = Vector((ca * (.093 + .014 * reach), sa * (.093 * sy + .05 * reach), .004 + .006 * (1 - reach)))
        pi_ = Vector((ca * .09, sa * .09 * sy, .012))
        T_o.append(bm.verts.new(po))
        T_i.append(bm.verts.new(pi_))
        B_o.append(bm.verts.new(po - Vector((0, 0, .0035))))
        B_i.append(bm.verts.new(pi_ - Vector((0, 0, .0035))))
    for k in range(10):
        bm.faces.new((T_i[k], T_o[k], T_o[k + 1], T_i[k + 1]))
        bm.faces.new((B_i[k + 1], B_o[k + 1], B_o[k], B_i[k]))
        bm.faces.new((T_o[k], B_o[k], B_o[k + 1], T_o[k + 1]))
        bm.faces.new((T_i[k + 1], B_i[k + 1], B_i[k], T_i[k]))
    bm.faces.new((T_i[0], B_i[0], B_o[0], T_o[0]))
    bm.faces.new((T_o[10], B_o[10], B_i[10], T_i[10]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    parts.append(from_bmesh('Peak', bm, peak, smooth_angle=40))
    # gold braid chin cord and its buttons
    cord = []
    for k in range(9):
        a = math.radians(lerp(-156, -24, k / 8))
        cord.append(Vector((math.cos(a) * .0962, math.sin(a) * .0962 * sy, .027 + .003 * math.sin(math.pi * k / 8))))
    parts.append(tube('Chin cord', cord, .0029, gold, verts=5))
    for a in (-160, -20):
        a = math.radians(a)
        nrm = Vector((math.cos(a), math.sin(a) * sy, 0)).normalized()
        c = Vector((math.cos(a) * .0925, math.sin(a) * .0925 * sy, .027))
        parts.append(lathe('Button', [(0, .0045), (.0042, .0034), (.0062, .0006), (.0058, 0), (0, 0)], gold, seg=8,
                           smooth_angle=60))
        place(parts[-1], Matrix.Translation(c) @ Vector((0, 0, 1)).rotation_difference(nrm).to_matrix().to_4x4())
    # the badge: a red enamel disc, a gold star and gold wings
    bnorm = Vector((0, -.92, .39)).normalized()
    bc = Vector((0, -.1115 * sy + .0015, .07))
    badge = [cyl('Badge disc', .0155, .002, (0, 0, 0), red, verts=14, rot=(math.pi / 2, 0, 0)),
             star_plate('Badge star', .0195, .0083, .003, gold, (0, -.0022, 0))]
    wing = [(u * 1.3, v * 1.3) for u, v in ((.011, .002), (.022, .0075), (.036, .0115), (.031, .0055), (.039, .0035),
                                           (.031, -.0005), (.035, -.0045), (.013, -.0045))]
    for s in (-1, 1):
        pts = [(s * u, v) for u, v in wing]
        if s < 0:
            pts.reverse()
        badge.append(extrude('Wing', pts, .0022, gold, bevel=0.0, loc=(0, -.0016, .0005)))
    q = Vector((0, -1, 0)).rotation_difference(bnorm).to_matrix().to_4x4()
    place(badge, Matrix.Translation(bc) @ q)
    parts += badge
    print('gift-cap', tri_count(parts))

    def tints():
        def wool(p, n, f):
            k = .5 if p.z < .046 else .8 + .2 * smoothstep(.07, .11, p.z)
            k *= .94 + .06 * noise.noise(p * 60)
            return k
        tint(crown, wool)
        up_light(mats_of(parts, gold), .75)
        tint(mats_of(parts, peak), lambda p, n, f: .7 + .3 * max(0.0, n.z))
    return finish_prop('gift-cap', parts, 'Gift cap', ground=0.0, dist=.07, strength=.55, tints=tints)


def maple_leaf(name, base, axis_angle, L, material, curl=.2):
    """Seven-lobed Japanese maple leaf lying flat (z up) from `base`, main lobe along axis_angle; lobes curl up."""
    lobes = [(-120, .42), (-78, .7), (-39, .9), (0, 1.0), (39, .9), (78, .7), (120, .42)]
    base = Vector(base)
    bm = bmesh.new()

    def P(ang, rad, lift=0.0):
        a = math.radians(ang) + axis_angle
        x, y = math.cos(a) * rad, math.sin(a) * rad
        return base + Vector((x, y, curl * L * (rad / L) ** 2 + lift))
    C = bm.verts.new(base + Vector((0, 0, .002)))
    valleys = [bm.verts.new(P(-150, .12 * L))]
    for (a0, l0), (a1, l1) in zip(lobes, lobes[1:]):
        valleys.append(bm.verts.new(P((a0 + a1) / 2, .4 * L * min(l0, l1), -.001)))
    valleys.append(bm.verts.new(P(150, .12 * L)))
    for i, (a, l) in enumerate(lobes):
        T = bm.verts.new(P(a, l * L))
        Mv = bm.verts.new(P(a, .5 * l * L, .003))
        SL = bm.verts.new(P(a - 17 * (1.25 - l * .4), .6 * l * L))
        SR = bm.verts.new(P(a + 17 * (1.25 - l * .4), .6 * l * L))
        V0, V1 = valleys[i], valleys[i + 1]
        for tri in ((C, V0, Mv), (V0, SL, Mv), (SL, T, Mv), (Mv, T, SR), (Mv, SR, V1), (C, Mv, V1)):
            bm.faces.new(tri)
    bm.faces.new((C, valleys[-1], valleys[0]))
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return from_bmesh(name, bm, material, smooth_angle=35)


def build_gift_pinecone():
    """Kon the fox's gift, 0.2 m: a plump open pine cone of overlapping blunt scales in Fibonacci spirals, lying on
    a red-gold Japanese maple leaf with a sprig of pine needles, all tied with red string and a little bow."""
    reset()
    conem = mat('Pine cone', '#8d5a36', rough=.78)
    maple = mat('Maple leaf', '#ffb13a', rough=.55, double=True)
    string = mat('Red string', '#d02c28', rough=.6)
    needles = mat('Pine needles', '#4f9a3a', rough=.6, double=True)
    core_prof = [(0, -.004), (.012, 0), (.019, .022), (.019, .05), (.015, .078), (.008, .098), (0, .106)]
    cone = [lathe('Core', core_prof, conem, seg=8, smooth_angle=70)]
    ga = math.radians(137.508)
    n = 44
    for k in range(n):
        t = (k + .5) / n
        z = .004 + t * .096
        a = k * ga
        radial = Vector((math.cos(a), math.sin(a), 0))
        tang = Vector((-math.sin(a), math.cos(a), 0))
        L_ = .021 * (1 - .5 * t) + .005
        w_ = .021 * (1 - .42 * t) + .0055
        dirv = (radial * .78 + Vector((0, 0, -.62 + 1.05 * t))).normalized()
        thin = dirv.cross(tang).normalized()
        base = Vector((0, 0, z)) + radial * prof_r(core_prof, z) * .82
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4, radius1=w_ / 2, radius2=w_ * .3,
                              depth=L_)
        for v in bm.verts:
            v.co = Vector((v.co.x, v.co.y * .5, v.co.z + L_ / 2))
        rotm = Matrix((tang, thin, dirv)).transposed().to_4x4()
        bm.transform(Matrix.Translation(base) @ rotm @ Matrix.Rotation(math.pi / 4, 4, 'Z'))
        cone.append(from_bmesh('Scale', bm, conem, smooth_angle=50))
    lay = Matrix.Translation((-.05, -.004, .036)) @ Matrix.Rotation(math.radians(82), 4, 'Y')
    place(cone, lay)
    c0 = Vector((-.012, -.002, .003))
    leaf = maple_leaf('Maple leaf', c0, math.radians(-58), .108, maple, curl=.24)
    parts = cone + [leaf]
    stem = tube('Leaf stem', [c0 + Vector((0, 0, .001)), c0 + Vector((-.014, .018, .003))], .0019, maple, verts=4)
    parts.append(stem)
    nd = []
    nroot = Vector((.03, .016, .007))
    for k in range(5):
        a = math.radians(8 + k * 13)
        nd.append(blade('Needle', nroot, (math.cos(a), math.sin(a), .1), .085, .0065, needles, bend=.06, segs=2,
                        fold=.25))
    parts += nd
    loop = []
    for i in range(14):
        th = TAU * i / 14
        s_, c_ = math.sin(th), math.cos(th)
        loop.append(Vector((.004 + .003 * s_, .04 * c_, .036 + (.036 if s_ > 0 else .033) * s_)))
    parts.append(tube('String', loop, .0022, string, verts=4, closed=True, caps=False))
    parts += ribbon_bow('Bow', (.0065, -.004, .075), string, span=.026, h=.017, width=.006, thick=.0017, tail=.027,
                        tilt=math.radians(-35))
    ground_parts(parts)
    k = 1.4
    grow(parts, k)
    c0, nroot, lay = c0 * k, nroot * k, Matrix.Scale(k, 4) @ lay
    print('gift-pinecone', tri_count(parts))

    def tints():
        axis_o = lay @ Vector((0, 0, 0))
        axis_d = (lay.to_3x3() @ Vector((0, 0, 1))).normalized()

        def scales(p, n, f):
            q = p - axis_o
            d = (q - axis_d * q.dot(axis_d)).length
            w = smoothstep(.014, .034, d)
            return (.62 + .38 * w, .58 + .42 * w, .56 + .36 * w)
        tint(cone, scales)
        tint(leaf, lambda p, n, f: (1.0, 1 - .74 * smoothstep(.014, .075, (p - c0).length),
                                    1 - .72 * smoothstep(.014, .075, (p - c0).length)))
        paint(stem, factor('#9a2a1a', '#ffb13a'))
        tint(nd, lambda p, n, f: .72 + .28 * smoothstep(.0, .07, (p - nroot).length))
    return finish_prop('gift-pinecone', parts, 'Gift pinecone', ground=0.0, dist=.05, strength=.55, tints=tints)


def honey_drip(name, prof, a, z0, L, w0, w1, material, lift=.0022, th=.0055, n=3):
    """A run of honey flowing down a lathe surface at angle a: a flat oval ribbon narrowing from w0 to w1, ending
    in a fat drop."""
    radial = Vector((math.cos(a), math.sin(a), 0))
    tang = Vector((-math.sin(a), math.cos(a), 0))
    sec = [(.5, 0), (.25, .5), (-.25, .5), (-.5, 0), (-.25, -.5), (.25, -.5)]
    bm = bmesh.new()
    rings = []
    for i in range(n + 1):
        t = i / n
        z = z0 - L * t
        c = Vector((0, 0, z)) + radial * (prof_r(prof, z) + lift)
        w, h = lerp(w0, w1, t ** .7), th * (1 - .2 * t)
        rings.append([bm.verts.new(c + tang * (u * w) + radial * (v * h)) for u, v in sec])
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(6):
            k = (j + 1) % 6
            bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    run = from_bmesh(name, bm, material, smooth_angle=80)
    e = Vector((0, 0, z0 - L - .004))
    e += radial * (prof_r(prof, z0 - L - .004) + lift + .001)
    drop = sphere(name, (w1 * .72, w1 * .72, w1 * .95), e, material, seg=6, rings=4)
    drop.rotation_euler = (0, 0, a)
    return [run, drop]


def build_gift_honey():
    """Okuma the bear's honey pot, 0.24 m: a round terracotta pot glazed with a big brown bear paw print, a lid with
    a knob and a notch for the wooden dipper, and golden honey oozing from under the lid and running down in fat
    drips."""
    reset()
    clay = mat('Clay', '#c4582e', rough=.62)
    pawm = mat('Paw glaze', '#5e3020', rough=.35)
    honey = mat('Honey', '#ffb21e', rough=.06)
    wood = mat('Dipper wood', '#c08a50', rough=.7)
    prof = [(0, .005), (.06, .005), (.066, 0), (.086, .035), (.096, .07), (.092, .1), (.078, .126), (.065, .141),
            (.069, .152), (.064, .158), (.056, .158)]
    parts = [lathe('Pot', prof, clay, seg=16, smooth_angle=55)]
    body = prof[2:]
    zc, ac = .06, -math.pi / 2 - .08
    paw = [wrap_poly('Paw', body, ellipse_az(body, ac, zc, .05, .038, n=10, squash_top=.78), pawm, lift=.003)]
    for du, dz in ((-.03, .029), (-.0108, .041), (.0108, .041), (.03, .029)):
        r = prof_r(body, zc + dz)
        paw.append(wrap_poly('Toe', body, ellipse_az(body, ac + du / r, zc + dz, .0155, .018, n=8), pawm, lift=.003))
    parts += paw
    lid_prof = [(0, .1845), (.0105, .1825), (.0095, .1735), (.036, .1685), (.062, .1615), (.0745, .1555),
                (.0705, .1515), (0, .1525)]
    parts.append(lathe('Lid', lid_prof, clay, seg=16, smooth_angle=55))
    parts.append(torus('Ooze', .0712, .0066, (0, 0, .151), honey, maj=16, mn=3))
    for a, L_ in ((-122, .028), (-99, .044), (-74, .02), (-42, .034), (150, .03)):
        parts += honey_drip('Drip', prof[4:], math.radians(a), .153, L_, .016, .009, honey)
    parts.append(sphere('Blob', (.017, .014, .006), (.03, .024, .1705), honey, seg=8, rings=4))
    da = math.radians(40)
    d0 = Vector((math.cos(da) * .052, math.sin(da) * .052, .135))
    d1 = Vector((math.cos(da) * .098, math.sin(da) * .098, .245))
    parts.append(rod('Dipper', d0, d1, .0055, wood, verts=6))
    parts.append(sphere('Dipper end', .0082, d1, wood, seg=8, rings=4))
    print('gift-honey', tri_count(parts))

    def tints():
        tint(mats_of(parts, clay), lambda p, n, f: (.8 + .2 * smoothstep(0, .12, p.z)) * (.95 + .05 * noise.noise(p * 70)))
        tint(mats_of(parts, honey), lambda p, n, f: (1.0, .84 + .16 * max(0.0, n.z), .62 + .38 * max(0.0, n.z)))
    return finish_prop('gift-honey', parts, 'Gift honey', ground=0.0, dist=.07, strength=.55, tints=tints)


def woven_basket(name, material, r0=.076, r1=.111, h=.088, seg=18, rows=8, floor=.06):
    """Round basket: flared wall of `rows` weave courses (each face is one over/under patch), an inner wall and
    floor. Returns the object and the course height."""
    bm = bmesh.new()
    rings = []
    for j in range(rows + 1):
        t = j / rows
        z = .006 + (h - .006) * t
        r = r0 + (r1 - r0) * t ** .8
        rings.append([bm.verts.new((math.cos(TAU * i / seg) * r, math.sin(TAU * i / seg) * r, z)) for i in range(seg)])
    bot = [bm.verts.new((math.cos(TAU * i / seg) * (r0 - .006), math.sin(TAU * i / seg) * (r0 - .006), 0))
           for i in range(seg)]
    inner = [bm.verts.new((math.cos(TAU * i / seg) * (r1 - .008), math.sin(TAU * i / seg) * (r1 - .008), h - .002))
             for i in range(seg)]
    low = [bm.verts.new((math.cos(TAU * i / seg) * (r1 - .02), math.sin(TAU * i / seg) * (r1 - .02), floor))
           for i in range(seg)]
    c_bot, c_in = bm.verts.new((0, 0, 0)), bm.verts.new((0, 0, floor))
    for i in range(seg):
        k = (i + 1) % seg
        bm.faces.new((c_bot, bot[k], bot[i]))
        bm.faces.new((bot[i], bot[k], rings[0][k], rings[0][i]))
        for j in range(rows):
            bm.faces.new((rings[j][i], rings[j][k], rings[j + 1][k], rings[j + 1][i]))
        bm.faces.new((rings[rows][i], rings[rows][k], inner[k], inner[i]))
        bm.faces.new((inner[i], inner[k], low[k], low[i]))
        bm.faces.new((low[i], low[k], c_in))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm, material, smooth_angle=60), (h - .006) / rows


# ================================================================ registry

BUILDERS = {
    'music-box': build_music_box,
    'golden-acorn': build_golden_acorn,
    'star-compass': build_star_compass,
    'star-tree': build_star_tree,
    'gift-lure': build_gift_lure,
    'gift-radish': build_gift_radish,
    'gift-buns': build_gift_buns,
    'gift-cap': build_gift_cap,
    'gift-pinecone': build_gift_pinecone,
    'gift-honey': build_gift_honey,
}

if __name__ == '__main__':
    names, full = parse_only(list(BUILDERS))
    results = []
    for n in names:
        print('BUILD', n)
        results.append((n, BUILDERS[n]()))
    report(results)
    if full:
        save_kit('rewards', list(BUILDERS), spacing=.5)
