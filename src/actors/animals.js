import * as THREE from 'three';
import { NPC } from './npc.js';
import { rng } from '../engine/spline.js';
import { PLACES, river, riverHalfWidth } from '../world/layout.js';

/** Sheep closer than this to the pen drift home by themselves. */
export const HOME_RADIUS = 22;
/** How close Mika can walk before a grazing sheep shuffles aside (small, so she can reach it). */
export const SHY_RADIUS = 2.2;

/** Pure herding step for one sheep (Node-testable). Returns new {x, z, vx, vz, state}. */
export function herdStep(sheep, player, flock, pen, dt, rand = Math.random) {
  let { x, z, vx = 0, vz = 0 } = sheep;
  const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz);
  let ax = 0, az = 0, speed = 0.6;
  if (sheep.penned) {
    // mill about inside the pen
    const px = x - pen.x, pz = z - pen.z, pd = Math.hypot(px, pz);
    if (pd > pen.r - 1.2) { ax -= px / pd * 2; az -= pz / pd * 2; }
    ax += (rand() - 0.5) * 0.6; az += (rand() - 0.5) * 0.6;
    speed = 0.5;
  } else if (!sheep.homing && d < SHY_RADIUS) {
    const f = (SHY_RADIUS - d) / SHY_RADIUS;
    ax += dx / (d || 1) * (2 + f * 4); az += dz / (d || 1) * (2 + f * 4);
    speed = 0.8 + f * 1.2;
    // flock cohesion: stay near nearby sheep
    let cx = 0, cz = 0, n = 0;
    for (const o of flock) if (o !== sheep && !o.penned && Math.hypot(o.x - x, o.z - z) < 9) { cx += o.x; cz += o.z; n++; }
    if (n) { ax += (cx / n - x) * 0.15; az += (cz / n - z) * 0.15; }
  } else if (!sheep.homing) {
    if (rand() < dt * 0.4) sheep.wander = rand() * Math.PI * 2;
    ax += Math.cos(sheep.wander ?? 0) * 0.4; az += Math.sin(sheep.wander ?? 0) * 0.4;
    speed = 0.35;
  }
  // homing: near the pen, sheep drift toward the gate (south side) and then inside
  if (!sheep.penned) {
    const gx = pen.x, gz = pen.z + pen.r + 1.2;
    const toPen = Math.hypot(x - pen.x, z - pen.z);
    if (toPen < HOME_RADIUS || sheep.homing) {
      const inGate = (Math.abs(x - pen.x) < 2.4 && z > pen.z - 1 && z < gz + 1.5) || Math.hypot(x - gx, z - gz) < 1.8;
      let tx = inGate || toPen < pen.r - 0.5 ? pen.x : gx, tz = inGate || toPen < pen.r - 0.5 ? pen.z : gz;
      // beside or behind the pen: follow the fence round toward the gate instead of pushing into it
      const ang = Math.atan2(x - pen.x, z - pen.z); // 0 = gate side (south)
      if (!inGate && toPen > pen.r - 0.5 && toPen < pen.r + 4 && Math.abs(ang) > 0.45) {
        const a2 = ang - Math.sign(ang) * 0.7, rr = pen.r + 2.2;
        tx = pen.x + Math.sin(a2) * rr; tz = pen.z + Math.cos(a2) * rr;
      }
      const k = sheep.homing ? 3 : 0.8 + (HOME_RADIUS - toPen) / HOME_RADIUS * 1.8;
      const l = Math.hypot(tx - x, tz - z) || 1;
      ax += (tx - x) / l * k; az += (tz - z) / l * k;
      // a sent-home sheep trots, slowing to a walk through the gate
      speed = Math.max(speed, sheep.homing ? (toPen < pen.r + 3 ? 1.6 : 3.0) : 0.9);
    }
  }
  // separation
  for (const o of flock) {
    if (o === sheep) continue;
    const ox = x - o.x, oz = z - o.z, od = Math.hypot(ox, oz);
    if (od < 1.3 && od > 1e-3) { ax += ox / od * 1.5; az += oz / od * 1.5; }
  }
  const al = Math.hypot(ax, az) || 1;
  const tvx = ax / al * speed, tvz = az / al * speed;
  const k = 1 - Math.exp(-dt * 4);
  vx += (tvx - vx) * k; vz += (tvz - vz) * k;
  x += vx * dt; z += vz * dt;
  const pd = Math.hypot(x - pen.x, z - pen.z);
  const penned = sheep.penned || pd < pen.r - 1.5;
  return { x, z, vx, vz, penned, speed: Math.hypot(vx, vz) };
}

export class Wildlife {
  constructor(scene, assets, world, colliders) {
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.colliders = colliders;
    this.actors = [];
    this.story = {};
    this.R = rng(99);
    this.spawnAmbient();
  }

  add(id, model, x, z, facing = 0, idle = 'Idle') {
    const a = new NPC(this.scene, this.assets, this.world, id, model, { x, z, facing });
    a.setIdle(idle);
    this.actors.push(a);
    return a;
  }

  remove(a) {
    if (!a) return;
    this.scene.remove(a.root);
    this.actors = this.actors.filter(x => x !== a);
  }

  spawnAmbient() {
    const R = this.R;
    // rabbits in the meadows around Kawabe and the orchard
    this.rabbits = [];
    for (let i = 0; i < 7; i++) {
      const cx = i < 4 ? -70 : 60, cz = i < 4 ? -20 : 10;
      const x = cx + (R() - 0.5) * 40, z = cz + (R() - 0.5) * 40;
      if (this.world.heightAt(x, z) < 1) continue;
      const r = this.add(`rabbit${i}`, 'rabbit', x, z, R() * 6.28);
      r.kind = 'rabbit';
      this.rabbits.push(r);
    }
    // chickens in Takamori
    for (let i = 0; i < 5; i++) {
      const c = this.add(`chicken${i}`, 'chicken', 120 + (R() - 0.5) * 16, 22 + (R() - 0.5) * 10, R() * 6.28);
      c.kind = 'chicken';
    }
    // a cat asleep on Kawabe's main street
    const cat = this.add('cat', 'cat', -49.5, 27, 1.2, 'Sleep');
    cat.kind = 'cat';
    // ducks on the river near Kawabe
    this.ducks = [];
    const duckS = river.nearest(9, 4).s;
    for (let i = 0; i < 4; i++) {
      const s = duckS + i * 6;
      const p = river.at(s);
      const d = this.add(`duck${i}`, 'duck', p.x + 3, p.z, 0, 'Swim');
      d.kind = 'duck';
      d.phase = R() * 10;
      d.s0 = s;
      this.ducks.push(d);
    }
    // two flocks circling over the villages
    this.flocks = [];
    for (const [cx, cz, n] of [[-50, 10, 5], [110, 0, 4]]) {
      for (let i = 0; i < n; i++) {
        const b = this.add(`bird${cx}_${i}`, 'crow', cx, cz, 0, 'Fly');
        b.kind = 'bird';
        b.center = new THREE.Vector3(cx, 38 + i * 2.5, cz);
        b.phase = i * 1.3;
        b.radius = 18 + i * 3;
        this.flocks.push(b);
      }
    }
    // fish under the water near the dock and the mill race
    this.fish = [];
    for (let i = 0; i < 8; i++) {
      const model = i === 3 ? 'fish-koi' : 'fish-trout';
      const f = this.add(`fish${i}`, model, 8 + (R() - 0.5) * 6, 26 + (R() - 0.5) * 12, 0, 'Swim');
      f.kind = 'fish';
      f.phase = R() * 10;
      f.center = new THREE.Vector3(i < 5 ? 9 : 0, 0, i < 5 ? 28 : -34);
      this.fish.push(f);
    }
  }

  // ---------------------------------------------------------------- story spawns
  spawnCrab() {
    if (this.story.crab) return this.story.crab;
    const p = PLACES.sandbar;
    const c = this.add('crab', 'crab', p.x, p.z, 1.6);
    c.place(p.x, p.z, 1.6, Math.max(0.25, this.world.heightAt(p.x, p.z)));
    this.story.crab = c;
    return c;
  }

  crabBooped(done) {
    const c = this.story.crab;
    if (!c) return;
    c.gesture('Angry');
    setTimeout(() => {
      c.setIdle('Walk');
      c.walk([[c.pos.x + 4, c.pos.z + 1.5], [c.pos.x + 7, c.pos.z + 3]], () => { this.remove(c); this.story.crab = null; }, 1.6);
      done?.();
    }, 1100);
  }

  spawnSheep() {
    if (this.story.sheep) return;
    const R = this.R;
    const spots = [[128, -58], [166, -14], [120, -30], [170, -60], [134, -4]];
    this.story.sheep = spots.map(([x, z], i) => {
      const s = this.add(`sheep${i}`, 'sheep', x + (R() - 0.5) * 3, z + (R() - 0.5) * 3, R() * 6.28);
      Object.assign(s, { x: s.pos.x, z: s.pos.z, vx: 0, vz: 0, penned: false, kind: 'sheep', wander: R() * 6.28 });
      return s;
    });
  }

  /** Mika asked nicely: this sheep trots home to the pen by itself. */
  sendHome(s) {
    if (s.penned || s.homing) return;
    s.homing = true;
    s.homeT = 0;
    s.anim?.once('Bleat', { then: 'Run' });
  }

  placeSheepPenned(n) {
    this.spawnSheep();
    this.story.sheep.forEach((s, i) => {
      if (i < n) { s.penned = true; s.x = PLACES.pen.x + (i - 2) * 1.2; s.z = PLACES.pen.z + (i % 2) * 1.2; }
    });
  }

  spawnCrows(scarecrows) {
    if (this.story.crows) return;
    this.story.crows = scarecrows.map((s, i) => {
      const c = this.add(`crow${i}`, 'crow', s.x + 1.5, s.z + 0.6, i);
      c.place(s.x + 1.2, s.z + 0.4, i, s.y);
      c.kind = 'crow';
      c.scarecrow = i;
      return c;
    });
  }

  scareCrow(i) {
    const c = this.story.crows?.find(x => x.scarecrow === i);
    if (!c || c.flying) return;
    c.flying = { t: 0, dir: this.R() * Math.PI * 2 };
    c.gesture('Fly');
    c.setIdle('Fly');
  }

  spawnFox(trail) {
    if (this.story.fox) return this.story.fox;
    const [x, z] = trail[0];
    const f = this.add('fox', 'fox', x, z, Math.PI);
    f.trail = trail.slice(1);
    f.kind = 'fox';
    this.story.fox = f;
    return f;
  }

  spawnBear() {
    if (this.story.bear) return this.story.bear;
    const p = PLACES.bearSpot;
    const b = this.add('bear', 'bear', p.x, p.z, Math.PI / 2, 'Sleep');
    b.kind = 'bear';
    this.story.bear = b;
    return b;
  }

  bearWakes(done) {
    const b = this.story.bear;
    if (!b) { done?.(); return; }
    b.anim?.once('Wake', { then: 'Eat', onDone: () => {
      b.setIdle('Eat');
      setTimeout(() => {
        b.setIdle('Walk');
        b.walk([[b.pos.x - 8, b.pos.z + 4], [b.pos.x - 18, b.pos.z + 2], [b.pos.x - 30, b.pos.z - 6]], () => { b.setVisible(false); }, 1.0);
        done?.();
      }, 2600);
    } });
    if (!b.anim) done?.();
  }

  // ---------------------------------------------------------------- update
  update(dt, player, game) {
    const t = performance.now() / 1000;
    for (const a of this.actors) {
      const far = a.kind !== 'bird' && a.pos.distanceToSquared(player.pos) > 140 * 140;
      a.root.visible = a.visible && !far;
      if (far && a.kind !== 'fox' && a.kind !== 'sheep') continue;
      if (a.kind === 'rabbit') this.rabbit(a, dt, player);
      else if (a.kind === 'chicken') this.wander(a, dt, 0.6, 5, [120, 22]);
      else if (a.kind === 'duck') {
        const p = river.at(a.s0 + Math.sin(t * 0.05 + a.phase) * 25);
        const off = riverHalfWidth(p.z) * 0.45 * Math.sin(t * 0.08 + a.phase);
        a.targetFacing = Math.atan2(p.tx * Math.cos(t * 0.05 + a.phase), p.tz * Math.cos(t * 0.05 + a.phase));
        a.pos.set(p.x - p.tz * off, 0.02, p.z + p.tx * off);
      } else if (a.kind === 'fish') {
        const ang = t * 0.4 + a.phase;
        a.pos.set(a.center.x + Math.cos(ang) * 3.5, -0.55 + Math.sin(t + a.phase) * 0.1, a.center.z + Math.sin(ang) * 5);
        a.targetFacing = ang + Math.PI;
        a.facing = a.targetFacing;
      } else if (a.kind === 'bird') {
        const ang = t * 0.28 + a.phase;
        a.pos.set(a.center.x + Math.cos(ang) * a.radius, a.center.y + Math.sin(t * 0.7 + a.phase) * 1.5, a.center.z + Math.sin(ang) * a.radius);
        a.targetFacing = Math.atan2(-Math.sin(ang), Math.cos(ang));
        a.facing = a.targetFacing;
        a.root.visible = a.visible && game?.game?.time.season !== 'winter';
      } else if (a.kind === 'sheep') this.sheep(a, dt, player);
      else if (a.kind === 'crow' && a.flying) {
        a.flying.t += dt;
        const f = a.flying;
        a.pos.x += Math.cos(f.dir) * dt * 9; a.pos.z += Math.sin(f.dir) * dt * 9; a.pos.y += dt * 5;
        a.targetFacing = Math.atan2(Math.cos(f.dir), Math.sin(f.dir));
        if (f.t > 5) { a.setVisible(false); a.flying = null; }
      } else if (a.kind === 'fox') this.fox(a, dt, player, game);
      a.update(dt, a.kind === 'sheep' || a.kind === 'fox' ? this.colliders : null);
    }
  }

  wander(a, dt, speed, radius, [cx, cz]) {
    if (!a.path && Math.random() < dt * 0.15) {
      const ang = Math.random() * Math.PI * 2, r = Math.random() * radius;
      a.walk([[cx + Math.cos(ang) * r, cz + Math.sin(ang) * r]], null, speed);
    }
  }

  rabbit(a, dt, player) {
    const d = a.pos.distanceTo(player.pos);
    if (d < 5 && !a.path) {
      const dx = a.pos.x - player.pos.x, dz = a.pos.z - player.pos.z, l = Math.hypot(dx, dz) || 1;
      const tx = a.pos.x + dx / l * 7, tz = a.pos.z + dz / l * 7;
      if (this.world.heightAt(tx, tz) > 0.8) { a.walk([[tx, tz]], null, 3.5); a.anim?.play('Hop', { speed: 1.6 }); }
    } else if (!a.path && Math.random() < dt * 0.1) {
      const ang = Math.random() * 6.28;
      const tx = a.pos.x + Math.cos(ang) * 3, tz = a.pos.z + Math.sin(ang) * 3;
      if (this.world.heightAt(tx, tz) > 0.8) { a.walk([[tx, tz]], null, 1.2); a.anim?.play('Hop'); }
    }
  }

  sheep(s, dt, player) {
    const pen = { x: PLACES.pen.x, z: PLACES.pen.z, r: 5 };
    const flock = this.story.sheep;
    const was = s.penned;
    const n = herdStep(s, player.pos, flock, pen, dt);
    let x = n.x, z = n.z;
    // a sheep that gets stuck on its way home (a wall, a steep bank) is found in the pen a moment later
    if (s.homing && !s.penned && (s.homeT = (s.homeT || 0) + dt) > 22) { x = pen.x + (this.R() - 0.5) * 2; z = pen.z + (this.R() - 0.5) * 2; n.penned = true; }
    // terrain and fences
    if (this.world.heightAt(x, z) < 0.6 || this.world.grid.slopeAt(x, z) > 38) { x = s.x; z = s.z; n.vx *= -0.5; n.vz *= -0.5; }
    const r = this.colliders.resolve(x, z, 0.45, this.world.heightAt(x, z), 1.0, 0.3);
    Object.assign(s, n, { x: r.x, z: r.z });
    if (s.penned && !was) this.onPenned?.(s);
    s.pos.set(s.x, this.world.heightAt(s.x, s.z), s.z);
    if (n.speed > 0.15) s.targetFacing = Math.atan2(n.vx, n.vz);
    const clip = n.speed > 2 ? 'Run' : n.speed > 0.2 ? 'Walk' : 'Idle';
    if (!s.anim?.busy) s.anim?.play(clip, { speed: clip === 'Run' ? n.speed / 3.5 : clip === 'Walk' ? Math.max(0.6, n.speed / 0.8) : 1 });
    if (Math.random() < dt * 0.05) s.anim?.once('Bleat', { then: clip });
  }

  fox(f, dt, player, game) {
    if (!f.trail?.length) { f.setIdle('Sit'); return; }
    const d = f.pos.distanceTo(player.pos);
    if (f.path) return;
    if (d < 7) {
      const next = f.trail.shift();
      f.walk([next], () => { f.anim?.play('Sit'); f.anim?.once('Look', { then: 'Sit' }); if (!f.trail.length) game?.onFoxArrived?.(); }, 4.2);
    } else if (d > 16) {
      f.lookAt(player.pos.x, player.pos.z);
      if (!f.anim?.busy && Math.random() < dt * 0.3) f.anim?.once('Look', { then: 'Sit' });
    }
  }
}
