import {LRT} from '../lights/runtime.js';
import {renderNow} from '../render/accumulation.js';
import {overlays,renderer,req,setCrop} from '../render/renderer.js';
import {addFontFace} from '../render/text.js';
import {applyTransform} from '../render/transform.js';
import {asDoc,packAssets,restore,signature,snapshot} from '../io/project.js';
import {state,view} from '../state/state.js';
import {bgCss,invalidateLayout,layout,paintBg,paintItems} from './layout.js';
import {syncAll} from './sync.js';
import {newSequence,normalizeSeq} from '../state/sequence.js';
import {mkCanvas} from '../util.js';

/* Artboards. The document is a list of boards, each a full scene snapshot (devices, lights, camera, background, size)
   with a position on the canvas. Only the active board is live: its data is the studio `state` and the WebGL canvas
   draws it. The others show a thumbnail of their last render. Switching boards stores the live scene back into its
   board (snapshot + thumbnail) and restores the target's snapshot, so every existing panel keeps working unchanged.
   Board positions and sizes are in output pixels (1920 x 1080 board = 1920 x 1080 canvas units). */
const GAP=160;
// assets: the document's asset library [{img, name}] (ui/assets.js); fonts: uploaded fonts [{family, data (data URL)}];
// langs: the document's languages (ui/i18n.js; empty: not localised, else the first is the base), lang: the one shown;
// sequence: the boards joined into one video (state/sequence.js, ui/sequence.js); emptiedByUser: the last board was
// deleted by hand (the editor stays, with its empty state, instead of the welcome card: ui/welcome.js)
const doc={boards:[],active:null,assets:[],fonts:[],langs:[],lang:null,sequence:newSequence(),emptiedByUser:false};
let uid=0,DEFAULT=null;
const subs=[];
function onBoards(fn){subs.push(fn);}
const emit=()=>subs.forEach(f=>f());

/* Size of a board on the canvas (its coordinate space): always the largest export size, BOARD_L on the long edge
   (custom boards: their exact size). The export size (state.size, "Genişlik") only sets the output file, so
   changing it never resizes or moves boards. Documents laid out before this (sizes followed state.size) are
   rescaled once when opened (applyDoc, LAYOUT). */
const BOARD_L=3840,LAYOUT='max';
function sizeOf(st){
  if(st.ratio==='custom')return [st.customW,st.customH];
  const [a,b]=st.ratio.split(':').map(Number),L=BOARD_L;
  return a>=b?[L,Math.round(L*b/a)]:[Math.round(L*a/b),L];
}
const activeBoard=()=>doc.boards.find(b=>b.id===doc.active);
const boardById=id=>doc.boards.find(b=>b.id===id);
// a board's animation length: live for the active board, its snapshot's for the others (the sequence's clip length)
const boardDur=id=>{const b=boardById(id);if(!b)return 0;const st=b.id===doc.active?state:b.snap.state;return st.anim&&st.anim.dur||5;};
// the sequence made consistent with the boards (after a board went, or a document was loaded)
function pruneSequence(seq){doc.sequence=normalizeSeq(seq||doc.sequence,id=>!!boardById(id),boardDur);}
// live size for the active board, stored snapshot for the others
const boardSize=b=>b.id===doc.active?sizeOf(state):sizeOf(b.snap.state);
const nextName=()=>{let n=doc.boards.length+1;const used=new Set(doc.boards.map(b=>b.name));while(used.has('Artboard '+n))n++;return 'Artboard '+n;};

// thumbnail: the whole board rendered off-view at up to 1600 px on the long edge (the live canvas may show only part
// of it), background painted under it, light spheres and gizmo hidden; then the live view is restored
const THUMB=1600;
function captureThumb(){
  const [bw,bh]=sizeOf(state),k=Math.min(1,THUMB/Math.max(bw,bh)),w=Math.max(1,Math.round(bw*k)),h=Math.max(1,Math.round(bh*k));
  const pr=renderer.getPixelRatio(),hidden=[];
  LRT.forEach(o=>{if(o.marker.visible){o.marker.visible=false;hidden.push(o.marker);}});
  overlays.forEach(o=>{if(o.visible){o.visible=false;hidden.push(o);}});
  let url;
  try{
    setCrop(null);renderer.setPixelRatio(1);renderer.setSize(w,h,false);view.aspect=w/h;applyTransform();renderNow(16);
    const c=mkCanvas(w,h),g=c.getContext('2d');paintBg(g,w,h);paintItems(g,w,h,false);g.drawImage(renderer.domElement,0,0,w,h);paintItems(g,w,h,true);
    url=c.toDataURL(state.bg==='transparent'?'image/png':'image/jpeg',.9);
  }catch(e){url=null;}
  finally{hidden.forEach(o=>{o.visible=true;});renderer.setPixelRatio(pr);invalidateLayout();layout();req();}
  return url;
}
// quick: no thumbnail (the sequence switches boards while it plays, ui/sequence.js; a thumbnail render would stall it)
function store(quick){const b=activeBoard();if(!b)return;b.snap=snapshot();if(!quick){const t=captureThumb();if(t){b.thumb=t;b.stale=false;}}syncPano(b);}

/* Panorama sets (state.pano = {g, i, n}, made by ui/store.js): the boards of a set are slices of one wide frame, so
   they share the 3D scene: devices, lights, camera, framing and the scene-wide settings. Whenever the active board's
   snapshot is taken (switching boards, every history step) the others of its set get those parts; each keeps its own
   background, 2D items and slice. Their thumbnails are re-rendered from the live scene (same camera, their own lens
   shift, background and items), a moment later, without switching boards. */
const SHARED=['floor','wall','wallGap','selfShadow','shadowColor','shadowOpacity','ambient','exposure','anim','quality','env','worldLights','dof'];
const sharedOf=s=>JSON.stringify([s.devices,s.lights,s.frame,s.state.scene,SHARED.map(k=>s.state[k])]);
const sameSet=(a,b)=>{const p=a.snap.state.pano,q=b.snap.state.pano;return a!==b&&!!p&&!!q&&p.g===q.g;};
let thumbTimer=0;
function syncPano(a){
  if(!a||!a.snap.state.pano)return;
  const sig=sharedOf(a.snap),copy=o=>JSON.parse(JSON.stringify(o));let changed=false;
  doc.boards.forEach(b=>{
    if(!sameSet(a,b)||sharedOf(b.snap)===sig)return;
    const s=b.snap;s.devices=copy(a.snap.devices);s.lights=copy(a.snap.lights);s.frame=copy(a.snap.frame);s.state.scene=copy(a.snap.state.scene);
    SHARED.forEach(k=>{s.state[k]=copy(a.snap.state[k]??null);});s.selected=a.snap.selected;s.selLight=a.snap.selLight;
    s.images=Object.assign({},s.images,a.snap.images);b.stale=true;changed=true;
  });
  if(changed){clearTimeout(thumbTimer);thumbTimer=setTimeout(panoThumbs,350);}
}
// the stale boards of the active board's set, drawn as slices of the live scene
const SLICE=['bg','solid','bg1','bg2','gradType','gradAngle','bgImg','bgImgName','bgFit','bgScale','bgX','bgY','items','pano','ratio','customW','customH','format'];
function panoThumbs(){
  const a=activeBoard();if(!a||!state.pano)return;
  const todo=doc.boards.filter(b=>b.stale&&sameSet(a,b));if(!todo.length)return;
  const keep={};SLICE.forEach(k=>{keep[k]=state[k];});
  try{
    todo.forEach(b=>{
      const st=b.snap.state,im=b.snap.images||{};
      SLICE.forEach(k=>{state[k]=k==='bgImg'?(st.bgImg&&im[st.bgImg])||null:k==='items'?(st.items||[]).map(o=>Object.assign({},o,{img:o.img?im[o.img]||null:null})).filter(o=>o.img||o.kind==='text'||o.kind==='frame'):st[k];});
      const t=captureThumb();if(t)b.thumb=t;b.stale=false;
    });
  }finally{Object.assign(state,keep);applyTransform();invalidateLayout();bgCss();layout();req();emit();}
}
function show(b){doc.active=b.id;restore(b.snap);bgCss();layout();syncAll();emit();}

// called once at start-up, after the initial scene is built
// a board with nothing on it (the default scene's camera, lights and background, no devices or items)
const emptySnap=()=>{const s=JSON.parse(JSON.stringify(Object.assign({},DEFAULT,{images:{}})));s.images={};s.devices=[];s.state.items=[];s.selected=null;return s;};
// no board at all: the live scene is emptied and the stage shows nothing (layout hides the canvas). why: 'user' (the
// last board deleted by hand), 'keep' (undo / redo into an empty document: the reason stays what it was), else a
// closed / new / loaded document (the welcome card, or the home page)
function clearAll(why){if(why!=='keep')doc.emptiedByUser=why==='user';doc.boards=[];doc.active=null;doc.langs=[];doc.lang=null;doc.sequence=newSequence();restore(emptySnap());layout();syncAll();emit();}
const hasBoard=()=>!!activeBoard();
// adding something with no board open first opens an empty one for it
function ensureBoard(){if(!hasBoard()){addBoard(emptySnap());return true;}return false;}
function initBoards(){DEFAULT=snapshot();doc.boards=[{id:++uid,name:'Artboard 1',x:0,y:0,snap:DEFAULT,thumb:null}];doc.active=uid;doc.sequence=newSequence();emit();}
function activate(id,quick){if(id===doc.active){emit();return;}const t=boardById(id);if(!t)return;store(quick);show(t);}
// new board right of the rightmost one, top-aligned with it; from a snapshot (duplicate) or the default scene
function addBoard(snap,name){
  store();
  const right=doc.boards.reduce((m,b)=>{const r=b.x+boardSize(b)[0];return r>m.r?{r,b}:m;},{r:-Infinity,b:null});
  const b={id:++uid,name:name||nextName(),x:right.b?right.r+GAP:0,y:right.b?right.b.y:0,snap:JSON.parse(JSON.stringify(Object.assign({},snap||DEFAULT,{images:{}}))),thumb:null};
  b.snap.images=(snap||DEFAULT).images;  // images are shared elements, not copied
  doc.boards.push(b);show(b);return b;
}
// where: 'right' (next to the source) or 'below' it; when that place is taken, the copy moves on in the same
// direction until it is free (it never lands on another board)
function duplicateBoard(id,where='right'){
  const src=boardById(id||doc.active);if(!src)return;if(src.id===doc.active)store();
  const [sw,sh]=boardSize(src),b=addBoard(src.snap,src.name+' kopya');b.thumb=src.thumb;
  const [w,h]=boardSize(b),hit=(x,y)=>doc.boards.some(o=>o!==b&&x<o.x+boardSize(o)[0]+GAP/2&&x+w>o.x-GAP/2&&y<o.y+boardSize(o)[1]+GAP/2&&y+h>o.y-GAP/2);
  let x=where==='below'?src.x:src.x+sw+GAP,y=where==='below'?src.y+sh+GAP:src.y;
  for(let i=0;i<200&&hit(x,y);i++){if(where==='below')y+=h+GAP;else x+=w+GAP;}
  b.x=Math.round(x);b.y=Math.round(y);emit();
}
function removeBoard(id){
  const i=doc.boards.findIndex(b=>b.id===id);if(i<0)return false;
  if(doc.boards.length===1){clearAll('user');return true;}
  const wasActive=id===doc.active;doc.boards.splice(i,1);
  pruneSequence();  // its clips leave the sequence
  if(wasActive)show(doc.boards[Math.min(i,doc.boards.length-1)]);else emit();
  return true;
}
function renameBoard(id,name){const b=boardById(id);if(!b)return;const n=String(name||'').trim();if(n)b.name=n.slice(0,60);emit();}
function moveBoard(id,x,y){const b=boardById(id);if(!b)return;b.x=Math.round(x);b.y=Math.round(y);}

/* --- whole document, for undo / redo, autosave and project files */
function docSnapshot(){
  const a=activeBoard();if(a){a.snap=snapshot();syncPano(a);}
  return Object.assign({v:2,layout:LAYOUT,active:doc.active,boards:doc.boards.map(b=>({id:b.id,name:b.name,x:b.x,y:b.y,snap:b.snap,thumb:b.thumb})),fonts:doc.fonts.slice(),langs:doc.langs.slice(),lang:doc.lang,sequence:JSON.parse(JSON.stringify(doc.sequence))},packAssets(doc.assets));
}
const docSignature=d=>JSON.stringify([d.boards.map(b=>[b.id,b.name,b.x,b.y,signature(b.snap)]),d.assets||[],(d.fonts||[]).map(f=>f.family),d.langs||[],d.lang||null,d.sequence||null]);
// first board whose content differs between two documents (undo jumps there)
function changedBoard(from,to){
  const fm=new Map(from.boards.map(b=>[b.id,signature(b.snap)]));
  const c=to.boards.find(b=>fm.get(b.id)!==signature(b.snap));return c?c.id:null;
}
// replaces the document; the active board is `prefer`, else the document's own. Thumbnails: the live ones of boards
// that still exist (fresher), else the document's
function applyDoc(d,prefer){
  doc.fonts=(d.fonts||[]).slice();doc.fonts.forEach(f=>addFontFace(f.family,f.data));
  doc.langs=(d.langs||[]).slice();doc.lang=doc.langs.includes(d.lang)?d.lang:doc.langs[0]||null;
  if(!d.boards.length){const imgs=d.assetImages||{};doc.assets=(d.assets||[]).map(a=>({img:imgs[a.img],name:a.name})).filter(a=>a.img);clearAll('keep');return;}
  if(d.layout!==LAYOUT){
    // older layout: positions were in the export size's pixels; scale them with each board's own growth
    // (custom boards keep their size; they follow the document's first preset board)
    const k=st=>BOARD_L/((st&&st.size)||2160),first=d.boards.find(b=>b.snap&&b.snap.state&&b.snap.state.ratio!=='custom'),k0=first?k(first.snap.state):1;
    d.boards.forEach(b=>{const st=b.snap&&b.snap.state,f=st&&st.ratio!=='custom'?k(st):k0;b.x=Math.round(b.x*f);b.y=Math.round(b.y*f);});
    d.layout=LAYOUT;
  }
  const thumbs=new Map(doc.boards.map(b=>[b.id,b.thumb]));
  doc.boards=d.boards.map(b=>({id:b.id,name:b.name,x:b.x,y:b.y,snap:b.snap,thumb:thumbs.get(b.id)||b.thumb||null}));
  uid=Math.max(uid,...doc.boards.map(b=>b.id));
  const imgs=d.assetImages||{};doc.assets=(d.assets||[]).map(a=>({img:imgs[a.img],name:a.name})).filter(a=>a.img);
  doc.active=null;pruneSequence(d.sequence);  // no live board yet: every clip length comes from its snapshot
  const want=[prefer,d.active].find(id=>id!=null&&boardById(id));
  show(boardById(want)||doc.boards[0]);
}
// renders boards that have no thumbnail yet (after loading a project), one at a time, then returns to the active one
async function fillThumbs(){
  const back=doc.active,todo=doc.boards.filter(b=>!b.thumb&&b.id!==back);if(!todo.length)return;
  const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  for(const b of todo){store();show(b);await frame();await frame();b.thumb=captureThumb();}
  store();show(boardById(back));
}

export {activate,activeBoard,addBoard,clearAll,ensureBoard,hasBoard,applyDoc,asDoc,boardById,boardDur,boardSize,changedBoard,doc,docSignature,docSnapshot,duplicateBoard,fillThumbs,initBoards,moveBoard,onBoards,pruneSequence,removeBoard,renameBoard,sizeOf,store as storeActive,emit as emitBoards};
