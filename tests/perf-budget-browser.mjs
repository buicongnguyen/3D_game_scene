// The performance budget: draw calls, triangles and visible scene objects at three busy places, on the phone tier and on
// High, against limits recorded in tests/perf/budget.json (docs/PLAY-ZONES-PLAN.md, review gap 8). Run before a push that
// adds people, props, decorations or effects:
//   GAME_URL=http://127.0.0.1:5897/ node tests/perf-budget-browser.mjs            # fails when a number is over its limit
//   GAME_URL=http://127.0.0.1:5897/ node tests/perf-budget-browser.mjs --record   # writes the limits: today's numbers + headroom
// (a vite preview of the production build must be running there). Counts are not timings: they do not move with the
// load on the machine, so this is a test that can fail for a real reason only. Lower numbers are fine and are reported;
// after an intended improvement, record again to tighten the limits.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { exploreState } from '../src/game/fastforward.js';

const args = new Set(process.argv.slice(2));
const url = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const FILE = new URL('./perf/budget.json', import.meta.url);
const SPOTS = { kawabe: [-26, 20, -20, 37], takamori: [110, -16, 123, 12], station: [-98, 104, -60, 140] };
const HEADROOM = { draws: 1.08, tris: 1.1, visible: 1.1 };
const SAVE = JSON.stringify({ v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: 1760000000000 });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const got = {};
try {
  for (const q of ['low', 'high']) {
    const ctx = await browser.newContext(q === 'low' ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(s => localStorage.setItem('starline-save-explore', s), SAVE);
    const page = await ctx.newPage();
    await page.goto(`${url}?mute&qa=1&quality=${q}&start=explore&slot=explore&pace=off`);
    await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__?.teleport, null, { timeout: 240000 });
    await page.evaluate(() => { const g = window.__STARLINE__; g.seasonOverride = 'summer'; g.timeOverride = 11; g.weatherOff = true; g.applyLook(); });
    for (const [name, [x, z, lx, lz]] of Object.entries(SPOTS)) {
      await page.evaluate(([x, z, lx, lz]) => { const qa = window.__STARLINE_QA__; qa.teleport(x, z); qa.faceToward(lx, lz); }, [x, z, lx, lz]);
      await page.waitForTimeout(4000);
      got[`${q}:${name}`] = await page.evaluate(() => new Promise(done => {
        const g = window.__STARLINE__, R = g.renderer.renderer, orig = R.renderBufferDirect;
        let n = 0, draws = 0, tris = 0;
        R.renderBufferDirect = function (cam, scene, geometry, material, object) {
          draws++; tris += ((geometry.index ? geometry.index.count : geometry.attributes.position?.count || 0) / 3) * (object.isInstancedMesh ? object.count : 1);
          return orig.apply(this, arguments);
        };
        const tick = () => {
          if (++n < 20) return requestAnimationFrame(tick);
          R.renderBufferDirect = orig;
          let visible = 0; const walk = o => { if (o.visible === false) return; visible++; for (const c of o.children) walk(c); }; walk(g.scene);
          done({ draws: Math.round(draws / n), tris: Math.round(tris / n), visible });
        };
        requestAnimationFrame(tick);
      }));
    }
    await ctx.close();
  }
} finally { await browser.close(); }

if (args.has('--record')) {
  const out = {};
  for (const [k, v] of Object.entries(got)) out[k] = Object.fromEntries(Object.entries(v).map(([m, n]) => [m, Math.ceil(n * HEADROOM[m])]));
  fs.writeFileSync(FILE, JSON.stringify({ note: 'limits = the numbers measured when recorded, plus headroom (draws 8%, tris and visible objects 10%); tests/perf-budget-browser.mjs --record to tighten', recorded: new Date().toISOString().slice(0, 10), limits: out }, null, 1) + '\n');
  console.log('recorded', Object.keys(out).length, 'places:', JSON.stringify(got));
  process.exit(0);
}
const limits = JSON.parse(fs.readFileSync(FILE, 'utf8')).limits;
let bad = 0;
for (const [k, v] of Object.entries(got)) {
  const L = limits[k];
  const row = Object.entries(v).map(([m, n]) => `${m} ${n}/${L?.[m] ?? '?'}`).join('  ');
  const over = Object.entries(v).filter(([m, n]) => L && n > L[m]);
  console.log(`${over.length ? 'FAIL' : 'ok  '} ${k.padEnd(14)} ${row}`);
  if (over.length || !L) bad++;
}
console.log(bad ? `${bad} place(s) over budget` : 'all within budget');
process.exit(bad ? 1 : 0);
