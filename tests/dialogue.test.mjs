import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/ui.js';
import { DIALOGUE } from '../src/game/story.js';

const flat = pages => pages.flatMap(p => p.lines);

test('dialogue pages: every line appears once, in order, a few per page', () => {
  for (const [id, lines] of Object.entries(DIALOGUE)) {
    for (const narrow of [false, true]) {
      const pages = UI.paginate(lines, false, narrow);
      const spoken = lines.filter(l => !l.choice);
      assert.deepEqual(flat(pages), spoken, `${id} keeps every line`);
      for (const p of pages) assert.ok(p.lines.length <= (narrow ? 2 : 3), `${id}: page of ${p.lines.length}`);
      assert.ok(pages.length <= Math.max(1, spoken.length), id);
    }
  }
});

test('dialogue pages: long conversations need far fewer presses than one line at a time', () => {
  const all = Object.values(DIALOGUE);
  const lines = all.reduce((a, l) => a + l.filter(x => !x.choice).length, 0);
  const pages = all.reduce((a, l) => a + UI.paginate(l).length, 0);
  assert.ok(pages < lines * 0.6, `${pages} pages for ${lines} lines`);
});

test('dialogue pages: a choice shares the page with the question that asks it', () => {
  const withChoice = Object.entries(DIALOGUE).filter(([, l]) => l.some(x => x.choice));
  assert.ok(withChoice.length > 0);
  for (const [id, lines] of withChoice) {
    const pages = UI.paginate(lines);
    const cp = pages.find(p => p.choice);
    assert.ok(cp, `${id} has a choice page`);
    assert.ok(cp.lines.length >= 1, `${id}: the choice page shows the question too`);
  }
});
