import {applyAmbient} from '../lights/runtime.js';
import {renderer} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {sel,state} from '../state/state.js';
import {$} from '../util.js';

/* ---------- sliders ---------- */
const SLIDERS=[];
const fDeg=v=>Math.round(v)+'°',fX=v=>v.toFixed(2)+'×',fPct=v=>Math.round(v*100)+'%',fU=v=>v.toFixed(1);
function makeSlider(parent,def,getObj){
  const el=document.createElement('div');el.className='slider';const id='s-'+def.id;
  el.innerHTML='<div class="top"><label for="'+id+'">'+def.l+'</label><output for="'+id+'"></output></div><input type="range" id="'+id+'" min="'+def.min+'" max="'+def.max+'" step="'+def.step+'">'+(def.note?'<div class="note">'+def.note+'</div>':'');
  const input=el.querySelector('input'),out=el.querySelector('output');
  if(def.only)el.dataset.only=def.only;
  if(def.notmod)el.dataset.notmod=def.notmod;
  input.addEventListener('input',()=>{const o=getObj();o[def.k]=parseFloat(input.value);out.textContent=def.f(o[def.k]);if(def.after)def.after();applyTransform();});
  input.addEventListener('dblclick',()=>{const o=getObj();o[def.k]=def.reset;syncSliders();if(def.after)def.after();applyTransform();});
  parent.appendChild(el);SLIDERS.push({def,input,out,getObj});
}
const G=()=>state.scene;
[
  {id:'g-ry',k:'ry',l:'Yatay dönüş',min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'g-rx',k:'rx',l:'Eğim',min:-90,max:90,step:1,reset:0,f:fDeg},
  {id:'g-rz',k:'rz',l:'Yan yatış',min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'g-zoom',k:'zoom',l:'Yakınlaştırma',min:.3,max:3,step:.01,reset:1,f:fX},
  {id:'g-fov',k:'fov',l:'Perspektif',min:6,max:60,step:1,reset:28,f:fDeg,note:'Düşük değer düz, yüksek değer derin bir görünüm verir.'},
  {id:'g-panX',k:'panX',l:'Yatay kaydırma',min:-.6,max:.6,step:.01,reset:0,f:fPct},
  {id:'g-panY',k:'panY',l:'Dikey kaydırma',min:-.6,max:.6,step:.01,reset:0,f:fPct}
].forEach(d=>makeSlider($('#angleSliders'),d,G));
[
  {id:'d-px',k:'px',l:'Yatay konum',min:-60,max:60,step:.1,reset:0,f:fU},
  {id:'d-py',k:'py',l:'Dikey konum',min:-60,max:60,step:.1,reset:0,f:fU},
  {id:'d-pz',k:'pz',l:'Derinlik',min:-60,max:60,step:.1,reset:0,f:fU},
  {id:'d-ry',k:'ry',l:'Kendi ekseninde dönüş',min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'d-rx',k:'rx',l:'Eğim',min:-90,max:90,step:1,reset:0,f:fDeg},
  {id:'d-rz',k:'rz',l:'Yan yatış',min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'d-scale',k:'scale',l:'Ölçek',min:.3,max:2.5,step:.01,reset:1,f:fX}
].forEach(d=>makeSlider($('#devSliders'),d,sel));
makeSlider($('#lidSlot'),{id:'d-lid',k:'lidAngle',l:'Kapak açısı',min:70,max:170,step:1,reset:112,f:fDeg},sel);
makeSlider($('#shadowSlot'),{id:'g-shadow',k:'shadowOpacity',l:'Gölge yoğunluğu',min:.05,max:1,step:.01,reset:.55,f:fPct},()=>state);
makeSlider($('#wallSlot'),{id:'g-wall',k:'wallGap',l:'Duvar uzaklığı',min:0,max:1.5,step:.01,reset:.35,f:fPct},()=>state);
makeSlider($('#ambientSlot'),{id:'g-exp',k:'exposure',l:'Pozlama',min:.4,max:2.2,step:.01,reset:1,f:v=>v.toFixed(2),after:()=>{renderer.toneMappingExposure=state.exposure;}},()=>state);
makeSlider($('#ambientSlot'),{id:'g-amb',k:'ambient',l:'Ortam ışığı',min:0,max:2,step:.01,reset:1,f:fPct,note:'Işıkların dışında kalan genel aydınlık. Azaldıkça gölgeler koyulaşır.',after:applyAmbient},()=>state);
function syncSliders(){SLIDERS.forEach(s=>{const o=s.getObj();if(o[s.def.k]===undefined)return;s.input.value=o[s.def.k];s.out.textContent=s.def.f(o[s.def.k]);});}

export {fDeg,fPct,fX,makeSlider,syncSliders};
