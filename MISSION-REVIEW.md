# Playable mission review and release plan

## Evaluation

The scene now contains original Blender meshes and a small game loop, but its
first implementation used 2D interaction distances, generous sphere-only shots,
instant cooking and incomplete replay reset. Those undermine the 3D world more
than missing visual detail. Prioritize reliable rules and feedback over more species.

## Reviewed plan and implementation

1. Make collection spatially correct: grounded player, 3D reach and clear line of
   sight to the object. Revalidate at interaction time, not only when showing a prompt.
2. Use the rabbit's actual Blender mesh for shooting after a cheap sphere rejection.
   Compare distance against village/bridge geometry and terrain. This avoids hits
   beside an animal or through buildings. Shots remain instant, not ballistic.
3. Cooking lasts three seconds. Moving away cancels it without consuming supplies;
   pause/menu holds progress. Consume ingredients exactly once on completion.
4. Stop mission time at completion; distinguish dinner before dusk from a late
   supper. Keep berries as a complete alternative to hunting. No failure spiral.
5. Replay resets timer, cooldown, cooking, pickups, rabbits and player position at
   camp. Shared mesh resources are reused rather than disposed while clones need them.
6. Keep the Low/Ultra Low defaults, small GLB downloads and separate tour mode.
   Gameplay lighting becomes dimmer toward dusk so PBR assets do not stay fully lit.

## Logic review

- No ingredient loss for cancelled cooking; repeated interaction cannot duplicate loot.
- No pickups from flight or another elevation merely because X/Z align.
- Clear-view checks happen on actions; do not raycast the village every frame.
- Menu pause must not finish cooking in the background.
- Empty camp interaction and completion feedback remain understandable.
- A replay must be achievable even after the player explored far from camp.

## Validation

Node tests load real Blender GLBs and simulate gathering, repeated input, timed
cooking, menu pause, cancellation, completion and replay. They also check building
occlusion and actual rabbit-mesh hits. Other tests cover asset validity/download
budget, 3D reach, timing and dusk boundaries. Production build includes only GLBs,
not editable Blender sources. Physical phone performance remains a separate test.

## Next design milestones

Add persistence, an NPC request/reward, and a second recipe before more survival
meters. For Blender, improve rabbit anatomy and authored rigged animation before
adding species. Current feet are articulated meshes, not a skeletal animation rig.
Tree-canopy occlusion and ballistic arrow flight are still future work; village and
bridge meshes plus terrain are covered in this release.
