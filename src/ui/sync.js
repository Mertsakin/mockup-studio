import {sel} from '../state/state.js';
import {syncSliders} from './sliders.js';

/* syncUI is assembled from parts: each panel registers how it reflects state (d = selected device). */
const parts=[];
function onSyncUI(fn){parts.push(fn);}
function syncUI(){const d=sel();parts.forEach(f=>f(d));}
function syncAll(){syncSliders();syncUI();}

export {onSyncUI,syncAll,syncUI};
