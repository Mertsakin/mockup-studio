import {DEF_LAYOUT,anchorOff,inFlow,lay,parentOf,resolve,subtree} from '../render/item-layout.js';
import {nextItemId,state} from '../state/state.js';
import {sizeOf} from './boards.js';
import {renderItems} from './layout.js';
import {t as tx} from '../lang.js';

/* The 2D item tree (frames hold items, render/item-layout.js): operations that keep what you see in place.
   Sibling order is the order in state.items (the tree comes from the parent links), so moving an item among its
   siblings is moving it in the array. Board pixels (sizeOf) are the unit of every helper here. */
const D2R=Math.PI/180;
const byId=id=>state.items.find(x=>x.id===id);
const isFrame=it=>!!it&&it.kind==='frame';
function rootOf(it){let r=it,p;while((p=parentOf(state.items,r)))r=p;return r;}
const frontOf=it=>!!rootOf(it).front;
// the items sharing it's parent (top level: the same layer, in front of or behind the devices)
function siblingsOf(it){
  const p=parentOf(state.items,it);
  return state.items.filter(x=>p?x.parent===p.id&&parentOf(state.items,x)===p:!parentOf(state.items,x)&&!!x.front===!!it.front);
}
const kidsOf=f=>state.items.filter(x=>x.parent===f.id);
const board=()=>sizeOf(state);
const nodeOf=it=>{const [W,H]=board();return resolve(state.items,W,H).nodes.get(it.id);};
// a board point in a frame's own space (top-left origin, unrotated)
function toLocal(f,x,y){const n=nodeOf(f),a=-n.arot*D2R,dx=x-n.cx,dy=y-n.cy;return {x:dx*Math.cos(a)-dy*Math.sin(a)+n.w/2,y:dx*Math.sin(a)+dy*Math.cos(a)+n.h/2};}
// moves an item that is not placed by auto layout by (dx, dy) board px, whatever its parent's rotation
function moveBy(it,dx,dy){
  const p=parentOf(state.items,it);
  if(!p){const [W,H]=board();it.x=+(it.x+dx/W).toFixed(5);it.y=+(it.y+dy/H).toFixed(5);return;}
  const n=nodeOf(p),a=-n.arot*D2R,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);
  it.x=+(it.x+lx/n.w).toFixed(5);it.y=+(it.y+ly/n.h).toFixed(5);
}
// puts the item's centre at a board point (in its parent's terms; an anchored frame stores its start edge instead)
function setCenter(it,x,y){
  const f=parentOf(state.items,it),me=nodeOf(it),[ox,oy]=me?anchorOff(it,me.w,me.h):[0,0];
  if(!f){const [W,H]=board();it.x=+((x-ox)/W).toFixed(5);it.y=+((y-oy)/H).toFixed(5);return;}
  const l=toLocal(f,x,y),n=nodeOf(f);it.x=+((l.x-ox)/n.w).toFixed(5);it.y=+((l.y-oy)/n.h).toFixed(5);
}
// runs fn (a change of size mode, say) and keeps the item's centre where it was
function keepPlace(it,fn){const n=nodeOf(it);fn();if(n&&!inFlow(state.items,it))setCenter(it,n.cx,n.cy);}
// the item's centre on its parent's middle, on one axis (in the parent's own axes)
function centerOn(it,axis){
  const n=nodeOf(it);if(!n)return;const f=parentOf(state.items,it),[W,H]=board();
  if(!f){setCenter(it,axis==='x'?W/2:n.cx,axis==='y'?H/2:n.cy);return;}
  const c=nodeOf(f),[ox,oy]=anchorOff(it,n.w,n.h);
  if(axis==='x')it.x=+(.5-ox/c.w).toFixed(5);else it.y=+(.5-oy/c.h).toFixed(5);
}
// puts `it` at position `index` among its siblings (array order)
function placeAmong(it,index){
  const sib=siblingsOf(it).filter(x=>x!==it),i=state.items.indexOf(it);state.items.splice(i,1);
  const ref=sib[index];let at=ref?state.items.indexOf(ref):-1;
  if(at<0){const last=sib[sib.length-1];at=last?state.items.indexOf(last)+1:state.items.length;}
  state.items.splice(at,0,it);
}
// into frame `target` (null: the board), keeping its place and angle on the board; index: among the new siblings
function reparent(it,target,index){
  const [W,H]=board(),n=nodeOf(it);if(!n)return;
  const front=frontOf(it);
  const [ox,oy]=anchorOff(it,n.w,n.h);
  if(target){const l=toLocal(target,n.cx,n.cy),tn=nodeOf(target);it.parent=target.id;it.x=+((l.x-ox)/tn.w).toFixed(5);it.y=+((l.y-oy)/tn.h).toFixed(5);it.rot=+(n.arot-tn.arot).toFixed(2);}
  else{delete it.parent;it.x=+((n.cx-ox)/W).toFixed(5);it.y=+((n.cy-oy)/H).toFixed(5);it.rot=+n.arot.toFixed(2);it.front=front;}
  // fill / % sizes meant the old parent: keep the current size fixed
  if(it.wMode==='fill'||it.wMode==='pct'){fixWidth(it,n.w);}
  placeAmong(it,index??Infinity);
}
// the item's current width as a fixed width
function fixWidth(it,wPx){const W=board()[0];if(it.kind==='text'){it.wrap=+(wPx/((it.size||.06)*W)).toFixed(4);}else it.w=+(wPx/W).toFixed(5);it.wMode='fixed';}
function fixHeight(it,hPx){const W=board()[0];it.h=+(hPx/W).toFixed(5);it.hMode='fixed';}
// the deepest frame under a board point, leaving out `skip` and what is inside it
function frameAt(x,y,skip){
  const [W,H]=board(),{nodes,roots}=resolve(state.items,W,H),out=new Set(skip?subtree(state.items,skip):[]);let best=null;
  const walk=id=>{const n=nodes.get(id);if(!n)return;
    if(isFrame(n.it)&&!out.has(n.it)){const a=-n.arot*D2R,dx=x-n.cx,dy=y-n.cy,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);
      if(Math.abs(lx)<=n.w/2&&Math.abs(ly)<=n.h/2)best=n.it;}
    n.kids.forEach(walk);};
  roots.forEach(walk);return best;
}
// where a board point falls among a flow frame's children (index to insert at)
function flowIndex(f,x,y,skip){
  const l=toLocal(f,x,y),row=lay(f).dir==='row',flow=kidsOf(f).filter(c=>c!==skip&&!c.abs);
  let i=0;flow.forEach(c=>{const n=nodeOf(c),cl=toLocal(f,n.cx,n.cy);if((row?cl.x:cl.y)<(row?l.x:l.y))i++;});
  // the index among all siblings (absolute ones included) of the flow item that follows
  const next=flow[i];return next?siblingsOf(flow[0]).filter(c=>c!==skip).indexOf(next):Infinity;
}
function removeTree(it){const gone=new Set(subtree(state.items,it));state.items=state.items.filter(x=>!gone.has(x));return gone;}

/* ---------- making frames */
function newFrame(props){
  return Object.assign({id:nextItemId(),kind:'frame',anc:1,name:tx('Çerçeve'),x:.5,y:.5,w:.4,h:.3,rot:0,opacity:1,front:true,
    fill:'#ffffff',fillOn:true,radius:0,clip:false,wMode:'fixed',hMode:'fixed',layout:Object.assign({},DEF_LAYOUT)},props);
}
// wraps the items (they must share a parent: the first one's) in a new frame around them; auto: with auto layout,
// its direction, gap and alignment read from how they are arranged now
function wrap(list,auto){
  list=list.filter(Boolean);if(!list.length)return null;
  const p=parentOf(state.items,list[0]);list=list.filter(it=>parentOf(state.items,it)===p);
  const [W,H]=board(),ns=list.map(nodeOf);
  // board-aligned bounds of the rotated items
  const ext=ns.map(n=>{const a=n.arot*D2R,ex=(Math.abs(n.w*Math.cos(a))+Math.abs(n.h*Math.sin(a)))/2,ey=(Math.abs(n.w*Math.sin(a))+Math.abs(n.h*Math.cos(a)))/2;
    return {n,x0:n.cx-ex,x1:n.cx+ex,y0:n.cy-ey,y1:n.cy+ey};});
  const X0=Math.min(...ext.map(e=>e.x0)),X1=Math.max(...ext.map(e=>e.x1)),Y0=Math.min(...ext.map(e=>e.y0)),Y1=Math.max(...ext.map(e=>e.y1));
  const f=newFrame({name:auto?'Auto layout':tx('Çerçeve'),w:+((X1-X0)/W).toFixed(5),h:+((Y1-Y0)/W).toFixed(5),fillOn:false,front:frontOf(list[0])});
  if(p){const l=toLocal(p,(X0+X1)/2,(Y0+Y1)/2),pn=nodeOf(p);f.parent=p.id;f.x=+(l.x/pn.w).toFixed(5);f.y=+(l.y/pn.h).toFixed(5);f.rot=0;}
  else{f.x=+((X0+X1)/2/W).toFixed(5);f.y=+((Y0+Y1)/2/H).toFixed(5);}
  const first=Math.min(...list.map(it=>state.items.indexOf(it)));state.items.splice(first,0,f);
  if(auto){
    // direction: along the larger spread of the centres; order along it; gap: the mean space between neighbours
    const sx=Math.max(...ns.map(n=>n.cx))-Math.min(...ns.map(n=>n.cx)),sy=Math.max(...ns.map(n=>n.cy))-Math.min(...ns.map(n=>n.cy));
    const row=sx>sy,sorted=ext.slice().sort((a,b)=>row?a.n.cx-b.n.cx:a.n.cy-b.n.cy);
    let g=0;for(let i=1;i<sorted.length;i++)g+=Math.max(0,row?sorted[i].x0-sorted[i-1].x1:sorted[i].y0-sorted[i-1].y1);
    g=sorted.length>1?g/(sorted.length-1):0;
    // alignment: centres in line -> center, else the side they share
    const near=(vals)=>Math.max(...vals)-Math.min(...vals)<W*.004;
    const align=near(sorted.map(e=>row?e.n.cy:e.n.cx))?'center':near(sorted.map(e=>row?e.y0:e.x0))?'start':near(sorted.map(e=>row?e.y1:e.x1))?'end':'start';
    f.layout=Object.assign({},DEF_LAYOUT,{dir:row?'row':'col',gap:+(g/W).toFixed(5),align});f.wMode='hug';f.hMode='hug';
    const pr=p?nodeOf(p).arot:0;
    sorted.forEach(e=>{const it=e.n.it;it.parent=f.id;it.rot=+(e.n.arot-pr).toFixed(2);const i=state.items.indexOf(it);state.items.splice(i,1);state.items.push(it);});
    // the hug frame's size is known now: its edges go where the items were
    setCenter(f,(X0+X1)/2,(Y0+Y1)/2);
  } else list.forEach(it=>reparent(it,f));
  renderItems();return f;
}
// the frame goes, its children stay where they are (in the frame's parent)
function unwrap(f){
  if(!isFrame(f))return [];
  const p=parentOf(state.items,f),kids=kidsOf(f);let at=siblingsOf(f).indexOf(f);
  kids.forEach(k=>{reparent(k,p,at);at++;});
  state.items=state.items.filter(x=>x!==f);renderItems();return kids;
}

export {byId,centerOn,keepPlace,setCenter,fixHeight,fixWidth,flowIndex,frameAt,frontOf,inFlow,isFrame,kidsOf,moveBy,newFrame,nodeOf,placeAmong,removeTree,reparent,rootOf,siblingsOf,toLocal,unwrap,wrap};
