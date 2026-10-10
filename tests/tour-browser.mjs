// The scene tour in a real browser: every tour flown end to end from both doors (the title screen and the pause
// menu), on a desktop and on a portrait phone, with a screenshot of every stop for review.
//   node tests/tour-browser.mjs [--only=desktop|phone] [--out=.tools/review/tour] [--shots=0]
// Uses GAME_URL if set; otherwise starts vite on port 5831. Needs Playwright and prefers the real GPU.
//
// It checks that
//   • the tour opens from Settings (title and pause menu) and from the title menu's own button;
//   • the flight is deterministic (tour.update(dt) steps it), never dips into the ground or a collider, the season
//     and hour are the tour's, the valley is alive (people move, the train crosses, fish show at the dock, stars and
//     shooting stars at night), and the keyboard / touch controls work;
//   • saving is impossible while it runs, and leaving it at any stage puts back the save files, the story, Mika,
//     the season and hour, the lamps, the train and the screen exactly as they were;
//   • nothing is left behind in the scene or on the GPU after it closes.
import { createRequire } from 'module';
import { mkdirSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import assert from 'node:assert/strict';
import { stateAt } from './e2e/fastforward.mjs';
import { TOURS } from '../src/content/tour.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const OUT = path.resolve(ROOT, args.out || '.tools/review/tour');
const SHOTS = args.shots !== '0';
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE_PATH || path.join(ROOT, 'node_modules/playwright');
if (!existsSync(pwPath)) { console.error('Playwright not found.'); process.exit(2); }
const { chromium } = require(pwPath);

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

// a story save in slot 1 (chapter 1: no lamp lit yet, the viaduct still broken), so there is something to protect
const SAVE = JSON.stringify({ v: 1, quest: stateAt('c1.cogs', 'alone', 'grandma'), player: { x: -40, y: 3, z: 20, facing: 3.1 }, at: 1760000000000 });
const DEVICES = {
  desktop: { tag: 'd', viewport: { width: 1280, height: 720 } },
  phone: { tag: 'p', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } };

// ---------------------------------------------------------------- in-page helpers
/** Everything the tour must give back, as plain data. */
const SNAP = () => {
  const g = window.__STARLINE__, d = g.director, p = g.player, r = (v, n = 3) => +(+v).toFixed(n);
  const ls = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
  const hid = id => document.getElementById(id)?.classList.contains('hidden') ?? true;
  window.__tourRefs ??= {};
  const same = (k, v) => { if (!(k in window.__tourRefs)) window.__tourRefs[k] = v; return window.__tourRefs[k] === v; };
  return {
    ls, quest: d.quest ? JSON.stringify(d.quest.save()) : null, questSame: same('quest', d.quest ?? null),
    player: [r(p.pos.x), r(p.pos.y), r(p.pos.z), r(p.facing), p.root.visible, !!p.locked === !!p.locked, Object.hasOwn(p, 'update')],
    season: g.time.season, hour: r(g.time.hour, 4), shownSeason: g.shownSeason, shownHour: r(g.shownHour(), 4),
    seasonOverride: g.seasonOverride ?? null, timeOverride: g.timeOverride ?? null, cycleHour: g.cycleHour ?? null, weatherOff: !!g.weatherOff, weather: g.fx.weatherKind ?? null,
    viewFocus: g.viewFocus ?? null, beforeUpdateSame: same('beforeUpdate', g.beforeUpdate ?? null), paused: g.paused,
    fovBase: g.follow.fovBase, tracking: !!g.follow.tracking,
    lamps: [...g.structures.lamps.entries()].map(([id, L]) => [id, L.target, r(L.lit)]),
    rail: [!!g.railway.repaired, g.railway.repair?.visible, g.railway.scaffold?.visible, (g.railway.beams || []).map(b => b.visible).join(), r(g.railway.train.s), g.railway.train.target],
    decor: g.celebrate?.decor?.level ?? 0, meteors: g.fx.meteorOn, busy: d.busy, tourLock: !!d.tourLock, timetable: JSON.stringify(d.timetable ?? null),
    shadowed: ['save', 'canSave', 'canAim', 'event', 'run', 'say', 'collect'].filter(k => Object.hasOwn(d, k)).join() + (Object.hasOwn(g, 'togglePause') ? ',togglePause' : '') + (Object.hasOwn(g.ui, 'openJournal') ? ',openJournal' : ''),
    tamo: [d.tamo.hidden, d.tamo.root.visible], pickups: [...d.pickups.values()].map(pk => `${pk.id}:${pk.obj.visible}`).join(),
    people: (d.returning || []).map(x => `${x[0]}:${d.npcs[x[0]].visible}`).join(),
    screen: { hud: hid('hud'), touch: hid('touch'), title: hid('title'), view: hid('tourView') || !window.__STARLINE__.tour?.active, pick: hid('tourPick'), overlay: g.ui.overlay, bodyTour: document.body.classList.contains('tour-on') },
  };
};
const CAM = () => { const c = window.__STARLINE__.camera; return [...c.position.toArray(), ...c.quaternion.toArray(), c.fov, c.near].map(v => +v.toFixed(4)); };
const COUNTS = () => { const g = window.__STARLINE__, m = g.renderer.renderer.info.memory; let n = 0; g.scene.traverse(() => n++); return { children: g.scene.children.length, objects: n, geometries: m.geometries, textures: m.textures }; };
/** Step the paused tour by `secs` in small steps, watching the camera; returns what it saw. */
const STEP = ([secs, dt]) => {
  const g = window.__STARLINE__, t = g.tour, C = g.colliders.constructor, out = { bad: [], minClear: 99 };
  for (let left = secs; left > 1e-6 && !t.done; left -= dt) {
    t.update(Math.min(dt, left), true);
    const P = t.pose, [x, y, z] = P.pos, clear = y - Math.max(g.world.heightAt(x, z), 0);
    out.minClear = Math.min(out.minClear, clear);
    if (clear < 1.15) out.bad.push(`ground ${clear.toFixed(2)} m at ${t.tour.id} ${t.t.toFixed(1)}s`);
    // buildings, towers and tree trunks (story barriers such as the orchard fence line are invisible walls, not things)
    for (const it of g.colliders.near(x, z)) if (it.enabled !== false && (it.blocksView || it.id === 'tree') && C.contains(it, x, z, 0.3) && y > it.y0 && y < it.y1 + 0.3) out.bad.push(`inside ${it.id} at ${t.tour.id} ${t.t.toFixed(1)}s`);
    if (g.seasonOverride !== t.tour.season) out.bad.push('season not the tour\'s');
  }
  return { ...out, ...t.debug() };
};

async function boot(browser, dev, query) {
  const ctx = await browser.newContext({ viewport: dev.viewport, hasTouch: !!dev.hasTouch, isMobile: !!dev.isMobile, deviceScaleFactor: dev.deviceScaleFactor || 1 });
  await ctx.addInitScript(save => { if (!localStorage.getItem('starline-save-1')) { localStorage.setItem('starline-save-1', save); localStorage.setItem('starline-last-slot', '1'); } }, SAVE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${url}?mute&${query}`);
  await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
  const hit = sel => (dev.hasTouch ? page.tap(sel) : page.click(sel));
  return { ctx, page, errors, hit };
}

const stable = s => JSON.stringify(s);
function same(a, b, what) {
  for (const k of Object.keys(a)) if (stable(a[k]) !== stable(b[k])) check(false, `${what}: ${k} changed\n      before ${stable(a[k]).slice(0, 300)}\n      after  ${stable(b[k]).slice(0, 300)}`);
}

// ---------------------------------------------------------------- the two doors
async function fromTitle(browser, name, dev) {
  log(`${name}: title screen`);
  const { ctx, page, errors, hit } = await boot(browser, dev, 'tourtest=1');
  await page.waitForTimeout(3000);                             // the first frames compile shaders; let the title settle
  await page.evaluate(() => { window.__kids = new Set(window.__STARLINE__.scene.children); });
  const before = await page.evaluate(SNAP), base = await page.evaluate(COUNTS);
  check(before.quest === null && !before.screen.title, 'the title screen is up and no story is loaded');
  // door 1: Settings → Scene tour
  await hit('#btnSettings');
  await hit('#btnTour');
  await page.waitForSelector('#tourPick:not(.hidden)');
  check(await page.locator('#tourPick .tour-card').count() === 6, 'six cards in the picker');
  check((await page.locator('#tourPick .tour-safe').textContent()).includes('not changed'), 'the picker says the game is not changed');
  if (SHOTS) await page.screenshot({ path: path.join(OUT, `${dev.tag}-picker.png`) });
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => window.__STARLINE__.ui.overlay) === 'settings', 'Esc in the picker goes back to Settings');
  await page.keyboard.press('Escape');
  // door 2: the title menu's own button
  await hit('#btnTitleTour');
  await page.waitForSelector('#tourPick:not(.hidden)');
  await hit('#tourPick [data-tour=year]');
  await page.waitForFunction(() => window.__STARLINE__.tour?.active);
  let s = await page.evaluate(SNAP);
  check(s.screen.title && s.screen.hud && !s.screen.view && s.tourLock && s.quest !== null && !s.player[4], 'the tour owns the screen: title and HUD hidden, Mika hidden, a throwaway story running');
  // Playwright's own Chromium cannot decode H.264, so here the phone's video tour is not on offer: the picker hides
  // the choice and the tour flies live (tests/video-browser.mjs covers the video tour in Edge or Chrome)
  const how = await page.evaluate(() => ({ mode: window.__STARLINE__.tour.debug().mode, hold: !!window.__STARLINE__.renderer.hold, can: !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.640020"'), offer: !document.querySelector('#tourPick .tour-live').classList.contains('hidden') }));
  check(how.mode === 'live' && !how.hold && (how.can || !how.offer), `${name}: the tour is live here (${JSON.stringify(how)})`);
  // saving cannot happen
  const saved = await page.evaluate(() => { const d = window.__STARLINE__.director; const a = d.save(); delete d.save; const b = d.save(); delete d.canSave; const c = d.save(); d.save = d.canSave = () => false; return [a, b, c]; });
  check(saved.every(v => v === false), `no save can be written during the tour (${saved})`);
  check(stable((await page.evaluate(SNAP)).ls) === stable(before.ls), 'save files untouched while the tour runs');

  // the whole year, stop by stop
  await page.evaluate(() => { const t = window.__STARLINE__.tour; t.paused = true; t.syncUi(); });
  const people0 = await page.evaluate(() => Object.values(window.__STARLINE__.director.npcs).map(n => [n.pos.x, n.pos.z]));
  let minClear = 99;
  for (const tour of TOURS) {
    for (let i = 0; i < tour.stops.length; i++) {
      // glide to the stop, then 2.6 s into its rest
      let r, guard = 0;
      do {
        r = await page.evaluate(STEP, [0.5, 0.05]);
        minClear = Math.min(minClear, r.minClear);
        for (const b of r.bad) check(false, `${name}: ${b}`);
      } while (!(r.tour === tour.id && r.stop === i && r.kind === 'dwell') && guard++ < 80);
      check(r.tour === tour.id && r.stop === i, `${name}: reached ${tour.id} stop ${i} (${tour.stops[i].place}), got ${r.tour} ${r.stop}`);
      r = await page.evaluate(STEP, [2.1, 0.05]);
      // the train runs on the game's own clock: with the tour held at the stop it steams onto the viaduct by itself
      if (tour.stops[i].place === 'viaduct') await page.waitForFunction(() => { const s = window.__STARLINE__.railway.train.s; return s > 262 && s < 330; }, null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(SHOTS ? 1300 : 250);          // the world draws itself at the new place
      const w = await page.evaluate(() => {
        const g = window.__STARLINE__, t = g.tour, cap = document.querySelector('#tourView .tour-caption');
        return { season: g.shownSeason, night: g.night, hour: g.shownHour(), fish: t.fish.mesh.visible, alpha: t.fish.mat.uniforms.uAlpha.value, stars: !!t.stars?.visible, meteors: g.fx.meteorOn, frozen: !!g.world.frozen,
          cap: cap.classList.contains('off') ? '' : cap.textContent, lamps: [...g.structures.lamps.values()].every(L => L.lit > 0.9), train: g.railway.train.s, weather: g.fx.weatherKind };
      });
      const st = tour.stops[i];
      check(w.season === tour.season && Math.abs(w.hour - st.hour) < 0.01, `${name}: ${tour.id}/${st.place} shows ${w.season} ${w.hour.toFixed(2)}`);
      check(w.cap.includes(st.line), `${name}: ${tour.id}/${st.place} caption is up`);
      check(w.lamps, `${name}: the lamps are lit`);
      if (st.place === 'dock') check(tour.season === 'winter' ? !w.fish : w.fish && w.alpha > 0.5, `${name}: ${tour.id} dock fish ${w.fish} ${w.alpha.toFixed(2)}`);
      else if (i > 0 && tour.stops[i - 1].place !== 'dock') check(!w.fish, `${name}: no fish mesh away from the dock`);
      if (st.place === 'viaduct') check(w.train > 240 && w.train < 345, `${name}: ${tour.id} train on the viaduct (s=${w.train.toFixed(0)})`);
      if (tour.id === 'night') check(w.night > 0.95, `${name}: night is dark`);
      if (tour.id === 'night' && st.place === 'hill') check(w.stars && w.meteors > 0, `${name}: stars and shooting stars over the hill`);
      if (tour.id === 'winter') check(w.frozen && w.weather === 'snow', `${name}: winter is frozen and snowing`);
      if (SHOTS) await page.screenshot({ path: path.join(OUT, `${dev.tag}-${tour.id}-${i}-${st.place}.png`) });
    }
    log(`  ${tour.id}: ${tour.stops.length} stops`);
  }
  const moved = await page.evaluate(p0 => Object.values(window.__STARLINE__.director.npcs).filter((n, i) => Math.hypot(n.pos.x - p0[i][0], n.pos.z - p0[i][1]) > 1).length, people0);
  check(moved >= 5, `${name}: the valley is alive (${moved} people walked somewhere)`);
  // to the very end: it stops and offers a replay
  let r, guard = 0;
  do { r = await page.evaluate(STEP, [2, 0.1]); } while (!r.done && guard++ < 40);
  check(r.done && r.paused && r.tour === 'night', `${name}: the year ends paused on the last stop`);
  check((await page.locator('#tourView [data-do=pause]').textContent()) === 'Replay', 'the main button offers Replay at the end');
  if (SHOTS) await page.screenshot({ path: path.join(OUT, `${dev.tag}-end.png`) });
  log(`  camera clearance over the whole year: min ${minClear.toFixed(2)} m`);

  // controls
  const dbg = () => page.evaluate(() => window.__STARLINE__.tour.debug());
  await hit('#tourView [data-do=pause]');                       // Replay
  r = await dbg();
  check(!r.done && !r.paused && r.tour === 'spring' && r.t < 1.5, `${name}: Replay starts over (${r.tour} ${r.t.toFixed(1)})`);
  await page.keyboard.press('KeyP'); check((await dbg()).paused, 'P pauses');
  await page.keyboard.press('Space'); check(!(await dbg()).paused, 'Space resumes');
  await page.keyboard.press('KeyP');
  await page.keyboard.press('ArrowRight'); r = await dbg(); check(r.stop === 1 && r.kind === 'dwell', `→ goes to the next stop (${r.stop})`);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); r = await dbg(); check(r.stop === 1, `← goes back a stop (${r.stop})`);
  await page.keyboard.press('Digit4'); r = await dbg(); check(r.tour === 'winter' && r.year, 'a season key jumps to that season');
  await hit('#tourView .tour-seasons [data-tour=autumn]'); r = await dbg(); check(r.tour === 'autumn' && !r.paused, 'a season button jumps too');
  await hit('#tourView [data-do=next]'); r = await dbg(); check(r.stop === 1, 'the next button works');
  await hit('#tourView [data-do=prev]'); r = await dbg(); check(r.stop === 0, 'the previous button works');
  await hit('#tourView [data-do=pause]'); check((await dbg()).paused, 'the pause button pauses');
  await hit('#tourView [data-do=pause]'); check(!(await dbg()).paused, 'and resumes');
  // a hidden tab pauses the flight
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
  check((await dbg()).paused, 'the tour pauses when the tab is hidden');
  // the game's own keys do nothing meanwhile
  await page.keyboard.press('KeyJ'); await page.keyboard.press('KeyE');
  check(await page.evaluate(() => window.__STARLINE__.ui.overlay) === null, 'journal and action keys are swallowed');
  // buttons are finger-sized and the bar stays on screen
  const boxes = await page.evaluate(() => [...document.querySelectorAll('#tourView button')].map(b => { const r = b.getBoundingClientRect(); return [r.width, r.height, r.left, r.right, r.bottom]; }));
  check(boxes.every(b => b[0] >= 43.5 && b[1] >= 43.5 && b[2] >= 0 && b[3] <= dev.viewport.width + 0.5 && b[4] <= dev.viewport.height), `${name}: toolbar buttons are 44 px and on screen`);

  // leave with Esc: everything is as it was
  await page.keyboard.press('Escape');
  let after = await page.evaluate(SNAP);
  same(before, after, `${name} title, after the year`);
  await page.waitForTimeout(900);
  after = await page.evaluate(SNAP);
  same(before, after, `${name} title, a moment later`);
  check(await page.evaluate(() => document.getElementById('tourView').classList.contains('hidden')), 'the tour overlay is gone');
  const c1 = await page.evaluate(COUNTS);
  log(`  counts before ${stable(base)} after the first tour ${stable(c1)}`);

  // leaving at other stages: mid-glide, paused, and through the Back button; and nothing piles up
  for (const [id, secs, how] of [['night', 9.3, 'key'], ['winter', 1, 'paused'], ['summer', 30, 'button']]) {
    await hit('#btnTitleTour');
    await page.waitForSelector('#tourPick:not(.hidden)');
    await hit(`#tourPick [data-tour=${id}]`);
    await page.evaluate(() => { const t = window.__STARLINE__.tour; t.paused = true; });
    await page.evaluate(STEP, [secs, 0.1]);
    await page.waitForTimeout(400);
    if (how === 'button') { await page.evaluate(() => { window.__STARLINE__.tour.paused = false; }); await hit('#tourView [data-do=back]'); } else await page.keyboard.press(how === 'key' ? 'Backspace' : 'Escape');
    same(before, await page.evaluate(SNAP), `${name} title, after leaving ${id} (${how})`);
    await page.waitForTimeout(700);
  }
  const c2 = await page.evaluate(COUNTS);
  log(`  counts after three more ${stable(c2)}`);
  // what is new in the scene since before the first tour is only pooled wildlife other systems made on first use, all of it switched off
  const extra = await page.evaluate(() => window.__STARLINE__.scene.children.filter(c => !window.__kids.has(c)).map(c => `${c.name || c.type}:${c.visible}`));
  check(extra.every(e => e.endsWith(':false')) && !extra.some(e => e.startsWith('tour')), `${name}: nothing of the tour is left in the scene (${extra.filter(e => !e.endsWith(':false')).join()})`);
  check(c2.children === c1.children, `${name}: scene children steady at ${c1.children} (now ${c2.children}; ${base.children} before the first tour)`);
  check(c2.objects <= c1.objects && c2.geometries <= c1.geometries && c2.textures <= c1.textures, `${name}: nothing piles up between tours ${stable(c1)} → ${stable(c2)}`);
  // the title still works: the menu is there and a click on it is heard
  check(await page.locator('#btnNew').isVisible(), 'the title menu is back');
  for (const e of new Set(errors)) check(false, `${name} title: console error: ${e}`);
  await ctx.close();
  return { base, c1, c2 };
}

async function fromPause(browser, name, dev) {
  log(`${name}: pause menu`);
  const { ctx, page, errors, hit } = await boot(browser, dev, 'qa=1&start=continue&slot=1');
  await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 60000 });
  // let any opening words pass
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => window.__STARLINE_QA__.state());
    if (s.dlg) { await page.keyboard.press('KeyE'); await page.waitForTimeout(200); continue; }
    if (!s.busy && !s.running) break;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1200);
  // refused, politely, while something owns the screen
  const refused = await page.evaluate(async () => {
    const g = window.__STARLINE__, m = await import('/src/game/tour.js');
    g.director.busy++;
    const t = m.openTour(g), text = document.querySelector('#tourPick .tour-busy').textContent, off = [...document.querySelectorAll('#tourPick .tour-card')].every(b => b.disabled), started = t.start('spring');
    g.director.busy--;
    g.ui.closeOverlay();
    return { text, off, started, active: t.active };
  });
  check(refused.text.length > 10 && refused.off && refused.started === false && !refused.active, `${name}: the tour is refused during a scene (${stable(refused)})`);
  await page.waitForTimeout(300);
  if (dev.hasTouch) await page.tap('#btnMenu'); else await page.keyboard.press('Escape');
  await page.waitForSelector('#pause:not(.hidden)');
  await page.evaluate(() => { window.__kids = new Set(window.__STARLINE__.scene.children); });
  const before = await page.evaluate(SNAP), cam0 = await page.evaluate(CAM), base = await page.evaluate(COUNTS);
  check(before.paused && before.quest && before.lamps.every(l => l[1] === 0) && before.rail[0] === false, `${name}: paused in chapter 1, lamps dark, viaduct broken`);
  await hit('#btnPauseSettings');
  await hit('#btnTour');
  await page.waitForSelector('#tourPick:not(.hidden)');
  await hit('#tourPick [data-tour=winter]');
  await page.waitForFunction(() => window.__STARLINE__.tour?.active);
  let s = await page.evaluate(SNAP);
  check(!s.paused && s.screen.hud && !s.player[4] && s.tourLock && !s.questSame && s.lamps.every(l => l[1] === 1) && s.rail[0] === true, `${name}: the tour runs unpaused with Mika hidden, on a throwaway story, lamps lit`);
  await page.evaluate(() => { window.__STARLINE__.tour.paused = true; });
  const tour = TOURS.find(t => t.id === 'winter');
  for (let i = 0; i < tour.stops.length; i++) {
    let r, guard = 0;
    do { r = await page.evaluate(STEP, [0.5, 0.05]); for (const b of r.bad) check(false, `${name}: ${b}`); } while (!(r.stop === i && r.kind === 'dwell') && guard++ < 80);
    await page.evaluate(STEP, [2.1, 0.05]);
    await page.waitForTimeout(SHOTS && i % 3 === 0 ? 1200 : 200);
    if (SHOTS && i % 3 === 0) await page.screenshot({ path: path.join(OUT, `${dev.tag}-pause-winter-${i}-${tour.stops[i].place}.png`) });
  }
  // the real story did not move while the tour's throwaway one ran, and no save was written
  s = await page.evaluate(SNAP);
  check(stable(s.ls) === stable(before.ls), `${name}: save files untouched during the tour`);
  if (dev.hasTouch) await hit('#tourView [data-do=back]'); else await page.keyboard.press('Escape');
  let after = await page.evaluate(SNAP);
  same(before, after, `${name} pause menu, after the tour`);
  check(stable(await page.evaluate(CAM)) === stable(cam0), `${name}: the camera is back where it was`);
  check(after.screen.overlay === 'pause' && after.paused, `${name}: back in the pause menu`);
  await page.waitForTimeout(900);
  same(before, await page.evaluate(SNAP), `${name} pause menu, a moment later`);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, `${dev.tag}-pause-back.png`) });
  // once more and out half way, then on with the game
  await hit('#btnPauseSettings'); await hit('#btnTour');
  await page.waitForSelector('#tourPick:not(.hidden)');
  await hit('#tourPick [data-tour=night]');
  await page.evaluate(() => { window.__STARLINE__.tour.paused = true; });
  await page.evaluate(STEP, [14, 0.1]);
  await page.waitForTimeout(500);
  await hit('#tourView [data-do=back]');
  same(before, await page.evaluate(SNAP), `${name} pause menu, after a second tour`);
  const c2 = await page.evaluate(COUNTS);
  log(`  counts before ${stable(base)} after ${stable(c2)}`);
  const extra = await page.evaluate(() => window.__STARLINE__.scene.children.filter(c => !window.__kids.has(c)).map(c => `${c.name || c.type}:${c.visible}`));
  check(extra.every(e => e.endsWith(':false')) && c2.children - base.children <= 2, `${name}: nothing of the tour is left in the scene (${extra.join()})`);
  await hit('#btnResume');
  await page.waitForTimeout(1500);
  const live = await page.evaluate(() => { const g = window.__STARLINE__, d = g.director, p = g.player; return { paused: g.paused, pos: [p.pos.x, p.pos.y, p.pos.z], vis: p.root.visible, step: d.quest.state.step, hud: !document.getElementById('hud').classList.contains('hidden'), season: g.shownSeason, canSave: d.canSave(), lamps: [...g.structures.lamps.values()].map(L => L.target).join() }; });
  check(!live.paused && live.vis && live.hud && live.step === 'c1.cogs' && live.season === before.shownSeason && live.canSave && live.lamps === '0,0,0,0', `${name}: the game goes on as before (${stable(live)})`);
  check(Math.hypot(live.pos[0] - before.player[0], live.pos[2] - before.player[2]) < 0.1 && Math.abs(live.pos[1] - before.player[1]) < 0.3, `${name}: Mika stands where she stood`);
  check(await page.evaluate(() => window.__STARLINE__.director.save()), `${name}: saving works again`);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, `${dev.tag}-pause-resumed.png`) });
  for (const e of new Set(errors)) check(false, `${name} pause: console error: ${e}`);
  await ctx.close();
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  for (const [name, dev] of Object.entries(DEVICES)) {
    if (args.only && args.only !== name) continue;
    if (args.door !== 'pause') await fromTitle(browser, name, dev);
    if (args.door !== 'title') await fromPause(browser, name, dev);
  }
} catch (e) {
  failures.push(`crashed: ${e.stack || e}`);
} finally {
  await browser.close();
  server?.kill();
}
log(failures.length ? `FAILED (${failures.length}):\n - ${failures.join('\n - ')}` : 'scene tour: all browser checks passed');
process.exit(failures.length ? 1 : 0);
