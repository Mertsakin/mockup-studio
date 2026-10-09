import * as THREE from 'three';
import {lightTan} from './mods.js';
import {scheduleEnv} from '../render/environment.js';
import {req} from '../render/renderer.js';
import {ambU,hemi,lightRoot,pivot} from '../render/stage.js';
import {state,view} from '../state/state.js';
import {D2R,V3} from '../util.js';

const LRT=new Map();
const selLight=()=>state.lights.find(l=>l.id===state.selLight)||state.lights[0]||null;
function buildLight(L){
  let l;
  if(L.type==='spot'){l=new THREE.SpotLight();l.distance=0;}
  else if(L.type==='point'){l=new THREE.PointLight();l.distance=0;}
  else l=new THREE.DirectionalLight();
  lightRoot.add(l);if(l.target)lightRoot.add(l.target);
  const marker=new THREE.Mesh(new THREE.SphereGeometry(1,18,12),new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}));
  marker.castShadow=false;marker.receiveShadow=false;lightRoot.add(marker);
  LRT.set(L.id,{light:l,marker});
}
function disposeLight(id){
  const o=LRT.get(id);if(!o)return;
  lightRoot.remove(o.light);if(o.light.target)lightRoot.remove(o.light.target);lightRoot.remove(o.marker);
  if(o.light.shadow&&o.light.shadow.map){o.light.shadow.map.dispose();o.light.shadow.map=null;}
  if(o.light.dispose)o.light.dispose();
  o.marker.geometry.dispose();o.marker.material.dispose();LRT.delete(id);
}
function applyAmbient(){
  hemi.intensity=.2*state.ambient;ambU.value=.6*state.ambient;scheduleEnv();req();
}
// UI (light map, shadow description) refreshes after every light update
const uiHooks=[];
function onLightsUpdated(fn){uiHooks.push(fn);}
function updateLights(){
  scheduleEnv();
  const R=view.fitRadius,c=new V3(pivot.position.x,pivot.position.y,0);
  state.lights.forEach(L=>{
    const o=LRT.get(L.id);if(!o)return;const l=o.light;
    const az=L.az*D2R,el=L.el*D2R,d=R*L.dist;
    l.position.set(c.x+d*Math.cos(el)*Math.sin(az),c.y+d*Math.sin(el),c.z+d*Math.cos(el)*Math.cos(az));
    if(l.target){l.target.position.copy(c);l.target.updateMatrixWorld();}
    l.color.set(L.color).convertSRGBToLinear();l.intensity=L.intensity;
    if(L.type==='spot'){l.angle=L.angle*D2R;l.penumbra=L.penumbra;}
    l.castShadow=L.shadow;
    if(L.shadow){
      const sh=l.shadow,size=L.type==='point'?1024:2048;
      if(sh.mapSize.x!==size){sh.mapSize.set(size,size);if(sh.map){sh.map.dispose();sh.map=null;}}
      sh.bias=-.0004;if('normalBias' in sh)sh.normalBias=R*.0025;
      const cam=sh.camera,tan=lightTan(L),S=tan*d;
      if(L.type==='directional'){
        cam.left=-R*1.7;cam.right=R*1.7;cam.top=R*1.7;cam.bottom=-R*1.7;cam.near=.1;cam.far=d+R*3;
        sh.radius=Math.max(.5,(cam.far-cam.near)*tan/(3.4*R)*1000);
      } else if(L.type==='spot'){
        cam.far=d+R*2.5;cam.near=cam.far/10;
        sh.radius=-Math.max(.5,S/(cam.near*2*Math.tan(Math.min(L.angle,85)*D2R))*1000);
      } else {
        cam.near=Math.max(.1,d-R*1.8);cam.far=d+R*3;
        sh.radius=Math.max(.5,S*100);
      }
      cam.updateProjectionMatrix();
    }
    o.marker.position.copy(l.position);o.marker.scale.setScalar(R*.045);
    o.marker.material.color.set(L.color);o.marker.visible=state.markers;
  });
  uiHooks.forEach(f=>f());
}

export {LRT,applyAmbient,buildLight,disposeLight,onLightsUpdated,selLight,updateLights};
