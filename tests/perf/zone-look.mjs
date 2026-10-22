// Wide shots from inside each play zone looking out, with the zone and with the whole valley, for a look at the edge
// (docs/play-zones/phase-2-zone-pilot.md). The game's season and hour, 1280x720; shots in --out (default .tools/zone/look).
//   GAME_URL=http://127.0.0.1:5897/ node tests/perf/zone-look.mjs [--games=trick:eggs,trick:firefly,yard:tug]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { zoneFor } from '../../src/content/zones.js';
import { exploreState } from '../../src/game/fastforward.js';
import { buildCatalogue, launchPlan } from '../../src/content/minigames.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const url = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const OUT = args.out || '.tools/zone/look';
fs.mkdirSync(OUT, { recursive: true });
const GAMES = (args.games || 'trick:eggs,trick:firefly,yard:tug').split(',');
const SAVE = JSON.stringify({ v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: 1760000000000 });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
for (const id of GAMES) {
  const z = zoneFor(id), plan = launchPlan(buildCatalogue().find(c => c.id === id));
  for (const mode of ['zone', 'valley']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(s => localStorage.setItem('starline-save-explore', s), SAVE);
    const page = await ctx.newPage();
    // Explore at the game's place, in the game's season and hour: the zone is the one the game builds (?zone=<id>)
    const q = mode === 'zone' ? `&zone=${id}` : '';
    await page.goto(`${url}?mute&qa=1&quality=high&quick=on&start=explore&slot=explore${q}`);
    await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__?.teleport, null, { timeout: 240000 });
    await page.evaluate(([x, zz, season, hour]) => { const g = window.__STARLINE__; g.seasonOverride = season; g.timeOverride = hour; g.applyLook(); window.__STARLINE_QA__.teleport(x, zz); }, [z.x, z.z, plan.season, plan.hour]);
    for (const [k, a] of [['n', 0], ['e', Math.PI / 2], ['s', Math.PI], ['w', -Math.PI / 2]]) {
      await page.evaluate(([x, zz, a]) => {
        const g = window.__STARLINE__, T = g.camera.position.constructor, y = g.world.heightAt(x, zz);
        g.follow.cutscene({ pos: new T(x - Math.sin(a) * 6, y + 7, zz - Math.cos(a) * 6), look: new T(x + Math.sin(a) * 60, y + 2, zz + Math.cos(a) * 60) }, 0.001);
      }, [z.x, z.z, a]);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(OUT, `${id.replace(':', '_')}-${k}-${mode}.png`) });
    }
    await ctx.close();
  }
  console.log('shots for', id);
}
await browser.close();
