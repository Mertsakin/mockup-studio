import {RT} from '../devices/rt.js';
import {loadModel} from '../devices/model.js';
import {loadVideo} from '../devices/video.js';
import {buildRT,disposeRT} from '../devices/runtime.js';
import {rebuildLights} from '../lights/actions.js';
import {reserveLightIds} from '../lights/mods.js';
import {designT,interp,tracked} from '../state/anim.js';
import {patternBg} from '../render/backgrounds.js';
import {renderer} from '../render/renderer.js';
import {comp} from '../render/stage.js';
import {applyTransform} from '../render/transform.js';
import {DEFAULT_MODEL_CM} from '../state/constants.js';
import {reserveDeviceIds,reserveItemIds,state,view} from '../state/state.js';

/* Whole-scene snapshots, shared by undo/redo, autosave and project files.
   A snapshot is plain data: the studio state (devices, lights, scene angle, background, artboard…) plus the
   current framing (composition offset and radius, which "Odakla" / "Kadraja sığdır" change). Images are not copied:
   devices refer to them by key, and `images` maps key -> HTMLImageElement in memory. Project files and autosave
   store the images themselves (see packImages / unpackImages). Screen videos (d.video, an HTMLVideoElement) travel
   the same way under 'v…' keys: a blob in the autosave, a media file in a .mockup.zip project; imported 3D models
   (d.model, devices/model.js) under 'm…' keys, the same way. */
const SKIP_STATE=new Set(['devices','lights','selected','selLight','mode','gizmo','bgImg','items','selItem']);
const SKIP_DEVICE=new Set(['img','frameImg','video','model']);
const ids=new WeakMap();let nextImg=0;
const imgKey=img=>{if(!img)return null;if(!ids.has(img))ids.set(img,(img.isModel?'m':img.tagName==='VIDEO'?'v':'i')+(++nextImg));return ids.get(img);};
const isVideoKey=k=>/^v/.test(k),isModelKey=k=>/^m/.test(k);
// an image loaded back from a file / storage keeps its key, so it is not stored twice
const adopt=(img,k)=>{ids.set(img,k);const n=+String(k).slice(1);if(n>nextImg)nextImg=n;return img;};
const copy=o=>JSON.parse(JSON.stringify(o));
const DEV_DEFAULTS={video:null,videoName:'',videoT0:0,videoLoop:true,videoPoster:null,model:null,modelName:'',modelSize:DEFAULT_MODEL_CM};

function snapshot(){
  const images={},st={};
  for(const k in state)if(!SKIP_STATE.has(k))st[k]=copy(state[k]);
  // the camera (state.scene) and the lights animate like the devices: stored at their design frames
  tracked(state.scene).forEach(k=>{st.scene[k]=interp(state.scene.tracks[k],designT(state.scene));});
  const lights=state.lights.map(L=>{const o=copy(L);tracked(L).forEach(k=>{o[k]=interp(L.tracks[k],designT(L));});return o;});
  st.bgImg=imgKey(state.bgImg);if(state.bgImg)images[st.bgImg]=state.bgImg;
  // text items have no image (kind 'text'): their content is plain data
  st.items=state.items.map(it=>{
    const o=it.img?Object.assign({},it,{img:imgKey(it.img)}):Object.assign({},it);if(it.img)images[o.img]=it.img;
    tracked(it).forEach(k=>{o[k]=interp(it.tracks[k],designT(it));});  // like the devices: values at the design frame
    return copy(o);});
  const devices=state.devices.map(d=>{const o={};for(const k in d)if(!SKIP_DEVICE.has(k))o[k]=copy(d[k]);
    // animated values are stored at the design frame, not at the editor's playhead (moving the playhead is not an edit)
    tracked(d).forEach(k=>{o[k]=interp(d.tracks[k],designT(d));});
    if(d.img){o.img=imgKey(d.img);images[o.img]=d.img;}if(d.frameImg){o.frameImg=imgKey(d.frameImg);images[o.frameImg]=d.frameImg;}
    if(d.video){o.video=imgKey(d.video);images[o.video]=d.video;}if(d.model){o.model=imgKey(d.model);images[o.model]=d.model;}return o;});
  return {v:1,state:st,devices,lights,selected:state.selected,selLight:state.selLight,
    frame:{comp:comp.position.toArray(),fitRadius:view.fitRadius},images};
}
// what history compares: everything but the image elements themselves (their keys are in the device data)
const signature=s=>JSON.stringify([s.state,s.devices,s.lights,s.frame]);

function restore(s){
  [...RT.keys()].forEach(disposeRT);
  const cur=new Set(Object.keys(state));
  for(const k in s.state)if(cur.has(k)&&k!=='scene'&&k!=='bgImg')state[k]=copy(s.state[k]);
  state.bgImg=s.state.bgImg&&s.images[s.state.bgImg]||null;
  // text and frames carry no image
  state.items=(s.state.items||[]).map(o=>o.kind==='text'||o.kind==='frame'?copy(o):Object.assign(copy(o),{img:s.images[o.img]||null})).filter(o=>o.img||o.kind==='text'||o.kind==='frame');
  reserveItemIds(Math.max(0,...state.items.map(i=>i.id)));if(!state.items.some(i=>i.id===state.selItem))state.selItem=null;
  // documents from when patterns were a background style: the pattern becomes the background image
  if(s.state.bg==='pattern'){Object.assign(state,patternBg(s.state));Object.assign(s.state,{bg:'image',bgImgName:state.bgImgName,bgImg:imgKey(state.bgImg)});s.images[s.state.bgImg]=state.bgImg;}
  // fields newer than the snapshot get their defaults (not the previous board's values)
  const DEF={gradType:'linear',gradAngle:135,bgFit:'cover',bgScale:1,bgX:0,bgY:0,anim:{dur:5,fps:30,loop:true},pano:null,env:'studio',worldLights:false,dof:null};
  for(const k in DEF)if(!(k in s.state))state[k]=copy(DEF[k]);
  // the export size used to be the long edge (1080 / 2160 / 3840); now it is the width (the #size options in index.html)
  if(![1080,1920,3840].includes(state.size))state.size=1920;
  // the scene object stays (modules hold it); its animation goes if the snapshot has none
  delete state.scene.tracks;delete state.scene.designT;Object.assign(state.scene,copy(s.state.scene));
  // the f-number used to live in dof.f; it and the focus distance are the camera's now (render/lens.js). A snapshot
  // from before gets them here (not the previous board's values, since the scene object stays)
  const sc=s.state.scene||{};
  if(sc.fnum===undefined)state.scene.fnum=state.dof&&typeof state.dof.f==='number'?state.dof.f:2.8;
  if(sc.focusDist===undefined)state.scene.focusDist=60;
  if(state.dof&&'f' in state.dof)delete state.dof.f;
  // fields newer than the snapshot get their defaults AFTER the stored keys: the key order, and so the signature of
  // the next snapshot, stays as stored (defaults in front made the first return to a board an empty undo step)
  state.devices=s.devices.map(o=>{const d=copy(o);for(const k in DEV_DEFAULTS)if(!(k in d))d[k]=DEV_DEFAULTS[k];
    return Object.assign(d,{img:o.img?s.images[o.img]||null:null,frameImg:o.frameImg?s.images[o.frameImg]||null:null,video:o.video?s.images[o.video]||null:null,model:o.model?s.images[o.model]||null:null});});
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
async function imageBlob(img){if(img.blob)return img.blob;const r=await fetch(img.src);return r.blob();}  // a model asset keeps its file
const blobToDataUrl=b=>new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(f.result);f.onerror=rej;f.readAsDataURL(b);});
// resolves on load, not decode(): Chrome defers decode() in a hidden tab indefinitely, which kept the studio booting
// in a background tab until it was looked at (drawImage decodes on demand anyway)
const loadImage=src=>new Promise((res,rej)=>{const img=new Image();img.onload=()=>res(img);img.onerror=()=>rej(new Error('image'));img.src=src;});
// an element for a stored key: a video for 'v…' keys, a model asset for 'm…' keys, an image otherwise
const loadMedia=(src,k)=>isVideoKey(k)?loadVideo(src):isModelKey(k)?loadModel(src):loadImage(src);
const extOf=b=>({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','model/gltf-binary':'glb','model/gltf+json':'gltf'})[b.type]||'bin';
const MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml',gif:'image/gif',mp4:'video/mp4',webm:'video/webm',glb:'model/gltf-binary',gltf:'model/gltf+json'};

/* Documents: a list of artboards, each holding one scene snapshot (see ui/boards.js).
   {v:2, active, boards:[{id,name,x,y,snap}]}. Snapshots of one document share one image map. */
const docImages=d=>{const m={};d.boards.forEach(b=>Object.assign(m,b.snap.images||{}));return Object.assign(m,d.assetImages||{});};
const SNAP_KEYS=['v','state','devices','lights','selected','selLight','frame'];
const plainSnap=s=>{const o={};SNAP_KEYS.forEach(k=>{o[k]=s[k];});return o;};
// thumbnails (small data URLs) travel along, so a loaded document shows every board without re-rendering it
const plainDoc=d=>({v:2,layout:d.layout,active:d.active,boards:d.boards.map(b=>({id:b.id,name:b.name,x:b.x,y:b.y,snap:plainSnap(b.snap),thumb:b.thumb||null})),assets:d.assets||[],fonts:d.fonts||[],langs:d.langs||[],lang:d.lang||null,sequence:d.sequence||null});
/* The asset library (left panel) belongs to the document: assets [{img: key, name}] + assetImages {key: image}. */
function packAssets(list){const assetImages={},assets=list.map(a=>{const k=imgKey(a.img);assetImages[k]=a.img;return {img:k,name:a.name};});return {assets,assetImages};}
// a single-scene snapshot (v1 files, old autosaves) becomes a one-board document
function asDoc(s){
  if(s&&s.v===2&&Array.isArray(s.boards))return s;
  return {v:2,active:1,boards:[{id:1,name:'Artboard 1',x:0,y:0,snap:s}]};
}
function attachImages(d,images){d.boards.forEach(b=>{b.snap.images=images;});d.assetImages=images;return d;}

/* Project file. Without video or model: one JSON with the images inlined as data URLs (.mockup.json, as before). With a
   screen video or an imported 3D model: a ZIP (.mockup.zip) holding project.json (no inlined media) and media/<key>.<ext> for every image and video
   (a video as a data URL would triple the memory and freeze the save). Returns {blob, zip}. */
const zipKeys=keys=>keys.some(k=>isVideoKey(k)||isModelKey(k));
const needsZip=d=>zipKeys(Object.keys(docImages(d)));
async function toProjectFile(d){const {plain,media}=await docParts(d);return fileFromParts(plain,Object.fromEntries(media));}
// the same file from a document in parts (the cloud's, io/cloud-projects.js: "Verini indir" packs every project
// without decoding its images): the plain document plus key -> Blob
async function fileFromParts(plain,blobs){
  const base=Object.assign({app:'mockup-studio'},plain);delete base.media;delete base.images;
  if(zipKeys(Object.keys(blobs))){
    const JSZip=(await import('jszip')).default,zip=new JSZip(),media=[];
    for(const k in blobs){const name='media/'+k+'.'+extOf(blobs[k]);zip.file(name,blobs[k]);media.push(name);}
    zip.file('project.json',JSON.stringify(Object.assign(base,{media})));
    return {blob:await zip.generateAsync({type:'blob',compression:'STORE'}),zip:true};
  }
  const images={};for(const k in blobs)images[k]=await blobToDataUrl(blobs[k]);
  return {blob:new Blob([JSON.stringify(Object.assign(base,{images}))],{type:'application/json'}),zip:false};
}
const isZip=u8=>u8.length>3&&u8[0]===0x50&&u8[1]===0x4b&&u8[2]===3&&u8[3]===4;
// accepts a File / Blob (either format, told apart by its bytes) or the JSON text
async function fromProjectFile(src){
  let text=src,media={};  // media: key -> Blob (zip)
  if(typeof src!=='string'){
    const buf=await src.arrayBuffer();
    if(isZip(new Uint8Array(buf,0,4))){
      const JSZip=(await import('jszip')).default,zip=await JSZip.loadAsync(buf),pj=zip.file('project.json');
      if(!pj)throw new Error('Bu bir mockup stüdyosu proje dosyası değil.');
      text=await pj.async('string');
      for(const f of Object.values(zip.files)){const m=/^media\/([a-z]\d+)\.(\w+)$/.exec(f.name);if(!m||f.dir)continue;
        media[m[1]]=new Blob([await f.async('arraybuffer')],{type:MIME[m[2].toLowerCase()]||'application/octet-stream'});}
    } else text=new TextDecoder().decode(buf);
  }
  const p=JSON.parse(text);
  if(p.app!=='mockup-studio'||!(Array.isArray(p.boards)||Array.isArray(p.devices)))throw new Error('Bu bir mockup stüdyosu proje dosyası değil.');
  const images={};
  // a file whose media cannot be loaded (a broken model, say) still opens: that device shows a placeholder
  const safe=async(src,k)=>{try{return adopt(await loadMedia(src,k),k);}catch(e){console.warn('Medya açılamadı:',k,e);return null;}};
  for(const k in p.images||{}){const m=await safe(p.images[k],k);if(m)images[k]=m;}
  for(const k in media){const m=await safe(URL.createObjectURL(media[k]),k);if(m)images[k]=m;}
  delete p.images;delete p.media;
  return attachImages(asDoc(p),images);
}

/* A document in parts, for the cloud (io/cloud-projects.js): the plain document (as in the autosave: no media, the
   thumbnails along) and its media as [key, Blob]; and back: a plain document plus key -> Blob. */
async function docParts(d){
  const all=docImages(d),media=[];for(const k in all)media.push([k,await imageBlob(all[k])]);
  return {plain:plainDoc(d),media};
}
async function docFromParts(plain,blobs){
  const p=Object.assign({},plain),images={};
  for(const k in blobs){try{images[k]=adopt(await loadMedia(URL.createObjectURL(blobs[k]),k),k);}catch(e){console.warn('Medya açılamadı:',k,e);}}
  delete p.media;delete p.images;delete p.app;
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
    for(const k of data.images||[]){const b=await idb('readonly',st=>st.get('img:'+k));if(!b)continue;stored.add(k);
      try{images[k]=adopt(await loadMedia(URL.createObjectURL(b),k),k);}catch(e){console.warn('Medya açılamadı:',k,e);}}
    delete data.images;
    return attachImages(asDoc(data),images);
  }catch(e){return null;}
}

export {asDoc,autosave,docFromParts,docParts,fileFromParts,needsZip,packAssets,fromProjectFile,loadAutosave,restore,signature,snapshot,toProjectFile};
