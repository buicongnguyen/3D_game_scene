// Static scatter records grouped in squares (pure: Node-testable), for the foliage lists (foliage.js).
//
// The view and shadow lists test every record against the view or the shadow box, every time the camera has moved a
// little. In a narrow phone view most of the valley, and 78 % of all trees (the forest on the mountain rim), are far
// outside it. A square holds the records of CELL x CELL metres and one ball that contains every record's own ball (the one
// the per-record test uses), so one test on the square replaces one test per record, and no record in a square that
// fails can pass: the lists come out the same, only the work is less.

/** Side of a square, metres. */
export const CELL = 64;

/** The ball a record's view and shadow tests use: [x, y, z, radius] (`radius`, `height`: the model's, scaled by the record). */
export const recordBall = (r, radius, height) => {
  const sy = r.sy ?? 1;
  return [r.x, r.y + height * r.s * sy * 0.5, r.z, radius * r.s * Math.max(1, sy)];
};

/** -> [{ idx: Int32Array (indices into `records`), x, y, z, r }]: each square's ball holds the ball of every record in it. */
export function buildCells(records, radius, height) {
  const by = new Map();
  records.forEach((r, i) => {
    const key = Math.floor(r.x / CELL) * 4096 + Math.floor(r.z / CELL);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(i);
  });
  return [...by.values()].map(idx => {
    const balls = idx.map(i => recordBall(records[i], radius, height));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, y, z] of balls) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const x = (x0 + x1) / 2, y = (y0 + y1) / 2, z = (z0 + z1) / 2;
    let r = 0;
    for (const [bx, by_, bz, br] of balls) r = Math.max(r, Math.hypot(bx - x, by_ - y, bz - z) + br);
    return { idx: Int32Array.from(idx), x, y, z, r };
  });
}

/**
 * Is the whole square outside the sun's shadow box: the light-space square of half-size `range` around the focus
 * (`fx`, `fy`: the focus along the light-space axes `lx`, `ly`), with the margin the per-record test adds (6 m + the crown)?
 */
export function cellOutsideShadowBox(cell, lx, ly, fx, fy, range) {
  const cr = range + cell.r + 6;
  return Math.abs(lx.x * cell.x + lx.y * cell.y + lx.z * cell.z - fx) > cr || Math.abs(ly.x * cell.x + ly.y * cell.y + ly.z * cell.z - fy) > cr;
}

/** Slack the per-record view test adds to a ball's radius, per metre from the camera (the lists are rebuilt only after the camera has moved a little). */
export const VIEW_SLACK = 0.045;

/**
 * Is the whole square outside what the lists draw: past the cut-off `max` (measured on the ground from `camPos`), or
 * outside the view `frustum` (from the camera at `cam`, with the slack the record test has, at the square's farthest
 * record)? `ball` is a scratch Sphere. A square that is not outside may still hold records that are.
 */
export function cellOutside(cell, camPos, cam, max, frustum, ball) {
  if (Math.hypot(cell.x - camPos.x, cell.z - camPos.z) - cell.r > max) return true;
  ball.center.set(cell.x, cell.y, cell.z);
  ball.radius = cell.r + (Math.hypot(cell.x - cam.x, cell.y - cam.y, cell.z - cam.z) + cell.r) * VIEW_SLACK + 0.6;
  return !frustum.intersectsSphere(ball);
}
