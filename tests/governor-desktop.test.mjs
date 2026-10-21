import test from 'node:test';
import assert from 'node:assert/strict';
import { Governor, settingsAt, LADDER, LADDER_DESKTOP, ladderFor } from '../src/engine/governor.js';
import { QUALITY } from '../src/engine/renderer.js';
import { pickQuality, HIGH_PIXELS } from '../src/engine/quality-pick.js';

const DISTANCES = ['npcDraw', 'npcAnim', 'npcShadow', 'propDist', 'buildDist', 'midDist'];
const run = (g, dt, seconds) => { const seen = []; for (let t = 0; t < seconds; t += dt) { const l = g.frame(dt); if (l !== null) seen.push(l); } return seen; };

test('desktop ladder: Low keeps its own ladder, Medium and High use the desktop one', () => {
  assert.equal(ladderFor('low'), LADDER);
  assert.equal(ladderFor('medium'), LADDER_DESKTOP);
  assert.equal(ladderFor('high'), LADDER_DESKTOP);
});

test('desktop ladder: resolution first, then multisampling and the shadow map, then distances', () => {
  const first = LADDER_DESKTOP[1], second = LADDER_DESKTOP[2];
  assert.ok(first.scale && second.scale, 'the first two steps are resolution');
  const at = key => LADDER_DESKTOP.findIndex(s => key in s);
  assert.ok(at('msaa') > 2 && at('shadowK') > at('msaa'), 'multisampling, then the shadow map');
  assert.ok(at('distK') > at('shadowK'), 'distances come after the shadow map');
});

for (const name of ['medium', 'high']) {
  test(`desktop ladder on ${name}: every step is lighter than the one before and the valley is never emptied`, () => {
    const base = QUALITY[name];
    let prev = settingsAt(base, 0, LADDER_DESKTOP);
    assert.equal(prev.scale, 1);
    assert.deepEqual(prev.q, base, 'level 0 is the tier as designed');
    let changed = 0;
    for (let l = 1; l < LADDER_DESKTOP.length; l++) {
      const cur = settingsAt(base, l, LADDER_DESKTOP);
      assert.ok(cur.scale <= prev.scale, `scale at ${l}`);
      assert.ok(cur.q.msaa <= prev.q.msaa, `msaa at ${l}`);
      assert.ok(cur.q.shadow <= prev.q.shadow, `shadow at ${l}`);
      assert.ok(cur.q.shadowEvery >= (prev.q.shadowEvery ?? 1), `shadowEvery at ${l}`);
      for (const k of DISTANCES) if (prev.q[k] !== undefined) assert.ok(cur.q[k] <= prev.q[k], `${k} at ${l}`);
      assert.ok(cur.q.shadow >= 1024 && cur.scale >= 0.6);
      assert.ok(cur.q.npcDraw >= 45 && cur.q.propDist >= 55 && cur.q.buildDist >= 200, 'the valley is never emptied');
      assert.notDeepEqual([cur.scale, cur.q], [prev.scale, prev.q], `step ${l} changes something`);
      changed++;
      prev = cur;
    }
    assert.equal(changed, LADDER_DESKTOP.length - 1);
  });
}

test('desktop ladder: High loses the shadow map size, Medium too, and MSAA goes to 0', () => {
  const top = settingsAt(QUALITY.high, LADDER_DESKTOP.length - 1, LADDER_DESKTOP).q;
  assert.equal(top.msaa, 0);
  assert.equal(top.shadow, 2048);
  assert.equal(settingsAt(QUALITY.medium, LADDER_DESKTOP.length - 1, LADDER_DESKTOP).q.shadow, 1024);
});

test('desktop governor: slow frames walk down the desktop ladder step by step', () => {
  const g = new Governor({ levels: LADDER_DESKTOP.length });
  const seen = run(g, 1 / 20, 200);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(run(new Governor({ levels: LADDER_DESKTOP.length }), 1 / 60, 60).length, 0, 'smooth frames change nothing');
});

test('first pick: the saved choice always wins', () => {
  assert.equal(pickQuality({ saved: 'high', renderer: 'SwiftShader', mobile: true, deviceMemory: 1 }), 'high');
  assert.equal(pickQuality({ saved: 'low', renderer: 'NVIDIA GeForce RTX 4090' }), 'low');
  assert.equal(pickQuality({ saved: 'bogus', renderer: 'NVIDIA GeForce RTX 4090' }), 'high', 'an unknown saved value is ignored');
});

test('first pick: software and phones are Low; integrated and old chips are Medium; strong chips are High', () => {
  assert.equal(pickQuality({ renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' }), 'low');
  assert.equal(pickQuality({ renderer: 'Apple GPU', mobile: true }), 'low');
  assert.equal(pickQuality({ renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)' }), 'medium');
  assert.equal(pickQuality({ renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)' }), 'medium');
  assert.equal(pickQuality({ renderer: 'ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11)' }), 'medium');
  assert.equal(pickQuality({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GT 730 Direct3D11)' }), 'medium');
  assert.equal(pickQuality({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)' }), 'high');
  assert.equal(pickQuality({ renderer: 'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11)' }), 'high');
  assert.equal(pickQuality({ renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' }), 'high');
  assert.equal(pickQuality({ renderer: 'something unknown' }), 'medium');
});

test('first pick: a 4K display needs an ultra chip for High, and few cores or little memory cap it at Medium', () => {
  const rtx3060 = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)', rtx4080 = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11)';
  assert.ok(3840 * 2160 > HIGH_PIXELS);
  assert.equal(pickQuality({ renderer: rtx3060, width: 3840, height: 2160, dpr: 1 }), 'medium');
  assert.equal(pickQuality({ renderer: rtx4080, width: 3840, height: 2160, dpr: 1 }), 'high');
  assert.equal(pickQuality({ renderer: rtx3060, width: 1920, height: 1080, dpr: 1 }), 'high');
  assert.equal(pickQuality({ renderer: rtx3060, width: 1440, height: 900, dpr: 2 }), 'high', '2.6 M physical pixels');
  assert.equal(pickQuality({ renderer: rtx3060, width: 1920, height: 1080, dpr: 2 }), 'medium', '8.3 M physical pixels is a 4K panel');
  assert.equal(pickQuality({ renderer: rtx4080, cores: 4 }), 'medium');
  assert.equal(pickQuality({ renderer: rtx4080, deviceMemory: 4 }), 'medium');
  assert.equal(pickQuality({ renderer: rtx4080, deviceMemory: 8, cores: 16 }), 'high');
  assert.equal(pickQuality({ renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620)', deviceMemory: 2 }), 'low');
});
