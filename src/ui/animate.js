import {scrollScreen,setScreenTexture} from '../devices/screen.js';
import {onChange} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {MAX_DUR,designT,halfFrame,hasAnim,interp,isDevice,keyIn,propsOf,refOf,snapT,sortKeys,timesOf,tracked,valuesAt} from '../state/anim.js';
import {state} from '../state/state.js';
import {onBoards} from './boards.js';
import {onItems,renderItems,setItemClock} from './layout.js';
import {syncSliders} from './sliders.js';
import {setUi,ui} from './ui-state.js';

/* Animation editing. Data: state/anim.js (o.tracks, o.designT, state.anim). Targets are the devices and the 2D items
   (state.items); they are told apart by their reference (refOf: 'd3', 'i2').
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
   Text effects (it.fx, render/text.js) are not keys: they draw from the time the layout's clock gives (setItemClock). */
const A={t:0,playing:false,sel:null};  // sel: selected key {ref, t, prop|null} (null prop = summary key: every value at t)
const subs=[];
function onAnim(fn){subs.push(fn);}
const emit=()=>subs.forEach(f=>f());
const fps=()=>state.anim.fps||30;
const applied=new Map();  // target ref -> {prop: value last applied or seen}
const targets=()=>state.devices.concat(state.items);
const byRef=ref=>ref?targets().find(o=>refOf(o)===ref):undefined;
const hasFx=it=>!!(it.fx&&(it.fx.in||it.fx.out||it.fx.loop));

/* ---------- time -> fields */
// t: a time, or a function of the target. opts.sync: redraw scrolled screens now (video export) instead of on the
// next animation frame; opts.scroll === false: leave the scroll alone (motion-blur sub-samples within one frame)
function applyAt(t,opts){
  const syncScroll=opts&&opts.sync,doScroll=!(opts&&opts.scroll===false);
  let moved=false,items=false;
  targets().forEach(o=>{
    const ref=refOf(o),v=valuesAt(o,typeof t==='function'?t(o):t),seen=applied.get(ref)||{},dev=isDevice(o);
    for(const k in v){
      if(k==='scroll'){if(doScroll&&Math.abs(o.scroll-v[k])>1e-6){if(syncScroll){o.scroll=v[k];setScreenTexture(o);}else scrollScreen(o,v[k]);}}
      else if(o[k]!==v[k]){o[k]=v[k];if(dev)moved=true;else items=true;}
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
// sets (or adds) the key of value k at time t
function put(o,k,t,v){
  o.tracks=o.tracks||{};const tr=o.tracks[k]||(o.tracks[k]=[]);
  let key=keyIn(tr,t,fps());if(!key){key={t,v,ease:'smooth'};tr.push(key);sortKeys(tr);}
  key.v=v;return key;
}
function record(o,k,prev,cur){
  if(A.playing)stop();
  const tr=o.tracks&&o.tracks[k],dt=designT(o);
  if(ui.mode==='animate'){
    const t=snapT(A.t,fps());
    // first key of this value: its design-frame value stays as it was
    if((!tr||!tr.length)&&Math.abs(t-dt)>=halfFrame(fps()))put(o,k,dt,prev);
    const key=put(o,k,t,cur);A.sel={ref:refOf(o),t:key.t,prop:null};
  } else if(tr&&tr.length)put(o,k,dt,cur);
  else return;
  if(!emitQueued){emitQueued=true;requestAnimationFrame(()=>{emitQueued=false;emit();});}
}
let emitQueued=false;

/* ---------- key operations (timeline / inspector) */
// ◆ / K: a full pose: every value of the target keyed at the playhead
function addPoseKey(o){
  if(!o)return;const t=snapT(A.t,fps());
  propsOf(o).forEach(k=>put(o,k,t,o[k]));
  A.sel={ref:refOf(o),t,prop:null};emit();
}
// the diamond beside a slider: keys that one value at the playhead
function keyProp(o,k){if(!o)return;const t=snapT(A.t,fps());put(o,k,t,o[k]);A.sel={ref:refOf(o),t,prop:k};emit();}
function keysAt(o,t,prop){return (prop?[prop]:tracked(o)).map(k=>keyIn(o.tracks[k],t,fps())).filter(Boolean);}
const selectedKeys=()=>{const s=A.sel,o=s&&byRef(s.ref);return o?keysAt(o,s.t,s.prop):[];};
function selectKey(ref,t,prop){A.sel=ref==null?null:{ref,t,prop:prop||null};emit();}
function deleteSelected(){
  const s=A.sel,o=s&&byRef(s.ref);if(!o)return false;
  (s.prop?[s.prop]:tracked(o)).forEach(k=>{const tr=o.tracks[k],ex=keyIn(tr,s.t,fps());if(!ex)return;
    // the last key of a value: the value stays where it is, without animation
    if(tr.length===1)delete o.tracks[k];else tr.splice(tr.indexOf(ex),1);});
  A.sel=null;applyNow();syncSliders();emit();return true;
}
function setEase(e){selectedKeys().forEach(k=>{k.ease=e;});applyNow();emit();}
// moves the selected keys to time t (not onto another key of the same value); the design frame moves with its keys
function moveSelected(t){
  const s=A.sel,o=s&&byRef(s.ref);if(!o)return;
  t=Math.max(0,Math.min(state.anim.dur,snapT(t,fps())));
  const ks=keysAt(o,s.t,s.prop),props=s.prop?[s.prop]:tracked(o);
  const clash=props.some(k=>(o.tracks[k]||[]).some(x=>!ks.includes(x)&&Math.abs(x.t-t)<halfFrame(fps())));
  if(clash)return;
  if(!s.prop&&Math.abs(designT(o)-s.t)<halfFrame(fps()))o.designT=t;
  ks.forEach(k=>{k.t=t;});props.forEach(k=>sortKeys(o.tracks[k]));s.t=t;applyNow();emit();
}
// makes the selected key's time the target's design frame (what Tasarla and the still image show)
function setDesignFrame(){const s=A.sel,o=s&&byRef(s.ref);if(!o)return;o.designT=s.t;emit();}
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
  {id:'scroll',n:'Ekranı kaydır',hint:'0,5 sn – sona',make:()=>({scroll:[[.5,0,'smooth'],[Math.max(1,state.anim.dur-.5),1,'smooth']]})},
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
const presetsFor=o=>o&&!isDevice(o)?ITEM_PRESETS:PRESETS;
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
  A.sel=null;applyNow();syncSliders();emit();return over;
}

/* ---------- playback (real time; the preview renders one sample per frame) */
let raf=0,last=0;
function play(){
  if(A.playing){stop();return;}
  A.playing=true;if(A.t>=state.anim.dur-1e-6)A.t=0;last=performance.now();
  const tick=now=>{
    if(!A.playing)return;
    let t=A.t+(now-last)/1000;last=now;
    if(t>=state.anim.dur){if(state.anim.loop)t%=state.anim.dur;else{t=state.anim.dur;A.playing=false;}}
    seek(t);if(A.playing)raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);emit();
}
function stop(){if(!A.playing)return;A.playing=false;cancelAnimationFrame(raf);emit();}

/* ---------- mode */
function setMode(m){
  if(ui.mode===m)return;stop();if(m!=='animate')A.sel=null;
  setUi({mode:m});document.documentElement.dataset.mode=m;applyNow();renderItems();syncSliders();emit();
}
// another board (or undo / open project): fields come from the snapshot (design frame); show what the mode shows
onBoards(()=>{
  stop();applied.clear();
  if(A.t>state.anim.dur)A.t=state.anim.dur;
  if(A.sel&&!byRef(A.sel.ref))A.sel=null;
  applyNow();observe();syncSliders();emit();
});

const anyAnim=()=>targets().some(hasAnim)||state.items.some(hasFx);
export {A,ITEM_PRESETS,PRESETS,addPoseKey,anyAnim,applyAt,applyNow,applyPreset,byRef,deleteSelected,hasFx,keyProp,keysAt,moveSelected,
  onAnim,play,presetsFor,seek,selectKey,selectedKeys,setDesignFrame,setDuration,setEase,setMode,stop};
