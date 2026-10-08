import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoads, pathLength } from '../src/world/roads.js';
import { Planner, Meetings, blockAt, isNight, whereAt, CHAT_WAIT } from '../src/game/schedule.js';

const SPOTS = { well: { x: -42, z: 24 }, bench: { x: -40, z: 36 }, yard: { x: -40, z: 2 }, east: { x: 110, z: 12 } };
const G = buildRoads({ spots: SPOTS });
const seq = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** A thin fake runtime: walks take length/speed seconds, then report arrived. */
function runtime(planner) {
  const log = [];
  let walking = null;
  return {
    log,
    step(dt, hour, extra = {}) {
      if (walking) { walking.left -= dt; if (walking.left <= 0) { const end = walking.path.at(-1); walking = null; planner.arrived(end); } }
      const cmds = planner.update(dt, hour, extra);
      for (const c of cmds) {
        log.push(c);
        if (c.type === 'walk') walking = { path: c.path, left: pathLength(c.path) / c.speed };
        if (c.type === 'teleport') walking = null;
      }
      return cmds;
    },
  };
}
const types = log => log.map(c => (c.type === 'clip' ? `clip:${c.clip}` : c.type));

test('blocks wrap past midnight and the night is 20:00-05:00', () => {
  const plan = [{ from: 6, tasks: [] }, { from: 9, tasks: [] }, { from: 19, tasks: [] }];
  assert.equal(blockAt(plan, 7).from, 6);
  assert.equal(blockAt(plan, 9).from, 9);
  assert.equal(blockAt(plan, 23).from, 19);
  assert.equal(blockAt(plan, 2).from, 19, 'before the first block is the day before’s last');
  assert.equal(blockAt(plan, 26).from, 19);
  assert.equal(blockAt([], 3), null);
  assert.ok(isNight(20) && isNight(4.9) && !isNight(5) && !isNight(19.9));
});

const fujita = {
  id: 'f', home: 'kw2', plan: [
    { from: 6, tasks: [{ go: 'well' }, { do: 'Carry', t: 8, prop: 'bucket' }, { go: 'door:kw2' }, { inside: 30 }] },
    { from: 9, tasks: [{ sell: 'grocer', t: 60 }, { do: 'Sweep', t: 14, prop: 'broom', at: 'bench' }] },
    { from: 12, tasks: [{ deliver: ['kw1', 'door:kw3'] }] },
    { from: 14, tasks: [{ wander: 'yard', r: 3, t: 20 }] },
  ],
};
const SHOPS = { grocer: { room: 'kw2' } };

test('a day block loops its tasks: walk, clip, go home, inside, reappear; a frozen hour loops forever', () => {
  const p = new Planner(fujita, { roads: G, rand: seq(), shops: SHOPS });
  const rt = runtime(p);
  for (let i = 0; i < 2400; i++) rt.step(0.25, 7);           // 10 minutes of frozen 07:00
  const t = types(rt.log);
  assert.equal(t[0], 'teleport', 'first placement snaps');
  const loop = t.join(' ');
  assert.ok(loop.includes('walk clip:Carry walk hide show'), loop.slice(0, 300));
  assert.ok(t.filter(x => x === 'clip:Carry').length >= 4, 'the block keeps looping');
  assert.equal(rt.log.find(c => c.clip === 'Carry').prop, 'bucket');
});

test('a block change re-plans from where they are; sell hides them with a sell command; at: walks there first', () => {
  const p = new Planner(fujita, { roads: G, rand: seq(), shops: SHOPS });
  const rt = runtime(p);
  for (let i = 0; i < 20; i++) rt.step(0.25, 8.9);
  rt.log.length = 0;
  let h = 8.9;
  for (let i = 0; i < 1200; i++) { h = Math.min(10.5, h + 0.25 / 600); rt.step(0.25, h); }
  const t = types(rt.log);
  assert.ok(!t.includes('teleport'), 'slow time never teleports');
  const s = rt.log.find(c => c.type === 'sell');
  assert.deepEqual([s.shop, s.room], ['grocer', 'kw2']);
  assert.ok(t.join(' ').includes('hide sell show walk clip:Sweep'), t.join(' '));
});

test('postmen deliver door to door with letters; wanderers amble near their spot', () => {
  const p = new Planner(fujita, { roads: G, rand: seq(3) });
  const rt = runtime(p);
  for (let i = 0; i < 400; i++) rt.step(0.25, 12.5);
  const inter = rt.log.filter(c => c.clip === 'Interact');
  assert.ok(inter.length >= 2 && inter.every(c => c.prop === 'letters'));
  const q = new Planner(fujita, { roads: G, rand: seq(5) });
  const rq = runtime(q);
  for (let i = 0; i < 800; i++) rq.step(0.25, 15);
  const walks = rq.log.filter(c => c.type === 'walk');
  assert.ok(walks.length >= 3, `${walks.length} walks`);
  const y = G.nodes[G.keys.get('yard')];
  for (const w of walks.slice(1)) { const [x, z] = w.path.at(-1); assert.ok(Math.hypot(x - y.x, z - y.z) <= 3.01, `wander point (${x}, ${z})`); }
});

test('a big hour jump teleports to the new task instead of walking across the village', () => {
  const p = new Planner(fujita, { roads: G, rand: seq() });
  const rt = runtime(p);
  for (let i = 0; i < 40; i++) rt.step(0.25, 6.5);
  rt.log.length = 0;
  rt.step(0.25, 12.2);
  assert.ok(rt.log.some(c => c.type === 'teleport'), types(rt.log).join(' '));
  assert.ok(!rt.log.some(c => c.type === 'walk'));
});

test('night sends people home and hides them; morning brings them out of the door', () => {
  const p = new Planner(fujita, { roads: G, rand: seq() });
  const rt = runtime(p);
  for (let i = 0; i < 40; i++) rt.step(0.25, 19.9);
  for (let i = 0; i < 400; i++) rt.step(0.25, 20.1);
  assert.equal(p.hidden, true);
  assert.equal(rt.log.at(-1).type, 'hide');
  const n = rt.log.length;
  for (let i = 0; i < 100; i++) rt.step(0.25, 20.5);
  assert.equal(rt.log.length, n, 'nothing happens at night');
  rt.step(0.25, 6.0);                                       // timelapse to the morning
  assert.equal(types(rt.log.slice(n))[0], 'show');
  const owl = new Planner({ id: 'o', home: 'kw3', plan: [{ from: 19, night: true, tasks: [{ do: 'Sit', t: 30, at: 'bench' }] }] }, { roads: G });
  const ro = runtime(owl);
  for (let i = 0; i < 200; i++) ro.step(0.25, 22);
  assert.ok(ro.log.some(c => c.clip === 'Sit') && !ro.log.some(c => c.type === 'hide'), 'a night block keeps them out');
});

test('chat partners meet: whoever comes first waits up to 25 s; a no-show is given up on', () => {
  const meetings = new Meetings();
  const a = new Planner({ id: 'a', home: 'kw1', plan: [{ from: 6, tasks: [{ chat: 'b', at: 'well', t: 12 }, { do: 'Idle', t: 5 }] }] }, { roads: G, meetings });
  const b = new Planner({ id: 'b', home: 'kw6', plan: [{ from: 6, tasks: [{ chat: 'a', at: 'well', t: 12 }, { do: 'Idle', t: 5 }] }] }, { roads: G, meetings });
  const ra = runtime(a), rb = runtime(b);
  for (let i = 0; i < 200; i++) { ra.step(0.25, 10); rb.step(0.25, 10); }
  const ca = ra.log.find(c => c.type === 'chat'), cb = rb.log.find(c => c.type === 'chat');
  assert.ok(ca && cb && ca.with === 'b' && cb.with === 'a' && ca.t === 12);
  const lone = new Planner({ id: 'c', home: 'kw1', plan: [{ from: 6, tasks: [{ chat: 'zz', at: 'well', t: 12 }, { do: 'Wave', t: 2 }] }] }, { roads: G, meetings: new Meetings() });
  const rl = runtime(lone);
  let waited = 0;
  for (let i = 0; i < 400 && !rl.log.some(c => c.clip === 'Wave'); i++) { rl.step(0.25, 10); if (lone.phase === 'wait') waited += 0.25; }
  assert.ok(rl.log.some(c => c.clip === 'Wave'), 'moves on');
  assert.ok(Math.abs(waited - CHAT_WAIT) <= 0.5, `waited ${waited}`);
});

test('kids play games at a spot; places across the river are skipped, never walked to', () => {
  const kid = new Planner({ id: 'k', home: 'kw5', plan: [{ from: 6, tasks: [{ play: 'ball', at: 'bench', t: 20, with: ['k2'] }, { go: 'east' }] }] }, { roads: G });
  const rk = runtime(kid);
  for (let i = 0; i < 400; i++) rk.step(0.25, 10);
  const pl = rk.log.find(c => c.type === 'play');
  assert.deepEqual([pl.game, pl.with[0]], ['ball', 'k2']);
  assert.ok(rk.log.filter(c => c.type === 'walk').every(w => w.path.every(([x]) => x < 0)), 'never crosses to Takamori');
  assert.ok(rk.log.filter(c => c.type === 'play').length >= 3, 'the game repeats');
});

test('whereAt places people without simulation', () => {
  const well = G.nodes[G.keys.get('well')];
  const w = whereAt(fujita, 6.1, G);
  assert.ok(Math.hypot(w.x - well.x, w.z - well.z) < 0.01 && !w.hidden);
  assert.equal(whereAt(fujita, 22, G).hidden, true);
  assert.equal(whereAt(fujita, 9.1, G).hidden, true, 'selling indoors');
});

// ------------------------------------------------------------------ the real townsfolk run a whole day without getting stuck
let TF = null, SH = null;
try { TF = await import('../src/content/townsfolk.js'); } catch { TF = null; }
try { SH = await import('../src/content/shops.js'); } catch { SH = null; }
test('every real townsperson runs through a day: commands are well formed and walks stay in their network', { skip: !TF && 'src/content/townsfolk.js not written yet' }, () => {
  const g = buildRoads({ spots: TF.SPOTS });
  const meetings = new Meetings();
  const shops = Object.fromEntries(Object.entries(SH?.SHOPS || {}).map(([k, s]) => [k, { room: s.room }]));
  const ps = TF.PEOPLE.map(p => new Planner(p, { roads: g, meetings, rand: seq(7), shops }));
  const rts = ps.map(runtime);
  const KNOWN = new Set(['walk', 'teleport', 'clip', 'hide', 'show', 'sell', 'chat', 'play']);
  for (let h = 5; h < 29; h += 0.01) for (const rt of rts) rt.step(1, h % 24);
  ps.forEach((p, i) => {
    const log = rts[i].log, id = p.id;
    assert.ok(log.length > 3, `${id} did things`);
    for (const c of log) {
      assert.ok(KNOWN.has(c.type), `${id}: ${c.type}`);
      if (c.type === 'walk') {
        assert.ok(c.path.length >= 2 && c.speed > 0 && c.speed <= 3.6, `${id} walk`);
        for (const pt of c.path) assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[1]), `${id} walk point`);
      }
    }
  });
});

test('a conditional block takes over from a plain one with the same hour while its condition holds', () => {
  const plan = [{ from: 9, tasks: [{ play: 'tag', at: 'x', t: 5 }] }, { from: 9, when: { lamps: 1 }, tasks: [{ do: 'Sit', t: 5 }] }, { from: 15, tasks: [] }];
  assert.equal(blockAt(plan, 10, w => false).tasks[0].play, 'tag');
  assert.equal(blockAt(plan, 10, w => w.lamps <= 1).tasks[0].do, 'Sit');
  assert.equal(blockAt(plan, 16, () => true).from, 15);
});

test('a friend who starts a game calls the others over to it', () => {
  const m = new Meetings();
  m.play('a', 'ball', 'green', ['b']);
  assert.deepEqual(m.games.get('a'), { game: 'ball', at: 'green', with: ['b'] });
  m.leave('a');
  assert.equal(m.games.size, 0);
});
