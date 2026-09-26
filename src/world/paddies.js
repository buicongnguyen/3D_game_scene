import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../engine/effects.js';
import { PADDIES } from './layout.js';

const SEASON = {
  spring: { h: 0.38, color: '#8fd34e', bund: '#6e9c3a', water: true, harvested: false },
  summer: { h: 0.95, color: '#3f9e3a', bund: '#58903a', water: true, harvested: false },
  autumn: { h: 1.0, color: '#e6b33e', bund: '#9a8446', water: false, harvested: true },
  winter: { h: 0.18, color: '#b99a62', bund: '#8f8068', water: false, harvested: true },
};

/** One rice plant: a handful of thin arching leaves. */
function riceGeometry() {
  const pos = [], idx = [], uv = [];
  let base = 0;
  for (let b = 0; b < 7; b++) {
    const a = (b / 7) * Math.PI * 2 + b * 0.37;
    // leaves ~1 px wide at 15 m: a little wider, with a blunter taper, so swaying rice does not sparkle
    const h = 0.45 + (b % 3) * 0.08, w = 0.03, lean = 0.12 + (b % 2) * 0.08;
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    for (let s = 0; s <= 3; s++) {
      const t = s / 3, ww = w * (1 - t * 0.7);
      const cx = dx * lean * t * t, cz = dz * lean * t * t, cy = h * t;
      pos.push(cx - sx * ww, cy, cz - sz * ww, cx + sx * ww, cy, cz + sz * ww);
      uv.push(0, t, 1, t);
    }
    for (let s = 0; s < 3; s++) { const i = base + s * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    base += 8;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Paddies {
  constructor(scene, assets, world) {
    this.group = new THREE.Group();
    this.group.name = 'paddies';
    scene.add(this.group);
    // a shallow sky mirror: dark, glossy and mostly reflection
    this.waterMat = new THREE.MeshStandardMaterial({ color: '#2f6f86', roughness: 0.03, metalness: 0.62, transparent: true, opacity: 0.9, envMapIntensity: 1.8 });
    this.riceMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#8fd34e', roughness: 0.75, side: THREE.DoubleSide }), { wind: 2 });
    const bundMat = this.bundMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#7f8f3c', roughness: 0.95 }));
    const bunds = [], waters = [];
    const rice = [];
    for (const p of PADDIES) {
      const y = p.t;
      const wg = new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2).translate(p.x, y + 0.08, p.z);
      waters.push(wg);
      const t = 0.55, hgt = 0.34;
      for (const [cx, cz, sx, sz] of [[0, -p.d / 2, p.w + t, t], [0, p.d / 2, p.w + t, t], [-p.w / 2, 0, t, p.d], [p.w / 2, 0, t, p.d]]) {
        const b = new THREE.BoxGeometry(sx, hgt, sz, Math.max(1, Math.round(sx / 1.5)), 1, Math.max(1, Math.round(sz / 1.5)));
        // soften the bund into a rounded levee
        const pa = b.attributes.position;
        for (let i = 0; i < pa.count; i++) if (pa.getY(i) > 0) { pa.setX(i, pa.getX(i) * (sx > sz ? 1 : 0.7)); pa.setZ(i, pa.getZ(i) * (sz > sx ? 1 : 0.7)); }
        b.translate(p.x + cx, y + hgt / 2 - 0.05, p.z + cz);
        bunds.push(b.toNonIndexed());
      }
      for (let ix = 0.6; ix < p.w - 0.3; ix += 0.62) for (let iz = 0.55; iz < p.d - 0.3; iz += 0.58) {
        rice.push({ x: p.x - p.w / 2 + ix + (Math.sin(ix * 7 + iz) * 0.05), z: p.z - p.d / 2 + iz, y: y + 0.02, paddy: p.id, rot: (ix * 13.7 + iz * 7.1) % 6.28 });
      }
      world.splat.paintRect(p.x, p.z, p.w / 2 + 0.6, p.d / 2 + 0.6, 0, 3, 0, 0.8);
    }
    this.water = new THREE.Mesh(mergeGeometries(waters), this.waterMat);
    this.water.receiveShadow = true;
    this.water.renderOrder = 1;
    this.bunds = new THREE.Mesh(mergeGeometries(bunds.map(b => { b.deleteAttribute('uv'); return b; })), bundMat);
    this.bunds.receiveShadow = true;
    this.bunds.castShadow = true;
    this.rice = new THREE.InstancedMesh(riceGeometry(), this.riceMat, rice.length);
    this.riceRecords = rice;
    this.rice.receiveShadow = true;
    this.group.add(this.water, this.bunds, this.rice);
    // autumn: harvested plots get drying hay
    this.hay = new THREE.Group();
    const harvested = PADDIES.filter((_, i) => i % 3 !== 1);
    this.harvestedIds = new Set(harvested.map(p => p.id));
    for (const p of harvested.slice(0, 5)) {
      for (let k = 0; k < 2; k++) {
        const h = assets.clone('haybale');
        if (!h) continue;
        h.position.set(p.x - 2 + k * 3.6, p.t, p.z + (k ? 1.4 : -1.2));
        h.rotation.y = k * 1.3 + p.x;
        this.hay.add(h);
      }
    }
    this.group.add(this.hay);
  }

  setSeason(season) {
    const s = SEASON[season];
    this.riceMat.color.set(s.color);
    this.bundMat.color.set(s.bund);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const r of this.riceRecords) {
      const cut = s.harvested && this.harvestedIds.has(r.paddy);
      const h = cut ? (season === 'winter' ? 0.16 : 0.22) : s.h;
      q.setFromAxisAngle(up, r.rot);
      M.compose(new THREE.Vector3(r.x, r.y, r.z), q, new THREE.Vector3(1, h, 1));
      this.rice.setMatrixAt(n++, M);
    }
    this.rice.count = n;
    this.rice.instanceMatrix.needsUpdate = true;
    this.water.visible = s.water;
    this.hay.visible = season === 'autumn';
  }
}
