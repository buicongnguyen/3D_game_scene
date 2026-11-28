// © 2026 Bui Cong Nguyen · solluxlabs.com
// The buildings of a map square drawn with one call (phone speed plan, round 3, step R3-3).
//
// With one material for every merged part (engine/static-merge.js, `Merged PBR`) a building is one draw, or two with its
// shadowless details: 21-46 draws a frame on a phone at Takamori, the station and the meadow. Here the merged meshes of
// all the buildings in a 64 m square (engine/cell-grid.js) become one BatchedMesh per square: each building model's
// geometry once, each building one instance at its own place. three still culls every instance against the view
// (perObjectFrustumCulled) and the distance culling of each building (Structures.cull) still works: after each cull the
// square shows exactly the instances whose building is shown. One draw call (WEBGL_multi_draw) for what was 5-30.
// The buildings keep everything else (lit panes, lamps, named nodes); story-toggled things, kept nodes and whatever moves
// never enter a square (game.js `holdsNamed`, cell-grid.js). Without WEBGL_multi_draw three would draw every instance
// on its own: then nothing is joined. `?buildMerge=off`: as before.
import * as THREE from 'three';

/**
 * grid: a filled CellGrid; isBuilding(obj): a top-level object to include. Its meshes named 'merged' / 'merged-details'
 * with the one merged material are joined per square and per shadow flag. -> the batches (call mesh.userData.sync()
 * after each cull).
 */
export function mergeCellBuildings(grid, isBuilding) {
  const made = [];
  const tmp = new THREE.Matrix4();
  for (const c of grid.cells.values()) {
    const blds = c.group.children.filter(isBuilding);
    c.group.updateWorldMatrix(true, true);
    const inv = c.group.matrixWorld.clone().invert();
    const byKey = new Map();   // material | castShadow | receiveShadow -> [{ mesh, o }]
    for (const o of blds) o.traverse(m => {
      if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || m.isBatchedMesh || !m.material?.userData.pbr || !/^merged(-details)?$/.test(m.name)) return;
      for (let p = m; p && p !== o; p = p.parent) if (!p.visible) return;   // (a part hidden on its own is not touched)
      const k = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}`;
      (byKey.get(k) || byKey.set(k, []).get(k)).push({ mesh: m, o });
    });
    for (const list of byKey.values()) {
      if (list.length < 2) continue;
      const geos = [...new Set(list.map(e => e.mesh.geometry))];
      const nV = geos.reduce((a, g) => a + g.attributes.position.count, 0), nI = geos.reduce((a, g) => a + g.index.count, 0);
      const src = list[0].mesh;
      const bm = new THREE.BatchedMesh(list.length, nV, nI, src.material);
      bm.name = 'buildings:cell';
      bm.sortObjects = false;            // (opaque; the order inside one call does not change the picture)
      bm.perObjectFrustumCulled = true;  // (each building culled against the view, as each mesh was)
      bm.castShadow = src.castShadow; bm.receiveShadow = src.receiveShadow;
      const gid = new Map(geos.map(g => [g, bm.addGeometry(g)]));
      const items = list.map(({ mesh, o }) => {
        const id = bm.addInstance(gid.get(mesh.geometry));
        bm.setMatrixAt(id, tmp.multiplyMatrices(inv, mesh.matrixWorld));
        return { id, o };
      });
      bm.computeBoundingBox(); bm.computeBoundingSphere();
      bm.userData.sync = () => {
        let any = false;
        for (const { id, o } of items) { if (bm.getVisibleAt(id) !== o.visible) bm.setVisibleAt(id, o.visible); if (o.visible) any = true; }
        bm.visible = any;
      };
      bm.userData.sync();
      for (const { mesh } of list) mesh.removeFromParent();
      c.group.add(bm);
      made.push(bm);
    }
  }
  return made;
}
