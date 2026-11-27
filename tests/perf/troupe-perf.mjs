// The group performance's cost (docs/GROUP-PERFORMANCE.md): Sing & Play at Hoshi Station, Kotone alone vs a group of 4
// vs 8, the same song time (from the first chorus line) and the same fixed camera (8.5 m in front of the formation), so
// only the performers differ. Per run: frame time p50 / p95 (uncapped, ?pace=off, the governor held), JS per frame in
// game.frame, JS in the performers (her performer's before/after + the troupe's pose and faces), draws and triangles
// (shadow pass included), JS heap and GPU geometries / textures.
// Needs a built preview with a song (KOTONE_SONGS, or --song=<path under the served root>):
//   npm run build && (copy a song folder into dist/songs/...) && npx vite preview --port 5982 --strictPort
//   GAME_URL=http://127.0.0.1:5982/ node tests/perf/troupe-perf.mjs [--quality=low] [--cpu=4] [--secs=8] [--runs=2]
//     [--sizes=1,4,8,1n,8u] [--extra=troupeHalf=1&troupeBackFaces=0] [--song=songs/test/ngay-nao-cung-vui] [--cam=fixed|orbit|auto] [--settle=400] [--frame=group]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { analyse, table } from './profile-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const url = process.env.GAME_URL || 'http://127.0.0.1:5982/';
const q = args.quality || 'low', cpu = +(args.cpu || (q === 'low' ? 4 : 1)), secs = +(args.secs || 8), runs = +(args.runs || 2);
const PROFILE = 'profile' in args;
const CAM = args.cam || 'fixed';   // fixed | orbit (the same moving view for every size) | auto (the camera man's own shots: they differ by size)
const sizes = (args.sizes || '1,4,8').split(',').map(v => (/^\d+$/.test(v) ? Number(v) : v)), extra = args.extra ? `&${args.extra}` : '', song = args.song || '';
const AB = 'ab' in args;   // --ab: ONE page with the group of 8, switched between 1 / 4 / 8 every `secs` s for `runs` cycles
// (the shared machine's load moves between page loads by more than the group costs: an A/B inside one page cancels it)
const order = []; if (AB) order.push(8); else for (let r = 0; r < runs; r++) order.push(...(r % 2 ? sizes.slice().reverse() : sizes));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--enable-precise-memory-info', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const out = [];
try {
  for (const n of order) {
    const ctx = await browser.newContext(q === 'low' ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(n => { localStorage.setItem('starline:singplay:group', String(n)); localStorage.setItem('starline:singplay:v1', JSON.stringify({ x: -91, z: 99.5, facing: Math.PI })); }, n);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${url}?mute&qa=1&quality=${q}&start=singplay&pace=off${song ? `&kotoneSong=${encodeURIComponent(song)}` : ''}${extra}`);
    await page.waitForFunction(() => window.__STARLINE__?.singplay?.songs?.length && !window.__STARLINE__.singplay.groupWait, null, { timeout: 240000 });
    await page.waitForTimeout(2500);
    const before = await page.evaluate(() => ({ heap: performance.memory?.usedJSHeapSize || 0, ...window.__STARLINE__.renderer.renderer.info.memory }));
    await page.evaluate(([CAM, AB, FRAME]) => {
      const g = window.__STARLINE__, s = g.singplay, p = g.player;
      g.renderer.governor = null;                                  // (held: the same quality for every run)
      s.allowed = { ok: true }; s.perform();
      const P = s.perf, L = P.plan.lines; let i = 0; while (L && i < L.count && !L.chorus[i]) i++;
      P.seek(window.__seek0 = L ? L.t[i] : 40);
      // one fixed camera for every size: 8.5 m in front of the formation's middle (Kotone's place for a solo)
      const c = s.groupCentre(), f = p.facing, cam = g.camera, k = s.formation || AB ? c : p.pos;
      // (--cam=orbit: the same moving camera for every size, 9 m out, a full turn of the front half every 16 s)
      const t0 = performance.now();
      // --frame=group: back far enough that the whole group of 8 is in the picture (6 m wide + a margin; on a portrait phone
      // 8.5 m shows only the middle four, so the others were culled and cost nothing: the old numbers' view)
      const tanH = Math.tan(cam.fov * Math.PI / 360) * cam.aspect, R0 = FRAME === 'group' ? Math.max(9, (s.groupW / 2 + .9) / tanH + 1) : 0;
      const D = R0 || 8.5, RO = R0 || 9;
      // (--ab: every phase of a cycle starts the orbit at the same point, window.__orbit0, so each size sees the same views)
      if (CAM === 'orbit') g.cameraOverride = () => { const a = f + Math.sin((performance.now() - (window.__orbit0 ?? t0)) / 16000 * Math.PI * 2) * 1.2; cam.position.set(k.x + Math.sin(a) * RO, p.pos.y + 2.4, k.z + Math.cos(a) * RO); cam.lookAt(k.x, p.pos.y + 1, k.z); return true; };
      else if (CAM !== 'auto') g.cameraOverride = () => { cam.position.set(k.x + Math.sin(f) * D, p.pos.y + 2.2, k.z + Math.cos(f) * D); cam.lookAt(k.x, p.pos.y + 1, k.z); return true; };
      // JS in the performers: her performer's before/after (the front row's copy and the back row run inside after) + faces
      const m = window.__tp = { perf: 0, js: [], gaps: [], last: 0, frames: 0 };
      const wrap = (o, k) => { const f0 = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const r = f0(...a); m.perf += performance.now() - t; return r; }; };
      wrap(P, 'before'); wrap(P, 'after'); if (s.troupe) wrap(s.troupe, 'update');
      const fr = g.frame.bind(g);
      g.frame = function () { const t = performance.now(); if (m.last) m.gaps.push(t - m.last); m.last = t; fr(); m.js.push(performance.now() - t); m.frames++; };
    }, [CAM, AB, args.frame || '']);
    await page.waitForTimeout(2000);
    const cdp = await ctx.newCDPSession(page);
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const m = window.__tp; m.js = []; m.gaps = []; m.last = 0; m.perf = 0; m.frames = 0; });
    if (AB) {   // the size switch: hidden members are neither posed nor drawn (their faces off), as if not there
      await page.evaluate(() => {
        const T = window.__STARLINE__.singplay.troupe, R = window.__STARLINE__.renderer.renderer, o = R.renderBufferDirect, m = window.__tp;
        // draws and triangles of every frame of a phase (shadow pass included)
        m.draws = 0; m.tris = 0;
        R.renderBufferDirect = function (c, sc, geo, mat, obj) { m.draws++; m.tris += ((geo.index ? geo.index.count : geo.attributes.position?.count || 0) / 3) * (obj.isInstancedMesh ? obj.count : geo.isInstancedBufferGeometry ? geo.instanceCount : 1); return o.apply(this, arguments); };
        // a phase: 1 | 4 | 8, plus letters: h back row at half rate, f back row faces off, u every member its own mesh
        // (rows not merged: game/perform/row-merge.js); any other letter is a null control (the same as without it)
        window.__size = v => {
          const n = parseInt(v, 10); T.opts.backHalf = /h/.test(v); T.opts.backFaces = !/f/.test(v);
          if (T.setSize) { T.setMerged(!/u/.test(v)); T.setSize(n); return; }
          // (a build from before row merging: the same switch by hand)
          const all = T.__all ||= T.members.slice(), back = T.__back ||= T.back, pose = T.__pose ||= T.lead.onPose;
          for (const e of all) { const on = n === 8 || (n === 4 && e.m.row === 0); e.model.visible = on; if (!on || (!T.opts.backFaces && e.m.row === 1)) e.face?.setEnabled(false); }
          T.members = all.filter(e => e.model.visible); T.back = n === 8 ? back : null; T.lead.onPose = n === 1 ? null : pose;
        };
      });
      const rows = {};
      const cyc = [];   // per cycle: each size's phase median (paired against the first size of the same cycle)
      for (let r = 0; r < runs; r++) for (const n of (r % 2 ? sizes.slice().reverse() : sizes)) {
        // (every phase of a cycle at the same song time too, from the first chorus on: the same dance for each size, and
        // a long run never reaches the song's end, where the group leaves and every size would be a solo)
        await page.evaluate(([n, at, st]) => { window.__size(n); window.__orbit0 = performance.now() - at; window.__STARLINE__.singplay.perf.seek(window.__seek0 + st); }, [n, r * 4000 % 16000, r * 7 % 42]); await page.waitForTimeout(+(args.settle || 400));
        await page.evaluate(() => { const m = window.__tp; m.js = []; m.gaps = []; m.last = 0; m.perf = 0; m.frames = 0; m.draws = 0; m.tris = 0; });
        await page.waitForTimeout(secs * 1000);
        const x = await page.evaluate(() => { const m = window.__tp; return { gaps: m.gaps, js: m.js, perf: m.perf, frames: m.frames, draws: m.draws, tris: m.tris }; });
        const R = rows[n] ||= { gaps: [], js: [], perf: 0, frames: 0, phases: [], draws: 0, tris: 0 }; R.gaps.push(...x.gaps); R.js.push(...x.js); R.perf += x.perf; R.frames += x.frames; R.draws += x.draws; R.tris += x.tris;
        const sg = x.gaps.slice().sort((p, q) => p - q); R.phases.push(sg[Math.floor(sg.length / 2)]);
        (cyc[r] ||= {})[n] = sg[Math.floor(sg.length / 2)];
      }
      // the paired rise: in every cycle, a size's median minus the first size's, then the median of those (load that
      // moves between cycles cancels; a null-control size shows what is left of the noise)
      const pair = n => { const d = cyc.map(c => c[n] - c[sizes[0]]).filter(Number.isFinite).sort((p, q) => p - q); return d.length ? +d[Math.floor(d.length / 2)].toFixed(2) : 0; };
      const at = (a, p) => { const t = a.slice().sort((x, y) => x - y); return +t[Math.min(t.length - 1, Math.floor(t.length * p))].toFixed(2); };
      for (const n of sizes) {
        const d = { draws: +(rows[n].draws / Math.max(1, rows[n].frames)).toFixed(1), tris: Math.round(rows[n].tris / Math.max(1, rows[n].frames)) };   // (mean of every measured frame)
        const RR = rows[n], ph = RR.phases.slice().sort((p, q) => p - q), row = { n, pairedRise: pair(n), phaseMedians: ph.map(v => +v.toFixed(1)), frames: RR.gaps.length, p50: at(RR.gaps, .5), p95: at(RR.gaps, .95), js50: at(RR.js, .5), js95: at(RR.js, .95), performerMs: +(RR.perf / Math.max(1, RR.frames)).toFixed(3), ...d, heapMB: 0, geometries: 0, textures: 0, skinnedDraws: 0 };
        out.push(row); console.log(JSON.stringify(row));
      }
      if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await ctx.close();
      continue;
    }
    // --profile: a CPU profile of the measured seconds (self time by function, ms per frame: profile-lib.mjs)
    if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start'); }
    await page.waitForTimeout(secs * 1000);
    if (PROFILE) { const { profile } = await cdp.send('Profiler.stop'); const fr = await page.evaluate(() => window.__tp.frames); const A = analyse(profile);
      console.log(`--- n=${n}: ${fr} frames`); table(A.self, 22, 'self time by function (ms per frame)', fr, 3); table(A.files, 10, 'self time by file (ms per frame)', fr, 3); }
    const draw = await page.evaluate(() => new Promise(done => {
      const g = window.__STARLINE__, R = g.renderer.renderer, orig = R.renderBufferDirect; let k = 0, draws = 0, tris = 0, people = 0;
      R.renderBufferDirect = function (cam, scene, geometry, material, object) {
        draws++; if (object.isSkinnedMesh) people++;
        tris += ((geometry.index ? geometry.index.count : geometry.attributes.position?.count || 0) / 3) * (object.isInstancedMesh ? object.count : geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1);
        return orig.apply(this, arguments);
      };
      const tick = () => { if (++k < 20) return requestAnimationFrame(tick); R.renderBufferDirect = orig; done({ draws: Math.round(draws / k), tris: Math.round(tris / k), skinnedDraws: Math.round(people / k) }); };
      requestAnimationFrame(tick);
    }));
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const r = await page.evaluate(() => {
      const m = window.__tp, g = window.__STARLINE__, s = [...m.gaps].sort((a, b) => a - b), j = [...m.js].sort((a, b) => a - b), at = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
      return { frames: m.gaps.length, p50: +at(s, .5).toFixed(2), p95: +at(s, .95).toFixed(2), js50: +at(j, .5).toFixed(2), js95: +at(j, .95).toFixed(2), performerMs: +(m.perf / Math.max(1, m.frames)).toFixed(3),
        members: g.singplay.troupe?.count || 1, heap: performance.memory?.usedJSHeapSize || 0, ...g.renderer.renderer.info.memory, level: g.renderer.appliedLevel || 0, scale: g.renderer.scale };
    });
    const row = { n, ...r, ...draw, heapMB: +(r.heap / 1048576).toFixed(1), heapDeltaMB: +((r.heap - before.heap) / 1048576).toFixed(1), geoDelta: r.geometries - before.geometries, texDelta: r.textures - before.textures, errors: errors.length };
    delete row.heap;
    out.push(row);
    console.log(JSON.stringify(row));
    await ctx.close();
  }
} finally { await browser.close(); }
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const summary = sizes.map(n => { const rs = out.filter(r => r.n === n); const o = { n }; for (const k of ['pairedRise', 'p50', 'p95', 'js50', 'performerMs', 'draws', 'tris', 'skinnedDraws', 'heapMB', 'geometries', 'textures']) o[k] = med(rs.map(r => r[k])); return o; });
console.table(summary);
const base = summary.find(s => s.n === 1);
if (base) for (const s of summary) if (s.n !== 1) console.log(`${s.n}: paired p50 rise ${s.pairedRise} ms, p50 +${(s.p50 - base.p50).toFixed(2)} ms, p95 +${(s.p95 - base.p95).toFixed(2)} ms, draws +${s.draws - base.draws}, tris +${s.tris - base.tris}, performer JS +${(s.performerMs - base.performerMs).toFixed(3)} ms`);
if (args.out) fs.writeFileSync(args.out, JSON.stringify({ quality: q, cpu, secs, extra, runs: out, summary }, null, 1));
