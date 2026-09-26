import * as THREE from 'three';

/**
 * A fixed pool of point lights shared by every glowing thing in the valley (lamps, porch, hearth,
 * trackside lanterns, sparks). The light count never changes, so shaders never recompile and the
 * per-fragment cost stays bounded, however many sources exist. Each frame the pool is assigned to
 * the sources that matter most near the camera.
 */
export class LightPool {
  constructor(scene, size = 3) {
    this.lights = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight('#ffb84d', 0, 30, 1.5);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.sources = new Set();
  }

  /** src: { pos: Vector3, color, intensity: number | () => number, range } — returns a handle to remove. */
  add(src) {
    const s = { range: 30, color: '#ffb84d', ...src };
    this.sources.add(s);
    return s;
  }

  remove(s) { this.sources.delete(s); }

  update(camPos) {
    const scored = [];
    for (const s of this.sources) {
      const I = typeof s.intensity === 'function' ? s.intensity() : s.intensity;
      if (I <= 0.01) continue;
      const d2 = s.pos.distanceToSquared(camPos);
      if (d2 > (s.range * 3) ** 2) continue;
      scored.push({ s, I, score: I / (1 + d2 / (s.range * s.range)) });
    }
    scored.sort((a, b) => b.score - a.score);
    this.lights.forEach((l, i) => {
      const e = scored[i];
      if (!e) { l.intensity = 0; return; }
      l.position.copy(e.s.pos);
      l.color.set(e.s.color);
      l.distance = e.s.range;
      l.intensity = e.I;
    });
  }
}
