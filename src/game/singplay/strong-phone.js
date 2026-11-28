// © 2026 Bui Cong Nguyen · solluxlabs.com
// Group of 8 on a phone (docs/GROUP-PERFORMANCE.md "Strong phones"): the Low tier (every phone) offers it only when this
// phone has shown, by its own measured frames, that it has room for it; during a show it falls back to the front row
// when the frame budget breaks. Pure logic (tested in tests/troupe.test.mjs), fed by SingPlay.
//
// Strong (offer 8):  the device is not marked slow (device-note.js) and has more than 3 GB where the browser says, the governor is at
//                    level 0 and the pacer is not holding it at 30 fps, and over the last `frames` frames the game's own
//                    work per frame has a median under `workP50` (the pacer's own "calm" line) and the frames come at
//                    `gapP50` or better (the phone keeps 50+ fps). The core count is not used: browsers report it
//                    unevenly, and the frames say more. A phone that once had to fall back is not offered 8 again.
// Broken (fall back): during a show of 8, `dropWindows` windows running (each `window` frames) with the median work over
//                    `dropWork` (near the pacer's 17 ms step) or the median gap over `dropGap` (under ~38 fps), or the
//                    governor or the pacer stepping in at all. The back row then leaves at the next camera cut (or
//                    during a close-up of Kotone, when it is out of the picture), at most `dropWait` s later.

export const STRONG = Object.freeze({ frames: 120, workP50: 10, gapP50: 20, window: 60, dropWindows: 2, dropWork: 15, dropGap: 26, dropWait: 10 });

/** Per device: '1' this phone measured strong before (8 is offered at once), '0' it had to fall back in a show. */
export const STRONG_KEY = 'starline:singplay:strong';

/**
 * Is this device strong enough for a group of 8? -> { ok, why }
 *   tier ('low' | 'medium' | 'high'), memory, slow (engine/device-note.js facts; cores is ignored), level (the governor's), pace
 *   (the pacer's ms, 0 = every frame), frames (FrameRing.summary(): { n, work: [p50..], gap: [p50..] }, ms), saved
 *   (STRONG_KEY's value or null).
 * Medium and High are always strong (they had 8 before). Without enough frames yet, a phone that measured strong before
 * keeps it; otherwise it waits.
 */
export function strongPhone({ tier, memory, slow, level = 0, pace = 0, frames = null, saved = null } = {}) {
  if (tier !== 'low') return { ok: true, why: 'tier' };
  if (saved === '0') return { ok: false, why: 'fell back before' };
  if (slow) return { ok: false, why: 'marked slow' };
  if (memory != null && memory <= 3) return { ok: false, why: 'little memory' };
  if (level > 0) return { ok: false, why: 'governor stepped down' };
  if (pace > 0) return { ok: false, why: 'paced to 30 fps' };
  if (!frames || frames.n < STRONG.frames) return saved === '1' ? { ok: true, why: 'measured before' } : { ok: false, why: 'measuring' };
  if (!(frames.work[0] <= STRONG.workP50)) return { ok: false, why: 'frame work' };
  if (!(frames.gap[0] > 0 && frames.gap[0] <= STRONG.gapP50)) return { ok: false, why: 'frame rate' };
  return { ok: true, why: 'measured' };
}

/** Watches a show of 8: feed(workMs, gapMs) every frame -> true once the budget is broken (it stays broken). */
export class BudgetWatch {
  constructor(o = {}) { this.o = { ...STRONG, ...o }; this.work = []; this.gap = []; this.run = 0; this.broken = false; }
  /** The governor or the pacer stepped in: broken now. */
  trip() { this.broken = true; return true; }
  feed(work, gap) {
    if (this.broken) return true;
    if (!(gap > 0) || gap > 250) return false;          // (a hidden tab or a loading hitch is not the group's doing)
    this.work.push(work); this.gap.push(gap);
    if (this.work.length < this.o.window) return false;
    const med = a => a.sort((x, y) => x - y)[a.length >> 1];
    const over = med(this.work) > this.o.dropWork || med(this.gap) > this.o.dropGap;
    this.work = []; this.gap = [];
    this.run = over ? this.run + 1 : 0;
    if (this.run >= this.o.dropWindows) this.broken = true;
    return this.broken;
  }
}

/** The shot at song time t (camera-man.js planShots list) -> its index, or -1. */
export function shotIndex(shots, t) {
  for (let i = 0; i < shots.length; i++) if (t >= shots[i].t0 && t < shots[i].t1) return i;
  return -1;
}

/**
 * May the back row leave now? At a camera cut (the shot changed to one that cuts), during a close-up (it is out of the
 * picture), or when it has waited dropWait s. state: { shot (index last frame), since (song time the drop was asked) }.
 */
export function dropNow(shots, t, state) {
  const i = shotIndex(shots, t), s = shots[i];
  const cut = i !== state.shot && i >= 0 && state.shot !== undefined && s.cut !== false;
  state.shot = i;
  return cut || s?.kind === 'close' || t - state.since >= STRONG.dropWait;
}
