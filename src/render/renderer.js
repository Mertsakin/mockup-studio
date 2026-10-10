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

export {ANISO,LIGHT_SCALE,MAX_TEX,camera,canvas,crop,onChange,onIdle,overlays,redraw,renderer,req,scene,setCrop};
