// Where Kotone may perform in Sing & Play (pure; tests/singplay.test.mjs): flat, walkable, open ground with room around
// her. Not on a hillside (the ground over a ring round her stays within FLAT.rise of her feet and no step between
// neighbouring samples is steeper than FLAT.slopeDeg), not in or next to water, not against a wall, a tree trunk or a
// fence (no solid within FLAT.room), and inside a room only when that clear radius fits between its walls.
export const FLAT = Object.freeze({ ring: 1.6, samples: 12, rise: .25, slopeDeg: 12, room: 1.4, waterGap: .3, height: 1.6 });

/**
 * p: { x, y, z } her feet. env: { heightAt(x, z), waterY, solid(x, z, r, footY, h) -> bool (a solid within r),
 * room: { min: { x, z }, max: { x, z } } | null (the room she is in), swimming }.
 * -> { ok: true } or { ok: false, reason: 'water' | 'steep' | 'room' }
 */
export function canPerform(p, env) {
  if (env.swimming) return { ok: false, reason: 'water' };
  const R = FLAT.ring, n = FLAT.samples, h0 = env.room ? p.y : env.heightAt(p.x, p.z), tan = Math.tan(FLAT.slopeDeg * Math.PI / 180);
  if (!env.room) {
    if (h0 < env.waterY + FLAT.waterGap) return { ok: false, reason: 'water' };
    let prev = null, first = null;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = p.x + Math.sin(a) * R, z = p.z + Math.cos(a) * R, h = env.heightAt(x, z);
      if (h < env.waterY + FLAT.waterGap) return { ok: false, reason: 'water' };
      if (Math.abs(h - h0) > FLAT.rise || Math.abs(h - h0) / R > tan) return { ok: false, reason: 'steep' };
      const half = env.heightAt(p.x + Math.sin(a) * R / 2, p.z + Math.cos(a) * R / 2);
      if (Math.abs(half - h0) / (R / 2) > tan) return { ok: false, reason: 'steep' };
      if (prev !== null && Math.abs(h - prev) / (2 * R * Math.sin(Math.PI / n)) > 2 * tan) return { ok: false, reason: 'steep' };
      prev = h; if (first === null) first = h;
    }
  } else {
    const r = env.room, m = FLAT.room;
    if (p.x - r.min.x < m || r.max.x - p.x < m || p.z - r.min.z < m || r.max.z - p.z < m) return { ok: false, reason: 'room' };
  }
  if (env.solid(p.x, p.z, FLAT.room, h0, FLAT.height)) return { ok: false, reason: 'room' };
  return { ok: true };
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

/** The group's places (content/troupe.js): every member needs the ground under it level with hers, dry and clear. */
export const GROUP_ROOM = Object.freeze({ rise: .35, clear: .45 });
/**
 * p: her feet, facing: her turn (rad), spots: [{ x, z }] the members' places in her frame (x across, z forward), env as
 * canPerform. -> { ok: true } or { ok: false, reason: 'group' | 'water' }
 */
export function canGroup(p, facing, spots, env) {
  const s = Math.sin(facing), c = Math.cos(facing), h0 = env.room ? p.y : env.heightAt(p.x, p.z);
  for (const o of spots) {
    const x = p.x + o.x * c + o.z * s, z = p.z - o.x * s + o.z * c;
    if (env.room) { const r = env.room; if (x - r.min.x < GROUP_ROOM.clear || r.max.x - x < GROUP_ROOM.clear || z - r.min.z < GROUP_ROOM.clear || r.max.z - z < GROUP_ROOM.clear) return { ok: false, reason: 'group' }; }
    else {
      const h = env.heightAt(x, z);
      if (h < env.waterY + FLAT.waterGap) return { ok: false, reason: 'water' };
      if (Math.abs(h - h0) > GROUP_ROOM.rise) return { ok: false, reason: 'group' };
    }
    if (env.solid(x, z, GROUP_ROOM.clear, h0, FLAT.height)) return { ok: false, reason: 'group' };
  }
  return { ok: true };
}
