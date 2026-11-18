import test from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/ui.js';
import { Quest } from '../src/game/quest.js';
import { storyId } from '../src/game/stories/index.js';

const preview = state => UI.prototype.slotInfo({ quest: state, at: 1 });

test('Continue shows the saved story and counters for each slot without switching the active quest', () => {
  for (const active of ['classic', 'grandma']) {
    const quest = new Quest({ started: true, step: 'c1.cogs', chapter: 1, story: active, inv: { cog: 1 } });
    const before = quest.objective();
    const partial = { step: 'c1.cogs', chapter: 1, inv: { cog: 2 } };
    assert.match(preview({ ...partial, story: 'grandma' }), /Grandma's list: find the three mill cogs the flood carried off \(2\/3\)/);
    for (const classic of [partial, { ...partial, story: 'classic' }]) {
      assert.match(preview(classic), /Starline Classic · Find the three lost mill cogs \(2\/3\)/);
    }
    assert.equal(storyId(), active);
    assert.equal(quest.objective(), before);
  }
});

test('the epilogue save preview and live objective agree about an unfinished treasure hunt', () => {
  for (const story of ['classic', 'grandma']) {
    const partial = { chapter: 5, step: 'e.done', story, flags: { hunt: true }, inv: { kite: 1 } };
    const quest = new Quest(partial);
    assert.match(quest.objective(), /1\/13/);
    assert.ok(preview(partial).includes(quest.objective()));
  }
});
