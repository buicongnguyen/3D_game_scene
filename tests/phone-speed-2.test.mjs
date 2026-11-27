// Phone speed plan, round 2 (steps 6 and 11): the dancers' light model and the Low ladder judged on work time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Governor, settingsAt, LADDER, LOW_SLOW } from '../src/engine/governor.js';
import { performersSet } from '../src/engine/people.js';

const P = q => new URLSearchParams(q);

test('Low ladder: glow off at step 2, rarer shadows at 4, softer picture only at the last step', () => {
  const base = { bloom: true, shadowEvery: 2, npcDraw: 75 };
  assert.equal(settingsAt(base, 1, LADDER).q.bloom, true);
  assert.equal(settingsAt(base, 2, LADDER).q.bloom, false);
  assert.equal(settingsAt(base, 4, LADDER).q.shadowEvery, 8);
  assert.equal(settingsAt(base, 4, LADDER).scale, 1);
  assert.equal(settingsAt(base, 5, LADDER).scale, 0.85);
  assert.equal(settingsAt({ bloom: false }, 1, LADDER).q.bloom, false);   // a step never turns the glow on
});

test('paced phone: 32 ms of work per frame steps down, 28 ms does not', () => {
  const feed = (ms, secs) => { const g = new Governor({ levels: LADDER.length, slow: LOW_SLOW }); for (let t = 0; t < secs; t += 1 / 30) g.frame(ms / 1000); return g.level; };
  assert.ok(feed(32, 5) >= 1);
  assert.equal(feed(28, 10), 0);
});

test('dancers: light on Low with People on Automatic, standard when chosen or on PC', () => {
  assert.equal(performersSet('low', P(''), 'auto'), 'lite');
  assert.equal(performersSet('low', P(''), 'std'), 'std');
  assert.equal(performersSet('low', P('people=std'), 'auto'), 'std');
  assert.equal(performersSet('high', P(''), 'auto'), 'std');
  assert.equal(performersSet('high', P(''), 'lite'), 'lite');
});
