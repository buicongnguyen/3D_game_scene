import { Object3D } from 'three';

// World matrices, once a frame, for the things that can be seen and have moved.
//
// three.js walks every object of the scene each frame and rebuilds both of its matrices, shown or not, moved or
// not. In the valley most objects are neither: the rooms of 21 houses, the people and animals beyond the draw
// distance (bones included) and every building and prop that just stands there. This pass
//   - skips hidden subtrees (their matrices go stale; they are rebuilt on the first frame they are shown again),
//   - recomposes a local matrix only when position, rotation or scale changed,
//   - multiplies a world matrix only when the object or an ancestor changed.
// Objects with their own updateMatrixWorld (cameras, audio, helpers) are handed to three.js unchanged.
//
// Explicit calls (obj.updateMatrixWorld(true), getWorldPosition, updateWorldMatrix) still go through three.js and
// stay correct, also on hidden objects.

const native = Object3D.prototype.updateMatrixWorld;
let stamp = 0;

function visit(o, parentChanged) {
  if (o.visible === false) return;
  // seen last frame? If not (new, or hidden until now) everything below is rebuilt
  const fresh = o._mwStamp !== stamp - 1;
  o._mwStamp = stamp;
  if (o.updateMatrixWorld !== native && !o.isSkinnedMesh) {
    o.updateMatrixWorld(parentChanged || fresh);
    for (const c of o.children) markSeen(c);
    return;
  }
  let changed = parentChanged || fresh || o.matrixWorldNeedsUpdate;
  if (o.matrixAutoUpdate) {
    const p = o.position, q = o.quaternion, s = o.scale;
    let c = o._mwTRS;
    if (c === undefined) { c = o._mwTRS = new Float64Array(10); c[0] = NaN; }
    if (c[0] !== p.x || c[1] !== p.y || c[2] !== p.z || c[3] !== q.x || c[4] !== q.y || c[5] !== q.z || c[6] !== q.w
      || c[7] !== s.x || c[8] !== s.y || c[9] !== s.z || fresh) {
      c[0] = p.x; c[1] = p.y; c[2] = p.z; c[3] = q.x; c[4] = q.y; c[5] = q.z; c[6] = q.w; c[7] = s.x; c[8] = s.y; c[9] = s.z;
      o.matrix.compose(p, q, s);
      changed = true;
    }
  }
  if (changed) {
    if (o.matrixWorldAutoUpdate === true) {
      if (o.parent === null) o.matrixWorld.copy(o.matrix);
      else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
    }
    o.matrixWorldNeedsUpdate = false;
    if (o.isSkinnedMesh) {
      if (o.bindMode === 'attached') o.bindMatrixInverse.copy(o.matrixWorld).invert();
      else if (o.bindMode === 'detached') o.bindMatrixInverse.copy(o.bindMatrix).invert();
    }
  }
  const ch = o.children;
  for (let i = 0, n = ch.length; i < n; i++) visit(ch[i], changed);
}

// a subtree three.js just updated itself: remember that it is current
function markSeen(o) {
  o._mwStamp = stamp;
  if (o._mwTRS !== undefined) o._mwTRS[0] = NaN;
  for (const c of o.children) markSeen(c);
}

/** Bring the world matrices of everything visible in `scene` up to date (call once, right before rendering). */
export function updateWorldMatrices(scene) {
  stamp++;
  visit(scene, false);
}
