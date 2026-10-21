// The service worker (public/sw.js) keeps the game's files for the next visit. Registered once the title is up, never
// in tests (?qa) or when asked not to (?nosw), and only in the built site (the dev server has no stamped worker).
export function registerServiceWorker(params) {
  try {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || params.has('nosw') || params.has('qa')) return;
    const go = () => navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href).catch(e => console.info('[sw] not registered', e?.message || e));
    // after everything the title asked for has arrived: the first visit's own downloads do not wait for the worker
    if (document.readyState === 'complete') setTimeout(go, 1500); else addEventListener('load', () => setTimeout(go, 1500), { once: true });
  } catch { /* no worker: the game works as before */ }
}

/** Settings: delete everything the worker stored. Resolves the number of caches removed. */
export async function clearGameData() {
  let n = 0;
  try {
    for (const name of await caches.keys()) if (name.startsWith('starline-')) { if (await caches.delete(name)) n++; }
  } catch { /* nothing to clear */ }
  return n;
}

export const canClearGameData = () => typeof caches !== 'undefined';
