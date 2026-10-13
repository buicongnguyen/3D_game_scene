// What every mini game costs on the phone tier, measured the same way each time, so focus mode (src/engine/focus.js)
// can be re-measured later:
//   node tests/focus-perf-browser.mjs [--ids=yard:marbles,trick:kite] [--wait=6] [--secs=3] [--throttle=4]
//                                     [--out=.tools/focus-perf.json] [--before=.tools/focus-perf-before.json] [--shots=dir] [--base=1]
// --base=1 loads the game with ?focus=off&roundlight=off: every round is drawn and simulated the old way (the "before").
// A phone-sized page (390x844, touch, DPR 2, ?quality=low) starts each game from the Mini games menu, waits `wait`
// seconds into the round, then samples `secs` seconds with the CPU throttled `throttle` times:
//   calls / tris   renderer.info of a whole frame (the shadow pass and the post passes included), averaged over the
//                  sample: the Low tier draws its shadow map every 2nd or 3rd frame only, so single frames differ a lot
//   skinned        skinned meshes drawn (people, animals)
//   frame          ms of JavaScript per frame (Game.frame), split into update (simulation) and render (three.js)
//   raf            ms between frames as the page saw them (capped at 16.7 by the display)
//   focus          the focus mode the round is in, if any
// Headless Chromium on a desktop GPU hides the GPU's share: draw calls, triangles and the JS time are the honest part.
// With --before=<an earlier --out file> the table shows both runs side by side.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { stateAt } from './e2e/fastforward.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || '1']; }));
const url = process.env.GAME_URL || 'http://127.0.0.1:5895/';
const WAIT = +(args.wait || 6) * 1000, SECS = +(args.secs || 3), RATE = +(args.throttle || 4);
const SAVE = JSON.stringify({ v: 1, quest: stateAt('c1.cogs', 'alone', 'grandma'), player: { x: -40, y: 3, z: 20, facing: 3.1 }, at: 1760000000000 });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await ctx.addInitScript(s => { localStorage.setItem('starline-save-1', s); localStorage.setItem('starline-last-slot', '1'); }, SAVE);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);
const boot = async () => {
  await page.goto(`${url}?mute&qa=1&start=continue&slot=1&quality=low${args.base ? '&focus=off&roundlight=off' : ''}`);
  await page.waitForFunction(() => window.__STARLINE_READY__ && window.__STARLINE_PLAYING__, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    // time Game.frame and the renderer inside it (own-property wrappers on the instances: no source is touched)
    const g = window.__STARLINE__, P = window.__perf = { on: false, frame: [], render: [], raf: [], calls: [], tris: [], last: 0 };
    const frame = g.frame.bind(g), R = g.renderer, render = R.render.bind(R);
    let inRender = 0;
    R.render = (s, c) => { const t = performance.now(); render(s, c); inRender = performance.now() - t; };
    g.frame = () => {
      const t = performance.now();
      inRender = 0;
      frame();
      if (!P.on) { P.last = 0; return; }
      const dt = performance.now() - t, info = R.renderer.info.render;
      P.frame.push(dt); P.render.push(inRender); P.calls.push(info.calls); P.tris.push(info.triangles);
      if (P.last) P.raf.push(t - P.last);
      P.last = t;
    };
    window.__STARLINE_QA__.level = 'normal';
  });
};
await boot();

const world = await page.evaluate(() => window.__STARLINE__.director.minigameMenu.catalogue.map(e => e.id));
let ids = world;
if (args.ids) ids = ids.filter(i => args.ids.split(',').some(k => i === k || i.startsWith(k)));
const rows = [];
const TALK = ['trick:lifecycle', 'trick:crops'];
const sample = async () => {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const P = window.__perf; for (const k of ['frame', 'render', 'raf', 'calls', 'tris']) P[k].length = 0; P.last = 0; P.on = true; });
  await page.waitForTimeout(SECS * 1000);
  const r = await page.evaluate(() => {
    const P = window.__perf; P.on = false;
    const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
    const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const p95 = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.95)] : 0; };
    const g = window.__STARLINE__, d = g.director;
    let skinned = 0;
    const walk = o => { if (!o.visible) return; if (o.isSkinnedMesh) skinned++; for (const c of o.children) walk(c); };
    if (!g.focus?.hold) walk(g.focus ? g.focus.scene : g.scene);          // (in focus mode only the kept objects are drawn)
    return {
      n: P.frame.length, calls: Math.round(mean(P.calls)), tris: Math.round(mean(P.tris)), frame: med(P.frame), render: med(P.render), p95: p95(P.frame), raf: med(P.raf), skinned,
      focus: g.focus ? `${g.focus.mode}/${g.focus.sim || 'live'}` : '', hold: !!g.renderer.hold, light: !!g.roundLight?.on, level: g.renderer.appliedLevel || 0, bloom: !!g.renderer.bloom?.enabled,
      phase: d.tricks?.round?.ctx?.debug?.phase || d.yard?.round?.sim?.state || '',
    };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return r;
};

// the valley itself, standing still: what a round costs is to be read against this
{
  const r = await sample();
  rows.push({ id: '(free roam)', ...r });
  console.log(JSON.stringify(rows.at(-1)));
}
for (const id of ids) {
  await page.evaluate(i => { const m = window.__STARLINE__.director.minigameMenu; window.__run = m.launch(m.entry(i)); }, id);
  if (id.startsWith('trick:')) for (let k = 0; k < 40; k++) {
    if (await page.evaluate(() => !!window.__STARLINE__.director.tricks.round?.ctx)) break;
    await page.keyboard.press('e'); await page.waitForTimeout(450);
  }
  // a first play opens with a few words from the teacher (the card games): through them, to the game itself
  if (TALK.some(k => id === k)) for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(500);
    if (!(await page.evaluate(() => { const g = window.__STARLINE__; return g.director.busy > 0 || g.ui.dialogueOpen; }))) break;
    await page.keyboard.press('e');
  }
  await page.waitForTimeout(WAIT);
  const r = await sample();
  rows.push({ id, ...r });
  console.log(JSON.stringify(rows.at(-1)));
  if (args.shots) { fs.mkdirSync(args.shots, { recursive: true }); await page.screenshot({ path: path.join(args.shots, `${id.replace(/[:]/g, '_')}.png`) }); }
  let out = false;
  for (let k = 0; k < 6 && !out; k++) {
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    out = await page.evaluate(() => !window.__STARLINE__.director.minigameMenu.running);
    if (!out) await page.evaluate(() => { const g = window.__STARLINE__; if (g.paused) g.togglePause?.(false); });
  }
  if (!out) { console.log(id, 'did not leave: reload'); await boot(); } else await page.waitForTimeout(900);
}
await browser.close();

if (args.out) { fs.mkdirSync(path.dirname(args.out), { recursive: true }); fs.writeFileSync(args.out, JSON.stringify(rows, null, 1)); }
const before = args.before && fs.existsSync(args.before) ? Object.fromEntries(JSON.parse(fs.readFileSync(args.before, 'utf8')).map(r => [r.id, r])) : null;
const f1 = v => v.toFixed(1), k = v => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`);
const pad = (s, n) => `${s}`.padEnd(n);
console.log(`\nphone tier, 390x844, CPU x${RATE}; JS ms per frame = update + render`);
if (before) {
  console.log(`${pad('game', 22)}${pad('calls', 14)}${pad('triangles', 16)}${pad('skinned', 10)}${pad('JS ms/frame', 16)}${pad('update', 14)}${pad('render', 14)}focus`);
  for (const r of rows) {
    const b = before[r.id];
    const two = (fn, key) => (b ? `${fn(b[key])} > ${fn(r[key])}` : fn(r[key]));
    const upd = x => x.frame - x.render;
    console.log(`${pad(r.id, 22)}${pad(two(String, 'calls'), 14)}${pad(two(k, 'tris'), 16)}${pad(two(String, 'skinned'), 10)}${pad(two(f1, 'frame'), 16)}${pad(b ? `${f1(upd(b))} > ${f1(upd(r))}` : f1(upd(r)), 14)}${pad(two(f1, 'render'), 14)}${r.focus || (r.light ? 'round-light' : '-')}${r.hold ? ' (held)' : ''}`);
  }
} else {
  console.log(`${pad('game', 22)}${pad('calls', 7)}${pad('tris', 8)}${pad('skinned', 9)}${pad('JS ms', 8)}${pad('update', 8)}${pad('render', 8)}${pad('p95', 8)}${pad('raf', 7)}focus`);
  for (const r of rows) console.log(`${pad(r.id, 22)}${pad(r.calls, 7)}${pad(k(r.tris), 8)}${pad(r.skinned, 9)}${pad(f1(r.frame), 8)}${pad(f1(r.frame - r.render), 8)}${pad(f1(r.render), 8)}${pad(f1(r.p95), 8)}${pad(f1(r.raf), 7)}${r.focus || '-'}${r.hold ? ' (held)' : ''} ${r.phase}`);
}
if (errors.length) console.log('page errors:\n' + errors.join('\n'));
