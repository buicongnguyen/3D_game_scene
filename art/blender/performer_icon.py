"""The Festival dance's menu icon: Hoa in her ao dai lifting the non la, in a dusk medallion with two paper lanterns.

blender -b --factory-startup --python-exit-code 1 --python art/blender/performer_icon.py
    -> .tools/review/trick-scenes/trick-dance.glb, then
blender -b --factory-startup --python art/blender/render_icons.py -- --models .tools/review/trick-scenes trick-dance

Hoa comes from .tools/portrait-src/hoa.glb (her default look; build_performers.py writes it), posed at the accent of
FanUp; the hat sits on her grip_R bone exactly as the game puts it (prop modelled in grip space: Blender (x, y, z) is
the bone's (x, -z, y)).
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix, Vector
import build_icons as BI
from build_icons import new, disc, grad, col, S, Rd, Tb, finish_icon, put, world_box, D, mix
from kit import ROOT, OUT

V = Vector


def posed_all(path, clip, frac, name):
    """Every mesh of a rigged GLB posed at `frac` of a clip, as one plain mesh; plus the posed grip_R matrix."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new_obs = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new_obs if o.type == 'ARMATURE')
    act = next(a for a in bpy.data.actions if a.name.split('.')[0] == clip)
    arm.animation_data_create()
    arm.animation_data.action = act
    try:
        arm.animation_data.action_slot = act.slots[0]
    except Exception:
        pass
    f0, f1 = act.frame_range
    bpy.context.scene.frame_set(int(round(f0 + (f1 - f0) * frac)))
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    parts = []
    for src in [o for o in new_obs if o.type == 'MESH' and o.modifiers]:
        me = bpy.data.meshes.new_from_object(src.evaluated_get(deps), depsgraph=deps)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.matrix_world = src.matrix_world.copy()
        parts.append(ob)
    pb = arm.pose.bones['grip_R']
    grip = arm.matrix_world @ pb.matrix
    for o in new_obs:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Icosphere')]:
        bpy.data.objects.remove(o, do_unlink=True)
    from kit import join
    ob = join(parts, name)
    return ob, grip


def prop_at(model, grip, name):
    """A prop GLB placed on a posed grip matrix (grip space: prop Blender (x, y, z) -> bone (x, -z, y))."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, model + '.glb'))
    obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    axis = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
    bpy.context.view_layer.update()
    for o in obs:
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
        o.data.transform(grip @ axis)
    from kit import join
    return join(obs, name)


def scene_dance():
    new()
    parts = [disc(.30, '#ffffff')]
    col(parts[0], grad('#3a2a6a', '#8a4a8a', '#f08a5a', '#ffd08a', z0=.30, z1=-.30))
    hoa, grip = posed_all(os.path.join(ROOT, '.tools', 'portrait-src', 'hoa.glb'), 'FanUp', 0.32, 'hoa')
    hat = prop_at('non-la', grip, 'hat')
    from kit import join
    body = join([hoa, hat], 'dancer')
    put(body, (0.0, -.04, -.255), height=.56, yaw=-12)
    # two paper lanterns hanging in the dusk, a string between them
    for x, z, c in ((-.2, .16, '#ff7a3a'), (.21, .2, '#ffc23a')):
        lan = S('Lantern', (.052, .052, .062), (x, -.02, z), c, seg=14, rings=10)
        lan.data.materials.clear()
        lan.data.materials.append(BI.glow(c, 1.4))
        parts.append(lan)
        parts.append(BI.Cy('Cap', .022, .014, (x, -.02, z + .066), '#3a2418', verts=10))
        parts.append(BI.Cy('Cap', .022, .014, (x, -.02, z - .066), '#3a2418', verts=10))
    parts.append(Tb('String', [V((-.3, 0, .27)), V((-.2, 0, .235)), V((0, 0, .21)), V((.21, 0, .27)), V((.3, 0, .29))], .003, '#3a2418', verts=4))
    finish_icon('trick-dance', parts, [body])


scene_dance()
