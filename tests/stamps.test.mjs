// The daily stamp card (docs/STAMPS.md): the day key, drawing a card, stamps and luck, the save shape, the tables, and the
// cottage decorations measured against the room model itself (public/models/interior-cottage.glb).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { DELIVERIES, FINDS, DECOR, TABLES, playAsker } from '../src/content/stamps.js';
import { ROLLOVER, BONUS, dayKeyOf, prevDay, shouldRoll, hash32, pick, drawCard, validateCard, award, luck, crossed, decorUnlocked, nextThreshold,
  playCandidates, playProgress, objectiveText, targetOf, taskText, askerOf, placeOf } from '../src/game/stamps-rules.js';
import { freshStamps, cleanStamps, stampsWanted } from '../src/game/stamps-save.js';
import { freshState, migrate } from '../src/game/quest.js';
import { exploreState } from '../src/game/fastforward.js';
import { ITEMS } from '../src/game/story.js';
import { buildCatalogue, recordOf } from '../src/content/minigames.js';
import { PEOPLE } from '../src/content/townsfolk.js';
import { HOTSPOTS } from '../src/content/hotspots.js';
import { HOMES } from '../src/world/interiors.js';
import { PLACES } from '../src/world/layout.js';
import { placeProblems } from '../src/world/roads.js';
import { bootModels } from '../src/content/models.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAYS = playCandidates(buildCatalogue());
const fmt = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));   // an English tx() stand-in
const days = (from, n) => { const out = [from]; for (let i = 1; i < n; i++) { const [y, m, d] = out[i - 1].split('-').map(Number); out.push(dayKeyOf(new Date(y, m - 1, d + 1, 12), 0)); } return out; };
const card = (day = '2026-11-20', st = freshState()) => ({ ...freshStamps(), day, tasks: drawCard(day, TABLES, st, PLAYS) });

// ------------------------------------------------------------------ 1. day keys
test('stamps: the day turns at 04:00 local time, keys go back over months and years, and a carried parcel holds the card', () => {
  assert.equal(ROLLOVER, 4);
  assert.equal(dayKeyOf(new Date(2026, 10, 19, 3, 59)), '2026-11-18');
  assert.equal(dayKeyOf(new Date(2026, 10, 19, 4, 0)), '2026-11-19');
  assert.equal(dayKeyOf(new Date(2026, 10, 19, 23, 59)), '2026-11-19');
  assert.equal(prevDay('2026-03-01'), '2026-02-28');
  assert.equal(prevDay('2024-03-01'), '2024-02-29');
  assert.equal(prevDay('2027-01-01'), '2026-12-31');
  const s = card('2026-11-20');
  assert.ok(shouldRoll(freshStamps(), '2026-11-20'), 'no card yet: draw one');
  assert.ok(shouldRoll(s, '2026-11-21'), 'a newer day rolls');
  assert.ok(!shouldRoll(s, '2026-11-20'), 'the same day keeps the card');
  assert.ok(!shouldRoll(s, '2026-11-19'), 'a clock moved back keeps the card');
  s.tasks[0].carry = true;
  assert.ok(!shouldRoll(s, '2026-11-22'), 'a parcel being carried defers the roll');
  s.tasks[0].done = true; s.tasks[0].carry = false;
  assert.ok(shouldRoll(s, '2026-11-22'), 'once delivered, the new day rolls');
});

// ------------------------------------------------------------------ 2. drawing a card
test('stamps: a card is deterministic, in order, never repeats yesterday, and shows every entry within a year', () => {
  assert.equal(hash32(''), 0x811c9dc5, 'FNV-1a offset basis');
  assert.equal(hash32('a'), 0xe40c292c, 'FNV-1a of "a"');
  const st = freshState();
  assert.deepEqual(drawCard('2026-11-20', TABLES, st, PLAYS), drawCard('2026-11-20', TABLES, st, PLAYS));
  const year = days('2026-01-01', 400);
  const seen = [new Set(), new Set(), new Set()];
  let prev = null;
  for (const d of year) {
    const c = drawCard(d, TABLES, st, PLAYS);
    assert.deepEqual(c.map(t => t.k), ['deliver', 'find', 'play']);
    assert.ok(DELIVERIES.some(x => x.id === c[0].id) && FINDS.some(x => x.id === c[1].id) && PLAYS.some(x => x.id === c[2].id), `ids exist on ${d}`);
    assert.ok(c[1].spot >= 0 && c[1].spot <= 2);
    assert.ok(c.every(t => t.done === false) && c[0].carry === false);
    if (prev) for (let i = 0; i < 3; i++) assert.notEqual(c[i].id, prev[i].id, `slot ${i} repeats yesterday on ${d}`);
    c.forEach((t, i) => seen[i].add(t.id));
    prev = c;
  }
  // within any 365 days every entry comes up (the first year, and one starting mid-way)
  for (const start of [0, 35]) {
    const s = [new Set(), new Set(), new Set()];
    for (const d of year.slice(start, start + 365)) drawCard(d, TABLES, st, PLAYS).forEach((t, i) => s[i].add(t.id));
    assert.equal(s[0].size, DELIVERIES.length);
    assert.equal(s[1].size, FINDS.length);
    assert.equal(s[2].size, PLAYS.length);
  }
  // the picks also never repeat across a summer-time change, and the n = 2 case alternates
  for (const d of days('2026-03-25', 10).slice(1)) assert.notEqual(pick(d, 0, 6, 'x'), pick(prevDay(d), 0, 6, 'x'));
  for (const d of days('2026-01-01', 30).slice(1)) assert.notEqual(pick(d, 2, 2, 'x'), pick(prevDay(d), 2, 2, 'x'));
  assert.equal(pick('2026-01-01', 0, 1), 0);
});

test('stamps: finds are never story items, the play list has no sky or workshop, and a base is the game\'s progress', () => {
  // a find is picked up as item 'stamp' (Director.pickup), which is no ITEMS id: it never lands in the inventory
  assert.ok(!('stamp' in ITEMS), 'the pickup item kind "stamp" is not an ITEMS id');
  for (const F of FINDS) assert.ok(!('item' in F), `${F.id} carries no item of its own`);
  assert.ok(PLAYS.length > 10);
  assert.ok(PLAYS.every(e => e.kind === 'trick' || e.kind === 'yard' || e.kind === 'fish'));
  assert.ok(!PLAYS.some(e => e.kind === 'sky' || e.kind === 'workshop'));
  assert.equal(PLAYS.filter(e => e.kind === 'fish').length, 1);
  assert.equal(PLAYS.find(e => e.kind === 'fish').id, 'fish:dock');
  assert.deepEqual(PLAYS.map(e => e.id), PLAYS.map(e => e.id).slice().sort());
  const st = freshState();
  st.tricks = { kite: { plays: 3 } }; st.yard = { tug: { plays: 5 } }; st.fishLog = { trout: 2, koi: 1 };
  for (const d of days('2026-05-01', 40)) {
    const c = drawCard(d, TABLES, st, PLAYS), e = PLAYS.find(x => x.id === c[2].id);
    assert.equal(c[2].base, playProgress(e, st));
  }
});

// ------------------------------------------------------------------ 3. progress
test('stamps: play progress is the record\'s plays (tricks, yard) or every fish caught, and only more than the base counts', () => {
  const trick = PLAYS.find(e => e.id === 'trick:kite'), yard = PLAYS.find(e => e.id === 'yard:tug'), fish = PLAYS.find(e => e.kind === 'fish');
  const st = freshState();
  assert.equal(playProgress(trick, st), 0);
  st.tricks.kite = { learned: true, plays: 2, best: 10, stars: 1 };
  assert.equal(playProgress(trick, st), 2);
  assert.equal(playProgress(trick, st), recordOf(trick, st).plays);
  st.yard.tug = { plays: 4 };
  assert.equal(playProgress(yard, st), 4);
  st.fishLog = { trout: 3, char: 2, koi: 0 };
  assert.equal(playProgress(fish, st), 5, 'the fishLog sum');
  // a task: done only above its base
  const base = playProgress(trick, st), done = () => playProgress(trick, st) > base;
  assert.ok(!done());
  st.tricks.kite.plays++;
  assert.ok(done());
});

// ------------------------------------------------------------------ 4. stamps and luck
test('stamps: a task stamps once, a full card banks one bonus, luck comes once a card and never counts toward 3/3', () => {
  const s = card();
  let total = s.total;
  const r0 = award(s, 0);
  assert.deepEqual(r0, { full: false, unlocked: [] });
  assert.equal(s.total, 1);
  assert.equal(award(s, 0), null, 'idempotent');
  assert.equal(s.total, 1);
  assert.ok(s.tasks[0].done && !s.tasks[0].carry);
  const l = luck(s, 'Sun shower');
  assert.ok(l && s.lucky === 'Sun shower' && s.total === 2);
  assert.deepEqual(l.unlocked, ['lantern'], 'the second stamp brings the lantern');
  assert.equal(luck(s, 'Geese'), null, 'once per card');
  assert.equal(s.tasks.filter(t => t.done).length, 1, 'luck is not one of the three');
  assert.equal(award(s, 1).full, false);
  const r2 = award(s, 2);
  assert.equal(r2.full, true);
  assert.equal(s.cards, 1);
  assert.equal(s.total, 4 + BONUS, 'three stamps, luck and the bonus');
  assert.equal(award(s, 2), null);
  assert.equal(s.cards, 1, 'the bonus came exactly once');
  total = s.total;
  assert.ok(total >= 5);
  // with no card there is no luck
  assert.equal(luck(freshStamps(), 'Breeze'), null);
});

test('stamps: decorations unlock at 2, 4, 8, 12, 16, 20, 26 and 32 stamps, and the total never goes down', () => {
  assert.deepEqual(DECOR.map(d => d.at), [2, 4, 8, 12, 16, 20, 26, 32]);
  let s = { ...freshStamps() }, last = 0;
  const got = [];
  for (const d of days('2026-01-01', 12)) {
    s = { ...s, day: d, tasks: drawCard(d, TABLES, freshState(), PLAYS), lucky: '' };
    for (const slot of [0, 1, 2]) {
      const before = s.total, r = award(s, slot);
      assert.ok(s.total >= last && s.total > before);
      last = s.total;
      for (const id of r.unlocked) got.push([id, s.total]);
    }
  }
  assert.deepEqual(got.map(x => x[0]), DECOR.map(d => d.id), 'each decoration once, in order');
  for (const [id, at] of got) assert.ok(at >= DECOR.find(d => d.id === id).at);
  assert.deepEqual(decorUnlocked(8), ['lantern', 'geraniums', 'paperflowers']);
  assert.equal(nextThreshold(0), 2);
  assert.equal(nextThreshold(14), 16);
  assert.equal(nextThreshold(32), null);
  assert.deepEqual(crossed(3, 9), ['geraniums', 'paperflowers']);
});

test('stamps: a card whose entry left the tables draws only that slot again, keeping it done', () => {
  const s = card('2026-07-07');
  s.tasks[1].done = true;
  const keep = JSON.parse(JSON.stringify(s.tasks));
  assert.equal(validateCard(s, TABLES, freshState(), PLAYS), false);
  assert.deepEqual(s.tasks, keep);
  s.tasks[1].id = 'gone';
  s.tasks[2].id = 'trick:gone';
  assert.equal(validateCard(s, TABLES, freshState(), PLAYS), true);
  assert.deepEqual(s.tasks[0], keep[0]);
  assert.ok(FINDS.some(f => f.id === s.tasks[1].id) && s.tasks[1].done === true);
  assert.ok(PLAYS.some(e => e.id === s.tasks[2].id) && s.tasks[2].done === false);
});

// ------------------------------------------------------------------ 5. the save
test('stamps: the save is cleaned: garbage gives a fresh card, a wrong shape a redraw, counts stay whole and seen unique', () => {
  for (const x of [null, 1, 'x', [], undefined]) assert.deepEqual(cleanStamps(x), freshStamps());
  const good = { ...card('2026-11-20'), total: 9, cards: 2, lucky: 'Geese', seen: ['lantern'] };
  assert.deepEqual(cleanStamps(JSON.parse(JSON.stringify(good))), good);
  const wrong = [
    { ...good, day: '20-11-2026' },
    { ...good, tasks: good.tasks.slice(0, 2) },
    { ...good, tasks: [good.tasks[1], good.tasks[0], good.tasks[2]] },
    { ...good, tasks: [{ ...good.tasks[0], carry: 'yes' }, good.tasks[1], good.tasks[2]] },
    { ...good, tasks: [good.tasks[0], { ...good.tasks[1], spot: 1.5 }, good.tasks[2]] },
    { ...good, tasks: [good.tasks[0], good.tasks[1], { ...good.tasks[2], base: -1 }] },
    { ...good, tasks: [good.tasks[0], good.tasks[1], { ...good.tasks[2], id: 7 }] },
  ];
  for (const w of wrong) {
    const c = cleanStamps(w);
    assert.equal(c.day, '');
    assert.deepEqual(c.tasks, []);
    assert.equal(c.total, 9, 'banked stamps stay');
    assert.ok(shouldRoll(c, '2026-11-20'), 'a redraw follows');
  }
  const odd = cleanStamps({ total: -4, cards: 2.7, lucky: 'x'.repeat(40), seen: ['a', 'a', 3, null, 'b', ''] });
  assert.equal(odd.total, 0);
  assert.equal(odd.cards, 2);
  assert.deepEqual(odd.seen, ['a', 'b']);
  assert.equal(odd.lucky, '', 'no card, no luck');
  assert.equal(cleanStamps({ ...good, lucky: 'y'.repeat(40) }).lucky.length, 24);
  // the quest
  assert.deepEqual(freshState().stamps, freshStamps());
  const old = freshState(); delete old.stamps;
  assert.deepEqual(migrate(old).stamps, freshStamps(), 'an old save gets an empty card');
  assert.deepEqual(migrate({ ...freshState(), stamps: { total: 'lots' } }).stamps, freshStamps());
  assert.deepEqual(migrate({ ...freshState(), stamps: good }).stamps, good);
  assert.deepEqual(exploreState().stamps, freshStamps(), 'Explore (and its "Start over") begins with an empty card');
  assert.ok(JSON.stringify(freshStamps()).length <= 80);
});

test('stamps: ?stamps=off never, a QA run only with ?stamps=on, otherwise on', () => {
  const P = q => new URLSearchParams(q);
  assert.equal(stampsWanted(P('')), true);
  assert.equal(stampsWanted(P('stamps=off')), false);
  assert.equal(stampsWanted(P('qa=1')), false);
  assert.equal(stampsWanted(P('qa=1&stamps=on')), true);
  assert.equal(stampsWanted(P('qa=1&stamps=off')), false);
});

// ------------------------------------------------------------------ 6. the tables
test('stamps: deliveries go between two neighbours\' own front doors, finds lie on dry open ground near their place, models are boot props', () => {
  const homes = new Set(HOMES.flatMap(([, list]) => list));
  const boot = new Set(bootModels());
  const people = new Map(PEOPLE.map(p => [p.id, p]));
  assert.equal(new Set(DELIVERIES.map(d => d.id)).size, DELIVERIES.length);
  for (const D of DELIVERIES) {
    const a = people.get(D.from), b = people.get(D.to);
    assert.ok(a && b, `${D.id}: people`);
    assert.equal(a.home, D.fromDoor, `${D.id}: the sender lives there`);
    assert.equal(b.home, D.toDoor, `${D.id}: the recipient lives there`);
    assert.notEqual(D.fromDoor, D.toDoor);
    assert.ok(homes.has(D.fromDoor) && homes.has(D.toDoor), `${D.id}: doors are homes`);
    assert.ok(!['hana', 'ota', 'genzo', 'rin', 'sora'].includes(D.from) && !['hana', 'ota', 'genzo', 'rin', 'sora'].includes(D.to));
  }
  for (const F of FINDS) {
    assert.ok(people.has(F.asker), `${F.id}: asker`);
    assert.equal(F.spots.length, 3);
    assert.ok(boot.has(F.model), `${F.id}: ${F.model} is loaded at boot`);
    for (const [x, z, place] of F.spots) {
      assert.deepEqual(placeProblems(x, z), [], `${F.id} at ${x}, ${z}`);
      const P = PLACES[place];
      assert.ok(P?.name, `${F.id}: place ${place}`);
      assert.ok(Math.hypot(x - P.x, z - P.z) <= 70, `${F.id} at ${x}, ${z} is within 70 m of ${P.name}`);
    }
  }
  for (const D of DECOR) assert.ok(boot.has(D.model), `${D.id}: ${D.model} is loaded at boot`);
});

// ------------------------------------------------------------------ 7. no story side effects
test('stamps: drawing, stamping and luck never touch the story items, flags or purse', () => {
  const st = exploreState();
  const snap = () => JSON.stringify([st.inv, st.flags, st.mon]);
  const before = snap();
  st.stamps = { ...st.stamps, day: '2026-11-20', tasks: drawCard('2026-11-20', TABLES, st, PLAYS) };
  validateCard(st.stamps, TABLES, st, PLAYS);
  for (const slot of [0, 1, 2]) award(st.stamps, slot);
  luck(st.stamps, 'Breeze');
  objectiveText(st.stamps, TABLES, fmt, PLAYS);
  targetOf(st.stamps);
  assert.equal(snap(), before);
});

// ------------------------------------------------------------------ 8. the decorations, against the room model
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const applyPoint = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
/** World-space box of a node's own mesh (the same maths as scripts/interior-manifest.mjs). */
function boxIn(node) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  let any = false;
  for (const prim of node.getMesh()?.listPrimitives() || []) {
    const acc = prim.getAttribute('POSITION');
    if (!acc) continue;
    any = true;
    const mn = acc.getMin([]), mx = acc.getMax([]), m = node.getWorldMatrix();
    for (const x of [mn[0], mx[0]]) for (const y of [mn[1], mx[1]]) for (const z of [mn[2], mx[2]]) {
      const p = applyPoint(m, [x, y, z]);
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    }
  }
  return any ? { min: lo, max: hi } : null;
}
const visit = (doc, fn) => { const go = n => { fn(n); n.listChildren().forEach(go); }; doc.getRoot().getDefaultScene().listChildren().forEach(go); };

async function readRoom() {
  const doc = await io.read(path.join(ROOT, 'public/models/interior-cottage.glb'));
  const cols = [], nodes = {}, tops = [], verts = [];
  visit(doc, n => {
    const name = n.getName();
    if (name.startsWith('Col_')) { const b = boxIn(n); if (b) cols.push({ name, ...b }); return; }
    if (/^(Spawn|Exit|Item_)/.test(name)) nodes[name] = applyPoint(n.getWorldMatrix(), [0, 0, 0]);
    // the visible faces that look straight up: what a piece can rest on
    const m = n.getWorldMatrix();
    for (const prim of n.getMesh()?.listPrimitives() || []) {
      const acc = prim.getAttribute('POSITION'), idx = prim.getIndices()?.getArray(), el = [];
      if (!acc) continue;
      const P = []; for (let i = 0; i < acc.getCount(); i++) P.push(applyPoint(m, acc.getElement(i, el)));
      verts.push(...P);
      const nT = idx ? idx.length / 3 : P.length / 3;
      for (let t = 0; t < nT; t++) {
        const [a, b, c] = [0, 1, 2].map(k => P[idx ? idx[t * 3 + k] : t * 3 + k]);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, L = Math.hypot(nx, ny, nz) || 1;
        if (ny / L > 0.98) tops.push([a, b, c]);
      }
    }
  });
  return { cols, nodes, tops, verts };
}
const inTri = (x, z, [a, b, c]) => {
  const s = (p, q) => (x - q[0]) * (p[2] - q[2]) - (p[0] - q[0]) * (z - q[2]);
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
async function modelBox(name) {
  const doc = await io.read(path.join(ROOT, `public/models/${name}.glb`));
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  visit(doc, n => { const b = boxIn(n); if (b) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.min[k]); hi[k] = Math.max(hi[k], b.max[k]); } });
  return { min: lo, max: hi };
}
/** A piece's room-space footprint (x0, x1, z0, z1), base and top, as the runtime places it (y from its own box). */
function placed(D, mb) {
  const c = Math.cos(D.yaw), s = Math.sin(D.yaw);
  const xs = [], zs = [];
  for (const x of [mb.min[0], mb.max[0]]) for (const z of [mb.min[2], mb.max[2]]) {
    // three.js rotation.y: x' = x cos + z sin, z' = -x sin + z cos
    xs.push(D.x + (x * c + z * s) * D.scale); zs.push(D.z + (-x * s + z * c) * D.scale);
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), base: D.surface, top: D.surface + (mb.max[1] - mb.min[1]) * D.scale };
}

test('stamps: every cottage decoration rests on something, inside the walls, clear of furniture, hotspots, gifts and the camera', async () => {
  const room = await readRoom();
  const SHELL = /^Col_(wall_|floor|ceiling)/;
  const furniture = room.cols.filter(b => !SHELL.test(b.name));
  const stands = HOTSPOTS.cottage.map(h => [h.id, h.stand[0], -h.stand[1]]);      // Blender (x, y) -> three (x, -y)
  for (const n of ['Spawn', 'Exit']) stands.push([n, room.nodes[n][0], room.nodes[n][2]]);
  const items = Object.entries(room.nodes).filter(([n]) => /^Item_(gift_|keepsake|kite)/.test(n));
  assert.ok(items.length >= 8 && stands.length === 6);
  for (const D of DECOR) {
    const f = placed(D, await modelBox(D.model)), cx = D.x, cz = D.z;
    // inside the walls
    assert.ok(f.x0 >= -3.48 && f.x1 <= 3.48 && f.z0 >= -3.08 && f.z1 <= 3.08, `${D.id}: footprint ${JSON.stringify(f)} leaves the room`);
    // it rests on something: the floor, or a furniture box under its centre whose visible top face is its surface
    const support = furniture.find(b => cx > b.min[0] && cx < b.max[0] && cz > b.min[2] && cz < b.max[2] && b.min[1] < D.surface && b.max[1] >= D.surface - 0.03);
    assert.ok(support || Math.abs(D.surface) < 0.03, `${D.id}: nothing under it`);
    if (support && Math.abs(support.max[1] - D.surface) > 0.03) assert.equal(support.name, 'Col_table', `${D.id}: off the top of ${support.name}`);   // (the table's box is taller than its top)
    const under = room.tops.filter(t => inTri(cx, cz, t)).map(t => (t[0][1] + t[1][1] + t[2][1]) / 3).filter(y => y <= D.surface + 0.05);
    const face = Math.max(...under);
    assert.ok(Math.abs(face - D.surface) <= 0.012, `${D.id}: rests at ${D.surface} but the face under it is at ${face.toFixed(3)} (floating or sunk)`);
    // nothing of the room's own (cups, the teapot, a beam) pokes into its box
    const inside = room.verts.filter(([x, y, z]) => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && y > D.surface + 0.015 && y < f.top);
    assert.equal(inside.length, 0, `${D.id}: the room's own things stick into it (${inside.slice(0, 2).map(p => p.map(v => v.toFixed(2)).join(',')).join(' ')})`);
    // clear of every other piece of furniture by 3 cm (in plan, where the heights overlap)
    for (const b of furniture) {
      if (b === support) continue;
      const apart = f.x1 + 0.03 <= b.min[0] || f.x0 - 0.03 >= b.max[0] || f.z1 + 0.03 <= b.min[2] || f.z0 - 0.03 >= b.max[2] || f.top <= b.min[1] || f.base >= b.max[1] - 0.001;
      assert.ok(apart, `${D.id} runs into ${b.name}`);
    }
    // never in the way: hotspot stands, Spawn and Exit 0.45 m off; gifts, the keepsake and the kite 0.35 m off
    for (const [id, x, z] of stands) {
      const dx = Math.max(f.x0 - x, 0, x - f.x1), dz = Math.max(f.z0 - z, 0, z - f.z1);
      assert.ok(Math.hypot(dx, dz) >= 0.45, `${D.id} is ${Math.hypot(dx, dz).toFixed(2)} m from ${id}`);
    }
    for (const [n, p] of items) assert.ok(Math.hypot(cx - p[0], D.surface - p[1], cz - p[2]) >= 0.35, `${D.id} is too close to ${n}`);
    // below the inside camera's band
    assert.ok(f.top < 2.4, `${D.id}: top at ${f.top.toFixed(2)}`);
  }
});

// ------------------------------------------------------------------ 9. words
test('stamps: names fit in 40 characters and every card line in 58', () => {
  for (const s of [...DELIVERIES.map(d => d.what), ...FINDS.map(f => f.name), ...DECOR.map(d => d.name), ...DECOR.map(d => d.from)]) assert.ok(s.length <= 40, `name too long: ${s}`);
  for (const e of PLAYS) assert.ok(['Hiro', 'Kenta', 'Mr. Nakano', 'Grandma Sora'].includes(playAsker(e)));
  const lines = [];
  for (const D of DELIVERIES) lines.push(fmt('Stamp card {n}/3: {task}', { n: 0, task: taskText({ k: 'deliver', id: D.id }, TABLES, PLAYS, fmt) }));
  for (const F of FINDS) lines.push(fmt('Stamp card {n}/3: {task}', { n: 1, task: taskText({ k: 'find', id: F.id }, TABLES, PLAYS, fmt) }));
  for (const e of PLAYS) lines.push(fmt('Stamp card {n}/3: {task}', { n: 2, task: taskText({ k: 'play', id: e.id }, TABLES, PLAYS, fmt) }));
  lines.push('Stamp card full. A new one comes tomorrow.');
  for (const l of lines) assert.ok(l.length <= 58 && !/\{\w+\}/.test(l), `card line too long or unfilled: ${l}`);
  // the words the card shows for each task
  const s = card('2026-11-20');
  assert.match(objectiveText(s, TABLES, fmt, PLAYS), /^Stamp card 0\/3: Take .+ to .+$/);
  for (const t of s.tasks) assert.ok(askerOf(t, TABLES, PLAYS));
  assert.match(placeOf(s.tasks[0]), /^(Kawabe|Takamori)$/);
  assert.ok(placeOf(s.tasks[1]));
  assert.ok(targetOf(s).door);
  award(s, 0);
  assert.ok(Number.isFinite(targetOf(s).x));
  award(s, 1);
  assert.equal(targetOf(s), null, 'a game has no arrow');
  award(s, 2);
  assert.equal(objectiveText(s, TABLES, fmt, PLAYS), 'Stamp card full. A new one comes tomorrow.');
  assert.equal(objectiveText(freshStamps(), TABLES, fmt, PLAYS), null);
});
