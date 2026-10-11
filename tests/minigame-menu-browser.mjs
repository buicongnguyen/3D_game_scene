// The Mini games menu in a real browser, desktop (1280x720) and phone (390x844).
//   node tests/minigame-menu-browser.mjs [--only=desktop|phone] [--all=1] [--shots=0] [--out=.tools/review/minigames]
//   GAME_URL=http://127.0.0.1:5838/   (default; a vite dev or preview server must be running there, or it starts one)
//   --all=1   also launch EVERY game of the catalogue once (from the chip), and list those that fail to start or to come back
// It checks that
//   * the title menu keeps every button on screen at 320x568, 360x640, 390x844, 844x390, 1024x520, 1280x720;
//   * the picker opens from the title, lists the categories with their games, remembers the last tab, and works with the
//     keyboard (arrows / Enter / Esc), touch (taps) and a gamepad (D-pad, A, B) with a visible focus ring;
//   * three games from different categories start straight from the title with no progress (season, hour and place are the
//     game's own), come back to free roam with the chip, and the next one starts from the chip; the scene does not grow;
//   * the pause menu's Mini games entry in a STORY save leaves the save exactly as it was (storage, quest, Mika, season and hour);
//   * nothing logs an error.
import { createRequire } from 'module';
import { mkdirSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { stateAt } from './e2e/fastforward.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const OUT = path.resolve(ROOT, args.out || '.tools/review/minigames');
const SHOTS = args.shots !== '0';
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE_PATH || path.join(ROOT, 'node_modules/playwright');
if (!existsSync(pwPath)) { console.error('Playwright not found.'); process.exit(2); }
const { chromium } = require(pwPath);

let server = null, url = process.env.GAME_URL || 'http://127.0.0.1:5838/';
const up = await fetch(url).then(r => r.ok, () => false);
if (!up) {
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', '5838', '--strictPort'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, NO_HMR: '1' } });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 60000);
    const seen = d => { if (/ready|Local/.test(String(d))) { clearTimeout(t); res(); } };
    server.stdout.on('data', seen); server.stderr.on('data', seen);
    server.on('exit', code => rej(new Error(`vite exited ${code}`)));
  });
}

const SAVE = JSON.stringify({ v: 1, quest: stateAt('c1.cogs', 'alone', 'grandma'), player: { x: -40, y: 3, z: 20, facing: 3.1 }, at: 1760000000000 });
const DEVICES = {
  desktop: { tag: 'd', viewport: { width: 1280, height: 720 } },
  phone: { tag: 'p', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};
const TITLE_SIZES = [[320, 568], [360, 640], [390, 844], [844, 390], [1024, 520], [1280, 720]];
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } };
const notes = [];

// ---------------------------------------------------------------- in-page helpers
const SNAP = () => {
  const g = window.__STARLINE__, d = g.director, p = g.player, r = (v, n = 3) => +(+v).toFixed(n);
  const ls = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/minigames-tab/.test(k)) ls[k] = localStorage.getItem(k); }
  window.__mgRefs ??= {};
  const same = (k, v) => { if (!(k in window.__mgRefs)) window.__mgRefs[k] = v; return window.__mgRefs[k] === v; };
  return {
    ls, quest: d.quest ? JSON.stringify({ ...d.quest.save(), playtime: 0 }) : null,       // (the play clock ticks on its own)
    questSame: same('quest', d.quest ?? null),
    player: [r(p.pos.x), r(p.pos.y), r(p.pos.z), r(p.facing), p.root.visible],
    season: g.time.season, hour: r(g.time.hour, 4), shownSeason: g.shownSeason, shownHour: r(g.shownHour(), 4),
    seasonOverride: g.seasonOverride ?? null, timeOverride: g.timeOverride ?? null, cycleHour: g.cycleHour ?? null, weatherOff: !!g.weatherOff,
    tourLock: !!d.tourLock, explore: !!d.explore, paused: g.paused, interior: g.interiors?.active || null,
    gameQuestSame: g.quest === d.quest, story: d.quest?.state.story,
    lamps: [...g.structures.lamps.entries()].map(([id, L]) => [id, L.target, r(L.lit)]),
  };
};
const COUNTS = () => { const g = window.__STARLINE__, m = g.renderer.renderer.info.memory; let n = 0; g.scene.traverse(() => n++); return { children: g.scene.children.length, objects: n, geometries: m.geometries, textures: m.textures }; };
const STATE = () => {
  const g = window.__STARLINE__, d = g.director;
  if (!d?.quest) return null;
  return { pos: [g.player.pos.x, g.player.pos.z].map(v => +v.toFixed(1)), season: g.shownSeason, hour: g.shownHour(), round: d.tricks?.round?.id || null, yard: !!d.yard?.round, mg: d.minigame?.kind || null,
    sky: !!d.sky?.active, ws: !!d.workshop?.active, busy: d.busy, run: !!d.minigameMenu?.running, chip: !document.getElementById('mgChip').classList.contains('hidden'),
    interior: g.interiors?.active || null, fade: document.getElementById('fade').classList.contains('on') };
};

async function boot(browser, dev, query, { save = false, pad = false } = {}) {
  const ctx = await browser.newContext({ viewport: dev.viewport, hasTouch: !!dev.hasTouch, isMobile: !!dev.isMobile, deviceScaleFactor: dev.deviceScaleFactor || 1 });
  if (save) await ctx.addInitScript(s => { if (!localStorage.getItem('starline-save-1')) { localStorage.setItem('starline-save-1', s); localStorage.setItem('starline-last-slot', '1'); } }, SAVE);
  if (pad) await ctx.addInitScript(() => {
    window.__pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0], connected: true, id: 'test pad' };
    navigator.getGamepads = () => [window.__pad];
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${url}?mute&qa=1&${query}`);
  await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
  const hit = sel => (dev.hasTouch ? page.tap(sel) : page.click(sel));
  return { ctx, page, errors, hit };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(OUT, `${name}.png`) }); };

/** Open the picker (title button, the chip or the pause entry), choose a game by id. */
async function choose(page, hit, id, door) {
  await hit(door);
  await page.waitForSelector('#mgPicker:not(.hidden)');
  const cats = await page.evaluate(() => [...document.querySelectorAll('.mg-tab')].map(t => t.dataset.cat));
  for (const c of cats) { await hit(`.mg-tab[data-cat=${c}]`); if (await page.$(`.mg-card[data-id="${id}"]`)) break; }
  if (!(await page.$(`.mg-card[data-id="${id}"]`))) return false;
  await page.locator(`.mg-card[data-id="${id}"]`).scrollIntoViewIfNeeded();
  await hit(`.mg-card[data-id="${id}"]`);
  return true;
}

/**
 * Wait until the game is in play, take `shotName`, leave it (Backspace / Esc) and wait for the free roam.
 * Returns { started, back, failed, seen }.
 */
async function playAndLeave(page, shotName, { maxStart = 45, maxBack = 40, results = false } = {}) {
  let started = false, seen = null, s = null;
  for (let i = 0; i < maxStart * 2; i++) {
    await page.waitForTimeout(500);
    s = await page.evaluate(STATE);
    if (!s) continue;
    if (s.busy > 0) await page.keyboard.press('KeyE');
    if (s.round || s.yard || s.mg || s.sky || s.ws) { started = true; seen = s; break; }
    if (!s.run && i > 6 && !s.fade) break;                      // gave up on its own (a game that is not ready)
  }
  if (!started) return { started, back: false, failed: true, seen: s };
  await page.waitForTimeout(2500);
  if (shotName) await shot(page, shotName);
  if (results) {
    // the first guided round is short: let it run out and see the results card
    await page.waitForSelector('#trickCard:not(.hidden), #yardCard:not(.hidden)', { timeout: 80000 }).catch(() => {});
    if (shotName) await shot(page, `${shotName}-card`);
    await page.keyboard.press('KeyE');
  }
  let back = false;
  for (let i = 0; i < maxBack * 2; i++) {
    const t = await page.evaluate(STATE);
    if (t && !t.run && !t.round && !t.yard && !t.mg && !t.sky && !t.ws && !t.fade && t.chip) { back = true; break; }
    if (t?.busy > 0) await page.keyboard.press('KeyE');
    else { await page.keyboard.press(t?.sky ? 'Escape' : 'Backspace'); }
    await page.waitForTimeout(500);
  }
  return { started, back, failed: false, seen };
}

// ---------------------------------------------------------------- the title menu fits
async function titleFit(browser) {
  log('title menu at six sizes');
  const { ctx, page, errors } = await boot(browser, DEVICES.desktop, 'tourtest=1');
  await page.waitForTimeout(2500);
  for (const [w, h] of TITLE_SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const vis = [...document.querySelectorAll('#title .menu button, #title .menu .langs button')].filter(b => b.offsetParent);
      const out = vis.map(b => { const r = b.getBoundingClientRect(); return { id: b.id || b.textContent, t: r.top, b: r.bottom, l: r.left, r: r.right }; });
      const t = document.getElementById('title');
      return { out, vw: innerWidth, vh: innerHeight, scroll: t.scrollHeight > t.clientHeight + 1, sh: t.scrollHeight, ch: t.clientHeight, hasMini: !!document.getElementById('btnTitleMini') };
    });
    const cut = m.out.filter(b => b.t < -0.5 || b.b > m.vh + 0.5 || b.l < -0.5 || b.r > m.vw + 0.5);
    check(m.hasMini && cut.length === 0, `title ${w}x${h}: every button inside the screen (cut: ${cut.map(c => c.id).join(', ') || 'none'})`);
    if (m.scroll) notes.push(`title ${w}x${h}: the menu scrolls (${m.sh} px in ${m.ch} px)`);
    await shot(page, `title-${w}x${h}`);
  }
  check(errors.length === 0, `title: no console errors (${errors[0] || ''})`);
  await ctx.close();
}

// ---------------------------------------------------------------- the picker: categories, keyboard, touch, gamepad
async function pickerChecks(browser, name, dev) {
  log(`${name}: the picker`);
  const { ctx, page, errors, hit } = await boot(browser, dev, 'tourtest=1', { pad: true });
  await page.waitForTimeout(2500);
  await hit('#btnTitleMini');
  await page.waitForSelector('#mgPicker:not(.hidden)');
  const cats = await page.evaluate(() => [...document.querySelectorAll('.mg-tab')].map(t => t.dataset.cat));
  check(cats.length >= 4, `${name}: at least four categories (${cats.join(',')})`);
  for (const c of cats) {
    await hit(`.mg-tab[data-cat=${c}]`);
    await page.waitForTimeout(250);
    const info = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.mg-card')];
      return { n: cards.length, small: cards.filter(c => c.getBoundingClientRect().height < 44).length, noName: cards.filter(c => !c.querySelector('h3')?.textContent.trim()).length,
        clipped: cards.filter(c => c.scrollHeight > c.clientHeight + 2).length, hscroll: document.querySelector('.mg-grid').scrollWidth > document.querySelector('.mg-grid').clientWidth + 1 };
    });
    check(info.n > 0 && info.small === 0 && info.noName === 0 && info.clipped === 0 && !info.hscroll, `${name}: category ${c}: ${info.n} cards, all >= 44 px, named, not clipped (${JSON.stringify(info)})`);
    await shot(page, `picker-${dev.tag}-${c}`);
  }
  // remembers the last tab
  const last = cats[cats.length - 1];
  await hit(`.mg-tab[data-cat=${last}]`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#mgPicker', { state: 'hidden' });
  await hit('#btnTitleMini');
  await page.waitForSelector('#mgPicker:not(.hidden)');
  check(await page.evaluate(() => document.querySelector('.mg-tab[aria-selected=true]')?.dataset.cat) === last, `${name}: the picker reopens on the last tab`);
  // keyboard
  await hit(`.mg-tab[data-cat=${cats[0]}]`);
  await page.keyboard.press('ArrowDown');
  const f1 = await page.evaluate(() => document.activeElement?.dataset.id || document.activeElement?.className);
  check(String(f1).includes(':') || String(f1) === 'workshop', `${name}: ArrowDown from the tabs focuses a card (${f1})`);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const f2 = await page.evaluate(() => document.activeElement?.dataset.id);
  check(!!f2, `${name}: arrows keep the focus on a card (${f2})`);
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  check(await page.evaluate(() => document.activeElement?.classList.contains('mg-tab')), `${name}: Up from the first row reaches the tabs`);
  await page.keyboard.press('ArrowRight');
  check(await page.evaluate(() => document.querySelector('.mg-tab[aria-selected=true]')?.dataset.cat) !== cats[0], `${name}: Right on the tabs changes the category`);
  // gamepad: D-pad moves the focus, a ring shows, B closes
  await page.evaluate(() => { document.querySelector('.mg-tab[aria-selected=true]').focus(); });
  const press = async i => { await page.evaluate(i => { window.__pad.buttons[i].pressed = true; }, i); await page.waitForTimeout(120); await page.evaluate(i => { window.__pad.buttons[i].pressed = false; }, i); await page.waitForTimeout(120); };
  await press(13);
  const g1 = await page.evaluate(() => ({ id: document.activeElement?.dataset.id, ring: document.activeElement?.classList.contains('pad') || getComputedStyle(document.activeElement).borderColor }));
  check(!!g1.id, `${name}: the gamepad D-pad down focuses a card (${JSON.stringify(g1)})`);
  await shot(page, `picker-${dev.tag}-gamepad-focus`);
  await press(1);
  await page.waitForSelector('#mgPicker', { state: 'hidden', timeout: 3000 }).catch(() => {});
  check(await page.evaluate(() => document.getElementById('mgPicker').classList.contains('hidden')), `${name}: gamepad B closes the picker`);
  // long Vietnamese / Korean / Japanese names wrap inside their cards
  for (const [i, lang] of [[2, 'vi'], [3, 'ko'], [4, 'ja']]) {
    await hit(`#titleLangs button:nth-child(${i})`);
    await hit('#btnTitleMini');
    await page.waitForSelector('#mgPicker:not(.hidden)');
    for (const c of cats) {
      await hit(`.mg-tab[data-cat=${c}]`);
      await page.waitForTimeout(150);
      const info = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.mg-card')], grid = document.querySelector('.mg-grid');
        return { n: cards.length, clipped: cards.filter(c => c.scrollHeight > c.clientHeight + 2).length, over: cards.filter(c => c.scrollWidth > c.clientWidth + 2).length, hscroll: grid.scrollWidth > grid.clientWidth + 1, tabs: document.querySelector('.mg-tabs').scrollWidth > document.querySelector('.mg-tabs').clientWidth + 1 };
      });
      check(info.clipped === 0 && info.over === 0 && !info.hscroll, `${name}: ${lang} ${c}: cards wrap and are not clipped (${JSON.stringify(info)})`);
      if (c === 'country') await shot(page, `picker-${dev.tag}-${lang}`);
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('#mgPicker', { state: 'hidden' });
  }
  await hit('#titleLangs button:nth-child(1)');
  check(errors.length === 0, `${name}: picker: no console errors (${errors[0] || ''})`);
  await ctx.close();
}

// ---------------------------------------------------------------- three games from the title, then the chip
async function fromTitle(browser, name, dev, ids) {
  log(`${name}: games from the title: ${ids.join(', ')}`);
  const { ctx, page, errors, hit } = await boot(browser, dev, 'tourtest=1');
  await page.waitForTimeout(2500);
  const counts = [];
  let door = '#btnTitleMini';
  for (const [k, id] of ids.entries()) {
    const ok = await choose(page, hit, id, door);
    check(ok, `${name}: ${id} is in the picker`);
    if (!ok) { await page.keyboard.press('Escape'); continue; }
    const r = await playAndLeave(page, `launch-${dev.tag}-${id.replace(':', '-')}`, { results: k === 0 && id.startsWith('trick:') });
    check(r.started, `${name}: ${id} started (${JSON.stringify(r.seen)})`);
    check(r.back, `${name}: ${id} came back to free roam with the chip`);
    if (k === 0) {
      const rec = await page.evaluate(() => { try { const d = JSON.parse(localStorage.getItem('starline-save-explore')); return d?.quest?.tricks?.frogs || null; } catch { return null; } });
      check(!!rec && rec.learned && rec.intro && rec.plays >= 1, `${name}: the Explore save keeps the learned trick and its first score (${JSON.stringify(rec)})`);
    }
    if (k === 0 && r.seen) {
      const plan = await page.evaluate(i => { const e = window.__STARLINE__.director.minigameMenu.entry(i); return { season: e.season, hour: e.hour }; }, id);
      check(r.seen.season === plan.season && r.seen.hour === plan.hour, `${name}: ${id} ran in its own season and hour (${r.seen.season} ${r.seen.hour})`);
    }
    await page.waitForTimeout(800);
    await shot(page, `freeroam-${dev.tag}-${k}`);
    counts.push(await page.evaluate(COUNTS));
    door = '#mgChip';
  }
  // the last game again: nothing it built the first time is left behind (a game's first start loads its own models: not counted)
  if (ids.length >= 2) {
    const id = ids[ids.length - 1], base = counts[counts.length - 1];
    await choose(page, hit, id, door);
    const r = await playAndLeave(page, null);
    check(r.started && r.back, `${name}: ${id} again`);
    await page.waitForTimeout(800);
    const again = await page.evaluate(COUNTS);
    check(again.objects <= base.objects + 4 && again.geometries <= base.geometries + 6 && again.textures <= base.textures + 6, `${name}: the scene does not grow when a game is played again (${JSON.stringify(base)} -> ${JSON.stringify(again)})`);
  }
  check(errors.length === 0, `${name}: from the title: no console errors (${errors.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- the pause menu in a story save
async function fromPause(browser, name, dev, id) {
  log(`${name}: pause menu in a story save (${id})`);
  const { ctx, page, errors, hit } = await boot(browser, dev, 'start=continue&slot=1&tourtest=1', { save: true });
  await page.waitForTimeout(3500);
  await page.evaluate(() => window.__STARLINE__.director.tricks?.round);
  const before = await page.evaluate(SNAP), base = await page.evaluate(COUNTS);
  check(before.quest !== null && !before.explore, `${name}: a story save is running`);
  // the entry is there in the pause menu, and hidden while a dialogue is open (checked by canOpen)
  await page.evaluate(() => window.__STARLINE__.togglePause(true));
  await page.waitForSelector('#pause:not(.hidden)');
  check(await page.evaluate(() => !document.getElementById('btnPauseMini').classList.contains('hidden')), `${name}: the pause menu has a Mini games entry`);
  await shot(page, `pause-${dev.tag}`);
  await hit('#btnPauseMini');
  await page.waitForSelector('#mgPicker:not(.hidden)');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#mgPicker', { state: 'hidden' });
  check(await page.evaluate(() => window.__STARLINE__.paused && !document.getElementById('pause').classList.contains('hidden')), `${name}: closing the picker leaves the pause menu as it was`);
  check(await page.evaluate(() => { const d = window.__STARLINE__.director; d.busy++; const off = !d.minigameMenu.canOpen(); d.busy--; return off && d.minigameMenu.canOpen(); }), `${name}: the entry is unavailable while a dialogue or scene owns the game`);
  await hit('#btnPauseMini');
  await page.waitForSelector('#mgPicker:not(.hidden)');
  const ok = await page.evaluate(i => !!document.querySelector(`.mg-card[data-id="${i}"]`) || [...document.querySelectorAll('.mg-tab')].length > 0, id);
  check(ok, `${name}: the picker opens from the pause menu`);
  const cats = await page.evaluate(() => [...document.querySelectorAll('.mg-tab')].map(t => t.dataset.cat));
  for (const c of cats) { await hit(`.mg-tab[data-cat=${c}]`); if (await page.$(`.mg-card[data-id="${id}"]`)) break; }
  await hit(`.mg-card[data-id="${id}"]`);
  // while the session runs the story is a throwaway and nothing can be saved
  let mid = null;
  for (let i = 0; i < 60 && !mid; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(STATE);
    if (s?.busy > 0) await page.keyboard.press('KeyE');
    if (s && (s.round || s.yard || s.mg || s.sky || s.ws)) mid = await page.evaluate(SNAP);
  }
  check(!!mid && mid.tourLock && !mid.questSame, `${name}: during the game the save is shielded (tourLock ${mid?.tourLock}, same quest ${mid?.questSame})`);
  await shot(page, `pause-launch-${dev.tag}`);
  for (let i = 0; i < 80; i++) {
    const t = await page.evaluate(STATE);
    if (t && !t.run && !t.round && !t.yard && !t.mg && !t.sky && !t.ws && !t.fade) break;
    if (t?.busy > 0) await page.keyboard.press('KeyE'); else await page.keyboard.press(t?.sky ? 'Escape' : 'Backspace');
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1200);
  const after = await page.evaluate(SNAP), end = await page.evaluate(COUNTS);
  for (const k of Object.keys(before)) {
    const a = JSON.stringify(before[k]), b = JSON.stringify(after[k]);
    if (a === b) continue;
    let i = 0; while (i < a.length && a[i] === b[i]) i++;       // show where they part
    check(false, `${name}: ${k} changed at ${i}\n      before ...${a.slice(Math.max(0, i - 60), i + 140)}\n      after  ...${b.slice(Math.max(0, i - 60), i + 140)}`);
  }
  check(after.questSame && after.gameQuestSame, `${name}: the very same quest object is back`);
  check(end.objects <= base.objects + 12, `${name}: nothing is left in the scene (${base.objects} -> ${end.objects})`);
  check(await page.evaluate(() => document.getElementById('mgChip').classList.contains('hidden')), `${name}: no chip in a story save`);
  check(errors.length === 0, `${name}: pause: no console errors (${errors.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ---------------------------------------------------------------- every game present
async function everyGame(browser, name, dev) {
  log(`${name}: every game in the catalogue`);
  const { ctx, page, errors, hit } = await boot(browser, dev, 'tourtest=1');
  await page.waitForTimeout(2500);
  const ids = await page.evaluate(() => window.__STARLINE__.director?.minigameMenu?.catalogue?.map(e => ({ id: e.id, kind: e.kind })) || null);
  // the catalogue exists once the world is up; before that read it from the module
  const list = ids || await page.evaluate(async () => (await import('/src/content/minigames.js')).buildCatalogue().map(e => ({ id: e.id, kind: e.kind })));
  const bad = [];
  let door = '#btnTitleMini';
  for (const { id } of list) {
    const ok = await choose(page, hit, id, door);
    if (!ok) { bad.push(`${id}: not in the picker`); await page.keyboard.press('Escape'); continue; }
    const r = await playAndLeave(page, `all-${id.replace(':', '-')}`, { maxStart: 30, maxBack: 40 });
    log(`  ${id}: ${r.started ? 'started' : 'DID NOT START'}${r.started && !r.back ? ', DID NOT COME BACK' : ''}`);
    if (!r.started) bad.push(`${id}: did not start (${JSON.stringify(r.seen)})`);
    else if (!r.back) bad.push(`${id}: did not return to free roam`);
    door = '#mgChip';
    if (!(await page.evaluate(() => !document.getElementById('mgChip').classList.contains('hidden')))) {
      // stuck: reload the page state is not possible; stop the sweep
      bad.push(`${id}: the chip never came back, sweep stopped`);
      break;
    }
  }
  check(errors.length === 0, `${name}: every game: no console errors (${errors.slice(0, 3).join(' | ')})`);
  for (const b of bad) check(false, `${name}: ${b}`);
  await ctx.close();
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  if ((!args.only || args.only === 'desktop') && (!args.phase || args.phase === 'title')) await titleFit(browser);
  for (const [name, dev] of Object.entries(DEVICES)) {
    if (args.only && args.only !== name) continue;
    const on = p => !args.phase || args.phase === p;
    if (on('picker')) await pickerChecks(browser, name, dev);
    if (on('title')) await fromTitle(browser, name, dev, ['trick:frogs', 'yard:footnet', 'fish:dock', 'sky:star-hill']);
    if (on('pause')) await fromPause(browser, name, dev, 'trick:frogs');
    if (args.all && name === 'desktop') await everyGame(browser, name, dev);
  }
} catch (e) {
  failures.push(`crashed: ${e.stack || e}`);
  log('CRASH', e.stack || e);
} finally {
  await browser.close();
  server?.kill();
}
for (const n of notes) log('note:', n);
log(failures.length ? `${failures.length} FAILURE(S)` : 'all minigame menu checks passed');
for (const f of failures) console.log(' - ' + f);
process.exit(failures.length ? 1 : 0);
