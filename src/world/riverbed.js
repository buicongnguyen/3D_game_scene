import * as THREE from 'three';
import { river, riverHalfWidth, WATER_Y, PLACES } from './layout.js';
import { rng } from '../engine/spline.js';

/**
 * Things to find under the river: smooth stones, swaying water weed, sunken logs and an old rowboat.
 * Built from the Blender props as instanced meshes (a handful of draw calls), only in water deeper
 * than a stride so they never poke through the surface.
 */
export class Riverbed {
  constructor(scene, assets, world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'riverbed';
    scene.add(this.group);
    const R = rng(4242);
    const heightAt = (x, z) => world.heightAt(x, z);
    const stones = [], weeds = [];
    for (let i = 0; i < 900 && (stones.length < 150 || weeds.length < 190); i++) {
      const p = river.at(R() * river.length);
      if (p.z < -230 || p.z > 200) continue;
      const hw = riverHalfWidth(p.z);
      const off = (R() * 2 - 1) * hw * 0.95;
      const x = p.x - p.tz * off, z = p.z + p.tx * off;
      const y = heightAt(x, z);
      if (y > WATER_Y - 0.9) continue;
      if (Math.abs(z + 112) < 6) continue; // keep the ford's stepping stones clear
      if (R() < 0.45) {
        if (stones.length < 150) stones.push({ x, y: y - 0.05, z, rot: R() * 6.28, s: 0.35 + R() * 0.8, sy: 0.45 + R() * 0.3, m: Math.floor(R() * 3) });
      } else if (weeds.length < 190) {
        // weed grows in clumps toward the banks, where the current is gentler
        if (Math.abs(off) < hw * 0.35 && R() < 0.7) continue;
        weeds.push({ x, y: y - 0.05, z, rot: R() * 6.28, s: 0.9 + R() * 0.9, ph: R() * 6.28 });
      }
    }
    ['rock-a', 'rock-b', 'rock-c'].forEach((m, k) => this.instance(assets, m, stones.filter(s => s.m === k), mat => {
      const c = mat.clone();
      c.color = (c.color || new THREE.Color(1, 1, 1)).clone().multiply(new THREE.Color('#8fb3a8'));
      return c;
    }));
    this.weed = this.instance(assets, 'reeds', weeds, mat => {
      const c = mat.clone();
      c.color = new THREE.Color('#2f7a4a');
      c.side = THREE.DoubleSide;
      // sway with the current: bend the blades by height, a little each, out of phase per instance
      c.onBeforeCompile = sh => {
        sh.uniforms.uTime = this.time;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
            float bend = position.y * position.y * 0.18;
            transformed.x += sin(uTime * 1.3 + ph) * bend;
            transformed.z += cos(uTime * 1.1 + ph * 1.3) * bend * 0.6;`);
      };
      c.customProgramCacheKey = () => 'riverweed';
      return c;
    }, 1.6);
    // a few landmarks: sunken logs and Rin's grandfather's old rowboat below the ferry landing
    const set = [
      ['log', 5.6, 36.5, 0.7, 0.3], ['log', -2, -60, 2.2, -0.2], ['log', 16, -128, 1.1, 0.25],
      ['rowboat', 11.5, 37.5, 2.6, 0.55],
    ];
    for (const [m, x, z, rot, tilt] of set) {
      const o = assets.clone(m);
      if (!o || heightAt(x, z) > WATER_Y - 1) continue;
      o.position.set(x, heightAt(x, z) + (m === 'rowboat' ? 0.15 : 0.05), z);
      o.rotation.set(tilt * 0.4, rot, tilt);
      o.traverse(q => { if (q.isMesh) { q.material = [q.material].flat().map(mm => { const c = mm.clone(); c.color?.multiply(new THREE.Color('#9ab8ad')); return c; })[0]; } });
      this.group.add(o);
    }
    void PLACES;
  }

  time = { value: 0 };

  instance(assets, model, list, tint, yScale = 1) {
    if (!list.length) return null;
    const parts = assets.parts(model);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const meshes = [];
    const mats = parts.map(part => tint(part.material));
    // in stretches of ~110 m of river, so the bed out of view is culled (as one mesh the whole river was drawn,
    // 180 k triangles, wherever the camera looked)
    const all = list;
    for (let z0 = -230; z0 < 200; z0 += 110) for (const [pi, part] of parts.entries()) {
      list = all.filter(r => r.z >= z0 && r.z < z0 + 110);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(part.geometry, mats[pi], list.length);
      list.forEach((r, i) => {
        e.set(0, r.rot, 0);
        q.setFromEuler(e);
        m4.compose(new THREE.Vector3(r.x, r.y, r.z), q, new THREE.Vector3(r.s, r.s * (r.sy ?? yScale), r.s)).multiply(part.matrix);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      this.group.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }

  update(dt) {
    this.time.value += dt;
    // lighter tiers: the bed is only drawn near the river (the water hides it from further away)
    const far = this.world.quality?.riverbedDist, f = this.world.focus;
    if (!far || !f || (this.checkT = (this.checkT ?? 0) - dt) > 0) return;
    this.checkT = 0.4;
    const d = river.nearest(f.x, f.z, far + 12)?.d ?? Infinity;
    this.group.visible = this.group.visible ? d < far + 8 : d < far;
  }
}
