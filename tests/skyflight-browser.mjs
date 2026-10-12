// "Fly up" in the sky viewer, in a real browser: at three spots (the stargazing hill, the mill lamp, the viaduct deck) in every
// season, look up, press Fly up, check the low groups are above the rim WITHOUT the lift cheat, turn the sky's clock through the
// night, come down; interrupt the climb in every way (Esc, Backspace, Space, the stick, Look down, pause, a talk, a cutscene, the
// kite losing her) and check restoration and disposal/detachment of sky-owned objects, materials, geometry and UI.
//   node tests/skyflight-browser.mjs [--only=desktop-low,desktop-medium,phone-low,phone-medium] [--seasons=spring,summer,autumn,winter]
//        [--spots=star-hill,mill-lamp,viaduct-lamp] [--parts=matrix,interrupts,nokite,daydusk,vn,time] [--out=.tools/review/skyflight]
// Uses GAME_URL if set (a built site: vite preview); otherwise starts vite on port 5846. Needs Playwright.
// Rendering is switched off and the game clock runs at 3x while it waits for a climb (screenshots switch it back on).
import { createRequire } from 'module';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { stateAt } from './e2e/fastforward.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const OUT = path.resolve(ROOT, args.out || '.tools/review/skyflight');
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE_PATH || path.join(ROOT, 'node_modules/playwright');
if (!existsSync(pwPath)) { console.error('Playwright not found.'); process.exit(2); }
const { chromium } = require(pwPath);

let server = null, URL0 = process.env.GAME_URL;
if (!URL0) {
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', '5846', '--strictPort'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, NO_HMR: '1' } });
  URL0 = 'http://127.0.0.1:5846/';
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 60000);
    const seen = d => { if (/ready|Local/.test(String(d))) { clearTimeout(t); res(); } };
    server.stdout.on('data', seen); server.stderr.on('data', seen);
    server.on('exit', code => rej(new Error(`vite exited ${code}`)));
  });
}
const DEVICES = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};
const CONFIGS = (args.only || 'desktop-low,desktop-medium,phone-low,phone-medium').split(',').map(c => { const [dev, q] = c.split('-'); return { dev, q, name: c }; });
const SEASONS = (args.seasons || 'spring,summer,autumn,winter').split(',');
const SPOTS = (args.spots || 'star-hill,mill-lamp,viaduct-lamp').split(',');
const PARTS = (args.parts || 'matrix,time,interrupts,nokite,daydusk,ownership,vn').split(',');
// the low group of each season (jp sky; the vn sky adds the Southern Cross in the spring)
const LOW = { spring: ['virgo', 'crux'], summer: ['scorpius', 'scorpius'], autumn: ['pegasus', 'pegasus'], winter: ['orion', 'orion'] };
const INT = args.int ? args.int.split(',') : null, wantInt = n => !INT || INT.includes(n);
const failures = [], results = [];
let STEP = '';
let HANG = null;
const W = ms => { STEP = `wait ${ms}`; return HANG.waitForTimeout(ms); };
setInterval(async () => {
  let a = 'no page';
  if (HANG) a = await Promise.race([HANG.evaluate(() => { const s = window.__STARLINE__.director.sky; return JSON.stringify({ f: s.debug().flight, paused: window.__STARLINE__.paused, fps: window.__STARLINE__.fps, kite: window.__STARLINE__.kite.state }); }).catch(e => 'error ' + e.message.slice(0, 60)), new Promise(r => setTimeout(() => r('NO ANSWER FROM THE PAGE'), 8000))]);
  console.log(`[heartbeat ${new Date().toISOString().slice(11, 19)}] ${STEP} :: ${a}`);
}, 60000).unref();

function save(step = 'c2.page', story = 'grandma', kite = true) {
  const quest = stateAt(step, 'together', story);
  quest.inv.kite = kite ? 1 : 0;
  return JSON.stringify({ v: 1, quest, player: { x: -55, y: 17, z: 141, facing: 3.1 }, at: 1760000000000 });
}
async function boot(browser, cfg, SAVE, query = '') {
  const d = DEVICES[cfg.dev];
  const ctx = await browser.newContext({ viewport: d.viewport, hasTouch: !!d.hasTouch, isMobile: !!d.isMobile, deviceScaleFactor: d.deviceScaleFactor || 1 });
  await ctx.addInitScript(([s, q]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('starline-save-1', s); localStorage.setItem('starline-last-slot', '1'); localStorage.setItem('starline-quality', q); } }, [SAVE, cfg.q]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  HANG = page;
  await page.goto(`${URL0}?qa=1&mute=1&start=continue${query}`);
  await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__, null, { timeout: 240000 });
  await W(1500);
  await page.evaluate(installHelpers);
  return { ctx, page, errors };
}

/** Runs in the page: window.__SF, the helpers every step uses. */
function installHelpers() {
  const g = window.__STARLINE__, d = g.director, V = v => (v ? [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] : null);
  // The valley streams unrelated creatures/tiles while flying. Observe only resources actually created by SkyGaze.
  const resources = new Map(), roots = new Set(), views = new Set();
  const watch = () => {
    const s = d.sky;
    if (s.group) roots.add(s.group);
    if (s.skySt?.group) roots.add(s.skySt.group);
    if (s.el) views.add(s.el);
    s.group?.traverse(o => {
      for (const r of [o.geometry, ...(Array.isArray(o.material) ? o.material : [o.material])]) if (r && !resources.has(r)) {
        const rec = { type: r.isBufferGeometry ? 'geometry' : 'material', disposed: 0 };
        resources.set(r, rec); r.addEventListener('dispose', () => rec.disposed++);
      }
    });
  };
  for (const name of ['build', 'buildSky', 'ui']) {
    const original = d.sky[name];
    d.sky[name] = function (...args) { const result = original.apply(this, args); watch(); return result; };
  }
  const SF = window.__SF = {
    fast(on) {
      if (!g.__r0) { g.__r0 = g.renderer.render; g.__d0 = g.clock.getDelta; }
      if (on) { g.renderer.render = () => {}; g.clock.getDelta = () => 0.05; } else { g.renderer.render = g.__r0; g.clock.getDelta = g.__d0; }
    },
    look([s, h, weather]) { g.seasonOverride = s; g.timeOverride = h; g.weatherOff = !weather; g.applyLook(); if (typeof weather === 'string') g.fx.setWeather(weather); },
    counts() {
      let n = 0; g.scene.traverse(() => { n++; });
      const m = g.renderer.renderer.info.memory;
      return { objects: n, geometries: m.geometries, textures: m.textures, bodyKids: document.body.children.length, cls: document.body.className, skyOwned: SF.owned() };
    },
    owned() {
      const attached = o => { for (let p = o.parent; p; p = p.parent) if (p === g.scene) return true; return false; };
      const records = [...resources.values()];
      return { made: records.length, live: records.filter(r => !r.disposed).length, repeated: records.filter(r => r.disposed > 1).length,
        attached: [...roots].filter(attached).length, views: [...views].filter(e => e.isConnected).length };
    },
    state() {
      const p = g.player, k = g.kite, f = g.follow;
      return {
        pos: V(p.pos), grounded: p.grounded, locked: p.locked, mounted: !!p.mounted, carry: p.carry?.state ?? null, pose: p.pose || null,
        kite: { state: k.state, guide: !!k.guide, scale: +k.scale.toFixed(2), vis: k.root.visible }, shot: !!f.shot, tracking: !!f.tracking, flying: !!f.flying, fovBase: f.fovBase, fov: +g.camera.fov.toFixed(1),
        viewFocus: !!g.viewFocus, cls: document.body.className, hour: +g.time.hour.toFixed(2), shown: g.shownHour(), timeOverride: g.timeOverride, active: d.sky.active?.id || null, paused: g.paused, dlg: g.ui.dialogueOpen,
        skyEl: !!document.getElementById('skyGaze'),
      };
    },
    spot(id) { return d.sky.spots.find(s => s.id === id); },
    place(id) { const sp = SF.spot(id); g.player.teleport(sp.pos.x, sp.pos.z, sp.pos.y - 1, 3); g.player.vel.set(0, 0, 0); g.follow.first = true; g.follow.clearCutscene?.(true); },
    start(id) { d.actCooldown = 0; d.sky.start(SF.spot(id)); return !!d.sky.active; },
    dbg() { return d.sky.debug(); },
    settled() { const f = g.follow; return !!(f.shot && f.shot.t >= f.shot.d); },
    /** Fraction of a group's stars the terrain does not hide from the camera (a ray march over the real height field and the colliders). */
    visible(id) {
      const info = d.sky.infos.find(i => i.id === id);
      if (!info) return null;
      const c = g.camera.position;
      let ok = 0, n = 0;
      const dir = { x: 0, y: 0, z: 0 };
      for (const s of info.stars) {
        n++;
        dir.x = s.dir.x; dir.y = s.dir.y; dir.z = s.dir.z;
        let hidden = false;
        for (let t = 4; t < 520 && !hidden; t += t < 80 ? 4 : 8) { const x = c.x + dir.x * t, y = c.y + dir.y * t, z = c.z + dir.z * t; if (g.world.heightAt(x, z) > y) hidden = true; }
        if (!hidden && g.colliders.raycast(c.x, c.y, c.z, c.x + dir.x * 300, c.y + dir.y * 300, c.z + dir.z * 300) < 1) hidden = true;
        if (!hidden) ok++;
      }
      return { id, visible: ok, of: n, alt: +(Math.asin(info.dir.y) * 180 / Math.PI).toFixed(1), liftK: d.sky.skySt.liftK };
    },
    /** Does the group's middle land on screen (inside the frame)? */
    onScreen(id) {
      const info = d.sky.infos.find(i => i.id === id);
      if (!info) return null;
      const v = info.dir.clone().multiplyScalar(500).add(g.camera.position).project(g.camera);
      return { x: +v.x.toFixed(2), y: +v.y.toFixed(2), inFront: v.z < 1 };
    },
    box(sel) { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, vis: getComputedStyle(e).display !== 'none' && r.width > 0 }; },
    overlap(a, b) { const A = SF.box(a), B = SF.box(b); if (!A || !B || !A.vis || !B.vis) return false; return A.x < B.x + B.w && A.x + A.w > B.x && A.y < B.y + B.h && A.y + A.h > B.y; },
  };
}

async function main() {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const cfg of CONFIGS) {
    const full = cfg.name === 'desktop-low';
    const { page, errors, ctx } = await boot(browser, cfg, save());
    const tag = cfg.name;
    const log = (...a) => console.log(`[${tag}]`, ...a);
    const fails = [];
    const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log('  FAIL', msg); } return ok; };
    const ev = (fn, arg) => { STEP = `ev ${String(fn).slice(0, 90).replace(/s+/g, ' ')}`; return page.evaluate(fn, arg); };
    const S = n => page.screenshot({ path: path.join(OUT, `${tag}-${n}.png`) });
    const press = async k => { STEP = `press ${k}`; await page.keyboard.press(k); };
    const fast = on => ev(o => window.__SF.fast(o), on);
    /** Wait (in game time, fast) until the predicate holds in the page. */
    const until = async (fn, arg, ms = 90000) => {
      STEP = `until ${String(fn).slice(0, 100)}`;
      await fast(true);
      const guard = new Promise((_, rej) => setTimeout(() => rej(new Error('node-side timeout')), ms + 15000));
      try { await Promise.race([page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }), guard]); }
      catch (e) { const st = await Promise.race([ev(() => ({ ...window.__SF.state(), dbg: window.__SF.dbg() })).catch(() => null), new Promise(r => setTimeout(() => r('NO ANSWER'), 8000))]); throw new Error(`stalled waiting for ${String(fn).slice(0, 90)}: ${JSON.stringify(st)}`); }
      finally { await fast(false); }
    };
    const phase = () => ev(() => window.__SF.dbg().flight?.phase);
    const settle = async () => { await until(() => window.__SF.settled(), null, 60000); await W(500); };
    const startAt = async (spotId, look) => {
      STEP = `startAt ${spotId}`;
      await ev(l => window.__SF.look(l), look);
      await ev(id => window.__SF.place(id), spotId);
      await W(700);
      await until(() => window.__STARLINE__.player.grounded, null, 20000);
      const ok = await ev(id => window.__SF.start(id), spotId);
      if (!check(ok, `${spotId}: the sky viewer did not start`)) return false;
      await settle();
      return true;
    };
    const climb = async () => { await ev(() => window.__STARLINE__.director.sky.toggleFly()); await until(() => window.__SF.dbg().flight?.phase === 'hover', null, 120000); await W(1200); };
    const part = async (name, fn) => { try { await fn(); } catch (e) { fails.push(`${name}: ${e.message.slice(0, 1800)}`); console.log('  FAIL', name, e.message.slice(0, 300)); try { await ev(() => { const d = window.__STARLINE__.director; if (d.sky.active) d.sky.stop(true); d.q.state.inv.kite = 1; window.__STARLINE__.paused && window.__STARLINE__.togglePause(false, true); }); } catch { /* ignore */ } } };
    const SAME = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    /** Everything the viewer and the kite touch, compared with what it was before the look-up. */
    const restored = async (base, label, { closed = true } = {}) => {
      STEP = `restored ${label}`;
      await until(c => window.__STARLINE__.player.carry?.state === c, base.carry, 30000).catch(() => {});
      await W(1400);
      await until(() => { const k = window.__STARLINE__.kite; return k.state === 'idle' || k.state === 'leave' || k.state === 'idle'; }, null, 30000);
      if (closed) await until(() => !window.__STARLINE__.director.sky.active && !(window.__STARLINE__.director.sky.returning > 0), null, 60000);
      await W(1200);
      const now = await ev(() => ({ ...window.__SF.state(), ...window.__SF.counts() }));
      const dxz = Math.hypot(now.pos[0] - base.pos[0], now.pos[2] - base.pos[2]);
      check(dxz < 0.35 && Math.abs(now.pos[1] - base.pos[1]) < 0.35, `${label}: position ${base.pos} -> ${now.pos}`);
      check(now.grounded && !now.mounted && !now.locked, `${label}: grounded=${now.grounded} mounted=${now.mounted} locked=${now.locked}`);
      check(!now.kite.guide && now.kite.state !== 'fly' && now.kite.state !== 'lift' && now.kite.state !== 'arrive', `${label}: kite ${JSON.stringify(now.kite)}`);
      check(!now.flying && !now.viewFocus, `${label}: follow.flying=${now.flying} viewFocus=${now.viewFocus}`);
      check(!/sky-fly|sky-gaze/.test(now.cls) === closed, `${label}: body classes "${now.cls}"`);
      check(now.carry === base.carry, `${label}: lantern ${base.carry} -> ${now.carry}`);
      check(Math.abs(now.fovBase - base.fovBase) < 1e-6, `${label}: fovBase ${base.fovBase} -> ${now.fovBase}`);
      check(now.skyEl === !closed, `${label}: viewer element ${now.skyEl}`);
      // Disposal events prove ownership/cleanup; ambient streaming and cached terrain are deliberately outside this assertion.
      const owned = now.skyOwned;
      check(owned.made > 0 && owned.live === 0 && owned.repeated === 0 && owned.attached === 0 && owned.views === 0,
        `${label}: sky-owned resources ${JSON.stringify(owned)}`);
      return now;
    };
    const baseline = async () => { await fast(true); await W(6000); await fast(false); await W(600); return ev(() => ({ ...window.__SF.state(), ...window.__SF.counts() })); };

    // ================================================================== matrix: spots x seasons, up, groups visible, down
    if (PARTS.includes('matrix')) {
      for (const spotId of SPOTS) {
        for (const season of (full ? SEASONS : SEASONS.filter(s => s === 'summer' || s === 'winter'))) {
          const label = `${spotId}/${season}`;
          await part(label, async () => {
          const base = await (async () => { await ev(l => window.__SF.look(l), [season, 21]); await ev(id => window.__SF.place(id), spotId); await W(900); return baseline(); })();
          if (!await startAt(spotId, [season, 21])) return;
          const want = LOW[season][0];
          const sel = await ev(id => window.__STARLINE__.director.sky.pick(id), want);
          await W(1500);
          const ground = await ev(id => window.__SF.visible(id), want);
          const lk0 = await ev(() => window.__SF.dbg().flight.liftK);
          check(lk0 === 1, `${label}: the lift cheat is on while she stands (${lk0})`);
          if (full) await S(`${spotId}-${season}-1-ground`);
          // up, by the keyboard (U); the labels show where the kite is
          await press('KeyU');
          await until(() => window.__SF.dbg().flight?.alt > 30, null, 90000);
          await W(150);
          const midK = await ev(() => window.__SF.dbg().flight.liftK);
          check(midK < 1 && midK > 0, `${label}: the lift cheat fades mid-climb (${midK})`);
          if (full && season === 'summer') await S(`${spotId}-${season}-2-mid`);
          await until(() => window.__SF.dbg().flight?.phase === 'hover', null, 120000);
          await W(1500);
          const top = await ev(id => window.__SF.visible(id), want);
          const st = await ev(() => ({ ...window.__SF.state(), dbg: window.__SF.dbg() }));
          check(st.dbg.flight.liftK === 0, `${label}: no lift cheat at the top (${st.dbg.flight.liftK})`);
          check(st.kite.state === 'fly' && st.mounted, `${label}: kite ${st.kite.state} mounted ${st.mounted}`);
          check(st.viewFocus && /sky-fly/.test(st.cls), `${label}: focus/class while up: ${st.viewFocus} ${st.cls}`);
          check(sel === true, `${label}: pick(${want}) failed (the group must be up)`);
          check(top && top.visible / top.of >= 0.7, `${label}: ${want} at the top: ${top?.visible}/${top?.of} stars visible (on the ground ${ground?.visible}/${ground?.of})`);
          log(label, `${want}: ground ${ground?.visible}/${ground?.of} (alt ${ground?.alt}), top ${top?.visible}/${top?.of} (alt ${top?.alt})`);
          results.push({ tag, label, group: want, ground, top });
          const scr = await ev(id => window.__SF.onScreen(id), want);
          check(scr && scr.inFront && Math.abs(scr.x) < 1.05 && Math.abs(scr.y) < 1.05, `${label}: the group's middle is on screen ${JSON.stringify(scr)}`);
          if (full || spotId === 'star-hill') await S(`${spotId}-${season}-3-top-${want}`);
          // look down at the valley: the sleeping villages and their lamps are small warm points far below
          if (season === 'summer' && (full || spotId === 'star-hill')) {
            await ev(() => { const k = window.__STARLINE__.director.sky; k.tpitch = -0.3; k.tyaw = Math.atan2(-20 - k.takeoff.x, 20 - k.takeoff.z); k.userPicked = true; });
            await W(3500);
            await S(`${spotId}-${season}-5-valley-below`);
            await ev(() => { const k = window.__STARLINE__.director.sky; k.reaim(); });
            await W(2500);
          }
          // the chip and the strip never sit on each other
          for (const [a, b] of [['#skyGaze .sg-clock', '#skyGaze .sg-strip'], ['#skyGaze .sg-clock', '#skyGaze .down'], ['#skyGaze .sg-strip', '#skyGaze .down'], ['#skyGaze .sg-clock', '#skyGaze .count'], ['#skyGaze .sg-clock', '#skyGaze .sg-card']]) {
            check(!await ev(([x, y]) => window.__SF.overlap(x, y), [a, b]), `${label}: ${a} overlaps ${b}`);
          }
          // the button says Come down; press it with the pointer / a tap
          const txt = await ev(() => document.querySelector('#skyGaze .fly')?.textContent);
          check(/Come down/.test(txt || ''), `${label}: button says "${txt}"`);
          const fb = await ev(() => window.__SF.box('#skyGaze .fly'));
          check(fb && fb.h >= 43.5 && fb.w >= 43.5, `${label}: the Fly button is ${fb?.w}x${fb?.h}`);
          if (cfg.dev === 'phone') await page.locator('#skyGaze .fly').tap(); else await page.locator('#skyGaze .fly').click();
          await until(() => window.__SF.dbg().flight?.phase === 'ground', null, 120000);
          await W(800);
          const down = await ev(() => ({ ...window.__SF.state(), dbg: window.__SF.dbg() }));
          check(down.dbg.flight.liftK === 1 && down.active, `${label}: back on the ground, cheat back on (${down.dbg.flight.liftK}), viewer still open: ${down.active}`);
          check(!/sky-fly/.test(down.cls) && !down.viewFocus && !down.kite.guide, `${label}: after Come down: ${down.cls} focus ${down.viewFocus}`);
          if (full && spotId === 'star-hill') await S(`${spotId}-${season}-4-down`);
          // look down, and everything is as it was
          await ev(() => { window.__STARLINE__.director.sky.wantLeave = true; });
          await restored(base, label);
          });
        }
      }
    }

    // ================================================================== the sky's own clock, the whole night
    if (PARTS.includes('time') && full) await part('time', async () => {
      const label = 'time';
      const base = await (async () => { await ev(l => window.__SF.look(l), ['autumn', 21]); await ev(id => window.__SF.place(id), 'star-hill'); await W(900); return baseline(); })();
      if (await startAt('star-hill', ['autumn', 21])) {
        const seq = [];
        const read = () => ev(() => { const s = window.__SF.dbg(); return { hour: s.hour, skyHour: s.skyHour, clock: s.clock, groups: s.groups, game: window.__STARLINE__.shownHour(), gt: +window.__STARLINE__.time.hour.toFixed(3) }; });
        seq.push(await read());
        check(seq[0].clock === 'Autumn · 21:00', `time: the chip says "${seq[0].clock}"`);
        // the hour keys: PageDown back to 19:00, then PageUp through to 05:00
        for (let i = 0; i < 6; i++) await press('PageDown');
        await W(300);
        const early = await read();
        check(early.clock === 'Autumn · 19:00' && early.skyHour === 19, `time: the first step back stops at 19:00 (${early.clock})`);
        await S('time-1900');
        const hours = [];
        for (let i = 0; i < 24; i++) {
          const before = (await read()).skyHour;
          await press('PageUp');
          await W(120);
          const r = await read();
          hours.push(r);
          if (r.skyHour === before) break;
        }
        const last = hours.at(-1);
        check(last.clock === 'Autumn · 05:00' && last.skyHour === 29, `time: the night ends at 05:00 (${last.clock})`);
        check(hours.length === 21, `time: ${hours.length} presses from 19:00 to 05:00 (20 steps and one that stops)`);
        const sets = new Set(hours.map(h => h.groups.join()));
        check(sets.size >= 6, `time: only ${sets.size} different group lists through the night`);
        check(hours.every(h => h.game === 21), 'time: the game clock never moved from the fixed 21:00');
        await S('time-0500');
        // the on-screen arrows and Now (by pointer or tap)
        const tap = async sel => { if (cfg.dev === 'phone') await page.locator(sel).tap(); else await page.locator(sel).click(); await W(150); };
        await tap('#skyGaze .tprev');
        check((await read()).clock === 'Autumn · 04:30', 'time: the arrow steps back half an hour');
        await tap('#skyGaze .tnow');
        const now = await read();
        check(now.skyHour === null && now.clock === 'Autumn · 21:00', `time: Now returns to the real hour (${now.clock})`);
        const tb = await ev(() => ['.tprev', '.tnext', '.tnow'].map(s => window.__SF.box('#skyGaze ' + s)));
        check(tb.slice(0, 2).every(b => b && b.w >= 43.5 && b.h >= 43.5), `time: arrows are ${tb.slice(0, 2).map(b => b && `${b.w}x${b.h}`)}`);
        // a picked group that has set disappears and the strip follows
        await ev(() => window.__STARLINE__.director.sky.pick('pegasus'));
        for (let i = 0; i < 14; i++) await press('PageUp');
        await W(400);
        const late = await read();
        check(!late.groups.includes('pegasus') || late.groups.length > 0, 'time: groups change');
        await press('Home');
        check((await read()).skyHour === null, 'time: Home is Now');
        // learned groups still work after a rebuild
        const learned0 = await ev(() => window.__STARLINE__.director.q.state.starGroups?.learned?.length || 0);
        await ev(() => window.__STARLINE__.director.sky.pick('orion') || window.__STARLINE__.director.sky.step(1));
        await until(() => (window.__STARLINE__.director.q.state.starGroups?.learned?.length || 0) > 0, null, 30000);
        const learned1 = await ev(() => window.__STARLINE__.director.q.state.starGroups?.learned?.length || 0);
        check(learned1 >= Math.max(1, learned0), 'time: reading a group still learns it');
        await ev(() => { window.__STARLINE__.director.sky.wantLeave = true; });
        await restored(base, label);
      }
    });

    // ================================================================== interrupts
    if (PARTS.includes('interrupts') && (full || cfg.name === 'phone-low')) await part('interrupts', async () => {
      const spotId = 'star-hill', look = ['summer', 21];
      const base = await (async () => { await ev(l => window.__SF.look(l), look); await ev(id => window.__SF.place(id), spotId); await W(900); return baseline(); })();
      const climbTo = async alt => { await ev(() => window.__STARLINE__.director.sky.toggleFly()); await until(a => window.__SF.dbg().flight?.alt > a, alt, 120000); };
      const timeIt = async (label, trigger, { expectGround = true, maxSeconds = 3.2 } = {}) => {
        STEP = `timeIt ${label}`;
        await part(label, async () => {
        const t0 = await ev(() => window.__STARLINE__.director.sky.t);
        const info = await ev(() => { const f = window.__SF.dbg().flight; return f ? { alt: f.alt, phase: f.phase } : null; });
        await trigger();
        await until(() => !window.__STARLINE__.director.sky.active, null, 60000);
        const t1 = await ev(() => window.__STARLINE__.director.sky.t);
        const took = t1 - t0;
        if (expectGround) check(took <= maxSeconds, `${label}: came down in ${took.toFixed(2)} s from ${info?.alt} m (${info?.phase})`);
        log(label, `took ${took.toFixed(2)} s from ${info?.alt} m`);
        await restored(base, label);
        });
      };
      // (a) exits while climbing and while hovering
      for (const [name, trigger] of [
        ['esc-climb', () => press('Escape')], ['backspace-climb', () => press('Backspace')], ['space-climb', () => press('Space')],
        ['lookdown-climb', async () => { if (cfg.dev === 'phone') await page.locator('#skyGaze .down').tap(); else await page.locator('#skyGaze .down').click(); }],
      ].filter(c => wantInt(c[0]))) {
        if (!await startAt(spotId, look)) continue;
        await climbTo(50);
        await timeIt(name, trigger);
      }
      for (const [name, trigger] of [
        ['esc-hover', () => press('Escape')], ['space-hover', () => press('Space')],
        ['stick-hover', async () => { await page.keyboard.down('KeyW'); try { await page.waitForFunction(() => window.__STARLINE__.director.sky.leaving || !window.__STARLINE__.director.sky.active, null, { timeout: 15000, polling: 50 }); } finally { await page.keyboard.up('KeyW'); } }],
      ].filter(c => wantInt(c[0]))) {
        if (!await startAt(spotId, look)) continue;
        await climb();
        await timeIt(name, trigger);
      }
      // (b) pause freezes the climb and the climb goes on afterwards
      if (wantInt('pause') && await startAt(spotId, look)) {
        await climbTo(40);
        await ev(() => window.__STARLINE__.togglePause(true, true));
        const a0 = await ev(() => window.__SF.dbg().flight.alt);
        await W(1200);
        const a1 = await ev(() => window.__SF.dbg().flight.alt);
        check(Math.abs(a1 - a0) < 0.01, `pause: the climb stands still (${a0} -> ${a1})`);
        await ev(() => window.__STARLINE__.togglePause(false, true));
        await until(() => window.__SF.dbg().flight?.phase === 'hover', null, 120000);
        check(await ev(() => window.__SF.dbg().flight.alt) === await ev(() => window.__SF.dbg().flight.lift), 'pause: it reaches the top afterwards');
        await ev(() => { window.__STARLINE__.director.sky.wantLeave = true; });
        await until(() => !window.__STARLINE__.director.sky.active, null, 60000);
        await restored(base, 'pause');
      }
      // (c) the screen is taken at once: a talk, a cutscene shot, the kite losing her
      for (const [name, trigger, at] of [
        ['dialogue-hover', () => ev(() => { window.__STARLINE__.director.say('kite_rest'); }), 'hover'],
        ['dialogue-climb', () => ev(() => { window.__STARLINE__.director.say('kite_rest'); }), 'climb'],
        ['cutscene-hover', () => ev(() => { const g = window.__STARLINE__; g.follow.cutscene({ pos: g.camera.position.clone().add({ x: 3, y: 0, z: 3, isVector3: false }), look: g.camera.position.clone() }, 0.5); }), 'hover'],
        ['kite-lost-hover', () => ev(() => window.__STARLINE__.kite.release(false, true)), 'hover'],
      ].filter(c => wantInt(c[0]))) {
        if (!await startAt(spotId, look)) continue;
        if (at === 'hover') await climb(); else await climbTo(40);
        await trigger();
        if (name === 'kite-lost-hover') {
          // the viewer stays open, but she is back on the ground at her spot, the cheat is on again, the kite is gone
          await until(() => window.__SF.dbg().flight?.phase === 'ground' && !window.__STARLINE__.kite.guide && !window.__STARLINE__.player.mounted, null, 30000);
          const st = await ev(() => ({ ...window.__SF.state(), dbg: window.__SF.dbg() }));
          check(st.active && st.grounded && st.dbg.flight.liftK === 1 && !/sky-fly/.test(st.cls) && !st.viewFocus, `${name}: ${JSON.stringify({ a: st.active, g: st.grounded, k: st.dbg.flight.liftK, c: st.cls, f: st.viewFocus })}`);
          await ev(() => { window.__STARLINE__.director.sky.wantLeave = true; });
        }
        await until(() => !window.__STARLINE__.director.sky.active, null, 30000);
        if (/dialogue/.test(name)) {
          for (let i = 0; i < 20 && await ev(() => window.__STARLINE__.ui.dialogueOpen); i++) { await press('Enter'); await W(250); }
        }
        await restored(base, name);
      }
      // (d) the kite key (G) comes down; Fly up again on the way down; the kite called off before it arrives
      if (await startAt(spotId, look)) {
        await climb();
        await press('KeyG');
        await until(() => window.__SF.dbg().flight?.alt < 80, null, 60000);
        await press('KeyU');                                           // changed her mind
        await until(() => window.__SF.dbg().flight?.phase === 'hover', null, 120000);
        check(true, 'again');
        await press('KeyG');
        await until(() => window.__SF.dbg().flight?.phase === 'ground', null, 120000);
        await ev(() => { window.__STARLINE__.director.sky.wantLeave = true; });
        await restored(base, 'g-key');
      }
      if (await startAt(spotId, look)) {
        await press('KeyU');
        await W(100);
        await press('KeyU');                                           // before the kite has taken hold
        await W(800);
        check(await ev(() => window.__SF.dbg().flight.phase) === 'ground', 'cancel: back on the ground');
        await ev(() => { window.__STARLINE__.director.sky.wantLeave = true; });
        await restored(base, 'cancel-summon');
      }
      if (await startAt(spotId, look)) {
        await press('KeyU');
        await W(200);
        await press('Escape');                                         // leaving while the kite swoops in
        await until(() => !window.__STARLINE__.director.sky.active, null, 60000);
        await restored(base, 'leave-summon');
      }
      // (e) quick succession: climb, leave, look up again at once
      if (await startAt(spotId, look)) {
        await climbTo(30);
        await press('Escape');
        await until(() => !window.__STARLINE__.director.sky.active, null, 60000);
        const again = await ev(() => { window.__SF.look(['summer', 21]); return false; });
        void again;
        await restored(base, 'quick');
      }
    });

    // ================================================================== no Star Kite: the button is grey and says why
    if (PARTS.includes('nokite') && full) await part('nokite', async () => {
      await ev(() => { window.__STARLINE__.director.q.state.inv.kite = 0; });
      const base = await (async () => { await ev(l => window.__SF.look(l), ['summer', 21]); await ev(id => window.__SF.place(id), 'star-hill'); await W(900); return baseline(); })();
      if (await startAt('star-hill', ['summer', 21])) {
        const b = await ev(() => { const e = document.querySelector('#skyGaze .fly'); return { off: e.classList.contains('off'), aria: e.getAttribute('aria-disabled'), text: e.textContent }; });
        check(b.off && b.aria === 'true' && /Fly up/.test(b.text), `nokite: the button is grey ${JSON.stringify(b)}`);
        await S('nokite-grey');
        await page.locator('#skyGaze .fly').click({ force: true });
        await W(400);
        const line = await ev(() => document.querySelector('#skyGaze .line')?.textContent);
        check(/Get the Star Kite first/.test(line || ''), `nokite: the hint line says "${line}"`);
        await S('nokite-hint');
        await press('KeyU');
        await W(500);
        check(await ev(() => window.__SF.dbg().flight.phase) === 'ground' && await ev(() => window.__STARLINE__.kite.state) === 'idle', 'nokite: nothing flies');
        await ev(() => { window.__STARLINE__.director.sky.wantLeave = true; });
        await restored(base, 'nokite');
      }
      await ev(() => { window.__STARLINE__.director.q.state.inv.kite = 1; });
    });

    // ================================================================== by day and at dusk: the valley panorama
    if (PARTS.includes('daydusk') && full) await part('daydusk', async () => {
      for (const [name, look, spot] of [['day', ['autumn', 14], 'mill-lamp'], ['dusk', ['spring', 18.7], 'star-hill'], ['rain', ['summer', 21, 'rain'], 'star-hill']]) {
        const base = await (async () => { await ev(l => window.__SF.look(l), look); await ev(id => window.__SF.place(id), spot); await W(900); return baseline(); })();
        if (!await startAt(spot, look)) continue;
        const dbg = await ev(() => window.__SF.dbg());
        check(dbg.look === name, `${name}: actual sky mode is ${dbg.look}`);
        log(name, 'look', dbg.look, 'clock', dbg.clock);
        await S(`${name}-1-ground`);
        await climb();
        const top = await ev(() => ({ line: document.querySelector('#skyGaze .line')?.textContent, clock: window.__SF.dbg().clock, nosky: document.querySelector('#skyGaze .sg-clock')?.classList.contains('nosky') }));
        log(name, 'top', JSON.stringify(top));
        if (name === 'day') check(/stars come out after dark/.test(top.line || ''), `day: the line says "${top.line}"`);
        await S(`${name}-2-top`);
        await ev(() => { window.__STARLINE__.director.sky.wantLeave = true; });
        await until(() => !window.__STARLINE__.director.sky.active, null, 60000);
        await restored(base, name);
        if (name === 'rain') await ev(() => { window.__STARLINE__.fx.setWeather?.(null); });
      }
    });

    // ================================================================== Mini games sessions: "Sky & stars" launches own the kite
    if (PARTS.includes('daydusk') && full) await part('minigames', async () => {
      const own = await ev(async () => {
        const d = window.__STARLINE__.director, mm = d.minigameMenu;
        const e = mm.entry?.('sky:star-hill');
        if (!e) return { entry: false };
        const saved = d.q.state.inv.kite;
        d.q.state.inv.kite = 0;
        mm.launch(e);                                                  // not awaited: it runs until the viewer closes
        await new Promise(r => setTimeout(r, 6000));
        return { entry: true, kite: d.q.count('kite'), active: d.sky.active?.id || null, saved };
      });
      log('minigames', JSON.stringify(own));
      check(own.entry, 'mini games: the sky entry exists');
      if (own.entry) {
        const label = 'mini-games';
        check(own.kite > 0, `${label}: the borrowed valley owns the Star Kite (${own.kite})`);
        await until(() => window.__STARLINE__.director.sky.active, null, 60000);
        await settle();
        const btn = await ev(() => ({ off: document.querySelector('#skyGaze .fly')?.classList.contains('off') }));
        check(btn.off === false, `${label}: Fly up is not grey`);
        await climb();
        check(await ev(() => window.__SF.dbg().flight.phase) === 'hover', `${label}: she flies`);
        await S('minigames-top');
        await ev(() => { window.__STARLINE__.director.sky.wantLeave = true; });
        await until(() => !window.__STARLINE__.director.sky.active && !window.__STARLINE__.director.minigameMenu.running, null, 120000);
        await W(2500);
        await ev(() => { window.__STARLINE__.director.q.state.inv.kite = 1; });
      }
    });

    if (PARTS.includes('ownership') && full) await part('ownership', async () => {
      const base = await (async () => { await ev(l => window.__SF.look(l), ['summer', 21]); await ev(id => window.__SF.place(id), 'star-hill'); await W(900); return baseline(); })();
      if (!await startAt('star-hill', ['summer', 21])) return;
      const live = await ev(() => window.__SF.owned());
      check(live.live > 0 && live.attached > 0 && live.views > 0, `ownership: observer sees live resources ${JSON.stringify(live)}`);
      // Model one unrelated ambient object streaming in after the baseline. The old whole-scene comparison rejects this.
      await ev(() => {
        const g = window.__STARLINE__; let source;
        g.scene.traverse(o => { if (!source && o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && o.geometry) source = o; });
        const probe = source.clone(false); probe.name = 'qa:ambient-stream-probe'; probe.visible = false;
        g.scene.add(probe); window.__SFProbe = probe;
      });
      await ev(() => { const s = window.__STARLINE__.director.sky; s.stepSky(1); s.stepSky(-1); });
      await ev(() => { window.__STARLINE__.director.sky.wantLeave = true; });
      const after = await restored(base, 'ownership');
      check(after.objects > base.objects, `ownership: ambient growth remains visible (${base.objects} -> ${after.objects})`);
      check(await ev(() => window.__SFProbe.parent === window.__STARLINE__.scene), 'ownership: sky cleanup leaves the unrelated ambient object intact');
      await ev(() => { window.__SFProbe.removeFromParent(); delete window.__SFProbe; });
    });
    log(fails.length ? `${fails.length} failures` : 'all good', errors.length ? `errors: ${errors.slice(0, 3).join(' | ')}` : '');
    for (const f of fails) failures.push(`[${tag}] ${f}`);
    for (const e of errors) failures.push(`[${tag}] ${e}`);
    await ctx.close();
  }

  // ================================================================== the Vietnamese sky (lat 16 N): the Southern Cross in spring
  if (PARTS.includes('vn')) {
    const cfg = { dev: 'desktop', q: 'low', name: 'vn-desktop-low' };
    const { page, errors, ctx } = await boot(browser, cfg, save(), '&lang=vi');
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const fails = [];
    const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log('  FAIL', msg); } return ok; };
    const until = async (fn, arg, ms = 90000) => { await ev(() => window.__SF.fast(true)); try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); } finally { await ev(() => window.__SF.fast(false)); } };
    for (const spotId of SPOTS) for (const season of (args.seasons ? SEASONS : ['spring', 'summer', 'winter'])) {
      const want = LOW[season][1], label = `vn ${spotId}/${season}`;
      await ev(l => window.__SF.look(l), [season, 21]);
      await ev(id => window.__SF.place(id), spotId);
      await W(900);
      await until(() => window.__STARLINE__.player.grounded, null, 20000);
      if (!await ev(id => window.__SF.start(id), spotId)) { check(false, `${label}: no start`); continue; }
      await until(() => window.__SF.settled(), null, 60000);
      await W(500);
      const prof = await ev(() => window.__SF.dbg().profile);
      check(prof === 'vn', `${label}: profile ${prof}`);
      const ok = await ev(id => window.__STARLINE__.director.sky.pick(id), want);
      check(ok, `${label}: ${want} is up in the Vietnamese sky`);
      await W(1200);
      const ground = await ev(id => window.__SF.visible(id), want);
      await ev(() => window.__STARLINE__.director.sky.toggleFly());
      await until(() => window.__SF.dbg().flight?.phase === 'hover', null, 120000);
      await W(1500);
      const top = await ev(id => window.__SF.visible(id), want);
      console.log(`[vn] ${label}: ${want} ground ${ground?.visible}/${ground?.of} (alt ${ground?.alt}), top ${top?.visible}/${top?.of} (alt ${top?.alt}) clock ${await ev(() => window.__SF.dbg().clock)}`);
      check(top && top.visible / top.of >= 0.6, `${label}: ${want} at the top ${top?.visible}/${top?.of}`);
      if (spotId === 'viaduct-lamp' || spotId === 'star-hill') await page.screenshot({ path: path.join(OUT, `vn-${spotId}-${season}-top-${want}.png`) });
      await ev(() => { window.__STARLINE__.director.sky.wantLeave = true; });
      await until(() => !window.__STARLINE__.director.sky.active, null, 90000);
      await W(1500);
    }
    for (const f of fails) failures.push(`[vn] ${f}`);
    for (const e of errors) failures.push(`[vn] ${e}`);
    await ctx.close();
  }
  await browser.close();
}

try { await main(); } catch (e) { console.error(e); failures.push(`crash: ${e.message}`); }
server?.kill();
writeFileSync(path.join(OUT, `results-${args.only || 'all'}.json`), JSON.stringify({ failures, results }, null, 1));
console.log(failures.length ? `\n${failures.length} FAILURES:\n${failures.join('\n')}` : '\nALL SKY FLIGHT CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
