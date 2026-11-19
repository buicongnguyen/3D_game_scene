// Haptics (engine/haptics.js): a rumble on a gamepad, a short buzz on a phone, throttled per kind, off when switched off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Haptics, HAPTICS, mayBuzz } from '../src/engine/haptics.js';

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}
function fakePad() {
  const calls = [];
  return { calls, pad: { connected: true, vibrationActuator: { playEffect: (type, o) => { calls.push([type, o]); return Promise.resolve('complete'); } } } };
}

test('every kind has a phone pattern, a rumble and a gap', () => {
  for (const [kind, h] of Object.entries(HAPTICS)) {
    assert.ok(Array.isArray(h.phone) && h.phone.length % 2 === 1 && h.phone.every(ms => ms > 0 && ms <= 200), kind);
    assert.ok(h.pad.ms > 0 && h.pad.ms <= 600 && h.pad.strong >= 0 && h.pad.strong <= 1 && h.pad.weak >= 0 && h.pad.weak <= 1, kind);
    assert.ok(h.gap > 0, kind);
  }
});

test('a kind waits for its own gap; other kinds do not', () => {
  const st = { on: true, last: { tick: 10 } };
  assert.equal(mayBuzz(st, 'tick', 10 + HAPTICS.tick.gap / 2), false);
  assert.equal(mayBuzz(st, 'tick', 10 + HAPTICS.tick.gap), true);
  assert.equal(mayBuzz(st, 'lamp', 10), true);
  assert.equal(mayBuzz(st, 'nope', 99), false);
  assert.equal(mayBuzz({ on: false, last: {} }, 'lamp', 0), false);
});

test('a connected gamepad rumbles (scaled), and a quick second tick is dropped', () => {
  let now = 0;
  const { pad, calls } = fakePad();
  const h = new Haptics({ nav: { getGamepads: () => [null, pad] }, store: memStore(), now: () => now });
  assert.equal(h.buzz('land', 0.5), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'dual-rumble');
  assert.equal(calls[0][1].strongMagnitude, HAPTICS.land.pad.strong * 0.5);
  assert.equal(h.buzz('land'), false, 'within the gap');
  now = 1;
  assert.equal(h.buzz('land'), true);
  assert.equal(calls.length, 2);
});

test('Settings off is kept, stops any buzz and silences the next ones', () => {
  const store = memStore();
  const stops = [];
  const nav = { vibrate: p => { stops.push(p); return true; }, getGamepads: () => [] };
  const h = new Haptics({ nav, store, now: () => 0 });
  assert.equal(h.on, true);
  h.setOn(false);
  assert.deepEqual(stops, [0]);
  assert.equal(h.buzz('lamp'), false);
  assert.equal(new Haptics({ nav, store }).on, false, 'remembered');
  h.setOn(true);
  assert.equal(new Haptics({ nav, store }).on, true);
});

test('without a coarse pointer (a desktop, or node) a vibrate function is never called', () => {
  const seen = [];
  const h = new Haptics({ nav: { vibrate: p => { seen.push(p); return true; }, getGamepads: () => [] }, store: memStore(), now: () => 0 });
  assert.equal(h.buzz('pickup'), false);
  assert.deepEqual(seen, []);
});
