// Who makes the draw calls: every renderBufferDirect of 30 frames, per scene group, per object and material, and per
// pass (main view, shadow map, full-screen passes), at a few busy places in Explore (Town Life on).
//   GAME_URL=http://127.0.0.1:5897/ node tests/perf/draw-calls.mjs [--quality=low,high] [--spots=kawabe,takamori,station] [--pass=shadow]
// --fixed=1 uses seeded/fixed simulation and frozen draws to compare identical actor poses. No timing/FPS claims.
import { chromium } from 'playwright';
import { exploreState } from '../../src/game/fastforward.js';
import { addSwitches, sceneCounts, writeReport, prepareScenery, watchResources, validateResources, validateScene } from './support.mjs';
import { deterministicBoot } from './deterministic.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const url = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const SPOTS = { kawabe: [-26, 20, -20, 37], takamori: [110, -16, 123, 12], station: [-98, 104, -60, 140], meadow: [-66, 10, -40, 20] };
const spots = (args.spots || 'kawabe,takamori,station').split(',');
const FIXED = args.fixed !== undefined && args.fixed !== '0' && args.fixed !== 'off';
const SAVE = JSON.stringify({ v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: 1760000000000 });
const report = { helperVersion: 2, kind: 'draw-calls', fixed: FIXED, base: url, switches: { cells: args.cells || 'default', pace: args.pace || 'default' }, rows: [], errors: [] };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
for (const q of (args.quality || 'low,high').split(',')) {
  const ctx = await browser.newContext(q === 'low' ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
  if (FIXED) await ctx.addInitScript(deterministicBoot, { seed: +(args.seed || 734921), save: SAVE });
  else await ctx.addInitScript(s => localStorage.setItem('starline-save-explore', s), SAVE);
  const page = await ctx.newPage();
  watchResources(page, report);
  await page.goto(addSwitches(`${url}?mute&qa=1&quality=${q}&start=explore&slot=explore`, args));
  await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__?.teleport, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__STARLINE__; g.seasonOverride = 'summer'; g.timeOverride = 11; g.applyLook(); });
  for (const s of spots) {
    const [x, z, lx, lz] = SPOTS[s];
    await page.evaluate(([x, z, lx, lz]) => { const qa = window.__STARLINE_QA__; qa.teleport(x, z); qa.faceToward(lx, lz); }, [x, z, lx, lz]);
    const readiness = await prepareScenery(page);
    if (FIXED) await page.evaluate(() => { const g = window.__STARLINE__; g.renderer.fixedScale = true; g.renderer.scale = 1; g.renderer.resize(); window.__spotDriver.step(120); });
    else await page.waitForTimeout(4000);
    const r = await page.evaluate(fixed => new Promise(done => {
      const g = window.__STARLINE__, R = g.renderer.renderer, orig = R.renderBufferDirect, world = g.renderer.renderWorld;
      const rows = new Map(), groups = new Map(), pass = { main: 0, shadow: 0, post: 0 };
      let frames = 0, rafFrames = 0, tris = 0, finished = false, raf;
      const finish = timedOut => {
        if (finished) return; finished = true;
        clearTimeout(timer); cancelAnimationFrame(raf);
        R.renderBufferDirect = orig; g.renderer.renderWorld = world;
        done({ pass, tris, frames, rafFrames, timedOut, fps: g.fps, rows: [...rows].sort((a, b) => b[1] - a[1]), groups: [...groups].sort((a, b) => b[1] - a[1]) });
      };
      const timer = setTimeout(() => finish(true), 15000);
      R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        const beforeCalls = R.info.render.calls, beforeTriangles = R.info.render.triangles;
        try { return orig.apply(this, arguments); }
        finally {
        const calls = R.info.render.calls - beforeCalls;
        tris += R.info.render.triangles - beforeTriangles;
        if (calls > 0) {
        const p = material.isMeshDepthMaterial || material.isMeshDistanceMaterial ? 'shadow' : object.isMesh && geometry.attributes.position?.count === 3 && !scene?.isScene ? 'post' : scene && scene !== g.scene ? 'post' : 'main';
        pass[p] += calls;
        let top = object; while (top.parent && top.parent !== g.scene) top = top.parent;
        const gname = p === 'post' ? '(post-processing)' : (top.name || top.type).replace(/\d+$/, '#');
        groups.set(gname, (groups.get(gname) || 0) + calls);
        const key = `${p.padEnd(6)} ${gname} / ${(object.name || object.type).replace(/\d+/g, '#')} [${material.name || material.type}]${object.isInstancedMesh ? ` x${object.count}` : ''}`;
        rows.set(key, (rows.get(key) || 0) + calls);
        }
        }
      };
      g.renderer.renderWorld = function () {
        try { return world.apply(this, arguments); }
        finally { if (++frames === 30) finish(false); }
      };
      const tick = () => { if (!finished) { rafFrames++; raf = requestAnimationFrame(tick); } };
      if (fixed) for (let i = 0; i < 30; i++) g.renderer.renderWorld(g.scene, g.camera);
      else raf = requestAnimationFrame(tick);
    }), FIXED);
    if (r.timedOut || r.frames !== 30) throw Error(`${q}/${s}: only ${r.frames} actual render frames in 15 seconds`);
    const f = r.frames, per = v => (v / f).toFixed(1);
    const scene = await page.evaluate(sceneCounts);
    validateScene(scene, { cells: args.cells, allowLegacy: args['allow-legacy'] === '1' }); validateResources(report);
    report.rows.push({ quality: q, spot: s, readiness, frames: f, rafFrames: r.rafFrames, calls: Object.fromEntries(Object.entries(r.pass).map(([k, v]) => [k, v / f])), callsTotal: (r.pass.main + r.pass.shadow + r.pass.post) / f, triangles: r.tris / f, triangleMethod: 'native renderer.info delta, including drawRange/material groups/instances', fps: FIXED ? null : r.fps, scene, groups: r.groups.map(([name, n]) => ({ name, calls: n / f })), objects: r.rows.map(([name, n]) => ({ name, calls: n / f })) });
    console.log(`  visible objects ${scene.visible.objects}/${scene.total.objects}; renderables ${scene.visible.renderables}; skinned ${scene.visible.skinned}; cells ${scene.visible.cells}/${scene.total.cells}; scale ${scene.scale}, governor ${scene.level}`);
    console.log(`\n=== ${q} @ ${s}: ${per(r.pass.main + r.pass.shadow + r.pass.post)} calls/frame (main ${per(r.pass.main)}, shadow ${per(r.pass.shadow)}, post ${per(r.pass.post)}), ${Math.round(r.tris / f / 1000)}k tris${FIXED ? ', fixed simulation (not an FPS measurement)' : `, fps ${r.fps}`}`);
    console.log('  by group: ' + r.groups.slice(0, 14).map(([k, v]) => `${k} ${per(v)}`).join(' | '));
    for (const [k, v] of r.rows.filter(([k]) => !args.pass || k.startsWith(args.pass)).slice(0, 22)) console.log(`  ${per(v).padStart(6)}  ${k}`);
  }
  await ctx.close();
}
report.passed = true;
} catch (e) { report.passed = false; report.failure = e.stack || String(e); throw e; }
finally {
  await browser.close();
  try { validateResources(report); } catch (e) { report.passed = false; report.failure ||= e.message; }
  writeReport(args.out, report);
}
validateResources(report);
