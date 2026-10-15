"""Dialogue portraits of the dance game's performers, made exactly like the cast's (portraits.py: Cycles, warm key, rim,
the character's colour behind), from their default look alone (.tools/portrait-src/<name>.glb, written by
build_performers.py) so no other wardrobe part shows.

blender -b --factory-startup --python art/blender/performer_portraits.py [-- hoa,nabi]
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portraits as P

P.MODELS = os.path.join(P.ROOT, '.tools', 'portrait-src')
P.SETUP.update({
    'hoa': dict(pose='Idle@0.32', az=26, el=3, height=0.5, lift=0.01, bg=('#ffc0a8', '#d8452f')),
    'nabi': dict(pose='Idle@0.32', az=28, el=3, height=0.52, lift=0.01, bg=('#ffb6d9', '#d93f8c')),
    'byeol': dict(pose='Idle@0.32', az=26, el=3, height=0.52, lift=0.01, bg=('#bfe3ff', '#3f86d8')),
    'haru': dict(pose='Idle@0.32', az=28, el=3, height=0.54, lift=0.0, bg=('#a9c4ff', '#2d55c8')),
})
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
P.run(args[0].split(',') if args else ['hoa', 'nabi', 'byeol', 'haru'])
