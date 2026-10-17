import {defineConfig} from 'vite';

// The embed player alone (embed.html + src/embed/player.js): `npx vite build -c vite.embed.config.mjs` -> dist-embed/.
// No editor code: the player imports only the core (state, render, devices, lights, io).
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {input: {embed: 'embed.html'}}
  }
});
