import * as THREE from 'three';
import { Animator } from './animator.js';
import { makeGlowTexture } from '../engine/textures.js';

const glowTex = () => (glowTex.t ??= makeGlowTexture(64));

/** Tamo: the star spirit that floats beside Mika, glows, talks and fires sparks. */
export class Tamo {
  constructor(scene, assets) {
    this.scene = scene;
    const m = assets.clone('tamo');
    if (m) {
      this.model = m;
      this.anim = new Animator(m);
      this.anim.play('Float');
    } else {
      this.model = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshStandardMaterial({ color: '#ffd45a', emissive: '#ffb830', emissiveIntensity: 2 }));
      this.anim = null;
    }
    this.mats = [];
    this.model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;
      for (const mat of [o.material].flat()) if (mat.name === 'Tamo glow' || !this.anim) {
        mat.emissive = new THREE.Color('#ffc23a');
        mat.emissiveIntensity = 1.4;
        this.mats.push(mat);
      }
    });
    this.root = new THREE.Group();
    this.root.add(this.model);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffcf6a', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.setScalar(1.3);
    this.root.add(this.halo);
    // the companion light lives in the scene permanently (constant light count -> no shader recompiles)
    this.light = new THREE.PointLight('#ffc45a', 0, 8, 1.6);
    scene.add(this.light);
    this.root.visible = false;
    scene.add(this.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.t = 0;
    this.power = 1;       // grows with every lamp
    this.sparks = [];
    this.hidden = true;
  }

  show(at) {
    this.hidden = false;
    this.root.visible = true;
    if (at) this.pos.copy(at);
  }

  hide() { this.hidden = true; this.root.visible = false; this.light.intensity = 0; }

  react(clip) { this.anim?.once(clip, { then: 'Float' }); }

  update(dt, player, night, aiming, camYaw) {
    this.t += dt;
    if (this.hidden) return;
    // hover at Mika's left shoulder; in aim mode, move to the lantern tip in front
    const side = aiming ? 0.15 : -0.75;
    const fwd = aiming ? 0.55 : -0.2;
    const f = player.facing;
    const target = new THREE.Vector3(
      player.pos.x + Math.sin(f) * fwd + Math.cos(f) * side * -1,
      player.pos.y + (aiming ? 1.35 : 1.7) + Math.sin(this.t * 2.1) * 0.08,
      player.pos.z + Math.cos(f) * fwd - Math.sin(f) * side * -1,
    );
    if (this.override) target.copy(this.override);
    // he keeps up even when Mika speed-leaps (x16 is ~70 m/s): the faster she goes, the tighter he follows
    const k = 1 - Math.exp(-dt * (this.override ? 2.2 : 6 + (player.speed || 0) * 0.9));
    this.pos.lerp(target, k);
    if (!this.override && this.pos.distanceTo(target) > 25) this.pos.lerp(target, 0.9);
    this.root.position.copy(this.pos);
    this.root.rotation.y = aiming ? camYaw : f + Math.sin(this.t * 0.7) * 0.4;
    const s = 0.9 + this.power * 0.06;
    this.model.scale.setScalar(s);
    const glow = 1.1 + Math.sin(this.t * 3) * 0.15 + this.power * 0.2;
    for (const m of this.mats) m.emissiveIntensity = glow;
    this.light.position.copy(this.pos);
    this.light.intensity = (0.6 + night * 3.5) * (0.9 + this.power * 0.15);
    this.halo.material.opacity = 0.35 + night * 0.4;
    this.anim?.update(dt);
    this.updateSparks(dt);
  }

  /** Launch a spark from Tamo toward a world point; onHit(target) when it arrives. */
  fire(to, onArrive) {
    const from = this.pos.clone();
    const dist = from.distanceTo(to);
    const dur = Math.min(1.1, 0.25 + dist / 38);
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, Math.min(4, dist * 0.12), 0));
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffe08a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.scale.setScalar(0.9);
    this.scene.add(sprite);
    const trail = [];
    for (let i = 0; i < 10; i++) {
      const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ffb84a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      t.scale.setScalar(0.5 - i * 0.03);
      this.scene.add(t);
      trail.push(t);
    }
    const light = this.pool?.add({ pos: sprite.position, intensity: 7, range: 10, color: '#ffc45a' });
    this.sparks.push({ from, mid, to, t: 0, dur, sprite, trail, hist: [], onArrive, light });
    this.anim?.once('Fire', { then: 'Float' });
  }

  updateSparks(dt) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      const a = s.from.clone().lerp(s.mid, u), b = s.mid.clone().lerp(s.to, u);
      const p = a.lerp(b, u);
      s.sprite.position.copy(p);
      s.sprite.scale.setScalar(0.8 + Math.sin(s.t * 40) * 0.15);
      s.hist.unshift(p.clone());
      if (s.hist.length > 10) s.hist.pop();
      s.trail.forEach((t, k) => { const h = s.hist[k]; if (h) { t.position.copy(h); t.material.opacity = 0.7 * (1 - k / 10); } });
      if (u >= 1) {
        if (s.light) this.pool?.remove(s.light);
        s.onArrive?.(s.to.clone());
        this.scene.remove(s.sprite, ...s.trail);
        s.sprite.material.dispose();
        s.trail.forEach(t => t.material.dispose());
        this.sparks.splice(i, 1);
      }
    }
  }
}
