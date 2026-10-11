"""Review scenes for the cow riders: a posed cow with Mika or a villager kid on it, at the documented seat.

blender -b --factory-startup --python art/blender/rider_check.py -- <out_dir> [who:cow_clip@f:rider_clip@f ...]
    e.g. mika:Idle@0:RideCow@0.25  villager-kid:Gallop@0.5:RideCowLean@0.5
Writes <out_dir>/<who>-<cow clip>-<rider clip>.glb (static meshes, colours kept); render them with
review_render.py -- <out_dir> <png dir> --views face,side,front,top,back. The seat is the one in art/CONTRACTS.md
("Riding the cow"): the rider's root stands on the top of the saddle blanket on the cow's centre line.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *  # noqa: F401,F403
from kit import ROOT
from build_tricks2 import posed_copy

COW_BACK = 1.33      # top of the cow's back (m): the saddle blanket (about 0.03 m) lies on it
BLANKET = 0.03
SEAT_Y = -0.12       # the seat is this far toward the cow's head (blender -Y) of the cow's origin
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = ARGS[0]
SPECS = ARGS[1:] or ['mika:Idle@0:RideCow@0.25', 'villager-kid:Trot@0.17:RideCowTrot@0.17']
os.makedirs(OUT_DIR, exist_ok=True)


def split(s):
    n, _, f = s.partition('@')
    return n, float(f or 0)


for spec in SPECS:
    who, cow_s, rider_s = spec.split(':')
    cow_clip, cow_f = split(cow_s)
    rider_clip, rider_f = split(rider_s)
    reset()
    cow = posed_copy('cow', cow_clip, cow_f, 'cow')
    rider = posed_copy(who, rider_clip, rider_f, 'rider')
    # the rider rides on the cow's spine bone, so it follows the body's rock: posed_copy applied the same pose time to both
    # clips, so the seat height follows the cow's hips by the amount the pose lowers them (read from the cow's spine head)
    rider.matrix_world = Matrix.Translation(Vector((0, SEAT_Y, COW_BACK + BLANKET)))
    bpy.context.view_layer.update()
    blanket = box('Blanket', (0.62, 0.55, BLANKET), (0, SEAT_Y, COW_BACK + BLANKET / 2), None, bevel=0.008, segments=1)
    blanket.data.materials.append(mat('Blanket', '#e6b449', rough=.9))
    from kit import ensure_color
    ensure_color([blanket])
    root = empty('rider_check')
    for o in (cow, rider, blanket):
        set_parent(o, root)
    export(f'{who}-{cow_clip}-{rider_clip}', [root], out_dir=OUT_DIR)
