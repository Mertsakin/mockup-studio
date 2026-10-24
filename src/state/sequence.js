import {EASE,interp} from './anim.js';

/* The sequence (doc.sequence, ui/boards.js): several artboards in one video, joined by transitions. Plain data, no
   three, no DOM. {loop, clips: [{board}], transitions: [{kind, dur, ease, color?, dir?}]}; transitions[i] joins
   clips[i] and clips[i + 1]. A clip plays its board's own animation for the board's own duration (state.anim.dur);
   a transition of T seconds overlaps the last T seconds of the clip before it and the first T seconds of the clip
   after it (an editing program's rule), so the sequence lasts Σ durations − Σ transitions. A clip's two transitions
   never overlap each other (clampAll). The same board may appear more than once. Kinds: cut (no time), xfade (the
   next scene dissolves in over the previous one), fade (through a colour), slide (the next scene pushes the previous
   one out in a direction), fly (the camera moves from one board's view to the other's while the scenes dissolve:
   mixCam / mixDevs / mixLights below; only between boards of the same environment, flyOk). */
const KINDS={
  cut:{n:'Kesme',dur:0,ease:'linear'},
  xfade:{n:'Çapraz solma',dur:.8,ease:'linear'},
  fade:{n:'Solma',dur:.8,ease:'linear',color:'#000000'},
  slide:{n:'Kaydırma@tr',dur:.8,ease:'smooth',dir:'left'},  // dictionary key with its context (lang.js t strips it)
  fly:{n:'Kamera uçuşu',dur:1,ease:'smooth'}
};
const KIND_IDS=Object.keys(KINDS);
const TR_MIN=.1,TR_DEFAULT='xfade';
const DIRS={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};
const newSequence=()=>({loop:true,clips:[],transitions:[]});
function newTransition(kind){
  const k=KINDS[kind]?kind:TR_DEFAULT,d=KINDS[k],t={kind:k,dur:d.dur,ease:d.ease};
  if(d.color)t.color=d.color;if(d.dir)t.dir=d.dir;return t;
}
// a transition from a file: known fields only, defaults for the rest
function cleanTransition(t){
  const o=newTransition(t&&t.kind);if(!t)return o;
  if(typeof t.dur==='number'&&Number.isFinite(t.dur))o.dur=t.dur;
  if(t.ease&&EASE[t.ease])o.ease=t.ease;
  if(typeof t.color==='string')o.color=t.color;if(DIRS[t.dir])o.dir=t.dir;
  return o;
}
/* A sequence made valid for a document: has(id) says whether a board exists, durOf(id) gives its duration. Clips of
   missing boards go, each taking the transition on its left with it (the one on its right joins the neighbours);
   transitions are clamped. Returns a new object (the stored one is never mutated). */
function normalizeSeq(seq,has,durOf){
  const s=newSequence();if(!seq||typeof seq!=='object')return s;
  s.loop=seq.loop!==false;
  const clips=Array.isArray(seq.clips)?seq.clips:[],trs=Array.isArray(seq.transitions)?seq.transitions:[];
  clips.forEach((c,i)=>{
    if(!c||!has(c.board))return;
    if(s.clips.length)s.transitions.push(cleanTransition(trs[i-1]));
    s.clips.push({board:c.board});
  });
  clampAll(s,durOf);return s;
}
// the longest transition i may be: within both clips, and clear of the clip's other transition
function maxTrDur(s,i,durOf){
  const a=durOf(s.clips[i].board),b=durOf(s.clips[i+1].board),prev=i?s.transitions[i-1].dur:0,next=s.transitions[i+1]?s.transitions[i+1].dur:0;
  return Math.max(TR_MIN,Math.min(a-prev,b-next));
}
function clampAll(s,durOf){
  s.transitions.forEach((t,i)=>{
    if(t.kind==='cut'){t.dur=0;return;}
    const a=durOf(s.clips[i].board),b=durOf(s.clips[i+1].board),prev=i?s.transitions[i-1].dur:0;
    t.dur=Math.round(Math.max(TR_MIN,Math.min(t.dur,a-prev,b))*100)/100;
  });
}
/* Where each clip sits in sequence time: [{i, board, dur, start, end, tin (the transition's overlap on its left), tr}] */
function layoutSeq(s,durOf){
  const out=[];let t=0;
  s.clips.forEach((c,i)=>{
    const dur=durOf(c.board),tr=i?s.transitions[i-1]:null,T=tr&&tr.kind!=='cut'?Math.min(tr.dur,dur,out[i-1].dur):0;
    if(i)t-=T;out.push({i,board:c.board,dur,start:t,end:t+dur,tin:T,tr});t+=dur;
  });
  return out;
}
const seqTotal=L=>L.length?L[L.length-1].end:0;
/* What is on screen at sequence time t: {clip (index of the clip playing), a: {board, t (its local time)}, and, inside
   a transition's window, b: {board, t} with u (0..1 through the window) and tr; outside one b is null. */
function seqAt(L,t){
  if(!L.length)return null;
  t=Math.max(0,Math.min(seqTotal(L),t));
  let i=L.findIndex(c=>t<c.end-1e-9);if(i<0)i=L.length-1;
  const c=L[i],next=L[i+1];
  if(next&&t>=next.start&&next.tin>0){
    const T=next.tin,u=Math.min(1,Math.max(0,(t-next.start)/T));
    return {clip:i,a:{board:c.board,t:t-c.start},b:{board:next.board,t:t-next.start},u,tr:next.tr};
  }
  return {clip:i,a:{board:c.board,t:t-c.start},b:null,u:0,tr:null};
}
const easeOf=tr=>EASE[tr&&tr.ease]||EASE.linear;

/* ---------- the camera flight: values of two snapshots (io/project.js) mixed at u.
   A snapshot stores a target's fields at its design frame and its tracks: valuesOf gives the fields at a time. */
const CAM_KEYS=['rx','ry','rz','zoom','fov','panX','panY','fnum','focusDist'];
const DEV_KEYS=['px','py','pz','rx','ry','rz','scale','lidAngle'];
const LIGHT_KEYS=['az','el','dist','intensity','size','angle','penumbra'];
const ANGLES=new Set(['rx','ry','rz','az']);
function valuesOf(o,keys,t){
  const v={};keys.forEach(k=>{const tr=o.tracks&&o.tracks[k];const x=tr&&tr.length?interp(tr,t):o[k];if(typeof x==='number')v[k]=x;});return v;
}
const camOf=(snap,t)=>Object.assign(valuesOf(snap.state.scene,CAM_KEYS,t),{comp:snap.frame.comp.slice(),fitRadius:snap.frame.fitRadius});
const devsOf=(snap,t)=>snap.devices.map(d=>valuesOf(d,DEV_KEYS,t));
const lightsOf=(snap,t)=>snap.lights.map(L=>valuesOf(L,LIGHT_KEYS,t));
const lerp=(a,b,u)=>a+(b-a)*u;
// angles take the short way round (170° → −170° is a 20° turn)
const lerpA=(a,b,u)=>{const d=((b-a)%360+540)%360-180;return a+d*u;};
function mixVals(A,B,u){
  const o={};for(const k in A){if(typeof B[k]!=='number')continue;o[k]=ANGLES.has(k)?lerpA(A[k],B[k],u):k==='zoom'?Math.exp(lerp(Math.log(A[k]),Math.log(B[k]),u)):lerp(A[k],B[k],u);}
  return o;
}
function mixCam(A,B,u){const o=mixVals(A,B,u);o.comp=A.comp.map((v,i)=>lerp(v,B.comp[i],u));o.fitRadius=lerp(A.fitRadius,B.fitRadius,u);return o;}
const mixList=(A,B,u)=>A.map((a,i)=>mixVals(a,B[i],u));
// the devices of two snapshots match when they are the same types in the same order (then each keeps its place
// while the camera flies: its position, rotation, scale and lid take the values in between)
const devsMatch=(a,b)=>a.devices.length===b.devices.length&&a.devices.every((d,i)=>d.type===b.devices[i].type&&(d.type!=='model'||d.model===b.devices[i].model));
const lightsMatch=(a,b)=>a.lights.length===b.lights.length&&a.lights.every((L,i)=>L.mod===b.lights[i].mod&&L.type===b.lights[i].type);
const envOf=s=>s.state.env||'studio';
// a flight needs one world: the studio (floor, turntable) and space (no floor, free orbit) do not mix
const flyOk=(a,b)=>envOf(a)===envOf(b);
const ENV_NAME={studio:'Stüdyo',space:'Uzay'};

export {CAM_KEYS,DEV_KEYS,DIRS,ENV_NAME,KINDS,KIND_IDS,LIGHT_KEYS,TR_MIN,camOf,cleanTransition,clampAll,devsMatch,devsOf,easeOf,envOf,flyOk,layoutSeq,lightsMatch,lightsOf,maxTrDur,mixCam,mixList,newSequence,newTransition,normalizeSeq,seqAt,seqTotal};
