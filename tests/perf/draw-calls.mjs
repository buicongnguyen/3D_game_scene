// Who makes the draw calls: every renderBufferDirect of 30 frames, per scene group, per object and material, and per
// pass (main view, shadow map, full-screen passes), at a few busy places in Explore (Town Life on).
//   GAME_URL=http://127.0.0.1:5897/ node tests/perf/draw-calls.mjs [--quality=low,high] [--spots=kawabe,takamori,station] [--pass=shadow]
import { chromium } from 'playwright';
import { exploreState } from '../../src/game/fastforward.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const url = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const SPOTS = { kawabe: [-26, 20, -20, 37], takamori: [110, -16, 123, 12], station: [-98, 104, -60, 140], meadow: [-66, 10, -40, 20] };
const spots = (args.spots || 'kawabe,takamori,station').split(',');
const SAVE = JSON.stringify({ v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: 1760000000000 });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
for (const q of (args.quality || 'low,high').split(',')) {
  const ctx = await browser.newContext(q === 'low' ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(s => localStorage.setItem('starline-save-explore', s), SAVE);
  const page = await ctx.newPage();
  await page.goto(`${url}?mute&qa=1&quality=${q}&start=explore&slot=explore`);
  await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__?.teleport, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__STARLINE__; g.seasonOverride = 'summer'; g.timeOverride = 11; g.applyLook(); });
  for (const s of spots) {
    const [x, z, lx, lz] = SPOTS[s];
    await page.evaluate(([x, z, lx, lz]) => { const qa = window.__STARLINE_QA__; qa.teleport(x, z); qa.faceToward(lx, lz); }, [x, z, lx, lz]);
    await page.waitForTimeout(4000);
    const r = await page.evaluate(() => new Promise(done => {
      const g = window.__STARLINE__, R = g.renderer.renderer, orig = R.renderBufferDirect;
      const rows = new Map(), groups = new Map(), pass = { main: 0, shadow: 0, post: 0 };
      let frames = 0, tris = 0;
      R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        const p = material.isMeshDepthMaterial || material.isMeshDistanceMaterial ? 'shadow' : object.isMesh && geometry.attributes.position?.count === 3 && !scene?.isScene ? 'post' : scene && scene !== g.scene ? 'post' : 'main';
        pass[p]++;
        let top = object; while (top.parent && top.parent !== g.scene) top = top.parent;
        const gname = p === 'post' ? '(post-processing)' : (top.name || top.type).replace(/\d+$/, '#');
        groups.set(gname, (groups.get(gname) || 0) + 1);
        const key = `${p.padEnd(6)} ${gname} / ${(object.name || object.type).replace(/\d+/g, '#')} [${material.name || material.type}]${object.isInstancedMesh ? ` x${object.count}` : ''}`;
        rows.set(key, (rows.get(key) || 0) + 1);
        const n = (geometry.index ? geometry.index.count : geometry.attributes.position?.count || 0) / 3;
        tris += n * (object.isInstancedMesh ? object.count : 1);
        return orig.apply(this, arguments);
      };
      const tick = () => { if (++frames < 30) requestAnimationFrame(tick); else { R.renderBufferDirect = orig; done({ pass, tris, frames, fps: g.fps, rows: [...rows].sort((a, b) => b[1] - a[1]), groups: [...groups].sort((a, b) => b[1] - a[1]) }); } };
      requestAnimationFrame(tick);
    }));
    const f = r.frames, per = v => (v / f).toFixed(1);
    console.log(`\n=== ${q} @ ${s}: ${per(r.pass.main + r.pass.shadow + r.pass.post)} calls/frame (main ${per(r.pass.main)}, shadow ${per(r.pass.shadow)}, post ${per(r.pass.post)}), ${Math.round(r.tris / f / 1000)}k tris, fps ${r.fps}`);
    console.log('  by group: ' + r.groups.slice(0, 14).map(([k, v]) => `${k} ${per(v)}`).join(' | '));
    for (const [k, v] of r.rows.filter(([k]) => !args.pass || k.startsWith(args.pass)).slice(0, 22)) console.log(`  ${per(v).padStart(6)}  ${k}`);
  }
  await ctx.close();
}
await browser.close();
