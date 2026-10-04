import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any folder (e.g. GitHub Pages).
  base: './',
  build: {
    // Phaser alone is ~1.3 MB minified, so the default 500 kB warning always fires.
    chunkSizeWarningLimit: 1600,
  },
});
