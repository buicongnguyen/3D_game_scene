// Even frames on a phone that cannot keep 60 (the Low tier). Frames that swing between ~26 and ~38 ms (the shadow map
// is drawn every other frame) look like stutter; a steady 30 looks smooth, and the phone stays cooler. The game's own
// work per frame decides, not the gaps between frames (those are what pacing changes):
//   - pace (draw every other display frame, ~30 fps) when the median work of a 2 s window is over `slow` twice running;
//   - back to every frame when the work stays under `fast` for `calm` windows running (a quieter part of the valley).
// Pure logic, fed with milliseconds.

export class Pacer {
  constructor({ slow = 17, fast = 10, calm = 4, window = 60 } = {}) {
    Object.assign(this, { slow, fast, calm, window });
    this.pace = 0;             // minimum ms between drawn frames (0: every display frame)
    this.works = []; this.slowRun = 0; this.calmRun = 0;
  }

  /** One frame's work (ms). Returns the new pace when it changed, else null. */
  feed(ms) {
    this.works.push(ms);
    if (this.works.length < this.window) return null;
    const s = this.works.sort((a, b) => a - b), p50 = s[s.length >> 1];
    this.works = [];
    this.slowRun = p50 > this.slow ? this.slowRun + 1 : 0;
    this.calmRun = p50 < this.fast ? this.calmRun + 1 : 0;
    if (!this.pace && this.slowRun >= 2) { this.pace = 1000 / 30; this.slowRun = 0; return this.pace; }
    if (this.pace && this.calmRun >= this.calm) { this.pace = 0; this.calmRun = 0; return this.pace; }
    return null;
  }
}
