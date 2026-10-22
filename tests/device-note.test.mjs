// The weak-device card before a story (src/engine/device-note.js, docs/play-zones/phase-1-device-notice.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteWanted } from '../src/engine/device-note.js';

test('the card is for weak devices only, decided by power and not by "is it a phone"', () => {
  assert.equal(noteWanted({ tier: 'low', memory: 2, cores: 8 }), true, 'little memory');
  assert.equal(noteWanted({ tier: 'low', memory: 8, cores: 4 }), true, 'few cores');
  assert.equal(noteWanted({ tier: 'low', memory: 8, cores: 8, slow: true }), true, 'frames ran slow before');
  assert.equal(noteWanted({ tier: 'low', memory: 8, cores: 8 }), false, 'a capable phone on Low');
  assert.equal(noteWanted({ tier: 'low' }), false, 'nothing known (Safari): no card');
  assert.equal(noteWanted({ tier: 'medium', memory: 2, cores: 2, slow: true }), false, 'Medium and High never');
});

test('once per device, never in QA runs unless asked for', () => {
  const weak = { tier: 'low', memory: 2, cores: 2 };
  assert.equal(noteWanted({ ...weak, seen: true }), false, 'seen once');
  assert.equal(noteWanted({ ...weak, qa: true }), false, 'QA');
  assert.equal(noteWanted({ tier: 'high', memory: 32, cores: 16, seen: true, qa: true, force: true }), true, '?devicenote=1');
});
