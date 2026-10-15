// The "How to play" card: a small panel on the left edge of the screen while a mini game runs. Each row is one thing
// to do: a little moving picture (drawn here as SVG, no files to load), the control for the device in use (keyboard
// and mouse, touch, gamepad) and a short line. It folds down to a round "?" button (by itself on a phone after a few
// seconds, so it never hides the game) and opens again with a tap.
//
// The rows per game live in HOWTO below, keyed like the Mini games menu (`trick:<id>`, `yard:<id>`, `fish`). A game with
// no entry simply shows no card. Archery, the cow race and the swimming lesson bring their own guides and are left out on purpose.
import { N_, tx } from '../i18n/i18n.js';

/**
 * Rows: { in, pic, text, touch? }.
 *   in    the control: 'move' | 'lr' | 'creep' | 'act' | 'hold' | 'jump' | 'tap' | 'aim' | 'sow' | null (a rule, no control)
 *   pic   the picture (PICS below)
 *   text  one short line (English source string)
 *   touch the name of the game's own touch button when it is not "Do it" (English source string)
 */
export const HOWTO = {
  'trick:floatsafe': [
    { in: null, pic: 'starfloat', text: N_('Fell in? Do not thrash. Lie back and float.') },
    { in: 'hold', pic: 'fill', text: N_('Breathe: hold as the ring grows, then let go.') },
    { in: null, pic: 'buoy', text: N_('A friend fell in? Shout, and throw a float.') },
  ],
  'trick:firefly': [
    { in: 'creep', pic: 'soft', text: N_('Walk softly. Running scares them away.') },
    { in: 'act', pic: 'glow', text: N_('Sweep the net while they glow.') },
    { in: null, pic: 'trio', text: N_('Big slow blinkers are worth more.') },
  ],
  'trick:roast': [
    { in: 'act', pic: 'ember', text: N_('Cover a potato. Big ones take longest.') },
    { in: 'act', pic: 'turn', text: N_('Rocking: turn it. Steam: dig it out!') },
    { in: 'jump', pic: 'fan', text: N_('Fan the ash when it goes grey.'), touch: N_('Fan') },
  ],
  'trick:firedrill': [
    { in: 'act', pic: 'shout', text: N_('Shout "Fire!" first. Take an extinguisher.') },
    { in: 'jump', pic: 'pin', text: N_('Stand in the ring. Pull the pin.'), touch: N_('Pull pin') },
    { in: 'hold', pic: 'sweep', text: N_('Aim low, squeeze, sweep side to side.') },
  ],
  'trick:river': [
    { in: 'move', pic: 'walk', text: N_('Wade slowly through the shallows.') },
    { in: null, pic: 'fill', text: N_('Keep the light on a fish to name it.') },
  ],
  'trick:stars': [
    { in: 'aim', pic: 'aim', text: N_('Point at a bright star.') },
    { in: 'tap', pic: 'stars', text: N_('Join the stars of a figure in order.') },
    { in: null, pic: 'north', text: N_('N on the horizon is north. Look there first.') },
  ],
  'trick:frogs': [
    { in: 'move', pic: 'walk', text: N_('Walk while the frogs sing.') },
    { in: null, pic: 'stop', text: N_('Stand still when they go quiet.') },
    { in: 'tap', pic: 'beat', text: N_('Then copy the order they sang in.') },
  ],
  'trick:kite': [
    { in: 'act', pic: 'mark', text: N_('Press when the marker is in the green.') },
    { in: 'lr', pic: 'steer', text: N_('Stay in the wind. Fly through the rings.') },
    { in: 'jump', pic: 'up', text: N_('Tug the line to climb.') },
  ],
  'trick:planes': [
    { in: 'act', pic: 'fold', text: N_('Fold: press when the dot is in the ring.') },
    { in: 'hold', pic: 'fill', text: N_('Hold to wind up. Let go to throw!') },
    { in: null, pic: 'glide', text: N_('Gentle and level flies furthest.') },
  ],
  'trick:dew': [
    { in: 'move', pic: 'walk', text: N_('Walk round until the sun is behind you.') },
    { in: 'act', pic: 'camera', text: N_('The web shines? Take a photo.') },
  ],
  'trick:beetles': [
    { in: 'move', pic: 'walk', text: N_('Walk up to a tree and read its name.') },
    { in: 'act', pic: 'mark', text: N_('Press when the marker is in the green.') },
    { in: 'hold', pic: 'fill', text: N_('Lift slowly: hold, let go, hold again.') },
  ],
  'trick:hoppers': [
    { in: 'creep', pic: 'soft', text: N_('Creep up. Fast steps scare them.') },
    { in: 'act', pic: 'ring', text: N_('Swing the net at the ring.') },
    { in: 'hold', pic: 'fill', text: N_('Hold and let go: a wide, quiet sweep.') },
  ],
  'trick:cricket': [
    { in: 'move', pic: 'walk', text: N_('Walk toward the song.') },
    { in: null, pic: 'stop', text: N_('Stand still when it goes quiet.') },
    { in: 'act', pic: 'ring', text: N_('Tap on its beat, softly.') },
  ],
  'trick:lifecycle': [
    { in: 'tap', pic: 'cards', text: N_('Pick the cards in the right order.') },
    { in: 'jump', pic: 'tick', text: N_('Press Check when you are sure.'), touch: N_('Check') },
    { in: null, pic: 'trio', text: N_('No hurry. A wrong answer can be tried again.') },
  ],
  'trick:crops': [
    { in: 'tap', pic: 'cards', text: N_('Pick the right card, or lay a row in order.') },
    { in: 'jump', pic: 'tick', text: N_('Press Check when you are sure.'), touch: N_('Check') },
    { in: null, pic: 'trio', text: N_('No hurry. A wrong answer can be tried again.') },
  ],
  'trick:eggs': [
    { in: 'lr', pic: 'hat', text: N_('Catch each egg in your hat.'), touchTap: true },
    { in: null, pic: 'ladder', text: N_('An egg takes every rung it meets.') },
    { in: null, pic: 'trio', text: N_('A golden egg counts for three.') },
  ],
  'trick:dance': [
    { in: 'arrows', pic: 'dance', text: N_('Watch, then copy each move.') },
    { in: null, pic: 'ring', text: N_('Press as the ring closes: on the beat!') },
    { in: 'extra', pic: 'trio', text: N_('New moves have keys of their own.') },
  ],
  'yard:footnet': [
    { in: 'move', pic: 'walk', text: N_('Run under the shuttle.') },
    { in: 'act', pic: 'ball', text: N_('Kick just as it comes down.') },
    { in: 'move', pic: 'aim', text: N_('Hold a direction to aim your kick.') },
  ],
  'yard:keepup': [
    { in: 'move', pic: 'walk', text: N_('Run under the shuttle.') },
    { in: 'act', pic: 'ball', text: N_('Kick just as it comes down.') },
    { in: 'move', pic: 'aim', text: N_('A friend calls? Aim the kick at them.') },
  ],
  'yard:volley': [
    { in: 'move', pic: 'walk', text: N_('Run under the ball.') },
    { in: 'act', pic: 'ball', text: N_('Hit just as it comes down.') },
    { in: null, pic: 'trio', text: N_('Bump, set, then spike!') },
  ],
  'yard:rope': [
    { in: 'act', pic: 'rope', text: N_('Jump just before the rope touches the ground.') },
    { in: null, pic: 'beat', text: N_('Keep the beat. It gets quicker.') },
  ],
  'yard:tug': [
    { in: 'act', pic: 'ring', text: N_('Pull when the ring closes on you.') },
    { in: null, pic: 'beat', text: N_('Off the beat tires you out.') },
    { in: null, pic: 'stop', text: N_('A red ring means hold: do not pull.') },
  ],
  'yard:sack': [
    { in: 'act', pic: 'beat', text: N_('One press for every hop.') },
    { in: null, pic: 'stop', text: N_('Steady wins. Too fast and you wobble.') },
    { in: 'jump', pic: 'up', text: N_('A log in the way? Leap over it.') },
  ],
  'yard:oanquan': [
    { in: 'lr', pic: 'steer', text: N_('Pick one of your squares.'), touchTap: true },
    { in: 'sow', pic: 'sow', text: N_('Sow the pebbles left or right.') },
    { in: null, pic: 'trio', text: N_('An empty square, then a full one: yours!') },
  ],
  'yard:marbles': [
    { in: 'aim', pic: 'aim', text: N_('Aim at a marble.') },
    { in: 'hold', pic: 'fill', text: N_('Hold, then let go to flick.'), touch: N_('Hold to flick') },
  ],
  fish: [
    { in: 'tap', pic: 'cast', text: N_('Cast where the fish swim.') },
    { in: 'act', pic: 'float', text: N_('Hook it when the float sinks.'), touch: N_('Hook!') },
    { in: 'hold', pic: 'fill', text: N_('Hold to reel. Let go when the line strains.'), touch: N_('Reel') },
  ],
};

// ------------------------------------------------------------------------------------------------ pictures
// 40 x 40 drawings; the moving parts carry a class the CSS below animates (transform-box: fill-box keeps the maths local).
const INK = '#5a3a22', HOT = '#f08a3c', GREEN = '#3fae4a', SUN = '#ffd23f', BLUE = '#57b7e8';
// a shoe print: the sole and, under a gap, the heel (two plain ovals side by side read as a pair of eyes)
const foot = (x, y, c, k = 1) => `<g class="${c}" fill="${INK}"><ellipse cx="${x}" cy="${y - 2.2 * k}" rx="${3.4 * k}" ry="${4.4 * k}"/><ellipse cx="${x}" cy="${y + 4.6 * k}" rx="${2.5 * k}" ry="${2 * k}"/></g>`;
export const PICS = {
  walk: `${foot(13, 27, 'hp-a')}${foot(21, 18, 'hp-b')}<path d="M28 26V11m-5 5 5-6 5 6" fill="none" stroke="${HOT}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  soft: `${foot(11, 29, 'hp-sa', 0.8)}${foot(20, 21, 'hp-sb', 0.8)}${foot(29, 13, 'hp-sc', 0.8)}<path d="M5 11c3-3 5 3 8 0" fill="none" stroke="${BLUE}" stroke-width="2.4" stroke-linecap="round"/>`,
  stop: `${foot(14, 27, '')}${foot(26, 27, '')}<g class="hp-blink"><rect x="13" y="4" width="5" height="10" rx="2" fill="${HOT}"/><rect x="22" y="4" width="5" height="10" rx="2" fill="${HOT}"/></g>`,
  ring: `<circle cx="20" cy="20" r="7" fill="none" stroke="${INK}" stroke-width="2.4"/><circle class="hp-close" cx="20" cy="20" r="17" fill="none" stroke="${HOT}" stroke-width="3"/><circle class="hp-pop" cx="20" cy="20" r="5" fill="${GREEN}"/>`,
  fill: `<circle cx="20" cy="20" r="13" fill="none" stroke="#e6d3b0" stroke-width="5"/><circle class="hp-fill" cx="20" cy="20" r="13" fill="none" stroke="${HOT}" stroke-width="5" stroke-linecap="round" stroke-dasharray="81.7" transform="rotate(-90 20 20)"/><circle class="hp-pop2" cx="20" cy="20" r="5" fill="${GREEN}"/>`,
  glow: `<circle class="hp-halo" cx="20" cy="20" r="14" fill="${SUN}"/><circle cx="20" cy="20" r="5" fill="#b9c63a"/><circle class="hp-lamp" cx="20" cy="20" r="5" fill="#fff7a8"/><circle class="hp-net" cx="20" cy="20" r="11" fill="none" stroke="${INK}" stroke-width="2.4" stroke-dasharray="4 3"/>`,
  mark: `<rect x="4" y="16" width="32" height="8" rx="4" fill="#e6d3b0"/><rect x="16" y="16" width="9" height="8" fill="${GREEN}"/><path class="hp-slide" d="M6 9l4 6 4-6z" fill="${HOT}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`,
  steer: `<path d="M5 20l6-6v12zm30 0-6-6v12z" fill="${INK}"/><circle class="hp-sway" cx="20" cy="20" r="5" fill="${HOT}"/>`,
  up: `<path d="M20 34V22" stroke="${INK}" stroke-width="2" stroke-dasharray="3 3"/><path class="hp-rise" d="M20 6l8 9-8 9-8-9z" fill="${HOT}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  aim: `<circle cx="27" cy="14" r="9" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="27" cy="14" r="4" fill="${HOT}"/><g class="hp-seek"><circle cx="27" cy="14" r="6.5" fill="none" stroke="${GREEN}" stroke-width="2.6"/><path d="M27 4v5m0 10v5M17 14h5m10 0h5" stroke="${GREEN}" stroke-width="2.2" stroke-linecap="round"/></g>`,
  beat: `<circle class="hp-b1" cx="8" cy="20" r="5" fill="${HOT}"/><circle class="hp-b2" cx="20" cy="20" r="5" fill="${HOT}"/><circle class="hp-b3" cx="32" cy="20" r="5" fill="${HOT}"/>`,
  ball: `<path d="M8 33h24" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="27" r="8" fill="none" stroke="${GREEN}" stroke-width="2" stroke-dasharray="3 3"/><circle class="hp-drop" cx="20" cy="8" r="5" fill="${HOT}" stroke="${INK}" stroke-width="1.4"/>`,
  rope: `<path class="hp-swing" d="M4 12q16 30 32 0" fill="none" stroke="${HOT}" stroke-width="3" stroke-linecap="round"/><path d="M6 35h28" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><g class="hp-hop"><circle cx="20" cy="17" r="4" fill="${INK}"/><path d="M20 21v7" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></g>`,
  cast: `<path d="M3 28q5-4 10 0t10 0 10 0 6-2" fill="none" stroke="${BLUE}" stroke-width="2.6" stroke-linecap="round"/><ellipse class="hp-ripple" cx="24" cy="29" rx="9" ry="3" fill="none" stroke="${BLUE}" stroke-width="2"/><g class="hp-plop"><circle cx="24" cy="12" r="4.5" fill="${HOT}" stroke="${INK}" stroke-width="1.4"/><path d="M24 7.5V3" stroke="${INK}" stroke-width="1.6"/></g>`,
  float: `<path d="M3 22q5-4 10 0t10 0 10 0 6-2" fill="none" stroke="${BLUE}" stroke-width="2.6" stroke-linecap="round"/><g class="hp-sink"><circle cx="20" cy="18" r="5" fill="${HOT}" stroke="${INK}" stroke-width="1.4"/><path d="M20 13V7" stroke="${INK}" stroke-width="1.6"/></g><path class="hp-bang" d="M31 5v8m0 4v2" stroke="${GREEN}" stroke-width="3.4" stroke-linecap="round"/>`,
  camera: `<rect x="6" y="13" width="28" height="19" rx="4" fill="${INK}"/><rect x="14" y="8" width="10" height="6" rx="2" fill="${INK}"/><circle cx="20" cy="22.5" r="6" fill="#fff"/><circle cx="20" cy="22.5" r="3" fill="${BLUE}"/><circle class="hp-flash" cx="30" cy="9" r="6" fill="${SUN}"/>`,
  stars: `<path class="hp-draw" d="M6 28l9-8 9 4 10-14" fill="none" stroke="${HOT}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="44"/><circle cx="6" cy="28" r="3.2" fill="${SUN}" stroke="${INK}" stroke-width="1.2"/><circle cx="15" cy="20" r="3.2" fill="${SUN}" stroke="${INK}" stroke-width="1.2"/><circle cx="24" cy="24" r="3.2" fill="${SUN}" stroke="${INK}" stroke-width="1.2"/><circle cx="34" cy="10" r="3.2" fill="${SUN}" stroke="${INK}" stroke-width="1.2"/>`,
  north: `<circle cx="20" cy="23" r="13" fill="#fff" stroke="${INK}" stroke-width="2"/><path d="M20 12.5l4 10.5h-8z" fill="${HOT}"/><path d="M20 33.5l4-10.5h-8z" fill="#c9b48e"/><circle cx="20" cy="23" r="1.8" fill="${INK}"/><circle class="hp-b2" cx="20" cy="4.5" r="3" fill="${SUN}" stroke="${INK}" stroke-width="1.2"/>`,
  sow: `<rect x="3" y="14" width="10" height="12" rx="2" fill="#e6d3b0"/><rect x="15" y="14" width="10" height="12" rx="2" fill="#e6d3b0"/><rect x="27" y="14" width="10" height="12" rx="2" fill="#e6d3b0"/><circle class="hp-step" cx="8" cy="20" r="3.4" fill="${INK}"/>`,
  trio: `<circle class="hp-b1" cx="9" cy="26" r="4" fill="${BLUE}"/><circle class="hp-b2" cx="20" cy="20" r="6" fill="${GREEN}"/><path class="hp-b3" d="M32 5l2.4 5 5.4.6-4 3.8 1.1 5.4-4.9-2.7-4.9 2.7 1.1-5.4-4-3.8 5.4-.6z" fill="${SUN}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round" transform="translate(-3 3)"/>`,
  ember: `<path d="M6 30q14-14 28 0z" fill="#8d8078"/><path class="hp-warm" d="M6 30q14-14 28 0z" fill="${HOT}"/><g class="hp-steam" fill="none" stroke="#9bb7c4" stroke-width="2.2" stroke-linecap="round"><path d="M15 14q-3-3 0-6"/><path d="M21 12q-3-3 0-6"/><path d="M27 14q-3-3 0-6"/></g>`,
  fan: `<path class="hp-fan" d="M20 30L8 14q12-9 24 0z" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M20 36v-8" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  // an egg rolling down a gutter, over a rung and down the next gutter (the Amidakuji rule of the egg game)
  ladder: `<path d="M12 4v32M28 4v32" fill="none" stroke="${GREEN}" stroke-width="5" stroke-linecap="round"/><path d="M12 20h16" stroke="${SUN}" stroke-width="5" stroke-linecap="round"/><ellipse class="hp-egg" cx="12" cy="7" rx="4" ry="5" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`,
  // an egg dropping into a straw hat held upside-down
  hat: `<path d="M5 24h30l-2.5 4h-25z" fill="${SUN}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 28h16l-2 8H14z" fill="${SUN}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/><path d="M12.6 30.5h14.8" stroke="${HOT}" stroke-width="2.4"/><ellipse class="hp-drop" cx="20" cy="6" rx="4" ry="5" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`,
  // a picture card dropping into the first of three places (the life-cycle card game), and a tick for its Check button
  cards: `<g fill="#e6d3b0"><rect x="3" y="23" width="10" height="14" rx="2.5"/><rect x="15" y="23" width="10" height="14" rx="2.5"/><rect x="27" y="23" width="10" height="14" rx="2.5"/></g><g class="hp-drop"><rect x="3" y="4" width="10" height="14" rx="2.5" fill="#fff" stroke="${INK}" stroke-width="1.5"/><ellipse cx="8" cy="11" rx="2.6" ry="3.4" fill="${HOT}"/></g>`,
  // a sheet of paper with its corner folding in to the middle line, and a paper plane on its glide (the paper planes game)
  fold: `<rect x="9" y="5" width="22" height="30" rx="2" fill="#fff" stroke="${INK}" stroke-width="1.6"/><path d="M20 6v28" stroke="#b89a78" stroke-width="1.4" stroke-dasharray="3 3"/><path class="hp-b2" d="M9 5h11L9 16z" fill="${HOT}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="20" cy="16" r="3" fill="none" stroke="${GREEN}" stroke-width="2"/>`,
  glide: `<path d="M4 12q18-4 32 16" fill="none" stroke="${BLUE}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="1 5"/><path d="M4 34h32" stroke="${GREEN}" stroke-width="3" stroke-linecap="round"/><path class="hp-sway" d="M30 17 12 13l7 5-2 6z" fill="#fff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  tick: `<circle cx="20" cy="20" r="14" fill="#e6d3b0"/><path class="hp-b2" d="M12 21l6 6 11-13" fill="none" stroke="${GREEN}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  // the fire drill: a shout, the pin drawn out of the extinguisher, the nozzle's mark sweeping along the foot of a flame
  shout: `<circle cx="13" cy="24" r="8" fill="${SUN}" stroke="${INK}" stroke-width="1.5"/><ellipse cx="14" cy="27" rx="3" ry="3.6" fill="${INK}"/><circle cx="10" cy="21" r="1.2" fill="${INK}"/><circle cx="16.5" cy="21" r="1.2" fill="${INK}"/><g class="hp-blink" fill="none" stroke="${HOT}" stroke-width="2.6" stroke-linecap="round"><path d="M25 16l5-5M27 24h8M25 32l5 4"/></g>`,
  pin: `<rect x="6" y="16" width="15" height="20" rx="4" fill="#e23a2c" stroke="${INK}" stroke-width="1.5"/><rect x="10" y="9" width="7" height="7" fill="${INK}"/><path d="M8 8h13" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><g class="hp-sway"><circle cx="29" cy="12.5" r="4.4" fill="none" stroke="${SUN}" stroke-width="2.6"/><path d="M18 12.5h7" stroke="${SUN}" stroke-width="2.6" stroke-linecap="round"/></g>`,
  sweep: `<path d="M20 4c2 6 8 9 8 17a8 8 0 0 1-16 0c0-4 2.6-5.6 3.8-9.4 1.3 1.5 1.5 2.8 2.6 4.2 1.2-3 1.4-6.6 1.6-11.8z" fill="${HOT}"/><path d="M20 15c1 3 4 4.4 4 8a4 4 0 0 1-8 0c0-2 1.4-2.8 2-4.6.8 1 1 1.6 1.4 2.2.3-1.4.5-3 .6-5.6z" fill="${SUN}"/><path d="M4 33h32" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><circle class="hp-sway" cx="20" cy="30" r="4.5" fill="none" stroke="${GREEN}" stroke-width="2.8"/>`,
  // a child floating on her back like a star, rocking gently on the water ("Float and wait")
  starfloat: `<path d="M2 24q5-4 9 0t9 0 9 0 9 0" fill="none" stroke="${BLUE}" stroke-width="2.6" stroke-linecap="round"/><g class="hp-rise" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M20 15v8M20 17 9 11M20 17l11-6M20 23l-7 9M20 23l7 9"/><circle cx="20" cy="10.5" r="4.2" fill="${HOT}" stroke-width="1.6"/></g>`,
  // a life ring thrown out onto the water
  buoy: `<path d="M2 31q5-4 9 0t9 0 9 0 9 0" fill="none" stroke="${BLUE}" stroke-width="2.6" stroke-linecap="round"/><g class="hp-plop"><circle cx="24" cy="13" r="7.5" fill="none" stroke="#fff" stroke-width="5.5"/><circle cx="24" cy="13" r="7.5" fill="none" stroke="${HOT}" stroke-width="5.5" stroke-dasharray="5.9 5.9"/><circle cx="24" cy="13" r="10.3" fill="none" stroke="${INK}" stroke-width="1.2"/><circle cx="24" cy="13" r="4.7" fill="none" stroke="${INK}" stroke-width="1.2"/></g>`,
  turn: `<ellipse cx="20" cy="22" rx="11" ry="7" fill="#a8436e" stroke="${INK}" stroke-width="1.4"/><path class="hp-spin" d="M8 12a13 9 0 0 1 24 0m0 0-5-1m5 1 1-5" fill="none" stroke="${HOT}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  // a little dancer stepping from side to side under a conical hat (the Festival dance)
  dance: `<path d="M8 20h-4m4 0-3-3m3 3-3 3M32 20h4m-4 0 3-3m-3 3 3 3" fill="none" stroke="${HOT}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><g class="hp-sway"><path d="M13 12 20 5l7 7z" fill="${SUN}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="20" cy="14.5" r="3.2" fill="${INK}"/><path d="M20 18v8m0-6-5-4m5 4 5-4m-5 10-4 7m4-7 4 7" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/></g>`,
};

const CSS = `
#howTo{position:fixed;left:calc(10px + env(safe-area-inset-left,0px));top:50%;transform:translateY(-50%);z-index:15;width:246px;box-sizing:border-box;
 border-radius:20px;background:rgba(255,247,232,.94);box-shadow:0 6px 20px rgba(40,20,0,.25);font:700 14px Nunito,system-ui,sans-serif;color:#5a3a22;
 zoom:var(--ui-scale,1);pointer-events:none;-webkit-user-select:none;user-select:none;transform-origin:left center}
#howTo.hidden{display:none}
#howTo .hd{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px 5px 8px;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#howTo .hd .q{flex:none;width:28px;height:28px;border-radius:50%;background:#f08a3c;color:#fff;font:600 19px/28px Fredoka,Nunito,sans-serif;text-align:center}
#howTo .hd b{flex:1;font:600 17px Fredoka,Nunito,sans-serif;color:#c2541c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#howTo .hd .x{flex:none;font:700 18px/1 Nunito,sans-serif;color:#b89a78}
#howTo ol{list-style:none;margin:0;padding:0 8px 8px}
#howTo li{display:grid;grid-template-columns:50px 1fr;gap:2px 8px;align-items:center;padding:6px;border-radius:14px;background:#ffffffb8;margin-top:5px}
#howTo li svg{grid-row:1/3;width:50px;height:50px;border-radius:12px;background:#fdeccb;display:block}
#howTo li .c{display:flex;flex-wrap:wrap;gap:3px;align-items:center;min-height:0}
#howTo li .c:empty{display:none}
#howTo li .c:empty + p{grid-row:1/3}
#howTo li p{margin:0;line-height:1.2;font-size:13.5px}
#howTo kbd{display:inline-block;min-width:13px;padding:0 5px;border-radius:6px;background:#fff;box-shadow:0 2px 0 #c9b48c,inset 0 0 0 1.5px #c9b48c;font:700 12px/19px Nunito,sans-serif;color:#5a3a22;text-align:center}
#howTo kbd.pad{border-radius:50%;min-width:19px;padding:0;background:#5a3a22;color:#fff;box-shadow:0 2px 0 #2c1b0e}
#howTo kbd.btn{border-radius:999px;background:#f08a3c;color:#fff;box-shadow:0 2px 0 #b8581a;padding:0 8px}
#howTo .ic{width:22px;height:22px;display:block}
#howTo .hold{font-size:11px;color:#c2541c;text-transform:uppercase;letter-spacing:.3px}
#howTo.shut{width:auto;border-radius:999px;background:rgba(255,247,232,.9)}
#howTo.shut ol,#howTo.shut .hd b,#howTo.shut .hd .x{display:none}
#howTo.shut .hd{padding:6px}
#howTo.shut .hd .q{width:32px;height:32px;line-height:32px}
#howTo.nudge .hd .q{animation:hpNudge 1s ease-out 3}
@media (max-width:700px),(max-height:480px){
 #howTo{top:38%;transform:none;width:190px;font-size:13px}
 #howTo li{grid-template-columns:38px 1fr;padding:5px;margin-top:4px}
 #howTo li svg{width:38px;height:38px}
 #howTo li p{font-size:12.5px}
}
@media (max-height:480px){
 #howTo{top:30%;width:196px}
 #howTo li{grid-template-columns:30px 1fr;padding:3px 5px;margin-top:3px}
 #howTo li svg{width:30px;height:30px}
 #howTo li p{font-size:12px;line-height:1.15}
 #howTo .hd{padding:4px 8px 2px 6px}
 #howTo ol{padding:0 6px 6px}
}
#howTo svg *{transform-box:fill-box;transform-origin:center}
#howTo .hp-a{animation:hpStepA 1.2s steps(1) infinite}
#howTo .hp-b{animation:hpStepA 1.2s steps(1) -.6s infinite}
#howTo .hp-sa{animation:hpSoft 3s ease-in-out infinite}
#howTo .hp-sb{animation:hpSoft 3s ease-in-out -2s infinite}
#howTo .hp-sc{animation:hpSoft 3s ease-in-out -1s infinite}
#howTo .hp-blink{animation:hpBlink 1.2s steps(1) infinite}
#howTo .hp-close{animation:hpClose 1.5s linear infinite}
#howTo .hp-pop{animation:hpPop 1.5s linear infinite}
#howTo .hp-fill{animation:hpFill 2.2s linear infinite}
#howTo .hp-pop2{animation:hpPop2 2.2s linear infinite}
#howTo .hp-halo,#howTo .hp-lamp{animation:hpGlow 2.4s ease-in-out infinite}
#howTo .hp-net{animation:hpNet 2.4s ease-in-out infinite}
#howTo .hp-slide{animation:hpSlide 1.8s ease-in-out infinite alternate}
#howTo .hp-sway{animation:hpSway 1.6s ease-in-out infinite alternate}
#howTo .hp-rise{animation:hpRise 1.2s ease-in-out infinite}
#howTo .hp-seek{animation:hpSeek 2.4s ease-in-out infinite}
#howTo .hp-b1{animation:hpBeat 1.5s ease-out infinite}
#howTo .hp-b2{animation:hpBeat 1.5s ease-out .5s infinite}
#howTo .hp-b3{animation:hpBeat 1.5s ease-out 1s infinite}
#howTo .hp-drop{animation:hpDrop 1.4s ease-in infinite}
#howTo .hp-swing{animation:hpSwing 1.2s ease-in-out infinite}
#howTo .hp-hop{animation:hpHop 1.2s ease-in-out infinite}
#howTo .hp-plop{animation:hpPlop 2s ease-in infinite}
#howTo .hp-ripple{animation:hpRipple 2s ease-out infinite}
#howTo .hp-sink{animation:hpSink 2.2s ease-in-out infinite}
#howTo .hp-bang{animation:hpBang 2.2s steps(1) infinite}
#howTo .hp-flash{animation:hpFlash 1.8s ease-out infinite}
#howTo .hp-draw{animation:hpDraw 2.6s ease-in-out infinite}
#howTo .hp-step{animation:hpStep 2.1s steps(1) infinite}
#howTo .hp-warm{animation:hpWarm 3s ease-in-out infinite}
#howTo .hp-steam{animation:hpSteam 3s ease-in-out infinite}
#howTo .hp-fan{animation:hpFan .7s ease-in-out infinite alternate;transform-origin:50% 100%}
#howTo .hp-spin{animation:hpSpin 1.8s ease-in-out infinite}
#howTo .hp-egg{animation:hpEgg 2.6s linear infinite}
@keyframes hpStepA{0%{opacity:1}50%{opacity:.25}}
@keyframes hpSoft{0%,100%{opacity:.15}35%,60%{opacity:1}}
@keyframes hpBlink{0%{opacity:1}50%{opacity:.2}}
@keyframes hpClose{0%{transform:scale(1);opacity:.2}75%{transform:scale(.42);opacity:1}100%{transform:scale(.42);opacity:1}}
@keyframes hpPop{0%,70%{transform:scale(0)}80%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes hpFill{0%{stroke-dashoffset:81.7}70%,100%{stroke-dashoffset:0}}
@keyframes hpPop2{0%,72%{transform:scale(0)}82%{transform:scale(1.3)}100%{transform:scale(1)}}
@keyframes hpGlow{0%,100%{opacity:0}45%,65%{opacity:.95}}
@keyframes hpNet{0%,35%{transform:translate(14px,-14px);opacity:0}55%,75%{transform:none;opacity:1}100%{transform:none;opacity:0}}
@keyframes hpSlide{from{transform:translateX(0)}to{transform:translateX(20px)}}
@keyframes hpSway{from{transform:translateX(-6px)}to{transform:translateX(6px)}}
@keyframes hpRise{0%,100%{transform:translateY(5px)}50%{transform:translateY(-1px)}}
@keyframes hpSeek{0%,15%{transform:translate(-16px,14px);opacity:.5}60%,100%{transform:none;opacity:1}}
@keyframes hpBeat{0%{transform:scale(1.5)}30%,100%{transform:scale(.7)}}
@keyframes hpDrop{0%{transform:translateY(0)}70%,100%{transform:translateY(19px)}}
@keyframes hpSwing{0%,100%{transform:scaleY(1)}50%{transform:scaleY(-.5)}}
@keyframes hpHop{0%,100%{transform:translateY(4px)}45%,60%{transform:translateY(-4px)}}
@keyframes hpPlop{0%{transform:translate(-14px,-6px)}45%,100%{transform:translateY(14px)}}
@keyframes hpRipple{0%,40%{transform:scale(.2);opacity:0}50%{opacity:1}100%{transform:scale(1.2);opacity:0}}
@keyframes hpSink{0%,55%{transform:none}70%,90%{transform:translateY(9px)}100%{transform:none}}
@keyframes hpBang{0%{opacity:0}66%{opacity:1}92%{opacity:0}}
@keyframes hpFlash{0%,60%{transform:scale(0);opacity:0}70%{transform:scale(1.3);opacity:1}100%{transform:scale(1.6);opacity:0}}
@keyframes hpDraw{0%{stroke-dashoffset:44}70%,100%{stroke-dashoffset:0}}
@keyframes hpStep{0%{transform:none}33%{transform:translateX(12px)}66%{transform:translateX(24px)}}
@keyframes hpWarm{0%,20%{opacity:0}60%,100%{opacity:1}}
@keyframes hpSteam{0%,55%{opacity:0;transform:translateY(3px)}75%,100%{opacity:1;transform:none}}
@keyframes hpFan{from{transform:rotate(-16deg)}to{transform:rotate(16deg)}}
@keyframes hpSpin{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes hpEgg{0%{transform:none}30%{transform:translateY(13px)}62%{transform:translate(16px,13px)}90%,100%{transform:translate(16px,26px)}}
@keyframes hpNudge{0%{box-shadow:0 0 0 0 rgba(240,138,60,.8)}100%{box-shadow:0 0 0 14px rgba(240,138,60,0)}}
@media (prefers-reduced-motion:reduce){#howTo svg *{animation:none!important}}
`;

// ------------------------------------------------------------------------------------------------ the controls
const STICK = `<svg class="ic" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9.5" fill="#fff" stroke="#c9b48c" stroke-width="1.5"/><circle cx="13" cy="9" r="5" fill="#5a3a22"/></svg>`;
const FINGER = `<svg class="ic" viewBox="0 0 22 22"><circle cx="11" cy="8" r="6.5" fill="none" stroke="#f08a3c" stroke-width="1.6" stroke-dasharray="3 2.4"/><path d="M11 8v9m-3.4-2.6L11 17l3.4-2.6" fill="none" stroke="#5a3a22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="rotate(180 11 12.5)"/><circle cx="11" cy="8" r="2.6" fill="#5a3a22"/></svg>`;
const MOUSE = `<svg class="ic" viewBox="0 0 22 22"><rect x="5.5" y="2" width="11" height="18" rx="5.5" fill="#fff" stroke="#5a3a22" stroke-width="1.6"/><path d="M11 2v7M5.5 9h11" stroke="#5a3a22" stroke-width="1.4"/><path d="M6.3 8.2V7.5A4.7 4.7 0 0 1 10.3 2.9v5.3z" fill="#f08a3c"/></svg>`;
// a finger swiping left and right
const SWIPE = `<svg class="ic" viewBox="0 0 22 22"><path d="M3 6h16M3 6l3-2.5M3 6l3 2.5M19 6l-3-2.5M19 6l-3 2.5" fill="none" stroke="#f08a3c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11" cy="14" r="3" fill="#5a3a22"/><path d="M11 17v4" stroke="#5a3a22" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const kbd = (s, cls = '') => `<kbd${cls ? ` class="${cls}"` : ''}>${s}</kbd>`;
const HOLD = () => `<span class="hold">${tx('Hold')}</span>`;

/** The chips of a row's control for a device ('key' | 'touch' | 'pad'), as HTML. */
export function chips(row, dev) {
  const own = row.touch ? kbd(tx(row.touch), 'btn') : null;
  const act = () => (dev === 'touch' ? own || kbd(tx('Do it'), 'btn') : dev === 'pad' ? kbd('X', 'pad') : kbd('E'));
  switch (row.in) {
    case 'move': return dev === 'key' ? ['W', 'A', 'S', 'D'].map(k => kbd(k)).join('') : STICK;
    case 'lr': return dev === 'key' ? kbd('A') + kbd('D') : dev === 'touch' && row.touchTap ? FINGER : STICK;
    case 'creep': return dev === 'key' ? HOLD() + kbd('Shift') : STICK;
    case 'act': return act();
    case 'hold': return (own && dev === 'touch' ? '' : HOLD()) + act();
    case 'jump': return dev === 'touch' ? own || kbd(tx('Jump'), 'btn') : dev === 'pad' ? kbd('A', 'pad') : kbd('Space');
    case 'tap': return dev === 'touch' ? FINGER : dev === 'pad' ? kbd('X', 'pad') : MOUSE;
    case 'aim': return dev === 'touch' ? FINGER : dev === 'pad' ? STICK : MOUSE;
    case 'sow': return dev === 'touch' ? kbd('◀', 'btn') + kbd('▶', 'btn') : dev === 'pad' ? kbd('A', 'pad') + kbd('X', 'pad') : kbd('Space') + kbd('E');
    // the Festival dance: four arrow moves (a swipe or a button on a phone), and three more on keys of their own
    case 'arrows': return dev === 'touch' ? SWIPE : dev === 'pad' ? STICK : ['←', '↑', '↓', '→'].map(k => kbd(k)).join('');
    case 'extra': return dev === 'touch' ? kbd('★', 'btn') : dev === 'pad' ? kbd('A', 'pad') + kbd('X', 'pad') + kbd('Y', 'pad') : kbd('Space') + kbd('Q') + kbd('R');
    default: return '';
  }
}

/** The device a card should speak to: the gamepad once it is used, touch on a touch screen, else keyboard and mouse. */
export function deviceOf(input, touch) {
  const d = input?.lastDevice;
  return d === 'gamepad' ? 'pad' : touch || d === 'touch' ? 'touch' : 'key';
}

/** The rows of a card as HTML (also what the tests read). */
export function rowsHtml(rows, dev) {
  return rows.map(r => `<li><svg viewBox="0 0 40 40" aria-hidden="true">${PICS[r.pic] || ''}</svg><span class="c">${chips(r, dev)}</span><p>${tx(r.text)}</p></li>`).join('');
}

// ------------------------------------------------------------------------------------------------ the card
const OPEN_FOR = 9;              // seconds a small screen keeps the card open before folding it to the "?" button
let el = null, cur = null, timer = 0, poll = 0;
const small = () => typeof matchMedia === 'function' && matchMedia('(max-width:700px),(max-height:480px)').matches;
const pref = v => {
  try { if (v === undefined) return localStorage.getItem('starline.howto'); localStorage.setItem('starline.howto', v); } catch { /* private window */ }
  return null;
};

function build() {
  if (el || typeof document === 'undefined') return el;
  const s = document.createElement('style');
  s.id = 'howToCss';
  s.textContent = CSS;
  document.head.appendChild(s);
  el = document.createElement('div');
  el.id = 'howTo';
  el.className = 'hidden';
  el.innerHTML = '<button class="hd" type="button"><span class="q">?</span><b></b><span class="x">‹</span></button><ol></ol>';
  document.body.appendChild(el);
  const hd = el.querySelector('.hd');
  hd.addEventListener('pointerdown', e => e.stopPropagation());
  hd.addEventListener('click', e => {
    e.stopPropagation();
    const shut = !el.classList.contains('shut');
    setShut(shut);
    if (!small()) pref(shut ? '0' : '1');
    hd.blur();                   // Space and Enter belong to the game, not to this button
  });
  return el;
}

function setShut(shut) {
  clearTimeout(timer);
  el.classList.toggle('shut', shut);
  el.classList.remove('nudge');
  el.querySelector('.hd').setAttribute('aria-expanded', String(!shut));
}

function draw() {
  if (!cur) return;
  el.querySelector('b').textContent = tx('How to play');
  el.querySelector('.hd').setAttribute('aria-label', tx('How to play'));
  el.querySelector('ol').innerHTML = rowsHtml(cur.rows, cur.dev);
}

/**
 * Show the card of a game. id: a HOWTO key. input: the game's Input (its lastDevice picks the glyphs, followed while the
 * card is up). touch: a touch screen. first: the player's first go at this game (a small screen then opens the card for
 * a few seconds; later it starts folded). Returns true when the game has a card.
 */
export function showHowTo(id, { input = null, touch = false, first = true } = {}) {
  const rows = HOWTO[id];
  if (!rows || !build()) { hideHowTo(); return false; }
  cur = { id, rows, input, touch, dev: deviceOf(input, touch) };
  draw();
  el.classList.remove('hidden');
  if (small()) {
    setShut(!first);
    if (first) timer = setTimeout(() => { if (cur) { setShut(true); el.classList.add('nudge'); } }, OPEN_FOR * 1000);
  } else setShut(pref() === '0');
  clearInterval(poll);
  poll = setInterval(() => {
    if (!cur) return;
    const dev = deviceOf(cur.input, cur.touch);
    if (dev !== cur.dev) { cur.dev = dev; draw(); }
  }, 700);
  return true;
}

export function hideHowTo() {
  cur = null;
  clearTimeout(timer);
  clearInterval(poll);
  el?.classList.add('hidden');
}

/** What is on screen now (for the tests): null, or { id, dev, shut }. */
export function howToState() { return cur && el ? { id: cur.id, dev: cur.dev, shut: el.classList.contains('shut') } : null; }
