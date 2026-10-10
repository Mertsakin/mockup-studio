import {applyAmbient} from '../lights/runtime.js';
import {renderer} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {SCALE_MAX,SCALE_MIN,ZOOM_MAX,ZOOM_MIN} from '../state/constants.js';
import {sel,state,view} from '../state/state.js';
import {$} from '../util.js';

/* ---------- sliders ---------- */
const SLIDERS=[];
// the track's accent fill follows the value (CSS --p, 0..1)
const paint=input=>{const a=+input.min,b=+input.max;input.style.setProperty('--p',b>a?(input.value-a)/(b-a):0);};
/* def.log: the slider moves on a logarithmic scale (wide ranges like 0.1–10×: 1× stays mid-track, small values
   keep their precision). The input then holds ln(value). */
// def.span(value): half-width of a symmetric range that adapts to the scene (device position: never less than 60 cm,
// about 2.5 scene radii, and always room for the current value); updated on sync, not while the slider is dragged
const POS_SPAN=v=>Math.max(60,Math.ceil(view.fitRadius*2.5/10)*10,Math.ceil(Math.abs(v||0)*1.25/10)*10);
const toIn=(def,v)=>def.log?Math.log(v):v,fromIn=(def,v)=>def.log?+Math.exp(v).toFixed(3):v;
const fDeg=v=>Math.round(v)+'°',fX=v=>v.toFixed(2)+'×',fPct=v=>Math.round(v*100)+'%',fU=v=>v.toFixed(1);
function makeSlider(parent,def,getObj){
  const el=document.createElement('div');el.className='slider';const id='s-'+def.id;
  el.innerHTML='<div class="top"><label for="'+id+'"'+(def.note?' title="'+def.note+'"':'')+'>'+def.l+'</label><output for="'+id+'"></output></div><input type="range" id="'+id+'" min="'+toIn(def,def.min)+'" max="'+toIn(def,def.max)+'" step="'+(def.log?.001:def.step)+'">'+(def.note?'<div class="note">'+def.note+'</div>':'');
  const input=el.querySelector('input'),out=el.querySelector('output');
  if(def.only)el.dataset.only=def.only;
  if(def.notmod)el.dataset.notmod=def.notmod;
  input.addEventListener('input',()=>{const o=getObj();o[def.k]=fromIn(def,parseFloat(input.value));paint(input);out.textContent=def.f(o[def.k]);if(def.after)def.after();applyTransform();});
  input.addEventListener('dblclick',()=>{const o=getObj();o[def.k]=def.reset;syncSliders();if(def.after)def.after();applyTransform();});
  paint(input);parent.appendChild(el);SLIDERS.push({def,input,out,getObj});
}
const G=()=>state.scene;
[
  {id:'g-ry',k:'ry',l:'Dönüş',min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'g-rx',k:'rx',l:'Eğim',min:-90,max:90,step:1,reset:0,f:fDeg},
  {id:'g-rz',k:'rz',l:'Yatış',min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'g-zoom',k:'zoom',l:'Yakınlık',min:ZOOM_MIN,max:ZOOM_MAX,step:.01,reset:1,f:fX,log:true},
  {id:'g-fov',k:'fov',l:'Perspektif',min:6,max:60,step:1,reset:28,f:fDeg,note:'Düşük değer düz, yüksek değer derin bir görünüm verir.'},
  {id:'g-panX',k:'panX',l:'Yatay kayma',min:-.6,max:.6,step:.01,reset:0,f:fPct},
  {id:'g-panY',k:'panY',l:'Dikey kayma',min:-.6,max:.6,step:.01,reset:0,f:fPct}
].forEach(d=>makeSlider($('#angleSliders'),d,G));
[
  {id:'d-px',k:'px',l:'Yatay',min:-60,max:60,step:.1,reset:0,f:fU,span:POS_SPAN},
  {id:'d-py',k:'py',l:'Dikey',min:-60,max:60,step:.1,reset:0,f:fU,span:POS_SPAN},
  {id:'d-pz',k:'pz',l:'Derinlik',min:-60,max:60,step:.1,reset:0,f:fU,span:POS_SPAN},
  {id:'d-ry',k:'ry',l:'Dönüş',min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'d-rx',k:'rx',l:'Eğim',min:-90,max:90,step:1,reset:0,f:fDeg},
  {id:'d-rz',k:'rz',l:'Yatış',min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'d-scale',k:'scale',l:'Ölçek',min:SCALE_MIN,max:SCALE_MAX,step:.01,reset:1,f:fX,log:true}
].forEach(d=>makeSlider($('#devSliders'),d,sel));
makeSlider($('#lidSlot'),{id:'d-lid',k:'lidAngle',l:'Kapak açısı',min:70,max:170,step:1,reset:112,f:fDeg},sel);
makeSlider($('#shadowSlot'),{id:'g-shadow',k:'shadowOpacity',l:'Yoğunluk',min:.05,max:1,step:.01,reset:.55,f:fPct},()=>state);
makeSlider($('#wallSlot'),{id:'g-wall',k:'wallGap',l:'Duvar mesafesi',min:0,max:1.5,step:.01,reset:.35,f:fPct},()=>state);
makeSlider($('#ambientSlot'),{id:'g-exp',k:'exposure',l:'Pozlama',min:.4,max:2.2,step:.01,reset:1,f:v=>v.toFixed(2),after:()=>{renderer.toneMappingExposure=state.exposure;}},()=>state);
makeSlider($('#ambientSlot'),{id:'g-amb',k:'ambient',l:'Ortam ışığı',min:0,max:2,step:.01,reset:1,f:fPct,note:'Işıkların dışında kalan genel aydınlık. Azaldıkça gölgeler koyulaşır.',after:applyAmbient},()=>state);
function syncSliders(){SLIDERS.forEach(s=>{const o=s.getObj();if(o[s.def.k]===undefined)return;
  if(s.def.span&&document.activeElement!==s.input){const r=s.def.span(o[s.def.k]);s.input.min=String(-r);s.input.max=String(r);}
  s.input.value=toIn(s.def,o[s.def.k]);paint(s.input);s.out.textContent=s.def.f(o[s.def.k]);});}

export {fDeg,fPct,fX,makeSlider,syncSliders};
