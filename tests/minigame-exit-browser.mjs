// Every mini game has a visible way out, and from the Mini games list that way leads back to the list.
//   GAME_URL=http://127.0.0.1:5822/ node tests/minigame-exit-browser.mjs [--only=phone|desktop] [--ids=trick:eggs,yard:tug]
// For each game of the catalogue: open it from the title's Mini games list (with ?autolist=1, the players' behaviour),
// wait for play to begin, find the exit control on screen (the shared "Back to games" button, or a card board's own
// Leave), check it is big enough to tap and inside the screen, press it, and wait for the list to come back.
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const url = process.env.GAME_URL || 'http://127.0.0.1:5822/';
const OUT = args.out || '.tools/exit-shots';
fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 720 } },
};
const EXITS = ['#minigameStop', '#lifeBoard .leave', '[data-leave]'];
const failures = [];
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
for (const [name, dev] of Object.entries(DEV)) {
  if (args.only && args.only !== name) continue;
  const ctx = await browser.newContext({ ...dev, hasTouch: !!dev.hasTouch, isMobile: !!dev.isMobile });
  const page = await ctx.newPage();
  page.on('pageerror', e => failures.push(`${name}: pageerror ${e.message}`));
  const hit = sel => (dev.hasTouch ? page.tap(sel) : page.click(sel));
  await page.goto(`${url}?mute&qa=1&quality=low&autolist=1`);
  await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await hit('#btnTitleMini');
  await page.waitForSelector('#mgPicker:not(.hidden)');
  let ids = await page.evaluate(() => [...new Set([...document.querySelectorAll('.mg-tab')].flatMap(t => { t.click(); return [...document.querySelectorAll('.mg-card')].map(c => c.dataset.id); }))]);
  if (args.ids) ids = ids.filter(i => args.ids.split(',').includes(i));
  for (const id of ids) {
    // the list is up: pick the game
    await page.waitForSelector('#mgPicker:not(.hidden)', { timeout: 30000 }).catch(() => {});
    const cats = await page.evaluate(() => [...document.querySelectorAll('.mg-tab')].map(t => t.dataset.cat));
    for (const c of cats) { await hit(`.mg-tab[data-cat=${c}]`); if (await page.$(`.mg-card[data-id="${id}"]`)) break; }
    await page.locator(`.mg-card[data-id="${id}"]`).scrollIntoViewIfNeeded();
    await hit(`.mg-card[data-id="${id}"]`);
    // play begins: tap through a teacher's first words
    let exit = null;
    for (let k = 0; k < 70 && !exit; k++) {
      await page.waitForTimeout(500);
      const s = await page.evaluate(sels => {
        const d = window.__STARLINE__.director;
        for (const sel of sels) for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
          if (r.width && r.height && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('.hidden')) return { busy: d.busy, sel, text: el.textContent.trim(), box: [r.left, r.top, r.width, r.height].map(Math.round), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
        }
        // a card board's own way out is a button that says Leave
        const leave = [...document.querySelectorAll('button')].find(b => /^(Leave|Back to games|Stop playing)$/.test(b.textContent.trim()) && b.offsetParent && !b.closest('#pause'));
        if (leave) { leave.setAttribute('data-leave', '1'); const r = leave.getBoundingClientRect(); return { busy: d.busy, sel: '[data-leave]', text: leave.textContent.trim(), box: [r.left, r.top, r.width, r.height].map(Math.round), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; }
        return { busy: d.busy, sel: null, pick: !document.getElementById('lvlPick')?.classList.contains('hidden') && !!document.getElementById('lvlPick') };
      }, EXITS);
      if (s.sel) exit = s;
      else if (s.busy > 0) await page.keyboard.press('KeyE');
    }
    if (!exit) { failures.push(`${name} ${id}: no exit control appeared`); log(name, id, 'NO EXIT'); await page.screenshot({ path: `${OUT}/${name}-${id.replace(':', '_')}-noexit.png` }); await page.reload(); await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 }); await page.waitForTimeout(1500); await hit('#btnTitleMini'); continue; }
    await page.screenshot({ path: `${OUT}/${name}-${id.replace(':', '_')}.png` });
    const small = Math.min(exit.box[2], exit.box[3]) < 40;
    if (small) failures.push(`${name} ${id}: the exit is only ${exit.box[2]}x${exit.box[3]} px`);
    if (!exit.inside) failures.push(`${name} ${id}: the exit is partly off the screen ${JSON.stringify(exit.box)}`);
    await hit(exit.sel).catch(() => page.evaluate(sel => document.querySelector(sel).click(), exit.sel));   // a real tap: the card boards listen for pointer events
    const back = await page.waitForSelector('#mgPicker:not(.hidden)', { timeout: 25000 }).then(() => true).catch(() => false);
    if (!back) { failures.push(`${name} ${id}: the list did not come back after "${exit.text}"`); await page.screenshot({ path: `${OUT}/${name}-${id.replace(':', '_')}-stuck.png` }); await page.reload(); await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 }); await page.waitForTimeout(1500); await hit('#btnTitleMini'); }
    log(name, id, `"${exit.text}"`, exit.box.join(','), back ? 'list back' : 'LIST DID NOT COME BACK', small ? 'SMALL' : '', exit.inside ? '' : 'OFF SCREEN');
  }
  await ctx.close();
}
await browser.close();
if (failures.length) { console.log(`${failures.length} failure(s)\n` + failures.join('\n')); process.exit(1); }
console.log('every mini game has a way back to the list');
