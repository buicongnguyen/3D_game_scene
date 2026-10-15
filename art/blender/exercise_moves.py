"""Morning exercise moves: the clips of the "Morning exercise" mini game (src/game/tricks/exercise.js), authored on
the shared humanoid skeleton and written as small clip packs that the game loads only when the round starts.

    blender.exe -b --factory-startup --python art/blender/exercise_moves.py [-- --only=rin,mika] [--clips=SideBend,Tree]
    blender.exe -b --factory-startup --python art/blender/exercise_moves.py -- --capture [--only=rin]

What is written
  * public/models/exercise-<person>.glb: the person's armature (no mesh) and one glTF animation per move. The bones,
    their rest pose and their names are those of public/models/<person>.glb to the bit, so the clips play on the
    standard AND the light model of that person (src/engine/people.js: same skeleton, same bone names). Nothing here
    touches a person's own file: the packs are fetched on demand, so the people the valley loads at start stay as
    light as they were.
  * Each pack is authored on that person's own body (hips, knees, ankles and wrists where that body has them), so feet
    stay planted and hands meet the floor on a child as on a grown-up. A person with no pack of their own (the dance
    teacher and the boy dancer when their models land) borrows the pack of the closest body; the runtime rescales the
    hips track (src/game/tricks/exercise-moves.js retargetClip).

Where the bodies come from
  --capture runs the real character builders (build_characters.py / npcs.py) with the clips, the ambient occlusion
  bake and the export switched off, and keeps each armature exactly as it was built (head, tail, roll, parent of every
  bone) in art/blender/source/exercise_rigs.json. A normal run rebuilds the armatures from that file in a second.
  Run --capture again whenever a person's body changes in the builders.

How a move is written
  A move is a function p (0..1 over the loop) -> Poser spec, like every clip of anims.py: rotations about armature
  axes, IK for the legs (ankle targets on the ground: feet never slide) and for the arms when a hand must meet
  something (the floor, the other hand, the hips). The count of a move lands on a pose: a loop of n counts reaches its
  count-k pose at p = k / n, so the game can play every move in time with its music (MOVES below lists the counts).
  Axis reminders (rig.py): the rig faces -Y, its left is +X; +X on spine/head bends forward; -Y on the spine bends to
  the LEFT; +Z turns left; upper arms through Anim.arm_rot (fwd swings forward, out raises sideways).
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
RIGS = os.path.join(HERE, 'source', 'exercise_rigs.json')
MODELS = os.path.join(ROOT, 'public', 'models')
PEOPLE = ['rin', 'mika', 'villager-kid', 'villager-man']

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OPTS = dict(a.lstrip('-').split('=', 1) for a in ARGV if '=' in a)
FLAGS = {a.lstrip('-') for a in ARGV if '=' not in a}
ONLY = [s for s in OPTS.get('only', ','.join(PEOPLE)).split(',') if s]


# ---------------------------------------------------------------------------------------------------- capture
def capture(names):
    """Run the character builders with clips, AO and export switched off; keep every armature as built."""
    import rig
    import anims
    got = {}
    real_skin = rig.skin

    def skin(parts, arm, name, ao=None):
        return real_skin(parts, arm, name, ao=None)

    def clips(arm, body, who, names=None, extra=None, **style):
        bpy.context.view_layer.objects.active = arm
        for o in bpy.context.selected_objects:
            o.select_set(False)
        arm.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bones = [[e.name, list(e.head), list(e.tail), e.parent.name if e.parent else None, math.degrees(e.roll)]
                 for e in arm.data.edit_bones]
        bpy.ops.object.mode_set(mode='OBJECT')
        keep = {k: v for k, v in style.items() if isinstance(v, (int, float, str, bool))}
        got[who] = dict(arm=arm.name, H=body.H, style=keep, bones=bones)
        print(f'CAPTURED {who}: {len(bones)} bones, H={body.H}')
        return []

    def export(name, arm, extra=(), out_dir=None):
        return dict(tris=0, bytes=0)

    rig.skin, anims.humanoid_clips, rig.export_rigged = skin, clips, export
    sys.argv = [sys.argv[0], '--', '--only', ','.join(names), '--no-portraits', '--no-blend']
    import build_characters  # noqa: F401  (runs its main(): every builder named in --only)
    old = {}
    if os.path.exists(RIGS):
        with open(RIGS) as f:
            old = json.load(f)
    old.update(got)
    os.makedirs(os.path.dirname(RIGS), exist_ok=True)
    with open(RIGS, 'w') as f:
        json.dump(old, f, indent=1)
    print('WROTE', RIGS, sorted(old))


if 'capture' in FLAGS:
    capture(ONLY)
    raise SystemExit(0)

# ---------------------------------------------------------------------------------------------------- the moves
from mathutils import Vector, Quaternion  # noqa: E402
from human_lib import record, eul, clamp, smooth, lerp  # noqa: E402
import rig  # noqa: E402
import anims  # noqa: E402
from anims import Anim, sn, cs, env, bump, add, ease  # noqa: E402

V = Vector


# ---------------------------------------------------------------------------------------------------- pipeline
class BodyRef:
    """What Anim needs of a body: its height (Anim scales its offsets by H / 1.45)."""
    def __init__(self, H):
        self.H = H


def rebuild(rec):
    """The person's armature from the captured bones: the same heads, tails, rolls and parents, so the same rest."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bones = [(b[0], tuple(b[1]), tuple(b[2]), b[3], b[4]) for b in rec['bones']]
    return rig.build_armature(rec['arm'], bones)


FAST = {'ExJump', 'ExStarJump', 'ExHighKnees', 'ExMarch'}
SLOW = {'ExMountain', 'ExPlank', 'ExCobra', 'ExChild', 'ExToeReach', 'ExCatCow', 'ExBreath', 'ExTreeL', 'ExTreeR',
        'ExWarriorL', 'ExWarriorR', 'ExBirdL', 'ExBirdR'}


def record_moves(arm, A, table, names):
    """Keys: every frame for the quick hops and steps, every second frame for the rest, every fourth for the slow
    holds (the runtime blends between keys; a pack stays small)."""
    out = []
    for n in names:
        frames, fn, loop, _ = table[n]
        step = 1 if n in FAST else 4 if n in SLOW else 2
        record_step(arm, A.P, n, frames, fn, loop, step)
        out.append((n, frames, loop))
    return out


def record_step(arm, poser, name, frames, pose_fn, loop=True, step=1):
    """human_lib.record keyed every `step` frames (slow holds need no 30 keys a second; the runtime interpolates)."""
    if step <= 1:
        return record(arm, poser, name, frames, pose_fn, loop=loop)
    keys = sorted(set(list(range(0, frames, step)) + [frames]))
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    prev = {}
    for f in keys:
        p = 0.0 if loop and f == frames else f / frames
        spec = pose_fn(p)
        res = poser.solve(spec)
        for n in poser.order:
            q, t = res[n]
            R = poser.R[n]
            ql = R.inverted() @ q @ R
            if n in prev and prev[n].dot(ql) < 0:
                ql = -ql
            prev[n] = ql
            pb = arm.pose.bones[n]
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = ql
            pb.keyframe_insert('rotation_quaternion', frame=f)
            if n == 'hips':
                pb.location = R.to_matrix().inverted() @ t
                pb.keyframe_insert('location', frame=f)
    act.use_frame_range = True
    act.frame_start, act.frame_end = 0, frames
    act.use_cyclic = loop
    from human_lib import _fcurves
    for fc in _fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    arm.animation_data.action = None
    return act


def export_pack(name, arm, out_dir):
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.selected_objects:
        o.select_set(False)
    arm.select_set(True)
    if arm.animation_data:
        arm.animation_data.action = None
    path = os.path.join(out_dir, name + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_normals=False, export_cameras=False, export_lights=False, export_materials='NONE',
        export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=False, export_optimize_animation_size=True, export_reset_pose_bones=True,
        export_def_bones=False, export_frame_range=False, export_extras=False)
    print(f'EXPORTED {name}: {os.path.getsize(path) // 1024} KB')
    return path


# ---------------------------------------------------------------------------------------------------- helpers
STANCE = 0.035          # each foot this far (x k) outside its rest place: the same stance in every standing move,
                        # so one move blends into the next without a foot sliding
FPC = 18                # frames per count at the authored tempo (100 counts a minute); the game scales to its own


def kc(u, keys, n):
    """A value keyed on counts: [(count, value), ...] (the first at count 0) over a loop of n counts, eased in and out
    at every key, so a pose is reached on its count and left from there."""
    u %= n
    ks = sorted(keys)
    assert ks[0][0] == 0, keys
    ks = ks + [(n, ks[0][1])]
    for (a, va), (b, vb) in zip(ks, ks[1:]):
        if a <= u <= b:
            t = (u - a) / max(b - a, 1e-6)
            return va + (vb - va) * t * t * (3 - 2 * t)
    return ks[-1][1]


def mixr(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def stand(A, p, breathe=0.6, k_cycles=1):
    """The exercise stance: a calm breath, no weight shift, no look-around, feet a little apart."""
    s = A.standing({}, (p * k_cycles) % 1, breathe=breathe, shift=0.0, lk=0.0)
    for S in 'LR':
        foot(A, s, S)
    return s


def foot(A, s, S, dx=0.0, dy=0.0, dz=0.0, heel=0.0, yaw=0.0, pole=None, wide=STANCE):
    """Plant a foot: the stance place plus an offset (metres x k). heel: degrees the heel is lifted, the foot turning
    about its toe (the toe stays where it is); yaw: the foot turned out (+ turns to the character's left)."""
    k, sx = A.k, A.sx(S)
    off = V((sx * wide * k + dx * k, dy * k, dz * k))
    ank = A.ank[S] + off
    if heel:
        toe_y = A.toe[S].y - 0.03 * k
        piv = V((ank.x, toe_y + dy * k, dz * k))
        rel = V((0, A.ank[S].y - toe_y, A.ank[S].z))
        ank = piv + Quaternion((1, 0, 0), math.radians(heel)) @ rel
    s.setdefault('ik', {})['leg_' + S] = dict(target=ank, end=eul((heel, 0, yaw)), pole=pole or (sx * 0.15, -1, 0.0))
    return ank


def arm(A, s, S, fwd=0.0, out=0.0, twist=0.0, elbow=8.0, hand=(-4, 0, 0), elbow_in=0.0):
    """An FK arm: the upper arm through Anim.arm_rot, the elbow bent `elbow` degrees (forward), the hand."""
    s['upperarm_' + S] = A.arm_rot(S, fwd=fwd, out=out, twist=twist)
    s['forearm_' + S] = (-elbow, 0, A.sx(S) * elbow_in)
    s['hand_' + S] = (hand[0], hand[1] * A.sx(S), hand[2] * A.sx(S))


def hips_world(A, s):
    """Posed positions of the hip joints, shoulders and chest for a spec (its rotations and the hips offset)."""
    tmp = {key: val for key, val in s.items() if key != 'ik'}
    A.P.solve(tmp)
    return {n: A.P.world(n) for n in ('thigh_L', 'thigh_R', 'upperarm_L', 'upperarm_R', 'neck', 'head', 'chest')}


def lift_target(A, s, S, thigh, knee, foot_pitch=10.0):
    """The ankle place of a leg lifted by FK angles (thigh forward, knee bent back), for an IK target, and its end."""
    J = hips_world(A, s)
    hp = J['thigh_' + S]
    qh = eul(s.get('hips', (0, 0, 0)))
    qt = qh @ eul((-thigh, 0, 0))
    kn = hp + qt @ (A.knee[S] - A.hip[S])
    qs = qt @ eul((knee, 0, 0))
    an = kn + qs @ (A.ank[S] - A.knee[S])
    return an, (-thigh + knee + foot_pitch, 0, 0)


def leg_to(A, s, S, target, end=(0, 0, 0), pole=None):
    s.setdefault('ik', {})['leg_' + S] = dict(target=V(target), end=eul(end), pole=pole or (A.sx(S) * 0.15, -1, 0.0))


def arm_to_world(A, s, S, target, pole=None, end=None, end_rel=(0, 0, 0)):
    g = dict(target=V(target), pole=pole or (A.sx(S) * 0.6, 0.6, -0.5), end_rel=end_rel)
    if end is not None:
        g['end'] = end
    s.setdefault('ik', {})['arm_' + S] = g


def hair(A, s, p, amp=0.6, drag=0.0, k=2, up=0.0, hang=0.0):
    """Scarf, hair and hat follow-through (Anim.secondary). hang: degrees the scarf and the hair fall forward when the
    body is folded over (they would otherwise stick up behind the back as if starched)."""
    A.secondary(s, p, drag=drag, k=k, amp=amp, up=up)
    if hang:
        for bone, share in (('scarf_1', 0.6), ('scarf_2', 0.45), ('hair_1', 0.25), ('hair_2', 0.35)):
            if bone in s:
                s[bone] = add(s[bone], (-hang * share, 0, 0))


class ChestPt:
    """An IK target carried by the chest (a hand that stays in front of the heart while the body moves)."""
    def __init__(self, v):
        self.v = V(v)

    def __call__(self, P, D):
        return P.apply(D['chest'], self.v)


def chest_pt(A, x, y, z, S='R'):
    """A chest-space point (x given for the RIGHT hand and mirrored for the left; y < 0 is in front)."""
    return ChestPt(A.L(x, y, z, S))


def knee_of(A, s, S):
    """Where the IK puts a knee for this spec (the same two-bone sum as human_lib.Poser._ik)."""
    J = hips_world(A, s)
    g = s['ik']['leg_' + S]
    H, T = J['thigh_' + S], V(g['target'])
    l1 = (A.knee[S] - A.hip[S]).length
    l2 = (A.ank[S] - A.knee[S]).length
    dv = T - H
    d = clamp(dv.length, abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995)
    nrm = dv.normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    hh = math.sqrt(max(l1 * l1 - a * a, 0))
    pole = V(g.get('pole', (0, -1, 0)))
    m = pole - nrm * pole.dot(nrm)
    m.normalize()
    return H + nrm * a + m * hh


def fk_arms_to_ik(A, s, sides='LR'):
    """Turn FK arms into IK ones that hold the same pose (world targets): a pose can then blend into one whose hands
    are placed (on the floor, on the knees, palm to palm)."""
    ik = s.setdefault('ik', {})
    todo = [S for S in sides if 'arm_' + S not in ik]
    if not todo:
        return s
    tmp = {key: val for key, val in s.items() if key != 'ik'}
    tmp['ik'] = {key: val for key, val in ik.items() if key.startswith('leg')}
    A.P.solve(tmp)
    D = A.P.D
    for S in todo:
        sh, el, wr = A.P.world('upperarm_' + S), A.P.world('forearm_' + S), A.P.world('hand_' + S)
        mid = (sh + wr) / 2
        pole = el - mid
        if pole.length < 1e-4:
            pole = V((A.sx(S) * 0.6, 0.6, -0.5))
        ik['arm_' + S] = dict(target=wr, pole=tuple(pole.normalized()), end=D['hand_' + S][0].copy())
    return s


def _val(t, P, D):
    return t(P, D) if callable(t) else V(t)


def _mix_target(ta, tb, w, lift=0.0, arc=0.0):
    if isinstance(ta, ChestPt) and isinstance(tb, ChestPt) and not lift:
        return ChestPt(ta.v.lerp(tb.v, w))
    if not callable(ta) and not callable(tb):
        return V(ta).lerp(V(tb), w) + V((0, 0, lift * arc))
    return lambda P, D: _val(ta, P, D).lerp(_val(tb, P, D), w) + V((0, 0, lift * arc))


def _q(e):
    return e if isinstance(e, Quaternion) else eul(e)


def blend(a, b, t, timing=None, lifts=None):
    """A pose between two specs. timing: {'leg_L': (t0, t1), 'arm_R': ...} moves that limb only inside that part of
    the blend (one hand after the other); lifts: {'leg_L': metres} lifts it off the ground on the way (no sliding)."""
    timing, lifts = timing or {}, lifts or {}
    out = {}
    for key in set(a) | set(b):
        if key == 'ik':
            continue
        zero = (0, 0, 0)
        va, vb = a.get(key, zero), b.get(key, zero)
        if va is None:
            va = zero
        if vb is None:
            vb = zero
        if isinstance(va, Quaternion) or isinstance(vb, Quaternion):
            out[key] = _q(va).slerp(_q(vb), t)
        else:
            out[key] = mixr(va, vb, t)
    ia, ib = a.get('ik', {}), b.get('ik', {})
    ik = {}
    for ch in set(ia) | set(ib):
        ga, gb = ia.get(ch), ib.get(ch)
        assert ga and gb, f'{ch} is IK on one side of a blend only'
        t0, t1 = timing.get(ch, (0.0, 1.0))
        w = smooth(clamp((t - t0) / max(t1 - t0, 1e-6)))
        arc = math.sin(math.pi * w) if lifts.get(ch) else 0.0
        g = dict(target=_mix_target(ga['target'], gb['target'], w, lifts.get(ch, 0.0), arc))
        g['pole'] = tuple(V(ga.get('pole', (0, 1, 0))).lerp(V(gb.get('pole', (0, 1, 0))), w))
        if 'end' in ga or 'end' in gb:
            ea, eb = ga.get('end', Quaternion()), gb.get('end', Quaternion())
            if callable(ea) or callable(eb):
                g['end'] = eb if w > 0.5 else ea
            else:
                g['end'] = _q(ea).slerp(_q(eb), w)
        else:
            g['end_rel'] = _q(ga.get('end_rel', (0, 0, 0))).slerp(_q(gb.get('end_rel', (0, 0, 0))), w)
        ik[ch] = g
    out['ik'] = ik
    return out


def seq(keys, timing=None, lifts=None):
    """A one-shot move through key poses: keys = [(t, fn(p) -> spec), ...] with t from 0 to 1. Between two keys the
    pose blends (eased); timing / lifts per segment index as in blend()."""
    timing, lifts = timing or {}, lifts or {}

    def pose(p):
        for i, ((ta, fa), (tb, fb)) in enumerate(zip(keys, keys[1:])):
            if p <= tb or i == len(keys) - 2:
                u = clamp((p - ta) / max(tb - ta, 1e-6))
                return blend(fa(p), fb(p), smooth(u), timing.get(i), lifts.get(i))
        return keys[-1][1](p)
    return pose


TAU = math.tau


def rise(A, s, heel):
    """Lift both heels by `heel` degrees and the hips with them (the legs stay as long as they were)."""
    if not heel:
        return
    a0 = foot(A, s, 'L')
    a1 = foot(A, s, 'L', heel=heel)
    foot(A, s, 'R', heel=heel)
    x, y, z = s['hips@loc']
    s['hips@loc'] = (x, y, z + (a1.z - a0.z) * 0.92)


# ================================================================ Morning exercise (the radio-exercise kind)
def stretch(A):
    """Stretch up (4 counts): arms swing up in front to overhead and the heels lift on 1, stay up on 2, come down in
    front on 3 and hang by 4."""
    n = 4

    def pose(p):
        u = p * n
        up = kc(u, [(0, 0), (1, 1), (2, 1), (3, 0.32)], n)
        toes = kc(u, [(0, 0), (1, 1), (2, 0.7), (3, 0)], n)
        s = stand(A, p, 0.3)
        s['spine'] = add(s['spine'], (-2 * up, 0, 0))
        s['chest'] = add(s['chest'], (-4 * up, 0, 0))
        s['neck'] = add(s['neck'], (-3 * up, 0, 0))
        s['head'] = (-9 * up, 0, 0)
        for S in 'LR':
            arm(A, s, S, fwd=156 * up, out=3 - 26 * up, twist=0, elbow=10 - 4 * up, hand=(-6 - 4 * up, 0, 0))
        rise(A, s, 13 * toes)
        hair(A, s, p, 0.5, up=-6 * up)
        return s
    return n * FPC, pose, True, 1


def arm_swing(A):
    """Arm swings (2 counts): the arms swing down and out while the knees give a little (count 0), then up in front,
    crossing at the chest, legs straight (count 1)."""
    n = 2

    def pose(p):
        u = p * n
        c = kc(u, [(0, 0), (1, 1)], n)                 # 0 down-out, 1 crossed in front
        bend = kc(u, [(0, 1), (0.6, 0.2), (1, 0), (1.5, 0.4)], n)
        s = stand(A, p, 0.3)
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x, y + 0.01 * A.k * bend, z - 0.045 * A.k * bend)
        s['hips'] = add(s['hips'], (5 * bend, 0, 0))
        s['spine'] = add(s['spine'], (2 * bend, 0, 0))
        s['head'] = add(s['head'], (-4 * bend, 0, 0))
        for S in 'LR':
            hi = 1 if S == 'L' else 0
            arm(A, s, S, fwd=-12 + (90 + 6 * hi) * c, out=38 - 62 * c, twist=0, elbow=10 + 8 * c, hand=(-6, 0, 0))
        hair(A, s, p, 0.6, k=2)
        return s
    return n * FPC, pose, True, 1


def arm_circle(A):
    """Arm circles (2 counts): both arms go round, up past the front to overhead on count 1 and down past the sides
    and a little behind to the bottom on count 0; the knees give at the bottom."""
    n = 2

    def pose(p):
        u = p * n
        th = math.pi * u
        el = 0.5 - 0.5 * math.cos(th)                   # 0 at the bottom, 1 at the top
        s = stand(A, p, 0.3)
        bend = 0.5 + 0.5 * math.cos(th)
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x, y, z - 0.03 * A.k * bend ** 3)
        s['head'] = add(s['head'], (-5 * el, 0, 0))
        for S in 'LR':
            arm(A, s, S, fwd=28 * math.sin(th), out=6 + 134 * el, twist=-30 * el, elbow=8, hand=(-4 - 6 * el, 0, 0))
        hair(A, s, p, 0.5)
        return s
    return n * FPC, pose, True, 1


def side_bend(A):
    """Side bends (4 counts): upright on 0, bend to the left with the right arm over the head on 1, upright on 2,
    bend to the right with the left arm over on 3. Feet stay put; the hips move a little the other way."""
    n = 4

    def pose(p):
        u = p * n
        b = kc(u, [(0, 0), (1, 1), (2, 0), (3, -1)], n)      # + bends to the left
        L, R = max(b, 0), max(-b, 0)
        s = stand(A, p, 0.3)
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x - 0.022 * A.k * b, y, z - 0.004 * A.k * abs(b))
        s['hips'] = add(s['hips'], (0, -3 * b, 0))
        s['spine'] = add(s['spine'], (1 * abs(b), -11 * b, 0))
        s['chest'] = add(s['chest'], (1 * abs(b), -12 * b, 0))
        s['neck'] = add(s['neck'], (0, -4 * b, 0))
        s['head'] = add(s['head'], (0, -2 * b, 0))
        # the arm on the far side reaches over the head, the near one hangs along the leg
        arm(A, s, 'R', fwd=4 * L, out=4 + 146 * L - 2 * R, twist=0, elbow=8 + 18 * L, hand=(-4, 0, 6 * L))
        arm(A, s, 'L', fwd=4 * R, out=4 + 146 * R - 2 * L, twist=0, elbow=8 + 18 * R, hand=(-4, 0, 6 * R))
        hair(A, s, p, 0.6)
        return s
    return n * FPC, pose, True, 1


def twist(A):
    """Twists (4 counts): facing front on 0, turned to the left on 1 (the arms swing round with the body), front on 2,
    to the right on 3. Feet stay put; the knees give a little at each turn."""
    n = 4

    def pose(p):
        u = p * n
        tw = kc(u, [(0, 0), (1, 1), (2, 0), (3, -1)], n)     # + turns to the left
        L, R = max(tw, 0), max(-tw, 0)
        s = stand(A, p, 0.3)
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x, y, z - 0.02 * A.k * abs(tw))
        s['hips'] = add(s['hips'], (2 * abs(tw), 0, 7 * tw))
        s['spine'] = add(s['spine'], (0, 0, 12 * tw))
        s['chest'] = add(s['chest'], (0, 0, 14 * tw))
        s['neck'] = add(s['neck'], (0, 0, 6 * tw))
        s['head'] = add(s['head'], (0, 0, 6 * tw))
        # the leading arm swings out to its side, the other folds across the chest
        arm(A, s, 'L', fwd=-12 * L + 70 * R, out=6 + 62 * L - 16 * R, twist=0, elbow=10 + 4 * L + 78 * R, hand=(-4, 0, 0))
        arm(A, s, 'R', fwd=-12 * R + 70 * L, out=6 + 62 * R - 16 * L, twist=0, elbow=10 + 4 * R + 78 * L, hand=(-4, 0, 0))
        hair(A, s, p, 0.7)
        return s
    return n * FPC, pose, True, 1


def knee_bend(A):
    """Knee bends (2 counts): hands on the knees, back long and leaning forward; knees bend on count 1 and straighten
    on 0. The hands ride on the knees."""
    n = 2

    def pose(p):
        u = p * n
        d = kc(u, [(0, 0), (1, 1)], n)
        k = A.k
        s = stand(A, p, 0.2)
        s['hips@loc'] = (0, 0.035 * k + 0.035 * k * d, -0.012 * k - 0.11 * k * d)
        s['hips'] = (20 + 6 * d, 0, 0)
        s['spine'] = (8, 0, 0)
        s['chest'] = (4, 0, 0)
        s['neck'] = (-12, 0, 0)
        s['head'] = (-14, 0, 0)
        for S in 'LR':
            foot(A, s, S, pole=(A.sx(S) * 0.2, -1, 0.1))
        for S in 'LR':
            kn = knee_of(A, s, S)
            arm_to_world(A, s, S, kn + V((-A.sx(S) * 0.005 * k, -0.045 * k, 0.045 * k)), pole=(A.sx(S), 0.5, -0.3),
                         end=eul((-50, 0, A.sx(S) * 6)))
        hair(A, s, p, 0.4, drag=6)
        return s
    return n * FPC, pose, True, 1


def jump(A):
    """Little jumps on the spot (2 counts, a hop on every count): down in a small crouch on each count, up in the air
    half way. Low and bouncy, landing on the same spot."""
    n = 2

    def pose(p):
        u = p * n
        f = u % 1
        crouch = max(0.0, math.cos(TAU * f)) ** 2
        air = max(0.0, -math.cos(TAU * f)) ** 1.2
        k = A.k
        hz = -0.045 * k * crouch + 0.075 * k * air * A.st.get('bounce', 1.0) ** 0.5
        s = stand(A, p, 0.2)
        s['hips@loc'] = (0, 0, hz - 0.004 * k)
        s['hips'] = (7 * crouch - 2 * air, 0, 0)
        s['spine'] = (4 * crouch - 3 * air, 0, 0)
        s['head'] = (-3 * crouch + 3 * air, 0, 2 * math.sin(math.pi * u))
        for S in 'LR':
            foot(A, s, S, dz=max(0.0, hz / k) * 0.85, heel=16 * air)
            arm(A, s, S, fwd=10 * air - 8 * crouch, out=12 + 22 * air, elbow=30 + 10 * air, hand=(-8, 0, 0))
        hair(A, s, p, 1.2, k=2, up=-18 * air)
        return s
    return n * FPC, pose, True, 1


def breath(A):
    """Deep breath (4 counts): breathe in while the arms float up at the sides to overhead (counts 0-2), breathe out
    while they float down (2-4). The chest lifts with the breath."""
    n = 4

    def pose(p):
        u = p * n
        up = kc(u, [(0, 0), (2, 1)], n)
        s = stand(A, p, 0.2)
        s['spine'] = add(s['spine'], (-2 * up, 0, 0))
        s['chest'] = add(s['chest'], (-5 * up, 0, 0))
        s['neck'] = add(s['neck'], (-3 * up, 0, 0))
        s['head'] = (-7 * up, 0, 0)
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x, y, z + 0.004 * A.k * up)
        for S in 'LR':
            arm(A, s, S, fwd=6 * up, out=6 + 132 * up, twist=-34 * up, elbow=10 + 4 * up, hand=(-4 - 6 * up, 0, 0))
        hair(A, s, p, 0.3)
        return s
    return n * FPC, pose, True, 2


# ================================================================ Workout for kids
def march(A, high=False):
    """March on the spot (2 counts): the left knee up on 0, the right knee up on 1, arms swinging bent at the elbow.
    high: high knees, the knees to the hips, a little spring off the standing foot and bigger arm pumps."""
    n = 2
    TH, KN = (82, 92) if high else (60, 72)

    def pose(p):
        u = p * n
        lift = {'L': max(0.0, math.cos(math.pi * u)) ** 1.15, 'R': max(0.0, math.cos(math.pi * (u - 1))) ** 1.15}
        k = A.k
        s = stand(A, p, 0.3, k_cycles=2)
        bob = 0.022 * k * (lift['L'] + lift['R']) if high else 0.0
        x, y, z = s['hips@loc']
        s['hips@loc'] = (x - 0.016 * k * (lift['L'] - lift['R']), y, z + bob)
        s['hips'] = add(s['hips'], (-2 if high else 0, 2.5 * (lift['L'] - lift['R']), 0))
        s['spine'] = add(s['spine'], (2 if high else 0, 0, 3 * (lift['L'] - lift['R'])))
        for S in 'LR':
            o = 'R' if S == 'L' else 'L'
            base = foot(A, s, S, heel=9 * lift[o] if high else 0.0)
            g = s['ik']['leg_' + S]
            if lift[S] > 1e-4:
                up, end = lift_target(A, s, S, TH * lift[S], KN * lift[S], foot_pitch=12 * lift[S])
                zero, _ = lift_target(A, s, S, 0, 0)
                g['target'] = V(base) + (up - zero)
                g['end'] = eul(end)
                g['pole'] = (A.sx(S) * 0.12, -1, 0.15)
        for S in 'LR':
            o = 'R' if S == 'L' else 'L'
            sw = lift[o] - lift[S]
            arm(A, s, S, fwd=6 + (46 if high else 30) * sw, out=8, elbow=(88 if high else 72) + 6 * abs(sw), hand=(-6, 0, 0))
        hair(A, s, p, 0.9 if high else 0.6, k=2)
        return s
    return n * FPC, pose, True, 1


def star_jump(A):
    """Star jumps (2 counts): feet together and arms down on 0, a star on 1 (feet wide, arms up in a V); a little
    hop between them, landing softly."""
    n = 2

    def pose(p):
        u = p * n
        f = u % 1
        crouch = max(0.0, math.cos(TAU * f)) ** 2
        air = max(0.0, -math.cos(TAU * f)) ** 1.2
        half = smooth(clamp((f - 0.22) / 0.56))
        w = half if u < 1 else 1 - half
        k = A.k
        hz = -0.04 * k * crouch + 0.075 * k * air
        s = stand(A, p, 0.2)
        s['hips@loc'] = (0, 0, hz - 0.004 * k)
        s['hips'] = (5 * crouch, 0, 0)
        s['spine'] = (3 * crouch - 2 * air, 0, 0)
        s['head'] = (-4 * air, 0, 0)
        for S in 'LR':
            foot(A, s, S, dx=A.sx(S) * 0.12 * w, dz=max(0.0, hz / k) * 0.85, heel=14 * air,
                 pole=(A.sx(S) * (0.15 + 0.3 * w), -1, 0))
            arm(A, s, S, fwd=4, out=8 + 128 * w, twist=-28 * w, elbow=12 - 4 * w, hand=(-6, 0, 0))
        hair(A, s, p, 1.2, k=2, up=-16 * air)
        return s
    return n * FPC, pose, True, 1


def squat(A):
    """Squats (4 counts): standing on 0, down on 1 with the arms out in front (hips back, chest up, heels down),
    stay low on 2, come up by 3 and stand on 0."""
    n = 4

    def pose(p):
        u = p * n
        d = kc(u, [(0, 0), (1, 1), (2, 1), (3, 0.35)], n)
        k = A.k
        s = stand(A, p, 0.3)
        s['hips@loc'] = (0, 0.1 * k * d, -0.004 * k - 0.17 * k * d)
        s['hips'] = (30 * d, 0, 0)
        s['spine'] = (6 * d, 0, 0)
        s['chest'] = (2 * d, 0, 0)
        s['neck'] = (-12 * d, 0, 0)
        s['head'] = (-14 * d, 0, 0)
        for S in 'LR':
            foot(A, s, S, pole=(A.sx(S) * 0.3, -1, 0.1))
            arm(A, s, S, fwd=4 + 84 * d, out=6 - 4 * d, elbow=8, hand=(-6, 0, 0))
        hair(A, s, p, 0.4)
        return s
    return n * FPC, pose, True, 1


def toe_reach(A):
    """Stretch: a gentle forward fold with soft knees, the hands hanging down toward the shins; breathing slowly
    (a hold of 4 counts that loops)."""
    n = 4

    def pose(p):
        k = A.k
        br = math.sin(TAU * p)
        s = stand(A, p, 0.2)
        s['hips@loc'] = (0, 0.07 * k, -0.035 * k)
        s['hips'] = (58 + 2 * br, 0, 0)
        s['spine'] = (16, 0, 0)
        s['chest'] = (10 + br, 0, 0)
        s['neck'] = (4, 0, 0)
        s['head'] = (6, 0, 0)
        for S in 'LR':
            foot(A, s, S, pole=(A.sx(S) * 0.2, -1, 0.1))
        for S in 'LR':
            sx = A.sx(S)
            arm_to_world(A, s, S, (A.ank[S].x + sx * (STANCE - 0.01) * k, A.ank[S].y - 0.07 * k, 0.24 * k - 0.012 * k * br),
                         pole=(sx * 0.4, 1, 0.1), end=eul((-8, 0, sx * 4)))
        hair(A, s, p, 0.2, drag=0, hang=60)
        return s
    return n * FPC, pose, True, 2


# ---------------------------------------------------------------- the floor: kneeling, hands and knees
KNEE_H = 0.05           # knee joint above the floor when kneeling (x k)
ANK_LIE = 0.048         # ankle joint above the floor when the top of the foot lies on it
FOOT_TOP = 148          # the foot's pitch then (toes pointing back, sole up)
WRIST_H = 0.034         # wrist above the floor with the palm flat
HAND_FLAT = (-90, 0, 0)  # the hand's turn for a palm flat on the floor, fingers forward
TUCK = 72               # heel lift (about the toe) when kneeling with the toes tucked under
CHILD_HEAD = 0.2       # the head joint (the base of the skull) above the floor in the child's pose: forehead down


def _lens(A, S='L'):
    return (A.knee[S] - A.hip[S]).length, (A.ank[S] - A.knee[S]).length


def place_hips(A, s, at):
    """Move the hips so that the middle of the two hip joints lands on `at`."""
    J = hips_world(A, s)
    mid = (J['thigh_L'] + J['thigh_R']) / 2
    x, y, z = s.get('hips@loc', (0, 0, 0))
    d = V(at) - mid
    s['hips@loc'] = (x + d.x, y + d.y, z + d.z)


def knee_spot(A, S):
    """Where a knee rests on the floor when kneeling: in front of the standing foot, so that the toes tucked under
    stay on the very spot they stood on (no foot moves on the way down)."""
    k = A.k
    tucked = foot(A, {}, S, heel=TUCK)
    l_th, l_sh = _lens(A, S)
    kz = KNEE_H * k
    ky = tucked.y - math.sqrt(max(l_sh ** 2 - (tucked.z - kz) ** 2, 1e-6)) * 0.995
    return V((tucked.x, ky, kz)), tucked


def kneel_legs(A, s, tucked=False):
    """Both knees on the floor at their spots, shins along the floor behind; feet flat on their tops (or tucked)."""
    k = A.k
    for S in 'LR':
        K, tk = knee_spot(A, S)
        l_th, l_sh = _lens(A, S)
        if tucked:
            target, end = tk, eul((TUCK, 0, 0))
        else:
            az = ANK_LIE * k
            target = V((K.x, K.y + math.sqrt(max(l_sh ** 2 - (K.z - az) ** 2, 1e-6)) * 0.995, az))
            end = eul((FOOT_TOP, 0, 0))
        s.setdefault('ik', {})['leg_' + S] = dict(target=target, end=end, pole=(A.sx(S) * 0.05, -1, -1))
    return [knee_spot(A, S)[0] for S in 'LR']


_FOURS = {}


def copy_spec(s):
    out = {}
    for key, v in s.items():
        out[key] = {c: dict(g) for c, g in v.items()} if key == 'ik' else v
    return out


def hands_down(A, s, hands, pole=None):
    for S in 'LR':
        arm_to_world(A, s, S, hands[S], pole=pole or (A.sx(S) * 0.35, 1, 0.25), end=eul(HAND_FLAT))


def under_shoulders(A, s):
    k = A.k
    J = hips_world(A, s)
    return {S: V((J['upperarm_' + S].x + A.sx(S) * 0.012 * k, J['upperarm_' + S].y - 0.01 * k, WRIST_H * k)) for S in 'LR'}


def fours_base(A):
    """Hands and knees, back flat (worked out once per body): hips over the knees, shoulders over the hands, the hands
    as low as the arms reach with the elbows soft. Returns (spec, hands {S: Vector})."""
    key = id(A)
    if key in _FOURS:
        return _FOURS[key]
    k = A.k
    s = stand(A, 0.0, 0.0)
    knees = kneel_legs(A, s)
    l_th, _ = _lens(A)
    hip_at = V((0, (knees[0].y + knees[1].y) / 2, KNEE_H * k + l_th * 0.985))
    s['spine'], s['chest'], s['neck'], s['head'] = (2, 0, 0), (2, 0, 0), (-24, 0, 0), (-16, 0, 0)
    lo, hi = 40.0, 105.0
    for _ in range(26):
        th = (lo + hi) / 2
        s['hips'], s['hips@loc'] = (th, 0, 0), (0, 0, 0)
        place_hips(A, s, hip_at)
        J = hips_world(A, s)
        if (J['upperarm_L'].z + J['upperarm_R'].z) / 2 - WRIST_H * k > 0.93 * A.l_arm:
            lo = th
        else:
            hi = th
    _FOURS[key] = (s, under_shoulders(A, s))
    return _FOURS[key]


def fours(A, p=0.0, cow=0.0, breathe=1.0):
    """Hands and knees; cow > 0 arches the back down with the head up (the cow), cow < 0 rounds it with the head down
    (the cat). Hands and knees never move."""
    base, hands = fours_base(A)
    s = copy_spec(base)
    br = 0.6 * math.sin(TAU * p) * breathe
    c, t = max(cow, 0.0), max(-cow, 0.0)
    s['hips'] = (base['hips'][0] + 7 * c - 7 * t, 0, 0)
    s['spine'] = (2 - 11 * c + 12 * t + br, 0, 0)
    s['chest'] = (2 - 6 * c + 8 * t, 0, 0)
    s['neck'] = (-24 - 10 * c + 16 * t, 0, 0)
    s['head'] = (-16 - 8 * c + 8 * t, 0, 0)
    J = hips_world(A, base)
    place_hips(A, s, (J['thigh_L'] + J['thigh_R']) / 2)
    hands_down(A, s, hands)
    hair(A, s, p, 0.2, drag=0, hang=10 + 30 * t)
    return s


def cat_cow(A):
    """Cat and cow (4 counts) on hands and knees: flat on 0, the cow on 1 (belly down, head up, breathe in), flat on 2,
    the cat on 3 (back round like a stretching cat, head down, breathe out)."""
    n = 4

    def pose(p):
        return fours(A, p, kc(p * n, [(0, 0), (1, 1), (2, 0), (3, -1)], n), breathe=0.0)
    return n * FPC, pose, True, 2


def down_to_fours(A):
    """Stand -> hands and knees (one go): bend into a low squat up on the toes, knees down onto the floor in front of
    the feet (the toes stay where they stood), hands down under the shoulders, then the feet lie flat."""
    k = A.k
    base, hands = fours_base(A)

    def k0(p):
        return fk_arms_to_ik(A, stand(A, 0.0, 0.0))

    def k1(p):
        s = stand(A, 0.0, 0.0)
        s['hips@loc'] = (0, 0.02 * k, -0.30 * k)
        s['hips'], s['spine'], s['chest'], s['neck'], s['head'] = (34, 0, 0), (10, 0, 0), (4, 0, 0), (-14, 0, 0), (-10, 0, 0)
        for S in 'LR':
            foot(A, s, S, heel=34, pole=(A.sx(S) * 0.3, -1, 0.1))
        mid = {S: hands[S].lerp(V((hands[S].x, hands[S].y * 0.5, 0.3 * k)), 0.6) for S in 'LR'}
        hands_down(A, s, mid)
        for S in 'LR':
            s['ik']['arm_' + S]['end'] = eul((-60, 0, 0))
        return s

    def k2(p):
        s = copy_spec(base)
        kneel_legs(A, s, tucked=True)
        s['hips'] = (base['hips'][0] - 14, 0, 0)
        J = hips_world(A, base)
        place_hips(A, s, (J['thigh_L'] + J['thigh_R']) / 2 + V((0, 0.03 * k, -0.01 * k)))
        hands_down(A, s, hands)
        return s

    pose = seq([(0, k0), (0.36, k1), (0.72, k2), (1.0, lambda p: fours(A, 0.0, 0.0, 0.0))],
               timing={1: {'arm_L': (0.0, 0.8), 'arm_R': (0.15, 1.0)}, 2: {'leg_L': (0.0, 0.7), 'leg_R': (0.3, 1.0)}},
               lifts={1: {'arm_L': 0.03 * k, 'arm_R': 0.03 * k}, 2: {'leg_L': 0.05 * k, 'leg_R': 0.05 * k}})
    return 3 * FPC, pose, False, 1


def knee_plank(A, p=0.0, breathe=1.0):
    """A plank on the knees: knees where they were on hands and knees, one straight line from the knees to the head,
    hands under the shoulders."""
    k = A.k
    base, _ = fours_base(A)
    s = copy_spec(base)
    knees = [knee_spot(A, S)[0] for S in 'LR']
    K = (knees[0] + knees[1]) / 2
    l_th, _ = _lens(A)
    shz = WRIST_H * k + 0.93 * A.l_arm
    J0 = hips_world(A, stand(A, 0.0, 0.0))
    d_t = ((J0['upperarm_L'] + J0['upperarm_R']) / 2 - (J0['thigh_L'] + J0['thigh_R']) / 2).length
    L = l_th * 0.985 + d_t
    al = math.asin(clamp((shz - K.z) / L, 0.05, 0.95))
    dirv = V((0, -math.cos(al), math.sin(al)))
    br = 0.5 * math.sin(TAU * p) * breathe
    s['hips'] = (90 - math.degrees(al) + br, 0, 0)
    s['spine'], s['chest'], s['neck'], s['head'] = (0, 0, 0), (0, 0, 0), (-10, 0, 0), (-8, 0, 0)
    s['hips@loc'] = (0, 0, 0)
    place_hips(A, s, K + dirv * (l_th * 0.985))
    hands_down(A, s, under_shoulders(A, s))
    for S in 'LR':
        s['ik']['leg_' + S]['pole'] = (A.sx(S) * 0.05, -0.3, -1)
    hair(A, s, p, 0.2, drag=0)
    return s


def plank(A):
    """Knee plank, held (4 counts that loop): the body still and long, a slow breath."""
    return 4 * FPC, (lambda p: knee_plank(A, p)), True, 2


def plank_in(A):
    """Hands and knees -> knee plank: one hand walks forward, then the other, while the hips lower into the line."""
    k = A.k
    pose = seq([(0, lambda p: fours(A, 0.0, 0.0, 0.0)), (1, lambda p: knee_plank(A, 0.0, 0.0))],
               timing={0: {'arm_L': (0.0, 0.5), 'arm_R': (0.4, 0.9)}}, lifts={0: {'arm_L': 0.04 * k, 'arm_R': 0.04 * k}})
    return 2 * FPC, pose, False, 1


def prone(A, p=0.0, lift=1.0, breathe=1.0):
    """Lying on the tummy with the chest lifted on the hands (a gentle cobra with soft elbows): legs long behind, the
    tops of the feet on the floor, the hands where they were on hands and knees."""
    k = A.k
    base, hands = fours_base(A)
    s = copy_spec(base)
    l_th, l_sh = _lens(A)
    br = 0.8 * math.sin(TAU * p) * breathe
    s['hips'] = (90 - 6 * lift, 0, 0)
    s['spine'] = (-16 * lift - br, 0, 0)
    s['chest'] = (-12 * lift - br * 0.5, 0, 0)
    s['neck'] = (-8 - 4 * lift, 0, 0)
    s['head'] = (-6 - 4 * lift, 0, 0)
    s['hips@loc'] = (0, 0, 0)
    place_hips(A, s, (0, 0, 0.09 * k))
    J = hips_world(A, s)
    sh = (J['upperarm_L'] + J['upperarm_R']) / 2
    x, y, z = s['hips@loc']
    s['hips@loc'] = (x, y + hands['L'].y + 0.035 * k - sh.y, z)
    J = hips_world(A, s)
    for S in 'LR':
        hp = J['thigh_' + S]
        reach = (l_th + l_sh) * 0.975
        az = ANK_LIE * k
        target = V((hp.x + A.sx(S) * 0.01 * k, hp.y + math.sqrt(max(reach ** 2 - (hp.z - az) ** 2, 1e-6)), az))
        s['ik']['leg_' + S] = dict(target=target, end=eul((FOOT_TOP + 4, 0, 0)), pole=(A.sx(S) * 0.05, 0.1, -1))
    hands_down(A, s, hands, pole=None)
    for S in 'LR':
        s['ik']['arm_' + S]['pole'] = (A.sx(S) * 0.25, 1, 0.5)
    hair(A, s, p, 0.2, drag=0)
    return s


def cobra(A):
    """The cobra (be a snake), held: 4 counts that loop with a slow breath."""
    return 4 * FPC, (lambda p: prone(A, p)), True, 2


def cobra_in(A):
    """Hands and knees -> cobra: the legs slide back one after the other while the hips lower, then the chest lifts."""
    k = A.k
    pose = seq([(0, lambda p: fours(A, 0.0, 0.0, 0.0)), (0.6, lambda p: prone(A, 0.0, 0.25, 0.0)),
                (1, lambda p: prone(A, 0.0, 1.0, 0.0))],
               timing={0: {'leg_L': (0.0, 0.6), 'leg_R': (0.35, 1.0)}}, lifts={0: {'leg_L': 0.05 * k, 'leg_R': 0.05 * k}})
    return 3 * FPC, pose, False, 1


def child(A, p=0.0, breathe=1.0):
    """The child's pose (be a little mouse): knees where they were, the hips back over the heels, the body folded
    down over the knees, the arms long in front with the hands where they were."""
    k = A.k
    base, hands = fours_base(A)
    s = copy_spec(base)
    knees = [knee_spot(A, S)[0] for S in 'LR']
    K = (knees[0] + knees[1]) / 2
    l_th, _ = _lens(A)
    back = 0.72 * l_th
    hip_at = V((0, K.y + back, K.z + math.sqrt(max((l_th * 0.985) ** 2 - back ** 2, 1e-6))))
    br = 1.2 * math.sin(TAU * p) * breathe
    s['spine'], s['chest'], s['neck'], s['head'] = (8, 0, 0), (6, 0, 0), (-18, 0, 0), (-12, 0, 0)
    lo, hi = 70.0, 125.0
    for _ in range(22):                      # fold until the forehead rests on the floor (the head joint a head high)
        th = (lo + hi) / 2
        s['hips'], s['hips@loc'] = (th, 0, 0), (0, 0, 0)
        place_hips(A, s, hip_at)
        if hips_world(A, s)['head'].z > CHILD_HEAD * k:
            lo = th
        else:
            hi = th
    s['hips'] = (th + br, 0, 0)
    s['hips@loc'] = (0, 0, 0)
    place_hips(A, s, hip_at)
    hands_down(A, s, {S: h + V((0, -0.13 * k, 0)) for S, h in hands.items()}, pole=None)
    for S in 'LR':
        s['ik']['arm_' + S]['pole'] = (A.sx(S) * 0.4, 0.2, 1)
    hair(A, s, p, 0.2, drag=-8, hang=70)
    return s


def child_pose(A):
    return 4 * FPC, (lambda p: child(A, p)), True, 2


def child_in(A):
    k = A.k
    return 2 * FPC, seq([(0, lambda p: fours(A, 0.0, 0.0, 0.0)), (1, lambda p: child(A, 0.0, 0.0))],
                        timing={0: {'arm_L': (0.0, 0.45), 'arm_R': (0.3, 0.75)}},
                        lifts={0: {'arm_L': 0.035 * k, 'arm_R': 0.035 * k}}), False, 1


# ---------------------------------------------------------------- standing yoga (left versions; right = mirror)
def mountain(A, p=0.0, breathe=1.0):
    """The mountain: standing tall, arms long at the sides with the palms turned forward, a slow breath."""
    s = stand(A, p, 0.9 * breathe)
    s['spine'] = add(s['spine'], (-1, 0, 0))
    s['head'] = add(s['head'], (-2, 0, 0))
    for S in 'LR':
        arm(A, s, S, fwd=2, out=6, twist=-24, elbow=6, hand=(-2, 0, 0))
    hair(A, s, p, 0.25)
    return s


def shifted(A, dx):
    """The mountain with the weight moved over one foot (dx < 0: over the right)."""
    s = mountain(A, 0.0, 0.0)
    x, y, z = s['hips@loc']
    s['hips@loc'] = (x + dx * A.k, y, z)
    return s


def tree_l(A, p=0.0, breathe=1.0):
    """The tree (left foot lifted): weight over the right foot, the left sole against the inside of the right calf
    with the knee turned out, arms up in a V like branches swaying a little."""
    k = A.k
    s = stand(A, p, 0.6 * breathe)
    sway = 2.0 * math.sin(TAU * p) * breathe
    x, y, z = s['hips@loc']
    s['hips@loc'] = (x - 0.05 * k, y, z - 0.004 * k)
    s['hips'] = add(s['hips'], (0, 3, 0))
    s['spine'] = add(s['spine'], (0, -3, 0))
    s['chest'] = add(s['chest'], (0, -1, 0))
    rt = foot(A, s, 'R', pole=(-0.15, -1, 0))
    calf = V((rt.x + 0.05 * k, rt.y - 0.005 * k, rt.z + 0.13 * k))
    s['ik']['leg_L'] = dict(target=calf, end=eul((24, 68, 8)), pole=(1, -0.45, 0.1))
    for S in 'LR':
        arm(A, s, S, fwd=4, out=134 + sway, twist=-30, elbow=12, hand=(-6, 0, 0))
    hair(A, s, p, 0.3)
    return s


def warrior_l(A, p=0.0, breathe=1.0, bend=1.0, arms=1.0):
    """The warrior (left side): feet wide, the left foot turned out to the left with its knee bent over it, the right
    leg long, the body facing front, arms out at shoulder height, looking along the left arm."""
    k = A.k
    s = stand(A, p, 0.6 * breathe)
    x, y, z = s['hips@loc']
    s['hips@loc'] = (x + 0.15 * k, y, z - (0.012 + 0.085 * bend) * k)
    s['spine'] = add(s['spine'], (-1, 0, 0))
    foot(A, s, 'L', dx=0.30, yaw=78, pole=(1, -0.25, 0.05))
    foot(A, s, 'R', yaw=12, pole=(-0.1, -1, 0))
    s['head'] = add(s['head'], (0, 0, 52 * arms))
    s['neck'] = add(s['neck'], (0, 0, 8 * arms))
    for S in 'LR':
        arm(A, s, S, fwd=-4, out=6 + 70 * arms, twist=0, elbow=6, hand=(-2, 0, 0))
    hair(A, s, p, 0.3)
    return s


def bird_l(A, p=0.0, breathe=1.0):
    """The bird (balance, left leg back): standing on the right leg, leaning forward a little, the left leg lifted
    long behind, arms spread like wings; the head up, looking ahead."""
    k = A.k
    s = stand(A, p, 0.5 * breathe)
    flap = 3.0 * math.sin(TAU * p) * breathe
    x, y, z = s['hips@loc']
    s['hips@loc'] = (x - 0.05 * k, y + 0.02 * k, z - 0.008 * k)
    s['hips'], s['spine'], s['chest'] = (34, 3, 0), (4, -2, 0), (2, 0, 0)
    s['neck'], s['head'] = (-14, 0, 0), (-16, 0, 0)
    foot(A, s, 'R', pole=(-0.15, -1, 0))
    base = foot(A, {}, 'L')
    up, end = lift_target(A, s, 'L', -84, 6, foot_pitch=34)
    s['ik']['leg_L'] = dict(target=up, end=eul(end), pole=(0.05, 0.3, -1))
    for S in 'LR':
        arm(A, s, S, fwd=-12, out=72 + flap, twist=-6, elbow=14, hand=(-8, 0, 0))
    hair(A, s, p, 0.4, drag=8)
    return s


def mirror_spec(s):
    """The same pose on the other side: left and right swap, turns about Y and Z change sign, X positions flip."""
    def sw(n):
        return n[:-2] + ('_R' if n.endswith('_L') else '_L') if n.endswith(('_L', '_R')) else n

    def flip_target(t):
        if isinstance(t, ChestPt):
            return ChestPt(V((-t.v.x, t.v.y, t.v.z)))
        if callable(t):
            return lambda P, D: (lambda r: V((-r.x, r.y, r.z)))(t(P, D))
        return V((-t[0], t[1], t[2]))
    out = {}
    for key, v in s.items():
        if key == 'ik':
            ik = {}
            for c, g in v.items():
                h = dict(g)
                h['target'] = flip_target(g['target'])
                if 'pole' in g:
                    h['pole'] = (-g['pole'][0], g['pole'][1], g['pole'][2])
                for e in ('end', 'end_rel'):
                    if e in g and not callable(g[e]):
                        q = _q(g[e])
                        h[e] = Quaternion((q.w, q.x, -q.y, -q.z))
                ik[sw(c)] = h
            out['ik'] = ik
            continue
        bone, _, loc = key.partition('@')
        nk = sw(bone) + ('@' + loc if loc else '')
        if v is None:
            out[nk] = None
        elif isinstance(v, Quaternion):
            out[nk] = Quaternion((v.w, v.x, -v.y, -v.z))
        elif loc:
            out[nk] = (-v[0], v[1], v[2])
        else:
            out[nk] = (v[0], -v[1], -v[2])
    return out


def hold(fn, n=4, step=2):
    return n * FPC, fn, True, step


def side_pair(A, name, held, keys, timing=None, lifts=None, frames=2 * FPC):
    """A held standing pose and its way in from the mountain, on both sides: Ex<name>L / R and Ex<name>InL / InR
    (the left versions are authored, the right ones mirrored)."""
    pin = seq(keys, timing=timing, lifts=lifts)
    return {
        f'Ex{name}L': hold(held), f'Ex{name}R': hold(lambda p: mirror_spec(held(p))),
        f'Ex{name}InL': (frames, pin, False, 1), f'Ex{name}InR': (frames, lambda p: mirror_spec(pin(p)), False, 1),
    }


def yoga_sides(A):
    k = A.k
    m0 = lambda p: mountain(A, 0.0, 0.0)
    t = {}
    t.update(side_pair(A, 'Tree', lambda p: tree_l(A, p),
                       [(0, m0), (0.35, lambda p: shifted(A, -0.05)), (1, lambda p: tree_l(A, 0.0, 0.0))],
                       timing={1: {'leg_L': (0.0, 0.75)}}, lifts={1: {'leg_L': 0.04 * k}}))
    t.update(side_pair(A, 'Warrior', lambda p: warrior_l(A, p),
                       [(0, m0), (0.25, lambda p: shifted(A, -0.03)), (0.6, lambda p: warrior_l(A, 0.0, 0.0, 0.0, 0.3)),
                        (1, lambda p: warrior_l(A, 0.0, 0.0))],
                       timing={1: {'leg_L': (0.0, 1.0)}}, lifts={1: {'leg_L': 0.06 * k}}))
    t.update(side_pair(A, 'Bird', lambda p: bird_l(A, p),
                       [(0, m0), (0.3, lambda p: shifted(A, -0.05)), (1, lambda p: bird_l(A, 0.0, 0.0))],
                       timing={1: {'leg_L': (0.05, 1.0)}}))
    return t


# ================================================================ the table and the run
def table(A):
    t = {}
    for name, fn in (('ExStretch', stretch), ('ExArmSwing', arm_swing), ('ExArmCircle', arm_circle),
                     ('ExSideBend', side_bend), ('ExTwist', twist), ('ExKneeBend', knee_bend), ('ExJump', jump),
                     ('ExBreath', breath),
                     ('ExMarch', march), ('ExHighKnees', lambda A: march(A, True)), ('ExStarJump', star_jump),
                     ('ExSquat', squat), ('ExToeReach', toe_reach), ('ExDown', down_to_fours), ('ExPlank', plank),
                     ('ExPlankIn', plank_in), ('ExCatCow', cat_cow), ('ExCobra', cobra), ('ExCobraIn', cobra_in),
                     ('ExChild', child_pose), ('ExChildIn', child_in), ('ExMountain', lambda A: hold(lambda p: mountain(A, p)))):
        t[name] = fn(A)
    t.update(yoga_sides(A))
    return t


def main():
    with open(RIGS) as f:
        rigs = json.load(f)
    out_dir = OPTS.get('out', MODELS)
    os.makedirs(out_dir, exist_ok=True)
    for who in ONLY:
        rec = rigs[who]
        arm_ob = rebuild(rec)
        _FOURS.clear()
        A = Anim(arm_ob, BodyRef(rec['H']), who, **rec['style'])
        T = table(A)
        names = [n for n in OPTS.get('clips', ','.join(T)).split(',') if n in T]
        done = record_moves(arm_ob, A, T, names)
        print(f'  {who} clips:', ', '.join(f'{n}({f})' for n, f, _ in done))
        export_pack('exercise-' + who, arm_ob, out_dir)


main()
