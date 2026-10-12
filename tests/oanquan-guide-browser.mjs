// OAnQuan help in the real game (dev or production), or --fixture=1 for isolated UI/key handling.
// GAME_URL=http://127.0.0.1:5866/ node tests/oanquan-guide-browser.mjs --out=.tools/oan-guide
// The isolated fixture is generated inside the served worktree, so it never changes game source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const url = process.env.GAME_URL || 'http://127.0.0.1:5866/';
const out = path.resolve(ROOT, args.out || '.tools/oan-guide');
fs.mkdirSync(out, { recursive: true });
const fixture = args.fixture === '1';
if (fixture) fs.writeFileSync(path.join(ROOT, '.tools/oan-guide-fixture.html'), `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#78a087;font-family:Nunito,system-ui,sans-serif}#minigameStop[hidden]{display:none}</style></head><body><button id="minigameStop" hidden>Stop playing</button><script type="module">
import {createOanQuanGuide} from '/src/ui/oanquan-guide.js';import {setLang} from '/src/i18n/i18n.js';
await setLang(new URLSearchParams(location.search).get('lang')||'en');window.__events=[];window.__gamekeys=[];
window.addEventListener('keydown',e=>{window.__gamekeys.push(e.code);if(e.code==='Space')e.preventDefault()});
window.__guide=createOanQuanGuide({touch:matchMedia('(max-width:700px)').matches,input:{releaseAll(){window.__events.push('release')}},onOpen(){window.__events.push('open')},onClose(){window.__events.push('close')},onStop(){window.__events.push('stop')}});window.__guide.show();window.__ready=true;
</script></body></html>`);

const cases = [
  { id: 'desktop-en', w: 1280, h: 720, lang: 'en' },
  { id: 'phone-en', w: 390, h: 844, lang: 'en', touch: true },
  { id: 'phone-vi', w: 390, h: 844, lang: 'vi', touch: true },
  { id: 'phone-ko', w: 390, h: 844, lang: 'ko', touch: true },
  { id: 'phone-ja', w: 390, h: 844, lang: 'ja', touch: true },
  { id: 'small-vi', w: 320, h: 568, lang: 'vi', touch: true },
  { id: 'landscape-ja', w: 844, h: 390, lang: 'ja', touch: true },
];
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const results = [];
try {
  for (const c of cases.filter(c => !args.only || c.id === args.only)) {
    const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, hasTouch: !!c.touch, isMobile: !!c.touch, deviceScaleFactor: 1 });
    await ctx.addInitScript(lang => localStorage.setItem('starline-lang', lang), c.lang);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}${fixture ? '.tools/oan-guide-fixture.html' : ''}?lang=${c.lang}&qa=1&mute=1&quality=low`);
    if (fixture) await page.waitForFunction(() => window.__ready);
    else {
      await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
      await page.click('#btnTitleMini');
      await page.waitForSelector('#mgPicker:not(.hidden)');
      for (const tab of await page.locator('.mg-tab').all()) {
        await tab.click();
        if (await page.locator('.mg-card[data-id="yard:oanquan"]').count()) break;
      }
      await page.click('.mg-card[data-id="yard:oanquan"]');
      await page.waitForSelector('#oanHelpBtn:not([hidden])', { timeout: 180000 });
    }
    const hit = async sel => { if (c.touch) await page.tap(sel); else await page.click(sel); };
    // Focused help must work with both native keyboard activators despite the game's Space listener.
    await page.focus('#oanHelpBtn');
    await page.keyboard.press('Space');
    await page.waitForSelector('#oanGuide:not([hidden])');
    assert.equal(await page.locator('#oanHelpBtn').getAttribute('aria-expanded'), 'true');
    const layout = await page.evaluate(() => {
      const p = document.querySelector('.og-panel'), r = p.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, sw: p.scrollWidth, cw: p.clientWidth, sh: p.scrollHeight, ch: p.clientHeight,
        bodyOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.ok(layout.x >= 0 && layout.y >= 0 && layout.right <= c.w + 1 && layout.bottom <= c.h + 1, `${c.id} panel fits screen`);
    assert.ok(layout.sw <= layout.cw + 1 && !layout.bodyOverflow, `${c.id} no horizontal overflow`);
    await page.screenshot({ path: path.join(out, `${c.id}-rules.png`) });
    if (!fixture) {
      const before = await page.evaluate(() => { const s = window.__STARLINE__.director.yard.round.sim; return JSON.stringify({ board: s.board, shown: s.shown, state: s.state, timer: s.timer, t: s.t, score: s.score, sel: s.sel }); });
      await page.waitForTimeout(1100);
      assert.equal(await page.evaluate(() => { const s = window.__STARLINE__.director.yard.round.sim; return JSON.stringify({ board: s.board, shown: s.shown, state: s.state, timer: s.timer, t: s.t, score: s.score, sel: s.sel }); }), before, 'help freezes opponent and all round timers');
      await page.keyboard.press('KeyE'); await page.keyboard.press('KeyW');
      assert.equal(await page.evaluate(() => { const s = window.__STARLINE__.director.yard.round.sim; return JSON.stringify({ board: s.board, shown: s.shown, state: s.state, timer: s.timer, t: s.t, score: s.score, sel: s.sel }); }), before, 'guide keys cannot mutate the real round');
    }
    for (const [lesson, count, captured] of [['sow', 5, 0], ['continue', 6, 0], ['capture', 4, 4], ['quan', 4, 10]]) {
      await hit(`[data-lesson="${lesson}"]`);
      await page.locator('.og-next').scrollIntoViewIfNeeded();
      for (let i = 0; i < count; i++) await hit('.og-next');
      assert.equal(await page.locator('.og-next').isDisabled(), true, `${lesson} reaches manual end`);
      assert.match(await page.locator('.og-pile').textContent(), new RegExp(`(^|[^0-9])${captured}([^0-9]|$)`));
      assert.match(await page.locator('.og-hand').textContent(), /0/);
      if (lesson === 'quan') await page.screenshot({ path: path.join(out, `${c.id}-capture.png`) });
    }
    await hit('.og-reset');
    assert.equal(await page.locator('.og-next').isDisabled(), false);
    await hit('[data-dir="-1"]');
    for (let i = 0; i < 3; i++) await hit('.og-next');
    assert.match(await page.locator('.og-pile').textContent(), /10/);
    assert.equal(await page.locator('[data-sq="0"] small').textContent(), '', 'left direction captures left quan');
    assert.ok(await page.locator('[data-sq="1"]').getAttribute('class').then(s => s.includes('gap')), 'empty pit is visually marked');
    await hit('.og-next');
    // Tab trap and Escape must work from a scroll position deep in the guide.
    await page.focus('.og-stop'); await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => document.activeElement.className);
    assert.ok(/og-close/.test(focus) || await page.evaluate(() => document.activeElement.id === 'minigameStop'));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#oanGuide[hidden]', { state: 'attached' });
    await page.focus('#oanHelpBtn'); await page.keyboard.press('Enter');
    await page.waitForSelector('#oanGuide:not([hidden])');
    await hit('.og-stop');
    await page.waitForSelector('#oanGuide[hidden]', { state: 'attached' });
    if (fixture) {
      const ev = await page.evaluate(() => window.__events), keys = await page.evaluate(() => window.__gamekeys);
      assert.equal(ev.filter(e => e === 'open').length, 2);
      assert.equal(ev.filter(e => e === 'close').length, 2);
      assert.equal(ev.filter(e => e === 'stop').length, 1);
      assert.deepEqual(keys, [], 'help keyboard events never reach gameplay');
    } else {
      await page.waitForFunction(() => !window.__STARLINE__.director.yard.round, null, { timeout: 180000 });
      assert.equal(await page.locator('#oanHelpBtn').isVisible(), false);
    }
    assert.deepEqual(errors, []);
    results.push({ id: c.id, passed: true, layout }); console.log(`PASS ${c.id}`);
    await ctx.close();
  }
} finally { await browser.close(); fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); }
