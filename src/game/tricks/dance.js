// Festival dance: an evening dance lesson on the Takamori square, in front of the bell tower. Two dances on one card:
//   * the hat dance (múa nón) with Hoa, Hana's grown-up daughter: she dances a line, Mika copies it on the beat (and on
//     Normal / Difficult two village kids join the class); the paper lanterns over the square burn brighter as she dances
//     well, and the watching villagers clap;
//   * the K-pop stage with Hoa's friends from dance school in Seoul: Nabi leads (Haru beside her on Normal / Difficult),
//     Byeol sings, Mika dances on the stage and the watchers wave light sticks.
// The rules (sequences, beats, judging, score) are pure and Node-tested in ./rules-dance.js; this file draws them: the set
// (lanterns or the stage, built in code), the dancers (the art's models, or stand-ins until they land), the tune
// (Audio.danceBeat), the cards, the buttons and the swipes.
//
// The art contract (art/CONTRACTS.md, the lead's models; every file is optional, a missing one falls back):
//   performers  hoa (stand-in hana), nabi (villager-woman), byeol (villager-woman), haru (villager-man)
//   clip files  mika-dance, villager-kid-dance, villager-woman-dance, villager-man-dance: their clips are added to the
//               dancer's Animator for the round (addClips) and taken away again (dropClips)
//   props       non-la, mic, light-stick on the grip_R bone, placed by DANCE_GRIP
//   wardrobe    src/content/performers.js (the looks) and src/engine/wardrobe.js (applyLook on a performer's clone)
// Clip timing: authored at 90 BPM, a move clip spans two beats with its accent half a beat in; a demonstrator's clip
// starts half a beat before the beat (clipLead), Mika's starts on the press (a little way in, so the accent comes quickly).
//
// The camera stands still for the whole song, so the round runs in focus mode (engine/focus.js): the valley is one still
// picture and only the dancers, the crowd and the set are drawn, with blob shadows under the people. Everything the round
// adds (people, props, set, focus, tune, input hooks, page parts, clips on Mika) is taken away in `finally`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { N_, tx } from '../../i18n/i18n.js';
import { CAST } from '../story.js';
import { NPC } from '../../actors/npc.js';
import { enterFocus, BlobShadows } from '../../engine/focus.js';
import { addCss, disposeRigs } from './util.js';
import { MOVES, slotsOf, DanceRound, clipSpeed, clipLead, botPress, rng, FINISH } from './rules-dance.js';
import { cleanLooks } from '../../content/tricks.js';
import { PERFORMERS as LOOK_TABLE, lookOf as performerLook } from '../../content/performers.js';
import { applyLook, polish } from '../../engine/wardrobe.js';
import { peopleFile } from '../../engine/people.js';

// ------------------------------------------------------------------------------------------------ places and people
/** The middle of the dance floor. Everybody faces +z (south), where the camera stands; the bell tower is behind them. */
export const SPOT = Object.freeze({ x: 115, z: 9.2 });
/** Where Hoa waits by the sign between rounds (the sign itself: content/tricks.js). */
export const HOA_HOME = Object.freeze({ x: 120.6, z: 10.2 });
const LEAD = { festival: 'hoa', kpop: 'nabi' };
// a performer's own model, then the stand-in the game uses until it lands
const MODEL = { hoa: ['hoa', 'hana'], nabi: ['nabi', 'villager-woman'], byeol: ['byeol', 'villager-woman'], haru: ['haru', 'villager-man'] };
const CLIP_FILE = { mika: 'mika-dance', kid: 'villager-kid-dance', woman: 'villager-woman-dance', man: 'villager-man-dance' };
// the stand-ins wear the performer's colours (a performer's own model brings its own clothes)
const STAND_IN = {
  nabi: { 'Villager shirt': '#e0458f', 'Villager trousers': '#2a2a3a', 'Villager hair': '#1a1a1a' },
  byeol: { 'Villager shirt': '#a95bd6', 'Villager trousers': '#f2f0f6', 'Villager hair': '#4a3020' },
  haru: { 'Villager shirt': '#3f7ad8', 'Villager trousers': '#1f2430', 'Villager hair': '#1a1a1a' },
};

/**
 * How a prop sits on the grip_R bone (+Y along the fingers, +X the palm normal): p position (m), r Euler XYZ (rad), s
 * scale. The props are modelled in grip_R space (art: identity on the bone; the hat 0.8 for Mika, 0.7 for a kid), so
 * these start at identity; corrections from the art review go here. A missing prop file is simply not shown.
 */
export const DANCE_GRIP = {
  'non-la': { hoa: { p: [0, 0, 0], r: [0, 0, 0], s: 1 }, mika: { p: [0, 0, 0], r: [0, 0, 0], s: 0.8 }, kid: { p: [0, 0, 0], r: [0, 0, 0], s: 0.7 } },
  mic: { byeol: { p: [0, 0, 0], r: [0, 0, 0], s: 1 } },
  'light-stick': { man: { p: [0, 0, 0], r: [0, 0, 0], s: 1 }, woman: { p: [0, 0, 0], r: [0, 0, 0], s: 1 }, kid: { p: [0, 0, 0], r: [0, 0, 0], s: 0.7 } },
};

// the clips a stand-in plays for a move it does not have, first one it has wins; the idles likewise
const FALLBACK = {
  SweepL: ['Wave'], SweepR: ['Wave'], FanUp: ['Cheer', 'Jump'], Turn: ['Interact', 'Wave'], HatTilt: ['Talk', 'Wave'], Flourish: ['Cheer'], DanceBow: ['Bow', 'Interact'],
  SideL: ['Wave'], SideR: ['Wave'], JumpClap: ['Jump', 'Cheer'], Spin: ['Interact', 'Wave'], PointStep: ['Point', 'Throw', 'Wave'], HeartHands: ['Cheer'], CrowdWave: ['Wave'],
  PowerPose: ['Cheer'], SlideL: ['Kick', 'Wave'], SlideR: ['Kick', 'Wave'], SingReach: ['Wave', 'Talk'], MicRaise: ['Cheer'], Bow: ['Bow', 'Wave'], Cheer: ['Cheer', 'Wave'],
};
const IDLE_FALLBACK = { DanceIdle: ['Idle'], KpopIdle: ['Idle'], SingIdle: ['Talk', 'Idle'], Clap: ['Cheer', 'Idle'], StickWave: ['Wave', 'Idle'], Idle: ['Idle'] };
// what a stand-in clip cannot show by itself the body does: a step to the side (- toward the screen's left), a hop, a turn
const PROC = { SweepL: 'sway+', SweepR: 'sway-', SideL: 'sway+', SideR: 'sway-', SlideL: 'sway+', SlideR: 'sway-', FanUp: 'hop', JumpClap: 'hop', Flourish: 'hop',
  Turn: 'spin', Spin: 'spin', HatTilt: 'lean', DanceBow: 'bow', PointStep: 'hop', HeartHands: 'hop', PowerPose: 'hop', CrowdWave: 'lean' };
// Haru's own versions (his set has no HeartHands; he slides where the others side-step, in the free-style chorus)
const HARU = { HeartHands: 'PowerPose' };
const HARU_CHORUS = { SideL: 'SlideL', SideR: 'SlideR' };

const clamp = THREE.MathUtils.clamp, smooth = k => k * k * (3 - 2 * k);
/** 0 → 1 → 0 over a move: up by its accent (a quarter of the way), held, then back to the ready pose. */
const envelope = p => (p < 0.25 ? smooth(p / 0.25) : p < 0.6 ? 1 : 1 - smooth((p - 0.6) / 0.4));

/** The looks of a performer (content/performers.js) and the one to wear: the wanted id, else the default. */
const looksOf = id => LOOK_TABLE[id];
const lookOf = (id, want) => performerLook(id, want);

// ------------------------------------------------------------------------------------------------ pictures
const INK = '#5a3a22', HOT = '#f08a3c', SUN = '#ffd23f', PINK = '#e0458f';
const ICON = {
  left: `<path d="M19 12H6m5-6-6 6 6 6" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  right: `<path d="M5 12h13m-5-6 6 6-6 6" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  up: `<path d="M5 10 12 3l7 7z" fill="${SUN}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 21v-8m-4 3 4-4 4 4" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  turn: `<path d="M18.5 9A7 7 0 1 0 19 14" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/><path d="M14.5 9h4.5V4.5" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  hands: `<path d="M7 21v-7l-3-6m3 6 2-9m6 16v-7l3-6m-3 6-2-9" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="6" r="1.6" fill="${HOT}"/>`,
  tilt: `<path d="M4 15 14 4l6 11z" fill="${SUN}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" transform="rotate(-18 12 12)"/><path d="M6 20h12" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  bow: `<circle cx="16" cy="9" r="2.6" fill="${INK}"/><path d="M14 11 8 13v8m0-8 6 3m-6-3-3 2" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  clap: `<path d="M8 20l-2-7 3-5 4 3m-1 9 4-7-1-6-4 2" fill="none" stroke="${INK}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 3l1 2m3 1-2 1m0 4-2-1" stroke="${HOT}" stroke-width="2" stroke-linecap="round"/>`,
  spin: `<path d="M18.5 9A7 7 0 1 0 19 14" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/><path d="M14.5 9h4.5V4.5" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 9.5l.8 1.7 1.8.2-1.3 1.2.4 1.8-1.7-.9-1.7.9.4-1.8-1.3-1.2 1.8-.2z" fill="${HOT}"/>`,
  point: `<path d="M3 11h11m0 0-3-3m3 3-3 3" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 7v10m0-10 3 2v6l-3 2" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  wave: `<path d="M9 21v-6L6 9m3 6 1-9 2 8 1-7 2 7 1-5 2 6-3 7H9" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 5c1-2 2-2 3-1M20 4c1 0 2 1 2 2" stroke="${HOT}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  heart: `<path d="M12 20s-8-5-8-11a4.2 4.2 0 0 1 8-1.8A4.2 4.2 0 0 1 20 9c0 6-8 11-8 11z" fill="${PINK}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`,
  her: `<circle cx="12" cy="6" r="3" fill="${INK}"/><path d="M12 9v7m0-4-5-3m5 3 5-3m-5 7-3 5m3-5 3 5" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M2 12h3m14 0h3" stroke="${HOT}" stroke-width="2.4" stroke-linecap="round"/>`,
  free: `<path d="M12 3l2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 16l-5.2 2.9L8 13.1l-4.4-4 5.9-.7z" fill="${SUN}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`,
  ask: `<text x="12" y="17.5" text-anchor="middle" font-family="Fredoka,Nunito,sans-serif" font-weight="600" font-size="16" fill="#b08a5a">?</text>`,
  hat: `<path d="M3 15 12 4l9 11z" fill="${SUN}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 18h14" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><path d="M8 15h8" stroke="#d9483b" stroke-width="2"/>`,
  star: `<path d="M12 2.5l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.4l-5.6 3.1 1.3-6.2L3 9l6.3-.7z" fill="${PINK}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><path d="M19 3l.6 1.4M21.5 6l-1.4.4" stroke="${HOT}" stroke-width="1.6" stroke-linecap="round"/>`,
};
const svg = (name, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICON[name] || ''}</svg>`;
const KEYS = ['←', '→', '↑', '↓', 'Space', 'Q', 'R'];
// the buttons are laid out as the keys sit: left, up, down, right, then the three extra moves
const BTN_ORDER = [0, 2, 3, 1, 4, 5, 6];

const CSS = `
body.dance-round #trickHint,body.dance-round #touch,body.dance-round .bark{display:none!important}
body.dance-round #trickHud{top:calc(10px + env(safe-area-inset-top,0px))}
body.dance-pick #touch{display:none!important}
body.dance-pick #minigameStop{top:auto!important;bottom:calc(14px + env(safe-area-inset-bottom,0px))!important}
#danceCard{position:fixed;left:50%;top:calc(64px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;display:flex;align-items:center;gap:10px;
 width:min(430px,calc(100vw - 20px));box-sizing:border-box;padding:7px 12px 7px 7px;border-radius:22px;background:rgba(255,248,234,.95);box-shadow:0 6px 20px rgba(40,20,0,.25);
 font:700 14px Nunito,system-ui,sans-serif;color:#4a3020;zoom:var(--ui-scale,1);pointer-events:none;transition:background .2s}
#danceCard.hidden,#danceBtns.hidden{display:none}
#danceCard .ring{position:relative;flex:none;width:66px;height:66px}
#danceCard .ring .ic{position:absolute;inset:7px;border-radius:50%;background:#ffe9b8;display:flex;align-items:center;justify-content:center}
#danceCard .ring .ic svg{width:34px;height:34px}
#danceCard .ring .cl{position:absolute;inset:3px;border-radius:50%;border:4px solid #f08a3c;opacity:0;will-change:transform,opacity}
#danceCard .ring .cl.go{border-color:#3fae4a}
#danceCard .txt{flex:1;min-width:0}
#danceCard .who{font-size:13px;line-height:1.25;color:#8a6a4a;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
#danceCard .who b{color:#c2541c;margin-right:4px}
#danceCard .word{font:600 23px/1.15 Fredoka,Nunito,sans-serif;color:#7a3e16;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:1.15em}
#danceCard .strip{display:flex;gap:4px;margin-top:3px;min-height:24px}
#danceCard .strip i{flex:none;width:24px;height:24px;border-radius:7px;background:#f4e3c2;display:flex;align-items:center;justify-content:center}
#danceCard .strip i svg{width:18px;height:18px}
#danceCard .strip i.now{box-shadow:0 0 0 2px #f08a3c;background:#fff}
#danceCard .strip i.ok{background:#cdeec0}
#danceCard .strip i.bad{background:#f6d0c2}
#danceCard .beats{flex:none;display:flex;flex-direction:column;gap:5px}
#danceCard .beats u{display:block;width:10px;height:10px;border-radius:50%;background:#ecd9b4}
#danceCard .beats u.on{background:#f08a3c}
#danceCard.her .ic{background:#ffd5e5}
#danceCard.her .word{color:#c0306f}
#danceCard.free .ic{background:#fff2a8}
#danceCard.copy{background:rgba(236,250,228,.96)}
#danceBtns{position:fixed;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:16;display:flex;gap:5px;zoom:var(--ui-scale,1)}
#danceBtns button{all:unset;box-sizing:border-box;position:relative;width:min(74px,calc((100vw - 24px - (var(--n) - 1) * 5px) / var(--n)));min-width:44px;height:62px;border-radius:16px;
 background:rgba(255,248,234,.96);box-shadow:0 4px 0 #d9bd85,0 6px 14px rgba(40,20,0,.22);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
 color:#5a3a22;font:700 12px/1.1 Nunito,system-ui,sans-serif;cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
#danceBtns button svg{width:27px;height:27px;flex:none}
#danceBtns button span{max-width:100%;padding:0 3px;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#danceBtns button kbd{position:absolute;top:2px;right:4px;font:700 11px/1 Nunito,sans-serif;color:#b08a5a}
#danceBtns.touch button kbd{display:none}
#danceBtns button.down{transform:translateY(3px);box-shadow:0 1px 0 #d9bd85,0 3px 8px rgba(40,20,0,.2);background:#fff}
#danceBtns button.cue{box-shadow:0 4px 0 #f08a3c,0 0 0 3px #f08a3c}
.dancePop{position:fixed;z-index:16;left:0;top:0;pointer-events:none;font:600 26px Fredoka,Nunito,sans-serif;color:#fff;text-shadow:0 2px 0 #b8581a,0 0 8px #b8581a;opacity:0;white-space:nowrap;will-change:transform,opacity}
.dancePop.perfect{color:#ffe169;font-size:30px}
.dancePop.good{color:#e9ffd9;text-shadow:0 2px 0 #2f7a3a,0 0 8px #2f7a3a}
.dancePop.miss{color:#f1e6dc;font-size:22px;text-shadow:0 2px 0 #7a6a58,0 0 6px #7a6a58}
.dancePop.note{font-size:20px;color:#fff6c9;text-shadow:0 2px 0 #2f7a3a,0 0 8px #2f7a3a}
.dancePop.go{animation:dancePop .75s ease-out both}
.dancePop.note.go{animation:dancePop 1.5s ease-out both}
@keyframes dancePop{0%{opacity:0;transform:translate(-50%,-6px) scale(.6)}20%{opacity:1;transform:translate(-50%,-30px) scale(1.12)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-70px) scale(1)}}
#danceStage{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(10,14,30,.35);padding:10px;box-sizing:border-box}
#danceStage .box{width:min(520px,96vw);max-height:calc(100dvh - 20px);overflow:auto;padding:14px 16px 12px;border-radius:24px;background:#fff8ea;box-shadow:0 14px 40px rgba(0,0,0,.35);
 font:700 15px Nunito,system-ui,sans-serif;color:#4a3020;text-align:center;zoom:var(--ui-scale,1);box-sizing:border-box}
#danceStage h2{margin:0 0 8px;font:600 22px Fredoka,Nunito,sans-serif;color:#7a3e16;display:flex;align-items:center;justify-content:center;gap:10px}
#danceStage h2 img{width:38px;height:38px;border-radius:50%;background:#ffe9b8}
#danceStage h3{margin:12px 0 6px;font:700 14px Nunito,sans-serif;color:#8a6a4a}
#danceStage .row{display:flex;gap:8px;border-radius:20px;padding:3px}
#danceStage .row.cur{outline:3px solid #2f8ad8;outline-offset:1px}
#danceStage button{all:unset;box-sizing:border-box;flex:1 1 0;min-width:0;min-height:48px;border-radius:18px;padding:8px 6px;cursor:pointer;background:#f4dfb5;color:#5a3a22;
 box-shadow:0 4px 0 #d9bd85;-webkit-tap-highlight-color:transparent;touch-action:manipulation;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center}
#danceStage button.sel{background:#ffe9b8;box-shadow:0 4px 0 #f08a3c,0 0 0 3px #f08a3c}
#danceStage .mode{min-height:92px}
#danceStage .mode svg{width:40px;height:40px}
#danceStage .mode b{font:600 18px/1.15 Fredoka,Nunito,sans-serif}
#danceStage .mode small,#danceStage .look small{font-size:12px;font-weight:600;color:#8a6a4a;line-height:1.2}
#danceStage .look{min-height:76px}
#danceStage .look i{display:block;width:34px;height:34px;border-radius:50%;background:var(--sw);box-shadow:inset 0 -7px 0 rgba(0,0,0,.16),0 0 0 2px #fff,0 0 0 3px #d9bd85}
#danceStage .look b{font:700 13px/1.15 Nunito,sans-serif}
#danceStage .go{flex:none;width:100%;margin-top:14px;min-height:50px;background:#f08a3c;color:#fff;box-shadow:0 4px 0 #b8581a;font:700 18px Nunito,sans-serif;flex-direction:row;gap:8px}
#danceStage .go kbd{font:700 12px Nunito,sans-serif;padding:1px 6px;border-radius:5px;background:#0002}
@media (max-width:560px){
 #danceCard{top:calc(112px + env(safe-area-inset-top,0px));padding:6px 10px 6px 6px;gap:8px}
 #danceCard .ring{width:58px;height:58px}
 #danceCard .ring .ic svg{width:30px;height:30px}
 #danceCard .word{font-size:20px}
 #danceCard .strip i{width:22px;height:22px}
 #danceStage .mode{min-height:84px;padding:6px 4px}
 #danceStage .mode b{font-size:16px}
}
@media (max-height:480px){
 body.dance-round #trickHud{left:calc(10px + env(safe-area-inset-left,0px));transform:none}
 body.dance-round #trickHud .n{display:none}
 #danceCard{top:calc(8px + env(safe-area-inset-top,0px));left:calc(50% + 24px);width:min(380px,44vw);padding:5px 10px 5px 5px}
 body.dance-round #minigameStop{bottom:calc(76px + env(safe-area-inset-bottom,0px))}
 #danceCard .ring{width:52px;height:52px}
 #danceCard .ring .ic svg{width:28px;height:28px}
 #danceCard .word{font-size:18px}
 #danceCard .who{-webkit-line-clamp:1}
 #danceCard .strip i{width:20px;height:20px}
 #danceBtns{bottom:calc(8px + env(safe-area-inset-bottom,0px))}
 #danceBtns button{height:54px;width:min(70px,calc((100vw - 300px) / var(--n)))}
 #danceStage .box{padding:8px 12px 10px}
 #danceStage h2{margin:0 0 4px;font-size:19px}
 #danceStage h3{margin:6px 0 4px}
 #danceStage .mode{min-height:58px;flex-direction:row;gap:8px}
 #danceStage .mode svg{width:32px;height:32px}
 #danceStage .look{min-height:52px;flex-direction:row;gap:8px}
 #danceStage .go{margin-top:8px;min-height:46px}
}
@media (prefers-reduced-motion:reduce){.dancePop.go,.dancePop.note.go{animation-duration:.01s}}
`;

// ------------------------------------------------------------------------------------------------ geometry
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
/** Non-indexed, no uv, one colour per vertex: the parts of a set merge into one mesh. */
function prep(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const box = (x0, x1, y0, y1, z0, z1, color) => prep(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), color);
const cyl = (r, h, x, y, z, color, seg = 10) => prep(new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z), color);
function merged(parts) { const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g; }

/** A paper lantern: a round paper body (white: the instance colour paints it) with dark caps. Origin: its top. */
function lanternGeometry() {
  const P = (r, y) => new THREE.Vector2(r, y);
  const body = prep(new THREE.LatheGeometry([P(0.04, -0.03), P(0.13, -0.07), P(0.17, -0.17), P(0.16, -0.27), P(0.11, -0.34), P(0.04, -0.37)], 10), '#ffffff');
  const top = cyl(0.06, 0.04, 0, -0.06, 0, '#3a2a20', 8), bottom = cyl(0.05, 0.04, 0, -0.39, 0, '#3a2a20', 8);
  return merged([body, top, bottom]);
}

/** A soft round spot for the glow round a lantern or a stage light (additive points). */
function glowTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), r = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** The banner behind the stage: stars and notes on a dusk gradient, no words (the same in every language). */
function bannerTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 512, 192);
  g.addColorStop(0, '#3a1f6e'); g.addColorStop(0.55, '#8a2f8f'); g.addColorStop(1, '#e0458f');
  x.fillStyle = g; x.fillRect(0, 0, 512, 192);
  const R = rng(17);
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${0.25 + R() * 0.6})`; x.beginPath(); x.arc(R() * 512, R() * 192, 0.8 + R() * 1.8, 0, Math.PI * 2); x.fill(); }
  const star = (cx, cy, r, fill) => {
    x.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.closePath(); x.fillStyle = fill; x.fill(); x.lineWidth = 4; x.strokeStyle = '#fff6'; x.stroke();
  };
  star(256, 96, 64, '#ffd23f');
  star(120, 70, 26, '#ff9ccf'); star(392, 70, 26, '#7fd8ff'); star(70, 140, 16, '#fff'); star(442, 140, 16, '#fff');
  // music notes
  x.fillStyle = '#ffffffcc';
  for (const [nx, ny, s] of [[170, 140, 1], [340, 140, 1], [210, 48, 0.7], [300, 48, 0.7]]) {
    x.beginPath(); x.ellipse(nx, ny, 10 * s, 7 * s, -0.4, 0, Math.PI * 2); x.fill();
    x.fillRect(nx + 7 * s, ny - 34 * s, 3 * s, 34 * s);
    x.fillRect(nx + 7 * s, ny - 34 * s, 14 * s, 5 * s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PAPER = ['#ff5a3c', '#ffb02e', '#ff7aa8', '#ffd84a', '#ff8a3c'];
const BULBS = ['#ff4fa3', '#ffd23f', '#4fd2ff', '#9b6bff', '#5cff9b'];

/**
 * The festival set: a woven mat for the dance floor, a taiko on its stand at the back, poles with strings of paper
 * lanterns round three sides. Four draws: the merged set, the strings, the lanterns, their glow.
 */
function buildFestival(owned) {
  const group = new THREE.Group();
  group.name = 'dance:festival';
  const keep = o => (owned.push(o), o);
  const parts = [];
  // the mat: rings of straw colour, a red border
  parts.push(prep(new THREE.CircleGeometry(3.6, 28).rotateX(-Math.PI / 2).translate(0, 0.012, 0), '#b8323a'));
  parts.push(prep(new THREE.CircleGeometry(3.38, 28).rotateX(-Math.PI / 2).translate(0, 0.016, 0), '#e7c77d'));
  parts.push(prep(new THREE.RingGeometry(2.2, 2.32, 28).rotateX(-Math.PI / 2).translate(0, 0.02, 0), '#c99a4a'));
  parts.push(prep(new THREE.RingGeometry(1.0, 1.1, 22).rotateX(-Math.PI / 2).translate(0, 0.02, 0), '#c99a4a'));
  // the taiko on its stand at the back
  const tz = -2.9;
  parts.push(box(-0.62, 0.62, 0, 0.5, tz - 0.32, tz + 0.32, '#5b3b27'));
  parts.push(prep(new THREE.CylinderGeometry(0.42, 0.42, 0.62, 16).rotateX(Math.PI / 2).translate(0, 0.98, tz), '#8f2f22'));
  for (const s of [-1, 1]) parts.push(prep(new THREE.CircleGeometry(0.41, 16).rotateY(s > 0 ? 0 : Math.PI).translate(0, 0.98, tz + s * 0.312), '#f1e2c2'));
  // poles: four, at the corners of the floor
  const poles = [[-5, -3.2], [5, -3.2], [-5.4, 2.6], [5.4, 2.6]];
  for (const [x, z] of poles) { parts.push(cyl(0.06, 4.1, x, 0, z, '#5b3b27', 8)); parts.push(cyl(0.12, 0.1, x, 4.1, z, '#c2541c', 8)); }
  const set = new THREE.Mesh(keep(merged(parts)), keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
  set.receiveShadow = true;
  group.add(set);
  // the strings and the lanterns along them
  const spans = [[0, 1], [0, 2], [1, 3]], pts = [], lan = [];
  for (const [a, b] of spans) {
    const A = poles[a], B = poles[b], n = a === 0 && b === 1 ? 10 : 6, sag = a === 0 && b === 1 ? 0.75 : 0.55;
    let prev = null;
    for (let i = 0; i <= 16; i++) {
      const k = i / 16, x = A[0] + (B[0] - A[0]) * k, z = A[1] + (B[1] - A[1]) * k, y = 4.0 - Math.sin(Math.PI * k) * sag;
      if (prev) pts.push(prev[0], prev[1], prev[2], x, y, z);
      prev = [x, y, z];
    }
    for (let i = 1; i < n; i++) {
      const k = i / n, x = A[0] + (B[0] - A[0]) * k, z = A[1] + (B[1] - A[1]) * k, y = 4.0 - Math.sin(Math.PI * k) * sag;
      lan.push({ x, y: y - 0.04, z, c: PAPER[lan.length % PAPER.length] });
    }
  }
  const lg = keep(new THREE.BufferGeometry());
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.LineSegments(lg, keep(new THREE.LineBasicMaterial({ color: '#3a2a20' }))));
  const lanterns = new THREE.InstancedMesh(keep(lanternGeometry()), keep(new THREE.MeshBasicMaterial({ vertexColors: true })), lan.length);
  lanterns.frustumCulled = false;
  lan.forEach((l, i) => { _m.compose(_p.set(l.x, l.y, l.z), _q.identity(), _s.setScalar(1.25)); lanterns.setMatrixAt(i, _m); });
  group.add(lanterns);
  // the glow round each lantern
  const gp = new Float32Array(lan.length * 3), gc = new Float32Array(lan.length * 3);
  lan.forEach((l, i) => { gp.set([l.x, l.y - 0.26, l.z], i * 3); _c.set(l.c); gc.set([_c.r, _c.g, _c.b], i * 3); });
  const gg = keep(new THREE.BufferGeometry());
  gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  gg.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  const tex = glowTexture();
  if (tex) keep(tex);
  const glowMat = keep(new THREE.PointsMaterial({ size: 1.5, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4, fog: false }));
  const glow = new THREE.Points(gg, glowMat);
  glow.frustumCulled = false;
  group.add(glow);
  const paper = lan.map(l => new THREE.Color(l.c));
  let shown = -1;
  return {
    group,
    /** k: 0..1, how brightly the lanterns burn now (the dancing lights them, a beat pulses them). */
    light(k) {
      if (Math.abs(k - shown) < 0.01) return;
      shown = k;
      const b = 0.45 + 1.0 * k;
      for (let i = 0; i < paper.length; i++) lanterns.setColorAt(i, _c.copy(paper[i]).multiplyScalar(b));
      lanterns.instanceColor.needsUpdate = true;
      glowMat.opacity = 0.18 + 0.7 * k;
      glowMat.size = 1.1 + 1.1 * k;
    },
  };
}

/**
 * The K-pop stage: a wooden deck with a red skirt and steps, posts and a truss, a banner, rows of coloured bulbs and
 * four soft light beams. Five draws. The deck top stands STAGE_H over the ground.
 */
export const STAGE_H = 0.5;
function buildStage(owned) {
  const group = new THREE.Group();
  group.name = 'dance:stage';
  const keep = o => (owned.push(o), o);
  const H = STAGE_H, X = 4.3, Z0 = -2.4, Z1 = 1.5, parts = [];
  // the deck: planks on a frame, a skirt in front, two steps
  for (let i = 0; i < 9; i++) { const z0 = Z0 + i * (Z1 - Z0) / 9; parts.push(box(-X, X, H - 0.06, H, z0 + 0.01, z0 + (Z1 - Z0) / 9 - 0.01, i % 2 ? '#b07a4a' : '#a46f42')); }
  parts.push(box(-X, X, 0, H - 0.06, Z0, Z1 - 0.05, '#5b3b27'));
  parts.push(box(-X, X, 0.04, H - 0.08, Z1 - 0.05, Z1, '#b8323a'));
  parts.push(box(-X, X, H - 0.1, H - 0.06, Z1 - 0.04, Z1 + 0.01, '#f2c14a'));
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) parts.push(box(s * (X + 0.05 + k * 0.32), s * (X + 0.05 + k * 0.32) + s * 0.32, 0, H * (2 - k) / 3, Z1 - 1.2, Z1 - 0.2, '#8f5f3c'));
  // posts and the truss over the stage, the frame of the banner
  for (const s of [-1, 1]) { parts.push(box(s * X - 0.09, s * X + 0.09, H, 4.4, Z0 + 0.05, Z0 + 0.23, '#2d2d3a')); parts.push(box(s * X - 0.09, s * X + 0.09, H, 4.4, Z1 - 0.4, Z1 - 0.22, '#2d2d3a')); }
  parts.push(box(-X - 0.1, X + 0.1, 4.3, 4.48, Z0 + 0.05, Z0 + 0.23, '#2d2d3a'));
  parts.push(box(-X - 0.1, X + 0.1, 4.3, 4.48, Z1 - 0.4, Z1 - 0.22, '#2d2d3a'));
  for (const s of [-1, 1]) parts.push(box(s * X - 0.08, s * X + 0.08, 4.3, 4.46, Z0 + 0.1, Z1 - 0.25, '#2d2d3a'));
  const set = new THREE.Mesh(keep(merged(parts)), keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  set.receiveShadow = true;
  group.add(set);
  const bt = bannerTexture();
  if (bt) keep(bt);
  const banner = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * X - 0.4, 3.1)), keep(new THREE.MeshBasicMaterial({ map: bt, color: '#c9bcd2' })));
  banner.position.set(0, H + 1.85, Z0 + 0.02);
  group.add(banner);
  // the bulbs: along the stage's front edge, up the posts and along the front truss
  const at = [];
  for (let i = 0; i <= 20; i++) at.push([-X + i * (2 * X) / 20, H - 0.08, Z1 + 0.03]);
  for (const s of [-1, 1]) for (let i = 0; i < 10; i++) at.push([s * X, H + 0.35 + i * 0.4, Z1 - 0.2]);
  for (let i = 0; i <= 18; i++) at.push([-X + i * (2 * X) / 18, 4.25, Z1 - 0.2]);
  const bulbs = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.05, 8, 6)), keep(new THREE.MeshBasicMaterial({ color: '#ffffff' })), at.length);
  bulbs.frustumCulled = false;
  at.forEach(([x, y, z], i) => { _m.compose(_p.set(x, y, z), _q.identity(), _s.setScalar(1)); bulbs.setMatrixAt(i, _m); bulbs.setColorAt(i, _c.set(BULBS[i % BULBS.length])); });
  group.add(bulbs);
  // beams: soft cones from the truss down onto the deck
  const beamGeo = keep(new THREE.CylinderGeometry(0.12, 1.05, 3.8, 14, 1, true).translate(0, -1.9, 0));
  const beams = new THREE.InstancedMesh(beamGeo, keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })), 4);
  beams.frustumCulled = false;
  const beamAt = [-3, -1, 1, 3];
  group.add(beams);
  const glowCol = BULBS.map(c => new THREE.Color(c));
  let lastBeat = -1, lastK = -1;
  return {
    group,
    light(k, beat, t) {
      // the bulbs chase round the colours on every beat; the beams swing slowly; all of it brighter as the dancing goes well
      const b = Math.floor(beat);
      if (b !== lastBeat || Math.abs(k - lastK) > 0.02) {
        lastBeat = b; lastK = k;
        const bright = 0.4 + 0.9 * k;
        for (let i = 0; i < at.length; i++) bulbs.setColorAt(i, _c.copy(glowCol[(i + b) % glowCol.length]).multiplyScalar(bright));
        bulbs.instanceColor.needsUpdate = true;
        beams.material.opacity = 0.05 + 0.13 * k;
      }
      for (let i = 0; i < 4; i++) {
        const sw = Math.sin(t * 0.9 + i * 1.7) * 0.35;
        _m.compose(_p.set(beamAt[i], 4.2, Z1 - 0.3), _q.setFromEuler(_e.set(0.32 + Math.cos(t * 0.7 + i) * 0.08, 0, sw)), _s.setScalar(1));
        beams.setMatrixAt(i, _m);
        beams.setColorAt(i, glowCol[(i + b) % glowCol.length]);
      }
      beams.instanceMatrix.needsUpdate = true;
      beams.instanceColor.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------------------------------------ a dancer
/**
 * Somebody who dances: an NPC's root (or Mika's) at a fixed spot, facing the camera, with an Animator. A move plays the
 * art's clip when the model has it, else a stand-in clip of its own and a little body motion (PROC) so the move still reads.
 */
class Dancer {
  constructor({ root, anim, model, x, y, z, yaw = 0, kind = 'woman' }) {
    Object.assign(this, { root, anim, model, kind, yaw, base: new THREE.Vector3(x, y, z), added: [], proc: null, procT: 0, procDur: 1, idleName: null, idleSpeed: 1, props: [], pending: null });
    this.root.position.copy(this.base);
    this.root.rotation.set(0, yaw, 0);
  }

  has(name) { return !!this.anim?.has(name); }
  pick(list) { return (list || []).find(n => this.has(n)) || null; }

  /** The clips of a clip-only file (the art's dance clips) join this dancer's Animator for the round. */
  addClips(clips) {
    for (const c of clips || []) if (this.anim && !this.anim.clips.has(c.name)) { this.anim.clips.set(c.name, c); this.added.push(c.name); }
  }

  /** Take the round's clips away again (their actions stopped and uncached), leaving the Animator as it was. */
  dropClips() {
    const a = this.anim;
    if (!a) return;
    for (const n of this.added) {
      const act = a.actions.get(n);
      if (act) { act.stop(); a.mixer.uncacheAction(act.getClip(), a.root); a.actions.delete(n); }
      const clip = a.clips.get(n);
      if (clip) a.mixer.uncacheClip(clip);
      a.clips.delete(n);
      if (a.currentName === n) { a.current = null; a.currentName = ''; }
    }
    this.added.length = 0;
  }

  /** Loop an idle (the art's, or the first stand-in this model has). speed: for the art's own clip. */
  idle(name, speed = 1) {
    const n = this.has(name) ? name : this.pick(IDLE_FALLBACK[name] || ['Idle']);
    this.idleName = n; this.idleSpeed = n === name ? speed : 1;
    if (n && this.anim && !this.anim.busy) this.anim.play(n, { speed: this.idleSpeed, fade: 0.2 });
  }

  /** Play a move clip for two beats (spb seconds a beat). skip: seconds into the clip to start from (Mika's presses). */
  dance(clip, { bpm, spb, skip = 0, procAlways = false }) {
    const a = this.anim;
    const real = this.has(clip), name = real ? clip : this.pick(FALLBACK[clip]);
    if (!real || procAlways) this.startProc(PROC[clip], 2 * spb, real ? 0 : skip / (2 * spb));
    if (!a || !name) return;
    const c = a.clips.get(name);
    const speed = real ? clipSpeed(bpm) : clamp(c.duration / (2 * spb), 0.6, 2.6);
    a.cancelOneShot();
    a.once(name, { speed, hold: true, fade: 0.1, onDone: () => this.backToIdle() });
    if (skip > 0 && a.current) a.current.time = Math.min(c.duration * 0.4, real ? skip : skip * speed);
  }

  /** A one-off gesture with the art's or a stand-in clip (a bow, a cheer, a wave). */
  gesture(clip, speed = 1) {
    const name = this.has(clip) ? clip : this.pick(FALLBACK[clip] || [clip]);
    if (!name || !this.anim) return;
    this.anim.cancelOneShot();
    this.anim.once(name, { speed, hold: true, fade: 0.15, onDone: () => this.backToIdle() });
  }

  backToIdle() { if (this.idleName && this.anim && !this.anim.busy) this.anim.play(this.idleName, { speed: this.idleSpeed, fade: 0.2 }); }

  startProc(kind, dur, from = 0) { if (!kind) return; this.proc = kind; this.procDur = dur; this.procT = from * dur; }

  update(dt) {
    let x = 0, y = 0, spin = 0, lean = 0, bow = 0;
    if (this.proc) {
      this.procT += dt;
      const p = clamp(this.procT / this.procDur, 0, 1), e = envelope(p);
      if (this.proc === 'sway-') x = -0.3 * e;
      else if (this.proc === 'sway+') x = 0.3 * e;
      else if (this.proc === 'hop') y = 0.16 * Math.sin(Math.PI * clamp(p / 0.5, 0, 1));
      else if (this.proc === 'spin') spin = Math.PI * 2 * smooth(clamp((p - 0.05) / 0.6, 0, 1));
      else if (this.proc === 'lean') lean = 0.22 * e;
      else if (this.proc === 'bow') bow = 0.42 * e;
      if (p >= 1) this.proc = null;
    }
    this.root.position.set(this.base.x + x, this.base.y + y, this.base.z);
    this.root.rotation.set(bow, this.yaw + spin, lean);
    this.anim?.update(dt);
  }
}

// ------------------------------------------------------------------------------------------------ the page
function makeUi(ctx, mode, level, touch, onPress) {
  addCss('danceCss', CSS);
  const moves = slotsOf(mode), M = MOVES[mode], n = level === 'easy' ? 4 : 7;
  const card = document.createElement('div');
  card.id = 'danceCard';
  card.className = 'hidden';
  card.innerHTML = `<div class="ring"><div class="ic"></div><div class="cl"></div></div><div class="txt"><div class="who"></div><div class="word"></div><div class="strip"></div></div><div class="beats"><u></u><u></u><u></u><u></u></div>`;
  const btns = document.createElement('div');
  btns.id = 'danceBtns';
  btns.className = touch ? 'touch' : '';
  btns.style.setProperty('--n', String(n));
  const order = BTN_ORDER.filter(s => s < n);
  btns.innerHTML = order.map(s => `<button type="button" data-move="${moves[s]}" aria-label="">${svg(M[moves[s]].icon)}<span></span><kbd>${KEYS[s]}</kbd></button>`).join('');
  const pops = Array.from({ length: 4 }, () => { const p = document.createElement('div'); p.className = 'dancePop'; return p; });
  document.body.append(card, btns, ...pops);
  document.body.classList.add('dance-round');
  const q = s => card.querySelector(s);
  const el = { ic: q('.ic'), cl: q('.cl'), who: q('.who'), word: q('.word'), strip: q('.strip'), beats: [...card.querySelectorAll('.beats u')] };
  const buttons = new Map([...btns.querySelectorAll('button')].map(b => [b.dataset.move, b]));
  const label = () => {
    for (const [m, b] of buttons) { b.querySelector('span').textContent = tx(M[m].short); b.setAttribute('aria-label', tx(M[m].word)); }
  };
  label();
  const listeners = [];
  const on = (t, name, fn, o) => { t.addEventListener(name, fn, o); listeners.push(() => t.removeEventListener(name, fn, o)); };
  for (const [m, b] of buttons) {
    on(b, 'pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); onPress(m, e.timeStamp); });
    const up = () => b.classList.remove('down');
    on(b, 'pointerup', up); on(b, 'pointercancel', up); on(b, 'pointerleave', up);
    on(b, 'click', e => e.preventDefault());
  }
  // swipes on the picture: left, right, up and down are the four basic moves
  const sw = { id: -1, x: 0, y: 0, done: false };
  on(window, 'pointerdown', e => {
    if (e.target?.tagName !== 'CANVAS' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    sw.id = e.pointerId; sw.x = e.clientX; sw.y = e.clientY; sw.done = false;
  }, true);
  on(window, 'pointermove', e => {
    if (e.pointerId !== sw.id || sw.done) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.hypot(dx, dy) < 26) return;
    sw.done = true;
    onPress(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'), e.timeStamp);
  }, true);
  const end = e => { if (e.pointerId === sw.id) sw.id = -1; };
  on(window, 'pointerup', end, true); on(window, 'pointercancel', end, true);

  let nextPop = 0, cueBtn = null;
  const memo = { cls: null, ic: null, who: null, word: null, strip: null, beat: -1, ring: -1, cl: null };
  return {
    card, btns,
    show(on) { card.classList.toggle('hidden', !on); btns.classList.toggle('hidden', !on); },
    /** The card: kind 'move' | 'her' | 'free' | 'ask' | 'count' | 'wait'; the teacher's line under her name. */
    set({ kind = 'wait', move = null, said = null, count = 0, phase = '', who = '', line = '', strip = null }) {
      const cls = `${kind === 'her' ? 'her' : kind === 'free' ? 'free' : ''}${phase === 'copy' ? ' copy' : ''}`;
      if (cls !== memo.cls) { memo.cls = cls; card.className = cls; }
      const ic = kind === 'move' ? M[move]?.icon : kind === 'her' ? 'her' : kind === 'free' ? 'free' : kind === 'ask' ? 'ask' : kind === 'count' ? `#${count}` : mode === 'kpop' ? 'star' : 'hat';
      if (ic !== memo.ic) {
        memo.ic = ic;
        el.ic.innerHTML = ic.startsWith('#') ? `<b style="font:600 30px Fredoka,Nunito,sans-serif;color:#c2541c">${ic.slice(1)}</b>` : svg(ic);
      }
      const word = kind === 'move' ? tx(M[move]?.word || '') : kind === 'her' ? tx(said === 'left' ? N_('My left!') : N_('My right!')) : kind === 'free' ? tx(N_('Any move!'))
        : kind === 'ask' ? '' : kind === 'count' ? '' : '';
      if (word !== memo.word) { memo.word = word; el.word.textContent = word; }
      const whoLine = `${who}|${line}`;
      if (whoLine !== memo.who) { memo.who = whoLine; el.who.innerHTML = ''; if (line) { const b = document.createElement('b'); b.textContent = who ? `${who}:` : ''; el.who.append(b, document.createTextNode(line)); } }
      if (strip !== memo.stripRef) {
        memo.stripRef = strip;
        el.strip.innerHTML = strip ? strip.map(s => `<i class="${s.state}">${s.icon ? svg(s.icon) : ''}</i>`).join('') : '';
      }
    },
    /** The closing ring round the picture: k 0 (far off) .. 1 (the beat); null hides it. */
    ring(k) {
      const r = k == null ? -1 : Math.round(k * 40) / 40;
      if (r === memo.ring) return;
      memo.ring = r;
      if (r < 0) { el.cl.style.opacity = '0'; return; }
      el.cl.style.opacity = String(0.35 + 0.65 * r);
      el.cl.style.transform = `scale(${(1.55 - 0.55 * r).toFixed(3)})`;
      const go = r >= 0.95;
      if (go !== memo.cl) { memo.cl = go; el.cl.classList.toggle('go', go); }
    },
    beat(b) {
      const k = ((b % 4) + 4) % 4;
      if (k === memo.beat) return;
      memo.beat = k;
      el.beats.forEach((u, i) => u.classList.toggle('on', i === k));
    },
    /** Light the button of the move to make now (Easy), or none. */
    cue(move) {
      const b = move ? buttons.get(move) || null : null;
      if (b === cueBtn) return;
      cueBtn?.classList.remove('cue');
      cueBtn = b;
      b?.classList.add('cue');
    },
    press(move) { const b = buttons.get(move); if (b) { b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 120); } },
    /** A word that floats up from (x, y) px. kind: 'perfect' | 'good' | 'miss' | 'note'. */
    pop(text, x, y, kind) {
      const p = pops[nextPop++ % pops.length];
      p.textContent = text;
      p.style.left = `${Math.round(clamp(x, 70, innerWidth - 70))}px`; p.style.top = `${Math.round(clamp(y, 90, innerHeight - 120))}px`;
      p.className = `dancePop ${kind}`;
      void p.offsetWidth;
      p.classList.add('go');
    },
    label,
    destroy() { listeners.forEach(f => f()); card.remove(); btns.remove(); pops.forEach(p => p.remove()); document.body.classList.remove('dance-round'); },
  };
}

/**
 * The card before the song: which dance (the hat dance with Hoa or the K-pop stage), and the lead performer's look.
 * Resolves { mode, look } or null (the round was left). Mouse and touch press; keys and pad move with the arrows
 * (up / down change the row) and choose with E / Space; Backspace leaves (the framework's quit).
 */
function stageCard(ctx, want, step) {
  addCss('danceCss', CSS);
  const g = ctx.game;
  // a light person (People: Light) is one mesh in its default look: no outfits to choose then
  const liteOf = id => g.assets?.people === 'lite' && peopleFile(id, 'lite') !== id;
  // the chosen dance's performers start loading while the card is up (a performer is a few MB)
  const prefetch = mode => { for (const id of mode === 'kpop' ? ['nabi', 'byeol', 'haru'] : ['hoa']) g.assets?.get?.(MODEL[id][0]); };
  const touch = !!ctx.ui.touch;
  const root = document.createElement('div');
  root.id = 'danceStage';
  root.setAttribute('role', 'dialog');
  root.innerHTML = `<div class="box"><h2><img alt=""><span></span></h2><div class="row modes"></div><h3></h3><div class="row looks"></div><button type="button" class="go"></button></div>`;
  root.addEventListener('pointerdown', e => e.stopPropagation());
  const q = s => root.querySelector(s);
  const img = q('h2 img');
  img.onerror = () => { img.style.display = 'none'; };
  img.src = ctx.ui.icon(ctx.trick.icon);
  q('h2 span').textContent = tx(N_('Choose your dance'));
  q('.go').innerHTML = `${tx(N_('Dance!'))}${touch ? '' : '<kbd>E</kbd>'}`;
  const sel = { mode: want.mode, look: { ...want.looks } }, rows = ['modes', 'looks'];
  let row = 0, nav = false, done = null;
  const modes = [['festival', 'hat', N_('Hat dance'), N_('with Hoa')], ['kpop', 'star', N_('K-pop stage'), N_('with Nabi')]];
  q('.modes').innerHTML = modes.map(([id, ic]) => `<button type="button" class="mode" data-mode="${id}">${svg(ic)}<b></b><small></small></button>`).join('');
  modes.forEach(([id, , name, sub], i) => { const b = q('.modes').children[i]; b.querySelector('b').textContent = tx(name); b.querySelector('small').textContent = tx(sub); });
  const paint = () => {
    for (const b of q('.modes').children) b.classList.toggle('sel', b.dataset.mode === sel.mode);
    prefetch(sel.mode);
    const who = LEAD[sel.mode], P = looksOf(who), lite = liteOf(who) || !P;
    q('h3').hidden = lite; q('.looks').hidden = lite;
    rows.length = 0; rows.push('modes'); if (!lite) rows.push('looks');
    row = Math.min(row, rows.length - 1);
    if (lite) { root.querySelectorAll('.row').forEach((r, i) => r.classList.toggle('cur', nav && i === row)); return; }
    q('h3').textContent = tx(N_("{name}'s outfit"), { name: tx(CAST[who]?.name || who) });
    const cur = lookOf(who, sel.look[who]).id;
    sel.look[who] = cur;
    const box = q('.looks');
    if (box.dataset.who !== who) {
      box.dataset.who = who;
      box.innerHTML = P.looks.map(l => `<button type="button" class="look" data-look="${l.id}"><i></i><b></b></button>`).join('');
      P.looks.forEach((l, i) => { const b = box.children[i]; b.querySelector('i').style.setProperty('--sw', l.swatch || '#ccc'); b.querySelector('b').textContent = tx(l.name); b.onclick = () => { sel.look[who] = l.id; row = 1; paint(); }; });
    }
    for (const b of box.children) b.classList.toggle('sel', b.dataset.look === cur);
    root.querySelectorAll('.row').forEach((r, i) => r.classList.toggle('cur', nav && i === row));
  };
  for (const b of q('.modes').children) b.onclick = () => { sel.mode = b.dataset.mode; row = 0; paint(); };
  q('.go').onclick = () => { done = { mode: sel.mode, look: sel.look[LEAD[sel.mode]], looks: sel.look }; };
  document.body.append(root);
  document.body.classList.add('dance-pick');
  paint();
  let age = 0;
  const move = d => {
    if (rows[row] === 'modes') { const i = modes.findIndex(m => m[0] === sel.mode); sel.mode = modes[(i + d + modes.length) % modes.length][0]; }
    else { const who = LEAD[sel.mode], P = looksOf(who), i = P.looks.findIndex(l => l.id === sel.look[who]); sel.look[who] = P.looks[(i + d + P.looks.length) % P.looks.length].id; }
    paint();
  };
  return {
    step(dt) {
      age += dt;
      const p = step();
      if (age > 0.35 && p) {
        if (p === 'left' || p === 'right') { nav = true; move(p === 'left' ? -1 : 1); }
        else if (p === 'up' || p === 'down') { nav = true; row = (row + (p === 'up' ? -1 : 1) + rows.length) % rows.length; paint(); }
        else if (p === 'go') done = { mode: sel.mode, look: sel.look[LEAD[sel.mode]], looks: sel.look };
      }
      return done;
    },
    destroy() { root.remove(); document.body.classList.remove('dance-pick'); },
  };
}

// ------------------------------------------------------------------------------------------------ input
/** A gamepad's own presses this frame: the d-pad and a flicked stick (the four basic moves), X and Y (moves 6 and 7). */
function padReader() {
  const was = {};
  let stick = '';
  return () => {
    const out = [];
    const gp = typeof navigator !== 'undefined' ? [...(navigator.getGamepads?.() || [])].find(Boolean) : null;
    if (!gp) return out;
    const edge = (k, down) => { if (down && !was[k]) out.push(k); was[k] = !!down; };
    const b = i => !!gp.buttons[i]?.pressed;
    edge('up', b(12)); edge('down', b(13)); edge('left', b(14)); edge('right', b(15));
    edge('x', b(2)); edge('y', b(3));
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, m = Math.hypot(ax, ay);
    const dir = m < 0.6 ? '' : Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'left' : 'right') : (ay < 0 ? 'up' : 'down');
    if (dir && dir !== stick) out.push(dir);
    if (m < 0.35) stick = ''; else if (dir) stick = dir;
    return out;
  };
}

// ------------------------------------------------------------------------------------------------ sounds
const sfx = {
  good(a, perfect) { a?.tone?.(perfect ? 1568 : 1175, { type: 'triangle', dur: 0.12, vol: 0.06, rev: 0.2 }); if (perfect) a?.tone?.(2093, { type: 'sine', dur: 0.18, vol: 0.035, when: 0.05, rev: 0.3 }); },
  miss(a) { a?.tone?.(260, { type: 'triangle', dur: 0.16, vol: 0.05, glide: 0.75 }); },
  clean(a) { [0, 4, 7, 12].forEach((d, i) => a?.tone?.(523 * Math.pow(2, d / 12), { type: 'triangle', dur: 0.18, vol: 0.05, when: i * 0.06, rev: 0.3 })); },
  cheer(a) { a?.noise?.({ dur: 0.9, vol: 0.09, freq: 1400, q: 0.5 }); for (let i = 0; i < 6; i++) a?.noise?.({ dur: 0.06, vol: 0.06, freq: 1900, q: 0.9, when: 0.1 + i * 0.13 }); },
};

// ------------------------------------------------------------------------------------------------ the scenery: Hoa by the sign
let HOA = null;          // { npc, d, face } while she stands there
let hoaLoad = null;      // her models, asked for once
function hoaScenery(dt, ctx) {
  const d = ctx.director, g = ctx.game;
  if (ctx.off) { dropHoa(); return; }
  if (!HOA) {
    // her own model if it is there, else Hana's (her mum's) as a stand-in: asked for once, she appears when it is in
    hoaLoad ??= { done: false, p: Promise.all(MODEL.hoa.map(async n => { if (g.assets.has(n)) return; const v = await g.assets.get(n); if (v) (g.assets.resolved ??= new Map()).set(n, v); })).catch(() => {}).then(() => { hoaLoad.done = true; }) };
    if (!hoaLoad.done || d.tricks?.round?.id === 'dance') return;
    const model = MODEL.hoa.find(n => g.assets.has(n));
    if (!model) return;
    const stand = { x: ctx.trick.place.x - 1.9, z: ctx.trick.place.z };
    const face = Math.atan2(stand.x - HOA_HOME.x, stand.z - HOA_HOME.z);
    // her own model is drawn part by part (its wardrobe shows one look); the stand-in may be merged as usual
    const own = model === MODEL.hoa[0], world = own ? { heightAt: (x, z) => g.world.heightAt(x, z), quality: { ...(g.world.quality || {}), mergeChars: false } } : g.world;
    const npc = new NPC(g.scene, g.assets, world, 'hoa', model, { x: HOA_HOME.x, z: HOA_HOME.z, facing: face, name: 'Hoa' });
    npc.world = g.world;
    if (own) { try { applyLook(npc.model, 'hoa', d.tricks?.rec('dance')?.looks?.hoa); } catch (e) { console.warn('[dance] look of Hoa', e); } }
    npc.home.facing = face;
    if (npc.anim?.has('DanceIdle')) npc.setIdle('DanceIdle');
    if (!d.npcs.hoa) d.npcs.hoa = npc;
    const label = () => tx('Talk to {name}', { name: tx(CAST.hoa?.name || 'Hoa') });
    d.interact('talk:hoa', null, label, () => npc.visible && !npc.far && !d.tricks?.round && !d.minigameMenu?.running, () => d.talk('hoa'), 2.6, () => npc.head(), 0.5);
    HOA = { npc, d, face };
  }
  // she turns to Mika when Mika comes near, and back to the square when she goes
  const n = HOA.npc, p = g.player.pos, near = Math.hypot(p.x - n.pos.x, p.z - n.pos.z) < 5;
  if (near) n.lookAt(p.x, p.z); else n.targetFacing = HOA.face;
}
function dropHoa() {
  if (!HOA) return;
  const { npc, d } = HOA;
  if (d.npcs.hoa === npc) delete d.npcs.hoa;
  d.interactables?.delete('talk:hoa');
  npc.root.removeFromParent();
  disposeRigs(npc.root);
  HOA = null;
}

// ------------------------------------------------------------------------------------------------ the round
const LINES = {
  ready: N_('Get ready!'),
  watch: N_('Watch me!'),
  turn: N_('Your turn! Copy me on the beat.'),
  copy: N_('Your turn!'),
  along: N_('Dance with me! The card shows each move a beat early.'),
  line: N_('Keep going!'),
  mirror: N_('Follow my body! My left is your right.'),
  finish: N_('This line ends with a bow.'),
  finishKpop: N_('This line ends with heart hands.'),
  chorus: N_('Free style! Any moves on the beat. Mix them up!'),
  finale: N_('Take a bow! Beautiful!'),
  finaleKpop: N_('Hearts up! What a show!'),
  firstWatch: N_('Watch what I do. Then you do the same.'),
  firstCopy: N_('Now you! Press when the ring closes.'),
  clean: N_('Beautiful line!'),
};

export default {
  id: 'dance',

  /** Hoa waits by the sign (any season, any hour), so Mika can walk up and talk to her. */
  scenery(dt, ctx) { hoaScenery(dt, ctx); },

  async play(ctx) {
    const g = ctx.game, p = ctx.player, d = ctx.director, input = ctx.input, audio = ctx.audio, follow = g.follow, world = g.world;
    const qa = typeof window !== 'undefined' ? window.__STARLINE_QA__ || null : null;
    const saved = { fov: follow.fovBase, camFov: follow.camera.fov, camPos: follow.camera.position.clone(), camRot: follow.camera.quaternion.clone(), look: follow.look.clone(), pos: follow.pos.clone() };
    const owned = [], dancers = [], crowd = [], npcs = [], hidden = [];
    let ui = null, card = null, set = null, focus = null, blobs = null, restoreBody = null, hoaHidden = null, fill = null;
    const sign = d.tricks?.signs?.find(s => s.t.id === 'dance') || null;
    const tamo = d.tamo || null, tamoShown = !!tamo && !tamo.hidden;
    try {
      ctx.lock(true);
      const level = ctx.first ? 'easy' : ['easy', 'normal', 'hard'].includes(ctx.level) ? ctx.level : 'normal';
      const rec = d.tricks?.rec('dance') || null;
      // ---- which dance, which look (the card), unless a QA script says
      let mode = ['festival', 'kpop'].includes(rec?.mode) ? rec.mode : 'kpop';
      const looks = { ...(rec?.looks || {}) };
      const padStep = padReader();
      if (qa && ['festival', 'kpop'].includes(qa.danceMode)) {
        mode = qa.danceMode;
        if (typeof qa.danceLook === 'string') looks[LEAD[mode]] = qa.danceLook;
      } else {
        card = stageCard(ctx, { mode, looks }, () => {
          const pads = padStep();
          if (input.pressed('left') || pads.includes('left')) return 'left';
          if (input.pressed('right') || pads.includes('right')) return 'right';
          if (input.pressed('up') || pads.includes('up')) return 'up';
          if (input.pressed('down') || pads.includes('down')) return 'down';
          if (input.pressed('act') || input.pressed('jump')) return 'go';
          return null;
        });
        const pick = await ctx.loop(dt => card.step(dt) || undefined);
        card.destroy(); card = null;
        if (!pick || pick.quit) return { score: 0, quit: true };
        mode = pick.mode;
        Object.assign(looks, pick.looks);
      }
      const lead = LEAD[mode], look = lookOf(lead, looks[lead]).id;
      looks[lead] = look;
      // remembered for next time (the framework keeps the record's own fields when it folds the round in)
      if (rec) { rec.mode = mode; rec.looks = cleanLooks({ ...(rec.looks || {}), ...looks }) || rec.looks; }
      const kpop = mode === 'kpop';
      const seed = Number.isFinite(qa?.danceSeed) ? qa.danceSeed : (Date.now() % 2147483000) + 1;
      const round = new DanceRound({ level, mode, seed, first: ctx.first });
      const plan = round.plan, spb = plan.spb, bpm = plan.bpm, lead2 = clipLead(bpm);
      const M = MOVES[mode];

      // ---- the art (whatever of it is there: every name resolves to null when its file is missing)
      const wantModels = new Set(['villager-kid', 'villager-man', 'villager-woman', ...Object.values(CLIP_FILE), 'non-la', 'mic', 'light-stick']);
      for (const id of kpop ? ['nabi', 'byeol', ...(level !== 'easy' ? ['haru'] : [])] : ['hoa']) MODEL[id].forEach(n => wantModels.add(n));
      await ctx.ensureModels([...wantModels]);
      if (ctx.quit) return { score: 0, quit: true };
      const clipsOf = name => g.assets.gltf?.(name)?.animations || [];

      await ctx.fade(true, 240);
      if (ctx.quit) return { score: 0, quit: true };
      ctx.setNight(true, kpop ? 20.5 : 19.5);
      audio.holdMusic?.('dance', true);

      // ---- the floor: where everybody stands (phones held upright pull the line in)
      const tall = innerHeight > innerWidth * 1.1, sx = tall ? 0.62 : 1;
      const X = SPOT.x, Z = SPOT.z, Y = world.heightAt(X, Z);
      const ground = (x, z) => world.heightAt(x, z);
      const up = kpop ? STAGE_H : 0;
      set = kpop ? buildStage(owned) : buildFestival(owned);
      set.group.position.set(X, Y, Z);
      g.scene.add(set.group);

      // ---- people
      const shadows = world.quality?.propShadows !== false;
      const noMerge = { heightAt: (x, z) => world.heightAt(x, z), get quality() { return { ...(world.quality || {}), mergeChars: false }; } };
      const spawn = (id, model, x, z, o = {}) => {
        const npc = new NPC(g.scene, g.assets, o.noMerge ? noMerge : world, `dance:${id}`, model, { x: X + x, z: Z + z, facing: o.yaw || 0, tint: o.tint || null });
        npc.root.name = `dance:${id}`;
        npc.model.traverse(m => { if (m.isMesh) { m.castShadow = shadows && !o.crowd; m.frustumCulled = false; } });
        npcs.push(npc);
        const dn = new Dancer({ root: npc.root, anim: npc.anim, model: npc.model, x: X + x, y: ground(X + x, Z + z) + (o.y || 0), z: Z + z, yaw: o.yaw || 0, kind: o.kind || 'woman' });
        dn.npc = npc;
        return dn;
      };
      const attach = (dn, prop, who) => {
        const grip = dn.model?.getObjectByName?.('grip_R');
        const m = grip && g.assets.has(prop) ? g.assets.clone(prop) : null;
        if (!m) return;
        const o = DANCE_GRIP[prop]?.[who] || {};
        m.position.set(...(o.p || [0, 0, 0])); m.rotation.set(...(o.r || [0, 0, 0])); m.scale.setScalar(o.s || 1);
        m.traverse(x => { if (x.isMesh) x.castShadow = false; });
        m.userData.danceProp = true;
        grip.add(m);
        dn.props.push(m);
      };
      // a performer: her own model (with her look, drawn part by part so the wardrobe can work) or the stand-in in her colours
      const performer = (id, x, z, kind) => {
        const own = g.assets.has(MODEL[id][0]), model = MODEL[id].find(n => g.assets.has(n)) || MODEL[id][1];
        const lk = lookOf(id, looks[id]);
        // a stand-in wears the look's main colour on its shirt (the light people take the tint into their palette too)
        const tint = own ? null : STAND_IN[id] ? { ...STAND_IN[id], ...(lk?.swatch ? { 'Villager shirt': lk.swatch } : {}), ...(lk?.tint?.Bottom && id !== 'haru' ? { 'Villager trousers': lk.tint.Bottom } : {}) } : null;
        const dn = spawn(id, model, x, z, { y: up, noMerge: own, tint, kind });
        if (own && lk) { try { dn.dressed = applyLook(dn.model, id, lk.id); } catch (e) { console.warn('[dance] look not applied', e); } }
        // the performers' finish for an evening show: a soft rim on hair and clothes in the light of the lanterns / the stage
        if (own) { try { polish(dn.model, kpop ? { rim: 0.36, rimColor: '#f4dcff' } : { rim: 0.3, rimColor: '#ffdcae' }); } catch (e) { console.warn('[dance] polish', e); } }
        dn.own = own;
        // the stand-ins borrow the villagers' dance clips (the art's contract) when those are there
        if (!own) dn.addClips(clipsOf(kind === 'man' ? CLIP_FILE.man : CLIP_FILE.woman));
        dancers.push(dn);
        return dn;
      };
      let teacher, haru = null, singer = null;
      const kids = [];
      if (kpop) {
        teacher = performer('nabi', -0.65 * sx, 0.15, 'woman');
        if (level !== 'easy') haru = performer('haru', 2.65 * sx, -0.45, 'man');
        singer = performer('byeol', -2.75 * sx, tall ? -1.1 : -0.55, 'woman');
        singer.yaw = 0.35; singer.root.rotation.y = 0.35;
        attach(singer, 'mic', 'byeol');
      } else {
        teacher = performer('hoa', -1.5 * sx, 0.55, 'woman');
        attach(teacher, 'non-la', 'hoa');
        if (level !== 'easy') {
          for (const [i, [x, z]] of [[-0.25, -0.6], [2.15, -0.5]].entries()) {
            const k = spawn(`kid${i}`, 'villager-kid', x * sx, z, { tint: NPC.villagerTint([3, 12][i]), kind: 'kid' });
            k.addClips(clipsOf(CLIP_FILE.kid));
            attach(k, 'non-la', 'kid');
            kids.push(k); dancers.push(k);
          }
        }
      }
      // the watchers at the sides, turned toward the dancers (and a little toward us)
      const nCrowd = level === 'easy' ? 4 : 6;
      const crowdAt = kpop ? [[-5.4, 2.7], [5.4, 2.7], [-4.6, 3.8], [4.6, 3.8], [-6.0, 4.1], [6.0, 4.1]] : [[-4.3, 0.7], [4.4, 0.5], [-4.8, -0.9], [4.9, -1.0], [-3.9, 2.2], [4.0, 2.1]];
      const crowdModels = ['villager-woman', 'villager-man', 'villager-kid', 'villager-man', 'villager-woman', 'villager-kid'];
      for (let i = 0; i < nCrowd; i++) {
        const [cx, cz] = crowdAt[i], model = crowdModels[i], kind = model.slice(9);
        const yaw = Math.atan2(0 - cx, (kpop ? -0.4 : 3.5) - cz);
        const c = spawn(`fan${i}`, model, cx * (tall ? 0.85 : 1), cz, { yaw, tint: NPC.villagerTint(20 + i * 3), kind, crowd: true });
        c.addClips(clipsOf(CLIP_FILE[kind]));
        if (kpop) attach(c, 'light-stick', kind);
        c.npc.setDetail?.(0, false);
        crowd.push(c);
      }

      // ---- Mika: her body is the round's for now (placed and posed here); the art's dance clips join her animator
      const mx = (kpop ? 1.0 : 0.85) * sx, mz = kpop ? 0.1 : 0;
      restoreBody = takeBody(p);
      p.pos.set(X + mx, ground(X + mx, Z + mz) + up, Z + mz);
      p.facing = 0;
      const mika = new Dancer({ root: p.root, anim: p.anim, model: p.model, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: 0, kind: 'mika' });
      mika.addClips(clipsOf(CLIP_FILE.mika));
      if (!kpop) attach(mika, 'non-la', 'mika');
      p.update = dt => { mika.update(dt); };
      const all = [...dancers, mika], everyone = [...all, ...crowd];

      // ---- nobody else wanders into the picture; Hoa by the sign and the sign itself step out of it
      const inBox = o => Math.abs(o.position.x - X) < 11 && o.position.z > Z - 13 && o.position.z < Z + 16;      // (the bell tower door included)
      const ours = new Set([...npcs.map(n => n.root), p.root]);
      const sweep = () => {
        for (const o of g.scene.children) {
          if (ours.has(o) || !/^(npc:|critter:|animal:)/.test(o.name) || !inBox(o)) continue;
          if (!hidden.some(h => h[0] === o)) hidden.push([o, o.visible]);
          o.visible = false;
        }
      };
      sweep();
      if (HOA?.npc) { hoaHidden = HOA.npc; hoaHidden.setHidden(true); }
      if (sign) sign.hidden = true;
      if (tamoShown) tamo.hide?.();

      // ---- the camera: a fixed front view that fits the dancers between the card at the top and the buttons below
      const cam = { w: 0, h: 0, left: -1, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
      // a wide screen keeps the people clear of the How to play card on the left while it is open
      const howToLeft = () => { const c = document.getElementById('howTo'); if (innerWidth < 900 || !c || c.classList.contains('hidden') || c.classList.contains('shut')) return 0; const r = c.getBoundingClientRect(); return r.width ? Math.round(r.right + 8) : 0; };
      const aim = () => {
        const W = innerWidth, H = innerHeight, portrait = H > W, low = H <= 480, left = howToLeft();
        const top = portrait ? 192 : low ? 74 : 168, bottom = portrait ? 92 : low ? 70 : 92;
        // an upright phone frames the dancers alone (as big as the width allows); a wide screen shows the lanterns or the
        // stage lights and the watchers too
        const xs = all.map(dn => dn.base.x - X);
        const x0 = portrait ? Math.min(...xs) - 0.55 : (kpop ? -3.5 : -3.7) * sx, x1 = portrait ? Math.max(...xs) + 0.55 : (kpop ? 3.6 : 3.9) * sx;
        const y0 = portrait ? up - 0.15 : kpop ? 0.15 : -0.1, y1 = portrait ? up + 2.15 : kpop ? 3.0 : 3.1;
        const fov = portrait ? 46 : 36, t = Math.tan(fov * Math.PI / 360), band = H - top - bottom, bandW = W - left;
        const dist = Math.max((y1 - y0) / (2 * t * band / H), (x1 - x0) / (2 * t * bandW / H)) * 1.06;
        const midY = (top + band / 2) / H, midX = (left + bandW / 2) / W;
        const cx = (x0 + x1) / 2 - (midX - 0.5) * 2 * t * dist * W / H, cy = (y0 + y1) / 2 + (midY - 0.5) * 2 * t * dist;
        cam.w = W; cam.h = H; cam.fov = fov; cam.left = left;
        cam.pos.set(X + cx, Y + cy + dist * 0.16, Z + dist);
        cam.look.set(X + cx, Y + cy - dist * 0.02, Z);
        follow.fovBase = fov; follow.camera.fov = fov; follow.camera.updateProjectionMatrix();
        follow.cutscene({ pos: cam.pos, look: cam.look }, 0.001);
        follow.camera.position.copy(cam.pos); follow.look.copy(cam.look); follow.camera.lookAt(cam.look);
      };
      aim();

      // ---- everybody in place, the idles on
      const idleClip = kpop ? 'KpopIdle' : 'DanceIdle', idleSpeed = clipSpeed(bpm);
      for (const dn of all) dn.idle(dn === singer ? 'SingIdle' : idleClip, idleSpeed);
      for (const c of crowd) c.idle('Idle');
      // every clip the round may play is bound now, under the fade (a clip's first play binds every bone track: a hitch)
      const clipNames = new Set(['Idle', 'Bow', 'Cheer', 'Wave', 'Clap', 'StickWave', 'SingIdle', 'SingReach', 'MicRaise', 'PowerPose', 'SlideL', 'SlideR', idleClip]);
      for (const m of Object.values(M)) { clipNames.add(m.clip); for (const n of FALLBACK[m.clip] || []) clipNames.add(n); }
      for (const dn of everyone) for (const n of clipNames) if (dn.has(n)) dn.anim.action(n);
      for (const dn of everyone) dn.update(0);
      input.releaseAll?.();

      // ---- the page
      const touch = !!ctx.ui.touch;
      const queue = [];
      let songT = 0, frameAt = performance.now(), started = false;
      const pressAt = stamp => (started ? songT + clamp((stamp - frameAt) / 1000, 0, 0.1) : 0);
      ui = makeUi(ctx, mode, level, touch, (move, stamp) => queue.push({ move, t: pressAt(stamp) }));
      ui.show(false);

      // ---- a warm light on the dancers: one of the valley's pooled lights (engine/lights.js), so the light count never
      // changes; it fades in before the still picture is taken and stays as it is while the valley stands still
      fill = g.lights?.add({ pos: cam.pos.clone().lerp(cam.look, 0.55).add(_v.set(0, 1.6, 0)), intensity: () => 30, range: 15, color: kpop ? '#ffd6e8' : '#ffdcae' }) || null;
      // ---- focus mode: the valley as a still picture behind the dancers (after a few frames at dusk)
      await ctx.wait(0.3);
      blobs = new BlobShadows(16);
      g.scene.add(blobs.mesh);
      owned.push({ dispose: () => blobs?.dispose() });
      const who = everyone.map(dn => ({ pos: dn.root.position, r: dn.kind === 'kid' ? 0.3 : 0.36, root: dn.root }));
      focus = enterFocus(g, {
        keep: [set.group, p.root, blobs.mesh, ...npcs.map(n => n.root)], hide: [...hidden.map(h => h[0]), ...(hoaHidden ? [hoaHidden.root] : []), ...(sign?.obj ? [sign.obj] : [])],
        backdrop: 'frozen', sim: 'actors', actors: [],
        onFrame: () => { for (const w of who) w.show = w.root.visible; blobs.set(who, (x, z) => ground(x, z) + (kpop && Math.abs(x - X) < 4.3 && z > Z - 2.4 && z < Z + 1.5 ? STAGE_H : 0)); },
      });
      if (!focus.active) blobs.mesh.visible = false;           // (drawn as usual: the people's own shadows are there)

      // ---- the song
      const cues = plan.cues, T = plan.targets, name = tx(CAST[kpop ? 'nabi' : 'hoa']?.name || '');
      let ci = 0, nextBeat = 0, glow = 0, pulse = 0, clapUntil = -1, opening = 0, outro = 0, ended = false, sweepT = 0;
      let phase = 'ready', lineNo = -1, callIdx = -1, callHidden = false, demoIdx = -1, sayKey = 'ready', sayT = 0;
      const pendingKids = [];
      const stripState = new Map();          // target index -> 'ok' | 'bad'
      const headPx = (dn, dy = 1.75) => { _v.copy(dn.root.position); _v.y += dy; _v.project(follow.camera); return [(_v.x + 1) / 2 * innerWidth, (1 - _v.y) / 2 * innerHeight]; };
      const say = key => { sayKey = key; sayT = 0; };
      const lineText = () => {
        if (!sayKey) return '';
        if (sayKey === 'finish' && kpop) return tx(LINES.finishKpop);
        if (sayKey === 'finale' && kpop) return tx(LINES.finaleKpop);
        if (ctx.first && sayKey === 'watch') return tx(LINES.firstWatch);
        if (ctx.first && sayKey === 'turn') return tx(LINES.firstCopy);
        return tx(LINES[sayKey] || '');
      };
      // the teacher (and the dancers who follow her) dance a move with its accent on `beat`
      const clipFor = (dn, move) => {
        let c = M[move]?.clip;
        if (!c) return null;
        if (dn === haru) c = HARU[c] || (phase === 'chorus' ? HARU_CHORUS[c] || c : c);
        return c;
      };
      const demo = move => {
        const leaders = [teacher, ...(haru ? [haru] : []), ...(level === 'hard' ? kids : [])];
        for (const dn of leaders) { const c = clipFor(dn, move); if (c) dn.dance(c, { bpm, spb }); }
      };
      const chorusFree = () => {
        // free style: the leads show off a move of their own on each beat of the chorus
        const pool = ['left', 'right', 'up', 'down', kpop ? 'point' : 'hands', kpop ? 'wave' : 'tilt'];
        for (const dn of [teacher, ...(haru ? [haru] : []), ...kids]) { const m = pool[Math.floor(Math.random() * pool.length)]; const c = clipFor(dn, m); if (c) dn.dance(c, { bpm, spb }); }
      };
      let stripVer = 0, stripKey = '', stripLast = null;
      const stripFor = () => {
        // the line's moves under the word: filled as the teacher shows them (and as Mika gets them); made again only when
        // something it shows has changed
        const key = `${lineNo}|${phase}|${demoIdx}|${callIdx}|${stripVer}`;
        if (key === stripKey) return stripLast;
        stripKey = key;
        const line = plan.lines[lineNo];
        if (!line || phase === 'chorus' || phase === 'chorus-call' || phase === 'finale' || phase === 'ready') return (stripLast = null);
        const mine = T.filter(t => t.line === lineNo && !t.chorus);
        return (stripLast = mine.map((t, k) => {
          const st = stripState.get(t.i);
          const shown = plan.style === 'watch' ? (phase === 'watch' ? k <= demoIdx : phase === 'turn' || plan.card === 'always' || !!st) : T[callIdx]?.line === lineNo ? t.i <= callIdx : !!st;
          const icon = shown ? (t.mirror ? 'her' : M[t.move]?.icon) : null;
          const now = (phase === 'copy' || phase === 'along') && t.i === callIdx;
          return { icon, state: st || (now ? 'now' : '') };
        }));
      };
      const feedback = (ev, dn = mika) => {
        if (!ev) return;
        const [hx, hy] = headPx(dn);
        if (ev.type === 'hit') {
          ui.pop(tx(ev.grade === 'perfect' ? 'Perfect!' : 'Good!'), hx, hy, ev.grade);
          sfx.good(audio, ev.grade === 'perfect');
          stripState.set(ev.target.i, 'ok'); stripVer++;
          if (ev.grade === 'perfect') ctx.fx?.burst?.(_v.copy(dn.root.position).add(_p.set(0, 1.2, 0.2)), { n: 8, color: kpop ? [1, 0.45, 0.8] : [1, 0.82, 0.4], speed: 2.2, size: 0.16 });
          if (ev.combo >= 3) ui.pop(tx(N_('Combo ×{n}'), { n: ev.combo }), hx, hy - 34, 'note');
        } else if (ev.type === 'wrong' || ev.type === 'miss') {
          ui.pop(tx(ev.type === 'wrong' ? N_('Oops!') : 'Miss'), hx, hy, 'miss');
          if (ev.type === 'wrong') sfx.miss(audio);
          stripState.set(ev.target.i, 'bad'); stripVer++;
        }
        for (const a of ev.after || []) after(a);
      };
      const after = a => {
        if (a.type === 'clean') {
          const [x, y] = headPx(teacher, 2.2);
          ui.pop(tx(N_('Clean line! +{n}'), { n: a.points }), x, y, 'note');
          sfx.clean(audio);
          clapUntil = songT + 8 * spb;
          if (!ended) say('clean');
        } else if (a.type === 'combo' && a.points) {
          const [x, y] = headPx(mika, 2.2);
          ui.pop(tx(N_('Combo bonus +{n}'), { n: a.points }), x, y, 'note');
          sfx.clean(audio);
        }
      };
      const doPress = (move, t) => {
        if (level === 'easy' && !['left', 'right', 'up', 'down'].includes(move)) return;
        const c = M[move]?.clip;
        if (!c) return;
        // Mika dances whatever is pressed, from a little way into the clip so the move shows at once
        mika.dance(c, { bpm, spb, skip: clipLead(90) * 0.5 });
        ui.press(move);
        if (level === 'normal' && !kpop) for (const k of kids) pendingKids.push({ t: songT + 0.12, k, c });
        if (!started) return;
        feedback(round.press(move, t));
      };

      // ---- the QA autopilot: window.__STARLINE_QA__.danceAuto = { jitter, wrong, skip } dances by itself
      const autoRand = rng(seed + 99);
      let autoNext = 0;
      ctx.debug = { round, plan, mode, look, level, seed, get phase() { return phase; }, get songT() { return songT; }, get started() { return started; }, focus,
        teacher, mika, dancers, crowd, set, press: (m) => queue.push({ move: m, t: songT }) };

      const cardInTheWay = () => {
        const c = document.getElementById('howTo');
        if (!c || c.classList.contains('hidden') || c.classList.contains('shut')) return false;
        const r = c.getBoundingClientRect(), [tx0] = headPx(teacher, 1.0);
        return r.width > 0 && r.right > tx0 - 30;
      };

      const frame = dt => {
        if (ctx.quit) return { score: 0, quit: true };
        if (qa?.danceFail && songT > 2) throw new Error('dance: test failure');      // (a QA probe of the clean-up after an error)
        dt = Math.min(0.1, Math.max(0, dt));
        if (cam.w !== innerWidth || cam.h !== innerHeight || (cam.leftT = (cam.leftT || 0) - dt) <= 0 && (cam.leftT = 0.5) && howToLeft() !== cam.left) aim();
        if ((sweepT -= dt) <= 0) { sweepT = 0.5; if (!focus.active) sweep(); }
        // ---- input: keys (arrows / WASD, Space, Q, R), the pad, the buttons and swipes
        const pads = padStep();
        const keyed = [];
        for (const k of ['left', 'right', 'up', 'down']) if (input.pressed(k) || pads.includes(k)) keyed.push(MOVES[mode][k] ? k : null);
        const ex = slotsOf(mode);
        if (input.pressed('jump')) keyed.push(ex[4]);
        if (input.pressed('aim') || pads.includes('x')) keyed.push(ex[5]);
        if (input.pressed('fire') || pads.includes('y')) keyed.push(ex[6]);
        for (const m of keyed) if (m) queue.push({ move: m, t: songT });
        // ---- the clock waits for talk and, on a first go on a phone, for the How to play card to fold
        if (!started) {
          opening += dt;
          const wait = d.busy > 0 || opening < 1.4 || (ctx.first && opening < 10 && cardInTheWay());
          ui.set({ kind: 'wait', who: name, line: tx(LINES.ready) });
          if (!wait) { started = true; songT = 0; ui.show(true); }
          queue.length = 0;
        } else songT += dt;
        frameAt = performance.now();
        if (started && !ended) {
          // QA autopilot presses
          const A = qa?.danceAuto;
          if (A && typeof A === 'object') {
            while (autoNext < T.length && T[autoNext].t - songT < 0.5) {
              const tg = T[autoNext++], pr = botPress(round, tg, { ...A, rand: autoRand });
              if (pr) pendingKids.push({ t: pr.t, auto: pr.move });
            }
          }
          // ---- the tune: each beat asked for a moment ahead
          while (nextBeat < plan.beats && nextBeat * spb - songT < 0.16) {
            audio.danceBeat?.(mode, nextBeat, nextBeat * spb - songT, spb, { count: nextBeat < 4, energy: glow, crowd: songT < clapUntil || (kpop && glow > 0.3) ? Math.max(0.4, glow) : 0 });
            nextBeat++;
          }
          // ---- cues: a demonstrator's clip starts half a beat early so its accent lands on the beat
          while (ci < cues.length && cues[ci].t - (cues[ci].type === 'demo' ? lead2 : 0) <= songT) {
            const c = cues[ci++];
            if (c.type === 'count') { /* the count-in numbers come from the beat below */ }
            else if (c.type === 'phase') {
              phase = c.phase;
              if (c.line !== undefined) lineNo = c.line;
              if (phase === 'watch') { demoIdx = -1; say('watch'); }
              else if (phase === 'turn') say('turn');
              else if (phase === 'copy') { if (!ctx.first) say('copy'); }
              else if (phase === 'chorus') say('chorus');
              else if (phase === 'finale') {
                say('finale');
                const fin = FINISH[mode];
                for (const dn of all) dn.gesture(dn === singer ? 'Bow' : clipFor(dn, fin) || 'Bow', clipSpeed(bpm));
                for (const cw of crowd) cw.gesture('Cheer');
                sfx.cheer(audio);
              }
            } else if (c.type === 'demo') {
              demoIdx = c.k;
              demo(c.move);
            } else if (c.type === 'call') { callIdx = c.target; callHidden = c.hidden; }
            else if (c.type === 'say') say(c.key);
            else if (c.type === 'end') ended = true;
          }
          // Easy: the teacher dances each copied move with Mika (a help the later levels leave out)
          if (plan.card === 'always' && phase === 'copy') {
            for (const tg of T) if (tg.line === lineNo && !tg.demoed && tg.t - lead2 <= songT) { tg.demoed = true; demo(tg.move); }
          }
          if (phase === 'chorus') {
            for (const tg of T) if (tg.chorus && !tg.demoed && tg.t - lead2 <= songT) { tg.demoed = true; chorusFree(); }
          }
          // ---- presses (the autopilot's at their own moment) and the beats that went by
          for (let i = pendingKids.length - 1; i >= 0; i--) { const pk = pendingKids[i]; if (pk.auto && pk.t <= songT) { pendingKids.splice(i, 1); doPress(pk.auto, pk.t); } }
          for (const q of queue) doPress(q.move, q.t);
          queue.length = 0;
          for (const ev of round.update(songT)) {
            if (ev.type === 'miss') feedback(ev);
            else if (ev.type === 'end') ended = true;
            else after(ev);
          }
          // Byeol sings on: a reach or a raised mic every two bars
          if (singer && nextBeat % 8 === 0 && singer.lastFlair !== nextBeat && nextBeat > 4) { singer.lastFlair = nextBeat; if (!singer.anim?.busy) singer.gesture(nextBeat % 16 ? 'SingReach' : 'MicRaise', clipSpeed(bpm)); }
        } else if (ended) {
          outro += dt;
        }
        // kids copying Mika a moment later, and the autopilot's presses at their own time
        for (let i = pendingKids.length - 1; i >= 0; i--) {
          const pk = pendingKids[i];
          if (pk.t > songT) continue;
          pendingKids.splice(i, 1);
          if (pk.auto) doPress(pk.auto, pk.t); else pk.k.dance(pk.c, { bpm, spb });
        }
        // ---- the card
        const beatF = songT / spb, beatN = Math.floor(beatF);
        if (started) {
          const tg = T[callIdx];
          const ringOn = tg && !round.grades[tg.i] && songT >= tg.t - 2 * spb && songT <= tg.t + plan.win.good;
          let kind = 'wait', move = null, said = null, count = 0;
          if (beatN < 4) { kind = 'count'; count = 5 + beatN; }
          else if (phase === 'watch' && demoIdx >= 0) { kind = 'move'; move = plan.lines[lineNo].moves[demoIdx]; }
          else if ((phase === 'copy' || phase === 'along' || phase === 'chorus') && tg) {
            if (tg.chorus) kind = 'free';
            else if (callHidden) kind = 'ask';
            else if (tg.call.kind === 'her') { kind = 'her'; said = tg.call.said; }
            else { kind = 'move'; move = tg.move; }
          }
          const sayLife = sayT < 4.5 ? lineText() : '';
          sayT += dt;
          ui.set({ kind, move, said, count, phase, who: sayLife ? name : '', line: sayLife, strip: stripFor() });
          ui.ring(ringOn ? clamp(1 - (tg.t - songT) / (2 * spb), 0, 1) : null);
          ui.beat(beatN);
          ui.cue(plan.card === 'always' && phase === 'copy' && ringOn && tg ? tg.move : null);
        }
        // ---- the look: lanterns or stage lights follow the dancing and pulse on the beat
        glow += (round.glow - glow) * Math.min(1, dt * 3);
        pulse = started ? Math.max(0, 1 - (beatF - beatN) * 3) : 0;
        set.light(clamp(glow * 0.85 + pulse * 0.15, 0, 1), beatF, songT);
        // the watchers: they clap (or wave their light sticks) while the dancing goes well
        const cheering = songT < clapUntil || (kpop && glow > 0.3) || (!kpop && glow > 0.7);
        for (const cw of crowd) {
          const want = cheering && started && !ended ? (kpop ? 'StickWave' : 'Clap') : 'Idle';
          if (cw.wantIdle !== want) { cw.wantIdle = want; cw.idle(want, want === 'Idle' ? 1 : clipSpeed(bpm)); }
        }
        for (const dn of all) dn.update(dt);
        for (const cw of crowd) cw.update(dt);
        ctx.hud(round.score, started ? round.left : plan.length);
        if (ended && outro > FINALE_HOLD) {
          const r = round.result();
          const note = tx(N_('{perfect} perfect · {good} good · {missed} missed'), { perfect: r.perfect, good: r.good, missed: r.missed });
          const fact = kpop ? { title: tx(N_('On the K-pop stage')), text: tx(N_('K-pop dancers practise the same moves again and again in front of a mirror. At a show the crowd sings a fan chant back and waves light sticks on the beat.')) } : null;
          return { score: r.score, note, fact, detail: { ...r, mode, look, level, seed } };
        }
        return undefined;
      };
      frame(0);
      ctx.fade(false, 320);
      return await ctx.loop(frame);
    } finally {
      card?.destroy();
      ui?.destroy();
      try { focus?.exit(); } catch (e) { console.warn('[dance] focus exit', e); }
      for (const dn of dancers) { dn.dropClips(); }
      for (const dn of crowd) dn.dropClips();
      for (const n of npcs) { n.anim?.mixer.stopAllAction(); n.root.removeFromParent(); disposeRigs(n.root); }
      restoreBody?.();
      if (set) set.group.removeFromParent();
      owned.forEach(o => { try { o.dispose?.(); } catch { /* ignore */ } });
      for (const [o, v] of hidden) o.visible = v;
      if (hoaHidden) hoaHidden.setHidden(false);
      if (sign) sign.hidden = false;
      if (tamoShown) tamo.show?.(p.pos.clone().add(new THREE.Vector3(0, 1.6, 0)));
      audio.holdMusic?.('dance', false);
      if (fill) g.lights?.remove(fill);
      follow.fovBase = saved.fov; follow.camera.fov = saved.camFov; follow.camera.updateProjectionMatrix();
      follow.camera.position.copy(saved.camPos); follow.camera.quaternion.copy(saved.camRot); follow.look.copy(saved.look); follow.pos.copy(saved.pos);
      ctx.setNight(false);
      ctx.fade(false, 0);
      ctx.lock(false);
      input.releaseAll?.();
    }
  },
};
const FINALE_HOLD = 2.6;          // seconds the bow and the cheering last after the song before the results card

/**
 * Take over Mika's body for the round: her update only places and poses her (the round sets it). The returned function
 * puts her back exactly: her place, her update, the clips the round added and her own clip.
 */
function takeBody(player) {
  const fields = ['facing', 'swimming', 'pitch', 'speed', 'grounded', 'locked'];
  const had = new Map(['update', ...fields].map(k => [k, Object.getOwnPropertyDescriptor(player, k)]));
  const pos = player.pos.clone(), vel = player.vel.clone();
  const rootPos = player.root.position.clone(), rootRot = player.root.rotation.clone(), pivotRot = player.pivot.rotation.clone();
  const anim = player.anim, clip = anim?.currentName, clipTime = anim?.current?.time || 0, clipSpeed0 = anim?.current?.timeScale || 1;
  let done = false;
  anim?.cancelOneShot?.();
  player.swimming = false; player.grounded = true; player.locked = true; player.pitch = 0; player.speed = 0; player.vel.set(0, 0, 0);
  player.pivot.rotation.set(0, 0, 0);
  // her lantern waits out the dance (on the belt it sat right where the hat hangs); nothing else moves it meanwhile
  const lantern = player.lantern, lanternShown = lantern?.visible;
  if (lantern) lantern.visible = false;
  return () => {
    if (done) return;
    done = true;
    if (lantern) lantern.visible = lanternShown;
    // the round's clips leave her animator (the Dancer that added them is gone with the round)
    const extra = [];
    if (anim) for (const n of anim.clips.keys()) if (!(anim.root.userData.clips || []).some(c => c.name === n)) extra.push(n);
    for (const n of extra) {
      const act = anim.actions.get(n);
      if (act) { act.stop(); anim.mixer.uncacheAction(act.getClip(), anim.root); anim.actions.delete(n); }
      const c = anim.clips.get(n);
      if (c) anim.mixer.uncacheClip(c);
      anim.clips.delete(n);
    }
    // a prop the round put in her hand
    for (const o of [...(player.grip?.children || [])]) if (o.userData?.danceProp) o.removeFromParent();
    player.pos.copy(pos); player.vel.copy(vel);
    player.root.position.copy(rootPos); player.root.rotation.copy(rootRot); player.pivot.rotation.copy(pivotRot);
    for (const [k, dsc] of had) { if (dsc) Object.defineProperty(player, k, dsc); else delete player[k]; }
    anim?.cancelOneShot?.();
    if (anim) { anim.current = null; anim.currentName = ''; }
    if (clip) anim?.snap?.(clip, { speed: clipSpeed0, time: clipTime });
    else anim?.snap?.('Idle');
  };
}
