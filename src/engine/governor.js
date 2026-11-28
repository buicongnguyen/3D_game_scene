// © 2026 Bui Cong Nguyen · solluxlabs.com
// Frame governor (every tier; the ladder per tier, resolution choice and device: governorFor): when frames stay slow it
// takes one step down a fixed ladder, and it only climbs back while that has never backfired.
//
// Pure logic (no three.js), fed with frame times in seconds. Rules:
//   - a window is ~2 s of frames; frames longer than 0.25 s (tab hidden, a loading hitch) are ignored;
//   - down: the median frame is slower than `slow` in 2 windows running, or the 95th percentile is slower than
//     `spike` in 3 windows running;
//   - up: the 95th percentile is faster than `fast` in `calm` windows running;
//   - a step up that has to be taken back within `regret` seconds makes the lower level the ceiling (for good, or for
//     `forget` seconds on a desktop), so the picture never bounces between two levels;
//   - `holds`: a desktop step below the screen's resolution waits for a long slow stretch (governorFor, PC_HOLD).

// Low: a phone is short of CPU (draws and the scene walk), which a smaller picture does not help, so every step but
// the last cuts drawing (phone speed plan, step 11, owner OK 2026-11-27). Steps 2+ also mean "slow device" elsewhere
// (device-note.js SLOW_LEVEL: no ambient effects, no moments).
export const LADDER = [
  {},                                                                                       // 0: the tier as designed
  { npcDraw: 58, npcAnim: 20, npcShadow: 12, propDist: 66, midDist: 115, shadowEvery: 3 },  // 1: fewer far people and props
  { bloom: false },                                                                         // 2: no glow (its 11 post draws)
  { npcDraw: 46, npcAnim: 16, npcShadow: 0, propDist: 55, midDist: 95, shadowEvery: 4 },    // 3: only the nearest people; shadows redrawn every 4th frame
  { shadowEvery: 8 },                                                                       // 4: shadows redrawn every 8th frame
  { scale: 0.85 },                                                                          // 5: a little softer, last
];

// Low tier's step-down line: 31 ms. Paced to 30 fps (game.js), the governor is fed the frame's own work, not the gap
// between frames (always ~33 ms when paced, so the old 38 ms line was never crossed and a struggling phone never helped).
export const LOW_SLOW = 0.031;

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

// A desktop (Medium and High, not a phone) under Settings > Resolution Auto or Sharp (engine/resolution.js): a desktop card
// is short of time only now and then (another program on the GPU, a big window), so the cheaper looks go first and the
// resolution last, and only after a long slow stretch (PC_HOLD). A supersampled picture (drawn above the screen's
// resolution) gives that up before anything else: it is the one luxury. Balanced keeps LADDER_DESKTOP (pixels first).
export const LADDER_PC = [
  {},                                                    // 0: the tier as designed
  { shadowK: 0.5, shadowEvery: 2 },                      // 1: a smaller shadow map, redrawn every other frame
  { bloomHalf: true },                                   // 2: a lighter glow (3 blur levels instead of 5)
  { msaa: 2 },                                           // 3: 2x multisampling
  { distK: 0.75 },                                       // 4: people, props and buildings are drawn less far
  { scale: 0.85 },                                       // 5: a little softer, only after PC_HOLD windows of slow frames
  { msaa: 0, distK: 0.55, shadowEvery: 3 },              // 6: the nearest part of the valley only
  { scale: 0.72 },                                       // 7: softer still (PC_HOLD again)
];
/** The supersampling step, first on a ladder whose picture starts above the screen's resolution. */
export const SS_STEP = { ss: false };
/** Windows of slow frames (each ~2 s, median over `slow`) before a desktop step below the screen's resolution. */
export const PC_HOLD = 5;
/**
 * A desktop's step-down lines (median frame), per kind of step: the supersampling goes under 50 fps (it is a luxury: a
 * smooth native picture beats a stuttering sharper one), the cheaper looks under 40 fps, the resolution only under 26 fps
 * (and only after PC_HOLD windows of it).
 */
export const PC_SLOW = { ss: 1 / 50, look: 1 / 40, res: 1 / 26 };

/**
 * The ladder for a tier, the player's resolution choice and the device: { ladder, opts } (opts for new Governor()).
 *   Low (phones, software renderers): the people and props first, a little softer last (LADDER).
 *   Medium/High on a phone, or Balanced: the pixels first (LADDER_DESKTOP), as before.
 *   Medium/High on a desktop, Auto: LADDER_PC (after SS_STEP when supersampled), each kind of step at its own line
 *     (PC_SLOW); quick to climb back (calm 2), and a ceiling set by a regretted climb is forgotten after 90 s (a shared
 *     GPU's other job ends).
 *   Sharp: the same without any step that changes the resolution.
 */
export function governorFor(name, { mode = 'auto', mobile = false, ss = false } = {}) {
  const noRes = l => l.filter((s, i) => i === 0 || !('scale' in s || 'ss' in s));
  if (name === 'low') return { ladder: mode === 'sharp' ? noRes(LADDER) : LADDER, opts: { slow: LOW_SLOW } };
  if (mode === 'balanced' || (mobile && mode !== 'sharp')) return { ladder: LADDER_DESKTOP, opts: {} };
  const full = ss ? [LADDER_PC[0], SS_STEP, ...LADDER_PC.slice(1)] : LADDER_PC;
  const ladder = mode === 'sharp' ? noRes(full) : full;
  if (mobile) return { ladder, opts: {} };
  const opts = { calm: 2, forget: 90, slows: ladder.map(s => ('ss' in s ? PC_SLOW.ss : s.scale ? PC_SLOW.res : PC_SLOW.look)) };
  if (mode !== 'sharp') opts.holds = ladder.map(s => (s.scale ? PC_HOLD : 0));
  return { ladder, opts };
}

/** The ladder alone (see governorFor). */
export const ladderFor = (name, ctx) => governorFor(name, ctx).ladder;

export class Governor {
  /**
   * holds[i] > 0: stepping down INTO level i needs that many slow windows running (the median rule only: a hitch is
   * not a reason to soften the picture). slows[i]: the median line for stepping down into level i (else `slow`).
   * forget: seconds after which a ceiling set by a regretted climb is lifted again.
   */
  constructor({ levels = LADDER.length, slow = 1 / 26, spike = 1 / 16, fast = 1 / 48, calm = 5, regret = 30, window = 2, holds = null, slows = null, forget = Infinity } = {}) {
    Object.assign(this, { levels, slow, spike, fast, calm, regret, window, holds, slows, forget });
    this.level = 0;
    this.ceiling = 0;          // the best level it may still climb to
    this.times = []; this.span = 0;
    this.slowRun = 0; this.spikeRun = 0; this.calmRun = 0;
    this.sinceUp = Infinity; this.sinceDown = 0;
  }

  /** Feed one frame time (seconds). Returns the new level when it changed, else null. */
  frame(dt) {
    if (!(dt > 0) || dt > 0.25) return null;
    this.times.push(dt); this.span += dt; this.sinceUp += dt; this.sinceDown += dt;
    if (this.span < this.window || this.times.length < 20) return null;
    const s = this.times.sort((a, b) => a - b), p50 = s[s.length >> 1], p95 = s[Math.floor(s.length * 0.95)];
    this.times = []; this.span = 0;
    if (this.ceiling > 0 && this.sinceDown > this.forget) this.ceiling = 0;     // (that was a while ago: may climb again)
    this.slowRun = p50 > (this.slows?.[this.level + 1] || this.slow) ? this.slowRun + 1 : 0;
    this.spikeRun = p95 > this.spike ? this.spikeRun + 1 : 0;
    this.calmRun = p95 < this.fast ? this.calmRun + 1 : 0;
    const hold = this.holds?.[this.level + 1] || 0;
    const down = hold ? this.slowRun >= hold : this.slowRun >= 2 || this.spikeRun >= 3;
    if (down && this.level < this.levels - 1) {
      if (this.sinceUp < this.regret) this.ceiling = this.level + 1;     // the climb was a mistake: not again (for a while)
      this.level++;
      this.slowRun = this.spikeRun = this.calmRun = 0; this.sinceDown = 0;
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

/** The tier's settings at a governor level: every step up to `level` applied in order. Returns { q, scale, ss }. */
const DISTANCES = ['npcDraw', 'npcAnim', 'npcShadow', 'propDist', 'buildDist', 'midDist', 'riverbedDist'];
export function settingsAt(base, level, ladder = LADDER) {
  const q = { ...base };
  let scale = 1, ss = true;
  for (let i = 1; i <= level && i < ladder.length; i++) {
    const { scale: s, shadowK, distK, ss: sso, bloomHalf, ...rest } = ladder[i];
    if (s) scale = s;
    if (sso === false) ss = false;                                                    // (back to the screen's resolution)
    if (bloomHalf) q.bloomHalf = true;                                                // (a lighter glow: turned on, never off)
    if (shadowK) q.shadow = Math.max(1024, Math.round(base.shadow * shadowK));      // (of what the tier has: a later step replaces an earlier one)
    if (distK) for (const k of DISTANCES) if (base[k]) q[k] = Math.max(Math.round(base[k] * distK), k === 'npcShadow' ? 0 : 30);
    for (const [k, v] of Object.entries(rest)) q[k] = typeof v === 'boolean' ? base[k] && v : k === 'shadowEvery' ? Math.max(v, base[k] ?? 1) : Math.min(v, base[k] ?? v);
  }
  return { q, scale, ss };
}
