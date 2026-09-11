"""Original valley assets. Run Blender --background --python this_file.py."""
from pathlib import Path
import bpy
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'assets' / 'source'
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, rgb):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .85
    return m

fur = material('warm brown fur', (.43, .29, .17))
cream = material('cream fur', (.86, .79, .64))
pink = material('inner ears', (.55, .27, .25))
dark = material('eyes and nose', (.018, .015, .011))
bark = material('cut wood', (.29, .14, .065))
stone = material('river stone', (.34, .38, .40))
leaf = material('berry leaves', (.16, .32, .10))
berry = material('ripe berries', (.55, .06, .10))

def oval(name, pos, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj

def save(name):
    # Merge static pieces sharing materials to avoid one draw call per primitive.
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if 'foot' not in obj.name:
            groups.setdefault(obj.data.materials[0].name, []).append(obj)
    for group in groups.values():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in group:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), export_format='GLB', use_selection=True)
    # Editable native source is generated next to each exported asset.
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (name + '.blend')))
    bpy.ops.object.delete(use_global=False)

# Blender Z is up; glTF export converts it to Three.js Y up. Rabbit faces +Y.
oval('body', (0, 0, .50), (.29, .48, .32), fur)
oval('haunch', (0, -.28, .43), (.33, .30, .34), fur)
oval('chest', (0, .27, .53), (.23, .24, .29), cream)
oval('head', (0, .43, .75), (.23, .25, .24), fur)
oval('muzzle', (0, .63, .68), (.16, .12, .11), cream)
oval('nose', (0, .735, .72), (.045, .025, .03), pink)
oval('tail', (0, -.51, .55), (.13, .13, .13), cream)
for side in [-1, 1]:
    oval('ear', (side*.115, .40, 1.08), (.075, .08, .30), fur)
    oval('inner ear', (side*.115, .47, 1.08), (.043, .017, .23), pink)
    oval('eye', (side*.195, .53, .80), (.037, .041, .04), dark)
    oval('eye glint', (side*.217, .55, .815), (.009, .01, .01), cream)
    oval('hind_foot', (side*.21, -.25, .17), (.13, .24, .12), fur)
    oval('front_foot', (side*.16, .28, .20), (.07, .09, .21), cream)
save('rabbit')

for i in range(3):
    oval('log', ((i-1)*.18, 0, .16), (.11, .52, .11), bark)
save('wood')

oval('bush', (0, 0, .42), (.62, .52, .43), leaf)
for i in range(9):
    import math
    a = i*2.4
    oval('berry', (math.cos(a)*.46, math.sin(a)*.40, .55+(i%3)*.08), (.07, .07, .07), berry)
save('berries')

for i in range(10):
    import math
    a = i*math.tau/10
    oval('hearth stone', (math.cos(a)*.85, math.sin(a)*.85, .15), (.22, .18, .16), stone)
for i in range(3):
    oval('firewood', ((i-1)*.18, 0, .12), (.10, .56, .10), bark)
save('camp')

# Simple recurved hunting bow with a taut string, exported as real mesh geometry.
import math
def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    spline = curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for p, xyz in zip(spline.points, points):
        p.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
tube('bow limb', [(math.sin(i/16*math.pi)*.22,0,(i/16-.5)*1.3) for i in range(17)], .024, bark)
tube('string', [(0,0,-.65),(0,0,.65)], .004, cream)
oval('leather grip', (.22,0,0), (.035,.035,.14), dark)
save('bow')

silver=material('river silver',(.32,.58,.61))
fin=material('gold fins',(.56,.31,.12))
shell=material('crab shell',(.42,.19,.075))
oval('fish body',(0,0,.0),(.16,.48,.22),silver)
oval('fish belly',(0,.06,-.08),(.145,.34,.12),cream)
oval('tail',(0,-.50,0),(.035,.16,.23),fin)
oval('dorsal',(0,-.06,.22),(.025,.20,.12),fin)
for side in [-1,1]:
    oval('eye',(side*.13,.30,.075),(.025,.03,.03),dark)
    oval('side fin',(side*.18,0,-.02),(.12,.15,.025),fin)
save('fish')

oval('shell',(0,0,.17),(.28,.21,.12),shell)
for side in [-1,1]:
    for i in range(4):
        tube('leg',[(side*.20,(i-1.5)*.09,.16),(side*.37,(i-1.5)*.15,.12),(side*.46,(i-1.5)*.17,.025)],.022,shell)
    oval('claw',(side*.28,.30,.15),(.11,.16,.07),shell)
    oval('eye',(side*.10,.20,.29),(.03,.03,.035),dark)
save('crab')
