"""Starline characters: build, rig, animate and export every rigged human + Tamo.

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_characters.py [-- --only mika,tamo]
      [--no-portraits] [--portraits-only] [--no-blend]

Outputs public/models/<name>.glb, public/portraits/<name>.webp (Cycles GPU) and the editable
art/blender/source/characters.blend. Contracts: art/CONTRACTS.md ("Rigged assets", "Humanoid rig").
"""
import sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector, Matrix, Quaternion, Euler
from kit import reset, mat, save_kit, OUT, ROOT
from rig import skin, export_rigged
from human_lib import *
from char_parts import *
from garments import *
import anims

V = Vector
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    if name in ARGS:
        i = ARGS.index(name)
        return ARGS[i + 1] if i + 1 < len(ARGS) and not ARGS[i + 1].startswith('--') else True
    return default


ORDER = ['mika', 'tamo', 'genzo', 'rin', 'ota', 'hana', 'villager-man', 'villager-woman', 'villager-kid']
ONLY = [s.strip() for s in arg('--only', ','.join(ORDER)).split(',') if s.strip()]
AO = dict(rays=64, distance=0.22, strength=0.6, ground=0.0)

# ================================================================ Mika


def build_mika():
    reset()
    M = dict(
        skin=mat('Skin', '#f6c29c', .52), hair=mat('Hair', '#3e2419', .4), eye=mat('Eye white', '#f6f3ec', .16),
        iris=mat('Iris', '#c9812f', .22), dark=mat('Dark', '#241c27', .42), coat=mat('Raincoat', '#f2b53a', .34),
        scarf=mat('Scarf', '#d8342c', .8), boots=mat('Boots', '#3c9c47', .32), leather=mat('Leather', '#7b4a2b', .58),
        brass=mat('Brass', '#e0ac45', .28, .85))
    M['lash'] = M['dark']
    b = Body(1.45, arm_out=14.0, sh_x=0.145, sh_z=1.0, upper=0.2, fore=0.185, hand=0.08)
    c = b.head_c
    b.extra = [
        ('scarf_1', (0.035, 0.085, 1.045), (0.05, 0.135, 0.92), 'neck'),
        ('scarf_2', (0.05, 0.135, 0.92), (0.06, 0.15, 0.78), 'scarf_1'),
        ('hair_1', (0, 0.06, 1.33), (0, 0.13, 1.18), 'head'),
    ]
    parts = []

    # ---- head, face
    hd = Head(c, head_sdf(c), M['skin'], seg=28, rings=21)
    parts.append(weigh(hd.ob, 'head'))
    f = Face(hd, M)
    f.eyes(az=24, el=-8, w=0.021, h=0.026, lashes=2, brow=M['hair'], brow_el=11, brow_arch=0.005, tilt=3,
           iris_w=0.84, iris_h=1.0, iris_dv=0.08, pupil=(0.36, 0.48), top=0.84)
    f.mouth(el=-28, w=0.016, smile=0.004, open_=0.006, m=M['dark'])
    parts.append(weigh(f.build(), 'head'))
    parts.append(weigh(nose(hd, M['skin'], el=-16, size=(0.0105, 0.009, 0.0085), off=-0.005, seg=10), 'head'))
    neck = limb([V((0, 0.006, b.neck_z - 0.03)), V((0, 0.008, c.z - 0.08))], M['skin'], lambda t: 0.043, n=12,
                name='neck', cap0='flat', cap1='flat')
    parts.append(weigh(neck, neck_weights(b)))

    # ---- hair: dark bob with chunky locks, side parting, star clip
    def hairline(az):
        a = abs(((az + 180) % 360) - 180)
        return interp([(0, 33), (40, 30), (70, 4), (100, -20), (140, -32), (180, -36)], a)
    cap = hair_cap(hd, M['hair'], hairline, off=0.008, seg=22, rows=7)
    parts.append(weigh(cap, 'head'))
    locks = MB('locks')
    hc = hd.c
    import random
    rnd = random.Random(4)
    # back and side locks: voluminous bob, tips curling under at the jaw line, varied lengths
    back_az = [64, 81, 98, 115, 132, 149, 166, 180, 194, 211, 228, 245, 262, 279, 296]
    flick = {98: 1, 245: 1, 279: 1}
    for i, az in enumerate(back_az):
        a = abs(((az + 180) % 360) - 180)
        end_el = interp([(60, -36), (100, -42), (140, -42), (180, -40)], a) + (4 if i % 2 else -3) + rnd.uniform(-2, 2)
        j = rnd.uniform(-5, 5)
        keys = [(az * 0.3, 86, 0.006), (az + j * .3, 58, 0.02), (az + j * .6, 22, 0.034),
                (az + j, -12, 0.046), (az + j, end_el + 8, 0.05)]
        pts = lock_path(hd, keys)
        inward = (V((hc.x, hc.y, pts[-1].z)) - pts[-1]).normalized()
        if az in flick:
            pts.append(pts[-1] + V((0, 0, -0.026)) - inward * 0.004)
            pts.append(pts[-1] - inward * 0.022 + V((0, 0, -0.004)))
        else:
            pts.append(pts[-1] + V((0, 0, -0.028)) + inward * 0.008)
            pts.append(pts[-1] + inward * 0.03 + V((0, 0, 0.004)))
        lock(locks, pts, M['hair'], width=0.064, thick=0.032, head_c=hc, n=8, samples=9, flat_in=0.5,
             wfn=lambda t: 0.6 + 0.4 * math.sin(math.pi * min(1, t * 1.2)) - 0.55 * max(0, t - 0.78) / 0.22,
             tfn=lambda t: 1.0 - 0.45 * t)
    # crown cowlick: short locks swirling back from the crown
    for az0, ln in ((150, 0.8), (190, 0.9), (215, 0.7)):
        keys = [(az0 - 40, 88, 0.012), (az0, 72, 0.034), (az0 + 10, 58, 0.044), (az0 + 14, 48, 0.034)]
        lock(locks, lock_path(hd, keys), M['hair'], width=0.05 * ln, thick=0.024, head_c=hc, n=8, samples=6,
             flat_in=0.5)
    # face-framing locks in front of the ears
    for sx in (1, -1):
        for k, (az, endaz, ln) in enumerate(((56, 46, -38), (42, 36, -26))):
            keys = [(sx * az * 0.4, 82, 0.008), (sx * (az + 4), 48, 0.022), (sx * (az + 6), 12, 0.03),
                    (sx * (endaz + 8), ln + 12, 0.032), (sx * endaz, ln, 0.022)]
            pts = lock_path(hd, keys)
            pts.append(pts[-1] + V((-sx * 0.004, -0.01, -0.016)))
            lock(locks, pts, M['hair'], width=0.052 - k * 0.008, thick=0.022, head_c=hc, n=8, samples=9)
    # full fringe falling from a side parting
    part_az = -30
    tips = [(-54, 8, 0.05), (-40, 14, 0.056), (-25, 16, 0.058), (-10, 14, 0.058), (5, 16, 0.058), (20, 15, 0.056),
            (34, 18, 0.054), (48, 12, 0.05)]
    for i, (az, el, w) in enumerate(tips):
        r0 = part_az + rnd.uniform(-3, 3)
        sweep_dir = 1 if az > part_az else -1
        keys = [(r0, 80, 0.008), (lerp(r0, az, 0.45), 64, 0.026), (lerp(r0, az, 0.85), 42, 0.03),
                (az, el + 9, 0.024), (az + sweep_dir * 5, el, 0.012)]
        pts = lock_path(hd, keys)
        lock(locks, pts, M['hair'], width=w, thick=0.024, head_c=hc, n=8, samples=8, flat_in=0.65,
             wfn=lambda t: 0.72 + 0.28 * math.sin(math.pi * t) - 0.7 * max(0, t - 0.68) / 0.32)
    lk = radial_normals(locks.build('locks', angle=180), hd.c + V((0, 0.01, -0.02)), 0.5)

    def hair_w(co):
        t = sstep(c.z + 0.06, c.z - 0.12, co.z) * sstep(c.y - 0.02, c.y + 0.1, co.y)
        return blend2('head', 'hair_1', t * 0.8)
    parts.append(weigh(lk, hair_w))
    # star hair clip on the left above the ear
    star = MB('clip')
    sp = hd.pt(70, 24, 0.062)
    sd = hd.dir(70, 24)
    X = sd.cross(V((0, 0, 1))).normalized()
    Y = sd.cross(X).normalized()
    pts = []
    for k in range(10):
        a = math.pi / 2 + TAU * k / 10
        r = 0.026 if k % 2 == 0 else 0.012
        pts.append((r * math.cos(a), r * math.sin(a)))
    top = [sp + X * u + Y * v + sd * 0.006 for u, v in pts]
    bot = [sp + X * u * 0.9 + Y * v * 0.9 - sd * 0.002 for u, v in pts]
    ct, cb = star.vert(sp + sd * 0.012), star.vert(sp - sd * 0.003)
    it = [star.vert(p) for p in top]
    ib = [star.vert(p) for p in bot]
    for k in range(10):
        star.face([it[k], it[(k + 1) % 10], ct], M['brass'], out=sd)
        star.face([ib[k], cb, ib[(k + 1) % 10]], M['brass'], out=-sd)
        star.face([it[k], ib[k], ib[(k + 1) % 10], it[(k + 1) % 10]], M['brass'], inside=sp)
    parts.append(weigh(star.build('clip', flat=True), 'head'))

    # ---- raincoat
    ck = [(0.44, 0.214, 0.16, 0.17), (0.53, 0.2, 0.15, 0.16), (0.63, 0.183, 0.14, 0.148), (0.74, 0.166, 0.132, 0.138),
          (0.84, 0.156, 0.127, 0.131), (0.92, 0.153, 0.122, 0.127), (0.975, 0.148, 0.112, 0.118),
          (1.015, 0.128, 0.096, 0.104), (1.045, 0.094, 0.076, 0.082), (1.07, 0.062, 0.058, 0.06)]

    def fold(z, ang):
        # soft vertical folds in the skirt, fading out toward the chest
        k = sstep(0.75, 0.46, z)
        return 1 + k * 0.022 * math.sin(ang * 7 + 0.6) + k * 0.012 * math.sin(ang * 13)
    zs = dense(0.44, 1.07, 22)
    rings, cs = torso_rings(ck, 30, zs, e=2.3, fn=fold)
    coat = MB('coat')
    # inner turned hem (thickness when seen from below)
    inner = [[cs[0] + (p - cs[0]) * 0.93 + V((0, 0, 0.035)) for p in rings[0]]]
    coat.loft(inner + rings, M['coat'], [cs[0] + V((0, 0, 0.035))] + cs)
    coat_ob = coat.build('coat', angle=60)
    csurf = Surface([coat_ob])
    parts.append(weigh(coat_ob, torso_weights(b, skirt=0.6, skirt_top=0.64)))
    # hem band
    parts.append(weigh(ring_band((0, 0.004, 0.452), 0.214, 0.165, 0.011, M['coat'], 22, 'hem', squash=1.0, sides=8),
                       torso_weights(b, skirt=0.6, skirt_top=0.64)))
    # placket + toggles
    pl = surface_strip(csurf, [V((0.022, -0.2, z)) for z in (1.04, 0.9, 0.75, 0.6, 0.47)], M['coat'], 0.03, 0.006,
                       name='placket', out_ref=(0, 0, 0.8))
    parts.append(weigh(pl, torso_weights(b, skirt=0.6, skirt_top=0.64)))
    tog = MB('toggles')
    for z in (0.93, 0.8, 0.67):
        loc, nrm = csurf.nearest(V((0.01, -0.2, z)))
        base = loc + nrm * 0.014
        sweep(tog, [base + V((-0.024, 0, 0)), base + V((0.024, 0, 0.002))], M['leather'],
              rfn=lambda t: 0.0085 * (1 - 0.25 * abs(t - 0.5) * 2), n=10, cap0='round', cap1='round')
        # cord loop
        lp = [base + V((0.02, 0, 0)) + V((0.02 * math.cos(a), -0.003, 0.009 * math.sin(a)))
              for a in [math.radians(x) for x in range(-150, 151, 50)]]
        sweep(tog, lp, M['dark'], radius=0.0028, n=5, cap0='round', cap1='round')
    parts.append(weigh(tog.build('toggles'), torso_weights(b, skirt=0.6, skirt_top=0.64)))
    # pockets with flaps
    for sx in (1, -1):
        pk = patch(csurf, (0, 0, 0.6), (sx * 0.62, -1, -0.05), rounded_rect(0.085, 0.075, 0.012), M['coat'],
                   lift=0.005, name='pocket')
        parts.append(weigh(pk, torso_weights(b, skirt=0.6, skirt_top=0.64)))
        fl = patch(csurf, (0, 0, 0.65), (sx * 0.64, -1, 0.0), rounded_rect(0.095, 0.032, 0.008, cv=0.0),
                   M['coat'], lift=0.011, name='flap')
        parts.append(weigh(fl, torso_weights(b, skirt=0.6, skirt_top=0.64)))
    # back half-belt with two brass buttons, and a centre vent seam
    hb = surface_strip(csurf, [V((x, 0.3, 0.775)) for x in (-0.115, -0.05, 0.0, 0.05, 0.115)], M['coat'], 0.036,
                       0.007, off=0.004, name='halfbelt', out_ref=(0, 0, 0.78), samples=12)
    parts.append(weigh(hb, torso_weights(b)))
    btn = MB('buttons')
    for x in (-0.085, 0.085):
        loc, nrm = csurf.nearest(V((x, 0.3, 0.775)))
        p0 = loc + nrm * 0.012
        ellipsoid(btn, p0, (0.011, 0.011, 0.011), M['brass'], 8, 5, fn=lambda d: 1.0 if d.dot(nrm) > -0.2 else 0.6)
    parts.append(weigh(btn.build('buttons'), torso_weights(b)))
    vent = surface_strip(csurf, [V((0.0, 0.3, z)) for z in (0.6, 0.53, 0.46)], M['coat'], 0.012, 0.004, off=0.002,
                         name='vent', out_ref=(0, 0, 0.55), samples=6)
    parts.append(weigh(vent, torso_weights(b, skirt=0.6, skirt_top=0.64)))
    # hood lying on the upper back, red lining showing at the rim
    hood = MB('hood')
    ellipsoid(hood, (0, 0.132, 0.97), (0.125, 0.055, 0.105), M['coat'], 16, 10,
              M=Matrix.Rotation(math.radians(-14), 3, 'X'))
    ellipsoid(hood, (0, 0.118, 1.015), (0.1, 0.04, 0.06), M['scarf'], 12, 6,
              M=Matrix.Rotation(math.radians(-30), 3, 'X'))
    hood_ob = hood.build('hood')
    parts.append(weigh(hood_ob, 'chest'))
    rim = MB('hoodrim')
    rp = [V((0.1, 0.03, 1.035)), V((0.105, 0.09, 1.04)), V((0.06, 0.15, 1.04)), V((0, 0.165, 1.04)),
          V((-0.06, 0.15, 1.04)), V((-0.105, 0.09, 1.04)), V((-0.1, 0.03, 1.035))]
    sweep(rim, catmull(rp, 2), M['coat'], radius=0.022, n=8, cap0='round', cap1='round')
    parts.append(weigh(rim.build('hoodrim'), 'chest'))

    # ---- sleeves (shoulder ball + tube + turned-back cuff), hands
    for s in 'LR':
        sh, el, wr = (getattr(b, k + '_' + s) for k in ('sh', 'el', 'wr'))
        fd = (wr - el).normalized()
        pts = [sh + (sh - el).normalized() * 0.005, sh.lerp(el, 0.5), el, el.lerp(wr, 0.5), wr - fd * 0.03]

        def sfold(t, ang, s=s):
            k = math.exp(-((t - 0.5) / 0.12) ** 2)
            return 1 + 0.06 * k * math.sin(ang * 3 + 1.0) + 0.03 * math.sin(ang * 5 + t * 9)
        sl = limb(pts, M['coat'], lambda t: interp([(0, 0.057), (0.35, 0.053), (0.5, 0.05), (0.8, 0.049), (1, 0.053)], t),
                  n=12, name='sleeve', cap0='round', cap1=None, fold=sfold, per=2)
        parts.append(weigh(sl, arm_weights(s, b)))
        ball = MB('shoulder')
        ellipsoid(ball, sh + V((-0.006 if s == 'L' else 0.006, 0, -0.002)), (0.053, 0.054, 0.052), M['coat'], 10, 6)
        parts.append(weigh(ball.build('shoulder'), {'upperarm_' + s: 0.8, 'chest': 0.2}))
        cuff = limb([wr - fd * 0.045, wr - fd * 0.005], M['coat'], lambda t: 0.061 - 0.004 * t, n=14, name='cuff',
                    cap0='flat', cap1='flat')
        parts.append(weigh(cuff, 'forearm_' + s))
        hnd = hand(b, s, M['skin'], curl=0.55 if s == 'R' else 0.32, grip=(s == 'R'), s=1.1, n=6)
        parts.append(weigh(hnd, 'hand_' + s))

    # ---- legs: shorts, knees, shins, boots
    for s in 'LR':
        hip, knee, ank = (getattr(b, k + '_' + s) for k in ('hip', 'knee', 'ank'))
        leg = limb([hip + V((0, 0, 0.02)), hip.lerp(knee, 0.5), knee, knee.lerp(ank, 0.5), ank + V((0, 0, 0.04))],
                   M['skin'], lambda t: interp([(0, 0.064), (0.4, 0.058), (0.5, 0.053), (0.75, 0.05), (1, 0.044)], t),
                   n=10, name='leg')
        parts.append(weigh(leg, leg_weights(s, b)))
        kc = MB('knee')
        ellipsoid(kc, knee + V((0, -0.022, 0.006)), (0.036, 0.026, 0.04), M['skin'], 8, 6)
        parts.append(weigh(kc.build('knee'), {'thigh_' + s: 0.35, 'shin_' + s: 0.65}))
        sh_ = limb([hip + V((0, 0, 0.05)), hip.lerp(knee, 0.42)], M['dark'], lambda t: 0.066 + 0.004 * t, n=14,
                   name='shorts', cap0='round', cap1='flat')
        parts.append(weigh(sh_, leg_weights(s, b)))
        bt = boot(b, s, M['boots'], M['dark'], shaft_top=0.31, shaft_r=0.05, width=0.05, cuff=0.012, flare=1.14)
        parts.append(weigh(bt, leg_weights(s, b)))

    # ---- scarf: two wraps, knot, short front end, long trailing end (scarf_1/2)
    sc = MB('scarf')
    for zz, a_, b_, tilt in ((1.052, 0.083, 0.078, 6), (1.083, 0.074, 0.07, -5)):
        ob = ring_band((0, 0.004, zz), a_, b_, 0.026, M['scarf'], 20, 'wrap', squash=0.85, sides=8,
                       tilt=Matrix.Rotation(math.radians(tilt), 3, 'X'))
        parts.append(weigh(ob, neck_weights(b)))
    kn = MB('knot')
    ellipsoid(kn, (0.045, -0.07, 1.04), (0.03, 0.022, 0.028), M['scarf'], 10, 6)
    front = [V((0.045, -0.078, 1.03)), V((0.05, -0.1, 0.98)), V((0.052, -0.118, 0.92)), V((0.05, -0.124, 0.87))]
    sweep(kn, catmull(front, 3), M['scarf'], rfn=lambda t: (0.028 - 0.002 * t, 0.009), n=10,
          up_fn=lambda p, T: V((0, -1, 0)), e=3.0, cap0='round', cap1='flat')
    parts.append(weigh(kn.build('knot'), 'chest'))
    tail = MB('scarftail')
    tp = [V((0.035, 0.07, 1.06)), V((0.045, 0.125, 1.03)), V((0.05, 0.19, 0.97)), V((0.055, 0.2, 0.9)),
          V((0.06, 0.19, 0.83)), V((0.065, 0.185, 0.78))]
    sweep(tail, catmull(tp, 3), M['scarf'], rfn=lambda t: (0.032 - 0.004 * t, 0.009), n=10,
          up_fn=lambda p, T: V((0, 1, 0.3)), e=3.0, cap0='round', cap1='flat')
    # fringe at the end
    for k in range(4):
        x = 0.065 + (k - 1.5) * 0.014
        sweep(tail, [V((x, 0.185, 0.785)), V((x + 0.002, 0.187, 0.752))], M['scarf'], radius=0.005, n=5)
    tob = tail.build('scarftail')

    def scarf_w(co):
        if co.z > 1.0:
            return blend2('neck', 'scarf_1', (1.05 - co.z) / 0.05)
        return blend2('scarf_1', 'scarf_2', (0.93 - co.z) / 0.06)
    parts.append(weigh(tob, scarf_w))

    # ---- satchel on the left-back hip, strap across the body
    bag = MB('bag')
    bc = V((0.175, 0.105, 0.66))
    rot = Matrix.Rotation(math.radians(38), 3, 'Z')
    from kit import box
    bx = box('bagbox', (0.05, 0.15, 0.13), bc, M['leather'], bevel=0.018)
    bx.rotation_euler = (0, 0, math.radians(38))
    fl = box('bagflap', (0.012, 0.155, 0.08), bc + rot @ V((0.028, 0, 0.03)), M['leather'], bevel=0.006)
    fl.rotation_euler = (0, 0, math.radians(38))
    bk = box('buckle', (0.008, 0.028, 0.022), bc + rot @ V((0.036, 0, 0.0)), M['brass'], bevel=0.003)
    bk.rotation_euler = (0, 0, math.radians(38))
    for o in (bx, fl, bk):
        bpy.context.view_layer.update()
        from kit import apply_transform
        apply_transform(o)
        parts.append(weigh(o, 'hips'))
    strap_f = [V((-0.1, -0.03, 1.05)), V((-0.05, -0.12, 0.96)), V((0.05, -0.135, 0.84)), V((0.14, -0.12, 0.73)),
               V((0.18, 0.02, 0.7))]
    strap_b = [V((-0.1, 0.03, 1.05)), V((-0.03, 0.13, 0.94)), V((0.08, 0.15, 0.81)), V((0.16, 0.12, 0.72))]
    for nm, sp in (('strapF', strap_f), ('strapB', strap_b)):
        st = surface_strip(csurf, sp, M['leather'], 0.028, 0.005, off=0.007, name=nm, out_ref=(0, 0, 0.85),
                           samples=16)
        parts.append(weigh(st, torso_weights(b)))

    k = normalize_height(parts, b, 1.45)
    arm = make_armature('Mika', b)
    body = skin(parts, arm, 'Mika', ao=AO)
    smooth_colors(body, 3, {'Skin'})
    face_tints(body, hd, k, blush=0.7)
    anims.humanoid_clips(arm, b, 'mika', ['Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Land', 'Aim', 'Point', 'Cast', 'Reel',
                                          'Interact', 'Stir', 'Hammer', 'Cheer', 'Talk', 'Wave'],
                         scarf=True, hair=True, wave_side='L', energy=1.0)
    return export_rigged('mika', arm)


# ================================================================ Tamo


def build_tamo():
    """Plump five-point star (0.42 m across), origin at its centre; bones root/body/arm_L/arm_R."""
    reset()
    M = dict(glow=mat('Tamo glow', '#ffc93a', .34, emit=0.55, emit_color='#ffb52e'),
             eye=mat('Tamo eye', '#2a1d2e', .2), shine=mat('Tamo shine', '#fffaf0', .15, emit=0.6),
             blush=mat('Tamo blush', '#ff8f7a', .5, emit=0.35, emit_color='#ff7a66'))
    R_out, R_in = 0.21, 0.126
    N = 70

    def edge(th):
        # rounded fat points: soft peaks, tip at +Z (th = 90 deg)
        a = (th - math.pi / 2) % (TAU / 5)
        a = min(a, TAU / 5 - a) / (TAU / 10)  # 0 at tip, 1 between tips
        f = (1 - a) ** 1.6
        tipround = 1 - 0.09 * math.exp(-(a / 0.2) ** 2)
        return (R_in + (R_out - R_in) * f) * tipround

    thick = 0.085
    mb = MB('tamo')
    rings_n = 9
    front, back = [], []
    for side, sg in (('f', -1), ('b', 1)):
        rows = []
        for i in range(1, rings_n + 1):
            t = i / rings_n
            row = []
            for j in range(N):
                th = TAU * j / N
                r = edge(th) * t
                x, z = r * math.cos(th), r * math.sin(th)
                y = sg * thick * math.sqrt(max(0.0, 1 - t ** 2.2)) * (0.9 + 0.1 * (edge(th) / R_out))
                row.append(V((x, y, z)))
            rows.append(row)
        (front if side == 'f' else back).extend(rows)
    ids_f = [[mb.vert(p) for p in r] for r in front]
    ids_b = [[mb.vert(p) for p in r] for r in back[:-1]] + [ids_f[-1]]
    cf, cb = mb.vert((0, -thick, 0)), mb.vert((0, thick, 0))
    for ids, c, out in ((ids_f, cf, V((0, -1, 0))), (ids_b, cb, V((0, 1, 0)))):
        for j in range(N):
            mb.face([c, ids[0][j], ids[0][(j + 1) % N]], M['glow'], out=out)
        for a_, b_ in zip(ids, ids[1:]):
            for j in range(N):
                q = [a_[j], a_[(j + 1) % N], b_[(j + 1) % N], b_[j]]
                pts = [mb.V[i] for i in q]
                cc = sum(pts, V()) / 4
                mb.face(q, M['glow'], out=V((cc.x, out.y * 0.6, cc.z)))
    body = mb.build('tamo body', angle=180)
    surf = Surface([body])
    parts = []

    # arms: stubby nubs on the upper side points
    arms = {}
    for S, sx in (('L', 1), ('R', -1)):
        th = math.pi / 2 - sx * TAU / 5
        tip = V((math.cos(th), 0, math.sin(th))) * (R_out * 0.93)
        base = V((math.cos(th), 0, math.sin(th))) * (R_out * 0.6)
        am = MB('arm_' + S)
        d = (tip - base).normalized()
        hand_c = tip + d * 0.02 + V((0, -0.035, -0.01))
        sweep(am, [tip - d * 0.02 + V((0, -0.04, 0)), tip + V((0, -0.05, -0.005)), hand_c], M['glow'],
              rfn=lambda t: 0.024 - 0.004 * t, n=10, cap0='round', cap1='round')
        ellipsoid(am, hand_c + d * 0.006, (0.026, 0.024, 0.026), M['glow'], 12, 8)
        arms[S] = (base, tip, am.build('arm_' + S, angle=180))

    def body_w(co):
        w = {'body': 1.0}
        for S, (base, tip, _) in arms.items():
            d = (tip - base).normalized()
            t = (V((co.x, 0, co.z)) - base).dot(d) / (tip - base).length
            if t > 0:
                f = smooth(t) * 0.85
                return {'body': 1 - f, 'arm_' + S: f}
        return w
    parts.append(weigh(body, body_w))
    for S, (base, tip, ob) in arms.items():
        parts.append(weigh(ob, 'arm_' + S))
    # face: big glossy eyes with two highlights, blush, tiny smile
    face = MB('tamo face')
    for sx in (1, -1):
        d = Decal(surf, V((0, 0, 0)), V((sx * 0.052, -0.08, 0.012)))
        d.fill(face, ellipse_pts(0, 0, 0.022, 0.03, 20), M['eye'], lift=0.002, rings=2, dome=0.004)
        d.fill(face, ellipse_pts(-0.007, 0.011, 0.009, 0.011, 12), M['shine'], lift=0.006, rings=1, dome=0.004)
        d.fill(face, ellipse_pts(0.008, -0.013, 0.004, 0.004, 8), M['shine'], lift=0.006, rings=1, dome=0.004)
        b_ = Decal(surf, V((0, 0, 0)), V((sx * 0.1, -0.08, -0.03)))
        b_.fill(face, ellipse_pts(0, 0, 0.019, 0.011, 14), M['blush'], lift=0.0015, rings=1)
    md = Decal(surf, V((0, 0, 0)), V((0, -0.08, -0.028)))
    mouth = []
    for j in range(12):
        a = math.pi + math.pi * j / 11
        mouth.append((0.011 * math.cos(a), 0.009 * math.sin(a) + 0.002))
    md.fill(face, _ccw_pts(mouth), M['eye'], lift=0.0015, rings=1)
    parts.append(weigh(face.build('tamo face', angle=80), 'body'))
    from rig import build_armature
    arm = build_armature('Tamo', [
        ('root', (0, 0, 0), (0, 0, 0.08), None),
        ('body', (0, 0, -0.05), (0, 0, 0.12), 'root'),
        ('arm_L', tuple(arms['L'][0]), tuple(arms['L'][1]), 'body'),
        ('arm_R', tuple(arms['R'][0]), tuple(arms['R'][1]), 'body'),
    ])
    skin(parts, arm, 'Tamo', ao=dict(rays=32, distance=0.06, strength=0.35))
    anims.tamo_clips(arm)
    return export_rigged('tamo', arm)


def _ccw_pts(pts):
    a = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    return pts if a > 0 else pts[::-1]


BUILDERS = {'mika': build_mika, 'tamo': build_tamo}
import npcs
BUILDERS.update(npcs.BUILDERS)


def main():
    t0 = time.time()
    results = {}
    if not arg('--portraits-only'):
        for name in ORDER:
            if name in ONLY and name in BUILDERS:
                t = time.time()
                results[name] = BUILDERS[name]()
                print(f'BUILT {name} in {time.time() - t:.1f}s')
    print('DONE', {k: (v['tris'], v['bytes'] // 1024) for k, v in results.items()}, f'{time.time() - t0:.1f}s')
    if not arg('--no-portraits'):
        import portraits
        portraits.run([n for n in ONLY if n in portraits.SETUP])
    if not arg('--no-blend'):
        save_blend([n for n in ORDER if os.path.exists(os.path.join(OUT, n + '.glb'))])


def save_blend(names, spacing=1.2):
    """Editable source: every exported character side by side (30 fps, actions intact), compressed."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30
    x = 0.0
    for name in names:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + '.glb'))
        new = [o for o in bpy.data.objects if o not in before]
        col = bpy.data.collections.new(name)
        sc.collection.children.link(col)
        bpy.context.view_layer.update()
        xs = [(o.matrix_world @ Vector(c)).x for o in new if o.type == 'MESH' and not o.name.startswith('Icosphere')
              for c in o.bound_box] or [0]
        for o in new:
            for c in list(o.users_collection):
                c.objects.unlink(o)
            col.objects.link(o)
            if o.parent is None:
                o.location.x += x - min(xs)
        x += (max(xs) - min(xs)) + spacing
    path = os.path.join(ROOT, 'art', 'blender', 'source', 'characters.blend')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print('SAVED', path)


main()
