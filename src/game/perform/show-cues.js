// © 2026 Bui Cong Nguyen · solluxlabs.com
// Show effects' cues (pure; tests/show-fx.test.mjs): what the fake show lighting does at song time t, from the song's
// own clock (beat-clock.js) and the performance plan (plan.js), and which effects a device draws (docs/SHOW-EFFECTS.md).
//   washAt      the colour wash of the section (verse blue, pre-chorus violet, chorus pink, bridge and ends gold), eased
//               over a beat across each section line
//   pulseAt     a beat pulse 1 -> 0 over each beat (the downbeat a little stronger)
//   cuePlan     the bursts (every chorus opens with one, a long chorus gets a second half-way, the closing cheer one),
//               the fireworks (the last chorus to the end, night only) and the laser windows (dance-song drops)
//   showItems   which effects a tier, a time of day and a group size draw (Low with 8: the costliest go first)
//   showDraws   their draw calls (one each; the fireworks reuse the valley's own spark pool)
//   showDefault the Sing & Play switch's default per device

/** Linear RGB washes (the stage's LED and lantern tint, the ground glow, beams and sticks). */
export const WASH = Object.freeze({
  verse: Object.freeze([0.18, 0.42, 1.0]),
  prechorus: Object.freeze([0.52, 0.28, 1.0]),
  chorus: Object.freeze([1.0, 0.24, 0.6]),
  drop: Object.freeze([1.0, 0.2, 0.5]),
  bridge: Object.freeze([1.0, 0.66, 0.2]),
  break: Object.freeze([1.0, 0.66, 0.2]),
  intro: Object.freeze([1.0, 0.58, 0.22]),
  outro: Object.freeze([1.0, 0.58, 0.22]),
});
const washOf = kind => WASH[kind] || WASH.verse;

/** The wash at song time t: the section's colour, eased in over `beats` beats from the one before it. out: [r, g, b]. */
export function washAt(clock, t, out = [0, 0, 0], beats = 1) {
  const s = clock.sectionAt(t), i = s.index, prev = i > 0 ? clock.sections[i - 1] : null, a = washOf(s.kind);
  const span = beats * 60 / Math.max(30, clock.bpmAt(t)), k = prev ? Math.min(1, Math.max(0, (t - s.t) / span)) : 1, e = k * k * (3 - 2 * k);
  const b = prev ? washOf(prev.kind) : a;
  for (let j = 0; j < 3; j++) out[j] = b[j] + (a[j] - b[j]) * e;
  return out;
}

/** A pulse on every beat: 1 on the beat, decaying over it (exp), the bar's first beat 1.25. Before the first beat: 0. */
export function pulseAt(clock, t, decay = 5) {
  const b = clock.beatAt(t); if (!(b >= 0)) return 0;
  const ph = b - Math.floor(b), down = Math.floor(b) % clock.meter === 0;
  return Math.exp(-decay * ph) * (down ? 1.25 : 1);
}

/** How strong the lighting plays at t: the section's energy (calm verses dimmer, choruses full), 0.35..1. */
export const levelAt = (clock, t) => 0.35 + 0.65 * Math.min(1, Math.max(0, clock.energyAt(t)));

const LOUD = new Set(['chorus', 'drop']);
/**
 * The show's cues for one performance (pure): { bursts: [t], fireworks: { t0, t1 } | null, lasers: [[t0, t1]], last }.
 *   bursts     every chorus (and drop) opens with one, a chorus of 8+ bars gets a second at its middle bar line, the
 *              closing cheer (or bow) one more
 *   fireworks  from the last chorus's first bar line to the song's end, at night only (opts.night)
 *   lasers     chorus / drop sections of a dance song (plan.kind 'party', or the K-pop / Hip-hop dance style), and the
 *              last chorus of any song; night only
 */
export function cuePlan(plan, clock, { night = false } = {}) {
  const secs = [];
  for (const b of plan.blocks) { const o = secs.at(-1); if (o && o.section === b.section) { o.b1 = b.b1; o.t1 = b.t1; } else secs.push({ section: b.section, kind: b.kind, b0: b.b0, b1: b.b1, t0: b.t0, t1: b.t1 }); }
  const loud = secs.filter(s => LOUD.has(s.kind)), last = loud.at(-1) || null, bursts = [];
  for (const s of loud) {
    bursts.push(s.t0);
    if (s.b1 - s.b0 >= 8) bursts.push(clock.barTime(s.b0 + Math.floor((s.b1 - s.b0) / 2)));
  }
  const close = plan.moments.find(m => m.id === 'cheer') || plan.moments.find(m => m.id === 'bow');
  if (close && !bursts.some(t => Math.abs(t - close.t0) < 1)) bursts.push(close.t0);
  bursts.sort((a, b) => a - b);
  const dance = plan.kind === 'party' || plan.style === 'kpop' || plan.style === 'hiphop';
  const lasers = night ? loud.filter(s => dance || s === last).map(s => [s.t0, s.t1]) : [];
  const fireworks = night && last ? { t0: last.t0, t1: plan.end + 1.5 } : null;
  return { bursts, fireworks, lasers, last: last ? { t0: last.t0, t1: last.t1 } : null };
}

/** Is t inside one of the windows [[t0, t1]]? */
export const inWindows = (wins, t) => wins.some(([a, b]) => t >= a && t < b);

/** The bursts' slots (the particle pool holds SLOTS bursts in the air at once). */
export const SLOTS = 4;
/** The burst for slot k at song time t: the newest burst in `bursts` with index % SLOTS === k that has started, else -1e4. */
export function slotTimes(bursts, t, out = new Array(SLOTS).fill(-1e4)) {
  out.fill(-1e4);
  for (let i = 0; i < bursts.length && bursts[i] <= t; i++) out[i % SLOTS] = bursts[i];
  return out;
}

/** Night for the show (the valley's own `night`, 0..1): beams, lasers, haze, confetti, fireworks and glow sticks. */
export const NIGHT_FROM = 0.5;
export const isShowNight = night => night >= NIGHT_FROM;

/**
 * What a device draws (each item one draw call; fireworks reuse the valley's spark pool, +1 while they fly):
 *   stage      the folding stage set (truss, LED pillars, lanterns): always
 *   glow       the glow cards: the ground wash, the beams' floor spots, the lens glows and the night haze
 *   beams      soft spotlight cones sweeping on the beat (night), lasers in the same draw (dance-song drops)
 *   particles  the chorus bursts: confetti by night; petals, bubbles and balloons by day
 *   sticks     the audience's glow sticks (night; by day they clap on the beat instead: no draw)
 *   fireworks  over the last chorus (night)
 * Low with a group of 8 (the station's Low budget was 87 of 91 draws with the eight): the fill-heavy and least needed go
 * first: beams (and their lasers), the glow cards (haze, spots), the fireworks; the stage, the bursts and the sticks stay.
 */
export function showItems({ on = true, tier = 'high', night = 0, group = 1 } = {}) {
  const n = isShowNight(night), none = { stage: false, glow: false, beams: false, lasers: false, particles: false, sticks: false, fireworks: false };
  if (!on) return none;
  const it = { stage: true, glow: true, beams: n, lasers: n, particles: true, sticks: n, fireworks: n };
  if (tier === 'low' && group >= 8) { it.beams = false; it.lasers = false; it.glow = false; it.fireworks = false; }
  return it;
}
/** Draw calls the items add at most (lasers share the beams' draw). */
export const showDraws = it => ['stage', 'glow', 'beams', 'particles', 'sticks', 'fireworks'].reduce((n, k) => n + (it[k] ? 1 : 0), 0);

/** How many beams, lasers and burst particles a tier draws. */
export const SHOW_COUNTS = Object.freeze({
  low: Object.freeze({ beams: 4, lasers: 8, particles: 192 }),
  other: Object.freeze({ beams: 6, lasers: 12, particles: 480 }),
});
export const countsFor = tier => (tier === 'low' ? SHOW_COUNTS.low : SHOW_COUNTS.other);

/** The Sing & Play switch's key (per device: '1' on, '0' off) and its default (measured: docs/SHOW-EFFECTS.md). */
export const SHOW_KEY = 'starline:singplay:showfx';
export function showDefault({ tier = 'high', strong = null } = {}) {
  void strong;   // (measured: the effects cost under the +1 ms line on Low at 4x CPU, weak phones included: on everywhere)
  void tier;
  return true;
}
