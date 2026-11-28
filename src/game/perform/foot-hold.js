// © 2026 Bui Cong Nguyen · solluxlabs.com
// Feet that stay put while one dance cross-fades into the next (after Avatar Studio Club mode's Dance & sing "Feet over a
// dance change"). A cross-fade of two leg poses blends rotations, not foot positions, so a planted foot slides under her
// even when both dances stand it on the same spot. While a fade runs, a foot that was on the floor when it began is held
// there by a two-bone leg solve (thigh + shin turned, the foot keeps its own world turn); after the fade it lets go: quickly
// while the new dance has that foot in the air (it steps: nothing slides), else creeping to the new dance's spot no faster
// than `creep` m/s (2026-11-28: the release over 0.8 s slid a planted foot 5-8 cm/s when two dances stand it 2-6 cm apart).
// A held foot whose new dance wants it more than `reach` away is let go (the new dance steps it).
// lock() (the dance sequences' fades, content/dance-sequences.js): two Mixamo takes stand and bounce differently, so a foot
// held where the old take put it is let go at the first bounce and the blend then slides it over the floor (10-40 cm/s).
// Instead every foot the blend brings down (toe joint within LOCK.band of the floor) is pinned where it touched, and
// let go over the next LOCK.ease m of lift (it moves in the air, as the bake's planted feet: scripts/seq-bake.mjs), and
// kept on the floor where the blend would take its toe under it (1-1.2 cm, measured); after
// the fade a pin still down creeps to the new take's spot no faster than LOCK.creep m/s (a take that keeps a foot down for
// bars would otherwise hold it wide of where it dances: knees out of their plane), and one the take wants more than
// LOCK.maxReach away is let go (the take steps there).
import * as THREE from 'three';

export const HOLD = Object.freeze({ floor: .025, reach: .04, release: .8, lifted: .25, creep: .008 });
export const LOCK = Object.freeze({ band: .006, ease: .03, maxReach: .2, creep: .012, release: .5 });
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const _lt = new THREE.Vector3(), _lm = new THREE.Vector3(), _la = new THREE.Vector3(), _lg = new THREE.Vector3();
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

/**
 * foot-hold.js reach() for lock(): the same solve (the knee turned in its bend plane, then the thigh, the foot keeping its
 * world turn), but for a leg standing nearly straight the bend plane's normal is the knee's own hinge (`hinge`: measured
 * at rest in the thigh's frame, createFootHold) instead of the cross product of three nearly straight joints, which is
 * noise: a pinned straight leg then bent sideways or under the floor (R1 knee off its plane, the toe 7 cm under for a
 * frame: 2026-11-28, troupe-check).
 */
const _rH = new THREE.Vector3(), _rK = new THREE.Vector3(), _rA = new THREE.Vector3(), _rn = new THREE.Vector3(), _rt = new THREE.Vector3(), _rff = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _rw = new THREE.Quaternion();
export function reachHinge(thigh, shin, foot, target, hinge) {
  thigh.updateWorldMatrix(true, true);
  foot.getWorldQuaternion(_rff);
  thigh.getWorldPosition(_rH); shin.getWorldPosition(_rK); foot.getWorldPosition(_rA);
  const l1 = _rH.distanceTo(_rK), l2 = _rK.distanceTo(_rA), d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, _rH.distanceTo(target)));
  const ang = x => Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - x * x) / (2 * l1 * l2))));
  _rn.subVectors(_rH, _rK).cross(_rt.subVectors(_rA, _rK));
  if (_rn.lengthSq() < (l1 * l2 * .09) ** 2) _rn.copy(hinge).applyQuaternion(thigh.getWorldQuaternion(_rw));   // (straighter than ~5 deg: the hinge)
  if (_rn.lengthSq() > 1e-12) turnWorld(shin, _rq.setFromAxisAngle(_rn.normalize(), ang(d) - ang(_rH.distanceTo(_rA))));
  foot.getWorldPosition(_rA);
  turnWorld(thigh, _rq.setFromUnitVectors(_rA.sub(_rH).normalize(), _rt.copy(target).sub(_rH).normalize()));
  foot.parent.getWorldQuaternion(_p); foot.quaternion.copy(_p.invert().multiply(_rff)); foot.updateWorldMatrix(false, true);
}

export function createFootHold(model) {
  const legs = ['L', 'R'].map(s => ({ thigh: model.getObjectByName(`thigh_${s}`), shin: model.getObjectByName(`shin_${s}`), foot: model.getObjectByName(`foot_${s}`), toe: model.getObjectByName(`toe_${s}`), at: null, k: 0 }))
    .filter(l => l.thigh && l.shin && l.foot && l.toe);
  model.updateWorldMatrix(true, true);
  // the floor under her rest pose: the lower of the toe joints, in her model's space
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert(), restToe = Math.min(...legs.map(l => l.toe.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y));
  const saved = legs.flatMap(l => [l.thigh, l.shin, l.foot]).map(b => ({ b, q: new THREE.Quaternion(), on: false }));
  // each knee's hinge (lock's straight-leg solve): the bend-plane normal at rest with the knee nudged toward her front, in
  // the thigh's own frame
  const fwd = new THREE.Vector3(0, 0, 1).transformDirection(model.matrixWorld);
  for (const l of legs) {
    const H = l.thigh.getWorldPosition(new THREE.Vector3()), K = l.shin.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, .03), A = l.foot.getWorldPosition(new THREE.Vector3());
    l.hinge = new THREE.Vector3().subVectors(H, K).cross(new THREE.Vector3().subVectors(A, K)).normalize().applyQuaternion(l.thigh.getWorldQuaternion(new THREE.Quaternion()).invert());
  }
  return {
    /** Before the next mixer write: the leg bones back to the dance's pose (three's mixer skips a value that did not change). */
    restore() { for (const s of saved) if (s.on) { s.b.quaternion.copy(s.q); s.on = false; } },
    /** Let go of every held foot at once (a fade into or out of floor work: the feet leave the floor, troupe.js RowDancer). */
    drop() { for (const l of legs) { l.at = null; l.k = 0; l.lk = null; } },
    /** After the mixer, in a sequence plan: fading true while a fade between two takes runs (see LOCK at the top). */
    lock(dt, fading) {
      if (legs.length < 2 || (!fading && !legs.some(l => l.lk))) return;
      for (const s of saved) { s.q.copy(s.b.quaternion); s.on = true; }
      model.updateWorldMatrix(true, true);
      inv.copy(model.matrixWorld).invert();
      for (const l of legs) {
        const toeW = l.toe.getWorldPosition(_lt), toeM = _lm.copy(toeW).applyMatrix4(inv), h = toeM.y - restToe;
        if (fading && !l.lk && h < LOCK.band) { l.lk = new THREE.Vector3(toeM.x, 0, toeM.z); l.pw = 1; }
        if (!l.lk) continue;
        if (h > LOCK.band + LOCK.ease) { l.lk = null; continue; }
        const goal = _lg.set(l.lk.x, toeM.y, l.lk.z).applyMatrix4(model.matrixWorld), ox = goal.x - toeW.x, oz = goal.z - toeW.z, d = Math.hypot(ox, oz);
        if (d > LOCK.maxReach) { l.lk = null; continue; }   // (the take has walked off: it steps there)
        if (!fading) { l.pw -= dt * Math.min(1 / LOCK.release, LOCK.creep / Math.max(d, 1e-4)); if (l.pw <= 0) { l.lk = null; continue; } }
        const w = (1 - smooth((h - LOCK.band) / LOCK.ease)) * l.pw, dx = ox * w, dz = oz * w;
        const target = l.foot.getWorldPosition(_la); target.x += dx; target.z += dz;
        if (h < 0) target.y -= h;   // (a blend that takes the pinned toe under the floor: back up onto it)
        reachHinge(l.thigh, l.shin, l.foot, target, l.hinge);
      }
    },
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
