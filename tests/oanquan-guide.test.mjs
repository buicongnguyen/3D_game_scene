import test from 'node:test';
import assert from 'node:assert/strict';
import { OanQuanDemo, OAN_LESSONS, oanExample, oanDemoCaption, createOanQuanGuide } from '../src/ui/oanquan-guide.js';
import { cloneBoard, newBoard, play, ownerOf, totalValue, finished } from '../src/game/yard/oanquan.js';

test('guide examples are legal own-side moves in both directions and replay the real rules exactly', () => {
  for (const lesson of OAN_LESSONS) for (const dir of [1, -1]) {
    const demo = new OanQuanDemo(lesson.id, dir), initial = cloneBoard(demo.board), total = totalValue(initial);
    const real = play(initial, 0, demo.sq, dir);
    assert.equal(ownerOf(demo.sq), 0);
    assert.equal(real.illegal, false);
    assert.deepEqual(demo.result.steps, real.steps);
    for (let i = 0; i < real.steps.length; i++) {
      assert.equal(demo.next(), true);
      assert.deepEqual(demo.event, real.steps[i]);
      assert.equal(demo.snapshot().total, total, `${lesson.id}/${dir} conserves stones in the hand and board`);
      assert.ok(demo.hand >= 0);
    }
    assert.equal(demo.complete, false, 'the final capture is shown before counting');
    assert.equal(demo.next(), true);
    assert.equal(demo.complete, true);
    assert.deepEqual(demo.board, real.board);
    assert.equal(demo.next(), false, 'completed playback cannot award points twice');
    assert.deepEqual(initial, demo.initial, 'the example source position was not mutated');
  }
});

test('sowing and continuation teach the next pit, not the last landing pit', () => {
  const sow = new OanQuanDemo('sow');
  assert.deepEqual(sow.result.steps, [
    { t: 'pick', sq: 2, n: 3 }, { t: 'drop', sq: 3 }, { t: 'drop', sq: 4 }, { t: 'drop', sq: 5 },
  ]);
  for (let i = 0; i < 4; i++) sow.next();
  assert.equal(sow.board.dan[5], 6);
  assert.match(oanDemoCaption(sow), /NEXT/);
  sow.next();
  assert.equal(sow.event.quickEnd, false, 'a following quan ends a turn without being captured');
  const again = new OanQuanDemo('continue');
  again.next(); again.next(); again.next();
  assert.deepEqual(again.event, { t: 'pick', sq: 3, n: 2 });
  assert.equal(again.board.dan[2], 6, 'last landing pit remains full');
  assert.equal(again.board.dan[3], 0, 'the following full small pit was picked up');
  assert.equal(again.hand, 2);
});

test('capture examples show the intervening empty pit and exact pebble/quan value before quick ending', () => {
  for (const dir of [1, -1]) {
    const small = new OanQuanDemo('capture', dir);
    small.next(); small.next(); small.next();
    assert.equal(small.gap, dir === 1 ? 4 : 2);
    assert.equal(small.board.dan[small.gap], 0);
    assert.deepEqual(small.board.pile[0], { dan: 4, quan: 0 });
    assert.match(oanDemoCaption(small), /4 points/);
    const quan = new OanQuanDemo('quan', dir);
    quan.next(); quan.next(); quan.next();
    assert.equal(quan.gap, dir === 1 ? 5 : 1);
    assert.equal(quan.board.quan[dir === 1 ? 6 : 0], 0);
    assert.deepEqual(quan.board.pile[0], { dan: 0, quan: 1 });
    assert.match(oanDemoCaption(quan), /10 points/);
    assert.equal(quan.complete, false);
    quan.next();
    assert.equal(quan.event.quickEnd, true);
    assert.equal(finished(quan.board, true), true);
  }
});

test('reset, direction and snapshots isolate every example from a real round and each other', () => {
  const real = newBoard(), preserved = structuredClone(real), demo = new OanQuanDemo('capture');
  demo.next(); demo.next(); demo.next();
  const exposed = demo.snapshot(); exposed.board.dan.fill(99); exposed.board.pile[0].quan = 99;
  assert.equal(demo.board.pile[0].quan, 0);
  demo.reset('capture', -1);
  assert.equal(demo.sq, 4);
  assert.equal(demo.hand, 0);
  assert.equal(demo.index, 0);
  assert.deepEqual(demo.board.pile[0], { dan: 0, quan: 0 });
  assert.deepEqual(real, preserved);
  assert.deepEqual(oanExample('unknown', 0), oanExample('sow', 1));
});

test('guide has harmless no-DOM lifecycle for pure runners', () => {
  const guide = createOanQuanGuide();
  guide.show(); guide.open(); guide.close(); guide.hide(); guide.destroy();
  assert.equal(guide.isOpen, false);
});
