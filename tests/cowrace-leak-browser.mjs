// A cow race must not leave geometry on the GPU: replay it and list what it made and never freed.
//   GAME_URL=http://127.0.0.1:5853/ node tests/cowrace-leak-browser.mjs [replays=4] [quality=medium] [id=trick:cowrace] [full]
// How it counts: three.js listens for 'dispose' on a geometry the first time it uploads it, so that listener is the moment a
// geometry reaches the GPU; BufferGeometry.dispose takes it off the list. After the replays, a geometry made in replay 2 or
// later is a LEAK when it is still alive and the mesh that drew it has left the scene. (Models that simply come into view
// for the first time, the train for one, stay attached and are not counted: they made a plain count grow by 42 and looked
// like a leak of 35 geometries per replay.)
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve('node_modules/playwright'));
const url = process.env.GAME_URL || 'http://127.0.0.1:5853/';
const N = +(process.argv[2] || 4), Q = process.argv[3] || 'medium', ID = process.argv[4] || 'trick:cowrace';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`${url}?mute&qa=1&tourtest=1&quality=${Q}`);
await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 240000 });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const g = window.__STARLINE__;
  let geo = null; g.scene.traverse(o => { if (!geo && o.isMesh && o.geometry?.isBufferGeometry) geo = o.geometry; });
  let ED = geo, BG = geo;
  while (ED && !Object.prototype.hasOwnProperty.call(ED, 'addEventListener')) ED = Object.getPrototypeOf(ED);
  while (BG && !Object.prototype.hasOwnProperty.call(BG, 'computeBoundingSphere')) BG = Object.getPrototypeOf(BG);
  const live = window.__geo = new Map(); window.__tag = 0;
  const add = ED.addEventListener, disp = BG.dispose;
  ED.addEventListener = function (type, fn) { if (type === 'dispose' && this.isBufferGeometry && !live.has(this)) live.set(this, { tag: window.__tag, owner: null }); return add.call(this, type, fn); };
  BG.dispose = function () { live.delete(this); return disp.call(this); };
  setInterval(() => { g.scene.traverse(o => { const r = o.geometry && live.get(o.geometry); if (r && !r.owner) { r.obj = o; let p = o, s = []; while (p && s.length < 5) { s.push(p.name || p.type); p = p.parent; } r.owner = s.join(' < '); } }); }, 300);
});
const hit = sel => page.click(sel);
const S = () => { const g = window.__STARLINE__, d = g.director; return d?.quest ? { round: d.tricks?.round?.id || d.yard?.round?.id || null, busy: d.busy, run: !!d.minigameMenu?.running, chip: !document.getElementById('mgChip').classList.contains('hidden'), geo: g.renderer.renderer.info.memory.geometries, tex: g.renderer.renderer.info.memory.textures } : null; };
let door = '#btnTitleMini'; const counts = [];
for (let i = 0; i <= N; i++) {
  await page.evaluate(i => { window.__tag = i; }, i);
  await hit(door);
  await page.waitForSelector('#mgPicker:not(.hidden)');
  for (const c of await page.evaluate(() => [...document.querySelectorAll('.mg-tab')].map(t => t.dataset.cat))) { await hit(`.mg-tab[data-cat=${c}]`); if (await page.$(`.mg-card[data-id="${ID}"]`)) break; }
  await hit(`.mg-card[data-id="${ID}"]`);
  for (let k = 0; k < 80; k++) { const s = await page.evaluate(S); if (s?.busy > 0) await page.keyboard.press('KeyE'); if (s?.round && !s.busy) break; await page.waitForTimeout(400); }
  await page.waitForTimeout(5000);
  await page.keyboard.press('KeyE');                 // the "Let's race!" card
  if (process.argv[5] === 'full') { for (let k = 0; k < 220; k++) { if (await page.evaluate(() => !document.getElementById('trickCard').classList.contains('hidden'))) break; await page.keyboard.press('KeyE'); await page.waitForTimeout(550); } await page.waitForTimeout(1500); await page.keyboard.press('KeyE'); }
  else await page.waitForTimeout(6000);
  for (let k = 0; k < 80; k++) { const s = await page.evaluate(S); if (s && !s.round && !s.run && s.chip) break; await page.keyboard.press(s?.busy > 0 ? 'KeyE' : 'Backspace'); await page.waitForTimeout(500); }
  await page.waitForTimeout(1500);
  const s = await page.evaluate(S); counts.push(s.geo);
  console.log(`after play ${i}: geometries ${s.geo}, textures ${s.tex}`);
  door = '#mgChip';
}
const left = await page.evaluate(() => {
  const g = window.__STARLINE__, inScene = o => { for (let p = o; p; p = p.parent) if (p === g.scene) return true; return false; }, by = {};
  for (const [geo, r] of window.__geo) { if (r.tag < 2 || (r.obj && inScene(r.obj))) continue; const k = `${r.owner || '(never drawn from the scene)'} | ${geo.type} ${geo.attributes.position?.count ?? 0}v`; by[k] = (by[k] || 0) + 1; }
  return Object.entries(by).sort((a, b) => b[1] - a[1]);
});
const leaked = left.reduce((n, [, c]) => n + c, 0);
console.log(`geometry counts after each play: ${counts.join(', ')}`);
for (const [k, n] of left.slice(0, 25)) console.log(`  LEAKED ${n} x ${k}`);
console.log(leaked > 2 ? `FAIL: ${leaked} geometries made by replays 2..${N} were never disposed` : `ok: nothing made by replays 2..${N} is left without its mesh (${leaked} stray)`);
await browser.close();
process.exit(leaked > 2 ? 1 : 0);
