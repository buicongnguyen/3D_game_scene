import { Object3D, Matrix4 } from 'three';

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
const nextWorld = new Matrix4();

function visit(o, parentChanged) {
  // (a hidden bone tree is still walked: it is hidden only from the renderer's own walk, see hideBoneTrees below)
  if (o.visible === false && o.userData.mwWalk !== true) return;
  // seen last frame, under the same parent, with the same matrixAutoUpdate? If not (new, hidden until now, moved to
  // another parent with the same local transform) everything below is rebuilt
  const fresh = o._mwStamp !== stamp - 1 || o._mwParent !== o.parent || o._mwAuto !== o.matrixAutoUpdate;
  o._mwParent = o.parent;
  o._mwAuto = o.matrixAutoUpdate;
  o._mwStamp = stamp;
  if (o.updateMatrixWorld !== native && !o.isSkinnedMesh) {
    o.updateMatrixWorld(parentChanged || fresh);
    for (const c of o.children) markSeen(c);
    return;
  }
  let changed = parentChanged || fresh || o.matrixWorldNeedsUpdate;
  let poseChanged = false;
  if (o.matrixAutoUpdate) {
    const p = o.position, q = o.quaternion, s = o.scale;
    let c = o._mwTRS;
    if (c === undefined) { c = o._mwTRS = new Float64Array(10); c[0] = NaN; }
    if (c[0] !== p.x || c[1] !== p.y || c[2] !== p.z || c[3] !== q.x || c[4] !== q.y || c[5] !== q.z || c[6] !== q.w
      || c[7] !== s.x || c[8] !== s.y || c[9] !== s.z || fresh) {
      c[0] = p.x; c[1] = p.y; c[2] = p.z; c[3] = q.x; c[4] = q.y; c[5] = q.z; c[6] = q.w; c[7] = s.x; c[8] = s.y; c[9] = s.z;
      o.matrix.compose(p, q, s);
      poseChanged = true;
      changed = true;
    }
  }
  if (changed) {
    if (o.matrixWorldAutoUpdate === true) {
      if (o.parent === null) nextWorld.copy(o.matrix);
      else nextWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
      // Explicit getWorldPosition/updateWorldMatrix calls dirty ancestors even if their
      // transform is identical. Do not force thousands of descendants in that case.
      changed = fresh || poseChanged || parentChanged || !nextWorld.equals(o.matrixWorld);
      o.matrixWorld.copy(nextWorld);
    } else {
      // Externally owned world matrices (including the scene) still invalidate children
      // when their actual value changes, not just when updateMatrix sets a dirty flag.
      changed = fresh || !o._mwManualWorld || !o._mwManualWorld.equals(o.matrixWorld);
      (o._mwManualWorld ??= new Matrix4()).copy(o.matrixWorld);
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
  o._mwParent = o.parent;
  if (o._mwTRS !== undefined) o._mwTRS[0] = NaN;
  for (const c of o.children) markSeen(c);
}

/** Bring the world matrices of everything visible in `scene` up to date (call once, right before rendering). */
export function updateWorldMatrices(scene) {
  stamp++;
  visit(scene, false);
}

/**
 * The same for a few subtrees only (focus mode, engine/focus.js: the rest of the scene is not drawn). Their parents are
 * taken as they stand. When the whole scene is walked again, everything else is rebuilt once (it missed a stamp).
 */
export function updateWorldSubtrees(roots) {
  stamp++;
  for (let i = 0, n = roots.length; i < n; i++) visit(roots[i], false);
}

// Bones are not drawn, but the renderer still walks every one of them each frame to find out (a village of people and
// animals is some 1,300 bones, more than half of what is visible there). A bone tree with nothing drawable in it is
// therefore hidden from that walk; this file's own pass keeps walking it, so the skeleton still moves.
// The mark lives in userData, which a clone copies along with `visible`.
const plain = o => o.isBone === true || o.type === 'Object3D' || o.type === 'Group';

/** Hide the bone trees of `root` that hold nothing to draw (call on a freshly cloned rigged model). */
export function hideBoneTrees(root) {
  const scan = o => {                       // -> true when the subtree has something other than bones and empties
    let content = !plain(o);
    const kids = o.children, quiet = [];
    for (let i = 0; i < kids.length; i++) { if (scan(kids[i])) content = true; else quiet.push(kids[i]); }
    // the highest content-free bones under a node that does have content (or under a non-bone) carry the mark
    if (content || !o.isBone) for (const k of quiet) if (k.isBone && k.visible) { k.visible = false; k.userData.mwWalk = true; }
    return content;
  };
  scan(root);
  return root;
}

// Something is fastened to a hidden bone tree later (a net in a hand, a halter on a head): show that tree again.
const add = Object3D.prototype.add;
Object3D.prototype.add = function (...objects) {
  add.apply(this, objects);
  for (let p = this; p !== null; p = p.parent) if (p.userData.mwWalk === true) { p.visible = true; p.userData.mwWalk = false; }
  return this;
};
