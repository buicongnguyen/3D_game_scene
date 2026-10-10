// Records the phone videos (docs/VIDEO.md): the five scene tours, the new-game arrival and the title loop, each as a
// landscape and a portrait cut, from the real game on the desktop High tier.
//
//   node scripts/record-videos.mjs                      everything (about half an hour)
//   node scripts/record-videos.mjs --only=tour-spring   one clip (both cuts);  --only=tour-spring-tall  one file
//   options: --cuts=wide,tall  --kbps=650 (or --crf=LOW|MEDIUM|VERYLOW)  --keep=1 (keep the frame folders)  --encode=0 (frames only)
//            --frames=1 (re-encode from kept frames, no browser)
//
// How it works
//   • Playwright opens the game in headless Chromium on the real GPU and takes over the page's clock (page.clock):
//     every timer, requestAnimationFrame and performance.now() runs on a virtual clock that this script advances by
//     exactly 1/30 s per video frame. The game is not told it is being filmed: the tour, the arrival cutscene, the
//     train, the water and the weather all simply run at a perfectly steady 30 fps, however long a frame takes.
//   • After each step the WebGL canvas (rendered 1.5x oversize for clean edges) is copied to a 2D canvas at the
//     video size and saved as a JPEG. Only the canvas is filmed: captions, toolbar and fades are HTML and stay live.
//   • Each tour is flown once quickly first, so everything it loads on demand is there before the take.
//   • Blender (headless, its bundled FFmpeg/libx264) turns each frame folder into an H.264 MP4 (yuv420p); this
//     script then moves the index to the front of the file (fast start) and writes public/video/manifest.json with
//     each clip's duration and, for tours, the time of every stop, so playback can never drift from the picture.
// Needs: Playwright (node_modules), a GPU browser, and Blender 4.x (BLENDER=path, or the path below).
import { createRequire } from 'module';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { TOURS, timeline, stopTime } from '../src/content/tour.js';
import { CLIPS, CUTS, FPS, clipFile, TITLE_LOOP } from '../src/content/video.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const OUT = path.join(ROOT, 'public/video');
const WORK = path.join(ROOT, '.tools/video-frames');
const BLENDER = process.env.BLENDER || 'C:/Users/n/source/repos/Petal_cafe/.tools/blender-4.5.9-windows-x64/blender.exe';
const CRF = args.crf || 'LOW';      // used only when a clip has no bitrate of its own (content/video.js) and --kbps is not given
const SS = 1.5;                       // the canvas is rendered this much larger than the video and scaled down
const BLEND = 1.5;                    // seconds of the title loop's end that dissolve into its beginning
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(ROOT, 'node_modules/playwright'));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);

const cuts = (args.cuts || Object.keys(CUTS).join()).split(',');
const want = [];
for (const c of CLIPS) for (const cut of cuts) {
  const name = `${c.id}-${cut}`;
  if (!args.only || args.only.split(',').some(o => o === c.id || o === name)) want.push({ ...c, cut, name });
}
if (!want.length) { console.error(`nothing matches --only=${args.only}; clips: ${CLIPS.map(c => c.id).join(', ')}`); process.exit(2); }

// ---------------------------------------------------------------- the game
let server = null, url = process.env.GAME_URL;
async function serve() {
  if (url) return;
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', '5831', '--strictPort'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, NO_HMR: '1' } });
  url = 'http://127.0.0.1:5831/';
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 60000);
    const seen = d => { if (/ready|Local/.test(String(d))) { clearTimeout(t); res(); } };
    server.stdout.on('data', seen); server.stderr.on('data', seen);
    server.on('exit', code => rej(new Error(`vite exited ${code}`)));
  });
}

/** Open the game for one take: High tier, fixed resolution, a capture hook on the renderer. */
async function open(browser, clip, query) {
  const { w, h } = CUTS[clip.cut];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: SS });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('  PAGEERROR', e.message));
  await page.clock.install();
  await page.goto(`${url}?mute&quality=high&${query}`);
  await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 300000 });
  await page.evaluate(([w, h]) => {
    const g = window.__STARLINE__, R = g.renderer;
    R.fixedScale = 1; R.scale = 1; R.resize();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    const render = R.render.bind(R);
    window.__cap = { want: false, out: null, n: 0 };
    R.render = (scene, camera) => {
      render(scene, camera);
      window.__cap.n++;
      if (!window.__cap.want) return;
      window.__cap.want = false;
      x.drawImage(R.renderer.domElement, 0, 0, w, h);
      window.__cap.out = c.toDataURL('image/jpeg', 0.95);
    };
  }, [w, h]);
  return { ctx, page };
}

/** Advance the page by one video frame and return its picture (base64 JPEG). */
async function frame(page) {
  await page.evaluate(() => { window.__cap.want = true; window.__cap.out = null; });
  await page.clock.runFor(1000 / FPS);
  const out = await page.evaluate(() => window.__cap.out);
  if (!out) throw new Error('no frame was rendered in this step');
  return Buffer.from(out.slice(out.indexOf(',') + 1), 'base64');
}
const run = (page, secs) => page.clock.runFor(secs * 1000);

async function take(page, dir, count, each) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    const stop = await each?.(i);
    if (stop) return i;
    // a step that never comes back (a lost GPU context, a stuck page) must not hang the whole run
    let timer;
    const pic = await Promise.race([frame(page), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`frame ${i + 1} did not arrive within 90 s`)), 90000); })]);
    clearTimeout(timer);
    fs.writeFileSync(path.join(dir, `f${String(i + 1).padStart(5, '0')}.jpg`), pic);
    if (i % 300 === 299) log(`    ${i + 1} / ${count} frames`);
  }
  return count;
}

// ---------------------------------------------------------------- the three kinds of clip
async function recordTour(browser, clip, dir) {
  const tour = TOURS.find(t => t.id === clip.tour), tl = timeline(tour);
  const { ctx, page } = await open(browser, clip, 'record=tour');
  await page.waitForTimeout(1500);
  await page.evaluate(async id => {
    const g = window.__STARLINE__, m = await import('/src/game/tour.js');
    m.openTour(g).start(id, { live: true });
    document.getElementById('tourView').style.display = 'none';
  }, tour.id);
  // a quick first pass: every stop is visited so that whatever loads on demand (ambient places, festival dressing) is in
  for (let i = 0; i < tour.stops.length; i++) {
    await page.evaluate(i => { const t = window.__STARLINE__.tour; t.paused = true; t.goStop(i); t.paused = true; }, i);
    await page.waitForTimeout(700);
  }
  await page.waitForLoadState('networkidle');
  await page.clock.pauseAt(Date.now() + 3600e3);
  // back to the start; three seconds for the season, the light and the detail to settle, then the take
  await page.evaluate(() => { const t = window.__STARLINE__.tour; t.setTour(0); t.paused = true; });
  await run(page, 3);
  await page.evaluate(() => { window.__STARLINE__.tour.paused = false; });
  const count = Math.round(tl.length * FPS);
  await take(page, dir, count);
  const end = await page.evaluate(() => window.__STARLINE__.tour.debug());
  if (Math.abs(end.t - tl.length) > 0.2) throw new Error(`${clip.name}: the take ended at ${end.t.toFixed(2)} s of ${tl.length.toFixed(2)} s`);
  await ctx.close();
  return {
    frames: count, duration: count / FPS, tour: tour.id,
    stops: tour.stops.map((s, i) => ({ place: s.place, t: +stopTime(tl, i).toFixed(3), from: +(i ? tl.segs.find(x => x.kind === 'travel' && x.i === i).t0 : 0).toFixed(3) })),
    poster: Math.round((stopTime(tl, 0) + 2.5) * FPS),
  };
}

async function recordIntro(browser, clip, dir) {
  const { ctx, page } = await open(browser, clip, `record=intro&start=new&story=${clip.story}`);
  await page.clock.pauseAt(Date.now() + 3600e3);
  // the chapter card, then the arrival begins
  for (let i = 0; i < 600; i++) { await run(page, 0.1); if (await page.evaluate(() => window.__STARLINE__.director?.scenes?.active === 'arrival' && window.__STARLINE__.director.scenes.arrivalT !== undefined)) break; }
  const marks = {};
  const count = await take(page, dir, 60 * FPS, async i => {
    const s = await page.evaluate(() => { const sc = window.__STARLINE__.director.scenes; return { on: sc.active === 'arrival', marks: sc.arrivalMarks || {} }; });
    for (const [k, v] of Object.entries(s.marks)) marks[k] ??= +(v).toFixed(2);
    return !s.on && i > 30;
  });
  await ctx.close();
  return { frames: count, duration: count / FPS, story: clip.story, marks, poster: Math.round(4 * FPS) };
}

async function recordTitle(browser, clip, dir) {
  const { ctx, page } = await open(browser, clip, 'record=title');
  await page.waitForTimeout(1000);
  await page.clock.pauseAt(Date.now() + 3600e3);
  // the same vantage as the live title, on a short closed path so the last frame meets the first
  await page.evaluate(async ([T]) => {
    const g = window.__STARLINE__;
    const pos = g.camera.position.clone(), look = g.follow.look.clone();
    let t = 0;
    g.beforeUpdate = dt => {
      t += dt;
      const a = (t / T) * Math.PI * 2;
      pos.set(-70 + Math.sin(a) * 2.2, 34 + Math.sin(a * 2) * 0.25, 180 + Math.cos(a) * 1.4);
      look.set(5 + Math.sin(a) * 0.8, 14, 110);
      g.follow.cutscene({ pos, look }, 0.001);
    };
  }, [TITLE_LOOP]);
  await run(page, 3);
  const loop = Math.round(TITLE_LOOP * FPS), extra = Math.round(BLEND * FPS);
  await take(page, dir, loop + extra);
  // the seam: the first frames are dissolved in from the frames that follow the loop's end
  const { w, h } = CUTS[clip.cut];
  for (let i = 0; i < extra; i++) {
    const a = fs.readFileSync(path.join(dir, `f${String(loop + i + 1).padStart(5, '0')}.jpg`)).toString('base64');
    const b = fs.readFileSync(path.join(dir, `f${String(i + 1).padStart(5, '0')}.jpg`)).toString('base64');
    const out = await page.evaluate(async ([a, b, k, w, h]) => {
      const img = s => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = `data:image/jpeg;base64,${s}`; });
      const [A, B] = await Promise.all([img(a), img(b)]);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.drawImage(A, 0, 0); x.globalAlpha = k; x.drawImage(B, 0, 0);
      return c.toDataURL('image/jpeg', 0.95);
    }, [a, b, (i + 0.5) / extra, w, h]);
    fs.writeFileSync(path.join(dir, `f${String(i + 1).padStart(5, '0')}.jpg`), Buffer.from(out.slice(out.indexOf(',') + 1), 'base64'));
  }
  for (let i = 0; i < extra; i++) fs.rmSync(path.join(dir, `f${String(loop + i + 1).padStart(5, '0')}.jpg`));
  await ctx.close();
  return { frames: loop, duration: loop / FPS, loop: true, poster: 1 };
}

// ---------------------------------------------------------------- encoding
const BLENDER_PY = `
import bpy, sys, os
a = sys.argv[sys.argv.index('--') + 1:]
src, out, fps, w, h, crf, gop = a[0], a[1], int(a[2]), int(a[3]), int(a[4]), a[5], int(a[6])
s = bpy.context.scene
s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = w, h, 100
s.render.fps, s.render.fps_base = fps, 1
s.view_settings.view_transform = 'Standard'
s.view_settings.look = 'None'
s.display_settings.display_device = 'sRGB'
s.sequencer_colorspace_settings.name = 'sRGB'
ed = s.sequence_editor_create()
strips = ed.strips if hasattr(ed, 'strips') else ed.sequences
files = sorted(f for f in os.listdir(src) if f.endswith('.jpg'))
st = strips.new_image('take', os.path.join(src, files[0]), 1, 1)
for f in files[1:]:
    st.elements.append(f)
s.frame_start, s.frame_end = 1, len(files)
r = s.render
r.use_sequencer = True
r.image_settings.file_format = 'FFMPEG'
r.ffmpeg.format = 'MPEG4'
r.ffmpeg.codec = 'H264'
if crf.isdigit():
    r.ffmpeg.constant_rate_factor = 'NONE'
    r.ffmpeg.video_bitrate = int(crf)
    r.ffmpeg.minrate = 0
    r.ffmpeg.maxrate = int(crf) * 2
    r.ffmpeg.buffersize = int(crf) * 4
else:
    r.ffmpeg.constant_rate_factor = crf
r.ffmpeg.ffmpeg_preset = 'BEST'
r.ffmpeg.gopsize = gop
r.ffmpeg.max_b_frames = 2
r.ffmpeg.audio_codec = 'NONE'
r.use_file_extension = False
r.filepath = out
bpy.ops.render.render(animation=True)
print('ENCODED', len(files))
`;

/** Put the moov box before mdat and shift the chunk offsets, so the video starts before it has fully downloaded. */
export function faststart(buf) {
  const boxes = [];
  for (let p = 0; p < buf.length;) {
    let size = buf.readUInt32BE(p); const type = buf.toString('latin1', p + 4, p + 8);
    if (size === 1) size = Number(buf.readBigUInt64BE(p + 8)); else if (size === 0) size = buf.length - p;
    boxes.push({ type, p, size });
    p += size;
  }
  const moov = boxes.find(b => b.type === 'moov'), mdat = boxes.find(b => b.type === 'mdat');
  if (!moov || !mdat) throw new Error('not an MP4 with moov and mdat');
  if (moov.p < mdat.p) return buf;
  const m = Buffer.from(buf.subarray(moov.p, moov.p + moov.size));
  const walk = (start, end) => {
    for (let p = start; p + 8 <= end;) {
      const size = m.readUInt32BE(p), type = m.toString('latin1', p + 4, p + 8);
      if (size < 8) break;
      if (['trak', 'mdia', 'minf', 'stbl'].includes(type)) walk(p + 8, p + size);
      else if (type === 'stco') { const n = m.readUInt32BE(p + 12); for (let i = 0; i < n; i++) m.writeUInt32BE(m.readUInt32BE(p + 16 + i * 4) + moov.size, p + 16 + i * 4); }
      else if (type === 'co64') { const n = m.readUInt32BE(p + 12); for (let i = 0; i < n; i++) m.writeBigUInt64BE(m.readBigUInt64BE(p + 16 + i * 8) + BigInt(moov.size), p + 16 + i * 8); }
      p += size;
    }
  };
  walk(8, m.length);
  const parts = [];
  for (const b of boxes) {
    if (b.type === 'moov') continue;
    if (b.type === 'mdat') parts.push(m);
    parts.push(buf.subarray(b.p, b.p + b.size));
  }
  return Buffer.concat(parts);
}

function encode(clip, dir, meta) {
  const { w, h } = CUTS[clip.cut], tmp = path.join(WORK, `${clip.name}.mp4`), py = path.join(WORK, 'encode.py');
  fs.writeFileSync(py, BLENDER_PY);
  fs.rmSync(tmp, { force: true });
  const r = spawnSync(BLENDER, ['-b', '--factory-startup', '--python', py, '--', dir, tmp, String(FPS), String(w), String(h), String(args.kbps || clip.kbps || CRF), String(FPS * 2)], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (!fs.existsSync(tmp)) throw new Error(`Blender did not write ${tmp}\n${(r.stdout || '').slice(-1500)}\n${r.stderr || ''}`);
  const out = faststart(fs.readFileSync(tmp));
  fs.writeFileSync(path.join(OUT, clipFile(clip.id, clip.cut)), out);
  fs.rmSync(tmp, { force: true });
  // the poster: a frame of the take itself
  const poster = path.join(dir, `f${String(Math.min(meta.frames, Math.max(1, meta.poster))).padStart(5, '0')}.jpg`);
  return { bytes: out.length, poster };
}

async function posterOf(browser, file, clip) {
  // re-saved a little lighter than the take's frame
  const page = await browser.newPage();
  const { w, h } = CUTS[clip.cut];
  const out = await page.evaluate(async ([b, w, h]) => {
    const im = new Image();
    await new Promise(r => { im.onload = r; im.src = `data:image/jpeg;base64,${b}`; });
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(im, 0, 0);
    return c.toDataURL('image/jpeg', 0.72);
  }, [fs.readFileSync(file).toString('base64'), w, h]);
  await page.close();
  const buf = Buffer.from(out.slice(out.indexOf(',') + 1), 'base64');
  fs.writeFileSync(path.join(OUT, clipFile(clip.id, clip.cut, 'jpg')), buf);
  return buf.length;
}

// ---------------------------------------------------------------- main
const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { fps: FPS, clips: {} };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  if (args.frames !== '1') await serve();
  for (const clip of want) {
    const dir = path.join(WORK, clip.name);
    log(`${clip.name}`);
    let meta;
    if (args.frames === '1') {
      meta = manifest.clips[clip.name];
      if (!meta || !fs.existsSync(dir)) throw new Error(`no kept frames for ${clip.name}`);
    } else {
      const rec = clip.kind === 'tour' ? recordTour : clip.kind === 'intro' ? recordIntro : recordTitle;
      for (let attempt = 1; !meta; attempt++) {
        try { meta = await rec(browser, clip, dir); } catch (e) {
          log(`  take ${attempt} failed: ${e.message}`);
          for (const c of browser.contexts()) await c.close().catch(() => {});
          if (attempt >= 3) throw e;
        }
      }
      log(`  ${meta.frames} frames (${meta.duration.toFixed(1)} s)`);
    }
    if (args.encode === '0') continue;
    const { w, h } = CUTS[clip.cut];
    const e = encode(clip, dir, meta);
    const posterBytes = await posterOf(browser, e.poster, clip);
    manifest.clips[clip.name] = { ...meta, file: clipFile(clip.id, clip.cut), posterFile: clipFile(clip.id, clip.cut, 'jpg'), width: w, height: h, bytes: e.bytes, posterBytes };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
    log(`  ${clipFile(clip.id, clip.cut)}  ${(e.bytes / 1e6).toFixed(2)} MB  (${Math.round(e.bytes * 8 / meta.duration / 1000)} kbps)`);
    if (args.keep !== '1') fs.rmSync(dir, { recursive: true, force: true });
  }
} finally {
  await browser.close();
  server?.kill();
}
const all = Object.values(manifest.clips);
log(`public/video: ${all.length} clips, ${(all.reduce((a, c) => a + c.bytes + c.posterBytes, 0) / 1e6).toFixed(1)} MB in all`);
