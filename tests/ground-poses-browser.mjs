// Ground interactions in the actual renderer, including Low's merged skin.
// GAME_URL must point to a dev or production preview server.
// node tests/ground-poses-browser.mjs [--only=desktop-low] [--shots=0] [--out=.tools/ground-poses]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stateAt } from './e2e/fastforward.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const url = process.env.GAME_URL;
assert(url, 'Set GAME_URL to an isolated dev or production preview server');
const out = path.resolve(args.out || '.tools/ground-poses');
mkdirSync(out, { recursive: true });
const clips = ['Crouch', 'CrouchWalk', 'CrouchReach', 'CrouchReachHold', 'Kneel', 'Pickup', 'SitGrass'];
const results = [], failures = [];
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });

async function run(device, quality) {
  const tag = `${device}-${quality}`;
  const context = await browser.newContext({ viewport: device === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: device === 'phone', isMobile: device === 'phone' });
  const quest = stateAt('e.free', 'alone', 'grandma');
  quest.flags.huntAsked = true;
  await context.addInitScript(quest => {
    localStorage.setItem('starline-save-1', JSON.stringify({ v: 1, quest, player: { x: -44, y: 4, z: 77.5, facing: Math.PI / 2 } }));
    localStorage.setItem('starline-last-slot', '1');
  }, quest);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const read = () => page.evaluate(() => {
    const g = window.__STARLINE__, d = g.director;
    return { ground: d.ground?.debug(), clip: g.player.anim?.currentName, pose: g.player.pose, lowered: g.player.groundCameraLower, hay: d.cows.hay, busy: d.busy, dialogue: g.ui.dialogueOpen, locked: g.player.locked };
  });
  const check = (ok, message) => { if (!ok) { failures.push(`${tag}: ${message}`); console.log('FAIL', tag, message); } };
  const waitClip = name => page.waitForFunction(n => window.__STARLINE__.player.anim?.currentName === n, name, { timeout: 12000, polling: 25 });
  const settle = async () => {
    for (let i = 0; i < 100; i++) {
      const s = await read();
      if (s.dialogue) await page.keyboard.press('KeyE');
      if (!s.dialogue && !s.busy) return;
      await page.waitForTimeout(100);
    }
    throw new Error('Dialogue did not settle');
  };
  // Freeze only the picture for a three-angle review, then give the game back.
  const shot = async (name, angles = ['chase']) => {
    if (args.shots === '0') return;
    await page.evaluate(() => { window.__STARLINE__.paused = true; });
    try {
      for (const angle of angles) {
        await page.evaluate(angle => {
          const g = window.__STARLINE__, p = g.player, f = p.facing;
          const a = angle === 'front' ? f : angle === 'side' ? f + Math.PI / 2 : f + Math.PI;
          g.camera.position.set(p.pos.x + Math.sin(a) * 3.2, p.pos.y + 1.35, p.pos.z + Math.cos(a) * 3.2);
          g.camera.lookAt(p.pos.x, p.pos.y + 0.55, p.pos.z);
          g.camera.updateMatrixWorld(true);
        }, angle);
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(out, `${tag}-${name}-${angle}.png`) });
      }
    } finally { await page.evaluate(() => { const g = window.__STARLINE__; g.paused = false; g.follow.first = true; }); }
  };
  try {
    await page.goto(`${url}?qa=1&mute=1&live=1&start=continue&quality=${quality}`);
    await page.waitForFunction(() => window.__STARLINE_PLAYING__ && window.__STARLINE_QA__, null, { timeout: 180000 });
    await settle();
    await page.waitForTimeout(1500);
    const inventory = await page.evaluate(names => {
      const g = window.__STARLINE__, kid = g.assets.clone('villager-kid');
      return { player: names.filter(n => !g.player.anim.has(n)), kid: names.filter(n => !(kid?.userData.clips || []).some(c => c.name === n)), quality: g.renderer.qualityName };
    }, clips);
    check(!inventory.player.length && !inventory.kid.length, `Both loaded rigs expose every ground clip: ${JSON.stringify(inventory)}`);

    // A real E press on a haystack: inventory changes immediately, the pose continues,
    // and ordinary movement is available before the one-second animation ends.
    await page.evaluate(() => { const Q = window.__STARLINE_QA__; Q.teleport(-44, 77.5); Q.faceToward(-41.5, 77.5); });
    await page.waitForFunction(() => window.__STARLINE__.director.focus?.id === 'hay:kawabe', null, { timeout: 10000 });
    await page.keyboard.press('KeyE');
    await waitClip('Pickup');
    check((await read()).hay === 1, 'Hay pickup preserves immediate inventory logic');
    await page.waitForFunction(() => {
      const d = window.__STARLINE__.director, state = d.ground.debug();
      return state.clip === 'Pickup' && state.age >= 0.4;
    }, null, { timeout: 5000, polling: 20 });
    await shot('hay-grab', ['front', 'side', 'chase']);
    await page.waitForTimeout(800);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(450);
    await page.keyboard.up('KeyW');
    check(await page.evaluate(() => window.__STARLINE__.player.speed > 0.1), 'Pickup releases the movement lock');
    await page.waitForTimeout(300);

    // Feed an actual nearby farm cow with E and preserve her friendship/save logic.
    const cow = await page.evaluate(() => { const c = window.__STARLINE__.director.cows.cows()[0]; return c && { id: c.id, x: c.pos.x, z: c.pos.z }; });
    assert(cow, 'A farm cow is available');
    await page.evaluate(c => { const Q = window.__STARLINE_QA__; Q.teleport(c.x - 2, c.z); Q.faceToward(c.x, c.z); }, cow);
    await page.waitForFunction(() => window.__STARLINE__.director.focus?.id === 'feedCow', null, { timeout: 10000 });
    await page.keyboard.press('KeyE');
    await waitClip('CrouchReach');
    await page.waitForFunction(() => window.__STARLINE__.director.ground.debug().age >= 0.3, null, { timeout: 5000, polling: 20 });
    check(await page.evaluate(id => window.__STARLINE__.director.q.state.flags[`cowBond:${id}`], cow.id), 'Feeding still bonds the cow immediately');
    await shot('cow-feed', ['front', 'side', 'chase']);
    await page.waitForTimeout(1200);

    // The live meadow runner owns the input; use a deterministic bug at the ring
    // to isolate the pose/swing/cage sequence from random spawn timing.
    await page.evaluate(() => {
      const g = window.__STARLINE__, d = g.director;
      g.seasonOverride = 'summer'; g.timeOverride = 13;
      window.__STARLINE_QA__.teleport(-38, -68);
      window.__STARLINE_QA__.trickSeed = 7;
      d.q.state.tricks.hoppers = { learned: true, intro: true, plays: 1, best: 0, stars: 0 };
      void d.tricks.play('hoppers');
    });
    await page.waitForFunction(() => window.__STARLINE_QA__.trickRound?.rig, null, { timeout: 30000 });
    await page.keyboard.down('Shift');
    await page.keyboard.down('KeyW');
    await waitClip('CrouchWalk');
    await page.waitForTimeout(250);
    await shot('creep', ['side', 'chase']);
    await page.keyboard.up('KeyW');
    await waitClip('Crouch');
    await page.waitForFunction(() => window.__STARLINE__.player.groundCameraLower > 0.25, null, { timeout: 3000 });
    check((await read()).lowered > 0.25, 'Crouching lowers the follow-camera target');
    await shot('crouch', ['front', 'side', 'chase']);
    await page.waitForFunction(() => window.__STARLINE_QA__.trickRound.meadow.bugs.some(b => b.alive && b.kind === 'grass'), null, { timeout: 15000 });
    await page.evaluate(() => {
      const r = window.__STARLINE_QA__.trickRound, p = r.player;
      const b = r.meadow.bugs.find(b => b.alive && b.kind === 'grass');
      if (!b) throw new Error('No seeded grasshopper');
      b.x = p.pos.x + Math.sin(p.facing) * 1.5; b.z = p.pos.z + Math.cos(p.facing) * 1.5;
      b.st = 'sit'; b.t = 20;
      window.__groundCaughtBefore = r.tally.caught;
    });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__STARLINE_QA__.trickRound.tally.caught > window.__groundCaughtBefore, null, { timeout: 10000 });
    await waitClip('CrouchReach');
    await page.waitForFunction(() => window.__STARLINE__.director.ground.debug().age >= 0.3, null, { timeout: 5000, polling: 20 });
    await shot('catch', ['side', 'chase']);
    await page.keyboard.up('Shift');
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => !window.__STARLINE__.director.tricks.round, null, { timeout: 20000 });
    check(await page.evaluate(() => !window.__STARLINE__.player.pose), 'Leaving the meadow releases pose ownership');

    // A short real firefly round reaches its waiting/release phase quickly.
    await page.evaluate(() => {
      const g = window.__STARLINE__, d = g.director, t = d.tricks;
      g.seasonOverride = 'summer'; g.timeOverride = 22;
      window.__STARLINE_QA__.teleport(-66, 10);
      d.q.state.tricks.firefly = { learned: true, intro: true, plays: 1, best: 0, stars: 0 };
      const previous = t.makeCtx;
      t.makeCtx = function(...args) { const ctx = previous.apply(this, args); ctx.roundTime = 6; return ctx; };
      void t.play('firefly').finally(() => { t.makeCtx = previous; });
    });
    await waitClip('SitGrass');
    await page.waitForTimeout(500);
    await shot('firefly-wait-night', ['front', 'side', 'chase']);
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => !window.__STARLINE__.director.tricks.round, null, { timeout: 20000 });
    check(await page.evaluate(() => !window.__STARLINE__.player.pose), 'Leaving the fireflies stands Mika up');

    results.push({ tag, inventory, state: await read(), errors });
    check(errors.length === 0, `No runtime errors (${errors.join('; ')})`);
    console.log('Completed', tag);
  } catch (e) {
    failures.push(`${tag}: ${e.stack || e}`);
    await page.screenshot({ path: path.join(out, `${tag}-failure.png`) }).catch(() => {});
    results.push({ tag, failed: String(e), state: await read().catch(() => null), errors });
  } finally { await context.close(); }
}

try {
  for (const device of ['desktop', 'phone']) for (const quality of ['low', 'medium']) {
    if (args.only && args.only !== `${device}-${quality}`) continue;
    await run(device, quality);
  }
} finally { await browser.close(); }
writeFileSync(path.join(out, 'results.json'), JSON.stringify({ failures, results }, null, 2));
console.log(failures.length ? failures.join('\n') : 'All ground-pose browser checks passed');
process.exitCode = failures.length ? 1 : 0;
