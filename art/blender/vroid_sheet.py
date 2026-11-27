"""Contact sheet: GLB characters side by side at true scale, front and three-quarter, standing and mid-walk.

    blender -b --factory-startup --python art/blender/vroid_sheet.py -- <out.png> <a.glb> <b.glb> ...

Each figure is rendered on its own (EEVEE, orthographic, the same metres per pixel for all), then the tiles are put
in rows: front Idle, 3/4 Idle, front Walk (mid-stride), 3/4 Walk. A label under each column: file, height.
"""
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, FILES = os.path.abspath(argv[0]), [os.path.abspath(f) for f in argv[1:]]
TW, TH, MH = 300, 620, 2.05          # tile size in px; metres shown top to bottom
POSES = [('Idle', 0.3, 0), ('Idle', 0.3, 35), ('Walk', 0.25, 0), ('Walk', 0.25, 35)]
tmp = os.path.join(os.path.dirname(OUT), '_tiles')
os.makedirs(tmp, exist_ok=True)


def scene_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = TW, TH
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.66, 0.72, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(50), 0, math.radians(-30)); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.type = 'ORTHO'; cam.data.ortho_scale = MH
    sc.collection.objects.link(cam); sc.camera = cam
    bpy.ops.mesh.primitive_plane_add(size=6); fl = bpy.context.object
    m = bpy.data.materials.new('floor'); m.use_nodes = True
    next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.42, 0.5, 0.36, 1)
    fl.data.materials.append(m)
    return sc, cam


def pose(arm, clip, p):
    act = next((a for a in bpy.data.actions if a.name == clip or a.name.split('.')[0] == clip), None)
    if not act: return False
    arm.animation_data_create(); arm.animation_data.action = act
    try:
        if not arm.animation_data.action_slot and act.slots: arm.animation_data.action_slot = act.slots[0]
    except AttributeError: pass
    a, b = act.frame_range
    bpy.context.scene.frame_set(int(round(a + (b - a) * p)))
    return True


tiles = {}
for f in FILES:
    sc, cam = scene_setup()
    bpy.ops.import_scene.gltf(filepath=f)
    arm = next((o for o in sc.objects if o.type == 'ARMATURE'), None)
    for o in list(sc.objects):
        if o.name.startswith('Icosphere'): bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in sc.objects if o.type == 'MESH' and o.name != 'Plane']
    # performers: show the default look only (the parts the light file has)
    hide = {'Top_long', 'Bottom_skirtL', 'Top_coat', 'Top_crop', 'Bottom_skirtS', 'Shoes_boots', 'Shoes_sneakers', 'Hat_cap', 'Top_jacket'}
    look = {'hoa': {'Top_aodai', 'Bottom_trousers', 'Shoes_flats'}}
    stem = os.path.basename(f).split('.')[0]
    for o in meshes:
        if stem in look and o.name not in look[stem] and o.name != 'Body' and (o.name.startswith(('Top_', 'Bottom_', 'Shoes_', 'Hat_'))):
            o.hide_render = True
    hgt = max((o.matrix_world @ Vector(c)).z for o in meshes if not o.hide_render for c in o.bound_box)
    for i, (clip, p, yaw) in enumerate(POSES):
        if arm: pose(arm, clip, p)
        r = math.radians(yaw)
        d = Vector((math.sin(r), -math.cos(r), 0)) * 8
        cam.location = d + Vector((0, 0, MH / 2 - 0.02))
        cam.rotation_euler = (math.radians(90), 0, r)
        path = os.path.join(tmp, f'{stem}_{i}.png')
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        tiles[(f, i)] = path
    tiles[(f, 'h')] = hgt

# compose
cols, rows = len(FILES), len(POSES)
sheet = np.ones((rows * TH, cols * TW, 4), np.float32)
for c, f in enumerate(FILES):
    for r in range(rows):
        im = bpy.data.images.load(tiles[(f, r)])
        px = np.array(im.pixels[:], np.float32).reshape(TH, TW, 4)
        sheet[(rows - 1 - r) * TH:(rows - r) * TH, c * TW:(c + 1) * TW] = px
        bpy.data.images.remove(im)
out = bpy.data.images.new('sheet', cols * TW, rows * TH, alpha=True)
out.pixels = sheet.ravel().tolist()
out.filepath_raw = OUT; out.file_format = 'PNG'; out.save()
print('SHEET', OUT, {os.path.basename(f): round(tiles[(f, 'h')], 3) for f in FILES})
