// A whole performance planned from the song (pure, deterministic: seeded by the song id, like Avatar Studio's
// generateAutoChain). The ideas are Avatar Studio Club mode's (docs/club/PLAN.md "Club singing", "Dance styles",
// "Beat sync", "Auto move chains", "Celebration moments"); the rules are re-stated here for one solo singer:
//
//   sets      a dance per block, blocks change on bar lines: at every section and every 8 bars (4 on slow songs, a bar of
//             2.8 s or more); the section's tier (verse calm, pre-chorus mid, chorus big ...) by the song's kind, the final
//             chorus a step up, a loud verse a step up; never the same dance twice in a row
//   singing   sung sections dance a light standing groove (the Club's SINGER_GROOVE); the mic moves' upper body lies over
//             it on sung lines (mic-layer.js leadTarget): Mic sway on verse lines, Mic punch / Mic wave on chorus lines
//   the mic   in her hand over each vocal span (lines closer than 2 bars are one span), from a bar before to a bar after;
//             no hand-contact dance (claps, the heart) while she holds it
//   moments   a clap hop on the last bar before a chorus (only with free hands), a wave to the crowd over a bridge's first
//             2 bars, a cheer then a bow over the song's last bars; never inside a sung line; with the mic: its variant
//   tempo     every loop plays at the song's beat (beatRate: 1/2, 1 or 2 loop beats a song beat), clip time from the beat
//
// planPerformance(song, clock, lyrics) -> { seed, rate, lines, spans, blocks, moments, kind, summary }
import { CLUB_LOOPS, MOMENTS } from '../../content/kotone-club.js';
import { beatRate, normalizeKind } from './beat-clock.js';
import { vocalLines, SINGING } from './mic-layer.js';

export const PLAN = Object.freeze({ blockBars: 8, slowBlockBars: 4, slowBar: 2.8, spanGapBars: 2, fadeBeats: 1 });
const TIERS = ['calm', 'mid', 'big'];
const TIER_OF = Object.freeze({
  lively: { intro: 'mid', verse: 'calm', prechorus: 'mid', chorus: 'big', drop: 'big', bridge: 'calm', break: 'mid', outro: 'calm' },
  party: { intro: 'mid', verse: 'mid', prechorus: 'mid', chorus: 'big', drop: 'big', bridge: 'mid', break: 'mid', outro: 'calm' },
  tender: { intro: 'mid', verse: 'calm', prechorus: 'calm', chorus: 'mid', drop: 'mid', bridge: 'calm', break: 'calm', outro: 'calm' },
});

export const hash = (...v) => { let h = 2166136261; for (const x of v) for (const ch of String(x)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return h >>> 0; };

/** The song's kind (Studio move-chains.js classifySong, three kinds here). */
export function songKind(song = {}) {
  const mood = String(song.mood || '').toLowerCase(), bpm = Number(song.bpm) || 0;
  if (song.clubFx === 'calm' || /tender|lullaby|calm|slow|ballad/.test(mood) || (bpm && bpm < 86 && !/uplifting|upbeat|bright|dance|party/.test(mood))) return 'tender';
  if (bpm >= 112 || /dance|party|edm|club/.test(mood)) return 'party';
  return 'lively';
}
const up = (tier, cap = 'big') => TIERS[Math.min(TIERS.indexOf(cap), TIERS.indexOf(tier) + 1)];

/** Dances for a block: its tier (nearest tier when empty), groove-only when sung, no hand contact with the mic. */
export function dancePool(tier, { sung = false, mic = false, chorus = false } = {}) {
  const ok = d => (!mic || !d.contact) && (!sung || chorus || d.groove);
  for (const t of { calm: ['calm', 'mid', 'big'], mid: ['mid', 'calm', 'big'], big: ['big', 'mid', 'calm'] }[tier]) {
    const p = CLUB_LOOPS.filter(d => d.tier === t && ok(d)); if (p.length) return p;
  }
  return CLUB_LOOPS.filter(ok);
}

export function planPerformance(song = {}, clock, lyrics = null) {
  const seed = hash(song.id || song.title || 'song'), kind = songKind(song), table = TIER_OF[kind];
  const lines = vocalLines(lyrics), meter = clock.meter, barSec = clock.barLength;
  const blockBars = barSec >= PLAN.slowBar ? PLAN.slowBlockBars : PLAN.blockBars;
  const rate = beatRate(clock.info.bpm, 120, { calm: clock.calm });
  const end = clock.duration || clock.sections.at(-1).e, lastBar = Math.max(1, Math.ceil(clock.barAt(end) - 1e-6));
  const barOf = t => Math.round(clock.barAt(t)), timeOf = b => clock.barTime(b);
  // vocal spans (the mic in her hand): lines closer than spanGapBars bars are one span; a bar of lead-in and tail
  const spans = [];
  if (lines) for (let i = 0; i < lines.count; i++) {
    const a = Math.floor(clock.barAt(lines.t[i])), b = Math.ceil(clock.barAt(lines.e[i]));
    const s = spans.at(-1);
    if (s && a - s.b1 < PLAN.spanGapBars + 1) s.b1 = Math.max(s.b1, b + 1);
    else spans.push({ b0: Math.max(0, a - 1), b1: b + 1 });
  }
  spans.forEach(s => { s.t0 = timeOf(s.b0); s.t1 = timeOf(s.b1); });
  const micAtBar = b => spans.some(s => b >= s.b0 && b < s.b1);
  const sungIn = (t0, t1) => Boolean(lines) && Array.from(lines.t).some((t, i) => t < t1 + SINGING.post && lines.e[i] > t0 - SINGING.pre);
  // sections on the bar grid (whole bars, none under one bar)
  const secs = [];
  for (const s of clock.sections) {
    const b0 = Math.max(0, barOf(s.t)), b1 = Math.min(lastBar, barOf(s.e));
    if (b1 <= b0) continue;
    const prev = secs.at(-1);
    if (prev && prev.b1 < b0) prev.b1 = b0;
    secs.push({ b0, b1, kind: normalizeKind(s.kind), label: s.label || s.kind, index: s.index, t0: s.t, t1: s.e });
  }
  if (secs.length) secs.at(-1).b1 = lastBar;
  const lastChorus = secs.map(s => s.kind).lastIndexOf('chorus'), choruses = secs.filter(s => s.kind === 'chorus').length;
  const blocks = [], moments = [];
  let prev = null;
  secs.forEach((s, si) => {
    const final = si === lastChorus && choruses > 1;
    let tier = table[s.kind] || 'mid';
    if (final) tier = up(tier, kind === 'tender' ? 'mid' : 'big');
    const loud = s.kind === 'verse' && clock.energyAt((s.t0 + s.t1) / 2) >= .9;
    if (loud) tier = up(tier, 'mid');
    const sung = sungIn(timeOf(s.b0), timeOf(s.b1)), chorus = s.kind === 'chorus' || s.kind === 'drop';
    for (let b = s.b0; b < s.b1; b += blockBars) {
      const b1 = Math.min(s.b1, b + blockBars), mic = Array.from({ length: b1 - b }, (_, k) => micAtBar(b + k)).some(Boolean);
      // a short tail (under 2 bars) joins the block before it
      if (b1 - b < 2 && blocks.length && blocks.at(-1).section === s.index) { blocks.at(-1).b1 = b1; continue; }
      let pool = dancePool(tier, { sung, mic, chorus }); if (pool.length > 1) pool = pool.filter(d => d.clip !== prev);
      const d = pool[hash(seed, b, tier) % pool.length];
      blocks.push({ b0: b, b1, clip: d.clip, tier, section: s.index, kind: s.kind, sung, mic, final });
      prev = d.clip;
    }
    // moments (Club clubMoment, for one singer)
    const bars = s.b1 - s.b0, next = secs[si + 1]?.kind || '', last = si === secs.length - 1;
    const add = (id, b0, n) => {
      const t0 = timeOf(b0), t1 = timeOf(b0 + n), withMic = micAtBar(b0) || micAtBar(b0 + n - 1), [free, mc] = MOMENTS[id], clip = withMic ? mc : free;
      if (!clip || sungIn(t0, t1)) return false;
      moments.push({ id, b0, b1: b0 + n, t0, t1, clip, mic: withMic }); return true;
    };
    if (last && bars >= 4) { if (bars >= 6) add('cheer', s.b1 - 4, 2); add('bow', s.b1 - 2, 2); }
    else if ((s.kind === 'bridge' || s.kind === 'break') && bars >= 4) add('wave', s.b0, 2);
    else if ((next === 'chorus' || next === 'drop') && s.kind !== next && bars >= 4) add('hop', s.b1 - 1, 1);
  });
  // the song's end without a final section of 4+ bars: still a bow after the last line
  if (!moments.some(m => m.id === 'bow') && lastBar >= 2) { const b0 = lastBar - 2, t0 = timeOf(b0); if (!sungIn(t0, timeOf(lastBar))) moments.push({ id: 'bow', b0, b1: lastBar, t0, t1: timeOf(lastBar), clip: micAtBar(b0) ? MOMENTS.bow[1] : MOMENTS.bow[0], mic: micAtBar(b0) }); }
  blocks.forEach(b => { b.t0 = timeOf(b.b0); b.t1 = timeOf(b.b1); });
  const summary = blocks.map(b => `${b.t0.toFixed(1)}s ${b.kind}${b.final ? '*' : ''} ${b.clip}${b.mic ? ' +mic' : ''}`)
    .concat(moments.map(m => `${m.t0.toFixed(1)}s moment ${m.clip}`)).sort((a, b) => parseFloat(a) - parseFloat(b));
  return { seed, kind, rate, meter, blockBars, lastBar, end, lines, spans, blocks, moments, summary };
}

/** The block and moment at bar position `bar` (continuous). */
export function blockAt(plan, bar) {
  const B = plan.blocks; let lo = 0, hi = B.length - 1, i = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (B[m].b0 <= bar) { i = m; lo = m + 1; } else hi = m - 1; }
  return i;
}
export const momentAt = (plan, bar) => plan.moments.find(m => bar >= m.b0 && bar < m.b1) || null;
/** 0..1 the mic is in her hand at song time t (eased over a quarter bar at each end of a span). */
export function micShown(plan, t, ease = .25) {
  for (const s of plan.spans) if (t > s.t0 - ease && t < s.t1 + ease) return Math.min(1, (t - s.t0 + ease) / ease, (s.t1 + ease - t) / ease);
  return 0;
}
