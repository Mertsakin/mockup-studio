import {RT} from '../devices/rt.js';
import {buildRT,disposeRT} from '../devices/runtime.js';
import {rebuildLights} from '../lights/actions.js';
import {reserveLightIds} from '../lights/mods.js';
import {renderer} from '../render/renderer.js';
import {comp} from '../render/stage.js';
import {applyTransform} from '../render/transform.js';
import {reserveDeviceIds,state,view} from '../state/state.js';

/* Whole-scene snapshots, shared by undo/redo, autosave and project files.
   A snapshot is plain data: the studio state (devices, lights, scene angle, background, artboard…) plus the
   current framing (composition offset and radius, which "Odakla" / "Kadraja sığdır" change). Images are not copied:
   devices refer to them by key, and `images` maps key -> HTMLImageElement in memory. Project files and autosave
   store the images themselves (see packImages / unpackImages). */
const SKIP_STATE=new Set(['devices','lights','selected','selLight','mode','gizmo']);
const SKIP_DEVICE=new Set(['img','frameImg']);
const ids=new WeakMap();let nextImg=0;
const imgKey=img=>{if(!img)return null;if(!ids.has(img))ids.set(img,'i'+(++nextImg));return ids.get(img);};
// an image loaded back from a file / storage keeps its key, so it is not stored twice
const adopt=(img,k)=>{ids.set(img,k);const n=+String(k).slice(1);if(n>nextImg)nextImg=n;return img;};
const copy=o=>JSON.parse(JSON.stringify(o));

function snapshot(){
  const images={},st={};
  for(const k in state)if(!SKIP_STATE.has(k))st[k]=copy(state[k]);
  const devices=state.devices.map(d=>{const o={};for(const k in d)if(!SKIP_DEVICE.has(k))o[k]=copy(d[k]);
    if(d.img){o.img=imgKey(d.img);images[o.img]=d.img;}if(d.frameImg){o.frameImg=imgKey(d.frameImg);images[o.frameImg]=d.frameImg;}return o;});
  return {v:1,state:st,devices,lights:copy(state.lights),selected:state.selected,selLight:state.selLight,
    frame:{comp:comp.position.toArray(),fitRadius:view.fitRadius},images};
}
// what history compares: everything but the image elements themselves (their keys are in the device data)
const signature=s=>JSON.stringify([s.state,s.devices,s.lights,s.frame]);

function restore(s){
  [...RT.keys()].forEach(disposeRT);
  const cur=new Set(Object.keys(state));
  for(const k in s.state)if(cur.has(k)&&k!=='scene')state[k]=copy(s.state[k]);
  Object.assign(state.scene,copy(s.state.scene));
  state.devices=s.devices.map(o=>Object.assign({},copy(o),{img:o.img?s.images[o.img]||null:null,frameImg:o.frameImg?s.images[o.frameImg]||null:null}));
  state.lights=copy(s.lights);
  reserveDeviceIds(Math.max(0,...state.devices.map(d=>d.id)));reserveLightIds(Math.max(0,...state.lights.map(l=>l.id)));
  state.selected=state.devices.some(d=>d.id===s.selected)?s.selected:(state.devices[0]&&state.devices[0].id);
  state.selLight=state.lights.some(l=>l.id===s.selLight)?s.selLight:(state.lights[0]?state.lights[0].id:null);
  renderer.toneMappingExposure=state.exposure;
  state.devices.forEach(buildRT);rebuildLights();
  comp.position.fromArray(s.frame.comp);view.fitRadius=s.frame.fitRadius;
  applyTransform();
}

// --- images for files / storage: key -> Blob and back
async function imageBlob(img){const r=await fetch(img.src);return r.blob();}
const blobToDataUrl=b=>new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(f.result);f.onerror=rej;f.readAsDataURL(b);});
async function loadImage(src){const img=new Image();img.src=src;await img.decode();return img;}

/* Documents: a list of artboards, each holding one scene snapshot (see ui/boards.js).
   {v:2, active, boards:[{id,name,x,y,snap}]}. Snapshots of one document share one image map. */
const docImages=d=>{const m={};d.boards.forEach(b=>Object.assign(m,b.snap.images||{}));return m;};
const SNAP_KEYS=['v','state','devices','lights','selected','selLight','frame'];
const plainSnap=s=>{const o={};SNAP_KEYS.forEach(k=>{o[k]=s[k];});return o;};
// thumbnails (small data URLs) travel along, so a loaded document shows every board without re-rendering it
const plainDoc=d=>({v:2,active:d.active,boards:d.boards.map(b=>({id:b.id,name:b.name,x:b.x,y:b.y,snap:plainSnap(b.snap),thumb:b.thumb||null}))});
// a single-scene snapshot (v1 files, old autosaves) becomes a one-board document
function asDoc(s){
  if(s&&s.v===2&&Array.isArray(s.boards))return s;
  return {v:2,active:1,boards:[{id:1,name:'Artboard 1',x:0,y:0,snap:s}]};
}
function attachImages(d,images){d.boards.forEach(b=>{b.snap.images=images;});return d;}

// project file: one JSON with the images inlined as data URLs
async function toProjectFile(d){
  const all=docImages(d),images={};for(const k in all)images[k]=await blobToDataUrl(await imageBlob(all[k]));
  return JSON.stringify(Object.assign({app:'mockup-studio'},plainDoc(d),{images}));
}
async function fromProjectFile(text){
  const p=JSON.parse(text);
  if(p.app!=='mockup-studio'||!(Array.isArray(p.boards)||Array.isArray(p.devices)))throw new Error('Bu bir mockup stüdyosu proje dosyası değil.');
  const images={};for(const k in p.images||{})images[k]=adopt(await loadImage(p.images[k]),k);
  delete p.images;
  return attachImages(asDoc(p),images);
}

// --- autosave in IndexedDB (localStorage is too small for screenshots); every call is best-effort
const DB='mockup-studio',STORE='kv';
let dbP=null;  // one connection, reused
const db=()=>dbP||(dbP=new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>{dbP=null;rej(r.error);};}));
async function idb(mode,fn){const d=await db();return new Promise((res,rej)=>{const t=d.transaction(STORE,mode),req=fn(t.objectStore(STORE));t.oncomplete=()=>res(req&&req.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);});}
const stored=new Set();
// saves run one after another (a timer save and a leave-page save can overlap otherwise)
let chain=Promise.resolve();
function autosave(d){chain=chain.then(()=>saveNow(d));return chain;}
async function saveNow(d){
  try{
    // blobs first (async work cannot run inside an IndexedDB transaction), then one transaction for everything
    const all=docImages(d),add=[];for(const k in all)if(!stored.has(k))add.push([k,await imageBlob(all[k])]);
    const drop=[...stored].filter(k=>!(k in all)),data=Object.assign(plainDoc(d),{images:Object.keys(all)});
    await idb('readwrite',st=>{add.forEach(([k,b])=>st.put(b,'img:'+k));drop.forEach(k=>st.delete('img:'+k));return st.put(data,'scene');});
    add.forEach(([k])=>stored.add(k));drop.forEach(k=>stored.delete(k));
  }catch(e){console.warn('Otomatik kayıt başarısız:',e);}
}
async function loadAutosave(){
  try{
    const data=await idb('readonly',st=>st.get('scene'));if(!data||!(Array.isArray(data.boards)||Array.isArray(data.devices)))return null;
    const images={};
    for(const k of data.images||[]){const b=await idb('readonly',st=>st.get('img:'+k));if(b){images[k]=adopt(await loadImage(URL.createObjectURL(b)),k);stored.add(k);}}
    delete data.images;
    return attachImages(asDoc(data),images);
  }catch(e){return null;}
}

export {asDoc,autosave,fromProjectFile,loadAutosave,restore,signature,snapshot,toProjectFile};
