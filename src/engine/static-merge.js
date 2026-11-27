// One draw for a building instead of eight (docs/play-zones and the draw-call pass of 2026-10-25): a static model's
// plain, opaque, single-coloured parts are merged into one mesh per roughness whose vertex colours carry each part's
// colour (times the baked shading already in COLOR_0), with one material per roughness shared by every merged model. Parts that must stay
// themselves stay: lit panes and lamps (driven at night by name), see-through ones,
// textured ones, and everything under a node the game looks up by name (the mill wheel, the bell, the chest lid...).
// The small details that cast no shadow (engine/assets.js NO_SHADOW_MATERIALS) merge into a second mesh that casts none.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Nodes the game finds by name inside models: what is under them is never merged. */
const KEEP_NODES = new Set(['Wheel', 'Bell', 'ChestLid', 'Chest', 'PorchFlame', 'Noticeboard', 'Flame', 'Gate', 'Door', 'Deck', 'Cab',
  'Garland', 'Inside', 'Scaffold', 'Smoke', 'Hive', 'lid', 'embers', 'straw_pile', 'Tip', 'Rod']);

/**
 * One material for every merged part (phone speed plan, round 3, step R3-3): roughness and metalness (in quarters, as
 * below) ride on each vertex (`aRM`), so a building is one draw (two with its shadowless details) instead of one per
 * roughness, and the buildings of a map square can then be joined (engine/cell-merge.js). `?buildMerge=off`: as before.
 */
export const BUILD_MERGE = !(typeof location !== 'undefined' && /[?&]buildMerge=off/.test(location.search));
let pbr = null;
export function mergedPbrMaterial() {
  return pbr ??= newPbrMaterial();
}
/** A material of that kind of one's own (one the world's snow patch does not reach: railway.js, the sleepers). */
export function newPbrMaterial() {
  const pbr = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, name: 'Merged PBR' });
  pbr.userData.pbr = true;
  pbr.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nflat varying vec2 vRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nflat varying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
  };
  pbr.customProgramCacheKey = () => 'merged-pbr';
  return pbr;
}

const shared = new Map();
/**
 * The material of every merged part with this roughness and metalness (both in quarters: glossy roof tiles keep their
 * night sheen, iron and brass keep their shine). Metal parts merge too, among themselves (phone speed plan, step 7:
 * a lantern's brass, a viaduct's iron beams were a draw each).
 */
function mergedMaterial(rough = 0.85, metal = 0) {
  const r = Math.round(rough * 4) / 4, m = Math.round(metal * 4) / 4, key = `${r}|${m}`;
  if (!shared.has(key)) shared.set(key, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r, metalness: m, name: m ? `Merged metal ${m} ${r}` : `Merged ${r}` }));
  return shared.get(key);
}

const kept = o => { for (let a = o; a; a = a.parent) if (KEEP_NODES.has(a.name)) return true; return false; };

/** position, normal, colour (part colour x baked shading) in the root's space, as plain float arrays, indexed. */
function bake(mesh, toRoot, rm) {
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color, n = pos.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  if (rm) { const RM = new Float32Array(n * 2); for (let i = 0; i < n; i++) { RM[i * 2] = rm[0]; RM[i * 2 + 1] = rm[1]; } rm = RM; }
  const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(toRoot), c = mesh.material.color;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(toRoot); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
    if (nor) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z; }
    const r = col ? col.getX(i) : 1, gg = col ? col.getY(i) : 1, b = col ? col.getZ(i) : 1;
    C[i * 3] = c.r * r; C[i * 3 + 1] = c.g * gg; C[i * 3 + 2] = c.b * b;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  if (rm) out.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
  out.setIndex(g.index ? Array.from({ length: g.index.count }, (_, i) => g.index.getX(i)) : Array.from({ length: n }, (_, i) => i));
  if (!nor) out.computeVertexNormals();
  return out;
}

/**
 * Merge `root`'s plain parts (see above). `noShadow`: material names whose parts cast no shadow. -> parts merged
 * (0 when there was nothing worth merging: fewer than three such parts).
 */
export function mergeStatic(root, { glow = new Set(), noShadow = new Set(), exact = false } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const pick = {};          // 'cast|quiet:roughness' -> meshes
  root.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const m = o.material;
    if (glow.has(m.name) || m.map || m.alphaMap || m.transparent || m.alphaTest > 0 || (m.emissiveIntensity > 0 && m.emissive?.getHex())) return;
    if (!o.geometry.attributes.position || kept(o)) return;
    const metal = Math.round((m.metalness ?? 0) * 4) / 4;
    (pick[BUILD_MERGE ? (noShadow.has(m.name) ? 'quiet' : 'cast') : `${noShadow.has(m.name) ? 'quiet' : 'cast'}:${Math.round((m.roughness ?? 0.85) * 4) / 4}:${metal}`] ??= []).push(o);
  });
  // (one material: two parts are worth one draw too; a model merged for the first time that way, or listed as exact,
  // keeps its exact roughness and metalness: the ones merged before keep their quarters, so nothing changes on screen)
  const parts = Object.values(pick).reduce((a, l) => a + l.length, 0);
  if (parts < (BUILD_MERGE ? 2 : 3)) return 0;
  if (parts < 3) exact = true;
  let n = 0;
  for (const [key, list] of Object.entries(pick)) {
    if (!list.length) continue;
    // (one material: each part's quartered roughness and metalness on its vertices)
    const q = v => exact ? v : Math.round(v * 4) / 4, rmOf = o => BUILD_MERGE ? [q(o.material.roughness ?? 0.85), q(o.material.metalness ?? 0)] : null;
    const geo = mergeGeometries(list.map(o => bake(o, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), rmOf(o))));
    if (!geo) continue;
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    const [kind, rough, metal] = key.split(':'), mesh = new THREE.Mesh(geo, BUILD_MERGE ? mergedPbrMaterial() : mergedMaterial(+rough, +metal));
    mesh.name = kind === 'cast' ? 'merged' : 'merged-details';
    mesh.castShadow = kind === 'cast'; mesh.receiveShadow = true;
    for (const o of list) o.removeFromParent();
    root.add(mesh);
    n += list.length;
  }
  return n;
}
