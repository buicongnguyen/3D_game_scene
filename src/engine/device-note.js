import { weakDevice } from './people.js';

// The card shown before a story (or Explore) on a weak device (docs/play-zones/phase-1-device-notice.md): the story
// builds the whole valley, which on an old or small phone runs slowly and warms it up, so the card offers light mode
// or the mini games first. Shown once per device; Settings keeps the same words and the light-mode button.
//
// "Weak" is engine/people.js's rule (the Low tier and little memory, few cores or slow frames), so the card and the
// light people agree. A web page cannot read the phone's temperature: the card names the risk, it does not measure it.

const SEEN = 'starline-device-note';
const SLOW = 'starline-slow';
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: asked again next time */ } };

/**
 * Should the card show now? Pure: the caller passes what it knows. `force` (?devicenote=1) always shows it; QA runs
 * (`qa`) and a device that has seen it never do; otherwise weak devices do.
 */
export function noteWanted({ tier, memory, cores, slow, seen = false, qa = false, force = false } = {}) {
  if (force) return true;
  if (qa || seen) return false;
  return weakDevice({ tier, memory, cores, slow });
}

/** What this device is: the tier, navigator's memory and cores, and whether frames ran slow on an earlier visit. */
export const deviceFacts = tier => ({
  tier,
  memory: typeof navigator === 'undefined' ? undefined : navigator.deviceMemory,
  cores: typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
  slow: get(SLOW) === '1',
});

export const noteSeen = () => get(SEEN) === '1';
export const markNoteSeen = () => set(SEEN, '1');
/** The governor stepped far down the Low ladder (engine/renderer.js): next visit this device counts as slow. */
export const markSlow = () => { if (get(SLOW) !== '1') set(SLOW, '1'); };
/** Steps down the Low tier's ladder that mark a device slow. */
export const SLOW_LEVEL = 2;
