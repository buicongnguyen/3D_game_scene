// Kotone on the Mixamo skeleton: her evening show's running order (game/kotone-show.js), her day plan and the face
// following a song (actors/face.js sing(): the Avatar Studio's per-song mouth curves or lyric word timings).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { nextAct, SHOW } from '../src/game/kotone-show.js';
import { PEOPLE, SPOTS } from '../src/content/townsfolk.js';
import { KOTONE_SHOW_CLIPS } from './asset-contracts.mjs';
import { Face } from '../src/actors/face.js';
import { HUMAN_GAIT } from '../src/actors/gait.js';

const seeded = s => () => ((s = (s * 16807) % 2147483647) / 2147483647);

test('the show plays every dance before repeating one, rests between numbers, bows every third dance, sometimes sings', () => {
  const st = {}, r = seeded(7), acts = [];
  for (let i = 0; i < 80; i++) { const a = nextAct(st, r); st.last = a.kind; acts.push(a); }
  const dances = acts.filter(a => a.kind === 'dance').map(a => a.clip);
  assert.deepEqual([...new Set(dances.slice(0, SHOW.dances.length))].sort(), [...SHOW.dances].sort(), 'one round has them all');
  for (let i = 1; i < dances.length; i++) assert.notEqual(dances[i], dances[i - 1], 'never the same dance twice in a row');
  for (let i = 1; i < acts.length; i++) if (acts[i].kind === 'dance') assert.ok(acts[i - 1].kind !== 'dance', 'a pause between dances');
  assert.ok(acts.some(a => a.kind === 'sing') && acts.some(a => a.kind === 'bow'));
  for (const a of acts) assert.ok(a.clip === 'Idle' || a.clip === 'Bow' || KOTONE_SHOW_CLIPS.includes(a.clip), `${a.clip} is in her pack`);
});

test('she performs at her stage spot in the evening and goes in at seven', () => {
  const k = PEOPLE.find(p => p.id === SHOW.who);
  const show = k.plan.find(b => b.tasks.some(t => t.do === 'Show'));
  assert.ok(show && show.from >= 17 && show.from < 19, 'an evening block');
  assert.ok(show.tasks.some(t => t.go === SHOW.spot) && SPOTS[SHOW.spot]);
  assert.ok(k.plan.some(b => b.from === 19 && b.tasks.some(t => t.inside !== undefined)));
  assert.ok(HUMAN_GAIT.kotone.walk > 0.5 && HUMAN_GAIT.kotone.run > 2.5);
});

function face() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial());
  const b = new THREE.Bone(); mesh.add(b); mesh.bind(new THREE.Skeleton([b]));
  mesh.morphTargetDictionary = { blink: 0, mouthA: 1, mouthO: 2 }; mesh.morphTargetInfluences = [0, 0, 0];
  const root = new THREE.Group(); root.add(mesh);
  return { f: Face.attach(root), mesh };
}

test('the face follows a song: mouth curves (open / pucker) or lyric word timings, and closes when the song stops', () => {
  const { f, mesh } = face();
  let t = 0;
  const mouth = { version: 2, fps: 25, scale: 99, open: [0, 0, 99, 99, 0, 0], pucker: [0, 0, 0, 99, 99, 0] };
  f.sing(mouth, () => t);
  t = 0.1; for (let i = 0; i < 30; i++) f.update(1 / 60);
  const open = mesh.morphTargetInfluences[1];
  assert.ok(open > 0.6, `open on the sung frames (${open.toFixed(2)})`);
  t = 0.17; for (let i = 0; i < 30; i++) f.update(1 / 60);
  assert.ok(mesh.morphTargetInfluences[2] > 0.4, 'rounded where the song puckers');
  t = 0.23; for (let i = 0; i < 40; i++) f.update(1 / 60);
  assert.ok(mesh.morphTargetInfluences[1] < 0.05, 'closed in the rests');
  f.sing({ lines: [{ t: 1, e: 2, words: [{ w: 'la', t: 1, e: 1.5 }, { w: 'la', t: 1.6, e: 2 }] }] }, () => t);
  t = 0.5; for (let i = 0; i < 20; i++) f.update(1 / 60);
  assert.ok(mesh.morphTargetInfluences[1] < 0.05, 'quiet before the first word');
  let most = 0;
  for (let i = 0; i < 30; i++) { t = 1 + i / 60; f.update(1 / 60); most = Math.max(most, mesh.morphTargetInfluences[1]); }
  assert.ok(most > 0.3, 'singing inside a word');
  f.sing(null);
  for (let i = 0; i < 30; i++) f.update(1 / 60);
  assert.ok(mesh.morphTargetInfluences[1] < 0.02, 'stopped');
});
