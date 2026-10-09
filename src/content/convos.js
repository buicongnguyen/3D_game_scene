// Town Life: conversations Mika can overhear when two townsfolk meet (a `chat` task in both their plans).
// Lines are [speaker, text] with speaker 'a' or 'b'; at most 58 characters each (speech bubbles).
// Specific pairs tell running mini-stories in order (`after` = that convo must have been overheard first).
// Generic ones use 'man' | 'woman' | 'kid' | 'any' and fit any two people chatting.
// `when` keys as in barks: chapter [from, to], season, night, place, lamps (at least n lit).

export const CONVOS = [
  // ---- Fujita (grocer) and Hirano (postman), mornings at the street corner
  { id: 'fujita-hirano-1', a: 't1', b: 'v1', when: { chapter: [0, 5] }, lines: [
    ['a', 'Morning, Hirano. Any post for me?'], ['b', 'A bill, a seed catalogue, and a bill.'], ['a', 'Keep the bills. I\'ll take the catalogue.'] ] },
  { id: 'fujita-hirano-2', a: 't1', b: 'v1', after: 'fujita-hirano-1', story: 'classic', when: { chapter: [0, 5] }, lines: [
    ['b', 'Sora\'s girl bought a rice ball from you yet?'], ['a', 'Haggled me down a mon. Proud of her.'], ['b', 'Sora haggled too. Family trait.'] ] },
  { id: 'fujita-hirano-2-g', a: 't1', b: 'v1', after: 'fujita-hirano-1', story: 'grandma', when: { chapter: [0, 5] }, lines: [
    ['b', 'Sora\'s girl bought a rice ball from you yet?'], ['a', 'Haggled me down a mon. Proud of her.'], ['b', 'Sora haggles too. Family trait.'] ] },
  { id: 'fujita-hirano-3', a: 't1', b: 'v1', after: 'fujita-hirano-2', story: 'classic', when: { chapter: [1, 5], lamps: 1 }, lines: [
    ['b', 'Eleven doors on my round again. Full houses!'], ['a', 'Full houses, empty shelves. I\'ve sold out of tea.'],
    ['b', 'Best problem a grocer ever had.'] ] },
  { id: 'fujita-hirano-3-g', a: 't1', b: 'v1', after: 'fujita-hirano-2-g', story: 'grandma', when: { chapter: [1, 5], lamps: 1 }, lines: [
    ['b', 'Eleven doors on my round again. Full houses!'], ['a', 'Full houses, empty shelves. I\'ve sold out of tea.'],
    ['b', 'Best problem a grocer ever had.'] ] },
  { id: 'fujita-hirano-4', a: 't1', b: 'v1', after: 'fujita-hirano-3', story: 'classic', when: { chapter: [5, 5] }, lines: [
    ['a', 'I\'m ordering buns from Hana. Takamori buns!'], ['b', 'Does Ōta know?'], ['a', 'Ōta will find out when he\'s eating one.'] ] },
  { id: 'fujita-hirano-4-g', a: 't1', b: 'v1', after: 'fujita-hirano-3-g', story: 'grandma', when: { chapter: [5, 5] }, lines: [
    ['a', 'I\'m ordering buns from Hana. Takamori buns!'], ['b', 'Does Ōta know?'], ['a', 'Ōta will find out when he\'s eating one.'] ] },

  // ---- Mrs. Nakano and Granny Tsuru, washing day at the river
  { id: 'nakano-tsuru-1', a: 'v2', b: 'v18', when: { chapter: [0, 5] }, lines: [
    ['b', 'You\'ll scrub a hole in that sheet, Emi.'], ['a', 'It came with the hole. I\'m just making it tidier.'] ] },
  { id: 'nakano-tsuru-2', a: 'v2', b: 'v18', after: 'nakano-tsuru-1', story: 'classic', when: { chapter: [0, 5] }, lines: [
    ['b', "Sora's girl walked past. Waved at me."], ['a', 'She waves like Sora. Whole arm.'], ['b', 'Whole heart, Sora used to say.'] ] },
  { id: 'nakano-tsuru-2-g', a: 'v2', b: 'v18', after: 'nakano-tsuru-1', story: 'grandma', when: { chapter: [0, 5] }, lines: [
    ['b', 'Sora\'s girl walked past. Waved at me.'], ['a', 'She waves like Sora. Whole arm.'], ['b', 'Whole heart, Sora always says.'] ] },
  { id: 'nakano-tsuru-3', a: 'v2', b: 'v18', after: 'nakano-tsuru-1', when: { chapter: [1, 5], lamps: 1 }, lines: [
    ['a', 'Goro snores again. I missed it, Tsuru.'], ['b', 'Give it a month. You\'ll miss the quiet.'], ['a', 'Ha! Probably.'] ] },
  { id: 'nakano-tsuru-4', a: 'v2', b: 'v18', after: 'nakano-tsuru-3', when: { chapter: [3, 3] }, lines: [
    ['b', 'Leaves in the washing water already.'], ['a', 'Autumn rinse. Free with every sheet.'], ['b', 'Isamu loved autumn. Said the river wore red.'] ] },
  { id: 'nakano-tsuru-5', a: 'v2', b: 'v18', when: { chapter: [4, 4] }, lines: [
    ['a', 'Ice at the edges this morning.'], ['b', 'Then wash quick and gossip slow, dear.'] ] },

  // ---- Hirano and Granny Tsuru on her porch
  { id: 'hirano-tsuru-1', a: 'v1', b: 'v18', when: { chapter: [0, 5] }, lines: [
    ['a', 'Letter for you, Mrs. Tsuru. In crayon again.'], ['b', 'From my great-grandson. He draws me as a cat.'],
    ['a', 'It\'s a good likeness.'], ['b', 'Cheeky man. Come in for tea.'] ] },
  { id: 'hirano-tsuru-2', a: 'v1', b: 'v18', after: 'hirano-tsuru-1', when: { chapter: [0, 5] }, lines: [
    ['b', 'You used to carry Sora\'s letters to the city.'], ['a', 'Every week. Blue envelopes.'], ['b', 'And now her girl is here. Funny old river.'] ] },
  { id: 'hirano-tsuru-3', a: 'v1', b: 'v18', after: 'hirano-tsuru-2', when: { chapter: [2, 5], folk: { v1: 2 } }, lines: [
    ['a', 'I sent the Takamori post with Mika today.'], ['b', 'Not with Rin? Hirano, that\'s practically a visit.'],
    ['a', 'Don\'t make it a big thing.'], ['b', 'It\'s a very big thing.'] ] },

  // ---- the fisher and the farmer on the river lane
  { id: 'nakano-kubo-1', a: 'v8', b: 'v19', when: { chapter: [1, 5], lamps: 1 }, lines: [
    ['b', 'Goro Nakano! The city spat you back out.'], ['a', 'I spat it out, Kubo. Too much concrete.'], ['b', 'Welcome home, you old trout.'] ] },
  { id: 'nakano-kubo-2', a: 'v8', b: 'v19', after: 'nakano-kubo-1', when: { chapter: [1, 5], lamps: 1, folk: { v19: 2 } }, lines: [
    ['b', 'My scarecrow\'s wearing your shirt, you know.'], ['a', 'My WHAT? That\'s my lucky shirt!'], ['b', 'Crows agree. They won\'t go near it.'] ] },
  { id: 'nakano-kubo-3', a: 'v8', b: 'v19', after: 'nakano-kubo-1', when: { chapter: [2, 2] }, lines: [
    ['a', 'Hot one. Fish are hiding under the dock.'], ['b', 'Beans are hiding under the leaves. Wise beans.'] ] },
  { id: 'nakano-kubo-4', a: 'v8', b: 'v19', after: 'nakano-kubo-1', story: 'classic', when: { chapter: [5, 5] }, lines: [
    ['b', 'So it was nobody\'s fault. Or everybody\'s.'], ['a', 'I left, Kubo. That\'s my bit of it.'], ['b', 'And you came back. That\'s your other bit.'] ] },
  { id: 'nakano-kubo-4-g', a: 'v8', b: 'v19', after: 'nakano-kubo-1', story: 'grandma', when: { chapter: [5, 5] }, lines: [
    ['b', 'Genzo said please. Out loud. In public.'], ['a', 'I was there, Kubo. Sora cried laughing.'], ['b', 'Then she baked him a cake. With a ribbon.'] ] },

  // ---- Mrs. Komori and Miss Endo at lunch on the bench
  { id: 'komori-endo-1', a: 't2', b: 'v9', when: { chapter: [1, 5], lamps: 1 }, lines: [
    ['a', 'How are the little ones, Miss Endo?'], ['b', 'Kenta ate a crayon. Yui says it\'s art.'], ['a', 'Yui says everything\'s art.'] ] },
  { id: 'komori-endo-2', a: 't2', b: 'v9', after: 'komori-endo-1', when: { chapter: [1, 5], lamps: 1 }, lines: [
    ['b', 'Have you seen Daifuku? He\'s not come home.'], ['a', 'That cat? He has five homes on this street.'], ['b', 'Mine\'s the one with the good cushion.'] ] },
  { id: 'komori-endo-3', a: 't2', b: 'v9', after: 'komori-endo-2', when: { chapter: [2, 5], folk: { v9: 2 } }, lines: [
    ['b', 'Daifuku\'s on the boathouse roof. Sulking.'], ['a', 'What\'s he sulking about?'], ['b', 'Fish. The lack of it.'], ['a', 'Ah. A Kawabe cat, then.'] ] },
  { id: 'komori-endo-4', a: 't2', b: 'v9', after: 'komori-endo-1', when: { chapter: [3, 4] }, lines: [
    ['a', 'I\'m trying chestnut candy this year.'], ['b', 'For the star-fall? Save me one.'], ['a', 'I\'ll save you two. You\'re a good customer.'] ] },
  { id: 'komori-endo-5', a: 't2', b: 'v9', after: 'komori-endo-1', when: { chapter: [5, 5] }, lines: [
    ['b', 'The children paste gold stars on their sums.'], ['a', 'That\'s my gold paper. They\'ve cleared me out.'], ['b', 'Best marks I\'ve ever given.'] ] },

  // ---- the Ishidas, evenings on the porch
  { id: 'ishida-1', a: 'v24', b: 'v25', when: { chapter: [1, 5], lamps: 1 }, lines: [
    ['b', 'All eleven lit. Little Tora\'s the brightest.'], ['a', 'You say that every night.'], ['b', 'It\'s true every night.'] ] },
  { id: 'ishida-2', a: 'v24', b: 'v25', after: 'ishida-1', when: { chapter: [1, 5], lamps: 1 }, lines: [
    ['a', 'I made the Nakano boy a boat.'], ['b', 'The boy who stared at you for a week?'], ['a', 'He thinks I didn\'t notice.'], ['b', 'Everyone noticed, dear.'] ] },
  { id: 'ishida-3', a: 'v24', b: 'v25', after: 'ishida-1', when: { chapter: [2, 5], lamps: 2 }, lines: [
    ['b', 'Look, the Orchard Lamp. Across the river.'], ['a', 'Two lamps. Like two houses with the light on.'], ['b', 'Like neighbours.'] ] },
  { id: 'ishida-4', a: 'v24', b: 'v25', after: 'ishida-1', when: { chapter: [4, 4] }, lines: [
    ['b', 'Snow on the lantern hoods. Mind the posts.'], ['a', 'I mind the posts. You mind your fingers.'] ] },
  { id: 'ishida-5', a: 'v24', b: 'v25', after: 'ishida-1', when: { chapter: [5, 5] }, lines: [
    ['b', 'There it is. The Viaduct Lamp.'], ['a', 'All four, every night now.'], ['b', 'I still look. Every night. Just to check.'] ] },

  // ---- Kawabe kids: Kenta and Yui
  { id: 'kenta-yui-1', a: 'v3', b: 'v20', when: { chapter: [0, 5] }, lines: [
    ['a', 'That was IN. I\'m captain, I say it was in.'], ['b', 'You can\'t be captain AND referee.'], ['a', 'I can if nobody else wants to.'], ['b', 'I want to!'] ] },
  { id: 'kenta-yui-2', a: 'v3', b: 'v20', after: 'kenta-yui-1', when: { chapter: [0, 5] }, lines: [
    ['b', 'You stepped on the line.'], ['a', 'You drew the line under my foot!'], ['b', 'That\'s called planning.'] ] },
  { id: 'kenta-yui-3', a: 'v3', b: 'v20', after: 'kenta-yui-2', when: { chapter: [2, 5] }, lines: [
    ['a', 'Takamori kids have a GIANT ball.'], ['b', 'Who said?'], ['a', 'Everyone. Rin heard it from a sheep.'] ] },
  { id: 'kenta-yui-4', a: 'v3', b: 'v20', after: 'kenta-yui-3', when: { chapter: [5, 5], folk: { v3: 2 } }, lines: [
    ['b', 'Nao from Takamori wrote us the rules.'], ['a', 'Their rules or real rules?'], ['b', 'Fair rules. She drew pictures.'], ['a', '...They\'re good pictures.'] ] },
  { id: 'kenta-yui-5', a: 'v3', b: 'v20', after: 'kenta-yui-1', when: { chapter: [4, 4] }, lines: [
    ['a', 'Snowball rules: no ice in the middle.'], ['b', 'Says who?'], ['a', 'Says me, after last time.'] ] },

  // ---- Sato and Aiko at the stall (the postman's long courtship)
  { id: 'sato-aiko-1', a: 'v5', b: 'v4', when: { chapter: [2, 5] }, lines: [
    ['a', 'Letters for you, Aiko.'], ['b', 'Again? You came by an hour ago.'], ['a', 'Did I? Well. This one\'s… also a bill.'] ] },
  { id: 'sato-aiko-2', a: 'v5', b: 'v4', after: 'sato-aiko-1', when: { chapter: [2, 5] }, lines: [
    ['b', 'Flowers for your table, Mr. Sato?'], ['a', 'I don\'t have a table. I mean, I do. Yes.'], ['b', 'The yellow ones?'], ['a', 'Whichever you like. I mean, yes.'] ] },
  { id: 'sato-aiko-3', a: 'v5', b: 'v4', after: 'sato-aiko-2', when: { chapter: [3, 5] }, lines: [
    ['b', 'Your satchel\'s very full today.'], ['a', 'It\'s mostly… nerve. At the bottom.'], ['b', 'Is that a joke?'], ['a', 'I\'m not sure yet.'] ] },
  { id: 'sato-aiko-4', a: 'v5', b: 'v4', after: 'sato-aiko-3', when: { chapter: [4, 4] }, lines: [
    ['b', 'You\'ve no gloves. Your hands are blue.'], ['a', 'Ink. Mostly ink. Some cold.'], ['b', 'Here. Hold the tea jar a minute.'] ] },
  { id: 'sato-aiko-5', a: 'v5', b: 'v4', after: 'sato-aiko-3', when: { chapter: [5, 5] }, lines: [
    ['b', 'Sunday. The viaduct. You\'re bringing buns.'], ['a', 'Three. Hana says three is traditional.'], ['b', 'Then three it is.'] ] },

  // ---- Aiko and Oda the shepherd
  { id: 'aiko-oda-1', a: 'v4', b: 'v22', when: { chapter: [2, 5], lamps: 2 }, lines: [
    ['b', 'Any pickles for a man who lost five sheep?'], ['a', 'They came back, Oda.'], ['b', 'Then pickles for a man who found five sheep.'] ] },
  { id: 'aiko-oda-2', a: 'v4', b: 'v22', after: 'aiko-oda-1', when: { chapter: [2, 5] }, lines: [
    ['a', 'Sato went pink again this morning.'], ['b', 'He\'s been pink since spring.'], ['a', 'Since five springs, Oda.'] ] },
  { id: 'aiko-oda-3', a: 'v4', b: 'v22', after: 'aiko-oda-1', when: { chapter: [3, 3], lamps: 3 }, lines: [
    ['b', 'Mushrooms coming down from the forest!'], ['a', 'Nobody\'s been up there since Kiku left.'], ['b', 'That girl has. With a fox.'] ] },
  { id: 'aiko-oda-4', a: 'v4', b: 'v22', after: 'aiko-oda-1', when: { chapter: [5, 5] }, lines: [
    ['a', 'I\'m keeping yellow flowers for Kawabe again.'], ['b', 'For Tsuru?'], ['a', 'For whoever crosses. Somebody always will now.'] ] },

  // ---- Oda and Tanabe the bell-ringer on the bench
  { id: 'oda-tanabe-1', a: 'v22', b: 'v27', when: { chapter: [2, 5], lamps: 2 }, lines: [
    ['a', 'Tanabe! You\'re back. The bell sounds right again.'], ['b', 'It sounded right without me. Just lonely.'] ] },
  { id: 'oda-tanabe-2', a: 'v22', b: 'v27', after: 'oda-tanabe-1', when: { chapter: [2, 5], lamps: 2 }, lines: [
    ['b', 'Sumi tried to climb the bell rope.'], ['a', 'How far did she get?'], ['b', 'Far enough to ring it upside down.'] ] },
  { id: 'oda-tanabe-3', a: 'v22', b: 'v27', after: 'oda-tanabe-1', when: { chapter: [3, 5] }, lines: [
    ['a', 'Bit of mist on the river this morning.'], ['b', 'I rang the seven anyway. Mist can hear.'] ] },
  { id: 'oda-tanabe-4', a: 'v22', b: 'v27', after: 'oda-tanabe-1', story: 'classic', when: { chapter: [5, 5] }, lines: [
    ['b', 'Hana and Ōta both stood up on that platform.'], ['a', 'Ten years too late.'], ['b', 'Better than eleven.'] ] },
  { id: 'oda-tanabe-4-g', a: 'v22', b: 'v27', after: 'oda-tanabe-1', story: 'grandma', when: { chapter: [5, 5] }, lines: [
    ['b', 'Hana and Ōta carried beams side by side.'], ['a', 'Arguing about who carried more.'], ['b', 'Ōta says Ōta won. Hana says Hana did.'] ] },

  // ---- Takamori kids: Hiro and Nao
  { id: 'hiro-nao-1', a: 'v6', b: 'v23', when: { chapter: [0, 5] }, lines: [
    ['a', 'Captain\'s orders: you\'re in goal.'], ['b', 'I was in goal yesterday.'], ['a', 'You\'re very good at it.'], ['b', 'That\'s not a reason.'] ] },
  { id: 'hiro-nao-2', a: 'v6', b: 'v23', after: 'hiro-nao-1', when: { chapter: [0, 5] }, lines: [
    ['b', 'You owe me three buns.'], ['a', 'Two.'], ['b', 'It\'s in the book.'], ['a', '...Three.'] ] },
  { id: 'hiro-nao-3', a: 'v6', b: 'v23', after: 'hiro-nao-1', when: { chapter: [2, 2] }, lines: [
    ['a', 'Too hot for tag. Let\'s play shade.'], ['b', 'What\'s shade?'], ['a', 'We sit in it. First to move loses.'] ] },
  { id: 'hiro-nao-4', a: 'v6', b: 'v23', after: 'hiro-nao-2', when: { chapter: [5, 5] }, lines: [
    ['b', 'I wrote to the Kawabe kids.'], ['a', 'You WHAT? That\'s fraternising!'], ['b', 'It\'s diplomacy. Also, they\'re nice.'] ] },

  // ---- generic: any two people
  { id: 'g-mika-1', a: 'woman', b: 'man', story: 'classic', when: { chapter: [0, 1] }, lines: [
    ['a', 'Sora\'s granddaughter came on the last train.'], ['b', 'Clearing out the cottage, I heard.'], ['a', 'Doesn\'t look like a girl who clears off.'] ] },
  { id: 'g-mika-1-g', a: 'woman', b: 'man', story: 'grandma', when: { chapter: [0, 1] }, lines: [
    ['a', 'Sora\'s granddaughter came on the last train.'], ['b', 'Staying the year, I heard. Sora\'s thrilled.'], ['a', 'Sora has her up ladders already.'] ] },
  { id: 'g-mika-2', a: 'any', b: 'any', when: { chapter: [1, 5], lamps: 1 }, lines: [
    ['a', 'They say Sora\'s girl lit the Mill Lamp.'], ['b', 'With a star, I heard. A talking one.'], ['a', 'Well. She is Sora\'s.'] ] },
  { id: 'g-lamps-2', a: 'any', b: 'any', when: { chapter: [2, 5], lamps: 2 }, lines: [
    ['a', 'Two lamps lit. Can you believe it?'], ['b', 'I keep looking out the window to check.'] ] },
  { id: 'g-lamps-3', a: 'any', b: 'any', story: 'classic', when: { chapter: [3, 5], lamps: 3 }, lines: [
    ['a', 'Even the Forest Lamp\'s burning now.'], ['b', 'Kiku would be glad. Wherever she is.'] ] },
  { id: 'g-lamps-3-g', a: 'any', b: 'any', story: 'grandma', when: { chapter: [3, 5], lamps: 3 }, lines: [
    ['a', 'Even the Forest Lamp\'s burning now.'], ['b', 'Kiku would be glad. I\'ll write and tell her.'] ] },
  { id: 'g-train-1', a: 'man', b: 'any', story: 'classic', when: { chapter: [0, 3] }, lines: [
    ['a', 'Ten years since the Star Train ran.'], ['b', 'Genzo still oils Kobo every morning.'], ['a', 'Hope\'s a kind of grease, I suppose.'] ] },
  { id: 'g-train-1-g', a: 'man', b: 'any', story: 'grandma', when: { chapter: [0, 3] }, lines: [
    ['a', 'Star Train for the festival this winter, they say.'], ['b', 'Genzo still oils Kobo every morning.'], ['a', 'Hope\'s a kind of grease, I suppose.'] ] },
  { id: 'g-train-2', a: 'any', b: 'any', when: { chapter: [5, 5] }, lines: [
    ['a', 'Going on the Sunday train?'], ['b', 'Wouldn\'t miss it. Genzo waves at everyone.'], ['a', 'He waved at a cow last week.'] ] },
  { id: 'g-spring', a: 'woman', b: 'any', when: { season: 'spring' }, lines: [
    ['a', 'Blossom in my tea again.'], ['b', 'That\'s spring for you. Drink round it.'] ] },
  { id: 'g-summer', a: 'any', b: 'any', when: { season: 'summer' }, lines: [
    ['a', 'Hot enough to cook rice on the step.'], ['b', 'Don\'t tell Fujita. He\'ll charge for it.'] ] },
  { id: 'g-autumn', a: 'any', b: 'any', when: { season: 'autumn' }, lines: [
    ['a', 'Smell that? Somebody\'s roasting chestnuts.'], ['b', 'Somebody should roast them near me.'] ] },
  { id: 'g-winter', a: 'man', b: 'woman', when: { season: 'winter' }, lines: [
    ['a', 'Snow on the viaduct. Like sugar.'], ['b', 'My grandmother said snow is how stars rest.'], ['a', 'Then let\'s be worth looking at.'] ] },
  { id: 'g-kids-1', a: 'kid', b: 'kid', when: {}, lines: [
    ['a', 'Tag, you\'re it!'], ['b', 'I wasn\'t playing!'], ['a', 'You are now!'] ] },
  { id: 'g-kids-2', a: 'kid', b: 'kid', when: {}, lines: [
    ['a', 'If you could have one wish?'], ['b', 'A ball that comes back by itself.'], ['a', 'That\'s a dog.'] ] },
  { id: 'g-kids-3', a: 'kid', b: 'any', when: { chapter: [2, 5] }, lines: [
    ['a', 'Is it true there\'s a bear in the forest?'], ['b', 'Big as a house. Asleep, mostly.'], ['a', 'Mostly?!'] ] },
  { id: 'g-weather', a: 'any', b: 'any', when: {}, lines: [
    ['a', 'Looks like rain later.'], ['b', 'You said that yesterday.'], ['a', 'And one day I\'ll be right.'] ] },
  { id: 'g-feud', a: 'man', b: 'any', story: 'classic', when: { chapter: [5, 5] }, lines: [
    ['a', 'Ten years of blaming the other side.'], ['b', 'And it was the river all along.'], ['a', 'The river, and us not watching.'] ] },
  { id: 'g-feud-g', a: 'man', b: 'any', story: 'grandma', when: { chapter: [5, 5] }, lines: [
    ['a', 'Both villages carried beams for Genzo.'], ['b', 'And argued all the way about who carried more.'], ['a', 'Best argument this valley ever had.'] ] },
  { id: 'g-night', a: 'any', b: 'any', when: { night: true }, lines: [
    ['a', 'Look at all those stars.'], ['b', 'Feels like they\'re looking back.'] ] },
  { id: 'g-buns', a: 'woman', b: 'any', when: { chapter: [5, 5] }, lines: [
    ['a', 'Three buns each at the festival, Hana says.'], ['b', 'Ōta took four.'], ['a', 'And said they were dry. With his mouth full.'] ] },
];
