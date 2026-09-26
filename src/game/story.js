// Starline — the whole story as data. docs/STORY.md tells it in prose; after editing, run npm run story:md
// to regenerate its script appendix from this file.
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
  kite: { name: 'Star Kite', icon: 'star-kite' },
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
    ['narrator', 'Hoshi Valley, on the last train of winter. Kobo, the little red valley engine, wheezes to a stop.'],
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
    ['narrator', 'Inside the chest: a brass signal lantern with red glass, every letter Mika ever sent, and a note with her name on it.'],
    ['narrator', 'A little gold light has tumbled out of the lantern. It is… snoring?'],
    ['tamo', '…mmh. Five more minutes, Sora…'],
    ['tamo', '!!! You are NOT Sora! Who are you? Where am I? Why is it so BRIGHT?', 'Happy'],
    ['mika', "Whoa—you're a… star? A talking star?"],
    ['tamo', "I'm a hoshibi! A star-fire! I'm Tamo! I think. Probably. It's all very fuzzy.", 'Talk'],
    ['tamo', 'I remember a lamp… and rain… and then a really long nap.', 'Sad'],
    ['mika', "There's a note from Grandma. Let's read it."],
  ],
  p_letter: [
    ['sora', 'Mika — if you are reading this, I am gone, and you have met Tamo. Be patient with him; he is braver than he looks.'],
    ['sora', 'The valley has four Star Lamps: Forest, Mill, Orchard and Viaduct. Ten years ago they went dark, and the Star Train stopped coming.'],
    ['sora', 'On star-fall night, that train carried the whole valley across the viaduct, together. Bring it home before the stars fall this winter.'],
    ['sora', 'Light the four lamps again. Start with the Mill Lamp, down in Kawabe.'],
    ['sora', "And Mika: don't be angry with Genzo. He has carried enough."],
    ['mika', '…Oh, Grandma. And why would I be angry with Genzo?'],
    ['tamo', "Sora's… gone? Oh. …Then I'll help you. I'm very good with lamps. I think. Watch this!", 'Sad'],
  ],
  p_spark_tutorial: [
    ['tamo', "Walk up to the porch lamp and press E. I'll do the rest. Pfft—like a sneeze, but useful!", 'Talk'],
  ],
  p_spark_done: [
    ['tamo', 'I did it! Did you see? Pfft! Spark! I am SO good at this.', 'Happy'],
    ['mika', "So that's how the lamps get lit. Grandma says to start with the Mill Lamp, down in Kawabe."],
    ['tamo', "Kawabe! The river village! Let's go! …Which way is Kawabe?"],
  ],
  c1_rin_meet: [
    ['rin', "Hey! You're standing on my fishing spot. Also you're scaring the trout.", 'Talk'],
    ['mika', "Sorry. I'm Mika, Sora's granddaughter. I'm looking for the Mill Lamp keeper."],
    ['rin', "…Sora's granddaughter? Oh. I'm sorry. The keeper's my grandpa, Ōta. He won't let you near that lamp.", 'Talk'],
    ['rin', "Nobody touches it. Not since the flood. And that was Takamori's fault anyway."],
    ['mika', "Takamori's fault?"],
    ['rin', "The orchard village, across the river. Their lamp stayed lit when it should've gone dark. Grandpa says so. A lot. Every day."],
    ['rin', "Go try him. He's at the mill, upriver. Don't say I didn't warn you."],
  ],
  c1_ota_refuse: [
    ['ota', "Hm? A city girl in a raincoat. Go home. The mill is closed. The lamp is closed. Everything is closed.", 'Idle'],
    ['mika', "I'm Sora's granddaughter. She asked me to light the Mill Lamp."],
    ['ota', "…Sora's.", 'Sad'],
    ['ota', "The lamp's out on the island, and the drawbridge only comes down when the wheel turns. It's been jammed ten years, three cogs short."],
    ['ota', "And I'm not eating another dinner of pickled radish while strangers fiddle with my mill.", 'Talk'],
    ['tamo', "(whispering) He's hungry. Hungry people are grumpy. That's science."],
  ],
  c1_rin_fish: [
    ['rin', "He said no, right? Classic Grandpa.", 'Talk'],
    ['rin', "Okay. Plan. Grandpa melts for grilled trout. Catch me three fish—any fish, we'll call them trout—and I'll grill them."],
    ['rin', "Rod's on the dock. Cast, wait for the float to dip, then press E. That's all there is to it."],
  ],
  c1_fish_done: [
    ['rin', "Three! Not bad for a city girl. Okay, maybe good. Don't let it go to your head.", 'Cheer'],
    ['rin', "I'll grill these. Take the plate to Grandpa—say it was your idea."],
  ],
  c1_ota_trout: [
    ['ota', "…Is that grilled trout?", 'Idle'],
    ['ota', "…With the salt crust Rin does. Hmph. Sit, sit. No, don't sit. Just… thank you.", 'Bow'],
    ['ota', "Sora's girl. Fine. Find my three cogs and fix my wheel, and we'll talk about the lamp."],
    ['ota', "One fell in the reeds by the boathouse. Rin's cousins hid one on top of the crate stack, the rascals. And one…"],
    ['ota', "…one was stolen by a crab. Do not laugh. That crab is a menace.", 'Talk'],
  ],
  c1_crab: [
    ['tamo', "There! On the sandbar! That crab is holding a COG like a tiny shield!"],
    ['tamo', "Get close and press E. I'll give it a little boop—just enough to make it drop the cog."],
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
    ['ota', "There goes the drawbridge. The island's yours, Sora's girl. Light it at sundown—that's when a lamp earns its keep."],
  ],
  c1_lamp: [
    ['tamo', "The lamp! It's… it's so warm. I remember this. I remember lamps.", 'Happy'],
    ['tamo', 'I remember… lanterns, and someone shouting. The river was so loud.', 'Sad'],
    ['mika', 'Tamo? Are you okay?'],
    ['tamo', "I'm okay. It's just a memory. A loud one."],
  ],
  c1_ota_page: [
    ['ota', "Look at it. The Mill Lamp, burning again. Sora would…", 'Sad'],
    ['ota', "She left this with me, a page of her journal. I never had the heart to read it. Here. It's yours.", 'Talk'],
    ['sora', 'Forest, Mill, Orchard, Viaduct. If one lamp goes dark, the next must go dark. A lit lamp says all clear; a dark lamp says stop.'],
    ['ota', "The next lamp downriver is Takamori's. Rin will ferry you over. Go and see what they have to say for themselves."],
  ],
  c2_arrive: [
    ['tamo', 'Takamori! Look at all those peach trees. The Orchard Lamp must be up there somewhere.', 'Happy'],
    ['mika', "Kawabe says the flood was Takamori's fault. Let's hear what Takamori says."],
    ['tamo', 'Ooh, the other side of the story. Every story has one. Some have three.'],
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
    ['hana', "My sheep are loose, the crows are at my peaches, and the fair basket down the orchard lane still needs five ripe ones."],
    ['hana', "Help me save my fair and the key is yours. Sheep first—walk up to each one and it'll trot home to the pen."],
  ],
  c2_sheep_done: [
    ['tamo', "All five home! You're a natural, Mika. Next on Hana's list: the crows.", 'Happy'],
    ['tamo', "The scarecrow bells scare them off, but nobody can reach them. Nobody except a very talented star! Ding-ding!"],
  ],
  c2_crows_done: [
    ['tamo', "Listen to that! Not a crow left. Now five ripe peaches for Hana's fair basket.", 'Happy'],
  ],
  c2_peaches_done: [
    ['narrator', "The peaches go into Hana's fair basket. Tucked under its cloth: a warm peach bun and a note."],
    ['hana', "For Genzo at the station, if you'd be a dear. He used to come by every week. After that night, he stopped coming anywhere."],
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
    ['hana', "Here's the key, love. Climb up and ring the bell for me—it's been too quiet—then light that lamp."],
  ],
  c2_bell: [
    ['narrator', 'BONG. The old bell rolls across the valley, and every bird in Takamori takes off at once.'],
    ['tamo', "That was LOUD! Do it again! No—look, the sun's going down. The lamp's right above us. Press E!"],
  ],
  c2_lamp: [
    ['tamo', 'The Orchard Lamp! Oh… another memory.', 'Sad'],
    ['tamo', 'The train was so bright. It was coming, and coming… and it didn\'t slow down.'],
    ['mika', "The Star Train? It didn't slow down? But the lamps were supposed to warn it."],
    ['tamo', "I don't know. It's all fog after that."],
  ],
  c2_hana_page: [
    ['hana', "It's lit. It's really lit. Here—Sora gave me this years ago. Said I'd know when to pass it on.", 'Talk'],
    ['sora', 'Ōta and Hana were both at the festival that night. So was I, until I heard the river.'],
    ['hana', "The Forest Lamp is up at the shrine. I've opened the upper orchard gate for you. Nobody's gone up since Old Kiku left."],
  ],
  c3_fox: [
    ['tamo', 'Mika! A fox! A fox in a little red bib! It wants us to follow it!', 'Happy'],
    ['mika', "That's a shrine bib, and it's stitched 'Kon'. He must be the shrine's fox."],
  ],
  c3_bear: [
    ['tamo', "Oh no. Oh no no no. That is the biggest bear in the whole world and it's asleep ON the stairs.", 'Sad'],
    ['mika', "There's a note on the shrine board. From Old Kiku."],
    ['kiku', "To whoever comes after me: if Ōkuma sleeps on the steps, the forest is still sad. Feed him something sweet."],
    ['kiku', "He is fond of honey chestnuts. Three chestnuts, two mushrooms, one honeycomb, and a little patience at the pot."],
    ['tamo', "A bear recipe! We can do that. Probably. The bees might not like it."],
  ],
  c3_hive: [
    ['tamo', "Honey means bees, and bees mean a hive. There's one hanging on a branch east of the chestnuts."],
    ['tamo', "Walk under it and press E. One good spark and it'll drop… and then we RUN."],
  ],
  c3_hive_hit: [
    ['tamo', "It dropped! Grab the honeycomb! Bees! BEES! Run, Mika!", 'Happy'],
  ],
  c3_cooked: [
    ['tamo', 'It smells like autumn in a bowl. If I had a stomach, it would be growling.', 'Happy'],
    ['tamo', "Mika, look across the river. Half that hillside is missing. Can we look? The bear isn't going anywhere."],
  ],
  c3_landslide: [
    ['mika', 'Look at this slope. The whole hillside slid into the river.'],
    ['mika', 'It must have dammed the river, then burst. That was the flood. Nobody caused it—not Kawabe, not Takamori.'],
    ['tamo', 'Nobody broke the river. The river broke itself.'],
  ],
  c3_bear_fed: [
    ['narrator', 'Ōkuma sniffs the bowl… opens one enormous eye… and eats the whole thing in a single, happy gulp.'],
    ['narrator', 'He yawns, stretches, pats Mika very gently on the head, and ambles off into the maples.'],
    ['tamo', 'He PATTED you! That is the greatest thing that has ever happened!', 'Happy'],
  ],
  c3_lamp: [
    ['tamo', 'The Forest Lamp! I remember… I remember the whole night now. Almost.', 'Sad'],
    ['tamo', 'Sora ran onto the viaduct with me in her lantern. She was waving it. Red. Red. Red.'],
    ['tamo', "And the train was so loud. And in the engine's window… Genzo. I remember Genzo's face."],
    ['mika', "Genzo was driving the Star Train that night."],
  ],
  c3_page: [
    ['narrator', "Tucked behind the Forest Lamp, where Old Kiku kept it safe: journal page 3, in Sora's hand."],
    ['sora', 'Old Kiku put her lamp out that night. She did her part. The rest of us didn\'t.'],
  ],
  c4_start: [
    ['narrator', 'Winter. Snow on the rails, and the stars fall tomorrow night.'],
    ['tamo', "One lamp left, on a bridge with a hole in it. And one person who knows what really happened."],
    ['mika', "Genzo. In this snow he'll be in the engine shed. Let's go."],
  ],
  c4_confront: [
    ['genzo', "Sora's lantern. And… that little light. I'd know it anywhere.", 'Sad'],
    ['tamo', "You. You were driving. Sora put the Viaduct Lamp out—she scooped me into her lantern—and you didn't stop."],
    ['genzo', "…", 'Sad'],
    ['genzo', "The Mill and Orchard Lamps both said 'clear'. I thought the wind had blown hers out.", 'Talk'],
    ['genzo', "Then she was on the tracks, swinging that red lantern like a mad thing. I pulled the brake so hard I tore my shoulder."],
    ['genzo', "We stopped four metres from where the span fell. Forty people. All alive. Because of her.", 'Sad'],
    ['genzo', "She was still on the viaduct when it went. She never walked right again. Because of me."],
    ['genzo', "Kawabe blames Takamori. Takamori blames Kawabe. And I let them. Because it was easier than the truth.", 'Talk'],
    ['mika', "Grandma's letter said not to be angry with you. She said you'd carried enough."],
    ['genzo', "…She would say that. She gave me this before she died. Sealed, for you. I opened it. I've read it every day since.", 'Sad'],
    ['sora', 'Genzo, you old snoop, of course you read this. I forgave you before the train stopped rolling. Now forgive yourself.'],
    { choice: [
      { text: '"You have to tell them yourself."', value: 'alone' },
      { text: '"Grandma forgave you. We\'ll tell them together."', value: 'together' },
    ] },
  ],
  c4_choice_alone: [
    ['genzo', "…Yes. Yes, I do. It should be me. Tonight, on the platform. Bring Ōta and Hana.", 'Talk'],
  ],
  c4_choice_together: [
    ['genzo', "Together. …She'd have liked that. Tonight, on the platform. Bring Ōta and Hana.", 'Talk'],
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
    ['genzo', "The Viaduct Lamp was dark. Sora did her part. I saw it, and I didn't stop. That's on me.", 'Sad'],
    ['mika', "And Grandma forgave him. She wrote it down—it's the last page of her journal."],
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
    ['genzo', "Timber from Kawabe, iron from Takamori, and a girl with a hammer. The viaduct, first thing, Mika.", 'Talk'],
  ],
  c4_repair: [
    ['narrator', 'Morning. Genzo is already up on the viaduct with the Kawabe timber and the Takamori iron.'],
    ['tamo', "Three new beams across the gap, Mika! You swing the hammer. I'll do the cheering.", 'Happy'],
  ],
  c4_repaired: [
    ['genzo', "Solid as the day she was built. Better, maybe.", 'Cheer'],
    ['genzo', "Tonight the stars fall. Go and light that lamp—Kobo doesn't cross until all four say 'clear'."],
  ],
  c4_lamp: [
    ['tamo', 'Mika. All four. Forest, Mill, Orchard… Viaduct. Look at them.', 'Happy'],
    ['tamo', 'I remember everything now. And I remember where I belong.'],
  ],
  c4_board: [
    ['genzo', "All aboard the Star Train! Kawabe AND Takamori! No pushing! Ōta, that means you!", 'Wave'],
    ['genzo', "Mika—up front with me. Press E as each trackside lantern comes near. Show them the way home."],
  ],
  c4_finale: [
    ['narrator', 'The Star Train rolls into Takamori Halt as the sky begins to fall—one star, then ten, then a thousand.'],
    ['tamo', "Mika. The Viaduct Lamp was my lamp, before Sora carried me off to keep me safe. It needs its hoshibi. It needs me.", 'Sad'],
    ['mika', "You're going back into the lamp."],
    ['tamo', "I'll keep watch. Every night. You keep watch too, okay? That's how lights work. Somebody has to be looking.", 'Happy'],
    ['mika', "…Okay. I'll keep watch. Goodnight, Tamo."],
  ],
  epilogue: [
    ['narrator', 'Spring comes back to Hoshi Valley. The Star Train runs every Sunday now.'],
    ['narrator', 'Kawabe and Takamori share one festival, on the viaduct, and argue about the buns.'],
    ['narrator', 'And Sora\'s cottage has a new Viaduct Lamp keeper—who waves at a small gold light every night.'],
  ],
  epilogue_alone: [['narrator', 'On Sundays, Genzo tells his passengers the whole story himself. "First brave thing I did in ten years," he says. "Felt like breathing."']],
  epilogue_together: [['narrator', 'On Sundays, Genzo saves Mika the seat up front. "You stood by me on that platform," he says. "She\'d be proud of you."']],
  sora_last_letter: [
    ['sora', 'Mika—if you found all twelve fallen stars, you walked every corner of my valley. Good.'],
    ['sora', 'Here is my secret: I never lit the lamps for the train. I lit them so someone would look up.'],
    ['sora', 'Keep looking up, my darling. Love, Grandma.'],
  ],
  ferry_ride: [['rin', "Hold on to something! Ferry's leaving!", 'Pole']],
  ferry_frozen: [['tamo', "The ferry's frozen in till spring! Good news: the whole river is a road now. A slippery road.", 'Happy']],
  ferry_frozen_solo: [['mika', "Frozen in till spring. Fine, I'll walk across. Carefully. Mostly."]],
  ferry_locked: [['rin', "Ferry? Not a chance. Grandpa says nobody crosses until the Mill Lamp's lit.", 'Talk']],
  gate_locked: [['tamo', "The orchard gate is locked tight. Hana has the key to everything up here."]],
  drawbridge_up: [['tamo', "The drawbridge is up. It lifts with the mill wheel, and the wheel isn't turning."]],
  tower_locked: [['tamo', 'The bell-tower door is locked. Hana has the key.']],
  gap_blocked: [['tamo', "That's where the span fell. Don't even THINK about jumping."]],
  bear_blocked: [['tamo', "The bear is asleep across the whole staircase. We can't get past. We need a plan. And maybe a snack."]],

  // ---- chapter celebrations: each lamp wakes the valley up
  c1_party: [
    ['narrator', 'The light runs down the river like a wave, and every cherry tree in Kawabe blooms at once.'],
    ['rin', 'Grandpa! GRANDPA! The koi are jumping! Right over the wheel!', 'Cheer'],
    ['ota', '…Hah. Hahaha! Ten years, and this valley still knows how to throw a party.', 'Wave'],
    ['tamo', 'A rainbow! And look, Mika, the petals are making a star. It points across the river!', 'Happy'],
    ['mika', "To Takamori. Then that's where we're going next."],
  ],
  c2_party: [
    ['narrator', "The bell's last note rolls over the orchard, and every peach tree lights up like a paper lantern."],
    ['hana', 'Fireflies! Thousands of them! Somebody fetch the drums. The summer festival starts NOW!', 'Cheer'],
    ['tamo', 'I may have sparked a little too hard. …Why are the sheep floating?', 'Happy'],
    ['hana', "Never mind the sheep, sweetheart. Dance!", 'Cheer'],
    ['narrator', 'Down on the river, one small lantern boat drifts over from Kawabe. Nobody from Kawabe is waving. Somebody sent it anyway.'],
    ['hana', '…Well, well. The old radish.', 'Cheer'],
  ],
  c3_party: [
    ['narrator', 'The Forest Lamp flares gold, and the whole wood answers.'],
    ['tamo', "Kodama! Forest spirits, hundreds of them! They're rattling their heads. That means hello!", 'Happy'],
    ['narrator', 'The maple leaves let go of their branches and flutter up the shrine steps as golden butterflies.'],
    ['narrator', 'Somewhere on the wind, an old woman laughs, pleased.'],
    ['mika', 'Look who came. Ōkuma, Kon, the deer… everyone.'],
    ['tamo', "It's a moon-viewing! Everybody sit! Kon, no, that's MY dumpling!", 'Happy'],
  ],
  c4_skytrain: [
    ['narrator', 'Then the falling stars gather, one by one, into a train of light that crosses the whole sky.'],
    ['genzo', "That's… the Star Train. And in the window… Sora. She's waving. She's waving at us.", 'Wave'],
    ['ota', 'Of course she is. She always waved first.'],
    ['hana', 'Well, wave back, you two old fools! Everybody wave!', 'Cheer'],
  ],
  c4_photo: [
    ['hana', 'Three buns each. No arguments. Genzo, Ōta: shake hands. Properly.', 'Cheer'],
    ['genzo', '…Friends, then?', 'Bow'],
    ['ota', 'Friends. You still owe me ten years of radish.', 'Wave'],
    ['rin', 'Photo! Everybody squash in on Kobo! Grandpa, smile. Genzo, you too!', 'Cheer'],
    ['genzo', 'I AM smiling.'],
    ['mika', 'Same time next year?'],
    ['ota', 'Same time next year.', 'Wave'],
  ],
  tamo_returns: [
    ['tamo', 'Mika! MIKA! Guess what! The lamp says I get Sundays off!', 'Happy'],
    ['mika', "Tamo! …Wait. Is it Sunday?"],
    ['tamo', "It's Sunday if you say it fast enough! Come on, the whole valley's waiting!", 'Happy'],
  ],

  // ---- homes, keepsakes and the Star Kite
  // These can play in any chapter. When Tamo isn't with Mika (before the chest, or after the finale) the director
  // plays the `<id>_solo` variant instead, so every scene that has Tamo in it has one.
  inside_cottage: [
    ['mika', "Her glasses on the table. Her teacups. A whole shelf of letters. It's like she only just stepped out."],
    ['tamo', 'I know this room! I think. It smells like toast and Sora. Mostly toast.'],
  ],
  inside_cottage_solo: [
    ['mika', "Her glasses on the table. Her teacups. A whole shelf of letters. It's like she only just stepped out."],
    ['mika', 'Did Grandma ever throw anything away? …Good. Neither will I.'],
  ],
  inside_bakery: [['tamo', "Warm! It's so warm in here! Mika, I think I live here now.", 'Happy']],
  inside_bakery_solo: [['mika', 'Peaches, hot sugar, and an oven bigger than my room in the city. I could live in here.']],
  inside_mill: [['mika', 'So this is where Ōta hides. Gears, flour, and a truly worrying amount of pickled radish.']],
  inside_station: [
    ['mika', 'A timetable, a ledger and a ticking clock, all for one little train that runs to the tunnel and back.'],
    ['tamo', 'And pictures of Kobo. And a tiny model of Kobo. Mika, I think Genzo REALLY likes Kobo.'],
  ],
  inside_station_solo: [
    ['mika', "Genzo's office. A ticking clock, a very tidy ledger, and more pictures of Kobo than of people."],
    ['mika', '…And a little model of Kobo on the desk. Of course there is.'],
  ],
  keepsake_photo: [
    ['mika', "'Sora, Genzo, Ōta, Hana. Same time next year.' …Genzo's smiling. I didn't know his face could do that."],
    ['tamo', 'Ōta and Hana, arm in arm, and everybody laughing! Mika, can we keep it? In the journal? Please?', 'Happy'],
  ],
  keepsake_photo_solo: [
    ['mika', "'Sora, Genzo, Ōta, Hana. Same time next year.' …Genzo's smiling. I didn't know his face could do that."],
    ['mika', "Ōta and Hana, arm in arm, and all four of them laughing. …This one's going in my journal."],
  ],
  keepsake_recipe: [['mika', "'Three for Ōta. He'll say he only wants one.' …Ten years of feuding, and she never crossed it out."]],
  keepsake_float: [
    ['tamo', 'Ō and G… Ōta and Genzo! Two floats, tied together. They went fishing TOGETHER!'],
    ['mika', 'And then ten years of pickled radish. Maybe it was never really about the radish.'],
  ],
  keepsake_float_solo: [
    ['mika', 'Ō and G, tied together with twine. Ōta and Genzo used to go fishing together.'],
    ['mika', 'And then ten years of pickled radish. Maybe it was never really about the radish.'],
  ],
  keepsake_ticket: [
    ['mika', "'Genzo, age 9. I will drive this train one day.' …He did, Tamo. He really did."],
    ['tamo', 'Nine? Genzo was NINE once? I thought he came with the moustache.'],
  ],
  keepsake_ticket_solo: [
    ['mika', "'Genzo, age 9. I will drive this train one day.' …And he did. He really did."],
    ['mika', 'Genzo at nine. I bet he already had the frown. Maybe not the moustache.'],
  ],
  kite_found: [
    ['mika', 'A kite? No, it has propellers. And a handlebar. And a note tied to the handlebar.'],
    ['sora', "The Star Kite. It comes when you whistle and goes where my legs won't. Hold on tight, and don't tell Genzo."],
    ['tamo', 'Sora built a FLYING machine! Press G to fly: Space climbs, C dives, Shift goes fast, and G lands.', 'Happy'],
  ],
  kite_found_solo: [
    ['mika', 'A kite? No, it has propellers. And a handlebar. And a note tied to the handlebar.'],
    ['sora', "The Star Kite. It comes when you whistle and goes where my legs won't. Hold on tight, and don't tell Genzo."],
    ['narrator', 'Press G to whistle for the kite. Space climbs, C dives, Shift goes faster, G lands. Genzo need never know.'],
  ],

  // ---- valley friends (first hello with each creature; `_solo` when Tamo isn't with Mika)
  friend_rabbit: [['tamo', "It's so SOFT! And it's wiggling its nose at me! Mika, I don't HAVE a nose. What do I do?", 'Happy']],
  friend_rabbit_solo: [['narrator', 'The rabbit wiggles its nose at Mika. Mika, with enormous self-control, does not wiggle hers back.']],
  friend_chicken: [['mika', 'Pleased to meet you, madam.'], ['tamo', 'She says pleased to meet you too. I think. It might have been a threat.']],
  friend_chicken_solo: [['mika', 'Pleased to meet you, madam.'], ['narrator', 'The hen looks Mika over from boots to scarf, clucks once, and allows it.']],
  friend_cat: [['narrator', 'Mochi opens one eye, decides Mika is acceptable, and purrs like a very small engine.']],
  friend_duck: [['tamo', "Quack! …Did I say it right? They're all looking at me. Mika, what did I SAY?"]],
  friend_duck_solo: [['narrator', 'Mika waves. The ducks discuss her at length, very loudly, and then all waggle their tails at once.']],
  friend_sheep: [['mika', "You're the one who got stuck in the hedge, aren't you?"], ['narrator', 'The sheep does not deny it.']],
  friend_deer: [['tamo', "Shh. Shh! Look at the little one. Don't breathe. Okay—breathe a little."]],
  friend_deer_solo: [['narrator', 'Mika stands very still. The littlest deer steps up, sniffs her scarf, and bounds back to its mother.']],
  friend_fox: [['tamo', 'Kon! You showed us the way! Mika, a scratch behind the ears—he earned it.', 'Happy']],
  friend_fox_solo: [['mika', 'Kon! You showed us the way up to the shrine. Here—a scratch behind the ears. You earned it.']],
  friend_bear: [['tamo', "You patted a BEAR. That's brave. Or silly. …Both! But look, he's smiling in his sleep!", 'Happy']],
  friend_bear_solo: [
    ['narrator', "Mika pats Ōkuma's enormous paw, very gently. He sighs in his sleep, and smiles."],
    ['mika', 'Brave or silly? …Both. Definitely both.'],
  ],
  friends_all: [
    ['tamo', "That's everyone! Every creature in the valley knows your name now.", 'Happy'],
    ['mika', "Grandma would say we've been properly introduced."],
  ],
  friends_all_solo: [
    ['narrator', 'Every creature in the valley has had a proper hello now. The ducks are still talking about it.'],
    ['mika', "Grandma would say we've been properly introduced."],
  ],
};

// Idle chatter per NPC (a line when there's nothing story-related to say). quest.talkFor() rotates through
// every line in any chapter and season, so each line must stay true at any point of the story.
export const CHATTER = {
  genzo: [["Kobo runs better than I do. Don't tell her."], ["Mind the tracks, girl."], ["Sora brought me tea every Friday. Flask tea isn't the same."], ["Cold on the platform, warm in the cab. That's railways."], ["You walk like her, you know. Same stubborn chin."]],
  rin: [["The trout bite best at dusk. The starfin only bites AT dusk."], ["Grandpa's bark is worse than his bite. His bite is also bad."], ["Takamori kids have bikes. We have boats. Boats are better."], ["I tried to catch the golden ayu once. Once."], ["Race you to the dock!"]],
  ota: [["Hmph."], ["Ten years of radish. A man doesn't forget a thing like that."], ["That Hana woman makes a decent bun. Don't repeat that."], ["Rin thinks I don't know she feeds that crab. I know."], ["Keep watch, girl. That's the whole job."]],
  hana: [["Have a bun! No? Have two!"], ["Flour in my hair, flour in my tea. Flour is a way of life, love."], ["Ōta used to come to my stall every festival. Three buns. Always three."], ["My oven's older than the viaduct."], ["A bun is just a hug you can eat, sweetheart."]],
  villager: [["Hoshi Valley's small. Everybody knows everybody's business."], ["They say the stars fall in winter."], ["Sora's granddaughter! You've got her walk."], ["The Star Train! I remember the Star Train."], ["Mind the crows."]],
};

export const JOURNAL = [
  { title: 'Page 1 · The Relay', text: 'Forest, Mill, Orchard, Viaduct. The four lamps watch the river. If one goes dark, the next must go dark. A lit lamp says all is clear; a dark lamp says stop. — S.' },
  { title: 'Page 2 · The Festival', text: 'Ōta and Hana were both at the festival that night. So was I, until I heard the river. The river sounds different when it is angry. — S.' },
  { title: 'Page 3 · Kiku', text: 'Old Kiku put her lamp out that night. She did her part. The rest of us did not. I will not write down who was driving. He knows. — S.' },
  { title: 'Page 4 · Forgiveness', text: 'Genzo, you old snoop, of course you read this. I forgave you before the train stopped rolling. Now forgive yourself, and give this page to Mika. With a bun. — S.' },
];

export const STAR_POEM = [
  'One star for the river,', 'one for the mill,', 'one for the orchard', 'asleep on the hill,',
  'one for the forest,', 'one for the bear,', 'one for the train', 'that carried us there,',
  'one for the watchers', 'who stay up all night,', 'and one for the one', 'who looks up at the light.',
];

export const FISH = {
  trout: { name: 'Rainbow trout', icon: 'fish-trout', weight: 0.6, difficulty: 0.35,
    hint: "Any time, from Rin's dock.", desc: "The valley's everyday fish. Rin grills it in a salt crust, and Grandpa Ōta melts." },
  char: { name: 'River char', icon: 'fish-trout', hue: 150, weight: 0.25, difficulty: 0.5,
    hint: 'Any time, from the dock. It bites less often than trout.', desc: 'Speckled like a winter sky. Rin swears they can see in the dark.' },
  koi: { name: 'Mill koi', icon: 'fish-koi', weight: 0.12, difficulty: 0.45,
    hint: 'Rare, any time. Keep trying.', desc: "Escaped from Ōta's mill pond years ago. He pretends not to miss them." },
  starfin: { name: 'Starfin', icon: 'fish-starfin', weight: 0.0, difficulty: 0.7, dusk: true,
    hint: 'Only at dusk, from about half past five until half past eight.', desc: 'Its fins glow like the Star Lamps. Nobody knows where it sleeps.' },
};

// ------------------------------------------------------------------------------------ captions
// Storytelling across the top of the screen while the train is moving (at most 120 characters each).
// arrival: the prologue, ~4 s a line, before p_arrive (which introduces Kobo and "the last train of winter").
// ride / tour: `at` is the fraction of the way from start to end. Station to Takamori Halt, the train passes Sora's
// cottage (~0.1), crosses the viaduct (~0.19-0.58; the Viaduct Lamp and the mended span ~0.37-0.42) and runs up the
// east bank to the Halt. The tour runs in either direction, so its captions only name the viaduct at 0.42, the one
// point that is on the viaduct both ways.
export const CAPTIONS = {
  arrival: [
    'Ten winters ago, on star-fall night, the Star Train stopped running.',
    'The four Star Lamps went dark. Everybody knows why. Everybody tells it differently.',
    'This evening, one train brings one passenger up from the city.',
    "Her name is Mika. She knows this valley only from her grandmother's letters.",
    "She has come to clear out the cottage. She doesn't know yet that it isn't empty.",
  ],
  // the Star Train, Chapter Four: winter night, star-fall, both villages aboard, Tamo up front with Mika and Genzo
  ride: [
    { at: 0.02, text: 'For the first time in ten years, the Star Train pulls out of Hoshi Station.' },
    { at: 0.14, text: "Past Sora's porch lamp and out onto the viaduct. Genzo keeps one hand near the brake, just in case." },
    { at: 0.32, text: 'Over Kawabe timber and Takamori iron, past the Viaduct Lamp. For once, Tamo is very quiet.' },
    { at: 0.52, text: 'In the first coach, Hana passes Ōta the bun basket. He says he only wants one. He takes three.' },
    { at: 0.7, text: 'Fireworks climb from Takamori to meet the falling stars. Rin cheers the loudest. Obviously.' },
    { at: 0.86, text: 'Four lamps lit, two villages aboard, one little red engine. And everyone, for once, is looking up.' },
  ],
  // the Sunday service in the epilogue (spring; Tamo is home in the Viaduct Lamp): either direction
  tour: [
    { at: 0.02, text: 'Sunday service. Kobo toots twice, huffs once, and rolls out with Mika up front, where the view is.' },
    { at: 0.2, text: "Down on the river, Rin's ferry is on its forty-second crossing today. She is counting. Out loud." },
    { at: 0.42, text: 'Across the viaduct, the Viaduct Lamp burns gold. Mika waves. The small light inside flickers back.' },
    { at: 0.62, text: "Forest, Mill, Orchard, Viaduct: four lamps, all saying 'clear'. Not one has gone out since winter." },
    { at: 0.82, text: 'Somewhere in Kawabe, Ōta waves at the train, then pretends he was swatting a fly.' },
  ],
};

// ------------------------------------------------------------------------------------ valley friends
// Say hello to every kind of creature in the valley (E next to it). The journal keeps the list.
export const FRIENDS = [
  { id: 'rabbit', name: 'Meadow rabbit', icon: 'rabbit', verb: 'Pet the rabbit',
    desc: 'Nibbles clover in the meadows round Kawabe and on the slopes below Takamori.', hint: 'Walk up slowly. Rabbits bolt from anyone who runs.' },
  { id: 'chicken', name: 'Takamori hen', icon: 'chicken', verb: 'Greet the hen',
    desc: "Hana's hens. They believe the bakery belongs to them.", hint: 'In the lanes of Takamori, near the bakery.' },
  { id: 'cat', name: 'Mochi the cat', icon: 'cat', verb: "Scratch Mochi's ears",
    desc: "Sleeps in the middle of Kawabe's main street. Belongs to everybody and nobody.", hint: "Kawabe's main street, usually asleep." },
  { id: 'duck', name: 'River duck', icon: 'duck', verb: 'Wave to the ducks',
    desc: 'Paddles the slow water just upriver of the ferry, loudly.', hint: 'On the river by Kawabe. Swim out and say hello.' },
  { id: 'sheep', name: 'Orchard sheep', icon: 'sheep', verb: 'Pat the sheep',
    desc: "Hana's flock. Excellent at escaping, terrible at coming back.", hint: "In the pen on Takamori's sheep pasture, from Chapter Two." },
  { id: 'deer', name: 'Forest deer', icon: 'deer', verb: 'Say hello to the deer',
    desc: 'A shy family on the plateau above the orchard. The little one is the bravest.', hint: "Through the upper orchard gate. Walk, don't run." },
  { id: 'fox', name: 'Kon the fox', icon: 'fox', verb: 'Say hello to Kon',
    desc: "The shrine's red fox, who wears a bib and knows every path in the forest.", hint: 'Near the forest shrine, from Chapter Three.' },
  { id: 'bear', name: 'Ōkuma the bear', icon: 'bear', verb: 'Pat the sleeping bear (gently)',
    desc: "The forest's great sleeper. Loves honey chestnuts more than anything.", hint: 'Asleep on the shrine stairs, or in his den after Chapter Three.' },
];

// ------------------------------------------------------------------------------------ keepsakes
// One in each home that opens its door to Mika.
export const KEEPSAKES = [
  { id: 'photo', home: 'cottage', where: "Sora's cottage", model: 'keepsake-photo', name: 'Festival photograph', say: 'keepsake_photo',
    text: "Sora, Genzo, Ōta and Hana, squashed onto Kobo's buffer beam at star-fall, the year before the flood. On the back, in Sora's hand, their four names and 'Same time next year.'" },
  { id: 'recipe', home: 'bakery', where: "Hana's bakery", model: 'keepsake-recipe', name: "Hana's bun recipe", say: 'keepsake_recipe',
    text: "Flour, peaches, a pinch of salt—and in Hana's round handwriting: 'Three for Ōta. He'll say he only wants one.'" },
  { id: 'float', home: 'mill', where: "Ōta's mill", model: 'keepsake-float', name: 'Pair of fishing floats', say: 'keepsake_float',
    text: 'Two cork floats, one red and one teal, tied together with twine and carved Ō and G. Somebody has dusted them every week for ten years.' },
  { id: 'ticket', home: 'station', where: "Genzo's station", model: 'keepsake-ticket', name: "Kobo's first ticket", say: 'keepsake_ticket',
    text: "Hoshi Station to Takamori Halt, punched on the first day the line ran. On the back, in a child's pencil: 'Genzo, age 9. I will drive this train one day.'" },
];

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
  { id: 'p.porch', chapter: 0, objective: 'Walk up to the porch lamp and press E', marker: 'target:porchLamp', done: { event: 'spark', target: 'porchLamp' },
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
  { id: 'c1.lamp', chapter: 1, objective: 'Cross to the island and light the Mill Lamp', marker: 'target:millLamp', done: { event: 'spark', target: 'millLamp' },
    exit: [{ cutscene: 'lampLit:mill' }, { lamp: 'mill' }, { say: 'c1_lamp' }, { cutscene: 'celebrate:1' }] },
  { id: 'c1.page', chapter: 1, objective: 'Return to Grandpa Ōta', marker: 'npc:ota', done: { event: 'talk', who: 'ota' }, talk: { ota: 'c1_ota_page' },
    exit: [{ journal: 0 }, { unlock: 'ferry' }, { autosave: true }] },
  // ---------------------------------------------------------------- chapter 2 (summer, Takamori)
  { id: 'c2.ferry', chapter: 2, objective: 'Take Rin\'s ferry across the river', marker: 'interact:ferry',
    enter: [{ chapter: 2 }, { time: 9 }, { season: 'summer' }, { title: 2 }], done: { event: 'ferry', side: 'east' }, exit: [{ say: 'c2_arrive' }] },
  { id: 'c2.hana', chapter: 2, objective: 'Find the Orchard Lamp keeper in Takamori', marker: 'npc:hana', done: { event: 'talk', who: 'hana' },
    talk: { hana: 'c2_hana_meet' }, exit: [{ say: 'c2_hana_tasks' }, { spawn: 'sheep' }] },
  { id: 'c2.sheep', chapter: 2, objective: 'Send the runaway sheep home to the pen ({sheep}/5)', marker: 'place:pen', done: { have: { sheep: 5 } },
    exit: [{ say: 'c2_sheep_done' }, { spawn: 'crows' }] },
  { id: 'c2.crows', chapter: 2, objective: 'Ring the scarecrow bells to scare off the crows ({bells}/5)', marker: 'target:bell', done: { have: { bells: 5 } },
    exit: [{ say: 'c2_crows_done' }, { spawn: 'peaches' }] },
  { id: 'c2.peaches', chapter: 2, objective: 'Pick five ripe peaches ({peach}/5)', marker: 'item:peach', done: { have: { peach: 5 } },
    exit: [{ take: ['peach', 5] }, { say: 'c2_peaches_done' }, { give: ['bun', 1] }] },
  { id: 'c2.bun', chapter: 2, objective: 'Deliver Hana\'s peach bun to Genzo at the station', marker: 'npc:genzo', done: { event: 'talk', who: 'genzo' },
    talk: { genzo: 'c2_genzo_bun' } },
  { id: 'c2.key', chapter: 2, objective: 'Tell Hana what Genzo said', marker: 'npc:hana', done: { event: 'talk', who: 'hana' }, talk: { hana: 'c2_hana_key' },
    exit: [{ take: ['bun', 1] }, { give: ['key', 1] }] },
  { id: 'c2.bell', chapter: 2, objective: 'Climb the bell tower and ring the bell', marker: 'interact:bell', done: { event: 'interact', target: 'bell' },
    exit: [{ say: 'c2_bell' }, { timelapse: 18.7 }] },
  { id: 'c2.lamp', chapter: 2, objective: 'Light the Orchard Lamp on the bell tower', marker: 'target:orchardLamp', done: { event: 'spark', target: 'orchardLamp' },
    exit: [{ cutscene: 'lampLit:orchard' }, { lamp: 'orchard' }, { say: 'c2_lamp' }, { take: ['key', 1] }, { cutscene: 'celebrate:2' }] },
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
  { id: 'c3.lamp', chapter: 3, objective: 'Climb the shrine steps and light the Forest Lamp', marker: 'target:forestLamp', done: { event: 'spark', target: 'forestLamp' },
    exit: [{ cutscene: 'lampLit:forest' }, { lamp: 'forest' }, { say: 'c3_lamp' }, { say: 'c3_page' }, { journal: 2 }, { cutscene: 'celebrate:3' }, { autosave: true }] },
  // ---------------------------------------------------------------- chapter 4 (winter, viaduct)
  { id: 'c4.shed', chapter: 4, objective: 'Find Genzo at the engine shed', marker: 'npc:genzo',
    enter: [{ chapter: 4 }, { time: 10.5 }, { season: 'winter' }, { title: 4 }, { say: 'c4_start' }], done: { event: 'choice', id: 'confession' },
    talk: { genzo: 'c4_confront' }, exit: [{ journal: 3 }] },
  { id: 'c4.gather', chapter: 4, objective: 'Invite Grandpa Ōta and Hana to the station', marker: 'npc:ota|hana', done: { flags: ['invitedOta', 'invitedHana'] },
    talk: { ota: { say: 'c4_gather_ota', flag: 'invitedOta' }, hana: { say: 'c4_gather_hana', flag: 'invitedHana' } }, exit: [{ timelapse: 17.4 }] },
  { id: 'c4.meeting', chapter: 4, objective: 'Meet everyone on the station platform', marker: 'place:platform', done: { event: 'arrive', zone: 'platform' },
    exit: [{ cutscene: 'meeting' }, { sayChoice: 'c4_meeting' }, { say: 'c4_meeting_after' }, { timelapse: 10 }, { spawn: 'repair' }] },
  { id: 'c4.repair', chapter: 4, objective: 'Set the three new beams on the viaduct ({beams}/3)', marker: 'interact:beam', done: { have: { beams: 3 } },
    enter: [{ say: 'c4_repair' }], exit: [{ unlock: 'viaduct' }, { say: 'c4_repaired' }, { timelapse: 19.6 }] },
  { id: 'c4.lamp', chapter: 4, objective: 'Walk to the Viaduct Lamp and light it', marker: 'target:viaductLamp', done: { event: 'spark', target: 'viaductLamp' },
    exit: [{ lamp: 'viaduct' }, { cutscene: 'relay' }, { say: 'c4_lamp' }, { autosave: true }] },
  { id: 'c4.board', chapter: 4, objective: 'Board the Star Train at Hoshi Station', marker: 'npc:genzo', done: { event: 'talk', who: 'genzo' }, talk: { genzo: 'c4_board' } },
  { id: 'c4.ride', chapter: 4, objective: 'Light the trackside lanterns from the Star Train ({lanterns}/8)', done: { event: 'ride', done: true },
    enter: [{ cutscene: 'starTrain' }], exit: [{ cutscene: 'finale' }, { say: 'c4_finale' }, { cutscene: 'farewell' }, { flag: 'tamoHome' }, { cutscene: 'celebrate:4' }] },
  // ---------------------------------------------------------------- epilogue
  { id: 'e.free', chapter: 5, objective: 'Explore Hoshi Valley — find all 12 Fallen Stars ({stars}/12)',
    enter: [{ chapter: 5 }, { time: 10 }, { season: 'spring' }, { title: 5 }, { say: 'epilogue' }, { sayChoice: 'epilogue' }, { cutscene: 'tamoReturns' }, { flag: 'tamoBack' }, { autosave: true }],
    done: { never: true } },
];

export const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));

// ------------------------------------------------------------------------------------ photo album
// Each chapter's celebration takes a photograph for the journal (and the credits).
export const ALBUM = [
  { id: 'c1', title: 'Spring: the Blossom Wave' },
  { id: 'c2', title: 'Summer: the Firefly Festival' },
  { id: 'c3', title: 'Autumn: moon-viewing with the forest' },
  { id: 'c4', title: 'Winter: same time next year' },
];
