// The Kite workshop's words: English source strings (translated with tx(); scripts/i18n-extract.mjs finds every N_()).
// Voice: docs/STORY-GRANDMA.md §1a. Grandma says "the what-tricity"; Mika explains simply; Tamo is thrilled and a
// little jealous of anything that makes light or flies without him. Lines stay within 135 characters.
import { N_ } from '../../i18n/i18n.js';

export const LABEL = {
  open: N_('Kite workshop'),
  resume: N_('Kite workshop: carry on'),
  rebuild: N_('Kite workshop: build it again'),
  leave: N_('Leave'),
  test: N_('Spin test'),
  lock: N_('Lock it in'),
  switchOn: N_('Switch on'),
  boost: N_('Boost'),
  keys: N_('Drag, or click a part and then its place. Keys: arrows move, E takes and places.'),
};

/** The task line of each step ({n} of {total} where it counts) and its short name for the round pill. */
export const TASK = {
  pick: { name: N_('Parts'), task: N_('Tap everything a flying machine needs ({n} of {total})') },
  motors: { name: N_('Motors'), task: N_('Put a motor on each of the four spar ends ({n} of {total})') },
  props: { name: N_('Propellers'), task: N_('Fit the propellers so that neighbours spin opposite ways ({n} of {total})') },
  wire: { name: N_('Wires'), task: N_('Join each plug to the socket of its own colour ({n} of {total})') },
  balance: { name: N_('Balance'), task: N_('Slide the battery until the bubble sits between the two lines') },
  switch: { name: N_('Switch on'), task: N_('Everything is ready. Flip the switch!') },
  test: { hover: N_('Spin test: hovering…'), fwd: N_('Spin test: leaning forward…'), side: N_('Spin test: leaning sideways…') },
};

/** Tamo's nudges when nothing happens for a while (the first one also greets the step the first time). */
export const HINTS = {
  pick: [
    N_('Four motors, four propellers, a battery, a switch and some wire. Tap them!'),
    N_('Count the propellers: two orange ones and two violet ones.'),
    N_('Some of that tray is from the kitchen drawer. Leave those.'),
  ],
  motors: [
    N_('Tap a motor, then tap a brass ring at the end of a spar. Or just drag it there.'),
    N_('One motor at each corner: four spar ends, four brass rings.'),
  ],
  props: [
    N_('Orange spins clockwise, violet the other way. Look at the white arrows.'),
    N_('Make each corner different from its two neighbours: the same colour sits on opposite corners.'),
    N_('Tap a propeller, then tap another corner, and they swap places.'),
  ],
  wire: [
    N_('Tap a coloured plug, then the socket with the same colour. Red starts at the battery.'),
    N_("Each motor's wire has the colour of its cap. Yellow to yellow!"),
    N_('Black is the way home: from the battery to the brass lug at the tail.'),
  ],
  balance: [
    N_('Drag the battery along the rail. The bubble runs to the light end.'),
    N_('Nearly there: a little at a time, and wait for the bubble to stop swimming.'),
  ],
  switch: [
    N_('The switch is on the nose, in front of the battery. One finger!'),
  ],
};

/** What Tamo says when something happens. */
export const SAY = {
  spoon: N_("A spoon? That's for Grandma's soup, not for the sky!"),
  peg: N_('A clothes peg holds socks. It does not hold up a kite.'),
  decoy: N_("That one stays in the drawer. It doesn't fly."),
  wrongPlace: N_('Wobbly! A motor needs a brass ring at the end of a spar.'),
  wrongWire: N_('Fzzt! Wrong colour. Same colour to same colour.'),
  testPitch: N_('It twists when it leans forward! Front and back neighbours are spinning the same way.'),
  testRoll: N_('It twists when it leans sideways! Left and right neighbours are spinning the same way.'),
  testGood: N_("Level as a pond! The twists cancel each other, even when it leans."),
  level: N_('Dead level. The bubble is right between the lines!'),
  noseHeavy: N_("A bit nose-heavy, but it'll fly. Next time, slide it back a touch."),
  tailHeavy: N_("A bit tail-heavy, but it'll fly. Next time, slide it forward a touch."),
};

/** Dialogue, by story: before the first build, and when the kite lifts off the bench. */
export const LINES = {
  intro: {
    grandma: [
      ['mika', N_("Four little motors from my science club box, a battery, a switch. Grandma's wind-up kite is getting an upgrade.")],
      ['tamo', N_("You're putting what-tricity in SORA'S kite? …Can I watch? I'm watching."), 'Happy'],
      ['mika', N_('The mill wheel can charge the battery now. All the kite needs is something to spin the propellers.')],
    ],
    classic: [
      ['mika', N_("A box under the bench: 'For the kite, when I find the time. S.' Motors, a battery, a switch.")],
      ['tamo', N_("Sora's next invention! She never got round to it. Let's finish it for her!"), 'Happy'],
    ],
  },
  done: {
    grandma: [
      ['tamo', N_("It's FLYING! By itself! I didn't even spark it!"), 'Happy'],
      ['sora', N_('Rice balls! …Mi-chan. Why is my kite floating over the bench? Is that the what-tricity again?')],
      ['mika', N_('Motors, Grandma. The mill wheel fills the battery, and the battery spins the propellers.')],
      ['sora', N_("The wheel that grinds my flour flies my kite. Wait till I tell Genzo. No. Don't tell Genzo.")],
    ],
    classic: [
      ['tamo', N_("It's FLYING! By itself! I didn't even spark it!"), 'Happy'],
      ['mika', N_('Grandma wound it up with a key. Now a battery does the winding.')],
      ['tamo', N_('No key, no winding: one switch and off we go. Sora would be so proud of her kite.'), 'Happy'],
    ],
  },
  tip: N_('The Star Kite has motors now. Hold Shift for a stronger boost, Space climbs faster, and let go to hover. The battery recharges on the ground.'),
  tipTouch: N_('The Star Kite has motors now. Hold Boost to go faster, Jump climbs faster, and let go to hover. The battery recharges on the ground.'),
};

/** The results card (the Tricks card: "Why it works", "How to do it for real", a safety line). */
export const CARD = {
  why: N_('A spinning propeller tries to twist the kite the other way. Two spin clockwise and two counter-clockwise, on opposite corners, so the twists cancel even when it leans to steer.'),
  real: N_('Real drones fly just like this. A tiny computer changes the speed of each motor hundreds of times a second to keep them level. They carry cameras, parcels and rescue ropes.'),
  safe: N_('Propellers spin fast and bite fingers: build and fly real ones only with a grown-up.'),
  perfect: N_('No mistakes, dead level'),
  clean: N_('No mistakes'),
  level: N_('Dead level'),
};
