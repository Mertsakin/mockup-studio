import {buildRT,disposeRT} from '../devices/runtime.js';
import {isVideoFile,loadVideo,videoSize} from '../devices/video.js';
import {COMPS} from '../state/constants.js';
import {newDevice,state} from '../state/state.js';
import {activate,addBoard,boardById,boardSize,clearAll,hasBoard,moveBoard,onBoards,removeBoard,storeActive} from './boards.js';
import {captureAvailable,captureShots,normalizeUrl,putShot,shotImage,siteName,viewport} from './capture.js';
import {applyComp} from './devices-panel.js';
import {MOBILE,deviceTypes,dressScreens,openTemplate,templates} from './template-gallery.js';
import {applyPreset,setMode} from './animate.js';
import {holdHistory} from './history.js';
import {routeShots} from './image-input.js';
import {layout} from './layout.js';
import {openStoreDialog} from './store.js';
import {onSyncUI} from './sync.js';
import {toast} from './toast.js';
import {setUi,ui} from './ui-state.js';
import {fitAll} from './workspace.js';
import {t as tx} from '../lang.js';
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
/* modal: the card opened over the home page (ui/home.js) as a window of its own, {before, done, closed}: before() runs
   when the user starts (an address, files; it may empty the document first and returns false to stop), done() once
   the picked scenes are kept, closed() when the window closes without them. The card lives in the stage otherwise. */
let modal=null;
// before() is asking (a question about unsaved work): another press waits for it instead of asking again
let asking=false;
async function ready(m){if(!m.before)return true;if(asking)return false;asking=true;try{return !!(await m.before());}finally{asking=false;}}
const modalBox=document.createElement('div');modalBox.className='wl-modal';modalBox.hidden=true;document.body.appendChild(modalBox);
const home0={parent:card.parentNode,next:card.nextSibling};

function sync(){
  if(modal){card.hidden=false;shown=true;return;}
  const on=!hasBoard()||!!picking;
  if(on===shown)return;
  shown=on;card.hidden=!on;root.classList.toggle('wl-on',on);
  // nothing to design, animate or export while the card shows (also while its scenes are being picked)
  $$('#modeSeg button').forEach(b=>{b.disabled=on;});$('#exportMenuBtn').disabled=on;
  if(on)$('#coach').hidden=true;  // the export hint belongs to the editor
  if(on&&!picking){if(ui.mode==='animate')setMode('design');showStart();}  // an empty document is never in Canlandır
}
function showStart(){
  start.hidden=false;pick.hidden=true;
  requestAnimationFrame(()=>{if(root.classList.contains('booting'))return;(!$('#wlUrlRow').hidden?$('#wlUrl'):$('#wlDrop')).focus();});
}
onBoards(sync);onSyncUI(sync);

captureAvailable().then(ok=>{
  $('#wlUrlRow').hidden=$('#wlOr').hidden=!ok;
  if(!ok)$('#wlSub').textContent=tx('Ekran görüntülerini ya da ekran videonu bırak; telefon, tablet ve dizüstünde hazır sahneler kuralım.');
});

$$('#welcome [data-goal]').forEach(b=>b.addEventListener('click',()=>{
  goal=b.dataset.goal;card.dataset.goal=goal;$$('#welcome [data-goal]').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));
}));

/* ---------- scenes */
const comp=n=>COMPS.find(c=>c.n===n);
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
    const v=await loadVideo(URL.createObjectURL(file));const [w,h]=videoSize(v);v.pause();return {file,video:true,name:file.name||tx('Video'),wide:w>h};
  }
  if(!/^image\//.test(file.type))return null;
  const img=await new Promise((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=fail;i.src=URL.createObjectURL(file);});
  return {img,name:file.name||tx('Görsel'),wide:img.naturalWidth>img.naturalHeight};
}
// a dark screenshot (a dark-themed app) gets the templates' dark variant
function variantFor(img){
  if(!img)return 'light';
  const c=document.createElement('canvas');c.width=c.height=8;const g=c.getContext('2d');g.drawImage(img,0,0,8,8);
  const d=g.getImageData(0,0,8,8).data;let y=0;for(let i=0;i<d.length;i+=4)y+=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
  return y/(d.length/4)/255<.35?'dark':'light';
}
/* The suggestions: the chosen goal's templates whose every device gets a screen (has(type)), then ready-made
   compositions until there are four. Each one knows how to build its board (build() -> board id); dress() puts
   the screens on the board being built. */
async function suggest(has,comps,dress,variant){
  const out=[];
  for(const t of (await templates()).filter(x=>x.goal===goal)){
    if(out.length>=4)break;
    let types;try{types=await deviceTypes(t,variant);}catch(e){continue;}
    if(types.length&&types.every(has))out.push({n:tx(t.name),tpl:true,build:async()=>(await openTemplate(t,variant,dress))[0]});
  }
  for(const c of comps){
    if(out.length>=4)break;
    if(out.some(o=>o.n===c.n))continue;
    out.push({n:tx(c.n),build:async()=>{const b=addBoard(null,tx(c.n));
      if(c.ratio){state.ratio=c.ratio;layout();}  // before the composition, so it frames for this shape
      applyComp(c);await dress();return b.id;}});
  }
  return out;
}
const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
// what the scenes are for: a social post gets the first two scenes square and upright (1:1, 9:16)
function forGoal(list){
  if(goal!=='social')return list;
  return list.slice(0,2).flatMap(c=>['1:1','9:16'].map(r=>Object.assign({},c,{n:tx(c.n)+' · '+r,ratio:r})));
}
const GOAL_NOTE={video:'hareketiyle Canlandır\'da açılır'};

async function fromFiles(files){
  if(picking)return;
  let screens;
  try{screens=(await Promise.all(files.map(f=>readScreen(f).catch(()=>null)))).filter(Boolean);}catch(e){screens=[];}
  if(!screens.length){toast(tx('Bu dosyalar açılamadı. PNG, JPG, WebP ya da MP4 / WebM dene.'));return;}
  const tall=screens.filter(s=>!s.wide),wide=screens.filter(s=>s.wide);
  const first=(tall[0]||wide[0]).img;
  const list=await suggest(type=>MOBILE.has(type)?tall.length>0:wide.length>0,forGoal(recipes(tall.length>0,wide.length>0)),
    ()=>dressScreens(tall,wide),variantFor(first));
  await buildScenes(list,screens.length===1?screens[0].name:tx('{n} ekran',{n:screens.length}));
}

// builds one board per suggestion, renders their thumbnails and opens the picker
async function buildScenes(list,what){
  holdHistory(true);
  picking={ids:[],chosen:new Set(),tpl:new Set()};
  start.hidden=true;pick.hidden=false;
  $('#wlPickTitle').textContent=tx('Sahneler hazırlanıyor');$('#wlPickSub').textContent='';$('#wlPickSub').textContent=what;
  $('#wlAdd').disabled=true;$('#wlAdd').textContent=tx('Artboard ekle');
  const grid=$('#wlGrid');grid.innerHTML='';
  const tiles=list.map(r=>{
    const b=document.createElement('button');b.type='button';b.className='wl-res';b.setAttribute('aria-pressed','false');b.disabled=true;
    b.innerHTML='<span class="im wait"></span><span class="ck" aria-hidden="true"></span><b></b>';b.querySelector('b').textContent=r.n;
    grid.appendChild(b);return b;});
  $('#wlStatus').textContent=tx('Sahneler hazırlanıyor…')+' 0 / '+list.length;
  try{
    for(let i=0;i<list.length;i++){
      if(!picking)return;
      const id=await list[i].build(),b=boardById(id);picking.ids.push(id);if(list[i].tpl)picking.tpl.add(id);
      await frames();
      storeActive();  // the board's thumbnail, rendered off-view
      const t=tiles[i],[w,h]=boardSize(b);t.dataset.id=b.id;t.style.setProperty('--ar',w+'/'+h);
      const im=t.querySelector('.im');im.classList.remove('wait');if(b.thumb)im.style.backgroundImage='url("'+b.thumb+'")';
      t.disabled=false;if(i<2)choose(t,true);
      $('#wlStatus').textContent=i+1<list.length?tx('Sahneler hazırlanıyor…')+' '+(i+1)+' / '+list.length:'';
    }
  }catch(e){toast(tx('Sahneler kurulamadı: {m}',{m:e.message||e}));back();return;}
  $('#wlPickTitle').textContent=tx('{n} sahne',{n:list.length});
  $('#wlPickSub').textContent=what+' · '+tx('istediğin kadarını seç, her biri ayrı artboard olur')+(GOAL_NOTE[goal]?' · '+tx(GOAL_NOTE[goal]):'');
  $('#wlPickTitle').focus();
}
function choose(t,on){
  const id=+t.dataset.id;if(on)picking.chosen.add(id);else picking.chosen.delete(id);t.setAttribute('aria-pressed',String(on));
  const n=picking.chosen.size;$('#wlAdd').disabled=!n;$('#wlAdd').textContent=n?tx('{n} artboard ekle',{n}):tx('Bir sahne seç');
}
$('#wlGrid').addEventListener('click',e=>{const t=e.target.closest('.wl-res');if(!t||t.disabled||!picking)return;choose(t,!picking.chosen.has(+t.dataset.id));});

// keeps the picked boards side by side, the first one active and fitted
function confirm(){
  if(!picking||!picking.chosen.size)return;
  const keep=picking.ids.filter(id=>picking.chosen.has(id));
  picking.ids.filter(id=>!picking.chosen.has(id)).forEach(removeBoard);
  let x=0;keep.forEach(id=>{const b=boardById(id);moveBoard(id,x,0);x+=boardSize(b)[0]+160;});
  // a promo video: the templates bring their own motion; on a composition long screenshots scroll to their end
  // over the artboard's time. Then Canlandır opens on it
  const video=goal==='video';
  if(video)keep.filter(id=>!picking.tpl.has(id)).forEach(id=>{activate(id);state.devices.forEach(d=>{if(d.img&&!d.video)applyPreset('scroll',d);});});
  activate(keep[0]);
  picking=null;holdHistory(false);
  const m=modal;if(m)endModal();
  sync();setUi({kind:'board'});
  if(video)setMode('animate');
  coach();
  requestAnimationFrame(()=>fitAll());
  toast(tx('{n} artboard eklendi',{n:keep.length}));
  if(m&&m.done)m.done();
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
  try{new URL(url);}catch(e){toast(tx('Bu bir adres gibi görünmüyor.'));$('#wlUrl').focus();return;}
  start.classList.add('wl-busy');$('#wlProg').hidden=false;$('#wlGo').textContent=tx('Yakalanıyor…');
  $('#wlPnote').textContent=tx('Sayfa her cihazın kendi genişliğinde açılıyor…');$('#wlCancel').hidden=false;
  const rows=$('#wlProws');rows.innerHTML='';
  const jobs=SITE.map(s=>{
    const v=viewportOf(s.type),row=document.createElement('div');row.className='wl-prow run';
    row.innerHTML='<span class="wl-dot" aria-hidden="true"></span><span></span><span class="v"></span>';
    row.children[1].textContent=tx(s.n);row.children[2].textContent=v.width+' px';rows.appendChild(row);
    const p=captureShots(url,[Object.assign({id:s.type},v)]).then(async r=>{
      const img=await shotImage(r.shots[s.type]);if(me===run){row.className='wl-prow ok';}return {type:s.type,img,finalUrl:r.finalUrl||url};
    }).catch(e=>{if(me===run){row.className='wl-prow fail';row.children[2].textContent=tx('alınamadı');}throw e;});
    return p;});
  const res=await Promise.allSettled(jobs);
  if(me!==run)return;  // cancelled meanwhile
  const shots={};res.forEach(r=>{if(r.status==='fulfilled')shots[r.value.type]=r.value;});
  // no phone shot: the rows stay with the reason under them, the address can be fixed and sent again
  if(!shots.phone){const e=res.find(r=>r.status==='rejected'),why=e&&e.reason;
    endCapture(true);$('#wlPnote').textContent=why&&why.user?why.message:tx('Sayfa yakalanamadı')+(why?': '+(why.message||why):'.');$('#wlUrl').focus();return;}
  endCapture();
  // a scene is offered when all its devices have their shot (a monitor shows the laptop's)
  const shotOf=type=>shots[type]||(type==='monitor'?shots.laptop:null);
  const name=siteName(shots.phone.finalUrl);
  const list=await suggest(type=>!!shotOf(type),forGoal(SITE_SCENES.map(comp).filter(c=>c.items.every(it=>shots[it.type]))),
    async()=>{state.devices.forEach(d=>{const s=shotOf(d.type);if(s)putShot(d,s.img,s.finalUrl,raw);});},variantFor(shots.phone.img));
  await buildScenes(list,name);
}
function endCapture(keep){start.classList.remove('wl-busy');$('#wlProg').hidden=!keep;$('#wlCancel').hidden=true;$('#wlGo').textContent=tx('Mockup oluştur');}
$('#wlCancel').addEventListener('click',()=>{run++;endCapture();$('#wlUrl').focus();});

// what the card was given: a site address or files (in the window over the home page: before() first)
async function begin(input){
  if(modal&&!(await ready(modal)))return;
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

$('#wlBlank').addEventListener('click',async()=>{
  // in the window over the home page: a new project first, then the editor on its first artboard
  if(modal){const m=modal;if(!(await ready(m)))return;endModal();if(m.done)m.done();}
  $('#emptyAddBoard').click();
});
// a store set has its own form (store.js); the set's artboards close the card
$('#wlStore').addEventListener('click',()=>{
  // in the window over the home page the set is made the same way: before() first, then the window and home close
  if(!modal){openStoreDialog();return;}
  // the form takes the window's place (it would open behind it otherwise); closing the form leaves the home page as it was
  const m=modal;endModal();openStoreDialog(undefined,{before:m.before,after:()=>{if(m.done)m.done();}});
});
$('#wlOpen').addEventListener('click',()=>{if(modal){const m=modal;endModal();if(m.done)m.done();}$('#openProjectBtn').click();});
/* The card for a goal (the home page's goal buttons: ui/home.js): that goal pressed, the address field (or the drop
   area) focused. With hooks ({before, done, closed}) it opens as a window over the home page and nothing in the
   document changes until the user starts; without, it is the editor's own card (an empty document). */
function openWelcome(g,hooks){
  if(hooks){
    modal=hooks;modalBox.appendChild(card);modalBox.hidden=false;modalBox.inert=false;card.classList.add('in-modal');card.hidden=false;shown=true;
  }
  const b=$('#welcome [data-goal="'+g+'"]');if(b)b.click();
  showStart();
}
// the window closes: the card goes back to the stage (scenes being picked are dropped, as with Geri)
function endModal(){
  modal=null;card.classList.remove('in-modal');modalBox.hidden=true;
  home0.parent.insertBefore(card,home0.next);shown=null;sync();
}
function closeModal(){
  if(!modal)return false;
  run++;endCapture();
  if(picking){picking=null;clearAll();holdHistory(false);}
  const m=modal;endModal();if(m.closed)m.closed();return true;
}
// a click on the overlay, anywhere outside the card (the card's own box is as wide as the window)
modalBox.addEventListener('click',e=>{if(!e.target.closest('.wl-card,.wl-pick'))closeModal();});
// Esc closes the window (on the document: the focus may still be on the home page's button that opened it)
document.addEventListener('keydown',e=>{if(modal&&e.key==='Escape'&&!picking&&!document.querySelector('.scrim:not([hidden])')){e.preventDefault();e.stopImmediatePropagation();closeModal();}},true);

export {begin as startWelcome,closeModal as closeWelcomeModal,openWelcome};
