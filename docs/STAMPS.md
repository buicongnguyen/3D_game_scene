# The daily stamp card (Explore)

A small reason to come back to the valley every day: three little jobs from the neighbours, each worth a stamp, and
stamps that slowly fill Grandma's cottage with decorations. Explore only. Built in phase D (docs/AAA-PLAN.md).

## What the child sees

1. **A card arrives.** Entering Explore on a new day: the toast "A new stamp card came in the post! See the journal."
   The next journal open lands on **Neighbours**, with the card at the top.
2. **The objective card** reads the first job not done yet, for example "Stamp card 0/3: Take the Kawabe letters to
   Mr. Sato". With all three done: "Stamp card full. A new one comes tomorrow."
3. **Deliver.** The yellow arrow leads to the sender's front door ("Collect: the Kawabe letters"), then to the
   recipient's ("Deliver: the Kawabe letters"). A red stamp slams onto a little card near the top of the screen:
   "Stamp! 1/3".
4. **Find.** Something a neighbour lost bobs and glints at one of three spots (the arrow points there once the delivery
   is done). Walking onto it picks it up; Mika bends down for it.
5. **Play.** "Play Tug of war", asked by Hiro, with a **Play** button on the card (the Mini games menu starts it).
   Any play of that game counts, from anywhere: the valley, the title's Mini games, a play zone, the quick runtime
   (they all write the Explore save's records).
6. **Full card.** "Card full! A bonus stamp". Crossing a threshold: "New in the cottage: A paper lantern". On the next
   visit to the cottage the new decoration sparkles (after any new gifts); if Mika is inside already, at once.
7. **Lucky stamp.** Seeing a weather moment (docs/WEATHER-MOMENTS.md) adds "Lucky stamp: Sun shower!" once per card,
   as a bonus (it is not one of the three). The card's lucky row shows only where a moment can really come
   (`g.moments`, and neither `g.momentsOff` nor `g.weatherOff`) or one was already seen on this card.
8. **Tomorrow** (local 04:00) brings a new card. Stamps are banked at once. No streaks, no penalties, no weekdays.

Out of scope: story saves, play zones' own sessions and the quick runtime's screen show no card (their plays still
count). No shop or mon rewards, no new journal tab, no Settings switch, no new models.

## Files

| File | What |
|---|---|
| `src/game/stamps-rules.js` | Pure rules: day keys, `pick`, `drawCard`, `validateCard`, `award`, `luck`, thresholds, the card's words, the arrow's target. |
| `src/game/stamps-save.js` | The save shape only: `freshStamps`, `cleanStamps`, `stampsWanted` (quest.js stays light). |
| `src/content/stamps.js` | Tables: `DELIVERIES`, `FINDS`, `DECOR`, `playAsker`. Strings as `N_()`. |
| `src/game/stamps.js` | The runtime (a lazy chunk): interacts, the find pickup, decorations, the feedback queue, QA hooks. |
| `src/ui/stamps-ui.js` | The card in the Neighbours tab and the stamp pop (`#stampPop`). Styles in `src/ui/style.css`. |
| `tests/stamps.test.mjs` | Unit tests, including every decoration measured against `public/models/interior-cottage.glb`. |
| `tests/stamps-browser.mjs` | The browser suite (phone upright; see below). |

Hooks elsewhere (one line each): `quest.js` (`stamps` in `freshState`, `cleanStamps` in `migrate`); `director.js`
(the lazy load in `begin`, `stamps.update` after `updateValley`, the arrow after the story's own marker, the find's
glint and label, `collect` without a lasting flag and with the bend-down, the Explore objective line, the cottage
reveal in `enterHome`; also the pickup loop's grab point is a scratch vector now: no allocation per pickup per frame);
`ui.js` (the `#stampCard` section first in the Neighbours tab; the Explore "Start over" question names the stamps);
`celebrate.js` (`indoorSprites`: see below).

## Rules

- **Day.** `dayKeyOf(date)` is the local date of `date - 4 h` as `YYYY-MM-DD`; keys compare in calendar order.
  `shouldRoll(s, today)`: no card yet, or a later day, unless a parcel is being carried (the roll then waits until it is
  delivered, across reloads too). A clock moved back keeps the card. The roll is checked on load, every 30 s and when
  the journal shows the card.
- **Drawing.** `pick(day, slot, n, salt)` is deterministic per day and slot, never yesterday's pick, and shows every entry
  once in every run of `n` days: days go in blocks of `n`, each block a shuffle of all `n` (FNV-1a `hash32` seeds a
  mulberry32 shuffle); where a block would start with the entry the previous block ended on, its first two swap. The
  find's spot is `hash32(day|1|spot) % 3`. `drawCard` gives `[deliver, find, play]`; the play task keeps the game's
  progress as `base` and is done when progress grows past it (tricks and yard: the record's `plays`; fishing: every
  fish in `fishLog`).
- **Games.** Every trick and playground game, plus one fishing place (`fish:dock`). Never `sky` (its progress caps) or
  `workshop` (a build session). Sorted by id. Askers: playground games Hiro (Takamori yard) or Kenta (Kawabe), fishing
  Mr. Nakano, tricks Grandma Sora.
- **Stamps.** `award(s, slot)` stamps once; the third also banks `cards + 1` and the bonus stamp. `luck(s, name)` once per
  card, +1, not toward 3/3. `total` never goes down. Decorations unlock at 2, 4, 8, 12, 16, 20, 26 and 32.
- **Content changes.** `validateCard` draws again only a slot whose id left the tables, keeping whether it was done.

## Save

`quest.state.stamps = { day, tasks, total, cards, lucky, seen }` (about 80 bytes empty). `cleanStamps` turns garbage
into a fresh card and a card of the wrong shape (not exactly deliver, find, play; wrong flag types; spot or base not a
whole number) into a redraw that keeps the banked stamps. `lucky` holds the English name of the moment seen (shown with
`tx`), at most 24 characters. `SAVE_VERSION` stays 1: the field is additive and old saves get an empty card from
`migrate`. Explore "Start over" rebuilds `exploreState()`, so the stamps and decorations start again (photos stay).

## Look and cost

- **The find.** A boot prop (ball, letters, hoe, bucket, bug net, basket) at its spot, bobbing and glinting like a hunt
  treasure, no shadow. Its plain opaque parts are merged into one vertex-coloured mesh (the same rules as
  `engine/static-merge.js`), so it is one draw, or two: the bug net's see-through net (drawn in one pass from a copy of
  its material, never the firefly game's shared one) and the hoe's and bucket's metal keep their own material. Picked up
  as item `'stamp'`, which is no ITEMS id: nothing lands in the inventory and no flag is set. Its merged geometry is freed
  once the bend-down has put it away (on game time, so a pause in between cannot free it while it is still drawn).
- **The find waits for free play.** It is hidden, and cannot be picked up, while a round, a launch, the sky or the
  workshop owns the screen (a spot may lie in a practice ground: Mika would crouch for it mid-round) and in the tour.
- **Its glint** is gated by the camera: nothing beyond 90 m or more than 2 m behind the camera (the arrow leads there),
  the plain glint from 40 m, the strong one with its rising column close up (plain again from governor level 2).
- **The scene tour.** The live tour lends the Director a throwaway story (`game/tour.js`). The runtime keeps the save it
  was built for (`this.quest`); while another is lent (`borrowed()`) the card sleeps: no day check, no stamps, no find,
  no arrow, no objective line, an empty card in the journal.
- **The decorations** are clones under the cottage room's own group (room-local coordinates, drawn only while Mika is
  inside, no per-frame code), merged the same way (about 11 draws for all eight), no shadows. A piece with thin
  one-layer sheets (the geraniums, the paper flowers' petals and leaves, the jar's cloth lid) uses the two-sided copy of
  the merged material, so the sheets do not vanish from behind. Each rests on its surface by its own bounding box (the
  lantern and the basket have their origin at the top). The lantern's `Lantern glow` part stays separate, so the game's
  glow driver lights it at night without a light.
- **Sparkles indoors.** `celebrate.root` is a scene child at y = 0, which the interiors hide while Mika is in a room, so
  `giftGlow` was invisible indoors (only its pooled light showed). `Celebrate.indoorSprites()` makes, on first use, a
  second glow sprite system (same shader: no new program) in the interiors group, and `giftGlow` sends its sprites there
  while Mika is inside. That fixes the old gift sparkles too.
- **Feedback** waits for a free screen (no round or launch, dialogue, panel or pause) and shows one item every 1.9 s.
  The pop sits 22 % down the screen, or just under the objective card and the Mini games chip when they reach lower,
  never in the lower half (the stick, the buttons); `prefers-reduced-motion` fades it only. Its empty live region
  (`role=status`) is made when the runtime starts, so the first "Stamp! 1/3" is announced too; its rings are
  `aria-hidden`. A stamped job reads "Stamped" (its own key: the shared "Done" is a close button elsewhere).
- **CPU.** `update` does a 1 Hz play check and a 30 s day check; the arrow reads a reused vector.

## Decoration spots

Room-local three.js coordinates of `interior-cottage` (door at +Z). Surfaces are the measured visible tops: counter
1.106, platform 0.24, getabako 0.904, low table 0.600, floor 0 (the Col boxes alone are not enough: the table's box is
0.26 m taller than its top, the getabako's 16 mm). Test 8 in `tests/stamps.test.mjs` is the referee: inside the walls,
resting on the face under its centre (within 12 mm: nothing floats or sinks), none of the room's own things (cups, the
teapot, the boxes on the tansu, the geta) inside its box, 3 cm clear of every other piece of furniture, 0.45 m from the
hotspot stands, Spawn and Exit, 0.35 m from the gifts, keepsake and kite, top under 2.4 m (the camera's band inside).

| id | model × scale | x, z | rests on | from | at |
|---|---|---|---|---|---|
| lantern | noren-lantern × 0.6 | 1.90, -2.80 | the counter by the window, on its blue mat (not hung: the camera flies up there; the tansu top is full) | Mrs. Ishida | 2 |
| geraniums | flowerpot × 0.75 | -0.25, -2.84 | platform, between the letters shelf and the counter | Granny Tsuru | 4 |
| paperflowers | flowers-b × 0.4 | 1.62, 2.94 | getabako top | Mrs. Komori | 8 |
| ball | ball × 1 | -3.30, 2.90 | genkan floor, left corner | Kenta | 12 |
| pickles ("A firefly jar": the firefly game's empty jar, so it is named for what it shows) | glass-jar × 1.4 | 3.04, 2.95 | getabako top, its free right end | Aiko | 16 |
| bugnet | bug-net × 0.9, yaw +π/2 | 3.30, 2.50 | genkan floor, right corner, upright | Yui | 20 |
| basket | basket × 0.9 | 1.12, 2.92 | genkan floor by the getabako, behind the geta | Mr. Kubo | 26 |
| postcards | letters × 1.6 | -1.30, -0.25 | low table's far end, beside the tea things (off the line between the seated shot and Mika) | Mr. Hirano | 32 |

To find another free spot, scan the room's up-facing faces the way test 8 reads them: a face under all four corners
of the footprint, nothing of the room inside the box, the same distances. The spec's first spots failed this (the
lantern stood over a box on the tansu, the jar over the getabako's own things, the basket on the geta, the postcards
against a cup and in front of Mika in the seated shot); the table above is the result.

## Switches and QA

- `?stamps=off` never fetches the chunk (the old objective line stays). Under `?qa` the card is off unless `?stamps=on`,
  so every older suite runs as before. There is no Settings switch.
- `?stampday=YYYY-MM-DD` (only with `?qa`) stands in for today.
- `window.__STARLINE_QA__.stamps`: `state()`, `setDay(key)` (rolls at once), `complete(slot)`, `lucky(id, name)`,
  `unlockAll()`, `card()`, `decor()` (world boxes), `flush()` (shows every queued feedback now).

## Tests

- `npm test` runs `tests/stamps.test.mjs`.
- `GAME_URL=http://127.0.0.1:<port>/ node tests/stamps-browser.mjs` (add `SHOTS=dir` for screenshots): on a phone held
  upright, a fresh Explore save on a fixed day: the card is `drawCard`'s; "Collect" beats "Go inside"; delivering stamps
  and the pop stays clear of the act button, the stick and the objective card; walking onto the find stamps it with the
  bend-down; a play in the records stamps within 1.5 s with the bonus and two decorations; the cottage shows them,
  sparkles indoors, brings no new shader program and at most 20 draws for all eight; a later day rolls and keeps the
  stamps, an earlier one keeps the card, a reload keeps it all; the find costs at most two draws; Play starts the game;
  the Neighbours tab meets the UI standard upright and sideways in English, Vietnamese, Korean and Japanese;
  `?stamps=off` fetches nothing.

## Later

- A future Harvest board (docs/FARMING-PLAN.md §7) should reuse `stamps-rules.js` (`pick`, `award`, thresholds) rather
  than start a second task system.
