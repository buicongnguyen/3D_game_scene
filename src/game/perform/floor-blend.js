// © 2026 Bui Cong Nguyen · solluxlabs.com
// The body on the floor through a cross-fade into or out of floor work (the Breaking and Northern soul sequences'
// footwork, spins and floor spin: content/dance-sequences.js). After Avatar Studio Club mode's src/club/floor-blend.js
// (docs/club/PLAN.md "Breaking"): each floor loop is grounded on its own body by the bake (scripts/seq-bake.mjs), but a
// blend of a standing pose and a floor pose is neither: half way into a spin the body hangs in the air, into footwork
// the knees go through the floor. While such a cross-fade runs, apply() moves the hips up or down after the mixer's write
// so the lowest of a few hundred skin points of this body (each bone's extreme points: finger tips, heels, knee caps,
// the top of the head) rests on its own rest floor; restore() puts the hips back before the next mixer write (three's
// mixer skips a value that did not change since its own last write, as foot-hold.js).
//   skinPoints(root)            -> [[mesh, vertex index], ...]   (each bone's extreme skin points at rest)
//   lowestPoint(root, pts)      -> the lowest of them now, in root space (y)
//   createFloorBlend(root)      -> { restore(), apply(), floor, points } | null
import * as THREE from 'three';

const SKIP = /hair|lash|brow|eye|cornea|iris|teeth|tongue|nail|prop|mic/i;
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ...[[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]].map(d => d.map(x => x / Math.sqrt(3)))];
const _v = new THREE.Vector3(), _l = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _inv = new THREE.Matrix4();

/** Each bone's extreme skin points (14 directions in its own bind frame) of the visible skinned meshes under root. */
export function skinPoints(root) {
  root.updateMatrixWorld(true);
  const pts = [];
  root.traverse(m => {
    if (!m.isSkinnedMesh || SKIP.test(`${m.name} ${m.material?.name || ''}`)) return;
    const g = m.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!pos || !si || !sw) return;
    const ext = new Map();
    for (let i = 0; i < pos.count; i++) {
      let best = -1, bw = 0;
      for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > bw) { bw = w; best = si.getComponent(i, c); } }
      const inv = m.skeleton.boneInverses[best]; if (!inv) continue;
      _l.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix).applyMatrix4(inv);
      let e = ext.get(best); if (!e) ext.set(best, e = DIRS.map(() => [-Infinity, -1]));
      DIRS.forEach((d, j) => { const x = _l.x * d[0] + _l.y * d[1] + _l.z * d[2]; if (x > e[j][0]) e[j] = [x, i]; });
    }
    const seen = new Set();
    for (const e of ext.values()) for (const [, i] of e) if (i >= 0 && !seen.has(i)) { seen.add(i); pts.push([m, i]); }
  });
  return pts;
}

/** The lowest of the points now (root space; the caller has updated the world matrices). */
export function lowestPoint(root, pts) {
  _inv.copy(root.matrixWorld).invert();
  let lo = Infinity;
  for (const [m, i] of pts) { m.getVertexPosition(i, _v); m.localToWorld(_v).applyMatrix4(_inv); if (_v.y < lo) lo = _v.y; }
  return lo;
}

/** root: the body at rest (before any dance moves it). */
export function createFloorBlend(root) {
  const hips = root?.getObjectByName('hips');
  if (!hips) return null;
  const pts = skinPoints(root);
  if (!pts.length) return null;
  const floor = lowestPoint(root, pts);
  let shift = null;   // { x, y, z } added to the hips' position (its parent's space) by the last apply
  return {
    points: pts.length, floor,
    /** Before the mixer writes the next pose: the hips back to the mixer's own value. */
    restore() { if (!shift) return; hips.position.x -= shift.x; hips.position.y -= shift.y; hips.position.z -= shift.z; shift = null; },
    /** After the mixer wrote a blended pose: the lowest skin point onto the rest floor. */
    apply() {
      root.updateMatrixWorld(true);
      const need = floor - lowestPoint(root, pts);
      if (!Number.isFinite(need) || Math.abs(need) < 1e-4) return;
      // root-space up by `need` -> world -> the hips' parent space
      root.localToWorld(_a.set(0, 0, 0)); root.localToWorld(_b.set(0, need, 0));
      const par = hips.parent; par.worldToLocal(_a); par.worldToLocal(_b);
      shift = { x: _b.x - _a.x, y: _b.y - _a.y, z: _b.z - _a.z };
      hips.position.x += shift.x; hips.position.y += shift.y; hips.position.z += shift.z;
      hips.updateMatrixWorld(true);
    },
  };
}
