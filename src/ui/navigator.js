import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {canvas} from '../render/renderer.js';
import {comp,pivot} from '../render/stage.js';
import {applyTransform,deviceBox} from '../render/transform.js';
import {sel,state,view} from '../state/state.js';
import {pick} from './pointer.js';
import {syncSliders} from './sliders.js';
import {syncAll} from './sync.js';
import {toast} from './toast.js';
import {$,clamp,wrap} from '../util.js';

/* Camera navigation.
   1. Axis widget (top-right of the stage): X / Y / Z of the scene as currently rotated. Clicking an axis end turns
      the scene to look from that side; dragging on the widget orbits like dragging the stage.
   2. Focus ("Odakla", F, double-click a device): the composition is re-centred on the selected device and framed
      to it, so the scene then orbits around that device. "Kadraja sığdır" goes back to the whole composition.
   Both animate; pressing on the stage or turning the wheel cancels a running animation. */
const NS='http://www.w3.org/2000/svg',svg=$('#navSvg'),R=34;
// looking from the + / - side of each axis (scene rx, ry); rz goes to 0
const VIEWS={'+x':[0,-90,'Sağdan'],'-x':[0,90,'Soldan'],'+y':[90,0,'Üstten'],'-y':[-90,0,'Alttan'],'+z':[0,0,'Önden'],'-z':[0,180,'Arkadan']};
const el=(t,a,p)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e;};
const AX={x:'var(--axis-x)',y:'var(--axis-y)',z:'var(--axis-z)'};
el('circle',{r:R+12,class:'nav-bg'},svg);
const lines={},ends={};
['x','y','z'].forEach(a=>{lines[a]=el('line',{x1:0,y1:0,stroke:AX[a],'stroke-width':2.2,'stroke-linecap':'round'},svg);});
Object.keys(VIEWS).forEach(k=>{const a=k[1],pos=k[0]==='+',g=el('g',{class:'nav-end',tabindex:0,role:'button','aria-label':VIEWS[k][2]+' görünüm'},svg);
  el('circle',{r:pos?8:6,fill:pos?AX[a]:'var(--panel)',stroke:AX[a],'stroke-width':2},g);
  if(pos){const t=el('text',{'text-anchor':'middle','dominant-baseline':'central','font-size':9,'font-weight':700,fill:'#fff'},g);t.textContent=a.toUpperCase();}
  el('title',{},g).textContent=VIEWS[k][2];
  g.addEventListener('click',()=>snap(k));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();snap(k);}});
  ends[k]=g;});
// redraw the widget when the scene angle changes
const M=new THREE.Matrix4(),v=new THREE.Vector3();let sig='';
function draw(){
  const S=state.scene,s=[S.rx,S.ry,S.rz].join();if(s===sig)return;sig=s;
  M.makeRotationFromEuler(pivot.rotation);
  const pts=Object.keys(VIEWS).map(k=>{v.set(k[1]==='x'?1:0,k[1]==='y'?1:0,k[1]==='z'?1:0).multiplyScalar(k[0]==='+'?1:-1).applyMatrix4(M);return {k,x:v.x*R,y:-v.y*R,z:v.z};});
  pts.forEach(p=>{ends[p.k].setAttribute('transform','translate('+p.x.toFixed(1)+' '+p.y.toFixed(1)+')');ends[p.k].style.opacity=p.z<-.2?.55:1;
    if(p.k[0]==='+'){lines[p.k[1]].setAttribute('x2',p.x.toFixed(1));lines[p.k[1]].setAttribute('y2',p.y.toFixed(1));}});
  pts.sort((a,b)=>a.z-b.z).forEach(p=>svg.appendChild(ends[p.k]));  // nearer ends on top
}
(function loop(){draw();requestAnimationFrame(loop);})();

// --- tweening (one at a time; ease in-out over ~380 ms)
let tween=null;
function animate(dur,step,done){
  const t0=performance.now(),id={};tween=id;
  (function f(now){if(tween!==id)return;const t=Math.min(1,(now-t0)/dur),e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;step(e);
    if(t<1)requestAnimationFrame(f);else{tween=null;if(done)done();}})(t0);
}
function snap(k){
  const S=state.scene,[rx,ry]=VIEWS[k],a={rx:S.rx,ry:S.ry,rz:S.rz},dy=wrap(ry-a.ry);
  animate(380,e=>{S.rx=a.rx+(rx-a.rx)*e;S.ry=wrap(a.ry+dy*e);S.rz=a.rz*(1-e);applyTransform();},syncSliders);
}
// dragging on the widget orbits (same feel as dragging the stage)
let drag=null;
svg.addEventListener('pointerdown',e=>{if(e.target.closest('.nav-end'))return;drag={x:e.clientX,y:e.clientY};svg.setPointerCapture(e.pointerId);tween=null;});
svg.addEventListener('pointermove',e=>{if(!drag)return;const S=state.scene;
  S.ry=wrap(S.ry+(e.clientX-drag.x)*.6);S.rx=clamp(S.rx+(e.clientY-drag.y)*.6,-90,90);drag={x:e.clientX,y:e.clientY};applyTransform();syncSliders();});
const end=()=>{drag=null;};svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);

// --- focus on the selected device
function focusSelected(){
  const d=sel();if(!d||!RT.get(d.id))return;
  const box=deviceBox(d.id);if(box.isEmpty())return;
  const c=box.getCenter(new THREE.Vector3()).negate(),r=Math.max(1,box.getSize(new THREE.Vector3()).length()/2);
  const S=state.scene,p0=comp.position.clone(),r0=view.fitRadius,z0=S.zoom,px0=S.panX,py0=S.panY;
  animate(420,e=>{comp.position.lerpVectors(p0,c,e);view.fitRadius=r0+(r-r0)*e;S.zoom=z0+(1-z0)*e;S.panX=px0*(1-e);S.panY=py0*(1-e);applyTransform();},syncSliders);
  if(state.devices.length>1)toast('Sahne artık bu cihazın etrafında dönüyor. Tümüne dönmek için Kadraja sığdır.');
}
$('#focusBtn').addEventListener('click',focusSelected);
// the user takes over: stop any running animation; a double-click on a device selects it (pointer.js) and focuses
canvas.addEventListener('pointerdown',()=>{tween=null;},true);canvas.addEventListener('wheel',()=>{tween=null;},{capture:true,passive:true});
canvas.addEventListener('dblclick',e=>{const id=pick(e.clientX,e.clientY);if(!id)return;if(id!==state.selected){state.selected=id;syncAll();}focusSelected();});
window.addEventListener('keydown',e=>{
  const t=e.target;if(e.metaKey||e.ctrlKey||e.altKey||(t&&(/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)||t.id==='domeSvg')))return;
  if(e.key==='f'||e.key==='F'){e.preventDefault();focusSelected();}
});

export {focusSelected};
