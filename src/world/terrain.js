import * as THREE from 'three';
import { PATHS, WORLD } from './layout.js';
import { PALETTES } from './seasons.js';
import { makeNoiseTexture } from '../engine/textures.js';

const srgb = h => new THREE.Color(h);

/**
 * Ground paint at 1 m resolution over the playable area (+ margin):
 * R = path/dirt, G = shore sand, B = forest floor, A = grass density (0 = no grass tufts).
 */
export class Splat {
  constructor(grid, margin = 20) {
    this.x0 = WORLD.minX - margin; this.z0 = WORLD.minZ - margin;
    this.w = Math.ceil(WORLD.maxX - WORLD.minX + margin * 2);
    this.h = Math.ceil(WORLD.maxZ - WORLD.minZ + margin * 2);
    this.data = new Uint8Array(this.w * this.h * 4);
    const d = this.data;
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const x = this.x0 + i + 0.5, z = this.z0 + j + 0.5;
      const y = grid.heightAt(x, z);
      const o = (j * this.w + i) * 4;
      const shore = 1 - smooth(0.25, 0.85, y);
      d[o + 1] = shore * 255;
      const slope = grid.slopeAt(x, z);
      d[o + 3] = Math.max(0, 1 - shore * 1.3 - smooth(28, 38, slope)) * 255;
    }
    for (const p of PATHS) this.paintPolyline(p.pts, p.w);
    this.texture = new THREE.DataTexture(d, this.w, this.h, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  paintPolyline(pts, width) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      const pad = width / 2 + 1.6;
      const i0 = Math.floor(Math.min(ax, bx) - pad - this.x0), i1 = Math.ceil(Math.max(ax, bx) + pad - this.x0);
      const j0 = Math.floor(Math.min(az, bz) - pad - this.z0), j1 = Math.ceil(Math.max(az, bz) + pad - this.z0);
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      for (let j = Math.max(0, j0); j <= Math.min(this.h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.w - 1, i1); i++) {
        const x = this.x0 + i + 0.5, z = this.z0 + j + 0.5;
        let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dist = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        // slightly wobbly edge so paths look worn, not ruled
        const wob = Math.sin(x * 0.9 + z * 0.4) * 0.25 + Math.sin(z * 1.3 - x * 0.2) * 0.2;
        const v = 1 - smooth(width / 2 - 0.4 + wob, width / 2 + 0.9 + wob, dist);
        if (v <= 0) continue;
        const o = (j * this.w + i) * 4;
        this.data[o] = Math.max(this.data[o], v * 255);
        this.data[o + 3] = Math.min(this.data[o + 3], (1 - v) * 255);
      }
    }
  }

  /** Stamp a value into one channel in a rotated rectangle (e.g. clear grass under a building). */
  paintRect(cx, cz, hw, hd, rotDeg, channel, value, soft = 1) {
    const r = rotDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const ext = Math.hypot(hw, hd) + soft + 1;
    for (let j = Math.floor(cz - ext - this.z0); j <= Math.ceil(cz + ext - this.z0); j++) {
      if (j < 0 || j >= this.h) continue;
      for (let i = Math.floor(cx - ext - this.x0); i <= Math.ceil(cx + ext - this.x0); i++) {
        if (i < 0 || i >= this.w) continue;
        const x = this.x0 + i + 0.5 - cx, z = this.z0 + j + 0.5 - cz;
        const lx = x * c - z * s, lz = x * s + z * c;
        const dx = Math.abs(lx) - hw, dz = Math.abs(lz) - hd;
        const dist = Math.max(dx, dz);
        const w = 1 - smooth(0, soft, dist);
        if (w <= 0) continue;
        const o = (j * this.w + i) * 4 + channel;
        this.data[o] = this.data[o] + (value * 255 - this.data[o]) * w;
      }
    }
    this.texture.needsUpdate = true;
  }

  paintDisc(cx, cz, radius, channel, value, soft = 1.5) {
    for (let j = Math.floor(cz - radius - soft - this.z0); j <= Math.ceil(cz + radius + soft - this.z0); j++) {
      if (j < 0 || j >= this.h) continue;
      for (let i = Math.floor(cx - radius - soft - this.x0); i <= Math.ceil(cx + radius + soft - this.x0); i++) {
        if (i < 0 || i >= this.w) continue;
        const d = Math.hypot(this.x0 + i + 0.5 - cx, this.z0 + j + 0.5 - cz);
        const w = 1 - smooth(radius, radius + soft, d);
        if (w <= 0) continue;
        const o = (j * this.w + i) * 4 + channel;
        this.data[o] = this.data[o] + (value * 255 - this.data[o]) * w;
      }
    }
    this.texture.needsUpdate = true;
  }

  sample(x, z, channel) {
    const i = Math.floor(x - this.x0), j = Math.floor(z - this.z0);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return 0;
    return this.data[(j * this.w + i) * 4 + channel] / 255;
  }
}

function smooth(a, b, v) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Terrain {
  constructor(scene, grid, splat) {
    this.grid = grid;
    this.splat = splat;
    this.noise = makeNoiseTexture(256);
    this.uniforms = {
      uSplat: { value: splat.texture },
      uSplatOrigin: { value: new THREE.Vector2(splat.x0, splat.z0) },
      uSplatSize: { value: new THREE.Vector2(splat.w, splat.h) },
      uNoise: { value: this.noise },
      uGrassA: { value: new THREE.Color() }, uGrassB: { value: new THREE.Color() }, uGrassC: { value: new THREE.Color() },
      uDirt: { value: new THREE.Color() }, uSand: { value: new THREE.Color() }, uRock: { value: new THREE.Color() },
      uForest: { value: new THREE.Color() }, uSnow: { value: 0 },
      uMountain: { value: new THREE.Color('#3f6b4a') },
    };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0, envMapIntensity: 0.35 });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; varying vec3 vWNormal;
          uniform sampler2D uSplat, uNoise; uniform vec2 uSplatOrigin, uSplatSize;
          uniform vec3 uGrassA, uGrassB, uGrassC, uDirt, uSand, uRock, uForest, uMountain; uniform float uSnow;`)
        .replace('#include <map_fragment>', `
          vec2 suv = (vWPos.xz - uSplatOrigin) / uSplatSize;
          float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
          vec4 sp = texture2D(uSplat, suv) * inside;
          vec4 n1 = texture2D(uNoise, vWPos.xz * 0.006);
          vec4 n2 = texture2D(uNoise, vWPos.xz * 0.031);
          vec4 n3 = texture2D(uNoise, vWPos.xz * 0.21);
          vec4 n4 = texture2D(uNoise, vWPos.xz * 1.37);
          vec4 n5 = texture2D(uNoise, vWPos.xz * vec2(4.1, 2.3));
          float slope = 1.0 - clamp(vWNormal.y, 0.0, 1.0);
          vec3 g = mix(uGrassA, uGrassB, smoothstep(0.38, 0.66, n1.r));
          g = mix(g, uGrassC, smoothstep(0.42, 0.9, n2.g) * 0.45);
          g *= 0.86 + 0.2 * n3.b;
          g *= 0.9 + 0.14 * n4.r + 0.1 * (n5.g - 0.5);
          vec3 col = mix(g, uForest * (0.85 + 0.3 * n2.r), sp.b);
          // mountains outside the valley: darker forest with rocky tops
          float mountain = 1.0 - inside;
          mountain = max(mountain, smoothstep(34.0, 60.0, vWPos.y));
          col = mix(col, uMountain * (0.8 + 0.35 * n1.g), mountain * 0.85);
          vec3 dirt = uDirt * (0.82 + 0.3 * n3.r) * (0.9 + 0.22 * n4.g);
          dirt = mix(dirt, dirt * 1.25, smoothstep(0.62, 0.7, n5.b)); // pebbles
          col = mix(col, dirt, sp.r);
          col = mix(col, uSand * (0.9 + 0.2 * n3.g), sp.g * (1.0 - sp.r));
          float rockAt = mix(0.30, 0.5, mountain);
          float rock = smoothstep(rockAt, rockAt + 0.12, slope + (n2.b - 0.5) * 0.14);
          vec3 rk = uRock * (0.72 + 0.42 * n2.b) * (0.86 + 0.24 * n3.a) * (0.9 + 0.18 * n4.b);
          rk = mix(rk, rk * 0.72, smoothstep(0.55, 0.62, n4.a)); // cracks and strata
          col = mix(col, rk, rock);
          col = mix(col, col * vec3(0.52, 0.66, 0.7), smoothstep(0.15, -1.6, vWPos.y));
          float snowCap = smoothstep(120.0, 170.0, vWPos.y + n1.a * 30.0);
          float snow = max(uSnow * (1.0 - sp.r * 0.45) * smoothstep(0.08, 0.02, slope * (1.0 - n2.a * 0.3)), snowCap * smoothstep(0.4, 0.2, slope));
          snow *= smoothstep(-0.2, 0.4, vWPos.y);
          col = mix(col, vec3(0.93, 0.96, 1.0) * (0.95 + 0.08 * n3.r), snow);
          diffuseColor.rgb *= col;
        `);
    };
    this.material = mat;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.buildChunks(64);
    scene.add(this.group);
  }

  buildChunks(cells) {
    const g = this.grid;
    const nx = g.nx, nz = g.nz;
    for (let cj = 0; cj < nz - 1; cj += cells) for (let ci = 0; ci < nx - 1; ci += cells) {
      const w = Math.min(cells, nx - 1 - ci), h = Math.min(cells, nz - 1 - cj);
      const vcount = (w + 1) * (h + 1);
      const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3);
      let k = 0;
      for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) {
        const gi = ci + i, gj = cj + j;
        pos[k * 3] = g.x0 + gi * g.step;
        pos[k * 3 + 1] = g.get(gi, gj);
        pos[k * 3 + 2] = g.z0 + gj * g.step;
        const dx = g.get(gi + 1, gj) - g.get(gi - 1, gj), dz = g.get(gi, gj + 1) - g.get(gi, gj - 1);
        const l = Math.hypot(dx, 2 * g.step, dz);
        nor[k * 3] = -dx / l; nor[k * 3 + 1] = 2 * g.step / l; nor[k * 3 + 2] = -dz / l;
        k++;
      }
      const idx = new (vcount > 65535 ? Uint32Array : Uint16Array)(w * h * 6);
      let t = 0;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const a = j * (w + 1) + i, b = a + 1, c = a + (w + 1), d = c + 1;
        idx[t++] = a; idx[t++] = c; idx[t++] = b;
        idx[t++] = b; idx[t++] = c; idx[t++] = d;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.receiveShadow = true;
      mesh.name = 'terrain-chunk';
      this.group.add(mesh);
    }
  }

  setSeason(season) {
    const p = PALETTES[season];
    const u = this.uniforms;
    u.uGrassA.value.copy(srgb(p.grass[0]));
    u.uGrassB.value.copy(srgb(p.grass[1]));
    u.uGrassC.value.copy(srgb(p.grass[2]));
    u.uDirt.value.copy(srgb(p.dirt));
    u.uSand.value.copy(srgb(p.sand));
    u.uRock.value.copy(srgb(p.rock));
    u.uForest.value.copy(srgb(p.forest));
    u.uMountain.value.copy(srgb(season === 'autumn' ? '#6f6a34' : season === 'winter' ? '#c9d6e6' : '#3f6b44'));
    u.uSnow.value = p.snow;
  }
}
