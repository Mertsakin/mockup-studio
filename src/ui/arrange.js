import {applyTransform,deviceBox} from '../render/transform.js';
import {state} from '../state/state.js';
import {syncSliders} from './sliders.js';
import {onSyncUI} from './sync.js';
import {settleDevices} from './templates.js';
import {toast} from './toast.js';
import {$,clamp} from '../util.js';

/* Arranging several devices (composition space, i.e. along the floor whatever the camera angle).
   "Zemine oturt": every device's lowest point onto one floor (the lowest one). "Eşit dağıt": left to right with equal
   gaps between their bounding boxes; the outermost two stay where they are. Gizmo snapping (Shift) is in gizmo.js. */
const settleBtn=$('#settleBtn'),distBtn=$('#distributeBtn');
settleBtn.addEventListener('click',()=>{settleDevices();applyTransform();syncSliders();toast('Cihazlar aynı zemine oturtuldu');});
distBtn.addEventListener('click',()=>{
  const items=state.devices.map(d=>({d,b:deviceBox(d.id)})).sort((a,b)=>(a.b.min.x+a.b.max.x)-(b.b.min.x+b.b.max.x));
  if(items.length<3)return;
  const span=items[items.length-1].b.max.x-items[0].b.min.x,widths=items.reduce((s,x)=>s+x.b.max.x-x.b.min.x,0),gap=(span-widths)/(items.length-1);
  let x=items[0].b.min.x;
  items.forEach(it=>{it.d.px=clamp(+(it.d.px+x-it.b.min.x).toFixed(2),-60,60);x+=it.b.max.x-it.b.min.x+gap;});
  applyTransform();syncSliders();
  toast(gap<0?'Cihazlar sığmadığı için üst üste bindi: uçtakileri biraz açıp tekrar dene.':'Cihazlar eşit aralıkla dizildi');
});
onSyncUI(()=>{settleBtn.disabled=state.devices.length<2;distBtn.disabled=state.devices.length<3;});
