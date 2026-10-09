import * as THREE from 'three';
import {onLightsUpdated,selLight} from '../lights/runtime.js';
import {applyTransform} from '../render/transform.js';
import {state} from '../state/state.js';
import {syncSliders} from './sliders.js';
import {onSyncUI,syncAll,syncUI} from './sync.js';
import {$,D2R,clamp,wrap} from '../util.js';

/* ---------- light map (top view) & direct light dragging ---------- */
const SVGNS='http://www.w3.org/2000/svg',domeEl=$('#dome'),domeSvg=$('#domeSvg'),domeCap=$('#domeCap');
const svgEl=(t,a,parent)=>{const e=document.createElementNS(SVGNS,t);for(const k in a)e.setAttribute(k,a[k]);if(parent)parent.appendChild(e);return e;};
(function buildDomeStatic(){
  svgEl('circle',{cx:0,cy:0,r:100,fill:'var(--field)',stroke:'var(--line)','stroke-width':1.5},domeSvg);
  [66.7,33.3].forEach(r=>svgEl('circle',{cx:0,cy:0,r,fill:'none',stroke:'var(--line)','stroke-dasharray':'3 4'},domeSvg));
  svgEl('line',{x1:-100,y1:0,x2:100,y2:0,stroke:'var(--line)'},domeSvg);svgEl('line',{x1:0,y1:-100,x2:0,y2:100,stroke:'var(--line)'},domeSvg);
  const lab=(t,x,y)=>{const e=svgEl('text',{x,y,'text-anchor':'middle','font-size':10,fill:'var(--muted)','font-family':'inherit'},domeSvg);e.textContent=t;};
  lab('Kamera',0,93);lab('Arka',0,-85);lab('30°',0,-70);lab('60°',0,-37);
})();
const domeFoot=svgEl('g',{},domeSvg);
svgEl('rect',{x:-15,y:-9,width:30,height:18,rx:3,fill:'var(--muted)',opacity:.45},domeFoot);
svgEl('line',{x1:-11,y1:9,x2:11,y2:9,stroke:'var(--accent)','stroke-width':2.5,'stroke-linecap':'round'},domeFoot);
const domeLayer=svgEl('g',{},domeSvg),domeDots=new Map();
function domePos(L){const r=(90-clamp(L.el,0,90))/90,a=L.az*D2R;return {x:Math.sin(a)*r*100,y:Math.cos(a)*r*100};}
// luma of the sRGB-encoded value (picks the label colour on a light dot)
function lum(hex){const c=new THREE.Color().setStyle(hex,THREE.LinearSRGBColorSpace);return .2126*c.r+.7152*c.g+.0722*c.b;}
function renderDome(){
  const show=state.showDome&&state.lights.length>0;domeEl.hidden=!show;if(!show)return;
  domeFoot.setAttribute('transform','rotate('+(-state.scene.ry).toFixed(1)+')');
  const alive=new Set();
  state.lights.forEach((L,i)=>{
    alive.add(L.id);let d=domeDots.get(L.id);
    if(!d){const g=svgEl('g',{class:'ldot'},domeLayer);d={g,line:svgEl('line',{x1:0,y1:0,'stroke-width':1.5,opacity:.55},g),
      c:svgEl('circle',{r:9},g),t:svgEl('text',{'text-anchor':'middle','dominant-baseline':'central','font-size':10,'font-weight':700,'font-family':'inherit'},g)};domeDots.set(L.id,d);}
    const p=domePos(L),selected=L.id===state.selLight;
    d.line.setAttribute('x2',p.x.toFixed(1));d.line.setAttribute('y2',p.y.toFixed(1));d.line.setAttribute('stroke',L.color);
    d.c.setAttribute('cx',p.x.toFixed(1));d.c.setAttribute('cy',p.y.toFixed(1));d.c.setAttribute('fill',L.color);
    d.c.setAttribute('r',selected?10.5:8.5);d.c.setAttribute('stroke',selected?'var(--accent)':'rgba(0,0,0,.35)');d.c.setAttribute('stroke-width',selected?3:1);
    d.c.setAttribute('opacity',L.intensity>0?1:.45);
    d.t.setAttribute('x',p.x.toFixed(1));d.t.setAttribute('y',p.y.toFixed(1));d.t.textContent=String(i+1);d.t.setAttribute('fill',lum(L.color)>.45?'#111':'#fff');
    if(selected)domeLayer.appendChild(d.g);
  });
  domeDots.forEach((d,id)=>{if(!alive.has(id)){d.g.remove();domeDots.delete(id);}});
  const L=selLight();
  domeCap.textContent=L?('Işık '+(state.lights.indexOf(L)+1)+': yön '+Math.round(L.az)+'°, yükseklik '+Math.round(L.el)+'°'):'';
}
function domePoint(e){const r=domeSvg.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*224-112,y:(e.clientY-r.top)/r.height*224-112};}
function setFromDome(L,pt){const r=Math.min(1,Math.hypot(pt.x,pt.y)/100);L.el=clamp(90*(1-r),2,90);L.az=wrap(Math.atan2(pt.x,pt.y)/D2R);}
let domeDrag=null,domeRaf=0;
function lightMoved(){if(domeRaf)return;domeRaf=requestAnimationFrame(()=>{domeRaf=0;applyTransform();syncSliders();renderDome();});}
domeSvg.addEventListener('pointerdown',e=>{
  if(!state.lights.length)return;e.preventDefault();
  const pt=domePoint(e);let best=null,bd=16;
  state.lights.forEach(L=>{const p=domePos(L),dd=Math.hypot(p.x-pt.x,p.y-pt.y);if(dd<bd){bd=dd;best=L;}});
  if(best){if(best.id!==state.selLight){state.selLight=best.id;syncAll();}}
  else{best=selLight();if(!best)return;setFromDome(best,pt);lightMoved();}
  domeDrag=best.id;domeSvg.setPointerCapture(e.pointerId);domeSvg.focus({preventScroll:true});
});
domeSvg.addEventListener('pointermove',e=>{if(!domeDrag)return;const L=state.lights.find(l=>l.id===domeDrag);if(!L)return;setFromDome(L,domePoint(e));lightMoved();});
const domeEnd=()=>{if(domeDrag){domeDrag=null;syncUI();}};
domeSvg.addEventListener('pointerup',domeEnd);domeSvg.addEventListener('pointercancel',domeEnd);
domeSvg.addEventListener('wheel',e=>{const L=selLight();if(!L||L.mod==='sun')return;e.preventDefault();L.dist=clamp(L.dist*Math.exp(e.deltaY*.0012),.6,5);lightMoved();},{passive:false});
domeSvg.addEventListener('keydown',e=>{
  const L=selLight();if(!L)return;const st=e.shiftKey?15:3;let used=true;
  if(e.key==='ArrowLeft')L.az=wrap(L.az-st);else if(e.key==='ArrowRight')L.az=wrap(L.az+st);
  else if(e.key==='ArrowUp')L.el=clamp(L.el+st,2,90);else if(e.key==='ArrowDown')L.el=clamp(L.el-st,2,90);
  else if(e.key==='Tab'||e.key==='n'){if(e.key==='Tab')used=false;else{const i=state.lights.indexOf(L);state.selLight=state.lights[(i+1)%state.lights.length].id;syncAll();}}
  else used=false;
  if(used){e.preventDefault();lightMoved();}
});
$('#domeClose').addEventListener('click',()=>{state.showDome=false;$('#showDome').checked=false;renderDome();});
onLightsUpdated(renderDome);onSyncUI(renderDome);

export {lightMoved,renderDome,setFromDome};
