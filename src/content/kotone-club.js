// Kotone's performance vocabulary: Avatar Studio Club-mode moves (Moves v2, authored there; baked on her skeleton by
// scripts/kotone-club-bake.mjs into public/models/moves-kotone.glb). Every loop is 8 (or 4) beats at a 120 BPM design;
// feet land on beats or "and"s by construction, so beat-locked playback (game/perform/plan.js) keeps her on the song.
//   tier     calm / mid / big: the section's energy picks from it (verse calm, chorus big, ...)
//   groove   a light standing dance the singer may play under the mic layer (Club SINGER_GROOVE)
//   contact  the hands meet (claps, a heart): never while she holds the mic
// Mic moves: their upper body (neck, head, arms, hands) is laid over the dance on sung lines. Moments: one-shots placed by
// the song's structure (a clap hop into a chorus, a wave in the bridge, a cheer and a bow at the end); *Mic = with the mic.

/** Pack clip name -> Avatar Studio move id (the bake reads this). */
export const CLUB_BAKE = Object.freeze({
  ClubBounceRock: 'V2ClubBounceRock', ClubHipSway: 'V2ClubHipSway', ClubChillSway: 'V2ClubChillSway', ClubSideGroove: 'V2ClubSideGroove',
  ClubKickBall: 'V2ClubKickBallChange', ClubBodyRoll: 'V2ClubBodyRoll', ClubAfroStep: 'V2ClubAfroStep', ClubStepTouch: 'V2ClubStepTouch',
  ClubShimmy: 'V2ClubShoulderShimmy', ClubHairFlick: 'V2ClubHairFlick', ClubJumpPoint: 'V2ClubJumpPoint', ClubFistPump: 'V2ClubFistPump',
  ClubClapStep: 'V2ClubTwoStepClap', ClubCutePop: 'V2ClubCutePop',
  MicSway: 'V2SingSway', MicPunch: 'V2ChorusPunch', MicWave: 'V2WaveCrowdM',
  MomentHop: 'V2ClapHop', MomentWave: 'V2WaveCrowd', MomentCheer: 'V2CheerFists', MomentCheerMic: 'V2CheerFistsM',
  MomentBow: 'V2BowPolite', MomentBowMic: 'V2BowMic',
});

/** The dance loops (beats per loop at 120 BPM). */
export const CLUB_LOOPS = Object.freeze([
  { clip: 'ClubBounceRock', beats: 8, tier: 'calm', groove: true },
  { clip: 'ClubHipSway', beats: 8, tier: 'calm', groove: true },
  { clip: 'ClubChillSway', beats: 8, tier: 'calm', groove: true },
  { clip: 'ClubSideGroove', beats: 8, tier: 'mid', groove: true },
  { clip: 'ClubKickBall', beats: 8, tier: 'mid', groove: true },
  { clip: 'ClubBodyRoll', beats: 8, tier: 'mid', groove: true },
  { clip: 'ClubAfroStep', beats: 8, tier: 'mid', groove: true },
  { clip: 'ClubStepTouch', beats: 8, tier: 'mid' },
  { clip: 'ClubShimmy', beats: 8, tier: 'mid' },
  { clip: 'ClubHairFlick', beats: 8, tier: 'mid' },
  { clip: 'ClubClapStep', beats: 8, tier: 'mid', contact: true },
  { clip: 'ClubCutePop', beats: 8, tier: 'mid', contact: true },
  { clip: 'ClubJumpPoint', beats: 8, tier: 'big' },
  { clip: 'ClubFistPump', beats: 8, tier: 'big' },
].map(Object.freeze));

/** Mic moves: a calm sway on verse lines; a punch or a crowd wave (alternating by line) on chorus lines. */
export const MIC_MOVES = Object.freeze({ verse: 'MicSway', chorus: Object.freeze(['MicPunch', 'MicWave']) });
/** Moments: [without the mic, with the mic] (null: not with the mic in her hand). */
export const MOMENTS = Object.freeze({ hop: ['MomentHop', null], wave: ['MomentWave', 'MicWave'], cheer: ['MomentCheer', 'MomentCheerMic'], bow: ['MomentBow', 'MomentBowMic'] });
/** Every clip a performance needs from the pack. */
export const PERFORM_CLIPS = Object.freeze(Object.keys(CLUB_BAKE));
