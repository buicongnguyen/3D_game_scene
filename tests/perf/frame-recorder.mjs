// Browser recorder. Keep this function self-contained so Playwright can serialize it.
export function installFrameRecorder() {
  const g = window.__STARLINE__, original = g.frame, now = () => window.performance.now();
  const quality = () => ({ name: g.renderer.qualityName, level: g.renderer.appliedLevel || 0, scale: g.renderer.scale });
  const pacer = () => g.pacer ? { enabled: true, ...Object.fromEntries(Object.entries(g.pacer).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean')) } : { enabled: false, pace: 0 };
  const m = { active: false, ignoredFrames: 0, frameErrors: 0, js: [], gaps: [], calls: [], before: [], after: [], paces: [], last: null };
  function wrapped(...args) {
    if (!m.active) { m.ignoredFrames++; return original.apply(this, args); }
    const start = now(), before = quality();
    try { return original.apply(this, args); }
    catch (e) { m.frameErrors++; throw e; }
    finally {
      const end = now();
      if (m.last !== null) m.gaps.push(start - m.last);
      m.last = start; m.js.push(end - start);
      m.calls.push(g.renderer.renderer.info.render.calls);
      m.before.push(before); m.after.push(quality());
      m.paces.push(g.pacer?.pace || 0);
    }
  }
  m.begin = () => {
    if (m.active || m.started !== undefined) throw Error('Frame window already started');
    m.started = now(); m.startQuality = quality(); m.startPacer = pacer(); m.active = true;
  };
  m.restore = () => {
    m.active = false;
    if (g.frame === wrapped) { g.frame = original; m.restored = true; }
    else m.restored = g.frame === original;
    return m.restored;
  };
  m.stop = () => {
    if (!m.active) throw Error('Frame window is not active');
    m.ended = now(); m.endQuality = quality(); m.endPacer = pacer(); m.restore();
    return { started: m.started, ended: m.ended, durationMs: m.ended - m.started,
      ignoredFrames: m.ignoredFrames, frameErrors: m.frameErrors, restored: m.restored,
      js: m.js.slice(), gaps: m.gaps.slice(), calls: m.calls.slice(), before: m.before.slice(), after: m.after.slice(),
      paces: m.paces.slice(), startPacer: m.startPacer, endPacer: m.endPacer,
      startQuality: m.startQuality, endQuality: m.endQuality };
  };
  g.frame = wrapped; window.__fp = m;
}

export function summarizeFrames(m) {
  if (!m.restored || m.frameErrors) throw Error('Frame recorder did not finish cleanly');
  if (m.js.length < 2 || m.gaps.length !== m.js.length - 1) throw Error('Incomplete frame window');
  const stats = a => { const s = a.slice().sort((x, y) => x - y); return { min: s[0], max: s.at(-1), mean: s.reduce((x, y) => x + y, 0) / s.length, median: s[Math.floor(s.length / 2)], p90: s[Math.min(s.length - 1, Math.floor(s.length * .9))] }; };
  const histogram = {}, transitions = [];
  const key = q => `${q.name}/level${q.level}/scale${q.scale}`;
  let previous = m.startQuality;
  for (let i = 0; i < m.js.length; i++) {
    for (const [phase, q] of [['before', m.before[i]], ['after', m.after[i]]]) {
      if (key(q) !== key(previous)) transitions.push({ frame: i, phase, from: previous, to: q });
      previous = q;
    }
    const k = key(m.after[i]); histogram[k] = (histogram[k] || 0) + 1;
  }
  if (key(previous) !== key(m.endQuality)) transitions.push({ frame: m.js.length, phase: 'end', from: previous, to: m.endQuality });
  const js = stats(m.js), gaps = stats(m.gaps), calls = stats(m.calls);
  const paceHistogram = {}; for (const p of m.paces) paceHistogram[p] = (paceHistogram[p] || 0) + 1;
  return { frames: m.js.length, gapCount: m.gaps.length, gap50: gaps.median, gap90: gaps.p90, gapMean: gaps.mean, gapStats: gaps,
    js50: js.median, js90: js.p90, jsMean: js.mean, workStats: js, lastFrameCalls: m.calls.at(-1), calls: m.calls.at(-1),
    callsMetric: 'Current final frame only; use drawCalls.mean for the full window', drawCalls: calls,
    tier: m.endQuality.level, scale: m.endQuality.scale,
    quality: { start: m.startQuality, end: m.endQuality, histogram, transitions, stable: transitions.length === 0 },
    pacer: { start: m.startPacer, end: m.endPacer, paceHistogram },
    window: { started: m.started, ended: m.ended, durationMs: m.durationMs, ignoredFrames: m.ignoredFrames, restored: m.restored } };
}
