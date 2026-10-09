"""Starline critters: tiny bugs modelled, rigged, animated and exported from code (Blender 4.5).

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_critters.py [-- --only cricket,spider]

Writes public/models/<name>.glb (see art/CONTRACTS.md, "Animal rigs") and the editable
art/blender/source/critters.blend.

Real size, no export scale (like the farm animals). Conventions as build_animals.py: the critter faces
-Y, its left is +X, origin on the ground (or perch) under the body, z up. Clips stay in place; the
runtime moves the critter (Hop carries its own vertical arc, like the crow's).

These are scatter-scale creatures (lightweight-game-objects: 16-48 px on a phone), so every one is
<= 300 triangles (web <= 400), <= 3 materials and a handful of bones only where a clip needs them
(wings, legs, antennae). Colour lives in the vertices: each part is painted (a 'Paint' multiplier)
and the paint is multiplied into the baked AO in COLOR_0, so spots, bands, wing borders and pupils
cost no extra materials. Heads and eyes are a little oversized so they read at a few metres.

  cricket    5 cm long   Idle, Chirp (loop: wings up, hind legs rub), Hop (once, in-place arc 4 cm)
  spider     3.3 cm body Idle (legs shift), Walk (~0.05 m/s)        + static 'spider-web' (0.6 m)
  ladybug    1 cm        Idle, Fly (once: wing cases open, wings unfold and buzz)
  dragonfly  7 cm span   Fly (loop: wing buzz)
  butterfly  6 cm span   Fly (loop flap), Rest (wings slowly open/close); 'Butterfly wing' is tinted
                         by the runtime (material extras: variants = two sRGB hex colours)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *  # noqa: F401,F403
from rig import build_armature, bind, bind_blend, ramp, skin, export_rigged, clip, FPS
from animal_kit import S, C, pulse, window, smooth, lerp, tri_count
from mathutils import Quaternion

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ALL = ['cricket', 'spider', 'spider-web', 'ladybug', 'dragonfly', 'butterfly']
ONLY = ALL
if '--only' in ARGV:
    ONLY = [n.strip() for n in ARGV[ARGV.index('--only') + 1].split(',') if n.strip()]
NO_SAVE = '--no-save' in ARGV
BUDGET = {'cricket': 300, 'spider': 300, 'spider-web': 400, 'ladybug': 300, 'dragonfly': 300, 'butterfly': 300}
RESULTS = {}
Xv, Yv, Zv = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def V(*a):
    return Vector(a)


def sx(p, s):
    return Vector((p[0] * s, p[1], p[2]))

# ---------------------------------------------------------------- painting (vertex colour multipliers)


def paint(ob, val=1.0):
    """Store a per-corner 'Paint' multiplier: a float, an (r, g, b) tuple or fn(world_co) -> either."""
    bpy.context.view_layer.update()
    me = ob.data
    a = me.color_attributes.get('Paint') or me.color_attributes.new('Paint', 'FLOAT_COLOR', 'CORNER')
    mw = ob.matrix_world
    per_vert = list(ob['_paint']) if '_paint' in ob else None    # wing(): per-vertex colours by layer
    if per_vert:
        del ob['_paint']
    for li, loop in enumerate(me.loops):
        if per_vert:
            vi = loop.vertex_index
            a.data[li].color = (*per_vert[vi * 3:vi * 3 + 3], 1.0)
            continue
        v = val(mw @ me.vertices[loop.vertex_index].co) if callable(val) else val
        if isinstance(v, (int, float)):
            v = (v, v, v)
        a.data[li].color = (v[0], v[1], v[2], 1.0)
    return ob


def bake_paint(mesh):
    """COLOR_0 = baked AO x Paint; drop the Paint layer."""
    me = mesh.data
    col, pt = me.color_attributes['Color'], me.color_attributes['Paint']
    for i in range(len(me.loops)):
        c, p = col.data[i].color, pt.data[i].color
        col.data[i].color = (c[0] * p[0], c[1] * p[1], c[2] * p[2], 1.0)
    me.color_attributes.remove(me.color_attributes['Paint'])
    me.color_attributes.active_color = me.color_attributes['Color']
    try:
        me.color_attributes.render_color_index = me.color_attributes.find('Color')
    except Exception:
        pass


class Parts(list):
    def add(self, ob, bone, val=1.0):
        paint(ob, val)
        self.append(bind(ob, bone) if bone else ob)
        return ob

# ---------------------------------------------------------------- tiny geometry


def ell_pt(c, r, a, t):
    """Point on an ellipsoid: t is the angle from the front pole (-Y), a the angle around (0 = top, +90 = +X)."""
    return Vector((c[0] + r[0] * math.sin(t) * math.sin(a), c[1] - r[1] * math.cos(t), c[2] + r[2] * math.sin(t) * math.cos(a)))


def on_ell(c, r, q, off=0.0):
    """Project q onto the ellipsoid (radially in ellipsoid space) and push it `off` along the normal."""
    c, q = Vector(c), Vector(q)
    d = Vector(((q - c)[k] / r[k] for k in range(3))).normalized()
    p = c + Vector((d[k] * r[k] for k in range(3)))
    n = Vector((d[k] / r[k] for k in range(3))).normalized()
    return p + n * off, n


def ell_patch(name, c, r, a0, a1, t0, t1, nu, nv, material):
    """Open patch of an ellipsoid surface (outward facing): nu steps around, nv along the length."""
    bm = bmesh.new()
    grid = [[bm.verts.new(ell_pt(c, r, math.radians(lerp(a0, a1, i / nu)), lerp(t0, t1, j / nv)))
             for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            f = bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - Vector(c)) < 0:
                f.normal_flip()
    return from_bmesh(name, bm, material, smooth_angle=80)


def fan(name, center, ring, material, up=None):
    """Flat-ish polygon fan (spots, pupils, wings without an inner ring). up: flip faces to face it."""
    bm = bmesh.new()
    c = bm.verts.new(center)
    vs = [bm.verts.new(p) for p in ring]
    for i in range(len(vs)):
        f = bm.faces.new((c, vs[i], vs[(i + 1) % len(vs)]))
        f.normal_update()
        if up is not None and f.normal.dot(up) < 0:
            f.normal_flip()
    return from_bmesh(name, bm, material, smooth_angle=80)


def surface_disc(name, c, r, centre_dir, radius, material, count=6, off=.00012, shape=None):
    """A spot lying on an ellipsoid: centre_dir points from the ellipsoid centre to the spot."""
    p, n = on_ell(c, r, Vector(c) + Vector(centre_dir).normalized() * max(r) * 2, off)
    t = n.cross(Zv if abs(n.z) < .9 else Yv).normalized()
    b = n.cross(t).normalized()
    ring = []
    for k in range(count):
        a = TAU * k / count
        u, v = (shape(a) if shape else (math.cos(a), math.sin(a)))
        ring.append(on_ell(c, r, p + (t * u + b * v) * radius, off)[0])
    return fan(name, on_ell(c, r, p, off * 1.6)[0], ring, material, up=n)


def wing(name, root, outline, material, rings=(.55,), colors=None, up=Zv):
    """Wing membrane: a root vertex, inner rings (fractions of the way to the outline) and the outline
    (open, root edge to root edge). colors[layer] paints each layer (0 = root, then the rings, last = the
    outline): a value, an (r, g, b) or fn(outline_index) -> either. Crisp borders = a ring close to 1."""
    bm = bmesh.new()
    root = Vector(root)
    layers = [[bm.verts.new(root)]]
    for f in rings:
        layers.append([bm.verts.new(root + (Vector(p) - root) * f) for p in outline])
    layers.append([bm.verts.new(p) for p in outline])
    faces = []
    n = len(outline)
    for i in range(n - 1):
        faces.append(bm.faces.new((layers[0][0], layers[1][i], layers[1][i + 1])))
        for a, b in zip(layers[1:], layers[2:]):
            faces.append(bm.faces.new((a[i], b[i], b[i + 1], a[i + 1])))
    for f in faces:
        f.normal_update()
        if f.normal.dot(up) < 0:
            f.normal_flip()
    ob = from_bmesh(name, bm, material, smooth_angle=80)
    vals = {}
    k = 0
    for li, layer in enumerate(layers):
        for i in range(len(layer)):
            c = (colors[li] if colors else 1.0)
            c = c(i) if callable(c) else c
            vals[k] = (c, c, c) if isinstance(c, (int, float)) else tuple(c)
            k += 1
    ob['_paint'] = [x for k_ in range(k) for x in vals[k_]]   # consumed by paint()
    return ob


def stick(name, pts, radius, material, verts=3, taper=None, caps=False):
    return tube(name, pts, radius, material, verts=verts, caps=caps,
                radius_fn=(lambda t: lerp(1.0, taper, t)) if taper else None)


def rot(*pairs):
    """Compose axis-angle rotations (applied right to left like matrices) -> XYZ euler degrees for rig.clip."""
    q = Quaternion()
    for axis, deg in pairs:
        q = q @ Quaternion(Vector(axis).normalized(), math.radians(deg))
    e = q.to_euler('XYZ')
    return (math.degrees(e.x), math.degrees(e.y), math.degrees(e.z))


def finish(name, arm, parts, ao):
    tris = tri_count(parts)
    print(f'{name}: {tris} tris before export')
    mesh = skin(parts, arm, name.replace('-', '_') + '_body', ao=ao)
    bake_paint(mesh)
    return mesh


def export_critter(name, arm):
    info = export_rigged(name, arm)
    RESULTS[name] = dict(tris=info['tris'], kb=info['bytes'] / 1024, clips=info['animations'], mats=info['materials'])
    assert info['tris'] <= BUDGET[name], f'{name}: {info["tris"]} tris > {BUDGET[name]}'
    assert info['materials'] <= 3, f'{name}: {info["materials"]} materials'
    return info

# ====================================================================== CRICKET


def build_cricket():
    """Field cricket, 5 cm: olive-brown with darker folded wings, a big round head with glossy eyes,
    long sweeping antennae and chunky jumping legs (the silhouette that reads at a few metres)."""
    reset()
    body_m = mat('Cricket body', '#7f7a2c', rough=.55)
    wing_m = mat('Cricket wing', '#6a3f1c', rough=.4)
    eye_m = mat('Cricket eye', '#2a1d16', rough=.12)
    H, Hr = V(0, -.0155, .0108), (.0068, .0066, .0076)
    T, Tr = V(0, -.0062, .0098), (.0060, .0060, .0056)
    A, Ar = V(0, .0095, .0090), (.0068, .0155, .0062)

    bones = [('root', (0, 0, 0), (0, 0, .004), None),
             ('body', (0, -.006, .010), (0, -.016, .010), 'root'),
             ('wings', (0, -.002, .0150), (0, .012, .0150), 'body')]
    hind = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        hip, knee, foot = sx(V(.0055, .000, .0068), s), sx(V(.0105, .0155, .0168), s), sx(V(.0125, .0265, .0006), s)
        hind[sd] = (hip, knee, foot)
        ab = sx(V(.0022, -.0212, .0158), s)
        bones += [(f'antenna_{sd}', ab, sx(V(.0070, -.0350, .0240), s), 'body'),
                  (f'thigh_{sd}', hip, knee, 'body'), (f'shin_{sd}', knee, foot, f'thigh_{sd}')]
    arm = build_armature('Cricket', bones)

    P = Parts()
    underside = lambda co: .72 if co.z < .0075 else 1.0
    P.add(sphere('Cricket head', Hr, H, body_m, seg=7, rings=4), 'body', lambda co: .78 if co.z < .008 else 1.0)
    P.add(sphere('Cricket thorax', Tr, T, body_m, seg=6, rings=4), 'body', underside)
    P.add(sphere('Cricket abdomen', Ar, A, body_m, seg=7, rings=4), 'body',
          lambda co: (.7 if co.z < .0075 else 1.0) * (.82 if int((co.y - .0) / .0055) % 2 else 1.0))
    # folded wings: a roof over the abdomen, darker with a pale edge vein
    P.add(ell_patch('Cricket wings', A + V(0, -.0015, .0004), (Ar[0] * 1.14, Ar[1] * 1.06, Ar[2] * 1.2),
                    -78, 78, math.radians(42), math.radians(168), 3, 3, wing_m), 'wings',
          lambda co: 1.25 if abs(co.x) > .0055 else 1.0)
    for s, sd in ((1, 'L'), (-1, 'R')):
        P.add(sphere(f'Cricket eye {sd}', .0026, sx(V(.0053, -.0185, .0138), s), eye_m, seg=5, rings=3), 'body')
        P.add(stick(f'Cricket antenna {sd}', [sx(V(.0022, -.0212, .0158), s), sx(V(.0070, -.0350, .0240), s),
                                              sx(V(.0165, -.0500, .0255), s)], .0007, body_m, taper=.5), f'antenna_{sd}', .7)
        for nm, pts in (('front', (V(.0040, -.0090, .0062), V(.0100, -.0125, .0085), V(.0125, -.0170, .0004))),
                        ('mid', (V(.0045, -.0040, .0062), V(.0120, -.0025, .0085), V(.0165, .0000, .0004)))):
            P.add(stick(f'Cricket {nm} leg {sd}', [sx(p, s) for p in pts], .0009, body_m, taper=.6), 'body', .8)
        hip, knee, foot = hind[sd]
        P.add(stick(f'Cricket thigh {sd}', [hip, hip.lerp(knee, .45) + sx(V(.0006, 0, .0008), s), knee], .0024, body_m,
                    verts=4, taper=.45), f'thigh_{sd}', lambda co: .85 if co.z < .011 else 1.0)
        P.add(stick(f'Cricket shin {sd}', [knee, foot], .0008, body_m, taper=.7), f'shin_{sd}', .7)
    finish('cricket', arm, P, dict(rays=32, distance=.012, strength=.55, ground=0.0))

    def antennae(p, amp=1.0, ph=0.0, sweep=0.0):
        tw_l = pulse(p, .18 + ph, .03) + pulse(p, .63 + ph, .025)
        tw_r = pulse(p, .4 + ph, .03) + pulse(p, .82 + ph, .025)
        return {'antenna_L': (-8 * tw_l * amp + sweep, 0, 10 * S(p, 1, .1) * amp - 6 * tw_l),
                'antenna_R': (-8 * tw_r * amp + sweep, 0, -10 * S(p, 1, .3) * amp + 6 * tw_r)}

    # Idle (3 s): breathing, lazy antenna sweeps with twitches, a hind-leg shuffle
    def idle_ch():
        ch = {'body@loc': lambda p: (0, 0, .00025 * S(p, 3)),
              'body': lambda p: (1.2 * S(p, 3), 0, 3 * S(p, 1, .2)),
              'wings': lambda p: (2 * pulse(p, .7, .05), 0, 0),
              'thigh_L': lambda p: (10 * pulse(p, .5, .05), 0, 0),
              'shin_L': lambda p: (-8 * pulse(p, .5, .05), 0, 0)}
        for b in ('antenna_L', 'antenna_R'):
            ch[b] = (lambda b: lambda p: antennae(p)[b])(b)
        return ch
    clip(arm, 'Idle', 90, idle_ch())

    # Chirp (loop, 0.8 s): wings raised and trembling, hind femurs rubbing up and down against them
    def chirp_ch():
        ch = {'wings': lambda p: (20 + 4 * S(p, 8), 0, 0),
              'body': lambda p: (-3 + .8 * S(p, 8), 0, 0),
              'body@loc': lambda p: (0, 0, .0002 * S(p, 8)),
              'thigh_L': lambda p: (14 + 9 * S(p, 4), 0, -4), 'shin_L': lambda p: (-10 - 6 * S(p, 4), 0, 0),
              'thigh_R': lambda p: (14 + 9 * S(p, 4, .5), 0, 4), 'shin_R': lambda p: (-10 - 6 * S(p, 4, .5), 0, 0)}
        for b in ('antenna_L', 'antenna_R'):
            ch[b] = (lambda b: lambda p: antennae(p, .6, .1)[b])(b)
        return ch
    clip(arm, 'Chirp', 24, chirp_ch())

    # Hop (once, 0.6 s): crouch, kick the hind legs straight, 4 cm in-place arc, land and settle
    def hop_air(p):
        return math.sin(math.pi * (p - .25) / .55) if .25 < p < .8 else 0.0

    def crouch(p):
        return window(p, 0, .3, .5) + .7 * window(p, .78, 1.0, .5)

    def kick(p):
        return window(p, .22, .75, .2)

    def hop_ch():
        ch = {'body@loc': lambda p: (0, 0, .04 * hop_air(p) - .0016 * crouch(p)),
              'body': lambda p: (5 * crouch(p) - 14 * window(p, .22, .5, .4) + 10 * window(p, .5, .8, .4), 0, 0),
              'wings': lambda p: (6 * kick(p), 0, 0)}
        for sd in ('L', 'R'):
            ch[f'thigh_{sd}'] = lambda p: (16 * crouch(p) - 38 * kick(p), 0, 0)
            ch[f'shin_{sd}'] = lambda p: (-12 * crouch(p) + 70 * kick(p), 0, 0)
        ch['antenna_L'] = lambda p: (24 * window(p, .2, .85, .3), 0, -8 * window(p, .2, .85, .3))
        ch['antenna_R'] = lambda p: (24 * window(p, .2, .85, .3), 0, 8 * window(p, .2, .85, .3))
        return ch
    clip(arm, 'Hop', 18, hop_ch(), loop=False)
    export_critter('cricket', arm)

# ====================================================================== SPIDER


def heart(a):
    """Heart outline in the unit square, sampled by angle (for the spider's marking)."""
    t = a
    x = 16 * math.sin(t) ** 3
    y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
    return x / 17, y / 17


def build_spider():
    """Garden spider, cute not scary: a round warm-brown body with a little orange heart on its back,
    two big friendly eyes with dark pupils, eight short banded legs."""
    reset()
    body_m = mat('Spider body', '#94532c', rough=.6)
    mark_m = mat('Spider marking', '#ff8a24', rough=.45)
    eye_m = mat('Spider eye', '#fbf8f0', rough=.1)
    H, Hr = V(0, -.0082, .0122), (.0078, .0074, .0070)
    A, Ar = V(0, .0068, .0152), (.0105, .0108, .0096)

    bones = [('root', (0, 0, 0), (0, 0, .004), None),
             ('body', (0, 0, .0125), (0, -.010, .0125), 'root')]
    legs = []
    for s, sd in ((1, 'L'), (-1, 'R')):
        for i, beta in enumerate((-48, -16, 16, 46)):
            h = V(s * math.cos(math.radians(beta)), math.sin(math.radians(beta)), 0)
            J0 = H + V(h.x * .0050, h.y * .0042 + .0005, -.0024)
            knee = J0 + h * .0092 + V(0, 0, .0066)
            foot = J0 + h * .0190
            foot.z = .0004
            nm = f'leg{i + 1}_{sd}'
            bones.append((nm, J0, knee, 'body'))
            legs.append((nm, s, h, J0, knee, foot))
    arm = build_armature('Spider', bones)

    P = Parts()
    P.add(sphere('Spider head', Hr, H, body_m, seg=7, rings=4), 'body', lambda co: .8 if co.z < .009 else 1.0)
    P.add(sphere('Spider abdomen', Ar, A, body_m, seg=8, rings=4), 'body',
          lambda co: .72 if co.z < .010 else (1.0 if co.z > .018 else .9))
    P.add(surface_disc('Spider heart', A, Ar, V(0, .05, 1.0), .0052, mark_m, count=10, off=.0002,
                       shape=heart), 'body')
    for s, sd in ((1, 'L'), (-1, 'R')):
        ec = sx(V(.0036, -.0136, .0158), s)
        P.add(sphere(f'Spider eye {sd}', .0034, ec, eye_m, seg=6, rings=4, rot=(math.radians(90), 0, 0)), 'body')
        P.add(surface_disc(f'Spider pupil {sd}', ec, (.0034,) * 3, sx(V(.12, -1, -.08), s), .0019, eye_m, count=6,
                           off=.00012), 'body', .06)
    for nm, s, h, J0, knee, foot in legs:
        P.add(stick(f'Spider {nm}', [J0, knee, foot], .00145, body_m, taper=.6), nm,
              lambda co: .55 if co.z < .0035 else (.8 if co.z > .0145 else 1.0))
    finish('spider', arm, P, dict(rays=32, distance=.01, strength=.55, ground=0.0))

    group_a = {'leg1_L', 'leg3_L', 'leg2_R', 'leg4_R'}

    def leg_rot(s, h, yaw, lift):
        return rot((Zv, s * yaw), (h.cross(Zv), lift))

    # Idle (3 s): breathing, the body sways, legs shift and tap one after another
    def idle_ch():
        ch = {'body@loc': lambda p: (0, 0, .0003 * S(p, 2)),
              'body': lambda p: (1.5 * S(p, 2, .1), 2 * S(p, 1, .3), 4 * S(p, 1))}
        taps = {'leg1_L': .12, 'leg1_R': .3, 'leg2_L': .55, 'leg3_R': .72, 'leg4_L': .86, 'leg2_R': .45}
        for nm, s, h, *_ in legs:
            at = taps.get(nm)
            ch[nm] = (lambda s, h, at: lambda p: leg_rot(s, h, 5 * S(p, 1, .2) + (6 * pulse(p, at, .05) if at else 0),
                                                         (22 * pulse(p, at, .05) if at else 0)))(s, h, at)
        return ch
    clip(arm, 'Idle', 90, idle_ch())

    # Walk (loop, 0.4 s): alternating tetrapod, rigid legs sweep +/-14 degrees; ~0.05 m/s at 1x
    def walk_ch():
        ch = {'body@loc': lambda p: (0, 0, .0005 * C(p, 2)),
              'body': lambda p: (0, 2.5 * S(p, 1), 0)}
        A_ = 14
        for nm, s, h, *_ in legs:
            off = 0 if nm in group_a else .5

            def fn(p, s=s, h=h, off=off):
                ph = (p + off) % 1.0
                if ph < .5:
                    yaw, lift = lerp(-A_, A_, ph / .5), 0.0
                else:
                    u = (ph - .5) / .5
                    yaw, lift = lerp(A_, -A_, smooth(u)), 26 * math.sin(math.pi * u)
                return leg_rot(s, h, yaw, lift)
            ch[nm] = fn
        return ch
    clip(arm, 'Walk', 12, walk_ch())
    export_critter('spider', arm)


def build_web():
    """Static orb web, 0.6 m across, origin at its hub, lying in the XZ plane (faces -Y in Blender = +Z
    in three.js). Thin double-sided silk ribbons plus dew drops that catch the light."""
    reset()
    silk = mat('Web silk', '#f3f1ff', rough=.35, emit=.35, emit_color='#fff6e8', double=True)
    dew = mat('Web dew', '#d8f1ff', rough=.04, emit=.25, emit_color='#eaf8ff')
    rng = random.Random(11)
    spokes = 9
    ang = [math.radians(90 + 360 * k / spokes + rng.uniform(-9, 9)) for k in range(spokes)]
    rad = [rng.uniform(.27, .30) for _ in range(spokes)]

    def P2(a, r):
        return Vector((math.cos(a) * r, 0, math.sin(a) * r))

    bm = bmesh.new()

    def ribbon(a, b, w):
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        n = d.cross(Yv).normalized() * w / 2
        vs = [bm.verts.new(a - n), bm.verts.new(b - n), bm.verts.new(b + n), bm.verts.new(a + n)]
        f = bm.faces.new(vs)
        f.normal_update()
        if f.normal.dot(-Yv) < 0:
            f.normal_flip()

    tips = [P2(a, r) for a, r in zip(ang, rad)]
    for k in range(spokes):                                   # radials from the hub
        ribbon(P2(ang[k], .012), tips[k], .0034)
        ribbon(tips[k], tips[(k + 1) % spokes], .0040)       # frame
    for k in (0, 3, 6):                                      # anchor threads out of frame
        ribbon(tips[k], tips[k] * 1.28, .0034)
    rings = [.2, .33, .46, .58, .70, .82]
    ring_pts = []
    for j, f in enumerate(rings):                             # spiral: each ring creeps outward around the hub
        pts = []
        for k in range(spokes):
            fk = f + .045 * k / spokes
            pts.append(P2(ang[k], rad[k] * fk) + Vector((0, 0, -.006 * fk)))
        ring_pts.append(pts)
        for k in range(spokes):
            ribbon(pts[k], pts[(k + 1) % spokes], .0028)
    web = from_bmesh('Web silk', bm, silk, smooth_angle=10)
    drops = []
    for i in range(12):
        j, k = rng.randrange(1, len(rings)), rng.randrange(spokes)
        a, b = ring_pts[j][k], ring_pts[j][(k + 1) % spokes]
        p = a.lerp(b, rng.uniform(.25, .75)) + Vector((0, 0, -.003))
        r = rng.uniform(.0045, .0068)
        drops.append(sphere(f'Web dew {i}', (r, r, r * 1.1), p, dew, seg=4, rings=3))
    d = join(drops, 'Web dew')
    paint(web, 1.0)
    ensure_color([web, d])
    root = join([web, d], 'spider_web')
    info = export('spider-web', [root])
    RESULTS['spider-web'] = dict(tris=info['tris'], kb=info['bytes'] / 1024, clips=[], mats=info['materials'])
    assert info['tris'] <= BUDGET['spider-web'], info

# ====================================================================== LADYBUG


def build_ladybug():
    """Ladybird, 1 cm: glossy red wing cases with six black spots, black head with white cheek-eyes.
    Fly opens the wing cases and unfolds the clear hind wings, which then buzz."""
    reset()
    shell = mat('Ladybug shell', '#e8291c', rough=.22, double=True)
    black = mat('Ladybug black', '#1c1a22', rough=.3)
    pale = mat('Ladybug pale', '#fbf7ee', rough=.25, double=True)
    Ec, Er = V(0, .0006, .0030), (.0041, .0047, .0038)
    Hc, Hr = V(0, -.0043, .0029), (.0026, .0019, .0019)
    bones = [('root', (0, 0, 0), (0, 0, .002), None),
             ('body', (0, .001, .003), (0, -.003, .003), 'root')]
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'elytron_{sd}', sx(V(.0005, -.0030, .0062), s), sx(V(.0005, .0015, .0066), s), 'body'),
                  (f'wing_{sd}', sx(V(.0011, -.0016, .0049), s), sx(V(.0011, .0020, .0049), s), 'body')]
    arm = build_armature('Ladybug', bones)

    P = Parts()
    P.add(sphere('Ladybug belly', (.0036, .0042, .0021), V(0, .0004, .0026), black, seg=6, rings=4), 'body')
    P.add(sphere('Ladybug head', Hr, Hc, black, seg=7, rings=4), 'body')
    spots = ((38, .43, .00095), (78, .60, .00085), (34, .78, .00085))
    for s, sd in ((1, 'L'), (-1, 'R')):
        a0, a1 = (1.5, 106) if s > 0 else (-106, -1.5)
        P.add(ell_patch(f'Ladybug elytron {sd}', Ec, Er, a0, a1, math.radians(42), math.radians(170), 4, 4, shell),
              f'elytron_{sd}', lambda co: .82 if co.z < .0042 else 1.0)
        for k, (a, t, r) in enumerate(spots):
            d = ell_pt(Ec, Er, math.radians(a * s), t * math.pi) - Ec
            P.add(surface_disc(f'Ladybug spot {sd}{k}', Ec, Er, d, r, black, count=6, off=.00008), f'elytron_{sd}')
        # cheek-eyes: white ovals with a dark pupil
        P.add(surface_disc(f'Ladybug eye {sd}', Hc, Hr, sx(V(.62, -.72, .3), s), .00085, pale, count=6, off=.00005),
              'body')
        P.add(surface_disc(f'Ladybug pupil {sd}', Hc, Hr, sx(V(.5, -.84, .28), s), .00042, pale, count=5,
                           off=.00011), 'body', .08)
        P.add(stick(f'Ladybug antenna {sd}', [sx(V(.0008, -.0058, .0036), s), sx(V(.0021, -.0076, .0047), s)], .00028,
                    black), 'body')
        for k, y in enumerate((-.0024, .0002, .0026)):
            P.add(stick(f'Ladybug leg {sd}{k}', [sx(V(.0017, y, .0014), s), sx(V(.0045, y * 1.25, .0001), s)], .00042,
                        black, taper=.6), 'body')
        # hind wing folded flat under the wing case; unfolds sideways in Fly
        root = sx(V(.0011, -.0016, .0049), s)
        out = [sx(V(.0008, -.0010, .0049), s), sx(V(.0018, .0004, .0049), s), sx(V(.0022, .0021, .0048), s),
               sx(V(.0017, .0035, .0047), s), sx(V(.0006, .0031, .0048), s), sx(V(.0002, .0010, .0049), s)]
        P.add(fan(f'Ladybug wing {sd}', root, out, pale, up=Zv), f'wing_{sd}', (.78, .8, .86))
    finish('ladybug', arm, P, dict(rays=32, distance=.0035, strength=.5, ground=0.0))

    # Idle (3 s): breathing, looks around, the wing cases twitch once
    clip(arm, 'Idle', 90, {
        'body@loc': lambda p: (0, 0, .00008 * S(p, 3)),
        'body': lambda p: (1.5 * S(p, 3), 0, 9 * S(p, 1) * (1 - .4 * pulse(p, .5, .2))),
        'elytron_L': lambda p: (3 * pulse(p, .62, .03), -5 * pulse(p, .62, .03), 0),
        'elytron_R': lambda p: (3 * pulse(p, .62, .03), 5 * pulse(p, .62, .03), 0)})

    # Fly (once, 0.8 s): wing cases pop open and up, hind wings unfold sideways and buzz, body lifts nose-up
    def opn(p):
        return smooth(p / .3)

    def unfold(p):
        return smooth((p - .18) / .3)

    def buzz(p):
        return smooth((p - .3) / .15) * (1 if int(p * 24) % 2 else -1)

    ch = {'body@loc': lambda p: (0, 0, .003 * smooth((p - .45) / .55)),
          'body': lambda p: (-16 * smooth((p - .3) / .5), 0, 0)}
    for s, sd in ((1, 'L'), (-1, 'R')):
        ch[f'elytron_{sd}'] = (lambda s: lambda p: rot((Zv, -24 * s * opn(p)), (Yv, -72 * s * opn(p)), (Xv, 22 * opn(p))))(s)
        ch[f'wing_{sd}'] = (lambda s: lambda p: rot((Zv, -80 * s * unfold(p)), (Xv, 8 * unfold(p) + 34 * buzz(p))))(s)
    clip(arm, 'Fly', 24, ch, loop=False)
    export_critter('ladybug', arm)

# ====================================================================== DRAGONFLY


def build_dragonfly():
    """Dragonfly, 7 cm span: teal body with dark abdomen bands, big wrap-around blue eyes, four clear
    light wings with an amber root and a dark wing-tip spot. Fly buzzes fore and hind wings out of phase."""
    reset()
    body_m = mat('Dragonfly body', '#1bb4a6', rough=.3)
    eye_m = mat('Dragonfly eye', '#2f62d8', rough=.12)
    wing_m = mat('Dragonfly wing', '#e9f7ff', rough=.15, alpha=.5, double=True, emit=.15)
    T, Tr = V(0, -.0058, .0080), (.0042, .0064, .0050)
    bones = [('root', (0, 0, 0), (0, 0, .003), None),
             ('body', (0, .000, .0080), (0, -.008, .0080), 'root'),
             ('tail', (0, .0130, .0086), (0, .030, .0090), 'body')]
    wings = {'F': (-.0082, .0080, [(-.0012, -.0010), (.0100, -.0026), (.0220, -.0028), (.0330, -.0012), (.0350, .0010),
                                   (.0290, .0026), (.0160, .0030), (.0040, .0016)]),
             'B': (-.0020, .0092, [(-.0010, -.0012), (.0100, -.0026), (.0210, -.0026), (.0315, -.0008), (.0330, .0016),
                                   (.0270, .0040), (.0140, .0052), (.0035, .0030)])}
    for s, sd in ((1, 'L'), (-1, 'R')):
        for k, (y0, _, _) in wings.items():
            bones.append((f'wing_{k}{sd}', sx(V(.0020, y0, .0122), s), sx(V(.0120, y0, .0122), s), 'body'))
    arm = build_armature('Dragonfly', bones)

    P = Parts()
    P.add(sphere('Dragonfly thorax', Tr, T, body_m, seg=6, rings=4), 'body', lambda co: .7 if co.z < .006 else 1.0)
    for s, sd in ((1, 'L'), (-1, 'R')):
        P.add(sphere(f'Dragonfly eye {sd}', .0041, sx(V(.0030, -.0142, .0094), s), eye_m, seg=6, rings=4), 'body',
              lambda co: .75 if co.z < .008 else 1.0)
    ab_pts = [V(0, .0005 + .0058 * k, .0084 + .00008 * k) for k in range(8)]
    ab = stick('Dragonfly abdomen', ab_pts, .0019, body_m, verts=4, caps=True)
    # bands: darken the rings at segment joints (every other ring) and the tip
    P.add(bind_blend(ab, 'body', 'tail', ramp(1, .006, .02)), None,
          lambda co: (.3 if (round((co.y - .0005) / .0058) % 2) else 1.0) * (.45 if co.y > .039 else 1.0))
    for s, sd in ((1, 'L'), (-1, 'R')):
        for k, (y0, ref, outline) in wings.items():
            root = sx(V(.0020, y0, .0122), s)
            out = [sx(V(.0020 + x, y0 + y, .0122), s) for x, y in outline]
            # amber root, clear panel, darker leading edge and a dark pterostigma near the tip (outline index 3)
            edge = lambda i: .2 if i == 3 else (.72 if i < 3 else 1.0)
            P.add(wing(f'Dragonfly wing {k}{sd}', root, out, wing_m, rings=(.5,), colors=[(1.0, .8, .5), 1.0, edge]),
                  f'wing_{k}{sd}')
    finish('dragonfly', arm, P, dict(rays=24, distance=.006, strength=.45))

    # Fly (loop, 0.8 s): 6 wing beats per loop, hind wings a quarter beat behind; body bobs, tail sways
    ch = {'body@loc': lambda p: (0, 0, .0012 * S(p, 1)),
          'body': lambda p: (2 * S(p, 1, .25), 0, 3 * S(p, 1, .1)),
          'tail': lambda p: (3 * S(p, 1, .4), 0, 4 * S(p, 1, .15))}
    for s, sd in ((1, 'L'), (-1, 'R')):
        ch[f'wing_F{sd}'] = (lambda s: lambda p: (0, -s * (8 + 34 * S(p, 6)), 0))(s)
        ch[f'wing_B{sd}'] = (lambda s: lambda p: (0, -s * (6 + 34 * S(p, 6, -.25)), 0))(s)
    clip(arm, 'Fly', 24, ch)
    export_critter('dragonfly', arm)

# ====================================================================== BUTTERFLY


def build_butterfly():
    """Butterfly, 6 cm span: dark fuzzy body with clubbed antennae; four wings on one tintable
    'Butterfly wing' material whose pattern (dark border, bright panel, darker root) is vertex paint,
    so the runtime picks a colour per butterfly (variants in the material extras)."""
    reset()
    wing_m = mat('Butterfly wing', '#ff8c2e', rough=.5, double=True)
    wing_m['variants'] = '#ff8c2e,#62b8ff'
    body_m = mat('Butterfly body', '#3d2a22', rough=.7)
    bones = [('root', (0, 0, 0), (0, 0, .003), None),
             ('body', (0, .000, .0060), (0, -.008, .0060), 'root')]
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones.append((f'wing_{sd}', sx(V(.0017, -.0040, .0074), s), sx(V(.0017, .0040, .0074), s), 'body'))
    arm = build_armature('Butterfly', bones)

    P = Parts()
    P.add(stick('Butterfly body', [V(0, -.0062, .0063), V(0, -.0020, .0062), V(0, .0050, .0058), V(0, .0125, .0054)],
                .0021, body_m, verts=5, taper=.5, caps=True), 'body', lambda co: .75 if co.z < .0055 else 1.0)
    P.add(sphere('Butterfly head', .0026, V(0, -.0086, .0068), body_m, seg=6, rings=4), 'body',
          lambda co: .4 if co.y < -.0095 and abs(co.x) > .0012 else 1.0)
    for s, sd in ((1, 'L'), (-1, 'R')):
        a = [sx(V(.0009, -.0102, .0086), s), sx(V(.0028, -.0165, .0125), s), sx(V(.0046, -.0218, .0146), s)]
        P.add(stick(f'Butterfly antenna {sd}', a, .00035, body_m), 'body')
        P.add(sphere(f'Butterfly club {sd}', (.0008, .0011, .0008), a[-1], body_m, seg=4, rings=3), 'body')
        fore = [(.0005, -.0030), (.0100, -.0100), (.0225, -.0140), (.0290, -.0110), (.0278, -.0030),
                (.0195, .0020), (.0095, .0035), (.0012, .0015)]
        hindw = [(.0010, .0030), (.0120, .0035), (.0205, .0075), (.0215, .0150), (.0150, .0205),
                 (.0080, .0215), (.0035, .0150), (.0006, .0075)]
        for nm, root, outline in (('fore', V(.0017, -.0035, .0074), fore), ('hind', V(.0016, .0010, .0072), hindw)):
            out = [sx(V(.0017 + x, y, root.z), s) for x, y in outline]
            # dusky root -> bright panel (the runtime tint) -> crisp dark border (rings at .72 and .8)
            border = .17 if nm == 'fore' else .22
            P.add(wing(f'Butterfly {nm} wing {sd}', sx(root, s), out, wing_m, rings=(.72, .8),
                       colors=[.42, 1.0, border, lambda i: .55 if (nm == 'fore' and i == 3) else border]), f'wing_{sd}')
    finish('butterfly', arm, P, dict(rays=24, distance=.006, strength=.45))

    # Rest (loop, 4 s, listed first so importers show it): wings ease from nearly flat open (18 deg)
    # to closed together above the back (82 deg) and open again; tiny breathing
    def rest_angle(p):
        return 18 + 64 * smooth(.5 - .5 * math.cos(TAU * p))
    clip(arm, 'Rest', 120, {
        'body@loc': lambda p: (0, 0, .00006 * S(p, 2)),
        'wing_L': lambda p: (0, -rest_angle(p), 0),
        'wing_R': lambda p: (0, rest_angle(p), 0)})

    # Fly (loop, 0.4 s): full flap from 75 deg up to 25 deg down; the body rises on the downstroke
    def flap(p):
        return 25 + 50 * C(p, 1)
    clip(arm, 'Fly', 12, {
        'body@loc': lambda p: (0, 0, -.0016 * C(p, 1, .1)),
        'body': lambda p: (-4 * S(p, 1), 0, 0),
        'wing_L': lambda p: (0, -flap(p), 0),
        'wing_R': lambda p: (0, flap(p), 0)})
    export_critter('butterfly', arm)


BUILDERS = {'cricket': build_cricket, 'spider': build_spider, 'spider-web': build_web, 'ladybug': build_ladybug,
            'dragonfly': build_dragonfly, 'butterfly': build_butterfly}


def main():
    for nm in ONLY:
        BUILDERS[nm]()
    print('RESULTS')
    for nm, r in RESULTS.items():
        print(f'  {nm:12s} {r["tris"]:5d} tris {r["kb"]:6.1f} KB mats={r["mats"]} clips={r["clips"]}')
    if not NO_SAVE:
        have = [n for n in ALL if os.path.exists(os.path.join(OUT, n + '.glb'))]
        save_kit('critters', have, spacing=.05)


main()
