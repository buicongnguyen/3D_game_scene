// © 2026 Bui Cong Nguyen · solluxlabs.com
// Render resolution (src/engine/resolution.js, docs/RESOLUTION.md): what each tier, mode and device draws, the phones'
// caps unchanged, Sharp's floor, supersampling on a strong desktop card, and the readout's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolutionPlan, pixelRatioFor, resolutionInfo, ssFactor, readResMode, resModeOf, NATIVE_MAX, RES_MODES } from '../src/engine/resolution.js';
import { QUALITY } from '../src/engine/renderer.js';
import { gpuClass } from '../src/engine/quality-pick.js';
import { buildReport } from '../src/engine/perf-report.js';

const RTX4080S = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER (0x00002702) Direct3D11 vs_5_0 ps_5_0, D3D11)';
// the formula before 2026-11-28 (renderer.js resize): the tier's ratio cap, the governor's scale, then the pixel cap
const oldRatio = (q, w, h, dpr, scale = 1) => { let r = Math.min(dpr, q.dpr) * scale; if (w * h * r * r > q.maxPixels) r = Math.sqrt(q.maxPixels / (w * h)); return Math.max(0.5, r); };
const ratio = (tier, w, h, dpr, ctx = {}, extra = {}) => pixelRatioFor({ w, h, dpr, plan: resolutionPlan(QUALITY[tier], ctx), ...extra });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-3, `${msg}: ${a} vs ${b}`);

test('the chip class: the owner\'s RTX 4080 SUPER is ultra; RTX 3060 strong; integrated other; software software', () => {
  assert.equal(gpuClass(RTX4080S), 'ultra');
  assert.equal(gpuClass('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)'), 'strong');
  assert.equal(gpuClass('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), 'other');
  assert.equal(gpuClass('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))'), 'software');
  assert.equal(gpuClass(''), 'other');
});

test('phones keep their caps in Auto and Balanced: the same ratio as before for every tier, size and scale', () => {
  const sizes = [[390, 844, 3], [412, 915, 2.625], [768, 1024, 2], [844, 390, 3], [1024, 1366, 2]];
  for (const tier of ['low', 'medium', 'high']) for (const mode of ['auto', 'balanced']) for (const [w, h, dpr] of sizes) for (const scale of [1, 0.85, 0.72]) {
    near(ratio(tier, w, h, dpr, { mode, mobile: true, gpu: 'ultra' }, { scale }), oldRatio(QUALITY[tier], w, h, dpr, scale), `${tier} ${mode} ${w}x${h}@${dpr} x${scale}`);
  }
  assert.equal(QUALITY.low.maxPixels, 1.3e6); assert.equal(QUALITY.low.dpr, 1.0);
  assert.equal(QUALITY.medium.maxPixels, 2.6e6); assert.equal(QUALITY.medium.dpr, 1.25);
});

test('Balanced is the formula before 2026-11-28 everywhere; Auto too on Low, Medium and an ordinary card', () => {
  const sizes = [[1920, 1080, 1], [1920, 969, 1], [2560, 1440, 1], [3840, 2160, 1], [2560, 1440, 1.5], [1536, 864, 1.25], [3440, 1440, 1]];
  for (const tier of ['low', 'medium', 'high']) for (const [w, h, dpr] of sizes) for (const scale of [1, 0.85, 0.72]) {
    near(ratio(tier, w, h, dpr, { mode: 'balanced', gpu: 'ultra' }, { scale }), oldRatio(QUALITY[tier], w, h, dpr, scale), `balanced ${tier} ${w}x${h}@${dpr}`);
    near(ratio(tier, w, h, dpr, { mode: 'auto', gpu: 'strong' }, { scale }), oldRatio(QUALITY[tier], w, h, dpr, scale), `auto strong ${tier} ${w}x${h}@${dpr}`);
    if (tier !== 'high') near(ratio(tier, w, h, dpr, { mode: 'auto', gpu: 'ultra' }, { scale }), oldRatio(QUALITY[tier], w, h, dpr, scale), `auto ultra ${tier} ${w}x${h}@${dpr}`);
  }
});

test('Auto on High with a strong desktop card: the screen\'s own pixels, supersampled up to 4K-class when the screen is smaller', () => {
  const pc = { mode: 'auto', gpu: 'ultra' };
  near(ratio('high', 1920, 1080, 1, pc), 2, '1080p: drawn at 2x (3840x2160)');
  near(ratio('high', 2560, 1440, 1, pc), 1.5, '1440p: drawn at 1.5x');
  near(ratio('high', 3840, 2160, 1, pc), 1, '4K: native (it was 78 %)');
  near(oldRatio(QUALITY.high, 3840, 2160, 1), Math.sqrt(5e6 / (3840 * 2160)), 'before: 4K at 78 %');
  near(ratio('high', 2560, 1440, 1.5, pc), 1.5, '4K panel at 150 % scaling: native (it was 1.16 = 78 %)');
  // the governor's first step gives the supersampling up: native again
  near(ratio('high', 1920, 1080, 1, pc, { ssOn: false }), 1, '1080p without supersampling');
  near(ratio('high', 3840, 2160, 1, pc, { scale: 0.85 }), 0.85, 'a governor step below native still works in Auto');
  // never past 4K-class
  for (const [w, h, dpr] of [[1920, 1080, 1], [2560, 1440, 1], [2560, 1600, 1], [3440, 1440, 1], [5120, 2880, 1], [2560, 1440, 2]]) {
    const r = ratio('high', w, h, dpr, pc);
    assert.ok(w * h * r * r <= NATIVE_MAX * 1.0001, `${w}x${h}@${dpr} stays within 4K-class`);
    assert.ok(r >= Math.min(dpr, Math.sqrt(NATIVE_MAX / (w * h))) - 1e-9, `${w}x${h}@${dpr} never below native (or the 4K-class budget)`);
  }
});

test('supersampling only where the screen\'s pixels are big: none at devicePixelRatio 2 (a Retina laptop gets its own pixels)', () => {
  const pc = { mode: 'auto', gpu: 'ultra' };
  near(ratio('high', 1512, 982, 2, pc), 2, 'MacBook Pro (M3+) at 2x: native, no supersampling');
  near(oldRatio(QUALITY.high, 1512, 982, 2), Math.sqrt(5e6 / (1512 * 982)), 'before: capped to 5.0 M pixels (96 %)');
  near(ratio('high', 1536, 864, 1.25, pc), 1.25 * 2, 'a 1080p laptop at 125 %: drawn at 2x its pixels');
  near(ratio('high', 1280, 800, 2, { mode: 'sharp', gpu: 'ultra' }), 2, 'Sharp at 2x: native');
});

test('supersampling: at most 2x, nothing under 1.25x', () => {
  assert.equal(ssFactor(1920 * 1080), 2);
  assert.equal(ssFactor(2560 * 1440), 1.5);
  assert.equal(ssFactor(3840 * 2160), 1);
  assert.equal(ssFactor(3440 * 1440), 1.3);
  assert.equal(ssFactor(3200 * 1800), 1, 'under 1.25x: not taken');
  assert.equal(ssFactor(800 * 600), 2);
});

test('Sharp never draws below the screen\'s resolution, whatever the governor\'s scale; supersampled only on a strong desktop card', () => {
  for (const [w, h, dpr] of [[1920, 1080, 1], [3840, 2160, 1], [2560, 1440, 1.5], [390, 844, 3], [1366, 768, 1]]) for (const tier of ['low', 'medium', 'high']) for (const gpu of ['ultra', 'other']) for (const scale of [1, 0.72]) {
    const r = ratio(tier, w, h, dpr, { mode: 'sharp', gpu, mobile: w < 500 }, { scale });
    assert.ok(r >= Math.min(dpr, Math.sqrt(NATIVE_MAX / (w * h))) - 1e-9, `${tier} ${gpu} ${w}x${h}@${dpr} x${scale}: ${r}`);
  }
  near(ratio('medium', 1920, 1080, 1, { mode: 'sharp', gpu: 'other' }), 1, 'an ordinary card: native, not more');
  near(ratio('high', 1920, 1080, 1, { mode: 'sharp', gpu: 'ultra' }), 2, 'a strong card: supersampled like Auto');
  near(ratio('low', 390, 844, 3, { mode: 'sharp', gpu: 'other', mobile: true }), 3, 'a phone that asks for Sharp gets its own pixels');
});

test('the readout: the drawing buffer, the screen, and the share of it', () => {
  assert.deepEqual(resolutionInfo({ w: 2560, h: 1440, dpr: 1, pr: 1 }), { w: 2560, h: 1440, nativeW: 2560, nativeH: 1440, pct: 100 });
  assert.deepEqual(resolutionInfo({ w: 1920, h: 1080, dpr: 1, pr: 2 }), { w: 3840, h: 2160, nativeW: 1920, nativeH: 1080, pct: 200 });
  const old4k = resolutionInfo({ w: 3840, h: 2160, dpr: 1, pr: Math.sqrt(5e6 / (3840 * 2160)) });
  assert.equal(old4k.pct, 78);
  assert.equal(resolutionInfo({ w: 390, h: 844, dpr: 3, pr: 1 }).pct, 33);
  const t = buildReport({ res: { w: 3840, h: 2160, nativeW: 1920, nativeH: 1080, pct: 200, mode: 'auto', gpu: 'ultra' }, gpu: RTX4080S });
  assert.ok(t.includes('render: 3840x2160 = 200% of the screen\'s 1920x1080') && t.includes('resolution: auto') && t.includes('RTX 4080 SUPER'));
});

test('the saved choice: a page switch wins, anything unknown is Auto', () => {
  assert.deepEqual(RES_MODES, ['auto', 'sharp', 'balanced']);
  assert.equal(readResMode('sharp'), 'sharp');
  assert.equal(readResMode('bogus'), 'auto');          // (no localStorage in node: the default)
  assert.equal(resModeOf('balanced'), 'balanced');
  assert.equal(resModeOf(null), 'auto');
});
