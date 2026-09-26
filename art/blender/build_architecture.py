"""Architecture family for Starline (Hoshi Valley).

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_architecture.py [-- --only a,b] [--no-save]

Builds every model of the "Architecture" table in art/CONTRACTS.md into public/models/<name>.glb and collects
them in art/blender/source/architecture.blend. Shared modelling (tiled roofs, walls with openings, stone work,
windows, doors, dressing) lives in arch_lib.py.

Kawabe (west bank): dark timber frames, white plaster over charred-cedar boards, red-brown kawara roofs.
Takamori (east hill): white clapboard, teal / green roofs, mustard trims, brick chimneys, flower boxes.
One wood material serves dark structural timber (tint WOOD_DARK) and light planks (tint 1.0); stone is
painted from the plaster material with a grey tint, which keeps each asset within 8 materials.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import kit
import arch_lib
from arch_lib import *
from arch_lib import _append_colored
from mathutils import Vector, Matrix

ORDER = ['signal-cottage', 'mill', 'drawbridge', 'star-lamp', 'kawabe-house-a', 'kawabe-house-b', 'boathouse',
         'kawabe-shop', 'belltower', 'bakery', 'takamori-house-a', 'takamori-house-b', 'station', 'platform',
         'engine-shed', 'shrine', 'torii', 'stone-lantern', 'shrine-stairs']
BUILD = {}


def builder(name):
    def deco(fn):
        BUILD[name] = fn
        return fn
    return deco

# ---------------------------------------------------------------- palette


def M_plaster():
    return mat('Plaster', '#f3ead6', rough=.85)


def M_wood():
    return mat('Wood', '#9a6438', rough=.68)


def M_kroof():
    return mat('Roof tile', '#a8432c', rough=.42)


def M_leaf():
    return mat('Leaf', '#62a13a', rough=.7)


def M_brass():
    return mat('Brass', '#d9a441', rough=.32, metal=.8)


def M_red():
    return mat('Signal red', '#d8342c', rough=.4)


def dark(k=1.0):
    return WOOD_DARK * k


def under_fn(slopes, face, thick, d=0.0, step=.3, u0=0., u1=1., margin=.01):  # step: sampling of the gable top
    """Callable u -> roof underside z along a wall face (for gable tops)."""
    def zat(u):
        p = face.p(u, 0, d)
        p2 = V((p.x, p.y))
        best = None
        for s in slopes:
            if all((s.poly[(i + 1) % len(s.poly)] - s.poly[i]).cross(p2 - s.poly[i]) >= -1e-6 for i in range(len(s.poly))):
                z = s.z(p2) - thick - margin
                best = z if best is None else min(best, z)
        return best if best is not None else 0.0
    f = zat
    n = max(2, int((u1 - u0) / step))
    f.breaks = [u0 + (u1 - u0) * i / n for i in range(1, n)]
    return f


def footing(mb, x, y, top, w, rng, tint=None, tag='footings', rot=0.):
    """Foundation stone under a post: visible dressed top, hidden body down to z=-0.8."""
    stone(mb, (x, y, (top - .8) / 2), (w, w, top + .8), rot, rng, tint=tint or stone_tint(rng, 1.05), tag=tag, ch=.035)


def span_under(top, L, z, clear=.04, n=80):
    """u-range along a gable face where the roof underside (top) stays above z + clear."""
    us = [L * i / n for i in range(n + 1)]
    ok = [u for u in us if top(u) >= z + clear]
    return (min(ok), max(ok)) if ok else None


def collar(face, mb, top, L, z, h=.14, tint=None, tag='gable timber'):
    sp = span_under(top, L, z + h / 2)
    if sp and sp[1] - sp[0] > .2:
        face.box(mb, (sp[0] + sp[1]) / 2, z, .035, sp[1] - sp[0], h, .1, ch=.015, tint=tint if tint is not None else dark(),
                 tag=tag)


def rails_between(face, wm, posts, z, h, holes, d=.02, depth=.08, tint=WOOD_DARK, post_w=.18, tag='rail', ch=0.):
    """Horizontal rail at height z spanning between posts, split around openings it crosses."""
    posts = sorted(posts)
    for a, b in zip(posts, posts[1:]):
        segs = [(a + post_w / 2, b - post_w / 2)]
        for hu0, hu1, hz0, hz1 in holes:
            if hz0 < z + h / 2 - 1e-4 and hz1 > z - h / 2 + 1e-4:
                new = []
                for s0, s1 in segs:
                    if hu1 <= s0 or hu0 >= s1:
                        new.append((s0, s1))
                    else:
                        if hu0 - .06 > s0:
                            new.append((s0, hu0 - .06))
                        if hu1 + .06 < s1:
                            new.append((hu1 + .06, s1))
                segs = new
        for s0, s1 in segs:
            if s1 - s0 > .05:
                face.box(wm, (s0 + s1) / 2, z, d, s1 - s0, h, depth, ch=ch, tint=tint, tag=tag)


def timber_wall(A, face, L, z0, z1, holes, plaster, wood, posts, rails, board_top=None, post_w=.18, rail_h=.14,
                rng=None, post_ext=(0., 0.), board_tint=.42):
    """Kawabe wall: plaster panel (and charred-cedar boards below board_top) framed by dark posts and rails."""
    pm, wm = A.mb(plaster), A.mb(wood)
    if board_top:
        boards_v(wm, face, 0, L, z0, board_top, w=.26, holes=holes, rng=rng, base=board_tint, var=.2, groove=.014,
                 tag='cedar boards')
        panel(pm, face, 0, L, board_top, z1, holes, tag='plaster')
    else:
        panel(pm, face, 0, L, z0, z1, holes, tag='plaster')
    for u in posts:
        face.box(wm, u, (z0 - post_ext[0] + z1 + post_ext[1]) / 2, .035, post_w, z1 - z0 + post_ext[0] + post_ext[1],
                 .11, ch=.02, tint=dark(.95 + .1 * ((u * 13) % 1)), tag='posts')
    for z in rails:
        rails_between(face, wm, posts, z, rail_h, holes, post_w=post_w)

# ---------------------------------------------------------------- signal cottage


@builder('signal-cottage')
def build_signal_cottage():
    A = Asset('signal-cottage', 'Signal cottage')
    rng = random.Random(21)
    P, W, R, G, B, RED = M_plaster(), M_wood(), M_kroof(), M_leaf(), M_brass(), M_red()
    WG = window_glow()
    PG = glow('Porch glass', '#f3dca0', '#ffc45a', rough=.15)

    X0, X1, Y0, Y1 = -2.5, 2.5, -1.4, 2.4          # timber body
    ZF, ZT = .32, 3.05                              # floor / wall top
    # ---- main roof: gable facing the front (ridge along Y), eaves on +-X
    EO, VO = .45, .5                                # eave / verge overhang
    pitch = .7
    D = (X1 - X0) / 2 + EO
    roof = Roof(0, pitch, D, sag=.2)
    thick = ROOF_STYLES['kawara']['thick']
    roof.eave_z = ZT + thick + .02 - roof.g(EO)
    ya, yb = Y0 - VO, Y1 + VO
    left = Slope(roof, [(X0 - EO, yb), (X0 - EO, ya), (0, ya), (0, yb)], (X0 - EO, yb), (X0 - EO, ya),
                 ['eave', 'verge', 'ridge', 'verge'])
    right = Slope(roof, [(X1 + EO, ya), (X1 + EO, yb), (0, yb), (0, ya)], (X1 + EO, ya), (X1 + EO, yb),
                  ['eave', 'verge', 'ridge', 'verge'])
    st = dict(ROOF_STYLES['kawara'], pitch=.46, line_sides=3, cell_mult=2)
    for i, s in enumerate((left, right)):
        tile_slope(A, s, R, st, under_mat=W, fascia_mat=W, seed=3 + i)
        rafters(A, W, s, EO + .02, spacing=.42, w=.075, h=.09, tint=dark(), thick=thick)
    zr = left.z(V((0, 0)))
    path = [V((0, lerp(ya - .04, yb + .04, i / 12), zr + .1 * smoothstep(.72, 1, abs(i / 12 - .5) * 2) ** 1.3))
            for i in range(13)]
    ridge(A, R, path, w=.36, layers=2, tint=.88)
    onigawara(A, R, path[-1] + V((0, .02, -.1)), (0, 1), size=.6)
    # front ridge end: a brass star instead of an oni tile (Sora was a star-lamp keeper)
    for s, xe in ((left, X0 - EO), (right, X1 + EO)):
        for ye, yt in ((ya, ya), (yb, yb)):
            bargeboard(A, W, s, (xe, ye), (0, ye), h=.34, t=.09, tint=dark(), out=V((0, -1 if ye < 0 else 1)))
    star_c = V((0, ya - .1, zr - .32))
    star_outline = []
    for i in range(10):
        a = math.pi / 2 + TAU * i / 10
        rr = .3 if i % 2 == 0 else .13
        star_outline.append((math.cos(a) * rr, math.sin(a) * rr))
    A.mb(B).extrude(star_outline, .06, star_c, tag='star')
    A.mb(W).cyl(star_c + V((0, .06, 0)), .36, .06, n=12, rot=(math.pi / 2, 0, 0), tint=dark(), tag='star')

    # ---- plinth
    plinth(A, P, X0 - .12, X1 + .12, Y0 - .12, Y1 + .12, z_top=ZF - .02, rng=rng, tone=1.0,
           sides='-y+x+y-x', depth=.24, wmin=.5, wmax=.95)

    # ---- walls
    posts_front = [0, 1.85, 3.15, 5.0]
    holes = {
        '-y': [(0.35, 1.45, 1.12, 2.2), (2.025, 2.975, ZF, 2.2), (3.55, 4.65, 1.12, 2.2)],
        '+x': [(1.35, 2.45, 1.12, 2.2)],
        '+y': [(0.6, 1.6, 1.12, 2.2), (3.4, 4.4, 1.12, 2.2)],
        '-x': [(2.35, 3.15, 1.3, 2.2)],
    }
    posts = {'-y': posts_front, '+x': [0, 1.9, 3.8], '+y': [0, 2.5, 5.0], '-x': [0, 1.9, 3.8]}
    faces = {}
    for side in ('-y', '+x', '+y', '-x'):
        f, L = rect_face(X0, X1, Y0, Y1, side)
        faces[side] = (f, L)
        timber_wall(A, f, L, ZF, ZT, holes[side], P, W, posts[side], [ZF + .07, 1.05, 2.28], board_top=1.05,
                    rng=rng, post_ext=(.05, .12))
        # wall-top beam
        f.box(A.mb(W), L / 2, ZT - .09, .04, L + .1, .2, .13, ch=.02, tint=dark(.9), tag='beams')
        if side in ('-y', '+y'):
            top = under_fn([left, right], f, thick, u0=0, u1=L)
            panel(A.mb(P), f, 0, L, ZT, 6.0, [], top=top, tag='gable')
            # gable timber: collar, two studs, short king post above the round window
            collar(f, A.mb(W), top, L, 3.55)
            for su in (L / 2 - .62, L / 2 + .62):
                f.box(A.mb(W), su, (ZT + top(su)) / 2, .035, .14, top(su) - ZT, .1, ch=.015, tint=dark(), tag='gable timber')
            # round attic window
            c = f.p(L / 2, 4.05, .03)
            A.mb(WG).cyl(f.p(L / 2, 4.05, .01), .3, .02, n=12, rot=(math.pi / 2, 0, f.rot), cap=True, tag='attic window')
            A.mb(W).torus(c + f.n * .02, .33, .055, maj=12, mn=4, rot=(math.pi / 2, 0, f.rot), tint=dark(),
                          tag='attic window')
            f.box(A.mb(W), L / 2, 4.05, .045, .04, .6, .03, tint=dark(), tag='attic window')
            f.box(A.mb(W), L / 2, 4.05, .045, .6, .04, .03, tint=dark(), tag='attic window')
    # windows
    for side, hl in holes.items():
        f, L = faces[side]
        for h in hl:
            if h[2] <= ZF + .01:
                continue
            sash(A, f, h, W, WG, A.mb(P), cols=3, rows=2, frame_tint=dark(), casing=W, casing_tint=dark(1.05),
                 sill_mat=W, sill_tint=dark(1.1))
    # front door: signal red panel door with a glazed top light and a brass knob
    ff, Lf = faces['-y']
    panel_door(A, ff, (2.025, 2.975, ZF, 2.2), RED, A.mb(P), leaf_tint=1.0, frame_mat=W, knob_mat=B, glass_mat=WG,
               panels=2)
    ff.box(A.mb(W), 2.5, 2.33, .08, 1.3, .09, .2, ch=.02, tint=dark(), tag='door hood')

    # ---- porch (left two thirds of the front) with its own pent roof
    PX0, PX1, PY0 = -2.55, 1.0, -2.8
    wm = A.mb(W)
    for i in range(9):
        y = Y0 - .08 - i * ((Y0 - PY0 - .1) / 8.6)
        wm.box(((PX0 + PX1) / 2, y, ZF - .03), (PX1 - PX0, .135, .06),
               tint=(.95 - .12 * (i % 2)) * (.92 + .08 * rng.random()), tag='porch deck')
    wm.box(((PX0 + PX1) / 2, PY0 + .04, ZF - .12), (PX1 - PX0 + .06, .1, .2), ch=.02, tint=dark(1.1), tag='porch deck')
    for x in (PX0 + .03, PX1 - .03):
        wm.box((x, (PY0 + Y0) / 2, ZF - .12), (.1, Y0 - PY0, .2), ch=.02, tint=dark(1.1), tag='porch deck')
    fporch = Face((PX0, PY0 + .02, 0), (0, -1, 0))
    boards_v(wm, fporch, 0, PX1 - PX0, -.8, ZF - .22, w=.16, rng=rng, base=.4, tag='porch skirt')
    for xs in (PX0 + .02, PX1 - .02):
        fs_ = Face((xs, Y0, 0), (-1, 0, 0)) if xs < 0 else Face((xs, PY0, 0), (1, 0, 0))
        boards_v(wm, fs_, 0, Y0 - PY0, -.8, ZF - .22, w=.2, rng=rng, base=.4, groove=0, tag='porch skirt')
    post_x = [PX0 + .1, -.75, PX1 - .1]
    PB = 2.03                                          # porch beam bottom
    for x in post_x:
        wm.box((x, PY0 + .1, (ZF + PB) / 2), (.15, .15, PB - ZF), ch=.025, tint=dark(1.05), tag='porch posts')
        A.mb(P).box((x, PY0 + .1, ZF - .02), (.26, .26, .08), ch=.03, tint=stone_tint(rng), tag='porch posts')
        for s in (-1, 1):
            if (x == post_x[0] and s < 0) or (x == post_x[-1] and s > 0):
                continue
            wm.beam((x + s * .07, PY0 + .1, PB - .38), (x + s * .38, PY0 + .1, PB - .02), .07, .08, ch=.01,
                    tint=dark(), tag='porch brackets')
    wm.box(((PX0 + PX1) / 2, PY0 + .1, PB + .08), (PX1 - PX0 + .2, .15, .16), ch=.02, tint=dark(), tag='porch beam')
    proof = Roof(0, .3, Y0 - (PY0 - .2), sag=.1)
    proof.eave_z = PB + .16 + .12 - proof.g(.3)
    pst = dict(ROOF_STYLES['kawara'], thick=.12, course=.34, pitch=.36, line_r=.06, line_sides=3, cell_mult=2)
    ps = Slope(proof, [(PX0 - .15, PY0 - .2), (PX1 + .2, PY0 - .2), (PX1 + .2, Y0), (PX0 - .15, Y0)],
               (PX0 - .15, PY0 - .2), (PX1 + .2, PY0 - .2), ['eave', 'verge', 'wall', 'verge'])
    tile_slope(A, ps, R, pst, under_mat=W, fascia_mat=W, seed=9)
    rafters(A, W, ps, 1.6, spacing=.45, w=.07, h=.08, tint=dark(), thick=.12)
    ff.box(A.mb(W), (PX1 - PX0) / 2 + (PX0 - X0) - .05, ps.z(V((0, Y0))) + .02, .06, PX1 - PX0 + .4, .1, .1, ch=.015,
           tint=dark(), tag='porch flashing')
    for s_ in (PX0 - .15, PX1 + .2):
        bargeboard(A, W, ps, (s_, PY0 - .2), (s_, Y0), h=.2, t=.06, tint=dark(), n=3)

    # steps: timber step + a big flat stone
    wm.box((0, PY0 - .18, .16), (1.2, .34, .08), ch=.015, tint=.9, tag='steps')
    for x in (-.52, .52):
        wm.box((x, PY0 - .18, .07), (.1, .3, .14), ch=.01, tint=dark(), tag='steps')
    stone(A.mb(P), (0, PY0 - .55, .03), (1.0, .55, .12), 0.05, rng, tint=stone_tint(rng, 1.05), tag='steps')

    # porch lamp: brass lantern hanging from the beam, right of the door
    lx, ly = .55, PY0 + .1
    lc = V((lx, ly, 1.62))
    bm_ = A.mb(B)
    bm_.rod((lx, ly, PB), (lx, ly, lc.z + .3), .012, n=5, tag='lamp')
    bm_.torus((lx, ly, lc.z + .27), .03, .008, maj=8, mn=4, rot=(math.pi / 2, 0, 0), tag='lamp')
    A.mb(PG).box(lc, (.17, .17, .24), ch=.01, tag='lamp')
    for sx in (-1, 1):
        for sy in (-1, 1):
            bm_.box(lc + V((sx * .09, sy * .09, 0)), (.028, .028, .27), tag='lamp')
    bm_.box(lc + V((0, 0, -.14)), (.23, .23, .04), ch=.01, tag='lamp')
    bm_.box(lc + V((0, 0, .155)), (.25, .25, .1), taper=(.3, .3), ch=.008, tag='lamp')
    bm_.sphere(lc + V((0, 0, .235)), .03, seg=8, rings=5, tag='lamp')
    bm_.box(lc + V((0, 0, -.19)), (.06, .06, .08), taper=(.3, .3), tag='lamp')
    A.marker('PorchFlame', lc)

    # ---- Sora's chest on the porch (lid hinged at its back edge)
    cx, cy, cz = -2.0, -2.32, ZF
    cw, cd, chh = .82, .48, .34
    A.pivot('Chest', (cx, cy, cz), ground=None, with_statics=True)
    cm = A.mb(W, 'Chest')
    for k in range(3):
        cm.box((cx, cy, cz + .06 + k * .11), (cw, cd, .105), ch=.012, tint=(.78 + .1 * k) * (.95 + .05 * rng.random()),
               tag='chest')
    for sx in (-1, 1):
        for sy in (-1, 1):
            A.mb(B, 'Chest').box((cx + sx * (cw / 2 - .02), cy + sy * (cd / 2 - .02), cz + .05), (.07, .07, .1), ch=.01,
                                 tag='chest')
    for bx in (-.26, .26):
        cm.box((cx + bx, cy, cz + chh / 2), (.06, cd + .02, chh + .005), tint=.22, tag='chest')
    A.mb(B, 'Chest').box((cx, cy - cd / 2 - .01, cz + chh - .08), (.12, .03, .14), ch=.01, tag='chest')
    hz = cz + chh
    A.pivot('ChestLid', (cx, cy + cd / 2, hz), parent='Chest', ground=None, with_statics=True)
    lid = []
    for i in range(9):
        a = math.pi * i / 8
        lid.append((cd / 2 * math.cos(a), .02 + .12 * math.sin(a)))
    lid = [(-cd / 2, 0)] + [(-u, v) for u, v in lid] + [(cd / 2, 0)]
    lm = A.mb(W, 'ChestLid')
    # outline lies in local XZ (u -> y, v -> z) extruded along local Y -> rotate so it runs along X
    lm.extrude([(u, v) for u, v in lid], cw + .02, (cx, cy, hz), rot=(0, 0, math.pi / 2), bevel=.01, tint=.95,
               tag='chest lid')
    for bx in (-.26, .26):
        band = [(-cd / 2 - .012, -.005)] + [(-(cd / 2 + .012) * math.cos(math.pi * i / 8),
                                               .02 + .135 * math.sin(math.pi * i / 8)) for i in range(9)] + [(cd / 2 + .012, -.005)]
        lm_d = A.mb(W, 'ChestLid')
        lm_d.extrude(band, .065, (cx + bx, cy, hz), rot=(0, 0, math.pi / 2), tint=.22, tag='chest lid')
    sb = A.mb(B, 'ChestLid')
    sb.extrude([(x * .35, y * .35) for x, y in star_outline], .025, (cx, cy - cd / 2 + .01, hz + .045),
               rot=(0, 0, 0), tag='chest star')
    sb.box((cx, cy - cd / 2 - .005, hz - .02), (.06, .03, .08), ch=.008, tag='chest hasp')

    # ---- porch dressing: bench, potted plants, red umbrella, herbs bundle
    wm.box((-1.1, Y0 - .28, ZF + .4), (.95, .32, .06), ch=.012, tint=.95, tag='bench')
    for x in (-1.5, -.7):
        wm.box((x, Y0 - .28, ZF + .19), (.06, .26, .38), tint=dark(1.2), tag='bench')
    A.mb(W).box((-.95, Y0 - .28, ZF + .47), (.3, .22, .07), ch=.02, tint=.5, tag='bench')  # folded cushion
    potted_plant(A, R, G, (.72, Y0 - .3, ZF), r=.17, h=.26, kind='bush', rng=rng, pot_tint=.95)
    potted_plant(A, R, G, (-.45, PY0 + .28, ZF), r=.14, h=.22, kind='tall', rng=rng, pot_tint=.85)
    um = A.mb(RED)
    ub_, ut = V((-.52, Y0 - .12, ZF)), V((-.4, Y0 - .1, ZF + .95))
    um.rod(ub_ + (ut - ub_) * .15, ut, .07, n=8, r2=.02, tag='umbrella')
    A.mb(W).rod(ub_, ut + (ut - ub_) * .12, .012, n=5, tint=dark(), tag='umbrella')
    # ---- garden bed (front right) with cabbages, beans and red flowers
    gx0, gx1, gy0, gy1 = 1.3, 2.95, -2.95, -1.75
    for (a, b_, c_, d_) in ((gx0, gx1, gy0, gy0 + .08), (gx0, gx1, gy1 - .08, gy1), (gx0, gx0 + .08, gy0, gy1),
                            (gx1 - .08, gx1, gy0, gy1)):
        wm.box(((a + b_) / 2, (c_ + d_) / 2, .14), (b_ - a, d_ - c_, .28), ch=.015, tint=.72, tag='garden bed')
    wm.box(((gx0 + gx1) / 2, (gy0 + gy1) / 2, .2), (gx1 - gx0 - .12, gy1 - gy0 - .12, .1), tint=.22, tag='soil')
    gm = A.mb(G)
    for i in range(3):
        x = gx0 + .35 + i * .48
        leafy(gm, (x, gy0 + .33, .3), (.17, .17, .12), rng, seg=7, rings=4, jitter=.25, tag='cabbage')
        leafy(gm, (x, gy0 + .33, .38), (.09, .09, .08), rng, seg=6, rings=4, jitter=.1, tint=1.0, tag='cabbage')
    # bean teepee
    tp = V(((gx0 + gx1) / 2 + .15, gy1 - .35, 1.55))
    for i in range(4):
        a = TAU * i / 4 + .4
        base = V((tp.x + math.cos(a) * .42, tp.y + math.sin(a) * .28, .2))
        wm.rod(base, tp + V((math.cos(a) * .05, math.sin(a) * .05, .1)), .016, n=4, tint=.8, tag='bean poles')
        for k in range(1 + (i % 2)):
            p = base.lerp(tp, .3 + .35 * k)
            leafy(gm, p, (.13, .13, .16), rng, seg=6, rings=4, jitter=.3, tag='bean poles')
    for i in range(5):
        x = gx0 + .22 + i * .3
        gm.rod((x, gy0 + .72, .22), (x, gy0 + .72, .5), .012, n=4, tag='flowers')
        A.mb(RED if i % 2 == 0 else P).sphere((x, gy0 + .72, .52), .065, seg=6, rings=4, tag='flowers')
    # watering can
    wc = V((gx0 - .15, gy0 + .2, 0))
    B_ = A.mb(B)
    B_.cyl(wc + V((0, 0, .13)), .1, .24, n=10, ch=.01, tint=.85, tag='watering can')
    B_.rod(wc + V((.08, 0, .1)), wc + V((.3, 0, .28)), .018, n=6, tint=.85, tag='watering can')
    B_.torus(wc + V((-.02, 0, .26)), .08, .012, maj=10, mn=4, rot=(math.pi / 2, 0, 0), arc=.5, tint=.85, tag='watering can')

    # ---- flower box under the right front window
    flower_box(A, ff, 4.1, 1.12 - .32, 1.1, W, G, RED, rng, box_tint=.75, flower_mat2=P)

    # ---- firewood against the west wall, chimney on the west slope
    fw = Face((X0, Y1, 0), (-1, 0, 0))
    firewood(A, W, (X0 - .32, .55, 0), length=1.1, rows=3, depth=.42, rot=math.pi / 2, rng=rng)
    wm.box((X0 - .32, .55, .03), (.5, 1.2, .06), tint=.5, tag='firewood')
    chx, chy = -1.35, 1.45
    pm = A.mb(P)
    chimney(A, P, R, chx, chy, left.z(V((chx, chy))) - .35, 5.55, rng, w=.66, d=.74)

    # ---- gutters (copper) and downpipes on the eaves, rain barrel at the back
    for s, sx in ((left, -1), (right, 1)):
        xg = sx * (X1 + EO + .06)
        zg = roof.eave_z - thick - .02
        gp = [V((xg, ya + .05, zg)), V((xg, yb - .05, zg - .03))]
        B_.loft(gp, [(.07 * math.cos(math.pi * (1 + i / 5)), .07 * math.sin(math.pi * (1 + i / 5)) + .07) for i in range(6)],
                closed=False, caps=False, tint=.8, tag='gutter')
        for y in (ya + .4, 0.5, yb - .4):
            B_.box((xg - sx * .05, y, zg + .04), (.12, .03, .03), tint=.7, tag='gutter')
        dx = xg
        B_.rod((dx, yb - .25, zg), (dx, yb - .25, .75 if sx > 0 else .1), .04, n=6, tint=.8, tag='downpipe')
        B_.rod((dx, yb - .25, zg), (dx - sx * .4, yb - .25, zg - .25), .035, n=6, tint=.8, tag='downpipe')
    bx_, by_ = X1 + EO + .06, yb - .25
    A.mb(W).lathe([(0, 0), (.3, 0), (.34, .15), (.36, .38), (.34, .6), (.3, .72), (0, .7)], (bx_ - .05, by_ - .05, 0),
                  n=12, tint=.75, tag='rain barrel')
    for z in (.14, .58):
        A.mb(W).cyl((bx_ - .05, by_ - .05, z), .355, .05, n=12, tint=.22, tag='rain barrel')

    # ---- railway semaphore signal beside the house (+X)
    mx, my = 3.2, .5
    pm.box((mx, my, .1), (.62, .62, .3), ch=.05, tint=stone_tint(rng), tag='semaphore')
    A.mb(P).box((mx, my, 3.0), (.2, .2, 5.4), taper=(.72, .72), ch=.02, tint=.97, tag='semaphore')
    wm.box((mx, my, .6), (.23, .23, .7), ch=.02, tint=.25, tag='semaphore')
    for sy in (-1, 1):
        wm.box((mx - .22, my + sy * .2, 2.75), (.045, .045, 4.9), tint=dark(), tag='semaphore ladder')
    for k in range(15):
        wm.box((mx - .22, my, .5 + k * .31), (.04, .4, .035), tint=dark(1.2), tag='semaphore ladder')
    B_.box((mx, my, 5.75), (.2, .2, .08), ch=.01, tag='semaphore')
    B_.box((mx, my, 5.86), (.18, .18, .16), taper=(.2, .2), tag='semaphore')
    B_.sphere((mx, my, 5.99), .045, seg=8, rings=5, tag='semaphore')
    az = 5.05
    ay = my - .14
    arm = [(0, -.11), (1.25, -.13), (1.25, .13), (0, .11)]
    A.mb(RED).extrude(arm, .045, (mx + .05, ay, az), bevel=.01, tag='semaphore arm')
    A.mb(P).extrude([(0, -.12), (.14, -.13), (.14, .13), (0, .12)], .05, (mx + .98, ay, az), bevel=.006,
                    tint=.98, tag='semaphore arm')
    wm.extrude([(-.55, -.2), (-.05, -.16), (-.05, .16), (-.55, .2)], .04, (mx, ay, az - .3), bevel=.01, tint=.2,
               tag='spectacle')
    A.mb(RED).cyl((mx - .42, ay - .03, az - .3), .1, .03, n=12, rot=(math.pi / 2, 0, 0), tag='spectacle')
    A.mb(G).cyl((mx - .18, ay - .03, az - .3), .1, .03, n=12, rot=(math.pi / 2, 0, 0), tag='spectacle')
    B_.cyl((mx, ay - .02, az), .06, .06, n=10, rot=(math.pi / 2, 0, 0), tag='spectacle')
    wm.box((mx, my - .05, az - .75), (.2, .2, .28), ch=.02, tint=.2, tag='signal lamp')
    A.mb(WG).cyl((mx, my - .16, az - .75), .06, .02, n=10, rot=(math.pi / 2, 0, 0), tag='signal lamp')
    B_.rod((mx + .5, ay, az), (mx + .08, my - .12, .9), .01, n=4, tint=.6, tag='semaphore rod')
    wm.box((mx + .1, my - .2, .85), (.08, .3, .06), tint=.25, tag='semaphore lever')

    return A.finish(ao_distance=1.2, ao_strength=.62)


# ---------------------------------------------------------------- shared Kawabe dressing


def M_iron():
    return mat('Iron', '#3b4048', rough=.45, metal=.7)


def M_noren(color='#2b4f93'):
    return mat('Noren', color, rough=.8, double=True)


def noren(A, face, u, z_top, w, h, cloth, rod_mat, panels=3, crest_mat=None, crest_tint=1.0, d=.2, rng=None,
          rod_tint=WOOD_DARK, tag='noren', crest='disc'):
    """Split shop curtain hanging from a rod in front of a doorway."""
    rng = rng or random.Random(3)
    face.box(A.mb(rod_mat), u, z_top + .03, d, w + .2, .05, .05, tint=rod_tint, tag=tag)
    cm = A.mb(cloth)
    pw = (w - .03 * (panels - 1)) / panels
    for i in range(panels):
        ua = u - w / 2 + i * (pw + .03)
        bm = bmesh.new()
        rows = []
        for j in range(4):
            z = z_top - h * j / 3
            row = []
            for k in range(3):
                uu = ua + pw * k / 2
                wave = .025 * math.sin(k * math.pi + i) * (j / 3) + .01 * j
                row.append(bm.verts.new(face.p(uu, z, d + wave)))
            rows.append(row)
        for j in range(3):
            for k in range(2):
                bm.faces.new((rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]))
        bm.normal_update()
        for f in bm.faces:
            if f.normal.dot(face.n) < 0:
                f.normal_flip()
        cm.append(bm, tint=.95 + .05 * rng.random(), smooth=60, tag=tag)
    if crest_mat is not None:
        cz = z_top - h * .42
        if crest == 'disc':
            A.mb(crest_mat).cyl(face.p(u, cz, d + .035), h * .2, .01, n=14, rot=(math.pi / 2, 0, face.rot),
                                tint=crest_tint, tag=tag)
            A.mb(cloth).cyl(face.p(u, cz, d + .042), h * .11, .01, n=10, rot=(math.pi / 2, 0, face.rot), tint=.9,
                            tag=tag)


def sacks(A, mat_, c, rng, n=5, tint=(.86, .74, .52), rot=0., tag='sacks'):
    """A small heap of grain sacks (lumpy pillows)."""
    mb = A.mb(mat_)
    R = Matrix.Rotation(rot, 3, 'Z')
    spots = [(0, 0, 0), (.62, .05, 0), (-.6, -.04, 0), (.3, .02, .32), (-.28, 0, .32), (0, .1, .6)][:n]
    for i, (x, y, z) in enumerate(spots):
        p = V(c) + R @ V((x, y, z + .17))
        bm = bm_sphere((.34, .24, .18), 7, 4)
        for v in bm.verts:
            v.co.x *= 1 + .12 * (abs(v.co.z) < .05)
            v.co.z *= .9 + .2 * (v.co.x > 0)
        k = .9 + .1 * rng.random()
        mb.append(bm, xform(p, (0, 0, rot + (rng.random() - .5) * .5)), (tint[0] * k, tint[1] * k, tint[2] * k),
                  smooth=70, tag=tag)
        mb.box(p + R @ V((.33, 0, .04)), (.06, .12, .1), rot=(0, 0, rot), tint=(tint[0] * .7, tint[1] * .7, tint[2] * .7),
               tag=tag)


def millstone(A, mat_, c, r=.58, t=.22, rot=0., lean=.18, rng=None, tag='millstone'):
    """Grooved millstone leaning against a wall (face toward local -Y)."""
    rng = rng or random.Random(1)
    prof = [(.1, -t / 2), (r - .03, -t / 2), (r, -t / 2 + .03), (r, t / 2 - .03), (r - .03, t / 2), (.1, t / 2)]
    bm = bm_lathe(prof, 16)
    # a centre hole (inner wall)
    M = xform(c, (math.pi / 2 - lean, 0, rot))
    A.mb(mat_).append(bm, M, stone_tint(rng, 1.12), smooth=40, tag=tag)
    inner = bm_cyl(.1, t, 10, cap=False)
    for f in inner.faces:
        f.normal_flip()
    A.mb(mat_).append(inner, M, stone_tint(rng, .5), smooth=60, tag=tag)
    for i in range(6):
        a = TAU * i / 6
        p0 = V((math.cos(a) * .16, -t / 2 - .004, math.sin(a) * .16))
        p1 = V((math.cos(a + .35) * (r - .06), -t / 2 - .004, math.sin(a + .35) * (r - .06)))
        A.mb(mat_).append(bm_box(((p1 - p0).length, .01, .035)),
                          M @ xform((p0 + p1) / 2, (0, -(math.atan2(p1.z - p0.z, p1.x - p0.x)), 0)),
                          stone_tint(rng, .55), smooth=0, tag=tag)


def kawabe_lantern(A, glow_mat, dark_mat, face, u, z, d=.45, bracket=True, r=.19, h=.4, tag='chochin'):
    """Red chochin hanging from a small bracket on a wall face."""
    c = face.p(u, z, d)
    chochin(A, glow_mat, dark_mat, c, r=r, h=h, hang=.12, tag=tag)
    if bracket:
        A.mb(dark_mat).beam(face.p(u, z + h / 2 + .12, 0), face.p(u, z + h / 2 + .12, d + .03), .05, .05,
                            tint=WOOD_DARK, tag=tag)


# ---------------------------------------------------------------- mill


@builder('mill')
def build_mill():
    A = Asset('mill', 'Mill')
    rng = random.Random(33)
    P, W, R, IR, NO, G = M_plaster(), M_wood(), M_kroof(), M_iron(), M_noren(), M_leaf()
    WG, LG = window_glow(), lantern_glow()

    BX0, BX1, BY0, BY1 = -3.5, 4.0, -2.8, 2.8
    ZG, ZT = 2.6, 4.6           # stone ground floor top, upper storey top
    J = .12                     # jetty of the upper storey
    UX0, UX1, UY0, UY1 = BX0 - J, BX1, BY0 - J, BY1 + J
    QY = 3.5                    # quay half length along Y
    WET = -.55                  # water line guess (stones darken below)

    pm, wm = A.mb(P), A.mb(W)

    def rub(rng_, u, z):
        k = 1.0 + .06 * (rng_.random() - .5)
        t = stone_tint(rng_, k)
        if z < .4 and rng_.random() < .3:
            t = (t[0] * .88, t[1] * .97, t[2] * .8)
        return t

    # ---- stone ground floor (masonry) + hidden core
    pm.box(((BX0 + BX1) / 2, 0, (ZG - .8) / 2), (BX1 - BX0 - .1, BY1 - BY0 - .1, ZG + .8 - .05),
           tint=stone_tint(rng, .6), tag='core')
    front_holes = [(2.6, 4.4, 0.0, 2.15), (.8, 1.8, .95, 1.75), (5.4, 6.4, .95, 1.75)]
    holes = {'-y': front_holes, '+y': [(3.4, 4.2, 1.0, 1.7)], '-x': [(2.4, 3.2, 1.0, 1.7)], '+x': []}
    faces = {}
    for side in ('-y', '+x', '+y', '-x'):
        f, L = rect_face(BX0, BX1, BY0, BY1, side)
        faces[side] = (f, L)
        z_lo = -2.5 if side == '+x' else -.5
        masonry(pm, f, 0, L, z_lo, ZG, holes[side], rng=rng, tint_fn=rub, wet=WET if side == '+x' else None,
                course=(.26, .5), length=(.4, 1.1))
        quoins(pm, f, L, -.3 if side != '+x' else 0.0, ZG, rng, side=1, d=.0, tint_fn=lambda r_, u, z: stone_tint(r_, 1.1))
        for h in holes[side]:
            # stone lintel + sill, reveals
            reveal(pm, f, h, .3, tint=stone_tint(rng, .8), sides='lrt' if h[2] <= 0 else 'lrtb')
            if h[2] > 0:
                f.box(pm, (h[0] + h[1]) / 2, h[3] + .13, .03, h[1] - h[0] + .5, .26, .3, ch=.03, tint=stone_tint(rng, 1.12),
                      tag='lintels')
                f.box(pm, (h[0] + h[1]) / 2, h[2] - .06, .06, h[1] - h[0] + .3, .12, .3, ch=.02, tint=stone_tint(rng, 1.05),
                      tag='lintels')
                koshi(A, f, h, W, WG, pm, depth=.28, tint=dark(.95), frame=False)
    # quay: the +X face continues down to the river bed and runs past the building
    fq = Face((BX1, -QY, 0), (1, 0, 0))
    for (y0_, y1_) in ((-QY, BY0), (BY1, QY)):
        masonry(pm, fq, y0_ + QY, y1_ + QY, -2.5, 0, (), rng=rng, tint_fn=rub, wet=WET, course=(.3, .44),
                length=(.5, 1.1))
    for sy in (-1, 1):
        fe = Face((BX1, QY, 0), (0, 1, 0)) if sy > 0 else Face((BX1 - 1.6, -QY, 0), (0, -1, 0))
        masonry(pm, fe, 0, 1.6, -2.5, 0, (), rng=rng, tint_fn=rub, wet=WET, course=(.3, .44), length=(.5, 1.1))
        pm.box((BX1 - .8, sy * (QY + BY1 + .0) / 2 + sy * .0, -1.25), (1.58, QY - BY1 + .02, 2.48), tint=stone_tint(rng, .6),
               tag='core')
    # coping along the quay edge and the building foot
    for (y0_, y1_) in ((-QY - .05, BY0 + .02), (BY1 - .02, QY + .05)):
        n = max(1, int((y1_ - y0_) / .7))
        for i in range(n):
            ya_, yb_ = y0_ + (y1_ - y0_) * i / n, y0_ + (y1_ - y0_) * (i + 1) / n
            pm.box((BX1 - .7, (ya_ + yb_) / 2, .06), (yb_ - ya_ - .03, 1.5, .16), rot=(0, 0, math.pi / 2), ch=.035,
                   tint=stone_tint(rng, 1.12), tag='coping', front=True)
    for i in range(9):
        ya_, yb_ = BY0 + (BY1 - BY0) * i / 9, BY0 + (BY1 - BY0) * (i + 1) / 9
        pm.box((BX1 + .07, (ya_ + yb_) / 2, .02), (yb_ - ya_ - .03, .2, .18), rot=(0, 0, math.pi / 2), ch=.03,
               tint=stone_tint(rng, 1.1), tag='coping', front=True)
    # moss tufts along the water line
    for i in range(5):
        y = -QY + .3 + i * (2 * QY - .6) / 4
        leafy(A.mb(G), (BX1 + .03, y + rng.uniform(-.2, .2), WET + .05 + rng.uniform(-.05, .1)), (.07, .35, .09), rng,
              seg=6, rings=3, jitter=.3, tint=.55 + .2 * rng.random(), tag='moss')

    # ---- jetty beam + joist ends
    for side in ('-y', '+y', '-x'):
        f, L = rect_face(UX0, UX1, UY0, UY1, side)
        f.box(wm, L / 2, ZG + .1, -.02, L, .2, .16, ch=.02, tint=dark(), tag='jetty')
        if side == '-y':
            for i in range(int(L / .5)):
                f.box(wm, .25 + i * .5, ZG - .06, -.05, .1, .12, .14, tint=dark(1.1), tag='joists')
    f, L = rect_face(UX0, UX1, UY0, UY1, '+x')
    f.box(wm, L / 2, ZG + .1, .02, L, .2, .1, ch=.02, tint=dark(), tag='jetty')

    # ---- timber upper storey
    upper_holes = {'-y': [(1.3, 2.5, 3.2, 4.1), (5.2, 6.4, 3.2, 4.1)], '+y': [(4.1, 5.3, 3.2, 4.1)],
                   '-x': [(2.42, 3.42, ZG + .25, 4.3)], '+x': [(2.4, 3.4, 3.25, 4.05)]}
    uposts = {'-y': [0, 1.0, 2.8, 4.9, 6.7, 7.62], '+y': [0, 1.9, 3.8, 5.7, 7.62], '-x': [0, 2.2, 3.64, 5.84]}
    ufaces = {}
    for side in ('-y', '+x', '+y', '-x'):
        f, L = rect_face(UX0, UX1, UY0, UY1, side)
        ufaces[side] = (f, L)
        posts = uposts.get(side) or [0, L / 2 - .9, L / 2 + .9, L]
        timber_wall(A, f, L, ZG + .2, ZT, upper_holes[side], P, W, posts, [3.15, 4.15],
                    board_top=3.15 if side in ('+y', '+x') else None, rng=rng, post_ext=(.0, .1))
        f.box(wm, L / 2, ZT - .08, .04, L + .1, .18, .13, ch=.02, tint=dark(.9), tag='beams')
        for h in upper_holes[side]:
            if side == '-x':
                continue
            koshi(A, f, h, W, WG, pm, tint=dark(.95))
    # loading door on the land gable + hoist beam with pulley, rope and a sack
    f, L = ufaces['-x']
    h = upper_holes['-x'][0]
    reveal(pm, f, h, .12, tint=.7)
    for s in (-1, 1):
        f.box(wm, (h[0] + h[1]) / 2 + s * (h[1] - h[0]) / 4, (h[2] + h[3]) / 2, -.07, (h[1] - h[0]) / 2 - .02, h[3] - h[2] - .02,
              .05, tint=.72, tag='loading door')
        for zz in (h[2] + .35, h[3] - .35):
            f.box(A.mb(IR), (h[0] + h[1]) / 2 + s * (h[1] - h[0]) / 4, zz, -.035, (h[1] - h[0]) / 2 - .1, .06, .02, tag='hinges')

    # ---- roof: gable, ridge along X
    EO, VO = .62, .5
    thick = ROOF_STYLES['kawara']['thick']
    pitch = .6
    D = (UY1 - UY0) / 2 + EO
    roof = Roof(0, pitch, D, sag=.2)
    roof.eave_z = ZT + thick + .02 - roof.g(EO)
    st = dict(ROOF_STYLES['kawara'], pitch=.54, course=.52, line_sides=3, cell_mult=2, line_r=.095)
    x0r, x1r = UX0 - VO, UX1 + VO
    front, back, _ = gable_roof(A, R, x0r, x1r, -D, D, roof.eave_z, pitch, sag=.2, style=st, under_mat=W, fascia_mat=W,
                                seed=5, ridge_layers=3, ridge_w=.4)
    for s in (front, back):
        rafters(A, W, s, EO + .03, spacing=.46, w=.08, h=.1, tint=dark(), thick=thick)
    for xe in (x0r, x1r):
        for s, ye in ((front, -D), (back, D)):
            bargeboard(A, W, s, (xe, ye), (xe, 0), h=.36, t=.09, tint=dark(), out=V((1 if xe > 0 else -1, 0)))
    # gable walls (plaster with timber) above the upper storey
    for side in ('+x', '-x'):
        f, L = ufaces[side]
        top = under_fn([front, back], f, thick, u0=0, u1=L)
        panel(pm, f, 0, L, ZT, 9.0, [], top=top, tag='gable')
        collar(f, wm, top, L, ZT + .7)
        for su in (L / 2 - .9, L / 2, L / 2 + .9):
            f.box(wm, su, (ZT + top(su)) / 2, .035, .14, top(su) - ZT, .1, ch=.015, tint=dark(), tag='gable timber')
        # lattice vent
        f.box(wm, L / 2 - .45, ZT + 1.25, .03, .5, .4, .06, tint=.2, tag='gable vent')
        for k in range(4):
            f.box(wm, L / 2 - .63 + k * .12, ZT + 1.25, .06, .04, .4, .03, tint=dark(), tag='gable vent')
    # hoist beam on the land gable
    hz = ZT + 1.05
    wm.box((x0r - .35, 0, hz), (1.9, .18, .2), ch=.02, tint=dark(), tag='hoist')
    wm.beam((UX0 - .02, 0, hz - .8), (x0r - .15, 0, hz - .08), .12, .12, tint=dark(), tag='hoist')
    A.mb(IR).cyl((x0r - 1.1, 0, hz - .2), .14, .07, n=12, rot=(0, math.pi / 2, 0), tag='hoist')
    rope_top = V((x0r - 1.1, .0, hz - .32))
    A.mb(W).rod(rope_top, rope_top - V((0, 0, 1.0)), .025, n=5, tint=(.9, .8, .6), tag='hoist rope')
    sacks(A, P, rope_top - V((0, 0, 1.45)), rng, n=1, rot=math.pi / 2)

    # ---- chimney through the back slope (node Chimney at the flue top)
    chx, chy = -2.2, 1.55
    flue = chimney(A, P, R, chx, chy, back.z(V((chx, chy))) - .35, 7.0, rng, w=.72, d=.72)
    A.marker('Chimney', flue)

    # ---- front: pent roof over the big door, double doors, noren, lantern
    ff, Lf = faces['-y']
    dh = front_holes[0]
    proof = Roof(0, .32, 1.25, sag=.1)
    proof.eave_z = 2.3
    pst = dict(ROOF_STYLES['kawara'], thick=.12, course=.34, pitch=.36, line_r=.06, line_sides=3, cell_mult=2)
    ps = Slope(proof, [(-1.75, BY0 - 1.25), (1.75, BY0 - 1.25), (1.75, BY0), (-1.75, BY0)], (-1.75, BY0 - 1.25),
               (1.75, BY0 - 1.25), ['eave', 'verge', 'wall', 'verge'])
    tile_slope(A, ps, R, pst, under_mat=W, fascia_mat=W, seed=12)
    rafters(A, W, ps, 1.3, spacing=.45, w=.07, h=.08, tint=dark(), thick=.12)
    for s_ in (-1.75, 1.75):
        bargeboard(A, W, ps, (s_, BY0 - 1.25), (s_, BY0), h=.2, t=.06, tint=dark(), n=3)
        wm.beam((s_ * .95, BY0 - .02, 1.55), (s_ * .95, BY0 - 1.0, proof.eave_z - .15), .1, .12, ch=.012, tint=dark(),
                tag='pent brackets')
    wm.box((0, BY0 - .03, dh[3] + .12), (dh[1] - dh[0] + .5, .2, .24), ch=.02, tint=dark(), tag='door lintel')
    for s in (-1, 1):
        ff.box(wm, (dh[0] + dh[1]) / 2 + s * .45, (dh[2] + dh[3]) / 2, -.2, .88, dh[3] - dh[2], .07, ch=.01, tint=.62,
               tag='mill doors')
        for k in range(4):
            ff.box(wm, (dh[0] + dh[1]) / 2 + s * .45 + (k - 1.5) * .21, (dh[2] + dh[3]) / 2, -.16, .02, dh[3] - dh[2] - .05, .02,
                   tint=.35, tag='mill doors')
        for zz in (.45, 1.7):
            ff.box(A.mb(IR), (dh[0] + dh[1]) / 2 + s * .45, zz, -.15, .8, .07, .02, tag='hinges')
    # door slightly open: dark gap between leaves
    ff.box(wm, (dh[0] + dh[1]) / 2, (dh[2] + dh[3]) / 2, -.25, .1, dh[3] - dh[2], .02, tint=.08, tag='mill doors')
    noren(A, ff, (dh[0] + dh[1]) / 2, dh[3] - .02, 1.7, .78, NO, W, panels=3, crest_mat=P, rng=rng, d=.12)
    kawabe_lantern(A, LG, W, ff, dh[1] + .55, 1.85, d=.35, r=.2, h=.42)
    # threshold stone
    stone(pm, (0, BY0 - .45, .06), (2.2, .7, .14), 0, rng, tint=stone_tint(rng, 1.05), tag='threshold')

    # ---- dressing: sacks, millstone, barrel, potted pine
    sacks(A, P, (-2.4, BY0 - .45, 0), rng, n=6)
    millstone(A, P, (3.35, BY0 - .25, .56), rot=0, lean=.2, rng=rng)
    A.mb(W).lathe([(0, 0), (.3, 0), (.34, .15), (.36, .38), (.34, .6), (.3, .72), (0, .7)], (2.3, BY0 - .45, 0),
                  n=12, tint=.75, tag='barrel')
    for z in (.14, .58):
        A.mb(IR).cyl((2.3, BY0 - .45, z), .355, .05, n=12, tag='barrel')
    potted_plant(A, R, G, (-1.25, BY0 - .38, 0), r=.2, h=.3, kind='bush', rng=rng, pot_tint=.9)

    # ---- axle bearing on the quay wall and stone pier in the river
    WX, WZ = 5.4, 1.6
    wm.box((BX1 + .16, 0, WZ), (.32, .7, .7), ch=.04, tint=dark(), tag='bearing')
    A.mb(IR).box((BX1 + .2, 0, WZ), (.34, .74, .12), tag='bearing')
    PXc = 6.45
    fp = [Face((PXc - .3, -.6, 0), (0, -1, 0)), Face((PXc + .3, -.6, 0), (1, 0, 0)),
          Face((PXc + .3, .6, 0), (0, 1, 0)), Face((PXc - .3, .6, 0), (-1, 0, 0))]
    pm.box((PXc, 0, -.6), (.58, 1.18, 3.8), tint=stone_tint(rng, .6), tag='pier')
    for i, f in enumerate(fp):
        L = .6 if i % 2 == 0 else 1.2
        masonry(pm, f, 0, L, -2.5, 1.3, (), rng=rng, tint_fn=rub, wet=WET, mortar=False, course=(.34, .46),
                length=(.3, .62), tag='pier')
    pm.box((PXc, 0, 1.36), (.74, 1.34, .14), ch=.03, tint=stone_tint(rng, 1.1), tag='pier')
    wm.box((PXc, 0, 1.47), (.5, .6, .18), ch=.02, tint=dark(), tag='bearing')
    A.mb(IR).box((PXc, 0, WZ), (.22, .3, .06), tag='bearing')

    # ---- the waterwheel (pivot on the axle, identity rotation)
    A.pivot('Wheel', (WX, 0, WZ), ground=None, with_statics=False)
    ww, wi = A.mb(W, 'Wheel'), A.mb(IR, 'Wheel')
    Rr = 3.0
    rot_x = Matrix.Rotation(math.pi / 2, 3, 'Y')   # cylinder Z -> X

    def ring(x, r_in, r_out, width, n=36, tint=1.0, mbx=ww, tag='wheel rim'):
        prof = [(-width / 2, r_in), (width / 2, r_in), (width / 2, r_out), (-width / 2, r_out)]
        bm = bmesh.new()
        rings_ = []
        for i in range(n):
            a = TAU * i / n
            rings_.append([bm.verts.new((x + px, math.cos(a) * pr, WZ + math.sin(a) * pr)) for px, pr in prof])
        for i in range(n):
            r0, r1 = rings_[i], rings_[(i + 1) % n]
            for k in range(4):
                bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mbx.append(bm, tint=tint, smooth=30, tag=tag)

    for sx in (-1, 1):
        x = WX + sx * .52
        ring(x, Rr - .44, Rr - .2, .14, tint=dark(1.15))
        ring(x, 1.45, 1.6, .1, n=20, tint=dark(1.1), tag='wheel inner ring')
        ring(x + sx * .075, Rr - .34, Rr - .3, .02, n=18, tint=1.0, mbx=wi, tag='wheel iron')
        for i in range(8):
            a = TAU * i / 8 + (sx * .2)
            p0 = V((x, math.cos(a) * .3, WZ + math.sin(a) * .3))
            p1 = V((x, math.cos(a) * (Rr - .36), WZ + math.sin(a) * (Rr - .36)))
            ww.beam(p0, p1, .1, .12, up=V((1, 0, 0)), tint=dark(1.25), tag='wheel spokes')
    for i in range(12):
        a = TAU * i / 12 + .13
        c = V((WX, math.cos(a) * (Rr - .33), WZ + math.sin(a) * (Rr - .33)))
        dr = V((0, math.cos(a), math.sin(a)))
        tg = V((0, -math.sin(a), math.cos(a)))
        M = Matrix((V((1, 0, 0)), dr, tg)).transposed()
        ww.append(bm_box((1.18, .72, .06), .012, 1), Matrix.Translation(c) @ M.to_4x4(), tint=.95 + .05 * rng.random(),
                  smooth=38, tag='wheel paddles')
        ww.append(bm_box((1.1, .06, .05), 0, 1), Matrix.Translation(c - dr * .28 - tg * .05) @ M.to_4x4(), tint=dark(1.2),
                  smooth=38, tag='wheel paddles')
    ww.append(bm_cyl(.42, 1.26, 14, cap=True, ch=.04, seg=1), xform((WX, 0, WZ), rot_x), tint=dark(1.1), smooth=50,
              tag='wheel hub')
    for sx in (-1, 1):
        wi.append(bm_cyl(.44, .09, 14, cap=True), xform((WX + sx * .45, 0, WZ), rot_x), tint=1.0, smooth=50, tag='wheel hub')
    wi.append(bm_cyl(.12, PXc - BX1 + .3, 10, cap=True), xform(((BX1 + PXc) / 2 + .05, 0, WZ), rot_x), tint=1.0, smooth=50,
              tag='wheel axle')

    ground = ground_occluder([(-60, -60), (BX1 - .02, -60), (BX1 - .02, 60), (-60, 60)], 0.0)
    return A.finish(ao_distance=1.3, ao_strength=.62, ground=None, occluders=[ground])


# ---------------------------------------------------------------- drawbridge


def chain(mb, a, b, link=.3, r=.022, sag=.0, tint=1.0, tag='chain'):
    """Chunky chain of alternating links from a to b with an optional catenary sag."""
    a, b = V(a), V(b)
    L = (b - a).length
    n = max(2, int(L / (link * .82)))
    pts = []
    for i in range(n + 1):
        t = i / n
        p = a.lerp(b, t) - V((0, 0, sag * 4 * t * (1 - t)))
        pts.append(p)
    for i in range(n):
        p0, p1 = pts[i], pts[i + 1]
        d = (p1 - p0)
        c = (p0 + p1) / 2
        q = d.to_track_quat('X', 'Z')
        if i % 2:
            q = q @ Quaternion((1, 0, 0), math.pi / 2)
        bm = bmesh.new()
        # stadium-shaped link: torus squashed along its long axis
        R_, rr = link * .32, r
        rings = []
        maj, mn = 6, 3
        for k in range(maj):
            ang = TAU * k / maj
            cx_, cy_ = math.cos(ang) * R_ * 1.55, math.sin(ang) * R_ * .78
            nx, ny = math.cos(ang), math.sin(ang)
            rings.append([bm.verts.new((cx_ + nx * rr * math.cos(TAU * m / mn), cy_ + ny * rr * math.cos(TAU * m / mn),
                                        rr * math.sin(TAU * m / mn))) for m in range(mn)])
        for k in range(maj):
            r0, r1 = rings[k], rings[(k + 1) % maj]
            for m in range(mn):
                bm.faces.new((r0[m], r1[m], r1[(m + 1) % mn], r0[(m + 1) % mn]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mb.append(bm, xform(c, q), tint, smooth=60, tag=tag)


@builder('drawbridge')
def build_drawbridge():
    A = Asset('drawbridge', 'Drawbridge')
    rng = random.Random(44)
    P, W, IR = M_plaster(), M_wood(), M_iron()
    LEN, HW = 6.0, .8

    # ---- static: stone sill on the bank, bearing blocks, hinge posts with pulley rings
    pm, wm, im = A.mb(P), A.mb(W), A.mb(IR)
    pm.box((0, .45, -.45), (2.3, .9, .9), tint=stone_tint(rng, .7), tag='abutment')
    fsill = Face((-1.15, 0.0, 0), (0, -1, 0))
    masonry(pm, fsill, 0, 2.3, -.8, -.05, (), rng=rng, mortar=True, course=(.24, .36), length=(.35, .7), tag='abutment')
    for sx in (-1, 1):
        footing(pm, sx * .98, .18, .04, .42, rng, tint=stone_tint(rng, 1.1))
    for sx in (-1, 1):
        x = sx * .98
        wm.box((x, .18, .5), (.2, .2, 1.1), ch=.025, tint=dark(1.05), tag='posts')
        wm.box((x, .18, 1.1), (.28, .28, .1), ch=.02, tint=dark(.9), tag='posts')
        wm.box((x, .18, 1.18), (.22, .22, .08), taper=(.4, .4), ch=.01, tint=dark(.9), tag='posts')
        im.box((x, .18, .2), (.23, .23, .06), tag='post bands')
        im.box((x, .18, .8), (.23, .23, .06), tag='post bands')
        # pulley ring on the inner face near the top
        im.torus((x - sx * .12, .1, .98), .075, .022, maj=8, mn=4, rot=(0, math.pi / 2, 0), tag='rings')
        # bearing block for the hinge axle
        wm.box((sx * .74, .08, -.14), (.22, .3, .22), ch=.02, tint=dark(.85), tag='bearings')
        im.box((sx * .74, .08, -.14), (.24, .12, .24), tag='bearings')
        # brace from the post to the sill
        wm.beam((x, .7, -.05), (x, .26, .55), .12, .12, tint=dark(1.1), tag='braces')
    im.append(bm_cyl(.05, 1.72, 10), xform((0, .0, -.12), Matrix.Rotation(math.pi / 2, 3, 'Y')), 1.0, smooth=50, tag='axle')

    # ---- the deck (pivot at the hinge, identity rotation, lowered = rest)
    A.pivot('Deck', (0, 0, 0), ground=None, with_statics=True)
    dw, di = A.mb(W, 'Deck'), A.mb(IR, 'Deck')
    n = 24
    for i in range(n):
        y0 = -LEN + i * LEN / n
        k = .82 + .18 * rng.random()
        if i % 7 == 3:
            k *= .8
        dw.box((rng.uniform(-.02, .02), y0 + LEN / n / 2, -.035), (2 * HW - .02 * rng.random(), LEN / n - .018, .07),
               tint=k, tag='planks')
    for sx in (-1, 1):
        dw.box((sx * .55, -LEN / 2, -.17), (.16, LEN, .2), ch=.02, tint=dark(1.1), tag='stringers')
        dw.box((sx * (HW - .05), -LEN / 2 + .05, .06), (.1, LEN - .1, .12), ch=.015, tint=dark(1.2), tag='kerbs')
    for y in (-1.5, -3.0, -4.5):
        dw.box((0, y, -.29), (1.3, .12, .08), tint=dark(), tag='cross battens')
    for sx in (-1, 1):
        di.append(bm_cyl(.075, .34, 10), xform((sx * .55, 0, -.12), Matrix.Rotation(math.pi / 2, 3, 'Y')), 1.0, smooth=50,
                  tag='hinge')
        di.box((sx * .55, -.3, -.07), (.2, .6, .03), tag='hinge')
        # eye plates at the tip
        di.box((sx * (HW - .02), -LEN + .25, .09), (.14, .3, .14), ch=.01, tag='eyes')
    di.box((0, -LEN + .03, -.05), (2 * HW + .02, .07, .14), tag='tip plate')
    for i in range(5):
        di.cyl((-.6 + i * .3, -LEN - .005, -.05), .03, .02, n=6, rot=(math.pi / 2, 0, 0), tag='rivets')
    # lift chains: from the tip eyes to the post rings (they ride with the deck)
    for sx in (-1, 1):
        chain(di, (sx * (HW - .02), -LEN + .3, .16), (sx * .86, .1, .98), link=.44, r=.03, sag=.18, tag='chains')

    return A.finish(ao_distance=.9, ao_strength=.6, ground=0.0)


# ---------------------------------------------------------------- star lamp


def M_vermilion():
    return mat('Vermilion', '#e2462c', rough=.38)


def M_copper():
    return mat('Copper roof', '#3f9c86', rough=.4, metal=.35)


def lamp_glass():
    return glow('Lamp glass', '#bfe6f2', '#ffd27a', rough=.08)


def lamp_star():
    return glow('Lamp star', '#ffc93a', '#ffd45a', rough=.22, metal=.6)


def star_outline(r_out, r_in=None, points=5, rot=math.pi / 2):
    r_in = r_in if r_in is not None else r_out * .45
    out = []
    for i in range(points * 2):
        a = rot + math.pi * i / points
        rr = r_out if i % 2 == 0 else r_in
        out.append((math.cos(a) * rr, math.sin(a) * rr))
    return out


def gem_star(mb, c, r, depth=.1, facing=(0, -1, 0), tint=1.0, tag='star', r_in=.46):
    """Faceted 5-point star: flat outline with centre points pushed out front and back (reads chunky and bright)."""
    f = V(facing).normalized()
    up = V((0, 0, 1)) if abs(f.z) < .9 else V((0, 1, 0))
    side = up.cross(f).normalized()
    upv = f.cross(side).normalized()
    bm = bmesh.new()
    ring = [bm.verts.new(V(c) + side * x + upv * y) for x, y in star_outline(r, r * r_in)]
    front = bm.verts.new(V(c) + f * depth)
    back = bm.verts.new(V(c) - f * depth)
    n = len(ring)
    for i in range(n):
        bm.faces.new((ring[i], ring[(i + 1) % n], front))
        bm.faces.new((ring[(i + 1) % n], ring[i], back))
    bm.normal_update()
    for fc in bm.faces:
        if fc.normal.dot(fc.calc_center_median() - V(c)) < 0:
            fc.normal_flip()
    mb.append(bm, None, tint, smooth=0, flat=True, tag=tag)


def hip_roof(A, roof_mat, H, eave_z, pitch, sag=.15, lift_k=.2, style='seam', under_mat=None, fascia_mat=None,
             seed=3, cap_mat=None, apex_extra=0.0, cx=0.0, cy=0.0, group=None, caps=True):
    """Square pyramid roof (hogyo) of half size H with upswept (sori) corners. Returns (slopes, roof)."""
    st = ROOF_STYLES[style] if isinstance(style, str) else style

    def lift(p):
        x, y = abs(p[0] - cx) / H, abs(p[1] - cy) / H
        return lift_k * (x * y) ** 2.2
    roof = Roof(eave_z, pitch, H, sag, lift)
    corners = [(cx - H, cy - H), (cx + H, cy - H), (cx + H, cy + H), (cx - H, cy + H)]
    apex = (cx, cy)
    slopes = []
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        s = Slope(roof, [a, b, apex], a, b, ['eave', 'hip', 'hip'])
        tile_slope(A, s, roof_mat, st, under_mat, fascia_mat, seed=seed + i, group=group)
        slopes.append(s)
    if caps:
        for i in range(4):
            c = corners[i]
            p_low = V((c[0] + (cx - c[0]) * .02, c[1] + (cy - c[1]) * .02))
            hip_cap(A, cap_mat or roof_mat, slopes[i], p_low, V(apex), n=6, w=.18, group=group)
    return slopes, roof


@builder('star-lamp')
def build_star_lamp():
    A = Asset('star-lamp', 'Star lamp')
    rng = random.Random(55)
    P, W, VM, CU, BR = M_plaster(), M_wood(), M_vermilion(), M_copper(), M_brass()
    LGL, LST = lamp_glass(), lamp_star()
    pm, wm, vm, bm_ = A.mb(P), A.mb(W), A.mb(VM), A.mb(BR)

    def st_t(k=1.0):
        t = stone_tint(rng, k)
        return (t[0] * 1.1, t[1] * 1.1, t[2] * 1.12)

    # ---- carved stone base (toro tiers)
    pm.box((0, 0, -.25), (2.6, 2.6, 1.1), ch=.06, seg=2, tint=st_t(.95), tag='base')
    pm.box((0, 0, .34), (2.44, 2.44, .12), ch=.04, seg=1, tint=st_t(1.08), tag='base')
    constellation = [(-.42, .08), (-.22, -.06), (0, .04), (.2, -.08), (.4, .06), (.1, .14)]
    for side in ('-y', '+x', '+y', '-x'):
        f, L = rect_face(-1.3, 1.3, -1.3, 1.3, side)
        f.box(pm, L / 2, .0, .0, 1.7, .46, .04, ch=.02, tint=st_t(.78), tag='base panel')
        # a small constellation of gold studs joined by fine brass lines, and the lamp's star in the middle
        pts = [f.p(L / 2 + x, .0 + y, .035) for x, y in constellation]
        for p in pts:
            A.mb(LST).cyl(p, .04, .03, n=6, rot=(math.pi / 2, 0, f.rot), tag='star inlay')
        for a_, b_ in zip(pts, pts[1:5]):
            bm_.beam(a_, b_, .012, .012, up=f.n, tag='star inlay lines')
        A.mb(LST).extrude(star_outline(.12), .03, f.p(L / 2 + .1, .14, .035), rot=(0, 0, f.rot), tag='star inlay')
    # lotus tier: an octagonal drum wrapped in upturned petals
    pm.lathe([(0, .4), (1.02, .4), (1.02, .5), (.92, .56), (.82, .6), (.8, .84), (0, .84)], (0, 0, 0), n=8,
             tint=st_t(1.0), tag='lotus', smooth=30)
    for i in range(12):
        a = TAU * i / 12
        o = V((math.cos(a), math.sin(a), 0))
        petal = [(-.2, 0), (.2, 0), (.24, .14), (.12, .28), (0, .34), (-.12, .28), (-.24, .14)]
        pm.extrude(petal, .08, o * .88 + V((0, 0, .5)), rot=(-.5, 0, a + math.pi / 2), bevel=0,
                   tint=st_t(1.12), tag='lotus')
    # column (sao) with carved bands
    pm.lathe([(0, .84), (.62, .84), (.62, .94), (.54, 1.0), (.5, 1.1), (.48, 2.2), (.56, 2.26), (.56, 2.36),
              (.5, 2.42), (.5, 2.58), (0, 2.58)], (0, 0, 0), n=12, tint=st_t(1.12), tag='column', smooth=40)
    # shimenawa (twisted straw rope) with shide paper zigzags
    rope = []
    for i in range(25):
        a = TAU * i / 24
        rope.append(V((math.cos(a) * .56, math.sin(a) * .56, 1.75 + .02 * math.sin(a * 3))))
    pm.append(bm_loft(rope, [(math.cos(TAU * k / 6) * .08, math.sin(TAU * k / 6) * .09) for k in range(6)],
                      closed=True, caps=False), None, (1.0, .86, .55), smooth=60, tag='shimenawa')
    for i in range(6):
        a = TAU * i / 6 + .3
        c = V((math.cos(a) * .57, math.sin(a) * .57, 1.75))
        pm.sphere(c, (.1, .1, .09), seg=6, rings=4, rot=(0, 0, a), tint=(.95, .82, .5), tag='shimenawa')
    for i in range(4):
        a = TAU * i / 4 + math.pi / 4
        o = V((math.cos(a), math.sin(a), 0))
        side = V((-o.y, o.x, 0))
        base = V((0, 0, 1.67)) + o * .64
        zig = [(0, 0), (.09, -.08), (0, -.16), (.09, -.24), (0, -.32)]
        for k in range(len(zig) - 1):
            p0 = base + side * (zig[k][0] - .045) + V((0, 0, zig[k][1]))
            p1 = base + side * (zig[k + 1][0] - .045) + V((0, 0, zig[k + 1][1]))
            pm.poly([p0, p0 + side * .1, p1 + side * .1, p1], tint=1.05, normal=o, tag='shide')
    # middle platform stone (chudai)
    pm.lathe([(0, 2.58), (.7, 2.58), (1.02, 2.8), (1.06, 2.9), (1.06, 3.0), (0, 3.0)], (0, 0, 0), n=8,
             tint=st_t(1.08), tag='chudai', smooth=30)

    # ---- vermilion timber tower: posts, through-tenon nuki beams, knee brackets
    Z0, Z1 = 3.0, 6.78
    h0, h1 = .74, .58

    def half(z):
        return lerp(h0, h1, (z - Z0) / (Z1 - Z0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            vm.beam((sx * h0, sy * h0, Z0 - .02), (sx * h1, sy * h1, Z1), .19, .19, up=V((0, 1, 0)), ch=.025, tag='posts')
            A.mb(P).box((sx * h0, sy * h0, Z0 + .04), (.3, .3, .08), ch=.02, tint=st_t(1.1), tag='post feet')
            bm_.box((sx * h0, sy * h0, Z0 + .18), (.22, .22, .07), tag='post bands')
            bm_.box((sx * h1, sy * h1, Z1 - .2), (.21, .21, .06), tag='post bands')
    rings_z = [3.15, 4.45, 5.6, 6.68]
    for k, z in enumerate(rings_z):
        hz = half(z)
        ext = .22 if k in (1, 2) else .12
        for side in range(4):
            a = side * math.pi / 2
            o = V((math.cos(a), math.sin(a), 0))
            t = V((-o.y, o.x, 0))
            p0, p1 = o * hz + t * (hz + ext), o * hz - t * (hz + ext)
            vm.beam(V((p0.x, p0.y, z)), V((p1.x, p1.y, z)), .12, .16 if k in (1, 2) else .14, ch=.015, tag='nuki')
    # bottom bay: X braces; top bay: knee brackets under the balcony ring
    za, zb = rings_z[0] + .08, rings_z[1] - .08
    for side in range(4):
        a = side * math.pi / 2
        o = V((math.cos(a), math.sin(a), 0))
        t = V((-o.y, o.x, 0))
        for s in (-1, 1):
            pa = o * (half(za) - .02) + t * s * (half(za) - .06)
            pb = o * (half(zb) - .02) - t * s * (half(zb) - .06)
            wm.beam(V((pa.x, pa.y, za)), V((pb.x, pb.y, zb)), .08, .09, tint=dark(), tag='braces')
        for s in (-1, 1):
            z_lo, z_hi = rings_z[2] + .1, rings_z[3] - .08
            pa = o * (half(z_lo) - .02) + t * s * (half(z_lo) - .1)
            pb = o * (half(z_hi) - .02) + t * s * (half(z_hi) - .45)
            wm.beam(V((pa.x, pa.y, z_lo)), V((pb.x, pb.y, z_hi)), .08, .09, tint=dark(), tag='braces')
    # middle bay: a lacquered panel with a gold star on the front
    zm = (rings_z[1] + rings_z[2]) / 2
    for side in range(4):
        a = side * math.pi / 2
        o = V((math.cos(a), math.sin(a), 0))
        t = V((-o.y, o.x, 0))
        hz = half(zm)
        c = o * (hz - .01)
        wm.box(V((c.x, c.y, zm)), (.06, 2 * hz - .2, rings_z[2] - rings_z[1] - .2), rot=(0, 0, a), tint=.2, tag='panels')
        A.mb(LST).extrude(star_outline(.22), .03, V((c.x, c.y, zm)) + o * .04, rot=(0, 0, a - math.pi / 2),
                          tag='panel stars')
    # ---- keeper's balcony with railing (open on +X for the ladder)
    B0 = 6.82
    wm.box((0, 0, B0), (1.96, 1.96, .1), ch=.02, tint=.85, tag='balcony')
    for i in range(7):
        wm.box((-.84 + i * .28, 0, B0 + .055), (.26, 1.92, .02), tint=.9 + .1 * rng.random(), tag='balcony')
    rail_h = .55
    for (px, py) in [(-.93, -.93), (.93, -.93), (.93, .93), (-.93, .93), (0, -.93), (-.93, 0), (0, .93)]:
        vm.box((px, py, B0 + .05 + rail_h / 2), (.08, .08, rail_h), tag='railing')
        bm_.sphere((px, py, B0 + .07 + rail_h), .05, seg=6, rings=4, tag='railing')
    for (a, b) in [((-.93, -.93), (.93, -.93)), ((-.93, .93), (.93, .93)), ((-.93, -.93), (-.93, .93)),
                   ((.93, -.93), (.93, -.45)), ((.93, .45), (.93, .93))]:
        for z in (B0 + .3, B0 + rail_h):
            vm.beam((a[0], a[1], z), (b[0], b[1], z), .05, .05, tag='railing')

    # ---- lamp chamber: crystal glass behind a brass star lattice, black-lacquer frame
    C0, C1 = 6.92, 8.28
    CH = .54
    zc = (C0 + C1) / 2
    A.mb(LGL).box((0, 0, zc), (2 * CH - .04, 2 * CH - .04, C1 - C0 - .1), ch=.02, tag='chamber glass')
    wm.box((0, 0, C0 + .03), (2 * CH + .16, 2 * CH + .16, .1), ch=.02, tint=.2, tag='chamber frame')
    wm.box((0, 0, C1 - .03), (2 * CH + .16, 2 * CH + .16, .1), ch=.02, tint=.2, tag='chamber frame')
    for sx in (-1, 1):
        for sy in (-1, 1):
            vm.box((sx * CH, sy * CH, zc), (.1, .1, C1 - C0), ch=.012, tag='chamber posts')
    for side in ('-y', '+x', '+y', '-x'):
        f, L = rect_face(-CH + .02, CH - .02, -CH + .02, CH - .02, side)
        ring_pts = star_outline(.36, .155)
        for k in range(10):
            p0 = V(ring_pts[k])
            p1 = V(ring_pts[(k + 1) % 10])
            a3 = f.p(L / 2 + p0.x, zc + p0.y, .02)
            b3 = f.p(L / 2 + p1.x, zc + p1.y, .02)
            bm_.beam(a3, b3, .03, .025, up=f.n, tag='star lattice')
        f.box(bm_, L / 2, zc - .5, .02, L - .04, .03, .02, tag='star lattice')
        f.box(bm_, L / 2, zc + .5, .02, L - .04, .03, .02, tag='star lattice')
    A.marker('Flame', (0, 0, zc))

    # ---- copper pyramid roof with upswept corners, bells, jewel and the star finial
    RH = 1.12
    slopes, roof = hip_roof(A, CU, RH, 8.36, .52, sag=.3, lift_k=.26,
                            style=dict(ROOF_STYLES['seam'], pitch=.3, course=.5, thick=.1),
                            under_mat=W, fascia_mat=W, cap_mat=CU, seed=7)
    wm.box((0, 0, 8.32), (1.1, 1.1, .12), tint=.2, tag='roof base')
    apex_z = roof.z(V((0, 0)), RH)
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = V((sx * RH * .97, sy * RH * .97, 0))
            cz = slopes[0].roof.z(c, 0) - .1
            bm_.rod((c.x, c.y, cz), (c.x, c.y, cz - .16), .01, n=4, tag='bells')
            bm_.lathe([(0, 0), (.08, 0), (.085, .02), (.068, .11), (.034, .17), (0, .18)], (c.x, c.y, cz - .36), n=8,
                      tag='bells')
            bm_.box((c.x, c.y, cz - .46), (.012, .08, .13), tag='bells')
    bm_.lathe([(0, apex_z - .05), (.16, apex_z - .05), (.18, apex_z + .02), (.1, apex_z + .06), (.12, apex_z + .1),
               (.15, apex_z + .16), (.1, apex_z + .25), (0, apex_z + .3)], (0, 0, 0), n=10, tag='finial')
    sc = V((0, 0, apex_z + .5))
    gem_star(A.mb(LST), sc, .32, depth=.11, facing=(0, -1, 0), tag='finial star')
    gem_star(A.mb(LST), sc, .25, depth=.09, facing=(1, 0, 0), tag='finial star')
    bm_.rod((0, 0, apex_z + .25), (0, 0, apex_z + .32), .02, n=6, tag='finial')

    # ---- ladder on +X (tier top to above the balcony), with stand-off brackets
    LX = 1.15
    for sy in (-1, 1):
        wm.box((LX, sy * .21, (.4 + B0 + .9) / 2), (.06, .06, B0 + .9 - .4), tint=dark(1.1), tag='ladder')
    n_r = int((B0 + .7 - .6) / .3)
    for k in range(n_r):
        wm.box((LX, 0, .62 + k * .3), (.045, .42, .04), tint=dark(1.35), tag='ladder')
    for z in (1.5, 3.3, 5.0, 6.3):
        wm.beam((LX, 0, z), ((half(z) + .06) if z > Z0 else .52, 0, z), .05, .05, tint=dark(), tag='ladder')

    return A.finish(ao_distance=1.0, ao_strength=.6, ground=0.0)


# ---------------------------------------------------------------- Kawabe houses

BAMBOO = (.6, .55, .22)
BENGARA = (.62, .4, .34)      # red-ochre lacquered lattice (tint on the wood material)


def udatsu(A, plaster, wood, roof_mat, x, y0, y1, z0, z1, t=.26, rng=None):
    """Raised firewall wing (udatsu) at a party wall: plaster slab framed in timber with a tiled cap."""
    pm, wm, rm = A.mb(plaster), A.mb(wood), A.mb(roof_mat)
    yc, dy = (y0 + y1) / 2, y1 - y0
    pm.box((x, yc, (z0 + z1) / 2), (t, dy, z1 - z0), ch=.02, tint=.97, tag='udatsu')
    wm.box((x, y0 + .05, (z0 + z1) / 2), (t + .04, .1, z1 - z0), ch=.015, tint=dark(), tag='udatsu', front=False)
    wm.box((x, yc, z0 + .06), (t + .04, dy + .02, .12), ch=.015, tint=dark(), tag='udatsu')
    for s_ in (-1, 1):
        rm.box((x + s_ * (t / 2 + .05), yc - .08, z1 + .07), (.3, dy + .4, .07), rot=(0, s_ * .5, 0), ch=.015, tint=.9,
               tag='udatsu')
    rm.append(bm_cyl(.07, dy + .46, 8), xform((x, yc - .08, z1 + .16), (math.pi / 2, 0, 0)), .85, smooth=50, tag='udatsu')
    for yy in (y0 - .31, y1 + .15):
        rm.cyl((x, yy, z1 + .16), .09, .06, n=8, rot=(math.pi / 2, 0, 0), tint=.75, tag='udatsu')


def inuyarai(A, mat_, face, u0, u1, h=.9, depth=.55, gap=.11, tint=BAMBOO, tag='inuyarai'):
    """Curved bamboo 'dog fence' leaning against the base of a wall (bamboo painted from plaster)."""
    mb = A.mb(mat_)
    n = max(2, int((u1 - u0) / gap))
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        pts = [face.p(u, math.sin(t * math.pi / 2) * h, depth * math.cos(t * math.pi / 2)) for t in (0, .25, .5, .75, 1)]
        k = .9 + .1 * ((i * 37) % 7) / 6
        mb.append(bm_loft(pts, [(math.cos(TAU * j / 4) * .02, math.sin(TAU * j / 4) * .02) for j in range(4)],
                          closed=True, caps=False), None, (tint[0] * k, tint[1] * k, tint[2] * k), smooth=60, tag=tag)
    for t in (.35, .72):
        a = t * math.pi / 2
        z, d = math.sin(a) * h, depth * math.cos(a)
        mb.rod(face.p(u0 - .03, z, d + .02), face.p(u1 + .03, z, d + .02), .018, n=4,
               tint=(tint[0] * .8, tint[1] * .8, tint[2] * .8), tag=tag)


def mushiko(A, face, hole, plaster, glass, reveal_mb, slat=.07, gap=.06, depth=.14, tag='mushiko'):
    """Machiya upper window: thick plastered vertical slats over a dark (glowing) opening."""
    ua, ub, za, zb = hole
    reveal(reveal_mb, face, hole, depth, tint=.8, tag=tag)
    face.quad(A.mb(glass), ua, za, ub, zb, d=-depth + .01, tag=tag + ' glass')
    n = max(2, int((ub - ua) / (slat + gap)))
    step = (ub - ua) / n
    pm = A.mb(plaster)
    for i in range(n - 1):
        u = ua + step * (i + 1)
        face.box(pm, u, (za + zb) / 2, -.04, slat, zb - za, .09, ch=.02, tint=.95, tag=tag)


def sudare(A, mat_, face, u, z_top, w, h, d=.22, tint=BAMBOO, tag='sudare'):
    """Rolled-down bamboo blind: fine vertical bamboo strips with a rolled top."""
    mb = A.mb(mat_)
    rng = random.Random(3)
    bm = bmesh.new()
    colmap = {}
    n = int(w / .045)
    for i in range(n):
        ua = u - w / 2 + i * w / n
        ub = ua + w / n * .82
        k = .82 + .18 * rng.random()
        vs = [bm.verts.new(face.p(x, z, d)) for x, z in ((ua, z_top - h), (ub, z_top - h), (ub, z_top), (ua, z_top))]
        colmap[bm.faces.new(vs)] = (tint[0] * k, tint[1] * k, tint[2] * k)
    for z in (z_top - h * .3, z_top - h * .7):
        vs = [bm.verts.new(face.p(x, zz, d + .008)) for x, zz in ((u - w / 2, z - .02), (u + w / 2, z - .02),
                                                                   (u + w / 2, z + .02), (u - w / 2, z + .02))]
        colmap[bm.faces.new(vs)] = (tint[0] * .5, tint[1] * .45, tint[2] * .4)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(face.n) < 0:
            f.normal_flip()
    _append_colored(mb, bm, colmap, tag=tag, smooth=10)
    mb.append(bm_cyl(.045, w + .06, 8), xform(face.p(u, z_top + .03, d), Matrix.Rotation(face.rot, 3, 'Z') @
                                               Matrix.Rotation(math.pi / 2, 3, 'Y')), tint, smooth=50, tag=tag)


def bench_battari(A, mat_, face, u, w, z=.45, d=.35, tint=WOOD_MID, tag='bench'):
    wm = A.mb(mat_)
    face.box(wm, u, z, d, w, .06, .45, ch=.012, tint=tint, tag=tag)
    for s in (-1, 1):
        face.box(wm, u + s * (w / 2 - .12), z / 2, d + .1, .07, z, .07, tint=dark(1.2), tag=tag)
        wm.beam(face.p(u + s * (w / 2 - .12), z - .03, .02), face.p(u + s * (w / 2 - .12), z - .03, d + .16), .06, .06,
                tint=dark(1.1), tag=tag)


def bonsai(A, pot_mat, leaf_mat, wood_mat, c, rng, s=1.0, tag='bonsai'):
    """Shallow pot with a twisted trunk and cloud-pad foliage."""
    c = V(c)
    A.mb(pot_mat).box(c + V((0, 0, .06 * s)), (.46 * s, .3 * s, .12 * s), ch=.02, tint=.55, tag=tag)
    pts = [c + V((0, 0, .12 * s)), c + V((.06 * s, 0, .25 * s)), c + V((-.05 * s, .02, .38 * s)),
           c + V((.08 * s, 0, .5 * s))]
    A.mb(wood_mat).loft(pts, [(math.cos(TAU * k / 5) * .035 * s, math.sin(TAU * k / 5) * .035 * s) for k in range(5)],
                        closed=True, caps=False, tint=.5, tag=tag)
    lm = A.mb(leaf_mat)
    for p, r in ((pts[1] + V((-.16 * s, 0, .08 * s)), .13), (pts[2] + V((.15 * s, 0, .06 * s)), .12),
                 (pts[3] + V((0, 0, .06 * s)), .15)):
        leafy(lm, p, (r * 1.4 * s, r * s, r * .55 * s), rng, seg=7, rings=4, jitter=.2, tint=.62 + .1 * rng.random(),
              tag=tag)


@builder('kawabe-house-a')
def build_kawabe_house_a():
    A = Asset('kawabe-house-a', 'Kawabe house A')
    rng = random.Random(61)
    P, W, R, G, NO = M_plaster(), M_wood(), M_kroof(), M_leaf(), M_noren('#2c4f8e')
    WG, LG = window_glow(), lantern_glow()
    pm, wm = A.mb(P), A.mb(W)

    X0, X1, Y0, Y1 = -3.15, 3.15, -2.45, 2.45
    ZF = .28
    Z1 = 3.05          # ground-floor wall top (pent roof line)
    Z2 = 5.2           # upper wall top
    L = X1 - X0

    plinth(A, P, X0 - .1, X1 + .1, Y0 - .1, Y1 + .1, z_top=ZF - .02, rng=rng, depth=.24, wmin=.5, wmax=.95)

    # ---- ground floor
    gh = {'-y': [(.2, 2.35, .62, 2.55), (2.55, 3.75, ZF, 2.35), (3.95, 6.1, .62, 2.55)],
          '+x': [(1.9, 3.0, 1.0, 2.2)], '+y': [(1.2, 2.2, 1.0, 2.1), (3.9, 4.9, ZF, 2.2)], '-x': [(2.2, 3.0, 1.2, 2.0)]}
    gposts = {'-y': [0, 2.45, 3.85, L], '+x': [0, 1.6, 3.3, 4.9], '+y': [0, 2.0, 3.8, L], '-x': [0, 1.6, 3.3, 4.9]}
    faces = {}
    for side in ('-y', '+x', '+y', '-x'):
        f, Lf = rect_face(X0, X1, Y0, Y1, side)
        faces[side] = (f, Lf)
        timber_wall(A, f, Lf, ZF, Z1, gh[side], P, W, gposts[side], [ZF + .07, 2.62], board_top=1.1 if side != '-y' else .62,
                    rng=rng, post_ext=(.05, .05))
        f.box(wm, Lf / 2, Z1 - .08, .04, Lf + .1, .18, .13, ch=.02, tint=dark(.9), tag='beams')
    ff, Lf = faces['-y']
    for h in gh['-y']:
        if h[2] > ZF + .01:
            koshi(A, ff, h, W, WG, pm, slat=.045, gap=.055, tint=BENGARA, rails=1)
    # sliding lattice entrance door (half open) with noren and lantern
    dh = gh['-y'][1]
    reveal(pm, ff, dh, .14, tint=.7, sides='lrt')
    ff.quad(A.mb(WG), dh[0], dh[2], dh[1], dh[3], d=-.13)
    for k, off in enumerate((0.0, .5)):
        u0 = dh[0] + off
        # frame of each sliding leaf
        for uu in (u0 + .03, u0 + .57):
            ff.box(wm, uu, (dh[2] + dh[3]) / 2, -.07 - .04 * k, .06, dh[3] - dh[2], .05, tint=BENGARA, tag='door')
        for zz in (dh[2] + .05, dh[2] + .75, dh[3] - .05):
            ff.box(wm, u0 + .3, zz, -.07 - .04 * k, .6, .06, .05, tint=BENGARA, tag='door')
        ff.box(wm, u0 + .3, dh[2] + .4, -.08 - .04 * k, .54, .6, .03, tint=dark(.9), tag='door')
        for j in range(5):
            ff.box(wm, u0 + .1 + j * .1, (dh[2] + .8 + dh[3]) / 2, -.075 - .04 * k, .025, dh[3] - dh[2] - .85, .03,
                   tint=BENGARA, tag='door')
    noren(A, ff, (dh[0] + dh[1]) / 2, dh[3] - .02, 1.1, .7, NO, W, panels=2, crest_mat=P, rng=rng, d=.1)
    kawabe_lantern(A, LG, W, ff, dh[1] + .45, 1.95, d=.32, r=.18, h=.38)
    # inuyarai under the lattice windows, fold-down bench
    inuyarai(A, P, ff, .25, 2.3, h=.85, depth=.5)
    bench_battari(A, W, ff, 5.05, 1.7, z=.42, d=.32)
    for i, u in enumerate((4.4, 5.7)):
        bonsai(A, P, G, W, ff.p(u, .48, .35), rng, s=.9)
    # threshold stone
    stone(pm, ff.p((dh[0] + dh[1]) / 2, .04, .35), (1.3, .6, .14), 0, rng, tint=stone_tint(rng, 1.05), tag='threshold')

    # other ground-floor openings
    for side in ('+x', '+y', '-x'):
        f, Lf = faces[side]
        for h in gh[side]:
            if h[2] <= ZF + .01:
                panel_door(A, f, h, W, pm, leaf_tint=.62, frame_mat=W, panels=3)
            else:
                koshi(A, f, h, W, WG, pm, tint=dark(1.05), rails=1)

    # ---- pent roof between floors (front and back)
    for sgn, yw in ((-1, Y0), (1, Y1)):
        run = .85
        pr = Roof(0, .38, run, sag=.12)
        pr.eave_z = Z1 + .02
        ye = yw + sgn * run
        poly = [(X0 - .2, ye), (X1 + .2, ye), (X1 + .2, yw), (X0 - .2, yw)]
        a_, b_ = (X0 - .2, ye), (X1 + .2, ye)
        if sgn > 0:
            poly = [(X1 + .2, ye), (X0 - .2, ye), (X0 - .2, yw), (X1 + .2, yw)]
            a_, b_ = (X1 + .2, ye), (X0 - .2, ye)
        ps = Slope(pr, poly, a_, b_, ['eave', 'verge', 'wall', 'verge'])
        tile_slope(A, ps, R, dict(ROOF_STYLES['kawara'], thick=.12, course=.34, pitch=.38, line_r=.065, line_sides=3,
                                  cell_mult=2), under_mat=W, fascia_mat=W, seed=20 + sgn)
        rafters(A, W, ps, run, spacing=.42, w=.06, h=.07, tint=dark(), thick=.12)
        for xe in (X0 - .2, X1 + .2):
            bargeboard(A, W, ps, (xe, ye), (xe, yw), h=.18, t=.06, tint=dark(), n=3)
        wm.box((0, yw + sgn * .04, pr.z(V((0, yw)), run) + .02), (L + .4, .08, .1), tint=dark(), tag='flashing')

    # ---- upper storey (lower, set on a floor band)
    uh = {'-y': [(.6, 2.6, 3.65, 4.6), (3.8, 5.8, 3.65, 4.6)], '+x': [(1.9, 3.0, 3.7, 4.55)], '+y': [(2.6, 3.8, 3.7, 4.6)],
          '-x': []}
    uposts = {'-y': [0, 3.2, L], '+x': [0, 2.45, 4.9], '+y': [0, 2.3, 4.1, L], '-x': [0, 2.45, 4.9]}
    for side in ('-y', '+x', '+y', '-x'):
        f, Lf = faces[side]
        timber_wall(A, f, Lf, Z1 + .04, Z2, uh[side], P, W, uposts[side], [Z1 + .12], rng=rng)
        f.box(wm, Lf / 2, Z2 - .08, .04, Lf + .1, .18, .13, ch=.02, tint=dark(.9), tag='beams')
        for h in uh[side]:
            if side == '-y':
                mushiko(A, f, h, P, WG, pm)
            else:
                koshi(A, f, h, W, WG, pm, tint=BENGARA, rails=1)
    # bamboo blind on the right upper window
    sudare(A, P, faces['-y'][0], 4.8, 4.75, 2.2, .75, d=.18)
    # udatsu firewall wings at both party walls, name plaque by the door
    for xw in (X0 - .02, X1 + .02):
        udatsu(A, P, W, R, xw, Y0 - .55, Y0 + .35, Z1 + .15, Z2 + .35)
    ff.box(wm, gh['-y'][1][0] - .35, 1.75, .05, .16, .5, .03, ch=.008, tint=.95, tag='plaque')

    # ---- main gable roof along X
    EO, VO = .55, .32
    thick = ROOF_STYLES['kawara']['thick']
    pitch = .52
    D = (Y1 - Y0) / 2 + EO
    roof = Roof(0, pitch, D, sag=.2)
    roof.eave_z = Z2 + thick + .02 - roof.g(EO)
    st = dict(ROOF_STYLES['kawara'], pitch=.48, course=.46, line_sides=3, cell_mult=2)
    front, back, _ = gable_roof(A, R, X0 - VO, X1 + VO, -D, D, roof.eave_z, pitch, sag=.2, style=st, under_mat=W,
                                fascia_mat=W, seed=31, ridge_layers=3, ridge_w=.4)
    for s in (front, back):
        rafters(A, W, s, EO + .03, spacing=.44, w=.075, h=.09, tint=dark(), thick=thick)
    for xe in (X0 - VO, X1 + VO):
        for s, ye in ((front, -D), (back, D)):
            bargeboard(A, W, s, (xe, ye), (xe, 0), h=.34, t=.09, tint=dark(), out=V((1 if xe > 0 else -1, 0)))
    for side in ('+x', '-x'):
        f, Lf = faces[side]
        top = under_fn([front, back], f, thick, u0=0, u1=Lf)
        panel(pm, f, 0, Lf, Z2, 9.0, [], top=top, tag='gable')
        collar(f, wm, top, Lf, Z2 + .55)
        f.box(wm, Lf / 2, (Z2 + top(Lf / 2)) / 2, .035, .14, top(Lf / 2) - Z2, .1, ch=.015, tint=dark(), tag='gable timber')
        # small lattice vent under the apex
        f.box(wm, Lf / 2, Z2 + 1.05, .04, .7, .32, .05, tint=.18, tag='vent')
        for k in range(5):
            f.box(wm, Lf / 2 - .28 + k * .14, Z2 + 1.05, .07, .04, .32, .03, tint=dark(), tag='vent')

    # ---- back: rain barrel and a pot of morning glories on a bamboo trellis
    fb, Lb = faces['+y']
    A.mb(W).lathe([(0, 0), (.3, 0), (.34, .15), (.36, .38), (.34, .6), (.3, .72), (0, .7)], fb.p(.5, 0, .45), n=12,
                  tint=.75, tag='barrel')
    for z in (.14, .58):
        A.mb(W).cyl(fb.p(.5, z, .45), .355, .05, n=12, tint=.22, tag='barrel')
    potted_plant(A, R, G, fb.p(5.5, 0, .35), r=.2, h=.3, kind='bush', rng=rng)

    return A.finish(ao_distance=1.2, ao_strength=.62)


def glass_slider(A, face, u0, u1, za, zb, wood, glass, d=-.06, tint=WOOD_MID, rows=3, cols=2, board=.55, tag='sliders'):
    """One glazed sliding door leaf: frame, lower board panel, glass with kumiko bars."""
    wm = A.mb(wood)
    w, h = u1 - u0, zb - za
    uc = (u0 + u1) / 2
    face.quad(A.mb(glass), u0 + .04, za + board, u1 - .04, zb - .04, d=d - .015, tag=tag + ' glass')
    for uu in (u0 + .03, u1 - .03):
        face.box(wm, uu, (za + zb) / 2, d, .06, h, .05, tint=tint, tag=tag)
    for zz in (za + .04, za + board, zb - .03):
        face.box(wm, uc, zz, d, w, .06 if zz != za + board else .05, .05, tint=tint, tag=tag)
    face.box(wm, uc, za + board / 2, d - .01, w - .08, board - .06, .03, tint=tmul(tint, .85), tag=tag)
    for i in range(1, cols):
        face.box(wm, u0 + w * i / cols, (za + board + zb) / 2, d + .005, .025, zb - za - board - .06, .03, tint=tint,
                 tag=tag)
    for j in range(1, rows):
        face.box(wm, uc, za + board + (zb - za - board) * j / rows, d + .005, w - .08, .025, .03, tint=tint, tag=tag)


@builder('kawabe-house-b')
def build_kawabe_house_b():
    A = Asset('kawabe-house-b', 'Kawabe house B')
    rng = random.Random(71)
    P, W, R, G, IR = M_plaster(), M_wood(), M_kroof(), M_leaf(), M_iron()
    NOC = M_noren('#2a4f8c')
    WG = window_glow()
    pm, wm = A.mb(P), A.mb(W)

    X0, X1, Y0, Y1 = -3.5, 3.5, -2.35, 2.35
    ZF, ZT = .5, 2.85            # raised floor, wall top
    L = X1 - X0
    EY = -3.15                   # engawa front edge

    plinth(A, P, X0 - .1, X1 + .1, Y0 - .1, Y1 + .1, z_top=ZF - .12, rng=rng, depth=.24, wmin=.55, wmax=1.0)

    # ---- walls: front of sliding glass doors, plaster elsewhere
    holes = {'-y': [(.1, L - .1, ZF, 2.3)], '+x': [(2.2, 3.1, 1.2, 2.05)], '+y': [(1.2, 2.3, 1.2, 2.05), (4.6, 5.7, 1.2, 2.05)],
             '-x': [(1.3, 2.9, ZF - .3, 2.25)]}
    posts = {'-y': [0, L / 4, L / 2, 3 * L / 4, L], '+x': [0, 1.6, 3.1, 4.7], '+y': [0, 2.5, 4.4, L], '-x': [0, 1.1, 3.1, 4.7]}
    faces = {}
    for side in ('-y', '+x', '+y', '-x'):
        f, Lf = rect_face(X0, X1, Y0, Y1, side)
        faces[side] = (f, Lf)
        if side == '-y':
            for u in posts[side]:
                f.box(wm, u, (ZF - .1 + ZT) / 2, .035, .2, ZT - ZF + .1, .12, ch=.02, tint=dark(), tag='posts')
            f.box(wm, L / 2, 2.55, .03, L, .2, .1, ch=.02, tint=dark(), tag='beams')
            panel(pm, f, 0, L, 2.3, ZT, [], tag='plaster')
            f.box(wm, L / 2, ZF - .04, .03, L, .12, .12, tint=dark(), tag='beams')
            for b in range(4):
                ua, ub = posts[side][b] + .1, posts[side][b + 1] - .1
                mid = (ua + ub) / 2
                reveal(pm, f, (ua, ub, ZF, 2.3), .3, tint=.6, sides='t')
                if b in (1, 2):
                    # glass doors slid aside: white shoji screens and the floor edge show behind
                    glass_slider(A, f, ua, mid + .03, ZF + .02, 2.28, W, WG, d=-.1, tint=WOOD_MID * .95)
                    glass_slider(A, f, ua + .06, mid + .09, ZF + .02, 2.28, W, WG, d=-.04, tint=WOOD_MID * .95)
                    A.mb(W).poly([f.p(mid - .05, ZF + .012, 0), f.p(ub, ZF + .012, 0), f.p(ub, ZF + .012, -.3),
                                  f.p(mid - .05, ZF + .012, -.3)], tint=.95, normal=Z, tag='floor edge')
                    f.box(pm, (mid + ub) / 2, (ZF + 2.28) / 2, -.28, ub - mid + .05, 2.28 - ZF, .02, tint=1.0,
                          tag='shoji')
                    for k in range(1, 4):
                        f.box(wm, mid - .05 + (ub - mid + .05) * k / 4, (ZF + 2.28) / 2, -.26, .025, 2.28 - ZF, .02,
                              tint=WOOD_MID, tag='shoji')
                    for k in range(1, 6):
                        f.box(wm, (mid + ub) / 2, ZF + (2.28 - ZF) * k / 6, -.26, ub - mid + .05, .025, .02,
                              tint=WOOD_MID, tag='shoji')
                    f.box(wm, (mid + ub) / 2, ZF + .12, -.265, ub - mid + .05, .22, .025, tint=WOOD_MID * .8, tag='shoji')
                else:
                    glass_slider(A, f, ua, mid + .03, ZF + .02, 2.28, W, WG, d=-.1, tint=WOOD_MID * .95)
                    glass_slider(A, f, mid - .03, ub, ZF + .02, 2.28, W, WG, d=-.04, tint=WOOD_MID * .95)
        else:
            timber_wall(A, f, Lf, ZF - .1, ZT, holes[side], P, W, posts[side], [ZF - .03, 1.15, 2.3], board_top=1.15,
                        rng=rng, post_ext=(.0, .08))
        f.box(wm, Lf / 2, ZT - .08, .04, Lf + .1, .18, .14, ch=.02, tint=dark(.9), tag='beams')
    for side in ('+x', '+y'):
        f, Lf = faces[side]
        for h in holes[side]:
            koshi(A, f, h, W, WG, pm, tint=dark(1.05), rails=1)
    # big plank sliding door of the earth-floored kitchen (doma) on the land side
    f, Lf = faces['-x']
    h = holes['-x'][0]
    reveal(pm, f, (h[0], h[1], ZF - .1, h[3]), .14, tint=.6, sides='lrt')
    f.quad(wm, h[0], ZF - .1, h[1], h[3], d=-.13, tint=.08)
    boards_v(wm, Face(f.p(h[0] + .05, 0, -.03), f.n), 0, (h[1] - h[0]) * .62, ZF - .08, h[3] - .02, w=.17, rng=rng,
             base=.62, tag='doma door')
    f.box(A.mb(IR), h[0] + .15, 1.2, .0, .04, .25, .03, tag='doma door')
    stone(pm, f.p((h[0] + h[1]) / 2, .12, .45), (1.5, .6, .24), f.rot, rng, tint=stone_tint(rng, 1.05), tag='steps')

    # ---- engawa veranda along the front with posts carrying the eave beam
    wm.box((0, (EY + Y0) / 2, ZF - .06), (L + .3, Y0 - EY, .08), ch=.01, tint=.8, tag='engawa')
    for i in range(6):
        y = EY + .08 + i * (Y0 - EY - .12) / 5
        wm.box((0, y, ZF - .01), (L + .28, .15, .02), tint=(.95 - .1 * (i % 2)) * (.92 + .08 * rng.random()), tag='engawa')
    wm.box((0, EY + .05, ZF - .16), (L + .3, .12, .22), ch=.02, tint=dark(1.1), tag='engawa')
    ex = [X0 + .05, X0 + L / 4, X0 + L / 2, X0 + 3 * L / 4, X1 - .05]
    for x in ex:
        wm.box((x, EY + .08, ZF / 2 - .1), (.14, .14, ZF - .15), tint=dark(1.1), tag='engawa legs')
        footing(pm, x, EY + .08, .1, .3, rng)
    for x in (ex[0], ex[-1]):
        wm.box((x, EY + .08, (ZF + 2.2) / 2), (.15, .15, 2.2 - ZF), ch=.02, tint=dark(), tag='veranda posts')
    # Ota's sitting place: a zabuton cushion and a tea tray with pot and cups; a bamboo blind in the west bay
    cz = V((.7, (EY + Y0) / 2 + .05, ZF))
    A.mb(NOC).box(cz + V((0, 0, .05)), (.5, .5, .08), ch=.03, seg=2, tag='zabuton')
    wm.box(cz + V((.62, .05, .02)), (.36, .26, .03), ch=.008, tint=.45, tag='tea tray')
    A.mb(IR).lathe([(0, 0), (.07, 0), (.09, .06), (.07, .11), (.03, .13), (0, .13)], cz + V((.58, .05, .035)), n=8,
                   tag='tea tray')
    A.mb(IR).rod(cz + V((.66, .05, .1)), cz + V((.72, .05, .13)), .012, n=4, tag='tea tray')
    for dx in (.7, .74):
        pm.cyl(cz + V((dx - .02, -.05 + (dx - .7) * 2, .06)), .025, .045, n=6, tint=1.0, tag='tea tray')
    sudare(A, P, faces['-y'][0], .9, 2.3, 1.5, 1.1, d=.12)
    # storm-shutter box (tobukuro) at the east end
    wm.box((X1 + .12, (EY + Y0) / 2 + .2, 1.4), (.22, .75, 1.8), ch=.02, tint=.55, tag='shutter box')
    for k in range(4):
        wm.box((X1 + .235, (EY + Y0) / 2 + .2, .65 + k * .45), (.02, .7, .03), tint=.35, tag='shutter box')
    # stepping stone with geta sandals
    stone(pm, (-.6, EY - .38, .08), (1.1, .6, .22), .08, rng, tint=stone_tint(rng, 1.1), tag='steps')
    for gx in (-.72, -.5):
        wm.box((gx, EY - .38, .23), (.12, .26, .025), ch=.008, tint=.8, tag='geta')
        for gy in (-.06, .06):
            wm.box((gx, EY - .38 + gy, .205), (.11, .025, .03), tint=.5, tag='geta')

    # ---- irimoya roof
    EO = 1.0                     # equal overhang on all four sides (hip eaves stay level)
    thick = ROOF_STYLES['kawara']['thick']
    pitch = .95
    yf, yb = Y0 - EO, Y1 + EO
    Xr = (X1 - X0) / 2 + EO
    D = (yb - yf) / 2
    rtmp = Roof(0, pitch, D, sag=.24)
    eave_z = ZT + thick + .02 - rtmp.g(EO)
    dc = 1.55
    st = dict(ROOF_STYLES['kawara'], pitch=.5, course=.48, line_sides=3, cell_mult=2, line_r=.095)
    rf = irimoya(A, R, Xr, yf, yb, eave_z, pitch, dc, sag=.24, style=st, under_mat=W, fascia_mat=W, seed=40, wood=W,
                 ridge_layers=3, ridge_w=.44, oni_size=.7)
    for key, dw in (('front', EO), ('back', EO), ('right', EO), ('left', EO)):
        rafters(A, W, rf[key], dw + .03, spacing=.46, w=.08, h=.1, tint=dark(), thick=thick, margin=.5)
    # gables: lattice (kitsune-goshi) triangle set just behind the verges
    for sx in (-1, 1):
        xg = sx * (Xr - dc - .12)
        fg = Face((xg, yf if sx > 0 else yb, 0), (sx, 0, 0))
        Lg = yb - yf
        top = under_fn([rf['front'], rf['back']], fg, thick, u0=0, u1=Lg)
        zlo = rf['zc'] - .05
        sp = span_under(top, Lg, zlo + .05)
        if sp:
            panel(wm, fg, sp[0], sp[1], zlo, zlo + .01, [], top=top, tint=.3, tag='gable')
            n = int((sp[1] - sp[0]) / .16)
            for k in range(1, n):
                u = sp[0] + (sp[1] - sp[0]) * k / n
                if top(u) - zlo > .12:
                    fg.box(wm, u, (zlo + top(u)) / 2, .03, .04, top(u) - zlo, .03, tint=.55, tag='gable lattice')
            for z in (zlo + .3, zlo + .75):
                sp2 = span_under(top, Lg, z + .03)
                if sp2:
                    fg.box(wm, (sp2[0] + sp2[1]) / 2, z, .05, sp2[1] - sp2[0], .04, .03, tint=.55, tag='gable lattice')
    # gegyo boards hanging at the gable apexes (on the verge line)
    for sx in (-1, 1):
        x = sx * (Xr - dc) + sx * .1
        zt = rf['front'].z(V((sx * (Xr - dc), rf['yc']))) - .12
        wm.extrude([(-.28, 0), (.28, 0), (.18, -.3), (0, -.42), (-.18, -.3)], .07, (x, rf['yc'], zt),
                   rot=(0, 0, math.pi / 2), bevel=.012, tint=dark(), tag='gegyo')
    # smoke vent (koshi-yane) on the ridge for the irori hearth
    zr = rf['front'].z(V((0, rf['yc'])))
    wm.box((0, rf['yc'], zr + .35), (1.2, .7, .5), tint=.18, tag='smoke vent')
    for k in range(7):
        wm.box((-.51 + k * .17, rf['yc'] - .36, zr + .35), (.05, .03, .46), tint=dark(), tag='smoke vent')
        wm.box((-.51 + k * .17, rf['yc'] + .36, zr + .35), (.05, .03, .46), tint=dark(), tag='smoke vent')
    gable_roof(A, R, -.85, .85, rf['yc'] - .7, rf['yc'] + .7, zr + .5, .75, sag=.1,
               style=dict(ROOF_STYLES['kawara'], pitch=.34, course=.32, line_r=.06, line_sides=3, thick=.1, cell_mult=2),
               under_mat=W, fascia_mat=W, seed=77, ridge_layers=1, ridge_w=.24, oni=False)

    # ---- yard: firewood stack, chopping block with axe, bonsai stand, rake
    firewood(A, W, (X1 + .45, .5, 0), length=2.0, rows=4, depth=.45, rot=math.pi / 2, rng=rng)
    wm.box((X1 + .45, .5, .03), (.55, 2.1, .06), tint=.5, tag='firewood')
    cb = V((X1 + .75, -1.6, 0))
    wm.cyl(cb + V((0, 0, .22)), .26, .44, n=10, ch=.02, tint=.7, tag='chopping block')
    wm.cyl(cb + V((0, 0, .445)), .24, .01, n=10, tint=1.0, tag='chopping block')
    wm.rod(cb + V((.02, 0, .5)), cb + V((.45, .12, .95)), .025, n=5, tint=.85, tag='axe')
    A.mb(IR).box(cb + V((.04, 0, .5)), (.18, .03, .12), rot=(0, .9, .26), tag='axe')
    # bonsai stand: two tiers in front of the west end of the engawa
    bx, by = -2.9, EY - .32
    for k, (z, dy) in enumerate(((.45, 0.0), (.8, .28))):
        wm.box((bx, by + dy, z), (1.4, .3, .05), ch=.01, tint=.75, tag='bonsai stand')
    for sx in (-1, 1):
        wm.box((bx + sx * .62, by + .14, .4), (.06, .6, .8), tint=dark(1.2), tag='bonsai stand')
    for i, (x, dy, z) in enumerate(((-3.45, 0, .48), (-2.55, 0, .48), (-3.0, .28, .83))):
        bonsai(A, P, G, W, (x, by + dy, z), rng, s=.85 + .15 * (i % 2))
    wm.rod((X0 - .15, -1.0, .02), (X0 - .08, -1.25, 1.75), .02, n=5, tint=.8, tag='rake')
    wm.box((X0 - .15, -1.0, .06), (.08, .5, .06), rot=(.12, 0, 0), tint=.6, tag='rake')
    potted_plant(A, P, G, (1.4, EY - .3, 0), r=.22, h=.32, kind='tall', rng=rng, pot_tint=stone_tint(rng, 1.1))

    return A.finish(ao_distance=1.3, ao_strength=.62)


# ---------------------------------------------------------------- boathouse


def M_net():
    return mat('Net', '#3d6b52', rough=.8, double=True)


def hanging_net(A, net_mat, float_mats, face, u0, u1, z_top, drop=1.1, d=.06, rng=None, cols=10, rows=6, tag='net'):
    """A fishing net hung from pegs along a wall: sagging mesh with a row of floats along the top edge."""
    rng = rng or random.Random(2)
    mb = A.mb(net_mat)
    bm = bmesh.new()
    grid = []
    for j in range(rows + 1):
        row = []
        t = j / rows
        for i in range(cols + 1):
            s = i / cols
            u = lerp(u0, u1, s) + .06 * math.sin(s * 9 + j) * t
            peg_sag = .12 * abs(math.sin(s * math.pi * 3))
            z = z_top - peg_sag * (1 - t) - drop * t * (1 - .35 * math.sin(s * math.pi)) - .1 * t * rng.random()
            row.append(bm.verts.new(face.p(u, z, d + .05 * t * rng.random())))
        grid.append(row)
    for j in range(rows):
        for i in range(cols):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(face.n) < 0:
            f.normal_flip()
    mb.append(bm, tint=(.9 + .1 * rng.random()), smooth=60, tag=tag)
    nf = max(2, cols // 3)
    for i in range(nf + 1):
        s = i / nf
        u = lerp(u0 + .1, u1 - .1, s)
        m = float_mats[i % len(float_mats)]
        A.mb(m).sphere(face.p(u, z_top - .1 * abs(math.sin(s * math.pi * 3)) - .05, d + .1), .1, seg=7, rings=4,
                       tag=tag + ' floats')


def crate(A, wood, c, s=.7, rot=0., rng=None, tag='crates'):
    """Slatted wooden crate with dark corner frames."""
    rng = rng or random.Random(1)
    wm = A.mb(wood)
    c = V(c)
    k = .82 + .18 * rng.random()
    wm.box(c + V((0, 0, s / 2)), (s - .04, s - .04, s - .04), rot=(0, 0, rot), tint=k, tag=tag)
    R = Matrix.Rotation(rot, 3, 'Z')
    for sx in (-1, 1):
        for sy in (-1, 1):
            wm.box(c + R @ V((sx * (s / 2 - .04), sy * (s / 2 - .04), s / 2)), (.09, .09, s), rot=(0, 0, rot),
                   tint=dark(1.2), tag=tag)
    for sx in (-1, 1):
        for z in (.06, s - .06):
            wm.box(c + R @ V((0, sx * (s / 2 - .03), z)), (s - .1, .05, .08), rot=(0, 0, rot), tint=dark(1.3), tag=tag)
            wm.box(c + R @ V((sx * (s / 2 - .03), 0, z)), (.05, s - .1, .08), rot=(0, 0, rot), tint=dark(1.3), tag=tag)


@builder('boathouse')
def build_boathouse():
    A = Asset('boathouse', 'Boathouse')
    rng = random.Random(81)
    P, W, R, NET, RED = M_plaster(), M_wood(), M_kroof(), M_net(), M_red()
    WG, LG = window_glow(), lantern_glow()
    pm, wm = A.mb(P), A.mb(W)

    X0, X1, Y0, Y1 = -2.7, 2.7, -3.7, 3.7
    ZT = 2.55
    SL = 1.45            # half width of the boat slip
    YS = -.6             # back end of the slip
    L = X1 - X0

    # ---- land half on a stone foundation, water half on piles
    pm.box((0, (0 + Y1) / 2 + .1, -.45), (L + .1, Y1 + .2, .86), tint=stone_tint(rng, .6), tag='foundation')
    for side in ('+y', '+x', '-x'):
        f, Lf = rect_face(X0 - .06, X1 + .06, -.1, Y1 + .06, side)
        masonry(pm, f, 0, Lf, -.85, -.02, (), rng=rng, course=(.22, .32), length=(.35, .75), tag='foundation')
    fq = Face((X0 - .06, -.1, 0), (0, -1, 0))
    masonry(pm, fq, 0, L + .12, -2.0, -.02, (), rng=rng, course=(.26, .36), length=(.4, .8), wet=-.5, tag='foundation')
    # decks: walkways on both sides of the slip, and the floor behind it
    for (xa, xb, ya, yb) in ((X0, -SL, Y0 - .2, YS), (SL, X1, Y0 - .2, YS), (X0, X1, YS, Y1)):
        n = int((yb - ya) / .2) if xb - xa < 2 else int((xb - xa) / .2)
        if xb - xa < 2:
            for i in range(n):
                y = ya + (i + .5) * (yb - ya) / n
                wm.box(((xa + xb) / 2, y, -.03), (xb - xa - .02, (yb - ya) / n - .02, .06),
                       tint=(.78 + .2 * rng.random()) * (.85 if i % 5 == 2 else 1.0), tag='deck')
        else:
            for i in range(n):
                x = xa + (i + .5) * (xb - xa) / n
                wm.box((x, (ya + yb) / 2, -.03), ((xb - xa) / n - .02, yb - ya - .02, .06),
                       tint=(.78 + .2 * rng.random()), tag='deck')
    for x in (X0 + .08, -SL - .08, SL + .08, X1 - .08):
        wm.box((x, (Y0 + YS) / 2 - .1, -.16), (.14, YS - Y0 + .2, .2), tint=dark(1.1), tag='joists')
    # piles with cross braces down to the river bed
    for x in (X0 + .1, -SL - .1, SL + .1, X1 - .1):
        for y in (Y0 - .1, (Y0 + YS) / 2, YS):
            wm.cyl((x, y, -1.05), .11, 2.0, n=7, tint=dark(1.25), tag='piles')
    for x in (X0 + .1, X1 - .1):
        wm.beam((x, Y0 - .1, -1.7), (x, (Y0 + YS) / 2, -.35), .07, .08, tint=dark(1.2), tag='braces')
        wm.beam((x, (Y0 + YS) / 2, -1.7), (x, YS, -.35), .07, .08, tint=dark(1.2), tag='braces')
    # mooring posts at the slip mouth
    for x in (-SL - .1, SL + .1):
        wm.cyl((x, Y0 - .35, -.6), .12, 2.4, n=8, tint=dark(1.2), tag='mooring')
        wm.cyl((x, Y0 - .35, .62), .135, .06, n=8, tint=.3, tag='mooring')

    # ---- board walls (outside) with inner faces seen through the open front
    holes = {'+x': [(4.4, 5.3, 1.1, 1.8)], '-x': [(2.1, 3.0, 1.1, 1.8)], '+y': [(3.2, 4.2, 0.0, 2.0)]}
    faces = {}
    for side in ('+x', '+y', '-x'):
        f, Lf = rect_face(X0, X1, Y0, Y1, side)
        faces[side] = (f, Lf)
        boards_v(wm, f, 0, Lf, 0, ZT, w=.26, rng=rng, base=.5, var=.3, holes=holes[side], tag='wall boards',
                 batten=(wm, 2), groove=0)
        for u in (0, Lf):
            f.box(wm, u, ZT / 2, .04, .16, ZT, .14, ch=.02, tint=dark(), tag='corner posts')
        f.box(wm, Lf / 2, ZT - .07, .05, Lf + .1, .16, .12, tint=dark(), tag='wall plate')
        f.box(wm, Lf / 2, .08, .05, Lf, .16, .1, tint=dark(), tag='sill')
        # inner face
        fi = Face(f.p(Lf, 0, -.06), -f.n)
        boards_v(wm, fi, 0, Lf, 0, ZT, w=.3, rng=rng, base=.62, var=.2, groove=0, tag='inner boards')
    for side in ('+x', '-x'):
        f, Lf = faces[side]
        for h in holes[side]:
            sash(A, f, h, W, WG, wm, cols=2, rows=2, frame_tint=dark(), casing=W, casing_tint=dark(1.1), reveal_tint=.5,
                 depth=.06)
    f, Lf = faces['+y']
    h = holes['+y'][0]
    reveal(wm, f, h, .06, tint=.4, sides='lrt')
    boards_v(wm, Face(f.p(h[0], 0, -.03), f.n), 0, h[1] - h[0], h[2] + .02, h[3] - .02, w=.2, rng=rng, base=.72,
             tag='back door')

    # ---- low-pitch roof (ridge along Y) with a flat plank walkway on the ridge
    EO, VO = .3, .3
    thick = ROOF_STYLES['kawara']['thick']
    pitch = .36
    D = (X1 - X0) / 2 + EO
    roof = Roof(0, pitch, D, sag=.12)
    roof.eave_z = ZT + thick + .02 - roof.g(EO)
    ya, yb = Y0 - VO, Y1 + VO
    left = Slope(roof, [(X0 - EO, yb), (X0 - EO, ya), (0, ya), (0, yb)], (X0 - EO, yb), (X0 - EO, ya),
                 ['eave', 'verge', 'ridge', 'verge'])
    right = Slope(roof, [(X1 + EO, ya), (X1 + EO, yb), (0, yb), (0, ya)], (X1 + EO, ya), (X1 + EO, yb),
                  ['eave', 'verge', 'ridge', 'verge'])
    st = dict(ROOF_STYLES['kawara'], pitch=.48, course=.44, line_sides=3, cell_mult=2)
    for i, s in enumerate((left, right)):
        tile_slope(A, s, R, st, under_mat=W, fascia_mat=W, seed=50 + i)
        rafters(A, W, s, EO + .03, spacing=.5, w=.07, h=.08, tint=dark(), thick=thick)
    zr = left.z(V((0, 0)))
    # walkway: a flat plank deck on sleepers along the ridge (the cog sits up here)
    for i in range(int((yb - ya) / .5)):
        y = ya + .25 + i * .5
        wm.box((0, y, zr + .05), (1.0, .1, .12), tint=dark(1.1), tag='ridge walk')
    for k in range(4):
        wm.box((-.36 + k * .24, 0, zr + .14), (.22, yb - ya - .04, .05), tint=.8 + .15 * rng.random(), tag='ridge walk')
    for ye, sy in ((ya, -1), (yb, 1)):
        bargeboard(A, W, left, (X0 - EO, ye), (0, ye), h=.3, t=.08, tint=dark(), out=V((0, sy)))
        bargeboard(A, W, right, (X1 + EO, ye), (0, ye), h=.3, t=.08, tint=dark(), out=V((0, sy)))
    # gables: boarded above the wide water door (front) and above the back wall
    for sy, yw in ((-1, Y0), (1, Y1)):
        f = Face((X0 if sy < 0 else X1, yw, 0), (0, sy, 0))
        Lf = L
        top = under_fn([left, right], f, thick, u0=0, u1=Lf)
        boards_v(wm, f, 0, Lf, ZT - .02, zr, w=.22, rng=rng, base=.55, var=.25, tag='gable boards', top=top)
        fi = Face(f.p(Lf, 0, -.06), -f.n)

        def itop(u, t=top, Lf=Lf):
            return t(Lf - u)
        itop.breaks = [Lf - b for b in top.breaks]
        panel(wm, fi, 0, Lf, ZT - .1, 9.0, [], top=itop, tint=.5, tag='gable inner')
    f0 = Face((X0, Y0, 0), (0, -1, 0))
    f0.box(wm, L / 2, ZT - .12, .05, L + .2, .24, .16, ch=.02, tint=dark(), tag='water door beam')
    # a wooden fish sign hanging under the front gable
    fish = [(-.45, 0), (-.2, .16), (.2, .14), (.38, .03), (.55, .16), (.55, -.16), (.38, -.03), (.2, -.14), (-.2, -.16)]
    wm.extrude(fish, .06, (0, Y0 - .12, ZT + .45), bevel=.012, tint=.9, tag='fish sign')
    A.mb(RED).extrude([(x * .6, y * .6) for x, y in fish], .07, (0, Y0 - .13, ZT + .45), bevel=0, tag='fish sign')
    for sx in (-1, 1):
        wm.rod((sx * .35, Y0 - .12, ZT + .58), (sx * .35, Y0 - .12, ZT - .02), .01, n=4, tint=.3, tag='fish sign')
    # lantern at the slip mouth corner
    chochin(A, LG, W, V((X1 - .1, Y0 - .32, ZT - .45)), r=.17, h=.34, hang=.15)

    # ---- nets, floats, traps, oars, rope, crate steps to the roof
    fx, Lx = faces['+x']
    hanging_net(A, NET, (RED, P), fx, .4, 3.9, 2.2, drop=1.3, rng=rng)
    fmx, Lmx = faces['-x']
    hanging_net(A, NET, (P, RED), fmx, 3.6, 7.1, 2.1, drop=1.0, rng=rng, cols=8, rows=5)
    for i, (x, y) in enumerate(((X0 + .5, -1.6),)):
        wm.lathe([(0, 0), (.24, 0), (.27, .1), (.25, .34), (.15, .44), (.06, .46), (0, .46)], (x, y, 0), n=10,
                 tint=.95, tag='crab traps')
        for z in (.12, .28):
            wm.cyl((x, y, z), .27, .03, n=10, tint=.45, tag='crab traps')
    for k in range(2):
        wm.beam((X1 - .35, -1.0 + k * .25, 0), (X1 - .08, -1.2 + k * .25, 2.1), .05, .05, tint=.85, tag='oars')
        wm.box((X1 - .33, -1.02 + k * .25, .25), (.04, .2, .5), rot=(0, -.12, 0), tint=.85, tag='oars')
    for c_ in ((SL + .7, -1.8), (-SL - .7, -3.0)):
        A.mb(P).torus((c_[0], c_[1], .06), .22, .055, maj=10, mn=4, tint=(.95, .82, .55), tag='rope')
        A.mb(P).torus((c_[0], c_[1], .15), .17, .05, maj=9, mn=4, tint=(.95, .82, .55), tag='rope')
    # crate steps up to the eave on the land side (+X, back)
    crate(A, W, (X1 + .75, 2.6, 0), .72, .1, rng)
    crate(A, W, (X1 + .75, 1.75, 0), .72, -.05, rng)
    crate(A, W, (X1 + .75, 1.75, .72), .68, .08, rng)
    A.mb(W).lathe([(0, 0), (.3, 0), (.34, .15), (.36, .38), (.34, .6), (.3, .72), (0, .7)], (X1 + .8, .85, 0), n=12,
                  tint=.75, tag='barrel')
    for z in (.14, .58):
        wm.cyl((X1 + .8, .85, z), .355, .05, n=12, tint=.22, tag='barrel')

    land = ground_occluder([(-60, -.1), (60, -.1), (60, 60), (-60, 60)], 0.0)
    return A.finish(ao_distance=1.2, ao_strength=.6, ground=None, occluders=[land])


# ---------------------------------------------------------------- tea and noodle shop


def parasol(A, cloth, wood, c, r=1.15, h=2.3, ribs=12, tag='parasol'):
    """Nodate-gasa: big red paper parasol with visible ribs on a bamboo pole."""
    c = V(c)
    top = c + V((0, 0, h))
    bm = bmesh.new()
    ring_out, ring_mid = [], []
    apex = bm.verts.new(top + V((0, 0, .05)))
    for i in range(ribs * 2):
        a = TAU * i / (ribs * 2)
        rr = r * (1.0 if i % 2 == 0 else .97)
        ring_mid.append(bm.verts.new(top + V((math.cos(a) * rr * .55, math.sin(a) * rr * .55, -.12))))
        ring_out.append(bm.verts.new(top + V((math.cos(a) * rr, math.sin(a) * rr, -.42 - (.03 if i % 2 else 0)))))
    n = len(ring_out)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((apex, ring_mid[i], ring_mid[j]))
        bm.faces.new((ring_mid[i], ring_out[i], ring_out[j], ring_mid[j]))
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    A.mb(cloth).append(bm, tint=1.0, smooth=50, tag=tag)
    # underside so the canopy reads from below too
    bm2 = bmesh.new()
    vs = [bm2.verts.new(top + V((math.cos(TAU * i / 16) * r * .96, math.sin(TAU * i / 16) * r * .96, -.4))) for i in range(16)]
    ap = bm2.verts.new(top + V((0, 0, .0)))
    for i in range(16):
        bm2.faces.new((vs[(i + 1) % 16], vs[i], ap))
    bm2.normal_update()
    for f in bm2.faces:
        if f.normal.z > 0:
            f.normal_flip()
    A.mb(cloth).append(bm2, tint=.7, smooth=50, tag=tag)
    wm = A.mb(wood)
    wm.rod(c, top + V((0, 0, .1)), .03, n=6, tint=(.6, .55, .25), tag=tag)
    for i in range(0, ribs * 2, 2):
        a = TAU * i / (ribs * 2)
        wm.rod(c + V((0, 0, h * .72)), top + V((math.cos(a) * r * .5, math.sin(a) * r * .5, -.2)), .008, n=3, tint=.4,
               tag=tag)


def red_bench(A, wood, cloth, c, w=1.6, rot=0., tag='benches'):
    wm, cm = A.mb(wood), A.mb(cloth)
    R = Matrix.Rotation(rot, 3, 'Z')
    c = V(c)
    wm.box(c + V((0, 0, .42)), (w, .5, .06), rot=(0, 0, rot), tint=.8, tag=tag)
    cm.box(c + V((0, 0, .46)), (w + .04, .54, .03), rot=(0, 0, rot), ch=.01, tag=tag)
    for sx in (-1, 1):
        for sy in (-1, 1):
            wm.box(c + R @ V((sx * (w / 2 - .1), sy * .18, .2)), (.06, .06, .4), rot=(0, 0, rot), tint=dark(1.2), tag=tag)
        wm.box(c + R @ V((sx * (w / 2 - .1), 0, .12)), (.05, .36, .05), rot=(0, 0, rot), tint=dark(1.2), tag=tag)


@builder('kawabe-shop')
def build_kawabe_shop():
    A = Asset('kawabe-shop', 'Kawabe shop')
    rng = random.Random(91)
    P, W, R, NO, RED, G = M_plaster(), M_wood(), M_kroof(), M_noren('#e0762c'), M_red(), M_leaf()
    WG, LG = window_glow(), lantern_glow()
    pm, wm = A.mb(P), A.mb(W)

    X0, X1, Y0, Y1 = -2.6, 2.6, -2.0, 2.5
    ZF, ZT = .22, 3.1
    L = X1 - X0
    plinth(A, P, X0 - .1, X1 + .1, Y0 - .1, Y1 + .1, z_top=ZF - .02, rng=rng, depth=.24, wmin=.5, wmax=.95)

    holes = {'-y': [(.25, 1.4, .95, 2.15), (1.75, 3.45, ZF, 2.3), (3.75, 4.95, 1.0, 2.15)],
             '+x': [(1.8, 2.8, 1.1, 2.0)], '+y': [(.8, 1.7, ZF, 2.1), (3.2, 4.2, 1.1, 2.0)], '-x': [(1.6, 2.6, 1.2, 2.0)]}
    posts = {'-y': [0, 1.6, 3.6, L], '+x': [0, 1.55, 3.05, 4.5], '+y': [0, 1.9, 3.0, L], '-x': [0, 1.4, 2.8, 4.5]}
    faces = {}
    for side in ('-y', '+x', '+y', '-x'):
        f, Lf = rect_face(X0, X1, Y0, Y1, side)
        faces[side] = (f, Lf)
        timber_wall(A, f, Lf, ZF, ZT, holes[side], P, W, posts[side], [ZF + .07, 1.0 if side != '-y' else .9, 2.42],
                    board_top=.9 if side == '-y' else 1.0, rng=rng, post_ext=(.03, .08))
        f.box(wm, Lf / 2, ZT - .08, .04, Lf + .1, .18, .13, ch=.02, tint=dark(.9), tag='beams')
    ff, Lf = faces['-y']
    # serving hatch: counter ledge, propped top-hinged shutter, bowls and a kettle
    h = holes['-y'][0]
    reveal(pm, ff, h, .3, tint=.55)
    ff.quad(A.mb(W), h[0], h[2], h[1], h[3], d=-.3, tint=.12)
    ff.box(wm, (h[0] + h[1]) / 2, h[2] - .03, .15, h[1] - h[0] + .3, .07, .42, ch=.015, tint=.85, tag='counter')
    for s_ in (-1, 1):
        wm.beam(ff.p((h[0] + h[1]) / 2 + s_ * .45, h[2] - .5, .02), ff.p((h[0] + h[1]) / 2 + s_ * .45, h[2] - .07, .3),
                .05, .05, tint=dark(), tag='counter')
    shutter_c = ff.p((h[0] + h[1]) / 2, h[3] + .02, .0)
    wm.append(bm_box((h[1] - h[0] + .1, .05, .95)), xform(shutter_c + ff.n * .42 + V((0, 0, .18)), (-1.1, 0, ff.rot)),
              tint=.6, smooth=38, tag='shutter')
    for s_ in (-1, 1):
        wm.beam(ff.p((h[0] + h[1]) / 2 + s_ * .5, h[2] + .02, .25), ff.p((h[0] + h[1]) / 2 + s_ * .5, h[3] + .45, .85),
                .03, .03, tint=.75, tag='shutter')
    for k in range(3):
        c = ff.p(h[0] + .25 + k * .16, h[2] + .02, .2)
        pm.lathe([(0, 0), (.05, 0), (.08, .05), (.085, .08), (0, .07)], c + V((0, 0, .005 + .075 * (k % 2))), n=8,
                 tint=1.0, tag='bowls')
    A.mb(R).lathe([(0, 0), (.1, 0), (.14, .08), (.12, .16), (.06, .2), (0, .2)], ff.p(h[1] - .25, h[2] + .03, .22), n=8,
                  tint=.28, tag='kettle')
    # entrance: noren over an open doorway into a warm interior
    dh = holes['-y'][1]
    reveal(pm, ff, dh, .14, tint=.6, sides='lrt')
    din = Face(ff.p(dh[0], 0, -1.4), ff.n)
    din.quad(A.mb(W), 0, dh[2], dh[1] - dh[0], dh[3], tint=.2)
    for sgn, uu in ((1, dh[0]), (-1, dh[1])):
        A.mb(W).poly([ff.p(uu, dh[2], -.14), ff.p(uu, dh[2], -1.4), ff.p(uu, dh[3], -1.4), ff.p(uu, dh[3], -.14)],
                     tint=.25, normal=ff.u * sgn, tag='interior')
    A.mb(W).poly([ff.p(dh[0], dh[3], -.14), ff.p(dh[1], dh[3], -.14), ff.p(dh[1], dh[3], -1.4), ff.p(dh[0], dh[3], -1.4)],
                 tint=.2, normal=-Z, tag='interior')
    A.mb(W).poly([ff.p(dh[0], dh[2] + .01, -.14), ff.p(dh[1], dh[2] + .01, -.14), ff.p(dh[1], dh[2] + .01, -1.4),
                  ff.p(dh[0], dh[2] + .01, -1.4)], tint=.55, normal=Z, tag='interior')
    A.mb(WG).box(ff.p(dh[0] + .5, 1.35, -1.36), (.6, .04, .5), rot=(0, 0, ff.rot), tag='interior')
    noren(A, ff, (dh[0] + dh[1]) / 2, dh[3] - .03, 1.6, .9, NO, W, panels=3, crest_mat=P, rng=rng, d=.1)
    koshi(A, ff, holes['-y'][2], W, WG, pm, tint=BENGARA, rails=1)
    # menu boards on the posts
    for u in (1.6, 3.6):
        ff.box(wm, u, 1.4, .12, .22, .8, .025, ch=.006, tint=.95, tag='menu')
        for k in range(5):
            ff.box(wm, u, 1.68 - k * .12, .137, .13, .014, .01, tint=.18, tag='menu')
    for side in ('+x', '+y', '-x'):
        f, Lf_ = faces[side]
        for hh in holes[side]:
            if hh[2] <= ZF + .01:
                panel_door(A, f, hh, W, pm, leaf_tint=.6, frame_mat=W, panels=2)
            else:
                koshi(A, f, hh, W, WG, pm, tint=dark(1.05), rails=1)

    # ---- front pent roof with a row of red lanterns
    run = 1.05
    pr = Roof(0, .34, run, sag=.12)
    pr.eave_z = 2.62
    ye = Y0 - run
    ps = Slope(pr, [(X0 - .25, ye), (X1 + .25, ye), (X1 + .25, Y0), (X0 - .25, Y0)], (X0 - .25, ye), (X1 + .25, ye),
               ['eave', 'verge', 'wall', 'verge'])
    tile_slope(A, ps, R, dict(ROOF_STYLES['kawara'], thick=.12, course=.34, pitch=.38, line_r=.065, line_sides=3,
                              cell_mult=2), under_mat=W, fascia_mat=W, seed=93)
    rafters(A, W, ps, run, spacing=.42, w=.06, h=.07, tint=dark(), thick=.12)
    for xe in (X0 - .25, X1 + .25):
        bargeboard(A, W, ps, (xe, ye), (xe, Y0), h=.18, t=.06, tint=dark(), n=3)
    for x in (-1.9, -.65, .65, 1.9):
        chochin(A, LG, W, V((x, ye + .22, pr.eave_z - .5)), r=.17, h=.36, hang=.2)

    # ---- main roof: gable along X with a big signboard on the front slope
    EO, VO = .5, .4
    thick = ROOF_STYLES['kawara']['thick']
    pitch = .6
    D = (Y1 - Y0) / 2 + EO
    yc = (Y0 + Y1) / 2
    roof = Roof(0, pitch, D, sag=.2)
    eave_z = ZT + thick + .02 - roof.g(EO)
    front, back, _ = gable_roof(A, R, X0 - VO, X1 + VO, yc - D, yc + D, eave_z, pitch, sag=.2,
                                style=dict(ROOF_STYLES['kawara'], pitch=.48, course=.46, line_sides=3, cell_mult=2),
                                under_mat=W, fascia_mat=W, seed=95, ridge_layers=2, ridge_w=.38)
    for s in (front, back):
        rafters(A, W, s, EO + .03, spacing=.44, w=.07, h=.09, tint=dark(), thick=thick)
    for xe in (X0 - VO, X1 + VO):
        for s, ye_ in ((front, yc - D), (back, yc + D)):
            bargeboard(A, W, s, (xe, ye_), (xe, yc), h=.32, t=.09, tint=dark(), out=V((1 if xe > 0 else -1, 0)))
    for side in ('+x', '-x'):
        f, Lf_ = faces[side]
        top = under_fn([front, back], f, thick, u0=0, u1=Lf_)
        panel(pm, f, 0, Lf_, ZT, 9.0, [], top=top, tag='gable')
        collar(f, wm, top, Lf_, ZT + .55)
        f.box(wm, Lf_ / 2, (ZT + top(Lf_ / 2)) / 2, .035, .14, top(Lf_ / 2) - ZT, .1, ch=.015, tint=dark(), tag='gable timber')
    # signboard (kanban) standing on the front slope
    sy = yc - D * .45
    sz = front.z(V((0, sy)))
    wm.box((0, sy, sz + .42), (2.6, .12, .7), ch=.03, tint=dark(), tag='kanban')
    wm.box((0, sy - .07, sz + .42), (2.4, .04, .52), ch=.01, tint=1.0, tag='kanban')
    for k in range(4):
        wm.box((-.8 + k * .53, sy - .1, sz + .42), (.3, .01, .3), tint=.2, tag='kanban')
    for sx in (-1, 1):
        wm.box((sx * 1.0, sy + .05, sz + .1), (.08, .08, .5), tint=dark(), tag='kanban')
    # stove pipe from the kitchen
    pm.cyl((X0 + .7, Y1 - .7, 4.5), .11, 2.0, n=8, tint=.28, tag='stove pipe')
    pm.cyl((X0 + .7, Y1 - .7, 5.52), .2, .06, n=8, r2=.05, tint=.28, tag='stove pipe')

    # ---- outside: red benches and the parasol, potted plants, bamboo fence
    red_bench(A, W, RED, (-1.55, Y0 - .7, 0), w=1.5)
    red_bench(A, W, RED, (2.05, Y0 - 1.25, 0), w=1.3, rot=-.35)
    parasol(A, RED, W, V((2.55, Y0 - .55, 0)), r=1.15, h=2.35)
    potted_plant(A, R, G, ((X0 - .05), Y0 - .3, 0), r=.2, h=.3, kind='bush', rng=rng)
    potted_plant(A, R, G, (X1 + .05, Y0 - .25, 0), r=.18, h=.28, kind='tall', rng=rng)
    fx = Face((X1 + .45, Y0 + .5, 0), (1, 0, 0))
    for k in range(10):
        A.mb(P).rod(fx.p(.25 + k * .38, 0, 0), fx.p(.25 + k * .38, 1.3 + .05 * (k % 2), 0), .035, n=5,
                    tint=tmul(BAMBOO, .85 + .15 * (k % 3) / 2), tag='fence')
    for z in (.4, 1.0):
        A.mb(W).beam(fx.p(.1, z, .05), fx.p(3.8, z, .05), .05, .05, tint=dark(), tag='fence')

    return A.finish(ao_distance=1.2, ao_strength=.62)


# ---------------------------------------------------------------- Takamori palette and helpers


def M_clap():
    return mat('Clapboard', '#f5efe2', rough=.62)


def M_trim():
    return mat('Trim', '#e0a93a', rough=.45)


def M_troof(color='#23889a', name='Roof teal'):
    return mat(name, color, rough=.38)


def M_brick():
    return mat('Brick', '#b8553a', rough=.82)


def M_flowers(color='#e8506a'):
    return mat('Flowers', color, rough=.55)


def west_window(A, face, hole, clap, trim, glass, frame_tint=1.0, cols=2, rows=2, cornice=True, pediment=False,
                shutters=None, shutter_tint=1.0, depth=.1, tag='window'):
    """Takamori sash window: white sash, mustard casing and sill, cornice or pediment head, optional shutters."""
    ua, ub, za, zb = hole
    w, h = ub - ua, zb - za
    uc = (ua + ub) / 2
    sash(A, face, hole, clap, glass, A.mb(clap), cols=cols, rows=rows, depth=depth, frame_tint=frame_tint, casing=trim,
         casing_tint=1.0, casing_w=.1, sill_mat=trim, sill_tint=.95, reveal_tint=.85, tag=tag)
    tm = A.mb(trim)
    if cornice:
        face.box(tm, uc, zb + .16, .06, w + .42, .08, .16, ch=.02, tint=.95, tag=tag + ' head')
        face.box(tm, uc, zb + .105, .04, w + .3, .05, .1, tint=.8, tag=tag + ' head')
    if pediment:
        pts = [(-w / 2 - .2, 0), (w / 2 + .2, 0), (0, .32)]
        tm.extrude(pts, .08, face.p(uc, zb + .2, .06), rot=(0, 0, face.rot), bevel=.01, tint=.95, tag=tag + ' head')
    if shutters is not None:
        sm = A.mb(shutters)
        for s in (-1, 1):
            u = uc + s * (w / 2 + .12 + w * .26)
            face.box(sm, u, (za + zb) / 2, .05, w * .5, h + .05, .04, ch=.01, tint=shutter_tint, tag=tag + ' shutters')
            n = int(h / .2)
            for k in range(n):
                face.box(sm, u, za + .12 + k * (h - .16) / n, .075, w * .42, .04, .015, tint=tmul(shutter_tint, .78),
                         tag=tag + ' shutters')


def corner_boards(A, face, L, z0, z1, trim, w=.14, tint=1.0, tag='corners'):
    for u in (0, L):
        face.box(A.mb(trim), u, (z0 + z1) / 2, .035, w, z1 - z0, .07, ch=.015, tint=tint, tag=tag)


def arch_door(A, face, u, z0, w, h_rect, stone_mat, wood_mat, glass_mat, rng, depth=.35, pivot=None, iron_tint=.2,
              tag='arch door', vtint=None):
    """Arched stone doorway: voussoir ring, fanlight, plank door leaf. Returns the hole used (rect incl. arch)."""
    r = w / 2
    zs = z0 + h_rect
    hole = (u - r, u + r, z0, zs + r)
    pm = A.mb(stone_mat)
    # spandrel fill above the arch inside the rectangular hole
    bm = bmesh.new()
    n = 10
    for side in (-1, 1):
        pts = [face.p(u + side * r, zs + r, 0)]
        for i in range(n + 1):
            a = math.pi / 2 * i / n
            pts.append(face.p(u + side * r * math.cos(a), zs + r * math.sin(a), 0))
        vs = [bm.verts.new(p) for p in pts]
        try:
            bm.faces.new(vs)
        except ValueError:
            pass
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(face.n) < 0:
            f.normal_flip()
    pm.append(bm, tint=stone_tint(rng, .9), smooth=0, flat=True, tag=tag)
    # fanlight glass and radial bars
    fan = [face.p(u + r * math.cos(math.pi * i / 10), zs + r * math.sin(math.pi * i / 10), -depth + .05) for i in range(11)]
    A.mb(glass_mat).poly(fan, normal=face.n, tag=tag)
    for i in range(1, 4):
        a = math.pi * i / 4
        A.mb(wood_mat).beam(face.p(u, zs, -depth + .08), face.p(u + r * .95 * math.cos(a), zs + r * .95 * math.sin(a), -depth + .08),
                            .035, .03, up=face.n, tint=dark(), tag=tag)
    A.mb(wood_mat).beam(face.p(u - r, zs, -depth + .08), face.p(u + r, zs, -depth + .08), .06, .05, up=face.n, tint=dark(),
                        tag=tag)
    # reveals: straight jambs + arch soffit
    reveal(pm, face, (u - r, u + r, z0, zs), depth, tint=stone_tint(rng, .75), sides='lr')
    for i in range(10):
        a0, a1 = math.pi * i / 10, math.pi * (i + 1) / 10
        p0 = (u + r * math.cos(a0), zs + r * math.sin(a0))
        p1 = (u + r * math.cos(a1), zs + r * math.sin(a1))
        pm.poly([face.p(p0[0], p0[1], 0), face.p(p1[0], p1[1], 0), face.p(p1[0], p1[1], -depth), face.p(p0[0], p0[1], -depth)],
                tint=stone_tint(rng, .75), normal=V((0, 0, 0)) - (face.p((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0) -
                                                                  face.p(u, zs, 0)), tag=tag)
    # voussoirs
    nv = 9
    for i in range(nv):
        a = math.pi * (i + .5) / nv
        c = face.p(u + (r + .17) * math.cos(a), zs + (r + .17) * math.sin(a), .03)
        k = 1.12 if i == nv // 2 else 1.0
        R_ = Matrix.Rotation(face.rot, 3, 'Z') @ Matrix.Rotation(-(a - math.pi / 2), 3, 'Y')
        pm.append(bm_box((.26 * (1.25 if i == nv // 2 else 1.0), .3, .38 * k), .03, 1, front=True),
                  Matrix.Translation(c) @ R_.to_4x4(), tint=vtint or stone_tint(rng, 1.12), smooth=38, tag=tag)
    # door leaf (child of the pivot if given): planks with iron straps
    leaf_group = pivot
    dm = A.mb(wood_mat, leaf_group)
    boards_v(dm, Face(face.p(u - r + .02, 0, -depth + .1), face.n), 0, 2 * r - .04, z0 + .01, zs - .01, w=.18, rng=rng,
             base=.55, tag=tag + ' leaf')
    for zz in (z0 + .4, zs - .4):
        face.box(dm, u, zz, -depth + .13, 2 * r - .1, .08, .02, tint=iron_tint, tag=tag + ' leaf')
    face.box(A.mb(wood_mat, leaf_group), u + r - .18, z0 + 1.05, -depth + .15, .05, .2, .04, tint=iron_tint, tag=tag + ' leaf')
    return hole


def baluster_rail(A, a, b, z0, h, post_mat, rail_mat, spacing=.2, post_tint=1.0, rail_tint=1.0, tag='railing', size=.06):
    a, b = V(a), V(b)
    L = (b - a).length
    n = max(1, int(L / spacing))
    for i in range(n + 1):
        p = a.lerp(b, i / n)
        A.mb(post_mat).box((p.x, p.y, z0 + h / 2), (size, size, h), tint=post_tint, tag=tag)
    A.mb(rail_mat).beam(V((a.x, a.y, z0 + h)), V((b.x, b.y, z0 + h)), .1, .07, ch=.015, tint=rail_tint, tag=tag,
                        ext=.05)
    A.mb(post_mat).beam(V((a.x, a.y, z0 + .06)), V((b.x, b.y, z0 + .06)), .08, .05, tint=post_tint, tag=tag)


# ---------------------------------------------------------------- belltower


@builder('belltower')
def build_belltower():
    A = Asset('belltower', 'Belltower')
    rng = random.Random(101)
    C, T, RT, W, BR = M_clap(), M_trim(), M_troof(), M_wood(), M_brass()
    WG, LGL, LST = window_glow(), lamp_glass(), lamp_star()
    cm, tm, wm = A.mb(C), A.mb(T), A.mb(W)

    def stn(r_, u=0, z=0):
        t = stone_tint(r_)
        return (t[0] * 1.02, t[1] * 1.02, t[2] * 1.02)

    # ---- stone base with the arched door (Door pivot at the hinge)
    B = 2.1
    ZB = 3.0
    cm.box((0, 0, (ZB - .8) / 2), (2 * B - .1, 2 * B - .1, ZB + .8 - .05), tint=stn(rng), tag='core')
    door_u, door_w, door_h = B, 1.3, 1.55
    fb, Lb = rect_face(-B, B, -B, B, '-y')
    A.pivot('Door', fb.p(door_u - door_w / 2 + .03, 0, -.25), ground=None, with_statics=True)
    dhole = arch_door(A, fb, door_u, 0.0, door_w, door_h, C, W, WG, rng, depth=.35, pivot='Door')
    holes = {'-y': [dhole], '+x': [(1.8, 2.4, 1.2, 2.3)], '+y': [(1.8, 2.4, 1.2, 2.3)], '-x': [(1.8, 2.4, 1.2, 2.3)]}
    for side in ('-y', '+x', '+y', '-x'):
        f, L = rect_face(-B, B, -B, B, side)
        masonry(A.mb(C), f, 0, L, -.6, ZB, holes[side], rng=rng, tint_fn=stn, course=(.28, .42), length=(.45, 1.0))
        quoins(A.mb(C), f, L, -.3, ZB, rng, side=1, tint_fn=lambda r_, u, z: stone_tint(r_, 1.15))
        if side != '-y':
            h = holes[side][0]
            reveal(A.mb(C), f, h, .3, tint=stone_tint(rng, .7))
            f.quad(A.mb(WG), h[0], h[2], h[1], h[3], d=-.28)
            f.box(A.mb(C), (h[0] + h[1]) / 2, h[3] + .12, .03, h[1] - h[0] + .4, .24, .3, ch=.03,
                  tint=stone_tint(rng, 1.15), tag='lintels')
    # plinth course and string course at the top of the base
    cm.box((0, 0, ZB + .08), (2 * B + .24, 2 * B + .24, .2), ch=.04, tint=stone_tint(rng, 1.2), tag='string course')
    # teal hood on mustard brackets over the door, and a pair of brass wall lamps
    hz = door_h + door_w / 2 + .45
    hood = Roof(0, .5, .8, sag=.1)
    hood.eave_z = hz
    hs = Slope(hood, [(-1.05, -B - .8), (1.05, -B - .8), (1.05, -B), (-1.05, -B)], (-1.05, -B - .8), (1.05, -B - .8),
               ['eave', 'verge', 'wall', 'verge'])
    tile_slope(A, hs, RT, dict(ROOF_STYLES['shingle'], pitch=.3, course=.26, thick=.1), under_mat=C, fascia_mat=T, seed=130)
    for sx in (-1, 1):
        tm.beam((sx * .85, -B + .02, hz - .75), (sx * .85, -B - .7, hz - .06), .09, .1, ch=.015, tag='door hood')
        tm.box((sx * .85, -B - .02, hz - .82), (.12, .08, .2), tag='door hood')
        lc = V((sx * 1.25, -B - .3, 1.95))
        A.mb(BR).beam(V((sx * 1.25, -B + .01, 1.95)), V((sx * 1.25, -B - .25, 2.12)), .03, .03, tag='wall lamps')
        A.mb(WG).box(lc, (.16, .16, .24), ch=.01, tag='wall lamps')
        A.mb(BR).box(lc + V((0, 0, .15)), (.24, .24, .09), taper=(.3, .3), tag='wall lamps')
        A.mb(BR).box(lc + V((0, 0, -.14)), (.2, .2, .04), tag='wall lamps')
        for ax in (-1, 1):
            for ay in (-1, 1):
                A.mb(BR).box(lc + V((ax * .085, ay * .085, 0)), (.025, .025, .26), tag='wall lamps')

    # ---- clapboard shaft with mustard corners, tall windows and the clock
    S = 1.8
    ZS1 = 11.0
    shaft_holes = {'-y': [(1.25, 2.35, 4.4, 6.4)], '+y': [(1.25, 2.35, 4.4, 6.4), (1.25, 2.35, 8.0, 9.6)],
                   '+x': [(1.25, 2.35, 4.4, 6.4), (1.25, 2.35, 8.0, 9.6)], '-x': [(1.25, 2.35, 4.4, 6.4), (1.25, 2.35, 8.0, 9.6)]}
    for side in ('-y', '+x', '+y', '-x'):
        f, L = rect_face(-S, S, -S, S, side)
        clapboard(cm, f, 0, L, ZB + .18, ZS1 - .3, shaft_holes[side], board=.22, lap=.035, rng=rng, tag='clapboard')
        corner_boards(A, f, L, ZB + .18, ZS1 - .2, T)
        f.box(tm, L / 2, 7.2, .05, L + .12, .18, .1, ch=.02, tint=.95, tag='band')
        f.box(tm, L / 2, ZS1 - .38, .06, L + .16, .26, .12, ch=.025, tint=.95, tag='band')
        for h in shaft_holes[side]:
            west_window(A, f, h, C, T, WG, cols=2, rows=3, cornice=True)
    # clock face on -Y
    fc, Lc = rect_face(-S, S, -S, S, '-y')
    cc = fc.p(Lc / 2, 9.0, .08)
    cm.cyl(cc, .88, .08, n=24, rot=(math.pi / 2, 0, fc.rot), tint=1.05, tag='clock')
    tm.torus(cc + fc.n * .04, .9, .07, maj=24, mn=5, rot=(math.pi / 2, 0, fc.rot), tag='clock')
    for i in range(12):
        a = TAU * i / 12
        big = i % 3 == 0
        p = cc + fc.n * .05 + fc.u * math.cos(a) * .72 + Z * math.sin(a) * .72
        A.mb(W).box(p, (.05, .02, .16 if big else .09),
                    rot=Euler((0, 0, fc.rot)).to_matrix() @ Matrix.Rotation(-(a - math.pi / 2), 3, 'Y'), tint=.15, tag='clock')
    A.mb(W).beam(cc + fc.n * .07, cc + fc.n * .07 + (fc.u * math.cos(1.2) + Z * math.sin(1.2)) * .45, .06, .02, up=fc.n,
                 tint=.12, tag='clock')
    A.mb(W).beam(cc + fc.n * .08, cc + fc.n * .08 + (fc.u * math.cos(2.55) + Z * math.sin(2.55)) * .64, .045, .02,
                 up=fc.n, tint=.12, tag='clock')
    A.mb(BR).cyl(cc + fc.n * .1, .07, .04, n=10, rot=(math.pi / 2, 0, fc.rot), tag='clock')
    fc.box(tm, Lc / 2, 10.05, .09, 1.2, .1, .1, ch=.02, tag='clock')

    # ---- gallery balcony at z = 11 (walkable floor), with brackets and a railing
    G = 2.5
    wm.box((0, 0, ZS1 - .09), (2 * G, 2 * G, .18), ch=.03, tint=.7, tag='gallery')
    for i in range(10):
        wm.box((-G + .25 + i * .5, 0, ZS1 - .005), (.47, 2 * G - .04, .01), tint=.85 + .1 * rng.random(), tag='gallery')
    for side in range(4):
        a = side * math.pi / 2
        o = V((math.cos(a), math.sin(a), 0))
        t = V((-o.y, o.x, 0))
        for s in (-1, 0, 1):
            p0 = o * (S + .02) + t * s * 1.1
            wm.beam(V((p0.x, p0.y, ZS1 - 1.0)), V((p0.x + o.x * .6, p0.y + o.y * .6, ZS1 - .2)), .12, .12, tint=.72,
                    tag='gallery brackets')
        cor = [o * (G - .06) + t * (G - .06), o * (G - .06) - t * (G - .06)]
        baluster_rail(A, cor[0], cor[1], ZS1, .95, C, T, spacing=.25, tag='railing')

    # ---- bell chamber: corner piers, arched openings, bell on its yoke
    ZC0, ZC1 = ZS1, 13.7
    Q = 1.6
    for sx in (-1, 1):
        for sy in (-1, 1):
            cm.box((sx * (Q - .2), sy * (Q - .2), (ZC0 + ZC1) / 2), (.42, .42, ZC1 - ZC0), ch=.03, tint=1.0, tag='piers')
            tm.box((sx * (Q - .2), sy * (Q - .2), ZC0 + .15), (.5, .5, .3), ch=.03, tag='piers')
    for side in range(4):
        a = side * math.pi / 2
        o = V((math.cos(a), math.sin(a), 0))
        t = V((-o.y, o.x, 0))
        base = o * (Q - .15)
        # arch trim between the piers
        pts = []
        for i in range(13):
            ang = math.pi * i / 12
            p = base + t * math.cos(ang) * (Q - .4)
            pts.append(V((p.x, p.y, 12.75 + math.sin(ang) * .55)))
        tm.loft(pts, [(-.06, -.08), (.06, -.08), (.06, .08), (-.06, .08)], up=o, tag='arches')
        # spandrel panel above the arch up to the entablature
        f_ = Face(V((base.x, base.y, 0)) - t * (Q - .4), o)
        wtop = 13.7
        bm = bmesh.new()
        for sgn in (-1, 1):
            vs = [bm.verts.new(f_.p((Q - .4) + sgn * (Q - .4), wtop, 0))]
            for i in range(7):
                ang = math.pi / 2 * i / 6
                vs.append(bm.verts.new(f_.p((Q - .4) + sgn * (Q - .4) * math.cos(ang), 12.75 + .55 * math.sin(ang), 0)))
            vs.append(bm.verts.new(f_.p((Q - .4), wtop, 0)))
            try:
                bm.faces.new(vs)
            except ValueError:
                pass
        bm.normal_update()
        for fc_ in bm.faces:
            if fc_.normal.dot(o) < 0:
                fc_.normal_flip()
        cm.append(bm, tint=1.0, smooth=0, flat=True, tag='spandrels')
        # low balustrade in the opening
        cor = [base + t * (Q - .42), base - t * (Q - .42)]
        baluster_rail(A, cor[0], cor[1], ZC0, .7, C, T, spacing=.2, tag='chamber rail')
    cm.box((0, 0, ZC1 + .1), (2 * Q + .2, 2 * Q + .2, .22), ch=.03, tint=1.0, tag='entablature')
    tm.box((0, 0, ZC1 - .06), (2 * Q + .12, 2 * Q + .12, .12), ch=.02, tag='entablature')
    # yoke beam across the chamber and the bell (pivot at the crown, swings about X)
    wm.box((0, 0, 13.35), (2 * Q - .5, .22, .26), ch=.03, tint=dark(1.1), tag='yoke')
    BZ = 13.2
    A.pivot('Bell', (0, 0, BZ), ground=None, with_statics=False)
    bb = A.mb(BR, 'Bell')
    prof = [(0, 0), (.16, 0), (.22, -.05), (.27, -.18), (.3, -.4), (.36, -.62), (.47, -.8), (.5, -.86), (.48, -.9),
            (.42, -.88), (.3, -.7), (0, -.7)]
    bb.lathe([(r_, BZ + z_) for r_, z_ in prof], (0, 0, 0), n=16, tag='bell', smooth=50)
    bb.torus((0, 0, BZ + .05), .1, .04, maj=10, mn=4, rot=(0, math.pi / 2, 0), tag='bell')
    bb.torus((0, 0, BZ - .4), .305, .02, maj=16, mn=4, tag='bell')
    A.mb(W, 'Bell').rod((0, 0, BZ - .7), (0, 0, BZ - .98), .025, n=5, tint=.2, tag='clapper')
    A.mb(W, 'Bell').sphere((0, 0, BZ - 1.0), .08, seg=8, rings=5, tint=.2, tag='clapper')
    # bell rope down to the gallery
    A.mb(C).rod((.4, 0, BZ - .1), (.45, .3, ZS1 + .3), .02, n=4, tint=(.95, .82, .55), tag='rope')

    # ---- hipped roof over the chamber (teal shingles) and the lamp cupola
    slopes, roof = hip_roof(A, RT, 2.05, 13.95, .55, sag=.18, lift_k=.08,
                            style=dict(ROOF_STYLES['shingle'], pitch=.34, course=.3, thick=.12), under_mat=C,
                            fascia_mat=T, cap_mat=T, seed=110)
    K = .62
    ZK0, ZK1 = 14.45, 15.5
    zk = (ZK0 + ZK1) / 2
    cm.box((0, 0, ZK0 - .12), (2 * K + .4, 2 * K + .4, .5), ch=.04, tint=1.0, tag='cupola base')
    A.mb(LGL).box((0, 0, zk), (2 * K - .06, 2 * K - .06, ZK1 - ZK0 - .1), ch=.02, tag='cupola glass')
    for sx in (-1, 1):
        for sy in (-1, 1):
            tm.box((sx * K, sy * K, zk), (.12, .12, ZK1 - ZK0), ch=.015, tag='cupola posts')
    for side in ('-y', '+x', '+y', '-x'):
        f, L = rect_face(-K + .03, K - .03, -K + .03, K - .03, side)
        ring_pts = star_outline(.36, .155)
        for k in range(10):
            p0, p1 = V(ring_pts[k]), V(ring_pts[(k + 1) % 10])
            A.mb(BR).beam(f.p(L / 2 + p0.x, zk + p0.y, .02), f.p(L / 2 + p1.x, zk + p1.y, .02), .03, .025, up=f.n,
                          tag='cupola star')
    tm.box((0, 0, ZK1 + .02), (2 * K + .26, 2 * K + .26, .12), ch=.02, tag='cupola cornice')
    A.marker('Flame', (0, 0, zk))
    slopes2, roof2 = hip_roof(A, RT, K + .28, ZK1 + .12, .9, sag=.3, lift_k=.12,
                              style=dict(ROOF_STYLES['seam'], pitch=.26, course=.5, thick=.08), under_mat=C, fascia_mat=T,
                              cap_mat=T, seed=120)
    apex = roof2.z(V((0, 0)), K + .28)
    A.mb(BR).lathe([(0, apex - .05), (.08, apex - .05), (.1, apex + .05), (.05, apex + .12), (.06, apex + .2), (0, apex + .24)],
                   (0, 0, 0), n=8, tag='finial')
    sc = V((0, 0, apex + .45))
    gem_star(A.mb(LST), sc, .3, depth=.1, facing=(0, -1, 0), tag='finial star')
    gem_star(A.mb(LST), sc, .23, depth=.08, facing=(1, 0, 0), tag='finial star')

    return A.finish(ao_distance=1.2, ao_strength=.6, ground=0.0)


# ---------------------------------------------------------------- bakery

BREAD = (.93, .62, .36)        # golden crust, painted from the mustard trim


def brick_tint(rng, u=0, z=0):
    k = .78 + .22 * rng.random()
    h = rng.random()
    if h < .2:
        return (k * .78, k * .72, k * .72)      # dark burnt brick
    if h < .45:
        return (k, k * .88, k * .78)             # orange brick
    return (k * .95, k * .92, k * .92)


def bricks(mb, face, u0, u1, z0, z1, holes=(), rng=None, course=.2, length=.44, tag='bricks'):
    masonry(mb, face, u0, u1, z0, z1, holes, rng=rng, course=(course, course), length=(length, length), gap=.028,
            pillow=0, tint_fn=brick_tint, tag=tag, relief=.01, jitter=0)


def loaf(mb, c, kind, rng, rot=0., tag='bread'):
    c = V(c)
    if kind == 'round':
        mb.sphere(c, (.13, .13, .08), seg=8, rings=5, rot=(0, 0, rot), tint=tmul(BREAD, .9 + .1 * rng.random()), tag=tag)
    elif kind == 'long':
        mb.append(bm_lathe([(0, -.28), (.05, -.25), (.065, -.1), (.065, .1), (.05, .25), (0, .28)], 8),
                  xform(c, (math.pi / 2, 0, rot)), tmul(BREAD, .85 + .1 * rng.random()), smooth=60, tag=tag)
    else:  # melon-pan bun
        mb.sphere(c, (.09, .09, .065), seg=8, rings=5, tint=tmul(BREAD, 1.05), tag=tag)


def basket(A, wood, c, r=.28, h=.16, rng=None, kinds=('round', 'long', 'bun'), tag='baskets'):
    c = V(c)
    A.mb(wood).lathe([(0, 0), (r * .8, 0), (r, h), (r * .9, h), (0, .02)], c, n=10, tint=(.92, .72, .45), tag=tag)
    tm_ = A.mb(TRIM_MAT[0])
    for i, k in enumerate(kinds):
        a = TAU * i / len(kinds) + (rng.random() if rng else 0)
        loaf(tm_, c + V((math.cos(a) * r * .4, math.sin(a) * r * .4, h + .02)), k, rng or random.Random(1), rot=a)


TRIM_MAT = [None]


@builder('bakery')
def build_bakery():
    A = Asset('bakery', 'Bakery')
    rng = random.Random(111)
    BK, C, T, RT, W, G = M_brick(), M_clap(), M_trim(), M_troof(), M_wood(), M_leaf()
    AW = mat('Awning rose', '#e0567a', rough=.6, double=True)
    WG = window_glow()
    TRIM_MAT[0] = T
    bm_, cm, tm, wm = A.mb(BK), A.mb(C), A.mb(T), A.mb(W)

    X0, X1, Y0, Y1 = -3.6, 3.6, -2.6, 2.8
    Z1, Z2 = 3.2, 5.35
    L = X1 - X0

    # ---- brick ground floor on a stone plinth, big shop windows and the door
    plinth(A, C, X0 - .1, X1 + .1, Y0 - .1, Y1 + .1, z_top=.18, rng=rng, depth=.22, wmin=.55, wmax=1.0)
    gh = {'-y': [(.4, 2.9, .6, 2.55), (3.1, 4.1, .2, 2.6), (4.3, 6.8, .6, 2.55)],
          '+x': [(3.9, 4.8, 1.0, 2.3)], '+y': [(1.2, 2.2, 1.0, 2.3), (4.8, 5.8, .2, 2.4)], '-x': [(1.4, 2.4, .2, 2.4), (3.6, 4.5, 1.0, 2.3)]}
    faces = {}
    for side in ('-y', '+x', '+y', '-x'):
        f, Lf = rect_face(X0, X1, Y0, Y1, side)
        faces[side] = (f, Lf)
        bricks(bm_, f, 0, Lf, .18, Z1, gh[side], rng=rng)
        f.box(A.mb(C), Lf / 2, Z1 + .02, .06, Lf + .2, .2, .14, ch=.03, tint=stone_tint(rng, 1.25), tag='string course')
        for h in gh[side]:
            if h[2] > .3:
                f.box(A.mb(C), (h[0] + h[1]) / 2, h[3] + .1, .04, h[1] - h[0] + .3, .2, .14, ch=.02, tint=stone_tint(rng, 1.2),
                      tag='lintels')
    ff, Lf = faces['-y']
    for h in (gh['-y'][0], gh['-y'][2]):
        sash(A, ff, h, T, WG, A.mb(BK), cols=4, rows=2, frame_tint=1.0, casing=T, casing_w=.12, sill_mat=C,
             sill_tint=stone_tint(rng, 1.2), depth=.16, reveal_tint=.7, mid_rail=False)
        # stall board below the shop window
        ff.box(tm, (h[0] + h[1]) / 2, .38, .03, h[1] - h[0] + .1, .38, .06, ch=.015, tint=.9, tag='stall boards')
        for k in range(2):
            ff.box(tm, (h[0] + h[1]) / 2 + (k - .5) * (h[1] - h[0]) / 2, .38, .07, (h[1] - h[0]) / 2 - .2, .24, .02,
                   ch=.01, tint=.8, tag='stall boards')
    dh = gh['-y'][1]
    panel_door(A, ff, dh, RT, A.mb(BK), leaf_tint=1.0, frame_mat=T, frame_tint=1.0, knob_mat=T, glass_mat=WG, panels=1)
    stone(A.mb(C), ff.p((dh[0] + dh[1]) / 2, .08, .3), (1.3, .5, .16), 0, rng, tint=stone_tint(rng, 1.2), tag='steps')
    for side in ('+x', '+y', '-x'):
        f, Lf_ = faces[side]
        for h in gh[side]:
            if h[2] < .3:
                panel_door(A, f, h, W, A.mb(BK), leaf_tint=.7, frame_mat=T, frame_tint=1.0, panels=2)
            else:
                west_window(A, f, h, C, T, WG, cols=2, rows=2, cornice=False)

    # ---- striped awning with a scalloped valance
    ay0, ay1 = Y0, Y0 - 1.15
    az0, az1 = 3.0, 2.45
    n = 20
    for i in range(n):
        xa, xb = X0 + .1 + (L - .2) * i / n, X0 + .1 + (L - .2) * (i + 1) / n
        m = A.mb(AW) if i % 2 == 0 else cm
        m.poly([(xa, ay1, az1), (xb, ay1, az1), (xb, ay0, az0), (xa, ay0, az0)], normal=V((0, -.5, 1)), tag='awning')
        m.poly([(xa, ay1, az1), (xb, ay1, az1), (xb, ay1, az1 - .2), (xa, ay1, az1 - .2)], normal=V((0, -1, 0)),
               tag='awning')
        sc = [(xa + (xb - xa) * (.5 + .5 * math.cos(math.pi * k / 6)), ay1 - .003, az1 - .2 - .1 * math.sin(math.pi * k / 6))
              for k in range(7)]
        m.poly(sc, normal=V((0, -1, 0)), tag='awning')
    for sx in (-1, 1):
        A.mb(AW).poly([(sx * (L / 2 - .1), ay0, az0), (sx * (L / 2 - .1), ay1, az1), (sx * (L / 2 - .1), ay1, az1 - .2),
                       (sx * (L / 2 - .1), ay0, az0 - .2)], normal=V((sx, 0, 0)), tag='awning')
    tm.box((0, ay1 + .02, az1 - .02), (L - .1, .05, .05), tag='awning')
    for sx in (-1, 1):
        tm.beam((sx * (L / 2 - .15), Y0 + .02, 2.2), (sx * (L / 2 - .15), ay1 + .1, az1 - .05), .04, .04, tag='awning')
    # fascia sign board between the floors with a loaf emblem
    ff.box(wm, Lf / 2, 3.55, .07, 3.4, .5, .08, ch=.02, tint=dark(1.2), tag='signboard')
    ff.box(cm, Lf / 2, 3.55, .115, 3.2, .38, .02, tint=1.0, tag='signboard')
    for k in (0, 1, 3, 4):
        ff.box(wm, Lf / 2 - 1.2 + k * .6, 3.55, .13, .24, .24, .01, tint=.25, tag='signboard')
    loaf(tm, ff.p(Lf / 2, 3.55, .2), 'long', rng, rot=0)
    # hanging bracket sign with a loaf, at the west corner
    wm.beam((X0 - .02, Y0 + .3, 3.9), (X0 - .95, Y0 + .3, 3.9), .06, .06, tint=dark(), tag='bracket sign')
    wm.beam((X0 - .02, Y0 + .3, 3.4), (X0 - .7, Y0 + .3, 3.88), .04, .04, tint=dark(), tag='bracket sign')
    sign_c = V((X0 - .55, Y0 + .3, 3.45))
    A.mb(RT).box(sign_c, (.7, .06, .5), ch=.02, tag='bracket sign')
    for sy in (-1, 1):
        loaf(tm, sign_c + V((0, sy * .05, 0)), 'round', rng)
        A.mb(W).rod(sign_c + V((sy * .25, 0, .25)), sign_c + V((sy * .25, 0, .45)), .008, n=3, tint=.3, tag='bracket sign')

    # ---- clapboard upper floor with flower boxes and teal shutters
    uh = {'-y': [(.9, 1.9, 3.85, 4.9), (3.1, 4.1, 3.85, 4.9), (5.3, 6.3, 3.85, 4.9)], '+x': [(3.8, 4.7, 3.85, 4.8)],
          '+y': [(1.6, 2.6, 3.85, 4.9), (4.6, 5.6, 3.85, 4.9)], '-x': [(2.3, 3.2, 3.85, 4.8)]}
    for side in ('-y', '+x', '+y', '-x'):
        f, Lf_ = faces[side]
        clapboard(cm, f, 0, Lf_, Z1 + .12, Z2, uh[side], board=.2, lap=.035, rng=rng)
        corner_boards(A, f, Lf_, Z1 + .12, Z2 + .05, T)
        f.box(tm, Lf_ / 2, Z2 - .06, .05, Lf_ + .14, .16, .1, ch=.02, tint=.95, tag='frieze')
        for h in uh[side]:
            west_window(A, f, h, C, T, WG, cols=2, rows=2, cornice=True, shutters=RT if side == '-y' else None)
            if side == '-y':
                flower_box(A, f, (h[0] + h[1]) / 2, h[2] - .32, h[1] - h[0] + .1, T, G, AW, rng, box_tint=.85,
                           flower_mat2=C)

    # ---- teal roof (gable along X) with a dormer and the brick chimney + oven
    EO, VO = .45, .4
    thick = ROOF_STYLES['shingle']['thick']
    pitch = .58
    D = (Y1 - Y0) / 2 + EO
    yc = (Y0 + Y1) / 2
    rtmp = Roof(0, pitch, D, sag=.12)
    eave_z = Z2 + thick + .02 - rtmp.g(EO)
    st = dict(ROOF_STYLES['shingle'], pitch=.4, course=.32)
    front, back, _ = gable_roof(A, RT, X0 - VO, X1 + VO, yc - D, yc + D, eave_z, pitch, sag=.12, style=st, under_mat=C,
                                fascia_mat=T, seed=115, ridge_mat=T, oni=False, ridge_layers=1, ridge_w=.26)
    for xe in (X0 - VO, X1 + VO):
        for s, ye in ((front, yc - D), (back, yc + D)):
            bargeboard(A, T, s, (xe, ye), (xe, yc), h=.24, t=.08, tint=1.0, out=V((1 if xe > 0 else -1, 0)))
    for side in ('+x', '-x'):
        f, Lf_ = faces[side]
        top = under_fn([front, back], f, thick, u0=0, u1=Lf_)
        clapboard(cm, f, 0, Lf_, Z2, Z2 + .01, [], board=.2, lap=.035, rng=rng, top=top, tag='gable clapboard')
        cc = f.p(Lf_ / 2, Z2 + .75, .04)
        A.mb(WG).cyl(f.p(Lf_ / 2, Z2 + .75, .01), .28, .02, n=12, rot=(math.pi / 2, 0, f.rot), tag='oculus')
        tm.torus(cc + f.n * .02, .31, .05, maj=12, mn=4, rot=(math.pi / 2, 0, f.rot), tag='oculus')
    # brackets under the eaves (Western soffit look)
    for s in (front, back):
        for i in range(9):
            x = X0 + .2 + i * (L - .4) / 8
            yw = Y0 if s is front else Y1
            ye = s.a.y
            p0 = V((x, yw + (-.02 if s is front else .02), Z2 - .12))
            p1 = V((x, lerp(yw, ye, .8), s.z(V((x, lerp(yw, ye, .8)))) - thick - .05))
            tm.beam(p0, p1, .07, .09, tint=.9, tag='eave brackets')
    # dormer on the front slope
    dx, dw = 0.0, 1.3
    dyf = Y0 + .35
    dz0 = front.z(V((dx, dyf))) - .3
    dz1 = dz0 + .95
    df = Face((dx - dw / 2, dyf, 0), (0, -1, 0))
    clapboard(cm, df, 0, dw, dz0, dz1, [(.3, 1.0, dz0 + .3, dz1 - .1)], board=.18, lap=.03, rng=rng, tag='dormer')
    west_window(A, df, (.3, 1.0, dz0 + .3, dz1 - .1), C, T, WG, cols=2, rows=1, cornice=False)
    for sx in (-1, 1):
        fs = Face((dx + sx * dw / 2, dyf if sx > 0 else dyf + 1.9, 0), (sx, 0, 0))
        panel(cm, fs, 0, 1.9, dz0, dz1, [], tint=.95, tag='dormer')
    droof = Roof(0, .6, dw / 2 + .2, sag=.05)
    droof.eave_z = dz1 + .02
    DB = dyf + 1.9
    for sgn in (-1, 1):
        xa = dx + sgn * (dw / 2 + .2)
        if sgn < 0:
            poly = [(xa, DB), (xa, dyf - .25), (dx, dyf - .25), (dx, DB)]
            a_, b_ = (xa, DB), (xa, dyf - .25)
        else:
            poly = [(xa, dyf - .25), (xa, DB), (dx, DB), (dx, dyf - .25)]
            a_, b_ = (xa, dyf - .25), (xa, DB)
        sd = Slope(droof, poly, a_, b_, ['eave', 'verge', 'ridge', 'verge'])
        tile_slope(A, sd, RT, dict(ROOF_STYLES['shingle'], pitch=.34, course=.26, thick=.1), under_mat=C, fascia_mat=T,
                   seed=140 + sgn)
    zdr = dz1 + .02 + droof.g(dw / 2 + .2)
    tm.beam((dx, dyf - .3, zdr + .02), (dx, DB - .05, zdr + .02), .12, .1, tag='dormer')
    for sgn in (-1, 1):
        tm.beam((dx + sgn * (dw / 2 + .22), dyf - .27, dz1 + .03), (dx, dyf - .27, zdr + .04), .1, .1, tag='dormer')
    # brick oven dome on the +X wall and the big chimney (node Chimney)
    ox, oy = X1 + .55, .6
    A.mb(C).box((ox - .05, oy, .2), (1.9, 1.9, .4), ch=.04, tint=stone_tint(rng, 1.1), tag='oven')
    rows = 7
    for k in range(rows):
        t0, t1 = k / rows, (k + 1) / rows
        r0 = .88 * math.cos(t0 * math.pi / 2) ** .8 + .05
        r1 = .88 * math.cos(t1 * math.pi / 2) ** .8 + .05
        z0, z1 = .4 + .95 * math.sin(t0 * math.pi / 2), .4 + .95 * math.sin(t1 * math.pi / 2)
        n_ = max(5, int(r0 * 14))
        for i in range(n_):
            a0, a1 = TAU * (i + (k % 2) * .5) / n_, TAU * (i + 1 + (k % 2) * .5) / n_
            g = .012
            pts = [V((ox - .05 + math.cos(a0 + g) * r0, oy + math.sin(a0 + g) * r0, z0 + g)),
                   V((ox - .05 + math.cos(a1 - g) * r0, oy + math.sin(a1 - g) * r0, z0 + g)),
                   V((ox - .05 + math.cos(a1 - g) * r1, oy + math.sin(a1 - g) * r1, z1 - g)),
                   V((ox - .05 + math.cos(a0 + g) * r1, oy + math.sin(a0 + g) * r1, z1 - g))]
            if k == rows - 1:
                pts = pts[:3]
            cen = V((ox - .05, oy, .4))
            bm_.poly(pts, tint=brick_tint(rng), normal=sum(pts, V((0, 0, 0))) / len(pts) - cen, tag='oven')
    bm_.lathe([(0, .4), (.9, .4), (.9, .42), (0, 1.3)], (ox - .05, oy, 0), n=12, tint=.35, tag='oven')
    # arched mouth facing +X with a warm glow inside and a little iron door leaning beside it
    mc = V((ox + .8, oy, .4))
    mouth = [(-.28, 0), (.28, 0)] + [(.28 * math.cos(math.pi * i / 8), .2 + .28 * math.sin(math.pi * i / 8)) for i in range(9)]
    A.mb(W).extrude(mouth, .06, mc, rot=(0, 0, math.pi / 2), tint=.1, tag='oven')
    A.mb(WG).extrude([(x * .8, y * .8) for x, y in mouth], .02, mc + V((.035, 0, .02)), rot=(0, 0, math.pi / 2), tag='oven')
    for i in range(7):
        a = math.pi * i / 6
        c = mc + V((.03, .34 * math.cos(a), .2 + .34 * math.sin(a)))
        bm_.box(c, (.1, .09, .16), rot=(-(a - math.pi / 2), 0, 0), tint=brick_tint(rng), tag='oven')
    chx, chy = X1 + .15, oy
    ctop = 7.55
    for side in ('-y', '+x', '+y', '-x'):
        fch, Lc = rect_face(chx - .5, chx + .5, chy - .5, chy + .5, side)
        bricks(bm_, fch, 0, Lc, 1.2, ctop, (), rng=rng, course=.2, length=.34, tag='chimney')
    bm_.box((chx, chy, (1.2 + ctop) / 2), (.96, .96, ctop - 1.2), tint=.6, tag='chimney')
    bm_.box((chx, chy, ctop + .08), (1.2, 1.2, .16), ch=.03, tint=.8, tag='chimney')
    bm_.box((chx, chy, 4.2), (1.12, 1.12, .12), ch=.02, tint=.85, tag='chimney')
    for k in range(2):
        A.mb(C).cyl((chx - .2 + .4 * k, chy, ctop + .35), .12, .4, n=8, r2=.1, tint=stone_tint(rng, 1.0), tag='chimney pots')
    A.marker('Chimney', (chx, chy, ctop + .6))
    # firewood for the oven
    firewood(A, W, (ox + .1, oy + 1.9, 0), length=1.2, rows=3, depth=.42, rot=math.pi / 2, rng=rng)

    # ---- bread display under the awning and a chalkboard stand
    tx = -2.2
    wm.box((tx, Y0 - .55, .75), (1.5, .6, .06), ch=.015, tint=.8, tag='display table')
    cm.box((tx, Y0 - .55, .79), (1.52, .62, .02), tint=1.0, tag='display table')
    for sx in (-1, 1):
        for sy in (-1, 1):
            wm.box((tx + sx * .68, Y0 - .55 + sy * .24, .37), (.06, .06, .74), tint=dark(1.2), tag='display table')
    for i in range(3):
        basket(A, W, (tx - .5 + i * .5, Y0 - .55, .8), r=.22, h=.14, rng=rng,
               kinds=(('round', 'round', 'bun'), ('long', 'long'), ('bun', 'bun', 'round'))[i])
    cb = V((1.4, Y0 - .9, 0))
    for sgn in (-1, 1):
        wm.append(bm_box((.62, .05, 1.0)), xform(cb + V((0, sgn * .2, .5)), (sgn * .2, 0, 0)), tint=.2, smooth=38,
                  tag='chalkboard')
    for k in range(3):
        cm.box(cb + V((0, -.245, .7 - k * .15)), (.4 - .08 * k, .01, .03), rot=(-.2, 0, 0), tint=1.0, tag='chalkboard')
    potted_plant(A, T, G, (3.2, Y0 - .4, 0), r=.2, h=.32, kind='bush', rng=rng, flower_mat=AW, pot_tint=.7)

    return A.finish(ao_distance=1.2, ao_strength=.6, ground=0.0)


# ---------------------------------------------------------------- Takamori houses


def column(A, trim_mat, c, h, r=.1, tint=1.0, tag='columns'):
    """Turned porch column with base and capital."""
    c = V(c)
    A.mb(trim_mat).lathe([(0, 0), (r * 1.6, 0), (r * 1.6, .08), (r * 1.2, .14), (r, .22), (r * .92, h - .26),
                          (r * 1.15, h - .18), (r * 1.15, h - .12), (r * 1.6, h - .08), (r * 1.6, h), (0, h)], c, n=10,
                         tint=tint, tag=tag, smooth=40)


def picket_fence(A, mat_, a, b, h=.8, spacing=.16, tint=1.0, tag='fence'):
    a, b = V(a), V(b)
    d = b - a
    n = max(1, int(d.length / spacing))
    rot = math.atan2(d.y, d.x)
    for i in range(n + 1):
        p = a.lerp(b, i / n)
        A.mb(mat_).box((p.x, p.y, h / 2), (.07, .03, h), rot=(0, 0, rot), tint=tint, tag=tag)
        A.mb(mat_).box((p.x, p.y, h + .03), (.07, .03, .07), rot=(0, 0, rot + 0), taper=(.1, 1), tint=tint, tag=tag)
    for z in (.25, h - .15):
        A.mb(mat_).beam(V((a.x, a.y, z)), V((b.x, b.y, z)), .03, .06, tint=tmul(tint, .92), tag=tag)


@builder('takamori-house-a')
def build_takamori_house_a():
    A = Asset('takamori-house-a', 'Takamori house A')
    rng = random.Random(121)
    C, T, RT, BK, G, FL = M_clap(), M_trim(), M_troof(), M_brick(), M_leaf(), M_flowers()
    WG = window_glow()
    cm, tm = A.mb(C), A.mb(T)

    X0, X1, Y0, Y1 = -3.35, 3.35, -2.55, 2.55
    ZF, Z1, Z2 = .55, 3.35, 6.05
    L = X1 - X0

    plinth(A, C, X0 - .08, X1 + .08, Y0 - .08, Y1 + .08, z_top=ZF - .05, rng=rng, depth=.22, rows=1, wmin=.55, wmax=1.0)
    # bay window (ground floor) on the left of the front
    bu0, bu1, bd = .55, 2.75, .62
    bx0, bx1 = X0 + bu0, X0 + bu1
    by = Y0
    bay_pts = [V((bx0, by)), V((bx0 + bd, by - bd)), V((bx1 - bd, by - bd)), V((bx1, by))]
    front_holes_g = [(bu0 + .02, bu1 - .02, ZF, Z1 - .15), (4.15, 5.05, ZF + .02, 2.85)]
    gh = {'-y': front_holes_g, '+x': [(1.2, 2.1, 1.1, 2.7), (3.1, 4.0, 1.1, 2.7)],
          '+y': [(1.0, 1.9, 1.1, 2.7), (3.6, 4.5, ZF + .02, 2.75), (5.0, 5.9, 1.1, 2.7)], '-x': [(1.2, 2.1, 1.1, 2.7), (3.1, 4.0, 1.1, 2.7)]}
    uh = {'-y': [(.85, 1.75, 3.85, 5.45), (4.15, 5.05, Z1 + .15, 5.6)], '+x': [(1.2, 2.1, 3.85, 5.45), (3.1, 4.0, 3.85, 5.45)],
          '+y': [(1.0, 1.9, 3.85, 5.45), (3.6, 4.5, 3.85, 5.45), (5.0, 5.9, 3.85, 5.45)], '-x': [(1.2, 2.1, 3.85, 5.45), (3.1, 4.0, 3.85, 5.45)]}
    uh['-y'].insert(1, (1.95, 2.85, 3.85, 5.45))
    faces = {}
    for side in ('-y', '+x', '+y', '-x'):
        f, Lf = rect_face(X0, X1, Y0, Y1, side)
        faces[side] = (f, Lf)
        clapboard(cm, f, 0, Lf, ZF, Z1 - .1, gh[side], board=.21, lap=.035, rng=rng)
        clapboard(cm, f, 0, Lf, Z1 + .12, Z2 - .12, uh[side], board=.21, lap=.035, rng=rng)
        corner_boards(A, f, Lf, ZF - .05, Z2, T)
        f.box(tm, Lf / 2, Z1 + .01, .05, Lf + .12, .24, .1, ch=.02, tint=.95, tag='belt')
        f.box(tm, Lf / 2, Z2 - .08, .05, Lf + .12, .2, .1, ch=.02, tint=.95, tag='frieze')
        f.box(tm, Lf / 2, ZF - .02, .05, Lf + .1, .12, .08, tint=.85, tag='water table')
        for h in gh[side] + uh[side]:
            if side == '-y' and h in front_holes_g:
                continue
            if h[2] < ZF + .1 or (side == '-y' and h == uh['-y'][2]):
                continue
            west_window(A, f, h, C, T, WG, cols=2, rows=2, cornice=h[2] > Z1, pediment=h[2] < Z1 and side == '+y',
                        shutters=RT if (side == '-y' or (side == '-x' and h[2] < Z1)) else None)
            if side == '-y' and h[2] > Z1:
                flower_box(A, f, (h[0] + h[1]) / 2, h[2] - .32, h[1] - h[0] + .1, T, G, FL, rng, box_tint=.85,
                           flower_mat2=C)
        for h in gh[side]:
            if h[2] < ZF + .1 and side != '-y':
                panel_door(A, f, h, RT, cm, leaf_tint=.9, frame_mat=T, frame_tint=1.0, knob_mat=T, panels=2)
    ff, Lf = faces['-y']
    # ---- bay: three glazed facets on a panelled base, with its own little hip roof
    for k in range(3):
        a, b = bay_pts[k], bay_pts[k + 1]
        nrm = V((b.y - a.y, -(b.x - a.x), 0)).normalized()
        fb = Face(V((a.x, a.y, 0)), nrm)
        wlen = (b - a).length
        panel(cm, fb, 0, wlen, ZF, 1.05, [], tint=.96, tag='bay')
        fb.box(tm, wlen / 2, .82, .03, wlen - .1, .36, .03, ch=.01, tint=.85, tag='bay')
        hole = (.1, wlen - .1, 1.15, Z1 - .3)
        panel(cm, fb, 0, wlen, 1.05, Z1 - .15, [hole], tint=.96, tag='bay')
        sash(A, fb, hole, C, WG, cm, cols=2 if k == 1 else 1, rows=3, depth=.08, frame_tint=1.0, casing=T,
             casing_tint=1.0, casing_w=.08, sill_mat=T, sill_tint=.95, tag='bay window')
        for u in (0, wlen):
            fb.box(tm, u, (ZF + Z1) / 2 - .05, .02, .1, Z1 - ZF - .1, .08, ch=.012, tag='bay')
    cm.poly([V((p.x, p.y, ZF)) for p in reversed(bay_pts)], normal=-Z, tag='bay')
    bay_eave = [V((bx0 - .12, by + .0)), V((bx0 + bd - .05, by - bd - .12)), V((bx1 - bd + .05, by - bd - .12)),
                V((bx1 + .12, by))]
    poly_roof(A, RT, bay_eave, Z1 - .05, .62, style=dict(ROOF_STYLES['shingle'], pitch=.3, course=.24, thick=.1),
              under_mat=C, fascia_mat=T, cap_mat=T, seed=131)
    # ---- porch with columns carrying the balcony, French door above
    px0, px1, py1 = X0 + 3.75, X0 + 5.45, Y0 - 1.05
    dh = front_holes_g[1]
    panel_door(A, ff, dh, RT, cm, leaf_tint=1.0, frame_mat=T, frame_tint=1.0, knob_mat=T, glass_mat=WG, panels=1)
    cm.box(((px0 + px1) / 2, (Y0 + py1) / 2, ZF - .06), (px1 - px0, Y0 - py1, .12), ch=.02, tint=.9, tag='porch')
    A.mb(C).box(((px0 + px1) / 2, (Y0 + py1) / 2, (ZF - .8) / 2 - .06), (px1 - px0 - .1, Y0 - py1 - .1, ZF + .7),
                tint=stone_tint(rng, .9), tag='porch')
    for k in range(3):
        A.mb(C).box(((px0 + px1) / 2, py1 - .14 - k * .26, ZF - .18 - k * .17), (1.2, .28, .16), ch=.02,
                    tint=stone_tint(rng, 1.15), tag='porch steps')
    for x in (px0 + .12, px1 - .12):
        column(A, T, (x, py1 + .14, ZF), Z1 - ZF - .15, r=.1, tint=.98)
    bz = Z1 - .12
    cm.box(((px0 + px1) / 2, (Y0 + py1) / 2 - .05, bz), (px1 - px0 + .2, Y0 - py1 + .1, .2), ch=.03, tint=.98,
           tag='balcony')
    tm.box(((px0 + px1) / 2, py1 - .02, bz - .02), (px1 - px0 + .24, .08, .24), ch=.02, tag='balcony')
    for (a, b) in (((px0, py1 + .05), (px1, py1 + .05)), ((px0, py1 + .05), (px0, Y0 - .02)), ((px1, py1 + .05), (px1, Y0 - .02))):
        baluster_rail(A, (a[0], a[1]), (b[0], b[1]), bz + .1, .85, C, T, spacing=.16, tag='balcony rail')
    fd = uh['-y'][2]
    reveal(cm, ff, fd, .1, tint=.85)
    for s in (-1, 1):
        u0 = (fd[0] + fd[1]) / 2 + (s - 1) * (fd[1] - fd[0]) / 4
        sash(A, ff, (u0 + .02 if s < 0 else (fd[0] + fd[1]) / 2 + .01, (fd[0] + fd[1]) / 2 - .01 if s < 0 else fd[1] - .02,
                     fd[2] + .02, fd[3] - .02), C, WG, cm, cols=1, rows=4, depth=.08, frame_tint=1.0, tag='french door')
    ff.box(tm, (fd[0] + fd[1]) / 2, fd[3] + .16, .06, fd[1] - fd[0] + .4, .08, .16, ch=.02, tint=.95, tag='window head')
    for u in (fd[0] - .05, fd[1] + .05):
        ff.box(tm, u, (fd[2] + fd[3]) / 2, .03, .1, fd[3] - fd[2], .05, tag='window casing')

    # ---- hipped teal roof, eave brackets, brick chimney on the east wall
    EO = .45
    thick = ROOF_STYLES['shingle']['thick']
    pitch = .72
    rtmp = Roof(0, pitch, (Y1 - Y0) / 2 + EO, sag=.12)
    eave_z = Z2 + thick + .02 - rtmp.g(EO)
    rf = hip_rect(A, RT, X0 - EO, X1 + EO, Y0 - EO, Y1 + EO, eave_z, pitch, sag=.12,
                  style=dict(ROOF_STYLES['shingle'], pitch=.44, course=.36), under_mat=C, fascia_mat=T, cap_mat=T, seed=125)
    for key, fcs in (('front', '-y'), ('back', '+y'), ('right', '+x'), ('left', '-x')):
        f, Lf_ = faces[fcs]
        s = rf[key]
        n_ = int(Lf_ / .9)
        for i in range(n_ + 1):
            u = .2 + i * (Lf_ - .4) / n_
            p0 = f.p(u, Z2 - .2, .02)
            pe = f.p(u, 0, EO * .75)
            p1 = V((pe.x, pe.y, s.z(V((pe.x, pe.y))) - thick - .05))
            tm.beam(p0, p1, .07, .09, tint=.9, tag='eave brackets')
    chx, chy = X1 + .3, .9
    ctop = 8.45
    for side in ('-y', '+x', '+y', '-x'):
        fch, Lc = rect_face(chx - .32, chx + .32, chy - .42, chy + .42, side)
        bricks(A.mb(BK), fch, 0, Lc, 0.0, ctop, (), rng=rng, course=.22, length=.42, tag='chimney')
    A.mb(BK).box((chx, chy, ctop / 2), (.62, .82, ctop), tint=.6, tag='chimney')
    A.mb(BK).box((chx, chy, ctop + .08), (.84, 1.04, .16), ch=.03, tint=.85, tag='chimney')
    A.mb(BK).box((chx, chy, 1.2), (.78, .98, .12), ch=.02, tint=.85, tag='chimney')
    for k in range(2):
        A.mb(C).cyl((chx, chy - .18 + .36 * k, ctop + .32), .1, .36, n=8, r2=.085, tint=stone_tint(rng, 1.0),
                    tag='chimney pots')
    # ---- garden: picket fence stubs by the steps, potted flowers
    for sx, x in ((-1, px0 - .05), (1, px1 + .05)):
        picket_fence(A, C, (x + sx * .1, py1 - .1), (x + sx * 1.2, py1 - .1), h=.75)
    potted_plant(A, T, G, (px0 - .4, py1 + .4, 0), r=.2, h=.3, kind='bush', rng=rng, pot_tint=.7)
    potted_plant(A, T, G, (px1 + .4, py1 + .4, 0), r=.2, h=.3, kind='tall', rng=rng, pot_tint=.7)

    return A.finish(ao_distance=1.2, ao_strength=.6, ground=0.0)


def rocking_chair(A, wood, c, rot=0., tint=.9, tag='rocking chair'):
    c = V(c)
    R = Matrix.Rotation(rot, 3, 'Z')
    wm = A.mb(wood)
    for sx in (-1, 1):
        pts = [c + R @ V((sx * .24, -.35 + .7 * t, .06 * (2 * t - 1) ** 2 * 2)) for t in (0, .25, .5, .75, 1)]
        wm.loft(pts, [(-.02, 0), (.02, 0), (.02, .045), (-.02, .045)], tint=tint * .8, tag=tag)
        for y in (-.18, .18):
            wm.box(c + R @ V((sx * .24, y, .25)), (.045, .045, .42), rot=(0, 0, rot), tint=tint * .8, tag=tag)
        wm.box(c + R @ V((sx * .24, .18, .75)), (.045, .045, .62), rot=(0, 0, rot), tint=tint * .8, tag=tag)
        wm.box(c + R @ V((sx * .26, 0, .62)), (.05, .44, .04), rot=(0, 0, rot), tint=tint, tag=tag)
    wm.box(c + R @ V((0, 0, .46)), (.5, .42, .05), rot=(0, 0, rot), tint=tint, tag=tag)
    for k in range(4):
        wm.box(c + R @ V((-.18 + k * .12, .19, .78)), (.06, .03, .5), rot=(0, 0, rot), tint=tint, tag=tag)
    wm.box(c + R @ V((0, .19, 1.05)), (.54, .05, .07), rot=(0, 0, rot), tint=tint, tag=tag)


@builder('takamori-house-b')
def build_takamori_house_b():
    A = Asset('takamori-house-b', 'Takamori house B')
    rng = random.Random(131)
    C, T, W, BK, G, FL = M_clap(), M_trim(), M_wood(), M_brick(), M_leaf(), M_flowers('#e86a8a')
    RG = M_troof('#2f8a47', 'Roof green')
    WG = window_glow()
    cm, tm, wm = A.mb(C), A.mb(T), A.mb(W)

    X0, X1, Y0, Y1 = -2.25, 2.25, -1.55, 2.45
    ZF, ZT = .45, 2.9
    L = X1 - X0
    plinth(A, C, X0 - .08, X1 + .08, Y0 - .08, Y1 + .08, z_top=ZF - .05, rng=rng, depth=.22, wmin=.55, wmax=1.0)

    holes = {'-y': [(.45, 1.45, 1.05, 2.3), (1.8, 2.7, ZF + .02, 2.45), (3.05, 4.05, 1.05, 2.3)],
             '+x': [(1.4, 2.4, 1.05, 2.3)], '+y': [(.8, 1.7, ZF + .02, 2.35), (2.7, 3.7, 1.05, 2.3)],
             '-x': [(.9, 1.8, 1.05, 2.3), (2.5, 3.4, 1.05, 2.3)]}
    faces = {}
    for side in ('-y', '+x', '+y', '-x'):
        f, Lf = rect_face(X0, X1, Y0, Y1, side)
        faces[side] = (f, Lf)
        clapboard(cm, f, 0, Lf, ZF, ZT - .1, holes[side], board=.21, lap=.035, rng=rng)
        corner_boards(A, f, Lf, ZF - .05, ZT, T)
        f.box(tm, Lf / 2, ZT - .06, .05, Lf + .12, .18, .1, ch=.02, tint=.95, tag='frieze')
        f.box(tm, Lf / 2, ZF - .02, .05, Lf + .1, .12, .08, tint=.85, tag='water table')
        for h in holes[side]:
            if h[2] < ZF + .1:
                panel_door(A, f, h, T if side == '-y' else W, cm, leaf_tint=1.0 if side == '-y' else .7, frame_mat=T,
                           frame_tint=1.0, knob_mat=T, glass_mat=WG if side == '-y' else None, panels=2)
            else:
                west_window(A, f, h, C, T, WG, cols=2, rows=2, cornice=True, shutters=RG if side == '-y' else None)
                if side == '-y':
                    flower_box(A, f, (h[0] + h[1]) / 2, h[2] - .32, h[1] - h[0] + .1, T, G, FL, rng, box_tint=.85,
                               flower_mat2=C)

    # ---- gable-front green tin roof (ridge along Y)
    EO, VO = .45, .45
    thick = ROOF_STYLES['seam']['thick']
    pitch = .92
    D = L / 2 + EO
    rtmp = Roof(0, pitch, D, sag=.1)
    eave_z = ZT + thick + .02 - rtmp.g(EO)
    ya, yb = Y0 - VO, Y1 + VO
    roof = Roof(eave_z, pitch, D, sag=.1)
    left = Slope(roof, [(X0 - EO, yb), (X0 - EO, ya), (0, ya), (0, yb)], (X0 - EO, yb), (X0 - EO, ya),
                 ['eave', 'verge', 'ridge', 'verge'])
    right = Slope(roof, [(X1 + EO, ya), (X1 + EO, yb), (0, yb), (0, ya)], (X1 + EO, ya), (X1 + EO, yb),
                  ['eave', 'verge', 'ridge', 'verge'])
    st = dict(ROOF_STYLES['seam'], pitch=.42, course=1.4, thick=thick)
    for i, s in enumerate((left, right)):
        tile_slope(A, s, RG, st, under_mat=C, fascia_mat=T, seed=140 + i)
    zr = left.z(V((0, 0)))
    path = [V((0, lerp(ya - .03, yb + .03, i / 6), zr)) for i in range(7)]
    ridge(A, RG, path, w=.22, layers=1, lh=.05, cap_r=.08, tint=.8, tag='ridge', n_cap=4)
    for ye, sy in ((ya, -1), (yb, 1)):
        bargeboard(A, T, left, (X0 - EO, ye), (0, ye), h=.24, t=.08, tint=1.0, out=V((0, sy)))
        bargeboard(A, T, right, (X1 + EO, ye), (0, ye), h=.24, t=.08, tint=1.0, out=V((0, sy)))
    for side in ('-y', '+y'):
        f, Lf = faces[side]
        top = under_fn([left, right], f, thick, u0=0, u1=Lf)
        clapboard(cm, f, 0, Lf, ZT, ZT + .01, [],
                  board=.21, lap=.035, rng=rng, top=top, tag='gable clapboard')
        f.box(tm, Lf / 2, ZT + .02, .06, Lf + .1, .1, .1, tint=.9, tag='frieze')
    # round attic window and a gingerbread bracket at the apex
    ff, Lf = faces['-y']
    oc = ff.p(Lf / 2, 4.1, .05)
    A.mb(WG).cyl(oc, .36, .02, n=14, rot=(math.pi / 2, 0, ff.rot), tag='oculus')
    tm.torus(oc + ff.n * .04, .4, .07, maj=14, mn=5, rot=(math.pi / 2, 0, ff.rot), tag='oculus')
    ff.box(cm, Lf / 2, 4.1, .05, .05, .72, .03, tint=1.0, tag='oculus')
    ff.box(cm, Lf / 2, 4.1, .05, .72, .05, .03, tint=1.0, tag='oculus')
    apex_z = zr - .2
    gb = [(-.55, 0), (0, .42), (.55, 0), (.4, 0), (0, .28), (-.4, 0)]
    tm.extrude([(x, y) for x, y in [(-.55, 0), (.55, 0), (0, .42)]], .05, V((0, ya + .08, apex_z - .38)), bevel=.008,
               tag='gable bracket')
    cm.extrude([(x * .6, y * .6) for x, y in [(-.55, 0), (.55, 0), (0, .42)]], .06, V((0, ya + .07, apex_z - .34)),
               tag='gable bracket')
    tm.rod(V((0, ya + .08, apex_z - .38)), V((0, ya + .08, apex_z - .75)), .04, n=6, tag='gable bracket')
    tm.sphere(V((0, ya + .08, apex_z - .78)), .06, seg=8, rings=5, tag='gable bracket')

    # ---- front porch with a green shed roof, turned posts, railing, rocking chair
    PY = Y0 - 1.35
    wm.box((0, (Y0 + PY) / 2, ZF - .05), (L + .3, Y0 - PY, .1), ch=.02, tint=.85, tag='porch')
    for i in range(8):
        wm.box((0, PY + .1 + i * .16, ZF + .005), (L + .26, .145, .01), tint=.8 + .15 * rng.random(), tag='porch')
    cm.box((0, (Y0 + PY) / 2, (ZF - .8) / 2 - .05), (L + .2, Y0 - PY - .1, ZF + .7), tint=stone_tint(rng, .8), tag='porch')
    fl = Face((X0 - .15, PY, 0), (0, -1, 0))
    for k in range(int((L + .3) / .3)):
        fl.box(tm, .15 + k * .3, (ZF - .1) / 2, .02, .05, ZF - .12, .02, tint=.9, tag='porch lattice')
    for k in range(2):
        cm.box((0, PY - .17 - k * .3, ZF - .15 - k * .15), (1.3, .32, .14), ch=.02, tint=stone_tint(rng, 1.15),
               tag='porch steps')
    pz = 2.45
    posts_x = [X0 - .05, -.75, .75, X1 + .05]
    for x in posts_x:
        column(A, C, (x, PY + .12, ZF), pz - ZF - .02, r=.075, tint=1.0)
        for s in (-1, 1):
            if (x == posts_x[0] and s < 0) or (x == posts_x[-1] and s > 0):
                continue
            tm.beam((x + s * .06, PY + .12, pz - .35), (x + s * .38, PY + .12, pz - .05), .05, .05, tag='porch brackets')
    tm.box((0, PY + .12, pz + .04), (L + .4, .14, .16), ch=.02, tag='porch beam')
    for a, b in ((posts_x[0], posts_x[1]), (posts_x[2], posts_x[3])):
        baluster_rail(A, (a + .08, PY + .12), (b - .08, PY + .12), ZF, .75, C, T, spacing=.18, tag='porch rail')
    pr = Roof(0, .32, Y0 - PY + .3, sag=.05)
    pr.eave_z = pz + .12 + .1 - pr.g(.3)
    ps = Slope(pr, [(X0 - .3, PY - .3), (X1 + .3, PY - .3), (X1 + .3, Y0), (X0 - .3, Y0)], (X0 - .3, PY - .3),
               (X1 + .3, PY - .3), ['eave', 'verge', 'wall', 'verge'])
    tile_slope(A, ps, RG, dict(ROOF_STYLES['seam'], pitch=.42, course=1.4, thick=.1), under_mat=C, fascia_mat=T,
               seed=150)
    tm.box((0, Y0 - .04, ps.z(V((0, Y0))) + .03), (L + .6, .08, .1), tag='porch flashing')
    rocking_chair(A, W, (-1.45, Y0 - .6, ZF), rot=.35, tint=.95)
    A.mb(C).box((-1.0, Y0 - .5, ZF + .2), (.36, .36, .4), ch=.03, tint=.95, tag='side table')
    A.mb(T).lathe([(0, 0), (.05, 0), (.06, .1), (.04, .14), (0, .14)], (-1.0, Y0 - .5, ZF + .4), n=8, tint=.9, tag='side table')
    # ---- brick chimney on the east slope, flower bed along the porch, lamp by the door
    chx, chy = 1.0, 1.4
    zb_ = right.z(V((chx, chy))) - .3
    ctop = 6.0
    for side in ('-y', '+x', '+y', '-x'):
        fch, Lc = rect_face(chx - .3, chx + .3, chy - .3, chy + .3, side)
        bricks(A.mb(BK), fch, 0, Lc, zb_, ctop, (), rng=rng, course=.2, length=.4, tag='chimney')
    A.mb(BK).box((chx, chy, (zb_ + ctop) / 2), (.58, .58, ctop - zb_), tint=.6, tag='chimney')
    A.mb(BK).box((chx, chy, ctop + .06), (.76, .76, .12), ch=.02, tint=.85, tag='chimney')
    A.mb(C).cyl((chx, chy, ctop + .3), .1, .36, n=8, r2=.085, tint=stone_tint(rng, 1.0), tag='chimney')
    wm.box((0, PY - .45, .1), (L + .3, .7, .2), ch=.02, tint=.2, tag='flower bed')
    for sx in (-1, 1):
        for x in (sx * 2.05, sx * 1.35):
            leafy(A.mb(G), (x, PY - .45, .28), (.32, .26, .2), rng, seg=7, rings=4, jitter=.2, tint=.62, tag='flower bed')
            for k in range(6):
                a = TAU * k / 6 + rng.random() * .5
                A.mb(FL if k % 3 else C).sphere((x + math.cos(a) * .2, PY - .45 + math.sin(a) * .15, .43 + .04 * rng.random()),
                                                .055, seg=6, rings=3, tag='flower bed')
    lc = ff.p(2.95, 1.8, .22)
    tm.beam(ff.p(2.95, 1.95, 0), lc + V((0, 0, .15)), .03, .03, tag='lamp')
    A.mb(WG).box(lc, (.14, .14, .2), ch=.01, tag='lamp')
    tm.box(lc + V((0, 0, .13)), (.2, .2, .07), taper=(.3, .3), tag='lamp')
    tm.box(lc + V((0, 0, -.12)), (.16, .16, .04), tag='lamp')

    return A.finish(ao_distance=1.2, ao_strength=.6, ground=0.0)


# ---------------------------------------------------------------- station


def station_bench(A, wood, c, w=1.8, rot=0., tag='benches'):
    c = V(c)
    R = Matrix.Rotation(rot, 3, 'Z')
    wm = A.mb(wood)
    for k in range(3):
        wm.box(c + R @ V((0, -.12 + k * .13, .44)), (w, .11, .04), rot=(0, 0, rot), tint=.95, tag=tag)
    for k in range(2):
        wm.box(c + R @ V((0, .24, .62 + k * .16)), (w, .04, .11), rot=(0, 0, rot), tint=.95, tag=tag)
    for sx in (-1, 1):
        wm.box(c + R @ V((sx * (w / 2 - .12), 0, .22)), (.06, .4, .44), rot=(0, 0, rot), tint=dark(1.1), tag=tag)
        wm.box(c + R @ V((sx * (w / 2 - .12), .25, .62)), (.05, .05, .5), rot=(0, 0, rot), tint=dark(1.1), tag=tag)
        wm.box(c + R @ V((sx * (w / 2 - .12), .02, .62)), (.05, .44, .05), rot=(0, 0, rot), tint=dark(1.1), tag=tag)


@builder('station')
def build_station():
    A = Asset('station', 'Station')
    rng = random.Random(141)
    C, W, R, CT, BR, G, RED = M_clap(), M_wood(), M_kroof(), M_troof('#2f7f8f', 'Canopy tin'), M_brass(), M_leaf(), M_red()
    WG = window_glow()
    cm, wm = A.mb(C), A.mb(W)

    X0, X1, Y0, Y1 = -5.9, 5.9, -1.3, 2.5
    ZF, ZT = .25, 3.3
    L = X1 - X0
    plinth(A, C, X0 - .08, X1 + .08, Y0 - .08, Y1 + .08, z_top=ZF - .03, rng=rng, depth=.22, wmin=.6, wmax=1.1)

    holes = {'-y': [(1.0, 2.2, 1.1, 2.6), (3.0, 4.2, 1.1, 2.6), (5.15, 6.65, ZF, 2.7), (7.6, 8.9, 1.25, 2.1),
                    (9.7, 10.9, 1.1, 2.6)],
             '+y': [(1.2, 2.4, 1.1, 2.6), (4.9, 6.9, ZF, 2.8), (9.4, 10.6, 1.1, 2.6)],
             '+x': [(1.4, 2.4, 1.1, 2.6)], '-x': [(1.4, 2.4, 1.1, 2.6)]}
    posts = {'-y': [0, 2.6, 4.7, 7.1, 9.3, L], '+y': [0, 2.8, 4.6, 7.2, 9.0, L], '+x': [0, 1.9, 3.8],
             '-x': [0, 1.9, 3.8]}
    faces = {}
    for side in ('-y', '+x', '+y', '-x'):
        f, Lf = rect_face(X0, X1, Y0, Y1, side)
        faces[side] = (f, Lf)
        boards_v(wm, f, 0, Lf, ZF, 1.05, w=.2, holes=holes[side], rng=rng, base=.55, var=.2, groove=.012, tag='wainscot')
        f.box(wm, Lf / 2, 1.08, .05, Lf, .08, .08, tint=dark(), tag='chair rail')
        clapboard(cm, f, 0, Lf, 1.12, ZT - .15, holes[side], board=.2, lap=.03, rng=rng)
        for u in posts[side]:
            f.box(wm, u, (ZF + ZT) / 2, .04, .16, ZT - ZF, .1, ch=.015, tint=dark(), tag='posts')
        f.box(wm, Lf / 2, ZT - .08, .05, Lf + .1, .18, .12, ch=.02, tint=dark(.9), tag='beams')
        f.box(wm, Lf / 2, ZF + .05, .05, Lf + .06, .1, .1, tint=dark(1.1), tag='beams')
        for h in holes[side]:
            if h[2] < ZF + .1:
                continue
            sash(A, f, h, W, WG, cm, cols=2 if h[1] - h[0] < 1.3 else 3, rows=3, frame_tint=dark(1.2), casing=W,
                 casing_tint=dark(1.1), sill_mat=W, sill_tint=dark(1.2), depth=.1)
    ff, Lf = faces['-y']
    # ticket window with a counter ledge and a little arched sign
    th = holes['-y'][3]
    ff.box(wm, (th[0] + th[1]) / 2, th[2] - .05, .15, th[1] - th[0] + .3, .06, .34, ch=.012, tint=.85, tag='ticket counter')
    ff.box(cm, (th[0] + th[1]) / 2, th[3] + .28, .06, .8, .24, .03, tint=1.0, tag='ticket counter')
    # double doors both sides (waiting room)
    for side, i in (('-y', 2), ('+y', 1)):
        f, Lf_ = faces[side]
        h = holes[side][i]
        mid = (h[0] + h[1]) / 2
        for s in (-1, 1):
            panel_door(A, f, (mid + (s - 1) * (h[1] - h[0]) / 4 + (.01 if s > 0 else 0), mid + (s + 1) * (h[1] - h[0]) / 4 - (.01 if s < 0 else 0),
                              h[2], h[3]), W, cm, leaf_tint=.62, frame_mat=W, glass_mat=WG, panels=1, knob_mat=BR)
        f.box(wm, mid, h[3] + .35, .06, h[1] - h[0] + .1, .45, .06, tint=dark(), tag='transom')
        A.mb(WG).box(f.p(mid, h[3] + .35, .1), (h[1] - h[0] - .15, .02, .33), rot=(0, 0, f.rot), tag='transom')

    # ---- irimoya kawara roof over the station house
    EO = .6
    thick = ROOF_STYLES['kawara']['thick']
    pitch = .7
    yf, yb = Y0 - EO, Y1 + EO
    Xr = L / 2 + EO
    rtmp = Roof(0, pitch, (yb - yf) / 2, sag=.22)
    eave_z = ZT + thick + .02 - rtmp.g(EO)
    rf = irimoya(A, R, Xr, yf, yb, eave_z, pitch, 1.35, sag=.22,
                 style=dict(ROOF_STYLES['kawara'], pitch=.52, course=.48, line_sides=3, cell_mult=2, line_r=.09),
                 under_mat=W, fascia_mat=W, seed=150, wood=W, ridge_layers=2, ridge_w=.4, oni_size=.62)
    for key in ('front', 'back', 'right', 'left'):
        rafters(A, W, rf[key], EO + .03, spacing=.5, w=.08, h=.1, tint=dark(), thick=thick, margin=.5)
    for sx in (-1, 1):
        xg = sx * (Xr - 1.35 - .1)
        fg = Face((xg, yf if sx > 0 else yb, 0), (sx, 0, 0))
        Lg = yb - yf
        top = under_fn([rf['front'], rf['back']], fg, thick, u0=0, u1=Lg)
        zlo = rf['zc'] - .05
        sp = span_under(top, Lg, zlo + .05)
        if sp:
            panel(cm, fg, sp[0], sp[1], zlo, zlo + .01, [], top=top, tint=.95, tag='gable')
            n_ = int((sp[1] - sp[0]) / .5)
            for k in range(1, n_):
                u = sp[0] + (sp[1] - sp[0]) * k / n_
                if top(u) - zlo > .15:
                    fg.box(wm, u, (zlo + top(u)) / 2, .03, .06, top(u) - zlo, .04, tint=dark(), tag='gable timber')

    # ---- platform-side canopy (tin lean-to) on bracketed posts
    CY = -3.0
    cz_w = ZT - .05
    cr = Roof(0, .22, Y0 - CY + .25, sag=.0)
    cr.eave_z = cz_w - .22 * (Y0 - CY + .25) + .02
    cs = Slope(cr, [(X0 - .2, CY - .25), (X1 + .2, CY - .25), (X1 + .2, Y0 - EO + .05), (X0 - .2, Y0 - EO + .05)],
               (X0 - .2, CY - .25), (X1 + .2, CY - .25), ['eave', 'verge', 'wall', 'verge'])
    tile_slope(A, cs, CT, dict(ROOF_STYLES['seam'], pitch=.5, course=2.0, thick=.1), under_mat=W, fascia_mat=W, seed=160)
    zbeam = cr.eave_z - .2
    wm.box((0, CY + .05, zbeam), (L + .4, .16, .2), ch=.02, tint=dark(), tag='canopy beam')
    for i in range(7):
        x = X0 + .1 + i * (L - .2) / 6
        wm.box((x, CY + .05, (ZF + zbeam) / 2 - .1), (.16, .16, zbeam - ZF - .2), ch=.02, tint=dark(1.1), tag='canopy posts')
        footing(A.mb(C), x, CY + .05, .1, .3, rng, tint=stone_tint(rng, 1.1))
        for s in (-1, 1):
            wm.beam((x + s * .08, CY + .05, zbeam - .55), (x + s * .5, CY + .05, zbeam - .1), .07, .08, tint=dark(), tag='canopy brackets')
        wm.beam((x, CY + .1, zbeam - .5), (x, Y0 - .05, zbeam + .12), .08, .09, tint=dark(), tag='canopy brackets')
        # lamp on every other post
        if i % 2 == 1:
            lc = V((x, CY - .18, zbeam - .45))
            A.mb(BR).beam(V((x, CY - .03, zbeam - .3)), lc + V((0, 0, .16)), .03, .03, tag='lamps')
            A.mb(WG).box(lc, (.16, .16, .22), ch=.01, tag='lamps')
            A.mb(BR).box(lc + V((0, 0, .14)), (.24, .24, .08), taper=(.3, .3), tag='lamps')
            A.mb(BR).box(lc + V((0, 0, -.13)), (.18, .18, .04), tag='lamps')

    # ---- station name board (blank plank for the runtime's text), hanging clock, benches
    nbx = -3.6
    nb = V((nbx, CY - .1, 1.9))
    for sx in (-1, 1):
        wm.box((nbx + sx * .95, CY - .1, .95), (.1, .1, 1.9), ch=.015, tint=dark(), tag='name board')
    wm.box(nb, (2.2, .1, .72), ch=.02, tint=dark(), tag='name board')
    cm.box(nb - V((0, .055, 0)), (2.04, .02, .58), tint=1.02, tag='name board')
    wm.box(nb + V((0, 0, .44)), (2.3, .16, .08), ch=.02, tint=dark(.9), tag='name board')
    A.marker('NameBoard', nb - V((0, .07, 0)))
    ccz = zbeam - .55
    for sy in (-1, 1):
        cc = V((1.2, CY + .05 + sy * .09, ccz))
        cm.cyl(cc, .32, .04, n=18, rot=(math.pi / 2, 0, 0), tint=1.05, tag='clock')
        A.mb(BR).torus(cc + V((0, sy * .02, 0)), .33, .04, maj=18, mn=4, rot=(math.pi / 2, 0, 0), tag='clock')
        for k in range(12):
            a = TAU * k / 12
            wm.box(cc + V((math.cos(a) * .25, sy * .025, math.sin(a) * .25)), (.03, .01, .06 if k % 3 == 0 else .035),
                   rot=(0, -(a - math.pi / 2), 0), tint=.15, tag='clock')
        wm.beam(cc + V((0, sy * .03, 0)), cc + V((.12, sy * .03, .12)), .03, .01, up=V((0, sy, 0)), tint=.1, tag='clock')
        wm.beam(cc + V((0, sy * .035, 0)), cc + V((-.2, sy * .035, .05)), .022, .01, up=V((0, sy, 0)), tint=.1, tag='clock')
    A.mb(BR).cyl((1.2, CY + .05, ccz + .45), .03, .5, n=6, tag='clock')
    A.mb(BR).box((1.2, CY + .05, ccz + .36), (.14, .26, .08), tag='clock')
    station_bench(A, W, (-.9, Y0 - .45, 0), w=1.9, rot=math.pi)
    station_bench(A, W, (3.3, Y0 - .45, 0), w=1.9, rot=math.pi)
    # red fire buckets on a rack, luggage, potted plants
    fx = 5.1
    wm.box((fx, Y0 - .25, .8), (.9, .22, .05), tint=dark(1.1), tag='buckets')
    for k in range(3):
        A.mb(RED).lathe([(0, 0), (.1, 0), (.13, .22), (0, .2)], (fx - .3 + k * .3, Y0 - .25, .83), n=8, tag='buckets')
    for sx in (-1, 1):
        wm.box((fx + sx * .4, Y0 - .25, .4), (.05, .2, .8), tint=dark(1.1), tag='buckets')
    wm.box((-2.1, Y0 - .5, .22), (.7, .45, .44), ch=.04, tint=.55, tag='luggage')
    A.mb(BR).box((-2.1, Y0 - .5, .22), (.72, .47, .06), tag='luggage')
    wm.box((-2.05, Y0 - .5, .56), (.55, .38, .24), ch=.03, tint=.7, rot=(0, 0, .15), tag='luggage')
    for x in (-5.4, 5.6):
        potted_plant(A, R, G, (x, Y0 - .45, 0), r=.24, h=.36, kind='bush', rng=rng, pot_tint=.9)

    # ---- street-side entrance portico (+Y) with a small gable roof
    ex0, ex1 = -1.1, 1.1
    ey1 = Y1 + 1.0
    for sx in (-1, 1):
        wm.box((sx * 1.0, ey1 - .1, 1.45), (.18, .18, 2.9), ch=.02, tint=dark(), tag='portico')
        A.mb(C).box((sx * 1.0, ey1 - .1, .08), (.34, .34, .16), ch=.02, tint=stone_tint(rng, 1.1), tag='portico')
        wm.beam((sx * 1.0, ey1 - .1, 2.4), (sx * 1.0, Y1 + .05, 2.95), .1, .1, tint=dark(), tag='portico')
    wm.box((0, ey1 - .1, 2.95), (2.3, .18, .22), ch=.02, tint=dark(), tag='portico')
    # gable faces the street: ridge along Y
    Dp = (ex1 - ex0) / 2 + .3
    pr = Roof(3.0, .8, Dp, sag=.12)
    for sgn in (-1, 1):
        xa = sgn * Dp
        if sgn < 0:
            poly = [(xa, ey1 + .35), (xa, Y1 - .2), (0, Y1 - .2), (0, ey1 + .35)]
            a_, b_ = (xa, ey1 + .35), (xa, Y1 - .2)
        else:
            poly = [(xa, Y1 - .2), (xa, ey1 + .35), (0, ey1 + .35), (0, Y1 - .2)]
            a_, b_ = (xa, Y1 - .2), (xa, ey1 + .35)
        sp_ = Slope(pr, poly, a_, b_, ['eave', 'verge', 'ridge', 'verge'])
        tile_slope(A, sp_, R, dict(ROOF_STYLES['kawara'], pitch=.34, course=.32, line_r=.06, line_sides=3, thick=.12,
                                    cell_mult=2), under_mat=W, fascia_mat=W, seed=170 + sgn)
        bargeboard(A, W, sp_, (xa, ey1 + .35), (0, ey1 + .35), h=.26, t=.08, tint=dark(), out=V((0, 1)))
    zp = pr.z(V((0, 0)), Dp)
    ridge(A, R, [V((0, lerp(Y1 - .2, ey1 + .38, t / 4), zp)) for t in range(5)], w=.3, layers=1, lh=.06, cap_r=.1,
          tint=.88, n_cap=4)
    onigawara(A, R, V((0, ey1 + .4, zp - .08)), (0, 1), size=.45)
    wm.box((0, ey1 + .3, zp - .55), (.9, .06, .42), ch=.015, tint=dark(), tag='portico sign')
    cm.box((0, ey1 + .34, zp - .55), (.78, .02, .3), tint=1.0, tag='portico sign')
    A.mb(C).box((0, (Y1 + ey1) / 2 + .05, .04), (2.4, ey1 - Y1 + .2, .1), ch=.02, tint=stone_tint(rng, 1.1), tag='portico')

    return A.finish(ao_distance=1.2, ao_strength=.6, ground=0.0)


# ---------------------------------------------------------------- platform


@builder('platform')
def build_platform():
    A = Asset('platform', 'Platform')
    rng = random.Random(151)
    P, G = M_plaster(), M_leaf()
    pm = A.mb(P)
    X0, X1, Y0, Y1 = -15.0, 15.0, -2.25, 2.25
    ZT = .95
    pm.box((0, 0, (ZT - .1 - .6) / 2), (30 - .1, 4.5 - .1, ZT - .1 + .6), tint=stone_tint(rng, .6), tag='core')
    # dressed stone face on the track side and plainer masonry behind
    ff = Face((X0, Y0, 0), (0, -1, 0))
    masonry(pm, ff, 0, 30, -.6, ZT - .16, (), rng=rng, course=(.36, .44), length=(.8, 1.3), pillow=.02, gap=.03,
            tag='face')
    fb = Face((X1, Y1, 0), (0, 1, 0))
    masonry(pm, fb, 0, 30, -.6, ZT - .1, (), rng=rng, course=(.5, .8), length=(1.2, 2.0), pillow=0, gap=.03,
            tag='back face')
    for side in ('+x', '-x'):
        f, L = rect_face(X0, X1, Y0, Y1, side)
        masonry(pm, f, 0, L, -.6, ZT - .1, (), rng=rng, course=(.36, .44), length=(.6, 1.0), pillow=.02, tag='ends')
    # coping stones along the track edge, overhanging slightly
    n = 24
    for i in range(n):
        x = X0 + (i + .5) * 30 / n
        k = 1.0 + .08 * (rng.random() - .5)
        pm.box((x, Y0 + .22, ZT - .08), (30 / n - .03, .64, .16), ch=.03, tint=stone_tint(rng, 1.18 * k), tag='coping',
               front=False, rot=None)
    # top: packed gravel with a band of paving slabs behind the coping
    bm = bmesh.new()
    colmap = {}
    for i in range(20):
        xa, xb = X0 + 30 * i / 20, X0 + 30 * (i + 1) / 20
        for ya, yb in ((Y0 + .54, Y0 + 1.2), (Y0 + 1.2, Y0 + 2.4), (Y0 + 2.4, Y1)):
            vs = [bm.verts.new(p) for p in ((xa, ya, ZT), (xb, ya, ZT), (xb, yb, ZT), (xa, yb, ZT))]
            k = .9 + .1 * rng.random()
            colmap[bm.faces.new(vs)] = (.74 * k, .64 * k, .5 * k) if ya > Y0 + 1 else (STONE[0] * 1.1, STONE[1] * 1.1, STONE[2] * 1.1)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    _append_colored(pm, bm, colmap, tag='top', smooth=10)
    for i in range(int(30 / 1.0)):
        x = X0 + .5 + i * 1.0
        pm.box((x, Y0 + .87, ZT + .005), (.96, .62, .03), tint=stone_tint(rng, 1.15), tag='paving')
    for x in (-10, -3, 4, 11):
        pm.box((x, Y1 - .6, ZT + .01), (.5, .35, .02), tint=(.3, .3, .32), tag='drain')
    for i in range(10):
        x = X0 + 1 + rng.random() * 28
        leafy(A.mb(G), (x, Y1 - .15 - rng.random() * .1, ZT + .03), (.18, .12, .08), rng, seg=6, rings=3, jitter=.35,
              tint=.6 + .3 * rng.random(), tag='weeds')
    return A.finish(ao_distance=.8, ao_strength=.55, ground=None)


# ---------------------------------------------------------------- engine shed


@builder('engine-shed')
def build_engine_shed():
    A = Asset('engine-shed', 'Engine shed')
    rng = random.Random(161)
    BK, W, P, IR, WG = M_brick(), M_wood(), M_plaster(), M_iron(), window_glow()
    TIN = M_troof('#56707a', 'Tin roof')
    bm_, wm, pm, im = A.mb(BK), A.mb(W), A.mb(P), A.mb(IR)

    X0, X1, Y0, Y1 = -4.9, 4.9, -8.9, 8.9
    ZT = 5.2
    L = X1 - X0

    def coursed(f, u0, u1, z0, z1, holes=(), tag='brick'):
        clapboard(bm_, f, u0, u1, z0, z1, holes, board=.22, lap=.014, rng=rng, var=.22, tag=tag, du=3.0)

    # ---- walls: coursed brick panels between brick pilasters, stone plinth band
    plinth(A, P, X0 - .1, X1 + .1, Y0 - .1, Y1 + .1, z_top=.25, rng=rng, depth=.22, wmin=1.0, wmax=1.7)
    AW, AH = 4.4, 2.75    # arch width and spring height (apex stays under the cornice)
    holes = {'-y': [(L / 2 - AW / 2, L / 2 + AW / 2, .25, AH + AW / 2)],
             '+x': [(2.2 + 3 * i, 3.4 + 3 * i, 2.2, 4.0) for i in range(5)],
             '-x': [(2.2 + 3 * i, 3.4 + 3 * i, 2.2, 4.0) for i in range(5)] + [(14.6, 15.9, .25, 2.6)],
             '+y': [(L / 2 - .7, L / 2 + .7, 2.0, 3.8)]}
    pil = {'-y': [0, L], '+y': [0, L], '+x': [0, 1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 17.8], '-x': [0, 1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 17.8]}
    faces = {}
    for side in ('-y', '+x', '+y', '-x'):
        f, Lf = rect_face(X0, X1, Y0, Y1, side)
        faces[side] = (f, Lf)
        if side == '-y':
            bricks(bm_, f, 0, Lf, .25, ZT, [holes[side][0][:2] + (.25, ZT + 1)], rng=rng, course=.22, length=.48)
        else:
            coursed(f, 0, Lf, .25, ZT, holes[side])
        for u in pil[side]:
            f.box(bm_, u, (ZT + .25) / 2, .08, .5, ZT - .25, .16, ch=.02, tint=.85, tag='pilasters')
            f.box(pm, u, ZT - .05, .12, .6, .14, .22, ch=.02, tint=stone_tint(rng, 1.2), tag='pilaster caps')
        f.box(bm_, Lf / 2, ZT - .2, .1, Lf + .1, .22, .12, ch=.02, tint=.8, tag='cornice')
        f.box(bm_, Lf / 2, ZT - .45, .06, Lf + .06, .1, .06, tint=.7, tag='cornice')
        for h in holes[side]:
            if side == '-y':
                continue
            if h[2] < .3:
                panel_door(A, f, h, W, bm_, leaf_tint=.55, frame_mat=W, frame_tint=dark(), panels=2)
                continue
            sash(A, f, h, IR, WG, bm_, cols=3, rows=3, frame_tint=1.0, depth=.18, reveal_tint=.7, mid_rail=False)
            f.box(pm, (h[0] + h[1]) / 2, h[2] - .06, .06, h[1] - h[0] + .3, .12, .26, ch=.02, tint=stone_tint(rng, 1.15),
                  tag='sills')
            # segmental brick arch over each window
            for k in range(5):
                a = math.pi * (.15 + .7 * k / 4)
                c = f.p((h[0] + h[1]) / 2 + math.cos(a) * .78, h[3] - .2 + math.sin(a) * .5, .05)
                R_ = Matrix.Rotation(f.rot, 3, 'Z') @ Matrix.Rotation(-(a - math.pi / 2), 3, 'Y')
                bm_.append(bm_box((.16, .2, .3)), Matrix.Translation(c) @ R_.to_4x4(), tint=.7, smooth=38, tag='window arches')
    # ---- the big arched opening on -Y with brick voussoirs, doors swung open
    ff, Lf = faces['-y']
    r = AW / 2
    zs = AH
    uc = Lf / 2
    bm = bmesh.new()
    for side in (-1, 1):
        pts = [ff.p(uc + side * r, ZT + .01, 0)] + [ff.p(uc + side * r * math.cos(math.pi / 2 * i / 10), zs + r * math.sin(math.pi / 2 * i / 10), 0)
                                                     for i in range(11)]
        pts.append(ff.p(uc, ZT + .01, 0))
        bm.faces.new([bm.verts.new(p) for p in pts])
    bm.normal_update()
    for f_ in bm.faces:
        if f_.normal.dot(ff.n) < 0:
            f_.normal_flip()
    bm_.append(bm, tint=.9, smooth=0, flat=True, tag='arch')
    nv = 17
    for i in range(nv):
        a = math.pi * (i + .5) / nv
        c = ff.p(uc + (r + .22) * math.cos(a), zs + (r + .22) * math.sin(a), .06)
        R_ = Matrix.Rotation(ff.rot, 3, 'Z') @ Matrix.Rotation(-(a - math.pi / 2), 3, 'Y')
        big = i == nv // 2
        bm_.append(bm_box((.36 if big else .3, .26, .5 if big else .44), .02, 1, front=True), Matrix.Translation(c) @ R_.to_4x4(),
                   tint=.95 if i % 2 else .78, smooth=38, tag='arch')
    pm.append(bm_box((.4, .3, .5), .03, 1, front=True), xform(ff.p(uc, zs + r + .25, .1), (0, 0, ff.rot)),
              stone_tint(rng, 1.25), smooth=38, tag='arch')
    for sgn in (-1, 1):
        ff.box(pm, uc + sgn * (r + .25), zs - .1, .1, .6, .24, .3, ch=.03, tint=stone_tint(rng, 1.2), tag='arch')
    # doors: two leaves hinged at the jambs, swung open against the wall
    for sgn in (-1, 1):
        hinge = ff.p(uc + sgn * r, 0, 0)
        dirv = (ff.u * sgn * math.cos(.35) + ff.n * math.sin(.35)).normalized()   # leaf swung out against the wall
        wlen = r * .98
        nrm = V((dirv.y, -dirv.x, 0))
        if nrm.dot(ff.n) < 0:
            nrm = -nrm
        o = hinge if (Z.cross(nrm)).dot(dirv) > 0 else hinge + dirv * wlen
        fd = Face(o, nrm)
        boards_v(wm, fd, 0, wlen, .3, AH + .6, w=.22, rng=rng, base=.6, var=.2, tag='shed doors')
        fdb = Face(fd.p(wlen, 0, -.06), -nrm)
        boards_v(wm, fdb, 0, wlen, .3, AH + .6, w=.3, rng=rng, base=.5, var=.1, groove=0, tag='shed doors')
        for z in (.8, AH - .1):
            fd.box(wm, wlen / 2, z, .03, wlen, .18, .05, tint=dark(), tag='shed doors')
        wm.beam(fd.p(.15, .9, .04), fd.p(wlen - .15, AH - .2, .04), .14, .05, up=nrm, tint=dark(), tag='shed doors')
        for z in (.8, AH - .1):
            fd.box(im, .35, z, .06, .6, .08, .02, tag='hinges')
    # interior seen through the arch: floor, rails on sleepers, back wall, side walls, workbench, tools
    panel(bm_, Face((X1 - .25, Y1 - .25, 0), (-1, 0, 0)), 0, 17.5, .25, ZT, [], tint=.45, tag='interior')
    panel(bm_, Face((X0 + .25, Y0 + .25, 0), (1, 0, 0)), 0, 17.5, .25, ZT, [], tint=.45, tag='interior')
    panel(bm_, Face((X0 + .25, Y1 - .25, 0), (0, -1, 0)), 0, L - .5, .25, ZT, [], tint=.4, tag='interior')
    A.mb(P).poly([(X0 + .25, Y0 + .25, .26), (X1 - .25, Y0 + .25, .26), (X1 - .25, Y1 - .25, .26), (X0 + .25, Y1 - .25, .26)],
                 tint=(.3, .28, .26), normal=Z, tag='interior')
    for i in range(24):
        y = Y0 - .6 + i * .75
        wm.box((0, y, .3), (2.2, .24, .1), tint=.45 + .1 * rng.random(), tag='sleepers')
    for sx in (-1, 1):
        im.box((sx * .72, (Y0 - .6 + Y1) / 2 - .2, .41), (.08, 18.6, .12), tag='rails')
    wm.box((X1 - .8, 4.0, .9), (.8, 2.6, .08), ch=.01, tint=.8, tag='workbench')
    for sy in (-1, 1):
        wm.box((X1 - .8, 4.0 + sy * 1.2, .45), (.7, .08, .9), tint=dark(1.2), tag='workbench')
    for k in range(6):
        im.box((X1 - .3, 3.0 + k * .35, 1.6), (.04, .05, .7 - .05 * (k % 3)), tag='tools')
    # ---- tin roof with skylights, ridge vent
    EO, VO = .35, .35
    thick = ROOF_STYLES['seam']['thick']
    pitch = .36
    D = L / 2 + EO
    rtmp = Roof(0, pitch, D, sag=.05)
    eave_z = ZT + thick + .02 - rtmp.g(EO)
    roof = Roof(eave_z, pitch, D, sag=.05)
    ya, yb = Y0 - VO, Y1 + VO
    left = Slope(roof, [(X0 - EO, yb), (X0 - EO, ya), (0, ya), (0, yb)], (X0 - EO, yb), (X0 - EO, ya),
                 ['eave', 'verge', 'ridge', 'verge'])
    right = Slope(roof, [(X1 + EO, ya), (X1 + EO, yb), (0, yb), (0, ya)], (X1 + EO, ya), (X1 + EO, yb),
                  ['eave', 'verge', 'ridge', 'verge'])
    for i, s in enumerate((left, right)):
        tile_slope(A, s, TIN, dict(ROOF_STYLES['seam'], pitch=.78, course=4.0, thick=thick), under_mat=W, fascia_mat=W,
                   seed=170 + i)
        for k in range(4):
            yc_ = Y0 + 2.5 + k * 4.3
            xa_, xb_ = (X0 + 1.4, X0 + 3.2) if s is left else (X1 - 3.2, X1 - 1.4)
            quad = [V((xa_, yc_ - .7)), V((xb_, yc_ - .7)), V((xb_, yc_ + .7)), V((xa_, yc_ + .7))]
            A.mb(WG).poly([s.P(p, .09) for p in quad], normal=Z, tag='skylights')
            A.mb(IR).loft([s.P(p, .1) for p in quad + [quad[0]]], [(-.05, -.03), (.05, -.03), (.05, .04), (-.05, .04)],
                          tag='skylights')
    zr = left.z(V((0, 0)))
    im.box((0, 0, zr + .06), (.4, yb - ya + .1, .12), ch=.02, tag='ridge')
    wm.box((0, 0, zr + .2), (1.1, 6.0, .34), tint=.25, tag='ridge vent')
    vroof = Roof(zr + .36, .32, .75, sag=0)
    for sgn in (-1, 1):
        xa = sgn * .75
        if sgn < 0:
            poly, a_, b_ = [(xa, 3.2), (xa, -3.2), (0, -3.2), (0, 3.2)], (xa, 3.2), (xa, -3.2)
        else:
            poly, a_, b_ = [(xa, -3.2), (xa, 3.2), (0, 3.2), (0, -3.2)], (xa, -3.2), (xa, 3.2)
        tile_slope(A, Slope(vroof, poly, a_, b_, ['eave', 'verge', 'ridge', 'verge']), TIN,
                   dict(ROOF_STYLES['seam'], pitch=.5, course=3.0, thick=.08), under_mat=W, fascia_mat=W, seed=185 + sgn)
    for sy in (-1, 1):
        for sx in (-1, 1):
            for k in range(5):
                wm.box((sx * .52, sy * (.5 + k * .55), zr + .2), (.04, .3, .28), tint=.5, tag='ridge vent')
    for ye, sy in ((ya, -1), (yb, 1)):
        bargeboard(A, W, left, (X0 - EO, ye), (0, ye), h=.3, t=.08, tint=dark(), out=V((0, sy)))
        bargeboard(A, W, right, (X1 + EO, ye), (0, ye), h=.3, t=.08, tint=dark(), out=V((0, sy)))
    # gables in brick with a round vent and a sign board on the front
    for side in ('-y', '+y'):
        f, Lf_ = faces[side]
        top = under_fn([left, right], f, thick, u0=0, u1=Lf_, step=2.4)
        clapboard(bm_, f, 0, Lf_, ZT, ZT + .01, [], board=.26, lap=.014, rng=rng, var=.22, top=top, tag='gable', du=5.0)
        oc = f.p(Lf_ / 2, ZT + 1.0, .05)
        A.mb(WG).cyl(oc, .38, .02, n=14, rot=(math.pi / 2, 0, f.rot), tag='gable vent')
        bm_.torus(oc + f.n * .03, .44, .09, maj=14, mn=4, rot=(math.pi / 2, 0, f.rot), tint=.8, tag='gable vent')
        for k in range(4):
            f.box(im, Lf_ / 2 - .27 + k * .18, ZT + 1.0, .08, .03, .7, .02, tag='gable vent')
    ff.box(wm, Lf / 2, ZT + .3, .1, 3.0, .45, .07, ch=.02, tint=dark(), tag='shed sign')
    ff.box(pm, Lf / 2, ZT + .3, .145, 2.84, .33, .02, tint=1.0, tag='shed sign')

    # ---- water tank on a trestle beside the shed, with the swinging spout
    tx, ty = X0 - 1.7, Y0 + 2.6
    for sx in (-1, 1):
        for sy in (-1, 1):
            wm.box((tx + sx * .75, ty + sy * .75, 1.6), (.2, .2, 3.2), ch=.02, tint=dark(1.1), tag='tank stand')
            pm.box((tx + sx * .75, ty + sy * .75, .1), (.4, .4, .2), ch=.03, tint=stone_tint(rng, 1.1), tag='tank stand')
    for z in (1.1, 2.4):
        for (a_, b_) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            wm.beam((tx + a_[0] * .75, ty + a_[1] * .75, z), (tx + b_[0] * .75, ty + b_[1] * .75, z), .1, .12,
                    tint=dark(1.2), tag='tank stand')
    for (a_, b_) in (((-1, -1), (1, -1)), ((1, 1), (-1, 1))):
        wm.beam((tx + a_[0] * .75, ty + a_[1] * .75, .3), (tx + b_[0] * .75, ty + b_[1] * .75, 2.3), .08, .08, tint=dark(1.2),
                tag='tank stand')
    wm.box((tx, ty, 3.25), (1.9, 1.9, .12), ch=.02, tint=dark(), tag='tank stand')
    wm.lathe([(0, 3.3), (1.05, 3.3), (1.08, 3.5), (1.1, 4.6), (1.08, 4.85), (1.15, 4.9), (0, 4.9)], (tx, ty, 0), n=16,
             tint=.7, tag='tank', smooth=30)
    for z in (3.6, 4.1, 4.6):
        im.cyl((tx, ty, z), 1.13, .07, n=16, tag='tank hoops')
    im.lathe([(1.2, 4.9), (.6, 5.35), (.15, 5.5), (0, 5.52)], (tx, ty, 0), n=16, tag='tank')
    im.cyl((tx + 1.1, ty, 3.9), .12, .3, n=8, rot=(0, math.pi / 2, 0), tag='spout')
    im.rod((tx + 1.25, ty, 3.9), (tx + 2.2, ty - .6, 3.4), .1, n=8, tag='spout')
    im.cyl((tx + 2.3, ty - .66, 3.2), .12, .35, n=8, tag='spout')
    wm.rod((tx - .75, ty - .9, .2), (tx - .75, ty - .9, 3.3), .03, n=4, tint=.3, tag='tank ladder')
    for k in range(10):
        wm.box((tx - .6, ty - .92, .4 + k * .3), (.3, .04, .03), tint=.3, tag='tank ladder')
    wm.rod((tx - .45, ty - .9, .2), (tx - .45, ty - .9, 3.3), .03, n=4, tint=.3, tag='tank ladder')
    # tool rack outside the door with shovels and a pick, coal bin
    rx, ry = X1 + .45, Y0 + 1.2
    wm.box((rx, ry, 1.2), (.1, 2.0, .1), tint=dark(), tag='tool rack')
    for sy in (-1, 1):
        wm.box((rx, ry + sy * .95, .6), (.1, .1, 1.2), tint=dark(), tag='tool rack')
    for k in range(4):
        y = ry - .6 + k * .4
        wm.rod((rx + .05, y, .15), (rx + .12, y, 1.35), .025, n=5, tint=.85, tag='tools')
        im.box((rx + .03, y, .2), (.04, .22, .28), tag='tools')
    pm.box((X1 + .6, Y0 + 3.4, .35), (.9, 1.3, .7), ch=.03, tint=(.25, .24, .24), tag='coal bin')
    wm.box((X1 + .6, Y0 + 3.4, .72), (.95, 1.35, .06), tint=dark(), tag='coal bin')

    ground = ground_occluder([(-60, -60), (60, -60), (60, 60), (-60, 60)], .0)
    return A.finish(ao_distance=1.4, ao_strength=.6, ground=None, occluders=[ground])


# ---------------------------------------------------------------- shrine


def shimenawa(A, mat_, a, b, sag=.18, r=.09, n=10, shide=4, tag='shimenawa'):
    """Thick twisted straw rope hung between a and b, with zigzag paper shide."""
    a, b = V(a), V(b)
    pts = [a.lerp(b, t / n) - V((0, 0, sag * 4 * (t / n) * (1 - t / n))) for t in range(n + 1)]
    rad = [r * (.7 + .3 * math.sin(math.pi * t / n)) for t in range(n + 1)]
    mb = A.mb(mat_)
    bm = bm_loft(pts, [(math.cos(TAU * k / 6) * r, math.sin(TAU * k / 6) * r * 1.1) for k in range(6)], closed=True,
                 caps=True)
    mb.append(bm, None, (1.0, .86, .55), smooth=60, tag=tag)
    for i in range(1, n, 2):
        mb.sphere(pts[i], (r * 1.25, r * 1.25, r * 1.1), seg=6, rings=4, tint=(.95, .8, .5), tag=tag)
    d = (b - a).normalized()
    side = V((-d.y, d.x, 0))
    for k in range(shide):
        t = (k + .5) / shide
        p = a.lerp(b, t) - V((0, 0, sag * 4 * t * (1 - t) + r))
        zig = [(0, 0), (.09, -.08), (0, -.16), (.09, -.24), (0, -.32)]
        for j in range(len(zig) - 1):
            p0 = p + d * (zig[j][0] - .045) + V((0, 0, zig[j][1]))
            p1 = p + d * (zig[j + 1][0] - .045) + V((0, 0, zig[j + 1][1]))
            mb.poly([p0, p0 + d * .1, p1 + d * .1, p1], tint=1.05, normal=side, tag=tag)


def fox_statue(A, stone_mat, bib_mat, c, rot=0., rng=None, tag='fox statue'):
    """Seated stone fox guardian with a vermilion bib, on a pedestal."""
    rng = rng or random.Random(3)
    c = V(c)
    R = Matrix.Rotation(rot, 3, 'Z')
    pm = A.mb(stone_mat)
    st = stone_tint(rng, 1.12)
    pm.box(c + V((0, 0, .25)), (.62, .5, .5), rot=(0, 0, rot), ch=.04, tint=stone_tint(rng, 1.0), tag=tag)
    pm.box(c + V((0, 0, .53)), (.7, .58, .08), rot=(0, 0, rot), ch=.02, tint=stone_tint(rng, 1.1), tag=tag)
    base = c + V((0, 0, .57))
    pm.sphere(base + R @ V((0, .05, .2)), (.2, .24, .22), seg=8, rings=5, rot=(0, 0, rot), tint=st, tag=tag)
    pm.sphere(base + R @ V((0, -.04, .42)), (.14, .14, .2), seg=8, rings=5, rot=(0, 0, rot), tint=st, tag=tag)
    head = base + R @ V((0, -.08, .66))
    pm.sphere(head, (.13, .13, .12), seg=8, rings=5, rot=(0, 0, rot), tint=st, tag=tag)
    pm.append(bm_lathe([(.075, 0), (.05, .08), (0, .15)], 6), xform(head + R @ V((0, -.1, -.02)), (R @ Matrix.Rotation(math.pi / 2 + .15, 3, 'X')).to_quaternion()),
              st, smooth=50, tag=tag)
    for sx in (-1, 1):
        pm.append(bm_lathe([(.05, 0), (.03, .08), (0, .14)], 5), xform(head + R @ V((sx * .07, .01, .08)),
                                                                       (R @ Matrix.Rotation(sx * -.25, 3, 'Y')).to_quaternion()),
                  st, smooth=40, tag=tag)
        pm.box(base + R @ V((sx * .08, -.14, .1)), (.07, .09, .22), rot=(0, 0, rot), ch=.02, tint=st, tag=tag)
    tail = [base + R @ V((.12, .2, .05)), base + R @ V((.24, .22, .25)), base + R @ V((.2, .16, .5)),
            base + R @ V((.1, .1, .62))]
    pm.loft(tail, [(math.cos(TAU * k / 6) * .07, math.sin(TAU * k / 6) * .07) for k in range(6)], closed=True, caps=True,
            tint=st, tag=tag)
    A.mb(bib_mat).extrude([(-.14, 0), (.14, 0), (0, -.2)], .03, head + R @ V((0, -.03, -.13)), rot=(0, 0, rot),
                          bevel=.005, tag=tag)


@builder('shrine')
def build_shrine():
    A = Asset('shrine', 'Shrine')
    rng = random.Random(171)
    P, W, VM, CU, BR, G = M_plaster(), M_wood(), M_vermilion(), M_copper(), M_brass(), M_leaf()
    LG = lantern_glow()
    pm, wm, vm, bm_ = A.mb(P), A.mb(W), A.mb(VM), A.mb(BR)

    X0, X1, Y0, Y1 = -1.85, 1.85, -1.1, 2.1
    ZF, ZT = 1.1, 3.35
    VX, VY0 = 2.45, -1.75          # veranda half width and front edge
    L = X1 - X0

    # ---- stilts on foundation stones, tie beams, veranda deck
    posts = [(x, y) for x in (-VX + .08, X0, 0, X1, VX - .08) for y in (VY0 + .08, Y0, (Y0 + Y1) / 2, Y1)]
    for x, y in posts:
        footing(pm, x, y, .13, .34, rng)
        vm.box((x, y, (ZF - .1 + .12) / 2), (.16, .16, ZF - .22), ch=.015, tag='stilts')
    for y in (VY0 + .08, Y0, Y1):
        vm.box((0, y, .55), (2 * VX, .1, .12), tag='tie beams')
    for x in (-VX + .08, VX - .08, X0, X1):
        vm.box((x, (VY0 + Y1) / 2, .55), (.1, Y1 - VY0, .12), tag='tie beams')
    wm.box((0, (VY0 + Y1) / 2, ZF - .06), (2 * VX + .1, Y1 - VY0 + .1, .12), ch=.02, tint=.6, tag='veranda')
    for i in range(12):
        x = -VX + .2 + i * (2 * VX - .4) / 11
        wm.box((x, (VY0 + Y1) / 2, ZF + .005), ((2 * VX - .4) / 11 - .02, Y1 - VY0, .02), tint=.8 + .15 * rng.random(), tag='veranda')
    # railing (koran) with brass caps, open at the stairs
    rh = .62
    rails = [((-VX, VY0), (-.75, VY0)), ((.75, VY0), (VX, VY0)), ((-VX, VY0), (-VX, Y1)), ((VX, VY0), (VX, Y1))]
    for a, b in rails:
        a3, b3 = V((a[0], a[1], ZF + rh)), V((b[0], b[1], ZF + rh))
        vm.beam(a3, b3, .08, .07, ch=.01, tag='railing', ext=.08)
        vm.beam(a3 - V((0, 0, .3)), b3 - V((0, 0, .3)), .05, .05, tag='railing')
        n = max(1, int((V(b) - V(a)).length / .9))
        for k in range(n + 1):
            p = V(a).lerp(V(b), k / n)
            vm.box((p.x, p.y, ZF + rh / 2), (.08, .08, rh), tag='railing')
            bm_.sphere((p.x, p.y, ZF + rh + .06), .05, seg=6, rings=4, tag='railing')

    # ---- hall: vermilion frame, white panels, lattice doors at the front
    holes = {'-y': [(.25, L - .25, ZF + .05, 2.95)], '+x': [], '+y': [], '-x': []}
    for side in ('-y', '+x', '+y', '-x'):
        f, Lf = rect_face(X0, X1, Y0, Y1, side)
        panel(pm, f, 0, Lf, ZF, ZT, holes[side], tint=1.02, tag='walls')
        for u in (0, Lf / 2, Lf) if side in ('-y', '+y') else (0, Lf / 2, Lf):
            f.box(vm, u, (ZF + ZT) / 2, .04, .18, ZT - ZF, .12, ch=.02, tag='hall posts')
        for z in (ZF + .08, 2.25, ZT - .1):
            if side == '-y' and z < 3:
                continue
            f.box(vm, Lf / 2, z, .03, Lf, .14, .1, ch=.015, tag='nuki')
    ff, Lf = rect_face(X0, X1, Y0, Y1, '-y')
    h = holes['-y'][0]
    reveal(pm, ff, h, .1, tint=.3, sides='t')
    ff.quad(wm, h[0], h[2], h[1], h[3], d=-.12, tint=.12)
    # three pairs of black-lacquer lattice doors with gold hardware, the middle pair slightly open
    for k in range(3):
        ua = h[0] + k * (h[1] - h[0]) / 3
        ub = ua + (h[1] - h[0]) / 3
        uc = (ua + ub) / 2
        off = .12 if k == 1 else 0
        for s in (-1, 1):
            u0, u1 = (ua, uc) if s < 0 else (uc, ub)
            u0 += s * off
            u1 += s * off
            wm.box(ff.p((u0 + u1) / 2, (h[2] + h[3]) / 2, -.06), ((u1 - u0) - .02, .05, h[3] - h[2]), rot=(0, 0, ff.rot),
                   tint=.18, tag='lattice doors')
            for j in range(1, 4):
                ff.box(wm, u0 + (u1 - u0) * j / 4, (h[2] + h[3]) / 2, -.025, .02, h[3] - h[2] - .1, .02, tint=.4, tag='lattice doors')
            for j in range(1, 8):
                ff.box(wm, (u0 + u1) / 2, h[2] + (h[3] - h[2]) * j / 8, -.025, (u1 - u0) - .06, .02, .02, tint=.4, tag='lattice doors')
            ff.box(bm_, (u0 + u1) / 2, h[2] + .25, -.02, (u1 - u0) - .1, .04, .02, tag='door fittings')
    ff.box(vm, Lf / 2, 3.08, .05, Lf + .2, .22, .14, ch=.02, tag='nuki')

    # ---- nagare-zukuri roof: long sweeping front slope, short back slope, chigi and katsuogi
    yr = .45
    zr = 5.75
    xv = VX + .25
    fyl, byl = -3.35, 2.85
    Df, Db = yr - fyl, byl - yr
    back_roof = Roof(0, 1.0, Db, sag=.12)
    back_roof.eave_z = zr - back_roof.g(Db)
    front_roof = Roof(0, 1.0, Df, sag=.42)
    front_roof.pitch = (zr - 2.62) / Df / (1 - .42 + .42)
    front_roof.eave_z = zr - front_roof.g(Df)
    front = Slope(front_roof, [(-xv, fyl), (xv, fyl), (xv, yr), (-xv, yr)], (-xv, fyl), (xv, fyl),
                  ['eave', 'verge', 'ridge', 'verge'])
    back = Slope(back_roof, [(xv, byl), (-xv, byl), (-xv, yr), (xv, yr)], (xv, byl), (-xv, byl),
                 ['eave', 'verge', 'ridge', 'verge'])
    st = dict(ROOF_STYLES['seam'], pitch=.28, course=.5, thick=.22, lip=.03, line_r=.028)
    for i, s in enumerate((front, back)):
        tile_slope(A, s, CU, st, under_mat=W, fascia_mat=W, seed=180 + i)
        rafters(A, W, s, 1.2 if s is front else .75, spacing=.3, w=.07, h=.08, tint=dark(), thick=.22, margin=.2)
    for ye, s, sy in ((fyl, front, -1), (byl, back, 1)):
        for sx in (-1, 1):
            bargeboard(A, W, s, (sx * xv, ye), (sx * xv, yr), h=.34, t=.1, tint=dark(1.1), out=V((sx, 0)), n=10)
    rpath = [V((lerp(-xv - .05, xv + .05, t / 8), yr, zr + .05)) for t in range(9)]
    ridge(A, CU, rpath, w=.42, layers=2, lh=.08, cap_r=.14, tint=.8, n_cap=5)
    # katsuogi billets across the ridge and forked chigi at both gables
    for k in range(5):
        x = -1.6 + k * .8
        bm_.append(bm_cyl(.1, .9, 10, cap=True, ch=.03), xform((x, yr, zr + .38), (math.pi / 2, 0, 0)), 1.0, smooth=50,
                   tag='katsuogi')
        wm.cyl((x, yr - .46, zr + .38), .104, .03, n=10, rot=(math.pi / 2, 0, 0), tint=.2, tag='katsuogi')
        wm.cyl((x, yr + .46, zr + .38), .104, .03, n=10, rot=(math.pi / 2, 0, 0), tint=.2, tag='katsuogi')
    for sx in (-1, 1):
        for sy in (-1, 1):
            a = V((sx * (xv + .02), yr + sy * .15, zr - .15))
            b = a + V((0, -sy * .55, 1.0))
            wm.beam(a, b, .09, .06, up=V((1, 0, 0)), tint=dark(1.2), tag='chigi')
            bm_.box(b + V((0, 0, -.05)), (.1, .08, .06), tag='chigi')

    # ---- front stairs with vermilion rails
    ns = 6
    rise = ZF / ns
    for k in range(ns):
        y = VY0 - .08 - (ns - k - .5) * .3
        wm.box((0, y, rise * (k + 1) - .03), (1.4, .3, .06), ch=.01, tint=.85, tag='stairs')
    for sx in (-1, 1):
        wm.beam((sx * .72, VY0 - .08 - ns * .3, .05), (sx * .72, VY0, ZF), .07, .22, tint=dark(1.2), tag='stairs')
        vm.beam((sx * .75, VY0 - .08 - ns * .3 + .1, .7), (sx * .75, VY0 - .02, ZF + rh), .07, .06, ch=.01, tag='stair rails')
        vm.box((sx * .75, VY0 - .08 - ns * .3 + .1, .35), (.08, .08, .7), tag='stair rails')
        bm_.sphere((sx * .75, VY0 - .08 - ns * .3 + .1, .74), .05, seg=6, rings=4, tag='stair rails')
    # ---- offering box, bell and rope, shimenawa, lanterns
    ob = V((0, Y0 - .45, ZF))
    wm.box(ob + V((0, 0, .28)), (1.0, .5, .56), ch=.02, tint=.5, tag='offering box')
    for k in range(7):
        wm.box(ob + V((-.36 + k * .12, 0, .565)), (.06, .46, .03), rot=(.5, 0, 0), tint=.35, tag='offering box')
    bm_.box(ob + V((0, -.26, .38)), (.7, .02, .06), tag='offering box')
    bz = 2.95
    wm.box((0, Y0 - .35, 3.28), (.12, .8, .12), tint=dark(), tag='bell beam')
    bm_.rod((0, Y0 - .7, 3.22), (0, Y0 - .7, bz + .2), .012, n=4, tag='suzu')
    bm_.sphere((0, Y0 - .7, bz), (.22, .22, .2), seg=12, rings=7, tag='suzu')
    bm_.torus((0, Y0 - .7, bz), .22, .025, maj=12, mn=4, tag='suzu')
    rope = [V((0, Y0 - .72, bz - .15)), V((.03, Y0 - .75, 2.2)), V((-.02, Y0 - .8, 1.6)), V((0, Y0 - .82, ZF + .9))]
    A.mb(VM).loft(rope, [(math.cos(TAU * k / 6) * .045, math.sin(TAU * k / 6) * .045) for k in range(6)], caps=True,
                  tag='bell rope')
    pm.loft([p + V((.05, 0, 0)) for p in rope], [(math.cos(TAU * k / 5) * .03, math.sin(TAU * k / 5) * .03) for k in range(5)],
            caps=True, tint=1.05, tag='bell rope')
    shimenawa(A, P, (-X1 - .3, Y0 - .18, 3.28), (X1 + .3, Y0 - .18, 3.28), sag=.2, r=.1, n=10, shide=4)
    for sx in (-1, 1):
        chochin(A, LG, W, V((sx * (VX - .15), VY0 - .08, 2.35)), r=.18, h=.4, hang=.3)
    # ---- noticeboard (node) with Old Kiku's notes, beside the stairs
    nx, ny = -2.2, -2.75
    for sx in (-1, 1):
        wm.box((nx + sx * .52, ny, .85), (.09, .09, 1.7), ch=.01, tint=dark(1.05), tag='noticeboard')
        stone(pm, (nx + sx * .52, ny, .03), (.22, .22, .12), 0, rng, tint=stone_tint(rng, 1.05), tag='noticeboard')
    wm.box((nx, ny + .02, 1.22), (1.08, .06, .72), ch=.015, tint=.75, tag='noticeboard')
    for i, (du, dz, w_, h_) in enumerate(((-.28, .12, .3, .38), (.1, .15, .28, .32), (.32, -.08, .2, .26), (-.06, -.18, .34, .2))):
        pm.box((nx + du, ny - .015, 1.22 + dz), (w_, .01, h_), rot=(0, (i - 1.5) * .06, 0), tint=1.05, tag='notices')
    nb_roof = Roof(1.62, .55, .4, sag=.05)
    for sgn in (-1, 1):
        if sgn < 0:
            poly, a_, b_ = [(nx - .7, ny - .4), (nx + .7, ny - .4), (nx + .7, ny), (nx - .7, ny)], (nx - .7, ny - .4), (nx + .7, ny - .4)
        else:
            poly, a_, b_ = [(nx + .7, ny + .4), (nx - .7, ny + .4), (nx - .7, ny), (nx + .7, ny)], (nx + .7, ny + .4), (nx - .7, ny + .4)
        tile_slope(A, Slope(nb_roof, poly, a_, b_, ['eave', 'verge', 'ridge', 'verge']), CU,
                   dict(ROOF_STYLES['seam'], pitch=.25, course=1.0, thick=.07), under_mat=W, fascia_mat=W, seed=190 + sgn)
    A.mb(CU).box((nx, ny, 1.62 + .55 * .4 + .03), (1.46, .1, .06), tag='noticeboard')
    A.marker('Noticeboard', (nx, ny - .06, 1.22))
    # ---- guardian foxes on pedestals, sakaki branches in vases
    for sx in (-1, 1):
        fox_statue(A, P, VM, (sx * 1.2, VY0 - 1.7, 0), rot=-sx * .3, rng=rng)
    for sx in (-1, 1):
        vx_ = sx * 1.9
        bm_.lathe([(0, 0), (.08, 0), (.1, .1), (.06, .2), (.08, .28), (0, .26)], (vx_, VY0 + .05, ZF), n=8, tag='sakaki')
        leafy(A.mb(G), (vx_, VY0 + .05, ZF + .45), (.14, .12, .22), rng, seg=6, rings=4, jitter=.3, tag='sakaki')

    return A.finish(ao_distance=1.1, ao_strength=.62, ground=0.0)


# ---------------------------------------------------------------- torii


def M_black():
    return mat('Black lacquer', '#1f2530', rough=.35)


@builder('torii')
def build_torii():
    A = Asset('torii', 'Torii')
    rng = random.Random(181)
    VM, BL, P, BR = M_vermilion(), M_black(), M_plaster(), M_brass()
    vm, bl, pm = A.mb(VM), A.mb(BL), A.mb(P)
    H = 4.35
    for sx in (-1, 1):
        base = V((sx * 1.72, 0, 0))
        top = V((sx * 1.6, 0, H))
        vm.append(bm_cyl(.19, (top - base).length, 16, r2=.165, cap=True), xform((base + top) / 2,
                  (top - base).to_track_quat('Z', 'Y')), 1.0, smooth=60, tag='pillars')
        bl.cyl((sx * 1.72, 0, .28), .25, .56, n=16, r2=.235, ch=.03, tag='kamaki')
        bl.cyl((sx * 1.72, 0, .58), .22, .06, n=16, tag='kamaki')
        pm.box((sx * 1.72, 0, -.35), (.72, .72, .9), ch=.05, tint=stone_tint(rng, 1.05), tag='bases', front=False)
        bl.cyl((sx * 1.605, 0, H - .08), .19, .1, n=16, tag='daiwa')
    # nuki tie beam through the pillars, with wedges
    vm.box((0, 0, 3.4), (4.5, .16, .26), ch=.02, tag='nuki')
    for sx in (-1, 1):
        vm.box((sx * 1.64, -.1, 3.4), (.08, .06, .22), tag='nuki')
        vm.box((sx * 1.64, .1, 3.4), (.08, .06, .22), tag='nuki')
    # gakuzuka strut and the plaque
    vm.box((0, 0, 3.88), (.18, .14, .72), tag='gakuzuka')
    bl.box((0, -.1, 3.9), (.62, .06, .82), ch=.02, tag='plaque')
    A.mb(BR).box((0, -.135, 3.9), (.5, .015, .7), ch=.01, tag='plaque')
    bl.box((0, -.15, 3.9), (.42, .02, .6), ch=.005, tag='plaque')
    # shimaki (vermilion) and kasagi (black) with upswept ends
    def lintel(z0, half, lift, prof, mbx, tint=1.0, tag='kasagi'):
        path = []
        for i in range(13):
            t = i / 12
            x = lerp(-half, half, t)
            k = abs(x) / half
            path.append(V((x, 0, z0 + lift * k ** 2.6)))
        mbx.loft(path, prof, up=Z, tint=tint, tag=tag, smooth=35)
    lintel(H + .12, 2.35, .16, [(-.16, -.13), (.16, -.13), (.16, .13), (-.16, .13)], vm, tag='shimaki')
    lintel(H + .38, 2.55, .3, [(-.2, -.13), (.2, -.13), (.26, .1), (.2, .16), (-.2, .16), (-.26, .1)], bl, tag='kasagi')
    return A.finish(ao_distance=.8, ao_strength=.55, ground=0.0)


# ---------------------------------------------------------------- stone lantern


@builder('stone-lantern')
def build_stone_lantern():
    A = Asset('stone-lantern', 'Stone lantern')
    rng = random.Random(191)
    P, G = M_plaster(), M_leaf()
    LG = glow('Lantern glow', '#f4e3b5', '#ffb347', rough=.6)      # warm paper window (not the red chochin paper)
    pm = A.mb(P)

    def stt(k=1.0):
        t = stone_tint(rng, k)
        return (t[0] * 1.08, t[1] * 1.08, t[2] * 1.1)
    rot6 = (0, 0, math.pi / 6)
    pm.lathe([(0, -.8), (.46, -.8), (.46, .1), (.4, .16), (.3, .22), (0, .22)], (0, 0, 0), n=6, rot=rot6, tint=stt(),
             tag='kiso', smooth=20)
    pm.lathe([(0, .2), (.15, .2), (.13, .3), (.12, .66), (.15, .72), (.15, .76), (.12, .8), (0, .8)], (0, 0, 0), n=10,
             tint=stt(.96), tag='sao', smooth=45)
    pm.lathe([(0, .78), (.2, .78), (.38, .9), (.4, .96), (0, .96)], (0, 0, 0), n=6, rot=rot6, tint=stt(1.05), tag='chudai',
             smooth=20)
    # fire box: six posts around glowing paper windows on four faces
    zc, hh = 1.16, .36
    A.mb(LG).lathe([(0, zc - hh / 2), (.2, zc - hh / 2), (.2, zc + hh / 2), (0, zc + hh / 2)], (0, 0, 0), n=6, rot=rot6,
                   tag='fire box')
    for i in range(6):
        a = TAU * i / 6 + math.pi / 6
        pm.box((math.cos(a) * .24, math.sin(a) * .24, zc), (.1, .1, hh + .02), rot=(0, 0, a), ch=.015, tint=stt(1.0),
               tag='fire box')
    pm.box((0, 0, zc - hh / 2 - .02), (.46, .46, .05), rot=rot6, tint=stt(1.0), tag='fire box')
    # kasa: hexagonal roof with upturned corners and moss, jewel on top
    pm.lathe([(0, 1.34), (.3, 1.34), (.48, 1.4), (.5, 1.44), (.34, 1.5), (.14, 1.6), (.1, 1.64), (0, 1.64)], (0, 0, 0),
             n=6, rot=rot6, tint=stt(1.08), tag='kasa', smooth=25)
    for i in range(6):
        a = TAU * i / 6 + math.pi / 6
        o = V((math.cos(a), math.sin(a), 0))
        pm.append(bm_lathe([(.06, 0), (.04, .07), (0, .12)], 5), xform(o * .5 + V((0, 0, 1.43)),
                  (V((0, 0, 1)) + o * .8).to_track_quat('Z', 'Y')), stt(1.08), smooth=40, tag='kasa')
    for i in range(3):
        a = TAU * i / 3 + .4
        leafy(A.mb(G), (math.cos(a) * .25, math.sin(a) * .25, 1.52), (.14, .1, .04), rng, seg=6, rings=3, jitter=.3,
              tint=.55 + .2 * rng.random(), tag='moss')
    leafy(A.mb(G), (.3, -.2, .18), (.18, .14, .06), rng, seg=6, rings=3, jitter=.3, tint=.55, tag='moss')
    pm.lathe([(0, 1.62), (.08, 1.62), (.07, 1.66), (.1, 1.7), (.09, 1.76), (.04, 1.8), (0, 1.82)], (0, 0, 0), n=8,
             tint=stt(1.05), tag='hoju', smooth=50)
    return A.finish(ao_distance=.6, ao_strength=.55, ground=0.0)


# ---------------------------------------------------------------- shrine stairs


@builder('shrine-stairs')
def build_shrine_stairs():
    A = Asset('shrine-stairs', 'Shrine stairs')
    rng = random.Random(201)
    P, G = M_plaster(), M_leaf()
    pm = A.mb(P)
    N, RISE, RUN = 10, .3, .45
    Y0 = -2.25
    W2 = 1.6
    slope = RISE / RUN
    for k in range(N):
        y = Y0 + RUN * (k + .5)
        top = RISE * (k + 1)
        w = 2 * W2 - .02 * rng.random()
        pm.box((rng.uniform(-.015, .015), y, top - .35), (w, RUN - .004, .7), ch=.04,
               tint=stone_tint(rng, 1.12), tag='steps', front=True)
    # side walls: big dressed stones sheared along the incline with vertical joints; ends are exactly at y = +-2.25
    def prism(x0, x1, ya, yb, za_top, zb_top, depth, tint, tag, bevel=.03):
        bm = bmesh.new()
        vs = {}
        for i, x in enumerate((x0, x1)):
            for j, (y, zt) in enumerate(((ya, za_top), (yb, zb_top))):
                vs[(i, j, 1)] = bm.verts.new((x, y, zt))
                vs[(i, j, 0)] = bm.verts.new((x, y, zt - depth))
        F = [((0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)), ((0, 0, 1), (0, 1, 1), (1, 1, 1), (1, 0, 1)),
             ((0, 0, 0), (0, 0, 1), (1, 0, 1), (1, 0, 0)), ((0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)),
             ((0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1)), ((1, 0, 0), (1, 0, 1), (1, 1, 1), (1, 1, 0))]
        for f in F:
            bm.faces.new([vs[k] for k in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        top_edges = [e for e in bm.edges if all(v.co.z > min(za_top, zb_top) - depth * .5 and
                                                abs(v.co.z - (za_top + (zb_top - za_top) * (v.co.y - ya) / (yb - ya))) < 1e-4
                                                for v in e.verts)]
        if bevel > 0 and top_edges:
            bmesh.ops.bevel(bm, geom=top_edges, offset=bevel, offset_type='OFFSET', segments=1, profile=.5,
                            affect='EDGES', clamp_overlap=True)
        pm.append(bm, None, tint, smooth=38, tag=tag)
    n = 5
    for sx in (-1, 1):
        x = sx * (W2 + .2)
        for i in range(n):
            ya, yb = Y0 + 4.5 * i / n, Y0 + 4.5 * (i + 1) / n
            za, zb = 3.0 * i / n + .45, 3.0 * (i + 1) / n + .45
            gap = .015 if 0 < i else 0
            gap2 = .015 if i < n - 1 else 0
            prism(x - .2, x + .2, ya + gap, yb - gap2, za + gap * slope, zb - gap2 * slope, 1.6, stone_tint(rng, 1.0),
                  'side walls')
            prism(x - .26, x + .26, ya + gap, yb - gap2, za + .14 + gap * slope, zb + .14 - gap2 * slope, .15,
                  stone_tint(rng, 1.15), 'coping')
    # moss on the step edges and wall feet
    for i in range(9):
        k = rng.randrange(N)
        x = rng.choice((-1, 1)) * (W2 - .15 - .2 * rng.random())
        leafy(A.mb(G), (x, Y0 + RUN * k + .1, RISE * (k + 1) + .01), (.2, .1, .035), rng, seg=6, rings=3, jitter=.3,
              tint=.55 + .25 * rng.random(), tag='moss')
    for sx in (-1, 1):
        leafy(A.mb(G), (sx * (W2 + .45), Y0 + .3, .12), (.3, .25, .15), rng, seg=6, rings=4, jitter=.3, tint=.7, tag='moss')
    return A.finish(ao_distance=.8, ao_strength=.6, ground=None)


# ---------------------------------------------------------------- main


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only, save = None, True
    i = 0
    while i < len(args):
        if args[i] == '--only':
            only = [a.strip() for a in args[i + 1].split(',') if a.strip()]
            i += 2
        elif args[i] == '--no-save':
            save = False
            i += 1
        elif args[i] == '--out':
            arch_lib.OUT_DIR[0] = os.path.abspath(args[i + 1])
            i += 2
        else:
            only = (only or []) + [args[i]]
            i += 1
    names = [n for n in ORDER if (only is None or n in only)]
    unknown = [n for n in (only or []) if n not in ORDER]
    if unknown:
        raise SystemExit(f'unknown models: {unknown}')
    results = {}
    for n in names:
        if n not in BUILD:
            print('SKIP (not implemented yet)', n)
            continue
        results[n] = BUILD[n]()
    for n, info in results.items():
        print(f'SUMMARY {n:18s} {info["tris"]:6d} tris {info["bytes"] // 1024:5d} KB {info["materials"]} mats')
    if save and arch_lib.OUT_DIR[0] is None:
        have = [n for n in ORDER if os.path.exists(os.path.join(kit.OUT, n + '.glb'))]
        kit.save_kit('architecture', have, spacing=4.0)


main()
