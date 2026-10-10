/* Device animation data (no three, no DOM).
   A device animates through `d.tracks`: one track per value, tracks[prop] = keys [{t (s), v, ease}], where ease
   shapes the move from that key to the next. Values without a track keep the device's own field. The animatable
   values are the Dönüşüm set (position, rotation, scale), the laptop lid angle and the screenshot scroll.
   The artboard's timing is state.anim {dur (s, 1–30), fps, loop}. While a board has tracks, the devices' fields
   hold the values the editor shows (ui/animate.js writes them). d.designT is the device's design frame (default 0 s):
   what Tasarla, the still image and snapshots show; editing in Tasarla rewrites the keys at that time. */
const ANIM_PROPS=['px','py','pz','ry','rx','rz','scale','lidAngle','scroll'];
const MAX_DUR=30;
const propsOf=d=>ANIM_PROPS.filter(k=>k!=='lidAngle'||d.type==='laptop');
const EASE={
  smooth:x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2,
  linear:x=>x,
  hold:x=>x<1?0:1,
  back:x=>{const c=1.70158,c3=c+1;return 1+c3*Math.pow(x-1,3)+c*Math.pow(x-1,2);}
};
const sortKeys=tr=>tr.sort((a,b)=>a.t-b.t);
function interp(tr,t){
  const n=tr.length;if(!n)return undefined;
  if(t<=tr[0].t)return tr[0].v;if(t>=tr[n-1].t)return tr[n-1].v;
  let i=0;while(tr[i+1].t<t)i++;
  const a=tr[i],b=tr[i+1],f=EASE[a.ease]||EASE.smooth;
  return a.v+(b.v-a.v)*f((t-a.t)/(b.t-a.t));
}
const tracked=d=>d.tracks?Object.keys(d.tracks).filter(k=>d.tracks[k]&&d.tracks[k].length):[];
const hasAnim=d=>tracked(d).length>0;
// values of the device's animated props at time t (only those with a track)
function valuesAt(d,t){const o={};tracked(d).forEach(k=>{o[k]=interp(d.tracks[k],t);});return o;}
// summary times of a device: every time some value has a key
const timesOf=d=>[...new Set(tracked(d).flatMap(k=>d.tracks[k].map(x=>+x.t.toFixed(4))))].sort((a,b)=>a-b);
const halfFrame=fps=>.5/(fps||30);
const designT=d=>d.designT||0;
const keyIn=(tr,t,fps)=>tr?tr.find(k=>Math.abs(k.t-t)<halfFrame(fps)):undefined;
const snapT=(t,fps)=>Math.round(t*(fps||30))/(fps||30);

export {ANIM_PROPS,EASE,MAX_DUR,designT,halfFrame,hasAnim,interp,keyIn,propsOf,snapT,sortKeys,timesOf,tracked,valuesAt};
