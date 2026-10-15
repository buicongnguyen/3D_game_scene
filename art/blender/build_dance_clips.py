"""Dance clips for people who already exist: Mika, the village kid, woman and man (clip-only GLBs, no mesh).

blender -b --factory-startup --python-exit-code 1 --python art/blender/build_dance_clips.py [-- --only mika,villager-kid]

Each file public/models/<name>-dance.glb holds the person's own skeleton (bone for bone, rest pose for rest pose the
same as <name>.glb and <name>.lite.glb) and the dance clips authored ON that skeleton with dance_anims.py, so the moves
fit a child's or a grown-up's proportions instead of being stretched from someone else's. The game adds these clips to
the person's Animator while the dance runs (AnimationMixer binds tracks by bone name). The standard models are never
touched: the builder runs as usual up to the clips, then this script takes over (its export is skipped).

    mika           festival + K-pop moves
    villager-kid   festival + K-pop moves + the crowd's Clap / StickWave
    villager-woman, villager-man   the crowd's Clap / StickWave
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = None
if '--only' in ARGV:
    ONLY = ARGV[ARGV.index('--only') + 1].split(',')
# build_characters runs its main() when imported: make it build nothing
sys.argv = [sys.argv[0], '--', '--only', 'none', '--no-portraits', '--no-blend']
import bpy
import anims
import dance_anims as DA
from kit import OUT, ROOT

SETS = {
    'mika': ('festival', 'kpop'),
    'villager-kid': ('festival', 'kpop', 'crowd'),
    'villager-woman': ('crowd',),
    'villager-man': ('crowd',),
}
CAPTURE = {}


def fake_clips(arm, body, who, names=None, extra=None, **style):
    """Stands in for anims.humanoid_clips while a standard builder runs: remembers the rig, authors nothing."""
    CAPTURE.update(arm=arm, body=body, who=who, style=style)
    return []


def fake_export(name, arm, extra=(), out_dir=None):
    CAPTURE['name'] = name
    return {'tris': 0, 'bytes': 0}


def head_box(arm, meshes):
    """(crown height, half width) of the head and hair as modelled, measured before the meshes go: a child's arms
    reach over the real hair (dance_anims.Rig), not over a guess from the head bone."""
    hz = arm.data.bones['head'].head_local.z
    pts = []
    for o in meshes:
        names = {g.index: g.name for g in o.vertex_groups}
        for v in o.data.vertices:
            w = sum(g.weight for g in v.groups if names.get(g.group, '').startswith(('head', 'hair')))
            if w > 0.5:
                co = o.matrix_world @ v.co
                if co.z > hz:
                    pts.append(co)
    if not pts:
        return None
    hw = max(abs(c.x) for c in pts)
    crown = max(c.z for c in pts if abs(c.x) > 0.25 * hw)
    print(f'HEAD BOX crown {crown:.3f} half width {hw:.3f}')
    return crown, hw


def clip_file(name):
    arm, body, style = CAPTURE['arm'], CAPTURE['body'], dict(CAPTURE['style'])
    style.pop('idle_hands', None)
    style.pop('talk_extra', None)
    # no meshes, no other actions: the file is the skeleton and the dance
    review = '--review' in ARGV
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent is arm]
    box = head_box(arm, meshes)
    if not review:
        for o in list(bpy.data.objects):
            if o is not arm and o.type in ('MESH', 'EMPTY', 'CURVE'):
                bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    A = anims.Anim(arm, body, name, **style)
    A.head_box = box
    table = DA.extras(A, SETS[name])
    names = [n for n in (DA.FESTIVAL + DA.KPOP + DA.CROWD) if n in table]
    anims.make_clips(A, names, table)
    from build_performers import export_glb
    if review:
        return export_glb(os.path.join(ROOT, '.tools', 'review', 'models', name + '-dancerev.glb'), arm, meshes)
    return export_glb(os.path.join(OUT, name + '-dance.glb'), arm, [])


def main():
    anims.humanoid_clips = fake_clips
    import build_characters as BC
    import npcs
    BC.export_rigged = fake_export
    npcs.export_rigged = fake_export
    import importlib
    for name in SETS:
        if ONLY and name not in ONLY:
            continue
        CAPTURE.clear()
        BC.BUILDERS[name]()
        info = clip_file(name)
        print(f'DANCE CLIPS {name}: {info["bytes"] // 1024} KB')


main()
