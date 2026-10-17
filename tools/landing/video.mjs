// The landing page's hero video, made with the product's own animation export (export/video.js renderVideo):
// the hero fan (three phones) floating on the page's white, a seamless loop. Writes landing/video/hero.mp4 and
// hero.webm (the page offers WebM first) and hero.jpg (poster, the loop's first frame).
// Usage: node tools/landing/video.mjs   (Chrome for H.264; GPU: ANGLE/Metal). Sample screens: tools/landing/src/.
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..'),OUT=path.join(ROOT,'landing/video');
const S='/tools/landing/src/',W=1600,H=1120,DUR=6;
const SPEC={ratio:'custom',bg:{bg:'solid',solid:'#ffffff'},lights:'Stüdyo',scene:{rx:-6,ry:0,zoom:1.04,panY:-.01},
  devices:[{type:'phone',colorKey:'white',px:-7.6,py:.23,pz:-1.5,ry:18,rz:6,img:S+'app-light.png'},
    {type:'phone',colorKey:'graphite',pz:2,img:S+'app-dark.png'},
    {type:'phone',colorKey:'white',px:7.6,py:.23,pz:-1.5,ry:-18,rz:-6,img:S+'app-gallery.png'}]};

async function inPage({spec,W,H,dur,format}){
  const app=window.__app,st=app('state');
  if(!app('hasBoard')())app('addBoard')();
  st.customW=W;st.customH=H;
  app('applyTemplate')(spec);
  const load=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('image '+src));i.src=src;});
  for(let i=0;i<st.devices.length;i++){const d=st.devices[i];d.img=await load(spec.devices[i].img);d.imgName='ekran.png';app('setScreenTexture')(d);}
  Object.assign(st.scene,spec.scene);
  st.anim.dur=dur;st.anim.loop=true;
  // a calm loop: the camera sways a little, each phone floats on its own (the float presets end where they start)
  app('applyPreset')('c-float',st.scene);
  st.devices.forEach(d=>app('applyPreset')('float',d));
  // the phones out of step, so they do not bob together: shift each one's keys by a third of the loop
  st.devices.forEach((d,k)=>{for(const p in d.tracks||{})d.tracks[p].forEach((key,j,a)=>{if(j>0&&j<a.length-1)key.t=Math.min(dur-.05,key.t+k*.18);});});
  app('refit')();app('applyTransform')();app('layout')();app('req')();
  await new Promise(r=>setTimeout(r,800));
  document.querySelector('#vFmt button[data-v="'+format+'"]').click();
  const blob=await app('renderVideo')(()=>{});
  const b64=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob);});
  let poster=null;
  if(format==='mp4'){st.size=W;st.format='jpg';const p=await app('renderExport')(()=>{});
    poster=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(p);});}
  return {b64,poster};
}

const server=await createServer({root:ROOT,logLevel:'error',server:{port:0,strictPort:false,hmr:false}});
await server.listen();
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal']});
fs.mkdirSync(OUT,{recursive:true});
try{
  for(const format of ['mp4','webm']){
    const page=await browser.newPage({viewport:{width:1400,height:900}});
    await page.addInitScript(()=>{window.__noPhotoPreview=true;});
    page.on('pageerror',e=>console.error('page error:',e.message));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'),null,{timeout:60000});
    const t0=Date.now();
    const r=await page.evaluate(inPage,{spec:SPEC,W,H,dur:DUR,format});
    fs.writeFileSync(path.join(OUT,'hero.'+format),Buffer.from(r.b64,'base64'));
    if(r.poster)fs.writeFileSync(path.join(OUT,'hero.jpg'),Buffer.from(r.poster,'base64'));
    console.log('wrote hero.'+format,Math.round(r.b64.length*.75/1024)+' KB',((Date.now()-t0)/1000).toFixed(0)+' s');
    await page.close();
  }
}finally{await browser.close();await server.close();}
