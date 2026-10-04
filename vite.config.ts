import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  // Relative asset paths so the build works from any folder and inside a desktop wrapper.
  base: './',
  // `npm run build:single` inlines everything into one HTML file you can double-click to play.
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    chunkSizeWarningLimit: 1600,
    outDir: mode === 'single' ? 'dist-single' : 'dist',
  },
}));
