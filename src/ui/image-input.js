import {RT,setHolder} from '../devices/rt.js';
import {rebuild} from '../devices/runtime.js';
import {detectScreen,setScreenTexture} from '../devices/screen.js';
import {applyTransform,autoRefit} from '../render/transform.js';
import {sel,state} from '../state/state.js';
import {onSyncUI,syncUI} from './sync.js';
import {toast} from './toast.js';
import {$} from '../util.js';

/* ---------- image & frame input ---------- */
const drop=$('#drop'),fileEl=$('#file'),frameDrop=$('#frameDrop'),frameFile=$('#frameFile');
function readImage(file,cb){
  if(!file||!/^image\//.test(file.type)){toast('Bu dosya bir görsel değil. PNG, JPG ya da WebP seç.');return;}
  const img=new Image();img.onload=()=>cb(img);img.onerror=()=>toast('Görsel açılamadı. Başka bir dosya dene.');img.src=URL.createObjectURL(file);
}
function loadShot(file){
  const d=sel();
  readImage(file,img=>{
    d.img=img;d.imgName=file.name||'Yapıştırılan görsel';
    const o=RT.get(d.id),wide=img.naturalWidth>img.naturalHeight;
    if(o&&o.rotatable&&wide!==d.landscape){d.landscape=wide;setHolder(o,d);setScreenTexture(d);autoRefit();applyTransform();}
    else setScreenTexture(d);
    syncUI();
  });
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
drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fileEl.click();}});
frameDrop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();frameFile.click();}});
let dragDepth=0;
window.addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;drop.classList.add('over');});
window.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth){drop.classList.remove('over');frameDrop.classList.remove('over');}});
window.addEventListener('dragover',e=>{e.preventDefault();const onFrame=!!(e.target&&e.target.closest&&e.target.closest('#frameDrop'));frameDrop.classList.toggle('over',onFrame);drop.classList.toggle('over',!onFrame);});
window.addEventListener('drop',e=>{
  e.preventDefault();dragDepth=0;drop.classList.remove('over');frameDrop.classList.remove('over');
  const f=e.dataTransfer&&e.dataTransfer.files[0];if(!f)return;
  if(e.target&&e.target.closest&&e.target.closest('#frameDrop'))loadFrame(f);else loadShot(f);
});
window.addEventListener('paste',e=>{
  if(e.target&&(e.target.tagName==='INPUT'&&e.target.type==='text'))return;
  const items=(e.clipboardData&&e.clipboardData.items)||[];
  for(const it of items){if(it.type&&it.type.startsWith('image/')){loadShot(it.getAsFile());e.preventDefault();return;}}
});
onSyncUI(d=>{
  if(d.img){$('#dropMain').textContent=d.imgName||'Yapıştırılan görsel';$('#dropSub').textContent=d.img.naturalWidth+' × '+d.img.naturalHeight+' px. Değiştirmek için tıkla ya da yenisini sürükle.';drop.classList.add('has');}
  else{$('#dropMain').textContent='Görsel seç ya da buraya sürükle';$('#dropSub').textContent='PNG, JPG veya WebP. Panodan yapıştırmak için Ctrl/⌘ + V.';drop.classList.remove('has');}
  if(d.frameImg){$('#frameMain').textContent=d.frameName||'Çerçeve';$('#frameSub').textContent='Ekran alanı bulundu. Değiştirmek için tıkla.';frameDrop.classList.add('has');}
  else{$('#frameMain').textContent='Çerçeve PNG\u2019si seç';$('#frameSub').textContent='Ekran bölümü şeffaf bir cihaz çerçevesi. Ekran görüntün o alana yerleşir.';frameDrop.classList.remove('has');}
});
