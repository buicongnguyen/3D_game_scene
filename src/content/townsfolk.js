// Town Life: the valley's named neighbours. Where they go (SPOTS), what they do all day (plan blocks of tasks that loop
// while the block lasts) and the small personal stories Mika can follow with them (story stages, chapter-gated).
// Contract: scratchpad townlife/DESIGN.md. Spots pass the placement rules of tests/barks.test.mjs (dry, gentle, clear of
// buildings, off the river). Doors are written 'door:<buildingId>'. Kawabe folk stay west of the river, Takamori folk east.

// world x, z in metres (x east, z south); face = yaw in radians
export const SPOTS = {
  // ---- Kawabe (main street along x = -45)
  'kawabe.well': { x: -41, z: 24, face: Math.PI / 2 },
  'kawabe.bench': { x: -40, z: 36, face: Math.PI / 2 },
  'kawabe.corner': { x: -44, z: 40 },
  'kawabe.lessons': { x: -38, z: 44, face: -Math.PI / 2 },
  'kawabe.playground': { x: -40, z: 4 },
  'kawabe.porch': { x: -36, z: 26 },
  'kawabe.field': { x: -30, z: 22 },
  'kawabe.fieldEdge': { x: -28, z: 8 },
  'kawabe.yard': { x: -27.3, z: 22.6 },       // the playground yard's west gate (content/yard.js)
  'kawabe.garden': { x: -62, z: 26 },
  'kawabe.lane': { x: -16, z: 40 },
  'kawabe.dockHead': { x: -8, z: 30, face: Math.PI / 2 },
  'kawabe.fishing': { x: -4, z: 38, face: Math.PI / 2 },
  'kawabe.washing': { x: -6, z: 20, face: Math.PI / 2 },
  'kawabe.rinsing': { x: -9, z: 8, face: Math.PI / 2 },
  'kawabe.boatyard': { x: -20, z: -4 },
  'kawabe.southLane': { x: -44, z: -24 },
  'kawabe.millLane': { x: -36, z: -30 },
  // ---- Takamori (square at (115, 6) on the plateau)
  'takamori.square': { x: 115, z: 6 },
  'takamori.stall': { x: 110, z: 10, face: 0 },
  'takamori.bellSteps': { x: 115, z: 2, face: 0 },
  'takamori.towerYard': { x: 120, z: -6 },
  'takamori.bakeryFront': { x: 104, z: 14, face: Math.PI / 2 },
  'takamori.bench': { x: 124, z: 4, face: -Math.PI / 2 },
  'takamori.well': { x: 108, z: 22 },
  'takamori.playground': { x: 120, z: 20 },
  'takamori.green': { x: 128, z: 18 },
  'takamori.lane': { x: 100, z: 26 },
  'takamori.lookout': { x: 44, z: 28, face: -Math.PI / 2 },
  'takamori.orchardLane': { x: 90, z: -22 },
  'takamori.orchard': { x: 84, z: -50 },
  'takamori.pastureFence': { x: 140, z: -30 },
  'takamori.pasture': { x: 146, z: -28 },
};

// every home has a quiet night: walk to the door, stay in till morning
const night = home => ({ from: 20, tasks: [{ go: `door:${home}` }, { inside: 0 }] });

export const PEOPLE = [
  // ============================================================== KAWABE
  {
    id: 't1', name: 'Mr. Fujita', role: 'Grocer', model: 'villager-man', village: 'kawabe', home: 'kw2', shop: 'grocer',
    plan: [
      { from: 6, tasks: [{ go: 'door:kw2' }, { do: 'Sweep', t: 16, prop: 'broom' }, { chat: 'v1', at: 'kawabe.corner', t: 18 }, { go: 'door:kw2' }, { do: 'Carry', t: 8, prop: 'basket' }, { inside: 40 }] },
      { from: 9, tasks: [{ sell: 'grocer', t: 150 }, { go: 'door:kw2' }, { do: 'Sweep', t: 12, prop: 'broom' }] },
      { from: 12, tasks: [{ sell: 'grocer', t: 90 }, { go: 'kawabe.well' }, { do: 'Carry', t: 6, prop: 'bucket' }, { go: 'door:kw2' }] },
      { from: 15, tasks: [{ sell: 'grocer', t: 150 }, { go: 'door:kw2' }, { do: 'Idle', t: 10 }] },
      { from: 18, tasks: [{ go: 'door:kw2' }, { do: 'Sweep', t: 14, prop: 'broom' }, { inside: 0 }] },
      night('kw2'),
    ],
    story: [
      { when: { chapter: [0, 5] }, lines: [
        ['t1', "Welcome to Fujita Grocery! Rice balls, pickles, tea, and the best gossip on the river. The gossip is free.", 'Wave'],
        ['mika', "What's the gossip today?"],
        ['t1', "That Sora's granddaughter is about. Raincoat, boots, looks like she'd haggle. ...Ah. It's you, isn't it?"],
        ['mika', "I do haggle."],
        ['t1', "Then we'll get on fine. Carry these empty crates out back for me? There. Two mon, your first wage in Kawabe."],
        ['t1', "I'll buy any fish, chestnut or mushroom you bring me, too. Fair prices. Mostly fair."] ], give: { mon: 2 } },
      { when: { chapter: [1, 5], after: 'c1.lamp' }, give: { parcel_teacher: 1 }, lines: [
        ['t1', "You walk a lot, don't you? I've a parcel for Miss Endo. Chalk, copybooks, and one book of poems she pretends isn't hers."],
        ['mika', "I'll be very discreet about the poems."],
        ['t1', "Good girl. She teaches the little ones on the lawn at the south end of the street. Here, it's lighter than it looks."] ] },
      { when: { chapter: [1, 5] }, needs: { card_fujita: 1 }, ask: "Did Miss Endo get her parcel? She's a woman of words, she'll have something to say.", lines: [
        ['t1', "A thank-you card from Miss Endo? In verse. I've never been thanked in verse.", 'Cheer'],
        ['mika', "How was it?"],
        ['t1', "It rhymed 'Fujita' with 'sweeter'. I've pinned it by the till. Here, a little something for your trouble."] ], give: { mon: 5 } },
      { when: { chapter: [4, 5], after: 'c4.meeting' }, lines: [
        ['t1', "So nobody's lamp was the only dark one. Ten years I wouldn't stock a single thing from across the river."],
        ['mika', "And now?"],
        ['t1', "Now I'm writing to Hana about her buns. Wholesale. Don't tell Grandpa Ōta until I've worked out how to tell Grandpa Ōta."] ],
        grandma: { lines: [
          ['t1', "Genzo said 'please' on that platform. Seventy years! Your grandma nearly fell off the bench laughing."],
          ['mika', "She says she's waited her whole life to hear it."],
          ['t1', "Now I'm writing to Hana about her buns. Wholesale. Don't tell Grandpa Ōta until I've worked out how to tell Grandpa Ōta."] ] } },
    ],
    chatter: ["Rice balls this morning, still warm. Well, warm-ish.", "A good grocer knows every family's pickle. Mine's radish.",
      "Bring me chestnuts and I'll pay in mon, not in compliments.", "My father kept this shop. His father swept that same step.",
      "Tea's on the shelf by the door. Smell it, it's free."],
  },
  {
    id: 't2', name: 'Mrs. Komori', role: 'Sweets & paper shop', model: 'villager-woman', village: 'kawabe', home: 'kw8', shop: 'sweets',
    plan: [
      { from: 6, tasks: [{ go: 'door:kw8' }, { do: 'Sweep', t: 14, prop: 'broom' }, { go: 'kawabe.well' }, { do: 'Carry', t: 6, prop: 'bucket' }, { go: 'door:kw8' }, { inside: 40 }] },
      { from: 9, tasks: [{ sell: 'sweets', t: 160 }, { go: 'door:kw8' }, { do: 'Wave', t: 4 }] },
      { from: 12, tasks: [{ chat: 'v9', at: 'kawabe.bench', t: 24 }, { go: 'door:kw8' }, { sell: 'sweets', t: 120 }] },
      { from: 15, tasks: [{ sell: 'sweets', t: 160 }, { go: 'door:kw8' }, { do: 'Sweep', t: 10, prop: 'broom' }] },
      { from: 18, tasks: [{ go: 'door:kw8' }, { inside: 0 }] },
      night('kw8'),
    ],
    story: [
      { when: { chapter: [0, 5] }, lines: [
        ['t2', "Komori Sweets and Paper. Red-bean candy for the tongue, good paper for the heart. Mind the pinwheels.", 'Bow'],
        ['mika', "Sweets and stationery. Bold combination."],
        ['t2', "People write better letters with something sweet in their mouths. It's science. My science."] ] },
      { when: { chapter: [1, 5] }, lines: [
        ['t2', "Your grandmother bought her paper here. Pale blue, always. She said grey paper made letters sound tired."],
        ['mika', "My letters from her were always blue."],
        ['t2', "Then you know she meant every word. I still have half a ream put by for her. It's yours, whenever you write to someone."] ],
        grandma: { lines: [
          ['t2', "Your grandmother buys her paper here. Pale blue, always. She says grey paper makes letters sound tired."],
          ['mika', "All her letters to me were blue."],
          ['t2', "Then you know she meant every word. Tell her a new ream's in. And take a sheet yourself. Write to your parents."] ] } },
      { when: { chapter: [3, 5] }, ask: "Bring me two chestnuts? I want to try making chestnut candy. My mother's recipe, never once attempted.",
        needs: { chestnut: 2 }, give: { mon: 8 }, lines: [
        ['t2', "Chestnuts! Plump ones! You've a good eye, girl.", 'Cheer'],
        ['mika', "The squirrels have a better one. I was second."],
        ['t2', "Chestnut candy, then. If it sets right I'll name it after you. If it doesn't, after Fujita."] ] },
      { when: { chapter: [5, 5] }, lines: [
        ['t2', "The children paste stars on everything now. I've sold more gold paper this spring than in ten years together."],
        ['mika', "Sorry. Probably my fault."],
        ['t2', "Never apologise for good business, dear. Have a candy. The chestnut ones are called 'Mika's'. They set beautifully."] ] },
    ],
    chatter: ["Pinwheels turn best facing the river.", "One candy each. Two if you've been brave today.",
      "Blue paper for good news, white for thank-yous, never grey.", "The children count their coins on my counter. Very slowly."],
  },
  {
    id: 'v1', name: 'Mr. Hirano', role: 'Kawabe postman', village: 'kawabe', home: 'kw1',
    plan: [
      { from: 6, tasks: [{ go: 'door:kw1' }, { do: 'Interact', t: 6, prop: 'letters' }, { chat: 't1', at: 'kawabe.corner', t: 18 }, { deliver: ['kw3', 'kw5', 'kw6'] }, { wander: 'kawabe.corner', r: 4, t: 10 }] },
      { from: 9, tasks: [{ deliver: ['kw4', 'kw7', 'kw8', 'otaHouse', 'kw6'] }, { go: 'kawabe.bench' }, { do: 'Sit', t: 12 }, { chat: 'v18', at: 'kawabe.porch', t: 20 }] },
      { from: 12, tasks: [{ go: 'kawabe.bench' }, { do: 'Sit', t: 30 }, { deliver: ['kw2', 'kw3'] }] },
      { from: 15, tasks: [{ deliver: ['kw5', 'kw1', 'kw7'] }, { go: 'kawabe.dockHead' }, { do: 'Interact', t: 8, prop: 'letters' }, { chat: 'v18', at: 'kawabe.porch', t: 20 }] },
      { from: 18, tasks: [{ go: 'door:kw1' }, { inside: 0 }] },
      night('kw1'),
    ],
    story: [
      { when: { chapter: [0, 5] }, lines: [
        ['v1', "Post! Oh, it's you. Sorry, I say 'post' at everyone. Hirano, the Kawabe postman. Eleven doors, twenty-two years.", 'Wave'],
        ['mika', "Eleven doors. Must be quick."],
        ['v1', "It would be, if nobody offered me tea. Everybody offers me tea."] ] },
      { when: { chapter: [2, 5] }, give: { mailbag: 1 }, lines: [
        ['v1', "Our post for Takamori goes over with Rin's ferry. I hand it to her, she hands it to Sato, nobody says hello."],
        ['mika', "That sounds exhausting."],
        ['v1', "Ten years of it. Today, would you carry it across? You talk to both sides. Somebody has to."] ],
        grandma: { lines: [
          ['v1', "Our post for Takamori goes over with Rin's ferry. Twenty years I've swapped bags with Sato, and we've never once met."],
          ['mika', "Never? It's one river."],
          ['v1', "Our rounds cross at the same hour. Your grandma says you know everyone already. Would you carry it across today?"] ] } },
      { when: { chapter: [2, 5] }, needs: { note_hirano: 1 }, ask: "Did Sato say anything when you gave him the bag? He never says anything. Not to me.", lines: [
        ['v1', "A note from Sato? 'Thank you, Hirano.' Ten years, and that's the first thing he's said to me. I've read it eleven times."],
        ['mika', "It's three words."],
        ['v1', "Three very good words. Here, for the ferry fare you didn't pay."] ],
        grandma: { lines: [
          ['v1', "A note from Sato? 'Thank you, Hirano.' Twenty years of post, and my first letter. I've read it eleven times."],
          ['mika', "It's three words."],
          ['v1', "Three very good words. Here, for the ferry fare you didn't pay."] ] }, give: { mon: 4 } },
      { when: { chapter: [4, 5], after: 'c4.meeting' }, lines: [
        ['v1', "Sato and I are going to swap rounds one day. He'll walk Kawabe, I'll walk Takamori. A holiday!", 'Cheer'],
        ['mika', "Walking someone else's route is a holiday?"],
        ['v1', "New doors, girl. New people offering me tea."] ] },
    ],
    chatter: ["Post! Sorry. Habit.", "Mrs. Tsuru gets the most letters. Her grandchildren write in crayon.",
      "Rain or shine, the post comes. Mostly shine, thank goodness.", "A letter is a person arriving slowly."],
  },
  {
    id: 'v2', name: 'Mrs. Nakano', role: 'Washes at the river', village: 'kawabe', home: 'kw4',
    plan: [
      { from: 6, tasks: [{ go: 'kawabe.well' }, { do: 'Carry', t: 8, prop: 'bucket' }, { go: 'door:kw4' }, { inside: 30 }, { go: 'door:kw4' }, { do: 'Sweep', t: 10, prop: 'broom' }] },
      { from: 9, tasks: [{ go: 'door:kw4' }, { do: 'Carry', t: 6, prop: 'basket' }, { go: 'kawabe.washing' }, { do: 'Interact', t: 30, prop: 'basket' }, { chat: 'v18', at: 'kawabe.washing', t: 24 }, { go: 'kawabe.rinsing' }, { do: 'Interact', t: 20 }] },
      { from: 12, tasks: [{ go: 'door:kw4' }, { inside: 40 }, { go: 'kawabe.garden' }, { do: 'Interact', t: 20, prop: 'basket' }] },
      { from: 15, tasks: [{ go: 'kawabe.garden' }, { do: 'Interact', t: 24, prop: 'basket' }, { go: 'door:kw4' }, { do: 'Carry', t: 8, prop: 'basket' }, { inside: 30 }] },
      { from: 18, tasks: [{ go: 'door:kw4' }, { inside: 0 }] },
      night('kw4'),
    ],
    story: [
      { when: { chapter: [0, 5] }, lines: [
        ['v2', "Mind my sheets, love. The river does the washing. I just stand here and take the credit."],
        ['mika', "Doesn't the river mind?"],
        ['v2', "It's been doing my washing for twenty years, love. Nakano's the name. Ask anyone, they'll tell you I talk too much."] ] },
      { when: { chapter: [1, 5], after: 'c1.lamp' }, lines: [
        ['v2', "He came home! My Goro saw the Mill Lamp burning from the hill road and got straight off the bus.", 'Cheer'],
        ['mika', "He was on a bus?"],
        ['v2', "On his way to somewhere else. He says the lamp looked like the house calling him for supper. Thank you, love."] ],
        grandma: { lines: [
          ['v2', "He came home! My Goro saw the Mill Lamp shining from the hill road and got straight off the bus.", 'Cheer'],
          ['mika', "He was on a bus?"],
          ['v2', "On his way to somewhere else. 'Emi,' he says, 'it's brighter than the city, and it's OURS.' Thank you, love."] ] } },
      { when: { chapter: [1, 5], after: 'c1.lamp' }, give: { old_shirt: 1 }, lines: [
        ['v2', "Goro's old work shirt. Holes you could post a cat through. He won't throw it out."],
        ['mika', "So you're giving it away behind his back."],
        ['v2', "To a scarecrow. It'll still be in the family view. Mr. Kubo, by the vegetable plots. Off you go."] ] },
      { when: { chapter: [5, 5] }, lines: [
        ['v2', "Sunday trains, a husband who's home for supper, and a son who smells of river. I've nothing left to wish for."],
        ['mika', "Drier sheets?"],
        ['v2', "Ha! Cheeky. Now I've one thing left to wish for."] ] },
    ],
    chatter: ["Wring it, shake it, hang it. Life's the same.", "The river's in a good mood today. You can hear it.",
      "My Daichi swims like an otter and eats like two.", "Sun on the sheets is the best smell there is."],
  },
  {
    id: 'v8', name: 'Mr. Nakano', role: 'Fisher', village: 'kawabe', home: 'kw4',
    plan: [
      { from: 6, tasks: [{ go: 'kawabe.fishing' }, { do: 'Idle', t: 40, prop: 'fishing-rod' }, { go: 'kawabe.dockHead' }, { do: 'Interact', t: 12, prop: 'fishing-rod' }] },
      { from: 9, tasks: [{ go: 'kawabe.fishing' }, { do: 'Idle', t: 50, prop: 'fishing-rod' }, { chat: 'v19', at: 'kawabe.lane', t: 22 }, { go: 'kawabe.dockHead' }, { do: 'Carry', t: 10, prop: 'basket' }] },
      { from: 12, tasks: [{ go: 'kawabe.dockHead' }, { do: 'Sit', t: 30 }, { go: 'door:kw2' }, { do: 'Interact', t: 6, prop: 'basket' }] },
      { from: 15, tasks: [{ go: 'kawabe.fishing' }, { do: 'Idle', t: 50, prop: 'fishing-rod' }, { go: 'kawabe.boatyard' }, { do: 'Hammer', t: 14 }] },
      { from: 18, tasks: [{ go: 'kawabe.fishing' }, { do: 'Idle', t: 30, prop: 'fishing-rod' }, { go: 'door:kw4' }, { inside: 0 }] },
      night('kw4'),
    ],
    story: [
      { when: { chapter: [1, 5], after: 'c1.lamp' }, lines: [
        ['v8', "Goro Nakano. Ten years gutting someone else's fish in the city port. Then I saw the Mill Lamp from a bus window."],
        ['mika', "And you just got off?"],
        ['v8', "Left my umbrella on it. Worth it. The river smells exactly the same, and so, my wife says, do I."] ] },
      { when: { chapter: [1, 5], after: 'c1.lamp' }, ask: "Fetch me a tin of tea from Fujita's? I owe Grandpa Ōta an apology, and he only accepts them with tea.",
        needs: { tea: 1 }, give: { mon: 7 }, lines: [
        ['v8', "That's the one. Roasted. Ōta pretends he likes green, but he drinks roasted when he thinks nobody's looking."],
        ['mika', "What are you apologising for?"],
        ['v8', "For leaving without saying goodbye. Ten years late. Tea first, sorry second. Here, for your legs."] ],
        grandma: { ask: "Fetch me a tin of tea from Fujita's? I owe Grandpa Ōta ten years of postcards, and he only forgives with tea.", lines: [
          ['v8', "That's the one. Roasted. Ōta pretends he likes green, but he drinks roasted when he thinks nobody's looking."],
          ['mika', "Ten years of postcards?"],
          ['v8', "I promised one a month. I sent two. One was blank. Tea first, excuses second. Here, for your legs."] ] } },
      { when: { chapter: [2, 5] }, lines: [
        ['v8', "Ōta took the tea. Said 'Hmph.' Then he said 'Sit down, you fool.' That's practically a hug."],
        ['mika', "From him, that's a parade."] ] },
      { when: { chapter: [5, 5] }, lines: [
        ['v8', "I fish for the Sunday train now. Fujita grills, Hana buns, and nobody argues. Much.", 'Cheer'],
        ['mika', "How much?"],
        ['v8', "About buns. Mostly about how many buns. Peaceful arguing. The best kind."] ] },
    ],
    chatter: ["Fish don't care what village you're from.", "Patience is just waiting with a rod in your hand.",
      "Never trust a calm river. Respect it, though.", "Rin's a better fisher than me. Don't tell her I said so."],
  },
  {
    id: 'v18', name: 'Granny Tsuru', role: 'Widow, keeps a shrine to her husband', roleGrandma: "Boatbuilder's wife, keeper of the street's secrets", village: 'kawabe', home: 'kw5',
    plan: [
      { from: 6, tasks: [{ go: 'door:kw5' }, { do: 'Sweep', t: 14, prop: 'broom' }, { inside: 40 }] },
      { from: 9, tasks: [{ go: 'kawabe.washing' }, { chat: 'v2', at: 'kawabe.washing', t: 24 }, { go: 'kawabe.porch' }, { chat: 'v1', at: 'kawabe.porch', t: 20 }, { go: 'kawabe.bench' }, { do: 'Sit', t: 30 }] },
      { from: 12, tasks: [{ go: 'door:kw5' }, { inside: 60 }, { go: 'kawabe.bench' }, { do: 'Sit', t: 20 }] },
      { from: 15, tasks: [{ go: 'kawabe.porch' }, { chat: 'v1', at: 'kawabe.porch', t: 20 }, { go: 'kawabe.bench' }, { do: 'Sit', t: 40 }, { go: 'door:kw5' }, { inside: 20 }] },
      { from: 18, tasks: [{ go: 'door:kw5' }, { inside: 0 }] },
      night('kw5'),
    ],
    story: [
      { when: { chapter: [0, 5] }, lines: [
        ['v18', "Come here, let me look at you. Yes. Sora's chin. She'd stick it out just like that when she was right.", 'Wave'],
        ['mika', "I'm sticking it out?"],
        ['v18', "You are, dear. I'm Tsuru. Eighty-one, two good knees out of four, and I know every secret on this street."] ] },
      { when: { chapter: [1, 5] }, lines: [
        ['v18', "My Isamu built half the boats on this river. Every morning I tell his photograph the news."],
        ['mika', "What did you tell him today?"],
        ['v18', "That Sora's girl is clearing out the cottage and not clearing off. He'd have liked that."] ],
        grandma: { lines: [
          ['v18', "My Isamu built half the boats on this river. He's at the coast yard till winter. Every morning I tell his photograph the news."],
          ['mika', "What did you tell him today?"],
          ['v18', "That Sora's girl carries her shopping up the bluff and still beats her at cards. Then I post it to him. He writes back 'Ha!'"] ] } },
      { when: { chapter: [2, 5] }, ask: "Bring me a bunch of wildflowers from the stall in Takamori? Isamu always bought them there, every week, for my table.",
        needs: { flowers: 1 }, give: { mon: 9 }, lines: [
        ['v18', "Oh. Oh, that's them. Yellow ones and the little blue ones. He'd come back from across the river smelling of them."],
        ['mika', "You couldn't get them yourself?"],
        ['v18', "Not with my knees and Rin's driving. They're for his shrine. Here, love, take this. No, take it. Don't argue with an old woman."] ],
        grandma: { ask: "Bring me a bunch of wildflowers from the stall in Takamori? Isamu always buys them there for my table, and he's away till winter.", lines: [
          ['v18', "Oh. Oh, that's them. Yellow ones and the little blue ones. He always comes back from across the river smelling of them."],
          ['mika', "You couldn't get them yourself?"],
          ['v18', "Not with my knees and Rin's driving. I'll press one and post it to him. Here, love, take this. Don't argue with an old woman."] ] } },
      { when: { chapter: [4, 5], after: 'c4.meeting' }, lines: [
        ['v18', "Fujita told me what was said on the platform. Nobody's villain. Isamu always said that about everybody."],
        ['mika', "Was he right?"],
        ['v18', "About people, always. About the weather, never. Go on, dear. Keep that chin up."] ],
        grandma: { lines: [
          ['v18', "Fujita told me Genzo said 'please' on the platform. Sora must be insufferable. I'm going round to be insufferable with her."],
          ['mika', "She's made a cake about it."],
          ['v18', "Of course she has. Isamu bet me a boat that Genzo would ask for help one day. I owe that man a boat. Go on, dear."] ] } },
    ],
    chatter: ["My husband built that boathouse. Mind the third step.", "Eighty-one and still the first awake on this street.",
      "Tea, dear? No? Your loss.", "Sora and I were girls together on this river. She was always faster."],
    chatterGrandma: ["My husband built that boathouse. Mind the third step.", "Eighty-one and still the first awake on this street.",
      "Tea, dear? No? Your loss.", "Sora and I were girls together on this river. She's still faster. With a stick.",
      "Tell your grandma it's my turn to host cards. She cheats. Lovingly."],
  },
  {
    id: 'v19', name: 'Mr. Kubo', role: 'Farmer, keeps the vegetable plots', village: 'kawabe', home: 'kw3',
    plan: [
      { from: 6, tasks: [{ go: 'kawabe.field' }, { do: 'Hammer', t: 24, prop: 'hoe' }, { go: 'kawabe.well' }, { do: 'Carry', t: 8, prop: 'bucket' }, { go: 'kawabe.field' }, { do: 'Interact', t: 14, prop: 'bucket' }] },
      { from: 9, tasks: [{ go: 'kawabe.field' }, { do: 'Hammer', t: 30, prop: 'hoe' }, { go: 'kawabe.fieldEdge' }, { do: 'Interact', t: 20, prop: 'basket' }, { chat: 'v8', at: 'kawabe.lane', t: 22 }] },
      { from: 12, tasks: [{ go: 'kawabe.fieldEdge' }, { do: 'Sit', t: 30 }, { go: 'door:kw3' }, { inside: 30 }] },
      { from: 15, tasks: [{ go: 'kawabe.fieldEdge' }, { do: 'Hammer', t: 30, prop: 'hoe' }, { go: 'kawabe.field' }, { do: 'Carry', t: 10, prop: 'basket' }, { go: 'door:kw2' }, { do: 'Interact', t: 6, prop: 'basket' }] },
      { from: 18, tasks: [{ go: 'door:kw3' }, { inside: 0 }] },
      night('kw3'),
    ],
    story: [
      { when: { chapter: [0, 5] }, lines: [
        ['v19', "Radishes, beans, cabbages and one scarecrow called Mr. Kakashi. Kubo. That's me, not the scarecrow."],
        ['mika', "Hello, Mr. Kubo. Hello, Mr. Kakashi."],
        ['v19', "Ha! You're the first to greet him in years. He's lost his shirt and his dignity. The crows can tell."] ] },
      { when: { chapter: [1, 5] }, ask: "Mr. Kakashi needs a shirt. Anything with sleeves. The crows laugh at a bare scarecrow.",
        needs: { old_shirt: 1 }, give: { mon: 6 }, lines: [
        ['v19', "Goro Nakano's work shirt! I'd know those holes anywhere. Perfect. It still smells of fish. The crows will hate it.", 'Cheer'],
        ['mika', "Mrs. Nakano said it stays in the family view."],
        ['v19', "He can wave at it from the bank. There. Mr. Kakashi, you look like a man with a future."] ] },
      { when: { chapter: [3, 5] }, lines: [
        ['v19', "Best radishes in ten years. Fujita's pickling half of them. Ōta will complain about every one."],
        ['mika', "He complains about radish a lot."],
        ['v19', "Longest feud in the valley, Ōta and radish. Older than the other one. Kinder, too."] ],
        grandma: { lines: [
          ['v19', "Best radishes in years. Fujita's pickling half of them. Ōta will complain about every one."],
          ['mika', "He complains about radish a lot."],
          ['v19', "Longest feud in the valley, Ōta and radish. Your grandma says it's the only thing keeping him young."] ] } },
      { when: { chapter: [5, 5] }, lines: [
        ['v19', "Takamori asked for my seed beans. Takamori! I sent them two bags and a drawing of Mr. Kakashi."],
        ['mika', "For instructions?"],
        ['v19', "For inspiration. Every field deserves a scarecrow with a past."] ] },
    ],
    chatter: ["Soil's warm. Good sign.", "Mr. Kakashi sends his regards.", "A radish is honest. What you see is what you pickle.",
      "My Yui says she'll be a train driver. I said: and who'll grow the beans?"],
  },
  {
    id: 'v9', name: 'Miss Endo', role: 'Schoolteacher', village: 'kawabe', home: 'kw6',
    plan: [
      { from: 6, tasks: [{ go: 'door:kw6' }, { do: 'Sweep', t: 12, prop: 'broom' }, { inside: 30 }, { go: 'kawabe.lessons' }, { do: 'Interact', t: 12 }] },
      { from: 9, tasks: [{ go: 'kawabe.lessons' }, { do: 'Talk', t: 40 }, { do: 'Wave', t: 4 }, { do: 'Talk', t: 30 }, { wander: 'kawabe.lessons', r: 3, t: 14 }] },
      { from: 12, tasks: [{ chat: 't2', at: 'kawabe.bench', t: 24 }, { go: 'kawabe.lessons' }, { do: 'Talk', t: 40 }] },
      { from: 15, tasks: [{ go: 'kawabe.playground' }, { do: 'Idle', t: 20 }, { do: 'Cheer', t: 4 }, { go: 'kawabe.boatyard' }, { do: 'Interact', t: 10 }, { go: 'door:kw6' }, { inside: 30 }] },
      { from: 18, tasks: [{ go: 'door:kw6' }, { inside: 0 }] },
      night('kw6'),
    ],
    story: [
      { when: { chapter: [1, 5], after: 'c1.lamp' }, lines: [
        ['v9', "Miss Endo. I teach on the lawn till the schoolroom roof is mended. Daichi came home, so that's three pupils. School's open!", 'Cheer'],
        ['mika', "You came back with the lamp too?"],
        ['v9', "I'd been teaching sums in the city to children who'd never seen a river. When I heard, I packed my chalk."] ] },
      { when: { chapter: [1, 5], after: 'c1.lamp' }, needs: { parcel_teacher: 1 }, give: { mon: 4, card_fujita: 1 }, ask: "Mr. Fujita has a parcel for me, I'm told. Chalk, I hope. I'm writing sums in the dirt with a stick.",
        lines: [
        ['v9', "Chalk! Copybooks! And, er, a book of poems. That one's for a pupil. A grown-up pupil. Me.", 'Cheer'],
        ['mika', "Your secret's safe."],
        ['v9', "Here, for your trouble, and a thank-you card for Mr. Fujita. Don't read it. It rhymes."] ] },
      { when: { chapter: [2, 5] }, ask: "Daifuku, my cat, is sulking on the boathouse roof. A fish would bring him down. He's a creature of simple appetites.",
        needs: { fish: 1 }, give: { mon: 6 }, lines: [
        ['v9', "Daifuku! Come down, you big dumpling. Look, Mika brought fish. ...And he's down. Traitor.", 'Cheer'],
        ['mika', "Simple appetites."],
        ['v9', "He's not my cat really. He belongs to the whole street and lets me think otherwise. Thank you, truly."] ] },
      { when: { chapter: [4, 5], after: 'c4.meeting' }, lines: [
        ['v9', "Today's lesson was 'a lamp is only useful if someone watches it'. Kenta asked if that's why he has to watch Yui."],
        ['mika', "Is it?"],
        ['v9', "I said yes. Education is mostly agreeing with whatever gets them to sit down."] ] },
    ],
    chatter: ["Seven times eight is fifty-six. Somebody remember that for me.", "The best classroom has a river beside it.",
      "Kenta, Yui and Daichi are three different weathers in one morning.", "Chalk in my hair again. It's a teacher's glitter."],
  },
  {
    id: 'v24', name: 'Mr. Ishida', role: 'Carpenter', village: 'kawabe', home: 'kw7',
    plan: [
      { from: 6, tasks: [{ go: 'kawabe.boatyard' }, { do: 'Hammer', t: 30 }, { go: 'door:kw7' }, { do: 'Carry', t: 8 }] },
      { from: 9, tasks: [{ go: 'kawabe.boatyard' }, { do: 'Hammer', t: 40 }, { do: 'Carry', t: 10 }, { go: 'kawabe.playground' }, { do: 'Hammer', t: 20 }, { go: 'door:kw7' }] },
      { from: 12, tasks: [{ go: 'door:kw7' }, { inside: 40 }, { go: 'kawabe.boatyard' }, { do: 'Sit', t: 20 }] },
      { from: 15, tasks: [{ go: 'kawabe.boatyard' }, { do: 'Hammer', t: 40 }, { go: 'kawabe.millLane' }, { do: 'Interact', t: 14 }, { go: 'door:kw7' }] },
      { from: 18, tasks: [{ chat: 'v25', at: 'kawabe.porch', t: 26 }, { go: 'door:kw7' }, { inside: 0 }] },
      night('kw7'),
    ],
    story: [
      { when: { chapter: [1, 5], after: 'c1.lamp' }, lines: [
        ['v24', "Ishida. Carpenter. I made furniture in the city for people who never sat on it. Then the Mill Lamp came on."],
        ['mika', "Everyone keeps saying that."],
        ['v24', "Because it's true. A lamp across a valley is a big thing when you've been waiting ten years for one."] ],
        grandma: { lines: [
          ['v24', "Ishida. Carpenter. I made furniture in the city for people who never sat on it. Then the Mill Lamp came on."],
          ['mika', "Everyone keeps saying that."],
          ['v24', "Because it's true. A lamp across a valley is a big thing. It looks like somebody's grandma left the porch light on."] ] } },
      { when: { chapter: [1, 5], after: 'c1.lamp' }, give: { toy_boat: 1 }, lines: [
        ['v24', "Offcuts, mostly. Cedar hull, a paper sail from Komori's. Floats better than my first real boat did."],
        ['mika', "Why not give it to him yourself?"],
        ['v24', "Then I'd have to watch him be happy. Very bad for a carpenter's reputation. Off you go."] ] },
      { when: { chapter: [4, 5], after: 'c4.meeting' }, lines: [
        ['v24', "Ōta's giving timber for the viaduct. Seasoned forty years in the mill loft. I've been planing it with tears in my eyes."],
        ['mika', "Sad tears?"],
        ['v24', "Sawdust. Partly sawdust. Mostly sawdust. Go on."] ] },
      { when: { chapter: [5, 5] }, lines: [
        ['v24', "I'm building a bench for the viaduct platform. One end Kawabe cedar, the other Takamori oak. Meets in the middle."],
        ['mika', "Very symbolic."],
        ['v24', "Very wobbly, so far. Symbolism takes a few goes."] ] },
    ],
    chatter: ["Measure twice, cut once, apologise to the wood.", "Every boat on this bank has a bit of me in it now.",
      "Good timber remembers the tree.", "My wife lights the lamps; I mend the posts they hang on. Teamwork."],
  },
  {
    id: 'v25', name: 'Mrs. Ishida', role: 'Lamplighter', village: 'kawabe', home: 'kw7',
    plan: [
      { from: 6, tasks: [{ go: 'kawabe.southLane' }, { do: 'Interact', t: 8, prop: 'hand-lantern' }, { go: 'kawabe.corner' }, { do: 'Interact', t: 8, prop: 'hand-lantern' }, { go: 'door:kw7' }, { inside: 30 }] },
      { from: 9, tasks: [{ go: 'kawabe.millLane' }, { do: 'Interact', t: 16 }, { go: 'kawabe.garden' }, { do: 'Interact', t: 20, prop: 'basket' }, { go: 'door:kw7' }, { inside: 30 }] },
      { from: 12, tasks: [{ go: 'door:kw7' }, { inside: 50 }, { go: 'kawabe.bench' }, { do: 'Sit', t: 20 }] },
      { from: 15, tasks: [{ go: 'kawabe.boatyard' }, { do: 'Interact', t: 14 }, { go: 'door:kw2' }, { do: 'Interact', t: 6 }, { go: 'door:kw7' }, { inside: 30 }] },
      { from: 18, tasks: [{ go: 'kawabe.southLane' }, { do: 'Interact', t: 6, prop: 'hand-lantern' }, { go: 'kawabe.playground' }, { do: 'Interact', t: 6, prop: 'hand-lantern' },
        { go: 'kawabe.well' }, { do: 'Interact', t: 6, prop: 'hand-lantern' }, { go: 'kawabe.corner' }, { do: 'Interact', t: 6, prop: 'hand-lantern' },
        { chat: 'v24', at: 'kawabe.porch', t: 26 }, { go: 'kawabe.dockHead' }, { do: 'Interact', t: 6, prop: 'hand-lantern' }] },
      night('kw7'),
    ],
    story: [
      { when: { chapter: [1, 5], after: 'c1.lamp' }, lines: [
        ['v25', "I light the street lanterns. Little lamps. Somebody has to, now the big one's lit again."],
        ['mika', "Is that a real job?"],
        ['v25', "It is now. I gave it to myself the night we came home. Eleven lanterns. I've named them all."] ],
        grandma: { lines: [
          ['v25', "I light the street lanterns. Paper ones, with a match. Your big lamp just… goes on. I watched it for an hour."],
          ['mika', "I could wire the lanterns too."],
          ['v25', "Don't you dare. Eleven lanterns, all named, and they like the match. But show me that switch again. Just once more."] ] } },
      { when: { chapter: [1, 5], after: 'c1.lamp' }, ask: "Fetch me letter paper from Mrs. Komori's? Three of my lanterns have holes and the moths are taking liberties.",
        needs: { paper: 1 }, give: { mon: 5 }, lines: [
        ['v25', "Good paper. Komori's best. A dab of rice paste and Ume, Kiri and Little Tora are mended."],
        ['mika', "Little Tora?"],
        ['v25', "The small one by the well. Burns the brightest. Like some people I've met. Thank you, Mika."] ] },
      { when: { chapter: [3, 5] }, lines: [
        ['v25', "Sora showed me how to trim a wick when I was your age. She said: a lamp you can't see is just a jar of hope."],
        ['mika', "That sounds like her."],
        ['v25', "I think about it every evening. Every lantern I light, I look up the valley afterwards. Just to check."] ] },
      { when: { chapter: [5, 5] }, lines: [
        ['v25', "Every night I light Little Tora, then I look up at the viaduct, and there's yours. Answering.", 'Wave'],
        ['mika', "I wave, you know. At the lamp."],
        ['v25', "I know. We can see you from here. The whole street waves back."] ] },
    ],
    chatter: ["Eleven lanterns. Ume's my favourite. Don't tell the others.", "A trimmed wick doesn't smoke. Neither should a lamplighter.",
      "Evening's the best part of the day. Everything gets a little glow.", "My husband makes the posts. I make them useful."],
  },
  {
    id: 'v3', name: 'Kenta', role: "Postman's son, ball captain", village: 'kawabe', home: 'kw1',
    plan: [
      { from: 6, tasks: [{ go: 'kawabe.well' }, { do: 'Carry', t: 8, prop: 'bucket' }, { go: 'door:kw1' }, { inside: 20 }, { play: 'tag', at: 'kawabe.playground', t: 30, with: ['v20', 'v10'] }] },
      { from: 9, tasks: [{ play: 'tag', at: 'kawabe.playground', t: 40, with: ['v20', 'v10'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v20', 'v10'] }, { chat: 'v20', at: 'kawabe.playground', t: 14 }, { play: 'hop', at: 'kawabe.playground', t: 30, with: ['v20'] }] },
      { from: 9, when: { folk: { v3: 2 } }, tasks: [{ play: 'ball', at: 'kawabe.playground', t: 40, with: ['v20', 'v10'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v20', 'v10'] }, { chat: 'v20', at: 'kawabe.playground', t: 14 }, { play: 'tag', at: 'kawabe.field', t: 30, with: ['v20', 'v10'] }] },
      { from: 9, when: { lamps: 1 }, tasks: [{ go: 'kawabe.lessons' }, { do: 'Sit', t: 50 }, { play: 'tag', at: 'kawabe.playground', t: 40, with: ['v20', 'v10'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v20', 'v10'] }, { chat: 'v20', at: 'kawabe.playground', t: 14 } ] },
      { from: 9, when: { lamps: 1, folk: { v3: 2 } }, tasks: [{ go: 'kawabe.lessons' }, { do: 'Sit', t: 50 }, { play: 'ball', at: 'kawabe.playground', t: 40, with: ['v20', 'v10'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v20', 'v10'] }, { chat: 'v20', at: 'kawabe.playground', t: 14 } ] },
      { from: 12, tasks: [{ go: 'door:kw1' }, { inside: 30 }, { play: 'hop', at: 'kawabe.playground', t: 30, with: ['v20'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v20'] }] },
      { from: 15, tasks: [{ play: 'tag', at: 'kawabe.playground', t: 40, with: ['v20', 'v10'] }, { play: 'keepup', at: 'kawabe.yard', t: 40, with: ['v20', 'v10'] }, { chat: 'v20', at: 'kawabe.playground', t: 14 }, { play: 'hop', at: 'kawabe.well', t: 30, with: ['v20'] }, { go: 'kawabe.dockHead', speed: 3.5 }, { do: 'Throw', t: 3 }] },
      { from: 15, when: { folk: { v3: 2 } }, tasks: [{ play: 'ball', at: 'kawabe.playground', t: 50, with: ['v20', 'v10'] }, { play: 'keepup', at: 'kawabe.yard', t: 40, with: ['v20', 'v10'] }, { chat: 'v20', at: 'kawabe.playground', t: 14 }, { play: 'tag', at: 'kawabe.field', t: 30, with: ['v20', 'v10'] }, { go: 'kawabe.dockHead', speed: 3.5 }, { do: 'Throw', t: 3 }] },
      { from: 18, tasks: [{ go: 'door:kw1' }, { inside: 0 }] },
      night('kw1'),
    ],
    story: [
      { when: { chapter: [0, 5] }, lines: [
        ['v3', "Are you the city girl? Can you kick? We need a fourth. Yui cheats and Daichi's always in the river.", 'Wave'],
        ['mika', "I can kick. Do you have a ball?"],
        ['v3', "...We had a ball. It's in the river now. With the fish. The fish have a ball and we don't."] ] },
      { when: { chapter: [1, 5] }, ask: "Could you get us a ball from Komori's? I've got two mon and a button. That's not enough. I checked.",
        needs: { ball: 1 }, give: { candy: 1, mon: 3 }, lines: [
        ['v3', "A BALL! A real one! It's even round!", 'Cheer'],
        ['mika', "They usually are."],
        ['v3', "Our old one was more of an egg. Here, two mon, the button's in there too, and Yui's candy. She'll understand. Later."] ] },
      { when: { chapter: [2, 5] }, lines: [
        ['v3', "Takamori kids say they've got a bigger ball. Bigger isn't better. Everyone knows that."],
        ['mika', "Do they?"],
        ['v3', "...Their ball is very big. One day we'll play them properly. And lose properly. With dignity."] ] },
      { when: { chapter: [5, 5] }, lines: [
        ['v3', "We played Takamori at the festival! On the viaduct! Nobody kicked the ball in the river this time.", 'Jump'],
        ['mika', "Who won?"],
        ['v3', "The river. Daichi kicked it in on purpose so the game would never end. Genius."] ] },
    ],
    chatter: ["I'm the captain. Yui says she is. She's wrong.", "If you stand there you're in goal.", "Dad says I run like the post: always late but always arriving.",
      "Want to see me kick it over the well? Watch. ...Watch again."],
  },
  {
    id: 'v20', name: 'Yui', role: "Farmer's daughter, hopscotch champion", village: 'kawabe', home: 'kw3',
    plan: [
      { from: 6, tasks: [{ go: 'kawabe.field' }, { do: 'Carry', t: 8, prop: 'basket' }, { go: 'door:kw3' }, { inside: 20 }, { play: 'tag', at: 'kawabe.playground', t: 30, with: ['v3', 'v10'] }] },
      { from: 9, tasks: [{ play: 'tag', at: 'kawabe.playground', t: 40, with: ['v3', 'v10'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v3', 'v10'] }, { chat: 'v3', at: 'kawabe.playground', t: 14 }, { play: 'hop', at: 'kawabe.playground', t: 30, with: ['v3'] }] },
      { from: 9, when: { folk: { v3: 2 } }, tasks: [{ play: 'ball', at: 'kawabe.playground', t: 40, with: ['v3', 'v10'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v3', 'v10'] }, { chat: 'v3', at: 'kawabe.playground', t: 14 }, { play: 'tag', at: 'kawabe.field', t: 30, with: ['v3', 'v10'] }] },
      { from: 9, when: { lamps: 1 }, tasks: [{ go: 'kawabe.lessons' }, { do: 'Sit', t: 50 }, { play: 'tag', at: 'kawabe.playground', t: 40, with: ['v3', 'v10'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v3', 'v10'] }, { chat: 'v3', at: 'kawabe.playground', t: 14 } ] },
      { from: 9, when: { lamps: 1, folk: { v3: 2 } }, tasks: [{ go: 'kawabe.lessons' }, { do: 'Sit', t: 50 }, { play: 'ball', at: 'kawabe.playground', t: 40, with: ['v3', 'v10'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v3', 'v10'] }, { chat: 'v3', at: 'kawabe.playground', t: 14 } ] },
      { from: 12, tasks: [{ go: 'door:kw3' }, { inside: 30 }, { play: 'hop', at: 'kawabe.playground', t: 30, with: ['v3'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v3'] }] },
      { from: 15, tasks: [{ play: 'tag', at: 'kawabe.playground', t: 40, with: ['v3', 'v10'] }, { play: 'keepup', at: 'kawabe.yard', t: 40, with: ['v3', 'v10'] }, { chat: 'v3', at: 'kawabe.playground', t: 14 }, { play: 'hop', at: 'kawabe.well', t: 30, with: ['v3'] }] },
      { from: 15, when: { folk: { v3: 2 } }, tasks: [{ play: 'ball', at: 'kawabe.playground', t: 50, with: ['v3', 'v10'] }, { play: 'keepup', at: 'kawabe.yard', t: 40, with: ['v3', 'v10'] }, { chat: 'v3', at: 'kawabe.playground', t: 14 }, { play: 'tag', at: 'kawabe.field', t: 30, with: ['v3', 'v10'] }] },
      { from: 18, tasks: [{ go: 'door:kw3' }, { inside: 0 }] },
      night('kw3'),
    ],
    story: [
      { when: { chapter: [0, 5] }, lines: [
        ['v20', "I'm Yui. I've never lost at hopscotch. Kenta says that's because I draw the squares. That's not cheating, that's art."],
        ['mika', "Sounds like cheating."],
        ['v20', "You sound like Kenta. Do you want to be on my side or wrong?"] ] },
      { when: { chapter: [1, 5] }, lines: [
        ['v20', "When I grow up I'm going to drive the Star Train. Like Genzo. With a moustache."],
        ['mika', "The moustache is optional."],
        ['v20', "Not on MY train. Dad says I should grow beans. I'll grow beans on the train. Problem solved."] ] },
      { when: { chapter: [3, 5] }, ask: "Bring me a pinwheel from Komori's? If it spins on the hop squares, the wind's on my side. Kenta can't argue with wind.",
        needs: { pinwheel: 1 }, give: { mon: 3 }, lines: [
        ['v20', "It's spinning! See? The wind says I win. It's official.", 'Cheer'],
        ['mika', "I'm not sure the wind's a referee."],
        ['v20', "It's the only one Kenta can't argue with. Here, three mon. That's my whole bean money."] ] },
      { when: { chapter: [5, 5] }, lines: [
        ['v20', "Genzo let me sit in Kobo's cab on Sunday! I pulled the whistle! Twice! He said once, but my hand slipped.", 'Jump'],
        ['mika', "Slipped twice?"],
        ['v20', "It's a very slippy whistle."] ] },
    ],
    chatter: ["One-two-HOP. Easy.", "Kenta's ball is always flat. Like his jokes.", "Daichi smells like river. All the time. Even at dinner.",
      "When I drive the train I'll stop at every house."],
  },
  {
    id: 'v10', name: 'Daichi', role: "Fisher's son, always in the river", village: 'kawabe', home: 'kw4',
    plan: [
      { from: 6, tasks: [{ go: 'kawabe.fishing' }, { do: 'Idle', t: 20 }, { play: 'tag', at: 'kawabe.playground', t: 30, with: ['v3', 'v20'] }] },
      { from: 9, tasks: [{ play: 'tag', at: 'kawabe.playground', t: 40, with: ['v3', 'v20'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v3', 'v20'] }, { play: 'hop', at: 'kawabe.playground', t: 30, with: ['v3'] }] },
      { from: 9, when: { folk: { v3: 2 } }, tasks: [{ play: 'ball', at: 'kawabe.playground', t: 40, with: ['v3', 'v20'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v3', 'v20'] }, { play: 'tag', at: 'kawabe.field', t: 30, with: ['v3', 'v20'] }] },
      { from: 9, when: { lamps: 1 }, tasks: [{ go: 'kawabe.lessons' }, { do: 'Sit', t: 50 }, { play: 'tag', at: 'kawabe.playground', t: 40, with: ['v3', 'v20'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v3', 'v20'] } ] },
      { from: 9, when: { lamps: 1, folk: { v3: 2 } }, tasks: [{ go: 'kawabe.lessons' }, { do: 'Sit', t: 50 }, { play: 'ball', at: 'kawabe.playground', t: 40, with: ['v3', 'v20'] }, { play: 'footnet', at: 'kawabe.yard', t: 45, with: ['v3', 'v20'] } ] },
      { from: 12, tasks: [{ go: 'door:kw4' }, { inside: 30 }, { go: 'kawabe.dockHead' }, { do: 'Sit', t: 20 }] },
      { from: 15, tasks: [{ play: 'tag', at: 'kawabe.playground', t: 40, with: ['v3', 'v20'] }, { play: 'keepup', at: 'kawabe.yard', t: 40, with: ['v3', 'v20'] }, { play: 'hop', at: 'kawabe.well', t: 30, with: ['v3'] }, { go: 'kawabe.fishing', speed: 3.5 }, { do: 'Idle', t: 14, prop: 'fishing-rod' }] },
      { from: 15, when: { folk: { v3: 2 } }, tasks: [{ play: 'ball', at: 'kawabe.playground', t: 50, with: ['v3', 'v20'] }, { play: 'keepup', at: 'kawabe.yard', t: 40, with: ['v3', 'v20'] }, { play: 'tag', at: 'kawabe.field', t: 30, with: ['v3', 'v20'] }, { go: 'kawabe.fishing', speed: 3.5 }, { do: 'Idle', t: 14, prop: 'fishing-rod' }] },
      { from: 18, tasks: [{ go: 'door:kw4' }, { inside: 0 }] },
      night('kw4'),
    ],
    story: [
      { when: { chapter: [1, 5], after: 'c1.lamp' }, lines: [
        ['v10', "I'm Daichi. I lived in the city. The city river is in a box. A concrete box. Fish hate it.", 'Wave'],
        ['mika', "This one's better?"],
        ['v10', "This one has a crab with a cog! Well, had. Rin says you took it. Was he upset? Did he pinch?"] ] },
      { when: { chapter: [1, 5] }, needs: { toy_boat: 1 }, give: { mon: 3 }, ask: "Mr. Ishida's making something in the boatyard. A boat, I think. A tiny one. Not that I've been watching.",
        lines: [
        ['v10', "It's the boat! The one I wasn't watching him make! It's got a sail! It floats! I haven't tried yet but it floats!", 'Jump'],
        ['mika', "He said he never noticed you."],
        ['v10', "He winked at me every single day. Grown-ups are bad at secrets. Here, I found these three mon in the river."] ] },
      { when: { chapter: [3, 5] }, lines: [
        ['v10', "Dad says the river was angry the night of the flood. Mum says rivers don't get angry, they get full."],
        ['mika', "I think your mum's right."],
        ['v10', "Me too. I like this river. It's just very big sometimes. That's allowed."] ],
        grandma: { lines: [
          ['v10', "Your grandma says she fell in this river in 1968. On purpose. To catch a hat. Did she get the hat?"],
          ['mika', "She says yes. Genzo says no."],
          ['v10', "I'm on her side. I'd jump in for a hat. It's just very big sometimes, this river. That's allowed."] ] } },
      { when: { chapter: [5, 5] }, lines: [
        ['v10', "My boat went all the way from the dock to the sandbar! The crab rode it! Nobody believes me.", 'Cheer'],
        ['mika', "I believe you."],
        ['v10', "You've met the crab. You know what he's like."] ] },
    ],
    chatter: ["I can hold my breath for thirty seconds. Twenty. Fifteen, properly.", "Dad says the river smells the same. I think it smells better.",
      "My boat's called Little Ishida. Don't tell him.", "Wanna see a frog? He's in my pocket. He was."],
  },
  // ============================================================== TAKAMORI
  {
    id: 'v4', name: 'Aiko', role: 'Market stall: flowers & pickles', village: 'takamori', home: 'tk2', shop: 'stall',
    plan: [
      { from: 6, tasks: [{ go: 'takamori.orchardLane' }, { do: 'Interact', t: 20, prop: 'basket' }, { go: 'takamori.stall' }, { do: 'Carry', t: 8, prop: 'basket' }, { do: 'Interact', t: 14 }] },
      { from: 9, tasks: [{ sell: 'stall', t: 150 }, { chat: 'v5', at: 'takamori.stall', t: 22 }, { sell: 'stall', t: 60 }, { chat: 'v22', at: 'takamori.stall', t: 20 }] },
      { from: 12, tasks: [{ sell: 'stall', t: 120 }, { go: 'takamori.well' }, { do: 'Carry', t: 6, prop: 'bucket' }, { go: 'takamori.stall' }, { do: 'Interact', t: 10, prop: 'bucket' }] },
      { from: 15, tasks: [{ sell: 'stall', t: 150 }, { chat: 'v5', at: 'takamori.stall', t: 22 }] },
      { from: 18, tasks: [{ go: 'takamori.stall' }, { do: 'Carry', t: 10, prop: 'basket' }, { go: 'door:tk2' }, { inside: 0 }] },
      night('tk2'),
    ],
    story: [
      { when: { chapter: [2, 5] }, lines: [
        ['v4', "Flowers for the table, pickles for the soul! Aiko's stall. You're the one who's been crossing on Rin's ferry.", 'Wave'],
        ['mika', "Word travels fast up here."],
        ['v4', "Word travels on Sato's bicycle, and Sato talks to everyone. Well. Everyone but me. He just goes pink."] ] },
      { when: { chapter: [2, 5] }, lines: [
        ['v4', "Old Isamu from Kawabe used to buy wildflowers here every week. Yellow and blue. Then the ferry went quiet."],
        ['mika', "His wife still talks to his photograph about them."],
        ['v4', "Tsuru? Oh. Tell her the yellow ones are back in. I'll always keep a bunch for Kawabe."] ],
        grandma: { lines: [
          ['v4', "Old Isamu from Kawabe buys wildflowers here every week. Yellow and blue. He's off at the coast yard this year."],
          ['mika', "His wife tells his photograph the news every morning."],
          ['v4', "Tsuru! Tell her the yellow ones are in. I keep a bunch for Kawabe, and one for the day he's back."] ] } },
      { when: { chapter: [4, 5], after: 'c4.meeting' }, needs: { letter_aiko: 1 }, give: { letter_sato: 1 }, ask: "Sato's been hovering by my stall with something in his satchel for a week. You wouldn't know what, would you?",
        lines: [
        ['v4', "A letter. From Sato. Pale blue paper. Four pages! He spelled 'chrysanthemum' right. Nobody spells that right.", 'Cheer'],
        ['mika', "Is that the important part?"],
        ['v4', "...No. Give him this, would you? It's one line. I'm braver than him, but not by much."] ] },
      { when: { chapter: [5, 5] }, lines: [
        ['v4', "Sato and I are walking out on Sundays. To the viaduct. On the train. He still goes pink.", 'Wave'],
        ['mika', "Is that a good sign?"],
        ['v4', "It's a lovely sign. I've got a whole stall of things that go pink in the sun. Peaches. Radishes. Postmen."] ] },
    ],
    chatter: ["Fresh flowers, crunchy pickles, both in a jar if you like.", "The yellow ones are for remembering. The blue ones are just pretty.",
      "Hana gives away more buns than she sells. I sell more pickles than I give.", "Mind the step, the stall leans when it's happy."],
  },
  {
    id: 'v5', name: 'Mr. Sato', role: 'Takamori postman', village: 'takamori', home: 'tk1',
    plan: [
      { from: 6, tasks: [{ go: 'door:tk1' }, { do: 'Interact', t: 6, prop: 'letters' }, { deliver: ['tk3', 'tk4', 'tk5'] }, { go: 'takamori.bench' }, { do: 'Sit', t: 14 }] },
      { from: 9, tasks: [{ deliver: ['bakery', 'tk2', 'tk6'] }, { chat: 'v4', at: 'takamori.stall', t: 22 }, { deliver: ['tk3', 'tk5'] }, { go: 'takamori.lookout' }, { do: 'Interact', t: 8, prop: 'letters' }] },
      { from: 12, tasks: [{ go: 'takamori.bench' }, { do: 'Sit', t: 30 }, { do: 'Interact', t: 10, prop: 'letters' }] },
      { from: 15, tasks: [{ deliver: ['tk4', 'tk6', 'bakery'] }, { chat: 'v4', at: 'takamori.stall', t: 22 }, { go: 'takamori.bench' }, { do: 'Sit', t: 16 }] },
      { from: 18, tasks: [{ go: 'door:tk1' }, { inside: 0 }] },
      night('tk1'),
    ],
    story: [
      { when: { chapter: [2, 5] }, lines: [
        ['v5', "Sato. Takamori post. Six doors, a bakery and a bell tower nobody writes to. Sorry, did you need something?"],
        ['mika', "You look like you've lost something."],
        ['v5', "Only my nerve. I keep it in the bottom of my satchel. Under the letters. I never seem to get down to it."] ] },
      { when: { chapter: [2, 5] }, needs: { mailbag: 1 }, give: { mon: 4, note_hirano: 1 }, lines: [
        ['v5', "Hirano's bag! He trusted you with it? He doesn't let RIN hold it, and she drives the boat."],
        ['mika', "He said somebody has to talk to both sides."],
        ['v5', "...Take him this note, would you? It says thank you. I wrote it years ago. Here, ferry money."] ],
        grandma: { lines: [
          ['v5', "Hirano's bag! He trusted you with it? He doesn't let RIN hold it, and she drives the boat."],
          ['mika', "He says you've swapped bags for twenty years and never met."],
          ['v5', "...Take him this note, would you? It says thank you. I wrote it years ago. Here, ferry money."] ] },
        ask: "Hirano sends Kawabe's post across with Rin. If he ever sends it with a person instead, I'd like to know." },
      { when: { chapter: [4, 5], after: 'c4.meeting' }, give: { letter_aiko: 1 },
        lines: [
        ['v5', "If Genzo can stand on a platform and say the hardest thing in the world, I can post one letter. Four pages."],
        ['mika', "Why not hand it to her yourself?"],
        ['v5', "I'm a postman. I deliver everyone's words but mine. Please, Mika. Before I go pink again."] ],
        grandma: { lines: [
          ['v5', "If Genzo can stand on a platform and say 'please' in front of both villages, I can post one letter. Four pages."],
          ['mika', "Why not hand it to her yourself?"],
          ['v5', "I'm a postman. I deliver everyone's words but mine. Please, Mika. Before I go pink again."] ] } },
      { when: { chapter: [4, 5] }, needs: { letter_sato: 1 }, give: { mon: 10 }, ask: "Did she… say anything? You can tell me. I'm sitting down. Well, I'll sit down.",
        lines: [
        ['v5', "One line. 'Sunday. The viaduct. Bring buns.' She wants to see me! On a Sunday!", 'Cheer'],
        ['mika', "You're very pink."],
        ['v5', "I'm a postman who just got post. Here, take all of this, it's a special delivery fee. I insist."] ] },
    ],
    chatter: ["Six doors and a bakery. Hana always gives me a bun for the road.", "Rain makes the ink run. I write the addresses twice.",
      "The bell tower gets one letter a year. From the bell foundry. Asking how it is.", "Uphill both ways. It's Takamori, it really is."],
  },
  {
    id: 'v22', name: 'Mr. Oda', role: 'Shepherd at the pasture', village: 'takamori', home: 'tk6',
    plan: [
      { from: 6, tasks: [{ go: 'takamori.pastureFence' }, { do: 'Hammer', t: 24 }, { go: 'takamori.pasture' }, { wander: 'takamori.pasture', r: 4, t: 30 }] },
      { from: 9, tasks: [{ go: 'takamori.pasture' }, { wander: 'takamori.pasture', r: 5, t: 40 }, { go: 'takamori.pastureFence' }, { do: 'Interact', t: 16 }, { chat: 'v4', at: 'takamori.stall', t: 20 }, { chat: 'v27', at: 'takamori.bench', t: 24 }] },
      { from: 12, tasks: [{ go: 'takamori.pastureFence' }, { do: 'Sit', t: 40 }, { go: 'door:bakery' }, { do: 'Interact', t: 6 }] },
      { from: 15, tasks: [{ go: 'takamori.pasture' }, { wander: 'takamori.pasture', r: 5, t: 40 }, { chat: 'v27', at: 'takamori.bench', t: 24 }, { go: 'takamori.pastureFence' }, { do: 'Hammer', t: 16 }] },
      { from: 18, tasks: [{ go: 'takamori.pastureFence' }, { do: 'Wave', t: 4 }, { go: 'door:tk6' }, { inside: 0 }] },
      night('tk6'),
    ],
    story: [
      { when: { chapter: [2, 5] }, lines: [
        ['v22', "Oda. I mind Hana's sheep. Well, the sheep mind themselves. I stand nearby and take responsibility."],
        ['mika', "Five of them ran off, I heard."],
        ['v22', "Took a holiday. We don't say 'ran away' in front of them. They're sensitive."] ] },
      { when: { chapter: [2, 5] }, ask: "Bring me a rice ball for lunch? Hana's buns are lovely, but a man can't live on buns. I've tried. Ten years.",
        needs: { onigiri: 1 }, give: { mon: 5 }, lines: [
        ['v22', "A rice ball! From Fujita's, by the wrapper? Kawabe rice! I haven't had Kawabe rice since..."],
        ['mika', "Since the flood?"],
        ['v22', "Since I was too proud to cross the river for it. Tastes like being young. Here. And don't tell Hana."] ],
        grandma: { lines: [
          ['v22', "A rice ball! From Fujita's, by the wrapper? Kawabe rice! I haven't had Kawabe rice since..."],
          ['mika', "Since last week?"],
          ['v22', "Since your grandma's picnic, years back. Tastes like being young. Here. And don't tell Hana."] ] } },
      { when: { chapter: [4, 5], after: 'c4.meeting' }, lines: [
        ['v22', "Hana's giving the smithy's iron to mend the viaduct. She cried when she said it. Then she gave me a bun."],
        ['mika', "That's very Hana."],
        ['v22', "That's very Takamori. We feel things and then we feed people."] ],
        grandma: { lines: [
          ['v22', "Hana's giving the smithy's iron for the viaduct. She argued with Ōta about it for an hour. Then she gave me a bun."],
          ['mika', "That's very Hana."],
          ['v22', "That's very Takamori. We argue, and then we feed people."] ] } },
      { when: { chapter: [5, 5] }, lines: [
        ['v22', "Sheep went on the Sunday train. All of them. Genzo says never again. The sheep say it was their best day."],
        ['mika', "You asked the sheep?"],
        ['v22', "I didn't have to. Look at their faces."] ] },
    ],
    chatter: ["Count them? I tried. They move.", "A good fence is half the job. The other half is apologising to the fence.",
      "The black-faced one is called Boss. He isn't, but don't tell him.", "Up here you can see weather coming an hour away."],
  },
  {
    id: 'v27', name: 'Mr. Tanabe', role: 'Bell-ringer', village: 'takamori', home: 'tk3',
    plan: [
      { from: 6, tasks: [{ go: 'takamori.bellSteps' }, { do: 'Interact', t: 20 }, { go: 'takamori.towerYard' }, { do: 'Sweep', t: 20, prop: 'broom' }] },
      { from: 9, tasks: [{ go: 'takamori.towerYard' }, { do: 'Hammer', t: 20 }, { go: 'takamori.bellSteps' }, { do: 'Sit', t: 30 }, { chat: 'v22', at: 'takamori.bench', t: 24 }] },
      { from: 12, tasks: [{ go: 'takamori.bellSteps' }, { do: 'Interact', t: 20 }, { go: 'door:tk3' }, { inside: 40 }] },
      { from: 15, tasks: [{ go: 'takamori.towerYard' }, { do: 'Sweep', t: 20, prop: 'broom' }, { chat: 'v22', at: 'takamori.bench', t: 24 }, { go: 'takamori.playground' }, { do: 'Wave', t: 4 }] },
      { from: 18, tasks: [{ go: 'takamori.bellSteps' }, { do: 'Interact', t: 20 }, { go: 'door:tk3' }, { inside: 0 }] },
      night('tk3'),
    ],
    story: [
      { when: { chapter: [2, 5], after: 'c2.lamp' }, lines: [
        ['v27', "Tanabe. My father rang that bell, and his before him. We left after the flood. I couldn't bear a silent tower."],
        ['mika', "And now?"],
        ['v27', "Now the Orchard Lamp's burning on top of it. I saw it from the valley road and turned the cart round. Sumi cheered for an hour."] ],
        grandma: { lines: [
          ['v27', "Tanabe. My father rang that bell, and his before him. We went to the city for work. I did miss my tower."],
          ['mika', "And now?"],
          ['v27', "Now there's a light on top of it with no flame in it. I saw it from the valley road and turned the cart round. Sumi cheered for an hour."] ] } },
      { when: { chapter: [2, 5], after: 'c2.lamp' }, lines: [
        ['v27', "You rang it, didn't you? The day we came back. Not bad. A bit eager on the third stroke."],
        ['mika', "It was my first bell."],
        ['v27', "Everyone's eager on their first bell. My first, I rang it nineteen times. The whole village came out in their nightclothes."] ] },
      { when: { chapter: [3, 5] }, ask: "Bring me a tin of tea? Ringing the hours is thirsty work, and Hana only does buns.",
        needs: { tea: 1 }, give: { mon: 6 }, lines: [
        ['v27', "Roasted. Kawabe tea, from Fujita's. My father swore by it and never admitted it."],
        ['mika', "That seems to be the valley's hobby."],
        ['v27', "Ha! Liking the other side in secret? Oldest tradition we've got. Here."] ] },
      { when: { chapter: [5, 5] }, lines: [
        ['v27', "On Sundays I ring the bell when Kobo crosses the viaduct. Kawabe rings a pot lid back. It's not music. It's better."],
        ['mika', "It's a conversation."],
        ['v27', "That's it exactly. Ten years of silence, and now we can't stop talking."] ],
        grandma: { lines: [
          ['v27', "On Sundays I ring the bell when Kobo crosses the viaduct. Kawabe rings a pot lid back. It's not music. It's better."],
          ['mika', "It's a conversation."],
          ['v27', "That's it exactly. Your grandma bangs the loudest pot. I'd know that pot anywhere."] ] } },
    ],
    chatter: ["Six bells for morning, twelve for noon. Don't make me count the evening.", "A bell is a lamp you can hear.",
      "Sumi wants to ring it. She'll have to grow a bit. And stop jumping on the rope.", "The tower sways in a high wind. So do I."],
  },
  {
    id: 'v13', name: 'Sumi', role: "Bell-ringer's daughter", village: 'takamori', home: 'tk3',
    plan: [
      { from: 6, tasks: [{ go: 'takamori.towerYard' }, { do: 'Jump', t: 10 }, { play: 'tag', at: 'takamori.playground', t: 30, with: ['v6', 'v23'] }] },
      { from: 9, tasks: [{ play: 'hop', at: 'takamori.playground', t: 40, with: ['v23'] }, { play: 'ball', at: 'takamori.green', t: 40, with: ['v6', 'v23'] }, { go: 'takamori.bellSteps', speed: 3.5 }, { do: 'Sit', t: 14 }] },
      { from: 12, tasks: [{ go: 'door:tk3' }, { inside: 30 }, { play: 'tag', at: 'takamori.playground', t: 30, with: ['v6', 'v23'] }] },
      { from: 15, tasks: [{ play: 'ball', at: 'takamori.green', t: 50, with: ['v6', 'v23'] }, { play: 'hop', at: 'takamori.playground', t: 30, with: ['v23'] }] },
      { from: 18, tasks: [{ go: 'door:tk3' }, { inside: 0 }] },
      night('tk3'),
    ],
    story: [
      { when: { chapter: [2, 5], after: 'c2.lamp' }, lines: [
        ['v13', "I'm Sumi! We came home because the lamp's on top of Dad's tower! I was born here but I don't remember it.", 'Jump'],
        ['mika', "What do you think so far?"],
        ['v13', "It's got sheep! And a bakery! And Hiro, who's annoying, and Nao, who's my best friend since Tuesday."] ] },
      { when: { chapter: [2, 5] }, ask: "Can you get me a pinwheel? I want to stick it on the tower rail so the bell knows which way the wind is.",
        needs: { pinwheel: 1 }, give: { mon: 3 }, lines: [
        ['v13', "Red and gold! It's perfect! The bell's going to be so pleased.", 'Cheer'],
        ['mika', "Do bells get pleased?"],
        ['v13', "Dad says it rings sweeter on sunny days. That's pleased. Here's my money. All of it. It's three."] ] },
      { when: { chapter: [5, 5] }, lines: [
        ['v13', "I rode the Star Train! Dad let me ring the bell for it. Only once. I rang it once. Mostly once.", 'Jump'],
        ['mika', "Like father, like daughter."],
        ['v13', "He says I'm eager on the third stroke. I said everyone is."] ] },
    ],
    chatter: ["The bell's called Big Hiro. Not after Hiro. Hiro wishes.", "I'm fast. Faster than Nao. Not faster than sheep.",
      "Dad says the tower can see Kawabe. I can see Kawabe too, from the steps.", "Hop, hop, skip, turn. That's the rule."],
  },
  {
    id: 'v6', name: 'Hiro', role: "Takamori's self-appointed team captain", village: 'takamori', home: 'tk4',
    plan: [
      { from: 6, tasks: [{ go: 'takamori.well' }, { do: 'Carry', t: 8, prop: 'bucket' }, { go: 'door:tk4' }, { inside: 20 }, { play: 'tag', at: 'takamori.playground', t: 30, with: ['v23', 'v13'] }] },
      { from: 9, tasks: [{ play: 'ball', at: 'takamori.green', t: 40, with: ['v23', 'v13'] }, { chat: 'v23', at: 'takamori.playground', t: 14 }, { go: 'takamori.bakeryFront', speed: 3.5 }, { do: 'Idle', t: 10 }] },
      { from: 12, tasks: [{ go: 'door:tk4' }, { inside: 30 }, { play: 'tag', at: 'takamori.playground', t: 30, with: ['v23', 'v13'] }] },
      { from: 15, tasks: [{ play: 'ball', at: 'takamori.green', t: 50, with: ['v23', 'v13'] }, { chat: 'v23', at: 'takamori.playground', t: 14 }, { go: 'takamori.lane', speed: 3.5 }, { do: 'Kick', t: 3 }] },
      { from: 18, tasks: [{ go: 'door:tk4' }, { inside: 0 }] },
      night('tk4'),
    ],
    story: [
      { when: { chapter: [2, 5] }, lines: [
        ['v6', "Halt! Who goes there! Oh, the ferry girl. I'm Hiro, captain of everything in Takamori under twelve.", 'Wave'],
        ['mika', "Everything?"],
        ['v6', "Ball, tag, and the sheep-counting club. Nao says she's captain of tag. She's vice-captain. I decided."] ] },
      { when: { chapter: [2, 5] }, lines: [
        ['v6', "Is it true Kawabe kids eat fish for breakfast? And lunch? And swim with their clothes ON?"],
        ['mika', "Sometimes. They say you have a giant ball."],
        ['v6', "...It's normal-sized. We said giant to scare them. Don't tell them. Actually, do. It's working."] ] },
      { when: { chapter: [3, 5] }, ask: "Bring us a bag of red-bean candy? It's for team spirit. Team spirit costs candy. Everyone knows.",
        needs: { candy: 1 }, give: { mon: 4 }, lines: [
        ['v6', "Team spirit! One for me, one for Nao, one for Sumi, and the rest for the captain's emergency fund.", 'Cheer'],
        ['mika', "That's most of the bag."],
        ['v6', "Captaincy is a heavy burden. Here, four mon. That's the team's whole treasury."] ] },
      { when: { chapter: [5, 5] }, lines: [
        ['v6', "We played Kawabe on the viaduct. Kenta's actually good. I told him he's vice-captain of both villages.", 'Cheer'],
        ['mika', "Did he accept?"],
        ['v6', "He said he's captain. We're having a meeting about it. On Sunday. On the train."] ] },
    ],
    chatter: ["Captain's orders: nobody kicks it in the sheep.", "I'm not short, the plateau's high.",
      "Hana gives a bun to whoever wins. I win a lot. For the team.", "Kawabe kids are probably fine. Probably."],
  },
  {
    id: 'v23', name: 'Nao', role: 'Quiet one, never misses', village: 'takamori', home: 'tk5',
    plan: [
      { from: 6, tasks: [{ go: 'takamori.lane' }, { do: 'Interact', t: 10 }, { play: 'tag', at: 'takamori.playground', t: 30, with: ['v6', 'v13'] }] },
      { from: 9, tasks: [{ play: 'ball', at: 'takamori.green', t: 40, with: ['v6', 'v13'] }, { chat: 'v6', at: 'takamori.playground', t: 14 }, { play: 'hop', at: 'takamori.playground', t: 40, with: ['v13'] }] },
      { from: 12, tasks: [{ go: 'door:tk5' }, { inside: 30 }, { go: 'takamori.bellSteps' }, { do: 'Sit', t: 20 }] },
      { from: 15, tasks: [{ play: 'ball', at: 'takamori.green', t: 50, with: ['v6', 'v13'] }, { chat: 'v6', at: 'takamori.playground', t: 14 }, { play: 'hop', at: 'takamori.playground', t: 30, with: ['v13'] }] },
      { from: 18, tasks: [{ go: 'door:tk5' }, { inside: 0 }] },
      night('tk5'),
    ],
    story: [
      { when: { chapter: [2, 5] }, lines: [
        ['v23', "...Hi. I'm Nao. Hiro does the talking. I do the scoring."],
        ['mika', "Scoring goals or scoring points?"],
        ['v23', "Both. And I keep the book of who owes who a bun. Hiro owes everyone."] ] },
      { when: { chapter: [2, 5] }, ask: "Could you get me some letter paper? I want to write to the Kawabe kids. Hiro mustn't know. It's diplomacy.",
        needs: { paper: 1 }, give: { mon: 4 }, lines: [
        ['v23', "Blue paper. Good. I'll draw the rules on it, so they can practise. It's only fair if they know them."],
        ['mika', "Hiro said you'd beat them."],
        ['v23', "We will. Fairly. That's the best way to beat someone. Then they stay friends."] ] },
      { when: { chapter: [4, 5], after: 'c4.meeting' }, lines: [
        ['v23', "Kenta wrote back. Through Sato and Hirano. He says they've been practising and they're ready."],
        ['mika', "Diplomacy works."],
        ['v23', "Diplomacy and a stamp. Mr. Sato let me lick it."] ] },
    ],
    chatter: ["Score: us 4, wind 2.", "Hiro owes me three buns.", "I like the bell steps. You can see everything and nobody sees you.",
      "Sumi runs fast. I aim better."],
  },
];

// dialogue UI cast entries for the townsfolk (merged with story.js CAST)
export const FOLK_CAST = {
  t1: { name: 'Mr. Fujita', color: '#b5652a', pitch: 0.85 },
  t2: { name: 'Mrs. Komori', color: '#d0587e', pitch: 1.12 },
  v1: { name: 'Mr. Hirano', color: '#3f6fb0', pitch: 0.9 },
  v2: { name: 'Mrs. Nakano', color: '#3a9a8a', pitch: 1.08 },
  v8: { name: 'Mr. Nakano', color: '#2f7a90', pitch: 0.78 },
  v18: { name: 'Granny Tsuru', color: '#9a7ab0', pitch: 1.0 },
  v19: { name: 'Mr. Kubo', color: '#7a8a2f', pitch: 0.82 },
  v9: { name: 'Miss Endo', color: '#c27a3a', pitch: 1.15 },
  v24: { name: 'Mr. Ishida', color: '#8a6a4a', pitch: 0.8 },
  v25: { name: 'Mrs. Ishida', color: '#d9a020', pitch: 1.06 },
  v3: { name: 'Kenta', color: '#e0503a', pitch: 1.4 },
  v20: { name: 'Yui', color: '#e07ab0', pitch: 1.5 },
  v10: { name: 'Daichi', color: '#2a9ad0', pitch: 1.42 },
  v4: { name: 'Aiko', color: '#e08a2a', pitch: 1.14 },
  v5: { name: 'Mr. Sato', color: '#5a7ad8', pitch: 0.95 },
  v22: { name: 'Mr. Oda', color: '#6a7a5a', pitch: 0.76 },
  v27: { name: 'Mr. Tanabe', color: '#4a5a7a', pitch: 0.84 },
  v13: { name: 'Sumi', color: '#f06a6a', pitch: 1.52 },
  v6: { name: 'Hiro', color: '#2aa070', pitch: 1.38 },
  v23: { name: 'Nao', color: '#8a6ad8', pitch: 1.46 },
};
