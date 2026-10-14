import * as THREE from 'three';
import {patchShadows} from './pcss.js';
import {$} from '../util.js';

patchShadows();
const canvas=$('#gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setClearColor(0x000000,0);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.BasicShadowMap;  // raw depth maps; PCSS filtering in pcss.js
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
const ANISO=renderer.capabilities.getMaxAnisotropy(),MAX_TEX=renderer.capabilities.maxTextureSize;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(28,1,0.1,1000);
/* Lens shift (panorama sets, ui/store.js): every board of a set shows its own slice of one wide frame taken by the same
   camera, so a device crossing the seam between two boards lines up exactly. shift.x moves the image horizontally in
   board widths (NDC: 2 per board). It is applied after three builds the projection, scaled by the view offset's zoom,
   so the live crop, export tiles, the path tracer and picking (projectionMatrixInverse) all see it. */
const shift={x:0,dx:0,dy:0};  // dx, dy: an extra NDC shift (the depth-of-field samples, render/accumulation.js)
{const base=camera.updateProjectionMatrix.bind(camera);
  camera.updateProjectionMatrix=function(){
    base();const sx=shift.x*2+shift.dx,sy=shift.dy;if(!sx&&!sy)return;
    const v=this.view,s=v&&v.enabled?v.fullWidth/v.width:1,t=v&&v.enabled?v.fullHeight/v.height:1,e=this.projectionMatrix.elements;
    // NDC x' = x + d  ->  clip x' = x + d·w; the perspective row w = -z, i.e. element 8 (column 2, row 0) -= d (y: 9)
    e[8]-=sx*s;e[9]-=sy*t;this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  };}

// r128 scaled direct light by PI in the shader ("legacy lights"). Light intensities in state and presets
// keep their r128 meaning; this factor is applied where they reach three.
const LIGHT_SCALE=Math.PI;
const redraw={dirty:true};
// Helpers that must never appear in photos or exports (gizmo); and callbacks run on every change (the photo preview
// restores the scene it prepared, synchronously, so nothing ever sees a scene in "photo set-up" state).
const overlays=new Set(),onChange=new Set(),onIdle=new Set();  // onIdle: every frame once the raster render has converged
function req(){redraw.dirty=true;onChange.forEach(f=>f());}
/* Crop: when the live artboard is only partly on screen (or zoomed in past the stage), the canvas covers just the
   visible part and the camera renders that slice of the full frame (view offset), so the live view is always drawn
   at the screen's own pixel density. crop = {fw,fh,x,y,w,h} in CSS pixels of the full board, or null. */
const crop={c:null};
function setCrop(c){crop.c=c;if(c)camera.setViewOffset(c.fw,c.fh,c.x,c.y,c.w,c.h);else camera.clearViewOffset();}

export {ANISO,LIGHT_SCALE,MAX_TEX,camera,shift,canvas,crop,onChange,onIdle,overlays,redraw,renderer,req,scene,setCrop};
