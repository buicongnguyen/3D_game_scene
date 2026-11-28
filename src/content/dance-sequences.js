// © 2026 Bui Cong Nguyen · solluxlabs.com
// Dance sequences (docs/SING-AND-PLAY.md "Dance sequences"): Avatar Studio Club mode's sequence styles brought to Sing &
// Play (its src/club/dance-sequences.js, "Dance sequences (2026-11-25)" and "Move and dance" in its docs/club/PLAN.md). A
// style with a sequence plays its steps in order over bars instead of one dance per block: Breaking's round (ready ->
// top rock -> footwork -> power move, frozen on the section's end), the capoeira ginga round, the
// party classics, a latin party and Northern soul with its floor spin.
//
// The takes are Mixamo dances from the owner's library (Mixamo licence: in-app use, modified, commercial OK per the owner;
// never offered as a download), retargeted onto Kotone and nam-1 (art/blender/seq_takes.py) and cut into beat-measured
// loops on each body by the Club's own prep (scripts/seq-bake.mjs: tempo, loop window, beat warp, foot lock, hand
// clearance, joint repair; the joint rules R1-R11 checked on every clip). Each style's clips are a lazy pack of their own
// (public/models/moves-seq-<style>-kotone.glb, -nam1.glb), fetched only when that style is picked.
//
//   SEQ_TAKES   clip -> { stem (the Mixamo file in the owner's library), tile (a cyclic take repeated before the cut),
//               floor (on the floor: hands, knees or back carry the body), grounded (a wide lunge prepared on the floor
//               path but danced standing), footprint (wide standing steps) }
//   SEQUENCES   style -> { steps: [{ part, bars, ids (preference order; the round rotates among them), floor?, travel? }],
//               bars, stagger?, freeze?, backShift }
//   Club rules kept: rounds are laid back from the section's end (its last bars are the round's last step: Breaking's power
//   move, held by the section-end freeze); a floor step is the cypher's (here the back row's), the others top rock; a travel
//   step plays its in-place takes (the formation's spots are fixed in Sing & Play). Starline's own: the lead singer never
//   goes down to the floor or travels (the mic); floor steps only on flat ground; the back row may run the round shifted.
//
// Mixamo names here are the takes' own (Macarena = Mixamo's "Macarena Dance", not the Studio's legacy MocapMacarena).

/** Every take a sequence uses (clip name in the packs -> its source and how it is prepared). Which body keeps which (the
 *  bake's checks): content/dance-seq-fit.js `rigs`; a take neither keeps is in SEQ_DROPPED, not here. */
export const SEQ_TAKES = Object.freeze({
  // Breaking (Club CLUB_BREAKING + CLUB_SEQUENCE_TAKES): the ready bounce, two uprocks, footwork, head spin
  SeqBrkReady: { stem: 'breakdance-ready-2abd40fa', tile: 2 },
  SeqBrkUprock: { stem: 'breakdance-uprock-var-1-d933c74e', tile: 3, footprint: true },
  SeqBrkUprock2: { stem: 'breakdance-uprock-var-2-6e9918b4', tile: 0, footprint: true },
  SeqBrkFootwork: { stem: 'breakdance-footwork-1-9ea8aed6', tile: 2, floor: true },
  SeqBrkHeadSpin: { stem: 'head-spinning-e06a3bdb', tile: 6, floor: true },
  // Capoeira: two ginga variations (the wide lunge: grounded) and a loop of the 17.7 s capoeira round
  SeqGinga: { stem: 'ginga-variation-1-ace8c8c0', tile: 2, grounded: true },
  SeqGinga2: { stem: 'ginga-variation-2-c4346262', tile: 2, grounded: true },
  SeqCapoeira: { stem: 'capoeira-51a06fb8', tile: 0 },
  // Party classics
  SeqYmca: { stem: 'ymca-dance-02c59e27', tile: 0 },
  SeqMacarena: { stem: 'macarena-dance-0922aa09', tile: 0 },
  SeqSilly: { stem: 'silly-dancing-9f3f6bb7', tile: 0 },
  SeqSilly2: { stem: 'silly-dancing-11f08893', tile: 0 },
  // Latin party (the Club's "Party": salsa, samba, house; the travel steps' in-place takes)
  SeqSalsa: { stem: 'salsa-dancing-1ac423c5', tile: 0 },
  SeqSalsa3: { stem: 'salsa-dancing-747d1a15', tile: 2 },
  SeqSalsa4: { stem: 'salsa-dancing-039397a1', tile: 0 },
  SeqSalsa7: { stem: 'salsa-dancing-604f91d6', tile: 0 },
  SeqSamba: { stem: 'samba-dancing-e647efa7', tile: 0 },
  SeqSamba2: { stem: 'samba-dancing-662badd3', tile: 0 },
  SeqSamba3: { stem: 'samba-dancing-79d30f81', tile: 0 },
  SeqSamba5: { stem: 'samba-dancing-80786979', tile: 0 },
  SeqSamba7: { stem: 'samba-dancing-b1010b97', tile: 0 },
  SeqHouse: { stem: 'house-dancing-fde81d60', tile: 0 },
  // Northern soul and jazz
  SeqJazz4: { stem: 'jazz-dancing-8c01a788', tile: 2 },
  SeqJazz5: { stem: 'jazz-dancing-924532a3', tile: 2 },
  SeqSwing2: { stem: 'swing-dancing-93cfc12a', tile: 0 },
  SeqSwing4: { stem: 'swing-dancing-6c02c92e', tile: 2 },
  SeqNsFloorSpin: { stem: 'northern-soul-floor-spin-e42ff6e0', tile: 0, floor: true },
});
/** Takes tried and left out (scripts/seq-bake.mjs on Kotone and nam-1, 2026-11-28): why. */
export const SEQ_DROPPED = Object.freeze({
  'breakdance-1990-a74d147b': '1990 spin (tiled x10): the palms jitter more than the take itself after the hand clearance (nam-1; floor work is the back row only)',
  'wave-hip-hop-dance-9e6d298e': 'Wave hip hop (the Club wave_hip_hop): joint rules after the repair on both bodies, standing and grounded',
  'wave-hip-hop-dance-11573b3d': 'Wave hip hop 3: no 3 s loop window',
  'quick-steps-e2ac5680': 'Quick steps: the hands need the clearance\'s whole reach (Kotone), joint rules (nam-1)',
  'chicken-dance-11e6042b': 'Chicken dance: joint rules on both bodies',
  'salsa-dancing-3424eaca': 'Salsa 8: joint rules on both bodies',
  'swing-dancing-880023e4': 'Swing (the Club swing): joint rules on both bodies',
  'swing-dancing-cd96ac85': 'Swing 3: the hands need the full clearance reach (Kotone), joint rules (nam-1)',
  'northern-soul-dance-4c58dd12': 'Northern soul dance: a planted foot slides more than the take (Kotone), a knee out of its plane and the thighs through each other (nam-1)',
  'house-dancing-a8408e03': 'House 2: only Kotone keeps it, as a 32-beat (19.8 s) loop at 1.1x at most: left out to keep the Latin pack small (House, Samba 7 and Salsa fill its step)',
  'capoeira-5a715ca2': 'Capoeira 2: not tried (the Club drops it on every hero: joint rules, reach)',
  'popping': 'Popping and tutting (wave 2, tut, tut 2, snake): Kotone keeps only Wave 2 (the Club wave and the tuts need the hands\' full clearance reach or break the joint rules on her), and its copies on the boys break a wrist rule; nam-1\'s tuts and snake cross the thighs of the thicker copies (Saki, Kai, Ren) and their fades break rules on nam-1 itself. With the cast\'s bodies and fades checked, no popping take was left for either row of the usual cast: the style was dropped (2026-11-28)',
  'travel takes': 'shopping cart, running man, dancing 1, booty hip hop and the Club Travel step loop: they travel; Sing & Play\'s spots are fixed',
});

const seq = (steps, o = {}) => Object.freeze({ backShift: 0, ...o, steps: Object.freeze(steps.map(s => Object.freeze({ ...s, ids: Object.freeze(s.ids) }))),
  bars: steps.reduce((n, s) => n + s.bars, 0) });
// Breaking's standing top rocks: the two uprock takes, then the Club loops already in Kotone's and nam-1's packs
const TOP_ROCK = ['SeqBrkUprock2', 'SeqBrkUprock', 'ClubTopRock', 'ClubBrooklynRock'];
/**
 * style -> its round. ids: a step's dances in preference order (the first ones this body has, that fit the song's tempo and
 * the dancer, play; the round index rotates among them); Club* ids are the Club loops already in the main packs (filling
 * in where a body keeps few takes). floor: the back row only, on flat ground (the front row, and the back row on a
 * slope, play the round's top-rock step instead). travel: the Club's travel step; here its in-place takes.
 * backShift: bars the back row's round runs ahead of the front's (0: in step; Breaking and Northern soul: the back row is
 * the cypher, its floor round ending on the section's end with the front). stagger: the back row starts one take further
 * on in each step's list (its own takes). freeze: the round's last step is held on the section's last beat (Club
 * scheduleFreeze: eased in on floor work). like: the Dance style whose mic moves, moments and Club loops it borrows.
 */
export const SEQUENCES = Object.freeze({
  breaking: seq([
    { part: 'ready', bars: 1, ids: ['SeqBrkReady', 'ClubTopRock'] },
    { part: 'toprock', bars: 2, ids: TOP_ROCK },
    { part: 'footwork', bars: 3, ids: ['SeqBrkFootwork', 'SeqBrkHeadSpin'], floor: true },
    { part: 'power', bars: 2, ids: ['SeqBrkHeadSpin', 'SeqBrkFootwork'], floor: true },   // the round's last bars: the section-end freeze holds it
  ], { freeze: true, like: 'hiphop' }),
  capoeira: seq([
    { part: 'ginga', bars: 2, ids: ['SeqGinga', 'SeqGinga2'] },
    { part: 'ginga', bars: 2, ids: ['SeqGinga2', 'SeqGinga'] },
    { part: 'round', bars: 4, ids: ['SeqCapoeira', 'SeqGinga'] },
  ], { backShift: 4, like: 'hiphop' }),   // (one row plays the round while the other gingas)
  classics: seq([
    { part: 'party', bars: 4, ids: ['SeqYmca', 'SeqSilly2', 'SeqSilly'] },
    { part: 'party', bars: 2, ids: ['SeqMacarena', 'SeqSilly', 'ClubClapStep'] },
    { part: 'party', bars: 2, ids: ['SeqSilly2', 'SeqSilly', 'ClubCutePop'] },
  ], { like: 'cute' }),   // (the whole group in the YMCA together)
  latin: seq([
    { part: 'latin', bars: 2, ids: ['SeqSalsa', 'SeqSalsa3', 'SeqSamba5', 'SeqSamba', 'SeqSalsa7'] },
    { part: 'travel', bars: 2, travel: true, ids: ['SeqSamba2', 'SeqSalsa4'] },
    { part: 'house', bars: 2, ids: ['SeqHouse', 'SeqSamba7', 'SeqSalsa'] },
    { part: 'travel', bars: 2, travel: true, ids: ['SeqSamba5', 'SeqHouse', 'SeqSamba3'] },
  ], { backShift: 2, stagger: true, like: 'kpop' }),
  // Northern soul (the Club's soul and jazz sets): the soul step, down into the floor spin, up again, a swing kick, the spin
  soul: seq([
    { part: 'soul', bars: 2, ids: ['SeqJazz5', 'SeqJazz4', 'ClubStepTouch'] },
    { part: 'floorspin', bars: 2, ids: ['SeqNsFloorSpin'], floor: true },
    { part: 'kick', bars: 2, ids: ['SeqSwing4', 'SeqSwing2', 'SeqJazz4', 'ClubKickBall'] },
    { part: 'floorspin', bars: 2, ids: ['SeqNsFloorSpin'], floor: true },
  ], { like: 'kpop' }),
});
/** The new Dance choices, in the picker's order. */
export const SEQ_STYLES = Object.freeze(Object.keys(SEQUENCES));
export const isSequence = style => Boolean(SEQUENCES[style]);
/** The clips a style's pack carries (its Seq* takes; the Club loops it names are in the main packs). */
export const styleClips = style => [...new Set(SEQUENCES[style].steps.flatMap(s => s.ids))].filter(id => SEQ_TAKES[id]);
/** The pack file stems of a style: [the front row's (Kotone's rig), the back row's (nam-1's)]. */
export const seqPacks = style => (isSequence(style) ? [`moves-seq-${style}-kotone`, `moves-seq-${style}-nam1`] : []);
export const isFloorClip = clip => Boolean(SEQ_TAKES[clip]?.floor);
/** The round's top-rock step: what a dancer who may not go down to the floor plays in a floor step. */
export const rockStep = s => s.steps.find(x => !x.floor && x.part === 'toprock') || s.steps.find(x => !x.floor) || null;

/**
 * The step of a sequence at bar `barIn` of a section (pure; Club sequenceStep). sectionBars (when the section's length is
 * known): the rounds are laid back from the section's end, so its last bars are always the round's last step (Breaking:
 * the power move the freeze holds) and a short section plays the round's end, not only its start.
 * -> { step, index, round, startBar, endBar } (bars in the section; startBar may be before 0 for a round begun earlier)
 */
export function sequenceStep(s, barIn, sectionBars = null) {
  if (!s?.steps?.length) return null;
  let b = Math.max(0, Math.floor(barIn)), shift = 0;
  const n = Math.round(sectionBars);
  if (Number.isFinite(n) && n > 0) { shift = (s.bars - (n % s.bars)) % s.bars; b += shift; }
  const round = Math.floor(b / s.bars); let at = round * s.bars;
  for (let i = 0; i < s.steps.length; i++) {
    const step = s.steps[i];
    if (b < at + step.bars) return { step, index: i, round, startBar: at - shift, endBar: at + step.bars - shift };
    at += step.bars;
  }
  return null;
}
/**
 * A row's step (pure): `ahead` bars further on in the same rounds (the back row's backShift), laid back from the same
 * section end; bars in the section's own count. (The Club's slotStep also adds `ahead` to the section's length, which lays
 * the shifted round back by the same bars again: on a section of known length its dancers end up in step.)
 */
export function rowStep(s, barIn, ahead = 0, sectionBars = null) {
  const st = sequenceStep(s, barIn + ahead, sectionBars);
  return st && { ...st, startBar: st.startBar - ahead, endBar: st.endBar - ahead };
}
