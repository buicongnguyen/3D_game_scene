// The phone videos in a real browser (a phone-sized, touch, Low-tier page): the title's looping backdrop, the scene
// tour as video, and the new game's arrival as video.
//   node tests/video-browser.mjs [--only=title|tour|pause|fallback|intro] [--out=.tools/review/video] [--shots=0]
// Uses GAME_URL if set; otherwise starts vite on port 5831.
// Needs a browser that decodes H.264: Playwright's own Chromium does not, so this runs Microsoft Edge or Google
// Chrome through Playwright (channel msedge / chrome). Without one of them it stops with exit code 2.
//
// It checks that
//   • the title shows its clip under the menu and the 3D renderer stands still meanwhile;
//   • the tour plays as video with the same picker, captions and toolbar: next / previous seek to the right stop,
//     pause, season buttons, the whole year running on from clip to clip, Replay at the end, Back;
//   • nothing of the game changes while a video tour runs (no season change, no throwaway story, the game stays
//     paused where it was), no save is written, and afterwards every save file and the whole state is as before;
//   • a clip that cannot be fetched hands over to the live tour by itself;
//   • the arrival clip plays with the live captions and a Skip button, and when it ends (or is skipped) the game is in
//     exactly the state the live cutscene leaves it in.
import { createRequire } from 'module';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { stateAt } from './e2e/fastforward.mjs';
import { TOURS, TOUR } from '../src/content/tour.js';
import { CAPTIONS } from '../src/game/story.js';
import { useStory } from '../src/game/stories/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const OUT = path.resolve(ROOT, args.out || '.tools/review/video');
const SHOTS = args.shots !== '0';
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(ROOT, 'node_modules/playwright'));
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, 'public/video/manifest.json'), 'utf8'));

let browser = null;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel, headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=document-user-activation-required'] }); break; } catch { /* try the next */ }
}
if (!browser) { console.error('No H.264 browser (Edge or Chrome) for Playwright: the video checks cannot run here.'); process.exit(2); }

let server = null, url = process.env.GAME_URL;
if (!url) {
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', '5831', '--strictPort'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, NO_HMR: '1' } });
  url = 'http://127.0.0.1:5831/';
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 60000);
    const seen = d => { if (/ready|Local/.test(String(d))) { clearTimeout(t); res(); } };
    server.stdout.on('data', seen); server.stderr.on('data', seen);
    server.on('exit', code => rej(new Error(`vite exited ${code}`)));
  });
}

const SAVE = JSON.stringify({ v: 1, quest: stateAt('c1.cogs', 'alone', 'grandma'), player: { x: -40, y: 3, z: 20, facing: 3.1 }, at: 1760000000000 });
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' };
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } };
const stable = s => JSON.stringify(s);
const same = (a, b, what) => { for (const k of Object.keys(a)) if (stable(a[k]) !== stable(b[k])) check(false, `${what}: ${k} changed\n      before ${stable(a[k]).slice(0, 300)}\n      after  ${stable(b[k]).slice(0, 300)}`); };

/** Everything a tour must leave alone, as plain data. */
const SNAP = () => {
  const g = window.__STARLINE__, d = g.director, p = g.player, r = (v, n = 3) => +(+v).toFixed(n);
  const ls = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
  const hid = id => document.getElementById(id)?.classList.contains('hidden') ?? true;
  window.__refs ??= {};
  const ref = (k, v) => { if (!(k in window.__refs)) window.__refs[k] = v; return window.__refs[k] === v; };
  return {
    ls, quest: d.quest ? JSON.stringify(d.quest.save()) : null, questSame: ref('quest', d.quest ?? null),
    player: [r(p.pos.x), r(p.pos.y), r(p.pos.z), r(p.facing), p.root.visible, Object.hasOwn(p, 'update')],
    season: g.time.season, hour: r(g.time.hour, 4), shownSeason: g.shownSeason, seasonOverride: g.seasonOverride ?? null, timeOverride: g.timeOverride ?? null, weatherOff: !!g.weatherOff, weather: g.fx.weatherKind ?? null,
    viewFocus: g.viewFocus ?? null, beforeUpdateSame: ref('beforeUpdate', g.beforeUpdate ?? null), paused: g.paused, fovBase: g.follow.fovBase,
    lamps: [...g.structures.lamps.entries()].map(([id, L]) => [id, L.target, r(L.lit)]),
    rail: [!!g.railway.repaired, r(g.railway.train.s), g.railway.train.target], decor: g.celebrate?.decor?.level ?? 0, busy: d.busy, tourLock: !!d.tourLock,
    shadowed: ['save', 'canSave', 'canAim', 'event', 'run', 'say', 'collect'].filter(k => Object.hasOwn(d, k)).join() + (Object.hasOwn(g, 'togglePause') ? ',togglePause' : '') + (Object.hasOwn(g.ui, 'openJournal') ? ',openJournal' : ''),
    children: g.scene.children.length,
    screen: { hud: hid('hud'), touch: hid('touch'), title: hid('title'), overlay: g.ui.overlay, bodyTour: document.body.classList.contains('tour-on') },
  };
};
/** What the video layer and the renderer are doing. */
const VID = () => {
  const g = window.__STARLINE__, v = document.getElementById('sceneVideo'), t = g.tour;
  const cap = document.querySelector('#tourView .tour-caption');
  return { hold: !!g.renderer.hold, held: g.renderer.held || 0, frame: g.renderer.renderer.info.render.frame, src: v?.currentSrc?.split('/').pop() || '', t: v?.currentTime ?? -1, paused: v?.paused ?? true, shown: !!v && v.classList.contains('on') && !v.classList.contains('hidden'),
    owner: g.videoLayer?.owner === g.titleLoop && !!g.titleLoop ? 'title' : g.videoLayer?.owner === t && !!t ? 'tour' : g.videoLayer?.owner ? 'other' : null, w: v?.videoWidth || 0, h: v?.videoHeight || 0,
    tour: t?.debug?.() || null, cap: cap && !cap.classList.contains('off') ? cap.textContent : '', main: document.querySelector('#tourView [data-do=pause]')?.textContent || '' };
};

async function boot(query, opts = {}) {
  const ctx = await browser.newContext(PHONE);
  await ctx.addInitScript(save => { if (!localStorage.getItem('starline-save-1')) { localStorage.setItem('starline-save-1', save); localStorage.setItem('starline-last-slot', '1'); } }, SAVE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  if (opts.block) await page.route(opts.block, r => r.abort());
  await page.goto(`${url}?mute&qa=1${query ? '&' + query : ''}`);
  await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
  return { ctx, page, errors };
}
const shot = (page, name) => (SHOTS ? page.screenshot({ path: path.join(OUT, `${name}.png`) }) : null);
/** The renderer draws nothing over `ms`: the frame counter stands still while held frames pile up. */
async function idle(page, ms = 700) {
  const a = await page.evaluate(VID);
  await page.waitForTimeout(ms);
  const b = await page.evaluate(VID);
  return { ok: a.hold && b.hold && b.frame === a.frame && b.held > a.held + 5, a, b };
}
const waitVid = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true).catch(() => false);
const playing = (page, file) => waitVid(page, f => { const v = document.getElementById('sceneVideo'); return !!v && v.currentSrc.endsWith(f) && !v.paused && v.currentTime > 0.3 && window.__STARLINE__.renderer.hold; }, file);

// ---------------------------------------------------------------- the title and the tour from it
async function titleAndTour() {
  log('title loop and video tour (phone, portrait)');
  const { ctx, page, errors } = await boot('');
  check(await page.evaluate(() => window.__STARLINE__.renderer.qualityName) === 'low', 'the phone page runs the Low tier');
  check(await playing(page, 'title-tall.mp4'), 'the title shows its looping clip');
  let v = await page.evaluate(VID);
  check(v.owner === 'title' && v.w === 540 && v.h === 960, `the tall cut plays on a portrait screen (${v.w}x${v.h})`);
  check((await idle(page)).ok, 'the renderer stands still under the title clip');
  check(await page.locator('#btnNew').isVisible() && await page.locator('#btnTitleTour').isVisible(), 'the menu is on top of the clip');
  const z = await page.evaluate(() => { const r = document.getElementById('btnNew').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id; });
  check(z === 'btnNew', `a tap on the menu reaches the menu (${z})`);
  await page.waitForTimeout(1200);
  await shot(page, 'p-title-video');
  const before = await page.evaluate(SNAP);

  await page.tap('#btnTitleTour');
  await page.waitForSelector('#tourPick:not(.hidden)');
  await page.waitForSelector('#tourPick .tour-live:not(.hidden)', { timeout: 10000 }).catch(() => {});
  const box = await page.evaluate(() => ({ shown: !document.querySelector('#tourPick .tour-live').classList.contains('hidden'), checked: document.getElementById('tourLive').checked, text: document.querySelector('#tourPick .tour-live').textContent.trim() }));
  check(box.shown && !box.checked && box.text.length > 5, `the picker offers "Live 3D", off by default on a phone (${stable(box)})`);
  await shot(page, 'p-picker-video');
  await page.tap('#tourPick [data-tour=spring]');
  check(await playing(page, 'tour-spring-tall.mp4'), 'the spring tour plays as video');
  v = await page.evaluate(VID);
  check(v.tour.mode === 'video' && v.tour.active && v.owner === 'tour', `the tour is in video mode (${stable(v.tour)})`);
  const during = await page.evaluate(SNAP);
  check(during.quest === null && during.seasonOverride === before.seasonOverride && during.shownSeason === before.shownSeason && stable(during.lamps) === stable(before.lamps) && during.children === before.children && during.player[4] === before.player[4],
    'a video tour does not touch the valley: no story, no season change, lamps and scene as they were');
  check(during.tourLock && stable(during.ls) === stable(before.ls), 'saving is locked and no save file changed');
  check((await idle(page)).ok, 'the renderer stands still while the tour clip plays');
  const clip = MANIFEST.clips['tour-spring-tall'], spring = TOUR.spring;
  await waitVid(page, l => document.querySelector('#tourView .tour-caption')?.textContent.includes(l), spring.stops[0].line);
  v = await page.evaluate(VID);
  check(v.cap.includes(spring.stops[0].line) && v.cap.includes('Kawabe'), `the first stop's caption is live over the clip (${v.cap.slice(0, 60)})`);
  await page.waitForTimeout(900);
  await shot(page, 'p-tour-spring-0');

  // next / previous seek to the stops of the manifest
  for (const i of [1, 2, 3]) {
    await page.tap('#tourView [data-do=next]');
    const ok = await waitVid(page, ([l, t]) => { const v = document.getElementById('sceneVideo'); return document.querySelector('#tourView .tour-caption:not(.off)')?.textContent.includes(l) && Math.abs(v.currentTime - t) < 1.2 && !v.seeking; }, [spring.stops[i].line, clip.stops[i].t]);
    v = await page.evaluate(VID);
    check(ok && v.tour.stop === i && v.tour.kind === 'dwell', `next goes to stop ${i} at ${clip.stops[i].t} s (video at ${v.t.toFixed(2)} s, caption "${v.cap.slice(0, 50)}")`);
    if (i === 2) { await page.waitForTimeout(1000); await shot(page, 'p-tour-spring-2-dock'); }
  }
  // previous: first back to the start of this stop (it has been resting a while), then to the stop before
  await page.tap('#tourView [data-do=prev]');
  await waitVid(page, t => Math.abs(document.getElementById('sceneVideo').currentTime - t) < 1.2, clip.stops[3].t);
  await page.tap('#tourView [data-do=prev]');
  await waitVid(page, t => Math.abs(document.getElementById('sceneVideo').currentTime - t) < 1.2 && window.__STARLINE__.tour.debug().stop === 2, clip.stops[2].t);
  v = await page.evaluate(VID);
  check(v.tour.stop === 2, `previous goes back to stop 2 (${v.tour.stop})`);
  // pause and resume
  await page.tap('#tourView [data-do=pause]');
  await page.waitForTimeout(300);
  const p1 = await page.evaluate(VID);
  await page.waitForTimeout(500);
  const p2 = await page.evaluate(VID);
  check(p1.paused && p1.tour.paused && p2.t === p1.t && p1.main === 'Resume', `pause holds the clip (${p1.t} → ${p2.t})`);
  await page.tap('#tourView [data-do=pause]');
  await waitVid(page, t => document.getElementById('sceneVideo').currentTime > t + 0.2, p2.t);
  check(!(await page.evaluate(VID)).paused, 'resume plays on');
  // a season button switches the clip
  await page.tap('#tourView .tour-seasons [data-tour=night]');
  check(await playing(page, 'tour-night-tall.mp4'), 'the Night button switches to the night clip');
  await page.evaluate(t => { document.getElementById('sceneVideo').currentTime = t; }, MANIFEST.clips['tour-night-tall'].stops.at(-1).t + 3);
  await waitVid(page, l => document.querySelector('#tourView .tour-caption:not(.off)')?.textContent.includes(l), TOUR.night.stops.at(-1).line);
  await page.waitForTimeout(700);
  await shot(page, 'p-tour-night-7-hill');
  // the end of a single tour: Replay
  await page.evaluate(() => { const v = document.getElementById('sceneVideo'); v.currentTime = v.duration - 0.5; });
  check(await waitVid(page, () => window.__STARLINE__.tour.done), 'the clip ends: the tour is done');
  v = await page.evaluate(VID);
  check(v.main === 'Replay' && v.tour.paused, 'the main button offers Replay at the end');
  await page.tap('#tourView [data-do=pause]');
  check(await waitVid(page, () => { const v = document.getElementById('sceneVideo'); return !window.__STARLINE__.tour.done && !v.paused && v.currentTime < 3 && v.currentTime > 0.2; }), 'Replay starts the clip again');
  // every button is finger-sized and on screen
  const boxes = await page.evaluate(() => [...document.querySelectorAll('#tourView button')].map(b => { const r = b.getBoundingClientRect(); return [r.width, r.height, r.left, r.right, r.bottom]; }));
  check(boxes.every(b => b[0] >= 43.5 && b[1] >= 43.5 && b[2] >= 0 && b[3] <= 390.5 && b[4] <= 844), 'toolbar buttons are 44 px and on screen');
  // Back: the title and its clip return, everything as before
  await page.tap('#tourView [data-do=back]');
  same(before, await page.evaluate(SNAP), 'title, after the video tour');
  check(await playing(page, 'title-tall.mp4'), 'the title clip plays again after the tour');
  check(await page.locator('#btnNew').isVisible(), 'the title menu is back');

  // the whole year runs on from clip to clip
  await page.tap('#btnTitleTour');
  await page.waitForSelector('#tourPick:not(.hidden)');
  await page.tap('#tourPick [data-tour=year]');
  check(await playing(page, 'tour-spring-tall.mp4'), 'the whole year starts with spring');
  await page.evaluate(() => { const v = document.getElementById('sceneVideo'); v.currentTime = v.duration - 1.2; });
  check(await playing(page, 'tour-summer-tall.mp4'), 'spring runs on into summer');
  v = await page.evaluate(VID);
  check(v.tour.tour === 'summer' && v.tour.year, 'the tour knows it is summer now');
  await page.waitForTimeout(1500);
  await shot(page, 'p-tour-summer-0');
  // turning the phone: the other cut takes over at the same moment
  await page.evaluate(() => { document.getElementById('sceneVideo').currentTime = 20; });
  await waitVid(page, () => window.__STARLINE__.tour.debug().t > 19.9);
  await page.setViewportSize({ width: 844, height: 390 });
  check(await playing(page, 'tour-summer-wide.mp4'), 'turned sideways, the wide cut takes over');
  v = await page.evaluate(VID);
  check(v.t > 18 && v.t < 26, `…at the same moment (${v.t.toFixed(1)} s)`);
  await page.waitForTimeout(800);
  await shot(page, 'l-tour-summer-wide');
  await page.setViewportSize({ width: 390, height: 844 });
  await playing(page, 'tour-summer-tall.mp4');
  // "Live 3D" in the picker: the real flight on the phone
  await page.tap('#tourView [data-do=back]');
  await page.tap('#btnTitleTour');
  await page.waitForSelector('#tourPick:not(.hidden)');
  await page.tap('#tourPick .tour-live');
  await page.tap('#tourPick [data-tour=autumn]');
  await page.waitForFunction(() => window.__STARLINE__.tour.active);
  await page.waitForTimeout(1200);
  v = await page.evaluate(VID);
  check(v.tour.mode === 'live' && !v.hold && !v.shown, `with "Live 3D" ticked the tour flies live (${v.tour.mode}, hold ${v.hold})`);
  const f0 = v.frame;
  await page.waitForTimeout(500);
  check((await page.evaluate(VID)).frame > f0, 'the renderer draws again for the live tour');
  await shot(page, 'p-tour-live-autumn');
  await page.tap('#tourView [data-do=back]');
  await page.waitForTimeout(300);
  const after = await page.evaluate(SNAP);
  check(after.ls['starline-opt-tourLive'] === 'true', 'the choice is remembered');
  delete after.ls['starline-opt-tourLive'];
  // (the live tour wakes the pooled wildlife once: those objects stay in the scene, switched off; tests/tour-browser.mjs)
  same({ ...before, children: 0 }, { ...after, children: 0 }, 'title, after video and live tours');
  for (const e of new Set(errors)) check(false, `title/tour: console error: ${e}`);
  await ctx.close();
}

// ---------------------------------------------------------------- from the pause menu
async function fromPause() {
  log('video tour from the pause menu');
  const { ctx, page, errors } = await boot('start=continue&slot=1');
  await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 60000 });
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => window.__STARLINE_QA__.state());
    if (s.dlg) { await page.keyboard.press('KeyE'); await page.waitForTimeout(200); continue; }
    if (!s.busy && !s.running) break;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  await page.tap('#btnMenu');
  await page.waitForSelector('#pause:not(.hidden)');
  const before = await page.evaluate(SNAP);
  await page.tap('#btnPauseSettings'); await page.tap('#btnTour');
  await page.waitForSelector('#tourPick:not(.hidden)');
  await page.waitForSelector('#tourPick .tour-live:not(.hidden)', { timeout: 10000 }).catch(() => {});
  await page.tap('#tourPick [data-tour=winter]');
  check(await playing(page, 'tour-winter-tall.mp4'), 'the winter tour plays as video from the pause menu');
  const during = await page.evaluate(SNAP);
  check(during.paused && during.questSame && during.quest === before.quest && during.shownSeason === before.shownSeason && during.player[4] === before.player[4] && during.screen.hud,
    'the game stays paused and untouched under the clip (same story object, same season, Mika where she was)');
  check((await idle(page)).ok, 'the renderer stands still');
  await page.waitForTimeout(1500);
  await shot(page, 'p-pause-tour-winter');
  await page.tap('#tourView [data-do=next]');
  await page.waitForTimeout(600);
  await page.tap('#tourView [data-do=back]');
  const after = await page.evaluate(SNAP);
  same(before, after, 'pause menu, after the video tour');
  check(after.screen.overlay === 'pause' && after.paused, 'back in the pause menu');
  const v = await page.evaluate(VID);
  check(!v.hold && !v.shown, 'the clip is gone and the renderer draws again');
  await page.tap('#btnResume');
  await page.waitForTimeout(1200);
  const live = await page.evaluate(() => { const g = window.__STARLINE__; return { paused: g.paused, step: g.director.quest.state.step, canSave: g.director.canSave(), hud: !document.getElementById('hud').classList.contains('hidden'), frame: g.renderer.renderer.info.render.frame }; });
  check(!live.paused && live.step === 'c1.cogs' && live.canSave && live.hud, `the game goes on (${stable(live)})`);
  for (const e of new Set(errors)) check(false, `pause: console error: ${e}`);
  await ctx.close();
}

// ---------------------------------------------------------------- a clip that cannot be fetched
async function fallback() {
  log('fallback to the live tour when the clip cannot load');
  const { ctx, page, errors } = await boot('', { block: '**/video/tour-*.mp4' });
  await playing(page, 'title-tall.mp4');
  const before = await page.evaluate(SNAP);
  await page.tap('#btnTitleTour');
  await page.waitForSelector('#tourPick .tour-live:not(.hidden)', { timeout: 10000 }).catch(() => {});
  await page.tap('#tourPick [data-tour=autumn]');
  const ok = await waitVid(page, () => { const t = window.__STARLINE__.tour; return t.active && t.mode === 'live' && t.tour.id === 'autumn'; }, null, 25000);
  check(ok, 'the tour went live by itself');
  await page.waitForTimeout(1500);
  const v = await page.evaluate(VID);
  check(!v.hold && !v.shown && v.tour.mode === 'live' && v.cap.includes(TOUR.autumn.stops[0].line), `live: the renderer draws, the caption is up (${stable({ hold: v.hold, shown: v.shown, cap: v.cap.slice(0, 40) })})`);
  await shot(page, 'p-tour-fallback-live');
  check(await page.evaluate(() => document.querySelector('#tourPick .tour-live').classList.contains('hidden')), 'the video choice is withdrawn for this visit');
  await page.tap('#tourView [data-do=back]');
  await page.waitForTimeout(400);
  same({ ...before, children: 0 }, { ...(await page.evaluate(SNAP)), children: 0 }, 'title, after the fallback');   // the live tour's pooled wildlife stays, switched off
  for (const e of new Set(errors)) check(false, `fallback: console error: ${e}`);
  await ctx.close();
}

// ---------------------------------------------------------------- the arrival
const ARRIVED = () => {
  const g = window.__STARLINE__, d = g.director, p = g.player, r = v => +(+v).toFixed(2), n = id => { const x = d.npcs[id]; return x ? [r(x.pos.x), r(x.pos.y), r(x.pos.z), r(x.facing), x.visible] : null; };
  const q = d.quest.state;
  return { step: q.step, chapter: q.chapter, season: g.time.season, hour: r(g.time.hour), flags: Object.keys(q.flags).sort().join(), inv: JSON.stringify(q.inv), player: [r(p.pos.x), r(p.pos.y), r(p.pos.z), r(p.facing), p.root.visible, p.swimming, !!p.mounted],
    yaw: r(g.follow.yaw), train: [r(g.railway.train.s), g.railway.train.target, r(g.railway.train.v)], genzo: n('genzo'), sora: n('sora'), rin: n('rin'), scene: d.scenes.active, dialogue: g.ui.dialogueOpen,
    speaker: document.getElementById('dlgName')?.textContent || '', hold: !!g.renderer.hold, video: !!document.querySelector('#sceneVideo.on'), skip: !!document.getElementById('introSkip'), cinema: document.body.classList.contains('cinema') };
};
async function arrival(story, how) {
  const { ctx, page, errors } = await boot(`start=new&story=${story}${how === 'live' ? '&live=1' : ''}`);
  const t = Date.now();
  let seen = null;
  if (how !== 'live') {
    const file = `intro-${story}-tall.mp4`;
    check(await playing(page, file), `${story}: the arrival clip plays`);
    check(await page.locator('#introSkip').isVisible(), `${story}: there is a Skip button`);
    useStory(story);
    const first = CAPTIONS.arrival[0];
    check(await waitVid(page, c => document.getElementById('captionText')?.textContent === c && document.getElementById('captionText').classList.contains('show'), first, 8000), `${story}: the first caption is told live over the clip`);
    await page.waitForTimeout(2500);
    check((await idle(page, 600)).ok, `${story}: the renderer stands still under the arrival clip`);
    seen = await page.evaluate(ARRIVED);
    check(seen.scene === 'arrival' && seen.cinema && seen.video, `${story}: the cutscene owns the screen meanwhile (${stable({ scene: seen.scene, cinema: seen.cinema })})`);
    await shot(page, `p-intro-${story}-${how}`);
    if (how === 'skip') await page.tap('#introSkip');
    else { await page.waitForTimeout(9000); await shot(page, `p-intro-${story}-video-mid`); }
  }
  await page.waitForFunction(() => { const g = window.__STARLINE__; return g.director.scenes.active === null && g.ui.dialogueOpen; }, null, { timeout: 120000, polling: 200 });
  const secs = (Date.now() - t) / 1000;
  await page.waitForTimeout(1200);
  const s = await page.evaluate(ARRIVED);
  if (how !== 'live') {
    check(!s.hold && !s.video && !s.skip && !s.cinema, `${story} (${how}): the clip is gone, the renderer draws, no bars or Skip left (${stable({ hold: s.hold, video: s.video, skip: s.skip, cinema: s.cinema })})`);
    const f0 = (await page.evaluate(VID)).frame;
    await page.waitForTimeout(400);
    check((await page.evaluate(VID)).frame > f0, `${story} (${how}): live frames are drawn after the clip`);
    if (how === 'skip') check(await page.evaluate(() => !document.getElementById('captionText').classList.contains('show')), `${story}: skipping takes the caption away`);
    await shot(page, `p-intro-${story}-${how}-after`);
  }
  for (const e of new Set(errors)) check(false, `arrival ${story} ${how}: console error: ${e}`);
  await ctx.close();
  for (const k of ['hold', 'video', 'skip', 'cinema']) delete s[k];
  return { s, secs };
}
async function intro() {
  for (const story of (args.story ? [args.story] : ['grandma', 'classic'])) {
    log(`arrival, ${story}: live, video, skipped`);
    const live = await arrival(story, 'live');
    const video = await arrival(story, 'video');
    const skip = story === 'grandma' || args.story ? await arrival(story, 'skip') : null;
    log(`  live ${live.secs.toFixed(0)} s, video ${video.secs.toFixed(0)} s${skip ? `, skipped ${skip.secs.toFixed(0)} s` : ''}`);
    check(live.s.step === 'p.arrive' || live.s.dialogue, `${story}: the live arrival ends in the first talk (${live.s.step})`);
    same(live.s, video.s, `${story}: state after the video arrival vs the live one`);
    if (skip) { same(live.s, skip.s, `${story}: state after the skipped arrival vs the live one`); check(skip.secs < live.secs - 8, `${story}: Skip really skips (${skip.secs.toFixed(0)} s)`); }
  }
}

try {
  const only = args.only;
  if (!only || only === 'title' || only === 'tour') await titleAndTour();
  if (!only || only === 'pause') await fromPause();
  if (!only || only === 'fallback') await fallback();
  if (!only || only === 'intro') await intro();
} catch (e) {
  failures.push(`crashed: ${e.stack || e}`);
} finally {
  await browser.close();
  server?.kill();
}
log(failures.length ? `FAILED (${failures.length}):\n - ${failures.join('\n - ')}` : 'phone videos: all browser checks passed');
process.exit(failures.length ? 1 : 0);
