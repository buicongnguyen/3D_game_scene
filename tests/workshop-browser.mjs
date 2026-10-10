// The Kite workshop in a real browser: the whole build by mouse, by keyboard only and by touch on a portrait phone
// (every mistake once, leaving half-way and coming back, also across a reload), then flying with and without the motors.
//   node tests/workshop-browser.mjs [--only=mouse,keys,touch,classic,plain,built,phone,low] [--out=.tools/review/workshop]
// Uses GAME_URL if set; otherwise starts vite on port 5835. Needs Playwright and prefers the real GPU.
//
// It checks that
//   • the cradle offers the workshop once it is open, and every step works with each kind of input (targets >= 52 px);
//   • the spoon, the hub, a twisting propeller layout and a wrong socket each count as one mistake and nothing breaks;
//   • leaving keeps the step (and the bench leaves nothing in the scene or on the GPU); the build is saved with its stars;
//   • the plain kite flies with its old numbers (9 / 20 / 5.5 m/s, a slow stop), the motor kite with the new ones while the
//     battery lasts, a flat battery is the plain kite again, and it recharges on the ground and faster by the Mill Lamp.
import { createRequire } from 'module';
import { mkdirSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { stateAt } from './e2e/fastforward.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const OUT = path.resolve(ROOT, args.out || '.tools/review/workshop');
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE_PATH || path.join(ROOT, 'node_modules/playwright');
if (!existsSync(pwPath)) { console.error('Playwright not found.'); process.exit(2); }
const { chromium } = require(pwPath);

let server = null, URL0 = process.env.GAME_URL;
if (!URL0) {
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', '5835', '--strictPort'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, NO_HMR: '1' } });
  URL0 = 'http://127.0.0.1:5835/';
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 60000);
    const seen = d => { if (/ready|Local/.test(String(d))) { clearTimeout(t); res(); } };
    server.stdout.on('data', seen); server.stderr.on('data', seen);
    server.on('exit', code => rej(new Error(`vite exited ${code}`)));
  });
}
const DEVICES = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};
/** A save at `step` of `story`, with the Star Kite in Mika's hands. */
function save(step, story, mut = () => {}, player = { x: -55, y: 17, z: 141, facing: 3.1 }) {
  const quest = stateAt(step, 'together', story);
  quest.inv.kite = 1;
  mut(quest);
  return JSON.stringify({ v: 1, quest, player, at: 1760000000000 });
}
async function boot(browser, dev, SAVE, query) {
  const d = DEVICES[dev];
  const ctx = await browser.newContext({ viewport: d.viewport, hasTouch: !!d.hasTouch, isMobile: !!d.isMobile, deviceScaleFactor: d.deviceScaleFactor || 1 });
  // (once per tab: a reload must find the save the game wrote, not this one again)
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('starline-save-1', s); localStorage.setItem('starline-last-slot', '1'); } }, SAVE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${URL0}?${query}`);
  await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
const failures = [];

/** The whole build. mode: mouse | keys | touch; story: grandma | classic. */
async function build(b, mode, story) {
  const dev = mode === 'touch' ? 'phone' : 'desktop', tag = `${mode}${story === 'classic' ? '-classic' : ''}`;
  const SAVE = story === 'grandma' ? save('c1.page', 'grandma') : save('c1.rin', 'classic');
  const { page, errors, ctx } = await boot(b, dev, SAVE, 'qa=1&mute=1&start=continue');
  const fails = [];
  const cdp = await ctx.newCDPSession(page);
  const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log('  FAIL', msg); } };
  const log = (...a) => console.log(`[${tag}]`, ...a);
  const wait = ms => page.waitForTimeout(ms);
  const qa = () => page.evaluate(() => window.__STARLINE__.director.workshop.qa());
  const ws = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__STARLINE__.director.q.state.workshop)));
  const COUNTS = () => page.evaluate(() => { const g = window.__STARLINE__, m = g.renderer.renderer.info.memory; let n = 0; g.scene.traverse(o => { if (o.name.startsWith('workshop:')) n++; }); return { objects: n, geometries: m.geometries, textures: m.textures, body: document.body.children.length, cls: document.body.className }; });
  const S = n => shot(page, `${tag}-${n}`);
  const tap = async (x, y) => { if (mode === 'touch') await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await wait(120); };
  const drag = async (a, bb) => {
    const steps = 8;
    if (mode === 'touch') {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1], id: 1 }] });
      for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a[0] + (bb[0] - a[0]) * i / steps, y: a[1] + (bb[1] - a[1]) * i / steps, id: 1 }] }); await wait(25); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(a[0], a[1]); await page.mouse.down();
      for (let i = 1; i <= steps; i++) { await page.mouse.move(a[0] + (bb[0] - a[0]) * i / steps, a[1] + (bb[1] - a[1]) * i / steps); await wait(25); }
      await page.mouse.up();
    }
    await wait(150);
  };
  const key = async (k, ms = 60) => { await page.keyboard.down(k); await wait(ms); await page.keyboard.up(k); await wait(90); };
  const item = async id => (await qa()).items.find(n => n.id === id);
  const target = async id => (await qa()).targets.find(n => n.id === id);
  /** Keyboard: walk the highlight to `id` (an item or a target). */
  async function focusOn(id) {
    for (let i = 0; i < 40; i++) {
      const q = await qa(), all = [...q.items, ...q.targets], goal = all.find(n => n.id === id), cur = all.find(n => n.id === q.focus);
      if (!goal) throw new Error(`no ${id} to focus (step ${q.step})`);
      if (q.focus === id) return;
      if (!cur) { await key('KeyE'); continue; }
      const dx = goal.x - cur.x, dy = goal.y - cur.y;
      const order = Math.abs(dx) > Math.abs(dy) ? [dx > 0 ? 'KeyD' : 'KeyA', dy > 0 ? 'KeyS' : 'KeyW'] : [dy > 0 ? 'KeyS' : 'KeyW', dx > 0 ? 'KeyD' : 'KeyA'];
      await key(order[0]);
      if ((await qa()).focus === q.focus) await key(order[1]);
      if ((await qa()).focus === q.focus) await key(['KeyA', 'KeyW', 'KeyD', 'KeyS'][i % 4]);
    }
    throw new Error(`could not focus ${id}`);
  }
  /** Take a thing (and put it at `to`), the way this mode does it. alt: tap-tap instead of a drag. */
  async function act(id, to = null, alt = false) {
    if (mode === 'keys') {
      await focusOn(id); await key('KeyE');
      if (to) { await focusOn(to); await key('KeyE'); }
      await wait(250);
      return;
    }
    const a = await item(id);
    if (!a) throw new Error(`no item ${id}`);
    if (!to) { await tap(a.x, a.y); await wait(200); return; }
    if (alt) {
      await tap(a.x, a.y);
      const t = await target(to);
      if (!t) throw new Error(`no target ${to}`);
      await tap(t.x, t.y); await wait(250);
      return;
    }
    // drag: the target list only exists once the thing is in hand, so look it up from a selection first
    await tap(a.x, a.y);
    const t = await target(to);
    await tap(a.x, a.y);
    if (!t) throw new Error(`no target ${to}`);
    await drag([a.x, a.y], [t.x, t.y]); await wait(250);
  }
  const button = async () => { if (mode === 'keys') await key('Space'); else if (mode === 'touch') await page.tap('#wsAct', { force: true }); else await page.click('#wsAct', { force: true }); await wait(200); };
  async function skipTalk(max = 14) {
    for (let i = 0; i < max; i++) {
      const st = await page.evaluate(() => window.__STARLINE_QA__.state());
      if (!st.dlg) { if (i > 0) return; await wait(300); continue; }
      if (mode === 'touch') await page.touchscreen.tap(195, 760); else await key('KeyE');
      await wait(450);
    }
  }
  async function openIt(first) {
    await page.evaluate(() => { const g = window.__STARLINE__, d = g.director, ks = d.kiteStand, room = g.interiors.rooms.get('cottage'); g.player.teleport(ks.pos.x + 0.3, ks.pos.z + 1.5, room.floorY, Math.PI); });
    await wait(900);
    const st = await page.evaluate(() => window.__STARLINE_QA__.state());
    check(st.focus === 'kiteWorkshop', `prompt at the cradle is ${st.focus}`);
    if (first) await S('00-prompt');
    if (mode === 'touch') await page.tap('#tAct'); else await key('KeyE');
    await wait(700);
    if (first) { await S('01-intro'); await skipTalk(); }
    await wait(1500);
  }

  // ---- into the cottage
  await page.evaluate(async () => { const d = window.__STARLINE__.director; await d.enterHome('cottage'); });
  await wait(800); await skipTalk(); await wait(500);
  let base = await COUNTS();
  log('open?', await page.evaluate(() => window.__STARLINE__.director.workshop.open()), JSON.stringify(await ws()));
  await openIt(true);
  let q = await qa();
  check(q.active && q.step === 'pick', 'starts at the pick step');
  log('view', JSON.stringify(q.view), 'smallest target px', Math.min(...q.items.map(n => n.r * 2)));
  await S('10-pick');
  // ---- a: pick (a decoy first)
  await act('spoon'); await wait(300);
  await S('11-pick-spoon');
  check((await qa()).mistakes === 1, 'the spoon is a mistake');
  await wait(700);
  for (const id of ['motor0', 'motor1', 'motor2', 'motor3', 'prop0', 'prop1', 'prop2', 'prop3', 'battery', 'switch']) await act(id);
  await S('12-pick-almost');
  await act('wire'); await wait(1300);
  q = await qa(); check(q.step === 'motors', `after the parts: ${q.step}`);
  await S('20-motors');
  // ---- b: motors (a wrong place first)
  await act('motor0', 'hub', true); await wait(350);
  await S('21-motors-wrong');
  await wait(1100);
  check((await qa()).mistakes === 2, 'the hub is a mistake');
  await act('motor0', 'FL'); await act('motor1', 'FR', true); await S('22-motors-two');
  await act('motor2', 'BR'); await act('motor3', 'BL', true); await wait(1200);
  q = await qa(); check(q.step === 'props', `after the motors: ${q.step} ${JSON.stringify(q.slots)}`);
  await S('30-props');
  // ---- c: propellers: front pair the same (wrong), spin test, swap, test again
  await act('prop0', 'FL'); await act('prop1', 'FR', true); await act('prop2', 'BL'); await act('prop3', 'BR', true); await wait(500);
  await S('31-props-wrong');
  await button(); await wait(1700); await S('32-test-twist'); await wait(2600);
  q = await qa(); check(q.step === 'props' && q.mistakes === 3, `a failed spin test is a mistake (${q.step}, ${q.mistakes})`);
  await S('33-test-failed');
  await act('prop1', 'BL', true); await wait(600);
  q = await qa(); check(q.layout.FR === 'ccw' && q.layout.BL === 'cw', `swap ${JSON.stringify(q.layout)}`);
  await S('34-props-right');
  // ---- leave here and come back
  if (mode === 'touch') await page.tap('#wsLeave'); else if (mode === 'keys') await key('Backspace'); else await page.click('#wsLeave');
  await wait(900);
  let rec = await ws();
  check(rec.prog?.step === 2 && rec.prog.mistakes === 3 && !rec.built, `progress kept: ${JSON.stringify(rec.prog)}`);
  const mid = await COUNTS();
  check(mid.objects === base.objects && mid.geometries === base.geometries && mid.textures === base.textures && mid.body === base.body && mid.cls === base.cls, `counts after leaving ${JSON.stringify(mid)} vs ${JSON.stringify(base)}`);
  await S('35-left');
  if (mode === 'mouse') {
    // closing the game and coming back keeps the step, too
    await page.reload();
    await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__, null, { timeout: 180000 });
    await wait(1500);
    rec = await ws();
    check(rec.prog?.step === 2 && rec.prog.mistakes === 3, `progress after a reload: ${JSON.stringify(rec.prog)}`);
    await page.evaluate(async () => { const d = window.__STARLINE__.director; await d.enterHome('cottage'); });
    await wait(800); await skipTalk(); await wait(500);
    base = await COUNTS();          // a new page: its own baseline
  }
  await openIt(false);
  q = await qa(); check(q.step === 'props' && q.mistakes === 3 && Object.keys(q.slots).length === 4, `resumed at ${q.step} ${q.mistakes}`);
  await S('36-resumed');
  await act('prop0', 'FL'); await act('prop1', 'BR', true); await act('prop2', 'BL'); await act('prop3', 'FR', true); await wait(400);
  await button(); await wait(1700); await S('37-test-level'); await wait(2800);
  q = await qa(); check(q.step === 'wire', `after a good spin test: ${q.step}`);
  await wait(900);
  await S('40-wire');
  // ---- d: wires (a wrong socket first)
  await act('bat+', 'lug', true); await wait(300);
  await S('41-wire-wrong');
  check((await qa()).mistakes === 4, 'a wrong socket is a mistake');
  await wait(600);
  await act('bat+', 'sw-in'); await act('sw-yellow', 'motor0', true); await S('42-wire-two');
  await act('sw-green', 'motor1'); await act('sw-blue', 'motor2', true); await act('sw-pink', 'motor3');
  await S('43-wire-five');
  await act('bat-', 'lug', true); await wait(1300);
  q = await qa(); check(q.step === 'balance', `after the wires: ${q.step}`);
  await S('50-balance');
  // ---- e: balance
  if (mode === 'keys') {
    for (let i = 0; i < 30; i++) {
      q = await qa();
      const e = q.ideal - q.bal;
      if (Math.abs(e) < 0.02) break;
      await key(e > 0 ? 'KeyW' : 'KeyS', Math.max(40, Math.min(900, Math.abs(e) / 0.3 * 1000 * 0.8)));
    }
  } else {
    q = await qa();
    const at = t => [q.rail[0][0] + (q.rail[1][0] - q.rail[0][0]) * t, q.rail[0][1] + (q.rail[1][1] - q.rail[0][1]) * t];
    const from = at(q.bal), half = at((q.bal + q.ideal) / 2 + 0.2), to = at(q.ideal);
    await drag(from, half); await wait(500); await S('51-balance-off');
    await drag(half, to);
  }
  await wait(1200);
  q = await qa(); check(Math.abs(q.bal - q.ideal) < 0.045, `battery at ${q.bal} for ${q.ideal}`);
  await S('52-balance-level');
  await button(); await wait(900);
  q = await qa(); check(q.step === 'switch', `after the balance: ${q.step}`);
  await S('60-switch');
  // ---- f: switch on
  if (mode === 'keys') await key('KeyE'); else await act('switch');
  await wait(1500); await S('61-spinup');
  await wait(2400); await S('62-hover');
  await wait(1500); await S('63-talk');
  if (mode === 'touch') await page.touchscreen.tap(195, 760); else await key('KeyE');
  await wait(900); await S('64-talk-grandma');
  await skipTalk(); await wait(2600);
  await S('70-card');
  rec = await ws();
  log('record', JSON.stringify(rec));
  check(rec.built && rec.stars >= 1 && rec.prog === null && rec.plays === 1, 'the build is recorded');
  check(await page.evaluate(() => !document.getElementById('trickCard').classList.contains('hidden')), 'the results card is up');
  if (mode === 'touch') await page.tap('#trickCard .done'); else if (mode === 'keys') await key('KeyE'); else await page.click('#trickCard .done');
  await wait(1200);
  await S('71-after');
  const end = await COUNTS();
  // the kit now hangs on the kite and on the one in the cradle: two meshes sharing one geometry
  log('counts', JSON.stringify(base), JSON.stringify(end));
  check(end.objects === base.objects + 2 && end.geometries <= base.geometries + 1 && end.textures === base.textures && end.body === base.body && end.cls === base.cls, 'only the kite kit is left behind');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('starline-save-1')).quest);
  check(saved.workshop?.built && !saved.tricks.workshop, `saved: ${JSON.stringify(saved.workshop)} tricks ${Object.keys(saved.tricks)}`);
  const st = await page.evaluate(() => window.__STARLINE_QA__.state());
  check(!st.busy && !st.dlg, 'the game is free again');

  for (const e of errors) fails.push(`console: ${e}`);
  log(fails.length ? `${fails.length} FAILED` : 'ok');
  failures.push(...fails.map(f => `${tag}: ${f}`));
  await ctx.close();
}

/** Flying. kind: plain | built; dev: desktop | phone; quality: '' | low. */
async function flight(b, kind, dev, quality) {
  const tag = `fly-${kind}${dev === 'phone' ? '-phone' : ''}${quality ? '-' + quality : ''}`;
  const SAVE = save('e.done', 'grandma', q => { q.flags.huntAsked = true; if (kind === 'built') q.workshop = { built: true, stars: 2, best: 76, plays: 1, prog: null }; }, { x: -28, y: 6, z: 70, facing: 0 });
  const { page, errors, ctx } = await boot(b, dev, SAVE, `qa=1&mute=1&start=continue${quality ? '&quality=' + quality : ''}`);
  const fails = [];
  const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log('  FAIL', msg); } };
  const log = (...a) => console.log(`[${tag}]`, ...a);
  const wait = ms => page.waitForTimeout(ms);
  const S = n => shot(page, `${tag}-${n}`);
  const K = () => page.evaluate(() => {
    const g = window.__STARLINE__, k = g.kite, w = g.director.workshop;
    return { state: k.state, speed: +k.speed.toFixed(2), vy: +k.vel.y.toFixed(2), y: +k.pos.y.toFixed(1), charge: +w.charge.toFixed(3), assist: !!k.assist, near: w.nearPower, N: w.N,
      gauge: !document.getElementById('kiteBat').classList.contains('hidden'), gaugeCls: document.getElementById('kiteBat').className, boostBtn: !document.getElementById('tBoost').classList.contains('hidden'),
      kit: !!k.model.getObjectByName('workshop:kite-kit'), fps: g.fps };
  });
  const down = k => page.keyboard.down(k), up = k => page.keyboard.up(k);
  await wait(1000);
  await page.evaluate(() => { const g = window.__STARLINE__; g.player.teleport(-140, 165); g.follow.yaw = Math.PI; });
  await wait(600);
  let k = await K();
  log('start', JSON.stringify(k));
  check(k.assist === (kind === 'built'), `assist ${k.assist}`);
  check(k.kit === (kind === 'built'), `kit on the kite: ${k.kit}`);
  // take-off from a standstill
  const t0 = Date.now();
  await page.keyboard.press('KeyG');
  await page.waitForFunction(() => window.__STARLINE__.kite.state === 'fly', null, { timeout: 15000 });
  const liftMs = Date.now() - t0;
  log('launch to flying', liftMs, 'ms');
  await wait(400);
  k = await K();
  check(k.gauge === (kind === 'built'), `gauge shown: ${k.gauge}`);
  // up out of the trees, then from a standstill to cruise
  await down('Space'); await wait(3500); await up('Space'); await wait(1500);
  await page.evaluate(() => { window.__STARLINE__.follow.yaw = Math.PI; });
  await down('KeyW');
  await wait(1000); const v1 = (await K()).speed;
  await wait(5000); const cruise = (await K()).speed;
  await S('1-cruise');
  // boost
  await down('ShiftLeft');
  await wait(6000); k = await K(); const boost = k.speed, cBoost = k.charge;
  await S('2-boost');
  check(kind === 'built' ? /boost/.test(k.gaugeCls) : true, `gauge glows while boosting: ${k.gaugeCls}`);
  await up('ShiftLeft');
  await wait(3000);
  // let go: how long to stop
  await up('KeyW');
  const stop0 = Date.now(); let stopMs = -1;
  for (let i = 0; i < 80; i++) { await wait(100); if ((await K()).speed < 0.5) { stopMs = Date.now() - stop0; break; } }
  await wait(800);
  k = await K(); const y0 = k.y;
  await S('3-hover');
  // hover: stays put for 3 s
  const p0 = await page.evaluate(() => window.__STARLINE__.kite.pos.toArray());
  await wait(3000);
  const p1 = await page.evaluate(() => window.__STARLINE__.kite.pos.toArray());
  const drift = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), sink = p0[1] - p1[1];
  // climb
  await down('Space'); await wait(2500); const climb = (await K()).vy; await wait(1500); await up('Space');
  await wait(1500);
  log(JSON.stringify(await page.evaluate(() => window.__STARLINE__.kite.pos.toArray().map(v => +v.toFixed(0)))), JSON.stringify({ v1, cruise, boost, cBoost, stopMs, drift: +drift.toFixed(2), sink: +sink.toFixed(2), climb, y0 }));
  check(Math.abs(cruise - 9) < 0.4, `cruise ${cruise}`);
  if (kind === 'plain') {
    check(Math.abs(boost - 20) < 0.6, `plain boost ${boost}`);
    check(Math.abs(climb - 5.5) < 0.3, `plain climb ${climb}`);
    check(stopMs > 2300, `plain stop ${stopMs}`);
    check(liftMs > 2700, `plain launch ${liftMs}`);
    check(k.charge === 1 && !k.gauge, 'no battery business on the plain kite');
  } else {
    check(Math.abs(boost - 27) < 0.8, `motor boost ${boost}`);
    check(Math.abs(climb - 8.5) < 0.4, `motor climb ${climb}`);
    check(stopMs > 0 && stopMs < 1400, `motor stop ${stopMs}`);
    check(cBoost < 0.88 && cBoost > 0.7, `six seconds of boost (and a climb) used ${1 - cBoost}`);
    check(v1 > 6.5, `brisk off the mark: ${v1} m/s after one second`);
  }
  check(drift < 0.3 && Math.abs(sink) < 0.3, `hover holds: drift ${drift}, sink ${sink}`);
  // close and from the chase camera, by day and at dusk
  const close = async name => {
    await page.evaluate(() => { const g = window.__STARLINE__, k = g.kite, T = k.pos.constructor, h = k.heading; g.follow.cutscene({ pos: new T(k.pos.x - Math.sin(h) * 2.4 + Math.cos(h) * 1.6, k.pos.y - 0.5, k.pos.z - Math.cos(h) * 2.4 - Math.sin(h) * 1.6), look: new T(k.pos.x, k.pos.y + 0.55, k.pos.z) }, 0.01); });
    await wait(700); await S(name);
    await page.evaluate(() => { const g = window.__STARLINE__, k = g.kite, T = k.pos.constructor, h = k.heading; g.follow.cutscene({ pos: new T(k.pos.x + Math.sin(h) * 1.8 + Math.cos(h) * 1.2, k.pos.y + 2.1, k.pos.z + Math.cos(h) * 1.8 - Math.sin(h) * 1.2), look: new T(k.pos.x, k.pos.y + 0.7, k.pos.z) }, 0.01); });
    await wait(700); await S(name + '-above');
    await page.evaluate(() => window.__STARLINE__.follow.clearCutscene(true));
    await wait(500);
  };
  await close('4-close-day');
  await page.evaluate(() => { window.__STARLINE__.timeOverride = 18.9; });
  await wait(2500);
  await S('5-chase-dusk');
  await close('6-close-dusk');
  await down('KeyW'); await down('ShiftLeft'); await wait(2500); await S('7-boost-dusk'); await up('ShiftLeft'); await up('KeyW');
  await page.evaluate(() => { window.__STARLINE__.timeOverride = null; });
  await wait(1500);
  if (kind === 'built') {
    // drain to zero: the last tenth fades out to the plain kite, then it simply is the plain kite
    await page.evaluate(() => { window.__STARLINE__.director.workshop.charge = 0.12; });
    await down('KeyW'); await down('ShiftLeft');
    const fade = [];
    for (let i = 0; i < 14; i++) { await wait(500); const q = await K(); fade.push([q.charge, q.speed]); }
    log('fade', JSON.stringify(fade));
    k = await K();
    check(k.charge === 0, `drained: ${k.charge}`);
    const flat = fade.find(f => f[0] === 0);
    check(flat && Math.abs(flat[1] - 20) < 0.7, `flat battery boosts like the plain kite: ${flat}`);
    check(/empty/.test(k.gaugeCls), `gauge empty: ${k.gaugeCls}`);
    check(k.state === 'fly', 'still flying on a flat battery');
    await S('8-flat');
    await up('ShiftLeft'); await up('KeyW');
    await down('Space'); await wait(2500); const c0 = (await K()).vy; await up('Space');
    check(Math.abs(c0 - 5.5) < 0.3, `flat battery climbs like the plain kite: ${c0}`);
    // land and recharge
    await wait(800);
    await page.keyboard.press('KeyG');
    await page.waitForFunction(() => !window.__STARLINE__.kite.carrying, null, { timeout: 40000 });
    await wait(600);
    const a = await K(); await wait(4000); const bq = await K();
    const rate = (bq.charge - a.charge) / 4;
    log('ground charge per second', rate.toFixed(4), 'near', bq.near, JSON.stringify(bq));
    check(Math.abs(rate - 1 / 40) < 0.006 && !bq.near, `ground rate ${rate}`);
    check(bq.gauge, 'gauge stays while it charges');
    await S('9-charging');
    // by the Mill Lamp
    await page.evaluate(() => { const g = window.__STARLINE__; g.director.workshop.charge = 0.1; g.player.teleport(-6, -44); });
    await wait(1200);
    const c = await K(); await wait(3000); const dq = await K();
    const fast = (dq.charge - c.charge) / 3;
    log('charge per second by the Mill Lamp', fast.toFixed(4), 'near', dq.near);
    check(dq.near && Math.abs(fast - 1 / 6) < 0.03, `lamp rate ${fast}`);
    await S('10-charging-lamp');
    await wait(4500);
    k = await K();
    check(k.charge === 1 && !k.gauge, `full, gauge gone: ${JSON.stringify(k)}`);
  } else {
    await page.keyboard.press('KeyG');
    await page.waitForFunction(() => !window.__STARLINE__.kite.carrying, null, { timeout: 40000 });
  }

  for (const e of errors) fails.push(`console: ${e}`);
  log(fails.length ? `${fails.length} FAILED` : 'ok');
  failures.push(...fails.map(f => `${tag}: ${f}`));
  await ctx.close();
}

const only = args.only ? new Set(args.only.split(',')) : null;
const want = k => !only || only.has(k);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  if (want('mouse')) await build(browser, 'mouse', 'grandma');
  if (want('keys')) await build(browser, 'keys', 'grandma');
  if (want('touch')) await build(browser, 'touch', 'grandma');
  if (want('classic')) await build(browser, 'mouse', 'classic');
  if (want('plain')) await flight(browser, 'plain', 'desktop', '');
  if (want('built')) await flight(browser, 'built', 'desktop', '');
  if (want('phone')) await flight(browser, 'built', 'phone', '');
  if (want('low')) await flight(browser, 'built', 'desktop', 'low');
} finally {
  await browser.close();
  server?.kill();
}
if (failures.length) { console.error(`\n${failures.length} failure(s):\n` + failures.map(f => '  ' + f).join('\n')); process.exit(1); }
console.log('\nworkshop: all browser checks passed');
