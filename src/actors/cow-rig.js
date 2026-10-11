// The things a ridden cow wears and the hay it is fed: a straw-padded blanket for a saddle, rope reins, and a haystack
// with a trough. All procedural: one merged, vertex-coloured mesh per thing, one shared material, built on first use.
// Shared by the free ride (actors/cow-ride.js) and the cow race (game/tricks/cowrace.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Where Mika sits, in the cow's own space (+Z forward). The cow model's back is about 1.27 m up, and Mika's Sit clip
 * drops her hips 0.45 m below her root, so the root is at back height minus that.
 */
export const SEAT = { x: 0, y: 1.36, z: 0.12 };
/** Her little rider friends are shorter: their Sit clip is the same 0.45 m hip drop. */
export const KID_SEAT = { x: 0, y: 1.36, z: 0.12 };

const _c = new THREE.Color();
/** A box (or other geometry) painted one colour, as a non-indexed-free merge input (position, normal, uv, color). */
function paint(geo, color, m) {
  if (m) geo.applyMatrix4(m);
  _c.set(color);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)).clone();
const box = (w, h, d, color, m) => paint(new THREE.BoxGeometry(w, h, d), color, m);
const cyl = (r0, r1, h, color, m, seg = 6) => paint(new THREE.CylinderGeometry(r0, r1, h, seg), color, m);

let mat = null, saddleGeo = null, hayGeo = null;
export function ridingMaterial() {
  return mat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
}

/** A rope from a to b that sags by `sag` metres, as short cylinders (n segments). */
function rope(parts, a, b, sag, color, r = 0.014, n = 7) {
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    if (prev) {
      const len = prev.distanceTo(p), mid = prev.clone().add(p).multiplyScalar(0.5);
      const dir = p.clone().sub(prev).normalize();
      Q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      parts.push(cyl(r, r, len * 1.06, color, M.compose(mid, Q, S.set(1, 1, 1)).clone(), 4));
    }
    prev = p;
  }
}

function buildSaddle() {
  const parts = [];
  // a thin straw pad, then a woven blanket with cream stripes that drapes a little over both flanks and a rolled front edge
  parts.push(box(0.46, 0.05, 0.6, '#d8b14c', at(0, 1.27, SEAT.z)));
  parts.push(box(0.52, 0.03, 0.7, '#d9553a', at(0, 1.305, SEAT.z)));
  for (const x of [-0.14, 0.14]) parts.push(box(0.05, 0.012, 0.7, '#fbefc9', at(x, 1.324, SEAT.z)));
  for (const sx of [-1, 1]) {
    parts.push(box(0.03, 0.1, 0.68, '#d9553a', at(sx * 0.28, 1.265, SEAT.z, 0, 0, sx * -0.6)));
    parts.push(box(0.034, 0.03, 0.68, '#fbefc9', at(sx * 0.315, 1.21, SEAT.z, 0, 0, sx * -0.6)));
    parts.push(cyl(0.012, 0.03, 0.1, '#f4c542', at(sx * 0.31, 1.17, SEAT.z - 0.3)));
  }
  parts.push(cyl(0.035, 0.035, 0.5, '#b8402a', at(0, 1.33, SEAT.z + 0.37, 0, 0, Math.PI / 2), 8));
  return mergeGeometries(parts);
}

/** The halter: a nose band and two cheek straps, in the head bone's space (+Z toward the nose). */
function buildHalter() {
  const parts = [];
  parts.push(paint(new THREE.TorusGeometry(0.115, 0.016, 5, 12), '#7a5630', at(0, -0.1, 0.2, 0, 0, 0)));
  parts.push(box(0.012, 0.016, 0.24, '#7a5630', at(0.12, 0.0, 0.14, 0, 0, 0)));
  parts.push(box(0.012, 0.016, 0.24, '#7a5630', at(-0.12, 0.0, 0.14, 0, 0, 0)));
  return mergeGeometries(parts);
}

let halterGeo = null, unitRope = null;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const HAND = [new THREE.Vector3(-0.1, 1.5, SEAT.z + 0.4), new THREE.Vector3(0.1, 1.5, SEAT.z + 0.4)];
const CHEEK = [new THREE.Vector3(-0.13, -0.02, 0.27), new THREE.Vector3(0.13, -0.02, 0.27)];

/**
 * A saddle blanket plus reins for a cow (parent it to the cow's root). The halter rides on the cow's head bone and the
 * two reins are stretched from its cheeks to Mika's hands every frame by rig.userData.update(). Geometry and material are
 * shared: do not dispose them. Take it off with disposeRigFor(rig) (removes the halter from the bone too).
 */
export function makeRig(cow) {
  saddleGeo ??= buildSaddle();
  halterGeo ??= buildHalter();
  unitRope ??= paint(new THREE.CylinderGeometry(0.013, 0.013, 1, 4), '#7a5630');
  const g = new THREE.Group();
  g.name = 'cow-rig';
  const sm = new THREE.Mesh(saddleGeo, ridingMaterial());
  sm.castShadow = false; sm.receiveShadow = false; sm.frustumCulled = false;
  g.add(sm);
  const head = cow?.getObjectByName?.('head') || null;
  let halter = null;
  if (head) { halter = new THREE.Mesh(halterGeo, ridingMaterial()); halter.frustumCulled = false; head.add(halter); }
  const ropes = [0, 1, 2, 3].map(() => { const r = new THREE.Mesh(unitRope, ridingMaterial()); r.frustumCulled = false; g.add(r); return r; });
  g.userData.halter = halter;
  g.userData.update = () => {
    if (!head) return;
    g.updateWorldMatrix(true, false);
    for (let i = 0; i < 2; i++) {
      _a.copy(CHEEK[i]); head.localToWorld(_a); g.worldToLocal(_a);
      _b.copy(HAND[i]);
      _m.addVectors(_a, _b).multiplyScalar(0.5); _m.y -= 0.12;       // the rope sags between the halter and the hands
      for (let k = 0; k < 2; k++) {
        const p0 = k ? _m : _a, p1 = k ? _b : _m, r = ropes[i * 2 + k];
        _d.subVectors(p1, p0);
        const len = _d.length() || 1e-3;
        r.position.addVectors(p0, p1).multiplyScalar(0.5);
        r.quaternion.copy(_q.setFromUnitVectors(UP, _d.multiplyScalar(1 / len)));
        r.scale.set(1, len, 1);
      }
    }
  };
  g.userData.update();
  return g;
}

/** Take a rig off its cow (the halter too). */
export function removeRig(rig) {
  if (!rig) return;
  rig.userData.halter?.removeFromParent();
  rig.removeFromParent();
}

function buildHay() {
  const parts = [];
  // a stack of golden straw: three overlapping rounded heaps, a wooden trough in front with a bundle in it
  parts.push(cyl(0.7, 0.95, 0.9, '#e0b64c', at(0, 0.45, 0), 9));
  parts.push(cyl(0.45, 0.7, 0.55, '#ebc65a', at(0, 1.15, 0), 9));
  parts.push(cyl(0.05, 0.4, 0.4, '#f1d36a', at(0, 1.58, 0), 9));
  for (const [x, z, r] of [[0.7, 0.5, 0.0], [-0.65, 0.55, 1], [0.1, -0.85, 2]]) parts.push(cyl(0.12, 0.12, 1.1, '#c8923a', at(x, 0.35, z, 1.2, r, 0.3), 5));
  parts.push(box(1.5, 0.3, 0.5, '#8a5a30', at(0, 0.15, 1.45)));
  parts.push(box(1.36, 0.1, 0.38, '#e8c04a', at(0, 0.34, 1.45)));
  for (const sx of [-1, 1]) parts.push(box(0.1, 0.22, 0.5, '#6e4524', at(sx * 0.7, 0.11, 1.45)));
  return mergeGeometries(parts);
}

/** The haystack with a feeding trough, standing on the ground at the origin, trough toward +Z. */
export function makeHaystack() {
  hayGeo ??= buildHay();
  const g = new THREE.Group();
  g.name = 'haystack';
  const m = new THREE.Mesh(hayGeo, ridingMaterial());
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return g;
}

/** Free the shared things (tests and a full teardown only; a ride keeps them between rides). */
export function disposeRig() {
  for (const g of [saddleGeo, halterGeo, unitRope, hayGeo]) g?.dispose();
  mat?.dispose();
  saddleGeo = halterGeo = unitRope = hayGeo = mat = null;
}

/** Gait bands: the cow clip, the matching rider clip and the speed the clip is authored for (art/CONTRACTS.md "Riding the cow"). */
export function gaitFor(v) {
  if (v < 0.4) return null;
  if (v < 2.0) return { cow: 'Walk', rider: 'RideCow', auth: 0.7 };
  if (v < 6.5) return { cow: 'Trot', rider: 'RideCowTrot', auth: 4.0 };
  return { cow: 'Gallop', rider: 'RideCowLean', auth: 9.0 };
}
/** Play the gait for speed v on a cow animator (or its rider's): clip by band, timeScale = speed / authored (0.6-1.4), short crossfade. Returns the band. */
export function playGait(anim, v, rider = false, fade = 0.2) {
  const g = gaitFor(v);
  if (!anim) return g;
  if (!g) { anim.play(rider ? (anim.has('RideCow') ? 'RideCow' : 'Idle') : 'Idle', { fade: 0.3 }); return g; }
  const name = rider ? g.rider : g.cow;
  anim.play(anim.has(name) ? name : (rider ? 'Sit' : 'Walk'), { speed: Math.max(0.6, Math.min(1.4, v / g.auth)), fade });
  return g;
}
export const riderPose = anim => (anim?.has('RideCow') ? 'RideCow' : anim?.has('Sit') ? 'Sit' : 'Idle');
