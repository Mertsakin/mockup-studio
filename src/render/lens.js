import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {byId,state} from '../state/state.js';
import {camera} from './renderer.js';
import {comp} from './stage.js';

/* Lenses and depth of field, from photography (units: the scene is in cm, devices at their real size).
   - Focal length: the lens is a full-frame (36 × 24 mm) equivalent; state.scene.fov is its vertical angle,
     mm = 12 / tan(fov / 2). LENSES are the menu's presets (each with an aperture that suits it).
   - Depth of field (state.dof = {on, f (f-number), focus: null | {dev} | {p: [x, y, z] in composition space},
     blades (0: round, 5–9: polygon), bg (blur the 2D background too)}): a thin lens. The aperture's diameter is
     focal length / f-number; a point off the focus plane spreads over a circle in proportion. The raster preview
     samples the aperture over its accumulated samples (render/accumulation.js: the camera moves within the aperture
     and the projection shifts so the focus plane stays put), the path tracer gets the same lens (pathtrace.js).
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
const DOF_DEFAULT={on:false,f:2.8,focus:null,blades:0,bg:true};
const dof=()=>Object.assign({},DOF_DEFAULT,state.dof||{});

// the camera's actual focal length (mm), with the long-lens part of Yakınlık
function effectiveMm(){const v=2*Math.atan(Math.tan(camera.fov*Math.PI/360)/(camera.zoom||1));return 12/Math.tan(v/2);}
// aperture diameter in scene units (cm)
const apertureCm=()=>effectiveMm()/10/dof().f;
// the focus target in world space: a device's centre, a picked point, or the composition's centre
const V=new THREE.Vector3(),B=new THREE.Box3();
function focusPoint(){
  const d=dof(),fc=d.focus;
  if(fc&&fc.p){V.fromArray(fc.p);return comp.localToWorld(V.clone());}
  const dev=fc&&fc.dev!=null?byId(fc.dev):byId(state.selected)||state.devices[0];
  const o=dev&&RT.get(dev.id);
  if(o){B.makeEmpty();o.holder.updateWorldMatrix(true,true);o.holder.traverse(x=>{if(x.isMesh&&!x.userData.ao&&!x.userData.decal)B.expandByObject(x);});if(!B.isEmpty())return B.getCenter(new THREE.Vector3());}
  return comp.localToWorld(new THREE.Vector3());
}
// distance from the camera to the focus plane (the camera looks down -z)
const focusDistance=()=>Math.max(1,camera.position.z-focusPoint().z);
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

export {DOF_DEFAULT,F_STOPS,LENSES,apertureCm,apertureSample,backgroundBlurPx,dof,dofOn,effectiveMm,focusDistance,focusPoint,fovFromMm,mmFromFov};
