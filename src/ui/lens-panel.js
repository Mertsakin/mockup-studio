import * as THREE from 'three';
import {RT} from '../devices/rt.js';
import {FNUM_DEFAULT,FOCUS_DIST_DEFAULT,F_STOPS,LENSES,deviceDepth,dof,dofOn,effectiveMm,fmtM,focusDistance,focusInfo,focusMode,fovFromMm,mmFromFov} from '../render/lens.js';
import {camera,canvas,onChange} from '../render/renderer.js';
import {comp} from '../render/stage.js';
import {applyTransform} from '../render/transform.js';
import {typeName} from '../state/constants.js';
import {byId,state} from '../state/state.js';
import {setQuiet} from './animate.js';
import {boardScreen,onLayout} from './layout.js';
import {makeSlider,syncSliders} from './sliders.js';
import {onSyncUI,syncUI} from './sync.js';
import {toast} from './toast.js';
import {$,$$,clamp} from '../util.js';

/* Kamera › Objektif and Bokeh (render/lens.js has the optics).
   - "Objektif" menu: the lens presets (focal length + an aperture that suits it). The Objektif field is the focal
     length in mm (full-frame equivalent; the angle of view is in its tooltip), it replaces the old Perspektif angle.
   - Bokeh switch: depth of field on / off. Its settings: Diyafram (f-number, the camera's state.scene.fnum: animatable),
     Odak mode (Hedef: a device or a point picked on the scene / Kadraj noktası: a point of the frame, dragged as a cross
     over the live board / Uzaklık: the camera's focus distance, state.scene.focusDist, with "Buna odakla" writing a
     device's current distance into it — in Canlandır that is a key, i.e. a focus pull), Bıçak (aperture shape),
     Arka planı bulanıklaştır (the 2D background is blurred as if far behind, ui/layout.js).
   - Overlays on the stage while Bokeh is on: the frame-point cross (frame mode) and a read-out of what is in focus.
     DOM elements, so they never reach an export. */
const setDof=patch=>{state.dof=Object.assign(dof(),patch);delete state.dof.f;applyTransform();syncUI();};
const G=()=>state.scene;

/* ---------- focal length */
const lensObj={get mm(){return mmFromFov(state.scene.fov);},set mm(v){state.scene.fov=fovFromMm(v);}};
makeSlider($('#lensSlot'),{id:'g-mm',k:'mm',l:'Objektif',w:1,min:14,max:300,step:1,reset:50,log:true,f:v=>Math.round(v)+' mm',
  note:'Odak uzaklığı (tam kare eşdeğeri). Kısa geniş ve derin, uzun düz ve sıkışık bir görünüm verir.'},()=>lensObj);
const mmLabel=$('#s-g-mm').previousElementSibling;
const lensWrap=$('#lenses');
LENSES.forEach(L=>{const b=document.createElement('button');b.type='button';b.textContent=L.n+' · f/'+L.f;b.dataset.mm=String(L.mm);
  b.addEventListener('click',()=>{state.scene.fov=fovFromMm(L.mm);state.scene.fnum=L.f;applyTransform();syncSliders();syncUI();});lensWrap.appendChild(b);});

/* ---------- depth of field */
const onEl=$('#dofOn');
onEl.addEventListener('change',()=>setDof({on:onEl.checked}));
// the f-number and the focus distance are camera fields: their fields record like the angles (◆ in Canlandır)
makeSlider($('#dofSliders'),{id:'g-fnum',k:'fnum',l:'Diyafram',s:'f/',w:1,min:F_STOPS[0],max:22,step:.1,reset:FNUM_DEFAULT,log:true,
  f:v=>String(+v.toFixed(1)),note:'Küçük sayı geniş açıklık: daha sığ alan derinliği, daha güçlü bokeh.'},G);
makeSlider($('#dofDistSlot'),{id:'g-focus',k:'focusDist',l:'Odak uzaklığı',s:'Odak',w:1,min:5,max:5000,step:1,reset:FOCUS_DIST_DEFAULT,log:true,scale:.01,f:fmtM,
  note:'Kameradan net düzleme uzaklık. Canlandır’da anahtar kare alır: iki anda iki cihaza "Buna odakla" bir odak çekmedir.'},G);
$$('#dofBlades button').forEach(b=>{b.type='button';b.addEventListener('click',()=>setDof({blades:+b.dataset.v}));});
const bgEl=$('#dofBg');bgEl.addEventListener('change',()=>setDof({bg:bgEl.checked}));

/* ---------- focus mode: Hedef / Kadraj noktası / Uzaklık */
let lastFrame=[.5,.5];  // the frame point kept while another mode is on (editor state)
function setMode(m){
  if(m===focusMode())return;
  if(focusMode()==='frame')lastFrame=dof().focus.frame.slice();
  if(m==='dist'){
    // the distance takes over the current focus, so nothing jumps; not an edit (no key in Canlandır)
    setQuiet(state.scene,'focusDist',+focusDistance().toFixed(1));syncSliders();
    setDof({focus:{dist:true}});
  }
  else if(m==='frame')setDof({focus:{frame:lastFrame.slice()}});
  else setDof({focus:null});
}
$$('#dofMode button').forEach(b=>{b.type='button';b.addEventListener('click',()=>setMode(b.dataset.v));});
$('#dofCenter').addEventListener('click',()=>setDof({focus:{frame:[.5,.5]}}));

// Hedef: a select of "the selected device", each device, and a point picked on the scene
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
// Uzaklık › "Buna odakla": a device's current distance becomes the focus distance (an edit: a key in Canlandır)
const pullEl=$('#dofPull');
function fillPull(){
  const opts=[['','Cihaz seç…']];state.devices.forEach(d=>opts.push(['d'+d.id,devLabel(d)+' · '+fmtM(deviceDepth(d))]));
  const key=opts.map(o=>o.join(':')).join('|');
  if(pullEl.dataset.key!==key){pullEl.dataset.key=key;pullEl.innerHTML='';
    opts.forEach(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;pullEl.appendChild(o);});}
  pullEl.value='';
}
pullEl.addEventListener('change',()=>{
  const d=pullEl.value?byId(+pullEl.value.slice(1)||pullEl.value.slice(1)):null;pullEl.value='';
  if(!d)return;state.scene.focusDist=+deviceDepth(d).toFixed(1);applyTransform();syncSliders();syncUI();
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

/* ---------- overlays: the frame-point cross (dragged over the live board; Shift snaps to the centre, arrows nudge) and
   the read-out of what is in focus (bottom-left corner of the board, kept on the stage) */
const stage=$('#stagearea'),cross=$('#focusCross'),info=$('#focusInfo');
const SNAP=.04;  // Shift: snap to the centre within this fraction, per axis
function setFrame(fx,fy,snap){
  if(snap){if(Math.abs(fx-.5)<SNAP)fx=.5;if(Math.abs(fy-.5)<SNAP)fy=.5;}
  setDof({focus:{frame:[+clamp(fx,0,1).toFixed(4),+clamp(fy,0,1).toFixed(4)]}});
}
let drag=null;
cross.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();cross.setPointerCapture(e.pointerId);cross.classList.add('drag');drag=e.pointerId;cross.focus();
});
cross.addEventListener('pointermove',e=>{
  if(drag!==e.pointerId)return;const s=boardScreen();if(!s)return;const r=stage.getBoundingClientRect();
  setFrame((e.clientX-r.left-s.x)/s.w,(e.clientY-r.top-s.y)/s.h,e.shiftKey);
});
const endDrag=e=>{if(drag===e.pointerId){drag=null;cross.classList.remove('drag');}};
cross.addEventListener('pointerup',endDrag);cross.addEventListener('pointercancel',endDrag);
cross.addEventListener('keydown',e=>{
  const [fx,fy]=dof().focus&&dof().focus.frame||[.5,.5],st=(e.shiftKey?.05:.005);
  const d={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[e.key];
  if(!d)return;e.preventDefault();e.stopPropagation();setFrame(fx+d[0],fy+d[1],false);
});
let infoSig='',infoH=20;
function placeOverlays(){
  const s=boardScreen(),on=!!s&&dofOn(),fi=on?focusInfo():null;
  const frameMode=on&&fi.mode==='frame';
  cross.hidden=!frameMode;
  if(frameMode){
    const [fx,fy]=dof().focus.frame;
    cross.style.transform='translate('+(s.x+fx*s.w).toFixed(1)+'px,'+(s.y+fy*s.h).toFixed(1)+'px)';
    cross.classList.toggle('hit',!!fi.dev);
    cross.title=(fi.dev?devLabel(fi.dev)+' · ':fi.near?'Altında cihaz yok, en yakını: '+devLabel(fi.near)+' · ':'')+fmtM(fi.dist)+' · sürükle (Shift: merkeze yapış)';
    cross.setAttribute('aria-valuetext',Math.round(fx*100)+'%, '+Math.round(fy*100)+'%'+(fi.dev?', '+devLabel(fi.dev):''));
  }
  info.hidden=!on;
  if(on){
    // what is sharp: the device (or point) and the distance
    const what=fi.mode==='dist'?'':fi.point?'Seçilen nokta':fi.dev?devLabel(fi.dev):fi.near?devLabel(fi.near)+' (yakın)':'';
    const h='Odak'+(what?' · <b></b>':'')+' · '+fmtM(fi.dist)+' · f/'+(+dof().f.toFixed(1));
    const sig=h+'|'+what;
    // the height is read only when the text changes (this runs on every req, including the video export's sub-samples)
    if(sig!==infoSig){infoSig=sig;info.innerHTML=h;const b=info.querySelector('b');if(b)b.textContent=what;infoH=info.offsetHeight;}
    // inside the board, kept on the stage and above the dock (ui/dock.js: the bottom 72 px)
    const x=Math.max(s.x,0)+8,y=Math.min(s.y+s.h,stage.clientHeight-72)-infoH-8;
    info.style.transform='translate('+Math.round(x)+'px,'+Math.round(Math.max(s.y+8,y))+'px)';
  }
}
onLayout(placeOverlays);onChange.add(placeOverlays);

onSyncUI(()=>{
  const d=dof(),m=focusMode();onEl.checked=!!d.on;$('#dofOpts').hidden=!d.on;bgEl.checked=!!d.bg;
  $$('#dofBlades button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===(d.blades||0))));
  $$('#dofMode button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===m)));
  $$('#dofOpts [data-fmode]').forEach(el=>{el.hidden=el.dataset.fmode!==m;});
  fillFocus();fillPull();placeOverlays();
  const mm=mmFromFov(state.scene.fov);
  lensWrap.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Math.abs(+b.dataset.mm-mm)<.5)));
  // the angle of view in the tooltip, and the longer effective lens when Yakınlık goes past the closest camera distance
  const eff=effectiveMm();
  mmLabel.title='Objektif: '+Math.round(mm)+' mm · görüş açısı '+(+state.scene.fov.toFixed(1))+'°'+
    (eff>mm*1.02?' · Yakınlıkla etkin '+Math.round(eff)+' mm':'')+' · sürükle, çift tıkla: 50 mm';
});
