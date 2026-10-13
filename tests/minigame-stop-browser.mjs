// Real-input mid-round cancellation against dev or production (no browser /src imports).
// GAME_URL=http://127.0.0.1:5875/ node tests/minigame-stop-browser.mjs --only=desktop|phone --out=.tools/stop
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const BASE = process.env.GAME_URL; assert(BASE, 'GAME_URL is required');
const OUT = args.out || '.tools/stop'; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const results = [], errors = [];
const read = () => {
  const g = window.__STARLINE__, d = g.director, r = d.tricks?.round, y = d.yard?.round;
  const id = r?.id || y?.id, rec = r ? d.q.state.tricks[id] : d.q.state.yard[id];
  return { id, phase: r?.ctx?.debug?.phase, local: r?.ctx?.debug?.local, pool: r?.ctx?.debug?.pool,
    record: rec ? { plays: rec.plays || 0, stars: rec.stars || 0, best: rec.best || 0 } : { plays: 0, stars: 0, best: 0 },
    dialogue: d.ui.dialogueOpen, busy: d.busy, running: d.minigameMenu.running, locked: g.player.locked,
    mounted: !!g.player.mounted, shot: !!g.follow.shot, tracking: !!g.follow.tracking, pose: g.player.pose,
    updateSame: g.player.update === window.__originalPlayerUpdate, groundLock: g.player.groundLock || 0,
    inputHeld: ['act', 'forward', 'back', 'jump'].filter(k => g.input.held(k)), race: window.__STARLINE_QA__?.cowRace?.dbg?.phase };
};
const boardState = () => {
  const s = window.__STARLINE__.director.yard.round.sim;
  return JSON.stringify({ t: s.t, timer: s.timer, state: s.state, board: s.board, shown: s.shown, score: s.score, sel: s.sel, anim: s.anim });
};
try {
  for (const device of args.only ? [args.only] : ['desktop', 'phone']) {
    const phone = device === 'phone';
    const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: phone, isMobile: phone });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    const hit = s => phone ? page.tap(s) : page.click(s);
    await page.goto(`${BASE}?qa=1&mute=1&quality=low&lang=en`);
    await page.waitForFunction(() => window.__STARLINE_READY__, null, { timeout: 180000 });
    await page.evaluate(() => { window.__originalPlayerUpdate = window.__STARLINE__.player.update; });
    for (const [n, id] of ['trick:swimming', 'trick:archery', 'yard:oanquan', 'trick:cowrace'].entries()) {
      await hit(n === 0 ? '#btnTitleMini' : '#mgChip'); await page.waitForSelector('#mgPicker:not(.hidden)');
      const categories = await page.locator('.mg-tab').evaluateAll(a => a.map(b => b.dataset.cat));
      for (const cat of categories) { await hit(`.mg-tab[data-cat="${cat}"]`); if (await page.locator(`.mg-card[data-id="${id}"]`).count()) break; }
      const chosen = page.locator(`.mg-card[data-id="${id}"]`); await chosen.scrollIntoViewIfNeeded(); await chosen.click();
      for (let i = 0; i < 160; i++) {
        if (await page.locator('#minigameStop:not(.hidden)').count() && !(await page.evaluate(read)).dialogue) break;
        if ((await page.evaluate(read)).dialogue) await page.keyboard.press('KeyE');
        await page.waitForTimeout(250);
      }
      await page.waitForSelector('#minigameStop:not(.hidden)', { timeout: 30000 });
      if (id === 'trick:swimming') {
        // Identify the exit, then enter the actual water using ordinary keys.
        for (let i = 0; i < 180; i++) {
          const s = await page.evaluate(read); if (s.phase === 'lesson') break;
          await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
          if (s.phase === 'check') { if (s.local.x < -.15) await page.keyboard.down('KeyD'); else await page.keyboard.press('KeyE'); }
          if (s.phase === 'entry') { if (s.local.z > s.pool.entryZ + .15) await page.keyboard.down('KeyW'); else await page.keyboard.press('KeyE'); }
          await page.waitForTimeout(85);
        }
        await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD');
        assert.equal((await page.evaluate(read)).phase, 'lesson', 'swimmer actually entered the pool');
        await page.keyboard.down('KeyE'); await page.waitForTimeout(600);
      } else if (id === 'trick:archery') {
        await page.waitForSelector('#archDraw', { timeout: 30000 }); await page.waitForTimeout(1600);
        await page.keyboard.down('KeyE'); await page.waitForTimeout(700);
      } else if (id === 'trick:cowrace') {
        for (let i = 0; i < 180; i++) {
          const s = await page.evaluate(read); if (s.race === 'race') break;
          if (s.dialogue || s.race === 'intro') await page.keyboard.press('KeyE');
          await page.waitForTimeout(250);
        }
        assert.equal((await page.evaluate(read)).race, 'race', 'cow rider reached the actual race');
        await page.waitForTimeout(800);
      } else {
        await page.waitForSelector('#oanHelpBtn:not([hidden])');
        await page.waitForFunction(() => { const s = window.__STARLINE__.director.yard.round.sim; return s.state === 'think' && s.cur.human; });
        await page.keyboard.press('KeyD', { delay: 70 });
        await page.waitForFunction(() => window.__STARLINE__.director.yard.round.sim.sel !== null);
        await page.keyboard.press('KeyE', { delay: 70 });
        await page.waitForFunction(() => window.__STARLINE__.director.yard.round.sim.state === 'sow');
        await hit('#oanHelpBtn'); await page.waitForSelector('#oanGuide:not([hidden])');
        const frozen = await page.evaluate(boardState);
        await page.waitForTimeout(1000);
        for (let i = 0; i < 3; i++) await hit('#oanGuide .og-next');
        assert.equal(await page.evaluate(boardState), frozen, 'guide/demo leave live sowing animation, timer, board and scores frozen');
        await page.screenshot({ path: `${OUT}/${device}-oanquan-guide.png` });
        await hit('#oanGuide .og-resume'); await page.waitForTimeout(350);
        assert.notEqual(await page.evaluate(boardState), frozen, 'same live round resumes after guide closes');
      }
      const before = await page.evaluate(read);
      const layout = await page.locator('#minigameStop').evaluate(b => { const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label'), x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height, topmost: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('#minigameStop') === b, vw: innerWidth, vh: innerHeight }; });
      assert(layout.label && layout.w >= 44 && layout.h >= 44 && layout.x >= 0 && layout.y >= 0 && layout.right <= layout.vw && layout.bottom <= layout.vh && layout.topmost, `${id}: visible accessible Stop target ${JSON.stringify(layout)}`);
      await page.screenshot({ path: `${OUT}/${device}-${id.replace(':', '-')}-active.png` });
      if (id === 'yard:oanquan') {
        await hit('#oanHelpBtn'); await page.waitForSelector('#minigameStop', { state: 'hidden' });
        const guideStop = page.locator('#oanGuide .og-stop'); await guideStop.scrollIntoViewIfNeeded();
        assert(await guideStop.isVisible(), 'guide contains its own Stop without obscuring the demo');
        await hit('#oanGuide .og-stop');
      } else if (!phone && id === 'trick:archery') { await page.locator('#minigameStop').focus(); await page.keyboard.press('Space'); }
      else await hit('#minigameStop');
      await page.keyboard.up('KeyE');
      await page.waitForFunction(() => { const d = window.__STARLINE__.director; return !d.minigameMenu.running && !d.tricks?.round && !d.yard?.round && !d.minigame && !d.workshop?.active; }, null, { timeout: 30000 });
      await page.waitForTimeout(700); const after = await page.evaluate(read);
      const saved = await page.evaluate(id => { const d = window.__STARLINE__.director, [kind, ref] = id.split(':'), r = kind === 'trick' ? d.q.state.tricks[ref] : d.q.state.yard[ref]; return r ? { plays: r.plays || 0, stars: r.stars || 0, best: r.best || 0 } : { plays: 0, stars: 0, best: 0 }; }, id);
      assert.deepEqual(saved, before.record, `${id}: abort does not award a round, best or stars`);
      assert(!after.locked && !after.mounted && !after.shot && !after.tracking && after.updateSame && after.groundLock === 0 && after.inputHeld.length === 0, `${id}: cleanup ${JSON.stringify(after)}`);
      assert.equal(await page.locator('#swimLesson,#archUi,#cowRace').count(), 0);
      assert.equal(await page.locator('#oanGuide:not([hidden]),#oanHelpBtn:not([hidden])').count(), 0);
      assert.equal(await page.locator('#minigameStop:not(.hidden)').count(), 0);
      await page.waitForSelector('#mgChip:not(.hidden)');
      await page.screenshot({ path: `${OUT}/${device}-${id.replace(':', '-')}-stopped.png` });
      results.push({ device, id, layout, before, after, saved }); console.log(`${device}: ${id} Stop passed`);
    }
    await ctx.close();
  }
  assert.deepEqual(errors, []); console.log('All production Stop checks passed');
} finally { writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 2)); await browser.close(); }
