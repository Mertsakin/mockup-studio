// Landing page screen content: screenshots the sample app screens (tools/landing/screens/*.html) and the studio's own
// UI into tools/landing/src/, where the landing render scene picks them up as device screenshots.
// Usage: node tools/landing/shots.mjs
import {chromium} from 'playwright';
import {createServer} from 'vite';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..'),OUT=path.join(ROOT,'tools','landing','src');
const server=await createServer({root:ROOT,logLevel:'error',server:{port:0,strictPort:false,hmr:false}});
await server.listen();const url=server.resolvedUrls.local[0];
const browser=await chromium.launch({args:['--use-angle=metal']});
try{
  // phone screens
  for(const n of ['app-light','app-dark','app-gallery']){
    const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3});
    const p=await ctx.newPage();await p.goto(pathToFileURL(path.join(ROOT,'tools/landing/screens',n+'.html')).href);
    await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(OUT,n+'.png')});await ctx.close();console.log(n);
  }
  // the studio itself, with a template open (laptop / monitor screens)
  const studio=async(name,w,h,template)=>{
    const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:2});
    const p=await ctx.newPage();p.on('pageerror',e=>console.error('page error',e.message));
    await p.addInitScript(()=>{window.__noPhotoPreview=true;});
    await p.goto(url);await p.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'),null,{timeout:60000});
    await p.evaluate(async id=>{const app=window.__app;if(!app('hasBoard')())app('addBoard')();app('applyTemplate')(app('TEMPLATES').find(t=>t.id===id));
      // give the template's devices screen content (the sample screens captured above)
      const load=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});
      for(const d of app('state').devices){d.img=await load(d.type==='phone'?'/tools/landing/src/app-light.png':'/tools/landing/src/showcases-tablet.png');d.imgName='ekran.png';app('setScreenTexture')(d);}
      app('req')();},template);
    await p.evaluate(()=>new Promise(r=>setTimeout(r,2500)));
    await p.screenshot({path:path.join(OUT,name+'.png')});await ctx.close();console.log(name);
  };
  // showcases gallery (tablet)
  {const ctx=await browser.newContext({viewport:{width:1180,height:820},deviceScaleFactor:2});
   const p=await ctx.newPage();await p.goto(url+'showcases.html');await p.evaluate(()=>new Promise(r=>setTimeout(r,1500)));
   await p.screenshot({path:path.join(OUT,'showcases-tablet.png')});await ctx.close();console.log('showcases-tablet');}
  await studio('studio-laptop',1440,900,'panel-telefon');
  await studio('studio-monitor',1920,1080,'banner-masaustu');
}finally{await browser.close();await server.close();}
