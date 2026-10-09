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
const ANISO=renderer.capabilities.getMaxAnisotropy();
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

export {ANISO,LIGHT_SCALE,camera,canvas,onChange,onIdle,overlays,redraw,renderer,req,scene};
