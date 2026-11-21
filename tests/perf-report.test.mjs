// The copyable performance report (src/engine/perf-report.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameRing, buildReport } from '../src/engine/perf-report.js';

test('the frame ring keeps the last frames and summarises them', () => {
  const r = new FrameRing(100);
  for (let i = 0; i < 250; i++) r.push(i < 150 ? 40 : 10, i < 150 ? 40 : 16.7);   // old slow frames fall out of the ring
  const s = r.summary();
  assert.equal(s.n, 100);
  assert.equal(s.work[0], 10);
  assert.ok(Math.abs(s.gap[0] - 16.7) < 1e-3);
  assert.equal(new FrameRing(10).summary().n, 0, 'empty ring: nothing to report, nothing thrown');
});

test('the report names the device, the tier, the frames and the scene, and copes with missing pieces', () => {
  const r = new FrameRing(60); for (let i = 0; i < 60; i++) r.push(20, 33.3);
  const t = buildReport({ at: '2026-10-29', build: 'index-abc.js', ua: 'iPhone', screen: '390x844', dpr: 3, cores: 6, tier: 'low', level: 1, scale: 0.85, pace: 33.3, frames: r.summary(), calls: 150, tris: 420000, geometries: 300, textures: 80, heapMB: 78.2, place: 'Kawabe (-26, 20), summer, 11 h' });
  for (const part of ['iPhone', 'graphics: low', 'governor step: 1', 'paced to 30 fps: yes', 'game work median 20.0 ms', '30.0 fps', '150 draw calls', '420k triangles', 'JS heap 78.2 MB', 'Kawabe']) assert.ok(t.includes(part), `has "${part}"`);
  const bare = buildReport({});
  assert.ok(bare.includes('performance report') && !bare.includes('NaN') && !bare.includes('undefined'), 'an empty snapshot still reads cleanly');
});

test('the opening line says which version played, why live, and how smooth it was', async () => {
  const { GapWatch, arrivalLine } = await import('../src/engine/perf-report.js');
  const w = new GapWatch();
  for (const g of [16, 17, 60, 16, 120, 17]) w.add(g);
  const s = w.stop();
  assert.deepEqual(s, { frames: 6, worst: 120, over50: 2, over100: 1 });
  const clip = arrivalLine({ mode: 'clip', firstMs: 812.4, dropped: 3, total: 789, scene: s, handover: 48.6, prefetched: true });
  for (const part of ['recorded clip', 'first picture after 812 ms', 'dropped 3/789', 'worst gap 120 ms', '2 gaps over 50 ms', 'hand-over worst gap 49 ms', 'fetched early: yes']) assert.ok(clip.includes(part), `has "${part}"`);
  assert.ok(arrivalLine({ mode: 'live', reason: 'medium graphics' }).includes('live (medium graphics)'));
  const t = buildReport({ mobile: true, savedTier: 'medium', arrival: { mode: 'live', reason: 'medium graphics' } });
  assert.ok(t.includes('phone: yes') && t.includes('tier saved in Settings: medium') && t.includes('opening: live (medium graphics)'));
  assert.ok(!buildReport({}).includes('opening'), 'no opening played yet: no line');
});
