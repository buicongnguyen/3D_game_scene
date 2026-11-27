// A group performance (content/troupe.js): Kotone and up to seven VRoid members in two rows of four, every row ONE
// group that dances in unison. The cost of a dancer is mostly its animation (a mixer blending two or three 69-bone
// clips, the foot hold, the face); here a row pays it once:
//   front row   Kotone's own performer (performer.js) poses her; right after her dance pose (before her mic layer) her
//               bones' local turns are copied to the three girls beside her
//   back row    ONE mixer on its source (nam-1, his own Club bake) plays a second routine of the same song
//               (plan.js planBacking: the same bar lines, other dances, no hand contact), the same foot hold as hers;
//               his bones are copied to the other three
// The copy: a follower's bone turns from ITS rest by the turn the source's bone made from the source's rest (a constant
// per bone, identity when the two rests match: the VRoid conversion gives nearly all bones the same rest), and the
// hips' travel scaled by the ratio of the leg lengths, so a taller body bounces as far as its legs reach and its planted
// feet stay put (scripts/troupe-check.mjs measures it). The sing-along: each member's face follows the song's mouth on
// chorus lines only (actors/face.js sing(..., when)), and only while the camera is near; blinks stay their own.
// Limits for slow phones (measured: docs/GROUP-PERFORMANCE.md): the back row at half rate, the back row's faces off, the
// back row without shadows; Sing & Play shows at most four on Low when that is still too slow.
import * as THREE from 'three';
import { poseDance } from './performer.js';
import { planBacking } from './plan.js';
import { createFootHold } from './foot-hold.js';
import { lineIndexAt, SINGING } from './mic-layer.js';
import { Face } from '../../actors/face.js';
import { TROUPE_LIMITS } from '../../content/troupe.js';

const NOT_COPIED = /^(root|grip_R|eye_[LR])$/;   // (the eyes are each face's own; the grip is a prop handle)

/** name -> { q, p } of a rig at rest (a fresh clone, or a clip pack's armature: in a packed pack, with its unused skin
 *  pruned, the joints load as plain nodes, not bones, so every named node counts). */
export function restPose(root) {
  const out = new Map();
  root.traverse(o => { if (o.name && !out.has(o.name)) out.set(o.name, { q: o.quaternion.clone(), p: o.position.clone() }); });
  return out;
}

/** Hip height over the ankles at rest (metres; the hips' travel is scaled by its ratio between two bodies). */
export function legLength(root) {
  root.updateWorldMatrix(true, true);
  const h = root.getObjectByName('hips'), f = root.getObjectByName('foot_L');
  if (!h || !f) return 1;
  return h.getWorldPosition(new THREE.Vector3()).y - f.getWorldPosition(new THREE.Vector3()).y;
}

/**
 * A copier from the source rig to one follower (same bone names). restSrc / restDst: restPose() of each. ->
 * { copy(), bones, corrected } (corrected: how many bones need the per-bone rest turn).
 */
export function makeCopier(src, dst, restSrc, restDst, { srcRest = src, legSrc = legLength(srcRest), legDst = legLength(dst), feet = 'auto' } = {}) {
  const pairs = [], srcBones = new Map();
  src.traverse(o => { if (o.isBone && !srcBones.has(o.name)) srcBones.set(o.name, o); });
  let corrected = 0, hips = null;
  dst.traverse(o => {
    if (!o.isBone || NOT_COPIED.test(o.name)) return;
    const s = srcBones.get(o.name), rs = restSrc.get(o.name), rd = restDst.get(o.name);
    if (!s || !rs || !rd) return;
    const K = rd.q.clone().multiply(rs.q.clone().invert());
    const same = Math.abs(Math.abs(K.w) - 1) < 1e-7;
    if (!same) corrected++;
    pairs.push({ s, d: o, K: same ? null : K });
    if (o.name === 'hips') hips = { s, d: o, ps: rs.p, pd: rd.p, k: legDst / Math.max(1e-3, legSrc) };
  });
  // Legs whose thigh : shin split differs from the source's (another body: heels, longer shins) skate under copied turns
  // even with the hips scaled right: their ankles are put where the source's are, scaled the same way (a two-bone solve
  // a leg, foot-hold.js reach). Bodies of the same build need nothing (the measured slide is the source's own).
  const legs = ['L', 'R'].map(s => {
    const n = k => `${k}_${s}`, b = (r, k) => r.getObjectByName(n(k));
    return { s: { thigh: b(src, 'thigh'), shin: b(src, 'shin'), foot: b(src, 'foot') }, d: { thigh: b(dst, 'thigh'), shin: b(dst, 'shin'), foot: b(dst, 'foot') } };
  }).filter(l => l.s.foot && l.d.foot);
  const seg = (r, a, b) => restLen(r, a, b);
  const split = r => seg(r, 'thigh_L', 'shin_L') / Math.max(1e-4, seg(r, 'shin_L', 'foot_L'));
  const mismatch = Math.abs(split(dst) / split(src) - 1);
  const ik = feet === 'auto' ? mismatch > IK_SPLIT : !!feet;
  if (ik) for (const l of legs) { l.restS = restAnkle(srcRest, l.s.foot.name); l.restD = restAnkle(dst, l.d.foot.name); }
  const k = hips?.k ?? 1, hipsD = dst.getObjectByName('hips');
  return {
    bones: pairs.length, corrected, hips, ik, mismatch,
    copy() {
      for (const e of pairs) { if (e.K) e.d.quaternion.multiplyQuaternions(e.K, e.s.quaternion); else e.d.quaternion.copy(e.s.quaternion); }
      if (hips) { const s = hips.s.position, d = hips.d.position; d.set(hips.pd.x + (s.x - hips.ps.x) * hips.k, hips.pd.y + (s.y - hips.ps.y) * hips.k, hips.pd.z + (s.z - hips.ps.z) * hips.k); }
      if (!ik) return;
      // the source's ankles in its model space (its world matrices are this frame's: its pose and foot hold just ran),
      // scaled like the hips onto the follower; solved only while the foot is near the floor (where a slide shows),
      // eased out over the next 5 cm of lift
      _inv.copy(src.matrixWorld).invert();
      for (const l of legs) {
        _a.setFromMatrixPosition(l.s.foot.matrixWorld).applyMatrix4(_inv).sub(l.restS);
        const w = 1 - smooth((_a.y - LEG_SOLVE.low) / LEG_SOLVE.ease);
        if (w < 1e-3) continue;
        _a.multiplyScalar(k).add(l.restD).applyMatrix4(dst.matrixWorld);
        legSolve(hipsD, l.d.thigh, l.d.shin, l.d.foot, _a, w);
      }
    },
  };
}
const IK_SPLIT = .01;   // a thigh : shin split 1 % off the source's: the legs are solved (measured: 2.5-3 cm/s slide without)
const LEG_SOLVE = Object.freeze({ low: .03, ease: .05 });   // m: an ankle up to 3 cm over its rest height is solved fully, none past 8 cm
const _inv = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const _H = new THREE.Vector3(), _K = new THREE.Vector3(), _A = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const _qf = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _q = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _m = new THREE.Matrix4();
const chain = (...bones) => { for (const b of bones) { b.updateMatrix(); b.matrixWorld.multiplyMatrices(b.parent.matrixWorld, b.matrix); } };
const worldTurn = (b, out) => out.setFromRotationMatrix(_m.extractRotation(b.matrixWorld));
/** Turn `bone` by the world rotation q (its parent's world matrix is current). */
const turn = (bone, q) => { worldTurn(bone.parent, _qp); bone.quaternion.premultiply(_q.copy(_qp).invert().multiply(q).multiply(_qp)); };
/**
 * Two-bone leg solve without walking the scene (foot-hold.js reach does a full world update per call): only this leg's
 * chain is recomposed from the hips down (the bones above stand still, their matrices are this frame's). The ankle goes
 * w of the way to `target`, the knee stays in its own bend plane, the foot keeps its world turn.
 */
function legSolve(hips, thigh, shin, foot, target, w = 1) {
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
function restLen(root, a, b) {
  root.updateWorldMatrix(true, true);
  const A = root.getObjectByName(a), B = root.getObjectByName(b);
  return A && B ? A.getWorldPosition(_a).distanceTo(B.getWorldPosition(_b)) : 1;
}
function restAnkle(root, name) { root.updateWorldMatrix(true, true); return root.getObjectByName(name).getWorldPosition(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert()); }

/** A chorus line is sung at t (from SINGING.pre before it to SINGING.post after it). */
export function chorusAt(lines, t) {
  if (!lines?.count) return false;
  const i = lineIndexAt(lines, t + SINGING.pre);
  return i >= 0 && lines.chorus[i] === 1 && t <= lines.e[i] + SINGING.post;
}

/** The back row's source: one mixer, the second routine, the foot hold. */
class RowDancer {
  constructor(model, clips, plan, clock) {
    this.model = model; this.plan = plan; this.clock = clock;
    this.mixer = new THREE.AnimationMixer(model); this.actions = new Map();
    for (const name of new Set([...plan.blocks.map(b => b.clip), ...plan.moments.map(m => m.clip)])) {
      const clip = clips.get(name); if (!clip) continue;
      const a = this.mixer.clipAction(clip); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = 0; a.setEffectiveWeight(0); a.play();
      this.actions.set(name, a);
    }
    this.feet = createFootHold(model);
  }
  pose(dt, t) {
    this.feet.restore();
    const fading = poseDance(this.plan, this.clock, this.actions, t);
    this.mixer.update(0);
    this.feet.update(dt, fading);
  }
  dispose() { this.feet.restore(); this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
}

export class Troupe {
  /**
   * lead: Kotone's Performer (started); leadModel: her model; leadRest: her rig at rest (her pack's armature);
   * members: [{ m (content/troupe.js entry), model (a fresh clone, at rest), clips (Map, the back row's source only) }];
   * opts: { backHalf, backFaces, backShadows } (the phone limits).
   */
  constructor(lead, leadModel, leadRest, members, opts = {}) {
    this.lead = lead; this.members = members; this.opts = { backHalf: false, backFaces: true, backShadows: true, ...opts };
    this.frame = 0; this.ms = 0; this.msN = 0;
    const rest = new Map(members.map(e => [e, restPose(e.model)]));
    const leadR = restPose(leadRest), leadLeg = legLength(leadRest);
    const front = members.filter(e => e.m.row === 0), back = members.filter(e => e.m.row === 1);
    this.front = front.map(e => makeCopier(leadModel, e.model, leadR, rest.get(e), { srcRest: leadRest, legSrc: leadLeg, feet: opts.feet ?? 'auto' }));
    const src = back.find(e => e.m.source);
    this.back = null;
    if (src?.clips?.size) {
      const plan = planBacking(lead.plan, { noContact: true });
      this.back = { dancer: new RowDancer(src.model, src.clips, plan, lead.clock), copiers: back.filter(e => e !== src).map(e => makeCopier(src.model, e.model, rest.get(src), rest.get(e), { feet: opts.feet ?? 'auto' })) };
    }
    // faces: blink of their own; the mouth on chorus lines
    const lines = lead.plan.lines, track = lead.data.mouth?.open ? lead.data.mouth : lead.data.lyrics;
    for (const e of members) {
      e.face = Face.attach(e.model);
      if (e.face && track) e.face.sing(track, () => lead.t, t => chorusAt(lines, t));
    }
    this.applyShadows();
    // at half rate the back row's bones stand still every other frame: their skeletons skip three's per-frame bone
    // matrices and bone-texture upload then too (same pose, same matrices; at full rate the tick moves every frame)
    this.backTick = 0;
    for (const e of back) e.model.traverse(o => {
      if (!o.isSkinnedMesh || o.skeleton.userData?.troupeHalf) return;
      const sk = o.skeleton, own = sk.update.bind(sk); let seen = -1;
      sk.userData = { ...(sk.userData || {}), troupeHalf: true };
      sk.update = () => { if (seen !== this.backTick || !sk.boneTexture) { seen = this.backTick; own(); } };
    });
    lead.onPose = (dt, t) => this.pose(dt, t);
  }

  get count() { return this.members.length + 1; }
  get plans() { return { front: this.lead.plan, back: this.back?.dancer.plan || null }; }

  applyShadows() {
    for (const e of this.members) { const cast = e.m.row === 0 || (this.opts.backShadows && TROUPE_LIMITS.shadowRows > 1); e.model.traverse(o => { if (o.isMesh) o.castShadow = cast; }); }
  }

  /** From the lead's performer, after her dance pose: both rows posed for song time t (one evaluation each). */
  pose(dt, t) {
    const t0 = performance.now();
    for (const c of this.front) c.copy();
    const b = this.back;
    if (b && (!this.opts.backHalf || (this.frame & 1) === 0)) {
      b.dancer.pose(this.opts.backHalf ? dt * 2 : dt, t);
      for (const c of b.copiers) c.copy();
      this.backTick++;
    }
    this.frame++;
    this.ms += performance.now() - t0; this.msN++;
  }

  /** Every frame (after the lead's pose): the faces near the camera. */
  update(dt, camera = null) {
    const t0 = performance.now();
    const cam = camera ? camera.getWorldPosition(_cam) : null, near = TROUPE_LIMITS.faceNear ** 2;
    for (const e of this.members) {
      const f = e.face; if (!f) continue;
      const on = Face.on && (e.m.row === 0 || this.opts.backFaces) && !!cam && e.model.getWorldPosition(_p).distanceToSquared(cam) < near;
      f.setEnabled(on);
      if (!on) continue;
      f.lookAt(cam); f.update(dt);
    }
    this.ms += performance.now() - t0;
  }

  /** Mean ms a frame spent posing and updating the members (the measurement's "JS in the performer update"). */
  takeMs() { const v = this.msN ? this.ms / this.msN : 0; this.ms = 0; this.msN = 0; return v; }

  dispose() {
    if (this.lead.onPose) this.lead.onPose = null;
    this.back?.dancer.dispose();
    for (const e of this.members) e.face?.sing(null);
  }
}
const _cam = new THREE.Vector3(), _p = new THREE.Vector3();
