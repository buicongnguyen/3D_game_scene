# "A Year with Grandma": the default story

Status: **built and the default story.** Script: `src/game/stories/grandma.js`; switching: `src/game/stories/index.js`.
The original story stays playable as **"Starline Classic"** (see §7).

## 1. In one paragraph

Mika, 13, comes from the city on the last train of winter to spend a year with **Grandma Sora** in Hoshi Valley while
her parents work abroad. **Last autumn the river flooded.** Nobody was hurt, but it carried off the lamp oil, three cogs
of the mill wheel and the middle of the viaduct, and with the young folk away working in the city, nothing has been
mended: the four tall Star Lamps (oil lamps, lit every evening by match up a ladder) are dark, and the Star Train
missed star-fall for the first time in sixty years. Grandma, who wanders the valley all day with food for everyone and
knows nothing about electricity ("the what-tricity?"), has a list of jobs. Mika has a suitcase of light bulbs from her
mum and what she learned in the science club. She turns Ōta's water mill into a generator, and season by season she
and **Tamo**, the little star from Grandma's chest, fit an electric bulb in each lamp. To the valley it looks like
magic: light with no match, no oil and no smoke. She is **"the girl who brought the light"**. On festival night the
Star Train runs again over a valley full of electric light, and **Mika's parents step off**.

**Tone:** warm, funny, cosy. No death, no disaster, no blame, no danger, no sad goodbyes. The flood is a thing that
"borrowed" and "rearranged"; what is broken is small and fixable (a wheel, a lamp, a bridge), and every fix is done by
people helping each other, with a child's school knowledge as the surprise ingredient.

## 1a. Voice and facts (keep every new line consistent with this sheet)

**What happened**
- **The flood: last autumn**, one year before the story. "The river came up for a visit." Nobody was hurt; the valley
  sat on the station hill eating Sora's rice balls and watched. Verbs for it: *borrowed, took, rearranged, tidied up,
  moved the furniture*. Never: drowned, destroyed, lost for good, tragedy.
- **What it took:** the lamp oil (barrels and all); three cogs from Ōta's mill wheel (one in the reeds, one found and
  hidden by Rin's cousins, one kept by a crab); the three middle beams of the viaduct; a few gates and fences; it moved
  the forest path (the mossy slide with Genzo's bear sign). The schoolroom roof still wants mending.
- **Why nothing was mended:** the young people have been away working in the city, some for ten years. The old folk
  manage by candle, cheerfully, and go to bed early. As the lamps come on, families come home (Town Life).
- **The Star Lamps before:** oil lamps on towers (Forest, Mill, Orchard on the bell tower, Viaduct). Every evening
  somebody climbed the ladder with a match, and Tamo "tickled the wick". Since the flood: no oil, nobody for ladders.
- **The Star Train** runs at star-fall (winter festival). It cannot cross until the viaduct has its beams and all
  four lamps shine. It missed last winter ("Genzo sulked until March"). Oil came back to Fujita's by April: Grandma
  could have had the lamps lit the old way, and waited for Mika on purpose (the epilogue's happy secret).

**What Mika does, chapter by chapter**
| Chapter | Fix | Who it delights |
|---|---|---|
| Prologue | Tamo lights the porch **oil** lamp with a spark: the old way, shown once | Grandma |
| 1 spring | finds the three cogs, bolts **Kobo's spare dynamo** (lent by Genzo) to the mill axle, runs a wire to the island; first **bulb**: the Mill Lamp | Ōta (blew on it), Rin, Kawabe; the Nakanos, the Ishidas and Miss Endo come home |
| 2 summer | the wire crosses on Rin's ferry rope; bulb in the Orchard Lamp on the bell tower | Hana (held a bun up to it), Mr. Oda, the Tanabes |
| 3 autumn | bulb in the tall Forest Lamp at the shrine | Kon, Ōkuma, the forest path; Kiku hears by letter |
| 4 winter | both villages set the viaduct's three beams; the last bulb, the Viaduct Lamp; the Star Train runs | everybody; Mum and Dad |

**Who knows what**
- **Mika:** city kid, dry humour. Knows electricity from the school **science club** (they built a bicycle-dynamo
  lamp) and from her parents. Her mum packed the third suitcase with **light bulbs**. She explains simply: "the wheel
  spins the dynamo, and it pushes light down the wire".
- **Grandma Sora (72):** cheerful, bossy, always on her rounds with pickles, rice balls and tea. Says
  **"the what-tricity"**, "your lamp magic", "the light-thing". Proud and amazed, never sad, never worried.
- **Tamo:** a hoshibi (star-fire). He still sparks small things (the porch lamp's wick, the crab, the scarecrow
  bells, the hive, the trackside paper lanterns) and gave the dynamo "its first spark, to wake it up". He is **not**
  what lights the Star Lamps here: he **carries each bulb up** ("no ladder!") and screws it in, and is a little
  jealous of the bulbs. He napped in the chest for **one year** (since the oil ran out). At the end he appoints
  himself **Night Watchman of the Lights**, moves into the Viaduct Lamp's empty oil-house ("a place of his own") and
  visits on Sundays: a proud move, never a farewell.
- **Ōta:** grumpy-delighted miller. "Elec-what?", "Light down a wire. Hmph." Secretly thrilled; tells Sora he fixed
  the wheel himself.
- **Everyone else:** to them a bulb is magic. Running jokes: blowing on it to put it out; asking where the oil goes;
  "a light in a glass pear"; "one switch, one finger".
- **Lamps "keep memories"** (unchanged): when a lamp comes on, Tamo sees young Sora there.

**Words**
- A lamp is *fitted with a bulb* and *switched on*; it *shines* or *glows*. Only oil lamps, lanterns and stoves
  *burn* or are *lit with a match*. Street lanterns and festival lanterns stay paper and flame (Mrs. Ishida likes
  the match).
- Prompts: "Fit the new bulb: Mill Lamp"; objectives: "fit the new bulb and switch on the …".
- Lines stay ≤ 135 characters, barks and overheard lines ≤ 58, and true for their whole chapter range.

**In the game** the lamp steps keep their ids, triggers and inputs (walk up, aim, press). Only the Grandma story
re-skins them: `structures.setLampStyle('electric')` (a bulb in each lantern head, clear panes, steady warm white, on
at a click), the spark carries a bulb (`tamo.fire(to, hit, carry)`), and the cutscene adds the switch click and the
dynamo hum. Classic keeps flames and sparks.

## 2. Characters (what changes)

| Character | Classic | A Year with Grandma |
|---|---|---|
| **Mika** (13) | clearing out her late grandmother's cottage | staying the year with Grandma; city kid, dry humour, slowly falls for the valley |
| **Grandma Sora** (72) | died before the story; heard only in letters | **alive and on screen.** Star-lamp keeper with bad knees; cheerful, bossy, forgetful, a great cook; calls Mika "Mi-chan" |
| **Tamo** | found in Sora's chest; his spark lights the lamps | the same chest, opened by Grandma *with* Mika; asleep one year. He still sparks small things, but the Star Lamps are electric here: he carries each bulb up and screws it in (see §1a) |
| **Genzo** (70) | Kobo's driver who hid his part in the flood | Kobo's driver and Grandma's oldest friend (and rival at shogi). Grumbles, jokes, secretly sentimental; dreams of running the Star Train one more time |
| **Rin** (14) | lonely fisher girl | the same, but Grandma has decided Rin and Mika will be friends ("I've told her you're coming. She pretended not to care.") |
| **Grandpa Ōta** (74) | let his lamp shine on the flood night | proud mill keeper too stubborn to ask for help; Grandma asks for him |
| **Hana** (46) | holds a grudge about the flood | Takamori's warm baker. She and Ōta have a long friendly rivalry ("three buns" is still the running joke) |
| **Mika's parents** | – | appear at the end, stepping off the Star Train (villager bodies with new colours) |
| **Kon the fox, Ōkuma the bear, Kobo the engine** | unchanged | unchanged |

**The "twist"**, a happy one: in the epilogue Grandma admits the lamp oil was back by April and she could have had the lamps lit the old way. "Your mother wrote that you made a lamp out of a bicycle. I wanted to see what you'd make out of a valley."
She also wanted Mika to meet everyone, and wrote ahead to Mika's parents to make sure they would come on the Star Train.

## 3. The year, step by step

The step ids stay the same as Classic, so the engine, saves, the autopilot (`tests/e2e/run.mjs`) and the mini games keep
working. Each chapter's objective panel reads like **Grandma's list** ("Grandma's list: ✓ trout for Ōta · cogs · fix
the wheel").

### Prologue: late winter, "Welcome home"
| Step | Classic | A Year with Grandma |
|---|---|---|
| `p.arrive` | Genzo meets Mika at the station | **Grandma and Genzo** meet her on the platform. Grandma with a hand lantern and a big hug; Genzo carries the bags and complains about it |
| `p.cottage` | walk up to Sora's empty cottage | walk up the bluff with Grandma (she walks slowly, chatting; "That's Kawabe. That's the river. That's where I fell in, 1968.") |
| `p.chest` | open Sora's chest alone | **Grandma opens the chest with Mika.** Tamo wakes up and is overjoyed to see Sora again ("Sora! You got… taller? No. Wrinklier!"), then decides Mika is his new partner |
| `p.porch` | light the porch lamp | Grandma's first job: "Light the porch lamp for me, dear. My hands are cold, and Tamo listens to you now." |

### Chapter 1: spring, Kawabe, "The stuck wheel"
- **Grandma's list:** trout for Ōta · find the mill cogs · fix the wheel · light the Mill Lamp
- `c1.rin` → Grandma sends Mika to the dock: "Rin knows everyone. Tell her I sent you."
- `c1.ota` → Grandpa Ōta refuses help ("Elec-what?… The wheel is *resting*. Three cogs short since the flood.") Grandma's advice afterwards: "He's never said no to a grilled trout."
- `c1.rinPlan`, `c1.fish`, `c1.trout` → Rin teaches Mika to fish (the first friendship scene); the trout softens Ōta.
- `c1.cogs`, `c1.wheel` → the flood scattered the cogs and a crab kept one (comedy chase); Mika fits the cogs and bolts Kobo's spare dynamo to the axle. The wheel turns and hums.
- `c1.lamp` → the Mill Lamp: Tamo carries the first bulb up, click, light with no match. Kawabe stares. Ōta blows on it.
- `c1.page` → **Grandma's star diary.** Back home, Grandma reads Mika a page from the diary she kept as a girl, about the first lamp she lit. (These replace "Sora's pages": the same journal tab, now *with* her.)
- **Party:** the Blossom Wave. Grandma dances badly and proudly.

### Chapter 2: summer, Takamori, "Peaches for the festival"
- **Grandma's list:** cross the river · help Hana · peaches for my jam · light the Orchard Lamp
- `c2.ferry` → Rin's ferry (Grandma: "Rin's ferry is the only boat in the valley that's never sunk. She's very proud of that.")
- `c2.hana` → Hana needs help before the Firefly Festival: the sheep got out and the crows are in the orchard.
- `c2.sheep`, `c2.crows`, `c2.peaches` → Mr. Oda's sheep, the scarecrow bells, five ripe peaches (for Grandma's famous jam).
- `c2.bun`, `c2.key` → Hana sends a peach bun to Genzo; he sends back the bell-tower key and a grumpy note that is secretly a thank-you. (Classic's hidden-guilt meaning is gone; it's now about old friends who show love with buns.)
- `c2.bell`, `c2.lamp` → ring the bell, light the Orchard Lamp.
- `c2.page` → Hana gives Mika **Grandma's jam recipe**, which Grandma "lent" her in 1985 and never got back.
- **Party:** the Firefly Festival. Grandma and Hana judge the jam contest; Ōta loses again.

### Chapter 3: autumn, the forest, "Grandma's soup"
- **Grandma's list:** chestnuts · mushrooms · honey · find out why the forest lamp is dark · light it
- `c3.fox`, `c3.follow` → Kon the fox leads Mika up to the shrine (Grandma: "Kon was a kit when I last went up. Bring him a rice ball.")
- `c3.gather`, `c3.cook` → gather the soup ingredients and cook honey chestnuts at the shrine hearth.
- `c3.landslide` → last year's flood moved the forest path: a mossy, flowery spot now with a sign Genzo carved: "Path moved. Mind the bear."
- `c3.bear` → Ōkuma, the gentle bear, is sitting on the Forest Lamp's steps because he's hungry; honey chestnuts move him along.
- `c3.lamp` → the tall Forest Lamp gets its bulb ("and I carried it. No ladder!").
- **Party:** moon-viewing. **The whole village eats Grandma's soup**, cooked with Mika's ingredients.

### Chapter 4: winter, "The Star Train comes home"
- **Grandma's list:** help Genzo · invite everyone · mend the bridge · light the last lamp · ride the train
- `c4.shed` → Genzo at the engine shed: Kobo is ready but the old viaduct needs new beams, and he's too stubborn to ask. **No confession and no choice.** This step finishes with talking to Genzo. (Story data: `done: { event: 'talk', who: 'genzo' }` in this story.)
- `c4.gather` → Mika invites Ōta and Hana to the station "for Genzo"; both pretend they were coming anyway.
- `c4.meeting` → **the happy meeting.** Genzo asks for help (it costs him!). Kawabe and Takamori both volunteer, and argue cheerfully about who carries more beams. Grandma: "Seventy years and you finally said please."
- `c4.repair`, `c4.lamp` → set the beams where the flood "borrowed the middle"; the last bulb, the Viaduct Lamp.
- `c4.board`, `c4.ride` → Mika and Grandma ride the Star Train; Mika lights the trackside lanterns, Grandma waves at everyone.

### Ending: festival night
- The Star Train pulls into Hoshi Station with the whole valley on the platform.
- **Mika's parents step off**: they came early, because Grandma wrote to them in autumn.
- Tamo appoints himself Night Watchman of the Lights and moves into the Viaduct Lamp ("See you Sunday"). Fallen stars light up the sky; group photo.
- Grandma: "Same time next year?" Mika: "Obviously."

### Epilogue: spring (free roam)
- The 12 Fallen Stars and Grandma's treasures continue as now. **Grandma is at home** in the cottage (or in her garden) to talk to; her chatter changes with the season.
- The "twist" letter is now a talk with Grandma on the porch (see above): the oil was back by April; she waited for Mika on purpose.
- **Farming** (`docs/FARMING-PLAN.md`) fits naturally here: Grandma gives Mika her first saplings and the garden becomes theirs.

## 4. What gets rewritten

| Area | Change |
|---|---|
| `DIALOGUE` (story.js) | every scene that mentions Sora's death, the flood, blame or the confession; Grandma joins prologue, chapter-ends and the ending |
| Letters / journal ("Sora's pages") | become **Grandma's star diary**, read together; same tab and page count |
| Keepsakes | same objects, new meaning: things Grandma asks Mika to fetch from neighbours' homes (the festival photo, Hana's bun recipe, the fishing floats, Kobo's first ticket) |
| Gifts | the same friends' gifts, now "for Grandma and Mika" |
| Chapter 4 steps | `c4.shed` without the choice; `c4.meeting` happy scene; `sayChoice` variants removed in this story |
| Ending | the parents arrive; the final lines |
| CHATTER, barks, Town Life stages/convos | lines about the flood or Sora being gone get a Grandma-story variant (each line can carry `story: 'classic'` or `story: 'grandma'`) |
| Art | **Grandma Sora**: new villager-style character (headscarf, apron, cardigan, walking stick, round glasses), clips Idle/Walk/Talk/Wave/Cheer/Sit/Bow, plus a dialogue portrait. Parents: villager bodies, new tints. |
| Translations | all new and changed lines in Vietnamese, Korean and Japanese |

## 5. What stays the same
- The valley, the four lamps, the seasons, every story step id and objective mechanic, the mini games (fishing, cooking,
  sheep), the parties and photos, the Star Train ride, the Fallen Stars and treasure hunt.
- Town Life, the shops, the indoor spots and house memories, Explore mode.

## 6. Writing rules for this story
- Warm, witty, sincere, as before. **Nobody is to blame for anything.**
- Grandma's voice: short sentences, gentle bossiness, food metaphors, old stories that go slightly off track.
- Tamo is present from `p.chest` to the ending, as in Classic. Tamo-free (`_solo`) variants are still needed for the epilogue.
- Lines stay ≤ 135 characters and true for their whole chapter range.

## 7. Two stories in one game (how switching works)
- **Data:**
  - `src/game/story.js` keeps the shared structure (steps, items, places);
  - per-story text lives in `src/game/stories/classic.js` and `src/game/stories/grandma.js`: dialogue, chatter, journal, keepsake and gift texts, plus small step overrides (`c4.shed` done rule, the ending);
  - `story(id)` merges the shared structure with the chosen story.
- **Save:**
  - `quest.state.story = 'grandma' | 'classic'`;
  - old saves without the field load as **classic**, so nobody's game changes underneath them.
- **New Game:** after picking a slot, a small card asks "Which story?". **A Year with Grandma** is preselected (default);
  **Starline Classic** is the other choice, labelled "the original, more bittersweet story".
- **Settings → Story:** the default story for the next new game. A story already in progress never switches.
- **Slot list:** shows the story name under each save ("A Year with Grandma · Chapter 2").
- **Explore mode:** uses the Grandma story's world (Grandma at home).
- **Tests:**
  - the full-story test (`tests/story.test.mjs`) runs **both** stories;
  - the autopilot gets `--story=grandma|classic`, defaulting to grandma;
  - i18n covers both.

## 8. Build plan (after approval)
1. Split story text into `stories/classic.js` and `stories/grandma.js`; story selection in the save, New Game card,
   Settings, slot list. Classic must play exactly as today (autopilot, `--story=classic`).
2. Write the Grandma story's dialogue, diary, keepsake/gift texts, chapter 4 and the ending (English), with Town Life
   variants.
3. Blender: Grandma Sora model, clips and portrait; parents' tints; Grandma's places in each chapter (station,
   cottage, porch, festival spots).
4. Translations (vi/ko/ja), tests for both stories, the autopilot for both, probes, deploy.

## 9. Questions for you
1. Grandma's age and look: 72, headscarf, apron and walking stick. OK?
2. Mika's parents arriving at the end: yes? (Or Grandma alone, or a surprise visitor?)
3. Should Grandma ever walk around the valley (e.g. at the festivals and parties) or stay home except for the start
   and the end?
4. The name in the New Game card: "A Year with Grandma"? Other ideas: "Grandma's Starline", "Stars over Hoshi Valley".
