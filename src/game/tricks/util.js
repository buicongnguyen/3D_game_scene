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
