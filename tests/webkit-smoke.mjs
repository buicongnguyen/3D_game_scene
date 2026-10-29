// The Safari engine (WebKit): does the game start there? iPhone Safari is the likely phone of most players and every other
// browser test here runs Chromium (docs/PLAY-ZONES-PLAN.md, review gap 6).
//   GAME_URL=http://127.0.0.1:5897/ node tests/webkit-smoke.mjs
// It opens the title, then Explore, then a zone game from ?play=, on a phone-sized WebKit page, and fails on any page
// error or console error, or when the game does not start. Exit 2 (skipped) when this WebKit has no WebGL at all.
// Not a speed test: WebKit on a desktop is not a phone. Safari has no navigator.deviceMemory, which is the point of the
// first check (the weak-device notice must not break without it).
import { webkit } from 'playwright';

const url = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } else log('  ok', msg); return ok; };

let browser;
try { browser = await webkit.launch(); } catch (e) { log('WebKit cannot launch here:', e.message.split('\n')[0]); process.exit(2); }
async function open(query) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) page.errors.push(m.text().slice(0, 200)); });
  await page.goto(`${url}?mute&qa=1&quality=low${query}`, { waitUntil: 'commit', timeout: 60000 });
  return { ctx, page };
}
try {
  {
    log('title');
    const { ctx, page } = await open('&quick=on');
    const ready = await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 120000 }).then(() => true, () => false);
    if (!check(ready, 'the title comes up')) { log('errors:', page.errors.slice(0, 3)); await ctx.close(); throw new Error('no title'); }
    const gl = await page.evaluate(() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } });
    if (!gl) { log('this WebKit has no WebGL 2: skipped'); await ctx.close(); await browser.close(); process.exit(2); }
    check(await page.evaluate(() => navigator.deviceMemory === undefined), 'no navigator.deviceMemory here, as in Safari');
    check(page.errors.length === 0, `no errors at the title (${page.errors.slice(0, 2).join(' | ')})`);
    await ctx.close();
  }
  for (const [name, query] of [['Explore', '&quick=on&start=explore&slot=explore'], ['a zone game (?play=trick:eggs)', '&quick=on&play=trick:eggs']]) {
    log(name);
    const { ctx, page } = await open(query);
    const playing = await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 240000 }).then(() => true, () => false);
    check(playing, `${name} starts`);
    if (playing) {
      // WebKit on a desktop has no GPU (software rendering at phone resolution can take seconds a frame): wait for a few frames,
      // and report the rate. Stuck (no frames in 40 s) fails; slow does not: that is the machine, not the game.
      const f0 = await page.evaluate(() => window.__STARLINE__.frameCount), tw = Date.now();
      await page.waitForFunction(n => window.__STARLINE__.frameCount >= n, f0 + 6, { timeout: 40000 }).catch(() => {});
      const s = await page.evaluate(() => { const g = window.__STARLINE__; return { frames: g.frameCount, calls: g.lastInfo?.calls, tier: g.renderer.qualityName, zone: g.zone?.id || null }; });
      const secs = (Date.now() - tw) / 1000, got = s.frames - f0;
      check(got >= 2, `${name} keeps drawing: ${got} frames in ${secs.toFixed(0)} s (${(got / secs).toFixed(1)} fps in software WebKit), ${s.calls} draws, tier ${s.tier}${s.zone ? ', zone ' + s.zone : ''}`);
    }
    check(page.errors.length === 0, `no errors in ${name} (${page.errors.slice(0, 2).join(' | ')})`);
    await ctx.close();
  }
} catch (e) { failures.push(String(e.message || e)); } finally { await browser.close(); }
log(failures.length ? `${failures.length} FAILED` : 'all passed');
process.exit(failures.length ? 1 : 0);
