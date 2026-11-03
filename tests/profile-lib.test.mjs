// The CPU-profile analysis the perf tools share (tests/perf/profile-lib.mjs), on a profile small enough to check by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, withoutPseudo } from './perf/profile-lib.mjs';

// root -> frame -> { render -> draw (twice: under render and under shadow), update }; and recursion: update -> update
const node = (id, fn, line, children = [], url = 'http://x/assets/game-AbCdEf12.js') => ({ id, callFrame: { functionName: fn, url, lineNumber: line }, children });
const profile = {
  nodes: [
    node(1, '(root)', 0, [2], ''),
    node(2, 'frame', 10, [3, 6, 8]),
    node(3, 'render', 20, [4, 5]),
    node(4, 'draw', 30),
    node(5, 'shadow', 40, [7]),
    node(6, 'update', 50, [9]),
    node(7, 'draw', 30),
    node(8, '(program)', 0, [], ''),
    node(9, 'update', 50),
  ],
  // sample i is taken in node samples[i]; timeDeltas in microseconds: draw 4 ms + 2 ms, render 1 ms, update 1 + 3 ms (recursive), program 5 ms
  samples: [4, 7, 3, 6, 9, 8],
  timeDeltas: [4000, 2000, 1000, 1000, 3000, 5000],
};

test('self time by function and by file, in milliseconds, with the build hash taken off the file name', () => {
  const A = analyse(profile);
  assert.equal(A.self.get('draw game.js:31'), 6, 'one function called from two places adds up');
  assert.equal(A.self.get('update game.js:51'), 4);
  assert.equal(A.files.get('game.js'), 11, 'file totals leave out the native (program) row');
  assert.equal(Math.round(A.sampledMs), 16);
});

test('total time counts a recursive function once, and callers and callees are split correctly', () => {
  const A = analyse(profile);
  assert.equal(A.total.get('update game.js:51'), 4, 'update(1) -> update(3): 4 ms once, not 4 + 3');
  assert.equal(A.total.get('render game.js:21'), 7, 'render = 1 own + draw 4 + shadow(draw 2)');
  assert.deepEqual([...A.callersOf('draw')].sort(), [['render:21 < frame:11 < (root):1', 4], ['shadow:41 < render:21 < frame:11', 2]]);
  assert.deepEqual([...A.inside('render game.js:21')].sort(), [['draw game.js:31', 4], ['shadow game.js:41', 2]]);
  assert.deepEqual([...withoutPseudo(A.total)].some(([k]) => /^\(/.test(k)), false);
});
