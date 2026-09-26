"""Nature family for Starline: trees, bushes, rocks, flowers and forest-floor dressing.

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_nature.py [-- --only a,b]

Trees are instanced hundreds of times, so each one is exactly one mesh per material (Bark plus
its foliage material) and stays inside the contract budget. Canopies are sculpted from many
overlapping displaced lobes (faces buried inside neighbouring lobes are culled), branches show
where the canopy opens, trunks flare into roots. Foliage is authored as the spring/summer look;
the runtime recolours `Leaves`, `Maple leaves` and `Blossom` per season, so the depth lives in the
baked COLOR_0 (AO plus painted tone). A full build also saves art/blender/source/nature.blend.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from np_kit import *  # noqa: F401,F403

# ---------------------------------------------------------------- palette


def M_bark():
    return mat('Bark', '#7a5238', rough=.88)


def M_leaves():
    return mat('Leaves', '#5aa632', rough=.62)


# ---------------------------------------------------------------- tree toolkit

# Distant LODs (tree-*-lod, <= 350 tris) reuse each tree's builder with LOD set: the same lobes
# are remeshed coarse and smooth, trunks and limbs drop to a few sides, twigs and fruit go.
LOD = False
LOD_BUDGET = 350


def make_trunk(name, spine, r0, r1, material, sides=16, roots=4, root_amp=.9, root_h=.12, seed=0,
               ridge=.05, ridges=None, twist=.4, flare=1.0, noise_amp=.05, rings=12, root_m=None):
    """Trunk sweep: root flare (radius swells at the base), rounded buttress roots, bark fluting,
    twist. Rings are packed near the base where the flare needs the resolution."""
    if LOD:
        sides, rings, roots, root_amp, ridge, noise_amp, twist = 6, 4, 3, root_amp * .5, 0.0, 0.0, 0.0
    ph = random.Random(seed).uniform(0, TAU)
    dense = spline(spine, 80)
    L = sum((b - a).length for a, b in zip(dense, dense[1:]))
    rm = root_m if root_m is not None else max(.35, root_h * L)
    cum = [0.0]
    for a, b in zip(dense, dense[1:]):
        cum.append(cum[-1] + (b - a).length)
    pts = []
    for i in range(rings):
        u = (i / (rings - 1)) ** 1.7 * L
        k = next((j for j, c in enumerate(cum) if c >= u), len(cum) - 1)
        pts.append(dense[k])
    def zof(s):
        return (s ** 1.7) * L
    z_base = Vector(spine[0]).z
    def ground(s):
        """Root weight: strongest at the terrain line (z=0), tucking back in below it so uneven
        terrain never exposes a flat star of fins."""
        z = z_base + zof(s)
        if z >= 0:
            return math.exp(-z / rm)
        return 1 - .55 * min(1.0, -z / .35)
    def rad(s):
        m = zof(s)
        return lerp(r0, r1, min(1.0, m / L) ** .8) * (1 + flare * .8 * ground(s))
    def prof(s, a):
        k = (.5 + .5 * math.cos(roots * (a - ph))) ** 2.2  # rounded buttresses with soft valleys
        return 1 + root_amp * .85 * k * ground(s)
    return sweep(name, pts, rad, material, sides=sides, caps=False, twist=twist, ridge=ridge,
                 ridge_count=ridges or sides // 2, profile=prof, noise_amp=noise_amp, seed=seed,
                 pole_end=pts[-1] + (pts[-1] - pts[-2]).normalized() * r1 * .6, smooth_angle=75)


def make_limb(name, pts, r0, r1, material, sides=7, seed=0, count=None, ridge=.04):
    noise_amp = .04
    if LOD:
        if name == 'Twig':
            return None
        sides, count, ridge, noise_amp, r0, r1 = 4, 3, 0.0, 0.0, r0 * 1.15, r1 * 1.4
    P = spline(pts, count or max(5, len(pts) * 2 + 1))
    return sweep(name, P, lambda s: lerp(r0, r1, s), material, sides=sides, caps=False,
                 pole_end=P[-1] + (P[-1] - P[-2]).normalized() * r1 * 1.5, ridge=ridge,
                 ridge_count=sides // 2 if sides >= 6 else 0, noise_amp=noise_amp, seed=seed, smooth_angle=75)


def leafy(lobes, name, material, target, **kw):
    """Canopy sculpt; in LOD mode a coarse smooth shell filling what the bark leaves of the budget."""
    if LOD:
        bark = sum(tri_count([o]) for o in bpy.data.objects if o.type == 'MESH' and o.data.materials
                   and o.data.materials[0].name == 'Bark')
        return sculpt(lobes, name, material, voxel=.24, target=LOD_BUDGET - bark - 6, cells=1.0, cell_amp=0.0,
                      smooth=5, normal_smooth=8, seed=kw.get('seed', 0))
    return sculpt(lobes, name, material, target=target, **kw)


def clump(prefix, c, size, material, rng, sats=4, big_sub=2, sat_sub=1, flat=.4, squash=.8, amp=.13,
          bumps=.05, spread=.85, sat_scale=(.45, .62), up_bias=.25, sat_flat=None):
    """One cloud mass: a big central lobe with satellite lobes on its upper/outer shell."""
    c = Vector(c)
    out = [lobe(prefix, c, (size, size * rng.uniform(.85, 1.0), size * squash), material,
                seed=rng.randint(0, 999), subdiv=big_sub, amp=amp, flat=flat, bumps=bumps,
                rot=rng.uniform(0, TAU))]
    a0 = rng.uniform(0, TAU)
    for i in range(sats):
        a = a0 + TAU * (i + rng.uniform(-.2, .2)) / sats
        el = rng.uniform(-.15, .55) + up_bias
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el) * squash))
        s = size * rng.uniform(*sat_scale)
        p = c + d * size * spread
        out.append(lobe(prefix, p, (s, s * rng.uniform(.85, 1.0), s * squash * rng.uniform(.9, 1.05)), material,
                        seed=rng.randint(0, 999), subdiv=sat_sub, amp=amp * .9, flat=sat_flat or flat,
                        bumps=bumps, rot=rng.uniform(0, TAU)))
    return out


def bark_tint(objs, height, seed=3, moss=.35, bands=0.0, band_freq=3.0):
    """Bark: dark grooves at the root, moss creeping up the shady (+Y) side, optional lenticel bands."""
    off = Vector((seed * 1.3, seed * .7, 0))
    def f(p, n, face):
        t = smoothstep(-.2, height, p.z)
        k = .72 + .28 * t
        k *= .9 + .1 * noise.noise(p * 2.3 + off)
        g = moss * max(0.0, n.y) * (1 - smoothstep(0, 2.2, p.z)) * (.6 + .4 * noise.noise(p * 1.7 + off))
        col = (k * (1 - g * .55), k * (1 + g * .25), k * (1 - g * .75))
        if bands:
            b = .5 + .5 * math.sin(p.z * band_freq * TAU + noise.noise(p * 1.1 + off) * 2)
            m = 1 - bands * smoothstep(.75, 1.0, b)
            col = (col[0] * m, col[1] * m, col[2] * m)
        return col
    tint(objs, f)


def finish_tree(name, root_name, bark_parts, leaf_parts, extra_keep=(), ao_dist=1.4, ao_strength=.72,
                canopy=None, seed=1, moss=.35, bands=0.0, dark=.5, core=.25, core_r=2.5, hue=.06,
                crease_dark=.3, cell_spread=.14, cell_hue=.05, warm=.12, cool=.12, crease_rgb=(1, 1, 1)):
    bark_parts = [b for b in bark_parts if b is not None]
    if LOD:
        for k in extra_keep:
            bpy.data.objects.remove(k, do_unlink=True)
        extra_keep = ()
        name, root_name, crease_dark, cell_spread = name + '-lod', root_name + ' LOD', 0.0, .0
        ao_dist *= 1.6
    parts = bark_parts + leaf_parts
    bake_ao(parts + list(extra_keep), rays=48, distance=ao_dist, strength=ao_strength, ground=0.0, min_value=.22)
    zs = [(o.matrix_world @ Vector(c)).z for o in leaf_parts for c in o.bound_box]
    lo_z, hi_z = min(zs), max(zs)
    cen = canopy or Vector((0, 0, (lo_z + hi_z) / 2))
    foliage_tint(leaf_parts, lo_z, hi_z, cen, seed=seed, dark=dark, core=core, core_r=core_r,
                 hue=0 if len(leaf_parts) == 1 else hue, warm=warm, cool=cool)
    for o in leaf_parts:
        if 'cells' in o:
            cell_tint(o, crease_dark=crease_dark, spread=cell_spread, hue=cell_hue, crease_rgb=crease_rgb)
    if LOD:  # match the full tree's average value (its leaf-cluster creases darken it ~18 %)
        tone(leaf_parts, .76)
    bark_tint(bark_parts, lo_z, moss=moss, bands=bands)
    return finish(name, parts, root_name, keep=list(extra_keep))


# ================================================================ BROADLEAF A (round shade tree)


def surface_points(ob, dirs, origin, offset=0.0):
    """Ray-cast from outside toward origin along dirs onto ob's outer shell; returns [(point, normal)]."""
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(ob, deps)
    out = []
    o = Vector(origin)
    for d in dirs:
        d = Vector(d).normalized()
        far = o + d * 30
        loc, nrm, _, _ = tree.ray_cast(far, -d, 40)
        if loc is not None:
            out.append((loc + nrm * offset, nrm))
    return out


def fib_dirs(n, zmin=-1.0, zmax=1.0, seed=0, jitter=.15):
    rng = random.Random(seed)
    out = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        z = lerp(zmax, zmin, (i + .5) / n)
        r = math.sqrt(max(0.0, 1 - z * z))
        a = ga * i + rng.uniform(-jitter, jitter)
        out.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
    return out


def build_tree_broadleaf_a():
    reset()
    bark, leaves = M_bark(), M_leaves()
    rng = random.Random(41)
    bark_parts = [make_trunk('Trunk', [(0, 0, -.35), (.05, .03, 1.0), (.14, .02, 2.1), (.1, -.02, 2.9)],
                             .44, .27, bark, roots=4, root_amp=.9, root_h=.1, seed=4)]
    split = Vector((.1, -.02, 2.7))
    clumps = [  # (centre, size)
        ((.2, .3, 6.5), 1.85),
        ((2.2, -.4, 5.2), 1.5),
        ((-2.0, .6, 5.4), 1.55),
        ((-.6, -1.9, 4.8), 1.35),
        ((1.1, 2.0, 5.2), 1.4),
    ]
    lobes = []
    for i, (c, s) in enumerate(clumps):
        c = Vector(c)
        d = (c - split)
        mid = split + Vector((d.x * .45, d.y * .45, d.z * .35))
        bark_parts.append(make_limb('Limb', [split + Vector((0, 0, -.4)), mid, c - d.normalized() * s * .35],
                                    .21 if i else .24, .07, bark, sides=6, seed=i))
        lobes += clump('Leaves', c, s, leaves, rng, sats=6, big_sub=3, sat_sub=3, squash=.8, amp=.1,
                       bumps=.04, spread=.8, sat_scale=(.42, .6))
        tw = c + Vector((rng.uniform(-.6, .6), rng.uniform(-.6, .6), -s * .6))
        bark_parts.append(make_limb('Twig', [mid, lerp(mid, tw, .6) + Vector((0, 0, .1)), tw], .08, .03, bark,
                                    sides=5, seed=10 + i, count=4))
    canopy = leafy(lobes, 'Leaves', leaves, voxel=.1, target=3500 - tri_count(bark_parts) - 40,
                    cells=1.0, cell_amp=.32, crease=.6, seed=3, smooth=6)
    return finish_tree('tree-broadleaf-a', 'Broadleaf A', bark_parts, [canopy], canopy=Vector((0, 0, 5.6)),
                       seed=5, core_r=3.0)


# ================================================================ BROADLEAF B (zelkova vase)


def build_tree_broadleaf_b():
    reset()
    bark = mat('Bark', '#80604a', rough=.86)
    leaves = M_leaves()
    rng = random.Random(77)
    bark_parts = [make_trunk('Trunk', [(0, 0, -.35), (0, .02, .9), (.05, 0, 2.0)], .46, .34, bark,
                             roots=4, root_amp=1.3, root_h=.14, seed=7)]
    split = Vector((.05, 0, 1.8))
    ends = []
    for i in range(6):
        a = TAU * i / 6 + rng.uniform(-.25, .25)
        r = rng.uniform(2.3, 3.0)
        ends.append((Vector((math.cos(a) * r, math.sin(a) * r * .92, rng.uniform(5.7, 6.5))), rng.uniform(1.2, 1.45)))
    ends.append((Vector((.2, .1, 7.3)), 1.55))
    lobes = []
    for i, (e, size) in enumerate(ends):
        d = e - split
        mid = split + Vector((d.x * .3, d.y * .3, d.z * .55))
        bark_parts.append(make_limb('Limb', [split + Vector((0, 0, -.5)), mid, e - Vector((0, 0, size * .3))],
                                    .19, .06, bark, sides=6, seed=i))
        lobes += clump('Leaves', e + Vector((0, 0, .15)), size, leaves, rng, sats=5, big_sub=3, sat_sub=3,
                       squash=.72, amp=.1, bumps=.04, spread=.78, sat_scale=(.4, .58), up_bias=.1)
    canopy = leafy(lobes, 'Leaves', leaves, voxel=.1, target=3500 - tri_count(bark_parts) - 40,
                    cells=.85, cell_amp=.28, crease=.6, seed=8, smooth=6)
    return finish_tree('tree-broadleaf-b', 'Broadleaf B', bark_parts, [canopy], canopy=Vector((0, 0, 6.2)),
                       seed=9, core_r=3.2)


# ================================================================ CEDAR (tall tiered sugi)


def build_tree_cedar():
    reset()
    bark = mat('Bark', '#7e4630', rough=.9)
    needles = mat('Needles', '#2f8a52', rough=.7)
    rng = random.Random(12)
    bark_parts = [make_trunk('Trunk', [(0, 0, -.35), (0, 0, 2.5), (.05, 0, 6), (0, 0, 10.5)], .4, .1, bark,
                             roots=4, root_amp=1.0, root_h=.05, ridge=.14, ridges=6, twist=.4, seed=2)]
    lobes = []
    tiers = 7
    z0, z1 = 2.7, 10.4
    for k in range(tiers):
        t = k / (tiers - 1)
        z = lerp(z0, z1, t ** .92)
        R = lerp(2.35, .75, t)
        h = lerp(1.35, .75, t)
        lobes.append(lobe('Needles', (0, 0, z + h * .3), (R * .5, R * .5, h * .85), needles,
                          seed=rng.randint(0, 999), subdiv=3, amp=.06, flat=.2, bumps=.03))
        n = 6 if k < 4 else 5
        a0 = rng.uniform(0, TAU)
        for i in range(n):
            a = a0 + TAU * i / n + rng.uniform(-.2, .2)
            rr = R * rng.uniform(.5, .62)
            c = Vector((math.cos(a) * rr, math.sin(a) * rr, z - rr * .3))
            lobes.append(lobe('Needles', c, (R * .52, R * .34, h * .4), needles, seed=rng.randint(0, 999),
                              subdiv=3, amp=.08, flat=.5, bumps=.03, rot=a))
    lobes.append(lobe('Needles', (0, 0, 10.9), (.5, .5, .7), needles, seed=3, subdiv=3, amp=.04, flat=.2))
    lobes.append(lobe('Needles', (0, 0, 11.45), (.26, .26, .6), needles, seed=4, subdiv=3, amp=.03, flat=.2))
    canopy = leafy(lobes, 'Needles', needles, voxel=.09, target=3000 - tri_count(bark_parts) - 30,
                    cells=.62, cell_amp=.2, crease=.55, seed=5, smooth=5)
    return finish_tree('tree-cedar', 'Cedar', bark_parts, [canopy], canopy=Vector((0, 0, 6.5)), seed=2,
                       core=.35, core_r=1.6, dark=.42, moss=.25)


# ================================================================ PINE (sculptural black pine)


def build_tree_pine():
    reset()
    bark = mat('Bark', '#65503f', rough=.92)
    needles = mat('Needles', '#2f8a52', rough=.7)
    rng = random.Random(5)
    spine = [(0, 0, -.35), (.12, 0, 1.1), (.65, .08, 2.4), (.55, .2, 3.6), (1.05, .1, 4.8), (1.35, -.1, 5.9)]
    trunk = make_trunk('Trunk', spine, .38, .13, bark, roots=4, root_amp=1.0, root_h=.07, ridge=.09,
                       ridges=6, twist=1.4, seed=6)
    bark_parts = [trunk]
    P = spline(spine, 40)
    # (spine fraction, azimuth, reach, rise, pad size)
    branches = [(.42, 3.4, 2.4, .2, 1.05), (.55, .35, 2.3, .55, 1.0), (.66, 2.2, 1.9, .5, .95),
                (.78, 5.2, 1.8, .7, .9), (.86, 1.1, 1.4, .6, .8), (1.0, 0, .05, -.12, 1.0),
                (.5, 4.5, 1.4, .35, .72), (.72, 3.1, 1.3, .45, .7)]
    lobes = []
    for i, (t, az, L, rise, size) in enumerate(branches):
        start = P[min(len(P) - 1, int(t * (len(P) - 1)))]
        d = Vector((math.cos(az), math.sin(az), 0))
        end = start + d * L + Vector((0, 0, rise))
        if L > .5:
            mid = start + d * L * .45 + Vector((0, 0, rise * .1 - .15))
            bark_parts.append(make_limb('Limb', [start - d * .1, mid, end], .13 if i < 3 else .1, .04, bark,
                                        sides=6, seed=i, count=6))
        pad_c = end + Vector((0, 0, .18))
        lobes.append(lobe('Needles', pad_c, (size * 1.05, size * .85, size * .36), needles,
                          seed=rng.randint(0, 999), subdiv=3, amp=.08, flat=.75, bumps=.03, rot=az))
        for k in range(3):
            a = az + rng.uniform(-1.6, 1.6)
            o = Vector((math.cos(a), math.sin(a), 0)) * size * rng.uniform(.45, .7)
            s = size * rng.uniform(.5, .66)
            lobes.append(lobe('Needles', pad_c + o + Vector((0, 0, rng.uniform(-.02, .08))),
                              (s, s * .85, s * .5), needles, seed=rng.randint(0, 999), subdiv=3, amp=.08,
                              flat=.75, bumps=.03, rot=a))
    canopy = leafy(lobes, 'Needles', needles, voxel=.07, target=3500 - tri_count(bark_parts) - 30,
                    cells=.42, cell_amp=.14, crease=.5, seed=4, smooth=4)
    return finish_tree('tree-pine', 'Pine', bark_parts, [canopy], canopy=Vector((.8, 0, 4.5)), seed=4,
                       dark=.45, core=.15, core_r=1.2, moss=.3)


# ================================================================ MAPLE (layered delicate momiji)


def build_tree_maple():
    reset()
    bark = mat('Bark', '#6e5647', rough=.8)
    leaves = mat('Maple leaves', '#74ba3c', rough=.6)
    rng = random.Random(9)
    bark_parts = [make_trunk('Trunk', [(0, 0, -.3), (0, 0, .45), (.04, 0, .9)], .3, .2, bark, roots=4,
                             root_amp=1.1, root_h=.14, seed=3)]
    stems = [
        [(0, 0, .6), (.45, .15, 1.8), (1.05, .3, 2.9), (1.55, .45, 3.7)],
        [(0, 0, .6), (-.35, .1, 1.7), (-1.0, -.2, 2.8), (-1.5, -.35, 3.4)],
        [(0, 0, .6), (.08, -.25, 2.1), (.05, -.55, 3.4), (-.2, -.45, 4.6)],
    ]
    for i, st in enumerate(stems):
        bark_parts.append(make_limb('Stem', st, .15, .05, bark, sides=6, seed=i, count=8))
    layers = [((1.6, .45, 3.8), 1.25), ((-1.55, -.35, 3.5), 1.15), ((-.2, -.5, 4.75), 1.3),
              ((.6, .9, 4.3), 1.0), ((.9, -1.2, 3.1), .95), ((-.8, 1.0, 2.9), .9), ((.3, .1, 5.4), .85)]
    lobes = []
    for i, (c, size) in enumerate(layers):
        c = Vector(c)
        if i >= 3:
            src = spline(stems[i % 3], 10)[5]
            bark_parts.append(make_limb('Twig', [src, lerp(src, c, .5) + Vector((0, 0, .15)), c - Vector((0, 0, .1))],
                                        .06, .025, bark, sides=5, seed=20 + i, count=5))
        lobes += clump('Maple', c, size, leaves, rng, sats=5, big_sub=3, sat_sub=3, squash=.36, amp=.1,
                       bumps=.04, spread=.85, sat_scale=(.45, .62), up_bias=-.2, flat=.5)
    canopy = leafy(lobes, 'Maple leaves', leaves, voxel=.07, target=3500 - tri_count(bark_parts) - 30,
                    cells=.42, cell_amp=.13, crease=.5, seed=11, smooth=4)
    return finish_tree('tree-maple', 'Maple', bark_parts, [canopy], canopy=Vector((0, 0, 4.0)), seed=12,
                       dark=.5, core=.2, core_r=1.8, moss=.2)


# ================================================================ SAKURA (spreading cherry)


def build_tree_sakura():
    reset()
    bark = mat('Bark', '#5b3a35', rough=.72)
    blossom = mat('Blossom', '#ff8cc2', rough=.5)
    rng = random.Random(21)
    bark_parts = [make_trunk('Trunk', [(0, 0, -.35), (.08, 0, .9), (.2, .05, 1.7)], .46, .36, bark,
                             roots=4, root_amp=1.2, root_h=.14, seed=21, ridge=.03)]
    split = Vector((.2, .05, 1.55))
    limbs = [((3.0, .5, 3.8), 1.5), ((-2.8, 1.0, 4.0), 1.5), ((.6, -2.9, 3.7), 1.4), ((-.8, 2.8, 4.1), 1.45),
             ((2.1, -1.9, 4.3), 1.3), ((-2.0, -1.7, 4.2), 1.3), ((.3, .3, 5.0), 1.75)]
    lobes = []
    for i, (e, size) in enumerate(limbs):
        e = Vector(e)
        d = e - split
        mid = split + Vector((d.x * .45, d.y * .45, d.z * .75 + .25))
        bark_parts.append(make_limb('Limb', [split - Vector((0, 0, .3)), mid, e], .22, .07, bark, sides=6, seed=i))
        lobes += clump('Blossom', e + Vector((0, 0, .2)), size, blossom, rng, sats=6, big_sub=3, sat_sub=3,
                       squash=.72, amp=.1, bumps=.04, spread=.85, sat_scale=(.42, .6), up_bias=-.05)
        if i < 6:
            lobes.append(lobe('Blossom', e + d.normalized() * size * .55 + Vector((0, 0, -.5)),
                              (size * .6, size * .55, size * .45), blossom, seed=rng.randint(0, 999), subdiv=3,
                              amp=.1, flat=.3))
    canopy = leafy(lobes, 'Blossom', blossom, voxel=.1, target=3500 - tri_count(bark_parts) - 30,
                    cells=.72, cell_amp=.26, crease=.55, seed=6, smooth=6)
    return finish_tree('tree-sakura', 'Sakura', bark_parts, [canopy], canopy=Vector((0, 0, 4.2)), seed=6,
                       dark=.66, core=.2, core_r=2.8, moss=.15, bands=.35, cool=.05,
                       crease_rgb=(1.0, .72, .88), crease_dark=.22)


# ================================================================ PEACH (open-vase orchard tree)


def peach_mesh(name, c, r, material, seed=0, subdiv=3):
    """A peach: plump sphere with the suture cleft and a tiny tip."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1)
    rng = random.Random(seed)
    ax = rng.uniform(0, TAU)
    cleft = Vector((math.cos(ax), math.sin(ax), 0))
    for v in bm.verts:
        d = v.co.normalized()
        k = 1 - .1 * math.exp(-(d.dot(cleft) / .16) ** 2) * (1 - abs(d.z)) ** .5
        z = d.z * (1.04 if d.z < 0 else .98)
        if d.z < -.85:
            z -= .06 * (d.z + .85) / -.15
        v.co = Vector((d.x * k, d.y * k, z)) * r
    return from_bmesh(name, bm, material, loc=c, smooth_angle=89)


def blush(objs, seed=0, amount=.75):
    """Peach blush: one side flushes red (multiplies G and B down)."""
    rng = random.Random(seed)
    bpy.context.view_layer.update()
    for o in objs:
        a = rng.uniform(0, TAU)
        side = Vector((math.cos(a), math.sin(a), .5)).normalized()
        c = o.matrix_world.translation.copy()
        def f(p, n, face, side=side, c=c):
            w = smoothstep(-.3, .8, (p - c).normalized().dot(side)) * amount
            return (1.0, 1 - w * .75, 1 - w * .6)
        tint(o, f)


def build_tree_peach():
    reset()
    bark = mat('Bark', '#6f4a3a', rough=.85)
    leaves = M_leaves()
    peach = mat('Peach', '#ff9a52', rough=.42)
    rng = random.Random(33)
    bark_parts = [make_trunk('Trunk', [(0, 0, -.3), (0, 0, .45), (.03, 0, .85)], .22, .17, bark,
                             roots=5, root_amp=1.0, root_h=.16, seed=5)]
    base = Vector((.03, 0, .7))
    ends = []
    for i in range(4):
        a = TAU * i / 4 + .4 + rng.uniform(-.2, .2)
        e = Vector((math.cos(a) * 1.25, math.sin(a) * 1.2, 2.25 + rng.uniform(-.1, .15)))
        ends.append(e)
        mid = base + (e - base) * .5 + Vector((0, 0, .1))
        bark_parts.append(make_limb('Scaffold', [base - Vector((0, 0, .2)), mid, e], .12, .045, bark, sides=6,
                                    seed=i, count=6))
    lobes = []
    for i, e in enumerate(ends):
        lobes += clump('Leaves', e + Vector((0, 0, .35)), .78, leaves, rng, sats=3, big_sub=3, sat_sub=3,
                       squash=.78, amp=.1, bumps=.04, spread=.8, sat_scale=(.45, .62))
        a = math.atan2(e.y, e.x) + TAU / 8
        lobes.append(lobe('Leaves', (math.cos(a) * 1.35, math.sin(a) * 1.35, 2.9), (.5, .46, .42), leaves,
                          seed=rng.randint(0, 999), subdiv=3, amp=.1, flat=.4))
    canopy = leafy(lobes, 'Leaves', leaves, voxel=.06, target=1380, cells=.5, cell_amp=.16, crease=.5,
                    seed=13, smooth=5)
    dirs = fib_dirs(60, -.55, .35, seed=4)
    rng2 = random.Random(8)
    rng2.shuffle(dirs)
    spots = surface_points(canopy, dirs, (0, 0, 2.6), offset=-.02)
    fruit, used = [], []
    for p, n in spots:
        if len(fruit) >= 12:
            break
        if any((p - q).length < .5 for q in used):
            continue
        used.append(p)
        fruit.append(peach_mesh('Peach', p + n * .08 - Vector((0, 0, .08)), rng2.uniform(.14, .16), peach,
                                seed=len(fruit), subdiv=2))
    blush(fruit, seed=3)
    fruit_node = pivot_mesh('Fruit', fruit, (0, 0, 2.4))
    return finish_tree('tree-peach', 'Peach tree', bark_parts, [canopy], extra_keep=[fruit_node],
                       canopy=Vector((0, 0, 2.6)), seed=14, dark=.55, core=.2, core_r=1.4, moss=.2, ao_dist=.9)


# ================================================================ CHESTNUT (broad kuri with burrs)


def burr_mesh(name, c, r, material, seed=0):
    """Spiky chestnut burr: every icosahedron face poked into a spine."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    rng = random.Random(seed)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                     matrix=Euler((rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 3))).to_matrix())
    ret = bmesh.ops.poke(bm, faces=bm.faces[:])
    for v in ret['verts']:
        v.co = v.co.normalized() * r * rng.uniform(1.75, 2.05)
    return from_bmesh(name, bm, material, loc=c, smooth_angle=60)


def build_tree_chestnut():
    reset()
    bark = mat('Bark', '#6c4b36', rough=.9)
    leaves = M_leaves()
    burr_m = mat('Burr', '#a8c43a', rough=.6)
    rng = random.Random(55)
    bark_parts = [make_trunk('Trunk', [(0, 0, -.35), (.06, 0, 1.0), (.0, .05, 2.2)], .5, .32, bark,
                             roots=4, root_amp=1.3, root_h=.12, ridge=.12, ridges=6, twist=.8, seed=9)]
    split = Vector((0, .05, 2.0))
    clumps = [((2.4, .3, 4.4), 1.5), ((-2.3, -.4, 4.6), 1.55), ((.3, 2.3, 4.5), 1.4), ((.2, -2.2, 4.2), 1.35),
              ((-.3, .1, 5.7), 1.8)]
    lobes = []
    for i, (c, s) in enumerate(clumps):
        c = Vector(c)
        d = c - split
        mid = split + Vector((d.x * .5, d.y * .5, d.z * .3))
        bark_parts.append(make_limb('Limb', [split - Vector((0, 0, .3)), mid, c - d.normalized() * s * .3], .22,
                                    .07, bark, sides=6, seed=i))
        lobes += clump('Leaves', c, s, leaves, rng, sats=6, big_sub=3, sat_sub=3, squash=.72, amp=.12,
                       bumps=.05, spread=.82, sat_scale=(.4, .58))
    canopy = leafy(lobes, 'Leaves', leaves, voxel=.1, target=2000, cells=.8, cell_amp=.3, crease=.6, seed=17,
                    smooth=6)
    dirs = fib_dirs(80, -.45, .7, seed=9)
    random.Random(2).shuffle(dirs)
    spots = surface_points(canopy, dirs, (0, 0, 4.8), offset=0)
    burrs, used = [], []
    for p, n in spots:
        if len(burrs) >= 12:
            break
        if any((p - q).length < 1.0 for q in used):
            continue
        used.append(p)
        burrs.append(burr_mesh('Burr', p + n * .12, .13, burr_m, seed=len(burrs)))
    burr_node = pivot_mesh('Burrs', burrs, (0, 0, 4.8))
    return finish_tree('tree-chestnut', 'Chestnut', bark_parts, [canopy], extra_keep=[burr_node],
                       canopy=Vector((0, 0, 4.8)), seed=18, core_r=3.0, moss=.4)


# ================================================================ ROCKS


def M_rock(color='#a79f94'):
    return mat('Rock', color, rough=.85)


def M_moss():
    return mat('Moss', '#548a2e', rough=.9)


def rock_tint(parts, seed=3, spread=.2, foot=.34, top_z=2.0):
    """Hand-painted boulder: bleached crown, dark damp foot, per-facet tone and a warm/cool split
    (warm ochre facets against cool blue-grey ones)."""
    ft = facet_tone(random.Random(seed), spread)
    rng = random.Random(seed + 1)
    hue = {}
    def f(p, n, face):
        up = max(0.0, n.z)
        k = (.72 + .28 * up ** .8) * (1 - foot + foot * smoothstep(-.1, top_z * .45, p.z)) * ft(face)
        key = (face.id_data.name,) + tuple(round(c * 4) for c in face.normal)
        if key not in hue:
            hue[key] = rng.uniform(-1, 1)
        h = hue[key] * .1
        return (k * (1 + h), k * (1 + h * .2), k * (1 - h * 1.5))
    tint(parts, f)


def moss_tint(parts, seed=5):
    """Moss: sunlit yellow-green tops, deeper green edges, blotchy variation."""
    off = Vector((seed, seed * .5, 0))
    def f(p, n, face):
        k = .7 + .3 * max(0.0, n.z) ** 1.5
        v = noise.noise(p * 3.2 + off)
        return (k * (1 + .12 * v), k * (1 + .03 * v), k * (1 - .15 * v))
    tint(parts, f)


def finish_rock(name, root_name, rocks, mosses, top_z):
    parts = rocks + [m for m in mosses if m is not None]
    bake_ao(parts, rays=48, distance=.9, strength=.62, ground=0.0, min_value=.3)
    rock_tint(rocks, top_z=top_z)
    moss_tint([m for m in mosses if m is not None])
    return finish(name, parts, root_name)


def build_rock_a():
    reset()
    stone, moss = M_rock(), M_moss()
    main = boulder('Rock', stone, 21, (1.3, 1.05, 1.1), (-1.15, -.85, -.35), (1.15, .95, 1.6), chamfer=.1,
                   sides=8, shoulders=6, top_tilt=.18, lean=(.16, -.06), spin=.25, side_tilt=(.0, .22),
                   shoulder_tilt=(.45, .8), top=.9)
    buddy = boulder('Rock', stone, 8, (.7, .5, .42), (.55, -1.25, -.25), (1.6, -.35, .55), chamfer=.06, sides=6,
                    shoulders=4, top_tilt=.35, spin=.5)
    pebble = boulder('Rock', stone, 4, (.4, .3, .25), (-1.5, -.9, -.15), (-.95, -.45, .22), chamfer=.04,
                     sides=5, shoulders=3, top_tilt=.3)
    m1 = moss_cushions('Moss', main, moss, seed=2, count=4, size=.5, target=210)
    m2 = moss_cushions('Moss', buddy, moss, seed=4, count=1, size=.3, target=60)
    return finish_rock('rock-a', 'Rock A', [main, buddy, pebble], [m1, m2], 1.6)


def build_rock_b():
    reset()
    stone, moss = M_rock('#9d968d'), M_moss()
    crag = boulder('Rock', stone, 33, (.8, .66, 1.5), (-.72, -.58, -.4), (.72, .6, 2.7), chamfer=.1, sides=8,
                   shoulders=7, top_tilt=.28, lean=(.1, .04), spin=.6, side_tilt=(-.04, .14),
                   shoulder_tilt=(.35, .75), top=.86)
    side = boulder('Rock', stone, 12, (.6, .5, .6), (.35, -.8, -.3), (1.25, .15, 1.05), chamfer=.07, sides=6,
                   shoulders=4, top_tilt=.25, spin=1.2)
    chip = boulder('Rock', stone, 5, (.35, .3, .25), (-.95, -.75, -.15), (-.4, -.2, .3), chamfer=.035, sides=5,
                   shoulders=3, top_tilt=.3)
    m1 = moss_cushions('Moss', crag, moss, seed=7, count=3, size=.38, target=170, up=.45)
    m2 = moss_cushions('Moss', side, moss, seed=9, count=2, size=.3, target=80)
    return finish_rock('rock-b', 'Rock B', [crag, side, chip], [m1, m2], 2.7)


def build_rock_c():
    reset()
    stone, moss = M_rock('#a69c8f'), M_moss()
    a = boulder('Rock', stone, 41, (.62, .48, .3), (-.75, -.45, -.2), (.35, .5, .5), chamfer=.08, sides=8,
                shoulders=7, top_tilt=.12, spin=.3, shoulder_tilt=(.25, .6), side_tilt=(.05, .4))
    b = boulder('Rock', stone, 42, (.42, .36, .24), (.2, -.65, -.15), (.95, .05, .36), chamfer=.06, sides=7,
                shoulders=6, top_tilt=.2, spin=.9, shoulder_tilt=(.25, .6), side_tilt=(.05, .4))
    c = boulder('Rock', stone, 43, (.3, .26, .16), (-.2, .35, -.1), (.35, .85, .22), chamfer=.04, sides=6,
                shoulders=5, top_tilt=.2, spin=.1, side_tilt=(.05, .4))
    m1 = moss_cushions('Moss', a, moss, seed=11, count=3, size=.3, target=140)
    m2 = moss_cushions('Moss', c, moss, seed=13, count=1, size=.18, target=50)
    return finish_rock('rock-c', 'Rock C', [a, b, c], [m1, m2], .5)


# ================================================================ BUSHES & HYDRANGEA


def finish_bush(name, root_name, leaf_parts, extra=(), keep=(), dark=.52, ao_dist=.5):
    parts = leaf_parts + list(extra)
    sink(parts, .04)
    bake_ao(parts, rays=48, distance=ao_dist, strength=.72, ground=0.0, min_value=.22)
    zs = [(o.matrix_world @ Vector(c)).z for o in leaf_parts for c in o.bound_box]
    foliage_tint(leaf_parts, min(zs), max(zs), Vector((0, 0, (min(zs) + max(zs)) / 2)), dark=dark, hue=0,
                 core=.15, core_r=.8)
    for o in leaf_parts:
        if 'cells' in o:
            cell_tint(o, crease_dark=.3, spread=.14, hue=.05)
    return finish(name, parts, root_name, keep=list(keep))


def build_bush_a():
    reset()
    leaves = M_leaves()
    rng = random.Random(3)
    lobes = [lobe('Leaves', (0, 0, .5), (.72, .66, .6), leaves, seed=1, subdiv=3, amp=.08, flat=.3)]
    for i in range(7):
        a = TAU * i / 7 + rng.uniform(-.2, .2)
        r = rng.uniform(.5, .62)
        z = rng.uniform(.3, .75)
        s = rng.uniform(.34, .44)
        lobes.append(lobe('Leaves', (math.cos(a) * r, math.sin(a) * r, z), (s, s * .95, s * .9), leaves,
                          seed=rng.randint(0, 999), subdiv=3, amp=.08, flat=.35))
    lobes.append(lobe('Leaves', (.1, -.05, .95), (.36, .34, .28), leaves, seed=9, subdiv=3, amp=.08, flat=.3))
    canopy = sculpt(lobes, 'Leaves', leaves, voxel=.04, target=880, cells=.3, cell_amp=.09, crease=.5, seed=2,
                    smooth=4)
    return finish_bush('bush-a', 'Bush A', [canopy])


def build_bush_b():
    """Karikomi: clipped cloud mounds, smooth and tight, the classic Japanese garden bush."""
    reset()
    leaves = M_leaves()
    lobes = [lobe('Leaves', (0, .05, .42), (.92, .8, .72), leaves, seed=1, subdiv=3, amp=.03, flat=.55, bumps=.02),
             lobe('Leaves', (.85, .35, .3), (.6, .55, .5), leaves, seed=2, subdiv=3, amp=.03, flat=.55, bumps=.02),
             lobe('Leaves', (-.8, -.35, .26), (.52, .46, .44), leaves, seed=3, subdiv=3, amp=.03, flat=.55,
                  bumps=.02),
             lobe('Leaves', (.25, -.55, .2), (.42, .36, .34), leaves, seed=4, subdiv=3, amp=.03, flat=.55,
                  bumps=.02)]
    canopy = sculpt(lobes, 'Leaves', leaves, voxel=.04, target=880, cells=.2, cell_amp=.018, crease=.45,
                    seed=5, smooth=10)
    tone([canopy], (.86, .92, .86))
    return finish_bush('bush-b', 'Bush B', [canopy], dark=.6)


def build_hydrangea():
    """Mophead hydrangea: a leafy mound with big serrated leaves at the rim and blue-to-violet
    flower heads built as mosaics of little florets (flat facets, each tinted on its own)."""
    reset()
    leaves = M_leaves()
    flower = mat('Hydrangea', '#8a8ff5', rough=.5)
    rng = random.Random(7)
    lobes = [lobe('Leaves', (0, 0, .42), (.6, .54, .48), leaves, seed=1, subdiv=3, amp=.1, flat=.35)]
    for i in range(5):
        a = TAU * i / 5 + rng.uniform(-.2, .2)
        lobes.append(lobe('Leaves', (math.cos(a) * .42, math.sin(a) * .42, rng.uniform(.25, .5)),
                          (.34, .32, .3), leaves, seed=rng.randint(0, 999), subdiv=3, amp=.1, flat=.35))
    mound = sculpt(lobes, 'Leaves', leaves, voxel=.04, target=360, cells=.22, cell_amp=.06, crease=.45, seed=3,
                   smooth=4)
    blades = []
    for i in range(9):
        a = TAU * i / 9 + rng.uniform(-.15, .15)
        root = Vector((math.cos(a) * .5, math.sin(a) * .46, rng.uniform(.1, .28)))
        d = Vector((math.cos(a), math.sin(a), rng.uniform(-.05, .25)))
        blades.append(blade('Leaves', root, d, rng.uniform(.36, .42), rng.uniform(.32, .36), leaves, bend=.3,
                            segs=3, fold=.2))
    dirs = fib_dirs(40, -.1, .95, seed=2)
    rng.shuffle(dirs)
    spots = surface_points(mound, dirs, (0, 0, .35))
    heads, used = [], []
    for p, n in spots:
        if len(heads) >= 5:
            break
        if any((p - q).length < .38 for q in used):
            continue
        used.append(p)
        r = rng.uniform(.19, .23)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rng.uniform(0, 3), 3, 'Z'))
        for v in bm.verts:
            d = v.co.normalized()
            k = 1 + .05 * rng.uniform(-1, 1)
            z = d.z * (.88 if d.z > 0 else .55)
            v.co = Vector((d.x * k, d.y * k, z * k)) * r
        heads.append(from_bmesh('Hydrangea', bm, flower, loc=p + n * r * .4, smooth_angle=89))
    for b_ in blades:  # leaves face the sky (single-sided material)
        me = b_.data
        for poly in me.polygons:
            if poly.normal.z < 0:
                poly.flip()
        me.update()
    leaf_parts = [mound] + blades
    sink(leaf_parts + heads, .04, ref=[mound])
    bake_ao(leaf_parts + heads, rays=48, distance=.4, strength=.7, ground=0.0, min_value=.25)
    zs = [(mound.matrix_world @ Vector(c)).z for c in mound.bound_box]
    foliage_tint(leaf_parts, min(zs), max(zs), Vector((0, 0, .4)), dark=.5, hue=0, core=.1, core_r=.6)
    cell_tint(mound, crease_dark=.3, spread=.12, hue=.04)
    tone(leaf_parts, (.78, .9, .8))
    for i, h in enumerate(heads):
        c = h.matrix_world.translation.copy()
        mix = i / max(1, len(heads) - 1)  # blue -> violet across the heads
        col = (lerp(.72, 1.0, mix), lerp(1.0, .78, mix), 1.0)
        ftone = {}
        def f(p, n, face, c=c, col=col, ftone=ftone):
            if face.index not in ftone:  # each floret facet its own tone
                ftone[face.index] = rng.choice((.74, .86, 1.0))
            k = (.7 + .3 * max(0.0, (p - c).normalized().z)) * ftone[face.index]
            return (k * col[0], k * col[1], k * col[2])
        tint(h, f)
    return finish('hydrangea', leaf_parts + heads, 'Hydrangea')


# ================================================================ FLOWERS, REEDS, GRASS, LILIES


def stem(name, pts, r, material, sides=3, taper=.6):
    return tube(name, spline(pts, 3) if len(pts) > 3 else pts, r, material, verts=sides, caps=False,
                radius_fn=lambda t: 1 - (1 - taper) * t)


def flower_finish(name, root_name, parts, dist=.25, strength=.5):
    bake_ao(parts, rays=32, distance=dist, strength=strength, ground=0.0, min_value=.35)
    return finish(name, parts, root_name)


def build_flowers_a():
    """Cosmos patch: pink, magenta and orange blooms on wiry stems over ferny leaves."""
    reset()
    pink = mat('Cosmos pink', '#f2609f', rough=.5, double=True)
    magenta = mat('Cosmos magenta', '#d6307a', rough=.5, double=True)
    orange = mat('Cosmos orange', '#f7892a', rough=.5, double=True)
    centre_m = mat('Flower centre', '#ffc629', rough=.6)
    stem_m = mat('Stem', '#4c9a33', rough=.6, double=True)
    rng = random.Random(4)
    parts = []
    petal_mats = [pink, magenta, pink, orange, magenta, pink, orange, pink, magenta]
    for i, pm in enumerate(petal_mats):
        a = TAU * i / len(petal_mats) + rng.uniform(-.3, .3)
        r = rng.uniform(.05, .38) if i else 0.0
        base = Vector((math.cos(a) * r * .6, math.sin(a) * r * .6, -.02))
        h = rng.uniform(.5, .82)
        top = Vector((math.cos(a) * r, math.sin(a) * r, h))
        mid = lerp(base, top, .5) + Vector((rng.uniform(-.04, .04), rng.uniform(-.04, .04), 0))
        parts.append(stem('Stem', [base, mid, top], .009, stem_m))
        facing = (Vector((math.cos(a) * .6, math.sin(a) * .6 - .35, 1.0))).normalized()
        R = rng.uniform(.1, .125)
        parts.append(petal_disc('Petals', top + facing * .005, facing, R, pm, petals=8, inner=.38, cup=.22,
                                spin=rng.uniform(0, 1)))
        parts.append(dome('Centre', top + facing * .012, facing, R * .24, R * .12, centre_m))
    for i in range(3):  # buds
        a = rng.uniform(0, TAU)
        base = Vector((math.cos(a) * .12, math.sin(a) * .12, 0))
        top = base + Vector((math.cos(a) * .12, math.sin(a) * .12, rng.uniform(.4, .55)))
        parts.append(stem('Stem', [base, lerp(base, top, .5), top], .007, stem_m))
        parts.append(sphere('Bud', (.022, .022, .03), top, magenta if i % 2 else pink, seg=5, rings=3))
    for i in range(8):  # ferny foliage
        a = TAU * i / 8 + rng.uniform(-.2, .2)
        d = Vector((math.cos(a), math.sin(a), rng.uniform(.9, 1.6)))
        parts.append(blade('Leaf', (math.cos(a) * .04, math.sin(a) * .04, 0), d, rng.uniform(.24, .34), .06,
                           stem_m, bend=.35, segs=2, fold=.2))
    print('flowers-a', tri_count(parts))
    return flower_finish('flowers-a', 'Flowers A', parts)


def build_flowers_b():
    """Spring verge: white marguerite daisies with golden nanohana (rapeseed) spikes."""
    reset()
    white = mat('Daisy petal', '#f6f2e6', rough=.5, double=True)
    yellow = mat('Nanohana', '#ffd21c', rough=.5, double=True)
    centre_m = mat('Flower centre', '#ffb51c', rough=.6)
    stem_m = mat('Stem', '#4f9c35', rough=.6, double=True)
    rng = random.Random(9)
    parts = []
    for i in range(4):  # daisies
        a = TAU * i / 4 + rng.uniform(-.3, .3) + .4
        r = rng.uniform(.15, .3)
        base = Vector((math.cos(a) * r * .5, math.sin(a) * r * .5, -.02))
        top = Vector((math.cos(a) * r, math.sin(a) * r, rng.uniform(.34, .48)))
        parts.append(stem('Stem', [base, lerp(base, top, .5) + Vector((.02, 0, 0)), top], .009, stem_m))
        facing = Vector((math.cos(a) * .5, math.sin(a) * .5 - .3, 1.0)).normalized()
        R = rng.uniform(.075, .09)
        parts.append(petal_disc('Petals', top, facing, R, white, petals=12, inner=.45, cup=.12,
                                spin=rng.uniform(0, 1)))
        parts.append(dome('Centre', top + facing * .01, facing, R * .32, R * .18, centre_m))
    for i in range(4):  # nanohana: a stalk topped with a clustered raceme of florets
        a = TAU * i / 4 + rng.uniform(-.3, .3)
        r = rng.uniform(.02, .14)
        base = Vector((math.cos(a) * r, math.sin(a) * r, -.02))
        h = rng.uniform(.55, .72)
        top = base + Vector((math.cos(a) * .06, math.sin(a) * .06, h))
        parts.append(stem('Stem', [base, lerp(base, top, .5), top], .01, stem_m))
        for k in range(5):  # a domed raceme of little four-petal flowers
            if k == 0:
                off, nrm = Vector((0, 0, .03)), Vector((0, 0, 1))
            else:
                aa = TAU * k / 4 + i
                nrm = Vector((math.cos(aa), math.sin(aa), .9)).normalized()
                off = nrm * .04
            parts.append(petal_disc('Floret', top + off, nrm, .045, yellow, petals=4, inner=.35, cup=.25,
                                    spin=rng.uniform(0, 1)))
        parts.append(sphere('Buds', (.022, .022, .03), top + Vector((0, 0, .07)), yellow, seg=5, rings=3))
    for i in range(5):
        a = TAU * i / 5 + rng.uniform(-.2, .2)
        d = Vector((math.cos(a), math.sin(a), rng.uniform(.5, 1.0)))
        parts.append(blade('Leaf', (0, 0, 0), d, rng.uniform(.2, .28), .08, stem_m, bend=.3, segs=2, fold=.2))
    print('flowers-b', tri_count(parts))
    return flower_finish('flowers-b', 'Flowers B', parts)


def build_reeds():
    """Riverside reeds: arching blades with a few cattails."""
    reset()
    reed = mat('Reed', '#79a843', rough=.6, double=True)
    tail = mat('Cattail', '#6b3d22', rough=.75)
    rng = random.Random(12)
    parts = []
    for i in range(13):
        a = TAU * i / 13 + rng.uniform(-.25, .25)
        root = Vector((math.cos(a) * rng.uniform(.02, .2), math.sin(a) * rng.uniform(.02, .2), -.05))
        d = Vector((math.cos(a) * rng.uniform(.12, .35), math.sin(a) * rng.uniform(.12, .35), 1.0))
        parts.append(blade('Reed', root, d, rng.uniform(1.0, 1.55), rng.uniform(.045, .06), reed,
                           bend=rng.uniform(.18, .35), segs=4, twist=rng.uniform(-.8, .8), fold=.3, tip=.02))
    for i in range(5):
        a = TAU * i / 5 + rng.uniform(-.3, .3)
        base = Vector((math.cos(a) * .1, math.sin(a) * .1, -.05))
        top = base + Vector((math.cos(a) * rng.uniform(.05, .15), math.sin(a) * .1, rng.uniform(1.25, 1.6)))
        parts.append(stem('Cattail stalk', [base, lerp(base, top, .5), top], .012, reed, taper=.7))
        L = rng.uniform(.18, .24)
        d = (top - lerp(base, top, .5)).normalized()
        c = top - d * .02
        parts.append(lathe('Cattail', [(0, -L * .55), (.026, -L * .5), (.03, 0), (.028, L * .45), (0, L * .5)],
                           tail, seg=6, loc=c, rot=d.to_track_quat('Z', 'Y').to_euler()))
        parts.append(rod('Spike', c + d * L * .45, c + d * (L * .45 + .09), .006, reed, verts=3))
    print('reeds', tri_count(parts))
    bake_ao(parts, rays=32, distance=.4, strength=.55, ground=0.0, min_value=.35)
    tint([p for p in parts if p.data.materials[0] == reed],
         lambda p, n, f: (1 - .25 * (1 - smoothstep(0, 1.2, p.z)),) * 2 + (1 - .35 * smoothstep(.6, 1.5, p.z),))
    return finish('reeds', parts, 'Reeds')


def build_grass_tuft():
    reset()
    grass = mat('Grass', '#6fb23c', rough=.6, double=True)
    rng = random.Random(2)
    parts = []
    for i in range(7):
        a = TAU * i / 7 + rng.uniform(-.3, .3)
        root = Vector((math.cos(a) * .03, math.sin(a) * .03, -.01))
        d = Vector((math.cos(a) * rng.uniform(.25, .6), math.sin(a) * rng.uniform(.25, .6), 1.0))
        parts.append(blade('Blade', root, d, rng.uniform(.24, .36), rng.uniform(.035, .05), grass,
                           bend=rng.uniform(.25, .45), segs=2, fold=.25, tip=.02))
    bake_ao(parts, rays=24, distance=.15, strength=.5, ground=0.0, min_value=.4)
    tint(parts, lambda p, n, f: (.7 + .3 * smoothstep(0, .3, p.z),) * 2 + (.75 + .15 * smoothstep(0, .3, p.z),))
    return finish('grass-tuft', parts, 'Grass tuft')


def lily_pad(name, c, R, material, rng, notch=.5):
    """Round pad with its notch, the rim curling up a little."""
    bm = bmesh.new()
    ctr = bm.verts.new((0, 0, .006))
    n = 15
    a0 = notch / 2
    inner, outer = [], []
    for i in range(n + 1):
        a = a0 + (TAU - notch) * i / n
        wob = 1 + .04 * math.sin(a * 5 + rng.uniform(0, 1))
        inner.append(bm.verts.new((math.cos(a) * R * .82 * wob, math.sin(a) * R * .82 * wob, .01)))
        outer.append(bm.verts.new((math.cos(a) * R * wob, math.sin(a) * R * wob, .03)))
    for i in range(n):
        bm.faces.new((ctr, inner[i], inner[i + 1]))
        bm.faces.new((inner[i], outer[i], outer[i + 1], inner[i + 1]))
    bm.faces.new((ctr, inner[-1], inner[0]))  # close the notch's V at the centre
    orient(bm, c, (rng.uniform(-.03, .03), rng.uniform(-.03, .03), 1), rng.uniform(0, TAU))
    return from_bmesh(name, bm, material, smooth_angle=60)


def build_lilypads():
    reset()
    pad_m = mat('Lily pad', '#4d9a37', rough=.35)
    petal = mat('Lily flower', '#ff86b4', rough=.45, double=True)
    centre_m = mat('Flower centre', '#ffc629', rough=.6)
    rng = random.Random(6)
    parts = []
    pads = [((0, 0), .36), ((.62, .25), .28), ((-.55, .38), .31), ((.2, -.62), .26), ((-.42, -.5), .22),
            ((.78, -.4), .19)]
    for (x, y), R in pads:
        parts.append(lily_pad('Pad', (x, y, 0), R, pad_m, rng, notch=rng.uniform(.4, .6)))
    # the water lily on the big pad: two petal rings and a golden heart
    c = Vector((.05, .02, .03))
    parts.append(petal_disc('Petals', c, (0, 0, 1), .2, petal, petals=8, inner=.35, cup=.35, spin=.2))
    parts.append(petal_disc('Petals', c + Vector((0, 0, .03)), (0, 0, 1), .14, petal, petals=7, inner=.3, cup=.9,
                            spin=.6))
    parts.append(dome('Centre', c + Vector((0, 0, .05)), (0, 0, 1), .035, .03, centre_m))
    parts.append(lathe('Bud', [(0, 0), (.035, .02), (.04, .07), (0, .14)], petal, seg=6, loc=(.62, .25, .02)))
    print('lilypads', tri_count(parts))
    bake_ao(parts, rays=32, distance=.25, strength=.5, ground=None, min_value=.4)
    tint([p for p in parts if p.data.materials[0] == pad_m],
         lambda p, n, f: (.85 + .15 * noise.noise(p * 6), 1.0, .85 + .15 * noise.noise(p * 6)))
    return finish('lilypads', parts, 'Lilypads')


# ================================================================ FOREST FLOOR


def mushroom(prefix, base, h, r, cap_m, stem_m, rng, tilt=(0, 0), seg=9):
    """Plump cap on a stout stem; the cap is a lathe with a rolled rim and a gill underside."""
    parts = []
    top = Vector(base) + Vector((tilt[0] * h, tilt[1] * h, h))
    parts.append(lathe(prefix + ' stem', [(r * .3, 0), (r * .36, h * .05), (r * .27, h * .5), (r * .23, h * .95),
                                           (0, h * .95)], stem_m, seg=6, loc=base,
                       rot=Vector((tilt[0], tilt[1], 1)).to_track_quat('Z', 'Y').to_euler()))
    ch = r * .72
    prof = [(r * .24, -ch * .15), (r * .92, -ch * .05), (r * 1.0, ch * .12), (r * .9, ch * .55),
            (r * .55, ch * .92), (0, ch)]
    parts.append(lathe(prefix + ' cap', prof, cap_m, seg=seg, loc=top - Vector((0, 0, ch * .2)),
                       rot=Vector((tilt[0] * 1.5, tilt[1] * 1.5, 1)).to_track_quat('Z', 'Y').to_euler(),
                       smooth_angle=70))
    return parts


def build_mushrooms():
    reset()
    cap_m = mat('Mushroom cap', '#b9542a', rough=.45)
    stem_m = mat('Mushroom stem', '#f2e3c4', rough=.7)
    leaf_m = mat('Leaf litter', '#c9782f', rough=.7, double=True)
    rng = random.Random(3)
    parts = []
    spec = [((0, 0, 0), .3, .17, (.05, .02)), ((.17, .1, 0), .2, .11, (.25, .1)), ((-.14, .06, 0), .16, .09,
            (-.3, .05)), ((.05, -.16, 0), .11, .065, (.1, -.3))]
    for i, (b, h, r, t) in enumerate(spec):
        parts += mushroom('Mushroom', b, h, r, cap_m, stem_m, rng, tilt=t, seg=10 if i == 0 else 8)
    for i in range(3):  # a few fallen leaves at the foot
        a = rng.uniform(0, TAU)
        root = Vector((math.cos(a) * .22, math.sin(a) * .22, .01))
        parts.append(blade('Leaf', root, (math.cos(a + 1), math.sin(a + 1), .05), .12, .08, leaf_m, bend=-.1,
                           segs=2, fold=.1))
    print('mushrooms', tri_count(parts))
    bake_ao(parts, rays=48, distance=.2, strength=.65, ground=0.0, min_value=.3)
    caps = [p for p in parts if p.data.materials[0] == cap_m]
    off = Vector((3.1, 1.7, .4))
    def cap_tone(p, n, f):
        k = .78 + .22 * smoothstep(-.2, .8, n.z)  # darker domed crown edge, light cream flecks on top
        fleck = smoothstep(.55, .75, noise.noise(p * 38 + off)) * max(0.0, n.z) * .5
        return (k + fleck * .5, k + fleck * .8, k + fleck * 1.2)
    tint(caps, cap_tone)
    return finish('mushrooms', parts, 'Mushrooms')


def end_grain(name, centre, axis, r, material, rings=3, sides=10, seed=0):
    """Sawn end: concentric vertex rings so COLOR_0 can paint growth rings."""
    bm = bmesh.new()
    c = bm.verts.new((0, 0, 0))
    loops = []
    for k in range(1, rings + 1):
        rr = r * k / rings
        loops.append([bm.verts.new((math.cos(TAU * i / sides) * rr, math.sin(TAU * i / sides) * rr, 0))
                      for i in range(sides)])
    for i in range(sides):
        bm.faces.new((c, loops[0][i], loops[0][(i + 1) % sides]))
    for a, b in zip(loops, loops[1:]):
        for i in range(sides):
            bm.faces.new((a[i], b[i], b[(i + 1) % sides], a[(i + 1) % sides]))
    orient(bm, centre, axis)
    ob = from_bmesh(name, bm, material, smooth_angle=30)
    ob['end'] = [float(x) for x in centre] + [float(x) for x in Vector(axis).normalized()] + [float(r)]
    return ob


def ring_tint(obs, count=4.0, dark=.25):
    """Growth rings on sawn ends: alternating light/dark by distance from the pith, darker bark rim."""
    for o in obs:
        cx, cy, cz, ax, ay, az, r = o['end']
        c = Vector((cx, cy, cz))
        def f(p, n, face, c=c, r=r):
            d = (p - c).length / r
            band = .5 + .5 * math.cos(d * count * TAU)
            k = 1 - dark * band * .6 - .25 * smoothstep(.8, 1.0, d)
            return (k, k * .97, k * .92)
        tint(o, f)


def build_log():
    """Fallen mossy log: ridged bark, sawn ends with growth rings, a snapped branch, moss and a sprout."""
    reset()
    bark = mat('Bark', '#6f4b33', rough=.9)
    wood = mat('Wood end', '#e0b27a', rough=.7)
    moss = mat('Moss', '#548a2e', rough=.9)
    fungus = mat('Bracket fungus', '#e9a64a', rough=.55)
    leaf = mat('Leaves', '#5aa632', rough=.6, double=True)
    rng = random.Random(5)
    L, R = 2.4, .34
    pts = [Vector((-L / 2 + L * i / 6, .04 * math.sin(i * 1.3), R * .92 + .03 * math.sin(i * .9))) for i in range(7)]
    body = sweep('Log', pts, lambda s: R * (1 - .06 * s), bark, sides=11, caps=False, ridge=.08, ridge_count=5,
                 noise_amp=.05, seed=4)
    parts = [body]
    parts.append(end_grain('End', pts[0] - Vector((.005, 0, 0)), (-1, 0, 0), R * .96, wood, seed=1))
    parts.append(end_grain('End', pts[-1] + Vector((.005, 0, 0)), (1, 0, 0), R * .9, wood, seed=2))
    b0 = pts[3] + Vector((0, .15, .2))
    parts.append(sweep('Branch', [b0, b0 + Vector((.1, .3, .25)), b0 + Vector((.15, .45, .45))],
                       lambda s: .09 * (1 - .4 * s), bark, sides=6, caps=False,
                       pole_end=b0 + Vector((.17, .5, .52))))
    for x, s in ((-.3, 1.0), (.55, .75)):  # bracket fungus shelves on the shady side
        parts.append(sphere('Fungus', (.14 * s, .09 * s, .035 * s), (x, R * .95, .42), fungus, seg=8, rings=4))
    for i in range(3):  # a fresh sprout on top
        a = TAU * i / 3 + .3
        parts.append(blade('Sprout', (-.5, -.02, R * 1.9), (math.cos(a), math.sin(a), .8), .16, .1, leaf, bend=.2,
                           segs=2, fold=.2))
    parts.append(rod('Sprout stem', (-.5, -.02, R * 1.75), (-.5, -.02, R * 1.95), .012, leaf, verts=4))
    body_moss = moss_cushions('Moss', body, moss, seed=6, count=4, size=.34, target=150, up=.55, spacing=1.6)
    parts.append(body_moss)
    print('log', tri_count([p for p in parts if p]))
    bake_ao([p for p in parts if p], rays=48, distance=.5, strength=.62, ground=0.0, min_value=.3)
    ring_tint([p for p in parts if p and 'end' in p])
    bark_tint([body, parts[3]], 1.0, moss=.5)
    moss_tint([body_moss] if body_moss else [])
    return finish('log', [p for p in parts if p], 'Log')


def build_stump():
    """Cut stump with flaring roots, a sawn top with growth rings, a moss cushion and a sapling."""
    reset()
    bark = mat('Bark', '#6f4b33', rough=.9)
    wood = mat('Wood end', '#e2b47c', rough=.7)
    moss = mat('Moss', '#548a2e', rough=.9)
    leaf = mat('Leaves', '#5aa632', rough=.6, double=True)
    body = make_trunk('Stump', [(0, 0, -.3), (0, 0, .2), (.02, 0, .55)], .36, .32, bark, sides=15, roots=5,
                      root_amp=.75, root_h=.25, seed=11, rings=9, root_m=.2, flare=.45)
    # make_trunk closes with a pole; replace the dome with a flat sawn top
    delete_faces(body, lambda c, n: c.z > .556)
    parts = [body, end_grain('Top', (.02, 0, .546), (0, .02, 1), .362, wood, rings=4, sides=15)]
    rng = random.Random(3)
    for i in range(3):
        a = TAU * i / 3 + .5
        parts.append(blade('Sapling', (.2, -.1, .72), (math.cos(a), math.sin(a), .7), .14, .09, leaf, bend=.2,
                           segs=2, fold=.2))
    parts.append(rod('Sapling stem', (.2, -.1, .5), (.2, -.1, .74), .01, leaf, verts=4))
    m = moss_cushions('Moss', body, moss, seed=8, count=2, size=.26, target=120, up=.25, reach=2.0)
    if m:
        parts.append(m)
    print('stump', tri_count(parts))
    bake_ao(parts, rays=48, distance=.5, strength=.62, ground=0.0, min_value=.3)
    ring_tint([parts[1]], count=5.0)
    bark_tint([body], .6, moss=.6)
    if m:
        moss_tint([m])
    return finish('stump', parts, 'Stump')


def build_beehive_branch():
    """A crooked branch (origin at its trunk end, reaching +X) with leaf clumps and a paper hive.
    Node `Hive` pivots at the hive's hanging point; the runtime drops it."""
    reset()
    bark = mat('Bark', '#6f4b33', rough=.88)
    leaves = M_leaves()
    hive_m = mat('Hive', '#e2a34a', rough=.7)
    dark = mat('Hive entrance', '#3a2616', rough=.9)
    rng = random.Random(8)
    spine = [(-.15, 0, 0), (.6, .05, .12), (1.3, -.05, .12), (2.0, .08, .28), (2.8, .1, .5)]
    parts = [sweep('Branch', spline(spine, 10), lambda s: .16 * (1 - .75 * s), bark, sides=8, caps=True,
                   ridge=.06, ridge_count=4, noise_amp=.05, seed=2,
                   pole_end=Vector(spine[-1]) + Vector((.1, 0, .05)))]
    fork = [(1.3, -.05, .12), (1.8, -.45, .45), (2.2, -.7, .8)]
    parts.append(sweep('Fork', spline(fork, 5), lambda s: .07 * (1 - .6 * s), bark, sides=6, caps=False,
                       pole_end=Vector(fork[-1]) + Vector((.05, -.03, .06))))
    lobes = []
    for c, s in (((2.75, .1, .7), .5), ((2.2, -.72, .98), .42), ((1.6, .35, .5), .34)):
        lobes += clump('Leaves', c, s, leaves, rng, sats=3, big_sub=3, sat_sub=3, squash=.75, amp=.1, spread=.8)
    canopy = sculpt(lobes, 'Leaves', leaves, voxel=.05, target=520, cells=.3, cell_amp=.08, crease=.5, seed=4,
                    smooth=4)
    # the hive: a teardrop of layered paper bands hanging from a short stalk
    hang = Vector((1.55, 0, .02))
    H = .82
    prof = [(0, 0), (.06, -.02), (.15, -.09)]
    bands = 6
    for k in range(bands + 1):
        t = k / bands
        z = -.08 - t * (H - .1)
        r = .34 * math.sin(math.pi * (.15 + .8 * t)) ** .8
        prof.append((r * (1.0 if k % 2 == 0 else .9), z))
    prof.append((0, -H - .02))
    body = lathe('Hive', [(r, z) for r, z in prof], hive_m, seg=12, loc=hang, smooth_angle=35)
    door = sphere('Hive entrance', (.065, .03, .05), hang + Vector((0, -.31, -.52)), dark, seg=8, rings=4)
    stalk = rod('Hive stalk', hang + Vector((0, 0, .1)), hang + Vector((0, 0, -.06)), .035, bark, verts=6)
    hive_parts = [body, door, stalk]
    print('beehive-branch', tri_count(parts + [canopy] + hive_parts))
    bake_ao(parts + [canopy] + hive_parts, rays=48, distance=.6, strength=.62, ground=None, min_value=.3)
    zs = [(canopy.matrix_world @ Vector(c)).z for c in canopy.bound_box]
    foliage_tint([canopy], min(zs), max(zs), Vector((2.3, 0, .7)), dark=.55, hue=0, core=.1, core_r=.6)
    cell_tint(canopy, crease_dark=.3)
    bark_tint(parts, 1.0, moss=.3)
    tint(body, lambda p, n, f: (1.0, .9 + .1 * smoothstep(-.6, 0, p.z), .8 + .2 * smoothstep(-.6, 0, p.z)))
    hive = pivot_mesh('Hive', hive_parts, hang + Vector((0, 0, .08)))
    return finish('beehive-branch', parts + [canopy], 'Beehive branch', keep=[hive])


# ================================================================ registry

TREES = {
    'tree-broadleaf-a': build_tree_broadleaf_a,
    'tree-cedar': build_tree_cedar,
    'tree-maple': build_tree_maple,
    'tree-sakura': build_tree_sakura,
    'tree-peach': build_tree_peach,
    'tree-pine': build_tree_pine,
    'tree-broadleaf-b': build_tree_broadleaf_b,
    'tree-chestnut': build_tree_chestnut,
}


def lod_of(fn):
    def run():
        global LOD
        LOD = True
        try:
            return fn()
        finally:
            LOD = False
    return run


BUILDERS = dict(TREES)
BUILDERS.update({n + '-lod': lod_of(f) for n, f in TREES.items()})
BUILDERS.update({
    'bush-a': build_bush_a,
    'bush-b': build_bush_b,
    'rock-a': build_rock_a,
    'rock-b': build_rock_b,
    'rock-c': build_rock_c,
    'hydrangea': build_hydrangea,
    'flowers-a': build_flowers_a,
    'flowers-b': build_flowers_b,
    'reeds': build_reeds,
    'grass-tuft': build_grass_tuft,
    'lilypads': build_lilypads,
    'mushrooms': build_mushrooms,
    'log': build_log,
    'stump': build_stump,
    'beehive-branch': build_beehive_branch,
})

if __name__ == '__main__':
    names, full = parse_only(list(BUILDERS))
    results = []
    for n in names:
        print('BUILD', n)
        results.append((n, BUILDERS[n]()))
    report(results)
    if full:
        save_kit('nature', list(BUILDERS))
