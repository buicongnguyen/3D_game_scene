import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installFrameRecorder, summarizeFrames } from './perf/frame-recorder.mjs';
import { watchResources, validateResources, validateScene } from './perf/support.mjs';

function fakeWindow(t, frame) {
  const previous = globalThis.window;
  let clock = 0;
  const g = { renderer: { qualityName: 'low', appliedLevel: 0, scale: 1, renderer: { info: { render: { calls: 0 } } } } };
  g.frame = function () { assert.equal(this, g); clock += 5; g.renderer.renderer.info.render.calls++; frame?.(g); };
  globalThis.window = { __STARLINE__: g, performance: { now: () => clock } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  return { g, original: g.frame, advance: n => { clock += n; } };
}

test('frame window excludes setup/teardown and counts frames independently of gaps', t => {
  const { g, original, advance } = fakeWindow(t);
  installFrameRecorder(); g.frame();
  window.__fp.begin(); g.frame(); advance(12); g.frame();
  const raw = window.__fp.stop(), out = summarizeFrames(raw);
  assert.equal(g.frame, original); g.frame();
  assert.equal(out.frames, 2); assert.equal(out.gapCount, 1);
  assert.equal(out.js50, 5); assert.equal(out.gap50, 17);
  assert.equal(out.window.ignoredFrames, 1);
  assert.deepEqual(raw.calls, [2, 3]); assert.equal(out.drawCalls.mean, 2.5);
  assert.equal(out.quality.stable, true); assert.equal(raw.js.length, 2);
});

test('quality history catches a drop that has recovered before the final frame', t => {
  let i = 0;
  const { g } = fakeWindow(t, g => { g.renderer.appliedLevel = ++i === 1 ? 1 : 0; g.renderer.scale = i === 1 ? .85 : 1; });
  installFrameRecorder(); window.__fp.begin(); g.frame(); g.frame();
  const out = summarizeFrames(window.__fp.stop());
  assert.equal(out.tier, 0); assert.equal(out.scale, 1);
  assert.equal(out.quality.stable, false); assert.equal(out.quality.transitions.length, 2);
  assert.equal(Object.values(out.quality.histogram).reduce((a, b) => a + b), 2);
});

test('recorder restoration does not overwrite a newer owner', t => {
  const { g } = fakeWindow(t); installFrameRecorder(); window.__fp.begin(); g.frame(); g.frame();
  const foreign = () => {}; g.frame = foreign;
  const raw = window.__fp.stop();
  assert.equal(g.frame, foreign); assert.equal(raw.restored, false);
  assert.throws(() => summarizeFrames(raw), /cleanly/);
});

test('a thrown frame remains an invalid measurement and still restores the original', t => {
  const { g, original } = fakeWindow(t, () => { throw Error('frame failed'); });
  installFrameRecorder(); window.__fp.begin(); assert.throws(() => g.frame(), /frame failed/);
  const raw = window.__fp.stop(); assert.equal(raw.frameErrors, 1); assert.equal(g.frame, original);
  assert.throws(() => summarizeFrames(raw), /cleanly/);
});

test('production resource guards reject missing models and nested source imports', () => {
  const page = new EventEmitter(), report = {};
  watchResources(page, report); validateResources(report);
  page.emit('requestfailed', { url: () => 'http://app/models/x.glb', failure: () => ({ errorText: 'net::ERR_ABORTED' }) });
  validateResources(report);
  page.emit('response', { url: () => 'http://app/models/x.glb', status: () => 404 });
  assert.throws(() => validateResources(report), /failedResources=1/);
  report.failedResources.length = 0;
  page.emit('request', { url: () => 'http://app/base/src/main.js' });
  assert.throws(() => validateResources(report), /sourceRequests=1/);
  assert.throws(() => validateResources({ errors: [] }), /telemetry/);
});

test('scene guard cannot accept two legacy paths or a visible placeholder as grid equivalence', () => {
  const off = { total: { cells: 0 }, gridEnabled: false, placeholders: [] };
  const on = { total: { cells: 12 }, gridEnabled: true, placeholders: [] };
  validateScene(off, { cells: 'off' }); validateScene(on);
  assert.throws(() => validateScene(off), /absent/);
  assert.throws(() => validateScene(on, { cells: 'off' }), /disable/);
  assert.throws(() => validateScene({ ...on, placeholders: ['missing-house'] }), /placeholder/);
  validateScene(off, { allowLegacy: true });
});
