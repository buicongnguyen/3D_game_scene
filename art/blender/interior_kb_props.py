"""Small shared props for the Kawabe shop and the boathouse interiors (barrels, jars, buckets, rope, fish, nets, a
hull...). Own helpers so interior_lib / interior_rooms stay untouched. Every colour is a tint over the family bases."""
import math, random
from mathutils import Vector, Matrix
import bmesh
import arch_lib
from interior_lib import *  # noqa: F401,F403

V = Vector
IRON, BRASS = '#30343e', '#d9a441'


def crate(R, c, s=.5, col='#b07a44', rot=0.0, rng=None):
    """Plain slatted crate: one box with two darker bands (cheap)."""
    rng = rng or random.Random(2)
    c = V(c)
    R.box('W', c + V((0, 0, s / 2)), (s, s, s), shade(col, .9 + .1 * rng.random()), ch=0, rot=(0, 0, rot), tag='crates')
    for zz in (.08, s - .08):
        R.box('W', c + V((0, 0, zz)), (s + .02, s + .02, .06), shade(col, .7), ch=0, rot=(0, 0, rot), tag='crates')


def var_group(R, name):
    """Context manager: everything the toolkit draws inside goes into the pivot group `name` (Var_1..3)."""
    class _Ctx:
        def __enter__(self_):
            self_.orig = R.B
            R.B = lambda key, group=None: self_.orig(key, name)
            return R

        def __exit__(self_, *a):
            del R.__dict__['B']
    return _Ctx()


def make_vars(R):
    for k in (1, 2, 3):
        R.pivot(f'Var_{k}', (0, 0, 0), with_statics=True)


def barrel(R, c, r=.3, h=.78, col='#a8703c', fill=None, n=8, lid=None):
    c = V(c)
    if fill is None:
        prof = [(0, 0), (r * .9, 0), (r, h * .5), (r * .9, h), (0, h)]
    else:
        prof = [(0, 0), (r * .9, 0), (r, h * .5), (r * .9, h), (r * .82, h), (r * .82, h - .04), (0, h - .04)]
    R.lathe('W', prof, c, col, n=n, tag='barrels', smooth=60)
    R.torus('M', c + V((0, 0, h * .78)), r * .93, .014, '#3a3e48', maj=n, mn=3, tag='barrels')
    if fill:
        R.cyl('K', c + V((0, 0, h - .05)), r * .8, .02, fill, n=n, tag='barrel fill')
    if lid:
        R.cyl('W', c + V((0, 0, h + .012)), r * .84, .024, lid, n=n, tag='barrels')


def jar(R, c, r=.07, h=.16, col='#d9c9a8', lid='#8a5a32', n=6):
    c = V(c)
    R.lathe('K', [(r, 0), (r, h * .78), (r * .6, h), (0, h)], c, col, n=n, tag='jars')


def bucket(R, c, r=.17, h=.26, col='#b07a44', fill=None, band='#3a3e48', handle=True, n=7, lean=0.0):
    c = V(c)
    R.lathe('W', [(r * .8, 0), (r, h), (r * .92, h), (r * .74, .02), (0, .02)], c, col, n=n, tag='buckets')
    if fill:
        R.cyl('K', c + V((0, 0, h * .86)), r * .88, .012, fill, n=n, tag='bucket fill')
    if handle:
        R.torus('M', c + V((0, 0, h)), r * .96, .008, band, maj=6, mn=3, rot=(math.pi / 2, 0, lean), tag='buckets', arc=.5)


def rope_coil(R, c, r=.26, col='#c9a062', turns=1, rot=0.0):
    c = V(c)
    R.torus('P', c + V((0, 0, .035)), r, .038, shade(col, .95), maj=10, mn=3, rot=(0, 0, rot), tag='rope')
    if turns > 1:
        R.torus('P', c + V((0, 0, .095)), r * .9, .03, shade(col, 1.05), maj=8, mn=3, rot=(0, 0, rot), tag='rope')


def fish(R, c, L=.3, col='#8aa6b4', belly='#f0ecdc', rot=0.0, tilt=0.0, pitch=0.0):
    """A fish: a body, a tail fin and a dorsal fin. Local +X is the head."""
    c = V(c)
    M = arch_lib.xform(c, (tilt, pitch, rot))
    R.B('K').append(bm_sphere((L * .5, L * .14, L * .17), 6, 4), M, tint=R.t('K', col), smooth=80, tag='fish')
    R.B('K').append(bm_sphere((L * .42, L * .12, L * .09), 5, 3), M @ Matrix.Translation((0, 0, -L * .07)),
                    tint=R.t('K', belly), smooth=80, tag='fish')
    R.B('K').append(bm_poly([(-L * .42, 0, 0), (-L * .72, 0, L * .2), (-L * .72, 0, -L * .2)]), M,
                    tint=R.t('K', shade(col, .8)), flat=True, tag='fish')
    R.B('K').append(bm_poly([(-L * .3, 0, L * .13), (-L * .05, 0, L * .13), (-L * .18, 0, L * .27)]), M,
                    tint=R.t('K', shade(col, .75)), flat=True, tag='fish')



def lantern(R, c, r=.17, h=.34, cord=.5, col='#e8503a', glow='#ffd08a', ribs='#3a2418'):
    """Hanging paper chochin. col tints the paper (Interior glow) - warm red/white/orange."""
    c = V(c)
    prof = [(r * .5, -h / 2), (r, 0), (r * .5, h / 2)]
    R.lathe('G', prof, c, col, n=8, tag='lantern', smooth=70)
    R.cyl('W', c + V((0, 0, h / 2 + .01)), r * .5, .03, ribs, n=6, tag='lantern')
    R.cyl('W', c + V((0, 0, -h / 2 - .01)), r * .5, .03, ribs, n=6, tag='lantern')
    if cord > 0:
        R.rod('W', c + V((0, 0, h / 2)), c + V((0, 0, h / 2 + cord)), .007, '#2a1c14', n=3, tag='lantern')


def hurricane_lamp(R, c, col='#2f5a50', glow='#ffe0a0'):
    c = V(c)
    R.cyl('M', c + V((0, 0, .02)), .055, .04, col, n=6, tag='oil lamp')
    R.cyl('G', c + V((0, 0, .13)), .04, .16, glow, n=6, tag='oil lamp')
    R.cyl('M', c + V((0, 0, .22)), .05, .025, col, n=6, tag='oil lamp')


def apple(R, c, r=.045, col='#d8342c'):
    R.sphere('K', V(c) + V((0, 0, r * .85)), (r, r, r * .88), col, seg=6, rings=3, tag='apples')


def cabbage(R, c, r=.08, col='#8ccf5a'):
    R.sphere('P', V(c) + V((0, 0, r * .9)), (r, r, r * .9), col, seg=6, rings=3, tag='veg')


def veg_crate(R, c, w=.5, d=.36, h=.2, kind='apple', rng=None, rot=0.0, col='#b07a44'):
    """Open crate heaped with produce (kind: apple, cabbage, radish, tomato, pumpkin, onion, pear)."""
    rng = rng or random.Random(3)
    c = V(c)
    L = Loc(c, rot)
    R.box('W', L.p(0, 0, h / 2), (w, d, h), shade(col, .9), ch=0, rot=L.rz, tag='crates')
    R.box('W', L.p(0, 0, h * .55), (w + .02, d + .02, .04), shade(col, .7), ch=0, rot=L.rz, tag='crates')
    cols = {'apple': ['#d8342c', '#e85a3a'], 'cabbage': ['#8ccf5a', '#6fb84a'], 'radish': ['#f4ecd8', '#e0507a'],
            'tomato': ['#e0402a', '#e8582e'], 'pumpkin': ['#e8942a', '#f0a43a'], 'onion': ['#e0b070', '#d89a58'],
            'pear': ['#c8d85a', '#b8c84a']}[kind]
    rr = {'apple': .05, 'cabbage': .09, 'radish': .045, 'tomato': .05, 'pumpkin': .09, 'onion': .05, 'pear': .05}[kind]
    nx, ny = max(1, int((w - .06) / (rr * 2))), max(1, int((d - .06) / (rr * 2)))
    for i in range(nx):
        for j in range(ny):
            x = (i + .5 - nx / 2) * (w - .06) / nx
            y = (j + .5 - ny / 2) * (d - .06) / ny
            R.sphere('K', L.p(x, y, h + rr * .5), (rr, rr, rr * .85), shade(cols[(i + j) % 2], .9 + .2 * rng.random()),
                     seg=5, rings=3, tag='produce')


def bolt(R, c, L_=.34, r=.05, col='#c8322a', rot=0.0, vertical=False):
    """A bolt of cloth / roll of paper lying on its side (or standing)."""
    c = V(c)
    if vertical:
        R.cyl('P', c + V((0, 0, L_ / 2)), r, L_, col, n=8, tag='rolls')
    else:
        R.cyl('P', c + V((0, 0, r)), r, L_, col, n=8, rot=(0, math.pi / 2, rot), tag='rolls')


def kite(R, face, u, z, d, s=.5, cols=('#e0567a', '#f4efe2'), seed=0):
    """Diamond kite pinned flat to a wall face (u, z), with a tail of bows."""
    rng = random.Random(seed)
    mb = R.B('K')
    pts = [(u, z + s * .6), (u + s * .4, z), (u, z - s * .6), (u - s * .4, z)]
    for k, (a, b, c_) in enumerate(((0, 1, 3), (1, 2, 3))):
        mb.poly([face.p(*pts[a], d), face.p(*pts[b], d), face.p(*pts[c_], d)], tint=R.t('K', cols[0]),
                normal=face.n, tag='kites')
    mb.poly([face.p(u, z + s * .6, d + .004), face.p(u + s * .4, z, d + .004), face.p(u, z, d + .004),
             face.p(u - s * .4, z, d + .004)], tint=R.t('K', cols[1]), normal=face.n, tag='kites')
    mb.poly([face.p(u - s * .03, z + s * .6, d + .008), face.p(u + s * .03, z + s * .6, d + .008),
             face.p(u + s * .03, z - s * .6, d + .008), face.p(u - s * .03, z - s * .6, d + .008)],
            tint=R.t('K', '#c9a062'), normal=face.n, tag='kites')
    for k in range(4):
        zz = z - s * .7 - k * s * .17
        uu = u + (.04 if k % 2 else -.04) * s
        mb.poly([face.p(uu - s * .06, zz + .02, d), face.p(uu + s * .06, zz + .02, d), face.p(uu, zz - .03, d)],
                tint=R.t('K', cols[k % 2]), normal=face.n, tag='kites')


def sign_plank(R, c, w=.8, h=.3, col='#f0d8a0', mark='#d8342c', rot=0.0, cord=.5):
    """A little painted shop sign hanging by two cords: plank with a round crest (faces both ways)."""
    c = V(c)
    for s in (-1, 1):
        R.box('W', c + Matrix.Rotation(rot, 3, 'Z') @ V((0, s * .016, 0)), (w, .02, h), col, ch=0,
              rot=(0, 0, rot), tag='sign')
    for s in (-1, 1):
        R.cyl('K', c + Matrix.Rotation(rot, 3, 'Z') @ V((0, s * .03, 0)), h * .34, .008, mark, n=14,
              rot=(math.pi / 2, 0, rot), tag='sign')
    R.box('W', c, (w + .04, .05, .04), '#6b4027', ch=0, rot=(0, 0, rot), tag='sign')
    for sx in (-1, 1):
        p = c + Matrix.Rotation(rot, 3, 'Z') @ V((sx * w * .4, 0, h / 2))
        R.rod('W', p, p + V((0, 0, cord)), .006, '#2a1c14', n=4, tag='sign')


def net_sheet(R, a, b, drop, sag=.1, col='#cdbb94', step=.1, thick=.016, tag='nets', group_key='P', rot_cols=None):
    """A hanging net: diagonal cord strips (double-sided quads) between a (left top) and b (right top) falling by
    `drop`, bellying out by `sag` towards +normal (here world +/-Y chosen by caller through the sign of sag)."""
    a, b = V(a), V(b)
    along = (b - a)
    Lh = along.length
    u = along.normalized()
    nrm = V((-u.y, u.x, 0))      # horizontal normal
    n = max(2, int(Lh / step))
    mb = R.B(group_key)

    def pt(s, t):               # s in 0..1 along, t in 0..1 down
        bell = math.sin(math.pi * min(1, s)) * math.sin(math.pi * t * .5 + .0) * sag
        return a + u * (Lh * s) + V((0, 0, -drop * t)) + nrm * bell * (1 if sag >= 0 else 1)
    tint = R.t(group_key, col)
    seg_t = max(2, int(drop / step))
    for k in range(-seg_t, n + 1):
        # diagonal lines going down-right and down-left, sampled as short straight quads
        for dirn in (1, -1):
            pts = []
            for j in range(seg_t + 1):
                t = j / seg_t
                s = (k * 1.0 / n) + dirn * t * drop / Lh
                if 0 <= s <= 1:
                    pts.append(pt(s, t))
            for p0, p1 in zip(pts, pts[1:]):
                d = (p1 - p0)
                w = V((nrm.x, nrm.y, 0)).cross(d).normalized() * thick if d.length > 1e-6 else V((0, 0, thick))
                q = [p0 - w, p1 - w, p1 + w, p0 + w]
                for flip in (False, True):
                    mb.poly(q[::-1] if flip else q, tint=tint, tag=tag)
    # head rope and weights
    R.rod(group_key, a, b, .014, shade(col, .8), n=4, tag=tag)


def float_ball(R, c, r=.05, col='#e0402a', band=None):
    R.sphere('K', V(c), r, col, seg=6, rings=4, tag='floats')


def oar(R, a, b, blade=.36, col='#d9a468', bcol='#c8322a'):
    """An oar from handle a to blade tip b (a flat blade at the b end)."""
    a, b = V(a), V(b)
    d = (b - a).normalized()
    R.rod('W', a, b - d * blade, .022, col, n=6, tag='oars')
    mid = b - d * blade / 2
    q = d.to_track_quat('Z', 'Y')
    R.B('W').append(bm_box((.17, .02, blade)), Matrix.Translation(mid) @ q.to_matrix().to_4x4(), tint=R.t('W', col),
                    smooth=40, tag='oars')
    R.rod('K', b - d * blade * .95, b - d * blade * .45, .008, bcol, n=4, tag='oars')


def fishing_rod(R, a, b, col='#d9a468', reel=True):
    a, b = V(a), V(b)
    R.rod('W', a, b, .014, col, n=5, r2=.005, tag='rods')
    if reel:
        p = a.lerp(b, .14)
        R.cyl('M', p + V((.03, 0, 0)), .03, .03, '#b8bcc4', n=8, rot=(0, math.pi / 2, 0), tag='rods')
    R.rod('W', a, a.lerp(b, .16), .02, '#3a2418', n=5, tag='rods')


def hull(R, c, L=3.0, beam=1.1, depth=.5, outer='#2f7f9a', inner='#e8c48a', trim='#f4efe2', band='#c8322a'):
    """Open wooden boat (bow toward +Y) with its keel at c.z. Two skins (painted outside, bare wood inside), a
    gunwale and thwarts. Returns the sheer height."""
    c = V(c)
    n = 14
    prof = [(1.0, 1.0), (.94, .5), (.62, .12), (0, 0), (-.62, .12), (-.94, .5), (-1.0, 1.0)]    # (side k, up k)

    def station(i):
        t = i / n
        y = -L / 2 + L * t
        s = 2 * t - 1
        b = beam / 2 * max(.02, (1 - abs(s) ** 2.6) ** .75) if abs(s) < 1 else .02
        sh = depth * (.9 + .36 * abs(s) ** 2.2)
        lift = .0 if abs(s) < .5 else (abs(s) - .5) * .2
        return y, b, sh, lift

    def build(off, flip):
        bm = bmesh.new()
        rows = []
        for i in range(n + 1):
            y, b, sh, lift = station(i)
            row = []
            for sk, uk in prof:
                bb = max(.01, b - off)
                row.append(bm.verts.new(V((sk * bb, y, c.z + lift + uk * sh * (1 if uk else 1) + (off if uk == 0 else 0)))))
            rows.append(row)
        for i in range(n):
            for j in range(len(prof) - 1):
                try:
                    f = bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
                except ValueError:
                    continue
        bm.normal_update()
        for f in bm.faces:
            ctr = f.calc_center_median()
            out = V((ctr.x, ctr.y - c.y, ctr.z - (c.z + depth * .4)))
            if (f.normal.dot(out) < 0) != flip:
                f.normal_flip()
        return bm
    bm = build(0, False)
    R.B('K').append(bm, Matrix.Translation((c.x, c.y, 0)), tint=lambda ctr, nrm: R.t('K', band if (ctr.z - c.z) > depth * .72 else outer),
                    smooth=70, tag='boat hull')
    bm = build(.04, True)
    R.B('W').append(bm, Matrix.Translation((c.x, c.y, 0)), tint=lambda ctr, nrm: R.t('W', shade(inner, .8 + .3 * (ctr.z - c.z) / depth)),
                    smooth=70, tag='boat hull')
    # gunwale rail along both sides, thwarts, bow/stern posts
    for sgn in (-1, 1):
        pts = []
        for i in range(n + 1):
            y, b, sh, lift = station(i)
            pts.append(V((c.x + sgn * b * .995, c.y + y, c.z + lift + sh)))
        for p0, p1 in zip(pts, pts[1:]):
            R.rod('W', p0, p1, .022, trim, n=4, tag='boat trim', cap=False)
    for tpos in (-.55, .1, .75):
        t = (tpos + L / 2) / L
        y, b, sh, lift = station(int(round(t * n)))
        R.box('W', (c.x, c.y + tpos, c.z + sh * .62), (b * 1.86, .26, .035), inner, ch=0, tag='thwarts')
    return depth * 1.2


# ---------------------------------------------------------------- low-triangle furniture (no chamfers)
def shelf_lite(R, L, w, d, h, levels, col, back=None, key='W'):
    """Open shelves like interior_rooms.shelf_unit but unchamfered; returns the shelf top heights (local z)."""
    t = .035
    for s in (-1, 1):
        R.box(key, L.p(s * (w / 2 - t / 2), 0, h / 2), (t, d, h), col, ch=0, rot=L.rz, tag='shelves')
    R.box(key, L.p(0, 0, h - t / 2), (w + .04, d + .02, t), shade(col, 1.08), ch=0, rot=L.rz, tag='shelves')
    R.box(key, L.p(0, 0, .05), (w - 2 * t, d, .1), shade(col, .8), ch=0, rot=L.rz, tag='shelves')
    R.box(key, L.p(0, d / 2 - .01, h / 2), (w - 2 * t, .02, h - .02), back or shade(col, .7), ch=0, rot=L.rz, tag='shelves')
    tops = [.1]
    for i in range(1, levels):
        z = .1 + (h - .1 - t) * i / levels
        R.box(key, L.p(0, 0, z - .012), (w - 2 * t, d - .02, .025), col, ch=0, rot=L.rz, tag='shelves')
        tops.append(z)
    return tops


def chest_lite(R, L, w, d, h, rows, col, pull=BRASS, key='W'):
    R.box(key, L.p(0, 0, h / 2), (w, d, h), col, ch=0, rot=L.rz, tag='chest')
    R.box(key, L.p(0, 0, h + .012), (w + .04, d + .03, .024), shade(col, .85), ch=0, rot=L.rz, tag='chest')
    z0, z1 = .08, h - .03
    rh = (z1 - z0) / rows
    for r in range(rows):
        zc = z0 + rh * (r + .5)
        R.box(key, L.p(0, -d / 2 - .008, zc), (w - .06, .02, rh - .025), shade(col, 1.1), ch=0, rot=L.rz, tag='chest')
        R.box('M', L.p(0, -d / 2 - .024, zc + rh * .06), (.14, .02, .03), pull, ch=0, rot=L.rz, tag='chest pulls')


def paper_lamp_lite(R, c, r=.26, h=.4, cord=.9, col='#f6d6a0'):
    c = V(c)
    R.lathe('G', [(r * .45, -h / 2), (r, 0), (r * .45, h / 2)], c, col, n=10, tag='paper lamp', smooth=70)
    R.cyl('W', c + V((0, 0, h / 2)), r * .42, .05, '#3a2418', n=8, tag='paper lamp')
    R.cyl('W', c + V((0, 0, -h / 2)), r * .42, .04, '#3a2418', n=8, tag='paper lamp')
    R.rod('W', c + V((0, 0, h / 2)), c + V((0, 0, h / 2 + cord)), .008, '#2a1c14', n=3, tag='paper lamp')


def pendant_lite(R, c, r=.24, col='#c8452a', cord=.8):
    c = V(c)
    R.lathe('K', [(.03, .16), (.07, .1), (r * .55, .02), (r, -.08), (r * .55, -.05), (.05, .08), (0, .1)], c, col, n=10,
            tag='pendant')
    R.sphere('G', c + V((0, 0, -.05)), .065, '#fff6dc', seg=6, rings=3, tag='pendant')
    R.rod('W', c + V((0, 0, .16)), c + V((0, 0, .16 + cord)), .008, '#2a1c14', n=3, tag='pendant')


def sack_lite(R, c, h=.6, r=.24, col='#efe2c4', rot=0.0, seed=0):
    rng = random.Random(seed)
    R.lathe('P', [(0, 0), (r, h * .12), (r * 1.05, h * .45), (r * .9, h * .75), (r * .25, h * .9), (r * .22, h * 1.0),
                  (0, h * 1.02)], V(c), shade(col, .92 + .1 * rng.random()), n=7, rot=(0, 0, rot), tag='sacks',
            scale=(1.0, .78, 1.0), smooth=60)
