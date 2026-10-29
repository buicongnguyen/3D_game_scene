// The forest plan of a play zone (docs/PLAY-ZONES-PLAN.md, review gap "zone trees are not the valley's trees").
//
// scatter() (world/scatter.js) places every tree, rock and bush from ONE sequence of random numbers, so what it accepts
// anywhere in the valley decides the position of every tree after it. A zone, which has the exact ground only inside
// itself, therefore planted other trees than the valley has, even inside its own circle. The valley's layout cannot be
// re-rolled (the world would change for everybody), so a zone does not scatter at all: scripts/bake-zone-backdrops.mjs
// records what the real valley plants inside each zone, per graphics tier (the density differs), and the zone loads that.
// Pure: no three.js, runs in Node for the bake script and the tests.

const round = v => Math.round(v * 1000) / 1000;

/** The part of a scatter result (`placed`) a zone shows: everything within its view radius plus `pad`, rounded to the millimetre. */
export function subsetPlan(placed, zone, pad = 6) {
  const R = zone.r + (zone.margin ?? 0) + pad, out = {};
  for (const [kind, list] of Object.entries(placed)) {
    out[kind] = list
      .filter(o => !o.far && Math.hypot(o.x - zone.x, o.z - zone.z) <= R)
      .map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])));
  }
  return out;
}

/** A number for a plan: the trees' places to the decimetre, order-free. Two plans with the same hash plant the same forest. */
export function planHash(plan) {
  const keys = (plan.trees || []).map(t => `${Math.round(t.x * 10)},${Math.round(t.z * 10)},${t.model}`).sort();
  let h = 0;
  for (const k of keys) for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return `${keys.length}:${h}`;
}
