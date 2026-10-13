// The cow race and the cow ride in a real browser, desktop (1280x720) and phone (390x844, touch), through the real controls.
//   node tests/cowrace-browser.mjs [--only=desktop|phone] [--quality=low,medium,high] [--story=grandma|classic] [--ride=0] [--balance=0] [--shots=0] [--out=.tools/review/cows3-test]
//   GAME_URL=http://127.0.0.1:5842/   (a vite dev or preview server must be running there, or it starts a dev server)
// It checks that
//   * in EVERY phase of the race (line-up, intro card, countdown, race, mud, finish, podium) all four riders (Mika, Kenta, Yui,
//     Daichi) are on a RideCow* clip (or the documented Sit fallback) with their hips down on the saddle: no kid stands on a cow;
//   * the first try shows the 3-step intro card, the beat ring is the big practice ring, a tap gets a word, the teacher answers the
//     first taps, "?" pauses the race and brings the card back, and the results card explains the stars;
//   * the free ride teaches itself by its own card (steer, hold to gallop, moo) and every gait and the dismount keep Mika seated;
//   * in a bareback heat she leans with the controls, the balance arc follows and warns, held too far she slides off into the
//     grass (sitting on the ground, not on the cow, not in the air), hops back on and is seated again;
//   * quitting at every stage (line-up, card, countdown, race, podium) leaves the scene as it was, and nothing logs an error.
import { createRequire } from 'module';
import { mkdirSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { stateAt } from './e2e/fastforward.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const OUT = path.resolve(ROOT, args.out || '.tools/review/cows3-test');
const SHOTS = args.shots !== '0';
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE_PATH || path.join(ROOT, 'node_modules/playwright');
if (!existsSync(pwPath)) { console.error('Playwright not found.'); process.exit(2); }
const { chromium } = require(pwPath);

let server = null, url = process.env.GAME_URL || 'http://127.0.0.1:5842/';
if (!(await fetch(url).then(r => r.ok, () => false))) {
  const port = new URL(url).port || '5842';
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', port, '--strictPort'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, NO_HMR: '1' } });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 60000);
    const seen = d => { if (/ready|Local/.test(String(d))) { clearTimeout(t); res(); } };
    server.stdout.on('data', seen); server.stderr.on('data', seen);
    server.on('exit', code => rej(new Error(`vite exited ${code}`)));
  });
}

const DEVICES = {
  desktop: { tag: 'd', viewport: { width: 1280, height: 720 } },
  phone: { tag: 'p', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};
const devices = args.only ? [args.only] : ['desktop', 'phone'];
const qualities = (args.quality || 'low').split(',');
const stories = (args.story || 'grandma').split(',');
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- in-page helpers
const STATE = () => {
  const Q = window.__STARLINE_QA__, d = Q.director, R = Q.cowRace, me = R?.race?.racers[0], cr = d.cows, coach = document.getElementById('cowCoach');
  return {
    round: d.tricks?.round?.id || null, busy: d.busy, phase: R?.dbg?.phase || null, fixes: R?.dbg?.fixes ?? 0, helpOpen: R?.dbg?.helpOpen || false, ghost: R?.dbg?.ghost || false, taps: R?.dbg?.taps ?? 0,
    t: R?.race?.t ?? null, s: me?.s ?? null, lat: me?.lat ?? null, over: R?.race?.over ?? null, place: me?.place ?? null,
    card: document.getElementById('cowCard')?.classList.contains('on') || false, results: !document.getElementById('trickCard')?.classList.contains('hidden'),
    ride: cr?.phase || null, rideFixes: cr?.fixes || 0, coach: cr?.coach ? { step: cr.coach.step } : null, coachCard: coach?.classList.contains('on') ? coach.querySelector('.cc-title').textContent : null,
  };
};
const RIDERS = () => {
  const Q = window.__STARLINE_QA__, g = Q.game, R = Q.cowRace, out = [], V = g.camera.position.constructor;
  const one = (who, anim, model, root) => {
    if (!anim || !model) { out.push({ who, clip: null }); return; }
    root.updateMatrixWorld(true);
    const hips = model.getObjectByName('hips'), rp = new V(), hp = new V();
    root.getWorldPosition(rp); hips?.getWorldPosition(hp);
    out.push({ who, clip: anim.currentName, busy: !!anim.busy, hipsUp: hips ? +(hp.y - rp.y).toFixed(2) : null });
  };
  if (g.player.mounted) one('mika', g.player.anim, g.player.model, g.player.root);
  if (R?.kids?.length) R.kids.forEach((k, i) => one(['kenta', 'yui', 'daichi'][i], k.anim, k.model, k.root));
  return out;
};
// what a round must not leave behind: its cows and riders in the scene, its cards and HUD in the page, its test hook, and (over repeated rounds) memory
const LEFT = () => {
  const Q = window.__STARLINE_QA__, g = window.__STARLINE__, m = g.renderer.renderer.info.memory, left = [];
  g.scene.traverse(o => { if (/racecow|racekid|race-podium|race-bumps|race-puddles/.test(o.name || '')) left.push(o.name); });
  for (const id of ['cowRace', 'cowCard']) if (document.getElementById(id)) left.push('#' + id);
  if (Q.cowRace) left.push('QA hook');
  if (document.body.classList.contains('cow-race')) left.push('body.cow-race');
  if (g.player.model.rotation.z !== 0) left.push(`Mika still leans ${g.player.model.rotation.z.toFixed(2)}`);
  return { left, geometries: m.geometries, textures: m.textures, mounted: !!g.player.mounted, pose: g.player.pose };
};

class Session {
  constructor(browser, dev, quality, story, name) { Object.assign(this, { browser, dev, quality, story, name }); this.samples = 0; this.errors = []; }
  async open(query = '') {
    const D = DEVICES[this.dev];
    this.ctx = await this.browser.newContext({ viewport: D.viewport, hasTouch: !!D.hasTouch, isMobile: !!D.isMobile, deviceScaleFactor: D.deviceScaleFactor || 1 });
    const save = JSON.stringify({ v: 1, quest: stateAt('c1.cogs', 'alone', this.story), player: { x: -40, y: 3, z: 20, facing: 3.1 }, at: 1760000000000 });
    await this.ctx.addInitScript(s => { if (!localStorage.getItem('starline-save-1')) { localStorage.setItem('starline-save-1', s); localStorage.setItem('starline-last-slot', '1'); } }, save);
    this.page = await this.ctx.newPage();
    this.page.on('pageerror', e => this.errors.push(`pageerror: ${e.message}`));
    this.page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/favicon|404|Failed to load resource|GPU stall|ReadPixels/.test(m.text())) this.errors.push(`${m.type()}: ${m.text()}`); });
    await this.page.goto(`${url}?mute&qa=1&quality=${this.quality}&${query}`);
    await this.page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
    this.touch = !!D.hasTouch;
    return this;
  }
  hit(sel) { return this.touch ? this.page.tap(sel) : this.page.click(sel); }
  S() { return this.page.evaluate(STATE); }
  async shot(label) { if (SHOTS) await this.page.screenshot({ path: path.join(OUT, `${this.name}-${label}.png`) }); }
  async pressE() { await this.page.keyboard.press('KeyE'); }
  async launch(door = '#btnTitleMini') {
    await this.page.evaluate(() => { window.__STARLINE_QA__.cowRace = null; window.__STARLINE_QA__.level ??= 'easy'; });   // (a played game asks for a level: name it)
    await this.hit(door);
    await this.page.waitForSelector('#mgPicker:not(.hidden)');
    const cats = await this.page.evaluate(() => [...document.querySelectorAll('.mg-tab')].map(t => t.dataset.cat));
    for (const c of cats) { await this.hit(`.mg-tab[data-cat=${c}]`); if (await this.page.$('.mg-card[data-id="trick:cowrace"]')) break; }
    await this.page.locator('.mg-card[data-id="trick:cowrace"]').scrollIntoViewIfNeeded();
    await this.hit('.mg-card[data-id="trick:cowrace"]');
  }
  /** every rider on a ride clip, hips down on the saddle, nothing else owning the animator */
  async seated(phase) {
    const riders = await this.page.evaluate(RIDERS);
    this.samples++;
    for (const r of riders) check(r.clip && /^RideCow|^Sit$/.test(r.clip) && r.hipsUp != null && r.hipsUp <= 0.3 && !r.busy, `${this.name} ${phase}: ${JSON.stringify(r)} is not seated`);
    return riders;
  }
  async waitRing() {
    await this.page.waitForFunction(() => {
      const sh = document.querySelector('#cowRace .shrink'); if (!sh) return false;
      const m = /scale\(([\d.]+)\)/.exec(sh.style.transform || ''), k = m ? +m[1] : 2, now = performance.now();
      if (k < 1.1 && (!window.__lastTap || now - window.__lastTap > 380)) { window.__lastTap = now; return true; }
      return false;
    }, null, { polling: 'raf', timeout: 900 }).catch(() => {});
  }
  async tap() {
    if (this.touch) { const b = await this.page.$('#cowRace .giddy'), bb = b ? await b.boundingBox() : null; if (bb) await this.page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); } else await this.pressE();
  }
  async cdp() { return (this.cdpS ??= await this.ctx.newCDPSession(this.page)); }
  async touch_(type, pts) { await (await this.cdp()).send('Input.dispatchTouchEvent', { type, touchPoints: pts }); }
  async close() { await this.ctx.close(); }
}

async function skipTalk(s, maxMs = 25000) {
  const t = Date.now();
  for (;;) {
    const st = await s.S();
    if (st.phase) return st;
    if (st.busy > 0) await s.pressE();
    if (Date.now() - t > maxMs) return st;
    await sleep(250);
  }
}

/** One race through the controls. quitAt: 'lineup' | 'intro' | 'countdown' | 'race' | 'podium' | null (play to the results card). */
async function race(s, { quitAt = null, first = true } = {}) {
  let st = await skipTalk(s);
  const seen = new Set(), done = { steer: false, help: false, shot: {} };
  const t0 = Date.now();
  const quit = async ph => { log(s.name, 'quit at', ph); await s.page.keyboard.press('Backspace'); };
  for (;;) {
    st = await s.S();
    if (Date.now() - t0 > 160000) { check(false, `${s.name}: race timed out in ${JSON.stringify(st)}`); break; }
    if (!st.round && !st.results && seen.size) break;
    const ph = st.phase;
    if (ph && !seen.has(ph)) {
      seen.add(ph);
      if (ph === 'podium') await s.shot('podium');
      await sleep(150);
      await s.seated(ph);
      if (ph === 'lineup') { await s.shot('lineup'); if (quitAt === 'lineup') { await quit(ph); await sleep(1200); continue; } }
      if (ph === 'intro') {
        await sleep(400);
        await s.shot('intro-card');
        const card = await s.page.evaluate(() => ({ steps: document.querySelectorAll('#cowCard .st').length, arts: document.querySelectorAll('#cowCard .ch-art').length, texts: [...document.querySelectorAll('#cowCard .st .tt span')].map(e => e.textContent), go: !!document.querySelector('#cowCard .go') }));
        check(card.steps === 3 && card.arts === 3 && card.texts.every(t => t.length > 10) && card.go, `${s.name}: the intro card has 3 steps: ${JSON.stringify(card)}`);
        const ring = await s.page.evaluate(() => document.querySelector('#cowRace .beat')?.classList.contains('lg'));
        check(ring, `${s.name}: the first try has the big practice ring`);
        if (quitAt === 'intro') { await quit(ph); await sleep(1200); continue; }
        await sleep(700);
        await s.pressE();
      }
      if (ph === 'countdown') { await s.shot('countdown'); if (quitAt === 'countdown') { await quit(ph); await sleep(1200); continue; } }
      if (ph === 'race' && quitAt === 'race') { await sleep(8000); await quit(ph); await sleep(1200); continue; }
      if (ph === 'race' && quitAt === 'ghost') {
        // nothing pressed for five seconds: a ghost hand shows how, on the beat; the first real tap sends it away
        for (let i = 0; i < 40 && !(await s.S()).ghost; i++) await sleep(250);
        const g = await s.S();
        check(g.ghost && g.t >= 4.8 && g.t < 9, `${s.name}: the ghost tap demo shows after about 5 s of doing nothing (race time ${g.t?.toFixed(1)}, ghost ${g.ghost})`);
        const vis = await s.page.evaluate(() => { const a = document.querySelector('#cowRace .ghost'), b = document.querySelector('#cowRace .ghostf'); return [a, b].map(e => e && getComputedStyle(e).display !== 'none'); });
        check(s.touch ? vis[1] : vis[0], `${s.name}: the ghost is drawn (${vis})`);
        await s.shot('ghost');
        await s.waitRing(); await s.tap(); await sleep(300);
        check(!(await s.S()).ghost, `${s.name}: a tap sends the ghost away`);
        await quit(ph); await sleep(1200); continue;
      }
      if (ph === 'podium' && quitAt === 'podium') { await sleep(500); await quit(ph); await sleep(1200); continue; }
    }
    if (ph === 'race' && !st.over && !quitAt) {
      await s.waitRing();
      await s.tap();
      const t = await s.S();
      if (t.t > 0.4 && !done.shot.go) {
        done.shot.go = true; await s.seated('race-go'); await s.shot('go');
        const w = await s.page.evaluate(() => ({ pop: document.querySelector('#cowRace .pop')?.textContent, cap: document.querySelector('#cowRace .cap')?.classList.contains('on') }));
        check(w.cap, `${s.name}: the caption "tap when the ring closes" is up on the first try`);
      }
      if (t.taps >= 1 && !done.shot.word) {
        done.shot.word = true;
        const w = await s.page.evaluate(() => document.querySelector('#cowRace .pop')?.textContent || '');
        check(/Perfect|Good|Nice|early|late|Puff/.test(w), `${s.name}: a tap gets a word at the ring (got "${w}")`);
        const hint = await s.page.evaluate(() => document.getElementById('trickHint')?.textContent || '');
        check(hint.length > 5, `${s.name}: the teacher answers the first taps ("${hint}")`);
      }
      if (t.t > 3 && !done.steer) {
        done.steer = true;
        const before = t.lat, dir = before > 1.5 ? -1 : 1;
        if (s.touch) {
          // (the drag starts below the menu's "Stop playing" button, which sits at the left edge around y 600-650 on a phone)
          await s.touch_('touchStart', [{ x: 90, y: 740, id: 1 }]);
          for (let i = 1; i <= 8; i++) { await s.touch_('touchMove', [{ x: 90 + dir * i * 8, y: 740, id: 1 }]); await sleep(70); }
          await sleep(500); await s.touch_('touchEnd', []);
        } else { const key = dir > 0 ? 'KeyD' : 'KeyA'; await s.page.keyboard.down(key); await sleep(700); await s.page.keyboard.up(key); }
        const after = (await s.S()).lat;
        check(Math.abs(after - before) > 0.3, `${s.name}: steering by the card's words moves the cow across the lanes (${before?.toFixed(1)} -> ${after?.toFixed(1)})`);
      }
      if (t.t > 7 && !done.help) {
        // "?" stops the race, shows the card again, and the race goes on after
        done.help = true;
        const before = (await s.S()).t;
        await s.hit('#cowRace .helpbtn');
        await sleep(900);
        const mid = await s.S();
        check(mid.helpOpen && mid.card, `${s.name}: "?" brings the card back`);
        await s.shot('help-open');
        await sleep(1200);
        const still = await s.S();
        check(Math.abs(still.t - mid.t) < 0.05, `${s.name}: the race stands still while the card is up (${mid.t?.toFixed(2)} -> ${still.t?.toFixed(2)})`);
        await s.pressE(); await sleep(700);
        const after = await s.S();
        check(!after.card && !after.helpOpen, `${s.name}: the card closes`);
        void before;
      }
      if (t.s > 24 && t.s < 29 && !done.shot.mud) { done.shot.mud = true; await s.seated('mud'); await s.shot('mud'); }
      if (t.s > 36 && !done.shot.mid) { done.shot.mid = true; await s.seated('mid'); await s.shot('mid-race'); }
      if (t.place && !done.shot.fin) { done.shot.fin = true; await s.seated('finish'); await s.shot('finish'); }
      continue;
    }
    if (st.results) {
      if (!seen.has('results')) {
        seen.add('results');
        await sleep(800);
        await s.shot('results');
        const note = await s.page.evaluate(() => document.querySelector('#trickCard .starnote')?.textContent || '');
        check(/1st place = 3 stars|Win every heat/.test(note), `${s.name}: the results card explains the stars ("${note}")`);
      }
      await sleep(400); await s.pressE(); await sleep(900);
      continue;
    }
    await s.seated(ph || 'wait');
    await sleep(ph === 'race' ? 100 : 200);
  }
  for (let i = 0; i < 40; i++) { const t = await s.S(); if (!t.round && !t.results && t.busy === 0) break; if (t.busy > 0) await s.pressE(); await sleep(300); }
  const fin = await s.S();
  check(fin.fixes === 0, `${s.name}: a rider had to be corrected ${fin.fixes} times`);
  return [...seen];
}

/**
 * A bareback heat (the "wobbly final" of Normal, asked for on its own through the QA hook), through the real controls: she
 * leans the way the player leans, the arc over her head follows, held too long she slides off INTO THE GRASS (sitting on the
 * ground beside her cow, not standing on it, not floating), hops back on and is properly seated again; the help card has its
 * fourth step; quitting leaves nothing of it behind.
 */
async function balance(s) {
  const page = s.page;
  await page.evaluate(() => { const Q = window.__STARLINE_QA__; Q.level = 'normal'; Q.cowHeats = ['bareback']; });
  await s.launch('#mgChip');
  const B = () => page.evaluate(() => {
    const Q = window.__STARLINE_QA__, g = Q.game, R = Q.cowRace, me = R?.race?.racers[0], p = g.player, V = g.camera.position.constructor, rp = new V(), hp = new V();
    p.root.updateMatrixWorld(true); p.root.getWorldPosition(rp); p.model.getObjectByName('hips')?.getWorldPosition(hp);
    const gauge = document.querySelector('#cowRace .gauge'), mk = gauge?.querySelector('.mk');
    return { phase: R?.dbg?.phase || null, bal: R?.race?.balance?.key || null, t: R?.race?.t ?? 0, tilt: me?.tilt ?? 0, fallT: me?.fallT ?? 0, falls: me?.falls ?? 0, spill: !!R?.dbg?.spill, fixes: R?.dbg?.fixes ?? 0, warns: R?.dbg?.warns ?? 0,
      clip: p.anim.currentName, up: +(rp.y - g.world.heightAt(rp.x, rp.z)).toFixed(2), hipsUp: +(hp.y - rp.y).toFixed(2), roll: +p.model.rotation.z.toFixed(2),
      gauge: gauge ? getComputedStyle(gauge).display !== 'none' : false, marker: mk?.getAttribute('transform') || '', warn: !!gauge?.classList.contains('warn'), prompt: gauge?.querySelector('.gl')?.textContent || '' };
  });
  let st = await skipTalk(s);
  for (let i = 0; i < 150 && (st = await B()).phase !== 'race'; i++) { await s.seated(st.phase || 'wait'); await sleep(200); }
  check(st.phase === 'race' && st.bal === 'gentle', `${s.name}: the bareback heat runs (${JSON.stringify(st)})`);
  await page.waitForFunction(() => window.__STARLINE_QA__.cowRace?.race?.t > 2.4, null, { timeout: 15000 }).catch(() => {});
  st = await B();
  check(st.gauge && /rotate\(/.test(st.marker), `${s.name}: the balance arc is on screen (${JSON.stringify(st)})`);
  // the "?" card of a day with a bareback heat has four steps and fits the screen
  await s.hit('#cowRace .helpbtn'); await sleep(700);
  const card = await page.evaluate(() => { const b = document.querySelector('#cowCard .box'); return { steps: document.querySelectorAll('#cowCard .st').length, arts: document.querySelectorAll('#cowCard .ch-art').length, bal: !!document.querySelector('#cowCard .balarc svg'), fits: b.scrollHeight <= b.clientHeight + 1 && b.getBoundingClientRect().bottom <= innerHeight && b.scrollWidth <= b.clientWidth + 1 }; });
  check(card.steps === 4 && card.arts === 4 && card.bal && card.fits, `${s.name}: the help card of a bareback day has 4 steps and fits: ${JSON.stringify(card)}`);
  await s.shot('balance-card');
  await s.pressE(); await sleep(600);
  // lean right and keep leaning: the marker goes right, she rolls right, the warning comes, then she is off
  if (s.touch) { await s.touch_('touchStart', [{ x: 90, y: 740, id: 1 }]); await s.touch_('touchMove', [{ x: 150, y: 740, id: 1 }]); } else await page.keyboard.down('KeyD');
  let warned = false, leaned = false, off = null;
  for (let i = 0; i < 80 && !off; i++) {
    st = await B();
    if (st.tilt > 0.25 && !st.spill && !leaned) { leaned = true; check(st.roll > 0.08 && /^RideCow|^Sit$/.test(st.clip) && st.up > 1.1, `${s.name}: she leans right in the saddle (${JSON.stringify(st)})`); }
    if (st.warn && !warned) { warned = true; check(/Lean left/.test(st.prompt), `${s.name}: the arc says which way to lean ("${st.prompt}")`); await s.shot('balance-warning'); }   // (the warning lasts a third of a second: seen when a poll lands in it)
    if (st.spill) off = st; else await sleep(40);
  }
  if (s.touch) await s.touch_('touchEnd', []); else await page.keyboard.up('KeyD');
  check(off && leaned && off.warns >= 1, `${s.name}: leaning too far tips her off, after a lean and a warning (${JSON.stringify({ off: !!off, leaned, warns: off?.warns, seen: warned })})`);
  await sleep(750);
  st = await B();
  check(st.spill && st.clip === 'SitGrass' && Math.abs(st.up) < 0.2 && st.roll === 0 && st.falls === 1, `${s.name}: she sits in the grass beside her cow (${JSON.stringify(st)})`);
  await s.shot('balance-in-the-grass');
  await page.evaluate(() => { window.__STARLINE_QA__.cowRace.lean = 'bot'; });       // (from here the rules' careful rider keeps her on)
  for (let i = 0; i < 60 && (st = await B()).spill; i++) await sleep(80);
  check(!st.spill && st.fallT === 0, `${s.name}: she is back on within the fall's two seconds (${JSON.stringify(st)})`);
  for (let i = 0; i < 6; i++) {
    await sleep(250);
    await s.seated('after the remount');
    st = await B();
    check(st.up > 1.2 && st.up < 1.7 && Math.abs(st.roll) < 0.35 && st.falls === 1, `${s.name}: back in the saddle, upright (${JSON.stringify(st)})`);
  }
  await s.shot('balance-back-on');
  check(st.fixes === 0, `${s.name}: the fall and the remount needed ${st.fixes} seat corrections`);
  await page.keyboard.press('Backspace');
  await sleep(1500);
  await page.evaluate(() => { const Q = window.__STARLINE_QA__; Q.level = null; Q.cowHeats = null; });
  const c = await page.evaluate(LEFT);
  check(c.left.length === 0 && !c.mounted && !c.pose, `${s.name}: after quitting the bareback heat the round is gone: ${JSON.stringify(c)}`);
}

/** Hay, feed, the floating hints, mount, the coach's three steps done by their own words, every gait, dismount. */
async function ride(s) {
  const page = s.page;
  await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 120000 });
  await sleep(1500);
  const RS = () => page.evaluate(() => {
    const Q = window.__STARLINE_QA__, d = Q.director, c = d.cows, hint = document.getElementById('cowHint'), card = document.getElementById('cowCoach');
    return { phase: c.phase, step: c.coach ? c.coach.step : null, card: card?.classList.contains('on') ? card.querySelector('.cc-title').textContent : null, hint: hint?.style.display === 'block' ? hint.textContent : null,
      bonded: Object.keys(d.q.state.flags).filter(k => k.startsWith('cowBond') && d.q.state.flags[k]).length, free: c.free(), busy: d.busy, fixes: c.fixes, hay: c.hay };
  });
  const cow = () => page.evaluate(() => { const a = window.__STARLINE_QA__.director.cows.cows()[0]; return { x: a.pos.x, z: a.pos.z }; });
  const near = async d => { const c = await cow(); await page.evaluate(([x, z, d]) => { const Q = window.__STARLINE_QA__; Q.teleport(x + d, z + 0.3); Q.faceToward(x, z); }, [c.x, c.z, d]); await sleep(900); };
  const hay = await page.evaluate(() => { const h = window.__STARLINE_QA__.director.cows.stacks[0]; return { x: h.x, z: h.z }; });
  await page.evaluate(h => window.__STARLINE_QA__.teleport(h.x + 0.3, h.z + 3.0), hay);
  await sleep(1000);
  await s.pressE(); await sleep(600);
  await near(4.2);
  let st = await RS();
  check(/feed her/.test(st.hint || ''), `${s.name}: with hay in her arms a hint floats over the cow ("${st.hint}")`);
  await s.shot('ride-1-feed-hint');
  for (let k = 0; k < 6 && !(await RS()).bonded; k++) { await near(1.9); await s.pressE(); await sleep(1600); }
  for (let i = 0; i < 80; i++) { st = await RS(); if (st.free && i > 5) break; if (st.busy > 0) await s.pressE(); await sleep(300); }
  check(st.bonded >= 1, `${s.name}: the cow became a friend`);
  await near(5.5);
  st = await RS();
  check(/ride/.test(st.hint || ''), `${s.name}: a friend gets a floating "press E to ride" ("${st.hint}")`);
  await near(2.2);
  await s.shot('ride-2-ride-hint');
  if (s.touch) { const b = await (await page.$('#tAct')).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); } else await s.pressE();
  for (let i = 0; i < 25; i++) { await sleep(150); st = await RS(); if (st.phase === 'ride') break; }
  check(st.phase === 'ride' && st.step === 0 && st.card, `${s.name}: the coach opens on step 1 when she mounts (${JSON.stringify(st)})`);
  await sleep(400);
  await s.shot('ride-3-steer');
  const seatedNow = async tag => { const r = await page.evaluate(RIDERS); s.samples++; for (const x of r) check(x.clip && /^RideCow|^Sit$/.test(x.clip) && x.hipsUp <= 0.3 && !x.busy, `${s.name} ${tag}: ${JSON.stringify(x)} is not seated`); };
  await seatedNow('ride-start');
  const btn = async sel => (await (await page.$(sel)).boundingBox());
  const centre = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  // step 1: steer
  for (let i = 0; i < 20 && (await RS()).step === 0; i++) {
    if (s.touch) { await s.touch_('touchStart', [{ x: 90, y: 640, id: 1 }]); for (let k = 1; k <= 6; k++) { await s.touch_('touchMove', [{ x: 90 + k * 6, y: 640 - k * 14, id: 1 }]); await sleep(60); } await sleep(700); await s.touch_('touchEnd', []); }
    else { await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW'); }
    await seatedNow('ride-steer');
  }
  st = await RS(); check(st.step === 1, `${s.name}: steering finished step 1 (${JSON.stringify(st)})`);
  await s.shot('ride-4-gallop');
  // step 2: hold to gallop
  for (let i = 0; i < 20 && (await RS()).step === 1; i++) {
    if (s.touch) {
      const g = centre(await btn('#cowUi .go'));
      await s.touch_('touchStart', [{ x: 90, y: 640, id: 1 }, { x: g.x, y: g.y, id: 2 }]);
      for (let k = 1; k <= 6; k++) { await s.touch_('touchMove', [{ x: 90, y: 640 - k * 14, id: 1 }, { x: g.x, y: g.y, id: 2 }]); await sleep(120); }
      await seatedNow('ride-gallop'); await sleep(500); await s.touch_('touchEnd', []);
    } else { await page.keyboard.down('KeyW'); await page.keyboard.down('Shift'); await sleep(1500); await seatedNow('ride-gallop'); await sleep(700); await page.keyboard.up('Shift'); await page.keyboard.up('KeyW'); }
  }
  st = await RS(); check(st.step === 2, `${s.name}: holding the gallop control finished step 2 (${JSON.stringify(st)})`);
  await s.shot('ride-5-moo');
  // step 3: moo
  for (let i = 0; i < 8 && (await RS()).step === 2; i++) { if (s.touch) { const c = centre(await btn('#cowUi .moo')); await page.touchscreen.tap(c.x, c.y); } else await page.keyboard.press('KeyM'); await sleep(700); }
  await sleep(300);
  st = await RS(); check(st.step === 3, `${s.name}: mooing finished step 3 (${JSON.stringify(st)})`);
  await s.shot('ride-6-done');
  // every gait, the stop, the "?" and the dismount
  const h = centre(await btn('#cowUi .help'));
  if (s.touch) await page.touchscreen.tap(h.x, h.y); else await page.mouse.click(h.x, h.y);
  await sleep(500);
  st = await RS(); check(st.step === 0 && st.card, `${s.name}: "?" brings the ride card back (${JSON.stringify(st)})`);
  for (const [keys, label] of [[['KeyW'], 'walk'], [['KeyW', 'Shift'], 'gallop']]) {
    if (s.touch) { await s.touch_('touchStart', [{ x: 90, y: 640, id: 1 }]); await s.touch_('touchMove', [{ x: 90, y: 560, id: 1 }]); if (label === 'gallop') { const g = centre(await btn('#cowUi .go')); await s.touch_('touchStart', [{ x: 90, y: 560, id: 1 }, { x: g.x, y: g.y, id: 2 }]); } }
    else for (const k of keys) await page.keyboard.down(k);
    for (let i = 0; i < 5; i++) { await sleep(450); await seatedNow('ride-' + label); }
    if (s.touch) await s.touch_('touchEnd', []); else for (const k of keys.slice().reverse()) await page.keyboard.up(k);
    for (let i = 0; i < 4; i++) { await sleep(350); await seatedNow('ride-stop'); }
  }
  if (s.touch) { const c = centre(await btn('#cowUi .off')); await page.touchscreen.tap(c.x, c.y); } else await page.keyboard.press('Space');
  for (let i = 0; i < 12; i++) { await sleep(120); await seatedNow('dismount'); }
  await sleep(700);
  st = await RS(); check(!st.phase, `${s.name}: she hopped off`);
  check(st.fixes === 0, `${s.name}: the ride corrected Mika ${st.fixes} times`);
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  for (const dev of devices) for (const quality of qualities) for (const story of stories) {
    const name = `${DEVICES[dev].tag}-${quality}-${story[0]}`;
    log(`== ${name}: the race`);
    const s = await new Session(browser, dev, quality, story, name).open();
    await s.launch();
    const phases = await race(s);
    for (const p of ['lineup', 'intro', 'countdown', 'race', 'podium', 'results']) check(phases.includes(p), `${name}: phase ${p} was seen (${phases})`);
    await sleep(1200);
    const base = await s.page.evaluate(LEFT);
    check(base.left.length === 0 && !base.mounted && !base.pose, `${name}: after the first round nothing is left behind: ${JSON.stringify(base)}`);
    // quit at every stage: nothing of the round stays, Mika is on her feet, and the memory stays bounded
    for (const stage of ['lineup', 'intro', 'countdown', 'ghost', 'race', 'podium']) {
      await s.launch('#mgChip');
      await race(s, { quitAt: stage });
      await sleep(1200);
      const c = await s.page.evaluate(LEFT);
      check(c.left.length === 0 && !c.mounted && !c.pose, `${name}: after quitting at ${stage} the round is gone: ${JSON.stringify(c)}`);
      // (other systems stream things in and out near the track: a bounded drift is fine, a round that leaks would grow without bound; 7 repeated quits were flat in a manual run)
      check(c.geometries <= base.geometries + 120 && c.textures <= base.textures + 8, `${name}: after quitting at ${stage} memory is bounded (geometries ${base.geometries} -> ${c.geometries}, textures ${base.textures} -> ${c.textures})`);
    }
    if (args.balance !== '0') { log(`== ${name}: the bareback heat`); await balance(s); }
    check(s.errors.length === 0, `${name}: console errors: ${s.errors.slice(0, 3).join(' | ')}`);
    log(`${name}: ${s.samples} rider checks, ${s.errors.length} errors`);
    await s.close();
    if (args.ride !== '0') {
      log(`== ${name}: the ride`);
      const r = await new Session(browser, dev, quality, story, `ride-${name}`).open('start=continue');
      await ride(r);
      check(r.errors.length === 0, `ride-${name}: console errors: ${r.errors.slice(0, 3).join(' | ')}`);
      log(`ride-${name}: ${r.samples} rider checks, ${r.errors.length} errors`);
      await r.close();
    }
  }
} catch (e) { failures.push(`crashed: ${e.stack || e}`); log('CRASH', e.stack || e); }
await browser.close();
server?.kill();
log(failures.length ? `${failures.length} failure(s)` : 'all passed');
if (failures.length) { for (const f of failures) console.log(' -', f); process.exit(1); }
