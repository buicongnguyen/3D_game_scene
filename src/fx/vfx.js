// Small, cheap visual effects for the valley (docs/VFX.md): footstep and landing puffs by ground and season, pollen and
// ice glints in the daylight air, smoke from the bakery and mill chimneys.
//
// The budget is the point. Everything goes through the FX particle pools (src/fx/fx.js: one draw each, no new shader,
// and a pool that has nothing alive is neither updated nor drawn), at a few particles per event or per second, scaled
// down on the Low tier, off for the slowest steps of the governor and while a round holds the weather.
// Pure logic where it can be (tests/vfx.test.mjs); the emit calls take the FX object.
import * as THREE from 'three';

const V = new THREE.Vector3(), W = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);

/** How bright an unlit, normally blended particle may be: day 1, night 0.28 (they would glow white in the dark). */
export const lightAt = night => lerp(1, 0.28, Math.min(1, Math.max(0, night)));

/** What a footstep kicks up on this ground in this season. -> { kind, n } or null (nothing worth drawing). */
export function stepKind(surface, season, speed) {
  const run = speed > 4.6;
  switch (surface) {
    case 'sand': return { kind: 'dust', n: run ? 3 : 2 };
    case 'ice': return { kind: 'glint', n: run ? 3 : 2 };
    case 'grass': return season === 'winter' ? { kind: 'snow', n: run ? 3 : 2 } : { kind: season === 'autumn' ? 'leafy' : 'blades', n: run ? 3 : 2 };
    case 'stone': case 'wood': return run ? { kind: 'dust', n: 1 } : null;
    default: return null;
  }
}

export class Vfx {
  /** @param fx the FX object; @param low true on the Low tier (phones): half of everything. */
  constructor(fx, low = false) {
    this.fx = fx;
    this.k = low ? 0.5 : 1;
    this.off = false;                 // set by the owner while the governor is far down its ladder
    this.chimneys = [];               // { pos: Vector3, acc: number }
    this.moteAcc = 0;
    this.t = 0;
  }

  /** One footstep at `pos`. */
  step(pos, surface, season, night, speed) {
    if (this.off) return;
    const s = stepKind(surface, season, speed);
    if (s) this.puff(pos, s.kind, Math.max(1, Math.round(s.n * this.k)), night, speed > 4.6 ? 1.4 : 1);
  }

  /** Landing: a ring of dust (or snow) kicked outward; `strength` 0..1 is the fall. */
  land(pos, surface, season, night, strength) {
    if (this.off || strength < 0.22 || surface === 'ice') return;
    const kind = season === 'winter' && surface === 'grass' ? 'snow' : surface === 'wood' || surface === 'stone' ? 'dust' : surface === 'sand' ? 'dust' : season === 'autumn' ? 'leafy' : 'blades';
    const n = Math.max(4, Math.round((8 + strength * 6) * this.k));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, sp = 1.1 + strength * 1.6;
      this.emitKind(kind, V.set(pos.x + Math.cos(a) * 0.25, pos.y + 0.08, pos.z + Math.sin(a) * 0.25), W.set(Math.cos(a) * sp, 0.5 + strength * 0.5, Math.sin(a) * sp), night, 1.15);
    }
  }

  /** Push-off puff when she jumps. */
  jump(pos, surface, season, night) {
    if (this.off || surface === 'ice') return;
    this.puff(pos, surface === 'grass' ? (season === 'winter' ? 'snow' : 'blades') : 'dust', Math.max(1, Math.round(2 * this.k)), night, 1.1);
  }

  puff(pos, kind, n, night, boost = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rnd(0.25, 0.9) * boost;
      this.emitKind(kind, V.set(pos.x + Math.cos(a) * 0.15, pos.y + 0.06, pos.z + Math.sin(a) * 0.15), W.set(Math.cos(a) * sp, rnd(0.5, 1.4), Math.sin(a) * sp), night, boost);
    }
  }

  emitKind(kind, p, v, night, boost = 1) {
    const L = lightAt(night), fx = this.fx;
    switch (kind) {
      case 'dust': fx.soft.emit(p, v, { life: rnd(0.7, 1.1), size: rnd(0.28, 0.42) * boost, color: [0.82 * L, 0.72 * L, 0.55 * L], alpha: 0.55, drag: 1.6, gravity: -0.15, grow: 0.7 }); break;
      case 'snow': fx.soft.emit(p, v, { life: rnd(0.8, 1.2), size: rnd(0.26, 0.38) * boost, color: [0.97 * L, 0.99 * L, 1 * L], alpha: 0.8, drag: 1.5, gravity: 0.4, grow: 0.5 }); break;
      case 'blades': fx.soft.emit(p, v.multiplyScalar(0.8), { life: rnd(0.45, 0.8), size: rnd(0.09, 0.15), color: [rnd(0.4, 0.65) * L, rnd(0.75, 0.95) * L, 0.2 * L], alpha: 1, drag: 0.8, gravity: 7 }); break;
      case 'leafy': fx.soft.emit(p, v.multiplyScalar(0.8), { life: rnd(0.5, 0.9), size: rnd(0.1, 0.17), color: [rnd(0.85, 1) * L, rnd(0.4, 0.6) * L, 0.1 * L], alpha: 1, drag: 0.8, gravity: 5.5 }); break;
      case 'glint': fx.glow.emit(p, v.multiplyScalar(0.5), { life: rnd(0.45, 0.75), size: rnd(0.16, 0.24), color: [0.8, 0.93, 1], alpha: 1, drag: 2 }); break;
      default: break;
    }
  }

  /** The bakery's and the mill's chimneys: positions where smoke starts (world space). */
  setChimneys(list) { this.chimneys = list.map(pos => ({ pos: pos.clone(), acc: Math.random() })); }

  /**
   * Every frame. `env`: { night, season, hour, raining, hold, level }. `hold`: a round holds the weather (nothing new
   * floats about); `level`: how far down the governor's ladder a phone is (from 2: no ambient effects at all).
   */
  update(dt, focus, env) {
    this.t += dt;
    const fx = this.fx;
    this.off = this.disabled || env.level >= 3;
    if (this.off || env.hold) return;
    const day = env.hour > 6.5 && env.hour < 18.5 && env.night < 0.25;
    // daylight air: pollen drifting in spring and summer, a few dry leaf flecks in autumn, ice glints in winter
    if (day && !env.raining && env.level < 2) {
      const winter = env.season === 'winter';
      this.moteAcc += dt * (winter ? 3.2 : 2.4) * this.k;
      while (this.moteAcc > 1) {
        this.moteAcc--;
        const a = Math.random() * Math.PI * 2, r = rnd(2, 15);
        V.set(focus.x + Math.cos(a) * r, focus.y + rnd(0.4, 3.6), focus.z + Math.sin(a) * r);
        if (winter) fx.glow.emit(V, W.set(rnd(-0.1, 0.1), rnd(-0.05, 0.15), rnd(-0.1, 0.1)), { life: rnd(0.9, 1.6), size: rnd(0.1, 0.17), color: [0.82, 0.94, 1], alpha: 1, drag: 0.4 });
        else fx.glow.emit(V, W.set(rnd(-0.18, 0.28), rnd(0.02, 0.2), rnd(-0.18, 0.18)), { life: rnd(4.5, 7), size: rnd(0.09, 0.15), color: env.season === 'autumn' ? [1, 0.82, 0.5] : [1, 0.96, 0.72], alpha: 0.8, drag: 0.3 });
      }
    }
    // chimney smoke: only those near her, a thin grey ribbon (white by day, dim at night)
    const c = lerp(0.93, 0.4, Math.min(1, env.night * 1.6));
    for (const ch of this.chimneys) {
      const dx = ch.pos.x - focus.x, dz = ch.pos.z - focus.z;
      if (dx * dx + dz * dz > 75 * 75) continue;
      ch.acc += dt * (env.season === 'winter' || env.night > 0.3 ? 3.4 : 2.1) * this.k;
      while (ch.acc > 1) {
        ch.acc--;
        fx.soft.emit(ch.pos, V.set(rnd(0.1, 0.5), rnd(1.1, 1.8), rnd(-0.2, 0.2)), { life: rnd(3, 4.2), size: rnd(0.55, 0.75), color: [c, c, c * 1.03], alpha: 0.5, drag: 0.55, grow: 0.85, gravity: -0.1 });
      }
    }
  }
}
