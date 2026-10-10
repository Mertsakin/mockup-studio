import * as THREE from 'three';
import {FINISHES,applyColorTo} from '../devices/materials.js';
import {RT,setHolder} from '../devices/rt.js';
import {buildRT,disposeRT,rebuild} from '../devices/runtime.js';
import {scrollScreen,scrollScreens,setScreenTexture,updateChrome} from '../devices/screen.js';
import {camera,req} from '../render/renderer.js';
import {comp} from '../render/stage.js';
import {applyTransform,autoRefit,refit} from '../render/transform.js';
import {COLORS,COMPS,DEFAULT_SCENE,SCALE_MIN,TYPES,ZOOM_MIN} from '../state/constants.js';
import {newDevice,sel,state} from '../state/state.js';
import {parseV} from './controls.js';
import {fPct,makeSlider,syncSliders} from './sliders.js';
import {onSyncUI,syncAll,syncUI} from './sync.js';
import {toast} from './toast.js';
import {$,$$} from '../util.js';

/* ---------- device list & type ---------- */
function devLabel(d){
  const same=state.devices.filter(x=>x.type===d.type);
  return TYPES[d.type]+(same.length>1?' '+(same.indexOf(d)+1):'');
}
function renderDevList(){
  const el=$('#devList');el.innerHTML='';
  state.devices.forEach(d=>{
    const b=document.createElement('button');b.type='button';b.textContent=devLabel(d);
    b.setAttribute('aria-pressed',String(d.id===state.selected));
    b.addEventListener('click',()=>{state.selected=d.id;syncAll();});el.appendChild(b);
  });
}
const addSel=$('#addType');
Object.entries(TYPES).forEach(([k,n])=>{const o=document.createElement('option');o.value=k;o.textContent=n;addSel.appendChild(o);});
const typeGrid=$('#typeGrid');
Object.entries(TYPES).forEach(([k,n])=>{
  const b=document.createElement('button');b.type='button';b.textContent=n==='Kendi çerçeven'?'Çerçeve':n;b.dataset.type=k;
  if(k==='custom')b.title='Kendi çerçeve PNG\u2019n';
  b.addEventListener('click',()=>{const d=sel();if(d.type===k)return;
    const solo=state.devices.length===1;d.type=k;
    if(solo){Object.assign(state.scene,DEFAULT_SCENE[k],{zoom:1,panX:0,panY:0});}
    rebuild(d,solo);syncAll();});
  typeGrid.appendChild(b);
});
$('#addDevice').addEventListener('click',()=>{
  const base=sel(),d=newDevice(addSel.value,{colorKey:base.colorKey,custom:base.custom});
  state.devices.push(d);const o=buildRT(d);state.selected=d.id;
  // Centred on the artboard: on the camera's axis (the full frame's centre, whatever the pan, Yakınlık or the part of
  // the board on screen), just in front of the other devices. The framing stays put, so devices already
  // placed keep their spot; a device too big for the view is fitted by pulling the camera back (Yakınlık, real
  // proportions kept), and only scaled down if Yakınlık is already at its minimum.
  autoRefit();applyTransform();
  // in front of the others along the view (no interpenetration, the new one is on top and easy to grab)
  // world boxes of the meshes, contact-shadow planes left out
  const boxOf=h=>{const b=new THREE.Box3();h.updateWorldMatrix(true,true);h.traverse(x=>{if(x.isMesh&&!x.userData.ao)b.expandByObject(x);});return b;};
  let z=0;
  if(state.devices.length>1){const ob=new THREE.Box3();RT.forEach((r,id)=>{if(id!==d.id)ob.union(boxOf(r.holder));});
    const nb=boxOf(o.holder);z=ob.max.z+(nb.max.z-nb.min.z)/2+1;}
  const at=comp.worldToLocal(new THREE.Vector3(0,0,z));
  d.px=+at.x.toFixed(1);d.py=+at.y.toFixed(1);d.pz=+at.z.toFixed(1);applyTransform();
  // extent of the new device in the full frame (no live crop): 1 = the frame's edge
  const extent=()=>{const cam=camera.clone();cam.clearViewOffset();cam.updateProjectionMatrix();
    const b=boxOf(o.holder),q=new THREE.Vector3();let m=0;
    for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){q.set(x,y,z).project(cam);m=Math.max(m,Math.abs(q.x),Math.abs(q.y));}
    return m;};
  const z0=state.scene.zoom;
  for(let i=0;i<4;i++){const m=extent();if(m<=.85||state.scene.zoom<=ZOOM_MIN)break;state.scene.zoom=+Math.max(ZOOM_MIN,state.scene.zoom*.85/m).toFixed(3);applyTransform();}
  const m=extent();if(m>.85){d.scale=+Math.max(SCALE_MIN,d.scale*.85/m).toFixed(3);applyTransform();}
  $('#placeDetails').open=true;syncAll();
  toast(TYPES[d.type]+' eklendi'+(state.scene.zoom<z0-1e-3?'. Sığması için kamera geri çekildi.':''));
});
$('#removeDevice').addEventListener('click',()=>{
  if(state.devices.length<2)return;const d=sel();
  disposeRT(d.id);state.devices=state.devices.filter(x=>x.id!==d.id);state.selected=state.devices[0].id;
  autoRefit();applyTransform();syncAll();
});
// scrolling a long screenshot (shown only when the selected screen can scroll)
makeSlider($('#scrollSlot'),{id:'d-scroll',k:'scroll',l:'Kaydırma',min:0,max:1,step:.001,reset:0,f:fPct,
  note:'Uzun ekran görüntüsünde görünen bölüm. Ekranın üzerinde fare tekerleğiyle de kaydırabilirsin.',after:()=>scrollScreen(sel(),sel().scroll)},sel);
$('#scrollSlot').appendChild($('#scrollAll'));
$('#scrollAll').addEventListener('click',()=>{const f=sel().scroll;state.devices.forEach(d=>{if(scrollScreens(d))scrollScreen(d,f);});});
$('#resetDevice').addEventListener('click',()=>{Object.assign(sel(),{px:0,py:0,pz:0,rx:0,ry:0,rz:0,scale:1});autoRefit();applyTransform();syncAll();});
$('#fitBtn').addEventListener('click',()=>{refit();state.scene.zoom=1;state.scene.panX=0;state.scene.panY=0;applyTransform();syncSliders();});

const compWrap=$('#comps');
COMPS.forEach(c=>{
  const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=c.n;
  b.addEventListener('click',()=>applyComp(c));compWrap.appendChild(b);
});
function applyComp(c){
  const pool={};state.devices.forEach(d=>{(pool[d.type]=pool[d.type]||[]).push(d);});
  const base=sel();
  const next=c.items.map(it=>{
    const r=(pool[it.type]||[]).shift();
    const nd=newDevice(it.type,{colorKey:base.colorKey,custom:base.custom});
    if(r)['img','imgName','fit','screenBg','glare','finish','notch','url','theme','winRatio','frameImg','frameName','screenRect','colorKey','custom','lidAngle','backFinish','pageRatio','scroll','siteUrl'].forEach(k=>nd[k]=r[k]);
    return Object.assign(nd,it);
  });
  [...RT.keys()].forEach(disposeRT);
  state.devices=next;state.selected=next[next.length-1].id;
  Object.assign(state.scene,{zoom:1,panX:0,panY:0},c.scene);
  state.devices.forEach(buildRT);refit();applyTransform();
  $('#placeDetails').open=state.devices.length>1;syncAll();
}
/* ---------- swatches ---------- */
const finishGrid=$('#finishGrid');
Object.entries(FINISHES).forEach(([k,f])=>{const b=document.createElement('button');b.type='button';b.textContent=f.n;b.dataset.fin=k;
  b.addEventListener('click',()=>{const d=sel();d.finish=k;const o=RT.get(d.id);if(o)applyColorTo(o.mats,d);req();syncUI();});finishGrid.appendChild(b);});
const swWrap=$('#swatches');
COLORS.forEach(c=>{
  const b=document.createElement('button');b.type='button';b.className='sw';b.style.background=c.c;b.dataset.k=c.k;
  b.setAttribute('aria-label',c.n);b.title=c.n;
  b.addEventListener('click',()=>{const d=sel();d.colorKey=c.k;const o=RT.get(d.id);applyColorTo(o.mats,d);req();syncUI();});
  swWrap.appendChild(b);
});
const custom=document.createElement('label');custom.className='sw sw-custom';custom.dataset.k='custom';custom.title='Özel renk';
custom.innerHTML='<input type="color" aria-label="Özel gövde rengi">';
const customInput=custom.querySelector('input');
customInput.addEventListener('input',()=>{const d=sel();d.custom=customInput.value;d.colorKey='custom';applyColorTo(RT.get(d.id).mats,d);req();syncUI();});
swWrap.appendChild(custom);
$$('.seg[data-dkey]').forEach(seg=>{const key=seg.dataset.dkey;
  seg.querySelectorAll('button').forEach(b=>{b.type='button';b.addEventListener('click',()=>{const d=sel();d[key]=parseV(b.dataset.v);onDevice(key,d);});});});
function onDevice(key,d){
  const o=RT.get(d.id);
  if(key==='landscape'){setHolder(o,d);setScreenTexture(d);autoRefit();applyTransform();}
  else if(key==='backFinish'){applyColorTo(o.mats,d);req();}
  else if(key==='notch'){if(o.hole)o.hole.visible=d.notch==='hole';req();}
  else if(key==='fit')setScreenTexture(d);
  else if(key==='theme'){applyColorTo(o.mats,d);updateChrome(d);req();}
  else if(key==='winRatio'||key==='pageRatio')rebuild(d,state.devices.length<2);
  syncUI();
}
const screenBgEl=$('#screenBg');screenBgEl.addEventListener('input',()=>{const d=sel();d.screenBg=screenBgEl.value;setScreenTexture(d);});
const glareEl=$('#glare');glareEl.addEventListener('change',()=>{const d=sel();d.glare=glareEl.checked;const o=RT.get(d.id);if(o.glare)o.glare.visible=d.glare;req();});
const urlEl=$('#url');let urlT=null;
urlEl.addEventListener('input',()=>{const d=sel();d.url=urlEl.value;clearTimeout(urlT);urlT=setTimeout(()=>updateChrome(d),120);});
onSyncUI(d=>{
  $$('.seg[data-dkey]').forEach(seg=>{const v=String(d[seg.dataset.dkey]);seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));});
  typeGrid.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.type===d.type)));
  $$('[data-for]').forEach(el=>{el.hidden=!el.dataset.for.split(' ').includes(d.type);});
  $('#screenBgRow').hidden=d.fit!=='contain';
  swWrap.querySelectorAll('.sw').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.k===d.colorKey)));
  finishGrid.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.fin===d.finish)));
  customInput.value=d.custom;custom.style.background=d.colorKey==='custom'?d.custom:'';
  screenBgEl.value=d.screenBg;glareEl.checked=d.glare;if(document.activeElement!==urlEl)urlEl.value=d.url;
  $('#selTitle').textContent=devLabel(d);
  $('#removeDevice').disabled=state.devices.length<2;
  $('#scrollSlot').hidden=!scrollScreens(d);
  $('#scrollAll').hidden=state.devices.filter(x=>scrollScreens(x)).length<2;
  renderDevList();
});

export {applyComp};
