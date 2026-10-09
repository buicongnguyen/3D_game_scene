import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quest, missingDialogue, migrate, freshState } from '../src/game/quest.js';
import { STEPS, DIALOGUE, CAST, CHATTER, JOURNAL, SKY_LETTERS, STEP_INDEX } from '../src/game/story.js';
import { useStory, storyId, STORIES, DEFAULT_STORY } from '../src/game/stories/index.js';
import { stateAt, exploreState } from '../src/game/fastforward.js';

const snapshot = () => JSON.stringify({ DIALOGUE, CAST, CHATTER, JOURNAL, SKY_LETTERS, steps: STEPS.map(s => [s.id, s.objective, s.done, s.talk, s.exit]) });

test('A Year with Grandma is the default; old saves without a story stay Classic', () => {
  assert.equal(DEFAULT_STORY, 'grandma');
  assert.equal(freshState().story, 'grandma');
  assert.equal(new Quest().state.story, 'grandma');
  assert.equal(storyId(), 'grandma');
  assert.equal(migrate({ step: 'c1.fish' }).story, 'classic', 'a save from before the two stories');
  assert.equal(migrate({ step: 'c1.fish', story: 'grandma' }).story, 'grandma');
  assert.equal(migrate({ step: 'c1.fish', story: 'nonsense' }).story, 'classic');
  assert.equal(new Quest(null, { story: 'classic' }).state.story, 'classic');
});

test('switching stories swaps every table and switching back restores Classic exactly', () => {
  useStory('classic');
  const classic = snapshot();
  useStory('grandma');
  assert.notEqual(snapshot(), classic);
  useStory('classic');
  assert.equal(snapshot(), classic);
});

test('the Grandma story is complete: every scene exists, every speaker is cast, lines fit, no confession choice', () => {
  useStory('grandma');
  assert.deepEqual(missingDialogue(), []);
  for (const [id, lines] of Object.entries(DIALOGUE)) for (const l of lines) {
    if (l.choice) continue;
    assert.ok(CAST[l[0]], `${id}: unknown speaker ${l[0]}`);
    assert.ok(l[1].length <= 190, `${id}: line too long`);
  }
  assert.ok(CAST.sora && CAST.mom && CAST.dad);
  for (const s of STEPS) for (const e of [...(s.enter || []), ...(s.exit || [])]) assert.ok(!e.sayChoice, `${s.id} asks for a choice`);
  assert.deepEqual(STEPS[STEP_INDEX['c4.shed']].done, { event: 'talk', who: 'genzo' });
  assert.ok(STEPS[STEP_INDEX['c4.ride']].exit.some(e => e.say === 'ending_parents'), 'the parents arrive at the end');
  assert.ok(CHATTER.sora?.length >= 4, 'Grandma has things to say all year');
  useStory('classic');
});

test('the Grandma story plays from the first step to the end, and saves load back into it', () => {
  const end = stateAt('e.done', 'together', 'grandma');
  assert.equal(end.story, 'grandma');
  assert.equal(Object.values(end.lamps).filter(Boolean).length, 4);
  assert.equal(end.choice, null, 'nobody had to choose how anyone confesses');
  const q = new Quest(JSON.parse(JSON.stringify(end)));
  assert.equal(q.state.story, 'grandma');
  assert.equal(storyId(), 'grandma');
  const classic = stateAt('e.done', 'alone', 'classic');
  assert.equal(classic.choice, 'alone');
  assert.equal(exploreState().story, 'grandma');
  assert.ok(STORIES.grandma.name && STORIES.classic.name);
});
