// Play zones in a real browser (docs/play-zones/phase-2-zone-pilot.md): the converted mini games, opened from the
// title's Mini games list on a phone, build only their corner of the valley.
//   GAME_URL=http://127.0.0.1:5897/ node tests/zone-browser.mjs [--only=games,switch,wall,off] [--out=.tools/zone/suite]
// (a vite dev or preview server must be running there; run it against the production build before a release)
// It checks:
//   * games: each converted game starts from the list in its zone with its baked far view, is playable, leaves no
//     placeholder box inside the zone and logs no error (screenshots at 390x844);
//   * switch: after a round the list comes back; a game outside the zone starts in its own zone from a fresh page
//     (?play=), and closing the list goes back to the title;
//   * wall: walking out of a zone, Mika is held inside it and told where the game is;
//   * off: ?zones=off builds the whole valley for the same pick, as before.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { exploreState } from '../src/game/fastforward.js';
import { ZONES, zoneFor } from '../src/content/zones.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const url = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const OUT = args.out || '.tools/zone/suite';
fs.mkdirSync(OUT, { recursive: true });
const want = k => !args.only || args.only.split(',').includes(k);
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } else log('  ok', msg); return ok; };
const GAMES = Object.keys(ZONES);

// an Explore save in which every converted game has been played (no teacher's first talk before the round)
const quest = exploreState();
for (const id of GAMES) {
  const [kind, ref] = id.split(':');
  if (kind === 'trick') quest.tricks[ref] = { learned: true, intro: true, best: 20, stars: 1, plays: 1, levels: { easy: { best: 20, stars: 1 } } };
  else { quest.yard ??= {}; quest.yard[ref] = { plays: 1, wins: 1, best: 1, stars: 1, total: 4, levels: { easy: { best: 1, stars: 1 } } }; }
}
const SAVE = JSON.stringify({ v: 1, quest, player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: 1760000000000 });

const PLAYABLE = id => {
  const fade = document.getElementById('fade');
  if (fade && (fade.classList.contains('on') || +getComputedStyle(fade).opacity > 0.05)) return false;
  if (id.startsWith('trick:')) return !!document.querySelector('#trickHud:not(.hidden)') && !document.querySelector('#trickCard:not(.hidden)') && !document.querySelector('#lvlPick:not(.hidden)');
  const hud = document.getElementById('yardHud'), s = window.__STARLINE_QA__?.director?.yard?.round?.sim?.state;
  return !!hud && !hud.classList.contains('hidden') && ['aim', 'think', 'ready', 'pull'].includes(s);
};

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
async function phone(query = '') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(s => { if (!localStorage.getItem('starline-save-explore')) localStorage.setItem('starline-save-explore', s); }, SAVE);
  // the level is named up front (the valley's QA helpers replace the title's, so name it again there)
  await ctx.addInitScript(() => { setInterval(() => { const q = window.__STARLINE_QA__; if (q && !q.level) q.level = 'easy'; }, 30); });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) page.errors.push(m.text().slice(0, 240)); });
  await page.goto(`${url}?mute&qa=1&quality=low&quick=on${query}`);
  await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
  return { ctx, page };
}
/** The title's Mini games list, then game `id`'s card. */
async function pick(page, id) {
  await page.tap('#btnTitleMini');
  await page.waitForSelector('#mgPicker:not(.hidden)');
  await tapCard(page, id);
}
async function tapCard(page, id) {
  const cats = await page.evaluate(() => [...document.querySelectorAll('.mg-tab')].map(t => t.dataset.cat));
  for (const c of cats) { await page.tap(`.mg-tab[data-cat=${c}]`); if (await page.$(`.mg-card[data-id="${id}"]`)) break; }
  await page.locator(`.mg-card[data-id="${id}"]`).scrollIntoViewIfNeeded();
  await page.tap(`.mg-card[data-id="${id}"]`);
}
const playable = (page, id) => page.waitForFunction(PLAYABLE, id, { timeout: 240000, polling: 100 });
const zoneState = page => page.evaluate(() => window.__STARLINE_QA__.zoneCheck());

try {
  if (want('games')) for (const id of GAMES) {
    log(`games: ${id}`);
    const { ctx, page } = await phone();
    await pick(page, id);
    await playable(page, id);
    const z = await zoneState(page);
    check(z.zone?.id === id, `${id}: plays in its zone (${z.zone?.id})`);
    check(z.backdrop, `${id}: with its baked far view`);
    check(z.placeholders.length === 0, `${id}: no placeholder inside the zone (${JSON.stringify(z.placeholders.slice(0, 4))})`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `${id.replace(':', '_')}-390x844.png`) });
    check(page.errors.length === 0, `${id}: no errors (${page.errors.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  if (want('switch')) {
    log('switch: after a round, a game elsewhere; then back to the title');
    const { ctx, page } = await phone('&autolist=1');
    await pick(page, 'trick:eggs');
    await playable(page, 'trick:eggs');
    await page.evaluate(() => window.__STARLINE_QA__.director.tricks.quitRound());
    await page.waitForSelector('#mgPicker:not(.hidden)', { timeout: 30000 });
    check(true, 'the list comes back after the round');
    await tapCard(page, 'yard:tug');
    await page.waitForURL(/play=yard%3Atug|play=yard:tug/, { timeout: 30000 });
    check(true, 'a game outside the zone starts from a fresh page (?play=yard:tug)');
    await page.waitForFunction(() => window.__STARLINE_QA__?.zoneCheck, null, { timeout: 180000 });
    await playable(page, 'yard:tug');
    const z = await zoneState(page);
    check(z.zone?.id === 'yard:tug' && z.backdrop, `and plays in its own zone (${z.zone?.id})`);
    await page.evaluate(() => window.__STARLINE_QA__.director.yard.quit());
    await page.waitForSelector('#mgPicker:not(.hidden)', { timeout: 30000 });
    await page.tap('#mgPicker .mg-x');
    await page.waitForFunction(() => !location.search.includes('play=') && window.__STARLINE_READY__ && !document.getElementById('title').classList.contains('hidden'), null, { timeout: 60000 });
    check(true, 'closing the list goes back to the title');
    check(page.errors.length === 0, `no errors (${page.errors.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  if (want('wall')) {
    log('wall: walking out of the fireflies zone');
    const { ctx, page } = await phone('&play=trick:firefly');
    await page.waitForFunction(() => window.__STARLINE_QA__?.zoneCheck, null, { timeout: 180000 });
    await playable(page, 'trick:firefly');
    await page.evaluate(() => window.__STARLINE_QA__.director.tricks.quitRound());
    await page.waitForTimeout(2500);
    const z = zoneFor('trick:firefly');
    // put her near the edge, facing out, and walk on
    await page.evaluate(([x, zz]) => { const q = window.__STARLINE_QA__; q.teleport(x, zz); q.faceToward(x + 50, zz); }, [z.x + z.r - 8, z.z]);
    await page.evaluate(() => { window.__told = false; new MutationObserver(() => { if ([...document.querySelectorAll('#toasts .toast')].some(t => /way/.test(t.textContent))) window.__told = true; }).observe(document.getElementById('toasts'), { childList: true, subtree: true }); });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(5000);
    await page.keyboard.up('KeyW');
    const s = await page.evaluate(([x, zz]) => { const p = window.__STARLINE__.player.pos; return { d: Math.hypot(p.x - x, p.z - zz), told: window.__told }; }, [z.x, z.z]);
    check(s.d <= z.r - 1 + 0.05, `held inside the zone (${s.d.toFixed(1)} m of ${z.r})`);
    check(s.d > z.r - 12, `but she did walk up to its edge (${s.d.toFixed(1)} m)`);
    check(s.told, 'told where the game is');
    await page.screenshot({ path: path.join(OUT, 'wall-firefly-390x844.png') });
    check(page.errors.length === 0, `no errors (${page.errors.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  if (want('off')) {
    log('off: ?zones=off builds the whole valley');
    const { ctx, page } = await phone('&zones=off');
    await pick(page, 'trick:eggs');
    await playable(page, 'trick:eggs');
    const z = await zoneState(page);
    check(!z.zone && !z.backdrop, 'no zone, no far view');
    check(page.errors.length === 0, `no errors (${page.errors.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
log(failures.length ? `${failures.length} FAILED` : 'all passed');
process.exit(failures.length ? 1 : 0);
