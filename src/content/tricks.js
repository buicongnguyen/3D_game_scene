// Grandma's Countryside Tricks (docs/RURAL-TRICKS.md): real rural things to do, each a short game taught once by
// Grandma (Rin in Classic). Pure data, Node-readable; the framework is src/game/tricks.js, each game src/game/tricks/<id>.js.
//
// place: where the trick sign stands (dry ground; tests/tricks.test.mjs checks it with placeProblems).
// seasons / hours: when it can be played. hours [from, to] wraps past midnight. A frozen story clock never blocks a trick
// (the round puts on its own night look); a running clock (Explore cycle) must be inside the hours.
// stars: score needed for 1, 2 and 3 stars. length: round seconds; firstLength: the guided first try.
import { ARCHERY } from './archery.js';
import { LEVELS, levelSpec, recordLevel, cleanLevels } from './levels.js';
import { PERFORMERS, cleanLook } from './performers.js';
// Texts are English source strings (translated with tx(); collected by scripts/i18n-extract.mjs).

export const TRICKS = [
  {
    id: 'swimming', name: 'Learn to swim', icon: 'trick-river',
    place: { x: -14, z: 75, face: Math.PI }, where: 'the supervised practice pool south of Kawabe',
    seasons: ['spring', 'summer', 'autumn'], hours: [9, 18], night: false, when: 'Spring to autumn, in daylight',
    teacher: { grandma: 'rin', classic: 'rin' }, intro: 'trick_swimming_intro',
    howReal: 'Learn in a supervised pool with a qualified swimming teacher. Practise gentle bubbles, floating, turning and returning to a safe exit at your own pace.',
    why: 'Calm breathing, balance and finding the exit are swimming foundations. Game practice does not prove that you can swim safely in real water.',
    safety: 'In real water, learn with a qualified swimming teacher and a grown-up watching.',
    // the lesson is long already, so the levels change what it asks, not how long it runs (rules-swimming.js SWIM_LEVELS):
    // Easy shorter drills and a wide beat; Normal adds the frog stroke (pull, breathe, kick, glide) as a seventh skill;
    // Difficult a narrow lane, a tight beat and two rings to steer through on the way back, swum frog stroke.
    // A finished lesson is 100 less 4 for every retry (never under 60): Difficult's three stars allow two retries.
    stars: [60, 80, 95], length: 240, firstLength: 240, unit: 'points',
    levels: { easy: { stars: [40, 70, 88], length: 240 }, normal: { stars: [60, 80, 95], length: 240 }, hard: { stars: [60, 80, 92], length: 240 } },
  },
  {
    // water safety in the same supervised pool (tricks/floatsafe.js, rules-floatsafe.js): a drill in clothes, never a
    // scare. Points: 10 a step, up to 20 for a steady float, up to 10 for staying calm, 10 a rescuer's choice right at
    // once (5 at the second try), 3 off for every panic. Best: 70 on Easy, 110 on Normal, 120 on Difficult (floatBest).
    // No clock on screen: `length` is about how long a calm child takes (the round only ends itself long after it).
    id: 'floatsafe', name: 'Float and wait', icon: 'trick-floatsafe',
    // its sign stands by the east deck, where the drill happens (the lesson's sign is at the steps; signs keep 12 m apart)
    place: { x: -12, z: 62.5, face: -Math.PI / 2 }, where: 'the supervised practice pool south of Kawabe',
    seasons: ['spring', 'summer', 'autumn'], hours: [9, 18], night: false, when: 'Spring to autumn, in daylight',
    teacher: { grandma: 'rin', classic: 'rin' }, intro: 'trick_floatsafe_intro',
    howReal: 'Fell in? Float on your back, breathe slowly, then call for help. A friend fell in? Never jump in: shout for a grown-up and throw something that floats.',
    why: 'Air in your lungs, clothes and shoes helps you float. Thrashing wastes air and strength. In Japan children learn it as "uite mate": float and wait.',
    safety: 'Wear a life jacket near water, and only play by water with a grown-up.',
    stars: [50, 85, 102], length: 100, firstLength: 70, unit: 'points',
    levels: { easy: { stars: [20, 45, 62], length: 70 }, normal: { stars: [50, 85, 102], length: 100 }, hard: { stars: [60, 95, 112], length: 130 } },
  },
  {
    id: 'firefly', name: 'Firefly jar', icon: 'trick-firefly',
    place: { x: -66, z: 10, face: -Math.PI / 2 }, where: 'the paddy edge, west of Kawabe',
    seasons: ['summer'], hours: [19.5, 4], night: true, when: 'Summer, dusk to night',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_firefly_intro',
    howReal: 'On a warm, still summer night, go with a grown-up to a clean stream far from street lights. Wait quietly, then scoop gently with a soft net.',
    why: 'Fireflies flash to talk to each other, and each kind has its own blink pattern. They need clean water and real darkness.',
    safety: 'Always let them go before bed, right where you found them.',
    // points: Heike 1, Genji 2, Hime 3, and a bonus for a sweep of several (tricks/rules-firefly.js)
    // levels (rules-firefly.js FF_LEVELS): Easy is one gentle stage; Normal adds the Genji hour; Difficult a breeze and
    // a card of kinds to catch (3 points a set: a catch is worth about twice as much there, and there are fewer of them)
    stars: [10, 22, 40], length: 95, firstLength: 45, unit: 'points',
    levels: { easy: { stars: [6, 15, 26], length: 70 }, normal: { stars: [10, 22, 40], length: 95 }, hard: { stars: [16, 34, 56], length: 120 } },
  },
  {
    id: 'river', name: 'Night river lantern', icon: 'trick-river',
    place: { x: -6, z: 22, face: Math.PI / 2 }, where: 'the Kawabe shallows, by the dock',
    seasons: ['spring', 'summer', 'autumn'], hours: [20, 4], night: true, when: 'Spring to autumn, at night',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_river_intro',
    howReal: 'With a grown-up, wade only ankle-deep shallows with a torch. Move slowly and look straight down into the circle of light.',
    why: 'Many fish rest near the bottom at night. Shrimp eyes shine back in a torch beam like a cat\'s: that is called eyeshine.',
    safety: 'Only go to the river at night with a grown-up, and stay in the shallows.',
    // levels (tricks/river.js RIVER_LEVELS): 7 fish on Easy; 9 and then 5 more ("the night deepens") on Normal; 9 + 6 on
    // Difficult, where a splash sends a fish off and three kinds on a list are worth 5 more
    stars: [8, 14, 20], length: 95, firstLength: 30, unit: 'fish spotted',
    levels: { easy: { stars: [4, 8, 12], length: 70 }, normal: { stars: [8, 14, 20], length: 95 }, hard: { stars: [10, 18, 26], length: 120 } },
  },
  {
    id: 'stars', name: 'Stargazing', icon: 'trick-stars',
    place: { x: -62, z: 158, face: Math.PI }, where: 'the hill behind the signal cottage',
    seasons: ['spring', 'summer', 'autumn', 'winter'], hours: [20, 4.5], night: true, clear: true, when: 'Any clear night',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_stars_intro',
    howReal: 'Find a dark place away from town lights and give your eyes 15 minutes to get used to the dark. Find the Big Dipper, then follow its two end stars.',
    why: 'Without city lights you can see about ten times more stars. The North Star barely moves all night, so travellers used it to find north.',
    safety: 'Wrap up warm, and go with a grown-up.',
    // 10 a star joined, 20 the North Star, 20 an answer, 15 the wish, a speed bonus (tricks/rules-stars.js gazePlan): Easy joins
    // 7 stars to find north (105 without the speed bonus); Normal 15 with Cassiopeia and the season's figure, and names its
    // brightest star (205); Difficult 13 with the Little Dipper, then picks out a satellite and counts a satellite train (205)
    stars: [90, 150, 190], length: 120, firstLength: 120, unit: 'points',
    levels: { easy: { stars: [40, 75, 95], length: 90 }, normal: { stars: [90, 150, 190], length: 120 }, hard: { stars: [100, 160, 205], length: 150 } },
  },
  {
    id: 'frogs', name: 'Frog chorus', icon: 'trick-frogs',
    place: { x: -73, z: -9, face: 0 }, where: 'the bottom paddies, west of Kawabe',
    seasons: ['spring', 'summer'], hours: [17.5, 22.5], night: false, when: 'Spring and summer, at dusk',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_frogs_intro',
    howReal: 'After a warm rain, visit a paddy or pond at dusk. Walk only while the frogs sing, and freeze when they stop.',
    why: 'Frogs sing loudest after rain. The puffed-up throat pouch works like a speaker, and only the males call.',
    safety: 'Wet your hands before you hold a frog, and put it back where you found it.',
    // levels (tricks/frogs.js FROG_LEVELS; the most a level can score is frogsBest: 80 / 130 / 160). length: the time
    // for the sneaking (one singer on Easy, two after that); the call-and-answer after it is untimed
    stars: [45, 90, 120], length: 90, firstLength: 30, unit: 'points',
    levels: { easy: { stars: [20, 45, 70], length: 70 }, normal: { stars: [45, 90, 120], length: 90 }, hard: { stars: [55, 110, 145], length: 110 } },
  },
  // ---- phase 2 (docs/RURAL-TRICKS.md §6)
  {
    id: 'kite', name: 'Make and fly a kite', icon: 'trick-kite',
    place: { x: -28, z: 76, face: Math.PI }, where: 'the cow meadow, south of Kawabe',
    seasons: ['autumn', 'winter'], hours: [9, 17], night: false, when: 'Autumn and winter, on a windy day',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_kite_intro',
    howReal: 'Tie two thin bamboo sticks into a cross, glue on light paper and add a long tail. Stand with your back to the wind in a wide open field.',
    why: 'Wind is steadier higher up, away from trees and roofs. The tail keeps a kite from spinning.',
    safety: 'Fly far from power lines and roads, and never in a storm.',
    // up to 15 for the build, up to 2 a second aloft, 15 a ring (tricks/rules-kite.js flightPlan; length = the flight):
    // Easy 4 rings up high in a steady wind; Normal 6 rings at set heights in gusts (three stars want five of them and no
    // fall); Difficult 7 rings out to the sides while the wind turns, and a tree (three stars want six and a clean flight)
    stars: [80, 170, 215], length: 80, firstLength: 60, unit: 'points',
    levels: { easy: { stars: [50, 110, 160], length: 60 }, normal: { stars: [80, 170, 215], length: 80 }, hard: { stars: [110, 220, 275], length: 100 } },
  },
  {
    // fold a paper plane (real flat folds, shown on a diagram) and throw it down the open hillside above Takamori Landing
    // (tricks/rules-planes.js). A point for every whole metre of the best of three throws and a point for every exact
    // fold; 10 for a plane landed in the ring (Normal), 15 for the day's distance to beat (Difficult), 5 for a loop.
    // Nothing is timed: `length` is about how long a round takes. Easy: the Dart, wide fold marks, no wind, the flight
    // drawn ahead. Normal: four planes, a light wind, the elevator, the ring. Difficult: every trim, gusts, a thermal,
    // and a distance that wants the right plane for the wind. The stars are tuned with the rules' own throwers
    // (tests/planes.test.mjs): one star for any plane that flies, three for reading the day.
    id: 'planes', name: 'Breezy paper planes', icon: 'trick-planes',
    place: { x: 59, z: 52, face: 3.4 }, where: 'the open hillside above Takamori Landing, east of the river',
    seasons: ['spring', 'summer', 'autumn'], hours: [9, 17], night: false, when: 'Spring to autumn, on a dry day',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_planes_intro',
    howReal: 'Fold on a table and press each crease with a fingernail. Match left and right. Throw gently and level, not hard and up.',
    why: 'A paper clip puts the weight ahead of the wings\' lift: a steady nose. Back edges bent up lift the nose. Too much, and it stalls.',
    safety: 'Never throw at faces or animals, and pick up your planes afterwards.',
    stars: [12, 24, 34], length: 100, firstLength: 70, unit: 'points',
    levels: { easy: { stars: [8, 16, 24], length: 70 }, normal: { stars: [12, 24, 34], length: 100 }, hard: { stars: [14, 28, 40], length: 130 } },
  },
  {
    id: 'dew', name: 'Dew webs at dawn', icon: 'trick-dew',
    place: { x: -52, z: -97, face: 0 }, where: 'the forest edge on the west trail, north of the mill',
    seasons: ['spring', 'summer', 'autumn'], hours: [5, 7.5], night: false, when: 'Spring to autumn, at dawn',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_dew_intro',
    howReal: 'Get up at sunrise after a cool, still night. Walk slowly along a hedge with the sun behind you and look low between the stems.',
    why: 'Webs are almost invisible until dew or mist hangs tiny drops on every thread. Each drop shines like a little lens.',
    safety: 'Look, don\'t touch: a web is a spider\'s home and its dinner table.',
    // levels (tricks/rules-dew.js DEW_LEVELS): 5 webs on Easy; 8 on Normal, drying from the middle of the round on; 10 on
    // Difficult with two old webs that cost 5 and perfect photos worth 5 more. 10 a web, a point per 3 s left when all are found
    stars: [40, 70, 88], length: 110, firstLength: 70, unit: 'points',
    levels: { easy: { stars: [20, 40, 55], length: 80 }, normal: { stars: [40, 70, 88], length: 110 }, hard: { stars: [60, 105, 140], length: 130 } },
  },
  {
    id: 'roast', name: 'Sweet potato roast', icon: 'trick-roast',
    place: { x: -19, z: 51, face: -Math.PI / 2 }, where: 'the open meadow south of Kawabe, past the dock lane',
    seasons: ['autumn'], hours: [15, 19], night: false, when: 'Autumn, late afternoon',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_roast_intro',
    howReal: 'A grown-up burns a pile of dry straw down to glowing ash. Bury the sweet potatoes in the ash and wait about forty minutes.',
    why: 'Ash keeps an even, gentle heat, like an oven. Slow heat turns the potato\'s starch into sugar.',
    safety: 'Fires are for grown-ups: a grown-up lights the straw.',
    // 20 a perfect potato, 10 a good one, 3 a raw one: two good ones and a bit are a star, three perfect ones two, and three stars want
    // four perfect ones (turned in time, the ash kept warm, no flare) and the fifth at least good
    // (tricks/roast.js roastPlan; length = the cooking, the straw and the lighting are untimed) Easy: 4 + 2 potatoes in
    // gentle ash (120 at best); Normal: 5 + 3 (160); Difficult: 7 potatoes and 2 chestnuts in three batches, with rain (160)
    // (20 a perfect potato, 10 a good one, 3 a raw one; a chestnut 10 / 5 / 1)
    stars: [50, 100, 140], length: 80, firstLength: 65, unit: 'points',
    levels: { easy: { stars: [30, 70, 110], length: 65 }, normal: { stars: [50, 100, 140], length: 80 }, hard: { stars: [50, 105, 150], length: 90 } },
  },
  {
    // fire-extinguisher practice with a grown-up, at a tray on the lawn in Kawabe (tricks/firedrill.js builds the ground
    // for the round; rules-firedrill.js). 10 for the shout, then a tray is 20 out + 10 standing right + 10 aim on the base
    // + 10 quick + 5 no wrong step (+ 10 the right extinguisher on Difficult), and up to 15 for powder not wasted.
    // Easy: one small tray, no wind, every step prompted (80 at best). Normal: three trays in a turning wind, the big one
    // flares up again if the sweeping stops too soon (190). Difficult: paper, a pan of oil and straw: choose water or
    // powder, a slow fire catches the next tray, less in the extinguishers, no prompts (220). Tuned with the rules' own
    // bot (.tools/drill-tune.mjs): a tray put out any old way is a star on Easy.
    id: 'firedrill', name: 'Fire drill', icon: 'trick-firedrill',
    place: { x: -32.5, z: 38.5, face: -Math.PI / 2 }, where: 'the lawn in Kawabe, behind the market stall',
    seasons: ['spring', 'summer', 'autumn', 'winter'], hours: [9, 17], night: false, when: 'Any day, in daylight',
    teacher: { grandma: 'sora', classic: 'genzo' }, intro: 'trick_firedrill_intro',
    howReal: 'At a fire drill a grown-up lets you try a practice extinguisher: pull the pin, aim at the base, squeeze the handle, sweep from side to side.',
    why: 'A fire needs fuel, heat and air. Powder smothers it at the base, where the fuel burns. Aimed up at the flames it just blows through.',
    safety: 'A real fire? Shout "Fire!", tell a grown-up and get away. Practise only with a grown-up.',
    stars: [70, 125, 165], length: 100, firstLength: 70, unit: 'points',
    levels: { easy: { stars: [25, 55, 70], length: 70 }, normal: { stars: [70, 125, 165], length: 100 }, hard: { stars: [80, 150, 205], length: 130 } },
  },
  {
    id: 'beetles', name: 'Beetle sap trap', icon: 'trick-beetles',
    place: { x: 92, z: -103, face: Math.PI }, where: 'the chestnut grove on the shrine trail, past the orchard gate',
    seasons: ['summer'], hours: [17, 21], night: false, when: 'Summer: set at dusk, check at dawn',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_beetles_intro',
    howReal: 'At dusk, rub mashed banana and a little sugar on the bark of an oak or chestnut. Come back at dawn and look, gently.',
    why: 'Beetles drink sweet tree sap at night. Oak and chestnut are their favourite trees.',
    safety: 'Put every beetle back on the tree where you found it.',
    // 12 a beetle seen, 5 a moth, 20 a beetle lifted gently (tricks/beetles.js trapPlan; length = choosing and rubbing).
    // Easy: one trap (about 105 at best). Normal: two traps on two trees (about 210). Difficult: two traps, a beetle that
    // wriggles in the hand, and a hornet at each tree to leave well alone (10 for leaving it, 15 off for touching: about 225;
    // three stars want every beetle lifted and both hornets left)
    stars: [60, 120, 170], length: 100, firstLength: 60, unit: 'points',
    levels: { easy: { stars: [30, 60, 90], length: 70 }, normal: { stars: [60, 120, 170], length: 100 }, hard: { stars: [70, 135, 205], length: 110 } },
  },
  // ---- phase 3: the meadow (docs/RURAL-TRICKS.md §3 #5 and the bug catching)
  {
    id: 'hoppers', name: 'Grasshopper and mantis', icon: 'trick-hoppers',
    place: { x: -38, z: -68, face: 2.4 }, where: 'the sunny long-grass meadow north of the mill, by the river and the west forest trail',
    seasons: ['summer', 'autumn'], hours: [8, 17], night: false, when: 'Summer and autumn, on a sunny day',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_hoppers_intro',
    howReal: 'Creep through long grass with a soft net. Sweep it low over a sitting grasshopper, take a good look, then let it go.',
    why: 'A grasshopper hears with ears on its belly. A mantis can turn its head almost right round, so it sees you coming. Move slowly when it watches.',
    safety: 'Look, then let them go where you found them. Mantises are friends of the garden.',
    // levels (tricks/rules-hoppers.js HOP_LEVELS): one calm wave on Easy; three waves with one more mantis each on Normal;
    // on Difficult warier bugs, a windy spell and an order to fill (10 more for the bug that is asked for)
    stars: [50, 100, 145], length: 95, firstLength: 40, unit: 'points',
    levels: { easy: { stars: [30, 60, 100], length: 70 }, normal: { stars: [50, 100, 145], length: 95 }, hard: { stars: [70, 140, 220], length: 120 } },
  },
  {
    id: 'cricket', name: 'Cricket by its song', icon: 'trick-cricket',
    place: { x: 76, z: 10, face: -Math.PI / 2 }, where: 'the hillside meadow west of Takamori, above the bakery lane',
    seasons: ['summer', 'autumn'], hours: [18.5, 4], night: true, when: 'Summer and autumn, from dusk',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_cricket_intro',
    howReal: 'At dusk, stand still in a quiet meadow and listen. Walk toward the song, stop when it stops, and look low in the grass.',
    why: 'Only male crickets chirp, by rubbing their wings. The warmer the night, the faster they chirp: chirps in 14 seconds plus 40 is the temperature in °F.',
    safety: 'Keep your torch low, and put the cricket back in the grass before bed.',
    // levels (tricks/rules-cricket.js CRICKET_LEVELS): two, three and four crickets (up to 40 each, 10 for the guess).
    // length: the time for the hunting; the tickle, the 14-second count and the guess come on top
    stars: [35, 70, 100], length: 105, firstLength: 50, unit: 'points',
    levels: { easy: { stars: [20, 45, 70], length: 75 }, normal: { stars: [35, 70, 100], length: 105 }, hard: { stars: [50, 100, 140], length: 130 } },
  },
  {
    // a thinking game with picture cards (tricks/rules-lifecycle.js): 10 points a puzzle solved at the first try, 6 at the second,
    // 3 at the third; Easy deals 5 puzzles, Normal 7, Difficult 9. No clock on screen: `length` is how long a thoughtful child
    // takes, and on Normal and Difficult a round finished inside it earns a few extra points (never needed for the stars)
    id: 'lifecycle', name: 'From egg to wings', icon: 'trick-lifecycle',
    place: { x: -23, z: -18, face: -Math.PI / 2 }, where: 'the green by the river, at the north end of Kawabe',
    seasons: ['spring', 'summer', 'autumn'], hours: [8, 18], night: false, when: 'Spring to autumn, in daylight',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_lifecycle_intro',
    howReal: 'Look under leaves for eggs and caterpillars, and in still water for tadpoles and wrigglers. Come back every few days and draw what has changed.',
    why: 'Butterflies and mosquitoes change shape completely and rest as a pupa. Grasshoppers and dragonflies have no pupa: the young moult and grow wings.',
    safety: 'Never touch a chrysalis. Tip standing water out of pots so mosquitoes cannot breed.',
    stars: [30, 50, 64], length: 100, firstLength: 70, unit: 'points',
    levels: { easy: { stars: [20, 35, 46], length: 70 }, normal: { stars: [30, 50, 64], length: 100 }, hard: { stars: [40, 66, 84], length: 140 } },
  },
  {
    // the life-cycle game's sibling about the valley's crops (tricks/rules-crops.js), played on the same card board and
    // scored the same way: 10 / 6 / 3 points a puzzle, 5 / 7 / 9 puzzles, no clock on screen. The sign stands at the
    // north edge of the field grid: the round is watched with the rice terraces behind the two of them
    id: 'crops', name: 'From seed to harvest', icon: 'trick-crops',
    place: { x: -86.5, z: -8.4, face: Math.PI }, where: 'the north edge of the rice paddies, west of Kawabe',
    seasons: ['spring', 'summer', 'autumn'], hours: [8, 18], night: false, when: 'Spring to autumn, in daylight',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_crops_intro',
    howReal: 'Plant a sprouting potato in a deep pot and heap soil round the stems as they grow. Count the weeks until the leaves turn yellow, then dig.',
    why: 'Rice wants warmth and standing water; winter wheat wants a cold winter. So one field can grow rice in summer and wheat in winter.',
    safety: 'Never eat a green potato. Keep potatoes in the dark.',
    stars: [30, 50, 64], length: 100, firstLength: 70, unit: 'points',
    levels: { easy: { stars: [20, 35, 46], length: 70 }, normal: { stars: [30, 50, 64], length: 100 }, hard: { stars: [40, 66, 84], length: 140 } },
  },
  {
    id: 'archery', name: 'Bow and arrow', icon: 'trick-archery',
    place: { x: ARCHERY.sign.x, z: ARCHERY.sign.z, face: ARCHERY.sign.face }, where: 'the archery range, west of Kawabe behind the houses',
    seasons: ['spring', 'summer', 'autumn'], hours: [9, 18], night: false, when: 'Spring to autumn, in the daytime',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_archery_intro',
    howReal: 'Stand side-on to the target, feet apart. Nock the arrow, draw to your cheek, breathe out slowly, then let go smoothly.',
    why: 'A bent bow stores energy like a spring and hands it to the arrow. Wind pushes a light arrow sideways, so aim a little upwind.',
    safety: 'Only at the target, with a grown-up and practice arrows.',
    // a ring is 1..10 points (tricks/rules-archery.js roundPlan; length = seconds of lining up shots). Easy: 16 arrows, no
    // wind, the aim arc drawn (160). Normal: 22 arrows in the wind, the last four at the sliding target (220). Difficult: 24
    // arrows in gusts with no aim arc, six at a livelier sliding target and six at a small swinging gong (240).
    // Every level then closes with the balloon end (tricks/rules-balloons.js): Easy 6 more arrows at slow stacks of two
    // (about 39 more at best), Normal 8 at stacks of three, a diagonal and a golden balloon (about 107), Difficult 8 at
    // faster, smaller ones that pop by themselves at the top (about 143). The rounds are that much longer.
    stars: [70, 160, 240], length: 120, firstLength: 60, unit: 'points',
    levels: { easy: { stars: [40, 100, 150], length: 120 }, normal: { stars: [70, 160, 240], length: 120 }, hard: { stars: [90, 190, 310], length: 130 } },
  },
  {
    id: 'cowrace', name: 'Cow race', icon: 'trick-cowrace',
    place: { x: 86.5, z: -45, face: -Math.PI / 2 }, where: 'the Takamori north pasture, past the pasture road',
    seasons: ['spring', 'summer', 'autumn'], hours: [9, 18], night: false, when: 'Spring to autumn, in the daytime',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_cowrace_intro',
    howReal: 'In An Giang, Vietnam, oxen race at harvest festivals, pulling a driver across a flooded paddy. Here we race on grass, with a grown-up.',
    why: 'Cows have a steady walking rhythm, so a rider moves with it. Racing oxen are fed, cheered and rested, never hit: a happy cow runs best.',
    safety: 'Never ride a real cow without a grown-up who knows her.',
    // a race day of heats (tricks/rules-cowrace.js meetPlan): a heat is 80 / 50 / 30 / 10 by place plus up to 25 for a
    // quick time, and the heats add up; a bareback heat (rules-cowbalance.js) ridden without a fall adds 15. Easy: two heats
    // (about 205 at best), nobody falls off. Normal: three, the last one bareback (330 at best): three stars want two wins,
    // a second and a steady ride. Difficult: four heats with sprints, puddles, a tight beat and the rodeo final (435 at best).
    // Tuned with the bots of tests/cowrace.test.mjs (.tools/cow-tune.mjs). (length: about a round, not a timer)
    stars: [100, 200, 280], length: 95, firstLength: 65, unit: 'points',
    levels: { easy: { stars: [60, 130, 180], length: 65 }, normal: { stars: [100, 200, 280], length: 95 }, hard: { stars: [130, 250, 360], length: 125 } },
  },
  {
    // the henhouse itself is built by tricks/eggs.js (HOUSE): the sign stands at its right corner, beside the egg basket
    // (the left corner is too near the Stargazing sign). scenery: from how far away (m) the henhouse is drawn, in every
    // season and at every hour
    id: 'eggs', name: 'Eggs down the gutters', icon: 'trick-eggs',
    place: { x: -49.7, z: 147.9, face: 0 }, where: 'the henhouse behind the signal cottage',
    seasons: ['spring', 'summer', 'autumn'], hours: [7, 18], night: false, when: 'Spring to autumn, in the daytime',
    teacher: { grandma: 'sora', classic: 'rin' }, intro: 'trick_eggs_intro', scenery: 130,
    howReal: 'Collect the eggs every morning. Slide a hand gently under the hen, hold each egg in your whole hand, and lay it in a basket lined with straw.',
    why: 'This is Amidakuji, the ladder lottery from Japan. Every plain rung swaps two neighbours, so four eggs laid together come out of four different spouts.',
    safety: 'Wash your hands after you touch hens or eggs.',
    // one point an egg (golden 3, little brown 2, a chick safe on the straw 1), +2 for five catches in a row, +3 for a
    // stage's order, +2 for a clean stage. The stars are tuned with the rules' own bot (.tools/eggs-tune.mjs): a perfect
    // round is about 33 on Easy, 58 on Normal, 100 on Difficult. The clock waits between stages, so a round lasts
    // about 85 s, 115 s and 150 s.
    stars: [12, 28, 44], length: 105, firstLength: 50, unit: 'eggs',
    levels: { easy: { stars: [5, 14, 24], length: 78 }, normal: { stars: [12, 28, 44], length: 105 }, hard: { stars: [20, 50, 80], length: 140 } },
  },
  {
    // a festival dance lesson on the Takamori square, in front of the bell tower, at dusk (tricks/dance.js, rules-dance.js).
    // Two dances on one record: the hat dance (múa nón) with Hoa, Hana's grown-up daughter, or the K-pop stage with her
    // friends from dance school in Seoul (Nabi leads, Haru beside her, Byeol sings). Easy and Normal: watch a line, then
    // copy it on the beat; Difficult: dance along, mirror calls, a free-style chorus. 10 a perfect move, 6 a good one,
    // 10 a clean line, 4 a move of the longest chorus combo: 200 at best on Easy, 390 on Normal, 882 on Difficult. The
    // stars are tuned with the rules' own dancers (tests/dance.test.mjs): one for a sloppy Easy round, three for perfect.
    // length: the song of each level (the rules' plan). scenery: Hoa stands by the sign from this far away.
    id: 'dance', name: 'Festival dance', icon: 'trick-dance',
    place: { x: 122.5, z: 12, face: -Math.PI / 2 }, where: 'the Takamori square, in front of the bell tower',
    seasons: ['spring', 'summer', 'autumn', 'winter'], hours: [17, 22.5], night: true, when: 'Any evening: festivals all year',
    teacher: { grandma: 'hoa', classic: 'hoa' }, intro: 'trick_dance_intro', scenery: 70,
    howReal: 'Bon odori circles a drum tower at Obon in summer: anyone may step in. Múa nón, the hat dance, comes out at Tết and harvest.',
    why: 'Festival dances repeat a few easy steps, so everyone can join in. Watch, copy, keep the beat, and the whole village dances as one.',
    safety: 'Dance on flat ground, leave room around you, and drink water between songs.',
    stars: [60, 200, 320], length: 103, firstLength: 66, unit: 'points',
    levels: { easy: { stars: [24, 110, 170], length: 66 }, normal: { stars: [60, 200, 320], length: 103 }, hard: { stars: [150, 450, 720], length: 122 } },
  },
  {
    // the morning exercise on the big lawn (tricks/exercise.js, rules-exercise.js): three routines (the radio exercise,
    // a kids' workout, kids' yoga) led from a low stage, Mika in the front row, two kids beside her on Normal and two
    // grown-ups behind on Difficult. A count answered in time is a cue's points (a Good is 60 %), a hold or a breath earns
    // by the share of its time done right, and a routine is worth 100 / 200 / 300 at its level whichever it is, so one
    // star on Easy is about a third of the counts. Rounds last about 65-72 s, 94-107 s and 122-138 s (the routines differ
    // a little). stage: where the class stands and the way it faces (toward the instructor, west: the morning sun is
    // behind the class and lights her face). instructor: the model that leads (actors on the shared skeleton; one with
    // no clip pack of its own borrows the closest body's, see tricks/exercise-moves.js).
    id: 'exercise', name: 'Morning exercise', icon: 'trick-exercise',
    place: { x: -20, z: 36.5, face: 0 }, where: 'the big lawn in Kawabe, by the lane to the dock',
    stage: { x: -24, z: 41, face: -Math.PI / 2 },
    instructor: 'rin',
    seasons: ['spring', 'summer', 'autumn', 'winter'], hours: [6, 10], night: false, when: 'Every morning, in any season',
    teacher: { grandma: 'rin', classic: 'rin' }, intro: 'trick_exercise_intro',
    howReal: 'Warm up first, then move slowly and breathe through your nose. Drink some water. A few minutes every morning with your family is plenty.',
    why: 'Moving in the morning wakes up your body and your brain, helps you focus at school and makes you feel happy. Slow breaths calm you down.',
    safety: 'Stop if anything hurts, never push a stretch, and ask a grown-up if unsure.',
    stars: [80, 135, 172], length: 100, firstLength: 70, unit: 'points',
    levels: { easy: { stars: [30, 60, 82], length: 70 }, normal: { stars: [80, 135, 172], length: 100 }, hard: { stars: [130, 205, 258], length: 130 } },
  },
];

export const TRICK =Object.fromEntries(TRICKS.map(t => [t.id, t]));

/** True when `hour` lies in [from, to), wrapping past midnight when from > to. */
export function inHours(hour, range) {
  const h = ((hour % 24) + 24) % 24, from = range[0], to = range[1];   // (asked every frame: no destructuring)
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

/** Stars earned for a score: how many of the thresholds it reaches (0..3). */
export function starsFor(score, thresholds) {
  return thresholds.filter(t => score >= t).length;
}

/**
 * Can the trick be played now? season: the season on screen; hour: the hour on screen; frozen: the story clock
 * stands still (the round brings its own night); raining: the weather (stargazing needs a clear sky).
 */
export function trickOpen(t, { season, hour, frozen = true, raining = false }) {
  if (!t.seasons.includes(season)) return false;
  if (t.clear && raining) return false;
  return frozen || inHours(hour, t.hours);
}

/**
 * Fold a finished round into the saved record { learned, best, stars, plays, level, levels }. `level`: the level it was
 * played at (content/levels.js; its star thresholds). Returns { rec, stars, newBest, opened }: newBest is the best on
 * that level, opened the level this round has just made available (or null). best / stars stay the best over all levels.
 */
export function recordRound(prev, t, score, level = 'normal') {
  const s = starsFor(score, levelSpec(t, level).stars);
  const rec = { learned: true, best: 0, stars: 0, plays: 0, ...(prev || {}) };
  const L = recordLevel(prev, level, score, s);
  rec.best = Math.max(rec.best, score);
  rec.stars = Math.max(rec.stars, s);
  rec.plays += 1;
  rec.levels = L.levels;
  rec.level = L.opened || level;                 // the picker offers a level just opened first
  return { rec, stars: s, newBest: L.newBest, opened: L.opened };
}

/** A clean tricks record for a save (migrate): known ids only, numbers whole and in range. */
export function cleanTricks(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const int = v => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  for (const [id, r] of Object.entries(raw)) {
    if (!TRICK[id] || !r || typeof r !== 'object') continue;
    out[id] = { learned: !!r.learned, best: int(r.best), stars: Math.min(3, int(r.stars)), plays: int(r.plays) };
    if (r.intro) out[id].intro = true;
    if (r.note) out[id].note = true;
    const levels = cleanLevels(r.levels);
    if (levels) out[id].levels = levels;
    if (LEVELS.includes(r.level)) out[id].level = r.level;
    // the Festival dance remembers the dance chosen last and each performer's look (offered first next time)
    if (DANCE_MODES.includes(r.mode)) out[id].mode = r.mode;
    const looks = cleanLooks(r.looks);
    if (looks) out[id].looks = looks;
  }
  return out;
}

/** The dances of the Festival dance (tricks/rules-dance.js MODES). */
export const DANCE_MODES = ['festival', 'kpop'];
/**
 * A clean `looks` record { performer: lookId } (undefined when there is nothing to keep): only the performers of
 * content/performers.js, and only looks they really have.
 */
export function cleanLooks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  for (const p of Object.keys(PERFORMERS)) { const l = typeof raw[p] === 'string' ? cleanLook(p, raw[p]) : null; if (l) out[p] = l; }
  return Object.keys(out).length ? out : undefined;
}
