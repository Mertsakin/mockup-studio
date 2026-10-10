import * as THREE from 'three';
import {BUILDERS} from './index.js';
import {FINISHES,M,applyColorTo,makeMats} from './materials.js';
import {RT,setHolder} from './rt.js';
import {setScreenTexture,updateChrome} from './screen.js';
import {comp} from '../render/stage.js';
import {applyTransform,refit} from '../render/transform.js';
import {DEFAULT_FINISH} from '../state/constants.js';
import {state} from '../state/state.js';
import {D2R,V3} from '../util.js';

function buildRT(d){
  if(!d.finish||!FINISHES[d.finish])d.finish=DEFAULT_FINISH[d.type]||'brushed';
  const m=makeMats();applyColorTo(m,d);
  const o=BUILDERS[d.type](m,d);o.mats=m;
  if(o.lid)o.lid.rotation.x=-(d.lidAngle-90)*D2R;
  o.group.traverse(x=>{if(x.isMesh){x.castShadow=x.material!==M.glare&&!x.userData.decal;x.receiveShadow=state.selfShadow&&x.material!==M.glare;}});
  o.group.updateMatrixWorld(true);
  const box=new THREE.Box3();o.group.traverse(x=>{if(x.isMesh&&(!x.userData.ao||x.userData.fit))box.expandByObject(x);});  // contact shadows don't count
  o.group.position.sub(box.getCenter(new V3()));o.size=box.getSize(new V3());
  o.orient=new THREE.Group();o.orient.add(o.group);
  o.holder=new THREE.Group();o.holder.add(o.orient);o.holder.userData.devId=d.id;
  RT.set(d.id,o);comp.add(o.holder);
  if(o.hole)o.hole.visible=d.notch==='hole';
  if(o.glare)o.glare.visible=d.glare;
  if(d.type==='browser')updateChrome(d);
  setHolder(o,d);setScreenTexture(d);
  return o;
}
function disposeRT(id){
  const o=RT.get(id);if(!o)return;comp.remove(o.holder);
  o.holder.traverse(x=>{if(x.isMesh){x.geometry.dispose();if(x.customDepthMaterial)x.customDepthMaterial.dispose();}});
  Object.values(o.mats).forEach(mt=>{if(mt.map)mt.map.dispose();mt.dispose();});
  RT.delete(id);
}
function rebuild(d,refitToo){disposeRT(d.id);buildRT(d);if(refitToo)refit();applyTransform();}

export {buildRT,disposeRT,rebuild};
