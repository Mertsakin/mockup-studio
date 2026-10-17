import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {byId,state} from '../state/state.js';
import {camera,crop} from './renderer.js';
import {comp} from './stage.js';

/* Lenses and depth of field, from photography (units: the scene is in cm, devices at their real size).
   - Focal length: the lens is a full-frame (36 × 24 mm) equivalent; state.scene.fov is its vertical angle,
     mm = 12 / tan(fov / 2). LENSES are the menu's presets (each with an aperture that suits it).
   - Depth of field (state.dof = {on, focus, blades (0: round, 5–9: polygon), bg (blur the 2D background too)}): a thin
     lens. The aperture's diameter is focal length / f-number; a point off the focus plane spreads over a circle in
     proportion. The raster preview samples the aperture over its accumulated samples (render/accumulation.js: the
     camera moves within the aperture and the projection shifts so the focus plane stays put), the path tracer gets
     the same lens (pathtrace.js).
   - The f-number and the focus distance are the camera's own, animatable values: state.scene.fnum and
     state.scene.focusDist (cm). Documents from before carried the f-number as dof.f (io/project.js converts).
   - Focus modes (state.dof.focus):
       null | {dev} | {p: [x, y, z] in composition space}   "Hedef": a device (the selected one when null) or a
                                                           picked point; the focus follows it when it moves
       {frame: [fx, fy]}                                   "Kadraj noktası": a point of the frame (fractions, top-left
                                                           origin). A ray through it finds what is there (devices and
                                                           models); its depth is the focus. Recomputed by applyTransform,
                                                           kept in frameFocus (runtime, never a document field, so
                                                           Canlandır records no keys for it)
       {dist: true}                                        "Uzaklık": state.scene.focusDist as it is (a focus pull is
                                                           keys on it)
     focusDistance() is the one source every renderer reads. holdFocus() freezes it for a video frame, so the motion
     blur sub-samples share one focus.
   The effective lens is the camera's real one: Yakınlık beyond the closest camera distance lengthens it
   (camera.zoom), and the depth of field follows. */
const SENSOR_H=24;  // mm, full frame
const mmFromFov=fov=>12/Math.tan(fov*Math.PI/360);
const fovFromMm=mm=>360/Math.PI*Math.atan(12/mm);
const LENSES=[
  {mm:24,n:'24 mm geniş açı',f:8},
  {mm:35,n:'35 mm',f:4},
  {mm:50,n:'50 mm normal',f:2.8},
  {mm:85,n:'85 mm portre',f:1.8},
  {mm:100,n:'100 mm makro',f:2.8},
  {mm:135,n:'135 mm tele',f:2},
  {mm:200,n:'200 mm süper tele',f:2.8}
];
const F_STOPS=[1.2,1.4,1.8,2,2.8,4,5.6,8,11,16];
const FNUM_DEFAULT=2.8,FOCUS_DIST_DEFAULT=60;  // cm
const DOF_DEFAULT={on:false,focus:null,blades:0,bg:true};
// the f-number: the camera's (state.scene.fnum); a document not yet converted still has it in dof.f
const fnum=()=>{const S=state.scene;return S.fnum!==undefined?S.fnum:state.dof&&state.dof.f!==undefined?state.dof.f:FNUM_DEFAULT;};
const dof=()=>{const d=Object.assign({},DOF_DEFAULT,state.dof||{});d.f=fnum();return d;};
const focusMode=()=>{const fc=dof().focus;return fc&&fc.frame?'frame':fc&&fc.dist?'dist':'target';};
// metres with a comma, as the fields and the timeline show a distance in cm
const fmtM=cm=>(cm/100).toFixed(2).replace('.',',')+' m';

// the camera's actual focal length (mm), with the long-lens part of Yakınlık
function effectiveMm(){const v=2*Math.atan(Math.tan(camera.fov*Math.PI/360)/(camera.zoom||1));return 12/Math.tan(v/2);}
// aperture diameter in scene units (cm)
const apertureCm=()=>effectiveMm()/10/dof().f;
// the centre of a device's body in world space (contact shadows and decals don't count)
const V=new THREE.Vector3(),B=new THREE.Box3();
function deviceCenter(dev){
  const o=dev&&RT.get(dev.id);if(!o)return null;
  B.makeEmpty();o.holder.updateWorldMatrix(true,true);o.holder.traverse(x=>{if(x.isMesh&&!x.userData.ao&&!x.userData.decal)B.expandByObject(x);});
  return B.isEmpty()?null:B.getCenter(new THREE.Vector3());
}
// depth of a world point along the camera's axis (the camera looks down -z)
const depthOf=p=>Math.max(1,camera.position.z-p.z);
// the "Hedef" device: the chosen one, else the selected one, else the first
const targetDevice=()=>{const fc=dof().focus,d=fc&&fc.dev!=null?byId(fc.dev):null;return d||byId(state.selected)||state.devices[0];};
// the focus target of the "Hedef" mode in world space: a device's centre, a picked point, or the composition's centre
function focusPoint(){
  const fc=dof().focus;
  if(fc&&fc.p){V.fromArray(fc.p);return comp.localToWorld(V.clone());}
  return deviceCenter(targetDevice())||comp.localToWorld(new THREE.Vector3());
}
// the depth of a device's centre: what "Buna odakla" writes into the focus distance
const deviceDepth=dev=>{const c=deviceCenter(dev);return c?depthOf(c):focusDistance();};

/* ---------- "Kadraj noktası": a ray through a point of the full frame */
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
const frameFocus={dist:null,dev:null,hit:false};  // runtime result of the last ray (dev: id of what is there)
const hold={on:false,dist:0};
/* The ray through frame fraction (fx, fy), whatever the live crop shows (renderer.js setCrop): the crop is a view offset
   on the camera, so the point is mapped into the crop's own NDC first. The panorama shift is in the projection matrix
   and comes along: the point is a point of this board's picture. */
function frameRay(fx,fy){
  let x=fx*2-1,y=1-fy*2;
  const c=crop.c;if(c){x=(fx*c.fw-c.x)/c.w*2-1;y=1-(fy*c.fh-c.y)/c.h*2;}
  ray.setFromCamera(ndc.set(x,y),camera);return ray;
}
const okHit=h=>h.object.visible&&!h.object.userData.ao&&!h.object.userData.decal;
/* What the frame point lands on: the nearest device or model along the ray (a model by its bounding box: cheap, and
   close enough for a focus plane). Nothing there: the device whose centre is nearest the ray, so the focus is still a
   pure function of the scene (a video frame does not depend on the frames before it). */
function updateFocus(){
  if(hold.on||focusMode()!=='frame'||!dofOn())return;
  const [fx,fy]=dof().focus.frame;frameRay(fx,fy);
  let best=null,bt=Infinity;
  RT.forEach((o,id)=>{
    if(o.model){B.setFromObject(o.fit);const p=ray.ray.intersectBox(B,V);if(p){const t=p.distanceTo(ray.ray.origin);if(t<bt){bt=t;best={id,p:p.clone()};}}return;}
    const h=ray.intersectObject(o.holder,true).find(okHit);
    if(h&&h.distance<bt){bt=h.distance;best={id,p:h.point};}
  });
  if(best){frameFocus.dist=depthOf(best.p);frameFocus.dev=best.id;frameFocus.hit=true;return;}
  let near=null,nd=Infinity;
  state.devices.forEach(d=>{const c=deviceCenter(d);if(!c)return;const k=ray.ray.distanceToPoint(c)/Math.max(1,c.distanceTo(ray.ray.origin));if(k<nd){nd=k;near={id:d.id,c};}});
  if(near){frameFocus.dist=depthOf(near.c);frameFocus.dev=near.id;frameFocus.hit=false;}
}
// distance from the camera to the focus plane, by mode
function focusDistance(){
  if(hold.on)return hold.dist;
  switch(focusMode()){
    case 'dist':return Math.max(1,state.scene.focusDist||FOCUS_DIST_DEFAULT);
    case 'frame':if(frameFocus.dist==null)updateFocus();return frameFocus.dist!=null?frameFocus.dist:depthOf(focusPoint());
    default:return depthOf(focusPoint());
  }
}
// a video frame: every sub-sample (motion blur) renders with the focus of the frame's own time
function holdFocus(on){if(on){hold.dist=focusDistance();hold.on=true;}else hold.on=false;}
// what is in focus, for the overlay: {mode, dist (cm), dev (a device, or null), point (a picked point)}
function focusInfo(){
  const m=focusMode(),fc=dof().focus;
  if(m==='dist')return {mode:m,dist:focusDistance(),dev:null,point:false};
  if(m==='frame')return {mode:m,dist:focusDistance(),dev:frameFocus.hit?byId(frameFocus.dev):null,near:!frameFocus.hit?byId(frameFocus.dev):null,point:false};
  return {mode:m,dist:focusDistance(),dev:fc&&fc.p?null:targetDevice(),point:!!(fc&&fc.p)};
}
const dofOn=()=>{const d=dof();return !!d.on&&d.f>0&&state.devices.length>0;};

/* a point of the aperture for sample i: low-discrepancy, uniform over a disc or a regular polygon (blades) */
function halton(b,i){let f=1,r=0;i+=1;while(i>0){f/=b;r+=f*(i%b);i=Math.floor(i/b);}return r;}
function apertureSample(i,blades){
  const u=halton(5,i),v=halton(7,i);
  if(!blades||blades<3){const r=Math.sqrt(u),a=2*Math.PI*v;return [r*Math.cos(a),r*Math.sin(a)];}
  // a triangle of the polygon (centre, two corners), uniform within it
  const k=Math.floor(u*blades),uu=u*blades-k,a0=2*Math.PI*k/blades+Math.PI/2,a1=a0+2*Math.PI/blades;
  const s=Math.sqrt(uu),w1=s*(1-v),w2=s*v;
  return [w1*Math.cos(a0)+w2*Math.cos(a1),w1*Math.sin(a0)+w2*Math.sin(a1)];
}
/* Circle of confusion of something infinitely far (the 2D background), in px of an output H px tall:
   c = f² / (N · (F − f)) on a 24 mm tall sensor. */
function backgroundBlurPx(H){
  if(!dofOn()||!dof().bg)return 0;
  const f=effectiveMm(),F=focusDistance()*10,N=dof().f;
  return Math.min(H*.08,f*f/(N*Math.max(f+1,F-f))/SENSOR_H*H);
}

export {DOF_DEFAULT,FNUM_DEFAULT,FOCUS_DIST_DEFAULT,F_STOPS,LENSES,apertureCm,apertureSample,backgroundBlurPx,deviceDepth,dof,dofOn,effectiveMm,fmtM,fnum,focusDistance,focusInfo,focusMode,focusPoint,fovFromMm,holdFocus,mmFromFov,updateFocus};
