import {renderer,setCrop} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {state,view} from '../state/state.js';
import {$} from '../util.js';

/* ---------- layout & background ----------
   The live canvas (#frame) sits over the active artboard on the workspace. workspace.js registers the geometry
   provider: it returns the board's on-screen rectangle (stage pixels) and positions the board elements. */
const frame=$('#frame');
// 'custom' = artboard of state.customW x state.customH px
const ratioNums=()=>state.ratio==='custom'?[state.customW,state.customH]:state.ratio.split(':').map(Number);
let geometry=null;
function setStageGeometry(fn){geometry=fn;}
let lastKey='',board=null,screen=null;
const layoutSubs=[];
// called after every layout with the board's on-screen rectangle (stage pixels): overlays that follow the board
function onLayout(fn){layoutSubs.push(fn);}
const boardScreen=()=>screen;
// 2D items: one layer under the WebGL canvas (behind the devices), one over it; both sized to the whole board
const itemLayers={back:document.createElement('div'),front:document.createElement('div')};
itemLayers.back.className='items';itemLayers.front.className='items';
frame.prepend(itemLayers.back);frame.append(itemLayers.front);
function layout(){
  const r=geometry&&geometry();if(!r)return;screen={x:r.x,y:r.y,w:r.w,h:r.h};
  // visible part of the board on the stage; the canvas covers only that, the camera renders that slice
  const x0=Math.max(r.x,0),y0=Math.max(r.y,0),x1=Math.min(r.x+r.w,r.sw),y1=Math.min(r.y+r.h,r.sh);
  const vx=Math.round(x0),vy=Math.round(y0),vw=Math.max(1,Math.round(x1-x0)),vh=Math.max(1,Math.round(y1-y0));
  frame.hidden=x1<=x0||y1<=y0;
  frame.style.transform='translate('+vx+'px,'+vy+'px)';
  // the board background (CSS) is sized to the whole board and shifted, so the visible part lines up
  board={w:r.w,h:r.h,x:r.x-vx,y:r.y-vy};applyBgFit();renderItems();layoutSubs.forEach(f=>f(screen));
  const pr=Math.min(window.devicePixelRatio||1,2),full=vw>=Math.round(r.w)-1&&vh>=Math.round(r.h)-1;
  const key=[vw,vh,pr,full?'':[r.w,r.h,vx-r.x,vy-r.y].map(v=>v.toFixed(1)).join()].join('|');
  if(key===lastKey)return;lastKey=key;
  frame.style.width=vw+'px';frame.style.height=vh+'px';
  renderer.setPixelRatio(pr);renderer.setSize(vw,vh,false);view.aspect=r.w/r.h;
  setCrop(full?null:{fw:r.w,fh:r.h,x:vx-r.x,y:vy-r.y,w:vw,h:vh});
  applyTransform();
}
/* Image background on a W x H board: cover (fill, cropped) or contain (whole image), times bgScale, shifted by bgX / bgY
   board widths / heights. The live view (CSS) and paintBg (export, thumbnails) use the same rectangle. */
const hasImg=()=>state.bg==='image'&&state.bgImg;
const imgSize=img=>[img.naturalWidth||img.width||1,img.naturalHeight||img.height||1];
function bgRect(W,H){
  const [iw,ih]=imgSize(state.bgImg),f=state.bgFit==='contain'?Math.min:Math.max,k=f(W/iw,H/ih)*(state.bgScale||1);
  return {w:iw*k,h:ih*k,x:(W-iw*k)/2+(state.bgX||0)*W,y:(H-ih*k)/2+(state.bgY||0)*H};
}
function applyBgFit(){if(!board||state.bg==='transparent'){frame.style.backgroundSize='';frame.style.backgroundPosition='';return;}
  let {w,h,x,y}=board;
  const px=v=>v.toFixed(1)+'px';
  if(hasImg()){
    // the image over a checkerboard: what the image does not cover stays transparent in the export
    const c=bgRect(w,h);
    frame.style.backgroundSize=px(c.w)+' '+px(c.h)+',16px 16px';frame.style.backgroundPosition=px(x+c.x)+' '+px(y+c.y)+','+px(x)+' '+px(y);frame.style.backgroundRepeat='no-repeat,repeat';
    return;
  }
  frame.style.backgroundSize=px(w)+' '+px(h);frame.style.backgroundPosition=px(x)+' '+px(y);frame.style.backgroundRepeat='no-repeat';}
// forces the next layout to resize the renderer (after an export or thumbnail changed it)
function invalidateLayout(){lastKey='';}
function bgCss(){
  frame.classList.toggle('checker',state.bg==='transparent');
  frame.style.background=state.bg==='solid'?state.solid:state.bg==='gradient'?'linear-gradient(to bottom right, '+state.bg1+', '+state.bg2+')':hasImg()?'url("'+state.bgImg.src+'"),repeating-conic-gradient(var(--chk1) 0 25%,var(--chk2) 0 50%)':'';
  applyBgFit();
  // the cover fit needs the image's size: lay out again once it has loaded
  if(hasImg()&&!state.bgImg.complete)state.bgImg.addEventListener('load',()=>{if(hasImg())applyBgFit();},{once:true});
}
function paintBg(g,W,H){
  if(state.bg==='solid'){g.fillStyle=state.solid;g.fillRect(0,0,W,H);}
  else if(state.bg==='gradient'){
    const n=Math.hypot(W,H),ux=H/n,uy=W/n,hl=W*H/n,cx=W/2,cy=H/2;
    const gr=g.createLinearGradient(cx-ux*hl,cy-uy*hl,cx+ux*hl,cy+uy*hl);
    gr.addColorStop(0,state.bg1);gr.addColorStop(1,state.bg2);g.fillStyle=gr;g.fillRect(0,0,W,H);
  } else if(hasImg()){if(state.format==='jpg'){g.fillStyle='#ffffff';g.fillRect(0,0,W,H);}const c=bgRect(W,H);g.drawImage(state.bgImg,c.x,c.y,c.w,c.h);}
  else if(state.format==='jpg'){g.fillStyle='#ffffff';g.fillRect(0,0,W,H);}
}

/* ---------- 2D items ----------
   Geometry of an item on a W x H board: centre (x*W, y*H), width w*W, height from the image's aspect, rotation rot. */
function itemRect(it,W,H){const [iw,ih]=imgSize(it.img),w=it.w*W;return {cx:it.x*W,cy:it.y*H,w,h:w*ih/iw,rot:it.rot||0};}
const els=new Map();  // item id -> <img>
function renderItems(){
  if(!board)return;
  const {w:W,h:H,x,y}=board,seen=new Set();
  for(const k in itemLayers){const L=itemLayers[k];L.style.width=W+'px';L.style.height=H+'px';L.style.transform='translate('+x+'px,'+y+'px)';}
  state.items.forEach(it=>{
    let el=els.get(it.id);
    if(!el){el=document.createElement('img');el.alt='';el.draggable=false;els.set(it.id,el);}
    if(el.src!==it.img.src)el.src=it.img.src;
    const r=itemRect(it,W,H),L=itemLayers[it.front?'front':'back'];
    el.style.cssText='width:'+r.w+'px;height:'+r.h+'px;transform:translate('+(r.cx-r.w/2)+'px,'+(r.cy-r.h/2)+'px) rotate('+r.rot+'deg);opacity:'+(it.opacity??1);
    L.appendChild(el);seen.add(it.id);  // re-appending keeps the DOM order = paint order
    if(!it.img.complete)it.img.addEventListener('load',renderItems,{once:true});
  });
  els.forEach((el,id)=>{if(!seen.has(id)){el.remove();els.delete(id);}});
}
// export / thumbnails: the items of one layer drawn on a W x H canvas
function paintItems(g,W,H,front){
  state.items.forEach(it=>{if(!!it.front!==front||!it.img.complete)return;const r=itemRect(it,W,H);
    g.save();g.globalAlpha=it.opacity??1;g.translate(r.cx,r.cy);g.rotate(r.rot*Math.PI/180);g.drawImage(it.img,-r.w/2,-r.h/2,r.w,r.h);g.restore();});
}

export {bgCss,boardScreen,frame,imgSize,invalidateLayout,itemRect,layout,onLayout,paintBg,paintItems,ratioNums,renderItems,setStageGeometry};
