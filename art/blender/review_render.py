"""Review renders for Starline GLBs (evidence only; write under .tools/, never public/).

blender -b --factory-startup --python art/blender/review_render.py -- <models_dir> <out_dir> [options] [names...]
  --views front,back,side,top   camera angles (default: front)   -> <name>.png, <name>-back.png, ...
  --clip Walk@0.25             pose rigged models at 25% of a clip before rendering (suffix -Walk)
  --size 520                   square resolution
  --engine eevee|cycles        default eevee
Compose with: python art/blender/compose_sheet.py <out_dir> <sheet.png> [cols] [names...]

Lighting matches the runtime look: Standard view transform (AgX desaturates the palette), warm key,
cool sky fill, rim light, and baked COLOR_0 AO multiplied into base colour like three.js does.
"""
import bpy, os, sys, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _abs(p):
    return p if os.path.isabs(p) else os.path.join(ROOT, p)


MODELS, OUT = _abs(args[0]), _abs(args[1])
views, clip, size, engine, only = ['front'], None, 520, 'eevee', []
i = 2
while i < len(args):
    a = args[i]
    if a == '--views':
        views = args[i + 1].split(','); i += 2
    elif a == '--clip':
        clip = args[i + 1]; i += 2
    elif a == '--size':
        size = int(args[i + 1]); i += 2
    elif a == '--engine':
        engine = args[i + 1]; i += 2
    else:
        only.append(a); i += 1
os.makedirs(OUT, exist_ok=True)
names = sorted(n[:-4] for n in os.listdir(MODELS) if n.endswith('.glb'))
if only:
    names = [n for n in names if n in only]

VIEW_DIRS = {
    'front': Vector((0.72, -1.0, 0.55)),
    'back': Vector((-0.72, 1.0, 0.55)),
    'side': Vector((1.0, -0.05, 0.25)),
    'top': Vector((0.3, -0.4, 1.4)),
    'face': Vector((0.25, -1.0, 0.12)),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    if engine == 'cycles':
        s.render.engine = 'CYCLES'
        s.cycles.samples = 64
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = 'OPTIX'
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
            s.cycles.device = 'GPU'
        except Exception:
            pass
    else:
        try:
            s.render.engine = 'BLENDER_EEVEE_NEXT'
        except TypeError:
            s.render.engine = 'BLENDER_EEVEE'
        try:
            s.eevee.use_shadows = True
            s.eevee.use_raytracing = True
            s.eevee.taa_render_samples = 32
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


def pose(clip_spec):
    name, _, frac = clip_spec.partition('@')
    frac = float(frac or 0)
    act = bpy.data.actions.get(name)
    if not act:
        return False
    for o in bpy.data.objects:
        if o.type == 'ARMATURE':
            o.animation_data_create()
            o.animation_data.action = act
            try:
                if act.slots:
                    o.animation_data.action_slot = act.slots[0]
            except Exception:
                pass
            f0, f1 = act.frame_range
            bpy.context.scene.frame_set(int(round(f0 + (f1 - f0) * frac)))
    return True


for name in names:
    s = reset()
    try:  # the importer's bone shapes (a hidden icosphere) must not count toward framing
        bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + '.glb'), disable_bone_shape=True)
    except TypeError:
        bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + '.glb'))
    bpy.context.view_layer.update()
    suffix = ''
    if clip and pose(clip):
        suffix = '-' + clip.split('@')[0]
    bpy.context.view_layer.update()
    objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.visible_get()]
    ao_into_base(objs)
    deps = bpy.context.evaluated_depsgraph_get()
    coords = []
    for o in objs:
        ev = o.evaluated_get(deps)
        me = ev.to_mesh()
        coords.extend(ev.matrix_world @ v.co for v in me.vertices)
        ev.to_mesh_clear()
    if not coords:
        continue
    lo = Vector(tuple(min(v[j] for v in coords) for j in range(3)))
    hi = Vector(tuple(max(v[j] for v in coords) for j in range(3)))
    c = (lo + hi) / 2
    r = max((hi - lo).length / 2, 0.05)
    bpy.ops.mesh.primitive_plane_add(size=r * 14, location=(c.x, c.y, lo.z - 0.002))
    fl = bpy.context.object
    fm = bpy.data.materials.new('floor')
    fm.use_nodes = True
    fb = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    fb.inputs['Base Color'].default_value = (.30, .33, .30, 1)
    fb.inputs['Roughness'].default_value = .85
    fl.data.materials.append(fm)
    sun((math.radians(50), 0, math.radians(-35)), 3.6, (1.0, .93, .82))      # warm key
    sun((math.radians(60), 0, math.radians(150)), .9, (.62, .75, 1.0))       # cool fill
    sun((math.radians(-70), 0, math.radians(20)), 1.4, (1.0, .95, .9))       # rim
    for v in views:
        d = VIEW_DIRS[v].normalized()
        bpy.ops.object.camera_add()
        cam = bpy.context.object
        cam.data.lens = 50
        cam.data.sensor_width = 36
        fov = 2 * math.atan(18 / 50)
        dist = r / math.sin(fov / 2) * (0.78 if v == 'face' else 1.04)
        target = c + Vector((0, 0, (hi.z - lo.z) * .32)) if v == 'face' else c
        cam.location = target + d * dist
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.clip_end = dist * 20
        s.camera = cam
        tag = '' if v == 'front' else '-' + v
        s.render.filepath = os.path.join(OUT, name + suffix + tag + '.png')
        bpy.ops.render.render(write_still=True)
print('RENDERED', len(names))
