import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      // The page's import map pins Three.js for both direct GitHub Pages use
      // and Vite builds, avoiding a second 600+ kB copy in the app bundle.
      external: ['three']
    }
  }
});
