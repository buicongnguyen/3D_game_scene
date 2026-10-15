"""Review renders of the performers (evidence only, written under .tools/review/...).

blender -b --factory-startup --python art/blender/performer_review.py -- <file.glb>[,<other.glb>...] --out DIR
        [--look Top_crop,Bottom_skirtS,Shoes_sneakers] [--views F,S,B,Q,face,faceQ,hands]
        [--poses Idle@0,Walk@0.25,...] [--size 512] [--tag name] [--grid] [--engine eevee|cycles] [--skin #hex]

Several GLBs are stood side by side (a lineup); --look shows only the named meshes (plus 'Body') of a wardrobe file.
F/S/B are orthographic at a fixed scale (1.9 m frame, a line every 10 cm with --grid) so proportions compare between
renders; Q is a three-quarter perspective at eye height; face/faceQ close-ups; hands a close-up of both hands.
"""
import bpy, os, sys, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
files = args[0].split(',')
opts = {'--out': '.tools/review/perf', '--look': '', '--views': 'F,S,B,Q,face', '--poses': '', '--size': '512',
        '--tag': '', '--engine': 'eevee', '--skin': '', '--frame': '1.9', '--hide': '', '--shapes': '', '--looks': ''}
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

bpy.ops.wm.read_factory_settings(use_empty=True)
s = bpy.context.scene
if opts['--engine'] == 'cycles':
    s.render.engine = 'CYCLES'
    s.cycles.samples = 48
else:
    try:
        s.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        s.render.engine = 'BLENDER_EEVEE'
    try:
        s.eevee.taa_render_samples = 32
        s.eevee.use_shadows = True
        s.eevee.use_raytracing = True
    except Exception:
        pass
s.view_settings.view_transform = 'Standard'
s.render.resolution_x = s.render.resolution_y = size
s.world = bpy.data.worlds.new('w')
s.world.use_nodes = True
bg = next(n for n in s.world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs[0].default_value = (.42, .5, .62, 1)
bg.inputs[1].default_value = .6


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
            if opts['--skin'] and m.name == 'Skin':
                h = opts['--skin'].lstrip('#')
                c = [int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)]
                c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
                src.default_value = (*c, 1)
            if src.links:
                nt.links.new(src.links[0].from_socket, mix.inputs[6])
            else:
                mix.inputs[6].default_value = src.default_value
            nt.links.new(attr.outputs['Color'], mix.inputs[7])
            nt.links.new(mix.outputs[2], src)


arms, groups = [], []
x = 0.0
look = [n for n in opts['--look'].split(',') if n]
hide = [n for n in opts['--hide'].split(',') if n]
ACTS = []
LOOKS = [[n for n in l.split(',') if n] for l in opts['--looks'].split('|')] if opts['--looks'] else None
SHAPES = dict((kv.split('=')[0], float(kv.split('=')[1])) for kv in opts['--shapes'].split(',') if '=' in kv)
look0 = look
for fi, f in enumerate(files):
    look = LOOKS[fi] if LOOKS else look0
    before = set(bpy.data.objects)
    acts_before = set(bpy.data.actions)
    path = f if os.path.isabs(f) else os.path.join(ROOT, f)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    shapes = set()
    if arm:
        for pb in arm.pose.bones:
            if pb.custom_shape:
                shapes.add(pb.custom_shape.name)
    for o in list(new):
        if o.type == 'MESH' and (o.name in shapes or o.name.startswith('Icosphere')):
            bpy.data.objects.remove(o, do_unlink=True)
            new.remove(o)
    meshes = [o for o in new if o.type == 'MESH']
    names = {o.name.split('.')[0] for o in meshes}
    for o in meshes:
        base = o.name.split('.')[0]
        wardrobe = any(n.startswith(('Top_', 'Bottom_', 'Shoes_', 'Hat_')) for n in names)
        if (look and wardrobe and base != 'Body' and base not in look) or base in hide:
            o.hide_render = True
        if SHAPES and o.data.shape_keys:
            for kb in o.data.shape_keys.key_blocks:
                if kb.name in SHAPES:
                    kb.slider_min = -1.0
                    kb.value = 2 * (SHAPES[kb.name] - 0.5)
    root = arm or next((o for o in new if o.parent is None), None)
    if root and len(files) > 1:
        root.location.x += x
    x += 0.62
    arms.append(arm)
    ACTS.append({a.name.split('.')[0].split('_Armature')[0]: a for a in bpy.data.actions if a not in acts_before})
    groups.append([o for o in meshes if not o.hide_render])
objs = [o for g in groups for o in g]
ao_into_base(objs)

bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.001))
fl = bpy.context.object
fm = bpy.data.materials.new('floor')
fm.use_nodes = True
fb = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
fb.inputs['Base Color'].default_value = (.36, .4, .36, 1)
fb.inputs['Roughness'].default_value = .9
fl.data.materials.append(fm)
if '--grid' in flags:
    gm = bpy.data.materials.new('grid')
    gm.use_nodes = True
    gb = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    gb.inputs['Base Color'].default_value = (1, 1, 1, 1)
    gb.inputs['Emission Color'].default_value = (1, 1, 1, 1)
    gb.inputs['Emission Strength'].default_value = 0.6
    for k in range(0, 19):
        z = k * 0.1
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x / 2 - 0.31, 0.6, z))
        c = bpy.context.object
        c.scale = (x + 1.5, 0.001, 0.0012 if k % 5 else 0.0028)
        c.data.materials.append(gm)


def sun(rot, energy, color):
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 10))
    l = bpy.context.object
    l.data.energy = energy
    l.data.color = color
    l.data.angle = math.radians(5)
    l.rotation_euler = rot
    return l


sun((math.radians(50), 0, math.radians(-35)), 3.4, (1.0, .94, .84))
sun((math.radians(60), 0, math.radians(150)), 1.0, (.62, .75, 1.0))
sun((math.radians(-70), 0, math.radians(20)), 1.3, (1.0, .95, .9))
bpy.ops.object.camera_add()
cam = bpy.context.object
s.camera = cam
cx = (x - 0.62) / 2


def pose(spec):
    nm, _, frac = spec.partition('@')
    for arm, acts in zip(arms, ACTS):
        if not arm:
            continue
        act = acts.get(nm)
        arm.animation_data_create()
        arm.animation_data.action = act
        try:
            if act and act.slots:
                arm.animation_data.action_slot = act.slots[0]
        except Exception:
            pass
        if act:
            f0, f1 = act.frame_range
            s.frame_set(int(round(f0 + (f1 - f0) * float(frac or 0))))
    bpy.context.view_layer.update()


def shoot(view, tag):
    frame = float(opts['--frame'])
    if view in ('F', 'S', 'B'):
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = max(frame, x * 1.05) if view != 'S' else frame
        d = {'F': Vector((0, -1, 0)), 'S': Vector((1, 0, 0)), 'B': Vector((0, 1, 0))}[view]
        tgt = Vector((cx, 0, frame / 2 - 0.04))
        cam.location = tgt + d * 6
    else:
        cam.data.type = 'PERSP'
        cam.data.lens = 50
        if view == 'Q':
            d = Vector((0.62, -1, 0.12)).normalized()
            tgt = Vector((cx, 0, 0.86))
            dist = 2.6 + x * 0.6
        elif view in ('face', 'faceQ', 'faceS'):
            d = {'face': Vector((0, -1, 0.04)), 'faceQ': Vector((0.6, -1, 0.05)), 'faceS': Vector((1, -0.05, 0.03))}[view].normalized()
            tgt = Vector((cx, 0, 1.43))
            dist = 0.62 + (x - 0.62) * 0.4
        elif view == 'upper':
            d = Vector((0.3, -1, 0.06)).normalized()
            tgt = Vector((cx, 0, 1.2))
            dist = 1.3
        elif view == 'hands':
            d = Vector((0.0, -1, 0.15)).normalized()
            tgt = Vector((cx, 0, 0.75))
            dist = 0.9
        elif view in ('handR', 'handL'):
            # close on one hand wherever the pose has put it
            arm = arms[0]
            pb = arm.pose.bones['hand_' + view[-1]]
            tgt = arm.matrix_world @ (pb.head + (pb.tail - pb.head) * 0.9)
            d = Vector((0.15, -1, 0.2)).normalized()
            dist = 0.32
        else:
            d = Vector((0, -1, 0.1)).normalized()
            tgt = Vector((cx, 0, 0.86))
            dist = 3.0
        cam.location = tgt + d * dist
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = 0.01
    s.render.filepath = os.path.join(OUT, tag + '.png')
    bpy.ops.render.render(write_still=True)
    return s.render.filepath


written = []
base = opts['--tag'] or os.path.basename(files[0])[:-4]
poses = [p for p in opts['--poses'].split(',') if p] or ['']
for ps in poses:
    if ps:
        pose(ps)
    for v in opts['--views'].split(','):
        written.append(shoot(v, f'{base}{"-" + ps.replace("@", "_") if ps else ""}-{v}'))
print('RENDERED', len(written))
for w in written:
    print('  ', w)
