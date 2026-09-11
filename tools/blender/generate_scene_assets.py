"""Extend the shared Blender delivery pipeline with seasonal wildlife and railway assets."""
import runpy
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name('generate_game_assets.py'))))

def box(name, pos, size, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj=bpy.context.object
    obj.name=name
    obj.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat)
    if bevel and min(size)>.06:
        mod=obj.modifiers.new('soft manufactured edges','BEVEL')
        mod.width=bevel; mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def eyes(y,z,x,mat=dark):
    for side in [-1,1]:
        oval('eye',(side*x,y,z),(.026,.028,.028),mat,8,6)

def legs(width,front,back,height,mat):
    for y in [front,back]:
        for side in [-1,1]:
            # Keep a true joint pivot for runtime movement.
            obj=oval('foot',(side*width,y,height/2),(.075,.095,height/2),mat,10,8)
            for v in obj.data.vertices: v.co.z-=height/2
            obj.location.z+=height/2

snow=material('snowy coat',(.76,.78,.72))
hoof=material('horn and hoof',(.065,.054,.044),.65)
orange=material('fox russet',(.48,.16,.045))
blue=material('peacock blue',(.025,.14,.32),.4,.18)
green=material('peacock bronze green',(.025,.25,.14),.45,.12)
gold=material('ochre markings',(.58,.35,.055),.55)
red=material('comb red',(.38,.025,.018),.6)

# Sheep: wool masses, tapered muzzle, horizontal ears, hooves and docked tail.
oval('wool body',(0,0,.67),(.37,.61,.37),snow)
for i in range(24):
    a=i*2.4
    oval('fleece curl',(math.cos(a)*.30,(i%6-2.5)*.17,.73+math.sin(a)*.25),(.13,.13,.12),snow,8,6)
oval('neck',(0,.43,.71),(.18,.22,.25),snow)
oval('face',(0,.64,.67),(.14,.23,.16),cream)
oval('nose',(0,.83,.61),(.09,.06,.07),hoof)
for side in [-1,1]: oval('ear',(side*.21,.56,.79),(.14,.075,.04),cream,10,6)
eyes(.69,.75,.125)
legs(.24,.36,-.37,.45,hoof)
oval('tail',(0,-.60,.61),(.085,.12,.11),snow)
save('sheep')

# Brown winter bear with a snow-dusted back, shoulder hump and small round ears.
oval('bear torso',(0,-.05,.77),(.40,.62,.40),fur)
oval('shoulder hump',(0,.30,.88),(.38,.30,.38),fur)
oval('head',(0,.61,.87),(.27,.28,.25),fur)
oval('muzzle',(0,.84,.80),(.17,.20,.12),cream)
oval('nose',(0,1.015,.83),(.09,.048,.065),dark)
oval('snow on back',(0,-.10,1.105),(.27,.46,.055),snow)
for side in [-1,1]:
    oval('ear',(side*.20,.56,1.085),(.083,.066,.10),fur)
    oval('ear hollow',(side*.20,.615,1.085),(.049,.016,.055),dark,8,6)
eyes(.785,.955,.205)
legs(.28,.37,-.44,.55,fur)
for y in [.37,-.44]:
    for side in [-1,1]:
        for j in range(3): oval('claw',(side*.28+(j-1)*.045,y+.09,.07),(.013,.04,.014),cream,6,4)
save('bear')

# Fox: long muzzle, pointed ears, dark stockings and a white-tipped brush.
oval('fox torso',(0,-.06,.52),(.22,.47,.23),orange)
oval('chest',(0,.23,.55),(.17,.18,.24),cream)
oval('head',(0,.43,.70),(.17,.20,.19),orange)
oval('pointed muzzle',(0,.62,.64),(.10,.18,.08),cream)
oval('nose',(0,.785,.66),(.038,.025,.03),dark,8,6)
for side in [-1,1]:
    membrane('pointed ear',[(side*.04,.4,.8),(side*.13,.43,1.015),(side*.22,.38,.78)],orange)
    membrane('inner ear',[(side*.08,.407,.815),(side*.13,.438,.96),(side*.18,.397,.80)],dark)
eyes(.54,.75,.14)
legs(.14,.24,-.34,.37,dark)
tail=oval('fox brush',(0,-.64,.43),(.16,.37,.16),orange)
tail.rotation_euler.x=-.32
oval('white tail tip',(0,-.91,.34),(.12,.14,.12),cream)
save('fox')

def bird_body(mat, chicken=False):
    oval('bird torso',(0,0,.46),(.20,.31,.24),mat)
    oval('neck',(0,.22,.65),(.095,.12,.23),mat)
    oval('head',(0,.28,.85),(.10,.12,.12),mat)
    membrane('beak',[(-.04,.38,.86),(0,.52,.825),(.04,.38,.86),(0,.38,.80)],gold)
    eyes(.33,.89,.088)
    for side in [-1,1]:
        tube('foot',[(side*.085,.015,.31),(side*.085,.015,.06),(side*.085,.14,.025)],.018,gold)
        oval('folded wing',(side*.18,-.04,.48),(.055,.22,.16),mat,12,8)
    if chicken:
        for i in range(4): oval('comb',(0,.22+i*.036,.97),(.023,.035,.05),red,8,6)
        oval('wattle',(0,.355,.77),(.03,.04,.06),red,8,6)
        for i in range(5):
            membrane('tail feather',[(-.06,-.2,.5),((i-2)*.06,-.44,.82),((i-2)*.06+.045,-.48,.67),(.06,-.22,.45)],dark)

bird_body(cream,True)
save('chicken')
bird_body(blue)
for i in range(17):
    a=(i/16-.5)*math.pi*1.08
    tip=Vector((math.sin(a)*.78,-.25, .55+math.cos(a)*.90))
    base=Vector((0,-.22,.40))
    tangent=Vector((math.cos(a),0,-math.sin(a)))*.065
    membrane('fan feather',[tuple(base),tuple(tip-tangent),tuple(tip+Vector((0,0,.025))),tuple(tip+tangent)],green)
    tube('feather shaft',[tuple(base),tuple(tip)],.004,gold)
    oval('feather gold eye',tip+Vector((0,.01,-.09)),(.045,.009,.06),gold,8,6)
    oval('feather blue eye',tip+Vector((0,.02,-.085)),(.027,.006,.033),blue,8,6)
for i in range(3):
    tube('crest',[(0,.26,.94),((i-1)*.045,.24,1.06)],.006,blue)
    oval('crest tip',((i-1)*.045,.24,1.06),(.016,.016,.025),blue,6,4)
save('peacock')

# Flight asset faces Blender +Y / Three.js -Z. Wings pivot at shoulder roots.
oval('bird body',(0,0,0),(.105,.29,.12),cream)
oval('bird head',(0,.25,.045),(.082,.10,.082),cream)
eyes(.30,.065,.069)
membrane('flight beak',[(-.035,.32,.04),(0,.46,.025),(.035,.32,.04),(0,.33,-.01)],gold)
for side in [-1,1]:
    wing=membrane('wing',[(0,0,0),(side*.22,.10,0),(side*.74,-.11,-.015),(side*.61,-.28,0),(side*.18,-.16,0)],dark)
    wing.location=(side*.07,0,0)
for i in range(5):
    membrane('tail feather',[((i-2)*.024,-.20,0),((i-2)*.039,-.48,-.02),((i-2)*.039+.027,-.47,-.02),((i-2)*.024+.02,-.20,0)],dark)
save('bird')

# Railway models use +X forward, Z up before export, matching existing chassis.
paint=material('locomotive enamel',(.045,.11,.085),.34,.35)
steel=material('railway steel',(.19,.22,.24),.35,.65)
glass=material('dark blue window glass',(.035,.09,.14),.17,.2)
brass=material('brass fittings',(.55,.35,.10),.28,.7)

box('locomotive chassis',(0,0,1.05),(9.4,1.65,.28),steel)
boiler=tube('boiler',[(-1.45,0,1.92),(4.15,0,1.92)],.72,paint)
oval('smokebox front',(4.15,0,1.92),(.045,.70,.70),steel)
for x in [-1.3,0,1.4,3.1]:
    tube('boiler band',[(x,math.cos(i*math.tau/24)*.735,1.92+math.sin(i*math.tau/24)*.735) for i in range(25)],.027,brass)
box('cab rear',(-3.05,0,2.08),(2.35,1.9,1.85),paint)
box('cab roof',(-3.05,0,3.08),(2.7,2.12,.15),steel,.07)
for side in [-1,1]:
    for x in [-3.65,-2.65]: box('cab window',(x,side*.96,2.52),(.65,.035,.65),glass)
    tube('hand rail',[(-1.3,side*.85,1.63),(3.0,side*.85,1.63)],.027,brass)
    box('running board',(.7,side*.94,1.20),(5.5,.35,.10),steel)
    box('cab step',(-3.4,side*1.02,.69),(.8,.35,.12),steel)
tube('chimney',[(3.98,0,2.25),(3.98,0,2.95)],.20,steel)
tube('steam dome',[(.2,0,2.45),(.2,0,2.98)],.23,brass)
oval('head lamp',(4.25,0,2.25),(.12,.22,.22),cream)
box('buffer beam',(4.62,0,1.05),(.15,2.0,.28),red)
save('locomotive')

box('tender chassis',(0,0,.95),(5.3,1.8,.25),steel)
box('coal tender',(0,0,1.77),(4.9,1.9,1.45),paint)
for i in range(24):
    oval('coal lump',((i%6-2.5)*.67,(i//6-1.5)*.39,2.5),(.32,.20,.13),dark,6,4)
for side in [-1,1]: box('tender trim',(0,side*.96,2.2),(4.8,.025,.055),brass)
save('tender')

box('coach chassis',(0,0,.98),(11.6,1.9,.25),steel)
box('coach body',(0,0,2.02),(11.2,2.05,1.9),paint)
box('coach roof',(0,0,3.04),(11.65,2.22,.23),steel,.10)
for side in [-1,1]:
    for i in range(9):
        x=(i-4)*1.04
        box('window surround',(x,side*1.045,2.36),(.83,.06,.78),brass)
        box('window',(x,side*1.081,2.36),(.72,.025,.66),glass)
    for x in [-5.1,5.1]:
        box('coach door',(x,side*1.037,1.96),(.65,.04,1.48),steel)
        box('door glass',(x,side*1.065,2.37),(.44,.022,.51),glass)
        box('boarding step',(x,side*1.15,.70),(.75,.42,.12),steel)
    box('coach waist stripe',(0,side*1.04,1.7),(10.9,.026,.055),brass)
for x in [-5.88,5.88]: box('coupler',(x,0,.93),(.40,.24,.18),steel)
save('coach')

# Unit-radius wheel; runtime scales to the existing drive/pony/bogie radii.
bpy.ops.mesh.primitive_torus_add(major_radius=.87,minor_radius=.13,major_segments=20,minor_segments=6)
wheel=bpy.context.object; wheel.name='wheel rim'; wheel.rotation_euler.x=math.pi/2
wheel.data.materials.append(steel)
for i in range(10):
    a=i*math.tau/10
    tube('wheel spoke',[(0,0,0),(.86*math.cos(a),0,.86*math.sin(a))],.045,steel)
tube('wheel hub',[(0,-.16,0),(0,.16,0)],.16,brass)
save('train-wheel')
