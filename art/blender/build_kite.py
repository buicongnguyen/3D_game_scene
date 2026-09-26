"""Sora's Star Kite: the wind-up flying machine Mika's grandmother flew over the valley to check the
relay lamps. One model, `star-kite`, ~1.8 m across.

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_kite.py

Design (Blender Z-up, faces -Y, metres):
  * A bowed diamond kite canopy of vermilion paper with cream piping, cream ribs over its bamboo
    spars and a big gold star painted in the middle; a paper-bow tail streams from the back point.
  * A brass star-lantern stands on the canopy centre: an open cage around a faceted glowing star
    (`Core`, material `Kite glow`) with a glowing star finial on its cap.
  * Under the canopy a brass spring drum (the wind-up mechanism, with a butterfly key at the back)
    carries four red-lacquered arms to four brass-ducted rotors with cream paper blades, sitting in
    the diamond's notches so they read from above.
  * A brass control triangle hangs from the drum down to the wooden handle bar with red grips that
    Mika holds with both hands, in front of her forehead.

Nodes (runtime contract, art/CONTRACTS.md):
  Handle    empty at the origin = centre of the handle bar (where Mika's hands go).
  Rotor_1..4  rotor pivots on the hubs, identity rest rotation, spin about local Z (three.js +Y).
            1 front-left (+X,-Y), 2 front-right (-X,-Y), 3 rear-left (+X,+Y), 4 rear-right (-X,+Y).
  Canopy    the paper sail + spars, pivot at the canopy centre (the runtime flutters it); the tail
            chain Tail_1 > Tail_2 > Tail_3 hangs from its back point (pivots at each segment root).
  Core      the glowing star inside the lantern, pivot at its centre (the runtime spins it).
  Key       the wind-up key, pivot on its shaft (Blender +Y = three.js -Z).
Outputs public/models/star-kite.glb and art/blender/source/kite.blend.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from np_kit import *  # noqa: F401,F403
from build_props import M, ring_rod, star_outline, up_light, grain

NAME = 'star-kite'

# ---------------------------------------------------------------- layout

NOSE, TAIL, WING = V(0, -0.6, 0), V(0, 1.15, 0), V(0.82, 0.0, 0)
PAPER_T = 0.012            # canopy thickness
BAR_HALF = 0.43            # handle bar half-length
DRUM_Z = (0.56, 0.71)      # spring drum under the canopy
ROTOR_XY = (0.64, 0.56)    # rotor hubs sit on the diagonals, in the diamond's notches
ROTOR_Z = 0.72
DUCT_R = 0.25
BLADE_R = 0.215


def canopy_z(x, y):
    """Top surface height: dihedral bow (spine high), nose-up pitch and a paper billow between spars."""
    half_w = WING.x
    bow = 0.12 * (1 - (x / half_w) ** 2)
    pitch = 0.09 * (-y)
    d = diamond_norm(x, y)
    billow = 0.036 * smoothstep(0.0, 0.26, abs(x)) * smoothstep(0.0, 0.2, abs(y)) * (1 - smoothstep(0.5, 1.0, d))
    return 0.78 + bow + pitch + billow


def diamond_norm(x, y):
    """0 at the centre, 1 on the diamond outline."""
    ly = -NOSE.y if y < 0 else TAIL.y
    return abs(x) / WING.x + abs(y) / ly


def surf(x, y, lift=0.0):
    return V(x, y, canopy_z(x, y) + lift)


def bilinear(u, v):
    # N at (0,0), L wing at (1,0), T at (1,1), R wing at (0,1)
    L, R = WING, V(-WING.x, WING.y, 0)
    p = NOSE * ((1 - u) * (1 - v)) + L * (u * (1 - v)) + TAIL * (u * v) + R * ((1 - u) * v)
    return p.x, p.y


# ---------------------------------------------------------------- parts

def canopy_sheet(mat_paper, n=12):
    """Closed paper slab over the diamond: top surface on canopy_z, bottom PAPER_T below."""
    bm = bmesh.new()
    top, bot = {}, {}
    for i in range(n + 1):
        for j in range(n + 1):
            x, y = bilinear(i / n, j / n)
            p = surf(x, y)
            top[i, j] = bm.verts.new(p)
            bot[i, j] = bm.verts.new(p - V(0, 0, PAPER_T))
    for i in range(n):
        for j in range(n):
            bm.faces.new((top[i, j], top[i + 1, j], top[i + 1, j + 1], top[i, j + 1]))
            bm.faces.new((bot[i, j + 1], bot[i + 1, j + 1], bot[i + 1, j], bot[i, j]))
    ring = [(i, 0) for i in range(n)] + [(n, j) for j in range(n)] + [(i, n) for i in range(n, 0, -1)] + \
           [(0, j) for j in range(n, 0, -1)]
    for a, b in zip(ring, ring[1:] + ring[:1]):
        bm.faces.new((top[a], bot[a], bot[b], top[b]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh('canopy paper', bm, mat_paper, smooth_angle=50)


def outline_points(per_edge=10, lift=0.0, inset=0.0):
    pts = []
    corners = [NOSE, WING, TAIL, V(-WING.x, WING.y, 0)]
    for a, b in zip(corners, corners[1:] + corners[:1]):
        for k in range(per_edge):
            q = a.lerp(b, k / per_edge)
            q = q * (1 - inset)
            pts.append(surf(q.x, q.y, lift))
    return pts


def border_band(material, inset_k, lift, per_edge=10):
    """A painted band just inside the piping: a strip between the outline and an inset copy."""
    outer = outline_points(per_edge, lift=lift, inset=0.012)
    inner = outline_points(per_edge, lift=lift, inset=1 - inset_k)
    bm = bmesh.new()
    a = [bm.verts.new(p) for p in outer]
    b = [bm.verts.new(p) for p in inner]
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    ob = from_bmesh('border band', bm, material, smooth_angle=60)
    return face_up(ob)


def curve_on(a, b, count, lift):
    return [surf(*(a.lerp(b, k / (count - 1))).to_2d(), lift) for k in range(count)]


def star_decal(mat_star, R, r, lift, rings=3):
    """A five-point star painted on the curved canopy (fan of rings projected onto the surface)."""
    outline = star_outline(R, r, 5, rot=-math.pi / 2)   # first point forward (-Y)
    bm = bmesh.new()
    c = bm.verts.new(surf(0, 0, lift))
    prev = None
    for k in range(1, rings + 1):
        s = k / rings
        cur = [bm.verts.new(surf(x * s, y * s, lift)) for x, y in outline]
        n = len(cur)
        for i in range(n):
            j = (i + 1) % n
            if prev is None:
                bm.faces.new((c, cur[i], cur[j]))
            else:
                bm.faces.new((prev[i], cur[i], cur[j], prev[j]))
        prev = cur
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = from_bmesh('star decal', bm, mat_star, smooth_angle=60)
    face_up(ob)
    return ob, outline


def face_up(ob):
    me = ob.data
    for poly in me.polygons:
        if poly.normal.z < 0:
            poly.flip()
    me.update()
    return ob


def star_gem(name, R, r, depth, material):
    """Faceted star crystal (like the fallen stars): gem facets stepping to a raised table, in XY."""
    outline = star_outline(R, r)
    bm = bmesh.new()

    def ring(scale, z):
        return [bm.verts.new((x * scale, y * scale, z)) for x, y in outline]
    t = [ring(1.0, depth * .25), ring(.62, depth * .75)]
    b = [ring(1.0, -depth * .25), ring(.62, -depth * .75)]
    tc, bc = bm.verts.new((0, 0, depth)), bm.verts.new((0, 0, -depth))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((b[0][i], b[0][j], t[0][j], t[0][i]))
        bm.faces.new((t[0][i], t[0][j], t[1][j], t[1][i]))
        bm.faces.new((b[0][j], b[0][i], b[1][i], b[1][j]))
        bm.faces.new((t[1][i], t[1][j], tc))
        bm.faces.new((b[1][j], b[1][i], bc))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    return from_bmesh(name, bm, material, flat=True)


def place(ob, m):
    """Bake a world transform into a freshly built part."""
    bpy.context.view_layer.update()
    ob.matrix_world = m @ ob.matrix_world
    apply_transform(ob)
    return ob


def blade(name, material, angle, hub, pitch=14):
    """A rounded paper paddle blade from the hub out to BLADE_R, pitched about its long axis."""
    root, tip = 0.028, BLADE_R
    pts = []
    for k in range(4):
        t = k / 3
        x = lerp(root, tip - 0.035, t)
        w = lerp(0.014, 0.036, smoothstep(0, 0.7, t))
        pts.append((x, w))
    for k in range(1, 3):
        a = math.pi / 2 - math.pi * k / 4
        pts.append((tip - 0.035 + math.cos(a) * 0.035, math.sin(a) * 0.036))
    outline = [(x, -w) for x, w in pts] + [(x, w) for x, w in reversed(pts)]
    # dedupe the tip point shared by both halves
    clean = []
    for p in outline:
        if not clean or (abs(clean[-1][0] - p[0]) > 1e-5 or abs(clean[-1][1] - p[1]) > 1e-5):
            clean.append(p)
    ob = extrude(name, clean, 0.006, material, bevel=0.0, plane='XY')
    m = Matrix.Translation(hub) @ Matrix.Rotation(angle, 4, 'Z') @ Matrix.Rotation(math.radians(pitch), 4, 'X')
    return place(ob, m)


def build():
    reset()
    brass = M('Brass', color='#dcaa48', rough=.28, metal=.88)
    lacquer = mat('Red lacquer', '#c0302a', rough=.3)
    wood = mat('Dark wood', '#5b3522', rough=.5)
    paper = mat('Kite paper', '#e2432f', rough=.72)
    cream = mat('Kite cream', '#f4ead0', rough=.7)
    gold = mat('Kite gold', '#f8c232', rough=.45)
    glow = mat('Kite glow', '#ffd45a', rough=.18, emit=1.6, emit_color='#ffb830')
    cord = mat('Cord', '#c9a062', rough=.85)

    static, canopy_parts, core_parts, key_parts = [], [], [], []
    rotor_parts = {k: [] for k in range(1, 5)}
    tail_parts = {k: [] for k in range(1, 4)}

    # ---------------------------------------------------------- canopy (node `Canopy`)
    sheet = canopy_sheet(paper, n=10)
    canopy_parts.append(sheet)
    canopy_parts.append(tube('canopy piping', outline_points(10, lift=-PAPER_T / 2), 0.016, cream, verts=4,
                             caps=False, closed=True))
    canopy_parts.append(border_band(cream, 0.9, 0.0035))
    # cream ribs over the spars (keel and cross spar), and the spars themselves under the paper
    for a, b in ((NOSE * 0.97, TAIL * 0.97), (WING * 0.97, V(-WING.x, 0, 0) * 0.97)):
        canopy_parts.append(tube('canopy rib', curve_on(a, b, 14, 0.0035), 0.0075, cream, verts=5, caps=True))
        canopy_parts.append(tube('canopy spar', curve_on(a, b, 12, -PAPER_T - 0.014), 0.012, lacquer, verts=5,
                                 caps=True))
    star, outline = star_decal(gold, 0.36, 0.16, 0.0045)
    canopy_parts.append(star)
    edge = []
    for (x0, y0), (x1, y1) in zip(outline, outline[1:] + outline[:1]):
        for k in range(2):
            t = k / 2
            edge.append(surf(lerp(x0, x1, t), lerp(y0, y1, t), 0.006))
    canopy_parts.append(tube('star rim', edge, 0.0065, cream, verts=4, caps=False, closed=True))
    # brass grommet where the lantern stands, and corner caps where the spars meet the piping
    cz = canopy_z(0, 0)
    canopy_parts.append(ring_rod('grommet', (0, 0, cz + 0.004), 0.1, 0.012, brass, maj=16, mn=4))

    # ---------------------------------------------------------- tail: string with three paper bows
    tail_root = surf(TAIL.x, TAIL.y * 0.985, -PAPER_T)
    d = V(0, math.cos(math.radians(24)), -math.sin(math.radians(24)))
    seg = 0.32
    tail_pivots = [tail_root + d * (seg * k) for k in range(3)]
    bow_mats = [cream, gold, paper]
    for k in range(3):
        a = tail_pivots[k]
        b = a + d * seg
        tail_parts[k + 1].append(rod('tail string', a, b, 0.007, cord, verts=5))
        bw, bh = 0.1, 0.05
        bow = extrude('tail bow', [(-bw, -bh), (-bw, bh), (0, 0.012), (bw, bh), (bw, -bh), (0, -0.012)], 0.005,
                      bow_mats[k], bevel=0.0, plane='XY')
        m = Matrix.Translation(b) @ Matrix.Rotation(math.radians(24), 4, 'X') @ Matrix.Rotation(0.2 * (k - 1), 4, 'Y')
        tail_parts[k + 1].append(place(bow, m))
        tail_parts[k + 1].append(sphere('tail knot', 0.018, b, bow_mats[(k + 1) % 3], seg=6, rings=4))

    # ---------------------------------------------------------- star lantern on the canopy (Core inside)
    zb = cz + 0.004
    static.append(lathe('lantern base', [(0, zb), (0.084, zb), (0.094, zb + 0.018), (0.086, zb + 0.04),
                                         (0.07, zb + 0.048), (0, zb + 0.048)], brass, seg=18, smooth_angle=40))
    static.append(lathe('lantern band', [(0.088, zb + 0.014), (0.097, zb + 0.02), (0.097, zb + 0.03),
                                         (0.089, zb + 0.036)], lacquer, seg=18, smooth_angle=40))
    z0, z1 = zb + 0.05, zb + 0.3
    for i in range(5):
        a = TAU * i / 5 + TAU / 10
        pts = []
        for k in range(7):
            t = k / 6
            r = 0.078 + 0.03 * math.sin(math.pi * t)
            pts.append(V(math.cos(a) * r, math.sin(a) * r, lerp(z0, z1, t)))
        static.append(tube('lantern rib', pts, 0.0065, brass, verts=4, caps=False))
    static.append(ring_rod('lantern hoop', (0, 0, (z0 + z1) / 2), 0.109, 0.006, brass, maj=16, mn=4))
    static.append(lathe('lantern cap', [(0, z1 + 0.07), (0.028, z1 + 0.066), (0.06, z1 + 0.05), (0.086, z1 + 0.02),
                                        (0.092, z1 + 0.006), (0.08, z1), (0, z1)], brass, seg=18, smooth_angle=40))
    static.append(lathe('cap band', [(0.084, z1 + 0.012), (0.093, z1 + 0.018), (0.09, z1 + 0.026),
                                     (0.08, z1 + 0.03)], lacquer, seg=18, smooth_angle=40))
    finial = star_gem('finial star', 0.058, 0.026, 0.016, glow)
    place(finial, Matrix.Translation((0, 0, z1 + 0.13)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    static.append(finial)
    static.append(rod('finial stem', (0, 0, z1 + 0.066), (0, 0, z1 + 0.078), 0.01, brass, verts=8))
    core_c = V(0, 0, (z0 + z1) / 2 + 0.005)
    gem = star_gem('core star', 0.088, 0.04, 0.028, glow)
    place(gem, Matrix.Translation(core_c) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    core_parts.append(gem)
    core_parts.append(sphere('core heart', 0.03, core_c, glow, seg=8, rings=5))

    # ---------------------------------------------------------- spring drum + wind-up key under the canopy
    d0, d1 = DRUM_Z
    static.append(cyl('drum', 0.1, d1 - d0, (0, 0, (d0 + d1) / 2), brass, verts=20, bevel=0.012, segments=2))
    static.append(cyl('drum band', 0.104, 0.05, (0, 0, (d0 + d1) / 2), lacquer, verts=20, cap=False))
    static.append(cyl('drum post', 0.028, cz - PAPER_T - d1 - 0.01, (0, 0, (d1 + cz - PAPER_T) / 2), brass, verts=10))
    for i in range(8):
        a = TAU * i / 8 + TAU / 16
        static.append(sphere('rivet', 0.009, (math.cos(a) * 0.1, math.sin(a) * 0.1, d1 - 0.018), brass, seg=6, rings=3))
    plate = extrude('drum star', star_outline(0.032, 0.014, rot=math.pi / 2), 0.006, gold, bevel=0.0015, segments=1)
    place(plate, Matrix.Translation((0, -0.107, (d0 + d1) / 2)))
    static.append(plate)
    key_c = V(0, 0.1, (d0 + d1) / 2)
    key_parts.append(rod('key shaft', key_c, key_c + V(0, 0.1, 0), 0.011, brass, verts=8))
    key_parts.append(sphere('key boss', 0.02, key_c + V(0, 0.1, 0), brass, seg=8, rings=5))
    for s in (-1, 1):
        lobe = cyl('key wing', 0.045, 0.014, key_c + V(s * 0.052, 0.108, 0), brass, verts=12, bevel=0.004,
                   segments=1, rot=(math.pi / 2, 0, 0))
        key_parts.append(lobe)
        key_parts.append(cyl('key wing hole', 0.02, 0.016, key_c + V(s * 0.058, 0.108, 0), lacquer, verts=10,
                             rot=(math.pi / 2, 0, 0)))

    # ---------------------------------------------------------- arms, pods, ducts and rotors
    rx, ry = ROTOR_XY
    corners = {1: (rx, -ry), 2: (-rx, -ry), 3: (rx, ry), 4: (-rx, ry)}
    arm_z = d0 + 0.07
    for k, (px, py) in corners.items():
        hub = V(px, py, ROTOR_Z)
        dirv = V(px, py, 0).normalized()
        a = V(0, 0, arm_z) + dirv * 0.09
        b = V(px, py, arm_z) - dirv * 0.04
        static.append(rod('arm', a, b, 0.017, lacquer, verts=8))
        p = a + dirv * 0.03
        static.append(rod('ferrule', p - dirv * 0.022, p + dirv * 0.022, 0.022, brass, verts=8))
        # pod: a brass motor drum with a red band under the hub
        static.append(cyl('pod', 0.044, 0.1, (px, py, ROTOR_Z - 0.06), brass, verts=12, bevel=0.01, segments=1))
        static.append(cyl('pod band', 0.047, 0.026, (px, py, ROTOR_Z - 0.06), lacquer, verts=12, cap=False))
        static.append(ring_rod('duct', (px, py, ROTOR_Z - 0.004), DUCT_R, 0.016, brass, maj=24, mn=4, rot=math.pi / 4))
        base_a = math.atan2(py, px)
        for s in range(3):
            aa = base_a + math.pi + TAU * s / 3 + TAU / 6
            p0 = V(px, py, ROTOR_Z - 0.07) + V(math.cos(aa), math.sin(aa), 0) * 0.04
            p1 = V(px, py, ROTOR_Z - 0.02) + V(math.cos(aa), math.sin(aa), 0) * (DUCT_R - 0.01)
            static.append(rod('duct strut', p0, p1, 0.006, brass, verts=4))
        # the rotor itself: hub cap and three cream paper blades with lacquered tips
        rp = rotor_parts[k]
        rp.append(lathe('rotor hub', [(0, ROTOR_Z + 0.036), (0.016, ROTOR_Z + 0.032), (0.03, ROTOR_Z + 0.016),
                                      (0.033, ROTOR_Z - 0.006), (0, ROTOR_Z - 0.006)], brass, seg=8, loc=(px, py, 0),
                        smooth_angle=40))
        spin = 1 if k in (1, 4) else -1
        for s in range(3):
            ang = TAU * s / 3 + (0.4 if k % 2 else 1.1)
            rp.append(blade('rotor blade', cream, ang, hub, pitch=14 * spin))
            tip = hub + V(math.cos(ang), math.sin(ang), 0) * (BLADE_R - 0.02)
            rp.append(sphere('blade tip', (0.024, 0.032, 0.006), tip, lacquer, seg=6, rings=3, rot=(0, 0, ang)))

    # ---------------------------------------------------------- control triangle and handle bar
    yoke_z = d0 - 0.01
    static.append(rod('yoke', (-0.07, 0, yoke_z), (0.07, 0, yoke_z), 0.018, brass, verts=10))
    for s in (-1, 1):
        top = V(s * 0.065, 0, yoke_z)
        bot = V(s * (BAR_HALF - 0.035), 0, 0.028)
        static.append(rod('downtube', top, bot, 0.012, brass, verts=8))
        static.append(sphere('downtube knuckle', 0.02, top, brass, seg=8, rings=4))
        static.append(rod('bar sleeve', V(s * (BAR_HALF - 0.065), 0, 0), V(s * (BAR_HALF - 0.005), 0, 0), 0.028,
                          brass, verts=12))
        static.append(sphere('bar knob', 0.031, V(s * (BAR_HALF + 0.01), 0, 0), brass, seg=10, rings=6))
        # grips where the hands go, with cream cord bands at both ends
        g0, g1 = s * 0.245, s * 0.37
        static.append(rod('grip', V(g0, 0, 0), V(g1, 0, 0), 0.026, lacquer, verts=10, bevel=0.006))
        for gx in (g0, g1):
            static.append(ring_rod('grip band', (gx, 0, 0), 0.027, 0.006, cord, axis=(1, 0, 0), maj=10, mn=3))
    # the wooden bar arches up between the grips, over Mika's head, so it frames her face
    ctrl = [(-BAR_HALF, 0), (-0.33, 0), (-0.255, 0.004), (-0.232, 0.07), (-0.18, 0.165), (-0.095, 0.205), (0, 0.215)]
    ctrl = ctrl + [(-x, z) for x, z in reversed(ctrl[:-1])]
    static.append(tube('handle bar', spline([V(x, 0, z) for x, z in ctrl], 22), 0.021, wood, verts=6, caps=True))
    crest = extrude('bar star', star_outline(0.036, 0.016, rot=math.pi / 2), 0.009, gold, bevel=0.0)
    place(crest, Matrix.Translation((0, 0, 0.252)))
    static.append(crest)

    every = static + canopy_parts + core_parts + key_parts + [p for v in rotor_parts.values() for p in v] + \
        [p for v in tail_parts.values() for p in v]
    by = {}
    for p in every:
        key_ = p.name.split('.')[0]
        by[key_] = by.get(key_, 0) + tri_count([p])
    print(NAME, 'tris', tri_count(every), sorted(by.items(), key=lambda kv: -kv[1]))

    # ---------------------------------------------------------- AO and painted tints
    bake_ao(every, rays=48, distance=0.22, strength=.55, ground=None, min_value=.35)
    up_light([p for p in every if p.data.materials and p.data.materials[0] == brass], .74)
    grain([p for p in every if p.data.materials and p.data.materials[0] in (wood, lacquer)], axis='x', freq=26, amp=.12)

    def paper_tone(p, n, f):
        dn = diamond_norm(p.x, p.y)
        fib = 1 - 0.05 * (0.5 + 0.5 * noise.noise(Vector((p.x * 22, p.y * 22, 0.3))))
        warm = 1 - 0.12 * smoothstep(0.55, 1.0, dn)          # deeper vermilion toward the piping
        under = 0.82 if n.z < -0.3 else 1.0                   # the underside sits in its own shade
        return (warm * fib * under, warm * fib * under * .97, warm * fib * under * .95)
    tint(sheet, paper_tone)
    tint(star, lambda p, n, f: 1 - 0.1 * smoothstep(0.05, 0.4, Vector((p.x, p.y)).length))

    # ---------------------------------------------------------- nodes
    bpy.context.view_layer.update()
    canopy = pivot_mesh('Canopy', canopy_parts, V(0, 0, cz))
    tails = [pivot_mesh(f'Tail_{k}', tail_parts[k], tail_pivots[k - 1]) for k in (1, 2, 3)]
    set_parent(tails[0], canopy)
    set_parent(tails[1], tails[0])
    set_parent(tails[2], tails[1])
    core = pivot_mesh('Core', core_parts, core_c)
    key = pivot_mesh('Key', key_parts, key_c)
    rotors = [pivot_mesh(f'Rotor_{k}', rotor_parts[k], V(*corners[k], ROTOR_Z)) for k in (1, 2, 3, 4)]
    handle = empty('Handle', (0, 0, 0))
    return finish(NAME, static, 'Star kite', keep=[canopy, core, key] + rotors, empties=[handle])


if __name__ == '__main__':
    info = build()
    report([(NAME, info)])
    save_kit('kite', [NAME], spacing=1.0)
