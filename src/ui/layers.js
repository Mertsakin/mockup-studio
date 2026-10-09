import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {camera} from '../render/renderer.js';
import {comp} from '../render/stage.js';
import {applyTransform} from '../render/transform.js';
import {sel,state} from '../state/state.js';
import {syncSliders} from './sliders.js';
import {onSyncUI} from './sync.js';
import {toast} from './toast.js';
import {$,clamp} from '../util.js';

/* Layer order ("En öne / Öne / Arkaya / En arkaya"). In a 3D scene "in front" means closer to the camera, so these
   commands move the device in depth until it clears the others (by GAP), instead of faking draw order (which would
   show devices passing through each other and could not work in shadows or photo mode). The move follows the
   camera ray through the device (along the floor when the floor is on, so it keeps standing) and the scale is
   compensated by the distance ratio, so the device keeps roughly its size and place on screen.
   The order is relative to the current camera: rotating the scene a lot can change what is in front. */
const GAP=.6,V=new THREE.Vector3(),C=new THREE.Vector3(),F=new THREE.Vector3(),Q=new THREE.Quaternion();
const box=new THREE.Box3(),corner=new THREE.Vector3();

// depth range of a device along the camera's view direction: corners of every mesh's own bounding box
function depth(d){
  const o=RT.get(d.id);o.holder.updateMatrixWorld(true);camera.getWorldDirection(F);
  let near=Infinity,far=-Infinity;
  o.holder.traverse(x=>{
    if(!x.isMesh||!x.visible||x.userData.ao)return;
    if(!x.geometry.boundingBox)x.geometry.computeBoundingBox();box.copy(x.geometry.boundingBox);
    for(let i=0;i<8;i++){corner.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyMatrix4(x.matrixWorld);
      const z=corner.sub(camera.position).dot(F);if(z<near)near=z;if(z>far)far=z;}
  });
  o.holder.getWorldPosition(C);
  return {near,far,center:C.clone().sub(camera.position).dot(F)};
}
// moves a device `delta` further from the camera (negative: closer), scale compensated
function push(d,delta){
  const o=RT.get(d.id),c0=depth(d).center;camera.getWorldDirection(F);o.holder.getWorldPosition(C);
  let dir;
  if(state.floor){dir=new THREE.Vector3(F.x,0,F.z);if(dir.lengthSq()<1e-6)dir.set(0,0,-1);dir.normalize();}
  else dir=C.clone().sub(camera.position).normalize();
  const k=dir.dot(F);if(Math.abs(k)<.05)return;
  V.copy(dir).multiplyScalar(delta/k).applyQuaternion(comp.getWorldQuaternion(Q).invert());
  d.px=clamp(d.px+V.x,-60,60);d.py=clamp(d.py+V.y,-60,60);d.pz=clamp(d.pz+V.z,-60,60);
  d.scale=clamp(d.scale*(c0+delta)/c0,.3,2.5);
  applyTransform();
}
// back to front by centre depth
const order=()=>state.devices.map(d=>({d,c:depth(d).center})).sort((a,b)=>b.c-a.c).map(x=>x.d);
// moves d until `ok(depth(d))` holds; a few passes because the scale compensation changes its extent a little
function settle(d,need){for(let i=0;i<4;i++){const delta=need(depth(d));if(Math.abs(delta)<1e-3)return true;push(d,delta);}return false;}
function layer(cmd){
  const d=sel();if(!d||state.devices.length<2)return;
  const list=order(),i=list.indexOf(d),others=list.filter(x=>x!==d);
  const front=x=>Math.min(0,x.near0-GAP-x.far),back=x=>Math.max(0,x.far0+GAP-x.near);
  let need=null;
  if(cmd==='front'){const n=Math.min(...others.map(o=>depth(o).near));need=x=>front({...x,near0:n});}
  else if(cmd==='back'){const f=Math.max(...others.map(o=>depth(o).far));need=x=>back({...x,far0:f});}
  else if(cmd==='forward'){if(i===list.length-1){toast('Zaten en önde');return;}const n=depth(list[i+1]).near;need=x=>front({...x,near0:n});}
  else if(cmd==='backward'){if(i===0){toast('Zaten en arkada');return;}const f=depth(list[i-1]).far;need=x=>back({...x,far0:f});}
  if(Math.abs(need(depth(d)))<1e-3){toast(cmd==='front'||cmd==='forward'?'Zaten önde':'Zaten arkada');return;}
  settle(d,need);syncSliders();
}

const btns=$('#layerBtns');
btns.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>layer(b.dataset.layer)));
onSyncUI(()=>{const many=state.devices.length>1;btns.querySelectorAll('button').forEach(b=>{b.disabled=!many;});});
// ⌘/Ctrl + ] forward, + [ backward; with Shift: to front / to back (physical bracket keys, any layout)
window.addEventListener('keydown',e=>{
  if(!(e.metaKey||e.ctrlKey)||(e.target&&/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)))return;
  const cmd=e.code==='BracketRight'?(e.shiftKey?'front':'forward'):e.code==='BracketLeft'?(e.shiftKey?'back':'backward'):null;
  if(cmd){e.preventDefault();layer(cmd);}
});

export {layer};
