import * as THREE from 'three';
import { WATER_Y } from '../world/layout.js';

const DAY = new THREE.Color('#1c8f99');
const DUSK = new THREE.Color('#0b3f5a');
const NIGHT = new THREE.Color('#031622');

function bubbleTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(26, 24, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.35, 'rgba(210,245,255,0.35)');
  grd.addColorStop(0.8, 'rgba(190,240,255,0.55)');
  grd.addColorStop(1, 'rgba(190,240,255,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Below the river surface the valley becomes a hushed green-blue world: dense tinted fog, a wobbling
 * colour grade, bubbles trailing from Mika and muffled sound. Everything switches exactly at the surface
 * so a frame is never half fogged.
 */
export class Underwater {
  constructor(game) {
    this.g = game;
    this.under = false;
    this.fogColor = new THREE.Color();
    const N = 64;
    this.parts = Array.from({ length: N }, () => ({ life: 0, p: new THREE.Vector3(), v: 0, ph: 0 }));
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3);
    this.size = new Float32Array(N);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: bubbleTex() }, scale: { value: 400 } },
      vertexShader: /* glsl */`
        attribute float size;
        uniform float scale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map;
        void main() { vec4 c = texture2D(map, gl_PointCoord); if (c.a < 0.02) discard; gl_FragColor = c; }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    game.scene.add(this.points);
    this.emitAcc = 0;
    this.gurgle = 0;
  }

  /** The camera is under water when it is below the surface and above the river bed. */
  cameraUnder() {
    const c = this.g.camera.position;
    return c.y < WATER_Y - 0.02 && this.g.world.heightAt(c.x, c.z) < c.y;
  }

  emit(at, n = 1, spread = 0.15) {
    for (let i = 0; i < n; i++) {
      const b = this.parts.find(q => q.life <= 0);
      if (!b) return;
      b.life = 1;
      b.p.set(at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread, at.z + (Math.random() - 0.5) * spread);
      b.v = 0.6 + Math.random() * 0.7;
      b.ph = Math.random() * 6.28;
      b.s = 0.05 + Math.random() * 0.09;
    }
  }

  update(dt, L) {
    const g = this.g, p = g.player;
    const under = this.cameraUnder();
    this.under = under;
    const grade = g.renderer.grade.uniforms;
    grade.uUnder.value = under ? 1 : 0;
    grade.uTime.value += dt;
    g.audio?.setUnderwater?.(under);
    if (under) {
      // sunlit teal by day, deep blue at dusk, ink at night
      const night = L.night || 0;
      this.fogColor.copy(DAY).lerp(DUSK, Math.min(1, night * 1.6)).lerp(NIGHT, Math.max(0, night * 1.4 - 0.4));
      g.scene.fog.color.copy(this.fogColor);
      g.scene.fog.density = 0.085 + night * 0.035;
    }
    // bubbles from Mika's mouth while she is under, plus a burst when she dives in
    if (p.submerged) {
      this.emitAcc += dt * (p.speed > 0.5 ? 7 : 3.5);
      const head = p.pos.clone().add(new THREE.Vector3(Math.sin(p.facing) * 0.25, 1.25, Math.cos(p.facing) * 0.25));
      while (this.emitAcc > 1) { this.emitAcc -= 1; this.emit(head, 1, 0.1); }
      this.gurgle -= dt;
      if (this.gurgle <= 0) { this.gurgle = 0.9 + Math.random() * 1.6; g.audio?.bubble?.(); }
    }
    for (const e of p.events) if (e.type === 'splash') this.emit(new THREE.Vector3(e.x, WATER_Y - 0.6, e.z), Math.round(10 + 14 * (e.strength || 0.5)), 0.9);
    let k = 0;
    for (const b of this.parts) {
      if (b.life > 0) {
        b.life -= dt * 0.28;
        b.ph += dt * 5;
        b.p.y += b.v * dt;
        b.p.x += Math.sin(b.ph) * 0.12 * dt;
        b.p.z += Math.cos(b.ph * 0.8) * 0.12 * dt;
        if (b.p.y > WATER_Y - 0.03) b.life = 0;
      }
      const alive = b.life > 0;
      this.pos[k * 3] = b.p.x; this.pos[k * 3 + 1] = alive ? b.p.y : -999; this.pos[k * 3 + 2] = b.p.z;
      this.size[k] = alive ? b.s : 0;
      k++;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.mat.uniforms.scale.value = g.renderer.renderer.domElement.height * 0.9;
  }
}
