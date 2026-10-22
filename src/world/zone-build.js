// Play zones in the browser (docs/PLAY-ZONES-PLAN.md, world/zone.js): after the valley's builders have run for a zone,
// what stands well outside it is taken out of the scene. Shared geometry and materials stay (other copies use them).
import * as THREE from 'three';
import { outside, VIEW_MARGIN } from './zone.js';

const _box = new THREE.Box3(), _sphere = new THREE.Sphere();

/**
 * Remove the children of `root` that lie wholly outside the zone (plus the margin). Instanced batches and things that
 * span the map (rails, the river bed) have large bounds and stay. -> how many were removed
 */
export function pruneOutside(root, zone, margin = VIEW_MARGIN) {
  if (!root) return 0;
  let n = 0;
  for (const child of [...root.children]) {
    if (child.isInstancedMesh || child.userData.zoneKeep) continue;
    child.updateMatrixWorld(true);
    _box.setFromObject(child, false);
    if (_box.isEmpty()) {
      if (outside(zone, child.position.x, child.position.z) > margin) { child.removeFromParent(); n++; }
      continue;
    }
    _box.getBoundingSphere(_sphere);
    if (outside(zone, _sphere.center.x, _sphere.center.z) - _sphere.radius > margin) { child.removeFromParent(); n++; }
  }
  return n;
}

/** Placeholder boxes (a model the zone did not load) still standing inside the zone: should be none. */
export function placeholdersInside(scene, zone) {
  const found = [];
  scene.traverse(o => {
    if (!o.userData?.placeholder) return;
    const p = o.getWorldPosition(new THREE.Vector3());
    if (outside(zone, p.x, p.z) <= 0) found.push({ name: o.userData.placeholder, x: Math.round(p.x), z: Math.round(p.z) });
  });
  return found;
}
