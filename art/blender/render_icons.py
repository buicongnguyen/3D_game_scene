"""Item icons for the Starline UI: 160x160 transparent 3/4 renders of every model marked
`icon: true` in tests/asset-contracts.mjs, written to public/icons/<name>.webp.

blender -b --factory-startup --python art/blender/render_icons.py -- [names...] [--size 160] [--ss 3]
    [--out public/icons] [--models public/models] [--engine eevee|cycles]

Each item is framed tightly with an orthographic camera fitted to its projected bounds, lit warm
(key, cool sky fill and a strong rim so the silhouette separates on dark UI panels), rendered
supersampled on a transparent film, then downsampled with PIL, given a thin dark outline so it stays
readable at 48 px, and saved as WebP. Contact previews (160 px and 48 px) go to .tools/review/props/.
"""
import bpy, os, re, sys, math, subprocess, json
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def _abs(p):
    return p if os.path.isabs(p) else os.path.join(ROOT, p)


size, ss, engine = 160, 3, 'eevee'
out_dir, models = _abs('public/icons'), _abs('public/models')
names = []
i = 0
while i < len(args):
    a = args[i]
    if a == '--size':
        size = int(args[i + 1]); i += 2
    elif a == '--ss':
        ss = int(args[i + 1]); i += 2
    elif a == '--out':
        out_dir = _abs(args[i + 1]); i += 2
    elif a == '--models':
        models = _abs(args[i + 1]); i += 2
    elif a == '--engine':
        engine = args[i + 1]; i += 2
    else:
        names.append(a); i += 1

if not names:
    src = open(os.path.join(ROOT, 'tests', 'asset-contracts.mjs'), encoding='utf-8').read()
    names = re.findall(r"^\s*'?([a-z0-9-]+)'?\s*:\s*\{[^}]*icon:\s*true", src, re.M)

# Per-item view tweaks: azimuth/elevation of the camera (degrees), extra roll of the model (Z).
VIEW = {
    'default': (-35, 28),
    'fish-trout': (-78, 16), 'fish-koi': (-78, 22), 'fish-starfin': (-78, 16),
    'fallen-star': (-20, 12),
    'cog': (-25, 18),
    'journal-page': (-25, 30),
    'key': (-20, 20),
    'plate-trout': (-30, 38),
    'bowl-chestnuts': (-30, 34),
    'honeycomb': (-22, 16),
    'timber': (-40, 30),
    'peach-bun': (-30, 32),
    'star-kite': (-24, 34),
    'cricket': (-40, 36), 'spider': (-28, 36), 'ladybug': (-32, 40), 'dragonfly': (-35, 76), 'butterfly': (-22, 62),
    'frog': (-38, 24), 'firefly': (-35, 42),
    # trick-card scenes (build_tricks.py --icons -> .tools/review/trick-scenes; render with --models there)
    'trick-firefly': (-25, 18), 'trick-river': (-30, 30), 'trick-stars': (0, 4), 'trick-frogs': (-30, 30),
    # phase 2 (build_tricks2.py): beetles for the journal, the roasted potato, and the four trick-card scenes
    'beetle-rhino': (-58, 26), 'beetle-stag': (-30, 52), 'sweet-potato': (-6, 34),
    'trick-kite': (0, 4), 'trick-dew': (0, 4), 'trick-roast': (-8, 26), 'trick-beetles': (-10, 16),
}
# Rigged items: the glTF importer leaves the first clip (alphabetical) on the armature; pose these explicitly.
POSE = {'butterfly': ('Rest', 0.0), 'dragonfly': ('Fly', 0.0), 'ladybug': ('Idle', 0.0), 'spider': ('Idle', 0.0),
        'cricket': ('Idle', 0.0), 'frog-tree': ('Idle', 0.0), 'firefly': ('Rest', 0.0),
        'beetle-rhino': ('Idle', 0.0), 'beetle-stag': ('Idle', 0.45)}
# Variant nodes left out of an item's icon (the sweet potato icon is the roasted one).
HIDE = {'sweet-potato': ('raw',)}
# Icons named differently from their model (icon name -> model file).
ALIAS = {'frog': 'frog-tree'}
GLOW = {'fallen-star': 1.0, 'trick-firefly': .8, 'trick-river': .7, 'trick-stars': .6, 'firefly': .5,
        'trick-roast': .6, 'trick-dew': .35}
TMP = os.path.join(ROOT, '.tools', 'review', 'props', 'icons-raw')
os.makedirs(TMP, exist_ok=True)
os.makedirs(out_dir, exist_ok=True)


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
            s.eevee.taa_render_samples = 64
            s.eevee.use_shadows = True
            s.eevee.use_raytracing = True
        except Exception:
            pass
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'None'
    s.render.film_transparent = True
    s.render.resolution_x = s.render.resolution_y = size * ss
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA'
    s.world = bpy.data.worlds.new('w')
    s.world.use_nodes = True
    bg = next(n for n in s.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (.55, .5, .46, 1)
    bg.inputs[1].default_value = .75
    return s


def ao_into_base(objs):
    """Multiply COLOR_0 (baked AO) into base colour, as three.js does with vertexColors."""
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


def sun(rot, energy, color, angle=6):
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 10))
    l = bpy.context.object
    l.data.energy = energy
    l.data.color = color
    l.data.angle = math.radians(angle)
    l.rotation_euler = rot
    return l


def render(name):
    s = reset()
    model = ALIAS.get(name, name)
    bpy.ops.import_scene.gltf(filepath=os.path.join(models, model + '.glb'))
    for o in [o for o in bpy.data.objects if o.name in HIDE.get(name, ())]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()
    # the glTF importer adds a bone-display shape (an Icosphere) for rigged models: not part of the item
    shapes = {pb.custom_shape for a in bpy.data.objects if a.type == 'ARMATURE' for pb in a.pose.bones if pb.custom_shape}
    for o in shapes:
        o.hide_render = True
    if model in POSE:
        act = bpy.data.actions.get(POSE[model][0])
        for a in [o for o in bpy.data.objects if o.type == 'ARMATURE' and act]:
            a.animation_data_create()
            a.animation_data.action = act
            try:
                if act.slots:
                    a.animation_data.action_slot = act.slots[0]
            except Exception:
                pass
            f0, f1 = act.frame_range
            s.frame_set(int(round(f0 + (f1 - f0) * POSE[model][1])))
        bpy.context.view_layer.update()
    objs = [o for o in bpy.data.objects if o.type == 'MESH' and o not in shapes]
    ao_into_base(objs)
    az, el = VIEW.get(name, VIEW['default'])
    az, el = math.radians(az), math.radians(el)
    d = Vector((-math.sin(az), -math.cos(az), 0)) * math.cos(el) + Vector((0, 0, math.sin(el)))
    d.normalize()
    deps = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(deps)
        me = ev.to_mesh()
        pts.extend(ev.matrix_world @ v.co for v in me.vertices)
        ev.to_mesh_clear()
    lo = Vector([min(p[k] for p in pts) for k in range(3)])
    hi = Vector([max(p[k] for p in pts) for k in range(3)])
    c = (lo + hi) / 2
    R = (hi - lo).length
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.location = c + d * R * 3
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    cs = [inv @ p for p in pts]
    xs = [p.x for p in cs]
    ys = [p.y for p in cs]
    w = max(xs) - min(xs)
    h = max(ys) - min(ys)
    # recentre the camera on the projected bounds, then fit with a small margin for the outline
    mid = cam.matrix_world @ Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, 0))
    cam.location = mid
    cam.data.ortho_scale = max(w, h) * 1.1
    cam.data.clip_end = R * 10
    cam.data.clip_start = min(.1, R * .5)  # tiny critters: the camera sits closer than the 0.1 m default
    s.camera = cam
    # warm key from upper left-front, cool fill, and a strong warm rim from behind
    key_dir = Vector((-.6, -.7, .8)).normalized()
    sun((-key_dir).to_track_quat('-Z', 'Y').to_euler(), 3.4, (1.0, .9, .76))
    fill_dir = Vector((.9, -.4, .2)).normalized()
    sun((-fill_dir).to_track_quat('-Z', 'Y').to_euler(), 1.0, (.62, .74, 1.0))
    rim_dir = Vector((.3, 1.0, .5)).normalized()
    sun((-rim_dir).to_track_quat('-Z', 'Y').to_euler(), 3.0, (1.0, .92, .78), angle=3)
    path = os.path.join(TMP, name + '.png')
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


raw = {}
for n in names:
    if not os.path.exists(os.path.join(models, ALIAS.get(n, n) + '.glb')):
        print('SKIP (no model)', n)
        continue
    raw[n] = render(n)

# Post-process with the system Python + PIL (Blender's bundled Python has no PIL).
job = os.path.join(TMP, 'job.json')
json.dump({'raw': raw, 'size': size, 'out': out_dir, 'glow': GLOW,
           'preview': os.path.join(ROOT, '.tools', 'review', 'props')}, open(job, 'w'))
post = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icon_post.py')
r = subprocess.run(['python', post, job], capture_output=True, text=True)
print(r.stdout, r.stderr)
print('ICONS', len(raw))
