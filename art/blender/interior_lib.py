"""Toolkit for the Starline interiors (build_interiors.py): rooms, painted window views, floors, shared props.

Builds on kit.py and arch_lib.py (never edits them). A Room is an arch_lib Asset with collision boxes (Col_* meshes
with glTF extras), a shadow shell and a finish that keeps unlit materials (Window view, Interior glow) out of the AO
bake. Tints are painted per face into COLOR_0: T(material, '#hex') turns a material's near-white base into any colour.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
import kit
import arch_lib
from arch_lib import *  # noqa: F401,F403  (MB, Asset, Face, panel, reveal, stone_tint, bm_* ...)
from arch_lib import _append_colored  # noqa: F401
from mathutils import Vector, Matrix, noise

V = Vector
TAU = math.tau
# ---------------------------------------------------------------- colour


def lin(h):
    return kit.srgb(h)


BASE = {}


def mat_base(name, hexcol, **kw):
    m = mat(name, hexcol, **kw)
    BASE[name] = lin(hexcol)
    return m


def T(m, col, k=1.0):
    """Tint that turns material m's base colour into `col` ('#hex' sRGB, a linear rgb tuple or a scalar)."""
    if col is None:
        return None
    if callable(col):
        return col
    if isinstance(col, (int, float)):
        return col * k
    t = lin(col) if isinstance(col, str) else col
    b = BASE[m.name]
    return tuple(min(1.6, k * t[i] / max(b[i], 1e-4)) for i in range(3))


def mix(a, b, t):
    a, b = (lin(a) if isinstance(a, str) else a), (lin(b) if isinstance(b, str) else b)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(col, k):
    c = lin(col) if isinstance(col, str) else col
    return tuple(x * k for x in c)


def materials():
    glow = mat('Interior glow', '#fff0d2', rough=.5, emit=1.2, emit_color='#ffb347')
    BASE['Interior glow'] = lin('#fff0d2')
    return dict(
        W=mat_base('Wood', '#eab983', rough=.64),
        P=mat_base('Plaster', '#f8f3ea', rough=.88),
        K=mat_base('Paint', '#f8f3ea', rough=.36),
        M=mat_base('Metal', '#f6eedf', rough=.3, metal=.85),
        V=mat_base('Window view', '#ffffff', rough=1.0),
        G=glow,
        C=mat_base('Collider', '#ff00ff', rough=1.0),
    )

# ---------------------------------------------------------------- room asset


class Room(Asset):
    """An interior: static per-material builders, pivots, empties and collision boxes."""

    def __init__(self, name, W, D, H, ceil, cam_top=None):
        super().__init__(name, ('Interior ' if name.startswith('interior-') else 'Keepsake ') + name.split('-', 1)[1])
        self.W, self.D, self.H, self.ceil = W, D, H, ceil
        self.cam_top = cam_top if cam_top is not None else H
        self.m = materials()
        self.cols = []
        self.is_room = name.startswith('interior-')
        self.rng = random.Random(hash(name) & 0xffff)

    # --- tinted primitives: key is 'W', 'P', 'K', 'M', 'G', 'V'
    def B(self, key, group=None):
        return self.mb(self.m[key], group)

    def t(self, key, col):
        return T(self.m[key], col)

    def box(self, key, c, size, col=None, ch=.012, rot=None, tag='box', seg=1, taper=None, group=None, smooth=40,
            front=False):
        self.B(key, group).box(V(c), size, rot=rot, ch=ch, seg=seg, tint=self.t(key, col), tag=tag, taper=taper,
                               smooth=smooth, front=front)

    def cyl(self, key, c, r, h, col=None, n=12, r2=None, rot=None, ch=0., tag='cyl', group=None, cap=True, smooth=50):
        self.B(key, group).cyl(V(c), r, h, n=n, r2=r2, rot=rot, ch=ch, tint=self.t(key, col), tag=tag, cap=cap,
                               smooth=smooth)

    def rod(self, key, a, b, r, col=None, n=8, r2=None, tag='rod', group=None, cap=True):
        self.B(key, group).rod(V(a), V(b), r, n=n, r2=r2, tint=self.t(key, col), tag=tag, cap=cap)

    def beam(self, key, a, b, w, h, col=None, ch=.012, up=(0, 0, 1), tag='beam', group=None):
        self.B(key, group).beam(V(a), V(b), w, h, up=V(up), ch=ch, tint=self.t(key, col), tag=tag)

    def sphere(self, key, c, r, col=None, seg=10, rings=6, rot=None, tag='sphere', group=None):
        self.B(key, group).sphere(V(c), r, seg=seg, rings=rings, rot=rot, tint=self.t(key, col), tag=tag)

    def lathe(self, key, profile, c, col=None, n=16, rot=None, tag='lathe', group=None, smooth=50, scale=None):
        self.B(key, group).lathe(profile, V(c), n=n, rot=rot, tint=self.t(key, col), tag=tag, smooth=smooth,
                                 scale=scale)

    def torus(self, key, c, R, r, col=None, maj=16, mn=6, rot=None, tag='torus', group=None, arc=1.0):
        self.B(key, group).torus(V(c), R, r, maj=maj, mn=mn, rot=rot, tint=self.t(key, col), tag=tag, arc=arc)

    def extrude(self, key, outline, depth, c, col=None, rot=None, bevel=0., tag='extrude', group=None):
        self.B(key, group).extrude(outline, depth, V(c), rot=rot, bevel=bevel, tint=self.t(key, col), tag=tag)

    def poly(self, key, pts, col=None, normal=None, tag='poly', group=None):
        self.B(key, group).poly([V(p) for p in pts], tint=self.t(key, col), normal=normal, tag=tag)

    def fbox(self, face, key, u, z, d, su, sz, sd, col=None, ch=0., tag='fbox', front=True):
        face.box(self.B(key), u, z, d, su, sz, sd, ch=ch, tint=self.t(key, col), tag=tag, front=front)

    # --- walls: faces point into the room
    def faces(self):
        W, D = self.W, self.D
        return {
            'back': (Face((-W / 2, D / 2, 0), (0, -1, 0)), W),    # u runs +X
            'front': (Face((W / 2, -D / 2, 0), (0, 1, 0)), W),    # u runs -X
            'left': (Face((-W / 2, -D / 2, 0), (1, 0, 0)), D),    # u runs +Y
            'right': (Face((W / 2, D / 2, 0), (-1, 0, 0)), D),    # u runs -Y
        }

    def u_of(self, side, x=None, y=None):
        W, D = self.W, self.D
        return {'back': lambda: x + W / 2, 'front': lambda: W / 2 - x, 'left': lambda: y + D / 2,
                'right': lambda: D / 2 - y}[side]()

    # --- collision and nodes
    def col(self, name, lo, hi, rot=0.0, walk=False, view=False, surface=None):
        """Axis-aligned (about its own Z rotation) box from lo to hi corners in room space."""
        self.cols.append(dict(name='Col_' + name.replace(' ', '_'), lo=V(lo), hi=V(hi), rot=rot, walk=walk, view=view, surface=surface))

    def col_c(self, name, c, size, top=None, rot=0.0, min_h=.62, **kw):
        """Furniture collider: footprint centred at c (x, y), from the floor to max(top, min_h) (never step-over low)."""
        x, y = c[0], c[1]
        z0 = c[2] if len(c) > 2 else 0.0
        top = max(top if top is not None else size[2], z0 + min_h)
        self.col(name, (x - size[0] / 2, y - size[1] / 2, z0 - .4), (x + size[0] / 2, y + size[1] / 2, top), rot=rot, **kw)

    def node(self, name, loc):
        return self.marker(name, V(loc))

    def shell_cols(self, inset=.12, surface='wood', floor_z=0.0):
        W, D = self.W, self.D
        o = 1.2
        self.col('floor', (-W / 2 - .2, -D / 2 - .2, floor_z - 1.2), (W / 2 + .2, D / 2 + .2, floor_z), walk=True,
                 view=True, surface=surface)
        top = self.ceil + 1.5
        self.col('wall_back', (-W / 2 - o, D / 2 - inset, -1.2), (W / 2 + o, D / 2 + o, top), view=True)
        self.col('wall_front', (-W / 2 - o, -D / 2 - o, -1.2), (W / 2 + o, -D / 2 + inset, top), view=True)
        self.col('wall_left', (-W / 2 - o, -D / 2 - o, -1.2), (-W / 2 + inset, D / 2 + o, top), view=True)
        self.col('wall_right', (W / 2 - inset, -D / 2 - o, -1.2), (W / 2 + o, D / 2 + o, top), view=True)
        self.col('ceiling', (-W / 2 - o, -D / 2 - o, self.cam_top), (W / 2 + o, D / 2 + o, self.cam_top + 1.6),
                 view=True)

    # --- finish: AO, tints, colliders, export
    def finish_room(self, ao_distance=.95, ao_strength=.62, rays=36):
        report = self.tri_report()
        total = sum(n for _, n in report)
        print(f'--- {self.name}: {total} tris (visual)')
        for tag, n in report[:30]:
            print(f'    {tag:28s} {n:6d}')
        objs = {}
        for g, mbs in self.groups.items():
            lst = []
            for mname, mb in mbs.items():
                if not mb.bm.faces:
                    mb.bm.free()
                    continue
                label = f'{self.root_name} {mname}' if g is None else f'{g} {mname}'
                lst.append(mb.build(label))
            objs[g] = lst
        unlit = ('Window view', 'Interior glow', 'Interior fire')
        allo = [o for lst in objs.values() for o in lst]
        lit = [o for o in allo if o.data.materials[0].name not in unlit]
        dark = [o for o in allo if o.data.materials[0].name in unlit]
        statics = [o for o in objs.get(None, []) if o in lit]
        movers = [o for o in lit if o not in statics]
        bake_ao(statics, rays=rays, distance=ao_distance, strength=ao_strength, ground=None,
                extra_occluders=movers + dark)
        for g, lst in objs.items():
            if g is None:
                continue
            mv = [o for o in lst if o in lit]
            if mv:
                bake_ao(mv, rays=rays, distance=ao_distance, strength=ao_strength, ground=None,
                        extra_occluders=statics)
        kit.ensure_color(dark, 1.0)
        for g, lst in objs.items():
            parent = self.root if g is None else self.pivots[g]
            for o in lst:
                apply_tint(o)
                if o not in dark:
                    weighted_normals(o)
                set_parent(o, parent)
        # collision boxes
        cm = self.m['C']
        for c in self.cols:
            lo, hi = c['lo'], c['hi']
            size = hi - lo
            ctr = (lo + hi) / 2
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1)
            for v in bm.verts:
                v.co = V((v.co.x * size.x, v.co.y * size.y, v.co.z * size.z))
            me = bpy.data.meshes.new(c['name'])
            bm.to_mesh(me)
            bm.free()
            me.materials.append(cm)
            ob = link(bpy.data.objects.new(c['name'], me))
            ob.location = ctr
            ob.rotation_euler = (0, 0, c['rot'])
            if c['walk']:
                ob['walk'] = 1
            if c['view']:
                ob['view'] = 1
            if c['surface']:
                ob['surface'] = c['surface']
            set_parent(ob, self.root)
        if self.is_room:
            self.root['room'] = 1
            self.root['camTop'] = round(self.cam_top, 3)
        return kit.export(self.name, [self.root], extras=self.is_room, out_dir=OUT_DIR[0])

class Loc:
    """Local furniture frame: origin + rotation about Z. Local -Y is the piece's front (faces the viewer)."""

    def __init__(self, origin, rot=0.0):
        o = V(origin)
        self.o = o if len(o) == 3 else V((o.x, o.y, 0.0))
        self.r = rot
        self.M = Matrix.Rotation(rot, 3, 'Z')

    def p(self, x, y=0.0, z=0.0):
        return self.o + self.M @ V((x, y, z))

    @property
    def rz(self):
        return (0, 0, self.r)


# walls a piece can stand against: rotation that turns local -Y (front) into the room
AGAINST = {'back': 0.0, 'left': math.pi / 2, 'right': -math.pi / 2, 'front': math.pi}


# ---------------------------------------------------------------- painted window views


def view_grid(mb, face, ua, ub, za, zb, d, nu, nv, colfn, tag='view'):
    """Subdivided pane with per-vertex colours colfn(u, z) -> linear rgb (smooth gradients)."""
    bm = mb.bm
    lay = mb.lay
    vs = {}
    for i in range(nu + 1):
        for j in range(nv + 1):
            u = ua + (ub - ua) * i / nu
            z = za + (zb - za) * j / nv
            vs[i, j] = (bm.verts.new(face.p(u, z, d)), colfn(u, z))
    n = 0
    for i in range(nu):
        for j in range(nv):
            q = [vs[i, j], vs[i + 1, j], vs[i + 1, j + 1], vs[i, j + 1]]
            f = bm.faces.new([a for a, _ in q])
            f.normal_update()
            if f.normal.dot(face.n) < 0:
                f.normal_flip()
            f.smooth = True
            for l in f.loops:
                c = next(cc for vv, cc in q if vv is l.vert)
                l[lay] = (*c, 1.0)
            n += 2
    mb.tris[tag] = mb.tris.get(tag, 0) + n


def view_poly(mb, face, pts, d, colfn, tag='view'):
    """Flat painted shape [(u, z), ...] on a pane (crisp edges), per-vertex colour colfn(u, z)."""
    bm = mb.bm
    lay = mb.lay
    verts = [bm.verts.new(face.p(u, z, d)) for u, z in pts]
    try:
        f = bm.faces.new(verts)
    except ValueError:
        return
    f.normal_update()
    if f.normal.dot(face.n) < 0:
        f.normal_flip()
    f.smooth = True
    cols = {v: colfn(u, z) for v, (u, z) in zip(verts, pts)}
    for l in f.loops:
        l[lay] = (*cols[l.vert], 1.0)
    mb.tris[tag] = mb.tris.get(tag, 0) + len(pts) - 2


def ridge_pts(u0, u1, base, amp, freq, seed, n=18, floor=None):
    pts = [(u0, floor)]
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        h = base + amp * (noise.noise(V((u * freq + seed, seed * .37, 0))) * .8 +
                          .45 * math.sin(u * freq * 1.7 + seed))
        pts.append((u, h))
    pts.append((u1, floor))
    return pts


def paint_window(R, face, hole, depth, kind, seed=0, nu=10, nv=8):
    """Painted landscape (or glowing shoji paper) filling a window hole, layered back to front 6 mm apart.
    kind: 'valley' | 'village' | 'river' | 'platform' | 'shoji'."""
    ua, ub, za, zb = hole
    mb = R.B('V')
    d0 = -depth + .004
    h = zb - za
    hz = za + h * (.42 if kind != 'platform' else .5)   # horizon height in wall coords
    zen, hor = lin('#5fb0f0'), lin('#fff2d4')
    if kind == 'shoji':
        def paper(u, z):
            t = (z - za) / h
            k = .92 + .08 * t + .03 * noise.noise(V((u * 3 + seed, z * 3, 0)))
            return shade(mix('#fff4dc', '#ffe6b8', .35 - .3 * t), k)
        view_grid(mb, face, ua, ub, za, zb, d0, max(2, nu // 3), max(2, nv // 3), paper, tag='shoji paper')
        return

    def sky(u, z):
        t = max(0.0, min(1.0, (z - hz) / (zb - hz + 1e-6)))
        c = mix(hor, zen, t ** .7)
        cl = noise.noise(V((u * 1.6 + seed * 3.1, z * 3.2, seed)))
        if cl > .25 and t > .25:
            c = mix(c, '#ffffff', min(.75, (cl - .25) * 2.6))
        return c
    view_grid(mb, face, ua, ub, za, zb, d0, nu, nv, sky, tag='view sky')
    dz = .006
    far = ridge_pts(ua, ub, hz + h * .14, h * .07, 2.3, seed + 3, n=14, floor=za)
    view_poly(mb, face, far, d0 + dz, lambda u, z: mix('#8aa7e0', '#b9c9f2', max(0, min(1, (z - hz) / (h * .25)))),
              tag='view far')
    near = ridge_pts(ua, ub, hz + h * .02, h * .06, 3.6, seed + 9, n=14, floor=za)
    view_poly(mb, face, near, d0 + dz * 2,
              lambda u, z: mix('#3f8f3a', '#7cc450', max(0, min(1, (z - za) / (hz + h * .1 - za)))), tag='view hills')
    rng = random.Random(seed * 17 + 5)
    if kind == 'valley':
        # the river winding below, and the stone viaduct striding across with the Viaduct Lamp on its middle pier
        river = [(ua, za), (ub, za), (ub, za + h * .16), (ua + (ub - ua) * .6, za + h * .2), (ua, za + h * .13)]
        view_poly(mb, face, river, d0 + dz * 3, lambda u_, z_: mix('#3a86cf', '#a6dcf4', (z_ - za) / (h * .2)),
                  tag='view river')
        zdt = hz + h * .02            # deck top
        zdb = zdt - h * .07           # deck underside / top of the arches
        zs = zdb - h * .12            # arch springing line
        n = 4
        span = (ub - ua + .3) / n
        stone = lambda u_, z_: mix('#a8998a', '#d9c9b2', max(0, min(1, (z_ - za) / (zdt - za))))
        for i in range(n):
            a = ua - .15 + i * span
            b = a + span
            pw = span * .16
            r = (span - pw) / 2
            c = (a + b) / 2
            arc = [(c + r * math.cos(t), zs + r * math.sin(t)) for t in [math.pi * k / 8 for k in range(9)]]
            view_poly(mb, face, [(a, zdb), (b, zdb), (b, zs)] + arc + [(a, zs)], d0 + dz * 4, stone, tag='view viaduct')
            view_poly(mb, face, [(b - pw / 2, za), (b + pw / 2, za), (b + pw / 2, zdb), (b - pw / 2, zdb)], d0 + dz * 4,
                      stone, tag='view viaduct')
        view_poly(mb, face, [(ua, zdb), (ub, zdb), (ub, zdt), (ua, zdt)], d0 + dz * 5,
                  lambda u_, z_: mix('#b9a994', '#e8d9c0', (z_ - zdb) / (zdt - zdb)), tag='view viaduct')
        view_poly(mb, face, [(ua, zdt), (ub, zdt), (ub, zdt + h * .015), (ua, zdt + h * .015)], d0 + dz * 6,
                  lambda u_, z_: lin('#7a6a5c'), tag='view viaduct')
        um = ua - .15 + 2 * span
        th = h * .2
        view_poly(mb, face, [(um - .035, zdt), (um + .035, zdt), (um + .025, zdt + th), (um - .025, zdt + th)],
                  d0 + dz * 6, lambda u_, z_: lin('#5a4a40'), tag='view viaduct')
        star = [(um + math.cos(math.pi / 2 + TAU * k / 10) * (.055 if k % 2 == 0 else .024),
                 zdt + th + .05 + math.sin(math.pi / 2 + TAU * k / 10) * (.055 if k % 2 == 0 else .024)) for k in range(10)]
        view_poly(mb, face, star, d0 + dz * 7, lambda u_, z_: lin('#ffd35a'), tag='view viaduct')
    elif kind == 'village':
        # Takamori across the lane: white clapboard fronts, teal roofs, peach trees
        u = ua + .05
        while u < ub - .25:
            w = rng.uniform(.35, .6)
            top = za + h * rng.uniform(.34, .46)
            roofc = rng.choice(['#23889a', '#2f9c6f', '#23889a', '#e0a93a'])
            view_poly(mb, face, [(u, za), (u + w, za), (u + w, top), (u, top)], d0 + dz * 3,
                      lambda u_, z_: mix('#e8e0d0', '#fbf6ea', (z_ - za) / (h * .4)), tag='view houses')
            view_poly(mb, face, [(u - .04, top), (u + w + .04, top), (u + w / 2, top + h * .13)], d0 + dz * 4,
                      lambda u_, z_, rc=roofc: lin(rc), tag='view houses')
            ww = w * .22
            for k in (0, 1):
                wu = u + w * (.28 + .44 * k)
                view_poly(mb, face, [(wu - ww / 2, za + h * .12), (wu + ww / 2, za + h * .12),
                                     (wu + ww / 2, za + h * .24), (wu - ww / 2, za + h * .24)], d0 + dz * 5,
                          lambda u_, z_: lin('#3b5877'), tag='view houses')
            u += w + rng.uniform(.12, .3)
        for k in range(3):
            cu = ua + (ub - ua) * (k + .5) / 3 + rng.uniform(-.1, .1)
            cz = za + h * .3
            pts = [(cu + math.cos(a) * .16, cz + math.sin(a) * .13) for a in [TAU * i / 9 for i in range(9)]]
            view_poly(mb, face, pts, d0 + dz * 6, lambda u_, z_: mix('#4f9a3a', '#8fcf58', (z_ - cz + .13) / .26),
                      tag='view trees')
    elif kind == 'river':
        river = [(ua, za), (ub, za), (ub, za + h * .3), (ua, za + h * .26)]
        view_poly(mb, face, river, d0 + dz * 3, lambda u_, z_: mix('#2f78c0', '#a8def7', (z_ - za) / (h * .3)),
                  tag='view river')
        for k in range(5):
            su = rng.uniform(ua + .05, ub - .15)
            sz = za + h * rng.uniform(.06, .22)
            view_poly(mb, face, [(su, sz), (su + .12, sz), (su + .12, sz + .012), (su, sz + .012)], d0 + dz * 4,
                      lambda u_, z_: lin('#e8f8ff'), tag='view river')
        for k in range(7):
            ru = rng.uniform(ua, ub - .05)
            view_poly(mb, face, [(ru, za), (ru + .035, za), (ru + .012, za + h * rng.uniform(.18, .32))],
                      d0 + dz * 5, lambda u_, z_: mix('#5a8a2a', '#b8c85a', (z_ - za) / (h * .3)), tag='view reeds')
    elif kind == 'platform':
        # the platform edge, rails and the far hills
        view_poly(mb, face, [(ua, za), (ub, za), (ub, za + h * .22), (ua, za + h * .22)], d0 + dz * 3,
                  lambda u_, z_: mix('#a79f94', '#c9c0b3', (z_ - za) / (h * .22)), tag='view platform')
        view_poly(mb, face, [(ua, za + h * .22), (ub, za + h * .22), (ub, za + h * .25), (ua, za + h * .25)],
                  d0 + dz * 4, lambda u_, z_: lin('#f0e6cc'), tag='view platform')
        view_poly(mb, face, [(ua, za + h * .25), (ub, za + h * .25), (ub, za + h * .34), (ua, za + h * .34)],
                  d0 + dz * 3, lambda u_, z_: mix('#7a6a5a', '#9a8a78', (z_ - za) / h), tag='view platform')
        for k in (.28, .31):
            view_poly(mb, face, [(ua, za + h * k), (ub, za + h * k), (ub, za + h * (k + .012)), (ua, za + h * (k + .012))],
                      d0 + dz * 4, lambda u_, z_: lin('#d9d2c8'), tag='view rails')
        for k in range(3):
            cu = ua + (ub - ua) * (k + .5) / 3
            cz = hz + h * .06
            pts = [(cu + math.cos(a) * .12, cz + math.sin(a) * .16) for a in [TAU * i / 9 for i in range(9)]]
            view_poly(mb, face, pts, d0 + dz * 5, lambda u_, z_: mix('#2f7a36', '#6cb84a', (z_ - cz + .16) / .32),
                      tag='view trees')


def window(R, face, hole, depth=.26, kind='valley', seed=0, frame='#5c3a26', cols=2, rows=2, sill=True,
           casing=True, shoji=False, frame_key='W', nu=10, nv=8):
    """A window seen from inside: reveal into the wall, painted view, sash bars, casing and sill."""
    ua, ub, za, zb = hole
    uc, zc = (ua + ub) / 2, (za + zb) / 2
    w, h = ub - ua, zb - za
    reveal(R.B('P'), face, hole, depth, tint=R.t('P', '#e9dcc2'), tag='window reveal')
    paint_window(R, face, hole, depth, 'shoji' if shoji else kind, seed=seed, nu=nu, nv=nv)
    fk = frame_key
    dd = -depth + .045
    sw = .055 if not shoji else .045
    for (u, z, su, sz) in ((uc, zb - sw / 2, w, sw), (uc, za + sw / 2, w, sw), (ua + sw / 2, zc, sw, h),
                           (ub - sw / 2, zc, sw, h)):
        R.fbox(face, fk, u, z, dd, su, sz, .05, frame, tag='window frame')
    iw, ih = w - 2 * sw, h - 2 * sw
    bar = .026 if shoji else .035
    for i in range(1, cols):
        R.fbox(face, fk, ua + sw + iw * i / cols, zc, dd + .008, bar, ih, .03, frame, tag='window bars')
    for j in range(1, rows):
        R.fbox(face, fk, uc, za + sw + ih * j / rows, dd + .008, iw, bar, .03, frame, tag='window bars')
    if casing:
        cw = .08
        R.fbox(face, 'W', uc, zb + cw / 2, .02, w + 2 * cw, cw, .05, frame, ch=.01, tag='window casing')
        R.fbox(face, 'W', ua - cw / 2, zc, .02, cw, h, .05, frame, ch=.01, tag='window casing')
        R.fbox(face, 'W', ub + cw / 2, zc, .02, cw, h, .05, frame, ch=.01, tag='window casing')
    if sill:
        R.fbox(face, 'W', uc, za - .03, .06, w + .24, .06, .16, frame, ch=.012, tag='window sill')


def shadow_shell(R, holes, thick=.3, gap=.45, gaps=None):
    """Outer slabs behind every wall (with the window holes) and over the ceiling, so the sun's shadow map
    seals the room. They stand `gap` behind the wall face (behind door leaves, window panes and recesses; per side
    via gaps={'left': .9}), so they are never seen from inside."""
    fcs = R.faces()
    gaps = gaps or {}
    col = R.t('P', '#3a3030')
    top = R.ceil + .4
    for side, (f, L) in fcs.items():
        hs = [h for h in holes.get(side, []) if h[2] > .05]   # doors stay shut outside: no light through them
        # pieces around holes: columns between holes, and above/below each hole
        us = sorted({0.0, L} | {h[0] for h in hs} | {h[1] for h in hs})
        edges = [-thick - 1.0] + [u for u in us if 0 < u < L] + [L + thick + 1.0]
        for a, b in zip(edges, edges[1:]):
            mid = (a + b) / 2
            inside = [h for h in hs if h[0] - 1e-6 <= mid <= h[1] + 1e-6]
            spans = [(-.4, top)]
            for h in inside:
                new = []
                for s0, s1 in spans:
                    if h[3] <= s0 or h[2] >= s1:
                        new.append((s0, s1))
                        continue
                    if h[2] > s0:
                        new.append((s0, h[2]))
                    if h[3] < s1:
                        new.append((h[3], s1))
                spans = new
            for s0, s1 in spans:
                g = gaps.get(side, gap)
                f.box(R.B('P'), mid, (s0 + s1) / 2, -g - thick / 2, b - a, s1 - s0, thick, tint=col, tag='shell',
                      front=False)
    R.box('P', (0, 0, top + thick / 2), (R.W + 2.6, R.D + 2.6, thick), col, ch=0, tag='shell')

# ---------------------------------------------------------------- floors, walls, ceilings


def plank_floor(R, x0, x1, y0, y1, z=0.0, board=.19, seg=.9, base='#c98f55', var=.16, along='x', gap=.008,
                worn=None, tag='floor boards', key='W', dust=None, seed=0):
    """Boards (top quads) with 8 mm gaps over a dark underlay; per-board tone, one quad per ~seg metres for AO."""
    rng = random.Random(seed * 31 + int((x0 + y0) * 100) & 0xffff)
    mb = R.B(key)
    mb.poly([(x0, y0, z - .012), (x1, y0, z - .012), (x1, y1, z - .012), (x0, y1, z - .012)],
            tint=R.t(key, shade(base, .22)), normal=(0, 0, 1), tag=tag)

    def tf(k):
        def f(c, nrm):
            t = shade(base, k)
            if worn:
                t = mix(t, shade(base, 1.14), worn(c))
            if dust:
                t = mix(t, '#efe6d6', dust(c))
            return R.t(key, t)
        return f
    ax0, ax1, bx0, bx1 = (x0, x1, y0, y1) if along == 'x' else (y0, y1, x0, x1)
    n = max(1, int(round((bx1 - bx0) / board)))
    bw = (bx1 - bx0) / n
    for i in range(n):
        ba, bb = bx0 + i * bw + gap / 2, bx0 + (i + 1) * bw - gap / 2
        k = 1 - var * rng.random()
        off = rng.uniform(0, seg)
        cuts = [ax0] + [a for a in [ax0 + off + seg * j for j in range(int((ax1 - ax0) / seg) + 2)] if ax0 < a < ax1] + [ax1]
        for a0, a1 in zip(cuts, cuts[1:]):
            kk = k * (1 - .07 * rng.random())
            a0g, a1g = a0 + (gap / 2 if a0 > ax0 else 0), a1 - (gap / 2 if a1 < ax1 else 0)
            if along == 'x':
                pts = [(a0g, ba, z), (a1g, ba, z), (a1g, bb, z), (a0g, bb, z)]
            else:
                pts = [(ba, a0g, z), (bb, a0g, z), (bb, a1g, z), (ba, a1g, z)]
            mb.poly(pts, tint=tf(kk), normal=(0, 0, 1), tag=tag)


def tile_floor(R, x0, x1, y0, y1, z=0.0, tile=.4, cols=('#c9683f', '#f1e2c4'), grout='#8a6a52', checker=True,
               tag='floor tiles'):
    rng = random.Random(7)
    mb = R.B('P')
    mb.poly([(x0, y0, z - .008), (x1, y0, z - .008), (x1, y1, z - .008), (x0, y1, z - .008)], tint=R.t('P', grout),
            normal=(0, 0, 1), tag=tag)
    nx, ny = int(round((x1 - x0) / tile)), int(round((y1 - y0) / tile))
    tx, ty = (x1 - x0) / nx, (y1 - y0) / ny
    g = .014
    for i in range(nx):
        for j in range(ny):
            c = cols[(i + j) % 2] if checker else cols[rng.randrange(len(cols))]
            k = .92 + .1 * rng.random()
            x, y = x0 + (i + .5) * tx, y0 + (j + .5) * ty
            mb.poly([(x - tx / 2 + g / 2, y - ty / 2 + g / 2, z), (x + tx / 2 - g / 2, y - ty / 2 + g / 2, z),
                     (x + tx / 2 - g / 2, y + ty / 2 - g / 2, z), (x - tx / 2 + g / 2, y + ty / 2 - g / 2, z)],
                    tint=R.t('P', shade(c, k)), normal=(0, 0, 1), tag=tag)


def tatami(R, x0, y0, along_x=True, z=0.0, L=1.8, Wd=.9, straw='#cfc36a', heri='#2f4c86', rng=None):
    """One tatami mat with a woven-stripe top and indigo borders on the long edges."""
    rng = rng or random.Random(3)
    th = .05
    sx, sy = (L, Wd) if along_x else (Wd, L)
    cx, cy = x0 + sx / 2, y0 + sy / 2
    mb = R.B('P')
    mb.box(V((cx, cy, z + th / 2 - .01)), (sx - .01, sy - .01, th), ch=.01, tint=R.t('P', shade(straw, .8)),
           tag='tatami')
    # woven stripes across the long axis
    n = 14
    k0 = .94 + .06 * rng.random()
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        if along_x:
            xa, xb = x0 + .005 + (sx - .01) * t0, x0 + .005 + (sx - .01) * t1
            ya, yb = y0 + .045, y0 + sy - .045
        else:
            ya, yb = y0 + .005 + (sy - .01) * t0, y0 + .005 + (sy - .01) * t1
            xa, xb = x0 + .045, x0 + sx - .045
        k = k0 * (1.0 if i % 2 else .93)
        mb.poly([(xa, ya, z + th), (xb, ya, z + th), (xb, yb, z + th), (xa, yb, z + th)],
                tint=R.t('P', shade(straw, k)), normal=(0, 0, 1), tag='tatami')
    # heri borders along the long edges, 6 mm proud
    for s in (-1, 1):
        if along_x:
            mb.box(V((cx, cy + s * (sy / 2 - .03), z + th + .002)), (sx - .02, .05, .014), ch=.004,
                   tint=R.t('P', heri), tag='tatami heri')
        else:
            mb.box(V((cx + s * (sx / 2 - .03), cy, z + th + .002)), (.05, sy - .02, .014), ch=.004,
                   tint=R.t('P', heri), tag='tatami heri')


def wall_panel(mb, face, u0, u1, z0, z1, holes=(), d=0., du=.45, dz=.45, tint=None, tag='wall', us=(), zs=()):
    """Flat wall with rectangular holes, split at the given u / z lines (post and rail edges) and every du / dz,
    so per-vertex AO stays local: a vertex hidden behind a post never darkens a whole visible cell."""
    ul = [h[0] for h in holes] + [h[1] for h in holes] + list(us)
    zl = [h[2] for h in holes] + [h[3] for h in holes] + list(zs)
    U = arch_lib._split(ul, u0, u1, du)
    Zs = arch_lib._split(zl, z0, z1, dz)
    bm = bmesh.new()
    cache = {}

    def vert(u, z):
        k = (round(u, 5), round(z, 5))
        if k not in cache:
            cache[k] = bm.verts.new(face.p(u, z, d))
        return cache[k]
    for i in range(len(U) - 1):
        for j in range(len(Zs) - 1):
            ua, ub, za, zb = U[i], U[i + 1], Zs[j], Zs[j + 1]
            cu, cz = (ua + ub) / 2, (za + zb) / 2
            if any(h[0] - 1e-6 <= cu <= h[1] + 1e-6 and h[2] - 1e-6 <= cz <= h[3] + 1e-6 for h in holes):
                continue
            bm.faces.new([vert(ua, za), vert(ub, za), vert(ub, zb), vert(ua, zb)])
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(face.n) < 0:
            f.normal_flip()
    mb.append(bm, tint=tint, smooth=10, tag=tag)


def plaster_wall(R, face, L, z0, z1, holes, col, du=.45, dz=.45, mottle=.05, tag='plaster', key='P', d=0., us=(),
                 zs=()):
    rng = random.Random(len(tag) + int(L * 10))
    seed = rng.random() * 50

    def tf(c, n):
        k = 1 - mottle * (.5 + .5 * noise.noise(V((c.x * 1.3 + seed, c.y * 1.3, c.z * 1.1))))
        return R.t(key, shade(col, k))
    wall_panel(R.B(key), face, 0, L, z0, z1, holes, d=d, du=du, dz=dz, tint=tf, tag=tag, us=us, zs=zs)


def post_splits(posts, w=.15):
    return [u + s * w / 2 for u in posts for s in (-1, 1)]


def rail_splits(rails):
    return [z + s * h / 2 for z, h in rails for s in (-1, 1)]


def vboards(R, face, key, u0, u1, z0, z1, col, w=.14, holes=(), var=.08, d=.012, groove=.012, tag='boards',
            seed=0, seg=.8):
    """Vertical tongue-and-groove boards (flat quads) in colour `col`, with darker V grooves."""
    rng = random.Random(seed * 13 + int(u1 * 10))
    mb = R.B(key)
    n = max(1, int(round((u1 - u0) / w)))
    bw = (u1 - u0) / n
    for i in range(n):
        ua, ub = u0 + i * bw, u0 + (i + 1) * bw
        cu = (ua + ub) / 2
        segs = [(z0, z1)]
        for h in holes:
            if h[0] - 1e-6 <= cu <= h[1] + 1e-6:
                new = []
                for a, b in segs:
                    if h[3] <= a or h[2] >= b:
                        new.append((a, b))
                    else:
                        if h[2] > a:
                            new.append((a, h[2]))
                        if h[3] < b:
                            new.append((h[3], b))
                segs = new
        k = 1 - var * rng.random()
        for za, zb in segs:
            m = max(1, int(math.ceil((zb - za) / seg)))
            for j in range(m):
                a, b = za + (zb - za) * j / m, za + (zb - za) * (j + 1) / m
                mb.poly([face.p(ua + groove, a, d), face.p(ub - groove, a, d), face.p(ub - groove, b, d),
                         face.p(ua + groove, b, d)], tint=R.t(key, shade(col, k)), normal=face.n, tag=tag)
                for ue, ui in ((ua, ua + groove), (ub, ub - groove)):
                    mb.poly([face.p(ue, a, d - groove), face.p(ui, a, d), face.p(ui, b, d), face.p(ue, b, d - groove)],
                            tint=R.t(key, shade(col, k * .5)), normal=face.n, tag=tag)


def wainscot(R, face, L, z0, z1, holes, col, board=.18, key='K', cap='#5c3a26', tag='wainscot', seed=0):
    """Painted boards from z0 to z1 with a cap rail (and a skirting board)."""
    vboards(R, face, key, 0, L, z0, z1, col, w=board, holes=holes, tag=tag, seed=seed, seg=1.3)
    if cap:
        for a, b in spans(0, L, z1, holes):
            R.fbox(face, 'W', (a + b) / 2, z1 + .025, .03, b - a, .05, .06, cap, ch=.01, tag=tag + ' cap')
        for a, b in spans(0, L, z0 + .06, holes):
            R.fbox(face, 'W', (a + b) / 2, z0 + .06, .025, b - a, .12, .04, cap, ch=.008, tag=tag + ' skirting')


def spans(u0, u1, z, holes):
    """Horizontal spans along a wall at height z that avoid the holes crossing z."""
    cuts = sorted([(h[0], h[1]) for h in holes if h[2] <= z <= h[3]])
    out, a = [], u0
    for h0, h1 in cuts:
        if h0 > a:
            out.append((a, h0))
        a = max(a, h1)
    if a < u1:
        out.append((a, u1))
    return out


def posts_and_rails(R, face, L, z0, z1, posts, rails, col='#5c3a26', w=.15, depth=.1, holes=()):
    for u in posts:
        R.fbox(face, 'W', u, (z0 + z1) / 2, depth / 2 - .02, w, z1 - z0, depth, col, ch=.012, tag='posts')
    for z, h in rails:
        for a, b in spans(0, L, z, holes):
            R.fbox(face, 'W', (a + b) / 2, z, depth / 2 - .03, b - a, h, depth * .8, col, ch=.01, tag='rails')


def board_ceiling(R, z, col='#b8804c', board=.3, along='x', seg=1.3):
    """Ceiling boards facing down (subdivided for AO), with thin batten gaps."""
    W, D = R.W, R.D
    mb = R.B('W')
    rng = random.Random(11)
    x0, x1, y0, y1 = -W / 2 - .05, W / 2 + .05, -D / 2 - .05, D / 2 + .05
    n = int(round((y1 - y0) / board)) if along == 'x' else int(round((x1 - x0) / board))
    for i in range(n):
        k = .86 + .14 * rng.random()
        if along == 'x':
            ya, yb = y0 + (y1 - y0) * i / n, y0 + (y1 - y0) * (i + 1) / n
            xs = [x0 + (x1 - x0) * j / max(1, int((x1 - x0) / seg)) for j in range(int((x1 - x0) / seg) + 1)]
            for xa, xb in zip(xs, xs[1:]):
                mb.poly([(xa, ya + .006, z), (xb, ya + .006, z), (xb, yb - .006, z), (xa, yb - .006, z)],
                        tint=R.t('W', shade(col, k)), normal=(0, 0, -1), tag='ceiling')
        else:
            xa, xb = x0 + (x1 - x0) * i / n, x0 + (x1 - x0) * (i + 1) / n
            ys = [y0 + (y1 - y0) * j / max(1, int((y1 - y0) / seg)) for j in range(int((y1 - y0) / seg) + 1)]
            for ya, yb in zip(ys, ys[1:]):
                mb.poly([(xa + .006, ya, z), (xb - .006, ya, z), (xb - .006, yb, z), (xa + .006, yb, z)],
                        tint=R.t('W', shade(col, k)), normal=(0, 0, -1), tag='ceiling')
    mb.box(V((0, 0, z + .02)), (W + .2, D + .2, .03), tint=R.t('W', shade(col, .3)), tag='ceiling')


def door_inside(R, side, u, w=1.0, h=2.08, col='#d8342c', frame='#5c3a26', glass=True, depth=.2, kind='panel'):
    """The front door seen from inside: reveal, a closed leaf, frame, knob; a glazed top light (painted)."""
    face, L = R.faces()[side]
    hole = (u - w / 2, u + w / 2, 0.0, h)
    reveal(R.B('P'), face, hole, depth, tint=R.t('P', '#d9c9a8'), tag='door reveal', sides='lrt')
    dl = -depth + .05
    if kind == 'panel':
        R.fbox(face, 'K', u, h / 2, dl, w - .02, h - .01, .05, col, ch=.012, tag='door')
        top = h
        if glass:
            gh = h * .24
            paint_window(R, face, (u - w * .3, u + w * .3, top - .12 - gh, top - .12), depth - .08, 'shoji', nu=3,
                         nv=3)
            R.fbox(face, 'K', u, top - .12 - gh / 2, dl + .03, .035, gh, .014, shade(col, .8), tag='door')
            top = top - .12 - gh - .04
        ph = (top - .14 - .08) / 2
        for i in range(2):
            z = .14 + ph / 2 + i * (ph + .08)
            for s in (-1, 1):
                R.fbox(face, 'K', u + s * w * .22, z, dl + .03, w * .3, ph, .02, shade(col, .86), ch=.01, tag='door')
        R.B('M').sphere(face.p(u + w / 2 - .12, 1.0, dl + .075), .035, seg=8, rings=5, tint=R.t('M', '#d9a441'),
                        tag='door')
        R.fbox(face, 'M', u + w / 2 - .12, 1.0, dl + .035, .05, .16, .02, '#d9a441', ch=.006, tag='door')
    fw = .1
    R.fbox(face, 'W', u, h + fw / 2, .02, w + 2 * fw, fw, .08, frame, ch=.015, tag='door frame')
    R.fbox(face, 'W', u - w / 2 - fw / 2, h / 2, .02, fw, h, .08, frame, ch=.015, tag='door frame')
    R.fbox(face, 'W', u + w / 2 + fw / 2, h / 2, .02, fw, h, .08, frame, ch=.015, tag='door frame')
    return hole

# ---------------------------------------------------------------- shared props


def paper_lamp(R, c, r=.26, h=.42, cord=.9, col='#f6d6a0'):
    """Round paper lantern hanging on a cord (Interior glow)."""
    c = V(c)
    prof = []
    for i in range(9):
        t = i / 8
        z = -h / 2 + h * t
        rr = r * math.sin(math.pi * (.1 + .8 * t)) ** .75 * (.97 if i % 2 else 1.0)
        prof.append((rr, z))
    R.lathe('G', prof, c, col, n=14, tag='paper lamp', smooth=70)
    R.cyl('W', c + V((0, 0, h / 2)), r * .42, .05, '#3a2418', n=12, ch=.008, tag='paper lamp')
    R.cyl('W', c + V((0, 0, -h / 2)), r * .45, .04, '#3a2418', n=12, ch=.008, tag='paper lamp')
    R.rod('W', c + V((0, 0, h / 2)), c + V((0, 0, h / 2 + cord)), .008, '#2a1c14', n=4, tag='paper lamp')


def pendant(R, c, r=.26, col='#23889a', cord=.8):
    """Enamel pendant lamp: shade (Paint), glowing bulb, cord."""
    c = V(c)
    R.lathe('K', [(0.02, .16), (.05, .15), (.07, .1), (r * .55, .02), (r, -.07), (r * 1.02, -.09), (r * .96, -.09),
                  (r * .5, -.0), (.05, .08), (0.0, .1)], c, col, n=12, tag='pendant')
    R.sphere('G', c + V((0, 0, -.06)), .07, '#fff6dc', seg=10, rings=6, tag='pendant')
    R.rod('W', c + V((0, 0, .16)), c + V((0, 0, .16 + cord)), .008, '#2a1c14', n=4, tag='pendant')


def plant(R, c, r=.2, h=.26, pot='#c9683f', leaf='#4f9a3a', kind='bush', flowers=None, seed=1):
    rng = random.Random(seed)
    c = V(c)
    R.lathe('K', [(0, 0), (r * .75, 0), (r, h * .86), (r * 1.1, h * .88), (r * 1.1, h), (r * .95, h), (0, h * .92)],
            c, pot, n=10, tag='plant pot', smooth=50)
    if kind == 'bush':
        for i in range(5):
            a = TAU * i / 5 + rng.random()
            p = c + V((math.cos(a) * r * .5, math.sin(a) * r * .5, h + r * .5 + rng.random() * r * .35))
            R.sphere('P', p, (r * .7, r * .7, r * .6), shade(leaf, .82 + .2 * rng.random()), seg=7, rings=5,
                     tag='plant')
        R.sphere('P', c + V((0, 0, h + r * 1.0)), r * .66, shade(leaf, 1.05), seg=7, rings=5, tag='plant')
    else:
        for i in range(7):
            a = TAU * i / 7 + rng.random() * .4
            base = c + V((0, 0, h * .9))
            tip = base + V((math.cos(a) * r * 1.3, math.sin(a) * r * 1.3, r * 2.6 + rng.random() * r))
            mid = base.lerp(tip, .5) + V((math.cos(a) * r * .3, math.sin(a) * r * .3, r * .3))
            R.B('P').append(bm_loft([base, mid, tip], [(-.035, 0), (.035, 0), (0, .022)], closed=True, caps=False),
                            None, tint=R.t('P', shade(leaf, .8 + .25 * rng.random())), smooth=70, tag='plant')
    if flowers:
        for i in range(6):
            a = TAU * i / 6 + rng.random()
            p = c + V((math.cos(a) * r * .65, math.sin(a) * r * .65, h + r * 1.05 + rng.random() * r * .3))
            R.sphere('K', p, r * .17, flowers, seg=6, rings=4, tag='plant flowers')


def cushion(R, c, s=.52, col='#d8342c', h=.1, rot=0.0):
    R.box('P', V(c) + V((0, 0, h / 2)), (s, s * .92, h), col, ch=.04, seg=2, rot=(0, 0, rot), tag='cushion')
    R.box('P', V(c) + V((0, 0, h + .004)), (.07, .07, .02), shade(col, .6), ch=.008, rot=(0, 0, rot), tag='cushion')


def teacup(R, c, col='#1f9aa0', r=.04):
    R.lathe('K', [(0, 0), (r * .7, 0), (r * .75, .01), (r, r * 1.6), (r * .92, r * 1.6), (r * .7, .012), (0, .012)],
            c, col, n=10, tag='tea')


def teapot(R, c, col='#2f4c86', r=.09):
    c = V(c)
    R.lathe('K', [(0, 0), (r * .8, 0), (r, r * .5), (r * .98, r * 1.1), (r * .6, r * 1.5), (r * .3, r * 1.55),
                  (r * .32, r * 1.66), (0, r * 1.7)], c, col, n=14, tag='tea')
    R.rod('K', c + V((r * .85, 0, r * .6)), c + V((r * 1.6, 0, r * 1.25)), r * .16, col, n=6, r2=r * .09, tag='tea')
    R.torus('W', c + V((0, 0, r * 1.75)), r * .75, .01, '#6b4a2a', maj=12, mn=4, rot=(math.pi / 2, 0, math.pi / 2),
            tag='tea', arc=.5)


def book_row(R, x0, x1, y, z, depth=.2, rng=None, h=(.18, .28), palette=('#b8342c', '#2f4c86', '#2f8a6a',
                                                                           '#e0a93a', '#7a3a6a', '#c9683f'),
             axis='x', lean_last=True):
    """A row of books standing on a shelf along X (or Y)."""
    rng = rng or random.Random(5)
    u = x0
    while u < x1 - .03:
        w = rng.uniform(.025, .055)
        hh = rng.uniform(*h)
        col = rng.choice(palette)
        if axis == 'x':
            R.box('K', (u + w / 2, y, z + hh / 2), (w - .004, depth * rng.uniform(.8, 1.0), hh), shade(col, .8 + .2 * rng.random()),
                  ch=0, tag='books')
        else:
            R.box('K', (y, u + w / 2, z + hh / 2), (depth * rng.uniform(.8, 1.0), w - .004, hh), shade(col, .8 + .2 * rng.random()),
                  ch=0, tag='books')
        u += w
        if rng.random() < .08:
            u += .06


def picture(R, face, u, z, w, h, frame='#5c3a26', kind='landscape', d=.0, seed=0):
    """A framed painting/photo hung on a wall (painted with coloured patches, 6+ mm proud)."""
    rng = random.Random(seed)
    R.fbox(face, 'W', u, z, d + .025, w, h, .03, frame, ch=.008, tag='pictures')
    iw, ih = w - .07, h - .07
    mb = R.B('P')
    dd = d + .042
    base = {'landscape': '#e9d7a8', 'sepia': '#d9c29a', 'night': '#27345e', 'engine': '#e9dcc0', 'fish': '#f4efe2',
            'map': '#efe2c0', 'portrait': '#d8c7a4'}[kind]
    face.box(mb, u, z, dd, iw, ih, .004, tint=R.t('P', base), tag='pictures')
    dd += .007
    if kind in ('landscape', 'night'):
        sky = '#8fc8ee' if kind == 'landscape' else '#1c2a52'
        face.box(mb, u, z + ih * .22, dd, iw * .96, ih * .5, .004, tint=R.t('P', sky), tag='pictures')
        face.box(mb, u - iw * .15, z - ih * .1, dd + .006, iw * .6, ih * .3, .004, tint=R.t('P', '#5a9a3a'), tag='pictures')
        face.box(mb, u + iw * .2, z - ih * .05, dd + .004, iw * .5, ih * .36, .004, tint=R.t('P', '#7a8fc8'), tag='pictures')
        if kind == 'night':
            for k in range(5):
                face.box(mb, u + rng.uniform(-iw * .4, iw * .4), z + ih * rng.uniform(.15, .42), dd + .008, .018, .018,
                         .004, tint=R.t('P', '#ffd35a'), tag='pictures')
    elif kind == 'sepia' or kind == 'portrait':
        for k in range(rng.randint(2, 4)):
            px = u + iw * (-.3 + .6 * (k + .5) / 4) + rng.uniform(-.02, .02)
            face.box(mb, px, z - ih * .12, dd, iw * .12, ih * .42, .004, tint=R.t('P', '#6a4a30'), tag='pictures')
            face.box(mb, px, z + ih * .16, dd + .002, iw * .09, iw * .09, .004, tint=R.t('P', '#8a6a48'), tag='pictures')
    elif kind == 'engine':
        face.box(mb, u, z - ih * .1, dd, iw * .6, ih * .3, .004, tint=R.t('P', '#d63a2a'), tag='pictures')
        face.box(mb, u + iw * .18, z + ih * .12, dd + .002, iw * .18, ih * .22, .004, tint=R.t('P', '#1d2430'), tag='pictures')
        face.box(mb, u - iw * .2, z + ih * .1, dd + .002, iw * .07, ih * .2, .004, tint=R.t('P', '#1d2430'), tag='pictures')
        for k in range(3):
            face.box(mb, u - iw * .2 + k * iw * .2, z - ih * .3, dd + .004, iw * .13, iw * .13, .004,
                     tint=R.t('P', '#262c38'), tag='pictures')
    elif kind == 'fish':
        outline = [(-.5, 0), (-.3, .18), (.1, .22), (.32, .1), (.5, .2), (.46, 0), (.5, -.2), (.32, -.1), (.1, -.2),
                   (-.3, -.16)]
        pts = [face.p(u + x * iw * .9, z + y * ih * .9, dd) for x, y in outline]
        mb.poly(pts, tint=R.t('P', '#2a2a36'), normal=face.n, tag='pictures')
        face.box(mb, u + iw * .3, z + ih * .35, dd + .002, iw * .08, ih * .12, .004, tint=R.t('P', '#c8322a'), tag='pictures')
    elif kind == 'map':
        face.box(mb, u, z, dd, iw * .8, .012, .004, tint=R.t('P', '#1d2430'), tag='pictures')
        for k in range(5):
            face.box(mb, u - iw * .4 + k * iw * .2, z + (.03 if k % 2 else -.02), dd + .004, .03, .03, .004,
                     tint=R.t('P', '#d8342c'), tag='pictures')


def crate_box(R, c, s=.55, col='#b07a44', rot=0.0, rng=None):
    rng = rng or random.Random(2)
    c = V(c)
    R.box('W', c + V((0, 0, s / 2)), (s, s, s), shade(col, .9 + .1 * rng.random()), ch=.02, rot=(0, 0, rot), tag='crates')
    for zz in (.08, s - .08):
        R.box('W', c + V((0, 0, zz)), (s + .02, s + .02, .06), shade(col, .7), ch=.008, rot=(0, 0, rot), tag='crates')


def sack(R, c, h=.62, r=.25, col='#d9c28c', rot=0.0, lean=0.0, tied=True, seed=0, flat=.75):
    """A plump burlap sack with a tied neck."""
    rng = random.Random(seed)
    c = V(c)
    prof = [(0, 0), (r * .8, .01), (r, h * .12), (r * 1.04, h * .45), (r * .9, h * .72), (r * .55, h * .86),
            (r * .22, h * .9), (r * .2, h * .96), (r * .28, h * 1.02), (0, h * 1.03)]
    R.lathe('P', prof, c, shade(col, .92 + .1 * rng.random()), n=8, rot=(lean, 0, rot), tag='sacks',
            scale=(1.0, flat, 1.0), smooth=60)
    if tied:
        R.torus('P', c + V((0, 0, h * .9)), r * .22, .02, '#8a6a3a', maj=8, mn=4, tag='sacks')


def courses(R, face, u0, u1, z0, z1, cols, key='P', course=.1, length=(.24, .3), mortar='#8a6a52', d=.0, proud=.012,
            gap=.012, holes=(), seed=0, box=False, tag='bricks'):
    """Running-bond courses (bricks or dressed stone) on a mortar backing: each unit a quad (or a thin box) `proud`
    in front, coloured from `cols`. Units crossing holes are skipped."""
    rng = random.Random(seed * 7 + int(u1 * 13))
    mb = R.B(key)
    wall_panel(mb, face, u0, u1, z0, z1, holes, d=d, du=.8, dz=.6, tint=R.t(key, mortar), tag=tag + ' mortar')
    n = max(1, int(round((z1 - z0) / course)))
    ch = (z1 - z0) / n
    for r in range(n):
        za, zb = z0 + r * ch + gap / 2, z0 + (r + 1) * ch - gap / 2
        u = u0 - (rng.uniform(.3, .7) * length[0] if r % 2 else 0)
        while u < u1 - .02:
            L = rng.uniform(*length)
            ua, ub = max(u, u0) + gap / 2, min(u + L, u1) - gap / 2
            u += L
            if ub - ua < .05:
                continue
            if any(not (ub <= h[0] or ua >= h[1] or zb <= h[2] or za >= h[3]) for h in holes):
                continue
            col = shade(rng.choice(cols), .86 + .18 * rng.random())
            pr = proud * (.7 + .6 * rng.random())
            if box:
                face.box(mb, (ua + ub) / 2, (za + zb) / 2, d + pr / 2, ub - ua, zb - za, pr, tint=R.t(key, col), tag=tag,
                         front=False)
            else:
                mb.poly([face.p(ua, za, d + pr), face.p(ub, za, d + pr), face.p(ub, zb, d + pr), face.p(ua, zb, d + pr)],
                        tint=R.t(key, col), normal=face.n, tag=tag)


def basket(R, c, r=.22, h=.16, col='#c9a062', fill=None, n=5, rng=None, fr=.055, blush=None, handle=False):
    """Woven basket (lathe with rim bands) heaped with round fruit or buns."""
    rng = rng or random.Random(3)
    c = V(c)
    R.lathe('W', [(0, 0), (r * .78, 0), (r, h * .9), (r * 1.04, h), (r * .96, h), (r * .74, .02), (0, .02)], c,
            lambda cc, nn: R.t('W', shade(col, .82 if (cc.z - c.z) % .05 < .025 else 1.0)), n=10, tag='baskets')
    R.torus('W', c + V((0, 0, h)), r * 1.0, .018, shade(col, .8), maj=10, mn=3, tag='baskets')
    if handle:
        R.torus('W', c + V((0, 0, h)), r * .95, .014, shade(col, .8), maj=8, mn=3, rot=(math.pi / 2, 0, 0), tag='baskets',
                arc=.5)
    if fill:
        for i in range(n):
            a = TAU * i / max(1, n - 1) + rng.random()
            rr = 0 if i == n - 1 else r * .55
            p = c + V((math.cos(a) * rr, math.sin(a) * rr, h * .85 + (fr * .8 if i == n - 1 else 0)))
            R.sphere('K', p, fr, shade(fill, .9 + .15 * rng.random()), seg=7, rings=4, tag='fruit')
            if blush:
                R.sphere('K', p + V((fr * .3, 0, fr * .55)), fr * .55, blush, seg=5, rings=2, tag='fruit')


def rug(R, x0, y0, x1, y1, z, col, border, stripe=None, tag='rug'):
    """A flat woven rug 6 mm proud, with a border and optional stripes."""
    mb = R.B('P')
    mb.box(V(((x0 + x1) / 2, (y0 + y1) / 2, z + .004)), (x1 - x0, y1 - y0, .012), ch=0, tint=R.t('P', border), tag=tag)
    b = .12
    mb.poly([(x0 + b, y0 + b, z + .017), (x1 - b, y0 + b, z + .017), (x1 - b, y1 - b, z + .017), (x0 + b, y1 - b, z + .017)],
            tint=R.t('P', col), normal=(0, 0, 1), tag=tag)
    if stripe:
        for k in range(3):
            yy = y0 + b + (y1 - y0 - 2 * b) * (k + 1) / 4
            mb.poly([(x0 + b, yy - .03, z + .024), (x1 - b, yy - .03, z + .024), (x1 - b, yy + .03, z + .024),
                     (x0 + b, yy + .03, z + .024)], tint=R.t('P', stripe), normal=(0, 0, 1), tag=tag)


def fire_mat(R):
    """Second emissive for open flames (oven, stove, brazier): the runtime flickers it."""
    m = mat('Interior fire', '#ffb060', rough=.6, emit=2.0, emit_color='#ff7a2a')
    BASE['Interior fire'] = lin('#ffb060')
    R.m['F'] = m
    return m
