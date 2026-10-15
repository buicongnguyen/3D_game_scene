"""Hand props for the dance game: the conical hat for the hat dance, the singer's mic, the crowd's light stick.

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_dance_props.py

Each prop is modelled in the frame of the right hand's grip_R bone, so the game attaches it there with no offset
(src/game/tricks/dance.js DANCE_GRIP may still fine-tune per person): in three.js +Y runs along the fingers and +X is the
palm's normal. Blender exports (x, y, z) as three.js (x, z, -y), so here +Z is "along the fingers" and +X the palm.
    non-la       a non la (palm-leaf conical hat) held by its rim: the hat's mouth faces the palm, the brim runs up
                 the fingers, a pink silk chin ribbon hangs inside. 0.4 m across, like a real one.
    mic          a hand mic: the fist closes round the handle, the head points along the thumb.
    light-stick  a crowd's light stick with a glowing star.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector, Matrix
from kit import reset, mat, OUT, bake_ao, ensure_color, glb_summary
from human_lib import MB, sweep, ellipsoid, ring, TAU, lerp, interp, catmull

V = Vector


def export(name, objs):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    ensure_color(objs)
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_vertex_color='ACTIVE', export_normals=True, export_materials='EXPORT', export_animations=False,
                              export_extras=True)
    info = glb_summary(path)
    print(f'EXPORTED {name}: {info["tris"]} tris, {info["materials"]} materials, {info["bytes"] // 1024} KB')
    return info


def non_la():
    reset()
    straw = mat('Non la', '#ecd59a', 0.7)
    rib = mat('Non la rib', '#c9a45e', 0.75)
    silk = mat('Non la ribbon', '#ff6f9a', 0.45)
    R, Hh = 0.2, 0.19
    # hat axis along -X (the apex behind the hand), its mouth facing +X (the palm); the rim's near point at the origin,
    # the hat's centre up the fingers (+Z)
    c = V((0.0, 0.0, R))

    def P(r, h, a):
        # r: 0 apex .. 1 rim; a: angle round the axis
        rr = R * r
        return c + V((-(Hh * (1 - r) - 0.004), rr * math.sin(a), -rr * math.cos(a)))
    n, rows = 32, 13
    mb = MB('nonla')
    outer = [[P(i / (rows - 1) * 0.985 + 0.015, 0, TAU * j / n) for j in range(n)] for i in range(rows)]
    # concentric ribs: the bamboo hoops under the leaves show as soft ridges every few rows
    for i, row in enumerate(outer):
        if i % 3 == 2:
            for j, p in enumerate(row):
                d = (p - c)
                row[j] = p + V((-0.003, d.y * 0.012, d.z * 0.012))
    inner = [[p + V((0.004, 0, 0)) for p in row] for row in outer]
    apex_o, apex_i = c + V((-Hh, 0, 0)), c + V((-Hh + 0.004, 0, 0))
    ids_o = [[mb.vert(p) for p in row] for row in outer]
    ids_i = [[mb.vert(p) for p in row] for row in inner]
    ao, ai = mb.vert(apex_o), mb.vert(apex_i)
    for j in range(n):
        mb.face([ids_o[0][j], ids_o[0][(j + 1) % n], ao], straw, out=V((-1, 0, 0)))
        mb.face([ids_i[0][j], ai, ids_i[0][(j + 1) % n]], straw, out=V((1, 0, 0)))
    for i in range(rows - 1):
        m_ = rib if i % 3 == 1 else straw
        for j in range(n):
            q = [ids_o[i][j], ids_o[i][(j + 1) % n], ids_o[i + 1][(j + 1) % n], ids_o[i + 1][j]]
            pc = sum((mb.V[k] for k in q), V()) / 4
            mb.face(q, m_, out=V((-0.6, (pc - c).y, (pc - c).z)))
            q = [ids_i[i][j], ids_i[i + 1][j], ids_i[i + 1][(j + 1) % n], ids_i[i][(j + 1) % n]]
            pc = sum((mb.V[k] for k in q), V()) / 4
            mb.face(q, straw, out=V((0.6, -(pc - c).y, -(pc - c).z)))
    # the rolled rim (a hoop)
    rim = [P(1.0, 0, TAU * j / n) + V((0.002, 0, 0)) for j in range(n)]
    sweep(mb, rim + rim[:2], rib, radius=0.0045, n=6, cap0=None, cap1=None)
    for j in range(n):
        q = [ids_o[-1][j], ids_o[-1][(j + 1) % n], ids_i[-1][(j + 1) % n], ids_i[-1][j]]
        mb.face(q, rib, out=(mb.V[ids_o[-1][j]] - c) * V((0, 1, 1)))
    hat = mb.build('non-la', angle=50)
    # the chin ribbon: tied inside at two points and hanging in a soft loop
    rb = MB('ribbon')
    a1, a2 = P(0.62, 0, math.radians(70)) + V((0.01, 0, 0)), P(0.62, 0, math.radians(-70)) + V((0.01, 0, 0))
    mid = c + V((0.05, 0, -R * 0.55))
    sweep(rb, catmull([a1, a1.lerp(mid, 0.6) + V((0.02, 0, 0)), mid, a2.lerp(mid, 0.6) + V((0.02, 0, 0)), a2], 4), silk,
          rfn=lambda t: (0.009, 0.002), n=6, up_fn=lambda q, T: V((1, 0, 0)), e=3, cap0='flat', cap1='flat')
    rob = rb.build('ribbon', angle=60)
    from kit import join
    ob = join([hat, rob], 'non-la')
    bake_ao([ob], rays=32, distance=0.08, strength=0.4)
    return export('non-la', [ob])


def mic():
    reset()
    body = mat('Mic body', '#2b2d36', 0.35, 0.4)
    grille = mat('Mic grille', '#d9dee6', 0.3, 0.9)
    ring_ = mat('Mic ring', '#ff6fa6', 0.35, 0.3)
    mb = MB('mic')
    # along the thumb side of the fist: three.js +Z = Blender -Y. The fist grips round the origin.
    axis = V((0, -1, 0))
    p0, p1 = V((0, 0.07, 0)), V((0, -0.07, 0))
    sweep(mb, [p0, V((0, 0.0, 0)), p1], body, rfn=lambda t: 0.0115 + 0.005 * t, n=16, cap0='round', cap1=None)
    sweep(mb, [p1, p1 + axis * 0.012], ring_, rfn=lambda t: 0.0175, n=16, cap0='flat', cap1='flat')
    ellipsoid(mb, p1 + axis * 0.04, (0.028, 0.03, 0.028), grille, 18, 12)
    ob = mb.build('mic', angle=50)
    bake_ao([ob], rays=24, distance=0.04, strength=0.3)
    return export('mic', [ob])


def light_stick():
    reset()
    handle = mat('Stick handle', '#ffffff', 0.4)
    glow = mat('Stick glow', '#ffd25e', 0.3, emit=1.6, emit_color='#ffcf4a')
    mb = MB('stick')
    # held in the fist like the mic: the stick rises along the thumb side (three.js +Z = Blender -Y)
    axis = V((0, -1, 0))
    sweep(mb, [V((0, 0.06, 0)), V((0, -0.08, 0))], handle, rfn=lambda t: 0.012, n=12, cap0='round', cap1='flat')
    tip = V((0, -0.12, 0))
    sweep(mb, [V((0, -0.08, 0)), tip], glow, rfn=lambda t: 0.014, n=12, cap0=None, cap1=None)
    # a puffy five-point star on top
    sc = tip + axis * 0.05
    n = 10
    outline = [sc + V((math.cos(math.pi / 2 + TAU * k / n) * (0.045 if k % 2 == 0 else 0.02), 0, 0)) +
               V((0, math.sin(math.pi / 2 + TAU * k / n) * (0.045 if k % 2 == 0 else 0.02), 0)) * 0 +
               axis * (math.sin(math.pi / 2 + TAU * k / n) * (0.045 if k % 2 == 0 else 0.02)) for k in range(n)]
    f_ = [p + V((0, 0, 0.012)) for p in outline]
    b_ = [p + V((0, 0, -0.012)) for p in outline]
    ids_f = [mb.vert(p) for p in f_]
    ids_b = [mb.vert(p) for p in b_]
    cf, cb = mb.vert(sc + V((0, 0, 0.02))), mb.vert(sc + V((0, 0, -0.02)))
    for k in range(n):
        mb.face([ids_f[k], ids_f[(k + 1) % n], cf], glow, out=V((0, 0, 1)))
        mb.face([ids_b[k], cb, ids_b[(k + 1) % n]], glow, out=V((0, 0, -1)))
        mb.face([ids_f[k], ids_b[k], ids_b[(k + 1) % n], ids_f[(k + 1) % n]], glow, inside=sc)
    ob = mb.build('light-stick', angle=40)
    bake_ao([ob], rays=16, distance=0.03, strength=0.2)
    return export('light-stick', [ob])


for fn in (non_la, mic, light_stick):
    fn()
