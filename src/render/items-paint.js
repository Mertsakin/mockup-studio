import {resolve} from './item-layout.js';
import {drawTextAt} from './text-fx.js';
import {state} from '../state/state.js';
import {roundRect} from '../util.js';

/* The artboard's 2D items (images, text, frames with their children) painted onto a 2D context of the board's size
   W x H, the ones behind the devices (front false) or in front of them. t: the time for text effects (null: the
   text as laid out). Shared by the export and thumbnails (ui/layout.js) and the embed player. */
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

export {paintItems};
