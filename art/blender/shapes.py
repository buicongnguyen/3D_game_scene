"""Body-shape morphs for the graceful performers (docs/PERFORMERS.md).

Every part carries an integer 'region' attribute (tag) saying how the shape fields move it; after skinning, add()
writes shape keys on the body AND on every garment from the SAME displacement fields, so clothes follow the body:

  shape_chest   a modest chest (front depth at chest height)
  shape_waist   the waist (radial, at the waist)
  shape_hips    the hips and seat (radial, round the hip line; skirts and coat tails follow down to the hem)
  shape_thigh   thighs (each leg about its own axis, upper leg)
  shape_arm     arm thickness (each arm about its own axis)
  shape_build   overall slim <-> sturdy (torso, arms, legs and neck together)

A key holds the displacement from the designed shape to the FULLER end. The runtime sets influence = 2 * (v - 0.5) for a
control value v in 0..1 (0.5 = as designed, 0 = the slim end, 1 = the fuller end; src/engine/wardrobe.js setShape).
The ranges are kept natural and modest (about +-8 to 12 percent in girth).
"""
import math
import bpy
from mathutils import Vector
from human_lib import sstep, clamp

V = Vector
REGIONS = {'none': 0, 'head': 1, 'neck': 2, 'hand': 3, 'torso': 4, 'drape': 5, 'arm_L': 6, 'arm_R': 7, 'leg_L': 8,
           'leg_R': 9, 'foot': 10}
NAMES = {v: k for k, v in REGIONS.items()}
SHAPES = ['shape_chest', 'shape_waist', 'shape_hips', 'shape_thigh', 'shape_arm', 'shape_build']


def tag(ob, region):
    me = ob.data
    a = me.attributes.get('region') or me.attributes.new('region', 'INT', 'POINT')
    v = REGIONS[region]
    a.data.foreach_set('value', [v] * len(me.vertices))
    return ob


def bump(z, c, w):
    return math.exp(-((z - c) / w) ** 2)


def _axis_offset(co, a, b):
    """Offset of co from the segment a-b (perpendicular), and the parameter along it."""
    d = b - a
    t = clamp((co - a).dot(d) / d.length_squared)
    foot = a + d * t
    return co - foot, t


def fields(b):
    """The displacement fields: {shape: fn(co, region) -> Vector} in rest space (metres, k = 1)."""
    zc, zw, zh = b.chest_z + 0.06, b.spine_z + 0.01, b.hip_z - 0.01
    female = b.kind == 'f'

    def radial(co, s):
        return V((co.x * s, co.y * s, 0))

    def chest(co, r):
        if r not in ('torso', 'drape'):
            return V()
        g = bump(co.z, zc, 0.075)
        front = sstep(0.0, -0.05, co.y)
        amt = (0.10 if female else 0.08) * g
        return V((co.x * amt * 0.25, co.y * amt * front, 0))

    def waist(co, r):
        if r not in ('torso', 'drape'):
            return V()
        return radial(co, 0.11 * bump(co.z, zw, 0.075))

    def hips(co, r):
        if r == 'torso':
            return radial(co, 0.10 * bump(co.z, zh, 0.09))
        if r == 'drape':
            g = 0.10 * (bump(co.z, zh, 0.09) if co.z > zh else 1.0 - 0.35 * sstep(zh, zh - 0.5, co.z))
            return radial(co, g)
        if r in ('leg_L', 'leg_R'):
            side = 'L' if r == 'leg_L' else 'R'
            off, t = _axis_offset(co, getattr(b, 'hip_' + side), getattr(b, 'knee_' + side))
            return off * (0.06 * sstep(0.35, 0.0, t)) + V((co.x * 0.05 * sstep(0.3, 0.0, t), 0, 0))
        return V()

    def thigh(co, r):
        if r in ('leg_L', 'leg_R'):
            side = 'L' if r == 'leg_L' else 'R'
            off, t = _axis_offset(co, getattr(b, 'hip_' + side), getattr(b, 'knee_' + side))
            return off * (0.12 * sstep(1.0, 0.6, t))
        if r == 'torso' and co.z < b.hip_z:
            return V((co.x * 0.04 * sstep(b.hip_z, b.hip_z - 0.08, co.z), co.y * 0.03 * sstep(b.hip_z, b.hip_z - 0.08, co.z), 0))
        return V()

    def armf(co, r, amt=0.13):
        if r in ('arm_L', 'arm_R'):
            side = 'L' if r == 'arm_L' else 'R'
            sh, el, wr = (getattr(b, k + '_' + side) for k in ('sh', 'el', 'wr'))
            o1, t1 = _axis_offset(co, sh, el)
            o2, t2 = _axis_offset(co, el, wr)
            off = o1 if o1.length_squared <= o2.length_squared else o2
            taper = 1.0 if o1.length_squared <= o2.length_squared else 0.75 * (1 - 0.6 * t2)
            return off * (amt * taper)
        return V()

    def build(co, r):
        d = V()
        if r in ('torso', 'drape'):
            d += radial(co, 0.07 * sstep(1.32, 1.24, co.z))
        if r in ('arm_L', 'arm_R'):
            d += armf(co, r, 0.08)
        if r in ('leg_L', 'leg_R'):
            side = 'L' if r == 'leg_L' else 'R'
            hip, knee, ank = (getattr(b, k + '_' + side) for k in ('hip', 'knee', 'ank'))
            o1, t1 = _axis_offset(co, hip, knee)
            o2, t2 = _axis_offset(co, knee, ank)
            off = o1 if o1.length_squared <= o2.length_squared else o2
            d += off * 0.08 * sstep(ank.z + 0.02, ank.z + 0.08, co.z)
        if r == 'neck':
            off = V((co.x, co.y - 0.008, 0))
            d += off * 0.07
        return d
    return {'shape_chest': chest, 'shape_waist': waist, 'shape_hips': hips, 'shape_thigh': thigh,
            'shape_arm': armf, 'shape_build': build}


def add(ob, b, shapes=SHAPES):
    """Write the shape keys on a skinned mesh object from its 'region' attribute. Skips keys that move nothing."""
    me = ob.data
    reg = me.attributes.get('region')
    if reg is None:
        return []
    R = [0] * len(me.vertices)
    reg.data.foreach_get('value', R)
    F = fields(b)
    mw = ob.matrix_world
    inv = mw.inverted()
    if not me.shape_keys:
        ob.shape_key_add(name='Basis', from_mix=False)
    made = []
    for s in shapes:
        fn = F[s]
        D = [fn(mw @ v.co, NAMES.get(R[i], 'none')) for i, v in enumerate(me.vertices)]
        if max((d.length for d in D), default=0.0) < 2e-4:
            continue
        kb = ob.shape_key_add(name=s, from_mix=False)
        rot = inv.to_3x3()
        for i, v in enumerate(me.vertices):
            kb.data[i].co = v.co + rot @ D[i]
        kb.slider_min, kb.slider_max = -1.0, 1.0
        made.append(s)
    return made
