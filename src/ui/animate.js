import {scrollScreen,setScreenTexture} from '../devices/screen.js';
import {followVideos,playVideos,setVideoClock,showFrames,stopVideos} from '../devices/video.js';
import {onChange} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {MAX_DUR,WRAPS,designT,halfFrame,hasAnim,interp,keyIn,kindOf,propsOf,refOf,snapT,sortKeys,timesOf,tracked,valuesAt} from '../state/anim.js';
import {state} from '../state/state.js';
import {onBoards} from './boards.js';
import {onItems,renderItems,setItemClock} from './layout.js';
import {syncSliders} from './sliders.js';
import {setUi,ui} from './ui-state.js';

/* Animation editing. Data: state/anim.js (o.tracks, o.designT, state.anim). Targets are the camera (state.scene), the
   devices, the 2D items (state.items) and the lights; they are told apart by their reference (refOf: 'cam', 'd3',
   'i2', 'l1').
   Tasarla shows every target at its design frame (o.designT, 0 s unless an intro preset moved it to its end): the
   still image, thumbnails and snapshots are that frame. Canlandır shows the playhead (A.t, editor state).
   Edits are not hooked control by control: after every change (renderer onChange for devices, item redraws for items)
   the fields are compared with what was last applied / seen, so sliders, the gizmo, dragging, the transform boxes,
   "Zemine oturt"… record the same way:
   - Tasarla: an animated value's key at the design frame takes the new value (added there if the value has no key at
     that time); its other keys stay. Values without animation are plain edits.
   - Canlandır: the changed value gets a key at the playhead (only that value). A value animated for the first time
     also gets a key at the design frame holding its previous value, so the design frame does not change unless the
     playhead is on it.
   Text effects (it.fx, render/text.js) are not keys: they draw from the time the layout's clock gives (setItemClock).
   The camera and the lights record through the same path: their edits (fields, light map, orbit drag, angle presets)
   end in applyTransform → req, like a device's. */
const A={t:0,playing:false,sel:[]};  // sel: the selected keys, entries {ref, prop, t} (see "key selection" below)
const subs=[];
function onAnim(fn){subs.push(fn);}
const emit=()=>subs.forEach(f=>f());
const fps=()=>state.anim.fps||30;
const applied=new Map();  // target ref -> {prop: value last applied or seen}
// in timeline order: the camera, the devices, the 2D items, the lights
const targets=()=>[state.scene].concat(state.devices,state.items,state.lights);
const byRef=ref=>ref?targets().find(o=>refOf(o)===ref):undefined;
const hasFx=it=>!!(it.fx&&(it.fx.in||it.fx.out||it.fx.loop));

/* ---------- time -> fields */
// t: a time, or a function of the target. opts.sync: redraw scrolled screens now (video export) instead of on the
// next animation frame; opts.scroll === false: leave the scroll alone (motion-blur sub-samples within one frame).
// Screen videos follow the same rule as the scroll (devices/video.js): their frame is seeked asynchronously here
// (the video export awaits showFrames itself), kept while the timeline plays (the videos play on their own then)
function applyAt(t,opts){
  const syncScroll=opts&&opts.sync,doScroll=!(opts&&opts.scroll===false);
  if(doScroll&&!A.playing)showFrames(o=>typeof t==='function'?t(o):t);
  let moved=false,items=false;
  targets().forEach(o=>{
    const ref=refOf(o),v=valuesAt(o,typeof t==='function'?t(o):t),seen=applied.get(ref)||{},item=kindOf(o)==='item';
    for(const k in v){
      if(k==='scroll'){if(doScroll&&Math.abs(o.scroll-v[k])>1e-6){if(syncScroll){o.scroll=v[k];setScreenTexture(o);}else scrollScreen(o,v[k]);}}
      else if(o[k]!==v[k]){o[k]=v[k];if(item)items=true;else moved=true;}
      seen[k]=o[k];
    }
    applied.set(ref,seen);
  });
  if(moved)applyTransform();
  if(items||state.items.some(hasFx))renderItems();
}
// what the current mode shows: the playhead in Canlandır, each target's design frame in Tasarla
const showTime=o=>ui.mode==='animate'?A.t:designT(o);
const applyNow=opts=>applyAt(showTime,opts);
// text effects play in Canlandır only; Tasarla (and the still image) shows the settled text
setItemClock(()=>ui.mode==='animate'?A.t:null);
// screen videos: the playhead's frame in Canlandır, the device's design (poster) frame in Tasarla
setVideoClock(()=>ui.mode==='animate'?A.t:null);
function seek(t){
  if(!Number.isFinite(t))return;A.t=Math.max(0,Math.min(state.anim.dur,t));
  if(ui.mode==='animate'){applyAt(A.t);syncSliders();}
  emit();
}

/* ---------- fields -> keys (recording) */
let observeQueued=false;
function observe(){
  observeQueued=false;
  const refs=new Set();
  targets().forEach(o=>{
    const ref=refOf(o);refs.add(ref);const seen=applied.get(ref);
    if(!seen){const s={};propsOf(o).forEach(k=>{s[k]=o[k];});applied.set(ref,s);return;}
    propsOf(o).forEach(k=>{
      const prev=seen[k],cur=o[k];seen[k]=cur;
      if(prev===undefined||typeof cur!=='number'||Math.abs(cur-prev)<1e-9)return;
      record(o,k,prev,cur);
    });
  });
  applied.forEach((_,ref)=>{if(!refs.has(ref))applied.delete(ref);});
}
const queueObserve=()=>{if(!observeQueued){observeQueued=true;queueMicrotask(observe);}};
onChange.add(queueObserve);onItems(queueObserve);
// writes a field without it counting as an edit (no key): e.g. the focus distance taking over the current focus when
// the focus mode switches to "Uzaklık" (ui/lens-panel.js)
function setQuiet(o,k,v){o[k]=v;const s=applied.get(refOf(o));if(s)s[k]=v;}
// sets (or adds) the key of value k at time t
function put(o,k,t,v){
  o.tracks=o.tracks||{};const tr=o.tracks[k]||(o.tracks[k]=[]);
  let key=keyIn(tr,t,fps());if(!key){key={t,v,ease:'smooth'};tr.push(key);sortKeys(tr);}
  key.v=v;return key;
}
function record(o,k,prev,cur){
  if(A.playing)stop();
  const tr=o.tracks&&o.tracks[k],dt=designT(o);
  if(ui.mode!=='animate'&&!(tr&&tr.length))return;
  // a wrapped angle (the orbit drag and the light map keep them within ±180°): the key takes the turn nearest the
  // previous value, so 170° → −170° is a 20° move, not a 340° one; the field follows (181° renders like −179°)
  if(WRAPS[kindOf(o)].includes(k)){let c=cur;while(c-prev>180)c-=360;while(c-prev<-180)c+=360;
    if(c!==cur){cur=c;o[k]=c;const seen=applied.get(refOf(o));if(seen)seen[k]=c;}}
  if(ui.mode==='animate'){
    const t=snapT(A.t,fps());
    // first key of this value: its design-frame value stays as it was
    if((!tr||!tr.length)&&Math.abs(t-dt)>=halfFrame(fps()))put(o,k,dt,prev);
    const key=put(o,k,t,cur);A.sel=entriesAt(o,key.t,null);
  } else put(o,k,dt,cur);
  if(!emitQueued){emitQueued=true;requestAnimationFrame(()=>{emitQueued=false;emit();});}
}
let emitQueued=false;

/* ---------- key operations (timeline / inspector) */
// ◆ / K: a full pose: every value of the target keyed at the playhead
function addPoseKey(o){
  if(!o)return;const t=snapT(A.t,fps());
  propsOf(o).forEach(k=>put(o,k,t,o[k]));
  A.sel=entriesAt(o,t,null);emit();
}
// the diamond beside a slider: keys that one value at the playhead
function keyProp(o,k){if(!o)return;const t=snapT(A.t,fps());put(o,k,t,o[k]);A.sel=[{ref:refOf(o),prop:k,t}];emit();}
function keysAt(o,t,prop){return (prop?[prop]:tracked(o)).map(k=>keyIn(o.tracks[k],t,fps())).filter(Boolean);}
// the ◆ of a timeline row (and a double-click on a lane): keys the value at the playhead, or removes its key there; on
// a summary row a pose (every value), or, when every animated value already has a key there, removes them all (a
// half-filled diamond, some values keyed, completes the pose)
function toggleKeyAt(o,prop){
  if(!o)return;const t=snapT(A.t,fps()),ks=keysAt(o,t,prop);
  if(ks.length&&(prop||ks.length>=tracked(o).length)){
    (prop?[prop]:tracked(o)).forEach(k=>{const tr=o.tracks[k],key=keyIn(tr,t,fps());if(!key)return;tr.splice(tr.indexOf(key),1);if(!tr.length)delete o.tracks[k];});
    A.sel=A.sel.filter(e=>!(e.ref===refOf(o)&&Math.abs(e.t-t)<halfFrame(fps())&&(!prop||e.prop===prop)));applyNow();syncSliders();emit();
  }else if(prop)keyProp(o,prop);else addPoseKey(o);
}

/* ---------- key selection (editor state): A.sel is a list of value keys {ref, prop, t}. A summary diamond on the
   timeline stands for every value's key at that time (entriesAt). The entries resolve to the key objects on demand
   (selectedKeys), so a restore (undo, another board) keeps the selection as long as those keys still exist. Moving,
   deleting, the ease and the design frame apply to the whole selection. */
const sameKey=(a,b)=>a.ref===b.ref&&a.prop===b.prop&&Math.abs(a.t-b.t)<halfFrame(fps());
// the entries a diamond stands for: one value's key, or (prop null) every value's key at t
function entriesAt(o,t,prop){return (prop?[prop]:tracked(o)).filter(k=>keyIn(o.tracks[k],t,fps())).map(k=>({ref:refOf(o),prop:k,t}));}
const isSelected=(ref,t,prop)=>A.sel.some(e=>sameKey(e,{ref,prop,t}));
// selects a diamond's keys: mode 'set' (default) replaces the selection, 'add' adds, 'toggle' adds or removes them;
// ref null clears
function selectKey(ref,t,prop,mode){
  if(ref==null){if(A.sel.length){A.sel=[];emit();}return;}
  const o=byRef(ref);if(!o)return;const es=entriesAt(o,t,prop);
  if(mode==='toggle'){if(es.length&&es.every(e=>isSelected(e.ref,e.t,e.prop)))A.sel=A.sel.filter(s=>!es.some(e=>sameKey(e,s)));else es.forEach(e=>{if(!isSelected(e.ref,e.t,e.prop))A.sel.push(e);});}
  else if(mode==='add')es.forEach(e=>{if(!isSelected(e.ref,e.t,e.prop))A.sel.push(e);});
  else A.sel=es;
  emit();
}
function selectKeys(list){A.sel=list.slice();emit();}
function selectAllKeys(o){if(!o)return;A.sel=tracked(o).flatMap(k=>o.tracks[k].map(x=>({ref:refOf(o),prop:k,t:x.t})));emit();}
// the selected keys that still exist: [{o, prop, key}]
function selectedKeys(){const out=[];A.sel.forEach(e=>{const o=byRef(e.ref),key=o&&o.tracks&&o.tracks[e.prop]&&keyIn(o.tracks[e.prop],e.t,fps());if(key)out.push({o,prop:e.prop,key});});return out;}
function deleteSelected(){
  const ks=selectedKeys();if(!ks.length)return false;
  ks.forEach(({o,prop,key})=>{const tr=o.tracks[prop];if(!tr)return;const i=tr.indexOf(key);if(i>=0)tr.splice(i,1);
    // the last key of a value: the value stays where it is, without animation
    if(!tr.length)delete o.tracks[prop];});
  A.sel=[];applyNow();syncSliders();emit();return true;
}
function setEase(e){selectedKeys().forEach(x=>{x.key.ease=e;});applyNow();emit();}
// moves the selected keys by dt seconds, together (snapped to frames, kept within the duration, never onto another
// key of the same value: then nothing moves). A target's design frame moves along when every key it has at that
// time is in the selection. Returns the dt applied.
function moveSelected(dt){
  const ks=selectedKeys();if(!ks.length)return 0;
  const ts=ks.map(x=>x.key.t),hf=halfFrame(fps());
  dt=snapT(Math.max(-Math.min(...ts),Math.min(state.anim.dur-Math.max(...ts),dt)),fps());
  if(Math.abs(dt)<1e-9)return 0;
  const moving=new Set(ks.map(x=>x.key));
  if(ks.some(({o,prop,key})=>o.tracks[prop].some(x=>!moving.has(x)&&Math.abs(x.t-(key.t+dt))<hf)))return 0;
  const owners=new Set(ks.map(x=>x.o));
  owners.forEach(o=>{const at=keysAt(o,designT(o),null);if(at.length&&at.every(k=>moving.has(k)))o.designT=snapT(designT(o)+dt,fps());});
  ks.forEach(({key})=>{key.t=snapT(key.t+dt,fps());});
  owners.forEach(o=>tracked(o).forEach(k=>sortKeys(o.tracks[k])));
  A.sel.forEach(e=>{e.t=snapT(e.t+dt,fps());});applyNow();emit();return dt;
}
// makes the selected keys' time the design frame of their target (what Tasarla and the still image show); only when
// the selection sits at one time
function setDesignFrame(){const ks=selectedKeys();if(!ks.length)return;const ts=ks.map(x=>x.key.t);if(Math.max(...ts)-Math.min(...ts)>=halfFrame(fps()))return;
  new Set(ks.map(x=>x.o)).forEach(o=>{o.designT=ts[0];});emit();}
// the latest time anything happens: keys, design frames, text effects
const fxEnd=it=>Math.max(0,...['in','out'].map(k=>it.fx&&it.fx[k]?it.fx[k].t+it.fx[k].dur:0));
function setDuration(dur){
  const last=Math.max(0,...targets().flatMap(o=>timesOf(o).concat([designT(o)])),...state.items.map(fxEnd));
  state.anim.dur=Math.max(1,Math.min(MAX_DUR,Math.max(dur,last)));if(A.t>state.anim.dur)seek(state.anim.dur);else emit();
}

/* ---------- presets: write only their own tracks (replacing them), so they combine. D = the design frame's values.
   Intros (rise, lid, the items' entrances) end on the design values and move the design frame to their end (the
   target's other motions get a key there with the design values); the others are shifted so the design frame keeps its
   values (the screenshot scroll is the preset's own). */
const PRESETS=[
  {id:'rise',n:'Aşağıdan yüksel',hint:'1,2 sn',end:1.2,make:D=>({py:[[0,D.py-6,'back'],[1.2,D.py,'smooth']],scale:[[0,D.scale*.92,'back'],[1.2,D.scale,'smooth']]})},
  {id:'turn',n:'Döner tabla',hint:'tüm süre',make:D=>({ry:[[0,D.ry,'linear'],[state.anim.dur,D.ry+360,'linear']]})},
  {id:'float',n:'Süzülme',hint:'tüm süre',make:D=>{const py=[],rz=[];for(let i=0;i<=4;i++){const t=state.anim.dur*i/4;py.push([t,D.py+(i%2?.8:0),'smooth']);rz.push([t,D.rz+(i%2?1.2:0),'smooth']);}return {py,rz};}},
  {id:'lid',n:'Kapağı aç',hint:'1,5 sn',end:1.5,ok:d=>d.type==='laptop',make:D=>({lidAngle:[[0,72,'smooth'],[1.5,Math.max(100,D.lidAngle),'smooth']]})},
  {id:'scroll',n:'Ekranı kaydır',hint:'0,5 sn – sona',ok:d=>!d.video&&d.type!=='model',make:()=>({scroll:[[.5,0,'smooth'],[Math.max(1,state.anim.dur-.5),1,'smooth']]})},
  // free motion (best in Uzay, where nothing has to stay on a floor): a slow tumble over two axes, and a full turn with
  // the device tilting towards and away from the camera
  {id:'tumble',n:'Serbest takla',hint:'tüm süre',make:D=>({rx:[[0,D.rx,'linear'],[state.anim.dur,D.rx+360,'linear']],ry:[[0,D.ry,'linear'],[state.anim.dur,D.ry+180,'linear']]})},
  {id:'orbit',n:'Yörünge turu',hint:'tüm süre',make:D=>{const rx=[];for(let i=0;i<=4;i++)rx.push([state.anim.dur*i/4,D.rx+(i%2?22:0),'smooth']);return {ry:[[0,D.ry,'linear'],[state.anim.dur,D.ry+360,'linear']],rx};}}
];
// 2D items (logos, badges, text blocks as a whole; text effects animate the letters themselves)
const sizeKey=o=>o.kind==='text'?'size':'w';
const ITEM_PRESETS=[
  {id:'i-fade',n:'Solarak gel',hint:'0,8 sn',end:.8,make:D=>({opacity:[[0,0,'smooth'],[.8,D.opacity,'smooth']]})},
  {id:'i-rise',n:'Alttan gel',hint:'1 sn',end:1,make:D=>({y:[[0,D.y+.06,'out'],[1,D.y,'smooth']],opacity:[[0,0,'smooth'],[.6,D.opacity,'smooth']]})},
  {id:'i-slide',n:'Soldan kay',hint:'1 sn',end:1,make:D=>({x:[[0,D.x-.12,'out'],[1,D.x,'smooth']],opacity:[[0,0,'smooth'],[.6,D.opacity,'smooth']]})},
  {id:'i-pop',n:'Büyüyerek gel',hint:'0,8 sn',end:.8,make:(D,o)=>({[sizeKey(o)]:[[0,D[sizeKey(o)]*.4,'back'],[.8,D[sizeKey(o)],'smooth']],opacity:[[0,0,'smooth'],[.3,D.opacity,'smooth']]})},
  {id:'i-float',n:'Süzülme',hint:'tüm süre',make:D=>{const y=[];for(let i=0;i<=4;i++)y.push([state.anim.dur*i/4,D.y+(i%2?.012:0),'smooth']);return {y};}}
];
// the camera: the whole view moves (a push-in intro ends on the framed shot; the slow moves keep the design frame)
const CAM_PRESETS=[
  {id:'c-push',n:'Yaklaşarak gir',hint:'1,5 sn',end:1.5,make:D=>({zoom:[[0,D.zoom*.8,'smooth'],[1.5,D.zoom,'smooth']]})},
  {id:'c-drift',n:'Yavaş yaklaşma',hint:'tüm süre',make:D=>({zoom:[[0,D.zoom,'linear'],[state.anim.dur,D.zoom*1.15,'linear']]})},
  {id:'c-sweep',n:'Hafif dönüş',hint:'tüm süre',make:D=>({ry:[[0,D.ry,'linear'],[state.anim.dur,D.ry+20,'linear']]})},
  {id:'c-orbit',n:'Yörünge turu',hint:'tüm süre',make:D=>({ry:[[0,D.ry,'linear'],[state.anim.dur,D.ry+360,'linear']]})},
  {id:'c-float',n:'Süzülme',hint:'tüm süre',make:D=>{const rx=[],ry=[];for(let i=0;i<=4;i++){const t=state.anim.dur*i/4;rx.push([t,D.rx+(i%2?2:0),'smooth']);ry.push([t,D.ry+(i%2?-3:0),'smooth']);}return {rx,ry};}}
];
// a light: fades, a walk around the subject, a pulse
const LIGHT_ANIM=[
  {id:'l-fade',n:'Solarak yan',hint:'1 sn',end:1,make:D=>({intensity:[[0,0,'smooth'],[1,D.intensity,'smooth']]})},
  {id:'l-sweep',n:'Yandan geç',hint:'tüm süre',make:D=>({az:[[0,D.az,'linear'],[state.anim.dur,D.az+60,'linear']]})},
  {id:'l-orbit',n:'Işık turu',hint:'tüm süre',make:D=>({az:[[0,D.az,'linear'],[state.anim.dur,D.az+360,'linear']]})},
  {id:'l-pulse',n:'Nabız',hint:'tüm süre',make:D=>{const v=[];for(let i=0;i<=4;i++)v.push([state.anim.dur*i/4,D.intensity*(i%2?.6:1),'smooth']);return {intensity:v};}}
];
const presetsFor=o=>{switch(o?kindOf(o):'device'){case 'camera':return CAM_PRESETS;case 'light':return LIGHT_ANIM;case 'item':return ITEM_PRESETS;default:return PRESETS;}};
function applyPreset(id,o){
  const p=presetsFor(o).find(x=>x.id===id);if(!p||!o||(p.ok&&!p.ok(o)))return [];
  const v=valuesAt(o,designT(o)),D={};propsOf(o).forEach(k=>{D[k]=k in v?v[k]:o[k];});
  const out=p.make(D,o),over=Object.keys(out).filter(k=>o.tracks&&o.tracks[k]&&o.tracks[k].length>1);
  o.tracks=o.tracks||{};
  const dt0=designT(o);if(p.end)o.designT=Math.max(dt0,Math.min(state.anim.dur,p.end));
  const dt=designT(o);
  // the design frame moved: the target's other motions get a key there holding the design values (their own keys stay)
  if(dt!==dt0)tracked(o).forEach(k=>{if(k in out||k==='scroll'||keyIn(o.tracks[k],dt,fps()))return;put(o,k,dt,D[k]);});
  for(const k in out){
    const tr=sortKeys(out[k].map(([t,val,e])=>({t:snapT(Math.min(state.anim.dur,t),fps()),v:val,ease:e})));
    if(k!=='scroll'){const off=D[k]-interp(tr,dt);if(Math.abs(off)>1e-9)tr.forEach(x=>{x.v+=off;});}
    o.tracks[k]=tr;
  }
  A.sel=[];applyNow();syncSliders();emit();return over;
}

/* ---------- playback (real time; the preview renders one sample per frame) */
let raf=0,last=0;
function play(){
  if(A.playing){stop();return;}
  A.playing=true;if(A.t>=state.anim.dur-1e-6)A.t=0;last=performance.now();
  playVideos(A.t);
  const tick=now=>{
    if(!A.playing)return;
    let t=A.t+(now-last)/1000;last=now;
    if(t>=state.anim.dur){if(state.anim.loop)t%=state.anim.dur;else{t=state.anim.dur;A.playing=false;}}
    seek(t);
    if(A.playing){followVideos(t);raf=requestAnimationFrame(tick);}else stopVideos(t);
  };
  raf=requestAnimationFrame(tick);emit();
}
function stop(){if(!A.playing)return;A.playing=false;cancelAnimationFrame(raf);stopVideos(A.t);emit();}

/* ---------- mode */
function setMode(m){
  if(ui.mode===m)return;stop();if(m!=='animate')A.sel=[];
  setUi({mode:m});document.documentElement.dataset.mode=m;applyNow();renderItems();syncSliders();emit();
}
// another board (or undo / open project): fields come from the snapshot (design frame); show what the mode shows
onBoards(()=>{
  stop();applied.clear();
  if(A.t>state.anim.dur)A.t=state.anim.dur;
  A.sel=A.sel.filter(e=>{const o=byRef(e.ref);return !!(o&&o.tracks&&o.tracks[e.prop]&&keyIn(o.tracks[e.prop],e.t,fps()));});
  applyNow();observe();syncSliders();emit();
});

const anyAnim=()=>targets().some(hasAnim)||state.items.some(hasFx);
export {A,CAM_PRESETS,ITEM_PRESETS,LIGHT_ANIM,PRESETS,addPoseKey,anyAnim,applyAt,applyNow,applyPreset,byRef,deleteSelected,entriesAt,hasFx,isSelected,keyProp,keysAt,moveSelected,
  onAnim,play,presetsFor,seek,selectAllKeys,selectKey,selectKeys,selectedKeys,setDesignFrame,setDuration,setEase,setMode,setQuiet,stop,targets,toggleKeyAt};
