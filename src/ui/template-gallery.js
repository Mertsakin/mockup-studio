import {setScreenTexture} from '../devices/screen.js';
import {fromProjectFile} from '../io/project.js';
import {state} from '../state/state.js';
import {activate,addBoard,fillThumbs,storeActive} from './boards.js';
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

// adds a template's artboards (returns their ids); the caller holds history if it needs one step
async function openTemplate(t,variant,screens){
  const v=t.variants[variant]||t.variants.light;
  const r=await fetch(BASE+v.file);if(!r.ok)throw new Error('şablon dosyası '+r.status);
  const doc=await fromProjectFile(await r.text());
  const ids=[];
  for(const b of doc.boards){
    const nb=addBoard(b.snap,doc.boards.length>1?b.name:t.name);ids.push(nb.id);
    if(screens)await dressScreens(screens.tall,screens.wide);
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
    const ids=await openTemplate(t,variant,screensOnBoard());
    activate(ids[0]);setUi({kind:'board'});fitAll();
    toast(t.name+(ids.length>1?': '+ids.length+' artboard eklendi':' yeni artboard olarak eklendi')+(t.motion?'. Hareketi Canlandır’da önizle.':''));
  }catch(e){toast('Şablon açılamadı: '+(e.message||e));}
  finally{holdHistory(false);}
  fillThumbs();
}
$$('#tplGoals button').forEach(b=>b.addEventListener('click',()=>{goal=b.dataset.goal;$$('#tplGoals button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderTab();}));
$$('#tplVariant button').forEach(b=>b.addEventListener('click',()=>{variant=b.dataset.v;$$('#tplVariant button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderTab();}));
renderTab();

export {dressScreens,openTemplate,templates};
