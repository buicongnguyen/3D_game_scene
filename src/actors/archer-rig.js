import * as THREE from 'three';

// Mika at the shooting line (the archery round, game/tricks/archery.js): her arms and hands are posed by hand, after the
// animation mixer, so the bamboo bow is held in her left hand and the string is hooked in the fingers of her right.
//
//   - the body is turned side-on (the stance), the chest part-way back, the head looking down the arrow;
//   - each arm is solved with a two-bone solver (shoulder -> elbow -> wrist) from the hand's target: the bow hand holds the
//     bow's middle with the arm out toward the target, the string hand follows the nock back to the cheek with the elbow high;
//   - Mika's rig has no finger bones (art/CONTRACTS.md: mitten plus thumb, skinned to hand_L / hand_R), so a hand is shaped by
//     squashing the hand bone into a fist and adding a few small skin-coloured parts that curl round the bow or the string
//     (merged into one mesh per hand, children of the hand bone).
//
// It works like the lantern rig and the yard poses: the clip's value of a bone is remembered, and written back when the mixer did
// not touch it, before the pose is applied on top. It works on Low's merged skin too (the bones are the same) and with the
// visible-only matrix pass (engine/matrices.js: a changed local rotation is recomposed, children follow). leave() puts every
// bone back exactly as the clip has it (no bone state leaks out of the round).
//
// The geometry (the solver, the hand frames, the pose targets) is plain maths and exported so tests can check it.

const V3 = THREE.Vector3, Q4 = THREE.Quaternion;
const UP = new V3(0, 1, 0);

/** Shoulder, elbow and wrist of one arm: where the elbow goes so the wrist lands on `target` (clamped to the reach). */
export function solveArm(S, T, l1, l2, pole, outElbow, outWrist) {
  const u = _u.copy(T).sub(S);
  const reach = l1 + l2;
  let d = u.length();
  const lo = Math.abs(l1 - l2) + 1e-3, hi = reach * 0.9995;
  if (d < 1e-6) { u.set(0, 0, 1); d = 1e-6; } else u.multiplyScalar(1 / d);
  const dd = Math.min(hi, Math.max(lo, d));
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // the pole, made perpendicular to the shoulder-wrist line
  const p = _p.copy(pole);
  p.addScaledVector(u, -p.dot(u));
  if (p.lengthSq() < 1e-8) p.set(0, -1, 0).addScaledVector(u, u.y);
  p.normalize();
  outElbow.copy(S).addScaledVector(u, a).addScaledVector(p, h);
  outWrist.copy(S).addScaledVector(u, dd);
  return d / reach;                                   // 1 = at full stretch (or beyond)
}
const _u = new V3();
const _p = new V3();

/** The rotation of a hand whose fingers point along y, with the thumb up (x = palm side for the right hand, mirrored for the left). */
export function handBasis(y, up, out = new Q4()) {
  const Y = _y.copy(y).normalize();
  const Z = _z.copy(up).negate();                     // the thumb is the hand's -z
  Z.addScaledVector(Y, -Z.dot(Y));
  if (Z.lengthSq() < 1e-8) Z.set(0, 0, 1);
  Z.normalize();
  const X = _x.crossVectors(Y, Z);
  _m.makeBasis(X, Y, Z);
  return out.setFromRotationMatrix(_m);
}
const _x = new V3(), _y = new V3(), _z = new V3(), _m = new THREE.Matrix4();

/** The stance numbers and the reach, in one place (tests read them). All lengths in metres, as measured on Mika. */
export const STANCE = {
  side: 1.0,              // radians the body is turned from the aim toward her right (side-on is pi/2)
  chestBack: 0.3,         // the share of that the chest is turned back toward the target
  head: 0.9,              // the share of the rest the head turns back (it looks down the arrow)
  nockBrace: 0.13,        // string hand's distance from the bow hand with no draw (m)
  nockFull: 0.38,         // ...and at a full draw (anchor at the cheek)
  arrow: 0.5,             // the arrow's length (the model's own length 0.8 is scaled to this)
};
/** Distance of the nock behind the bow hand (m) for a draw 0..1 (it may go below 0 a little: the string's rebound). */
export function nockAt(draw) { return STANCE.nockBrace + (STANCE.nockFull - STANCE.nockBrace) * draw; }

/** A bone's clip value, remembered and written back when the mixer did not rewrite it (the lantern rig's trick). */
class Held {
  constructor(bone) { this.bone = bone; this.base = new Q4(); this.wrote = new Q4(); this.on = false; this.scale = bone.scale.clone(); }
  begin() {
    const q = this.bone.quaternion;
    if (this.on && q.equals(this.wrote)) q.copy(this.base);
    this.base.copy(q);
    this.on = true;
  }
  done() { this.wrote.copy(this.bone.quaternion); }
  restore() {
    const q = this.bone.quaternion;
    if (this.on && q.equals(this.wrote)) q.copy(this.base);
    this.on = false;
    this.bone.scale.copy(this.scale);
  }
}

const _qh = new Q4(), _qa = new Q4(), _qb = new Q4(), _qc = new Q4(), _pa = new V3(), _pb = new V3(), _sc = new V3();
/** World rotation of an object whose matrixWorld is current. */
function worldQ(o, out) { o.matrixWorld.decompose(_pa, out, _sc); return out; }
/** Give a bone this world rotation (its parents' matrices must be current); its own matrix is refreshed. */
function setWorldQ(bone, qw) {
  worldQ(bone.parent, _qa);
  bone.quaternion.copy(_qa.invert().multiply(qw));
  bone.updateWorldMatrix(false, false);
}
/** Turn a bone so its +y points along dir (the swing from where it points now). */
function aimBone(bone, dir) {
  worldQ(bone, _qb);
  const cur = _pb.copy(UP).applyQuaternion(_qb);
  _qc.setFromUnitVectors(cur, dir).multiply(_qb);
  setWorldQ(bone, _qc);
}
/** Turn a bone about the world's up axis by angle (about its own origin). */
function yawBone(bone, angle) {
  if (Math.abs(angle) < 1e-5) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.updateWorldMatrix(false, false);
  worldQ(bone, _qb);
  _qc.setFromAxisAngle(UP, angle).multiply(_qb);
  setWorldQ(bone, _qc);
}

export class ArcherRig {
  /** player: the Player (model, root). ok is false when the rig lacks the bones (the round then goes on without the pose). */
  constructor(player) {
    this.p = player;
    const m = player.model, n = name => m.getObjectByName(name) || null;
    this.b = { spine: n('spine'), head: n('head'), uaL: n('upperarm_L'), faL: n('forearm_L'), haL: n('hand_L'), uaR: n('upperarm_R'), faR: n('forearm_R'), haR: n('hand_R') };
    this.ok = Object.values(this.b).every(Boolean) && this.b.faL.parent === this.b.uaL && this.b.haL.parent === this.b.faL && this.b.faR.parent === this.b.uaR && this.b.haR.parent === this.b.faR;
    this.held = [];
    this.on = false;
    // outputs (world): the bow hand's grip point and the string hand's hook point as the pose reached them
    this.gripL = new V3(); this.hookR = new V3();
    this.reachL = 0; this.reachR = 0;
    this.elbowL = new V3(); this.elbowR = new V3(); this.shoulderL = new V3(); this.shoulderR = new V3();
    this.handL = null; this.handR = null;       // the finger parts (set by setHands)
    if (!this.ok) return;
    this.l1 = this.b.faL.position.length(); this.l2 = this.b.haL.position.length();
    for (const k of ['spine', 'head', 'uaL', 'faL', 'haL', 'uaR', 'faR', 'haR']) this.held.push(new Held(this.b[k]));
    this.H = Object.fromEntries(this.held.map((h, i) => [Object.keys(this.b)[i], h]));
    // the palm's centre in the hand's own frame (where grip_R is for the right hand, mirrored for the left; the mitten's thumb is its -z)
    this.palmR = new V3(0.011, 0.042, -0.002);
    this.palmL = new V3(-0.011, 0.042, -0.002);
    this.fist = new V3(1.12, 0.66, 1.1);
    this._ik = { eb: new V3(), wr: new V3(), S: new V3(), T: new V3(), pole: new V3(), y: new V3(), dir: new V3(), pal: new V3(), hk: new V3() };
    this._f = { F: new V3(), Left: new V3(), Right: new V3(), Back: new V3() };
  }

  /** The two finger parts (meshes hung on the hand bones, built in the hand's own frame): the rig shows, hides and counter-scales them. */
  setHands(left, right) { this.handL = left; this.handR = right; }

  enter() { this.on = true; }
  /** Put every bone back as the clip has it. */
  leave() {
    if (!this.ok) return;
    if (this.handL) this.handL.visible = this.handR.visible = false;
    for (const h of this.held) h.restore();
    this.on = false;
  }

  /**
   * Pose her for this frame (after the mixer and after the root's position and turn are set).
   *   grip   world point the bow's handle centre is held at
   *   hook   world point the string hand's fingers hook the string at
   *   aim    unit vector down the arrow
   *   draw   0..1 how far the string hand is back (it sets the elbow's lift)
   *   hold   0..1 how much she is in the shooting pose at all (blend in and out)
   *   follow 0..1 the follow-through of the string hand after the release (it springs back and out)
   */
  update(grip, hook, aim, draw, hold, follow) {
    if (!this.ok || !this.on) return;
    const B = this.b, p = this.p, I = this._ik, F = this._f;
    for (const h of this.held) h.begin();
    if (hold <= 0.001) {
      for (const h of this.held) { h.bone.scale.copy(h.scale); h.done(); }
      if (this.handL) this.handL.visible = this.handR.visible = false;
      return;
    }
    // the aim's frame
    F.F.set(aim.x, 0, aim.z).normalize();
    F.Left.crossVectors(UP, F.F).normalize();
    F.Right.copy(F.Left).negate();
    F.Back.copy(F.F).negate();
    const w = Math.min(1, hold);

    p.root.updateMatrixWorld(true);
    // ---- the body: the root is already turned side-on by the round; the chest turns back, the head looks down the arrow
    const side = STANCE.side * w;
    yawBone(B.spine, side * STANCE.chestBack);
    yawBone(B.head, side * (1 - STANCE.chestBack) * STANCE.head);
    p.root.updateMatrixWorld(true);
    // ---- the bow hand
    this._arm('L', grip, aim, F, 0, w);
    // ---- the string hand: at the nock, easing back and out on the follow-through
    I.hk.copy(hook);
    if (follow > 0) I.hk.addScaledVector(F.Back, 0.1 * follow).addScaledVector(F.Right, 0.16 * follow).addScaledVector(UP, 0.03 * follow);
    this._arm('R', I.hk, aim, F, draw, w, follow);
    if (w < 1) {          // easing in or out: part of the clip's pose stays
      for (const h of this.held) { h.bone.quaternion.slerpQuaternions(h.base, h.bone.quaternion, w); h.bone.updateMatrix(); }
      B.spine.updateWorldMatrix(false, true);
    }
    for (const h of this.held) h.done();
  }

  /** One arm: side 'L' (the bow hand holds `at` as its palm centre) or 'R' (the string hand hooks at `at`). */
  _arm(side, at, aim, F, draw, w, open = 0) {
    const B = this.b, I = this._ik, left = side === 'L';
    const ua = left ? B.uaL : B.uaR, fa = left ? B.faL : B.faR, ha = left ? B.haL : B.haR, held = left ? this.H.haL : this.H.haR;
    ua.parent.updateWorldMatrix(true, false);
    ua.updateWorldMatrix(false, false);
    I.S.setFromMatrixPosition(ua.matrixWorld);
    // the fingers' direction: along the aim, a little toward the body for the string hand
    // the string hand lets go on the release: the fist opens (the squash eases off, the hooked fingers fold away)
    const grasp = w * (1 - Math.min(1, open * 1.4));
    ha.scale.copy(held.scale).lerp(_sc.copy(held.scale).multiply(this.fist), grasp);
    const part = left ? this.handL : this.handR;
    if (part) { const g = Math.max(0.001, grasp / Math.max(w, 1e-3)); part.scale.set(g / ha.scale.x, g / ha.scale.y, g / ha.scale.z); part.visible = g > 0.05; }
    const pal = I.pal.copy(left ? this.palmL : this.palmR).multiply(ha.scale);
    const y = I.y;
    if (left) y.copy(aim).addScaledVector(UP, -0.12).normalize();
    else y.copy(aim).addScaledVector(F.Left, 0.55 + 0.4 * draw).normalize();
    // pole: the bow arm's elbow hangs a little out and down; the string arm's elbow goes high and back
    if (left) I.pole.set(0, -0.9, 0).addScaledVector(F.Left, 0.25).addScaledVector(F.Back, 0.1);
    else I.pole.copy(F.Back).multiplyScalar(0.8).addScaledVector(UP, 0.45 + 0.4 * draw).addScaledVector(F.Right, 0.3);
    let reach = 0;
    for (let it = 0; it < 2; it++) {
      handBasis(y, UP, _qh);
      // wrist = palm centre - the palm offset turned into world
      I.dir.copy(pal).applyQuaternion(_qh);
      I.T.copy(at).sub(I.dir);
      reach = solveArm(I.S, I.T, this.l1, this.l2, I.pole, I.eb, I.wr);
      // point the hand along the forearm a little (the wrist is not a hinge made of steel)
      y.copy(I.wr).sub(I.eb).normalize().lerp(left ? aim : F.F, 0.35).normalize();
    }
    // write the bones, root to tip
    aimBone(ua, I.dir.copy(I.eb).sub(I.S).normalize());
    fa.updateWorldMatrix(false, false);
    aimBone(fa, I.dir.copy(I.wr).sub(I.eb).normalize());
    ha.updateWorldMatrix(false, false);
    handBasis(y, UP, _qh);
    setWorldQ(ha, _qh);
    ha.updateWorldMatrix(false, true);
    // where the palm centre really is now
    (left ? this.gripL : this.hookR).copy(pal).applyQuaternion(_qh).add(_pb.setFromMatrixPosition(ha.matrixWorld));
    if (left) { this.reachL = reach; this.elbowL.copy(I.eb); this.shoulderL.copy(I.S); } else { this.reachR = reach; this.elbowR.copy(I.eb); this.shoulderR.copy(I.S); }
  }
}
