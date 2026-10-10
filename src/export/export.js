import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {LRT} from '../lights/runtime.js';
import {renderNow} from '../render/accumulation.js';
import {camera,canvas,overlays,renderer,req,setCrop} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {state,view} from '../state/state.js';
import {applySaved,saved} from '../ui/angles.js';
import {invalidateLayout,layout,paintBg,paintItems,ratioNums} from '../ui/layout.js';
import {syncSliders} from '../ui/sliders.js';
import {toast} from '../ui/toast.js';
import {$,mkCanvas} from '../util.js';

/* ---------- export ---------- */
const PHOTO_SAMPLES=64,PHOTO_BUDGET_MS=30000;  // OIDN cleans the rest
// onProgress(0..1) is called while a photo-quality (path traced) render runs
// output size: the long edge L at the artboard's ratio, or the custom artboard's exact size
function exportSize(L){
  const [rw,rh]=ratioNums();
  if(state.ratio==='custom')return [state.customW,state.customH];
  return rw>=rh?[L,Math.round(L*rh/rw)]:[Math.round(L*rw/rh),L];
}
// Screens sampled without mipmaps for the export when the screen texture is not minified much (CRISP_MAX texels per
// output pixel): the jittered samples average the texels themselves, which keeps screen text sharper than trilinear /
// anisotropic filtering does at oblique angles. Tiny screens keep their mipmaps (too few samples per texel otherwise).
// Returns the function that restores the live filtering.
const CRISP_MAX=4,_c=new THREE.Vector3();
function crispScreens(W){
  const maps=[];
  state.devices.forEach(d=>{
    const o=RT.get(d.id);if(!o)return;
    const m=(o.custom?o.mats.custom:o.mats.screen).map,mesh=o.screen;
    if(!m||!m.generateMipmaps||!mesh||!mesh.geometry)return;
    mesh.updateWorldMatrix(true,false);const bb=mesh.geometry.boundingBox||(mesh.geometry.computeBoundingBox(),mesh.geometry.boundingBox);
    let x0=1/0,x1=-1/0,y0=1/0,y1=-1/0;
    for(let i=0;i<8;i++){_c.set(i&1?bb.max.x:bb.min.x,i&2?bb.max.y:bb.min.y,i&4?bb.max.z:bb.min.z).applyMatrix4(mesh.matrixWorld).project(camera);
      x0=Math.min(x0,_c.x);x1=Math.max(x1,_c.x);y0=Math.min(y0,_c.y);y1=Math.max(y1,_c.y);}
    // the detail that can be minified is the screenshot's own resolution (the 4096 px canvas may upscale it)
    const px=Math.max(x1-x0,y1-y0)/2*W,tex=Math.max(m.image.width,m.image.height),src=d.img?Math.max(d.img.naturalWidth||tex,d.img.naturalHeight||0):tex;
    if(!(px>0)||Math.min(tex,src)/px>CRISP_MAX)return;
    maps.push(m);m.generateMipmaps=false;m.minFilter=THREE.LinearFilter;m.needsUpdate=true;
  });
  return ()=>maps.forEach(m=>{m.generateMipmaps=true;m.minFilter=THREE.LinearMipmapLinearFilter;m.needsUpdate=true;});
}
async function renderExport(onProgress){
  const [W,H]=exportSize(state.size);
  const pr=renderer.getPixelRatio();
  setCrop(null);renderer.setPixelRatio(1);renderer.setSize(W,H,false);view.aspect=W/H;applyTransform();  // whole frame (layout() restores the live crop)
  let src=canvas;
  LRT.forEach(o=>o.marker.visible=false);const ov=[...overlays].map(o=>[o,o.visible]);ov.forEach(([o])=>{o.visible=false;});
  const uncrisp=crispScreens(Math.max(W,H));
  try{
    // the path tracer (~260 kB) loads on first use
    if(state.quality==='photo')src=await (await import('../render/pathtrace.js')).renderPathTraced(PHOTO_SAMPLES,onProgress,PHOTO_BUDGET_MS);
    else renderNow(state.size>=3000?32:48);
  }finally{uncrisp();LRT.forEach(o=>o.marker.visible=state.markers);ov.forEach(([o,v])=>{o.visible=v;});}
  const out=mkCanvas(W,H),g=out.getContext('2d');paintBg(g,W,H);paintItems(g,W,H,false);g.drawImage(src,0,0,W,H);paintItems(g,W,H,true);
  renderer.setPixelRatio(pr);invalidateLayout();layout();req();
  return new Promise((res,rej)=>out.toBlob(b=>b?res(b):rej(new Error('blob')),state.format==='jpg'?'image/jpeg':'image/png',.93));
}
const ext=()=>state.format==='jpg'?'jpg':'png';
function stamp(){const d=new Date(),z=n=>String(n).padStart(2,'0');return d.getFullYear()+z(d.getMonth()+1)+z(d.getDate())+'-'+z(d.getHours())+z(d.getMinutes())+z(d.getSeconds());}
function slug(s){const map={ç:'c',ğ:'g',ı:'i',ö:'o',ş:'s',ü:'u',Ç:'c',Ğ:'g',İ:'i',Ö:'o',Ş:'s',Ü:'u'};
  return String(s).replace(/[çğıöşüÇĞİÖŞÜ]/g,c=>map[c]).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'aci';}
// Trigger a browser download via a temporary <a download>. The object URL is
// revoked a bit later: some browsers start reading it after the click returns.
function offer(name,blob){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.rel='noopener';a.style.display='none';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function loadJSZip(){try{return (await import('jszip')).default;}catch(e){return null;}}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const exportBtn=$('#export'),exportAllBtn=$('#exportAll');
exportBtn.addEventListener('click',async()=>{
  exportBtn.disabled=true;
  const label=exportBtn.textContent;
  try{const blob=await renderExport(p=>{exportBtn.textContent='Fotoğraf hazırlanıyor: %'+Math.round(p*100);});offer('mockup-'+stamp()+'.'+ext(),blob);toast('İndirildi');}
  catch(e){toast('Görsel oluşturulamadı. Daha küçük bir çözünürlük dene.');}
  finally{exportBtn.disabled=false;exportBtn.textContent=label;}
});
exportAllBtn.addEventListener('click',async()=>{
  if(!saved.length)return;
  exportAllBtn.disabled=true;const keep=Object.assign({},state.scene),files=[];
  try{
    const JSZip=await loadJSZip(),zip=JSZip?new JSZip():null,used={};
    for(let i=0;i<saved.length;i++){
      exportAllBtn.textContent='Hazırlanıyor: '+(i+1)+' / '+saved.length;
      applySaved(saved[i]);const b=await renderExport(p=>{exportAllBtn.textContent='Hazırlanıyor: '+(i+1)+' / '+saved.length+' (%'+Math.round(p*100)+')';});
      let base=slug(saved[i].name);if(used[base])base+='-'+(++used[base]);else used[base]=1;
      files.push([base+'.'+ext(),b]);if(zip)zip.file(base+'.'+ext(),b);
    }
    Object.assign(state.scene,keep);applyTransform();syncSliders();
    if(zip){const z=await zip.generateAsync({type:'blob'});offer('mockup-acilar-'+stamp()+'.zip',z);}
    // JSZip could not be loaded: fall back to one download per angle (spaced so browsers don't drop them)
    else for(const [n,b] of files){offer(n,b);await wait(250);}
    toast('İndirildi');
  }catch(e){Object.assign(state.scene,keep);applyTransform();syncSliders();toast('Görseller oluşturulamadı. Daha küçük bir çözünürlük dene.');}
  finally{exportAllBtn.disabled=false;exportAllBtn.textContent='Kayıtlı açıların hepsini ZIP olarak indir';}
});

export {exportSize,offer,renderExport};
