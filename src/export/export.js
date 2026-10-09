import {LRT} from '../lights/runtime.js';
import {renderNow} from '../render/accumulation.js';
import {canvas,renderer,req} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {state,view} from '../state/state.js';
import {applySaved,saved} from '../ui/angles.js';
import {layout,paintBg,ratioNums} from '../ui/layout.js';
import {syncSliders} from '../ui/sliders.js';
import {toast} from '../ui/toast.js';
import {$,mkCanvas} from '../util.js';

/* ---------- export ---------- */
function renderExport(){
  const [rw,rh]=ratioNums(),L=state.size;let W,H;
  if(rw>=rh){W=L;H=Math.round(L*rh/rw);}else{H=L;W=Math.round(L*rw/rh);}
  const pr=renderer.getPixelRatio();
  renderer.setPixelRatio(1);renderer.setSize(W,H,false);view.aspect=W/H;applyTransform();
  LRT.forEach(o=>o.marker.visible=false);renderNow(state.size>=3000?32:48);LRT.forEach(o=>o.marker.visible=state.markers);
  const out=mkCanvas(W,H),g=out.getContext('2d');paintBg(g,W,H);g.drawImage(canvas,0,0,W,H);
  renderer.setPixelRatio(pr);layout();req();
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
  try{const blob=await renderExport();offer('mockup-'+stamp()+'.'+ext(),blob);toast('İndirildi');}
  catch(e){toast('Görsel oluşturulamadı. Daha küçük bir çözünürlük dene.');}
  finally{exportBtn.disabled=false;}
});
exportAllBtn.addEventListener('click',async()=>{
  if(!saved.length)return;
  exportAllBtn.disabled=true;const keep=Object.assign({},state.scene),files=[];
  try{
    const JSZip=await loadJSZip(),zip=JSZip?new JSZip():null,used={};
    for(let i=0;i<saved.length;i++){
      exportAllBtn.textContent='Hazırlanıyor: '+(i+1)+' / '+saved.length;
      applySaved(saved[i]);const b=await renderExport();
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
