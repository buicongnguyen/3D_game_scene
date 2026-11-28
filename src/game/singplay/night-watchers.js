// © 2026 Bui Cong Nguyen · solluxlabs.com
// Watchers for a night show in Sing & Play (docs/SING-AND-PLAY.md "Watchers at night"). Town Life sends the villagers
// home after dark, so a show at Night found nobody to wave a glow stick. When a song starts at night (show-cues.js
// isShowNight: the show's own night) the audience is filled up to NIGHT_WATCH's count: first Town Life people still out
// in the evening (walking home, farther afield than the day's 35 m), then villagers who "stayed out for the show": cheap
// bodies from the valley's own villager models (already loaded: no download), no shadow (1 draw each), walking in from
// a few metres to the side, and walking off again after the song (then removed). Sing & Play only.
import { NPC } from '../../actors/npc.js';
import { disposeRigs } from '../tricks/util.js';
import { isShowNight } from '../perform/show-cues.js';
import { gameEnv } from './flat.js';

/**
 * How many watch a night show: PC 6, Low (phones) 3, Low with the group of 8: 2 (the station's Low draw budget: every
 * watcher is a draw, the glow sticks one more; measured in docs/SING-AND-PLAY.md). near: m, how far Town Life people
 * come from at night; arc: rad, the widest half ring; walkIn: m, how far to the side a villager steps in from.
 */
export const NIGHT_WATCH = Object.freeze({ other: 6, low: 3, low8: 2, near: 60, arc: 2.3, walkIn: 5, speed: 1.5, gone: 45, leaveSecs: 12 });
const MODELS = ['villager-woman', 'villager-man', 'villager-kid', 'villager-woman', 'villager-man', 'villager-woman'];

/** The audience a night show fills up to on this device. */
export const nightWatchers = ({ tier = 'high', group = 1 } = {}) => (tier === 'low' ? (group >= 8 ? NIGHT_WATCH.low8 : NIGHT_WATCH.low) : NIGHT_WATCH.other);

/** n places on the half ring in front of the performers (centre cx/cz, radius ring, spread rad apart at most). */
export function ringSpots(n, { cx, cz, ring, spread, facing }) {
  const step = n > 1 ? Math.min(spread, NIGHT_WATCH.arc / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => { const a = facing + (i - (n - 1) / 2) * step; return { x: cx + Math.sin(a) * ring, z: cz + Math.cos(a) * ring, a, r: ring }; });
}

/** Dry, clear ground to stand on (env: flat.js gameEnv). */
export const standable = (x, z, env, h = env.heightAt(x, z)) => h >= env.waterY + 0.3 && !env.solid(x, z, 0.3, h, 1.5);

/**
 * k places for villagers besides the `taken` ones: the ring's own places nearest the middle first, then a row 1.5 m
 * farther out and one 1.2 m nearer (a platform edge, a lamp post or a fence on the ring: they stand just behind or in
 * front of it), each standable and at least `gap` m from every other watcher. Fewer when the ground has no more room.
 */
export function freeSpots(k, frame, env, taken = [], gap = 1.2) {
  const out = [], n = k + taken.length + 2, mid = s => Math.abs(Math.atan2(Math.sin(s.a - frame.facing), Math.cos(s.a - frame.facing)));
  for (const r of [frame.ring, frame.ring + 1.5, frame.ring - 1.2]) {
    for (const s of ringSpots(n, { ...frame, ring: r }).sort((a, b) => mid(a) - mid(b))) {
      if (out.length >= k) return out;
      if (!standable(s.x, s.z, env) || [...taken, ...out].some(t => Math.hypot(t.x - s.x, t.z - s.z) < gap)) continue;
      out.push(s);
    }
  }
  return out;
}

/** A straight walk from a to b over dry, clear ground with no step over 0.5 m between samples (0.7 m apart). */
export function walkable(a, b, env) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.7));
  let prev = env.heightAt(a.x, a.z);
  for (let k = 0; k <= n; k++) {
    const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n, h = env.heightAt(x, z);
    if (Math.abs(h - prev) > 0.5 || !standable(x, z, env, h)) return false;
    prev = h;
  }
  return true;
}

/**
 * Where a villager steps in from to reach `spot` (on the ring round c at radius ring): from the side away from the middle
 * first, then from farther out, then the other side; null when none is walkable (they then stand there from the start).
 */
export function walkInFrom(spot, { cx, cz, ring: r0, facing }, env, d = NIGHT_WATCH.walkIn) {
  const ring = spot.r || r0, off = Math.atan2(Math.sin(spot.a - facing), Math.cos(spot.a - facing)), side = off >= 0 ? 1 : -1, turn = d / ring;
  const at = (a, r) => ({ x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r });
  for (const p of [at(spot.a + side * turn, ring + 1), at(spot.a, ring + d), at(spot.a - side * turn, ring + 1)]) if (walkable(p, spot, env)) return p;
  return null;
}

export class NightWatchers {
  constructor(sp) { this.sp = sp; this.g = sp.g; this.extra = []; this.k = 0; }

  /**
   * After the day's gather (singplay.js gather): at night, fill `audience` up to the device's count and put everyone on
   * the half ring by the new count. opts: { c: { x, z } the performers' centre, ring, spread, facing }. -> villagers added
   */
  fill(audience, { c, ring, spread, facing }) {
    const g = this.g, sp = this.sp, p = g.player.pos;
    if (!isShowNight(g.night || 0) || g.params?.get?.('nightWatchers') === 'off') return 0;
    const want = nightWatchers({ tier: g.renderer.qualityName, group: sp.troupe?.size || sp.group || 1 });
    if (audience.length >= want) return 0;
    const before = audience.length, town = sp.d.town, have = new Set(audience);
    // Town Life people still out (walking home after dark, farther afield than the day's gather)
    if (town) {
      const more = town.people.filter(it => !have.has(it) && it.n.visible && !it.n.far && !it.game && !it.yardHold && !it.n.sitting && !town.show?.on(it) && it.n.pos.distanceTo(p) < NIGHT_WATCH.near)
        .sort((a, b) => a.n.pos.distanceTo(p) - b.n.pos.distanceTo(p)).slice(0, want - audience.length);
      for (const it of more) { it.yardHold = true; it.singHold = true; audience.push(it); }
    }
    const env = gameEnv(g), frame = { cx: c.x, cz: c.z, ring, spread, facing };
    // the town's people take the middle places of the ring; villagers who stayed out for the show the free standable ones
    const taken = ringSpots(want, frame).sort((a, b) => Math.abs(a.a - facing) - Math.abs(b.a - facing)).slice(0, audience.length);
    audience.forEach((it, i) => this.walkTo(it, taken[i], p));
    for (const s of freeSpots(want - audience.length, frame, env, taken)) {
      const from = walkInFrom(s, frame, env) || s;
      const e = this.take(from, s);
      if (!e) break;
      audience.push(e); this.walkTo(e, s, p);
    }
    // (villagers still walking off after the last song and not needed now keep walking: removed when they get there)
    return audience.length - before;
  }

  walkTo(it, s, p) { it.n.walk([[s.x, s.z]], () => { it.n.lookAt(p.x, p.z); it.n.setIdle('Idle'); }, 1.6); }

  /** A villager for the show: one leaving from the last song turns back, else a new body. -> the audience entry or null */
  take(from, to) {
    const g = this.g;
    const back = this.extra.find(e => e.state === 'leave');
    if (back) { back.state = 'watch'; back.exit = [from.x, from.z]; return back; }
    const model = MODELS[this.k % MODELS.length];
    if (!g.assets.has(model)) return null;
    const id = `sing:watch${this.k}`, facing = Math.atan2(to.x - from.x, to.z - from.z);
    const n = new NPC(g.scene, g.assets, g.world, id, model, { x: from.x, z: from.z, facing, tint: NPC.villagerTint(101 + this.k * 3) });
    this.k++;
    n.villager = true; n.barkKind = model.slice(9); n.noShadow = true; n.setDetail(0, false);
    const gr = g.colliders?.groundAt(from.x, from.z, n.pos.y + 0.6, 0.8);
    if (gr && gr.y > n.pos.y) n.place(from.x, from.z, facing, gr.y);
    const e = { n, extra: true, state: 'watch', exit: [from.x, from.z], t: 0 };
    this.extra.push(e);
    return e;
  }

  /** After the song (singplay.js release): the villagers who stayed out walk off and are removed. */
  release() {
    for (const e of this.extra) {
      if (e.state !== 'watch') continue;
      e.state = 'leave'; e.t = 0;
      e.n.walk([e.exit], () => this.drop(e), NIGHT_WATCH.speed);
    }
  }

  /** Every frame: they walk and play their clips (they are not the director's people). */
  update(dt) {
    if (!this.extra.length) return;
    const g = this.g, p = g.player.pos;
    for (const e of [...this.extra]) {
      e.n.update(dt, g.colliders);
      if (e.state === 'leave' && ((e.t += dt) > NIGHT_WATCH.leaveSecs || e.n.pos.distanceTo(p) > NIGHT_WATCH.gone)) this.drop(e);
    }
  }

  drop(e) {
    const i = this.extra.indexOf(e); if (i < 0) return;
    this.extra.splice(i, 1);
    if (e.n.poser) e.n.poser = null;
    e.n.anim?.mixer?.stopAllAction?.();
    e.n.root.removeFromParent(); disposeRigs(e.n.root);
  }

  /** Draw calls a frame the villagers add now (no shadows: one each while shown). */
  draws() { return this.extra.filter(e => e.n.root.visible && e.n.root.parent).length; }
}
