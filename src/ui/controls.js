import {M} from '../devices/materials.js';
import {RT} from '../devices/rt.js';
import {canvas} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {state} from '../state/state.js';
import {renderDome} from './dome.js';
import {bgCss,layout} from './layout.js';
import {onSyncUI,syncUI} from './sync.js';
import {$,$$} from '../util.js';

/* ---------- generic segs & inputs ---------- */
function parseV(v){return v==='true'?true:v==='false'?false:v;}
$$('.seg[data-key]').forEach(seg=>{const key=seg.dataset.key;
  seg.querySelectorAll('button').forEach(b=>{b.type='button';b.addEventListener('click',()=>{state[key]=parseV(b.dataset.v);onGlobal(key);});});});
function onGlobal(key){
  if(key==='bg')bgCss();
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
onSyncUI(()=>{
  $$('.seg[data-key]').forEach(seg=>{const v=String(state[seg.dataset.key]);seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));});
  $$('[data-bg]').forEach(el=>{el.hidden=el.dataset.bg!==state.bg;});
  $('#shadowSlot').hidden=!(state.floor||state.wall);
  $('#wallSlot').hidden=!state.wall;
  $('#export').textContent=(state.format==='jpg'?'JPG':'PNG')+' indir';
  canvas.classList.toggle('move',state.mode==='move');
  $('#hint').textContent=state.mode==='move'
    ?'Bir cihazı sürükleyerek sahnede taşı. Döndürmek için üstten Döndür\u2019e geç.'
    :'Sürükleyerek sahneyi döndür, cihaza dokunarak seç. Işıkları sağ alttaki haritadan ya da sahnedeki kürelerden sürükle.';
});

export {parseV};
