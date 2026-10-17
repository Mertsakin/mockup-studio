import {buildRT,rebuild} from '../devices/runtime.js';
import {scrollScreen,setScreenTexture,updateChrome} from '../devices/screen.js';
import {fromProjectFile,restore} from '../io/project.js';
import {setFirstSamples,startLoop} from '../render/accumulation.js';
import {gradCss} from '../render/backgrounds.js';
import {canvas,renderer,setCrop} from '../render/renderer.js';
import {applyTransform,camDist} from '../render/transform.js';
import {valuesAt} from '../state/anim.js';
import {state,view} from '../state/state.js';

/* The embed player: one artboard of a project file, drawn by the studio's own core (devices, lights, PCSS
   shadows, progressive rendering), without the editor. It runs inside an iframe (embed/mockup-view.js makes it),
   so every embed has its own copy of the core's singletons and nothing of the host page's CSS.

   Parameters (query string): src (project file), board (artboard name or index, default: the active one),
   mode: still | mouse | drag | scroll | loop, range (degrees the mouse / drag may turn, default 14), bg: scene |
   transparent. The host page's loader sends the scroll progress and the pointer as messages
   ({mockup: 'scroll', p} with p 0..1 while the embed crosses the viewport; {mockup: 'pointer', x, y} in -1..1). */
const q=new URLSearchParams(location.search);
const mode=q.get('mode')||'mouse',range=+q.get('range')||14,bgMode=q.get('bg')||'scene';

let base=null;  // the camera as designed; interaction adds to it
const off={ry:0,rx:0},want={ry:0,rx:0};
let zoom=1,fitK=1;  // the designed Yakınlık (or the animated one) and the embed's framing factor on it

// the artboard's shape as designed
function boardAspect(){
  if(state.ratio==='custom')return state.customW/state.customH;
  const [a,b]=String(state.ratio||'4:5').split(':').map(Number);return a/b||.8;
}
/* The embed may have any shape. The studio frames the composition to fill the artboard; here the artboard's
   designed area always fits inside the embed: a wider embed shows more of the background at the sides, a narrower
   one moves the camera back. Done as a factor on Yakınlık, so the camera, lens and animation stay the studio's. */
function size(){
  const w=innerWidth,h=innerHeight,pr=Math.min(devicePixelRatio||1,1.5);
  renderer.setPixelRatio(pr);renderer.setSize(w,h,false);setCrop(null);
  const Ae=w/h,Ab=boardAspect();
  state.scene.zoom=zoom;view.aspect=Ab;const dB=camDist();view.aspect=Ae;const dE=camDist();
  fitK=dE/(dB*(Ae<Ab?Ab/Ae:1));
  state.scene.zoom=zoom*fitK;applyTransform();
}
function paintBg(){
  const el=document.getElementById('bg');
  el.style.background=bgMode==='transparent'?'':state.bg==='solid'?state.solid:state.bg==='gradient'?gradCss(state):
    state.bg==='image'&&state.bgImg?'center/cover no-repeat url("'+state.bgImg.src+'")':'';
}
// the scene at time t of the artboard's animation (camera, devices, lights; 2D items are not in the player yet)
function at(t){
  const all=[state.scene,...state.devices,...state.lights];
  for(const o of all){
    if(!o.tracks)continue;const v=valuesAt(o,t);
    for(const k in v){if(k==='scroll'){if(Math.abs(o.scroll-v[k])>1e-6)scrollScreen(o,v[k]);}else o[k]=v[k];}
  }
  if('zoom' in valuesAt(state.scene,t)){zoom=state.scene.zoom;state.scene.zoom=zoom*fitK;}
  if(base){base.ry=state.scene.ry;base.rx=state.scene.rx;}
}
const hasAnim=()=>[state.scene,...state.devices,...state.lights].some(o=>o.tracks&&Object.keys(o.tracks).length);

/* Samples in a moving frame: one sample shows the PCSS shadows' pattern while the scene never stops (mouse, scroll,
   loop), so a moving frame takes several, as many as fit the frame time (measured, 1-4). */
let last=0,slow=0,moving=0;
function budget(now){
  const dt=last?now-last:16;last=now;
  if(!moving)return;
  slow=slow*.9+dt*.1;  // smoothed frame time
  const n=slow>28?1:slow>22?2:slow>18?3:4;setFirstSamples(n);
}
// one frame of interaction: eases the offset towards its target and turns the camera by it
function tick(now){
  requestAnimationFrame(tick);
  budget(now||performance.now());
  if(!base)return;
  if(mode==='loop'&&hasAnim()){const d=state.anim.dur||5;at((performance.now()/1000)%d);}
  const k=.12;let moved=false;
  for(const a of ['ry','rx']){const d=want[a]-off[a];if(Math.abs(d)>.01){off[a]+=d*k;moved=true;}}
  moving=moved||mode==='loop'?8:Math.max(0,moving-1);  // a few frames of grace after moving stops
  if(!moving)setFirstSamples(1);
  if(moved||mode==='loop'){state.scene.ry=base.ry+off.ry;state.scene.rx=base.rx+off.rx;applyTransform();}
}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function pointer(x,y){if(reduced)return;want.ry=x*range;want.rx=-y*range*.5;}
function scrolled(p){
  if(reduced)return;
  if(hasAnim()){at(Math.max(0,Math.min(1,p))*(state.anim.dur||5));state.scene.ry=base.ry+off.ry;moving=8;applyTransform();}
  else want.ry=(p-.5)*2*range*2;  // no animation: the scene turns as the page scrolls
}

// pointer inside the frame (the loader's messages cover the whole page)
if(mode==='mouse')canvas.addEventListener('pointermove',e=>pointer(e.clientX/innerWidth*2-1,e.clientY/innerHeight*2-1));
if(mode==='drag'){
  let d=null;
  canvas.addEventListener('pointerdown',e=>{d={x:e.clientX,ry:want.ry};canvas.setPointerCapture(e.pointerId);canvas.classList.add('drag');});
  canvas.addEventListener('pointermove',e=>{if(d)want.ry=Math.max(-range*3,Math.min(range*3,d.ry+(e.clientX-d.x)*.4));});
  const end=()=>{d=null;canvas.classList.remove('drag');};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
}else canvas.classList.add('still');
addEventListener('message',e=>{const m=e.data;if(!m||typeof m!=='object')return;
  if(m.mockup==='pointer'&&mode==='mouse')pointer(m.x,m.y);
  else if(m.mockup==='scroll'&&mode==='scroll')scrolled(m.p);});
addEventListener('resize',size);

async function load(){
  const src=q.get('src');if(!src)throw new Error('src yok');
  const doc=await fromProjectFile(await (await fetch(src)).blob());
  const b=doc.boards.find(x=>x.name===q.get('board'))||doc.boards[+q.get('board')-1]||doc.boards.find(x=>x.id===doc.active)||doc.boards[0];
  restore(b.snap);
  state.selected=null;state.selLight=null;state.showDome=false;state.markers=false;
  zoom=state.scene.zoom;paintBg();size();
  base={ry:state.scene.ry,rx:state.scene.rx};
  // fonts for the laptop's key legends and the browser bar arrive late: redraw like the studio does
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{state.devices.forEach(d=>{if(d.type==='laptop'){rebuild(d,false);return;}if(!d.img)setScreenTexture(d);if(d.type==='browser')updateChrome(d);});});
  parent.postMessage({mockup:'ready'},'*');
}
state.devices.forEach(buildRT);
startLoop();tick();
load().catch(e=>{console.error('Mockup yüklenemedi:',e);document.body.dataset.error=String(e.message||e);});
