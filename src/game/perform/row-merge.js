// © 2026 Bui Cong Nguyen · solluxlabs.com
// One draw for a row of the group (game/perform/troupe.js; measured in docs/GROUP-PERFORMANCE.md).
//
// A row's members dance in unison but each is its own SkinnedMesh: a view draw, a shadow draw, a skeleton update and a
// bone-texture upload each, every frame. Here a row's followers become ONE skinned mesh:
//   geometry   their vertices put in their own bind space (each member's bindMatrix), joined; each vertex keeps its
//              member's number (aMember) and its joints are shifted into one combined skeleton
//   skeleton   the members' own bones, side by side (4 x 69 = 276): the troupe poses them as before, so the drawn mesh
//              follows exactly what the separate ones would (skinning is per bone: world = sum w * bone * inverse * p)
//   texture    the members' atlases in one grid, each cell with a margin that repeats its own picture (the few UVs a
//              little outside 0..1 read what they read before; no bleeding between members in the far mip levels)
//   faces      the morph targets joined by name; the shader reads each vertex's weights from its member's slot
//              (uRowMorph), which sync() fills from the members' own (hidden) meshes, where actors/face.js writes them
// The members' own meshes stay in the scene, hidden (their bones are still walked by engine/matrices.js), so the row
// can switch back (setMerged) and the faces need no change.
import * as THREE from 'three';

/** The margin around each member's picture in the joined texture (part of its own size). */
export const ATLAS_PAD = 1 / 16;

/** The grid for n pictures: { cols, rows } (2 x 2 for a row of 3 or 4). */
export const atlasGrid = n => { const cols = Math.ceil(Math.sqrt(n)); return { cols, rows: Math.ceil(n / cols) }; };

/** Where member i's 0..1 UVs land in the joined texture: uv' = off + uv * k. */
export function atlasCell(i, n, pad = ATLAS_PAD) {
  const { cols, rows } = atlasGrid(n), cx = i % cols, cy = Math.floor(i / cols);
  const kx = 1 / cols / (1 + 2 * pad), ky = 1 / rows / (1 + 2 * pad);
  return { off: [cx / cols + pad * kx, cy / rows + pad * ky], k: [kx, ky] };
}

/** Can these skinned meshes be joined? (one material kind, a map each, the same alpha/side, the same morph names) */
export function canMerge(meshes) {
  if (meshes.length < 2) return false;
  const a = meshes[0], m0 = a.material;
  if (!meshes.every(o => o.isSkinnedMesh && !Array.isArray(o.material) && o.geometry.attributes.skinIndex && o.geometry.attributes.uv)) return false;
  const names = Object.keys(a.morphTargetDictionary || {}).sort().join();
  return meshes.every(o => {
    const m = o.material;
    return m.type === m0.type && !!m.map === !!m0.map && m.alphaTest === m0.alphaTest && m.side === m0.side && m.transparent === m0.transparent
      && m.roughness === m0.roughness && m.metalness === m0.metalness && !m.normalMap && !m.emissiveMap && !m.roughnessMap
      && Object.keys(o.morphTargetDictionary || {}).sort().join() === names && !!o.geometry.morphAttributes.normal === !!a.geometry.morphAttributes.normal;
  });
}

/**
 * Join the geometry of skinned meshes (pure: no textures, no GPU). -> { geometry, bones, boneInverses, targets, morphIx }
 *   targets   the morph names in the joined geometry's order; morphIx[i][j]: member i's own index of target j
 */
export function mergeRowGeometry(meshes, { pad = ATLAS_PAD } = {}) {
  const n = meshes.length, total = meshes.reduce((s, o) => s + o.geometry.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const si = new Uint16Array(total * 4), sw = new Float32Array(total * 4), mem = new Float32Array(total);
  const targets = Object.keys(meshes[0].morphTargetDictionary || {}).sort((x, y) => meshes[0].morphTargetDictionary[x] - meshes[0].morphTargetDictionary[y]);
  const morphIx = meshes.map(o => targets.map(t => o.morphTargetDictionary[t]));
  const hasMN = !!meshes[0].geometry.morphAttributes.normal;
  const mp = targets.map(() => new Float32Array(total * 3)), mn = hasMN ? targets.map(() => new Float32Array(total * 3)) : null;
  const bones = [], boneInverses = [], index = [];
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(), uvm = new THREE.Matrix3(), u = new THREE.Vector2();
  let base = 0;
  meshes.forEach((o, i) => {
    const g = o.geometry, A = g.attributes, c = A.position.count, B = o.bindMatrix, jb = bones.length;
    nm.getNormalMatrix(B);
    const map = o.material.map; if (map) { if (map.matrixAutoUpdate) map.updateMatrix(); uvm.copy(map.matrix); } else uvm.identity();
    const cell = atlasCell(i, n, pad);
    for (let k = 0; k < c; k++) {
      const at = base + k;
      v.fromBufferAttribute(A.position, k).applyMatrix4(B); pos[at * 3] = v.x; pos[at * 3 + 1] = v.y; pos[at * 3 + 2] = v.z;
      if (A.normal) { v.fromBufferAttribute(A.normal, k).applyMatrix3(nm).normalize(); nor[at * 3] = v.x; nor[at * 3 + 1] = v.y; nor[at * 3 + 2] = v.z; }
      u.fromBufferAttribute(A.uv, k).applyMatrix3(uvm); uv[at * 2] = cell.off[0] + u.x * cell.k[0]; uv[at * 2 + 1] = cell.off[1] + u.y * cell.k[1];
      for (let q = 0; q < 4; q++) { si[at * 4 + q] = A.skinIndex.getComponent(k, q) + jb; sw[at * 4 + q] = A.skinWeight.getComponent(k, q); }
      mem[at] = i;
      targets.forEach((t, j) => {
        const ix = morphIx[i][j], P = g.morphAttributes.position?.[ix];
        if (P) { v.fromBufferAttribute(P, k); if (!g.morphTargetsRelative) v.sub(_p.fromBufferAttribute(A.position, k)); applyLinear(v, B); mp[j][at * 3] = v.x; mp[j][at * 3 + 1] = v.y; mp[j][at * 3 + 2] = v.z; }
        const N = mn && g.morphAttributes.normal?.[ix];
        if (N) { v.fromBufferAttribute(N, k); if (!g.morphTargetsRelative) v.sub(_p.fromBufferAttribute(A.normal, k)); v.applyMatrix3(nm); mn[j][at * 3] = v.x; mn[j][at * 3 + 1] = v.y; mn[j][at * 3 + 2] = v.z; }
      });
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) index.push(base + g.index.getX(k));
    else for (let k = 0; k < c; k++) index.push(base + k);
    bones.push(...o.skeleton.bones); boneInverses.push(...o.skeleton.boneInverses.map(m => m.clone()));
    base += c;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  out.setAttribute('aMember', new THREE.BufferAttribute(mem, 1));
  out.setIndex(new THREE.BufferAttribute(total > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1));
  if (targets.length) {
    out.morphAttributes.position = mp.map(a => new THREE.BufferAttribute(a, 3));
    if (mn) out.morphAttributes.normal = mn.map(a => new THREE.BufferAttribute(a, 3));
    out.morphTargetsRelative = true;
  }
  out.computeBoundingBox(); out.computeBoundingSphere();
  return { geometry: out, bones, boneInverses, targets, morphIx };
}
const _p = new THREE.Vector3();
// a morph offset is a direction in the bind space: the bind matrix's linear part only
const _l = new THREE.Matrix3();
function applyLinear(v, m) { return v.applyMatrix3(_l.setFromMatrix4(m)); }

/** The members' pictures in one grid (browser only: a canvas). -> THREE.CanvasTexture */
export function atlasTexture(maps, pad = ATLAS_PAD) {
  const n = maps.length, { cols, rows } = atlasGrid(n);
  if (!maps.every(m => m.image?.width > 0)) throw new Error('a member picture is not loaded');   // (the row stays unmerged)
  const S = Math.max(...maps.map(m => m.image.width)), cell = Math.round(S * (1 + 2 * pad)), P = Math.round(S * pad);
  const cv = document.createElement('canvas'); cv.width = cell * cols; cv.height = cell * rows;
  const cx = cv.getContext('2d');
  maps.forEach((m, i) => {
    const x0 = (i % cols) * cell, y0 = Math.floor(i / cols) * cell;
    cx.save(); cx.beginPath(); cx.rect(x0, y0, cell, cell); cx.clip();
    // the picture in the middle and its repeats around it, so the margin wraps like the member's own texture did
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cx.drawImage(m.image, x0 + P + dx * S, y0 + P + dy * S, S, S);
    cx.restore();
  });
  const t = new THREE.CanvasTexture(cv), s = maps[0];
  t.flipY = s.flipY; t.colorSpace = s.colorSpace; t.anisotropy = s.anisotropy; t.magFilter = s.magFilter; t.minFilter = s.minFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.name = 'troupe row atlas';
  return t;
}

/** A copy of the members' material that reads each vertex's morph weights from its member's slot. */
export function rowMaterial(src, map, members, targets) {
  const m = src.clone();
  m.name = 'Troupe row';
  if (map) m.map = map;
  // (four slots a row whatever its size: both rows share one shader program, one compile at the show's start)
  const T = targets, slots = new Float32Array(Math.max(1, Math.max(4, members) * T));
  m.userData.rowMorph = slots;
  m.onBeforeCompile = sh => {
    sh.uniforms.uRowMorph = { value: slots };
    const loop = (k, add) => `
#ifdef ${k}
	${add === 0 ? 'transformed' : 'objectNormal'} *= morphTargetBaseInfluence;
	{ int rowBase = int( aMember + 0.5 ) * MORPHTARGETS_COUNT;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) { float w = uRowMorph[ rowBase + i ]; if ( w != 0.0 ) ${add === 0 ? 'transformed' : 'objectNormal'} += getMorph( gl_VertexID, i, ${add} ).xyz * w; } }
#endif`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aMember;\nuniform float uRowMorph[ ${slots.length} ];`)
      .replace('#include <morphtarget_vertex>', T ? loop('USE_MORPHTARGETS', 0) : '#include <morphtarget_vertex>')
      .replace('#include <morphnormal_vertex>', T ? loop('USE_MORPHNORMALS', 1) : '#include <morphnormal_vertex>');
  };
  m.customProgramCacheKey = () => `troupe-row-${slots.length}`;
  return m;
}

/**
 * A row's followers drawn as one mesh. meshes: each member's own SkinnedMesh (posed by the troupe); parent: where the
 * joined mesh hangs (the formation). The members' meshes are hidden while it shows.
 */
export class RowMesh {
  constructor(meshes, parent, { atlas = true } = {}) {
    this.meshes = meshes;
    const { geometry, bones, boneInverses, targets, morphIx } = mergeRowGeometry(meshes);
    this.targets = targets; this.morphIx = morphIx;
    const map = atlas && meshes[0].material.map && typeof document !== 'undefined' ? atlasTexture(meshes.map(o => o.material.map)) : null;
    const material = rowMaterial(meshes[0].material, map, meshes.length, targets.length);
    const mesh = this.mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = 'troupe-row';
    // the influences three uploads itself stay 0: the shadow pass (three's own depth material) draws no faces
    mesh.morphTargetInfluences = targets.map(() => 0);
    mesh.morphTargetDictionary = Object.fromEntries(targets.map((t, i) => [t, i]));
    parent.add(mesh); mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones, boneInverses), new THREE.Matrix4());   // (attached: the vertices are in bind space)
    // culled as one: the row's members and an arm's reach around them (the bind pose's bounds would cut off a lifted arm)
    const c = new THREE.Vector3(), w = new THREE.Vector3(), inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const at = meshes.map(o => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv));
    for (const p of at) c.add(p); c.divideScalar(at.length); c.y += 1;
    const r = Math.max(...at.map(p => w.copy(p).setY(p.y + 1).distanceTo(c))) + 2.2;
    mesh.boundingSphere = new THREE.Sphere(c, r);
    mesh.receiveShadow = meshes[0].receiveShadow; mesh.castShadow = meshes[0].castShadow;
    this.merged = false;
    this.setMerged(true);
  }

  /** Copy the members' face weights into their slots (every frame the faces run). */
  sync() {
    if (!this.merged || !this.targets.length) return;
    const s = this.mesh.material.userData.rowMorph, T = this.targets.length;
    for (let i = 0; i < this.meshes.length; i++) { const inf = this.meshes[i].morphTargetInfluences, ix = this.morphIx[i]; for (let j = 0; j < T; j++) s[i * T + j] = inf[ix[j]] || 0; }
  }

  /** true: the joined mesh is drawn and the members' own hidden; false: the other way round (an A/B switch). */
  setMerged(on) {
    this.merged = on; this.mesh.visible = on && this.shown !== false;
    for (const o of this.meshes) o.visible = !on;
  }

  /** The row on or off (the members' models are hidden by the troupe; this hides the joined mesh with them). */
  show(on) { this.shown = on; this.mesh.visible = on && this.merged; }

  set castShadow(v) { this.mesh.castShadow = v; }

  dispose() {
    this.setMerged(false);
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose(); this.mesh.material.map?.dispose(); this.mesh.material.dispose(); this.mesh.skeleton.dispose();
  }
}
