// Barks: the one-line remarks people call out as Mika walks past, with no interaction needed. Pure logic (no DOM, no
// three.js) so it can be tested: which lines fit this speaker and this moment, and which one to say now.
import { BARKS } from '../content/barks.js';
import { inStory } from './stories/index.js';

/** How far away (metres) a villager still says something, and how close counts as "passing by". */
export const BARK_RANGE = 20;
export const BARK_NEAR = 6;

// Named parts of the valley, as [x, z, radius]. The first zone that contains the point wins.
const ZONES = [
  ['mill', -15, -45, 22], ['orchard', 72, -48, 36], ['pasture', 150, -38, 30], ['shrine', 62, -150, 42],
  ['takamori', 115, 6, 48], ['hoshi', -95, 118, 48], ['kawabe', -45, 20, 52],
];

/** The part of the valley a point is in ('river' when it is close to the water and in no other zone), or null. */
export function zoneAt(x, z, nearRiver = false) {
  for (const [id, cx, cz, r] of ZONES) if (Math.hypot(x - cx, z - cz) < r) return id === 'kawabe' && nearRiver ? 'river' : id;
  return nearRiver ? 'river' : null;
}

/** Night here means the lamps are on: 20:00 to 05:00. */
export const isNight = hour => hour >= 20 || hour < 5;

/**
 * What a bark may depend on: { season, hour, weather, chapter, place }. `weather` is 'snow' | 'rain' | null.
 * `kind` is the speaker: a cast id ('genzo', 'rin', 'ota', 'hana') or a villager body ('man', 'woman', 'kid').
 */
export function fits(entry, kind, ctx) {
  const w = entry.when || {};
  if (entry.who === 'kid') { if (kind !== 'kid') return false; }
  else if (entry.who !== 'any') { if (entry.who !== kind) return false; }
  else if (kind === 'kid') return false; // children keep to their own lines (the generic ones are grown-up remarks)
  if (w.season && w.season !== ctx.season) return false;
  if (w.night !== undefined && w.night !== isNight(ctx.hour)) return false;
  if (w.weather && w.weather !== ctx.weather) return false;
  if (w.place && w.place !== ctx.place) return false;
  if (w.chapter && (ctx.chapter < w.chapter[0] || ctx.chapter > w.chapter[1])) return false;
  return true;
}

/**
 * Choose the line to say, or null. `recent` is the speaker's own memory plus a shared one (a Set of texts, which this
 * adds the choice to, keeping at most `keep` of the newest): nothing already in it is chosen while any other line fits,
 * and lines that match more of the moment (a season AND a place) are preferred to the generic ones.
 */
export function pickBark(kind, ctx, recent, rand = Math.random, keep = 24) {
  const pool = [];
  for (const e of BARKS) {
    if (!inStory(e)) continue;            // a line written for the other story
    if (!fits(e, kind, ctx)) continue;
    const w = e.when || {};
    // how specific the line is: each condition it names adds weight, so a winter-and-Kawabe line beats a generic one
    const weight = 1 + 6 * (['season', 'night', 'weather', 'place', 'chapter'].filter(k => w[k] !== undefined).length) + (e.who === 'any' ? 0 : 1);
    pool.push({ e, weight });
  }
  if (!pool.length) return null;
  const fresh = pool.filter(p => !recent.has(p.e.text));
  const from = fresh.length ? fresh : pool;
  let r = rand() * from.reduce((s, p) => s + p.weight, 0);
  let chosen = from[from.length - 1].e;
  for (const p of from) { r -= p.weight; if (r <= 0) { chosen = p.e; break; } }
  recent.add(chosen.text);
  while (recent.size > keep) recent.delete(recent.values().next().value);
  return chosen.text;
}

/**
 * Which of the people nearby speaks next, and when. Keeps the valley from turning into a wall of text: at most `max`
 * bubbles at once, a pause between lines, and a long rest for each speaker.
 */
export class BarkClock {
  constructor({ max = 2, gap = 2.8, rest = [22, 40], life = 4.6 } = {}) {
    Object.assign(this, { max, gap, rest, life });
    this.t = 0; this.sinceLast = 5; this.next = new Map(); this.live = new Map();
  }
  /** Advance time; returns the ids whose bubble just ended. */
  update(dt) {
    this.t += dt; this.sinceLast += dt;
    const ended = [];
    for (const [id, until] of this.live) if (this.t >= until) { this.live.delete(id); ended.push(id); }
    return ended;
  }
  /** May `id` speak now? (nobody is mid-line beyond `max`, the room has paused, and this speaker has rested.) */
  canSpeak(id) {
    return this.live.size < this.max && this.sinceLast >= this.gap && !this.live.has(id) && this.t >= (this.next.get(id) ?? 0);
  }
  /** Record that `id` spoke. `rand` shapes the rest so people do not all speak in step. */
  spoke(id, rand = Math.random) {
    this.live.set(id, this.t + this.life);
    this.sinceLast = 0;
    this.next.set(id, this.t + this.rest[0] + (this.rest[1] - this.rest[0]) * rand());
  }
  /** Give `id` a head start (someone just came into range for the first time). */
  prime(id, after = 0) { if (!this.next.has(id)) this.next.set(id, this.t + after); }
}
