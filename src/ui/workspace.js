import {state} from '../state/state.js';
import {activate,boardSize,doc,moveBoard,onBoards,renameBoard} from './boards.js';
import {gradCss,layout,setStageGeometry} from './layout.js';
import {onUi,panning,setUi,ui} from './ui-state.js';
import {t as tx} from '../lang.js';
import {$,clamp} from '../util.js';

/* The workspace: an infinite canvas holding the artboards (Figma-like).
   - Pan: Hand tool (H), Space held, middle button, or wheel / two-finger scroll. Zoom: Cmd/Ctrl + wheel or pinch,
     around the pointer; Shift+1 fits all boards; the zoom box steps and fits.
   - Boards are placed in output pixels; the view maps them to the screen (V: offset + scale).
   - The live WebGL canvas (#frame) is positioned over the active board by layout() through the geometry provider
     below; other boards show their thumbnails.
   - A board is moved by dragging its name label; its edges / centres snap to the other boards with red guides
     (Shift: one axis, Cmd/Ctrl: no snapping). Clicking a board (or its label) makes it the active one. */
const stage=$('#stagearea'),world=$('#world'),nav=$('#navSvg'),zoomVal=$('#zoomVal');
const V={x:0,y:0,z:.25};
const els=new Map();  // board id -> {el,label,img,size}

/* --- geometry */
function boardRect(b){const [w,h]=boardSize(b);return {x:V.x+b.x*V.z,y:V.y+b.y*V.z,w:w*V.z,h:h*V.z};}
function placeChrome(){
  const k=1/V.z;
  els.forEach(o=>{o.label.style.transform='scale('+k+')';o.size.style.transform='translateX(-50%) scale('+k+')';});
  zoomVal.textContent=Math.round(V.z*100)+'%';
}
// the live canvas follows the active board; the axis widget sits in its top-right corner when there is room
setStageGeometry(()=>{
  const a=doc.boards.find(b=>b.id===doc.active);if(!a){nav.style.display='none';placeChrome();return null;}
  world.style.transform='translate('+V.x+'px,'+V.y+'px) scale('+V.z+')';
  doc.boards.forEach(b=>{const o=els.get(b.id);if(!o)return;const [w,h]=boardSize(b);
    o.el.style.left=b.x+'px';o.el.style.top=b.y+'px';o.el.style.width=w+'px';o.el.style.height=h+'px';o.size.textContent=w+' × '+h;});
  placeChrome();
  const r=boardRect(a);
  const room=r.w>=220&&r.h>=180;nav.style.display=room?'':'none';
  if(room)nav.style.transform='translate('+Math.round(r.x+r.w-70)+'px,'+Math.round(r.y+6)+'px)';
  return Object.assign(r,{sw:stage.clientWidth,sh:stage.clientHeight});
});
const relayout=()=>layout();

/* --- board elements */
function renderBoards(){
  const ids=new Set(doc.boards.map(b=>b.id));
  els.forEach((o,id)=>{if(!ids.has(id)){o.el.remove();els.delete(id);}});
  doc.boards.forEach(b=>{
    let o=els.get(b.id);
    if(!o){
      const el=document.createElement('div');el.className='ab';el.dataset.board=b.id;
      el.innerHTML='<span class="ab-label"></span><img alt=""><span class="ab-size"></span>';
      o={el,label:el.querySelector('.ab-label'),img:el.querySelector('img'),size:el.querySelector('.ab-size')};
      o.label.addEventListener('pointerdown',e=>{if(!o.editing)dragBoard(e,b.id);});
      o.label.addEventListener('dblclick',e=>{e.stopPropagation();editLabel(o,b);});
      o.label.title=tx('Taşımak için sürükle, yeniden adlandırmak için çift tıkla');
      el.addEventListener('pointerdown',e=>{if(e.button!==0||panning()||e.target===o.label)return;if(b.id!==doc.active){e.stopPropagation();pick(b.id);}});
      els.set(b.id,o);world.appendChild(el);
    }
    const live=b.id===doc.active,st=live?state:b.snap.state;
    if(!o.editing)o.label.textContent=b.name;o.el.classList.toggle('live',live);o.el.classList.toggle('active',live);
    o.el.classList.toggle('sel',live&&ui.kind==='board');o.size.hidden=!(live&&ui.kind==='board');
    o.el.classList.toggle('checker',st.bg==='transparent');
    if(b.thumb&&o.img.getAttribute('src')!==b.thumb)o.img.src=b.thumb;
    o.img.hidden=!b.thumb;
    // the live board is drawn by #frame (layout.js); its own background would show through transparent parts
    o.el.style.background=live||b.thumb||st.bg==='transparent'?'':st.bg==='solid'?st.solid:st.bg==='gradient'?gradCss(st):st.bg==='image'&&b.snap.images&&b.snap.images[st.bgImg]?'center/cover no-repeat url("'+b.snap.images[st.bgImg].src+'")':st.bg==='pattern'?st.pbase:'';
  });
  relayout();
}
function pick(id){activate(id);setUi({kind:'board'});}
// double-click on a board's name: rename it in place (Enter / leaving the field saves, Esc cancels)
function editLabel(o,b){
  if(o.editing)return;o.editing=true;
  const inp=document.createElement('input');inp.className='ab-ren';inp.value=b.name;inp.setAttribute('aria-label',tx('Artboard adı'));inp.spellcheck=false;
  o.label.textContent='';o.label.appendChild(inp);inp.focus();inp.select();
  const end=ok=>{if(!o.editing)return;o.editing=false;const v=inp.value;inp.remove();o.label.textContent=b.name;if(ok)renameBoard(b.id,v);};
  inp.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')end(true);else if(e.key==='Escape')end(false);});
  inp.addEventListener('pointerdown',e=>e.stopPropagation());
  inp.addEventListener('blur',()=>end(true));
}
onBoards(renderBoards);
onUi(()=>{renderBoards();stage.classList.toggle('hand',panning());stage.dataset.tool=ui.tool;});

/* --- view */
// fitted: the boards the view was last fitted to; any other view change (pan, zoom) forgets it
let fitted=null;
function setView(x,y,z){V.x=x;V.y=y;V.z=z;fitted=null;relayout();}
function zoomAt(f,cx,cy){const z=clamp(V.z*f,.02,4);setView(cx-(cx-V.x)*z/V.z,cy-(cy-V.y)*z/V.z,z);}
function bounds(list){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  list.forEach(b=>{const [w,h]=boardSize(b);x0=Math.min(x0,b.x);y0=Math.min(y0,b.y);x1=Math.max(x1,b.x+w);y1=Math.max(y1,b.y+h);});
  return {x0,y0,x1,y1};
}
// room kept free when fitting: the board's name (top), its size label and the dock (bottom)
const FIT_TOP=36,FIT_BOTTOM=90;
// fits boards into the stage, leaving room for labels (top) and the dock (bottom); tight (the presentation,
// ui/present.js): edge to edge, and a small board may grow past 100%
function fitBoards(list,tight){
  if(!list||!list.length)return;
  const r=stage.getBoundingClientRect(),{x0,y0,x1,y1}=bounds(list||doc.boards),pad=tight?0:40,top=tight?0:FIT_TOP,bottom=tight?0:FIT_BOTTOM;
  const z=clamp(Math.min((r.width-2*pad)/(x1-x0),(r.height-top-bottom)/(y1-y0)),.02,tight?4:1);
  setView((r.width-(x1-x0)*z)/2-x0*z,top+(r.height-top-bottom-(y1-y0)*z)/2-y0*z,z);
  fitted={ids:list.map(b=>b.id),tight:!!tight};
}
const fitAll=()=>fitBoards(doc.boards);
const fitActive=()=>fitBoards(doc.boards.filter(b=>b.id===doc.active));
const fitPresent=()=>fitBoards(doc.boards.filter(b=>b.id===doc.active),true);
// the view as a value, and back (the presentation restores the editor's view on leaving)
const viewState=()=>({x:V.x,y:V.y,z:V.z});
const restoreView=v=>{if(v)setView(v.x,v.y,v.z);};
$('#zoomIn').addEventListener('click',()=>{const r=stage.getBoundingClientRect();zoomAt(1.25,r.width/2,r.height/2);});
$('#zoomOut').addEventListener('click',()=>{const r=stage.getBoundingClientRect();zoomAt(.8,r.width/2,r.height/2);});
zoomVal.addEventListener('click',fitAll);
// the stage changes size with the window and when the timeline opens (Canlandır) or closes: a fitted view is
// fitted again; otherwise the active board is refitted only if it no longer fits between the labels and the dock
let stageSize='';
new ResizeObserver(()=>{
  const r=stage.getBoundingClientRect(),sz=Math.round(r.width)+'x'+Math.round(r.height);
  if(sz===stageSize){relayout();return;}
  stageSize=sz;
  if(fitted){const {ids,tight}=fitted,list=doc.boards.filter(b=>ids.includes(b.id));if(list.length){fitBoards(list,tight);return;}}
  const b=doc.boards.find(b=>b.id===doc.active);
  if(b){const [w,h]=boardSize(b),x=V.x+b.x*V.z,y=V.y+b.y*V.z;
    if(x<0||y<FIT_TOP||x+w*V.z>r.width||y+h*V.z>r.height-FIT_BOTTOM){fitActive();return;}}
  relayout();
}).observe(stage);

/* --- panning: capture phase on the stage, so the 3D canvas never sees these presses */
let pan=null;
stage.addEventListener('pointerdown',e=>{
  if(!(panning()||e.button===1))return;
  if(e.target.closest('.dock,.zoombox,.menu'))return;
  e.preventDefault();e.stopPropagation();pan={id:e.pointerId,x:e.clientX,y:e.clientY,vx:V.x,vy:V.y};
  stage.setPointerCapture(e.pointerId);stage.classList.add('panning');
},true);
stage.addEventListener('pointermove',e=>{if(pan&&e.pointerId===pan.id)setView(pan.vx+e.clientX-pan.x,pan.vy+e.clientY-pan.y,V.z);});
const endPan=e=>{if(pan&&e.pointerId===pan.id){pan=null;stage.classList.remove('panning');}};
stage.addEventListener('pointerup',endPan);stage.addEventListener('pointercancel',endPan);
// wheel: scroll pans, Cmd/Ctrl (and trackpad pinch, which arrives as ctrl+wheel) zooms. The 3D canvas handles
// Alt+wheel (camera zoom) and screenshot scrolling itself and stops the event in those cases.
stage.addEventListener('wheel',e=>{
  if(e.target.closest('.dock,.zoombox,.menu'))return;
  e.preventDefault();const r=stage.getBoundingClientRect();
  if(e.ctrlKey||e.metaKey)zoomAt(Math.exp(-e.deltaY*(e.ctrlKey&&!e.metaKey&&Math.abs(e.deltaY)<40?.02:.004)),e.clientX-r.left,e.clientY-r.top);
  else setView(V.x-(e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX),V.y-(e.shiftKey&&!e.deltaX?0:e.deltaY),V.z);
},{passive:false});
// pressing on empty canvas (outside every board) selects nothing: inspector shows the active board
stage.addEventListener('pointerdown',e=>{if(e.target===stage||e.target===world)setUi({kind:'board'});});

/* --- dragging a board by its label, with smart guides */
const SNAP=6;
let guides=[];
function clearGuides(){guides.forEach(g=>g.remove());guides=[];}
function guide(x,y,w,h){const g=document.createElement('div');g.className='guide';const t=1/V.z;
  g.style.cssText='left:'+x+'px;top:'+y+'px;width:'+(w||t)+'px;height:'+(h||t)+'px';world.appendChild(g);guides.push(g);}
function snap(b,lock){
  const [bw,bh]=boardSize(b),tol=SNAP/V.z,me={x:b.x,y:b.y,w:bw,h:bh};
  const others=doc.boards.filter(o=>o!==b).map(o=>{const [w,h]=boardSize(o);return {x:o.x,y:o.y,w,h};});
  ['x','y'].forEach(ax=>{
    if(lock&&lock!==ax)return;const sz=ax==='x'?'w':'h';let best=null;
    others.forEach(o=>[o[ax],o[ax]+o[sz]/2,o[ax]+o[sz]].forEach(t=>[0,.5,1].forEach(f=>{const d=t-(me[ax]+me[sz]*f);if(Math.abs(d)<=tol&&(!best||Math.abs(d)<Math.abs(best.d)))best={d,t,o};})));
    if(!best)return;me[ax]+=best.d;
    const o=best.o;
    if(ax==='x'){const y0=Math.min(o.y,me.y),y1=Math.max(o.y+o.h,me.y+me.h);guide(best.t,y0,0,y1-y0);}
    else{const x0=Math.min(o.x,me.x),x1=Math.max(o.x+o.w,me.x+me.w);guide(x0,best.t,x1-x0,0);}
  });
  return me;
}
function dragBoard(e,id){
  if(e.button!==0||panning())return;e.preventDefault();e.stopPropagation();
  const b=doc.boards.find(x=>x.id===id),st={x:e.clientX,y:e.clientY,bx:b.x,by:b.y};let moved=false;
  pick(id);
  const mv=ev=>{
    let dx=(ev.clientX-st.x)/V.z,dy=(ev.clientY-st.y)/V.z;if(!moved&&Math.hypot(ev.clientX-st.x,ev.clientY-st.y)<3)return;moved=true;
    let lock=null;if(ev.shiftKey){if(Math.abs(dx)>Math.abs(dy)){dy=0;lock='x';}else{dx=0;lock='y';}}
    b.x=st.bx+dx;b.y=st.by+dy;clearGuides();
    if(!(ev.metaKey||ev.ctrlKey)){const m=snap(b,lock);b.x=m.x;b.y=m.y;}
    moveBoard(id,b.x,b.y);relayout();
  };
  const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);clearGuides();};
  addEventListener('pointermove',mv);addEventListener('pointerup',up);addEventListener('pointercancel',up);
}

/* --- zoom tool (Figma's Z): only while Z is held. A click zooms in 2× at the pointer, a drag zooms to the dragged
   area; with Alt / Option a click zooms out (no area drag then). Releasing Z (or leaving the window) goes back to the
   previous tool. Captured on the stage, so the 3D canvas never sees these presses. */
let zdrag=null,zPrev='select',zHeld=false,altDown=false;
// Option / Alt: from the pointer event, or from the keyboard (some pointer sources leave altKey out of drags)
const alt=e=>e.altKey||altDown;
const marq=document.createElement('div');marq.className='zmarq';marq.hidden=true;stage.appendChild(marq);
stage.addEventListener('pointerdown',e=>{
  if(ui.tool!=='zoom'||e.button!==0||e.target.closest('.dock,.zoombox,.menu,.ibox,.tbox'))return;
  e.preventDefault();e.stopPropagation();const r=stage.getBoundingClientRect();
  zdrag={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top,alt:alt(e)};stage.setPointerCapture(e.pointerId);
},true);
stage.addEventListener('pointermove',e=>{
  if(!zdrag||e.pointerId!==zdrag.id)return;const r=stage.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(zdrag.alt||alt(e)||Math.hypot(x-zdrag.x,y-zdrag.y)<5){marq.hidden=true;return;}  // zooming out: clicks only
  marq.hidden=false;Object.assign(marq.style,{left:Math.min(x,zdrag.x)+'px',top:Math.min(y,zdrag.y)+'px',width:Math.abs(x-zdrag.x)+'px',height:Math.abs(y-zdrag.y)+'px'});
},true);
function endZoom(e,cancel){
  if(!zdrag||e.pointerId!==zdrag.id)return;const d=zdrag;zdrag=null;const dragged=!marq.hidden;marq.hidden=true;if(cancel)return;
  const r=stage.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(alt(e)||d.alt){zoomAt(.5,x,y);return;}
  if(!dragged){zoomAt(2,x,y);return;}
  // the dragged area fills the stage (the same margins as "fit")
  const w=Math.abs(x-d.x),h=Math.abs(y-d.y),cx=(x+d.x)/2,cy=(y+d.y)/2,pad=40;
  const z=clamp(V.z*Math.min((r.width-2*pad)/w,(r.height-2*pad)/h),.02,4),wx=(cx-V.x)/V.z,wy=(cy-V.y)/V.z;
  setView(r.width/2-wx*z,r.height/2-wy*z,z);
}
stage.addEventListener('pointerup',e=>endZoom(e,false),true);stage.addEventListener('pointercancel',e=>endZoom(e,true),true);
// the cursor: magnifier, with a minus while Alt / Option is down
const altKey=on=>{altDown=on;document.documentElement.classList.toggle('alt-down',on);};
addEventListener('keydown',e=>{if(e.key==='Alt')altKey(true);});addEventListener('keyup',e=>{if(e.key==='Alt')altKey(false);});
addEventListener('blur',()=>altKey(false));
addEventListener('keydown',e=>{
  if(typing(e.target)||e.metaKey||e.ctrlKey||e.shiftKey)return;
  if(e.code==='KeyZ'){e.preventDefault();if(!zHeld&&ui.tool!=='zoom'){zPrev=ui.tool;setUi({tool:'zoom'});}zHeld=true;}
},true);
// Z released (or the window lost focus while it was down): the previous tool again
const releaseZ=()=>{if(!zHeld)return;zHeld=false;marq.hidden=true;zdrag=null;if(ui.tool==='zoom')setUi({tool:zPrev==='zoom'?'select':zPrev});};
addEventListener('keyup',e=>{if(e.code==='KeyZ')releaseZ();});
addEventListener('blur',releaseZ);

/* --- keys: Space = temporary hand, Shift+1 fit all, Shift+2 fit the active board */
const typing=t=>t&&(/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)||t.isContentEditable);
addEventListener('keydown',e=>{
  if(typing(e.target))return;
  if(e.code==='Space'&&!e.repeat){e.preventDefault();setUi({space:true});}
  else if(e.shiftKey&&e.code==='Digit1'){e.preventDefault();fitAll();}
  else if(e.shiftKey&&e.code==='Digit2'){e.preventDefault();fitActive();}
});
addEventListener('keyup',e=>{if(e.code==='Space')setUi({space:false});});
addEventListener('blur',()=>setUi({space:false}));

export {fitActive,fitAll,fitPresent,renderBoards,restoreView,viewState};
