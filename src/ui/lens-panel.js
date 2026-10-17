import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {DOF_DEFAULT,F_STOPS,LENSES,dof,effectiveMm,fovFromMm,mmFromFov} from '../render/lens.js';
import {camera,canvas} from '../render/renderer.js';
import {comp} from '../render/stage.js';
import {applyTransform} from '../render/transform.js';
import {typeName} from '../state/constants.js';
import {byId,state} from '../state/state.js';
import {makeSlider,syncSliders} from './sliders.js';
import {onSyncUI,syncUI} from './sync.js';
import {toast} from './toast.js';
import {$,$$} from '../util.js';

/* Kamera › Objektif and Bokeh (render/lens.js has the optics).
   - "Objektif" menu: the lens presets (focal length + an aperture that suits it). The Objektif field is the focal
     length in mm (full-frame equivalent; the angle of view is in its tooltip), it replaces the old Perspektif angle.
   - Bokeh switch: depth of field on / off. Its settings: Diyafram (f-number), Odak (the selected device, a device, or a
     point picked on the scene), Bıçak (aperture shape: round or 6 / 8 blades), Arka planı bulanıklaştır (the 2D
     background is blurred as if far behind, ui/layout.js). */
const setDof=patch=>{state.dof=Object.assign(dof(),patch);applyTransform();syncUI();};

/* ---------- focal length */
const lensObj={get mm(){return mmFromFov(state.scene.fov);},set mm(v){state.scene.fov=fovFromMm(v);}};
makeSlider($('#lensSlot'),{id:'g-mm',k:'mm',l:'Objektif',w:1,min:14,max:300,step:1,reset:50,log:true,f:v=>Math.round(v)+' mm',
  note:'Odak uzaklığı (tam kare eşdeğeri). Kısa geniş ve derin, uzun düz ve sıkışık bir görünüm verir.'},()=>lensObj);
const mmLabel=$('#s-g-mm').previousElementSibling;
const lensWrap=$('#lenses');
LENSES.forEach(L=>{const b=document.createElement('button');b.type='button';b.textContent=L.n+' · f/'+L.f;b.dataset.mm=String(L.mm);
  b.addEventListener('click',()=>{state.scene.fov=fovFromMm(L.mm);setDof({f:L.f});syncSliders();});lensWrap.appendChild(b);});

/* ---------- depth of field */
const onEl=$('#dofOn');
onEl.addEventListener('change',()=>setDof({on:onEl.checked}));
const fObj={get f(){return dof().f;},set f(v){state.dof=Object.assign(dof(),{f:v});syncUI();}};
makeSlider($('#dofSliders'),{id:'g-fnum',k:'f',l:'Diyafram',s:'f/',w:1,min:F_STOPS[0],max:22,step:.1,reset:DOF_DEFAULT.f,log:true,
  f:v=>String(+v.toFixed(1)),note:'Küçük sayı geniş açıklık: daha sığ alan derinliği, daha güçlü bokeh.'},()=>fObj);
$$('#dofBlades button').forEach(b=>{b.type='button';b.addEventListener('click',()=>setDof({blades:+b.dataset.v}));});
const bgEl=$('#dofBg');bgEl.addEventListener('change',()=>setDof({bg:bgEl.checked}));

// focus: a select of "the selected device", each device, and a point picked on the scene
const focusEl=$('#dofFocus');
function devLabel(d){const n=typeName(d),same=state.devices.filter(x=>typeName(x)===n);return n+(same.length>1?' '+(same.indexOf(d)+1):'');}
function fillFocus(){
  const fc=dof().focus,opts=[['sel','Seçili cihaz']];
  state.devices.forEach(d=>opts.push(['d'+d.id,devLabel(d)]));
  if(fc&&fc.p)opts.push(['p','Seçilen nokta']);
  opts.push(['pick','Sahneden seç…']);
  const key=opts.map(o=>o.join(':')).join('|');
  if(focusEl.dataset.key!==key){focusEl.dataset.key=key;focusEl.innerHTML='';
    opts.forEach(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;focusEl.appendChild(o);});}
  focusEl.value=fc&&fc.p?'p':fc&&fc.dev!=null&&byId(fc.dev)?'d'+fc.dev:'sel';
}
focusEl.addEventListener('change',()=>{
  const v=focusEl.value;
  if(v==='pick'){fillFocus();startPick();return;}
  if(v==='p')return;
  setDof({focus:v==='sel'?null:{dev:+v.slice(1)||v.slice(1)}});
});

/* ---------- picking a focus point: the next click on the scene (Esc cancels) */
const ray=new THREE.Raycaster();let picking=false;
function startPick(){picking=true;document.documentElement.dataset.pick='focus';toast('Odaklanacak noktaya tıkla (Esc: vazgeç)');}
function endPick(){picking=false;delete document.documentElement.dataset.pick;}
canvas.addEventListener('pointerdown',e=>{
  if(!picking||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();endPick();
  const r=canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
  const hit=ray.intersectObjects([...RT.values()].map(o=>o.holder),true).find(h=>!h.object.userData.ao&&!h.object.userData.decal);
  if(!hit){toast('Orada bir cihaz yok; odak değişmedi');return;}
  setDof({focus:{p:comp.worldToLocal(hit.point.clone()).toArray().map(x=>+x.toFixed(3))}});
},true);
addEventListener('keydown',e=>{if(picking&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();endPick();}},true);

onSyncUI(()=>{
  const d=dof();onEl.checked=!!d.on;$('#dofOpts').hidden=!d.on;bgEl.checked=!!d.bg;
  $$('#dofBlades button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===(d.blades||0))));
  fillFocus();
  const mm=mmFromFov(state.scene.fov);
  lensWrap.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Math.abs(+b.dataset.mm-mm)<.5)));
  // the angle of view in the tooltip, and the longer effective lens when Yakınlık goes past the closest camera distance
  const eff=effectiveMm();
  mmLabel.title='Objektif: '+Math.round(mm)+' mm · görüş açısı '+(+state.scene.fov.toFixed(1))+'°'+
    (eff>mm*1.02?' · Yakınlıkla etkin '+Math.round(eff)+' mm':'')+' · sürükle, çift tıkla: 50 mm';
});
