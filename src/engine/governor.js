// Frame governor for the Low tier (phones): when frames stay slow it takes one step down a fixed ladder, and it
// only climbs back while that has never backfired.
//
// Pure logic (no three.js), fed with frame times in seconds. Rules:
//   - a window is ~2 s of frames; frames longer than 0.25 s (tab hidden, a loading hitch) are ignored;
//   - down: the median frame is slower than `slow` in 2 windows running, or the 95th percentile is slower than
//     `spike` in 3 windows running;
//   - up: the 95th percentile is faster than `fast` in `calm` windows running;
//   - a step up that has to be taken back within `regret` seconds makes the lower level the ceiling for good, so
//     the picture never bounces between two levels.

export const LADDER = [
  {},                                                                                       // 0: the tier as designed
  { npcDraw: 58, npcAnim: 20, npcShadow: 12, propDist: 66, midDist: 115, shadowEvery: 3 },  // 1: fewer far people and props
  { scale: 0.85 },                                                                          // 2: a little softer
  { npcDraw: 46, npcAnim: 16, npcShadow: 0, propDist: 55, midDist: 95 },                    // 3: only the nearest people
  { scale: 0.72 },                                                                          // 4
  { scale: 0.62 },                                                                          // 5
];

// Medium and High (desktops and laptops): the picture's cost is the pixels, then the extra passes, then how far the world is
// drawn, so the steps go in that order. `shadowK` and `distK` scale what the tier has, so every tier loses something at every
// step (a fixed number would do nothing on a tier that already had less), and a later step replaces an earlier one.
export const LADDER_DESKTOP = [
  {},                                                    // 0: the tier as designed
  { scale: 0.85 },                                       // 1: a little softer
  { scale: 0.72 },                                       // 2
  { msaa: 0 },                                           // 3: no multisampling (a smoother picture costs a lot of fill)
  { shadowK: 0.5, shadowEvery: 2 },                      // 4: a smaller shadow map
  { distK: 0.75 },                                       // 5: people, props and buildings are drawn less far
  { scale: 0.62 },                                       // 6
  { distK: 0.55, shadowEvery: 3 },                       // 7: the nearest part of the valley only
];

/** The ladder for a tier: Low (phones, software renderers) steps down the people and props; the others the pixels first. */
export const ladderFor = name => (name === 'low' ? LADDER : LADDER_DESKTOP);

export class Governor {
  constructor({ levels = LADDER.length, slow = 1 / 26, spike = 1 / 16, fast = 1 / 48, calm = 5, regret = 30, window = 2 } = {}) {
    Object.assign(this, { levels, slow, spike, fast, calm, regret, window });
    this.level = 0;
    this.ceiling = 0;          // the best level it may still climb to
    this.times = []; this.span = 0;
    this.slowRun = 0; this.spikeRun = 0; this.calmRun = 0;
    this.sinceUp = Infinity;
  }

  /** Feed one frame time (seconds). Returns the new level when it changed, else null. */
  frame(dt) {
    if (!(dt > 0) || dt > 0.25) return null;
    this.times.push(dt); this.span += dt; this.sinceUp += dt;
    if (this.span < this.window || this.times.length < 20) return null;
    const s = this.times.sort((a, b) => a - b), p50 = s[s.length >> 1], p95 = s[Math.floor(s.length * 0.95)];
    this.times = []; this.span = 0;
    this.slowRun = p50 > this.slow ? this.slowRun + 1 : 0;
    this.spikeRun = p95 > this.spike ? this.spikeRun + 1 : 0;
    this.calmRun = p95 < this.fast ? this.calmRun + 1 : 0;
    if ((this.slowRun >= 2 || this.spikeRun >= 3) && this.level < this.levels - 1) {
      if (this.sinceUp < this.regret) this.ceiling = this.level + 1;     // the climb was a mistake: never again
      this.level++;
      this.slowRun = this.spikeRun = this.calmRun = 0;
      return this.level;
    }
    if (this.calmRun >= this.calm && this.level > this.ceiling) {
      this.level--;
      this.sinceUp = 0;
      this.slowRun = this.spikeRun = this.calmRun = 0;
      return this.level;
    }
    return null;
  }

  state() { return { level: this.level, ceiling: this.ceiling }; }
}

/** The tier's settings at a governor level: every step up to `level` applied in order. Returns { q, scale }. */
const DISTANCES = ['npcDraw', 'npcAnim', 'npcShadow', 'propDist', 'buildDist', 'midDist', 'riverbedDist'];
export function settingsAt(base, level, ladder = LADDER) {
  const q = { ...base };
  let scale = 1;
  for (let i = 1; i <= level && i < ladder.length; i++) {
    const { scale: s, shadowK, distK, ...rest } = ladder[i];
    if (s) scale = s;
    if (shadowK) q.shadow = Math.max(1024, Math.round(base.shadow * shadowK));      // (of what the tier has: a later step replaces an earlier one)
    if (distK) for (const k of DISTANCES) if (base[k]) q[k] = Math.max(Math.round(base[k] * distK), k === 'npcShadow' ? 0 : 30);
    for (const [k, v] of Object.entries(rest)) q[k] = k === 'shadowEvery' ? Math.max(v, base[k] ?? 1) : Math.min(v, base[k] ?? v);
  }
  return { q, scale };
}
