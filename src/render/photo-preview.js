import {onChange,onIdle,overlays} from './renderer.js';
import {state} from '../state/state.js';

/* Photo preview: with quality "Fotoğraf", once the raster render has converged and nothing changed for IDLE ms, the
   stage switches to the path tracer (pathtrace.js, loaded on first use) and converges to the photo render; any change
   switches straight back. Not while an overlay (gizmo) is shown, nor in the render harness (window.__noPhotoPreview). */
const IDLE=700;
let pathtrace=null,loading=false,last=performance.now();
onChange.add(()=>{last=performance.now();if(pathtrace)pathtrace.stopPreview();});
onIdle.add(()=>{
  if(window.__noPhotoPreview||state.quality!=='photo'||performance.now()-last<IDLE)return;
  for(const o of overlays)if(o.visible)return;
  if(!pathtrace){if(!loading){loading=true;import('./pathtrace.js').then(m=>{pathtrace=m;},()=>{loading=false;});}return;}
  pathtrace.previewTick();
});
