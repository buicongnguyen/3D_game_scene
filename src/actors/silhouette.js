// © 2026 Bui Cong Nguyen · solluxlabs.com
import * as THREE from 'three';

// Mika seen through what hides her: where a well, a house corner, a tree or a hill stands between her and the camera,
// a dithered golden shape of her shows on it, so the player never loses her.
//
// How: each of her body meshes gets a twin that shares its geometry and skeleton (no copy, no extra skinning work: a
// shared skeleton updates once a frame) and is drawn only where something is already nearer the camera (depth test
// GREATER). Order does the rest (renderOrder; engine/renderer.js sorts opaque draws by it first):
//   the world (0)  ->  her twins (SIL)  ->  her own meshes (BODY)  ->  the grass (AFTER, world/grass.js)
// Her own depth is not in the buffer yet when the twins draw, so her far arm never shows through her body; she then
// draws over the twins wherever she can be seen; the grass comes last, so its blades at her feet do not count as cover.
// The twins are opaque (a checker of discarded pixels reads as see-through without a sorted transparent pass) and
// cast no shadow. Cutscenes and scripted shots switch them off (actors/camera.js).

export const SIL_ORDER = 10, BODY_ORDER = 11, AFTER_ORDER = 12;

function silMaterial(color) {
  const m = new THREE.MeshBasicMaterial({ color, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false });
  m.onBeforeCompile = s => {
    s.fragmentShader = s.fragmentShader.replace('void main() {',
      'void main() {\n  if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;');
  };
  m.customProgramCacheKey = () => 'starline-silhouette';
  m.name = 'silhouette';
  return m;
}

export class Silhouette {
  /** model: the player's model (after any merge). Meshes added later (the lantern, held things) are not included. */
  constructor(model, color = '#ffc85a') {
    this.on = true;
    this.pairs = [];
    const mat = silMaterial(color);
    const meshes = [];
    model.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const src of meshes) {
      const twin = src.isSkinnedMesh ? new THREE.SkinnedMesh(src.geometry, mat) : new THREE.Mesh(src.geometry, mat);
      if (src.isSkinnedMesh) { twin.bindMode = src.bindMode; twin.bind(src.skeleton, src.bindMatrix); }
      twin.position.copy(src.position); twin.quaternion.copy(src.quaternion); twin.scale.copy(src.scale);
      twin.castShadow = twin.receiveShadow = false;
      twin.frustumCulled = src.frustumCulled;
      twin.renderOrder = SIL_ORDER;
      twin.name = `${src.name || 'part'}:silhouette`;
      src.renderOrder = BODY_ORDER;
      src.parent.add(twin);
      this.pairs.push([src, twin]);
    }
  }

  /** Shown (follow camera) or not (cutscenes); twins follow their mesh's own visibility. */
  show(on) {
    this.on = on;
    for (const [src, twin] of this.pairs) twin.visible = on && src.visible;
  }
}
