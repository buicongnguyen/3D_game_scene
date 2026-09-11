"""Render the exported GLBs, so previews exercise the browser-delivery format."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
tier = 'mobile' if '--mobile' in sys.argv else ''
props = '--props' in sys.argv
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
layout = [('wood',-3),('berries',-1),('camp',1),('bow',3)] if props else [('rabbit', -1.6), ('fish', 0), ('crab', 1.6)]
for name, x in layout:
    bpy.ops.import_scene.gltf(filepath=str(root / 'public/models' / tier / (name+'.glb')))
    for obj in bpy.context.selected_objects:
        if obj.parent is None:
            obj.location.x += x
            if name == 'fish':
                obj.location.z += .35
            if name == 'bow':
                obj.location.z += .7
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.location.z = -.025
mat = bpy.data.materials.new('studio slate')
mat.diffuse_color = (.08,.10,.12,1)
floor.data.materials.append(mat)
for position, power, size in [((1,3,6),1000,5),((-4,1,3),700,4),((0,-4,5),1200,3)]:
    bpy.ops.object.light_add(type='AREA', location=position)
    lamp=bpy.context.object
    lamp.data.energy=power
    lamp.data.shape='DISK'
    lamp.data.size=size
    lamp.rotation_euler=(-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.8,7,4.2))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,.45))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=8.5 if props else 5.4
scene=bpy.context.scene
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1200
scene.render.resolution_y=600
scene.render.resolution_percentage=100
scene.world.color=(.25,.25,.25)
output=root/'assets/previews'
output.mkdir(exist_ok=True)
scene.render.filepath=str(output/(('props' if props else 'wildlife')+('-mobile' if tier else '')+'.png'))
bpy.ops.render.render(write_still=True)
