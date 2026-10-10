import {scrollScreen,setScreenTexture} from '../devices/screen.js';
import {onChange} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {MAX_DUR,halfFrame,hasAnim,keyIn,propsOf,snapT,sortKeys,timesOf,tracked,valuesAt} from '../state/anim.js';
import {state} from '../state/state.js';
import {onBoards} from './boards.js';
import {syncSliders} from './sliders.js';
import {setUi,ui} from './ui-state.js';

/* Animation editing (Canlandır mode). Data: state/anim.js (d.tracks, state.anim).
   The playhead (A.t) is editor state. While a device has tracks its fields (px, ry, lidAngle, scroll…) hold the values
   at the playhead; applyAt writes them. Edits are not hooked control by control: after every change (renderer
   onChange) the fields are compared with what was last applied / seen, so sliders, the gizmo, dragging, the transform
   box, "Zemine oturt"… are all recorded the same way:
   - Canlandır: the changed value gets a key at the playhead (only that value). A value's first key after 0 also gets a
     key at 0 with its previous value, so a change at 2 s animates towards it instead of jumping.
   - Tasarla: an animated value moves as a whole (the change is added to all its keys); others are plain edits. */
const A={t:0,playing:false,sel:null};  // sel: selected key {dev, t, prop|null} (null prop = summary key: every value at t)
const subs=[];
function onAnim(fn){subs.push(fn);}
const emit=()=>subs.forEach(f=>f());
const fps=()=>state.anim.fps||30;
const applied=new Map();  // device id -> {prop: value last applied or seen}

/* ---------- playhead -> fields */
// opts.sync: redraw scrolled screens now (video export) instead of on the next animation frame;
// opts.scroll === false: leave the scroll alone (motion-blur sub-samples within one frame)
function applyAt(t,opts){
  const syncScroll=opts&&opts.sync,doScroll=!(opts&&opts.scroll===false);
  let moved=false;
  state.devices.forEach(d=>{
    const v=valuesAt(d,t),seen=applied.get(d.id)||{};
    for(const k in v){
      if(k==='scroll'){if(doScroll&&Math.abs(d.scroll-v[k])>1e-6){if(syncScroll){d.scroll=v[k];setScreenTexture(d);}else scrollScreen(d,v[k]);}}
      else if(d[k]!==v[k]){d[k]=v[k];moved=true;}
      seen[k]=d[k];
    }
    applied.set(d.id,seen);
  });
  if(moved)applyTransform();
}
function seek(t){if(!Number.isFinite(t))return;A.t=Math.max(0,Math.min(state.anim.dur,t));applyAt(A.t);syncSliders();emit();}

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
function record(d,k,prev,cur){
  if(A.playing)stop();
  d.tracks=d.tracks||{};
  const tr=d.tracks[k];
  if(ui.mode==='animate'){
    const t=snapT(A.t,fps());
    if(!tr||!tr.length){
      const n=d.tracks[k]=[];
      if(t>halfFrame(fps()))n.push({t:0,v:prev,ease:'smooth'});
    }
    const list=d.tracks[k];let key=keyIn(list,t,fps());
    if(!key){key={t,v:cur,ease:'smooth'};list.push(key);sortKeys(list);}
    key.v=cur;A.sel={dev:d.id,t:key.t,prop:null};
  } else if(tr&&tr.length){const dv=cur-prev;tr.forEach(x=>{x.v+=dv;});}
  else return;
  if(!emitQueued){emitQueued=true;requestAnimationFrame(()=>{emitQueued=false;emit();});}
}
let emitQueued=false;

/* ---------- key operations (timeline / inspector) */
const devById=id=>state.devices.find(d=>d.id===id);
// ◆ / K: a full pose: every value of the device keyed at the playhead
function addPoseKey(d){
  if(!d)return;d.tracks=d.tracks||{};const t=snapT(A.t,fps());
  propsOf(d).forEach(k=>{const tr=d.tracks[k]||(d.tracks[k]=[]),ex=keyIn(tr,t,fps());if(ex)ex.v=d[k];else{tr.push({t,v:d[k],ease:'smooth'});sortKeys(tr);}});
  A.sel={dev:d.id,t,prop:null};emit();
}
// the diamond beside a slider: keys that one value at the playhead
function keyProp(d,k){
  if(!d)return;d.tracks=d.tracks||{};const t=snapT(A.t,fps()),tr=d.tracks[k]||(d.tracks[k]=[]),ex=keyIn(tr,t,fps());
  if(ex)ex.v=d[k];else{tr.push({t,v:d[k],ease:'smooth'});sortKeys(tr);}
  A.sel={dev:d.id,t,prop:k};emit();
}
function keysAt(d,t,prop){return (prop?[prop]:tracked(d)).map(k=>keyIn(d.tracks[k],t,fps())).filter(Boolean);}
const selectedKeys=()=>{const s=A.sel,d=s&&devById(s.dev);return d?keysAt(d,s.t,s.prop):[];};
function selectKey(dev,t,prop){A.sel=dev==null?null:{dev,t,prop:prop||null};emit();}
function deleteSelected(){
  const s=A.sel,d=s&&devById(s.dev);if(!d)return false;
  (s.prop?[s.prop]:tracked(d)).forEach(k=>{const tr=d.tracks[k],ex=keyIn(tr,s.t,fps());if(!ex)return;
    // the last key of a value: the value stays where it is, without animation
    if(tr.length===1)delete d.tracks[k];else tr.splice(tr.indexOf(ex),1);});
  A.sel=null;applyAt(A.t);syncSliders();emit();return true;
}
function setEase(e){selectedKeys().forEach(k=>{k.ease=e;});applyAt(A.t);emit();}
// moves the selected keys to time t (not onto another key of the same value)
function moveSelected(t){
  const s=A.sel,d=s&&devById(s.dev);if(!d)return;
  t=Math.max(0,Math.min(state.anim.dur,snapT(t,fps())));
  const ks=keysAt(d,s.t,s.prop),props=s.prop?[s.prop]:tracked(d);
  const clash=props.some(k=>(d.tracks[k]||[]).some(o=>!ks.includes(o)&&Math.abs(o.t-t)<halfFrame(fps())));
  if(clash)return;
  ks.forEach(k=>{k.t=t;});props.forEach(k=>sortKeys(d.tracks[k]));s.t=t;applyAt(A.t);emit();
}
function setDuration(dur){
  const last=Math.max(0,...state.devices.flatMap(timesOf));
  state.anim.dur=Math.max(1,Math.min(MAX_DUR,Math.max(dur,last)));if(A.t>state.anim.dur)seek(state.anim.dur);else emit();
}

/* ---------- presets: write only their own tracks (replacing them), so they combine */
const PRESETS=[
  {id:'rise',n:'Aşağıdan yüksel',hint:'1,2 sn',make:(d,at)=>{const e=at(1.2);return {py:[[0,e.py-6,'back'],[1.2,e.py,'smooth']],scale:[[0,e.scale*.92,'back'],[1.2,e.scale,'smooth']]};}},
  {id:'turn',n:'Döner tabla',hint:'tüm süre',make:(d,at)=>{const a=at(0);return {ry:[[0,a.ry,'linear'],[state.anim.dur,a.ry+360,'linear']]};}},
  {id:'float',n:'Süzülme',hint:'tüm süre',make:(d,at)=>{const a=at(0),py=[],rz=[];for(let i=0;i<=4;i++){const t=state.anim.dur*i/4;py.push([t,a.py+(i%2?.8:0),'smooth']);rz.push([t,a.rz+(i%2?1.2:0),'smooth']);}return {py,rz};}},
  {id:'lid',n:'Kapağı aç',hint:'1,5 sn',ok:d=>d.type==='laptop',make:(d,at)=>({lidAngle:[[0,72,'smooth'],[1.5,Math.max(100,at(1.5).lidAngle),'smooth']]})},
  {id:'scroll',n:'Ekranı kaydır',hint:'0,5 sn – sona',make:()=>({scroll:[[.5,0,'smooth'],[Math.max(1,state.anim.dur-.5),1,'smooth']]})}
];
function applyPreset(id,d){
  const p=PRESETS.find(x=>x.id===id);if(!p||!d||(p.ok&&!p.ok(d)))return [];
  const at=t=>{const v=valuesAt(d,t),o={};propsOf(d).forEach(k=>{o[k]=k in v?v[k]:d[k];});return o;};
  const out=p.make(d,at),over=Object.keys(out).filter(k=>d.tracks&&d.tracks[k]&&d.tracks[k].length>1);
  d.tracks=d.tracks||{};
  for(const k in out)d.tracks[k]=sortKeys(out[k].map(([t,v,e])=>({t:snapT(Math.min(state.anim.dur,t),fps()),v,ease:e})));
  A.sel=null;applyAt(A.t);syncSliders();emit();return over;
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
  setUi({mode:m});document.documentElement.dataset.mode=m;emit();
}
// another board (or undo / open project): fields come from the snapshot (t = 0); show them at the playhead again
onBoards(()=>{
  stop();applied.clear();
  if(A.t>state.anim.dur)A.t=state.anim.dur;
  if(A.sel&&!devById(A.sel.dev))A.sel=null;
  applyAt(A.t);observe();syncSliders();emit();
});

const anyAnim=()=>state.devices.some(hasAnim);
export {A,PRESETS,addPoseKey,keyProp,anyAnim,applyAt,applyPreset,deleteSelected,keysAt,moveSelected,onAnim,play,
  seek,selectKey,selectedKeys,setDuration,setEase,setMode,stop};
