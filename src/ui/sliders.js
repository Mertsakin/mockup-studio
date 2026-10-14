import {applyAmbient} from '../lights/runtime.js';
import {renderer} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {SCALE_MAX,SCALE_MIN,ZOOM_MAX,ZOOM_MIN} from '../state/constants.js';
import {sel,state,view} from '../state/state.js';
import {$} from '../util.js';

/* ---------- value fields (formerly range sliders) ----------
   Every numeric setting is a compact field, Figma style: a short label and a value. Drag the label sideways to scrub
   (Shift: ×10), ↑ / ↓ step, type a value (or a little sum), double-click the label for the default. A field sits in a
   grid (.slgrid); def.w = 3 makes it a third of the row (default: half), 1 the whole row.
   def: {id, k, l (label; def.s: shorter one shown in the field), min, max, step, reset, f (format), log, span, note,
   after}. The input keeps the id 's-' + def.id and its label points at it (the animation ◆ attaches there). */
const SLIDERS=[];
/* def.log: steps and scrubbing are multiplicative (wide ranges like 0.1–10×). def.span(value): half-width of a
   symmetric range that adapts to the scene (device position); the value is kept within it. */
const POS_SPAN=v=>Math.max(60,Math.ceil(view.fitRadius*2.5/10)*10,Math.ceil(Math.abs(v||0)*1.25/10)*10);
const fDeg=v=>Math.round(v)+'°',fX=v=>v.toFixed(2)+'×',fPct=v=>Math.round(v*100)+'%',fU=v=>v.toFixed(1);
// what the user sees -> the stored value (percent fields show ×100)
const scaleOf=def=>def.f===fPct?100:1;
function bounds(def,v){if(def.span){const r=Math.max(def.span(v),Math.abs(v||0));return [-r*4,r*4];}return [def.min,def.max];}
function makeSlider(parent,def,getObj){
  const el=document.createElement('div');el.className='nf sl';const id='s-'+def.id;el.dataset.w=String(def.w||2);
  el.innerHTML='<label class="nfk" for="'+id+'"></label><input type="text" id="'+id+'" inputmode="decimal" spellcheck="false" autocomplete="off">';
  const lab=el.firstChild,input=el.lastChild;lab.textContent=def.s||def.l;
  lab.title=def.l+(def.note?': '+def.note:'')+' · sürükle, çift tıkla: varsayılan';input.setAttribute('aria-label',def.l);
  if(def.only)el.dataset.only=def.only;
  if(def.notmod)el.dataset.notmod=def.notmod;
  const set=v=>{const o=getObj();if(!o||!Number.isFinite(v))return;const [a,b]=bounds(def,o[def.k]);
    o[def.k]=def.log?+Math.min(b,Math.max(a,v)).toFixed(3):Math.min(b,Math.max(a,v));
    input.value=def.f(o[def.k]);if(def.after)def.after();applyTransform();};
  const read=()=>{const t=input.value.trim().replace(/,/g,'.').replace(/[^\d.+\-*/()eE]/g,'');
    if(!t)return NaN;let v;try{v=/^[\d.+\-*/()eE\s]+$/.test(t)?Function('"use strict";return ('+t+')')():parseFloat(t);}catch(e){v=parseFloat(t);}
    return v/scaleOf(def);};
  input.addEventListener('focus',()=>input.select());
  input.addEventListener('change',()=>{set(read());});
  input.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Enter'){e.preventDefault();set(read());input.select();}
    else if(e.key==='Escape'){e.preventDefault();syncOne(SLIDERS.find(x=>x.input===input));input.blur();}
    else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const o=getObj();if(!o)return;const d=e.key==='ArrowUp'?1:-1,m=e.shiftKey?10:1;
      set(def.log?o[def.k]*Math.exp(d*.02*m):o[def.k]+d*def.step*m);input.select();}
  });
  // scrub: drag the label (2 px per step; log values by 0.4 % per px)
  lab.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;const o=getObj();if(!o)return;const v0=o[def.k],x0=e.clientX;e.preventDefault();lab.setPointerCapture(e.pointerId);el.classList.add('scrub');
    const mv=ev=>{const dx=ev.clientX-x0,m=ev.shiftKey?10:1;set(def.log?v0*Math.exp(dx*.004*m):v0+Math.round(dx/2)*def.step*m);};
    const up=()=>{lab.removeEventListener('pointermove',mv);lab.removeEventListener('pointerup',up);lab.removeEventListener('pointercancel',up);el.classList.remove('scrub');};
    lab.addEventListener('pointermove',mv);lab.addEventListener('pointerup',up);lab.addEventListener('pointercancel',up);
  });
  lab.addEventListener('dblclick',()=>{const o=getObj();if(!o)return;o[def.k]=def.reset;syncSliders();if(def.after)def.after();applyTransform();});
  parent.appendChild(el);const rec={def,input,getObj,el};SLIDERS.push(rec);syncOne(rec);
}
function syncOne(s){if(!s)return;const o=s.getObj();if(!o||o[s.def.k]===undefined||document.activeElement===s.input)return;s.input.value=s.def.f(o[s.def.k]);}
const G=()=>state.scene;
[
  {id:'g-ry',k:'ry',l:'Dönüş',w:3,min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'g-rx',k:'rx',l:'Eğim',w:3,min:-90,max:90,step:1,reset:0,f:fDeg},
  {id:'g-rz',k:'rz',l:'Yatış',w:3,min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'g-zoom',k:'zoom',l:'Yakınlık',min:ZOOM_MIN,max:ZOOM_MAX,step:.01,reset:1,f:fX,log:true},
  {id:'g-fov',k:'fov',l:'Perspektif',min:6,max:60,step:1,reset:28,f:fDeg,note:'Düşük değer düz, yüksek değer derin bir görünüm verir.'},
  {id:'g-panX',k:'panX',l:'Yatay kayma',s:'Yatay',min:-.6,max:.6,step:.01,reset:0,f:fPct},
  {id:'g-panY',k:'panY',l:'Dikey kayma',s:'Dikey',min:-.6,max:.6,step:.01,reset:0,f:fPct}
].forEach(d=>makeSlider(d.k==='panX'||d.k==='panY'?$('#panSliders'):$('#angleSliders'),d,G));  // the shift lives under "Kayma"
[
  {id:'d-px',k:'px',l:'Yatay',s:'X',w:3,min:-60,max:60,step:.1,reset:0,f:fU,span:POS_SPAN},
  {id:'d-py',k:'py',l:'Dikey',s:'Y',w:3,min:-60,max:60,step:.1,reset:0,f:fU,span:POS_SPAN},
  {id:'d-pz',k:'pz',l:'Derinlik',s:'Z',w:3,min:-60,max:60,step:.1,reset:0,f:fU,span:POS_SPAN},
  {id:'d-ry',k:'ry',l:'Dönüş',w:3,min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'d-rx',k:'rx',l:'Eğim',w:3,min:-90,max:90,step:1,reset:0,f:fDeg},
  {id:'d-rz',k:'rz',l:'Yatış',w:3,min:-180,max:180,step:1,reset:0,f:fDeg},
  {id:'d-scale',k:'scale',l:'Ölçek',min:SCALE_MIN,max:SCALE_MAX,step:.01,reset:1,f:fX,log:true}
].forEach(d=>makeSlider($('#devSliders'),d,sel));
makeSlider($('#lidSlot'),{id:'d-lid',k:'lidAngle',l:'Kapak açısı',s:'Kapak',min:70,max:170,step:1,reset:112,f:fDeg},sel);
makeSlider($('#shadowSlot'),{id:'g-shadow',k:'shadowOpacity',l:'Yoğunluk',min:.05,max:1,step:.01,reset:.55,f:fPct},()=>state);
makeSlider($('#wallSlot'),{id:'g-wall',k:'wallGap',l:'Duvar mesafesi',s:'Duvar',min:0,max:1.5,step:.01,reset:.35,f:fPct},()=>state);
makeSlider($('#ambientSlot'),{id:'g-exp',k:'exposure',l:'Pozlama',min:.4,max:2.2,step:.01,reset:1,f:v=>v.toFixed(2),after:()=>{renderer.toneMappingExposure=state.exposure;}},()=>state);
makeSlider($('#ambientSlot'),{id:'g-amb',k:'ambient',l:'Ortam ışığı',s:'Ortam',min:0,max:2,step:.01,reset:1,f:fPct,note:'Işıkların dışında kalan genel aydınlık. Azaldıkça gölgeler koyulaşır.',after:applyAmbient},()=>state);
function syncSliders(){SLIDERS.forEach(syncOne);}

export {fDeg,fPct,fX,makeSlider,syncSliders};
