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
const redraw={dirty:true};function req(){redraw.dirty=true;}

export {ANISO,LIGHT_SCALE,camera,canvas,redraw,renderer,req,scene};
