import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quest } from '../src/game/quest.js';
import { Director } from '../src/game/director.js';
import { Scenes } from '../src/game/scenes.js';

for (const story of ['grandma', 'classic']) {
  test(`${story}: saving an unfinished arrival resumes the scene that can advance the quest`, () => {
    const first = new Quest(null, { story });
    const entry = first.start();
    assert.ok(entry.some(e => e.cutscene === 'arrival'));
    assert.equal(first.state.started, true, 'the scene is pending after quest entry');
    assert.equal(first.state.step, 'p.arrive');
    const snapshot = JSON.parse(JSON.stringify(first.save()));

    // The arrival emits {type:'cutscene', id:'arrival'} only when the scene finishes. Restoring world state alone
    // cannot produce that event, leaving this objective permanently stuck after an interrupted start.
    const resumed = new Quest(snapshot);
    const effects = resumed.start();
    assert.ok(resumed.resumed);
    assert.equal(effects.filter(e => e.cutscene === 'arrival').length, 1, 'restarts the unfinished scene once');
    assert.ok(!effects.some(e => e.say || e.give || e.title !== undefined), 'does not replay other entry rewards or dialogue');
    assert.deepEqual(resumed.save(), snapshot, 'scheduling the scene leaves saved progress intact');

    const done = resumed.dispatch({ type: 'cutscene', id: 'arrival' });
    assert.equal(resumed.state.step, 'p.cottage');
    assert.equal(done.filter(e => e.stepDone === 'p.arrive').length, 1);
    assert.ok(done.some(e => e.say === 'p_arrive'), 'the introduction follows the completed arrival');
    assert.ok(!resumed.dispatch({ type: 'cutscene', id: 'arrival' }).some(e => e.stepDone), 'a late duplicate cannot advance the next step');

    const finished = new Quest(resumed.save());
    assert.ok(!finished.start().some(e => e.cutscene || e.say), 'completed arrival stays completed on the next load');
  });
}

test('the real save API can persist the started arrival before its scene takes ownership', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), data = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    setItem: (key, value) => data.set(key, value), getItem: key => data.get(key) ?? null,
  } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; });
  const quest = new Quest(null, { story: 'grandma' });
  const pending = quest.start();
  assert.ok(pending.findIndex(e => e.title !== undefined) < pending.findIndex(e => e.cutscene === 'arrival'),
    'the chapter card is presented before the arrival owns the scene');
  const director = Object.assign(Object.create(Director.prototype), {
    quest, slot: 1, scenes: { active: null }, game: { player: { lastSafe: { x: -94, y: 17, z: 115 }, facing: 0 } },
  });
  assert.equal(director.canSave(), true, 'the pending-entry snapshot is accepted by the production save guard');
  assert.equal(director.save(), true);
  const stored = JSON.parse(data.get(Director.key(1)));
  const loaded = new Quest(stored.quest);
  assert.equal(loaded.state.step, 'p.arrive');
  assert.ok(loaded.start().some(e => e.cutscene === 'arrival'), 'the accepted save has an actionable recovery path');
});

test('Starfall reaches night even when a slow frame spans the whole sunset', async t => {
  let clock = 0;
  t.mock.method(performance, 'now', () => (clock += 4000));
  const time = { hour: 10 }, state = { hour: 10 };
  const skyStarted = new Error('sky started');
  // Stop at the first visible sky effect, before the real-time flight and dialogue.
  const scenes = new Scenes({ game: { time, celebrate: { starfall() { throw skyStarted; } } }, q: { state }, ui: { cinema() {} } });
  await assert.rejects(scenes.starfall(), error => error === skyStarted);
  assert.ok(Math.abs(time.hour - 22.3) < 0.001);
  assert.equal(state.hour, time.hour);
});
