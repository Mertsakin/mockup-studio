// Renders and saves the template set (specs.mjs) into public/templates/: for each template and variant a
// thumbnail (<id>-<v>.jpg, sample screens, the real export path) and the template itself (<id>-<v>.mockup.json:
// a project file whose device screens are emptied), plus index.json (the list the studio reads).
// Usage: node tools/templates/build.mjs [id …]   (GPU: ANGLE/Metal). Sample screens: tools/landing/src/ (made by
// node tools/landing/shots.mjs).
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {GOALS,TEMPLATES} from './specs.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..'),OUT=path.join(ROOT,'public/templates');
const only=process.argv.slice(2),VARIANTS=['light','dark'];
const LINES=[{h:'Planını saniyeler içinde kur',s:'Tek dokunuşla görev, hatırlatma, not.'},{h:'Ekibinle birlikte çalış',s:'Paylaş, yorumla, birlikte bitir.'},
  {h:'Gece de gözlerin dinlensin',s:'Koyu tema, her ekranda.'},{h:'Her yerden eriş',s:'Telefon, tablet ve bilgisayarda.'},{h:'Verilerin güvende',s:'Uçtan uca şifreleme.'}];

// runs in the page: builds one variant on an empty document, returns {thumb (data URL), file (project JSON text)}
async function buildInPage({spec,W,set,dur,name,lines}){
  const app=window.__app,st=app('state');
  const load=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('image '+src));i.src=src;});
  const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const exportBoard=async w=>{st.size=w;st.format='jpg';const b=await app('renderExport')(()=>{});return b;};
  if(spec.store){
    const o=spec.store,shots=[];for(const s of o.shots){const i=await load(s);i.dataset.name='ekran.png';shots.push(i);}
    await app('generateStoreSet')({size:app('STORE_SIZES').find(z=>z.id===o.size),n:set,single:false,layout:o.layout,theme:o.theme,font:o.font,shots,lines});
  }else{
    app('addBoard')(null,name);
    app('applyTemplate')(Object.assign({floor:true,lights:'Yumuşak tavan'},spec));
    for(let i=0;i<st.devices.length;i++){const d=st.devices[i],s=spec.devices[i];if(s.img){d.img=await load(s.img);d.imgName='ekran.png';app('setScreenTexture')(d);}}
    if(spec.settle)app('settleDevices')();
    Object.assign(st.scene,spec.scene||{});
    if(spec.lensMm)st.scene.fov=app('fovFromMm')(spec.lensMm);
    if(spec.dof){st.dof=Object.assign({on:true,focus:null,blades:0,bg:true},st.dof||{},{on:true});st.scene.fnum=spec.dof.fnum||2;
      const d=st.devices[spec.dof.focus||0];if(d)st.dof.focus={dev:d.id};}
    (spec.texts||[]).forEach(t=>app('addText')(t));
    if(dur)st.anim.dur=dur;
    for(const m of spec.motion||[]){
      if(m.text){const it=st.items.find(x=>x.name===m.text);if(it)it.fx=Object.assign({},it.fx||{},{in:Object.assign(app('newFx')(m.fx,Array.from(it.text.replace(/\s/g,'')).length),{t:m.t||0})});}
      else app('applyPreset')(m.preset,m.to==='cam'?st.scene:st.devices[m.to]);
    }
    app('refit')();app('applyTransform')();app('layout')();app('req')();
  }
  if(document.fonts)await document.fonts.ready;
  await frames();await new Promise(r=>setTimeout(r,500));
  // thumbnail: the first board, or the first three of a set side by side
  const doc=app('doc'),boards=doc.boards.slice(0,set?3:1),imgs=[];
  for(const b of boards){app('activate')(b.id);await frames();await new Promise(r=>setTimeout(r,300));
    const blob=await exportBoard(set?440:Math.min(960,W));imgs.push(await createImageBitmap(blob));}
  // a set's boards are their store size (custom): each panel is scaled to P px wide
  const P=set?360:0,sz=i=>P?[P,Math.round(i.height*P/i.width)]:[i.width,i.height];
  const gap=set?24:0,tw=imgs.reduce((a,i)=>a+sz(i)[0],0)+gap*(imgs.length+1),th=Math.max(...imgs.map(i=>sz(i)[1]))+gap*2;
  const c=document.createElement('canvas');c.width=tw;c.height=th;const g=c.getContext('2d');
  if(set){g.fillStyle=spec.store.theme.c2;g.fillRect(0,0,tw,th);}
  let x=gap;for(const i of imgs){const [w,h]=sz(i);g.drawImage(i,x,gap,w,h);x+=w+gap;}
  const thumb=c.toDataURL('image/jpeg',.84);
  // a moving template: a short preview (the first PREVIEW_S of its animation, small, WebM) for the card's hover
  let preview=null;
  if(dur){
    const PW=360,FPS=12,PREVIEW_S=Math.min(3,dur),n=Math.round(PREVIEW_S*FPS);
    const {encoderFor}=await import('/src/export/encoders.js');
    st.size=PW;st.format='jpg';
    const first=await createImageBitmap(await app('renderExport')(()=>{}));
    const enc=await encoderFor('webm',first.width-first.width%2,first.height-first.height%2,FPS);first.close();
    for(let i=0;i<n;i++){app('applyAt')(i/FPS,{sync:true});await frames();
      const bmp=await createImageBitmap(await app('renderExport')(()=>{}));await enc.add(bmp,i);bmp.close();}
    app('applyAt')(0,{sync:true});
    const blob=await enc.finish();
    preview=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(blob);});
  }
  // the template: every board's screens emptied (they show the placeholder until the user's screens arrive)
  for(const b of doc.boards){app('activate')(b.id);
    st.devices.forEach(d=>{d.img=null;d.imgName='';d.video=null;d.videoName='';d.scroll=0;d.siteUrl='';app('setScreenTexture')(d);});
    app('storeActive')();}
  app('activate')(doc.boards[0].id);
  const snap=app('docSnapshot')();snap.boards.forEach(b=>{b.thumb=null;});snap.assets=[];snap.assetImages={};
  const f=await app('toProjectFile')(snap);
  return {thumb,preview,file:await f.blob.text()};
}

const server=await createServer({root:ROOT,logLevel:'error',server:{port:0,strictPort:false,hmr:false}});
await server.listen();
const url=server.resolvedUrls.local[0];
const browser=await chromium.launch({args:['--use-angle=metal']});
fs.mkdirSync(OUT,{recursive:true});
const index=fs.existsSync(path.join(OUT,'index.json'))?JSON.parse(fs.readFileSync(path.join(OUT,'index.json'),'utf8')):{templates:[]};
let failed=false;
try{
  for(const t of TEMPLATES.filter(x=>!only.length||only.includes(x.id))){
    const entry={id:t.id,name:t.n,goal:t.goal,goalName:GOALS[t.goal],desc:t.d,ratio:t.set?'9:19.5':null,boards:t.set||1,motion:t.goal==='video',variants:{}};
    for(const v of VARIANTS){
      const page=await browser.newPage({viewport:{width:1400,height:900}});
      await page.addInitScript(()=>{window.__noPhotoPreview=true;});
      page.on('pageerror',e=>{failed=true;console.error(t.id,v,'page error:',e.message);});
      page.on('console',m=>{if(m.type()==='error'){failed=true;console.error(t.id,v,'console error:',m.text());}});
      await page.goto(url);
      await page.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'),null,{timeout:60000});
      const spec=t.v(v);
      const r=await page.evaluate(buildInPage,{spec,W:t.W,H:t.H,set:t.set||0,dur:t.dur||0,name:t.n,lines:LINES});
      const base=t.id+'-'+v;
      fs.writeFileSync(path.join(OUT,base+'.jpg'),Buffer.from(r.thumb.split(',')[1],'base64'));
      fs.writeFileSync(path.join(OUT,base+'.mockup.json'),r.file);
      entry.ratio=entry.ratio||spec.ratio;
      entry.variants[v]={file:base+'.mockup.json',thumb:base+'.jpg'};
      if(r.preview){fs.writeFileSync(path.join(OUT,base+'.webm'),Buffer.from(r.preview.split(',')[1],'base64'));entry.variants[v].preview=base+'.webm';}
      console.log('wrote',base,Math.round(r.file.length/1024)+' KB');
      await page.close();
    }
    index.templates=index.templates.filter(x=>x.id!==t.id).concat(entry);
  }
  // the list in the set's own order
  const order=TEMPLATES.map(x=>x.id);index.templates.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
  fs.writeFileSync(path.join(OUT,'index.json'),JSON.stringify(index,null,1));
}finally{await browser.close();await server.close();}
if(failed)process.exit(1);
