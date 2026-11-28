// © 2026 Bui Cong Nguyen · solluxlabs.com
// Dance sequences in the browser (docs/SING-AND-PLAY.md "Dance sequences"): a group of 8 on the station square doing
// Breaking (the back row's floor round and the section-end freeze), Popping and Party classics, pictured on PC (1280x720,
// High) and on a phone (390x844, Low), and the frame cost of a sequence style against Mixed on the phone at 4x CPU, in
// ONE page (the styles switched by Stop + Perform, the same song time each phase; a Mixed-vs-Mixed pair as the noise floor).
// Needs a built preview (npm run build, or vite build + scripts/pack-models.mjs + scripts/stamp-sw.mjs):
//   GAME_URL=http://127.0.0.1:4329/ node tests/seq-browser.mjs [--out .tools/seq] [--styles breaking,popping,classics]
//     [--cycles 4] [--secs 4] [--ab breaking] [--skip-shots] [--skip-ab]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1'] : null).filter(Boolean));
const url = process.env.GAME_URL || 'http://127.0.0.1:4329/', OUT = path.resolve(args.out || '.tools/seq'), styles = (args.styles || 'breaking,popping,classics').split(',');
const cycles = +(args.cycles || 4), secs = +(args.secs || 4), AB = args.ab || 'breaking';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const report = { url, shots: [], ab: null, errors: [] };

async function open(device, style) {
  const phone = device === 'phone';
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(style => { localStorage.setItem('starline:singplay:group', '8'); localStorage.setItem('starline:singplay:dancePick', style);
    localStorage.setItem('starline:singplay:v1', JSON.stringify({ x: -91, z: 99.5, facing: Math.PI })); localStorage.setItem('starline:singplay:showfx', '0'); }, style);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${url}?mute&qa=1&quality=${phone ? 'low' : 'high'}&start=singplay&pace=off&troupeMax=8&showfx=off`);
  await page.waitForFunction(() => window.__STARLINE__?.singplay?.songs?.length && !window.__STARLINE__.singplay.groupWait, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}
/** Perform the picked song in `style` (its packs first), the governor held, a fixed camera framing the whole group. */
async function perform(page, style) {
  return page.evaluate(async style => {
    const g = window.__STARLINE__, s = g.singplay, p = g.player;
    g.renderer.governor = null;
    if (s.perf) s.stopSong();
    s.setDance(style);
    await s.loadDances(style);
    s.allowed = { ok: true }; await s.perform();
    for (let i = 0; i < 100 && !s.perf; i++) await new Promise(r => setTimeout(r, 50));
    const P = s.perf; if (!P) return { error: 'no performance' };
    const cam = g.camera, c = s.groupCentre(), f = p.facing, tanH = Math.tan(cam.fov * Math.PI / 360) * cam.aspect, D = Math.max(7, (s.groupW / 2 + .9) / tanH + 1);
    g.cameraOverride = () => { cam.position.set(c.x + Math.sin(f) * D, p.pos.y + 2.1, c.z + Math.cos(f) * D); cam.lookAt(c.x, p.pos.y + .9, c.z - .9 * Math.cos(f)); return true; };
    const B = s.troupe?.plans.back, F = P.plan, beat = P.clock.info.bpm ? 60 / P.clock.info.bpm : .5;
    const at = (Q, pick) => { const b = Q?.blocks.find(pick); return b ? b : null; };
    const floor = at(B, b => b.floor && !b.freeze), freeze = at(B, b => b.freeze), sung = F.blocks.find(b => b.sung && SEQ(b.clip)) || F.blocks.find(b => b.sung);
    function SEQ(c) { return /^Seq/.test(c); }
    const T = b => (b ? P.clock.barTime(b.b0) + (P.clock.barTime(b.b1) - P.clock.barTime(b.b0)) * .55 : null);
    return { style: F.style, bpm: P.clock.info.bpm, members: s.troupe?.count || 1, front: F.blocks.map(b => `${b.b0}:${b.seq?.part || ''}:${b.clip}${b.freeze ? '*' : ''}`),
      back: B?.blocks.map(b => `${b.b0}:${b.seq?.part || ''}:${b.clip}${b.floor ? '_' : ''}${b.freeze ? '*' : ''}`) || null,
      times: { floor: T(floor), freeze: freeze ? P.clock.barTime(freeze.b1) - beat * .45 : null, sung: T(sung), free: T(F.blocks.find(b => !b.sung && SEQ(b.clip))) } };
  }, style);
}
const seek = (page, t) => page.evaluate(t => { const P = window.__STARLINE__.singplay.perf; P.seek(t); }, t);

if (!args['skip-shots']) for (const device of ['pc', 'phone']) {
  const { ctx, page, errors } = await open(device, styles[0]);
  for (const style of styles) {
    const info = await perform(page, style);
    if (info.error) { report.errors.push(`${device} ${style}: ${info.error}`); continue; }
    const want = style === 'breaking' ? ['floor', 'freeze', 'sung'] : ['free', 'sung'];
    for (const k of want) {
      const t = info.times[k]; if (!Number.isFinite(t)) continue;
      await seek(page, t); await page.waitForTimeout(k === 'freeze' ? 250 : 600);
      const file = path.join(OUT, `${device}-${style}-${k}.png`);
      await page.screenshot({ path: file });
      const pose = await page.evaluate(() => { const s = window.__STARLINE__.singplay, P = s.perf; return { t: +P.t.toFixed(2), lead: P.state.dance, back: s.troupe?.back?.dancer ? (() => { const Q = s.troupe.plans.back, bar = P.clock.barAt(P.t); return Q.blocks.find(b => b.b0 <= bar && bar < b.b1)?.clip; })() : null }; });
      report.shots.push({ device, style, at: k, file: path.basename(file), ...pose });
      console.log(device, style, k, JSON.stringify(pose));
    }
    report[`${device}-${style}`] = { bpm: info.bpm, members: info.members, front: info.front, back: info.back };
  }
  report.errors.push(...errors.map(e => `${device}: ${e}`));
  await ctx.close();
}

// the frame cost: Low phone, 4x CPU, one page; per cycle Mixed, the new style, Mixed again (the null pair)
if (!args['skip-ab']) {
  const { ctx, page, errors } = await open('phone', 'mix');
  const cdp = await ctx.newCDPSession(page);
  await page.evaluate(() => {
    const g = window.__STARLINE__, m = window.__ab = { js: [], gaps: [], perf: 0, frames: 0, last: 0 };
    const fr = g.frame.bind(g);
    g.frame = function () { const t = performance.now(); if (m.last) m.gaps.push(t - m.last); m.last = t; fr(); m.js.push(performance.now() - t); m.frames++; };
  });
  const order = ['mix', AB, 'mix'], cyc = [];
  let t0 = null;
  for (let r = 0; r < cycles; r++) for (const [i, style] of order.entries()) {
    const info = await perform(page, style);
    if (info.error) { report.errors.push(`ab ${style}: ${info.error}`); continue; }
    t0 ??= info.times.free ?? info.times.sung ?? 20;
    await page.evaluate(() => { const s = window.__STARLINE__.singplay, P = s.perf, m = window.__ab;
      for (const [o, k] of [[P, 'before'], [P, 'after'], [s.troupe, 'update']]) { if (!o) continue; const f0 = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const x = f0(...a); m.perf += performance.now() - t; return x; }; } });
    await seek(page, t0 + r * 3);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { const m = window.__ab; m.js = []; m.gaps = []; m.perf = 0; m.frames = 0; m.last = 0; });
    await page.waitForTimeout(secs * 1000);
    const x = await page.evaluate(() => { const m = window.__ab, q = (a, p) => { const s = a.slice().sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
      return { frames: m.gaps.length, gap50: q(m.gaps, .5), gap95: q(m.gaps, .95), js50: q(m.js, .5), js95: q(m.js, .95), perfMs: m.perf / Math.max(1, m.frames) }; });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    (cyc[r] ||= [])[i] = { style, ...x };
    console.log('ab', r, style, JSON.stringify(Object.fromEntries(Object.entries(x).map(([k, v]) => [k, +(+v).toFixed(2)]))));
  }
  const med = a => { const s = a.filter(Number.isFinite).sort((u, v) => u - v); return s.length ? +s[Math.floor(s.length / 2)].toFixed(2) : null; };
  const pair = (i, k) => med(cyc.map(c => c[i]?.[k] - c[0]?.[k]));
  report.ab = { device: 'phone 390x844 Low, CPU 4x, group of 8', style: AB, cycles, secs,
    mix: { gap50: med(cyc.map(c => c[0]?.gap50)), js50: med(cyc.map(c => c[0]?.js50)), js95: med(cyc.map(c => c[0]?.js95)), perfMs: med(cyc.map(c => c[0]?.perfMs)) },
    [AB]: { gap50: med(cyc.map(c => c[1]?.gap50)), js50: med(cyc.map(c => c[1]?.js50)), js95: med(cyc.map(c => c[1]?.js95)), perfMs: med(cyc.map(c => c[1]?.perfMs)) },
    rise: { gap50: pair(1, 'gap50'), js50: pair(1, 'js50'), js95: pair(1, 'js95'), perfMs: pair(1, 'perfMs') },
    nullRise: { gap50: pair(2, 'gap50'), js50: pair(2, 'js50'), js95: pair(2, 'js95'), perfMs: pair(2, 'perfMs') }, cyclesRaw: cyc };
  console.log(JSON.stringify({ ...report.ab, cyclesRaw: undefined }));
  report.errors.push(...errors.map(e => `ab: ${e}`));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'browser-check.json'), JSON.stringify(report, null, 1));
console.log(report.errors.length ? `errors: ${report.errors.join(' | ')}` : 'no page errors');
