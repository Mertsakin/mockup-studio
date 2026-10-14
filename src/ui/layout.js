import {gradCss,paintGradient} from '../render/backgrounds.js';
import {renderer,setCrop} from '../render/renderer.js';
import {rectOf,resolve} from '../render/item-layout.js';
import {onFont,textPad} from '../render/text.js';
import {drawTextAt,fxPad} from '../render/text-fx.js';
import {applyTransform} from '../render/transform.js';
import {state,view} from '../state/state.js';
import {$,roundRect} from '../util.js';

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
  const r=geometry&&geometry();if(!r){frame.hidden=true;screen=null;layoutSubs.forEach(f=>f(null));return;}screen={x:r.x,y:r.y,w:r.w,h:r.h};
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
  frame.style.background=state.bg==='solid'?state.solid:state.bg==='gradient'?gradCss(state):hasImg()?'url("'+state.bgImg.src+'"),repeating-conic-gradient(var(--chk1) 0 25%,var(--chk2) 0 50%)':'';
  applyBgFit();
  // the cover fit needs the image's size: lay out again once it has loaded
  if(hasImg()&&!state.bgImg.complete)state.bgImg.addEventListener('load',()=>{if(hasImg())applyBgFit();},{once:true});
}
function paintBg(g,W,H){
  // formats without transparency (JPG, 24-bit PNG) get white where nothing else is painted
  const opaque=state.format==='jpg'||state.format==='png24';
  if(state.bg==='solid'){g.fillStyle=state.solid;g.fillRect(0,0,W,H);}
  else if(state.bg==='gradient')paintGradient(g,W,H,state);
  else if(hasImg()){if(opaque){g.fillStyle='#ffffff';g.fillRect(0,0,W,H);}const c=bgRect(W,H);g.drawImage(state.bgImg,c.x,c.y,c.w,c.h);}
  else if(opaque){g.fillStyle='#ffffff';g.fillRect(0,0,W,H);}
}

/* ---------- 2D items ----------
   The items form a tree (frames hold items; render/item-layout.js lays it out). itemRect: an item's centre, size and
   rotation on a W x H board, whatever its parents. The live view mirrors the tree in the DOM (a frame is a div holding
   its children, so rotation, opacity and clipping nest like in the export); the export paints it on a canvas. */
const itemRect=(it,W,H)=>rectOf(state.items,it,W,H);
const els=new Map();  // item id -> <img>, <canvas> (text) or <div> (frame)
/* Text effects draw at a time: the clock (set by ui/animate.js) gives the playhead in Canlandır, null (settled text)
   in Tasarla. Every redraw tells the onItems hooks (animation recording compares the items' fields then). */
let clock=()=>null;
function setItemClock(fn){clock=fn;}
const itemSubs=[];
function onItems(fn){itemSubs.push(fn);}
let hiddenItem=null;  // the text being edited in place (its editor shows the text instead)
function hideItem(id){hiddenItem=id;renderItems();}
// a text item drawn on its own canvas at the screen's pixel density (at most 4096 px a side), padded for overhang and shadow
function drawTextEl(el,it,r,W,t){
  if(!it.fx||!(it.fx.in||it.fx.out||it.fx.loop))t=null;  // no effect: the time does not change the drawing
  const px=(it.size||.06)*W,pad=(textPad(it)+fxPad(it))*px,cw=r.w+2*pad,ch=r.h+2*pad;
  const k=Math.min(window.devicePixelRatio||1,2,4096/Math.max(cw,ch)),bw=Math.max(1,Math.round(cw*k)),bh=Math.max(1,Math.round(ch*k));
  const key=JSON.stringify([it.text,it.font,it.weight,it.italic,it.color,it.color2,it.fill,it.align,it.lh,it.ls,it.wrap,it.shadow,it.fx,t,bw,bh,r.w]);
  if(el.dataset.key!==key){el.dataset.key=key;el.width=bw;el.height=bh;
    const g=el.getContext('2d');g.setTransform(k,0,0,k,cw*k/2,ch*k/2);drawTextAt(g,it,px,t);}
  return pad;
}
const tagOf=it=>it.kind==='text'?'CANVAS':it.kind==='frame'?'DIV':'IMG';
function renderItems(){
  if(!board)return;
  const {w:W,h:H,x,y}=board,seen=new Set(),t=clock(),{nodes,roots}=resolve(state.items,W,H);
  for(const k in itemLayers){const L=itemLayers[k];L.style.width=W+'px';L.style.height=H+'px';L.style.transform='translate('+x+'px,'+y+'px)';}
  // depth first, so the DOM order is the paint order and children sit inside their frame's element
  const put=(id,parentEl)=>{
    const n=nodes.get(id);if(!n)return;const it=n.it,tag=tagOf(it);let el=els.get(id);
    if(el&&el.tagName!==tag){el.remove();el=null;}
    if(!el){el=document.createElement(tag.toLowerCase());if(tag==='IMG'){el.alt='';el.draggable=false;}if(tag==='DIV')el.className='ifr';els.set(id,el);}
    let pad=0;
    if(tag==='CANVAS')pad=drawTextEl(el,n.view,n,W,t);
    else if(tag==='IMG'){if(el.src!==it.img.src)el.src=it.img.src;if(!it.img.complete)it.img.addEventListener('load',renderItems,{once:true});}
    let css='width:'+(n.w+2*pad)+'px;height:'+(n.h+2*pad)+'px;transform:translate('+(n.x-pad)+'px,'+(n.y-pad)+'px) rotate('+n.rot+'deg);opacity:'+(it.opacity??1)+(id===hiddenItem?';visibility:hidden':'');
    if(tag==='DIV'){css+=';background:'+(it.fillOn===false||!it.fill?'transparent':it.fill)+';border-radius:'+((it.radius||0)*W)+'px;overflow:'+(it.clip?'hidden':'visible');
      el.classList.toggle('nofill',it.fillOn===false||!it.fill);}
    el.style.cssText=css;parentEl.appendChild(el);seen.add(id);
    n.kids.forEach(k=>put(k,el));
  };
  roots.forEach(id=>{const n=nodes.get(id);put(id,itemLayers[n.it.front?'front':'back']);});
  els.forEach((el,id)=>{if(!seen.has(id)){el.remove();els.delete(id);}});
  itemSubs.forEach(f=>f());
}
// export / thumbnails: the items of one layer drawn on a W x H canvas; t: time of the text effects (video), else settled
function paintItems(g,W,H,front,t){
  const {nodes,roots}=resolve(state.items,W,H);
  const paint=id=>{
    const n=nodes.get(id);if(!n)return;const it=n.it;
    if(it.kind!=='text'&&it.kind!=='frame'&&!(it.img&&it.img.complete))return;
    g.save();g.globalAlpha*=it.opacity??1;g.translate(n.x+n.w/2,n.y+n.h/2);g.rotate(n.rot*Math.PI/180);
    if(it.kind==='text')drawTextAt(g,n.view,(it.size||.06)*W,t??null);
    else if(it.kind==='frame'){
      const r=Math.min((it.radius||0)*W,n.w/2,n.h/2);g.beginPath();roundRect(g,-n.w/2,-n.h/2,n.w,n.h,r);
      if(it.fillOn!==false&&it.fill){g.fillStyle=it.fill;g.fill();}
      if(it.clip)g.clip();
      g.translate(-n.w/2,-n.h/2);n.kids.forEach(paint);
    }
    else g.drawImage(it.img,-n.w/2,-n.h/2,n.w,n.h);
    g.restore();
  };
  roots.forEach(id=>{if(!!nodes.get(id).it.front===front)paint(id);});
}
// a web font finished loading: text items are measured again and redrawn
onFont(()=>{renderItems();layoutSubs.forEach(f=>f(screen));});

export {bgCss,gradCss,boardScreen,frame,hideItem,imgSize,invalidateLayout,itemRect,layout,onItems,onLayout,paintBg,paintItems,ratioNums,renderItems,setItemClock,setStageGeometry};
