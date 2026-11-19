// Weather moments (src/game/moments.js, docs/WEATHER-MOMENTS.md) in a real browser, on a phone (390x844, touch, Low).
//   GAME_URL=http://127.0.0.1:5931/ node tests/moments-browser.mjs        (SHOTS=dir also saves one screenshot per moment)
// For each moment: no new shader program, at most two more draw calls while it runs and none six seconds after, the
// light pool unchanged, no console errors. The rainbow's apex and the flock are on screen in the default camera, the
// arch on the side away from the sun; the shower's cloud cover rises and is handed back. Entering a house, stop(),
// the tour's lock and a round each end it within half a second; photo mode freezes it. Settings, "Falling petals..."
// and ?moments=off keep it off (the last never fetches the code). The 17:00 bell rings three times and lifts the crows.
// The update costs little with the CPU slowed 8x.
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL || 'http://127.0.0.1:5931/';
const shots = process.env.SHOTS || '';
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } else log('  ok', msg); return ok; };
const Q = '?mute&qa=1&quality=low&start=explore&slot=explore&pace=off';
const ON = Q + '&moments=on&momentseed=1';
if (shots) fs.mkdirSync(shots, { recursive: true });

const ready = () => {
  const g = window.__STARLINE__, d = g?.director;
  return !!(window.__STARLINE_PLAYING__ && d?.quest && d.minigameMenu?.canOpen() && !g.ui.dialogueOpen && !g.follow.shot && !g.follow.tracking && !g.paused);
};

/** Page side: the look (season, hour), a place and a heading ('anti': away from the sun), the camera at rest. */
const setScene = async ([season, hour, x, z, yaw]) => {
  const g = window.__STARLINE__, qa = window.__STARLINE_QA__;
  if (g.moments) g.moments.sched.wait = 1e9;          // (no moment of its own choosing in the middle of a check)
  g.seasonOverride = season; g.timeOverride = hour; g.cycleHour = undefined; g.applyLook();
  qa.teleport(x, z);
  await new Promise(r => setTimeout(r, 700));
  const s = g.world.sky.state.sunDir;
  const y = yaw === 'anti' ? Math.atan2(-s.x, -s.z) : yaw;
  g.follow.yaw = y; g.player.facing = y; g.follow.pitch = 0.3;
  await new Promise(r => setTimeout(r, 900));
};

/** Page side: what can be measured each frame. */
const probe = () => {
  const g = window.__STARLINE__, C = g.celebrate, M = window.__STARLINE_QA__.moments, fx = M.fx;
  let lights = 0; g.scene.traverse(o => { if (o.isLight) lights++; });
  // the draws the moments add: each of these is one draw when shown (none casts a shadow)
  const extra = [C.glow.points, C.solid.points, fx.rainbow.mesh, fx.flock.mesh].filter(o => o.visible).length;
  return { programs: g.renderer.renderer.info.programs.length, calls: g.lastInfo?.calls || 0, lights, pool: g.lights.lights.length, extra, s: M.state(), cover: g.world.cover };
};

/** Page side: frames of draw calls (min: the frames without the shadow pass, which is drawn every other frame on Low). */
const callsOver = n => new Promise(res => {
  const g = window.__STARLINE__, out = [];
  const tick = () => { out.push(g.lastInfo?.calls || 0); if (out.length >= n) res({ min: Math.min(...out), max: Math.max(...out) }); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

/** Page side: is the rainbow apex / the flock's middle on screen (and the arch away from the sun)? */
const inView = () => {
  const g = window.__STARLINE__, M = window.__STARLINE_QA__.moments, fx = M.fx, cam = g.camera, V = cam.position.constructor;
  const ap = M.apex();
  let p = null;
  if (ap) p = new V(...ap);
  else if (fx.flock.mesh.visible) {
    p = new V(); const a = fx.flock.mesh.instanceMatrix.array, n = fx.flock.mesh.count;
    for (let i = 0; i < n; i++) { p.x += a[i * 16 + 12] / n; p.y += a[i * 16 + 13] / n; p.z += a[i * 16 + 14] / n; }
  }
  if (!p) return null;
  const s = g.world.sky.state.sunDir, away = (p.x - cam.position.x) * s.x + (p.z - cam.position.z) * s.z < 0;
  const q = p.clone().project(cam);
  return { on: Math.abs(q.x) < 1 && Math.abs(q.y) < 1 && q.z < 1, away, ndc: [+q.x.toFixed(2), +q.y.toFixed(2)] };
};

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const boot = async q => {
    await page.goto(url + q, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(ready, null, { timeout: 240000, polling: 250 });
    await page.waitForTimeout(2000);
    await page.waitForFunction(ready, null, { timeout: 60000, polling: 250 });
  };
  const wait = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });
  const shot = async name => { if (shots) await page.screenshot({ path: `${shots}/moments-${name}.png` }); };

  log('--- phone 390x844, Low');
  await boot(ON);
  check(await page.evaluate(() => !!window.__STARLINE__.moments && !!window.__STARLINE_QA__.moments), 'the moments are loaded (?moments=on under ?qa)');
  check(await page.evaluate(() => window.__STARLINE__.world.cover === undefined), 'the sky keeps its own cloud cover while nothing happens');

  // ------------------------------------------------------------------ the hourly bell at 17:00 (the bell moment)
  log('bell');
  await page.evaluate(setScene, ['summer', 16.99, 108, 12, 2.2]);
  const base0 = await page.evaluate(probe);
  await page.evaluate(() => {
    const g = window.__STARLINE__; window.__BELLS__ = 0;
    const bell = g.audio.bell.bind(g.audio); g.audio.bell = () => { window.__BELLS__++; bell(); };
    window.__STARLINE_QA__.moments.stop(true);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__STARLINE__.timeOverride = 17.01; });
  await wait(() => window.__BELLS__ >= 1, null, 3000).catch(() => {});
  const lifted = await page.evaluate(() => window.__STARLINE__.director.wildlife.flocks.filter(b => b.lift > 0).length);
  const bellState = await page.evaluate(() => window.__STARLINE_QA__.moments.state());
  await page.waitForTimeout(5200);
  const bells = await page.evaluate(() => window.__BELLS__);
  check(bells === 3, `16:59 -> 17:00 by the tower: ${bells} tolls (the hour's own and two more)`);
  check(bellState.id === 'bell' && lifted === 9, `it is the evening bell moment (${bellState.id}) and every crow lifts (${lifted} of 9)`);
  const bellEnd = await page.evaluate(probe);
  check(bellEnd.programs === base0.programs && bellEnd.pool === base0.pool && bellEnd.lights === base0.lights, `bell: no new program (${base0.programs} -> ${bellEnd.programs}), lights unchanged`);
  await wait(() => !window.__STARLINE__.moments.run, null, 8000).catch(() => {});          // (the bell moment is 8 s)
  await page.evaluate(() => { window.__STARLINE__.timeOverride = 17.6; });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__BELLS__ = 0; window.__STARLINE__.timeOverride = 18.01; });
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({ bells: window.__BELLS__, s: window.__STARLINE_QA__.moments.state() }));
  check(after.bells === 1 && after.s.id === '' && after.s.perSession.bell === 1, `18:00 (the bell moment on its cooldown): one toll, no moment (${after.bells}, '${after.s.id}', ${after.s.perSession.bell} bell)`);

  // ------------------------------------------------------------------ each moment: programs, draws, lights, errors
  const MOMENTS = [
    { name: 'gust-spring', id: 'gust', scene: ['spring', 10, -2, 34, 2.6], sample: 2.5 },
    { name: 'gust-winter', id: 'gust', scene: ['winter', 10, -2, 34, 2.6], sample: 2.5 },
    { name: 'swallows', id: 'birds', scene: ['summer', 10, -2, 34, 2.6], sample: 6, view: [1, 10] },
    { name: 'geese', id: 'birds', scene: ['autumn', 10, -2, 34, 'anti'], sample: 9, view: [3, 22], until: 22 },
    { name: 'shower', id: 'shower', scene: ['spring', 8, -2, 34, 'anti'], sample: 18, view: [15, 26], cover: true, until: 26 },
    { name: 'sparkle', id: 'sparkle', scene: ['winter', 9, -2, 34, 2.6], sample: 8, until: 10 },
  ];
  for (const m of MOMENTS) {
    log(m.name);
    await page.evaluate(setScene, m.scene);
    await page.waitForTimeout(6000);                   // (the last moment's sprites have all landed)
    const base = await page.evaluate(probe), baseCalls = await page.evaluate(callsOver, 40);
    const started = await page.evaluate(id => window.__STARLINE_QA__.moments.start(id, { force: true }), m.id);
    if (!check(started === true, `${m.name}: starts (${started})`)) continue;
    let views = 0, on = 0, away = true, coverUp = false;
    let during = null, duringCalls = null;
    const dur = await page.evaluate(() => window.__STARLINE__.moments.run.dur);
    const end = Date.now() + (dur + 1.5) * 1000;
    while (Date.now() < end) {
      const s = await page.evaluate(() => window.__STARLINE_QA__.moments.state());
      if (!s.active) break;
      if (m.cover && (await page.evaluate(() => window.__STARLINE__.world.cover)) > 0.6) coverUp = true;
      if (m.view && s.t >= m.view[0] && s.t <= m.view[1]) {
        const v = await page.evaluate(inView);
        if (v) { views++; if (v.on) on++; if (m.id === 'shower' && !v.away) away = false; }
      }
      if (!during && s.t >= m.sample) {
        during = await page.evaluate(probe); duringCalls = await page.evaluate(callsOver, 30);
        await shot(m.name);
      }
      // (the rest of a long one is more of the same: it is ended gently, which is checked too)
      if (m.until && s.t >= m.until) { await page.evaluate(() => window.__STARLINE_QA__.moments.stop(false)); break; }
      await page.waitForTimeout(400);
    }
    if (!check(!!during, `${m.name}: measured while it ran`)) continue;
    check(during.programs === base.programs, `${m.name}: no new shader program (${base.programs} -> ${during.programs})`);
    check(during.extra - base.extra <= 2, `${m.name}: ${during.extra - base.extra} more draw(s) from the moment (at most 2)`);
    log(`    draw calls (frames without the shadow pass) ${baseCalls.min} -> ${duringCalls.min}`);
    check(duringCalls.min - baseCalls.min <= 2 + 4, `${m.name}: the frame's draws rise by ${duringCalls.min - baseCalls.min} (2 + people walking about)`);
    check(during.pool === base.pool && during.lights === base.lights, `${m.name}: lights unchanged (${base.lights} -> ${during.lights})`);
    if (m.view) check(views >= 5 && on / views >= 0.5, `${m.name}: on screen in ${on} of ${views} samples`);
    if (m.id === 'shower') { check(during.s.arc, 'shower at 8:00 in spring: a rainbow'); check(away, 'the arch is on the side away from the sun'); check(coverUp, 'the clouds thicken'); }
    await wait(() => !window.__STARLINE_QA__.moments.state().active && !window.__STARLINE__.moments.run, null, 8000).catch(() => {});
    await page.waitForTimeout(6000);
    const done = await page.evaluate(probe);
    check(done.extra === base.extra, `${m.name}: 6 s after, its draws are gone (${done.extra - base.extra})`);
    if (m.cover) check(done.cover === undefined, 'the cloud cover is handed back');
  }

  // ------------------------------------------------------------------ fast stops
  // (act / undo: page-side code with g = the game, qa = the QA helpers)
  const run = code => page.evaluate(code => new Function('g', 'qa', `return (async () => { ${code} })()`)(window.__STARLINE__, window.__STARLINE_QA__), code);
  const fastStop = async (label, act, undo) => {
    await page.evaluate(setScene, ['spring', 8, -2, 34, 'anti']);
    const st = await page.evaluate(() => window.__STARLINE_QA__.moments.start('shower', { force: true }));
    if (!check(st === true, `${label}: a shower starts (${st})`)) return;
    await page.waitForTimeout(1500);
    const ms = await page.evaluate(async act => {
      const M = window.__STARLINE_QA__.moments, t = performance.now();
      new Function('g', 'qa', act)(window.__STARLINE__, window.__STARLINE_QA__);
      while (M.state().active && performance.now() - t < 2000) await new Promise(r => requestAnimationFrame(r));
      return performance.now() - t;
    }, act);
    check(ms <= 500, `${label}: stopped in ${Math.round(ms)} ms`);
    // (the fade is 0.4 s of game time; a room being unpacked can hold the frames up a little)
    const back = await wait(() => window.__STARLINE__.world.cover === undefined && !window.__STARLINE__.moments.run, null, 3000).then(() => true, () => false);
    check(back, `${label}: all handed back`);
    if (undo) await run(undo).catch(e => log('  (undo)', e.message));
    await page.waitForTimeout(800);
  };
  log('fast stops');
  await fastStop('entering a house', "g.interiors.enter('cottage');", "await new Promise(r => { const w = () => (g.interiors.busy ? setTimeout(w, 100) : r()); w(); }); await g.interiors.exit();");
  await fastStop('qa.moments.stop', 'qa.moments.stop(true);');
  await fastStop("the tour's lock", 'g.director.tourLock = true;', 'g.director.tourLock = false;');
  await fastStop('a round', "g.roundLight.hold('moments-test');", "g.roundLight.release('moments-test');");

  // ------------------------------------------------------------------ photo mode freezes it
  log('freeze');
  await page.evaluate(setScene, ['spring', 8, -2, 34, 'anti']);
  await page.evaluate(() => window.__STARLINE_QA__.moments.start('shower', { force: true }));
  await page.waitForTimeout(2000);
  const opened = await page.evaluate(() => window.__STARLINE__.openPhoto('key'));
  if (check(opened === true, 'photo mode opens during a shower')) {
    const a = await page.evaluate(() => ({ t: window.__STARLINE_QA__.moments.state().t, u: window.__STARLINE__.celebrate.t }));
    await page.waitForTimeout(1200);
    const b = await page.evaluate(() => ({ t: window.__STARLINE_QA__.moments.state().t, u: window.__STARLINE__.celebrate.t }));
    check(a.t === b.t && a.u === b.u, `photo mode freezes it (t ${a.t} -> ${b.t}, sprite clock ${a.u.toFixed(2)} -> ${b.u.toFixed(2)})`);
    await page.evaluate(() => window.__STARLINE__.photo.exit());
    await page.waitForTimeout(800);
  }
  await page.evaluate(() => window.__STARLINE_QA__.moments.stop(true));
  await page.waitForTimeout(600);

  // ------------------------------------------------------------------ cost
  // The budget (docs/WEATHER-MOMENTS.md): idle 20 µs and a shower 150 µs a frame at 8x CPU. Two measures:
  //  - its own work: update() run 600-3000 times in a row on the live game (real state, real dt) at 1x, times 8 —
  //    held to the budget;
  //  - qa.moments.cost() in the running game with CDP's 8x throttle: printed, and held only to a loose ceiling.
  //    It adds the cold caches of a single call per frame and the throttler's pauses landing inside a 100 µs-grained
  //    timer, and swings by half from run to run (docs: "Cost").
  log('cost');
  await page.evaluate(setScene, ['spring', 8, -2, 34, 'anti']);
  const warm = await page.evaluate(() => {
    const M = window.__STARLINE__.moments, qa = window.__STARLINE_QA__.moments;
    const loop = n => { const t = performance.now(); for (let i = 0; i < n; i++) M.update(1 / 60); return (performance.now() - t) / n * 1000; };
    loop(300);
    const idle = loop(3000);
    qa.start('shower', { force: true });
    loop(120);
    const shower = loop(900);
    qa.stop(true);
    for (let i = 0; i < 60; i++) M.update(1 / 60);
    M.sched.wait = 1e9;
    return { idle, shower };
  });
  check(warm.idle * 8 <= 20, `idle, its own work: ${warm.idle.toFixed(2)} µs a frame (x8 = ${(warm.idle * 8).toFixed(1)}, at most 20)`);
  check(warm.shower * 8 <= 150, `a shower, its own work: ${warm.shower.toFixed(2)} µs a frame (x8 = ${(warm.shower * 8).toFixed(1)}, at most 150)`);
  await page.waitForTimeout(6000);                               // (the sprites of that burst land)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  await page.evaluate(() => window.__STARLINE_QA__.moments.resetCost());
  await page.waitForTimeout(6000);
  const idle = await page.evaluate(() => window.__STARLINE_QA__.moments.cost());
  await page.evaluate(() => window.__STARLINE_QA__.moments.start('shower', { force: true }));
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__STARLINE_QA__.moments.resetCost());
  await page.waitForTimeout(6000);
  const busy = await page.evaluate(() => window.__STARLINE_QA__.moments.cost());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  log(`    in the running game at 8x (qa cost): idle ${(idle * 1000).toFixed(1)} µs, shower ${(busy * 1000).toFixed(1)} µs a frame (budget 20 / 150)`);
  check(idle <= 0.15 && busy <= 0.5, 'in the running game at 8x: under the regression ceilings (150 µs idle, 500 µs in a shower)');
  await page.evaluate(() => window.__STARLINE_QA__.moments.stop(true));
  // the slowed CPU walked the Low governor down its ladder (two steps down, nothing starts: by design); a fresh one
  await page.evaluate(() => { const R = window.__STARLINE__.renderer; R.governor = new R.governor.constructor({ levels: R.governor.levels }); R.applyLevel(); });
  await page.waitForTimeout(600);

  // ------------------------------------------------------------------ the switches
  log('switches');
  await page.evaluate(setScene, ['spring', 10, -2, 34, 2.6]);
  await page.evaluate(() => window.__STARLINE_QA__.moments.start('gust', { force: true }));
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__STARLINE__; g.weatherOff = true; g.applyLook(); });
  await page.waitForTimeout(500);
  const wOff = await page.evaluate(() => ({ s: window.__STARLINE_QA__.moments.state(), r: window.__STARLINE_QA__.moments.start('gust', { force: true }) }));
  check(!wOff.s.active && wOff.r === 'weatherOff', `"Falling petals, leaves and snow" off: it stops and none starts (${wOff.r})`);
  await page.evaluate(() => { const g = window.__STARLINE__; g.weatherOff = false; g.applyLook(); });
  await page.evaluate(() => { const b = document.getElementById('optMoments'); b.checked = false; b.dispatchEvent(new Event('change')); });
  const sOff = await page.evaluate(() => ({ r: window.__STARLINE_QA__.moments.start('gust', { force: true }), saved: localStorage.getItem('starline-opt-moments') }));
  check(sOff.r === 'off' && sOff.saved === 'false', `Settings > Weather moments off: none starts (${sOff.r}), remembered (${sOff.saved})`);
  await page.evaluate(() => { const b = document.getElementById('optMoments'); b.checked = true; b.dispatchEvent(new Event('change')); });
  const back = await page.evaluate(() => window.__STARLINE_QA__.moments.start('gust', { force: true }));
  check(back === true, `switched back on: it plays again (${back})`);
  check(errors.length === 0, `no console errors (${errors.slice(0, 3).join(' | ')})`);

  await boot(Q + '&moments=off');
  await page.waitForTimeout(1500);
  // (dev: /src/game/moments.js and its two modules; a build: a moments-<hash>.js chunk. The Settings switch's tiny module
  // is part of the title page either way.)
  const off = await page.evaluate(() => ({ m: !!window.__STARLINE__.moments, fetched: performance.getEntriesByType('resource').map(e => e.name)
    .filter(n => /\/(moments|moment-fx|moments-rules)([.-][\w-]*)?\.js/.test(n) && !/moments-option/.test(n)) }));
  check(!off.m && off.fetched.length === 0, `?moments=off: nothing loaded (${off.fetched.join(', ') || 'no moments code fetched'})`);
  await boot(Q);
  await page.waitForTimeout(1500);
  check(await page.evaluate(() => !window.__STARLINE__.moments), 'a QA page without ?moments=on: no moments (every other suite stays as it was)');
  check(errors.length === 0, `no console errors after the reloads either (${errors.slice(0, 3).join(' | ')})`);
  await ctx.close();
} finally { await browser.close(); }

log(failures.length ? `${failures.length} FAILED` : 'all passed');
process.exit(failures.length ? 1 : 0);
