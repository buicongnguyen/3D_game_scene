// Where a frame's time goes while playing: a CPU profile of a few seconds of Explore at a busy place, with the
// frame times, the JS time per frame and the time spent per function and per source file.
// Run against an unminified build so the names mean something:
//   npx vite build --minify false --outDir .tools/dist-prof && node scripts/pack-models.mjs .tools/dist-prof/models
//   npx vite preview --outDir .tools/dist-prof --port 5898 --strictPort
//   GAME_URL=http://127.0.0.1:5898/ node tests/perf/frame-profile.mjs [--quality=low] [--cpu=4] [--spot=kawabe] [--secs=5]
import { chromium } from 'playwright';
import { exploreState } from '../../src/game/fastforward.js';
import { addSwitches, sceneCounts, writeReport, prepareScenery, watchResources, validateResources, validateScene } from './support.mjs';
import { installFrameRecorder, summarizeFrames } from './frame-recorder.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const url = process.env.GAME_URL || 'http://127.0.0.1:5898/';
const q = args.quality || 'low', cpu = +(args.cpu || 4), secs = +(args.secs || 5);
const warmup = +(args.warmup ?? 4), settle = +(args.settle ?? 1.5);
if (!['low', 'medium', 'high'].includes(q) || ![cpu, secs, warmup, settle].every(Number.isFinite) || cpu < 1 || secs <= 0 || warmup < 0 || settle < 0) throw Error('Invalid quality/cpu/secs/warmup/settle');
const SPOTS = { kawabe: [-26, 20, -20, 37], takamori: [110, -16, 123, 12], station: [-98, 104, -60, 140] };
const [x, z, lx, lz] = SPOTS[args.spot || 'kawabe'];
const SAVE = JSON.stringify({ v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: 1760000000000 });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const report = { helperVersion: 2, kind: 'frame-profile', base: url, quality: q, spot: args.spot || 'kawabe', cpu, seconds: secs, warmupSeconds: warmup, settleSeconds: settle, lockQuality: args['lock-quality'] === '1', switches: { cells: args.cells || 'default', pace: args.pace || 'default' }, errors: [] };
let page, cdp, profilerRunning = false;
try {
const ctx = await browser.newContext(q === 'low' ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(s => localStorage.setItem('starline-save-explore', s), SAVE);
page = await ctx.newPage();
watchResources(page, report);
await page.goto(addSwitches(`${url}?mute&qa=1&quality=${q}&start=explore&slot=explore`, args));
await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__?.teleport, null, { timeout: 240000 });
await page.evaluate(([x, z, lx, lz]) => { const g = window.__STARLINE__; g.seasonOverride = 'summer'; g.timeOverride = 11; g.applyLook(); const qa = window.__STARLINE_QA__; qa.teleport(x, z); qa.faceToward(lx, lz); }, [x, z, lx, lz]);
// --level=N: start N steps down the governor's ladder (engine/governor.js), to see what a step buys
if (args.level) await page.evaluate(n => { const r = window.__STARLINE__.renderer; r.setFloor(n); }, +args.level);
// --lock-quality=1: the requested tier at level 0 / scale 1 for the entire sample. Pacing is independent.
if (report.lockQuality) await page.evaluate(() => {
  const r = window.__STARLINE__.renderer; r.fixedScale = false; r.floor = 0;
  if (r.governor) { r.governor.level = 0; r.applyLevel(); }
  r.scale = 1; r.fixedScale = true; r.resize();
});
report.readiness = await prepareScenery(page);
await page.waitForTimeout(warmup * 1000);
cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
await page.waitForTimeout(settle * 1000);
// CDP setup is outside the frame window. Raw CPU profiles also contain the explicitly reported control padding.
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
await page.evaluate(installFrameRecorder);
await cdp.send('Profiler.start'); profilerRunning = true;
await page.evaluate(() => window.__fp.begin());
await page.waitForTimeout(secs * 1000);
const samples = await page.evaluate(() => window.__fp.stop());
const { profile } = await cdp.send('Profiler.stop');
profilerRunning = false;
const fr = summarizeFrames(samples);
report.samples = samples;
report.profileWindow = { durationMs: (profile.endTime - profile.startTime) / 1000, activeFrameWindowMs: samples.durationMs,
  controlPaddingMs: (profile.endTime - profile.startTime) / 1000 - samples.durationMs,
  note: 'Function/file samples include control padding; frame wall-time medians include only the gated active window.' };
report.frame = fr;
report.scene = await page.evaluate(sceneCounts);
validateScene(report.scene, { cells: args.cells, allowLegacy: args['allow-legacy'] === '1' }); validateResources(report);
if ((report.lockQuality || args['require-stable-quality'] === '1') && !fr.quality.stable) throw Error('Quality changed during the sample');
if (report.lockQuality && (fr.tier !== 0 || fr.scale !== 1)) throw Error('Requested level 0 / scale 1 lock was not maintained');
console.log(`visible objects ${report.scene.visible.objects}/${report.scene.total.objects}; renderables ${report.scene.visible.renderables}; skinned ${report.scene.visible.skinned}; cells ${report.scene.visible.cells}/${report.scene.total.cells}`);
console.log(`${q} @ ${args.spot || 'kawabe'}, CPU ${cpu}x, ${secs}s: ${fr.frames} frames (${fr.gapCount} gaps); frame gap median ${fr.gap50.toFixed(1)} ms (p90 ${fr.gap90.toFixed(1)}); wall time in game.frame median ${fr.js50.toFixed(1)} ms (p90 ${fr.js90.toFixed(1)}); calls mean ${fr.drawCalls.mean.toFixed(1)}; governor level ${fr.tier}, scale ${fr.scale}; quality stable ${fr.quality.stable}`);
// self and total time per function (total = self + everything it called)
const dt = new Map(); for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) || 0) + (profile.timeDeltas[i] || 0) / 1000);
const kids = new Map(profile.nodes.map(n => [n.id, n.children || []])), byId = new Map(profile.nodes.map(n => [n.id, n]));
const totalOf = new Map(); const tot = id => { if (totalOf.has(id)) return totalOf.get(id); let t = dt.get(id) || 0; for (const c of kids.get(id)) t += tot(c); totalOf.set(id, t); return t; };
const self = new Map(), total = new Map(), files = new Map();
const name = n => `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url.split('/').pop() || '').replace(/-[\w-]{8}\.js$/, '.js')}:${n.callFrame.lineNumber + 1}`;
for (const n of profile.nodes) {
  const k = name(n), s = dt.get(n.id) || 0;
  self.set(k, (self.get(k) || 0) + s);
  // a function's total counts once per call path that is not inside itself
  let p = [...byId.values()].find(o => (o.children || []).includes(n.id)); while (p && name(p) !== k) p = [...byId.values()].find(o => (o.children || []).includes(p.id));
  if (!p) total.set(k, (total.get(k) || 0) + tot(n.id));
  const f = (n.callFrame.url.split('/').pop() || `(${n.callFrame.functionName})`).replace(/-[\w-]{8}\.js$/, '.js');
  files.set(f, (files.get(f) || 0) + s);
}
const all = [...dt.values()].reduce((a, b) => a + b, 0), per = v => (v / fr.frames).toFixed(2);
report.sampledMs = all;
report.self = [...self].sort((a, b) => b[1] - a[1]).map(([name, ms]) => ({ name, msPerFrame: ms / fr.frames }));
report.total = [...total].sort((a, b) => b[1] - a[1]).map(([name, ms]) => ({ name, msPerFrame: ms / fr.frames }));
report.files = [...files].sort((a, b) => b[1] - a[1]).map(([name, ms]) => ({ name, msPerFrame: ms / fr.frames }));
if (args.profile) writeReport(args.profile, profile);
const show = (m, n, label) => console.log(`${label} (ms per frame):\n` + [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `  ${per(v).padStart(6)}  ${k}`).join('\n'));
console.log(`sampled ${all.toFixed(0)} ms in ${fr.frames} frames`);
show(files, 12, 'self time by file');
show(self, 25, 'self time by function');
show(new Map([...total].filter(([k]) => !/^\((root|program|idle|garbage)/.test(k))), 30, 'total time by function');
// --expand=file.js:line (as printed above): the time inside that function, split by what it calls directly
if (args.expand) {
  const want = args.expand, kidsOf = new Map();
  for (const n of profile.nodes) if (name(n).endsWith(' ' + want) || name(n).split(' ').pop() === want) for (const c of n.children || []) { const k = name(byId.get(c)); kidsOf.set(k, (kidsOf.get(k) || 0) + tot(c)); }
  show(kidsOf, 20, `inside ${want}`);
}
report.passed = true;
} catch (e) { report.passed = false; report.failure = e.stack || String(e); throw e; }
finally {
  if (page && !page.isClosed()) await page.evaluate(() => window.__fp?.restore()).catch(() => {});
  if (profilerRunning && cdp) await cdp.send('Profiler.stop').catch(() => {});
  await browser.close();
  try { validateResources(report); } catch (e) { report.passed = false; report.failure ||= e.message; }
  writeReport(args.out, report);
}
validateResources(report);
