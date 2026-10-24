import {comp} from './stage.js';
import {applyTransform} from './transform.js';
import {CAM_KEYS,DEV_KEYS,LIGHT_KEYS} from '../state/sequence.js';
import {state,view} from '../state/state.js';

/* A camera flight between two artboards (state/sequence.js) writes values in between into the live scene: the camera
   (state.scene fields plus the framing: the composition offset and radius that camDist reads), and, when the boards'
   devices or lights match, each device's and light's fields. Nothing here records animation: the callers mute the
   recorder (ui/animate.js A.mute) while they drive the scene. applyTransform at the end: holders, lights, focus,
   req. */
function applyCam(cam){
  const S=state.scene;CAM_KEYS.forEach(k=>{if(typeof cam[k]==='number')S[k]=cam[k];});
  if(cam.comp)comp.position.fromArray(cam.comp);if(typeof cam.fitRadius==='number')view.fitRadius=cam.fitRadius;
}
function applyDevs(vals){state.devices.forEach((d,i)=>{const v=vals[i];if(!v)return;DEV_KEYS.forEach(k=>{if(typeof v[k]==='number')d[k]=v[k];});});}
function applyLights(vals){state.lights.forEach((L,i)=>{const v=vals[i];if(!v)return;LIGHT_KEYS.forEach(k=>{if(typeof v[k]==='number')L[k]=v[k];});});}
// mix: {cam, devs?, lights?} (the mixed values); writes them and updates the scene
function applyMix(mix){
  if(!mix)return;if(mix.cam)applyCam(mix.cam);if(mix.devs)applyDevs(mix.devs);if(mix.lights)applyLights(mix.lights);
  applyTransform();
}

export {applyCam,applyDevs,applyLights,applyMix};
