// The daily stamp card (src/game/stamps.js, docs/STAMPS.md) in a real browser, on a phone held upright (390x844, touch).
//   GAME_URL=http://127.0.0.1:5932/ node tests/stamps-browser.mjs        (SHOTS=dir also saves screenshots there)
// A fresh Explore save on a fixed day (?stampday): the card is the one drawCard draws; the sender's "Collect" beats "Go
// inside", the recipient's "Deliver" stamps it and the pop shows clear of the act button, the stick and the objective
// card; walking onto the find stamps it; a played game shows in its record and stamps within 1.5 s, with the bonus and two
// decorations; in the cottage the decorations stand and sparkle (seen indoors) and bring no new shader program and few
// draws; a later day rolls a new card and keeps the stamps, an earlier one keeps the card, and a reload keeps it all; the
// card's Play button starts that game; the Neighbours tab meets the UI standard upright and sideways in four languages;
// the find costs at most two draws; ?stamps=off fetches nothing and keeps the old objective line.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { drawCard, playCandidates } from '../src/game/stamps-rules.js';
import path from 'node:path';

const url = process.env.GAME_URL || 'http://127.0.0.1:5932/';
const shots = process.env.SHOTS || '';
const DAY = '2026-11-20';
const Q = `?mute&qa=1&quality=low&start=explore&slot=explore&stamps=on&stampday=${DAY}`;
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
const failures = [];
const check = (ok, msg) => { if (!ok) { failures.push(msg); log('  FAIL', msg); } else log('  ok', msg); return ok; };
if (shots) fs.mkdirSync(shots, { recursive: true });
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };

/** Page side: free play (no dialogue, round, cutscene or panel), with the card's code loaded unless it is switched off. */
const ready = off => {
  const g = window.__STARLINE__, d = g?.director;
  return !!(window.__STARLINE_PLAYING__ && d?.quest && d.minigameMenu?.canOpen() && !g.ui.dialogueOpen && !g.ui.overlay && !g.follow.shot && !g.follow.tracking && !g.paused
    && (off || window.__STARLINE_QA__?.stamps));
};
const S = () => window.__STARLINE_QA__.stamps.state();

/** Page side: the UI standard on the stamp card (text >= 11 px, taps >= 44 px, nothing wider than the journal). */
const audit = () => {
  const root = document.getElementById('stampCard'), book = document.querySelector('#journal .book'), bad = [];
  if (!root || !root.firstChild) return { bad: ['no card'], sw: 0, iw: innerWidth };
  for (const b of root.querySelectorAll('button')) {
    const r = b.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) bad.push(`${b.textContent}: ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (b.scrollWidth > b.clientWidth + 1) bad.push(`${b.textContent}: clipped`);
  }
  for (const r of root.querySelectorAll('.stamp-row')) if (r.getBoundingClientRect().height < 55.5) bad.push(`row ${Math.round(r.getBoundingClientRect().height)} px`);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el.getBoundingClientRect().width) continue;
    let z = 1; for (let e = el; e; e = e.parentElement) z *= parseFloat(getComputedStyle(e).zoom) || 1;
    const px = parseFloat(getComputedStyle(el).fontSize) * z;
    if (px < 11) bad.push(`"${n.textContent.trim().slice(0, 20)}": ${px.toFixed(1)}px`);
  }
  const card = root.querySelector('.stampcard').getBoundingClientRect(), br = book.getBoundingClientRect();
  if (card.left < br.left - 0.5 || card.right > br.right + 0.5) bad.push('card wider than the journal');
  return { bad, sw: Math.max(document.documentElement.scrollWidth, book.scrollWidth - book.clientWidth + innerWidth), iw: innerWidth };
};

/** Page side: the pop's box against the act button, the lower half (the stick) and the objective card. */
const popClear = () => {
  const p = document.getElementById('stampPop')?.getBoundingClientRect();
  if (!p?.width) return { shown: false };
  const hit = id => { const e = document.getElementById(id); if (!e || e.closest('.hidden')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top; };
  return { shown: getComputedStyle(document.getElementById('stampPop')).opacity > 0.5, act: hit('tAct'), jump: hit('tJump'), objective: hit('objective'), chip: hit('mgChip'),
    stickZone: p.bottom > innerHeight * 0.55, top: Math.round(p.top), bottom: Math.round(p.bottom) };
};

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    try { if (!sessionStorage.getItem('stamps-test-cleared')) { localStorage.removeItem('starline-save-explore'); sessionStorage.setItem('stamps-test-cleared', '1'); } } catch { /* fine */ }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  const boot = async (q = Q, off = false) => {
    await page.goto(url + q, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(ready, off, { timeout: 240000, polling: 250 });
    await page.waitForTimeout(1500);
    await page.waitForFunction(ready, off, { timeout: 60000, polling: 250 });
  };
  const tap = sel => page.locator(sel).first().tap();
  const settle = () => page.waitForFunction(ready, false, { timeout: 30000, polling: 200 });
  const teleport = (x, z) => page.evaluate(([x, z]) => { const qa = window.__STARLINE_QA__; qa.teleport(x, z); qa.faceToward(x, z - 1); }, [x, z]);
  /** Read through whatever is being said (E), at most 15 s. */
  const clearTalk = async () => {
    for (let i = 0; i < 60; i++) {
      if (!(await page.evaluate(() => window.__STARLINE__.ui.dialogueOpen || window.__STARLINE__.director.busy > 0))) return;
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(250);
    }
  };

  log('--- boot (fresh Explore save)');
  await boot();

  // ---------------------------------------------------------------- the card
  const first = await page.evaluate(() => {
    const d = window.__STARLINE__.director;
    return { catalogue: d.minigameMenu.catalogue.map(({ id, kind }) => ({ id, kind })), state: window.__STARLINE_QA__.stamps.state(),
      tab: d.ui._tab, obj: document.getElementById('objText').textContent };
  });
  const expected = drawCard(DAY, undefined, null, playCandidates(first.catalogue)).map(t => [t.k, t.id, t.spot ?? null]);
  check(first.state.day === DAY && JSON.stringify(first.state.tasks.map(t => [t.k, t.id, t.spot ?? null])) === JSON.stringify(expected), `the card is drawCard's for ${DAY} (${JSON.stringify(first.state.tasks)})`);
  check(/^Stamp card 0\/3: Take .+ to .+/.test(first.obj), `the objective reads the card ("${first.obj}")`);
  check(first.tab === 'folk', `the next journal opens on Neighbours (${first.tab})`);
  await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some(t => /stamp card came in the post/.test(t.textContent)), null, { timeout: 8000 }).then(() => check(true, 'the new-card toast shows'), () => check(false, 'the new-card toast shows'));

  // ---------------------------------------------------------------- deliver
  const from = await page.evaluate(() => window.__STARLINE_QA__.interactable('stamp:collect'));
  await teleport(from[0], from[2]);
  await page.waitForTimeout(600);
  const focus1 = await page.evaluate(() => ({ id: window.__STARLINE__.director.focus?.id, prompt: document.getElementById('promptText').textContent }));
  check(focus1.id === 'stamp:collect' && /^Collect: /.test(focus1.prompt), `at the sender's door "Collect" beats "Go inside" (${JSON.stringify(focus1)})`);
  await tap('#tAct');
  await page.waitForFunction(() => window.__STARLINE_QA__.stamps.state().tasks[0].carry, null, { timeout: 5000 }).catch(() => {});
  const carried = await page.evaluate(S);
  check(carried.tasks[0].carry && !carried.tasks[0].done, 'act: the parcel is carried');
  const to = await page.evaluate(() => window.__STARLINE_QA__.interactable('stamp:deliver'));
  check(!!to && Math.hypot(to[0] - from[0], to[2] - from[2]) > 5, 'the arrow and the hand-in move to the recipient\'s door');
  await teleport(to[0], to[2]);
  await page.waitForTimeout(600);
  const focus2 = await page.evaluate(() => ({ id: window.__STARLINE__.director.focus?.id, prompt: document.getElementById('promptText').textContent }));
  check(focus2.id === 'stamp:deliver' && /^Deliver: /.test(focus2.prompt), `at the recipient's door "Deliver" (${JSON.stringify(focus2)})`);
  await tap('#tAct');
  await page.waitForFunction(() => document.getElementById('stampPop')?.classList.contains('show'), null, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(450);
  const pop = await page.evaluate(popClear), st1 = await page.evaluate(S);
  await shot(page, 'pop-portrait');
  check(st1.tasks[0].done && st1.total === 1, `delivered: stamp 1 (total ${st1.total})`);
  check(pop.shown && !pop.act && !pop.jump && !pop.objective && !pop.chip && !pop.stickZone, `the stamp pop shows, clear of the act button, the stick and the objective card (${JSON.stringify(pop)})`);

  // ---------------------------------------------------------------- find
  const find = st1.find;
  check(!!find, 'the find is placed');
  await teleport(find[0], find[2]);
  await page.waitForFunction(() => window.__STARLINE_QA__.stamps.state().tasks[1].done, null, { timeout: 6000 }).catch(() => {});
  const st2 = await page.evaluate(S), bent = await page.evaluate(() => ({ items: window.__STARLINE__.director.ground.items.length, pick: !!window.__STARLINE__.director.pickups.get('stamp-find') }));
  check(st2.tasks[1].done && st2.total === 2 && !bent.pick, `walking onto the find stamps it (total ${st2.total})`);
  check(bent.items > 0, `Mika bends down for it (${bent.items} item in the ground pose)`);
  await page.waitForTimeout(2200);
  await settle();

  // ---------------------------------------------------------------- the Neighbours tab: four languages, upright and sideways
  const setLang = async lang => {
    await page.locator('#optLang').selectOption(lang, { force: true });
    await page.waitForFunction(l => document.documentElement.lang.split('-')[0] === l, lang);
  };
  await page.evaluate(() => window.__STARLINE__.ui.openJournal());
  await page.waitForTimeout(400);
  for (const [w, h] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const lang of ['en', 'vi', 'ko', 'ja']) {
      await setLang(lang);
      await page.waitForTimeout(350);
      const a = await page.evaluate(audit);
      check(!a.bad.length && a.sw <= a.iw, `Neighbours tab ${w}x${h} ${lang}: text >= 11 px, taps >= 44 px, no sideways scroll (${a.bad.slice(0, 4).join('; ')} ${a.sw}/${a.iw})`);
      if ((w === 390 && (lang === 'en' || lang === 'vi')) || (w === 844 && lang === 'en')) await shot(page, `card-${w}x${h}-${lang}`);
    }
  }
  await setLang('en');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__STARLINE__.togglePause(false));
  await settle();

  // ---------------------------------------------------------------- play (a game's record grows)
  const bump = await page.evaluate(() => {
    const d = window.__STARLINE__.director, st = d.q.state, t = st.stamps.tasks[2], e = d.minigameMenu.catalogue.find(x => x.id === t.id);
    if (e.kind === 'trick') st.tricks[e.ref] = { learned: true, best: 0, stars: 0, ...(st.tricks[e.ref] || {}), plays: (st.tricks[e.ref]?.plays || 0) + 1 };
    else if (e.kind === 'yard') st.yard[e.ref] = { ...(st.yard[e.ref] || {}), plays: (st.yard[e.ref]?.plays || 0) + 1 };
    else st.fishLog.trout = (st.fishLog.trout || 0) + 1;
    return { id: t.id, at: performance.now() };
  });
  await page.waitForFunction(() => window.__STARLINE_QA__.stamps.state().tasks[2].done, null, { timeout: 4000 }).catch(() => {});
  const st3 = await page.evaluate(S), took = await page.evaluate(at => performance.now() - at, bump.at);
  check(st3.tasks[2].done && took <= 1600, `a play of ${bump.id} stamps within 1.5 s (${Math.round(took)} ms)`);
  check(st3.cards === 1 && st3.total === 4, `full card: the bonus stamp (cards ${st3.cards}, total ${st3.total})`);
  check(JSON.stringify(st3.decor) === '["lantern","geraniums"]', `two decorations unlock (${st3.decor})`);
  check(/^Stamp card full/.test(await page.evaluate(() => document.getElementById('objText').textContent)), 'the objective says the card is full');
  const toasts = [];
  for (let i = 0; i < 16; i++) {
    for (const t of await page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(x => x.textContent))) if (!toasts.includes(t)) toasts.push(t);
    await page.waitForTimeout(500);
  }
  check(toasts.some(t => /Card full/.test(t)) && toasts.filter(t => /New in the cottage/.test(t)).length === 2, `the bonus and both unlocks are told (${toasts.join(' | ')})`);

  // ---------------------------------------------------------------- the cottage
  const progs = () => page.evaluate(() => window.__STARLINE__.renderer.renderer.info.programs.map(p => p.cacheKey || p.id));
  const enterCottage = async () => {
    await page.evaluate(async () => { const d = window.__STARLINE__.director, door = window.__STARLINE__.interiors.doors.find(x => x.id === 'cottage'); window.__STARLINE_QA__.teleport(door.outside.x, door.outside.z); await d.enterHome('cottage'); });
    await page.waitForTimeout(150);
  };
  const before = await progs();
  await enterCottage();
  let sparkle = false;
  for (let i = 0; i < 30 && !sparkle; i++) { sparkle = await page.evaluate(() => !!window.__STARLINE__.celebrate.indoor?.points.visible); if (!sparkle) await page.waitForTimeout(100); }
  check(sparkle, 'a sparkle in the cottage is drawn indoors (celebrate.indoor visible)');
  await page.waitForTimeout(1800);
  await clearTalk();
  const inside = await page.evaluate(() => window.__STARLINE_QA__.stamps.decor().filter(x => x.visible).map(x => x.id));
  check(JSON.stringify(inside) === '["lantern","geraniums"]', `the two decorations stand in the cottage (${inside})`);
  /** Page side: the materials of the stamp objects whose shader program is not in `keys` (new since then). */
  const newProgs = keys => {
    const g = window.__STARLINE__, R = g.renderer.renderer, out = [], roots = [];
    g.interiors.rooms.get('cottage').root.traverse(o => { if (/^stamp-decor:/.test(o.name) && o.visible) roots.push(o); });
    const pk = g.director.pickups.get('stamp-find');
    if (pk) roots.push(pk.obj);
    for (const r of roots) r.traverse(o => { if (!o.isMesh) return; for (const m of [o.material].flat()) { const p = R.properties.get(m).currentProgram; if (p && !keys.includes(p.cacheKey || p.id)) out.push(m.name); } });
    return out;
  };
  const decorProgs = await page.evaluate(newProgs, before);
  check(!decorProgs.length, `the decorations bring no new shader program (${decorProgs.join(', ')})`);
  check((await page.evaluate(() => window.__STARLINE_QA__.stamps.state().seen)).length >= 2, 'the shown decorations are remembered as seen');
  // all eight: every one drawn at once (frustum culling off for a moment): its shader programs and its draws
  await page.evaluate(() => window.__STARLINE_QA__.stamps.unlockAll());
  await page.waitForTimeout(3500);
  await clearTalk();
  const cost = await page.evaluate(async keys => {
    const g = window.__STARLINE__, R = g.renderer.renderer, list = [], meshes = [];
    g.interiors.rooms.get('cottage').root.traverse(o => { if (/^stamp-decor:/.test(o.name)) list.push(o); });
    list.forEach(r => r.traverse(o => { if (o.isMesh) meshes.push(o); }));
    const frames = n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    meshes.forEach(o => { o.userData.fc = o.frustumCulled; o.frustumCulled = false; });
    await frames(3);
    g.togglePause(true, true); await frames(4);
    const on = g.lastInfo.calls;
    list.forEach(o => { o.visible = false; }); await frames(4);
    const off = g.lastInfo.calls;
    list.forEach(o => { o.visible = true; });
    meshes.forEach(o => { o.frustumCulled = o.userData.fc; });
    g.togglePause(false); await frames(2);
    const fresh = [];
    for (const o of meshes) for (const m of [o.material].flat()) { const p = R.properties.get(m).currentProgram; if (!p) fresh.push(`${m.name} (never drawn)`); else if (!keys.includes(p.cacheKey || p.id)) fresh.push(m.name); }
    return { on, off, n: list.length, meshes: meshes.length, fresh };
  }, before);
  check(cost.n === 8 && cost.on - cost.off <= 20, `all eight decorations together cost ${cost.on - cost.off} draws (<= 20; ${cost.meshes} meshes)`);
  check(!cost.fresh.length, `all eight decorations bring no new shader program on entry (${cost.fresh.join(', ')})`);
  await shot(page, 'cottage-spawn-all8');
  // the corners where they stand: the genkan by the door, the tansu
  const look = async (id, name) => {
    await page.evaluate(id => { const c = window.__STARLINE_QA__.stamps.decor().find(x => x.id === id).center; window.__STARLINE_QA__.faceToward(c[0], c[2]); window.__STARLINE__.follow.first = true; }, id);
    await page.waitForTimeout(900);
    await shot(page, name);
  };
  await look('basket', 'cottage-genkan-all8');
  await look('lantern', 'cottage-tansu-all8');
  await look('geraniums', 'cottage-back-all8');
  const spots = await page.evaluate(() => window.__STARLINE_QA__.stamps.decor().map(x => [x.id, x.min.map(v => +v.toFixed(2)), x.max.map(v => +v.toFixed(2))]));
  log('  decor boxes (world):', JSON.stringify(spots));
  const seat = await page.evaluate(async () => { const d = window.__STARLINE__.director, s = d.indoor.spots.find(x => x.id === 'cottage:cottage.table'); if (!s) return false; d.indoor.use(s); return true; });
  await page.waitForTimeout(1200);
  await clearTalk();
  await page.waitForTimeout(800);
  await shot(page, 'cottage-seat-all8');
  check(seat, 'the table seat is there');
  await page.evaluate(() => window.__STARLINE__.director.indoor.standUp?.());
  await page.waitForTimeout(600);
  await clearTalk();
  await page.evaluate(() => window.__STARLINE__.director.leaveHome());
  await page.waitForTimeout(800);
  await clearTalk();
  await settle();

  // ---------------------------------------------------------------- the day turns
  const kept = await page.evaluate(S);
  const rolled = await page.evaluate(() => { window.__STARLINE_QA__.stamps.setDay('2026-11-21'); return window.__STARLINE_QA__.stamps.state(); });
  check(rolled.day === '2026-11-21' && rolled.total === kept.total && rolled.tasks.every(t => !t.done) && rolled.lucky === '', `a later day rolls a new card and keeps the ${kept.total} stamps`);
  const back = await page.evaluate(() => { window.__STARLINE_QA__.stamps.setDay('2026-11-19'); return window.__STARLINE_QA__.stamps.state(); });
  check(back.day === '2026-11-21' && JSON.stringify(back.tasks) === JSON.stringify(rolled.tasks), 'an earlier day (a clock moved back) keeps the card');
  await page.evaluate(() => window.__STARLINE__.director.save());
  await boot();
  const reloaded = await page.evaluate(S);
  check(reloaded.day === rolled.day && reloaded.total === rolled.total && reloaded.cards === rolled.cards && JSON.stringify(reloaded.tasks) === JSON.stringify(rolled.tasks)
    && JSON.stringify(reloaded.seen) === JSON.stringify(back.seen), `a reload keeps the card, the stamps and the decorations seen (${reloaded.day}, ${reloaded.total}, seen ${reloaded.seen.length})`);
  check(reloaded.decor.length === 8, 'a reload keeps all eight decorations');

  // ---------------------------------------------------------------- the find costs few draws
  const before2 = await progs();
  const findDraws = await page.evaluate(async () => {
    const g = window.__STARLINE__, qa = window.__STARLINE_QA__, pk = g.director.pickups.get('stamp-find');
    if (!pk) return null;
    qa.teleport(pk.pos.x + 6, pk.pos.z + 6); qa.faceToward(pk.pos.x, pk.pos.z);
    const frames = n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    await frames(30);
    g.togglePause(true, true); await frames(4);
    const on = g.lastInfo.calls, v = pk.obj.position.clone().project(g.camera);
    pk.obj.visible = false; await frames(4);
    const off = g.lastInfo.calls;
    g.togglePause(false); await frames(2);
    let shadow = false; pk.obj.traverse(o => { if (o.isMesh && o.castShadow) shadow = true; });
    return { on, off, inView: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1, shadow };
  });
  check(findDraws && findDraws.inView && findDraws.on - findDraws.off <= 2 && !findDraws.shadow, `the find in view costs ${findDraws && findDraws.on - findDraws.off} draws (<= 2) and casts no shadow (${JSON.stringify(findDraws)})`);
  const findProgs = await page.evaluate(newProgs, before2);
  check(!findProgs.length, `the find brings no new shader program (${findProgs.join(', ')})`);
  await shot(page, 'find-in-view');
  await settle();

  // ---------------------------------------------------------------- the card's Play button
  await page.evaluate(() => window.__STARLINE__.ui.openJournal());
  await page.waitForTimeout(300);
  await tap('#journalTabs button[data-tab="folk"]');
  await page.waitForTimeout(300);
  const playId = await page.evaluate(() => window.__STARLINE_QA__.stamps.state().tasks[2].id);
  const hasPlay = await page.locator('#stampCard .stamp-play').count() === 1;
  check(hasPlay, 'the card shows a Play button for its game');
  if (hasPlay) await tap('#stampCard .stamp-play');
  // (the launch fades out first, then closes the journal and unpauses)
  await page.waitForFunction(id => { const g = window.__STARLINE__, m = g.director.minigameMenu; return m.running && m.current?.id === id && !g.ui.overlay && !g.paused; }, playId, { timeout: 15000 }).catch(() => {});
  const launched = await page.evaluate(() => ({ running: window.__STARLINE__.director.minigameMenu.running, id: window.__STARLINE__.director.minigameMenu.current?.id, overlay: window.__STARLINE__.ui.overlay, paused: window.__STARLINE__.paused }));
  check(launched.running && launched.id === playId && !launched.overlay && !launched.paused, `Play starts ${playId} and closes the journal (${JSON.stringify(launched)})`);
  // leave it again (E through a teacher's lines, Backspace or Esc out of the game)
  for (let i = 0; i < 60; i++) {
    const t = await page.evaluate(() => { const d = window.__STARLINE__.director; return { run: d.minigameMenu.running, busy: d.busy, sky: !!d.sky?.active }; });
    if (!t.run) break;
    await page.keyboard.press(t.busy > 0 ? 'KeyE' : t.sky ? 'Escape' : 'Backspace');
    await page.waitForTimeout(500);
  }
  check(!(await page.evaluate(() => window.__STARLINE__.director.minigameMenu.running)), 'the game is left again');

  // ---------------------------------------------------------------- ?stamps=off
  log('--- ?stamps=off');
  await boot(Q.replace('stamps=on', 'stamps=off'), true);
  const off = await page.evaluate(() => ({
    // (game/stamps-save.js is part of the quest and always loads; the card's own code is the rest)
    chunk: performance.getEntriesByType('resource').some(e => /\/src\/(game\/stamps(-rules)?|ui\/stamps-ui|content\/stamps)\.js|\/assets\/stamps-[\w-]+\.js/.test(e.name)),
    qa: !!window.__STARLINE_QA__.stamps, obj: document.getElementById('objText').textContent, stamps: !!window.__STARLINE__.director.stamps,
  }));
  check(!off.chunk && !off.qa && !off.stamps, `?stamps=off fetches no stamps chunk (${JSON.stringify(off)})`);
  check(/^Explore Hoshi Valley/.test(off.obj), `?stamps=off keeps the old objective line ("${off.obj}")`);

  check(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`);
  await ctx.close();
} finally {
  await browser.close();
}
log(failures.length ? `${failures.length} FAILED` : 'all passed');
process.exit(failures.length ? 1 : 0);
