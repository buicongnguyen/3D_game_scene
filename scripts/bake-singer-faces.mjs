// Bake the Singer row's faces (Sing & Play, content/troupe.js facePic): every singer's model drawn once, framed on her
// head, 64 px webp (~3 KB) into public/faces/<id>.webp. Run again when a model changes:
//   node scripts/bake-singer-faces.mjs            (its own vite server on port 5311, cache in .tools/vite-faces)
//   FACES_ONLY=night-star node scripts/bake-singer-faces.mjs   (only those singers)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.FACES_PORT) || 5311;
const server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.js'), cacheDir: path.join(ROOT, '.tools/vite-faces'), server: { port: PORT, strictPort: true, hmr: false }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/scripts/bake-singer-faces.html${process.env.FACES_ONLY ? `?only=${encodeURIComponent(process.env.FACES_ONLY)}` : ''}`);
  await page.waitForFunction(() => window.__faces, null, { timeout: 120_000 });
  const faces = await page.evaluate(() => window.__faces);
  const dir = path.join(ROOT, 'public/faces'); fs.mkdirSync(dir, { recursive: true });
  for (const [id, url] of Object.entries(faces)) {
    const buf = Buffer.from(url.split(',')[1], 'base64'); fs.writeFileSync(path.join(dir, `${id}.webp`), buf);
    console.log(`${id}.webp ${buf.length} B`);
  }
} finally { await browser.close(); await server.close(); }
