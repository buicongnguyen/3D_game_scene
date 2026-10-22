// Where the time to a playable valley goes: the loading stages (ui.setLoad labels) and CPU self time by file and
// function, for an Explore start on the phone tier with the CPU slowed. (docs/play-zones/phase-2-zone-pilot.md)
//   GAME_URL=http://127.0.0.1:5897/ node tests/perf/valley-breakdown.mjs [--cpu=4] [--query=start=explore] [--from=Ready]
// (--from: profile only from that loading label on)
import { chromium } from 'playwright';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const url = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const cpu = +(args.cpu || 4), query = args.query || 'start=explore&slot=explore';
const b = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  window.__T__ = [];
  const mark = l => window.__T__.push([l, Math.round(performance.now())]);
  let g;
  Object.defineProperty(window, '__STARLINE__', { configurable: true, get: () => g, set(v) {
    g = v; mark('game');
    const ui = v.ui; const wrap = u => { const s = u.setLoad.bind(u); let last = ''; u.setLoad = (p, l) => { if (l !== last) { last = l; mark(l); } return s(p, l); }; };
    if (ui) wrap(ui); else { let u; Object.defineProperty(v, 'ui', { configurable: true, get: () => u, set(x) { u = x; wrap(x); } }); }
  } });
});
const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
if (!args.from) await cdp.send('Profiler.start');
await p.goto(`${url}?mute&qa=1&quality=low&${query}`);
if (args.from) { await p.waitForFunction(l => window.__T__?.some(t => t[0] === l), args.from, { timeout: 300000, polling: 20 }); await cdp.send('Profiler.start'); }
await p.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 300000 });
const playing = await p.evaluate(() => Math.round(performance.now()));
const { profile } = await cdp.send('Profiler.stop');
const T = await p.evaluate(() => window.__T__);
console.log('stages (ms from navigation):'); for (const [l, t] of T) console.log(`  ${String(t).padStart(6)}  ${l}`); console.log(`  ${String(playing).padStart(6)}  PLAYING`);
// self time per node
const dt = new Map(); const ts = profile.timeDeltas; for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) || 0) + (ts[i] || 0) / 1000);
const byFile = new Map(), byFn = new Map();
for (const n of profile.nodes) {
  const ms = dt.get(n.id) || 0; if (!ms) continue;
  const f = n.callFrame, file = (f.url.split('/').pop() || f.url || '(native)').replace(/\?.*$/, '') || '(' + f.functionName + ')';
  byFile.set(file, (byFile.get(file) || 0) + ms);
  const k = `${f.functionName || '(anon)'} ${file}:${f.lineNumber + 1}`; byFn.set(k, (byFn.get(k) || 0) + ms);
}
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `  ${String(Math.round(v)).padStart(6)} ms  ${k}`).join('\n');
console.log('self time by file:\n' + top(byFile, 15));
console.log('self time by function:\n' + top(byFn, 30));
await b.close();
