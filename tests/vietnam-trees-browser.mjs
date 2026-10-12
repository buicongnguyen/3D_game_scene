// Production-compatible acceptance for the remembered tropical scenery option.
// GAME_URL=http://127.0.0.1:5862/ node tests/vietnam-trees-browser.mjs [--only=desktop-medium|phone-low] [--out=.tools/vietnam-trees]
// Browser code imports no source modules. Matched screenshots use the same game camera.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { stateAt } from '../src/game/fastforward.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const base = process.env.GAME_URL;
if (!base) throw new Error('Set GAME_URL to the ready dev or production server.');
const out = path.resolve(args.out || '.tools/vietnam-trees'); fs.mkdirSync(out, { recursive: true });
const configs = [
  { name: 'desktop-medium', quality: 'medium', viewport: { width: 1280, height: 720 } },
  { name: 'phone-low', quality: 'low', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
].filter(c => !args.only || args.only.split(',').includes(c.name));
const MODELS = ['tree-vn-bamboo', 'tree-vn-coconut', 'tree-vn-mango'];
const quest = stateAt('e.done', 'together', 'grandma'); quest.flags.treePlanted = true;
const save = { v: 1, quest, player: { x: -45, y: 3, z: 20, facing: 3.1 }, at: 1760000000000 };
const started = Date.now(), report = { base, cases: [] };
const log = (...v) => console.log(`[${Math.round((Date.now() - started) / 1000)}s]`, ...v);
const themeName = enabled => enabled ? 'tropical' : 'default';

function snapshot() {
  const g = window.__STARLINE__, f = g.foliage;
  const treeSets = f.sets.filter(s => s.model.startsWith('tree-'));
  const meshes = s => [...s.near, ...(s.far || []), ...(s.shadow || [])];
  const protectedRecords = treeSets.flatMap(s => s.records.flatMap((r, i) => r.story || r.orchard ? [{ model: s.model, record: r,
    originalIdentity: g.placed.trees.includes(r), matrix: s.matrices[i].toArray() }] : [])).sort((a, b) => a.record.x - b.record.x || a.record.z - b.record.z);
  const geometries = new Set(), materials = new Set();
  f.group.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) materials.add(m); });
  const star = g.director.starTree, starMeshes = [];
  star?.traverse(o => { if (o.isMesh) starMeshes.push({ id: o.uuid, geometry: o.geometry.uuid, materials: (Array.isArray(o.material) ? o.material : [o.material]).map(m => m.uuid) }); });
  return { language: document.documentElement.lang, theme: f.theme, placed: g.placed.trees, protectedRecords,
    star: star ? { id: star.uuid, position: star.position.toArray(), scale: star.scale.toArray(), meshes: starMeshes } : null,
    groupObjects: f.group.children.length, geometries: geometries.size, materials: materials.size,
    models: treeSets.map(s => ({ model: s.model, records: s.records.length, visibleInstances: s.near.reduce((n, m) => n + (m.visible ? m.count : 0), 0), parts: s.near.length,
      loaded: g.assets.has(s.model), placeholders: meshes(s).filter(m => !m.geometry?.attributes?.position?.count).length })),
    memory: { ...g.renderer.renderer.info.memory }, rendererHeld: !!g.renderer.hold,
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
    const page = await ctx.newPage(), result = { name: cfg.name, checks: [], samples: [], errors: [], sourceRequests: [], modelFailures: [] };
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
      if (enabled) for (const model of MODELS) check(s.models.some(m => m.model === model && m.records > 0 && m.loaded && m.parts > 0 && !m.placeholders), `${model}: genuine loaded instances`);
      else check(!s.models.some(m => m.model.startsWith('tree-vn-')), `${lang}: default trees contain no tropical instances`);
      return s;
    };
    const observeOldTrees = () => {
      const f = window.__STARLINE__.foliage;
      window.__treeSwap = f.sets.filter(s => s.model.startsWith('tree-')).flatMap(s => [...s.near, ...(s.far || []), ...(s.shadow || [])]).map(mesh => {
        const rec = { mesh, disposed: 0 }; mesh.addEventListener('dispose', () => rec.disposed++); return rec;
      });
    };
    const disposedOldTrees = () => window.__treeSwap.map(r => ({ name: r.mesh.name, attached: !!r.mesh.parent, disposed: r.disposed }));
    const optionSwitch = async enabled => {
      check(await page.isChecked('#optTropicalTrees') !== enabled, 'exercise an actual changed checkbox');
      await page.evaluate(observeOldTrees); await hit('#optTropicalTrees');
      const lang = await page.evaluate(() => document.documentElement.lang), s = await ready(lang, enabled), old = await page.evaluate(disposedOldTrees);
      check(old.length > 0 && old.every(r => !r.attached && r.disposed === 1), `${themeName(enabled)}: replaced tree instance buffers disposed exactly once and detached`);
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
    const shot = async (name, camera) => {
      const picture = await page.evaluate(camera => {
        const g = window.__STARLINE__; g.paused = true;
        g.camera.position.fromArray(camera.position); g.camera.fov = camera.fov; g.camera.lookAt(...camera.look); g.camera.updateProjectionMatrix(); g.camera.updateMatrixWorld(true);
        g.foliage.update(g.camera, true); g.foliage.updateShadows(g.player.pos);
        g.renderer.render(g.scene, g.camera);
        return { image: document.getElementById('game').toDataURL('image/png'), position: g.camera.position.toArray(), quaternion: g.camera.quaternion.toArray(), fov: g.camera.fov };
      }, camera);
      fs.writeFileSync(path.join(out, `${cfg.name}-${name}.png`), Buffer.from(picture.image.split(',')[1], 'base64'));
      delete picture.image; return picture;
    };
    const reload = async (lang, enabled) => {
      await page.reload(); await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 }); await ready(lang, enabled);
      if (enabled) check(!await page.evaluate(() => window.__STARLINE__.renderer.hold), `${lang}: remembered tropical title renders live scenery`);
    };
    try {
      await page.goto(`${base.replace(/\/$/, '')}/?qa=1&mute&quality=${cfg.quality}`);
      await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 }); await ready('en', false);
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
      await hit('#settings [data-close]');
      check(!await page.evaluate(() => window.__STARLINE__.renderer.hold), 'enabled tropical title shows actual live foliage');
      await page.screenshot({ path: path.join(out, `${cfg.name}-title-vi.png`) });
      await reload('vi', true); await languageSwitch('en'); await reload('en', true);
      await hit('#btnSettings'); await page.waitForSelector('#settings:not(.hidden)'); await optionSwitch(false);
      await hit('#settings [data-close]'); await languageSwitch('vi'); await reload('vi', false);
      check(true, 'title checkbox choice persists enabled/disabled across English/Vietnamese reloads');
      await page.goto(`${base.replace(/\/$/, '')}/?qa=1&mute&quality=${cfg.quality}&start=continue&slot=1`);
      await page.waitForFunction(() => window.__STARLINE_READY__ && window.__STARLINE_PLAYING__, null, { timeout: 180000 });
      for (let i = 0; i < 60; i++) { const s = await page.evaluate(() => window.__STARLINE_QA__.state()); if (s.dlg) await page.keyboard.press('KeyE'); else if (!s.busy && !s.running) break; await page.waitForTimeout(200); }
      await hit('#btnMenu'); await page.waitForSelector('#pause:not(.hidden)'); await hit('#btnPauseSettings'); await page.waitForSelector('#settings:not(.hidden)');
      const original = await page.evaluate(snapshot); check(original.star !== null && original.protectedRecords.length > 0, 'planted star-tree and protected orchard/story trees are present');
      check(original.protectedRecords.every(p => p.originalIdentity), 'protected records retain the original scatter object identities');
      await optionSwitch(true);
      const candidate = await page.evaluate(() => {
        const f = window.__STARLINE__.foliage;
        return f.sets.filter(s => s.model.startsWith('tree-vn-')).flatMap(s => s.records.map(r => ({ model: s.model, x: r.x, y: r.y, z: r.z, height: Math.max(4, s.height * r.s) })))
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
          assert.deepEqual(s.protectedRecords, original.protectedRecords, 'orchard/story records keep identities, models and instance matrices');
          assert.deepEqual(s.star, original.star, 'the planted reward retains its object/geometry/materials/transforms');
          assert.equal(s.save, original.save, 'scenery changes do not alter the story save');
          const counts = { objects: s.groupObjects, geometry: s.geometries, materials: s.materials, models: s.models.map(m => [m.model, m.records, m.parts]) };
          if (baselines[theme]) assert.deepEqual(counts, baselines[theme], `${theme}: foliage resources return to their exact bounds`); else baselines[theme] = counts;
          check(s.models.filter(m => m.model.startsWith('tree-vn-')).every(m => !m.placeholders), `${theme}/${cycle}: no placeholder geometry`);
          if (enabled) check(s.models.some(m => m.model.startsWith('tree-vn-') && m.visibleInstances > 0), `${cycle}: actual camera renders tropical instances`);
          result.samples.push({ cycle, lang, theme: s.theme, counts, memory: s.memory, camera: pose }); if (cycle >= 1) memory.push(s.memory);
        }
      }
      const warm = memory.slice(0, 2);
      const cap = { geometry: Math.max(...warm.map(m => m.geometries)) + 4, textures: Math.max(...warm.map(m => m.textures)) + 3 };
      check(memory.every(m => m.geometries <= cap.geometry && m.textures <= cap.textures), 'GPU resources plateau after both themes warm up');
      const specimens = await page.evaluate(models => models.map(model => {
        const s = window.__STARLINE__.foliage.sets.find(s => s.model === model);
        const r = [...s.records].sort((a, b) => (a.x + 45) ** 2 + (a.z - 20) ** 2 - ((b.x + 45) ** 2 + (b.z - 20) ** 2))[0];
        return { model, x: r.x, y: r.y, z: r.z, height: Math.max(4, s.height * r.s) };
      }), MODELS);
      for (const tree of specimens) {
        const height = tree.height, distance = Math.max(9, height * 1.7), view = {
          position: [tree.x + distance * .45, tree.y + height * .75, tree.z + distance], look: [tree.x, tree.y + height * .5, tree.z], fov: 54 };
        await page.evaluate(t => { const g = window.__STARLINE__; g.player.teleport(t.x, t.z); g.paused = true; }, tree);
        const on = await shot(`${tree.model}-tropical`, view), s = await page.evaluate(snapshot);
        check(s.models.some(m => m.model === tree.model && m.visibleInstances > 0), `${tree.model}: photographed genuine visible instances`);
        await optionSwitch(false); const off = await shot(`${tree.model}-default`, view);
        assert.deepEqual(on, off, `${tree.model}: matched specimen views have identical cameras`); await optionSwitch(true);
      }
      result.specimens = specimens;
      check(result.modelFailures.length === 0, `no failed model loads: ${result.modelFailures.join(', ')}`);
      assert.deepEqual(result.errors, [], 'no browser runtime errors'); assert.deepEqual(result.sourceRequests, [], 'only built browser modules are requested');
      result.passed = true; log('PASS', cfg.name);
    } catch (e) { result.passed = false; result.error = e.stack || String(e); await page.screenshot({ path: path.join(out, `${cfg.name}-failure.png`) }).catch(() => {}); throw e; }
    finally { await ctx.close(); }
  }
} finally { report.elapsedSeconds = (Date.now() - started) / 1000; fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2)); await browser.close(); }
log(configs.length, 'tropical scenery cases passed');
