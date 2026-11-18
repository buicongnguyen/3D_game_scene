import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UI } from '../src/ui/ui.js';
import { Director } from '../src/game/director.js';

class Element extends EventTarget {
  constructor() {
    super(); this.children = []; this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {} };
  }
  appendChild(el) { this.children.push(el); }
  set innerHTML(value) { this.children = []; }
}

function fixture(t, mode = 'blips', reads = false) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const names = ['document', 'innerWidth', 'innerHeight', 'performance'];
  const previous = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const elements = new Map(), counts = { blips: [], gestures: [], speech: [], stopped: 0 };
  let clock = 0;
  Object.assign(globalThis, {
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement() { return new Element(); } },
    innerWidth: 1280, innerHeight: 720, performance: { now: () => clock },
  });
  t.after(() => { for (const [n, desc] of previous) { if (desc) Object.defineProperty(globalThis, n, desc); else delete globalThis[n]; } });
  const ui = Object.assign(Object.create(UI.prototype), {
    audio: { blip: pitch => counts.blips.push(pitch), click() {} }, prompt() {},
    voice: { mode, reads: () => reads, speak(lines) { counts.speech.push(...lines); return true; }, stop() { counts.stopped++; } },
  });
  const director = Object.assign(Object.create(Director.prototype), {
    game: { player: { locked: false, vel: new THREE.Vector3(), anim: { once: clip => counts.gestures.push(clip) } },
      follow: { clearCutscene() {} }, input: { edges: new Set() } },
    npcs: {}, scenes: { active: false }, tamo: { react() {} }, ui, audio: ui.audio,
  });
  const tick = ms => { clock += ms; t.mock.timers.tick(ms); };
  return { ui, director, counts, tick, elements };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('real Director dialogue honors Off and Read aloud without adding gesture blips', async t => {
  for (const [mode, reads] of [['off', false], ['read', true], ['blips', false], ['read', false]]) {
    await t.test(mode + (reads ? ' with a voice' : ''), async t => {
      const { director, ui, counts, tick } = fixture(t, mode, reads);
      const done = director.dialogueBody([['mika', 'Hello there.'], ['mika', 'A second line.']]);
      await flush(); tick(900);
      assert.equal(counts.gestures.length, 2, 'speaker gestures still play');
      assert.equal(counts.blips.length, reads || mode === 'off' ? 0 : 2, 'only UI owns voice/blip policy');
      assert.equal(counts.speech.length, reads ? 2 : 0);
      ui.nav('skip'); await done;
    });
  }
});

test('leaving a dialogue page cancels its pending gestures and blips, even when another talk opens', async t => {
  const { ui, counts, tick } = fixture(t);
  const seen = [];
  const first = ui.dialogue([['mika', 'First.'], ['mika', 'Old second.'], ['mika', 'Old third.']], { onLine: who => seen.push(who) });
  await flush(); tick(0);
  assert.equal(counts.blips.length, 1); assert.equal(seen.length, 1);
  ui.nav('skip'); await first;
  const next = ui.dialogue([['genzo', 'New conversation.']], { onLine: who => seen.push(who) });
  await flush(); tick(1000);
  assert.deepEqual(seen, ['mika', 'genzo']);
  assert.equal(counts.blips.length, 2, 'closed dialogue has no delayed blips');
  ui.nav('skip'); await next;
});

test('Next and a chosen answer cancel old row callbacks before the following page', async t => {
  for (const choice of [false, true]) await t.test(choice ? 'answer' : 'Next', async t => {
    const { ui, tick } = fixture(t), seen = [];
    const lines = [['mika', 'One.'], ['mika', 'Two.'], ['mika', 'Three.']];
    if (choice) lines.splice(2, 1, { choice: [{ text: 'Yes', value: 'yes' }] });
    lines.push(['genzo', 'Next page.']);
    const done = ui.dialogue(lines, { onLine: who => seen.push(who) });
    await flush(); tick(200);
    if (choice) ui.pickChoice(0); else ui.nav('next');
    await flush(); tick(1000);
    assert.deepEqual(seen, ['mika', 'genzo']);
    ui.nav('skip'); await done;
  });
});
