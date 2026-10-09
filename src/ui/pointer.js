import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {LRT} from '../lights/runtime.js';
import {camera,canvas} from '../render/renderer.js';
import {pivot} from '../render/stage.js';
import {applyTransform,camDist} from '../render/transform.js';
import {sel,state,view} from '../state/state.js';
import {lightMoved} from './dome.js';
import {frame} from './layout.js';
import {syncSliders} from './sliders.js';
import {syncAll,syncUI} from './sync.js';
import {D2R,V3,clamp,wrap} from '../util.js';

/* ---------- pointer interaction ---------- */
const pointers=new Map(),ray=new THREE.Raycaster();
let downAt=null,moved=false;
function pick(cx,cy){
  const r=canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1),camera);
  const hits=ray.intersectObjects([...RT.values()].map(o=>o.holder),true);
  for(const h of hits){let x=h.object;while(x&&!x.userData.devId)x=x.parent;if(x)return x.userData.devId;}
  return null;
}
// direct dragging of the light spheres in the 3D view
let lightDrag=null;
function ndcOf(cx,cy){const r=canvas.getBoundingClientRect();return new THREE.Vector2((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1);}
function pickLight(cx,cy){
  if(!state.markers)return null;
  ray.setFromCamera(ndcOf(cx,cy),camera);
  let best=null,bt=Infinity;
  LRT.forEach((o,id)=>{if(!o.marker.visible)return;const h=ray.intersectObject(o.marker,false)[0];
    // generous hit area: also accept rays passing close to the sphere
    const dist=ray.ray.distanceToPoint(o.marker.position),rad=o.marker.scale.x*2.2;
    if((h&&h.distance<bt)||(!h&&dist<rad&&ray.ray.origin.distanceTo(o.marker.position)<bt)){bt=h?h.distance:ray.ray.origin.distanceTo(o.marker.position);best=id;}});
  return best;
}
function dragLight3D(id,cx,cy){
  const L=state.lights.find(l=>l.id===id);if(!L)return;
  const R=view.fitRadius,d=R*L.dist,c=new V3(pivot.position.x,pivot.position.y,0);
  ray.setFromCamera(ndcOf(cx,cy),camera);
  const o=ray.ray.origin,dir=ray.ray.direction,oc=o.clone().sub(c),b=oc.dot(dir),disc=b*b-(oc.lengthSq()-d*d);
  let p;
  if(disc>=0){const cur=LRT.get(L.id).marker.position,t1=-b-Math.sqrt(disc),t2=-b+Math.sqrt(disc);
    const p1=o.clone().addScaledVector(dir,t1),p2=o.clone().addScaledVector(dir,t2);
    p=(t1>0&&p1.distanceTo(cur)<=p2.distanceTo(cur))?p1:p2;}
  else p=o.clone().addScaledVector(dir,-b).sub(c).setLength(d).add(c);
  const v=p.sub(c).normalize();L.el=clamp(Math.asin(clamp(v.y,-1,1))/D2R,2,90);L.az=wrap(Math.atan2(v.x,v.z)/D2R);
  lightMoved();
}
function pan(dx,dy){const r=frame.getBoundingClientRect();const S=state.scene;S.panX=clamp(S.panX+dx/r.width,-.6,.6);S.panY=clamp(S.panY-dy/r.height,-.6,.6);}
function moveSelected(dx,dy){
  const d=sel(),r=frame.getBoundingClientRect(),dist=camDist(),vh=2*dist*Math.tan(state.scene.fov*D2R/2),upp=vh/r.height;
  const w=new V3(dx*upp,-dy*upp,0).applyQuaternion(pivot.quaternion.clone().invert());
  d.px=clamp(d.px+w.x,-60,60);d.py=clamp(d.py+w.y,-60,60);d.pz=clamp(d.pz+w.z,-60,60);
}
canvas.addEventListener('pointerdown',e=>{
  canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  canvas.classList.add('dragging');downAt={x:e.clientX,y:e.clientY};moved=false;
  if(pointers.size===1){const lidHit=pickLight(e.clientX,e.clientY);
    if(lidHit){lightDrag=lidHit;if(state.selLight!==lidHit){state.selLight=lidHit;syncAll();}return;}}
  if(state.mode==='move'&&pointers.size===1){const id=pick(e.clientX,e.clientY);if(id&&id!==state.selected){state.selected=id;syncAll();}}
});
canvas.addEventListener('pointermove',e=>{
  const p=pointers.get(e.pointerId);if(!p)return;
  if(lightDrag){dragLight3D(lightDrag,e.clientX,e.clientY);p.x=e.clientX;p.y=e.clientY;return;}
  const dx=e.clientX-p.x,dy=e.clientY-p.y;
  if(downAt&&Math.hypot(e.clientX-downAt.x,e.clientY-downAt.y)>4)moved=true;
  const S=state.scene;
  if(pointers.size===1){
    if(e.shiftKey)pan(dx,dy);
    else if(state.mode==='move')moveSelected(dx,dy);
    else{S.ry=wrap(S.ry+dx*.45);S.rx=clamp(S.rx+dy*.45,-90,90);}
  } else if(pointers.size===2){
    let o=null;for(const [id,q] of pointers){if(id!==e.pointerId)o=q;}
    const od=Math.hypot(p.x-o.x,p.y-o.y),nd=Math.hypot(e.clientX-o.x,e.clientY-o.y);
    if(od>0)S.zoom=clamp(S.zoom*nd/od,.3,3);pan(dx/2,dy/2);
  }
  p.x=e.clientX;p.y=e.clientY;applyTransform();syncSliders();
});
const endPtr=e=>{
  if(lightDrag){lightDrag=null;pointers.delete(e.pointerId);if(!pointers.size)canvas.classList.remove('dragging');syncUI();return;}
  const was=pointers.size;pointers.delete(e.pointerId);
  if(!pointers.size){canvas.classList.remove('dragging');
    if(was===1&&!moved&&state.mode==='rotate'&&e.type==='pointerup'){const id=pick(e.clientX,e.clientY);if(id&&id!==state.selected){state.selected=id;syncAll();}}}
};
canvas.addEventListener('pointermove',e=>{if(pointers.size||e.pointerType!=='mouse')return;canvas.style.cursor=pickLight(e.clientX,e.clientY)?'grab':'';});
canvas.addEventListener('pointerup',endPtr);canvas.addEventListener('pointercancel',endPtr);
canvas.addEventListener('wheel',e=>{e.preventDefault();const S=state.scene;S.zoom=clamp(S.zoom*Math.exp(-e.deltaY*.0015),.3,3);applyTransform();syncSliders();},{passive:false});

export {dragLight3D,pickLight};
