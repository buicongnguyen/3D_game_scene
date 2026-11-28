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
//   avoid     clips this singer never dances (the Night Star's long dress: no kicks, jumps or wide steps; content/troupe.js
//             GUESTS avoid): left out of every pool and moment (an empty list changes nothing: the old plans stay)
//   sequence  a sequence style (content/dance-sequences.js: Breaking, Capoeira, Party classics, Latin party,
//             Northern soul; Avatar Studio Club mode's "Dance sequences"): each section plays the style's round step by step
//             (sequenceStep: laid back from the section's end) instead of a dance per block; a step's takes play at their
//             own tempo on the song's beat (clipRate: each its own m, never faster than the rate its joints pass); the lead
//             never goes down to the floor or travels (the round's top rock / in-place takes instead), sung lines keep her
//             torso calm and, with the mic, her hands apart; Breaking freezes on each section's last beat
//
// planPerformance(song, clock, lyrics, { style, avoid }) -> { seed, rate, lines, spans, blocks, moments, kind, style, mic, summary }
import { CLUB_LOOPS, CONTACT_MOMENTS, DANCE_STYLES, DANCE_STYLE, MOMENTS, momentsFor, micSetFor } from '../../content/kotone-club.js';
import { STANCE } from '../../content/kotone-club-fit.js';
import { SEQUENCES, SEQ_TAKES, rowStep, rockStep, isFloorClip } from '../../content/dance-sequences.js';
import { SEQ_FIT } from '../../content/dance-seq-fit.js';
import { SEQ_PAIRS } from '../../content/dance-seq-pairs.js';
import { beatRate, normalizeKind } from './beat-clock.js';
import { vocalLines, SINGING } from './mic-layer.js';

export const PLAN = Object.freeze({ blockBars: 8, slowBlockBars: 4, slowBar: 2.8, spanGapBars: 2, fadeBeats: 1, longFadeBeats: 2,
  sameStance: .06,      // m: two loops whose feet start within this of each other cross-fade in one beat, others in two
  singTurn: 10,         // deg: no loop turning the hips or chest more than this under the mic (the mic moves turn the head)
  singLift: .1,         // m: no jumping loop under the mic (jumps are for the instrumental bars)
  floorFadeBeats: 2,    // beats: into and out of floor work (Club CLUB_SET.floorFadeBeats; game/perform/floor-blend.js keeps the body on the floor)
  contactGap: .12,      // m: a sequence take whose wrists come this close is a hand-contact dance (never with the mic, never for a follower)
  freezeMin: 4,         // bars: a section this long freezes on its last beat in a freezing sequence (Club freezeAt)
  freezeRamp: .5 });    // beats: floor work eases into its freeze (Club scheduleFreeze), a standing step stops on the beat
/** A clip's start stance (feet, turns, lift): the Club bake's (kotone-club-fit.js) or a sequence take's (dance-seq-fit.js). */
const stanceOf = clip => STANCE[clip] || SEQ_FIT[clip]?.stance || null;
/** How far apart two moves' start stances are (m, both feet). Unknown: far. */
export function stanceGap(a, b) {
  const A = stanceOf(a)?.feet, B = stanceOf(b)?.feet; if (!A || !B) return 1;
  return Math.hypot(A[0][0] - B[0][0], A[0][1] - B[0][1]) + Math.hypot(A[1][0] - B[1][0], A[1][1] - B[1][1]);
}
const calmTorso = d => { const s = stanceOf(d.clip); return !s || (s.hipYaw <= PLAN.singTurn && s.chestYaw <= PLAN.singTurn && s.lift <= PLAN.singLift); };
/** Under a sung line: a calm torso (singTurn / singLift), a sequence take as a Club loop: the mic move's arm is laid over
 *  the dance's chest, and a take turning it 20-35 deg put her forearm into her body (YMCA, Silly 2, House: tried 2026-11-28),
 *  so under her lines she mostly grooves with the round's Club fill-ins or her style's loops (the Club's singer groove). */
const singable = clip => calmTorso({ clip });
/** A sequence take whose hands meet (claps, crossed wrists): measured by the bake (stance.handGap). */
const contactTake = clip => (SEQ_FIT[clip]?.stance?.handGap ?? 1) < PLAN.contactGap;

/**
 * A clip's own timing: a sequence take's tempo and loop (the Club prep measured them: bpm, beat seconds, the phase of its
 * beat grid in the loop, loop seconds, its step grid, the fastest rate its joints pass per body), else null (the Club
 * loops: 8 or 4 beats at the 120-BPM design, the plan's own rate).
 */
export const clipTiming = clip => SEQ_FIT[clip] || null;
/** Is this clip in that body's packs? rig 'kotone' (the front row's source) or 'nam1' (the back row's). The Club loops are
 *  in both main packs; a sequence take only where the bake kept it (dance-seq-fit.js rigs). */
export const hasClip = (clip, rig = 'kotone') => (SEQ_TAKES[clip] ? Boolean(SEQ_FIT[clip]?.rigs?.includes(rig)) : CLUB_LOOPS.some(d => d.clip === clip));
/**
 * The beat-sync rate of a sequence take on this song (beatRate on its own tempo; an eighth-grid dance never doubles, as the
 * Club's danceRate): faster than the rate its joints pass on this body (maxRate), it plays in half time. null: a Club loop.
 */
export function clipRate(clip, bpm, { calm = false, rig = 'kotone' } = {}) {
  const f = SEQ_FIT[clip]; if (!f) return null;
  let r = beatRate(bpm, f.bpm, { calm: calm || f.grid === 'eighth' });
  const max = f.maxRate?.[rig] ?? 1.2;
  if (r.rate > max + 1e-9) r = { m: r.m / 2, rate: r.rate / 2, ok: false };
  return r;
}
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
export function dancePool(tier, { sung = false, mic = false, chorus = false, style = DANCE_STYLE, avoid = null } = {}) {
  const ok = d => (!mic || !d.contact) && (!sung || chorus || d.groove) && (!sung || calmTorso(d)) && !avoid?.includes(d.clip);
  for (const set of style === 'mix' ? [CLUB_LOOPS] : [styleLoops(style), CLUB_LOOPS]) {
    for (const t of { calm: ['calm', 'mid', 'big'], mid: ['mid', 'calm', 'big'], big: ['big', 'mid', 'calm'] }[tier]) {
      const p = set.filter(d => d.tier === t && ok(d)); if (p.length) return p;
    }
  }
  const any = CLUB_LOOPS.filter(ok);
  return any.length ? any : CLUB_LOOPS.filter(d => !avoid?.includes(d.clip));
}

export function planPerformance(song = {}, clock, lyrics = null, { style = DANCE_STYLE, avoid = null, bodies = null } = {}) {
  if (!DANCE_STYLES.includes(style)) style = DANCE_STYLE;
  const sq = SEQUENCES[style] || null, like = sq?.like || style;
  // (the seed is the song's alone for 'mix', so a performance without a choice is the one it always was)
  const seed = style === 'mix' ? hash(song.id || song.title || 'song') : hash(song.id || song.title || 'song', style), kind = songKind(song), table = TIER_OF[kind];
  const MOM = momentsFor(like);
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
  const bpm = clock.info.bpm, calm = !!clock.calm;
  secs.forEach((s, si) => {
    const final = si === lastChorus && choruses > 1;
    let tier = table[s.kind] || 'mid';
    if (final) tier = up(tier, kind === 'tender' ? 'mid' : 'big');
    const loud = s.kind === 'verse' && clock.energyAt((s.t0 + s.t1) / 2) >= .9;
    if (loud) tier = up(tier, 'mid');
    const sung = sungIn(timeOf(s.b0), timeOf(s.b1)), chorus = s.kind === 'chorus' || s.kind === 'drop';
    if (sq) {   // a sequence: the round's steps (the lead: no floor work, a calm torso and free hands under the mic)
      const sungAt = (b0, b1) => sung && Boolean(lines) && Array.from(lines.t).some((t, i) => t < timeOf(b1) - barSec / 2 && lines.e[i] > timeOf(b0));
      const micAt = (b0, b1) => Array.from({ length: b1 - b0 }, (_, k) => micAtBar(b0 + k)).some(Boolean);
      for (const blk of sequenceBlocks(sq, s, { rig: 'kotone', lead: true, floor: false, ahead: 0, avoid, bpm, calm, tier, final, like, sungAt, micAt, chorus, prev, prevBlock: blocks.at(-1) || null, seed, bodies })) { blocks.push(blk); prev = blk.clip; }
    } else for (let b = s.b0; b < s.b1; b += blockBars) {
      const b1 = Math.min(s.b1, b + blockBars), mic = Array.from({ length: b1 - b }, (_, k) => micAtBar(b + k)).some(Boolean);
      // sung: a line sung inside this block (not only its lead-in into the next part)
      const bsung = sung && Boolean(lines) && Array.from(lines.t).some((t, i) => t < timeOf(b1) - barSec / 2 && lines.e[i] > timeOf(b));
      // a short tail (under 2 bars) joins the block before it
      if (b1 - b < 2 && blocks.length && blocks.at(-1).section === s.index) { blocks.at(-1).b1 = b1; continue; }
      let pool = dancePool(tier, { sung: bsung, mic, chorus, style, avoid }); if (pool.length > 1) pool = pool.filter(d => d.clip !== prev);
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
      const t0 = timeOf(b0), t1 = timeOf(b0 + n), withMic = micAtBar(b0) || micAtBar(b0 + n - 1), [free, mc] = MOM[id];
      let clip = withMic ? mc : free;
      if (clip && avoid?.includes(clip)) clip = (withMic ? MOMENTS[id]?.[1] : MOMENTS[id]?.[0]) || null;   // (her style's own moment avoided: the plain one)
      if (!clip || avoid?.includes(clip) || sungIn(t0, t1)) return false;
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
  return { seed, kind, style, avoid: avoid || null, mic: micSetFor(like), rate, meter, blockBars, lastBar, end, lines, spans, blocks, moments, summary,
    sections: secs.map(s => ({ b0: s.b0, b1: s.b1, kind: s.kind, index: s.index })), bpm, calm, barTimes: Array.from({ length: lastBar + 1 }, (_, b) => timeOf(b)), ...(sq ? { sequence: true } : {}) };
}

/**
 * A section's blocks in a sequence (pure): the round's step at each bar (rowStep: `ahead` bars on, laid back from the
 * section's end), one block per step. A step's take: the first of its ids (rotated by the round) that this body has, that
 * this dancer may do (the lead: no floor work; floor work only where `floor` allows; a take the bake found breaking a joint
 * rule on one of `bodies` (the model files that dance this routine as copies of the rig) is left out; with the mic or for a follower no
 * hand contact; under a sung line a calm torso) and that keeps to the song's beat at 0.5x or more; a floor step a
 * dancer may not do plays the round's top-rock step's takes; a body with none of a step's takes plays another standing
 * take of the round, else a Club loop of the `like` style's pool; never the take of the step before when the list has
 * another, nor one whose fade from it breaks a joint rule on these bodies (scripts/seq-pairs.mjs: dance-seq-pairs.js). Blocks: the plan's block fields plus m / rate (the take's own beat rate), seq: { step, part, round }, floor,
 * freeze (held on the section's last beat), and for a take that goes on from the block before (the only one left):
 * from (the bar its loop counts from), after (the freeze of the block before: it runs out of it the same way) and lost
 * (beats earlier freezes held), so its clip time runs on without a jump.
 */
export function sequenceBlocks(sq, s, { rig = 'kotone', lead = false, floor = false, ahead = 0, avoid = null, bpm = 120, calm = false, tier = 'mid', final = false,
  like = 'mix', sungAt = () => false, micAt = () => false, chorus = false, noContact = false, prev = null, prevBlock = null, seed = 1, rotate = 0, bodies = null } = {}) {
  const fits = id => !bodies || !SEQ_FIT[id]?.fails?.[rig]?.some(f => bodies.includes(f));   // (a body that copies this rig breaks a joint rule in it)
  const pairBad = (a, id) => { const f = a && SEQ_PAIRS[rig]?.[`${a}>${id}`]; return Boolean(f && (f.includes('self') || bodies?.some(x => f.includes(x)))); };
  const n = s.b1 - s.b0, out = [], rock = rockStep(sq);
  const standing = [...new Set(sq.steps.filter(x => !x.floor).flatMap(x => x.ids))];
  const rate = id => clipRate(id, bpm, { calm, rig }) || beatRate(bpm, 120, { calm });
  for (let barIn = 0; barIn < n;) {
    const st = rowStep(sq, barIn, ahead, n); if (!st) break;
    const b0 = s.b0 + barIn, b1 = s.b0 + Math.min(n, Math.max(barIn + 1, st.endBar));
    const sung = sungAt(b0, b1), mic = micAt(b0, b1), hands = mic || noContact;
    const ok = id => hasClip(id, rig) && fits(id) && !avoid?.includes(id) && (!isFloorClip(id) || (!lead && floor)) && (!hands || (!contactTake(id) && !CLUB_LOOPS.find(d => d.clip === id)?.contact))
      && (!sung || singable(id));
    const down = Boolean(st.step.floor && (lead || !floor));   // a floor step this dancer plays standing
    let list = (down ? rock.ids : st.step.ids).filter(ok);
    if (!list.length) list = standing.filter(ok);
    // a step's own takes stay in their order at their beat-locked rate, half time included (>= 0.5: the Club plays a step's
    // dances at their slower rate before the sequence gives up)
    const onBeat = list.filter(id => rate(id).rate >= .5 - 1e-9); if (onBeat.length) list = onBeat;
    // (the round and the section turn the list, so sections differ; a floor step played standing takes the next one)
    // the take the round and the section turn to, else the next one whose fade from the take before is clean on these
    // bodies (dance-seq-pairs.js), else the take before going on (no fade at all), else another standing take of the round,
    // else the take before going on even outside this step's list
    const at = st.round + (s.index | 0) + (down ? st.index : 0) + rotate, order = list.map((_, j) => list[(at + j) % list.length]);
    let clip = order.find(id => id !== prev && !pairBad(prev, id)) || (prev && order.includes(prev) ? prev : null)
      || standing.filter(ok).find(id => id !== prev && !pairBad(prev, id)) || (prev && list.length && ok(prev) ? prev : null) || order[0] || null;
    if (!clip) {   // nothing of the round fits this dancer: a Club loop of the style it borrows from
      let pool = dancePool(tier, { sung, mic, chorus, style: like, avoid }).filter(d => !(noContact && d.contact));
      if (pool.length > 1) pool = pool.filter(d => d.clip !== prev);
      clip = pool.length ? pool[hash(seed, b0, tier, rig) % pool.length].clip : prev || CLUB_LOOPS[0].clip;
    }
    const r = rate(clip), fl = isFloorClip(clip), pf = Boolean(prev && isFloorClip(prev));
    // (one beat between two takes, as the Club; two into or out of the floor. A long blend of two Mixamo takes is where
    // their poses mix worst: knees out of plane, fingers spread; foot-hold.js lock keeps the planted feet still meanwhile)
    const fade = prev && fl !== pf ? PLAN.floorFadeBeats : PLAN.fadeBeats;
    const freeze = Boolean(sq.freeze && b1 === s.b1 && n >= PLAN.freezeMin);
    // the same take as the block before: its loop goes on (no restart, no fade), past that block's freeze by what it held
    const pb = prevBlock?.clip === clip ? prevBlock : null;
    const chain = pb ? { from: pb.from ?? pb.b0, lost: (pb.lost || 0) + (pb.after ? 1 + pb.after.ramp : 0), ...(pb.freeze ? { after: { bar: pb.b1, ramp: pb.floor ? PLAN.freezeRamp : 0 } } : {}) } : {};
    const blk = { b0, b1, clip, tier, section: s.index, kind: s.kind, sung, mic, final, fade: pb ? PLAN.fadeBeats : fade, m: pb ? pb.m : r.m, rate: pb ? pb.rate : +r.rate.toFixed(3),
      seq: { step: st.index, part: st.step.part, round: st.round }, ...(fl ? { floor: true } : {}), ...(freeze ? { freeze: true } : {}), ...chain };
    out.push(blk);
    prev = clip; prevBlock = blk; barIn = b1 - s.b0;
  }
  return out;
}

/**
 * A second routine for the same song (the back row of a group, game/perform/troupe.js): the lead plan's blocks (the same
 * bar lines, tiers and sections, so both rows change together), a different dance in every block where the pool allows
 * (never the lead's dance of that block, never the same twice in a row, stances matched like the lead's), free of the
 * singer's limits (the back row does not hold the mic: bigger dances under the sung verses, one tier up from calm).
 * noContact: no hand-contact dance or moment (claps, the heart; a follower with narrower shoulders would put its hands
 * through each other). Moments: the lead's, without the mic (a clap hop only when contact is allowed).
 */
export function planBacking(lead, { salt = 'back', noContact = false, floor = true, rig = 'nam1', bodies = null } = {}) {
  const seed = hash(lead.seed, salt), blocks = [];
  let prev = null;
  const sq = SEQUENCES[lead.style];
  if (sq && lead.sections) return backingSequence(lead, sq, { seed, noContact, floor, rig, bodies });
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

/**
 * The back row's round in a sequence style (pure): its own rig's takes, `backShift` bars on from the front (Breaking and
 * Northern soul: in step, the back row the cypher that goes down to the floor), the next take of each list when the style
 * staggers, floor work only where `floor` allows (flat ground: game/singplay/singplay.js) and, as the Club's cypher moves
 * on each section, only in every other section (the 2nd, 4th, ...: a song of 4-bar sections would otherwise keep the back
 * row on the floor from start to end), no mic, no hand contact for the followers. Its tiers are the lead's per section.
 * Moments: the lead's without the mic, none over floor work.
 */
function backingSequence(lead, sq, { seed, noContact, floor, rig, bodies }) {
  const like = sq.like || 'mix', blocks = [];
  let prev = null;
  for (const s of lead.sections) {
    const lb = lead.blocks.find(b => b.section === s.index), tier = lb?.tier === 'calm' && lb?.sung ? 'mid' : lb?.tier || 'mid';
    for (const blk of sequenceBlocks(sq, s, { rig, lead: false, floor: floor && s.index % 2 === 1, ahead: sq.backShift || 0, bpm: lead.bpm, calm: lead.calm, tier, final: !!lb?.final, like,
      chorus: s.kind === 'chorus' || s.kind === 'drop', noContact, prev, prevBlock: blocks.at(-1) || null, seed, rotate: sq.stagger ? 1 : 0, bodies })) { blk.mic = false; blk.sung = false; blocks.push(blk); prev = blk.clip; }
  }
  blocks.forEach(b => { b.t0 = timeAtBar(lead, b.b0); b.t1 = timeAtBar(lead, b.b1); });
  const moments = [];
  for (const m of lead.moments) {
    const clip = momentsFor(like)[m.id]?.[0]; if (!clip || (noContact && CONTACT_MOMENTS.includes(clip))) continue;
    if (blocks.some(b => b.floor && m.b0 < b.b1 && m.b1 > b.b0)) continue;   // (no standing moment over floor work)
    const under = blocks.findLast(x => x.b0 <= m.b0)?.clip;
    moments.push({ ...m, clip, mic: false, fade: under && stanceGap(under, clip) > PLAN.sameStance ? PLAN.longFadeBeats : PLAN.fadeBeats });
  }
  return { ...lead, seed, blocks, moments, spans: [], backing: true,
    summary: blocks.map(b => `${b.t0.toFixed(1)}s ${b.kind} ${b.seq?.part || ''} ${b.clip}${b.floor ? ' floor' : ''}${b.freeze ? ' freeze' : ''}`).concat(moments.map(m => `${m.t0.toFixed(1)}s moment ${m.clip}`)).sort((a, b) => parseFloat(a) - parseFloat(b)) };
}
/** Song time of a whole bar (the lead plan's bar lines). */
const timeAtBar = (P, bar) => P.barTimes[Math.max(0, Math.min(P.barTimes.length - 1, bar))];

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
