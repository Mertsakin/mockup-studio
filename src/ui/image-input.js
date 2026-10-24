import {isModelFile} from '../devices/model.js';
import {RT,setHolder} from '../devices/rt.js';
import {rebuild} from '../devices/runtime.js';
import {detectScreen,setScreenTexture} from '../devices/screen.js';
import {MAX_MB,duration,fmtDur,isVideoFile,loadVideo,posterTime,showFrame,shownTime,videoSize,videoTime} from '../devices/video.js';
import {MAX_DUR} from '../state/anim.js';
import {A,setDuration} from './animate.js';
import {importModels} from './assets.js';
import {numField} from './numfield.js';
import {applyTransform,autoRefit} from '../render/transform.js';
import {sel,state} from '../state/state.js';
import {bgCss} from './layout.js';
import {fPct,makeSlider} from './sliders.js';
import {onSyncUI,syncAll,syncUI} from './sync.js';
import {toast} from './toast.js';
import {fmt,t as tx} from '../lang.js';
import {$} from '../util.js';

/* ---------- image & frame input ---------- */
const drop=$('#drop'),fileEl=$('#file'),frameDrop=$('#frameDrop'),frameFile=$('#frameFile'),bgDrop=$('#bgDrop'),bgFile=$('#bgFile');
function readImage(file,cb){
  if(!file||!/^image\//.test(file.type)){toast(tx('Bu dosya bir görsel ya da video değil. PNG, JPG, WebP, MP4/WebM ya da 3B model için GLB seç.'));return;}
  const img=new Image();img.onload=()=>cb(img);img.onerror=()=>toast(tx('Görsel açılamadı. Başka bir dosya dene.'));img.src=URL.createObjectURL(file);
}
// a wide source turns a rotatable device landscape; the screen is redrawn either way
function placeShot(d,wide){
  const o=RT.get(d.id);
  if(o&&o.rotatable&&wide!==d.landscape){d.landscape=wide;setHolder(o,d);setScreenTexture(d);autoRefit();applyTransform();}
  else setScreenTexture(d);
  syncUI();
}
function loadShot(file){
  if(isModelFile(file)){importModels([file]);return;}  // a GLB dropped anywhere: a 3D model in the library and the scene
  const d=sel();
  if(!d){toast(tx('Ekran görüntüsü için önce bir cihaz ekle.'));return;}
  if(isVideoFile(file)){loadShotVideo(d,file);return;}
  readImage(file,img=>{
    d.img=img;d.imgName=file.name||tx('Yapıştırılan görsel');d.video=null;d.videoName='';d.scroll=0;
    placeShot(d,img.naturalWidth>img.naturalHeight);
  });
}
/* Video on the screen (devices/video.js): replaces the screenshot (one or the other); the long-screenshot scroll goes
   with it. The frame shown is the design (poster) frame in Tasarla, the playhead's in Canlandır. */
async function loadShotVideo(d,file){
  if(file.size>MAX_MB*1e6)toast(tx('Video {n} MB: büyük dosyalar otomatik kaydı ve proje dosyasını şişirir, oynatma takılabilir. Mümkünse {max} MB altında tut.',{n:Math.round(file.size/1e6),max:MAX_MB}));
  let v;try{v=await loadVideo(URL.createObjectURL(file));}catch(e){toast(tx('Video açılamadı. H.264 MP4 ya da WebM dene.'));return;}
  if(!state.devices.includes(d))return;  // removed meanwhile
  d.video=v;d.videoName=file.name||tx('Video');d.videoT0=0;d.videoLoop=true;d.videoPoster=null;d.img=null;d.imgName='';d.scroll=0;
  if(d.tracks)delete d.tracks.scroll;
  const [vw,vh]=videoSize(v);placeShot(d,vw>vh);
  showFrame(d,shownTime(d));
  // the artboard's duration follows the video on loading (a default: changing it later is the user's)
  const dur=duration(v),fps=state.anim.fps||30;
  if(dur){const want=Math.max(1,Math.min(MAX_DUR,Math.round(dur*fps)/fps));setDuration(want);
    if(dur>MAX_DUR)toast(tx('Video {d}: Canlandır süresi en fazla {max} sn, gerisi Başlangıç ile seçilir.',{d:fmtDur(dur),max:MAX_DUR}));
    // the duration never cuts keys off: say why it stayed longer than the video
    else if(state.anim.dur>want+.5/fps)toast(tx('Canlandır süresi {a} kaldı: {b} sonrasında anahtar kare ya da metin efekti var. Onları silersen süre videoya iner.',{a:fmtDur(state.anim.dur),b:fmtDur(want)}));}
}
// "Kaldır": the screen goes back to the placeholder
$('#shotRemove').addEventListener('click',e=>{
  e.preventDefault();e.stopPropagation();const d=sel();if(!d)return;
  if(d.video)d.video.pause();d.video=null;d.videoName='';d.img=null;d.imgName='';d.scroll=0;if(d.tracks)delete d.tracks.scroll;
  setScreenTexture(d);syncUI();
});
// video settings: trim start (s) and loop
const videoRow=$('#videoRow'),videoLoopEl=$('#videoLoop');
const t0Field=numField({id:'nf-vt0',label:tx('Başlangıç'),title:tx('Videonun bu saniyesi artboard\u2019un 0 anıdır (kırpma başlangıcı)'),step:.1,min:0,digits:1,suffix:' '+tx('sn'),
  get:()=>{const d=sel();return d&&d.video?d.videoT0||0:null;},
  set:v=>{const d=sel();if(!d||!d.video||typeof v!=='number')return;d.videoT0=Math.max(0,Math.min(Math.max(0,duration(d.video)-.1),v));showFrame(d,shownTime(d));syncUI();}});
videoRow.prepend(t0Field.el);
videoLoopEl.addEventListener('change',()=>{const d=sel();if(!d||!d.video)return;d.videoLoop=videoLoopEl.checked;showFrame(d,shownTime(d));syncUI();});
/* Poster second (Tasarla only): the frame the still image, the thumbnails and the Tasarla screen show, as seconds of
   the video, independent of the Canlandır mapping (d.videoPoster, null = the design frame's mapping). "İmleçteki
   kare" takes the playhead's video time (the slot moves next to the transform fields in Canlandır, timeline.js). */
const fmtSec=v=>fmt(v,2)+' '+tx('sn');
const posterField=numField({id:'nf-vposter',label:tx('Gösterilen an'),title:tx('Tasarla\u2019da, durağan görselde ve küçük resimde videonun hangi saniyesi görünsün'),step:.1,min:0,digits:2,fmt:fmtSec,
  get:()=>{const d=sel();return d&&d.video?posterTime(d):null;},
  set:v=>{const d=sel();if(!d||!d.video||typeof v!=='number')return;d.videoPoster=Math.max(0,Math.min(Math.max(0,duration(d.video)-1/60),v));showFrame(d,shownTime(d));syncUI();}});
posterField.el.classList.add('design-only');
const posterSlot=$('#posterSlot');posterSlot.prepend(posterField.el);
$('#posterFromHead').addEventListener('click',()=>{const d=sel();if(!d||!d.video)return;d.videoPoster=+videoTime(d,A.t).toFixed(3);showFrame(d,shownTime(d));syncUI();toast(tx('Poster: {t}',{t:fmtSec(d.videoPoster)}));});
// background image: placed by layout.js (cover / contain, scale, offset); kept when switching to another style and back
const BG_FIT={bgFit:'cover',bgScale:1,bgX:0,bgY:0};
function loadBg(file){
  readImage(file,img=>{Object.assign(state,BG_FIT,{bgImg:img,bgImgName:file.name||tx('Arka plan'),bg:'image'});bgCss();syncAll();});
}
$('#bgRemove').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();Object.assign(state,{bgImg:null,bgImgName:'',bg:'transparent'});bgCss();syncAll();});
$('#bgReset').addEventListener('click',()=>{Object.assign(state,BG_FIT);bgCss();syncAll();});
[
  {id:'bg-scale',k:'bgScale',l:tx('Ölçek'),min:.25,max:4,step:.01,reset:1,f:fPct,after:bgCss},
  {id:'bg-x',k:'bgX',l:tx('Yatay'),min:-1,max:1,step:.001,reset:0,f:fPct,after:bgCss},
  {id:'bg-y',k:'bgY',l:tx('Dikey'),min:-1,max:1,step:.001,reset:0,f:fPct,after:bgCss}
].forEach(d=>makeSlider($('#bgSliders'),d,()=>state));
function loadFrame(file){
  const d=sel();if(!d)return;
  readImage(file,img=>{
    const r=detectScreen(img);
    if(!r){toast(tx('Ekran alanı bulunamadı. Ortası şeffaf ve kenarları kapalı bir çerçeve PNG\u2019si kullan.'));return;}
    d.frameImg=img;d.frameName=file.name||tx('Çerçeve');d.screenRect=r;rebuild(d,state.devices.length<2);syncUI();
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
// another part of the UI can take dropped / pasted files first (the welcome card while it shows): true = taken
let router=null;
const routeShots=fn=>{router=fn;};
window.addEventListener('drop',e=>{
  e.preventDefault();dragDepth=0;[drop,frameDrop,bgDrop].forEach(el=>el.classList.remove('over'));
  const f=e.dataTransfer&&e.dataTransfer.files[0];if(!f)return;
  if(router&&router([...e.dataTransfer.files]))return;
  const t=dropTarget(e);if(t==='frame')loadFrame(f);else if(t==='bg')loadBg(f);else if(t==='shot')loadShot(f);
});
window.addEventListener('paste',e=>{
  if(e.target&&(e.target.tagName==='INPUT'&&e.target.type==='text'))return;
  const items=(e.clipboardData&&e.clipboardData.items)||[];
  for(const it of items){if(it.type&&it.type.startsWith('image/')){const f=it.getAsFile();e.preventDefault();if(router&&router([f]))return;loadShot(f);return;}}
});
onSyncUI(d=>{
  const b=state.bgImg;bgDrop.classList.toggle('has',!!b);
  $('#bgMain').textContent=b?state.bgImgName||tx('Arka plan'):tx('Arka plan görseli seç');
  $('#bgSub').textContent=b?(b.naturalWidth||b.width)+' × '+(b.naturalHeight||b.height)+' px. '+tx('Artboard\u2019u kaplar. Değiştirmek için tıkla ya da sürükle.'):tx('PNG, JPG veya WebP. Artboard\u2019u kaplayacak şekilde yerleşir.');
  if(!d)return;
  if(d.video){const [vw,vh]=videoSize(d.video);$('#dropMain').textContent=d.videoName||tx('Video');$('#dropSub').textContent=vw+' × '+vh+' px · '+fmtDur(duration(d.video))+'. '+tx('Değiştirmek için tıkla ya da yenisini sürükle.');drop.classList.add('has');}
  else if(d.img){$('#dropMain').textContent=d.imgName||tx('Yapıştırılan görsel');$('#dropSub').textContent=d.img.naturalWidth+' × '+d.img.naturalHeight+' px. '+tx('Değiştirmek için tıkla ya da yenisini sürükle.');drop.classList.add('has');}
  else{$('#dropMain').textContent=tx('Görsel seç ya da buraya sürükle');$('#dropSub').textContent=tx('PNG, JPG, WebP ya da MP4 / WebM video. Panodan yapıştırmak için Ctrl/⌘ + V.');drop.classList.remove('has');}
  $('#shotRemove').hidden=!(d.video||d.img);
  videoRow.hidden=!d.video;posterSlot.hidden=!d.video;
  if(d.video){t0Field.sync();posterField.sync();videoLoopEl.checked=d.videoLoop!==false;
    // loop off and the video runs out before the artboard does: it holds its last frame
    const rest=duration(d.video)-(d.videoT0||0);$('#videoHint').hidden=!(d.videoLoop===false&&rest>0&&rest<state.anim.dur-1e-3);}
  if(d.frameImg){$('#frameMain').textContent=d.frameName||tx('Çerçeve');$('#frameSub').textContent=tx('Ekran alanı bulundu. Değiştirmek için tıkla.');frameDrop.classList.add('has');}
  else{$('#frameMain').textContent=tx('Çerçeve PNG\u2019si seç');$('#frameSub').textContent=tx('Ekran bölümü şeffaf bir cihaz çerçevesi. Ekran görüntün o alana yerleşir.');frameDrop.classList.remove('has');}
});

export {loadShot,loadShotVideo,routeShots};
