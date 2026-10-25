// Where a frame's time goes while playing: a CPU profile of a few seconds of Explore at a busy place, with the
// frame times, the JS time per frame and the time spent per function and per source file.
// Run against an unminified build so the names mean something:
//   npx vite build --minify false --outDir .tools/dist-prof && node scripts/pack-models.mjs .tools/dist-prof/models
//   npx vite preview --outDir .tools/dist-prof --port 5898 --strictPort
//   GAME_URL=http://127.0.0.1:5898/ node tests/perf/frame-profile.mjs [--quality=low] [--cpu=4] [--spot=kawabe] [--secs=5]
import { chromium } from 'playwright';
import { exploreState } from '../../src/game/fastforward.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const url = process.env.GAME_URL || 'http://127.0.0.1:5898/';
const q = args.quality || 'low', cpu = +(args.cpu || 4), secs = +(args.secs || 5);
const SPOTS = { kawabe: [-26, 20, -20, 37], takamori: [110, -16, 123, 12], station: [-98, 104, -60, 140] };
const [x, z, lx, lz] = SPOTS[args.spot || 'kawabe'];
const SAVE = JSON.stringify({ v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: 1760000000000 });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext(q === 'low' ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(s => localStorage.setItem('starline-save-explore', s), SAVE);
const page = await ctx.newPage();
await page.goto(`${url}?mute&qa=1&quality=${q}&start=explore&slot=explore`);
await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__?.teleport, null, { timeout: 240000 });
await page.evaluate(([x, z, lx, lz]) => { const g = window.__STARLINE__; g.seasonOverride = 'summer'; g.timeOverride = 11; g.applyLook(); const qa = window.__STARLINE_QA__; qa.teleport(x, z); qa.faceToward(lx, lz); }, [x, z, lx, lz]);
// --level=N: start N steps down the governor's ladder (engine/governor.js), to see what a step buys
if (args.level) await page.evaluate(n => { const r = window.__STARLINE__.renderer; r.setFloor(n); }, +args.level);
await page.waitForTimeout(4000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
await page.waitForTimeout(1500);
// frame times and the JS time inside the game's own frame, for the same seconds as the profile
await page.evaluate(() => {
  const g = window.__STARLINE__, f = g.frame.bind(g), m = window.__fp = { js: [], gaps: [], last: 0 };
  g.frame = function () { const t = performance.now(); if (m.last) m.gaps.push(t - m.last); m.last = t; f(); m.js.push(performance.now() - t); };
});
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start');
await page.waitForTimeout(secs * 1000);
const { profile } = await cdp.send('Profiler.stop');
const fr = await page.evaluate(() => { const m = window.__fp; const s = a => [...a].sort((p, q) => p - q), md = a => s(a)[Math.floor(a.length / 2)], p90 = a => s(a)[Math.floor(a.length * 0.9)];
  return { frames: m.gaps.length, gap50: md(m.gaps), gap90: p90(m.gaps), js50: md(m.js), js90: p90(m.js), calls: window.__STARLINE__.lastInfo?.calls, tier: window.__STARLINE__.renderer.appliedLevel || 0, scale: window.__STARLINE__.renderer.scale }; });
console.log(`${q} @ ${args.spot || 'kawabe'}, CPU ${cpu}x, ${secs}s: ${fr.frames} frames; frame gap median ${fr.gap50.toFixed(1)} ms (p90 ${fr.gap90.toFixed(1)}); JS in game.frame median ${fr.js50.toFixed(1)} ms (p90 ${fr.js90.toFixed(1)}); calls ${fr.calls}; governor level ${fr.tier}, scale ${fr.scale}`);
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
await browser.close();
