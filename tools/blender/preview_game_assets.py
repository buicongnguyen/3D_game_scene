"""Render the exported GLBs, so previews exercise the browser-delivery format."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
tier = 'mobile' if '--mobile' in sys.argv else ''
props = '--props' in sys.argv
seasonal = '--seasonal' in sys.argv
railway = '--railway' in sys.argv
houses = '--houses' in sys.argv
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
layout = [('wood',-3),('berries',-1),('camp',1),('bow',3)] if props else [('rabbit', -1.6), ('fish', 0), ('crab', 1.6)]
if seasonal: layout=[('sheep',-3.6),('bear',-2),('fox',-.4),('peacock',1.1),('chicken',2.5),('bird',3.5)]
if railway: layout=[('locomotive',9),('tender',0),('coach',-10)]
if houses: layout=[('house-two-storey',-9),('house-old',-3),('house-new',3),('house-art',9)]
for name, x in layout:
    bpy.ops.import_scene.gltf(filepath=str(root / 'public/models' / tier / (name+'.glb')))
    for obj in bpy.context.selected_objects:
        if obj.parent is None:
            obj.location.x += x
            if name == 'fish':
                obj.location.z += .35
            if name == 'bow':
                obj.location.z += .7
            if name == 'bird':
                obj.location.z += .6
    if railway:
        # Studio assembly only: runtime uses the train's existing axle positions.
        offsets={'locomotive':[-2,-.5,1],'tender':[-1.7,0,1.7],'coach':[-4.55,-2.85,2.85,4.55]}[name]
        for axle in offsets:
            for side in [-1,1]:
                bpy.ops.import_scene.gltf(filepath=str(root/'public/models'/tier/'train-wheel.glb'))
                wheel_root=bpy.data.objects.new('preview wheel',None)
                bpy.context.collection.objects.link(wheel_root)
                for obj in list(bpy.context.selected_objects):
                    if obj.parent is None: obj.parent=wheel_root
                radius=.72 if name=='locomotive' else .5
                wheel_root.scale=(radius,)*3
                wheel_root.location=(x+axle,side*.96,radius)
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.location.z = -.025
mat = bpy.data.materials.new('studio slate')
mat.diffuse_color = (.08,.10,.12,1)
floor.data.materials.append(mat)
lights=[((1,3,6),1000,5),((-4,1,3),700,4),((0,-4,5),1200,3)]
if railway or houses: lights=[((0,10,15),11000,18),((-12,1,10),6000,12),((8,-8,12),9000,10)]
for position, power, size in lights:
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
if seasonal: camera.data.ortho_scale=10
if railway:
    camera.location=(18,33,20)
    camera.rotation_euler=(Vector((1,0,1.2))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=34
if houses:
    camera.location=(10,25,17)
    camera.rotation_euler=(Vector((0,0,2))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=27
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
scene.render.filepath=str(output/(('houses' if houses else 'railway' if railway else 'seasonal' if seasonal else 'props' if props else 'wildlife')+('-mobile' if tier else '')+'.png'))
bpy.ops.render.render(write_still=True)
