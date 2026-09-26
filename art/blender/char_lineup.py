"""Same-scale lineup of every Starline character GLB (review evidence, Cycles GPU).

blender -b --factory-startup --python art/blender/char_lineup.py -- <out.png> [--pose Idle@0.3] [--back]
"""
import bpy, os, sys, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out = os.path.join(ROOT, args[0])
pose = args[args.index('--pose') + 1] if '--pose' in args else None
back = '--back' in args
NAMES = ['villager-man', 'genzo', 'hana', 'ota', 'rin', 'mika', 'tamo', 'villager-woman', 'villager-kid']
bpy.ops.wm.read_factory_settings(use_empty=True)
s = bpy.context.scene
s.render.fps = 30
s.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'OPTIX'
s.cycles.device = 'GPU'
s.cycles.samples = 96
s.cycles.use_denoising = True
s.view_settings.view_transform = 'Standard'
s.render.resolution_x, s.render.resolution_y = 2400, 900
s.world = bpy.data.worlds.new('w')
s.world.use_nodes = True
bg = next(n for n in s.world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs[0].default_value = (.42, .5, .62, 1)
bg.inputs[1].default_value = .6
x = 0.0
for n in NAMES:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'public', 'models', n + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if o.type == 'MESH' and o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o, do_unlink=True)
            new.remove(o)
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    meshes = [o for o in new if o.type == 'MESH']
    for o in meshes:
        for m in o.data.materials:
            nt = m.node_tree
            b = next((q for q in nt.nodes if q.type == 'BSDF_PRINCIPLED'), None)
            if not b or any(q.type == 'VERTEX_COLOR' for q in nt.nodes):
                continue
            vc = nt.nodes.new('ShaderNodeVertexColor')
            vc.layer_name = o.data.color_attributes[0].name
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1.0
            src = b.inputs['Base Color']
            if src.links:
                nt.links.new(src.links[0].from_socket, mix.inputs[6])
            else:
                mix.inputs[6].default_value = src.default_value
            nt.links.new(vc.outputs['Color'], mix.inputs[7])
            nt.links.new(mix.outputs[2], src)
    if arm and not pose:
        arm.animation_data_create()
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
    if arm and pose:
        clip, _, frac = pose.partition('@')
        act = bpy.data.actions.get(clip) or bpy.data.actions.get('Float')
        arm.animation_data_create()
        arm.animation_data.action = act
        try:
            arm.animation_data.action_slot = act.slots[0]
        except Exception:
            pass
    bpy.context.view_layer.update()
    xs = [(o.matrix_world @ Vector(c)).x for o in meshes for c in o.bound_box]
    w = max(xs) - min(xs)
    for o in new:
        if o.parent is None:
            o.location.x += x - min(xs) + (0.5 if n == 'tamo' else 0)
            if n == 'tamo':
                o.location.z += 1.0
    x += w + 0.35 + (0.5 if n == 'tamo' else 0)
if pose:
    clip, _, frac = pose.partition('@')
    s.frame_set(int(float(frac) * 90))
bpy.ops.mesh.primitive_plane_add(size=60, location=(x / 2, 0, 0))
fl = bpy.context.object
fm = bpy.data.materials.new('floor')
fm.use_nodes = True
next(q for q in fm.node_tree.nodes if q.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (.3, .33, .3, 1)
fl.data.materials.append(fm)
for rot, e, col in (((50, 0, -35), 3.4, (1, .93, .82)), ((60, 0, 150), .8, (.62, .75, 1)), ((-70, 0, 20), 1.4, (1, .95, .9))):
    bpy.ops.object.light_add(type='SUN')
    l = bpy.context.object
    l.data.energy, l.data.color, l.data.angle = e, col, math.radians(4)
    l.rotation_euler = [math.radians(a) for a in rot]
bpy.ops.object.camera_add()
cam = bpy.context.object
cam.data.lens = 60
c = Vector(((x - 0.35) / 2, 0, 0.8))
d = Vector((0.0, 1.0, 0.22) if back else (0.0, -1.0, 0.22)).normalized()
cam.location = c + d * (x * 1.75)
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
s.camera = cam
s.render.filepath = out
bpy.ops.render.render(write_still=True)
print('LINEUP', out)
