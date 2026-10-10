import {doc,ensureBoard,onBoards} from './boards.js';
import {addItem} from './items.js';
import {icon} from './icons.js';
import {toast} from './toast.js';
import {$} from '../util.js';

/* Asset library (left panel): PNG / SVG / WebP / JPG images the document keeps (doc.assets, saved with the project).
   Click a tile to place it in the middle of the active artboard, or drag it onto the artboard to place it there.
   Files can be added with + or dropped on the group. Removing a tile does not touch items already placed. */
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
const baseName=f=>(f.name||'Görsel').replace(/\.[a-z0-9]+$/i,'')||'Görsel';
async function addAssetFiles(files){
  let n=0,bad=0;
  for(const f of files){try{doc.assets.push({img:await loadAsset(f),name:baseName(f)});n++;}catch(e){bad++;}}
  if(bad)toast(bad+' dosya açılamadı. PNG, SVG, WebP veya JPG kullan.');
  else if(n)toast(n>1?n+' varlık eklendi':'Varlık eklendi. Tıkla ya da artboarda sürükle.');
  renderAssets();
}
function renderAssets(){
  grid.innerHTML='';
  doc.assets.forEach((a,i)=>{
    const t=document.createElement('div');t.className='asset';t.setAttribute('role','listitem');
    t.innerHTML='<button type="button" class="asset-btn" draggable="true"><img alt=""></button><button type="button" class="asset-x" aria-label="Kütüphaneden kaldır">'+icon('close-circle',14)+'</button>';
    const b=t.querySelector('.asset-btn');b.title=a.name+': artboarda ekle';b.setAttribute('aria-label',a.name+', artboarda ekle');t.querySelector('img').src=a.img.src;
    b.addEventListener('click',()=>{ensureBoard();addItem(a.img,a.name);});
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
  if(ensureBoard())addItem(a.img,a.name);else addItem(a.img,a.name,{x:e.clientX,y:e.clientY});
});
onBoards(renderAssets);

export {addAssetFiles,renderAssets};
