// © 2026 Bui Cong Nguyen · solluxlabs.com
// One shadow caster per map square for the buildings in it (phone speed plan, step 2).
//
// Each building throws its shadow with its own merged mesh: one shadow draw per building in the sun's box (14-15 a
// frame at Kawabe on a phone). Buildings never move and the story never hides them, so the casting parts of all the
// buildings in a 64 m square (engine/cell-grid.js) are joined into one depth-only mesh that only the shadow camera sees
// (layer SHADOW_ONLY), and the buildings stop casting themselves. The picture does not change: the same triangles
// cast, in fewer draws. Props (they stop casting on the phone tier) and the far scar trees (bare in some stories) stay
// as they are.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHADOW_ONLY } from './sky.js';

const tmp = new THREE.Matrix4();

/** grid: a CellGrid whose squares are filled; isBuilding(obj): true for a top-level object to include. -> meshes made */
export function mergeCellShadows(grid, isBuilding) {
  let made = 0;
  for (const c of grid.cells.values()) {
    const list = [];
    for (const o of c.group.children) {
      if (!isBuilding(o)) continue;
      o.traverse(m => {
        if (m.isMesh && !m.isInstancedMesh && !m.isSkinnedMesh && m.castShadow && m.name === 'merged' && m.geometry.index) list.push(m);
      });
    }
    if (list.length < 2) continue;
    c.group.updateWorldMatrix(true, true);
    const inv = c.group.matrixWorld.clone().invert();
    const geos = list.map(m => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', m.geometry.attributes.position.clone().applyMatrix4(tmp.multiplyMatrices(inv, m.matrixWorld)));
      g.setIndex(m.geometry.index.clone());
      return g;
    });
    const geo = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!geo) continue;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
    mesh.name = 'buildings:shadow';
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.layers.set(SHADOW_ONLY);
    c.group.add(mesh);
    for (const m of list) m.castShadow = false;
    made++;
  }
  return made;
}
