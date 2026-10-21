/*
 * Starline's service worker: a repeat visit asks the network for almost nothing.
 *
 *   assets/*            built files with a hash in their name: cache first, kept in one cache across deploys, and the
 *                       ones the new build no longer lists are removed when it takes over
 *   models, icons, ...  files whose name does not change: stored under their content hash (the build writes the table
 *                       below), so a cached copy is exact: no revalidation, and a changed file is fetched once
 *   index.html          network first, so a new deploy reaches the player on the next load; the cached page is used
 *                       offline or when the network is slow
 *   video/*.mp4         only after they were asked for, up to a size cap, and served with range support
 *
 * `scripts/stamp-sw.mjs` fills in STAMP after the build. Unstamped (the dev server) this worker does nothing.
 * Never cached: other origins, non-GET requests, pages opened with ?nosw or ?qa, and anything when the browser has
 * less than MIN_FREE_MB of storage left. The Settings button "Clear downloaded game data" deletes every starline-* cache.
 */
const STAMP = { build: 'dev', files: {}, assets: [] }; // @stamp
const PREFIX = 'starline-';
const SHELL = `${PREFIX}shell-${STAMP.build}`;
const ASSETS = `${PREFIX}assets`;
const FILES = `${PREFIX}files`;
const VIDEO = `${PREFIX}video`;
const MIN_FREE_MB = 100;
const VIDEO_MAX_FILE = 6 * 1048576;
const VIDEO_MAX_TOTAL = 40 * 1048576;
const LIVE = STAMP.build !== 'dev';
const scope = new URL(self.registration.scope);
const rel = url => (url.origin === scope.origin && url.pathname.startsWith(scope.pathname) ? url.pathname.slice(scope.pathname.length) : null);
const INDEX = new Request(new URL('index.html', scope).href);

self.addEventListener('install', e => {
  // the cached page and files are exact, so the new worker can take over at once
  e.waitUntil((async () => {
    // the title's own files (what index.html names) were fetched before this worker existed: store them now, from the
    // browser's cache where it still has them, so the next visit starts without asking the network
    if (LIVE) {
      try {
        const res = await fetch(INDEX);
        const html = await res.clone().text();
        await put(SHELL, INDEX, res);
        const names = new Set([...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map(m => m[1]));
        await Promise.all([...names].map(async n => { const r = new Request(new URL(n, scope).href); try { await put(ASSETS, r, await fetch(r)); } catch { /* fetched later */ } }));
      } catch { /* offline: nothing to store yet */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    if (LIVE) {
      const fileKeys = new Set(Object.entries(STAMP.files).map(([p, h]) => fileKey(p, h)));
      const assetKeys = new Set(STAMP.assets.map(a => new URL(a, scope).href));
      for (const name of await caches.keys()) {
        if (!name.startsWith(PREFIX)) continue;
        if (name.startsWith(`${PREFIX}shell-`) && name !== SHELL) { await caches.delete(name); continue; }
        if (name === FILES || name === ASSETS) {
          const cache = await caches.open(name), keep = name === FILES ? fileKeys : assetKeys;
          for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
        }
      }
    }
    await self.clients.claim();
  })());
});

const fileKey = (path, hash) => new URL(`${path}?h=${hash}`, scope).href;
let freeAt = 0, freeOk = true;
/** True while the browser has room: asked at most once a minute. */
async function hasRoom() {
  const now = Date.now();
  if (now - freeAt < 60000) return freeOk;
  freeAt = now;
  try {
    const { quota, usage } = await navigator.storage.estimate();
    freeOk = quota === undefined || (quota - (usage || 0)) / 1048576 > MIN_FREE_MB;
  } catch { freeOk = true; }
  return freeOk;
}

// pages opened for tests or without the worker (?nosw, ?qa) never use it, nor do their files
async function bypass(e) {
  const test = u => /[?&](nosw|qa)(=|&|$)/.test(u);
  if (e.request.mode === 'navigate') return test(e.request.url);
  if (!e.clientId) return false;
  const c = await self.clients.get(e.clientId);
  return !!c && test(c.url);
}

async function put(cacheName, key, res) {
  if (!res.ok || res.status !== 200 || !(await hasRoom())) return;
  try { await (await caches.open(cacheName)).put(key, res); } catch { /* quota: fine */ }
}

async function indexFirst(e) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(e.request);
    if (res.ok && !/[?&](nosw|qa)(=|&|$)/.test(e.request.url)) e.waitUntil(put(SHELL, INDEX, res.clone()));
    return res;
  } catch (err) {
    const hit = await cache.match(INDEX);
    if (hit) return hit;
    throw err;
  }
}

async function assetFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  put(ASSETS, request, res.clone());
  return res;
}

async function fileFirst(request, path, hash) {
  const key = fileKey(path, hash), cache = await caches.open(FILES);
  const hit = await cache.match(key, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  put(FILES, key, res.clone());
  return res;
}

// ---- video: whole files only after a request, range answers from the stored copy
const inflight = new Set();
async function videoTotal(cache) {
  let n = 0;
  for (const req of await cache.keys()) { const r = await cache.match(req); n += +(r?.headers.get('content-length') || 0); }
  return n;
}
async function fetchWhole(url) {
  if (inflight.has(url) || !(await hasRoom())) return;
  inflight.add(url);
  try {
    const cache = await caches.open(VIDEO);
    if (await cache.match(url)) return;
    const res = await fetch(url);
    const len = +(res.headers.get('content-length') || 0);
    if (!res.ok || res.status !== 200 || !len || len > VIDEO_MAX_FILE) return;
    if ((await videoTotal(cache)) + len > VIDEO_MAX_TOTAL) return;
    await cache.put(url, res);
  } catch { /* not stored */ } finally { inflight.delete(url); }
}
async function rangeFrom(hit, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range || '');
  if (!m) return hit;
  const buf = await hit.arrayBuffer(), size = buf.byteLength;
  let start = m[1] === '' ? Math.max(0, size - +m[2]) : +m[1];
  let end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(+m[2], size - 1);
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': hit.headers.get('content-type') || 'video/mp4', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' } });
}
async function video(e) {
  const url = e.request.url.split('#')[0].split('?')[0];
  const cache = await caches.open(VIDEO);
  const hit = await cache.match(url);
  if (hit) return rangeFrom(hit, e.request.headers.get('range'));
  e.waitUntil(fetchWhole(url));
  return fetch(e.request);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (!LIVE || req.method !== 'GET') return;
  const url = new URL(req.url), path = rel(url);
  if (path === null) return;                       // another origin, or outside this site
  const isIndex = req.mode === 'navigate' || path === '' || path === 'index.html';
  const hash = STAMP.files[path];
  const isAsset = path.startsWith('assets/');
  const isVideo = /^video\/.*\.mp4$/.test(path);
  if (!isIndex && !hash && !isAsset && !isVideo) return;
  e.respondWith((async () => {
    if (await bypass(e)) return fetch(req);
    if (isIndex) return indexFirst(e);
    if (isVideo) return video(e);
    if (isAsset) return assetFirst(req);
    return fileFirst(req, path, hash);
  })());
});
