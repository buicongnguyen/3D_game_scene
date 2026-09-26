// Starline browser autopilot: plays the whole story through real keyboard/mouse input on a GPU browser.
//   node tests/e2e/run.mjs [--choice=alone|together] [--quality=low|medium|high] [--out=.tools/e2e]
// Uses GAME_URL if set; otherwise starts `vite` on port 5263. Needs Playwright (PLAYWRIGHT_MODULE_PATH or
// a local install) and prefers the real GPU (ANGLE d3d11 on Windows).
import { createRequire } from 'module';
import { mkdirSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { stateAt, RESUME_AT } from './fastforward.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const CHOICE = args.choice || 'alone';
const OUT = path.resolve(ROOT, args.out || '.tools/e2e');
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE_PATH || path.join(ROOT, 'node_modules/playwright');
if (!existsSync(pwPath)) {
  console.error('Playwright not found. Run `npm i -D playwright`, or set PLAYWRIGHT_MODULE_PATH to an existing install.');
  process.exit(2);
}
const { chromium } = require(pwPath);

let server = null;
let url = process.env.GAME_URL;
if (!url) {
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', '5263', '--strictPort'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, NO_HMR: '1' } });
  url = 'http://127.0.0.1:5263/';
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 60000);
    const seen = d => { if (/ready|Local/.test(String(d))) { clearTimeout(t); res(); } };
    server.stdout.on('data', seen);
    server.stderr.on('data', seen);
    server.on('exit', code => rej(new Error(`vite exited ${code}`)));
  });
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errors.push(m.text()); });

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
let shotN = 0;
const shot = name => page.screenshot({ path: path.join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`) });
const qa = (fn, arg) => page.evaluate(([f, a]) => { const Q = window.__STARLINE_QA__; return new Function('Q', 'a', `return (${f})`)(Q, a); }, [fn, arg]);
const S = () => page.evaluate(() => window.__STARLINE_QA__.state());
const sleep = ms => page.waitForTimeout(ms);
const press = async (key, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(key); await sleep(90); } };

async function settle(max = 60000) {
  const start = Date.now();
  for (;;) {
    const s = await S();
    if (s.choice) { if (CHOICE === 'together') await press('ArrowDown'); await press('Enter'); await sleep(300); continue; }
    if (s.dlg) { dbg('dlg E'); await press('KeyE'); await sleep(160); continue; }
    // idle = no dialogue, nothing owning the screen, and the director's effect queue drained
    if (!s.busy && !s.minigame && !s.running) return s;
    if (Date.now() - start > max) throw new Error(`settle timeout ${JSON.stringify(s)}`);
    await sleep(250);
  }
}

async function tp(x, z, y) { await qa('Q.teleport(a[0], a[1], a[2])', [x, z, y]); await sleep(150); }

async function interact(id, standOff = [1.2, 0]) {
  const p = await qa('Q.interactable(a)', id);
  if (!p) throw new Error(`no interactable ${id}`);
  await tp(p[0] + standOff[0], p[2] + standOff[1], p[1] > 25 ? p[1] - 0.1 : undefined);
  await qa('Q.faceToward(a[0], a[1])', [p[0], p[2]]);
  await sleep(250);
  const s = await S();
  if (s.focus !== id) log(`  (focus is ${s.focus}, wanted ${id})`);
  for (let k = 0; k < 4; k++) {
    await press('KeyE');
    await sleep(450);
    const t = await S();
    if (t.dlg || t.busy || t.minigame || t.step !== s.step || t.focus !== id) break;
  }
}

const dbg = (...a) => { if (args.debug) log('   ·', ...a); };
async function talk(id) {
  const p = await qa('Q.npc(a)', id);
  dbg('talk', id, JSON.stringify(p));
  if (!p) throw new Error(`no npc ${id}`);
  const s0 = await S();
  const dx = s0.pos[0] - p[0], dz = s0.pos[2] - p[2], l = Math.hypot(dx, dz) || 1;
  await tp(p[0] + dx / l * 1.6, p[2] + dz / l * 1.6, p[1] + 0.05);
  dbg('teleported', JSON.stringify((await S()).pos));
  await qa('Q.faceToward(a[0], a[1])', [p[0], p[2]]);
  await sleep(250);
  dbg('focus', (await S()).focus);
  // retry: a press right after a dialogue closes is swallowed by the interaction cooldown
  for (let k = 0; k < 4; k++) {
    await press('KeyE');
    await sleep(450);
    const s = await S();
    if (s.dlg || s.busy || s.step !== s0.step) break;
  }
  dbg('pressed E', JSON.stringify(await S()));
  await settle();
}

async function spark(targetId, from) {
  // stand within reach and press E: Tamo flies over and sparks it
  const t = await qa('Q.target(a)', targetId);
  if (!t) throw new Error(`no target ${targetId}`);
  if (from) await tp(from[0], from[1], from[2]);
  await sleep(300);
  await settle(); // arriving somewhere can trigger a hint dialogue first
  await qa('Q.faceToward(a[0], a[1])', [t[0], t[2]]);
  await sleep(200);
  const want = `spark:${targetId}`;
  const s0 = await S();
  if (s0.focus !== want) log(`  (focus is ${s0.focus}, wanted ${want} at ${JSON.stringify(s0.pos)})`);
  for (let k = 0; k < 4; k++) {
    await press('KeyE');
    await sleep(1300);
    const s = await S();
    if (s.focus !== want) break;
  }
  await settle();
}

async function collect(item, want) {
  const step = (await S()).step;
  for (let guard = 0; guard < 20; guard++) {
    const s = await S();
    if (s.step !== step || (s.inv?.[item] || 0) >= want) return;
    const list = await qa('Q.pickups(a)', item);
    if (!list.length) throw new Error(`no ${item} pickups left (${JSON.stringify(s.inv)})`);
    const p = list[0].pos;
    await tp(p[0], p[2], p[1] > 2.5 && item === 'cog' ? p[1] - 0.7 : undefined);
    await sleep(500);
    await settle();
  }
}

async function fishOnce() {
  await interact('fishingSpot', [-0.8, 0]);
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const f = await qa('Q.fish()');
    if (!f) break;
    if (f.phase === 'bite') await press('KeyE');
    await sleep(60);
  }
  await sleep(1200);
  await settle();
}

async function cook() {
  await interact('shrineHearth', [1.4, 0.8]);
  const start = Date.now();
  while (Date.now() - start < 20000 && (await qa('Q.cook()'))) await sleep(200);
  await settle();
}

async function herd() {
  // walk up to each sheep and press E; it trots home by itself
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const sheep = await qa('Q.sheep()');
    const todo = sheep.filter(s => !s.penned && !s.homing);
    if (!todo.length) {
      if (sheep.every(s => s.penned)) break;
      await sleep(500);
      continue;
    }
    const s = todo[0];
    await tp(s.x + 2, s.z + 1.5);
    await qa('Q.faceToward(a[0], a[1])', [s.x, s.z]);
    await sleep(250);
    const st = await S();
    if (st.focus !== `sheep${s.i}`) log(`  (focus is ${st.focus}, wanted sheep${s.i})`);
    await press('KeyE');
    await sleep(400);
  }
  log(`   sheep home in ${((Date.now() - start) / 1000).toFixed(0)} s`);
  await settle();
}

async function waitStep(from, ms = 180000) {
  const start = Date.now();
  for (;;) {
    if (from === 'c4.board' && (await S()).step === 'c4.ride') return S();
    const s = await settle(ms);
    if (s.step !== from) return s;
    if (Date.now() - start > ms) throw new Error(`stuck on ${from}: ${JSON.stringify(s)}`);
    await sleep(300);
  }
}

const SOLVE = {
  'p.arrive': async () => {},
  'p.cottage': async () => tp(-55, 140),
  'p.chest': async () => { await tp(-56.8, 142); await qa('Q.faceToward(-57.7, 142)'); await sleep(250); await press('KeyE'); },
  'p.porch': async () => spark('porchLamp', [-54, 143]),
  'c1.rin': async () => talk('rin'),
  'c1.ota': async () => talk('ota'),
  'c1.rinPlan': async () => talk('rin'),
  'c1.fish': async () => { for (let i = 0; i < 8 && (await S()).step === 'c1.fish'; i++) await fishOnce(); },
  'c1.trout': async () => talk('ota'),
  'c1.cogs': async () => {
    const p = await qa('Q.pickups("cog")');
    for (const c of p.filter(x => x.id !== 'cogCrab')) { await tp(c.pos[0], c.pos[2], c.pos[1] - 0.7); await sleep(600); await settle(); }
    const crab = await qa('Q.npc(a)', 'crab');
    await spark('crab', crab ? [crab[0] - 2, crab[2] + 1] : [-11, -17]);
    await settle();
    await sleep(1500);
    await collect('cog', 3);
  },
  'c1.wheel': async () => interact('millAxle', [1.0, 1.4]),
  'c1.lamp': async () => spark('millLamp', [-1.5, -44]),
  'c1.page': async () => talk('ota'),
  'c2.ferry': async () => interact('ferryWest', [-1.4, 0]),
  'c2.hana': async () => talk('hana'),
  'c2.sheep': herd,
  'c2.crows': async () => {
    for (let i = 0; i < 6; i++) {
      const bells = await qa('Q.targets("bell")');
      if (!bells.length) break;
      const b = bells[0];
      await spark(b.id, [b.pos[0] + 2, b.pos[2] + 2.5]);
      await settle();
    }
  },
  'c2.peaches': async () => collect('peach', 5),
  'c2.bun': async () => { await interact('ferryEast', [1.4, 0]); await settle(); await talk('genzo'); },
  'c2.key': async () => { await interact('ferryWest', [-1.4, 0]); await settle(); await talk('hana'); },
  'c2.bell': async () => { await interact('towerDoor', [0, 1.2]); await settle(); await sleep(500); await press('KeyE'); },
  'c2.lamp': async () => spark('orchardLamp'), // straight from the gallery, right under the lamp
  'c2.page': async () => talk('hana'),
  'c3.fox': async () => tp(85, -86),
  'c3.follow': async () => {
    for (let i = 0; i < 60 && (await S()).step === 'c3.follow'; i++) {
      await settle();
      const f = await qa('Q.fox()');
      dbg('fox', JSON.stringify(f));
      if (f?.pos) await tp(f.pos[0] + 2.5, f.pos[2] + 3.5);
      await sleep(1200);
    }
  },
  'c3.gather': async () => {
    await collect('chestnut', 3);
    await collect('mushroom', 2);
    await spark('hive', [98, -116]);
    await settle();
    await sleep(800);
    await collect('honeycomb', 1);
  },
  'c3.cook': cook,
  'c3.landslide': async () => tp(-50, -160),
  'c3.bear': async () => interact('bear', [0, 3.0]),
  'c3.lamp': async () => spark('forestLamp', [71, -146]),
  'c4.shed': async () => talk('genzo'),
  'c4.gather': async () => { await talk('ota'); await talk('hana'); },
  'c4.meeting': async () => tp(-98, 117.5, 16.95),
  'c4.repair': async () => { for (let i = 0; i < 3; i++) { await interact(`beam${i + 1}`, [-1.2, 0]); await settle(); await sleep(400); } },
  'c4.lamp': async () => spark('viaductLamp', [-1.4, 120, 15.7]),
  'c4.board': async () => {
    // board, answer Genzo, then hand over to the ride solver as soon as the train is under way
    const p = await qa('Q.npc(a)', 'genzo');
    await tp(p[0] - 1.6, p[2], p[1] + 0.05);
    await qa('Q.faceToward(a[0], a[1])', [p[0], p[2]]);
    await sleep(300);
    for (let k = 0; k < 60; k++) {
      const s = await S();
      if (s.step === 'c4.ride' && !s.dlg && !s.busy) return;
      await press('KeyE');
      await sleep(400);
    }
  },
  'c4.ride': async () => {
    const start = Date.now();
    let pressed = 0;
    while ((await S()).step === 'c4.ride' && Date.now() - start < 240000) {
      const s = await S();
      // answer dialogue directly: waiting for the whole queue here would block the lanterns for the entire ride
      if (s.dlg) { await press('KeyE'); continue; }
      if (s.focus?.startsWith('spark:lantern') && !s.busy) { await press('KeyE'); pressed++; await sleep(300); }
      await sleep(120);
    }
    const lit = (await S()).inv?.lanterns || 0;
    log(`   ride: pressed E ${pressed} times, lit ${lit}/8 trackside lanterns`);
    if (lit < 6) throw new Error(`only ${lit}/8 lanterns lit during the ride`);
  },
};

let exitCode = 0;
try {
  const qual = args.quality ? `&quality=${args.quality}` : '';
  if (args.from) {
    // resume from a synthetic save produced by the pure quest engine
    const quest = stateAt(args.from, CHOICE);
    const [x, z] = RESUME_AT[args.from.split('.')[0]] || [-95, 116];
    await page.goto(`${url}?qa=1&mute=1&view=0,40,0,0,0,-10`);
    await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 120000 });
    await page.evaluate(s => localStorage.setItem('starline-save-1', JSON.stringify(s)), { v: 1, quest, player: { x, y: 30, z, facing: 0 } });
    await page.goto(`${url}?qa=1&mute=1&start=continue${qual}`);
    await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 120000 });
    await sleep(1500);
    await tp(x, z);
  } else await page.goto(`${url}?qa=1&mute=1&start=new${qual}`);
  if (!args.from) await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 120000 });
  log('game started', args.from || '');
  let lastChapter = -1;
  for (let guard = 0; guard < 80; guard++) {
    // the Star Train ride is one long running cutscene: play it instead of waiting for it to end
    const s = (await S()).step === 'c4.ride' ? await S() : await settle(120000);
    if (s.chapter !== lastChapter) { lastChapter = s.chapter; await sleep(600); await shot(`chapter${s.chapter}-${s.step}`); }
    if (s.step === 'e.free') break;
    const solve = SOLVE[s.step];
    if (!solve) throw new Error(`no solver for ${s.step}`);
    const mem = await page.evaluate(() => { const r = __STARLINE_QA__.game.renderer.renderer; return { geo: r.info.memory.geometries, tex: r.info.memory.textures, prog: r.info.programs?.length, heap: Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6), calls: r.info.render.calls, tris: Math.round(r.info.render.triangles / 1000) }; });
    log(`${s.step}  fps=${s.fps} pos=${JSON.stringify(s.pos)} mem=${JSON.stringify(mem)}`);
    await solve();
    await waitStep(s.step);
  }
  const s = await settle(180000);
  await shot('epilogue');
  const lit = Object.keys(s.lamps || {}).filter(k => s.lamps[k]);
  if (s.step !== 'e.free' || lit.length !== 4) throw new Error(`did not finish: ${JSON.stringify(s)}`);
  log(`FINISHED the story (${CHOICE}) in ${((Date.now() - t0) / 60000).toFixed(1)} min; lamps: ${lit.join(', ')}`);
  // menus: the journal opened from the pause menu must be the panel on screen, and Esc/J must work while paused
  const shown = () => page.evaluate(() => ['pause', 'journal', 'settings'].filter(id => !document.getElementById(id).classList.contains('hidden')).join(','));
  await page.click('#btnMenu'); await sleep(300);
  await page.click('#btnPauseJournal'); await sleep(300);
  if (await shown() !== 'journal') throw new Error(`pause > Journal shows [${await shown()}]`);
  await press('Escape'); await sleep(300);
  if (await shown() !== 'pause') throw new Error(`Esc from the journal shows [${await shown()}]`);
  await press('KeyJ'); await sleep(300);
  if (await shown() !== 'journal') throw new Error(`J in the pause menu shows [${await shown()}]`);
  await press('Escape'); await sleep(200); await press('Escape'); await sleep(300);
  if (await shown() !== '' || await page.evaluate(() => __STARLINE_QA__.game.paused)) throw new Error('Esc Esc did not resume the game');
  log('   menus: pause > journal > back > resume all work');
} catch (e) {
  exitCode = 1;
  console.error('FAILED:', e.message);
  console.error('trace:', JSON.stringify(await page.evaluate(() => window.__STARLINE_QA__?.trace()).catch(() => null)));
  console.error('probe:', JSON.stringify(await page.evaluate(async () => {
    const Q = window.__STARLINE_QA__; const sc = Q?.director.scenes;
    const t0 = performance.now(); await new Promise(r => setTimeout(r, 200));
    return { timerMs: Math.round(performance.now() - t0), active: sc?.active , paused: Q?.game.paused, hidden: document.hidden };
  }).catch(e => String(e))));
  await shot('failure').catch(() => {});
} finally {
  if (errors.length) { console.error('Page errors:\n' + errors.slice(0, 20).join('\n')); exitCode = 1; }
  await browser.close();
  server?.kill();
  process.exit(exitCode);
}
