// © 2026 Bui Cong Nguyen · solluxlabs.com
// The hand-mic grip, fitted on each body (any of the VRoid members can lead): where the handle sits in the right palm
// and a closed fist round it, measured on that body's own skin, so the mic neither sinks into the hand nor floats in a
// half-open one. Done once per model at the bind pose (a skeleton-only clone; no download, a few ms):
//   handle   across the palm on the knuckle line, tilted 15 deg (its pinky end toward the wrist, like a real power grip),
//            pushed out from the palm until the palm skin just clears it; its head end comes out over the thumb
//   fingers  index..pinky closed joint by joint about each finger's own hinge (the knuckle, then the middle and the end
//            joint), each one until its segment's skin touches the handle (or the joint's limit: animation-joint-rules R3)
//   thumb    closed over the front of the handle the same way, about the handle's axis (R4 limits)
//   lips     the lip centre in the head's frame (the mouthO morph's most-moved vertices): on sung lines the mic aims
//            4 cm in front of it (aimAt)
// fitMicGrip(model) -> { q: Map(bone name -> local quaternion), centre / axis (hand_R space), r, half, lip, aimAt, grip (mic in grip_R space), stats } | null
// MIC_GRIP: the handle (a 36 mm stage-mic handle), the contact gap and the joint caps.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const MIC_GRIP = Object.freeze({
  radius: .018,       // m: the handle (36 mm)
  tail: .045,          // m: the handle's tail below the little finger (mic-prop.js micGeometry)
  tilt: 0,           // deg: the handle's pinky end toward the wrist
  gap: .0006,         // m: a finger stops this far off the handle
  palmGap: .0008,     // m: the palm skin clears the handle by this
  step: .5,           // deg: the closing sweep (then refined)
  cap: { 1: 88, 2: 100, 3: 78 },              // deg: knuckle / middle / end joint flex (R3: 100 / 115 / 115)
  thumbCap: { 1: 40, 2: 55, 3: 65 },          // deg (R4: swing 80 from rest, IP / MCP flex 100)
  aimMax: 25,         // deg: the most the wrist turns to aim the capsule at the lips (R5: flexion 85, extension 75)
  ahead: 0,         // m: the capsule aims this far in front of the lips (the head's forward)
});
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const V = () => new THREE.Vector3();

/** The skinned vertices led by each bone (dominant weight), per mesh: Map(bone -> [[mesh, i], ...]). */
function skinByBone(root, test) {
  const out = new Map();
  root.traverse(m => {
    if (!m.isSkinnedMesh || /hair|lash|brow|eye|teeth|tongue/i.test(`${m.name} ${m.material?.name || ''}`)) return;
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight; if (!si || !sw) return;
    for (let i = 0; i < si.count; i++) {
      let best = -1, w = 0; for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > w) { w = x; best = si.getComponent(i, k); } }
      const b = m.skeleton.bones[best]; if (!b || !test(b)) continue;
      let l = out.get(b); if (!l) out.set(b, l = []); l.push([m, i]);
    }
  });
  return out;
}

/** The lip centre in `head`'s frame (bind pose): the head-led vertices the mouthO morph moves most (null without one). */
function lipPoint(root, head) {
  let best = null;
  root.traverse(m => {
    if (best || !m.isSkinnedMesh || !m.morphTargetDictionary) return;
    const key = m.morphTargetDictionary.mouthO ?? m.morphTargetDictionary.face_pucker ?? m.morphTargetDictionary.mouthA, d = key == null ? null : m.geometry.morphAttributes.position?.[key];
    if (!d) return;
    const g = m.geometry, rel = g.morphTargetsRelative, pos = g.attributes.position, len = new Float32Array(d.count); let mx = 0;
    for (let i = 0; i < d.count; i++) { len[i] = rel ? Math.hypot(d.getX(i), d.getY(i), d.getZ(i)) : Math.hypot(d.getX(i) - pos.getX(i), d.getY(i) - pos.getY(i), d.getZ(i) - pos.getZ(i)); mx = Math.max(mx, len[i]); }
    if (!(mx > 0)) return;
    const c = V(), v = V(); let n = 0;
    for (let i = 0; i < d.count; i++) if (len[i] > .5 * mx) { c.add(v.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix)); n++; }
    // bind space -> the head's frame at bind
    const k = m.skeleton.bones.indexOf(head); if (k < 0 || !n) return;
    best = c.multiplyScalar(1 / n).applyMatrix4(m.skeleton.boneInverses[k]);
  });
  return best;
}

const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _v = V(), _w = V();
/** Turn `bone` by `deg` about the world axis `axis` (its parent's world matrix current); its subtree's matrices follow. */
function turn(bone, axis, deg) {
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.premultiply(_q.setFromAxisAngle(axis, deg * Math.PI / 180).premultiply(_qp.clone().invert()).multiply(_qp));
  bone.updateMatrixWorld(true);
}

export function fitMicGrip(model, opts = {}) {
  const O = { ...MIC_GRIP, ...opts };
  if (!model.getObjectByName('hand_R') || !model.getObjectByName('index1_R') || !model.getObjectByName('pinky1_R')) return null;
  const root = cloneSkinned(model);
  root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1);
  root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.pose(); });   // (bind pose: the rest the clips are authored from)
  root.updateMatrixWorld(true);
  const B = n => root.getObjectByName(n), P = n => B(n).getWorldPosition(V());
  const hand = B('hand_R'), headB = B('head');
  const under = (b, top) => { for (let p = b; p; p = p.parent) if (p === top) return true; return false; };
  const skin = skinByBone(root, b => under(b, hand));
  const vpos = ([m, i], out) => m.getVertexPosition(i, out).applyMatrix4(m.matrixWorld);
  // the hand's frame at bind: fingers F (wrist -> mean knuckle), across A (pinky -> index knuckle), palm normal N = A x F
  const H = P('hand_R'), K = FINGERS.map(f => P(`${f}1_R`)), Km = K.reduce((a, b) => a.add(b), V()).multiplyScalar(1 / K.length);
  const F = Km.clone().sub(H).normalize(), A = K[0].clone().sub(K[3]); A.addScaledVector(F, -A.dot(F)).normalize();
  const N = A.clone().cross(F).normalize(), palmLen = Km.distanceTo(H);
  const tilt = O.tilt * Math.PI / 180, X = A.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(F, Math.sin(tilt)).normalize();
  const r = O.radius, half = K[0].distanceTo(K[3]) / 2 + .01, lo = -half - O.tail, hi = half + .012;
  // radial distance of a point from the handle's axis (Infinity off its length)
  let C = V();
  const radial = (p, a = lo, b = hi) => { _v.copy(p).sub(C); const ax = _v.dot(X); if (ax < a || ax > b) return Infinity; return _v.addScaledVector(X, -ax).length(); };
  const minR = (list, a, b) => { let m = Infinity; for (const e of list) m = Math.min(m, radial(vpos(e, _w), a, b)); return m; };
  // palm: hand-led skin on the palm side between 35 % and 105 % of the wrist -> knuckle length
  // (only where the handle lies, and nothing over 4 cm off the knuckles' plane: a cuff or a bracelet led by the hand)
  const palm = (skin.get(hand) || []).filter(e => { const p = vpos(e, V()).sub(H), al = p.dot(F), h = p.dot(N) - Km.clone().sub(H).dot(N); return al > .5 * palmLen && al < 1.05 * palmLen && h > -.004 && h < .04; });
  // the handle's centre: on the knuckle line a little toward the wrist, out from the palm until the palm skin clears it
  const base = Km.clone().addScaledVector(F, -.2 * r);
  let off = r;
  { let a = 0, b = .08; for (let it = 0; it < 20; it++) { const m = (a + b) / 2; C = base.clone().addScaledVector(N, m); if (minR(palm, -half, half) < r + O.palmGap) a = m; else b = m; } off = b; }
  C = base.clone().addScaledVector(N, off);
  // the skin of a chain as triangles (all three corners led by its bones; low-poly hands have few vertices a
  // segment, so their faces are sampled too): [mesh, a, b, c, segment]
  const trisOf = chain => {
    const idx = new Map(chain.map((b, k) => [b, k])), out = [];
    root.traverse(m => {
      if (!m.isSkinnedMesh || /hair|lash|brow|eye|teeth|tongue/i.test(`${m.name} ${m.material?.name || ''}`)) return;
      const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight; if (!si || !sw) return;
      const lead = i => { let best = -1, w = 0; for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > w) { w = x; best = si.getComponent(i, k); } } const sb = idx.get(m.skeleton.bones[best]); return sb === undefined ? -1 : sb; };
      const ix = m.geometry.index, n = ix ? ix.count : si.count, at = j => (ix ? ix.getX(j) : j);
      for (let t = 0; t + 2 < n; t += 3) { const c = [at(t), at(t + 1), at(t + 2)], s3 = c.map(lead), on = s3.filter(x => x >= 0); if (on.length === 3) out.push([m, ...c, Math.max(...on)]); }
    });
    return out;
  };
  const _a = V(), _b = V(), _c3 = V(), _s = V();
  const BARY = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [.5, .5, 0], [.5, 0, .5], [0, .5, .5], [1 / 3, 1 / 3, 1 / 3]];
  /** The nearest a chain's skin (segments >= from; the first segment past `skip` along its bone only) comes to the handle. */
  const chainR = (tris, from, skip) => {
    let mn = Infinity;
    for (const [m, i, j, k, seg] of tris) {
      if (seg < from) continue;
      m.getVertexPosition(i, _a).applyMatrix4(m.matrixWorld); m.getVertexPosition(j, _b).applyMatrix4(m.matrixWorld); m.getVertexPosition(k, _c3).applyMatrix4(m.matrixWorld);
      for (const [x, y, z] of BARY) { _s.set(0, 0, 0).addScaledVector(_a, x).addScaledVector(_b, y).addScaledVector(_c3, z); if (seg === 0 && skip && !skip(_s)) continue; mn = Math.min(mn, radial(_s)); }
    }
    return mn;
  };
  /**
   * Wrap a chain round the handle (after Avatar Studio's Moves v2 gripPose): its joints laid on a circle of radius rho
   * about the handle's axis (each bone aimed so its far joint lands on the circle, chords = bone lengths, turning the
   * `sign` way round the axis), rho the smallest that keeps the chain's skin `gap` off the handle. -> rho (m).
   */
  const wrap = (chain, sign, skip, maxTurn = 4.4, hinge = null) => {
    const flat = chain.map(b => b.quaternion.clone()), tris = trisOf(chain);
    // (the last bone's chord reaches past its end joint to the fingertip's flesh, so the tip lands on the circle too,
    // not inside it: a straight end segment between two circle points points its tip into the handle)
    const lens = chain.map((b, k) => { const nx = chain[k + 1] || b.children.find(c => c.isBone); return (nx ? P(nx.name).distanceTo(P(b.name)) : .02) * (k === chain.length - 1 ? 1.3 : 1); });
    const dirOf = b => { const nx = b.children.find(c => c.isBone); return (nx ? nx.position : b.position).clone().normalize().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())); };
    const aim = (b, to) => { const q0 = b.getWorldQuaternion(new THREE.Quaternion()), qd = new THREE.Quaternion().setFromUnitVectors(dirOf(b), to.clone().normalize()), pq = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); b.quaternion.copy(pq.multiply(qd.multiply(q0))); b.updateMatrixWorld(true); };
    const lay = rho => {
      chain.forEach((b, k) => b.quaternion.copy(flat[k])); chain[0].updateMatrixWorld(true);
      let turned = 0;
      chain.forEach((b, k) => {
        const p = P(b.name), dv = p.clone().sub(C), ax = dv.dot(X), rad = dv.addScaledVector(X, -ax), rk = rad.length(), L = lens[k];
        const c = (rk * rk + rho * rho - L * L) / (2 * rk * rho);
        const th = Math.min(Math.abs(c) <= 1 ? Math.acos(c) : 2 * Math.asin(Math.min(1, L / (2 * rho))), Math.max(0, maxTurn - turned)); turned += th;
        const u = rad.normalize().applyAxisAngle(X, sign * th), to = C.clone().addScaledVector(X, ax).addScaledVector(u, rho);
        // (a finger bends in its own plane: the aim keeps off its hinge, R3 spread)
        const dir = to.sub(p); if (hinge) dir.addScaledVector(hinge, -dir.dot(hinge));
        aim(b, dir);
      });
    };
    let lo = r + .001, hi = r + .035;
    for (let it = 0; it < 14; it++) { const m = (lo + hi) / 2; lay(m); if (chainR(tris, 0, skip) < r + O.gap) lo = m; else hi = m; }
    lay(hi);
    return hi;
  };
  const stats = { palmOffMm: +(off * 1000).toFixed(1), fingers: {} };
  // which way round the axis curls toward the palm: from the knuckles over the handle's far side (F) back to the palm
  const curl = Math.sign(Km.clone().sub(C).cross(F).dot(X)) || 1;
  for (const f of FINGERS) {
    const chain = [1, 2, 3].map(k => B(`${f}${k}_R`)).filter(Boolean); if (!chain.length) continue;
    const p0 = P(chain[0].name), d = (chain[1] ? P(chain[1].name) : p0.clone().addScaledVector(F, .03)).sub(p0), L = d.length(); d.normalize();
    // (the knuckle segment's palm webbing, its first 35 %, does not count as touching)
    stats.fingers[f] = +(wrap(chain, curl, q => q.clone().sub(p0).dot(d) > .35 * L, 4.4, d.clone().cross(N).normalize()) * 1000).toFixed(1);
  }
  // thumb: round the handle the other way, over its front toward the fingers
  const thumb = [1, 2, 3].map(k => B(`thumb${k}_R`)).filter(Boolean);
  if (thumb.length) stats.fingers.thumb = +(wrap(thumb, -curl, null, 2.2) * 1000).toFixed(1);
  const q = new Map();
  for (const f of [...FINGERS, 'thumb']) for (const k of [1, 2, 3]) { const b = B(`${f}${k}_R`); if (b) q.set(b.name, b.quaternion.clone()); }
  // the handle in hand_R's frame and in grip_R's (the mic hangs on grip_R: +Y the head end)
  const hq = hand.getWorldQuaternion(new THREE.Quaternion()), hInv = hq.clone().invert();
  const centre = C.clone().sub(H).applyQuaternion(hInv), axis = X.clone().applyQuaternion(hInv);
  const gripB = B('grip_R');
  let grip = null;
  if (gripB) {
    const toGrip = gripB.matrixWorld.clone().invert(), c = C.clone().applyMatrix4(toGrip), up = C.clone().add(X).applyMatrix4(toGrip).sub(c), s = up.length();
    grip = { centre: c, quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up.normalize()), scale: s };
  }
  const lip = headB ? lipPoint(root, headB) : null;
  // where the capsule points: a little in front of the lips (aimed at the lips themselves from below, the axis runs
  // through the chin and the turn drives the capsule into it; Avatar Studio's MIC_AIM holds it 4 cm ahead too)
  let aimAt = null;
  if (lip) { const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion).applyQuaternion(headB.getWorldQuaternion(new THREE.Quaternion()).invert()); aimAt = lip.clone().addScaledVector(fwd, O.ahead); }
  return { q, centre, axis, r, half, tail: O.tail, lip, aimAt, grip, stats };
}

/**
 * The capsule toward the mouth on sung lines: hand_R turned (about the wrist) by up to aimMax deg so the mic's axis
 * points at `lip` (fitMicGrip().aimAt: just in front of the lips), w of the way (the singing weight). mic: the mic mesh
 * (+Y its axis, head at headY), head: the head bone. Matrices of the arm must be current; the hand's subtree is refreshed.
 */
const _c = V(), _x = V(), _h = V(), _l = V(), _ax = V(), _qa = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _qi = new THREE.Quaternion();
export function aimMic(hand, mic, head, lip, w, headY, max = MIC_GRIP.aimMax) {
  if (!(w > 1e-3) || !lip || !mic) return 0;
  _l.copy(lip).applyMatrix4(head.matrixWorld);
  mic.updateWorldMatrix(true, false);
  mic.getWorldPosition(_c); _x.set(0, 1, 0).applyQuaternion(mic.getWorldQuaternion(_qa)).normalize();
  // exact for a turn about the wrist P: the axis line {C + s x} must pass the lips L after the turn, i.e. the turn takes
  // the line's point Q at L's distance from P (on the capsule's side) onto L
  hand.getWorldPosition(_h);
  const cp = _c.sub(_h), b = _x.dot(cp), c = cp.lengthSq() - _l.distanceToSquared(_h), disc = b * b - c;
  const sQ = disc >= 0 ? -b + Math.sqrt(disc) : -b;
  if (sQ < headY * .5) return 0;   // (the lips behind the capsule: no aim)
  _ax.copy(cp).addScaledVector(_x, sQ).normalize();   // P -> Q
  _l.sub(_h).normalize();                              // P -> L
  _qa.setFromUnitVectors(_ax, _l);
  const ang = 2 * Math.acos(Math.min(1, Math.abs(_qa.w))), lim = max * Math.PI / 180 * w;
  if (ang < 1e-4) return 0;
  if (ang > lim) _qa.slerp(_qi.identity(), 1 - lim / ang);
  hand.parent.getWorldQuaternion(_qh);
  hand.quaternion.premultiply(_qa.premultiply(_qi.copy(_qh).invert()).multiply(_qh));
  hand.updateMatrixWorld(true);
  const done = Math.min(ang, lim) * 180 / Math.PI;
  return done;
}
