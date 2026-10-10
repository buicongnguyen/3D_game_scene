// The Kawabe playground yard: where it stands (content/yard.js) and the games played there (src/game/yard/), all pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YARD, toWorld, toCourt, fenceRuns, yardSolids, hopCells, KID_STYLE, YARD_NAMES, cleanYard, recordYard } from '../src/content/yard.js';
import { YARD_GAMES, YARD_GAME, nextGame, levelFor, ambientRoles } from '../src/game/yard/index.js';
import { COURT, LEVELS, STYLES, rng, judge, makeFlight, flightAt, netHeight, homes, starsFor } from '../src/game/yard/rules.js';
import { FootnetSim, footnetBot } from '../src/game/yard/footnet.js';
import { KeepupSim, keepupBot, ringPlaces, RING, KEEPUP_STARS } from '../src/game/yard/keepup.js';
import { placeProblems, sharedGrid, inFootprint, buildRoads, route } from '../src/world/roads.js';
import { PATHS, PADDIES, CLEARINGS, FALLEN_STARS, BUILDINGS } from '../src/world/layout.js';
import { FOOTPRINT } from '../src/world/structures.js';
import { DOOR_SPOTS } from '../src/world/interiors.js';
import { SIGNS, BOARD, signPlace } from '../src/content/signs.js';
import { TRICKS } from '../src/content/tricks.js';
import { SKY_SPOTS } from '../src/content/skyspots.js';
import { PEOPLE, SPOTS } from '../src/content/townsfolk.js';
import { freshState, migrate } from '../src/game/quest.js';

const F = YARD.fence;
const inFence = (x, z, m = 0) => x > F.x0 - m && x < F.x1 + m && z > F.z0 - m && z < F.z1 + m;
/** Distance from a point to the fence rectangle (0 inside). */
const toFence = (x, z) => Math.hypot(Math.max(F.x0 - x, 0, x - F.x1), Math.max(F.z0 - z, 0, z - F.z1));
function segDist(ax, az, bx, bz, px, pz) {
  const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1e-9)));
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
}
/** Points all over the yard: a 1 m lattice over the fenced rectangle, plus every solid. */
function yardPoints() {
  const pts = [];
  for (let x = F.x0; x <= F.x1 + 1e-6; x += 1) for (let z = F.z0; z <= F.z1 + 1e-6; z += 1) pts.push([x, z]);
  const { boxes, posts } = yardSolids();
  for (const b of boxes) pts.push([b.x - b.hw, b.z - b.hd], [b.x + b.hw, b.z + b.hd]);
  for (const p of posts) pts.push([p.x, p.z]);
  return pts;
}

// ------------------------------------------------------------------------------------------------ the site
test('yard site: flat, dry, open ground that passes the placement rules everywhere', () => {
  const g = sharedGrid();
  let lo = 1e9, hi = -1e9;
  for (const [x, z] of yardPoints()) {
    assert.deepEqual(placeProblems(x, z), [], `(${x.toFixed(1)}, ${z.toFixed(1)})`);
    assert.ok(g.slopeAt(x, z) <= 3, `slope ${g.slopeAt(x, z).toFixed(1)} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    const h = g.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  assert.ok(hi - lo <= 0.03, `the whole yard is level (it varies ${(hi - lo).toFixed(2)} m)`);
  // the court itself is dead flat: chalk lines lie 3 cm over the ground
  let cl = 1e9, ch = -1e9;
  for (let u = -3.2; u <= 3.2; u += 0.8) for (let v = -5.7; v <= 5.7; v += 0.95) { const w = toWorld(u, v), h = g.heightAt(w.x, w.z); cl = Math.min(cl, h); ch = Math.max(ch, h); }
  assert.ok(ch - cl < 0.015, `the court is flat (${(ch - cl).toFixed(3)} m)`);
  // inside a tree-free clearing
  for (const [x, z] of [[F.x0, F.z0], [F.x1, F.z0], [F.x0, F.z1], [F.x1, F.z1]]) assert.ok(CLEARINGS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r - 2), 'no trees are scattered into the yard');
});

test('yard site: clear of buildings, roads, paddies, trick signs, name boards, sky spots, meeting spots and fallen stars', () => {
  for (const [x, z] of yardPoints()) assert.ok(!inFootprint(x, z, 1.2), `(${x.toFixed(1)}, ${z.toFixed(1)}) is at a wall`);
  for (const b of BUILDINGS) {
    const fp = FOOTPRINT[b.model] || [2, 2], r = Math.hypot(fp[0], fp[1]) / 2;
    if (toFence(b.x, b.z) < r + 3) assert.ok(toFence(b.x, b.z) >= Math.min(fp[0], fp[1]) / 2 + 1.5, `${b.id} is not built into the fence`);
  }
  // roads: every path keeps its width plus two metres from the fence
  for (const p of PATHS) for (let i = 0; i + 1 < p.pts.length; i++) {
    for (let t = 0; t <= 1; t += 0.05) {
      const x = p.pts[i][0] + (p.pts[i + 1][0] - p.pts[i][0]) * t, z = p.pts[i][1] + (p.pts[i + 1][1] - p.pts[i][1]) * t;
      assert.ok(toFence(x, z) > p.w / 2 + 2, `a ${p.w} m road passes ${toFence(x, z).toFixed(1)} m from the yard`);
    }
  }
  for (const p of PADDIES) assert.ok(toFence(p.x, p.z) > Math.hypot(p.w, p.d) / 2 + 5, `${p.id}`);
  for (const t of TRICKS) assert.ok(toFence(t.place.x, t.place.z) > 6, `the ${t.id} sign is ${toFence(t.place.x, t.place.z).toFixed(1)} m from the yard`);
  for (const s of SKY_SPOTS) if (s.on === 'ground') assert.ok(toFence(s.x, s.z) > s.r + 6, `sky spot ${s.id}`);
  for (const s of FALLEN_STARS) assert.ok(toFence(s.x, s.z) > 5, `${s.id} hides somewhere else`);
  // name boards: nobody else's board stands in the yard; the yard's own stands outside the fence, off the gates
  const building = id => BUILDINGS.find(b => b.id === id);
  for (const s of SIGNS) {
    const b = s.building ? building(s.building) : null, p = signPlace(s, b, b && FOOTPRINT[b.model], b && DOOR_SPOTS[b.model]);
    const [w] = BOARD[s.kind], ax = Math.cos(p.yaw), az = -Math.sin(p.yaw);
    for (const o of [-(w / 2 + 0.1), 0, w / 2 + 0.1]) {
      const x = p.x + ax * o, z = p.z + az * o;
      assert.ok(!inFence(x, z, 0.5), `${s.id}: a post in the yard`);
      if (s.id !== 'yard') continue;
      assert.ok(toFence(x, z) > 0.9 && toFence(x, z) < 4, 'the playground board stands just outside the fence');
      for (const g of YARD.gaps) {
        const m = (g.a + g.b) / 2, [gx, gz] = g.side === 'n' ? [m, F.z0] : g.side === 's' ? [m, F.z1] : [F.x0, m];
        assert.ok(Math.hypot(gx - x, gz - z) > 2.2, `the board keeps clear of the ${g.side} gate`);
      }
    }
  }
  assert.equal(SIGNS.find(s => s.id === 'yard').text, 'Kawabe Playground');
  // meeting spots: nobody's day plan stands them inside the yard; the yard's own spot is at its west gate
  for (const [id, s] of Object.entries(SPOTS)) if (id !== YARD.spot) assert.ok(toFence(s.x, s.z) > 1.2, `${id} is ${toFence(s.x, s.z).toFixed(1)} m from the fence`);
  const spot = SPOTS[YARD.spot], gate = YARD.gaps.find(g => g.side === 'w');
  assert.ok(spot && spot.x < F.x0 && F.x0 - spot.x < 1.5 && spot.z > gate.a + 0.4 && spot.z < gate.b - 0.4, 'the kids arrive at the west gate');
  assert.deepEqual(placeProblems(spot.x, spot.z), []);
});

test('yard layout: the fence has three walk-in gates, and everything stands inside it and off the court', () => {
  const runs = fenceRuns();
  assert.equal(YARD.gaps.length, 3);
  for (const g of YARD.gaps) assert.ok(Math.abs(g.b - g.a) >= 1.8, `the ${g.side} gate is wide enough to walk through`);
  let len = 0;
  for (const [x0, z0, x1, z1] of runs) { assert.ok(x0 === x1 || z0 === z1, 'runs are straight'); len += Math.hypot(x1 - x0, z1 - z0); }
  const round = 2 * (F.x1 - F.x0) + 2 * (F.z1 - F.z0), gates = YARD.gaps.reduce((s, g) => s + Math.abs(g.b - g.a), 0);
  assert.ok(Math.abs(len - (round - gates)) < 1e-6, 'the runs are the fence minus the gates');
  const { boxes, posts } = yardSolids();
  const onCourt = (x, z, m) => Math.abs(x - YARD.x) < YARD.w / 2 + m && Math.abs(z - YARD.z) < YARD.l / 2 + m;
  for (const s of [...boxes, ...posts]) {
    assert.ok(inFence(s.x, s.z, 0.2), `${s.what} is in the yard`);
    if (s.what !== 'net' && s.what !== 'fence') assert.ok(!onCourt(s.x, s.z, 0.5), `${s.what} keeps off the court`);
    // nothing solid stands in a gateway
    if (s.what !== 'fence') for (const g of YARD.gaps) {
      const m = (g.a + g.b) / 2, [gx, gz] = g.side === 'n' ? [m, F.z0] : g.side === 's' ? [m, F.z1] : [F.x0, m];
      assert.ok(Math.hypot(gx - s.x, gz - s.z) > 1.3, `${s.what} blocks the ${g.side} gate`);
    }
  }
  // the court and its net
  assert.ok(Math.abs(YARD.l - 11) < 1.5 && YARD.w === 6 && YARD.netH >= 1.2 && YARD.netH <= 1.6, 'about 12 x 6 m with a low net');
  assert.deepEqual([COURT.W, COURT.L, COURT.NET], [YARD.w, YARD.l, YARD.netH], 'the rules play on the court that is built');
  assert.ok(onCourt(YARD.x, YARD.z, 0) && F.x0 < YARD.x - YARD.w / 2 - 1 && F.x1 > YARD.x + YARD.w / 2 + 1, 'room to walk round the court');
  // benches: a 0.45 m seat (the Sit clip), facing the court
  for (const b of YARD.benches) { assert.ok(Math.sin(b.face) * (YARD.x - b.x) > 0, 'benches face the court'); assert.equal(boxes.find(q => q.what === 'bench').h, 0.45); }
  // the kick-board stands behind the far end, where the practice shuttle is sent
  const wc = toCourt(YARD.wall.x, YARD.wall.z);
  assert.ok(Math.abs(wc.u) < 0.01 && Math.abs(wc.v - COURT.WALL_V) < 0.3 && YARD.wall.h === COURT.WALL_H && YARD.wall.w === COURT.WALL_W);
  // hopscotch beside the court, inside the fence
  const cells = hopCells();
  assert.equal(cells.length, 8);
  for (const c of cells) assert.ok(inFence(c.x, c.z, -0.4) && !onCourt(c.x, c.z, 0.6));
  // court space
  const w = toWorld(1, 2), c = toCourt(w.x, w.z);
  assert.ok(Math.abs(c.u - 1) < 1e-9 && Math.abs(c.v - 2) < 1e-9 && w.z < YARD.z, 'the near half (v > 0) is the north half');
});

// ------------------------------------------------------------------------------------------------ rules
test('yard rules: flights clear the net, land where they are sent, and the timing windows grow gentler', () => {
  const out = {};
  for (const [a, b, dur, h] of [[{ u: 0, y: 0.35, v: 3 }, { u: 1, y: 0, v: -4 }, 1.0, 0.5], [{ u: 2, y: 0.35, v: 0.6 }, { u: -2, y: 0, v: -1.8 }, 1.75, 3.1], [{ u: 0, y: 1.2, v: -5 }, { u: 0, y: 0, v: 0.8 }, 1.0, 0.3]]) {
    const f = makeFlight(a, b, dur, h);
    assert.ok(netHeight(f) >= COURT.NET + 0.29, `clears the tape (${netHeight(f).toFixed(2)} m)`);
    flightAt(f, 0, out); assert.deepEqual([out.u, out.y, out.v], [a.u, a.y, a.v]);
    flightAt(f, 1, out); assert.ok(Math.abs(out.u - b.u) < 1e-9 && Math.abs(out.y) < 1e-9 && Math.abs(out.v - b.v) < 1e-9);
    for (let k = 0.05; k < 1; k += 0.05) assert.ok(flightAt(f, k, out).y > 0, 'never under the ground');
  }
  // a shuttle meant for the net stays under the tape; one that does not cross has no net height
  assert.ok(netHeight(makeFlight({ u: 0, y: 0.4, v: 3 }, { u: 0, y: 0.7, v: -0.12 }, 0.7, 0.35, { net: true })) < COURT.NET);
  assert.equal(netHeight(makeFlight({ u: 0, y: 0.4, v: 3 }, { u: 0, y: 0, v: 1 }, 1, 2)), null);
  // timing: perfect inside its window, okay up to `ok`, earlier is a miss of the foot
  for (const L of Object.values(LEVELS)) {
    assert.equal(judge((L.p0 + L.p1) / 2, L), 'perfect');
    assert.equal(judge(L.p1 + 0.05, L), 'ok');
    assert.equal(judge(0, L), L.p0 > 0 ? 'ok' : 'perfect');
    assert.equal(judge(L.ok + 0.01, L), 'early');
  }
  const { first, easy, normal } = LEVELS;
  assert.ok(first.ok > easy.ok && easy.ok > normal.ok && first.p1 - first.p0 > easy.p1 - easy.p0 && easy.p1 - easy.p0 > normal.p1 - normal.p0, 'wider windows');
  assert.ok(first.reach > easy.reach && easy.reach > normal.reach && first.slow > easy.slow && easy.slow > normal.slow && normal.slow === 1, 'slower shuttles, longer legs');
  // the kids: Kenta strong, Yui tricky, Daichi wobbly
  assert.deepEqual(KID_STYLE, { v3: 'strong', v20: 'tricky', v10: 'wobbly' });
  const { strong, tricky, wobbly } = STYLES;
  assert.ok(strong.flat > tricky.flat && tricky.flat > wobbly.flat && strong.miss < tricky.miss && tricky.miss < wobbly.miss && wobbly.net + wobbly.out > 2 * (strong.net + strong.out));
  assert.equal(tricky.aim, 'away');
  // the seeded generator repeats
  const a = rng(42), b = rng(42);
  for (let i = 0; i < 20; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
  assert.deepEqual(homes(0, 2).map(h => Math.sign(h.v)), [1, 1]);
  assert.deepEqual(homes(1, 1), [{ u: 0, v: -3.2 }]);
  assert.deepEqual([0, 6, 12, 30].map(s => starsFor(s, [6, 12, 24])), [0, 1, 2, 3]);
});

// ------------------------------------------------------------------------------------------------ playing
const MIKA = { id: 'mika', team: 0, human: true };
const KENTA = { id: 'v3', team: 1, style: 'strong' }, YUI = { id: 'v20', team: 1, style: 'tricky' }, DAICHI = { id: 'v10', team: 1, style: 'wobbly' };
const DT = 1 / 60;

/** Play a sim with a policy (sim -> input); returns the sim, the event log and the inputs that were fed in. */
function play(sim, policy, limit = 900) {
  const log = [], inputs = [];
  let t = 0;
  while (!sim.over && t < limit) {
    const inp = policy(sim);
    inputs.push([inp.mx || 0, inp.mv || 0, inp.kick ? 1 : 0]);
    sim.step(DT, inp);
    for (const e of sim.events) log.push(e);
    sim.events.length = 0;
    t += DT;
  }
  return { sim, log, inputs, t };
}
const count = (log, type, f = () => true) => log.filter(e => e.type === type && f(e)).length;
const sloppy = seed => { const r = rng(seed); return sim => 0.04 + r() * (sim.L.ok + 0.1); };   // presses a little early or late, tries again

test('foot-tennis: a recorded match replays exactly (seeded, no hidden state)', () => {
  const mk = () => new FootnetSim({ seed: 7, players: [MIKA, KENTA, YUI], level: 'normal', target: 5 });
  const first = play(mk(), s => footnetBot(s, sloppy(3)(s) < 0.3 ? 0.12 : 0.3));
  assert.ok(first.sim.over, 'the match ends');
  // feed the recorded stick and button back in, frame by frame
  const again = mk(), log = [];
  for (const [mx, mv, kick] of first.inputs) { again.step(DT, { mx, mv, kick: !!kick }); for (const e of again.events) log.push(e); again.events.length = 0; }
  assert.deepEqual(log, first.log);
  assert.deepEqual(again.score, first.sim.score);
  // another seed is another match
  const other = play(new FootnetSim({ seed: 8, players: [MIKA, KENTA, YUI], level: 'normal', target: 5 }), s => footnetBot(s, 0.12));
  assert.notDeepEqual(other.log.map(e => e.type).join(), first.log.map(e => e.type).join());
});

test('foot-tennis: scoring, serving and the end of a match', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { sim, log } = play(new FootnetSim({ seed, players: [MIKA, KENTA], level: 'normal', target: 5 }), s => footnetBot(s, 0.12));
    const pts = log.filter(e => e.type === 'point');
    assert.deepEqual(pts[pts.length - 1].score, sim.score, 'the last point is the final score');
    assert.equal(pts.filter(e => e.team === 0).length, sim.score[0]);
    assert.equal(pts.filter(e => e.team === 1).length, sim.score[1]);
    assert.ok(Math.max(...sim.score) === 5 && Math.min(...sim.score) < 5, 'first to five, and it stops there');
    assert.equal(count(log, 'serve'), pts.length, 'one serve a point');
    assert.equal(count(log, 'over'), 1);
    // every point has a reason, and faults go against the kicker
    for (const e of pts) assert.ok(['ground', 'net', 'out'].includes(e.why));
    const res = sim.result();
    assert.equal(res.won, sim.score[0] === 5);
    assert.ok(res.rally >= 2 && res.stars >= (res.won ? 2 : 0) && res.stars <= 3);
    // nobody ever stands on the wrong side of the net
    for (const p of sim.players) assert.ok(p.team === 0 ? p.v > 0 : p.v < 0);
  }
});

test('foot-tennis: a shuttle in the net or out is the other side\'s point; landing in is the kicker\'s', () => {
  let net = 0, out = 0, ground = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const sim = new FootnetSim({ seed, players: [{ id: 'a', team: 0, style: 'wobbly' }, { id: 'b', team: 1, style: 'wobbly' }], target: 5 });
    let lastKick = null, t = 0;
    while (!sim.over && t < 600) {
      sim.step(DT); t += DT;
      for (const e of sim.events) {
        if (e.type === 'kick' || e.type === 'serve') lastKick = e.who;
        if (e.type === 'point') {
          const kickerTeam = lastKick === 'a' ? 0 : 1;
          if (e.why === 'ground') { ground++; assert.equal(e.team, kickerTeam, 'it came down on the other side'); } else { e.why === 'net' ? net++ : out++; assert.equal(e.team, 1 - kickerTeam, `${e.why}: the point goes against the kicker`); }
        }
        if (e.type === 'land' && e.fault === 'out') assert.ok(Math.abs(e.u) > COURT.W / 2 || Math.abs(e.v) > COURT.HALF, 'out means outside the lines');
        if (e.type === 'land' && !e.fault) assert.ok(Math.abs(e.u) <= COURT.W / 2 && Math.abs(e.v) <= COURT.HALF, 'a good shuttle lands in');
      }
      sim.events.length = 0;
    }
    assert.ok(sim.over, 'two wobbly kids still finish a match');
  }
  assert.ok(net > 5 && out > 5 && ground > (net + out) / 2, `wobbly kids fault now and then (net ${net}, out ${out}, clean ${ground})`);
});

test('foot-tennis: a careful player wins, a new player returns most shuttles, one who never kicks loses', () => {
  for (const [level, target] of [['first', 3], ['easy', 5], ['normal', 5]]) {
    let wins = 0, returned = 0, hers = 0, time = 0;
    const N = 30;
    for (let seed = 1; seed <= N; seed++) {
      // careful: under every shuttle, kicking in the perfect window
      const a = play(new FootnetSim({ seed, players: [MIKA, KENTA, YUI], level, target }), s => footnetBot(s, 0.12));
      if (a.sim.over.won) wins++;
      // a new player: gets there, but swings early or late; misses are whiffs she may try again
      const r = sloppy(seed * 13);
      const b = play(new FootnetSim({ seed, players: [MIKA, KENTA], level, target }), s => footnetBot(s, r(s)));
      returned += count(b.log, 'kick', e => e.human);
      hers += count(b.log, 'kick', e => e.human) + count(b.log, 'point', e => e.team === 1 && e.why === 'ground');
      time += b.t;
      assert.ok(b.sim.over, `${level} seed ${seed}: the match ends`);
    }
    assert.ok(wins >= N * 0.9, `${level}: careful play wins (${wins}/${N})`);
    assert.ok(returned / hers >= 0.8, `${level}: a new player returns most shuttles (${(100 * returned / hers).toFixed(0)}%)`);
    assert.ok(time / N > 20 && time / N < 200, `${level}: a match takes ${(time / N).toFixed(0)} s on average`);
  }
  // she serves but never returns: the kids win to love; the kick that never comes is no fault of the sim
  const idle = play(new FootnetSim({ seed: 3, players: [MIKA, KENTA], level: 'normal', target: 5 }), s => footnetBot(s, () => -1));
  assert.deepEqual(idle.sim.score, [0, 5]);
  assert.equal(idle.sim.result().won, false);
  assert.equal(idle.sim.result().stars, 0);
  // and one who never even serves is waited for (no dead end, no timeout loss)
  const waiting = play(new FootnetSim({ seed: 3, players: [MIKA, KENTA] }), () => ({}), 30);
  assert.equal(waiting.sim.state, 'serve');
  assert.equal(waiting.sim.over, null);
});

test('foot-tennis: timing sets the return (perfect = fast and flat, okay = a high lob), the stick aims it, too early is a whiff', () => {
  const start = () => {
    const sim = new FootnetSim({ seed: 5, players: [MIKA, KENTA], level: 'normal' });
    // serve, then wait for Kenta's return to come over
    let t = 0;
    while (t < 60) { const inp = sim.state === 'serve' ? { kick: true } : {}; sim.step(DT, inp); sim.events.length = 0; t += DT; if (sim.state === 'rally' && sim.flight.to === 0 && sim.marker.mine) break; }
    assert.ok(sim.flight.to === 0, 'a shuttle is on its way to Mika');
    return sim;
  };
  const kickAt = (tau, stick = {}) => {
    const sim = start(), f = sim.flight;
    while (f.dur - f.t > tau) { sim.step(DT, { pos: { u: f.bu, v: f.bv } }); if (sim.flight !== f) return { sim, f: null }; }
    sim.events.length = 0;
    sim.step(DT, { pos: { u: f.bu, v: f.bv }, kick: true, ...stick });
    return { sim, f: sim.flight, ev: sim.events.slice() };
  };
  const perfect = kickAt(0.12), ok = kickAt(0.4), early = kickAt(LEVELS.normal.ok + 0.3);
  assert.equal(perfect.ev.find(e => e.type === 'kick').quality, 'perfect');
  assert.equal(ok.ev.find(e => e.type === 'kick').quality, 'ok');
  assert.ok(perfect.f.dur < ok.f.dur - 0.5 && perfect.f.h < ok.f.h, 'the perfect one is faster and flatter');
  assert.ok(perfect.f.to === 1 && ok.f.to === 1 && netHeight(perfect.f) > COURT.NET && netHeight(ok.f) > COURT.NET + 1);
  assert.equal(early.ev.find(e => e.type === 'whiff').why, 'early');
  assert.equal(early.sim.flight.to, 0, 'the shuttle is still coming');
  // standing away from the ring is no kick either
  const sim = start(), f = sim.flight;
  while (f.dur - f.t > 0.15) sim.step(DT, { pos: { u: f.bu + 2.5, v: f.bv } });
  sim.events.length = 0;
  sim.step(DT, { pos: { u: f.bu + 2.5, v: f.bv }, kick: true });
  assert.equal(sim.events.find(e => e.type === 'whiff').why, 'far');
  // the stick: left / right, and up the court = deep, back = a short drop
  const left = kickAt(0.12, { mx: -1 }).f, right = kickAt(0.12, { mx: 1 }).f, deep = kickAt(0.12, { mv: -1 }).f, short = kickAt(0.12, { mv: 1 }).f;
  assert.ok(left.bu < -1.5 && right.bu > 1.5, 'aimed across');
  assert.ok(deep.bv < -4.4 && short.bv > -2.2 && short.bv < 0, 'aimed along');
  for (const q of [left, right, deep, short]) assert.ok(Math.abs(q.bu) <= COURT.W / 2 && Math.abs(q.bv) <= COURT.HALF, 'Mika\'s kicks always land in');
});

test('foot-tennis: the kids differ, and their own game keeps rallies going', () => {
  const tally = style => {
    let flat = 0, kicks = 0, faults = 0, rallies = 0, points = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { log } = play(new FootnetSim({ seed, players: [{ id: 'a', team: 0, style }, { id: 'b', team: 1, style }], target: 5 }), () => ({}));
      kicks += count(log, 'kick'); flat += count(log, 'kick', e => e.quality === 'perfect');
      faults += count(log, 'point', e => e.why !== 'ground'); points += count(log, 'point');
      rallies += log.filter(e => e.type === 'point').reduce((s, e) => s + e.rally, 0);
    }
    return { flat: flat / kicks, faults: faults / kicks, rally: rallies / points };
  };
  const K = tally('strong'), Y = tally('tricky'), D = tally('wobbly');
  assert.ok(K.flat > Y.flat && Y.flat > D.flat, 'Kenta hits the flat one most, Daichi least');
  assert.ok(D.faults > 2 * K.faults, 'Daichi finds the net and the grass');
  assert.ok(K.rally > D.rally && D.rally >= 3, `rallies last (Kenta ${K.rally.toFixed(1)}, Yui ${Y.rally.toFixed(1)}, Daichi ${D.rally.toFixed(1)} touches)`);
  // Yui sends it away from where her opponent stands
  let away = 0, n = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const sim = new FootnetSim({ seed, players: [{ id: 'k', team: 0, style: 'strong' }, { id: 'y', team: 1, style: 'tricky' }], target: 5 });
    let t = 0;
    while (!sim.over && t < 400) {
      const ku = sim.players[0].u;
      sim.step(DT); t += DT;
      for (const e of sim.events) if (e.type === 'kick' && e.who === 'y' && sim.flight && !sim.flight.fault && sim.flight.to === 0) { n++; if (Math.sign(sim.flight.bu) !== Math.sign(ku) || Math.abs(ku) < 0.05) away++; }
      sim.events.length = 0;
    }
  }
  assert.ok(n > 30 && away / n > 0.9, `Yui aims at the open side (${away}/${n})`);
  // two against Mika alone: they get in each other's way a little (her side is not punished for being one)
  const two = new FootnetSim({ seed: 1, players: [MIKA, KENTA, YUI] }), one = new FootnetSim({ seed: 1, players: [MIKA, KENTA] });
  assert.ok(two.crowd > 1 && one.crowd === 1);
});

test('foot-tennis: alone, Mika plays the kick-board (three returns in a row are a point)', () => {
  const { sim, log } = play(new FootnetSim({ seed: 4, players: [MIKA], level: 'first', target: 3, wall: true }), s => footnetBot(s, 0.12));
  assert.ok(sim.over?.won);
  assert.deepEqual(sim.score, [3, 0]);
  assert.equal(count(log, 'kick', e => e.human), 9, 'three points of three returns');
  assert.equal(count(log, 'wall'), 9, 'every shuttle of hers reaches the board (the last one included)');
  assert.ok(log.filter(e => e.type === 'point').every(e => e.why === 'streak'));
  // dropping it gives the board the point and breaks the run
  const lazy = play(new FootnetSim({ seed: 4, players: [MIKA], level: 'normal', target: 3, wall: true }), s => footnetBot(s, () => -1));
  assert.deepEqual(lazy.sim.score, [0, 3]);
  assert.equal(lazy.sim.result().won, false);
});

test('keep it up: touches in a row are counted; three drops or the clock end the round', () => {
  // everybody in a ring, Mika nearest the camera, all on the near half and off the net
  for (const n of [1, 2, 3, 4]) for (const p of ringPlaces(n)) assert.ok(Math.abs(p.u) <= COURT.W / 2 && p.v > 0.8 && p.v < COURT.HALF);
  assert.ok(ringPlaces(3)[0].v > RING.v + 1, 'the first place is the near one');
  const group = [MIKA, { id: 'v3', style: 'strong' }, { id: 'v20', style: 'tricky' }];
  const a = play(new KeepupSim({ seed: 2, players: group, level: 'normal' }), s => keepupBot(s, 0.12));
  assert.ok(a.sim.over && a.sim.timeLeft === 0 && a.sim.lives === 3, 'a careful round runs out the clock');
  assert.ok(a.sim.over.score >= KEEPUP_STARS[1], `a good run (${a.sim.over.score})`);
  assert.equal(a.sim.over.score, a.sim.best);
  assert.ok(a.t > 60 && a.t < 90);
  // the count follows the kicks: it is one after a serve and grows by one a touch, and a drop puts it back
  let c = 0;
  for (const e of a.log) {
    if (e.type === 'serve') c = 1; else if (e.type === 'kick') c++; else if (e.type === 'point') { assert.equal(e.rally, c); c = 0; }
  }
  assert.ok(Math.max(...a.log.filter(e => e.type === 'point').map(e => e.rally), c) === a.sim.best || a.sim.best >= c);
  // she never returns: three lives, then it is over, with whatever the kids managed between themselves
  const b = play(new KeepupSim({ seed: 2, players: group, level: 'normal' }), s => keepupBot(s, () => -1));
  assert.ok(b.sim.over && b.sim.lives === 0 && b.sim.timeLeft > 0);
  assert.equal(count(b.log, 'point', e => e.human), 3);
  assert.ok(count(b.log, 'kick', e => e.human) === 0);
  // a kid's drop costs no life
  for (const e of b.log.filter(q => q.type === 'point' && !q.human)) assert.ok(e.lives >= 0);
  assert.ok(a.log.filter(e => e.type === 'point' && !e.human).every(e => e.lives === 3));
  // alone she juggles; the stick places the next one
  const solo = play(new KeepupSim({ seed: 9, players: [MIKA], level: 'first' }), s => keepupBot(s, 0.12));
  assert.ok(solo.sim.over.score >= 20 && solo.sim.over.stars >= 2);
  for (const e of solo.log) if (e.type === 'kick') assert.ok(e.human);
  // replays exactly
  const again = new KeepupSim({ seed: 2, players: group, level: 'normal' }), log = [];
  for (const [mx, mv, kick] of a.inputs) { again.step(DT, { mx, mv, kick: !!kick }); for (const e of again.events) log.push(e); again.events.length = 0; }
  assert.deepEqual(log, a.log);
  // the kids' own ring has no clock and no lives
  const kids = play(new KeepupSim({ seed: 3, players: [{ id: 'v3', style: 'strong' }, { id: 'v10', style: 'wobbly' }] }), () => ({}), 120);
  assert.equal(kids.sim.over, null);
  assert.ok(count(kids.log, 'kick') > 40 && count(kids.log, 'point') >= 1);
});

// ------------------------------------------------------------------------------------------------ the registry, the save, the kids' day
test('yard games: a registry of games with one shape, so another plugs in', () => {
  assert.deepEqual(YARD_GAMES.map(g => g.id), ['footnet', 'keepup']);
  assert.deepEqual(Object.keys(YARD_NAMES), YARD_GAMES.map(g => g.id));
  assert.equal(nextGame('footnet'), 'keepup');
  assert.equal(nextGame('keepup'), 'footnet');
  assert.equal(nextGame('nonsense'), 'footnet');
  for (const G of YARD_GAMES) {
    assert.equal(G.name, YARD_NAMES[G.id]);
    for (const f of ['teams', 'target', 'create', 'bot']) assert.equal(typeof G[f], 'function', `${G.id}.${f}`);
    assert.ok(G.focus.w > 0 && G.focus.l > 0);
    for (const kids of [[], ['a'], ['a', 'b'], ['a', 'b', 'c']]) {
      const T = G.teams(kids);
      assert.ok(T.mine.length + T.theirs.length <= 3 && new Set([...T.mine, ...T.theirs]).size === T.mine.length + T.theirs.length, 'a kid plays once');
      const players = [MIKA, ...T.mine.map(id => ({ id, team: 0 })), ...T.theirs.map(id => ({ id, team: 1 }))];
      const sim = G.create({ seed: 1, players, level: 'first', target: G.target('first'), wall: !!T.wall });
      // the shape the round runner reads
      for (const k of ['players', 'shuttle', 'marker', 'score', 'events', 'L']) assert.ok(sim[k], `${G.id}: sim.${k}`);
      assert.equal(sim.state, 'serve');
      assert.equal(sim.over, null);
      const r = play(sim, s => G.bot(s, 0.12), 400);
      assert.ok(r.sim.over, `${G.id} with ${kids.length} kids ends`);
      for (const k of ['won', 'score', 'rally', 'stars']) assert.ok(k in r.sim.over, `${G.id}: result.${k}`);
      assert.ok(r.sim.over.stars >= 1, `${G.id} with ${kids.length} kids: careful play earns a star`);
    }
  }
  // foot-tennis sides: nobody = the board, one or two = against them, three = one of them on Mika's side
  const T = YARD_GAME.footnet.teams;
  assert.ok(T([]).wall && !T(['a']).wall);
  assert.deepEqual([T(['a']).theirs.length, T(['a', 'b']).theirs.length, T(['a', 'b', 'c']).mine.length, T(['a', 'b', 'c']).theirs.length], [1, 2, 1, 2]);
  assert.equal(YARD_GAME.footnet.target('first'), 3);
  assert.equal(YARD_GAME.footnet.target('normal'), 5);
  // gentler the first time and in Easy mode
  assert.equal(levelFor(undefined, false), 'first');
  assert.equal(levelFor({ plays: 0 }, true), 'first');
  assert.equal(levelFor({ plays: 2 }, true), 'easy');
  assert.equal(levelFor({ plays: 2 }, false), 'normal');
});

test('yard games: the kids by themselves take turns, and one alone juggles', () => {
  assert.deepEqual(ambientRoles('footnet', ['a']), { game: 'keepup', play: ['a'], watch: [] });
  assert.deepEqual(ambientRoles('footnet', ['a', 'b']), { game: 'footnet', play: ['a', 'b'], watch: [] });
  const r0 = ambientRoles('footnet', ['a', 'b', 'c'], 0), r1 = ambientRoles('footnet', ['a', 'b', 'c'], 1), r2 = ambientRoles('footnet', ['a', 'b', 'c'], 5, 'b');
  assert.equal(r0.play.length, 2); assert.equal(r0.watch.length, 1);
  assert.notEqual(r0.watch[0], r1.watch[0], 'the bench changes');
  assert.deepEqual(r2.watch, ['b'], 'the loser sits out');
  assert.equal(ambientRoles('footnet', ['a', 'b', 'c', 'd']).play.length, 4);
  assert.deepEqual(ambientRoles('keepup', ['a', 'b', 'c']), { game: 'keepup', play: ['a', 'b', 'c'], watch: [] });
  // a kids' match (first to three) is over in well under their play time, with real rallies
  let time = 0, touches = 0, points = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { t, log } = play(new FootnetSim({ seed, players: [{ id: 'v3', team: 0, style: 'strong' }, { id: 'v10', team: 1, style: 'wobbly' }], target: 3 }), () => ({}));
    time += t; touches += count(log, 'kick') + count(log, 'serve'); points += count(log, 'point');
  }
  assert.ok(time / 20 > 12 && time / 20 < 60, `a kids' match takes ${(time / 20).toFixed(0)} s`);
  assert.ok(touches / points >= 3, `${(touches / points).toFixed(1)} touches a point`);
});

test('yard save: the record lives in quest.state.yard and survives odd saves', () => {
  assert.deepEqual(freshState().yard, { game: 'footnet' });
  assert.deepEqual(cleanYard(null), { game: 'footnet' });
  assert.deepEqual(cleanYard([1, 2]), { game: 'footnet' });
  assert.deepEqual(cleanYard({ game: 'chess', footnet: 'x', keepup: { plays: 2.7, best: -3, stars: 9, wins: NaN }, other: { plays: 1 } }), { game: 'footnet', keepup: { plays: 2, wins: 0, best: 0, rally: 0, stars: 3 } });
  const a = recordYard(undefined, { score: 5, won: true, rally: 9, stars: 2 });
  assert.deepEqual(a, { rec: { plays: 1, wins: 1, best: 5, rally: 9, stars: 2 }, newBest: true });
  const b = recordYard(a.rec, { score: 3, won: false, rally: 12, stars: 1 });
  assert.deepEqual(b, { rec: { plays: 2, wins: 1, best: 5, rally: 12, stars: 2 }, newBest: false });
  // migrate: older saves get the block, a broken one is cleaned, a good one is kept
  const old = freshState(); delete old.yard;
  assert.deepEqual(migrate(old).yard, { game: 'footnet' });
  assert.deepEqual(migrate({ ...freshState(), yard: 'no' }).yard, { game: 'footnet' });
  const good = { game: 'keepup', footnet: { plays: 3, wins: 2, best: 5, rally: 14, stars: 3 } };
  assert.deepEqual(migrate({ ...freshState(), yard: good }).yard, good);
});

test('yard kids: Kenta, Yui and Daichi play at the yard part of the day, together, and keep their other places', () => {
  const kids = Object.keys(KID_STYLE).map(id => PEOPLE.find(p => p.id === id));
  const roads = buildRoads({ spots: SPOTS });
  for (const k of kids) {
    assert.equal(k.village, 'kawabe');
    const tasks = k.plan.flatMap(b => b.tasks);
    const yard = tasks.filter(t => t.at === YARD.spot);
    assert.ok(yard.some(t => t.play === 'footnet') && yard.some(t => t.play === 'keepup'), `${k.name} plays both games`);
    assert.ok(yard.every(t => YARD_GAME[t.play] && t.t >= 30 && t.t <= 60));
    for (const t of yard) for (const o of t.with) assert.ok(KID_STYLE[o] && o !== k.id, `${k.name} plays with the other kids`);
    // not all day: tag, hopscotch and the rest are still in the plan, and no block is only the yard
    assert.ok(tasks.some(t => t.play === 'tag') && tasks.some(t => t.at === 'kawabe.playground'));
    for (const b of k.plan) { const y = b.tasks.filter(t => t.at === YARD.spot).length; assert.ok(y <= 1 && (y === 0 || b.tasks.length >= 2), 'a block has other things in it'); }
    // every daytime block of theirs that has the yard has it for the friends they name, so they find each other
    for (const b of k.plan) for (const t of b.tasks.filter(q => q.at === YARD.spot)) {
      for (const o of t.with) {
        const friend = PEOPLE.find(p => p.id === o);
        const same = friend.plan.filter(fb => fb.from === b.from && JSON.stringify(fb.when || null) === JSON.stringify(b.when || null));
        assert.ok(same.some(fb => fb.tasks.some(q => q.play === t.play && q.at === t.at)), `${k.name} at ${b.from}: ${friend.name} plays ${t.play} too`);
      }
    }
  }
  // they can walk there from where they play today
  for (const from of ['kawabe.playground', 'kawabe.field', 'kawabe.well', 'kawabe.lessons']) {
    const path = route(roads, SPOTS[from], YARD.spot);
    assert.ok(path && path.length >= 2, `a way from ${from} to the yard`);
    const [ex, ez] = path[path.length - 1];
    assert.ok(Math.hypot(ex - SPOTS[YARD.spot].x, ez - SPOTS[YARD.spot].z) < 0.6);
    // the last leg comes up to the gate from outside: it never cuts through the fence
    const [px, pz] = path[path.length - 2];
    for (const [x0, z0, x1, z1] of fenceRuns()) for (let t = 0; t <= 1; t += 0.05) {
      const x = px + (ex - px) * t, z = pz + (ez - pz) * t;
      assert.ok(segDist(x0, z0, x1, z1, x, z) > 0.25, `the way from ${from} walks through the fence`);
    }
  }
});
