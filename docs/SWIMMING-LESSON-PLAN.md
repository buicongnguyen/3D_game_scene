# Swimming lesson: researched design and implementation plan

Research checked: **12 October 2026**. This document describes a playable Starline mini game, not a substitute for swimming lessons or a water-safety qualification. The game never asks the person playing to hold their breath, hyperventilate, enter real water, or try a technique alone.

## Research and limits

The [American Red Cross water-safety guidance](https://www.redcross.org/get-help/how-to-prepare-for-emergencies/types-of-emergencies/water-safety.html) connects water competency with entering, breathing, staying afloat, changing orientation, travelling and exiting. It calls for supervision, swimming with others, suitable precautions and learning real swimming skills. Its competency sequence includes a minute afloat and a much longer swim than this small game. Our short animated drills do **not** demonstrate that real-world standard. No game score certifies a child safe in water.

[Swim England Learn to Swim Stage 1](https://www.swimming.org/learntoswim/learn-to-swim-stage-1-award/) builds confidence through safe entry and exit, movement, supported floating, upright recovery and gliding. These are taught in structured lessons; support and floats may be used. This informs the poolside check and supported first drills, rather than starting with a race or deep-water jump.

[Swim England Learn to Swim Stage 2](https://www.swimming.org/learntoswim/learn-to-swim-stage-2-award/) adds rhythmic bubbles, float recovery, front and back glides, leg action, rotation and exit. The game therefore alternates gentle virtual exhalation with an above-water breath cue, shows both float orientations and ends by finding the exit. It does not reward prolonged submersion.

[Swim England's core aquatic skills](https://www.swimming.org/learntoswim/the-core-skills-of-swimming/) describe breathing, balance, rotation, streamlining and coordinated travel as foundations, alongside safety and entry/exit. The mini game revisits these foundations with clear cues and forgiving retries. The exact inputs, short distances and game timings below are design choices, not instructions for a real swimming class.

## Learning goals

After the game, a player should remember to ask permission, have an attentive adult and qualified instructor for real practice, identify a safe exit, use calm breathing rather than a breath-holding contest, recover upright from a float, coordinate gentle movement and return to the exit. Mika's animated progress is the practice task. There is no drowning, oxygen meter, punishment for needing air, or encouragement to swim in the village river.

Rin is the game's friendly coach, not a claimed qualified swimming teacher. A separate adult stays on the deck throughout and is visible in the wider pool shots. The opening and results explain: **In real water, learn with a qualified swimming teacher and a grown-up watching.** The pool is calm and bounded. Its temporary water is independent of the existing river physics and current.

## Course, cues and timing

Ordinary play should take approximately **2–3 minutes**, with a four-minute round budget. Skilled play can be faster; no idle player can complete a drill. Reading time and retries vary, so the budget is generous and never represents how long someone should remain in real water.

| Drill | Approximate game time | Player task | Visible instruction and completion |
| --- | --- | --- | --- |
| Permission, exit and entry | 15–25 s | Move Mika to the bright exit marker on the dry deck; press the action button to check it. Walk into the shallow entry and press again to begin. | Rin and the adult are visible. Explain real supervision, identify the exit, enter slowly rather than jump. The same marked exit is used at the end. |
| Gentle bubbles | 15–20 s | Follow three short alternating cues: hold Action while Mika blows bubbles, release when her face comes up. | Show bubbles and an above-water air cue. Holding continuously earns no extra progress. Every cycle includes recovery and normal breathing. |
| Back/front float and recover | 25–35 s | Hold Action to relax the avatar; keep the stick near the centre or make small balancing corrections. Release to recover. Repeat on the front in short bubble-and-air portions, then confirm standing. | Mika rolls between back and front, with a clear upright recovery. The action controls the pose; it is never an instruction to hold the player's breath. |
| Gentle tread | 10–20 s | Tap Action with the slow pulse eight times; steer gently to stay within the practice circle. | Above-water Tread animation and small sculling feedback. A fast series of taps prompts slower movement and a retry. |
| Glide, kick and paddle | 20–30 s | Steer along the lane toward the far marker; tap gentle strokes on the pulse. | Swim clip, a steady rhythm indicator and travelled distance. Repeated rapid taps do not make Mika race. The lesson uses a virtual lane, not a real competency-distance test. |
| Turn and find the exit | 5–15 s | Use the stick or direction keys to turn Mika toward the original exit and keep facing it briefly. | The exit marker becomes prominent. Progress depends on facing it; tapping alone cannot pass. |
| Swim back and climb out | 20–30 s | Steer toward the exit with the same gentle rhythm, then press Action at the shallow ramp. | Mika reaches the ramp, returns upright and walks onto the dry deck. The lesson completes only after reaching the exit. |
| Feedback and replay | 10–20 s | Read the result; replay or leave. | Praise completed game skills and give one useful retry cue. Repeat the real-water supervision reminder; stars are game rewards. |

## Controls and accessibility

| Device | Move/steer | Action | Leave/pause |
| --- | --- | --- | --- |
| Desktop | W/A/S/D or arrow keys; W/up moves toward the far end of the pool, S/down toward the exit | Hold or tap E, F or Enter as the current cue says; the large on-screen button also works | Backspace leaves; Escape pauses through the existing game menu |
| Touch | Existing left floating joystick; up toward the far marker, down toward the exit | A large labelled button, placed inside safe-area margins; pointer capture handles holds and release/cancel | A separate Leave button; existing pause control remains available |
| Gamepad | Left stick with the same pool-relative directions | X (the existing `act` mapping); hold or tap as prompted | B leaves; Start pauses |

The instruction always says whether to hold, release, move or tap. It never relies on colour alone: text and a moving pulse accompany the coloured beat. The HUD remains readable in 390 × 844 portrait and 1280 × 720 desktop. Long translated labels wrap. Controls clear on blur, visibility changes, page hide and pointer cancellation; an interrupted hold must not keep an avatar face-down. Pausing stops game time. There is no microphone, breath detector or real-body exercise.

## Practice area, animation and camera

Build a temporary code-native **8 × 14 m practice pool** in the dry meadow south of Kawabe, centred at approximately (-22, 65), with an apron, a shallow sloped entry at the south end, lane floats, a far target and a distinctive exit marker. Before committing the location, sample its full footprint for dry, walkable ground and avoid buildings and paddies. The sign stands outside the temporary pool; the pool exists only during a lesson and is removed afterward.

Use the existing Mika `Swim`, `Tread`, `Idle` and `Walk` clips. Pitch the existing hip pivot for front/back float; show upright recovery explicitly. No asset regeneration is required. Rin and a village adult use cloned rigged models, remaining on the deck. Procedural bubbles and rings use shared geometry and materials and bounded counts; low quality should remain inexpensive.

The course camera looks down the lane from the exit end so controls stay consistent. During stationary breathing/float drills, it moves closer to show Mika's face and recovery. During travel, it includes Mika, the next marker and the lane; portrait uses more height/distance and a suitable FOV. The instructor remains visible at entry and the supervision context is kept in the wider shots. Camera and pose restore when leaving, replaying, timing out or encountering an error.

## Runtime, rewards and cleanup

- Add one `swimming` row to `src/content/tricks.js`, with teacher Rin in both stories, a shared first-intro scene, short real-world notes, stars [60, 80, 95], four-minute timing and an existing trick icon. Add Mini games metadata. The existing glob loader, journal and save migration discover the new stable ID automatically.
- Keep deterministic lesson rules in `src/game/tricks/rules-swimming.js`. `SwimLesson.step(dt, {act, mx, mv})` receives held action and pool-relative movement. Its snapshot supplies stage, cue, progress, position, heading, pitch, clip, score, target, events and result. Rules require input, bound motion, distinguish gentle rhythm from mashing and report helpful retry codes.
- `src/game/tricks/swimming.js` owns the temporary pool, UI, coach, bubbles, input translation, pose and camera. The framework continues to own the results card, best score, stars, replay and save. An incomplete lesson can record practice points below the first-star threshold; quitting makes no completed-round claim.
- While locked, temporarily replace only this player instance's update so global river gravity/current cannot move Mika. Save the original property descriptor, position, facing, velocity, pivot, pose, relevant motion state and camera state before taking ownership. Restore exact instance/prototype behavior in `finally`, including early quit and exceptions.
- Remove all transient objects and event listeners; dispose owned procedural geometries/materials and cloned skeletons without disposing model-library resources. Restore grass changes, hidden nearby actors, lantern requests, world state, camera FOV and button holds. No extra persistent water, colliders or cloned people may remain.
- All player text uses `tx()`/`N_()` source keys. The integration owner translates Vietnamese, Korean and Japanese packs and runs extraction/checking. The lesson introduces no protected main/input/game/index edits or new dependency.

Scores persist in the existing Explore save when launched from the title or Explore. Practice borrowed from a story
pause menu preserves that story save exactly; its temporary scores are discarded, following the existing Mini games
menu contract. Save/reload reward checks therefore use an Explore session, while story checks require unchanged storage.

## Acceptance and tests

1. Pure rule tests: all six stages require appropriate interaction; idle input never wins; sustained bubbling cannot bypass recovery; float has both orientations and upright recovery; cadence tolerates timing variation and rejects mashing; motion stays inside the pool; turning alone requires correct orientation; returning requires reaching the exit; score/stars distinguish partial from completed practice; small/large dt produce stable bounded behavior.
2. Content tests: both stories have Rin's first scene, the sign is dry, the module exports `play`, the lesson appears once in Mini games and an old save can retain a new swimming record. Allow the longer course explicitly rather than loosening every trick's duration restriction.
3. Runtime tests: verify owned-resource cleanup and exact player update restoration after success, replay, timeout, early Backspace/Leave and injected failure. Verify keyboard, touch pointer hold/release/cancel and the existing gamepad action mapping.
4. Browser acceptance: complete the course with real input on desktop and portrait touch; capture bubbles, back/front float, tread, travel, turning and dry exit. Check readable translated labels, visible supervision, controllable motion, gentle retry feedback, and every stage transition. Test low and medium quality.
5. Open from story pause and from title Explore. The lesson must return to the previous position, pose/camera, story progress, hour and weather. Finish and reload to confirm best score, stars and play count. Cancel a second run to confirm no extra completed play.
6. Run the focused tests, full suite, translation checks and production build. Repeat the playable smoke/cleanup checks against the built preview; a successful dev run alone is insufficient. Integration owner deploys and verifies the production update.

## Implementation checklist

- [x] Read and link primary swimming guidance; define explicit game-only limits.
- [x] Agree six-stage pure-rule API and longer interactive course.
- [x] Validate and implement the dry pool/sign placement.
- [x] Implement deterministic rules and meaningful tests.
- [x] Add content, first-intro dialogue and catalogue metadata.
- [x] Build temporary pool, visible coach/adult, poses and responsive camera.
- [x] Add keyboard/touch/gamepad controls, cues and helpful retries.
- [x] Restore all runtime state/resources in `finally` and test cancellation/errors.
- [x] Translate all new keys; check catalogue/save compatibility.
- [x] Complete rendered desktop/phone acceptance in development and production preview.
- [x] Build, test and integrate the release for publication.

Publication uses the existing GitHub Pages workflow. Its [build/deployment receipts](https://github.com/buicongnguyen/3D_game_scene/actions)
and live smoke checks establish which release is published. See [CODEX-VERIFICATION.md](CODEX-VERIFICATION.md) for recorded
test results and the [live game](https://buicongnguyen.github.io/3D_game_scene/).

## Review pass, 12 October 2026 (what differs from the plan above)

The lesson was played, reviewed and reworked after release. The structure and the safety intent are unchanged; these
details replace the ones above (not yet published: it is in the working tree of the review branch).

- **Pool.** The flat tinted rectangle became a tiled pool: one merged vertex-coloured shell (pale floor with a dark lane
  line, blue walls with a waterline band, stone coping, a solid timber deck with plank seams and steps up from the
  meadow), a patterned water surface in two drifting layers (one 128 px data texture, no canvas), red-and-cream lane
  ropes, foam ripples, droplets and mouth bubbles as instanced meshes. Nine draw calls plus the two watchers. The pool
  floor stands 0.75 m above the highest ground under it, so meadow flowers no longer grow through the water.
- **Entry and exit are steps**, not a ramp: six gold-edged treads with two handrails. Mika walks down until she is
  hip-deep (`POOL.entry`, z = 6.2), then pushes off to the practice spot (`SWIM.start`, z = 4) instead of walking under
  water to her chin. At the end she stands on the steps and walks up to the gold ring on the deck (`POOL.exit`).
- **Mika's body.** Depth and pitch are eased, never snapped. The floats are the Idle clip laid flat with the arms and
  legs opened by hand after the mixer (`makeSwimPose`: star float on her back, arms-ahead float on her front, a small
  chin dip for bubbles); the swims keep the Swim clip, sped up on each stroke. Works on Low's merged skin.
- **Watchers.** Rin waits at the corner of the steps for the standing drills and walks the east deck beside Mika on the
  swims; the grown-up stands by the exit. Both turn to face her, and cheer after each finished drill.
- **Camera.** Standing drills: a close three-quarter shot with Mika, her face, both watchers and the exit. Swims: a
  steep look down the lane holding Mika and the next 8.5 m (the whole 12 m made her a speck), so the red ring or the
  gold steps enter the picture after the first few strokes. The camera stays on the exit side: controls never reverse.
- **Panel.** One big cue line, one short instruction, one bar per task (the back float and the front float each fill
  their own bar), and a dot bar that shows the tap window on the swims and the hold window on bubbles and front floats.
  On phones the panel sits below the Journal and Menu buttons (it used to cover them). The countdown only appears for
  the last 30 seconds of the four-minute budget.
- **Rules.** Back float 6 s, front floats 4 s in total (were 8 + 8); a stroke pushes 0.9 m/s up to 1.1 m/s (was 0.6 up
  to 0.7), so a guided round takes about a minute of water time instead of 85 s. The swimmer stays between the lane
  ropes (|x| ≤ 1.9) and 0.9 m off the far wall; a rope slows her, only an end wall stops her. The tap that restarts a
  lapsed pulse is no longer a penalty. "Try the instruction above" waits for six seconds without any input (it used to
  fire every six seconds of a drill), and "release the button" waits 0.35 s. Finishing all six drills but running out
  of time before climbing out scores the practised skills (48), not 0.

## Added 13 October 2026: the frog stroke, and "Float and wait"

**Frog stroke (breaststroke; bơi ếch, かえる泳ぎ).** Normal and Difficult teach it as a seventh skill, after treading and before the swim to the far ring; Difficult also swims the way back with it, through its two rings. Easy and the guided first lesson keep the six gentle skills. It is one button and four parts, shown as four small pictures in the lesson panel and by Mika's arms and legs (posed after the mixer, like the floats):

| Part | Input | What Mika does |
| --- | --- | --- |
| Pull | press and hold Action | the hands sweep out and round |
| Breathe | keep holding (0.35 s to about 1.5 s) | hands under the chin, head up, heels drawn up with the knees apart |
| Kick | let go | the legs open wide and whip together |
| Glide | hands off while the glide bar runs | stretched long |

The glide is the secret. A press before the green part of the bar cuts the glide: she slows, the next kick is weak and does not count, and the panel says so (one retry, never more than one in three seconds). A full glide makes the next kick a little stronger. A tap is not a pull, a held button never kicks. Rules: `frogStroke` in `src/game/tricks/rules-swimming.js`; the patient pupil used by the tests and the QA script is `swimBot`.

**Float and wait** (`floatsafe`, `src/game/tricks/floatsafe.js`, rules `rules-floatsafe.js`) is a second game in the same pool: the "float to live" teaching (Japan: 浮いて待て, uite mate) as a calm drill in clothes, with Rin and a grown-up at the edge. Steps: keep still after the surprise (Difficult: through a cold "gasp" first), lie back as a star and breathe with a slow ring (hold while it grows, let go while it shrinks: a four-second breath, never a hold), wave and shout when the grown-up looks over, hug a thrown float (Normal: an empty bottle, Difficult: a cool-box lid), scull slowly to the edge (Difficult: across a lane that flows like a slow river), hold the reaching pole. Normal and Difficult end with the rescuer's side: Rin plays the friend in the water and the player chooses to shout for a grown-up, to throw something that floats and (Difficult) to reach lying flat. A wrong answer is explained and asked again. Mashing or shoving the stick drains the calm meter, costs three points a panic and never moves the drill on. No clock is shown. Sources for the teaching: the RNLI "Float to Live" advice and the Japanese school programme of clothed-swimming lessons (着衣泳); as with the lesson, the game is a picture of the idea, not training.
