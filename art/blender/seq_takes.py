# © 2026 Bui Cong Nguyen · solluxlabs.com
"""The dance-sequence takes (docs/SING-AND-PLAY.md "Dance sequences"): whole Mixamo takes retargeted onto Kotone's (or a
member's) Mixamo-65 rig, written raw (every key, no thinning, no loop cut) into one clip file for scripts/seq-bake.mjs,
which cuts the beat-measured loops on her own body and writes the game's lazy packs.

    blender -b --factory-startup --python art/blender/seq_takes.py -- --list .tools/seq/takes.json --out .tools/seq/raw/takes-kotone.glb
        [--member nam-1] [--moves <Mixamo FBX folder>] [--src <nu-2-mixamo65.glb>]

--list: [[clip name, FBX file stem, tile], ...]; tile > 1 repeats a cyclic take (its last frame is its first) that many
times before the cut (a short spin or uprock), as Avatar Studio's club motion tools do: the same frames, no new motion.
The retarget is vroid_mixamo.py's own (imported as a module, unchanged): each bone turns by the source bone's change from
its rest, the hips' travel scaled by the hip heights, the drift across the ground taken out.
"""
import bpy, sys, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vroid_mixamo as VM                     # (no side effects on import: its build runs only as __main__)


def cli():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'src': 'E:/repo/ktvgo_live/characters/glb/desktop-mixamo65-candidates/nu-2-mixamo65.glb',
         'moves': 'C:/repos/avatar-show-unity/Assets/Private/MotionLib/Clips', 'list': '', 'out': '', 'member': ''}
    k = None
    for x in a:
        if x.startswith('--'): k = x[2:]
        elif k: o[k] = x; k = None
    assert o['list'] and o['out'], '--list and --out are needed'
    if o['member']:
        assert o['member'] in VM.MEMBERS, f'unknown member {o["member"]}'
        o['src'] = o['src'].replace('nu-2-mixamo65', f'{o["member"]}-mixamo65')
    return o


def run(o):
    VM.MOVES = o['moves']
    if o['member']: VM.SCALE = VM.MEMBERS[o['member']]
    va, meshes = VM.import_source(o['src'])
    VM.rebuild_rig(va)
    for m in meshes: bpy.data.objects.remove(m, do_unlink=True)
    info = {}
    for name, stem, tile in json.load(open(o['list'])):
        opts = {'repeat': int(tile)} if int(tile) > 1 else {}
        fr, hp, inf = VM.retarget(va, os.path.join(o['moves'], stem + '.fbx'), opts)
        act, moving = VM.write_action(va, name, fr, hp)
        inf.update({'bones': len(moving), 'tile': int(tile), 'stem': stem})
        info[name] = inf
        print('TAKE', name, json.dumps(inf))
    va.animation_data.action = None
    bpy.context.scene.frame_set(1)
    os.makedirs(os.path.dirname(os.path.abspath(o['out'])), exist_ok=True)
    VM.export(o['out'], [va], va)
    json.dump(info, open(o['out'] + '.json', 'w'), indent=1)
    print('WROTE', o['out'], os.path.getsize(o['out']))


if __name__ == '__main__':
    run(cli())
