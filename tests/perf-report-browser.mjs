// The Settings button "Copy performance report" (src/ui/ui.js, src/engine/perf-report.js, Game.perfReport) in a real browser.
//   GAME_URL=http://127.0.0.1:5897/ node tests/perf-report-browser.mjs
// Plays a few seconds in Explore on a phone-sized page, opens Settings, taps the button and reads the clipboard: the text
// names the device and tier, has real frame numbers and draw counts, and no NaN or undefined. Also checks the fallback:
// with the clipboard refused the text is shown to copy by hand.
import { chromium } from 'playwright';

const url = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } else log('  ok', msg); return ok; };

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  for (const refuse of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    if (!refuse) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (refuse) await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('refused')) }, configurable: true }); document.execCommand = () => false; });
    await page.goto(`${url}?mute&qa=1&quality=low&start=explore&slot=explore`, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 240000 });
    await page.waitForTimeout(5000);
    log(refuse ? 'clipboard refused' : 'clipboard works');
    await page.evaluate(() => window.__STARLINE__.ui.open('settings'));
    await page.waitForSelector('#btnPerfReport', { state: 'attached', timeout: 10000 });
    await page.locator('#btnPerfReport').scrollIntoViewIfNeeded();
    await page.locator('#btnPerfReport').click();
    await page.waitForTimeout(800);
    const shown = await page.evaluate(() => ({ area: !document.getElementById('perfReportText').classList.contains('hidden'), text: document.getElementById('perfReportText').value, msg: document.querySelector('#optPerfNote span:nth-of-type(2)')?.textContent || '' }));
    const text = refuse ? shown.text : await page.evaluate(() => navigator.clipboard.readText());
    check(/performance report/.test(text) && /graphics: low/.test(text), 'the report says what tier it is');
    check(/game work median \d/.test(text) && /draw calls/.test(text) && /JS heap|frames \(last/.test(text), 'with real frame numbers and draw counts');
    check(!/NaN|undefined|\?\?/.test(text), 'and nothing broken in it');
    check(refuse ? shown.area : !shown.area, refuse ? 'refused: the text is shown to copy by hand' : 'copied: the text box stays hidden');
    if (!refuse) log(text.split('\n').map(l => '    ' + l).join('\n'));
    check(errors.length === 0, `no errors (${errors.slice(0, 2).join(' | ')})`);
    await ctx.close();
  }
} finally { await browser.close(); }
log(failures.length ? `${failures.length} FAILED` : 'all passed');
process.exit(failures.length ? 1 : 0);
