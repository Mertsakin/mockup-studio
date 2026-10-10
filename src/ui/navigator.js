import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {canvas} from '../render/renderer.js';
import {comp} from '../render/stage.js';
import {applyTransform,deviceBox} from '../render/transform.js';
import {sel,state,view} from '../state/state.js';
import {pick} from './pointer.js';
import {syncSliders} from './sliders.js';
import {syncAll} from './sync.js';
import {toast} from './toast.js';
import {$,D2R,clamp,wrap} from '../util.js';

/* Camera navigation.
   1. View cube (top-right of the live artboard): a small cube that turns with the scene, faces labelled Ön / Arka /
      Sağ / Sol / Üst / Alt. Clicking the middle of a face looks from that side; clicking near an edge or a corner
      turns to the ¾ view between those faces (elevation / heading of the summed face normals). Dragging on the
      widget orbits like dragging the stage. The angle shows on hover.
   2. Focus ("Odakla", F, double-click a device): the composition is re-centred on the selected device and framed
      to it, so the scene then orbits around that device. "Kadraja sığdır" goes back to the whole composition.
   Both animate; pressing on the stage or turning the wheel cancels a running animation. */
const NS='http://www.w3.org/2000/svg',svg=$('#navSvg'),S=17;
const FACES=[
  {n:[0,0,1],l:'Ön',v:'Önden'},{n:[0,0,-1],l:'Arka',v:'Arkadan'},{n:[1,0,0],l:'Sağ',v:'Sağdan'},
  {n:[-1,0,0],l:'Sol',v:'Soldan'},{n:[0,1,0],l:'Üst',v:'Üstten'},{n:[0,-1,0],l:'Alt',v:'Alttan'}];
const el=(t,a,p)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e;};
svg.setAttribute('viewBox','-34 -34 68 68');
el('circle',{r:32,class:'nav-bg'},svg);
const cubeG=el('g',{},svg),cap=el('text',{y:44,'text-anchor':'middle',class:'nav-cap'},svg);
// face corners in face space: a face with normal n spans the two other axes
function faceCorners(n){
  const ax=n[0]?0:n[1]?1:2,u=[0,0,0],w=[0,0,0];u[(ax+1)%3]=1;w[(ax+2)%3]=1;
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[0,1,2].map(i=>n[i]+u[i]*a+w[i]*b));
}
// target angles that look along a direction (sum of face normals): elevation -> rx, heading -> ry
function viewOf(d){const L=Math.hypot(...d),x=d[0]/L,y=d[1]/L,z=d[2]/L;return {rx:Math.asin(y)/D2R,ry:-Math.atan2(x,z)/D2R};}
const M=new THREE.Matrix4(),E=new THREE.Euler(),v=new THREE.Vector3();let sig='';
const proj=p=>{v.set(p[0],p[1],p[2]).applyMatrix4(M);return {x:v.x*S,y:-v.y*S,z:v.z};};
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function draw(){
  const Sc=state.scene,s=[Sc.rx,Sc.ry,Sc.rz].join();if(s===sig)return;sig=s;
  E.set(Sc.rx*D2R,Sc.ry*D2R,Sc.rz*D2R,'YXZ');M.makeRotationFromEuler(E);cubeG.innerHTML='';  // same rotation as the pivot (applyTransform)
  cap.textContent=Math.round(wrap(Sc.ry))+'° · '+Math.round(Sc.rx)+'°';
  FACES.map(f=>{v.set(...f.n).applyMatrix4(M);return {f,z:v.z,lit:v.y*.55+v.z*.45+v.x*.12};}).filter(o=>o.z>.02).sort((a,b)=>a.z-b.z).forEach(({f,z,lit})=>{
    const c=faceCorners(f.n).map(proj),g=el('g',{class:'nav-face'},cubeG);
    el('polygon',{points:c.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join(' '),class:'nav-side'},g);
    el('polygon',{points:c.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join(' '),class:'nav-shade','fill-opacity':(.18*(1-Math.max(0,Math.min(1,lit)))).toFixed(3)},g);
    // 3 x 3 hit cells: centre = this face, sides = edge views, corners = corner views
    const ax=f.n[0]?0:f.n[1]?1:2,A=(ax+1)%3,B=(ax+2)%3;
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){
      const t0=[.0,.28,.72][i],t1=[.28,.72,1][i],s0=[.0,.28,.72][j],s1=[.28,.72,1][j];
      const at=(ti,si)=>lerp(lerp(c[0],c[1],ti),lerp(c[3],c[2],ti),si);
      const dir=f.n.slice();if(i!==1)dir[A]=i===0?-1:1;if(j!==1)dir[B]=j===0?-1:1;
      const center=i===1&&j===1,cell=el('polygon',{points:[at(t0,s0),at(t1,s0),at(t1,s1),at(t0,s1)].map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join(' '),class:'nav-hit'},g);
      cell.dataset.dir=dir.join(',');
      if(center){cell.setAttribute('tabindex','0');cell.setAttribute('role','button');cell.setAttribute('aria-label',f.v+' bak');}
      const tt=el('title',{},cell);tt.textContent=center?f.v:'¾ açı';
    }
    if(z>.3){const m=c.reduce((o,p)=>({x:o.x+p.x/4,y:o.y+p.y/4}),{x:0,y:0}),t=el('text',{x:m.x.toFixed(2),y:m.y.toFixed(2),'text-anchor':'middle','dominant-baseline':'central',class:'nav-label','font-size':(6.2+1.6*z).toFixed(2),opacity:(.35+.65*z).toFixed(2)},g);t.textContent=f.l;}
  });
}
(function loop(){draw();requestAnimationFrame(loop);})();

// --- tweening (one at a time; ease in-out over ~380 ms)
let tween=null;
function animate(dur,step,done){
  const t0=performance.now(),id={};tween=id;
  (function f(now){if(tween!==id)return;const t=Math.min(1,(now-t0)/dur),e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;step(e);
    if(t<1)requestAnimationFrame(f);else{tween=null;if(done)done();}})(t0);
}
function snap(dir){
  const S0=state.scene,{rx,ry}=viewOf(dir),a={rx:S0.rx,ry:S0.ry,rz:S0.rz},dy=wrap(ry-a.ry);
  animate(380,e=>{S0.rx=a.rx+(rx-a.rx)*e;S0.ry=wrap(a.ry+dy*e);S0.rz=a.rz*(1-e);applyTransform();},syncSliders);
}
// dragging on the widget orbits (same feel as dragging the stage); a press without movement on a cell snaps
let drag=null;
svg.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,cell:e.target.closest('.nav-hit')};svg.setPointerCapture(e.pointerId);tween=null;});
svg.addEventListener('pointermove',e=>{if(!drag)return;const Sc=state.scene;
  if(Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)>3)drag.cell=null;
  Sc.ry=wrap(Sc.ry+(e.clientX-drag.x)*.6);Sc.rx=clamp(Sc.rx+(e.clientY-drag.y)*.6,-90,90);drag.x=e.clientX;drag.y=e.clientY;
  if(!drag.cell){applyTransform();syncSliders();}});
const end=()=>{if(drag&&drag.cell)snap(drag.cell.dataset.dir.split(',').map(Number));drag=null;};
svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',()=>{drag=null;});
svg.addEventListener('keydown',e=>{const c=e.target.closest&&e.target.closest('.nav-hit');if(c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();snap(c.dataset.dir.split(',').map(Number));}});

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
