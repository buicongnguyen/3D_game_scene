// Two stories in one valley. The shared structure (steps, items, places) lives in ../story.js, written for the
// original story ("Starline Classic"). The default story, "A Year with Grandma" (./grandma.js), overrides its words
// and a few step rules. useStory() swaps the chosen story's text into the shared tables *in place*, so every module
// that imported DIALOGUE, STEPS… keeps working without knowing which story is on.
import { CAST, CHAPTERS, DIALOGUE, CHATTER, JOURNAL, SKY_LETTERS, KEEPSAKES, GIFTS, CAPTIONS, STEPS, TREASURES, HUNT } from '../story.js';
import { STORY as GRANDMA } from './grandma.js';

export const DEFAULT_STORY = 'grandma';
export const STORIES = {
  grandma: { id: 'grandma', name: 'A Year with Grandma', blurb: 'Stay the year with Grandma Sora and help her light up the valley.', data: GRANDMA },
  classic: { id: 'classic', name: 'Starline Classic', blurb: 'The original, more bittersweet story.', data: null },
};

// the classic tables as written, kept to switch back
const clone = o => JSON.parse(JSON.stringify(o));
const BASE = {
  CAST: clone(CAST), CHAPTERS: clone(CHAPTERS), DIALOGUE: clone(DIALOGUE), CHATTER: clone(CHATTER), JOURNAL: clone(JOURNAL),
  SKY_LETTERS: clone(SKY_LETTERS), KEEPSAKES: clone(KEEPSAKES), TREASURES: TREASURES.map(t => ({ ...t })), GIFTS: GIFTS.map(g => ({ ...g })), CAPTIONS: clone(CAPTIONS),
  HUNT: HUNT.map(h => h),              // hunt entries hold found() functions: overridden by copy
  STEPS: STEPS.map(s => s),            // step objects hold functions in places: keep the originals, override by copy
};

let current = 'classic';
export const storyId = () => current;

const refill = (obj, from) => { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, from); };
const refillArray = (arr, from) => { arr.length = 0; arr.push(...from); };
const byId = (list, over) => list.map(x => (over?.[x.id] ? { ...x, ...over[x.id] } : x));

/** Switch every shared story table to `id` ('grandma' | 'classic'). Unknown ids fall back to classic. */
export function useStory(id) {
  const s = STORIES[id] ? id : 'classic';
  const d = STORIES[s].data || {};
  current = s;
  refill(CAST, { ...BASE.CAST, ...clone(d.CAST || {}) });
  refillArray(CHAPTERS, BASE.CHAPTERS.map((c, i) => ({ ...c, ...(d.CHAPTER_NAMES?.[i] || {}) })));
  refill(DIALOGUE, { ...clone(BASE.DIALOGUE), ...clone(d.DIALOGUE || {}) });
  refill(CHATTER, { ...clone(BASE.CHATTER), ...clone(d.CHATTER || {}) });
  refillArray(JOURNAL, clone(d.JOURNAL || BASE.JOURNAL));
  refillArray(SKY_LETTERS, clone(d.SKY_LETTERS || BASE.SKY_LETTERS));
  refillArray(KEEPSAKES, byId(clone(BASE.KEEPSAKES), d.KEEPSAKES));
  refillArray(GIFTS, byId(BASE.GIFTS.map(g => ({ ...g })), d.GIFTS));
  refillArray(TREASURES, byId(BASE.TREASURES.map(t => ({ ...t })), d.TREASURES));
  refillArray(HUNT, byId(BASE.HUNT, d.HUNT));
  refill(CAPTIONS, { ...clone(BASE.CAPTIONS), ...clone(d.CAPTIONS || {}) });
  refillArray(STEPS, BASE.STEPS.map(st => (d.STEPS?.[st.id] ? { ...st, ...d.STEPS[st.id] } : st)));
  return s;
}

/**
 * A content entry in the chosen story: list entries tagged `story` play only in that story; objects carrying a
 * `grandma: {…}` block take those fields in the Grandma story (Town Life, shops, hotspots).
 */
export const inStory = e => !e?.story || e.story === current;
export function forStory(e) {
  if (!e || current !== 'grandma' || !e.grandma) return e;
  return { ...e, ...e.grandma };
}
