import * as THREE from 'three';
import { patchMaterial } from '../engine/effects.js';
import { PALETTES } from './seasons.js';
import { DECIDUOUS } from './scatter.js';

const FOLIAGE = { Leaves: 'leaves', Needles: 'needles', 'Maple leaves': 'maple', Blossom: 'blossom' };
const BARE_IN_WINTER = new Set(['Leaves', 'Maple leaves', 'Blossom']);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _sphere = new THREE.Sphere();

/**
 * One model placed many times: instanced meshes per primitive, with an optional low-poly LOD,
 * CPU frustum culling per instance and a distance cut-off.
 */
class InstanceSet {
  constructor(parent, assets, model, records, opts) {
    this.model = model;
    this.records = records;
    this.opts = opts;
    const lodParts = opts.lod && assets.has(opts.lod) ? assets.parts(opts.lod) : null;
    // Shadows come from cheap proxies (the LOD mesh when there is one) limited to the sun's shadow box,
    // so the full-detail trees are drawn once, not twice, and distant trees never enter the shadow pass.
    this.near = this.build(parent, assets.parts(model), records.length, opts.castShadow && !lodParts, opts.wind);
    this.far = lodParts ? this.build(parent, lodParts, records.length, false, opts.wind) : null;
    this.shadow = lodParts && opts.castShadow ? this.buildShadow(parent, lodParts, records.length) : null;
    // bounding radius from the model
    const box = new THREE.Box3();
    assets.gltf(model).scene.updateMatrixWorld(true);
    box.setFromObject(assets.gltf(model).scene);
    this.height = box.max.y;
    this.radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, box.max.y) * 0.6;
    this.matrices = records.map(r => {
      _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r.rot * Math.PI / 180);
      _s.set(r.s, r.s * (r.sy ?? 1), r.s);
      _p.set(r.x, r.y, r.z);
      return new THREE.Matrix4().compose(_p, _q, _s);
    });
    this.dirty = true;
  }

  build(parent, parts, n, castShadow, wind) {
    return parts.map(part => {
      const mat = part.material;
      const isFoliage = FOLIAGE[mat.name] !== undefined;
      patchMaterial(mat, { wind: isFoliage ? wind : 0 });
      const mesh = new THREE.InstancedMesh(part.geometry, mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.userData.partMatrix = part.matrix;
      mesh.userData.materialName = mat.name;
      mesh.name = `${this.model}:${mat.name}`;
      parent.add(mesh);
      return mesh;
    });
  }

  buildShadow(parent, parts, n) {
    return parts.map(part => {
      const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
      const mesh = new THREE.InstancedMesh(part.geometry, mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.userData.partMatrix = part.matrix;
      mesh.name = `${this.model}:shadow`;
      parent.add(mesh);
      return mesh;
    });
  }

  updateShadow(focus, range) {
    if (!this.shadow) return;
    const counts = new Array(this.shadow.length).fill(0);
    const r = range + this.radius * 1.5;
    for (let i = 0; i < this.records.length; i++) {
      const rec = this.records[i];
      if (Math.abs(rec.x - focus.x) > r || Math.abs(rec.z - focus.z) > r) continue;
      const M = this.matrices[i];
      for (let k = 0; k < this.shadow.length; k++) {
        const mesh = this.shadow[k];
        _m.multiplyMatrices(M, mesh.userData.partMatrix);
        _m.toArray(mesh.instanceMatrix.array, counts[k] * 16);
        counts[k]++;
      }
    }
    this.shadow.forEach((m, k) => { m.count = counts[k]; m.instanceMatrix.needsUpdate = true; });
  }

  update(camPos, frustum, nearDist, maxDist) {
    const nearCount = new Array(this.near.length).fill(0);
    const farCount = this.far ? new Array(this.far.length).fill(0) : null;
    const max = this.opts.maxDist ?? maxDist;
    for (let i = 0; i < this.records.length; i++) {
      const r = this.records[i];
      const d = Math.hypot(r.x - camPos.x, r.z - camPos.z);
      if (d > max) continue;
      _sphere.center.set(r.x, r.y + this.height * r.s * 0.5, r.z);
      _sphere.radius = this.radius * r.s;
      if (!frustum.intersectsSphere(_sphere)) continue;
      const useNear = d < nearDist || !this.far || r.story;
      const set = useNear ? this.near : this.far;
      const counts = useNear ? nearCount : farCount;
      const M = this.matrices[i];
      for (let k = 0; k < set.length; k++) {
        const mesh = set[k];
        _m.multiplyMatrices(M, mesh.userData.partMatrix);
        _m.toArray(mesh.instanceMatrix.array, counts[k] * 16);
        counts[k]++;
      }
    }
    this.near.forEach((m, k) => { m.count = nearCount[k]; m.instanceMatrix.needsUpdate = true; });
    this.far?.forEach((m, k) => { m.count = farCount[k]; m.instanceMatrix.needsUpdate = true; });
  }

  meshes() { return [...this.near, ...(this.far ?? [])]; }
}

export class Foliage {
  constructor(scene, assets, placed, quality) {
    this.group = new THREE.Group();
    this.group.name = 'foliage';
    scene.add(this.group);
    this.sets = [];
    this.nearDist = quality.trees >= 1 ? 120 : quality.trees >= 0.85 ? 95 : 70;
    this.maxDist = 1400;
    const byModel = (list, opts) => {
      const groups = new Map();
      for (const r of list) {
        if (!assets.has(r.model)) continue;
        if (!groups.has(r.model)) groups.set(r.model, []);
        groups.get(r.model).push(r);
      }
      for (const [model, records] of groups) this.sets.push(new InstanceSet(this.group, assets, model, records, typeof opts === 'function' ? opts(model) : opts));
    };
    byModel(placed.trees, model => ({ lod: `${model}-lod`, castShadow: true, wind: 1 }));
    byModel(placed.bushes, { castShadow: true, wind: 1, maxDist: 160 });
    byModel(placed.rocks, { castShadow: true, wind: 0, maxDist: 320 });
    byModel(placed.flowers, { castShadow: false, wind: 2, maxDist: 90 });
    byModel(placed.reeds, { castShadow: false, wind: 2, maxDist: 110 });
    byModel(placed.lilies, { castShadow: false, wind: 0, maxDist: 120 });
    this.frustum = new THREE.Frustum();
    this.shadowFocus = new THREE.Vector3(1e9, 0, 0);
    this.shadowRange = quality.shadowRange;
    this.lastPos = new THREE.Vector3(1e9, 0, 0);
    this.lastQuat = new THREE.Quaternion();
    this.season = null;
  }

  /** Rebuild the shadow-caster lists when the shadow box has moved noticeably. */
  updateShadows(focus) {
    if (focus.distanceToSquared(this.shadowFocus) < 16) return;
    this.shadowFocus.copy(focus);
    for (const s of this.sets) s.updateShadow(focus, this.shadowRange);
  }

  update(camera, force = false) {
    const moved = camera.position.distanceToSquared(this.lastPos) > 0.25 || Math.abs(camera.quaternion.dot(this.lastQuat)) < 0.9998;
    if (!moved && !force) return;
    this.lastPos.copy(camera.position);
    this.lastQuat.copy(camera.quaternion);
    camera.updateMatrixWorld();
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(_m);
    for (const s of this.sets) s.update(camera.position, this.frustum, this.nearDist, this.maxDist);
  }

  setSeason(season) {
    this.season = season;
    const p = PALETTES[season];
    const seen = new Set();
    for (const s of this.sets) {
      const deciduous = DECIDUOUS.has(s.model);
      for (const mesh of s.meshes()) {
        const name = mesh.userData.materialName;
        const key = FOLIAGE[name];
        if (key && !seen.has(mesh.material)) {
          seen.add(mesh.material);
          mesh.material.color.set(s.model === 'tree-peach' && name === 'Leaves' ? p.peachLeaves : p[key]);
        }
        mesh.visible = !(p.bareTrees && deciduous && BARE_IN_WINTER.has(name));
        if (name === 'Peach') mesh.visible = season === 'summer';
        if (s.model.startsWith('flowers') || s.model === 'lilypads') mesh.visible = season !== 'winter';
      }
    }
  }
}
