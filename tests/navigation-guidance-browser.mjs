// The gate's HUD and journal pin must lead somewhere that completes the actual arrival objective.
// Uses the production runtime's registered zones; no /src imports or injected quest events in the page.
// GAME_URL=http://127.0.0.1:5950/ node tests/navigation-guidance-browser.mjs [--only=desktop|phone] [--story=grandma|classic] [--out=.tools/navigation]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateAt } from '../src/game/fastforward.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const BASE = process.env.GAME_URL;
if (!BASE) throw Error('Set GAME_URL to a running production preview.');
const OUT = path.resolve(ROOT, args.out || '.tools/navigation');
mkdirSync(OUT, { recursive: true });
const cases = [], failures = [], started = Date.now();
const check = (ok, message) => { if (!ok) failures.push(message); };
const devices = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  for (const story of ['grandma', 'classic']) {
    if (args.story && args.story !== story) continue;
    for (const [device, options] of Object.entries(devices)) {
      if (args.only && args.only !== device) continue;
      const tag = `${story}-${device}`, ctx = await browser.newContext(options), errors = [];
      try {
        const save = { v: 1, quest: stateAt('c3.fox', 'alone', story),
          player: { x: 85, y: 22, z: -80, facing: Math.PI }, at: 1760000000000 };
        await ctx.addInitScript(s => {
          localStorage.setItem('starline-lang', 'en');
          localStorage.setItem('starline-save-1', s);
          localStorage.setItem('starline-last-slot', '1');
        }, JSON.stringify(save));
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource:')) errors.push(m.text()); });
        page.on('response', r => { if (r.status() >= 400 && new URL(r.url()).origin === new URL(BASE).origin) errors.push(`${r.status()} ${r.url()}`); });
        const url = new URL(BASE);
        for (const [k, v] of Object.entries({ qa: '1', mute: '1', quality: 'low', tourtest: '1', start: 'continue', slot: '1' })) url.searchParams.set(k, v);
        await page.goto(url.href);
        await page.waitForFunction(() => window.__STARLINE_READY__ && window.__STARLINE__?.director?.quest
          && !window.__STARLINE__.director.busy && !window.__STARLINE__.director.scenes.active, null, { timeout: 180000 });
        await page.waitForTimeout(500);
        const before = await page.evaluate(() => {
          const g = window.__STARLINE__, d = g.director, zone = d.zones.get('orchardGate'), marker = d.markerTarget();
          return { story: d.quest.state.story, step: d.quest.state.step, player: g.player.pos.toArray(), target: marker?.toArray(),
            zone: { pos: zone.pos.toArray(), r: zone.r, active: zone.when() }, objective: document.getElementById('objText').textContent,
            markerVisible: !document.getElementById('marker').classList.contains('hidden'), entry: document.querySelector('script[type="module"][src]')?.src };
        });
        check(before.story === story && before.step === 'c3.fox', `${tag}: standing at the old gate pin has not completed the objective`);
        check(before.markerVisible && before.zone.active && before.target
          && Math.hypot(before.target[0] - before.zone.pos[0], before.target[2] - before.zone.pos[2]) < before.zone.r,
          `${tag}: HUD target lies inside the real registered arrival zone (${JSON.stringify(before)})`);
        await page.screenshot({ path: path.join(OUT, `${tag}-hud.png`) });

        await page.click('#btnJournal');
        await page.click('#journalTabs [data-tab="map"]');
        await page.waitForFunction(() => window.__STARLINE__.ui.map?.hits?.some(h => h.key === 'goal'));
        const map = await page.evaluate(() => {
          const m = window.__STARLINE__.ui.map, goal = m.hits.find(h => h.key === 'goal');
          return { goal: m.toWorld(goal.x, goal.y + 12 * m.unit()), objective: goal.lines[0], legend: document.querySelector('.jmap-legend').textContent };
        });
        check(Math.hypot(map.goal[0] - before.target[0], map.goal[1] - before.target[2]) < 1e-6,
          `${tag}: map and HUD use the same live destination`);
        check(map.objective === before.objective && map.legend.includes(before.objective), `${tag}: map repeats the active HUD objective`);
        await page.screenshot({ path: path.join(OUT, `${tag}-map.png`) });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !window.__STARLINE__.paused && !window.__STARLINE__.ui.overlay);

        // Follow the displayed target with actual player input. No teleport, dispatch or
        // direct story mutation: arrival must be detected by the normal game update.
        const distance = Math.hypot(before.player[0] - before.target[0], before.player[2] - before.target[2]);
        if (distance > .3) {
          await page.evaluate(([x, z]) => window.__STARLINE_QA__.faceToward(x, z), [before.target[0], before.target[2]]);
          await page.keyboard.down('KeyW');
        }
        let arrived = false;
        try {
          await page.waitForFunction(() => window.__STARLINE__.director.quest.state.step === 'c3.follow', null, { timeout: 7000 });
          arrived = true;
        } catch { /* retained below as a failed assertion with actual player state */ }
        finally { await page.keyboard.up('KeyW'); }
        const after = await page.evaluate(() => ({ step: window.__STARLINE__.director.quest.state.step, player: window.__STARLINE__.player.pos.toArray() }));
        check(arrived, `${tag}: walking toward the marked destination advances to c3.follow (${JSON.stringify(after)})`);
        check(errors.length === 0, `${tag}: no runtime/resource errors (${errors.join('; ')})`);
        cases.push({ tag, before, map, after, arrived, errors });
        console.log(JSON.stringify({ tag, target: before.target, zone: before.zone, after, arrived, errors }));
      } catch (e) { failures.push(`${tag}: ${e.stack || e}`); }
      finally { await ctx.close(); }
    }
  }
} finally {
  await browser.close();
  if (!cases.length && !failures.length) failures.push('No cases matched --story and --only.');
  const report = { url: BASE, passed: failures.length === 0, seconds: (Date.now() - started) / 1000, cases, failures };
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cases: cases.length, seconds: report.seconds, failures }, null, 2));
}
process.exitCode = failures.length ? 1 : 0;
