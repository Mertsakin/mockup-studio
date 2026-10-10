import {drawPattern} from '../render/backgrounds.js';
import {renderer} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {state,view} from '../state/state.js';
import {$,mkCanvas} from '../util.js';

/* ---------- layout & background ----------
   The live canvas (#frame) sits over the active artboard on the workspace. workspace.js registers the geometry
   provider: it returns the board's on-screen rectangle (stage pixels) and positions the board elements. */
const frame=$('#frame');
// 'custom' = artboard of state.customW x state.customH px
const ratioNums=()=>state.ratio==='custom'?[state.customW,state.customH]:state.ratio.split(':').map(Number);
let geometry=null;
function setStageGeometry(fn){geometry=fn;}
const MAX_PX=2600;  // device pixels of the live canvas, whatever the zoom (beyond that the board is upscaled)
let lastW=0,lastH=0,lastPr=0;
function layout(){
  const r=geometry&&geometry();if(!r)return;
  const w=Math.max(1,Math.round(r.w)),h=Math.max(1,Math.round(r.h));
  frame.style.transform='translate('+Math.round(r.x)+'px,'+Math.round(r.y)+'px)';
  const pr=Math.min(window.devicePixelRatio||1,2,MAX_PX/Math.max(w,h));
  if(w!==lastW||h!==lastH||Math.abs(pr-lastPr)>1e-3){
    frame.style.width=w+'px';frame.style.height=h+'px';
    renderer.setPixelRatio(pr);renderer.setSize(w,h,false);view.aspect=w/h;lastW=w;lastH=h;lastPr=pr;applyTransform();
    if(state.bg==='pattern')bgCss();  // aspect may have changed
  }
}
// forces the next layout to resize the renderer (after an export changed it)
function invalidateLayout(){lastW=lastH=lastPr=0;}
// pattern preview: drawn once per pattern / colours / aspect and shown as a stretched CSS image
let patternKey='',patternUrl='';
function patternCss(){
  const [rw,rh]=ratioNums(),W=Math.round(1200*Math.min(1,rw/rh)),H=Math.round(1200*Math.min(1,rh/rw));
  const key=[state.pattern,state.pbase,state.paccent,W,H].join();
  if(key!==patternKey){const c=mkCanvas(W,H);drawPattern(c.getContext('2d'),W,H,state.pattern,state.pbase,state.paccent);patternUrl=c.toDataURL('image/jpeg',.9);patternKey=key;}
  return 'url('+patternUrl+') center / 100% 100% no-repeat';
}
function bgCss(){
  frame.classList.toggle('checker',state.bg==='transparent');
  frame.style.background=state.bg==='solid'?state.solid:state.bg==='gradient'?'linear-gradient(to bottom right, '+state.bg1+', '+state.bg2+')':state.bg==='pattern'?patternCss():'';
}
function paintBg(g,W,H){
  if(state.bg==='solid'){g.fillStyle=state.solid;g.fillRect(0,0,W,H);}
  else if(state.bg==='gradient'){
    const n=Math.hypot(W,H),ux=H/n,uy=W/n,hl=W*H/n,cx=W/2,cy=H/2;
    const gr=g.createLinearGradient(cx-ux*hl,cy-uy*hl,cx+ux*hl,cy+uy*hl);
    gr.addColorStop(0,state.bg1);gr.addColorStop(1,state.bg2);g.fillStyle=gr;g.fillRect(0,0,W,H);
  } else if(state.bg==='pattern')drawPattern(g,W,H,state.pattern,state.pbase,state.paccent);
  else if(state.format==='jpg'){g.fillStyle='#ffffff';g.fillRect(0,0,W,H);}
}

export {bgCss,frame,invalidateLayout,layout,paintBg,ratioNums,setStageGeometry};
