// Local-only deterministic work probe; never imported by the game.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const label = process.argv[2] || 'baseline';
const base = process.argv[3] || 'http://127.0.0.1:5175/';
const out = '.tools/performance';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const results = [];
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    await context.addInitScript(() => { let s = 12345; Math.random = () => ((s = Math.imul(s, 1664525) + 1013904223 | 0) >>> 0) / 4294967296; });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}?qa=1&mute=1&view=-45,8,45,-45,2,20&quality=${mobile ? 'low' : 'high'}`);
    await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
    const cdp = await context.newCDPSession(page);
    if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const result = await page.evaluate(async () => {
      const g = window.__STARLINE__, r = g.renderer.renderer;
      const frame = g.frame.bind(g); g.frame = () => {}; // own the clock, no competing RAF simulation
      g.clock.getDelta = () => 1 / 60; g.renderer.track = () => {};
      for (let i = 0; i < 120; i++) frame();
      const stats = {}, originals = [], counts = {};
      const wrap = (obj, key, fn) => { const orig = obj[key]; obj[key] = function (...args) { fn(...args); return orig.apply(this, args); }; originals.push(() => obj[key] = orig); };
      const clear = () => { for (const k of Object.keys(counts)) delete counts[k]; };
      const inc = (k, n = 1) => counts[k] = (counts[k] || 0) + n;
      const gl = r.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      stats.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      stats.canvas = [gl.drawingBufferWidth, gl.drawingBufferHeight];
      const measure = paused => {
        g.paused = paused;
        for (let i = 0; i < 10; i++) frame();
        const work = [];
        for (let i = 0; i < 60; i++) { const t = performance.now(); frame(); work.push(performance.now() - t); }
        work.sort((a,b) => a-b);
        // Work counters in a separate pass: instrumentation must not contaminate timing.
        const matrix = Object.getPrototypeOf(g.scene.matrix);
        wrap(matrix, 'compose', () => inc('compose'));
        wrap(matrix, 'multiplyMatrices', () => inc('multiply'));
        for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) wrap(gl, name, () => inc('draws'));
        wrap(gl, 'bufferSubData', (target, offset, src, start = 0, length) => { inc('uploads'); inc('uploadBytes', (length || src.length - start) * (src.BYTES_PER_ELEMENT || 1)); });
        wrap(gl, 'bufferData', (target, src) => { inc('allocations'); inc('allocatedBytes', typeof src === 'number' ? src : src.byteLength); });
        wrap(r, 'renderBufferDirect', (cam, scene, geo, mat) => inc(mat.isMeshDepthMaterial || mat.isMeshDistanceMaterial ? 'shadowDraws' : 'viewPostDraws'));
        clear(); for (let i = 0; i < 60; i++) frame();
        const result = { cpuMsMedian: work[30], cpuMsP95: work[57], perFrame: Object.fromEntries(Object.entries(counts).map(([k,v]) => [k,v / 60])) };
        while (originals.length) originals.pop()();
        return result;
      };
      stats.moving = measure(false); stats.paused = measure(true);
      const callers = new Map(); g.paused = false;
      wrap(Object.getPrototypeOf(g.scene.matrix), 'multiplyMatrices', () => { const key = new Error().stack.split('\n').slice(3, 6).join('\n'); callers.set(key, (callers.get(key) || 0) + 1); });
      frame(); while (originals.length) originals.pop()();
      stats.matrixCallers = [...callers].sort((a,b) => b[1]-a[1]).slice(0, 6);
      const arrays = new Set(), geometries = new Set(); let nodes = 0, bytes = 0;
      const add = a => { const buffer = a?.array?.buffer; if (buffer && !arrays.has(buffer)) { arrays.add(buffer); bytes += buffer.byteLength; } };
      g.scene.traverse(o => { nodes++; if (o.geometry) { geometries.add(o.geometry); for (const a of Object.values(o.geometry.attributes)) add(a); add(o.geometry.index); } add(o.instanceMatrix); add(o.instanceColor); });
      stats.memory = { sceneNodes: nodes, uniqueSceneGeometries: geometries.size, geometryArrayBytes: bytes, renderer: { ...r.info.memory }, programs: r.info.programs.length, heapUsed: performance.memory?.usedJSHeapSize };
      stats.engine = 'three r180';
      return stats;
    });
    await page.screenshot({ path: `${out}/${label}-${mobile ? 'mobile' : 'desktop'}.png` });
    results.push({ mobile, ...result, errors });
    await context.close();
  }
  await writeFile(`${out}/${label}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
