import * as THREE from 'three';
import {FINISHES,applyColorTo} from '../devices/materials.js';
import {RT,setHolder} from '../devices/rt.js';
import {buildRT,disposeRT,rebuild} from '../devices/runtime.js';
import {setScreenTexture,updateChrome} from '../devices/screen.js';
import {camera,req} from '../render/renderer.js';
import {applyTransform,autoRefit,compBox,refit} from '../render/transform.js';
import {COLORS,COMPS,DEFAULT_SCENE,TYPES} from '../state/constants.js';
import {newDevice,sel,state} from '../state/state.js';
import {parseV} from './controls.js';
import {syncSliders} from './sliders.js';
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
  state.devices.push(d);const o=buildRT(d);
  // beside the others (right, or left if the right side is off-screen), on the same floor, at their depth.
  // The framing stays put so devices already placed do not move on screen.
  const box=compBox(d.id),c=box.getCenter(new THREE.Vector3()),p=new THREE.Vector3();
  d.py=+(box.min.y+o.size.y/2).toFixed(1);d.pz=+c.z.toFixed(1);state.selected=d.id;
  const onScreen=x=>{d.px=+x.toFixed(1);autoRefit();applyTransform();o.holder.getWorldPosition(p).project(camera);return Math.abs(p.x)<.95&&Math.abs(p.y)<.95;};
  const right=box.max.x+o.size.x/2+1.5,visible=onScreen(right)||onScreen(box.min.x-o.size.x/2-1.5);
  if(!visible)onScreen(right);
  $('#placeDetails').open=true;syncAll();
  toast(TYPES[d.type]+' eklendi'+(visible?'':'. Kadraj dışında kaldı: görmek için Kadraja sığdır.'));
});
$('#removeDevice').addEventListener('click',()=>{
  if(state.devices.length<2)return;const d=sel();
  disposeRT(d.id);state.devices=state.devices.filter(x=>x.id!==d.id);state.selected=state.devices[0].id;
  autoRefit();applyTransform();syncAll();
});
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
    if(r)['img','imgName','fit','screenBg','glare','finish','notch','url','theme','winRatio','frameImg','frameName','screenRect','colorKey','custom','lidAngle','backFinish','pageRatio'].forEach(k=>nd[k]=r[k]);
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
  renderDevList();
});

export {applyComp};
