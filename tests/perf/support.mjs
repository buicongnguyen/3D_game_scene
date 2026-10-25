// Shared diagnostics only. The function passed to evaluate must remain self-contained.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function sceneCounts() {
  const g = window.__STARLINE__, groups = {}, placeholders = [];
  const total = { objects: 0, renderables: 0, skinned: 0, cells: 0 };
  const visible = { objects: 0, renderables: 0, skinned: 0, cells: 0 };
  const visit = (o, shown, top) => {
    const on = shown && o.visible !== false, drawable = !!(o.isMesh || o.isPoints || o.isLine || o.isSprite);
    const cell = /^cell:/.test(o.name || '');
    total.objects++; if (drawable) total.renderables++; if (o.isSkinnedMesh) total.skinned++; if (cell) total.cells++;
    if (on) {
      if (o.userData?.placeholder) placeholders.push(o.userData.placeholder);
      visible.objects++; if (drawable) visible.renderables++; if (o.isSkinnedMesh) visible.skinned++; if (cell) visible.cells++;
      const row = groups[top] ||= { objects: 0, renderables: 0, skinned: 0, cells: 0 };
      row.objects++; if (drawable) row.renderables++; if (o.isSkinnedMesh) row.skinned++; if (cell) row.cells++;
    }
    for (const c of o.children || []) visit(c, on, o === g.scene ? c.name || c.type : top);
  };
  visit(g.scene, true, '(scene)');
  return { total, visible, byGroup: groups, placeholders, gridEnabled: !!g.structures?.cells,
    entryScript: document.querySelector('script[type="module"][src]')?.src || null,
    cells: g.params?.get('cells') || 'default',
    quality: g.renderer.qualityName, level: g.renderer.appliedLevel || 0, scale: g.renderer.scale,
    drawingBuffer: [g.renderer.renderer.domElement.width, g.renderer.renderer.domElement.height],
    camera: { position: g.camera.position.toArray(), quaternion: g.camera.quaternion.toArray(), fov: g.camera.fov },
    player: g.player.pos.toArray(), hour: g.shownHour(), season: g.shownSeason };
}

export function watchResources(page, report) {
  report.failedResources ||= []; report.sourceRequests ||= []; report.errors ||= [];
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) report.failedResources.push({ url: r.url(), status: r.status() }); });
  page.on('requestfailed', r => { if (!/ERR_ABORTED/.test(r.failure()?.errorText || '')) report.failedResources.push({ url: r.url(), error: r.failure()?.errorText }); });
  page.on('request', r => { if (new URL(r.url()).pathname.includes('/src/')) report.sourceRequests.push(r.url()); });
}

export function validateResources(report) {
  for (const key of ['errors', 'failedResources', 'sourceRequests']) if (!Array.isArray(report[key])) throw Error(`Missing ${key} telemetry`);
  if (report.errors?.length || report.failedResources?.length || report.sourceRequests?.length)
    throw Error(`Invalid production run: errors=${report.errors?.length || 0}, failedResources=${report.failedResources?.length || 0}, sourceRequests=${report.sourceRequests?.length || 0}`);
}

export function validateScene(scene, { cells = 'default', allowLegacy = false } = {}) {
  if (scene.placeholders?.length) throw Error(`Visible placeholders: ${scene.placeholders.join(', ')}`);
  if (cells === 'off') {
    if (scene.total.cells || scene.gridEnabled) throw Error('cells=off did not disable the runtime grid');
  } else if (!allowLegacy && (!scene.total.cells || !scene.gridEnabled)) throw Error('Default runtime grid is absent');
}

export function addSwitches(url, args) {
  const u = new URL(url);
  for (const key of ['cells', 'pace', 'merge', 'zones']) if (args[key] !== undefined) {
    if (!['off', 'on', ...(key === 'pace' ? ['30'] : [])].includes(args[key])) throw Error(`Invalid --${key}=${args[key]}`);
    u.searchParams.set(key, args[key]);
  }
  return u.href;
}

export function writeReport(file, report) {
  if (!file) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log(`JSON report: ${file}`);
}

// Freeze simulation only while lazy scenery/models settle, then use the caller's normal warmup.
// In particular, Hoa must not be born an arbitrary number of measured frames after arriving.
export async function prepareScenery(page) {
  const ready = await page.evaluate(async () => {
    const g = window.__STARLINE__, t = g.director.tricks, wasPaused = g.paused;
    g.paused = true; g.input.releaseAll?.();
    try {
      await Promise.all(t.signs.map(s => t.module(s.t.id)));
      await g.assets.loadLater(['hoa', 'hana']);
      await document.fonts.ready;
      for (let i = 0; i < 4; i++) { t.update(0); await Promise.all(Object.values(t.loading)); await Promise.all([...g.assets.cache.values()]); }
      return { modules: Object.keys(t.mods).length, loadedModels: g.assets.resolved?.size, hoaPresent: !!g.director.npcs.hoa };
    } finally { g.paused = wasPaused; }
  });
  await page.waitForTimeout(250); // Signs debounce their font-atlas refresh by 200 ms.
  return ready;
}
