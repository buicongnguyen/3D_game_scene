// Feet on a gentle hillside (owner 2026-11-28: "make it perform in a little steep spot"). The dances are baked for level
// ground: on a slope a planted foot floats over the ground on the downhill side and sinks into it uphill. After the
// dance pose (and the foot hold, and a follower's copy) each planted foot is fitted to the ground under it:
//   - the pelvis drops to the lower planted foot (hips moved straight down in the world), so no leg has to stretch;
//   - each planted foot is turned by the slope along it about its toe joint and lifted to the ground under the toe (the
//     dance's own heights over level ground kept; the toe stays exactly where the dance plants it, so nothing slides),
//     the leg by the same two-bone solve the followers use (foot-hold.js legSolve: this leg's chain only, no scene walk).
// Measured (scripts/troupe-check.mjs --slope 15|20 [--across], 8 dancers, golden-rails-en): planted toe and ankle within
// 0.55 cm of their height over the ground (0 sink), slide the same as on level ground (p95 1.01 cm/s), joint rules 0.
// A foot lifted by the dance is let go over the next LIFT.ease m of lift (it steps through the air as baked) and moves
// with the dropped pelvis. On level ground (both feet and the root within FLAT_EPS of one height) nothing is touched.
// The bones it turns (thigh, shin, foot of each leg) and the hips' position are put back by restore() before the next
// mixer write (three's mixer skips a value that did not change, like foot-hold.js).
//   createGroundFit(model, ground(x, z) -> y) -> { apply(), restore(), state: { drop, legs: [{ w, dy, ankle0, toe0, toeH }] } } | null
import * as THREE from 'three';
import { legSolve } from './foot-hold.js';

export const LIFT = Object.freeze({ low: .03, ease: .05 });   // m over the planted height: fitted fully up to 3 cm, none past 8
export const FLAT_EPS = .004;   // m: ground this level under her needs no fit
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const _A = new THREE.Vector3(), _T = new THREE.Vector3(), _R = new THREE.Vector3(), _H = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _pi = new THREE.Quaternion(), _ax = new THREE.Vector3(), _m = new THREE.Matrix4();
const chain = (...bones) => { for (const b of bones) { b.updateMatrix(); b.matrixWorld.multiplyMatrices(b.parent.matrixWorld, b.matrix); } };

export function createGroundFit(model, ground) {
  const hips = model.getObjectByName('hips');
  const legs = ['L', 'R'].map(s => ({ thigh: model.getObjectByName(`thigh_${s}`), shin: model.getObjectByName(`shin_${s}`), foot: model.getObjectByName(`foot_${s}`), toe: model.getObjectByName(`toe_${s}`) }))
    .filter(l => l.thigh && l.shin && l.foot && l.toe);
  if (!hips || legs.length < 2 || typeof ground !== 'function') return null;
  // the planted heights over level ground: ankle and toe joints in the pose she stands in now (rest or Idle), over the
  // ground under her root
  model.updateWorldMatrix(true, true);
  model.getWorldPosition(_R);
  const g0 = ground(_R.x, _R.z);
  for (const l of legs) { l.ankleH = l.foot.getWorldPosition(_A).y - g0; l.toeH = l.toe.getWorldPosition(_T).y - g0; l.w = 0; l.dy = 0; l.tilt = 0; l.A = new THREE.Vector3(); l.T = new THREE.Vector3(); l.P = new THREE.Vector3(); }
  const plantA = Math.min(...legs.map(l => l.ankleH));
  const saved = [...legs.flatMap(l => [l.thigh, l.shin, l.foot]).map(b => ({ b, q: new THREE.Quaternion() }))], hipsAt = new THREE.Vector3();
  let on = false;
  const state = { drop: 0, legs };
  const up = []; for (let o = hips.parent; o && o !== model; o = o.parent) up.unshift(o);   // the armature nodes over the hips
  return {
    state,
    restore() { if (!on) return; for (const s of saved) s.b.quaternion.copy(s.q); hips.position.copy(hipsAt); on = false; },
    apply() {
      model.updateWorldMatrix(true, false);
      chain(...up, hips); for (const l of legs) chain(l.thigh, l.shin, l.foot, l.toe);
      _R.setFromMatrixPosition(model.matrixWorld);
      const g0 = ground(_R.x, _R.z);
      let flat = true, drop = 0;
      for (const l of legs) {
        const A = l.A.setFromMatrixPosition(l.foot.matrixWorld), T = l.T.setFromMatrixPosition(l.toe.matrixWorld);
        l.ankle0 = A.y - g0; l.toe0 = T.y - g0;   // (the dance's heights over level ground: scripts/troupe-check.mjs --slope)
        // planted while the heel or the toe is down (a raised heel on a planted toe is still a planted foot)
        l.w = 1 - smooth((Math.min(l.ankle0 - plantA, l.toe0 - l.toeH) - LIFT.low) / LIFT.ease);
        // the foot turns about its toe joint: the toe stays exactly where the dance plants it (no slide when the heel
        // rises or falls; a pivot that moved between heel and toe slid the toe 5-7 cm/s on a 15-20 deg slope)
        l.P.copy(T);
        const gA = ground(A.x, A.z), gT = ground(T.x, T.z);
        l.dy = ground(l.P.x, l.P.z) - g0;
        l.tilt = Math.atan2(gT - gA, Math.max(1e-4, Math.hypot(T.x - A.x, T.z - A.z)));   // the slope along the foot
        if (Math.abs(gA - g0) > FLAT_EPS || Math.abs(gT - g0) > FLAT_EPS) flat = false;
        if (l.w > 0) drop = Math.max(drop, -(Math.min(gA, gT) - g0) * l.w);   // (the lower of heel and toe: no leg stretches)
      }
      state.drop = drop;
      if (flat) return;
      for (const s of saved) s.q.copy(s.b.quaternion);
      hipsAt.copy(hips.position); on = true;
      if (drop > 0) {
        // the pelvis straight down in the world (its parent may be turned or scaled: an armature from Blender)
        hips.getWorldPosition(_H); _H.y -= drop;
        hips.position.copy(hips.parent.worldToLocal(_H));
        chain(hips); for (const l of legs) chain(l.thigh, l.shin, l.foot, l.toe);
      }
      for (const l of legs) {
        if (l.w <= 1e-3) continue;
        // the foot as the dance has it, turned by the slope along it about its pivot and lifted to the ground under the
        // pivot (w of the way: a lifting foot moves with the dropped pelvis)
        const dx = l.T.x - l.A.x, dz = l.T.z - l.A.z, run = Math.hypot(dx, dz), ang = run > 1e-4 ? l.tilt * l.w : 0;
        if (ang) _q.setFromAxisAngle(_ax.set(-dz / run, 0, dx / run), ang); else _q.identity();   // (across the foot: a positive turn lifts the toe)
        _T.subVectors(l.A, l.P).applyQuaternion(_q).add(l.P); _T.y += l.dy;
        _A.copy(l.A); _A.y -= drop;
        _T.lerpVectors(_A, _T, l.w);
        legSolve(hips, l.thigh, l.shin, l.foot, _T, 1);
        if (ang) {
          _p.setFromRotationMatrix(_m.extractRotation(l.foot.parent.matrixWorld));
          l.foot.quaternion.premultiply(_q.premultiply(_pi.copy(_p).invert()).multiply(_p));
        }
        chain(l.foot, l.toe);
      }
    },
  };
}
