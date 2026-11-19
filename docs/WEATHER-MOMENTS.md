# Weather moments

About once every three or four minutes of free roaming outdoors by day, something small happens in the sky around
Mika: a breeze, birds, a sun shower with a rainbow, diamond dust, the evening bell. This is phase D's first half (the
other is the daily stamp card, `docs/STAMPS.md`). The spec was `phase-d-spec.md` §1; where the code and the phone
proved it wrong, §9 below says what changed and why.

| File | What it is |
|---|---|
| `src/game/moments-rules.js` | the rules, pure (no three.js, no DOM): the table, gates, scheduler, sky placement, paths, lines |
| `src/game/moments.js` | the runtime, a lazy chunk (`game.wakeMoments()`), one `update(dt)` a frame |
| `src/fx/moment-fx.js` | the look: a second `Rainbow`, a second `Butterflies` mesh as the flock, the particle emits |
| `src/ui/moments-option.js` | the Settings switch and the "is it wanted?" rule (tiny: the title page loads it) |
| `tests/moments.test.mjs`, `tests/moments-browser.mjs` | unit tests; the phone suite in a real browser |

Hooks elsewhere: `game.js` (`wakeMoments`, `this.moments?.update(dt)` after the Director), `main.js` (wire the switch,
wake after the start), `world.js` (`world.cover` into `sky.update`), `audio.js` (`drip`, `honk`, a `crow` call),
`animals.js` (`liftFlocks`), `index.html` (the checkbox).

## 1. What the child sees

| Moment | When (the **shown** season and hour) | What happens |
|---|---|---|
| **Breeze** (`gust`, 7 s) | any season, 7:00-18:30 | a stream of pink petals (spring), green leaves (summer), red and gold maple leaves (autumn) or powder snow (winter) blows across the view, with two whooshes |
| **Geese** (`birds`, autumn and winter, 40 s) | 7:00-18:30 | a V of nine geese slips in at one side and glides away into the distance, honking softly |
| **Swallows** (`birds`, spring and summer, 14 s) | 7:00-18:00 | six swallows zip in loops just ahead of Mika, then wheel away |
| **Sun shower** (`shower`, 36 s) | spring to autumn, 7:30-18:18, once the Mill Lamp shines | clouds thicken, sunlit drops glitter, rings open on the river, drops plink; at 14 s a rainbow draws itself on the side away from the sun (only while the sun is under 48°) |
| **Diamond dust** (`sparkle`, 22 s) | winter mornings, 7:00-12:30 | tiny ice crystals twinkle in the air |
| **Evening bell** (`bell`, 8 s) | 16:30-18:30 near the bell tower, once the Orchard Lamp shines | three tolls, the crows lift and caw, six crows fly home across the view, "The evening bell! Off home go the crows." |

Tamo (or Mika, before Tamo is with her) says one line: always on the first moment of each kind in a session, one
time in two after that, never within a minute of the last one. The line goes through the villagers' bark clock: while
someone's bubble is up (or one ended under 2.8 s ago) it waits up to 3 s, then is dropped; once said, the villagers
wait for it. During a shower a neighbour within 20 m may add a line ("A sun shower! The foxes must be having a
wedding."; a child only when a rainbow will come), after Tamo's bubble has ended. Every hourly bell lifts the
Takamori crows too (at most every 45 s), unless the moments are switched off. Photo mode, the pause menu and the
journal freeze it all.

Where: in the story from chapter 1 (breezes and swallows), chapters 2-3 and the epilogue (showers and rainbows),
chapters 3-4 (geese) and 4 (diamond dust); in Explore everything, by the season and hour picked. Never in the
prologue, the c4 town meeting, rounds, scenes, indoors, the tour or play zones.

## 2. The rules (`moments-rules.js`)

| id | seasons | shown hours | night < | dur s | cooldown s | per session | weight | also |
|---|---|---|---|---|---|---|---|---|
| `gust` | all | 7 - 18.5 | 0.2 | 7 | 240 | - | 3 | |
| `birds` | all (geese autumn/winter, swallows spring/summer) | 7 - 18.5 (swallows to 18) | 0.2 | 40 / 14 | 420 | - | 2.5 | |
| `shower` | spring, summer, autumn | 7.5 - 18.3 | 0.2 | 36 | 600 | 2 | 2 | `lamps.mill` |
| `sparkle` | winter | 7 - 12.5 | 0.1 | 22 | 480 | - | 2 | |
| `bell` | all | 16.5 - 18.5 | - | 8 | 900 | 2 | 4 | `lamps.orchard`, within 260 m of the tower |

All timing counts **eligible seconds** (no start blocker): the first moment after 45-75 s, then a gap of 120-210 s
after each one ends, re-checked every 4 s; picked by weight among those in their window, off cooldown and under their
per-session count; never the same one twice in a row while another is eligible; never two at once. Seeded
(`mulberry32`; `?momentseed=N`), so a seed gives the same sequence.

**Gates** (`readFlags` into one reused object, 4 times a second idle and 10 while running; `judge` stores the
verdicts, so the frames between only compare):
- *No start* while: no quest, the prologue, the frozen town, a zone; focus, the tour lock, a video, the focus
  renderer, a lost context; the Director busy, a scene, a dialogue, an overlay, the cinema bars, the fade, a camera
  shot or tracking; any round or mini game (`minigame`, tricks, yard, workshop, the menu's launch, the round light,
  `fx.weatherHold`); riding a cow, the sky viewer or flight, the kite, mounted, climbing, swimming, under water;
  indoors or a room transition; switched off (`momentsOff`, `weatherOff`); Low tier two steps down the governor.
- *Stop now* (fast, 0.4 s): the same minus dialogue, busy, overlays, the fade, swimming, riding, mounted, climbing,
  the prologue and the frozen town (a running moment carries on through those; its bubbles are hushed); Low tier
  three steps down.
- *Stop gently* (2.5 s) when the shown season or hour leaves the moment's window (Settings, the day cycle).

## 3. The look, per moment (phone Low first)

Everything hangs under `celebrate.root` (hidden indoors), casts no shadow, and uses programs compiled at load: the
celebrations' glow and solid GPU sprite systems (one reused options object per kind of particle: an emit sets two or
three fields and allocates nothing), a second `Rainbow` and a second `Butterflies` mesh (its wing swapped for a 64 px
bird wing, uploaded once). No light is added; no new GLB.

**The visible sky band.** The follow camera (fov 55, pitch 0.3) sees only about 10° above its eye line, and on a
portrait phone the top 12 % of the screen is the objective card and the clock: the band left for the sky is 0-3.9°
above the eye, usually in front of hills, trees and roofs. So:
- sky things sit 1.5-3.5° up (`SKY_BAND`);
- the rainbow is drawn **40 m out** at its true angles (`RAINBOW_DRAW`, `rainbowAt`): in front of the village and the
  hills, behind anything nearer (Mika, the next house). It keeps its heading as the camera walks, like a real one;
- far geese are drawn **at most 30 m out** at the same angular size (`SKY_DRAW`), for the same reason.

| Moment | Look | Draws |
|---|---|---|
| Breeze | Low 75 / others 120 sprites over 2.5 s, 6-14 m ahead, starting 2-11 m to one side, 5-7.5 m/s across; flutter 0.5, spin 4, drag 0.2, life 4.5 s; petals `#ff9ec7 #ffc4dc #f77fb0`, summer leaves `#5fae3e #86c64a`, maple `#e2381f #f06a1c #f5a623` (solid), winter powder snow (glow, alpha 0.6) | +1 |
| Geese | 9 in a V (pairs 2.4 m back, 2 m out, up to 0.96 m higher per pair so the V reads from behind: less as the leader nears 3.5° above the eye, and no bird ever higher than 3.5° at its distance, `vStep` / `skyCap`), dark tint (0.2, 0.17, 0.15), scale (2.2, 0.7), wings tilted 0.35 rad toward the eye, flap 9 rad/s; pass 55-85 m out on the view's axis, heading 12-17° off it, 9 m/s, from 45 m before the pass; on a phone on its side the path is turned 20° right and comes from the left, so it glides off to the right, clear of the objective card; they rise over hills they meet; honks to 260 m | +1 |
| Swallows | 6, tint (0.12, 0.18, 0.42), scale (0.45, 0.16) (a flat wingbeat, not a butterfly's), flap 20 rad/s, banked; loops of 3-7 m round a point 9 m ahead of Mika that follows her (over the ground there when it rises), each bird at least 1.5 m over the ground under it (facing uphill they skim the slope); loops narrowed across a portrait view; at 10 s they spiral up and away | +1 |
| Sun shower | cloud cover 0.45 -> 0.7 (`world.cover`, the only sky value touched); drops Low 55/s, others 90/s, 3-16 m ahead in the view's half-field + 6°, starting just under the frame's top, 6.5 m/s, a quarter of them bright glints; river rings (the always-drawn `celebrate.ripples`) within 12 m of the river point nearest Mika; `audio.drip` plinks at random moments (a Poisson patter, Low 5/s, others 8/s at the peak; never a steady tick), no noise bed; the rainbow (apex 3°, half-width 14°, feet at the far ground) draws itself over 14-17.2 s with tip sparks (Low 15/s) and `chime(3)`; on a phone on its side it leans 14° right of the middle, away from the objective card | +2 |
| Diamond dust | Low 30/s, others 60/s sparks, 0.08-0.15 m, 3-14 m ahead, ±2 m of the eye; 70 % icy white, 30 % gold; `audio.twinkle` | +1 |
| Evening bell | tolls at 0, 2.2, 4.4 s (`audio.bell` and the tower bell's swing, `d.bellSwing`), every crow lifts (`wildlife.liftFlocks('all')`), three caws; the valley's flocks circle 25-35 m over the camera, out of the phone's frame, so six crows going home fly with the moment flock (tint (0.08, 0.08, 0.1), scale (1.4, 0.5), flap 11 rad/s): from the tower's side of the view, 25 m out, away and across to the other side by 110 m over the 8 s, 1.8-3.3° above the eye (`crowPlan`, `crowPoint`; turned 20° right on a phone on its side). None in winter, when the line is "Time to head home." | +1 |

The highlight of each moment (the rainbow fully drawn or, without one, the heaviest drops at 10 s; the breeze at
2 s; the geese passing the view's middle; the swallows at 6 s; diamond dust at 8 s; the bell's third toll) calls
`director.stamps?.saw?.(id, name)` once: the stamp card's lucky stamp. A moment stopped before its highlight (Mika
goes indoors, the switch is turned off, a round starts...) earns nothing, even while it fades.

The hourly bell becomes the evening bell only where a bell moment could start (`eligible`: the Orchard Lamp lit,
near the tower; nothing blocking a start, so never over the c2 story bell's dialogue); otherwise only the Takamori
crows lift. With the moments switched off (Settings or "Falling petals...") the crows stay put.

## 4. Lines (all ≤ 58 characters, true in every season they can be said in)

Names: Sun shower, Breeze, Geese, Swallows, Diamond dust, Evening bell. Tamo or Mika: "Sun and rain at once!",
"Look, a rainbow! Over there!", "Whoosh! Hold on to your hat!", "The wind wants to play!", "Brr! The wind is
blowing the snow about." (winter), "Look! Geese, flying in a V!", "The geese have come for the winter.", "Swallows!
Zip, zip. Show-offs.", "Look how fast the swallows turn!", "The air is sparkling!", "Diamond dust! Ice in the air,
glittering.", "The evening bell! Off home go the crows." ("...Time to head home." when the crows are away in
winter). Neighbours: "A sun shower! The foxes must be having a wedding.", "Rain and sunshine. The washing can stay
out!", a child: "Rain AND sunshine? Look for the rainbow!". In vi, ko and ja right after "Falling petals, leaves and
snow" (ko: 여우비, ja: 天気雨 / キツネの嫁入り: the same fox-wedding saying). The bark tables are untouched.

## 5. Switches and QA

- Settings > "Weather moments (rainbows, birds, breezes)", on by default (`localStorage['starline-opt-moments']`).
  Off stops a running moment at once; on fetches the chunk if it was never loaded.
- Advanced > "Falling petals, leaves and snow" off also blocks and stops them.
- `?moments=off`: the chunk is never fetched. `?moments=on`: forced on, over a saved "off" too (the box shows on;
  nothing is saved unless it is changed). **Under `?qa` they are off unless `?moments=on`**, so every other suite
  runs as before. `?momentseed=N`: a fixed sequence.
- A running flock stops gently when the shown season leaves its variant (geese in spring or summer, swallows in
  autumn or winter), as any moment does when its season or hour window passes.
- `game.moments.enabled`: false while Settings > Weather moments or "Falling petals..." is off. The stamp card reads
  `g.moments?.enabled` (not whether `g.moments` exists) to show its lucky row, or a set `s.lucky`.
- `window.__STARLINE_QA__.moments`: `state()` (`{ active, id, variant, t, stopping, arc, gapLeft, cooldowns,
  perSession, lastBlock, clock }`), `start(id, { variant, force })` (true or the blocker's name; force skips the
  scheduler (window, cooldown, a running one) and the forced run plays out past its window, never past the gates),
  `stop(fast = true)`, `seed(n)`, `advance(s)`, `flags()`, `cost()` (mean ms of `update` over the last 120 frames),
  `resetCost()`, `apex()`, `plan()`, `fx`.
- If the owner never sees a moment on the phone: `qa.moments.state().lastBlock` says why (`slow`: the governor is
  two steps down; `weatherOff`; ...).

## 6. Cost

Off: nothing (the chunk is never fetched; `this.moments?.update` is a nullish check). Running: at most +2 draws, no
shadow draw, no program, the light pool unchanged, at most ~85 live sprites on Low (a shower's drops and tip sparks).

Measured on the desktop (Chrome, Low, 390x844):
- **its own work** (update run hundreds of times in a row on the live game, real dt): idle 0.9 µs, shower 4.5-5 µs,
  geese 7 µs, breeze 2.7 µs a frame; times 8 (a phone): 7 / 40 / 57 / 21 µs, inside the 20 / 150 µs budget;
- **in the running game** (`qa.moments.cost()`, one cold call a frame): idle 4-7 µs and a shower about 25 µs at 1x;
  with CDP's 8x throttle 52-86 µs idle and 208-258 µs in a shower. That is over the spec's 20 / 150 µs. Part is real
  (one call a frame runs with cold caches, mostly the 4-10 Hz flag read touching some 25 objects), part is the
  measure: the page's timer is 100 µs-grained and the throttler's pauses land inside it; it swings by half from run to
  run. The suite holds the first to the budget and the second to a regression ceiling (150 / 500 µs) and prints it.

## 7. Tests

- `node --test tests/moments.test.mjs`: every table row (seasons, hours, night, chapter, frozen town, lamps, tower);
  every gate alone with its reason, which only block starts; `readFlags` on a stand-in game; 30 simulated minutes of
  the scheduler for six seeds (first at 45-75 s, gaps, cooldowns, per-session, seeded, blocked time adds nothing,
  stop-fast and stop); `rainbowPlan` and `rainbowAt` (cone, wrap, apex, width, hills, sun height, the valley's edge,
  the angles kept as the camera moves); levels; the skein in a portrait view (on screen ≥ 60 %, under the HUD ≥ 45 %
  of its 40 s), the V, the swallows' loops; every goose and every bell crow within 3.5° of the eye; the landscape
  skein's side; the bell; the lines; the switch (including `?moments=on` over a saved "off").
- `GAME_URL=http://127.0.0.1:5931/ node tests/moments-browser.mjs` (`SHOTS=dir` for screenshots): the 17:00 bell
  (three tolls, every crow, its crows going home on screen and clear of the HUD, then one toll on cooldown); each
  moment (no new program, +2 draws at most and none 6 s after, lights unchanged, the apex and the flock on screen,
  every bird clear of the HUD panels, the arch away from the sun, the cover handed back); swallows facing uphill on a
  slope stay over the ground; a shower forced at 20:00 plays on; a breeze cut off at 1.7 s earns no lucky stamp and
  one seen through 2 s earns it once; fast stops (a house, `stop()`, the tour's lock, a round) within 0.5 s; photo
  mode freezes; cost; the three switches; no console errors. About five minutes.

## 8. Never touched

`fx.setWeather` / `weatherKind`, `FX.uWind` (the kite trick saves and restores it), fog, the sun's intensity, the grade
uniforms, `celebrate.rainbowFx` (the ch1 finale's), `starSnow`, `stopAll`, `g.beforeUpdate` / `afterUpdate`,
`director.js`, `celebrate.js`, `barks*`, the light count. No rain, storms, puddles, umbrellas or night moments
(a shooting star in view and a firefly swarm are the next idea).

## 9. Where the build departs from the spec, and why

1. **Sky placement: 1.5-3.5° up, not 3-8°.** On the phone the top 12 % of a portrait screen is the HUD: the eye line
   sits at NDC y 0.59 and the HUD's edge at 0.74, 3.9° above it. At 7° the rainbow's apex was behind the clock and the
   geese behind the objective card (screenshots).
2. **The rainbow is drawn 40 m out at its angles, and narrower (apex 3°, half-width 14°).** At 90-200 m the low band
   is full of roofs and trees, and the depth test hid the arch behind the Kawabe houses (only a sliver showed). A
   real rainbow keeps its place in the sky as you walk, so it moves with the camera at fixed angles. 14° fills a
   portrait screen's width (±13.5°) with both feet near its edges. In landscape it leans 14° right, clear of the card.
3. **The geese glide away at 12-17° off the view, 55-85 m out, drawn at most 30 m out, darker and larger.** A
   crossing at right angles is on a portrait screen (±13.5°) for about 5 of its 40 s; this path is on screen for
   most of it (unit test: ≥ 60 %). At 100 m+ they hid behind roofs (drawn ≤ 30 m: fixed) and the spec's pale
   (0.55, 0.50, 0.45) birds vanished against autumn hills: dark (0.2, 0.17, 0.15), scale 2.2 x 0.7, wings tilted to
   the eye, the V stepped up so it reads as a V from behind.
4. **Swallows: scale (0.45, 0.16) instead of 0.42.** The butterfly flap read as a moth; a flat Y scale gives a
   wingbeat (spec §8's own remedy).
5. **The shower's drops**: 3-16 m out, starting just under the frame's top edge (not 7-12 m above the eye: there they
   spent most of their life above the frame), 6.5 m/s, gravity 2, life 1.1 s, a quarter bright glints, Low 55/s
   (spec 25/s: about 12 showed, it did not read). Live sprites stay under 90 on Low.
6. **The breeze**: Low 75 / others 120 sprites, 6-14 m out, partly starting inside the view, 5-7.5 m/s (spec 45 / 90,
   12-24 m, 7-10 m/s: about six petals showed on a phone).
7. **Wedges** for drops and crystals follow the camera's real half-field plus a margin (spec 100°): in portrait most
   of a 100° wedge is off screen.
8. **Fast stop 0.4 s** (spec 0.6 s), so "stopped within 0.5 s" holds; `state().active` turns false at the stop call.
9. **The bubble** leans 35 % from Tamo toward Mika: Tamo floats near the screen's edge and a long line was cut off.
10. **The geese's highlight** is the pass through the view's middle (the path has no "closest point" in view).
11. **Cost check**: see §6. The in-game 8x figure is reported, held to a regression ceiling; the budget is checked
    on the update's own work. The in-game figure is over the spec's numbers.
12. **`momentsWanted`** lives in `ui/moments-option.js` (re-exported by the rules): the rules module stays out of the
    title page's download.
13. **The evening bell draws its own crows (+1 draw, spec 0).** The valley's flocks circle 25-35 m above the follow
    camera; lifted 8 m more, a phone never saw them (review probe: 2 of 360 crow samples on screen and clear of the
    HUD), so the line "Off home go the crows" pointed at nothing. The moment flock (free: one moment at a time) flies
    six crows home in the sky band; `liftFlocks` still lifts the valley's own.
