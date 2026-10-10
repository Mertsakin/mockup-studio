import {TYPES} from '../state/constants.js';
import {halfFrame,hasAnim,keyIn,propsOf,timesOf,tracked} from '../state/anim.js';
import {sel,state} from '../state/state.js';
import {A,PRESETS,addPoseKey,applyPreset,deleteSelected,keyProp,keysAt,moveSelected,onAnim,play,seek,selectKey,selectedKeys,setDuration,setEase,setMode,stop} from './animate.js';
import {icon} from './icons.js';
import {onSyncUI,syncAll,syncUI} from './sync.js';
import {toast} from './toast.js';
import {setUi,ui} from './ui-state.js';
import {$,$$} from '../util.js';

/* Canlandır mode UI: the timeline under the stage (rows = devices with summary diamonds, unfolded = one sub-row per
   animated value), the mode switch, the animation parts of the device inspector (key panel, ◆ buttons beside the
   sliders, presets) and the keys (Space plays, K keys a pose, ← / → frame, Shift a second, Home, Delete). */
const tl=$('#timeline'),names=$('#tlNames'),lanes=$('#tlLanes');
const LABEL={px:'Yatay',py:'Dikey',pz:'Derinlik',ry:'Dönüş',rx:'Eğim',rz:'Yatış',scale:'Ölçek',lidAngle:'Kapak açısı',scroll:'Kaydırma'};
const SLIDER={px:'s-d-px',py:'s-d-py',pz:'s-d-pz',ry:'s-d-ry',rx:'s-d-rx',rz:'s-d-rz',scale:'s-d-scale',lidAngle:'s-d-lid',scroll:'s-d-scroll'};
const EASES=[['smooth','Yumuşak','M2 20 C 14 20, 22 2, 34 2'],['linear','Doğrusal','M2 20 L 34 2'],['hold','Ani','M2 20 L 30 20 L 30 2 L 34 2'],['back','Geri tepme','M2 20 C 12 20, 18 -6, 34 2']];
const DEV_ICON={phone:'smartphone',tablet:'tablet',laptop:'laptop',monitor:'monitor',browser:'window-frame',page:'display',custom:'gallery-wide'};
const fmtT=t=>t.toFixed(2).replace('.',',');
const fmtV=(k,v)=>k==='scroll'?Math.round(v*100)+'%':k==='scale'?v.toFixed(2)+'×':/^r|lid/.test(k)?Math.round(v)+'°':v.toFixed(1);
function devNames(){const n={},seen={};state.devices.forEach(d=>{const b=TYPES[d.type]||'Cihaz';n[b]=(n[b]||0)+1;});
  return state.devices.map(d=>{const b=TYPES[d.type]||'Cihaz';seen[b]=(seen[b]||0)+1;return n[b]>1?b+' '+seen[b]:b;});}
const fps=()=>state.anim.fps||30;
const open=new Set();  // device ids whose value rows are unfolded

/* ---------- geometry */
const W=()=>Math.max(40,lanes.clientWidth-44);
const xOf=t=>12+t/state.anim.dur*W(),tOf=x=>Math.max(0,Math.min(state.anim.dur,(x-12)/W()*state.anim.dur));

/* ---------- drawing: the structure is rebuilt only when it changes; the playhead moves every frame */
let sig='';
function structure(){
  return JSON.stringify([state.anim.dur,state.selected,A.sel,[...open],devNames(),state.devices.map(d=>[d.id,d.tracks?tracked(d).map(k=>[k,d.tracks[k].map(x=>[x.t,x.ease])]):0])]);
}
function rows(){const r=[];state.devices.forEach((d,i)=>{r.push({d,i,prop:null});if(open.has(d.id))tracked(d).forEach(k=>r.push({d,i,prop:k}));});return r;}
function build(){
  const R=rows(),nm=devNames(),dur=state.anim.dur;
  names.innerHTML='<div class="ruler-pad"></div>';lanes.innerHTML='';
  // ruler
  const ruler=document.createElement('div');ruler.className='ruler';
  const step=dur>15?2:1;let h='';
  for(let s=0;s<=dur+1e-6;s+=step)h+='<div class="tick" style="left:'+xOf(s)+'px"><span>'+s+' sn</span></div>';
  for(let s=step/2;s<dur;s+=step)h+='<div class="tick minor" style="left:'+xOf(s)+'px"></div>';
  ruler.innerHTML=h;lanes.appendChild(ruler);ruler.addEventListener('pointerdown',scrub);
  R.forEach(({d,i,prop})=>{
    // name cell
    const n=document.createElement('div');n.className='tl-name'+(prop?' subrow':'');n.dataset.dev=d.id;
    if(prop){n.innerHTML='<span class="nm"></span><span class="sub"></span>';n.firstChild.textContent=LABEL[prop];n.dataset.prop=prop;}
    else{
      const anim=hasAnim(d);n.setAttribute('aria-selected',String(d.id===state.selected));
      n.innerHTML='<button type="button" class="caret" aria-label="Değerleri göster" aria-expanded="'+open.has(d.id)+'"'+(anim?'':' disabled')+'>'+icon(open.has(d.id)?'alt-arrow-down':'alt-arrow-right',12)+'</button>'+icon(DEV_ICON[d.type]||'smartphone',14)+'<span class="nm"></span><span class="sub">'+(anim?tracked(d).length+' değer':'')+'</span>';
      n.querySelector('.nm').textContent=nm[i];
      n.querySelector('.caret').addEventListener('click',e=>{e.stopPropagation();open.has(d.id)?open.delete(d.id):open.add(d.id);draw(true);});
    }
    n.addEventListener('click',()=>pickDevice(d));
    names.appendChild(n);
    // lane
    const lane=document.createElement('div');lane.className='lane'+(prop?' subl':'')+(!prop&&d.id===state.selected?' sel':'');
    const ts=prop?d.tracks[prop].map(k=>k.t):timesOf(d);
    let lh='';
    for(let j=0;j<ts.length-1;j++)lh+='<div class="seg-bar" style="left:'+xOf(ts[j])+'px;width:'+(xOf(ts[j+1])-xOf(ts[j]))+'px"></div>';
    lane.innerHTML=lh;
    ts.forEach(t=>{
      const s=A.sel,on=s&&s.dev===d.id&&Math.abs(s.t-t)<halfFrame(fps())&&(s.prop===prop||(!s.prop&&!!prop));
      const b=document.createElement('button');b.type='button';b.className='kf'+(on?' on':'')+(prop?' small':'');b.style.left=xOf(t)+'px';
      b.setAttribute('aria-label',(prop?LABEL[prop]+', ':'')+'anahtar kare, '+fmtT(t)+' sn');b.title=fmtT(t)+' sn';
      b.addEventListener('pointerdown',e=>dragKey(e,d,t,prop));
      lane.appendChild(b);
    });
    lane.addEventListener('pointerdown',e=>{if(e.target!==lane&&!e.target.classList.contains('seg-bar'))return;pickDevice(d,true);scrub(e);});
    lanes.appendChild(lane);
  });
  const end=document.createElement('div');end.className='end';end.style.left=xOf(dur)+'px';end.innerHTML='<span>'+String(dur).replace('.',',')+' sn</span>';
  end.title='Süreyi değiştirmek için sürükle (en fazla 30 sn)';end.addEventListener('pointerdown',dragEnd);lanes.appendChild(end);
  const ph=document.createElement('div');ph.className='ph';ph.id='tlPh';lanes.appendChild(ph);
  $('#tlEmpty').hidden=state.devices.some(hasAnim);
}
function moveHead(){
  const ph=$('#tlPh');if(ph)ph.style.left=xOf(A.t)+'px';
  $('#tlTime').innerHTML=fmtT(A.t)+' <span>/ '+fmtT(state.anim.dur)+' sn</span>';
  names.querySelectorAll('.subrow').forEach(n=>{const d=state.devices.find(x=>x.id===+n.dataset.dev);if(d)n.querySelector('.sub').textContent=fmtV(n.dataset.prop,d[n.dataset.prop]);});
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
function pickDevice(d,keepKey){
  if(state.selected!==d.id){state.selected=d.id;syncAll();}
  setUi({kind:'device'});if(!keepKey)selectKey(null);else draw();
}
function loop(e,move,up){
  const mv=ev=>move(ev),u=ev=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',u);removeEventListener('pointercancel',u);if(up)up(ev);};
  addEventListener('pointermove',mv);addEventListener('pointerup',u);addEventListener('pointercancel',u);move(e);
}
// the playhead snaps to keys and whole seconds within 6 px, otherwise to frames
function scrub(e){
  if(e.button!==0)return;e.preventDefault();stop();const r=lanes.getBoundingClientRect();
  loop(e,ev=>{const t=tOf(ev.clientX-r.left),cands=state.devices.flatMap(timesOf).concat([...Array(Math.floor(state.anim.dur)+1).keys()]);
    const near=cands.find(k=>Math.abs(xOf(k)-xOf(t))<6);seek(near!==undefined?near:Math.round(t*fps())/fps());});
}
// a summary diamond moves every value's key at that time; a sub-row diamond only that value's key
function dragKey(e,d,t0,prop){
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();stop();
  if(state.selected!==d.id){state.selected=d.id;syncAll();}setUi({kind:'device'});
  selectKey(d.id,t0,prop);const x0=e.clientX;let moved=false;
  loop(e,ev=>{if(!moved&&Math.abs(ev.clientX-x0)<4)return;moved=true;moveSelected(t0+(ev.clientX-x0)/W()*state.anim.dur);seek(A.sel?A.sel.t:A.t);},
    ()=>{if(!moved)seek(t0);});
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
  const d=sel();if(!d)return;if(ui.mode!=='animate')setMode('animate');
  const p=PRESETS.find(x=>x.id===id),over=applyPreset(id,d);open.add(d.id);
  toast(p.n+' eklendi'+(over.length?': '+over.map(k=>LABEL[k].toLowerCase()).join(', ')+' hareketinin üzerine yazıldı':''));
}
const presetOk=(p,d)=>!!d&&(!p.ok||p.ok(d));
$('#tlPresetBtn').addEventListener('click',e=>{
  e.stopPropagation();if(!menu.hidden){menu.hidden=true;return;}
  const d=sel(),nm=d?devNames()[state.devices.indexOf(d)]:'';menu.innerHTML='';
  PRESETS.forEach(p=>{const b=document.createElement('button');b.type='button';b.className='mi';b.setAttribute('role','menuitem');b.disabled=!presetOk(p,d);
    b.innerHTML='<span></span><kbd></kbd>';b.firstChild.textContent=p.n+' · '+nm;b.lastChild.textContent=p.hint;b.addEventListener('click',()=>{menu.hidden=true;runPreset(p.id);});menu.appendChild(b);});
  menu.hidden=false;const r=e.currentTarget.getBoundingClientRect();
  menu.style.left=Math.min(r.left,innerWidth-menu.offsetWidth-8)+'px';menu.style.top=(r.top-menu.offsetHeight-6)+'px';
  const f=menu.querySelector('.mi:not(:disabled)');if(f)f.focus();
});
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target))menu.hidden=true;});
const chips=$('#presetChips');
PRESETS.forEach(p=>{const b=document.createElement('button');b.type='button';b.dataset.preset=p.id;b.textContent=p.n;b.title=p.hint;b.addEventListener('click',()=>runPreset(p.id));chips.appendChild(b);});

/* ---------- inspector: key panel, ◆ beside the sliders, pose key */
const easeGrid=$('#easeGrid');
EASES.forEach(([k,n,path])=>{const b=document.createElement('button');b.type='button';b.className='ease';b.dataset.ease=k;
  b.innerHTML='<svg viewBox="0 0 36 22" aria-hidden="true"><path d="'+path+'"/></svg><span></span>';b.lastChild.textContent=n;b.addEventListener('click',()=>setEase(k));easeGrid.appendChild(b);});
$('#keyDelete').addEventListener('click',()=>deleteSelected());
$('#poseKey').addEventListener('click',()=>addPoseKey(sel()));
const dots={};
function ensureDots(){
  for(const k in SLIDER){
    if(dots[k]&&dots[k].isConnected)continue;
    const lab=document.querySelector('label[for="'+SLIDER[k]+'"]');if(!lab)continue;
    const b=document.createElement('button');b.type='button';b.className='kdot anim-only';b.dataset.prop=k;b.setAttribute('aria-label',LABEL[k]+': bu anda anahtar kare');
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();keyProp(sel(),k);});
    lab.prepend(b);dots[k]=b;
  }
}
// lid angle and scroll live in other sections; in Canlandır they move next to the transform sliders
const moved=[['lidSlot'],['scrollSlot']].map(([id])=>{const el=$('#'+id),mark=document.createComment(id);el.parentNode.insertBefore(mark,el);return {el,mark};});
function placeSlots(animate){moved.forEach(({el,mark})=>{if(animate){if(el.parentNode!==$('#animSlots'))$('#animSlots').appendChild(el);}else if(el.previousSibling!==mark)mark.parentNode.insertBefore(el,mark.nextSibling);});}
$('#devSliders').closest('.sec').classList.add('anim-keep');
$('#keySec').classList.add('anim-keep');$('#presetChips').closest('.sec').classList.add('anim-keep');
function syncInspector(){
  ensureDots();
  const d=sel(),animate=ui.mode==='animate';
  $('#animNote').hidden=!(d&&!animate&&hasAnim(d));
  if(!d)return;
  const t=Math.round(A.t*fps())/fps();
  for(const k in dots){const tr=d.tracks&&d.tracks[k],at=animate&&!!keyIn(tr,t,fps()),an=!!tr&&tr.length>1&&tr.some(x=>Math.abs(x.v-tr[0].v)>1e-9);
    dots[k].classList.toggle('at',at);dots[k].classList.toggle('anim',an&&!at);dots[k].hidden=!propsOf(d).includes(k);}
  const pose=keysAt(d,t,null);$('#poseKey').classList.toggle('at',animate&&pose.length>0&&pose.length>=propsOf(d).length);
  // key panel: the selected key of this device
  const ks=animate&&A.sel&&A.sel.dev===d.id?selectedKeys():[];
  $('#keySec').hidden=!ks.length;
  if(ks.length){
    const p=A.sel.prop;$('#keyTitle').textContent='Anahtar kare · '+fmtT(A.sel.t)+' sn';
    $('#keyWhat').textContent=p?LABEL[p]:ks.length+' değer (özet kare: birlikte taşınır ve silinir)';
    const last=(p?[p]:tracked(d)).every(k=>{const tr=d.tracks[k];return !tr||!tr.length||tr[tr.length-1].t<=A.sel.t+1e-6;});
    $('#keyEaseWrap').hidden=last;$('#keyLast').hidden=!last;
    const es=new Set(ks.map(k=>k.ease));$('#keyEaseLbl').textContent='Sonraki kareye geçiş'+(es.size>1?' (karışık)':'');
    easeGrid.querySelectorAll('.ease').forEach(b=>b.setAttribute('aria-pressed',String(es.size===1&&es.has(b.dataset.ease))));
  }
  chips.querySelectorAll('button').forEach(b=>{b.disabled=!presetOk(PRESETS.find(p=>p.id===b.dataset.preset),d);});
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
  const s=state.devices.map(d=>hasAnim(d)?1:0).join();if(s!==animSig&&!A.playing){animSig=s;syncUI();}
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
  else if(e.key.toLowerCase()==='k'&&!e.repeat){stopIt();addPoseKey(sel());}
  else if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&ui.kind!=='item'&&!(t&&t.type==='range')){stopIt();stop();seek(A.t+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:1/fps()));}
  else if((e.key==='Delete'||e.key==='Backspace')&&A.sel){stopIt();deleteSelected();}
},true);

export {devNames};
