"""Shared garment, weighting and finishing helpers for Starline characters."""
import math
import bpy
from mathutils import Vector, Matrix
from human_lib import *

V = Vector




def torso_rings(keys, n=28, zs=None, e=2.4, fn=None, yc=None):
    """keys: [(z, half_width, front_depth, back_depth), ...]. Returns rings + centres."""
    zs = zs or [k[0] for k in keys]
    rings, cs = [], []
    for z in zs:
        a, bf, bb = interp(keys_to(keys), z)
        c = V((0, yc(z) if yc else 0, z))
        rr = ring(c, V((1, 0, 0)), V((0, 1, 0)), a, bb, n, e, (lambda ang, z=z: fn(z, ang)) if fn else None,
                  a0=-math.pi / 2, ry_neg=bf)
        rings.append(rr)
        cs.append(c)
    return rings, cs


def keys_to(keys):
    return [(k[0], tuple(k[1:])) for k in keys]


def dense(z0, z1, n):
    return [lerp(z0, z1, i / (n - 1)) for i in range(n)]


def surface_strip(surf, pts, m, width, thick, off=0.004, n_side=None, name='strip', samples=None, out_ref=None):
    """A flat strap/placket following a surface: pts are projected to the nearest surface point."""
    mb = MB(name)
    P = resample(catmull(pts, 4), samples or max(8, len(pts) * 5))
    rows = []
    for i, p in enumerate(P):
        loc, nrm = surf.nearest(p)
        if out_ref is not None and nrm.dot(loc - V(out_ref)) < 0:
            nrm = -nrm
        a, b = P[max(i - 1, 0)], P[min(i + 1, len(P) - 1)]
        T = (b - a).normalized()
        S = T.cross(nrm).normalized()
        c = loc + nrm * off
        rows.append([c - S * width / 2, c - S * width / 2 + nrm * thick, c + S * width / 2 + nrm * thick,
                     c + S * width / 2])
    cs = []
    for i, p in enumerate(P):
        loc, nrm = surf.nearest(p)
        cs.append(loc - nrm * 0.01)
    mb.loft(rows, m, cs, cap0='flat', cap1='flat')
    return mb.build(angle=50)


def patch(surf, center, direction, outline, m, lift=0.004, name='patch', rim=None, rim_w=0.004):
    """A raised fabric patch (pocket, flap, label) projected on a surface."""
    mb = MB(name)
    d = Decal(surf, center, direction)
    d.fill(mb, outline, m, lift=lift, rings=2)
    if rim:
        pts = list(outline) + [outline[0]]
        d.strip(mb, pts, [rim_w] * len(pts), rim, lift=lift + 0.0008, thick=0.0015)
    # sides so the patch reads as thick cloth
    ids_top = [mb.vert(d.point(u, v, lift)) for u, v in outline]
    ids_bot = [mb.vert(d.point(u, v, 0.0)) for u, v in outline]
    c = d.anchor - d.n * 0.02
    n = len(outline)
    for j in range(n):
        mb.face([ids_top[j], ids_bot[j], ids_bot[(j + 1) % n], ids_top[(j + 1) % n]], m, inside=c)
    return mb.build(angle=45)


def rounded_rect(w, h, r, n=4, cu=0.0, cv=0.0, bottom_round=None):
    """Rounded rectangle outline (u, v) centred at (cu, cv)."""
    pts = []
    br = r if bottom_round is None else bottom_round
    corners = [(w / 2 - r, h / 2 - r, 0, r), (-w / 2 + r, h / 2 - r, 90, r), (-w / 2 + br, -h / 2 + br, 180, br),
               (w / 2 - br, -h / 2 + br, 270, br)]
    for cx, cy, a0, rr in corners:
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cu + cx + rr * math.cos(a), cv + cy + rr * math.sin(a)))
    return pts


def ring_band(center, a, b, r, m, n=24, name='band', squash=1.0, e=2.2, tilt=None, sides=10):
    """Closed tube following an ellipse (hem bands, scarf wraps, belts)."""
    c = V(center)
    pts = []
    for j in range(n):
        ang = TAU * j / n
        p = V((a * math.cos(ang), b * math.sin(ang), 0))
        if tilt:
            p = tilt @ p
        pts.append(c + p)
    mb = MB(name)
    fr = frames(pts + pts[:2], lambda p, T: p - c)
    rings, cs = [], []
    for i in range(n):
        p, T, N, B = fr[i + 1] if i else fr[0]
        rings.append(ring(pts[i], B, N, r, r * squash, sides, e))
        cs.append(pts[i] - (pts[i] - c).normalized() * 0.001)
    rings.append(rings[0])
    cs.append(cs[0])
    mb.loft(rings, m, [c] * len(rings))
    return mb.build(angle=70)


def leg_weights(side, body):
    hip, knee, ank = getattr(body, 'hip_' + side), getattr(body, 'knee_' + side), getattr(body, 'ank_' + side)

    def fn(co):
        z = co.z
        if z > knee.z:
            return blend2('shin_' + side, 'thigh_' + side, (z - (knee.z - 0.02)) / 0.07)
        return blend2('foot_' + side, 'shin_' + side, (z - (ank.z + 0.005)) / 0.06)
    return fn


def arm_weights(side, body, elbow_w=0.035):
    sh, el, wr = (getattr(body, k + '_' + side) for k in ('sh', 'el', 'wr'))

    def fn(co):
        t1 = seg_t(co, sh, el)
        if t1 < 1.0:
            u = (co - el).dot((el - sh).normalized())
            w = blend2('upperarm_' + side, 'forearm_' + side, (u + elbow_w) / (2 * elbow_w))
            return w
        t2 = seg_t(co, el, wr)
        if t2 > 1.0:
            u = (co - wr).dot((wr - el).normalized())
            return blend2('forearm_' + side, 'hand_' + side, (u - 0.005) / 0.03)
        u = (co - el).dot((el - sh).normalized())
        return blend2('upperarm_' + side, 'forearm_' + side, (u + elbow_w) / (2 * elbow_w))
    return fn


def torso_weights(body, skirt=0.0, skirt_top=None, chest_top=None):
    """hips -> spine -> chest along z; below the hips a share goes to the thighs (coat skirts)."""
    zh, zs, zc = body.hip_z, body.spine_z, body.chest_z
    top = skirt_top if skirt_top is not None else zh + 0.02

    def fn(co):
        w = chain_w([('hips', zh + 0.03), ('spine', (zs + zc) / 2), ('chest', zc + 0.07)], co.z)
        if chest_top is not None and co.z > chest_top:
            w = mix_w((w, 1 - sstep(chest_top, chest_top + 0.04, co.z)),
                      ({'neck': 1}, sstep(chest_top, chest_top + 0.04, co.z)))
        if skirt > 0 and co.z < top:
            f = skirt * sstep(top, top - 0.18, co.z)
            s = sstep(-0.05, 0.05, co.x)
            w = mix_w((w, 1 - f), ({'thigh_L': s, 'thigh_R': 1 - s}, f))
        return w
    return fn


def neck_weights(body):
    def fn(co):
        return blend2('chest', 'neck', (co.z - (body.neck_z - 0.01)) / 0.04)
    return fn

def normalize_height(parts, body, H, top=None):
    """Scale every part (and the skeleton, via body.k) so the character is exactly H tall."""
    bpy.context.view_layer.update()
    zmax = max((o.matrix_world @ v.co).z for o in parts for v in o.data.vertices)
    zmin = min((o.matrix_world @ v.co).z for o in parts for v in o.data.vertices)
    k = H / (zmax - min(zmin, 0.0))
    body.k = k
    S = Matrix.Scale(k, 4)
    for o in parts:
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
        o.data.transform(S)
        o.data.update()
    print(f'  height {zmax:.4f} -> {H} (k={k:.4f}, min z {zmin:.4f})')
    return k


def face_tints(body, hd, k=1.0, blush=0.6, blush_col=(1.0, 0.62, 0.6), el=-20, az=40, radius=0.034, iris_dark=True,
               soot=None):
    c = hd.c * k
    L = hd.pt(az, el) * k
    R = hd.pt(-az, el) * k
    radius *= k

    def skin_fn(co, n):
        out = None
        for p in (L, R):
            d = (co - p).length
            k = math.exp(-(d / radius) ** 2) * blush
            if k > 0.02:
                t = (1 - k * (1 - blush_col[0]), 1 - k * (1 - blush_col[1]), 1 - k * (1 - blush_col[2]))
                out = t if out is None else tuple(a * b for a, b in zip(out, t))
        if soot:
            p, r, s = soot
            d = (co - V(p)).length
            k = math.exp(-(d / r) ** 2) * s
            if k > 0.02:
                t = (1 - k * 0.55, 1 - k * 0.58, 1 - k * 0.6)
                out = t if out is None else tuple(a * b for a, b in zip(out, t))
        return out
    tint(body, skin_fn, {'Skin'})
    if iris_dark:
        def iris_fn(co, n):
            dz = co.z - (c.z - 0.012)
            k = sstep(-0.01, 0.02, dz)
            return (1 - 0.55 * k, 1 - 0.6 * k, 1 - 0.62 * k)
        tint(body, iris_fn, {'Iris'})



