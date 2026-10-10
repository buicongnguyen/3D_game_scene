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

  cricket    5 cm long   Idle, Chirp (loop: the two forewings lift and scissor), Hop (once, in-place arc 4 cm)
  spider     3.3 cm body Idle (legs shift), Walk (~0.05 m/s)        + static 'spider-web' (0.6 m)
  ladybug    1 cm        Idle, Fly (once: wing cases open, wings unfold and buzz)
  dragonfly  7 cm span   Fly (loop: wing buzz)
  butterfly  6 cm span   Fly (loop flap), Rest (wings slowly open/close); 'Butterfly wing' is tinted
                         by the runtime (material extras: variants = two sRGB hex colours)
  frog-tree  4 cm      Idle, Croak (loop: the throat bone scales up), Hop (once, 5 cm arc), Swim (loop kick)
  frog-pond  7 cm      same rig and clips (frog-tree x 1.75), olive with painted blotches
  firefly    1.5 cm    Rest, Fly (loop); tail on the emissive 'Firefly glow' the runtime pulses
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *  # noqa: F401,F403
from rig import build_armature, bind, bind_blend, ramp, skin, export_rigged, clip, FPS
from animal_kit import S, C, pulse, window, smooth, lerp, tri_count
from mathutils import Quaternion, noise

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ALL = ['cricket', 'spider', 'spider-web', 'ladybug', 'dragonfly', 'butterfly', 'frog-tree', 'frog-pond', 'firefly']
ONLY = ALL
if '--only' in ARGV:
    ONLY = [n.strip() for n in ARGV[ARGV.index('--only') + 1].split(',') if n.strip()]
NO_SAVE = '--no-save' in ARGV
BUDGET = {'cricket': 300, 'spider': 300, 'spider-web': 400, 'ladybug': 300, 'dragonfly': 300, 'butterfly': 300, 'frog-tree': 300, 'frog-pond': 300,
          'firefly': 300}
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
    """Field cricket (enma-korogi), 5 cm: glossy chestnut brown, a round head as wide as the saddle-shaped
    pronotum, a stout abdomen that follows on without a waist, two dark forewings lying flat on the back
    (right over left), two tail spikes (cerci), long sweeping antennae and chunky jumping legs. Six legs,
    all on the thorax. Males sing by rubbing the two raised forewings together, so Chirp moves the wings,
    not the legs."""
    reset()
    body_m = mat('Cricket body', '#8f5626', rough=.5)
    wing_m = mat('Cricket wing', '#4f2b14', rough=.38)
    eye_m = mat('Cricket eye', '#241812', rough=.12)
    H, Hr = V(0, -.0146, .0106), (.0064, .0060, .0068)
    T, Tr = V(0, -.0066, .0102), (.0066, .0070, .0062)
    A, Ar = V(0, .0090, .0090), (.0066, .0150, .0060)

    bones = [('root', (0, 0, 0), (0, 0, .004), None),
             ('body', (0, -.006, .010), (0, -.016, .010), 'root'),
             ('wings', (0, -.0030, .0142), (0, .012, .0142), 'body')]
    hind = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        hip, knee, foot = sx(V(.0058, -.0008, .0068), s), sx(V(.0108, .0150, .0168), s), sx(V(.0128, .0262, .0006), s)
        hind[sd] = (hip, knee, foot)
        ab = sx(V(.0022, -.0200, .0152), s)
        bones += [(f'antenna_{sd}', ab, sx(V(.0070, -.0350, .0240), s), 'body'),
                  (f'wing_{sd}', sx(V(.0016, -.0030, .0142), s), sx(V(.0016, .012, .0142), s), 'wings'),
                  (f'thigh_{sd}', hip, knee, 'body'), (f'shin_{sd}', knee, foot, f'thigh_{sd}')]
    arm = build_armature('Cricket', bones)

    P = Parts()
    underside = lambda co: .72 if co.z < .0075 else 1.0
    P.add(sphere('Cricket head', Hr, H, body_m, seg=7, rings=4), 'body', lambda co: .78 if co.z < .008 else 1.0)
    # pronotum: darker than the head, like a little saddle
    P.add(sphere('Cricket thorax', Tr, T, body_m, seg=6, rings=3), 'body', lambda co: .55 if co.z < .0075 else .72)
    P.add(sphere('Cricket abdomen', Ar, A, body_m, seg=7, rings=4), 'body',
          lambda co: (.7 if co.z < .0075 else 1.0) * (.8 if int((co.y - .0) / .0055) % 2 else 1.0))
    # two forewings (tegmina) flat on the back, the right one over the left; a pale vein along the outer edge
    for s, sd, grow in ((1, 'L', 1.0), (-1, 'R', 1.035)):
        a0, a1 = (-10, 76) if s > 0 else (-76, 10)
        P.add(ell_patch(f'Cricket wing {sd}', A, (Ar[0] * 1.07 * grow, Ar[1] * .98, Ar[2] * 1.1 * grow),
                        a0, a1, math.radians(36), math.radians(150), 2, 3, wing_m), f'wing_{sd}',
              lambda co: 1.45 if abs(co.x) > .0056 else 1.0)
    for s, sd in ((1, 'L'), (-1, 'R')):
        P.add(sphere(f'Cricket eye {sd}', .0025, sx(V(.0050, -.0176, .0134), s), eye_m, seg=5, rings=3), 'body')
        P.add(stick(f'Cricket antenna {sd}', [sx(V(.0022, -.0200, .0152), s), sx(V(.0070, -.0350, .0240), s),
                                              sx(V(.0165, -.0500, .0255), s)], .0007, body_m, taper=.5), f'antenna_{sd}', .6)
        # cerci: the two tail spikes every cricket carries
        P.add(stick(f'Cricket cercus {sd}', [sx(V(.0022, .0222, .0086), s), sx(V(.0058, .0330, .0112), s)], .0007, body_m,
                    taper=.4), 'body', .6)
        for nm, pts in (('front', (V(.0042, -.0100, .0064), V(.0100, -.0132, .0085), V(.0125, -.0176, .0004))),
                        ('mid', (V(.0048, -.0050, .0064), V(.0122, -.0034, .0085), V(.0165, -.0006, .0004)))):
            P.add(stick(f'Cricket {nm} leg {sd}', [sx(p, s) for p in pts], .0009, body_m, taper=.6), 'body', 1.15)
        hip, knee, foot = hind[sd]
        P.add(stick(f'Cricket thigh {sd}', [hip, hip.lerp(knee, .45) + sx(V(.0006, 0, .0008), s), knee], .0024, body_m,
                    verts=4, taper=.45), f'thigh_{sd}', lambda co: .85 if co.z < .011 else 1.0)
        P.add(stick(f'Cricket shin {sd}', [knee, foot], .0008, body_m, taper=.7), f'shin_{sd}', 1.1)
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

    # Chirp (loop, 0.8 s): the forewings lift off the back and scissor quickly across each other (the file on one
    # wing scrapes the edge of the other: that is the song). Three bursts with short rests, like the real call;
    # the body hums along and the legs stay planted.
    def burst(p):
        return max(window(p, .02, .26, .25), window(p, .35, .59, .25), window(p, .68, .92, .25))

    def chirp_ch():
        lift = lambda p: 30 + 6 * burst(p)
        ch = {'wings': lambda p: (lift(p), 0, 0),
              'wing_L': lambda p: (0, 0, 3 + 5 * S(p, 6) * burst(p)),
              'wing_R': lambda p: (0, 0, -3 - 5 * S(p, 6) * burst(p)),
              'body': lambda p: (-4 + .7 * S(p, 6) * burst(p), 0, 0),
              'body@loc': lambda p: (0, 0, .00018 * S(p, 6) * burst(p))}      # no leg channels: the legs rest
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
    two body parts (legs on the front one), eight eyes (two big friendly ones with dark pupils plus six
    small beads), eight short banded legs and no antennae."""
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
        # spiders have eight eyes: the two big front ones plus six small dark beads (a pair below, two pairs
        # up the sides of the head). Three triangles each, painted on the eye material.
        for k, (d, r) in enumerate(((V(.17, -1, .06), .00105), (V(.80, -.62, .50), .00095), (V(.78, -.20, .78), .00085))):
            P.add(surface_disc(f'Spider small eye {sd}{k}', H, Hr, sx(d, s), r, eye_m, count=3, off=.00016), 'body', .05)
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


def web_parts(width=1.0, bead=1.0):
    """The orb web's two meshes (no reset): silk ribbons and the joined dew drops. width / bead scale the
    ribbon width and the drop radius (the trick-dew icon scene uses fatter ones so they read at 48 px)."""
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
        n = d.cross(Yv).normalized() * w * width / 2
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
        r = rng.uniform(.0060, .0090) * bead
        drops.append(sphere(f'Web dew {i}', (r, r, r * 1.1), p, dew, seg=4, rings=3))
    d = join(drops, 'dew')
    d.data.transform(Matrix.Translation(d.location))        # the node's origin is the web's hub, not the first drop
    d.location = (0, 0, 0)
    return web, d


def build_web():
    """Static orb web, 0.6 m across, origin at its hub, lying in the XZ plane (faces -Y in Blender = +Z
    in three.js, where it lies in XY). Thin double-sided silk ribbons (the root mesh 'spider_web') plus dew
    drops that catch the light on their own child node 'dew' (material 'Web dew'), so the Dew Webs trick
    can make the drops sparkle or hide them without touching the silk."""
    reset()
    web, d = web_parts()
    paint(web, 1.0)
    ensure_color([web, d])
    web.name = web.data.name = 'spider_web'
    set_parent(d, web)
    info = export('spider-web', [web])
    RESULTS['spider-web'] = dict(tris=info['tris'], kb=info['bytes'] / 1024, clips=[], mats=info['materials'])
    assert info['tris'] <= BUDGET['spider-web'], info

# ====================================================================== LADYBUG


def build_ladybug():
    """Seven-spot ladybird (nanahoshi-tento), 1 cm: glossy red wing cases with seven black spots (three on
    each case plus one shared across the seam just behind the shield), black head with white cheek-eyes.
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
        # the seventh spot straddles the seam: half of it rides on each wing case, so it splits when they open
        d = ell_pt(Ec, Er, math.radians(8.5 * s), .335 * math.pi) - Ec
        P.add(surface_disc(f'Ladybug seam spot {sd}', Ec, Er, d, .00072, black, count=5, off=.00008), f'elytron_{sd}')
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
    light wings held out flat with an amber root and a dark wing-tip spot, and six thin legs bunched
    forward under the thorax (the "basket" it catches midges with). Fly buzzes fore and hind wings out of phase."""
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
        # six legs, all on the thorax, angled forward and down
        for k, (y, reach) in enumerate(((-.0096, 1.0), (-.0072, 1.1), (-.0046, 1.2))):
            P.add(stick(f'Dragonfly leg {sd}{k}', [sx(V(.0016, y, .0042), s), sx(V(.0016 + .0030 * reach, y - .0030, .0003), s)],
                        .00042, body_m, taper=.6), 'body', .3)
    ab_pts =[V(0, .0005 + .0058 * k, .0084 + .00008 * k) for k in range(8)]
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
    """Butterfly, 6 cm span: dark fuzzy body with clubbed antennae and six thin legs under the thorax
    (it perches on them, so the body no longer floats); four wings (fore + hind each side) on one tintable
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
    P.add(sphere('Butterfly head', .0026, V(0, -.0086, .0068), body_m, seg=5, rings=3), 'body',
          lambda co: .4 if co.y < -.0095 and abs(co.x) > .0012 else 1.0)
    for s, sd in ((1, 'L'), (-1, 'R')):
        a = [sx(V(.0009, -.0102, .0086), s), sx(V(.0028, -.0165, .0125), s), sx(V(.0046, -.0218, .0146), s)]
        P.add(stick(f'Butterfly antenna {sd}', a, .00035, body_m), 'body')
        P.add(sphere(f'Butterfly club {sd}', (.0008, .0011, .0008), a[-1], body_m, seg=4, rings=3), 'body')
        for k, (y, y1) in enumerate(((-.0056, -.0092), (-.0030, -.0034), (-.0004, .0030))):
            P.add(stick(f'Butterfly leg {sd}{k}', [sx(V(.0010, y, .0050), s), sx(V(.0046, y1, .0002), s)], .00034, body_m,
                        taper=.6), 'body', .8)
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


# ====================================================================== FROGS


def scale_keys(arm, act, bone, frames, fn, loop=True):
    """Key a bone's uniform scale into an action made by rig.clip (the throat sac inflates by scale)."""
    arm.animation_data.action = act
    try:
        if act.slots:
            arm.animation_data.action_slot = act.slots[0]
    except Exception:
        pass
    pb = arm.pose.bones[bone]
    for f in range(frames + 1):
        p = 0.0 if (loop and f == frames) else f / frames
        s = fn(p)
        pb.scale = (s, s, s)
        pb.keyframe_insert('scale', frame=f)
    pb.scale = (1, 1, 1)
    arm.animation_data.action = None


def foot_fan(name, base, direction, length, spread, n, material, z=None):
    """Webbed foot/hand: a fan of n toe tips spread around `direction` (degrees), flat on the ground."""
    base = Vector(base)
    d = Vector((direction[0], direction[1], 0)).normalized()
    ring = []
    for i in range(n):
        a = math.radians(lerp(-spread, spread, i / (n - 1)))
        tip = base + (Quaternion(Zv, a) @ d) * length * (1.0 if i % 2 == 0 else .82)
        tip.z = base.z if z is None else z
        ring.append(tip)
    return fan(name, base + d * length * .15, [base] + ring, material, up=Zv)


def toes(name, base, direction, length, spread, n, material, z=None, pad=True):
    """Separate (unwebbed) toes, one triangle each, flat on the ground: pad=True widens every toe to a blunt
    round-looking tip (a tree frog's sticky toe pads), pad=False tapers it to a point (a pond frog's fingers)."""
    base = Vector(base)
    d = Vector((direction[0], direction[1], 0)).normalized()
    bm = bmesh.new()
    zt = base.z if z is None else z
    for i in range(n):
        a = math.radians(lerp(-spread, spread, i / (n - 1)))
        u = Quaternion(Zv, a) @ d
        w = Zv.cross(u) * length
        tip = base + u * length * (1.0 if 0 < i < n - 1 else .86)
        tip.z = zt
        if pad:
            tri = (base, tip - w * .2, tip + w * .2)
        else:
            tri = (base - w * .1, tip, base + w * .1)
        f = bm.faces.new([bm.verts.new(q) for q in tri])
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return from_bmesh(name, bm, material, smooth_angle=80)


def build_frog(name, k, skin_hex, belly_hex, eye_hex, hop_h, look):
    """Frog at real size (k = 1 is a 4 cm tree frog). Faces -Y, origin on the ground under the body.
    One skin material (spots and stripes painted), a cream belly + throat sac material, glossy eyes
    with a painted horizontal pupil. The throat sac is its own bone ('throat') that Croak scales up."""
    reset()
    skin_m = mat('Frog skin', skin_hex, rough=.32)
    belly_m = mat('Frog belly', belly_hex, rough=.45)
    eye_m = mat('Frog eye', eye_hex, rough=.08)

    def K(x, y, z):
        return V(x * k, y * k, z * k)

    B, Br = K(0, .0030, .0088), tuple(r * k for r in (.0108, .0148, .0080))
    Hc, Hr = K(0, -.0102, .0120), tuple(r * k for r in (.0112, .0088, .0070))
    bones = [('root', (0, 0, 0), K(0, 0, .004), None),
             ('body', K(0, .0120, .0090), K(0, -.0040, .0110), 'root'),
             ('head', K(0, -.0060, .0125), K(0, -.0180, .0135), 'body'),
             ("throat", K(0, -.0140, .0058), K(0, -.0140, .0088), 'head')]
    legs = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        sh, hand = sx(K(.0072, -.0072, .0072), s), sx(K(.0098, -.0138, .0006), s)
        hip, knee, ankle = sx(K(.0078, .0122, .0072), s), sx(K(.0168, .0040, .0060), s), sx(K(.0118, .0172, .0022), s)
        toe = sx(K(.0182, .0050, .0006), s)
        legs[sd] = (sh, hand, hip, knee, ankle, toe)
        bones += [(f'arm_{sd}', sh, hand, 'body'), (f'thigh_{sd}', hip, knee, 'body'),
                  (f'shin_{sd}', knee, ankle, f'thigh_{sd}'), (f'foot_{sd}', ankle, toe, f'shin_{sd}')]
    arm = build_armature(''.join(w.title() for w in name.split('-')), bones)

    P = Parts()
    P.add(sphere(f'{name} body', Br, B, skin_m, seg=7, rings=4), 'body', look['back'])
    P.add(sphere(f'{name} belly', tuple(r * f for r, f in zip(Br, (.9, .9, .62))), B + K(0, -.0005, -.0030), belly_m,
                 seg=5, rings=3), 'body', 1.0)
    P.add(sphere(f'{name} head', Hr, Hc, skin_m, seg=7, rings=4), 'head', look['head'])
    P.add(sphere(f"{name} sac", tuple(r * k for r in (.0060, .0052, .0040)), K(0, -.0140, .0060), belly_m, seg=7, rings=4),
          'throat', 1.0)
    for s, sd in ((1, 'L'), (-1, 'R')):
        ec, er = sx(K(.0066, -.0118, .0178), s), .0043 * k
        P.add(sphere(f'{name} eye {sd}', er, ec, eye_m, seg=6, rings=4), 'head', 1.0)
        P.add(surface_disc(f'{name} pupil {sd}', ec, (er,) * 3, sx(V(.38, -.88, .28), s), er * .66, eye_m, count=6,
                           off=er * .03, shape=lambda a: (math.cos(a), .72 * math.sin(a))), 'head', .05)
        sh, hand, hip, knee, ankle, toe = legs[sd]
        elbow = sx(K(.0102, -.0098, .0042), s)
        P.add(stick(f"{name} arm {sd}", [sh, hand + K(0, 0, .0006)], .0021 * k, skin_m, taper=.7), f'arm_{sd}',
              look['limb'])
        # four unwebbed fingers on every frog; the tree frog's end in toe pads
        P.add(toes(f'{name} hand {sd}', hand, sx(V(.25, -1, 0), s), .0046 * k, 56, 4, skin_m, z=hand.z, pad=look['pads']),
              f'arm_{sd}', look['limb'])
        P.add(stick(f'{name} thigh {sd}', [hip, knee], .0042 * k, skin_m, verts=5, taper=.55), f'thigh_{sd}', look['leg'])
        P.add(stick(f'{name} shin {sd}', [knee, ankle], .0025 * k, skin_m, taper=.65), f'shin_{sd}', look['leg'])
        if look['pads']:        # tree frog: long separate hind toes with pads (it climbs); pond frog: a webbed paddle
            P.add(toes(f'{name} foot {sd}', ankle + K(0, 0, -.0016), sx(V(.45, -1, 0), s), .0108 * k, 30, 4, skin_m,
                       z=.0004 * k, pad=True), f'foot_{sd}', look['limb'])
        else:
            P.add(foot_fan(f'{name} foot {sd}', ankle + K(0, 0, -.0016), sx(V(.45, -1, 0), s), .0105 * k, 24, 4, skin_m,
                           z=.0004 * k), f'foot_{sd}', look['limb'])
        if look.get('extra'):
            look['extra'](P, s, sd, skin_m, B, Br, Hc, Hr)
    finish(name, arm, P, dict(rays=32, distance=.012 * k, strength=.5, ground=0.0))

    acts = {}
    # Idle (loop 3 s): breathing, the throat pumps, the head looks about
    acts['Idle'] = clip(arm, 'Idle', 90, {
        'body@loc': lambda p: (0, 0, .00018 * k * S(p, 3)),
        'body': lambda p: (1.0 * S(p, 3), 0, 0),
        'head': lambda p: (-2 * pulse(p, .55, .12), 0, 7 * S(p, 1, .2) * (1 - .5 * pulse(p, .5, .2)))})

    # Croak (loop 1.2 s): the sac swells to ~2.2x and trembles, the body squeezes, the head lifts
    def inflate(p):
        return smooth(p / .28) * (1 - smooth((p - .62) / .26))
    acts['Croak'] = clip(arm, 'Croak', 36, {
        'body@loc': lambda p: (0, 0, -.0005 * k * inflate(p)),
        'body': lambda p: (-3 * inflate(p), 0, 0),
        'head': lambda p: (-9 * inflate(p), 0, 0)})

    # Hop (once, 0.6 s): crouch, the hind legs kick straight back, in-place arc, arms reach for the landing
    def air(p):
        return math.sin(math.pi * (p - .25) / .55) if .25 < p < .8 else 0.0

    def crouch(p):
        return window(p, 0, .3, .5) + .7 * window(p, .78, 1.0, .5)

    def kick(p):
        return window(p, .22, .78, .25)
    hop = {'body@loc': lambda p: (0, 0, hop_h * air(p) - .0018 * k * crouch(p)),
           'body': lambda p: (4 * crouch(p) - 22 * window(p, .22, .52, .4) + 14 * window(p, .52, .82, .4), 0, 0),
           'head': lambda p: (6 * window(p, .25, .6, .4), 0, 0)}
    for s, sd in ((1, 'L'), (-1, 'R')):
        hop[f'thigh_{sd}'] = lambda p: (-10 * crouch(p) + 120 * kick(p), 0, 0)
        hop[f'shin_{sd}'] = lambda p: (8 * crouch(p) - 140 * kick(p), 0, 0)
        hop[f'foot_{sd}'] = lambda p: (120 * kick(p), 0, 0)
        hop[f'arm_{sd}'] = lambda p: (40 * window(p, .25, .55, .4) - 35 * window(p, .55, .85, .4), 0, 0)
    acts['Hop'] = clip(arm, 'Hop', 18, hop, loop=False)

    # Swim (loop 0.8 s): a quick frog kick (legs push back and together), then a slow glide and refold
    def ext(p):
        return smooth(p / .22) if p < .22 else 1 - smooth((p - .3) / .65)
    sw = {'body@loc': lambda p: (0, 0, .0006 * k * S(p, 1, .1)),
          'body': lambda p: (-6 + 2 * ext(p), 0, 0),
          'head': lambda p: (-4, 0, 0)}
    for s, sd in ((1, 'L'), (-1, 'R')):
        sw[f"thigh_{sd}"] = (lambda s: lambda p: rot((Zv, -s * 12 * ext(p)), (Xv, 150 * ext(p))))(s)
        sw[f"shin_{sd}"] = lambda p: (-145 * ext(p), 0, 0)
        sw[f"foot_{sd}"] = lambda p: (125 * ext(p), 0, 0)
        sw[f"arm_{sd}"] = (lambda s: lambda p: rot((Xv, 80), (Zv, -s * 25)))(s)
    acts['Swim'] = clip(arm, 'Swim', 24, sw)

    scale_keys(arm, acts['Idle'], 'throat', 90, lambda p: 1 + .14 * max(0.0, S(p, 6)))
    scale_keys(arm, acts['Croak'], 'throat', 36, lambda p: 1 + .95 * inflate(p) + .05 * S(p, 9) * inflate(p))
    scale_keys(arm, acts['Hop'], 'throat', 18, lambda p: 1.0, loop=False)
    scale_keys(arm, acts['Swim'], 'throat', 24, lambda p: 1.0)
    export_critter(name, arm)


def build_frog_tree():
    """Japanese tree frog, 4 cm: bright leaf green with a dark stripe from the nostril through the eye to the
    shoulder (the mark that tells it from other green frogs), cream belly and a single throat sac, big golden
    eyes, and separate toes ending in round sticky pads on all four feet."""
    def extra(P, s, sd, skin_m, B, Br, Hc, Hr):
        # the eye stripe is its own little patch on the head (vertex paint alone is too coarse to hold a line)
        a0, a1 = (58, 80) if s > 0 else (-80, -58)
        P.add(ell_patch(f'frog-tree stripe {sd}', Hc, tuple(r * 1.006 for r in Hr), a0, a1, math.radians(34),
                        math.radians(140), 1, 2, skin_m), 'head', (.42, .13, .3))
    build_frog('frog-tree', 1.0, '#5fd42a', '#fff2c4', '#f7b52a', .05,
               dict(back=lambda co: .84 if co.z < .0070 else 1.0, head=lambda co: .8 if co.z < .0095 else 1.0,
                    limb=.9, leg=lambda co: .85 if co.z < .0035 else 1.0, pads=True, extra=extra))


def build_frog_pond():
    """Pond frog, 7 cm: warm olive brown-green with dark brown blotches, a pale stripe down the back,
    cream belly, coppery eyes, pointed unwebbed fingers and big webbed hind feet for swimming (no toe pads:
    it lives on the ground and in the water)."""
    k = 1.75
    SPOTS = [(.006, .010, .016), (-.007, .006, .016), (.009, -.001, .013), (-.010, .013, .011), (.002, .015, .015),
             (-.004, -.004, .018), (.007, -.012, .017), (-.006, -.013, .016), (.013, .010, .008), (-.013, .002, .008),
             (.015, .006, .004), (-.016, .008, .004)]

    def K_(x, y, z):
        return Vector((x * k, y * k, z * k))

    def blotch(co, base=1.0):
        n = max((1.0 - (co - K_(*c)).length / (.0062 * k)) for c in SPOTS)
        return (.2, .15, .07) if n > 0 else (base, base, base)

    def extra(P, s, sd, skin_m, B, Br, Hc, Hr):
        if s < 0:
            return
        # the pale stripe down the middle of the back, as its own strip (paint alone cannot hold a line)
        P.add(ell_patch('frog-pond dorsal stripe', B, tuple(r * 1.045 for r in Br), -8, 8, math.radians(38),
                        math.radians(166), 1, 4, skin_m), 'body', (1.75, 1.5, .95))
    build_frog('frog-pond', k, '#7f9a2e', '#fbe7b4', '#e0832e', .085,
               dict(back=lambda co: blotch(co, .85 if co.z < .0070 * k else 1.0),
                    head=lambda co: blotch(co, .86 if co.z < .0095 * k else 1.0),
                    limb=lambda co: blotch(co, .9), leg=lambda co: blotch(co, .85 if co.z < .0035 * k else 1.0),
                    pads=False, extra=extra))

# ====================================================================== FIREFLY


def build_firefly():
    """Genji firefly, 1.5 cm: black wing cases, a pink-red shield with a dark cross behind the big
    head, a pale belly and a glowing yellow-green tail (material 'Firefly glow', emissive: the runtime
    pulses its emissiveIntensity). Fly opens the cases and buzzes the clear hind wings."""
    reset()
    dark = mat('Firefly body', '#2c2733', rough=.3)
    pale = mat('Firefly pale', '#fff1e4', rough=.4, double=True)
    glow = mat('Firefly glow', '#e6ff6a', rough=.4, emit=2.5, emit_color='#d4ff4a')
    Ec, Er = V(0, .0018, .0034), (.0026, .0058, .0020)
    bones = [('root', (0, 0, 0), (0, 0, .002), None),
             ('body', (0, .002, .0032), (0, -.004, .0032), 'root')]
    for s, sd in ((1, 'L'), (-1, 'R')):
        bones += [(f'elytron_{sd}', sx(V(.0005, -.0035, .0052), s), sx(V(.0005, .0060, .0052), s), 'body'),
                  (f'wing_{sd}', sx(V(.0010, -.0026, .0046), s), sx(V(.0010, .0050, .0046), s), 'body')]
    arm = build_armature('Firefly', bones)

    P = Parts()
    # belly (pale) and the glowing tail lantern under the back end
    P.add(sphere('Firefly belly', (.0021, .0052, .0016), V(0, .0010, .0026), pale, seg=6, rings=3), 'body', (1.0, .86, .7))
    P.add(sphere('Firefly lantern', (.0020, .0024, .0017), V(0, .0062, .0027), glow, seg=6, rings=3), 'body')
    # shield (pronotum): pink-red with a dark cross painted down the middle
    P.add(sphere('Firefly shield', (.0030, .0021, .0012), V(0, -.0042, .0042), pale, seg=7, rings=3), 'body',
          lambda co: (.14, .12, .16) if ((abs(co.x) < .0005 and co.z > .0046) or
                                         (abs(co.y + .0042) < .00035 and co.z > .0049)) else (1.0, .36, .32))
    P.add(sphere('Firefly head', (.0016, .0014, .0014), V(0, -.0064, .0034), dark, seg=6, rings=3), 'body')
    for s, sd in ((1, 'L'), (-1, 'R')):
        a0, a1 = (2, 104) if s > 0 else (-104, -2)
        P.add(ell_patch(f'Firefly elytron {sd}', Ec, Er, a0, a1, math.radians(26), math.radians(176), 3, 3, dark),
              f'elytron_{sd}', lambda co: 1.6 if abs(co.x) > .0022 else 1.0)
        P.add(sphere(f'Firefly eye {sd}', .0011, sx(V(.0012, -.0071, .0036), s), dark, seg=5, rings=3), 'body', .4)
        P.add(stick(f'Firefly antenna {sd}', [sx(V(.0006, -.0076, .0041), s), sx(V(.0018, -.0098, .0056), s),
                                             sx(V(.0030, -.0114, .0058), s)], .00025, dark), 'body')
        for kk, y in enumerate((-.0034, -.0012, .0010)):
            P.add(stick(f'Firefly leg {sd}{kk}', [sx(V(.0012, y, .0018), s), sx(V(.0034, y * 1.2, .0012), s),
                                                 sx(V(.0042, y * 1.35, .0001), s)], .00026, dark), 'body')
        root = sx(V(.0010, -.0026, .0046), s)
        out = [sx(V(.0006, -.0016, .0046), s), sx(V(.0021, .0004, .0046), s), sx(V(.0024, .0030, .0045), s),
               sx(V(.0016, .0052, .0044), s), sx(V(.0004, .0040, .0045), s), sx(V(.0001, .0012, .0046), s)]
        P.add(fan(f'Firefly wing {sd}', root, out, pale, up=Zv), f'wing_{sd}', (.72, .74, .8))
    finish('firefly', arm, P, dict(rays=24, distance=.003, strength=.45, ground=0.0))

    # Rest (loop 3 s, listed first so importers show it): breathing, a slow look about, a case twitch
    clip(arm, 'Rest', 90, {
        'body@loc': lambda p: (0, 0, .00005 * S(p, 2)),
        'body': lambda p: (1.5 * S(p, 2), 0, 6 * S(p, 1) * pulse(p, .5, .3)),
        'elytron_L': lambda p: (2 * pulse(p, .7, .04), -4 * pulse(p, .7, .04), 0),
        'elytron_R': lambda p: (2 * pulse(p, .7, .04), 4 * pulse(p, .7, .04), 0)})

    # Fly (loop 0.4 s): cases held open and up, hind wings spread and buzz (8 beats), body nose-up, bobbing
    ch = {'body@loc': lambda p: (0, 0, .0010 * S(p, 1)),
          'body': lambda p: (-18 + 3 * S(p, 1, .25), 0, 0)}
    for s, sd in ((1, 'L'), (-1, 'R')):
        ch[f'elytron_{sd}'] = (lambda s: lambda p: rot((Zv, -20 * s), (Yv, -64 * s), (Xv, 18)))(s)
        ch[f'wing_{sd}'] = (lambda s: lambda p: rot((Zv, -80 * s), (Xv, 8 + 34 * S(p, 8))))(s)
    clip(arm, 'Fly', 12, ch)
    export_critter('firefly', arm)


BUILDERS = {'cricket': build_cricket, 'spider': build_spider, 'spider-web': build_web, 'ladybug': build_ladybug,
            'dragonfly': build_dragonfly, 'butterfly': build_butterfly,
            'frog-tree': build_frog_tree, 'frog-pond': build_frog_pond, 'firefly': build_firefly}


def main():
    for nm in ONLY:
        BUILDERS[nm]()
    print('RESULTS')
    for nm, r in RESULTS.items():
        print(f'  {nm:12s} {r["tris"]:5d} tris {r["kb"]:6.1f} KB mats={r["mats"]} clips={r["clips"]}')
    if not NO_SAVE:
        have = [n for n in ALL if os.path.exists(os.path.join(OUT, n + '.glb'))]
        save_kit('critters', have, spacing=.05)


if __name__ == '__main__':
    main()
