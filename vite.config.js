// © 2026 Bui Cong Nguyen · solluxlabs.com
import { defineConfig } from 'vite';

const BANNER = '/*! Starline — Hoshi Valley. © 2026 Bui Cong Nguyen · solluxlabs.com. All rights reserved. https://solluxlabs.com */';
// every built script and stylesheet starts with the author's line (after minifying, so nothing moves or drops it)
const authorBanner = {
  name: 'author-banner', apply: 'build', enforce: 'post',
  generateBundle(_, bundle) {
    for (const f of Object.values(bundle)) {
      if (f.type === 'chunk') f.code = `${BANNER}
${f.code}`;
      else if (f.fileName.endsWith('.css') && typeof f.source === 'string') f.source = `${BANNER}
${f.source}`;
    }
  },
};

export default defineConfig({
  base: './',
  plugins: [authorBanner],
  // NO_HMR=1: long browser suites keep their page even while sources are edited
  server: { host: '127.0.0.1', hmr: process.env.NO_HMR ? false : undefined, watch: process.env.NO_HMR ? null : undefined },
  preview: { host: '127.0.0.1' },
  resolve: { dedupe: ['three'] },
  // Pre-bundling three and its example modules separately duplicates the core in dev.
  optimizeDeps: { exclude: ['three'] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
});
