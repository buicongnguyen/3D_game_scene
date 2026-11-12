// People and animals hide their bodies when they are out of the camera's view (src/engine/view.js). Turn the camera
// all the way round at two places, on a phone held upright and on a wide screen, and check after every drawn frame that
// nobody whose body could be on screen is hidden, that some are hidden (or the check proves nothing), and that they
// all come back when the camera faces them.
//   GAME_URL=http://127.0.0.1:5898/ node tests/view-browser.mjs
import { chromium } from 'playwright';
import { exploreState } from '../src/game/fastforward.js';

const url = process.env.GAME_URL || 'http://127.0.0.1:5898/';
const SAVE = JSON.stringify({ v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: 1760000000000 });
const SPOTS = { kawabe: [-26, 20], takamori: [110, -16] };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
let failed = 0;
for (const [label, ctxOpts, q] of [['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, 'low'], ['wide', { viewport: { width: 1280, height: 720 } }, 'medium']]) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(s => localStorage.setItem('starline-save-explore', s), SAVE);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}?mute&qa=1&quality=${q}&start=explore&slot=explore`);
  await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__?.teleport, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__STARLINE__; g.seasonOverride = 'summer'; g.timeOverride = 11; g.applyLook(); });
  for (const [spot, [x, z]] of Object.entries(SPOTS)) {
    await page.evaluate(([x, z]) => window.__STARLINE_QA__.teleport(x, z), [x, z]);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(async ([x, z]) => {
      const g = window.__STARLINE__, qa = window.__STARLINE_QA__, d = qa.director;
      const all = () => [...Object.values(d.npcs), ...(d.wildlife?.actors ?? [])].filter(n => n && n.root?.parent);
      // the six planes of what the camera drew last, as plain numbers (a ball is outside when it is behind any one of them)
      const planes = () => {
        const P = g.camera.projectionMatrix.elements, V = g.camera.matrixWorldInverse.elements, m = new Array(16);
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += P[k * 4 + r] * V[c * 4 + k]; m[c * 4 + r] = s; }
        const row = r => [m[r], m[4 + r], m[8 + r], m[12 + r]];
        const [r0, r1, r2, r3] = [row(0), row(1), row(2), row(3)];
        return [r3.map((v, i) => v + r0[i]), r3.map((v, i) => v - r0[i]), r3.map((v, i) => v + r1[i]), r3.map((v, i) => v - r1[i]), r3.map((v, i) => v + r2[i]), r3.map((v, i) => v - r2[i])]
          .map(p => { const l = Math.hypot(p[0], p[1], p[2]); return p.map(v => v / l); });
      };
      const inView = (P, p, r) => P.every(pl => pl[0] * p.x + pl[1] * (p.y + 1) + pl[2] * p.z + pl[3] >= -r);
      const wait = n => new Promise(res => { let i = 0; const t = () => (++i >= n ? res() : requestAnimationFrame(t)); t(); });
      let wrong = [], hiddenMax = 0, shownAfter = 0, frames = 0, total = 0, hiddenFrames = 0;
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2;
        qa.faceToward(x + Math.sin(a) * 30, z + Math.cos(a) * 30);
        for (let s = 0; s < 6; s++) {                       // sample the swing while the camera is still moving toward it
          await wait(10);
          const P = planes(), list = all(); total = list.length; let hidden = 0;
          for (const n of list) {
            frames++;
            if (n.unseen) { hidden++; if (n.model.visible) wrong.push(`${n.id}: unseen but its body is shown`); if (inView(P, n.pos, 1.6)) wrong.push(`${n.id} hidden at yaw ${k * 15}, ${n.pos.x.toFixed(0)},${n.pos.z.toFixed(0)} although in view`); }
            else if (!n.model.visible && n.visible && !n.far) wrong.push(`${n.id}: body hidden but not marked unseen`);
          }
          hiddenMax = Math.max(hiddenMax, hidden); hiddenFrames += hidden;
        }
      }
      // face the people again: everybody in view is posed (no clock left over)
      const stale = all().filter(n => !n.unseen && !n.far && n.visible && n.animAcc > 0.25 && !n.anim?.busy).map(n => `${n.id} ${n.animAcc.toFixed(2)}`);
      return { wrong: [...new Set(wrong)].slice(0, 8), hiddenMax, hiddenFrames, total, frames, stale: stale.slice(0, 5) };
    }, [x, z]);
    const ok = r.wrong.length === 0 && r.hiddenMax > 0 && r.stale.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} @ ${spot}: ${r.total} watched, up to ${r.hiddenMax} hidden at once (${(r.hiddenFrames / r.frames * 100).toFixed(0)}% of samples), ${r.wrong.length} wrong${r.wrong.length ? ': ' + r.wrong.join('; ') : ''}${r.stale.length ? '; stale clocks ' + r.stale.join(', ') : ''}`);
  }
  if (errors.length) { failed++; console.log(`FAIL ${label}: page errors`, errors.slice(0, 3)); }
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
