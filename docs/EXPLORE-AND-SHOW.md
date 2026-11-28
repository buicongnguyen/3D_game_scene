# One Explore with a show layer (2026-11-28)

Owner's decisions (2026-11-28): Sing & Play becomes a layer inside Explore, not a mode of its own; in Explore the player
can walk as Mika or as any singer ("Play as"; Saki is the show's default); a "Go to…" control moves the valley's time
AND its date-based things, forward only; the festival can be switched on (and off) in any season. Villagers keep calling
the player "Mika" whoever she walks as (part E of the first brief was dropped: no name substitution, no voice re-bakes).
The story is Mika's and unchanged: nothing here runs in a story save.

## Files
| Part | Files |
|---|---|
| Start-up | `src/game/explore-show.js` (started by `src/main.js` once an Explore save is loaded) |
| Calendar, Go to… | `src/game/valley-clock.js` (pure rules), `src/game/goto.js` (runtime) |
| Festival | `src/game/festival.js`, the stage in `src/content/stages.js` (`festival`), `src/game/schedule.js` (`ctx.late`) |
| Play as | `src/game/play-as.js`, `src/actors/body-moves.js`, `public/models/moves-explore.glb` |
| Moves pack build | `art/blender/explore_moves.json` (the list) + `art/blender/vroid_mixamo.py --packlist`, `scripts/explore-moves-fix.mjs`, `scripts/explore-moves-check.mjs` |
| Panels | `src/ui/explore-panels.js` (Go to…, Play as; pause menu and journal Map tab) |
| Show layer | `src/game/singplay/singplay.js` (`openShow`, `open`, `close`), `show-door.js` (the HUD's Perform), `sing-here.js`, `time-row.js` |
| Tests | `tests/explore-show.test.mjs`, `tests/singplay*.test.mjs`, `tests/asset-contracts.mjs` (`moves-explore`), `tests/perf-budget-browser.mjs` (`festival` place) |

## A. The show layer
- **The door**: in Explore, standing on dry, flat, open ground outdoors with nothing else going on (the same rule as the
  pause menu's Sing here: `sing-here.js singHereState`), a **Perform** button shows exactly where the show's own Perform
  will be (PC 16 px over the bottom; touch screens over Do it / Jump; phones on their side in the band left of the touch
  buttons). Hidden otherwise (no dimmed clutter), and while the show is open.
- A tap opens the layer **in place**: the Sing & Play chips (Singer, Song, Group, Dance, Stage, Time, ⚙) and the actions
  Perform / Record / Photo / **Leave show** (Camera during a song). Every Sing & Play behaviour is kept: group loading,
  the strong-phone 8, Stella, show effects, watchers, the camera man, captions, recording.
- **Singer** = the Play as body when it is a singer, else **Saki**. The Singer chip and Play as are the same choice: a
  singer picked on either is the body walking the valley and the show's lead.
- **Leave show** (the bar's action, or the pause menu's "Leave show") closes the layer where she stands; she stays the
  singer she was. Nothing reloads.
- **The title's Sing & Play** and `?start=singplay`: Explore with the layer opened at once, the valley as the Explore save
  left it (a first visit starts at the station stage). No forced season or hour any more.
- **Saves**: the show writes nothing of its own. The Explore save goes on as ever (place, Play as, calendar), refused only
  mid-song (`director.canSave`: `performing`, which the Night Star's own show sets too). Sing & Play's old per-device
  place (`starline:singplay:v1`) is no longer read.
- Kotone the visitor steps out of Town Life while the layer is open (the group's Kotone is the one on stage) and
  whenever the player walks as Kotone. Tamo stays the companion; he only waits at home during a song (not in her
  close-ups). The station sisters keep their day during a show; the Night Star waits only while the player's own song
  plays or while the player walks as Stella (no second Stella).

## B. Go to… (time travel with real consequences)
Opened from the pause menu (☰ "Go to…"), the journal's Map tab (✎, a row over the map with the valley's day), and in
the show the Time chip is the same thing. Not in the story, not in a play zone, not during a song, a round, a ride or a
scene ("Time can't move right now").

**The calendar** (Explore save, quest state): `season`, `hour`, and `explore = { days, sd, festival, playAs }`: `sd` is
the day within the season (0..6, a valley week a season, a 28-day year), `days` every day lived so far. Explore's clock
holds still on its own, as it always has; only Go to… moves it.

**The rules** (`valley-clock.js travel`, forward only, so nothing repeats and nothing can be farmed backwards):
- a **time of day** (Morning 08:00, Noon 12:30, Sunset 18:00, Night 21:00): later today when it is still to come, else
  tomorrow; after a season's last day tomorrow is the next season's first;
- a **season**: its first day at the hour it is now; the season the valley is already in comes round again a year on,
  unless only the hour moves forward within today;
- a **moment** (each with its own little picture): Cherry blossom morning (spring 07:30), Summer festival night (summer
  20:30, festival on), Autumn leaves afternoon (autumn 15:30), Snowy evening (winter 18:30); the other moments leave the
  festival switch as it is;
- **Festival On / Off**: flips in place, no time passes.
Each tile says where it lands: "Later today", "Tomorrow", or "Summer, day 1".

**What a jump does** (`goto.js land`): the quest's season (fields and paddies follow their own year: `FIELD_YEAR` by
season, the trees, grass and weather) and hour (Town Life re-plans every person from the new hour: a big hour step is
a timelapse in `schedule.js`), Settings' display-only season and time let go (their selects go back to "the valley's"),
`game.dayShift = days`: the **stamp card's day** (`stamps.js today`), the **voiced visits heard today**
(`house-scenes.js day`) and the **station sisters' day** read the valley's date (the real date + `days`). A day lived
through turns the stamp card over (`roll`), brings the sisters back on the next day, and lets the Night Star sing again.
Then the Explore save is written. The title's Explore picker now offers "As you left it" (the default for a valley
already explored); a season or time picked there is a Go to… as the valley starts. "A day passes" stays a look.

## C. Festival on demand
`festival.js`, kept in the Explore save (`explore.festival`):
- the train's festival garlands (`railway.setFestival`);
- fireflies on festival nights (winter keeps its snow);
- the festival tune in the evening (the music's `finale` mood, 16:30-23:00; a song holds the music as ever);
- people round the Takamori square (within 150 m of the festival stage) stay out until 23:00 instead of 20:00; the
  station and Kawabe go home as ever, so their phone budgets hold;
- the **festival stage** (Takamori square, (114.5, 5.5), the market stall and the square's lantern canopy behind the
  performers; room for Solo, 4 and 8 at its facing, 0.6 m off and 0.1 rad turned; `tests/singplay.test.mjs`): bamboo
  poles and strings of paper lanterns round it (not across the camera side), lit with the valley's festival lanterns at
  dusk (the `cel-decor` material): 2 draws, no shadows, no lights.
The lasting decorations of the four lamps are up in Explore whatever the switch says. Stella still sings at the shrine
on starry nights and the sisters spend their evening at the shrine: the festival is on the Takamori square, so neither
clashes with it.

## D. Play as
Pause menu (☰ "Play as"), the journal's Map tab, or the show's Singer chip: face tiles (Mika, Kotone, Mio, Saki, Yuna,
Aoi, Riku, Ren, Kai; Stella once her show was seen). Kept in the Explore save (`explore.playAs`). A singer's body:
her model (`.lite` on Low), her own everyday clips at her own gait, the Explore moves, her face, her silhouette; bodies
are made once and kept, so switching is instant after the first load. Mika's lantern is Mika's (a singer carries none).

**The Explore moves** (one generic Mixamo-65 pack, `moves-explore.glb`, 17 clips, 0.49 MB raw, fetched the first time
a singer is played) made ready for each body at load (`body-moves.js`: per-bone rest turn, hips travel by the leg ratio):
| Game clip | Mixamo source | Notes |
|---|---|---|
| Jump | Jumping Up 0.42-0.83 s | hips flat (the physics lifts her) |
| Fall | Fall A Loop | hips flat |
| Land | Fall A Land To Standing Idle 01 | |
| Swim | Swimming To Edge 0.1-2.4 s (looped) | lies flat itself: the body is not tipped (`player.body.swimFlat`) |
| Tread | Treading Water | |
| Sit | Sitting 0-5 s | hips held 0.45 m over her root (the indoor seat contract) |
| SitGrass (= SitFloor) | Kneeling | a modest kneeling sit, for the grass and cushions |
| Crouch | Kneeling Down 2.1-2.77 s | |
| CrouchWalk | Crouched Walking | |
| CrouchReach / CrouchReachHold (= PetLow, Pet) | Kneeling Inspecting | one knee down, the hand to the ground |
| Kneel | Kneeling Idle | |
| Pickup | Gathering Objects 0.33-1.33 s | down and back up in 1 s (played there and back) |
| Interact | Taking Item 0.6-2.2 s | |
| Pat | Patting | standing, the hand at the waist |
| PatHigh | Petting Animal 0-6 s | standing, the hand at the chest |
| Hang | Hanging Idle | the kite's handle (hands re-read for each body) |

**Joint rules**: `scripts/explore-moves-fix.mjs` resamples every clip at 30 Hz on Saki's rig, holds the fingers in her
relaxed Idle hand, eases any joint that breaks a rule toward rest (the least that passes, 2 deg / 2 mm head-room) and
smooths the weights over time. `node scripts/explore-moves-check.mjs` (Avatar Studio's checker R1-R11 at 60 Hz):
**0 frames on Saki, Kotone and Riku**; on all nine bodies 1 frame (Yuna's Interact, forearm~forearm 0.2 mm). Before the
fix pass the raw takes had 1,343 frames on Saki (deep squats past 75 deg hip abduction, 82 deg spine bends, finger
knuckles bent back, knees touching).

**Petting** (owner pointer: a kneeling pet for small animals, a standing pat for big ones): a singer pets the valley's
animal friends with PetLow (cat, rabbit, dog, fox, hen), Pat (sheep, goat, pig, the sleeping bear) or PatHigh (a cow).
She steps (a short glide) to where her hand lands: the hand's spot is measured once per body and move (`PlayAs.reach`:
the lowest point of the reaching hand mid-clip), and she stands so it lands on the back when it reaches that high, else
on the near flank (never through the animal: `petDistance`). Indoor pets (the cat on a cushion) use Pet (the kneeling
reach). The "Petting Animal" FBX turned out to be a standing pet at chest height: it is PatHigh. Mika keeps her own Pet
clip and reach (she already had a real one).

**Played as Mika** (`MIKA_ONLY`): the player becomes Mika the moment one of these starts and turns back into the chosen
singer when it ends:
| Activity | Why |
|---|---|
| Countryside tricks (every round from the trick spots or the Mini games menu) | nets, jars, kites, frogs, the bow and every prop ride Mika's grip and her bone frames |
| Yard games | kicks, catches and hops are measured on Mika's legs |
| Fishing | the rod sits in Mika's grip; Cast and Reel are her clips |
| The stew pot | Mika's Stir clip |
| Riding a cow | the saddle height comes from Mika's RideCow pose; the Mixamo library has no straddling ride |
| The kite workshop | building the kite: Mika's hands |
| Stargazing and the kite flight up | Mika lies on the grass and holds the Star Kite in her own poses |
Everything else in free roam works with any body: walk, run, the speed leap, jump, fall, land, swim, tread and climb
out, sitting indoors (chairs and cushions), the ground poses (creep, kneel, reach, pick up, rest on the grass), talking,
the doors, the shops, the train and the ferry, the kite flight from G, petting.

## Measured (2026-11-28, dev server, Chromium + GPU)
- Low (390x844), 21:00, the festival on, the festival stage, Saki: the place's own view 97 draws a frame (every pass);
  a song Solo 97.5, group of 4 93, group of 8 91.5 (the Low + 8 rule: stage, bursts, sticks). Nothing more had to be
  dropped there: the show at the festival stage draws no more than the place itself. At the station the same show is
  105-111 (Solo / 4 / 8), as in docs/SHOW-EFFECTS.md.
- PC High, the same group of 4 at the festival stage: 267 draws a frame (view pass).
- The perf budget (`tests/perf-budget-browser.mjs`, built preview, 11:00): see the final report table in the commit.

## Open decisions for the owner
1. Explore's clock still holds still between jumps (as before). A slow-running clock (Sing & Play ran one while free)
   would need its own day rollover; not done.
2. Seven valley days a season.
3. The kneeling sit (Kneeling) stands in for Mika's cross-legged SitGrass on singer bodies (the cross-legged Mixamo
   take broke the hip rules and read immodest in a skirt).
4. Whether more Mika-only activities should be brought to singer bodies (cow riding needs a straddle pose).
