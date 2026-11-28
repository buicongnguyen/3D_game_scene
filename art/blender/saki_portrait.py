# © 2026 Bui Cong Nguyen · solluxlabs.com
"""Portrait of Saki (VRoid Project sample nu-3, the show's lead when Mika opens it: game/singplay/singplay.js SAKI), made
exactly like Kotone's (kotone_portrait.py) and the cast's (portraits.py: Cycles, warm key, rim, a colour behind) from
her full model public/models/vroid-nu3.glb, posed by her own Idle, with a gentle smile (lips a little apart: the
mouth's rose inside, vroid_lite.MOUTH). Written as public/portraits/nu-3.webp (her id: the Play as tiles,
game/play-as.js playAsPic; the dialogue rows, ui/ui.js).

blender -b --factory-startup --python art/blender/saki_portrait.py      (Blender 4.5.11, as the cast's portraits)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import portraits as P

P.SETUP.update({
    'nu-3': dict(file='vroid-nu3', pose='Idle@0.32', az=24, el=3, height=0.5, lift=0.01, bg=('#f7d6e4', '#a8557f'),
                 keys={'smile': 0.6, 'smileEyes': 0.25, 'mouthA': 0.34}),
})
P.run(['nu-3'])
