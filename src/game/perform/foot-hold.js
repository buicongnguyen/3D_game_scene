// Feet that stay put while one dance cross-fades into the next (after Avatar Studio Club mode's Dance & sing "Feet over a
// dance change"). A cross-fade of two leg poses blends rotations, not foot positions, so a planted foot slides under her
// even when both dances stand it on the same spot. While a fade runs, a foot that was on the floor when it began is held
// there by a two-bone leg solve (thigh + shin turned, the foot keeps its own world turn); after the fade it lets go: quickly
// while the new dance has that foot in the air (it steps: nothing slides), else creeping to the new dance's spot no faster
// than `creep` m/s (2026-11-28: the release over 0.8 s slid a planted foot 5-8 cm/s when two dances stand it 2-6 cm apart).
// A held foot whose new dance wants it more than `reach` away is let go (the new dance steps it).
import * as THREE from 'three';

export const HOLD = Object.freeze({ floor: .025, reach: .04, release: .8, lifted: .25, creep: .008 });
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _f = new THREE.Quaternion();

/** Turn `bone` in world space by q (premultiplied), keeping its children's world turn. */
function turnWorld(bone, q) {
  bone.parent.getWorldQuaternion(_p);
  bone.quaternion.premultiply(_q.copy(_p).invert().multiply(q).multiply(_p));
  bone.updateWorldMatrix(false, true);
}

/** Two-bone solve: thigh / shin / foot so the ankle reaches `target` (world), the knee staying in its own bend plane. */
export function reach(thigh, shin, foot, target) {
  thigh.updateWorldMatrix(true, true);
  foot.getWorldQuaternion(_f);
  const H = thigh.getWorldPosition(_a.clone()), K = shin.getWorldPosition(_b.clone()), A = foot.getWorldPosition(_c.clone());
  const l1 = H.distanceTo(K), l2 = K.distanceTo(A), d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, H.distanceTo(target)));
  const ang = x => Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - x * x) / (2 * l1 * l2))));
  const n = new THREE.Vector3().subVectors(H, K).cross(new THREE.Vector3().subVectors(A, K));
  if (n.lengthSq() > 1e-12) turnWorld(shin, new THREE.Quaternion().setFromAxisAngle(n.normalize(), ang(d) - ang(H.distanceTo(A))));
  const A2 = foot.getWorldPosition(new THREE.Vector3());
  turnWorld(thigh, new THREE.Quaternion().setFromUnitVectors(A2.sub(H).normalize(), _t.copy(target).sub(H).normalize()));
  // the foot keeps the world turn the dance gave it
  foot.parent.getWorldQuaternion(_p); foot.quaternion.copy(_p.invert().multiply(_f)); foot.updateWorldMatrix(false, true);
}

export function createFootHold(model) {
  const legs = ['L', 'R'].map(s => ({ thigh: model.getObjectByName(`thigh_${s}`), shin: model.getObjectByName(`shin_${s}`), foot: model.getObjectByName(`foot_${s}`), toe: model.getObjectByName(`toe_${s}`), at: null, k: 0 }))
    .filter(l => l.thigh && l.shin && l.foot && l.toe);
  model.updateWorldMatrix(true, true);
  // the floor under her rest pose: the lower of the toe joints, in her model's space
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert(), restToe = Math.min(...legs.map(l => l.toe.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y));
  const saved = legs.flatMap(l => [l.thigh, l.shin, l.foot]).map(b => ({ b, q: new THREE.Quaternion(), on: false }));
  return {
    /** Before the next mixer write: the leg bones back to the dance's pose (three's mixer skips a value that did not change). */
    restore() { for (const s of saved) if (s.on) { s.b.quaternion.copy(s.q); s.on = false; } },
    /** After the mixer and before the mic layer: fading true while a dance or moment cross-fade runs. */
    update(dt, fading) {
      if (legs.length < 2) return;
      if (legs.some(l => l.at) || fading) for (const s of saved) { s.q.copy(s.b.quaternion); s.on = true; }
      model.updateWorldMatrix(true, true);
      inv.copy(model.matrixWorld).invert();
      for (const l of legs) {
        const ankle = l.foot.getWorldPosition(new THREE.Vector3()), toeY = l.toe.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y;
        if (fading) {
          if (!l.at && toeY < restToe + HOLD.floor) { l.at = ankle.clone().applyMatrix4(inv); l.k = 1; }
          if (l.at && ankle.clone().applyMatrix4(inv).distanceTo(l.at) > HOLD.reach) l.k = Math.min(l.k, .999);   // its new spot is a step away: let it go
        }
        if (!l.at) continue;
        if (!fading || l.k < 1) {
          // in the air in the new dance: let go fast; still planted: creep (the goal moves d * rate m/s)
          const d = Math.hypot(...['x', 'z'].map(k => l.at.clone().applyMatrix4(model.matrixWorld)[k] - ankle[k]));
          const rate = toeY > restToe + HOLD.floor ? 1 / HOLD.lifted : Math.min(1 / HOLD.release, HOLD.creep / Math.max(d, 1e-4));
          l.k = Math.max(0, l.k - dt * rate);
        }
        if (l.k <= 0) { l.at = null; continue; }
        const goal = l.at.clone().applyMatrix4(model.matrixWorld).lerp(ankle, 1 - l.k);
        goal.y = Math.max(goal.y, ankle.y);   // held on its spot, never pushed into the floor (the new dance may lift it)
        reach(l.thigh, l.shin, l.foot, goal);
      }
    },
  };
}

// (moved here from troupe.js 2026-11-28: the followers' leg solve, also used by ground-fit.js)
const _H = new THREE.Vector3(), _K = new THREE.Vector3(), _A = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const _qf = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qq = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _m = new THREE.Matrix4();
const chain = (...bones) => { for (const b of bones) { b.updateMatrix(); b.matrixWorld.multiplyMatrices(b.parent.matrixWorld, b.matrix); } };
const worldTurn = (b, out) => out.setFromRotationMatrix(_m.extractRotation(b.matrixWorld));
/** Turn `bone` by the world rotation q (its parent's world matrix is current). */
const turn = (bone, q) => { worldTurn(bone.parent, _qp); bone.quaternion.premultiply(_qq.copy(_qp).invert().multiply(q).multiply(_qp)); };
/**
 * Two-bone leg solve without walking the scene (foot-hold.js reach does a full world update per call): only this leg's
 * chain is recomposed from the hips down (the bones above stand still, their matrices are this frame's). The ankle goes
 * w of the way to `target`, the knee stays in its own bend plane, the foot keeps its world turn.
 */
export function legSolve(hips, thigh, shin, foot, target, w = 1) {
  chain(hips, thigh, shin, foot);
  worldTurn(foot, _qf);
  _H.setFromMatrixPosition(thigh.matrixWorld); _K.setFromMatrixPosition(shin.matrixWorld); _A.setFromMatrixPosition(foot.matrixWorld);
  const T = w < 1 ? _w.copy(_A).lerp(target, w) : _w.copy(target);
  const l1 = _H.distanceTo(_K), l2 = _K.distanceTo(_A), d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, _H.distanceTo(T)));
  const ang = x => Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - x * x) / (2 * l1 * l2))));
  _n.subVectors(_H, _K).cross(_u.subVectors(_A, _K));
  if (_n.lengthSq() > 1e-12) { turn(shin, _qr.setFromAxisAngle(_n.normalize(), ang(d) - ang(_H.distanceTo(_A)))); chain(shin, foot); }
  _A.setFromMatrixPosition(foot.matrixWorld).sub(_H).normalize();
  turn(thigh, _qr.setFromUnitVectors(_A, _u.copy(T).sub(_H).normalize()));
  chain(thigh, shin);
  worldTurn(shin, _qp); foot.quaternion.copy(_qp.invert().multiply(_qf));
}
