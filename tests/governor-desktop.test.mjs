import test from 'node:test';
import assert from 'node:assert/strict';
import { Governor, settingsAt, LADDER, LADDER_DESKTOP, LADDER_PC, SS_STEP, PC_HOLD, ladderFor, governorFor } from '../src/engine/governor.js';
import { QUALITY } from '../src/engine/renderer.js';
import { pickQuality, HIGH_PIXELS } from '../src/engine/quality-pick.js';

const DISTANCES = ['npcDraw', 'npcAnim', 'npcShadow', 'propDist', 'buildDist', 'midDist'];
const run = (g, dt, seconds) => { const seen = []; for (let t = 0; t < seconds; t += dt) { const l = g.frame(dt); if (l !== null) seen.push(l); } return seen; };

test('ladders: Low keeps its own; a desktop in Auto the PC one; phones and Balanced the old desktop one (pixels first)', () => {
  assert.equal(ladderFor('low'), LADDER);
  assert.equal(ladderFor('low', { mode: 'balanced', mobile: true }), LADDER);
  assert.equal(ladderFor('medium'), LADDER_PC);
  assert.equal(ladderFor('high'), LADDER_PC);
  assert.deepEqual(ladderFor('high', { ss: true }), [LADDER_PC[0], SS_STEP, ...LADDER_PC.slice(1)], 'supersampled: that goes first');
  for (const name of ['medium', 'high']) {
    assert.equal(ladderFor(name, { mobile: true }), LADDER_DESKTOP, `${name} on a phone: as before`);
    assert.equal(ladderFor(name, { mode: 'balanced' }), LADDER_DESKTOP, `${name} Balanced: as before`);
    assert.equal(ladderFor(name, { mode: 'balanced', ss: true }), LADDER_DESKTOP);
  }
  for (const [name, ctx] of [['low', {}], ['medium', {}], ['high', { ss: true }], ['high', { mobile: true }]]) {
    const l = ladderFor(name, { ...ctx, mode: 'sharp' });
    assert.ok(l.length >= 4 && l.every(s => !('scale' in s) && !('ss' in s)), `Sharp on ${name} never changes the resolution`);
  }
});

test('PC ladder: supersampling first, then the shadow map, the glow, multisampling and distances; the resolution last', () => {
  const at = key => LADDER_PC.findIndex(s => key in s);
  const ss = ladderFor('high', { ss: true });
  assert.equal(ss.findIndex(s => 'ss' in s), 1);
  assert.ok(at('shadowK') < at('bloomHalf') && at('bloomHalf') < at('msaa') && at('msaa') < at('distK'), 'the cheaper looks in order');
  assert.ok(at('scale') > at('distK'), 'below the screen resolution only after all of those');
  const { opts } = governorFor('high', { ss: true });
  assert.deepEqual(opts.holds, ss.map(s => (s.scale ? PC_HOLD : 0)), 'every step below native waits for a long slow stretch');
  assert.equal(opts.calm, 2, 'and the climb back is quick');
  assert.equal(governorFor('high', { mobile: true }).opts.holds, undefined, 'phones: as before');
  assert.equal(governorFor('high', { mode: 'balanced' }).opts.holds, undefined, 'Balanced: as before');
});

for (const [name, ctx] of [['medium', {}], ['high', {}], ['high', { ss: true }], ['high', { mode: 'sharp', ss: true }]]) {
  test(`PC ladder on ${name} ${JSON.stringify(ctx)}: every step is lighter than the one before and the valley is never emptied`, () => {
    const base = QUALITY[name], ladder = ladderFor(name, ctx);
    let prev = settingsAt(base, 0, ladder);
    assert.equal(prev.scale, 1); assert.equal(prev.ss, true);
    assert.deepEqual(prev.q, base, 'level 0 is the tier as designed');
    for (let l = 1; l < ladder.length; l++) {
      const cur = settingsAt(base, l, ladder);
      assert.ok(cur.scale <= prev.scale, `scale at ${l}`);
      assert.ok(!(cur.ss && !prev.ss), `supersampling never comes back at ${l}`);
      assert.ok(cur.q.msaa <= prev.q.msaa && cur.q.shadow <= prev.q.shadow, `msaa / shadow at ${l}`);
      assert.ok((cur.q.shadowEvery ?? 1) >= (prev.q.shadowEvery ?? 1), `shadowEvery at ${l}`);
      assert.ok(!(prev.q.bloomHalf && !cur.q.bloomHalf), `the lighter glow stays at ${l}`);
      for (const k of DISTANCES) if (prev.q[k] !== undefined) assert.ok(cur.q[k] <= prev.q[k], `${k} at ${l}`);
      assert.ok(cur.q.shadow >= 1024 && cur.scale >= 0.7);
      assert.ok(cur.q.npcDraw >= 45 && cur.q.propDist >= 55 && cur.q.buildDist >= 200, 'the valley is never emptied');
      assert.notDeepEqual([cur.scale, cur.ss, cur.q], [prev.scale, prev.ss, prev.q], `step ${l} changes something`);
      prev = cur;
    }
  });
}

test('PC governor: slow frames take the cheaper steps every ~4 s, but wait ~10 s of slow frames before going below native', () => {
  const { ladder, opts } = governorFor('high', { ss: true });
  const g = new Governor({ levels: ladder.length, ...opts });
  const at = [];
  for (let t = 0; t < 120; t += 1 / 20) { const l = g.frame(1 / 20); if (l !== null) at.push([l, +t.toFixed(1)]); }
  assert.deepEqual(at.map(a => a[0]), [1, 2, 3, 4, 5, 6, 7, 8], 'all the way down when it really is that slow');
  const firstRes = ladder.findIndex(s => s.scale), t = l => at.find(a => a[0] === l)[1];
  assert.ok(t(1) <= 4.1, 'the supersampling goes after two slow windows');
  assert.ok(t(firstRes) - t(firstRes - 1) >= PC_HOLD * 2 - 0.2, `below native only after ${PC_HOLD} slow windows (${t(firstRes) - t(firstRes - 1)} s)`);
});

test('PC governor: hitches alone (a few long frames, the median fine) never take the picture below native', () => {
  const { ladder, opts } = governorFor('high', { ss: true });
  const g = new Governor({ levels: ladder.length, ...opts });
  for (let i = 0; i < 60 * 300; i++) g.frame(i % 12 === 0 ? 0.08 : 1 / 60);
  assert.ok(g.level < ladder.findIndex(s => s.scale), `level ${g.level}: no step below native`);
});

test('shared GPU: 30 s of slow frames, then smooth again. Before: down to 62 % and back after more than a minute; now: never below 85 %, back sooner', () => {
  const trace = (g, ladder) => {
    const out = { minScale: 1, backAt: null };
    let t = 0;
    while (t < 200) {
      const busy = t < 30, dt = busy ? 0.045 : 1 / 60;
      g.frame(dt); t += dt;
      const s = settingsAt(QUALITY.high, g.level, ladder).scale;
      out.minScale = Math.min(out.minScale, s);
      if (!busy && g.level === 0 && out.backAt === null) out.backAt = Math.round(t);
    }
    return out;
  };
  const old = trace(new Governor({ levels: LADDER_DESKTOP.length }), LADDER_DESKTOP);
  const { ladder, opts } = governorFor('high', { ss: true });
  const now = trace(new Governor({ levels: ladder.length, ...opts }), ladder);
  assert.ok(old.minScale <= 0.62 && old.backAt > 90, `before: ${JSON.stringify(old)}`);
  assert.ok(now.minScale >= 0.85 && now.backAt < old.backAt - 30, `now: ${JSON.stringify(now)} (before ${JSON.stringify(old)})`);
});

test('PC governor: a regretted climb holds the lower level for a while (90 s), not for good (the other job on the GPU ends)', () => {
  const { ladder, opts } = governorFor('high', {});
  const g = new Governor({ levels: ladder.length, ...opts });
  const changes = [];
  for (let t = 0; t < 400;) { const dt = g.level === 0 && t < 200 ? 1 / 22 : 1 / 60; t += dt; const l = g.frame(dt); if (l !== null) changes.push([l, Math.round(t)]); }
  assert.deepEqual(changes.slice(0, 3).map(c => c[0]), [1, 0, 1], 'down, one try back up, down again');
  const back = changes.find((c, i) => i >= 3 && c[0] === 0);
  assert.ok(back && back[1] - changes[2][1] >= 85, `tries again only after a while: ${JSON.stringify(changes)}`);
  assert.ok(changes.length < 12, 'never bounces quickly');
});

test('PC governor: at 45 fps only the supersampling goes; at 30 fps the cheaper looks too, but the picture stays native', () => {
  const { ladder, opts } = governorFor('high', { ss: true });
  const firstRes = ladder.findIndex(s => s.scale);
  const at = ms => { const g = new Governor({ levels: ladder.length, ...opts }); for (let t = 0; t < 180; t += ms / 1000) g.frame(ms / 1000); return g.level; };
  assert.equal(at(1000 / 60), 0, '60 fps: nothing changes');
  assert.equal(at(22), 1, '45 fps: back to the screen\'s resolution, the rest kept');
  assert.equal(at(33.3), firstRes - 1, '30 fps: every cheaper look goes, the resolution stays');
  assert.ok(at(45) >= firstRes, 'only under 26 fps, for a long stretch, the picture softens');
  // Balanced and phones: the old single line (26 fps) for every step
  const old = new Governor({ levels: LADDER_DESKTOP.length }); for (let t = 0; t < 180; t += 0.0333) old.frame(0.0333);
  assert.equal(old.level, 0, 'the old governor never acted at 30 fps');
});

test('desktop ladder (Balanced, phones): resolution first, then multisampling and the shadow map, then distances', () => {
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
      assert.ok((cur.q.shadowEvery ?? 1) >= (prev.q.shadowEvery ?? 1), `shadowEvery at ${l}`);
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
