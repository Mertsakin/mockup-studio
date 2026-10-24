import {MODEL_MAX_MB,fmtMB,isModelFile,loadModelFile,modelError,modelThumb} from '../devices/model.js';
import {sel,state} from '../state/state.js';
import {doc,ensureBoard,onBoards} from './boards.js';
import {addModel,replaceModel} from './devices-panel.js';
import {addItem} from './items.js';
import {icon} from './icons.js';
import {toast} from './toast.js';
import {t as tx} from '../lang.js';
import {$} from '../util.js';

/* Asset library (left panel): PNG / SVG / WebP / JPG images and GLB / glTF 3D models the document keeps (doc.assets,
   saved with the project). Click a tile to place it in the middle of the active artboard (an image as a 2D item, a
   model as a 3D object standing on the floor), or drag it onto the artboard to place it there.
   Files can be added with + or dropped on the group. Removing a tile does not touch what is already placed.
   An entry is {img, name}: img an HTMLImageElement, or a model asset (devices/model.js, isModel). */
const grid=$('#assetGrid'),fileEl=$('#assetFile'),group=$('#assetsGroup');
const MIME='application/x-mockup-asset';

// an SVG without width / height has no intrinsic size in some browsers: give it one from its viewBox
async function svgImage(file){
  let text=await file.text();
  try{
    const d=new DOMParser().parseFromString(text,'image/svg+xml'),s=d.documentElement;
    if(s.nodeName.toLowerCase()==='svg'&&!(parseFloat(s.getAttribute('width'))&&parseFloat(s.getAttribute('height')))){
      const vb=(s.getAttribute('viewBox')||'').split(/[\s,]+/).map(Number),w=vb[2]>0?vb[2]:512,h=vb[3]>0?vb[3]:512,k=1024/Math.max(w,h);
      s.setAttribute('width',String(Math.round(w*k)));s.setAttribute('height',String(Math.round(h*k)));
      text=new XMLSerializer().serializeToString(d);
    }
  }catch(e){/* use it as it is */}
  return URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));
}
async function loadAsset(file){
  const svg=file.type==='image/svg+xml'||/\.svg$/i.test(file.name);
  if(!svg&&!/^image\//.test(file.type))throw new Error('type');
  const img=new Image();img.src=svg?await svgImage(file):URL.createObjectURL(file);await img.decode();
  return img;
}
const baseName=f=>(f.name||tx('Görsel')).replace(/\.[a-z0-9]+$/i,'')||tx('Görsel');
// a GLB file into the library (with its size warning); rejects with the message to show
async function loadModelAsset(file){
  if(file.size>MODEL_MAX_MB*1e6)toast(tx('{f} {size}: büyük modeller otomatik kaydı ve proje dosyasını şişirir, sahne yavaşlayabilir. Mümkünse {max} MB altında tut.',{f:file.name,size:fmtMB(file.size),max:MODEL_MAX_MB}));
  try{return await loadModelFile(file);}catch(e){throw new Error(tx(modelError(e)),{cause:e});}
}
async function addAssetFiles(files){
  let n=0,bad=0,msg='';
  for(const f of files){
    try{
      if(isModelFile(f)){const a=await loadModelAsset(f);doc.assets.push({img:a,name:a.name});}
      else doc.assets.push({img:await loadAsset(f),name:baseName(f)});
      n++;
    }catch(e){bad++;if(isModelFile(f))msg=e.message;}
  }
  if(bad)toast(msg||tx('{n} dosya açılamadı. PNG, SVG, WebP, JPG ya da GLB kullan.',{n:bad}));
  else if(n)toast(n>1?tx('{n} varlık eklendi',{n}):tx('Varlık eklendi. Tıkla ya da artboarda sürükle.'));
  renderAssets();
}
// places an asset: an image as a 2D item, a model as a 3D object (at the drop point when given)
function placeAsset(a,at){
  if(a.img.isModel){addModel(a.img,at,a.name);return;}
  if(at)addItem(a.img,a.name,at);else addItem(a.img,a.name);
}
function renderAssets(){
  grid.innerHTML='';
  doc.assets.forEach((a,i)=>{
    const model=!!a.img.isModel,t=document.createElement('div');t.className='asset'+(model?' asset-3d':'');t.setAttribute('role','listitem');
    t.innerHTML='<button type="button" class="asset-btn" draggable="true"><img alt=""></button><button type="button" class="asset-x" aria-label="'+tx('Kütüphaneden kaldır')+'">'+icon('close-circle',14)+'</button>';
    const b=t.querySelector('.asset-btn'),img=t.querySelector('img');
    b.title=a.name+(model?' '+tx('(3B model): sahneye ekle'):': '+tx('artboarda ekle'));b.setAttribute('aria-label',b.title);
    if(model){const th=modelThumb(a.img);if(th)img.src=th;else{img.remove();b.innerHTML=icon('box',28);}b.insertAdjacentHTML('beforeend','<span class="asset-tag">3B</span>');}
    else img.src=a.img.src;
    b.addEventListener('click',()=>{ensureBoard();placeAsset(a);});
    b.addEventListener('dragstart',e=>{e.dataTransfer.setData(MIME,String(i));e.dataTransfer.effectAllowed='copy';});
    t.querySelector('.asset-x').addEventListener('click',()=>{doc.assets.splice(i,1);renderAssets();});
    grid.appendChild(t);
  });
  $('#assetEmpty').hidden=doc.assets.length>0;
}
$('#addAssetBtn').addEventListener('click',()=>fileEl.click());
fileEl.addEventListener('change',()=>{const f=[...fileEl.files];fileEl.value='';if(f.length)addAssetFiles(f);});
// files dropped on the group go to the library (image-input.js leaves those to us)
group.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();group.classList.add('over');}});
group.addEventListener('dragleave',e=>{if(!group.contains(e.relatedTarget))group.classList.remove('over');});
group.addEventListener('drop',e=>{group.classList.remove('over');const f=[...(e.dataTransfer.files||[])];if(!f.length)return;e.preventDefault();e.stopPropagation();addAssetFiles(f);});
// a tile dropped on the stage: placed where it lands
const stage=$('#stagearea');
stage.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes(MIME)){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
stage.addEventListener('drop',e=>{
  const i=e.dataTransfer.getData(MIME);if(i==='')return;e.preventDefault();e.stopPropagation();
  const a=doc.assets[+i];if(!a)return;
  if(ensureBoard())placeAsset(a);else placeAsset(a,{x:e.clientX,y:e.clientY});
});
/* GLB files from elsewhere in the editor: the device menu ("3B model (GLB)…", #modelAdd) loads them into the library
   and places each one; "Modeli değiştir" (#modelFile, the model's panel) gives the selected model another file. Model
   files dropped anywhere on the window land here too (image-input.js hands them over). */
async function importModels(files,target){
  const ok=[];
  for(const f of files){
    if(!isModelFile(f)){toast(tx('{f}: GLB ya da glTF dosyası değil.',{f:f.name}));continue;}
    try{const a=await loadModelAsset(f);doc.assets.push({img:a,name:a.name});ok.push(a);}catch(e){toast(e.message);}
  }
  renderAssets();if(!ok.length)return;
  ensureBoard();
  if(target&&state.devices.includes(target)&&target.type==='model'){replaceModel(target,ok[0]);ok.slice(1).forEach(a=>addModel(a));toast(tx('{f} yüklendi',{f:ok[0].name}));}
  else ok.forEach(a=>addModel(a));
}
const modelAdd=$('#modelAdd'),modelFile=$('#modelFile');
modelAdd.addEventListener('change',()=>{const f=[...modelAdd.files];modelAdd.value='';if(f.length)importModels(f);});
modelFile.addEventListener('change',()=>{const f=[...modelFile.files];modelFile.value='';const d=sel();if(f.length&&d&&d.type==='model')importModels(f,d);});
onBoards(renderAssets);

export {addAssetFiles,importModels,renderAssets};
