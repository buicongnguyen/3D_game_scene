// Morning exercise (content/tricks.js 'exercise'): a calm, happy routine on the big lawn in Kawabe. The instructor
// (TRICK.exercise.instructor, Rin for now) leads from a low wooden stage beside a little radio, Mika copies her in the
// front row and, on Normal and Difficult, neighbours join in: two kids beside her, two grown-ups behind.
//   - three routines (rules-exercise.js): the radio exercise, a kids' workout, kids' yoga; chosen after the level;
//   - the moves are clip packs (exercise-moves.js), loaded when the round starts and taken away when it ends;
//   - every count is the music's: the audio engine plays the routine's tune (engine/audio.js exerciseBeat) and a
//     little sung count; the game clock is the master and the notes are scheduled from it;
//   - the camera stands still behind the class (beside it for the floor poses): focus mode keeps the people live and
//     the valley a still picture (engine/focus.js), retaken a few times as the morning sun climbs.
// Everything the round sets up (people, props, clips, camera, the screen, the music, the hidden signs and the real
// instructor) is put back in a finally, whatever way the round ends.
import * as THREE from 'three';
import { tx, getLang, N_ } from '../../i18n/i18n.js';
import { disposeRigs, trampleGrass } from './util.js';
import { MOVES, ROUTINES, ROUTINE_NAME, KEY_WORD, makeRoutine, itemAt, moveAt, Session, demoPhase, demoHoldSide, TALK } from './rules-exercise.js';
import { PACKS, packName, prepareMoves, lendClips, hipHeight, closestPack } from './exercise-moves.js';
import { openRoutinePicker, makeHud } from './exercise-ui.js';

/** Where everyone stands, in metres in the class's frame: f = the way the class faces (toward the instructor), r = its right. */
export const STAGE = {
  instructor: { f: 3.3, r: 0 }, platform: { f: 3.3, r: 0, w: 1.6, d: 1.4, h: 0.22 }, radio: { f: 3.1, r: -1.5 },
  mika: { f: 0, r: 0 },
  kids: [{ f: 0.1, r: 1.45 }, { f: 0.05, r: -1.45 }],
  adults: [{ f: -0.95, r: 2.2 }, { f: -1.0, r: -2.15 }],
  // high enough to see the instructor over Mika's head, a little to the class's left (the How to play card is on the
  // left of the screen: the class sits right of the middle)
  camera: { f: -4.4, r: -0.85, up: 2.5, look: { f: 1.8, r: 0.05, up: 0.95 } },
  floorCamera: { f: -3.3, r: -1.5, up: 2.75, look: { f: 1.4, r: 0.1, up: 0.25 } },
  grass: { f: 1.3, r: 0, radius: 5.4 },
};
const HOUR0 = 6.35, HOUR1 = 7.35;      // the sun climbs this much over a round
const LAG = [0, 0.04, -0.03, 0.05, -0.02];   // the neighbours are a little behind or ahead of the count (s)
// the neighbours' clothes (the villager models' tintable parts, see actors/npc.js)
const KID_TINT = [{ 'Villager shirt': '#3a8fd8', 'Villager trousers': '#2d3a5a', 'Villager hair': '#2a1d16' }, { 'Villager shirt': '#f2b53a', 'Villager trousers': '#5a3a2a', 'Villager hair': '#4a3020' }];
const MAN_TINT = [{ 'Villager shirt': '#5fae3e', 'Villager trousers': '#3a4a3a', 'Villager hair': '#1a1a1a' }, { 'Villager shirt': '#e2702a', 'Villager trousers': '#6a6a7a', 'Villager hair': '#8a8a8a' }];
const CULTURE = {
  title: 'Morning exercise around the world',
  text: 'In Japan, radio exercise (rajio taisō) has played every morning since 1928. In Vietnam, pupils exercise together in the school yard, and grandparents meet in the parks at dawn.',
};
// (the extractor finds them by their N_ markers)
N_('Morning exercise around the world');
N_('In Japan, radio exercise (rajio taisō) has played every morning since 1928. In Vietnam, pupils exercise together in the school yard, and grandparents meet in the parks at dawn.');
const KEY_HINT = {
  up: N_('Press Up as I reach up.'), down: N_('Press Down as I bend down.'), left: N_('Left, then right: press the side I move to.'),
  right: N_('Left, then right: press the side I move to.'), tap: N_('Tap the round button on the count.'),
};
const HOLD_HINT = N_('Hold the button and keep the needle in the green: tap left or right.');
const BREATH_HINT = N_('Hold while the circle grows, let go while it shrinks.');

// ---------------------------------------------------------------------------------------------------- people
/** A person for the round (actors/npc.js), with what is theirs alone remembered so it can be freed. */
function stagePerson(NPC, g, id, model, at, facing, tint) {
  if (!g.assets.has?.(model)) return null;
  const shared = new Set();
  const assets = { clone(name) {
    const c = g.assets.clone(name);
    c?.traverse(o => { if (o.isMesh) { shared.add(o.geometry); for (const m of [o.material].flat()) shared.add(m); } });
    return c;
  } };
  const npc = new NPC(g.scene, assets, g.world, id, model, { x: at.x, z: at.z, facing, tint });
  const local = new Set();
  npc.model.traverse(o => { if (!o.isMesh) return; if (!shared.has(o.geometry)) local.add(o.geometry); for (const m of [o.material].flat()) if (!shared.has(m)) local.add(m); });
  return {
    npc, model, root: npc.root, anim: npc.anim, give: null,
    dispose() { this.give?.(); npc.root.removeFromParent(); disposeRigs(npc.root); local.forEach(o => o.dispose?.()); },
  };
}

/** Hide a hat for the round (the instructor's straw hat would catch her raised arms): its bone shrinks to nothing. */
function hatOff(root) {
  let hat = null;
  root.traverse(o => { if (!hat && o.isBone && o.name === 'hat') hat = o; });
  if (!hat) return () => {};
  const s = hat.scale.clone();
  hat.scale.setScalar(0.001);
  return () => hat.scale.copy(s);
}

// ---------------------------------------------------------------------------------------------------- props
function makeProps(at, f, r, ground, yoga, mats) {
  const group = new THREE.Group();
  group.name = 'exercise:props';
  const own = [];
  const mat = (color, rough = 0.8) => { const m = new THREE.MeshStandardMaterial({ color, roughness: rough }); own.push(m); return m; };
  const geo = g => { own.push(g); return g; };
  const place = (o, lf, lr, y = 0) => { const x = at.x + f.x * lf + r.x * lr, z = at.z + f.z * lf + r.z * lr; o.position.set(x, ground(x, z) + y, z); o.rotation.y = Math.atan2(f.x, f.z); group.add(o); return o; };
  // the low wooden stage: planks with a dark rim
  const P = STAGE.platform, wood = mat('#b98552'), dark = mat('#7a5232');
  const stage = new THREE.Group();
  const top = new THREE.Mesh(geo(new THREE.BoxGeometry(P.w, 0.06, P.d)), wood); top.position.y = P.h - 0.03; stage.add(top);
  const base = new THREE.Mesh(geo(new THREE.BoxGeometry(P.w - 0.08, P.h - 0.06, P.d - 0.08)), dark); base.position.y = (P.h - 0.06) / 2; stage.add(base);
  for (let i = 1; i < 5; i++) { const s = new THREE.Mesh(geo(new THREE.BoxGeometry(0.012, 0.004, P.d - 0.02)), dark); s.position.set(-P.w / 2 + i * P.w / 5, P.h + 0.001, 0); stage.add(s); }
  place(stage, P.f, P.r);
  // the radio on a crate: a box with a speaker grille, a dial and a handle (the radio exercise's radio)
  const radio = new THREE.Group();
  const crate = new THREE.Mesh(geo(new THREE.BoxGeometry(0.42, 0.36, 0.36)), wood); crate.position.y = 0.18; radio.add(crate);
  const body = new THREE.Mesh(geo(new THREE.BoxGeometry(0.34, 0.2, 0.14)), mat('#d8463a', 0.5)); body.position.y = 0.46; radio.add(body);
  const grille = new THREE.Mesh(geo(new THREE.CircleGeometry(0.065, 20)), mat('#3a2a22', 0.9)); grille.position.set(-0.07, 0.46, 0.071); radio.add(grille);
  const dial = new THREE.Mesh(geo(new THREE.BoxGeometry(0.1, 0.05, 0.01)), mat('#f4e3b8', 0.4)); dial.position.set(0.09, 0.48, 0.072); radio.add(dial);
  const handle = new THREE.Mesh(geo(new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI)), mat('#3a2a22', 0.6)); handle.position.y = 0.56; radio.add(handle);
  place(radio, STAGE.radio.f, STAGE.radio.r);
  radio.rotation.y += Math.PI;                  // its front to the class
  // yoga mats under everyone (the floor poses reach a little forward and back of the feet)
  const matObjs = [];
  if (yoga) {
    const cols = ['#5fb8a8', '#e98aa0', '#f2c14e', '#8fb3e8', '#a9d27a', '#c7a0e0'];
    mats.forEach((m, i) => {
      const o = new THREE.Mesh(geo(new THREE.BoxGeometry(0.62 * m.k, 0.012, 1.75 * m.k)), mat(cols[i % cols.length], 0.95));
      o.receiveShadow = true;
      const x = m.x + m.fx * 0.18 * m.k, z = m.z + m.fz * 0.18 * m.k;
      o.position.set(x, (m.y ?? ground(x, z)) + 0.006, z);
      o.rotation.y = Math.atan2(m.fx, m.fz);
      group.add(o); matObjs.push(o);
    });
  }
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group, dispose() { group.removeFromParent(); own.forEach(o => o.dispose()); } };
}

/** Little floating notes and hearts over the neighbours when the class is in time (they are enjoying it). */
class Joy {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'exercise:joy';
    this.items = [];
    this.tex = [];
    if (typeof document === 'undefined') return;
    for (const [ch, col] of [['♪', '#f08a3c'], ['♥', '#e8587a']]) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'); x.font = 'bold 48px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 6; x.strokeStyle = '#fff'; x.strokeText(ch, 32, 34); x.fillStyle = col; x.fillText(ch, 32, 34);
      this.tex.push(new THREE.CanvasTexture(c));
    }
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex[i % 2], transparent: true, depthWrite: false }));
      s.scale.setScalar(0.28); s.visible = false; s.userData.t = 9;
      this.group.add(s); this.items.push(s);
    }
  }
  burst(at, n = 1) {
    for (let k = 0; k < n; k++) {
      const s = this.items.find(o => o.userData.t >= 1.2);
      if (!s) return;
      s.userData.t = 0; s.userData.x = at.x + (Math.random() - 0.5) * 0.3; s.userData.z = at.z + (Math.random() - 0.5) * 0.3; s.userData.y = at.y;
      s.material.map = this.tex[Math.random() < 0.5 ? 0 : 1];
      s.visible = true;
    }
  }
  update(dt) {
    for (const s of this.items) {
      if (s.userData.t >= 1.2) { if (s.visible) s.visible = false; continue; }
      const t = (s.userData.t += dt);
      s.position.set(s.userData.x + Math.sin(t * 5) * 0.06, s.userData.y + t * 0.55, s.userData.z);
      s.material.opacity = Math.min(1, (1.2 - t) * 2.5);
    }
  }
  dispose() { this.group.removeFromParent(); for (const s of this.items) s.material.dispose(); this.tex.forEach(t => t.dispose()); }
}

// ---------------------------------------------------------------------------------------------------- driving a body
/** Play `clip` on a body at `time` seconds (the round sets the time itself every frame: the clips follow the count). */
function pose(body, clip, time, fade = 0.28) {
  const a = body.anim;
  if (!a?.has?.(clip)) return false;
  if (a.currentName !== clip) { a.oneShot = null; a.play(clip, { fade }); }
  const act = a.action(clip);
  if (!act) return false;
  const d = act.getClip().duration;
  act.timeScale = 0;
  act.time = Math.min(d - 1e-3, Math.max(0, ((time % d) + d) % d));
  return true;
}

/** The clip and time a body plays at count c of the plan (demo: the instructor; lag: seconds behind). */
function bodyClip(plan, c, cs, { demo = false, lag = 0, watchIdle = false, breathR = null } = {}) {
  const at = itemAt(plan, c);
  if (!at) return { clip: 'ExMountain', t: 0 };
  const it = at.item, cc = c - lag / cs;
  if (it.t === 'talk') return { clip: 'ExMountain', t: (cc - it.start) * cs * 0.5 };
  if (it.t === 'trans') {
    const u = Math.min(1, Math.max(0, (c - it.start) / it.n)), clip = it.side ? `${it.clip.slice(0, -1)}${demo ? demoHoldSide(it.side, false) : it.side}` : it.clip;
    return { clip, frac: it.rev ? 1 - u : u };
  }
  if (it.t === 'hold') {
    const m = MOVES[it.m], side = it.side ? (demo ? demoHoldSide(it.side, false) : it.side) : '';
    return { clip: m.clip + side, t: (cc - it.start) * cs };
  }
  if (it.t === 'breath') {
    const m = MOVES[it.m];
    if (breathR !== null) return { clip: m.clip, frac: breathR * 0.5 };
    return { clip: m.clip, frac: (((cc - it.start) / m.counts) % 1 + 1) % 1 };
  }
  // a move (or a combo): during its first counts on Easy the class watches the instructor
  if (!demo && watchIdle && it.watch && c - it.start < it.watch) return { clip: MOVES[it.m || it.ms[0]].floor ? 'ExCatCow' : 'ExMountain', t: 0, fade: 0.4 };
  const mv = moveAt(it, cc);
  const m = MOVES[mv.m];
  const ph = demo ? (mv.phase + demoPhase(mv.m, !!it.mirror)) % 1 : mv.phase;
  return { clip: m.clip, frac: ph };
}


// ---------------------------------------------------------------------------------------------------- the round
/** The routine of this round: a QA script's, the radio exercise on the guided first go, else the player's choice. */
async function chooseRoutine(ctx, qa, touch) {
  if (ROUTINES.includes(qa.routine)) return qa.routine;
  if (ctx.first) return 'radio';
  let last = 'radio';
  try { last = localStorage.getItem('starline-exercise-routine') || 'radio'; } catch { /* no storage */ }
  const pick = openRoutinePicker({ title: tx(ctx.trick.name), routine: last, touch });
  let chosen;
  pick.done.then(v => { chosen = v; });
  const r = await ctx.loop(dt => { pick.step(ctx.input, dt); return chosen !== undefined ? { routine: chosen } : undefined; });
  pick.close();
  if (r?.quit || !r?.routine) return null;
  try { localStorage.setItem('starline-exercise-routine', r.routine); } catch { /* fine */ }
  return r.routine;
}

/** Directions from a gamepad's d-pad and left stick (Input only turns the stick into walking). */
function padState(prev) {
  const out = { up: false, down: false, left: false, right: false, hold: false };
  const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (gp) {
    const b = i => !!gp.buttons[i]?.pressed, ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    out.up = b(12) || ay < -0.6; out.down = b(13) || ay > 0.6; out.left = b(14) || ax < -0.6; out.right = b(15) || ax > 0.6;
    out.hold = b(0) || b(2);
  }
  const edges = [];
  for (const k of ['up', 'down', 'left', 'right']) if (out[k] && !prev[k]) edges.push(k);
  return { state: out, edges };
}

export default {
  id: 'exercise',

  async play(ctx) {
    const g = ctx.game, d = ctx.director, p = ctx.player, trick = ctx.trick, audio = ctx.audio, follow = g.follow;
    const qa = (typeof window !== 'undefined' && window.__STARLINE_QA__) || {};
    const touch = !!ctx.ui.touch;
    const undo = [];             // what the round changed, put back in reverse in the finally
    const people = [];
    let hud = null, still = null, props = null, joy = null, blobs = null;
    try {
      ctx.lock(true);
      ctx.hud(0, null);
      const routine = await chooseRoutine(ctx, qa, touch);
      if (!routine || ctx.quit) return { score: 0, quit: true };
      const seed = qa.seed || Math.floor(Math.random() * 2 ** 31) + 1;
      const plan = makeRoutine({ routine, level: ctx.level, first: ctx.first, seed });
      const S = new Session(plan, seed), cs = plan.count;
      const lang = getLang();

      // ---- who leads, who joins, and their moves (loaded now: nobody's file carries them)
      let lead = trick.instructor || 'rin';
      const joiners = [];
      if (ctx.level !== 'easy') joiners.push(['villager-kid', STAGE.kids[0], KID_TINT[0]], ['villager-kid', STAGE.kids[1], KID_TINT[1]]);
      if (ctx.level === 'hard') joiners.push(['villager-man', STAGE.adults[0], MAN_TINT[0]], ['villager-man', STAGE.adults[1], MAN_TINT[1]]);
      const models = [lead, ...new Set(joiners.map(j => j[0]))];
      const borrow = [lead, 'mika', ...models].some(m => !PACKS.includes(m));
      const packs = borrow ? PACKS.map(packName) : [...new Set(['mika', ...models].map(packName))];
      const [{ NPC }, { enterFocus, BlobShadows }] = await Promise.all([import('../../actors/npc.js'), import('../../engine/focus.js'), ctx.ensureModels([...models, ...packs])]);
      if (ctx.quit) return { score: 0, quit: true };
      if (!g.assets.has?.(lead)) { lead = 'rin'; await ctx.ensureModels(['rin', packName('rin')]); }     // (a model named but not there yet)
      const heights = {};
      for (const w of PACKS) { const gl = g.assets.gltf?.(packName(w)); if (gl) heights[w] = hipHeight(gl.scene); }
      const clipsFor = (model, root) => {
        const own = PACKS.includes(model) && g.assets.gltf?.(packName(model));
        if (own) return prepareMoves(own, root, own.scene, false);
        const who = closestPack(hipHeight(root), heights), gl = who && g.assets.gltf?.(packName(who));
        return gl ? prepareMoves(gl, root, gl.scene, true) : new Map();
      };

      // ---- the place: the class faces the instructor; f = that way, r = the class's right
      const st = trick.stage || { x: trick.place.x, z: trick.place.z, face: 0 };
      const f = new THREE.Vector3(Math.sin(st.face), 0, Math.cos(st.face)), r = new THREE.Vector3(-f.z, 0, f.x);
      const ground = (x, z) => g.world.heightAt(x, z);
      const spot = o => ({ x: st.x + f.x * o.f + r.x * o.r, z: st.z + f.z * o.f + r.z * o.r });
      const face = st.face, faceBack = st.face + Math.PI;

      // the real instructor and anybody else standing on the lawn step out of the picture for the round
      for (const n of Object.values(d.npcs || {})) {
        if (!n?.root || !n.root.visible || Math.hypot(n.pos.x - st.x, n.pos.z - st.z) > (n.id === lead ? 60 : 11)) continue;
        n.root.visible = false;
        n._exHidden = true;
        undo.push(() => { n._exHidden = false; n.root.visible = n.visible && !n.far; });
      }
      for (const sg of d.tricks?.signs || []) {
        if (Math.hypot(sg.at.x - st.x, sg.at.z - st.z) > 13 || sg.hidden) continue;
        sg.hidden = true; if (sg.obj) sg.obj.visible = false;
        undo.push(() => { sg.hidden = false; });
      }

      // ---- the people
      const I = spot(STAGE.instructor), P = STAGE.platform;
      const inst = stagePerson(NPC, g, 'ex-lead', lead, I, faceBack, null);
      if (inst) {
        inst.npc.place(I.x, I.z, faceBack, ground(I.x, I.z) + P.h);
        inst.give = lendClips(inst.anim, clipsFor(lead, inst.npc.model));
        inst.hat = hatOff(inst.npc.model);
        undo.push(inst.hat);
        inst.demo = true; inst.lag = 0;
        people.push(inst);
      }
      joiners.forEach(([model, o, seedTint], i) => {
        const at = spot(o), b = stagePerson(NPC, g, `ex-${i}`, model, at, face, seedTint);
        if (!b) return;
        b.give = lendClips(b.anim, clipsFor(model, b.npc.model));
        b.lag = LAG[(i + 1) % LAG.length];
        people.push(b);
      });
      // Mika in the front row
      const M = spot(STAGE.mika);
      p.teleport(M.x, M.z, undefined, face);
      p.vel.set(0, 0, 0);
      const mikaGive = lendClips(p.anim, clipsFor('mika', p.model));
      const pose0 = p.pose, speed0 = p.poseSpeed;
      undo.push(() => { mikaGive(); p.pose = pose0 || null; p.poseSpeed = speed0; p.root.rotation.z = 0; p.anim?.play?.('Idle', { fade: 0.2 }); });
      const mikaBody = { anim: p.anim, root: p.root, lag: 0, mika: true };

      // the lawn's long grass is trodden down where everybody stands (it would hide the feet and the mats)
      const G = spot(STAGE.grass), grassBack = trampleGrass(g.world, G.x, G.z, STAGE.grass.radius, STAGE.grass.radius + 3);
      if (grassBack) undo.push(grassBack);

      // ---- the props, the joy, the soft shadows
      const k = model => (model === 'villager-man' ? 1.19 : model === 'villager-kid' ? 0.83 : 1.03);
      const mats = routine === 'yoga' ? [
        { ...M, y: ground(M.x, M.z), fx: f.x, fz: f.z, k: 1 },
        ...people.map(b => ({ x: b.root.position.x, z: b.root.position.z, y: b.root.position.y, fx: b === inst ? -f.x : f.x, fz: b === inst ? -f.z : f.z, k: k(b.model) })),
      ] : [];
      props = makeProps(st, f, r, ground, routine === 'yoga', mats);
      g.scene.add(props.group);
      joy = new Joy();
      g.scene.add(joy.group);
      blobs = new BlobShadows(8);
      g.scene.add(blobs.mesh);
      const shadowsOf = [{ pos: p.root.position, r: 0.34, root: p.root }, ...people.filter(b => b !== inst).map(b => ({ pos: b.root.position, r: 0.32, root: b.root }))];

      // ---- the camera: behind the class, or beside it for the floor poses
      const shotFor = kind => {
        const c = kind === 'floor' ? STAGE.floorCamera : STAGE.camera, tall = innerHeight > innerWidth * 1.05;
        const back = tall ? 1.42 : 1;
        const lf = c.f * back, lr = c.r * back, up = c.up * (tall ? 1.25 : 1);
        const at = spot({ f: lf, r: lr }), look = spot({ f: c.look.f, r: tall ? 0 : c.look.r ?? 0 });
        return { pos: new THREE.Vector3(at.x, ground(M.x, M.z) + up, at.z), look: new THREE.Vector3(look.x, ground(M.x, M.z) + c.look.up, look.z) };
      };
      let camKind = 'stand', aspect = innerWidth / innerHeight;
      follow.cutscene(shotFor('stand'), 1.0);
      const focusKeep = () => [props.group, joy.group, blobs.mesh, p.root, ...people.map(b => b.root)];
      const enter = () => enterFocus(g, { keep: focusKeep(), sim: 'actors', actors: [], onFrame: () => { for (const w of shadowsOf) w.show = w.root.visible; blobs.set(shadowsOf, ground); } });
      let refocus = 0;            // frames until focus comes back (after the sky is retaken)

      // ---- the screen and the music
      hud = makeHud({ touch });
      // the teacher's words under the score (on an upright phone below the menu buttons, above the card)
      const hintAt = () => ctx.hintTop(true, innerWidth <= 560 ? 120 : innerHeight <= 480 ? 60 : 70);
      hintAt();
      audio.song?.(true);
      const style = routine === 'yoga' ? 'yoga' : routine === 'workout' ? 'workout' : 'radio';

      ctx.debug.exercise = { plan, session: S, routine, get T() { return T; }, get count() { return T / cs; } };
      let T = -1.2;               // a short breath before the first count
      let nextBeat = 0, lastItem = -1, lastMove = '', prevPad = {}, breathR = 0, tilt = 0, hourT = 9, waitT = 0;
      const said = new Set();
      const auto = qa.exAuto || null;

      const out = await ctx.loop(dt => {
        dt = Math.min(dt, 0.1);
        if (waitT < 1.2) { waitT += dt; if (waitT >= 1.1 && !still && !refocus) still = enter(); }
        T += dt;
        const c = T / cs;
        if (T >= plan.seconds) return { done: true };
        // the look: the morning sun climbs; on a phone the still picture is retaken at the talks
        if ((hourT += dt) > 0.5) { hourT = 0; ctx.setNight(true, HOUR0 + (HOUR1 - HOUR0) * Math.max(0, T) / plan.seconds); }
        if (refocus > 0 && --refocus === 0) still = enter();
        if (Math.abs(innerWidth / innerHeight - aspect) > 0.05) { aspect = innerWidth / innerHeight; follow.cutscene(shotFor(camKind), 0.001); hintAt(); }
        // the music: every count a little before it sounds
        while (nextBeat < plan.counts && nextBeat * cs < T + 0.2) {
          const when = nextBeat * cs - T;
          if (when > -0.04) {
            audio.exerciseBeat?.(style, nextBeat, Math.max(0, when), cs);
            const at = itemAt(plan, nextBeat + 0.01)?.item;
            if (style !== 'yoga' && at && (at.t === 'move' || at.t === 'combo' || at.t === 'hold')) audio.countVoice?.(((nextBeat - at.start) % 8) + 1, Math.max(0, when), lang, 0.045);
          }
          nextBeat++;
        }
        const found = itemAt(plan, Math.max(0, c));
        const it = found?.item;
        // ---- a new part of the routine
        if (found && found.index !== lastItem && c >= 0) {
          lastItem = found.index;
          if (it.say) ctx.hint(it.say, Math.max(3, it.n * cs + 0.5));
          const m = it.m || it.ms?.[0];
          const key = it.t === 'combo' ? it.ms.join('+') : m;
          if ((it.t === 'move' || it.t === 'combo' || it.t === 'hold' || it.t === 'breath') && key !== lastMove) {
            lastMove = key;
            const mv = MOVES[m], hint = it.t === 'combo' ? `${tx(MOVES[it.ms[0]].name)} + ${tx(MOVES[it.ms[1]].name)}!` : tx(mv.say);
            let extra = '';
            if (ctx.first || ctx.easy) {
              const kind = mv.kind === 'beat' ? mv.hits[0][1] : mv.kind;
              if (!said.has(kind)) { said.add(kind); extra = mv.kind === 'hold' ? tx(HOLD_HINT) : mv.kind === 'breath' ? tx(BREATH_HINT) : tx(KEY_HINT[kind]); }
            }
            ctx.hint(extra ? `${hint} ${extra}` : hint, Math.max(3.5, Math.min(7, it.n * cs)));
          }
          // to the floor and back up: a quick dip to black while the camera goes beside the class
          const toFloor = it.t === 'trans' && it.clip === 'ExDown' && !it.rev, toStand = found.index > 0 && plan.items[found.index - 1].t === 'trans' && plan.items[found.index - 1].clip === 'ExDown' && plan.items[found.index - 1].rev;
          if (toFloor || toStand) {
            camKind = toFloor ? 'floor' : 'stand';
            ctx.fade(true, 200).then(() => { if (!ctx.quit) { follow.cutscene(shotFor(camKind), 0.001); if (still?.active) still.recapture(); } return ctx.fade(false, 320); });
          }
          // a talk is a good moment to retake the still picture: the sun has climbed
          if (it.t === 'talk' && found.index > 0 && still?.active) { still.exit(); still = null; refocus = 3; }
        }
        // ---- input: keys, the touch buttons, a gamepad; or the QA autopilot
        const inp = ctx.input, gp = padState(prevPad);
        prevPad = gp.state;
        const presses = [];
        for (const key of ['up', 'down', 'left', 'right']) if (inp.pressed(key)) presses.push(key);
        if (inp.pressed('act') || inp.pressed('jump')) presses.push('tap');
        presses.push(...gp.edges, ...hud.pad.edges);
        hud.pad.edges.length = 0;
        let holding = inp.held('act') || inp.held('jump') || hud.pad.tap || gp.state.hold;
        let steer = (inp.held('right') || hud.pad.right || gp.state.right ? 1 : 0) - (inp.held('left') || hud.pad.left || gp.state.left ? 1 : 0);
        if (auto) {
          presses.length = 0; holding = false; steer = 0;
          if (auto === 'perfect') {
            for (let i = S.next; i < plan.cues.length; i++) { const q = plan.cues[i]; if (q.at * cs > T) break; if (!S.done.has(i)) presses.push(q.key); }
            holding = true; steer = Math.abs(S.bal.w) > 0.1 ? -Math.sign(S.bal.w) : 0;
            const b = plan.breaths.find(x => c >= x.from && c < x.to);
            if (b) holding = b.in.some(([a, e]) => c >= a && c < e);
          }
        }
        const inHoldOrBreath = it && (it.t === 'hold' || it.t === 'breath');
        for (const key of presses) {
          if (inHoldOrBreath && key !== 'tap') continue;
          const res = S.press(key, auto === 'perfect' ? (plan.cues[S.next]?.at ?? c) * cs : T);
          if (!res.result) continue;
          hud.pop(res.result);
          if (res.result === 'great' || res.result === 'good') {
            audio.tone?.(1180 + (res.result === 'great' ? 240 : 0), { type: 'sine', dur: 0.09, vol: 0.04, rev: 0.1 });
            if (S.streak && S.streak % 4 === 0) { const b = people[(S.streak / 4) % people.length]; if (b) joy.burst(new THREE.Vector3(b.root.position.x, b.root.position.y + (b.model === 'villager-kid' ? 1.3 : 1.85), b.root.position.z), 2); }
          }
        }
        const { missed, state } = S.tick(Math.max(0, T), T > 0 ? dt : 0, { hold: holding, steer });
        if (missed.length && !inHoldOrBreath) hud.pop('miss');
        // ---- the bodies follow the count
        if (state?.kind === 'breath') breathR = Math.min(1, Math.max(0, breathR + (holding ? 1 : -1) * dt / (2 * cs)));
        else breathR += (0 - breathR) * Math.min(1, dt * 3);
        for (const b of [mikaBody, ...people]) {
          const plain = it?.t === 'talk' && b === inst && b.anim?.has('Talk');
          const bc = plain ? { clip: 'Talk', t: (c - it.start) * cs } : bodyClip(plan, Math.max(0, c), cs, { demo: !!b.demo, lag: b.lag || 0, watchIdle: !b.demo, breathR: b.mika && state?.kind === 'breath' ? breathR : null });
          if (b.mika) { p.pose = bc.clip; p.poseSpeed = 1e-9; }
          const a = b.anim, clip = a?.clips?.get(bc.clip);
          if (!clip) continue;
          pose(b, bc.clip, bc.frac !== undefined ? bc.frac * clip.duration : bc.t, bc.fade);
          if (!b.mika) a.update(dt);
        }
        for (const b of people) if (b.npc.root.visible === false && b.npc.visible) b.npc.root.visible = true;
        for (const n of Object.values(d.npcs || {})) if (n?._exHidden && n.root.visible) n.root.visible = false;
        // Mika sways with the balance needle in a hold
        tilt += ((state?.kind === 'hold' ? -state.w * 0.07 : 0) - tilt) * Math.min(1, dt * 6);
        p.root.rotation.z = tilt;
        joy.update(dt);
        // ---- the screen
        ctx.hud(S.total(), Math.max(0, plan.seconds - Math.max(0, T)));
        drawHud(hud, plan, S, it, c, cs, T, ctx, state, breathR);
        return undefined;
      });
      if (out?.quit) return { score: 0, quit: true };

      // ---- the end: everybody cheers, then the card
      hud.card({ show: false });
      hud.hold(null); hud.breath(null);
      for (const b of [mikaBody, ...people]) { b.anim?.cancelOneShot?.(); if (b.anim?.has('Cheer')) { b.anim.play('Cheer', { fade: 0.25 }); b.anim.action('Cheer').timeScale = 1; } }
      p.pose = p.anim?.has('Cheer') ? 'Cheer' : null; p.poseSpeed = 1;
      for (const b of people) joy.burst(new THREE.Vector3(b.root.position.x, b.root.position.y + 1.6, b.root.position.z), 2);
      audio.fanfare?.();
      ctx.hint(TALK.bye, 2);
      await ctx.loop((() => { let w = 0; return dt => { w += dt; for (const b of people) b.anim?.update(dt); joy.update(dt); return w > 1.6 ? true : undefined; }; })());
      const sum = S.summary();
      let note = tx('{great} great, {good} good, {miss} missed', { great: sum.great, good: sum.good, miss: sum.miss });
      if (sum.steady !== null) note += ` · ${tx('steady {n}%', { n: sum.steady })}`;
      if (sum.breath !== null) note += ` · ${tx('breathing {n}%', { n: sum.breath })}`;
      return {
        score: sum.score, note, extra: ROUTINE_NAME[routine], fact: { title: tx(CULTURE.title), text: tx(CULTURE.text) },
        detail: { routine, seed, ...sum, units: plan.units, seconds: Math.round(plan.seconds) },
      };
    } finally {
      for (let i = undo.length - 1; i >= 0; i--) { try { undo[i](); } catch (e) { console.warn('[exercise] put back', e); } }
      try { still?.exit(); } catch { /* fine */ }
      hud?.destroy();
      for (const b of people) { try { b.dispose(); } catch (e) { console.warn('[exercise] person', e); } }
      props?.dispose(); joy?.dispose(); blobs?.dispose?.();
      audio.song?.(false);
      ctx.hintTop(false);
      follow.clearCutscene(true);
      ctx.lock(false);
      ctx.input.releaseAll?.();
    }
  },
};

/** The card, the count, the ring, the needle and the breathing circle for this frame. */
function drawHud(hud, plan, S, it, c, cs, T, ctx, state, breathR) {
  if (!it || c < 0) { hud.card({ show: false }); hud.count(0, 0, '', 0, 'full'); hud.hold(null); hud.breath(null); hud.want('', ''); return; }
  const local = c - it.start;
  const next = (() => { for (let i = S.next; i < plan.cues.length; i++) if (!S.done.has(i)) return plan.cues[i]; return null; })();
  const soon = next && next.at - c < 1.05 && next.at - c > -0.4 ? next : null;
  if (it.t === 'move' || it.t === 'combo') {
    const mv = moveAt(it, c), m = MOVES[mv.m];
    const mode = it.card || 'full';
    const show = mode === 'word' || (mode === 'full' && (ctx.easy || local < 4 || it.t === 'combo' && local % 4 < 2));
    const key = soon?.key || (m.hits?.[0]?.[1] ?? '');
    hud.card({ picName: m.pic, word: mode === 'word' && soon ? tx(KEY_WORD[soon.key]) : tx(m.name), key, flip: !!m.sides && key === 'right', mode, show });
    let hits = 0;
    const w0 = it.start + Math.floor(local / 8) * 8;
    for (const q of plan.cues) if (q.at >= w0 && q.at < w0 + 8) hits |= 1 << (q.at - w0);
    hud.count(Math.floor(local % 8) + 1, hits, soon ? soon.key : '', soon ? Math.min(1, Math.max(0, 1 - (soon.at - c))) : 0, mode);
    hud.want(mode === 'full' && soon ? soon.key : '', '');
  } else if (it.t === 'hold' || it.t === 'breath') {
    const m = MOVES[it.m];
    hud.card({ picName: m.pic, word: tx(m.name), key: '', flip: it.side === 'R', mode: 'full', show: true });
    hud.count(Math.floor(local % 8) + 1, 0, '', 0, 'full');
    hud.want('', it.t === 'hold' ? 'Hold' : 'Breathe');
  } else {
    hud.card({ show: false });
    hud.count(0, 0, '', 0, 'full');
    hud.want('', '');
  }
  hud.hold(state?.kind === 'hold' ? state : null);
  if (state?.kind === 'breath') {
    const fr = ((c - state.breath.from) % 2) / 2;
    hud.breath({ guide: state.in ? fr : 1 - fr, mine: breathR, inNow: state.in, ok: state.ok });
  } else hud.breath(null);
}
