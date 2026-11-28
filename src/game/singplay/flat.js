// © 2026 Bui Cong Nguyen · solluxlabs.com
// Where Kotone may perform in Sing & Play (pure; tests/singplay.test.mjs): walkable, open ground with room around her -
// level ground or a gentle hillside (owner 2026-11-28: "make it perform in a little steep spot"; her feet are fitted to
// the slope, game/perform/ground-fit.js). Not on a steep hillside (the ground over a ring round her stays within
// FLAT.rise of her feet, no half-ring slope steeper than FLAT.slopeDeg and no step between neighbouring samples steeper
// than FLAT.stepDeg: a bank or a cliff edge), not in or next to water, not against a wall, a tree trunk or a fence (no
// solid within FLAT.room), and inside a room only when that clear radius fits between its walls.
// (Until 2026-11-28: rise .25 m, 12 deg, steps 2 x tan 12 deg.)
export const FLAT = Object.freeze({ ring: 1.6, samples: 12, rise: .6, slopeDeg: 20, stepDeg: 30, room: 1.4, waterGap: .3, height: 1.6 });

/**
 * p: { x, y, z } her feet. env: { heightAt(x, z), waterY, solid(x, z, r, footY, h) -> bool (a solid within r),
 * room: { min: { x, z }, max: { x, z } } | null (the room she is in), swimming }.
 * -> { ok: true } or { ok: false, reason: 'water' | 'steep' | 'room' }
 */
export function canPerform(p, env) {
  if (env.swimming) return { ok: false, reason: 'water' };
  const R = FLAT.ring, n = FLAT.samples, h0 = env.room ? p.y : env.heightAt(p.x, p.z), tan = Math.tan(FLAT.slopeDeg * Math.PI / 180), step = Math.tan(FLAT.stepDeg * Math.PI / 180);
  if (!env.room) {
    if (h0 < env.waterY + FLAT.waterGap) return { ok: false, reason: 'water' };
    let prev = null, first = null;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = p.x + Math.sin(a) * R, z = p.z + Math.cos(a) * R, h = env.heightAt(x, z);
      if (h < env.waterY + FLAT.waterGap) return { ok: false, reason: 'water' };
      if (Math.abs(h - h0) > FLAT.rise || Math.abs(h - h0) / R > tan) return { ok: false, reason: 'steep' };
      const half = env.heightAt(p.x + Math.sin(a) * R / 2, p.z + Math.cos(a) * R / 2);
      if (Math.abs(half - h0) / (R / 2) > tan * 1.15 || Math.abs(h - half) / (R / 2) > step) return { ok: false, reason: 'steep' };
      if (prev !== null && Math.abs(h - prev) / (2 * R * Math.sin(Math.PI / n)) > step) return { ok: false, reason: 'steep' };
      prev = h; if (first === null) first = h;
    }
  } else {
    const r = env.room, m = FLAT.room;
    if (p.x - r.min.x < m || r.max.x - p.x < m || p.z - r.min.z < m || r.max.z - p.z < m) return { ok: false, reason: 'room' };
  }
  if (env.solid(p.x, p.z, FLAT.room, h0, FLAT.height)) return { ok: false, reason: 'room' };
  return { ok: true };
}

/**
 * Floor work (a sequence style's footwork, head spin and floor spin: content/dance-sequences.js) needs level ground: the
 * floor loops are grounded on a flat floor (hands, knees and back on it), and the ground fit only fits planted feet.
 * FLOOR_SLOPE degrees: the most the ground under any back-row spot may slope (sampled FLOOR_FOOT m round it); steeper
 * (a hillside stage) and the back row plays the round's standing steps instead.
 */
export const FLOOR_SLOPE = 3, FLOOR_FOOT = .8;
/** p, facing, spots, env: as canGroup (spots: the back row's places). -> true where the back row may go down to the floor. */
export function floorOk(p, facing, spots, env) {
  if (env.room) return true;   // (a room's floor is level)
  const s = Math.sin(facing), c = Math.cos(facing), tan = Math.tan(FLOOR_SLOPE * Math.PI / 180), f = FLOOR_FOOT;
  for (const o of spots) {
    const x = p.x + o.x * c + o.z * s, z = p.z - o.x * s + o.z * c, h = env.heightAt(x, z);
    for (const [dx, dz] of [[f, 0], [-f, 0], [0, f], [0, -f]]) if (Math.abs(env.heightAt(x + dx, z + dz) - h) / f > tan) return false;
  }
  return true;
}

/** The env for canPerform from the game (world heights, colliders, the open room). */
export function gameEnv(g) {
  const room = g.interiors?.active ? g.interiors.rooms?.get?.(g.interiors.active) || null : null;
  return {
    heightAt: (x, z) => g.world.heightAt(x, z),
    waterY: g.world.frozen ? -Infinity : 0,
    swimming: !!g.player.swimming,
    room: room?.bounds ? { min: room.bounds.min, max: room.bounds.max } : null,
    solid: (x, z, r, footY, h) => { const c = g.colliders.resolve(x, z, r, footY, h, .35); return !!c.hit; },
  };
}

/**
 * The group's places (content/troupe.js): every member needs dry, clear ground; on a hillside the whole formation's
 * ground (hers included) spans no more than `range` m of height and the ground under each member is no steeper than
 * `slopeDeg` (sampled `foot` m round its spot): a back row a little uphill stands tiered, every face showing.
 * (Until 2026-11-28: each member within .35 m of her feet.)
 */
export const GROUP_ROOM = Object.freeze({ range: .6, slopeDeg: 20, foot: .45, clear: .45 });
/**
 * p: her feet, facing: her turn (rad), spots: [{ x, z }] the members' places in her frame (x across, z forward), env as
 * canPerform. -> { ok: true } or { ok: false, reason: 'group' | 'water' | 'steep' }
 */
export function canGroup(p, facing, spots, env) {
  const s = Math.sin(facing), c = Math.cos(facing), h0 = env.room ? p.y : env.heightAt(p.x, p.z), tan = Math.tan(GROUP_ROOM.slopeDeg * Math.PI / 180), f = GROUP_ROOM.foot;
  let lo = h0, hi = h0;
  for (const o of spots) {
    const x = p.x + o.x * c + o.z * s, z = p.z - o.x * s + o.z * c;
    if (env.room) { const r = env.room; if (x - r.min.x < GROUP_ROOM.clear || r.max.x - x < GROUP_ROOM.clear || z - r.min.z < GROUP_ROOM.clear || r.max.z - z < GROUP_ROOM.clear) return { ok: false, reason: 'group' }; }
    else {
      const h = env.heightAt(x, z);
      if (h < env.waterY + FLAT.waterGap) return { ok: false, reason: 'water' };
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      if (hi - lo > GROUP_ROOM.range) return { ok: false, reason: 'steep' };
      for (const [dx, dz] of [[f, 0], [-f, 0], [0, f], [0, -f]]) if (Math.abs(env.heightAt(x + dx, z + dz) - h) / f > tan) return { ok: false, reason: 'steep' };
    }
    if (env.solid(x, z, GROUP_ROOM.clear, h0, FLAT.height)) return { ok: false, reason: 'group' };
  }
  return { ok: true };
}
