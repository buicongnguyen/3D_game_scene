import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOUR, captionFor } from '../src/content/tour.js';

const early = { lamps: {}, unlocked: {} };
const complete = { lamps: { mill: true, orchard: true, forest: true, viaduct: true }, unlocked: { drawbridge: true, viaduct: true } };
const line = (id, place, progress) => { const tour = TOUR[id]; return captionFor(tour, tour.stops.find(s => s.place === place), progress); };

test('paused tours describe unfinished lamps, mill and viaduct without showing progress spoilers', () => {
  assert.equal(line('spring', 'mill', early), 'The old mill rests beside the river.');
  assert.equal(line('night', 'mill', early), 'The Mill Lamp waits quietly on its island.');
  assert.equal(line('night', 'shrine', early), 'The Forest Shrine stands quiet above the trees.');
  assert.equal(line('night', 'takamori', early), 'The bell tower watches over the sleeping square.');
  assert.equal(line('winter', 'viaduct', early), 'The viaduct waits above the river.');
});

test('partial lamp progress keeps completed captions and protects only unfinished places', () => {
  const partial = { lamps: { mill: true }, unlocked: { drawbridge: true } };
  assert.equal(line('night', 'mill', partial), line('night', 'mill', complete));
  assert.equal(line('spring', 'mill', partial), line('spring', 'mill', complete));
  assert.equal(line('night', 'shrine', partial), 'The Forest Shrine stands quiet above the trees.');
  assert.equal(line('summer', 'takamori', partial), 'Afternoon settles over the hilltop square.');
  assert.equal(line('spring', 'viaduct', partial), 'The viaduct waits above the river.');
});

test('completed and title tours retain every authored caption', () => {
  for (const tour of Object.values(TOUR)) for (const stop of tour.stops) {
    assert.equal(captionFor(tour, stop, complete), stop.line);
    assert.equal(captionFor(tour, stop), stop.line);
  }
});
