// "A Year with Grandma": the default story (docs/STORY-GRANDMA.md). Plain data, no imports.
// Merged over the classic tables in ../story.js by ./index.js (useStory): DIALOGUE, CHATTER, CAPTIONS override by id or
// key; JOURNAL and SKY_LETTERS replace the classic lists; KEEPSAKES, GIFTS and STEPS override fields by id.
//
// Where Grandma Sora can SPEAK (she is on screen): p.arrive (station platform, with Genzo), p.cottage, p.chest and
// p.porch (at the cottage), every chapter party and its photo, c4.meeting (platform), c4.board and c4.ride (the Star
// Train), the ending, and the epilogue (home at the cottage). Everywhere else she is only mentioned, or leaves notes
// (read by the narrator or Mika, never voiced by 'sora'). Mika's parents (mom, dad) speak only in the ending.
// Nobody is at fault for anything: the viaduct simply got old, and the valley mends it together.

export const STORY = {
  id: 'grandma',

  CAST: {
    sora: { name: 'Grandma Sora', color: '#c0587a', pitch: 0.95 },
    mom: { name: 'Mum', color: '#3a9a7a', pitch: 1.1 },
    dad: { name: 'Dad', color: '#4f6fb0', pitch: 0.82 },
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
    trick_dew_intro: [
      ['sora', "Up before the sun tomorrow, Mi-chan. The forest edge on the west trail wears its jewellery at dawn.", 'Talk'],
      ['mika', "Jewellery. In a forest. At five in the morning."],
      ['sora', "Spider webs, strung with dew. By day you'd walk straight past them. At sunrise every thread shines."],
      ['sora', "Keep the sun at your back and look low between the stems. Take your pictures, and leave each one be."],
    ],
    trick_roast_intro: [
      ['sora', "The rice is in and the straw is dry, Mi-chan. That means sweet potatoes out in the meadow.", 'Talk'],
      ['mika', "We have a microwave at home. It takes four minutes."],
      ['sora', "And tastes like four minutes. I light the straw, not you. You bury them in the ash and watch the colour."],
      ['sora', "Too soon and they're raw, too late and they're coal. Dig them out just right and share with the children."],
    ],
    trick_beetles_intro: [
      ['sora', "Summer dusk, Mi-chan. Time to lay the table for the beetles, up in the chestnut grove.", 'Talk'],
      ['mika', "Grandma. We are not inviting beetles to dinner."],
      ['sora', "Banana and a pinch of sugar, rubbed on the bark. Sleep on it, and at dawn we see who came."],
      ['sora', "A rhinoceros beetle if we're lucky. Lift him gently, say hello, and put him back on his tree."],
    ],
    trick_firefly_note: [
      ['narrator', 'In the jar-light, a folded paper by the path: a drawing of a small girl holding a jar of fireflies.'],
      ['sora', "\"Mi-chan, age four. She cried when we let them go, then waved goodbye to every one.\" I kept it for tonight.", 'Talk'],
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
      ['narrator', 'Hoshi Valley, on the last train of winter. Kobo, the little red valley engine, wheezes to a stop.'],
      ['sora', "Mi-chan! There she is! Genzo, look at her, she's enormous!", 'Wave'],
      ['mika', "Hi, Grandma. I'm the same height as at New Year."],
      ['sora', "Then I've shrunk. Come here. Hugs first, complaints later.", 'Cheer'],
      ['genzo', 'Hoshi Station. End of the line, and the end of my back. Whose idea were three suitcases?', 'Talk'],
      ['mika', "You're Genzo? Grandma's letters said you'd be grumpy."],
      ['genzo', "Hah! She wasn't wrong. She also says I cheat at shogi. That part is slander."],
      ['sora', "He cheats. I cheat better. Up the bluff, Mi-chan. I'll go ahead and put the kettle on.", 'Talk'],
      ['genzo', "I'll bring the bags. Slowly. Mind the fallen fence, girl. And keep off the old viaduct. It's crankier than I am."],
    ],
    p_cottage: [
      ['sora', 'There you are! I took the shortcut. There is no shortcut. I just walk with purpose.', 'Wave'],
      ['sora', "That's Kawabe down there. That's the river. That's where I fell in, 1968. The river won.", 'Talk'],
      ['mika', 'Your cottage smells like cedar and old tea.'],
      ['sora', "And soup. Always soup. Now come and help me with the chest on the porch. I've been saving it for you."],
    ],
    p_chest: [
      ['narrator', 'Inside the chest: a brass signal lantern with red glass, every letter Mika ever sent, and a tin of very old toffee.'],
      ['sora', "My lantern. Inside lives the friend I had when I was your age. Let's see if he remembers how to wake up.", 'Talk'],
      ['narrator', 'A little gold light tumbles out of the lantern. It is… snoring?'],
      ['tamo', '…mmh. Five more minutes, Sora…'],
      ['tamo', "Sora! It's you! You got… taller? No. Wrinklier! Definitely wrinklier!", 'Happy'],
      ['sora', 'Ten years asleep, and the first thing he does is insult me. Hello, Tamo.', 'Cheer'],
      ['mika', "Whoa—you're a… star? A talking star?"],
      ['tamo', "I'm a hoshibi! A star-fire! I'm Tamo! And who are YOU? You've got Sora's chin.", 'Talk'],
      ['sora', "This is Mika, my granddaughter. She's staying the whole year."],
      ['tamo', "A whole year? Then she's my new partner! You climbed all the lamp towers last time, Sora. Her turn!", 'Happy'],
      ['sora', 'My knees agree with him. For once.'],
    ],
    // classic: Sora's letter. Here Grandma explains it herself, on the porch.
    p_letter: [
      ['sora', 'Now listen, both of you. The valley has four Star Lamps: Forest, Mill, Orchard and Viaduct.', 'Talk'],
      ['sora', 'They light the way home after dark, and the way for the Star Train. On star-fall night it carried the whole valley.'],
      ['sora', 'Ten years ago the old viaduct got too tired for trains. No train, so we let the lamps sleep. Tamo too.'],
      ['sora', 'This winter I want that night back. The train needs all four lamps lit. One a season, Mi-chan. Mill Lamp first, in Kawabe.'],
      ['sora', "Mind, Ōta's water wheel makes the power that keeps the lamp towers burning. So it's the wheel first, then the lamps."],
      ['mika', "Me? Grandma, I've been here twenty minutes."],
      ['sora', "Twenty-one. Plenty. You'll meet everyone on the way. That's half the job anyway.", 'Cheer'],
      ['tamo', "I'll help! I'm very good with lamps. I think. It's been a while.", 'Happy'],
    ],
    p_spark_tutorial: [
      ['sora', 'Then practise. First job: light the porch lamp for me, dear. Tamo listens to you now.', 'Talk'],
      ['tamo', "Walk up to the porch lamp and press {act}. I'll do the rest. Pfft—like a sneeze, but useful!", 'Talk'],
    ],
    p_spark_done: [
      ['tamo', 'I did it! Did you see? Pfft! Spark! I am SO good at this.', 'Happy'],
      ['sora', 'Look at that. Supper, then bed. Tomorrow, Kawabe. I have written you a list.', 'Cheer'],
      ['mika', 'Of course you have. What comes first?'],
      ['sora', "Rin, at the Kawabe dock. She's about your age, and she knows everyone. Tell her I sent you.", 'Talk'],
      ['sora', "No rush, mind. Have a wander round the village first. Say hello, peek in the shops. A list is not a race."],
      ['tamo', 'Kawabe! The river village! …Which way is Kawabe?'],
      ['sora', "Downhill, Tamo. Everything is downhill from here. That's why I need her.", 'Talk'],
    ],
    // Grandma's hints while she waits at the cottage (new ids: step talk on p.chest and p.porch)
    sora_hint_chest: [['sora', 'The chest, dear. On the porch. Lift the lid for me. My back has opinions about lids.', 'Talk']],
    sora_hint_porch: [['sora', 'The porch lamp, Mi-chan. Walk up to it and press {act}. Tamo does the clever part.', 'Talk']],

    // ---- chapter 1: spring, Kawabe, the stuck wheel
    c1_rin_meet: [
      ['rin', "Hey! You're standing on my fishing spot. Also you're scaring the trout.", 'Talk'],
      ['mika', "Sorry. I'm Mika. My grandma said to find you. She said, 'Tell her I sent you.'"],
      ['rin', "…Oh. YOU'RE Sora's Mika. She's told me about you. Fourteen times. Not that I was counting.", 'Talk'],
      ['rin', "She says we're going to be friends. I said I'd decide that myself. So. Still deciding."],
      ['mika', "Fair. Meanwhile, I'm supposed to light the Mill Lamp. Who do I ask?"],
      ['rin', "My grandpa, Ōta. He's at the mill, upriver. He'll say no. He says no to everything before lunch."],
      ['tamo', "(whispering) She likes you. I can tell. She's still talking."],
    ],
    c1_ota_refuse: [
      ['ota', 'Hm? A city girl in a raincoat. The mill is closed. The lamp is closed. Everything is closed.', 'Idle'],
      ['mika', "I'm Sora's granddaughter. She asked me to light the Mill Lamp."],
      ['ota', 'Sora sent you. Of course she did. That woman gives orders like a general.', 'Talk'],
      ['ota', "The lamp's out on the island, and the drawbridge only comes down when the wheel turns. The wheel is resting."],
      ['mika', 'Resting?'],
      ['ota', "Three cogs short. RESTING. And I don't need help, thank you. I need dinner that isn't pickled radish.", 'Talk'],
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
      ['ota', "This is Sora's doing. She's known about me and trout for sixty years. Fine. Find my three cogs and you may fix my wheel."],
      ['ota', "One fell in the reeds by the boathouse. Rin's cousins hid one on top of the crate stack, the rascals. And one…"],
      ['ota', '…one was stolen by a crab. Do not laugh. That crab is a menace.', 'Talk'],
    ],
    c1_wheel: [
      ['narrator', 'The cogs slide into place. The old axle groans, shudders… and the great wheel turns.', 'Hammer'],
      ['ota', '…It turns. Hah! Listen to her sing.', 'Wave'],
      ['ota', "Hear that hum? She's turning my dynamo. There's power on the lamp line again, all the way down the valley."],
      ['ota', "There goes the drawbridge. The island's yours, Sora's girl. Light it at sundown—that's when a lamp earns its keep."],
      ['ota', 'And tell your grandmother I fixed it myself. Mostly.', 'Talk'],
    ],
    c1_lamp: [
      ['tamo', "The lamp! It's so warm. Oh! Lamps keep memories, Mika. This one is showing me one!", 'Happy'],
      ['tamo', 'A girl with two plaits, lighting this very lamp. She set her sleeve on fire, just a bit, and laughed till she fell over.'],
      ['mika', 'Grandma?'],
      ['tamo', 'Grandma! She was thirteen, same as you. She was terrible at it. Then she was wonderful.', 'Happy'],
    ],
    c1_ota_page: [
      ['ota', 'Look at it. The Mill Lamp, burning again. Your grandmother is going to be unbearable about this.', 'Talk'],
      ['ota', "Here. She lent me this page of her diary in 1971, to prove it was her sleeve that caught fire, not her plaits.", 'Talk'],
      ['ota', "She won. Give it back to her. She'll read it to you tonight, with voices. Mine is NOT that squeaky."],
      ['narrator', "A page from Grandma's star diary, in a girl's careful handwriting. Mika tucks it into her journal."],
      ['ota', 'The next lamp downriver is Takamori\'s. Rin will ferry you over. Say hello to the bun woman. Not from me.'],
    ],

    // ---- chapter 2: summer, Takamori, peaches for the festival
    c2_arrive: [
      ['tamo', 'Takamori! Look at all those peach trees. The Orchard Lamp must be up there somewhere.', 'Happy'],
      ['mika', "Grandma's list says: help Hana, peaches for the jam, light the Orchard Lamp. In that order. Underlined."],
      ['tamo', "Sora always underlines. Once she underlined a whole page. It just said 'NO.'"],
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
      ['hana', "Here's the key, love. Climb up and ring the bell for me—it's been too quiet—then light that lamp.", 'Talk'],
    ],
    c2_lamp: [
      ['tamo', "The Orchard Lamp! It's kept a memory too. Look!", 'Happy'],
      ['tamo', 'The Star Train, all lit up, coming over the viaduct. And Sora on the platform, waving with both arms.'],
      ['tamo', 'A little boy in a cap hung out of the cab window, waving back. He waved so hard his cap fell in the river.'],
      ['mika', 'A boy in a cap… Genzo?'],
      ['tamo', "Is THAT who that was? He's got so much moustache now!", 'Happy'],
    ],
    c2_hana_page: [
      ['hana', "It's lit. It's really lit. Here—your grandmother lent my mother her jam recipe in 1985. We've kept it safe.", 'Talk'],
      ['hana', "Very safe. For forty years. There's a page of her old diary tucked in it. Take both home before I keep them longer."],
      ['hana', "The Forest Lamp is up at the shrine. I've opened the upper orchard gate for you. Nobody's been up since Old Kiku retired."],
    ],

    // ---- chapter 3: autumn, the forest, Grandma's soup
    // new id: the chapter opens with Grandma's autumn list (c3.fox enter), so the soup list and Kon are set up
    c3_start: [
      ['narrator', "Autumn. Grandma's new list comes wrapped round a rice ball."],
      ['mika', "'Chestnuts, mushrooms, honey, for my soup. Light the Forest Lamp. The rice ball is for Kon.' …Who's Kon?"],
      ['tamo', "No idea! But the Forest Lamp is up at the shrine, past Hana's orchard gate. Let's go and find out!", 'Happy'],
    ],
    c3_fox: [
      ['tamo', 'Mika! A fox! A fox in a little red bib! It wants us to follow it!', 'Happy'],
      ['mika', "A shrine bib, stitched 'Kon'. So YOU'RE Kon. Grandma sent you a rice ball."],
    ],
    c3_bear: [
      ['tamo', "Oh no. Oh no no no. That is the biggest bear in the whole world and it's asleep ON the stairs.", 'Sad'],
      ['mika', "There's a note on the shrine board. From Old Kiku."],
      ['kiku', 'To whoever comes after me: if Ōkuma sleeps on the steps, he is waiting for a snack. He is a bear of simple wishes.'],
      ['kiku', 'He is fond of honey chestnuts. Three chestnuts, two mushrooms, one honeycomb, and a little patience at the pot.'],
      ['mika', "That's… Grandma's soup list. Exactly. She's going to have to share."],
      ['tamo', 'A bear recipe! We can do that. Probably. The bees might not like it.'],
    ],
    c3_cooked: [
      ['tamo', 'It smells like autumn in a bowl. If I had a stomach, it would be growling.', 'Happy'],
      ['tamo', "Mika, across the river! A sign with a bear carved on it, by that old slope. Can we look? The bear isn't going anywhere."],
    ],
    c3_landslide: [
      ['mika', "'Path moved. Mind the bear. — G.' Genzo carved this?"],
      ['mika', "The hillside slid down here ages ago, after a big rain. Now it's all moss and wildflowers."],
      ['tamo', 'Sora says the river likes to move the furniture about. So everybody just builds a new path. That\'s the valley.'],
    ],
    c3_lamp: [
      ['tamo', 'The Forest Lamp! Oh, this one kept the best memory of all. Mine!', 'Happy'],
      ['tamo', "I didn't live in Sora's lantern. I lived in the Viaduct Lamp. She came up every night with tea. I don't drink tea."],
      ['tamo', 'When the Star Train stopped and the lamps went to sleep, she carried me home so I wouldn\'t be cold and lonely.'],
      ['mika', 'And you slept in her chest for ten years.'],
      ['tamo', 'Next to the toffee. Best nap of my life.', 'Happy'],
    ],
    c3_page: [
      ['narrator', "Tucked behind the Forest Lamp, where Old Kiku kept it safe: another page of Grandma's star diary."],
      ['mika', "'Kiku says I may leave this page up here, so the forest can read it.' Grandma, you were so weird. I love it."],
    ],

    // ---- chapter 4: winter, the Star Train comes home (no secret, no choice)
    c4_start: [
      ['narrator', 'Winter. Snow on the rails, and the stars fall tomorrow night.'],
      ['tamo', "One lamp left, on a bridge with a hole in it. And Sora's list says: help Genzo."],
      ['mika', "Grandma says he's polished Kobo every day for a month and won't say why. In this snow he'll be in the engine shed."],
    ],
    // new id: the c4.shed talk (replaces c4_confront in this story)
    c4_shed: [
      ['genzo', "Sora's girl. And that little light. Come in, shut the door, Kobo hates a draught.", 'Talk'],
      ['genzo', 'She\'s ready. Boiler, brakes, lanterns, the lot. I could take the Star Train out tomorrow night.', 'Cheer'],
      ['mika', 'But?'],
      ['genzo', "But the viaduct. Three beams, where the old span was taken down. That's a job for two villages, not one old man.", 'Talk'],
      ['tamo', 'So ask them!'],
      ['genzo', "Ask. Hah. I haven't asked anyone for anything in seventy years. Except Sora, for a shogi rematch. She said no.", 'ArmsCrossed'],
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
      ['narrator', 'Snow falls on Hoshi Station. Kawabe stands on one side of the platform, Takamori on the other, stamping their feet.'],
      ['sora', "Well? Go on, Genzo. We're all freezing in a very supportive way.", 'Talk'],
      ['genzo', "Right. Everyone. I have something to say. It's… hard. Hm.", 'Talk'],
      ['genzo', "The viaduct needs three new beams by tomorrow night, and I can't do it alone. …Please. Help me.", 'Bow'],
      ['sora', 'Seventy years, and you finally said please. Somebody write down the date.', 'Cheer'],
    ],
    c4_meeting_alone: [
      ['narrator', 'Snow falls on Hoshi Station. Kawabe stands on one side of the platform, Takamori on the other, stamping their feet.'],
      ['sora', "Well? Go on, Genzo. We're all freezing in a very supportive way.", 'Talk'],
      ['genzo', "Right. Everyone. I have something to say. It's… hard. Hm.", 'Talk'],
      ['genzo', "The viaduct needs three new beams by tomorrow night, and I can't do it alone. …Please. Help me.", 'Bow'],
      ['sora', 'Seventy years, and you finally said please. Somebody write down the date.', 'Cheer'],
    ],
    c4_meeting_together: [
      ['narrator', 'Snow falls on Hoshi Station. Kawabe stands on one side of the platform, Takamori on the other, stamping their feet.'],
      ['sora', "Well? Go on, Genzo. We're all freezing in a very supportive way.", 'Talk'],
      ['genzo', "Right. Everyone. I have something to say. It's… hard. Hm.", 'Talk'],
      ['genzo', "The viaduct needs three new beams by tomorrow night, and I can't do it alone. …Please. Help me.", 'Bow'],
      ['sora', 'Seventy years, and you finally said please. Somebody write down the date.', 'Cheer'],
    ],
    c4_meeting_after: [
      ['ota', "Kawabe has seasoned timber at the mill. Best in the valley. We'll carry the beams.", 'Talk'],
      ['hana', "Takamori's smithy has the bolts. AND we'll carry the beams. More of them.", 'Talk'],
      ['ota', 'You will not. Kawabe carries two.', 'Talk'],
      ['hana', 'Takamori carries two. Kawabe can carry the third and complain about it.', 'Cheer'],
      ['rin', "That's three beams and about forty beams' worth of arguing. Classic.", 'Talk'],
      ['tamo', "Everybody's helping! That's the BEST kind of arguing!", 'Happy'],
      ['sora', "Mi-chan swings the hammer. I'll bring soup. Nobody argues with the soup.", 'Talk'],
      ['genzo', 'Timber from Kawabe, iron from Takamori, and a girl with a hammer. The viaduct, first thing, Mika.', 'Talk'],
    ],
    c4_repaired: [
      ['genzo', 'Solid as the day she was built. Better, maybe.', 'Cheer'],
      ['genzo', "Tonight the stars fall. Go and light that last lamp. Kobo doesn't cross until all four are burning."],
    ],
    c4_lamp: [
      ['tamo', 'Mika. All four. Forest, Mill, Orchard… Viaduct. Look at them.', 'Happy'],
      ['tamo', "And that's Kobo's whistle! Everybody is at the station. Run, Mika, or Sora will take the good seat!"],
    ],
    c4_board: [
      ['genzo', 'All aboard the Star Train! Kawabe AND Takamori! No pushing! Ōta, that means you!', 'Wave'],
      ['sora', "I'm riding up front with my granddaughter. All my life I've waved at this train. Never once from the cab.", 'Cheer'],
      ['genzo', "Because you touch everything. Fine. Mika—press {act} as each trackside lantern comes near. Light the way.", 'Talk'],
    ],
    sora_hint_board: [['sora', "Talk to Genzo, dear. He's been polishing that cap since Tuesday.", 'Talk']],
    c4_finale: [
      ['narrator', 'The Star Train rolls in under a falling sky—one star, then ten, then a thousand.'],
      ['tamo', 'Mika. Sora. The Viaduct Lamp is my lamp. Now the train runs again, it needs its hoshibi. It needs me.', 'Talk'],
      ['mika', "You're going back into the lamp."],
      ['sora', "He was always going to, dear. Lamps need their stars.", 'Talk'],
      ['tamo', "It's not goodbye. It's goodnight! I'll be right up there. You keep watch too, okay? Somebody has to be looking.", 'Happy'],
      ['sora', "And I'll bring you tea on Sundays. You won't drink it. I'll bring it anyway.", 'Bow'],
      ['mika', "…Okay. I'll keep watch. Goodnight, Tamo."],
    ],
    // new id: the ending. Mika's parents step off the Star Train (after the farewell, before the sky train and photo)
    ending_parents: [
      ['narrator', 'The door of the last coach opens. Two people climb down, stiff from the ride, waving like they mean it.'],
      ['mika', '…Mum? DAD?'],
      ['mom', "Surprise! Hello, sweetheart. Oh, look at you. You've grown. You've got snow in your hair.", 'Wave'],
      ['dad', 'We were in the last coach the whole way. Your grandmother made us hide under a blanket. With the bun baskets.', 'Talk'],
      ['mika', 'You were supposed to be away until spring!'],
      ['sora', 'I wrote to them in autumn. Four pages. Three were recipes. The fourth said: come for star-fall.', 'Cheer'],
      ['mom', 'Your letters made it sound like the best place in the world. We had to see it for ourselves.', 'Talk'],
      ['dad', 'And meet this Tamo. Where is he?'],
      ['mika', "Up there. In the Viaduct Lamp. He's keeping watch."],
    ],

    // ---- the parties (scenes.js slices these: keep the beats where they are)
    c1_party: [ // [0,3) the Blossom Wave · [3,…) the petal star
      ['narrator', 'The light runs down the river like a wave, and every cherry tree in Kawabe blooms at once.'],
      ['rin', 'Grandpa! GRANDPA! The koi are jumping! Right over the wheel!', 'Cheer'],
      ['sora', "Music! Somebody play something. I'm going to dance, and nobody is going to stop me.", 'Cheer'],
      ['ota', "Sora, that isn't dancing. That's a heron having an argument.", 'Talk'],
      ['tamo', 'A rainbow! And look, Mika, the petals are making a star. It points across the river!', 'Happy'],
      ['mika', "To Takamori. That's next on Grandma's list."],
      ['sora', 'Underlined twice. Peaches. Jam. Get some sleep, Mi-chan. I need you rested.', 'Talk'],
    ],
    c2_party: [ // [0,2) fireflies · [2,4) floating sheep · [4,…) the lantern boat from Kawabe
      ['narrator', "The bell's last note rolls over the orchard, and every peach tree lights up like a paper lantern."],
      ['hana', 'Fireflies! Thousands of them! Somebody fetch the drums. The Firefly Festival starts NOW!', 'Cheer'],
      ['tamo', 'I may have sparked a little too hard. …Why are the sheep floating?', 'Happy'],
      ['sora', "Never mind the sheep. Hana, the jam contest! You and I are judging. Ōta's entered again.", 'Cheer'],
      ['narrator', 'Down on the river, one small lantern boat drifts over from Kawabe, carrying one jar of jam with a very large label.'],
      ['hana', "'ŌTA'S JAM. THE BEST.' …It's runny, Sora.", 'Cheer'],
      ['sora', 'Runny as ever. Second place, again. Somebody tell him gently. Not you, Hana.', 'Talk'],
    ],
    c3_party: [ // [0,3) the golden afternoon · [3,…) moon-viewing
      ['narrator', 'The Forest Lamp flares gold, and the whole wood answers.'],
      ['tamo', "Kodama! Forest spirits, hundreds of them! They're rattling their heads. That means hello!", 'Happy'],
      ['narrator', 'The maple leaves let go of their branches and flutter up the shrine steps as golden butterflies.'],
      ['narrator', 'Grandma has made it up the shrine path, one slow step at a time, with an enormous pot of soup.'],
      ['sora', "Soup for everyone! Kon showed me where the chestnuts were. Ōkuma, you've had yours.", 'Cheer'],
      ['mika', 'Look who came. Ōkuma, Kon, the deer… everyone.'],
      ['tamo', "It's a moon-viewing! Everybody sit! Kon, no, that's MY dumpling!", 'Happy'],
      ['sora', 'Bears at the back, foxes at the front. Everybody gets a bowl.', 'Talk'],
    ],
    c4_skytrain: [ // [0,1) the train of light · [1,2) the girl at the window · [2,…) everybody waves
      ['narrator', 'Then the falling stars gather, one by one, into a train of light that crosses the whole sky.'],
      ['genzo', "That's… the Star Train, in the sky. And at the window… a little girl with two plaits. Waving at us.", 'Wave'],
      ['sora', "Oh! That's me. Thirteen, the year I met Tamo. The stars never forget a good waver.", 'Cheer'],
      ['ota', 'Of course she is waving. She always waved first.'],
      ['hana', "Well, wave back, you old fools! Everybody wave! Mika's mum and dad too!", 'Cheer'],
    ],
    c4_photo: [ // [0,5) everyone squashes in · [5,…) just before the shutter
      ['hana', 'Three buns each. No arguments.', 'Cheer'],
      ['ota', 'Three? I only want one.', 'Talk'],
      ['hana', "You'll have three. You always have three.", 'Cheer'],
      ['dad', 'Is it always like this here?', 'Talk'],
      ['sora', "Every year. You'll get used to it. Now squash in, everybody, in front of Kobo!", 'Cheer'],
      ['rin', "Photo! Grandpa, smile. Genzo, you too! Mika, you're grinning like a trout. Keep it.", 'Cheer'],
      ['genzo', 'I AM smiling.'],
      ['sora', 'Same time next year?', 'Wave'],
      ['mika', 'Obviously.'],
    ],

    // ---- epilogue
    epilogue: [
      ['narrator', 'Spring comes back to Hoshi Valley. The Star Train runs every Sunday now, and Genzo lets Mika blow the whistle.'],
      ['narrator', "Mum and Dad went back to work with a jar of jam each. Their letters come every Friday. They've promised: next star-fall."],
      ['narrator', 'Kawabe and Takamori share one festival on the viaduct, and argue about the buns. Nobody wants them to stop.'],
      ['narrator', "Up on the bluff, Grandma's porch lamp burns every evening. Mika lights it. Grandma supervises, loudly."],
    ],
    // unreachable in this story (no sayChoice), kept harmless
    epilogue_alone: [['narrator', 'On Sundays, Genzo saves Mika the seat up front. "Somebody has to keep your grandmother off the levers," he says.']],
    epilogue_together: [['narrator', 'On Sundays, Genzo saves Mika the seat up front. "Somebody has to keep your grandmother off the levers," he says.']],
    // new id: the epilogue porch talk with the happy twist (Grandma at home; the first talk with her in the epilogue)
    porch_talk: [
      ['sora', "Sit, sit. Tea. No, the other cup. That one's Tamo's. He won't drink it. It's the thought.", 'Talk'],
      ['sora', "I have a secret, Mi-chan. A small one. Don't tell Genzo."],
      ['sora', "I could have asked anyone to help with the lamps. Ōta, Hana, even Rin. They'd all have said yes. Eventually.", 'Talk'],
      ['mika', 'Then why me?'],
      ['sora', 'Because I wanted you to meet everyone. And everyone to meet you. Now the valley is yours too.', 'Talk'],
      ['sora', "And I wrote to your parents in autumn, before you'd even lit the Forest Lamp. I knew you'd finish. You eat like me."],
      ['mika', "…Grandma, that's the sneakiest nice thing anyone has ever done for me."],
      ['sora', "Thank you. Now. This spring the garden is yours and mine. I'll do the pointing. You do the digging.", 'Cheer'],
      ['tamo', "Can I help? I'll grow things with my light. Mostly I'll sit on them.", 'Happy'],
    ],
    porch_talk_solo: [
      ['sora', "Sit, sit. Tea. No, the other cup. That one's Tamo's. He won't drink it. It's the thought.", 'Talk'],
      ['sora', "I have a secret, Mi-chan. A small one. Don't tell Genzo."],
      ['sora', "I could have asked anyone to help with the lamps. Ōta, Hana, even Rin. They'd all have said yes. Eventually.", 'Talk'],
      ['mika', 'Then why me?'],
      ['sora', 'Because I wanted you to meet everyone. And everyone to meet you. Now the valley is yours too.', 'Talk'],
      ['sora', "And I wrote to your parents in autumn, before you'd even lit the Forest Lamp. I knew you'd finish. You eat like me."],
      ['mika', "…Grandma, that's the sneakiest nice thing anyone has ever done for me."],
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
    gap_blocked: [['tamo', "That's where the old span was taken down. Don't even THINK about jumping."]],

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
      ['mika', "Grandma's told me about this box. Three times. She'll cry. Then she'll say she isn't crying."],
      ['tamo', "And that's me, on Sora's shoulder! I was very handsome.", 'Happy'],
    ],
    music_box_solo: [
      ['narrator', "Grandma's music box, dropped off the viaduct the summer she turned twenty. A tiny Kobo circles a tiny track, and her lullaby plays."],
      ['narrator', 'For a moment the riverbank fills with golden light: young Sora, young Genzo and young Ōta, dancing at the Star Train festival.'],
      ['mika', "Grandma's told me about this box. Three times. She'll cry. Then she'll say she isn't crying."],
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
    gift_hana: [['hana', 'Buns for the lamp-lighter and her grandmother! Three each. You know why. — Hana']],
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
      ['tamo', 'Sora built a FLYING machine! Press G to fly: Space climbs, C dives, Shift goes fast, and G lands.', 'Happy'],
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
    villager: [["Sora's granddaughter! You've got her walk."], ['Star Festival this winter, they say.'], ["Hoshi Valley's small. Everybody knows everybody's business."], ['Mind the crows.'], ['They say the stars fall in winter.'], ["Your grandma's soup is the best in the valley. Don't tell Hana."]],
    sora: [
      ['Eat something. You look like a sparrow in a raincoat.'],
      ['My knees say rain. My knees are wrong half the time. The other half, take a coat.'],
      ["Genzo cheats at shogi. I cheat better. That's called friendship."],
      ['A good soup is like a village. Everything in it, and nobody in charge.'],
      ['Have you written to your parents? Write. A short letter is still a letter.'],
      ["In 1968 I fell in that river. We're still not speaking, the river and I."],
      ["Ōta and Hana have argued about buns since before you were born. Don't you dare fix it."],
      ["Look up now and then, Mi-chan. That's the whole secret. That, and salt."],
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
    { title: 'Page 1 · The Mill Lamp', text: "Spring. The wheel hums, the lamps have power, and Ōta's father let me light the Mill Lamp. Ōta said I'd set my plaits on fire. It was only my sleeve. Then a little star came out and sat on my thumb. His name is Tamo. — Sora, 13" },
    { title: 'Page 2 · Firefly Night', text: "Summer. Fireflies over the orchard and the Star Train all lit up. Genzo hung out of his father's cab and lost his cap in the river. Tamo and I laughed until we got hiccups. Stars get hiccups. — S." },
    { title: 'Page 3 · The Forest', text: "Autumn. Kiku (not old yet, she'd want me to say) let me sleep at the shrine. A bear snored on the steps all night, so we made honey chestnuts and waited. The forest lamp is for the animals too. — S." },
    { title: 'Page 4 · Star-fall', text: "Winter. Tamo has moved into the Viaduct Lamp. He says the train needs him more than I do. I cried a bit. Genzo says one day he'll drive the Star Train and I'll wave. Deal. — S." },
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
      text: "Sora, Genzo, Ōta and Hana, squashed onto Kobo's buffer beam on the last star-fall the Star Train ran. On the back, in Sora's hand, their four names and 'Same time next year.'" },
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
      'Hoshi Valley: one railway, two villages, and four sleeping Star Lamps.',
      'Ten winters ago the old viaduct got too tired, and the Star Train stopped running.',
      'This evening, one little train brings one passenger up from the city.',
      'Her name is Mika. Her parents are working abroad, so she is staying the year.',
      'With her grandmother, Sora. Who has a list of jobs. A long one.',
    ],
    ride: [
      { at: 0.02, text: 'For the first time in ten years, the Star Train pulls out of Hoshi Station.' },
      { at: 0.14, text: "Past Grandma's porch lamp and out onto the viaduct. Grandma waves at her own house. Twice." },
      { at: 0.32, text: 'Over Kawabe timber and Takamori iron, past the Viaduct Lamp. For once, Tamo is very quiet.' },
      { at: 0.52, text: 'In the first coach, Hana passes Ōta the bun basket. He says he only wants one. He takes three.' },
      { at: 0.7, text: 'Fireworks climb from Takamori to meet the falling stars. Rin cheers the loudest. Grandma is a close second.' },
      { at: 0.86, text: 'In the last coach, under a blanket, two passengers nobody mentioned are trying very hard not to wave.' },
    ],
    flight4: [
      { at: 0.05, text: 'Four lamps, one valley, and a train made of starlight.' },
      { at: 0.4, text: 'Below, every window in Kawabe and Takamori is lit. The whole valley stayed up for this.' },
      { at: 0.75, text: 'Down on the platform, Grandma is already planning next year. Out loud.' },
    ],
    theEnd: [
      { at: 0.05, text: 'Twelve Fallen Stars, home again. Four Star Lamps, burning bright.' },
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
    'p.chest': { objective: "Open Grandma's old chest on the porch", talk: { sora: 'sora_hint_chest' } },
    'p.porch': { objective: "Grandma's first job: walk up to the porch lamp and press {act}", talk: { sora: 'sora_hint_porch' } },
    'c1.rin': { objective: "Grandma's list: look round Kawabe, then find Rin at the dock" },
    'c1.ota': { objective: "Grandma's list: ask Grandpa Ōta about the Mill Lamp" },
    'c1.fish': { objective: "Grandma's list: trout for Ōta. Catch three fish from the dock ({fish}/3)" },
    'c1.cogs': { objective: "Grandma's list: find the three lost mill cogs ({cog}/3)" },
    'c1.wheel': { objective: "Grandma's list: fix the mill wheel. It makes the valley's electricity" },
    'c1.lamp': { objective: "Grandma's list: the mill has power again. Cross to the island and light the Mill Lamp" },
    'c2.ferry': { objective: "Grandma's list: cross the river on Rin's ferry" },
    'c2.hana': { objective: "Grandma's list: help Hana at the Takamori bakery" },
    'c2.peaches': { objective: "Grandma's list: ripe peaches for Hana and the jam ({peach}/5)" },
    'c2.lamp': { objective: "Grandma's list: light the Orchard Lamp on the bell tower, so Takamori gets home safe" },
    'c3.gather': { objective: "Grandma's list: 3 chestnuts ({chestnut}/3), 2 mushrooms ({mushroom}/2) and a honeycomb ({honeycomb}/1)" },
    'c3.lamp': { objective: "Grandma's list: climb the shrine steps and light the Forest Lamp, for the forest path" },
    'c4.shed': { objective: "Grandma's list: help Genzo. He's at the engine shed", done: { event: 'talk', who: 'genzo' }, talk: { genzo: 'c4_shed' } },
    'c4.gather': { objective: "Grandma's list: invite Grandpa Ōta and Hana to the station" },
    'c4.meeting': {
      exit: [{ cutscene: 'meeting' }, { say: 'c4_meeting' }, { say: 'c4_meeting_after' }, { timelapse: 10 }, { spawn: 'repair' }],
    },
    'c4.repair': { objective: "Grandma's list: mend the viaduct. Set the three new beams ({beams}/3)" },
    'c4.lamp': { objective: "Grandma's list: walk to the Viaduct Lamp and light the last lamp, for the Star Train" },
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
