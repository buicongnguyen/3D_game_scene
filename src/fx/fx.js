import * as THREE from 'three';
import { makeGlowTexture } from '../engine/textures.js';

const V = new THREE.Vector3();

/** GPU-light particle pools (Points with per-particle size/colour/alpha) + weather + fireworks + meteors. */
class Pool {
  constructor(scene, n, { additive = true, size = 1, tex } = {}) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.base = new Float32Array(n * 4);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: innerHeight / 2 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC;
        uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if (gl_FragColor.a < 0.004) discard; }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(p, v, { life = 1, size = 0.5, color = [1, 1, 1], alpha = 1, gravity = 0, drag = 0, grow = 0 } = {}) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life; this.max[i] = life;
    this.size[i] = size; this.grav[i] = gravity; this.drag[i] = drag; this.grow[i] = grow;
    this.base.set([color[0], color[1], color[2], alpha], i * 4);
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const fade = Math.min(1, (1 - k) * 8) * k;
      this.col[i * 4] = this.base[i * 4]; this.col[i * 4 + 1] = this.base[i * 4 + 1]; this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * Math.min(1, fade * 2.2);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, quality) {
    this.scene = scene;
    const tex = makeGlowTexture(64);
    this.glow = new Pool(scene, 1400, { tex });
    this.soft = new Pool(scene, 700, { tex, additive: false });
    this.weather = new Pool(scene, quality.name === 'Low' ? 350 : 900, { tex, additive: false });
    this.fireflies = new Pool(scene, 160, { tex });
    this.meteors = [];
    this.meteorOn = 0;
    this.weatherKind = 'petals';
    this.t = 0;
    this.fireworksOn = false;
    this.fwT = 0;
    this.pools = [this.glow, this.soft, this.weather, this.fireflies];
    // streak meteors (lines) for the Geminids finale
    const mg = new THREE.BufferGeometry();
    this.meteorPos = new Float32Array(60 * 2 * 3);
    this.meteorCol = new Float32Array(60 * 2 * 3);
    mg.setAttribute('position', new THREE.BufferAttribute(this.meteorPos, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('color', new THREE.BufferAttribute(this.meteorCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.meteorLines = new THREE.LineSegments(mg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.meteorLines.frustumCulled = false;
    this.meteorLines.renderOrder = 99;
    scene.add(this.meteorLines);
    for (let i = 0; i < 60; i++) this.meteors.push({ life: 0 });
  }

  resize() { for (const p of this.pools) p.points.material.uniforms.scale.value = innerHeight / 2; }

  smoke(p, rate, dt, night) {
    this.smokeAcc = (this.smokeAcc || 0) + rate * dt * 14;
    while (this.smokeAcc > 1) {
      this.smokeAcc--;
      const c = night > 0.5 ? 0.35 : 0.93;
      this.soft.emit(p, V.set((Math.random() - 0.5) * 0.6, 2.2 + Math.random(), (Math.random() - 0.5) * 0.6), { life: 3.2, size: 1.1, color: [c, c, c * 1.02], alpha: 0.55, drag: 0.6, grow: 1.4, gravity: -0.2 });
    }
  }

  burst(p, { n = 40, color = [1, 0.8, 0.35], speed = 4, life = 1.2, size = 0.35, gravity = 2 } = {}) {
    for (let i = 0; i < n; i++) {
      V.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      this.glow.emit(p, V, { life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), color, gravity, drag: 1.2 });
    }
  }

  lampBloom(p) {
    this.burst(p, { n: 90, speed: 6, life: 1.8, size: 0.6, gravity: -0.5, color: [1, 0.78, 0.32] });
    for (let i = 0; i < 30; i++) this.glow.emit(p, V.set((Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2), { life: 2.5, size: 0.25, color: [1, 0.9, 0.6], drag: 0.3, gravity: -0.4 });
  }

  twinkle(p, color = [1, 0.85, 0.4]) {
    if (Math.random() < 0.3) this.glow.emit(V.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6)), new THREE.Vector3(0, 0.4, 0), { life: 0.9, size: 0.2, color });
  }

  splash(p) {
    for (let i = 0; i < 40; i++) this.soft.emit(p, V.set((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3), { life: 0.9, size: 0.3, color: [0.85, 0.95, 1], alpha: 0.8, gravity: 9 });
  }

  bees(p, dt) {
    for (let i = 0; i < 3; i++) this.glow.emit(V.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2)), new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4), { life: 0.4, size: 0.12, color: [1, 0.8, 0.1], drag: 3 });
    void dt;
  }

  setWeather(kind) { this.weatherKind = kind; }

  updateWeather(dt, focus, night) {
    const k = this.weatherKind;
    const life = k === 'snow' ? 9 : k === 'petals' ? 12 : 10;
    // never emit faster than the pool recycles: the ring buffer would reuse flakes still in the air, and they
    // blinked out mid-fall (snow at 90/s x 9 s needs 810 slots; the low tier has 350)
    const rate = Math.min(k === 'snow' ? 90 : k === 'petals' ? 16 : k === 'leaves' ? 14 : 0, this.weather.n * 0.95 / life);
    this.wAcc = (this.wAcc || 0) + rate * dt;
    while (this.wAcc > 1) {
      this.wAcc--;
      const p = V.set(focus.x + (Math.random() - 0.5) * 50, focus.y + 8 + Math.random() * 10, focus.z + (Math.random() - 0.5) * 50);
      if (k === 'snow') this.weather.emit(p, new THREE.Vector3(0.6, -1.6 - Math.random(), 0.3), { life, size: 0.14, color: [1, 1, 1], alpha: 0.9, drag: 0.2 });
      else if (k === 'petals') this.weather.emit(p, new THREE.Vector3(1.2, -0.8, 0.5), { life, size: 0.13, color: [1, 0.72, 0.84], alpha: 0.95 });
      else if (k === 'leaves') this.weather.emit(p, new THREE.Vector3(1.4, -1.1, 0.4), { life, size: 0.18, color: Math.random() < 0.5 ? [0.93, 0.45, 0.12] : [0.95, 0.72, 0.18], alpha: 0.95 });
    }
    // summer-night fireflies
    if (k === 'fireflies' && night > 0.5) {
      this.ffAcc = (this.ffAcc || 0) + dt * 20;
      while (this.ffAcc > 1) {
        this.ffAcc--;
        const p = V.set(focus.x + (Math.random() - 0.5) * 40, focus.y + 0.3 + Math.random() * 2, focus.z + (Math.random() - 0.5) * 40);
        this.fireflies.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4), { life: 3 + Math.random() * 3, size: 0.18, color: [0.8, 1, 0.4] });
      }
    }
  }

  /** Fireworks over a point, until stopped. */
  fireworks(on, center) { this.fireworksOn = on; this.fwCenter = center; }
  meteorShower(intensity) { this.meteorOn = intensity; }

  updateFireworks(dt, audio) {
    if (!this.fireworksOn) return;
    this.fwT -= dt;
    if (this.fwT > 0) return;
    this.fwT = 0.5 + Math.random() * 0.9;
    const c = this.fwCenter;
    const p = new THREE.Vector3(c.x + (Math.random() - 0.5) * 60, c.y + 38 + Math.random() * 22, c.z + (Math.random() - 0.5) * 40);
    const palette = [[1, 0.45, 0.3], [1, 0.8, 0.3], [0.5, 0.8, 1], [0.95, 0.5, 0.9], [0.5, 1, 0.6]];
    const col = palette[Math.floor(Math.random() * palette.length)];
    setTimeout(() => this.burst(p, { n: 140, color: col, speed: 13, life: 2.2, size: 0.9, gravity: 3.5 }), 900);
    for (let i = 0; i < 12; i++) this.glow.emit(new THREE.Vector3(p.x, p.y - 40 + i * 3.3, p.z), new THREE.Vector3(0, 30, 0), { life: 0.12 + i * 0.02, size: 0.4, color: [1, 0.85, 0.6] });
    audio?.firework(0);
  }

  updateMeteors(dt, camPos) {
    const pos = this.meteorPos, col = this.meteorCol;
    for (let i = 0; i < this.meteors.length; i++) {
      const m = this.meteors[i];
      if (m.life <= 0 && Math.random() < this.meteorOn * dt * 0.9) {
        const radiant = new THREE.Vector3(-0.3, 0.8, -0.5).normalize();
        const start = camPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 900, 380 + Math.random() * 250, -200 - Math.random() * 600));
        const dir = radiant.clone().multiplyScalar(-1).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)).normalize();
        Object.assign(m, { life: 0.9 + Math.random() * 0.8, max: 0, p: start, v: dir.multiplyScalar(420 + Math.random() * 300), len: 30 + Math.random() * 60 });
        m.max = m.life;
      }
      if (m.life > 0) {
        m.life -= dt;
        m.p.addScaledVector(m.v, dt);
        const tail = m.p.clone().addScaledVector(m.v.clone().normalize(), -m.len);
        const a = Math.sin(Math.PI * (1 - m.life / m.max));
        pos.set([m.p.x, m.p.y, m.p.z, tail.x, tail.y, tail.z], i * 6);
        col.set([a * 1.6, a * 1.5, a * 1.2, 0, 0, 0], i * 6);
      } else col.fill(0, i * 6, i * 6 + 6);
    }
    this.meteorLines.geometry.attributes.position.needsUpdate = true;
    this.meteorLines.geometry.attributes.color.needsUpdate = true;
  }

  update(dt, focus, night, audio, camPos) {
    this.t += dt;
    this.updateWeather(dt, focus, night);
    this.updateFireworks(dt, audio);
    this.updateMeteors(dt, camPos);
    for (const p of this.pools) p.update(dt);
  }
}
