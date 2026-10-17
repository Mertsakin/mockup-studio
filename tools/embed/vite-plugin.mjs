// The embed player (embed.html + src/embed/player.js) as files the studio can put in a "Web'e göm" ZIP
// (export/embed.js): the dev server builds it in watch mode into node_modules/.cache/mockup-player and serves it at
// /player/; `vite build` writes it to dist/player/. Both have player/files.json (the list) and the host page's
// loader (mockup-view.js, from public/embed/). The nested builds use no config file, so this plugin never recurses.
import fs from 'fs';
import path from 'path';
import {build} from 'vite';

const root=process.cwd();
const options=(outDir,watch)=>({configFile:false,root,base:'./',publicDir:false,logLevel:'warn',
  build:{outDir,emptyOutDir:true,target:'es2020',chunkSizeWarningLimit:900,watch:watch?{}:null,
    rollupOptions:{input:{embed:path.resolve(root,'embed.html')}}}});
function finish(dir){
  fs.copyFileSync(path.resolve(root,'public/embed/mockup-view.js'),path.join(dir,'mockup-view.js'));
  // compressed models' decoders (devices/model.js reads them next to the page: draco/, basis/); the export packs
  // them only for scenes with a model
  for(const d of ['draco','basis'])fs.cpSync(path.resolve(root,'public',d),path.join(dir,d),{recursive:true});
  const files=[];
  (function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())walk(f);else files.push(path.relative(dir,f).split(path.sep).join('/'));}})(dir);
  fs.writeFileSync(path.join(dir,'files.json'),JSON.stringify(files.filter(f=>f!=='files.json').sort()));
}
const TYPES={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json'};

export default function player(){
  return {
    name:'mockup-player',
    async configureServer(server){
      const dir=path.resolve(root,'node_modules/.cache/mockup-player');
      const watcher=await build(options(dir,true));
      watcher.on('event',e=>{if(e.code==='END')finish(dir);else if(e.code==='ERROR')console.warn('[player]',e.error&&e.error.message);});
      server.httpServer?.once('close',()=>watcher.close());
      server.middlewares.use('/player',(req,res,next)=>{
        const f=path.join(dir,decodeURIComponent(String(req.url||'/').split('?')[0]));
        if(!f.startsWith(dir+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return next();
        res.setHeader('Content-Type',TYPES[path.extname(f)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');
        fs.createReadStream(f).pipe(res);
      });
    },
    async closeBundle(){
      if(this.meta&&this.meta.watchMode)return;
      const dir=path.resolve(root,'dist/player');await build(options(dir,false));finish(dir);
    }
  };
}
