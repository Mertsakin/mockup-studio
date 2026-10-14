import {lay} from '../render/item-layout.js';
import {canvas} from '../render/renderer.js';
import {state} from '../state/state.js';
import {sizeOf} from './boards.js';
import {fixHeight,fixWidth,flowIndex,frameAt,nodeOf,reparent,setCenter} from './frames.js';
import {addFrame,addText,editText,selectItem} from './items.js';
import {boardScreen,renderItems} from './layout.js';
import {syncAll} from './sync.js';
import {onUi,setUi,ui} from './ui-state.js';
import {$} from '../util.js';

/* Insert tools (Figma's T and F): ui.tool 'text' or 'frame' (dock buttons, T / F keys) turns the next press on the
   artboard into a new item there, then the tool goes back to Seç.
   - Metin: a click puts a text with its top-left corner at the pointer and opens it for typing.
   - Çerçeve: a click puts a frame of the default size with its top-left corner at the pointer; dragging draws it
     (Shift: square, Alt: from the centre).
   Pressing inside a frame puts the new item in that frame (an auto-layout frame takes it at the pointer's place).
   Esc goes back to Seç without adding. The right-click menu adds at the click the same way (placeText / placeFrame). */
const stage=$('#stagearea');
// a client point in board px (null: off the live board)
function boardPoint(cx,cy){
  const s=boardScreen();if(!s)return null;const r=stage.getBoundingClientRect(),k=sizeOf(state)[0]/s.w;
  const x=(cx-r.left-s.x)*k,y=(cy-r.top-s.y)*k,[W,H]=sizeOf(state);
  return x<0||y<0||x>W||y>H?null:{x,y};
}
// into the frame under the point, if any
function adopt(it,p){
  const f=frameAt(p.x,p.y,it);if(!f)return;
  reparent(it,f,lay(f).dir!=='none'?flowIndex(f,p.x,p.y,it):undefined);
}
const done=()=>{if(ui.tool==='text'||ui.tool==='frame')setUi({tool:'select'});};

function placeText(cx,cy){
  const p=boardPoint(cx,cy);if(!p)return null;
  const it=addText({align:'left'}),n=nodeOf(it);
  if(n)setCenter(it,p.x+n.w/2,p.y+n.h/2);
  adopt(it,p);renderItems();selectItem(it.id);syncAll();done();
  editText(it,true);return it;  // at once: the next keys are the text, not shortcuts
}
// default frame: a quarter of the board wide, 3:2
const DEF_W=.25,DEF_H=DEF_W*2/3;
function placeFrame(cx,cy,size){
  const p=boardPoint(cx,cy);if(!p)return null;const W=sizeOf(state)[0];
  const it=addFrame({radius:.006});const w=size?size.w:DEF_W*W,h=size?size.h:DEF_H*W;
  fixWidth(it,w);fixHeight(it,h);setCenter(it,p.x+w/2,p.y+h/2);
  adopt(it,{x:p.x+1,y:p.y+1});renderItems();selectItem(it.id);syncAll();done();return it;
}

/* ---------- the press on the canvas (capture: before the select / orbit handling in pointer.js) */
let draw=null;
canvas.addEventListener('pointerdown',e=>{
  if((ui.tool!=='text'&&ui.tool!=='frame')||e.button!==0)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(ui.tool==='text'){placeText(e.clientX,e.clientY);return;}
  const p=boardPoint(e.clientX,e.clientY);if(!p)return;
  draw={id:e.pointerId,p,x0:e.clientX,y0:e.clientY,it:null};canvas.setPointerCapture(e.pointerId);
},true);
canvas.addEventListener('pointermove',e=>{
  if(!draw||e.pointerId!==draw.id)return;e.stopImmediatePropagation();
  const s=boardScreen();if(!s)return;const k=sizeOf(state)[0]/s.w;
  let dx=(e.clientX-draw.x0)*k,dy=(e.clientY-draw.y0)*k;
  if(!draw.it&&Math.hypot(e.clientX-draw.x0,e.clientY-draw.y0)<4)return;
  if(e.shiftKey){const m=Math.max(Math.abs(dx),Math.abs(dy));dx=Math.sign(dx||1)*m;dy=Math.sign(dy||1)*m;}
  const w=Math.max(1,Math.abs(dx)),h=Math.max(1,Math.abs(dy));
  let x0=Math.min(draw.p.x,draw.p.x+dx),y0=Math.min(draw.p.y,draw.p.y+dy);
  if(e.altKey){x0=draw.p.x-w;y0=draw.p.y-h;}
  const ww=e.altKey?2*w:w,hh=e.altKey?2*h:h;
  if(!draw.it){draw.it=addFrame({radius:.006});}
  fixWidth(draw.it,ww);fixHeight(draw.it,hh);setCenter(draw.it,x0+ww/2,y0+hh/2);renderItems();
},true);
function endDraw(e,cancel){
  if(!draw||e.pointerId!==draw.id)return;e.stopImmediatePropagation();const d=draw;draw=null;
  if(cancel){if(d.it){state.items=state.items.filter(x=>x!==d.it);renderItems();syncAll();}return;}
  if(!d.it){placeFrame(d.x0,d.y0);return;}  // a click: the default size
  const n=nodeOf(d.it);if(n)adopt(d.it,{x:n.cx,y:n.cy});renderItems();selectItem(d.it.id);syncAll();done();
}
canvas.addEventListener('pointerup',e=>endDraw(e,false),true);
canvas.addEventListener('pointercancel',e=>endDraw(e,true),true);
addEventListener('keydown',e=>{
  if(e.key!=='Escape'||(ui.tool!=='text'&&ui.tool!=='frame'))return;
  e.preventDefault();e.stopImmediatePropagation();if(draw)endDraw({pointerId:draw.id,stopImmediatePropagation(){}},true);setUi({tool:'select'});
},true);
// the cursor says what a press will do
onUi(()=>{document.documentElement.dataset.tool=ui.tool;});
document.documentElement.dataset.tool=ui.tool;

export {placeFrame,placeText};
