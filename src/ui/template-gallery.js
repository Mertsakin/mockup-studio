import {setScreenTexture} from '../devices/screen.js';
import {fromProjectFile,toProjectFile} from '../io/project.js';
import {state} from '../state/state.js';
import {activate,activeBoard,addBoard,clearAll,doc as docState,fillThumbs,storeActive} from './boards.js';
import {holdHistory} from './history.js';
import {loadShotVideo} from './image-input.js';
import {toast} from './toast.js';
import {setUi} from './ui-state.js';
import {fitAll} from './workspace.js';
import {$,$$} from '../util.js';

/* The template set (public/templates, made by tools/templates/build.mjs from tools/templates/specs.mjs): the
   Şablonlar tab lists templates/index.json by goal, in the light or dark variant. A template is a project file
   whose screens are empty: opening one adds its artboard(s) (a store set: five) after the others, and the screens
   on hand go onto its devices. The welcome card suggests templates of the chosen goal the same way. */
const BASE='templates/',MOBILE=new Set(['phone','tablet']);
let list=null;
async function templates(){
  if(list)return list;
  try{const r=await fetch(BASE+'index.json');if(!r.ok)throw 0;list=(await r.json()).templates||[];}catch(e){list=[];}
  return list;
}

// screens: {img, name, wide} or {file, video: true, name, wide}. Puts them on the live board's devices, each kind
// cycling through its own list: tall screens on phones and tablets, wide ones on laptops, monitors and browser
// windows. A device with no screen of its kind keeps its placeholder (a phone shot on a laptop reads as a mistake)
async function dressScreens(tall,wide){
  const n={tall:0,wide:0},waits=[];
  for(const d of state.devices){
    if(d.type==='model'||d.type==='custom')continue;
    const kind=MOBILE.has(d.type)?'tall':'wide',l=kind==='tall'?tall:wide;
    if(!l.length)continue;
    const s=l[n[kind]++%l.length];
    if(s.video){waits.push(loadShotVideo(d,s.file));continue;}
    d.img=s.img;d.imgName=s.name;d.video=null;d.videoName='';d.scroll=0;d.fit='cover';setScreenTexture(d);
  }
  await Promise.all(waits);
}
// the screenshots on the live board, by shape (what a template opened from the tab carries over)
function screensOnBoard(){
  const tall=[],wide=[],seen=new Set();
  state.devices.forEach(d=>{if(!d.img||seen.has(d.img))return;seen.add(d.img);const s={img:d.img,name:d.imgName,wide:d.img.naturalWidth>d.img.naturalHeight};(s.wide?wide:tall).push(s);});
  return {tall,wide};
}

// a template's project file (parsed once per variant)
const files=new Map();
async function templateDoc(t,variant){
  const v=t.variants[variant]||t.variants.light,k=v.file;
  if(!files.has(k))files.set(k,(async()=>{const r=await fetch(BASE+k);if(!r.ok)throw new Error('şablon dosyası '+r.status);return fromProjectFile(await r.text());})());
  return files.get(k);
}
// the device types on a template's first artboard (what screens it needs)
const deviceTypes=async(t,variant)=>{const d=await templateDoc(t,variant);return (d.boards[0].snap.devices||[]).map(x=>x.type);};
// adds a template's artboards (returns their ids); dress() puts screens on each new board's devices. The caller
// holds history if it needs one step
async function openTemplate(t,variant,dress){
  const doc=await templateDoc(t,variant),ids=[];
  for(const b of doc.boards){
    const nb=addBoard(b.snap,doc.boards.length>1?b.name:t.name);ids.push(nb.id);
    if(dress)await dress();
    storeActive();
  }
  return ids;
}

/* ---------- the Şablonlar tab */
const grid=$('#tplGrid'),empty=$('#tplEmpty');
let goal='all',variant='light';
const badge=t=>[t.boards>1?t.boards+' ekran':t.ratio,t.motion?'Hareketli':''].filter(Boolean);
async function renderTab(){
  const all=await templates();
  empty.hidden=all.length>0;
  grid.innerHTML='';
  all.filter(t=>goal==='all'||t.goal===goal).forEach(t=>{
    const b=document.createElement('button');b.type='button';b.className='tpl';b.title=t.name+': '+t.desc;
    b.innerHTML='<span class="tpl-im"><img loading="lazy" alt=""><span class="tpl-b"></span></span><span class="tpl-n"></span>';
    b.querySelector('img').src=BASE+(t.variants[variant]||t.variants.light).thumb;
    b.querySelector('.tpl-b').textContent=badge(t).join(' · ');b.querySelector('.tpl-n').textContent=t.name;
    b.addEventListener('click',()=>useFromTab(t));
    grid.appendChild(b);});
}
async function useFromTab(t){
  holdHistory(true);
  try{
    const s=screensOnBoard(),ids=await openTemplate(t,variant,()=>dressScreens(s.tall,s.wide));
    activate(ids[0]);setUi({kind:'board'});fitAll();
    toast(t.name+(ids.length>1?': '+ids.length+' artboard eklendi':' yeni artboard olarak eklendi')+(t.motion?'. Hareketi Canlandır’da önizle.':''));
  }catch(e){toast('Şablon açılamadı: '+(e.message||e));}
  finally{holdHistory(false);}
  fillThumbs();
}
/* ---------- the user's own templates: an artboard saved with its screens emptied, kept in this browser (IndexedDB,
   its own database: they belong to no project) as {id, name, created, thumb, blob (project file)} */
const UDB='mockup-templates',USTORE='tpl';
let udbP=null;
const udb=()=>udbP||(udbP=new Promise((res,rej)=>{const r=indexedDB.open(UDB,1);r.onupgradeneeded=()=>r.result.createObjectStore(USTORE,{keyPath:'id'});
  r.onsuccess=()=>res(r.result);r.onerror=()=>{udbP=null;rej(r.error);};}));
const tx=async(mode,fn)=>{const d=await udb();return new Promise((res,rej)=>{const t=d.transaction(USTORE,mode),st=t.objectStore(USTORE),out=fn(st);
  t.oncomplete=()=>res(out&&out.result);t.onerror=()=>rej(t.error);});};
const mineAll=()=>tx('readonly',st=>st.getAll()).then(l=>(l||[]).sort((a,b)=>b.created-a.created)).catch(()=>[]);
// a data URL scaled to w px wide (JPEG), for the card
function smaller(url,w){
  return new Promise(res=>{if(!url){res(null);return;}const i=new Image();i.onload=()=>{const k=Math.min(1,w/i.naturalWidth),c=document.createElement('canvas');
    c.width=Math.round(i.naturalWidth*k);c.height=Math.round(i.naturalHeight*k);c.getContext('2d').drawImage(i,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.85));};
    i.onerror=()=>res(null);i.src=url;});
}
async function saveAsTemplate(){
  const b=activeBoard();if(!b){toast('Önce bir artboard ekle.');return;}
  storeActive();
  // the screens go (keys of device screenshots and videos), everything else stays: scene, lights, text, frames
  const drop=new Set(),devices=b.snap.devices.map(d=>{if(d.img)drop.add(d.img);if(d.video)drop.add(d.video);
    return Object.assign({},d,{img:null,imgName:'',video:null,videoName:'',scroll:0,siteUrl:''});});
  const images={};for(const k in b.snap.images)if(!drop.has(k))images[k]=b.snap.images[k];
  const snap=Object.assign({},b.snap,{devices,images});
  const doc={v:2,layout:'max',active:1,boards:[{id:1,name:b.name,x:0,y:0,snap}],fonts:(docState.fonts||[]).slice()};
  try{
    const f=await toProjectFile(doc),rec={id:'u'+Date.now(),name:b.name,created:Date.now(),thumb:await smaller(b.thumb,480),blob:f.blob};
    await tx('readwrite',st=>st.put(rec));
    toast('"'+b.name+'" şablon olarak kaydedildi. Şablonlar sekmesinde, tüm projelerde.');renderMine();
  }catch(e){toast('Şablon kaydedilemedi: '+(e.message||e));}
}
async function useMine(rec){
  holdHistory(true);
  try{
    const d=await fromProjectFile(rec.blob),s=screensOnBoard(),ids=[];
    for(const b of d.boards){ids.push(addBoard(b.snap,rec.name).id);await dressScreens(s.tall,s.wide);storeActive();}
    activate(ids[0]);setUi({kind:'board'});fitAll();toast(rec.name+' yeni artboard olarak eklendi');
  }catch(e){toast('Şablon açılamadı: '+(e.message||e));}
  finally{holdHistory(false);}
  fillThumbs();
}
const mine=$('#tplMine'),mineEmpty=$('#tplMineEmpty');
async function renderMine(){
  const l=await mineAll();mineEmpty.hidden=l.length>0;mine.innerHTML='';
  l.forEach(rec=>{
    const w=document.createElement('div');w.className='tpl-mine';
    const b=document.createElement('button');b.type='button';b.className='tpl';b.title=rec.name+': yeni artboard olarak ekle';
    b.innerHTML='<span class="tpl-im"><img alt=""></span><span class="tpl-n"></span>';if(rec.thumb)b.querySelector('img').src=rec.thumb;
    b.querySelector('.tpl-n').textContent=rec.name;b.addEventListener('click',()=>useMine(rec));
    const x=document.createElement('button');x.type='button';x.className='ib sm tpl-del';x.setAttribute('aria-label',rec.name+' şablonunu sil');x.title='Şablonu sil';x.textContent='✕';
    x.addEventListener('click',async()=>{await tx('readwrite',st=>st.delete(rec.id));renderMine();toast('Şablon silindi');});
    w.append(b,x);mine.appendChild(w);});
}
$('#tplSave').addEventListener('click',saveAsTemplate);
renderMine();

$$('#tplGoals button').forEach(b=>b.addEventListener('click',()=>{goal=b.dataset.goal;$$('#tplGoals button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderTab();}));
$$('#tplVariant button').forEach(b=>b.addEventListener('click',()=>{variant=b.dataset.v;$$('#tplVariant button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderTab();}));
renderTab();

/* ?template=<id>[&v=dark]: the studio opens on that template (main.js starts the document empty instead of restoring
   the last session); it is added once start-up has settled */
const urlTemplate=(()=>{try{const q=new URLSearchParams(location.search);return q.get('template')?{id:q.get('template'),v:q.get('v')==='dark'?'dark':'light'}:null;}catch(e){return null;}})();
if(urlTemplate){
  const go=async()=>{const t=(await templates()).find(x=>x.id===urlTemplate.id);if(!t){toast('Şablon bulunamadı: '+urlTemplate.id);return;}
    // the start-up board (the default scene, kept because the last session was not restored) gives way
    try{clearAll();const ids=await openTemplate(t,urlTemplate.v);activate(ids[0]);setUi({kind:'board'});fitAll();fillThumbs();}catch(e){toast('Şablon açılamadı: '+(e.message||e));}};
  const wait=()=>{if(document.documentElement.classList.contains('booting'))setTimeout(wait,50);else go();};wait();
}

export {MOBILE,deviceTypes,dressScreens,openTemplate,saveAsTemplate,templates,urlTemplate};
