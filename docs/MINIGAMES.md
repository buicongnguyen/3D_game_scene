# Starline mini games: design

Companion to `docs/FARMING-PLAN.md`, which covers trees, garden, Harvest board and build phases. This document covers
the **ten mini games**: why they exist, what they share, and how each one plays.

## 1. The idea: every action is a game

In a plain farming game you click, wait, collect and buy. It works, but it gets boring: the player's hands have nothing
to do.

In Starline **every farm action is a short game you play with your hands**:

| Instead of… | …you play |
|---|---|
| pressing "Harvest" | **Shake the Tree**: shake, then catch the fruit in a basket |
| waiting for bees | **Bee Walk**: fly the bee from blossom to blossom |
| pressing "Plant" | **Rice Planting**: plant on the beat of the work song |
| guarding crops off-screen | **Scarecrow Guard**: shoo the crows yourself |
| a "+1 yield" upgrade | **Pruning**: cut the dead wood, spare the buds |
| picking up forest drops | **Chestnut Dash**: grab chestnuts while spiky husks rain down |
| "Collect milk" | **Milk the Cow**: keep the rhythm, fill the bucket |
| "Catch fish" | **Fishing**: cast, wait, reel against the line |
| "Craft jam" | **Kitchen Rush**: cook orders against the clock |
| "Send the sheep home" | **Sheep Herding**: herd them through the gate |

**Skill turns into goods.** A good round gives more fruit, honey, rice or milk, more mon and **Harvest Stars**. A clumsy
round still gives something, so nobody is punished for playing.

**Why this makes the whole game more interesting:**
1. **Variety.** Ten different hand-feels: catching, steering, rhythm, aiming, timing, dodging, alternating, tension,
   juggling, herding.
2. **Short sessions.** 30–90 s each: a quick game on a phone, or a long relaxed afternoon going round the valley.
3. **Seasons give a reason to come back.** Spring is rice planting and bees; summer is shaking trees and the
   scarecrow; autumn is chestnuts; winter is pruning.
4. **Feeds the rest of the game.** Goods go into recipes, shop sales, neighbours' requests and the weekly Harvest
   board, so playing a game moves everything else forward.
5. **Mastery.** Stars, personal bests and harder rounds keep the games fresh after the first try.

## 2. What every game shares

### 2.1 How a game starts
- **Explore mode:** walk to a region's **game sign**, press E, pick a card, press Play.
- **Story:** the same signs appear once the story has reached that region. A game that is out of season shows when it
  returns ("Back in spring").
- **Journal → Games tab:** every game with its region, season, best score and stars. **Show on map** marks the sign.

### 2.2 The round
```
Intro card (3 s: goal + controls for this device) ─► Countdown 3-2-1 ─► Play (30–90 s) ─► Results card
```
- **Pause:** Esc, Start or the ⏸ button freezes the round. **Quit** still pays for what was earned so far.
- **Results card:**
  - score and personal best (a "New best!" ribbon);
  - stars ☆☆☆;
  - goods and mon earned;
  - one line from the neighbour who cares, e.g. *Hana: "Those peaches will make a fine jam!"*;
  - buttons: **Play again** / **Done**.

### 2.3 Rewards
- **Score → goods:** `goods = base × clamp(score / par, 0.5, 1.5)`. A round never pays less than half.
- **Stars:** 3 thresholds per game. Each threshold reached for the first time gives 1 ★, so 3 ★ at most per game.
  Stars only unlock things (trees, plots, decorations, harder rounds) and are never spent or lost.
- **Mon:** about score ÷ 10, with a per-day cap per game in Explore (e.g. 60 mon) so one game can't be farmed for money.
- **Daily first-play bonus:** the first round of each game each day gives ×2 goods.

### 2.4 Difficulty: Gentle, Normal, Bright
- **Gentle** (the default): slower, wider timing windows, no penalties.
- **Normal:** unlocked at 1 ★ in that game.
- **Bright:** unlocked at 3 ★. Faster, more hazards, ×1.5 goods and a gold border on the results card.
- **Story Easy mode** sets Gentle. **Hard mode** starts on Normal.

### 2.5 Juice (feel) checklist, for every game
- [ ] A satisfying hit sound and a small squash or pop on every success
- [ ] A combo counter with a rising pitch; it resets gently (no harsh buzzer)
- [ ] The last 10 s pulse the timer and speed up the music slightly
- [ ] Confetti and Tamo's sparkle burst on stars (reuse `celebrate.js`); Tamo cheers if he is present
- [ ] The camera holds a clean, readable shot (no follow-cam drift), and the HUD stays in the screen's safe area on phones

### 2.6 Controls: one idea per game, every device
| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Main action | E / Space | A | tap / hold the right half |
| Move or steer | WASD / arrows | left stick | drag the left half (virtual stick) |
| Pause | Esc | Start | ⏸ button |

**Accessibility:**
- every timing game has a **Wide timing** option;
- colour is never the only cue (shapes and outlines too);
- "Hold to repeat" can replace button mashing.

### 2.7 Weekly and seasonal extras
- **Harvest board tasks** use game results, e.g. "Catch 40 fruit in one Shake the Tree" (see FARMING-PLAN.md).
- **Festival weeks**, one per season:
  - spring: the Rice Planting Festival;
  - summer: the Orchard Fair (Shake the Tree plus Kitchen Rush);
  - autumn: the Chestnut Race;
  - winter: the Pruning Contest.

  During one, villagers gather at that game's sign, a scoreboard of their (scripted) scores goes up, and beating the
  top villager wins a festival ribbon for the garden.
- **Achievements, kept in the journal:** for example "All fruit, no caterpillars", "Perfect row", "Bee without a single
  web", "100 crows shooed".

## 3. The ten games

Each entry: **hook**, **where/when**, **how it plays**, **controls**, **rules and scoring**, **difficulty**,
**rewards and links**, **feel**, **build notes**, **done when**.

---

### 3.1 Shake the Tree 🍑
- **Hook:** shake hard enough to drop the fruit, but not so hard that the leaves come down instead, then catch it all.
- **Where/when:** Takamori orchard, your garden trees. Summer and autumn; any fruiting tree.
- **How it plays:**
  - side-on shot of the tree;
  - Mika at the trunk, a basket under the canopy;
  - shaking fills a **sway meter**, and fruit drops from random branches at a rate set by the sway;
  - move the basket under the falling fruit.
- **Controls:** hold the main action to shake; move left/right to steer the basket. On touch: hold the left half, drag
  the right half.
- **Rules:**

  | Falling thing | Score |
  |---|---|
  | fruit | +1 |
  | golden fruit (5%) | +3 |
  | leaf | 0 |
  | caterpillar | −1, a squeak |
  | bird's nest (rare) | catch it and the round pauses 2 s while Mika puts it back |

  - **Over-shaking** (meter in the red over 2 s) drops a shower of leaves and stops the fruit for 1 s.
  - 60 s. Stars at **20 / 35 / 50**.
- **Difficulty:** Bright adds wind (fruit drifts) and more caterpillars.
- **Rewards and links:** fruit of that tree (peach, ume, apple, persimmon, yuzu). Feeds Kitchen Rush recipes and
  neighbours' requests.
- **Feel:**
  - fruit bounces and settles in the basket, which squashes on each catch;
  - juicy pops rise in pitch with the combo;
  - the tree sways with real bend (vertex sway shader, the same as the foliage);
  - petals fall in spring.
- **Build notes:** fruit is an instanced mesh on the branches and is removed as it falls; there are 8 tree types. The
  rules module is about 120 lines.
- **Done when:**
  - three recorded-input runs give the expected scores;
  - 60 fps at phone-tier quality;
  - touch works one-handed per half.

---

### 3.2 Bee Walk 🐝
- **Hook:** be the bee. Zip from blossom to blossom before your nectar runs out.
- **Where/when:** Takamori orchard, your garden. Spring (blossom season).
- **How it plays:**
  - top-down view of the orchard;
  - steer a bee; glowing blossoms refill its nectar bar;
  - every 5 blossoms make a **honey jar**;
  - spider webs slow the bee, and wind gusts (leaves streaming) push it.
- **Controls:** steer with the stick, WASD or a drag. Main action = a short **dash** (cooldown 3 s).
- **Rules:** 75 s, or until the nectar runs dry. Stars at **8 / 14 / 20** blossoms.
- **Difficulty:** Bright shrinks blossoms and adds a curious swallow that you must dodge.
- **Rewards and links:**
  - honey jars;
  - **lasting effect:** each round adds bees to that orchard, giving +1 fruit at the next harvest;
  - honey is used in sakura mochi and yuzu tea.
- **Feel:**
  - a buzz pitched by speed;
  - pollen puffs on each visit, and blossoms close when visited;
  - a little bee trail of light motes.
- **Done when:** steering feels responsive on touch, no input lag over 50 ms, 60 fps on phone tier.

---

### 3.3 Rice Planting 🌾
- **Hook:** a rhythm game with the whole village: plant on the beat of the old planting song.
- **Where/when:** Kawabe paddies. Spring.
- **How it plays:**
  - Mika and two villagers stand in a flooded row, camera behind;
  - notes scroll toward a line, and you press on the beat;
  - **long notes** are held to plant a full bundle;
  - the villagers sing "ho-i!" on the bar lines, and planted seedlings appear in the water as you go.
- **Controls:** main action on the beat. Hold for long notes.
- **Rules:**
  - timing: Perfect within ±60 ms, Good within ±120 ms (both doubled with Wide timing), Miss otherwise;
  - 4 rows × 16 beats at 96 bpm;
  - stars at **70% / 85% / 95%** accuracy.
- **Difficulty:** Bright at 112 bpm with syncopation and double notes.
- **Rewards and links:**
  - rice bundles, for rice balls in Kitchen Rush;
  - **lasting effect:** finished rows stay planted in that paddy for the season.
- **Feel:**
  - a pentatonic work song made with the synth;
  - a splash on every plant;
  - the villagers' arms swing in time;
  - on a perfect row the whole field ripples.
- **Build notes:** an audio-clock-driven note chart (the audio context's time, not frame time), plus a latency
  calibration screen (tap along) in Settings.
- **Done when:** the chart stays in sync at 30 and 60 fps; calibration works; recorded inputs score correctly.

---

### 3.4 Scarecrow Guard 🐦‍⬛
- **Hook:** the crows are back for the rice, and you are faster than any scarecrow.
- **Where/when:** Kawabe paddies. Summer (the rice stands tall).
- **How it plays:**
  - crows swoop in on arcs toward the rice;
  - a shadow and a caw warn of each one;
  - tap or click a crow to shoo it (it flaps off cawing, unharmed);
  - a crow that lands nibbles a little rice until shooed.
- **Controls:**
  - **touch / mouse:** tap the crow;
  - **keyboard or gamepad:** a reticle snaps to the nearest crow, press the main action. In Hard mode it uses the free
    spark aim (Tamo's spark), as in the story.
- **Rules:** 60 s. Stars at **15 / 25 / 35** crows shooed. Landed crows lower the rice bonus but never end the round.
- **Difficulty:** Bright adds a sneaky crow that hides behind the scarecrow, and pairs that dive together.
- **Rewards and links:**
  - a rice bonus for the season's harvest;
  - Mr. Kubo cheers combos;
  - the scarecrow wears Goro's old shirt once you delivered it (Town Life).
- **Feel:** feathers burst; crow caws pitched per crow; a "shoo!" bubble; Kubo's bark lines.
- **Done when:** the aim assist never picks a crow behind the camera; touch hit areas are at least 48 px.

---

### 3.5 Pruning ✂️
- **Hook:** read the tree. Snip the dead wood, spare the buds, and next year's harvest grows.
- **Where/when:** your garden trees and the orchard. Winter.
- **How it plays:**
  - close-up on a bare, snowy tree;
  - branches light up one at a time;
  - **brown, cracked** dead wood: cut it; **green, budding** branches: let them pass.
  - The pace rises: 1.2 s per branch at the start, 0.7 s at the end.
- **Controls:** main action to cut. Doing nothing lets a branch pass.
- **Rules:**
  - 30 branches, stars at **20 / 25 / 28** correct;
  - cutting a bud is a gentle "oops" and costs 1;
  - colour-blind safe: dead wood is also **cracked with no buds** (a shape cue).
- **Difficulty:** Bright adds **frosted** branches. Wipe the frost first (one press), then judge.
- **Rewards and links:**
  - **lasting effect:** score ≥ 20 marks that tree as pruned, for +1 fruit at its next harvest;
  - a little firewood for the cottage hearth (decoration).
- **Feel:** a crisp snip, twigs falling into the snow, a light snowfall, Mika's breath in the cold.
- **Done when:** both cues (colour and shape) are visible on phone-tier quality.

---

### 3.6 Chestnut Dash 🌰
- **Hook:** the forest drops two things: chestnuts and spiky husks. Grab one and dodge the other.
- **Where/when:** the forest edge below the shrine. Autumn.
- **How it plays:**
  - Mika runs around a small clearing (third person, fixed high camera);
  - chestnuts glint on the ground;
  - husks fall from the trees, with a growing shadow before each lands;
  - a hit makes Mika "ouch!" and stops her for 0.8 s (no damage);
  - squirrels sometimes steal a chestnut you're heading for.
- **Controls:** move with the stick, WASD or a drag. Main action = a short dive (cooldown).
- **Rules:** 60 s. Stars at **15 / 25 / 35** chestnuts. A **golden chestnut** (rare) counts as 5.
- **Difficulty:** Bright makes husks fall in patterns (rings, lines) and adds wind gusts.
- **Rewards and links:**
  - chestnuts (farm good `f_chestnut`, separate from the story's chestnuts) for chestnut rice;
  - Mrs. Komori loves them.
- **Feel:** a crunch underfoot; leaves swirl; husks thunk and bounce; Kon the fox may watch from the edge (a cameo if
  befriended).
- **Done when:** every husk shadow shows at least 0.6 s before impact; never unfair spawns (no husk inside 1 m of a
  just-spawned chestnut).

---

### 3.7 Milk the Cow 🐄
- **Hook:** keep a happy rhythm and the bucket fills. Rush it and Hanako the cow gets fussy.
- **Where/when:** the pasture (Takamori) and the Kawabe meadow cows. Any season.
- **How it plays:**
  - side shot of the cow and the bucket;
  - a pulsing bar shows the rhythm;
  - press left, then right, on each pulse;
  - a happiness meter: good rhythm keeps it high, mashing drops it (the cow sways her tail and moos).
- **Controls:** alternate A/D, LT/RT, or the left and right thumbs on touch. Wide timing is available.
- **Rules:** 40 s. Stars at **60% / 80% / 95%** of the bucket.
- **Difficulty:** Bright makes the rhythm drift (speeds up and slows down), so you have to listen.
- **Rewards and links:**
  - milk, for sakura mochi and the bakery;
  - feeding an **apple** first gives a ×1.3 "happy cow" bonus (from the apple tree).
- **Feel:** a soft splash per squeeze; the cow's ear flicks on good beats; a contented moo at the end.
- **Done when:** rhythm detection is frame-rate independent; touch two-thumb works.

---

### 3.8 Fishing 🎣 (existing, upgraded)
- **Hook:** the existing fishing game becomes replayable, with **bait from the farm**.
- **Where/when:** the Kawabe dock sign, and any fishing spot in Explore. All seasons (a frozen river in winter means ice
  fishing through a hole).
- **How it plays:** the current fishing game (`src/game/minigames.js`): cast, wait for the bite, reel while keeping the
  line tension in the safe band.
- **New in this version:**
  - **Bait:**
    - a rice ball for trout;
    - persimmon for koi;
    - honey for the rare starfin, at night only.
  - **The catch log** (`fishLog`) counts fish caught here too.
  - A **practice** flag, so a round never touches story steps.
- **Rules:** 90 s of fishing or 5 catches. Stars by total weight: **3 / 6 / 10 kg**.
- **Rewards and links:** fish (sold to Fujita's grocery or the stall), Rin's lines on the results card, and Harvest board
  tasks.
- **Done when:** story fishing steps are unchanged (the autopilot passes); practice rounds never change story state.

---

### 3.9 Kitchen Rush 🍳 (Cooking, upgraded)
- **Hook:** Hana's bakery on a busy morning: orders pile up, and you chop, stir and bake to fill them.
- **Where/when:** inside Hana's bakery (the counter sign). All seasons.
- **How it plays:**
  - order tickets slide in, e.g. *peach jam*, *chestnut rice*, *yuzu tea*;
  - each recipe is 2–3 quick steps that reuse the existing cooking moves: **chop** (tap on beats), **stir** (circle the
    stick), **bake** (stop the heat needle in the green);
  - finished dishes go to the waiting neighbour on the counter.
- **Controls:**
  - main action to chop;
  - circle the stick / WASD to stir (circle a finger on touch);
  - main action to stop the needle.
- **Rules:** 90 s. Stars by orders filled: **4 / 7 / 10**. Late orders still pay half.
- **Recipes:**

  | Dish | Ingredients |
  |---|---|
  | peach jam | peach ×3 |
  | peach pie | peach ×2 + milk |
  | umeboshi | ume ×3 |
  | rice ball | rice + umeboshi |
  | roasted tea | tea leaves ×3 |
  | apple pie | apple ×2 + milk |
  | dried persimmon | persimmon ×2 |
  | chestnut rice | chestnut ×3 + rice |
  | yuzu tea | yuzu + honey |
  | sakura mochi | rice + milk + honey (spring) |

- **Rewards and links:**
  - cooked goods worth 2–3× their ingredients;
  - neighbours' favourite dishes as gifts;
  - Harvest board tasks.
- **Feel:** sizzles, steam puffs, ticket bells; Hana says "Order up!"; flour puffs on mistakes.
- **Done when:** the existing story cooking step still works unchanged; every recipe can be made from goods the farm
  produces.

---

### 3.10 Sheep Herding 🐑 (existing, upgraded)
- **Hook:** the story's sheep-herding chase becomes a timed challenge with obstacles.
- **Where/when:** the pasture sign. All seasons. Winter means snowdrifts that slow the sheep.
- **How it plays:** the current herding: walk behind the sheep to push them through the gate.
- **New in this version:**
  - a **stopwatch**;
  - more sheep in Bright (7);
  - Mr. Oda's dog helps if befriended: it stops one stray at a time;
  - hazards: a muddy patch and a flower bed you mustn't trample.
- **Rules:** herd all the sheep into the pen. Stars by time: **60 / 45 / 35 s**.
- **Rewards and links:**
  - wool (sold, or kept for winter decorations);
  - Mr. Oda's thanks;
  - Harvest board tasks ("Herd in under 40 s").
- **Done when:** the story's herding step is unchanged; the practice round resets the sheep afterwards.

## 4. How the games feed each other

```
Bee Walk ──► honey ──────────────┐
   │ (+1 fruit)                  ▼
Shake the Tree ─► fruit ─► Kitchen Rush ─► cooked goods ─► neighbours' gifts / shop sales / board tasks
   ▲  (+1 fruit)                 ▲   ▲
Pruning                 Rice Planting  Milk the Cow ◄── apple (happy cow)
                          ▲ (rice bonus)
                    Scarecrow Guard
Chestnut Dash ─► chestnuts ─┘     Fishing ◄── bait from the farm (rice ball, persimmon, honey)
Sheep Herding ─► wool ─► decorations
```

Every game makes at least one other game or system better. That is what keeps the player going round the valley.

## 5. Build order

| Phase | Games | Why first |
|---|---|---|
| 1 | Shake the Tree | the core loop: trees → fruit → stars |
| 2 | Kitchen Rush, Fishing + Sheep Herding (practice) | uses fruit; reuses existing games; quick wins |
| 3 | Rice Planting, Bee Walk, Pruning | seasons; the first rhythm game sets up the audio-clock tools |
| 4 | Scarecrow Guard, Chestnut Dash, Milk the Cow | the full set, festival weeks, achievements |

Each phase ships with:
- rules unit tests from recorded inputs;
- browser probes for desktop and a 390×844 phone;
- 60 fps at phone tier;
- a draw-cost A/B against the previous release;
- vi/ko/ja text;
- the full-story autopilot;
- deploy.

## 6. Shared code to build once (Phase 1)
- **`src/game/minigames/round.js`:** the round life cycle (intro, countdown, play, pause, results), timer, combo, score
  popups, the device-specific controls hint.
- **`src/game/minigames/rules/*.js`:** pure rules per game (scoring, spawns seeded per round, timing windows, stars).
  Tested with recorded inputs.
- **`src/ui/games.js`:** sign card menu, intro card, results card, journal Games tab.
- **`src/engine/audio.js` additions:** pop, thump, buzz, snip, caw, splash, sizzle, a beat clock for the rhythm games.
- **The save** (`state.farm.best`, `starsBy`, `daily`), cleaned in `migrate` like the Town Life fields.
