"""Rigging and authored animation clips for Starline characters and animals.

Pipeline (Blender 4.5 LTS, headless):
  1. Build body parts with kit.py primitives (unparented, world space).
  2. bind(part, bone) gives a part 100% weight on one bone, or bind_blend()
     splits a part between two bones along an axis (e.g. a torso that bends).
  3. skin(parts, arm, name) joins the parts into one skinned mesh (vertex
     groups merge by name), bakes AO on the rest pose, adds the Armature
     modifier and parents to the armature.
  4. clip(arm, 'Walk', frames, channels) keys a looping action. Channel values
     are rotations about the ARMATURE axes (degrees), converted to each bone's
     local space, so authoring does not depend on bone roll:
        Blender: character faces -Y, up +Z, character's LEFT is +X.
        +X rotation swings a hanging limb BACKWARD; -X swings it FORWARD.
        +Z rotation turns the character to its LEFT (counter-clockwise from above).
        +Y rotation rolls toward the character's RIGHT side... (tilts top to -X).
  5. export_rigged(name, arm, meshes) writes public/models/<name>.glb with every
     action as a glTF animation of the same name.

The runtime (src/engine/assets.js) plays clips with THREE.AnimationMixer and
clones instances with SkeletonUtils. Clip names and bone names are contracts;
see art/CONTRACTS.md.
"""
import bpy, math, os
from mathutils import Vector, Euler, Matrix, Quaternion
from kit import link, bake_ao, ensure_color, glb_summary, OUT, join

FPS = 30


def build_armature(name, bones, loc=(0, 0, 0)):
    """bones: [(name, head, tail, parent_or_None[, roll_degrees])] in object space."""
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.render.fps_base = 1.0
    for b in bones:
        if '.' in b[0]:
            raise ValueError(f'bone {b[0]!r}: three.js strips dots from node names; use thigh_L style')
    data = bpy.data.armatures.new(name)
    arm = link(bpy.data.objects.new(name, data))
    arm.location = loc
    data.display_type = 'STICK'
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.selected_objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = data.edit_bones
    for b in bones:
        bn, head, tail, parent = b[:4]
        e = eb.new(bn)
        e.head, e.tail = Vector(head), Vector(tail)
        e.roll = math.radians(b[4]) if len(b) > 4 else 0.0
        if parent:
            e.parent = eb[parent]
            e.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return arm


def bind(part, bone, weight=1.0):
    """Weight every vertex of `part` to `bone`."""
    vg = part.vertex_groups.get(bone) or part.vertex_groups.new(name=bone)
    vg.add(list(range(len(part.data.vertices))), weight, 'REPLACE')
    return part


def bind_blend(part, bone_a, bone_b, fn):
    """Split weights between two bones: fn(world_co) -> t in [0,1] (0 = all bone_a)."""
    bpy.context.view_layer.update()
    mw = part.matrix_world
    ga = part.vertex_groups.get(bone_a) or part.vertex_groups.new(name=bone_a)
    gb = part.vertex_groups.get(bone_b) or part.vertex_groups.new(name=bone_b)
    for v in part.data.vertices:
        t = max(0.0, min(1.0, fn(mw @ v.co)))
        t = t * t * (3 - 2 * t)
        if t < 1:
            ga.add([v.index], 1 - t, 'REPLACE')
        if t > 0:
            gb.add([v.index], t, 'REPLACE')
    return part


def ramp(axis, a, b):
    """Helper for bind_blend: 0 at coordinate a, 1 at coordinate b along axis 0/1/2."""
    return lambda co: (co[axis] - a) / (b - a)


def skin(parts, arm, name, ao=None):
    """Join weighted parts into one skinned mesh under the armature.

    ao: dict of bake_ao keyword arguments (baked on the joined rest pose), or None to skip.
    """
    parts = [p for p in parts if p is not None]
    for p in parts:
        if not p.vertex_groups:
            raise ValueError(f'part {p.name} has no bone weights')
    mesh = join(parts, name)
    if ao is not None:
        bake_ao([mesh], **ao)
    ensure_color([mesh])
    bpy.context.view_layer.update()
    w = mesh.matrix_world.copy()
    mesh.parent = arm
    mesh.matrix_parent_inverse = arm.matrix_world.inverted()
    mesh.matrix_world = w
    mod = mesh.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    return mesh


def attach(ob, arm, bone):
    """Rigidly parent a non-deforming object (prop, eye, hat) to a bone, keeping its world transform.
    Prefer bind() + skin() for body parts; use attach for things the runtime must find by name."""
    bpy.context.view_layer.update()
    w = ob.matrix_world.copy()
    ob.parent = arm
    ob.parent_type = 'BONE'
    ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = w
    return ob


def _arm_to_local(arm, bone_name, q_arm):
    """Armature-space rotation about the bone head -> pose-bone local rotation."""
    rest = arm.data.bones[bone_name].matrix_local.to_quaternion()
    return rest.inverted() @ q_arm @ rest


def _euler_q(deg):
    return Euler([math.radians(a) for a in deg], 'XYZ').to_quaternion()


def clip(arm, name, frames, channels, loop=True, step=1):
    """Author an action by sampling channel functions.

    frames: clip length in frames at FPS (30). The key at `frames` equals the key at 0 when loop=True,
    so three.js loops seamlessly.
    channels: {'bone': fn(p) -> (rx, ry, rz) degrees about armature axes,
               'bone@loc': fn(p) -> (dx, dy, dz) armature-space offset in metres}
    p runs 0..1 over the clip.
    """
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    bones = set()
    for key in channels:
        bones.add(key.split('@')[0])
    samples = list(range(0, frames + 1, step))
    if samples[-1] != frames:
        samples.append(frames)
    for f in samples:
        p = f / frames
        if loop and f == frames:
            p = 0.0
        for bn in bones:
            pb = arm.pose.bones[bn]
            rot_fn = channels.get(bn)
            loc_fn = channels.get(bn + '@loc')
            if rot_fn is not None:
                pb.rotation_quaternion = _arm_to_local(arm, bn, _euler_q(rot_fn(p)))
                pb.keyframe_insert('rotation_quaternion', frame=f)
            if loc_fn is not None:
                d = Vector(loc_fn(p))
                rest = arm.data.bones[bn].matrix_local.to_3x3()
                pb.location = rest.inverted() @ d
                pb.keyframe_insert('location', frame=f)
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = frames
    act.use_cyclic = loop
    # reset pose so the next clip starts from rest
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    arm.animation_data.action = None
    return act


def sin(p, cycles=1.0, phase=0.0):
    return math.sin(math.tau * (p * cycles + phase))


def cos(p, cycles=1.0, phase=0.0):
    return math.cos(math.tau * (p * cycles + phase))


def export_rigged(name, arm, extra=(), out_dir=None):
    """Export the armature, its children (skinned meshes, attached props) and every action."""
    objs = [arm] + [o for o in bpy.data.objects if o.parent is arm] + list(extra)
    seen, stack = [], list(objs)
    while stack:
        o = stack.pop()
        if o in seen:
            continue
        seen.append(o)
        stack.extend(o.children)
    ensure_color([o for o in seen if o.type == 'MESH'])
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in seen:
        o.select_set(True)
    if arm.animation_data:
        arm.animation_data.action = None
    path = os.path.join(out_dir or OUT, name + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True,
        export_apply=False, export_vertex_color='ACTIVE', export_all_vertex_colors=False,
        export_normals=True, export_cameras=False, export_lights=False, export_materials='EXPORT',
        export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_optimize_animation_size=True, export_reset_pose_bones=True,
        export_def_bones=False, export_frame_range=False, export_extras=True)
    info = glb_summary(path)
    import json, struct
    with open(path, 'rb') as f:
        data = f.read()
    j = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
    info['animations'] = [a.get('name') for a in j.get('animations', [])]
    print(f'EXPORTED {name}: {info["tris"]} tris, {info["materials"]} materials, {info["bytes"] // 1024} KB, '
          f'clips={info["animations"]}')
    return info
