/**
 * Indoor interactions: things Mika can walk up to and use (press E) in every enterable room, and the one small
 * "house memory" hidden in each home (collected into the journal).
 *
 * Plain data, no imports. Positions are in BLENDER room coordinates, exactly as in art/blender/interior_*.py
 * (x, y on the floor plane, z up; three.js/glTF (x, y, z) = Blender (x, z, -y)). In every room the front door / Exit
 * is in the -Y wall (the boathouse's runtime turns its whole room round for the land door, the data stays as built).
 *
 * Hotspot fields:
 *   id       '<room>.<thing>', unique
 *   kind     'sit' | 'look' | 'open' | 'pet' | 'play' | 'ring' | 'read' | 'warm' | 'use'
 *   stand    [x, y]     where Mika stands (free floor, >= 0.45 m from every Col_* box, >= 0.6 m from Spawn/Exit/Spot_npc_*)
 *   look     [x, y, z]  the point she faces / the camera holds on
 *   seat     [x, y] of the chair when it is not the look point (Mika sits there facing look)
 *   seatH    seat height for 'sit' (about 0.45 for a chair or bench, 0.1 for a floor cushion)
 *   label    short imperative prompt
 *   variants decor variants (Var_1..3) in which the prop exists; story rooms use [1]
 *   lines    { 1: [...], 2: [...], 3: [...] } or { any: [...] }: what Mika thinks or notices
 *
 * Validated by scratchpad townlife/validate.mjs against the colliders and nodes in public/models/interior-*.glb.
 */

export const HOTSPOTS = {
  // ---------------------------------------------------------------- Kawabe house A (6.0 x 5.0 m), door at -Y, x = 0
  // variants: 1 young family (kw1, kw7), 2 elderly couple (kw3), 3 fisher's home (kw5)
  'kawabe-a': [
    {
      id: 'kawabe-a.table', kind: 'sit', stand: [-0.5, -0.5], look: [-0.5, 0.55, 0.62], seatH: 0.1,
      label: 'Sit at the low table', variants: [1, 2, 3],
      lines: {
        1: ['Two rice balls, one bitten exactly once. Someone small lost interest halfway.'],
        2: ['Reading glasses folded on the paper, tea still warm. A whole slow morning on one tray.'],
        3: ['Grilled fish, two bowls of rice and a little sake. The river pays the rent here.'],
      },
    },
    {
      id: 'kawabe-a.tansu', kind: 'open', stand: [-2.0, -1.1], look: [-2.75, -0.9, 0.9],
      label: 'Open the tansu', variants: [1, 3],
      lines: {
        1: ['Socks, a rubber duck, and one sock that is definitely not a pair with anything.'],
        3: ['Spare hooks sorted by size in a sweet tin. Tidier than my entire life.'],
      },
    },
    {
      id: 'kawabe-a.altar', kind: 'ring', stand: [-2.0, -1.1], look: [-2.75, -0.88, 1.5],
      label: 'Ring the altar bell', variants: [2],
      lines: {
        2: ['A small photo, fresh flowers, a candle. They still set out a sweet for someone every day.',
          'The bell rings longer than you expect. Grandma said that is the polite part.'],
        grandma: { 2: ['A photo of a man waving from a half-built boat, fresh flowers, a sweet. "For when you are home," says the note.',
          'The bell rings longer than you expect. Grandma says that is the polite part.'] },
      },
    },
    {
      id: 'kawabe-a.toys', kind: 'play', stand: [-1.75, -0.2], look: [-1.62, -0.62, 0.32],
      label: 'Play with the toy train', variants: [1],
      lines: {
        1: ['Three carriages and a bear for a driver. The bear has clearly never passed an exam.'],
      },
    },
    {
      id: 'kawabe-a.cat', kind: 'pet', stand: [-1.9, -0.35], look: [-1.9, -0.9, 0.4],
      label: 'Pet the cat', variants: [2],
      lines: {
        2: ['The cat opens one eye, judges me, and allows it. High praise.'],
      },
    },
    {
      id: 'kawabe-a.net', kind: 'look', stand: [-1.9, -0.35], look: [-2.95, -0.9, 1.85],
      label: 'Look at the old net', variants: [3],
      lines: {
        3: ['Every knot in this net was tied by hand. Some of them have clearly been re-tied in a temper.'],
      },
    },
    {
      id: 'kawabe-a.shelf', kind: 'look', stand: [0.3, 1.7], look: [0.25, 2.3, 1.7],
      label: 'Look at the shelf', variants: [1, 2, 3],
      lines: {
        1: ['Picture books, a plush bear and a pot plant that has survived several "helpers".'],
        2: ['A radio older than the station clock, and a photo of two people who look like trouble.'],
        3: ['Cork floats, a coil of rope, a toy boat. Even the shelf would like to go fishing.'],
      },
    },
  ],

  // ---------------------------------------------------------------- Kawabe house B (7.8 x 5.8 m), glass doors at -Y
  // variants: 1 young family with a baby (kw4), 2 retired teacher (kw6), 3 tailor's home (otaHouse)
  'kawabe-b': [
    {
      id: 'kawabe-b.irori', kind: 'warm', stand: [-1.1, -1.35], look: [-1.1, -0.3, 0.25],
      label: 'Warm up by the hearth', variants: [1, 2, 3],
      lines: {
        1: ['The kettle hangs high over the fire here. Out of reach of very small, very curious hands.'],
        2: ['Ash raked flat as a page. I bet nobody has ever been late for tea in this house.'],
        3: ['A pin glints in the hearth frame. Even the fire gets mended here.'],
      },
    },
    {
      id: 'kawabe-b.sewing', kind: 'use', stand: [-2.6, -1.6], look: [-3.0, -2.5, 0.85],
      label: 'Look at the sewing table', variants: [1, 2, 3],
      lines: {
        1: ['A tiny onesie with a mended elbow. Babies apparently wear things out at speed.'],
        2: ['Ink, a red pencil and a stack of old essays. He still marks things. For fun.'],
        3: ['Scissors, spools, a pattern sheet. Everything sorted by colour, including the dust.'],
      },
    },
    {
      id: 'kawabe-b.chest', kind: 'look', stand: [-2.85, -1.0], look: [-3.68, -1.1, 1.2],
      label: 'Look at the sewing chest', variants: [2, 3],
      lines: {
        2: ['An old radio, tuned to the weather. Retired people take clouds very seriously.'],
        3: ['A dress form in a half-pinned dress. It looks like it is about to go somewhere nice.'],
      },
    },
    {
      id: 'kawabe-b.bookcase', kind: 'look', stand: [2.9, 1.9], look: [3.6, 2.0, 1.2],
      label: 'Browse the bookcase', variants: [1, 2, 3],
      lines: {
        1: ['Picture books chewed at the corners. Somebody here reads with their teeth.'],
        2: ['Every shelf full, and slips of paper sticking out of half the books like little flags.'],
        3: ['Bolts of fabric where books should be. I respect a house that knows what it loves.'],
      },
    },
    {
      id: 'kawabe-b.playmat', kind: 'play', stand: [-0.45, -1.55], look: [-0.35, -1.85, 0.1],
      label: 'Play on the mat', variants: [1],
      lines: {
        1: ['I spin the mobile. Four wooden stars go round. I may be thirteen, but that was satisfying.'],
      },
    },
  ],

  // ---------------------------------------------------------------- Kawabe shop (5.0 x 4.3 m), door at -Y, x = 0
  // variants: 1 grocer (kw2), 2 stationery and sweets (kw8), 3 hardware and rope (unused)
  'kawabe-shop': [
    {
      id: 'kawabe-shop.cat', kind: 'pet', stand: [0.12, -1.05], look: [1.4, -1.93, 1.0],
      label: 'Pet the shop cat', variants: [1, 2, 3],
      lines: {
        1: ['The shop cat is in charge of the window. The onions are in charge of everything else.'],
        2: ['The cat smells faintly of candy. I do not want to know how.'],
        3: ['The cat sleeps on, unbothered by forty kinds of nail. A true professional.'],
      },
    },
    {
      id: 'kawabe-shop.table', kind: 'look', stand: [-1.0, -0.6], look: [-1.0, 0.3, 0.85],
      label: 'Look at the display', variants: [1, 2, 3],
      lines: {
        1: ['Crates of radishes, cabbages and mikan. The mikan are arranged like they are on parade.'],
        2: ['Paper rolls, ink and candy jars. A whole shop of things grown-ups say we do not need.'],
        3: ['Rope coils on the table like sleeping snakes. Very tidy snakes.'],
      },
    },
    {
      id: 'kawabe-shop.notices', kind: 'read', stand: [-0.9, -1.2], look: [-0.9, -2.15, 1.55],
      label: 'Read the notice board', variants: [1, 2, 3],
      lines: {
        any: ['"Found: one glove, left, very sad." "Wanted: someone who can fix a gramophone. Again."'],
      },
    },
    {
      id: 'kawabe-shop.hatch', kind: 'look', stand: [-1.6, -1.2], look: [-1.9, -2.1, 1.1],
      label: 'Look out of the hatch', variants: [1, 2, 3],
      lines: {
        1: ['The hatch opens on the lane. Half the valley buys its tea here without coming in.'],
        2: ['Little fingerprints all along the hatch sill, exactly at sweet-jar height.'],
        3: ['A teapot by the hatch. Even hardware people stop for tea.'],
      },
    },
  ],

  // ---------------------------------------------------------------- Takamori house A (6.9 x 5.6 m), door at -Y, x = 1.25
  // variants: 1 baker's family (tk1), 2 musician's home (tk3), 3 gardener's / herbalist's home (tk5)
  'takamori-a': [
    {
      id: 'takamori-a.windowseat', kind: 'sit', stand: [-1.7, -1.85], look: [-1.7, -2.6, 0.45], seatH: 0.45,
      label: 'Sit in the window seat', variants: [1, 2, 3],
      lines: {
        any: ['From up here the whole valley looks like it was arranged on purpose.',
          'The cushion is warm from the sun. I could stay. I will not, but I could.'],
      },
    },
    {
      id: 'takamori-a.hearth', kind: 'warm', stand: [2.0, 1.25], look: [3.0, 0.9, 0.6],
      label: 'Warm up by the hearth', variants: [1, 2, 3],
      lines: {
        1: ['A wheat sheaf over the hearth, for luck. Bakers trust bread more than stars.'],
        2: ['A flute on the mantel, next to a cold cup of tea. Practice won, tea lost.'],
        3: ['A trailing plant on the mantel is slowly taking over the chimney. Nobody is stopping it.'],
      },
    },
    {
      id: 'takamori-a.bedside', kind: 'open', stand: [-2.6, 1.6], look: [-1.93, 2.5, 0.55],
      label: 'Open the bedside chest', variants: [1, 2, 3],
      lines: {
        1: ['Clean aprons folded in a stack. Each one still smells faintly of toast.'],
        2: ['Spare strings, rosin and a tuning fork. Even the drawer is in tune.'],
        3: ['Pressed leaves between paper, every one labelled. Some labels just say "nice".'],
      },
    },
    {
      id: 'takamori-a.koto', kind: 'play', stand: [-2.25, -1.82], look: [-2.62, -1.3, 0.4],
      label: 'Pluck the koto', variants: [2],
      lines: {
        2: ['I pluck one string. It hums for ages, like it has been waiting for someone to ask.'],
      },
    },
    {
      id: 'takamori-a.wateringcan', kind: 'use', stand: [0.6, -1.6], look: [0.25, -1.9, 0.15],
      label: 'Pick up the watering can', variants: [3],
      lines: {
        3: ['Half full and dented in three places. A watering can with a long, honest career.'],
      },
    },
  ],

  // ---------------------------------------------------------------- Takamori house B (4.9 x 4.5 m), door at -Y, x = 0
  // variants: 1 young couple's first home (tk2), 2 bell-ringer's family (tk4), 3 grandmother's sewing room (tk6)
  'takamori-b': [
    {
      id: 'takamori-b.window', kind: 'look', stand: [-1.4, -0.6], look: [-2.33, -0.9, 1.5],
      label: 'Look out of the window', variants: [1, 2, 3],
      lines: {
        1: ['Fresh flowers on the sill and a box labelled "MISC (MORE)". Still moving in, then.'],
        2: ['From here you can just see the bell tower. I bet they set every clock by it.'],
        3: ['Roses in pots on the sill, every one with a little name tag. One is called "Stubborn".'],
      },
    },
    {
      id: 'takamori-b.tatami', kind: 'sit', stand: [-1.2, 0.95], look: [-1.7, 1.6, 0.4], seatH: 0.1,
      label: 'Sit on the tatami', variants: [1, 2, 3],
      lines: {
        1: ['A paper heart garland over the window. Slightly crooked. Clearly hung together.'],
        2: ['A small bell on the shelf and a bright lantern runner. Even the floor is festive.'],
        3: ['A patchwork quilt folded over the futon. I find three squares from the same old apron.'],
      },
    },
    {
      id: 'takamori-b.bells', kind: 'ring', stand: [-1.6, 1.3], look: [-2.28, 1.3, 1.7],
      label: 'Ring a handbell', variants: [2],
      lines: {
        2: ['Eight handbells, smallest to biggest. I ring the smallest. It sounds like a polite sparrow.'],
      },
    },
    {
      id: 'takamori-b.wardrobe', kind: 'open', stand: [1.1, -1.3], look: [2.1, -1.95, 1.0],
      label: 'Open the wardrobe', variants: [1, 2, 3],
      lines: {
        1: ['Half the hangers are empty. The other half hold two very good festival yukata.'],
        2: ['Heavy coats for winter mornings in the tower, and a scarf longer than me.'],
        3: ['Lavender bags in every pocket. The moths have given up and moved valleys.'],
      },
    },
    {
      id: 'takamori-b.wheel', kind: 'use', stand: [-1.2, -1.3], look: [-1.9, -1.55, 0.6],
      label: 'Turn the spinning wheel', variants: [3],
      lines: {
        3: ['The wheel turns with a soft click-click. It sounds like somebody humming without words.'],
      },
    },
  ],

  // ---------------------------------------------------------------- Boathouse (5.0 x 7.0 m), land door at -Y, x = 1.0
  // built as if entered through -Y (the runtime turns the room round). variant 1 only: Rin's fishing nook
  'boathouse': [
    {
      id: 'boathouse.hatch', kind: 'look', stand: [0.0, 2.85], look: [0.0, 3.4, 1.4],
      label: 'Look out at the river', variants: [1, 2, 3],
      lines: {
        any: ['The river slides right under the hatch. You could fish from bed, if you were brave.'],
      },
    },
    {
      id: 'boathouse.bucket', kind: 'look', stand: [0.0, -2.45], look: [-0.9, -3.18, 1.0],
      label: 'Peer into the bucket', variants: [1],
      lines: {
        1: ['Three fish in the bucket, all looking at me like this is my fault.'],
      },
    },
    {
      id: 'boathouse.shrine', kind: 'use', stand: [1.75, -2.45], look: [2.0, -3.3, 2.0],
      label: 'Bow at the little shrine', variants: [1, 2, 3],
      lines: {
        any: ['A tiny shrine for safe water. I bow. It costs nothing and the river is very big.'],
      },
    },
    {
      id: 'boathouse.chest', kind: 'open', stand: [-1.4, -0.3], look: [-2.2, -1.15, 0.7],
      label: 'Open the sea chest', variants: [1, 2, 3],
      lines: {
        any: ['Oilskins, spare line and a tin of biscuits hidden under everything. Strategic.'],
      },
    },
  ],

  // ---------------------------------------------------------------- Engine shed (8.0 x 10.0 m), arched door at -Y, x = 1.7
  // variant 1 only: busy workshop
  'shed': [
    {
      id: 'shed.forge', kind: 'warm', stand: [1.6, 3.6], look: [3.0, 4.1, 0.9],
      label: 'Warm up by the forge', variants: [1, 2, 3],
      lines: {
        any: ['The forge breathes in and out like something asleep. Something very hot and asleep.'],
      },
    },
    {
      id: 'shed.workbench', kind: 'look', stand: [-2.6, -0.2], look: [-3.55, 0.3, 1.05],
      label: 'Look at the workbench', variants: [1],
      lines: {
        1: ['A wheel with three spokes missing and a mug still steaming. Someone just stepped away.'],
      },
    },
    {
      id: 'shed.cot', kind: 'sit', stand: [-2.3, -3.6], look: [-3.4, -3.6, 0.5], seatH: 0.45,
      label: 'Sit on the cot', variants: [1, 2, 3],
      lines: {
        any: ['A cot for long nights and early trains. The pillow has a dent shaped like overtime.'],
      },
    },
    {
      id: 'shed.shelves', kind: 'open', stand: [-1.15, 3.95], look: [-1.15, 4.8, 1.3],
      label: 'Search the parts shelves', variants: [1, 2, 3],
      lines: {
        any: ['Bolts, springs, gauges. A box marked "DO NOT SORT". I respect that system.'],
      },
    },
  ],

  // ================================================================ story rooms (no decor variants: use [1])
  // Sora's cottage (8.6 x 6.8 m), door at -Y, x = 0. Keepsake/kite/gift spots are left alone.
  'cottage': [
    {
      id: 'cottage.letters', kind: 'read', stand: [-2.2, 2.25], look: [-2.2, 3.0, 1.2],
      label: 'Read the letters', variants: [1],
      lines: {
        any: ['Letters from half the valley, tied in bundles. Grandma answered every one. Eventually.'],
        grandma: { any: ['Letters from half the valley, tied in bundles. Grandma answers every one. Eventually. Mine are on top.'] },
      },
    },
    {
      id: 'cottage.window', kind: 'look', stand: [2.3, -0.4], look: [3.45, -0.3, 1.6],
      label: 'Look at the signal things', variants: [1],
      lines: {
        any: ['A semaphore arm, a hand lamp, a model of the Viaduct Lamp. Grandma loved a good signal.'],
        grandma: { any: ['A semaphore arm, a hand lamp, a model of the Viaduct Lamp. Grandma waves the lamp at Genzo every night.'] },
      },
    },
    {
      id: 'cottage.oshiire', kind: 'open', stand: [-2.9, 1.5], look: [-3.7, 1.5, 1.0],
      label: 'Open the oshiire', variants: [1],
      lines: {
        any: ['Futons that still smell of sun and her soap. I close it again, slowly.'],
        grandma: { any: ['Futons that smell of sun and her soap. Grandma airs them every Tuesday, whether they need it or not.'] },
      },
    },
    {
      id: 'cottage.table', kind: 'sit', stand: [-0.95, 1.25], look: [-0.7, 0.4, 0.6], seatH: 0.1,
      label: 'Sit at the low table', variants: [1],
      lines: {
        any: ['Grandma\'s cushion is the flat one. She said the flat ones had the best stories.'],
        grandma: { any: ['Grandma\'s cushion is the flat one. She says the flat ones have the best stories. Then she tells one.'] },
      },
    },
  ],

  // Hana's bakery (8.0 x 7.0 m), door at -Y, x = 0
  'bakery': [
    {
      id: 'bakery.oven', kind: 'warm', stand: [-1.9, 1.3], look: [-0.6, 2.0, 1.0],
      label: 'Warm up by the oven', variants: [1],
      lines: {
        any: ['The oven is older than the viaduct and twice as warm. Possibly twice as stubborn.'],
      },
    },
    {
      id: 'bakery.breadwall', kind: 'look', stand: [-2.7, -0.3], look: [-3.5, -0.3, 1.3],
      label: 'Smell the bread shelves', variants: [1],
      lines: {
        any: ['I breathe in. I am now legally part bread.'],
      },
    },
    {
      id: 'bakery.cafe', kind: 'sit', stand: [-2.3, -0.9], look: [-2.3, -2.2, 0.75], seatH: 0.45, seat: [-1.81, -1.95],
      label: 'Sit at the cafe table', variants: [1],
      lines: {
        any: ['The window table. Half the valley\'s gossip has been eaten off this table with buns.'],
      },
    },
    {
      id: 'bakery.peaches', kind: 'look', stand: [0.55, -0.6], look: [1.4, -0.3, 0.5],
      label: 'Count the peaches', variants: [1],
      lines: {
        any: ['Twenty-three peaches. Twenty-two if Hana is not looking. She is always looking.'],
      },
    },
  ],

  // Ota's mill (8.2 x 7.4 m), door at -Y, x = 0
  'mill': [
    {
      id: 'mill.hibachi', kind: 'warm', stand: [-1.5, 0.5], look: [-2.35, 1.0, 0.6],
      label: 'Warm up by the brazier', variants: [1],
      lines: {
        any: ['Coals ticking, a plate of pickled radish within reach. A very serious sitting corner.'],
      },
    },
    {
      id: 'mill.gears', kind: 'look', stand: [0.6, 0.1], look: [2.2, 0.3, 1.2],
      label: 'Watch the gears', variants: [1],
      lines: {
        any: ['Wooden teeth, iron pins, a whole river turning one stone. I could watch this all day.'],
      },
    },
    {
      id: 'mill.crocks', kind: 'open', stand: [-2.8, -0.1], look: [-3.7, -0.3, 1.0],
      label: 'Lift a crock lid', variants: [1],
      lines: {
        any: ['Ten years of radish, by the smell. My eyes are watering with respect.'],
      },
    },
    {
      id: 'mill.scale', kind: 'use', stand: [1.2, -1.9], look: [1.2, -2.7, 1.0],
      label: 'Try the balance scale', variants: [1],
      lines: {
        any: ['I put one finger on the pan. The scale says I am mostly flour. Fair.'],
      },
    },
  ],

  // Genzo's station office (7.8 x 6.6 m), door at -Y, x = 0
  'station': [
    {
      id: 'station.stove', kind: 'warm', stand: [-1.75, 0.6], look: [-2.75, 0.6, 0.8],
      label: 'Warm up by the stove', variants: [1],
      lines: {
        any: ['The kettle on the stove is always just about to boil. Like a stationmaster.'],
      },
    },
    {
      id: 'station.bench', kind: 'sit', stand: [-2.6, -1.6], look: [-3.55, -1.6, 0.45], seatH: 0.45,
      label: 'Sit on the bench', variants: [1],
      lines: {
        any: ['A waiting bench, polished smooth by a hundred years of waiting.'],
      },
    },
    {
      id: 'station.clock', kind: 'look', stand: [-2.3, 2.0], look: [-2.7, 2.92, 2.2],
      label: 'Look at the clock', variants: [1],
      lines: {
        any: ['Tick. Tock. The pendulum has never once been late. Unlike some people. Me.'],
      },
    },
    {
      id: 'station.rack', kind: 'read', stand: [2.7, 2.0], look: [3.5, 2.0, 1.4],
      label: 'Read the ticket rack', variants: [1],
      lines: {
        any: ['Little card tickets in pigeonholes, one for every stop. Some stops I have never heard of.'],
      },
    },
  ],
};

// One memory per home (room id), found at a hotspot of that room. mon: coins given when found (0-3).
export const MEMORIES = {
  cottage: {
    hotspot: 'cottage.oshiire', name: 'Pressed bellflower', icon: 'memory', mon: 0,
    text: 'A bellflower Grandma pressed in a train timetable, on the page for the last train home.',
  },
  bakery: {
    hotspot: 'bakery.cafe', name: 'Napkin doodle', icon: 'memory', mon: 1,
    text: 'A peach bun with a face, drawn on a napkin and signed "S." It looks very pleased with itself.',
  },
  mill: {
    hotspot: 'mill.crocks', name: 'Lucky radish tag', icon: 'memory', mon: 1,
    text: 'A wooden tag from a radish crock, carved "Year one: don\'t open till it\'s good."',
  },
  station: {
    hotspot: 'station.rack', name: 'Star-punched ticket', icon: 'memory', mon: 2,
    text: 'A blank ticket punched with a star-shaped hole. Somebody once made the punch just for fun.',
  },
  kw1: {
    hotspot: 'kawabe-a.tansu', name: 'Crayon Star Train', icon: 'memory', mon: 2,
    text: 'A crayon drawing of the Star Train with nine wheels and a very happy moon driving it.',
  },
  kw3: {
    hotspot: 'kawabe-a.shelf', name: 'Old festival fan', icon: 'memory', mon: 1,
    text: 'A paper festival fan, the stars on it faded to gold. Someone fanned a lot of summers with it.',
  },
  kw5: {
    hotspot: 'kawabe-a.tansu', name: 'Lucky lure', icon: 'memory', mon: 2,
    text: 'A hand-carved lure painted like a star. It has never caught a fish, and never will.',
  },
  kw7: {
    hotspot: 'kawabe-a.toys', name: 'Toy carriage number 4', icon: 'memory', mon: 1,
    text: 'The missing fourth carriage of the toy train, found under the rug, where carriages go to rest.',
  },
  kw4: {
    hotspot: 'kawabe-b.playmat', name: 'Wooden star rattle', icon: 'memory', mon: 1,
    text: 'A little wooden rattle shaped like a star, with tooth marks on every point.',
  },
  kw6: {
    hotspot: 'kawabe-b.bookcase', name: 'Class photo', icon: 'memory', mon: 2,
    text: 'A class photo by the river, every child named on the back in tidy ink, one marked "Sora, chatty".',
  },
  otaHouse: {
    hotspot: 'kawabe-b.sewing', name: 'Indigo yukata scrap', icon: 'memory', mon: 1,
    text: 'A scrap of indigo yukata with tiny white stars, pinned to a note: "save for something special".',
  },
  kw2: {
    hotspot: 'kawabe-shop.notices', name: 'Lost-kite notice', icon: 'memory', mon: 0,
    text: 'An old notice in a child\'s hand: "Lost: red kite. Answers to nothing. Please return anyway."',
  },
  kw8: {
    hotspot: 'kawabe-shop.table', name: 'Paper crane wrapper', icon: 'memory', mon: 1,
    text: 'A sweet wrapper folded into a tiny crane. It still smells of plum.',
  },
  tk1: {
    hotspot: 'takamori-a.bedside', name: 'First bun mould', icon: 'memory', mon: 2,
    text: 'A dented little bun mould, the first one the baker ever owned. Every bun from it came out lopsided.',
  },
  tk3: {
    hotspot: 'takamori-a.koto', name: 'Star koto pick', icon: 'memory', mon: 2,
    text: 'A spare koto pick with a star scratched into it, for good luck on festival nights.',
  },
  tk5: {
    hotspot: 'takamori-a.wateringcan', name: 'Seed packet', icon: 'memory', mon: 1,
    text: 'A paper seed packet, labelled "night violets, from S., plant where you can see the stars".',
  },
  tk2: {
    hotspot: 'takamori-b.wardrobe', name: 'Two festival ribbons', icon: 'memory', mon: 1,
    text: 'Two festival ribbons knotted together, one red, one blue, from the night they first danced.',
  },
  tk4: {
    hotspot: 'takamori-b.bells', name: 'Wrapped bell clapper', icon: 'memory', mon: 2,
    text: 'An old bell clapper wrapped in paper, marked "retired after 40 years of very good work".',
  },
  tk6: {
    hotspot: 'takamori-b.wheel', name: 'Spindle of gold yarn', icon: 'memory', mon: 3,
    text: 'A spindle of yarn the exact gold of a festival lantern. Grandma Sora always asked for a scarf.',
    grandma: { text: 'A spindle of yarn the exact gold of a festival lantern. Grandma Sora is getting a scarf this year. Shh.' },
  },
  boathouse: {
    hotspot: 'boathouse.chest', name: 'Ferry ticket stub', icon: 'memory', mon: 2,
    text: 'A ferry ticket stub from the old river crossing, the date faded, "ROUND TRIP" still clear.',
  },
  engineShed: {
    hotspot: 'shed.shelves', name: 'Brass whistle knob', icon: 'memory', mon: 3,
    text: 'The brass knob off an old train whistle, polished so often its star has nearly worn away.',
  },
};
