import * as THREE from 'three';
import {BUILDERS} from './index.js';
import {FINISHES,M,applyColorTo,makeMats} from './materials.js';
import {RT,glareAmt,setHolder} from './rt.js';
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
  o.group.traverse(x=>{if(x.isMesh){const gl=!!x.material.userData.glare;x.castShadow=!gl&&!x.userData.decal;x.receiveShadow=state.selfShadow&&!gl;}});
  o.group.updateMatrixWorld(true);
  const box=new THREE.Box3();o.group.traverse(x=>{if(x.isMesh&&(!x.userData.ao||x.userData.fit))box.expandByObject(x);});  // contact shadows don't count
  o.group.position.sub(box.getCenter(new V3()));o.size=box.getSize(new V3());
  o.orient=new THREE.Group();o.orient.add(o.group);
  o.holder=new THREE.Group();o.holder.add(o.orient);o.holder.userData.devId=d.id;
  RT.set(d.id,o);comp.add(o.holder);
  if(o.hole)o.hole.visible=d.notch==='hole';
  applyGlare(o,d);
  if(d.type==='browser')updateChrome(d);
  setHolder(o,d);setScreenTexture(d);
  return o;
}
/* The cover glass reflection: d.glareAmt (0-1.5, 1 = the studio's look; older documents: glare false = 0). Another
   amount gives the device its own copy of M.glare with the environment and specular reflection scaled. */
function applyGlare(o,d){
  if(!o||!o.glare)return;
  const a=glareAmt(d);o.glare.visible=a>0;
  if(Math.abs(a-1)<1e-3){if(o.glare.material!==M.glare){o.glare.material.dispose();o.glare.material=M.glare;}return;}
  if(o.glare.material===M.glare)o.glare.material=M.glare.clone();
  o.glare.material.envMapIntensity=M.glare.envMapIntensity*a;o.glare.material.specularIntensity=M.glare.specularIntensity*a;
}
function disposeRT(id){
  const o=RT.get(id);if(!o)return;comp.remove(o.holder);
  if(o.glare&&o.glare.material!==M.glare)o.glare.material.dispose();
  // an imported model's geometry and materials belong to its asset (shared by its placements and the library)
  if(!o.model)o.holder.traverse(x=>{if(x.isMesh){x.geometry.dispose();if(x.customDepthMaterial)x.customDepthMaterial.dispose();}});
  Object.values(o.mats).forEach(mt=>{if(mt.map)mt.map.dispose();mt.dispose();});
  RT.delete(id);
}
function rebuild(d,refitToo){disposeRT(d.id);buildRT(d);if(refitToo)refit();applyTransform();}

export {applyGlare,buildRT,disposeRT,rebuild};
