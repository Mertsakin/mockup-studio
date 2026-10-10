import {applyLightPreset} from '../lights/actions.js';
import {LIGHT_PRESETS,LTYPES,MAX_LIGHTS,MODS,modOf,newLight,shadowCharacter} from '../lights/mods.js';
import {LRT,buildLight,disposeLight,onLightsUpdated,selLight} from '../lights/runtime.js';
import {applyTransform} from '../render/transform.js';
import {state} from '../state/state.js';
import {fDeg,fPct,fX,makeSlider} from './sliders.js';
import {onSyncUI,syncAll,syncUI} from './sync.js';
import {toast} from './toast.js';
import {$,$$,wrap} from '../util.js';

const LS_DEFS=[
  {id:'l-int',k:'intensity',l:'Yoğunluk',min:0,max:3,step:.01,reset:1,f:v=>v.toFixed(2)},
  {id:'l-az',k:'az',l:'Yön',min:-180,max:180,step:1,reset:0,f:fDeg,note:'0° kameranın olduğu taraf, 90° sağ, 180° arka.'},
  {id:'l-el',k:'el',l:'Yükseklik',min:2,max:90,step:1,reset:45,f:fDeg},
  {id:'l-dist',k:'dist',l:'Uzaklık',min:.6,max:5,step:.01,reset:2.5,f:fX,notmod:'sun'},
  {id:'l-size',k:'size',l:'Boyut',min:.01,max:4,step:.01,reset:1,f:v=>Math.round(v*100)+'%',notmod:'sun',after:()=>{const L=selLight();if(L&&L.mod!=='custom'){L.mod='custom';renderMods();}},note:'Sahne büyüklüğüne göre ışık kaynağının genişliği.'},
  {id:'l-angle',k:'angle',l:'Huzme açısı',min:5,max:80,step:1,reset:35,f:fDeg,only:'spot'},
  {id:'l-pen',k:'penumbra',l:'Huzme kenarı',min:0,max:1,step:.01,reset:.4,f:fPct,only:'spot'}
];
LS_DEFS.forEach(d=>makeSlider($('#lightSliders'),d,()=>selLight()||{}));
const lightCharEl=$('#lightChar');
const modGrid=$('#modGrid');
MODS.forEach(m=>{
  const b=document.createElement('button');b.type='button';b.textContent=m.n;b.dataset.mod=m.k;
  if(m.k==='custom')b.title='Kaynak boyutunu elle ayarladığında seçilir';
  b.addEventListener('click',()=>{
    const L=selLight();if(!L||m.k==='custom')return;
    const typeChanged=m.type&&m.type!==L.type;
    L.mod=m.k;['type','size','angle','penumbra'].forEach(k=>{if(m[k]!==undefined)L[k]=m[k];});
    if(typeChanged){disposeLight(L.id);buildLight(L);}
    applyTransform();syncAll();
  });
  modGrid.appendChild(b);
});
function renderMods(){const L=selLight();modGrid.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(!!L&&b.dataset.mod===L.mod)));}
onLightsUpdated(()=>{const L=state.lights.find(l=>l.id===state.selLight);if(L&&LRT.has(L.id))lightCharEl.innerHTML=shadowCharacter(L);});
const lightColorEl=$('#lightColor');lightColorEl.addEventListener('input',()=>{const L=selLight();if(!L)return;L.color=lightColorEl.value;applyTransform();renderLightList();});
const lightShadowEl=$('#lightShadow');lightShadowEl.addEventListener('change',()=>{const L=selLight();if(!L)return;L.shadow=lightShadowEl.checked;applyTransform();syncUI();});
$$('.seg[data-lkey]').forEach(seg=>{const key=seg.dataset.lkey;
  seg.querySelectorAll('button').forEach(b=>{b.type='button';b.addEventListener('click',()=>{const L=selLight();if(!L||L[key]===b.dataset.v)return;
    L[key]=b.dataset.v;if(key==='type'&&modOf(L.mod).type!==L.type)L.mod='custom';
    if(L.type!=='directional'&&L.dist<1.2)L.dist=2;disposeLight(L.id);buildLight(L);applyTransform();syncAll();});});});
const lpWrap=$('#lightPresets');
LIGHT_PRESETS.forEach(p=>{const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=p.n;
  b.addEventListener('click',()=>{applyLightPreset(p);syncAll();});lpWrap.appendChild(b);});
function renderLightList(){
  const el=$('#lightList');el.innerHTML='';
  state.lights.forEach((L,i)=>{const b=document.createElement('button');b.type='button';
    b.innerHTML='<span aria-hidden="true" style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:1px;background:'+L.color+';box-shadow:0 0 0 1px rgba(0,0,0,.25)"></span>Işık '+(i+1)+' ('+LTYPES[L.type].toLowerCase()+')';
    b.setAttribute('aria-pressed',String(L.id===state.selLight));
    b.addEventListener('click',()=>{state.selLight=L.id;syncAll();});el.appendChild(b);});
  if(!state.lights.length){const s=document.createElement('span');s.className='lbl';s.textContent='Işık yok. Sahne yalnızca ortam ışığıyla aydınlanıyor.';el.appendChild(s);}
}
$('#addLight').addEventListener('click',()=>{
  if(state.lights.length>=MAX_LIGHTS){toast('En fazla '+MAX_LIGHTS+' ışık eklenebilir.');return;}
  const n=state.lights.length,L=newLight({mod:'softbox',az:wrap(-40+n*70),el:40,intensity:.8});
  state.lights.push(L);state.selLight=L.id;buildLight(L);applyTransform();syncAll();
});
$('#removeLight').addEventListener('click',()=>{
  const L=selLight();if(!L)return;disposeLight(L.id);state.lights=state.lights.filter(x=>x.id!==L.id);
  state.selLight=state.lights.length?state.lights[state.lights.length-1].id:null;applyTransform();syncAll();
});
onSyncUI(()=>{
  const L=selLight();$('#lightBox').hidden=!L;$('#removeLight').disabled=!L;$('#addLight').disabled=state.lights.length>=MAX_LIGHTS;
  if(L){
    $$('.seg[data-lkey]').forEach(seg=>{const v=String(L[seg.dataset.lkey]);seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));});
    $$('#lightSliders [data-only]').forEach(el=>{el.hidden=!el.dataset.only.split(' ').includes(L.type);});
    $$('#lightSliders [data-notmod]').forEach(el=>{el.hidden=el.dataset.notmod===L.mod;});
    lightCharEl.innerHTML=shadowCharacter(L);renderMods();
    lightColorEl.value=L.color;lightShadowEl.checked=L.shadow;$('#lightShadowSlot').hidden=!L.shadow;
  }
  renderLightList();
});
