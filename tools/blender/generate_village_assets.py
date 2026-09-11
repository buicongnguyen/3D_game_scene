"""Generate four original village house styles using the shared Blender pipeline."""
import runpy
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name('generate_scene_assets.py'))))

plaster=material('warm lime plaster',(.64,.55,.40))
aged=material('weathered plaster',(.40,.36,.28))
white=material('new ivory render',(.78,.78,.70),.76)
timber=material('aged oak frame',(.15,.085,.038))
roof=material('terracotta roof',(.31,.09,.045),.8)
slate=material('slate roof',(.09,.13,.16),.75)
window=material('village window',(.10,.18,.23),.25)
art=material('studio teal woodwork',(.045,.25,.25))

def pitched_roof(height,mat):
    verts=[(-2.28,-2.78,height),(2.28,-2.78,height),(-2.28,0,height+1.25),(2.28,0,height+1.25),(-2.28,2.78,height),(2.28,2.78,height)]
    mesh=bpy.data.meshes.new('roof planes')
    mesh.from_pydata(verts,[],[(0,1,3,2),(2,3,5,4),(0,2,4),(1,5,3),(0,4,5,1)])
    obj=bpy.data.objects.new('pitched roof',mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(mat)
    for side in [-1,1]:
        for row in range(1,7):
            y=side*2.78*row/7
            box('tile course',(0,y,height+1.25*(1-row/7)+.025),(4.56,.035,.035),mat,0)
    box('ridge cap',(0,0,height+1.29),(4.63,.13,.10),mat)

def framed_window(x,y,z,width= .8,height=1.05,frame=timber):
    box('window frame',(x,y,z),(width+.16,.13,height+.16),frame)
    # Thin opaque glass avoids transparent sorting and keeps raycast occlusion.
    side=1 if y>0 else -1
    box('window glass',(x,y+side*.08,z),(width,.025,height),window,0)
    box('window mullion',(x,y+side*.10,z),(.045,.03,height),frame,0)
    box('window crossbar',(x,y+side*.10,z),(width,.03,.045),frame,0)
    box('window sill',(x,y+side*.06,z-height/2-.12),(width+.26,.24,.10),frame)

for style in ['house-two-storey','house-old','house-new','house-art']:
    two=style=='house-two-storey'; modern=style=='house-new'; studio=style=='house-art'
    height=5.4 if two else 3.4 if studio else 2.8
    wall=white if modern else art if studio else aged if style=='house-old' else plaster
    framing=art if modern else timber
    box('stone foundation',(0,0,-.9),(4.3,5.3,2.1),stone)
    box('house walls',(0,0,height/2),(4,5,height),wall)
    if modern:
        box('flat overhanging roof',(0,0,height+.15),(4.56,5.56,.3),slate)
        box('roof parapet',(0,-2.55,height+.43),(4.4,.16,.32),white)
        chimney_top=height+1.1
    else:
        pitched_roof(height,slate if studio else roof)
        chimney_top=height+1.8
    box('chimney',(1.2,.6,chimney_top-.55),(.42,.48,1.1),stone)
    box('chimney cap',(1.2,.6,chimney_top),(.57,.62,.12),stone)
    box('chimney opening',(1.2,.6,chimney_top+.064),(.30,.35,.015),timber,0)
    box('door frame',(0,2.535,1.04),(1.12,.16,2.08),framing)
    box('front door',(0,2.64,1.02),(.90,.04,1.94),timber,0)
    for z in [.5,1.35]:box('recessed door panel',(0,2.67,z),(.64,.025,.55),framing,0)
    oval('door handle',(.30,2.72,1.05),(.038,.038,.038),stone,8,6)
    box('doorstep',(0,2.73,.09),(1.3,.54,.18),stone)
    for y in [-2.535,2.535]:
        for x in [-1.25,1.25]:
            framed_window(x,y,1.6,frame=framing)
            if two:framed_window(x,y,4.1,frame=framing)
    if two:
        for y in [-2.56,2.56]:
            box('floor belt',(0,y,2.8),(4.08,.13,.16),timber)
            for x in [-1.93,0,1.93]:box('timber upright',(x,y,2.7),(.13,.12,5.35),timber)
    if style=='house-old':
        for side in [-1,1]:
            for i in range(4):
                box('exposed stone repair',(side*1.83,2.54,.45+i*.35),(.3,.09,.21),stone)
            shutter=box('weathered shutter',(side*1.8,2.66,1.6),(.3,.06,1.15),timber)
            shutter.rotation_euler.y=side*.07
        for i in range(5):
            tube('plaster crack',[(-.65+i*.12,-2.51,.35),(-.69+i*.12,-2.51,.65),(-.61+i*.12,-2.51,.9)],.008,timber)
    if studio:
        # Recessed gallery sign and a colorful geometric mural, no external textures.
        box('gallery sign',(0,2.64,2.63),(2.55,.12,.38),timber)
        for i in range(6):
            box('mural color panel',((i-2.5)*.55,-2.56,2.7),(.42,.05,.34+(i%3)*.18),[plaster,art,roof][i%3],0)
        box('studio skylight',(0,-.9,height+.89),(1.35,.75,.06),window)
        for side in [-1,1]:
            tube('sign bracket',[(side*.8,2.55,2.87),(side*.8,2.77,2.87)],.028,timber)
    save(style)
