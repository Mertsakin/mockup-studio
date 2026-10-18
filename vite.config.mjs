import {defineConfig,loadEnv} from 'vite';
import capture from './tools/capture/vite-plugin.mjs';
import player from './tools/embed/vite-plugin.mjs';
import routes from './tools/site/routes-plugin.mjs';

export default defineConfig(({mode})=>{
  // a build with accounts (VITE_SUPABASE_URL + key: --mode accounts, the site's build settings) gives every page its
  // own address under /studio/ (tools/site/routes-plugin.mjs, src/ui/router.js); without accounts base './': relative
  // asset paths, the build works from any folder
  const env=loadEnv(mode,process.cwd(),''),cloud=!!(env.VITE_SUPABASE_URL&&env.VITE_SUPABASE_ANON_KEY);
  const base=cloud?'/studio/':'./';
  return {
    base,
    // capture: dev only, /api/capture (website screenshots via Playwright); player: the embed player for "Web'e göm"
    // (dev /player/, build dist/player/)
    plugins: [capture(),player(),cloud&&routes(base)].filter(Boolean),
    server: {port: 5173},
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 900,  // three alone is ~600 kB
      rollupOptions: {input: {studio: 'index.html'}}
    }
  };
});
