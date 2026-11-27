"""Dialogue portrait of Kotone, the visitor at Hoshi Station (a VRoid Project sample character made light by
vroid_mixamo.py), made exactly like the cast's (portraits.py: Cycles, warm key, rim, her colour behind) from her full
model public/models/kotone.glb, posed by her own Idle (Mixamo's Happy Idle).

blender -b --factory-startup --python art/blender/kotone_portrait.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portraits as P

P.SETUP.update({
    'kotone': dict(pose='Idle@0.32', az=26, el=3, height=0.5, lift=0.01, bg=('#b9c8ea', '#3d5a8a')),
})
P.run(['kotone'])
