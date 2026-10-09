import {defineConfig} from 'vite';
import capture from './tools/capture/vite-plugin.mjs';

export default defineConfig({
  base: './',
  plugins: [capture()],  // dev only: /api/capture (website screenshots via Playwright)            // relative asset paths: the build works from any folder
  server: {port: 5173},
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,  // three alone is ~600 kB
    rollupOptions: {input: {studio: 'index.html', showcases: 'showcases.html'}}
  }
});
