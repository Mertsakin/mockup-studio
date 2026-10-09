import * as THREE from 'three';
import {patchShadows} from './pcss.js';
import {$} from '../util.js';

patchShadows();
const canvas=$('#gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setClearColor(0x000000,0);
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
const ANISO=renderer.capabilities.getMaxAnisotropy();
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(28,1,0.1,1000);

const redraw={dirty:true};function req(){redraw.dirty=true;}

export {ANISO,camera,canvas,redraw,renderer,req,scene};
