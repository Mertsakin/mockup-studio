import {RT,setHolder} from '../devices/rt.js';
import {rebuild} from '../devices/runtime.js';
import {detectScreen,setScreenTexture} from '../devices/screen.js';
import {applyTransform,autoRefit} from '../render/transform.js';
import {sel,state} from '../state/state.js';
import {bgCss} from './layout.js';
import {onSyncUI,syncUI} from './sync.js';
import {toast} from './toast.js';
import {$} from '../util.js';

/* ---------- image & frame input ---------- */
const drop=$('#drop'),fileEl=$('#file'),frameDrop=$('#frameDrop'),frameFile=$('#frameFile'),bgDrop=$('#bgDrop'),bgFile=$('#bgFile');
function readImage(file,cb){
  if(!file||!/^image\//.test(file.type)){toast('Bu dosya bir görsel değil. PNG, JPG ya da WebP seç.');return;}
  const img=new Image();img.onload=()=>cb(img);img.onerror=()=>toast('Görsel açılamadı. Başka bir dosya dene.');img.src=URL.createObjectURL(file);
}
function loadShot(file){
  const d=sel();
  readImage(file,img=>{
    d.img=img;d.imgName=file.name||'Yapıştırılan görsel';d.scroll=0;
    const o=RT.get(d.id),wide=img.naturalWidth>img.naturalHeight;
    if(o&&o.rotatable&&wide!==d.landscape){d.landscape=wide;setHolder(o,d);setScreenTexture(d);autoRefit();applyTransform();}
    else setScreenTexture(d);
    syncUI();
  });
}
// background image: covers the artboard (layout.js); kept when switching to another style and back
function loadBg(file){
  readImage(file,img=>{state.bgImg=img;state.bgImgName=file.name||'Arka plan';state.bg='image';bgCss();syncUI();});
}
function loadFrame(file){
  const d=sel();
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
window.addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;drop.classList.add('over');});
window.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth){drop.classList.remove('over');frameDrop.classList.remove('over');bgDrop.classList.remove('over');}});
const dropTarget=e=>e.target&&e.target.closest?e.target.closest('#frameDrop')?'frame':e.target.closest('#bgDrop')?'bg':'shot':'shot';
window.addEventListener('dragover',e=>{e.preventDefault();const t=dropTarget(e);frameDrop.classList.toggle('over',t==='frame');bgDrop.classList.toggle('over',t==='bg');drop.classList.toggle('over',t==='shot');});
window.addEventListener('drop',e=>{
  e.preventDefault();dragDepth=0;[drop,frameDrop,bgDrop].forEach(el=>el.classList.remove('over'));
  const f=e.dataTransfer&&e.dataTransfer.files[0];if(!f)return;
  const t=dropTarget(e);if(t==='frame')loadFrame(f);else if(t==='bg')loadBg(f);else loadShot(f);
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
  if(d.img){$('#dropMain').textContent=d.imgName||'Yapıştırılan görsel';$('#dropSub').textContent=d.img.naturalWidth+' × '+d.img.naturalHeight+' px. Değiştirmek için tıkla ya da yenisini sürükle.';drop.classList.add('has');}
  else{$('#dropMain').textContent='Görsel seç ya da buraya sürükle';$('#dropSub').textContent='PNG, JPG veya WebP. Panodan yapıştırmak için Ctrl/⌘ + V.';drop.classList.remove('has');}
  if(d.frameImg){$('#frameMain').textContent=d.frameName||'Çerçeve';$('#frameSub').textContent='Ekran alanı bulundu. Değiştirmek için tıkla.';frameDrop.classList.add('has');}
  else{$('#frameMain').textContent='Çerçeve PNG\u2019si seç';$('#frameSub').textContent='Ekran bölümü şeffaf bir cihaz çerçevesi. Ekran görüntün o alana yerleşir.';frameDrop.classList.remove('has');}
});
