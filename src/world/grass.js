import * as THREE from 'three';
import { FX } from '../engine/effects.js';
import { PALETTES } from './seasons.js';

/** One clump of curved, tapered blades (model space, root at origin). */
function clumpGeometry(blades = 6, segs = 3) {
  const pos = [], uv = [], idx = [];
  let base = 0;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + Math.random() * 0.8;
    const r = 0.04 + Math.random() * 0.1;
    const h = 0.22 + Math.random() * 0.22;
    const w = 0.035 + Math.random() * 0.02;
    const lean = 0.08 + Math.random() * 0.16;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const dx = Math.cos(a), dz = Math.sin(a);
    const sx = -dz, sz = dx;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const ww = w * (1 - t * 0.92);
      const cx = ox + dx * lean * t * t, cz = oz + dz * lean * t * t, cy = h * t;
      pos.push(cx - sx * ww, cy, cz - sz * ww, cx + sx * ww, cy, cz + sz * ww);
      uv.push(0, t, 1, t);
    }
    for (let s = 0; s < segs; s++) {
      const i = base + s * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
    base += (segs + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

export class Grass {
  constructor(scene, heightTex, splat, noiseTex, quality) {
    const tile = quality.grass >= 1 ? 72 : quality.grass >= 0.6 ? 60 : 44;
    const count = Math.round(tile * tile * (quality.grass >= 1 ? 6.2 : quality.grass >= 0.6 ? 4.2 : 2.6));
    const geo = new THREE.InstancedBufferGeometry().copy(clumpGeometry());
    const offs = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      offs[i * 3] = Math.random() * tile;
      offs[i * 3 + 1] = Math.random() * tile;
      offs[i * 3 + 2] = Math.random();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 3));
    geo.instanceCount = count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = {
      uCenter: { value: new THREE.Vector3() }, uTile: { value: tile },
      uHeight: { value: heightTex }, uHX: { value: heightTex.userData.xform },
      uSplat: { value: splat.texture }, uSplatOrigin: { value: new THREE.Vector2(splat.x0, splat.z0) },
      uSplatSize: { value: new THREE.Vector2(splat.w, splat.h) },
      uNoise: { value: noiseTex }, uDensity: { value: 1 },
      uGrassA: { value: new THREE.Color() }, uGrassB: { value: new THREE.Color() }, uGrassC: { value: new THREE.Color() },
      uTip: { value: new THREE.Color() }, uPlayer: { value: new THREE.Vector3(0, -100, 0) },
    };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.uniforms, { uTime: FX.uTime, uWind: FX.uWind });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aOffset;
          uniform vec3 uCenter, uPlayer; uniform float uTile, uTime, uWind, uDensity;
          uniform sampler2D uHeight, uSplat, uNoise; uniform vec4 uHX; uniform vec2 uSplatOrigin, uSplatSize;
          uniform vec3 uGrassA, uGrassB, uGrassC, uTip;
          varying vec3 vGrassCol;`)
        .replace('#include <begin_vertex>', `
          vec2 world = uCenter.xz + mod(aOffset.xy - uCenter.xz + uTile * 0.5, uTile) - uTile * 0.5;
          float gy = texture2D(uHeight, (world - uHX.xy) * uHX.zw).r;
          vec4 sp = texture2D(uSplat, (world - uSplatOrigin) / uSplatSize);
          float dist = length(world - uCenter.xz);
          float fade = 1.0 - smoothstep(uTile * 0.32, uTile * 0.5, dist);
          float keep = step(aOffset.z, sp.a * uDensity * (1.0 - sp.b * 0.55));
          vec4 nz = texture2D(uNoise, world * 0.03);
          float scale = keep * fade * (0.7 + 0.5 * nz.r) * (0.85 + 0.3 * aOffset.z);
          float ang = aOffset.z * 40.0;
          float c = cos(ang), s = sin(ang);
          vec3 transformed = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c) * scale;
          float tip = uv.y;
          // wind: rolling gusts plus flutter, and blades part around the player
          float gust = texture2D(uNoise, world * 0.02 - vec2(uTime * 0.05, uTime * 0.02)).g;
          float bend = (sin(uTime * 1.8 + world.x * 0.35 + world.y * 0.22) * 0.5 + gust * 1.2) * uWind;
          transformed.x += bend * 0.16 * tip * tip;
          transformed.z += bend * 0.06 * tip * tip;
          vec2 away = world - uPlayer.xz;
          float pd = length(away);
          transformed.xz += normalize(away + 1e-4) * (1.0 - smoothstep(0.2, 1.1, pd)) * 0.35 * tip * step(abs(gy - uPlayer.y), 1.5);
          transformed.xz += world;
          transformed.y += gy - 0.02;
          vec3 g = mix(uGrassA, uGrassB, smoothstep(0.38, 0.66, texture2D(uNoise, world * 0.006).r));
          g = mix(g, uGrassC, smoothstep(0.42, 0.9, texture2D(uNoise, world * 0.031).g) * 0.45);
          vGrassCol = mix(g * 0.72, mix(g, uTip, 0.35) * 1.12, tip);
        `)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol;')
        .replace('#include <map_fragment>', 'diffuseColor.rgb *= vGrassCol;');
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'grass';
    scene.add(this.mesh);
  }

  setSeason(season) {
    const p = PALETTES[season];
    const u = this.uniforms;
    u.uGrassA.value.set(p.grass[0]);
    u.uGrassB.value.set(p.grass[1]);
    u.uGrassC.value.set(p.grass[2]);
    u.uTip.value.set(season === 'autumn' ? '#f1d27a' : season === 'spring' ? '#d8f07a' : '#b9e36a');
    u.uDensity.value = p.grassDensity;
    this.mesh.visible = p.grassDensity > 0;
  }

  update(center, player) {
    this.uniforms.uCenter.value.copy(center);
    if (player) this.uniforms.uPlayer.value.copy(player);
  }
}
