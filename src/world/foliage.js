import * as THREE from 'three';
import { instancedMaterial } from './static-batch.js';
import { SHADOW_ONLY } from './sky.js';
import { writeInstanceMatrix } from '../engine/buffer-updates.js';
import { patchMaterial } from '../engine/effects.js';
import { PALETTES } from './seasons.js';
import { DECIDUOUS } from './scatter.js';
import { buildCells, cellOutside, cellOutsideShadowBox, VIEW_SLACK } from './cells.js';
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

const distanceState = (s, d, near, nearIn, max, maxIn) => {
  if (s & 2) { if (d < maxIn) s &= ~2; } else if (d > max) s |= 2;
  if (s & 1) { if (d < nearIn) s &= ~1; } else if (d > near) s |= 1;
  return s;
};

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
// (a merged mesh: while any of its parts is in season; the others fold away in its shader)
const show = m => { m.visible = (m.userData.parts ? m.userData.parts.some(p => p.userData.inSeason !== false) : m.userData.inSeason !== false) && m.count > 0; };

// ---- One draw per foliage model instead of one per material (phone speed plan, round 3, step R3-1).
// A tree was two instanced meshes (Bark + Leaves), a flower clump four or five, a rock two. The parts of one model
// that draw alike (same side, maps and attributes) become one instanced mesh whose vertices carry their part number
// (`aPart`); the shader puts each part back exactly where it was (its part matrix, per part in a uniform: the
// quantized models keep their part-local coordinates, so wind and snow read the same numbers as before) and reads that
// part's colour, emissive, roughness, metalness, wind weight and season switch from small uniform arrays, copied
// each frame from the part materials. Those materials stay the ones the game talks to: the seasons tint them, the
// peach orchard lights them, the sakura glow patches them. `?foliageMerge=off` (or Foliage.setMerge(false)): as before.
export const FOLIAGE_MERGE = !(typeof location !== 'undefined' && /[?&]foliageMerge=off/.test(location.search));
// The far (LOD) trees of every species in one BatchedMesh (R3-6), when the merge is on and the browser has WEBGL_multi_draw
// (without it three draws each tree on its own: then the per-species meshes stay). `?treeBatch=off` or setBatch(false).
const batchMaterials = new Map();
export const TREE_BATCH = !(typeof location !== 'undefined' && /[?&]treeBatch=off/.test(location.search));
const MAX_PARTS = 16;
const mergedCache = new WeakMap();   // first part's geometry -> Map(group key -> { geometry, material })
const attrKey = g => Object.keys(g.attributes).sort().map(n => { const a = g.attributes[n]; return `${n}:${a.itemSize}:${a.array.constructor.name}:${a.normalized}`; }).join(',');
const drawKey = (m, g) => [m.side, m.map?.uuid, m.alphaMap?.uuid, m.alphaTest, m.transparent, m.flatShading, m.vertexColors, m.isMeshStandardMaterial, attrKey(g), !!g.index].join('|');

function concatAttr(list, name) {
  const first = list[0].attributes[name], same = list.every(g => g.attributes[name].array.constructor === first.array.constructor && g.attributes[name].normalized === first.normalized);
  const n = list.reduce((a, g) => a + g.attributes[name].count, 0), size = first.itemSize;
  const out = new (same ? first.array.constructor : Float32Array)(n * size);
  let o = 0;
  for (const g of list) {
    const a = g.attributes[name];
    if (same && a.isInterleavedBufferAttribute) {   // (meshopt-decoded attributes are often interleaved: copy the raw values)
      const src = a.data.array, stride = a.data.stride;
      for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) out[o + i * size + c] = src[i * stride + a.offset + c];
    } else if (same) out.set(a.array.subarray(0, a.count * size), o);
    else for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) out[o + i * size + c] = a.getComponent(i, c);
    o += a.count * size;
  }
  return new THREE.BufferAttribute(out, size, same && first.normalized);
}

function mergedGeometry(geos) {
  const geo = new THREE.BufferGeometry();
  for (const name of Object.keys(geos[0].attributes)) geo.setAttribute(name, concatAttr(geos, name));
  const nV = geos.reduce((a, g) => a + g.attributes.position.count, 0), nI = geos.reduce((a, g) => a + (g.index ? g.index.count : g.attributes.position.count), 0);
  const part = new Uint8Array(nV), idx = new (nV > 65535 ? Uint32Array : Uint16Array)(nI);
  let v = 0, i = 0;
  geos.forEach((g, k) => {
    const n = g.attributes.position.count;
    part.fill(k, v, v + n);
    if (g.index) for (let j = 0; j < g.index.count; j++) idx[i++] = g.index.getX(j) + v;
    else for (let j = 0; j < n; j++) idx[i++] = j + v;
    v += n;
  });
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);   // (instanced and never culled by itself; part-local units)
  return geo;
}

/**
 * The merged material: a copy of the lead part's material (the swaying one: its wind and snow patch), white, with the
 * per-part tables. `parts`: [{ material, matrix, wind }]. The uniform values are filled by syncParts each frame.
 */
function mergedMaterial(model, parts, lead) {
  const N = parts.length, mat = lead.clone();
  mat.name = `${model}:merged`;
  mat.color.setRGB(1, 1, 1); mat.emissive?.setRGB(0, 0, 0); mat.vertexColors = true;
  const u = {
    uPartTS: { value: parts.map(() => new THREE.Vector4()) },
    uPartCol: { value: parts.map(() => new THREE.Vector4()) },   // rgb: colour, a: 1 for the sakura glow's parts
    uPartEmi: { value: parts.map(() => new THREE.Color()) },
    uPartPBR: { value: parts.map(() => new THREE.Vector4()) },
  };
  mat.userData = { ...lead.userData, merged: true, partUniforms: u, blossom: parts.some(p => p.material.name === 'Blossom') };
  const prev = lead.onBeforeCompile, prevKey = lead.customProgramCacheKey?.bind(lead);
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPart;
        uniform vec4 uPartTS[${N}], uPartPBR[${N}], uPartCol[${N}];
        uniform vec3 uPartEmi[${N}];
        flat varying vec4 vPartCol;
        flat varying vec3 vPartEmi;
        flat varying vec4 vPartPBR;
        mat4 ipm;`)
      // every later use of instanceMatrix (normals, position, the wind and snow patch, the sakura glow) sees
      // instance x part matrix, as the per-part meshes had it
      .replace('void main() {', `void main() {
        int fPart = int(aPart + 0.5);
        vec4 pts = uPartTS[fPart];
        mat4 partM = mat4(pts.w, 0.0, 0.0, 0.0, 0.0, pts.w, 0.0, 0.0, 0.0, 0.0, pts.w, 0.0, pts.xyz, 1.0);
        #ifdef USE_INSTANCING
          ipm = instanceMatrix * partM;
          #define instanceMatrix ipm
        #endif
        vPartCol = uPartCol[fPart]; vPartEmi = uPartEmi[fPart]; vPartPBR = uPartPBR[fPart];`)
      // (the far trees' BatchedMesh, R3-6: the same, on the batch's own matrix)
      .replace('#include <batching_vertex>', `#include <batching_vertex>
        #ifdef USE_BATCHING
          batchingMatrix = batchingMatrix * partM;
        #endif`)
      .replace('float amt = ', 'float amt = vPartPBR.z * ')
      // a part out of season (bare winter branches, peaches out of summer): all its corners on one point outside the view
      .replace('#include <project_vertex>', `#include <project_vertex>
        if (vPartPBR.w < 0.5) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        flat varying vec4 vPartCol;
        flat varying vec3 vPartEmi;
        flat varying vec4 vPartPBR;`)
      .replace('void main() {', `void main() {
        #undef CEL_MASK
        #define CEL_MASK vPartCol.a`)
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vPartEmi;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n        diffuseColor.rgb *= vPartCol.rgb;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPartPBR.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPartPBR.y;');
  };
  mat.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}-merged${N}`;
  mat.needsUpdate = true;
  return mat;
}

/** Copy the part materials' look into the merged material's tables (cheap: a handful of parts, once per draw). */
function syncParts(mesh) {
  const u = mesh.material.userData.partUniforms, parts = mesh.userData.parts;
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k], m = p.material, e = p.userData.partMatrix.elements;
    u.uPartTS.value[k].set(e[12], e[13], e[14], e[0]);
    u.uPartCol.value[k].set(m.color.r, m.color.g, m.color.b, m.name === 'Blossom' ? 1 : 0);
    if (m.emissive) u.uPartEmi.value[k].copy(m.emissive).multiplyScalar(m.emissiveIntensity); else u.uPartEmi.value[k].setRGB(0, 0, 0);
    u.uPartPBR.value[k].set(m.roughness ?? 1, m.metalness ?? 0, p.userData.windWeight, p.userData.inSeason === false ? 0 : 1);
  }
}

/** Part matrices that are a uniform scale and a move (what the quantized models carry): what the shader can rebuild. */
const plainMatrix = m => {
  const e = m.elements, s = e[0];
  return s > 0 && Math.abs(e[5] - s) < 1e-6 * s && Math.abs(e[10] - s) < 1e-6 * s && e[3] === 0 && e[7] === 0 && e[11] === 0 && e[15] === 1 &&
    [e[1], e[2], e[4], e[6], e[8], e[9]].every(v => v === 0);
};

class InstanceSet {
  constructor(parent, assets, model, records, opts, merge = false) {
    this.model = model;
    this.records = records;
    this.opts = opts;
    this.merge = merge;
    const lodParts = opts.lod && assets.has(opts.lod) ? assets.parts(opts.lod) : null;
    // Shadows come from proxies (the cheap LOD mesh when there is one) chosen by the sun's shadow box, not by
    // the camera: the full-detail trees are drawn once, not twice, distant trees never enter the shadow pass,
    // and a bush or rock just outside the view still casts the shadow that falls into it (frustum-culled
    // casters made shadows pop in and out at the screen edges while the camera turned).
    // near/far: one mesh per part (what the seasons and the festivals talk to); nearDraw/farDraw: what is drawn (the
    // merged meshes and the parts that stay alone; the same lists when nothing merges)
    [this.near, this.nearDraw] = this.build(parent, assets.parts(model), records.length, false, opts.wind);
    [this.far, this.farDraw] = lodParts ? this.build(parent, lodParts, records.length, false, opts.wind) : [null, null];
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
    this.cellsOn = true;                                    // false: test every record, as before (tests and A/B runs; a property so the bundler cannot fold it away)
    this.cells = buildCells(records, this.radius, this.height);
    this.distanceStates = new Int8Array(this.cells.length).fill(-1); // a skipped square's known uniform state, or -1
    this.cellsWereOn = this.cellsOn;
    this.whole = [{ idx: Int32Array.from(records.keys()), x: 0, y: 0, z: 0, r: Infinity }];   // (cells off: one square that is always walked)
    this.dirty = true;
  }

  build(parent, parts, n, castShadow, wind) {
    const mats = parts.map(part => {
      const mat = part.material;
      const isFoliage = FOLIAGE[mat.name] !== undefined || mat.name.startsWith('VN leaves');
      patchMaterial(mat, { wind: isFoliage ? wind : 0 });
      // (its own copy for the instances: a few single trees, on the landslide scar, share these materials as plain meshes)
      return { mat: instancedMaterial(mat), wind: isFoliage && wind ? 1 : 0 };
    });
    // the parts that can share one draw (R3-1): same draw state and attributes, plain part matrices
    const groups = new Map();
    if (this.merge && parts.length > 1) parts.forEach((part, k) => {
      const m = mats[k].mat;
      if (!m.isMeshStandardMaterial || !plainMatrix(part.matrix) || !part.geometry.attributes.position) return;
      const key = drawKey(m, part.geometry);
      (groups.get(key) || groups.set(key, []).get(key)).push(k);
    });
    const merged = [...groups.values()].filter(g => g.length > 1 && g.length <= MAX_PARTS);
    const inMerged = new Set(merged.flat());
    const handles = parts.map((part, k) => {
      // (a part drawn by a merged mesh keeps a one-slot mesh: its material and season flag are what the game sets)
      const mesh = new THREE.InstancedMesh(part.geometry, mats[k].mat, inMerged.has(k) ? 1 : n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.userData.partMatrix = part.matrix;
      mesh.userData.materialName = mats[k].mat.name;
      mesh.userData.windWeight = mats[k].wind;
      mesh.name = `${this.model}:${mats[k].mat.name}`;
      if (!inMerged.has(k)) parent.add(mesh);
      return mesh;
    });
    if (!merged.length) return [handles, handles];
    const drawn = [];
    let cache = mergedCache.get(parts[0].geometry);
    if (!cache) mergedCache.set(parts[0].geometry, cache = new Map());
    for (const g of merged) {
      const key = g.join(',');
      if (!cache.has(key)) {
        const lead = g.find(k => mats[k].wind) ?? g[0];
        cache.set(key, { geometry: mergedGeometry(g.map(k => parts[k].geometry)),
          material: mergedMaterial(this.model, g.map(k => ({ material: mats[k].mat })), mats[lead].mat) });
      }
      const { geometry, material } = cache.get(key);
      const mesh = new THREE.InstancedMesh(geometry, material, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.userData.parts = g.map(k => handles[k]);
      mesh.userData.materialName = 'merged';
      mesh.name = `${this.model}:merged`;
      mesh.onBeforeRender = () => syncParts(mesh);
      parent.add(mesh);
      drawn.push(mesh);
    }
    return [handles, [...drawn, ...handles.filter((_, k) => !inMerged.has(k))]];
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
      mesh.layers.set(SHADOW_ONLY);   // drawn into the shadow map only: in the view it wrote nothing and still cost a draw
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
    for (const cell of this.cellsOn ? this.cells : this.whole) {
      if (cellOutsideShadowBox(cell, _lx, _ly, fx, fy, range)) continue;       // (a whole square outside the box: cells.js)
      for (let n = 0; n < cell.idx.length; n++) {
        const i = cell.idx[n], rec = this.records[i];
        // the shadow box moves 4 m before the lists are rebuilt: keep a margin for that and the crown
        const r = range + this.radius * rec.s * Math.max(1, rec.sy ?? 1) + 6;
        const px = _lx.x * rec.x + _lx.y * rec.y + _lx.z * rec.z, py = _ly.x * rec.x + _ly.y * (rec.y + this.height * rec.s * (rec.sy ?? 1) * 0.5) + _ly.z * rec.z;
        if (Math.abs(px - fx) > r || Math.abs(py - fy) > r) continue;
        const M = this.matrices[i];
        for (let k = 0; k < this.shadow.length; k++) {
          const mesh = this.shadow[k];
          _m.multiplyMatrices(M, mesh.userData.partMatrix);
          writeInstanceMatrix(mesh.instanceMatrix, counts[k], _m);
          counts[k]++;
        }
      }
    }
    this.shadow.forEach((m, k) => { m.count = counts[k]; show(m); });
  }

  update(camPos, frustum, nearDist, maxDist, cam = camPos) {
    const nearCount = new Array(this.nearDraw.length).fill(0);
    const farCount = this.far ? new Array(this.farDraw.length).fill(0) : null;
    const max = this.opts.maxDist ?? maxDist;
    const st = this.state, bandMax = band(max), bandNear = band(nearDist);
    const nearIn = nearDist - bandNear, maxIn = max - bandMax;
    if (this.cellsWereOn !== this.cellsOn) { this.distanceStates.fill(-1); this.cellsWereOn = this.cellsOn; }
    const cells = this.cellsOn ? this.cells : this.whole;
    this.batch?.vis.fill(0);
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      // a whole square past the cut-off or outside the view has nothing to draw (cells.js)
      if (cellOutside(cell, camPos, cam, max, frustum, _sphere)) {
        // Distance hysteresis still advances while looking away, just as on the old per-record path. Most skipped
        // squares are wholly past both distances: set their uniform state once, then skip every record again.
        const d = Math.hypot(cell.x - camPos.x, cell.z - camPos.z);
        const cut = d - cell.r > max ? 2 : d + cell.r < maxIn ? 0 : -1;
        const lod = d - cell.r > nearDist ? 1 : d + cell.r < nearIn ? 0 : -1;
        const uniform = cut < 0 || lod < 0 ? -1 : cut | lod;
        if (uniform < 0) {
          for (const i of cell.idx) {
            const r = this.records[i];
            st[i] = distanceState(st[i], Math.hypot(r.x - camPos.x, r.z - camPos.z), nearDist, nearIn, max, maxIn);
          }
        } else if (this.distanceStates[c] !== uniform) {
          for (const i of cell.idx) st[i] = uniform;
        }
        this.distanceStates[c] = uniform;
        continue;
      }
      if (this.cellsOn) this.distanceStates[c] = -1;
      for (let n = 0; n < cell.idx.length; n++) {
        const i = cell.idx[n], r = this.records[i];
        const d = Math.hypot(r.x - camPos.x, r.z - camPos.z);
        // hysteresis on the cut-off and on the LOD switch
        const s = distanceState(st[i], d, nearDist, nearIn, max, maxIn);
        st[i] = s;
        if (s & 2) continue;
        _sphere.center.set(r.x, r.y + this.height * r.s * (r.sy ?? 1) * 0.5, r.z);
        // Lists are only rebuilt after the camera moves 0.5 m or turns ~2.3 deg (Foliage.update), so cull
        // with that much slack: otherwise trees entering at the screen edge popped in a few frames late.
        _sphere.radius = this.radius * r.s * Math.max(1, r.sy ?? 1) + Math.hypot(r.x - cam.x, r.y - cam.y, r.z - cam.z) * VIEW_SLACK + 0.6;
        if (!frustum.intersectsSphere(_sphere)) continue;
        const useNear = !(s & 1) || !this.far || r.story;
        if (!useNear && this.batch) { this.batch.vis[i] = 1; continue; }   // (drawn by the trees' BatchedMesh)
        const set = useNear ? this.nearDraw : this.farDraw;
        const counts = useNear ? nearCount : farCount;
        const M = this.matrices[i];
        for (let k = 0; k < set.length; k++) {
          const mesh = set[k];
          // (a merged mesh takes the record's matrix: its shader applies each part's own)
          writeInstanceMatrix(mesh.instanceMatrix, counts[k], mesh.userData.parts ? M : _m.multiplyMatrices(M, mesh.userData.partMatrix));
          counts[k]++;
        }
      }
    }
    this.nearDraw.forEach((m, k) => { m.count = nearCount[k]; show(m); });
    this.farDraw?.forEach((m, k) => { m.count = farCount[k]; show(m); });
    const b = this.batch;
    if (b) for (let i = 0; i < b.vis.length; i++) if (b.vis[i] !== b.shown[i]) { b.shown[i] = b.vis[i]; b.mesh.setVisibleAt(b.ids[i], b.vis[i] === 1); }
  }

  /** The per-part meshes (their materials and season flags are what the game sets; merged parts are drawn by drawn()). */
  meshes() { return [...this.near, ...(this.far ?? [])]; }
  /** What is in the scene: merged meshes and the parts drawn alone. */
  drawn() { return [...this.nearDraw, ...(this.farDraw ?? [])]; }
  /** Season flags changed: the merged meshes follow their parts. */
  showDrawn() { for (const m of this.drawn()) if (m.userData.parts) show(m); }
  shadowMeshes() { return this.shadow ?? []; }

  dispose() {
    for (const mesh of new Set([...this.meshes(), ...this.drawn(), ...this.shadowMeshes(), ...(this.batchSource ? [this.batchSource] : [])])) {
      mesh.removeFromParent();
      mesh.dispose(); // instance buffers belong to this set; asset geometry/materials are shared (and the merged ones are cached)
    }
    for (const mesh of this.shadowMeshes()) mesh.material.dispose();
  }
}

export class Foliage {
  constructor(scene, assets, placed, quality) {
    this.multiDraw = quality.multiDraw === true;   // (game.js: the renderer has WEBGL_multi_draw)
    this.batchOn = TREE_BATCH;
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
    this.merge = FOLIAGE_MERGE;   // one draw per model (R3-1); ?foliageMerge=off or setMerge(false): one per part
    this.bushOpts = { castShadow: true, wind: 1, maxDist: 160 * k };
    this.scatter = [[placed.rocks, { castShadow: true, wind: 0, maxDist: 320 * k }], [placed.flowers, { castShadow: false, wind: 2, maxDist: 90 * k }],
      [placed.reeds, { castShadow: false, wind: 2, maxDist: 110 * k }], [placed.lilies, { castShadow: false, wind: 0, maxDist: 120 * k }]];
    for (const [list, opts] of this.scatter) this.sets.push(...this.buildSets(list, opts));
    this.frustum = new THREE.Frustum();
    this.shadowFocus = new THREE.Vector3(1e9, 0, 0);
    this.shadowDir = new THREE.Vector3(0, 1, 0);
    this.shadowRange = quality.shadowRange;
    // The tree, bush and rock shadow proxies (SHADOW_ONLY layer) were never drawn before three r182: the shadow pass
    // tested layers against the view camera, so this valley has always looked and run without them. Since the upgrade
    // three would draw them: new shadows and new work on every tier. The game switches them each frame (game.js): off
    // unless a quality tier says foliageShadows: true, or ?treeShadows=on to look.
    this.proxyShadows = true;
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
      records, typeof opts === 'function' ? opts(model) : opts, this.merge));
  }

  /**
   * The far trees of every species as one BatchedMesh (R3-6). Each species' merged far geometry is one geometry of the
   * batch (its part numbers moved past the species before it), each tree record one instance, shown or hidden by the
   * sets' own culling (setVisibleAt on the records that changed); three's per-instance culling and sorting are off
   * (they cost ~0.8 ms a frame for 2,511 trees on a phone). The parts' looks come from one table, as in a merged mesh.
   */
  buildBatch() {
    if (this.batch) { this.batch.removeFromParent(); this.batch.dispose(); this.batch = null; }
    for (const s of this.treeSets) s.batch = null;
    if (!this.merge || !this.batchOn || !this.multiDraw) return;
    const sets = this.treeSets.filter(s => s.farDraw?.length === 1 && s.farDraw[0].userData.parts && !s.farDraw[0].material.map &&
      s.farDraw[0].material.customProgramCacheKey() === this.treeSets.find(t => t.farDraw?.[0]?.userData.parts)?.farDraw[0].material.customProgramCacheKey());
    const sig = sets.length ? attrKey(sets[0].farDraw[0].geometry) : '';
    sets.splice(0, sets.length, ...sets.filter(s => attrKey(s.farDraw[0].geometry) === sig));   // (one vertex layout in a batch)
    if (sets.length < 2) return;
    let nV = 0, nI = 0, nN = 0;
    for (const s of sets) { const g = s.farDraw[0].geometry; nV += g.attributes.position.count; nI += g.index.count; nN += s.records.length; }
    const parts = sets.flatMap(s => s.farDraw[0].userData.parts);
    // (one material per set of species, kept: the sakura glow patches it once, world/cel-wave.js)
    const key = sets.map(s => s.model).join(',');
    let mat = batchMaterials.get(key);
    if (!mat) {
      mat = mergedMaterial('trees', parts.map(p => ({ material: p.material })), sets[0].farDraw[0].userData.parts.find(p => p.userData.windWeight)?.material ?? parts[0].material);
      mat.name = 'trees:batched';
      batchMaterials.set(key, mat);
    }
    const bm = new THREE.BatchedMesh(nN, nV, nI, mat);
    bm.perObjectFrustumCulled = false; bm.sortObjects = false; bm.frustumCulled = false;
    bm.castShadow = false; bm.receiveShadow = true; bm.name = 'trees:batched';
    bm.userData.parts = parts;
    let base = 0;
    for (const s of sets) {
      const src = s.farDraw[0], geo = src.geometry.clone();
      const ap = geo.attributes.aPart; for (let i = 0; i < ap.count; i++) ap.array[i] += base;
      base += src.userData.parts.length;
      const gid = bm.addGeometry(geo);
      geo.dispose();
      const ids = new Int32Array(s.records.length);
      for (let i = 0; i < s.records.length; i++) { ids[i] = bm.addInstance(gid); bm.setMatrixAt(ids[i], s.matrices[i]); bm.setVisibleAt(ids[i], false); }
      // the species' own far mesh leaves the scene: the batch draws its trees
      src.removeFromParent(); src.count = 0; src.visible = false;
      s.farDraw = [];
      s.batch = { mesh: bm, ids, vis: new Uint8Array(s.records.length), shown: new Uint8Array(s.records.length) };
      s.batchSource = src;
    }
    const before = bm.onBeforeRender.bind(bm);
    bm.onBeforeRender = (...a) => { syncParts(bm); before(...a); };
    this.group.add(bm);
    this.batch = bm;
    this.lastPos.set(1e9, 0, 0);
  }

  /** The far trees' BatchedMesh on or off at run time (A/B pictures). */
  setBatch(on) {
    if (this.batchOn === on) return;
    this.batchOn = on;
    this.theme = null;
    this.setTheme(getTropicalTrees());
  }

  /** Merged foliage on or off at run time (A/B pictures: the same frozen frame both ways). Rebuilds every set. */
  setMerge(on) {
    if (this.merge === on) return;
    this.merge = on;
    for (const set of this.sets) set.dispose();
    this.sets = []; this.treeSets = []; this.bushSets = [];
    for (const [list, opts] of this.scatter) this.sets.push(...this.buildSets(list, opts));
    this.theme = null;
    this.setTheme(getTropicalTrees());
    if (this.season) this.setSeason(this.season);
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
    this.buildBatch();
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
    if (this.batch) { this.batch.removeFromParent(); this.batch.dispose(); this.batch = null; }
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
    if (!this.sun?.castShadow || !this.proxyShadows) {
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
          mesh.material.userData.source?.color.copy(mesh.material.color);   // and the single trees that share the colour
        }
        let on = !(p.bareTrees && deciduous && BARE_IN_WINTER.has(name));
        if (name === 'Peach') on = season === 'summer';
        if (s.model.startsWith('flowers') || s.model === 'lilypads') on = season !== 'winter';
        mesh.userData.inSeason = on;
        show(mesh);
      }
      s.showDrawn();
      // shadow proxies follow the season too (bare winter trees cast no leaf shadows)
      for (const mesh of s.shadowMeshes()) {
        const name = mesh.userData.materialName;
        mesh.userData.inSeason = !(p.bareTrees && deciduous && BARE_IN_WINTER.has(name)) && (name !== 'Peach' || season === 'summer');
        show(mesh);
      }
    }
  }
}
