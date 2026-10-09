# "A Year with Grandma": the default story

Status: **built and the default story.** Script: `src/game/stories/grandma.js`; switching: `src/game/stories/index.js`.
The original story stays playable as **"Starline Classic"** (see §7).

## 1. In one paragraph

Mika, 13, comes from the city on the last train of winter to spend a year with **Grandma Sora** in Hoshi Valley while
her parents work abroad. Grandma is cheerful, busy and a little forgetful, and her knees aren't what they were, so this
year Mika does the jobs: fixing, fetching, picking, cooking, helping. On the first night Grandma opens an old chest,
and inside sleeps **Tamo**, the little star she looked after when *she* was a girl. Tamo wakes for Mika. Together, job
by job and season by season, they light the four Star Lamps so that the valley's **Star Festival train** can run again
at the end of winter. On festival night the Star Train pulls in, **Mika's parents step off**, and the whole valley
celebrates under the falling stars.

**Tone:** warm, funny, cosy. No death, no disaster, no blame. Problems are small and solvable (a stuck wheel, runaway
sheep, a nervous bear, an old bridge), and every one is solved by people helping each other.

## 2. Characters (what changes)

| Character | Classic | A Year with Grandma |
|---|---|---|
| **Mika** (13) | clearing out her late grandmother's cottage | staying the year with Grandma; city kid, dry humour, slowly falls for the valley |
| **Grandma Sora** (72) | died before the story; heard only in letters | **alive and on screen.** Star-lamp keeper with bad knees; cheerful, bossy, forgetful, a great cook; calls Mika "Mi-chan" |
| **Tamo** | found in Sora's chest | the same chest, but Grandma opens it *with* Mika: "He was my friend when I was your age. Let's see if he remembers how to wake up." |
| **Genzo** (70) | Kobo's driver who hid his part in the flood | Kobo's driver and Grandma's oldest friend (and rival at shogi). Grumbles, jokes, secretly sentimental; dreams of running the Star Train one more time |
| **Rin** (14) | lonely fisher girl | the same, but Grandma has decided Rin and Mika will be friends ("I've told her you're coming. She pretended not to care.") |
| **Grandpa Ōta** (74) | let his lamp shine on the flood night | proud mill keeper too stubborn to ask for help; Grandma asks for him |
| **Hana** (46) | holds a grudge about the flood | Takamori's warm baker. She and Ōta have a long friendly rivalry ("three buns" is still the running joke) |
| **Mika's parents** | – | appear at the end, stepping off the Star Train (villager bodies with new colours) |
| **Kon the fox, Ōkuma the bear, Kobo the engine** | unchanged | unchanged |

**The "twist"**, a happy one: in the epilogue Grandma admits she could have asked anyone to help with the lamps. "But I
wanted you to meet everyone. Now the valley is yours too." She also wrote ahead to Mika's parents to make sure they
would come on the Star Train.

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
- `c1.ota` → Grandpa Ōta refuses help ("The wheel is *resting*.") Grandma's advice afterwards: "He's never said no to a grilled trout."
- `c1.rinPlan`, `c1.fish`, `c1.trout` → Rin teaches Mika to fish (the first friendship scene); the trout softens Ōta.
- `c1.cogs`, `c1.wheel` → the crab stole the cogs (comedy chase); the wheel turns again.
- `c1.lamp` → the Mill Lamp: Mika and Tamo light it together; Kawabe cheers from the street.
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
- `c3.landslide` → the old path slid after heavy rain *long ago*: just a scenic spot now with a sign Genzo carved: "Path moved. Mind the bear."
- `c3.bear` → Ōkuma, the gentle bear, is sitting on the Forest Lamp's steps because he's hungry; honey chestnuts move him along.
- `c3.lamp` → the Forest Lamp.
- **Party:** moon-viewing. **The whole village eats Grandma's soup**, cooked with Mika's ingredients.

### Chapter 4: winter, "The Star Train comes home"
- **Grandma's list:** help Genzo · invite everyone · mend the bridge · light the last lamp · ride the train
- `c4.shed` → Genzo at the engine shed: Kobo is ready but the old viaduct needs new beams, and he's too stubborn to ask. **No confession and no choice.** This step finishes with talking to Genzo. (Story data: `done: { event: 'talk', who: 'genzo' }` in this story.)
- `c4.gather` → Mika invites Ōta and Hana to the station "for Genzo"; both pretend they were coming anyway.
- `c4.meeting` → **the happy meeting.** Genzo asks for help (it costs him!). Kawabe and Takamori both volunteer, and argue cheerfully about who carries more beams. Grandma: "Seventy years and you finally said please."
- `c4.repair`, `c4.lamp` → set the beams, light the Viaduct Lamp.
- `c4.board`, `c4.ride` → Mika and Grandma ride the Star Train; Mika lights the trackside lanterns, Grandma waves at everyone.

### Ending: festival night
- The Star Train pulls into Hoshi Station with the whole valley on the platform.
- **Mika's parents step off**: they came early, because Grandma wrote to them in autumn.
- Fallen stars light up the sky; group photo.
- Grandma: "Same time next year?" Mika: "Obviously."

### Epilogue: spring (free roam)
- The 12 Fallen Stars and Grandma's treasures continue as now. **Grandma is at home** in the cottage (or in her garden) to talk to; her chatter changes with the season.
- The "twist" letter is now a talk with Grandma on the porch: she wanted Mika to meet everyone.
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
