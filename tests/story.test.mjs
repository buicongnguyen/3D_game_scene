import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quest, missingDialogue, freshState, migrate } from '../src/game/quest.js';
import { STEPS, DIALOGUE, CAST, ITEMS, CHATTER, CHAPTERS } from '../src/game/story.js';

const NEED_ITEMS = { cog: 'pickup', peach: 'pickup', chestnut: 'pickup', mushroom: 'pickup', honeycomb: 'pickup', sheep: 'count', bells: 'count', beams: 'count', fish: 'catch' };

/** Produce the events a player would generate to finish the current step. */
function eventsFor(q) {
  const s = q.step, d = s.done;
  if (d.event) return [{ ...Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'event')), type: d.event, ...(d.event === 'choice' ? { value: q.choiceToMake } : {}) }].map(e => (d.event === 'talk' ? { type: 'talk', who: d.who } : e));
  if (d.have) {
    const out = [];
    for (const [k, n] of Object.entries(d.have)) for (let i = q.count(k); i < n; i++) {
      const kind = NEED_ITEMS[k];
      out.push(kind === 'catch' ? { type: 'catch', species: 'trout' } : kind === 'count' ? { type: 'count', item: k } : { type: 'pickup', item: k });
    }
    return out;
  }
  if (d.flags) return Object.entries(s.talk).map(([who]) => ({ type: 'talk', who }));
  return [];
}

function playthrough(choice, { saveAt } = {}) {
  let q = new Quest(null, { story: 'classic' });
  q.choiceToMake = choice;
  const effects = [...q.start()];
  let guard = 0;
  while (q.state.step !== 'e.free' && guard++ < 200) {
    if (saveAt && q.state.step === saveAt) {
      const json = JSON.stringify(q.save());
      q = new Quest(JSON.parse(json));
      q.choiceToMake = choice;
      saveAt = null;
    }
    // the choice event is dispatched after the confrontation dialogue
    const evs = q.step.id === 'c4.shed' ? [{ type: 'talk', who: 'genzo' }, { type: 'choice', id: 'confession', value: choice }] : eventsFor(q);
    assert.ok(evs.length, `no events for ${q.step.id}`);
    for (const ev of evs) effects.push(...q.dispatch(ev));
  }
  return { q, effects };
}

test('every dialogue referenced by the story exists and speakers are in the cast', () => {
  assert.deepEqual(missingDialogue(), []);
  for (const [id, lines] of Object.entries(DIALOGUE)) for (const l of lines) {
    if (l.choice) continue;
    assert.ok(CAST[l[0]], `${id}: unknown speaker ${l[0]}`);
    assert.ok(l[1].length <= 190, `${id}: line too long for a phone dialogue box (${l[1].length})`);
  }
});

test('full story completes with the "alone" confession choice', () => {
  const { q, effects } = playthrough('alone');
  assert.equal(q.state.step, 'e.free');
  assert.equal(q.state.chapter, 5);
  assert.deepEqual(Object.keys(q.state.lamps).sort(), ['forest', 'mill', 'orchard', 'viaduct']);
  assert.deepEqual([...q.state.pages].sort(), [0, 1, 2, 3]);
  const said = effects.filter(e => e.say).map(e => e.say);
  assert.ok(said.includes('c4_meeting_alone') && said.includes('epilogue_alone'));
  assert.ok(!said.includes('c4_meeting_together'));
  for (const s of said) assert.ok(DIALOGUE[s], `dialogue ${s} exists`);
  // seasons advance one per chapter
  const seasons = effects.filter(e => e.season).map(e => e.season);
  assert.deepEqual([...new Set(seasons)], ['spring', 'summer', 'autumn', 'winter']);
  // quest items are consumed, not hoarded
  for (const k of ['cog', 'fish', 'plate', 'peach', 'bun', 'key', 'chestnut', 'mushroom', 'honeycomb', 'honeyChestnuts']) assert.equal(q.count(k), 0, `${k} left over`);
});

test('the "together" choice changes the platform scene and the epilogue', () => {
  const { effects } = playthrough('together');
  const said = effects.filter(e => e.say).map(e => e.say);
  assert.ok(said.includes('c4_meeting_together') && said.includes('epilogue_together'));
});

test('saving mid-game and loading resumes the same step with state intact', () => {
  const { q } = playthrough('alone', { saveAt: 'c2.crows' });
  assert.equal(q.state.step, 'e.free');
  const mid = new Quest(null, { story: 'classic' });
  mid.start();
  while (mid.state.step !== 'c3.gather') for (const ev of (mid.step.id === 'c4.shed' ? [] : eventsFor(mid))) mid.dispatch(ev);
  const loaded = new Quest(JSON.parse(JSON.stringify(mid.save())));
  assert.equal(loaded.state.step, 'c3.gather');
  const resume = loaded.start();
  assert.ok(resume.some(e => e.unlock === 'orchardGate'));
  assert.ok(resume.some(e => e.lamp === 'mill') && resume.some(e => e.lamp === 'orchard'));
  assert.ok(!resume.some(e => e.say), 'resuming never replays dialogue');
});

test('picking items early satisfies a later step immediately, and counts show in objectives', () => {
  const q = new Quest(null, { story: 'classic' });
  q.start();
  while (q.state.step !== 'c1.trout') for (const ev of eventsFor(q)) q.dispatch(ev);
  q.dispatch({ type: 'pickup', item: 'cog' });
  q.dispatch({ type: 'talk', who: 'ota' });
  assert.equal(q.state.step, 'c1.cogs');
  assert.match(q.objective(), /\(1\/3\)/);
  q.dispatch({ type: 'pickup', item: 'cog' });
  q.dispatch({ type: 'pickup', item: 'cog' });
  assert.equal(q.state.step, 'c1.wheel');
});

test('fallen stars are counted once each and all twelve unlock the last letter', () => {
  const q = new Quest(null, { story: 'classic' });
  q.start();
  for (let i = 1; i <= 12; i++) { q.dispatch({ type: 'pickup', item: 'star', id: `fs${i}` }); q.dispatch({ type: 'pickup', item: 'star', id: `fs${i}` }); }
  assert.equal(q.state.stars.length, 12);
  assert.ok(q.state.flags.allStars);
});

test('a twelfth star found before the epilogue is remembered, and Starfall Night waits for the epilogue', () => {
  const q = new Quest(null, { story: 'classic' });
  q.start();
  const early = [];
  for (let i = 1; i <= 12; i++) early.push(...q.dispatch({ type: 'pickup', item: 'star', id: `fs${i}` }));
  assert.ok(q.state.flags.allStars, 'the twelve stars are remembered');
  assert.ok(!early.some(e => e.allStars), 'Starfall Night must not play mid-chapter (its event would match no step and be lost)');
  const epilogue = q.enter(STEPS.find(s => s.id === 'e.free'));
  assert.ok(epilogue.some(e => e.allStars), 'it plays when the epilogue begins');
});

test('a save with fields of the wrong shape is repaired instead of crashing the title screen or journal', () => {
  const bad = { ...freshState(), stars: null, pages: {}, inv: 'x', flags: [], lamps: 7, chapter: 99, playtime: 'soon', hour: NaN };
  const s = migrate(bad);
  assert.ok(Array.isArray(s.stars) && Array.isArray(s.pages));
  assert.ok(s.inv && typeof s.inv === 'object' && !Array.isArray(s.flags) && typeof s.lamps === 'object');
  assert.equal(typeof s.playtime, 'number');
  assert.ok(Number.isFinite(s.hour));
  assert.ok(s.chapter >= 0 && s.chapter < CHAPTERS.length, 'the chapter is clamped to a real one');
  assert.equal(migrate({ ...freshState(), chapter: -3 }).chapter, 0);
});

test('all twelve stars and Starfall Night end the story: The End, then the valley to explore', () => {
  const { q } = playthrough('together');
  assert.equal(q.state.step, 'e.free');
  const found = [];
  for (let i = 1; i <= 12; i++) found.push(...q.dispatch({ type: 'pickup', item: 'star', id: `fs${i}` }));
  assert.ok(found.some(e => e.allStars), 'the twelfth star starts Starfall Night');
  assert.equal(q.state.step, 'e.free', 'Starfall Night plays before the story moves on');
  const end = q.dispatch({ type: 'cutscene', id: 'starfall' });
  assert.ok(end.some(e => e.cutscene === 'theEnd'), 'The End plays');
  assert.equal(q.state.step, 'e.done');
  assert.match(q.objective(), /complete/);
  // a save from the free-roam epilogue loads and stays there
  const loaded = new Quest(JSON.parse(JSON.stringify(q.save())));
  assert.equal(loaded.state.step, 'e.done');
  assert.ok(!loaded.start().some(e => e.say));
});

test('chatter never runs out and unknown NPCs fall back to villager lines', () => {
  const q = new Quest(null, { story: 'classic' });
  for (const who of [...Object.keys(CHATTER), 'stranger']) for (let i = 0; i < 12; i++) {
    const t = q.talkFor(who);
    assert.ok(t.line?.[1], `${who} says something`);
  }
});

test('broken or foreign saves fall back to a fresh game', () => {
  assert.equal(migrate(null).step, freshState().step);
  assert.equal(migrate({ step: 'nope' }).step, freshState().step);
  assert.equal(migrate({ step: 'c2.bell', inv: { key: 1 } }).inv.key, 1);
});

test('every step has an objective and inventory items have names and icons', () => {
  for (const s of STEPS) assert.ok(s.objective && s.chapter !== undefined, s.id);
  for (const [k, it] of Object.entries(ITEMS)) assert.ok(it.name && it.icon, k);
});

test('resume re-applies world spawns before unlocks, so a repaired viaduct stays repaired', async () => {
  const { stateAt } = await import('./e2e/fastforward.mjs');
  const q = new Quest(stateAt('c4.board', 'alone', 'classic'));
  const fx = q.start();
  const iRepair = fx.findIndex(e => e.spawn === 'repair'), iViaduct = fx.findIndex(e => e.unlock === 'viaduct');
  assert.ok(iRepair >= 0 && iViaduct > iRepair, 'repair spawn comes before the viaduct unlock');
  assert.ok(q.resumed);
});

test('a save taken during the Star Train ride resumes at boarding, and chapter-end saves keep the next season', async () => {
  const { stateAt } = await import('./e2e/fastforward.mjs');
  const ride = stateAt('c4.ride', 'alone', 'classic');
  ride.inv.lanterns = 5;
  const q = new Quest(ride);
  assert.equal(q.state.step, 'c4.board');
  assert.equal(q.count('lanterns'), 0);
  // the engine applies the next chapter's season/time synchronously with the step change
  const winter = stateAt('c4.shed', 'alone', 'classic');
  assert.equal(winter.season, 'winter');
  assert.equal(winter.hour, 10.5);
});

test('the treasure hunt: Tamo asks, yes counts every treasure, and finding them all says so', async () => {
  const { HUNT, huntProgress, SKY_LETTERS, KEEPSAKES } = await import('../src/game/story.js');
  const { q } = playthrough('together');
  const fx = q.dispatch({ type: 'choice', id: 'hunt', value: 'yes' });
  assert.ok(fx.some(e => e.say === 'hunt_yes'));
  assert.ok(q.state.flags.hunt && q.state.flags.huntAsked);
  assert.equal(q.state.choice, 'together', 'the confession choice is untouched');
  assert.match(q.objective(), /then Sora's treasures \(0\/13\)/);
  assert.equal(HUNT.length, 4 + SKY_LETTERS.length + KEEPSAKES.length);
  for (let i = 1; i <= 12; i++) q.dispatch({ type: 'pickup', item: 'star', id: `fs${i}` });
  q.dispatch({ type: 'cutscene', id: 'starfall' });
  assert.equal(q.state.step, 'e.done');
  assert.match(q.objective(), /Treasure hunt: .*\(0\/13\)/);
  const st = q.state;
  st.inv.kite = 1; st.treasures.musicBox = true; st.treasures.compass = true; st.flags.treePlanted = true;
  st.letters = SKY_LETTERS.map(l => l.id); st.keepsakes = KEEPSAKES.map(k => k.id);
  assert.deepEqual(huntProgress(st), { found: 13, total: 13 });
  assert.match(q.objective(), /Every treasure found/);
  // no thanks: the objective stays the plain one
  const other = playthrough('alone').q;
  assert.ok(other.dispatch({ type: 'choice', id: 'hunt', value: 'no' }).some(e => e.say === 'hunt_no'));
  assert.ok(!other.state.flags.hunt);
  assert.match(other.objective(), /find all 12 Fallen Stars/);
});
