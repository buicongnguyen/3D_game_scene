"""Starline menu icons: the Mini games menu, its category cards and the new game cards (trick-*, yard-*, fish-*, ...).

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_icons.py [-- --only yard-volley,cat-sky]
    -> .tools/review/trick-scenes/<name>.glb  (review-only scenes; nothing goes into public/models)
then render them to public/icons/<name>.webp (160 x 160 lossless, outlined for dark and parchment panels) with
    blender -b --factory-startup --python art/blender/render_icons.py -- --models .tools/review/trick-scenes <name> ...

Every icon is a small vignette (a round or rounded-square medallion painted in vertex colour, a few primitives and, where the
game has them, posed copies of its own models: the cow, the kids, the koi, the trout, the ball, the star kite). Scenes face -Y
(the camera looks along +Y), z up, about 0.6 wide; render_icons.py fits the camera to whatever sticks out, so keep subjects
inside the medallion. Colours are painted linear on white materials ('Paint', 'Matte', 'Shiny'); glows are emissive materials.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *  # noqa: F401,F403
from kit import ROOT
from build_critters import paint, fan, Xv, Yv, Zv
from build_tricks2 import baked, posed_copy, polys
from bug_kit import V
from mathutils import Matrix, Vector

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SCENES = os.path.join(ROOT, '.tools', 'review', 'trick-scenes')
D = math.radians
PAINT = MATTE = SHINY = None


def new():
    """A clean scene with the shared white materials (colour is painted per vertex)."""
    global PAINT, MATTE, SHINY
    reset()
    PAINT = mat('Paint', '#ffffff', rough=.5, double=True)
    MATTE = mat('Matte', '#ffffff', rough=.9, double=True)
    SHINY = mat('Shiny', '#ffffff', rough=.08)


def lin(c):
    return srgb(c) if isinstance(c, str) else tuple(c)


def col(ob, c):
    """Paint an object with a hex colour, a linear tuple, or a function of the world position returning either."""
    if callable(c):
        paint(ob, lambda co: lin(c(co)))
    else:
        paint(ob, lin(c))
    return ob


def glow(c, k=1.2):
    return mat('Glow ' + c, '#ffffff', emit=k, emit_color=c)


def mix(a, b, t):
    a, b = lin(a), lin(b)
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def grad(*stops, z0=-.3, z1=.3, axis=2):
    """Vertical gradient: stops are hex colours evenly spread from z0 (first) to z1 (last)."""
    def f(co):
        t = (co[axis] - z0) / (z1 - z0) * (len(stops) - 1)
        i = max(0, min(len(stops) - 2, int(t)))
        return mix(stops[i], stops[i + 1], t - i)
    return f


def S(name, r, loc, c, seg=12, rings=8, mt=None, rot=(0, 0, 0)):
    return col(sphere(name, r, loc, mt or PAINT, seg=seg, rings=rings, rot=rot), c)


def Cy(name, r, depth, loc, c, verts=16, r2=None, rot=(0, 0, 0), mt=None, bevel=0.0):
    return col(cyl(name, r, depth, loc, mt or PAINT, verts=verts, r2=r2, rot=rot, bevel=bevel), c)


def Bx(name, size, loc, c, bevel=.004, rot=(0, 0, 0), mt=None):
    return col(box(name, size, loc, mt or PAINT, bevel=bevel, segments=1, rot=rot), c)


def Rd(name, a, b, r, c, verts=8, mt=None, cap=True, r2=None):
    return col(rod(name, a, b, r, mt or PAINT, verts=verts, cap=cap, r2=r2), c)


def Tb(name, pts, r, c, verts=6, mt=None, rf=None, caps=True):
    return col(tube(name, pts, r, mt or PAINT, verts=verts, caps=caps, radius_fn=rf), c)


def Tr(name, R, r, loc, c, rot=(0, 0, 0), maj=24, mn=6, mt=None):
    return col(torus(name, R, r, loc, mt or PAINT, maj=maj, mn=mn, rot=rot), c)


def Pl(name, faces, c, up=None):
    return col(polys(name, faces, PAINT, up=up), c)


def disc(r, c, y=.30, depth=.03):
    """Round medallion facing the camera."""
    return Cy('Medal', r, depth, (0, y, 0), c, verts=44, rot=(D(90), 0, 0), mt=MATTE)


def tile(w, h, c, y=.30, depth=.04, bevel=.07):
    """Rounded-square medallion facing the camera."""
    return col(box('Medal', (w, depth, h), (0, y, 0), MATTE, bevel=bevel, segments=3), c)


def slab_disc(r, c, z=0.0, depth=.03):
    """Round floor tile (for the top-down yard scenes)."""
    return Cy('Floor', r, depth, (0, 0, z), c, verts=44, mt=MATTE)


def revolve(name, profile, seg, material):
    """A surface of revolution about Z from [(radius, z), ...], top to bottom, no end caps (a zero last radius closes into a pole)."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(TAU * i / seg), r * math.sin(TAU * i / seg), z)) for i in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            if len(b) == 1:
                bm.faces.new((a[i], b[0], a[j]))
            else:
                bm.faces.new((a[i], b[i], b[j], a[j]))
    return from_bmesh(name, bm, material, smooth_angle=60)


def put(ob, loc, height=None, yaw=0, roll=0, scale=None):
    """Stand a posed model on `loc` (feet / base), scaled to `height` (or `scale`), turned `yaw` degrees (+ = to its left)."""
    bpy.context.view_layer.update()
    ob.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()
    zs = [(ob.matrix_world @ Vector(c)).z for c in ob.bound_box]
    h = max(zs) - min(zs)
    s = scale if scale is not None else ((height / h) if height else 1.0)
    z0 = min(zs) * s
    ob.matrix_world = (Matrix.Translation(Vector(loc) - V(0, 0, z0)) @ Matrix.Rotation(D(yaw), 4, 'Z') @
                       Matrix.Rotation(D(roll), 4, 'Y') @ Matrix.Scale(s, 4))
    bpy.context.view_layer.update()
    return ob


def world_box(ob):
    bpy.context.view_layer.update()
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


def import_static(model, name):
    """A static model from public/models as one empty with its meshes under it."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, model + '.glb'))
    new_obs = [o for o in bpy.data.objects if o not in before]
    for o in [o for o in new_obs if o.type == 'MESH' and o.name.startswith('Icosphere')]:
        bpy.data.objects.remove(o, do_unlink=True)
    g = empty(name)
    for o in new_obs:
        if o.name in bpy.data.objects and o.parent is None and o is not g:
            set_parent(o, g)
    bpy.context.view_layer.update()
    return g


def static_box(grp):
    bpy.context.view_layer.update()
    pts = []
    for o in descendants([grp]):
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


def finish_icon(name, parts, extras=(), ao=None):
    """Join and bake the primitives (one object), parent posed models and groups to it, write the review GLB."""
    root = baked([p for p in parts if p], 'icon_' + name.replace('-', '_'), ao or dict(rays=12, distance=.04, strength=.22))
    for e in extras:
        set_parent(e, root)
    os.makedirs(SCENES, exist_ok=True)
    export(name, [root], out_dir=SCENES)


def grass_tufts(parts, pts, c1='#4fbf3f', c2='#7ed957'):
    for k, (x, y, z, s) in enumerate(pts):
        for j in range(3):
            a = D(-28 + 28 * j)
            parts.append(Cy(f'Tuft {k}{j}', .010 * s, .07 * s, (x + math.sin(a) * .02 * s, y, z + .03 * s), c1 if j % 2 else c2, verts=4,
                            r2=0.001, rot=(0, a, 0)))


def feather_quad(n, d, up, w, length, sign):
    """A flat fletching: a quad in the plane (d, up) at the nock n."""
    return [n, n + d * length, n + d * (length + .012) + up * w * sign, n + d * .008 + up * (w * .85) * sign]

# ====================================================================== TRICKS


def scene_archery():
    new()
    parts = [disc(.30, '#ffffff')]
    col(parts[0], lambda co: (mix('#5fbf4a', '#8ed85a', (co.z + .30) / .2) if co.z < -.10 else grad('#fff0b8', '#8fd3f4', '#4fa8e8', z0=-.10, z1=.30)(co)))
    # target on an easel
    tx, ty, tz = .11, -.02, .035
    for sd in (-1, 1):
        parts.append(Rd('Easel leg', (tx + sd * .07, .01, -.215), (tx + sd * .03, .01, tz - .04), .011, '#8a5a2b', verts=6))
    parts.append(Cy('Straw boss', .168, .055, (tx, ty + .02, tz), '#e6b449', verts=28, rot=(D(90), 0, 0)))
    for k, (r, c) in enumerate(((.150, '#fff4dc'), (.121, '#e23a2a'), (.092, '#fff4dc'), (.063, '#2f6fd0'), (.032, '#ffd23a'))):
        parts.append(Cy(f'Ring {k}', r, .004, (tx, ty - .006 - k * .0032, tz), c, verts=28, rot=(D(90), 0, 0)))
    parts.append(Tr('Straw rim', .168, .010, (tx, ty - .004, tz), '#c8902a', rot=(D(90), 0, 0), maj=28, mn=5))
    # bow: wood curve with a red grip wrap, a taut string
    pts = []
    for i in range(13):
        t = -1 + i / 6.0
        pts.append(V(-.19 - .045 * (1 - t * t), -.055, -.03 + t * .21))
    parts.append(Tb('Bow', pts, .0105, lambda co: '#c0392b' if abs(co.z + .03) < .028 else '#9a6431', verts=6,
                    rf=lambda t: .55 + .45 * math.sin(math.pi * t) ** .5))
    parts.append(Rd('String', pts[0] + V(0, .004, 0), pts[-1] + V(0, .004, 0), .0024, '#fff4dc', verts=4))
    # arrow in flight with a blunt rubber tip and red and white fletching
    nock, tip = V(-.13, -.07, -.075), V(.005, -.07, .0)
    d = (tip - nock).normalized()
    up = V(-d.z, 0, d.x)
    parts.append(Rd('Arrow', nock, tip - d * .01, .0052, '#e6c47a', verts=6))
    parts.append(S('Rubber tip', .0155, tip, '#e23a2a', seg=10, rings=6))
    parts.append(Tr('Tip collar', .0095, .0032, tip - d * .016, '#c8c8cc', rot=(0, D(90) - math.atan2(d.z, d.x) * 1 + D(0), 0), maj=10, mn=4))
    for k, (sgn, c) in enumerate(((1, '#e23a2a'), (-1, '#fff4dc'), (1, '#fff4dc'))):
        n = nock + d * (.012 * k)
        parts.append(Pl(f'Fletch {k}', [feather_quad(n, d, up, .033, .052 - .006 * k, sgn)], c))
    parts.append(Pl('Nock', [[nock - d * .004 + up * .004, nock - d * .004 - up * .004, nock + d * .014 - up * .003, nock + d * .014 + up * .003]], '#2a2a30'))
    # speed lines and grass
    for k, (z, l) in enumerate(((-.115, .07), (-.095, .05))):
        parts.append(Rd('Speed', V(-.24 - l, -.07, z), V(-.24, -.07, z), .0035, '#ffffff', verts=4))
    grass_tufts(parts, [(-.22, -.05, -.225, 1.0), (-.05, -.05, -.235, .9), (.27, -.05, -.20, 1.0)])
    finish_icon('trick-archery', parts)


def cow_and_kid(parts, extras, cow_yaw, cow_h, cow_loc, kid_model, kid_clip, kid_frac, kid_h, dz=0.0, dx=0.0, kid_yaw=None):
    cow = posed_copy('cow', 'Idle', .2, 'cow')
    put(cow, cow_loc, height=cow_h, yaw=cow_yaw)
    lo, hi = world_box(cow)
    kid = posed_copy(kid_model, kid_clip, kid_frac, 'kid')
    top = hi.z
    cx = (lo.x + hi.x) / 2 + dx
    cy = (lo.y + hi.y) / 2
    put(kid, (cx, cy, top - kid_h * .24 + dz), height=kid_h, yaw=cow_yaw if kid_yaw is None else kid_yaw)
    extras += [cow, kid]
    return cow, kid, lo, hi


def scene_cowrace():
    new()
    parts = [disc(.30, '#ffffff')]
    col(parts[0], lambda co: mix('#5fbf4a', '#9be060', (co.z + .30) / .22) if co.z < -.085 else grad('#fff2c0', '#ffd9a0', '#7cc8f4', '#4fa8e8', z0=-.085, z1=.30)(co))
    extras = []
    cow, kid, lo, hi = cow_and_kid(parts, extras, 90, .27, (-.02, -.03, -.23), 'villager-kid', 'Sit', .5, .26, dz=.02, dx=-.012)
    top = hi.z
    cx = (lo.x + hi.x) / 2
    # straw saddle blanket across the back, striped
    parts.append(Bx('Blanket', (.105, .13, .022), (cx - .01, (lo.y + hi.y) / 2, top - .012), lambda co: '#c0392b' if abs(co.x - cx + .01) > .046 else ('#2f6fd0' if abs(co.x - cx + .01) > .038 else mix('#e6b449', '#f2cc6a', .5 + .5 * math.sin(co.y * 300))), bevel=.006))
    # pennants on thin poles at the saddle, streaming back
    for k, (dx, c) in enumerate(((.050, '#e23a2a'), (-.06, '#25b8a8'))):
        px, py = cx + dx, (lo.y + hi.y) / 2 + (.06 if k == 0 else -.06)
        parts.append(Rd('Pole', V(px, py, top - .01), V(px, py, top + .15), .0035, '#fff4dc', verts=4))
        parts.append(Pl('Pennant', [[V(px, py, top + .15), V(px - .07, py, top + .125), V(px, py, top + .10)]], c))
    # motion lines and dust, mud splash at the hooves
    for k, (z, l) in enumerate(((-.07, .09), (-.115, .12), (-.16, .08))):
        parts.append(Rd('Speed', V(lo.x - .02 - l, -.10, z), V(lo.x - .02, -.10, z), .0045, '#ffffff', verts=4))
    for k, (x, z, r) in enumerate(((-.15, -.20, .040), (-.20, -.18, .030), (-.12, -.225, .030), (-.24, -.145, .022), (-.18, -.225, .026))):
        parts.append(S('Dust', (r * 1.3, r, r), (x, -.10, z), '#fff0d8', seg=10, rings=6, mt=MATTE))
    for k, (x, z, r) in enumerate(((-.20, -.12, .018), (-.235, -.075, .014), (-.265, -.035, .011), (-.19, -.065, .012), (-.225, -.15, .012), (-.27, -.10, .009), (-.17, -.15, .011))):
        parts.append(S('Mud', (r, r * .8, r * 1.2), (x, -.115, z), '#6a3c1e', seg=7, rings=5))
    # a smile on the muzzle
    sy = lo.y + .004
    parts.append(Tb('Smile', [V(hi.x - .060, sy, hi.z - .150), V(hi.x - .046, sy, hi.z - .162), V(hi.x - .030, sy, hi.z - .166), V(hi.x - .014, sy, hi.z - .158)], .0035, '#3a1a10', verts=5))
    finish_icon('trick-cowrace', parts, extras)

# ====================================================================== YARD


def net_grid(parts, x0, x1, z_top, z_bot, y, cols_n, rows_n, c='#f4efe6', tape='#fffdf0', r=.0022, post=.010, post_c='#8a5a2b', ground=None):
    for sd in (x0, x1):
        parts.append(Rd('Post', V(sd, y, ground if ground is not None else z_bot - .03), V(sd, y, z_top + .02), post, post_c, verts=6))
    for i in range(cols_n + 1):
        x = x0 + (x1 - x0) * i / cols_n
        parts.append(Rd('Net v', V(x, y, z_bot), V(x, y, z_top), r, c, verts=4))
    for j in range(rows_n + 1):
        z = z_bot + (z_top - z_bot) * j / rows_n
        parts.append(Rd('Net h', V(x0, y, z), V(x1, y, z), r, c, verts=4))
    parts.append(Rd('Net tape', V(x0, y - .002, z_top), V(x1, y - .002, z_top), .0075, tape, verts=6))


def shuttle(parts, loc, scale=1.0, tilt=18):
    """A shuttlecock, cork down: white feather skirt with a band, cream cork with a red stripe."""
    x, y, z = loc
    s = scale
    ca = D(tilt)
    parts.append(Cy('Skirt', .012 * s, .082 * s, (x, y, z + .045 * s), lambda co: '#e0ddd0' if int((co.x * 90 + co.y * 40) / s) % 2 else '#fffdf0', verts=14, r2=.050 * s,
                    rot=(0, ca, 0), mt=PAINT))
    parts.append(Tr('Band', .036 * s, .0045 * s, (x + math.sin(ca) * .020 * s, y, z + .074 * s), '#e23a2a', rot=(0, ca, 0), maj=14, mn=4))
    parts.append(S('Cork', .0215 * s, (x, y, z), '#f2d19a', seg=10, rings=6))
    parts.append(Tr('Cork stripe', .0195 * s, .0040 * s, (x, y, z + .004 * s), '#e23a2a', rot=(0, ca, 0), maj=12, mn=4))


def scene_footnet():
    new()
    parts = [tile(.62, .62, '#ffffff')]
    col(parts[0], lambda co: mix('#79d65a', '#a6e87a', (co.z + .31) / .20) if co.z < -.11 else grad('#fff2c0', '#8fd3f4', '#5fb0ee', z0=-.11, z1=.31)(co))
    net_grid(parts, -.25, .25, -.03, -.15, -.02, 9, 3, ground=-.20, c='#ffffff', r=.0036)
    shuttle(parts, (.04, -.06, .11), 1.25, tilt=22)
    # the foot: a leg in a sock and a red shoe kicking up from the lower left
    A_ = V(-.20, -.09, -.10)
    parts.append(Rd('Leg', V(-.30, -.09, -.25), A_ + V(0, 0, .02), .022, '#f0b890', verts=10))
    parts.append(Rd('Sock', A_ + V(-.012, 0, -.03), A_ + V(.004, 0, .03), .027, '#fffdf0', verts=10))
    dd = V(math.cos(D(40)), 0, math.sin(D(40)))
    parts.append(S('Shoe', (.058, .034, .030), A_ + dd * .046 + V(0, 0, -.012), '#e23a2a', seg=12, rings=8, rot=(0, D(-40), 0)))
    parts.append(S('Toe cap', (.024, .035, .028), A_ + dd * .092 + V(0, 0, -.012), '#fffdf0', seg=8, rings=6, rot=(0, D(-40), 0)))
    parts.append(Rd('Sole', A_ + dd * .004 + V(.009, 0, -.034), A_ + dd * .104 + V(.009, 0, -.034), .0065, '#2a2a30', verts=6))
    for k, (x, z, r) in enumerate(((-.065, -.005, .009), (-.02, .034, .0075), (.00, .068, .006))):
        parts.append(S('Trail', r, (x, -.07, z), '#ffffff', seg=8, rings=5))
    finish_icon('yard-footnet', parts)


def scene_keepup():
    new()
    parts = [slab_disc(.30, lambda co: mix('#b8e07a', '#7ed957', math.hypot(co.x, co.y) / .3))]
    parts.append(Tr('Chalk', .215, .006, (0, 0, .018), '#fffdf0', maj=40, mn=4))
    cols = ('#e23a2a', '#2f6fd0', '#ffd23a', '#25b8a8')
    for k in range(4):
        a = TAU * k / 4 + D(45)
        x, y = math.cos(a) * .17, math.sin(a) * .17
        yaw = a + math.pi
        # a shoe pointing at the middle, an ankle in a sock going up and back
        parts.append(S('Shoe', (.074, .042, .034), (x, y, .040), cols[k], seg=10, rings=6, rot=(0, 0, yaw)))
        parts.append(S('Toe', (.030, .041, .031), (x + math.cos(yaw) * .052, y + math.sin(yaw) * .052, .038), '#fffdf0', seg=8, rings=5, rot=(0, 0, yaw)))
        parts.append(Rd('Sole', V(x - math.cos(yaw) * .05, y - math.sin(yaw) * .05, .006), V(x + math.cos(yaw) * .07, y + math.sin(yaw) * .07, .006), .010, '#2a2a30', verts=6))
        parts.append(Rd('Sock', V(x - math.cos(yaw) * .028, y - math.sin(yaw) * .028, .06), V(x - math.cos(yaw) * .05, y - math.sin(yaw) * .05, .11), .030, '#fffdf0', verts=10))
        parts.append(Rd('Leg', V(x - math.cos(yaw) * .05, y - math.sin(yaw) * .05, .11), V(x - math.cos(yaw) * .065, y - math.sin(yaw) * .065, .17), .026, '#f0b890', verts=10))
    shuttle(parts, (0, 0, .16), 1.7, tilt=0)
    g = glow('#ffd23a')
    for k in range(6):
        a = TAU * k / 6
        parts.append(col(sphere('Spark', .008, (math.cos(a) * .075, math.sin(a) * .075, .235 + .02 * (k % 2)), g, seg=6, rings=4), '#ffffff'))
    finish_icon('yard-keepup', parts)


def volleyball(parts, loc, r, name='Volleyball'):
    cx, cy, cz = loc

    def panel(co):
        u = ((co.x - cx) * .8 + (co.z - cz) * .6) / r
        w = ((co.x - cx) * -.6 + (co.z - cz) * .8) / r + .25 * math.sin(u * 5)
        return '#2f6fd0' if w > .38 else ('#ffd23a' if w < -.38 else '#fffdf0')
    parts.append(col(sphere(name, r, loc, SHINY, seg=20, rings=14), panel))
    return parts


def scene_volley():
    new()
    parts = [tile(.62, .62, '#ffffff')]
    col(parts[0], lambda co: mix('#f2d38a', '#ffe9b0', (co.z + .31) / .20) if co.z < -.10 else grad('#d6f0ff', '#79c4f0', '#4fa0e8', z0=-.10, z1=.31)(co))
    net_grid(parts, -.26, .26, .06, -.13, -.02, 12, 5, ground=-.22, tape='#fffdf0', c='#ffffff', r=.0036)
    volleyball(parts, (.05, -.07, .185), .08)
    for k, (dx, dz, r) in enumerate(((-.085, -.045, .012), (-.14, -.085, .009), (-.19, -.125, .007))):
        parts.append(S('Trail', r, (.05 + dx, -.07, .185 + dz), '#ffffff', seg=8, rings=5))
    parts.append(Rd('Speed', V(.05 - .09, -.09, .185 + .10), V(.05 - .125, -.09, .185 + .135), .004, '#ffffff', verts=4))
    finish_icon('yard-volley', parts)


def scene_rope():
    new()
    parts = [tile(.62, .62, '#ffffff')]
    col(parts[0], lambda co: mix('#79d65a', '#b6ec84', (co.z + .31) / .22) if co.z < -.10 else grad('#fff2c0', '#8fd3f4', '#5fb0ee', z0=-.10, z1=.31)(co))
    # the rope: a big loop over the jumper, striped like a twisted cord, tied to two stakes
    cz, a, b = -.06, .255, .295
    pts = []
    for i in range(21):
        t = math.pi * (1 - i / 20)
        pts.append(V(math.cos(t) * a, -.045, cz + math.sin(t) * b * (.92 + .08 * math.cos(t * 2))))
    parts.append(Tb('Rope', pts, .0085, lambda co: '#e23a2a' if int((co.x * 1.0 + co.z * 1.7) * 38) % 2 else '#fff0c0', verts=6))
    for sd in (-1, 1):
        parts.append(Rd('Stake', V(sd * .27, -.045, -.20), V(sd * .27, -.045, -.04), .016, '#8a5a2b', verts=8))
        parts.append(Tr('Knot', .016, .006, (sd * .27, -.045, -.05), '#e6c47a', rot=(0, 0, 0), maj=10, mn=4))
    # the jumper, mid-air
    kid = posed_copy('villager-kid', 'Jump', .5, 'kid')
    put(kid, (0, -.03, -.145), height=.31, yaw=0)
    for k, (dx, w) in enumerate(((-.06, .05), (0, .06), (.06, .05))):
        parts.append(Rd('Jump line', V(dx, -.05, -.205), V(dx, -.05, -.205 - w), .004, '#ffffff', verts=4))
    parts.append(S('Shadow', (.075, .03, .004), (0, -.03, -.215), '#4a8a3a', seg=14, rings=4, mt=MATTE))
    grass_tufts(parts, [(-.20, -.05, -.225, 1), (.20, -.05, -.23, 1)])
    finish_icon('yard-rope', parts, [kid])


def scene_tug():
    new()
    parts = [tile(.62, .62, '#ffffff')]
    col(parts[0], lambda co: mix('#e0b878', '#f2d49a', (co.z + .31) / .3) if co.z < .04 else grad('#fff0c0', '#8fd3f4', z0=.04, z1=.31)(co))
    parts.append(Bx('Chalk line', (.012, .02, .31), (0, -.005, -.155), '#fffdf0', bevel=.002))
    pts = [V(x, -.04, -.035 - .018 * (1 - (x / .30) ** 2) + .015 * (x / .30)) for x in [-.30 + .6 * i / 16 for i in range(17)]]
    parts.append(Tb('Rope', pts, .021, lambda co: '#a87a3a' if int((co.x * 1.0 + co.z * 3) * 52) % 2 else '#e6c47a', verts=7))
    # knots and the flag on the middle
    for x in (-.12, .12):
        parts.append(S('Knot', .022, (x, -.04, -.052), '#8a5a2b', seg=8, rings=6))
    parts.append(Rd('Flag pole', V(0, -.05, -.05), V(0, -.05, .16), .006, '#fff4dc', verts=6))
    parts.append(Pl('Flag', [[V(0, -.05, .155), V(.12, -.05, .125), V(.005, -.05, .095)]], '#e23a2a'))
    parts.append(S('Flag ball', .011, (0, -.05, .165), '#ffd23a', seg=8, rings=6))
    # two pairs of hands gripping, wristbands in team colours
    for sd, c in ((-1, '#e23a2a'), (1, '#2f6fd0')):
        for k, dz in enumerate((.005, -.052)):
            hx = sd * (.215 + .035 * k)
            parts.append(S('Hand', (.034, .03, .03), (hx, -.065, -.05 + dz * .3), '#f0b890', seg=10, rings=6))
            parts.append(Rd('Arm', V(hx, -.065, -.05 + dz * .3), V(sd * .33, -.07, -.05 + .08 + dz), .030, '#f0b890', verts=10))
            parts.append(Rd('Band', V(sd * (.245 + .035 * k), -.067, -.045 + dz * .3 + .008), V(sd * (.275 + .035 * k), -.068, -.036 + dz * .3 + .02), .034, c, verts=10))
    finish_icon('yard-tug', parts)


def scene_oanquan():
    new()
    ANG = D(-24)
    ca, sa = math.cos(ANG), math.sin(ANG)

    def T(x, y):
        return (x * ca - y * sa, x * sa + y * ca)
    parts = [col(box('Dirt', (.62, .62, .035), (0, 0, -.0175), MATTE, bevel=.07, segments=3),
                 lambda co: mix('#b98a52', '#d9ae72', (co.y + .31) / .62 * .6 + .2 + .1 * math.sin(co.x * 21 + co.y * 13)))]
    s_ = .084
    line = '#5a381c'
    z = .003
    for y in (-s_, 0, s_):
        x, yy = T(0, y)
        parts.append(Bx('Line h', (5 * s_, .008, .005), (x, yy, z), line, bevel=.0008, rot=(0, 0, ANG)))
    for i in range(6):
        x, yy = T((-2.5 + i) * s_, 0)
        parts.append(Bx('Line v', (.008, 2 * s_, .005), (x, yy, z), line, bevel=.0008, rot=(0, 0, ANG)))
    for sd in (-1, 1):                                   # the two big end cells: half rings
        pts = []
        for i in range(11):
            t = (-math.pi / 2) + math.pi * i / 10
            x, yy = T(sd * (2.5 * s_ + math.sin(t) * s_ * 1.1), math.cos(t) * s_)
            pts.append(V(x, yy, z + .001))
        parts.append(Tb('Quan arc', pts, .0048, line, verts=4))
    import random
    rng = random.Random(4)
    pc = ('#fffdf0', '#cfcfca', '#e6c47a', '#8fd3f4', '#ff9a8a')
    for i in range(5):
        for j in range(2):
            cx, cy = (-2 + i) * s_, (-s_ / 2 if j == 0 else s_ / 2)
            for k in range(rng.choice((2, 3, 4, 5))):
                a_ = rng.random() * TAU
                rr = rng.random() * s_ * .26
                x, yy = T(cx + math.cos(a_) * rr, cy + math.sin(a_) * rr)
                parts.append(S('Pebble', .0125, (x, yy, .014), pc[rng.randrange(5)], seg=8, rings=5))
    for sd in (-1, 1):
        bx_, by_ = sd * (2.5 * s_ + s_ * .50), 0
        x, yy = T(bx_, by_)
        parts.append(S('Big stone', (.046, .048, .034), (x, yy, .03), '#f2e8cf', seg=12, rings=8, rot=(0, 0, ANG)))
        x2, y2 = T(bx_ + .014, -.02)
        parts.append(S('Stone spot', .0115, (x2, y2, .054), '#8a7a5a', seg=6, rings=4))
        for k in range(2):
            x3, y3 = T(bx_ + (-.035 + .07 * k), .052)
            parts.append(S('Pebble', .0125, (x3, y3, .016), pc[k], seg=8, rings=5))
    finish_icon('yard-oanquan', parts)


def scene_sack():
    new()
    parts = [tile(.62, .62, '#ffffff')]
    col(parts[0], lambda co: mix('#79d65a', '#b6ec84', (co.z + .31) / .22) if co.z < -.10 else grad('#fff2c0', '#8fd3f4', '#5fb0ee', z0=-.10, z1=.31)(co))
    kid = posed_copy('villager-kid', 'Jump', .5, 'kid')
    put(kid, (0, -.03, -.135), height=.32, yaw=0)
    # a burlap sack from the hips down, tied with a rope, a little tilted
    burlap = lambda co: mix('#c4985c', '#e0bb7a', .5 + .5 * math.sin(co.z * 300 + math.sin(co.x * 120) * 1.4)) if abs(co.x) > .006 else '#8a5a2b'
    import random as _r
    rr = _r.Random(3)
    prof = [(.050, -.000), (.078, -.035), (.100, -.085), (.116, -.150), (.116, -.215), (.092, -.250), (0.0, -.256)]
    sack = revolve('Sack', [(r_ * (1 + rr.uniform(-.05, .05)) if r_ else 0.0, z_) for r_, z_ in prof], 12, MATTE)
    col(sack, lambda co: '#c0392b' if -.135 < co.z < -.108 else burlap(co))
    sack.location = (0, -.03, 0)
    parts.append(sack)
    for sd in (-1, 1):
        parts.append(Pl('Sack ear', [[V(sd * .045, -.03, .004), V(sd * .092, -.03, .030), V(sd * .07, -.03, -.03)]], '#e0bb7a'))
    parts.append(Tr('Sack gather', .062, .020, (0, -.03, .004), '#e0bb7a', maj=18, mn=6))
    parts.append(Tr('Sack rope', .062, .006, (0, -.03, -.012), '#e23a2a', maj=18, mn=4))
    parts.append(Cy('Patch', .030, .004, (.03, -.118, -.14), '#c0392b', verts=10, rot=(D(90), 0, 0)))
    parts.append(Cy('Patch dot', .012, .004, (.03, -.122, -.14), '#fff4dc', verts=8, rot=(D(90), 0, 0)))
    for k, (dx, w) in enumerate(((-.07, .045), (0, .055), (.07, .045))):
        parts.append(Rd('Hop line', V(dx, -.11, -.245), V(dx, -.11, -.245 - w), .0045, '#ffffff', verts=4))
    for k, (x, z, r) in enumerate(((-.12, -.255, .022), (.13, -.255, .02), (-.17, -.235, .014), (.18, -.24, .012))):
        parts.append(S('Dust', r, (x, -.07, z), '#fff0d8', seg=8, rings=5))
    finish_icon('yard-sack', parts, [kid])


def scene_marbles():
    new()
    parts = [slab_disc(.30, lambda co: mix('#e6c88a', '#caa468', math.hypot(co.x, co.y) / .3 + .08 * math.sin(co.x * 40 + co.y * 33)))]
    parts.append(Tr('Chalk', .20, .0075, (0, 0, .02), '#fffdf0', maj=40, mn=4))
    swirls = [('#e23a2a', '#ffd23a'), ('#2f6fd0', '#fffdf0'), ('#25b8a8', '#fffdf0'), ('#9b59d0', '#ff9ac8'), ('#ff8a2a', '#fff0b8'), ('#2fb04a', '#d8f08a')]
    spots = [(-.10, .06), (.08, .09), (-.01, -.01), (.11, -.05), (-.09, -.09), (.0, .14)]
    for k, ((a, b), (x, y)) in enumerate(zip(swirls, spots)):
        r = .038
        parts.append(col(sphere('Marble', r, (x, y, r + .018), SHINY, seg=16, rings=10),
                         lambda co, a=a, b=b, x=x, y=y: a if math.sin(((co.x - x) * 1.2 + (co.y - y) * 0.8) / .034 * 2.6 + (co.z - .05) / .034 * 2.4) > -.15 else b))
        parts.append(col(sphere('Glint', .0075, (x - .011, y - .012, r * 2 + .004), glow('#ffffff', 2.0), seg=6, rings=4), '#ffffff'))
    # the shooter, bigger, outside the ring with a dotted line to the circle
    r = .048
    parts.append(col(sphere('Shooter', r, (-.02, -.235, r + .018), SHINY, seg=18, rings=12),
                     lambda co: '#ffd23a' if math.sin((co.x + .02) / .048 * 3 + (co.z - .06) / .048 * 3) > 0 else '#e23a2a'))
    parts.append(col(sphere('Glint', .0095, (-.034, -.25, r * 2 + .008), glow('#ffffff', 2.0), seg=6, rings=4), '#ffffff'))
    for k in range(4):
        parts.append(S('Dot', .006, (-.02 + .01 * k, -.17 + .026 * k * -1 * -1, .03), '#ffffff', seg=6, rings=4))
    finish_icon('yard-marbles', parts)

# ====================================================================== FISHING


def scene_fishdock():
    new()
    parts = [disc(.30, '#ffffff')]
    col(parts[0], lambda co: grad('#d6f0ff', '#8fd3f4', z0=.05, z1=.30)(co) if co.z > .02 else grad('#1d6fb0', '#2f9ad8', '#69c8f0', z0=-.30, z1=.02)(co))
    # the dock: a deck of planks on two piles, a rope on one
    for k in range(7):
        parts.append(Bx('Plank', (.052, .13, .024), (-.285 + .054 * k + .0, -.01, .09), '#b5793a' if k % 2 else '#c98a46', bevel=.003))
    parts.append(Bx('Beam', (.37, .05, .03), (-.19, .0, .062), '#7a4a22', bevel=.004))
    for sd in (-.28, -.05):
        parts.append(Rd('Pile', V(sd, -.0, .06), V(sd, .0, -.20), .026, '#6a4222', verts=8))
        parts.append(Tr('Pile rope', .028, .006, (sd, -.0, .02), '#e6c47a', maj=10, mn=4))
    # a rod over the deck, the line to a bobber in the water, ripples
    base, tip = V(-.20, -.07, .085), V(.10, -.08, .30)
    parts.append(Tb('Rod', [base, base.lerp(tip, .5) + V(0, 0, .014), tip], .0065, '#d9a860', verts=6, rf=lambda t: 1.0 - .6 * t))
    parts.append(S('Reel', .013, base + V(.025, -.016, -.002), '#c0392b', seg=8, rings=6))
    parts.append(Rd('Line', tip, V(.115, -.08, -.045), .0018, '#fffdf0', verts=4))
    parts.append(S('Bobber top', .016, (.115, -.08, -.03), '#e23a2a', seg=10, rings=6))
    parts.append(S('Bobber bottom', .016, (.115, -.08, -.056), '#fffdf0', seg=10, rings=6))
    for k, r in enumerate((.04, .065, .09)):
        parts.append(Tr('Ripple', r, .0028, (.115, -.075, -.062), '#e9f8ff', maj=24, mn=4, rot=(D(90 - 78), 0, 0)))
    koi = posed_copy('fish-koi', 'Swim', .25, 'koi')
    put(koi, (.07, -.06, -.265), height=None, scale=.34, yaw=90)
    finish_icon('fish-dock', parts, [koi])


def scene_fishmill():
    new()
    parts = [tile(.62, .62, '#ffffff')]
    col(parts[0], lambda co: grad('#e6f6ff', '#9ad8f4', z0=-.02, z1=.31)(co) if co.z > -.12 else grad('#16609e', '#2f9ad8', '#69c8f0', z0=-.31, z1=-.12)(co))
    # a plaster wall with a timber beam behind, the water wheel in front of it
    parts.append(Bx('Wall', (.20, .04, .27), (-.20, .12, .05), '#f2ead2', bevel=.01))
    parts.append(Bx('Beam', (.21, .045, .03), (-.20, .115, .17), '#6a4222', bevel=.004))
    cx, cz, R = -.075, .005, .185
    parts.append(Tr('Wheel rim', R, .012, (cx, 0, cz), '#a8692e', rot=(D(90), 0, 0), maj=28, mn=6))
    parts.append(Tr('Wheel inner', R * .55, .008, (cx, 0, cz), '#8a5a2b', rot=(D(90), 0, 0), maj=20, mn=5))
    for k in range(10):
        a = TAU * k / 10
        parts.append(Rd('Spoke', V(cx, 0, cz), V(cx + math.cos(a) * R, 0, cz + math.sin(a) * R), .008, '#8a5a2b', verts=6))
        px, pz = cx + math.cos(a + .16) * (R + .006), cz + math.sin(a + .16) * (R + .006)
        parts.append(Bx('Paddle', (.060, .075, .014), (px, 0, pz), '#c98a46', bevel=.002, rot=(0, -(a + .16) + D(90), 0)))
    parts.append(Cy('Hub', .028, .09, (cx, 0, cz), '#6a4222', verts=12, rot=(D(90), 0, 0)))
    parts.append(Cy('Hub cap', .014, .02, (cx, -.05, cz), '#d8b060', verts=10, rot=(D(90), 0, 0)))
    # water in front: a band with foam and a few drops falling from the paddles
    parts.append(col(box('Water', (.60, .06, .10), (0, -.06, -.23), SHINY, bevel=.02, segments=2),
                     lambda co: mix('#2f9ad8', '#69c8f0', (co.z + .25) / .12 + .15 * math.sin(co.x * 40))))
    for k, x in enumerate((-.19, -.10, -.02, .07, .16)):
        parts.append(S('Foam', (.032, .02, .012), (x, -.095, -.13 + .006 * (k % 2)), '#ffffff', seg=8, rings=5))
    for k, (x, z) in enumerate(((-.19, -.04), (-.215, -.09), (-.16, -.06))):
        parts.append(S('Drop', .0075, (x, -.04, z), '#cfeeff', seg=6, rings=4))
    # the rod from the right, the line into the water, the trout
    base, tip = V(.30, -.07, -.02), V(.075, -.09, .26)
    parts.append(Tb('Rod', [base, base.lerp(tip, .5) + V(.01, 0, .01), tip], .0072, '#d9a860', verts=6, rf=lambda t: 1.0 - .6 * t))
    parts.append(Rd('Line', tip, V(.115, -.09, -.17), .003, '#fffdf0', verts=4))
    parts.append(S('Bobber', .020, (.115, -.092, -.15), '#e23a2a', seg=10, rings=6))
    parts.append(S('Bobber', .020, (.115, -.092, -.178), '#fffdf0', seg=10, rings=6))
    trout = posed_copy('fish-trout', 'Swim', .25, 'trout')
    put(trout, (.13, -.125, -.292), scale=.34, yaw=90)
    finish_icon('fish-mill', parts, [trout])

# ====================================================================== OTHERS


def scene_cowride():
    new()
    parts = [disc(.30, '#ffffff')]
    col(parts[0], lambda co: mix('#6fcf4f', '#a6e87a', (co.z + .30) / .22) if co.z < -.07 else grad('#fff0c0', '#bfe4f8', '#7cc8f4', z0=-.07, z1=.30)(co))
    parts.append(S('Sun', .055, (.17, .15, .19), '#ffd23a', seg=14, rings=8, mt=glow('#ffc83a', .8)))
    for k, (x, z, r) in enumerate(((-.17, .17, .05), (-.11, .19, .04), (-.22, .15, .035))):
        parts.append(S('Cloud', (r * 1.3, r * .7, r * .8), (x, .12, z), '#ffffff', seg=10, rings=6, mt=MATTE))
    extras = []
    cow, kid, lo, hi = cow_and_kid(parts, extras, 55, .30, (0, -.03, -.235), 'mika', 'Sit', .5, .24, dz=.012, dx=-.002)
    parts.append(S('Shadow', (.12, .05, .004), (0, -.02, -.237), '#4a8a3a', seg=14, rings=4, mt=MATTE))
    grass_tufts(parts, [(-.22, -.06, -.235, 1.1), (.22, -.05, -.235, 1.0), (.12, -.10, -.25, .8)])
    finish_icon('cow-ride', parts, extras)


def scene_kiteworkshop():
    new()
    parts = [col(box('Bench', (.62, .62, .04), (0, 0, -.02), MATTE, bevel=.05, segments=3),
                 lambda co: mix('#c98a46', '#a96f38', .5 + .5 * math.sin(co.y * 62 + math.sin(co.x * 9) * .6)) if int((co.y + .31) / .1) % 2 else mix('#d9a060', '#b57a3c', .5 + .5 * math.sin(co.y * 50 + co.x * 7)))]
    for k in range(1, 6):
        parts.append(Bx('Plank gap', (.60, .004, .004), (0, -.31 + .1 * k + .005, .003), '#5a3416', bevel=.0008))
    kite = import_static('star-kite', 'kite')
    doomed = {c.name for t in descendants([kite]) if t.name.startswith('Tail_') for c in descendants([t])}
    for n in doomed:
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    bpy.context.view_layer.update()
    lo, hi = static_box(kite)
    s_ = .50 / max(hi.x - lo.x, hi.y - lo.y)
    kite.matrix_world = Matrix.Scale(s_, 4)
    bpy.context.view_layer.update()
    lo, hi = static_box(kite)
    kite.matrix_world = Matrix.Translation(V(-(lo.x + hi.x) / 2 + .0, -(lo.y + hi.y) / 2 + .05, -lo.z)) @ Matrix.Scale(s_, 4)
    bpy.context.view_layer.update()
    rotors = [o.matrix_world.translation.copy() for o in descendants([kite]) if o.name.startswith('Rotor_')]
    # battery with terminals; wires over the kite to the four motors
    bx_, by_ = -.20, -.20
    parts.append(Bx('Battery', (.15, .075, .07), (bx_, by_, .035), '#ffd23a', bevel=.008))
    parts.append(Bx('Battery label', (.10, .004, .04), (bx_, by_ - .038, .035), '#2a2a30', bevel=.001))
    parts.append(Bx('Battery bolt', (.012, .006, .03), (bx_, by_ - .041, .035), '#ffd23a', bevel=.001))
    parts.append(Cy('Plus', .0095, .018, (bx_ - .04, by_, .078), '#e23a2a', verts=8))
    parts.append(Cy('Minus', .0095, .018, (bx_ + .04, by_, .078), '#2a2a30', verts=8))
    for k, rp in enumerate(rotors):
        start = V(bx_ - .04, by_, .085) if k % 2 == 0 else V(bx_ + .04, by_, .085)
        end = rp + V(0, 0, .02)
        mid = (start + end) / 2 + V(0, 0, .09)
        parts.append(Tb('Wire', [start, start.lerp(mid, .6) + V(0, 0, .02), mid, mid.lerp(end, .6) + V(0, 0, .0), end], .0042,
                        '#e23a2a' if k % 2 == 0 else '#2a2a30', verts=5))
    parts.append(Rd('Screwdriver', V(.15, -.22, .016), V(.25, -.22, .016), .014, '#e23a2a', verts=8))
    parts.append(Rd('Screwdriver shaft', V(.25, -.22, .016), V(.33, -.22, .016), .0045, '#c8c8cc', verts=6))
    parts.append(S('Screw', .008, (.08, -.25, .01), '#c8c8cc', seg=6, rings=4))
    finish_icon('kite-workshop', parts, [kite])


def star_poly(cx, cz, R, r, y, depth, c):
    outline = []
    for i in range(10):
        a = D(90) + TAU * i / 10
        rr = R if i % 2 == 0 else r
        outline.append((cx + math.cos(a) * rr, cz + math.sin(a) * rr))
    return col(extrude('Star', outline, depth, PAINT, bevel=.004, segments=1, loc=(0, y, 0), plane='XZ'), c)


def sparkle(parts, x, z, s, y=.10, c='#fff3c0'):
    g = glow('#fff3c0', 1.4)
    parts.append(col(box('Spark v', (.006 * s, .006, .05 * s), (x, y, z), g, bevel=.001, segments=1), '#ffffff'))
    parts.append(col(box('Spark h', (.05 * s, .006, .006 * s), (x, y, z), g, bevel=.001, segments=1), '#ffffff'))


def scene_skystars():
    new()
    parts = [disc(.30, grad('#5a3aa0', '#2a2a80', '#14206a', '#0a1040', z0=-.30, z1=.30))]
    g = glow('#ffe27a', 1.6)
    dip = [(-.098, .060), (-.058, .066), (-.025, .050), (.008, .030), (.020, -.012), (.072, -.010), (.078, .032)]
    pts = [(x * 2.35 - .02, z * 2.35 - .06) for x, z in dip]
    for a, b in zip(pts, pts[1:] + [pts[3]]):
        parts.append(col(rod('Line', (a[0], .0, a[1]), (b[0], .0, b[1]), .0042, g, verts=5), '#ffffff'))
    for k, (x, z) in enumerate(pts):
        parts.append(col(sphere('Star', .024 if k in (0, 6) else .018, (x, -.01, z), g, seg=10, rings=6), '#ffffff'))
        parts.append(col(sphere('Halo', .036, (x, .01, z), glow('#ffd54a', .35), seg=8, rings=5), '#ffffff'))
    # a shooting star with a tail across the upper right
    head = V(.20, -.03, .20)
    tail = V(.02, -.03, .11)
    parts.append(col(sphere('Comet', .03, head, g, seg=12, rings=8), '#ffffff'))
    parts.append(col(rod('Comet tail', tail, head, .016, glow('#ffe9a8', 1.0), verts=8, r2=.001), '#ffffff'))
    parts.append(col(rod('Comet tail 2', V(.03, -.03, .17), head + V(-.04, 0, .01), .007, glow('#ffd54a', .9), verts=6, r2=.001), '#ffffff'))
    for x, z, s in ((-.22, .20, 1.0), (.12, .26, .6), (-.20, -.12, .7), (.22, -.04, .8), (.0, -.21, .6)):
        sparkle(parts, x, z, s)
    for x, z in ((-.12, .22), (.25, .08), (.04, .21), (-.26, .04), (.18, -.16), (-.07, -.20)):
        parts.append(col(sphere('Dot', .006, (x, .1, z), glow('#fff3c0', 1.2), seg=5, rings=3), '#ffffff'))
    finish_icon('sky-stars', parts)


def controller(parts, cx, cz, s=1.0, y=-.04):
    parts.append(Bx('Pad body', (.20 * s, .05 * s, .085 * s), (cx, y, cz), '#e84a5f', bevel=.02 * s))
    for sd in (-1, 1):
        parts.append(S('Grip', (.045 * s, .026 * s, .06 * s), (cx + sd * .085 * s, y, cz - .035 * s), '#e84a5f', seg=10, rings=6, rot=(0, D(sd * 20), 0)))
    parts.append(Bx('Dpad v', (.014 * s, .012 * s, .045 * s), (cx - .06 * s, y - .028 * s, cz + .002 * s), '#2a2a30', bevel=.002))
    parts.append(Bx('Dpad h', (.045 * s, .012 * s, .014 * s), (cx - .06 * s, y - .028 * s, cz + .002 * s), '#2a2a30', bevel=.002))
    for k, (dx, dz, c) in enumerate(((.06, .012, '#ffd23a'), (.082, -.012, '#2fb04a'), (.04, -.014, '#2f6fd0'))):
        parts.append(S('Button', .0105 * s, (cx + dx * s, y - .03 * s, cz + dz * s), c, seg=8, rings=5))
    parts.append(S('Stick', .011 * s, (cx - .012 * s, y - .03 * s, cz - .018 * s), '#fffdf0', seg=8, rings=5))


def scene_minigames():
    new()
    parts = [tile(.62, .62, grad('#ffe9b0', '#ffc27a', '#ff9a6a', z0=-.31, z1=.31), bevel=.10)]
    # four little vignettes on a 2 x 2 grid
    controller(parts, -.125, .135, 1.15)
    volleyball(parts, (.13, -.05, .135), .098, 'Ball')
    # a diamond kite with a bow tail
    kx, kz = -.125, -.115
    dia = [V(kx, -.04, kz + .105), V(kx + .075, -.04, kz), V(kx, -.04, kz - .105), V(kx - .075, -.04, kz)]
    parts.append(Pl('Kite', [dia], '#e23a2a', up=-Yv))
    parts.append(Pl('Kite stripe', [[V(kx, -.045, kz + .105), V(kx + .012, -.045, kz + .0), V(kx, -.045, kz - .105), V(kx - .012, -.045, kz + .0)]], '#fff4dc', up=-Yv))
    parts.append(Pl('Kite cross', [[V(kx - .075, -.045, kz + .008), V(kx + .075, -.045, kz + .008), V(kx + .075, -.045, kz - .008), V(kx - .075, -.045, kz - .008)]], '#fff4dc', up=-Yv))
    parts.append(Tb('Kite tail', [V(kx, -.04, kz - .105), V(kx + .03, -.04, kz - .14), V(kx - .01, -.04, kz - .17), V(kx + .035, -.04, kz - .20)], .003, '#fff4dc', verts=4))
    for k, (dx, dz, c) in enumerate(((.03, -.14, '#2f6fd0'), (-.01, -.17, '#ffd23a'))):
        parts.append(Pl('Bow', [[V(kx + dx, -.04, kz + dz), V(kx + dx + .028, -.04, kz + dz + .014), V(kx + dx + .028, -.04, kz + dz - .014)],
                                [V(kx + dx, -.04, kz + dz), V(kx + dx - .028, -.04, kz + dz + .014), V(kx + dx - .028, -.04, kz + dz - .014)]], c, up=-Yv))
    # a target with an arrow
    ax, az = .13, -.125
    for k, (r, c) in enumerate(((.094, '#fff4dc'), (.075, '#e23a2a'), (.056, '#fff4dc'), (.037, '#2f6fd0'), (.018, '#ffd23a'))):
        parts.append(Cy(f'Ring {k}', r, .006, (ax, -.03 - k * .003, az), c, verts=24, rot=(D(90), 0, 0)))
    nock, tip = V(ax - .15, -.08, az - .07), V(ax + .005, -.065, az - .005)
    d = (tip - nock).normalized()
    up = V(-d.z, 0, d.x)
    parts.append(Rd('Arrow', nock, tip, .0055, '#e6c47a', verts=6))
    parts.append(Pl('Fletch', [feather_quad(nock + d * .005, d, up, .03, .045, 1), feather_quad(nock + d * .005, d, up, .03, .045, -1)], '#e23a2a'))
    finish_icon('minigames', parts)

# ====================================================================== CATEGORIES (one clear object each)


def scene_cat_tricks():
    new()
    parts = [disc(.30, grad('#ff9a52', '#c0508a', '#4a2a90', '#1c2a78', z0=-.30, z1=.30))]
    jar = import_static('glass-jar', 'jar')
    lo, hi = static_box(jar)
    s = .40 / (hi.z - lo.z)
    jar.matrix_world = Matrix.Translation(V(0, -.04, -.20)) @ Matrix.Scale(s, 4)
    bpy.context.view_layer.update()
    lo, hi = static_box(jar)
    jar.matrix_world = Matrix.Translation(V(-(lo.x + hi.x) / 2, -.04, -.20 - lo.z)) @ Matrix.Scale(s, 4)
    g = glow('#d8f030', 1.0)
    for k, (x, z, r) in enumerate(((-.035, -.10, .021), (.045, -.05, .019), (-.025, -.005, .021), (.04, .045, .018), (-.04, .08, .017), (.01, -.17, .016))):
        parts.append(col(sphere('Firefly', r * 1.35, (x, -.125, z), g, seg=8, rings=5), '#8aa010'))
    for x, z, s_ in ((-.2, .17, .7), (.19, .2, .5), (.2, -.05, .6)):
        sparkle(parts, x, z, s_)
    finish_icon('cat-tricks', parts, [jar])


def scene_cat_yard():
    new()
    parts = [disc(.30, grad('#79d65a', '#a6e87a', '#d6f0b8', '#9ed8ff', '#5fb0ee', z0=-.30, z1=.30))]
    ball = import_static('ball', 'ball')
    lo, hi = static_box(ball)
    s = .32 / max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    ball.matrix_world = Matrix.Translation(V(0, -.04, 0)) @ Matrix.Scale(s, 4)
    bpy.context.view_layer.update()
    lo, hi = static_box(ball)
    ball.matrix_world = Matrix.Translation(V(-(lo.x + hi.x) / 2, -.04, -.20 - lo.z + .02)) @ Matrix.Scale(s, 4)
    parts.append(S('Shadow', (.13, .05, .004), (0, -.03, -.205), '#4a8a3a', seg=14, rings=4, mt=MATTE))
    for k, (dx, dz) in enumerate(((-.22, .02), (-.2, .12), (.21, .06))):
        parts.append(Rd('Bounce', V(dx - .03, -.05, dz), V(dx + .03, -.05, dz + .035), .005, '#ffffff', verts=4))
    grass_tufts(parts, [(-.2, -.05, -.225, 1.0), (.2, -.05, -.225, 1.0), (.0, -.09, -.24, .8)])
    finish_icon('cat-yard', parts, [ball])


def scene_cat_fish():
    new()
    parts = [disc(.30, grad('#16609e', '#2f9ad8', '#69c8f0', '#bfeaff', z0=-.30, z1=.30))]
    koi = posed_copy('fish-koi', 'Swim', .25, 'koi')
    put(koi, (0, -.03, -.10), scale=.98, yaw=90)
    for k, (x, z, r) in enumerate(((.16, .14, .02), (.21, .20, .014), (.12, .22, .011))):
        parts.append(S('Bubble', r, (x, -.08, z), '#e9f8ff', seg=8, rings=5, mt=SHINY))
    finish_icon('cat-fish', parts, [koi])


def scene_cat_sky():
    new()
    parts = [disc(.30, grad('#5a3aa0', '#2a2a80', '#14206a', '#0a1040', z0=-.30, z1=.30))]
    parts.append(star_poly(0, -.01, .22, .095, -.04, .05, '#ffd23a'))
    parts[-1].data.materials.clear()
    parts[-1].data.materials.append(glow('#ffc83a', .9))
    parts.append(star_poly(0, -.01, .17, .072, -.075, .01, '#fff3c0'))
    for x, z, s_ in ((-.2, .18, .8), (.2, .15, .7), (.18, -.17, .6), (-.19, -.12, .6)):
        sparkle(parts, x, z, s_)
    finish_icon('cat-sky', parts)


def scene_cat_animals():
    new()
    parts = [disc(.30, grad('#ffd9a0', '#ffe9b8', '#dff2b0', '#8fd88a', z0=-.30, z1=.30))]
    cow = posed_copy('cow', 'Idle', .2, 'cow')
    put(cow, (0, -.03, -.235), height=.46, yaw=-34)
    parts.append(S('Shadow', (.16, .06, .004), (0, -.02, -.237), '#7ac060', seg=14, rings=4, mt=MATTE))
    grass_tufts(parts, [(-.22, -.06, -.235, 1.1), (.22, -.05, -.235, 1.0)])
    finish_icon('cat-animals', parts, [cow])


SCENES_ALL = {
    'trick-archery': scene_archery, 'trick-cowrace': scene_cowrace,
    'yard-footnet': scene_footnet, 'yard-keepup': scene_keepup, 'yard-volley': scene_volley, 'yard-rope': scene_rope,
    'yard-tug': scene_tug, 'yard-oanquan': scene_oanquan, 'yard-sack': scene_sack, 'yard-marbles': scene_marbles,
    'fish-dock': scene_fishdock, 'fish-mill': scene_fishmill,
    'cow-ride': scene_cowride, 'kite-workshop': scene_kiteworkshop, 'sky-stars': scene_skystars, 'minigames': scene_minigames,
    'cat-tricks': scene_cat_tricks, 'cat-yard': scene_cat_yard, 'cat-fish': scene_cat_fish, 'cat-sky': scene_cat_sky,
    'cat-animals': scene_cat_animals,
}

if __name__ == '__main__':
    only = [n.strip() for n in ARGV[ARGV.index('--only') + 1].split(',')] if '--only' in ARGV else list(SCENES_ALL)
    for nm in only:
        print('SCENE', nm)
        SCENES_ALL[nm]()
