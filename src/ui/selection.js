import {buildRT,disposeRT} from '../devices/runtime.js';
import {onChange} from '../render/renderer.js';
import {pivot} from '../render/stage.js';
import {applyTransform,autoRefit,camDist} from '../render/transform.js';
import {POS_MAX} from '../state/constants.js';
import {newDevice,nextItemId,state} from '../state/state.js';
import {doc,sizeOf} from './boards.js';
import {inFlow,resolve,subtree} from '../render/item-layout.js';
import {isFrame,moveBy,setCenter,unwrap,wrap} from './frames.js';
import {itemRect,boardScreen,frame,onLayout,renderItems} from './layout.js';
import {onSyncUI,syncAll} from './sync.js';
import {toast} from './toast.js';
import {outline} from './transform-box.js';
import {onUi,setUi,ui} from './ui-state.js';
import {$,D2R,V3,clamp} from '../util.js';

/* Multi-selection (editor state, not saved): devices and 2D items picked together with Shift (or ⌘/Ctrl) + click on
   the canvas or in the layer tree, or ⌘/Ctrl + A. A single selection stays what it was (ui.kind 'device' / 'item' with
   state.selected / state.selItem); two or more make ui.kind 'multi' with their references in `refs` ('d3', 'i2').
   The group moves together (dragging any member, arrow keys), is deleted, duplicated, copied and pasted together.
   Clipboard: the targets' data in memory (not part of a board, so pasting into another artboard works). ⌘V pastes it
   unless the system clipboard holds an image: that stays a screenshot paste into the device (image-input.js). */
const refs=[];
const refOf=o=>(o.type?'d':'i')+o.id;
const byRef=r=>r[0]==='d'?state.devices.find(d=>'d'+d.id===r):state.items.find(i=>'i'+i.id===r);
const isMulti=()=>ui.kind==='multi'&&refs.length>1;
// the selected targets: the group, or the single device / item
function selection(){
  if(isMulti())return refs.map(byRef).filter(Boolean);
  if(ui.kind==='device'){const d=state.devices.find(x=>x.id===state.selected);return d?[d]:[];}
  if(ui.kind==='item'){const i=state.items.find(x=>x.id===state.selItem);return i?[i]:[];}
  return [];
}
const inSel=o=>selection().includes(o);

// selects exactly these targets (one: the usual single selection; none: the artboard)
function select(list){
  list=list.filter(Boolean);
  if(list.length>1){refs.length=0;list.forEach(o=>refs.push(refOf(o)));
    const d=list.find(o=>o.type),i=list.find(o=>!o.type);if(d)state.selected=d.id;if(i)state.selItem=i.id;
    setUi({kind:'multi'});syncAll();return;}
  refs.length=0;
  if(!list.length){setUi({kind:'board'});return;}
  const o=list[0];
  if(o.type){state.selected=o.id;setUi({kind:'device'});}else{state.selItem=o.id;setUi({kind:'item'});}
  syncAll();
}
// Shift / ⌘ + click: adds the target to the selection, or takes it out
function toggle(o){const cur=selection(),i=cur.indexOf(o);if(i>=0)cur.splice(i,1);else cur.push(o);select(cur);}
function selectAll(){select(state.devices.concat(state.items));}
// leaving 'multi' (a plain click, Esc, another board) forgets the group
onUi(()=>{if(ui.kind!=='multi')refs.length=0;});
onSyncUI(()=>{
  if(!isMulti())return;
  const alive=refs.filter(r=>byRef(r));
  if(alive.length!==refs.length){refs.length=0;alive.forEach(r=>refs.push(r));if(refs.length<2)select(refs.map(byRef));}
});

/* ---------- moving: a screen delta (px) applied to every member */
// a device: across the screen at its depth, like dragging it (pointer.js)
function moveDevice(d,dx,dy){
  const r=frame.getBoundingClientRect(),vh=2*camDist()*Math.tan(state.scene.fov*D2R/2),upp=vh/r.height;
  const w=new V3(dx*upp,-dy*upp,0).applyQuaternion(pivot.quaternion.clone().invert());
  d.px=clamp(d.px+w.x,-POS_MAX,POS_MAX);d.py=clamp(d.py+w.y,-POS_MAX,POS_MAX);d.pz=clamp(d.pz+w.z,-POS_MAX,POS_MAX);
}
// an item: in its parent's terms (screen px -> board px); auto layout places its own children
function moveItem(it,dx,dy){const s=boardScreen();if(!s||inFlow(state.items,it))return;const k=sizeOf(state)[0]/s.w;moveBy(it,dx*k,dy*k);}
// moves the members other than `except` by (dx, dy) px from where they were when `saves` was taken (saveGroup)
// (an item inside another selected frame moves with that frame already)
function saveGroup(except){const sel=selection(),inside=o=>!o.type&&sel.some(f=>f!==o&&!f.type&&subtree(state.items,f).includes(o));
  return sel.filter(o=>o!==except&&!inside(o)).map(o=>({o,v:o.type?{px:o.px,py:o.py,pz:o.pz}:{x:o.x,y:o.y}}));}
function moveGroupFrom(saves,dx,dy){
  let dev=false;
  saves.forEach(({o,v})=>{Object.assign(o,v);if(o.type){moveDevice(o,dx,dy);dev=true;}else moveItem(o,dx,dy);});
  if(dev)applyTransform();renderItems();
}
function nudge(dx,dy){const s=saveGroup(null);moveGroupFrom(s,dx,dy);syncAll();}

/* ---------- delete, clipboard, duplicate */
function removeTargets(list){
  if(!list.length)return;
  const devs=list.filter(o=>o.type),items=new Set(list.filter(o=>!o.type).flatMap(o=>subtree(state.items,o)));
  devs.forEach(d=>disposeRT(d.id));
  state.devices=state.devices.filter(d=>!devs.includes(d));state.items=state.items.filter(i=>!items.has(i));
  if(!state.devices.some(d=>d.id===state.selected))state.selected=state.devices[0]?state.devices[0].id:null;
  if(!state.items.some(i=>i.id===state.selItem))state.selItem=null;
  if(devs.length){autoRefit();applyTransform();}
  renderItems();select([]);
}
const deleteSelection=()=>removeTargets(selection());
// plain copies (images shared by reference: they are immutable elements)
const SKIP=new Set(['id','img','frameImg','video','model']);
function copyOf(o){const c={};for(const k in o)if(!SKIP.has(k))c[k]=JSON.parse(JSON.stringify(o[k]??null));c.img=o.img||null;if(o.type){c.frameImg=o.frameImg||null;c.video=o.video||null;c.model=o.model||null;}return c;}
let clip=null;
// clip.board: where it was copied (pasting there offsets the copies; a cut leaves no original, so none)
function copySelection(){const list=selection();if(!list.length)return false;clip={id:Date.now().toString(36),board:doc.active,list:entriesOf(list)};return true;}
/* clipboard entries: a frame brings everything inside it (old ids kept in oid so the copies can be re-linked); an
   item whose parent is not copied also remembers where it is on the board (abs), for pasting it elsewhere */
function entriesOf(list){
  const items=new Set();list.filter(o=>!o.type).forEach(o=>subtree(state.items,o).forEach(x=>items.add(x)));
  const [W,H]=sizeOf(state),{nodes}=resolve(state.items,W,H);
  return list.filter(o=>o.type).map(o=>({dev:true,data:copyOf(o)})).concat(state.items.filter(x=>items.has(x)).map(o=>{
    const n=nodes.get(o.id),e={dev:false,data:copyOf(o),oid:o.id,root:list.includes(o)};
    if(n&&(o.parent==null||!items.has(state.items.find(x=>x.id===o.parent))))e.abs={x:n.cx/W,y:n.cy/H,rot:n.arot,front:!!rootFront(o)};
    return e;}));
}
const rootFront=o=>{let r=o,p;while(r.parent!=null&&(p=state.items.find(x=>x.id===r.parent)))r=p;return r.front;};
// new targets from copies; `shift`: offset so a copy on the same board does not hide the original
function place(entries,shift){
  const out=[],ids=new Map(),made=[];
  entries.forEach(({dev,data,oid,abs,root})=>{
    if(dev){const d=newDevice(data.type);const id=d.id;Object.assign(d,JSON.parse(JSON.stringify(Object.assign({},data,{img:null,frameImg:null,video:null,model:null}))),{id,img:data.img,frameImg:data.frameImg,video:data.video,model:data.model});
      if(shift){d.px=clamp(d.px+2,-POS_MAX,POS_MAX);d.py=clamp(d.py-1,-POS_MAX,POS_MAX);}
      state.devices.push(d);buildRT(d);out.push(d);}
    else{const it=Object.assign(JSON.parse(JSON.stringify(Object.assign({},data,{img:null}))),{id:nextItemId(),img:data.img});
      if(!it.img&&it.kind!=='text'&&it.kind!=='frame')return;
      ids.set(oid,it.id);state.items.push(it);made.push({it,abs,root});if(root!==false)out.push(it);}
  });
  // parents: a copied frame -> its copy; a frame that is still on this board -> stays; otherwise the board, in place
  made.forEach(({it,abs})=>{
    if(it.parent==null)return;
    if(ids.has(it.parent)){it.parent=ids.get(it.parent);return;}
    if(state.items.some(x=>x.id===it.parent&&x.kind==='frame'))return;
    delete it.parent;if(abs)Object.assign(it,{x:+abs.x.toFixed(5),y:+abs.y.toFixed(5),rot:+abs.rot.toFixed(2),front:abs.front,_abs:abs});
  });
  // abs positions are centres: an anchored frame stores its edge, so place those once laid out
  made.forEach(({it})=>{if(it._abs){const a=it._abs;delete it._abs;const [W,H]=sizeOf(state);setCenter(it,a.x*W,a.y*H);}});
  if(shift)made.forEach(({it})=>{if(out.includes(it)&&!inFlow(state.items,it))moveBy(it,.02*sizeOf(state)[0],.02*sizeOf(state)[0]);});
  if(out.some(o=>o.type))applyTransform();renderItems();select(out);return out;
}
function copyToClipboard(){if(copySelection())toast('Kopyalandı');}
function paste(){if(!clip)return false;place(clip.list,clip.board===doc.active);return true;}
function duplicateSelection(){const list=selection();if(!list.length)return;place(entriesOf(list),true);toast(list.length>1?list.length+' öğe çoğaltıldı':'Çoğaltıldı');}
const hasClip=()=>!!clip;
const typing=t=>t&&(/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)||t.isContentEditable);
// system clipboard events: ⌘C / ⌘X / ⌘V (and the browser's menu) go through them
// (the system clipboard is emptied, so an older screenshot on it does not win over this copy at ⌘V)
let sawCopy=false;
const doCut=()=>{clip.board=null;deleteSelection();};
document.addEventListener('copy',e=>{sawCopy=true;if(typing(e.target)||!copySelection())return;e.preventDefault();e.clipboardData.setData('text/plain','');toast('Kopyalandı');},true);
document.addEventListener('cut',e=>{sawCopy=true;if(typing(e.target)||!copySelection())return;e.preventDefault();e.clipboardData.setData('text/plain','');doCut();},true);
// capture on window, before image-input's screenshot paste: an image on the system clipboard is a screenshot (pasted
// into the device as before); anything else pastes our copy
const hasImage=dt=>!!dt&&[...(dt.items||[])].some(x=>x.type&&x.type.startsWith('image/'));
let sawPaste=false;
window.addEventListener('paste',e=>{
  sawPaste=true;
  if(typing(e.target)||!clip||hasImage(e.clipboardData))return;
  e.preventDefault();e.stopImmediatePropagation();paste();
},true);
// some environments (automation, clipboard blocked) send ⌘C / ⌘X / ⌘V without the clipboard event: do it shortly after
addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(!(e.metaKey||e.ctrlKey)||e.shiftKey||e.altKey||typing(e.target)||k.length!==1||!'cxv'.includes(k))return;
  if(k==='v'){if(!clip)return;sawPaste=false;setTimeout(()=>{if(!sawPaste)paste();},80);return;}
  if(!selection().length||(getSelection&&String(getSelection())))return;
  sawCopy=false;setTimeout(()=>{if(sawCopy||!copySelection())return;if(k==='x')doCut();else toast('Kopyalandı');},80);
},true);

/* ---------- outlines of the group's members (the single selection has its own boxes) */
const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('msel');svg.setAttribute('aria-hidden','true');$('#stagearea').appendChild(svg);
let raf=0;
function draw(){
  raf=0;
  if(!isMulti()){svg.innerHTML='';return;}
  const s=boardScreen();let h='';
  selection().forEach(o=>{
    let pts=null;
    if(o.type)pts=outline(o.id);
    else if(s){const r=itemRect(o,s.w,s.h),a=r.rot*D2R,c=Math.cos(a),n=Math.sin(a);
      pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>({x:s.x+r.cx+(u*r.w/2)*c-(v*r.h/2)*n,y:s.y+r.cy+(u*r.w/2)*n+(v*r.h/2)*c}));}
    if(pts)h+='<polygon points="'+pts.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ')+'"/>';
  });
  svg.innerHTML=h;
}
const schedule=()=>{if(!raf)raf=requestAnimationFrame(draw);};
onChange.add(schedule);onUi(schedule);onSyncUI(schedule);onLayout(schedule);

/* ---------- inspector: the group's panel */
function alignItems(how){
  // items placed by an auto layout cannot be moved by hand: left out
  const s=boardScreen(),items=selection().filter(o=>!o.type&&!inFlow(state.items,o));if(!s||items.length<2)return;
  // axis-aligned extents of the rotated items, in the board's screen pixels; the new centres go through setCenter
  // (board px), so items inside frames move in their frame's terms
  const k=sizeOf(state)[0]/s.w;
  const ext=items.map(it=>{const r=itemRect(it,s.w,s.h),a=r.rot*D2R,ex=(Math.abs(r.w*Math.cos(a))+Math.abs(r.h*Math.sin(a)))/2,ey=(Math.abs(r.w*Math.sin(a))+Math.abs(r.h*Math.cos(a)))/2;
    return {it,x0:r.cx-ex,x1:r.cx+ex,y0:r.cy-ey,y1:r.cy+ey,cx:r.cx,cy:r.cy};});
  const X0=Math.min(...ext.map(e=>e.x0)),X1=Math.max(...ext.map(e=>e.x1)),Y0=Math.min(...ext.map(e=>e.y0)),Y1=Math.max(...ext.map(e=>e.y1));
  const to=(e,cx,cy)=>setCenter(e.it,cx*k,cy*k);
  if(how==='hdist'||how==='vdist'){
    const h=how==='hdist',sorted=ext.slice().sort((a,b)=>h?a.cx-b.cx:a.cy-b.cy);if(sorted.length<3)return;
    const span=h?X1-X0:Y1-Y0,sizes=sorted.reduce((t,e)=>t+(h?e.x1-e.x0:e.y1-e.y0),0),gap=(span-sizes)/(sorted.length-1);
    let p=h?X0:Y0;sorted.forEach(e=>{const sz=h?e.x1-e.x0:e.y1-e.y0;if(h)to(e,p+sz/2,e.cy);else to(e,e.cx,p+sz/2);p+=sz+gap;});
  } else ext.forEach(e=>{
    const w=e.x1-e.x0,hh=e.y1-e.y0;
    const x={left:X0+w/2,right:X1-w/2,hcenter:(X0+X1)/2}[how]??e.cx,y={top:Y0+hh/2,bottom:Y1-hh/2,vcenter:(Y0+Y1)/2}[how]??e.cy;
    to(e,x,y);
  });
  renderItems();syncAll();
}
document.querySelectorAll('#multiAlign [data-align]').forEach(b=>b.addEventListener('click',()=>alignItems(b.dataset.align)));
$('#multiDelete').addEventListener('click',deleteSelection);
$('#multiDup').addEventListener('click',duplicateSelection);
onSyncUI(()=>{
  if(!isMulti())return;const list=selection(),nd=list.filter(o=>o.type).length,ni=list.length-nd;
  $('#multiTitle').textContent=list.length+' öğe seçili';
  $('#multiWhat').textContent=[nd?nd+' cihaz':'',ni?ni+' 2B öğe':''].filter(Boolean).join(', ');
  $('#multiAlignSec').hidden=ni<2;
  document.querySelectorAll('#multiAlign [data-align$="dist"]').forEach(b=>{b.disabled=ni<3;});
});

/* ---------- frames (Figma's shortcuts): ⌥⌘G the selection into a frame, ⇧A auto layout (a frame without one gets it,
   anything else is wrapped in an auto-layout frame), ⇧⌘G the frame away (its children stay) */
const items2D=()=>selection().filter(o=>!o.type);
function frameSelection(auto){
  const list=items2D();if(!list.length)return;
  if(auto&&list.length===1&&isFrame(list[0])&&(!list[0].layout||list[0].layout.dir==='none')){
    const f=list[0],kids=state.items.filter(x=>x.parent===f.id);
    // the children in reading order, then the layout (direction from their spread)
    if(kids.length){const g=wrap(kids,true);if(g){Object.assign(f,{layout:g.layout,wMode:'hug',hMode:'hug'});
      state.items.filter(x=>x.parent===g.id).forEach(x=>{x.parent=f.id;});state.items=state.items.filter(x=>x!==g);}}
    else f.layout=Object.assign({},f.layout||{},{dir:'col'});
    renderItems();select([f]);toast('Auto layout eklendi');return;
  }
  const f=wrap(list,auto);if(f){select([f]);toast(auto?'Auto layout çerçevesi oluşturuldu':'Çerçeveye alındı');}
}
function unframeSelection(){
  const frames=items2D().filter(isFrame);if(!frames.length)return;
  const out=frames.flatMap(f=>unwrap(f));select(out);toast('Çerçeveden çıkarıldı');
}

/* ---------- keys: ⌘/Ctrl + A selects everything, ⌘/Ctrl + D duplicates; with a group: arrows nudge (1 px, Shift 10 px
   of the output), Delete removes, Esc deselects */
addEventListener('keydown',e=>{
  if(typing(e.target))return;
  const k=e.key.toLowerCase(),mod=e.metaKey||e.ctrlKey;
  if(mod&&k==='a'&&!e.shiftKey&&!e.altKey){if(ui.tlFocus&&ui.mode==='animate')return;  // the timeline's keys (timeline.js)
    if(!state.devices.length&&!state.items.length)return;e.preventDefault();e.stopImmediatePropagation();selectAll();return;}
  if(mod&&e.altKey&&e.code==='KeyG'&&!e.shiftKey){if(!items2D().length)return;e.preventDefault();e.stopImmediatePropagation();frameSelection(false);return;}
  if(mod&&e.shiftKey&&e.code==='KeyG'&&!e.altKey){if(!items2D().some(isFrame))return;e.preventDefault();e.stopImmediatePropagation();unframeSelection();return;}
  if(!mod&&!e.altKey&&e.shiftKey&&e.code==='KeyA'){if(!items2D().length)return;e.preventDefault();e.stopImmediatePropagation();frameSelection(true);return;}
  if(mod&&k==='d'&&!e.shiftKey&&!e.altKey){if(!selection().length)return;e.preventDefault();e.stopImmediatePropagation();duplicateSelection();return;}
  if(!isMulti()||mod||e.altKey)return;
  const mv={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(mv){const sc=boardScreen();if(!sc)return;e.preventDefault();e.stopImmediatePropagation();const n=(e.shiftKey?10:1)*sc.w/sizeOf(state)[0];nudge(mv[0]*n,mv[1]*n);return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopImmediatePropagation();deleteSelection();return;}
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();select([]);}
},true);

export {copyToClipboard,deleteSelection,frameSelection,unframeSelection,duplicateSelection,hasClip,inSel,isMulti,moveGroupFrom,nudge,paste,copySelection,saveGroup,select,selectAll,selection,toggle};
