# Hoshi-no-Tani — The Valley of Stars

Procedural Three.js landscape with seasonal tours, train, villages and night effects.

## Development

Use Node.js 22 and run `npm ci`, then `npm run dev`.
Run `npm test` for timing regressions and `npm run build` for production.
`npm run preview` serves the built output. Use an HTTP server, not a `file://` URL.

The scene and shaders currently live in `index.html`. `scene-timing.mjs` contains
shared timing rules; `terrain-worker.js` prepares the terrain off the main thread.
The old `script.js` and `style.css` are not application entry points.

## Publishing

Pushing `main` triggers `.github/workflows/deploy-pages.yml`: install dependencies,
test, build, then publish `dist` to GitHub Pages. Relative asset paths support the
`/3D_game_scene/` repository URL. Three.js uses the page's existing CDN import map.

See [REVIEW.md](REVIEW.md) for findings, completed fixes and the next refactoring passes.
