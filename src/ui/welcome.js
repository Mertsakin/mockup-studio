import {setScreenTexture} from '../devices/screen.js';
import {isVideoFile,loadVideo,videoSize} from '../devices/video.js';
import {COMPS} from '../state/constants.js';
import {state} from '../state/state.js';
import {activate,addBoard,boardById,boardSize,clearAll,hasBoard,moveBoard,onBoards,removeBoard,storeActive} from './boards.js';
import {captureAvailable} from './capture.js';
import {applyComp} from './devices-panel.js';
import {holdHistory} from './history.js';
import {loadShotVideo,routeShots} from './image-input.js';
import {onSyncUI} from './sync.js';
import {toast} from './toast.js';
import {setUi} from './ui-state.js';
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
  if(on&&!picking)showStart();
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
  goal=b.dataset.goal;$$('#welcome [data-goal]').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));
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

async function fromFiles(files){
  if(picking)return;
  let screens;
  try{screens=(await Promise.all(files.map(f=>readScreen(f).catch(()=>null)))).filter(Boolean);}catch(e){screens=[];}
  if(!screens.length){toast('Bu dosyalar açılamadı. PNG, JPG, WebP ya da MP4 / WebM dene.');return;}
  const tall=screens.filter(s=>!s.wide),wide=screens.filter(s=>s.wide);
  await buildScenes(recipes(tall.length>0,wide.length>0),()=>dress(tall,wide),
    screens.length===1?screens[0].name:screens.length+' ekran');
}

// builds one board per recipe (dress: puts the screens on), renders their thumbnails and opens the picker
async function buildScenes(list,dressBoard,what){
  holdHistory(true);
  picking={ids:[],chosen:new Set()};
  start.hidden=true;pick.hidden=false;
  $('#wlPickTitle').textContent='Sahneler hazırlanıyor';$('#wlPickSub').textContent=what;
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
      applyComp(list[i]);await dressBoard();await frames();
      storeActive();  // the board's thumbnail, rendered off-view
      const t=tiles[i],[w,h]=boardSize(b);t.dataset.id=b.id;t.style.setProperty('--ar',w+'/'+h);
      const im=t.querySelector('.im');im.classList.remove('wait');if(b.thumb)im.style.backgroundImage='url("'+b.thumb+'")';
      t.disabled=false;if(i<2)choose(t,true);
      $('#wlStatus').textContent=i+1<list.length?'Sahneler hazırlanıyor… '+(i+1)+' / '+list.length:'';
    }
  }catch(e){toast('Sahneler kurulamadı: '+(e.message||e));back();return;}
  $('#wlPickTitle').textContent=list.length+' sahne';
  $('#wlPickSub').textContent=what+' · istediğin kadarını seç, her biri ayrı artboard olur';
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
  activate(keep[0]);
  picking=null;holdHistory(false);sync();setUi({kind:'board'});
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

// what the card was given: a site address (next step) or files
function begin(input){
  if(input.files)fromFiles(input.files);
  else toast('Hazırlanıyor: '+input.url+' · '+goal);
}
// files dropped or pasted anywhere while the card shows come here
routeShots(files=>{
  if(!shown)return false;
  if(picking)return true;
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
$('#wlBlank').addEventListener('click',()=>$('#emptyAddBoard').click());
$('#wlOpen').addEventListener('click',()=>$('#openProjectBtn').click());

export {begin as startWelcome};
