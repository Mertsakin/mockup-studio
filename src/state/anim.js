/* Animation data (no three, no DOM): devices, 2D items (state.items), the camera (state.scene) and the lights
   (state.lights) animate the same way. A target animates through `o.tracks`: one track per value, tracks[prop] = keys
   [{t (s), v, ease}], where ease shapes the move from that key to the next. Values without a track keep the target's
   own field. The animatable values: a device's Dönüşüm set (position, rotation, scale), the laptop lid angle and the
   screenshot scroll; an item's place, size, rotation and opacity; the camera's angles, Yakınlık, lens and shift; a
   light's direction, height, distance, intensity, source size and beam.
   The artboard's timing is state.anim {dur (s, 1–30), fps, loop}. While a board has tracks, the targets' fields
   hold the values the editor shows (ui/animate.js writes them). o.designT is the target's design frame (default 0 s):
   what Tasarla, the still image and snapshots show; editing in Tasarla rewrites the keys at that time. */
const ANIM_PROPS=['px','py','pz','ry','rx','rz','scale','lidAngle','scroll'];
// the camera (state.scene): the view angles, Yakınlık, the lens (fov: the UI shows mm), the shift, and the depth of
// field's f-number and focus distance (cm; a focus pull is keys on it, render/lens.js)
const CAM_PROPS=['ry','rx','rz','zoom','fov','panX','panY','fnum','focusDist'];
// a light: direction and height (camera relative), distance, intensity, source size, spot beam
const LIGHT_PROPS=['az','el','dist','intensity','size','angle','penumbra'];
// 2D items: position (in the parent), width (a frame also height; fractions of the board width), rotation, opacity;
// a text item's size is its font size
const ITEM_PROPS=['x','y','w','h','size','rot','opacity'];
const MAX_DUR=30;
// what a target is: the camera has a lens, a light a direction, a device a type; the rest are 2D items
const kindOf=o=>o.fov!==undefined?'camera':o.az!==undefined?'light':o.type?'device':'item';
const isDevice=o=>kindOf(o)==='device';
function propsOf(o){
  switch(kindOf(o)){
    case 'camera':return CAM_PROPS;
    case 'light':return LIGHT_PROPS.filter(k=>(k!=='dist'&&k!=='size'||o.mod!=='sun')&&(k!=='angle'&&k!=='penumbra'||o.type==='spot'));
    case 'device':return ANIM_PROPS.filter(k=>(k!=='lidAngle'||o.type==='laptop')&&(k!=='scroll'||!o.video&&o.type!=='model'));  // a video screen does not scroll, a model has none
    default:return ITEM_PROPS.filter(k=>o.kind==='text'?k!=='w'&&k!=='h':o.kind==='frame'?k!=='size':k!=='size'&&k!=='h');
  }
}
// angles the editor wraps to ±180°: their keys are unwrapped when recorded, so a turn through 180° takes the short way
const WRAPS={camera:['ry','rz'],light:['az'],device:[],item:[]};
// a target's reference in the editor's selection / maps (device, item and light ids are separate counters)
const refOf=o=>{const k=kindOf(o);return k==='camera'?'cam':(k==='device'?'d':k==='light'?'l':'i')+o.id;};
const EASE={
  smooth:x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2,
  linear:x=>x,
  hold:x=>x<1?0:1,
  back:x=>{const c=1.70158,c3=c+1;return 1+c3*Math.pow(x-1,3)+c*Math.pow(x-1,2);},
  // ease-outs for text effects (GSAP power3.out, expo.out, elastic.out, bounce.out)
  out:x=>1-Math.pow(1-x,3),
  expo:x=>x>=1?1:1-Math.pow(2,-10*x),
  elastic:x=>x<=0?0:x>=1?1:Math.pow(2,-10*x)*Math.sin((x*10-.75)*(2*Math.PI)/3)+1,
  bounce:x=>{const n=7.5625,d=2.75;if(x<1/d)return n*x*x;if(x<2/d)return n*(x-=1.5/d)*x+.75;if(x<2.5/d)return n*(x-=2.25/d)*x+.9375;return n*(x-=2.625/d)*x+.984375;}
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

export {ANIM_PROPS,CAM_PROPS,EASE,ITEM_PROPS,LIGHT_PROPS,MAX_DUR,WRAPS,designT,isDevice,kindOf,refOf,halfFrame,hasAnim,interp,keyIn,propsOf,snapT,sortKeys,timesOf,tracked,valuesAt};
