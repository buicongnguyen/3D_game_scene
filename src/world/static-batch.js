import * as THREE from 'three';

const copies = new WeakMap();
/**
 * The copy of a material that instanced meshes use. three.js picks a different shader for an instanced and a plain mesh
 * with the same material, and switching between the two looked the program up again for each draw (the merged
 * buildings and the batched fences, signposts and viaduct share materials): one copy for all instanced uses instead.
 * A lit pane's copy is registered with the same glow set, so it lights up with the others.
 */
export function instancedMaterial(m, assets) {
  let c = copies.get(m);
  if (!c) {
    c = m.clone();
    c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;
    c.userData = { ...m.userData, source: m };
    const glow = assets?.glow?.get(m.name);
    if (glow?.has(m)) glow.add(c);
    copies.set(m, c);
  }
  return c;
}

/**
 * Turn the many separate copies of a small static model (fence panels) into a few instanced meshes.
 *
 * Each fence panel was its own object with one mesh per material: the orchard fence and the shrine hedges alone
 * were ~100 draw calls in view, and as many again in the shadow pass. Here the copies that are direct children of
 * `group` are replaced by one InstancedMesh per material and per ~48 m cell (so the far ones are still culled).
 * The picture is the same: same geometry, same materials, same places.
 *
 * keep: objects that must stay themselves (animated or toggled ones, such as the orchard gate).
 */
export function batchCopies(group, assets, names, { keep = new Set(), castShadow = true, cell = 48 } = {}) {
  let made = 0;
  for (const name of names) {
    const parts = assets.parts(name);
    if (!parts.length) continue;
    const cells = new Map();
    for (const o of [...group.children]) {
      if (o.userData.model !== name || keep.has(o) || o.userData.placeholder) continue;
      const key = `${Math.floor(o.position.x / cell)},${Math.floor(o.position.z / cell)}`;
      (cells.get(key) || cells.set(key, []).get(key)).push(o);
    }
    const M = new THREE.Matrix4();
    for (const list of cells.values()) {
      if (list.length < 2) continue;
      for (const o of list) o.updateMatrix();
      for (const part of parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, instancedMaterial(part.material, assets), list.length);
        list.forEach((o, i) => mesh.setMatrixAt(i, M.multiplyMatrices(o.matrix, part.matrix)));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        mesh.name = `${name}:batch`;
        mesh.userData.model = `${name}:batch`;
        group.add(mesh);
        made++;
      }
      for (const o of list) group.remove(o);
    }
  }
  return made;
}
