import * as THREE from 'three';

const HYSTERESIS = 1.35;        // a newcomer must outshine the weakest lit source by this factor to take its light
const FADE_IN = 6, FADE_OUT = 8; // weight change per second (~0.15 s fades)

/**
 * A fixed pool of point lights shared by every glowing thing in the valley (lamps, porch, hearth,
 * trackside lanterns, sparks). The light count never changes, so shaders never recompile and the
 * per-fragment cost stays bounded, however many sources exist.
 *
 * Each light is a slot that keeps its source for as long as that source stays among the most important
 * ones near the camera. Slots never jump: a source that loses its place fades out and only then does the
 * slot fade in on the next one, so lights never pop on or off, and flickering sources of similar weight
 * cannot trade places every frame. Sources also dim out smoothly as the camera leaves their reach.
 */
export class LightPool {
  constructor(scene, size = 3) {
    this.lights = [];
    this.slots = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight('#ffb84d', 0, 30, 1.5);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
      this.slots.push({ light: l, src: null, next: null, leaving: false, w: 0, I: 0, score: 0 });
    }
    this.sources = new Set();
    this.lastT = null;
  }

  /** src: { pos: Vector3, color, intensity: number | () => number, range } — returns a handle to remove. */
  add(src) {
    const s = { range: 30, color: '#ffb84d', ...src };
    this.sources.add(s);
    return s;
  }

  remove(s) { this.sources.delete(s); }

  /** Brightness of a source as seen from camPos: I (reach-faded intensity) and a ranking score. */
  weigh(s, camPos) {
    if (!this.sources.has(s)) return { I: 0, score: 0 };
    const I = typeof s.intensity === 'function' ? s.intensity() : s.intensity;
    if (!(I > 0.01)) return { I: 0, score: 0 };
    const d2 = s.pos.distanceToSquared(camPos);
    // dim out over the last fifth of the reach instead of dropping at 3 x range
    const reach = 1 - THREE.MathUtils.smoothstep(Math.sqrt(d2), s.range * 2.4, s.range * 3);
    if (reach <= 0) return { I: 0, score: 0 };
    return { I: I * reach, score: I * reach / (1 + d2 / (s.range * s.range)) };
  }

  /** camPos: the camera; dt (optional): seconds since the last update, measured here when omitted. */
  update(camPos, dt) {
    const now = performance.now() / 1000;
    if (dt === undefined) dt = this.lastT === null ? 1 : Math.min(0.1, Math.max(0, now - this.lastT));
    this.lastT = now;

    // score the lit slots; a slot whose source went dark, away or was removed fades out
    const held = new Set();
    for (const sl of this.slots) {
      if (sl.next) held.add(sl.next);
      if (!sl.src) continue;
      held.add(sl.src);
      const e = this.weigh(sl.src, camPos);
      sl.score = e.score;
      if (e.score > 0) sl.I = e.I; else sl.leaving = true; // keep the last intensity to fade from
    }
    // candidates without a light, strongest first
    const cands = [];
    for (const s of this.sources) {
      if (held.has(s)) continue;
      const e = this.weigh(s, camPos);
      if (e.score > 0) cands.push({ s, score: e.score });
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      let slot = this.slots.find(sl => !sl.src && !sl.next);
      if (!slot) {
        let weakest = null;
        for (const sl of this.slots) if (sl.src && !sl.next && !sl.leaving && (!weakest || sl.score < weakest.score)) weakest = sl;
        if (!weakest || c.score <= weakest.score * HYSTERESIS) break;
        weakest.leaving = true;
        slot = weakest;
      }
      if (slot.src) slot.next = c.s;
      else Object.assign(slot, { src: c.s, w: 0, leaving: false, I: this.weigh(c.s, camPos).I });
    }

    for (const sl of this.slots) {
      const l = sl.light;
      if (sl.src) {
        sl.w = sl.leaving ? Math.max(0, sl.w - dt * FADE_OUT) : Math.min(1, sl.w + dt * FADE_IN);
        if (sl.leaving && sl.w <= 0) {
          const nx = sl.next;
          Object.assign(sl, { src: nx, next: null, leaving: false, w: 0, I: nx ? this.weigh(nx, camPos).I : 0 });
        }
      }
      if (!sl.src) { l.intensity = 0; continue; }
      l.position.copy(sl.src.pos);
      l.color.set(sl.src.color);
      l.distance = sl.src.range;
      l.intensity = sl.I * sl.w * sl.w * (3 - 2 * sl.w);
    }
  }
}
