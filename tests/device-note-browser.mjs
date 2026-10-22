// The weak-device card before a story (src/engine/device-note.js, docs/play-zones/phase-1-device-notice.md), in a real
// browser, as a player's page (no ?qa: the card is never shown in QA runs).
//   GAME_URL=http://127.0.0.1:5897/ node tests/device-note-browser.mjs [--out=.tools/device-note]
// (a vite dev or preview server must be running there; run it against the production build before a release)
// It checks:
//   * a weak phone (2 GB, 4 cores, Low) sees the card after New Game → slot → story, inside the screen with 44 px taps,
//     at 390x844 and 844x390;
//   * "Play in light mode" saves Low + light people + no shadows, and the story starts with the light people loaded;
//   * the card is shown once: after a reload New Game goes straight on;
//   * "Play mini games instead" opens the Mini games list with no valley loaded; closing the card goes back to the title
//     and shows it again next time; "Continue" starts the story as it was set;
//   * Settings shows the note and its button on the weak phone and not on a strong desktop, which never sees the card.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const url = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const OUT = args.out || '.tools/device-note';
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } else log('  ok', msg); return ok; };

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const WIDE = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1280, height: 720 } };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });

/** A context that looks like a device with this memory and these cores, and not like an automated browser. */
async function device(opts, { memory, cores }) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(({ memory, cores }) => {
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => memory, configurable: true });
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => cores, configurable: true });
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
  }, { memory, cores });
  return ctx;
}
async function open(ctx, quality, query = '') {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 240)); });
  await page.goto(`${url}?mute&quality=${quality}${query}`);
  await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
  page.errors = errors;
  return page;
}
const tap = (page, sel) => page.locator(sel).first().click();
/** New Game → the first slot → the first story. Resolves when the card shows ('card') or the title has gone ('started'). */
async function newGame(page) {
  await tap(page, '#btnNew');
  await page.waitForSelector('#slots:not(.hidden) #slotList .pick');
  await tap(page, '#slotList .pick');
  await page.waitForFunction(() => document.querySelector('#slotList .pick .num')?.textContent === '☀');
  await tap(page, '#slotList .pick');
  await page.waitForFunction(() => document.querySelector('#slots.device-note:not(.hidden)') || document.getElementById('title').classList.contains('hidden'));
  return page.evaluate(() => (document.querySelector('#slots.device-note:not(.hidden)') ? 'card' : 'started'));
}
/** The card's box and buttons inside the screen, the buttons at least 44 px tall, nothing overlapping. */
async function layout(page, name) {
  const r = await page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight, box = document.querySelector('#slots .book');
    const rect = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const btns = [...document.querySelectorAll('#slotList [data-note]')].map(rect);
    const inside = b => b.x >= -1 && b.y >= -1 && b.x + b.w <= vw + 1 && b.y + b.h <= vh + 1;
    const overlap = btns.some((a, i) => btns.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
    const small = [...document.querySelectorAll('#slots *')].filter(e => e.childElementCount === 0 && e.textContent.trim() && e.offsetParent)
      .map(e => parseFloat(getComputedStyle(e).fontSize)).filter(s => s < 11).length;
    return { n: btns.length, inside: btns.every(inside) && inside(rect(box)), tall: btns.every(b => b.h >= 44), overlap, small };
  });
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  check(r.n === 3, `${name}: three choices (${r.n})`);
  check(r.inside, `${name}: card inside the screen`);
  check(r.tall, `${name}: every choice at least 44 px tall`);
  check(!r.overlap, `${name}: choices do not overlap`);
  check(r.small === 0, `${name}: no text under 11 px (${r.small})`);
}
const settingsNote = page => page.evaluate(() => { const n = document.getElementById('optDeviceNote'); return n ? { on: !!n, btn: !document.getElementById('btnLightMode').classList.contains('hidden') } : null; });

try {
  // 1. weak phone: the card, light mode, once only
  {
    log('weak phone: light mode');
    const ctx = await device(PHONE, { memory: 2, cores: 4 });
    const page = await open(ctx, 'low');
    const sn = await settingsNote(page);
    check(sn?.on && sn.btn, 'Settings has the note and its light-mode button');
    check(await newGame(page) === 'card', 'the card shows before the story');
    await layout(page, 'card-390x844');
    await tap(page, '[data-note=light]');
    await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 240000 });
    const s = await page.evaluate(() => {
      const g = window.__STARLINE__, ls = k => localStorage.getItem(k);
      return { tier: g.renderer.qualityName, people: g.assets.people, choice: ls('starline-opt-people'), quality: ls('starline-quality'),
        shadows: ls('starline-opt-shadows'), sun: g.world?.sky?.sun?.castShadow, seen: ls('starline-device-note'), btn: document.getElementById('btnLightMode')?.classList.contains('hidden') };
    });
    check(s.tier === 'low' && s.quality === 'low', `light mode: Low tier saved (${s.tier}, ${s.quality})`);
    check(s.people === 'lite' && s.choice === '"lite"', `light mode: the light people loaded and saved (${s.people}, ${s.choice})`);
    check(s.shadows === 'false' && s.sun === false, `light mode: no sun shadows (${s.shadows}, ${s.sun})`);
    check(s.seen === '1', 'the card is remembered as seen');
    check(s.btn === true, 'Settings: the button gives way to "Light mode is on."');
    await page.screenshot({ path: path.join(OUT, 'light-story-390x844.png') });
    check(page.errors.length === 0, `no errors (${page.errors.slice(0, 3).join(' | ')})`);
    await page.close();
    const again = await open(ctx, 'low');
    check(await newGame(again) === 'started', 'once per device: after a reload New Game goes straight on');
    await ctx.close();
  }
  // 2. weak phone: close, then mini games instead
  {
    log('weak phone: close, then mini games');
    const ctx = await device(PHONE, { memory: 2, cores: 4 });
    const page = await open(ctx, 'low');
    check(await newGame(page) === 'card', 'the card shows');
    await tap(page, '#slotsClose');
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => ({ title: !document.getElementById('title').classList.contains('hidden'), seen: localStorage.getItem('starline-device-note'), world: !!window.__STARLINE__.world }));
    check(t.title && !t.seen && !t.world, 'closing the card goes back to the title, not seen, no valley');
    check(await newGame(page) === 'card', 'the card shows again after closing it');
    await tap(page, '[data-note=mini]');
    await page.waitForSelector('#mgPicker:not(.hidden)', { timeout: 20000 });
    check(!(await page.evaluate(() => !!window.__STARLINE__.world)), 'mini games instead: the list, with no valley loaded');
    await page.screenshot({ path: path.join(OUT, 'mini-list-390x844.png') });
    check(page.errors.length === 0, `no errors (${page.errors.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
  // 3. weak phone turned: layout, then Continue keeps the settings as they were
  {
    log('weak phone 844x390: continue');
    const ctx = await device(WIDE, { memory: 2, cores: 4 });
    const page = await open(ctx, 'low');
    check(await newGame(page) === 'card', 'the card shows (turned phone)');
    await layout(page, 'card-844x390');
    await tap(page, '[data-note=go]');
    await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 240000 });
    const s = await page.evaluate(() => ({ shadows: localStorage.getItem('starline-opt-shadows'), choice: localStorage.getItem('starline-opt-people') }));
    check(s.shadows !== 'false' && s.choice !== '"lite"', `continue: settings unchanged (${s.shadows}, ${s.choice})`);
    check(page.errors.length === 0, `no errors (${page.errors.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
  // 4. strong desktop: never; ?devicenote=1 shows it anyway (for a look at 1280x720)
  {
    log('strong desktop');
    const ctx = await device(DESK, { memory: 8, cores: 16 });
    const page = await open(ctx, 'medium');
    check(await settingsNote(page) === null, 'Settings has no device note on a strong desktop');
    check(await newGame(page) === 'started', 'a strong desktop never sees the card');
    await page.close();
    const forced = await open(ctx, 'medium', '&devicenote=1');
    check(await newGame(forced) === 'card', '?devicenote=1 shows the card anywhere');
    await layout(forced, 'card-1280x720');
    await ctx.close();
  }
} finally {
  await browser.close();
}
log(failures.length ? `${failures.length} FAILED` : 'all passed');
process.exit(failures.length ? 1 : 0);
