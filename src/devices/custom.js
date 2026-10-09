import * as THREE from 'three';
import {mesh} from './geometry.js';

function buildCustom(m,d){
  const g=new THREE.Group();let w=9,h=16;
  if(d.frameImg){const iw=d.frameImg.naturalWidth,ih=d.frameImg.naturalHeight,s=16/Math.max(iw,ih);w=iw*s;h=ih*s;}
  const plane=mesh(new THREE.PlaneGeometry(w,h),m.custom);
  plane.customDepthMaterial=new THREE.MeshDepthMaterial({alphaTest:.5});
  g.add(plane);
  return {group:g,screen:plane,glare:null,sw:w,sh:h,rotatable:false,custom:true};
}

export {buildCustom};
