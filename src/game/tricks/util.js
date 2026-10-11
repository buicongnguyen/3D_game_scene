// Small helpers the trick rounds share (Node-safe: nothing here touches the DOM at import time).
import * as THREE from 'three';

const _box = new THREE.Box3(), _size = new THREE.Vector3();

/** Scale a model so its longest side is `size` metres (the artist's units may differ); returns the model. */
export function fit(model, size) {
  const d = _box.setFromObject(model).getSize(_size), m = Math.max(d.x, d.y, d.z) || 1;
  model.scale.multiplyScalar(size / m);
  return model;
}

/**
 * Free what a clone from the model library owns by itself. Geometry and materials belong to the library and are
 * shared by every clone, but each rigged clone has its own skeleton, and every skeleton its own bone texture on the
 * GPU: without this a round leaks one texture per skinned mesh (a fish is seven of them).
 */
export function disposeRigs(root) {
  root?.traverse?.(o => { if (o.isSkinnedMesh) o.skeleton?.dispose?.(); });
}

/** Add a trick's stylesheet to the page once. */
export function addCss(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

/**
 * Trample the grass in a disc of radius r round (x, z) (the splat map's grass channel, as the sweet potato roast does for its
 * hearth) and give back a function that puts it back. Null when the world has no splat map (a Node test).
 */
export function trampleGrass(world, x, z, r, pad = r + 2) {
  const sp = world?.splat;
  if (!sp?.paintDisc || !sp.data) return null;
  const i0 = Math.max(0, Math.floor(x - pad - sp.x0)), i1 = Math.min(sp.w - 1, Math.ceil(x + pad - sp.x0));
  const j0 = Math.max(0, Math.floor(z - pad - sp.z0)), j1 = Math.min(sp.h - 1, Math.ceil(z + pad - sp.z0));
  const rows = [];
  for (let j = j0; j <= j1; j++) rows.push(sp.data.slice((j * sp.w + i0) * 4, (j * sp.w + i1 + 1) * 4));
  sp.paintDisc(x, z, r, 3, 0, 1.2);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    rows.forEach((row, k) => sp.data.set(row, ((j0 + k) * sp.w + i0) * 4));
    sp.texture.needsUpdate = true;
  };
}
