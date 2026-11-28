// © 2026 Bui Cong Nguyen · solluxlabs.com
// What the render resolution costs on a desktop GPU (docs/RESOLUTION.md): High tier, a busy place, one page per viewport,
// the pixel ratio switched INSIDE that page between arms (the shared machine moves more between page loads than a small
// step costs), every arm in every cycle, the order flipped each cycle. Per arm: frame gap p50 / p95 (uncapped: vsync and
// the frame cap off, so the gap is what the frame really takes) and GPU time p50 / p95 (EXT_disjoint_timer_query_webgl2
// around the whole frame: shadow map, scene, bloom, grade, output). The governor is held (fixedScale) for every arm.
// Arms (each viewport gets the ones that apply): old = the caps before 2026-11-28 (High: at most 2x and 5.0 M pixels),
// native = the screen's own pixels (CSS size x devicePixelRatio), ss1.5 / ss2 = drawn 1.5x / 2x larger than the screen
// (if it fits 8.4 M), s85 / s72 = the governor's steps below native (--scales), null = old again (the noise floor); above
// the screen's own ratio the glow blurs at the screen's size, as in the game. --shots also saves each arm's frame (paused,
// same instant) as a PNG of the drawing buffer into --dir; --ref=3 adds a reference frame drawn 3x larger (not timed).
// Needs a built preview: vite build + pack-models, then vite preview:
//   GAME_URL=http://127.0.0.1:4339/ node tests/perf/resolution-perf.mjs [--scene=kawabe|show] [--views=1920x1080@1,2560x1440@1]
//     [--cycles=8] [--secs=1] [--settle=400] [--arms=old,native,null] [--scales=0.85,0.72] [--shots] [--ref=3] [--dir=.tools/res]
//     [--out=file.json]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { exploreState } from '../../src/game/fastforward.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const url = process.env.GAME_URL || 'http://127.0.0.1:4339/';
const scene = args.scene || 'kawabe', cycles = +(args.cycles || 8), secs = +(args.secs || 1), settle = +(args.settle || 400);
const views = (args.views || '1920x1080@1,2560x1440@1,3840x2160@1,2560x1440@1.5').split(',').map(v => { const [wh, d] = v.split('@'); const [w, h] = wh.split('x').map(Number); return { w, h, dpr: +(d || 1) }; });
const dir = args.dir || '.tools/res';
const OLD = { dpr: 2.0, maxPixels: 5.0e6 }, MAX = 8.4e6;
const capped = (w, h, pr, max) => (w * h * pr * pr > max ? Math.sqrt(max / (w * h)) : pr);
function armsFor({ w, h, dpr }) {
  const a = { old: capped(w, h, Math.min(dpr, OLD.dpr), OLD.maxPixels), native: capped(w, h, dpr, MAX) };
  for (const k of [1.5, 2]) if (w * h * (dpr * k) ** 2 <= MAX * 1.001) a[`ss${k}`] = dpr * k;
  // --scales=0.85,0.72: also the governor's steps below native (arms s85, s72)
  for (const s of (args.scales || '').split(',').filter(Boolean)) a[`s${Math.round(s * 100)}`] = capped(w, h, dpr, MAX) * +s;
  a.null = a.old;
  const want = args.arms ? args.arms.split(',') : Object.keys(a);
  return Object.fromEntries(Object.entries(a).filter(([k]) => want.includes(k)));
}
const SAVE = JSON.stringify({ v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: 1760000000000 });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const out = [];
try {
  for (const v of views) {
    const arms = armsFor(v), names = Object.keys(arms);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr });
    // (Sing & Play: the group of 8 by Hoshi Station, its Time choice at Night, the show effects on)
    if (scene === 'show') await ctx.addInitScript(() => { localStorage.setItem('starline:singplay:group', '8'); localStorage.setItem('starline:singplay:v1', JSON.stringify({ x: -92, z: 101, facing: Math.PI })); localStorage.setItem('starline:singplay:showfx', '1'); localStorage.setItem('starline:singplay:time', 'night'); });
    else await ctx.addInitScript(s => localStorage.setItem('starline-save-explore', s), SAVE);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(scene === 'show' ? `${url}?mute&qa=1&quality=high&start=singplay&pace=off&troupeMax=8&showfx=on` : `${url}?mute&qa=1&quality=high&start=explore&slot=explore&pace=off`);
    if (scene === 'show') {
      await page.waitForFunction(() => window.__STARLINE__?.singplay?.songs?.length && !window.__STARLINE__.singplay.groupWait, null, { timeout: 240000 });
      await page.waitForTimeout(3000);
      await page.evaluate(async () => {
        const g = window.__STARLINE__, s = g.singplay, p = g.player;
        s.allowed = { ok: true }; await s.perform();       // (the song is fetched first)
        if (!s.perf) throw new Error('Perform did not start (no song?)');
        for (let i = 0; i < 600 && (s.troupe?.count || 1) < 8; i++) await new Promise(r => setTimeout(r, 100));
        const P = s.perf, L = P.plan.lines; let i = 0; while (L && i < L.count && !L.chorus[i]) i++;
        window.__seek0 = L ? L.t[i] - 1 : 40;
        // every arm starts back at the first chorus (a song ends within a run: the group would leave mid-measure)
        window.__reseek = k => { if (s.perf === P) P.seek(window.__seek0 + (k * 3) % 21); };
        P.seek(window.__seek0);
        // the whole group of 8 in the picture, the stage's beams behind them (tests/perf/show-perf.mjs's fixed camera)
        const c = s.formation ? s.groupCentre() : p.pos, f = p.facing, cam = g.camera, tanH = Math.tan(cam.fov * Math.PI / 360) * cam.aspect;
        const D = Math.max(7.5, ((s.groupW || 1.5) / 2 + 1.2) / tanH + 1);
        g.cameraOverride = () => { cam.position.set(c.x + Math.sin(f) * D, p.pos.y + 2.0, c.z + Math.cos(f) * D); cam.lookAt(c.x, p.pos.y + 1.7, c.z); return true; };
      });
    } else {
      await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__?.teleport, null, { timeout: 240000 });
      await page.evaluate(() => { const g = window.__STARLINE__, qa = window.__STARLINE_QA__; g.seasonOverride = 'summer'; g.timeOverride = 11; g.weatherOff = true; g.applyLook(); qa.teleport(-26, 20); qa.faceToward(-20, 37); });
    }
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => {
      const g = window.__STARLINE__, r = g.renderer, R = r.renderer, gl = R.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      r.fixedScale = 1; r.scale = 1;                     // (the governor held: the same settings for every arm)
      const m = window.__rp = { arm: '', gaps: [], gpu: [], last: 0, pend: [] };
      const fr = g.frame.bind(g);
      g.frame = function () { const t = performance.now(); if (m.last && m.arm) m.gaps.push(t - m.last); m.last = t; fr(); };
      const wrap = () => {
        const comp = r.composer, own = comp.render.bind(comp);
        comp.render = function (...a) {
          if (!ext || !m.arm) return own(...a);
          const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); own(...a); gl.endQuery(ext.TIME_ELAPSED_EXT); m.pend.push({ q, arm: m.arm });
          while (m.pend.length && gl.getQueryParameter(m.pend[0].q, gl.QUERY_RESULT_AVAILABLE)) {
            const p = m.pend.shift();
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && p.arm === m.arm) m.gpu.push(gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(p.q);
          }
        };
      };
      wrap(); window.__rpWrap = wrap;
      // an arm: that pixel ratio; above the screen's own, the glow blurs at the screen's size as the game does (renderer.js)
      window.__setPr = pr => { const d = devicePixelRatio || 1; r.resize(pr); if (pr > d) r.bloom.setSize(Math.round(innerWidth * d), Math.round(innerHeight * d)); };
      return { timer: !!ext, renderer: R.getContext().getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL), tier: r.qualityName, msaa: r.samples, css: [innerWidth, innerHeight], dpr: devicePixelRatio, group: g.singplay?.troupe?.count, hour: g.timeOverride ?? g.time?.hour };
    });
    console.log(`--- ${v.w}x${v.h}@${v.dpr} ${scene}: ${JSON.stringify(info)} arms ${JSON.stringify(Object.fromEntries(Object.entries(arms).map(([k, p]) => [k, +p.toFixed(3)])))}`);
    const rows = {}, cyc = [];
    for (let c = 0; c < cycles; c++) for (const name of (c % 2 ? names.slice().reverse() : names)) {
      await page.evaluate(([pr, k]) => { window.__rp.arm = ''; window.__setPr(pr); window.__reseek?.(k); }, [arms[name], c]);
      await page.waitForTimeout(settle);
      await page.evaluate(n => { const m = window.__rp; m.gaps = []; m.gpu = []; m.last = 0; m.arm = n; }, name);
      await page.waitForTimeout(secs * 1000);
      const x = await page.evaluate(() => { const m = window.__rp, r = { gaps: m.gaps.slice(), gpu: m.gpu.slice() }; m.arm = ''; return r; });
      const R = rows[name] ||= { gaps: [], gpu: [] }; R.gaps.push(...x.gaps); R.gpu.push(...x.gpu);
      const med = a => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
      (cyc[c] ||= {})[name] = { gap: med(x.gaps), gpu: med(x.gpu) };
    }
    const at = (a, p) => { if (!a.length) return null; const t = a.slice().sort((x, y) => x - y); return +t[Math.min(t.length - 1, Math.floor(t.length * p))].toFixed(2); };
    const pair = (n, k) => { const d = cyc.map(c => c[n]?.[k] - c.old?.[k]).filter(Number.isFinite).sort((p, q) => p - q); return d.length ? +d[d.length >> 1].toFixed(2) : null; };
    const view = `${v.w}x${v.h}@${v.dpr}`;
    const table = names.filter(n => rows[n]).map(n => {
      const pr = arms[n], rw = Math.floor(v.w * pr), rh = Math.floor(v.h * pr);
      return { view, arm: n, pr: +pr.toFixed(3), render: `${rw}x${rh}`, MP: +(rw * rh / 1e6).toFixed(2), pctNative: Math.round(pr / v.dpr * 100), frames: rows[n].gaps.length,
        gap50: at(rows[n].gaps, .5), gap95: at(rows[n].gaps, .95), fps: rows[n].gaps.length ? +(1000 / at(rows[n].gaps, .5)).toFixed(0) : null, gpu50: at(rows[n].gpu, .5), gpu95: at(rows[n].gpu, .95), gpuRise: n === 'old' ? 0 : pair(n, 'gpu') };
    });
    console.table(table);
    out.push(...table);
    if ('shots' in args) {
      fs.mkdirSync(dir, { recursive: true });
      await page.evaluate(() => window.__reseek?.(2));
      await page.waitForTimeout(2500);
      await page.evaluate(() => { const g = window.__STARLINE__; g.paused = true; });
      await page.waitForTimeout(300);
      // --ref=3: also a reference frame drawn 3x larger than the screen (shots only, not timed)
      const shotArms = { ...arms, ...(args.ref ? { ref: v.dpr * +args.ref } : {}) };
      for (const n of Object.keys(shotArms)) {
        if (n === 'null') continue;
        const png = await page.evaluate(pr => {
          const g = window.__STARLINE__, r = g.renderer;
          window.__setPr(pr); for (let i = 0; i < 3; i++) r.renderWorld(g.scene, g.camera);
          return r.renderer.domElement.toDataURL('image/png');
        }, shotArms[n]);
        const f = path.join(dir, `${scene}-${v.w}x${v.h}@${v.dpr}-${n}.png`);
        fs.writeFileSync(f, Buffer.from(png.split(',')[1], 'base64'));
      }
      await page.evaluate(() => { window.__STARLINE__.paused = false; });
    }
    if (errors.length) console.log('page errors', errors.slice(0, 3));
    await ctx.close();
  }
} finally { await browser.close(); }
if (args.out) fs.writeFileSync(args.out, JSON.stringify({ scene, cycles, secs, at: new Date().toISOString(), rows: out }, null, 1));
