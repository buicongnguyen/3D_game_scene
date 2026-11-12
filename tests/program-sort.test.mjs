// The order of opaque draws (engine/renderer.js programFirst): render order first, then the shader program, then the
// material, then near to far, so a frame sets each program as few times as it can.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programFirst } from '../src/engine/renderer.js';

const props = new WeakMap();
const properties = { get: m => { if (!props.has(m)) props.set(m, {}); return props.get(m); } };
const mat = (id, program) => { const m = { id }; if (program !== undefined) properties.get(m).currentProgram = { id: program }; return m; };
const item = (id, material, { z = 0, renderOrder = 0, groupOrder = 0 } = {}) => ({ id, material, z, renderOrder, groupOrder });
const switches = list => list.reduce((n, it, i) => n + (i === 0 || properties.get(it.material).currentProgram?.id !== properties.get(list[i - 1].material).currentProgram?.id ? 1 : 0), 0);

test('draws that share a program come together, whatever their materials are numbered', () => {
  const a = mat(1, 7), b = mat(2, 3), c = mat(3, 7), d = mat(4, 3);
  const items = [item(1, a), item(2, b), item(3, c), item(4, d)];
  assert.equal(switches(items), 4);                       // three.js's order (by material id): programs 7, 3, 7, 3
  const list = [...items].sort(programFirst(properties));
  assert.deepEqual(list.map(i => i.material.id), [2, 4, 1, 3]);
  assert.equal(switches(list), 2);
});

test('group order and render order still decide first; then material, then near to far', () => {
  const a = mat(11, 9), b = mat(12, 1);
  const list = [item(1, b, { renderOrder: 5 }), item(2, a), item(3, a, { z: 2 }), item(4, a, { z: 1 }), item(5, b, { groupOrder: -1 })]
    .sort(programFirst(properties));
  assert.deepEqual(list.map(i => i.id), [5, 2, 4, 3, 1]);
});

test('a material with no program yet goes after the ones that have one', () => {
  const list = [item(1, mat(21)), item(2, mat(22, 4))].sort(programFirst(properties));
  assert.deepEqual(list.map(i => i.id), [2, 1]);
});
