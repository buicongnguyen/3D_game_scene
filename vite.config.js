import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
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
