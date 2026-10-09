"""Anatomy pass for Starline's humans: a chest, waist and hips, sloped shoulders and longer legs.

Every builder models a torso as a loft of plain rings and the limbs as tubes, so seen from the side the people
were flat slabs on short stilts. body_shape.apply() runs on the finished (unskinned) parts, right before
garments.normalize_height scales the character to its contract height, and reshapes them in three steps:

  1. torso  the cross-section gains a bust/chest, a waist and hips (width, front depth and back depth around
            the joints' own heights). A vertex gets the share of it that its bone weights give the torso bones
            (hips, spine, chest), so coats, belts, straps, buttons and aprons built on the torso move together
            and arms, legs and heads are left alone.
  2. shoulders  the square coat-hanger shoulders are pressed onto a trapezius slope with a round deltoid
            (layer order is kept: a share of the height above the line survives).
  3. legs   ankle-to-hip is stretched by a smooth, monotone vertical warp (rigid above the hips, identity below
            the ankles), applied to EVERY part so garments and legs stay matched; the joints move with it, and
            so does the head reference the builder passes in (its blush and soot spots are placed from it).
            normalize_height then scales everything back to the contract height, so the head and hands come
            out a little smaller and the legs a little longer.

Nothing here changes a vertex count, a bone name or a clip: Body joints are moved, never recomputed, so the
armature, IK and every clip are authored on the new layout.

    b.style is one of STYLES; garments.normalize_height(parts, b, H, style='woman', head=hd) calls apply().
"""
import math
import bpy
from mathutils import Vector
from human_lib import sstep, clamp

V = Vector

TORSO = ('hips', 'spine', 'chest')
SCALARS = ('hip_z', 'knee_z', 'ankle_z', 'spine_z', 'chest_z', 'neck_z', 'headj_z', 'sh_z')
VECTORS = ('sh', 'el', 'wr', 'hd', 'hip', 'knee', 'ank', 'toe')

# (width, front depth, back depth): how much bigger (+) or smaller (-) the torso cross-section gets at that landmark,
# as a fraction. leg: ankle-to-hip stretch. slope: shoulder slope strength, 0..1.
BASE = dict(leg=1.07, slope=0.6, shoulders=(0.0, 0.0, 0.0), chest=(0.0, 0.0, 0.0), waist=(0.0, 0.0, 0.0),
            hips=(0.0, 0.0, 0.0))
STYLES = {
    # Mika, 11: slim, a little waist under the raincoat, no bust
    'girl': dict(leg=1.08, slope=0.8, chest=(0.0, 0.06, 0.0), waist=(-0.09, -0.06, -0.05), hips=(0.06, 0.0, 0.07)),
    # Rin, 13: lean and athletic
    'teen': dict(leg=1.08, slope=0.8, shoulders=(0.04, 0.0, 0.0), chest=(0.04, 0.08, 0.0), waist=(-0.1, -0.08, -0.06),
                 hips=(0.05, 0.0, 0.07)),
    # Hana, the baker: a bust, a waist, hips
    'woman': dict(leg=1.06, slope=0.8, chest=(0.0, 0.14, 0.0), waist=(-0.17, -0.1, -0.09), hips=(0.09, 0.04, 0.1)),
    'villager-woman': dict(leg=1.08, slope=0.8, chest=(0.0, 0.14, 0.0), waist=(-0.17, -0.11, -0.09),
                           hips=(0.09, 0.04, 0.11)),
    # the villager man: a chest, a V to the waist
    'man': dict(leg=1.07, slope=0.85, shoulders=(0.05, 0.0, 0.0), chest=(0.06, 0.12, 0.04), waist=(-0.11, -0.1, -0.07),
                hips=(0.0, 0.0, 0.07)),
    # Genzo, the stocky stationmaster: a chest, a belly, short legs stretched the most
    'stocky': dict(leg=1.12, slope=0.8, shoulders=(0.04, 0.0, 0.0), chest=(0.04, 0.09, 0.03), waist=(0.0, 0.13, 0.0),
                   hips=(0.0, 0.0, 0.06)),
    # Ota, the tall miller in a long coat and robe
    'elder': dict(leg=1.05, slope=0.8, chest=(0.0, 0.07, 0.0), waist=(-0.03, 0.05, 0.0), hips=(0.0, 0.0, 0.05)),
    'kid': dict(leg=1.05, slope=0.7, chest=(0.0, 0.04, 0.0), waist=(0.0, 0.07, 0.0), hips=(0.0, 0.0, 0.04)),
    # Grandma Sora, 72: soft and round, a full bosom and a little tummy under the cardigan, shorter legs
    'granny': dict(leg=1.04, slope=0.85, chest=(0.02, 0.12, 0.02), waist=(-0.04, 0.08, 0.0), hips=(0.08, 0.03, 0.1)),
}


def bump(z, c, w):
    return math.exp(-((z - c) / w) ** 2)


# ---------------------------------------------------------------- 1. torso anatomy

def torso_field(b, st, k):
    """z -> (x scale, front-depth scale, back-depth scale) of the torso cross-section."""
    bands = [(st['shoulders'], b.sh_z - 0.05 * k, 0.06 * k), (st['chest'], b.chest_z - 0.015 * k, 0.07 * k),
             (st['waist'], b.spine_z, 0.06 * k), (st['hips'], b.hip_z + 0.03 * k, 0.07 * k)]

    def f(z):
        sx = sf = sb = 1.0
        for (dx, df, db), c, w in bands:
            g = bump(z, c, w)
            sx += dx * g
            sf += df * g
            sb += db * g
        return sx, sf, sb
    return f


def shape_torso(parts, b, st, k):
    fld = torso_field(b, st, k)
    stats = dict(n=0, dx=0.0, dy=0.0, parts=0)
    for o in parts:
        names = {g.index: g.name for g in o.vertex_groups}
        if not any(n in TORSO for n in names.values()):
            continue
        mw = o.matrix_world
        inv = mw.inverted()
        moved = False
        for v in o.data.vertices:
            wt = 0.0
            for ge in v.groups:
                if names.get(ge.group) in TORSO:
                    wt += ge.weight
            if wt <= 0.02:
                continue
            wt = min(1.0, wt)
            co = mw @ v.co
            sx, sf, sb = fld(co.z)
            x0, y0 = co.x, co.y
            co.x *= 1.0 + (sx - 1.0) * wt
            co.y *= 1.0 + ((sf if co.y < 0 else sb) - 1.0) * wt
            stats['n'] += 1
            stats['dx'] = max(stats['dx'], abs(co.x - x0))
            stats['dy'] = max(stats['dy'], abs(co.y - y0))
            v.co = inv @ co
            moved = True
        if moved:
            stats['parts'] += 1
            o.data.update()
    print(f"  torso: {stats['n']} vertices in {stats['parts']} parts reshaped (largest shift {stats['dx'] * 100:.1f} cm "
          f"across, {stats['dy'] * 100:.1f} cm front-back)")


# ---------------------------------------------------------------- 2. shoulders

def slope_shoulders(parts, b, strength, k, neck_x=0.06, drop=0.0, round_=0.06):
    """Press everything above a line from the neck base down past the shoulder joint onto it (a trapezius slope and
    a round deltoid). `strength` 0..1 is the share of the height above the line that is taken away."""
    if strength <= 0:
        return
    keep = 1.0 - 0.75 * strength
    kk = b.H / 1.74
    top_z = b.neck_z + 0.032 * kk
    x0 = neck_x * kk
    for o in parts:
        mw = o.matrix_world
        inv = mw.inverted()
        names = {g.index: g.name for g in o.vertex_groups}
        moved = False
        for v in o.data.vertices:
            co = mw @ v.co
            ax = abs(co.x)
            # everything at or above the head joint (skull, hair, hats, brims) is not shoulder
            if ax < x0 or abs(co.y) > 0.2 * kk or co.z > b.headj_z - 0.01 * kk:
                continue
            if any(names.get(g.group, '').startswith(('head', 'hair', 'hat', 'forearm', 'hand', 'grip')) and g.weight > 0.5
                   for g in v.groups):
                continue
            sh = V(getattr(b, 'sh_' + ('L' if co.x > 0 else 'R')))
            x1 = abs(sh.x) + 0.035 * kk
            z1 = sh.z + drop * kk
            if ax <= x1:
                line = top_z + (z1 - top_z) * (ax - x0) / (x1 - x0)
            else:
                line = z1 - ((ax - x1) / (round_ * kk)) ** 2 * round_ * kk
            if co.z > line:
                co.z = line + (co.z - line) * keep
                v.co = inv @ co
                moved = True
        if moved:
            o.data.update()


# ---------------------------------------------------------------- 3. longer legs

class ZWarp:
    """Monotone vertical warp: slope `s` between the ankles and the hips with smooth ends, 1 elsewhere (a pure
    shift above the hips, identity below the ankles). Tabulated by integrating the slope."""

    def __init__(self, ank, hip, s, band):
        self.z0, n = -0.3, 3300
        self.dz = (3.0 - self.z0) / n
        self.f = []
        acc = self.z0
        for i in range(n + 1):
            z = self.z0 + i * self.dz
            self.f.append(acc)
            w = sstep(ank, ank + band, z) * (1.0 - sstep(hip - band, hip + 0.6 * band, z))
            acc += self.dz * (1.0 + (s - 1.0) * w)
        self.top = self.f[-1] - 3.0

    def __call__(self, z):
        t = (z - self.z0) / self.dz
        i = int(math.floor(t))
        if i < 0:
            return z
        if i >= len(self.f) - 1:
            return z + self.top
        return self.f[i] + (self.f[i + 1] - self.f[i]) * (t - i)


def stretch_legs(parts, b, s, k, head=None):
    wz = ZWarp(b.ankle_z, b.hip_z, s, 0.06 * k)
    wz.hip_rise = wz(b.hip_z) - b.hip_z
    for o in parts:
        mw = o.matrix_world
        inv = mw.inverted()
        for v in o.data.vertices:
            co = mw @ v.co
            co.z = wz(co.z)
            v.co = inv @ co
        o.data.update()
    for n in SCALARS:
        setattr(b, n, wz(getattr(b, n)))
    for side in 'LR':
        for key in VECTORS:
            p = V(getattr(b, f'{key}_{side}'))
            p.z = wz(p.z)
            setattr(b, f'{key}_{side}', p)
    hc = V(b.head_c)
    hc.z = wz(hc.z)
    b.head_c = hc
    b.extra = [(n, _at(h, wz), _at(t, wz)) + tuple(rest) for n, h, t, *rest in b.extra]
    if head is not None:
        head.c = V((head.c.x, head.c.y, wz(head.c.z)))
    return wz


def _at(p, wz):
    p = V(p)
    return V((p.x, p.y, wz(p.z)))


# ---------------------------------------------------------------- entry point

def _opt(name, default):
    """Debug/tuning switches on the Blender command line: --shape-leg 1.0, --shape-torso 0, --shape-slope 0."""
    import sys
    a = sys.argv
    return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


def apply(parts, b, style, head=None):
    st = dict(BASE)
    st.update(STYLES[style])
    st['leg'] = float(_opt('--shape-leg', st['leg']))
    st['slope'] = float(_opt('--shape-slope', st['slope']))
    k = b.H / 1.45
    bpy.context.view_layer.update()
    if _opt('--shape-torso', '1') != '0':
        shape_torso(parts, b, st, k)
    slope_shoulders(parts, b, st['slope'], k)
    wz = stretch_legs(parts, b, st['leg'], k, head)
    print(f'  body shape ({style}): legs x{st["leg"]:.2f} (hips +{wz.hip_rise:.3f} m), torso {st["chest"]}/'
          f'{st["waist"]}/{st["hips"]}, shoulder slope {st["slope"]}')
    return wz
