import {RT,setHolder} from '../devices/rt.js';
import {rebuild} from '../devices/runtime.js';
import {detectScreen,setScreenTexture} from '../devices/screen.js';
import {MAX_MB,duration,fmtDur,isVideoFile,loadVideo,showFrame,shownTime,videoSize} from '../devices/video.js';
import {numField} from './numfield.js';
import {applyTransform,autoRefit} from '../render/transform.js';
import {sel,state} from '../state/state.js';
import {bgCss} from './layout.js';
import {fPct,makeSlider} from './sliders.js';
import {onSyncUI,syncAll,syncUI} from './sync.js';
import {toast} from './toast.js';
import {$} from '../util.js';

/* ---------- image & frame input ---------- */
const drop=$('#drop'),fileEl=$('#file'),frameDrop=$('#frameDrop'),frameFile=$('#frameFile'),bgDrop=$('#bgDrop'),bgFile=$('#bgFile');
function readImage(file,cb){
  if(!file||!/^image\//.test(file.type)){toast('Bu dosya bir görsel ya da video değil. PNG, JPG, WebP ya da MP4/WebM seç.');return;}
  const img=new Image();img.onload=()=>cb(img);img.onerror=()=>toast('Görsel açılamadı. Başka bir dosya dene.');img.src=URL.createObjectURL(file);
}
// a wide source turns a rotatable device landscape; the screen is redrawn either way
function placeShot(d,wide){
  const o=RT.get(d.id);
  if(o&&o.rotatable&&wide!==d.landscape){d.landscape=wide;setHolder(o,d);setScreenTexture(d);autoRefit();applyTransform();}
  else setScreenTexture(d);
  syncUI();
}
function loadShot(file){
  const d=sel();
  if(!d){toast('Ekran görüntüsü için önce bir cihaz ekle.');return;}
  if(isVideoFile(file)){loadShotVideo(d,file);return;}
  readImage(file,img=>{
    d.img=img;d.imgName=file.name||'Yapıştırılan görsel';d.video=null;d.videoName='';d.scroll=0;
    placeShot(d,img.naturalWidth>img.naturalHeight);
  });
}
/* Video on the screen (devices/video.js): replaces the screenshot (one or the other); the long-screenshot scroll goes
   with it. The frame shown is the design (poster) frame in Tasarla, the playhead's in Canlandır. */
async function loadShotVideo(d,file){
  if(file.size>MAX_MB*1e6)toast('Video '+Math.round(file.size/1e6)+' MB: büyük dosyalar otomatik kaydı ve proje dosyasını şişirir, oynatma takılabilir. Mümkünse '+MAX_MB+' MB altında tut.');
  let v;try{v=await loadVideo(URL.createObjectURL(file));}catch(e){toast('Video açılamadı. H.264 MP4 ya da WebM dene.');return;}
  if(!state.devices.includes(d))return;  // removed meanwhile
  d.video=v;d.videoName=file.name||'Video';d.videoT0=0;d.videoLoop=true;d.img=null;d.imgName='';d.scroll=0;
  if(d.tracks)delete d.tracks.scroll;
  const [vw,vh]=videoSize(v);placeShot(d,vw>vh);
  showFrame(d,shownTime(d));
}
// "Kaldır": the screen goes back to the placeholder
$('#shotRemove').addEventListener('click',e=>{
  e.preventDefault();e.stopPropagation();const d=sel();if(!d)return;
  if(d.video)d.video.pause();d.video=null;d.videoName='';d.img=null;d.imgName='';d.scroll=0;if(d.tracks)delete d.tracks.scroll;
  setScreenTexture(d);syncUI();
});
// video settings: trim start (s) and loop
const videoRow=$('#videoRow'),videoLoopEl=$('#videoLoop');
const t0Field=numField({id:'nf-vt0',label:'Başlangıç',title:'Videonun bu saniyesi artboard\u2019un 0 anıdır (kırpma başlangıcı)',step:.1,min:0,digits:1,suffix:' sn',
  get:()=>{const d=sel();return d&&d.video?d.videoT0||0:null;},
  set:v=>{const d=sel();if(!d||!d.video||typeof v!=='number')return;d.videoT0=Math.max(0,Math.min(Math.max(0,duration(d.video)-.1),v));showFrame(d,shownTime(d));syncUI();}});
videoRow.prepend(t0Field.el);
videoLoopEl.addEventListener('change',()=>{const d=sel();if(!d||!d.video)return;d.videoLoop=videoLoopEl.checked;showFrame(d,shownTime(d));});
// background image: placed by layout.js (cover / contain, scale, offset); kept when switching to another style and back
const BG_FIT={bgFit:'cover',bgScale:1,bgX:0,bgY:0};
function loadBg(file){
  readImage(file,img=>{Object.assign(state,BG_FIT,{bgImg:img,bgImgName:file.name||'Arka plan',bg:'image'});bgCss();syncAll();});
}
$('#bgRemove').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();Object.assign(state,{bgImg:null,bgImgName:'',bg:'transparent'});bgCss();syncAll();});
$('#bgReset').addEventListener('click',()=>{Object.assign(state,BG_FIT);bgCss();syncAll();});
[
  {id:'bg-scale',k:'bgScale',l:'Ölçek',min:.25,max:4,step:.01,reset:1,f:fPct,after:bgCss},
  {id:'bg-x',k:'bgX',l:'Yatay',min:-1,max:1,step:.001,reset:0,f:fPct,after:bgCss},
  {id:'bg-y',k:'bgY',l:'Dikey',min:-1,max:1,step:.001,reset:0,f:fPct,after:bgCss}
].forEach(d=>makeSlider($('#bgSliders'),d,()=>state));
function loadFrame(file){
  const d=sel();if(!d)return;
  readImage(file,img=>{
    const r=detectScreen(img);
    if(!r){toast('Ekran alanı bulunamadı. Ortası şeffaf ve kenarları kapalı bir çerçeve PNG\u2019si kullan.');return;}
    d.frameImg=img;d.frameName=file.name||'Çerçeve';d.screenRect=r;rebuild(d,state.devices.length<2);syncUI();
  });
}
fileEl.addEventListener('change',()=>{loadShot(fileEl.files[0]);fileEl.value='';});
frameFile.addEventListener('change',()=>{loadFrame(frameFile.files[0]);frameFile.value='';});
bgFile.addEventListener('change',()=>{if(bgFile.files[0])loadBg(bgFile.files[0]);bgFile.value='';});
drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fileEl.click();}});
frameDrop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();frameFile.click();}});
bgDrop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();bgFile.click();}});
let dragDepth=0;
window.addEventListener('dragenter',e=>{if(!dropTarget(e))return;e.preventDefault();dragDepth++;});
window.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth){drop.classList.remove('over');frameDrop.classList.remove('over');bgDrop.classList.remove('over');}});
// where a dragged file would go; the asset library (assets.js) handles drops on its own group, other drags are not files
const dropTarget=e=>{if(!e.dataTransfer||!e.dataTransfer.types.includes('Files'))return null;const t=e.target&&e.target.closest?e.target:null;
  return !t?'shot':t.closest('#frameDrop')?'frame':t.closest('#bgDrop')?'bg':t.closest('#assetsGroup')?'asset':'shot';};
window.addEventListener('dragover',e=>{const t=dropTarget(e);if(!t)return;e.preventDefault();frameDrop.classList.toggle('over',t==='frame');bgDrop.classList.toggle('over',t==='bg');drop.classList.toggle('over',t==='shot');});
window.addEventListener('drop',e=>{
  e.preventDefault();dragDepth=0;[drop,frameDrop,bgDrop].forEach(el=>el.classList.remove('over'));
  const f=e.dataTransfer&&e.dataTransfer.files[0];if(!f)return;
  const t=dropTarget(e);if(t==='frame')loadFrame(f);else if(t==='bg')loadBg(f);else if(t==='shot')loadShot(f);
});
window.addEventListener('paste',e=>{
  if(e.target&&(e.target.tagName==='INPUT'&&e.target.type==='text'))return;
  const items=(e.clipboardData&&e.clipboardData.items)||[];
  for(const it of items){if(it.type&&it.type.startsWith('image/')){loadShot(it.getAsFile());e.preventDefault();return;}}
});
onSyncUI(d=>{
  const b=state.bgImg;bgDrop.classList.toggle('has',!!b);
  $('#bgMain').textContent=b?state.bgImgName||'Arka plan':'Arka plan görseli seç';
  $('#bgSub').textContent=b?(b.naturalWidth||b.width)+' × '+(b.naturalHeight||b.height)+' px. Artboard\u2019u kaplar. Değiştirmek için tıkla ya da sürükle.':'PNG, JPG veya WebP. Artboard\u2019u kaplayacak şekilde yerleşir.';
  if(!d)return;
  if(d.video){const [vw,vh]=videoSize(d.video);$('#dropMain').textContent=d.videoName||'Video';$('#dropSub').textContent=vw+' × '+vh+' px · '+fmtDur(duration(d.video))+'. Değiştirmek için tıkla ya da yenisini sürükle.';drop.classList.add('has');}
  else if(d.img){$('#dropMain').textContent=d.imgName||'Yapıştırılan görsel';$('#dropSub').textContent=d.img.naturalWidth+' × '+d.img.naturalHeight+' px. Değiştirmek için tıkla ya da yenisini sürükle.';drop.classList.add('has');}
  else{$('#dropMain').textContent='Görsel seç ya da buraya sürükle';$('#dropSub').textContent='PNG, JPG, WebP ya da MP4 / WebM video. Panodan yapıştırmak için Ctrl/⌘ + V.';drop.classList.remove('has');}
  $('#shotRemove').hidden=!(d.video||d.img);
  videoRow.hidden=!d.video;if(d.video){t0Field.sync();videoLoopEl.checked=d.videoLoop!==false;}
  if(d.frameImg){$('#frameMain').textContent=d.frameName||'Çerçeve';$('#frameSub').textContent='Ekran alanı bulundu. Değiştirmek için tıkla.';frameDrop.classList.add('has');}
  else{$('#frameMain').textContent='Çerçeve PNG\u2019si seç';$('#frameSub').textContent='Ekran bölümü şeffaf bir cihaz çerçevesi. Ekran görüntün o alana yerleşir.';frameDrop.classList.remove('has');}
});

export {loadShot};
