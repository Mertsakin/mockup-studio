import {applyTransform} from '../render/transform.js';
import {PRESETS} from '../state/constants.js';
import {state} from '../state/state.js';
import {syncSliders} from './sliders.js';
import {toast} from './toast.js';
import {$} from '../util.js';

/* ---------- scene presets & saved angles ---------- */
const presetWrap=$('#presets');
PRESETS.forEach(p=>{
  const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=p.n;
  b.addEventListener('click',()=>{const up=state.devices.some(d=>d.type==='laptop'||d.type==='monitor');
    Object.assign(state.scene,up?p.up:p.v);syncSliders();applyTransform();});
  presetWrap.appendChild(b);
});
const LS='mockup-studio-angles-v1',SKEYS=['rx','ry','rz','zoom','fov','panX','panY'];
function loadSaved(){try{const a=JSON.parse(localStorage.getItem(LS)||'[]');return Array.isArray(a)?a.filter(x=>x&&typeof x==='object'):[];}catch(e){return [];}}
function storeSaved(a){try{localStorage.setItem(LS,JSON.stringify(a));return true;}catch(e){return false;}}
const saved=loadSaved();
function applySaved(s){SKEYS.forEach(k=>{if(typeof s[k]==='number')state.scene[k]=s[k];});}
function renderSaved(){
  const el=$('#savedList');el.innerHTML='';
  saved.forEach((s,i)=>{
    const chip=document.createElement('span');chip.className='chip';
    const a=document.createElement('button');a.type='button';a.textContent=s.name;
    a.addEventListener('click',()=>{applySaved(s);syncSliders();applyTransform();});
    const x=document.createElement('button');x.type='button';x.className='x';x.textContent='×';x.setAttribute('aria-label',s.name+' açısını sil');
    x.addEventListener('click',()=>{saved.splice(i,1);storeSaved(saved);renderSaved();});
    chip.append(a,x);el.appendChild(chip);
  });
  $('#exportAll').hidden=saved.length<1;
  const empty=$('#savedEmpty');if(empty)empty.hidden=saved.length>0;
}
$('#saveAngle').addEventListener('click',()=>{
  const n=saved.reduce((m,s)=>{const k=parseInt(String(s.name||'').replace(/\D/g,''),10);return isNaN(k)?m:Math.max(m,k);},0)+1;
  const s={name:'Açı '+n};SKEYS.forEach(k=>s[k]=state.scene[k]);saved.push(s);
  renderSaved();toast(storeSaved(saved)?'Açı '+n+' kaydedildi':'Açı bu oturum için eklendi');
});

export {applySaved,renderSaved,saved};
