"""Reusable body-part builders for Starline humans (heads, faces, hair, hands, limbs, footwear).

All builders work in the rest pose (arms slightly out, character facing -Y) and return
Blender objects that the character scripts weight with human_lib.weigh().
"""
import math
from mathutils import Vector, Matrix, Quaternion
from human_lib import *

V = Vector


# ================================================================ skeleton

class Body:
    """Joint layout for one humanoid, derived from a few proportions."""

    def __init__(self, H, **k):
        self.H = H
        g = k.get
        s = H / 1.45
        self.hip_z = g('hip_z', 0.64 * s)
        self.hip_x = g('hip_x', 0.082 * s)
        self.knee_z = g('knee_z', 0.345 * s)
        self.ankle_z = g('ankle_z', 0.085 * s)
        self.ankle_y = g('ankle_y', 0.02 * s)
        self.toe_y = g('toe_y', -0.105 * s)
        self.spine_z = g('spine_z', 0.74 * s)
        self.chest_z = g('chest_z', 0.88 * s)
        self.neck_z = g('neck_z', 1.05 * s)
        self.headj_z = g('headj_z', 1.14 * s)
        self.sh_x = g('sh_x', 0.152 * s)
        self.sh_z = g('sh_z', 1.02 * s)
        self.sh_y = g('sh_y', 0.012 * s)
        self.upper = g('upper', 0.205 * s)
        self.fore = g('fore', 0.19 * s)
        self.hand = g('hand', 0.085 * s)
        self.arm_out = g('arm_out', 11.0)       # degrees the arm hangs away from the body
        self.elbow_bend = g('elbow_bend', 8.0)   # rest bend (forward)
        self.head_c = V(g('head_c', (0, 0.0, 1.265 * s)))
        self.foot_out = g('foot_out', 4.0)
        self.extra = []  # extra bones (name, head, tail, parent)
        self.compute()

    def compute(self):
        a = math.radians(self.arm_out)
        for side, sx in (('L', 1), ('R', -1)):
            sh = V((sx * self.sh_x, self.sh_y, self.sh_z))
            d1 = V((sx * math.sin(a), 0.035, -math.cos(a))).normalized()
            el = sh + d1 * self.upper
            b = math.radians(self.elbow_bend)
            d2 = V((sx * math.sin(a * 1.05), 0.035 - math.sin(b), -math.cos(a))).normalized()
            wr = el + d2 * self.fore
            d3 = V((sx * math.sin(a * 0.8), -0.08, -1)).normalized()
            hd = wr + d3 * self.hand
            setattr(self, 'sh_' + side, sh)
            setattr(self, 'el_' + side, el)
            setattr(self, 'wr_' + side, wr)
            setattr(self, 'hd_' + side, hd)
            setattr(self, 'fdir_' + side, d2)
            setattr(self, 'hdir_' + side, d3)
            hip = V((sx * self.hip_x, 0, self.hip_z))
            knee = V((sx * self.hip_x * 1.02, -0.012 * self.H / 1.45, self.knee_z))
            ank = V((sx * self.hip_x * 1.05, self.ankle_y, self.ankle_z))
            fo = math.radians(self.foot_out)
            toe = V((ank.x + sx * math.sin(fo) * abs(self.toe_y), self.toe_y, 0.03 * self.H / 1.45))
            setattr(self, 'hip_' + side, hip)
            setattr(self, 'knee_' + side, knee)
            setattr(self, 'ank_' + side, ank)
            setattr(self, 'toe_' + side, toe)

    def bones(self):
        B = self._bones()
        k = getattr(self, 'k', 1.0)
        if k == 1.0:
            return B
        out = []
        for b in B:
            out.append((b[0], tuple(V(b[1]) * k), tuple(V(b[2]) * k)) + tuple(b[3:]))
        return out

    def _bones(self):
        z = self.H / 1.45
        B = [
            ('root', (0, 0, 0), (0, 0, 0.12 * z), None),
            ('hips', (0, 0, self.hip_z), (0, 0, self.spine_z), 'root'),
            ('spine', (0, 0, self.spine_z), (0, 0, self.chest_z), 'hips'),
            ('chest', (0, 0, self.chest_z), (0, 0.0, self.neck_z), 'spine'),
            ('neck', (0, 0.0, self.neck_z), (0, 0.005, self.headj_z), 'chest'),
            ('head', (0, 0.005, self.headj_z), (0, 0.005, self.headj_z + 0.26 * z), 'neck'),
        ]
        for s in 'LR':
            sh, el, wr, hd = (getattr(self, k + '_' + s) for k in ('sh', 'el', 'wr', 'hd'))
            B += [('upperarm_' + s, sh, el, 'chest'), ('forearm_' + s, el, wr, 'upperarm_' + s),
                  ('hand_' + s, wr, hd, 'forearm_' + s)]
            if s == 'R':
                pc = self.palm_center('R')
                fd = getattr(self, 'fdir_R')
                B.append(('grip_R', pc, pc + fd * 0.08 * z, 'hand_R'))
        for s in 'LR':
            hip, knee, ank, toe = (getattr(self, k + '_' + s) for k in ('hip', 'knee', 'ank', 'toe'))
            B += [('thigh_' + s, hip, knee, 'hips'), ('shin_' + s, knee, ank, 'thigh_' + s),
                  ('foot_' + s, ank, toe, 'shin_' + s)]
        return B + self.extra

    def hand_frame(self, side):
        """(origin=wrist, a=along hand, p=palm normal, t=thumb side) for the rest hand."""
        sx = 1 if side == 'L' else -1
        a = getattr(self, 'hdir_' + side)
        p = V((-sx, 0, 0))
        p = (p - a * p.dot(a)).normalized()
        t = a.cross(p) * (-sx)
        if t.y > 0:
            t = -t
        return getattr(self, 'wr_' + side), a, p, t.normalized()

    def palm_center(self, side):
        o, a, p, t = self.hand_frame(side)
        return o + a * (self.hand * 0.55) + p * (0.012 * self.H / 1.45)


def make_armature(name, body):
    from rig import build_armature
    return build_armature(name, body.bones())

# ================================================================ heads & faces


class Head:
    """Sculpted head: SDF union sampled on a UV sphere; exposes the skull radius for hair."""

    def __init__(self, center, sdf, m_skin, seg=32, rings=24):
        self.c = V(center)
        self.sdf = sdf
        mb = MB('head')
        sdf_mesh(mb, sdf, self.c, m_skin, seg, rings)
        self.ob = mb.build()
        self.surf = Surface([self.ob])
        self._r = {}

    def r(self, d):
        key = (round(d.x, 4), round(d.y, 4), round(d.z, 4))
        if key not in self._r:
            self._r[key] = star_surface(self.sdf, self.c, d)
        return self._r[key]

    def dir(self, az, el):
        a, e = math.radians(az), math.radians(el)
        return V((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))

    def pt(self, az, el, off=0.0):
        d = self.dir(az, el)
        return self.c + d * (self.r(d) + off)


def head_sdf(c, w=1.0, jaw=1.0, cheek=1.0, chin=1.0, scale=1.0, depth=1.0, crown=1.0, k=0.035):
    """Default cute head: cranium + jaw/face + two cheeks + chin (head-local around c)."""
    c = V(c)
    s = scale
    f = SDF(k * s)
    f.add(c + V((0, 0.012, 0.02 * crown)) * s, (0.142 * s * w, 0.148 * s * depth, 0.150 * s * crown))
    f.add(c + V((0, -0.022, -0.06)) * s, (0.112 * s * w * jaw, 0.108 * s, 0.098 * s))
    for sx in (1, -1):
        f.add(c + V((sx * 0.062 * w, -0.058, -0.058)) * s, (0.058 * s * cheek, 0.052 * s * cheek, 0.05 * s * cheek))
    f.add(c + V((0, -0.068 * depth, -0.118)) * s, (0.036 * s * chin, 0.032 * s * chin, 0.03 * s * chin))
    return f


class Face:
    """Projected face features. All sizes are head-relative (scale = head scale)."""

    def __init__(self, head, mats, s=1.0):
        self.h, self.m, self.s = head, mats, s
        self.mb = MB('face')

    def decal(self, az, el, roll=0.0):
        d = self.h.dir(az, el)
        return Decal(self.h.surf, self.h.c, d, roll=roll)

    def eyes(self, az=24, el=-5, w=0.021, h=0.027, iris_w=0.84, iris_h=1.0, iris_dv=0.1, pupil=(0.4, 0.5),
             look=(0.0, 0.0), lid_w=0.0065, lashes=0, lower=False, tilt=4.0, squint=0.0, brow=None, brow_el=None,
             brow_w=0.0045, brow_len=1.0, brow_arch=0.006, brow_tilt=0.0, highlight=1.0, lid_drop=0.0,
             top=0.82, brow_az=2.0):
        s = self.s
        w, h = w * s, h * s
        for sx in (1, -1):
            dec = self.decal(sx * az, el, roll=-sx * tilt)
            # sclera: egg shape, flatter on top (lid) and fuller below
            top_cut = h * (0.55 - lid_drop)

            def sh(a):
                return 1.0
            sclera = []
            N = 22
            for j in range(N):
                a = TAU * j / N
                u = w * math.cos(a)
                v = h * math.sin(a)
                if v > 0:
                    v *= (top - squint)
                    v = min(v, top_cut + h * 0.25 * (1 - abs(math.cos(a))) ** 2)
                sclera.append((u * sx, v))
            if sx < 0:
                sclera = sclera[::-1]
            dec.fill(self.mb, sclera, self.m['eye'], lift=0.0012 * s, rings=3, dome=0.0018 * s)
            # iris / pupil (clipped to the sclera), looking slightly inward/down
            cu, cv = look[0] * s * sx, look[1] * s - h * iris_dv
            ir = ellipse_pts(cu, cv, w * iris_w, h * iris_h, 24)
            clip = sclera if sx > 0 else sclera
            ccw = _ccw(clip)
            ir_c = clip_poly(_ccw(ir), ccw)
            if len(ir_c) >= 3:
                dec.fill(self.mb, resample_poly(ir_c, 22), self.m['iris'], lift=0.0021 * s, rings=3,
                         dome=0.0018 * s, center=(cu, cv))
            pu = ellipse_pts(cu, cv - h * 0.03, w * pupil[0], h * pupil[1], 16)
            pu_c = clip_poly(_ccw(pu), ccw)
            if len(pu_c) >= 3:
                dec.fill(self.mb, resample_poly(pu_c, 16), self.m['dark'], lift=0.0029 * s, rings=2,
                         dome=0.0018 * s, center=(cu, cv - h * 0.03))
            # highlights: same light direction for both eyes (upper viewer-left)
            if highlight:
                hl = ellipse_pts(cu - w * 0.28, cv + h * 0.32, w * 0.27 * highlight, h * 0.23 * highlight, 12)
                dec.fill(self.mb, hl, self.m['eye'], lift=0.0037 * s, rings=1, dome=0.0018 * s)
                hl2 = ellipse_pts(cu + w * 0.30, cv - h * 0.28, w * 0.10 * highlight, h * 0.09 * highlight, 8)
                dec.fill(self.mb, hl2, self.m['eye'], lift=0.0037 * s, rings=1, dome=0.0018 * s)
            # upper lid: thick stroke following the sclera top, with an outer flick
            path, widths = [], []
            M = 13
            for i in range(M):
                t = i / (M - 1)
                a = math.pi * (1.0 - t) if sx > 0 else math.pi * t
                u = w * 1.05 * math.cos(a)
                v = h * 1.02 * math.sin(a) * (top - squint)
                v = min(v, top_cut + h * 0.25 * (1 - abs(math.cos(a))) ** 2) + lid_w * 0.25
                path.append((u, v))
                outer = (t if sx > 0 else 1 - t)
                widths.append(lid_w * s * (0.45 + 0.75 * math.sin(math.pi * min(1, outer * 0.9 + 0.1)) ** 0.6))
            # outer corner flick
            if sx > 0:
                ou, ov = path[-1]
                path += [(ou + w * 0.18, ov + h * 0.06), (ou + w * 0.34, ov + h * 0.16)]
                widths += [lid_w * s * 0.8, lid_w * s * 0.25]
            else:
                ou, ov = path[0]
                path = [(ou - w * 0.34, ov + h * 0.16), (ou - w * 0.18, ov + h * 0.06)] + path
                widths = [lid_w * s * 0.25, lid_w * s * 0.8] + widths
            dec.strip(self.mb, path, widths, self.m['dark'], lift=0.0033 * s, thick=0.0012 * s)
            for k in range(lashes):
                # small upward lashes at the outer corner
                base_u = sx * w * (0.72 + 0.2 * k)
                base_v = h * (0.35 - 0.12 * k)
                p2 = [(base_u, base_v), (base_u + sx * w * 0.22, base_v + h * 0.2), (base_u + sx * w * 0.38, base_v + h * 0.28)]
                dec.strip(self.mb, p2, [lid_w * s * .7, lid_w * s * .45, lid_w * s * .1], self.m['dark'],
                          lift=0.0031 * s, thick=0.0008 * s)
            if lower:
                lp, lw = [], []
                for i in range(7):
                    t = i / 6
                    a = math.pi * (1.25 + 0.5 * t)
                    lp.append((w * 0.95 * math.cos(a) * sx if sx > 0 else -w * 0.95 * math.cos(a), h * 1.02 * math.sin(a) - lid_w * 0.3))
                    lw.append(lid_w * s * 0.28 * math.sin(math.pi * t))
                dec.strip(self.mb, lp, [max(x, lid_w * s * 0.05) for x in lw], self.m['lash'], lift=0.0014 * s)
            if brow is not None:
                bel = brow_el if brow_el is not None else el + 17
                bd = self.decal(sx * (az + brow_az), bel, roll=-sx * brow_tilt)
                bp, bw = [], []
                for i in range(9):
                    t = i / 8
                    u = sx * lerp(-w * 0.95, w * 1.15, t) * brow_len
                    v = brow_arch * s * math.sin(math.pi * (0.2 + 0.7 * t)) - t * 0.002 * s
                    bp.append((u, v))
                    bw.append(brow_w * s * (0.55 + 0.6 * math.sin(math.pi * min(1, 0.25 + t * 0.8))))
                if sx < 0:
                    bp, bw = bp[::-1], bw[::-1]
                bd.strip(self.mb, bp, bw, brow, lift=0.0015 * s, thick=0.0018 * s)

    def mouth(self, el=-25, w=0.022, smile=0.006, open_=0.0, m=None, thick=0.0028, tongue=None, az=0.0):
        s = self.s
        dec = self.decal(az, el)
        w *= s
        if open_ > 0:
            # a small open smile: flat-ish top, round bottom
            pts = []
            N = 18
            for j in range(N):
                a = math.pi + math.pi * j / (N - 1)
                pts.append((w * math.cos(a) * -1, -open_ * s * math.sin(a) * -1 * 1.0))
            outline = [(u, v * 1.0 - 0.0 + (smile * s * (1 - (u / w) ** 2) * -0.4)) for u, v in pts]
            top = [(-w * 0.9, smile * s * 0.35), (0, -smile * s * 0.1), (w * 0.9, smile * s * 0.35)]
            poly = []
            for j in range(N):
                t = j / (N - 1)
                u = lerp(-w, w, t)
                poly.append((u, smile * s * 0.55 * (u / w) ** 2 - smile * s * 0.15))
            for j in range(N - 2, 0, -1):
                t = j / (N - 1)
                u = lerp(-w, w, t)
                poly.append((u * 0.92, -open_ * s * math.sin(math.pi * t) ** 0.8 + smile * s * 0.2 * (u / w) ** 2))
            dec.fill(self.mb, _ccw(poly), m or self.m['dark'], lift=0.0012 * s, rings=2,
                     center=(0, -open_ * s * 0.45))
            if tongue is not None:
                tg = ellipse_pts(0, -open_ * s * 0.62, w * 0.5, open_ * s * 0.3, 12)
                dec.fill(self.mb, tg, tongue, lift=0.0018 * s, rings=1)
        else:
            path, widths = [], []
            for i in range(11):
                t = i / 10
                u = lerp(-w, w, t)
                path.append((u, -smile * s * (1 - (u / w) ** 2)))
                widths.append(thick * s * (0.35 + 0.65 * math.sin(math.pi * t) ** 0.5))
            dec.strip(self.mb, path, widths, m or self.m['dark'], lift=0.0012 * s, thick=0.0008 * s)

    def build(self, name='face'):
        return self.mb.build(name, angle=80)


def _ccw(poly):
    a = 0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return list(poly) if a > 0 else list(reversed(poly))


def nose(head, m, el=-12, size=(0.014, 0.012, 0.011), s=1.0, off=-0.004, seg=12):
    mb = MB('nose')
    p = head.pt(0, el, off * s)
    ellipsoid(mb, p + V((0, -size[1] * 0.35 * s, 0)), tuple(x * s for x in size), m, seg, max(6, seg * 2 // 3))
    return mb.build()


def ears(head, m, el=-8, s=1.0, size=(0.022, 0.038), az=88):
    mb = MB('ears')
    for sx in (1, -1):
        p = head.pt(sx * az, el, -0.004 * s)
        d = head.dir(sx * az, el)
        M = Matrix.Rotation(math.radians(sx * 12), 3, 'Z')
        # outer shell (flattened ellipsoid facing outward), inner bowl
        ellipsoid(mb, p + d * 0.004 * s, (0.012 * s, size[0] * s, size[1] * s), m, 12, 8,
                  M=Matrix.Rotation(math.radians(-sx * 20), 3, 'Z'))
        ellipsoid(mb, p + d * 0.010 * s + V((0, -0.003 * s, 0)), (0.006 * s, size[0] * 0.55 * s, size[1] * 0.6 * s),
                  m, 10, 6, M=Matrix.Rotation(math.radians(-sx * 20), 3, 'Z'))
    return mb.build()

# ================================================================ hair


def hair_cap(head, m, hairline, off=0.006, seg=28, rows=9, top_el=89.0):
    """Skull-hugging cap from the crown down to hairline(az) (degrees of elevation)."""
    mb = MB('haircap')
    rings, cs = [], []
    for i in range(rows):
        t = i / (rows - 1)
        row = []
        for j in range(seg):
            az = -180 + 360 * j / seg
            el = lerp(top_el, hairline(az), t)
            row.append(head.pt(az, el, off))
        rings.append(row)
        cs.append(head.c + V((0, 0, 0.02)))
    mb.loft(rings, m, [head.c] * rows, cap0=head.pt(0, 90, off + 0.002))
    return mb.build(angle=80)


def lock_path(head, keys, n=6):
    """keys: [(az, el, offset), ...] -> points on the skull."""
    return [head.pt(az, el, off) for az, el, off in keys]

# ================================================================ hands


def hand(body, side, m, curl=0.35, grip=False, mitten=False, s=1.0, fingers=4, thumb_curl=0.2, spread=1.0,
         nails=None, width=1.0, n=8):
    """Chunky hand in the rest wrist frame. curl 0..1 relaxed -> fist; grip leaves a channel."""
    o, a, p, t = body.hand_frame(side)
    mb = MB('hand_' + side)
    L = body.hand
    pw = 0.031 * s * width  # half width
    pt = 0.0155 * s  # half thickness
    # palm: loft along a
    rings, cs = [], []
    prof = [(0.0, 0.62, 0.75), (0.012, 0.8, 0.9), (0.03, 0.97, 1.0), (0.046, 1.0, 0.95), (0.056, 0.93, 0.78)]
    for u, kw, kt in prof:
        c = o + a * (u * s)
        rings.append(ring(c, t, p, pw * kw, pt * kt, 12, 2.6))
        cs.append(c)
    mb.loft(rings, m, cs, cap0=o - a * 0.006 * s, cap1=o + a * (0.064 * s) + p * 0.002 * s)
    if mitten:
        # mitten: one fat finger block
        pts = []
        for k in range(5):
            f = k / 4
            ang = curl * 1.3 * f
            pts.append(o + a * (0.05 * s + 0.045 * s * math.sin(ang + 0.01) / max(ang + 0.01, 1e-3) * f) +
                       p * (0.045 * s * (1 - math.cos(ang)) * f))
        sweep(mb, [o + a * 0.04 * s] + [o + a * (0.05 * s + 0.042 * s * f) * math.cos(curl * f) +
                                        p * (0.03 * s * math.sin(curl * f * 1.4)) for f in (0.3, 0.6, 1.0)],
              m, rfn=lambda tt: (pw * (0.95 - 0.1 * tt), pt * 0.85), n=10, up_fn=lambda q, T: p, cap1='round')
    else:
        lens = [0.040, 0.045, 0.042, 0.034][:fingers]
        offs = [0.021, 0.007, -0.007, -0.021] if fingers == 4 else [0.018, 0.0, -0.018]
        for i, (ln, off) in enumerate(zip(lens, offs)):
            ln *= s
            base = o + a * (0.052 * s) + t * (off * s * width) + p * (0.002 * s)
            cf = curl * (1.0 + 0.12 * i)
            spr = (off / 0.021) * math.radians(5) * spread
            aa = (Quaternion(p, spr) @ a) if spread else a
            pts = [base]
            dirv = aa.copy()
            seg_l = [ln * 0.45, ln * 0.33, ln * 0.27]
            cur = base.copy()
            for k, sl in enumerate(seg_l):
                ang = cf * (0.9 if k == 0 else 1.25) * (1.25 if grip else 1.0)
                axis = aa.cross(p).normalized()
                dirv = (Quaternion(axis, -ang) @ dirv).normalized()
                cur = cur + dirv * sl
                pts.append(cur.copy())
            r0 = 0.0098 * s * (1.05 if i == 1 else 1.0) * (0.92 if i == 3 else 1.0)
            sweep(mb, catmull(pts, 2), m, rfn=lambda tt, r0=r0: (r0 * (1 - 0.12 * tt), r0 * (0.9 - 0.1 * tt)), n=n,
                  up_fn=lambda q, T: p, cap1='round', cap0=None)
    # thumb
    tb = o + a * (0.018 * s) + t * (pw * 0.9) + p * (0.006 * s)
    td = (a * 0.75 + t * 0.35 + p * (0.35 + thumb_curl)).normalized()
    td2 = (a * 0.8 + t * 0.05 + p * (0.55 + thumb_curl * 1.4)).normalized()
    pts = [tb, tb + td * 0.022 * s, tb + td * 0.022 * s + td2 * 0.02 * s]
    sweep(mb, catmull(pts, 2), m, rfn=lambda tt: (0.0115 * s * (1 - 0.15 * tt), 0.0105 * s * (1 - 0.12 * tt)), n=n,
          up_fn=lambda q, T: p, cap1='round', cap0='round')
    return mb.build(angle=70)

# ================================================================ legs & footwear


def limb(pts, m, rfn, n=12, name='limb', cap0='round', cap1='round', fold=None, e=2.0, up_fn=None, per=3):
    mb = MB(name)
    sweep(mb, catmull(pts, per) if len(pts) > 2 else pts, m, rfn=rfn, n=n, cap0=cap0, cap1=cap1, fold=fold, e=e,
          up_fn=up_fn)
    return mb.build(angle=70)


def boot(body, side, m_boot, m_sole, s=1.0, shaft_top=None, shaft_r=0.05, width=0.047, toe_h=0.062,
         length=None, heel=0.05, cuff=None, m_cuff=None, tab=True, laces=None, m_lace=None, sole_t=0.022,
         toe_round=1.0, name=None, flare=1.12):
    """Chunky boot/shoe: foot shell lofted heel->toe, a shaft to shaft_top, a sole and heel block."""
    sx = 1 if side == 'L' else -1
    ank = getattr(body, 'ank_' + side)
    fo = math.radians(body.foot_out) * sx
    R = Matrix.Rotation(fo, 3, 'Z')
    mb = MB(name or 'boot_' + side)
    L = length if length is not None else abs(body.toe_y - ank.y) + 0.035 * s
    ay = ank.y
    base = V((ank.x, 0, 0))

    def P(x, y, z):
        return base + R @ V((x, y - 0.0, z)) + V((0, 0, 0))
    # foot shell: sections along y from heel (+) to toe (-)
    rings, cs = [], []
    ys = [ay + heel * s, ay + heel * s * 0.7, ay + heel * 0.2 * s, ay - L * 0.25, ay - L * 0.5, ay - L * 0.72,
          ay - L * 0.88, ay - L * 0.97]
    for i, y in enumerate(ys):
        t = i / (len(ys) - 1)
        hh = interp([(0, 0.075), (0.3, 0.1), (0.5, 0.078), (0.75, toe_h), (1.0, toe_h * 0.6)], t) * s
        if t < 0.35:
            hh = max(hh, (ank.z + 0.02 * s) if shaft_top else hh)
        ww = interp([(0, 0.75), (0.15, 0.9), (0.45, 1.0), (0.75, 1.02), (0.92, 0.85), (1.0, 0.5)], t) * width * s
        zc = sole_t * s + hh / 2 - 0.004 * s
        c = P(0, y, zc)
        rr = ring(c, R @ V((1, 0, 0)), V((0, 0, 1)), ww, hh / 2, 14, 2.8 if t < 0.8 else 2.3)
        # flatten the bottom
        rr = [V((q.x, q.y, max(q.z, sole_t * s - 0.002 * s))) for q in rr]
        rings.append(rr)
        cs.append(c)
    tip = P(0, ay - L * 1.0 - 0.004 * s * toe_round, sole_t * s + toe_h * 0.28 * s)
    heelp = P(0, ay + heel * s + 0.01 * s, sole_t * s + 0.03 * s)
    mb.loft(rings, m_boot, cs, cap0=heelp, cap1=tip)
    # shaft
    if shaft_top:
        pts = [V((ank.x, ank.y + 0.004 * s, 0.05 * s)), V((ank.x, ank.y + 0.004 * s, (ank.z + shaft_top) / 2)),
               V((ank.x, ank.y + 0.002 * s, shaft_top))]
        sweep(mb, pts, m_boot, rfn=lambda tt: (shaft_r * s * lerp(0.9, flare, tt ** 1.5) * 1.0,
                                              shaft_r * s * lerp(0.95, flare, tt ** 1.5)), n=12,
              cap0='flat', cap1=None)
        # rolled rim at the top
        if cuff:
            c = V((ank.x, ank.y + 0.002 * s, shaft_top))
            rr = []
            for k in range(6):
                a = TAU * k / 6
                rr.append(c + V((0, 0, math.sin(a) * cuff * 0.6)))
            mbr = MB('cuff')
            ringc = []
            for k in range(7):
                a = TAU * k / 6
                rad = shaft_r * s * flare + cuff * 0.35 + math.cos(a) * cuff * 0.5
                ringc.append(ring(c + V((0, 0, math.sin(a) * cuff * 0.5)), V((1, 0, 0)), V((0, 1, 0)), rad, rad, 14))
            mb.loft(ringc, m_cuff or m_boot, [c] * 7)
    # sole + heel block
    outline = []
    y_back, y_front = ay + heel * s + 0.006 * s, ay - L - 0.004 * s
    yc_, half = (y_back + y_front) / 2, (y_back - y_front) / 2
    for i in range(20):
        a = TAU * i / 20
        ca, sa = math.cos(a), math.sin(a)
        yy = yc_ + sa * half
        ww = width * s * 1.1 * (0.86 if sa > 0.4 else 1.0)
        outline.append((spow(ca, 0.8) * ww, yy))
    rings = []
    for z in (0.0, sole_t * s):
        rings.append([P(u, v, z) for u, v in outline])
    cs = [P(0, yc_, 0), P(0, yc_, sole_t * s)]
    mb.loft(rings, m_sole, cs, cap0='flat', cap1='flat')
    if tab and shaft_top:
        tb = V((ank.x, ank.y + shaft_r * s * flare * 0.9 + 0.004 * s, shaft_top - 0.012 * s))
        el = MB('tab')
        ellipsoid(mb, tb, (0.012 * s, 0.006 * s, 0.018 * s), m_sole, 8, 6)
    return mb.build(angle=55)
