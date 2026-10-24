// The website hero's demo scene (wireframes/site-hero.html, later the site): a laptop and a phone with an 8 s looping
// animation (camera sweep and push, lid opening, phone turning), saved as a project file the embed player opens.
// Usage: node tools/site/hero-demo.mjs   -> wireframes/assets/hero-demo.mockup.json (sample screens: tools/landing/src/)
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..'),OUT=path.join(ROOT,'wireframes/assets/hero-demo.mockup.json');
const S='/tools/landing/src/',DUR=8;

async function inPage({S,DUR}){
  const app=window.__app,st=app('state');
  if(!app('hasBoard')())app('addBoard')();
  app('applyTemplate')({ratio:'16:9',bg:{bg:'transparent'},floor:true,lights:'Stüdyo',settle:true,scene:{rx:10,ry:-16,zoom:1},
    devices:[{type:'laptop',colorKey:'silver'},{type:'phone',colorKey:'graphite',px:19,pz:7,ry:-18}]});
  const load=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error(src));i.src=src;});
  const shots=[S+'studio-laptop.png',S+'app-light.png'];
  for(let i=0;i<2;i++){const d=st.devices[i];d.img=await load(shots[i]);d.imgName='ekran.png';app('setScreenTexture')(d);}
  app('settleDevices')();
  const k=(pairs,ease='smooth')=>pairs.map(([t,v])=>({t,v,ease}));
  const sc=st.scene;
  sc.tracks={ry:k([[0,-16],[4,10],[8,-16]]),zoom:k([[0,1.12],[4,1.34],[8,1.12]])};
  const [lap,ph]=st.devices;
  lap.tracks={lidAngle:k([[0,78],[1.6,108],[6.4,108],[8,78]])};
  ph.tracks={ry:k([[0,ph.ry],[2.5,ph.ry-34],[5.5,ph.ry+8],[8,ph.ry]])};
  st.anim.dur=DUR;st.anim.loop=true;
  app('refit')();app('applyTransform')();app('req')();
  await new Promise(r=>setTimeout(r,600));
  const snap=app('docSnapshot')();snap.boards.forEach(b=>{b.thumb=null;});snap.assets=[];snap.assetImages={};
  return await (await app('toProjectFile')(snap)).blob.text();
}

const server=await createServer({root:ROOT,logLevel:'error',server:{port:0,strictPort:false,hmr:false}});
await server.listen();
const browser=await chromium.launch({args:['--use-angle=metal']});
try{
  const page=await browser.newPage({locale:'tr-TR',viewport:{width:1400,height:900}});
  await page.addInitScript(()=>{window.__noPhotoPreview=true;});
  page.on('pageerror',e=>console.error('page error:',e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'),null,{timeout:60000});
  const json=await page.evaluate(inPage,{S,DUR});
  fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,json);
  console.log('wrote',path.relative(ROOT,OUT),Math.round(json.length/1024)+' KB');
}finally{await browser.close();await server.close();}
