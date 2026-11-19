// Photo mode (src/game/photo-mode.js, src/ui/photo-ui.js, src/ui/photo-album.js) in a real browser.
//   GAME_URL=http://127.0.0.1:5917/ node tests/photo-mode-browser.mjs        (SHOTS=dir also saves screenshots there)
// On a phone (390x844, touch, 2x), a phone on its side (844x390) and a desktop (1280x720), in Explore: it costs no pass
// before or after; V and the pause menu open it (paused, HUD and silhouette hidden, the camera where play left it);
// a drag orbits and a pinch dollies; every control is 44 px or more, no text under 11 px, no sideways scroll; a filter
// turns its pass on and None off; a pose holds and leaving puts her clip, time and facing back; the shutter gives the card,
// a JPEG of the size fitShot says, the screen's size back and a file for Share; the album keeps the photo over a reload
// and deletes it through its card; a full album and a refusing storage only toast; a dialogue forces it closed; Esc
// from the pause menu's door leaves the pause menu open. Also: a journal opened while the code loads wins; upright the
// tray starts folded below Mika's feet and its tab bar stays put; tab labels never wrap; a two-finger drag moves the
// picture 1:1; the larger shot keeps the bloom size and scales sprites; no frame leaves a hole; captions fit whole in
// the language's font; Enter presses a keyboard-focused chip, Space shoots after a click; Ctrl+F stays the browser's;
// the kept grid shows as on; a shutter right before leaving keeps its photo; holding V to leave stays left; R3 held
// across the entry keeps it open; Tamo's motes come along; lost graphics land on the pause menu, still paused.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.GAME_URL || 'http://127.0.0.1:5917/';
const shots = process.env.SHOTS || '';
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } else log('  ok', msg); return ok; };
const Q = '?mute&qa=1&quality=low&start=explore&slot=explore';
if (shots) fs.mkdirSync(shots, { recursive: true });

const CONTEXTS = [
  { name: 'phone', opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
  { name: 'phone-landscape', opts: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
  { name: 'desktop', opts: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } },
];

/** Page side: is the game in free play, with photo mode allowed? */
const ready = () => {
  const g = window.__STARLINE__, d = g?.director;
  return !!(window.__STARLINE_PLAYING__ && d?.quest && d.minigameMenu?.canOpen() && !g.ui.dialogueOpen && !g.follow.shot && !g.follow.tracking && !g.paused);
};

/** Page side: the UI standard on photo mode's own controls. */
const audit = () => {
  const root = document.getElementById('photoMode'), bad = [];
  if (!root) return { bad: ['no #photoMode'], sw: 0, iw: innerWidth };
  for (const b of root.querySelectorAll('button')) {
    const r = b.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const name = (b.textContent || b.getAttribute('aria-label') || b.className).trim().slice(0, 24);
    if (r.width < 43.5 || r.height < 43.5) bad.push(`${name}: ${Math.round(r.width)}x${Math.round(r.height)}`);
    // (a chip scrolled out of the chips' own box is reached by scrolling it: only its sides must stay on screen)
    const box = b.closest('.ph-chips')?.getBoundingClientRect(), vert = !box || (r.bottom > box.top && r.top < box.bottom);
    if (r.left < -0.5 || r.right > innerWidth + 0.5 || (vert && (r.top < -0.5 || r.bottom > innerHeight + 0.5))) bad.push(`${name}: off screen`);
    if (b.scrollWidth > b.clientWidth + 1) bad.push(`${name}: text clipped`);
  }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement, r = el.getBoundingClientRect();
    if (!r.width) continue;
    let z = 1; for (let e = el; e; e = e.parentElement) z *= parseFloat(getComputedStyle(e).zoom) || 1;
    const px = parseFloat(getComputedStyle(el).fontSize) * z;
    if (px < 11) bad.push(`"${n.textContent.trim().slice(0, 20)}": ${px}px`);
  }
  return { bad, sw: document.documentElement.scrollWidth, iw: innerWidth };
};

/** Page side: on the Pose tab the toggles are in the chips' view, and the fade is on exactly when more chips are below. */
const poseTab = () => {
  const c = document.querySelector('#photoMode .ph-chips'), r = c.getBoundingClientRect(), bad = [];
  for (const k of ['face', 'tamo']) {
    const b = c.querySelector(`.ph-chip[data-kind="${k}"]`);
    if (!b) continue;
    const q = b.getBoundingClientRect();
    if (q.top < r.top - 0.5 || q.bottom > r.bottom + 0.5) bad.push(`${k} chip below the fold`);
  }
  const more = c.scrollHeight - c.scrollTop - c.clientHeight > 4;
  if (c.classList.contains('more') !== more) bad.push(`fade ${c.classList.contains('more')} with more ${more}`);
  return bad;
};

/** Page side: the four tabs' text on one line each (no label broken mid-word). */
const tabsOneLine = () => [...document.querySelectorAll('#photoMode .ph-tab')].filter(b => {
  const lh = parseFloat(getComputedStyle(b).lineHeight) || parseFloat(getComputedStyle(b).fontSize) * 1.1;
  const range = document.createRange(); range.selectNodeContents(b);
  return range.getClientRects().length > 1 || range.getBoundingClientRect().height > lh * 1.5;
}).map(b => b.textContent);

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  for (const C of CONTEXTS) {
    log(`--- ${C.name} ${C.opts.viewport.width}x${C.opts.viewport.height}`);
    const ctx = await browser.newContext({ ...C.opts, acceptDownloads: true });
    // a share sheet that records what it was given
    await ctx.addInitScript(() => {
      navigator.canShare = d => !!d?.files?.length;
      navigator.share = async d => { window.__SHARED__ = d.files.map(f => ({ name: f.name, type: f.type, size: f.size })); };
      try { if (!sessionStorage.getItem('photo-test-cleared')) { localStorage.removeItem('starline-shots-explore'); sessionStorage.setItem('photo-test-cleared', '1'); } } catch { /* fine */ }
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const touch = !!C.opts.hasTouch, cdp = touch ? await ctx.newCDPSession(page) : null;
    const boot = async () => {
      await page.goto(url + Q, { waitUntil: 'commit', timeout: 120000 });
      await page.waitForFunction(ready, null, { timeout: 240000, polling: 250 });
      await page.waitForTimeout(2500);
      await page.waitForFunction(ready, null, { timeout: 60000, polling: 250 });
    };
    await boot();
    const passes = () => page.evaluate(() => window.__STARLINE__.renderer.composer.passes.filter(p => p.enabled).length);
    const inMode = () => page.evaluate(() => !!document.getElementById('photoMode') && !!window.__STARLINE__.photo?.active);
    const tap = async sel => { const b = page.locator(sel).first(); if (touch) await b.tap(); else await b.click(); };
    const touchMove = async (from, to, steps = 10) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: from.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
      for (let s = 1; s <= steps; s++) {
        const k = s / steps;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: from.map((p, i) => ({ x: p.x + (to[i].x - p.x) * k, y: p.y + (to[i].y - p.y) * k, id: i })) });
        await page.waitForTimeout(30);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(150);
    };
    const W = C.opts.viewport.width, H = C.opts.viewport.height;
    // back in play, a few frames on (a key pressed in the very frame the game unpauses is read as paused input and lost)
    const settle = async () => { await page.waitForFunction(ready, null, { timeout: 30000, polling: 200 }); await page.waitForTimeout(300); };

    check(await passes() === 4 && !(await page.$('#photoMode')), `off: 4 enabled passes and no #photoMode (${await passes()})`);

    // ---------------------------------------------------------------- V, then J while photo mode's code is still on its way
    if (C.name === 'phone-landscape') {
      const slow = /\/src\/game\/photo-mode\.js/;
      await page.route(slow, async r => { await new Promise(res => setTimeout(res, 1500)); await r.continue(); });
      await page.keyboard.press('KeyV');
      await page.waitForTimeout(150);
      await page.keyboard.press('KeyJ');
      await page.waitForFunction(() => !!window.__STARLINE__.photo, null, { timeout: 20000 });
      await page.waitForTimeout(400);
      const late = await page.evaluate(() => ({ active: !!window.__STARLINE__.photo.active, overlay: window.__STARLINE__.ui.overlay, dom: !!document.getElementById('photoMode') }));
      check(!late.active && late.overlay === 'journal' && !late.dom, `a journal opened while photo mode loads stays open, photo mode does not (${JSON.stringify(late)})`);
      await page.unroute(slow);
      await page.evaluate(() => window.__STARLINE__.togglePause(false));
      await settle();
    }

    // ---------------------------------------------------------------- enter with V
    await page.keyboard.press('KeyV');
    await page.waitForFunction(() => window.__STARLINE__.photo?.active, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const entered = await page.evaluate(() => {
      const g = window.__STARLINE__, s = g.photo.saved, c = g.camera;
      return { paused: g.paused, hud: getComputedStyle(document.getElementById('hud')).visibility, sil: g.player.silhouette.on,
        moved: c.position.distanceTo(s.pos), turned: 1 - Math.abs(c.quaternion.dot(s.quat)), fov: Math.abs(c.fov - s.fov), fixed: g.renderer.fixedScale === g.renderer.scale };
    });
    if (shots) await page.screenshot({ path: path.join(shots, `${C.name}-enter.png`) });
    check(entered.paused && entered.hud === 'hidden' && entered.sil === false, `V enters: paused, HUD hidden, silhouette off (${JSON.stringify(entered)})`);
    check(entered.moved < 1e-3 && entered.turned < 1e-3 && entered.fov < 1e-3 && entered.fixed, 'the camera is where play left it, and the governor is held');
    const layer = await page.evaluate(() => { const c = document.querySelector('#photoMode .ph-frame'); return { w: c.width, h: c.height, shown: getComputedStyle(c).display !== 'none' }; });
    check(layer.w === 0 && layer.h === 0 && !layer.shown, `no frame and no grid: no frame layer at all (${JSON.stringify(layer)})`);
    if (C.name === 'phone') {
      // upright, the tray starts folded: its tabs and the shutter row, clear of Mika's feet
      const fold = await page.evaluate(() => {
        const g = window.__STARLINE__, tray = document.querySelector('#photoMode .ph-tray').getBoundingClientRect();
        const feet = g.player.pos.clone().project(g.camera), y = (1 - feet.y) / 2 * innerHeight;
        return { folded: document.querySelector('#photoMode .ph-tray').classList.contains('folded'), top: Math.round(tray.top), feet: Math.round(y) };
      });
      check(fold.folded && fold.top > fold.feet, `upright, the tray starts folded below Mika's feet (${JSON.stringify(fold)})`);
    }

    // ---------------------------------------------------------------- the UI standard, every tab
    const tabTops = [];
    for (const tab of ['pose', 'filter', 'frame', 'lens']) {
      await tap(`#photoMode .ph-tab[data-tab="${tab}"]`);
      await page.waitForTimeout(120);
      const a = await page.evaluate(audit);
      check(!a.bad.length && a.sw <= a.iw, `${tab} tab: controls >= 44 px, text >= 11 px, no sideways scroll (${a.bad.slice(0, 4).join('; ')} ${a.sw}/${a.iw})`);
      if (tab === 'pose') { const b = await page.evaluate(poseTab); check(!b.length, `the Pose tab's toggles are in view, the fade says when more is below (${b.join('; ')})`); }
      tabTops.push(await page.evaluate(() => Math.round(document.querySelector('#photoMode .ph-tabs').getBoundingClientRect().top)));
    }
    if (C.name === 'phone') check(new Set(tabTops).size === 1, `the tab bar stays put from tab to tab (${tabTops.join(', ')})`);
    const broken = await page.evaluate(tabsOneLine);
    check(!broken.length, `every tab label on one line (${broken.join(', ')})`);

    // ---------------------------------------------------------------- gestures
    const rig = () => page.evaluate(() => { const r = window.__STARLINE__.photo.rig; return { yaw: r.yaw, pitch: r.pitch, dist: r.dist }; });
    const r0 = await rig();
    if (touch) await touchMove([{ x: W * 0.3, y: H * 0.3 }], [{ x: W * 0.3 + 120, y: H * 0.3 + 30 }]);
    else { await page.mouse.move(W * 0.3, H * 0.3); await page.mouse.down(); await page.mouse.move(W * 0.3 + 150, H * 0.3 + 30, { steps: 8 }); await page.mouse.up(); }
    await page.waitForTimeout(200);
    const r1 = await rig();
    const camMoved = await page.evaluate(() => { const g = window.__STARLINE__; return g.camera.position.distanceTo(g.photo.saved.pos); });
    check(Math.abs(r1.yaw - r0.yaw) > 0.2 && camMoved > 0.1, `a drag orbits (yaw ${r0.yaw.toFixed(2)} -> ${r1.yaw.toFixed(2)}, camera ${camMoved.toFixed(2)} m)`);
    if (touch) await touchMove([{ x: W * 0.4, y: H * 0.35 }, { x: W * 0.6, y: H * 0.35 }], [{ x: W * 0.3, y: H * 0.35 }, { x: W * 0.7, y: H * 0.35 }]);
    else { await page.mouse.move(W * 0.4, H * 0.4); for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(40); } }
    await page.waitForTimeout(200);
    const r2 = await rig();
    check(r2.dist < r1.dist * 0.85, `${touch ? 'a two-finger pinch' : 'the wheel'} dollies in (${r1.dist.toFixed(2)} -> ${r2.dist.toFixed(2)} m)`);
    if (touch) {
      // a two-finger drag moves the picture with the fingers (Mika's chest, at the pivot's depth, stays under them)
      const chest = () => page.evaluate(() => {
        const g = window.__STARLINE__, v = g.player.pos.clone(); v.y += g.photo.pivotH();
        v.project(g.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
      });
      const c0 = await chest();
      await touchMove([{ x: W * 0.35, y: H * 0.3 }, { x: W * 0.65, y: H * 0.3 }], [{ x: W * 0.35 + 50, y: H * 0.3 }, { x: W * 0.65 + 50, y: H * 0.3 }], 8);
      await page.waitForTimeout(200);
      const c1 = await chest();
      check(Math.abs(c1.x - c0.x - 50) < 10 && Math.abs(c1.y - c0.y) < 10, `a two-finger drag of 50 px moves her ${Math.round(c1.x - c0.x)} x ${Math.round(c1.y - c0.y)} px`);
    }

    // ---------------------------------------------------------------- filters
    await tap('#photoMode .ph-tab[data-tab="filter"]');
    await tap('#photoMode .ph-chip[data-id="old"]');
    const on = await page.evaluate(() => window.__STARLINE__.renderer.photoPass.enabled);
    await tap('#photoMode .ph-chip[data-id="none"]');
    const off = await page.evaluate(() => window.__STARLINE__.renderer.photoPass.enabled);
    check(on === true && off === false && await passes() === 4, 'a filter turns the pass on, None turns it off');

    // ---------------------------------------------------------------- a pose
    const canPose = await page.evaluate(() => window.__STARLINE__.photo.canPose);
    if (check(canPose, 'Mika can be posed (standing in Explore)')) {
      await tap('#photoMode .ph-tab[data-tab="pose"]');
      await tap('#photoMode .ph-chip[data-id="wave"]');
      await page.waitForTimeout(150);
      const clip = await page.evaluate(() => { const a = window.__STARLINE__.player.anim; return { name: a.currentName, speed: a.current.timeScale }; });
      check(clip.name === 'Wave' && clip.speed === 0, `Wave holds her clip (${JSON.stringify(clip)})`);
      await tap('#photoMode .ph-chip[data-kind="face"]');
    }
    // the look for the screenshots: a filter and the polaroid frame
    await tap('#photoMode .ph-tab[data-tab="filter"]');
    await tap('#photoMode .ph-chip[data-id="golden"]');
    await tap('#photoMode .ph-tab[data-tab="frame"]');
    await tap('#photoMode .ph-chip[data-id="polaroid"]');
    await page.waitForTimeout(400);
    if (shots) await page.screenshot({ path: path.join(shots, `${C.name}-photo-mode.png`) });

    // ---------------------------------------------------------------- the shutter
    const layer2 = await page.evaluate(() => { const c = document.querySelector('#photoMode .ph-frame'); return { w: c.width, max: Math.round(innerWidth * Math.min(2, devicePixelRatio)) }; });
    check(layer2.w > 0 && layer2.w <= layer2.max, `with a frame the layer is drawn, at most 2x (${layer2.w} <= ${layer2.max})`);
    const before = await page.evaluate(async () => {
      const R = window.__STARLINE__.renderer, { U } = await import('/src/fx/cel-sprites.js');
      // what the shot's own drawing sees: the bloom's size and the sprites' pixel scale
      const rw = R.renderWorld, cw = R.renderer.domElement.width;
      window.__SHOT__ = null;
      R.renderWorld = function (...a) { if (this.renderer.domElement.width !== cw && !window.__SHOT__) window.__SHOT__ = { bw: this.bloom.renderTargetBright.width, us: U.uScale.value, pr: this.pixelRatio }; return rw.apply(this, a); };
      window.__UNSHOT__ = () => { R.renderWorld = rw; return { bw: R.bloom.renderTargetBright.width, us: U.uScale.value }; };
      return { cw, ch: R.renderer.domElement.height, pr: R.pixelRatio, fixed: R.fixedScale, bw: R.bloom.renderTargetBright.width, us: U.uScale.value };
    });
    await tap('#photoMode .ph-shutter');
    await page.waitForSelector('#photoMode .ph-card:not(.hidden)', { timeout: 15000 });
    const inShot = await page.evaluate(() => ({ shot: window.__SHOT__, after: window.__UNSHOT__() }));
    if (inShot.shot) {
      const k = inShot.shot.pr / before.pr;
      check(inShot.shot.bw === before.bw && Math.abs(inShot.shot.us - before.us * k) < 1e-6 * before.us && inShot.after.bw === before.bw && inShot.after.us === before.us,
        `the larger shot keeps the preview's bloom size and scales the sprites x${k.toFixed(2)}, both back after (${JSON.stringify({ before: { bw: before.bw, us: before.us }, ...inShot })})`);
    } else log('  (the shot is drawn at the screen\'s own size here: nothing to scale)');
    const after = await page.evaluate(async () => {
      const g = window.__STARLINE__, R = g.renderer, s = g.photo.lastShot;
      const { fitShot } = await import('/src/game/photo.js');
      const pr = fitShot({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1, cur: R.pixelRatio, touch: !!g.ui.touch, samples: R.q.msaa || 0, maxTex: R.renderer.capabilities.maxTextureSize });
      return { cw: R.renderer.domElement.width, ch: R.renderer.domElement.height, pr: R.pixelRatio, fixed: R.fixedScale, shot: s, want: { pr, w: Math.floor(innerWidth * pr), h: Math.floor(innerHeight * pr) },
        card: document.querySelector('#photoMode .ph-card').textContent };
    });
    check(after.cw === before.cw && after.ch === before.ch && after.pr === before.pr && after.fixed === before.fixed, `the screen's size is back after the shot (${before.cw}x${before.ch} @${before.pr})`);
    check(after.shot?.w === after.want.w && after.shot?.h === after.want.h && after.shot.kept === 'ok', `the shot is ${after.shot?.w}x${after.shot?.h} as fitShot says (${after.want.w}x${after.want.h} @${after.want.pr.toFixed(2)}), kept`);
    if (shots) { await page.waitForTimeout(900); await page.screenshot({ path: path.join(shots, `${C.name}-shot-card.png`) }); }   // (after the flash)
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), tap('#photoMode .ph-save')]);
    const name = dl.suggestedFilename(), file = await dl.path(), buf = fs.readFileSync(file), dim = jpegSize(buf);
    check(/^starline-\d{8}-\d{4}\.jpg$/.test(name), `Save picture downloads ${name}`);
    check(dim && dim.w === after.want.w && dim.h === after.want.h, `the file is a JPEG of ${dim?.w}x${dim?.h}`);
    if (shots) fs.copyFileSync(file, path.join(shots, `${C.name}-saved.jpg`));
    await tap('#photoMode .ph-share');
    await page.waitForTimeout(200);
    const shared = await page.evaluate(() => window.__SHARED__);
    check(shared?.[0]?.type === 'image/jpeg' && shared[0].size === buf.length, `Share hands over the JPEG file (${JSON.stringify(shared)})`);

    // ---------------------------------------------------------------- leaving puts everything back
    const back = await page.evaluate(() => {
      const g = window.__STARLINE__, s = g.photo.saved, p = g.player, a = p.anim;
      document.querySelector('#photoMode .ph-done').click();
      return { clip: a.currentName === s.clip, time: Math.abs((a.current?.time || 0) - s.time), facing: Math.abs(p.facing - s.facing), cam: g.camera.position.distanceTo(s.pos),
        paused: g.paused, dom: !!document.getElementById('photoMode'), fixed: g.renderer.fixedScale === s.fixedScale, cls: document.body.classList.contains('photo-mode') };
    });
    check(back.clip && back.time < 1e-3 && back.facing < 1e-6 && back.cam < 1e-6, `Done puts her clip, time, facing and the camera back (${JSON.stringify(back)})`);
    check(!back.paused && !back.dom && back.fixed && !back.cls, 'and play resumes with the DOM gone');
    await page.waitForTimeout(300);
    check(await passes() === 4, 'after leaving: 4 enabled passes again');
    if (C.name === 'phone') check(await page.evaluate(() => !!(window.__STARLINE__.player.silhouette.on)), 'the follow camera turns the silhouette back on');

    // ---------------------------------------------------------------- the pause menu's door, and Esc back to it
    await settle();
    await page.evaluate(() => window.__STARLINE__.togglePause(true));
    await page.waitForSelector('#btnPausePhoto:not(.hidden)', { timeout: 5000 });
    await tap('#btnPausePhoto');
    await page.waitForFunction(() => window.__STARLINE__.photo?.active, null, { timeout: 10000 });
    check(await page.evaluate(() => document.getElementById('pause').classList.contains('hidden')), 'the pause button enters, the menu steps aside');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const esc = await page.evaluate(() => ({ pause: !document.getElementById('pause').classList.contains('hidden'), overlay: window.__STARLINE__.ui.overlay, paused: window.__STARLINE__.paused, dom: !!document.getElementById('photoMode'), focus: document.activeElement?.id }));
    check(esc.pause && esc.overlay === 'pause' && esc.paused && !esc.dom, `Esc from the pause menu's door leaves the pause menu open (${JSON.stringify(esc)})`);
    await page.evaluate(() => window.__STARLINE__.togglePause(false));
    await settle();

    // ---------------------------------------------------------------- the album (the phone and the desktop)
    if (C.name !== 'phone-landscape') {
      const album = () => page.evaluate(() => { const g = window.__STARLINE__; g.ui.openJournal(); g.ui.journalTab('album'); return document.querySelectorAll('#albumShots .polaroid.shot').length; });
      check(await album() === 1, 'the Album tab shows the photo');
      await page.evaluate(() => document.getElementById('albumShots').scrollIntoView());
      await page.waitForTimeout(300);
      if (shots) await page.screenshot({ path: path.join(shots, `${C.name}-album.png`) });
      const aa = await page.evaluate(() => { const r = document.querySelector('#albumShots .shot-del').getBoundingClientRect(); return { w: r.width, h: r.height, sw: document.documentElement.scrollWidth }; });
      check(aa.w >= 44 && aa.h >= 44 && aa.sw <= W, `the delete button is ${aa.w}x${aa.h}, no sideways scroll`);
      await boot();
      check(await album() === 1, 'still there after a reload');
      await tap('#albumShots .shot-del');
      await page.waitForSelector('#albumShots .shot-ask', { timeout: 3000 });
      if (shots) await page.screenshot({ path: path.join(shots, `${C.name}-album-delete.png`) });
      await tap('#albumShots .confirm-yes');
      await page.waitForTimeout(200);
      const gone = await page.evaluate(() => ({ n: document.querySelectorAll('#albumShots .polaroid.shot').length, empty: !!document.querySelector('#albumShots .shots-empty'), stored: localStorage.getItem('starline-shots-explore') }));
      check(gone.n === 0 && gone.empty && !/data:image/.test(gone.stored || ''), 'deleting through the card leaves none');
      await page.evaluate(() => window.__STARLINE__.togglePause(false));
      await settle();
    }

    // ---------------------------------------------------------------- every frame covers the picture where it draws (no holes in a JPEG)
    if (C.name === 'phone') {
      const holes = await page.evaluate(async () => {
        const { drawFrame } = await import('/src/ui/photo-frame.js'), { FRAMES } = await import('/src/game/photo.js'), bad = [];
        for (const f of FRAMES) {
          const c = document.createElement('canvas'); c.width = 780; c.height = 1688;
          const ctx = c.getContext('2d'); ctx.fillStyle = '#28a03c'; ctx.fillRect(0, 0, 780, 1688);
          drawFrame(ctx, 780, 1688, f.id, 'Kawabe · Spring');
          const d = ctx.getImageData(0, 0, 780, 1688).data;
          let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) n++;
          if (n) bad.push(`${f.id}: ${n} px see-through`);
          c.width = 0;
        }
        return bad;
      });
      check(!holes.length, `drawn over a photo, no frame leaves a hole (${holes.join('; ')})`);
    }

    // ---------------------------------------------------------------- the desktop's keys, the pad, a shutter right before leaving
    if (C.name === 'desktop') {
      const count = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('starline-shots-explore'))?.list?.length || 0; } catch { return 0; } });
      const open = async () => { await page.keyboard.press('KeyV'); await page.waitForFunction(() => window.__STARLINE__.photo?.active, null, { timeout: 10000 }); await page.waitForTimeout(150); };
      const n0 = await count();
      await open();
      // Enter on a chip reached with the keyboard presses it, and takes no photo
      await page.evaluate(() => window.__STARLINE__.photo.ui.showTab('pose'));
      await page.focus('#photoMode .ph-chip[data-kind="face"]');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const kb = await page.evaluate(() => ({ face: window.__STARLINE__.photo.choice.face, job: !!window.__STARLINE__.photo.job }));
      check(kb.face && !kb.job && await count() === n0, `Enter on a focused chip presses it and takes no photo (${JSON.stringify(kb)})`);
      // a mouse click leaves no focus behind: Space is the shutter again
      await page.click('#photoMode .ph-grid');
      await page.keyboard.press('Space');
      await page.waitForSelector('#photoMode .ph-card:not(.hidden)', { timeout: 15000 });
      const ms = await page.evaluate(() => ({ grid: window.__STARLINE__.photo.choice.grid, body: document.activeElement === document.body }));
      check(ms.grid && ms.body && await count() === n0 + 1, `after a click on Grid, Space takes the photo (${JSON.stringify(ms)})`);
      // Ctrl+F is the browser's (find), not the next filter
      const f0 = await page.evaluate(() => window.__STARLINE__.photo.choice.filter);
      await page.keyboard.press('Control+KeyF');
      check(await page.evaluate(() => window.__STARLINE__.photo.choice.filter) === f0, 'Ctrl+F leaves the filter alone');
      // leave, come back: the grid kept from last time shows as on
      await page.keyboard.press('Escape');
      await settle();
      await open();
      check(await page.evaluate(() => document.querySelector('#photoMode .ph-grid').getAttribute('aria-pressed')) === 'true', 'the Grid button shows the kept grid as on');
      await page.keyboard.press('KeyG');
      // the shutter and leaving at once: the photo is still taken and kept, with a word that it is in the album
      await page.evaluate(() => { document.getElementById('toasts').innerHTML = ''; const p = window.__STARLINE__.photo; p.shutter(); p.exit(); });
      await page.waitForFunction(n => { try { return JSON.parse(localStorage.getItem('starline-shots-explore')).list.length > n; } catch { return false; } }, n0 + 1, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(100);
      const quick = { n: await count(), toast: await page.evaluate(() => document.getElementById('toasts').textContent) };
      check(quick.n === n0 + 2 && /In your album/.test(quick.toast), `a shutter pressed just before leaving keeps its photo (${JSON.stringify(quick)})`);
      await settle();
      // holding V to leave: its key repeats do not open photo mode again
      await open();
      await page.keyboard.down('KeyV');
      await page.waitForTimeout(120);
      await page.keyboard.down('KeyV');
      await page.waitForTimeout(60);
      await page.keyboard.down('KeyV');
      await page.keyboard.up('KeyV');
      await page.waitForTimeout(400);
      const held = await page.evaluate(() => ({ active: window.__STARLINE__.photo.active, paused: window.__STARLINE__.paused }));
      check(!held.active && !held.paused, `holding V to leave stays left (${JSON.stringify(held)})`);
      await settle();
      // R3 held across the entry (the pad's own way in) does not close it again on the next frame
      await page.evaluate(() => {
        window.__PAD__ = { id: 'test pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 11, value: i === 11 ? 1 : 0 })) };
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__PAD__] });
      });
      await page.waitForFunction(() => window.__STARLINE__.photo?.active, null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      const pad = await page.evaluate(() => ({ active: window.__STARLINE__.photo.active, paused: window.__STARLINE__.paused }));
      await page.evaluate(() => { for (const b of window.__PAD__.buttons) { b.pressed = false; b.value = 0; } });
      await page.waitForTimeout(150);
      await page.evaluate(() => Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] }));
      check(pad.active && pad.paused, `R3 held across the entry leaves photo mode open (${JSON.stringify(pad)})`);
      if (pad.active) await page.keyboard.press('Escape');
      await settle();
      // Tamo joins: his lamp motes come along
      const tamo = await page.evaluate(async () => {
        const g = window.__STARLINE__, t = g.director?.tamo;
        if (!t || t.hidden || !t.motes?.some(s => s.visible)) return null;
        await g.openPhoto('key');
        g.photo.setTamo(true);
        const far = Math.max(...t.motes.filter(s => s.visible).map(s => s.position.distanceTo(t.pos)));
        g.photo.exit();
        return { far };
      });
      if (tamo) check(tamo.far < 0.6, `Tamo's motes come along when he joins (farthest ${tamo.far.toFixed(2)} m)`);
      else log('  (no lamp motes around Tamo in this save: skipped)');
      await settle();
      await page.evaluate(() => localStorage.removeItem('starline-shots-explore'));
    }

    // ---------------------------------------------------------------- a full album, a refusing storage (the desktop)
    if (C.name === 'desktop') {
      const toastAfterShot = async () => {
        await page.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
        await page.keyboard.press('KeyV');
        await page.waitForFunction(() => window.__STARLINE__.photo?.active, null, { timeout: 10000 });
        await page.keyboard.press('Space');
        await page.waitForSelector('#photoMode .ph-card:not(.hidden)', { timeout: 15000 });
        const t = await page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(x => x.textContent).join(' | '));
        await page.keyboard.press('Escape');
        await settle();
        return t;
      };
      await page.evaluate(() => {
        const list = Array.from({ length: 12 }, (_, i) => ({ id: `seed${i}`, t: i, url: 'data:image/jpeg;base64,/9j/', w: 16, h: 9, filter: 'none', frame: 'none', place: 'Kawabe', season: 'spring' }));
        localStorage.setItem('starline-shots-explore', JSON.stringify({ v: 1, list }));
      });
      const full = await toastAfterShot();
      check(/holds 12 photos/.test(full), `a full album only toasts (${full})`);
      check(await page.evaluate(() => JSON.parse(localStorage.getItem('starline-shots-explore')).list.length) === 12, 'and keeps its 12');
      await page.evaluate(() => {
        localStorage.removeItem('starline-shots-explore');
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('starline-shots')) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return set.call(this, k, v); };
      });
      const quota = await toastAfterShot();
      check(/storage is full/.test(quota), `a refusing storage toasts (${quota})`);

      // ---------------------------------------------------------------- a dialogue forces it closed
      await page.keyboard.press('KeyV');
      await page.waitForFunction(() => window.__STARLINE__.photo?.active, null, { timeout: 10000 });
      await page.evaluate(() => { window.__STARLINE__.ui.dialogue([['mika', 'Hello!']]); });
      await page.waitForFunction(() => !window.__STARLINE__.photo.active, null, { timeout: 5000 }).catch(() => {});
      const forced = await page.evaluate(() => ({ active: window.__STARLINE__.photo.active, dom: !!document.getElementById('photoMode'), paused: window.__STARLINE__.paused }));
      check(!forced.active && !forced.dom && !forced.paused, `a dialogue opening forces photo mode closed (${JSON.stringify(forced)})`);
      await page.evaluate(() => window.__STARLINE__.ui.nav?.('skip'));

      // ---------------------------------------------------------------- lost graphics from the pause menu's door: still paused, on the pause menu
      if (await page.waitForFunction(ready, null, { timeout: 20000, polling: 200 }).then(() => true, () => false)) {
        await page.waitForTimeout(300);
        await page.evaluate(() => window.__STARLINE__.togglePause(true));
        await tap('#btnPausePhoto');
        await page.waitForFunction(() => window.__STARLINE__.photo?.active, null, { timeout: 10000 });
        await page.evaluate(() => window.__STARLINE__.renderer.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext());
        await page.waitForFunction(() => !window.__STARLINE__.photo.active, null, { timeout: 5000 }).catch(() => {});
        const lost = await page.evaluate(() => ({ active: window.__STARLINE__.photo.active, paused: window.__STARLINE__.paused, overlay: window.__STARLINE__.ui.overlay }));
        check(!lost.active && lost.paused && lost.overlay === 'pause', `lost graphics close photo mode onto the pause menu, still paused (${JSON.stringify(lost)})`);
      } else log('  (the dialogue did not close: lost-graphics check skipped)');
    }

    // ---------------------------------------------------------------- not now: the toast
    if (C.name === 'phone-landscape') {
      // (a room change in progress stands in for anything that owns the camera)
      await page.evaluate(() => { window.__STARLINE__.interiors.busy = true; document.getElementById('toasts').innerHTML = ''; });
      await page.keyboard.press('KeyV');
      await page.waitForTimeout(300);
      const no = await page.evaluate(() => ({ active: !!window.__STARLINE__.photo?.active, toast: document.getElementById('toasts').textContent }));
      await page.evaluate(() => { window.__STARLINE__.interiors.busy = false; });
      check(!no.active && /isn't available/.test(no.toast), `while something owns the camera V only toasts (${no.toast})`);
    }

    // ---------------------------------------------------------------- the other languages fit too (the phones)
    if (touch) {
      for (const lang of ['vi', 'ko', 'ja']) {
        await page.evaluate(l => import('/src/i18n/i18n.js').then(m => m.setLang(l)), lang);
        await settle();
        await page.keyboard.press('KeyV');
        await page.waitForFunction(() => window.__STARLINE__.photo?.active, null, { timeout: 10000 });
        const bad = [];
        for (const tab of ['pose', 'filter', 'frame', 'lens']) {
          await tap(`#photoMode .ph-tab[data-tab="${tab}"]`);
          await page.waitForTimeout(80);
          const a = await page.evaluate(audit);
          bad.push(...a.bad.map(x => `${tab}: ${x}`));
          if (a.sw > a.iw) bad.push(`${tab}: scrolls sideways`);
        }
        await tap('#photoMode .ph-tab[data-tab="pose"]');
        await page.waitForTimeout(80);
        bad.push(...(await page.evaluate(poseTab)).map(x => `pose: ${x}`), ...(await page.evaluate(tabsOneLine)).map(x => `tab "${x}" wraps`));
        if (shots && lang === 'vi') await page.screenshot({ path: path.join(shots, `${C.name}-vi.png`) });
        check(!bad.length, `${lang}: every tab meets the standard (${bad.slice(0, 3).join('; ')})`);
        if (C.name === 'phone') {
          // the captions fit whole (the season too), start with a capital and are in the language's own heading font
          const cap = await page.evaluate(async () => {
            const { drawFrame } = await import('/src/ui/photo-frame.js'), { captionPlace, SEASON_NAMES } = await import('/src/game/photo.js'), { tx } = await import('/src/i18n/i18n.js');
            const head = getComputedStyle(document.body).getPropertyValue('--head').split(',')[0].replace(/['"]/g, '').trim();
            const out = [], fonts = new Set();
            for (const place of ['Hoshi Valley', "Ōta's mill", 'Kawabe']) for (const season of ['spring', 'summer', 'autumn', 'winter']) for (const frame of ['polaroid', 'postcard', 'film']) {
              const c = document.createElement('canvas'); c.width = 780; c.height = 1688;
              const ctx = c.getContext('2d'), fill = ctx.fillText.bind(ctx);
              ctx.fillText = (t, x, y) => { out.push(t); fonts.add(ctx.font); return fill(t, x, y); };
              drawFrame(ctx, 780, 1688, frame, captionPlace(tx(place)) + ' · ' + tx(SEASON_NAMES[season]));
              c.width = 0;
            }
            return { cut: out.filter(t => t.includes('…')), lower: out.filter(t => t !== t.charAt(0).toLocaleUpperCase() + t.slice(1)), head, other: [...fonts].filter(f => !f.includes(head)) };
          });
          check(!cap.cut.length && !cap.lower.length && !cap.other.length, `${lang}: captions whole, capitalised, in ${cap.head} (${[...cap.cut, ...cap.lower, ...cap.other].slice(0, 3).join(' | ')})`);
        }
        await page.keyboard.press('Escape');
      }
      await page.evaluate(() => import('/src/i18n/i18n.js').then(m => m.setLang('en')));
    }

    check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
} finally { await browser.close(); }
log(failures.length ? `${failures.length} FAILED` : 'all passed');
process.exit(failures.length ? 1 : 0);
