import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {camera,canvas,onChange} from '../render/renderer.js';
import {applyTransform,deviceBox} from '../render/transform.js';
import {SCALE_MAX,SCALE_MIN} from '../state/constants.js';
import {sel,state} from '../state/state.js';
import {syncSliders} from './sliders.js';
import {onSyncUI} from './sync.js';
import {onUi,panning,setUi,ui} from './ui-state.js';
import {$,clamp} from '../util.js';

/* Free transform box (Photoshop Ctrl+T / Figma selection box) for the selected device.
   The box is the device's own bounding box projected to the screen, so it hugs the device at any angle. Dragging a
   corner handle scales the device uniformly (3D: one scale for all axes) about its centre on screen, while its lowest
   point stays where it was, so a device standing on the floor keeps standing on it. Esc during a drag cancels.
   Shown with the Select tool (Move / Rotate show the axes instead). T, or Ctrl/⌘+T where the browser allows it,
   switches to Select and shows the box. Scale range follows the inspector slider (SCALE_MIN – SCALE_MAX). */
const MIN=SCALE_MIN,MAX=SCALE_MAX;
const stage=$('#stagearea'),box=document.createElement('div');
box.className='tbox';box.hidden=true;
box.innerHTML='<svg class="tbox-line" aria-hidden="true"><polygon/></svg>'+
  ['nw','ne','se','sw'].map(k=>'<button type="button" class="th th-'+k+'" data-h="'+k+'" aria-label="Ölçekle"></button>').join('')+'<span class="tbox-val" hidden></span>';
stage.appendChild(box);
const poly=box.querySelector('polygon'),val=box.querySelector('.tbox-val'),handles=[...box.querySelectorAll('.th')];

const v=new THREE.Vector3(),corners=[...Array(8)].map(()=>new THREE.Vector3());
// screen-space corners of the device's oriented bounding box -> the 2D hull's extreme points we draw
function project(o){
  const s=o.size,hx=s.x/2,hy=s.y/2,hz=s.z/2,cr=canvas.getBoundingClientRect(),sr=stage.getBoundingClientRect();
  o.orient.updateWorldMatrix(true,false);
  let i=0;const pts=[];
  for(const x of [-hx,hx])for(const y of [-hy,hy])for(const z of [-hz,hz]){
    corners[i].set(x,y,z).applyMatrix4(o.orient.matrixWorld);v.copy(corners[i]).project(camera);
    if(v.z>1)return null;  // behind the camera
    pts.push({x:cr.left-sr.left+(v.x+1)/2*cr.width,y:cr.top-sr.top+(1-v.y)/2*cr.height});i++;}
  return pts;
}
// convex hull (monotone chain) of the projected corners: the outline of the device on screen
function hull(p){
  p=p.slice().sort((a,b)=>a.x-b.x||a.y-b.y);const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lo=[],up=[];for(const q of p){while(lo.length>1&&cross(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q);}
  for(const q of p.slice().reverse()){while(up.length>1&&cross(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q);}
  return lo.slice(0,-1).concat(up.slice(0,-1));
}
let raf=0,drag=null;
const visible=()=>ui.kind==='device'&&ui.tool==='select'&&!panning()&&!!RT.get(state.selected);
function update(){
  raf=0;
  if(!visible()){box.hidden=true;return;}
  const o=RT.get(state.selected),pts=o&&project(o);if(!pts){box.hidden=true;return;}
  const h=hull(pts),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  box.hidden=false;
  box.style.transform='translate('+x0+'px,'+y0+'px)';box.style.width=(x1-x0)+'px';box.style.height=(y1-y0)+'px';
  poly.setAttribute('points',h.map(p=>(p.x-x0).toFixed(1)+','+(p.y-y0).toFixed(1)).join(' '));
  // handles at the corners of the screen-aligned bounds: predictable targets, like Figma
  box.dataset.small=String(x1-x0<56||y1-y0<56);
}
const schedule=()=>{if(!raf)raf=requestAnimationFrame(update);};
onChange.add(schedule);onUi(schedule);onSyncUI(schedule);

// keeps the device's lowest point at `floorY` (composition space) after its scale changed
function setScale(d,s,floorY){
  d.scale=+clamp(s,MIN,MAX).toFixed(3);applyTransform();
  const b=deviceBox(d.id);if(!b.isEmpty()){d.py=+(d.py+floorY-b.min.y).toFixed(3);applyTransform();}
  syncSliders();
}
handles.forEach(hd=>hd.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();
  const d=sel(),r=box.getBoundingClientRect(),c={x:r.left+r.width/2,y:r.top+r.height/2};
  const d0=Math.max(4,Math.hypot(e.clientX-c.x,e.clientY-c.y)),b=deviceBox(d.id);
  drag={id:e.pointerId,d,c,d0,s0:d.scale,py0:d.py,floor:b.min.y};
  hd.setPointerCapture(e.pointerId);canvas.classList.add('dragging');box.classList.add('active');val.hidden=false;
}));
box.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const k=Math.hypot(e.clientX-drag.c.x,e.clientY-drag.c.y)/drag.d0;
  let s=drag.s0*k;if(e.shiftKey)s=Math.round(s*10)/10;  // Shift: 0.1 steps
  setScale(drag.d,s,drag.floor);val.textContent='× '+drag.d.scale.toFixed(2);
});
function endDrag(cancel){
  if(!drag)return;const d=drag.d;
  if(cancel){d.scale=drag.s0;d.py=drag.py0;applyTransform();syncSliders();}
  drag=null;canvas.classList.remove('dragging');box.classList.remove('active');val.hidden=true;schedule();
}
box.addEventListener('pointerup',()=>endDrag(false));box.addEventListener('pointercancel',()=>endDrag(true));
addEventListener('keydown',e=>{
  if(e.key==='Escape'&&drag){e.preventDefault();e.stopImmediatePropagation();endDrag(true);return;}
  const t=e.target;if(t&&(/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)||t.isContentEditable))return;
  // T (or Ctrl/⌘+T where the browser lets the page have it): free transform on the selected device
  if(e.key.toLowerCase()==='t'&&!e.altKey&&!e.shiftKey&&!e.repeat&&state.devices.length){
    e.preventDefault();setUi({tool:'select',kind:'device'});document.querySelector('#dock [data-tool="select"]').click();
  }
},true);

export {setScale};
