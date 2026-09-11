# Wildhaven: River & Hearth — river and controls plan

## Evaluation and chosen improvements

The first mission offered gathering and hunting but the river was decorative.
Add a third food route and visible wildlife to reward exploration. Preserve the
quiet valley identity rather than adding unrelated combat systems. Rename the game
Wildhaven: River & Hearth to describe exploring and returning home to cook.

## Implemented scope

1. Generate original fish and crab assets through the existing Blender toolchain;
   retain editable sources and merge materials to limit draw calls.
2. Place a small habitat in the river near a walkable bank. Small/large fish swim
   in circles, crabs move over the bed. Position against actual terrain and water
   heights; hide any animal without enough depth. Mobile gets 10 animals, desktop 22.
3. Use normal depth-tested rendering and nearby translucent water, not always-on-top
   animal overlays. Distant water and winter ice remain opaque. No new reflection pass.
4. Add Find river guidance and a bank marker. E/Interact starts three-second fishing;
   leaving, flight or winter cancels it. Four catches per mission prevent unlimited
   harvesting. Cooking accepts fish as food alongside berries and rabbit meat.
5. Keep the same actions on PC and mobile. Phone action buttons sit bottom-right,
   separate from the left movement pad; details collapse and landscape hides the
   long objective. Keep at least 52px action targets and safe-area offsets.

## Logic review

- Fishing must not collect through long distances or from flight.
- Menu pause suspends the action; winter cancels a pending catch.
- Replay clears catch limits and timers.
- Water alpha must become opaque for ice; submerged animals must still obey terrain depth.
- Population and geometry budgets remain bounded. Models load once and share resources.

## Verification

Asset tests validate all seven GLBs against a combined 400KB budget. Integration
tests use the real Blender models and cover gathering, shooting occlusion, cooking,
replay, catching fish, leaving the shore and winter cancellation. Physical-device
multitouch comfort and underwater appearance need hands-on testing; desktop rendering
and the deployment build are checked before publication.

## Next attraction milestones

Add a second recipe and a villager request, persistent progress and wildlife discovery
entries. Later, add a fishing rod/casting animation and authored swimming/sideways crab
animation. This release uses a timed shore interaction and simple animal movement,
not a fishing physics simulator or skeletal aquatic animation.
