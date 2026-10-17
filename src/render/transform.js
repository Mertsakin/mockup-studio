import * as THREE from 'three';
import {M} from '../devices/materials.js';
import {RT,setHolder} from '../devices/rt.js';
import {updateLights} from '../lights/runtime.js';
import {camera,req,scene,shift} from './renderer.js';
import {comp,ground,groundMat,pivot,wall} from './stage.js';
import {byId,floorOn,state,view} from '../state/state.js';
import {D2R,V3,clamp,wrap} from '../util.js';

/* ---------- transforms ---------- */
function refit(){
  const pr=pivot.rotation.clone(),pp=pivot.position.clone();
  pivot.rotation.set(0,0,0);pivot.position.set(0,0,0);comp.position.set(0,0,0);
  RT.forEach((o,id)=>setHolder(o,byId(id)));scene.updateMatrixWorld(true);
  const box=new THREE.Box3();RT.forEach(o=>o.holder.traverse(x=>{if(x.isMesh&&(!x.userData.ao||x.userData.fit))box.expandByObject(x);}));  // contact shadows don't count
  if(!box.isEmpty()){
    view.fitBox=box.clone();comp.position.copy(box.getCenter(new V3())).negate();
    view.fitRadius=Math.max(1,box.getSize(new V3()).length()/2);
  }
  pivot.rotation.copy(pr);pivot.position.copy(pp);
}
// Re-framing recentres and rescales the whole composition, so with several devices it would visibly move the ones
// the user already placed. Edits re-frame only a lone device; "Kadraja sığdır", compositions and templates always do.
function autoRefit(){if(state.devices.length<2)refit();}
// Current bounding box of the devices in composition space (their real positions, not the last framing).
// compBox(id) skips that device; deviceBox(id) measures only it.
const compBox=exceptId=>boxOf(id=>id!==exceptId),deviceBox=onlyId=>boxOf(id=>id===onlyId);
function boxOf(include){
  const pr=pivot.rotation.clone(),pp=pivot.position.clone(),cp=comp.position.clone();
  pivot.rotation.set(0,0,0);pivot.position.set(0,0,0);comp.position.set(0,0,0);
  RT.forEach((o,id)=>{const d=byId(id);if(d)setHolder(o,d);});scene.updateMatrixWorld(true);
  const box=new THREE.Box3();
  RT.forEach((o,id)=>{if(include(id))o.holder.traverse(x=>{if(x.isMesh&&!x.userData.ao)box.expandByObject(x);});});
  pivot.rotation.copy(pr);pivot.position.copy(pp);comp.position.copy(cp);scene.updateMatrixWorld(true);
  return box;
}
const tmpV=new V3();
function extents(){
  let minY=Infinity,minZ=Infinity;
  RT.forEach(o=>{
    // an imported model: its precomputed extreme points (devices/model.js), not every vertex of the file
    if(o.model){const p=o.asset.pts,mw=o.fit.matrixWorld;for(let i=0;i<p.length;i+=3){tmpV.set(p[i],p[i+1],p[i+2]).applyMatrix4(mw);if(tmpV.y<minY)minY=tmpV.y;if(tmpV.z<minZ)minZ=tmpV.z;}return;}
    o.holder.traverse(x=>{
    if(!x.isMesh||!x.visible||x.material===M.glare||x.userData.ao)return;
    const p=x.geometry.attributes.position,mw=x.matrixWorld;
    for(let i=0;i<p.count;i++){tmpV.fromBufferAttribute(p,i).applyMatrix4(mw);if(tmpV.y<minY)minY=tmpV.y;if(tmpV.z<minZ)minZ=tmpV.z;}
  });});
  return {y:isFinite(minY)?minY:0,z:isFinite(minZ)?minZ:0};
}
// a panorama set frames the whole set (n boards side by side), not one board
const frameAspect=()=>view.aspect*(state.pano?state.pano.n:1);
function camDist(){
  const S=state.scene,v=S.fov*D2R,h=2*Math.atan(Math.tan(v/2)*frameAspect()),eff=Math.min(v,h);
  return view.fitRadius/Math.sin(eff/2)*.9/S.zoom;
}
const aoUp=new THREE.Vector3(),aoN=new THREE.Vector3();
function applyTransform(){
  const S=state.scene;
  pivot.rotation.set(S.rx*D2R,S.ry*D2R,S.rz*D2R,'YXZ');
  RT.forEach((o,id)=>{const d=byId(id);if(d)setHolder(o,d);});
  // camDist() is the effective distance (framing / zoom). The camera itself stops short of the composition
  // (1.2 radii) and a longer lens (camera.zoom) gives the rest, so high Yakınlık never puts it inside a device.
  const v=S.fov*D2R,eff=camDist(),dist=Math.max(eff,view.fitRadius*1.2);
  // the board's slice of a panorama: board i of n is shifted so the set's centre is the frame's centre
  shift.x=state.pano?-(2*state.pano.i+1-state.pano.n)/2:0;
  camera.fov=S.fov;camera.aspect=view.aspect;camera.zoom=dist/eff;camera.position.set(0,0,dist);
  // near at 6 % of the distance: the composition starts at 20 % (dist ≥ 1.2 radii), and depth precision is proportional
  // to near (3 % let the screen and its cover glass, 0.02 mm apart, fight at long lens + low Yakınlık)
  camera.near=Math.max(.05,dist*.06);camera.far=dist*5+2000;camera.lookAt(0,0,0);camera.updateProjectionMatrix();
  const vh=2*eff*Math.tan(v/2),vw=vh*view.aspect;  // visible size at the target plane
  pivot.position.set(S.panX*vw,S.panY*vh,0);
  scene.updateMatrixWorld(true);
  // contact shadows: only while the floor is shown and the device stands on it the way the plane assumes (faces up)
  aoUp.set(0,1,0).transformDirection(comp.matrixWorld);
  RT.forEach(o=>o.holder.traverse(x=>{if(x.userData.ao)x.visible=floorOn()&&aoN.set(0,0,1).transformDirection(x.matrixWorld).dot(aoUp)>.97;}));
  const ex=extents(),R=view.fitRadius;
  ground.position.set(pivot.position.x,ex.y-.004,0);ground.visible=floorOn();
  wall.position.set(pivot.position.x,ex.y-.004+2000,ex.z-state.wallGap*R);wall.visible=state.wall&&state.env!=='space';
  groundMat.opacity=state.shadowOpacity;groundMat.color.set(state.shadowColor);
  updateLights();
  req();
}

/* Orbit by a drag of (dx, dy) px, k degrees per px. Studio: a turntable (Dönüş around the vertical, Eğim held within
   ±90°: the floor stays below). Space (state.env): a trackball — the scene turns about the screen's own axes, so it
   goes over the top and upside down and a drag always moves the way the hand does; the result is written back as the
   scene's YXZ angles (Eğim / Dönüş / Yatış). */
const qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),eu=new THREE.Euler(),AX=new V3(1,0,0),AY=new V3(0,1,0);
function orbit(dx,dy,k){
  const S=state.scene;
  if(state.env!=='space'){S.ry=wrap(S.ry+dx*k);S.rx=clamp(S.rx+dy*k,-90,90);return;}
  qa.setFromEuler(eu.set(S.rx*D2R,S.ry*D2R,S.rz*D2R,'YXZ'));
  qb.setFromAxisAngle(AY,dx*k*D2R);qa.premultiply(qb);qb.setFromAxisAngle(AX,dy*k*D2R);qa.premultiply(qb);
  eu.setFromQuaternion(qa,'YXZ');S.rx=+(eu.x/D2R).toFixed(3);S.ry=+(eu.y/D2R).toFixed(3);S.rz=+(eu.z/D2R).toFixed(3);
}

export {applyTransform,orbit,autoRefit,camDist,compBox,deviceBox,refit};
