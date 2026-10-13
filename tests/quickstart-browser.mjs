// Quick start in a real browser: the mini games that need no valley, played from the title's list with no valley loaded.
//   GAME_URL=http://127.0.0.1:5897/ node tests/quickstart-browser.mjs [--only=phone,desktop,sizes,memory,robust,boot] [--out=.tools/quick/suite]
// (a vite dev or preview server must be running there; run it against the production build before a release)
// It checks, on a phone (390x844, touch, Low tier) and a desktop (1280x720):
//   * the page boots to the title with nothing of the valley loaded (no world, not one .glb), and the list marks the four
//     quick games with the "Quick" badge;
//   * each of the four starts from the list without the valley, shows its HUD, how-to card and way out inside the screen and
//     not on top of each other, and is really played a little (a card puzzle solved with taps; a marble flicked with the
//     aim tap and the Hold button; a square sown on the ô ăn quan board), then leaves to the SAME list, still no valley;
//   * a marbles win reaches the Explore save and shows as stars in the list (the records the full game reads);
//   * picking a game that needs the valley from that list shows the loading screen, loads the valley, lets go of the quick
//     runtime (no second HUD or Stop button left behind) and starts that game the usual way;
//   * sizes: screenshots of the four games at 1280x720, 390x844 and 844x390 for a look at the backdrops;
//   * memory: ten start-and-leave rounds do not grow the GPU objects, the scene, the page or the heap;
//   * robust: a turned phone re-frames the ring, a lost and restored graphics context carries on, an error inside a round
//     (card game and yard game) falls back to the list with a kind message;
//   * boot: ?quick=off and a plain QA run load the valley before the title as before; a player's page (no ?qa) boots
//     quick; New Game and the Scene tour from a quick title load the valley and work.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const url = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const OUT = args.out || '.tools/quick/suite';
fs.mkdirSync(OUT, { recursive: true });
const want = k => !args.only || args.only.split(',').includes(k);
const QUICK = ['trick:lifecycle', 'trick:crops', 'yard:marbles', 'yard:oanquan'];
const DEV = {
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, quality: 'low' },
  desktop: { viewport: { width: 1280, height: 720 }, quality: 'medium' },
  wide: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, quality: 'low' },
};
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } return ok; };

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });

async function boot(name, query = 'qa=1&quick=on', { save = null } = {}) {
  const dev = DEV[name], { quality, ...opts } = dev;
  const ctx = await browser.newContext(opts);
  if (save) await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, save);
  const page = await ctx.newPage();
  const errors = [], glb = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 240)); });
  page.on('request', r => { if (/\.glb(\?|$)/.test(r.url())) glb.push(r.url()); });
  const hit = sel => (dev.hasTouch ? page.tap(sel) : page.click(sel));
  await page.goto(`${url}?mute&${query}&quality=${quality}`);
  await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
  return { ctx, page, errors, glb, hit, dev, name };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const STATE = () => {
  const q = window.__STARLINE_QA__, d = q?.director, g = window.__STARLINE__;
  return { rt: window.__STARLINE_RUNTIME__, world: !!g?.world, dlg: !!g?.ui?.dialogueOpen, board: !!document.querySelector('#lifeBoard .pick .lc-card'),
    yard: d?.yard?.round?.sim?.state || null, lvl: !!document.querySelector('#lvlPick:not(.hidden)'), list: !!document.querySelector('#mgPicker:not(.hidden)'),
    title: !document.getElementById('title').classList.contains('hidden'), calls: q?.quick?.calls?.() ?? null };
};

/** With the list open: show the game's card and press it. */
async function pick(b, id) {
  const { page, hit } = b;
  await page.waitForSelector('#mgPicker:not(.hidden)', { timeout: 30000 });
  const cats = await page.evaluate(() => [...document.querySelectorAll('.mg-tab')].map(t => t.dataset.cat));
  for (const c of cats) { await hit(`.mg-tab[data-cat=${c}]`); if (await page.$(`.mg-card[data-id="${id}"]`)) break; }
  await page.locator(`.mg-card[data-id="${id}"]`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await hit(`.mg-card[data-id="${id}"]`);
}

/** After a pick: through a teacher's first words and the level picker, until the game can be played. */
async function untilPlayable(b, id, max = 40) {
  const { page } = b;
  for (let k = 0; k < max * 4; k++) {
    await page.waitForTimeout(250);
    const s = await page.evaluate(STATE);
    if (s.dlg || s.lvl) { await page.keyboard.press('KeyE'); continue; }
    if (id.startsWith('trick:') ? s.board : ['aim', 'think'].includes(s.yard)) return s;
  }
  return null;
}

/** Boxes of what must be readable and tappable, and which of them lie on top of each other or off the screen. */
const LAYOUT = () => {
  const vis = el => { if (!el) return null; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden' && !el.closest('.hidden') ? r : null; };
  const names = { hud: '#yardHud', hint: '#yardHint', stop: '#minigameStop', leave: '#lifeBoard .leave', howto: '#howTo', oanHelp: '#oanHelpBtn', pad: '#yardPad', panel: '#lifeBoard .pn', go: '#lifeBoard .go' };
  const boxes = {};
  for (const [k, sel] of Object.entries(names)) { const r = vis(document.querySelector(sel)); if (r) boxes[k] = [r.left, r.top, r.right, r.bottom].map(Math.round); }
  const off = Object.entries(boxes).filter(([, b]) => b[0] < -1 || b[1] < -1 || b[2] > innerWidth + 1 || b[3] > innerHeight + 1).map(([k]) => k);
  const hits = [], keys = Object.keys(boxes), inside = { leave: 'panel', go: 'panel' };
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = boxes[keys[i]], c = boxes[keys[j]];
    if (inside[keys[i]] === keys[j] || inside[keys[j]] === keys[i]) continue;
    if (a[0] < c[2] - 2 && c[0] < a[2] - 2 && a[1] < c[3] - 2 && c[1] < a[3] - 2) hits.push(`${keys[i]}+${keys[j]}`);
  }
  return { boxes, off, hits };
};

/** A stage point (u, v) of the running yard round, on the screen (CSS px). */
const SCREEN = ([u, v]) => {
  const rt = window.__STARLINE_QA__.quick.runtime, R = rt.yard.round, S = R.S, t = (S.rot || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  rt.camera.updateMatrixWorld(true);
  const p = rt.g.player.pos.clone().set(S.x - (u * c - v * s), R.y0 + 0.03, S.z - (u * s + v * c)).project(rt.camera);
  return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight];
};

/** Play a little of the game on screen. Returns what happened (a string for the log). */
async function playABit(b, id) {
  const { page, hit, dev } = b;
  const tapAt = (x, y) => (dev.hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  if (id.startsWith('trick:')) {
    // the first puzzle of a first play: lay the row in order, press Check, and the teacher says yes
    const key = id === 'trick:crops' ? 'crops' : 'life';
    const answer = await page.evaluate(k => window.__STARLINE_QA__.director.tricks.round.ctx.debug[k].solve(), key);
    for (const c of [].concat(answer)) { await hit(`#lifeBoard .pick [data-card="${c}"]`); await page.waitForTimeout(120); }
    await hit('#lifeBoard .go');
    await page.waitForTimeout(400);
    const said = await page.evaluate(k => ({ yes: !!document.querySelector('#lifeBoard .say.yes'), score: window.__STARLINE_QA__.director.tricks.round.ctx.debug[k].board.score }), key);
    check(said.yes && said.score > 0, `${b.name} ${id}: the first puzzle was not accepted (${JSON.stringify(said)})`);
    return `puzzle solved, ${said.score} points`;
  }
  if (id === 'yard:marbles') {
    const before = await page.evaluate(() => { const s = window.__STARLINE_QA__.director.yard.round.sim; return { shots: s.shots ?? null, state: s.state, ball: [s.balls[0].u, s.balls[0].v] }; });
    const [x, y] = await page.evaluate(SCREEN, before.ball);
    await tapAt(x, y);                                     // aim at a marble
    await page.waitForTimeout(200);
    const aim = await page.evaluate(() => { const s = window.__STARLINE_QA__.director.yard.round.sim; return [s.aim.u, s.aim.v]; });
    check(Math.hypot(aim[0] - before.ball[0], aim[1] - before.ball[1]) < 0.12, `${b.name} marbles: the tap did not aim at the marble (${aim} vs ${before.ball})`);
    const box = await page.locator('#yardPad button.big').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    // hold the button, let go: the shooter flies
    await page.evaluate(([px, py]) => { const el = document.querySelector('#yardPad button.big'); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: px, clientY: py, pointerId: 9 })); }, [cx, cy]);
    await page.waitForTimeout(650);
    await page.evaluate(([px, py]) => { const el = document.querySelector('#yardPad button.big'); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: px, clientY: py, pointerId: 9 })); }, [cx, cy]);
    let moved = false;
    for (let k = 0; k < 20 && !moved; k++) { await page.waitForTimeout(150); moved = await page.evaluate(() => window.__STARLINE_QA__.director.yard.round.sim.state !== 'aim'); }
    check(moved, `${b.name} marbles: holding and letting go of the button did not flick the shooter`);
    return 'aimed with a tap, flicked with the button';
  }
  // ô ăn quan: tap one of her squares, then sow to the right
  const [x, y] = await page.evaluate(SCREEN, [0, 0.25]);
  await tapAt(x, y);
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => window.__STARLINE_QA__.director.yard.round.sim.sel);
  check(sel === 3, `${b.name} ô ăn quan: tapping the middle square selected ${sel}`);
  const pads = await page.$$('#yardPad button');
  const box = await pads[2].boundingBox();
  await page.evaluate(([px, py]) => { const el = document.querySelectorAll('#yardPad button')[2]; el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: px, clientY: py, pointerId: 9 })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: px, clientY: py, pointerId: 9 })); }, [box.x + 5, box.y + 5]);
  let sown = false;
  for (let k = 0; k < 20 && !sown; k++) { await page.waitForTimeout(150); sown = await page.evaluate(() => { const s = window.__STARLINE_QA__.director.yard.round.sim; return s.state !== 'think' || !s.cur.human; }); }
  check(sown, `${b.name} ô ăn quan: the sow button did not start a move`);
  return 'square tapped and sown';
}

/** Leave the game on screen by its own way out; the list must come back. */
async function leave(b, id) {
  const { page, hit } = b;
  const sel = (await page.$('#lifeBoard .leave')) ? '#lifeBoard .leave' : '#minigameStop';
  const box = await page.locator(sel).boundingBox();
  check(box && Math.min(box.width, box.height) >= 40, `${b.name} ${id}: the way out is too small (${JSON.stringify(box)})`);
  await hit(sel);
  const back = await page.waitForSelector('#mgPicker:not(.hidden)', { timeout: 20000 }).then(() => true, () => false);
  check(back, `${b.name} ${id}: the list did not come back`);
  await page.waitForTimeout(450);
  const s = await page.evaluate(STATE);
  check(s.rt === 'title' && !s.world && s.title, `${b.name} ${id}: after leaving, the title's list is not what is shown (${JSON.stringify(s)})`);
}

// ---------------------------------------------------------------- the four games on a phone and a desktop
for (const name of ['phone', 'desktop']) {
  if (!want(name)) continue;
  const b = await boot(name), { page, hit } = b;
  let s = await page.evaluate(STATE);
  check(s.rt === 'title' && !s.world, `${name}: the page did not boot quick (${JSON.stringify(s)})`);
  check(b.glb.length === 0, `${name}: ${b.glb.length} model files were fetched before the title`);
  await page.waitForTimeout(900);
  await shot(page, `${name}-title`);
  await hit('#btnTitleMini');
  await page.waitForSelector('#mgPicker:not(.hidden)');
  const marked = await page.evaluate(() => [...new Set([...document.querySelectorAll('.mg-tab')].flatMap(t => { t.click(); return [...document.querySelectorAll('.mg-card')].filter(c => c.querySelector('.mg-quick')).map(c => c.dataset.id); }))].sort());
  check(JSON.stringify(marked) === JSON.stringify([...QUICK].sort()), `${name}: the Quick badge is on ${marked.join(', ')}`);
  for (const id of QUICK) {
    const tag = `${name}-${id.replace(':', '_')}`, t1 = Date.now();
    await pick(b, id);
    s = await untilPlayable(b, id);
    if (!check(!!s, `${name} ${id}: it did not start`)) { await shot(page, `${tag}-stuck`); break; }
    const ms = Date.now() - t1;
    check(s.rt === 'quick' && !s.world && b.glb.length === 0, `${name} ${id}: not the quick runtime (${JSON.stringify(s)}, ${b.glb.length} glb)`);
    await page.waitForTimeout(700);
    await shot(page, `${tag}-play`);
    const lay = await page.evaluate(LAYOUT);
    check(!lay.off.length, `${name} ${id}: off the screen: ${lay.off.join(', ')}`);
    check(!lay.hits.length, `${name} ${id}: on top of each other: ${lay.hits.join(', ')} ${JSON.stringify(lay.boxes)}`);
    const did = await playABit(b, id);
    if (id.startsWith('yard:')) check((await page.evaluate(STATE)).calls > 0 && (await page.evaluate(STATE)).calls <= 12, `${name} ${id}: draw calls ${(await page.evaluate(STATE)).calls}`);
    log(name, id, `playable ${ms} ms (with the first talk)`, '·', did, '· calls', (await page.evaluate(STATE)).calls);
    if (id === 'yard:marbles' && name === 'phone') {
      // play it out (the QA stand-in flicks for her), see the card, and find the stars in the save and on the list
      await page.evaluate(() => { window.__STARLINE_QA__.director.yard.debug.auto = 'win'; });
      const card = await page.waitForSelector('#yardCard:not(.hidden)', { timeout: 240000 }).then(() => true, () => false);
      await page.evaluate(() => { window.__STARLINE_QA__.director.yard.debug.auto = null; });
      check(card, `${name} marbles: no results card`);
      await page.waitForTimeout(900);
      await shot(page, `${tag}-card`);
      const done = await page.evaluate(() => document.querySelector('#yardCard .done')?.textContent || '');
      check(/More games/.test(done), `${name} marbles: the card's button says "${done}"`);
      await hit('#yardCard .done');
      await page.waitForSelector('#mgPicker:not(.hidden)', { timeout: 20000 });
      const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('starline-save-explore') || 'null')?.quest?.yard?.marbles || null);
      check(rec?.plays === 1 && rec.stars >= 1, `${name} marbles: the record in the Explore save is ${JSON.stringify(rec)}`);
      await hit('.mg-tab[data-cat=yard]');
      const stars = await page.evaluate(() => document.querySelectorAll('.mg-card[data-id="yard:marbles"] .mg-stars i.on').length);
      check(stars === rec?.stars, `${name} marbles: the list shows ${stars} stars, the save has ${rec?.stars}`);
      log(name, 'marbles record', JSON.stringify(rec));
    } else await leave(b, id);
  }
  await shot(page, `${name}-list-after`);
  // a game that needs the valley, from the same list
  await page.evaluate(() => {
    window.__seen = new Set();
    window.__seenT = setInterval(() => window.__seen.add(`${window.__STARLINE_RUNTIME__}|${!document.getElementById('loading').classList.contains('hidden')}`), 16);
  });
  await pick(b, 'trick:kite');
  await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 240000 });
  const seen = await page.evaluate(() => { clearInterval(window.__seenT); return [...window.__seen]; });
  check(seen.includes('loading|true'), `${name}: no loading screen while the valley was fetched (${seen.join(' ')})`);
  let round = null;
  for (let k = 0; k < 120 && !round; k++) {
    await page.waitForTimeout(500);
    const v = await page.evaluate(() => { const d = window.__STARLINE__.director; return { busy: d.busy, round: d.tricks?.round?.id || null, dlg: window.__STARLINE__.ui.dialogueOpen }; });
    if (v.dlg) await page.keyboard.press('KeyE');
    round = v.round;
  }
  const after = await page.evaluate(() => ({ rt: window.__STARLINE_RUNTIME__, world: !!window.__STARLINE__.world, quick: !!window.__STARLINE__.quick, stops: document.querySelectorAll('#minigameStop').length,
    huds: document.querySelectorAll('#trickHud').length + document.querySelectorAll('#yardHud').length, scene: !!document.getElementById('quickScene'), still: !!document.getElementById('titleStill'), body: document.body.className }));
  check(round === 'kite', `${name}: the valley game did not start (round ${round})`);
  check(after.rt === 'valley' && after.world && !after.quick && after.stops === 1 && after.huds === 2 && !after.scene && !after.still && !/quick-play/.test(after.body), `${name}: the quick runtime was not let go cleanly ${JSON.stringify(after)}`);
  check(b.glb.length > 20, `${name}: the valley's models were not fetched (${b.glb.length})`);
  await page.waitForTimeout(1500);
  await shot(page, `${name}-valley-kite`);
  log(name, 'valley game after the quick ones:', round, JSON.stringify(after));
  check(!b.errors.length, `${name}: errors: ${b.errors.join(' | ')}`);
  await b.ctx.close();
}

// ---------------------------------------------------------------- pictures at the three sizes
if (want('sizes')) {
  for (const name of ['desktop', 'phone', 'wide']) {
    const b = await boot(name), { page, hit } = b;
    await hit('#btnTitleMini');
    for (const id of QUICK) {
      await pick(b, id);
      const s = await untilPlayable(b, id);
      if (!check(!!s, `sizes ${name} ${id}: it did not start`)) break;
      await page.waitForTimeout(6500);                       // (the how-to card of a first play has folded itself away by now)
      await shot(page, `size-${name}-${id.replace(':', '_')}`);
      const lay = await page.evaluate(LAYOUT);
      check(!lay.off.length && !lay.hits.length, `sizes ${name} ${id}: layout off ${lay.off.join(',')} hits ${lay.hits.join(',')}`);
      await leave(b, id);
    }
    check(!b.errors.length, `sizes ${name}: errors: ${b.errors.join(' | ')}`);
    await b.ctx.close();
    log('sizes', name, 'done');
  }
}

// ---------------------------------------------------------------- ten rounds must not grow anything
if (want('memory')) {
  const b = await boot('phone'), { page, hit } = b;
  const cdp = await b.ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await hit('#btnTitleMini');
  const snaps = [];
  for (let round = 1; round <= 10; round++) {
    for (const id of QUICK) {
      await pick(b, id);
      const s = await untilPlayable(b, id);
      if (!check(!!s, `memory round ${round} ${id}: it did not start`)) break;
      await page.waitForTimeout(250);
      await leave(b, id);
    }
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    const c = await page.evaluate(() => window.__STARLINE_QA__.quick.counts());
    snaps.push({ round, ...c, heapMB: +(heap / 1048576).toFixed(2) });
  }
  const a = snaps[1], z = snaps[9];
  log('memory after round 2:', JSON.stringify(a));
  log('memory after round 10:', JSON.stringify(z));
  for (const k of ['geometries', 'textures', 'programs', 'objects']) check(z[k] === a[k], `memory: ${k} grew from ${a[k]} to ${z[k]} over eight more rounds of the four games`);
  check(Math.abs(z.nodes - a.nodes) <= 4, `memory: the page grew from ${a.nodes} to ${z.nodes} elements`);
  check(z.heapMB - a.heapMB < 3, `memory: the heap grew from ${a.heapMB} to ${z.heapMB} MB`);
  fs.writeFileSync(path.join(OUT, 'memory.json'), JSON.stringify(snaps, null, 1));
  check(!b.errors.length, `memory: errors: ${b.errors.join(' | ')}`);
  await b.ctx.close();
}

// ---------------------------------------------------------------- things that go wrong
if (want('robust')) {
  const b = await boot('phone'), { page, hit } = b;
  await hit('#btnTitleMini');
  await pick(b, 'yard:marbles');
  check(!!(await untilPlayable(b, 'yard:marbles')), 'robust: marbles did not start');
  // the phone is turned on its side, and back: the ring is framed again, inside the screen
  for (const [w, h] of [[844, 390], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(700);
    const f = await page.evaluate(() => {
      const rt = window.__STARLINE_QA__.quick.runtime, R = rt.yard.round, S = R.S, cv = document.getElementById('game');
      rt.camera.updateMatrixWorld(true);
      const pts = [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]].map(([u, v]) => { const p = rt.g.player.pos.clone().set(S.x + u, 0, S.z + v).project(rt.camera); return [+p.x.toFixed(2), +p.y.toFixed(2)]; });
      return { aspect: +rt.camera.aspect.toFixed(3), want: +(innerWidth / innerHeight).toFixed(3), pts, canvas: [cv.clientWidth, cv.clientHeight] };
    });
    check(Math.abs(f.aspect - f.want) < 0.01 && f.pts.every(p => Math.abs(p[0]) < 0.95 && Math.abs(p[1]) < 0.95) && f.canvas[0] === w && f.canvas[1] === h, `robust: at ${w}x${h} the ring is not framed ${JSON.stringify(f)}`);
    const lay = await page.evaluate(LAYOUT);
    check(!lay.off.length && !lay.hits.length, `robust ${w}x${h}: layout off ${lay.off.join(',')} hits ${lay.hits.join(',')}`);
    await shot(page, `robust-turned-${w}x${h}`);
  }
  // the graphics context is lost and comes back: a notice, then the game goes on drawing
  await page.evaluate(() => window.__STARLINE__.renderer.renderer.forceContextLoss());
  await page.waitForTimeout(500);
  const lost = await page.evaluate(() => !!document.getElementById('glLost'));
  await page.evaluate(() => window.__STARLINE__.renderer.renderer.forceContextRestore());
  await page.waitForTimeout(1200);
  const back = await page.evaluate(() => ({ notice: !!document.getElementById('glLost'), calls: window.__STARLINE_QA__.quick.calls(), state: window.__STARLINE_QA__.director.yard.round?.sim?.state || null }));
  check(lost && !back.notice && back.calls > 0 && back.state, `robust: context loss: notice ${lost}, after ${JSON.stringify(back)}`);
  await shot(page, 'robust-context-restored');
  // an error inside the yard round: back to the list, with a kind word
  b.errors.length = 0;
  await page.evaluate(() => { window.__STARLINE_QA__.director.yard.present = () => { throw new Error('test: the round breaks'); }; });
  let ok = await page.waitForSelector('#mgPicker:not(.hidden)', { timeout: 15000 }).then(() => true, () => false);
  const note = await page.evaluate(() => document.getElementById('quickNote')?.textContent || '');
  check(ok && /not ready yet/.test(note), `robust: after a broken marbles round: list ${ok}, note "${note}"`);
  await shot(page, 'robust-error-note');
  await page.evaluate(() => { delete window.__STARLINE_QA__.director.yard.present; });
  // the same in a card game (its board step throws)
  await pick(b, 'trick:lifecycle');
  check(!!(await untilPlayable(b, 'trick:lifecycle')), 'robust: the card game did not start after the broken round');
  // (a card game is drawn by the page: a lost graphics context is not its business)
  await page.evaluate(() => window.__STARLINE__.renderer.renderer.forceContextLoss());
  await page.waitForTimeout(400);
  check(!(await page.evaluate(() => !!document.getElementById('glLost'))), 'robust: a card game showed the graphics notice');
  await page.evaluate(() => window.__STARLINE__.renderer.renderer.forceContextRestore());
  await page.waitForTimeout(400);
  await page.evaluate(() => { const t = window.__STARLINE_QA__.director.tricks; for (const l of t.loops) l.fn = () => { throw new Error('test: the board breaks'); }; });
  ok = await page.waitForSelector('#mgPicker:not(.hidden)', { timeout: 15000 }).then(() => true, () => false);
  const left = await page.evaluate(() => ({ board: !!document.getElementById('lifeBoard'), note: document.getElementById('quickNote')?.textContent || '', body: document.body.className }));
  check(ok && !left.board && /not ready yet/.test(left.note) && !/life-round|trick-round/.test(left.body), `robust: after a broken card round: list ${ok} ${JSON.stringify(left)}`);
  // and the next game still plays
  await pick(b, 'yard:oanquan');
  check(!!(await untilPlayable(b, 'yard:oanquan')), 'robust: ô ăn quan did not start after the broken rounds');
  await leave(b, 'yard:oanquan');
  const real = b.errors.filter(e => !/test: the (round|board) breaks|round failed|WebGL: CONTEXT_LOST|Context Lost|context lost/i.test(e));
  check(!real.length, `robust: errors: ${real.join(' | ')}`);
  await b.ctx.close();
  log('robust done');
}

// ---------------------------------------------------------------- which way the page boots, and the title's other doors
if (want('boot')) {
  for (const [query, valleyFirst] of [['qa=1&quick=off', true], ['qa=1', true], ['plain=1', false]]) {
    const b = await boot('phone', query);
    const s = await b.page.evaluate(() => ({ rt: window.__STARLINE_RUNTIME__, world: !!window.__STARLINE__.world, still: !!document.getElementById('titleStill') }));
    check(valleyFirst ? s.rt === 'valley' && s.world && !s.still : s.rt === 'title' && !s.world && s.still, `boot ?${query}: ${JSON.stringify(s)}`);
    check(valleyFirst ? b.glb.length > 20 : b.glb.length === 0, `boot ?${query}: ${b.glb.length} model files at the title`);
    check(!b.errors.length, `boot ?${query}: errors: ${b.errors.join(' | ')}`);
    log('boot', `?${query}`, JSON.stringify(s), `${b.glb.length} glb`);
    await b.ctx.close();
  }
  // New Game from a quick title: the valley loads, the story begins
  {
    const b = await boot('desktop'), { page, hit } = b;
    await hit('#btnNew');
    await page.waitForSelector('#slots:not(.hidden) .slot .pick');
    await hit('#slots .slot .pick');
    await page.waitForFunction(() => document.querySelector('#slotList .num')?.textContent === '☀');      // (the story card follows the slot)
    await hit('#slots .slot .pick');
    await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 240000 });
    await page.waitForTimeout(2500);
    const s = await page.evaluate(() => ({ rt: window.__STARLINE_RUNTIME__, world: !!window.__STARLINE__.world, step: window.__STARLINE__.director.quest?.state.step, still: !!document.getElementById('titleStill'), loading: !document.getElementById('loading').classList.contains('hidden') }));
    check(s.rt === 'valley' && s.world && s.step && !s.still && !s.loading, `boot: New Game from the quick title: ${JSON.stringify(s)}`);
    await shot(page, 'boot-new-game');
    check(!b.errors.length, `boot new game: errors: ${b.errors.join(' | ')}`);
    log('boot: New Game', JSON.stringify(s));
    await b.ctx.close();
  }
  // the Scene tour from a quick title: the valley loads under the title, then the tour's picker opens
  {
    const b = await boot('desktop'), { page, hit } = b;
    await hit('#btnTitleTour');
    const open = await page.waitForSelector('#tourPick', { state: 'visible', timeout: 240000 }).then(() => true, () => false);
    const s = await page.evaluate(() => ({ rt: window.__STARLINE_RUNTIME__, world: !!window.__STARLINE__.world, still: !!document.getElementById('titleStill'), loading: !document.getElementById('loading').classList.contains('hidden') }));
    check(open && s.rt === 'valley' && s.world && !s.still && !s.loading, `boot: Scene tour from the quick title: open ${open} ${JSON.stringify(s)}`);
    await shot(page, 'boot-tour');
    check(!b.errors.length, `boot tour: errors: ${b.errors.join(' | ')}`);
    log('boot: Scene tour', JSON.stringify(s));
    await b.ctx.close();
  }
}

await browser.close();
if (failures.length) { console.log(`\n${failures.length} failure(s)\n` + failures.join('\n')); process.exit(1); }
console.log('\nquick start: all good');
