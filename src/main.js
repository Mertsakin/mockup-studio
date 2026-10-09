import {buildRT,rebuild} from './devices/runtime.js';
import {setScreenTexture,updateChrome} from './devices/screen.js';
import {applyLightPreset} from './lights/actions.js';
import {LIGHT_PRESETS} from './lights/mods.js';
import {startLoop} from './render/accumulation.js';
import {refit} from './render/transform.js';
import {state} from './state/state.js';
import {renderSaved} from './ui/angles.js';
import {bgCss,layout} from './ui/layout.js';
import {syncAll} from './ui/sync.js';
import {templateFromUrl} from './ui/templates.js';

// panels wire their DOM listeners and register their syncUI parts on import
import './ui/controls.js';
import './ui/devices-panel.js';
import './ui/lights-panel.js';
import './ui/image-input.js';
import './ui/capture.js';
import './ui/layers.js';
import './ui/pointer.js';
import './ui/dome.js';
import './export/export.js';

/* ---------- init ---------- */
bgCss();state.devices.forEach(buildRT);refit();applyLightPreset(LIGHT_PRESETS[0]);renderSaved();syncAll();layout();
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{state.devices.forEach(d=>{if(d.type==='laptop'){rebuild(d,false);return;}if(!d.img||d.type==='custom')setScreenTexture(d);if(d.type==='browser')updateChrome(d);});});
templateFromUrl();
startLoop();
if(import.meta.env.DEV)import('./debug.js').then(m=>m.exposeModules());
