# Phone videos

On a phone the three things a player only *watches* are shown as recorded video instead of being drawn live:

| What | Live on desktop | On phones (Low tier) |
|---|---|---|
| Title backdrop | the valley drawn behind the menu | `title-*.mp4`, a 14 s seamless loop; the renderer is held under it |
| New game: the arrival (the train runs in while the story is told) | `Scenes.arrival()` in `src/game/scenes.js` | `intro-grandma-*.mp4` / `intro-classic-*.mp4`, with the same captions told live over it and a Skip button |
| Scene tour (Settings → Scene tour) | `src/game/tour.js`, the real flight | `tour-<season>-*.mp4`, with the same picker, captions, toolbar and keys |

Everything that is words or buttons stays HTML on top of the video (so it is translated and tappable); only the
picture is video. Videos are muted, inline (`playsinline`) and fetched only when they are about to play.

"Phone" means the Low graphics tier (`renderer.qualityName === 'low'`: mobile browsers, and software renderers).
Desktop keeps live 3D. The tour picker has a **Live 3D instead of video** box: a phone can tick it for the real
flight, a desktop can untick it for the video; the choice is remembered (`starline-opt-tourLive`). `?live=1` in
the address turns all video off.

If a clip is missing, the browser cannot decode H.264, autoplay is refused or the clip stalls, the live version runs
instead, by itself.

## Files

`public/video/` holds, for each clip, a landscape cut (`-wide`, 960x540) and a portrait cut (`-tall`, 540x960),
a poster JPEG for each, and `manifest.json`. The manifest is written by the recorder: durations, sizes and, for
tours, the time of every stop (`stops[i].t` = the rest begins, `.from` = the glide to it begins). The tour player
reads the video's `currentTime` against those times, so captions and next/previous can never drift from the
picture. `tests/video.test.mjs` fails if a clip no longer matches the tour data (then record it again).

The clip list, the two sizes and the bitrates are in `src/content/video.js`.

## Recording

```
node scripts/record-videos.mjs                       # everything, about half an hour
node scripts/record-videos.mjs --only=tour-spring    # one clip, both cuts
node scripts/record-videos.mjs --only=intro-grandma-tall
node scripts/record-videos.mjs --only=tour-night --kbps=650 --keep=1   # another bitrate; keep the frame folders
node scripts/record-videos.mjs --only=tour-night --frames=1 --kbps=500 # encode again from kept frames
```

It needs Playwright (already a dev dependency), a GPU, and Blender 4.x for the encoding (`BLENDER=<path to
blender.exe>`; the default path is at the top of the script). `GAME_URL` uses a running game; otherwise the
script starts vite on port 5831.

How it works:

1. Headless Chromium opens the real game on the High tier, 1.5x oversize. The script takes over the page's clock
   (Playwright's `page.clock`): timers, `requestAnimationFrame` and `performance.now()` advance only when the
   script says so, 1/30 s per video frame. The tour, the arrival cutscene, the train, water and weather therefore
   run at a perfectly steady 30 fps however long a frame takes to draw. Nothing in the game knows it is filmed.
2. After each step the WebGL canvas is scaled down to the video size and saved as a JPEG in
   `.tools/video-frames/<clip>/`. HTML (captions, toolbar, fades) is not in the canvas, so it is not in the video.
3. A tour is first visited stop by stop in real time, so everything it loads on demand is in; then it is restarted,
   given three seconds to settle, and filmed from its first to its last second. The arrival is filmed from the
   moment its picture starts (`scenes.arrivalT`) until the cutscene ends; the moments the whistle blows are noted
   (`marks`) and replayed over the clip. The title is filmed on a closed 14 s camera path, and its first 1.5 s are
   dissolved in from the frames after the loop's end, so the loop has no seam.
4. Blender (headless, `--factory-startup`, its bundled FFmpeg/libx264) encodes each frame folder: H.264 High
   profile, yuv420p, 30 fps, a keyframe every 2 s, no audio. The script then moves the MP4's index in front of the
   picture data ("fast start") and writes the manifest and a poster.

Record again whenever a tour's stops or timings change (the Node test says so), or when the valley changes enough
that the clips look out of date.

## Size

About 55 MB for the whole set at 500 kbps (title 400). No clip is downloaded unless it is played; one tour is about
5 MB. The budget is `TOTAL_VIDEO_BYTES` in `tests/asset-contracts.mjs`, separate from the model library's.

## Playback (`src/game/video.js`)

- `VideoLayer`: the one `<video>` element, placed over the canvas and under all UI. `show(clip)` resolves true once
  pictures are coming and then sets `renderer.hold` (the renderer skips drawing); `hide()` lifts it.
- `TitleLoop`: started by `ui.title()` on the Low tier; suspended while the tour has the screen; stopped when a game
  starts.
- `playArrival(scenes)`: called by `Scenes.arrival()` on the Low tier. It puts the valley straight into the state
  the live cutscene ends in (train in the station, Mika and Genzo on the platform, camera on them), lets the
  renderer draw that for the first second under the clip (shader warm-up out of sight), holds it, tells the same
  captions, and at the end (or on Skip) dissolves back to the live platform. The story then continues exactly as
  after the live cutscene (`tests/video-browser.mjs` compares the two states).
- The tour's video mode is in `src/game/tour.js` (`startVideo`, `vLoad`, `vTick`, `closeVideo`): it borrows only
  the screen. No season change, no throwaway story; from the pause menu the game simply stays paused.

## Tests

- `node --test tests/video.test.mjs` (part of `npm test`): files, sizes, MP4 structure, stop times.
- `node tests/video-browser.mjs`: a phone-sized page in Microsoft Edge or Google Chrome through Playwright
  (Playwright's own Chromium cannot decode H.264): title loop, video tour, fallback, arrival clip versus live.
