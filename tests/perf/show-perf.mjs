// © 2026 Bui Cong Nguyen · solluxlabs.com
// The show effects' cost (docs/SHOW-EFFECTS.md): Sing & Play at a stage, the song from its first chorus, the same camera
// for every arm, the effects switched inside ONE page (the shared machine moves more between page loads than they cost):
//   off   no show effects (not updated, not drawn)          on   the show effects           null  off again (noise floor)
// Each cycle runs the arms in turn (re-seeked to the same song time); per cycle each arm's frame-gap median is paired
// against `off` of the same cycle, and the median of those differences is reported (paired rise), with the draws a frame
// (shadow pass included) and JS a frame. Then the effects' fill: their fragments a screen pixel, depth-tested against
// the scene (what the GPU really shades) and without the depth test (an upper bound), per effect.
// Needs a built preview: npm run build (or vite build + pack-models) && npx vite preview --port 4315 --strictPort
//   GAME_URL=http://127.0.0.1:4315/ node tests/perf/show-perf.mjs [--quality=low] [--cpu=4] [--hour=21.5] [--group=1|4|8]
//     [--runs=24] [--secs=0.8] [--settle=300] [--cam=fixed|orbit] [--stage=station] [--out=file.json]
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const url = process.env.GAME_URL || 'http://127.0.0.1:4315/';
const q = args.quality || 'low', cpu = +(args.cpu || (q === 'low' ? 4 : 1)), runs = +(args.runs || 24), secs = +(args.secs || 0.8), settle = +(args.settle || 300);
const hour = +(args.hour ?? 21.5), group = +(args.group || 1), CAM = args.cam || 'fixed';
const STAGES = { station: { x: -92, z: 101, facing: Math.PI }, kawabe: { x: -45, z: 20, facing: 0 }, shrine: { x: 62.5, z: -149, facing: 0 } };
const stage = STAGES[args.stage || 'station'];
const arms = ['off', 'on', 'null'];
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  const ctx = await browser.newContext(q === 'low' ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(([n, st]) => { localStorage.setItem('starline:singplay:group', String(n)); localStorage.setItem('starline:singplay:v1', JSON.stringify(st)); localStorage.setItem('starline:singplay:showfx', '1'); }, [group, stage]);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${url}?mute&qa=1&quality=${q}&start=singplay&pace=off${group === 8 ? '&troupeMax=8' : ''}`);
  await page.waitForFunction(() => window.__STARLINE__?.singplay?.songs?.length && !window.__STARLINE__.singplay.groupWait, null, { timeout: 240000 });
  await page.evaluate(h => { window.__STARLINE__.timeOverride = h; }, hour);
  await page.waitForTimeout(2500);
  await page.evaluate(([CAM]) => {
    const g = window.__STARLINE__, s = g.singplay, p = g.player;
    g.renderer.governor = null;                                  // (held: the same quality for every arm)
    s.allowed = { ok: true }; s.perform();
    const P = s.perf, L = P.plan.lines; let i = 0; while (L && i < L.count && !L.chorus[i]) i++;
    window.__seek0 = L ? L.t[i] - 1 : 40; P.seek(window.__seek0);
    const c = s.formation ? s.groupCentre() : p.pos, f = p.facing, cam = g.camera, tanH = Math.tan(cam.fov * Math.PI / 360) * cam.aspect;
    const D = Math.max(7.5, ((s.groupW || 1.5) / 2 + 1.2) / tanH + 1);
    window.__orbit0 = performance.now();
    if (CAM === 'orbit') g.cameraOverride = () => { const a = f + Math.sin((performance.now() - window.__orbit0) / 16000 * Math.PI * 2) * 1.1; cam.position.set(c.x + Math.sin(a) * D, p.pos.y + 2.2, c.z + Math.cos(a) * D); cam.lookAt(c.x, p.pos.y + 1.6, c.z); return true; };
    else g.cameraOverride = () => { cam.position.set(c.x + Math.sin(f) * D, p.pos.y + 2.0, c.z + Math.cos(f) * D); cam.lookAt(c.x, p.pos.y + 1.7, c.z); return true; };
    // the switch: off = the effects neither updated nor drawn (their update skipped, the set, the sticks and the fireworks hidden)
    const sh = s.show, own = sh.update.bind(sh), upd = (dt, cam) => { const t = performance.now(); own(dt, cam); window.__sp.fx += performance.now() - t; };
    window.__arm = arm => {
      const on = arm === 'on';
      sh.update = on ? upd : () => {};
      sh.root.visible = on; if (sh.sticks) sh.sticks.visible = on && sh.sticks.count > 0;
      if (!on && sh.fw) { g.fx.fireworks(false); sh.fw = false; }
    };
    const m = window.__sp = { js: [], gaps: [], last: 0, draws: 0, frames: 0, fx: 0 };
    const fr = g.frame.bind(g);
    g.frame = function () { const t = performance.now(); if (m.last) m.gaps.push(t - m.last); m.last = t; fr(); m.js.push(performance.now() - t); m.frames++; };
    const R = g.renderer.renderer, o = R.renderBufferDirect;
    R.renderBufferDirect = function () { m.draws++; return o.apply(this, arguments); };
  }, [CAM]);
  await page.waitForTimeout(3000);   // (the set unfolds, the shaders are in)
  const cdp = await ctx.newCDPSession(page);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.waitForTimeout(1500);
  const cyc = [], rows = {};
  for (let r = 0; r < runs; r++) for (const arm of (r % 2 ? arms.slice().reverse() : arms)) {
    await page.evaluate(([arm, st, at]) => { window.__arm(arm); window.__orbit0 = performance.now() - at; window.__STARLINE__.singplay.perf.seek(window.__seek0 + st); }, [arm, r * 3 % 21, r * 4000 % 16000]);
    await page.waitForTimeout(settle);
    await page.evaluate(() => { const m = window.__sp; m.js = []; m.gaps = []; m.last = 0; m.draws = 0; m.frames = 0; m.fx = 0; });
    await page.waitForTimeout(secs * 1000);
    const x = await page.evaluate(() => { const m = window.__sp; return { gaps: m.gaps, js: m.js, draws: m.draws, frames: m.frames, fx: m.fx }; });
    const R = rows[arm] ||= { gaps: [], js: [], draws: 0, frames: 0, fx: 0 }; R.gaps.push(...x.gaps); R.js.push(...x.js); R.draws += x.draws; R.frames += x.frames; R.fx += x.fx;
    const sg = x.gaps.slice().sort((a, b) => a - b); (cyc[r] ||= {})[arm] = sg[sg.length >> 1];
  }
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const pair = a => { const d = cyc.map(c => c[a] - c.off).filter(Number.isFinite).sort((x, y) => x - y); return +d[d.length >> 1].toFixed(2); };
  const at = (a, p) => { const t = a.slice().sort((x, y) => x - y); return +t[Math.min(t.length - 1, Math.floor(t.length * p))].toFixed(2); };
  const summary = arms.map(a => ({ arm: a, pairedRise: a === 'off' ? 0 : pair(a), p50: at(rows[a].gaps, .5), p95: at(rows[a].gaps, .95), js50: at(rows[a].js, .5), draws: +(rows[a].draws / Math.max(1, rows[a].frames)).toFixed(1), fxMs: +(rows[a].fx / Math.max(1, rows[a].frames)).toFixed(3), frames: rows[a].gaps.length }));
  console.table(summary);
  // the fill: fragments of each effect a screen pixel (depth-tested against the scene, and without depth: upper bound)
  const fill = await page.evaluate(() => {
    const g = window.__STARLINE__, sh = g.singplay.show, R = g.renderer.renderer;
    window.__arm('on'); sh.update(0, g.camera);
    const w = Math.floor(g.renderer.composer.renderTarget1.width), h = Math.floor(g.renderer.composer.renderTarget1.height);
    const RT = g.renderer.composer.renderTarget1.constructor;
    const rt = new RT(w, h, { depthBuffer: true });
    const meshes = { beams: sh.beams, glow: sh.glow, particles: sh.parts, stage: sh.stage };
    const count = m => { const c = m.material.clone(); c.uniforms = m.material.uniforms; c.fragmentShader = 'void main(){ gl_FragColor = vec4(1.0/255.0, 0.0, 0.0, 1.0); }'; c.blending = 2; c.transparent = true; c.depthWrite = false; c.fog = false; return c; };
    const out = {}, px = new Uint8Array(w * h * 4), prevRT = R.getRenderTarget(), prevClear = R.getClearAlpha(), prevAuto = R.autoClear;
    const vis = Object.fromEntries(Object.entries(meshes).map(([k, m]) => [k, m.visible]));
    for (const depth of [true, false]) for (const [k, m] of Object.entries(meshes)) {
      if (!vis[k]) { out[`${k}${depth ? '' : 'Raw'}`] = 0; continue; }
      R.setRenderTarget(rt); R.autoClear = false; R.setClearColor(0x000000, 0); R.clear(true, true, true);
      sh.root.visible = false; if (depth) R.render(g.scene, g.camera);
      R.clear(true, false, false);
      const mat = m.material, c = count(m); c.depthTest = depth; m.material = c;
      sh.root.visible = true; for (const o of Object.values(meshes)) o.visible = o === m;
      R.render(sh.root, g.camera);
      m.material = mat; c.dispose();
      R.readRenderTargetPixels(rt, 0, 0, w, h, px);
      let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i];
      out[`${k}${depth ? '' : 'Raw'}`] = +(sum / (w * h)).toFixed(3);
    }
    for (const [k, m] of Object.entries(meshes)) m.visible = vis[k];
    R.setRenderTarget(prevRT); R.autoClear = prevAuto; R.setClearColor(0x000000, prevClear); rt.dispose();
    return { w, h, ...out, items: sh.items };
  });
  console.log('fill (fragments a pixel):', JSON.stringify(fill));
  const res = { quality: q, cpu, hour, group, cam: CAM, stage: args.stage || 'station', runs, secs, summary, fill, errors };
  if (args.out) fs.writeFileSync(args.out, JSON.stringify(res, null, 1));
  console.log(`on: paired p50 rise ${summary[1].pairedRise} ms (null control ${summary[2].pairedRise} ms), draws ${summary[0].draws} -> ${summary[1].draws}`);
  if (errors.length) console.log('errors', errors.slice(0, 5));
} finally { await browser.close(); }
