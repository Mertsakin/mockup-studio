import {scrollScreen,setScreenTexture} from '../devices/screen.js';
import {onChange} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {MAX_DUR,designT,halfFrame,hasAnim,interp,keyIn,propsOf,snapT,sortKeys,timesOf,tracked,valuesAt} from '../state/anim.js';
import {state} from '../state/state.js';
import {onBoards} from './boards.js';
import {syncSliders} from './sliders.js';
import {setUi,ui} from './ui-state.js';

/* Animation editing. Data: state/anim.js (d.tracks, d.designT, state.anim).
   Tasarla shows every device at its design frame (d.designT, 0 s unless an intro preset moved it to its end): the
   still image, thumbnails and snapshots are that frame. Canlandır shows the playhead (A.t, editor state).
   Edits are not hooked control by control: after every change (renderer onChange) the fields are compared with what
   was last applied / seen, so sliders, the gizmo, dragging, the transform box, "Zemine oturt"… record the same way:
   - Tasarla: an animated value's key at the design frame takes the new value (added there if the value has no key at
     that time); its other keys stay. Values without animation are plain edits.
   - Canlandır: the changed value gets a key at the playhead (only that value). A value animated for the first time
     also gets a key at the design frame holding its previous value, so the design frame does not change unless the
     playhead is on it. */
const A={t:0,playing:false,sel:null};  // sel: selected key {dev, t, prop|null} (null prop = summary key: every value at t)
const subs=[];
function onAnim(fn){subs.push(fn);}
const emit=()=>subs.forEach(f=>f());
const fps=()=>state.anim.fps||30;
const applied=new Map();  // device id -> {prop: value last applied or seen}

/* ---------- time -> fields */
// t: a time, or a function of the device. opts.sync: redraw scrolled screens now (video export) instead of on the
// next animation frame; opts.scroll === false: leave the scroll alone (motion-blur sub-samples within one frame)
function applyAt(t,opts){
  const syncScroll=opts&&opts.sync,doScroll=!(opts&&opts.scroll===false);
  let moved=false;
  state.devices.forEach(d=>{
    const v=valuesAt(d,typeof t==='function'?t(d):t),seen=applied.get(d.id)||{};
    for(const k in v){
      if(k==='scroll'){if(doScroll&&Math.abs(d.scroll-v[k])>1e-6){if(syncScroll){d.scroll=v[k];setScreenTexture(d);}else scrollScreen(d,v[k]);}}
      else if(d[k]!==v[k]){d[k]=v[k];moved=true;}
      seen[k]=d[k];
    }
    applied.set(d.id,seen);
  });
  if(moved)applyTransform();
}
// what the current mode shows: the playhead in Canlandır, each device's design frame in Tasarla
const showTime=d=>ui.mode==='animate'?A.t:designT(d);
const applyNow=opts=>applyAt(showTime,opts);
function seek(t){
  if(!Number.isFinite(t))return;A.t=Math.max(0,Math.min(state.anim.dur,t));
  if(ui.mode==='animate'){applyAt(A.t);syncSliders();}
  emit();
}

/* ---------- fields -> keys (recording) */
let observeQueued=false;
function observe(){
  observeQueued=false;
  const ids=new Set();
  state.devices.forEach(d=>{
    ids.add(d.id);const seen=applied.get(d.id);
    if(!seen){const o={};propsOf(d).forEach(k=>{o[k]=d[k];});applied.set(d.id,o);return;}
    propsOf(d).forEach(k=>{
      const prev=seen[k],cur=d[k];seen[k]=cur;
      if(prev===undefined||typeof cur!=='number'||Math.abs(cur-prev)<1e-9)return;
      record(d,k,prev,cur);
    });
  });
  applied.forEach((_,id)=>{if(!ids.has(id))applied.delete(id);});
}
onChange.add(()=>{if(!observeQueued){observeQueued=true;queueMicrotask(observe);}});
// sets (or adds) the key of value k at time t
function put(d,k,t,v){
  d.tracks=d.tracks||{};const tr=d.tracks[k]||(d.tracks[k]=[]);
  let key=keyIn(tr,t,fps());if(!key){key={t,v,ease:'smooth'};tr.push(key);sortKeys(tr);}
  key.v=v;return key;
}
function record(d,k,prev,cur){
  if(A.playing)stop();
  const tr=d.tracks&&d.tracks[k],dt=designT(d);
  if(ui.mode==='animate'){
    const t=snapT(A.t,fps());
    // first key of this value: its design-frame value stays as it was
    if((!tr||!tr.length)&&Math.abs(t-dt)>=halfFrame(fps()))put(d,k,dt,prev);
    const key=put(d,k,t,cur);A.sel={dev:d.id,t:key.t,prop:null};
  } else if(tr&&tr.length)put(d,k,dt,cur);
  else return;
  if(!emitQueued){emitQueued=true;requestAnimationFrame(()=>{emitQueued=false;emit();});}
}
let emitQueued=false;

/* ---------- key operations (timeline / inspector) */
const devById=id=>state.devices.find(d=>d.id===id);
// ◆ / K: a full pose: every value of the device keyed at the playhead
function addPoseKey(d){
  if(!d)return;const t=snapT(A.t,fps());
  propsOf(d).forEach(k=>put(d,k,t,d[k]));
  A.sel={dev:d.id,t,prop:null};emit();
}
// the diamond beside a slider: keys that one value at the playhead
function keyProp(d,k){if(!d)return;const t=snapT(A.t,fps());put(d,k,t,d[k]);A.sel={dev:d.id,t,prop:k};emit();}
function keysAt(d,t,prop){return (prop?[prop]:tracked(d)).map(k=>keyIn(d.tracks[k],t,fps())).filter(Boolean);}
const selectedKeys=()=>{const s=A.sel,d=s&&devById(s.dev);return d?keysAt(d,s.t,s.prop):[];};
function selectKey(dev,t,prop){A.sel=dev==null?null:{dev,t,prop:prop||null};emit();}
function deleteSelected(){
  const s=A.sel,d=s&&devById(s.dev);if(!d)return false;
  (s.prop?[s.prop]:tracked(d)).forEach(k=>{const tr=d.tracks[k],ex=keyIn(tr,s.t,fps());if(!ex)return;
    // the last key of a value: the value stays where it is, without animation
    if(tr.length===1)delete d.tracks[k];else tr.splice(tr.indexOf(ex),1);});
  A.sel=null;applyNow();syncSliders();emit();return true;
}
function setEase(e){selectedKeys().forEach(k=>{k.ease=e;});applyNow();emit();}
// moves the selected keys to time t (not onto another key of the same value); the design frame moves with its keys
function moveSelected(t){
  const s=A.sel,d=s&&devById(s.dev);if(!d)return;
  t=Math.max(0,Math.min(state.anim.dur,snapT(t,fps())));
  const ks=keysAt(d,s.t,s.prop),props=s.prop?[s.prop]:tracked(d);
  const clash=props.some(k=>(d.tracks[k]||[]).some(o=>!ks.includes(o)&&Math.abs(o.t-t)<halfFrame(fps())));
  if(clash)return;
  if(!s.prop&&Math.abs(designT(d)-s.t)<halfFrame(fps()))d.designT=t;
  ks.forEach(k=>{k.t=t;});props.forEach(k=>sortKeys(d.tracks[k]));s.t=t;applyNow();emit();
}
// makes the selected key's time the device's design frame (what Tasarla and the still image show)
function setDesignFrame(){const s=A.sel,d=s&&devById(s.dev);if(!d)return;d.designT=s.t;emit();}
function setDuration(dur){
  const last=Math.max(0,...state.devices.flatMap(d=>timesOf(d).concat([designT(d)])));
  state.anim.dur=Math.max(1,Math.min(MAX_DUR,Math.max(dur,last)));if(A.t>state.anim.dur)seek(state.anim.dur);else emit();
}

/* ---------- presets: write only their own tracks (replacing them), so they combine. D = the design frame's values.
   Intros (rise, lid) end on the design values and move the design frame to their end (the device's other motions get a
   key there with the design values); the others are shifted so the design frame keeps its values (the screenshot
   scroll is the preset's own). */
const PRESETS=[
  {id:'rise',n:'Aşağıdan yüksel',hint:'1,2 sn',end:1.2,make:D=>({py:[[0,D.py-6,'back'],[1.2,D.py,'smooth']],scale:[[0,D.scale*.92,'back'],[1.2,D.scale,'smooth']]})},
  {id:'turn',n:'Döner tabla',hint:'tüm süre',make:D=>({ry:[[0,D.ry,'linear'],[state.anim.dur,D.ry+360,'linear']]})},
  {id:'float',n:'Süzülme',hint:'tüm süre',make:D=>{const py=[],rz=[];for(let i=0;i<=4;i++){const t=state.anim.dur*i/4;py.push([t,D.py+(i%2?.8:0),'smooth']);rz.push([t,D.rz+(i%2?1.2:0),'smooth']);}return {py,rz};}},
  {id:'lid',n:'Kapağı aç',hint:'1,5 sn',end:1.5,ok:d=>d.type==='laptop',make:D=>({lidAngle:[[0,72,'smooth'],[1.5,Math.max(100,D.lidAngle),'smooth']]})},
  {id:'scroll',n:'Ekranı kaydır',hint:'0,5 sn – sona',make:()=>({scroll:[[.5,0,'smooth'],[Math.max(1,state.anim.dur-.5),1,'smooth']]})}
];
function applyPreset(id,d){
  const p=PRESETS.find(x=>x.id===id);if(!p||!d||(p.ok&&!p.ok(d)))return [];
  const v=valuesAt(d,designT(d)),D={};propsOf(d).forEach(k=>{D[k]=k in v?v[k]:d[k];});
  const out=p.make(D),over=Object.keys(out).filter(k=>d.tracks&&d.tracks[k]&&d.tracks[k].length>1);
  d.tracks=d.tracks||{};
  const dt0=designT(d);if(p.end)d.designT=Math.max(dt0,Math.min(state.anim.dur,p.end));
  const dt=designT(d);
  // the design frame moved: the device's other motions get a key there holding the design values (their own keys stay)
  if(dt!==dt0)tracked(d).forEach(k=>{if(k in out||k==='scroll'||keyIn(d.tracks[k],dt,fps()))return;put(d,k,dt,D[k]);});
  for(const k in out){
    const tr=sortKeys(out[k].map(([t,val,e])=>({t:snapT(Math.min(state.anim.dur,t),fps()),v:val,ease:e})));
    if(k!=='scroll'){const off=D[k]-interp(tr,dt);if(Math.abs(off)>1e-9)tr.forEach(x=>{x.v+=off;});}
    d.tracks[k]=tr;
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
  setUi({mode:m});document.documentElement.dataset.mode=m;applyNow();syncSliders();emit();
}
// another board (or undo / open project): fields come from the snapshot (design frame); show what the mode shows
onBoards(()=>{
  stop();applied.clear();
  if(A.t>state.anim.dur)A.t=state.anim.dur;
  if(A.sel&&!devById(A.sel.dev))A.sel=null;
  applyNow();observe();syncSliders();emit();
});

const anyAnim=()=>state.devices.some(hasAnim);
export {A,PRESETS,addPoseKey,anyAnim,applyAt,applyNow,applyPreset,deleteSelected,keyProp,keysAt,moveSelected,onAnim,play,
  seek,selectKey,selectedKeys,setDesignFrame,setDuration,setEase,setMode,stop};
