import {defineConfig} from 'vite';
import capture from './tools/capture/vite-plugin.mjs';
import player from './tools/embed/vite-plugin.mjs';

export default defineConfig({
  base: './',
  // capture: dev only, /api/capture (website screenshots via Playwright); player: the embed player for "Web'e göm"
  // (dev /player/, build dist/player/). base './': relative asset paths, the build works from any folder
  plugins: [capture(), player()],
  server: {port: 5173},
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,  // three alone is ~600 kB
    rollupOptions: {input: {studio: 'index.html'}}
  }
});
