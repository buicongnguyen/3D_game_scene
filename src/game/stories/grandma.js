// © 2026 Bui Cong Nguyen · solluxlabs.com
// "A Year with Grandma": the default story (docs/STORY-GRANDMA.md). Plain data, no imports.
// Merged over the classic tables in ../story.js by ./index.js (useStory): DIALOGUE, CHATTER, CAPTIONS override by id or
// key; JOURNAL and SKY_LETTERS replace the classic lists; KEEPSAKES, GIFTS and STEPS override fields by id.
//
// Where Grandma Sora can SPEAK (she is on screen): p.arrive (station platform, with Genzo), p.cottage, p.chest and
// p.porch (at the cottage), every chapter party and its photo, c4.meeting (platform), c4.board and c4.ride (the Star
// Train), the ending, and the epilogue (home at the cottage). Everywhere else she is only mentioned, or leaves notes
// (read by the narrator or Mika, never voiced by 'sora'). Mika's parents (mom, dad) speak only in the ending.
// The premise (docs/STORY-GRANDMA.md, "Voice and facts"): last autumn the river flooded. Nobody was hurt, but the lamp oil,
// three mill cogs and the middle of the viaduct went with it, and the young folk are away working in the city, so nothing
// got mended. The Star Lamps were oil lamps lit by match up a ladder. Mika, a city kid from the science club, fits a
// dynamo to Ōta's wheel and electric bulbs to the four lamps: "the girl who brought the light". Grandma knows nothing
// about electricity ("the what-tricity"). Tamo still sparks things, but the lamps are bulbs now: he carries each one up.
// Nobody is at fault for anything, nobody is ever in danger, and every goodbye is a "see you Sunday".

export const STORY = {
  id: 'grandma',

  CAST: {
    sora: { name: 'Grandma Sora', color: '#c0587a', pitch: 0.95, voice: 'f' },
    mom: { name: 'Mum', color: '#3a9a7a', pitch: 1.1, voice: 'f' },
    dad: { name: 'Dad', color: '#4f6fb0', pitch: 0.82, voice: 'm' },
  },

  // ---------------------------------------------------------------------------------------------- dialogue
  DIALOGUE: {
    // Grandma's countryside tricks (content/tricks.js): she teaches each one once, the first time Mika talks to her in season
    trick_firefly_intro: [
      ['sora', "Summer night, Mi-chan. Fireflies down by the paddies. Take my soft net and a jar.", 'Talk'],
      ['mika', "Grandma, I'm from the city. Bugs come in one setting: no."],
      ['sora', "These ones carry their own little lamps. Sweep the net just as one glows. Ten will light your way home."],
      ['sora', "And before bed, every one goes back. Even the nicest lamp belongs outside."],
    ],
    trick_river_intro: [
      ['sora', "When the river's quiet at night, take my lantern down to the shallows by the dock.", 'Talk'],
      ['sora', "The fish doze near the bottom, and shrimp eyes twinkle back at the light like little stars."],
      ['mika', "Stars in the river. Sure. Next you'll tell me the frogs sing."],
      ['sora', "They do! Another night. Ankle-deep only, Mi-chan, and I'll be watching from the bank."],
    ],
    trick_stars_intro: [
      ['sora', "Clear tonight. Up the hill behind the cottage, flat on your back, eyes up. I'll supervise from my chair.", 'Talk'],
      ['mika', "At home I counted the stars once. It took about four seconds."],
      ['sora', "Here you'd need all summer. Find the Big Dipper first. Its two end stars point to the North Star."],
      ['sora', "The North Star hardly moves. Your great-grandpa walked home by it more than once."],
    ],
    trick_frogs_intro: [
      ['sora', "After a warm rain the frogs sing in the bottom paddies at dusk. A whole choir, and no conductor.", 'Talk'],
      ['mika', "So, noise. Wet noise."],
      ['sora', "Creep up while they sing, stand still when they hush. Wet your hands first, and put them back after."],
    ],
    trick_kite_intro: [
      ['sora', "Kite wind today, Mi-chan. Your great-grandpa made his from two bamboo sticks and old newspaper.", 'Talk'],
      ['mika', "Ours came from a shop. It had a cartoon shark on it."],
      ['sora', "This one you tie yourself: the cross, the paper, a good long tail. The tail stops it spinning like a top."],
      ['sora', "Then read the wind in the grass and the clouds, and steer back into it when a gust pushes."],
      ['sora', "The cow meadow south of the village. The cows won't mind. They've seen worse flying."],
    ],
    trick_planes_intro: [
      ['sora', "A fine dry day, Mi-chan. Bring a few sheets of paper up the hill above the landing. We'll fold planes.", 'Talk'],
      ['mika', "Mine always crash, Grandma. Nose first. Every single time."],
      ['sora', "Then we fold slowly. A corner to the middle line, the left the same as the right, a nail along every crease."],
      ['sora', "And throw it as if you were handing it to the wind: gently and level. Three throws, and the best one counts."],
    ],
    trick_roast_intro: [
      ['sora', "The rice is in and the straw is dry, Mi-chan. That means sweet potatoes out in the meadow.", 'Talk'],
      ['mika', "We have a microwave at home. It takes four minutes."],
      ['sora', "And tastes like four minutes. I light the straw, not you. You bury them in the ash and watch the colour."],
      ['sora', "Too soon and they're raw, too late and they're coal. Dig them out just right and share with the children."],
    ],
    trick_firedrill_intro: [
      ['sora', "Fire drill on the lawn today, Mi-chan. The village does one every season, and you're big enough to join in.", 'Talk'],
      ['mika', "Do I get to put out a real fire?"],
      ['sora', "A small one, in a metal tray, with me beside you. At a real fire you shout \"Fire!\", tell a grown-up and get away."],
      ['sora', "For the tray, four things. Pull the pin. Aim at the base. Squeeze the handle. Sweep from side to side."],
    ],
    trick_beetles_intro: [
      ['sora', "Summer dusk, Mi-chan. Time to lay the table for the beetles, up in the chestnut grove.", 'Talk'],
      ['mika', "Grandma. We are not inviting beetles to dinner."],
      ['sora', "Banana and a pinch of sugar, rubbed on the bark. Sleep on it, and at dawn we see who came."],
      ['sora', "A rhinoceros beetle if we're lucky. Lift him gently, say hello, and put him back on his tree."],
    ],
    trick_cowrace_intro: [
      ['sora', "In the city you take a taxi, Mi-chan. In the valley you take a cow. Come, the cow race is up on the Takamori pasture.", 'Talk'],
      ['mika', "A race. On cows. Grandma, are cows fast?"],
      ['sora', "They are determined, which is better. In Vietnam they race oxen through flooded rice fields, and the whole village cheers."],
      ['sora', "Tap Giddy-up on the beat of her hooves. Mash it and she gets puffed. We feed our cows and cheer them, never hit them."],
    ],
    trick_eggs_intro: [
      ['sora', "My hens will not lay in the nest box, Mi-chan. Up on the roof they go, and the eggs roll down the bamboo gutters.", 'Talk'],
      ['mika', "Grandma, that is a marble run. For eggs."],
      ['sora', "It is! The gutters are joined by little seesaws, and an egg takes every one it meets. Read where it will come out."],
      ['sora', "A hen clucks and puffs before she lays. Hold your hat under the right spout, and tip it into the basket when it is full."],
    ],
    trick_dance_intro: [
      ['hoa', "You must be Grandma Sora's Mika! I'm Hoa, Hana's daughter. Hana and Hoa both mean flower. Mum likes things to match.", 'Wave'],
      ['mika', "Buns, aprons, and now daughters?"],
      ['hoa', "Exactly! I study dance in Seoul. My friends Nabi, Byeol and Haru came home with me for the festival.", 'Talk'],
      ['mika', "Grandma says you danced the bon odori before you could walk."],
      ['hoa', "Your grandma taught me my first steps! Tonight I teach the hat dance from Vietnam. Watch me, then copy me, on the beat."],
      ['hoa', "Or join Nabi and Haru on the stage while Byeol sings. Arrows, swipes or the buttons: every move has its own."],
    ],
    // (Rin leads the morning exercise in this story too: Grandma is only mentioned, she is not on the lawn)
    trick_exercise_intro: [
      ['rin', "Morning, Mika! Your grandma did radio exercise on this lawn every morning when she was your age. Want to try?", 'Talk'],
      ['mika', "Grandma did exercise? She says she just walks to the shop and back. Quickly."],
      ['rin', "Same thing! Copy my moves and press the arrow just as the count lands. For yoga, hold still and keep your balance."],
      ['rin', "Nobody fails here. Move gently, breathe, and stop if anything hurts. The neighbours join in on the harder days."],
    ],
    trick_hoppers_intro: [
      ['sora', "Hoppers today, Mi-chan! The meadow below the paddies is full of them. In my day we caught them for dinner.", 'Talk'],
      ['mika', "Grandma. For DINNER."],
      ['sora', "With a little salt. Don't look at me like that. Today we only catch them to say hello."],
      ['sora', "Creep up: they crouch just before they jump. And the mantis watches you, so go slowly while it stares."],
      ['sora', "Mantises eat the bugs in my garden, so they are friends. Have a look, then let them go."],
    ],
    trick_cricket_intro: [
      ['sora', "Warm dusk, Mi-chan. The crickets are tuning up on the hill above Takamori.", 'Talk'],
      ['mika', "At home we'd call that a noise problem."],
      ['sora', "Here it's a concert. Walk toward the song. When he goes quiet, you stand still, and he starts again."],
      ['sora', "Then tap along with his beat, very gently, and he'll hop into the cage. Count his chirps for fourteen seconds."],
      ['mika', "A cricket thermometer. Grandma, you're making this up."],
      ['sora', "Ask your science club. Chirps plus forty is the temperature in Fahrenheit. And then he goes home to bed."],
    ],
    trick_lifecycle_intro: [
      ['sora', "I drew these cards when your mother was small, Mi-chan. Eggs, caterpillars, tadpoles: how little animals grow up.", 'Talk'],
      ['mika', "Grandma, a caterpillar and a butterfly are the same animal? They look nothing alike."],
      ['sora', "That is the puzzle! Put a life in order, find the missing card, spot the one that does not belong."],
      ['sora', "Come to the green by the river, at the north end of Kawabe. No hurry, no clock. Thinking is the whole game."],
    ],
    trick_crops_intro: [
      ['sora', "Every grain of rice in your bowl took a whole summer, Mi-chan. I drew it all on cards: rice, wheat and potatoes.", 'Talk'],
      ['mika', "Grandma, do potatoes grow from seeds too?"],
      ['sora', "From a potato! That is one of the puzzles. Put a crop's year in order, read the year wheel, find what it needs."],
      ['sora', "Come to the north edge of the rice paddies, west of Kawabe. No hurry, no clock. Thinking is the whole game."],
    ],
    trick_archery_intro: [
      ['sora', "A bow, Mi-chan! I won the village archery cup in my day. Once. The target was very large.", 'Talk'],
      ['mika', "How large?"],
      ['sora', "Roughly the size of the barn. And the barn was very polite: it never moved."],
      ['sora', "Today it's straw targets and practice arrows with soft rubber tips. Hold to draw, breathe, let go."],
      ['sora', "Watch the wind sock. The wind pushes a light arrow sideways, so aim a little upwind. The range is behind the houses."],
    ],
    trick_firefly_note: [
      ['narrator', 'In the jar-light, a folded paper by the path: a drawing of a small girl holding a jar of fireflies.'],
      ['narrator', 'In Grandma\'s handwriting: "Mi-chan, age four. She cried when we let them go, then waved goodbye to every one."'],
      ['mika', "I don't remember that. …I'd still wave."],
    ],
  // review fixes: the peaches are three for Hana's basket and two for Grandma's jam
  c2_hana_tasks: [
    ['hana', "The lamp's up in the bell tower and the key's in my apron. But the Firefly Festival is tomorrow, and it's a disaster.", 'Talk'],
    ['hana', "My sheep are loose, the crows are at my peaches, and I need five ripe ones: three for my basket, two for Sora's jam."],
    ['hana', "Help me save my festival and the key is yours. Sheep first—walk up to each one and it'll trot home to the pen."],
  ],
  c2_crows_done: [['tamo', "Listen to that! Not a crow left. Now five ripe peaches: three for Hana's basket, two for Sora's jam.", 'Happy']],
    // ---- prologue: Grandma and Genzo meet the last train of winter
    p_arrive: [
      ["sora", "Mi-chan! A whole year together. Come here and let me hug you before Genzo puts you to work.", "Wave"],
      ["mika", "Careful with that case, Grandma. Mum packed light bulbs. I wrapped each one in a sock."],
      ["sora", "Then we'll have bright lamps and very warm feet. Come up to the cottage. I've made your favourite soup.", "Cheer"],
      ['genzo', "I'll bring the bags. Slowly. Mind the fallen fence, girl, and keep off the viaduct. The flood borrowed its middle."],
    ],
    p_cottage: [
      ['sora', 'There you are! I took the shortcut. There is no shortcut. I just walk with purpose.', 'Wave'],
      ['sora', "That's Kawabe down there. That's the river. That's where I fell in, 1968. The river won.", 'Talk'],
      ['mika', 'Your cottage smells like cedar and old tea.'],
      ['sora', "And soup. Always soup. Now come and help me with the chest on the porch. I've been saving it for you."],
    ],
    p_chest: [
      ['narrator', 'Inside the chest: a brass signal lantern with red glass, every letter Mika ever sent, and a tin of very old toffee.'],
      ["tamo", "Five more minutes, Sora... Oh! There's two of you!", "Happy"],
      ["sora", "This is my granddaughter, Mika. Mi-chan, meet Tamo. We used to light the lamps together.", "Talk"],
    ],
    // classic: Sora's letter. Here Grandma explains it herself, on the porch.
    p_letter: [
      ["mika", "What if the mill wheel powered electric bulbs? We made a dynamo lamp in science club, Grandma."],
      ["sora", "Four Star Lamps, one for each season. Shall we try your idea at the mill this spring?", "Cheer"],
    ],
    p_spark_tutorial: [
      ["tamo", "Your turn, Mika! Come to the porch lamp and press {act}. I'll bring the spark.", "Happy"],
    ],
    p_spark_done: [
      ["sora", "First, supper. Tomorrow you can meet Rin at the Kawabe dock. She knows the way to the mill.", "Talk"],
    ],
    // Grandma's hints while she waits at the cottage (new ids: step talk on p.chest and p.porch)
    sora_hint_chest: [['sora', 'The chest, dear. On the porch. Lift the lid for me. My back has opinions about lids.', 'Talk']],
    sora_hint_porch: [['sora', 'The porch lamp, Mi-chan. Walk up to it and press {act}. Tamo does the clever part.', 'Talk']],

    // ---- chapter 1: spring, Kawabe, the stuck wheel
    c1_rin_meet: [
      ["mika", "Hi, I'm Mika. Grandma said I'd find you here. What are you watching?"],
      ["rin", "Trout. See how they face upriver? You're Sora's Mika! Here, there's room beside me.", "Talk"],
      ["mika", "Thanks. If I follow the river up from here, will I find the mill wheel? I want to see how fast it turns."],
      ['rin', "You will. It's quiet these days, though. Ask my grandpa Ōta at the mill. He still listens to that wheel like it might start singing again."],
    ],
    c1_ota_refuse: [
      ['mika', "I'm Sora's granddaughter. I'm going to make your wheel light the Mill Lamp. With electricity."],
      ['ota', "The lamp's out on the island, and the drawbridge only comes down when the wheel turns. The wheel is resting."],
      ['ota', "Three cogs short since the flood. RESTING. And I don't need help, thank you. I need dinner that isn't pickled radish.", 'Talk'],
      ['tamo', "(whispering) He's hungry. Hungry people are grumpy. That's science."],
    ],
    c1_rin_fish: [
      ['rin', 'He said no, right? Classic Grandpa.', 'Talk'],
      ['rin', 'Your grandma told me the trick years ago: Grandpa has never once said no to a grilled trout.'],
      ['rin', "So. Catch me three fish—any fish, we'll call them trout—and I'll grill them. The rod's on the dock."],
      ['rin', "Cast where the fish are, wait for the float to sink, then hold to reel. Ease off if the line strains. That's what friends teach you. Probably."],
    ],
    c1_ota_trout: [
      ['ota', '…Is that grilled trout?', 'Idle'],
      ['ota', "…With the salt crust Rin does. Hmph. Sit, sit. No, don't sit. Just… thank you.", 'Bow'],
      ['ota', "This is Sora's doing. She's known about me and trout for sixty years. Fine. Find my three cogs and try your wire trick."],
      ['ota', "The flood left one in the reeds by the boathouse. Rin's cousins hid one on top of the crate stack, the rascals. And one…"],
      ['ota', '…one was stolen by a crab. Do not laugh. That crab is a menace.', 'Talk'],
    ],
    c1_wheel: [
      ['narrator', "The cogs slide into place. Mika bolts Kobo's spare dynamo to the axle and runs a wire out to the island.", 'Hammer'],
      ['ota', '…It turns. Hah! Listen to her sing. And what is that buzzing box, girl?', 'Wave'],
      ['mika', 'A dynamo. Genzo lent it. The wheel spins it, and it pushes light down the wire. We made a tiny one in science club.'],
      ['ota', "Light down a wire. Hmph. There goes the drawbridge. The island's yours, Sora's girl. Show me at sundown."],
      ['ota', 'And tell your grandmother I fixed the wheel myself. Mostly.', 'Talk'],
    ],
    c1_lamp: [
      ['tamo', "I screwed it in! Me! And then, click. No match, no oil, no smoke. It's just… ON. Is it allowed to do that?", 'Happy'],
      ['tamo', 'Oh! Lamps keep memories, Mika, and the new light woke one up. Look!'],
      ['tamo', 'A girl with two plaits, up this very ladder with a match. She set her sleeve on fire, just a bit, and laughed till she fell over.'],
      ['mika', 'Grandma?'],
      ['tamo', 'Grandma! She was thirteen, same as you. She was terrible at it. Then she was wonderful.', 'Happy'],
    ],
    c1_ota_page: [
      ['ota', 'Look at it. No flame, no wick, and I can read my paper from here. Your grandmother is going to be unbearable.', 'Talk'],
      ['ota', "I blew on it, you know. To put it out. It just looked at me. …Don't tell Rin."],
      ['ota', 'Here. Sora lent me this page of her diary in 1971, to prove it was her sleeve that caught fire, not her plaits.', 'Talk'],
      ['ota', "She won. Give it back to her. She'll read it to you tonight, with voices. Mine is NOT that squeaky."],
      ['narrator', "A page from Grandma's star diary, in a girl's careful handwriting. Mika tucks it into her journal."],
      ['ota', 'The next lamp downriver is Takamori\'s. Rin will ferry you over. Say hello to the bun woman. Not from me.'],
    ],

    // ---- chapter 2: summer, Takamori, peaches for the festival
    c2_arrive: [
      ['tamo', 'Takamori! Look at all those peach trees. The Orchard Lamp must be up there somewhere.', 'Happy'],
      ["mika", "I can smell peaches already. Wait, that's warm bread. Is Hana baking peaches into her buns?"],
      ["tamo", "Let's ask at the bakery. Sora wants two peaches for her jam. I volunteer to taste the buns."],
    ],
    c2_hana_meet: [
      ['hana', 'Oh! A new face! Here, have a peach bun, you look half-starved. Who are you, sweetheart?', 'Wave'],
      ['mika', "Mika. Sora's granddaughter. I came about the Orchard Lamp."],
      ['hana', "Sora's Mika! Oh, love, she's talked about nothing else since autumn. Come here, let me look at you.", 'Cheer'],
      ['hana', "You've got her eyebrows. That's the bossy part, you know. It lives in the eyebrows.", 'Talk'],
      ['mika', 'Grandpa Ōta says hello. He said not to say it was from him.'],
      ['hana', 'Did he now. The old radish. Tell him hello back, and that his jam is still runny.', 'Cheer'],
    ],
    c2_peaches_done: [
      ['narrator', "Three peaches go into Hana's festival basket and two into a bag for Grandma's jam. Under the cloth: a warm bun and a note."],
      ['hana', "One last favour, then the key is yours. That bun is for Genzo, at the station. He sent my basket back with no note. The cheek.", 'Talk'],
    ],
    c2_genzo_bun: [
      ['genzo', 'A peach bun. From Hana.', 'Talk'],
      ['genzo', '…Hmph. She knows I\'m watching my figure. Kobo can\'t pull me up the hill for ever.', 'ArmsCrossed'],
      ['narrator', 'Genzo eats exactly half of the bun, very slowly, wraps up the rest and scribbles a note on the paper.'],
      ['genzo', "Take that back to her. Tell her it's too sweet. She'll know what I mean.", 'Talk'],
      ['tamo', "(whispering) That's grown-up for 'thank you'. They do it backwards here."],
    ],
    c2_hana_key: [
      ['hana', "Half a bun and 'Too sweet. Send another.' Ha! That means he loved it. Same note for forty years.", 'Cheer'],
      ['hana', "Here's the key, love. Ring the bell for me, then do your lamp magic. Rin says there's no match in it. I don't believe her.", 'Talk'],
    ],
    c2_lamp: [
      ['tamo', "Bulb's in! Click! It's so bright the fireflies are jealous. I'M a bit jealous. And look, it kept a memory!", 'Happy'],
      ['tamo', 'The Star Train, all lit up, coming over the viaduct. And Sora on the platform, waving with both arms.'],
      ['tamo', 'A little boy in a cap hung out of the cab window, waving back. He waved so hard his cap fell in the river.'],
      ['mika', 'A boy in a cap… Genzo?'],
      ['tamo', "Is THAT who that was? He's got so much moustache now!", 'Happy'],
    ],
    c2_hana_page: [
      ['hana', "It's lit! With no fire in it! I held a bun up to it. Didn't even toast. What IS it, love?", 'Cheer'],
      ['mika', "Electricity. From Ōta's wheel, down a wire Rin strung across with the ferry rope."],
      ['hana', "From ŌTA'S wheel? I'm baking by that old radish's light? …Don't you dare tell him I said thank you.", 'Talk'],
      ['hana', "Here. Your grandmother lent my mother her jam recipe in 1985. There's a page of her old diary tucked in it. Take both home."],
      ['hana', "The Forest Lamp is up at the shrine. I've opened the upper orchard gate for you. Nobody's been up since Old Kiku retired."],
    ],

    // ---- chapter 3: autumn, the forest, Grandma's soup
    // new id: the chapter opens with Grandma's autumn list (c3.fox enter), so the soup list and Kon are set up
    c3_start: [
      ['narrator', "Autumn. Grandma's new list comes wrapped round a rice ball."],
      ['mika', "'Chestnuts, mushrooms, honey, for my soup. Your what-tricity for the Forest Lamp. The rice ball is for Kon.' …Who's Kon?"],
      ['tamo', "No idea! But the Forest Lamp is up at the shrine, past Hana's orchard gate. Let's go and find out!", 'Happy'],
    ],
    c3_fox: [
      ['tamo', 'Mika! A fox! A fox in a little red bib! It wants us to follow it!', 'Happy'],
      ["mika", "His bib says Kon. Grandma packed this rice ball for you! Where are you taking us?"],
    ],
    c3_bear: [
      ['mika', "There's a note on the shrine board. From Old Kiku."],
      ['kiku', 'To whoever comes after me: if Ōkuma sleeps on the steps, he is waiting for a snack. He is a bear of simple wishes.'],
      ['kiku', 'He is fond of honey chestnuts. Three chestnuts, two mushrooms, one honeycomb, and a little patience at the pot.'],
      ['mika', "That's… Grandma's soup list. Exactly. She's going to have to share."],
    ],
    c3_cooked: [
      ['tamo', 'It smells like autumn in a bowl. If I had a stomach, it would be growling.', 'Happy'],
      ['tamo', "Mika, across the river! A sign with a bear carved on it, by that old slope. Can we look? The bear isn't going anywhere."],
    ],
    c3_landslide: [
      ['mika', "'Path moved. Mind the bear. — G.' Genzo carved this?"],
      ['mika', "The hillside slid down here in last year's flood. One year on, it's all moss and wildflowers."],
      ['tamo', 'Sora says the river likes to move the furniture about. So everybody just builds a new path. That\'s the valley.'],
    ],
    c3_lamp: [
      ['tamo', 'Up it goes! Twist, twist… click! The tallest lamp in the valley, and I carried the bulb. No ladder!', 'Happy'],
      ['tamo', "And this one kept the best memory of all. Mine! I used to nap in the Viaduct Lamp's oil-house. Warm as toast."],
      ['tamo', 'Then the flood took the oil, so Sora carried me home in her soup basket. So I would not get bored.'],
      ['mika', 'And you slept in her chest all year.'],
      ['tamo', 'Next to the toffee. Best nap of my life.', 'Happy'],
    ],
    c3_page: [
      ['narrator', "Tucked behind the Forest Lamp, where Old Kiku kept it safe: another page of Grandma's star diary."],
      ['mika', "'Kiku says I may leave this page up here, so the forest can read it.' Grandma, you were so weird. I love it."],
    ],

    // ---- chapter 4: winter, the Star Train comes home (no secret, no choice)
    c4_start: [
      ['narrator', 'Winter. Snow on the rails, and the stars fall tomorrow night.'],
      ["tamo", "Snow on the viaduct, snow on the sleepers. Mika, where does Genzo keep a whole train warm?"],
      ["mika", "The engine shed. Grandma takes him tea when he works on Kobo. Come on, I know the way."],
    ],
    // new id: the c4.shed talk (replaces c4_confront in this story)
    c4_shed: [
      ['genzo', 'She\'s ready. Boiler, brakes, lanterns, the lot. I could take the Star Train out tomorrow night.', 'Cheer'],
      ['genzo', "But the viaduct. Three beams, where the flood borrowed the middle. That's a job for two villages, not one old man.", 'Talk'],
      ['mika', "Grandma's list says 'help Genzo'. It doesn't say 'let Genzo be stubborn'."],
      ['genzo', "…It's underlined, isn't it.", 'Sad'],
      ['genzo', "Fine. FINE. Bring Ōta and Hana to the platform tonight. I'll… ask. And take this diary page. Sora lost it to me at shogi.", 'Talk'],
    ],
    c4_confront: [
      ['genzo', "Sora's girl. And that little light. Come in, shut the door, Kobo hates a draught.", 'Talk'],
      ['genzo', "Kobo's ready, but the viaduct needs three new beams. That's a job for two villages, not one old man.", 'Talk'],
      ['genzo', "Fine. Bring Ōta and Hana to the platform tonight. I'll… ask. And take this diary page. Sora lost it to me at shogi.", 'Talk'],
    ],
    // unreachable in this story (no choice), kept harmless in case anything still asks for them
    c4_choice_alone: [['genzo', 'Tonight, on the platform. Bring Ōta and Hana. And a bun. For courage.', 'Talk']],
    c4_choice_together: [['genzo', 'Tonight, on the platform. Bring Ōta and Hana. And a bun. For courage.', 'Talk']],
    c4_gather_ota: [
      ['ota', 'A meeting? At the station? For Genzo? …I was going anyway. Somebody has to bring a decent pickle.', 'Talk'],
    ],
    c4_gather_hana: [
      ['hana', "Genzo asked for us? GENZO? …I was coming anyway, love. I'll bring a very large basket of buns. For courage.", 'Talk'],
    ],
    // new id: the happy meeting on the platform (c4.meeting plays it instead of the classic sayChoice)
    c4_meeting: [
      ["genzo", "The viaduct needs three beams. I can get Kobo ready, but I could use a hand with the bridge.", "Bow"],
    ],
    c4_meeting_alone: [
      ["genzo", "The viaduct needs three beams. I can get Kobo ready, but I could use a hand with the bridge.", "Bow"],
    ],
    c4_meeting_together: [
      ["genzo", "The viaduct needs three beams. I can get Kobo ready, but I could use a hand with the bridge.", "Bow"],
    ],
    c4_meeting_after: [
      ['ota', "Kawabe has seasoned timber at the mill. Best in the valley. We'll carry the beams.", 'Talk'],
      ['hana', "Takamori's smithy has the bolts. AND we'll carry the beams. More of them.", 'Talk'],
      ['sora', "Mi-chan swings the hammer. I'll bring soup. Nobody argues with the soup.", 'Talk'],
      ['genzo', 'Timber from Kawabe, iron from Takamori, and a girl with a hammer. The viaduct, first thing, Mika.', 'Talk'],
    ],
    c4_repaired: [
      ['genzo', 'Solid as the day she was built. Better, maybe.', 'Cheer'],
      ['genzo', "Tonight the stars fall. Go and switch on that last lamp. Kobo doesn't cross until all four are shining."],
    ],
    c4_lamp: [
      ['tamo', 'Mika. All four. Forest, Mill, Orchard… Viaduct. Look at them.', 'Happy'],
      ['tamo', 'No oil. No ladders. Just you, a wheel and a wire. …And me. Mostly me.'],
      ['tamo', "And that's Kobo's whistle! Everybody is at the station. Run, Mika, or Sora will take the good seat!"],
    ],
    c4_board: [
      ['genzo', 'All aboard the Star Train! Kawabe AND Takamori! No pushing! Ōta, that means you!', 'Wave'],
      ['sora', "I'm riding up front with my granddaughter. All my life I've waved at this train. Never once from the cab.", 'Cheer'],
      ['genzo', "Because you touch everything. Fine. Mika—press {act} as each trackside lantern comes near. Light the way.", 'Talk'],
    ],
    sora_hint_board: [['sora', "Talk to Genzo, dear. He's been polishing that cap since Tuesday.", 'Talk']],
    c4_finale: [
      ['tamo', "Mika. Sora. I've decided. Somebody has to keep an eye on all these bulbs. I'm moving into the Viaduct Lamp!", 'Talk'],
      ['tamo', "Night Watchman of the Lights! Best view in the valley! And Sundays off, so I'll visit. You'll be sick of me!", 'Happy'],
      ['sora', "And I'll bring you tea on Sundays. You won't drink it. I'll bring it anyway.", 'Bow'],
      ['mika', 'Night Watchman Tamo. …Okay. Goodnight, Tamo. See you Sunday.'],
    ],
    // new id: the ending. Mika's parents step off the Star Train (after the farewell, before the sky train and photo)
    ending_parents: [
      ['mom', "Surprise! Hello, sweetheart. Oh, look at you. You've grown. You've got snow in your hair.", 'Wave'],
      ['dad', 'We were in the last coach the whole way. Your grandmother made us hide under a blanket. With the bun baskets.', 'Talk'],
      ['sora', 'I wrote to them in autumn. Four pages. Three were recipes. The fourth said: come for star-fall.', 'Cheer'],
      ["mika", "Mum! Dad! Come see Grandma's porch. She still tries to blow the bulb out at bedtime."],
    ],

    // ---- the parties (scenes.js slices these: keep the beats where they are)
    c1_party: [ // [0,3) the Blossom Wave · [3,…) the petal star
      ['rin', 'Grandpa! GRANDPA! The koi are jumping! Right over the wheel!', 'Cheer'],
      ['sora', "Music! Somebody play something. I'm going to dance, and nobody is going to stop me.", 'Cheer'],
      ['ota', "Sora, that isn't dancing. That's a heron having an argument.", 'Talk'],
      ['tamo', 'A rainbow! And look, Mika, the petals are making a star. It points across the river!', 'Happy'],
      ['sora', 'Underlined twice. Peaches. Jam. Get some sleep, Mi-chan. I need you rested.', 'Talk'],
    ],
    c2_party: [ // [0,2) fireflies · [2,4) floating sheep · [4,…) the lantern boat from Kawabe
      ['narrator', "The bell's last note rolls over the orchard, and every peach tree lights up like a paper lantern."],
      ['hana', 'Fireflies! Thousands of them! Somebody fetch the drums. The Firefly Festival starts NOW!', 'Cheer'],
      ['tamo', 'I may have twisted that bulb in a bit hard. …Why are the sheep floating?', 'Happy'],
      ['sora', "Never mind the sheep. Hana, the jam contest! You and I are judging. Ōta's entered again.", 'Cheer'],
      ['hana', "'ŌTA'S JAM. THE BEST.' …It's runny, Sora.", 'Cheer'],
      ['sora', 'Runny as ever. Second place, again. Somebody tell him gently. Not you, Hana.', 'Talk'],
    ],
    c3_party: [ // [0,3) the golden afternoon · [3,…) moon-viewing
      ['narrator', 'The Forest Lamp shines out over the treetops, and the whole wood answers.'],
      ['tamo', "Kodama! Forest spirits, hundreds of them! They're rattling their heads. That means hello!", 'Happy'],
      ['narrator', 'The maple leaves let go of their branches and flutter up the shrine steps as golden butterflies.'],
      ['sora', "Soup for everyone! Kon showed me where the chestnuts were. Ōkuma, you've had yours.", 'Cheer'],
      ['tamo', "It's a moon-viewing! Everybody sit! Kon, no, that's MY dumpling!", 'Happy'],
    ],
    c4_skytrain: [ // [0,1) the train of light · [1,2) the girl at the window · [2,…) everybody waves
      ['narrator', 'Then the falling stars gather, one by one, into a train of light that crosses the whole sky.'],
      ['genzo', "That's… the Star Train, in the sky. And at the window… a little girl with two plaits. Waving at us.", 'Wave'],
      ['sora', "Oh! That's me. Thirteen, the year I met Tamo. The stars never forget a good waver.", 'Cheer'],
      ['ota', 'Of course she is waving. She always waved first.'],
      ['hana', "Well, wave back, you old fools! Everybody wave! Mika's mum and dad too!", 'Cheer'],
    ],
    c4_photo: [ // [0,4) everyone squashes in · [4,…) just before the shutter
      ['hana', 'Three buns each. No arguments.', 'Cheer'],
      ['ota', 'Three? I only want one.', 'Talk'],
      ['hana', "You'll have three. You always have three.", 'Cheer'],
      ['rin', "Photo! Grandpa, smile. Genzo, you too! Mika, you're grinning like a trout. Keep it.", 'Cheer'],
      ['sora', 'Same time next year?', 'Wave'],
      ['mika', 'Obviously.'],
    ],

    // ---- epilogue
    epilogue: [
      ["narrator", "A year after Mika stepped off the train, she and Grandma sit on the porch shelling peas. This time Mika fills both bowls before Grandma can ask."],
      ['narrator', 'Spring comes back to Hoshi Valley. The Star Train runs every Sunday now, and Genzo lets Mika blow the whistle.'],
      ['narrator', "Mum and Dad went back to work with a jar of jam each. Their letters come every Friday. They've promised: next star-fall."],
      ['narrator', "Up on the bluff, Grandma's porch has a bulb of its own. She calls it 'the what-tricity' and switches it on herself. Loudly."],
    ],
    // unreachable in this story (no sayChoice), kept harmless
    epilogue_alone: [['narrator', 'On Sundays, Genzo saves Mika the seat up front. "Somebody has to keep your grandmother off the levers," he says.']],
    epilogue_together: [['narrator', 'On Sundays, Genzo saves Mika the seat up front. "Somebody has to keep your grandmother off the levers," he says.']],
    // new id: the epilogue porch talk with the happy twist (Grandma at home; the first talk with her in the epilogue)
    porch_talk: [
      ['sora', "Sit, sit. Tea. No, the other cup. That one's Tamo's. He won't drink it. It's the thought.", 'Talk'],
      ['sora', 'Fujita had lamp oil again by April. Six barrels. I could have had the lamps lit the old way any evening.', 'Talk'],
      ['mika', 'Then why me?'],
      ['sora', "Your mother wrote that you made a lamp out of a bicycle. I wanted to see what you'd make out of a valley.", 'Talk'],
      ['sora', "Thank you. Now. This spring the garden is yours and mine. I'll do the pointing. You do the digging.", 'Cheer'],
      ['tamo', "Can I help? I'll grow things with my light. Mostly I'll sit on them.", 'Happy'],
    ],
    porch_talk_solo: [
      ['sora', "Sit, sit. Tea. No, the other cup. That one's Tamo's. He won't drink it. It's the thought.", 'Talk'],
      ['sora', 'Fujita had lamp oil again by April. Six barrels. I could have had the lamps lit the old way any evening.', 'Talk'],
      ['mika', 'Then why me?'],
      ['sora', "Your mother wrote that you made a lamp out of a bicycle. I wanted to see what you'd make out of a valley.", 'Talk'],
      ['sora', "Thank you. Now. This spring the garden is yours and mine. I'll do the pointing. You do the digging.", 'Cheer'],
    ],
    // after Starfall Night (Mika may be anywhere): no letter, just the wish to go home and tell Grandma
    sora_last_letter: [
      ['mika', "Twelve stars. Every corner of the valley. Grandma's going to say she knew I could."],
      ['tamo', 'She did know! She told me so. She tells my lamp everything.', 'Happy'],
      ['mika', "Let's go home and tell her anyway. She'll want every detail. Twice."],
    ],
    sora_last_letter_solo: [
      ['mika', "Twelve stars. Every corner of the valley. Grandma's going to say she knew I could."],
      ['mika', "I'll go home and tell her anyway. She'll want every detail. Twice."],
    ],
    starfall: [
      ['narrator', "The last Fallen Star wakes in Mika's hands, and the whole sky answers."],
      ['narrator', 'Every star Grandma ever wished on comes out at once, and the constellations remember everyone Mika met.'],
    ],
    friends_all: [
      ['tamo', "That's everyone! Every creature in the valley knows your name now."],
      ['mika', "Grandma will say we've been properly introduced."],
    ],
    friends_all_solo: [
      ['narrator', 'Every creature in the valley has had a proper hello now. The ducks are still talking about it.'],
      ['mika', "Grandma will say we've been properly introduced."],
    ],
    gap_blocked: [['tamo', "That's the bit the flood borrowed. Don't even THINK about jumping."]],

    // ---- the treasure hunt (epilogue): things Grandma lost around the valley over sixty years
    hunt_offer: [
      ['tamo', "Psst. Sora's been leaving bits of her story all over this valley for sixty years. Rooftop notes, a music box, keepsakes in every home…", 'Talk'],
      ['tamo', 'She calls them treasures. Want to go treasure hunting too? I can make them twinkle for you!', 'Happy'],
      { id: 'hunt', choice: [
        { text: '"Yes! Let\'s find every treasure!"', value: 'yes' },
        { text: '"Just the stars for now."', value: 'no' },
      ] },
    ],
    hunt_offer_end: [
      ['tamo', "The stars are home! But Sora's lost treasures are still hiding out there. One last adventure?", 'Happy'],
      { id: 'hunt', choice: [
        { text: '"Yes! Let\'s find every treasure!"', value: 'yes' },
        { text: '"Not now. I just want to wander."', value: 'no' },
      ] },
    ],
    hunt_done: [
      ['tamo', "That's EVERY treasure. Every note, every keepsake, the music box, the kite, the tree… Sora will be SO smug.", 'Happy'],
      ['mika', "Sixty years of Grandma, all over the valley. I found it all in one spring. I'm telling her right now."],
    ],

    // ---- rewards
    music_box: [
      ['narrator', "Grandma's music box, dropped off the viaduct the summer she turned twenty. A tiny Kobo circles a tiny track, and her lullaby plays."],
      ['narrator', 'For a moment the riverbank fills with golden light: young Sora, young Genzo and young Ōta, dancing at the Star Train festival.'],
      ['mika', "Grandma's told me about this box. Three times. She'll squeak. Then she'll say she didn't."],
      ['tamo', "And that's me, on Sora's shoulder! I was very handsome.", 'Happy'],
    ],
    music_box_solo: [
      ['narrator', "Grandma's music box, dropped off the viaduct the summer she turned twenty. A tiny Kobo circles a tiny track, and her lullaby plays."],
      ['narrator', 'For a moment the riverbank fills with golden light: young Sora, young Genzo and young Ōta, dancing at the Star Train festival.'],
      ['mika', "Grandma's told me about this box. Three times. She'll squeak. Then she'll say she didn't."],
      ['mika', 'Look at them dancing. And they still do. Just slower.'],
    ],
    star_tree: [
      ['narrator', "Mika presses the golden acorn into the soil of Grandma's garden. The ground glows, and something stirs."],
      ['narrator', 'A young tree rises up in a spiral of light, its leaves shining like small stars.'],
      ['tamo', 'A star-tree! Sora is going to LOVE this. I love this. I live here now. On Sundays.', 'Happy'],
    ],
    star_tree_solo: [
      ['narrator', "Mika presses the golden acorn into the soil of Grandma's garden. The ground glows, and something stirs."],
      ['narrator', 'A young tree rises up in a spiral of light, its leaves shining like small stars.'],
      ['mika', "A star-tree, in Grandma's garden. She's going to make me water it. Every single day."],
    ],
    compass_found: [
      ['narrator', 'Something heavy is tangled in the line: a brass pocket compass whose needle is a little gold star.'],
      ['tamo', "It's pointing at a Fallen Star! It's Sora's star compass! She lost it fishing in 1979!", 'Happy'],
      ['mika', "Then it can help us find every star. Grandma's going to want it back. After."],
    ],
    compass_found_solo: [
      ['narrator', 'Something heavy is tangled in the line: a brass pocket compass whose needle is a little gold star.'],
      ['mika', "The needle points… at a Fallen Star. Grandma's star compass! She said she lost it fishing in 1979."],
    ],
    // Sky Letters: notes young Sora tucked on the roofs (read aloud, not voiced by Grandma)
    sky_letter_1: [
      ['narrator', "A note under a slate, in pencil: 'I climbed the station roof to wave at Kobo. Genzo's dad nearly fainted. Worth it. — Sora, 12'"],
      ['mika', "Twelve. She did this at twelve. I'm doing it at thirteen with a flying machine. Close enough."],
    ],
    sky_letter_2: [
      ['narrator', "A note pinned under the eaves: 'From up here both villages hold hands across the river. They just don't know it yet. — Sora'"],
      ['mika', 'They know now. They just argue while they hold hands.'],
    ],
    sky_letter_3: [
      ['narrator', "A note in a jam jar: 'Ōta says the mill wheel sings. It doesn't. That's Ōta, humming. I will never tell him I know. — S.'"],
      ['mika', 'Sixty years, and she never told him. Respect.'],
    ],
    sky_letter_4: [
      ['narrator', "A note taped to the lamp's cap: 'Goodnight, Tamo. Same time tomorrow. Here's a toffee for later. — Sora, 13'"],
      ['tamo', 'MY toffee! Sixty years I\'ve been saving it! …It\'s gone a bit hard.', 'Happy'],
    ],
    sky_letter_4_solo: [
      ['narrator', "A note taped to the lamp's cap: 'Goodnight, Tamo. Same time tomorrow. Here's a toffee for later. — Sora, 13'"],
      ['mika', "There's still a toffee taped under it. Very old. I'll leave it here for Tamo."],
    ],
    sky_letter_5: [
      ['narrator', "A note under a roof tile: 'The forest is older than all of us. When I feel small I come up here and be small with it. — Sora, 13'"],
      ['mika', 'Grandma at thirteen, on a roof, feeling small. Same, Grandma. Same.'],
    ],
    letters_all: [
      ['mika', 'Five notes, five roofs. Grandma climbed every one of these before she was fourteen.'],
      ['mika', "No wonder her knees are tired. I'm telling her I found them all. She'll be unbearable."],
    ],
    gift_ota: [['ota', "Radish. For your grandmother, who says it's too salty, and for you, who hasn't said so yet. — Ōta"]],
    gift_hana: [['hana', 'Buns for the girl who brought the light, and for her grandmother! Three each. You know why. — Hana']],
    gift_genzo: [['genzo', 'My old cap. Kobo needs a junior driver on Sundays. Your grandmother is NOT allowed in the cab. — Genzo']],
    home_full: [
      ['mika', 'A lure, radish, buns, a pine cone, honey, a cap… Grandma says the cottage has never been this full.'],
      ['mika', "She says it like a complaint. She's smiling."],
    ],

    // ---- homes, keepsakes and the Star Kite (any chapter: true whether Grandma is in or out)
    inside_cottage: [
      ['mika', "Grandma's kitchen. Forty teacups, one kettle, a calendar from 1994, and a pot of soup that's never empty."],
      ['tamo', 'I know this room! It smells like toast and Sora. Mostly toast. Also soup.'],
    ],
    inside_cottage_solo: [
      ['mika', "Grandma's kitchen. Forty teacups, one kettle, a calendar from 1994, and a pot of soup that's never empty."],
      ['mika', 'Does Grandma ever throw anything away? …Good. Neither will I.'],
    ],
    keepsake_recipe: [['mika', "'Three for Ōta. He'll say he only wants one.' …Some jokes in this valley are older than me."]],
    keepsake_float: [
      ['tamo', 'Ō and G… Ōta and Genzo! Two floats, tied together. They go fishing TOGETHER!'],
      ['mika', 'And argue the whole time about a trout from 1979. Grandma says it was a carp.'],
    ],
    keepsake_float_solo: [
      ['mika', 'Ō and G, tied together with twine. Ōta and Genzo still go fishing together.'],
      ['mika', 'And argue the whole time about a trout from 1979. Grandma says it was a carp.'],
    ],
    kite_found: [
      ['mika', 'A kite? No, it has propellers. And a handlebar. And a note tied to the handlebar.'],
      ['narrator', "'The Star Kite. It goes where my knees won't. It comes when you whistle. Hold on tight, and don't tell Genzo. — Grandma'"],
      ['tamo', 'Sora built a FLYING machine! No what-tricity, just wind and stubbornness. G flies, Space climbs, C dives, Shift is fast.', 'Happy'],
    ],
    kite_found_solo: [
      ['mika', 'A kite? No, it has propellers. And a handlebar. And a note tied to the handlebar.'],
      ['narrator', "'The Star Kite. It goes where my knees won't. It comes when you whistle. Hold on tight, and don't tell Genzo. — Grandma'"],
      ['narrator', 'Press G to whistle for the kite. Space climbs, C dives, Shift goes faster, G lands. Genzo need never know.'],
    ],
  },

  // ---------------------------------------------------------------------------------------------- chatter
  // talkFor() rotates these across every chapter: each line must be true at any point of the story.
  CHATTER: {
    villager: [["Sora's granddaughter! You've got her walk."], ['Star Festival this winter, they say.'], ["Hoshi Valley's small. Everybody knows everybody's business."], ['Mind the crows.'], ['They say the stars fall in winter.'], ["Your grandma's soup is the best in the valley. Don't tell Hana."], ['The flood took my gate last autumn. Good riddance. It squeaked.']],
    sora: [
      ['Eat something. You look like a sparrow in a raincoat.'],
      ['My knees say rain. My knees are wrong half the time. The other half, take a coat.'],
      ["Genzo cheats at shogi. I cheat better. That's called friendship."],
      ['A good soup is like a village. Everything in it, and nobody in charge.'],
      ['Have you written to your parents? Write. A short letter is still a letter.'],
      ["In 1968 I fell in that river. We're still not speaking, the river and I."],
      ["Ōta and Hana have argued about buns since before you were born. Don't you dare fix it."],
      ["Look up now and then, Mi-chan. That's the whole secret. That, and salt."],
      ["Electricity, you call it. I call it the what-tricity. It hasn't complained yet."],
      ["Rice ball? Pickle? Tea? I'm doing my rounds. Half this valley forgets to eat without me."],
    ],
    genzo: [
      ["Kobo runs better than I do. Don't tell her."],
      ['Mind the tracks, girl.'],
      ['Your grandmother brings me tea every Friday. Then she beats me at shogi. Every Friday.'],
      ["Cold on the platform, warm in the cab. That's railways."],
      ['You walk like her, you know. Same stubborn chin.'],
    ],
    ota: [
      ['Hmph.'],
      ["Hana's jam is too sweet. Her buns are… acceptable. Don't repeat that."],
      ['Three buns. I only ever want one. Somehow there are always three.'],
      ["Rin thinks I don't know she feeds that crab. I know."],
      ["Keep watch, girl. That's the whole job."],
    ],
    hana: [
      ['Have a bun! No? Have two!'],
      ['Flour in my hair, flour in my tea. Flour is a way of life, love.'],
      ['Ōta comes to my stall every festival. Three buns. Always three. Says he only wants one.'],
      ["My oven's older than the viaduct."],
      ['A bun is just a hug you can eat, sweetheart.'],
    ],
  },

  // ---------------------------------------------------------------------------------------------- Grandma's star diary
  // Same four pages, written by young Sora; given by Ōta (c1.page), Hana (c2.page), the forest lamp (c3.lamp), Genzo (c4.shed).
  JOURNAL: [
    { title: 'Page 1 · The Mill Lamp', text: "Spring. Ōta's father let me climb the ladder and light the Mill Lamp with a real match. Ōta said I'd set my plaits on fire. It was only my sleeve. Then a little star came out and sat on my thumb. His name is Tamo. — Sora, 13" },
    { title: 'Page 2 · Firefly Night', text: "Summer. Fireflies over the orchard and the Star Train all lit up. Genzo hung out of his father's cab and lost his cap in the river. Tamo and I laughed until we got hiccups. Stars get hiccups. — S." },
    { title: 'Page 3 · The Forest', text: "Autumn. Kiku (not old yet, she'd want me to say) let me sleep at the shrine. A bear snored on the steps all night, so we made honey chestnuts and waited. The forest lamp is for the animals too. — S." },
    { title: 'Page 4 · Star-fall', text: "Winter. Tamo has moved into the Viaduct Lamp for the season. He says it has the best view of the Star Train, and he comes home for toffee. Genzo says one day he'll drive the Star Train and I'll wave. Deal. — S." },
  ],

  // ---------------------------------------------------------------------------------------------- notes on the roofs
  SKY_LETTERS: [
    { id: 'station', name: 'On the station roof', say: 'sky_letter_1' },
    { id: 'belltower', name: 'On the bell-tower roof', say: 'sky_letter_2' },
    { id: 'mill', name: 'On the mill roof', say: 'sky_letter_3' },
    { id: 'viaduct', name: 'On top of the Viaduct Lamp', say: 'sky_letter_4' },
    { id: 'shrine', name: 'On the shrine roof', say: 'sky_letter_5' },
  ],

  // ---------------------------------------------------------------------------------------------- keepsakes and gifts
  KEEPSAKES: {
    photo: { where: "Grandma's cottage",
      text: "Sora, Genzo, Ōta and Hana, squashed onto Kobo's buffer beam at star-fall, the winter before the flood. On the back, in Sora's hand, their four names and 'Same time next year.'" },
    float: { text: 'Two cork floats, one red and one teal, tied together with twine and carved Ō and G. Ōta and Genzo still argue about which one caught the famous trout of 1979.' },
  },
  GIFTS: {},
  // optional: the treasure texts (classic says "used to hum")
  HUNT: { musicBox: { name: "Grandma's music box" } },
  TREASURES: {
    musicBox: { name: "Grandma's music box", text: 'A tiny Kobo circles a tiny track while it plays the lullaby Grandma hums when she cooks.' },
    acorn: { text: "Ōkuma's thank-you. Planted in Grandma's garden, it grew into a shining star-tree." },
    compass: { text: "Grandma's pocket compass, lost fishing in 1979. Its star needle always points to the nearest Fallen Star." },
  },

  // ---------------------------------------------------------------------------------------------- captions
  CAPTIONS: {
    arrival: [
      'Hoshi Valley: one railway, two villages, and four tall Star Lamps that nobody has lit since autumn.',
      'Last year the river came up for a visit. Nobody was hurt, but it left the valley rather rearranged.',
      'The young folk are away working in the city. The old folk manage by candle, cheerfully, and go to bed early.',
      'This evening, one little train brings one passenger up from the city: Mika, who is staying the year.',
      'With her grandmother, Sora. Who has a list of jobs. A long one.',
    ],
    ride: [
      { at: 0.02, text: 'For the first time since the flood, the Star Train pulls out of Hoshi Station.' },
      { at: 0.14, text: "Past Grandma's porch lamp and out onto the viaduct. Grandma waves at her own house. Twice." },
      { at: 0.32, text: 'Over Kawabe timber and Takamori iron, past the Viaduct Lamp, bright as noon. For once, Tamo is very quiet.' },
      { at: 0.52, text: 'In the first coach, Hana passes Ōta the bun basket. He says he only wants one. He takes three.' },
      { at: 0.7, text: 'Fireworks climb from Takamori to meet the falling stars. Rin cheers the loudest. Grandma is a close second.' },
      { at: 0.86, text: 'In the last coach, under a blanket, two passengers nobody mentioned are trying very hard not to wave.' },
    ],
    flight1: [
      { at: 0.06, text: 'The Mill Lamp shines without a flame, and all of Kawabe comes out onto the riverbank to stare at it.' },
      { at: 0.5, text: 'Blossoms ride the river all the way down the valley, like a letter nobody had to write.' },
    ],
    tour: [
      { at: 0.02, text: 'Sunday service. Kobo toots twice, huffs once, and rolls out with Mika up front, where the view is.' },
      { at: 0.2, text: "Down on the river, Rin's ferry is on its forty-second crossing today. She is counting. Out loud." },
      { at: 0.42, text: 'Across the viaduct, the Viaduct Lamp glows gold. Mika waves. The night watchman inside flickers back.' },
      { at: 0.62, text: 'Forest, Mill, Orchard, Viaduct: four lamps, one switch each. Not one has gone out since winter.' },
      { at: 0.82, text: 'Somewhere in Kawabe, Ōta waves at the train, then pretends he was swatting a fly.' },
    ],
    flight4: [
      { at: 0.05, text: 'Four lamps, one valley, and a train made of starlight.' },
      { at: 0.4, text: 'Below, every window in Kawabe and Takamori is lit. The whole valley stayed up for this.' },
      { at: 0.75, text: 'Down on the platform, Grandma is already planning next year. Out loud.' },
    ],
    theEnd: [
      { at: 0.05, text: 'Twelve Fallen Stars, home again. Four Star Lamps, bright at the flick of a switch.' },
      { at: 0.42, text: 'Two villages that argue about buns. One little red engine, running on time.' },
      { at: 0.75, text: 'One grandmother on her porch, and one star spirit who visits every Sunday.' },
    ],
  },

  // ---------------------------------------------------------------------------------------------- step overrides
  // Same ids, places, items and mechanics as classic; only words, c4.shed's done rule, and the choice-free scenes change.
  STEPS: {
    'c3.fox': { objective: "Grandma's list: soup from the forest. Go through the upper orchard gate",
      enter: [{ chapter: 3 }, { time: 10 }, { season: 'autumn' }, { title: 3 }, { say: 'c3_start' }] },
    'c3.landslide': { objective: 'Cross the stepping stones and read the bear sign on the old slope' },
    'c1.rinPlan': { objective: 'Tell Rin what her grandpa said' },
    'p.cottage': { objective: "Walk up the bluff to Grandma's cottage" },
    'p.chest': { objective: "Open Grandma's old chest on the porch", talk: { sora: 'sora_hint_chest' },
      exit: [{ cutscene: 'tamoWakes' }, { say: 'p_chest' }, { flag: 'hasTamo' }, { say: 'p_spark_tutorial' }] },
    'p.porch': { objective: "Grandma's first job: walk up to the porch lamp and press {act}", talk: { sora: 'sora_hint_porch' },
      exit: [{ say: 'p_letter' }, { say: 'p_spark_done' }, { autosave: true }] },
    'c1.rin': { objective: "Grandma's list: look round Kawabe, then find Rin at the dock" },
    'c1.ota': { objective: "Grandma's list: ask Grandpa Ōta about the Mill Lamp" },
    'c1.fish': { objective: "Grandma's list: trout for Ōta. Catch three fish from the dock ({fish}/3)" },
    'c1.cogs': { objective: "Grandma's list: find the three mill cogs the flood carried off ({cog}/3)" },
    'c1.wheel': { objective: "Grandma's list: fit the cogs and the dynamo to the mill wheel" },
    'c1.lamp': { objective: "Grandma's list: cross to the island, fit the new bulb and switch on the Mill Lamp" },
    'c2.ferry': { objective: "Grandma's list: cross the river on Rin's ferry" },
    'c2.hana': { objective: "Grandma's list: help Hana at the Takamori bakery" },
    'c2.peaches': { objective: "Grandma's list: ripe peaches for Hana and the jam ({peach}/5)" },
    'c2.lamp': { objective: "Grandma's list: fit the new bulb and switch on the Orchard Lamp on the bell tower" },
    'c3.gather': { objective: "Grandma's list: 3 chestnuts ({chestnut}/3), 2 mushrooms ({mushroom}/2) and a honeycomb ({honeycomb}/1)" },
    'c3.lamp': { objective: "Grandma's list: climb the shrine steps, fit the new bulb and switch on the Forest Lamp" },
    'c4.shed': { objective: "Grandma's list: help Genzo. He's at the engine shed", done: { event: 'talk', who: 'genzo' }, talk: { genzo: 'c4_shed' } },
    'c4.gather': { objective: "Grandma's list: invite Grandpa Ōta and Hana to the station" },
    'c4.meeting': {
      exit: [{ cutscene: 'meeting' }, { say: 'c4_meeting' }, { say: 'c4_meeting_after' }, { timelapse: 10 }, { spawn: 'repair' }],
    },
    'c4.repair': { objective: "Grandma's list: mend the viaduct. Set the three new beams ({beams}/3)" },
    'c4.lamp': { objective: "Grandma's list: walk to the Viaduct Lamp, fit the last bulb and switch it on" },
    'c4.board': { objective: "Grandma's list: ride the Star Train! Board at Hoshi Station", talk: { genzo: 'c4_board', sora: 'sora_hint_board' } },
    'c4.ride': {
      exit: [{ cutscene: 'finale' }, { say: 'c4_finale' }, { cutscene: 'farewell' }, { flag: 'tamoHome' }, { say: 'ending_parents' }, { cutscene: 'celebrate:4' }],
    },
    'e.free': {
      hunt: "Find all 12 Fallen Stars ({stars}/12), then Grandma's treasures ({found}/{total})",
      enter: [{ chapter: 5 }, { time: 10 }, { season: 'spring' }, { title: 5 }, { say: 'epilogue' }, { cutscene: 'tamoReturns' }, { flag: 'tamoBack' }, { cutscene: 'huntAsk' }, { autosave: true }],
    },
    'e.done': { hunt: "Treasure hunt: find Grandma's hidden treasures ({found}/{total})" },
  },
};
