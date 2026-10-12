// Production-compatible tour regression: UI loads the built lazy chunk while the title still waits for a choice.
// No browser-side source imports; pure Node imports provide save fixtures and expected captions.
// GAME_URL=http://127.0.0.1:5851/ node tests/tour-production-browser.mjs [--out=.tools/review/tour-production]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateAt } from '../src/game/fastforward.js';
import { TOUR, captionFor } from '../src/content/tour.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const OUT = path.resolve(ROOT, args.out || '.tools/review/tour-production');
const url = process.env.GAME_URL;
if (!url) { console.error('Set GAME_URL to the running production preview.'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(ROOT, 'node_modules/playwright'));
const DEVICES = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};
const cases = ['grandma', 'classic'].flatMap(story => [
  ...Object.keys(DEVICES).map(device => ({ story, device, entry: 'title' })),
  { story, device: 'desktop', entry: 'pause', step: 'c1.cogs' },
  { story, device: 'phone', entry: 'pause', step: 'c3.gather' },
]);
const results = [], started = Date.now();
const log = (...a) => console.log(`[${Math.round((Date.now() - started) / 1000)}s]`, ...a);

const snapshot = () => {
  const g = window.__STARLINE__, d = g.director, p = g.player, R = g.railway, T = R.train;
  const round = x => +x.toFixed(4), hid = id => document.getElementById(id).classList.contains('hidden');
  const storage = Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]));
  return {
    quest: d.quest?.save() ?? null, questSame: (d.quest ?? null) === window.__tourProductionRefs.quest,
    beforeUpdateSame: g.beforeUpdate === window.__tourProductionRefs.beforeUpdate, storage,
    lamps: [...g.structures.lamps.entries()].map(([id, L]) => [id, L.target, round(L.lit)]), lampStyle: g.structures.lampStyle || 'flame',
    rail: [!!R.repaired, R.repair?.visible, R.scaffold?.visible, ...(R.beams || []).map(b => b.visible)],
    train: [round(T.s), round(T.v), T.target, T.cruise, T.dir],
    people: [...(d.returning || []).map(([id]) => id), 'sora'].filter(id => d.npcs[id]).map(id => [id, d.npcs[id].storyVisible]),
    decor: g.celebrate?.decor?.level ?? 0,
    player: [...p.pos.toArray().map(round), round(p.facing), p.root.visible, Object.hasOwn(p, 'update')],
    season: g.time.season, hour: round(g.time.hour), seasonOverride: g.seasonOverride ?? null, timeOverride: g.timeOverride ?? null,
    cycleHour: g.cycleHour ?? null, weatherOff: !!g.weatherOff, weather: g.fx.weatherKind ?? null,
    camera: [...g.camera.position.toArray(), ...g.camera.quaternion.toArray(), g.camera.fov, g.camera.near].map(round),
    paused: g.paused, tourLock: !!d.tourLock,
    screen: { hud: hid('hud'), touch: hid('touch'), title: hid('title'), overlay: g.ui.overlay },
  };
};

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel, headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] }); break; } catch { /* try the next installed browser */ }
}
if (!browser) { console.error('Install Edge or Chrome for the production tour checks.'); process.exit(2); }
try {
  for (const item of cases) {
    const name = `${item.story}-${item.device}-${item.entry}${item.step ? `-${item.step}` : ''}`;
    log(name);
    const ctx = await browser.newContext(DEVICES[item.device]);
    const save = { v: 1, quest: stateAt(item.step || 'c1.cogs', 'alone', item.story), player: { x: -40, y: 3, z: 20, facing: 3.1 }, at: 1760000000000 };
    await ctx.addInitScript(({ story, save }) => {
      localStorage.setItem('starline-story', story);
      localStorage.setItem('starline-save-1', JSON.stringify(save));
      localStorage.setItem('starline-last-slot', '1');
      localStorage.setItem('starline-opt-tourLive', 'false');
    }, { story: item.story, save });
    const page = await ctx.newPage(), errors = [], sourceRequests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
    page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/src/')) sourceRequests.push(r.url()); });
    try {
      const query = `mute&qa=1&quality=${item.device === 'phone' ? 'low' : 'medium'}${item.entry === 'pause' ? '&start=continue&slot=1' : ''}`;
      await page.goto(`${url.replace(/\/$/, '')}/?${query}`);
      await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 120000 });
      if (item.entry === 'pause') {
        await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 30000 });
        for (let i = 0; i < 40; i++) {
          const s = await page.evaluate(() => window.__STARLINE_QA__.state());
          if (s.dlg) await page.keyboard.press('KeyE');
          else if (!s.busy && !s.running) break;
          await page.waitForTimeout(200);
        }
        await page.waitForTimeout(1000);
        await page.click('#btnMenu'); await page.waitForSelector('#pause:not(.hidden)');
        await page.click('#btnPauseSettings'); await page.click('#btnTour');
      } else await page.click('#btnTitleTour');
      // This deadline specifically catches built-only lazy-import deadlocks while main awaits the title choice.
      await page.waitForSelector('#tourPick:not(.hidden)', { timeout: 15000 });
      await page.waitForFunction(() => !!window.__STARLINE__.tour, null, { timeout: 15000 });
      if (item.entry === 'title') {
        await page.waitForFunction(() => window.__STARLINE__.tour.videos !== undefined, null, { timeout: 10000 });
        if (await page.locator('#tourLive').isVisible()) await page.locator('#tourLive').check();
      }
      // Snapshot the title/pause screen that close() restores, with the lazy module already loaded.
      await page.evaluate(() => {
        const g = window.__STARLINE__;
        g.ui.closeOverlay();
        if (g.director.quest) g.ui.open('pause');
        window.__tourProductionRefs = { quest: g.director.quest ?? null, beforeUpdate: g.beforeUpdate };
      });
      const before = await page.evaluate(snapshot);
      if (item.entry === 'title') await page.click('#btnTitleTour');
      else { await page.click('#btnPauseSettings'); await page.click('#btnTour'); }
      await page.waitForSelector('#tourPick:not(.hidden)');
      await page.click('#tourPick [data-tour=night]');
      await page.waitForFunction(() => window.__STARLINE__.tour?.active, null, { timeout: 15000 });
      const during = await page.evaluate(snapshot);
      assert.equal(await page.evaluate(() => window.__STARLINE__.tour.mode), 'live', name);
      assert.equal(during.quest.story, item.story, name);
      assert.equal(during.lampStyle, item.story === 'grandma' ? 'electric' : 'flame', name);
      assert.equal(during.questSame, false, `${name}: the live flight borrows a copy`);
      assert.equal(await page.evaluate(() => window.__STARLINE__.director.ground?.state?.cameraLower || 0), 0, `${name}: hidden Mika cannot lower the tour camera`);
      assert.deepEqual(during.storage, before.storage, `${name}: tour does not write storage`);
      assert.equal(await page.evaluate(() => window.__STARLINE__.director.save()), false, `${name}: saving is locked`);
      if (item.entry === 'pause') {
        assert.equal(during.quest.step, before.quest.step, name);
        assert.deepEqual(during.lamps.map(l => l.slice(0, 2)), before.lamps.map(l => l.slice(0, 2)), name);
        for (const key of ['rail', 'people', 'decor']) assert.deepEqual(during[key], before[key], `${name}: ${key} keeps current progress`);
      } else {
        assert.equal(during.quest.step, 'e.done', name);
        assert.ok(during.lamps.every(l => l[1] === 1), name);
        assert.equal(during.rail[0], true, name);
      }
      await page.keyboard.press('KeyP');
      assert.equal(await page.evaluate(() => window.__STARLINE__.tour.paused), true, `${name}: keyboard pause`);
      for (const place of ['mill', 'shrine', 'viaduct']) {
        const index = TOUR.night.stops.findIndex(s => s.place === place);
        await page.evaluate(index => { const t = window.__STARLINE__.tour; t.goStop(index); t.paused = true; }, index);
        await page.waitForTimeout(750);
        const expected = captionFor(TOUR.night, TOUR.night.stops[index], item.entry === 'pause' ? before.quest : null);
        assert.equal(await page.locator('#tourView .tour-caption p').textContent(), expected, `${name}: ${place} caption`);
        if (item.entry === 'pause') {
          const view = await page.evaluate(snapshot);
          assert.deepEqual(view.rail, before.rail, `${name}: ${place} cannot repair the viaduct`);
          assert.deepEqual(view.lamps.map(l => l.slice(0, 2)), before.lamps.map(l => l.slice(0, 2)), `${name}: ${place} cannot light lamps`);
        }
        if (args.shots !== '0') await page.screenshot({ path: path.join(OUT, `${name}-${place}.png`) });
      }
      await page.click('#tourView [data-do=next]');
      assert.equal(await page.evaluate(() => window.__STARLINE__.tour.stopI), 7, `${name}: next stop`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !window.__STARLINE__.tour.active);
      const after = await page.evaluate(snapshot);
      // The title backdrop immediately resumes its flight; its camera therefore moves again after restoration.
      if (item.entry === 'title') { delete before.camera; delete after.camera; }
      assert.deepEqual(after, before, `${name}: quest identity, storage and borrowed state are restored`);
      assert.deepEqual(sourceRequests, [], `${name}: browser uses only production modules`);
      assert.deepEqual(errors, [], `${name}: no runtime errors`);
      results.push({ name, passed: true, story: during.quest.story, lampStyle: during.lampStyle, step: during.quest.step });
      log('PASS', name);
    } catch (error) {
      results.push({ name, passed: false, error: error.stack || String(error) });
      await page.screenshot({ path: path.join(OUT, `${name}-failure.png`) }).catch(() => {});
      throw error;
    } finally { await ctx.close(); }
  }
} finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ url, elapsedSeconds: (Date.now() - started) / 1000, cases: results }, null, 2));
  await browser.close();
}
log(`production tour: ${results.length} cases passed`);
