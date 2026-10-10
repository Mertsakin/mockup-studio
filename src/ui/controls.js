import {M} from '../devices/materials.js';
import {RT} from '../devices/rt.js';
import {req} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {state} from '../state/state.js';
import {renderDome} from './dome.js';
import {setGizmoMode} from './gizmo.js';
import {bgCss,layout} from './layout.js';
import {fDeg,makeSlider} from './sliders.js';
import {onSyncUI,syncUI} from './sync.js';
import {$,$$} from '../util.js';

/* ---------- generic segs & inputs ---------- */
function parseV(v){return v==='true'?true:v==='false'?false:v;}
$$('.seg[data-key]').forEach(seg=>{const key=seg.dataset.key;
  seg.querySelectorAll('button').forEach(b=>{b.type='button';b.addEventListener('click',()=>{state[key]=parseV(b.dataset.v);onGlobal(key);});});});
function onGlobal(key){
  if(key==='bgFit'||key==='gradType')bgCss();
  else if(key==='bg'){bgCss();if(state.bg==='image'&&!state.bgImg)$('#bgFile').click();}  // no image yet: ask for one
  else if(key==='gizmo')setGizmoMode(state.gizmo);
  else if(key==='ratio')layout();
  syncUI();
}
const bindColor=(id,key,fn)=>{const el=$('#'+id);el.value=state[key];el.addEventListener('input',()=>{state[key]=el.value;fn();});};
bindColor('solid','solid',bgCss);bindColor('bg1','bg1',bgCss);bindColor('bg2','bg2',bgCss);
const bindSwitch=(id,key,fn)=>{const el=$('#'+id);el.checked=state[key];el.addEventListener('change',()=>{state[key]=el.checked;if(fn)fn();applyTransform();syncUI();});};
bindSwitch('showDome','showDome',()=>renderDome());bindSwitch('floor','floor');bindSwitch('wall','wall');bindSwitch('markers','markers');
bindSwitch('selfShadow','selfShadow',()=>RT.forEach(o=>o.holder.traverse(x=>{if(x.isMesh)x.receiveShadow=state.selfShadow&&x.material!==M.glare;})));
bindColor('shadowColor','shadowColor',applyTransform);
const sizeEl=$('#size'),formatEl=$('#format');
sizeEl.value=String(state.size);sizeEl.addEventListener('change',()=>{state.size=parseInt(sizeEl.value,10);});
formatEl.value=state.format;formatEl.addEventListener('change',()=>{state.format=formatEl.value;syncUI();});
// custom artboard: whole pixels within 64..8192; applied as you type, normalised on change
const ART=['customW','customH'].map(k=>{const el=$('#'+k);el.value=state[k];
  const read=fix=>{const v=Math.round(+el.value);if(!isFinite(v)||v<1)return;state[k]=Math.min(8192,Math.max(64,v));if(fix)el.value=state[k];if(state.ratio==='custom')layout();};
  el.addEventListener('input',()=>read(false));el.addEventListener('change',()=>read(true));return el;});
const previewEl=$('#photoPreview');previewEl.checked=state.photoPreview;previewEl.addEventListener('change',()=>{state.photoPreview=previewEl.checked;req();});
const qualityEl=$('#quality');qualityEl.value=state.quality;qualityEl.addEventListener('change',()=>{state.quality=qualityEl.value;syncUI();});
// gradient angle (linear only)
makeSlider($('#gradAngleSlot'),{id:'g-gang',k:'gradAngle',l:'Açı',min:0,max:360,step:1,reset:135,f:fDeg,after:bgCss},()=>state);
onSyncUI(()=>{
  // inputs bound once at start-up; templates change state underneath them
  ['solid','bg1','bg2','shadowColor'].forEach(k=>{const el=$('#'+k);if(el&&document.activeElement!==el)el.value=state[k];});
  ['floor','wall','markers','selfShadow','showDome'].forEach(k=>{const el=$('#'+k);if(el)el.checked=state[k];});
  sizeEl.value=String(state.size);formatEl.value=state.format;qualityEl.value=state.quality;previewEl.checked=state.photoPreview;
  const custom=state.ratio==='custom';$('#artboard').hidden=!custom;$('#sizeRow').hidden=custom;
  ART.forEach(el=>{if(document.activeElement!==el)el.value=state[el.id];});
  $$('.seg[data-key]').forEach(seg=>{const v=String(state[seg.dataset.key]);seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));});
  $$('[data-bg]').forEach(el=>{el.hidden=el.dataset.bg!==state.bg;});
  $('#gradAngleSlot').hidden=state.bg!=='gradient'||state.gradType==='radial';  // the angle is for linear gradients
  $('#shadowSlot').hidden=!(state.floor||state.wall);
  $('#wallSlot').hidden=!state.wall;
  $('#export').textContent=(state.format==='jpg'?'JPG':'PNG')+' indir';
});

export {parseV};
