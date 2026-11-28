// © 2026 Bui Cong Nguyen · solluxlabs.com
// The Explore moves for any singer body (docs/EXPLORE-AND-SHOW.md "Play as"): ONE generic pack on the Mixamo-65 skeleton
// (public/models/moves-explore.glb, baked once by art/blender/vroid_mixamo.py from the Mixamo FBX listed in
// art/blender/explore_moves.json onto Saki's rig) is made ready for each body at load, the way perform/troupe.js copies a
// pose to a follower, but once per clip instead of every frame:
//   rotations   a bone turns from ITS rest by the turn the pack's bone made from the pack's rest (a constant per bone,
//               identity when the two rests match: the VRoid conversion gives nearly all bones the same rest)
//   hips        the travel scaled by the ratio of the leg lengths (hip height over the ankles), so a taller body bounces
//               as far as its legs reach; per-clip rules below for the moves where the game itself moves her up and down
// Mika keeps her own rig and her own clips: none of this touches her.
import * as THREE from 'three';

export const EXPLORE_PACK = 'moves-explore';
/**
 * How each clip's hips height is used (the pack's own travel otherwise, scaled):
 *   flat   no vertical travel: the game's own physics lifts her (a jump, a fall, the kite's handle, the water's surface)
 *   seat   the hips held `seat` metres over her root on average (actors/player.js indoor Sit contract: the seat top is
 *          her root + 0.45 m, game/indoor.js), the clip's own small sway kept
 */
export const HIPS_RULE = Object.freeze({
  Jump: 'flat', Fall: 'flat', Hang: 'flat', Swim: 'flat',
  Sit: Object.freeze({ seat: 0.45 }),
});
/** Clips the game asks for under another name, played from the same pack clip (one copy in the file): sitting on a
 *  cushion is sitting on the grass (kneeling, seiza); petting a small animal (or a room's cat: game/indoor.js 'Pet') is the
 *  kneeling reach with the hand down. */
export const ALIASES = Object.freeze({ SitFloor: 'SitGrass', PetLow: 'CrouchReachHold', Pet: 'CrouchReachHold' });
/** Clips played there and back (the pack holds the way down; the way up is the same keys backwards): a pickup bends down
 *  to the grass and stands up again in one clip, as Mika's own does (actors/pose-ground.js GROUND.pickupSeconds). */
export const PINGPONG = Object.freeze({ Pickup: 1.0 });   // name -> the whole clip's length (s)
/** The clips the pack holds (art/blender/explore_moves.json, checked by tests/explore-show.test.mjs). */
export const PACK_MOVES = Object.freeze(['Jump', 'Fall', 'Land', 'Swim', 'Tread', 'Sit', 'SitGrass', 'Crouch', 'CrouchWalk',
  'CrouchReach', 'CrouchReachHold', 'Kneel', 'Pickup', 'Interact', 'Pat', 'PatHigh', 'Hang']);

const NOT_COPIED = /^(root|grip_R|eye_[LR])$/;

/** name -> { q, p } of a rig at rest (a fresh clone or a pack armature: every named node counts). */
export function restOf(root) {
  const out = new Map();
  root.traverse(o => { if (o.name && !out.has(o.name)) out.set(o.name, { q: o.quaternion.clone(), p: o.position.clone() }); });
  return out;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
/** Hip height over the ankles at rest (m). */
export function legOf(root) {
  root.updateWorldMatrix(true, true);
  const h = root.getObjectByName('hips'), f = root.getObjectByName('foot_L');
  return h && f ? h.getWorldPosition(_a).y - f.getWorldPosition(_b).y : 1;
}
/** Hip height over the model's root at rest (m, in the model's own frame). */
export function hipsOver(root) {
  root.updateWorldMatrix(true, true);
  const h = root.getObjectByName('hips');
  if (!h) return 0;
  return h.getWorldPosition(_a).applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert()).y;
}

/**
 * One pack clip made ready for one body. src / dst: restOf() of the pack and the body; k: leg ratio (body / pack);
 * rule: HIPS_RULE entry; over: the body's rest hip height over its root (for 'seat').
 */
export function retargetMove(clip, src, dst, { k = 1, rule = null, over = 0, name = clip.name } = {}) {
  const tracks = [];
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.'), node = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    const rs = src.get(node), rd = dst.get(node);
    if (!rs || !rd || NOT_COPIED.test(node)) continue;
    if (prop === 'quaternion') {
      const K = rd.q.clone().multiply(rs.q.clone().invert());
      if (Math.abs(Math.abs(K.w) - 1) < 1e-7) { tracks.push(t.clone()); continue; }
      const v = Float32Array.from(t.values), q = new THREE.Quaternion();
      for (let i = 0; i < v.length; i += 4) { q.fromArray(v, i).premultiply(K).normalize(); q.toArray(v, i); }
      tracks.push(new THREE.QuaternionKeyframeTrack(t.name, t.times, v));
      continue;
    }
    if (prop !== 'position' || node !== 'hips') continue;   // (bone lengths stay the body's own)
    const v = Float32Array.from(t.values), n = v.length / 3;
    let meanY = 0;
    for (let i = 1; i < v.length; i += 3) meanY += v[i];
    meanY /= Math.max(1, n);
    for (let i = 0; i < v.length; i += 3) {
      v[i] = rd.p.x + (v[i] - rs.p.x) * k;
      v[i + 2] = rd.p.z + (v[i + 2] - rs.p.z) * k;
      const y = v[i + 1];
      v[i + 1] = rule === 'flat' ? rd.p.y
        : rule?.seat !== undefined ? rd.p.y + (rule.seat - over) + (y - meanY) * k
          : rd.p.y + (y - rs.p.y) * k;
    }
    tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times, v));
  }
  const out = new THREE.AnimationClip(name, clip.duration, tracks);
  out.userData = { explore: true };
  return out;
}

/**
 * Every Explore move made ready for a body: Map name -> AnimationClip (aliases included). pack: the loaded GLTF of
 * moves-explore (its armature at rest as pack.scene); body: a fresh clone of the singer's model (its rest pose).
 */
export function bodyMoves(pack, body, packRoot = pack?.scene) {
  const out = new Map();
  if (!pack?.animations?.length || !body) return out;
  const src = restOf(packRoot), dst = restOf(body), k = legOf(body) / Math.max(1e-3, legOf(packRoot)), over = hipsOver(body);
  for (const c of pack.animations) {
    const m = retargetMove(c, src, dst, { k, rule: HIPS_RULE[c.name] || null, over });
    out.set(c.name, PINGPONG[c.name] ? pingpong(m, PINGPONG[c.name]) : m);
  }
  for (const [alias, from] of Object.entries(ALIASES)) {
    const c = out.get(from);
    if (c && !out.has(alias)) { const a = c.clone(); a.name = alias; out.set(alias, a); }
  }
  return out;
}

/** A clip played forward and then backward, squeezed into `length` seconds (the keys mirrored about the end). */
export function pingpong(clip, length = clip.duration * 2) {
  const d = clip.duration, k = length / Math.max(1e-3, 2 * d);
  const tracks = clip.tracks.map(t => {
    const n = t.times.length, size = t.getValueSize(), times = new Float32Array(2 * n - 1), v = new Float32Array((2 * n - 1) * size);
    for (let i = 0; i < n; i++) { times[i] = t.times[i] * k; v.set(t.values.subarray(i * size, (i + 1) * size), i * size); }
    for (let i = 1; i < n; i++) { const j = n - 1 - i; times[n - 1 + i] = (2 * d - t.times[j]) * k; v.set(t.values.subarray(j * size, (j + 1) * size), (n - 1 + i) * size); }
    return new t.constructor(t.name, times, v);
  });
  const out = new THREE.AnimationClip(clip.name, length, tracks);
  out.userData = { ...clip.userData };
  return out;
}
