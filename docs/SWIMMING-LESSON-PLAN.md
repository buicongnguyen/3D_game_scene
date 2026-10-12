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
