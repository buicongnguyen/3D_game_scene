import { installMobileGameSupport } from './mobile-game-support.mjs';
installMobileGameSupport({
  "menus": [
    "#btnSettings",
    "#btnPauseSettings",
    "#settings"
  ],
  // No controls for the helper to measure: the stylesheet already keeps every touch button inside the safe area with
  // env(safe-area-inset-*) (src/ui/style.css), which costs nothing per frame. Listing #touch and #stick here made the
  // helper inset them a second time and re-measure them while playing.
  "controls": []
});
