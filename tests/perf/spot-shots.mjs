// Exact old/default cell-path pictures. No pixels, actors, shadows or effects are masked out.
// GAME_URL=http://127.0.0.1:5897/ node tests/perf/spot-shots.mjs --out=.tools/cells/shots
// Optional: --quality=high,low --spots=kawabe,takamori,station,forest --hours=11,21 --warm=120
// First measures frozen-render AND fresh-boot noise. OFF-B is always the fixed reference;
// default must match it exactly. OFF-A diagnostics are never subtracted or used as a pixel mask.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { exploreState } from '../../src/game/fastforward.js';
import { sceneCounts, prepareScenery, watchResources, validateScene } from './support.mjs';
import { deterministicBoot } from './deterministic.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }));
const BASE = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const OUT = path.resolve(args.out || '.tools/cells/shots');
const SPOTS = {
  kawabe: { player: [-36, 30], toward: [-50, 40] },
  takamori: { player: [104, -4], toward: [120, 14] },
  station: { player: [-98, 104], toward: [-60, 140] },
  forest: { player: [73, -152], camera: [79, 20, -138], look: [-20, 8, 60], fov: 60, relativeHeight: true },
};
const spots = (args.spots || 'kawabe,takamori,station,forest').split(',');
const hours = (args.hours || '11,21').split(',').map(Number);
const qualities = (args.quality || 'high').split(',');
const warm = +(args.warm || 120), seed = +(args.seed || 734921);
for (const s of spots) assert(SPOTS[s], `Unknown spot ${s}`);
assert(hours.every(h => Number.isFinite(h) && h >= 0 && h < 24), 'hours must be 0..24');
assert(qualities.every(q => ['low', 'medium', 'high'].includes(q)), 'invalid quality');
assert(Number.isInteger(warm) && warm >= 60, 'warm must be at least 60 fixed steps');
mkdirSync(OUT, { recursive: true });
const SAVE = JSON.stringify({ v: 1, quest: exploreState(), player: { x: -45, y: 4, z: 27, facing: Math.PI }, at: 1760000000000 });
const report = { base: BASE, viewport: [1280, 720], seed, warm, spots: SPOTS, hours, qualities,
  policy: 'All RGBA pixels; zero tolerance against independent OFF-B, zero exclusion masks. OFF-A/OFF-B noise is diagnostic; control cameras, visibility and actor states must match.',
  captures: [], comparisons: [], failures: [], errors: [], sourceRequests: [], failedResources: [] };
const t0 = Date.now(), buffers = new Map();
const log = msg => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

// Cell groups allocate Object3D UUIDs with Math.random. A single RNG stream would move every later
// NPC/particle draw when a group is added. Independent direct-call-site streams isolate those UUID
// calls without removing any actor or pixel. Both paths load the identical JS bundle.
// PNGs are decoded in Chromium's canvas: no new package or lossy image conversion.
async function compare(page, a, b, name, diagnostic = false) {
  const out = await page.evaluate(async ({ a, b }) => {
    const decode = async src => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0); return { c, x, p: x.getImageData(0, 0, c.width, c.height) }; };
    const A = await decode(a), B = await decode(b);
    if (A.c.width !== B.c.width || A.c.height !== B.c.height) throw Error('PNG dimensions differ');
    const { width: w, height: h, data: p } = A.p, q = B.p.data;
    const d = A.x.createImageData(w, h), tiles = new Map(), colors = new Set();
    let changed = 0, maxDelta = 0, totalDelta = 0, minX = w, minY = h, maxX = -1, maxY = -1, opaque = 0;
    for (let i = 0; i < p.length; i += 4) {
      let different = false, delta = 0;
      for (let k = 0; k < 4; k++) { const v = Math.abs(p[i + k] - q[i + k]); different ||= v !== 0; delta = Math.max(delta, v); totalDelta += v; }
      if (colors.size < 4096) colors.add((p[i] << 16) | (p[i + 1] << 8) | p[i + 2]);
      if (p[i + 3] === 255) opaque++;
      if (different) {
        changed++; maxDelta = Math.max(maxDelta, delta);
        const px = (i / 4) % w, py = Math.floor(i / 4 / w), tile = `${Math.floor(px / 16)},${Math.floor(py / 16)}`;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        tiles.set(tile, (tiles.get(tile) || 0) + 1);
        d.data[i] = 255; d.data[i + 1] = Math.max(32, 255 - delta); d.data[i + 2] = 0;
      } else { const v = Math.round((p[i] + p[i + 1] + p[i + 2]) / 12); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
      d.data[i + 3] = 255;
    }
    A.x.putImageData(d, 0, 0);
    return { pixelsDiffer: changed, pixels: w * h, maxChannelDelta: maxDelta, meanChannelDelta: totalDelta / p.length,
      bounds: changed ? [minX, minY, maxX, maxY] : null, changedTiles: [...tiles], colors: colors.size, opaquePixels: opaque, diff: A.c.toDataURL('image/png') };
  }, { a: `data:image/png;base64,${a.toString('base64')}`, b: `data:image/png;base64,${b.toString('base64')}` });
  const { diff, ...row } = out;
  writeFileSync(path.join(OUT, `${name}-diff.png`), Buffer.from(diff.split(',')[1], 'base64'));
  log(`${name}: ${row.pixelsDiffer} of ${row.pixels} pixels differ`);
  assert.equal(row.pixels, 1280 * 720, 'capture must retain full resolution');
  assert(row.colors > 100 && row.opaquePixels === row.pixels, 'capture must contain an opaque rendered valley');
  report.comparisons.push({ name, diagnostic, ...row, passed: row.pixelsDiffer === 0 });
  if (row.pixelsDiffer && !diagnostic) report.failures.push(`${name}: ${row.pixelsDiffer} of ${row.pixels} pixels differ`);
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  for (const quality of qualities) {
    // A second OFF boot is mandatory: motion hidden by identical consecutive renders cannot fake calibration.
    for (const mode of ['off-a', 'off-b', 'default']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
      try {
        await context.addInitScript(deterministicBoot, { seed, save: SAVE });
        const page = await context.newPage();
        watchResources(page, report);
        const url = new URL(BASE);
        for (const [k, v] of Object.entries({ qa: '1', mute: '1', quality, live: '1', pace: 'off', start: 'explore', slot: 'explore', ...(mode.startsWith('off') ? { cells: 'off' } : {}) })) url.searchParams.set(k, v);
        await page.goto(url.href);
        await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__?.teleport && window.__STARLINE__.director?.quest && !window.__STARLINE__.director.busy, null, { timeout: 240000 });
        for (const spot of spots) for (const hour of hours) {
          const id = `${quality}-${spot}-${hour}`, filename = `${id}-${mode}`;
          await page.evaluate(({ spec, hour }) => {
            const g = window.__STARLINE__;
            if (g.renderer.hold || g.renderer.focus || g.interiors?.active || g.paused) throw Error('Capture must draw the actual unpaused valley');
            g.renderer.fixedScale = true; g.renderer.scale = 1; g.renderer.resize();
            g.seasonOverride = 'summer'; g.timeOverride = hour; g.cycleHour = undefined; g.applyLook();
            const [x, z] = spec.player; window.__STARLINE_QA__.teleport(x, z);
            g.follow.fovBase = spec.fov || 55; g.camera.fov = g.follow.fovBase; g.camera.updateProjectionMatrix();
            if (spec.toward) { g.follow.clearCutscene(true); window.__STARLINE_QA__.faceToward(...spec.toward); }
            else {
              const Vec = g.camera.position.constructor, camera = spec.camera.slice();
              if (spec.relativeHeight) camera[1] += g.world.heightAt(x, z);
              g.follow.cutscene({ pos: new Vec(...camera), look: new Vec(...spec.look), fov: spec.fov }, .001);
            }
          }, { spec: SPOTS[spot], hour });
          const readiness = await prepareScenery(page);
          // Yield between fixed steps for asynchronous model/texture work, without advancing simulation time.
          for (let n = 0; n < warm; n += 10) { await page.evaluate(n => window.__spotDriver.step(n), Math.min(10, warm - n)); await page.waitForTimeout(0); }
          const metadata = await page.evaluate(sceneCounts);
          validateScene(metadata, { cells: mode.startsWith('off') ? 'off' : 'default', allowLegacy: args['allow-legacy'] === '1' });
          assert.equal(metadata.hour, hour); assert.equal(metadata.season, 'summer'); assert.equal(metadata.scale, 1);
          assert.deepEqual(metadata.drawingBuffer, [1280, 720]);
          for (const repeat of ['a', 'b']) {
            const png = await page.evaluate(() => { const g = window.__STARLINE__; g.renderer.shadowDirty = true; g.renderer.render(g.scene, g.camera); return g.renderer.renderer.domElement.toDataURL('image/png'); });
            const buffer = Buffer.from(png.split(',')[1], 'base64'), key = `${filename}-${repeat}`;
            buffers.set(key, buffer); writeFileSync(path.join(OUT, `${key}.png`), buffer);
          }
          const dynamics = await page.evaluate(() => {
            const c = window.__STARLINE__.director.wildlife?.critters;
            return (c?.visuals || []).map(v => ({ kind: v.kind, visible: v.root.visible, position: v.root.position.toArray(), quaternion: v.root.quaternion.toArray(), mixer: v.anim?.mixer.time, clip: v.anim?.currentName,
              slot: v.slot && Object.fromEntries(Object.entries(v.slot).filter(([k, x]) => typeof x === 'number' || typeof x === 'string')) }));
          });
          const actors = await page.evaluate(() => {
            const g = window.__STARLINE__, d = g.director;
            return [...Object.values(d.npcs), ...(d.wildlife?.actors || [])].map(n => ({ id: n.id, position: n.pos.toArray(), facing: n.facing, visible: n.root.visible, clip: n.anim?.currentName, mixer: n.anim?.mixer.time, actionTime: n.anim?.current?.time, tick: n.animTick, acc: n.animAcc, every: n.animEvery }));
          });
          report.captures.push({ id, mode, url: url.href, readiness, scene: metadata, dynamics, actors, driver: await page.evaluate(() => window.__spotDriver.state()) });
          await compare(page, buffers.get(`${filename}-a`), buffers.get(`${filename}-b`), `${filename}-frozen-noise`);
          if (mode === 'off-b') {
            const before = report.captures.find(r => r.id === id && r.mode === 'off-a');
            assert.deepEqual(metadata.camera, before.scene.camera, `${id}: control cameras must match`);
            assert.deepEqual(metadata.player, before.scene.player, `${id}: control player must match`);
            assert.deepEqual(metadata.visible, before.scene.visible, `${id}: control visibility must match`);
            assert.deepEqual(actors, before.actors, `${id}: control actor poses must match`);
            assert.deepEqual(dynamics, before.dynamics, `${id}: control critter poses must match`);
            await compare(page, buffers.get(`${id}-off-a-a`), buffers.get(`${filename}-a`), `${id}-fresh-boot-noise`, true);
          }
          if (mode === 'default') {
            const before = report.captures.find(r => r.id === id && r.mode === 'off-a');
            assert.deepEqual(metadata.camera, before.scene.camera, `${id}: exact matched camera`);
            assert.deepEqual(metadata.player, before.scene.player, `${id}: exact matched player`);
            await compare(page, buffers.get(`${id}-off-a-a`), buffers.get(`${filename}-a`), `${id}-off-a-vs-default`, true);
            await compare(page, buffers.get(`${id}-off-b-a`), buffers.get(`${filename}-a`), `${id}-off-vs-default`);
          }
        }
      } finally { await context.close(); }
    }
  }
} catch (e) { report.failures.push(e.stack || String(e)); }
finally {
  report.elapsedSeconds = (Date.now() - t0) / 1000;
  report.passed = !report.failures.length && !report.errors.length && !report.failedResources.length && !report.sourceRequests.length;
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
log(report.passed ? 'All cell pictures match independent OFF-B exactly; OFF-A fresh-boot noise is retained in diagnostics.' : `FAIL: ${report.failures.length} differences, ${report.errors.length} runtime errors, ${report.failedResources.length} failed resources. See results.json and diff PNGs.`);
process.exitCode = report.passed ? 0 : 1;
