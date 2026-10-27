import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2] || 'http://127.0.0.1:5175/';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const reports = [];
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}?qa=1&mute=1&view=-45,8,45,-45,2,20&quality=${mobile ? 'low' : 'high'}`);
    await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
    const cases = await page.evaluate(async () => {
      const g = window.__STARLINE__, frame = g.frame.bind(g); g.frame = () => {};
      g.clock.getDelta = () => 1 / 60; g.renderer.track = () => {};
      const gl = g.renderer.renderer.getContext(), reports = [];
      const pixels = () => { const a = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, a); return a; };
      for (const season of ['spring', 'summer', 'autumn', 'winter']) {
        g.setSeason(season);
        g.time.hour = season === 'spring' ? 10 : 22;
        g.fx.burst(g.player.pos, { n: 180, life: 2 });
        g.fx.meteorShower(1);
        g.fx.fireworks(true, g.player.pos, 2);
        g.input.press('up');
        for (let i = 0; i < 90; i++) { g.input.look.x = 1; frame(); }
        g.input.releaseAll();
        // Paddy lights flicker from wall time in onBeforeRender; freeze that cosmetic
        // clock across the three render arms, without removing the light effect.
        const now = performance.now.bind(performance), frozen = now(); performance.now = () => frozen;
        // Stress rebuilt instance lists without changing selection semantics.
        g.foliage.update(g.camera, true);
        g.renderer.render(g.scene, g.camera);
        const cached = pixels(), worlds = new Map();
        g.scene.traverseVisible(o => worlds.set(o, o.matrixWorld.clone()));
        // Authoritative r180 path: compare every visible world matrix, then the rendered image.
        g.scene.updateMatrixWorld(true);
        let matrixErrors = 0;
        for (const [o, m] of worlds) if (!m.equals(o.matrixWorld)) matrixErrors++;
        g.renderer.render(g.scene, g.camera);
        const native = pixels(); let pixelChannels = 0;
        for (let i = 0; i < cached.length; i++) if (cached[i] !== native[i]) pixelChannels++;
        // Same frozen image with all GPU attributes forcibly uploaded in full.
        g.scene.traverse(o => {
          for (const attr of [...Object.values(o.geometry?.attributes || {}), o.instanceMatrix, o.instanceColor]) if (attr) { const a = attr.isInterleavedBufferAttribute ? attr.data : attr; a.clearUpdateRanges(); a.needsUpdate = true; }
        });
        g.renderer.render(g.scene, g.camera);
        const full = pixels(); let uploadPixelChannels = 0;
        for (let i = 0; i < full.length; i++) if (full[i] !== native[i]) uploadPixelChannels++;
        reports.push({ season, visibleMatrices: worlds.size, matrixErrors, pixelChannels, uploadPixelChannels });
        performance.now = now;
      }
      return reports;
    });
    reports.push({ mobile, cases, errors });
    await context.close();
  }
  await mkdir('.tools/performance', { recursive: true });
  await writeFile('.tools/performance/correctness.json', JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
  if (reports.some(r => r.errors.length || r.cases.some(c => c.matrixErrors || c.pixelChannels || c.uploadPixelChannels))) process.exitCode = 1;
} finally { await browser.close(); }
