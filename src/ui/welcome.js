import {buildRT,disposeRT} from '../devices/runtime.js';
import {setScreenTexture} from '../devices/screen.js';
import {isVideoFile,loadVideo,videoSize} from '../devices/video.js';
import {COMPS} from '../state/constants.js';
import {newDevice,state} from '../state/state.js';
import {activate,addBoard,boardById,boardSize,clearAll,hasBoard,moveBoard,onBoards,removeBoard,storeActive} from './boards.js';
import {captureAvailable,captureShots,normalizeUrl,putShot,shotImage,siteName,viewport} from './capture.js';
import {applyComp} from './devices-panel.js';
import {applyPreset,setMode} from './animate.js';
import {holdHistory} from './history.js';
import {loadShotVideo,routeShots} from './image-input.js';
import {layout} from './layout.js';
import {openStoreDialog} from './store.js';
import {onSyncUI} from './sync.js';
import {toast} from './toast.js';
import {setUi,ui} from './ui-state.js';
import {fitAll} from './workspace.js';
import {$,$$} from '../util.js';

/* The welcome card: an empty document (no artboard) opens on it instead of on a bare canvas
   (wireframes/onboarding.html, alternative A with B's goals). A site address or dropped screenshots / videos lead
   to ready-made scenes; "Ne hazırlıyorsun?" picks what they are for. The panels, the dock and the canvas are out of
   the way while it shows (html.wl-on); it goes as soon as the document has an artboard, whatever made it. The
   address row is there only where capturing works (the dev server), otherwise the drop zone is the way in.

   Suggestions are real artboards: each scene is built as a board with the user's screens and rendered to its
   thumbnail (the boards' own off-view render), the picker shows those, and confirming keeps the picked boards and
   removes the rest. History is held meanwhile, so the whole thing is one undo step (back to the empty document). */
const root=document.documentElement,card=$('#welcome'),start=$('#wlStart'),pick=$('#wlPick');
let goal='land',shown=false,picking=null;  // picking: {ids, chosen} while the picker is up

function sync(){
  const on=!hasBoard()||!!picking;
  if(on===shown)return;
  shown=on;card.hidden=!on;root.classList.toggle('wl-on',on);
  if(on&&!picking){if(ui.mode==='animate')setMode('design');showStart();}  // an empty document is never in Canlandır
}
function showStart(){
  start.hidden=false;pick.hidden=true;
  requestAnimationFrame(()=>{if(root.classList.contains('booting'))return;(!$('#wlUrlRow').hidden?$('#wlUrl'):$('#wlDrop')).focus();});
}
onBoards(sync);onSyncUI(sync);

captureAvailable().then(ok=>{
  $('#wlUrlRow').hidden=$('#wlOr').hidden=!ok;
  if(!ok)$('#wlSub').textContent='Ekran görüntülerini ya da ekran videonu bırak; telefon, tablet ve dizüstünde hazır sahneler kuralım.';
});

$$('#welcome [data-goal]').forEach(b=>b.addEventListener('click',()=>{
  goal=b.dataset.goal;card.dataset.goal=goal;$$('#welcome [data-goal]').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));
}));

/* ---------- scenes */
const comp=n=>COMPS.find(c=>c.n===n);
const MOBILE=new Set(['phone','tablet']);
// which scenes to suggest for the screens at hand: tall screens go on phones and tablets, wide ones on laptops,
// monitors and browser windows; a scene needs at least one screen of its kind
function recipes(tall,wide){
  if(tall&&wide)return [comp('Tek telefon'),comp('Telefon + dizüstü'),comp('Telefon yelpazesi'),comp('Tarayıcı + telefon')];
  if(tall)return [comp('Tek telefon'),comp('Telefon yelpazesi'),comp('Tablet + telefon'),{n:'Tek tablet',items:[{type:'tablet'}],scene:{rx:-6,ry:22,rz:0}}];
  return [{n:'Dizüstü',items:[{type:'laptop'}],scene:{rx:12,ry:-18,rz:0}},{n:'Tarayıcı penceresi',items:[{type:'browser',ry:6}],scene:{rx:-6,ry:18,rz:0}},
    {n:'Monitör',items:[{type:'monitor'}],scene:{rx:8,ry:-16,rz:0}},{n:'Dizüstü + monitör',items:[{type:'monitor'},{type:'laptop',px:-31,py:-10.25,pz:8,ry:22}],scene:{rx:8,ry:0,rz:0}}];
}
// a screen: {img} or {file, video: true}, with its shape
async function readScreen(file){
  if(isVideoFile(file)){
    const v=await loadVideo(URL.createObjectURL(file));const [w,h]=videoSize(v);v.pause();return {file,video:true,name:file.name||'Video',wide:w>h};
  }
  if(!/^image\//.test(file.type))return null;
  const img=await new Promise((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=fail;i.src=URL.createObjectURL(file);});
  return {img,name:file.name||'Görsel',wide:img.naturalWidth>img.naturalHeight};
}
// puts the screens on the live board's devices, each kind cycling through its own list (the other kind if empty)
async function dress(tall,wide){
  const n={tall:0,wide:0},waits=[];
  for(const d of state.devices){
    const kind=MOBILE.has(d.type)?(tall.length?'tall':'wide'):(wide.length?'wide':'tall');
    const list=kind==='tall'?tall:wide,s=list[n[kind]++%list.length];
    if(s.video){waits.push(loadShotVideo(d,s.file));continue;}
    d.img=s.img;d.imgName=s.name;d.video=null;d.videoName='';d.scroll=0;d.fit='cover';setScreenTexture(d);
  }
  await Promise.all(waits);
}
const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
// what the scenes are for: a social post gets the first two scenes square and upright (1:1, 9:16)
function forGoal(list){
  if(goal!=='social')return list;
  return list.slice(0,2).flatMap(c=>['1:1','9:16'].map(r=>Object.assign({},c,{n:c.n+' · '+r,ratio:r})));
}
const GOAL_NOTE={video:' · kaydırma hareketiyle Canlandır\'da açılır'};

async function fromFiles(files){
  if(picking)return;
  let screens;
  try{screens=(await Promise.all(files.map(f=>readScreen(f).catch(()=>null)))).filter(Boolean);}catch(e){screens=[];}
  if(!screens.length){toast('Bu dosyalar açılamadı. PNG, JPG, WebP ya da MP4 / WebM dene.');return;}
  const tall=screens.filter(s=>!s.wide),wide=screens.filter(s=>s.wide);
  await buildScenes(forGoal(recipes(tall.length>0,wide.length>0)),()=>dress(tall,wide),
    screens.length===1?screens[0].name:screens.length+' ekran');
}

// builds one board per recipe (dress: puts the screens on), renders their thumbnails and opens the picker
async function buildScenes(list,dressBoard,what){
  holdHistory(true);
  picking={ids:[],chosen:new Set()};
  start.hidden=true;pick.hidden=false;
  $('#wlPickTitle').textContent='Sahneler hazırlanıyor';$('#wlPickSub').textContent='';$('#wlPickSub').textContent=what;
  $('#wlAdd').disabled=true;$('#wlAdd').textContent='Artboard ekle';
  const grid=$('#wlGrid');grid.innerHTML='';
  const tiles=list.map(r=>{
    const b=document.createElement('button');b.type='button';b.className='wl-res';b.setAttribute('aria-pressed','false');b.disabled=true;
    b.innerHTML='<span class="im wait"></span><span class="ck" aria-hidden="true"></span><b></b>';b.querySelector('b').textContent=r.n;
    grid.appendChild(b);return b;});
  $('#wlStatus').textContent='Sahneler hazırlanıyor… 0 / '+list.length;
  try{
    for(let i=0;i<list.length;i++){
      if(!picking)return;
      const b=addBoard(null,list[i].n);picking.ids.push(b.id);
      if(list[i].ratio){state.ratio=list[i].ratio;layout();}  // before the composition, so it frames for this shape
      applyComp(list[i]);await dressBoard();await frames();
      storeActive();  // the board's thumbnail, rendered off-view
      const t=tiles[i],[w,h]=boardSize(b);t.dataset.id=b.id;t.style.setProperty('--ar',w+'/'+h);
      const im=t.querySelector('.im');im.classList.remove('wait');if(b.thumb)im.style.backgroundImage='url("'+b.thumb+'")';
      t.disabled=false;if(i<2)choose(t,true);
      $('#wlStatus').textContent=i+1<list.length?'Sahneler hazırlanıyor… '+(i+1)+' / '+list.length:'';
    }
  }catch(e){toast('Sahneler kurulamadı: '+(e.message||e));back();return;}
  $('#wlPickTitle').textContent=list.length+' sahne';
  $('#wlPickSub').textContent=what+' · istediğin kadarını seç, her biri ayrı artboard olur'+(GOAL_NOTE[goal]||'');
  $('#wlPickTitle').focus();
}
function choose(t,on){
  const id=+t.dataset.id;if(on)picking.chosen.add(id);else picking.chosen.delete(id);t.setAttribute('aria-pressed',String(on));
  const n=picking.chosen.size;$('#wlAdd').disabled=!n;$('#wlAdd').textContent=n?n+' artboard ekle':'Bir sahne seç';
}
$('#wlGrid').addEventListener('click',e=>{const t=e.target.closest('.wl-res');if(!t||t.disabled||!picking)return;choose(t,!picking.chosen.has(+t.dataset.id));});

// keeps the picked boards side by side, the first one active and fitted
function confirm(){
  if(!picking||!picking.chosen.size)return;
  const keep=picking.ids.filter(id=>picking.chosen.has(id));
  picking.ids.filter(id=>!picking.chosen.has(id)).forEach(removeBoard);
  let x=0;keep.forEach(id=>{const b=boardById(id);moveBoard(id,x,0);x+=boardSize(b)[0]+160;});
  // a promo video: long screenshots scroll to their end over the artboard's time, then Canlandır opens on it
  const video=goal==='video';
  if(video)keep.forEach(id=>{activate(id);state.devices.forEach(d=>{if(d.img&&!d.video)applyPreset('scroll',d);});});
  activate(keep[0]);
  picking=null;holdHistory(false);sync();setUi({kind:'board'});
  if(video)setMode('animate');
  coach();
  requestAnimationFrame(()=>fitAll());
  toast(keep.length+' artboard eklendi');
}
// back to the start card: the scenes go, the document is empty again
function back(){
  if(!picking)return;
  picking=null;clearAll();holdHistory(false);
  showStart();
}
$('#wlAdd').addEventListener('click',confirm);
$('#wlBack').addEventListener('click',back);
card.addEventListener('keydown',e=>{if(e.key==='Escape'&&picking){e.preventDefault();e.stopPropagation();back();}});

/* ---------- from a site address: every device type is captured at its own viewport, one request each, so each
   row shows its own progress; the scenes are built once the phone (at least) has arrived */
const SITE=[{type:'phone',n:'Telefon'},{type:'tablet',n:'Tablet'},{type:'laptop',n:'Dizüstü'},{type:'browser',n:'Tarayıcı'}];
const SITE_SCENES=['Tek telefon','Telefon + dizüstü','Tablet + telefon','Tarayıcı + telefon'];
// a device type's capture viewport (capture.js viewport needs the device built: a scratch one, removed right away)
function viewportOf(type){
  const d=newDevice(type);buildRT(d);
  try{return viewport(d);}finally{disposeRT(d.id);}
}
let run=0;  // the current capture; Vazgeç or a new one makes older answers stale
async function fromUrl(raw){
  if(picking||start.classList.contains('wl-busy'))return;
  const url=normalizeUrl(raw),me=++run;
  try{new URL(url);}catch(e){toast('Bu bir adres gibi görünmüyor.');$('#wlUrl').focus();return;}
  start.classList.add('wl-busy');$('#wlProg').hidden=false;$('#wlGo').textContent='Yakalanıyor…';
  $('#wlPnote').textContent='Sayfa her cihazın kendi genişliğinde açılıyor…';$('#wlCancel').hidden=false;
  const rows=$('#wlProws');rows.innerHTML='';
  const jobs=SITE.map(s=>{
    const v=viewportOf(s.type),row=document.createElement('div');row.className='wl-prow run';
    row.innerHTML='<span class="wl-dot" aria-hidden="true"></span><span></span><span class="v"></span>';
    row.children[1].textContent=s.n;row.children[2].textContent=v.width+' px';rows.appendChild(row);
    const p=captureShots(url,[Object.assign({id:s.type},v)]).then(async r=>{
      const img=await shotImage(r.shots[s.type]);if(me===run){row.className='wl-prow ok';}return {type:s.type,img,finalUrl:r.finalUrl||url};
    }).catch(e=>{if(me===run){row.className='wl-prow fail';row.children[2].textContent='alınamadı';}throw e;});
    return p;});
  const res=await Promise.allSettled(jobs);
  if(me!==run)return;  // cancelled meanwhile
  const shots={};res.forEach(r=>{if(r.status==='fulfilled')shots[r.value.type]=r.value;});
  // no phone shot: the rows stay with the reason under them, the address can be fixed and sent again
  if(!shots.phone){const e=res.find(r=>r.status==='rejected'),why=e&&e.reason;
    endCapture(true);$('#wlPnote').textContent=why&&why.user?why.message:'Sayfa yakalanamadı'+(why?': '+(why.message||why):'.');$('#wlUrl').focus();return;}
  endCapture();
  // a scene is offered when all its devices have their shot
  const list=forGoal(SITE_SCENES.map(comp).filter(c=>c.items.every(it=>shots[it.type])));
  const name=siteName(shots.phone.finalUrl);
  await buildScenes(list,async()=>{state.devices.forEach(d=>{const s=shots[d.type];if(s)putShot(d,s.img,s.finalUrl,raw);});},name);
}
function endCapture(keep){start.classList.remove('wl-busy');$('#wlProg').hidden=!keep;$('#wlCancel').hidden=true;$('#wlGo').textContent='Mockup oluştur';}
$('#wlCancel').addEventListener('click',()=>{run++;endCapture();$('#wlUrl').focus();});

// what the card was given: a site address or files
function begin(input){
  if(input.files)fromFiles(input.files);
  else fromUrl(input.url);
}
// files dropped or pasted anywhere while the card shows come here
routeShots(files=>{
  if(!shown)return false;
  if(picking||start.classList.contains('wl-busy'))return true;
  const usable=files.filter(f=>isVideoFile(f)||/^image\//.test(f.type));
  if(!usable.length)return false;
  begin({files:usable});return true;
});

$('#wlUrlRow').addEventListener('submit',e=>{e.preventDefault();const v=$('#wlUrl').value.trim();if(!v){$('#wlUrl').focus();return;}begin({url:v});});
const drop=$('#wlDrop'),file=$('#wlFile');
drop.addEventListener('click',()=>file.click());
drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();file.click();}});
file.addEventListener('change',()=>{const fs=[...file.files];file.value='';if(fs.length)begin({files:fs});});
card.addEventListener('dragover',()=>drop.classList.add('over'));
card.addEventListener('dragleave',e=>{if(!card.contains(e.relatedTarget))drop.classList.remove('over');});
card.addEventListener('drop',()=>drop.classList.remove('over'));
/* ---------- one-time hint: the first scenes made here point at Dışa aktar and the photo quality (remembered in this
   browser; without storage it may show again, which is harmless) */
const COACH='mockup.coach.export',tip=$('#coach'),exportBtn=$('#exportMenuBtn');
function seen(){try{return localStorage.getItem(COACH)==='1';}catch(e){return false;}}
function place(){const r=exportBtn.getBoundingClientRect();tip.style.top=(r.bottom+10)+'px';tip.style.right=Math.max(8,innerWidth-r.right)+'px';}
function coach(){if(seen())return;place();tip.hidden=false;}
function dismiss(){if(tip.hidden)return;tip.hidden=true;try{localStorage.setItem(COACH,'1');}catch(e){/* private mode: shows again next time */}}
$('#coachOk').addEventListener('click',dismiss);
exportBtn.addEventListener('click',dismiss);
window.addEventListener('resize',()=>{if(!tip.hidden)place();});
window.addEventListener('keydown',e=>{if(e.key==='Escape')dismiss();});

$('#wlBlank').addEventListener('click',()=>$('#emptyAddBoard').click());
// a store set has its own form (store.js); the set's artboards close the card
$('#wlStore').addEventListener('click',()=>openStoreDialog());
$('#wlOpen').addEventListener('click',()=>$('#openProjectBtn').click());

export {begin as startWelcome};
