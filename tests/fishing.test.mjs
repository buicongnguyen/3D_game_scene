import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FishingSim, School, CAST, REEL, SIZE, pickSpecies, fishSize, fishPower, makeFish, planCast, sizeFraction } from '../src/game/fishing/sim.js';
import { FISH } from '../src/game/story.js';
import { rng } from '../src/engine/spline.js';

const DT = 1 / 60;

/** Play one cast with a policy(sim) -> held; returns { sim, log: [[t, event]], t }. */
function play(policy, { seed = 1, limit = 120, ...opts } = {}) {
  const rand = rng(seed);
  const sim = new FishingSim({ rand, choose: () => makeFish(FISH, rand, { easy: opts.easy, forced: opts.forced, dusk: opts.dusk }), ...opts });
  const log = [];
  let t = 0;
  while (!sim.over && t < limit) {
    for (const e of sim.update(DT, !!policy(sim, t))) log.push([+t.toFixed(2), e]);
    t += DT;
  }
  return { sim, log, t, names: log.map(l => l[1]) };
}

// the careful angler: strike on the bite, reel while the line is calm, let go on a surge or when it strains
const careful = s => s.phase === 'bite' || (s.phase === 'hooked' && !s.surging && s.tension < 0.7);
// the brute: strike, then never let go
const brute = s => s.phase === 'bite' || s.phase === 'hooked';

test('a clean catch: cast, wait, the fish comes and nibbles, bite, hook, reel it in', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { sim, names, t } = play(careful, { seed });
    assert.equal(sim.result, 'caught', `seed ${seed}: ${sim.result} (${sim.reason}) after ${t.toFixed(1)} s`);
    const order = ['land', 'attract', 'nibble', 'bite', 'hook', 'caught'].map(e => names.indexOf(e));
    assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), `seed ${seed}: ${names.join(' ')}`);
    assert.ok(t < 60, `seed ${seed} took ${t.toFixed(1)} s`);
    assert.ok(sim.fish.cm >= SIZE[sim.fish.species][0] && sim.fish.cm <= SIZE[sim.fish.species][1]);
  }
});

test('the float lands after the flight, and the press that cast it is not a strike', () => {
  const sim = new FishingSim({ rand: rng(3) });
  let t = 0;
  const ev = [];
  while (sim.phase === 'cast') { ev.push(...sim.update(DT, true)); t += DT; }   // still holding the cast button
  assert.ok(Math.abs(t - CAST.flight) < 0.05);
  assert.deepEqual(ev, ['land']);
  for (let i = 0; i < 30; i++) ev.push(...sim.update(DT, true));
  assert.equal(sim.early, 0, 'a held button is not a new press');
});

test('pressing early scares the fish: the wait starts over and nothing is hooked', () => {
  const rand = rng(7);
  const sim = new FishingSim({ rand, choose: () => makeFish(FISH, rand) });
  let seen = null;
  for (let t = 0; t < 30 && !seen; t += DT) { sim.update(DT, false); if (sim.phase === 'nibble') seen = t; }
  assert.ok(seen !== null, 'a fish came to nibble');
  const ev = sim.update(DT, true);            // too early: the float only dipped
  assert.deepEqual(ev, ['early']);
  assert.equal(sim.phase, 'wait');
  assert.equal(sim.fish, null);
  assert.equal(sim.early, 1);
  assert.ok(sim.waitFor > 1.5, 'the scared fish makes the next wait longer');
  // early presses in wait and approach count too
  const again = play((s, t) => s.phase === 'approach' && Math.floor(t * 60) % 2 === 0, { seed: 9, limit: 20 });
  assert.ok(again.sim.early >= 2 && !again.names.includes('bite'));
});

test('a missed bite: the float comes back up, the fish is gone, and the next one can still be caught', () => {
  let bites = 0;
  const { sim, names } = play(s => {
    if (s.phase === 'bite' && s.t < DT * 1.5) bites = s.bites;
    return (s.phase === 'bite' && s.bites >= 2) || (s.phase === 'hooked' && !s.surging && s.tension < 0.7);
  }, { seed: 4 });
  assert.ok(names.includes('missed'));
  assert.ok(names.indexOf('missed') < names.indexOf('hook'));
  assert.equal(sim.missed, 1);
  assert.equal(sim.result, 'caught');
  assert.ok(bites >= 2);
  // the window is the promised length: 1.6 s, or 2.6 s on Easy
  for (const [easy, want] of [[false, REEL.window], [true, REEL.windowEasy]]) {
    const r = play(() => false, { seed: 11, easy, limit: 40 });
    const b = r.log.find(l => l[1] === 'bite')[0], m = r.log.find(l => l[1] === 'missed')[0];
    assert.ok(Math.abs(m - b - want) < 0.06, `window ${(m - b).toFixed(2)} vs ${want}`);
  }
});

test('never letting go snaps the line (sooner or later) on Normal', () => {
  let snaps = 0, caught = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { sim, names } = play(brute, { seed });
    if (sim.reason === 'snap') { snaps++; assert.equal(sim.result, 'escaped'); assert.ok(sim.tension >= 1); assert.equal(names.at(-1), 'snap'); }
    else caught++;
  }
  assert.ok(snaps >= 12, `only ${snaps}/60 lines snapped under a brute`);
  assert.ok(caught >= 5, `a brute should still land some small fish (${caught}/60)`);
});

test('a slack line lets the fish slip the hook', () => {
  const { sim, names, log } = play(s => s.phase === 'bite', { seed: 5 });   // strike, then never reel
  assert.equal(sim.result, 'escaped');
  assert.equal(sim.reason, 'slack');
  const hook = log.find(l => l[1] === 'hook')[0], end = log.find(l => l[1] === 'slack')[0];
  assert.ok(Math.abs(end - hook - REEL.slack) < 0.1, `slipped after ${(end - hook).toFixed(1)} s`);
  assert.ok(!names.includes('caught'));
  // reeling now and then resets the slack clock
  const tug = play((s, t) => s.phase === 'bite' || (s.phase === 'hooked' && Math.floor(t) % 4 === 0 && !s.surging && s.tension < 0.7), { seed: 5 });
  assert.equal(tug.sim.result, 'caught');
});

test("Easy in the story's first three trout: the line never snaps and the fish always bites, whatever the player does", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const { sim, names, t } = play(brute, { seed, easy: true, gentle: true, forced: 'trout' });
    assert.equal(sim.result, 'caught', `seed ${seed}: ${sim.reason}`);
    assert.equal(sim.fish.species, 'trout');
    assert.ok(!names.includes('snap') && !names.includes('lost'));
    assert.ok(t < 45, `seed ${seed}: ${t.toFixed(1)} s`);
  }
  // and Easy outside the story is gentler than Normal, but can still snap
  let easy = 0, normal = 0;
  for (let seed = 1; seed <= 80; seed++) {
    if (play(brute, { seed, easy: true }).sim.reason === 'snap') easy++;
    if (play(brute, { seed }).sim.reason === 'snap') normal++;
  }
  assert.ok(easy < normal, `easy ${easy} vs normal ${normal}`);
});

test('the species is chosen by weight and by the seed; the starfin only at dusk; the story forces trout', () => {
  const count = (opts, n = 4000) => {
    const rand = rng(42), c = {};
    for (let i = 0; i < n; i++) { const k = pickSpecies(FISH, rand, opts); c[k] = (c[k] || 0) + 1; }
    return c;
  };
  const day = count({});
  assert.ok(!day.starfin, 'no starfin by day');
  assert.ok(day.trout > day.char && day.char > day.koi && day.koi > 0, JSON.stringify(day));
  const total = FISH.trout.weight + FISH.char.weight + FISH.koi.weight;
  assert.ok(Math.abs(day.trout / 4000 - FISH.trout.weight / total) < 0.03);
  const dusk = count({ dusk: true });
  assert.ok(Math.abs(dusk.starfin / 4000 - 0.45) < 0.03, JSON.stringify(dusk));
  assert.deepEqual(count({ forced: 'trout', dusk: true }, 50), { trout: 50 });
  // seeded: the same seed gives the same fish, another seed another run
  const run = seed => { const r = rng(seed); return Array.from({ length: 12 }, () => { const f = makeFish(FISH, r, { dusk: true }); return `${f.species}${f.cm}`; }).join(','); };
  assert.equal(run(8), run(8));
  assert.notEqual(run(8), run(9));
});

test('size and power: most fish are small, a few big; bigger and rarer fish fight harder, Easy softer', () => {
  const rand = rng(1), sizes = Array.from({ length: 2000 }, () => fishSize('koi', rand));
  assert.ok(Math.min(...sizes) >= SIZE.koi[0] && Math.max(...sizes) <= SIZE.koi[1]);
  const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  assert.ok(mean < (SIZE.koi[0] + SIZE.koi[1]) / 2 - 4, `mean ${mean.toFixed(1)}`);
  assert.ok(sizes.some(s => sizeFraction('koi', s) > 0.8));
  assert.ok(fishPower(FISH, 'starfin', 40) > fishPower(FISH, 'trout', 34));
  assert.ok(fishPower(FISH, 'trout', 46) > fishPower(FISH, 'trout', 22));
  assert.ok(fishPower(FISH, 'trout', 30, true) < fishPower(FISH, 'trout', 30));
  // a harder fish takes a careful angler longer
  const time = power => { let sum = 0; for (let seed = 1; seed <= 20; seed++) { const r = rng(seed); const s = new FishingSim({ rand: r, choose: () => ({ species: 'trout', cm: 30, power }) }); let t = 0, h = 0; while (!s.over && t < 200) { s.update(DT, careful(s)); if (s.phase === 'hooked') h += DT; t += DT; } assert.equal(s.result, 'caught'); sum += h; } return sum / 20; };
  assert.ok(time(0.8) > time(0.2) * 1.3, `${time(0.8).toFixed(1)} s vs ${time(0.2).toFixed(1)} s`);
});

test('the cast lands where it was asked, kept in range and in the water', () => {
  const origin = { x: 4.2, z: 30 }, home = { x: 9.4, z: 23.6 };
  const ok = (x, z) => z < 28.3 && ((x - 9.4) / 5.4) ** 2 + ((z - 23.6) / 5.8) ** 2 <= 1;
  const opt = { origin, home, ok };
  const a = planCast({ x: 9, z: 24 }, opt);
  assert.ok(Math.abs(a.x - 9) < 1e-9 && Math.abs(a.z - 24) < 1e-9, 'a good tap is taken as it is');
  const far = planCast({ x: 40, z: -30 }, opt);
  assert.ok(far.dist <= CAST.max + 1e-6 && ok(far.x, far.z), JSON.stringify(far));
  const near = planCast({ x: 4.6, z: 29.4 }, opt);
  assert.ok(ok(near.x, near.z), 'a tap at her feet slides out into the water');
  const boat = planCast({ x: 7, z: 30 }, opt);        // the moored ferry
  assert.ok(ok(boat.x, boat.z) && boat.z < 28.3);
  const self = planCast({ x: 4.2, z: 30 }, opt);
  assert.ok(ok(self.x, self.z));
  // every tap anywhere ends in the water
  const r = rng(5);
  for (let i = 0; i < 300; i++) { const p = planCast({ x: -20 + r() * 60, z: r() * 60 }, opt); assert.ok(ok(p.x, p.z)); }
});

test('the school: fish keep to their water and clear of the float; the suitor comes, bolts, and is replaced', () => {
  const area = { cx: 9.4, cz: 23.6, rx: 4.6, rz: 4.9 };
  const sc = new School({ rand: rng(2), area, mix: ['trout', 'char', 'trout', 'koi', 'trout', 'char', 'trout', 'koi'], deep: 1 });
  assert.equal(sc.fish.length, 8);
  assert.equal(sc.fish.filter(f => f.deep).length, 1);
  const float = { x: 9, z: 24, cx: 9, cz: 24 };
  let nearFloat = 0, steps = 0;
  for (let t = 0; t < 60; t += DT) {
    sc.update(DT, float, null);
    for (const f of sc.fish) {
      assert.ok(sc.inside(f.x, f.z, 1.25), `fish left the water at ${f.x.toFixed(1)}, ${f.z.toFixed(1)}`);
      if (!f.deep) { steps++; if (Math.hypot(f.x - float.x, f.z - float.z) < 0.7) nearFloat++; }
    }
  }
  assert.ok(nearFloat / steps < 0.01, `fish sat on the float ${(100 * nearFloat / steps).toFixed(1)} % of the time`);
  // the fish the sim attracts swims in to the float
  const s = sc.suitorFor('koi', float);
  assert.equal(s.species, 'koi');
  assert.equal(s.state, 'suitor');
  let dist = Math.min(4.5, s.r);
  for (let t = 0; t < 6; t += DT) { dist = Math.max(0.55, dist - (dist > 2 ? 1.1 : 0.55) * DT); sc.update(DT, float, { phase: 'approach', dist, nibble: 0, progress: 0, surging: false, origin: { x: 4.2, z: 30 } }); }
  assert.ok(Math.abs(Math.hypot(s.x - float.x, s.z - float.z) - 0.55) < 0.12, 'the suitor holds off the float, ready to nibble');
  for (let t = 0; t < 1; t += DT) sc.update(DT, float, { phase: 'bite', dist: 0.55, nibble: 0, progress: 0, surging: false, origin: { x: 4.2, z: 30 } });
  assert.ok(Math.hypot(s.x - float.x, s.z - float.z) < 0.25, 'it takes the float');
  // hooked: reeled toward the angler
  const d0 = Math.hypot(s.x - 4.2, s.z - 30);
  for (let t = 0; t < 2; t += DT) sc.update(DT, float, { phase: 'hooked', dist: 0, nibble: 0, progress: 0.9, surging: false, origin: { x: 4.2, z: 30 } });
  assert.ok(Math.hypot(s.x - 4.2, s.z - 30) < d0 * 0.5);
  // caught: it leaves, and another swims in from the rim
  sc.take(s, 1);
  sc.update(DT, float, null);
  assert.equal(s.state, 'gone');
  for (let t = 0; t < 1.2; t += DT) sc.update(DT, float, null);
  assert.equal(s.state, 'swim');
  // a species nobody is swimming as arrives from the edge, and leaves the count as it was once it has fled
  const star = sc.suitorFor('starfin', float);
  assert.equal(sc.fish.length, 9);
  sc.flee(star, float.x, float.z);
  assert.equal(star.state, 'flee');
  for (let t = 0; t < 2; t += DT) sc.update(DT, float, null);
  assert.equal(star.state, 'swim');
});
