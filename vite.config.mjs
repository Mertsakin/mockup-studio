import {defineConfig} from 'vite';

export default defineConfig({
  base: './',            // relative asset paths: the build works from any folder
  server: {port: 5173},
  build: {target: 'es2020', chunkSizeWarningLimit: 900}  // three r128 alone is ~600 kB
});
