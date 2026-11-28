// © 2026 Bui Cong Nguyen · solluxlabs.com
// Story lines that name keyboard keys, said the phone's way (owner 2026-11-27: on a phone the kite lines spoke of G,
// Space, C and Shift, which a phone does not have). ui.js dialogueInner swaps a line for its phone version on touch
// screens, before translating it; the keyboard line and its translations stay as they are.
// The button names match the touch buttons (index.html #tKite, #tJump, #tDive). Without motors a phone has no
// "faster" button (Settings > Controls), so the phone lines leave Shift out.
import { N_ } from '../i18n/i18n.js';

export const TOUCH_LINES = {
  'Sora built a FLYING machine! Press G to fly: Space climbs, C dives, Shift goes fast, and G lands.':
    N_('Sora built a FLYING machine! Tap Kite to fly: hold Jump to climb, hold Dive to go down, and tap Kite again to land.'),
  'Press G to whistle for the kite. Space climbs, C dives, Shift goes faster, G lands. Genzo need never know.':
    N_('Tap Kite to whistle for the kite. Hold Jump to climb, hold Dive to go down, tap Kite again to land. Genzo need never know.'),
  'Sora built a FLYING machine! No what-tricity, just wind and stubbornness. G flies, Space climbs, C dives, Shift is fast.':
    N_('Sora built a FLYING machine! No what-tricity, just wind and stubbornness. Tap Kite to fly, hold Jump to climb, hold Dive to go down.'),
};
