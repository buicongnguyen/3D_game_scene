"""Dialogue portraits: head-and-shoulders 3/4 renders of the exported GLBs (Cycles, GPU/OptiX).

Called from build_characters.py (or standalone:
  blender -b --factory-startup --python art/blender/portraits.py -- mika,genzo,...).
Renders a transparent PNG per character to .tools/review/characters/portraits/, then
portrait_post.py (system Python + PIL) composites it over a soft radial gradient in the
character's colour and writes public/portraits/<name>.webp at 512x512.
"""
import bpy, os, sys, math, subprocess
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = os.path.join(ROOT, 'public', 'models')
RAW = os.path.join(ROOT, '.tools', 'review', 'characters', 'portraits')
OUT = os.path.join(ROOT, 'public', 'portraits')

# pose (clip@fraction), camera azimuth (deg, + = toward the character's left), framing tweaks,
# gradient colours (inner, outer) for portrait_post.py
SETUP = {
    'mika': dict(pose='Idle@0.32', az=28, el=4, height=0.5, lift=0.0, bg=('#ffd77a', '#e0892c')),
    'genzo': dict(pose='Idle@0.32', az=30, el=2, height=0.64, lift=0.0, bg=('#8fb4ea', '#2d4a7a')),
    'rin': dict(pose='Idle@0.3', az=26, el=2, height=0.62, lift=0.0, bg=('#7fe3d6', '#138a86'), under=1.0),
    'ota': dict(pose='Idle@0.32', az=30, el=4, height=0.54, lift=0.02, bg=('#f2b37a', '#8c4b2a')),
    'hana': dict(pose='Idle@0.32', az=28, el=4, height=0.54, lift=0.02, bg=('#ffb0c6', '#c83e66')),
    'sora': dict(pose='Idle@0.32', az=28, el=4, height=0.54, lift=0.02, bg=('#d4ec9c', '#4c8a3c')),
    'tamo': dict(pose='Float@0.25', az=14, el=2, height=0.56, lift=0.0, bg=('#ffe9a0', '#26356e'), light=0.45),
}


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.fps = 30
    s.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == 'OPTIX'
        s.cycles.device = 'GPU'
    except Exception as e:
        print('GPU setup failed, using CPU', e)
    s.cycles.samples = 160
    s.cycles.use_denoising = True
    s.render.film_transparent = True
    s.render.resolution_x = s.render.resolution_y = 1024
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'None'
    s.view_settings.exposure = 0.0
    s.world = bpy.data.worlds.new('w')
    s.world.use_nodes = True
    bg = next(n for n in s.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (0.55, 0.6, 0.72, 1)
    bg.inputs[1].default_value = 0.25
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
            # a touch of subsurface on skin for a softer, warmer portrait
            if m.name.startswith('Skin'):
                try:
                    b.inputs['Subsurface Weight'].default_value = 0.12
                    b.inputs['Subsurface Radius'].default_value = (0.02, 0.008, 0.005)
                except Exception:
                    pass


def area(name, loc, target, energy, color, size):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = energy
    d.color = color
    d.size = size
    ob = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob


def render(name):
    cfg = SETUP[name]
    s = setup_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + '.glb'))
    arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o, do_unlink=True)
    objs = [o for o in bpy.data.objects if o.type == 'MESH']
    ao_into_base(objs)
    # portraits are close-ups: split the hair off and subdivide it (render only)
    for o in list(objs):
        names = [m.name for m in o.data.materials if m]
        hair = [i for i, m in enumerate(o.data.materials) if m and ('Hair' in m.name or 'hair' in m.name)]
        if not hair:
            continue
        bpy.context.view_layer.objects.active = o
        for x in bpy.context.selected_objects:
            x.select_set(False)
        o.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        for i in hair:
            o.active_material_index = i
            bpy.ops.object.material_slot_select()
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        for x in bpy.context.selected_objects:
            if x is not o:
                md = x.modifiers.new('Subdivision', 'SUBSURF')
                md.levels = md.render_levels = 1
    objs = [o for o in bpy.data.objects if o.type == 'MESH']
    clip, _, frac = cfg['pose'].partition('@')
    act = bpy.data.actions.get(clip)
    if arm and act:
        arm.animation_data_create()
        arm.animation_data.action = act
        try:
            arm.animation_data.action_slot = act.slots[0]
        except Exception:
            pass
        f0, f1 = act.frame_range
        s.frame_set(int(round(f0 + (f1 - f0) * float(frac))))
    bpy.context.view_layer.update()
    if name == 'tamo':
        head = Vector((0, 0, 0))
        for pb in arm.pose.bones:
            if pb.name == 'body':
                head = arm.matrix_world @ pb.head
        chest = head
        focus = head + Vector((0, 0, 0.02))
    else:
        pb = arm.pose.bones['head']
        head = arm.matrix_world @ pb.head
        chest = arm.matrix_world @ arm.pose.bones['chest'].head
        # frame from mid-chest to above the hair
        deps = bpy.context.evaluated_depsgraph_get()
        top = -1e9
        for o in objs:
            ev = o.evaluated_get(deps)
            me = ev.to_mesh()
            top = max(top, max((ev.matrix_world @ v.co).z for v in me.vertices))
            ev.to_mesh_clear()
        focus = Vector((head.x, head.y, (top + chest.z) / 2 + 0.03 + cfg['lift']))
    az, el = math.radians(cfg['az']), math.radians(cfg['el'])
    # glTF import is Y-up converted back to Blender Z-up; the character faces -Y
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    cam_d = bpy.data.cameras.new('cam')
    cam_d.lens = 85
    cam_d.sensor_width = 36
    cam = bpy.data.objects.new('cam', cam_d)
    s.collection.objects.link(cam)
    fov = 2 * math.atan(18 / 85)
    dist = (cfg['height'] / 2) / math.tan(fov / 2)
    cam.location = focus + d * dist
    cam.rotation_euler = (focus - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_d.clip_start = 0.05
    s.camera = cam
    # lighting: warm soft key (front-left, above), cool fill, strong warm rim from behind, soft top
    k = dist
    kl = cfg.get('light', 1.0)
    area('key', focus + Vector((0.9, -1.1, 0.8)) * k * 0.6, focus, 34 * kl * k * k * 0.36, (1.0, 0.86, 0.7), 1.0 * k * 0.5)
    area('fill', focus + Vector((-1.2, -0.6, 0.1)) * k * 0.6, focus, 8 * kl * k * k * 0.36, (0.7, 0.8, 1.0), 1.6 * k * 0.5)
    area('rim', focus + Vector((-0.7, 1.1, 0.6)) * k * 0.6, focus, 70 * kl * k * k * 0.36, (1.0, 0.88, 0.7), 0.6 * k * 0.5)
    area('rim2', focus + Vector((0.9, 1.0, 0.2)) * k * 0.6, focus, 26 * kl * k * k * 0.36, (1.0, 0.95, 0.85), 0.5 * k * 0.5)
    if cfg.get('under'):
        # bounce light from below for faces shaded by a brim
        area('under', focus + Vector((0.3, -1.0, -0.9)) * k * 0.6, focus, 16 * cfg['under'] * k * k * 0.36,
             (1.0, 0.9, 0.78), 1.2 * k * 0.5)
    if name == 'tamo':
        s.cycles.samples = 128
    os.makedirs(RAW, exist_ok=True)
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA'
    s.render.filepath = os.path.join(RAW, name + '.png')
    bpy.ops.render.render(write_still=True)
    return s.render.filepath


def run(names):
    names = [n for n in names if n in SETUP]
    raws = []
    for n in names:
        raws.append(render(n))
        print('PORTRAIT RAW', raws[-1])
    os.makedirs(OUT, exist_ok=True)
    post = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'portrait_post.py')
    for n in names:
        bg = SETUP[n]['bg']
        cmd = ['python', post, os.path.join(RAW, n + '.png'), os.path.join(OUT, n + '.webp'), bg[0], bg[1]]
        r = subprocess.run(cmd, capture_output=True, text=True)
        print('PORTRAIT', n, r.stdout.strip(), r.stderr.strip()[-300:])


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0].split(',') if args else list(SETUP))
