import * as THREE from 'three';
import { GLOW_MATERIALS } from './assets.js';

// One draw per character instead of eight.
//
// A villager is modelled as 8–10 skinned parts (skin, eyes, hair, shirt, trousers, shoes…) that differ only in colour
// and roughness. Drawn separately, a street with twenty people costs ~200 draw calls plus as many again in the
// shadow pass. Here the plain parts of one character become a single skinned mesh. The geometry is shared by every
// clone of the model; each vertex carries the number of the part it came from, and each character has a small
// palette (colour + roughness per part), so tinted shirts, trousers and hair still work.
//
// Parts that need their own material stay as they are: glowing, metallic, see-through or textured ones.

const MAX_PARTS = 16;
const cache = new Map();   // model name -> { key, geometry } | null (cannot be merged)

const plain = m => m && !Array.isArray(m) && m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial
  && !m.map && !m.normalMap && !m.roughnessMap && !m.metalnessMap && !m.emissiveMap && !m.alphaMap && !m.aoMap
  && !m.transparent && m.opacity === 1 && !m.alphaTest && m.metalness < 0.02 && m.side === THREE.FrontSide && !m.flatShading
  && (!m.emissive || m.emissive.getHex() === 0) && !GLOW_MATERIALS.includes(m.name) && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile;

function mergeGeometry(parts) {
  const names = ['position', 'normal', 'skinIndex', 'skinWeight'];
  const total = parts.reduce((n, o) => n + o.geometry.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const first = parts[0].geometry.attributes[name];
    if (parts.some(o => !o.geometry.attributes[name])) return null;
    const same = parts.every(o => {
      const a = o.geometry.attributes[name];
      return !a.isInterleavedBufferAttribute && a.array.constructor === first.array.constructor && a.itemSize === first.itemSize && a.normalized === first.normalized;
    });
    const size = first.itemSize;
    let arr, normalized = false;
    if (same && !first.isInterleavedBufferAttribute) {
      arr = new first.array.constructor(total * size); normalized = first.normalized;
      let at = 0;
      for (const o of parts) { const a = o.geometry.attributes[name]; arr.set(a.array.subarray(0, a.count * size), at); at += a.count * size; }
    } else {
      arr = name === 'skinIndex' ? new Uint16Array(total * size) : new Float32Array(total * size);
      let at = 0;
      for (const o of parts) {
        const a = o.geometry.attributes[name];
        for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) arr[at++] = a.getComponent(i, k);
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size, normalized));
  }
  // baked ambient occlusion (COLOR_0) stays in the vertices; the part colour comes from the palette
  const col = new Float32Array(total * 3), part = new Uint8Array(total);
  const index = [];
  let base = 0;
  parts.forEach((o, pi) => {
    const g = o.geometry, n = g.attributes.position.count, c = g.attributes.color;
    for (let i = 0; i < n; i++) {
      col[(base + i) * 3] = c ? c.getX(i) : 1; col[(base + i) * 3 + 1] = c ? c.getY(i) : 1; col[(base + i) * 3 + 2] = c ? c.getZ(i) : 1;
      part[base + i] = pi;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(base + g.index.getX(i));
    else for (let i = 0; i < n; i++) index.push(base + i);
    base += n;
  });
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  out.setIndex(new THREE.BufferAttribute(total > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

function paletteMaterial(src, palette) {
  const m = src.clone();
  m.name = 'Character palette';
  m.color.set('#ffffff');
  m.roughness = 1;
  m.vertexColors = true;
  const hook = sh => {
    sh.uniforms.uPal = { value: palette };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart;\nvarying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uPal[${MAX_PARTS}];\nvarying float vPart;`)
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec4 partLook = uPal[int(vPart + 0.5)];\ndiffuseColor.rgb *= partLook.rgb;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = partLook.a;');
  };
  m.onBeforeCompile = hook;
  m.customProgramCacheKey = () => 'character-palette';
  return m;
}

/**
 * Merge the plain skinned parts of a freshly cloned (and tinted) character into one mesh. Returns the merged mesh,
 * or null when the model is left as it is (fewer than two plain parts, parts on different skeletons, …).
 */
export function mergeSkinnedParts(model, modelName) {
  if (cache.get(modelName) === null) return null;
  const all = [];
  model.traverse(o => { if (o.isSkinnedMesh) all.push(o); });
  const first = all.find(o => plain(o.material));
  if (!first) return null;
  const parts = all.filter(o => plain(o.material) && o.skeleton === first.skeleton && o.parent === first.parent && o.bindMode === first.bindMode
    && o.bindMatrix.equals(first.bindMatrix) && o.matrix.equals(first.matrix) && !Object.keys(o.geometry.morphAttributes).length
    && o.material.envMapIntensity === first.material.envMapIntensity).slice(0, MAX_PARTS);
  if (parts.length < 2) return null;
  const key = parts.map(o => o.geometry.uuid).join('|');
  let entry = cache.get(modelName);
  if (!entry) {
    const geometry = mergeGeometry(parts);
    entry = geometry ? { key, geometry } : null;
    cache.set(modelName, entry);
    if (!entry) return null;
  }
  if (entry.key !== key) return null;   // this clone has other parts than the first one had: leave it alone
  const palette = [];
  for (let i = 0; i < MAX_PARTS; i++) {
    const m = parts[i]?.material;
    palette.push(m ? new THREE.Vector4(m.color.r, m.color.g, m.color.b, m.roughness) : new THREE.Vector4(1, 1, 1, 1));
  }
  const material = paletteMaterial(first.material, palette);
  first.geometry = entry.geometry;
  first.material = material;
  first.name = `${modelName}:body`;
  first.boundingSphere = null; first.boundingBox = null;
  for (const o of parts) if (o !== first) o.removeFromParent();
  return first;
}
