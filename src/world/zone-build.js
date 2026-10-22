// Play zones in the browser (docs/PLAY-ZONES-PLAN.md, world/zone.js): after the valley's builders have run for a zone,
// what stands well outside it is taken out of the scene. Shared geometry and materials stay (other copies use them).
import * as THREE from 'three';
import { outside, VIEW_MARGIN } from './zone.js';

const _box = new THREE.Box3(), _sphere = new THREE.Sphere();

/** Does `obj` lie wholly outside the zone (plus the margin)? Instanced batches and things that span the map never do. */
export function whollyOutside(obj, zone, margin = VIEW_MARGIN) {
  if (obj.isInstancedMesh || obj.userData.zoneKeep) return false;
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj, false);
  if (_box.isEmpty()) return outside(zone, obj.position.x, obj.position.z) > margin;
  _box.getBoundingSphere(_sphere);
  return outside(zone, _sphere.center.x, _sphere.center.z) - _sphere.radius > margin;
}

/** Remove the children of `root` that lie wholly outside the zone. -> how many were removed */
export function pruneOutside(root, zone, margin = VIEW_MARGIN) {
  if (!root) return 0;
  let n = 0;
  for (const child of [...root.children]) if (whollyOutside(child, zone, margin)) { child.removeFromParent(); n++; }
  return n;
}

// what the whole-scene pass leaves alone: things that move or follow Mika (people, animals, Tamo, the kite, particles),
// the rooms (built away from the valley), and what spans everything (terrain, river, sky, grass, forests, lights)
const KEEP = /^(npc:|critter:|player|tamo|star-kite|interiors|terrain|river|grass|foliage|sky|quick)/;
const GROUPS = new Set(['structures', 'railway', 'paddies', 'riverbed']);

/**
 * The whole scene, once the Director has put its set pieces in (the celebration decor, the tricks' sites): the big
 * groups are pruned child by child, every other top-level object wholly outside the zone goes, except the KEEP list,
 * lights, points and sprites. -> how many were removed
 */
export function pruneScene(scene, zone, margin = VIEW_MARGIN) {
  let n = 0;
  for (const c of [...scene.children]) {
    if (KEEP.test(c.name || '') || c.isLight || c.isPoints || c.isSprite || c.isCamera) continue;
    if (GROUPS.has(c.name)) n += pruneOutside(c, zone, margin);
    else if (whollyOutside(c, zone, margin)) { c.removeFromParent(); n++; }
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
