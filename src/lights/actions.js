import {newLight} from './mods.js';
import {LRT,applyAmbient,buildLight,disposeLight} from './runtime.js';
import {scheduleEnv} from '../render/environment.js';
import {applyTransform} from '../render/transform.js';
import {state} from '../state/state.js';

function rebuildLights(){[...LRT.keys()].forEach(disposeLight);state.lights.forEach(buildLight);applyAmbient();applyTransform();scheduleEnv(true);}
function applyLightPreset(p){
  state.ambient=p.ambient;state.lights=p.lights.map(x=>newLight(x));
  state.selLight=state.lights.length?state.lights[0].id:null;rebuildLights();
}

export {applyLightPreset,rebuildLights};
