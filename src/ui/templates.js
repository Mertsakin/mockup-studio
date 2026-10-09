import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {buildRT,disposeRT} from '../devices/runtime.js';
import {applyLightPreset} from '../lights/actions.js';
import {LIGHT_PRESETS} from '../lights/mods.js';
import {renderer} from '../render/renderer.js';
import {pivot} from '../render/stage.js';
import {applyTransform,refit} from '../render/transform.js';
import {TEMPLATES} from '../state/templates.js';
import {newDevice,state} from '../state/state.js';
import {bgCss,layout} from './layout.js';
import {syncAll} from './sync.js';

/* Templates are plain scene descriptions (see state/templates.js). Applying one turns it into ordinary studio state:
   everything stays editable afterwards. Screenshots already loaded move to the new devices of the same type. */
const DEVICE_KEYS=['type','px','py','pz','rx','ry','rz','scale','colorKey','custom','finish','lidAngle','backFinish','landscape','notch',
  'pageRatio','winRatio','theme','url','glare','fit'];
const KEEP=['img','imgName','fit','screenBg','frameImg','frameName','screenRect','scroll','siteUrl'];

// Moves devices vertically so their lowest points line up (they stand on one floor whatever the lid angle).
function settleDevices(){
  const rot=pivot.rotation.clone();pivot.rotation.set(0,0,0);pivot.updateMatrixWorld(true);
  const low=new Map();
  state.devices.forEach(d=>{const o=RT.get(d.id),b=new THREE.Box3();
    o.holder.traverse(x=>{if(x.isMesh&&x.visible&&!x.userData.ao)b.expandByObject(x);});low.set(d.id,b.min.y);});
  const floor=Math.min(...low.values());
  state.devices.forEach(d=>{d.py=+(d.py+floor-low.get(d.id)).toFixed(3);});
  pivot.rotation.copy(rot);
}
function applyTemplate(t){
  const pool={};state.devices.forEach(d=>{(pool[d.type]=pool[d.type]||[]).push(d);});
  const next=t.devices.map(it=>{
    const nd=newDevice(it.type),r=(pool[it.type]||[]).shift();
    DEVICE_KEYS.forEach(k=>{if(it[k]!==undefined)nd[k]=it[k];});
    if(r)KEEP.forEach(k=>{if(r[k]!==undefined&&r[k]!==null)nd[k]=r[k];});
    return nd;
  });
  [...RT.keys()].forEach(disposeRT);
  state.devices=next;state.selected=next[0].id;
  Object.assign(state,{ratio:t.ratio,floor:!!t.floor,wall:false,shadowOpacity:t.shadowOpacity??.55,exposure:t.exposure??1},t.bg);
  renderer.toneMappingExposure=state.exposure;
  Object.assign(state.scene,{rx:0,ry:0,rz:0,zoom:1,fov:28,panX:0,panY:0},t.scene);
  const p=LIGHT_PRESETS.find(x=>x.n===t.lights)||LIGHT_PRESETS[0];applyLightPreset(t.ambient!==undefined?Object.assign({},p,{ambient:t.ambient}):p);
  state.devices.forEach(buildRT);
  if(t.settle){settleDevices();}
  refit();applyTransform();bgCss();layout();syncAll();
}
// ?template=<id> opens the studio with that template
function templateFromUrl(){
  let id=null;try{id=new URLSearchParams(location.search).get('template');}catch(e){}
  const t=id&&TEMPLATES.find(x=>x.id===id);if(t)applyTemplate(t);return t||null;
}

export {applyTemplate,templateFromUrl};
