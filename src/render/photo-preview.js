import {onChange,onIdle,overlays} from './renderer.js';
import {state} from '../state/state.js';

/* Live photo preview (opt-in, "Canlı fotoğraf önizlemesi"): once the raster render has converged and nothing changed
   for IDLE ms, the stage switches to the path tracer (pathtrace.js, loaded on first use) and converges to the photo
   render; any change switches straight back. It keeps the GPU busy, so it is throttled (one sample per MIN_GAP ms,
   capped in pathtrace.js) and pauses while the tab is hidden, an overlay (gizmo) is shown, or in the render harness. */
const IDLE=700,MIN_GAP=50;
let pathtrace=null,loading=false,last=performance.now(),lastSample=0;
onChange.add(()=>{last=performance.now();if(pathtrace)pathtrace.stopPreview();});
onIdle.add(()=>{
  const now=performance.now();
  if(window.__noPhotoPreview||!state.photoPreview||document.hidden||now-last<IDLE||now-lastSample<MIN_GAP)return;
  for(const o of overlays)if(o.visible)return;
  if(!pathtrace){if(!loading){loading=true;import('./pathtrace.js').then(m=>{pathtrace=m;},()=>{loading=false;});}return;}
  lastSample=now;pathtrace.previewTick();
});
