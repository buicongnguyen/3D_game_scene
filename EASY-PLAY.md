# Easy Play and hold-to-aim

Game mode now defaults to a terrain-following camera approximately eight metres
above a ground anchor, looking down at 35 degrees. WASD/arrow keys and the left
mobile pad move relative to the view. Small left/right View buttons rotate by
30 degrees. The Camera button switches back to the existing first-person controls.
Season Tour remains a separate camera mode.

The anchor still obeys building collision. Camera terrain clearance and a raycast
shorten the camera offset near solid obstructions; the ideal angle/height can change
for clearance. This is an assisted camera, not unrestricted free flight. Interactions
in Easy Play use horizontal ground distance, with obstruction rays from anchor height
so elevation does not allow collecting through a building.

Hold the right mouse button for 180ms to open a 3x magnifier, move the mouse to aim,
and left-click to shoot. On mobile, hold the bottom-right Aim button and drag that
thumb; press the bottom-left Fire button with the other thumb. Release aim to close.
Quick taps do nothing. The scope stays available for the duration of the hold (a few
seconds or longer), with no forced timeout or automatic shot. A green box/crosshair indicates a huntable
rabbit with an in-range, terrain/building-unblocked ray. The shot recalculates the
ray rather than trusting a stale highlight. Other decorative animals remain non-huntable.
Movement stops while aiming without discarding held movement keys. Release, Close or Escape dismisses the panel.
Pause/menu, leaving play, replay, camera switching and losing focus close it too.

The magnifier copies a cropped portion of the completed WebGL frame into a 360x220
2D canvas, only while open. The 3x ratio accounts for CSS size and adaptive render
resolution. This is pixel magnification, not a second high-resolution 3D camera;
low render resolution will still look soft. No extra scene, shadow or reflection
render is performed for the aiming panel.

Validation includes camera movement/height/angle, collision-result handling, crop
edges and render scaling, quick-tap rejection, mouse button chords, independent
touch aiming/firing, cancellation before activation, drag, closing/idle rendering, and real mobile
GLBs under the magnifier shooting path (blocked shot then exposed hit). Existing
mission and asset tests remain enabled. Desktop browser startup, panel rendering,
empty-target disabling and camera-mode UI were checked. Physical phone multitouch
comfort and full-session performance still require device testing.

## Control review

The previous tap-open / drag-panel / tap-shoot / tap-close sequence interrupted
hunting, while small buttons and simultaneous camera pads competed for thumb space.
The new default separates left-thumb movement from right-thumb aiming, puts Fire
in the freed left-thumb area while movement is paused, hides secondary mobile
buttons during aiming, and gives aim lower sensitivity (65% of viewport movement).
First-person and Season Tour controls are deliberately unchanged by this pass.

These choices draw on the hold ADS, separate manual fire, thumb placement and
reduced ADS sensitivity described in the [official Activision control guide](https://www.callofduty.com/uk/en/blog/2024/03/call-of-duty-warzone-mobile-complete-control-plus-customization-controller-options).
This is a scoped control improvement, not a claim of AAA production quality.
