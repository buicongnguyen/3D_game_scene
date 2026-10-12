# Codex verification and implementation

This pass follows the 12 October 2026 handover in [REMAINING-ISSUES.md](REMAINING-ISSUES.md).
Work happened in isolated task checkouts. The original `3D_game_scene` working folder and its uncommitted mobile helper were left untouched.

## Implemented

- Seven new ground clips on Mika and the village kid: Crouch, CrouchWalk, CrouchReach, CrouchReachHold, Kneel, Pickup and SitGrass. Existing geometry, materials, bones, rest transforms and old clips are unchanged. Both Low merged skins and Medium skins were checked in the game renderer.
- A tested pose state machine with short pickup locking, the 0.4-second grab event, hysteresis, speed-matched creeping and graceful animation fallback. Crouching, catching, kneeling at webs/crickets, low greetings, feeding, hay/story pickups and quiet waiting use it. The follow camera lowers smoothly. Lanterns move to the belt with pose offsets and update after pose sampling.
- Title tours use the selected default story and its electric/flame style. Pause-menu tours show current progress, including unfinished lamps and an unrepaired viaduct. These tours stay live on phones so the completed-valley recordings cannot spoil a save. State and save storage restore on exit.
- All sixteen phone tour, title and intro clips/posters were regenerated. Tour recordings use Grandma's electric lamps; each story intro uses its own style. Every encoded clip was inspected. Total video data is 51,149,841 bytes, down from about 56.5 MB, within the existing budget.
- Hard-mode Grandma lamp prompts say to fit the bulb; Classic retains spark wording. Grandma Tsuru's dialogue now describes Isamu as away building boats without a seasonal return promise that becomes false later in the story.
- Sack races require an actual finish. Solo times up to 13 seconds earn three stars, up to 18 two stars, and later finishes one star. Losing a completed race to the only kid earns one star. The forty-second deadline produces an explicit unfinished result without stars; standing still no longer wins after 3.5 seconds.
- Vietnamese, Korean and Japanese packs contain all 3,650 source keys with no missing entries, stale keys or placeholder mismatches. These translations remain AI-authored and need native-speaker review.

## Verification

- Full unit suite: 592 tests pass. Production build succeeds, including packed-model and video budgets.
- Ground-clip scoped Blender validation: zero errors and warnings for both rigs. Ground contact, loop seams, authored shuffle speed and hand reach were measured; contact sheets were inspected. The full legacy model validator still reports pre-existing geometry/coplanar issues, so this is not a claim that its default audit is clean.
- Production ground-interaction matrix passes on 1280 × 720 desktop and 390 × 844 phone, at Low and Medium: actual creep/stop/swing/catch, hay pickup, cow feeding and nighttime sitting. Settled front/side/chase screenshots were inspected.
- Production tour suite passes eight story/device/progress cases, with no browser requests for source modules. It verifies current-progress captions, world state, quest identity, saving lock and restoration.
- Production real-Edge video suite passes: playback controls, live partial-save tours, load fallback, both story arrivals and skip equivalence. The original dev tour and real-Edge video suites also pass.
- Full production Grandma and Classic story autopilots pass, including all four lamps, the complete ending and pause/journal/resume controls (approximately 9.5 minutes each).
- Integrated all-game production menu sweep passes (304 seconds): every catalogue game launches and returns, plus keyboard/touch/gamepad picker navigation, six title sizes and story-save restoration on desktop/phone.

Reproduce browser checks against an isolated server using `GAME_URL`, as described in the handover. Added suites are `tests/ground-poses-browser.mjs` and `tests/tour-production-browser.mjs`; neither needs browser-side source imports. Local screenshots and logs live under the ignored `.tools` directories of the task checkouts.

The first update deployed as `4474ebf`: [Pages build/deploy receipt](https://github.com/buicongnguyen/3D_game_scene/actions/runs/38189693367).
Live real-Edge checks confirmed the published bundle, all sixteen clip sizes/metadata, phone playback, the picker and partial-save tour restoration.

## Swimming follow-up

The owner's subsequent request adds **Mini games → Countryside tricks → Learn to swim**. See
[SWIMMING-LESSON-PLAN.md](SWIMMING-LESSON-PLAN.md) for the primary research, detailed teaching sequence, timings, controls,
implementation and acceptance criteria. Rin and an attentive adult supervise a temporary calm pool on dry land; this is
virtual game practice and does not certify real swimming ability.

The course requires identifying the exit and entering slowly, gentle bubble/air cycles, back/front floats with upright
recovery, paced treading, a steered outward swim, turning toward the original exit, swimming back and walking onto the dry
deck. Holding, mashing, steering alone or standing idle cannot complete it. Success requires the dry exit. Retry guidance
clears when corrected; a missed pulse explicitly offers a restart. Front three-quarter close-ups show breathing/float
poses, and the travel camera keeps the real destination visible below the instructions.

- Latest full unit suite: **609/609 pass**, including rules, all difficulty levels, runtime restoration, pointer cancellation,
  errors, old-save compatibility and resolved-feedback regressions. A differential check preserved gameplay, events,
  penalties and scores across 109,939 guided/random frames when clearing stale visible guidance.
- Final production build passes. Swimming adds no model assets or dependencies and leaves all protected files untouched; the earlier ground clips remain within their documented budgets.
- Full real-input development matrix passes on desktop/phone at Low and Medium. Final production desktop Low and phone
  Medium courses pass in 113/112 seconds, reach the actual dry deck, save/reload 96 points, and clean up a cancelled replay.
  Desktop production also verifies unchanged borrowed story state/storage and original player/controller restoration.
- The production catalogue sweep passes in 310 seconds with swimming included. Existing games still launch and return.
- Vietnamese, Korean and Japanese each contain **3,727/3,727** keys, with zero missing/stale entries or placeholder mismatches.
  Rendered production checks pass for all three at 390 × 844 and Vietnamese at 360 × 640, through bubbles and both floats.
  The narrow Vietnamese check is repeated after four dry-deck wording corrections. These remain AI translations.
- A real-input production missed-pulse check verifies neutral late styling, the translated restart instruction, no extra
  earned scull on restart, and a successful subsequent paced tap. No browser source-module imports or runtime errors.

`tests/swimming-browser.mjs` completes the course with keys or two real CDP touch contacts, verifies pause/awards/reload,
then checks quit and story restoration. Use `GAME_URL` and `--only=desktop-low` or `--only=phone-medium`. Local final evidence
is in `.tools/swim-prod-desktop`, `.tools/swim-prod-phone`, `.tools/swim-minigames` and the video audit's layout/pulse folders.
Publication receipts are available in the repository's [Pages workflow runs](https://github.com/buicongnguyen/3D_game_scene/actions);
the deployed game is [Starline](https://buicongnguyen.github.io/3D_game_scene/).

## Owner decisions

- Keep Isamu alive and away building boats in Grandma; keep Classic's existing remembrance.
- Keep the mill wheel/dynamo powering Grandma's electric lamps.
- Pause-menu tours show the current save's progress.
- Apply the solo/two-player sack-race star rules above.
- Build a visible Takamori volleyball practice board in a later pass. This decision is recorded; the board is not implemented here.

The yard camera, Normal playground difficulty, Vietnamese-village project and further video compression remain product decisions. No changes were made to other repositories.

## Code and logic review, 12 October 2026

Reviewed the released ground interactions, sack rules, tour/video state ownership and swimming lesson, including cancellation,
replay, exact timing boundaries and borrowed story sessions. Each runtime correction below has a regression that failed before the fix.

| Priority | Reproduced issue | Correction |
| --- | --- | --- |
| P1 | Starting a mini game inside a story building restored Mika's elevated room coordinates without restoring the room. | Re-enter the saved interior before restoring exact position, and restore both indoor and outdoor camera zoom. |
| P2 | Every Low-quality swimming replay retained two temporary character palette materials. | Dispose per-actor palettes and fallback resources while preserving library materials and cached merged geometry. |
| P2 | Mathematically exact breathing/float timing boundaries sometimes earned retry penalties because frame sums rounded above or below the threshold. | Use a one-microsecond rounding tolerance; genuinely short/overlong holds still fail. |
| P2 | Leaving a net trick during a swing could retain its procedural arm bend. | Remove the owned overlay during disposal while preserving a newer scene pose. |
| P2 | Interrupting hay pickup before its grab frame left instantly owned hay invisible. | Finalize its held appearance on interruption, with a guard against recreating consumed hay. |
| P2 | Rain appeared as clear night to sky viewing and clear-sky trick availability. | Read `fx.weatherKind`; `fx.weather` is the particle pool. |
| P3 | Inherited object keys used as difficulty names created incomplete swimming rules. | Accept only own configuration keys; unknown names fall back to Normal. |

The full unit suite now passes **618/618**. Vietnamese, Korean and Japanese remain **3,727/3,727**, with no missing/stale keys or
placeholder mismatches. The production build and packed-model checks pass. Existing bundle-size warnings remain.
The exact-boundary regressions exercise all four lesson levels at 60, 20 and 10 fps. Resource tests verify repeat cleanup and
preservation of shared assets. A real browser has verified outdoor and cottage story-return cases, including unchanged save,
quest, room visibility, player position and both camera zoom values.

Production acceptance for this review passes on desktop Low and portrait phone Medium for ground poses, catch, hay pickup,
cow feeding and sitting, with clean final pose/items/camera/locks. An extra real-input hay pickup interrupted by dialogue at
0.016 seconds keeps its armful visible. The production phone Medium swimming course passes all six drills, dry exit, saved
record/reload and cancelled replay; outdoor and cottage story-return cases also pass (125 seconds for the combined suite,
zero runtime errors). These are new checks against this review's build, not reused results from the earlier release.
All eight production tour cases also pass for both stories, desktop/phone and title/current-progress pause tours (56 seconds).
The focused sky production run passes day, dusk and actual rain, flight/return restoration, rebuilt star-field disposal and an
unrelated ambient object streaming in. The formerly flaky sky assertion now checks owned resource disposal and detachment,
instead of requiring the whole valley's object count to stay fixed.

Sack finish requirements, solo timing cutoffs, timeout, trailing grace and the completed loss to one kid still match the approved
rules. No additional tour/video runtime defect was confirmed. This review does not claim to resolve every older handover item.

## Confirmed work still remaining

Archery hands/portrait camera/ambient kids, cow-rider leg art and mount/dismount/gallop polish, fishing camera and yard issues remain as described in the handover. This pass does not claim to complete every item in that document.

The sky weather identifier issue is fixed in the code review above. Sky resource tests now verify actual owned geometry/material
disposal, including rebuilt star fields, without assuming that unrelated ambient creatures stop streaming. The governor lives
in `src/engine/governor.js`, correcting the handover's path.

Real iPhone/Safari, Low Power Mode video behavior, physical gamepads and native-speaker language review are still unverified. Existing build warnings about the large main chunk and ineffective static/dynamic UI splitting remain.
