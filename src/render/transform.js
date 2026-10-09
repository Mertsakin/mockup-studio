import * as THREE from 'three';
import {M} from '../devices/materials.js';
import {RT,setHolder} from '../devices/rt.js';
import {updateLights} from '../lights/runtime.js';
import {camera,req,scene} from './renderer.js';
import {comp,ground,groundMat,pivot,wall} from './stage.js';
import {byId,state,view} from '../state/state.js';
import {D2R,V3} from '../util.js';

/* ---------- transforms ---------- */
function refit(){
  const pr=pivot.rotation.clone(),pp=pivot.position.clone();
  pivot.rotation.set(0,0,0);pivot.position.set(0,0,0);comp.position.set(0,0,0);
  RT.forEach((o,id)=>setHolder(o,byId(id)));scene.updateMatrixWorld(true);
  const box=new THREE.Box3();RT.forEach(o=>box.expandByObject(o.holder));
  if(box.isEmpty())return;
  view.fitBox=box.clone();comp.position.copy(box.getCenter(new V3())).negate();
  view.fitRadius=Math.max(1,box.getSize(new V3()).length()/2);
  pivot.rotation.copy(pr);pivot.position.copy(pp);
}
const tmpV=new V3();
function extents(){
  let minY=Infinity,minZ=Infinity;
  RT.forEach(o=>o.holder.traverse(x=>{
    if(!x.isMesh||!x.visible||x.material===M.glare)return;
    const p=x.geometry.attributes.position,mw=x.matrixWorld;
    for(let i=0;i<p.count;i++){tmpV.fromBufferAttribute(p,i).applyMatrix4(mw);if(tmpV.y<minY)minY=tmpV.y;if(tmpV.z<minZ)minZ=tmpV.z;}
  }));
  return {y:isFinite(minY)?minY:0,z:isFinite(minZ)?minZ:0};
}
function camDist(){
  const S=state.scene,v=S.fov*D2R,h=2*Math.atan(Math.tan(v/2)*view.aspect),eff=Math.min(v,h);
  return view.fitRadius/Math.sin(eff/2)*.9/S.zoom;
}
function applyTransform(){
  const S=state.scene;
  pivot.rotation.set(S.rx*D2R,S.ry*D2R,S.rz*D2R,'YXZ');
  RT.forEach((o,id)=>{const d=byId(id);if(d)setHolder(o,d);});
  const v=S.fov*D2R,dist=camDist();
  camera.fov=S.fov;camera.aspect=view.aspect;camera.position.set(0,0,dist);
  camera.near=Math.max(.05,dist*.03);camera.far=dist*5+2000;camera.lookAt(0,0,0);camera.updateProjectionMatrix();
  const vh=2*dist*Math.tan(v/2),vw=vh*view.aspect;
  pivot.position.set(S.panX*vw,S.panY*vh,0);
  scene.updateMatrixWorld(true);
  const ex=extents(),R=view.fitRadius;
  ground.position.set(pivot.position.x,ex.y-.004,0);ground.visible=state.floor;
  wall.position.set(pivot.position.x,ex.y-.004+2000,ex.z-state.wallGap*R);wall.visible=state.wall;
  groundMat.opacity=state.shadowOpacity;groundMat.color.set(state.shadowColor).convertSRGBToLinear();
  updateLights();
  req();
}

export {applyTransform,camDist,refit};
