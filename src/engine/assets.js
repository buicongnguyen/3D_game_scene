import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { separateCoplanar } from './coplanar.js';

// Materials the runtime drives by name (see art/CONTRACTS.md).
export const GLOW_MATERIALS = ['Window glow', 'Lamp glass', 'Lamp star', 'Lantern glow', 'Street glow', 'Porch glass', 'Headlamp glass', 'Tamo glow', 'Garland glow'];

/**
 * Loads GLBs from public/models and hands out clones. Static models share geometry and
 * materials; rigged models are cloned with SkeletonUtils and keep their clips.
 */
export class Assets {
  constructor(base = './models/') {
    this.base = base;
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.cache = new Map();
    this.missing = new Set();
    this.glow = new Map(); // material name -> Set<Material>, for night / lamp control
  }

  async load(names, onProgress) {
    let done = 0;
    await Promise.all(names.map(async n => {
      await this.get(n);
      onProgress?.(++done / names.length, n);
    }));
  }

  get(name) {
    if (!this.cache.has(name)) {
      this.cache.set(name, new Promise(resolve => {
        this.loader.load(`${this.base}${name}.glb`, gltf => {
          this.prepare(name, gltf);
          resolve(gltf);
        }, undefined, () => { this.missing.add(name); resolve(null); });
      }));
    }
    return this.cache.get(name);
  }

  prepare(name, gltf) {
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      for (const m of [o.material].flat()) {
        // Baked AO lives in COLOR_0; make sure it multiplies the base colour.
        if (o.geometry.attributes.color) m.vertexColors = true;
        if (GLOW_MATERIALS.includes(m.name)) {
          if (!this.glow.has(m.name)) this.glow.set(m.name, new Set());
          this.glow.get(m.name).add(m);
          if (!m.emissive || m.emissive.getHex() === 0) m.emissive = new THREE.Color('#ffb347');
          m.userData.baseEmissive = m.emissive.clone();
          m.emissiveIntensity = 0;
        }
      }
    });
    gltf.scene.userData.rigged = gltf.animations.length > 0;
    gltf.scene.userData.name = name;
    // Details modelled flush on larger faces (beams in plaster, trims, panes, coach panels) z-fight and
    // shimmer whenever the camera moves: nudge them a few millimetres proud of the face they sit on.
    if (!gltf.scene.userData.rigged) {
      const t0 = performance.now();
      try { gltf.scene.userData.coplanarFixed = separateCoplanar(gltf.scene); } catch (e) { console.warn(`coplanar fix skipped for ${name}`, e); }
      this.coplanarMs = (this.coplanarMs || 0) + performance.now() - t0;
    }
  }

  /** Synchronous clone of a loaded model (null if it failed or is not loaded yet). */
  clone(name) {
    const entry = this.resolved?.get(name);
    if (!entry) return null;
    const obj = entry.animations.length ? SkeletonUtils.clone(entry.scene) : entry.scene.clone(true);
    if (entry.animations.length) shareSkeletons(obj);
    obj.userData.clips = entry.animations;
    obj.userData.model = name;
    return obj;
  }

  /** After load(): make results available synchronously. */
  async finalize() {
    this.resolved = new Map();
    for (const [name, p] of this.cache) {
      const g = await p;
      if (g) this.resolved.set(name, g);
    }
  }

  has(name) { return this.resolved?.has(name) ?? false; }
  gltf(name) { return this.resolved?.get(name) ?? null; }

  /**
   * Geometry+material parts of a static model in model space, for instancing:
   * [{geometry, material, matrix}] — one entry per mesh primitive.
   */
  parts(name) {
    const g = this.gltf(name);
    if (!g) return [];
    const out = [];
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => {
      if (o.isMesh && !o.isSkinnedMesh) out.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone(), name: o.name, parent: o.parent?.name });
    });
    return out;
  }

  /** Set emissive glow for every material with this name (0..n). */
  setGlow(materialName, intensity, color) {
    const set = this.glow.get(materialName);
    if (!set) return;
    for (const m of set) {
      if (color) m.emissive.set(color);
      m.emissiveIntensity = intensity;
    }
  }
}

/**
 * SkeletonUtils.clone gives every skinned part of a character (skin, hair, shirt, shoes…) a skeleton of its own,
 * although they all hang on the same bones. Let the parts share one again: the bone matrices are then worked out
 * and sent to the GPU once per character and frame instead of once per part.
 */
export function shareSkeletons(root) {
  const kept = [];
  root.traverse(o => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    const s = o.skeleton;
    const same = kept.find(k => k.bones.length === s.bones.length && k.bones.every((b, i) => b === s.bones[i])
      && k.boneInverses.every((m, i) => m.equals(s.boneInverses[i])));
    if (same) { o.skeleton = same; s.dispose(); } else kept.push(s);
  });
}

/** Placeholder so the world still reads when a model is missing (e.g. while art is in progress). */
export function placeholder(name, size = [2, 2, 2], color = '#d9745a') {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  m.position.y = size[1] / 2;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  g.userData.placeholder = name;
  return g;
}
