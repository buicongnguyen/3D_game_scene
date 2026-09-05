// Timing policy shared by the scene and regression tests. No browser dependencies.
export const TOUR_DURATION = Object.freeze({ default: 25, min: 12, max: 60 });

export function normalizeTourDuration(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(TOUR_DURATION.min, Math.min(TOUR_DURATION.max, Math.round(seconds)))
    : TOUR_DURATION.default;
}

export function retimeTour(time, intro, previous, next) {
  if (time <= intro) return time;
  return intro + (time - intro) / previous * next;
}

export class FrameMetrics {
  constructor(size = 40) {
    this.samples = new Float64Array(size);
    this.reset();
  }
  reset() { this.index = 0; this.count = 0; this.total = 0; }
  push(seconds) {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return;
    this.total -= this.samples[this.index] * (this.count === this.samples.length ? 1 : 0);
    this.samples[this.index] = seconds;
    this.total += seconds;
    this.index = (this.index + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
  }
  get fps() { return this.total > 0 ? this.count / this.total : 0; }
}
