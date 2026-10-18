import {typeName} from '../state/constants.js';
import {FX} from '../render/text-fx.js';
import {modOf} from '../lights/mods.js';
import {selLight} from '../lights/runtime.js';
import {fmtM,mmFromFov} from '../render/lens.js';
import {designT,halfFrame,hasAnim,isDevice,keyIn,kindOf,propsOf,refOf,timesOf,tracked} from '../state/anim.js';
import {sel,selItem,state} from '../state/state.js';
import {A,CAM_PRESETS,ITEM_PRESETS,LIGHT_ANIM,PRESETS,addPoseKey,anyAnim,applyPreset,byRef,deleteSelected,entriesAt,hasFx,isSelected,keyProp,keysAt,moveSelected,onAnim,play,presetsFor,seek,segKeys,selectAllKeys,selectKey,selectKeys,selectSeg,selectedKeys,setDesignFrame,setDuration,setEase,setMode,stop,targets,toggleKeyAt} from './animate.js';
import {sizeOf} from './boards.js';
import {duration,fmtDur,hasVideo} from '../devices/video.js';
import {icon} from './icons.js';
import {renderItems} from './layout.js';
import {selectItem} from './items.js';
import {onSyncUI,syncAll,syncUI} from './sync.js';
import {toast} from './toast.js';
import {setUi,ui} from './ui-state.js';
import {$,$$} from '../util.js';

/* Canlandır mode UI: the timeline under the stage (rows = the camera, the devices, the 2D items, the lights, with
   summary diamonds; unfolded = one sub-row per animated value; a text item's effects are bars on its row, dragged to
   move them), the mode switch, the animation parts of the inspectors (key panel, ◆ buttons beside the value fields,
   presets) and the keys (Space plays, K keys a pose, ← / → frame, Shift a second, Home, Delete). The selected target
   follows the inspector: the item, the light, the camera (artboard panel) or the selected device.
   Keys (A.sel, animate.js): click selects a diamond's keys, Shift / ⌘ + click adds or removes them, dragging on a
   lane's empty part draws a marquee (across rows too), ⌘A takes the current target's keys; dragging any selected
   diamond moves the whole selection together, snapping to frames and, within 6 px, to whole seconds, other keys and
   the playhead (⌘ off); ⌥ ← / → nudge a frame; Delete removes them all. A press outside the timeline and the
   inspector drops the selection.
   Adding keys from the timeline: every row's name cell has a key navigator ◀ ◆ ▶ (previous key, key / un-key at
   the playhead, next key; shown on hover, on the selected row and while a key is at the playhead), a double-click
   on a lane keys that row at the clicked time, ↑ / ↓ jump to the previous / next key of the current target.
   Editing: a card above the selection (drawCard): the time (typed: seconds, or frames as "36k"; Enter moves the
   selection there), the ease to the next key (mixed when they differ; off when every selected key is the last of its
   value), the design frame (one time, one target) and Sil. Clicking the bar between two keys selects that transition
   (A.seg) and the card shows its ease; a wide bar draws the ease's curve. The inspector has no key section.
   View: ⌘ / Ctrl + wheel (and a pinch) zooms the time axis around the pointer, 1× (the whole duration) to 20×; a
   horizontal wheel pans while zoomed; − / + / ⤢ in the bar and ⇧1 (while the last press was in the timeline) fit.
   The ruler's labels thin out as the axis shrinks and frame ticks appear when a frame is wide enough; while playing
   or seeking the playhead is kept in view (the view pages forward). Zoom and scroll are editor state here. */
const tl=$('#timeline'),names=$('#tlNames'),lanes=$('#tlLanes');
const LABEL={px:'Yatay',py:'Dikey',pz:'Derinlik',ry:'Dönüş',rx:'Eğim',rz:'Yatış',scale:'Ölçek',lidAngle:'Kapak açısı',scroll:'Kaydırma',
  x:'Yatay',y:'Dikey',w:'Genişlik',h:'Yükseklik',size:'Boyut',rot:'Döndürme',opacity:'Opaklık',
  zoom:'Yakınlık',fov:'Objektif',panX:'Yatay kayma',panY:'Dikey kayma',fnum:'Diyafram',focusDist:'Odak uzaklığı',
  az:'Yön',el:'Yükseklik',dist:'Uzaklık',intensity:'Yoğunluk',angle:'Huzme açısı',penumbra:'Huzme kenarı'};
// the value field of each animatable value, per target kind (the ◆ attaches to its label)
const SLIDER={
  device:{px:'s-d-px',py:'s-d-py',pz:'s-d-pz',ry:'s-d-ry',rx:'s-d-rx',rz:'s-d-rz',scale:'s-d-scale',lidAngle:'s-d-lid',scroll:'s-d-scroll'},
  item:{x:'nf-x',y:'nf-y',w:'nf-w',h:'nf-h',size:'nf-fs',rot:'nf-r',opacity:'nf-op'},
  camera:{ry:'s-g-ry',rx:'s-g-rx',rz:'s-g-rz',zoom:'s-g-zoom',fov:'s-g-mm',panX:'s-g-panX',panY:'s-g-panY',fnum:'s-g-fnum',focusDist:'s-g-focus'},
  light:{intensity:'s-l-int',az:'s-l-az',el:'s-l-el',dist:'s-l-dist',size:'s-l-size',angle:'s-l-angle',penumbra:'s-l-pen'}};
const POSE_BTN={device:'#poseKey',item:'#itemPoseKey',camera:'#camPoseKey',light:'#lightPoseKey'};
const EASES=[['smooth','Yumuşak','M2 20 C 14 20, 22 2, 34 2'],['linear','Doğrusal','M2 20 L 34 2'],['hold','Ani','M2 20 L 30 20 L 30 2 L 34 2'],['back','Geri tepme','M2 20 C 12 20, 18 -6, 34 2']];
const DEV_ICON={phone:'smartphone',tablet:'tablet',laptop:'laptop',monitor:'monitor',browser:'window-frame',page:'display',custom:'gallery-wide'};
const fmtT=t=>t.toFixed(2).replace('.',',');
const deg=v=>Math.round(v)+'°',pct=v=>Math.round(v*100)+'%';
function fmtV(o,k,v){
  switch(kindOf(o)){
    case 'camera':return k==='zoom'?v.toFixed(2)+'×':k==='fov'?Math.round(mmFromFov(v))+' mm':k==='fnum'?'f/'+(+v.toFixed(1)):k==='focusDist'?fmtM(v):/^pan/.test(k)?pct(v):deg(v);
    case 'light':return k==='intensity'?v.toFixed(2):k==='dist'?v.toFixed(2)+'×':k==='size'||k==='penumbra'?pct(v):deg(v);
    default:return /^(scroll|x|y|opacity)$/.test(k)?pct(v):/^(size|w|h)$/.test(k)?Math.round(v*sizeOf(state)[0])+' px':k==='scale'?v.toFixed(2)+'×':/^r|lid/.test(k)?deg(v):v.toFixed(1);
  }
}
// names like the layer tree's: the base name, numbered when it repeats
function labels(list,base){const n={},seen={};list.forEach(x=>{const b=base(x);n[b]=(n[b]||0)+1;});
  return list.map(x=>{const b=base(x);seen[b]=(seen[b]||0)+1;return n[b]>1?b+' '+seen[b]:b;});}
const devNames=()=>labels(state.devices,typeName);
const lightNames=()=>labels(state.lights,L=>L.mod==='custom'?'Işık':modOf(L.mod).n);
function nameOf(o){
  switch(kindOf(o)){case 'camera':return 'Kamera';case 'light':return lightNames()[state.lights.indexOf(o)];case 'device':return devNames()[state.devices.indexOf(o)];default:return o.name;}
}
const fps=()=>state.anim.fps||30;
const open=new Set();  // target refs whose value rows are unfolded
// the target the inspector shows: the item, the light, the camera (artboard panel), else the selected device
const cur=()=>ui.kind==='item'?selItem():ui.kind==='light'?selLight():ui.kind==='board'?state.scene:sel();
const itemIcon=it=>it.kind==='text'?'text-square':it.kind==='frame'?'hashtag':'gallery';
const iconOf=o=>{switch(kindOf(o)){case 'camera':return 'camera';case 'light':return 'lamp';case 'device':return DEV_ICON[o.type]||'smartphone';default:return itemIcon(o);}};

/* ---------- geometry */
const W=()=>Math.max(40,lanes.clientWidth-44);
// the time axis: zoom 1 shows the whole duration in W; scroll is the hidden part on the left, in px
const view={zoom:1,scroll:0},ZOOM_MAX=20;
let dragging=false;  // a pointer drag in the timeline (the view does not page meanwhile)
const pps=()=>W()/state.anim.dur*view.zoom;  // px per second
const maxScroll=()=>Math.max(0,state.anim.dur*pps()-W());
const xOf=t=>12+t*pps()-view.scroll,tOf=x=>Math.max(0,Math.min(state.anim.dur,(x-12+view.scroll)/pps()));
// zooms so the time under x (px in the lanes) stays put
function setZoom(z,x){
  const cx=x===undefined?12+W()/2:x,t=tOf(cx);view.zoom=Math.max(1,Math.min(ZOOM_MAX,z));
  view.scroll=Math.max(0,Math.min(maxScroll(),t*pps()+12-cx));draw(true);
}
function setScroll(s){const v=Math.max(0,Math.min(maxScroll(),s));if(v!==view.scroll){view.scroll=v;draw(true);}}
// the ruler's label step: the widest that keeps labels ~110 px apart; frames when a frame is wide enough
function tickStep(){const p=pps();for(const s of [5/fps(),.25,.5,1,2,5,10])if(s*p>=110)return s;return 10;}
const fmtTick=s=>(Number.isInteger(s)?String(s):fmtT(s))+' sn';

/* ---------- drawing: the structure is rebuilt only when it changes; the playhead moves every frame */
let sig='';
function structure(){
  return JSON.stringify([state.anim.dur,ui.kind,state.selected,state.selItem,state.selLight,A.sel,A.seg,[...open],devNames(),lightNames(),state.items.map(it=>[it.name,it.fx||0]),
    targets().map(o=>[refOf(o),designT(o),o.tracks?tracked(o).map(k=>[k,o.tracks[k].map(x=>[x.t,x.ease])]):0])]);
}
function rows(){const r=[];
  targets().forEach(o=>{const name=nameOf(o);
    r.push({d:o,name,prop:null});
    // a text item's effects get their own row under it (always shown)
    if(kindOf(o)==='item'&&hasFx(o)&&(o.fx.in||o.fx.out))r.push({d:o,name,prop:FXROW});
    if(open.has(refOf(o)))tracked(o).forEach(k=>r.push({d:o,name,prop:k}));});return r;}
const FXROW='@fx';
const isSel=o=>{switch(kindOf(o)){case 'camera':return ui.kind==='board';case 'light':return ui.kind==='light'&&o.id===state.selLight;
  case 'device':return ui.kind==='device'&&o.id===state.selected;default:return ui.kind==='item'&&o.id===state.selItem;}};
function build(){
  const R=rows(),dur=state.anim.dur;
  names.innerHTML='<div class="ruler-pad"></div>';lanes.innerHTML='';
  // ruler
  const ruler=document.createElement('div');ruler.className='ruler';
  view.scroll=Math.min(view.scroll,maxScroll());
  const step=tickStep(),vis=t=>{const x=xOf(t);return x>-40&&x<lanes.clientWidth+40;};let h='';
  for(let s=0;s<=dur+1e-6;s+=step)if(vis(s))h+='<div class="tick" style="left:'+xOf(s)+'px"><span>'+fmtTick(+s.toFixed(4))+'</span></div>';
  for(let s=step/2;s<dur;s+=step)if(vis(s))h+='<div class="tick minor" style="left:'+xOf(s)+'px"></div>';
  if(pps()/fps()>=7)for(let f=1;f<dur*fps();f++){const t=f/fps();if(vis(t)&&Math.abs(t/(step/2)-Math.round(t/(step/2)))>1e-6)h+='<div class="tick frame" style="left:'+xOf(t)+'px"></div>';}
  ruler.innerHTML=h;lanes.appendChild(ruler);ruler.addEventListener('pointerdown',scrub);
  $('#tlZoom').textContent=(+view.zoom.toFixed(1))+'×';$('#tlZoomOut').disabled=view.zoom<=1;$('#tlZoomIn').disabled=view.zoom>=ZOOM_MAX;$('#tlFit').disabled=view.zoom<=1;
  R.forEach(({d,name,prop})=>{
    const ref=refOf(d);
    // name cell
    const n=document.createElement('div');n.className='tl-name'+(prop?' subrow':'');n.dataset.ref=ref;
    if(prop===FXROW){n.innerHTML='<span class="nm">Metin efekti</span>';}
    else if(prop){n.innerHTML='<span class="nm"></span>'+NAV+'<span class="sub"></span>';n.firstChild.textContent=LABEL[prop];n.dataset.prop=prop;}
    else{
      const anim=hasAnim(d),fx=kindOf(d)==='item'&&hasFx(d),ic=iconOf(d);n.setAttribute('aria-selected',String(isSel(d)));
      n.innerHTML='<button type="button" class="caret" aria-label="Değerleri göster" aria-expanded="'+open.has(ref)+'"'+(anim?'':' disabled')+'>'+icon(open.has(ref)?'alt-arrow-down':'alt-arrow-right',12)+'</button>'+icon(ic,14)+'<span class="nm"></span>'+NAV+'<span class="sub">'+(fx?'efekt':'')+'</span>';
      n.querySelector('.nm').textContent=name;if(anim)n.title=tracked(d).length+' animasyonlu değer';
      n.querySelector('.caret').addEventListener('click',e=>{e.stopPropagation();open.has(ref)?open.delete(ref):open.add(ref);draw(true);});
    }
    if(prop!==FXROW){
      const p=prop||null,times=()=>p?d.tracks[p]?d.tracks[p].map(k=>k.t):[]:timesOf(d),hf=halfFrame(fps());
      n.querySelector('.pv').addEventListener('click',e=>{e.stopPropagation();const t=times().filter(x=>x<A.t-hf).pop();if(t!==undefined){stop();seek(t);}});
      n.querySelector('.nx').addEventListener('click',e=>{e.stopPropagation();const t=times().find(x=>x>A.t+hf);if(t!==undefined){stop();seek(t);}});
      n.querySelector('.kd').addEventListener('click',e=>{e.stopPropagation();stop();pickTarget(d,true);toggleKeyAt(d,p);});
      syncNav(n);
    }
    n.addEventListener('click',()=>pickTarget(d));
    names.appendChild(n);
    // lane
    const lane=document.createElement('div');lane.className='lane'+(prop?' subl':'')+(!prop&&isSel(d)?' sel':'');if(prop===FXROW)lane.dataset.fx='1';
    const ts=prop===FXROW?[]:prop?d.tracks[prop].map(k=>k.t):timesOf(d);
    let lh='';
    // the bars between keys: click selects the transition (its ease is the left key's); wide ones draw the ease
    for(let j=0;j<ts.length-1;j++){
      const es=new Set(keysAt(d,ts[j],prop===FXROW?null:prop).map(k=>k.ease)),e1=es.size===1?EASES.find(x=>x[0]===[...es][0]):null,w=xOf(ts[j+1])-xOf(ts[j]);
      const on=A.seg&&A.seg.ref===ref&&A.seg.prop===(prop||null)&&Math.abs(A.seg.t0-ts[j])<halfFrame(fps());
      lh+='<div class="seg-bar'+(on?' on':'')+'" data-t0="'+ts[j]+'" data-t1="'+ts[j+1]+'" style="left:'+xOf(ts[j])+'px;width:'+w+'px" title="Geçiş: '+(e1?e1[1]:'karışık')+' · '+fmtT(ts[j])+' → '+fmtT(ts[j+1])+' sn (tıkla: türünü seç)">'+(w>40&&e1?EASE_SVG(e1[2]):'')+'</div>';
    }
    // the design frame (what Tasarla and the still image show) on the device's summary row
    if(!prop&&hasAnim(d))lh+='<span class="dmark" style="left:'+xOf(designT(d))+'px" title="Tasarım karesi ('+fmtT(designT(d))+' sn): Tasarla bu anı gösterir, oradaki değişiklikler bu kareye yazılır"></span>';
    lane.innerHTML=lh;
    // a text item's effects: bars from start to end (drag: move in time)
    if(prop===FXROW)['in','out'].forEach(ph=>{const f=d.fx[ph];if(!f||!FX[f.type])return;
      const b=document.createElement('div');b.className='fx-bar '+ph;b.style.left=xOf(f.t)+'px';b.style.width=Math.max(6,xOf(f.t+f.dur)-xOf(f.t))+'px';
      b.textContent=FX[f.type].n;b.title=(ph==='in'?'Giriş':'Çıkış')+' efekti: '+FX[f.type].n+' · '+fmtT(f.t)+'–'+fmtT(f.t+f.dur)+' sn (sürükle: zamanı değiştir)';
      b.addEventListener('pointerdown',e=>dragFx(e,d,ph));lane.appendChild(b);});
    lane.dataset.ref=ref;if(prop&&prop!==FXROW)lane.dataset.prop=prop;
    ts.forEach(t=>{
      // a summary diamond where only some values have a key is half filled
      const part=!prop&&keysAt(d,t,null).length<tracked(d).length;
      const b=document.createElement('button');b.type='button';b.className='kf'+(diamondOn(d,t,prop)?' on':'')+(prop?' small':'')+(part?' part':'');b.style.left=xOf(t)+'px';
      b.dataset.t=t;b.dataset.prop=prop||'';
      b.setAttribute('aria-label',(prop?LABEL[prop]+', ':'')+'anahtar kare, '+fmtT(t)+' sn');b.title=fmtT(t)+' sn'+(part?' · '+keysAt(d,t,null).map(k=>LABEL[tracked(d).find(p=>d.tracks[p].includes(k))]).join(', '):'');
      b.addEventListener('pointerdown',e=>dragKey(e,d,t,prop));
      lane.appendChild(b);
    });
    lane.addEventListener('pointerdown',e=>{if(e.target!==lane&&!e.target.classList.contains('seg-bar'))return;marquee(e,d,prop);});
    lanes.appendChild(lane);
  });
  const end=document.createElement('div');end.className='end';end.style.left=xOf(dur)+'px';end.innerHTML='<span>'+String(dur).replace('.',',')+' sn</span>';
  const vids=state.devices.filter(hasVideo).map(d=>duration(d.video)).filter(Boolean);
  end.title='Süreyi değiştirmek için sürükle (en fazla 30 sn)'+(vids.length?'. Ekran videosu: '+vids.map(fmtDur).join(', '):'');end.addEventListener('pointerdown',dragEnd);lanes.appendChild(end);
  const ph=document.createElement('div');ph.className='ph';ph.id='tlPh';lanes.appendChild(ph);
  $('#tlEmpty').hidden=anyAnim()||state.devices.some(hasVideo);
  drawCard();
}
/* ---------- the edit card above the selected keys, or the selected transition */
const EASE_SVG=path=>'<svg viewBox="0 0 36 22" aria-hidden="true"><path d="'+path+'"/></svg>';
const parseT=s=>{const m=/^(-?\d*[.,]?\d+)\s*(k|kare)?$/i.exec(String(s).trim());if(!m)return NaN;const v=+m[1].replace(',','.');return m[2]?v/fps():v;};
function drawCard(){
  const old=lanes.querySelector('.kpop');if(old)old.remove();
  const ks=selectedKeys(),seg=A.seg;if(!ks.length&&!seg)return;
  let a,b,keys,title,hit,single=null,last=false;
  if(seg){const o=byRef(seg.ref);if(!o)return;keys=segKeys();a=seg.t0;b=seg.t1;title='Geçiş';
    hit=[...lanes.querySelectorAll('.lane')].filter(l=>l.dataset.ref===seg.ref&&!l.dataset.fx&&(l.dataset.prop||null)===seg.prop);}
  else{keys=ks.map(x=>x.key);const ts=keys.map(k=>k.t);a=Math.min(...ts);b=Math.max(...ts);const owners=new Set(ks.map(x=>x.o));
    title=ks.length===1?LABEL[ks[0].prop]:owners.size===1?ks.length+' anahtar kare':ks.length+' anahtar kare · '+owners.size+' katman';
    if(owners.size===1&&b-a<halfFrame(fps()))single=ks[0].o;
    hit=[...lanes.querySelectorAll('.lane')].filter(l=>!l.dataset.fx&&ks.some(x=>refOf(x.o)===l.dataset.ref&&(!l.dataset.prop||l.dataset.prop===x.prop)));
    last=ks.every(({o,prop,key})=>o.tracks[prop][o.tracks[prop].length-1]===key);}  // nothing follows: no transition to shape
  if(!hit.length)return;
  const es=new Set(keys.map(k=>k.ease)),isDesign=!!single&&Math.abs(designT(single)-a)<halfFrame(fps());
  const p=document.createElement('div');p.className='kpop';p.setAttribute('role','group');p.setAttribute('aria-label',title);
  p.innerHTML='<b></b>'+(seg?'<span class="tf">'+fmtT(a)+' → '+fmtT(b)+' sn</span>':'<label class="tf"><input id="kpT" value="'+fmtT(a)+'" aria-label="Zaman (sn ya da kare: 36k)" spellcheck="false"><span>sn</span></label>')+
    '<span class="eases" role="group" aria-label="Geçiş türü">'+EASES.map(([k,n,path])=>'<button type="button" data-ease="'+k+'" aria-pressed="'+(es.size>1?'mixed':es.has(k))+'"'+(last?' disabled':'')+'>'+EASE_SVG(path)+'<span class="tip">'+n+(seg?'':last?' · son kare: sonrası sabit kalır':' (sonraki kareye geçiş)')+'</span></button>').join('')+'</span>'+
    (seg?'':'<button type="button" class="ib sm" id="kpDesign" aria-pressed="'+isDesign+'"'+(single?'':' disabled')+'>'+icon('target',14)+'<span class="tip">'+(isDesign?'Tasarım karesi: Tasarla ve durağan görsel bu anı gösterir':single?'Tasarım karesi yap':'Tasarım karesi: tek bir an seçiliyken')+'</span></button>'+
      '<button type="button" class="ib sm del" id="kpDel" aria-label="Sil">'+icon('trash-bin-minimalistic',14)+'<span class="tip">Sil <kbd>⌫</kbd></span></button>');
  p.firstChild.textContent=title;
  lanes.appendChild(p);
  // above the topmost row of the selection, centred on its span; when the ruler is in the way, right under that row
  // (not under the whole selection: the body scrolls, and a card outside it cannot be clicked)
  const first=hit.reduce((m,l)=>l.offsetTop<m.offsetTop?l:m),top=first.offsetTop;
  const cx=(xOf(a)+xOf(b))/2,left=Math.max(4,Math.min(lanes.clientWidth-p.offsetWidth-4,cx-p.offsetWidth/2));
  let y=top-p.offsetHeight-8;if(y<26){y=top+first.offsetHeight+8;p.classList.add('below');}
  p.style.left=left+'px';p.style.top=y+'px';p.style.setProperty('--ax',Math.max(10,Math.min(p.offsetWidth-10,cx-left))+'px');
  p.querySelectorAll('[data-ease]').forEach(x=>x.addEventListener('click',()=>setEase(x.dataset.ease)));
  const tf=p.querySelector('#kpT');
  // Enter and the change on blur both end here; the first wins (the rebuild removes the field, which blurs it)
  if(tf){let done=false;const go=()=>{if(done)return;done=true;const t=parseT(tf.value);if(!Number.isFinite(t)||!moveSelected(t-a))draw(true);};
    tf.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();go();}else if(e.key==='Escape'){e.preventDefault();draw(true);}});
    tf.addEventListener('change',go);}
  const dz=p.querySelector('#kpDesign');if(dz)dz.addEventListener('click',()=>setDesignFrame());
  const dl=p.querySelector('#kpDel');if(dl)dl.addEventListener('click',()=>deleteSelected());
  p.addEventListener('pointerdown',e=>e.stopPropagation());
}
let headT=-1;  // the playhead's time at the last draw: the view pages only when the playhead moved (not on a pan or zoom)
function moveHead(){
  // zoomed in: when the playhead moves out of the view, the view pages so it sits near the left edge
  if(view.zoom>1&&!dragging&&A.t!==headT){const x=xOf(A.t);if(x<12||x>12+W()){view.scroll=Math.max(0,Math.min(maxScroll(),A.t*pps()-W()*.1));build();}}
  headT=A.t;
  const ph=$('#tlPh');if(ph)ph.style.left=xOf(A.t)+'px';
  $('#tlTime').innerHTML=fmtT(A.t)+' <span>/ '+fmtT(state.anim.dur)+' sn</span>';
  names.querySelectorAll('.subrow[data-prop]').forEach(n=>{const d=byRef(n.dataset.ref);if(d)n.querySelector('.sub').textContent=fmtV(d,n.dataset.prop,d[n.dataset.prop]);});
  names.querySelectorAll('.tl-name').forEach(n=>{if(n.querySelector('.knav'))syncNav(n);});
}
// the key navigator of a row: ◀ ▶ enabled while there is a key before / after the playhead; ◆ filled while the row has
// a key at the playhead (half: a summary row where only some values have one), outlined while the row animates
const NAV='<span class="knav"><button type="button" class="pv" aria-label="Önceki anahtar kare">'+icon('alt-arrow-left',10)+'<span class="tip">Önceki anahtar kare <kbd>↑</kbd></span></button>'+
  '<button type="button" class="kd" aria-label="Bu anda anahtar kare"><i></i><span class="tip"></span></button>'+
  '<button type="button" class="nx" aria-label="Sonraki anahtar kare">'+icon('alt-arrow-right',10)+'<span class="tip">Sonraki anahtar kare <kbd>↓</kbd></span></button></span>';
function syncNav(n){
  const d=byRef(n.dataset.ref);if(!d)return;const prop=n.dataset.prop||null,t=Math.round(A.t*fps())/fps(),hf=halfFrame(fps());
  const times=prop?d.tracks[prop]?d.tracks[prop].map(k=>k.t):[]:timesOf(d),ks=keysAt(d,t,prop);
  const at=ks.length>0,part=!prop&&at&&ks.length<tracked(d).length;
  const kd=n.querySelector('.kd');kd.classList.toggle('at',at);kd.classList.toggle('part',part);kd.classList.toggle('anim',!at&&times.length>0);
  kd.querySelector('.tip').innerHTML=prop?(at?'Bu andaki anahtar kareyi kaldır':'Bu anda '+LABEL[prop].toLowerCase()+' için anahtar kare')
    :part?'Bu anda eksik değerlere de anahtar kare (poz) <kbd>K</kbd>':at?'Bu andaki anahtar kareleri kaldır':'Bu anda tüm değerlere anahtar kare (poz) <kbd>K</kbd>';
  n.querySelector('.pv').disabled=!times.some(x=>x<t-hf);n.querySelector('.nx').disabled=!times.some(x=>x>t+hf);
  n.classList.toggle('has',at);
}
function draw(force){
  if(tl.hidden)return;
  const s=structure();if(force||s!==sig){sig=s;build();}
  moveHead();
  $('#tlPlay').innerHTML=icon(A.playing?'pause':'play')+'<span class="tip">'+(A.playing?'Durdur':'Oynat')+' <kbd>Boşluk</kbd></span>';
  $('#tlPlay').setAttribute('aria-label',A.playing?'Durdur':'Oynat');
  $('#tlLoop').setAttribute('aria-pressed',String(!!state.anim.loop));
  $('#tlFps').textContent=fps()+' fps';
}
new ResizeObserver(()=>draw(true)).observe(lanes);

/* ---------- interaction */
// every key a diamond stands for is selected
const diamondOn=(d,t,prop)=>{const es=entriesAt(d,t,prop);return es.length>0&&es.every(e=>isSelected(e.ref,e.t,e.prop));};
function pickTarget(o,keepKey){
  switch(kindOf(o)){
    case 'camera':setUi({kind:'board'});break;
    case 'light':if(state.selLight!==o.id){state.selLight=o.id;syncAll();}setUi({kind:'light'});break;
    case 'device':if(state.selected!==o.id){state.selected=o.id;syncAll();}setUi({kind:'device'});break;
    default:selectItem(o.id);
  }
  if(!keepKey)selectKey(null);else draw();
}
function loop(e,move,up){
  const mv=ev=>move(ev),u=ev=>{dragging=false;removeEventListener('pointermove',mv);removeEventListener('pointerup',u);removeEventListener('pointercancel',u);if(up)up(ev);};
  dragging=true;addEventListener('pointermove',mv);addEventListener('pointerup',u);addEventListener('pointercancel',u);move(e);
}
// the playhead snaps to keys and whole seconds within 6 px, otherwise to frames
function scrub(e){
  if(e.button!==0)return;e.preventDefault();stop();const r=lanes.getBoundingClientRect();
  loop(e,ev=>{const t=tOf(ev.clientX-r.left),cands=targets().flatMap(timesOf).concat([...Array(Math.floor(state.anim.dur)+1).keys()]);
    const near=cands.find(k=>Math.abs(xOf(k)-xOf(t))<6);seek(near!==undefined?near:Math.round(t*fps())/fps());});
}
// ↑ / ↓: the previous / next key of the current target (of any target when it has none)
function jumpKey(dir){
  const o=cur(),own=o?timesOf(o):[],ts=own.length?own:[...new Set(targets().flatMap(timesOf))].sort((a,b)=>a-b),hf=halfFrame(fps());
  const t=dir>0?ts.find(x=>x>A.t+hf):ts.filter(x=>x<A.t-hf).pop();if(t!==undefined)seek(t);
}
// a dragged key: within 6 px it snaps to whole seconds, keys outside the selection and the playhead's start (⌘ off);
// otherwise to frames. A dashed guide shows the snap.
function snapNear(t,ev,ph){
  if(!(ev.metaKey||ev.ctrlKey)){
    const cands=targets().flatMap(o=>tracked(o).flatMap(k=>o.tracks[k].filter(x=>!isSelected(refOf(o),x.t,k)).map(x=>x.t)))
      .concat([...Array(Math.floor(state.anim.dur)+1).keys()],[ph]);
    const near=cands.find(c=>Math.abs(xOf(c)-xOf(t))<6);if(near!==undefined){guide(near);return near;}
  }
  guide(null);return Math.round(t*fps())/fps();
}
function guide(t){let g=lanes.querySelector('.snapg');if(t==null){if(g)g.remove();return;}if(!g){g=document.createElement('div');g.className='snapg';lanes.appendChild(g);}g.style.left=xOf(t)+'px';}
// a press on a diamond: selects its keys (Shift / ⌘: adds them, or removes them when they were selected), then a
// drag moves every selected key together; the playhead follows the dragged one
function dragKey(e,d,t0,prop){
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();stop();ui.tlFocus=true;
  pickTarget(d,true);
  const ref=refOf(d),add=e.shiftKey||e.metaKey||e.ctrlKey,was=diamondOn(d,t0,prop);
  if(add){selectKey(ref,t0,prop,'toggle');if(was)return;}
  else if(!was)selectKey(ref,t0,prop);
  const x0=e.clientX,ph=A.t;let moved=false,cur=t0;
  loop(e,ev=>{if(!moved&&Math.abs(ev.clientX-x0)<4)return;moved=true;
    const want=snapNear(t0+(ev.clientX-x0)/pps(),ev,ph);
    cur+=moveSelected(want-cur);seek(cur);},
    // a plain click on an already selected diamond (no drag): the selection shrinks to it
    ()=>{guide(null);if(!moved){seek(t0);if(!add&&was)selectKey(ref,t0,prop);}});
}
// a press on a lane's empty part: a drag draws a marquee and selects the keys inside it (Shift / ⌘ keeps the
// selection), across rows too; a click selects the row's target and moves the playhead there; a second click within
// 400 ms at the same spot (a double-click; the browser's own never fires, the lane is rebuilt after the first click)
// keys the row at that time
let lastClick={at:0,x:0,y:0};
function marquee(e,d,prop){
  if(e.button!==0)return;e.preventDefault();stop();ui.tlFocus=true;
  const bar=e.target.classList.contains('seg-bar')?e.target:null;
  const r=lanes.getBoundingClientRect(),x0=e.clientX-r.left,y0=e.clientY-r.top;
  const keep=e.shiftKey||e.metaKey||e.ctrlKey,base=keep?A.sel.slice():[];let box=null,moved=false;
  loop(e,ev=>{const x=ev.clientX-r.left,y=ev.clientY-r.top;if(!moved&&Math.hypot(x-x0,y-y0)<4)return;moved=true;
    if(!box){box=document.createElement('div');box.className='marq';lanes.appendChild(box);}
    const L=Math.min(x,x0),T=Math.min(y,y0),R=Math.max(x,x0),B=Math.max(y,y0);
    Object.assign(box.style,{left:L+'px',top:T+'px',width:(R-L)+'px',height:(B-T)+'px'});
    const list=base.slice();
    lanes.querySelectorAll('.lane').forEach(l=>{const lt=l.offsetTop,lb=lt+l.offsetHeight;if(lb<T||lt>B||l.dataset.fx)return;const o=byRef(l.dataset.ref);if(!o)return;
      (l.dataset.prop?[l.dataset.prop]:tracked(o)).forEach(k=>o.tracks[k].forEach(key=>{const kx=xOf(key.t);
        if(kx>=L&&kx<=R&&!list.some(s=>s.ref===l.dataset.ref&&s.prop===k&&Math.abs(s.t-key.t)<halfFrame(fps())))list.push({ref:l.dataset.ref,prop:k,t:key.t});}));});
    // live feedback without a rebuild (the rebuild would drop the box): the diamonds' state only
    A.sel=list;
    lanes.querySelectorAll('.kf').forEach(b=>{const o=byRef(b.parentNode.dataset.ref);b.classList.toggle('on',!!o&&diamondOn(o,+b.dataset.t,b.dataset.prop||null));});},
    ()=>{if(box)box.remove();
      if(moved){selectKeys(A.sel);return;}
      const now=performance.now(),dbl=now-lastClick.at<400&&Math.hypot(x0-lastClick.x,y0-lastClick.y)<5;lastClick={at:dbl?0:now,x:x0,y:y0};
      if(dbl&&prop!==FXROW){pickTarget(d,true);seek(Math.round(tOf(x0)*fps())/fps());toggleKeyAt(d,prop||null);return;}
      if(bar){pickTarget(d,true);selectSeg(refOf(d),prop===FXROW?null:prop,+bar.dataset.t0,+bar.dataset.t1);return;}
      pickTarget(d);seek(Math.round(tOf(x0)*fps())/fps());});
}
// an effect bar: moves the effect in time (snapped to frames, kept within the duration)
function dragFx(e,it,ph){
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();stop();pickTarget(it);
  const f=it.fx[ph],t0=f.t,x0=e.clientX;
  loop(e,ev=>{const t=t0+(ev.clientX-x0)/pps();f.t=Math.max(0,Math.min(state.anim.dur-f.dur,Math.round(t*fps())/fps()));
    renderItems();syncAll();draw();});
}
function dragEnd(e){
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();const d0=state.anim.dur,x0=e.clientX,p=pps();
  loop(e,ev=>{setDuration(Math.round((d0+(ev.clientX-x0)/p)*2)/2);draw(true);});
}
// view: the bar's buttons, ⌘ + wheel zoom around the pointer, horizontal wheel pan (vertical stays the rows' scroll)
$('#tlZoomIn').addEventListener('click',()=>setZoom(view.zoom*1.5));
$('#tlZoomOut').addEventListener('click',()=>setZoom(view.zoom/1.5));
$('#tlFit').addEventListener('click',()=>setZoom(1));
$('#tlBody').addEventListener('wheel',e=>{
  if(e.metaKey||e.ctrlKey){e.preventDefault();const r=lanes.getBoundingClientRect();setZoom(view.zoom*Math.exp(-e.deltaY*.01),e.clientX-r.left);}
  else if(view.zoom>1&&Math.abs(e.deltaX)>Math.abs(e.deltaY)){e.preventDefault();setScroll(view.scroll+e.deltaX);}
},{passive:false});
$('#tlStart').addEventListener('click',()=>{stop();seek(0);});
$('#tlPlay').addEventListener('click',play);
$('#tlLoop').addEventListener('click',()=>{state.anim.loop=!state.anim.loop;draw();});
// timeline height (kept per browser)
const TL_KEY='mockup-studio-timeline';
try{const h=+localStorage.getItem(TL_KEY);if(h)tl.style.height=h+'px';}catch(e){/* private mode */}
$('#tlResize').addEventListener('pointerdown',e=>{e.preventDefault();const h0=tl.offsetHeight,y0=e.clientY;
  loop(e,ev=>{tl.style.height=Math.max(120,Math.min(480,h0-(ev.clientY-y0)))+'px';},()=>{try{localStorage.setItem(TL_KEY,String(tl.offsetHeight));}catch(e){/* ignore */}});});
// any press elsewhere stops playback (editing while it runs would fight it); the timeline's keys (⌘A, Esc) apply
// while the last press was in it (ui.tlFocus, read by selection.js too); a press outside it and the inspector drops
// the key selection (like the canvas)
document.addEventListener('pointerdown',e=>{if(A.playing&&!e.target.closest('#tlPlay,#tlLoop'))stop();
  ui.tlFocus=!!e.target.closest('#timeline');
  if(!ui.tlFocus&&(A.sel.length||A.seg)&&!e.target.closest('#inspector,.menu'))selectKey(null);},true);

/* ---------- presets: menu on the timeline, chips in the inspector */
const menu=document.createElement('div');menu.className='menu';menu.setAttribute('role','menu');menu.hidden=true;menu.style.position='fixed';document.body.appendChild(menu);
function runPreset(id){
  const d=cur();if(!d)return;if(ui.mode!=='animate')setMode('animate');
  const p=presetsFor(d).find(x=>x.id===id),over=applyPreset(id,d);open.add(refOf(d));
  toast(p.n+' eklendi'+(over.length?': '+over.map(k=>LABEL[k].toLowerCase()).join(', ')+' hareketinin üzerine yazıldı':''));
}
const presetOk=(p,d)=>!!d&&(!p.ok||p.ok(d));
$('#tlPresetBtn').addEventListener('click',e=>{
  e.stopPropagation();if(!menu.hidden){menu.hidden=true;return;}
  const d=cur(),nm=d?nameOf(d):'';menu.innerHTML='';
  presetsFor(d).filter(p=>!d||!p.ok||p.ok(d)).forEach(p=>{const b=document.createElement('button');b.type='button';b.className='mi';b.setAttribute('role','menuitem');b.disabled=!presetOk(p,d);
    b.innerHTML='<span></span><kbd></kbd>';b.firstChild.textContent=p.n+' · '+nm;b.lastChild.textContent=p.hint;b.addEventListener('click',()=>{menu.hidden=true;runPreset(p.id);});menu.appendChild(b);});
  menu.hidden=false;const r=e.currentTarget.getBoundingClientRect();
  menu.style.left=Math.min(r.left,innerWidth-menu.offsetWidth-8)+'px';menu.style.top=(r.top-menu.offsetHeight-6)+'px';
  const f=menu.querySelector('.mi:not(:disabled)');if(f)f.focus();
});
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target))menu.hidden=true;});
const chips=$('#presetChips'),itemChips=$('#itemPresetChips');
[[chips,PRESETS],[itemChips,ITEM_PRESETS],[$('#camPresetChips'),CAM_PRESETS],[$('#lightPresetChips'),LIGHT_ANIM]].forEach(([el,list])=>list.forEach(p=>{const b=document.createElement('button');b.type='button';b.dataset.preset=p.id;b.textContent=p.n;b.title=p.hint;b.addEventListener('click',()=>runPreset(p.id));el.appendChild(b);}));

/* ---------- inspector: ◆ beside the sliders, pose key */
$('#poseKey').addEventListener('click',()=>addPoseKey(sel()));
$('#itemPoseKey').addEventListener('click',()=>addPoseKey(selItem()));
$('#camPoseKey').addEventListener('click',()=>addPoseKey(state.scene));
$('#lightPoseKey').addEventListener('click',()=>addPoseKey(selLight()));
const dots=[];  // {kind, prop, el}
function ensureDots(){
  for(const kind in SLIDER)for(const k in SLIDER[kind]){
    if(dots.some(x=>x.kind===kind&&x.prop===k&&x.el.isConnected))continue;
    const lab=document.querySelector('label[for="'+SLIDER[kind][k]+'"]');if(!lab)continue;
    const b=document.createElement('button');b.type='button';b.className='kdot anim-only';b.dataset.prop=k;b.setAttribute('aria-label',LABEL[k]+': bu anda anahtar kare');
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const o=cur();if(o&&kindOf(o)===kind)keyProp(o,k);});
    // after the value (a value field) or before the label (anything else)
    if(lab.parentNode.classList.contains('nf'))lab.parentNode.appendChild(b);else lab.prepend(b);
    dots.push({kind,prop:k,el:b});
  }
}
// lid angle and scroll live in other sections; in Canlandır they move next to the transform sliders
const moved=[['lidSlot'],['scrollSlot'],['posterSlot']].map(([id])=>{const el=$('#'+id),mark=document.createComment(id);el.parentNode.insertBefore(mark,el);return {el,mark};});
function placeSlots(animate){moved.forEach(({el,mark})=>{if(animate){if(el.parentNode!==$('#animSlots'))$('#animSlots').appendChild(el);}else if(el.previousSibling!==mark)mark.parentNode.insertBefore(el,mark.nextSibling);});}
$('#devSliders').closest('.sec').classList.add('anim-keep');
$('#presetChips').closest('.sec').classList.add('anim-keep');
function syncInspector(){
  ensureDots();
  const d=cur(),animate=ui.mode==='animate',kind=d?kindOf(d):null;
  $('#animNote').hidden=!(d&&isDevice(d)&&!animate&&hasAnim(d));
  if(!d)return;
  $('#animNoteT').textContent=fmtT(designT(d));
  const t=Math.round(A.t*fps())/fps();
  dots.forEach(({kind:dk,prop:k,el})=>{
    if(dk!==kind){el.hidden=true;return;}
    const tr=d.tracks&&d.tracks[k],at=animate&&!!keyIn(tr,t,fps()),an=!!tr&&tr.length>1&&tr.some(x=>Math.abs(x.v-tr[0].v)>1e-9);
    el.classList.toggle('at',at);el.classList.toggle('anim',an&&!at);el.hidden=!propsOf(d).includes(k);});
  const pose=keysAt(d,t,null);$(POSE_BTN[kind]).classList.toggle('at',animate&&pose.length>0&&pose.length>=propsOf(d).length);
  // a move this device type cannot make (lid on a phone) is left out, not greyed out
  if(isDevice(d))chips.querySelectorAll('button').forEach(b=>{b.hidden=!presetOk(PRESETS.find(p=>p.id===b.dataset.preset),d);});
}

/* ---------- mode */
let animSig='';
function syncMode(){
  const animate=ui.mode==='animate';
  $$('#modeSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===ui.mode)));
  if(tl.hidden===animate){tl.hidden=!animate;placeSlots(animate);sig='';}
  $('#exportMenuBtn').textContent=animate?'Video dışa aktar':'Dışa aktar';
}
$$('#modeSeg button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
onAnim(()=>{
  syncMode();draw();syncInspector();
  // the layer tree marks animated devices: refresh it when that changes (not every frame)
  const s=targets().map(d=>hasAnim(d)?1:0).join();if(s!==animSig&&!A.playing){animSig=s;syncUI();}
});

onSyncUI(()=>{syncInspector();draw();});
syncMode();

/* ---------- keys (capture: before the workspace's Space = hand and the shell's Delete = remove device) */
addEventListener('keydown',e=>{
  if(ui.mode!=='animate'||!$('#videoScrim').hidden)return;
  const t=e.target;if(t&&(/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)&&t.type!=='range'||t.isContentEditable))return;
  const stopIt=()=>{e.preventDefault();e.stopImmediatePropagation();},mod=e.metaKey||e.ctrlKey,arrow=e.key==='ArrowLeft'||e.key==='ArrowRight';
  // the selection's keys: ⌘A (while the last press was in the timeline), ⌥ ← / → nudge, Esc
  if(mod&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='a'&&ui.tlFocus){stopIt();selectAllKeys(cur());return;}
  if(e.altKey&&!mod&&arrow&&A.sel.length){stopIt();stop();moveSelected((e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:1/fps()));return;}
  if(e.key==='Escape'&&(A.sel.length||A.seg)&&ui.tlFocus){stopIt();selectKey(null);return;}
  if(e.shiftKey&&e.code==='Digit1'&&!mod&&!e.altKey&&ui.tlFocus){stopIt();setZoom(1);return;}
  if(mod||e.altKey)return;
  if(e.code==='Space'){stopIt();if(!e.repeat)play();}
  else if(e.key==='Home'){stopIt();stop();seek(0);}
  else if(e.key.toLowerCase()==='k'&&!e.repeat){stopIt();addPoseKey(cur());}
  else if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&ui.kind!=='item'&&ui.kind!=='multi'&&!(t&&t.type==='range')){stopIt();stop();seek(A.t+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:1/fps()));}
  else if((e.key==='ArrowUp'||e.key==='ArrowDown')&&ui.kind!=='item'&&ui.kind!=='multi'&&!(t&&(t.type==='range'||t.id==='domeSvg'))){stopIt();stop();jumpKey(e.key==='ArrowDown'?1:-1);}
  else if((e.key==='Delete'||e.key==='Backspace')&&A.sel.length){stopIt();deleteSelected();}
},true);

export {devNames};
