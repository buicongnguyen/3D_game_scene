"""Original valley assets. Run Blender --background --python this_file.py."""
from pathlib import Path
import math
import random
import bpy
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'assets' / 'source'
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, rgb, roughness=.85, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1)
    shader = m.node_tree.nodes['Principled BSDF']
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    # Bake inexpensive surface variation into COLOR_0, not Blender-only noise nodes.
    color = m.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Surface'
    m.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
    return m

fur = material('warm brown fur', (.43, .29, .17))
cream = material('cream fur', (.86, .79, .64))
pink = material('inner ears', (.55, .27, .25))
dark = material('eyes and nose', (.018, .015, .011), .19)
bark = material('cut wood', (.29, .14, .065))
stone = material('river stone', (.34, .38, .40))
leaf = material('berry leaves', (.16, .32, .10))
berry = material('ripe berries', (.55, .06, .10))

def oval(name, pos, scale, mat, segments=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj

def merge_static():
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if not any(part in obj.name for part in ['foot', 'wing']):
            groups.setdefault(obj.data.materials[0].name, []).append(obj)
    for group in groups.values():
        if len(group) == 1: continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in group: obj.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
    bpy.ops.object.select_all(action='SELECT')

def save(name):
    rng = random.Random(name)
    for obj in list(bpy.context.scene.objects):
        mesh = obj.data
        base = mesh.materials[0].diffuse_color
        colors = mesh.color_attributes.new(name='Surface', type='BYTE_COLOR', domain='POINT')
        for vertex, color in zip(mesh.vertices, colors.data):
            p = vertex.co
            # Low-amplitude broad mottling; avoids a noisy silhouette or extra draw calls.
            variation = .91 + .065*math.sin(p.x*31+p.y*17)*math.sin(p.z*23) + rng.uniform(-.025,.025)
            color.color = (*(min(1, channel*variation) for channel in base[:3]), 1)
    # Merge static pieces sharing materials to avoid one draw call per primitive.
    mobile_houses=[]
    if name.startswith('house-'):
        for obj in bpy.context.scene.objects:
            if any(detail in obj.name for detail in ['tile course','mullion','crossbar','plaster crack','exposed stone repair','door handle','recessed door panel']): continue
            copy=obj.copy();copy.data=obj.data.copy();mobile_houses.append(copy)
    merge_static()
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), export_format='GLB', use_selection=True)
    # Editable native source is generated next to each exported asset.
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (name + '.blend')))
    if mobile_houses:
        bpy.ops.object.delete(use_global=False)
        for obj in mobile_houses: bpy.context.collection.objects.link(obj)
        merge_static()
    # Export a separate lightweight delivery mesh; do not download both on phones.
    for obj in bpy.context.selected_objects:
        if len(obj.data.polygons) < 80:
            continue
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new('mobile LOD', 'DECIMATE')
        if name.startswith('house-') or name in ['locomotive','tender','coach','train-wheel']:
            # Collapsing thin window frames can produce degenerate triangles.
            modifier.decimate_type = 'DISSOLVE'
            modifier.angle_limit = .10
        else:
            modifier.ratio = .32
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.data.validate(clean_customdata=False)
    mobile_out = OUT / 'mobile'
    mobile_out.mkdir(exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(mobile_out / (name + '.glb')), export_format='GLB', use_selection=True)
    bpy.ops.object.delete(use_global=False)

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
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    for face in bpy.context.object.data.polygons:
        face.use_smooth = True
    return bpy.context.object

def membrane(name, points, mat):
    # Thin fins/leaves have real back faces, no globally double-sided materials.
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], [tuple(range(len(points)))])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('thin surface', 'SOLIDIFY')
    mod.thickness = .003
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def log(pos, length, radius, angle=0):
    obj = tube('rough bark', [(0,-length/2,0),(0,length/2,0)], radius, bark)
    obj.location = pos
    obj.rotation_euler.z = angle
    for end in [-1,1]:
        center = Vector((-math.sin(angle)*end*length/2,math.cos(angle)*end*length/2,0))+Vector(pos)
        disk = oval('cut end grain', center, (radius*.94,.009,radius*.94), cream)
        disk.rotation_euler.z = angle
        for fraction in [.36,.68]:
            points=[]
            for j in range(25):
                a=j*math.tau/24
                local=Vector((math.cos(a)*radius*fraction,end*.012,math.sin(a)*radius*fraction))
                points.append(tuple(center+Vector((local.x*math.cos(angle)-local.y*math.sin(angle),local.x*math.sin(angle)+local.y*math.cos(angle),local.z))))
            tube('growth ring', points, .003, bark)
    for i in range(7):
        a=i*math.tau/7
        points=[]
        for j in range(5):
            y=(j/4-.5)*length*.94
            x=math.cos(a)*radius
            points.append((pos[0]+x*math.cos(angle)-y*math.sin(angle),pos[1]+x*math.sin(angle)+y*math.cos(angle),pos[2]+math.sin(a)*radius))
        tube('bark ridge', points, .009, bark)

# Blender Z is up; glTF export converts it to Three.js Y up. Rabbit faces +Y.
oval('body', (0, 0, .50), (.29, .48, .32), fur)
oval('haunch', (0, -.28, .43), (.33, .30, .34), fur)
oval('chest', (0, .27, .53), (.23, .24, .29), cream)
oval('head', (0, .43, .75), (.23, .25, .24), fur)
# Union the main anatomical masses; overlapping spheres otherwise read as a toy.
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    obj.select_set(obj.name in ['body', 'haunch', 'head'])
bpy.context.view_layer.objects.active = bpy.data.objects['body']
bpy.ops.object.join()
body=bpy.context.object
remesh=body.modifiers.new('continuous anatomy', 'REMESH')
remesh.mode='VOXEL'
remesh.voxel_size=.023
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=body.modifiers.new('soft anatomical transitions','SMOOTH')
smooth.factor=1.2
smooth.iterations=4
bpy.ops.object.modifier_apply(modifier=smooth.name)
decimate=body.modifiers.new('browser mesh budget','DECIMATE')
decimate.ratio=.3
bpy.ops.object.modifier_apply(modifier=decimate.name)
for face in body.data.polygons: face.use_smooth=True
oval('muzzle', (0, .63, .68), (.16, .12, .11), cream)
oval('nose', (0, .735, .72), (.045, .025, .03), pink)
oval('tail', (0, -.51, .55), (.13, .13, .13), cream)
for side in [-1, 1]:
    ear = oval('ear', (side*.115, .40, 1.08), (.075, .055, .30), fur)
    ear.rotation_euler.y = side*.16
    inner = oval('inner ear', (side*.115, .449, 1.08), (.043, .009, .23), pink)
    inner.rotation_euler.y = side*.16
    oval('eye', (side*.195, .53, .80), (.037, .041, .04), dark)
    oval('eye glint', (side*.217, .55, .815), (.009, .01, .01), cream)
    oval('hind_foot', (side*.21, -.25, .17), (.13, .24, .12), fur)
    oval('front_foot', (side*.16, .28, .20), (.07, .09, .21), cream)
    oval('muzzle cheek', (side*.068,.667,.683), (.085,.074,.058), cream)
    for j in range(3):
        tube('whisker',[(side*.09,.70,.69),(side*.24,.73,.69+(j-1)*.018),(side*.35,.69,.69+(j-1)*.04)],.0015,cream)
    tube('mouth',[(0,.733,.69),(0,.733,.657),(side*.05,.72,.648)],.003,dark)
save('rabbit')

for i in range(3):
    log(((i-1)*.21, 0, .16), 1.04, .095, (i-1)*.08)
save('wood')

for i in range(13):
    a=i*2.4
    tip=Vector((math.cos(a)*.48,math.sin(a)*.40,.45+(i%4)*.10))
    tube('berry branch',[(0,0,.03),tuple(tip*.6),tuple(tip)],.012,leaf)
    for side in [-1,1]:
        base=tip*.72
        delta=Vector((math.cos(a+side*.9)*.23,math.sin(a+side*.9)*.23,.06))
        cross=Vector((-delta.y,delta.x,0))*.35
        membrane('pointed leaf',[tuple(base),tuple(base+delta*.5+cross),tuple(base+delta),tuple(base+delta*.5-cross)],leaf)
    for j in range(3):
        p=tip+Vector(((j-1)*.065,0,-(j%2)*.045))
        oval('berry',p,(.048,.047,.051),berry,8,6)
        oval('berry calyx',p+Vector((0,0,.045)),(.022,.022,.008),leaf,6,4)
save('berries')

for i in range(10):
    import math
    a = i*math.tau/10
    rock=oval('hearth stone', (math.cos(a)*.85, math.sin(a)*.85, .15), (.22, .18, .16), stone)
    for v in rock.data.vertices:
        v.co *= 1+.09*math.sin(v.index*13.7+i)
    rock.rotation_euler.z=a
for i in range(3):
    log(((i-1)*.18, 0, .12+i*.025), 1.12, .08, (i-1)*.5)
save('camp')

# Simple recurved hunting bow with a taut string, exported as real mesh geometry.
tube('bow limb', [(math.sin(i/16*math.pi)*.22,0,(i/16-.5)*1.3) for i in range(17)], .024, bark)
tube('string', [(0,0,-.65),(0,0,.65)], .004, cream)
oval('leather grip', (.22,0,0), (.035,.035,.14), dark)
for j in range(12):
    tube('grip binding',[(.22+math.cos(i*math.tau/16)*.036,math.sin(i*math.tau/16)*.036,(j-5.5)*.018) for i in range(17)],.003,cream)
save('bow')

silver=material('river silver',(.32,.49,.44),.32,.25)
fin=material('amber fin membrane',(.40,.27,.12),.55)
shell=material('crab shell',(.29,.13,.055),.43)
# Authored cross-section profile: pointed snout, deep shoulder, narrow tail peduncle.
profiles=[(-.48,.032,.045),(-.34,.07,.10),(-.18,.13,.18),(.05,.155,.205),(.25,.12,.17),(.39,.075,.095),(.46,.015,.025)]
vertices=[]
for y,w,h in profiles:
    for j in range(16):
        a=j*math.tau/16
        vertices.append((math.cos(a)*w,y,math.sin(a)*h))
faces=[]
for i in range(len(profiles)-1):
    for j in range(16):
        faces.append(((i+1)*16+j,(i+1)*16+(j+1)%16,i*16+(j+1)%16,i*16+j))
faces.extend([tuple(range(16)),tuple(reversed(range(96,112)))])
mesh=bpy.data.meshes.new('streamlined fish')
mesh.from_pydata(vertices,[],faces)
obj=bpy.data.objects.new('streamlined fish',mesh)
bpy.context.collection.objects.link(obj)
mesh.materials.append(silver)
for face in mesh.polygons: face.use_smooth=True
membrane('forked caudal fin',[(0,-.43,0),(0,-.68,.22),(0,-.62,.035),(0,-.58,0),(0,-.62,-.035),(0,-.68,-.22)],fin)
membrane('dorsal fin',[(0,.16,.18),(0,.035,.33),(0,-.19,.28),(0,-.30,.12)],fin)
for j in range(9):
    z=(j-4)*.047
    tube('tail fin ray',[(0,-.445,0),(0,-.62-abs(z)*.22,z)],.0025,fin)
for side in [-1,1]:
    oval('eye',(side*.083,.325,.057),(.022,.027,.027),dark)
    oval('eye highlight',(side*.100,.331,.065),(.005,.007,.007),cream)
    tube('gill cover',[(side*.10,.24,.12),(side*.133,.20,.05),(side*.125,.20,-.08)],.005,fin)
    membrane('pectoral fin',[(side*.12,.13,-.02),(side*.29,-.09,-.10),(side*.12,-.04,-.06)],fin)
    for row in range(4):
        for col in range(8):
            y=-.25+col*.06
            z=(row-1.5)*.052
            width=max(.045,.15-abs(y-.03)*.20)
            oval('flank speckle',(side*width,y,z),(.002,.010,.005),fin,6,4)
save('fish')

oval('shell',(0,0,.17),(.28,.21,.12),shell)
oval('carapace ridge',(0,-.015,.258),(.19,.155,.035),shell)
for i in range(9):
    a=i*math.pi/8
    oval('shell marginal tooth',(math.cos(a)*.268,-math.sin(a)*.16,.18),(.025,.035,.018),shell)
for side in [-1,1]:
    for i in range(4):
        tube('leg',[(side*.20,(i-1.5)*.09,.16),(side*.37,(i-1.5)*.15,.12),(side*.46,(i-1.5)*.17,.025)],.022,shell)
        oval('leg joint',(side*.37,(i-1.5)*.15,.12),(.029,.029,.028),shell,8,6)
    tube('claw arm',[(side*.18,.11,.16),(side*.33,.22,.13),(side*.29,.32,.17)],.036,shell)
    oval('claw palm',(side*.29,.32,.17),(.078,.09,.055),shell)
    tube('fixed pincer',[(side*.34,.36,.17),(side*.34,.46,.17),(side*.295,.49,.17)],.022,shell)
    tube('moving pincer',[(side*.245,.36,.17),(side*.23,.43,.17),(side*.275,.48,.17)],.016,shell)
    tube('eye stalk',[(side*.10,.17,.22),(side*.12,.23,.29)],.012,shell)
    oval('eye',(side*.12,.23,.29),(.021,.023,.023),dark)
save('crab')
