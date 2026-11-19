// Packed-production ending recovery: real Starfall sky, every dialogue page, credits, save and reload.
// GAME_URL=http://127.0.0.1:5952/ node tests/starfall-resume-browser.mjs [--only=classic-desktop] [--out=.tools/starfall-resume]
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { stateAt } from '../src/game/fastforward.js';
import { DIALOGUE } from '../src/game/story.js';
import { FALLEN_STARS } from '../src/world/layout.js';
import { useStory } from '../src/game/stories/index.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const base = process.env.GAME_URL;
assert(base, 'Set GAME_URL to the packed production preview');
const out = path.resolve(args.out || '.tools/starfall-resume');
fs.mkdirSync(out, { recursive: true });
const cases = [
  { name: 'classic-desktop', story: 'classic', quality: 'medium', viewport: { width: 1280, height: 720 } },
  { name: 'grandma-phone', story: 'grandma', quality: 'low', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
].filter(c => !args.only || c.name === args.only);
assert(cases.length, 'Unknown --only case');
const results = [], started = Date.now();
const log = (...v) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s]`, ...v);
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const read = () => {
  const g = window.__STARLINE__, d = g.director, ui = g.ui;
  const shown = id => !document.getElementById(id).classList.contains('hidden');
  return { step: d.q.state.step, story: d.q.state.story, stars: d.q.state.stars.length, active: d.scenes.active,
    busy: d.busy, running: d.running, dialogue: ui.dialogueOpen, speech: window.__starfallObserved?.speech,
    lines: [...document.querySelectorAll('#dlgLines .tx')].map(e => e.textContent),
    credits: shown('credits'), endCard: shown('endCard'), paused: g.paused, locked: g.player.locked,
    hour: g.time.hour, sky: g.celebrate?.sf, constellations: !!g.celebrate?.conTask,
    observed: window.__starfallObserved, save: JSON.parse(localStorage.getItem('starline-save-1')),
    canvas: { width: g.renderer.renderer.domElement.width, height: g.renderer.renderer.domElement.height },
  };
};
try {
  for (const c of cases) {
    useStory(c.story);
    const expected = Object.fromEntries(['starfall', 'sora_last_letter'].map(id => [id, DIALOGUE[id].filter(l => !l.choice).map(l => l[1])]));
    const quest = stateAt('e.free', 'together', c.story);
    quest.stars = FALLEN_STARS.map(s => s.id);
    quest.flags = { ...quest.flags, allStars: true, huntAsked: true, hunt: true };
    const seed = { v: 1, quest, player: { x: -95, y: 17, z: 116, facing: 0 }, at: 1794970000000 };
    const context = await browser.newContext({ viewport: c.viewport, hasTouch: !!c.hasTouch, isMobile: !!c.isMobile });
    await context.addInitScript(seed => {
      if (!localStorage.getItem('starfall-regression-seeded')) {
        localStorage.setItem('starline-save-1', JSON.stringify(seed));
        localStorage.setItem('starline-last-slot', '1');
        localStorage.setItem('starfall-regression-seeded', 'true');
      }
      localStorage.setItem('starline-lang', 'en');
      localStorage.setItem('starline-opt-voices', 'off');
    }, seed);
    const page = await context.newPage(), errors = [], sources = [], failedResources = [], faviconErrors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      if (new URL(m.location().url || base).pathname === '/favicon.ico') faviconErrors.push(m.text());
      else errors.push(m.text());
    });
    page.on('request', r => { if (new URL(r.url()).pathname.includes('/src/')) sources.push(r.url()); });
    page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) failedResources.push(`${r.status()} ${r.url()}`); });
    const shot = async suffix => {
      await page.waitForTimeout(650); // let the paper panel and its staggered dialogue rows finish their entrance
      return page.screenshot({ path: path.join(out, `${c.name}-${suffix}.png`) });
    };
    const click = async selector => {
      const button = page.locator(selector);
      await button.waitFor({ state: 'visible' });
      await button.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'center' }));
      const box = await button.boundingBox();
      assert(box, `${selector}: visible input target`);
      // The dialogue's Next button nudges forever. Use real coordinates rather than waiting for an animation to stop.
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (c.hasTouch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    };
    log('START', c.name);
    try {
      const target = new URL(base); Object.entries({ qa: '1', start: 'continue', slot: '1', quality: c.quality, mute: '1', live: '1' }).forEach(([k, v]) => target.searchParams.set(k, v));
      await page.goto(target.href);
      await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE__?.director?.q, null, { timeout: 180000 });
      await page.evaluate(() => {
        const g = window.__STARLINE__, d = g.director, ui = g.ui;
        const seen = window.__starfallObserved = { speech: null, events: [], pages: [] };
        const note = (kind, id) => seen.events.push({ kind, id, time: performance.now(), step: d.q.state.step, active: d.scenes.active });
        if (d.scenes.active) note('scene', d.scenes.active);
        const say = d.sayNow;
        d.sayNow = async function(id, ...rest) { seen.speech = id; note('say', id); try { return await say.call(this, id, ...rest); } finally { seen.speech = null; } };
        const play = d.scenes.play;
        d.scenes.play = function(id, ...rest) { note('scene', id); return play.call(this, id, ...rest); };
        const show = ui.showPage;
        ui.showPage = function(pages, index, ...rest) { seen.pages.push({ id: seen.speech, index, lines: pages[index].lines.map(l => l[1]), time: performance.now() }); return show.call(this, pages, index, ...rest); };
      });
      await page.waitForFunction(() => window.__STARLINE__.director.scenes.active === 'starfall', null, { timeout: 15000 });
      assert.equal((await page.evaluate(read)).step, 'e.free', 'loading must not report Starfall complete before playing it');
      assert.equal(await page.evaluate(() => window.__STARLINE__.director.save()), false, 'save is locked during the recovered scene');
      let skyShot = false, dialogueShot = false, letterShot = false, conStarted = null;
      const deadline = Date.now() + 150000;
      for (;;) {
        const s = await page.evaluate(read);
        if (s.credits) break;
        assert(Date.now() < deadline, `ending timeout: ${JSON.stringify(s)}`);
        if (s.active === 'starfall') assert.equal(s.step, 'e.free', 'Starfall owns completion until after the last letter');
        if (s.constellations && conStarted === null) conStarted = Date.now();
        if (!skyShot && conStarted !== null && Date.now() - conStarted > 3500) {
          assert(s.sky?.cur > 0.5 && s.sky.target === 1 && s.hour >= 21, 'the night sky effect is actually active');
          await shot('sky'); skyShot = true;
          log('SKY', c.name, `hour ${s.hour.toFixed(2)}`);
        }
        if (s.dialogue) {
          if (s.speech === 'starfall' && !dialogueShot) { await shot('starfall-dialogue'); dialogueShot = true; }
          if (s.speech === 'sora_last_letter' && !letterShot) { await shot('last-letter'); letterShot = true; log('LETTER', c.name); }
          await page.waitForTimeout(250);
          await click('#dlgNext');
        }
        await page.waitForTimeout(140);
      }
      const credits = await page.evaluate(read);
      assert(skyShot && dialogueShot && letterShot, 'all recovered scene stages were visibly reached');
      assert(credits.endCard && credits.paused && credits.locked && credits.active === 'theEnd', 'actual finale credits own the game');
      assert.equal(credits.step, 'e.done', 'logical completion precedes its queued The End presentation');
      for (const id of ['starfall', 'sora_last_letter']) {
        const shown = credits.observed.pages.filter(p => p.id === id).flatMap(p => p.lines);
        for (const text of expected[id]) assert(shown.includes(text), `${id}: missing actual dialogue line ${text}`);
      }
      const letterAt = credits.observed.events.find(e => e.kind === 'say' && e.id === 'sora_last_letter')?.time;
      const endAt = credits.observed.events.find(e => e.kind === 'scene' && e.id === 'theEnd')?.time;
      assert(letterAt < endAt, 'Sora’s final letter comes before The End and credits');
      assert.equal(credits.observed.events.filter(e => e.kind === 'scene' && e.id === 'theEnd').length, 1);
      await shot('credits');
      log('CREDITS', c.name);
      await click('#credits .primary[data-close=credits]');
      await page.waitForFunction(() => { const g = window.__STARLINE__, d = g.director; return !g.ui.dialogueOpen && !d.busy && !d.running && !d.scenes.active && !g.paused && !g.player.locked; }, null, { timeout: 20000 });
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('starline-save-1'))?.quest.step === 'e.done', null, { timeout: 10000 });
      const after = await page.evaluate(read);
      assert.equal(after.stars, 12); assert.equal(after.save.quest.step, 'e.done');
      await shot('returned-to-valley');
      await page.reload();
      await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE__?.director?.q?.state.step === 'e.done', null, { timeout: 180000 });
      for (let i = 0; i < 16; i++) {
        const s = await page.evaluate(read);
        assert.equal(s.active, null, 'reloading the completed ending does not replay a scene');
        assert(!s.dialogue && !s.credits, 'reloading completed story leaves control in the valley');
        await page.waitForTimeout(500);
      }
      const reloaded = await page.evaluate(read);
      assert.equal(reloaded.stars, 12);
      assert.deepEqual(sources, [], 'all browser modules came from packed production output');
      assert.deepEqual(failedResources, [], 'required production resources load');
      assert.deepEqual(errors, [], 'no browser runtime errors');
      await shot('reloaded-no-replay');
      results.push({ name: c.name, passed: true, beforeCredits: credits, afterCredits: after, reloaded, sourceRequests: sources, failedResources, errors, faviconErrors });
      log('PASS', c.name);
    } catch (error) {
      const snapshot = await page.evaluate(read).catch(() => null);
      await shot('failure').catch(() => {});
      results.push({ name: c.name, passed: false, error: error.stack || String(error), snapshot, sources, failedResources, errors, faviconErrors });
      log('FAIL', c.name, error.message);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, seconds: (Date.now() - started) / 1000, results }, null, 2));
if (results.some(r => !r.passed)) process.exitCode = 1;
