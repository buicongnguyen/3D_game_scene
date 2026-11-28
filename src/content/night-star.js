// © 2026 Bui Cong Nguyen · solluxlabs.com
// The Night Star (docs/NIGHT-STAR.md): a girl who appears only under the stars, at the shrine yard where the valley holds
// its night festival, and sings one song with Kotone's friends dancing behind her. Seen once (to her bow), she joins
// Sing & Play's Singer row (content/troupe.js GUESTS: Stella; 은하 in Korean, Tinh in Vietnamese).
// Her place is Sing & Play's Shrine yard stage (content/stages.js). She performs facing the torii and the shrine
// stairs (the stage's own view direction, not Sing & Play's turn to the camera): the cameras then film from the open
// yard with the lit shrine hall behind her; turned the other way they stood on the hall's terrace and veranda (only 3 m
// of yard behind her). Room checked with the game's full colliders at this turn (.tools/show/room-check.mjs): Solo and
// 4 pass 0.6 m off and 0.1 rad turned either way.
import { STAGES } from './stages.js';
import { NIGHT_STAR } from './troupe.js';

const SHRINE = STAGES.find(s => s.id === 'shrine');

export const NIGHT_STAR_SHOW = Object.freeze({
  who: NIGHT_STAR,
  x: SHRINE.x, z: SHRINE.z, facing: SHRINE.facing,   // her own turn: toward the torii (the watchers and the camera)
  night: 0.6,           // the valley's night (0..1) from which she can be there: the stars are out (about 19:30 to 05:00)
  near: 70,             // m: within this of her spot (and at night) her files start loading
  appear: 40,           // m: she stands there, softly lit, from this close
  leave: 95,            // m: past this she is gone (and her show stops)
  watch: 7,             // m: the prompt to watch her show within this
  group: 4,             // her group behind her: 4 (the front row); Low phones too (measured: docs/NIGHT-STAR.md)
  view: Object.freeze({ x: 0, z: 7.5 }),   // where Mika stands to watch (her frame: 7.5 m in front of the formation)
});

/** Per device: '1' once her show was seen to her bow (the Singer row then offers her). */
export const SEEN_KEY = 'starline:nightstar:seen';
export function nightStarSeen(store = globalThis.localStorage) {
  try { return store?.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
export function markNightStarSeen(store = globalThis.localStorage) {
  try { store?.setItem(SEEN_KEY, '1'); } catch { /* per-device convenience */ }
}

/**
 * May she be there now? (pure) ctx: { night (0..1), dist (Mika from her spot, m), free (no dialogue, scene, mini game,
 * tour, ride, Sing & Play), open (the shrine stairs are open: Explore, or the story past the sleeping bear), indoors }.
 * -> 'gone' | 'near' (load her files) | 'here' (she stands there)
 */
export function nightStarState({ night = 0, dist = Infinity, free = true, open = true, indoors = false } = {}) {
  if (night < NIGHT_STAR_SHOW.night || !open || indoors || dist > NIGHT_STAR_SHOW.leave) return 'gone';
  if (!free) return dist < NIGHT_STAR_SHOW.appear ? 'here' : 'near';
  return dist < NIGHT_STAR_SHOW.appear ? 'here' : dist < NIGHT_STAR_SHOW.near ? 'near' : 'gone';
}
