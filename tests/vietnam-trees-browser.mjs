// Production-compatible acceptance for the remembered tropical scenery option.
// GAME_URL=http://127.0.0.1:5862/ node tests/vietnam-trees-browser.mjs [--only=desktop-medium|phone-low] [--out=.tools/vietnam-trees]
// Browser code imports no source modules. Matched screenshots use the same game camera.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { stateAt } from '../src/game/fastforward.js';
import { river } from '../src/world/layout.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const base = process.env.GAME_URL;
if (!base) throw new Error('Set GAME_URL to the ready dev or production server.');
const out = path.resolve(args.out || '.tools/vietnam-trees'); fs.mkdirSync(out, { recursive: true });
const configs = [
  { name: 'desktop-medium', quality: 'medium', viewport: { width: 1280, height: 720 } },
  { name: 'phone-low', quality: 'low', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
].filter(c => !args.only || args.only.split(',').includes(c.name));
const TREE_MODELS = ['tree-vn-bamboo', 'tree-vn-coconut', 'tree-vn-mango'];
const BUSH_MODELS = ['bush-vn-fern', 'bush-vn-banana'];
const MODELS = [...TREE_MODELS, ...BUSH_MODELS];
const ATLAS_MODELS = [...MODELS, ...TREE_MODELS.map(model => `${model}-lod`)];
const WIDE_VIEWS = [
  { name: 'title', position: [-70, 34, 192], look: [5, 14, 110], fov: 60 },
  { name: 'village', position: [-92, 25, 66], look: [-42, 9, 18], fov: 60 },
  { name: 'valley', position: [0, 58, 138], look: [0, 12, -35], fov: 60 },
];
const quest = stateAt('e.done', 'together', 'grandma'); quest.flags.treePlanted = true;
const save = { v: 1, quest, player: { x: -45, y: 3, z: 20, facing: 3.1 }, at: 1760000000000 };
const started = Date.now(), report = { base, cases: [] };
const log = (...v) => console.log(`[${Math.round((Date.now() - started) / 1000)}s]`, ...v);
const themeName = enabled => enabled ? 'tropical' : 'default';
const webTrails = [[-44, -92], [-30, -106], [-48, -62], [62, -122], [53, -121], [100, -96], [-50, -140]];
const blossomArc = [river.nearest(1.2, -45.6).s, river.nearest(8, 60).s].sort((a, b) => a - b);
const protectedTree = r => {
  if (r.story || r.orchard) return true;
  if (r.far) return false;
  const inside = (x, z, radius) => Math.hypot(r.x - x, r.z - z) <= radius;
  if (inside(92, -103, 28) || webTrails.some(([x, z]) => inside(x, z, 22))) return true;
  if (['tree-cedar', 'tree-maple'].includes(r.model) && inside(62, -157, 55)) return true;
  if (r.model === 'tree-maple' && inside(61, -121, 26)) return true;
  const bank = r.model === 'tree-sakura' && river.nearest(r.x, r.z, 90);
  return !!bank && bank.s > blossomArc[0] - 12 && bank.s < blossomArc[1] + 12;
};

function snapshot() {
  const g = window.__STARLINE__, f = g.foliage;
  const treeSets = f.treeSets, bushSets = f.bushSets, vegetationSets = [...treeSets, ...bushSets];
  const meshes = s => [...s.near, ...(s.far || []), ...(s.shadow || [])];
  const protectedRecords = treeSets.flatMap(s => s.records.flatMap((r, i) => r.story || r.orchard || window.__protectedTreePositions?.has(`${r.x}:${r.z}`) ? [{ model: s.model, record: r,
    originalIdentity: g.placed.trees.includes(r), matrix: s.matrices[i].toArray() }] : [])).sort((a, b) => a.record.x - b.record.x || a.record.z - b.record.z);
  const geometries = new Set(), materials = new Set();
  f.group.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) materials.add(m); });
  const star = g.director.starTree, starMeshes = [];
  star?.traverse(o => { if (o.isMesh) starMeshes.push({ id: o.uuid, geometry: o.geometry.uuid, materials: (Array.isArray(o.material) ? o.material : [o.material]).map(m => m.uuid) }); });
  const treeRecords = treeSets.flatMap(s => s.records), bushRecords = bushSets.flatMap(s => s.records);
  const ambient = r => !r.story && !r.orchard;
  const ambientTrees = treeRecords.filter(ambient), nearTrees = ambientTrees.filter(r => !r.far);
  const tropicalTrees = ambientTrees.filter(r => r.model.startsWith('tree-vn-'));
  const tropicalBushes = bushRecords.filter(r => r.model.startsWith('bush-vn-'));
  const eligibleBushes = g.placed.bushes.filter(r => !r.story && !r.orchard && ['bush-a', 'bush-b'].includes(r.model));
  const bushTops = bushSets.flatMap(s => s.records.map((r, i) => ({ x: r.x, y: r.y, z: r.z, top: r.y + s.height * s.matrices[i].elements[5] })))
    .sort((a, b) => a.x - b.x || a.z - b.z);
  const perches = Object.values(g.director?.wildlife?.critters?.slots || {}).flatMap(list => list.flatMap(s => s.perches || [])).filter(p => !p.flower);
  const perchKeys = new Set(perches.map(p => `${p.x}:${p.z}`));
  const protectedBushRecords = bushSets.flatMap(s => s.records.flatMap((r, i) => r.model === 'hydrangea' || r.story || r.orchard || perchKeys.has(`${r.x}:${r.z}`) ? [{ model: s.model, record: r,
    originalIdentity: g.placed.bushes.includes(r), matrix: s.matrices[i].toArray(), perch: perchKeys.has(`${r.x}:${r.z}`),
    parts: s.near.map(m => ({ geometry: m.geometry.uuid, material: m.material.uuid })) }] : [])).sort((a, b) => a.record.x - b.record.x || a.record.z - b.record.z);
  const instances = list => Math.max(0, ...(list || []).map(m => m.visible ? m.count : 0));
  return { language: document.documentElement.lang, theme: f.theme, placed: { trees: g.placed.trees, bushes: g.placed.bushes }, protectedRecords,
    bushTops, protectedBushRecords,
    star: star ? { id: star.uuid, position: star.position.toArray(), scale: star.scale.toArray(), meshes: starMeshes } : null,
    groupObjects: f.group.children.length, geometries: geometries.size, materials: materials.size,
    models: vegetationSets.map(s => ({ model: s.model, records: s.records.length, visibleInstances: instances(s.near), parts: s.near.length,
      farInstances: instances(s.far), lodLoaded: g.assets.has(`${s.model}-lod`),
      loaded: g.assets.has(s.model), placeholders: meshes(s).filter(m => !m.geometry?.attributes?.position?.count).length })),
    memory: { ...g.renderer.renderer.info.memory }, rendererHeld: !!g.renderer.hold,
    coverage: { ambientTrees: ambientTrees.length, tropicalTrees: tropicalTrees.length, nearTrees: nearTrees.length, tropicalNearTrees: tropicalTrees.filter(r => !r.far).length,
      bushes: bushRecords.length, tropicalBushes: tropicalBushes.length, eligibleBushes: eligibleBushes.length, protectedPerchedBushes: protectedBushRecords.filter(r => r.perch).length,
      treeRatio: tropicalTrees.length / ambientTrees.length, nearTreeRatio: tropicalTrees.filter(r => !r.far).length / nearTrees.length,
      bushRatio: tropicalBushes.length / bushRecords.length, eligibleBushRatio: tropicalBushes.length / eligibleBushes.length },
    quest: g.director.quest?.save() ?? null, save: localStorage.getItem('starline-save-1'), savedLang: localStorage.getItem('starline-lang'),
    savedTheme: localStorage.getItem('starline-opt-tropicalTrees'), checked: document.getElementById('optTropicalTrees')?.checked,
  };
}

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  for (const cfg of configs) {
    const ctx = await browser.newContext({ viewport: cfg.viewport, hasTouch: !!cfg.hasTouch, isMobile: !!cfg.isMobile, deviceScaleFactor: cfg.deviceScaleFactor || 1, locale: 'en-US' });
    await ctx.addInitScript(save => {
      if (!localStorage.getItem('starline-save-1')) localStorage.setItem('starline-save-1', JSON.stringify(save));
      if (!localStorage.getItem('starline-lang')) localStorage.setItem('starline-lang', 'en');
      localStorage.setItem('starline-story', 'grandma'); localStorage.setItem('starline-last-slot', '1');
    }, save);
    const page = await ctx.newPage(), result = { name: cfg.name, checks: [], samples: [], wideViews: [], errors: [], sourceRequests: [], modelFailures: [] };
    report.cases.push(result); log(cfg.name);
    page.on('pageerror', e => result.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) result.errors.push(m.text()); });
    page.on('request', r => { if (new URL(r.url()).pathname.includes('/src/')) result.sourceRequests.push(r.url()); });
    page.on('response', r => { if (r.status() >= 400 && /\/models\/|\.glb|models\.pack/.test(r.url())) result.modelFailures.push(`${r.status()} ${r.url()}`); });
    const check = (v, name) => { assert.ok(v, `${cfg.name}: ${name}`); result.checks.push(name); };
    const hit = sel => cfg.hasTouch ? page.tap(sel) : page.click(sel);
    const ready = async (lang, enabled) => {
      await page.waitForFunction(({ lang, theme }) => document.documentElement.lang === lang && window.__STARLINE__?.foliage.theme === theme,
        { lang, theme: themeName(enabled) }, { timeout: 30000 });
      const s = await page.evaluate(snapshot);
      check(s.savedLang === lang, `${lang}: actual UI stores the language`);
      check(s.checked === enabled, `${themeName(enabled)}: checkbox reflects scenery`);
      check(s.savedTheme === String(enabled) || (!enabled && s.savedTheme === null), `${themeName(enabled)}: remembered boolean preference`);
      if (enabled) {
        for (const model of MODELS) check(s.models.some(m => m.model === model && m.records > 0 && m.loaded && m.parts > 0 && !m.placeholders), `${model}: genuine loaded instances`);
        check(s.coverage.treeRatio > .9 && s.coverage.nearTreeRatio > .7, 'tropical trees cover over90% of ambient trees and over70% of near ambient trees');
        check(s.coverage.bushRatio > .65 && s.coverage.eligibleBushRatio > .85, 'tropical bushes cover over65% of all bushes and over85% of original bush-a/b records');
        for (const model of TREE_MODELS) check(s.models.find(m => m.model === model)?.lodLoaded, `${model}: genuine loaded tree LOD`);
      } else check(!s.models.some(m => /^(tree|bush)-vn-/.test(m.model)), `${lang}: default vegetation contains no tropical instances`);
      return s;
    };
    const observeOldTrees = () => {
      const f = window.__STARLINE__.foliage;
      window.__treeSwap = [...f.treeSets, ...f.bushSets].flatMap(s => [...s.near, ...(s.far || []), ...(s.shadow || [])]).map(mesh => {
        const rec = { mesh, disposed: 0 }; mesh.addEventListener('dispose', () => rec.disposed++); return rec;
      });
    };
    const disposedOldTrees = () => window.__treeSwap.map(r => ({ name: r.mesh.name, attached: !!r.mesh.parent, disposed: r.disposed }));
    const optionSwitch = async enabled => {
      check(await page.isChecked('#optTropicalTrees') !== enabled, 'exercise an actual changed checkbox');
      await page.evaluate(observeOldTrees); await hit('#optTropicalTrees');
      const lang = await page.evaluate(() => document.documentElement.lang), s = await ready(lang, enabled), old = await page.evaluate(disposedOldTrees);
      check(old.length > 0 && old.every(r => !r.attached && r.disposed === 1), `${themeName(enabled)}: replaced tree/bush instance buffers disposed exactly once and detached`);
      return s;
    };
    const languageSwitch = async (lang, settings = false) => {
      const before = await page.evaluate(snapshot);
      await page.evaluate(() => { window.__languageSets = [...window.__STARLINE__.foliage.sets]; });
      await page.evaluate(observeOldTrees);
      if (settings) await page.selectOption('#optLang', lang); else await hit(`#titleLangs [data-lang=${lang}]`);
      const s = await ready(lang, before.theme === 'tropical'), old = await page.evaluate(disposedOldTrees);
      check(await page.evaluate(() => {
        const current = window.__STARLINE__.foliage.sets;
        return current.length === window.__languageSets.length && current.every((s, i) => s === window.__languageSets[i]);
      }), `${lang}: language preserves every foliage instance set`);
      check(old.length > 0 && old.every(r => r.attached && r.disposed === 0), `${lang}: language neither disposes nor replaces trees`);
      assert.deepEqual(s.models.map(m => [m.model, m.records, m.parts]), before.models.map(m => [m.model, m.records, m.parts]), 'language leaves the selected scenery unchanged');
      return s;
    };
    const shot = async (name, camera, diagnostic = false) => {
      const picture = await page.evaluate(({ camera, diagnostic }) => {
        const g = window.__STARLINE__; g.paused = true;
        g.camera.position.fromArray(camera.position); g.camera.fov = camera.fov; g.camera.lookAt(...camera.look); g.camera.updateProjectionMatrix(); g.camera.updateMatrixWorld(true);
        g.foliage.update(g.camera, true); g.foliage.updateShadows(g.player.pos);
        g.structures.cull(g.camera.position, g.renderer.q); g.grass.update(g.camera.position, g.player.pos);
        const renderer = g.renderer.renderer, samples = [], oldReset = renderer.info.autoReset;
        try {
          // Keep every compositor/shadow pass in these totals. Submission time is CPU/driver time, not GPU timing or FPS.
          for (let i = 0; i < (diagnostic ? 10 : 1); i++) {
            renderer.info.autoReset = false; renderer.info.reset(); const start = performance.now();
            g.renderer.render(g.scene, g.camera);
            if (diagnostic && i >= 3) samples.push({ ...renderer.info.render, cpuSubmitMs: performance.now() - start });
          }
        } finally { renderer.info.autoReset = oldReset; }
        return { image: document.getElementById('game').toDataURL('image/png'), position: g.camera.position.toArray(), quaternion: g.camera.quaternion.toArray(), fov: g.camera.fov,
          metrics: diagnostic ? { samples, scale: g.renderer.scale, drawingBuffer: [renderer.domElement.width, renderer.domElement.height], quality: g.renderer.qualityName } : null };
      }, { camera, diagnostic });
      fs.writeFileSync(path.join(out, `${cfg.name}-${name}.png`), Buffer.from(picture.image.split(',')[1], 'base64'));
      if (diagnostic) result.wideViews.push({ name, metrics: picture.metrics });
      delete picture.image; delete picture.metrics; return picture;
    };
    const widePair = async (view, movePlayer = true) => {
      if (movePlayer) await page.evaluate(v => { const g = window.__STARLINE__; g.player.teleport(v.look[0], v.look[2]); g.paused = true; }, view);
      let cameraPose;
      for (const enabled of [false, true]) {
        await optionSwitch(enabled);
        const pose = await shot(`wide-${view.name}-${themeName(enabled)}`, view, true), s = await page.evaluate(snapshot);
        if (!cameraPose) cameraPose = pose; else assert.deepEqual(pose, cameraPose, `${view.name}: wide original/tropical views have identical cameras`);
        const entry = result.wideViews.at(-1); entry.coverage = s.coverage; entry.memory = s.memory;
        entry.submittedTrees = s.models.filter(m => m.model.startsWith('tree-')).reduce((n, m) => n + m.visibleInstances + m.farInstances, 0);
        entry.submittedTropicalTrees = s.models.filter(m => m.model.startsWith('tree-vn-')).reduce((n, m) => n + m.visibleInstances + m.farInstances, 0);
        entry.submittedBushes = s.models.filter(m => m.model.startsWith('bush-') || m.model === 'hydrangea').reduce((n, m) => n + m.visibleInstances, 0);
        entry.submittedTropicalBushes = s.models.filter(m => m.model.startsWith('bush-vn-')).reduce((n, m) => n + m.visibleInstances, 0);
        if (enabled) check(entry.submittedTropicalTrees > entry.submittedTrees * .5, `${view.name}: majority of submitted tree instances are tropical`);
        // Functional perches can dominate a village view; report actual bush submissions without requiring those plants to change.
        if (enabled && entry.submittedBushes) check(entry.submittedTropicalBushes > 0, `${view.name}: real tropical bushes are submitted in the wide view`);
        check(!s.rendererHeld, `${view.name}: the wide evidence is a real live game render`);
      }
    };
    const reload = async (lang, enabled) => {
      await page.reload(); await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 }); await ready(lang, enabled);
      if (enabled) check(!await page.evaluate(() => window.__STARLINE__.renderer.hold), `${lang}: remembered tropical title renders live scenery`);
    };
    try {
      // This suite compares actual live scenery. The independent video suite protects recorded/live gating.
      await page.goto(`${base.replace(/\/$/, '')}/?qa=1&mute&live=1&quality=${cfg.quality}`);
      await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 }); await ready('en', false);
      const atlas = await page.evaluate(models => {
        const assets = window.__STARLINE__.assets;
        const leaves = models.map(model => ({ model, parts: assets.parts(model).filter(p => p.material.name.startsWith('VN leaves') && p.material.map)
          .map(p => ({ material: p.material.name, texture: p.material.map?.uuid ?? null })) }));
        return { leaves, textures: [...new Set(leaves.flatMap(m => m.parts.map(p => p.texture)))] };
      }, ATLAS_MODELS);
      result.leafAtlas = atlas;
      check(atlas.leaves.every(m => m.parts.length > 0 && m.parts.every(p => p.texture)) && atlas.textures.length === 1,
        'all eight imported assets share one actual Texture for their textured leaf parts');
      await hit('#btnSettings'); await page.waitForSelector('#settings:not(.hidden)'); await optionSwitch(true);
      await page.locator('#optTropicalTrees').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `${cfg.name}-title-settings-en.png`) });
      await languageSwitch('vi', true);
      await page.locator('#optTropicalTrees').scrollIntoViewIfNeeded();
      const label = await page.locator('#optTropicalTrees').evaluate(el => {
        const row = el.parentElement, text = row.querySelector('span'), box = document.querySelector('#settings .book');
        const r = row.getBoundingClientRect(), t = text.getBoundingClientRect(), b = box.getBoundingClientRect();
        return { text: text.textContent, visible: t.width > 0 && t.height > 0 && t.left >= b.left && t.right <= b.right && t.top >= b.top && t.bottom <= b.bottom,
          fits: row.scrollWidth <= row.clientWidth + 1 && t.left >= r.left && t.right <= r.right + 1 };
      });
      check(label.visible && label.fits, 'translated tropical label fits the visible Settings panel'); result.translatedLabel = label;
      await page.screenshot({ path: path.join(out, `${cfg.name}-title-settings-vi.png`) });
      if (cfg.hasTouch) await page.setViewportSize({ width: 844, height: 390 });
      await widePair(WIDE_VIEWS[0], false);
      if (cfg.hasTouch) await page.setViewportSize(cfg.viewport);
      await hit('#settings [data-close]');
      check(!await page.evaluate(() => window.__STARLINE__.renderer.hold), 'enabled tropical title shows actual live foliage');
      await page.screenshot({ path: path.join(out, `${cfg.name}-title-vi.png`) });
      await reload('vi', true); await languageSwitch('en'); await reload('en', true);
      await hit('#btnSettings'); await page.waitForSelector('#settings:not(.hidden)'); await optionSwitch(false);
      await hit('#settings [data-close]'); await languageSwitch('vi'); await reload('vi', false);
      check(true, 'title checkbox choice persists enabled/disabled across English/Vietnamese reloads');
      await page.goto(`${base.replace(/\/$/, '')}/?qa=1&mute&quality=${cfg.quality}&start=continue&slot=1`);
      await page.waitForFunction(() => window.__STARLINE_READY__ && window.__STARLINE_PLAYING__, null, { timeout: 180000 });
      await page.waitForFunction(() => window.__STARLINE__.director.wildlife.critters.slots, null, { timeout: 30000 });
      for (let i = 0; i < 60; i++) { const s = await page.evaluate(() => window.__STARLINE_QA__.state()); if (s.dlg) await page.keyboard.press('KeyE'); else if (!s.busy && !s.running) break; await page.waitForTimeout(200); }
      await hit('#btnMenu'); await page.waitForSelector('#pause:not(.hidden)'); await hit('#btnPauseSettings'); await page.waitForSelector('#settings:not(.hidden)');
      const placement = await page.evaluate(snapshot);
      await page.evaluate(keys => { window.__protectedTreePositions = new Set(keys); }, placement.placed.trees.filter(protectedTree).map(r => `${r.x}:${r.z}`));
      const original = await page.evaluate(snapshot); check(original.star !== null && original.protectedRecords.length > 0, 'planted star-tree and protected orchard/story/wildlife/petal trees are present');
      check(original.protectedRecords.every(p => p.originalIdentity), 'protected records retain the original scatter object identities');
      check(original.protectedBushRecords.some(p => p.perch), 'actual planned insect bush perches are present');
      await optionSwitch(true);
      const candidate = await page.evaluate(() => {
        const f = window.__STARLINE__.foliage;
        return f.sets.filter(s => s.model.startsWith('tree-vn-')).flatMap(s => s.records.map(r => ({ model: s.model, x: r.x, y: r.y, z: r.z, height: Math.max(4, s.height * r.s * (r.sy ?? 1)) })))
          .sort((a, b) => (a.x + 45) ** 2 + (a.z - 20) ** 2 - ((b.x + 45) ** 2 + (b.z - 20) ** 2))[0];
      });
      check(!!candidate, 'decorative tropical viewpoint exists');
      const h = candidate.height, d = Math.max(9, h * 1.7), camera = { position: [candidate.x + d * .45, candidate.y + h * .75, candidate.z + d], look: [candidate.x, candidate.y + h * .5, candidate.z], fov: 54 };
      result.candidate = candidate;
      await page.evaluate(c => { const g = window.__STARLINE__; g.player.teleport(c.x, c.z); g.timeOverride = 12; g.seasonOverride = 'summer'; g.applyLook(); g.paused = true; }, candidate);
      const baselines = {}, memory = [], languages = ['en', 'vi', 'ko', 'ja']; let firstCamera;
      for (let cycle = 0; cycle < 4; cycle++) {
        for (const enabled of [false, true]) {
          await optionSwitch(enabled); const lang = languages[(cycle + Number(enabled)) % languages.length]; await languageSwitch(lang, true);
          const theme = themeName(enabled), pose = await shot(`${theme}-cycle${cycle}`, camera), s = await page.evaluate(snapshot);
          if (!firstCamera) firstCamera = pose; else assert.deepEqual(pose, firstCamera, 'scenery images have identical camera matrices');
          assert.deepEqual(s.placed, original.placed, 'scenery changes leave original scatter records untouched');
          assert.deepEqual(s.protectedRecords, original.protectedRecords, 'orchard/story/wildlife/petal/shrine records keep identities, models and instance matrices');
          assert.deepEqual(s.protectedBushRecords, original.protectedBushRecords, 'hydrangeas and planned insect perch bushes retain original records, matrices, geometry and materials');
          assert.equal(s.bushTops.length, original.bushTops.length, 'the bush placement count is unchanged');
          for (let i = 0; i < s.bushTops.length; i++) {
            assert.deepEqual([s.bushTops[i].x, s.bushTops[i].y, s.bushTops[i].z], [original.bushTops[i].x, original.bushTops[i].y, original.bushTops[i].z], 'bush base stays planted');
            assert.ok(Math.abs(s.bushTops[i].top - original.bushTops[i].top) < .00001, 'actual instance matrices preserve the original critter-perch height');
          }
          assert.deepEqual(s.star, original.star, 'the planted reward retains its object/geometry/materials/transforms');
          assert.equal(s.save, original.save, 'scenery changes do not alter the story save');
          const counts = { objects: s.groupObjects, geometry: s.geometries, materials: s.materials, models: s.models.map(m => [m.model, m.records, m.parts]) };
          if (baselines[theme]) assert.deepEqual(counts, baselines[theme], `${theme}: foliage resources return to their exact bounds`); else baselines[theme] = counts;
          check(s.models.filter(m => /^(tree|bush)-vn-/.test(m.model)).every(m => !m.placeholders), `${theme}/${cycle}: no placeholder geometry`);
          if (enabled) check(s.models.some(m => m.model.startsWith('tree-vn-') && m.visibleInstances > 0), `${cycle}: actual camera renders tropical instances`);
          result.samples.push({ cycle, lang, theme: s.theme, counts, coverage: s.coverage, memory: s.memory, camera: pose }); if (cycle >= 1) memory.push(s.memory);
        }
      }
      const warm = memory.slice(0, 2);
      const cap = { geometry: Math.max(...warm.map(m => m.geometries)) + 4, textures: Math.max(...warm.map(m => m.textures)) + 3 };
      check(memory.every(m => m.geometries <= cap.geometry && m.textures <= cap.textures), 'GPU resources plateau after both themes warm up');
      const specimens = await page.evaluate(models => models.map(model => {
        const s = window.__STARLINE__.foliage.sets.find(s => s.model === model);
        const r = [...s.records].sort((a, b) => (a.x + 45) ** 2 + (a.z - 20) ** 2 - ((b.x + 45) ** 2 + (b.z - 20) ** 2))[0];
        return { model, x: r.x, y: r.y, z: r.z, height: Math.max(.7, s.height * r.s * (r.sy ?? 1)) };
      }), MODELS);
      for (const tree of specimens) {
        const bush = tree.model.startsWith('bush-'), height = tree.height, distance = Math.max(bush ? 2.2 : 9, height * 1.7), view = {
          position: [tree.x + distance * .45, tree.y + height * .75, tree.z + distance], look: [tree.x, tree.y + height * .5, tree.z], fov: 54 };
        await page.evaluate(({ t, bush }) => { const g = window.__STARLINE__; g.player.teleport(t.x + (bush ? 3 : 0), t.z); g.paused = true; }, { t: tree, bush });
        const on = await shot(`${tree.model}-tropical`, view), s = await page.evaluate(snapshot);
        check(s.models.some(m => m.model === tree.model && m.visibleInstances > 0), `${tree.model}: photographed genuine visible instances`);
        await optionSwitch(false); const off = await shot(`${tree.model}-default`, view);
        assert.deepEqual(on, off, `${tree.model}: matched specimen views have identical cameras`); await optionSwitch(true);
      }
      result.specimens = specimens;
      const perchBush = await page.evaluate(() => {
        const g = window.__STARLINE__, perches = Object.values(g.director.wildlife.critters.slots).flatMap(list => list.flatMap(s => s.perches || [])).filter(p => !p.flower);
        const records = g.foliage.bushSets.flatMap(s => s.records.filter(r => ['bush-a', 'bush-b'].includes(r.model) && perches.some(p => p.x === r.x && p.z === r.z))
          .map(r => ({ model: r.model, x: r.x, y: r.y, z: r.z, height: s.height * r.s * (r.sy ?? 1) })));
        return records.sort((a, b) => (a.x + 45) ** 2 + (a.z - 20) ** 2 - ((b.x + 45) ** 2 + (b.z - 20) ** 2))[0];
      });
      check(!!perchBush, 'a real protected bush-a/b perch is available for matched visual evidence');
      const ph = perchBush.height, pd = Math.max(2.2, ph * 1.7), perchView = {
        position: [perchBush.x + pd * .45, perchBush.y + ph * .75, perchBush.z + pd], look: [perchBush.x, perchBush.y + ph * .5, perchBush.z], fov: 54 };
      await page.evaluate(t => { const g = window.__STARLINE__; g.player.teleport(t.x + 3, t.z); g.paused = true; }, perchBush);
      const perchOn = await shot('protected-perch-tropical', perchView); await optionSwitch(false);
      const perchOff = await shot('protected-perch-default', perchView); assert.deepEqual(perchOn, perchOff, 'protected perch views share identical cameras');
      await optionSwitch(true); result.perchBush = perchBush;
      if (cfg.hasTouch) await page.setViewportSize({ width: 844, height: 390 });
      for (const view of WIDE_VIEWS.slice(1)) await widePair(view);
      check(result.modelFailures.length === 0, `no failed model loads: ${result.modelFailures.join(', ')}`);
      assert.deepEqual(result.errors, [], 'no browser runtime errors'); assert.deepEqual(result.sourceRequests, [], 'only built browser modules are requested');
      result.passed = true; log('PASS', cfg.name);
    } catch (e) { result.passed = false; result.error = e.stack || String(e); await page.screenshot({ path: path.join(out, `${cfg.name}-failure.png`) }).catch(() => {}); throw e; }
    finally { await ctx.close(); }
  }
} finally { report.elapsedSeconds = (Date.now() - started) / 1000; fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2)); await browser.close(); }
log(configs.length, 'tropical scenery cases passed');
