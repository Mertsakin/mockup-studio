import {Object3D} from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {RT} from '../devices/rt.js';
import {camera,canvas,overlays,req,scene} from '../render/renderer.js';
import {comp} from '../render/stage.js';
import {applyTransform} from '../render/transform.js';
import {sel,state} from '../state/state.js';
import {syncSliders} from './sliders.js';
import {onSyncUI} from './sync.js';
import {clamp,wrap} from '../util.js';

/* Per-device move / rotate gizmo (three's TransformControls). Clicking a device shows its axes; dragging an arrow
   moves it, dragging a ring rotates it. The controls are not connected to the canvas: pointer.js forwards events so
   the gizmo, the light spheres and scene rotation share one, ordered pointer flow (gizmo first).
   Move: the gizmo drives a proxy in the composition's space (same parent as the device holders), so the arrows follow
   the floor / scene axes whatever the camera angle or the device's own rotation. Rotate: the gizmo turns the holder
   itself, rings in the device's local axes. Values go back to the device (px.. / rx..) and the sliders follow. */
const R2D=180/Math.PI;
const tc=new TransformControls(camera,canvas);tc.disconnect();
tc.setSize(1.1);tc.setSpace('local');tc.setMode(state.gizmo);
// follows the selected holder's position (sliders, templates) except while the gizmo itself is moving it
class Follower extends Object3D{updateMatrixWorld(force){if(this.target&&!tc.dragging)this.position.copy(this.target.position);super.updateMatrixWorld(force);}}
const proxy=new Follower();comp.add(proxy);
const helper=tc.getHelper();scene.add(helper);overlays.add(helper);
let shown=false;

function attach(){
  const o=shown&&RT.get(state.selected);
  if(o){proxy.target=o.holder;proxy.position.copy(o.holder.position);const t=state.gizmo==='translate'?proxy:o.holder;if(tc.object!==t)tc.attach(t);}
  else if(tc.object)tc.detach();
  req();
}
function showGizmo(on){shown=on;attach();}
tc.addEventListener('change',req);
tc.addEventListener('objectChange',()=>{
  const d=sel(),h=tc.object;if(!h||!d)return;
  if(h===proxy){d.px=clamp(h.position.x,-60,60);d.py=clamp(h.position.y,-60,60);d.pz=clamp(h.position.z,-60,60);}
  // holder rotation order is YXZ, the same convention as the device sliders
  else{d.rx=clamp(h.rotation.x*R2D,-90,90);d.ry=wrap(h.rotation.y*R2D);d.rz=wrap(h.rotation.z*R2D);}
  applyTransform();syncSliders();
});
// pointer.js forwards events here first; each returns true when the gizmo took the event
const ptr=e=>tc._getPointer(e);
function gizmoDown(e){if(!tc.object)return false;const p=ptr(e);tc.pointerHover(p);tc.pointerDown(p);return tc.dragging;}
function gizmoMove(e){if(!tc.object)return false;const p=ptr(e);if(tc.dragging){tc.pointerMove(p);return true;}if(e.pointerType==='mouse')tc.pointerHover(p);return false;}
function gizmoUp(e){if(!tc.dragging)return false;tc.pointerUp(ptr(e));return true;}
const gizmoHot=()=>tc.axis!==null;
onSyncUI(()=>{if(tc.mode!==state.gizmo)tc.setMode(state.gizmo);attach();});
function setGizmoMode(m){state.gizmo=m;tc.setMode(m);attach();}
// Shift held: 1 cm / 15° steps
const snapKeys=e=>{const on=e.shiftKey;tc.setTranslationSnap(on?1:null);tc.setRotationSnap(on?Math.PI/12:null);};
window.addEventListener('keydown',snapKeys);window.addEventListener('keyup',snapKeys);
// tool keys (W / E / Esc) live in shell.js with the other tools

export {gizmoDown,gizmoHot,gizmoMove,gizmoUp,helper as gizmoHelper,setGizmoMode,showGizmo};
