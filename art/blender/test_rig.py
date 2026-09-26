"""Smoke test for rig.py: blender -b --factory-startup --python art/blender/test_rig.py -- <out_dir>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
from rig import *

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else None
reset()
skin_m = mat('Skin', '#f2c29b', .55)
cloth = mat('Coat', '#f0b429', .45)
arm = build_armature('Rig', [
    ('root', (0, 0, 0), (0, 0, .2), None),
    ('hips', (0, 0, .75), (0, 0, .9), 'root'),
    ('spine', (0, 0, .9), (0, 0, 1.2), 'hips'),
    ('head', (0, 0, 1.2), (0, 0, 1.5), 'spine'),
    ('thigh_L', (.1, 0, .75), (.1, 0, .4), 'hips'),
    ('shin_L', (.1, 0, .4), (.1, 0, .05), 'thigh_L'),
    ('thigh_R', (-.1, 0, .75), (-.1, 0, .4), 'hips'),
    ('shin_R', (-.1, 0, .4), (-.1, 0, .05), 'thigh_R'),
])
parts = [
    bind(capsule('torso', (0, 0, .8), (0, 0, 1.15), .16, cloth), 'spine'),
    bind(sphere('headball', .2, (0, 0, 1.38), skin_m), 'head'),
    bind(capsule('thighL', (.1, 0, .72), (.1, 0, .42), .07, cloth), 'thigh_L'),
    bind(capsule('shinL', (.1, 0, .4), (.1, 0, .06), .06, skin_m), 'shin_L'),
    bind(capsule('thighR', (-.1, 0, .72), (-.1, 0, .42), .07, cloth), 'thigh_R'),
    bind(capsule('shinR', (-.1, 0, .4), (-.1, 0, .06), .06, skin_m), 'shin_R'),
]
body = skin(parts, arm, 'Body', ao=dict(rays=16, distance=.3, strength=.5, ground=0.0))
clip(arm, 'Idle', 60, {'spine': lambda p: (2 * sin(p), 0, 0), 'hips@loc': lambda p: (0, 0, .01 * sin(p, 2))})
clip(arm, 'Walk', 30, {
    'thigh_L': lambda p: (-30 * sin(p), 0, 0), 'thigh_R': lambda p: (30 * sin(p), 0, 0),
    'shin_L': lambda p: (max(0, 40 * sin(p, 1, .25)), 0, 0), 'shin_R': lambda p: (max(0, -40 * sin(p, 1, .25)), 0, 0),
    'hips@loc': lambda p: (0, 0, .03 * abs(sin(p)))})
print(export_rigged('rig-test', arm, out_dir=out))
