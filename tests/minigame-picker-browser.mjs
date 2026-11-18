// Keyboard focus in the real title/pause Mini games picker, including the production bundle.
// GAME_URL=http://127.0.0.1:5947/ node tests/minigame-picker-browser.mjs [--only=desktop|phone] [--out=.tools/picker-focus]
// Does not import /src in the page or start/stop a preview server.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateAt } from './e2e/fastforward.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
if (!process.env.GAME_URL) throw Error('Set GAME_URL to a running dev or production preview.');
const OUT = path.resolve(ROOT, args.out || '.tools/picker-focus');
mkdirSync(OUT, { recursive: true });
const cases = [], failures = [], started = Date.now();
const check = (ok, text) => { if (!ok) failures.push(text); };
const save = JSON.stringify({ v: 1, quest: stateAt('c1.cogs', 'alone', 'grandma'),
  player: { x: -40, y: 3, z: 20, facing: 3.1 }, at: 1760000000000 });
const devices = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });

const focus = () => {
  const picker = document.getElementById('mgPicker'), a = document.activeElement;
  const buttons = [...picker.querySelectorAll('button')].filter(b => b.tabIndex >= 0 && !b.disabled && b.getClientRects().length);
  return { inside: picker.contains(a), at: buttons.indexOf(a), count: buttons.length,
    name: a.id || a.dataset.id || a.dataset.cat || a.className || a.tagName };
};
const edgeFocus = last => {
  const buttons = [...document.querySelectorAll('#mgPicker button')].filter(b => b.tabIndex >= 0 && !b.disabled && b.getClientRects().length);
  buttons[last ? buttons.length - 1 : 0].focus();
};

try {
  for (const [device, options] of Object.entries(devices)) {
    if (args.only && args.only !== device) continue;
    for (const door of ['title', 'pause']) {
      const tag = `${device}-${door}`, ctx = await browser.newContext(options), errors = [], badResources = [];
      try {
        await ctx.addInitScript(s => {
          localStorage.setItem('starline-lang', 'en');
          if (s) { localStorage.setItem('starline-save-1', s); localStorage.setItem('starline-last-slot', '1'); }
        }, door === 'pause' ? save : null);
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));
        // HTTP failures from the game origin are checked below; optional remote fonts
        // may fail in an offline browser without indicating a gameplay exception.
        page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource:')) errors.push(m.text()); });
        page.on('response', r => { if (r.status() >= 400 && new URL(r.url()).origin === new URL(process.env.GAME_URL).origin) badResources.push(`${r.status()} ${r.url()}`); });
        const url = new URL(process.env.GAME_URL);
        for (const [k, v] of Object.entries({ qa: '1', mute: '1', quality: 'low', tourtest: '1' })) url.searchParams.set(k, v);
        if (door === 'pause') { url.searchParams.set('start', 'continue'); url.searchParams.set('slot', '1'); }
        await page.goto(url.href);
        await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
        if (door === 'pause') {
          await page.waitForFunction(() => window.__STARLINE__?.director?.quest && !window.__STARLINE__.director.busy);
          await page.click('#btnMenu');
        }
        const opener = door === 'title' ? '#btnTitleMini' : '#btnPauseMini';
        const open = async () => {
          await page.locator(opener).focus();
          await page.keyboard.press('Enter');
          await page.waitForSelector('#mgPicker:not(.hidden)');
        };
        await open();
        const initial = await page.evaluate(focus);
        check(initial.inside && initial.at >= 0, `${tag}: opening focuses a picker control`);
        check(await page.getByRole('dialog', { name: 'Mini games', exact: true }).count() === 1, `${tag}: the modal has its translated heading as accessible name`);
        const grid = page.locator('#mgPicker .mg-grid'), cardCount = await grid.locator('.mg-card').count();
        check(await grid.getByRole('listitem').count() === cardCount && await grid.getByRole('button').count() === cardCount,
          `${tag}: every list item contains a card exposed as a native button`);
        await page.locator('#mgPicker .mg-x').focus();
        await page.keyboard.press('ArrowDown');
        check(await page.evaluate(() => document.activeElement === document.querySelector('#mgPicker .mg-card')),
          `${tag}: ArrowDown from Close focuses the first card instead of overwriting it with a category tab`);

        // Boundary keys use the actual browser's focus order; native Tab previously reached
        // BODY and the obscured New game/Menu buttons behind the supposedly modal picker.
        await page.evaluate(edgeFocus, true);
        await page.keyboard.press('Tab');
        const forward = await page.evaluate(focus);
        check(forward.inside && forward.at === 0, `${tag}: Tab after the last card wraps to Close (${JSON.stringify(forward)})`);
        await page.keyboard.press('Shift+Tab');
        const backward = await page.evaluate(focus);
        check(backward.inside && backward.at === backward.count - 1, `${tag}: Shift+Tab from Close wraps to the last card`);

        // Held Tab emits repeat keydowns; those must not bypass modal handling either.
        await page.keyboard.down('Tab');
        for (let i = 0; i < initial.count + 2; i++) {
          await page.keyboard.down('Tab');
          check((await page.evaluate(focus)).inside, `${tag}: repeated Tab ${i} stays in the modal`);
        }
        await page.keyboard.up('Tab');
        await page.evaluate(() => document.querySelector('#mgPicker .mg-tab[aria-selected=true]').focus());
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowDown');
        check(await page.evaluate(() => document.activeElement.classList.contains('mg-card')), `${tag}: category arrows still reach a playable card`);
        await page.evaluate(edgeFocus, true);
        await page.keyboard.press('Tab');
        check((await page.evaluate(focus)).at === 0, `${tag}: containment survives category rerender`);
        await page.screenshot({ path: path.join(OUT, `${tag}-picker.png`) });

        await page.keyboard.press('Escape');
        await page.waitForSelector('#mgPicker', { state: 'hidden' });
        const cancelFocus = await page.evaluate(() => document.activeElement.id);
        check(cancelFocus === opener.slice(1), `${tag}: Escape returns focus to ${opener} (${cancelFocus})`);
        if (door === 'pause') check(await page.evaluate(() => window.__STARLINE__.paused && !document.getElementById('pause').classList.contains('hidden')), `${tag}: cancel preserves the paused game`);

        // Reopening must replace the saved opener, and keyboard activation of Close must
        // return to the same control just as Escape does.
        await open();
        await page.locator('#mgPicker .mg-x').focus();
        await page.keyboard.press('Enter');
        await page.waitForSelector('#mgPicker', { state: 'hidden' });
        check(await page.evaluate(() => document.activeElement.id) === opener.slice(1), `${tag}: Close returns focus after reopening`);

        // Assistive technology can find and activate a game as a button. Verify the real
        // catalogue entry reaches the launch flow, rather than testing a synthetic click.
        await open();
        for (const category of await page.locator('#mgPicker .mg-tab').evaluateAll(tabs => tabs.map(t => t.dataset.cat))) {
          await page.locator(`#mgPicker .mg-tab[data-cat="${category}"]`).click();
          if (await page.locator('#mgPicker .mg-card[data-id="yard:oanquan"]').count()) break;
        }
        const gameButton = grid.getByRole('button', { name: /^Ô ăn quan\b/ });
        check(await gameButton.count() === 1, `${tag}: Ô ăn quan is discoverable by its button role and name`);
        await gameButton.press('Enter');
        await page.waitForSelector('#mgPicker', { state: 'hidden' });
        await page.waitForFunction(() => window.__STARLINE__.director?.minigameMenu?.running
          && window.__STARLINE__.director.minigameMenu.current?.id === 'yard:oanquan', null, { timeout: 20000 });
        check(errors.length === 0 && badResources.length === 0, `${tag}: no runtime/resource errors (${[...errors, ...badResources].join('; ')})`);
        const result = { tag, initial, forward, backward, cancelFocus, errors, badResources };
        cases.push(result); console.log(JSON.stringify(result));
      } catch (e) { failures.push(`${tag}: ${e.stack || e}`); }
      finally { await ctx.close(); }
    }
  }
} finally {
  await browser.close();
  const report = { url: process.env.GAME_URL, passed: failures.length === 0, seconds: (Date.now() - started) / 1000, cases, failures };
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cases: cases.length, seconds: report.seconds, failures }, null, 2));
}
process.exitCode = failures.length ? 1 : 0;
