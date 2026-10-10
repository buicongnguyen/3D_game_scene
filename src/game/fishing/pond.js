// The fishing water at the Kawabe dock, as a view: a patch of clear river with a school of fish in it.
// Fishing owns one while Mika has a line out; the scene tour can make one too (see FishPond below).
//
// Cheap by construction (lightweight-game-objects): each fish model is baked once into two geometries with vertex
// colours (body + tail, hinged), so a whole school is two InstancedMesh draws per model, never animated rigs.
// Trout and char share the trout model (the char is tinted by instance colour); a deep fish is the same instance drawn
// low, flattened and dark. No shadows, no per-frame allocation. The clear patch is one uniform on the river shader.
import * as THREE from 'three';
import { WATER_Y } from '../../world/layout.js';
import { School } from './sim.js';

/** Where Mika stands, the open water north of the dock (clear of the moored ferry), and the winter ice hole. */
export const SPOT = { x: 4.2, z: 30 };
export const STAND = { x: 3.8, z: 30.1 };     // where she plants her feet to cast (the end of the dock, in frame)
export const WATERS = {
  wide: { cx: 9.4, cz: 23.6, rx: 4.6, rz: 4.9, clear: 9.5 },
  tall: { cx: 8.9, cz: 23.4, rx: 2.9, rz: 5.0, clear: 8.6 },
  ice: { cx: 8.3, cz: 25.6, rx: 1.75, rz: 1.75, clear: 3.3, hole: 2.1 },
};

/** The fishing camera: high over Mika's shoulder, looking down into the water. aspect = width / height. */
export function fishingShot(aspect = 16 / 9, frozen = false) {
  const tall = THREE.MathUtils.clamp((1.25 - aspect) / (1.25 - 0.5), 0, 1);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  if (frozen) return { pos: V(3.6, 6.2 + tall * 3.4, 33.6 + tall * 1.6), look: V(7.6, 0, 26.4), fov: 55 + tall * 13, tall };
  return {
    pos: V(4.2, 7.6, 35.2).lerp(V(2.6, 9.6, 34.6), tall),
    look: V(8.4, -0.2, 25.2).lerp(V(8.6, -0.2, 24.6), tall),
    fov: 55 + tall * 5, tall,
  };
}

export const FISH_LOOK = {
  //         model            metres  tail wag  tint (instance colour)
  trout: { model: 'fish-trout', len: 0.92, wag: 0.5, tint: '#ffffff' },
  char: { model: 'fish-trout', len: 0.8, wag: 0.55, tint: '#8fe3b0' },
  koi: { model: 'fish-koi', len: 1.12, wag: 0.4, tint: '#ffffff' },
  starfin: { model: 'fish-starfin', len: 1.0, wag: 0.6, tint: '#ffffff' },
};
const HINGE = -0.06;      // model z where the tail swings (models face +z, about 0.36 long)
const SWIM_Y = -0.3, DEEP_Y = -1.15;
const DEEP_TINT = new THREE.Color('#0d3552');

const _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();

/** Bake a (rigged) fish model at rest into { body, tail, length }: merged, vertex-coloured, tail moved to its hinge. */
function bakeFish(scene) {
  const parts = { body: { pos: [], col: [] }, tail: { pos: [], col: [] } };
  let zMin = Infinity, zMax = -Infinity;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), col = new THREE.Color();
  scene.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, P = g.attributes.position, C = g.attributes.color, I = g.index;
    const mat = [o.material].flat()[0];
    const tris = (I ? I.count : P.count) / 3;
    for (let t = 0; t < tris; t++) {
      const ia = I ? I.getX(t * 3) : t * 3, ib = I ? I.getX(t * 3 + 1) : t * 3 + 1, ic = I ? I.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(P, ia); b.fromBufferAttribute(P, ib); c.fromBufferAttribute(P, ic);
      n.subVectors(b, a).cross(_p.subVectors(c, a)).normalize();
      const shade = 0.66 + 0.34 * Math.max(0, n.y) + 0.1 * Math.abs(n.x);     // lit from above: the water has no lights to spare
      const part = (a.z + b.z + c.z) / 3 < HINGE ? parts.tail : parts.body;
      for (const [v, i] of [[a, ia], [b, ib], [c, ic]]) {
        zMin = Math.min(zMin, v.z); zMax = Math.max(zMax, v.z);
        part.pos.push(v.x, v.y, part === parts.tail ? v.z - HINGE : v.z);
        col.copy(mat.color || col.set('#ffffff'));
        if (C) col.multiply(_c.setRGB(C.getX(i), C.getY(i), C.getZ(i)));
        if (mat.emissive && mat.emissive.getHex() && /star/i.test(mat.name)) col.lerp(_c.copy(mat.emissive), 0.6).multiplyScalar(1.6);
        col.multiplyScalar(shade * 1.12);
        part.col.push(col.r, col.g, col.b);
      }
    }
  });
  const geo = part => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(part.col, 3));
    g.computeBoundingSphere();
    return g;
  };
  return { body: geo(parts.body), tail: geo(parts.tail), length: (zMax - zMin) || 0.36 };
}

/** No art loaded: a plain fish (a stretched ball and a fin). */
function plainFish() {
  const one = (g, col) => { const n = g.toNonIndexed(), k = n.attributes.position.count, c = new Float32Array(k * 3); for (let i = 0; i < k; i++) c.set(col, i * 3); n.setAttribute('color', new THREE.BufferAttribute(c, 3)); n.deleteAttribute('normal'); n.deleteAttribute('uv'); return n; };
  return {
    body: one(new THREE.SphereGeometry(0.07, 8, 6).scale(0.6, 0.8, 2.2).translate(0, 0, 0.08), [0.7, 0.72, 0.66]),
    tail: one(new THREE.ConeGeometry(0.07, 0.14, 4).rotateX(Math.PI / 2).scale(0.3, 1, 1).translate(0, 0, -0.1), [0.6, 0.5, 0.35]),
    length: 0.36,
  };
}

class Batch {
  constructor(scene, baked, cap) {
    const mat = this.material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.baked = baked;
    this.cap = cap;
    this.body = new THREE.InstancedMesh(baked.body, mat, cap);
    this.tail = new THREE.InstancedMesh(baked.tail, mat, cap);
    for (const m of [this.body, this.tail]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = m.receiveShadow = false;
      m.count = 0;
      m.raycast = () => {};
      m.name = 'fishing:school';
      m.setColorAt(0, _c.set('#ffffff'));
      scene.add(m);
    }
    this.n = 0;
  }

  /** One fish: position, yaw (heading), pitch/roll, uniform scale, flatten (y scale), tail angle, colour. */
  put(x, y, z, yaw, pitch, roll, scale, flat, tail, color) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    _e.set(pitch, yaw, roll);
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(scale, scale * flat, scale));
    this.body.setMatrixAt(i, _m);
    _t.makeRotationY(tail).setPosition(0, 0, HINGE);
    this.tail.setMatrixAt(i, _t.premultiply(_m));
    this.body.setColorAt(i, color);
    this.tail.setColorAt(i, color);
  }

  flush() {
    for (const m of [this.body, this.tail]) {
      m.count = this.n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.n = 0;
  }

  dispose(scene) {
    for (const m of [this.body, this.tail]) { scene.remove(m); m.dispose(); }
    this.baked.body.dispose(); this.baked.tail.dispose();
    this.material.dispose();
  }
}

/**
 * The clear patch and its fish.
 *
 *   const pond = new FishPond(game, { wildlife: director.wildlife });   // eases the water clear, fish swim
 *   pond.update(dt);                                                    // every frame
 *   pond.dispose();                                                     // the water eases back by itself
 *
 * Options: area (WATERS.wide by default, WATERS.ice on a frozen river), count (fish; fewer on the Low tier), dusk
 * (a starfin joins and glows), rand (seeded), wildlife (the ambient shoal by the dock steps aside meanwhile).
 */
export class FishPond {
  constructor(game, { area, count, dusk = false, rand = Math.random, wildlife = null, clear = 1 } = {}) {
    const g = this.game = game;
    this.scene = g.scene;
    this.frozen = !!g.world.frozen;
    this.area = area || (this.frozen ? WATERS.ice : WATERS.wide);
    const q = g.world.quality || {};
    this.light = q.name === 'Low' || q.fishLight === true;      // the phone tier: fewer fish, no ripples
    const n = count ?? q.fish ?? (this.frozen ? 4 : this.light ? 6 : 10);
    const mix = [];
    for (let i = 0; i < n; i++) mix.push(i % 5 === 3 ? 'koi' : i % 5 === 1 ? 'char' : 'trout');
    if (dusk) mix[Math.min(2, n - 1)] = 'starfin';
    const deep = this.frozen ? 0 : this.light ? 1 : 2;
    for (let i = 0; i < deep; i++) mix.push(i ? 'trout' : 'koi');
    this.dusk = dusk;
    this.school = new School({ rand, area: this.area, mix, deep });
    this.rand = rand;
    this.batches = {};
    for (const model of new Set(Object.values(FISH_LOOK).map(l => l.model))) {
      const gltf = g.assets?.gltf?.(model);
      let baked = null;
      if (gltf) { try { baked = bakeFish(gltf.scene); } catch (e) { console.warn(`fish bake skipped for ${model}`, e); } }
      this.batches[model] = new Batch(this.scene, baked || plainFish(), n + deep + 4);
    }
    // rings on the water (one instanced draw, additive: the colour is the fade)
    this.rings = [];
    if (!this.light) {
      const rg = this.ringGeo = new THREE.RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2);
      const rm = this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const im = this.ringMesh = new THREE.InstancedMesh(rg, rm, 10);
      im.frustumCulled = false; im.renderOrder = 4; im.count = 0; im.name = 'fishing:rings'; im.raycast = () => {};
      im.setColorAt(0, _c.set('#000000'));
      this.scene.add(im);
    }
    // night: a pool of lantern light lies on the water so the patch reads as lit, not as a hole in the dark
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d'), grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.55, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(c);
    this.glowTex.colorSpace = THREE.SRGBColorSpace;
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.glowTex, color: '#ffd29a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.glow.position.set(this.area.cx, WATER_Y + 0.02, this.area.cz);
    this.glow.scale.set(this.area.clear * 0.8, 1, this.area.clear * 0.8);
    this.glow.renderOrder = 3; this.glow.name = 'fishing:glow'; this.glow.raycast = () => {};
    this.glow.visible = false;
    this.scene.add(this.glow);
    // the starfin carries its own light: a soft blue halo on the water over it
    this.halo = new THREE.Mesh(this.glow.geometry, new THREE.MeshBasicMaterial({ map: this.glowTex, color: '#6fc8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.halo.renderOrder = 3; this.halo.name = 'fishing:halo'; this.halo.raycast = () => {};
    this.halo.visible = false;
    this.scene.add(this.halo);
    this.lightPos = new THREE.Vector3(this.area.cx, 1.6, this.area.cz);
    this.I = 0;
    this.lamp = g.lights?.add({ pos: this.lightPos, intensity: () => this.I * (g.night || 0) * 3.5, range: 9, color: '#ffd9a0' });
    // the ambient shoal by the dock steps aside: these are its fish now
    this.hidden = [];
    for (const f of wildlife?.fish || []) {
      if (Math.hypot(f.center.x - this.area.cx, f.center.z - this.area.cz) < 9 && f.storyVisible !== false) { f.setVisible(false); this.hidden.push(f); }
    }
    this.rippleT = 1;
    this.t = 0;
    this.setClear(clear);
  }

  /** 0..1: how clear the patch is (eased by the river). */
  setClear(k) {
    const a = this.area;
    this.game.world.water.setClear?.(k > 0 ? { x: a.cx, z: a.cz, r: a.clear } : null, k);
    this.clear = k;
  }

  /** A ring spreading on the water at (x, z). */
  ripple(x, z, size = 0.6, life = 0.9) {
    if (!this.ringMesh) return;
    if (this.rings.length >= 10) this.rings.shift();
    this.rings.push({ x, z, size, life, t: 0 });
  }

  /** dt; float { x, z, cx, cz } or null; drive: see School.update; held: a fish the caller places itself { f, x, y, z, yaw, pitch, roll }. */
  update(dt, float = null, drive = null, held = null) {
    const g = this.game, night = g.night || 0;
    this.t += dt;
    this.I = Math.min(1, this.I + dt * 1.6);
    this.school.update(dt, float, drive);
    const dim = 1 - night * 0.22;
    const hole = this.area.hole;
    for (const f of this.school.fish) {
      if (f.state === 'gone') continue;
      const look = FISH_LOOK[f.species] || FISH_LOOK.trout, batch = this.batches[look.model];
      const scale = look.len / batch.baked.length * f.size;
      _c.set(look.tint);
      if (f.species === 'starfin') _c.multiplyScalar(1.25 + (this.dusk ? 0.9 : 0) + night * 0.5);   // it glows as the light goes
      else _c.multiplyScalar(dim);
      if (held && held.f === f) {
        batch.put(held.x, held.y, held.z, held.yaw, held.pitch || 0, held.roll || 0, scale, 1, Math.sin(this.t * 24) * look.wag, _c);
        continue;
      }
      let y = (f.deep ? DEEP_Y : SWIM_Y) + Math.sin(this.t * 1.3 + f.wig) * 0.02 + f.lift, flat = 1;
      if (f.deep) { _c.copy(DEEP_TINT).multiplyScalar(1 - night * 0.5); flat = 0.4; }
      const bed = g.world.heightAt(f.x, f.z);
      if (bed > y - 0.22) y = Math.min(-0.1, bed + 0.22);
      if (bed > -0.25) continue;                               // no water to swim in: not drawn
      if (hole && Math.hypot(f.x - this.area.cx, f.z - this.area.cz) > hole) continue;   // under the ice
      const beat = f.fast ? 22 : 7 + f.speed * 4;
      f.phase = (f.phase || f.wig) + dt * beat;
      batch.put(f.x, y, f.z, f.heading + Math.sin(f.phase) * 0.06, 0, 0, scale, flat, Math.sin(f.phase) * look.wag * (f.fast ? 1.3 : 1), _c);
    }
    for (const b of Object.values(this.batches)) b.flush();
    // a wandering fish dimples the surface now and then
    if (this.ringMesh) {
      this.rippleT -= dt;
      if (this.rippleT <= 0) {
        this.rippleT = 1.2 + this.rand() * 2;
        const sw = this.school.fish.filter(f => f.state === 'swim' && !f.deep);
        const f = sw[Math.floor(this.rand() * sw.length)];
        if (f && (!hole || Math.hypot(f.x - this.area.cx, f.z - this.area.cz) < hole - 0.4)) this.ripple(f.x, f.z, 0.35, 1.1);
      }
      let i = 0;
      for (const r of this.rings) {
        r.t += dt;
        const k = r.t / r.life;
        if (k >= 1) continue;
        const s = r.size * (0.25 + k * 1.6);
        _m.makeScale(s, 1, s).setPosition(r.x, WATER_Y + 0.025, r.z);
        this.ringMesh.setMatrixAt(i, _m);
        const fade = (1 - k) * (1 - k) * (0.5 - night * 0.22);
        this.ringMesh.setColorAt(i, _c2.setRGB(fade, fade, fade));
        i++;
      }
      this.rings = this.rings.filter(r => r.t < r.life);
      this.ringMesh.count = i;
      this.ringMesh.instanceMatrix.needsUpdate = true;
      if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
    }
    const glow = night * this.I * 0.16 * (this.clear ? 1 : 0);
    this.glow.visible = glow > 0.01;
    this.glow.material.opacity = glow;
    const star = this.school.fish.find(f => f.species === 'starfin' && f.state !== 'gone' && f.state !== 'held' && (!hole || Math.hypot(f.x - this.area.cx, f.z - this.area.cz) < hole - 0.5));
    this.halo.visible = !!star;
    if (star) {
      const s = 1.15 + Math.sin(this.t * 3 + star.wig) * 0.12;
      this.halo.position.set(star.x, WATER_Y + 0.03, star.z);
      this.halo.scale.set(s, 1, s);
      this.halo.material.opacity = this.I * (0.5 + night * 0.25);
    }
  }

  dispose() {
    this.setClear(0);
    for (const b of Object.values(this.batches)) b.dispose(this.scene);
    this.batches = {};
    if (this.ringMesh) { this.scene.remove(this.ringMesh); this.ringMesh.dispose(); this.ringGeo.dispose(); this.ringMat.dispose(); this.ringMesh = null; }
    this.scene.remove(this.glow, this.halo);
    this.glow.geometry.dispose(); this.glow.material.dispose(); this.halo.material.dispose(); this.glowTex.dispose();
    if (this.lamp) this.game.lights?.remove(this.lamp);
    for (const f of this.hidden) f.setVisible(true);
    this.hidden = [];
  }
}
