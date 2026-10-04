import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any folder and inside a desktop wrapper.
  base: './',
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
