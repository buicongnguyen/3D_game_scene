// Even frames on slow phones (src/engine/pacer.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pacer } from '../src/engine/pacer.js';

const run = (p, ms, n) => { let last = null; for (let i = 0; i < n; i++) { const r = p.feed(ms); if (r !== null) last = r; } return last; };

test('a phone that cannot keep 60 is paced to an even 30, and back when the work gets light', () => {
  const p = new Pacer();
  assert.equal(run(p, 12, 300), null, 'light work: every frame');
  assert.equal(p.pace, 0);
  run(p, 25, 60);
  assert.equal(p.pace, 0, 'one slow window is not enough');
  run(p, 25, 60);
  assert.ok(Math.abs(p.pace - 1000 / 30) < 1e-9, 'two slow windows: 30 fps');
  run(p, 14, 600);
  assert.ok(p.pace > 0, 'in between: stays paced (no flapping)');
  run(p, 8, 240);
  assert.equal(p.pace, 0, 'quiet for four windows: every frame again');
});
