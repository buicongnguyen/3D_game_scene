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
    """Farmer's hoe (kuwa), 1.2 m: wooden handle with an iron blade at the +Z end, angled forward
    (-Y) and down like a chopping tool. Origin at the right-hand grip 0.12 m above the butt (rope wrap)."""
    reset()
    wood = M('Wood', color='#a8703f')
    iron = M('Iron', color='#4a525e')
    rope = M('Rope')
    parts = [cyl('Handle', .016, 1.2, (0, 0, .48), wood, verts=8, r2=.014)]
    # blade: socket block then a flat blade hanging forward/down
    zt = 1.05
    parts.append(box('Socket', (.04, .07, .05), (0, -.02, zt), wood, bevel=.008, segments=1))
    blade_ob = box('Blade', (.13, .012, .17), (0, -.06, zt - .07), iron, bevel=.004, segments=1, rot=(-0.35, 0, 0),
                   taper=None)
    parts.append(blade_ob)
    parts.append(box('Neck', (.03, .05, .02), (0, -.045, zt + .005), iron, bevel=.004, segments=1))
    parts.append(cyl('Wrap', .018, .06, (0, 0, .0), rope, verts=8))
    print('hoe', tri_count(parts))

    def tints():
        grain([parts[0]], axis='z', freq=40, amp=.15)
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


def icon_onigiri():
    reset()
    rice = mat('Rice', '#f7f4ec', rough=.8)
    nori = mat('Nori', '#1f2a24', rough=.6)
    ume = mat('Umeboshi', '#c8323e', rough=.4)
    tri = extrude('Rice', [(-.08, -.055), (.08, -.055), (.0, .085)], .05, rice, bevel=.022)
    wrap = box('Nori', (.07, .056, .05), (0, 0, -.035), nori, bevel=.004, segments=1)
    dot = sphere('Ume', .014, (0, -.028, .01), ume, seg=8, rings=5)
    return _icon_finish('onigiri', [tri, wrap, dot])


def icon_radish():
    reset()
    white = mat('Daikon', '#f4f0e4', rough=.5)
    leaf = M('Leaves')
    root = lathe('Radish', [(0, -.16), (.012, -.14), (.03, -.06), (.038, .03), (.03, .06), (0, .065)], white, seg=12)
    leaves = [blade('Leaf', Vector((0, 0, .06)), Vector((math.cos(a) * .5, math.sin(a) * .5, 1)), .16, .05, leaf,
                    bend=.5, segs=3) for a in (0, 2.1, 4.2)]
    return _icon_finish('radish', [root] + leaves)


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
    reset()
    a = mat('Candy red', '#e84a5f', rough=.2)
    b = mat('Candy cream', '#fff3d6', rough=.2)
    stick = mat('Stick', '#f2ead8', rough=.6)
    parts = [cyl('Stick', .005, .12, (0, 0, -.08), stick, verts=6),
             cyl('Swirl', .06, .022, (0, 0, .02), b, verts=20, bevel=.008, rot=(math.pi / 2, 0, 0))]
    pts = [Vector((math.cos(t) * .009 * t, -.013, .02 + math.sin(t) * .009 * t)) for t in [i * .35 for i in range(19)]]
    parts.append(tube('Spiral', pts, .006, a, verts=5))
    return _icon_finish('candy', parts)


def icon_pinwheel():
    reset()
    stick = M('Bamboo')
    cols = [mat('Pin red', '#e2453a', rough=.5), mat('Pin blue', '#3a7fd0', rough=.5), M('Mustard paint')]
    parts = [cyl('Stick', .006, .26, (0, .008, -.12), stick, verts=6)]
    for i in range(4):
        a = TAU * i / 4
        pts = [(0, 0), (.09 * math.cos(a), .09 * math.sin(a)), (.09 * math.cos(a + .9), .09 * math.sin(a + .9))]
        parts.append(extrude('Vane', pts, .003, cols[i % 3] if i < 3 else cols[1], bevel=0, rot=(0, 0, 0),
                             loc=(0, -.003 * i, 0)))
    parts.append(sphere('Pin', .012, (0, -.016, 0), cols[2], seg=8, rings=5))
    return _icon_finish('pinwheel', parts)


def icon_paper():
    reset()
    paper = M('Paper')
    band = mat('Band', '#c8322a', rough=.5)
    parts = [box('Sheets', (.2, .14, .03), (0, 0, 0), paper, bevel=.004, segments=1),
             box('Top', (.2, .14, .004), (.006, .004, .018), paper, bevel=.002, segments=1, rot=(0, 0, .06)),
             box('Band', (.04, .145, .034), (0, 0, 0), band, bevel=.003, segments=1)]
    return _icon_finish('paper', parts)


def icon_flowers():
    reset()
    stem = M('Leaves', color='#4f9a34')
    wrap = mat('Wrap', '#f3e3c0', rough=.7)
    cols = [mat('Petal pink', '#f27aa0', rough=.5), mat('Petal yellow', '#f6c945', rough=.5)]
    parts = [lathe('Wrap', [(0, -.14), (.02, -.14), (.08, .03), (.075, .035), (.0, -.12)], wrap, seg=10)]
    rng = random.Random(3)
    for i in range(6):
        a = TAU * i / 6
        top = Vector((math.cos(a) * .05, math.sin(a) * .05, .09 + rng.uniform(0, .03)))
        parts.append(rod('Stem', Vector((0, 0, -.12)), top, .004, stem, verts=5))
        parts.append(petal_disc('Bloom', top, Vector((math.cos(a) * .3, math.sin(a) * .3 - .4, 1)), .035,
                                cols[i % 2], petals=6))
    return _icon_finish('flowers', parts)


def icon_tea():
    reset()
    cup = mat('Cup', '#7da38a', rough=.35)
    tea = mat('Tea', '#9cbb4a', rough=.1)
    parts = [lathe('Cup', [(0, -.04), (.04, -.04), (.042, -.035), (.055, .04), (.05, .042), (.045, -.03), (0, -.03)],
                   cup, seg=16),
             cyl('Tea', .049, .004, (0, 0, .03), tea, verts=16)]
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
    for o in parts:
        o.rotation_euler = (1.0, 0, 0)
        apply_transform(o)
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
    reset()
    paper = M('Paper')
    flap = mat('Flap', '#e9dcbc', rough=.8)
    wax = mat('Wax seal', '#b3241f', rough=.35)
    parts = [box('Env', (.2, .13, .008), (0, 0, 0), paper, bevel=.002, segments=1),
             extrude('Flap', [(-.1, .065), (.1, .065), (0, -.01)], .002, flap, bevel=0, loc=(0, 0, .005), rot=(-math.pi / 2, 0, 0)),
             cyl('Seal', .016, .006, (0, -.008, .008), wax, verts=12, bevel=.002)]
    for o in parts:
        o.rotation_euler = (.9, 0, 0)
        apply_transform(o)
    return _icon_finish('letter', parts)


def icon_shirt():
    reset()
    cloth = mat('Shirt', '#3d6fa8', rough=.85)
    patch = mat('Patch', '#e0b45a', rough=.85)
    collar = mat('Collar', '#2c5486', rough=.85)
    parts = [box('Body', (.2, .16, .035), (0, 0, 0), cloth, bevel=.012, segments=2),
             extrude('Collar', [(-.05, .08), (.05, .08), (.0, .03)], .01, collar, bevel=.003, loc=(0, 0, .02), rot=(-math.pi / 2, 0, 0)),
             box('Patch', (.05, .045, .004), (.04, -.03, .019), patch, bevel=.002, segments=1, rot=(0, 0, .2))]
    for x in (-.09, .09):
        parts.append(box('Fold', (.02, .16, .038), (x, 0, .002), cloth, bevel=.008, segments=1))
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
