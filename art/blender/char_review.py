"""Character review renders (evidence only, under .tools/review/characters).

blender -b --factory-startup --python art/blender/char_review.py -- <name> [--views front,side,back,face]
        [--poses Walk@0,Walk@0.25,...] [--engine eevee|cycles] [--size 520] [--out .tools/review/characters]
        [--dist 1.0] [--sheet]

Same lighting model as review_render.py (Standard view, warm key, cool fill, rim, COLOR_0 multiplied
into base colour like three.js), but it ignores the glTF importer's bone-shape mesh when framing and
renders many poses per Blender session. --sheet composes all renders of this run into one PNG.
"""
import bpy, os, sys, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
name = args[0]
opts = {'--views': 'front', '--poses': '', '--engine': 'eevee', '--size': '520',
        '--out': '.tools/review/characters', '--dist': '1.0', '--models': 'public/models', '--fixed': ''}
flags = set()
i = 1
while i < len(args):
    if args[i] in opts and i + 1 < len(args):
        opts[args[i]] = args[i + 1]
        i += 2
    else:
        flags.add(args[i])
        i += 1
OUT = os.path.join(ROOT, opts['--out'])
os.makedirs(OUT, exist_ok=True)
size = int(opts['--size'])
VIEW_DIRS = {
    'front': Vector((0.72, -1.0, 0.45)), 'front0': Vector((0.0, -1.0, 0.12)), 'back': Vector((-0.72, 1.0, 0.5)),
    'side': Vector((1.0, -0.05, 0.15)), 'face': Vector((0.45, -1.0, 0.08)), 'face0': Vector((0.0, -1.0, 0.05)),
    'top': Vector((0.3, -0.4, 1.4)), 'game': Vector((0.0, 1.0, 0.42)), 'low': Vector((0.6, -1.0, -0.1)),
    'faceside': Vector((1.0, -0.35, 0.08)), 'faceback': Vector((-0.6, 1.0, 0.25)),
}


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    if opts['--engine'] == 'cycles':
        s.render.engine = 'CYCLES'
        s.cycles.samples = 64
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = 'OPTIX'
            prefs.get_devices()
            for d in prefs.devices:
                d.use = d.type == 'OPTIX'
            s.cycles.device = 'GPU'
        except Exception:
            pass
    else:
        s.render.engine = 'BLENDER_EEVEE_NEXT'
        try:
            s.eevee.use_shadows = True
            s.eevee.use_raytracing = True
            s.eevee.taa_render_samples = 24
        except Exception:
            pass
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'None'
    s.render.resolution_x = s.render.resolution_y = size
    s.world = bpy.data.worlds.new('w')
    s.world.use_nodes = True
    bg = next(n for n in s.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (.36, .45, .58, 1)
    bg.inputs[1].default_value = .55
    return s


def ao_into_base(objs):
    done = set()
    for o in objs:
        if not o.data.color_attributes:
            continue
        for m in o.data.materials:
            if not m or m in done or not m.use_nodes:
                continue
            done.add(m)
            nt = m.node_tree
            b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if not b or any(n.type in ('VERTEX_COLOR', 'ATTRIBUTE') for n in nt.nodes):
                continue
            attr = nt.nodes.new('ShaderNodeVertexColor')
            attr.layer_name = o.data.color_attributes[0].name
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1.0
            src = b.inputs['Base Color']
            if src.links:
                nt.links.new(src.links[0].from_socket, mix.inputs[6])
            else:
                mix.inputs[6].default_value = src.default_value
            nt.links.new(attr.outputs['Color'], mix.inputs[7])
            nt.links.new(mix.outputs[2], src)


def sun(rot, energy, color):
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 10))
    l = bpy.context.object
    l.data.energy = energy
    l.data.color = color
    l.data.angle = math.radians(4)
    l.rotation_euler = rot
    return l


s = setup()
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, opts['--models'], name + '.glb'))
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
shapes = set()
if arm:
    for pb in arm.pose.bones:
        if pb.custom_shape:
            shapes.add(pb.custom_shape.name)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and (o.name in shapes or o.name.startswith('Icosphere')):
        bpy.data.objects.remove(o, do_unlink=True)
objs = [o for o in bpy.data.objects if o.type == 'MESH']
ao_into_base(objs)


def bounds():
    deps = bpy.context.evaluated_depsgraph_get()
    co = []
    for o in objs:
        ev = o.evaluated_get(deps)
        me = ev.to_mesh()
        co.extend(ev.matrix_world @ v.co for v in me.vertices)
        ev.to_mesh_clear()
    lo = Vector(tuple(min(v[j] for v in co) for j in range(3)))
    hi = Vector(tuple(max(v[j] for v in co) for j in range(3)))
    return lo, hi


def pose(spec):
    if not arm:
        return
    nm, _, frac = spec.partition('@')
    act = bpy.data.actions.get(nm)
    if not act:
        print('NO CLIP', nm)
        return
    arm.animation_data_create()
    arm.animation_data.action = act
    try:
        if act.slots:
            arm.animation_data.action_slot = act.slots[0]
    except Exception:
        pass
    f0, f1 = act.frame_range
    bpy.context.scene.frame_set(int(round(f0 + (f1 - f0) * float(frac or 0))))
    bpy.context.view_layer.update()


rest_lo, rest_hi = None, None
if arm:
    arm.animation_data_create()
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()
rest_lo, rest_hi = bounds()
H = rest_hi.z - rest_lo.z
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, rest_lo.z - 0.001))
fl = bpy.context.object
fm = bpy.data.materials.new('floor')
fm.use_nodes = True
fb = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
fb.inputs['Base Color'].default_value = (.30, .33, .30, 1)
fb.inputs['Roughness'].default_value = .85
fl.data.materials.append(fm)
sun((math.radians(50), 0, math.radians(-35)), 3.6, (1.0, .93, .82))
sun((math.radians(60), 0, math.radians(150)), .9, (.62, .75, 1.0))
sun((math.radians(-70), 0, math.radians(20)), 1.4, (1.0, .95, .9))
bpy.ops.object.camera_add()
cam = bpy.context.object
cam.data.lens = 50
cam.data.sensor_width = 36
s.camera = cam
written = []
poses = [p for p in opts['--poses'].split(',') if p] or ['']
views = opts['--views'].split(',')
for ps in poses:
    if ps:
        pose(ps)
    lo, hi = bounds()
    if opts['--fixed']:
        lo, hi = rest_lo.copy(), rest_hi.copy()
        lo.z = min(lo.z, bounds()[0].z)
        hi.z = max(hi.z, bounds()[1].z)
    for v in views:
        d = VIEW_DIRS[v].normalized()
        fov = 2 * math.atan(18 / 50)
        if v.startswith('face'):
            target = Vector((0, (lo.y + hi.y) / 2 * 0.3, hi.z - H * 0.125))
            r = H * 0.15
        else:
            target = (lo + hi) / 2
            r = max((hi - lo).length / 2, 0.05) * 0.9
        dist = r / math.sin(fov / 2) * float(opts['--dist'])
        cam.location = target + d * dist
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.clip_start = 0.01
        cam.data.clip_end = dist * 20
        tag = (('-' + ps.replace('@', '_')) if ps else '') + ('' if v == 'front' else '-' + v)
        s.render.filepath = os.path.join(OUT, name + tag + '.png')
        bpy.ops.render.render(write_still=True)
        written.append(s.render.filepath)
if '--sheet' in flags and len(written) > 1:
    import subprocess
    listing = os.path.join(OUT, name + '-sheet.txt')
    with open(listing, 'w') as f:
        f.write('\n'.join(written))
print('RENDERED', len(written))
for w in written:
    print('  ', w)
