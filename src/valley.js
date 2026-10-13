// The valley's own code behind ONE dynamic import (src/main.js loadValley): the Director and everything it runs, the
// weather and celebration effects, the look-dev viewer and the QA helpers. The title menu and the quick-start mini
// games (src/quick/runtime.js) never fetch this chunk. Keep src/main.js free of static imports of these modules.
export { Director } from './game/director.js';
export { FX } from './fx/fx.js';
export { Celebrate } from './fx/celebrate.js';
export { viewerCamera } from './dev/viewer.js';
export { attachQA } from './dev/qa.js';
