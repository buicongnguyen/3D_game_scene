// Map squares for the foliage lists (world/cells.js): a square that is skipped must hold nothing the per-record tests
// (InstanceSet.update / updateShadow in world/foliage.js) would have drawn, so the lists are the same with and without them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Frustum, Matrix4, Sphere, Vector3 } from 'three';
import { buildCells, cellOutside, cellOutsideShadowBox, recordBall, CELL, VIEW_SLACK } from '../src/world/cells.js';
import { rng } from '../src/engine/spline.js';

const RADIUS = 6, HEIGHT = 11;       // a tree model: 6 m crown, 11 m tall
const R = rng(20261112);
// a valley-sized scatter, scaled and squashed like the real records
const records = Array.from({ length: 1500 }, () => ({ x: -320 + R() * 640, y: R() * 60, z: -330 + R() * 630, s: 0.8 + R() * 0.7, sy: R() < 0.2 ? 0.55 + R() * 0.3 : undefined }));
const cells = buildCells(records, RADIUS, HEIGHT);

test('every record is in exactly one square, and the squares are the size they say', () => {
  const all = cells.flatMap(c => [...c.idx]).sort((a, b) => a - b);
  assert.equal(all.length, records.length);
  assert.deepEqual(all, records.map((_, i) => i));
  for (const c of cells) {
    const xs = [...c.idx].map(i => Math.floor(records[i].x / CELL)), zs = [...c.idx].map(i => Math.floor(records[i].z / CELL));
    assert.ok(xs.every(v => v === xs[0]) && zs.every(v => v === zs[0]), 'one square of the grid');
  }
  assert.ok(cells.length > 20 && cells.length < 200, `${cells.length} squares`);
});

test("a square's ball holds the ball of every record in it", () => {
  for (const c of cells) for (const i of c.idx) {
    const [x, y, z, r] = recordBall(records[i], RADIUS, HEIGHT);
    assert.ok(Math.hypot(x - c.x, y - c.y, z - c.z) + r <= c.r + 1e-9, `record ${i}`);
  }
});

// the test one record gets in InstanceSet.update: cut-off by ground distance, then the view with the lists' slack
function recordDrawn(rec, camPos, cam, max, frustum) {
  if (Math.hypot(rec.x - camPos.x, rec.z - camPos.z) > max) return false;
  const [x, y, z, r] = recordBall(rec, RADIUS, HEIGHT);
  return frustum.intersectsSphere(new Sphere(new Vector3(x, y, z), r + Math.hypot(rec.x - cam.x, rec.y - cam.y, rec.z - cam.z) * VIEW_SLACK + 0.6));
}

test('a square that is skipped has nothing the per-record test would draw (phone and wide views, near and far cut-offs)', () => {
  const ball = new Sphere();
  let skipped = 0, kept = 0, keptWithNothing = 0;
  for (const [aspect, fov] of [[390 / 844, 55], [16 / 9, 55], [1, 70]]) {
    for (let k = 0; k < 60; k++) {
      const cam = new PerspectiveCamera(fov, aspect, 0.35, 4600);
      cam.position.set(-300 + R() * 600, 2 + R() * 25, -300 + R() * 600);
      cam.lookAt(cam.position.x + Math.sin(k) * 50, cam.position.y - R() * 8, cam.position.z + Math.cos(k) * 50);
      cam.updateMatrixWorld(true);
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      // the lists measure from the player while the camera orbits a few metres around: a different point for the cut-off
      const camPos = cam.position.clone().add(new Vector3(R() * 8 - 4, 0, R() * 8 - 4));
      for (const max of [1400, 112, 224]) for (const c of cells) {
        const out = cellOutside(c, camPos, cam.position, max, frustum, ball);
        const any = [...c.idx].some(i => recordDrawn(records[i], camPos, cam.position, max, frustum));
        if (out) { skipped++; assert.equal(any, false, `a skipped square holds a drawn record (cam ${k}, max ${max})`); }
        else { kept++; if (!any) keptWithNothing++; }
      }
    }
  }
  assert.ok(skipped > kept, `the squares skip most of the valley (${skipped} skipped, ${kept} kept)`);
  assert.ok(keptWithNothing < kept * 0.5, `and the ones kept are mostly worth walking (${keptWithNothing} of ${kept} drew nothing)`);
});

test('a square outside the sun\'s shadow box holds no caster the per-record test would take', () => {
  let skipped = 0, kept = 0;
  const lightDirs = [new Vector3(0.3, 1, 0.2), new Vector3(-0.6, 0.8, 0.4), new Vector3(0.1, 0.35, -0.9)];
  for (const dir of lightDirs) {
    const ld = dir.clone().normalize(), lx = new Vector3().crossVectors(new Vector3(0, 1, 0), ld).normalize(), ly = new Vector3().crossVectors(ld, lx);
    for (const range of [30, 42, 55]) for (let k = 0; k < 40; k++) {
      const focus = new Vector3(-250 + R() * 500, R() * 30, -250 + R() * 500), fx = lx.dot(focus), fy = ly.dot(focus);
      for (const c of cells) {
        const out = cellOutsideShadowBox(c, lx, ly, fx, fy, range);
        // the per-record test of InstanceSet.updateShadow
        const any = [...c.idx].some(i => {
          const rec = records[i], r = range + RADIUS * rec.s * Math.max(1, rec.sy ?? 1) + 6;
          const px = lx.x * rec.x + lx.y * rec.y + lx.z * rec.z, py = ly.x * rec.x + ly.y * (rec.y + HEIGHT * rec.s * (rec.sy ?? 1) * 0.5) + ly.z * rec.z;
          return !(Math.abs(px - fx) > r || Math.abs(py - fy) > r);
        });
        if (out) { skipped++; assert.equal(any, false, `a skipped square holds a caster (light ${dir.toArray()}, range ${range})`); } else kept++;
      }
    }
  }
  assert.ok(skipped > kept, `most squares are outside the box (${skipped} skipped, ${kept} kept)`);
});
