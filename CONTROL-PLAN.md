# First-person control improvement

Implemented plan:

1. Separate exploration from the tour: Explore or movement input takes control,
   preserving camera altitude and entering flight when above the terrain.
2. Make menu ownership explicit: Esc/H opens or closes settings; unlocking the
   mouse opens the menu. Opening settings clears movement and disables touch pads.
   Closed settings are inert so invisible controls cannot receive keyboard focus.
3. Keep familiar desktop movement: WASD/arrow keys, mouse look, Shift run, F flight,
   Space ascend and Ctrl descend. Flight no longer changes height with pitch;
   right Shift no longer both runs and descends. This is exploration, not a combat
   controller: jumping and crouching are not implemented.
4. Add sensitivity and invert-look controls; show a small aim dot during mouse
   capture and shorten the always-visible keyboard hints.
5. Replace the mobile movement arrows with an analog thumb pad. Drag the scene to
   look; use the existing altitude buttons. Keep optional desktop arrow pads on K.
6. Release captured touch input on menu opening, blur and visibility changes.

Validation: timing regression suite and production build. Still requires hands-on
desktop pointer-lock and physical mobile multitouch checks: move/look simultaneously,
open the menu while moving, cancel a touch, leave a flying tour, and resume exploring.
The timing tests do not cover these interactions. Settings currently last until reload.
