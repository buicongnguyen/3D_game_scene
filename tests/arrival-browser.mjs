// The phone's opening (docs/OPENING-LAG-PLAN.md): a new game on a phone-sized Low page plays the arrival clip
// smoothly, fetched once and early, with nothing of the valley drawn under it and a clean cut back to live.
//   GAME_URL=http://127.0.0.1:4318/ node tests/arrival-browser.mjs [--cpu=1] [--live=0]
// Run it against a BUILT site (npm run build, then vite preview): the dev server hides build-only problems.
// Needs Edge or Chrome (H.264); Playwright's own Chromium cannot play the clips (exit code 2).
// It checks that
//   • the opening takes the clip, and the report (qa.arrival) says so, with its start time and dropped frames;
//   • the clip was fetched before the scene began, and its bytes came over the network once, not twice;
//   • while the clip runs the 3D renderer draws nothing (the phone only decodes the video);
//   • under 2 % of the video frames are dropped, no frame gap over 100 ms, the hand-over's worst gap under 100 ms;
//   • with ?live=1 the live cutscene plays and the report says why.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const url = process.env.GAME_URL || 'http://127.0.0.1:4318/';
const cpu = +(args.cpu || 1);
const MANIFEST = JSON.parse(readFileSync(new URL('../public/video/manifest.json', import.meta.url), 'utf8'));
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? '  ok ' : '  FAIL'} ${what}`); if (!ok) fails++; };

let browser = null;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel, headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] }); break; } catch { /* next */ }
}
if (!browser) { console.error('No H.264 browser (Edge or Chrome) for Playwright.'); process.exit(2); }

async function opening(live) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const reqs = new Map(); let introBytes = 0, introStart = Infinity;
  cdp.on('Network.requestWillBeSent', e => { if (/video\/intro-.*\.mp4/.test(e.request.url)) { reqs.set(e.requestId, e.request.url); introStart = Math.min(introStart, e.timestamp * 1000); } });
  cdp.on('Network.loadingFinished', e => { if (reqs.has(e.requestId)) introBytes += e.encodedDataLength; });
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.goto(`${url}?mute&qa=1&quality=low&start=new&slot=3&story=grandma${live ? '&live=1' : ''}`);
  await page.waitForFunction(() => window.__STARLINE_QA__, null, { timeout: 240000 });
  // the scene: cinema on, then off again
  await page.waitForFunction(() => document.body.classList.contains('cinema'), null, { timeout: 240000 });
  const cinemaAt = await page.evaluate(() => performance.timeOrigin + performance.now());
  let drawsWhileClip = -1;
  if (!live) {
    await page.waitForTimeout(6000);
    drawsWhileClip = await page.evaluate(() => { const g = window.__STARLINE__; return g.clipPlaying && g.renderer.hold ? g.lastInfo?.calls ?? -1 : -2; });
  }
  await page.waitForFunction(() => window.__STARLINE_QA__.arrival()?.scene && !document.body.classList.contains('cinema'), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const a = await page.evaluate(() => window.__STARLINE_QA__.arrival());
  const report = await page.evaluate(() => window.__STARLINE__.perfReport());
  console.log(JSON.stringify(a));
  if (live) {
    check(a.mode === 'live' && a.reason === 'live switch', `?live=1 plays the live cutscene and says why (${a.mode}, ${a.reason})`);
    check(a.scene?.frames > 100, `the live scene's frames were counted (${a.scene?.frames}; worst gap ${a.scene?.worst} ms, ${a.scene?.over100} over 100 ms)`);
  } else {
    const clip = MANIFEST.clips['intro-grandma-tall'];
    check(a.mode === 'clip', `the opening plays the recorded clip (${a.mode} ${a.reason || ''})`);
    check(a.firstMs > 0 && a.firstMs < 12000, `the clip started after ${Math.round(a.firstMs)} ms`);
    check(introStart < cinemaAt, 'the clip was asked for before the scene began (fetched early)');
    check(introBytes > 0 && introBytes < clip.bytes * 1.3, `its bytes came once: ${introBytes} for a ${clip.bytes}-byte file`);
    check(drawsWhileClip === 0, `nothing of the valley is drawn under the clip (${drawsWhileClip} draws)`);
    check(a.total > 0 && a.dropped / a.total < 0.02, `video frames dropped ${a.dropped}/${a.total}`);
    check(a.scene.over100 === 0, `no frame gap over 100 ms during the clip (worst ${a.scene.worst} ms, ${a.scene.over50} over 50 ms)`);
    check(a.handover < 100, `the cut back to live: worst gap ${Math.round(a.handover)} ms`);
    check(report.includes('opening: recorded clip'), 'the Settings performance report tells about the opening');
  }
  check(!errors.length, `no page errors (${errors.join(' | ')})`);
  await ctx.close();
}

await opening(false);
if (args.live !== '0') await opening(true);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
