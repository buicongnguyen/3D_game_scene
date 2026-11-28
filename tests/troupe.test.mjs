// The group performance (content/troupe.js, game/perform/troupe.js): who stands where, the back row's routine, the bone
// copy between two rigs, the sing-along gate, the room check and the camera's group framing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBeatClock } from '../src/game/perform/beat-clock.js';
import { planPerformance, planBacking } from '../src/game/perform/plan.js';
import { vocalLines } from '../src/game/perform/mic-layer.js';
import { makeCopier, restPose, chorusAt } from '../src/game/perform/troupe.js';
import { planShots, shotPose, groupDist } from '../src/game/perform/camera-man.js';
import { canGroup } from '../src/game/singplay/flat.js';
import { groupLimits, groupMax, GROUP_LIMITS } from '../src/game/singplay/singplay.js';
import { strongPhone, BudgetWatch, dropNow, STRONG } from '../src/game/singplay/strong-phone.js';
import { mergeRowGeometry, atlasCell, canMerge, RowMesh } from '../src/game/perform/row-merge.js';
import { TROUPE, troupeOf, troupeFiles, leadOffset, GROUP_SIZES, castOf, SINGERS, NAMES, KOTONE, BACK_PACK, member } from '../src/content/troupe.js';
import { CLUB_LOOPS } from '../src/content/kotone-club.js';
import { VROID_MEMBERS } from './asset-contracts.mjs';

const BAR = 2.4, song = { id: 'test-song', bpm: 100, offset: 0, duration: 66 * BAR, mood: 'uplifting' };
const parts = [['intro', 4], ['verse', 8], ['pre', 4], ['chorus', 8], ['verse', 8], ['pre', 4], ['chorus', 8], ['bridge', 8], ['chorus', 8], ['outro', 6]];
const sections = []; let at = 0; for (const [kind, n] of parts) { sections.push({ t: at * BAR, e: (at + n) * BAR, kind, name: kind }); at += n; }
const lines = []; for (const s of sections) if (/verse|pre|chorus/.test(s.kind)) for (let t = s.t + .2; t < s.e - 1; t += BAR * 2) lines.push({ t, e: t + BAR * 1.5, text: 'la la', section: s.kind === 'pre' ? 'Pre-Chorus' : s.kind[0].toUpperCase() + s.kind.slice(1) });
const lyrics = { version: 1, lines };
const clock = createBeatClock(song, { sections, lyrics });
const lead = planPerformance(song, clock, lyrics);

test('the cast: Kotone leads the front row, two rows of four, one source a row, every file built', () => {
  assert.equal(TROUPE.length, 8);
  for (const row of [0, 1]) { const r = TROUPE.filter(m => m.row === row); assert.equal(r.length, 4); assert.equal(r.filter(m => m.source).length, 1, `row ${row}: one source`); }
  assert.ok(TROUPE.find(m => m.lead).row === 0 && TROUPE.find(m => m.lead).source);
  assert.deepEqual(GROUP_SIZES, [1, 4, 8]);
  assert.equal(troupeOf(1).length, 1); assert.equal(troupeOf(4).length, 4); assert.ok(troupeOf(4).every(m => m.row === 0));
  for (const m of TROUPE.filter(x => !x.lead)) assert.ok(VROID_MEMBERS.includes(m.file), `${m.file} has a contract`);
  // the back row stands between and outside the front row's shoulders (every face shows), well behind
  const front = TROUPE.filter(m => m.row === 0), back = TROUPE.filter(m => m.row === 1);
  for (const b of back) { assert.ok(Math.min(...front.map(f => Math.abs(f.x - b.x))) >= .7, `${b.id} not straight behind someone`); assert.ok(b.z <= -1.5); }
  // the files: nothing for a solo; four models for 4 (light on Low); eight with the back row's pack, not the others'
  assert.deepEqual(troupeFiles(1, true), []);
  assert.deepEqual(troupeFiles(4, true).sort(), ['vroid-nu1.lite', 'vroid-nu3.lite', 'vroid-nu4.lite']);
  const eight = troupeFiles(8, false);
  assert.equal(eight.filter(f => f.startsWith('moves-')).length, 1);
  assert.equal(eight.length, 8);
  assert.ok(Math.hypot(leadOffset().x, leadOffset().z) < 1, 'Kotone near the middle');
});

test('any member sings lead: she takes the lead place, Kotone hers (and stays the front row source), no new files', () => {
  assert.deepEqual([...SINGERS].sort(), TROUPE.map(m => m.id).sort(), 'the Singer row lists all eight');
  assert.equal(SINGERS[0], KOTONE); assert.deepEqual(Object.keys(NAMES).sort(), [...SINGERS].sort(), 'every singer has a name');
  assert.deepEqual(castOf(KOTONE), TROUPE.map(m => ({ ...m })), 'Kotone leading: the cast as it was');
  for (const id of SINGERS) {
    const c = castOf(id), lead = c.find(m => m.lead), kot = c.find(m => m.id === KOTONE);
    assert.equal(new Set(c.map(m => m.id)).size, 8, `${id}: everyone once`);
    assert.equal(lead.id, id); assert.deepEqual([lead.x, lead.z, lead.row], [-.75, .35, 0], `${id}: at the lead's place`);
    assert.deepEqual(c.map(m => [m.x, m.z, m.row]), TROUPE.map(m => [m.x, m.z, m.row]), `${id}: the same places (the room checks hold)`);
    assert.equal(kot.row, 0, `${id}: Kotone in the front row (in every group of 4)`);
    assert.ok(kot.source && kot.pack === 'moves-kotone', `${id}: Kotone is the front row's source`);
    for (const row of [0, 1]) assert.equal(c.filter(m => m.row === row && m.source).length, 1, `${id}: one source in row ${row}`);
    assert.equal(c.find(m => m.row === 1 && m.source).pack, BACK_PACK, `${id}: the back row plays nam-1's pack`);
    for (const m of c) assert.equal(m.file, member(m.id).file, `${id}: ${m.id}'s own body`);
    for (const n of [1, 4, 8]) {
      const f = troupeFiles(n, true, id);
      assert.ok(f.every(x => /^vroid-\w+\.lite$/.test(x) || x === BACK_PACK), `${id} ${n}: only the built models and nam-1's pack`);
      assert.ok(!f.includes(`${member(id).file}.lite`) && !f.some(x => x.startsWith('kotone')), `${id} ${n}: the lead and Kotone are the mode's own`);
      assert.equal(f.length, n === 1 ? 0 : (n === 4 ? 3 : 8) - (id === KOTONE ? 0 : 1), `${id} ${n}: the files`);
    }
  }
  // a singer from the back row: Kotone takes the outer front place, its girl goes to the singer's place
  const c = castOf('nam-1');
  assert.equal(c.find(m => m.x === 2.25 && m.row === 0).id, KOTONE);
  assert.equal(c.find(m => m.x === -1.5 && m.row === 1).id, 'nu-4');
  for (const m of TROUPE) assert.ok(m.gait.walk > .9 && m.gait.walk < 1.15 && m.gait.run > 4, `${m.id}: her own gait`);
});

test('the back row: the same bar lines as the lead, another dance in each block, no hand contact, the closing moments', () => {
  const back = planBacking(lead, { noContact: true });
  assert.equal(back.blocks.length, lead.blocks.length);
  let differ = 0;
  back.blocks.forEach((b, i) => {
    const a = lead.blocks[i];
    assert.equal(b.b0, a.b0); assert.equal(b.b1, a.b1); assert.equal(b.section, a.section);
    if (b.clip !== a.clip) differ++;
    if (i) assert.notEqual(b.clip, back.blocks[i - 1].clip, 'never the same dance twice in a row');
    assert.ok(!CLUB_LOOPS.find(d => d.clip === b.clip).contact, `${b.clip}: no claps`);
    assert.equal(b.mic, false);
  });
  assert.equal(differ, back.blocks.length, 'a different routine in every block');
  assert.ok(!back.moments.some(m => m.id === 'hop'), 'no clap hop without contact');
  for (const id of ['cheer', 'bow']) { const a = lead.moments.find(m => m.id === id), b = back.moments.find(m => m.id === id); if (a) { assert.ok(b, id); assert.equal(b.b0, a.b0); assert.ok(!/Mic$/.test(b.clip)); } }
  assert.deepEqual(planBacking(lead, { noContact: true }).summary, back.summary, 'deterministic');
});

// two small rigs: hips -> thigh -> shin -> foot -> toe, the follower 10 % taller with one bone at another rest turn
function rig(k = 1, twist = 0) {
  const root = new THREE.Bone(); root.name = 'root';
  const mk = (name, parent, y) => { const b = new THREE.Bone(); b.name = name; b.position.set(0, y * k, 0); parent.add(b); return b; };
  const hips = mk('hips', root, 0); hips.position.y = .9 * k;
  const spine = mk('spine', hips, .1);
  if (twist) spine.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist);
  for (const s of ['L', 'R']) { const th = mk(`thigh_${s}`, hips, 0); th.position.x = (s === 'L' ? .08 : -.08) * k; th.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    const sh = mk(`shin_${s}`, th, .4); const f = mk(`foot_${s}`, sh, .4); mk(`toe_${s}`, f, .1); }
  const o = new THREE.Object3D(); o.add(root); o.updateMatrixWorld(true); return o;
}
test('the copy: a follower turns each bone from its own rest by the source\'s turn; the hips travel by the leg ratio', () => {
  const src = rig(1), dst = rig(1.1, .4), rs = restPose(src), rd = restPose(dst);
  const c = makeCopier(src, dst, rs, rd, { feet: false });
  assert.equal(c.corrected, 1, 'only the bone with another rest needs a correction');
  assert.ok(Math.abs(c.hips.k - 1.1) < 1e-6);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(.3, .2, -.1));
  const sSpine = src.getObjectByName('spine'), dSpine = dst.getObjectByName('spine');
  sSpine.quaternion.copy(rs.get('spine').q).multiply(q);           // the source turns its spine by q from rest
  src.getObjectByName('hips').position.y += .05;                   // and dips... up 5 cm
  c.copy();
  const want = rd.get('spine').q.clone().multiply(q);
  assert.ok(Math.abs(Math.abs(dSpine.quaternion.dot(want)) - 1) < 1e-9, 'the same turn from its own rest');
  assert.ok(Math.abs(dst.getObjectByName('hips').position.y - (rd.get('hips').p.y + .055)) < 1e-9, 'hips travel x1.1');
});

test('the copy with the leg solve: a follower of another thigh : shin split puts its ankle where the source\'s goes', () => {
  const src = rig(1), dst = rig(1), rs = restPose(src), rd = restPose(dst);
  dst.getObjectByName('shin_L').position.y = .46; dst.getObjectByName('foot_L').position.y = .34; dst.updateMatrixWorld(true);   // same leg, another split
  const c = makeCopier(src, dst, rs, rd, { feet: 'auto' });
  assert.ok(c.ik && c.mismatch > .01);
  // the source bends its knee; its ankle moves; the follower's ankle must follow (same leg length)
  src.getObjectByName('shin_L').quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), .25); src.updateMatrixWorld(true);   // (ankle 1.2 cm up: solved in full)
  c.copy(); dst.updateMatrixWorld(true);
  const a = src.getObjectByName('foot_L').getWorldPosition(new THREE.Vector3()), b = dst.getObjectByName('foot_L').getWorldPosition(new THREE.Vector3());
  assert.ok(a.distanceTo(b) < 2e-3, `ankle within 2 mm (${(a.distanceTo(b) * 1000).toFixed(1)} mm)`);
});

test('the sing-along: members sing on chorus lines only (with the lead-in and tail of a line)', () => {
  const L = vocalLines(lyrics);
  const chorus = sections.find(s => s.kind === 'chorus'), verse = sections.find(s => s.kind === 'verse');
  assert.ok(chorusAt(L, chorus.t + .5));
  assert.ok(!chorusAt(L, verse.t + .5));
  assert.ok(!chorusAt(null, 10));
});

test('the room check: every member on level, dry, clear ground', () => {
  const spots = [{ x: -1.5, z: 0 }, { x: 3, z: -2 }];
  const flat = { heightAt: () => 1, waterY: 0, room: null, solid: () => false };
  assert.deepEqual(canGroup({ x: 0, y: 1, z: 0 }, 0, spots, flat), { ok: true });
  assert.equal(canGroup({ x: 0, y: 1, z: 0 }, 0, spots, { ...flat, heightAt: x => (x > 2 ? 1.7 : 1) }).reason, 'steep', 'a member 0.7 m up');
  assert.equal(canGroup({ x: 0, y: 1, z: 0 }, 0, spots, { ...flat, solid: x => x > 2 }).reason, 'group');
  assert.equal(canGroup({ x: 0, y: 1, z: 0 }, 0, spots, { ...flat, heightAt: x => (x < -1 ? .1 : 1) }).reason, 'water');
  // her facing turns the layout: facing +x (pi/2), a spot 3 m to her side is 3 m along -z
  let seen = null; canGroup({ x: 0, y: 1, z: 0 }, Math.PI / 2, [{ x: 3, z: 0 }], { ...flat, solid: (x, z) => { seen = [x, z]; return false; } });
  assert.ok(Math.abs(seen[0]) < 1e-9 && Math.abs(seen[1] + 3) < 1e-9);
});

test('the camera: choruses frame the group, close-ups go to her verse lines, and a group shot stands back for its width', () => {
  const plan = lead, shots = planShots(plan, clock, { group: true });
  for (const s of sections.filter(x => x.kind === 'chorus')) {
    const inside = shots.filter(x => x.t0 >= s.t - .3 && x.t0 < s.e - .5);
    assert.ok(inside.length && inside.every(x => ['wide', 'medium', 'low'].includes(x.kind)), 'group shots on choruses');
    assert.equal(inside[0].kind, 'low', 'a chorus opens on the low hero shot');
  }
  const v = sections.find(x => x.kind === 'verse');
  assert.ok(shots.some(x => x.kind === 'close' && x.t0 >= v.t - .3 && x.t0 < v.e), 'close-ups on her verse lines');
  for (let i = 1; i < shots.length; i++) assert.ok(shots[i].t0 >= shots[i - 1].t0);
  const subject = { x: 0, y: 0, z: 0, facing: 0, group: { x: 1, z: -1, w: 6, depth: 1.8 } };
  const med = shotPose({ t0: 0, t1: 4, kind: 'medium', side: 1 }, 1, subject);
  assert.ok(med.pos.distanceTo(new THREE.Vector3(1, med.pos.y, -1)) >= groupDist(subject.group) - 1e-6, 'far enough for the group');
  assert.ok(Math.abs(med.look.x - 1) < 1e-9, 'aimed at the group');
  const close = shotPose({ t0: 0, t1: 4, kind: 'close', side: 1 }, 1, subject);
  assert.ok(Math.abs(close.look.x) < 1e-9 && close.pos.length() < 3, 'a close-up is hers');
});

test('the phone limits: URL switches override the tier defaults', () => {
  const q = s => new URLSearchParams(s);
  assert.deepEqual(groupLimits(true), { ...GROUP_LIMITS.low, forced: false });
  assert.equal(GROUP_LIMITS.low.max, 4, 'phones: four unless strong'); assert.equal(GROUP_LIMITS.low.strongMax, 8); assert.equal(GROUP_LIMITS.other.max, 8);
  assert.equal(groupLimits(true, q('troupeMax=4')).max, 4);
  assert.equal(groupLimits(false, q('troupeHalf=1')).backHalf, true);
  assert.equal(groupLimits(false, q('troupeBackFaces=0')).backFaces, false);
  assert.equal(groupLimits(true, q('troupeMerge=0')).merge, false); assert.equal(groupLimits(true).merge, true);
  // the largest group: 4 on a phone, 8 on a strong one, whatever ?troupeMax says when it is given
  assert.equal(groupMax(groupLimits(true), { ok: false }), 4);
  assert.equal(groupMax(groupLimits(true), { ok: true }), 8);
  assert.equal(groupMax(groupLimits(false), { ok: true }), 8);
  assert.equal(groupMax(groupLimits(true, q('troupeMax=8')), { ok: false }), 8);
  assert.equal(groupMax(groupLimits(true, q('troupeMax=4')), { ok: true }), 4);
});

test('strong phones: measured frames decide; slowed, small or fallen-back phones keep four', () => {
  const good = { n: 300, work: [6, 9, 14], gap: [16.7, 18, 30] }, low = { tier: 'low', memory: 8, frames: good };
  assert.deepEqual(strongPhone(low), { ok: true, why: 'measured' });
  assert.equal(strongPhone({ tier: 'medium' }).ok, true, 'Medium and High had 8 before');
  assert.equal(strongPhone({ ...low, frames: { ...good, work: [STRONG.workP50 + .5, 12, 20] } }).ok, false, 'frame work over the line');
  assert.equal(strongPhone({ ...low, frames: { ...good, gap: [33.3, 34, 40] } }).ok, false, 'held at 30 fps by the GPU');
  assert.equal(strongPhone({ ...low, pace: 33.3 }).ok, false, 'the pacer is on');
  assert.equal(strongPhone({ ...low, level: 1 }).ok, false, 'the governor stepped down');
  assert.equal(strongPhone({ ...low, slow: true }).ok, false); assert.equal(strongPhone({ ...low, memory: 3 }).ok, false);
  assert.equal(strongPhone({ ...low, cores: 4 }).ok, true, 'the core count is not a signal');
  assert.equal(strongPhone({ ...low, saved: '0' }).ok, false, 'fell back once: not again');
  assert.equal(strongPhone({ ...low, frames: { ...good, n: 30 } }).why, 'measuring');
  assert.equal(strongPhone({ ...low, frames: { ...good, n: 30 }, saved: '1' }).ok, true, 'measured strong on an earlier visit');
});

test('a show of 8 on a phone: the budget breaks only after two slow windows, the back row leaves at a cut', () => {
  const w = new BudgetWatch(), feed = (work, gap, n) => { let r = false; for (let i = 0; i < n; i++) r = w.feed(work, gap); return r; };
  assert.equal(feed(9, 16.7, STRONG.window * 3), false);
  assert.equal(feed(STRONG.dropWork + 2, 20, STRONG.window), false, 'one slow window is not enough');
  assert.equal(feed(9, 16.7, STRONG.window), false, 'and a good one starts the count again');
  assert.equal(feed(9, 400, STRONG.window * 4), false, 'hitches over 250 ms are not counted');
  assert.equal(feed(9, STRONG.dropGap + 4, STRONG.window * 2), true, 'two windows under ~38 fps');
  assert.equal(new BudgetWatch().trip(), true);
  const shots = [{ t0: 0, t1: 4, kind: 'wide', cut: true }, { t0: 4, t1: 8, kind: 'medium', cut: false }, { t0: 8, t1: 10, kind: 'medium', cut: true }, { t0: 10, t1: 12, kind: 'close', cut: true }];
  const st = { since: 1, shot: 0 };
  assert.equal(dropNow(shots, 2, st), false, 'not mid-shot');
  assert.equal(dropNow(shots, 5, st), false, 'a shot that glides on is no cut');
  assert.equal(dropNow(shots, 8.1, st), true, 'at the cut');
  assert.equal(dropNow(shots, 10.5, { since: 10, shot: 3 }), true, 'during her close-up');
  assert.equal(dropNow([{ t0: 0, t1: 60, kind: 'wide', cut: true }], 1 + STRONG.dropWait, { since: 1, shot: 0 }), true, 'never later than dropWait');
});

/** A small skinned body: two bones, a box, one morph (for the row merge's checks). */
function body(x, tint = 0) {
  const root = new THREE.Group(); root.position.x = x;
  const b0 = new THREE.Bone(); b0.name = 'hips'; const b1 = new THREE.Bone(); b1.name = 'spine'; b1.position.y = .5; b0.add(b1); root.add(b0);
  const g = new THREE.BoxGeometry(.3, 1, .2, 1, 4, 1); g.translate(0, .5, 0);
  const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i); si[i * 4 + 1] = 1; sw[i * 4] = 1 - y; sw[i * 4 + 1] = y; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => (i % 3 === 2 ? .05 + tint : 0)), 3)]; g.morphTargetsRelative = true;
  const map = new THREE.Texture(); map.offset.set(.1, 0); map.repeat.set(.5, 1);
  const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ map, alphaTest: .5 }));
  m.morphTargetDictionary = { blink: 0 }; m.morphTargetInfluences = [0];
  root.add(m); root.updateMatrixWorld(true); m.bind(new THREE.Skeleton([b0, b1]), m.matrixWorld);
  return { root, m, b1 };
}

test('a row drawn as one mesh: the same skinned vertices, joints shifted per member, faces in their own slots', () => {
  const parent = new THREE.Group(); parent.position.set(3, 0, -2); parent.rotation.y = .7;
  const bodies = [body(-1), body(0, .02), body(1.2, .04)];
  for (const b of bodies) parent.add(b.root);
  parent.updateMatrixWorld(true);
  for (const b of bodies) b.m.bind(b.m.skeleton, b.m.matrixWorld);
  const meshes = bodies.map(b => b.m);
  assert.ok(canMerge(meshes));
  const row = new RowMesh(meshes, parent);
  assert.equal(row.mesh.skeleton.bones.length, 6);
  assert.ok(meshes.every(o => !o.visible) && row.mesh.visible, 'the members hidden, the row drawn');
  bodies.forEach((b, i) => { b.b1.rotation.z = .3 + i * .2; b.root.children[0].rotation.x = .1 * i; });
  parent.updateMatrixWorld(true);
  const a = new THREE.Vector3(), c = new THREE.Vector3(); let at = 0, worst = 0;
  for (const o of meshes) { for (let k = 0; k < o.geometry.attributes.position.count; k++) { o.getVertexPosition(k, a).applyMatrix4(o.matrixWorld); row.mesh.getVertexPosition(at + k, c).applyMatrix4(row.mesh.matrixWorld); worst = Math.max(worst, a.distanceTo(c)); } at += o.geometry.attributes.position.count; }
  assert.ok(worst < 1e-5, `skinned the same (${worst} m)`);
  // each member's morph in the joined geometry, its weight in its own slot (filled from its own mesh)
  const G = row.mesh.geometry, n0 = meshes[0].geometry.attributes.position.count;
  const mv = new THREE.Vector3().fromBufferAttribute(G.morphAttributes.position[0], n0);   // (turned into the bind space)
  assert.ok(Math.abs(mv.length() - .07) < 1e-6 && G.attributes.aMember.getX(n0) === 1);
  meshes[1].morphTargetInfluences[0] = .8; row.sync();
  assert.deepEqual([...row.mesh.material.userData.rowMorph].map(v => +v.toFixed(3)), [0, .8, 0, 0]);
  assert.deepEqual(row.mesh.morphTargetInfluences, [0], "three's own weights stay 0 (no faces in the shadow pass)");
  // UVs: the map's own transform, then the member's cell of the joined texture
  const cell = atlasCell(1, 3), u0 = meshes[1].geometry.attributes.uv.getX(0) * .5 + .1;
  assert.ok(Math.abs(G.attributes.uv.getX(n0) - (cell.off[0] + u0 * cell.k[0])) < 1e-6);
  assert.ok(row.mesh.boundingSphere.radius > 2, 'culled as a row with room for the arms');
  row.setMerged(false); assert.ok(meshes.every(o => o.visible) && !row.mesh.visible);
  row.dispose(); assert.equal(row.mesh.parent, null);
});

test('the joined texture: cells never overlap, margins inside the cell', () => {
  for (const n of [2, 3, 4]) for (let i = 0; i < n; i++) {
    const c = atlasCell(i, n);
    for (let j = i + 1; j < n; j++) { const d = atlasCell(j, n); assert.ok(c.off[0] + c.k[0] <= d.off[0] + 1e-9 || d.off[0] + d.k[0] <= c.off[0] + 1e-9 || c.off[1] + c.k[1] <= d.off[1] + 1e-9 || d.off[1] + d.k[1] <= c.off[1] + 1e-9); }
    assert.ok(c.off[0] > 0 && c.off[0] + c.k[0] < 1 && c.off[1] > 0 && c.off[1] + c.k[1] < 1);
  }
  assert.equal(mergeRowGeometry([body(0).m, body(1).m]).targets[0], 'blink');
});

test('a packed clip pack (joints loaded as plain nodes, its skin pruned) still gives the rest pose', () => {
  const plain = new THREE.Object3D(); const hips = new THREE.Object3D(); hips.name = 'hips'; hips.position.y = .9; plain.add(hips);
  const spine = new THREE.Object3D(); spine.name = 'spine'; spine.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), .2); hips.add(spine);
  const r = restPose(plain);
  assert.ok(r.has('hips') && r.has('spine'), 'plain nodes count');
  const src = rig(1), dst = rig(1);
  assert.ok(makeCopier(src, dst, restPose(src), restPose(dst), { feet: false }).bones > 5);
});
