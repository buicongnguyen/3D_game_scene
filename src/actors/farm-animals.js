// The farm animals of the two villages (content/farm.js): cows, pigs, goats and dogs. They graze, doze (at night),
// look up when Mika is near and call out, amble a few steps, and step aside for a running Mika. The dogs take to her:
// they bark hello, trot along at her side while she is near home, and sit and wag when she stops.
import { FARM, FARM_KINDS, nextAction } from '../content/farm.js';

const rand = Math.random;

/** Create every farm animal whose model is loaded (a missing model is skipped, never replaced by a box). */
export function spawnFarm(wl) {
  wl.farm = [];
  for (const [id, kind, x, z, facing, radius] of FARM) {
    const def = FARM_KINDS[kind];
    if (!wl.assets.resolved?.has(def.model) || wl.world.heightAt(x, z) < 0.8) continue;
    const a = wl.add(id, def.model, x, z, facing, 'Idle');
    a.kind = kind;
    a.root.scale.multiplyScalar(def.scale * (0.94 + rand() * 0.12));
    a.farm = { def, home: { x, z }, radius: radius || 5, t: rand() * 4, callWait: 6 + rand() * 20, state: 'idle', met: false, retarget: 0, bark: 0 };
    a.setIdle(rand() < 0.5 ? def.graze : 'Idle');
    wl.farm.push(a);
  }
}

const has = (a, clip) => !!a.anim?.has?.(clip);
function say(a, game, volume) { game?.audio?.animal?.(a.kind, Math.max(0, Math.min(1, volume))); }

/** A point near home that is dry and gentle (the animals ignore trees, so they stay in the open ground around home). */
function amblePoint(wl, F, a) {
  for (let k = 0; k < 6; k++) {
    const ang = rand() * Math.PI * 2, r = (0.3 + rand() * 0.7) * F.radius;
    const x = F.home.x + Math.cos(ang) * r, z = F.home.z + Math.sin(ang) * r;
    if (wl.world.heightAt(x, z) > 0.8 && wl.world.grid?.slopeAt(x, z) < 24) return [x, z];
  }
  return null;
}

function walkTo(a, x, z, speed, authored, done, clip = 'Walk') {
  a.walk([[x, z]], done, speed);
  if (has(a, clip)) a.anim.play(clip, { speed: speed / authored });
}

/** One frame for one farm animal. */
export function farmStep(wl, a, dt, player, game) {
  const F = a.farm, def = F.def, night = game?.game?.night ?? 0;
  F.t -= dt; F.callWait -= dt; F.retarget -= dt; F.bark -= dt;
  const dx = player.pos.x - a.pos.x, dz = player.pos.z - a.pos.z, d = Math.hypot(dx, dz);
  if (a.kind === 'dog' && dogStep(wl, a, F, def, dt, d, player, game)) return;

  // a running Mika close by sends the others a few steps away
  if (a.kind !== 'dog' && d < 3.2 && player.speed > 3.4 && !F.fleeing) {
    const tx = a.pos.x - dx / (d || 1) * 5, tz = a.pos.z - dz / (d || 1) * 5;
    if (wl.world.heightAt(tx, tz) > 0.8) {
      F.fleeing = true; F.state = 'walk';
      walkTo(a, tx, tz, def.speed * 2.2, def.walk, () => { F.fleeing = false; F.t = 2; a.setIdle(def.graze); });
      return;
    }
  }
  if (a.path) return;                                         // on the move
  if (F.t > 0) { if (d < 7 && F.state !== 'sleep') a.lookAt(player.pos.x, player.pos.z); return; }

  const act = nextAction(a.kind, { night, near: d < def.near, rested: F.callWait <= 0 });
  F.state = act.action;
  F.t = act.time;
  if (act.action === 'sleep') a.setIdle(has(a, 'Sleep') ? 'Sleep' : 'Idle');
  else if (act.action === 'graze') a.setIdle(has(a, def.graze) ? def.graze : 'Idle');
  else if (act.action === 'idle') a.setIdle('Idle');
  else if (act.action === 'call') {
    a.lookAt(player.pos.x, player.pos.z);
    if (has(a, def.call)) a.anim.once(def.call, { then: a.idleClip });
    say(a, game, 1 - d / 30);
    F.callWait = 25 + rand() * 40;
  } else if (act.action === 'walk') {
    const p = amblePoint(wl, F, a);
    if (!p) { F.t = 3; return; }
    walkTo(a, p[0], p[1], def.speed, def.walk, () => { F.t = 1 + rand() * 4; a.setIdle(rand() < 0.6 && has(a, def.graze) ? def.graze : 'Idle'); });
  }
}

/** The dogs. Returns true when the dog is busy with Mika (so the generic wandering is skipped). */
function dogStep(wl, a, F, def, dt, d, player, game) {
  const home = Math.hypot(player.pos.x - F.home.x, player.pos.z - F.home.z);
  if (home > 42 || d > def.near || (game?.game?.night ?? 0) > 0.85 && d > 6) { F.following = false; return false; }
  // the first time she comes near: a bark and a run to say hello
  if (!F.met && d < 14) {
    F.met = true;
    if (has(a, 'Bark')) a.anim.once('Bark', { then: a.idleClip });
    say(a, game, 1 - d / 26);
    F.bark = 30;
  }
  const keep = player.speed > 3.4 ? 3.4 : 2.1;                  // how close the dog keeps to her
  if (d > keep + 1.2) {
    F.following = true;
    if (!a.path || F.retarget <= 0) {
      const run = d > 9, tx = player.pos.x - (player.pos.x - a.pos.x) / (d || 1) * keep, tz = player.pos.z - (player.pos.z - a.pos.z) / (d || 1) * keep;
      const speed = run ? def.run : def.speed;
      walkTo(a, tx, tz, speed, run ? def.run : def.walk, () => { F.t = 0; F.state = 'arrived'; }, run && has(a, 'Run') ? 'Run' : 'Walk');
      F.retarget = 0.5;
    }
    return true;
  }
  if (a.path) return true;
  // beside her: sit, face her, wag now and then, bark once in a while
  if (F.state !== 'sit') { a.setIdle(has(a, 'Sit') ? 'Sit' : 'Idle'); F.state = 'sit'; F.t = 3 + rand() * 4; }
  a.lookAt(player.pos.x, player.pos.z);
  if (F.t <= 0) {
    F.t = 4 + rand() * 6;
    if (rand() < 0.2 && F.bark <= 0 && has(a, 'Bark')) { a.anim.once('Bark', { then: 'Sit' }); say(a, game, 1 - d / 26); F.bark = 35; }
    else if (has(a, 'Wag')) a.anim.once('Wag', { then: 'Sit' });
  }
  return true;
}
