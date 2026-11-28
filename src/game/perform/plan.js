// © 2026 Bui Cong Nguyen · solluxlabs.com
// A whole performance planned from the song (pure, deterministic: seeded by the song id, like Avatar Studio's
// generateAutoChain). The ideas are Avatar Studio Club mode's (docs/club/PLAN.md "Club singing", "Dance styles",
// "Beat sync", "Auto move chains", "Celebration moments"); the rules are re-stated here for one solo singer:
//
//   sets      a dance per block, blocks change on bar lines: at every section and every 8 bars (4 on slow songs, a bar of
//             2.8 s or more); the section's tier (verse calm, pre-chorus mid, chorus big ...) by the song's kind, the final
//             chorus a step up, a loud verse a step up; never the same dance twice in a row
//   singing   sung sections dance a light standing groove (the Club's SINGER_GROOVE); the mic moves' upper body lies over
//             it on sung lines (mic-layer.js leadTarget): Mic sway on verse lines, Mic punch / Mic wave on chorus lines
//   the mic   in her hand over each vocal span (lines closer than 2 bars are one span), from a bar before to a bar after
//             (and through a moment danced with it, the closing bow to the end); no hand-contact dance (claps, the
//             heart) while she holds it
//   moments   a clap hop on the last bar before a chorus (only with free hands), a wave to the crowd over a bridge's first
//             2 bars, a cheer then a bow over the song's last bars; never inside a sung line; with the mic: its variant
//   tempo     every loop plays at the song's beat (beatRate: 1/2, 1 or 2 loop beats a song beat), clip time from the beat
//
//   style     the Dance choice (content/kotone-club.js DANCE_STYLES: mix / kpop / cute / hiphop): the loops of that style
//             (the whole set when a tier has none that fits), its mic moves (micSetFor) and its moments (momentsFor)
//
// planPerformance(song, clock, lyrics, { style }) -> { seed, rate, lines, spans, blocks, moments, kind, style, mic, summary }
import { CLUB_LOOPS, CONTACT_MOMENTS, DANCE_STYLES, DANCE_STYLE, momentsFor, micSetFor } from '../../content/kotone-club.js';
import { STANCE } from '../../content/kotone-club-fit.js';
import { beatRate, normalizeKind } from './beat-clock.js';
import { vocalLines, SINGING } from './mic-layer.js';

export const PLAN = Object.freeze({ blockBars: 8, slowBlockBars: 4, slowBar: 2.8, spanGapBars: 2, fadeBeats: 1, longFadeBeats: 2,
  sameStance: .06,      // m: two loops whose feet start within this of each other cross-fade in one beat, others in two
  singTurn: 10,         // deg: no loop turning the hips or chest more than this under the mic (the mic moves turn the head)
  singLift: .1 });      // m: no jumping loop under the mic (jumps are for the instrumental bars)
/** How far apart two moves' start stances are (m, both feet). Unknown: far. */
export function stanceGap(a, b) {
  const A = STANCE[a]?.feet, B = STANCE[b]?.feet; if (!A || !B) return 1;
  return Math.hypot(A[0][0] - B[0][0], A[0][1] - B[0][1]) + Math.hypot(A[1][0] - B[1][0], A[1][1] - B[1][1]);
}
const calmTorso = d => { const s = STANCE[d.clip]; return !s || (s.hipYaw <= PLAN.singTurn && s.chestYaw <= PLAN.singTurn && s.lift <= PLAN.singLift); };
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

/** A Dance choice's loops ('mix' or unknown: all of them). */
export const styleLoops = style => (style && style !== 'mix' && DANCE_STYLES.includes(style) ? CLUB_LOOPS.filter(d => d.styles.includes(style)) : CLUB_LOOPS);
/** Dances for a block: its tier (nearest tier when empty), groove-only when sung, no hand contact with the mic; the style's
 *  own loops first (the whole vocabulary only when the style has none that fits). */
export function dancePool(tier, { sung = false, mic = false, chorus = false, style = DANCE_STYLE } = {}) {
  const ok = d => (!mic || !d.contact) && (!sung || chorus || d.groove) && (!sung || calmTorso(d));
  for (const set of style === 'mix' ? [CLUB_LOOPS] : [styleLoops(style), CLUB_LOOPS]) {
    for (const t of { calm: ['calm', 'mid', 'big'], mid: ['mid', 'calm', 'big'], big: ['big', 'mid', 'calm'] }[tier]) {
      const p = set.filter(d => d.tier === t && ok(d)); if (p.length) return p;
    }
  }
  return CLUB_LOOPS.filter(ok);
}

export function planPerformance(song = {}, clock, lyrics = null, { style = DANCE_STYLE } = {}) {
  if (!DANCE_STYLES.includes(style)) style = DANCE_STYLE;
  // (the seed is the song's alone for 'mix', so a performance without a choice is the one it always was)
  const seed = style === 'mix' ? hash(song.id || song.title || 'song') : hash(song.id || song.title || 'song', style), kind = songKind(song), table = TIER_OF[kind];
  const MOM = momentsFor(style);
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
    else spans.push({ b0: Math.max(0, a - 1), b1: b + 1, first: lines.t[i] });
  }
  // (in hand before its first line's lead-in even when that line starts before the song's first bar line: a pickup)
  spans.forEach(s => { s.t0 = Math.min(timeOf(s.b0), s.first - SINGING.pre); s.t1 = timeOf(s.b1); delete s.first; });
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
      // sung: a line sung inside this block (not only its lead-in into the next part)
      const bsung = sung && Boolean(lines) && Array.from(lines.t).some((t, i) => t < timeOf(b1) - barSec / 2 && lines.e[i] > timeOf(b));
      // a short tail (under 2 bars) joins the block before it
      if (b1 - b < 2 && blocks.length && blocks.at(-1).section === s.index) { blocks.at(-1).b1 = b1; continue; }
      let pool = dancePool(tier, { sung: bsung, mic, chorus, style }); if (pool.length > 1) pool = pool.filter(d => d.clip !== prev);
      // neighbours whose stances match first: every loop starting within sameStance of the last one, else the three nearest
      if (prev && pool.length > 2) { const near = pool.filter(d => stanceGap(prev, d.clip) <= PLAN.sameStance);
        pool = near.length >= 2 ? near : pool.slice().sort((x, y) => stanceGap(prev, x.clip) - stanceGap(prev, y.clip) || (x.clip < y.clip ? -1 : 1)).slice(0, 3); }
      const d = pool[hash(seed, b, tier) % pool.length];
      const fade = prev && stanceGap(prev, d.clip) > PLAN.sameStance ? PLAN.longFadeBeats : PLAN.fadeBeats;
      blocks.push({ b0: b, b1, clip: d.clip, tier, section: s.index, kind: s.kind, sung: bsung, mic, final, fade });
      prev = d.clip;
    }
    // moments (Club clubMoment, for one singer)
    const bars = s.b1 - s.b0, next = secs[si + 1]?.kind || '', last = si === secs.length - 1;
    const add = (id, b0, n) => {
      const t0 = timeOf(b0), t1 = timeOf(b0 + n), withMic = micAtBar(b0) || micAtBar(b0 + n - 1), [free, mc] = MOM[id], clip = withMic ? mc : free;
      if (!clip || sungIn(t0, t1)) return false;
      const under = blocks.findLast(x => x.b0 <= b0)?.clip, fade = under && stanceGap(under, clip) > PLAN.sameStance ? PLAN.longFadeBeats : PLAN.fadeBeats;
      moments.push({ id, b0, b1: b0 + n, t0, t1, clip, mic: withMic, fade }); return true;
    };
    if (last && bars >= 4) { if (bars >= 6) add('cheer', s.b1 - 4, 2); add('bow', s.b1 - 2, 2); }
    else if ((s.kind === 'bridge' || s.kind === 'break') && bars >= 4) add('wave', s.b0, 2);
    else if ((next === 'chorus' || next === 'drop') && s.kind !== next && bars >= 4) add('hop', s.b1 - 1, 1);
  });
  // the song's end without a final section of 4+ bars: still a bow after the last line
  if (!moments.some(m => m.id === 'bow') && lastBar >= 2) { const b0 = lastBar - 2, t0 = timeOf(b0); if (!sungIn(t0, timeOf(lastBar))) moments.push({ id: 'bow', b0, b1: lastBar, t0, t1: timeOf(lastBar), clip: micAtBar(b0) ? MOM.bow[1] : MOM.bow[0], mic: micAtBar(b0), fade: PLAN.longFadeBeats }); }
  // a moment danced with the mic keeps it in her hand to its end (the bow with the mic held to the song's end): it never
  // vanishes mid-move
  for (const m of moments) if (m.mic) { const s = spans.find(x => m.b0 < x.b1 + 1 && m.b1 > x.b0); if (s && m.b1 > s.b1) { s.b1 = m.b1; s.t1 = m.b1 >= lastBar ? end + 2 : timeOf(m.b1); } }
  blocks.forEach(b => { b.t0 = timeOf(b.b0); b.t1 = timeOf(b.b1); });
  const summary = blocks.map(b => `${b.t0.toFixed(1)}s ${b.kind}${b.final ? '*' : ''} ${b.clip}${b.mic ? ' +mic' : ''}${b.sung ? ' sung' : ''} fade ${b.fade || 1}`)
    .concat(moments.map(m => `${m.t0.toFixed(1)}s moment ${m.clip}`)).sort((a, b) => parseFloat(a) - parseFloat(b));
  return { seed, kind, style, mic: micSetFor(style), rate, meter, blockBars, lastBar, end, lines, spans, blocks, moments, summary };
}

/**
 * A second routine for the same song (the back row of a group, game/perform/troupe.js): the lead plan's blocks (the same
 * bar lines, tiers and sections, so both rows change together), a different dance in every block where the pool allows
 * (never the lead's dance of that block, never the same twice in a row, stances matched like the lead's), free of the
 * singer's limits (the back row does not hold the mic: bigger dances under the sung verses, one tier up from calm).
 * noContact: no hand-contact dance or moment (claps, the heart; a follower with narrower shoulders would put its hands
 * through each other). Moments: the lead's, without the mic (a clap hop only when contact is allowed).
 */
export function planBacking(lead, { salt = 'back', noContact = false } = {}) {
  const seed = hash(lead.seed, salt), blocks = [];
  let prev = null;
  for (const b of lead.blocks) {
    const tier = b.sung && b.tier === 'calm' ? 'mid' : b.tier;
    let pool = dancePool(tier, { chorus: b.kind === 'chorus' || b.kind === 'drop', style: lead.style }).filter(d => !noContact || !d.contact);
    if (!pool.length) pool = styleLoops(lead.style).filter(d => !noContact || !d.contact);
    if (!pool.length) pool = CLUB_LOOPS.filter(d => !noContact || !d.contact);
    const others = pool.filter(d => d.clip !== b.clip && d.clip !== prev); if (others.length) pool = others;
    if (prev && pool.length > 2) { const near = pool.filter(d => stanceGap(prev, d.clip) <= PLAN.sameStance);
      pool = near.length >= 2 ? near : pool.slice().sort((x, y) => stanceGap(prev, x.clip) - stanceGap(prev, y.clip) || (x.clip < y.clip ? -1 : 1)).slice(0, 3); }
    const d = pool[hash(seed, b.b0, tier) % pool.length];
    const fade = prev && stanceGap(prev, d.clip) > PLAN.sameStance ? PLAN.longFadeBeats : PLAN.fadeBeats;
    blocks.push({ ...b, clip: d.clip, tier, mic: false, fade });
    prev = d.clip;
  }
  const moments = [];
  for (const m of lead.moments) {
    const clip = momentsFor(lead.style)[m.id]?.[0]; if (!clip || (noContact && CONTACT_MOMENTS.includes(clip))) continue;
    const under = blocks.findLast(x => x.b0 <= m.b0)?.clip;
    moments.push({ ...m, clip, mic: false, fade: under && stanceGap(under, clip) > PLAN.sameStance ? PLAN.longFadeBeats : PLAN.fadeBeats });
  }
  return { ...lead, seed, blocks, moments, spans: [], backing: true,
    summary: blocks.map(b => `${b.t0.toFixed(1)}s ${b.kind} ${b.clip} fade ${b.fade}`).concat(moments.map(m => `${m.t0.toFixed(1)}s moment ${m.clip}`)).sort((a, b) => parseFloat(a) - parseFloat(b)) };
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
