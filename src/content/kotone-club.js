// © 2026 Bui Cong Nguyen · solluxlabs.com
// Kotone's performance vocabulary: Avatar Studio Club-mode moves (Moves v2, authored there; baked on her skeleton by
// scripts/kotone-club-bake.mjs into public/models/moves-kotone.glb). Every loop is 8 (or 4) beats at a 120 BPM design;
// feet land on beats or "and"s by construction, so beat-locked playback (game/perform/plan.js) keeps her on the song.
//   tier     calm / mid / big: the section's energy picks from it (verse calm, chorus big, ...)
//   groove   a light standing dance the singer may play under the mic layer (Club SINGER_GROOVE)
//   contact  the hands meet (claps, a heart): never while she holds the mic
// Mic moves: their upper body (neck, head, arms, hands) is laid over the dance on sung lines. Moments: one-shots placed by
// the song's structure (a clap hop into a chorus, a wave in the bridge, a cheer and a bow at the end); *Mic = with the mic.

import { SEQ_STYLES } from './dance-sequences.js';

/** Pack clip name -> Avatar Studio move id (the bake reads this). */
export const CLUB_BAKE = Object.freeze({
  ClubBounceRock: 'V2ClubBounceRock', ClubHipSway: 'V2ClubHipSway', ClubChillSway: 'V2ClubChillSway', ClubSideGroove: 'V2ClubSideGroove',
  ClubKickBall: 'V2ClubKickBallChange', ClubBodyRoll: 'V2ClubBodyRoll', ClubAfroStep: 'V2ClubAfroStep', ClubStepTouch: 'V2ClubStepTouch',
  ClubShimmy: 'V2ClubShoulderShimmy', ClubHairFlick: 'V2ClubHairFlick', ClubJumpPoint: 'V2ClubJumpPoint', ClubFistPump: 'V2ClubFistPump',
  ClubClapStep: 'V2ClubTwoStepClap', ClubCutePop: 'V2ClubCutePop',
  ClubTopRock: 'V2ClubTopRock', ClubBrooklynRock: 'V2ClubBrooklynRock',     // (2026-11-28: the Hip-hop style's standing top-rocks)
  MicSway: 'V2SingSway', MicPunch: 'V2ChorusPunch', MicWave: 'V2WaveCrowdM',
  MicPoint: 'V2PointOutM', MicHeart: 'V2HandOnHeartM',                       // (2026-11-28: a point to the crowd, a hand on the heart)
  MomentHop: 'V2ClapHop', MomentWave: 'V2WaveCrowd', MomentCheer: 'V2CheerFists', MomentCheerMic: 'V2CheerFistsM',
  MomentBow: 'V2BowPolite', MomentBowMic: 'V2BowMic',
  MomentHeart: 'V2HeartHands', MomentJumpMic: 'V2JumpMic',                  // (2026-11-28: Cute's heart hands, a mic jump)
});

/** The dance loops (beats per loop at 120 BPM). styles: the Dance choices (DANCE_STYLES) that use it ('mix' uses all). */
export const CLUB_LOOPS = Object.freeze([
  { clip: 'ClubBounceRock', beats: 8, tier: 'calm', groove: true, styles: ['kpop', 'hiphop'] },
  { clip: 'ClubHipSway', beats: 8, tier: 'calm', groove: true, styles: ['kpop', 'cute'] },
  { clip: 'ClubChillSway', beats: 8, tier: 'calm', groove: true, styles: ['cute', 'hiphop'] },
  { clip: 'ClubSideGroove', beats: 8, tier: 'mid', groove: true, styles: ['hiphop'] },
  { clip: 'ClubKickBall', beats: 8, tier: 'mid', groove: true, styles: ['kpop', 'hiphop'] },
  { clip: 'ClubBodyRoll', beats: 8, tier: 'mid', groove: true, styles: ['hiphop'] },
  { clip: 'ClubAfroStep', beats: 8, tier: 'mid', groove: true, styles: ['hiphop'] },
  { clip: 'ClubStepTouch', beats: 8, tier: 'mid', styles: ['kpop', 'cute'] },
  { clip: 'ClubShimmy', beats: 8, tier: 'mid', styles: ['kpop', 'cute'] },
  { clip: 'ClubHairFlick', beats: 8, tier: 'mid', styles: ['kpop', 'cute'] },
  { clip: 'ClubClapStep', beats: 8, tier: 'mid', contact: true, styles: ['kpop', 'cute'] },
  { clip: 'ClubCutePop', beats: 8, tier: 'mid', contact: true, styles: ['cute'] },
  { clip: 'ClubTopRock', beats: 8, tier: 'mid', styles: ['hiphop'] },
  { clip: 'ClubJumpPoint', beats: 8, tier: 'big', styles: ['kpop', 'cute'] },
  { clip: 'ClubFistPump', beats: 8, tier: 'big', styles: ['kpop', 'hiphop'] },
  { clip: 'ClubBrooklynRock', beats: 8, tier: 'big', styles: ['hiphop'] },
].map(d => Object.freeze({ ...d, styles: Object.freeze(d.styles) })));

/**
 * The Dance choice in Sing & Play (one flat row; the group dances the same): which loops, mic moves and moments the plan
 * draws from. 'mix' is the whole vocabulary (the performance before the choice existed). After Avatar Studio Club mode's
 * dance styles (dance-sets.js: pop / hiphop / street) and its Sing "Movement" sets, for a singer with a hand mic:
 *   kpop    sharp and bright: kick-ball-change, step-touch, shimmy, hair flick, jump point, fist pump; a point to the crowd
 *           on chorus lines, a mic jump into the chorus
 *   cute    soft and sweet: hip sway, cute pop, step-touch, hair flick, two-step clap; a hand on the heart on her lines,
 *           heart hands into the chorus
 *   hiphop  low and grounded: bounce rock, side groove, body roll, afro step, top rock, Brooklyn rock, fist pump; punches
 *           and points on chorus lines, a mic jump into the chorus
 * and the sequence styles (content/dance-sequences.js SEQ_STYLES: breaking, capoeira, classics, latin, soul),
 * which play a round of steps (game/perform/plan.js sequenceBlocks) and borrow a style above for the mic and the moments.
 */
export const DANCE_STYLES = Object.freeze(['mix', 'kpop', 'cute', 'hiphop', ...SEQ_STYLES]);
export const DANCE_STYLE = 'mix';
/** Mic moves per style: verse lines and chorus lines, each alternating by line when there are more. */
export const MIC_SETS = Object.freeze({
  mix: Object.freeze({ verse: Object.freeze(['MicSway']), chorus: Object.freeze(['MicPunch', 'MicWave']) }),
  kpop: Object.freeze({ verse: Object.freeze(['MicSway']), chorus: Object.freeze(['MicPunch', 'MicPoint', 'MicWave']) }),
  cute: Object.freeze({ verse: Object.freeze(['MicSway', 'MicHeart']), chorus: Object.freeze(['MicWave', 'MicHeart']) }),
  hiphop: Object.freeze({ verse: Object.freeze(['MicSway']), chorus: Object.freeze(['MicPunch', 'MicPoint']) }),
});
export const micSetFor = style => MIC_SETS[style] || MIC_SETS.mix;
/** Mic moves ('mix'): a calm sway on verse lines; a punch or a crowd wave (alternating by line) on chorus lines. */
export const MIC_MOVES = Object.freeze({ verse: 'MicSway', chorus: MIC_SETS.mix.chorus });
/** Every mic move any style uses (the mic layer reads them all). */
export const MIC_CLIPS = Object.freeze([...new Set(Object.values(MIC_SETS).flatMap(s => [...s.verse, ...s.chorus]))]);
/** Moments: [without the mic, with the mic] (null: not with the mic in her hand). */
export const MOMENTS = Object.freeze({ hop: ['MomentHop', null], wave: ['MomentWave', 'MicWave'], cheer: ['MomentCheer', 'MomentCheerMic'], bow: ['MomentBow', 'MomentBowMic'] });
/** A style's own moments over MOMENTS (the hop into a chorus: Cute's heart hands, a mic jump for K-pop and Hip-hop). */
export const STYLE_MOMENTS = Object.freeze({
  kpop: Object.freeze({ hop: Object.freeze(['MomentHop', 'MomentJumpMic']) }),
  cute: Object.freeze({ hop: Object.freeze(['MomentHeart', null]) }),
  hiphop: Object.freeze({ hop: Object.freeze(['MomentHop', 'MomentJumpMic']) }),
});
export const momentsFor = style => ({ ...MOMENTS, ...(STYLE_MOMENTS[style] || {}) });
/** Hand-contact moments (never for a follower whose hands would pass through each other: planBacking noContact). */
export const CONTACT_MOMENTS = Object.freeze(['MomentHop', 'MomentHeart']);
/** Every clip a performance needs from the pack. */
export const PERFORM_CLIPS = Object.freeze(Object.keys(CLUB_BAKE));
