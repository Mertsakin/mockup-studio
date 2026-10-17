import {TYPES} from '../state/constants.js';
import {FX} from '../render/text-fx.js';
import {modOf} from '../lights/mods.js';
import {selLight} from '../lights/runtime.js';
import {mmFromFov} from '../render/lens.js';
import {designT,halfFrame,hasAnim,isDevice,keyIn,kindOf,propsOf,refOf,timesOf,tracked} from '../state/anim.js';
import {sel,selItem,state} from '../state/state.js';
import {A,CAM_PRESETS,ITEM_PRESETS,LIGHT_ANIM,PRESETS,addPoseKey,anyAnim,applyPreset,byRef,deleteSelected,hasFx,keyProp,keysAt,moveSelected,onAnim,play,presetsFor,seek,selectKey,selectedKeys,setDesignFrame,setDuration,setEase,setMode,stop,targets} from './animate.js';
import {sizeOf} from './boards.js';
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
   follows the inspector: the item, the light, the camera (artboard panel) or the selected device. */
const tl=$('#timeline'),names=$('#tlNames'),lanes=$('#tlLanes');
const LABEL={px:'Yatay',py:'Dikey',pz:'Derinlik',ry:'Dönüş',rx:'Eğim',rz:'Yatış',scale:'Ölçek',lidAngle:'Kapak açısı',scroll:'Kaydırma',
  x:'Yatay',y:'Dikey',w:'Genişlik',h:'Yükseklik',size:'Boyut',rot:'Döndürme',opacity:'Opaklık',
  zoom:'Yakınlık',fov:'Objektif',panX:'Yatay kayma',panY:'Dikey kayma',
  az:'Yön',el:'Yükseklik',dist:'Uzaklık',intensity:'Yoğunluk',angle:'Huzme açısı',penumbra:'Huzme kenarı'};
// the value field of each animatable value, per target kind (the ◆ attaches to its label)
const SLIDER={
  device:{px:'s-d-px',py:'s-d-py',pz:'s-d-pz',ry:'s-d-ry',rx:'s-d-rx',rz:'s-d-rz',scale:'s-d-scale',lidAngle:'s-d-lid',scroll:'s-d-scroll'},
  item:{x:'nf-x',y:'nf-y',w:'nf-w',h:'nf-h',size:'nf-fs',rot:'nf-r',opacity:'nf-op'},
  camera:{ry:'s-g-ry',rx:'s-g-rx',rz:'s-g-rz',zoom:'s-g-zoom',fov:'s-g-mm',panX:'s-g-panX',panY:'s-g-panY'},
  light:{intensity:'s-l-int',az:'s-l-az',el:'s-l-el',dist:'s-l-dist',size:'s-l-size',angle:'s-l-angle',penumbra:'s-l-pen'}};
const POSE_BTN={device:'#poseKey',item:'#itemPoseKey',camera:'#camPoseKey',light:'#lightPoseKey'};
const EASES=[['smooth','Yumuşak','M2 20 C 14 20, 22 2, 34 2'],['linear','Doğrusal','M2 20 L 34 2'],['hold','Ani','M2 20 L 30 20 L 30 2 L 34 2'],['back','Geri tepme','M2 20 C 12 20, 18 -6, 34 2']];
const DEV_ICON={phone:'smartphone',tablet:'tablet',laptop:'laptop',monitor:'monitor',browser:'window-frame',page:'display',custom:'gallery-wide'};
const fmtT=t=>t.toFixed(2).replace('.',',');
const deg=v=>Math.round(v)+'°',pct=v=>Math.round(v*100)+'%';
function fmtV(o,k,v){
  switch(kindOf(o)){
    case 'camera':return k==='zoom'?v.toFixed(2)+'×':k==='fov'?Math.round(mmFromFov(v))+' mm':/^pan/.test(k)?pct(v):deg(v);
    case 'light':return k==='intensity'?v.toFixed(2):k==='dist'?v.toFixed(2)+'×':k==='size'||k==='penumbra'?pct(v):deg(v);
    default:return /^(scroll|x|y|opacity)$/.test(k)?pct(v):/^(size|w|h)$/.test(k)?Math.round(v*sizeOf(state)[0])+' px':k==='scale'?v.toFixed(2)+'×':/^r|lid/.test(k)?deg(v):v.toFixed(1);
  }
}
// names like the layer tree's: the base name, numbered when it repeats
function labels(list,base){const n={},seen={};list.forEach(x=>{const b=base(x);n[b]=(n[b]||0)+1;});
  return list.map(x=>{const b=base(x);seen[b]=(seen[b]||0)+1;return n[b]>1?b+' '+seen[b]:b;});}
const devNames=()=>labels(state.devices,d=>TYPES[d.type]||'Cihaz');
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
const xOf=t=>12+t/state.anim.dur*W(),tOf=x=>Math.max(0,Math.min(state.anim.dur,(x-12)/W()*state.anim.dur));

/* ---------- drawing: the structure is rebuilt only when it changes; the playhead moves every frame */
let sig='';
function structure(){
  return JSON.stringify([state.anim.dur,ui.kind,state.selected,state.selItem,state.selLight,A.sel,[...open],devNames(),lightNames(),state.items.map(it=>[it.name,it.fx||0]),
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
  const step=dur>15?2:1;let h='';
  for(let s=0;s<=dur+1e-6;s+=step)h+='<div class="tick" style="left:'+xOf(s)+'px"><span>'+s+' sn</span></div>';
  for(let s=step/2;s<dur;s+=step)h+='<div class="tick minor" style="left:'+xOf(s)+'px"></div>';
  ruler.innerHTML=h;lanes.appendChild(ruler);ruler.addEventListener('pointerdown',scrub);
  R.forEach(({d,name,prop})=>{
    const ref=refOf(d);
    // name cell
    const n=document.createElement('div');n.className='tl-name'+(prop?' subrow':'');n.dataset.ref=ref;
    if(prop===FXROW){n.innerHTML='<span class="nm">Metin efekti</span>';}
    else if(prop){n.innerHTML='<span class="nm"></span><span class="sub"></span>';n.firstChild.textContent=LABEL[prop];n.dataset.prop=prop;}
    else{
      const anim=hasAnim(d),fx=kindOf(d)==='item'&&hasFx(d),ic=iconOf(d);n.setAttribute('aria-selected',String(isSel(d)));
      n.innerHTML='<button type="button" class="caret" aria-label="Değerleri göster" aria-expanded="'+open.has(ref)+'"'+(anim?'':' disabled')+'>'+icon(open.has(ref)?'alt-arrow-down':'alt-arrow-right',12)+'</button>'+icon(ic,14)+'<span class="nm"></span><span class="sub">'+(anim?tracked(d).length+' değer':fx?'efekt':'')+'</span>';
      n.querySelector('.nm').textContent=name;
      n.querySelector('.caret').addEventListener('click',e=>{e.stopPropagation();open.has(ref)?open.delete(ref):open.add(ref);draw(true);});
    }
    n.addEventListener('click',()=>pickTarget(d));
    names.appendChild(n);
    // lane
    const lane=document.createElement('div');lane.className='lane'+(prop?' subl':'')+(!prop&&isSel(d)?' sel':'');
    const ts=prop===FXROW?[]:prop?d.tracks[prop].map(k=>k.t):timesOf(d);
    let lh='';
    for(let j=0;j<ts.length-1;j++)lh+='<div class="seg-bar" style="left:'+xOf(ts[j])+'px;width:'+(xOf(ts[j+1])-xOf(ts[j]))+'px"></div>';
    // the design frame (what Tasarla and the still image show) on the device's summary row
    if(!prop&&hasAnim(d))lh+='<span class="dmark" style="left:'+xOf(designT(d))+'px" title="Tasarım karesi ('+fmtT(designT(d))+' sn): Tasarla bu anı gösterir, oradaki değişiklikler bu kareye yazılır"></span>';
    lane.innerHTML=lh;
    // a text item's effects: bars from start to end (drag: move in time)
    if(prop===FXROW)['in','out'].forEach(ph=>{const f=d.fx[ph];if(!f||!FX[f.type])return;
      const b=document.createElement('div');b.className='fx-bar '+ph;b.style.left=xOf(f.t)+'px';b.style.width=Math.max(6,xOf(f.t+f.dur)-xOf(f.t))+'px';
      b.textContent=FX[f.type].n;b.title=(ph==='in'?'Giriş':'Çıkış')+' efekti: '+FX[f.type].n+' · '+fmtT(f.t)+'–'+fmtT(f.t+f.dur)+' sn (sürükle: zamanı değiştir)';
      b.addEventListener('pointerdown',e=>dragFx(e,d,ph));lane.appendChild(b);});
    ts.forEach(t=>{
      const s=A.sel,on=s&&s.ref===ref&&Math.abs(s.t-t)<halfFrame(fps())&&(s.prop===prop||(!s.prop&&!!prop));
      const b=document.createElement('button');b.type='button';b.className='kf'+(on?' on':'')+(prop?' small':'');b.style.left=xOf(t)+'px';
      b.setAttribute('aria-label',(prop?LABEL[prop]+', ':'')+'anahtar kare, '+fmtT(t)+' sn');b.title=fmtT(t)+' sn';
      b.addEventListener('pointerdown',e=>dragKey(e,d,t,prop));
      lane.appendChild(b);
    });
    lane.addEventListener('pointerdown',e=>{if(e.target!==lane&&!e.target.classList.contains('seg-bar'))return;pickTarget(d,true);scrub(e);});
    lanes.appendChild(lane);
  });
  const end=document.createElement('div');end.className='end';end.style.left=xOf(dur)+'px';end.innerHTML='<span>'+String(dur).replace('.',',')+' sn</span>';
  end.title='Süreyi değiştirmek için sürükle (en fazla 30 sn)';end.addEventListener('pointerdown',dragEnd);lanes.appendChild(end);
  const ph=document.createElement('div');ph.className='ph';ph.id='tlPh';lanes.appendChild(ph);
  $('#tlEmpty').hidden=anyAnim();
}
function moveHead(){
  const ph=$('#tlPh');if(ph)ph.style.left=xOf(A.t)+'px';
  $('#tlTime').innerHTML=fmtT(A.t)+' <span>/ '+fmtT(state.anim.dur)+' sn</span>';
  names.querySelectorAll('.subrow[data-prop]').forEach(n=>{const d=byRef(n.dataset.ref);if(d)n.querySelector('.sub').textContent=fmtV(d,n.dataset.prop,d[n.dataset.prop]);});
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
  const mv=ev=>move(ev),u=ev=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',u);removeEventListener('pointercancel',u);if(up)up(ev);};
  addEventListener('pointermove',mv);addEventListener('pointerup',u);addEventListener('pointercancel',u);move(e);
}
// the playhead snaps to keys and whole seconds within 6 px, otherwise to frames
function scrub(e){
  if(e.button!==0)return;e.preventDefault();stop();const r=lanes.getBoundingClientRect();
  loop(e,ev=>{const t=tOf(ev.clientX-r.left),cands=targets().flatMap(timesOf).concat([...Array(Math.floor(state.anim.dur)+1).keys()]);
    const near=cands.find(k=>Math.abs(xOf(k)-xOf(t))<6);seek(near!==undefined?near:Math.round(t*fps())/fps());});
}
// a summary diamond moves every value's key at that time; a sub-row diamond only that value's key
function dragKey(e,d,t0,prop){
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();stop();
  pickTarget(d,true);
  selectKey(refOf(d),t0,prop);const x0=e.clientX;let moved=false;
  loop(e,ev=>{if(!moved&&Math.abs(ev.clientX-x0)<4)return;moved=true;moveSelected(t0+(ev.clientX-x0)/W()*state.anim.dur);seek(A.sel?A.sel.t:A.t);},
    ()=>{if(!moved)seek(t0);});
}
// an effect bar: moves the effect in time (snapped to frames, kept within the duration)
function dragFx(e,it,ph){
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();stop();pickTarget(it);
  const f=it.fx[ph],t0=f.t,x0=e.clientX;
  loop(e,ev=>{const t=t0+(ev.clientX-x0)/W()*state.anim.dur;f.t=Math.max(0,Math.min(state.anim.dur-f.dur,Math.round(t*fps())/fps()));
    renderItems();syncAll();draw();});
}
function dragEnd(e){
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();const d0=state.anim.dur,x0=e.clientX,w=W();
  loop(e,ev=>{setDuration(Math.round((d0+(ev.clientX-x0)/w*d0)*2)/2);draw(true);});
}
$('#tlStart').addEventListener('click',()=>{stop();seek(0);});
$('#tlPlay').addEventListener('click',play);
$('#tlLoop').addEventListener('click',()=>{state.anim.loop=!state.anim.loop;draw();});
// timeline height (kept per browser)
const TL_KEY='mockup-studio-timeline';
try{const h=+localStorage.getItem(TL_KEY);if(h)tl.style.height=h+'px';}catch(e){/* private mode */}
$('#tlResize').addEventListener('pointerdown',e=>{e.preventDefault();const h0=tl.offsetHeight,y0=e.clientY;
  loop(e,ev=>{tl.style.height=Math.max(120,Math.min(480,h0-(ev.clientY-y0)))+'px';},()=>{try{localStorage.setItem(TL_KEY,String(tl.offsetHeight));}catch(e){/* ignore */}});});
// any press elsewhere stops playback (editing while it runs would fight it)
document.addEventListener('pointerdown',e=>{if(A.playing&&!e.target.closest('#tlPlay,#tlLoop'))stop();},true);

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
  presetsFor(d).forEach(p=>{const b=document.createElement('button');b.type='button';b.className='mi';b.setAttribute('role','menuitem');b.disabled=!presetOk(p,d);
    b.innerHTML='<span></span><kbd></kbd>';b.firstChild.textContent=p.n+' · '+nm;b.lastChild.textContent=p.hint;b.addEventListener('click',()=>{menu.hidden=true;runPreset(p.id);});menu.appendChild(b);});
  menu.hidden=false;const r=e.currentTarget.getBoundingClientRect();
  menu.style.left=Math.min(r.left,innerWidth-menu.offsetWidth-8)+'px';menu.style.top=(r.top-menu.offsetHeight-6)+'px';
  const f=menu.querySelector('.mi:not(:disabled)');if(f)f.focus();
});
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target))menu.hidden=true;});
const chips=$('#presetChips'),itemChips=$('#itemPresetChips');
[[chips,PRESETS],[itemChips,ITEM_PRESETS],[$('#camPresetChips'),CAM_PRESETS],[$('#lightPresetChips'),LIGHT_ANIM]].forEach(([el,list])=>list.forEach(p=>{const b=document.createElement('button');b.type='button';b.dataset.preset=p.id;b.textContent=p.n;b.title=p.hint;b.addEventListener('click',()=>runPreset(p.id));el.appendChild(b);}));

/* ---------- inspector: key panel, ◆ beside the sliders, pose key */
const easeGrid=$('#easeGrid');
EASES.forEach(([k,n,path])=>{const b=document.createElement('button');b.type='button';b.className='ease';b.dataset.ease=k;
  b.innerHTML='<svg viewBox="0 0 36 22" aria-hidden="true"><path d="'+path+'"/></svg><span></span>';b.lastChild.textContent=n;b.addEventListener('click',()=>setEase(k));easeGrid.appendChild(b);});
$('#keyDelete').addEventListener('click',()=>deleteSelected());
$('#keyDesign').addEventListener('click',()=>setDesignFrame());
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
    lab.prepend(b);dots.push({kind,prop:k,el:b});
  }
}
// lid angle and scroll live in other sections; in Canlandır they move next to the transform sliders
const moved=[['lidSlot'],['scrollSlot']].map(([id])=>{const el=$('#'+id),mark=document.createComment(id);el.parentNode.insertBefore(mark,el);return {el,mark};});
function placeSlots(animate){moved.forEach(({el,mark})=>{if(animate){if(el.parentNode!==$('#animSlots'))$('#animSlots').appendChild(el);}else if(el.previousSibling!==mark)mark.parentNode.insertBefore(el,mark.nextSibling);});}
$('#devSliders').closest('.sec').classList.add('anim-keep');
$('#keySec').classList.add('anim-keep');$('#presetChips').closest('.sec').classList.add('anim-keep');
// the key panel follows the inspector: under the header of the panel that shows the target
const keySec=$('#keySec'),keyMark=document.createComment('keySec');keySec.parentNode.insertBefore(keyMark,keySec);
const KEY_HOME={item:'#inspItem>.head',camera:'#inspBoard>.head',light:'#inspLight>.head'};
function placeKeySec(kind){
  const h=KEY_HOME[kind]&&$(KEY_HOME[kind]);
  if(h){if(keySec.previousSibling!==h)h.after(keySec);}
  else if(keySec.previousSibling!==keyMark)keyMark.after(keySec);
}
function syncInspector(){
  ensureDots();
  const d=cur(),animate=ui.mode==='animate',kind=d?kindOf(d):null;placeKeySec(kind);
  $('#animNote').hidden=!(d&&isDevice(d)&&!animate&&hasAnim(d));
  if(!d)return;
  $('#animNoteT').textContent=fmtT(designT(d));
  const t=Math.round(A.t*fps())/fps();
  dots.forEach(({kind:dk,prop:k,el})=>{
    if(dk!==kind){el.hidden=true;return;}
    const tr=d.tracks&&d.tracks[k],at=animate&&!!keyIn(tr,t,fps()),an=!!tr&&tr.length>1&&tr.some(x=>Math.abs(x.v-tr[0].v)>1e-9);
    el.classList.toggle('at',at);el.classList.toggle('anim',an&&!at);el.hidden=!propsOf(d).includes(k);});
  const pose=keysAt(d,t,null);$(POSE_BTN[kind]).classList.toggle('at',animate&&pose.length>0&&pose.length>=propsOf(d).length);
  // key panel: the selected key of this target
  const ks=animate&&A.sel&&A.sel.ref===refOf(d)?selectedKeys():[];
  $('#keySec').hidden=!ks.length;
  if(ks.length){
    const p=A.sel.prop;$('#keyTitle').textContent='Anahtar kare · '+fmtT(A.sel.t)+' sn';
    $('#keyWhat').textContent=p?LABEL[p]:ks.length+' değer (özet kare: birlikte taşınır ve silinir)';
    const last=(p?[p]:tracked(d)).every(k=>{const tr=d.tracks[k];return !tr||!tr.length||tr[tr.length-1].t<=A.sel.t+1e-6;});
    $('#keyEaseWrap').hidden=last;$('#keyLast').hidden=!last;
    const isDesign=Math.abs(designT(d)-A.sel.t)<halfFrame(fps());
    $('#keyDesign').hidden=isDesign;$('#keyIsDesign').hidden=!isDesign;
    const es=new Set(ks.map(k=>k.ease));$('#keyEaseLbl').textContent='Sonraki kareye geçiş'+(es.size>1?' (karışık)':'');
    easeGrid.querySelectorAll('.ease').forEach(b=>b.setAttribute('aria-pressed',String(es.size===1&&es.has(b.dataset.ease))));
  }
  if(isDevice(d))chips.querySelectorAll('button').forEach(b=>{b.disabled=!presetOk(PRESETS.find(p=>p.id===b.dataset.preset),d);});
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
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const stopIt=()=>{e.preventDefault();e.stopImmediatePropagation();};
  if(e.code==='Space'){stopIt();if(!e.repeat)play();}
  else if(e.key==='Home'){stopIt();stop();seek(0);}
  else if(e.key.toLowerCase()==='k'&&!e.repeat){stopIt();addPoseKey(cur());}
  else if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&ui.kind!=='item'&&ui.kind!=='multi'&&!(t&&t.type==='range')){stopIt();stop();seek(A.t+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:1/fps()));}
  else if((e.key==='Delete'||e.key==='Backspace')&&A.sel){stopIt();deleteSelected();}
},true);

export {devNames};
