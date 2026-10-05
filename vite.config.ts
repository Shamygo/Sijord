import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  // Relative asset paths so the build works from any folder and inside a desktop wrapper.
  base: './',
  // The single-file build embeds code; imported character/item art uses the published site.
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    rollupOptions: mode === 'single' ? undefined : { input: { game: resolve(import.meta.dirname, 'index.html'), pokemon: resolve(import.meta.dirname, 'pokemon.html'), creatures: resolve(import.meta.dirname, 'creatures.html') } },
    chunkSizeWarningLimit: 1600,
    outDir: mode === 'single' ? 'dist-single' : 'dist',
  },
}));
