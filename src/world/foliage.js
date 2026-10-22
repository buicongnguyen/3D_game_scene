import * as THREE from 'three';
import { patchMaterial } from '../engine/effects.js';
import { PALETTES } from './seasons.js';
import { DECIDUOUS } from './scatter.js';
import { getTropicalTrees, onTreeThemeChange, treeForTheme, bushForTheme, TROPICAL_TREES, TROPICAL_BUSHES } from './tree-theme.js';
import { TROPICAL_MODELS } from '../content/models.js';

const FOLIAGE = { Leaves: 'leaves', Needles: 'needles', 'Maple leaves': 'maple', Blossom: 'blossom' };
const BARE_IN_WINTER = new Set(['Leaves', 'Maple leaves', 'Blossom']);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _ld = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// LOD / cut-off hysteresis: a tree near a threshold, or a camera orbiting the player (up to ~11 m) near
// one, must not flip between its two meshes (or in and out of view) frame after frame. Band: 7%, >= 12 m.
const band = d => Math.max(d * 0.07, 12);

function shareTropicalAtlas(assets) {
  // The import contracts verify byte-identical atlases for this explicit model
  // family. Share their GPU texture before first render; keep each material's tint.
  const atlases = new Map(), replaced = new Set();
  for (const model of [...TROPICAL_TREES, ...TROPICAL_TREES.map(t => `${t}-lod`), ...TROPICAL_BUSHES]) {
    if (!assets.has(model)) continue;
    for (const { material } of assets.parts(model)) {
      const map = material.map;
      if (!material.name.startsWith('VN leaves') || map?.image?.width !== 2048 || map.image.height !== 1024) continue;
      const key = JSON.stringify([map.channel, map.colorSpace, map.wrapS, map.wrapT, map.magFilter, map.minFilter,
        map.anisotropy, map.flipY, map.premultiplyAlpha, map.generateMipmaps, map.format, map.type,
        map.offset.toArray(), map.repeat.toArray(), map.center.toArray(), map.rotation,
        map.matrixAutoUpdate, map.matrix.toArray()]);
      if (!atlases.has(key)) atlases.set(key, map);
      else if (atlases.get(key) !== map) { material.map = atlases.get(key); replaced.add(map); }
    }
  }
  for (const map of replaced) map.dispose();
}

/**
 * One model placed many times: instanced meshes per primitive, with an optional low-poly LOD,
 * CPU frustum culling per instance and a distance cut-off.
 */
// A part is drawn when its season shows it (setSeason) and it has instances this frame: an empty instanced mesh
// still costs the renderer a program and buffer set-up, in the main pass and in the shadow pass.
const show = m => { m.visible = m.userData.inSeason !== false && m.count > 0; };

class InstanceSet {
  constructor(parent, assets, model, records, opts) {
    this.model = model;
    this.records = records;
    this.opts = opts;
    const lodParts = opts.lod && assets.has(opts.lod) ? assets.parts(opts.lod) : null;
    // Shadows come from proxies (the cheap LOD mesh when there is one) chosen by the sun's shadow box, not by
    // the camera: the full-detail trees are drawn once, not twice, distant trees never enter the shadow pass,
    // and a bush or rock just outside the view still casts the shadow that falls into it (frustum-culled
    // casters made shadows pop in and out at the screen edges while the camera turned).
    this.near = this.build(parent, assets.parts(model), records.length, false, opts.wind);
    this.far = lodParts ? this.build(parent, lodParts, records.length, false, opts.wind) : null;
    this.shadow = opts.castShadow ? this.buildShadow(parent, lodParts || assets.parts(model), records.length) : null;
    this.state = new Uint8Array(records.length); // bit 0: using the far mesh, bit 1: beyond the cut-off
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
      const isFoliage = FOLIAGE[mat.name] !== undefined || mat.name.startsWith('VN leaves');
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
      const source = part.material;
      const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false,
        map: source.map, alphaMap: source.alphaMap, alphaTest: source.alphaTest, side: source.side });
      const mesh = new THREE.InstancedMesh(part.geometry, mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.userData.partMatrix = part.matrix;
      mesh.userData.materialName = part.material.name;
      mesh.name = `${this.model}:shadow`;
      parent.add(mesh);
      return mesh;
    });
  }

  /** Casters for the sun's shadow box: light-space square of half-size `range` around focus (+ margin). */
  updateShadow(focus, range, lightDir) {
    if (!this.shadow) return;
    const counts = new Array(this.shadow.length).fill(0);
    // same basis as the shadow camera (see Sky.update): x/y across the light, the box is 2*range wide
    _ld.copy(lightDir).normalize();
    _lx.crossVectors(UP, _ld).normalize();
    _ly.crossVectors(_ld, _lx);
    const fx = _lx.dot(focus), fy = _ly.dot(focus);
    for (let i = 0; i < this.records.length; i++) {
      const rec = this.records[i];
      // the shadow box moves 4 m before the lists are rebuilt: keep a margin for that and the crown
      const r = range + this.radius * rec.s * Math.max(1, rec.sy ?? 1) + 6;
      const px = _lx.x * rec.x + _lx.y * rec.y + _lx.z * rec.z, py = _ly.x * rec.x + _ly.y * (rec.y + this.height * rec.s * (rec.sy ?? 1) * 0.5) + _ly.z * rec.z;
      if (Math.abs(px - fx) > r || Math.abs(py - fy) > r) continue;
      const M = this.matrices[i];
      for (let k = 0; k < this.shadow.length; k++) {
        const mesh = this.shadow[k];
        _m.multiplyMatrices(M, mesh.userData.partMatrix);
        _m.toArray(mesh.instanceMatrix.array, counts[k] * 16);
        counts[k]++;
      }
    }
    this.shadow.forEach((m, k) => { m.count = counts[k]; m.instanceMatrix.needsUpdate = true; show(m); });
  }

  update(camPos, frustum, nearDist, maxDist, cam = camPos) {
    const nearCount = new Array(this.near.length).fill(0);
    const farCount = this.far ? new Array(this.far.length).fill(0) : null;
    const max = this.opts.maxDist ?? maxDist;
    const st = this.state, bandMax = band(max), bandNear = band(nearDist);
    for (let i = 0; i < this.records.length; i++) {
      const r = this.records[i];
      const d = Math.hypot(r.x - camPos.x, r.z - camPos.z);
      // hysteresis on the cut-off and on the LOD switch
      let s = st[i];
      if (s & 2) { if (d < max - bandMax) s &= ~2; } else if (d > max) s |= 2;
      if (s & 1) { if (d < nearDist - bandNear) s &= ~1; } else if (d > nearDist) s |= 1;
      st[i] = s;
      if (s & 2) continue;
      _sphere.center.set(r.x, r.y + this.height * r.s * (r.sy ?? 1) * 0.5, r.z);
      // Lists are only rebuilt after the camera moves 0.5 m or turns ~2.3 deg (Foliage.update), so cull
      // with that much slack: otherwise trees entering at the screen edge popped in a few frames late.
      _sphere.radius = this.radius * r.s * Math.max(1, r.sy ?? 1) + Math.hypot(r.x - cam.x, r.y - cam.y, r.z - cam.z) * 0.045 + 0.6;
      if (!frustum.intersectsSphere(_sphere)) continue;
      const useNear = !(s & 1) || !this.far || r.story;
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
    this.near.forEach((m, k) => { m.count = nearCount[k]; m.instanceMatrix.needsUpdate = true; show(m); });
    this.far?.forEach((m, k) => { m.count = farCount[k]; m.instanceMatrix.needsUpdate = true; show(m); });
  }

  meshes() { return [...this.near, ...(this.far ?? [])]; }
  shadowMeshes() { return this.shadow ?? []; }

  dispose() {
    for (const mesh of [...this.meshes(), ...this.shadowMeshes()]) {
      mesh.removeFromParent();
      mesh.dispose(); // instance buffers belong to this set; asset geometry/materials are shared
    }
    for (const mesh of this.shadowMeshes()) mesh.material.dispose();
  }
}

export class Foliage {
  constructor(scene, assets, placed, quality) {
    this.group = new THREE.Group();
    this.group.name = 'foliage';
    scene.add(this.group);
    this.assets = assets;
    shareTropicalAtlas(assets);
    this.trees = placed.trees;
    this.bushes = placed.bushes;
    this.treeSets = [];
    this.bushSets = [];
    this.perchBushes = new Set();
    this.modelHeights = new Map();
    this.sets = [];
    this.nearDist = quality.trees >= 1 ? 120 : quality.trees >= 0.85 ? 95 : 55;
    const k = quality.trees >= 0.85 ? 1 : 0.7;   // Low: small scatter is drawn out to 70 % of the usual distance
    this.maxDist = 1400;
    const byModel = (list, opts) => this.sets.push(...this.buildSets(list, opts));
    this.bushOpts = { castShadow: true, wind: 1, maxDist: 160 * k };
    byModel(placed.rocks, { castShadow: true, wind: 0, maxDist: 320 * k });
    byModel(placed.flowers, { castShadow: false, wind: 2, maxDist: 90 * k });
    byModel(placed.reeds, { castShadow: false, wind: 2, maxDist: 110 * k });
    byModel(placed.lilies, { castShadow: false, wind: 0, maxDist: 120 * k });
    this.frustum = new THREE.Frustum();
    this.shadowFocus = new THREE.Vector3(1e9, 0, 0);
    this.shadowDir = new THREE.Vector3(0, 1, 0);
    this.shadowRange = quality.shadowRange;
    this.scene = scene;
    this.lastPos = new THREE.Vector3(1e9, 0, 0);
    this.lastQuat = new THREE.Quaternion();
    this.season = null;
    this.theme = null;
    this.setTheme(getTropicalTrees());
    // the tropical models are not part of the first load: fetch them when the option is switched on, then change the scenery
    this.unsubscribeTheme = onTreeThemeChange(async enabled => {
      if (enabled && !TROPICAL_MODELS.every(m => this.assets.has(m))) {
        try { await this.assets.loadLater(TROPICAL_MODELS); shareTropicalAtlas(this.assets); } catch (e) { console.warn('tropical trees did not load', e); }
      }
      if (this.group.parent) this.setTheme(getTropicalTrees());
    });
  }

  buildSets(list, opts) {
    const groups = new Map();
    for (const r of list) {
      if (!this.assets.has(r.model)) continue;
      if (!groups.has(r.model)) groups.set(r.model, []);
      groups.get(r.model).push(r);
    }
    return [...groups].map(([model, records]) => new InstanceSet(this.group, this.assets, model,
      records, typeof opts === 'function' ? opts(model) : opts));
  }

  setTheme(enabled) {
    const theme = enabled ? 'tropical' : 'default';
    if (this.theme === theme) return;
    const records = this.trees.map(r => {
      const themed = treeForTheme(r, enabled);
      return this.assets.has(themed.model) ? themed : r;
    });
    const bushes = this.bushes.map(r => {
      if (this.perchBushes.has(r)) return r;
      const themed = bushForTheme(r, enabled);
      if (themed === r || !this.assets.has(themed.model)) return r;
      // Critter perches were planned against the original asset's exact top. Keep
      // that top even though fern and banana imports share a 1.2 m reference height.
      return { ...themed, sy: (r.sy ?? 1) * this.modelHeight(r.model) / this.modelHeight(themed.model) };
    });
    const next = this.buildSets(records, model => ({ lod: `${model}-lod`, castShadow: true, wind: 1 }));
    const nextBushes = this.buildSets(bushes, this.bushOpts);
    const old = new Set([...this.treeSets, ...this.bushSets]);
    for (const set of old) set.dispose();
    this.sets = [...next, ...nextBushes, ...this.sets.filter(set => !old.has(set))];
    this.treeSets = next;
    this.bushSets = nextBushes;
    this.theme = theme;
    if (this.season) this.setSeason(this.season);
    // Even a stationary, paused camera must populate the new instance and shadow buffers.
    this.lastPos.set(1e9, 0, 0);
    this.shadowFocus.set(1e9, 0, 0);
  }

  modelHeight(model) {
    if (!this.modelHeights.has(model)) {
      const scene = this.assets.gltf(model)?.scene;
      scene?.updateMatrixWorld(true);
      this.modelHeights.set(model, scene ? new THREE.Box3().setFromObject(scene).max.y : 0.6);
    }
    return this.modelHeights.get(model);
  }

  protectBushPerches(perches) {
    // Ferns and young bananas are open around their upper centers. Keep actual
    // insect landing bushes solid, including every neighbour they can fly to.
    const positions = new Set(perches.filter(p => !p.flower).map(p => `${p.x},${p.z}`));
    const count = this.perchBushes.size;
    for (const r of this.bushes) if (positions.has(`${r.x},${r.z}`)) this.perchBushes.add(r);
    if (this.perchBushes.size !== count && this.theme === 'tropical') {
      this.theme = null;
      this.setTheme(true);
    }
  }

  dispose() {
    this.unsubscribeTheme?.();
    for (const set of this.sets) set.dispose();
    this.sets = [];
    this.treeSets = [];
    this.bushSets = [];
    this.group.removeFromParent();
  }

  /** Rebuild the shadow-caster lists when the shadow box has moved or turned noticeably. */
  updateShadows(focus) {
    (this.lodFocus ??= new THREE.Vector3()).copy(focus);
    // the key light (sun or moon) is the scene's shadow-casting directional light, placed by Sky.update
    this.sun ??= this.scene.children.find(o => o.isDirectionalLight && o.castShadow) || this.scene.children.find(o => o.isDirectionalLight) || null;
    // shadows switched off (Settings → Shadows, light mode): no casters. Without a light direction the box test let
    // every tree in the valley through, each drawn again (invisibly) by the main pass: ~1 M triangles on the Low tier
    if (!this.sun?.castShadow) {
      if (this.shadowFocus.x !== 1e9) { for (const s of this.sets) s.shadow?.forEach(m => { m.count = 0; show(m); }); this.shadowFocus.set(1e9, 0, 0); }
      return;
    }
    const dir = _p.subVectors(this.sun.position, this.sun.target.position).normalize();
    if (focus.distanceToSquared(this.shadowFocus) < 16 && dir.dot(this.shadowDir) > 0.9995) return;
    this.shadowFocus.copy(focus);
    this.shadowDir.copy(dir);
    for (const s of this.sets) s.updateShadow(focus, this.shadowRange, dir);
  }

  update(camera, force = false) {
    const moved = camera.position.distanceToSquared(this.lastPos) > 0.25 || Math.abs(camera.quaternion.dot(this.lastQuat)) < 0.9998;
    if (!moved && !force) return;
    this.lastPos.copy(camera.position);
    this.lastQuat.copy(camera.quaternion);
    camera.updateMatrixWorld();
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(_m);
    // LOD and cut-off distances are measured from the player (last shadow focus) while the follow camera
    // orbits within a few metres of it, so orbiting never swaps meshes; from the camera in wide shots
    const f = this.lodFocus, c = camera.position;
    const ref = f && (f.x - c.x) ** 2 + (f.z - c.z) ** 2 < 15 * 15 ? f : c;
    for (const s of this.sets) s.update(ref, this.frustum, this.nearDist, this.maxDist, c);
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
        let on = !(p.bareTrees && deciduous && BARE_IN_WINTER.has(name));
        if (name === 'Peach') on = season === 'summer';
        if (s.model.startsWith('flowers') || s.model === 'lilypads') on = season !== 'winter';
        mesh.userData.inSeason = on;
        show(mesh);
      }
      // shadow proxies follow the season too (bare winter trees cast no leaf shadows)
      for (const mesh of s.shadowMeshes()) {
        const name = mesh.userData.materialName;
        mesh.userData.inSeason = !(p.bareTrees && deciduous && BARE_IN_WINTER.has(name)) && (name !== 'Peach' || season === 'summer');
        show(mesh);
      }
    }
  }
}
