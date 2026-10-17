import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {mediaSize,screenSrc,setScreenTexture} from '../devices/screen.js';
import {LRT} from '../lights/runtime.js';
import {DOF_SAMPLES,renderNow} from '../render/accumulation.js';
import {dofOn} from '../render/lens.js';
import {png24} from './png24.js';
import {fontsReady} from '../render/text.js';
import {camera,canvas,overlays,renderer,req,setCrop} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {state,view} from '../state/state.js';
import {applySaved,saved} from '../ui/angles.js';
import {invalidateLayout,layout,paintBg,paintItems,ratioNums} from '../ui/layout.js';
import {syncSliders} from '../ui/sliders.js';
import {busy,isCancel,paint} from '../ui/busy.js';
import {toast} from '../ui/toast.js';
import {$,mkCanvas} from '../util.js';

/* ---------- export ---------- */
const PHOTO_SAMPLES=64,PHOTO_BUDGET_MS=30000;  // OIDN cleans the rest
// onProgress(0..1) is called while a photo-quality (path traced) render runs
// output size: width Wd at the artboard's ratio, the long edge at most cap (portrait boards: 3840 px wide would be
// 6827 px tall at 9:16), or the custom artboard's exact size
const MAX_EDGE=3840;
function exportSize(Wd,cap=MAX_EDGE){
  const [rw,rh]=ratioNums();
  if(state.ratio==='custom')return [state.customW,state.customH];
  const k=Math.min(1,cap/Math.max(Wd,Wd*rh/rw));
  return [Math.round(Wd*k),Math.round(Wd*rh/rw*k)];
}
// Screens sampled without mipmaps for the export when the screen texture is not minified much (CRISP_MAX texels per
// output pixel): the jittered samples average the texels themselves, which keeps screen text sharper than trilinear /
// anisotropic filtering does at oblique angles (at 4 the mipmaps still blurred a laptop + phone at 1080 px, ~10 texels
// per pixel; 32–48 jittered samples resolve 16 without visible grain). Tiny screens keep their mipmaps.
// Returns the function that restores the live filtering.
const CRISP_MAX=16,_c=new THREE.Vector3();
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
    const px=Math.max(x1-x0,y1-y0)/2*W,tex=Math.max(m.image.width,m.image.height),shot=screenSrc(d),src=shot?Math.max(...mediaSize(shot)):tex;
    if(!(px>0)||Math.min(tex,src)/px>CRISP_MAX)return;
    maps.push(m);m.generateMipmaps=false;m.minFilter=THREE.LinearFilter;m.needsUpdate=true;
  });
  return ()=>maps.forEach(m=>{m.generateMipmaps=true;m.minFilter=THREE.LinearMipmapLinearFilter;m.needsUpdate=true;});
}
async function renderExport(onProgress){
  await fontsReady(state.items);  // text layers draw with their web fonts, not the fallback
  const [W,H]=exportSize(state.size);
  const pr=renderer.getPixelRatio();
  setCrop(null);renderer.setPixelRatio(1);renderer.setSize(W,H,false);view.aspect=W/H;applyTransform();  // whole frame (layout() restores the live crop)
  let src=canvas;
  LRT.forEach(o=>o.marker.visible=false);const ov=[...overlays].map(o=>[o,o.visible]);ov.forEach(([o])=>{o.visible=false;});
  const uncrisp=crispScreens(Math.max(W,H));
  const out=mkCanvas(W,H),g=out.getContext('2d');
  try{
    // the path tracer (~260 kB) loads on first use
    paintBg(g,W,H);paintItems(g,W,H,false);
    // photo: the path tracer lays its render over what is behind it before denoising and returns the whole picture
    if(state.quality==='photo'){src=await (await import('../render/pathtrace.js')).renderPathTraced(PHOTO_SAMPLES,onProgress,PHOTO_BUDGET_MS,out);g.clearRect(0,0,W,H);}
    else renderNow(dofOn()?DOF_SAMPLES:state.size>=3000?32:48);  // the depth of field is sampled by the passes
    g.drawImage(src,0,0,W,H);paintItems(g,W,H,true);
  }finally{
    // also when the render was cancelled (onProgress throws, ui/busy.js): the live view comes back
    uncrisp();LRT.forEach(o=>o.marker.visible=state.markers);ov.forEach(([o,v])=>{o.visible=v;});
    renderer.setPixelRatio(pr);invalidateLayout();layout();req();
  }
  if(onProgress)onProgress(1);  // encoding the file (a 3840 px PNG takes a moment)
  await new Promise(r=>setTimeout(r,0));
  if(state.format==='png24')return png24(out);  // store listings: no alpha channel
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
  const b=busy(state.quality==='photo'?'Fotoğraf hazırlanıyor':'Görsel hazırlanıyor');
  try{await paint();const blob=await renderExport(b.progress);offer('mockup-'+stamp()+'.'+ext(),blob);toast('İndirildi');}
  catch(e){toast(isCancel(e)?'Dışa aktarım durduruldu':'Görsel oluşturulamadı. Daha küçük bir çözünürlük dene.');}
  finally{b.close();exportBtn.disabled=false;}
});
exportAllBtn.addEventListener('click',async()=>{
  if(!saved.length)return;
  exportAllBtn.disabled=true;const keep=Object.assign({},state.scene),files=[];
  const bz=busy('Açılar hazırlanıyor');
  try{
    const JSZip=await loadJSZip(),zip=JSZip?new JSZip():null,used={};
    for(let i=0;i<saved.length;i++){
      bz.step(i,saved.length,saved[i].name);
      applySaved(saved[i]);await paint();const b=await renderExport(bz.progress);
      let base=slug(saved[i].name);if(used[base])base+='-'+(++used[base]);else used[base]=1;
      files.push([base+'.'+ext(),b]);if(zip)zip.file(base+'.'+ext(),b);
    }
    Object.assign(state.scene,keep);applyTransform();syncSliders();
    if(zip){const z=await zip.generateAsync({type:'blob'});offer('mockup-acilar-'+stamp()+'.zip',z);}
    // JSZip could not be loaded: fall back to one download per angle (spaced so browsers don't drop them)
    else for(const [n,b] of files){offer(n,b);await wait(250);}
    toast('İndirildi');
  }catch(e){Object.assign(state.scene,keep);applyTransform();syncSliders();toast(isCancel(e)?'Dışa aktarım durduruldu':'Görseller oluşturulamadı. Daha küçük bir çözünürlük dene.');}
  finally{bz.close();exportAllBtn.disabled=false;}
});

/* ---------- one image per screenshot: the same scene with each screenshot on the devices of its shape (tall on
   phones and tablets, wide on laptops, monitors and browser windows; when no device fits, the selected one),
   exported in turn and zipped under the screenshots' own names. The screens are put back afterwards. */
const MOBILE=new Set(['phone','tablet']);
const batchBtn=$('#exportBatch'),batchFile=$('#batchFile');
batchBtn.addEventListener('click',()=>batchFile.click());
batchFile.addEventListener('change',async()=>{
  const files=[...batchFile.files].filter(f=>/^image\//.test(f.type));batchFile.value='';if(!files.length)return;
  const devs=state.devices.filter(d=>d.type!=='model'&&(d.type!=='custom'||d.frameImg));
  if(!devs.length){toast('Bu artboard\'da ekranı olan cihaz yok.');return;}
  const keep=devs.map(d=>({d,img:d.img,imgName:d.imgName,video:d.video,videoName:d.videoName,scroll:d.scroll,fit:d.fit}));
  batchBtn.disabled=true;const bz=busy('Görseller hazırlanıyor'),out=[];
  try{
    const JSZip=await loadJSZip(),zip=JSZip?new JSZip():null,used={};
    for(let i=0;i<files.length;i++){
      bz.step(i,files.length,files[i].name);
      const img=await new Promise((ok,fail)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>fail(new Error(files[i].name));im.src=URL.createObjectURL(files[i]);});
      // every image starts from the scene as it was: the previous image does not stay on the other devices
      keep.forEach(k=>{Object.assign(k.d,{img:k.img,imgName:k.imgName,video:k.video,videoName:k.videoName,scroll:k.scroll,fit:k.fit});});
      const wide=img.naturalWidth>img.naturalHeight;
      let on=devs.filter(d=>MOBILE.has(d.type)!==wide);if(!on.length)on=[devs.find(d=>d.id===state.selected)||devs[0]];
      on.forEach(d=>{d.img=img;d.imgName=files[i].name;d.video=null;d.videoName='';d.scroll=0;d.fit='cover';});devs.forEach(setScreenTexture);
      await paint();const b=await renderExport(bz.progress);
      let base=slug(files[i].name.replace(/\.[a-z0-9]+$/i,''));if(used[base])base+='-'+(++used[base]);else used[base]=1;
      out.push([base+'.'+ext(),b]);if(zip)zip.file(base+'.'+ext(),b);
    }
    if(zip){offer('mockup-toplu-'+stamp()+'.zip',await zip.generateAsync({type:'blob'}));}
    else for(const [n,b] of out){offer(n,b);await wait(250);}
    toast(files.length+' görsel indirildi');
  }catch(e){toast(isCancel(e)?'Dışa aktarım durduruldu':'Görseller oluşturulamadı: '+(e.message||e));}
  finally{
    keep.forEach(k=>{Object.assign(k.d,{img:k.img,imgName:k.imgName,video:k.video,videoName:k.videoName,scroll:k.scroll,fit:k.fit});setScreenTexture(k.d);});
    req();bz.close();batchBtn.disabled=false;
  }
});

export {exportSize,offer,renderExport};
