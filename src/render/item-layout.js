import {fontEpoch,textBox} from './text.js';

/* Layout of the 2D items (state.items) as a tree, the Figma way: frames (kind 'frame') hold other items
   (child.parent = frame id) and may lay them out automatically (auto layout, a subset of flexbox).

   Units: lengths are stored as fractions of the BOARD WIDTH (so everything scales with the export size): w, h, the
   frame's gap and padding; a text's font size likewise (size). Positions x, y are the item's centre as fractions of
   its PARENT's width / height (the board for top-level items: what they always were). Rotation rot in degrees.
   Sizing per axis (wMode / hMode):
   - 'fixed': w (h) · board width; a text's fixed width is its wrap width (wrap, in font sizes)
   - 'pct':   wPct (hPct) · the parent's inner size
   - 'fill':  the room left in the parent's auto layout (main axis), or the parent's inner size
   - 'hug':   the content: a text's natural width, a frame's children plus padding
   Images keep their aspect (height follows the width); a text's height follows its lines.
   Frame: layout = {dir: 'none' | 'row' | 'col', gap, pad: [top, right, bottom, left], justify: 'start' | 'center' |
   'end' | 'between', align: 'start' | 'center' | 'end' | 'stretch'}, fill (colour or null), radius, clip.
   A child with abs: true keeps its own position inside an auto-layout frame.

   resolve(items, W, H) lays everything out on a W x H board (any scale: the live view, the export, thumbnails) and
   returns {nodes: Map id -> node, roots: [ids]}; node = {it, view (the item as drawn: a text gets its resolved wrap),
   x, y, w, h (top-left and size in the parent's own, unrotated space), rot, cx, cy, arot (centre and rotation on the
   board), kids: [ids]}. Cached until any input changes. */
const DEF_LAYOUT={dir:'none',gap:0,pad:[0,0,0,0],justify:'start',align:'start'};
const lay=it=>Object.assign({},DEF_LAYOUT,it.layout||{});
const isText=it=>it.kind==='text',isFrame=it=>it.kind==='frame';
const imgDims=img=>img?[img.naturalWidth||img.width||1,img.naturalHeight||img.height||1]:[1,1];
// the default sizing of older items: a text with a wrap width is fixed, without one it hugs
const wModeOf=it=>it.wMode||(isText(it)?(it.wrap?'fixed':'hug'):'fixed');
const hModeOf=it=>isFrame(it)?it.hMode||'fixed':'hug';
/* Anchoring (frames marked anc: 1, i.e. made since this rule): on an axis the frame hugs, its stored position is its
   start edge (left / top), not its centre, so it grows right / down when its content grows and the top edge stays put
   (Figma). anchorOff: from the stored point to the centre, in px (unrotated). Older frames keep centre positions. */
const anchorOff=(it,w,h)=>it.anc&&isFrame(it)?[wModeOf(it)==='hug'?w/2:0,hModeOf(it)==='hug'?h/2:0]:[0,0];

let cache={key:'',out:null};
// everything a node's view is drawn from: the geometry, and the text's drawing fields too (the view is a copy of the
// item, so a colour, fill, alignment, shadow or effect change must refresh it, or the live canvas and the export keep
// drawing the old one)
function signature(items,W,H){
  return W+'x'+H+'|'+fontEpoch()+'|'+JSON.stringify(items.map(it=>[it.id,it.parent,it.kind,it.x,it.y,it.w,it.h,it.wMode,it.hMode,it.wPct,it.hPct,it.rot,
    it.size,it.wrap,it.text,it.font,it.weight,it.italic,it.ls,it.lh,it.layout,it.abs,it.anc,it.img?imgDims(it.img).join():0,
    it.color,it.color2,it.fill,it.align,it.shadow,it.fx]));
}

function resolve(items,W,H){
  const key=signature(items,W,H);if(cache.key===key)return cache.out;
  const byId=new Map(items.map(it=>[it.id,it])),kids=new Map(),roots=[];
  items.forEach(it=>{const p=it.parent!=null&&byId.has(it.parent)&&isFrame(byId.get(it.parent))?it.parent:null;
    if(p==null)roots.push(it);else{if(!kids.has(p))kids.set(p,[]);kids.get(p).push(it);}});
  const childrenOf=it=>kids.get(it.id)||[];
  const nodes=new Map();

  // a text as drawn at width w (null: its natural width)
  const textView=(it,w)=>w==null?Object.assign({},it,{wrap:0}):Object.assign({},it,{wrap:+(w/((it.size||.06)*W)).toFixed(4)});
  // own size given the container's inner size (cw, ch) and any size the parent imposes (iw, ih)
  function size(it,c){
    let w=c.iw;
    if(w==null){
      const m=wModeOf(it);
      // % and fill need a parent size: in a parent that hugs this axis they act as hug (as in Figma)
      if(m==='pct'&&c.fillW!==false)w=(it.wPct??1)*c.cw;
      else if(m==='fill'&&c.fillW!==false)w=c.cw;
      else if(m==='hug'||m==='fill'||m==='pct'){
        if(isText(it))w=textBox(textView(it,null),W).w;
        else if(isFrame(it))w=frameContent(it,null,null).w;
        else w=(it.w||.3)*W;
      }
      else w=isText(it)?(it.wrap?it.wrap*(it.size||.06)*W:textBox(textView(it,null),W).w):(it.w||.3)*W;
    }
    let h=c.ih;
    if(h==null){
      // a text at (or wider than) its natural width keeps its lines; narrower, it wraps there
      if(isText(it)){const nat=textBox(textView(it,null),W);h=w>=nat.w-.5?nat.h:textBox(textView(it,w),W).h;}
      else if(!isFrame(it)){const [iw,ih]=imgDims(it.img);h=w*ih/iw;}
      else{const m=hModeOf(it);
        if(m==='pct'&&c.fillH!==false)h=(it.hPct??1)*c.ch;
        else if(m==='fill'&&c.fillH!==false)h=c.ch;
        else if(m==='hug'||m==='fill'||m==='pct')h=frameContent(it,w,null).h;
        else h=(it.h||.2)*W;}
    }
    return {w:Math.max(0,w),h:Math.max(0,h)};
  }
  // a frame's children: sizes and positions inside a frame of fw x fh (null: hug on that axis); returns the frame's
  // size and, with place, records every child
  function frameContent(it,fw,fh,place){
    const L=lay(it),[pt,pr,pb,pl]=(L.pad||[0,0,0,0]).map(v=>(v||0)*W),gap=(L.gap||0)*W,list=childrenOf(it);
    // children are sized as when the frame was measured: on an axis the frame hugs, without its (resulting) size
    const hugW=L.dir!=='none'&&wModeOf(it)==='hug',hugH=L.dir!=='none'&&hModeOf(it)==='hug';
    const inW=fw==null||hugW?null:Math.max(0,fw-pl-pr),inH=fh==null||hugH?null:Math.max(0,fh-pt-pb);
    const flow=L.dir==='none'?[]:list.filter(c=>!c.abs),free=list.filter(c=>!flow.includes(c));
    const row=L.dir==='row',main=row?'w':'h',cross=row?'h':'w';
    const fillMain=c=>(row?wModeOf(c):hModeOf(c))==='fill';
    // cross axis: stretch, fill or % of the frame's inner size; in a frame that hugs that axis, of the largest
    // other child (Figma's "fill container" in a hug frame)
    const crossMode=c=>row?hModeOf(c):wModeOf(c);
    const crossFill=c=>L.align==='stretch'||crossMode(c)==='fill'||crossMode(c)==='pct';
    const crossPct=c=>crossMode(c)==='pct'?(row?c.hPct:c.wPct)??1:1;
    const inMain=row?inW:inH,inCross=row?inH:inW;
    const ctx=(c,crossSize)=>{const o={cw:inW??0,ch:inH??0};if(inW==null)o.fillW=false;if(inH==null)o.fillH=false;
      if(crossSize!=null)o[row?'ih':'iw']=crossSize;else if(crossFill(c)&&inCross!=null)o[row?'ih':'iw']=inCross*crossPct(c);
      if(inMain==null&&fillMain(c))o[row?'fillW':'fillH']=false;return o;};
    const sz=new Map();
    // pass 1: everything but the main-axis fills (and the cross fills of a hug frame, measured as hug for now)
    flow.forEach(c=>{if(!fillMain(c)||inMain==null)sz.set(c,size(c,ctx(c)));});
    let crossRef=null;
    if(inCross==null){const fixedCross=flow.filter(c=>sz.has(c)&&!crossFill(c));
      crossRef=(fixedCross.length?fixedCross:flow.filter(c=>sz.has(c))).reduce((t,c)=>Math.max(t,sz.get(c)[cross]),0);
      flow.forEach(c=>{if(sz.has(c)&&crossFill(c))sz.set(c,size(c,ctx(c,crossRef*crossPct(c))));});}
    // pass 2: the main-axis fills share what is left
    const gaps=Math.max(0,flow.length-1)*gap,used=[...sz.values()].reduce((t,q)=>t+q[main],0)+gaps;
    const fills=flow.filter(c=>!sz.has(c)),share=fills.length?Math.max(0,(inMain-used)/fills.length):0;
    fills.forEach(c=>sz.set(c,size(c,Object.assign(ctx(c,crossFill(c)&&inCross==null?crossRef*crossPct(c):null),row?{iw:share}:{ih:share}))));
    const sumMain=flow.reduce((t,c)=>t+sz.get(c)[main],0),maxCross=flow.reduce((t,c)=>Math.max(t,sz.get(c)[cross]),0);
    // a hug frame: its content plus padding (a frame without auto layout keeps its own size)
    let w=fw,h=fh;
    if(w==null)w=L.dir==='none'?(it.w||.3)*W:(row?sumMain+gaps:maxCross)+pl+pr;
    if(h==null)h=L.dir==='none'?(it.h||.2)*W:(row?maxCross:sumMain+gaps)+pt+pb;
    if(!place)return {w,h};
    // pass 3 (placing): main-axis start and spacing from justify, cross position from align
    const iw=Math.max(0,w-pl-pr),ih=Math.max(0,h-pt-pb),M=row?iw:ih,C=row?ih:iw;
    let at=0,step=gap;
    if(L.justify==='center')at=(M-sumMain-gaps)/2;else if(L.justify==='end')at=M-sumMain-gaps;
    else if(L.justify==='between'&&flow.length>1){step=(M-sumMain)/(flow.length-1);}
    flow.forEach(c=>{
      const s=sz.get(c),cs=s[cross],off=L.align==='center'?(C-cs)/2:L.align==='end'?C-cs:0;
      const x=row?pl+at:pl+off,y=row?pt+off:pt+at;at+=s[main]+step;
      place(c,x,y,s.w,s.h);
    });
    // free children: their own centre within the frame (fractions of its size)
    free.forEach(c=>{const s=size(c,{cw:w,ch:h}),[ox,oy]=anchorOff(c,s.w,s.h);place(c,(c.x??.5)*w-s.w/2+ox,(c.y??.5)*h-s.h/2+oy,s.w,s.h);});
    return {w,h};
  }
  // records a node and lays out its own children (frames) once its size is final
  function placeIn(parentNode){
    return (it,x,y,w,h)=>{
      const n={it,parent:parentNode?parentNode.it.id:null,x,y,w,h,rot:it.rot||0,kids:childrenOf(it).map(c=>c.id),
        // a text at its natural width does not wrap (rounding would break its last word); any other width wraps there
        view:isText(it)?(Math.abs(w-textBox(textView(it,null),W).w)<.5?textView(it,null):textView(it,w)):it};
      // centre and rotation on the board
      const lx=x+w/2,ly=y+h/2;
      if(parentNode){const a=parentNode.arot*Math.PI/180,dx=lx-parentNode.w/2,dy=ly-parentNode.h/2;
        n.cx=parentNode.cx+dx*Math.cos(a)-dy*Math.sin(a);n.cy=parentNode.cy+dx*Math.sin(a)+dy*Math.cos(a);n.arot=parentNode.arot+n.rot;}
      else{n.cx=lx;n.cy=ly;n.arot=n.rot;}
      nodes.set(it.id,n);
      if(isFrame(it))frameContent(it,w,h,placeIn(n));
    };
  }
  const top=placeIn(null);
  roots.forEach(it=>{const s=size(it,{cw:W,ch:H}),[ox,oy]=anchorOff(it,s.w,s.h);top(it,(it.x??.5)*W-s.w/2+ox,(it.y??.5)*H-s.h/2+oy,s.w,s.h);});
  const out={nodes,roots:roots.map(it=>it.id)};
  cache={key,out};return out;
}

// the item's rectangle on a W x H board: centre, size, rotation (what selection boxes, snapping and picking use)
function rectOf(items,it,W,H){const n=resolve(items,W,H).nodes.get(it.id);return n?{cx:n.cx,cy:n.cy,w:n.w,h:n.h,rot:n.arot}:{cx:0,cy:0,w:0,h:0,rot:0};}
// the parent frame of an item (or null), and whether that frame places it (auto layout)
const parentOf=(items,it)=>it.parent!=null?items.find(x=>x.id===it.parent&&isFrame(x))||null:null;
const inFlow=(items,it)=>{const p=parentOf(items,it);return !!p&&lay(p).dir!=='none'&&!it.abs;};
// the item and everything inside it
function subtree(items,it){const out=[it];for(let i=0;i<out.length;i++)items.forEach(x=>{if(x.parent===out[i].id&&isFrame(out[i]))out.push(x);});return out;}

export {DEF_LAYOUT,anchorOff,hModeOf,inFlow,lay,parentOf,rectOf,resolve,subtree,wModeOf};
