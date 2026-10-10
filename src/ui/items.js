import {canvas} from '../render/renderer.js';
import {nextItemId,selItem,state} from '../state/state.js';
import {sizeOf} from './boards.js';
import {boardScreen,imgSize,itemRect,onLayout,renderItems} from './layout.js';
import {onSyncUI,syncAll} from './sync.js';
import {onUi,panning,setUi,ui} from './ui-state.js';
import {$,clamp} from '../util.js';

/* 2D items (PNG / SVG / WebP placed on the artboard, data in state.items, drawn by layout.js).
   - Picking: pointer.js asks itemAt() — front items before the devices, back items after them. Transparent pixels
     do not count (alpha mask), so a decoration with holes does not block orbiting or picking behind it.
   - Selected item: a box with corner handles (scale, keeping proportions; the opposite corner stays, Alt: about the
     centre) and a rotation handle (Shift: 15° steps). Dragging the item
     moves it; its centre and edges snap to the board's centre and edges (red guides; Shift: one axis; Cmd/Ctrl: no
     snapping). Arrow keys nudge 1 px (Shift: 10 px) in output pixels. Esc during a drag cancels. */
const stage=$('#stagearea'),box=document.createElement('div');
box.className='ibox';box.hidden=true;
box.innerHTML='<div class="ibox-line"></div><span class="ibox-stem"></span><button type="button" class="ibox-rot" data-h="rot" aria-label="Döndür"></button>'+
  ['nw','ne','se','sw'].map(k=>'<button type="button" class="th th-'+k+'" data-h="'+k+'" aria-label="Ölçekle"></button>').join('')+'<span class="tbox-val" hidden></span>';
stage.appendChild(box);
const val=box.querySelector('.tbox-val');

/* ---------- geometry (stage pixels) */
const D2R=Math.PI/180;
function screenRect(it){const s=boardScreen();if(!s)return null;const r=itemRect(it,s.w,s.h);r.cx+=s.x;r.cy+=s.y;return r;}
const toStage=(cx,cy)=>{const r=stage.getBoundingClientRect();return {x:cx-r.left,y:cy-r.top};};
// point in the item's own frame: (0,0) centre, x right / y down along its rotated edges
function local(r,p){const a=-r.rot*D2R,dx=p.x-r.cx,dy=p.y-r.cy;return {x:dx*Math.cos(a)-dy*Math.sin(a),y:dx*Math.sin(a)+dy*Math.cos(a)};}

// alpha masks (max 256 px), built once per image; null = opaque everywhere (e.g. a tainted canvas)
const masks=new WeakMap();
function mask(img){
  if(masks.has(img))return masks.get(img);
  let m;
  try{const [iw,ih]=imgSize(img),k=Math.min(1,256/Math.max(iw,ih)),w=Math.max(1,Math.round(iw*k)),h=Math.max(1,Math.round(ih*k));
    const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,w,h);
    m={w,h,a:g.getImageData(0,0,w,h).data};}catch(e){m=null;}
  if(img.complete)masks.set(img,m);
  return m;
}
function hit(it,p){
  const r=screenRect(it);if(!r)return false;const l=local(r,p);
  if(Math.abs(l.x)>r.w/2||Math.abs(l.y)>r.h/2)return false;
  const m=mask(it.img);if(!m)return true;
  const u=Math.min(m.w-1,Math.floor((l.x/r.w+.5)*m.w)),v=Math.min(m.h-1,Math.floor((l.y/r.h+.5)*m.h));
  return m.a[(v*m.w+u)*4+3]>16;
}
// topmost item of one layer under a client point (front: over the devices, else under them)
function itemAt(cx,cy,front){
  const p=toStage(cx,cy);
  for(let i=state.items.length-1;i>=0;i--){const it=state.items[i];if(!!it.front===front&&hit(it,p))return it;}
  return null;
}

/* ---------- selection */
function selectItem(id){if(state.selItem!==id){state.selItem=id;syncAll();}setUi({kind:'item'});schedule();}
// a new item from an image: centred (or at a client point), a third of the board wide at most, in front
function addItem(img,name,at){
  const [bw,bh]=sizeOf(state),[iw,ih]=imgSize(img);
  const w=Math.min(.34,.34*(bh/bw)*(iw/ih)*1.4,iw/bw);  // not wider than a third, not taller than about half, not upscaled
  let x=.5,y=.5;
  if(at){const s=boardScreen(),p=toStage(at.x,at.y);if(s){x=clamp((p.x-s.x)/s.w,0,1);y=clamp((p.y-s.y)/s.h,0,1);}}
  const it={id:nextItemId(),name:name||'Görsel',img,x,y,w:Math.max(.02,w),rot:0,opacity:1,front:true};
  state.items.push(it);renderItems();selectItem(it.id);return it;
}
function removeItem(id){
  const i=state.items.findIndex(x=>x.id===id);if(i<0)return;
  state.items.splice(i,1);if(state.selItem===id)state.selItem=null;renderItems();syncAll();
  if(ui.kind==='item')setUi({kind:'board'});
}
// paint order within the item's own layer (front / back): +1 forward, -1 backward, Infinity / -Infinity to the end
function reorder(id,step){
  const it=state.items.find(x=>x.id===id);if(!it)return;
  const layer=state.items.filter(x=>!!x.front===!!it.front),i=layer.indexOf(it);layer.splice(i,1);
  layer.splice(step===Infinity?layer.length:step===-Infinity?0:clamp(i+step,0,layer.length),0,it);
  state.items=state.items.filter(x=>!!x.front!==!!it.front).concat(layer);  // the layers paint separately: only the order within one matters
  renderItems();syncAll();
}
// in front of / behind the devices; the item goes on top of its new layer
function setFront(id,front){const it=state.items.find(x=>x.id===id);if(!it||!!it.front===front)return;it.front=front;state.items=state.items.filter(x=>x!==it).concat(it);renderItems();syncAll();}
const changed=()=>{renderItems();schedule();syncAll();};

/* ---------- box */
let raf=0,drag=null;
const visible=()=>ui.kind==='item'&&!panning()&&!!selItem()&&ui.tool!=='orbit';
function update(){
  raf=0;const it=visible()&&selItem(),r=it&&screenRect(it);
  if(!r){box.hidden=true;return;}
  box.hidden=false;box.style.width=r.w+'px';box.style.height=r.h+'px';
  box.style.transform='translate('+(r.cx-r.w/2)+'px,'+(r.cy-r.h/2)+'px) rotate('+r.rot+'deg)';
  box.dataset.small=String(r.w<40||r.h<40);
}
const schedule=()=>{if(!raf)raf=requestAnimationFrame(update);};
onLayout(schedule);onUi(schedule);onSyncUI(schedule);

/* ---------- guides */
let guides=[];
function clearGuides(){guides.forEach(g=>g.remove());guides=[];}
function guide(x,y,w,h){const g=document.createElement('div');g.className='guide';g.style.cssText='left:'+x+'px;top:'+y+'px;width:'+(w||1)+'px;height:'+(h||1)+'px;z-index:4';stage.appendChild(g);guides.push(g);}

/* ---------- drags: move (from pointer.js), scale / rotate (handles) */
function begin(e,o){drag=Object.assign({id:e.pointerId,it:selItem(),start:toStage(e.clientX,e.clientY)},o);
  drag.save={x:drag.it.x,y:drag.it.y,w:drag.it.w,rot:drag.it.rot};canvas.classList.add('dragging');box.classList.add('active');
  addEventListener('pointermove',onMove);addEventListener('pointerup',onUp);addEventListener('pointercancel',onCancel);}
function startItemDrag(e,it){selectItem(it.id);begin(e,{mode:'move'});}
box.querySelectorAll('[data-h]').forEach(h=>h.addEventListener('pointerdown',e=>{
  if(e.button!==0||!selItem())return;e.preventDefault();e.stopPropagation();
  const k=h.dataset.h,r=screenRect(selItem());
  if(k==='rot'){begin(e,{mode:'rot',r});return;}
  // scale: the opposite corner stays (local coordinates of the anchor)
  const sx=k.includes('e')?1:-1,sy=k.includes('s')?1:-1;begin(e,{mode:'scale',r,sx,sy});
}));
function onMove(e){
  if(!drag||e.pointerId!==drag.id)return;
  const it=drag.it,s=boardScreen(),p=toStage(e.clientX,e.clientY),sv=drag.save;if(!s)return;
  clearGuides();
  if(drag.mode==='move'){
    let dx=p.x-drag.start.x,dy=p.y-drag.start.y;
    if(e.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0;}
    let cx=sv.x*s.w+dx,cy=sv.y*s.h+dy;
    if(!(e.metaKey||e.ctrlKey)){
      // axis-aligned extent of the rotated item, then snap centre / edges to the board's centre / edges
      const r=itemRect(it,s.w,s.h),a=r.rot*D2R,ex=(Math.abs(r.w*Math.cos(a))+Math.abs(r.h*Math.sin(a)))/2,ey=(Math.abs(r.w*Math.sin(a))+Math.abs(r.h*Math.cos(a)))/2;
      const snapAx=(c,e2,L,lock)=>{if(lock)return null;let best=null;
        for(const t of [0,L/2,L])for(const off of [0,-e2,e2]){const d=t-(c+off);if(Math.abs(d)<=6&&(!best||Math.abs(d)<Math.abs(best.d)))best={d,t};}
        return best?{c:c+best.d,t:best.t}:null;};
      const X=snapAx(cx,ex,s.w,e.shiftKey&&dx===0),Y=snapAx(cy,ey,s.h,e.shiftKey&&dy===0);
      if(X){cx=X.c;guide(s.x+X.t,s.y,1,s.h);}
      if(Y){cy=Y.c;guide(s.x,s.y+Y.t,s.w,1);}
    }
    it.x=+(cx/s.w).toFixed(4);it.y=+(cy/s.h).toFixed(4);
  } else if(drag.mode==='scale'){
    const r=drag.r,a=r.rot*D2R,cos=Math.cos(a),sin=Math.sin(a);
    if(e.altKey){  // about the centre
      const l=local(r,p),k=Math.max(Math.abs(l.x)/(r.w/2),Math.abs(l.y)/(r.h/2));
      it.w=clamp(sv.w*k,.01,4);it.x=sv.x;it.y=sv.y;
    } else {
      // anchor = opposite corner; new size from the pointer's projection on the item's axes
      const ax=r.cx+(-drag.sx*r.w/2)*cos-(-drag.sy*r.h/2)*sin,ay=r.cy+(-drag.sx*r.w/2)*sin+(-drag.sy*r.h/2)*cos;
      const dx=p.x-ax,dy=p.y-ay,lx=(dx*cos+dy*sin)*drag.sx,ly=(-dx*sin+dy*cos)*drag.sy;
      const k=clamp(Math.max(lx/r.w,ly/r.h),.01/sv.w,4/sv.w),w=r.w*k,h=r.h*k;
      const cx=ax+(drag.sx*w/2)*cos-(drag.sy*h/2)*sin,cy=ay+(drag.sx*w/2)*sin+(drag.sy*h/2)*cos;
      it.w=+(sv.w*k).toFixed(4);it.x=+((cx-s.x)/s.w).toFixed(4);it.y=+((cy-s.y)/s.h).toFixed(4);
    }
    val.hidden=false;val.textContent=Math.round(it.w*sizeOf(state)[0])+' px';
  } else if(drag.mode==='rot'){
    const r=drag.r;let deg=Math.atan2(p.y-r.cy,p.x-r.cx)/D2R+90;
    if(e.shiftKey)deg=Math.round(deg/15)*15;
    deg=((deg+180)%360+360)%360-180;it.rot=+deg.toFixed(1);val.hidden=false;val.textContent=Math.round(it.rot)+'°';
  }
  changed();
}
function end(cancel){
  if(!drag)return;const it=drag.it;
  if(cancel)Object.assign(it,drag.save);
  removeEventListener('pointermove',onMove);removeEventListener('pointerup',onUp);removeEventListener('pointercancel',onCancel);
  drag=null;clearGuides();canvas.classList.remove('dragging');box.classList.remove('active');val.hidden=true;changed();
}
const onUp=()=>end(false),onCancel=()=>end(true);

/* ---------- keys: arrows nudge, Delete removes, Esc cancels a drag */
addEventListener('keydown',e=>{
  if(e.key==='Escape'&&drag){e.preventDefault();e.stopImmediatePropagation();end(true);return;}
  const t=e.target;if(t&&(/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)||t.isContentEditable))return;
  if(ui.kind!=='item'||!selItem()||e.metaKey||e.ctrlKey||e.altKey)return;
  const it=selItem(),[bw,bh]=sizeOf(state),n=e.shiftKey?10:1;
  const mv={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(mv){e.preventDefault();e.stopImmediatePropagation();it.x=+(it.x+mv[0]*n/bw).toFixed(4);it.y=+(it.y+mv[1]*n/bh).toFixed(4);changed();return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopImmediatePropagation();removeItem(it.id);}
},true);

export {addItem,itemAt,removeItem,reorder,selectItem,setFront,startItemDrag};
