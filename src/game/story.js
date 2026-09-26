// Starline — the whole story as data. See docs/STORY.md for the bible.
// Pure module (no DOM/three): used by the quest engine, the director and the Node playthrough test.

export const CAST = {
  mika: { name: 'Mika', color: '#f2b53a', pitch: 1.18 },
  tamo: { name: 'Tamo', color: '#ffd45a', pitch: 1.6 },
  genzo: { name: 'Genzo', color: '#2d4a7a', pitch: 0.72 },
  rin: { name: 'Rin', color: '#1fa5a0', pitch: 1.25 },
  ota: { name: 'Grandpa Ōta', color: '#8a5a3a', pitch: 0.8 },
  hana: { name: 'Hana', color: '#e0567a', pitch: 1.05 },
  sora: { name: 'Sora', color: '#7a6ad8', pitch: 1.0 },
  kiku: { name: 'Old Kiku', color: '#6a8a4a', pitch: 0.95 },
  villager: { name: 'Villager', color: '#6b7a8a', pitch: 1 },
  narrator: { name: '', color: '#cbd5e1', pitch: 1 },
};

export const ITEMS = {
  cog: { name: 'Mill cog', icon: 'cog' },
  fish: { name: 'Fresh trout', icon: 'plate-trout' },
  plate: { name: 'Grilled trout', icon: 'plate-trout' },
  starfin: { name: 'Starfin', icon: 'fallen-star' },
  peach: { name: 'Peach', icon: 'peach' },
  bun: { name: 'Peach bun', icon: 'peach-bun' },
  key: { name: 'Bell-tower key', icon: 'key' },
  chestnut: { name: 'Chestnut', icon: 'chestnut' },
  mushroom: { name: 'Mushroom', icon: 'mushroom-item' },
  honeycomb: { name: 'Honeycomb', icon: 'honeycomb' },
  honeyChestnuts: { name: 'Honey chestnuts', icon: 'bowl-chestnuts' },
  timber: { name: 'Timber', icon: 'timber' },
  bolts: { name: 'Iron bolts', icon: 'iron-bolts' },
};

export const SEASON_OF_CHAPTER = ['spring', 'spring', 'summer', 'autumn', 'winter', 'spring'];
export const CHAPTERS = [
  { n: 0, title: 'Prologue', name: 'The Last Train of Winter', season: 'spring' },
  { n: 1, title: 'Chapter One · Spring', name: 'The Mill Lamp', season: 'spring' },
  { n: 2, title: 'Chapter Two · Summer', name: 'The Orchard Lamp', season: 'summer' },
  { n: 3, title: 'Chapter Three · Autumn', name: 'The Forest Lamp', season: 'autumn' },
  { n: 4, title: 'Chapter Four · Winter', name: 'The Viaduct Lamp', season: 'winter' },
  { n: 5, title: 'Epilogue', name: 'Keep Watch', season: 'spring' },
];

// ------------------------------------------------------------------------------------ dialogue
// Lines: [who, text, anim?]. A line may instead be { choice: [{ text, value }] }.
export const DIALOGUE = {
  p_arrive: [
    ['narrator', 'Hoshi Valley. The last train of the season wheezes to a stop.'],
    ['genzo', "Hoshi Station! End of the line, and the end of my patience with this cold.", 'Wave'],
    ['genzo', "…You must be Sora's granddaughter. Mika, isn't it?"],
    ['mika', "That's me. You're Genzo? Grandma's letters said you'd be grumpy."],
    ['genzo', "Hah! She wasn't wrong. You have her eyes, you know. Don't…", 'Sad'],
    ['genzo', "…Well. Here. The key to her cottage. It's up the bluff, by the viaduct.", 'Talk'],
    ['genzo', "Mind the fallen fence. And don't go poking at that bridge."],
  ],
  p_cottage: [
    ['mika', "Grandma's cottage… it smells like cedar and old tea."],
    ['mika', 'There was a chest by the porch in all her photos.'],
  ],
  p_chest: [
    ['narrator', 'Inside the chest: a brass hand lantern, a bundle of letters, and a folded note with your name on it.'],
    ['narrator', 'The lantern is warm. Something inside it is… snoring?'],
    ['tamo', '…mmh. Five more minutes, Sora…'],
    ['tamo', '!!! You are NOT Sora! Who are you? Where am I? Why is it so BRIGHT?', 'Happy'],
    ['mika', "Whoa—you're a… star? A talking star?"],
    ['tamo', "I'm a hoshibi! A star-fire! I'm Tamo! I think. Probably. It's all very fuzzy.", 'Talk'],
    ['tamo', 'I remember a lamp… and rain… and then a really long nap.', 'Sad'],
    ['mika', "There's a note from Grandma. Let's read it."],
  ],
  p_letter: [
    ['sora', 'Mika — if you are reading this, I am gone, and you have met Tamo. Be patient with him; he is braver than he looks.'],
    ['sora', 'The valley has four Star Lamps: Forest, Mill, Orchard and Viaduct. They went dark ten years ago, and the Star Train stopped coming.'],
    ['sora', 'Light them again before the stars fall this winter. Bring the Star Train home.'],
    ['sora', "And Mika: don't be angry with Genzo. He has carried enough."],
    ['mika', "…Angry with Genzo? Why would I be angry with Genzo?"],
    ['tamo', "Ooh, a mystery! I love mysteries. I think. Can I show you something? Hold me up!", 'Happy'],
  ],
  p_spark_tutorial: [
    ['tamo', "Hold Aim, point me at the porch lamp, and let me go! Pfft—like a sneeze, but useful.", 'Talk'],
  ],
  p_spark_done: [
    ['tamo', 'I did it! Did you see? Pfft! Spark! I am SO good at this.', 'Happy'],
    ['mika', 'So that is how the lamps get lit. Grandma said the Mill Lamp is in Kawabe.'],
    ['tamo', 'Kawabe! The river village! Let us go! …Which way is Kawabe?'],
  ],
  c1_rin_meet: [
    ['rin', "Hey! You're standing on my fishing spot. Also you're scaring the trout.", 'Talk'],
    ['mika', "Sorry. I'm Mika, Sora's granddaughter. I'm looking for the Mill Lamp keeper."],
    ['rin', "…Sora's? Oh. That's my grandpa. Ōta. He's not going to let you near it.", 'Talk'],
    ['rin', 'Nobody touches the lamp. Not since that night. Everybody knows it was Takamori\'s fault anyway.'],
    ['mika', "Takamori's fault?"],
    ['rin', "Their Orchard Lamp stayed lit when it should've gone dark. That's what Grandpa says. A lot. Every day."],
    ['rin', "Go try him. He's at the mill. Don't say I didn't warn you."],
  ],
  c1_ota_refuse: [
    ['ota', "Hm? A city girl in a raincoat. Go home. The mill is closed. The lamp is closed. Everything is closed.", 'Idle'],
    ['mika', "I'm Sora's granddaughter. She asked me to light the Mill Lamp."],
    ['ota', "…Sora's.", 'Sad'],
    ['ota', "That lamp is lifted by the wheel, and the wheel has been jammed for ten years. Three cogs gone to the river."],
    ['ota', "And I'm not eating another dinner of pickled radish while strangers fiddle with my mill.", 'Talk'],
    ['tamo', "(whispering) He's hungry. Hungry people are grumpy. That's science."],
  ],
  c1_rin_fish: [
    ['rin', "He said no, right? Classic Grandpa.", 'Talk'],
    ['rin', "Okay. Plan. Grandpa melts for grilled trout. Catch me three and I'll cook them. Deal?"],
    ['rin', "Rod's on the dock. Cast, wait for the float to dip, then reel—keep the line in the green or it snaps."],
  ],
  c1_fish_done: [
    ['rin', "Three! Not bad for a city girl. Okay, maybe good. Don't let it go to your head.", 'Cheer'],
    ['rin', "I'll grill these. Take the plate to Grandpa—say it was your idea."],
  ],
  c1_ota_trout: [
    ['ota', "…Is that grilled trout?", 'Idle'],
    ['ota', "…With the salt crust Rin does. Hmph. Sit, sit. No, don't sit. Just… thank you.", 'Bow'],
    ['ota', "Sora's girl. Fine. Find my three cogs and fix my wheel, and we'll talk about the lamp."],
    ['ota', "One fell in the reeds by the boathouse. One Rin's cousins hid on the crate stack, the rascals. And one…"],
    ['ota', "…one was stolen by a crab. Do not laugh. That crab is a menace.", 'Talk'],
  ],
  c1_crab: [
    ['tamo', "There! On the sandbar! That crab is holding a COG like a tiny shield!"],
    ['tamo', 'Spark it! Not hard! Just a little boop to make it drop the cog.'],
  ],
  c1_crab_hit: [
    ['tamo', "Boop! Ha! It dropped it! It looks very offended. Sorry, Mr. Crab!", 'Happy'],
  ],
  c1_cogs_done: [
    ['tamo', "Three cogs! Let's fix that wheel!"],
  ],
  c1_wheel: [
    ['narrator', 'The cogs slide into place. The old axle groans, shudders… and the great wheel turns.', 'Hammer'],
    ['ota', "…It turns. Ten years, and it turns.", 'Sad'],
    ['ota', "The drawbridge is down. The island is yours, Sora's girl. Go on—light it. The sun's nearly down."],
  ],
  c1_lamp: [
    ['tamo', "The lamp! It's… it's so warm. I remember this. I remember lamps.", 'Happy'],
    ['tamo', 'I remember… lanterns, and someone shouting. The river was so loud.', 'Sad'],
    ['mika', 'Tamo? Are you okay?'],
    ['tamo', "I'm okay. It's just a memory. A loud one."],
  ],
  c1_ota_page: [
    ['ota', "Look at it. The Mill Lamp, burning again. Sora would…", 'Sad'],
    ['ota', "She left something with me. I never could read it. Too… well. Here.", 'Talk'],
    ['narrator', 'Journal page 1 added.'],
    ['ota', 'Rin will take you across on the ferry tomorrow. Go and see what Takamori has to say for itself.'],
  ],
  c2_arrive: [
    ['rin', "Takamori landing! Mind the step. I'll wait here. I'm not going up there.", 'Talk'],
    ['mika', 'Because of the feud?'],
    ['rin', "Because of the hill. It's a big hill. …And the feud."],
  ],
  c2_hana_meet: [
    ['hana', "Oh! A new face! Here, have a peach bun, you look half-starved. Who are you, sweetheart?", 'Wave'],
    ['mika', "Mika. Sora's granddaughter. I came about the Orchard Lamp."],
    ['hana', "…Sora's. Oh, love. I was so sorry to hear.", 'Sad'],
    ['hana', "And you came across the river… so Ōta sent you. Let me guess what he told you. That it was our fault.", 'Talk'],
    ['hana', "Well, here's the truth: the Mill Lamp stayed lit that night. Kawabe was down here drinking at our festival."],
    ['mika', "He says exactly the same thing about you."],
    ['hana', "Does he now. Hmph."],
  ],
  c2_hana_tasks: [
    ['hana', "The lamp's up in the bell tower and the key's in my apron. But the summer fair is tomorrow, and it's a disaster.", 'Talk'],
    ['hana', "The sheep broke out of the pasture, the crows are eating my peaches, and I have buns to deliver."],
    ['hana', "Help me save my fair and the key is yours. Sheep first—they're everywhere."],
  ],
  c2_sheep_done: [
    ['hana', "All five! Oh, you're a natural. Now the crows—the scarecrow bells scare them off, but nobody can reach them.", 'Cheer'],
    ['tamo', "Nobody except a very talented star! Ding-ding!"],
  ],
  c2_crows_done: [
    ['hana', "Listen to that! Not a crow left. Pick me five of the ripe ones, would you?", 'Cheer'],
  ],
  c2_peaches_done: [
    ['hana', "Perfect. And one last thing… would you take this bun to Genzo at the station? He used to come every week.", 'Talk'],
    ['hana', "He stopped coming after that night. He stopped coming everywhere, really."],
  ],
  c2_genzo_bun: [
    ['genzo', "A peach bun. From Hana.", 'Sad'],
    ['genzo', "…Take it back. Tell her… tell her I don't deserve Hana's buns.", 'ArmsCrossed'],
    ['mika', "Genzo, what happened that night?"],
    ['genzo', "The river happened. Go on, now. Train's leaving.", 'Talk'],
    ['tamo', "(whispering) He's sad-grumpy. That's different from hungry-grumpy."],
  ],
  c2_hana_key: [
    ['hana', "He wouldn't take it? …No. I suppose he wouldn't.", 'Sad'],
    ['hana', "Here's the key, love. Climb up and ring the bell for me. It's been too quiet."],
  ],
  c2_bell: [
    ['narrator', 'BONG. The old bell rolls across the valley, and every bird in Takamori takes off at once.'],
    ['tamo', "That was LOUD! Do it again! No—the lamp! Aim through the little window up top!"],
  ],
  c2_lamp: [
    ['tamo', 'The Orchard Lamp! Oh… another memory.', 'Sad'],
    ['tamo', 'The train was so bright. It was coming, and coming… and it didn\'t slow down.'],
    ['mika', "The Star Train? It didn't slow down? But Grandma's lamp should have warned it."],
    ['tamo', "I don't know. It's all fog after that."],
  ],
  c2_hana_page: [
    ['hana', "It's lit. It's really lit. Here—Sora gave me this years ago. Said I'd know when to pass it on.", 'Talk'],
    ['narrator', 'Journal page 2 added.'],
    ['hana', "The upper orchard gate is open now. The old forest path leads up to the shrine. Nobody's been up in years."],
  ],
  c3_fox: [
    ['tamo', 'Mika! A fox! A fox in a little red bib! It wants us to follow it!', 'Happy'],
    ['mika', "That's a shrine bib. It must be the shrine's fox."],
  ],
  c3_bear: [
    ['tamo', "Oh no. Oh no no no. That is the biggest bear in the whole world and it's asleep ON the stairs.", 'Sad'],
    ['mika', "There's a note on the shrine board. From Old Kiku."],
    ['kiku', "To whoever comes: if Ōkuma sleeps on the steps, the forest is still sad. Feed him something sweet."],
    ['kiku', "He is fond of honey chestnuts. Three chestnuts, two mushrooms, one honeycomb, and a steady hand at the pot."],
    ['tamo', "A bear recipe! We can do that. Probably. The bees might not like it."],
  ],
  c3_hive: [
    ['tamo', "Honey means bees, and bees mean a hive. There's one hanging on a branch east of the chestnuts."],
    ['tamo', "One good spark to the branch and it'll drop… and then we RUN."],
  ],
  c3_hive_hit: [
    ['tamo', "It dropped! Grab the honeycomb! Bees! BEES! Run, Mika!", 'Happy'],
  ],
  c3_cooked: [
    ['tamo', 'It smells like autumn in a bowl. If I had a stomach, it would be growling.', 'Happy'],
  ],
  c3_landslide: [
    ['mika', 'Look at this slope. The whole hillside came down into the river.'],
    ['mika', "That's what caused the flood. A landslide dam, bursting. It wasn't the mill dam. It wasn't anyone."],
    ['tamo', 'Nobody broke the river. The river broke itself.'],
  ],
  c3_bear_fed: [
    ['narrator', 'Ōkuma sniffs the bowl… opens one enormous eye… and eats the whole thing in a single, happy gulp.'],
    ['narrator', 'He yawns, stretches, pats Mika very gently on the head, and ambles off into the maples.'],
    ['tamo', 'He PATTED you! That is the greatest thing that has ever happened!', 'Happy'],
  ],
  c3_lamp: [
    ['tamo', 'The Forest Lamp! I remember… I remember the whole night now. Almost.', 'Sad'],
    ['tamo', 'Sora ran onto the bridge with me in her lantern. She was waving it. Red. Red. Red.'],
    ['tamo', 'And the train was so loud. And then… Genzo. I remember Genzo\'s face.'],
    ['mika', "Genzo was driving the Star Train that night."],
  ],
  c3_page: [
    ['narrator', 'Tucked behind the shrine\'s lamp: journal page 3, in Sora\'s hand.'],
    ['sora', 'Old Kiku put her lamp out that night. She did her part. The rest of us didn\'t.'],
  ],
  c4_start: [
    ['narrator', 'Winter. Three days until the stars fall.'],
    ['tamo', "One lamp left. And one person who knows what happened."],
    ['mika', "Genzo. Let's go to the engine shed."],
  ],
  c4_confront: [
    ['genzo', "Sora's lantern. And… that little light. I'd know it anywhere.", 'Sad'],
    ['tamo', "You. You were driving. The Viaduct Lamp was dark—Sora put it out—and you didn't stop."],
    ['genzo', "…", 'Sad'],
    ['genzo', "All the other lamps were lit. Every one of them said 'clear'. I thought the wind had blown hers out.", 'Talk'],
    ['genzo', "Then she was on the tracks, swinging that red lantern like a mad thing. I pulled the brake so hard I tore my shoulder."],
    ['genzo', "We stopped four metres from where the pier fell. Forty people. All alive. Because of her.", 'Sad'],
    ['genzo', "And she never walked right again. Because of me."],
    ['genzo', "I took the last page of her journal from her bag that night. I've read it every day for ten years.", 'Talk'],
    ['genzo', "Kawabe blames Takamori. Takamori blames Kawabe. And I let them. Because it was easier than the truth."],
    ['mika', "Grandma's letter said not to be angry with you. She said you'd carried enough."],
    ['genzo', "…She would say that.", 'Sad'],
    { choice: [
      { text: '"You have to tell them yourself."', value: 'alone' },
      { text: '"Grandma forgave you. We\'ll tell them together."', value: 'together' },
    ] },
  ],
  c4_choice_alone: [
    ['genzo', "…Yes. Yes, I do. It should be me. Tonight, on the platform. Bring them both.", 'Talk'],
  ],
  c4_choice_together: [
    ['genzo', "Together. …She'd have liked that. Tonight, on the platform. Bring them both.", 'Talk'],
  ],
  c4_gather_ota: [
    ['ota', "A meeting? At the station? With HER? …Fine. For Sora's girl. Only for Sora's girl.", 'Talk'],
  ],
  c4_gather_hana: [
    ['hana', "Ōta will be there? …Then I'm bringing a very large basket of buns. For courage.", 'Talk'],
  ],
  c4_meeting_alone: [
    ['narrator', 'Snow falls on Hoshi Station. Kawabe stands on one side of the platform, Takamori on the other.'],
    ['genzo', "Everyone. Please. I have something I should have said ten years ago.", 'Talk'],
    ['genzo', "The Viaduct Lamp was dark that night. Sora put it out, like she was supposed to. I saw it, and I didn't stop.", 'Sad'],
    ['genzo', "It was my fault. Not Kawabe's. Not Takamori's. Mine.", 'Bow'],
  ],
  c4_meeting_together: [
    ['narrator', 'Snow falls on Hoshi Station. Kawabe stands on one side of the platform, Takamori on the other.'],
    ['mika', "Everyone—Genzo and I have something to tell you. About the night the Star Train stopped."],
    ['genzo', "The Viaduct Lamp was dark. Sora did her part. I saw it, and I didn't stop.", 'Sad'],
    ['mika', "And Grandma forgave him. She asked me to tell you that, too."],
  ],
  c4_meeting_after: [
    ['ota', "…My Mill Lamp was lit that night because I was at Takamori's festival. Drinking. Not watching.", 'Sad'],
    ['hana', "And my Orchard Lamp was lit because I was selling buns. Not watching either.", 'Sad'],
    ['rin', "So… nobody's the villain? That's somehow worse.", 'Talk'],
    ['tamo', "No! That's BETTER! It means everybody can fix it!", 'Happy'],
    ['ota', "…Hana. The mill still has timber seasoned for that span.", 'Talk'],
    ['hana', "And Takamori's smithy has the bolts. Has had them for ten years.", 'Talk'],
    ['ota', "Then. Tomorrow.", 'Bow'],
    ['hana', "Tomorrow.", 'Bow'],
  ],
  c4_repair: [
    ['genzo', "Timber from Kawabe, iron from Takamori, and a girl with a hammer. Set the three beams, Mika.", 'Talk'],
  ],
  c4_repaired: [
    ['genzo', "Solid as the day she was built. Better, maybe.", 'Cheer'],
    ['genzo', "Now climb up and light that lamp. Tonight, the stars fall."],
  ],
  c4_lamp: [
    ['tamo', 'Mika. All four. Forest, Mill, Orchard… Viaduct. Look at them.', 'Happy'],
    ['tamo', 'I remember everything now. And I remember where I belong.'],
  ],
  c4_board: [
    ['genzo', "All aboard the Star Train! Kawabe AND Takamori! No pushing! Ōta, that means you!", 'Wave'],
    ['genzo', "Mika—up front with me. Light the trackside lanterns as we go. Show them the way home."],
  ],
  c4_finale: [
    ['narrator', 'The Star Train crosses the viaduct as the sky begins to fall—one star, then ten, then a thousand.'],
    ['tamo', "Mika. The Viaduct Lamp needs a hoshibi. It's always needed one. It's where I live.", 'Sad'],
    ['mika', "You're going back into the lamp."],
    ['tamo', "I'll keep watch. Every night. You keep watch too, okay? That's how lights work. Somebody has to be looking.", 'Happy'],
    ['mika', "…Okay. I'll keep watch. Goodnight, Tamo."],
  ],
  epilogue: [
    ['narrator', 'Spring comes back to Hoshi Valley. The Star Train runs every Sunday now.'],
    ['narrator', 'Kawabe and Takamori share one festival, on the viaduct, and argue about the buns.'],
    ['narrator', 'And Sora\'s cottage has a new Viaduct Lamp keeper—who waves at a small gold light every night.'],
  ],
  epilogue_alone: [['genzo', "I told them myself. First brave thing I've done in ten years. Felt like breathing.", 'Talk']],
  epilogue_together: [['genzo', "You stood next to me on that platform. I won't forget it, Mika. Neither would she.", 'Talk']],
  sora_last_letter: [
    ['sora', 'Mika—if you found all twelve fallen stars, you walked every corner of my valley. Good.'],
    ['sora', 'Here is my secret: I never lit the lamps for the train. I lit them so someone would look up.'],
    ['sora', 'Keep looking up, my darling. Love, Grandma.'],
  ],
  ferry_ride: [['rin', "Hold on to something! Ferry's leaving!", 'Pole']],
  ferry_locked: [['rin', "Ferry? Not a chance. Grandpa says nobody crosses until the Mill Lamp's lit.", 'Talk']],
  gate_locked: [['tamo', "The orchard gate is locked tight. Hana has the key to everything up here."]],
  drawbridge_up: [['tamo', "The drawbridge is up. It lifts with the mill wheel, and the wheel isn't turning."]],
  tower_locked: [['tamo', 'The bell-tower door is locked. Hana has the key.']],
  gap_blocked: [['tamo', "That's where the span fell. Don't even THINK about jumping."]],
  bear_blocked: [['tamo', "The bear is asleep across the whole staircase. We can't get past. We need a plan. And maybe a snack."]],
};

// Idle chatter per NPC per chapter (random line when there's nothing story-related to say).
export const CHATTER = {
  genzo: [["The line's short these days. Station, tunnel, station. Like my mood."], ["Kobo runs better than I do. Don't tell her."], ["Mind the tracks, girl."], ["Snow on the rails. Kobo hates snow. I hate snow."], ["Sunday service, Mika. Don't be late."]],
  rin: [["The trout bite best at dusk. The starfin only bites AT dusk."], ["Grandpa pretends he doesn't like you. He likes you."], ["Takamori kids have bikes. We have boats. Boats are better."], ["I tried to catch the golden ayu once. Once."], ["Race you to the dock!"]],
  ota: [["Hmph."], ["The wheel is turning. I can hear it from bed. Best sound in the world."], ["That Hana woman makes a decent bun. Don't repeat that."], ["Ten years. Ten years of radish."], ["Keep watch, girl. That's the whole job."]],
  hana: [["Have a bun! No? Have two!"], ["The peaches are sweeter since the lamp came back. I'm certain of it."], ["Ōta used to come to my stall every festival. Three buns. Always three."], ["My oven's older than the viaduct."], ["Come by on Sunday. We're making the festival buns together now. Me and Kawabe. Imagine."]],
  villager: [["Lovely day in Hoshi Valley."], ["They say the stars fall in winter."], ["Did you hear the mill wheel turning again?"], ["The Star Train! I remember the Star Train."], ["Mind the crows."]],
};

export const JOURNAL = [
  { title: 'Page 1 · The Relay', text: 'Forest, Mill, Orchard, Viaduct. The four lamps watch the river. If one goes dark, the next must go dark. A lit lamp says all is clear; a dark lamp says stop. — S.' },
  { title: 'Page 2 · The Festival', text: 'Tetsuo and Hana were both at the festival that night. So was I, until I heard the river. The river sounds different when it is angry. — S.' },
  { title: 'Page 3 · Kiku', text: 'Old Kiku put her lamp out that night. She did her part. The rest of us did not. I will not write down who was driving. He knows. — S.' },
  { title: 'Page 4 · Forgiveness', text: 'Genzo, if you are reading this (you are, you old thief): I forgave you before the train stopped rolling. Now forgive yourself. And bring my granddaughter a bun. — S.' },
];

export const STAR_POEM = [
  'One star for the river,', 'one for the mill,', 'one for the orchard', 'asleep on the hill,',
  'one for the forest,', 'one for the bear,', 'one for the train', 'that carried us there,',
  'one for the watchers', 'who stay up all night,', 'and one for the one', 'who keeps looking at light.',
];

export const FISH = {
  trout: { name: 'Rainbow trout', weight: 0.6, difficulty: 0.35 },
  char: { name: 'River char', weight: 0.25, difficulty: 0.5 },
  koi: { name: 'Mill koi', weight: 0.12, difficulty: 0.45 },
  starfin: { name: 'Starfin', weight: 0.0, difficulty: 0.7, dusk: true },
};

// ------------------------------------------------------------------------------------ steps
// done: condition that completes the step. talk: {npc: dialogueId} while the step is active.
// enter/exit: effects. Effects: { say }, { give: [item, n] }, { take: [item, n] }, { flag }, { season },
// { time }, { timelapse }, { lamp }, { journal }, { title }, { cutscene }, { unlock }, { toast }, { autosave },
// { chapter }, { spawn }, { music }, { star }.
export const STEPS = [
  // ---------------------------------------------------------------- prologue
  { id: 'p.arrive', chapter: 0, objective: 'Arrive in Hoshi Valley', done: { event: 'cutscene', id: 'arrival' },
    enter: [{ season: 'spring' }, { time: 17.2 }, { title: 0 }, { cutscene: 'arrival' }], exit: [{ say: 'p_arrive' }] },
  { id: 'p.cottage', chapter: 0, objective: "Walk up the bluff to Sora's cottage", marker: 'place:cottage', done: { event: 'arrive', zone: 'cottage' },
    exit: [{ say: 'p_cottage' }] },
  { id: 'p.chest', chapter: 0, objective: "Open Sora's chest on the porch", marker: 'interact:chest', done: { event: 'interact', target: 'chest' },
    exit: [{ cutscene: 'tamoWakes' }, { say: 'p_chest' }, { say: 'p_letter' }, { flag: 'hasTamo' }, { say: 'p_spark_tutorial' }] },
  { id: 'p.porch', chapter: 0, objective: 'Hold Aim and spark the porch lamp', marker: 'target:porchLamp', done: { event: 'spark', target: 'porchLamp' },
    exit: [{ say: 'p_spark_done' }, { autosave: true }] },
  // ---------------------------------------------------------------- chapter 1 (spring, Kawabe)
  { id: 'c1.rin', chapter: 1, objective: 'Find the Mill Lamp keeper in Kawabe', marker: 'npc:rin',
    enter: [{ chapter: 1 }, { time: 9 }, { title: 1 }], done: { event: 'talk', who: 'rin' }, talk: { rin: 'c1_rin_meet' } },
  { id: 'c1.ota', chapter: 1, objective: 'Talk to Grandpa Ōta at the mill', marker: 'npc:ota', done: { event: 'talk', who: 'ota' }, talk: { ota: 'c1_ota_refuse' } },
  { id: 'c1.rinPlan', chapter: 1, objective: 'Go back to Rin at the dock', marker: 'npc:rin', done: { event: 'talk', who: 'rin' }, talk: { rin: 'c1_rin_fish' },
    exit: [{ flag: 'canFish' }] },
  { id: 'c1.fish', chapter: 1, objective: 'Catch three fish from the dock ({fish}/3)', marker: 'interact:fishingSpot', done: { have: { fish: 3 } },
    exit: [{ say: 'c1_fish_done' }, { take: ['fish', 3] }, { give: ['plate', 1] }] },
  { id: 'c1.trout', chapter: 1, objective: 'Bring the grilled trout to Grandpa Ōta', marker: 'npc:ota', done: { event: 'talk', who: 'ota' }, talk: { ota: 'c1_ota_trout' },
    exit: [{ take: ['plate', 1] }, { flag: 'cogHunt' }, { spawn: 'cogs' }] },
  { id: 'c1.cogs', chapter: 1, objective: 'Find the three lost mill cogs ({cog}/3)', marker: 'item:cog', done: { have: { cog: 3 } },
    exit: [{ say: 'c1_cogs_done' }] },
  { id: 'c1.wheel', chapter: 1, objective: 'Repair the mill wheel', marker: 'interact:millAxle', done: { event: 'interact', target: 'millAxle' },
    exit: [{ take: ['cog', 3] }, { cutscene: 'wheelTurns' }, { unlock: 'drawbridge' }, { say: 'c1_wheel' }, { timelapse: 18.6 }] },
  { id: 'c1.lamp', chapter: 1, objective: 'Cross to the island and spark the Mill Lamp', marker: 'target:millLamp', done: { event: 'spark', target: 'millLamp' },
    exit: [{ cutscene: 'lampLit:mill' }, { lamp: 'mill' }, { say: 'c1_lamp' }] },
  { id: 'c1.page', chapter: 1, objective: 'Return to Grandpa Ōta', marker: 'npc:ota', done: { event: 'talk', who: 'ota' }, talk: { ota: 'c1_ota_page' },
    exit: [{ journal: 0 }, { unlock: 'ferry' }, { autosave: true }] },
  // ---------------------------------------------------------------- chapter 2 (summer, Takamori)
  { id: 'c2.ferry', chapter: 2, objective: 'Take Rin\'s ferry across the river', marker: 'interact:ferry',
    enter: [{ chapter: 2 }, { time: 9 }, { season: 'summer' }, { title: 2 }], done: { event: 'ferry', side: 'east' }, exit: [{ say: 'c2_arrive' }] },
  { id: 'c2.hana', chapter: 2, objective: 'Find the Orchard Lamp keeper in Takamori', marker: 'npc:hana', done: { event: 'talk', who: 'hana' },
    talk: { hana: 'c2_hana_meet' }, exit: [{ say: 'c2_hana_tasks' }, { spawn: 'sheep' }] },
  { id: 'c2.sheep', chapter: 2, objective: 'Herd the runaway sheep into the pen ({sheep}/5)', marker: 'place:pen', done: { have: { sheep: 5 } },
    exit: [{ say: 'c2_sheep_done' }, { spawn: 'crows' }] },
  { id: 'c2.crows', chapter: 2, objective: 'Spark the scarecrow bells to scare off the crows ({bells}/5)', marker: 'target:bell', done: { have: { bells: 5 } },
    exit: [{ say: 'c2_crows_done' }, { spawn: 'peaches' }] },
  { id: 'c2.peaches', chapter: 2, objective: 'Pick five ripe peaches ({peach}/5)', marker: 'item:peach', done: { have: { peach: 5 } },
    exit: [{ take: ['peach', 5] }, { say: 'c2_peaches_done' }, { give: ['bun', 1] }] },
  { id: 'c2.bun', chapter: 2, objective: 'Deliver Hana\'s peach bun to Genzo at the station', marker: 'npc:genzo', done: { event: 'talk', who: 'genzo' },
    talk: { genzo: 'c2_genzo_bun' } },
  { id: 'c2.key', chapter: 2, objective: 'Tell Hana what Genzo said', marker: 'npc:hana', done: { event: 'talk', who: 'hana' }, talk: { hana: 'c2_hana_key' },
    exit: [{ take: ['bun', 1] }, { give: ['key', 1] }] },
  { id: 'c2.bell', chapter: 2, objective: 'Climb the bell tower and ring the bell', marker: 'interact:bell', done: { event: 'interact', target: 'bell' },
    exit: [{ say: 'c2_bell' }, { timelapse: 18.7 }] },
  { id: 'c2.lamp', chapter: 2, objective: 'Spark the Orchard Lamp through the lantern window', marker: 'target:orchardLamp', done: { event: 'spark', target: 'orchardLamp' },
    exit: [{ cutscene: 'lampLit:orchard' }, { lamp: 'orchard' }, { say: 'c2_lamp' }, { take: ['key', 1] }] },
  { id: 'c2.page', chapter: 2, objective: 'Return to Hana at the bakery', marker: 'npc:hana', done: { event: 'talk', who: 'hana' }, talk: { hana: 'c2_hana_page' },
    exit: [{ journal: 1 }, { unlock: 'orchardGate' }, { flag: 'sparkRange2' }, { autosave: true }] },
  // ---------------------------------------------------------------- chapter 3 (autumn, forest)
  { id: 'c3.fox', chapter: 3, objective: 'Go through the upper orchard gate', marker: 'place:orchardGate',
    enter: [{ chapter: 3 }, { time: 10 }, { season: 'autumn' }, { title: 3 }], done: { event: 'arrive', zone: 'orchardGate' }, exit: [{ say: 'c3_fox' }, { spawn: 'fox' }] },
  { id: 'c3.follow', chapter: 3, objective: 'Follow Kon the fox to the shrine', marker: 'npc:fox', done: { event: 'arrive', zone: 'bear' },
    exit: [{ say: 'c3_bear' }, { spawn: 'forestFood' }, { say: 'c3_hive' }] },
  { id: 'c3.gather', chapter: 3, objective: 'Gather 3 chestnuts ({chestnut}/3), 2 mushrooms ({mushroom}/2) and a honeycomb ({honeycomb}/1)',
    marker: 'item:forest', done: { have: { chestnut: 3, mushroom: 2, honeycomb: 1 } } },
  { id: 'c3.cook', chapter: 3, objective: 'Cook honey chestnuts at the shrine hearth', marker: 'interact:shrineHearth', done: { event: 'minigame', name: 'cook', ok: true },
    exit: [{ take: ['chestnut', 3] }, { take: ['mushroom', 2] }, { take: ['honeycomb', 1] }, { give: ['honeyChestnuts', 1] }, { say: 'c3_cooked' }] },
  { id: 'c3.landslide', chapter: 3, objective: 'Cross the stepping stones and look at the landslide scar', marker: 'place:landslide', done: { event: 'arrive', zone: 'landslide' },
    exit: [{ say: 'c3_landslide' }, { flag: 'sawLandslide' }] },
  { id: 'c3.bear', chapter: 3, objective: 'Feed Ōkuma the honey chestnuts', marker: 'npc:bear', done: { event: 'interact', target: 'bear' },
    exit: [{ take: ['honeyChestnuts', 1] }, { cutscene: 'bearWakes' }, { say: 'c3_bear_fed' }, { unlock: 'shrineStairs' }, { timelapse: 18.6 }] },
  { id: 'c3.lamp', chapter: 3, objective: 'Climb the shrine steps and spark the Forest Lamp', marker: 'target:forestLamp', done: { event: 'spark', target: 'forestLamp' },
    exit: [{ cutscene: 'lampLit:forest' }, { lamp: 'forest' }, { say: 'c3_lamp' }, { say: 'c3_page' }, { journal: 2 }, { autosave: true }] },
  // ---------------------------------------------------------------- chapter 4 (winter, viaduct)
  { id: 'c4.shed', chapter: 4, objective: 'Find Genzo at the engine shed', marker: 'npc:genzo',
    enter: [{ chapter: 4 }, { time: 10.5 }, { season: 'winter' }, { title: 4 }, { say: 'c4_start' }], done: { event: 'choice', id: 'confession' },
    talk: { genzo: 'c4_confront' }, exit: [{ journal: 3 }] },
  { id: 'c4.gather', chapter: 4, objective: 'Invite Grandpa Ōta and Hana to the station', marker: 'npc:ota|hana', done: { flags: ['invitedOta', 'invitedHana'] },
    talk: { ota: { say: 'c4_gather_ota', flag: 'invitedOta' }, hana: { say: 'c4_gather_hana', flag: 'invitedHana' } }, exit: [{ timelapse: 17.4 }] },
  { id: 'c4.meeting', chapter: 4, objective: 'Meet everyone on the station platform', marker: 'place:platform', done: { event: 'arrive', zone: 'platform' },
    exit: [{ cutscene: 'meeting' }, { sayChoice: 'c4_meeting' }, { say: 'c4_meeting_after' }, { time: 10 }, { spawn: 'repair' }] },
  { id: 'c4.repair', chapter: 4, objective: 'Set the three new beams on the viaduct ({beams}/3)', marker: 'interact:beam', done: { have: { beams: 3 } },
    enter: [{ say: 'c4_repair' }], exit: [{ unlock: 'viaduct' }, { say: 'c4_repaired' }, { timelapse: 19.6 }] },
  { id: 'c4.lamp', chapter: 4, objective: 'Spark the Viaduct Lamp from the repaired deck', marker: 'target:viaductLamp', done: { event: 'spark', target: 'viaductLamp' },
    exit: [{ lamp: 'viaduct' }, { cutscene: 'relay' }, { say: 'c4_lamp' }, { autosave: true }] },
  { id: 'c4.board', chapter: 4, objective: 'Board the Star Train at Hoshi Station', marker: 'npc:genzo', done: { event: 'talk', who: 'genzo' }, talk: { genzo: 'c4_board' } },
  { id: 'c4.ride', chapter: 4, objective: 'Light the trackside lanterns from the Star Train ({lanterns}/8)', done: { event: 'ride', done: true },
    enter: [{ cutscene: 'starTrain' }], exit: [{ cutscene: 'finale' }, { say: 'c4_finale' }, { cutscene: 'farewell' }, { flag: 'tamoHome' }] },
  // ---------------------------------------------------------------- epilogue
  { id: 'e.free', chapter: 5, objective: 'Explore Hoshi Valley — find all 12 Fallen Stars ({stars}/12)',
    enter: [{ chapter: 5 }, { time: 10 }, { season: 'spring' }, { title: 5 }, { say: 'epilogue' }, { sayChoice: 'epilogue' }, { autosave: true }],
    done: { never: true } },
];

export const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));
