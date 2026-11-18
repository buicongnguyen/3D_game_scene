// Exercise the real title and launch URL against a packed preview, using isolated browser storage.
// GAME_URL=http://127.0.0.1:5946/ node tests/explore-save-browser.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { exploreState, stateAt } from '../src/game/fastforward.js';

const base = process.env.GAME_URL || 'http://127.0.0.1:5946/';
const save = quest => JSON.stringify({ v: 1, quest, player: { x: -45, y: 4, z: 27, facing: 0 }, at: 1760000000000 });
const story = save(stateAt('c1.cogs', 'alone', 'grandma'));
const explore = save(exploreState());
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--mute-audio'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(({ story, explore }) => {
    localStorage.setItem('starline-save-1', story);
    localStorage.setItem('starline-save-explore', explore);
  }, { story, explore });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?quick=on&qa=1&quality=low&lang=en');
  await page.waitForFunction(() => window.__STARLINE_READY__);
  await page.locator('#btnExplore').click();
  const resume = page.locator('.explore-go');
  assert.equal(await resume.innerText(), 'Keep exploring');
  assert.equal(await page.locator('.explore-again').isVisible(), true);
  const selected = page.locator('.explore-chips button[aria-pressed=true]');
  assert.deepEqual(await selected.allTextContents(), ['Spring', 'Morning']);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('.explore-again').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('starline-save-explore')), explore);
  assert.equal(await resume.isVisible(), true);
  await page.getByRole('button', { name: 'Night', exact: true }).click();
  assert.deepEqual(await selected.allTextContents(), ['Spring', 'Night']);
  await resume.click();
  await page.waitForFunction(() => window.__STARLINE_PLAYING__, null, { timeout: 120000 });
  assert.equal(await page.evaluate(() => window.__STARLINE__.timeOverride), 21.5);
  assert.equal(await page.evaluate(() => window.__STARLINE__.director.slot), 'explore');
  assert.equal(await page.evaluate(() => localStorage.getItem('starline-save-1')), story);
  console.log('Returning Explore player can resume from the lightweight title with the selected time.');
  // The documented direct link shares the normal Explore slot even alongside a mid-story save.
  await page.goto(base + '?qa=1&quality=low&start=explore&slot=explore');
  await page.waitForFunction(() => window.__STARLINE_PLAYING__ && !window.__STARLINE__.director.busy, null, { timeout: 120000 });
  const saved = await page.evaluate(() => {
    const d = window.__STARLINE__.director;
    return { slot: d.slot, explore: d.quest.state.flags.explore, wrote: d.save(),
      story: localStorage.getItem('starline-save-1'), progress: localStorage.getItem('starline-save-explore') };
  });
  assert.equal(saved.slot, 'explore');
  assert.equal(saved.explore, true);
  assert.equal(saved.wrote, true);
  assert.equal(saved.story, story);
  assert.notEqual(saved.progress, explore);
  console.log('Saving through the Explore shortcut writes Explore progress and preserves story slot 1 byte-for-byte.');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
