// Stargazing (docs/RURAL-TRICKS.md trick 11): any clear night, on the hill behind the signal cottage. Mika lies back
// (a camera shot from her eyes; no clip needed) under a sky far richer than the city's: a starfield dome with the
// Milky Way. Join the seven stars of the Big Dipper in order, follow its two pointer stars to the North Star, then
// catch a shooting star and make a wish. Score: stars joined, the North Star, the wish, speed, minus wrong picks.
//
// Drawing: the dome is generated once (seeded) and reused: one Points draw call for ~5,000 static stars, one for the
// eight named stars (their glow is written each frame), one line set for the figure, one line for the shooting star.
import * as THREE from 'three';
import { N_ } from '../../i18n/i18n.js';

const R = 600;                         // dome radius around the camera (well inside the far plane)
const AZ = Math.PI;                    // Mika looks toward -z, out over the valley
const ELEV = 52 * Math.PI / 180;       // the centre of the view above the horizon
const CENTRE = [-8, 6.5];               // the view centre in the figure's own degrees (see NAMED)
// the Big Dipper and the North Star, in degrees on a small patch of sky (u right, v up). Merak -> Dubhe, five times
// over, reaches Polaris: the "pointer stars" rule.
// (drawn at 0.8 of the real spread so the whole figure and the North Star fit a phone held upright)
export const NAMED = {
  alkaid: [-17.6, -2], mizar: [-13.2, 0.8], alioth: [-9.6, -0.4], megrez: [-5.2, -1.2],
  phecda: [-4.8, -5.2], merak: [1.6, -4.3], dubhe: [1.6, 0], polaris: [1.6, 21.5],
};
export const DIPPER = ['alkaid', 'mizar', 'alioth', 'megrez', 'phecda', 'merak', 'dubhe'];
const NAMES = Object.keys(NAMED);
const LABEL = {
  alkaid: N_('Alkaid, the tip of the handle'), mizar: 'Mizar', alioth: 'Alioth', megrez: N_('Megrez, where the handle meets the bowl'),
  phecda: 'Phecda', merak: N_('Merak, a pointer star'), dubhe: N_('Dubhe, a pointer star'), polaris: N_('Polaris, the North Star'),
};

/**
 * The next star to pick in the Dipper, given those picked so far (either end may start). Returns the allowed ids.
 * Pure: tested in tests/tricks.test.mjs.
 */
export function nextStars(picked) {
  if (!picked.length) return [DIPPER[0], DIPPER[DIPPER.length - 1]];
  const order = picked[0] === DIPPER[0] ? DIPPER : [...DIPPER].reverse();
  return picked.length < order.length ? [order[picked.length]] : [];
}

/** Round score: 10 per Dipper star, 20 for the North Star, 15 for the wish, a speed bonus, 4 off per wrong pick. */
export function starScore({ joined = 0, polaris = false, wish = false, mistakes = 0, seconds = 99 }) {
  const speed = polaris ? Math.max(0, Math.round((45 - seconds) / 2)) : 0;
  return Math.max(0, joined * 10 + (polaris ? 20 : 0) + (wish ? 15 : 0) + speed - mistakes * 4);
}

// --------------------------------------------------------------------- the sky (built once)
const V3 = THREE.Vector3;
const basis = () => {
  const f = new V3(Math.cos(ELEV) * Math.sin(AZ), Math.sin(ELEV), Math.cos(ELEV) * Math.cos(AZ)).normalize();
  const r = new V3().crossVectors(f, new V3(0, 1, 0)).normalize();
  const u = new V3().crossVectors(r, f).normalize();
  return { f, r, u };
};
/** Direction of a figure point (degrees on the patch) as a unit vector. */
function dirOf([u, v], B = basis()) {
  const du = THREE.MathUtils.degToRad(u - CENTRE[0]), dv = THREE.MathUtils.degToRad(v - CENTRE[1]);
  return B.f.clone().addScaledVector(B.r, Math.tan(du)).addScaledVector(B.u, Math.tan(dv)).normalize();
}

const STAR_VERT = `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
uniform float uTime;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.82 + 0.18 * sin(uTime * (1.3 + fract(position.x * 0.13) * 3.0) + position.z);
  gl_PointSize = aSize * uScale;
  vColor = aColor * tw;
}`;
const STAR_FRAG = `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor, a * a);
}`;

let SKY = null;
function buildSky() {
  if (SKY) return SKY;
  let seed = 20261009;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pos = [], size = [], col = [];
  const add = (d, s, c) => { pos.push(d.x * R, d.y * R, d.z * R); size.push(s); col.push(...c); };
  const tint = () => { const k = rand(); return k < 0.15 ? [0.75, 0.85, 1] : k < 0.25 ? [1, 0.85, 0.65] : [1, 1, 0.95]; };
  // the field: many faint stars, a few bright ones
  for (let i = 0; i < 2600; i++) {
    const y = rand() * 1.08 - 0.08, a = rand() * Math.PI * 2, h = Math.sqrt(1 - y * y);
    const m = Math.pow(rand(), 7);
    const c = tint(), b = 0.35 + m * 0.9;
    add(new V3(Math.cos(a) * h, y, Math.sin(a) * h), 0.0035 + m * 0.006, c.map(x => x * b));
  }
  // the Milky Way: a soft band of tiny dim stars along a tilted great circle, thicker in the middle
  const n = new V3(0.55, 0.42, 0.72).normalize(), e1 = new V3().crossVectors(n, new V3(0, 1, 0)).normalize(), e2 = new V3().crossVectors(n, e1);
  for (let i = 0; i < 4200; i++) {
    const th = rand() * Math.PI * 2;
    const gauss = (rand() + rand() + rand() - 1.5) * (0.12 + 0.08 * Math.cos(th * 2));
    const d = e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th)).addScaledVector(n, gauss).normalize();
    if (d.y < -0.08) continue;
    const b = 0.22 + rand() * 0.38;
    add(d, 0.0032 + rand() * 0.0035, [0.8 * b, 0.86 * b, 1 * b]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  const mat = () => new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { uScale: { value: 300 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const field = new THREE.Points(geo, mat());
  field.frustumCulled = false;
  // the named stars: their own small set, so their glow can pulse
  const B = basis();
  const dirs = NAMES.map(k => dirOf(NAMED[k], B));
  const ngeo = new THREE.BufferGeometry();
  ngeo.setAttribute('position', new THREE.Float32BufferAttribute(dirs.flatMap(d => [d.x * R, d.y * R, d.z * R]), 3));
  ngeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(NAMES.length), 1).setUsage(THREE.DynamicDrawUsage));
  ngeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(NAMES.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const named = new THREE.Points(ngeo, mat());
  named.frustumCulled = false;
  named.renderOrder = 6;
  // the figure lines (drawn as Mika joins the stars) and the pointer guide
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  lgeo.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  lines.frustumCulled = false;
  lines.renderOrder = 6;
  // the shooting star: a two-point line, bright head, dark (= invisible, additive) tail
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
  sgeo.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 0.92, 0, 0, 0], 3));
  const shoot = new THREE.Line(sgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  shoot.frustumCulled = false;
  shoot.visible = false;
  const group = new THREE.Group();
  group.add(field, named, lines, shoot);
  group.name = 'stargazing-dome';
  SKY = { group, field, named, lines, shoot, dirs, B };
  return SKY;
}

export default {
  id: 'stars',

  async play(ctx) {
    const { game: g, player: p, audio, fx } = ctx;
    const cam = g.camera, sky = buildSky();
    const st = { picked: [], polaris: false, wish: false, mistakes: 0, phase: 'dipper', tPolaris: 0, shots: 0 };
    let left = ctx.roundTime;

    // lie back on the hill: a fade, the night, and the view from Mika's eyes up into the sky
    ctx.lock(true);
    await ctx.fade(true, 400);
    ctx.setNight(true, 23);
    const eye = p.pos.clone().add(new V3(0, 0.55, 0));
    const look = eye.clone().addScaledVector(sky.B.f, 10);
    g.follow.cutscene({ pos: eye, look }, 0.001, { pos: eye.clone(), look: look.clone() });
    const rootWas = p.root.visible;
    p.root.visible = false;
    const tamoWas = ctx.director.tamo?.root?.visible;
    if (ctx.director.tamo?.root) ctx.director.tamo.root.visible = false;
    g.scene.add(sky.group);
    sky.lines.geometry.setDrawRange(0, 0);
    await ctx.wait(0.2);
    await ctx.fade(false, 700);

    // the ring Mika points with: stick / WASD moves it, the mouse hovers it, a tap or click puts it there and picks
    const ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;border:3px solid rgba(255,226,140,.95);border-radius:50%;box-shadow:0 0 12px rgba(255,220,120,.6),inset 0 0 8px rgba(255,220,120,.4);pointer-events:none;z-index:14;transition:border-color .2s';
    document.body.appendChild(ring);
    let rx = innerWidth / 2, ry = innerHeight / 2, pick = false, shake = 0;
    const canvas = g.canvas || g.renderer.renderer.domElement;
    const onMove = e => { if (e.pointerType === 'mouse') { rx = e.clientX; ry = e.clientY; } };
    // anywhere on screen except the buttons (pause, journal): the hint and HUD let clicks through
    const onDown = e => { if (e.target.closest?.('button, a, input, select, .overlay')) return; rx = e.clientX; ry = e.clientY; pick = true; };
    ctx.hintTop(true);
    canvas.addEventListener('pointermove', onMove);
    addEventListener('pointerdown', onDown);

    const tmp = new V3();
    const screenOf = (d, out) => { tmp.copy(d).multiplyScalar(R).add(sky.group.position).project(cam); out.x = (tmp.x * 0.5 + 0.5) * innerWidth; out.y = (-tmp.y * 0.5 + 0.5) * innerHeight; out.z = tmp.z; return out; };
    const scr = NAMES.map(() => ({ x: 0, y: 0, z: 0 }));
    const thr = ctx.ui.touch ? 58 : 44;
    const nearest = () => {
      let best = null, bd = thr;
      NAMES.forEach((k, i) => { const s = scr[i]; if (s.z > 1) return; const d = Math.hypot(s.x - rx, s.y - ry); if (d < bd) { bd = d; best = k; } });
      return best;
    };
    const linePos = sky.lines.geometry.attributes.position;
    const segment = (a, b, idx) => {
      const da = sky.dirs[NAMES.indexOf(a)], db = typeof b === 'string' ? sky.dirs[NAMES.indexOf(b)] : b;
      linePos.setXYZ(idx * 2, da.x * R * 0.99, da.y * R * 0.99, da.z * R * 0.99);
      linePos.setXYZ(idx * 2 + 1, db.x * R * 0.99, db.y * R * 0.99, db.z * R * 0.99);
      linePos.needsUpdate = true;
      sky.lines.geometry.setDrawRange(0, Math.max(sky.lines.geometry.drawRange.count, idx * 2 + 2));
    };
    const guide = () => {
      // the pointer stars' line, carried on past Dubhe: all the way in the guided try, a third of the way otherwise
      const d = sky.dirs[NAMES.indexOf('dubhe')], pz = sky.dirs[NAMES.indexOf('polaris')];
      const end = d.clone().lerp(pz, ctx.first ? 0.9 : 0.35).normalize();
      segment('dubhe', end, 7);
    };

    if (ctx.first) {
      ctx.hint(N_('See the pale band across the sky? The Milky Way: billions of stars, too far away to see one by one.'), 5.5);
      await ctx.wait(5.2);
    }
    ctx.hint(ctx.ui.touch ? N_('Find the Big Dipper: seven bright stars like a ladle. Tap them in order, from either end.')
      : N_('Find the Big Dipper: seven bright stars like a ladle. Point with the mouse or WASD, click or press {act} on each, in order.'), 6);

    ctx.debug.named = () => NAMES.map((k, i) => ({ k, x: scr[i].x, y: scr[i].y }));
    ctx.debug.phase = () => st.phase;
    ctx.debug.shooting = () => shootT >= 0 && shootT < 1.2;
    const sizes = sky.named.geometry.attributes.aSize, cols = sky.named.geometry.attributes.aColor;
    let shootT = -1, shootWait = 1.2, wishTries = 0, wrongHint = 0, elapsed = 0;
    const sA = new V3(), sB = new V3(), head = new V3(), tail = new V3();
    const res = await ctx.loop(dt => {
      elapsed += dt;
      if (st.phase !== 'wish') left -= dt;
      sky.group.position.copy(cam.position);
      const scale = (g.renderer.renderer.domElement.height || innerHeight) * 0.5 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / R;
      sky.field.material.uniforms.uScale.value = scale * R * 0.9;
      sky.named.material.uniforms.uScale.value = scale * R * 0.9;
      sky.field.material.uniforms.uTime.value = ctx.t;
      sky.named.material.uniforms.uTime.value = ctx.t;
      // the ring: stick and keys move it
      const mv = g.input.move, sp = Math.min(innerWidth, innerHeight) * 0.75;
      rx = THREE.MathUtils.clamp(rx + mv.x * sp * dt, 10, innerWidth - 10);
      ry = THREE.MathUtils.clamp(ry - mv.y * sp * dt, 10, innerHeight - 10);
      shake = Math.max(0, shake - dt);
      const sx = shake > 0 ? Math.sin(shake * 60) * 8 : 0;
      ring.style.transform = `translate(${Math.round(rx + sx)}px, ${Math.round(ry)}px)`;
      NAMES.forEach((k, i) => screenOf(sky.dirs[i], scr[i]));
      // the named stars: bright, the picked ones golden, the next one pulsing in the guided try
      const next = st.phase === 'dipper' ? nextStars(st.picked) : st.phase === 'polaris' ? ['polaris'] : [];
      NAMES.forEach((k, i) => {
        const on = st.picked.includes(k) || (k === 'polaris' && st.polaris);
        const hintMe = (ctx.first || wrongHint > 2) && next.includes(k) && !(k === 'polaris' && !ctx.first && elapsed - st.tPolaris < 10);
        const pulse = hintMe ? 0.5 + 0.5 * Math.sin(ctx.t * 6) : 0;
        sizes.setX(i, (k === 'polaris' ? 0.026 : 0.024) * (on ? 1.3 : 1) * (1 + pulse * 0.6));
        const c = on ? [1.4, 1.15, 0.55] : [1.05 + pulse * 0.4, 1.05 + pulse * 0.3, 1.1];
        cols.setXYZ(i, ...c);
      });
      sizes.needsUpdate = true; cols.needsUpdate = true;
      ring.style.borderColor = nearest() ? 'rgba(255,240,170,1)' : 'rgba(255,226,140,.6)';

      const press = pick || ctx.pressed() || g.input.pressed('jump');
      pick = false;
      if (st.phase === 'dipper' || st.phase === 'polaris') {
        if (press) {
          const k = nearest();
          if (k && next.includes(k)) {
            audio.twinkle(2); audio.blip(1 + st.picked.length * 0.12);
            fx.twinkle?.(sky.dirs[NAMES.indexOf(k)].clone().multiplyScalar(30).add(cam.position));
            if (st.phase === 'dipper') {
              if (st.picked.length) segment(st.picked[st.picked.length - 1], k, st.picked.length - 1);
              st.picked.push(k);
              wrongHint = 0;
              if (ctx.first && st.picked.length < DIPPER.length) ctx.hint(LABEL[k], 2.5);
              if (st.picked.length === DIPPER.length) {
                st.phase = 'polaris'; st.tPolaris = elapsed;
                audio.good();
                ctx.hint(N_('The Big Dipper! Now follow the two stars at the end of the bowl, about five times their gap, to the North Star.'), 6);
                guide();
              }
            } else {
              st.polaris = true; st.phase = 'wish'; st.tPolaris = elapsed;
              segment('dubhe', 'polaris', 7);
              audio.star();
              ctx.hint(N_('Polaris, the North Star. It hardly moves all night, so travellers always knew where north was.'), 5.5);
              shootWait = 3.5;
            }
          } else if (k || st.phase === 'dipper') {
            st.mistakes++; wrongHint++; shake = 0.3;
            audio.bad();
            if (wrongHint === 1 || wrongHint === 3) ctx.hint(st.phase === 'polaris' ? N_('Further along the pointer line. The North Star sits on its own.')
              : st.picked.length ? N_('Not that one. The next star along the ladle.') : N_('Start at either end: the tip of the handle or the edge of the bowl.'), 3.5);
          }
        }
      } else if (st.phase === 'wish') {
        // a shooting star crosses the sky; press while it streaks to make a wish (three chances)
        if (shootT < 0) {
          shootWait -= dt;
          if (shootWait <= 0) {
            shootT = 0; wishTries++;
            if (wishTries === 1) ctx.hint(N_('Look! A shooting star! Quick, press to make a wish!'), 3);
            sA.copy(dirOf([-26 + Math.random() * 10, 18 + Math.random() * 8], sky.B));
            sB.copy(dirOf([-2 + Math.random() * 10, 2 + Math.random() * 6], sky.B));
            sky.shoot.visible = true;
            audio.twinkle(1.5);
          }
        } else {
          shootT += dt;
          const k = Math.min(1, shootT / 1.15);
          head.copy(sA).lerp(sB, k).normalize().multiplyScalar(R * 0.98);
          tail.copy(sA).lerp(sB, Math.max(0, k - 0.22)).normalize().multiplyScalar(R * 0.98);
          const sp2 = sky.shoot.geometry.attributes.position;
          sp2.setXYZ(0, head.x, head.y, head.z); sp2.setXYZ(1, tail.x, tail.y, tail.z); sp2.needsUpdate = true;
          if (press && shootT < 1.55) {
            st.wish = true; sky.shoot.visible = false;
            audio.star(); fx.burst?.(head.clone().normalize().multiplyScalar(30).add(cam.position), { n: 30, color: [1, 0.95, 0.6], speed: 2, size: 0.3, gravity: 0 });
            ctx.hint(N_('Wish made. Don\'t tell anyone, or it won\'t come true.'), 3.5);
            return { done: true };
          }
          if (shootT > 1.6) {
            shootT = -1; sky.shoot.visible = false; shootWait = 2.2;
            if (wishTries >= 3) { ctx.hint(N_('Too quick for a wish tonight. There will be others.'), 3.5); return { done: true }; }
            ctx.hint(N_('Missed it! Keep watching, they come in showers.'), 2.5);
          }
        }
      }
      const score = starScore({ joined: st.picked.length, polaris: st.polaris, wish: st.wish, mistakes: st.mistakes, seconds: st.tPolaris });
      ctx.hud(score, st.phase === 'wish' ? null : left);
      if (left <= 0) { ctx.hint(N_('Time to head in. The stars will still be here tomorrow.'), 3.5); return { done: true }; }
      return undefined;
    });

    const score = starScore({ joined: st.picked.length, polaris: st.polaris, wish: st.wish, mistakes: st.mistakes, seconds: st.tPolaris });
    if (!res.quit) await ctx.wait(1.6);
    // sit up: back to the valley
    await ctx.fade(true, 400);
    canvas.removeEventListener('pointermove', onMove);
    removeEventListener('pointerdown', onDown);
    ring.remove();
    sky.shoot.visible = false;
    sky.group.removeFromParent();
    p.root.visible = rootWas;
    if (ctx.director.tamo?.root && tamoWas !== undefined) ctx.director.tamo.root.visible = tamoWas;
    ctx.setNight(false);
    g.follow.clearCutscene(true);
    ctx.lock(false);
    await ctx.fade(false, 500);
    return { score, quit: !!res.quit && !st.picked.length, extra: st.wish ? N_('a wish made') : undefined };
  },
};
