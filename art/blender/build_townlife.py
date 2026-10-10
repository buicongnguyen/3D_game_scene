"""Town Life held props for Starline villagers: ball, broom, bucket, basket, letters, hoe.

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_townlife.py [-- --only a,b]

Same conventions as build_props.py (palette, AO bake, merge per material, <= 3 materials). Every prop
is a light held item with its origin at the GRIP point so the runtime can parent it to `grip_R`
(see "Town Life props" in art/CONTRACTS.md for the attach rotation per clip):
  * ball: origin at the centre (held in the palm / thrown / kicked).
  * broom, hoe: origin on the handle where the right hand holds it; the handle runs along +Z
    (three +Y); broom bristles toward -Z, hoe blade at the +Z end.
  * bucket, basket: origin at the top of the carrying handle, body hanging below (-Z) like the
    hand-lantern.
  * letters: origin at the pinched short edge, the bundle extends along +Z (three +Y).
A full build also saves art/blender/source/townlife.blend.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from np_kit import *  # noqa: F401,F403
from build_props import M, finish_prop, grain, ring_rod
from mathutils import Quaternion

TAU = math.tau


def band_split(ob, keep):
    """Keep only faces whose (object-space) centre/normal satisfy keep(c, n)."""
    return delete_faces(ob, lambda c, n: not keep(c, n))


def colour(objs, rgb):
    """Paint a flat colour into COLOR_0 (multiplied with the white 'Produce' base, like AO)."""
    tint(objs, lambda p, n, f: rgb)


# ================================================================ BALL

def build_ball():
    """Red-and-cream rubber ball, 0.2 m across: red hemispheres split by a cream equator band and
    cream polar dots. Origin at the centre."""
    reset()
    red = M('Red paint', color='#d8392b', rough=.45)
    cream = M('Cream paint', rough=.5)
    R = .1
    a = sphere('Ball red', R, material=red, seg=14, rings=9)
    b = sphere('Ball cream', R, material=cream, seg=14, rings=9)
    is_cream = lambda c, n: abs(n.z) < .2 or abs(n.z) > .93
    band_split(a, lambda c, n: not is_cream(c, n))
    band_split(b, is_cream)
    parts = [a, b]
    print('ball', tri_count(parts))
    return finish_prop('ball', parts, 'Ball', ground=None, dist=.04, strength=.35)


# ================================================================ BROOM

def build_broom():
    """Japanese straw broom (houki), 1.3 m: bamboo handle, a fan of straw bound with rope.
    Origin at the lower hand's grip, 0.5 m below the top; handle +Z, bristles at -Z (tip -0.8)."""
    reset()
    bamboo = M('Bamboo')
    straw = M('Straw')
    rope = M('Rope')
    parts = [cyl('Handle', .014, 1.0, (0, 0, .0), bamboo, verts=8)]
    for z in (-.18, .2):  # bamboo nodes
        parts.append(cyl('Node', .0165, .012, (0, 0, z), bamboo, verts=8))
    # straw fan: lathe flattened along Y, flaring to the tip
    fan = lathe('Straw', [(0, -.47), (.03, -.47), (.05, -.54), (.11, -.68), (.18, -.79), (.0, -.8)], straw, seg=10)
    fan.scale = (1.0, .32, 1.0)
    apply_transform(fan)
    parts.append(fan)
    for z in (-.505, -.56):
        parts.append(ring_rod('Binding', (0, 0, z), .034 if z > -.53 else .046, .007, rope, maj=10, mn=4))
        parts[-1].scale = (1, .45 if z < -.53 else 1, 1)
        apply_transform(parts[-1])
    print('broom', tri_count(parts))

    def tints():
        grain([fan], axis='z', freq=60, amp=.3, seed=2)
        grain([parts[0]], axis='z', freq=8, amp=.1)
    return finish_prop('broom', parts, 'Broom', ground=None, dist=.06, strength=.5, tints=tints)


# ================================================================ BUCKET

def build_bucket():
    """Wooden bucket (oke) with two dark hoops and a rope handle. Origin at the top of the rope
    handle; the bucket hangs below it (rim at z=-0.12, base at z=-0.38)."""
    reset()
    wood = M('Wood', color='#b47a46')
    iron = M('Dark iron')
    rope = M('Rope')
    top, bot = -.12, -.38
    parts = [lathe('Bucket', [(0, bot + .012), (.118, bot + .012), (.12, bot), (.135, top), (.124, top),
                              (.11, bot + .03), (0, bot + .03)], wood, seg=16, smooth_angle=30)]
    for z, r in ((bot + .045, .123), (top - .045, .133)):
        parts.append(ring_rod('Hoop', (0, 0, z), r, .006, iron, maj=16, mn=4))
    # ears + rope handle
    pts = []
    for i in range(9):
        a = math.pi * i / 8
        pts.append(Vector((-.135 * math.cos(a), 0, top - .02 + .14 * math.sin(a) ** .8)))
    parts.append(tube('Handle', pts, .007, rope, verts=5))
    for s in (-1, 1):
        parts.append(box('Ear', (.02, .03, .05), (s * .135, 0, top - .005), wood, bevel=.005, segments=1))
    # shift so the handle top sits at the origin
    ztop = max((o.matrix_world @ v.co).z for v in parts[-3].data.vertices for o in [parts[-3]])
    for o in parts:
        o.location.z -= ztop
        apply_transform(o)
    print('bucket', tri_count(parts))

    def tints():
        # staves: alternating tone by angle
        tint([parts[0]], lambda p, n, f: .86 + .14 * (int((math.atan2(p.y, p.x) / TAU + 1) * 16) % 2))
        grain([parts[0]], axis='z', freq=30, amp=.15)
    return finish_prop('bucket', parts, 'Bucket', ground=None, dist=.08, strength=.55, tints=tints)


# ================================================================ BASKET

def build_basket():
    """Woven bamboo basket (kago) with a bamboo hoop handle, holding a daikon, carrots, an eggplant
    and a cabbage. Origin at the top of the handle; the basket hangs below it."""
    reset()
    weave = M('Straw', color='#d7ad62')
    produce = mat('Produce', '#ffffff', rough=.55)
    leaf = M('Leaves', color='#5aa632')
    top, bot = -.2, -.36
    body = lathe('Basket', [(0, bot), (.12, bot), (.15, bot + .03), (.17, top), (.18, top + .006), (.165, top + .006),
                            (.155, top - .01), (.11, bot + .02), (0, bot + .02)], weave, seg=14, smooth_angle=40)
    parts = [body]
    hp = [Vector((-.17 * math.cos(math.pi * i / 10), 0, top + .2 * math.sin(math.pi * i / 10))) for i in range(11)]
    parts.append(tube('Handle', hp, .009, weave, verts=6))
    veg = []
    d = capsule('Daikon', Vector((-.08, .02, top + .01)), Vector((.12, -.03, top + .13)), .03, produce, seg=8, rings=4)
    veg.append((d, (.97, .95, .88)))
    for i, (x, y) in enumerate(((-.05, -.08), (.0, -.09))):
        c = capsule('Carrot', Vector((x, y, top + .0)), Vector((x + .06, y + .02, top + .07)), .016, produce, seg=6, rings=3,
                    r2=.004)
        veg.append((c, (1.0, .52, .16)))
    e = sphere('Eggplant', (.04, .035, .055), (.075, .065, top + .05), produce, seg=8, rings=6, rot=(0.5, 0.4, 0))
    veg.append((e, (.36, .2, .45)))
    cb = sphere('Cabbage', .065, (-.05, .07, top + .04), produce, seg=9, rings=6)
    veg.append((cb, (.7, .86, .45)))
    for ob, _ in veg:
        parts.append(ob)
    leaves = []
    for k, a in enumerate((-0.4, 0.1, 0.6)):
        leaves.append(blade('Leaf', Vector((.13, -.03, top + .13)), Vector((math.cos(a), math.sin(a) * .6, 1.2)), .09, .03,
                            leaf, bend=.4, segs=3))
    for x, y in ((-.05, -.08), (.0, -.09)):
        leaves.append(blade('Leaf', Vector((x + .06, y + .02, top + .07)), Vector((.4, -.3, 1)), .05, .015, leaf, bend=.3, segs=2))
    parts += leaves
    for o in parts:
        o.location.z -= top + .2
        apply_transform(o)
    print('basket', tri_count(parts))

    def tints():
        # woven bands: alternate light/dark rings and a diagonal check
        tint([body, parts[1]], lambda p, n, f: .7 + .3 * ((int((p.z + 1) * 70) + int((math.atan2(p.y, p.x) / TAU + 1) * 24)) % 2))
        for ob, rgb in veg:
            colour([ob], rgb)
    return finish_prop('basket', parts, 'Basket', ground=None, dist=.08, strength=.55, tints=tints)


# ================================================================ LETTERS

def build_letters():
    """A bundle of five letters tied crosswise with red string. Origin at the pinched short edge; the
    bundle extends 0.16 m along +Z (three +Y), 0.11 m wide along X, faces toward +-Y."""
    reset()
    paper = M('Paper')
    string = M('Fabric red', color='#d63a2e', rough=.7)
    stamp = mat('Stamp', '#2f6fb0', rough=.6)
    rng = random.Random(4)
    parts, sheets = [], []
    W, H, T = .11, .16, .0055
    for i in range(5):
        y = (i - 2) * T
        sh = box('Letter', (W, T * .9, H), (rng.uniform(-.004, .004), y, H / 2 + rng.uniform(-.004, .004)), paper,
                 bevel=.0015, segments=1, rot=(0, rng.uniform(-.05, .05), 0))
        sheets.append(sh)
        parts.append(sh)
    # crossed string
    parts.append(box('String', (W + .004, 5 * T + .004, .006), (0, 0, H * .55), string, bevel=.002, segments=1))
    parts.append(box('String', (.006, 5 * T + .004, H + .004), (0, 0, H / 2), string, bevel=.002, segments=1))
    parts.append(box('Knot', (.016, .012, .014), (0, -2.5 * T - .004, H * .55), string, bevel=.004, segments=1))
    parts.append(box('Stamp', (.022, .002, .026), (.03, -2.5 * T - .001, H * .82), stamp, bevel=.001, segments=1))
    print('letters', tri_count(parts))

    def tints():
        for k, s in enumerate(sheets):
            t = (1, .97, .9) if k % 2 else (.95, .93, .98)
            colour([s], t)
    return finish_prop('letters', parts, 'Letters', ground=None, dist=.03, strength=.4, tints=tints)


# ================================================================ HOE

def build_hoe():
    """Farmer's hoe (kuwa), 1.2 m: wooden handle, and at the +Z end an iron blade set at a RIGHT ANGLE to the handle
    (on the +Y side, 0.21 m long, 0.125 m wide), held by an iron eye and a wooden wedge. Origin at the right-hand
    grip 0.12 m above the butt (rope wrap). The Hammer grip rotation in art/CONTRACTS.md turns the +Y side down and
    back toward the user, so the cutting edge chops into the ground at the strike."""
    reset()
    wood = M('Wood', color='#a8703f')
    iron = M('Iron', color='#4a525e')
    rope = M('Rope')
    parts = [cyl('Handle', .016, 1.2, (0, 0, .48), wood, verts=8, r2=.015)]
    zt = 1.045
    ang = math.radians(90)                                   # blade vs handle
    d = Vector((0, math.sin(ang), -math.cos(ang)))            # along the blade, from the eye to the cutting edge
    L, W = .21, .125
    # iron eye round the handle top, a wedge driven in from above, the blade's shank and the blade itself
    parts.append(cyl('Eye', .026, .05, (0, 0, zt), iron, verts=8, bevel=.004, segments=1))
    parts.append(box('Wedge', (.018, .03, .03), (0, 0, zt + .035), wood, bevel=.004, segments=1))
    c = Vector((0, .018, zt)) + d * (L / 2)
    blade_ob = box('Blade', (W, .011, L), tuple(c), iron, bevel=.004, segments=1, rot=(ang, 0, 0), taper=(.86, 1.0))
    parts.append(blade_ob)
    edge = Vector((0, .018, zt)) + d * (L - .012)
    parts.append(box('Edge', (W * 1.0, .006, .03), tuple(edge), iron, bevel=.002, segments=1, rot=(ang, 0, 0)))
    parts.append(cyl('Wrap', .018, .06, (0, 0, .0), rope, verts=8))
    print('hoe', tri_count(parts))

    def tints():
        grain([parts[0]], axis='z', freq=40, amp=.15)
        # a worn, bright cutting edge and a darker forged body
        e0 = Vector((0, .018, zt))
        tint([blade_ob, parts[4]], lambda p, n, f: .82 + .5 * smoothstep(L * .55, L, (Vector(p) - e0).dot(d)))
    return finish_prop('hoe', parts, 'Hoe', ground=None, dist=.05, strength=.5, tints=tints)


BUILDERS = {
    'ball': build_ball,
    'broom': build_broom,
    'bucket': build_bucket,
    'basket': build_basket,
    'letters': build_letters,
    'hoe': build_hoe,
}



# ================================================================ goods icon models (icons only)
# Small stand-alone models for the shop goods icons, exported to .tools/townlife-icons/ (never public/):
#   blender -b --factory-startup --python art/blender/build_townlife.py -- --icons
#   blender -b --factory-startup --python art/blender/render_icons.py -- --models .tools/townlife-icons <names...>
ICON_OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.tools',
                        'townlife-icons')


def _icon_finish(name, parts, dist=.04):
    meshes = [p for p in parts if p is not None and p.type == 'MESH']
    bake_ao(meshes, rays=32, distance=dist, strength=.45, ground=None, min_value=.35)
    root = empty(name)
    for o in join_by_material(meshes, name):
        apply_transform(o)
        set_parent(o, root)
    return export(name, [root], out_dir=ICON_OUT)


def _turn(parts, rot):
    """Rotate finished parts together about the origin (their own loc/rot are applied first)."""
    R = Euler(rot).to_matrix().to_4x4()
    for o in parts:
        apply_transform(o)
        o.matrix_world = R @ o.matrix_world
        apply_transform(o)


def _round_poly(corners, r, n=5):
    """Outline of a convex polygon with corners rounded to radius r (n points per corner), CCW."""
    out = []
    m = len(corners)
    for i in range(m):
        p0, p1, p2 = (Vector(corners[(i - 1) % m]), Vector(corners[i]), Vector(corners[(i + 1) % m]))
        a, b = (p0 - p1).normalized(), (p2 - p1).normalized()
        half = math.acos(max(-1, min(1, a.dot(b)))) / 2
        dist = r / math.tan(half)
        cen = p1 + (a + b).normalized() * (r / math.sin(half))
        s, e = p1 + a * dist - cen, p1 + b * dist - cen
        a0, a1 = math.atan2(s.y, s.x), math.atan2(e.y, e.x)
        while a1 < a0:
            a1 += TAU
        if a1 - a0 > math.pi:
            a1 -= TAU
        for k in range(n + 1):
            t = a0 + (a1 - a0) * k / n
            out.append((cen.x + r * math.cos(t), cen.y + r * math.sin(t)))
    return out


def icon_onigiri():
    """Rice ball: a plump rounded triangle of white rice, a strip of dark nori wrapped up over the bottom and the
    front, a red pickled plum showing at the top."""
    reset()
    rice = mat('Rice', '#fbf8ef', rough=.75)
    nori = mat('Nori', '#22382c', rough=.55)
    ume = mat('Umeboshi', '#d8323e', rough=.35)
    tri = extrude('Rice', _round_poly([(-.092, -.06), (.092, -.06), (.0, .098)], .034), .062, rice, bevel=.024, segments=3)
    # nori band: hugs the lower middle, front, bottom and back (2 mm proud of the rice)
    wrap = extrude('Nori', _round_poly([(-.043, -.064), (.043, -.064), (.043, .012), (-.043, .012)], .008, 2), .068, nori,
                   bevel=.004, segments=1)
    dot = sphere('Ume', (.017, .012, .015), (0, -.027, .048), ume, seg=10, rings=6)
    return _icon_finish('onigiri', [tri, wrap, dot])


def icon_radish():
    """Pickled radish (takuan): a fat golden-yellow pickled daikon on a little indigo dish, three round slices cut
    from its end leaning in front."""
    reset()
    yellow = mat('Takuan', '#f6c21c', rough=.45)
    core = mat('Takuan cut', '#ffe07a', rough=.5)
    dish = mat('Dish', '#2f5fa8', rough=.3)
    rim = mat('Dish rim', '#f4f1e8', rough=.35)
    parts = [lathe('Dish', [(0, 0), (.085, 0), (.118, .012), (.128, .026), (.12, .03), (.105, .02), (.08, .012), (0, .012)],
                   dish, seg=20),
             ring_rod('Rim', (0, 0, .028), .124, .0045, rim, maj=20, mn=4)]
    a, b = Vector((-.085, .03, .05)), Vector((.05, .03, .052))
    parts.append(capsule('Takuan', a, b, .036, yellow, seg=12, rings=5, r2=.033))
    parts.append(cyl('Cut', .0325, .004, tuple(b + Vector((.034, 0, 0))), core, verts=12, rot=(0, math.pi / 2, 0)))
    for i, (x, y, lean) in enumerate(((.0, -.05, .9), (.045, -.052, 1.05), (.088, -.04, 1.2))):
        parts.append(cyl('Slice', .033, .012, (x, y, .034), yellow, verts=12, bevel=.003, segments=1, rot=(lean, 0, .25)))
        n = Euler((lean, 0, .25)).to_matrix() @ Vector((0, 0, 1))
        if n.y > 0:
            n = -n
        parts.append(cyl('Slice cut', .026, .002, tuple(Vector((x, y, .034)) + n * .0065), core, verts=12,
                         rot=(lean, 0, .25)))
    return _icon_finish('radish', parts)


def icon_dango():
    reset()
    stick = M('Bamboo', color='#d8b878')
    cols = [mat('Dango pink', '#f2a3b8', rough=.5), mat('Dango white', '#f7f2e6', rough=.5),
            mat('Dango green', '#8cc06a', rough=.5)]
    parts = [cyl('Stick', .005, .26, (0, 0, -.02), stick, verts=6)]
    for i, m in enumerate(cols):
        parts.append(sphere('Dango', .032, (0, 0, .07 - i * .062), m, seg=12, rings=8))
    return _icon_finish('dango', parts)


def icon_candy():
    """Red-bean candy: a plump sweet in a twisted red wrapper with a cream band and two fanned ends."""
    reset()
    red = mat('Candy red', '#d92f45', rough=.3)
    cream = mat('Candy cream', '#fff0cf', rough=.35)
    bean = mat('Candy bean', '#7a2233', rough=.3)
    parts = [sphere('Sweet', (.06, .042, .042), (0, 0, 0), red, seg=16, rings=10),
             ring_rod('Band', (0, 0, 0), .0425, .006, cream, axis=(1, 0, 0), maj=16, mn=4),
             sphere('Bean', (.012, .008, .016), (.0, -.041, .0), bean, seg=8, rings=5)]
    for s in (-1, 1):
        parts.append(ring_rod('Tie', (s * .058, 0, 0), .013, .0045, cream, axis=(1, 0, 0), maj=10, mn=4))
        # the twisted paper end: a pleated cone flaring outward
        prof = [(.011, 0), (.02, .012), (.034, .034), (.04, .05), (.0, .046)]
        fan = lathe('Twist', prof, red, seg=10, rot=(0, s * math.pi / 2, 0), loc=(s * .058, 0, 0), smooth_angle=20)
        apply_transform(fan)
        for v in fan.data.vertices:
            r_ = math.hypot(v.co.y, v.co.z)
            if r_ > .015:
                k = 1 + .16 * math.cos(5 * math.atan2(v.co.z, v.co.y))
                v.co.y *= k
                v.co.z *= k
        parts.append(fan)
    _turn(parts, (0, -.3, .35))
    return _icon_finish('candy', parts)


def icon_pinwheel():
    """Paper pinwheel: four red paper vanes with gold folded-over halves, pinned to a bamboo stick with a brass bead."""
    reset()
    stick = M('Bamboo')
    red = mat('Pin red', '#e2392e', rough=.5, double=True)
    gold = mat('Pin gold', '#ffc02e', rough=.45, double=True)
    brass = M('Brass')
    parts = [cyl('Stick', .007, .2, (0, .014, -.115), stick, verts=6)]
    R = .125
    pol = lambda ang, r, y: (r * math.cos(ang), y, r * math.sin(ang))
    for i in range(4):
        a = TAU * i / 4 + .35
        # red: the flat back of the vane, out to its pointed tip
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in ((0, .006, 0), pol(a, R, .006), pol(a + .95, R * .5, .006))]
        bm.faces.new(vs)
        parts.append(from_bmesh('Vane', bm, red, smooth_angle=30))
        # gold: the corner folded over to the pin, standing proud of the red
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in ((0, -.012, 0), pol(a + .95, R * .5, -.002), pol(a + TAU / 4, R * .98, .004),
                                        pol(a + TAU / 4 - .32, R * .46, -.02))]
        bm.faces.new((vs[0], vs[1], vs[2]))
        bm.faces.new((vs[0], vs[2], vs[3]))
        parts.append(from_bmesh('Fold', bm, gold, smooth_angle=30))
    parts.append(sphere('Pin', .016, (0, -.018, 0), brass, seg=10, rings=6))
    return _icon_finish('pinwheel', parts)


def icon_paper():
    """Letter paper: a small stack of pale blue sheets (the top one askew, ruled with faint lines), a round little
    pot of ink with a cork, and a writing brush."""
    reset()
    paper = mat('Letter paper', '#bfe3f7', rough=.8)
    line = mat('Paper line', '#7fb4dc', rough=.8)
    pot = mat('Ink pot', '#263a6e', rough=.2)
    ink = mat('Ink', '#1d2430', rough=.15)
    wood = M('Bamboo', color='#d8b878')
    parts = [box('Sheets', (.2, .15, .016), (0, 0, .008), paper, bevel=.003, segments=1),
             box('Top', (.2, .15, .004), (.008, .004, .019), paper, bevel=.0015, segments=1, rot=(0, 0, .09))]
    for i in range(5):
        y = -.05 + i * .024
        parts.append(box('Line', (.15, .0035, .0012), (.008 - y * .09, y, .0215), line, bevel=0, rot=(0, 0, .09)))
    px, py = .062, .028
    parts.append(lathe('Pot', [(0, .0), (.03, .0), (.04, .012), (.041, .03), (.03, .046), (.02, .05), (.02, .058), (.024, .06),
                               (.024, .066), (0, .066)], pot, seg=14, loc=(px, py, .021)))
    parts.append(cyl('Ink', .017, .003, (px, py, .0885), ink, verts=10))
    a, b = Vector((-.07, -.05, .028)), Vector((.01, .03, .034))
    parts.append(rod('Brush', a, b, .0065, wood, verts=6))
    dirn = (a - b).normalized()
    parts.append(capsule('Bristle', a + dirn * .002, a + dirn * .04, .0085, ink, seg=8, rings=3, r2=.0015))
    return _icon_finish('paper', parts)


def icon_flowers():
    """Wildflowers: a hand-tied bunch of yellow and blue meadow flowers (round five-petal blooms with bright
    centres) on green stems with a few leaves, wrapped in cream paper and tied with red string."""
    reset()
    stem = M('Leaves', color='#4f9a34', double=True)
    wrap = mat('Wrap', '#f6e6c2', rough=.7, double=True)
    tie = mat('Tie', '#d8342c', rough=.6)
    yel = mat('Petal yellow', '#ffcf2e', rough=.5)
    blue = mat('Petal blue', '#3f7ff0', rough=.5)
    cen_y = mat('Bloom centre', '#ff8a1e', rough=.5)
    cen_b = mat('Bloom eye', '#fff3a8', rough=.5)
    parts = [lathe('Wrap', [(.012, -.15), (.03, -.1), (.07, -.01), (.088, .03), (.08, .03), (.06, -.015), (.02, -.1)], wrap,
                   seg=10, smooth_angle=30),
             ring_rod('Tie', (0, 0, -.092), .031, .006, tie, maj=10, mn=4)]
    blooms = [((0, -.02, .125), blue, cen_b, .038), ((-.062, -.01, .085), yel, cen_y, .04), ((.062, -.012, .09), yel, cen_y, .037),
              ((-.028, .035, .105), blue, cen_b, .032), ((.03, .04, .11), yel, cen_y, .033), ((.0, -.06, .06), blue, cen_b, .034)]
    for i, (c, m, mc, r) in enumerate(blooms):
        c = Vector(c)
        nrm = (Vector((c.x * 1.4, c.y * 1.2 - .05, .1))).normalized()
        parts.append(rod('Stem', Vector((0, 0, -.1)), c - nrm * .008, .004, stem, verts=5))
        q = nrm.to_track_quat('Z', 'Y')
        for k in range(5):
            a = TAU * k / 5 + i
            off = q @ Vector((math.cos(a) * r * .58, math.sin(a) * r * .58, 0))
            p = sphere('Petal', (r * .52, r * .4, r * .16), tuple(c + off), m, seg=8, rings=4)
            p.rotation_euler = (q @ Quaternion((0, 0, 1), a)).to_euler()
            apply_transform(p)
            parts.append(p)
        parts.append(sphere('Centre', (r * .3, r * .3, r * .22), tuple(c + nrm * r * .12), mc, seg=8, rings=4,
                            rot=tuple(q.to_euler())))
    for a, tilt in ((.6, .9), (2.6, 1.0), (4.4, .8)):
        parts.append(blade('Leaf', Vector((math.cos(a) * .03, math.sin(a) * .03, -.03)),
                           Vector((math.cos(a) * tilt, math.sin(a) * tilt, .8)), .1, .034, stem, bend=.5, segs=3))
    return _icon_finish('flowers', parts)


def icon_tea():
    """Roasted tea: a round tea tin (chazutsu), deep green with a cream paper label, a red seal and a brass lid."""
    reset()
    tin = mat('Tea tin', '#2f8a58', rough=.35)
    label = mat('Tea label', '#f6ecd0', rough=.75)
    seal = mat('Tea seal', '#d8342c', rough=.5)
    brass = M('Brass')
    leaf = mat('Tea leaf', '#2f7d3a', rough=.6, double=True)
    parts = [cyl('Tin', .058, .13, (0, 0, .065), tin, verts=24, bevel=.006, segments=2),
             cyl('Lid', .0605, .036, (0, 0, .136), brass, verts=24, bevel=.006, segments=2),
             cyl('Lid top', .05, .004, (0, 0, .1555), brass, verts=24)]
    # label: a curved panel on the front (-Y), a red square seal and a tea leaf on it
    bm = bmesh.new()
    n, r0 = 8, .0592
    cols = []
    for i in range(n + 1):
        a = -math.pi / 2 + (i / n - .5) * 1.5
        cols.append((bm.verts.new((math.cos(a) * r0, math.sin(a) * r0, .022)), bm.verts.new((math.cos(a) * r0, math.sin(a) * r0, .105))))
    for (a0, b0), (a1, b1) in zip(cols, cols[1:]):
        bm.faces.new((a0, a1, b1, b0))
    parts.append(from_bmesh('Label', bm, label, smooth_angle=60))
    parts.append(box('Seal', (.022, .004, .022), (.02, -.0585, .04), seal, bevel=.002, segments=1, rot=(0, 0, .34)))
    parts.append(blade('Leaf', Vector((-.022, -.062, .05)), Vector((.25, 0, 1)), .05, .022, leaf, bend=.15, segs=3,
                       up=(0, -1, 0)))
    parts.append(blade('Leaf', Vector((-.02, -.062, .05)), Vector((-.6, 0, 1)), .036, .017, leaf, bend=.15, segs=3,
                       up=(0, -1, 0)))
    return _icon_finish('tea', parts)


def icon_mon():
    """Mon coin: round brass coin with a square hole, tilted toward the camera."""
    reset()
    brass = M('Brass')
    ring = cyl('Coin', .07, .012, (0, 0, 0), brass, verts=24, bevel=.003)
    hole = box('Hole', (.03, .03, .05), (0, 0, 0), brass, bevel=0, segments=1)
    m = ring.modifiers.new('b', 'BOOLEAN')
    m.object = hole
    m.operation = 'DIFFERENCE'
    apply_mods(ring)
    bpy.data.objects.remove(hole)
    rim = ring_rod('Rim', (0, 0, .006), .062, .003, brass, maj=24, mn=4)
    sq = ring_rod('Inner', (0, 0, .006), .026, .003, brass, maj=4, mn=4, rot=math.pi / 4)
    parts = [ring, rim, sq]
    _turn(parts, (1.0, 0, 0))
    return _icon_finish('mon', parts)


def icon_parcel():
    reset()
    paper = mat('Kraft', '#c9965e', rough=.8)
    string = M('Rope', color='#efe2c4')
    parts = [box('Box', (.18, .13, .09), (0, 0, 0), paper, bevel=.01, segments=1),
             box('S1', (.186, .02, .096), (0, 0, 0), string, bevel=.004, segments=1),
             box('S2', (.02, .136, .096), (0, 0, 0), string, bevel=.004, segments=1)]
    parts += [torus('Bow', .02, .005, (s * .018, 0, .052), string, maj=10, mn=4, rot=(math.pi / 2, 0, s * .4))
              for s in (-1, 1)]
    return _icon_finish('parcel', parts)


def icon_letter():
    """A sealed letter: a cream envelope seen from the back, its pointed flap a shade darker with a shadow line,
    closed with a round red wax seal."""
    reset()
    paper = M('Paper', color='#fbf1d6')
    flap = mat('Flap', '#ecd9a8', rough=.8)
    wax = mat('Wax seal', '#c8261f', rough=.3)
    edge = mat('Flap edge', '#b08f55', rough=.8)
    W, H = .21, .14
    parts = [box('Env', (W, .008, H), (0, 0, 0), paper, bevel=.002, segments=1),
             extrude('Flap', [(-W / 2 + .004, H / 2 - .003), (W / 2 - .004, H / 2 - .003), (0, -.012)], .003, flap, bevel=0,
                     loc=(0, -.0055, 0)),
             cyl('Seal', .021, .007, (0, -.009, -.006), wax, verts=14, bevel=.0025, segments=1, rot=(math.pi / 2, 0, 0)),
             cyl('Seal stamp', .011, .003, (0, -.0135, -.006), wax, verts=5, rot=(math.pi / 2, 0, 0))]
    for s in (-1, 1):
        a, b = Vector((s * (W / 2 - .004), -.0075, H / 2 - .003)), Vector((0, -.0075, -.012))
        parts.append(rod('Flap edge', a, b, .0018, edge, verts=4))
        # the two lower folds of the envelope back
        parts.append(rod('Fold', Vector((s * (W / 2 - .004), -.0045, -H / 2 + .003)), Vector((s * .014, -.0045, -.004)), .0012,
                         edge, verts=4))
    _turn(parts, (-.62, 0, .12))
    return _icon_finish('letter', parts)


def icon_shirt():
    """Goro's old shirt, folded: indigo work shirt with the collar on top, a button placket, the sleeves folded in
    and a mustard patch sewn on with big stitches."""
    reset()
    cloth = mat('Shirt', '#3f74b8', rough=.85)
    dark = mat('Collar', '#2a4f86', rough=.85)
    patch = mat('Patch', '#e8b548', rough=.85)
    btn = mat('Button', '#f4ead0', rough=.5)
    parts = [box('Body', (.2, .17, .036), (0, 0, 0), cloth, bevel=.013, segments=2)]
    for s in (-1, 1):
        # sleeves folded over the front, collar wings
        parts.append(box('Sleeve', (.05, .15, .012), (s * .068, -.004, .02), cloth, bevel=.005, segments=1, rot=(0, 0, s * .1)))
        parts.append(extrude('Collar', [(0, .0), (s * .058, .012), (s * .05, .05), (s * .008, .042)], .012, dark, bevel=.003,
                             segments=1, plane='XY', loc=(0, .034, .027)))
    parts.append(box('Yoke', (.07, .016, .01), (0, .082, .024), dark, bevel=.003, segments=1))
    parts.append(box('Placket', (.018, .12, .004), (0, -.025, .0195), dark, bevel=.001, segments=1))
    for i in range(3):
        parts.append(cyl('Button', .0062, .003, (0, .012 - i * .04, .0225), btn, verts=8))
    parts.append(box('Patch', (.046, .042, .004), (.058, -.045, .0275), patch, bevel=.0015, segments=1, rot=(0, 0, .25)))
    return _icon_finish('shirt', parts)


def icon_toy_boat():
    reset()
    wood = M('Wood', color='#c98a4e')
    paper = M('Paper')
    red = M('Red paint')
    hull = extrude('Hull', [(-.11, .02), (.09, .02), (.13, .045), (.06, -.03), (-.09, -.03)], .07, wood, bevel=.01)
    mast = cyl('Mast', .005, .16, (0, 0, .1), wood, verts=6)
    sail = extrude('Sail', [(.004, .04), (.004, .17), (.08, .05)], .003, paper, bevel=0)
    flag = extrude('Flag', [(0, .17), (0, .195), (-.03, .183)], .003, red, bevel=0)
    return _icon_finish('toy-boat', [hull, mast, sail, flag])


ICONS = {
    'onigiri': icon_onigiri, 'radish': icon_radish, 'dango': icon_dango, 'candy': icon_candy,
    'pinwheel': icon_pinwheel, 'paper': icon_paper, 'flowers': icon_flowers, 'tea': icon_tea, 'mon': icon_mon,
    'parcel': icon_parcel, 'letter': icon_letter, 'shirt': icon_shirt, 'toy-boat': icon_toy_boat,
}

if __name__ == '__main__':
    if '--icons' in sys.argv:
        import shutil
        os.makedirs(ICON_OUT, exist_ok=True)
        for n, fn in ICONS.items():
            print('ICON MODEL', n)
            fn()
        for n in ('ball', 'letters'):       # icons of the real props
            info = BUILDERS[n]()
            shutil.copy(os.path.join(OUT, n + '.glb'), os.path.join(ICON_OUT, n + '.glb'))
    else:
        names, full = parse_only(list(BUILDERS))
        results = []
        for n in names:
            print('BUILD', n)
            results.append((n, BUILDERS[n]()))
        report(results)
        if full:
            save_kit('townlife', list(BUILDERS), spacing=1.0)
