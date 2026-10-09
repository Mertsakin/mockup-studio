import {drawPattern} from '../render/backgrounds.js';
import {renderer} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {state,view} from '../state/state.js';
import {$,mkCanvas} from '../util.js';

/* ---------- layout & background ---------- */
const frame=$('#frame'),area=$('#stagearea');
// 'custom' = artboard of state.customW x state.customH px
const ratioNums=()=>state.ratio==='custom'?[state.customW,state.customH]:state.ratio.split(':').map(Number);
function layout(){
  const cs=getComputedStyle(area);
  const aw=area.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  const ah=area.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  if(aw<=0||ah<=0)return;
  const [rw,rh]=ratioNums(),r=rw/rh;let w=aw,h=aw/r;if(h>ah){h=ah;w=ah*r;}
  w=Math.floor(w);h=Math.floor(h);frame.style.width=w+'px';frame.style.height=h+'px';
  renderer.setSize(w,h,false);view.aspect=w/h;applyTransform();
  if(state.bg==='pattern')bgCss();  // aspect may have changed
}
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
new ResizeObserver(layout).observe(area);

export {bgCss,frame,layout,paintBg,ratioNums};
