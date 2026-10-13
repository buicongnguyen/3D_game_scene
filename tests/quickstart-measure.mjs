// What a mini game costs to open from the title's Mini games list, on the phone tier.
//   GAME_URL=http://127.0.0.1:5898/ node tests/quickstart-measure.mjs [--games=trick:lifecycle,yard:marbles] [--quick=on|off] [--throttle=4] [--out=.tools/quick/measure.json]
// A 390x844 phone (touch, 2x), the CPU slowed 4x through the DevTools protocol, the Low tier, a cold cache. Each game is
// measured in a fresh browser context whose Explore save says the game was played before (so no teacher's first talk
// stands between the tap and the play; the level is named up front like the other suites do). It reports
//   boot      navigation -> the title can be used
//   tap->play the click on the game's card (as the page receives it) -> the second frame the game can be played in
//   requests / bytes  everything fetched from the navigation to that frame (transferred size)
//   heap      the JavaScript heap after a collection, three seconds into the game
//   calls     draw calls of a frame of the game; frame: the mean and worst frame time over those three seconds
// Run it against a production build (vite preview): a dev server serves hundreds of unbundled modules.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { exploreState } from '../src/game/fastforward.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const url = process.env.GAME_URL || 'http://127.0.0.1:5898/';
const GAMES = (args.games || 'trick:lifecycle,yard:marbles').split(',');
const THROTTLE = +(args.throttle || 4);
const QUICK = args.quick || '';                    // '' = the build's own default for a QA run
const OUT = args.out || '.tools/quick/measure.json';
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// an Explore save in which every measured game has been played once
const quest = exploreState();
for (const id of GAMES) {
  const [kind, ref] = id.split(':');
  if (kind === 'trick') quest.tricks[ref] = { learned: true, intro: true, best: 20, stars: 1, plays: 1, levels: { easy: { best: 20, stars: 1 } } };
  else { quest.yard ??= {}; quest.yard[ref] = { plays: 1, wins: 1, best: 1, stars: 1, total: 4, levels: { easy: { best: 1, stars: 1 } } }; }
}
const SAVE = JSON.stringify({ v: 1, quest, player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: 1760000000000 });

// (`shown`: the game's own picture is up; the board games then wait a moment of their own before the first turn)
const PLAYABLE = (id, shown = false) => {
  const fade = document.getElementById('fade');
  if (fade && (fade.classList.contains('on') || +getComputedStyle(fade).opacity > 0.05)) return false;
  const d = window.__STARLINE_QA__?.director;
  if (id.startsWith('trick:')) return !!document.querySelector('#lifeBoard .pick .lc-card');
  const hud = document.getElementById('yardHud');
  return !!hud && !hud.classList.contains('hidden') && (shown ? !!d?.yard?.round?.sim : ['aim', 'think'].includes(d?.yard?.round?.sim?.state));
};

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const rows = [];
for (const id of GAMES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(s => { if (!localStorage.getItem('starline-save-explore')) localStorage.setItem('starline-save-explore', s); }, SAVE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const net = { n: 0, bytes: 0, kinds: {} };
  const urls = new Map();
  cdp.on('Network.requestWillBeSent', e => urls.set(e.requestId, e.request.url));
  cdp.on('Network.loadingFinished', e => {
    const u = urls.get(e.requestId) || '';
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    const ext = (u.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] || 'html').toLowerCase();
    net.n++; net.bytes += e.encodedDataLength;
    const k = net.kinds[ext] ??= { n: 0, bytes: 0 };
    k.n++; k.bytes += e.encodedDataLength;
  });

  const t0 = Date.now();
  await page.goto(`${url}?mute&qa=1&quality=low${QUICK ? `&quick=${QUICK}` : ''}`);
  await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 300000, polling: 50 });
  const boot = Date.now() - t0;
  const atTitle = { n: net.n, bytes: net.bytes };
  await page.waitForTimeout(1500);
  await page.evaluate(() => { (window.__STARLINE_QA__ ??= {}).level = 'easy'; });
  await page.tap('#btnTitleMini');
  await page.waitForSelector('#mgPicker:not(.hidden)');
  const cats = await page.evaluate(() => [...document.querySelectorAll('.mg-tab')].map(t => t.dataset.cat));
  for (const c of cats) { await page.tap(`.mg-tab[data-cat=${c}]`); if (await page.$(`.mg-card[data-id="${id}"]`)) break; }
  await page.locator(`.mg-card[data-id="${id}"]`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  // timed inside the page, from the click the game receives to the second frame after the game can be played
  // (the test driver's own tap takes a second or two on a slowed CPU: that is not the game's time)
  await page.evaluate(([src, game]) => {
    const playable = (0, eval)(`(${src})`), m = window.__measure = { click: 0, shown: 0, play: 0 };
    addEventListener('click', e => { if (!m.click && e.target.closest?.('.mg-card')) { m.click = performance.now(); requestAnimationFrame(poll); } }, true);
    const poll = () => { if (!m.shown && playable(game, true)) m.shown = performance.now(); if (playable(game)) requestAnimationFrame(() => requestAnimationFrame(() => { m.play = performance.now(); })); else requestAnimationFrame(poll); };
  }, [PLAYABLE.toString(), id]);
  await page.tap(`.mg-card[data-id="${id}"]`);
  await page.waitForFunction(() => window.__measure.play > 0, null, { timeout: 300000, polling: 100 });
  const tapToPlay = Math.round(await page.evaluate(() => window.__measure.play - window.__measure.click));
  const tapToShown = Math.round(await page.evaluate(() => window.__measure.shown - window.__measure.click));
  const atPlay = { n: net.n, bytes: net.bytes, kinds: JSON.parse(JSON.stringify(net.kinds)) };
  // three seconds of the game itself
  const frames = await page.evaluate(() => new Promise(res => {
    const ts = []; let t = performance.now(), n = 0; const end = t + 3000;
    const f = now => { ts.push(now - t); t = now; n++; if (now < end) requestAnimationFrame(f); else res({ n, mean: ts.reduce((a, b) => a + b, 0) / ts.length, worst: Math.max(...ts.slice(2)) }); };
    requestAnimationFrame(f);
  }));
  const info = await page.evaluate(() => {
    const g = window.__STARLINE__, r = g?.renderer?.renderer, q = window.__STARLINE_QA__;
    const calls = q?.quick?.calls?.() ?? r?.info.render.calls ?? null;
    return { runtime: window.__STARLINE_RUNTIME__ || 'valley', calls, geometries: r?.info.memory.geometries ?? null, textures: r?.info.memory.textures ?? null, nodes: document.getElementsByTagName('*').length, valley: !!g?.world };
  });
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  await page.screenshot({ path: path.join(path.dirname(OUT), `measure-${QUICK || 'default'}-${id.replace(':', '_')}.png`) });
  const row = { id, runtime: info.runtime, valley: info.valley, bootMs: boot, tapToShownMs: tapToShown, tapToPlayMs: tapToPlay, requests: atPlay.n, bytes: atPlay.bytes, titleRequests: atTitle.n, titleBytes: atTitle.bytes,
    heapMB: +(heap / 1048576).toFixed(1), calls: info.calls, geometries: info.geometries, textures: info.textures, domNodes: info.nodes,
    frameMs: +frames.mean.toFixed(1), worstMs: +frames.worst.toFixed(1), kinds: atPlay.kinds, errors };
  rows.push(row);
  console.log(`${id}  runtime=${row.runtime} valley=${row.valley}  boot ${boot} ms  tap->shown ${tapToShown} ms  tap->play ${tapToPlay} ms  requests ${row.requests} (${(row.bytes / 1048576).toFixed(2)} MB; at the title ${atTitle.n}, ${(atTitle.bytes / 1048576).toFixed(2)} MB)  heap ${row.heapMB} MB  calls ${row.calls}  geo ${row.geometries} tex ${row.textures}  frame ${row.frameMs} ms (worst ${row.worstMs})`);
  console.log('   by kind: ' + Object.entries(atPlay.kinds).map(([k, v]) => `${k} ${v.n}/${(v.bytes / 1024).toFixed(0)}k`).join('  '));
  if (errors.length) console.log('   errors: ' + errors.join(' | '));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify({ url, quick: QUICK || 'default', throttle: THROTTLE, rows }, null, 1));
console.log(`written ${OUT}`);
