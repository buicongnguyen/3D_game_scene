# Farming & Mini Games: implementation plan

Status: **plan**. Nothing here is built yet. It extends Town Life (`docs/TOWNLIFE.md`) and Explore mode.

## 1. Idea

> **Every farm action is a small game.** You don't press a button and wait: you *shake* the tree, *plant* the rice on the
> beat, *guide* the bee, *prune* the right branches. A good round gives more fruit, mon and Harvest Stars; a clumsy one
> still gives a little. Growing, cooking and selling then feel like play, not chores.

Research notes (what similar games do):

- **Hay Day**
  - About 17 trees and bushes unlock by level. Each gives 4 harvests (2, 3, 4, 4 fruit), then dies unless a neighbour helps.
  - Fruit feeds production chains (jam, pies, juice). Trees shelter bees for honey.
  - Points come from orders (truck and boat), fishing with lures, mining, serving town visitors, and the weekly
    **Derby**: 12 task types worth 50–400 points each, for team prizes.
  - Sources: [trees list](https://haydaycalculator.shootingspeed.com/treesAndBushesList/),
    [trees & bushes](https://hayday.fandom.com/wiki/Trees_and_Bushes), [derby tasks](https://hayday.fandom.com/wiki/Derby_Tasks).
- **Stardew Valley**
  - 8 fruit trees, each tied to a season. They take 28 days to mature and need no watering.
  - Fruit is used in recipes and as gifts.
  - Source: [fruit tree guide](https://gamerant.com/stardew-valley-fruit-tree-guide/).
- **Harvest Moon / Animal Crossing**
  - Mini games come from fishing, climbing and festival contests.
  - Animal Crossing adds villager errands, planting trees and shaking trees for fruit.
  - Source: [Harvest Moon mini games](https://harvestmoon.neoseeker.com/wiki/Mini_games_-_HM:MM).

What Starline keeps from them, and what it changes:
- **Kept:** seasonal trees with distinct uses, production chains (recipes), bees, orders, and a weekly task board.
- **Changed:** trees never die (cosy tone); actions are skill mini games; nothing is timed in real-world hours; no
  monetisation.

## 2. Pillars

1. **Short.** A round lasts 45–90 s and can be dropped at any time.
2. **Can't fail.** A poor round still pays something. Stars reward skill, never luck alone.
3. **One input idea per game.** Each game is playable with keyboard, gamepad and touch (one thumb).
4. **Seasons matter.** Each season has its own games and fruit, so a winter visit is worth making (pruning, yuzu).
5. **Never blocks the story.** Farming is optional. Story items (`PROTECTED` in `src/game/folk.js`) are never farm
   goods.
6. **Light.** Phones stay at 60 fps. The draw cost is measured against the previous release (A/B worktree bench, see
   TOWNLIFE.md).

## 3. Player flow

```
Title ─► Explore the valley ─► (season, time) ─► valley
             │
             ▼
   walk / ferry / Kobo the train to a region
             │
             ▼
   Game sign (E) ─► card menu ─► [Play] ─► mini game ─► results (score, ★, goods, mon)
             │                                  │
             └── Harvest board (village square) ◄┘ progress on weekly tasks
```

- **Game signs.** One per region: a lantern post with a painted board. Press E to open a **card menu** listing that
  region's games, with best score, stars (☆☆☆) and lock state ("Unlocks in summer", "Needs 10 ★").
- **Journal → Games tab.** Lists every game, its region, best score and stars. **Show on map** marks the sign.
- **In the story.** A sign appears once its region has been reached in the story. Games out of season show "Come back
  in spring". Points earned in the story count too.
- **Results card.** Shows score, stars earned (1–3 per game for passing the thresholds), goods and mon, plus a line from
  a neighbour ("Hana: Those peaches will make a fine jam!").

## 4. Regions and games

| Region | Sign position (world x, z) | Games | Season |
|---|---|---|---|
| Sora's garden | near the cottage (-56, 132) | Plant & water, **Pruning** | all · winter |
| Kawabe paddies | paddy bank (-70, 24) | **Rice planting**, **Scarecrow guard** | spring · summer |
| Takamori orchard | lane by the gate (88, -60) | **Shake the tree**, **Bee walk** | summer/autumn · spring |
| Forest edge | below the shrine stairs (60, -116) | **Chestnut gather** | autumn |
| Kawabe dock | Rin's dock (-6, 30) | **Fishing** (existing) | all |
| Hana's bakery | inside the bakery (counter) | **Cooking** (existing + new recipes) | all |
| Pasture | fence (140, -26) | **Sheep herding** (existing), **Milk the cow** | all |

Every sign position must pass `placeProblems()` (`src/world/roads.js`) and attach to the road graph. It is checked in
tests.

## 5. Trees

| Tree | Fruit season | Product | Recipe (cooking) | Loved by | Special benefit |
|---|---|---|---|---|---|
| Peach | summer | peach | peach jam, peach pie | Hana | sells best |
| Ume (plum) | early summer (blossom: spring) | ume | umeboshi → rice balls | Mr. Fujita | first blossoms of the year: bees come early |
| Tea bush | spring–summer | tea leaves | roasted tea | Grandpa Ōta | sold to Fujita Grocery |
| Sakura | spring (petals) | petals | sakura mochi | Granny Tsuru | **bees:** trees within 8 m give +1 fruit; petal decor |
| Apple | autumn | apple | apple pie | Mr. Oda | **cow feed:** an apple before milking → bonus milk |
| Persimmon | autumn | persimmon | dried persimmon | Mr. Tanabe | **keeps:** the only autumn fruit usable in winter orders |
| Chestnut | autumn | chestnut | chestnut rice | Mrs. Komori | also wild in the forest (Chestnut gather) |
| Yuzu | winter | yuzu | yuzu tea | Miss Endo | **winter value:** sells ×2 when it snows |

> **Naming caution:** the story already has story items `peach` and `chestnut` (`ITEMS` in `src/game/story.js`). Farm
> goods use **separate keys** (`f_peach`, `f_chestnut`, …) with their own names, so story counts (`done.have`) are never
> touched.

### Growth model
- **Stages:** `sapling → young → fruiting`, plus a visual `blossom` overlay in its blossom season.
- **In the story:** a tree grows one stage per chapter, and one harvest per chapter while in season.
- **In Explore:** a tree grows one stage per in-game day. One harvest per day while in season.
  - A day passes with the "A day passes" time setting, or by **sleeping** at Sora's cottage (new futon hotspot, which
    reuses `indoor.js`).
- **Trees never die.**
- **Pruning** (winter mini game) sets `pruned = true`, which gives +1 fruit next harvest.
- **Sakura bees** give +1 fruit to trees within 8 m.
- **Watering** is optional: it adds +1 fruit if done on the day before harvest. It is a tiny action, not a mini game.
- **Fruit yield per harvest** = `base (2–4) + pruned + bees + watered`.
  - **Shake the tree** turns a harvest into a round, so skill raises the yield; ×1.5 at most.
  - Picking by hand instead (no game) gives the base only.

### Garden
- **Plots:** Sora's garden gets **6 plots** (fixed spots, validated by placement tests).
- **Unlocks:** 4 more plots at 30 ★ and 6 more at 80 ★, on the strip by Kawabe.
- **Saplings:** start with peach, ume and tea. Unlock sakura (10 ★), apple (25 ★), persimmon (50 ★), chestnut (80 ★)
  and yuzu (120 ★).
- **Buying saplings:** at Aiko's stall or the grocer, 6–15 mon.

## 6. Mini game specs

Every game has:
- a pure rules module (scoring, spawn patterns, timing windows) unit-tested in node;
- a runtime scene built on the existing minigame framework (`src/game/minigames.js`: camera, HUD, input lock, results);
- a `stars: [s1, s2, s3]` threshold table;
- `reward(score) → { goods, mon, stars }`.

### 6.1 Shake the tree 🍑 (Phase 1)
- **Setup:** side-on camera at the tree; Mika at the trunk; a basket on the ground under the canopy.
- **Input:** hold **E / A / tap-hold** to shake. Shaking builds a "sway" meter, and fruit drops at random canopy points
  at a rate set by the sway. **Left/right / stick / drag** moves the basket.
- **Objects:**
  - fruit: +1;
  - golden fruit: +3, rare (5%);
  - leaf: 0;
  - caterpillar: −1, with a little squeak;
  - a falling **bird's nest:** a 2 s pause while you set it back. This is a friendly penalty.
- **Length:** 60 s. Over-shaking (meter in red for over 2 s) drops 3 leaves and stops the fruit for 1 s.
- **Score:** fruit caught. Stars at 20 / 35 / 50.
- **Reward:** goods = `round(yield × clamp(score / 30, 0.5, 1.5))`. Mon = score / 10. Stars from the table.
- **Feel:** fruit bounces in the basket, the basket squashes on each catch, juicy pop sounds; the camera shakes with the
  sway (small).
- **Acceptance:**
  - plays at 60 fps on phone-tier quality;
  - touch: hold the left half of the screen to shake, drag the right half to move the basket;
  - three runs with recorded inputs produce the expected scores.

### 6.2 Bee walk 🐝 (Phase 3, spring)
- **Setup:** top-down over the orchard.
- **Input:** steer the bee with WASD / stick / drag.
- **Goal:** visit glowing blossoms before the nectar bar empties. Every 5 blossoms makes a honey jar. Spider webs slow
  you; wind gusts push you.
- **Length:** 75 s. Stars at 8 / 14 / 20 blossoms.
- **Lasting effect:** every round adds `bees += blossoms / 10` (capped) to that orchard, which gives +1 fruit next
  harvest.

### 6.3 Rice planting 🌾 (Phase 3, spring)
- **Setup:** Mika and two villagers in a paddy row; the camera behind them.
- **Input:** a rhythm game. Notes scroll toward a line; press on the beat (E / A / tap).
  - Perfect within 60 ms, good within 120 ms, miss otherwise.
  - A long note (hold) plants a full bundle.
- **Music:** the existing synth plays a rice-planting work song (pentatonic, 96 bpm). The villagers sing "ho-i!" on the
  bar lines.
- **Length:** 4 rows of 16 beats. Stars at 70% / 85% / 95% accuracy.
- **Reward:** rice bundles (a farm good). Finished rows stay planted in the paddy for the season (visual).

### 6.4 Scarecrow guard (Phase 4, summer)
- **Setup:** crows swoop at the rice in arcs. A shadow and a caw warn of each one.
- **Input:** tap or click the crow (touch), or aim and spark (keyboard: a reticle snaps to the nearest crow).
- **Length:** 60 s. Stars at 15 / 25 / 35 crows shooed.
- **Extra:** Mr. Kubo cheers on combos. The scarecrow wears the old shirt from Town Life once you have delivered it.

### 6.5 Pruning ✂️ (Phase 3, winter)
- **Setup:** close-up on a bare tree. Branches glow one by one.
- **Input:** cut (E / A / tap) brown dead wood; let green buds pass. Each branch shows for 1.2 s, getting faster.
- **Length:** 30 branches. Stars at 20 / 25 / 28 correct.
- **Lasting effect:** score ≥ 20 sets `pruned` on that tree (+1 fruit next harvest).

### 6.6 Chestnut gather (Phase 4, autumn)
- **Setup:** Mika runs in a forest clearing (third person, small arena).
- **Hazards:** spiky husks drop with growing shadows. A hit stuns for 0.8 s (no damage).
- **Goal:** pick up chestnuts (glint).
- **Length:** 60 s. Stars at 15 / 25 / 35.

### 6.7 Milk the cow (Phase 4)
- **Input:** alternate left/right (A/D, LT/RT, or two thumbs) in rhythm with a pulsing bar. The bucket fills.
- **Bonus:** an apple fed first gives a ×1.3 "happy cow" bonus.
- **Length:** 40 s. Stars at 60% / 80% / 95% of the bucket.

### 6.8 Existing games made replayable (Phase 2)
- **Fishing:** existing, at the Kawabe dock sign.
- **Cooking:** existing, at Hana's bakery. New recipes:
  - peach jam, peach pie, umeboshi, roasted tea, apple pie, dried persimmon, chestnut rice, yuzu tea, sakura mochi.
  - Each takes farm goods and gives a cooked good worth 2–3× the raw goods.
- **Sheep herding:** existing, at the pasture sign.
- These games already exist for the story. A sign starts a free-play round that doesn't touch story steps (needs a
  `practice` flag in `minigames.js`).

## 7. Harvest Stars and the Harvest board

- **Harvest Stars (★):**
  - earned from mini games (1–3 per game per new threshold reached, so each game gives at most 3) and from board tasks;
  - spent on nothing, they only unlock things (trees, plots, decorations), so they are never lost.
- **Harvest board:** one in each village square (Kawabe main street, Takamori square).
  - **5 tasks a week**, from about 25 task kinds. Points as in the Hay Day Derby: 50–400 by effort.
  - Examples:
    - "Catch 40 fruit in one Shake the tree" (150);
    - "Deliver 6 peaches to Hana" (200);
    - "Plant 2 rows of rice" (100);
    - "Make 2 jars of jam" (250);
    - "Help 2 neighbours" (300, ties into Town Life stages);
    - "Catch 3 trout" (150);
    - "Herd the sheep in under 40 s" (200).
  - **A week** is 7 in-game days in Explore, or one chapter in the story.
  - **Finishing all 5** gives a weekly gift: a garden decoration (a stone lantern, a bench, wind chimes, a koi bowl) or a
    rare sapling, plus 2 ★.
- **Neighbour orders.** Town Life stages may now ask for farm goods (e.g. Fujita: 3 umeboshi; Oda: 2 apples). These
  are added to `src/content/townsfolk.js` as new stages, with the same strict-order and "true until the epilogue" rules.

## 8. Data (content files)

```js
// src/content/trees.js
export const TREES = {
  peach: { name: 'Peach tree', product: 'f_peach', season: 'summer', blossom: 'spring', base: 3,
           loves: 'hana', unlock: 0, price: 8, models: ['tree-peach-sapling', 'tree-peach-young', 'tree-peach'] },
  // … ume, tea, sakura, apple, persimmon, chestnut, yuzu
};
export const PLOTS = { garden: [[-58, 128], [-55, 128], …], kawabe: [[-30, 20], …] };   // validated placements

// src/content/minigames.js
export const GAMES = {
  shake: { name: 'Shake the tree', region: 'orchard', seasons: ['summer', 'autumn'], stars: [20, 35, 50], length: 60 },
  // … bee, rice, scarecrow, prune, chestnut, milk, fishing, cooking, sheep
};
export const SIGNS = { orchard: { x: 88, z: -60, games: ['shake', 'bee'] }, … };

// src/content/harvest.js
export const TASKS = [{ id: 'shake40', text: 'Catch {n} fruit in one Shake the tree', n: 40, points: 150, kind: 'score', game: 'shake' }, …];
export const RECIPES = { jam: { in: { f_peach: 3 }, out: 'f_jam', price: 14 }, … };
export const FARM_GOODS = { f_peach: { name: 'Peach', icon: 'f-peach', price: 3 }, … };  // become ITEMS like GOODS
```

## 9. Code

| Module | Kind | Responsibility |
|---|---|---|
| `src/game/garden.js` | pure | plant, grow (by chapter or day), harvest yield, pruning, bees, watering; serialise |
| `src/game/harvest-board.js` | pure | weekly task draw (seeded by week), progress events, completion, rewards |
| `src/game/minigames/rules/*.js` | pure | per-game scoring, spawn patterns, timing windows, stars |
| `src/game/minigames/*.js` | runtime | each game's scene (camera shot, objects, HUD, input) on the existing minigame framework |
| `src/game/farm.js` | runtime | signs and card menu, garden plots and tree models, board UI wiring, results card, rewards |
| `src/ui/games.js` | UI | card menu, results card, journal Games tab, board panel |

- **Events:** every game emits `{ type: 'farm', game, score, goods }`. The board listens and counts progress; Town Life
  stages can require farm goods through their `needs` as usual.
- **Day counter (Explore):** `state.farm.day` advances when the shown hour wraps past 05:00 on "A day passes", or when
  Mika sleeps at the cottage.

### Save (added to `freshState`, cleaned in `migrate`)
```js
farm: {
  day: 0, stars: 0, best: { shake: 0, … }, starsBy: { shake: 1, … },
  trees: [{ plot: 'garden:0', kind: 'peach', stage: 2, planted: 3, harvestedOn: 5, pruned: false, watered: 4 }],
  plots: ['garden'], board: { week: 2, tasks: [{ id: 'shake40', done: false, progress: 12 }] }, bees: { orchard: 1.5 },
}
```

## 10. Art (Blender, `art/blender/build_farm.py`)

| Asset | Count | Budget | Notes |
|---|---|---|---|
| Trees: 8 kinds × sapling/young/fruiting | 24 | ≤ 2.5k tris (fruiting), ≤ 600 (sapling) | ≤ 3 materials; fruit as a separate instanced mesh so harvested fruit can be removed |
| Blossom overlays (ume, sakura, peach, apple) | 4 | ≤ 400 | instanced petals |
| Game sign, Harvest board | 2 | ≤ 800 | painted board via a vertex-colour atlas |
| Props: basket, watering can, shears, honey jar, milk bucket, seedling tray, rice bundle | 7 | ≤ 500 each | grip-ready (see GRIP in townlife.js) |
| Garden decor rewards: stone lantern, wind chimes, koi bowl, bench, bird house | 5 | ≤ 1.2k | |
| Icons: farm goods + cooked goods | ~22 | 160 px webp | `render_icons.py` |
| Mika clips: Shake, Water, Prune, Plant, Milk | 5 | — | `player_anims.py` (like Sit/Pet) |
| Villager clip: Plant | 1 | — | rice-planting crowd |

- **Loading:** farm models load lazily, on the first visit to a garden, orchard or sign, so start-up time doesn't grow.
- **Budget:** about +1.5–2 MB packed. Raise `TOTAL_PACKED_BYTES` with a comment.
- **Review renders:** `review_render.py` for every growth stage and clip, checked by eye before use.

## 11. Audio
- **Synth (`src/engine/audio.js`):**
  - fruit pop and bounce;
  - basket thump;
  - bee buzz (pitched by speed);
  - snip;
  - rice-planting song (pentatonic, 96 bpm, with a "ho-i!" shout as a short noise burst plus a tone);
  - crow caw;
  - milk splash;
  - star fanfare (reuses `fanfare`).

## 12. Testing

| Test | What it checks |
|---|---|
| `tests/garden.test.mjs` | growth by chapter and by day; seasons; yield formula; pruning, bees and watering; never dies; save round trip |
| `tests/minigames-rules.test.mjs` | each game's scoring with recorded input sequences; star thresholds; reward caps; can't-fail minimum |
| `tests/harvest-board.test.mjs` | the weekly draw is deterministic per week; progress events; completion pays once |
| `tests/farm-content.test.mjs` | signs and plots pass `placeProblems` and attach to roads; every tree, recipe and good is well formed; story items never used; icons exist |
| `tests/i18n.test.mjs` | all new text in vi/ko/ja (extractor collects trees, games, tasks, recipes, goods) |
| Browser probes | Explore → each sign → menu → play a scripted round → results; touch on a 390×844 phone; 60 fps; draw-cost A/B vs the previous release |
| Autopilot | `tests/e2e/run.mjs` still finishes the story with no change in time (signs must not steal focus: prio below story items) |

## 13. Phases

### Phase 1: signs, garden, Shake the tree
- [ ] `content/trees.js` (peach, ume, tea), `content/minigames.js` (shake), `PLOTS.garden` (6)
- [ ] `game/garden.js` + tests
- [ ] Blender: 3 trees × 3 stages, fruit mesh, game sign, basket; Mika `Shake`, `Water`, `Plant`
- [ ] `game/farm.js`: game signs + card menu; plant (buy a sapling at the stall) / water / harvest by hand
- [ ] Shake the tree: rules + scene + results card; Harvest Stars; journal **Games** tab
- [ ] Explore: in-game days on "A day passes"; sleep at the cottage (futon hotspot)
- [ ] i18n, docs, probes, autopilot, deploy

### Phase 2: board, recipes, replayable games
- [ ] Harvest board (both villages), weekly tasks, weekly gift
- [ ] Cooking: 9 new recipes; farm goods sold at shops; neighbour stages asking for farm goods
- [ ] Fishing, cooking and sheep herding replayable from signs (`practice` mode)

### Phase 3: spring and winter
- [ ] Rice planting (rhythm) + work song; planted rows stay for the season
- [ ] Bee walk + bees bonus; honey
- [ ] Pruning + pruned bonus

### Phase 4: the full set
- [ ] Sakura, apple, persimmon, chestnut, yuzu (models, recipes, benefits)
- [ ] Chestnut gather, Milk the cow, Scarecrow guard
- [ ] Garden decorations from weekly gifts; extra plots at 30/80 ★

Each phase is delivered on its own: tests, browser checks on desktop and phone, A/B draw cost, autopilot, commit,
push, and Pages deploy.

## 14. Risks
- **Scope.** Phase 4 is large. Each phase stands alone, so the game is complete after any of them.
- **Phone performance.** Many trees means instancing and lazy loading. Fruit is instanced; trees past `npcDraw`-like
  distances freeze their sway.
- **Story conflicts.** Separate `f_*` keys, signs whose priority sits below story interactions, and nothing in the story
  requires farming.
- **Clock.** The story clock is frozen at story hours, so growth in the story uses chapters. Day-based growth is
  Explore only.

## 15. Decisions for the owner
1. Trees never die (proposed) vs Hay Day-style 4 harvests.
2. Sapling prices (6–15 mon) and the star unlock curve (10/25/50/80/120).
3. Whether the Harvest board also appears in story saves from chapter 2 (proposed: yes, as optional side content).
