import {drawPattern} from '../render/backgrounds.js';
import {renderer,setCrop} from '../render/renderer.js';
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
let lastKey='',bgFit=null;
function layout(){
  const r=geometry&&geometry();if(!r)return;
  // visible part of the board on the stage; the canvas covers only that, the camera renders that slice
  const x0=Math.max(r.x,0),y0=Math.max(r.y,0),x1=Math.min(r.x+r.w,r.sw),y1=Math.min(r.y+r.h,r.sh);
  const vx=Math.round(x0),vy=Math.round(y0),vw=Math.max(1,Math.round(x1-x0)),vh=Math.max(1,Math.round(y1-y0));
  frame.hidden=x1<=x0||y1<=y0;
  frame.style.transform='translate('+vx+'px,'+vy+'px)';
  // the board background (CSS) is sized to the whole board and shifted, so the visible part lines up
  bgFit={size:r.w.toFixed(1)+'px '+r.h.toFixed(1)+'px',pos:(r.x-vx).toFixed(1)+'px '+(r.y-vy).toFixed(1)+'px'};applyBgFit();
  const pr=Math.min(window.devicePixelRatio||1,2),full=vw>=Math.round(r.w)-1&&vh>=Math.round(r.h)-1;
  const key=[vw,vh,pr,full?'':[r.w,r.h,vx-r.x,vy-r.y].map(v=>v.toFixed(1)).join()].join('|');
  if(key===lastKey)return;lastKey=key;
  frame.style.width=vw+'px';frame.style.height=vh+'px';
  renderer.setPixelRatio(pr);renderer.setSize(vw,vh,false);view.aspect=r.w/r.h;
  setCrop(full?null:{fw:r.w,fh:r.h,x:vx-r.x,y:vy-r.y,w:vw,h:vh});
  applyTransform();
  if(state.bg==='pattern')bgCss();  // aspect may have changed
}
function applyBgFit(){if(!bgFit||state.bg==='transparent'){frame.style.backgroundSize='';frame.style.backgroundPosition='';return;}
  frame.style.backgroundSize=bgFit.size;frame.style.backgroundPosition=bgFit.pos;frame.style.backgroundRepeat='no-repeat';}
// forces the next layout to resize the renderer (after an export or thumbnail changed it)
function invalidateLayout(){lastKey='';}
// pattern preview: drawn once per pattern / colours / aspect and shown as a stretched CSS image
let patternKey='',patternUrl='';
function patternCss(){
  const [rw,rh]=ratioNums(),W=Math.round(1200*Math.min(1,rw/rh)),H=Math.round(1200*Math.min(1,rh/rw));
  const key=[state.pattern,state.pbase,state.paccent,W,H].join();
  if(key!==patternKey){const c=mkCanvas(W,H);drawPattern(c.getContext('2d'),W,H,state.pattern,state.pbase,state.paccent);patternUrl=c.toDataURL('image/jpeg',.9);patternKey=key;}
  return 'url('+patternUrl+')';
}
function bgCss(){
  frame.classList.toggle('checker',state.bg==='transparent');
  frame.style.background=state.bg==='solid'?state.solid:state.bg==='gradient'?'linear-gradient(to bottom right, '+state.bg1+', '+state.bg2+')':state.bg==='pattern'?patternCss():'';
  applyBgFit();
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
