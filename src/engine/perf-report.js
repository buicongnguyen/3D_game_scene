// A performance report the player can copy from Settings and paste to the developer: what device this is, what tier and
// governor step the game settled on, how long frames really take, how many draws and how much memory. Real phones are
// the one thing the development machine cannot imitate (GPU fill, heat, memory limits), so this is how they get measured.
// Pure (tests/perf-report.test.mjs): the game fills a snapshot, this makes the text.

/** The last `n` frames' work (ms inside the game's frame) and gaps (ms between drawn frames), in two ring buffers. */
export class FrameRing {
  constructor(n = 300) { this.n = n; this.work = new Float32Array(n); this.gap = new Float32Array(n); this.i = 0; this.count = 0; }
  push(work, gap) { this.work[this.i] = work; this.gap[this.i] = gap; this.i = (this.i + 1) % this.n; if (this.count < this.n) this.count++; }
  /** median, 90th and 99th percentile of what is in the ring: { n, work: [p50, p90, p99], gap: [p50, p90, p99] } */
  summary() {
    const q = (a, p) => { const s = Array.from(a.subarray(0, this.count)).filter(v => v > 0 || a === this.work).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
    return { n: this.count, work: [0.5, 0.9, 0.99].map(p => q(this.work, p)), gap: [0.5, 0.9, 0.99].map(p => q(this.gap, p)) };
  }
}

const f1 = v => (Number.isFinite(v) ? v.toFixed(1) : '?');

/**
 * Frame gaps over one stretch of time (the opening scene): the worst gap and how many went over 50 and 100 ms.
 * `add(gap)` is pure; `watch()` feeds it from requestAnimationFrame until `stop()`.
 */
export class GapWatch {
  constructor() { this.n = 0; this.worst = 0; this.over50 = 0; this.over100 = 0; this.last = 0; this.on = false; }
  add(gap) { this.n++; if (gap > this.worst) this.worst = gap; if (gap > 50) this.over50++; if (gap > 100) this.over100++; }
  watch(raf = globalThis.requestAnimationFrame) {
    if (!raf) return this;
    this.on = true; this.last = 0;
    const tick = t => { if (!this.on) return; if (this.last) this.add(t - this.last); this.last = t; raf(tick); };
    raf(tick);
    return this;
  }
  stop() { this.on = false; return { frames: this.n, worst: Math.round(this.worst), over50: this.over50, over100: this.over100 }; }
}

/** The opening's line: which version played (and why live), how fast the clip started, and how smooth it was. */
export function arrivalLine(a) {
  if (!a) return '';
  const parts = [a.mode === 'clip' ? 'opening: recorded clip' : `opening: live${a.reason ? ` (${a.reason})` : ''}`];
  if (a.firstMs != null) parts.push(`first picture after ${Math.round(a.firstMs)} ms`);
  if (a.total > 0) parts.push(`video frames dropped ${a.dropped}/${a.total}`);
  const s = a.scene;
  if (s?.frames) parts.push(`worst gap ${s.worst} ms, ${s.over50} gaps over 50 ms, ${s.over100} over 100 ms`);
  if (a.handover != null) parts.push(`hand-over worst gap ${Math.round(a.handover)} ms`);
  if (a.prefetched != null) parts.push(`fetched early: ${a.prefetched ? 'yes' : 'no'}`);
  return parts.join(' · ');
}

/** snapshot -> text. Every field is optional: a browser without `performance.memory` just leaves that line out. */
export function buildReport(s = {}) {
  const L = [];
  L.push(`Starline performance report  ${s.at || ''}`.trim());
  L.push(`build: ${s.build || '?'}   page: ${s.page || ''}`);
  L.push(`device: ${s.ua || '?'}`);
  L.push(`screen: ${s.screen || '?'} @${s.dpr ?? '?'}x   cores: ${s.cores ?? '?'}   memory: ${s.memory ?? '?'} GB`);
  L.push(`graphics: ${s.tier || '?'}   governor step: ${s.level ?? '?'}   render scale: ${s.scale ?? '?'}   paced to 30 fps: ${s.pace ? 'yes' : 'no'}${s.slowMarked ? '   remembered as slow' : ''}`);
  if (s.mobile != null || s.savedTier !== undefined) L.push(`phone: ${s.mobile ? 'yes' : 'no'}   tier saved in Settings: ${s.savedTier || 'none'}${s.tropical ? '   tropical trees: on' : ''}`);
  if (s.arrival) L.push(arrivalLine(s.arrival));
  const f = s.frames;
  if (f && f.n) {
    const fps = f.gap[0] > 0 ? 1000 / f.gap[0] : NaN;
    L.push(`frames (last ${f.n}): game work median ${f1(f.work[0])} ms, p90 ${f1(f.work[1])}, p99 ${f1(f.work[2])};  gap median ${f1(f.gap[0])} ms (${f1(fps)} fps), p90 ${f1(f.gap[1])}, p99 ${f1(f.gap[2])}`);
  }
  if (s.calls != null) L.push(`scene: ${s.calls} draw calls, ${s.tris != null ? Math.round(s.tris / 1000) + 'k' : '?'} triangles, ${s.geometries ?? '?'} geometries, ${s.textures ?? '?'} textures`);
  if (s.heapMB != null) L.push(`memory: JS heap ${f1(s.heapMB)} MB${s.heapLimitMB ? ` of ${Math.round(s.heapLimitMB)} MB` : ''}`);
  if (s.place) L.push(`where: ${s.place}`);
  if (s.params) L.push(`switches: ${s.params}`);
  return L.join('\n');
}
