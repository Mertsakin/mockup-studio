import {gradCss} from '../render/backgrounds.js';
import {renderNow} from '../render/accumulation.js';
import {applyMix} from '../render/mix.js';
import {canvas as gl} from '../render/renderer.js';
import {DIRS,ENV_NAME,KINDS,KIND_IDS,TR_MIN,camOf,devsMatch,devsOf,easeOf,envOf,flyOk,layoutSeq,lightsMatch,lightsOf,maxTrDur,mixCam,mixList,newTransition,normalizeSeq,seqAt,seqTotal} from '../state/sequence.js';
import {state} from '../state/state.js';
import {openVideoExport} from '../export/video.js';
import {A,seek as seekBoard,stop as stopBoard} from './animate.js';
import {activate,boardById,boardDur,doc,emitBoards,onBoards} from './boards.js';
import {openMenu} from './context-menu.js';
import {holdHistory} from './history.js';
import {icon} from './icons.js';
import {boardRect,frame,paintBg,paintItems} from './layout.js';
import {toast} from './toast.js';
import {setUi} from './ui-state.js';
import {fitActive} from './workspace.js';
import {fmt,t as tx} from '../lang.js';
import {$,mkCanvas} from '../util.js';

/* The Sıra (sequence) view of the timeline panel (Canlandır): the boards of doc.sequence (state/sequence.js) as clip
   cards on one strip, with the transitions between them as chips over the overlap of two clips; a ruler in sequence
   time above. Design: wireframes/sequence.html.
   Clips: a click makes that board the active one, a drag reorders, ✕ / ⌫ takes the clip out (the board stays), the +
   at the end (and "Tüm artboard'ları ekle") add boards; a clip's length is its board's duration (changed on the
   Artboard view). Chips: a click opens the edit card (kind, duration, ease, the colour of a fade or the direction of
   a slide, and a note: whether a flight is possible and whether the devices match). Every change is a document change
   (undo, autosave, file: ui/boards.js docSnapshot).
   Playback (Space in this view) runs the whole sequence: the playhead is in sequence time, the active board changes at
   a clip's start (activate), and a transition is shown live: the frame the outgoing board shows when the window opens
   is frozen (captureLive) and drawn over the live incoming board in a canvas inside #frame (dissolve, fade through
   the colour, slide; a cut needs nothing); in a camera flight the live board's camera, and its devices and lights
   when they match the other board's, take the values in between (render/mix.js), so the incoming scene flies in from
   the outgoing one's view while the frozen frame dissolves (the export renders both boards, export/video.js). While
   the sequence drives the scene the recorder is muted (animate.js A.mute) and history is held: nothing it writes is
   an edit, and the board's own values are put back when the window ends or playback stops.
   Scrubbing (the ruler, ← / →) shows the nearer board inside a window, without the overlay. */
const view=$('#seqView'),tl=$('#timeline');
const S={t:0,playing:false,sel:null,on:false};  // sel: {clip} | {tr} (indices)
let L=[];  // the layout of the sequence (layoutSeq), rebuilt on every draw
const total=()=>seqTotal(L);
const fps=()=>state.anim.fps||30;
const fmtT=t=>fmt(t,2);
const fmt1=t=>fmt(Math.round(t*10)/10,1);
const PAD=14,ADD_W=64;
const W=()=>Math.max(60,view.clientWidth-PAD*2-ADD_W);
const pps=()=>W()/Math.max(1,total());
const xOf=t=>PAD+t*pps(),tOf=x=>Math.max(0,Math.min(total(),(x-PAD)/pps()));
const KIND_SVG={
  cut:'<svg viewBox="0 0 24 24"><path d="M5 4v16M19 4v16M9 12h6"/></svg>',
  xfade:'<svg viewBox="0 0 24 24"><rect x="3" y="6" width="12" height="12" rx="2"/><rect x="9" y="6" width="12" height="12" rx="2" stroke-dasharray="2 2"/></svg>',
  fade:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 12h16" opacity=".4"/></svg>',
  slide:'<svg viewBox="0 0 24 24"><rect x="3" y="6" width="9" height="12" rx="1.5"/><rect x="14" y="6" width="9" height="12" rx="1.5"/></svg>',
  fly:'<svg viewBox="0 0 24 24"><path d="M4 17c3-9 13-9 16 0"/><circle cx="20" cy="17" r="1.6"/><circle cx="4" cy="17" r="1.6"/><path d="M12 6V3"/></svg>'
};
const EASES=[['smooth','Yumuşak','M2 11 C 7 11, 11 1, 16 1'],['linear','Doğrusal','M2 11 L 16 1']];
const COLORS=[['#000000','Siyah'],['#ffffff','Beyaz']];
const DIR_ICON={left:'alt-arrow-left',right:'alt-arrow-right',up:'alt-arrow-up',down:'alt-arrow-down'},DIR_NAME={left:'Sola',right:'Sağa',up:'Yukarı',down:'Aşağı'};
const seq=()=>doc.sequence;
const nameOf=id=>{const b=boardById(id);return b?b.name:'?';};
const snapOf=id=>{const b=boardById(id);return b&&b.snap;};
const dirty=()=>emitBoards();  // the document changed: every view of the boards (and this strip) redraws; history sees it on its next poll

/* ---------- the layout: the stored sequence made consistent first (a board's duration may have changed since) */
function relayout(){
  const s=seq(),n=normalizeSeq(s,id=>!!boardById(id),boardDur);
  if(JSON.stringify(n)!==JSON.stringify(s))doc.sequence=n;
  L=layoutSeq(doc.sequence,boardDur);
  if(S.t>total())S.t=total();
}

/* ---------- drawing */
let sig='';
const structure=()=>JSON.stringify([doc.sequence,doc.boards.map(b=>[b.id,b.name,b.thumb?b.thumb.length:0]),doc.active,S.sel,view.clientWidth]);
function draw(){
  if(!S.on)return;relayout();
  const s=structure();if(s!==sig){sig=s;build();}
  moveHead();
}
function tickStep(){const p=pps();for(const s of [.5,1,2,5,10,30])if(s*p>=70)return s;return 30;}
function build(){
  view.innerHTML='';const T=total(),s=seq();
  const ruler=document.createElement('div');ruler.className='ruler';let h='';const step=tickStep();
  for(let x=0;x<=T+1e-6;x+=step)h+='<div class="tick" style="left:'+xOf(x)+'px"><span>'+String(+x.toFixed(2)).replace('.',',')+' sn</span></div>';
  for(let x=step/2;x<T;x+=step)h+='<div class="tick minor" style="left:'+xOf(x)+'px"></div>';
  ruler.innerHTML=h;ruler.addEventListener('pointerdown',scrub);view.appendChild(ruler);
  const lane=document.createElement('div');lane.className='seq-lane';view.appendChild(lane);
  if(!L.length){
    const em=document.createElement('div');em.className='seq-empty';
    em.innerHTML='<span>'+tx('Sıra boş: artboard\'ları tek bir videoda art arda oynatmak için <b>+</b> ile ekle ya da')+'</span><button class="btn sm" type="button">'+tx('Tüm artboard\'ları ekle')+'</button>';
    em.querySelector('button').addEventListener('click',addAll);lane.appendChild(em);
  }
  L.forEach(c=>{
    const b=boardById(c.board),st=b.snap.state;
    const el=document.createElement('div');el.className='seq-clip'+(c.board===doc.active?' active':'')+(S.sel&&S.sel.clip===c.i?' sel':'');
    el.style.left=xOf(c.start)+'px';el.style.width=Math.max(44,xOf(c.end)-xOf(c.start))+'px';el.style.setProperty('--tin',(c.tin*pps())+'px');el.dataset.i=c.i;
    el.innerHTML='<div class="seq-th"></div><div class="seq-nm"><span class="t"></span>'+(envOf(b.snap)==='space'?'<span class="env">· '+tx('Uzay')+'</span>':'')+'<span class="dur">'+fmt1(c.dur)+' '+tx('sn')+'</span></div>'+
      '<div class="seq-tools"><button type="button" data-a="go" aria-label="'+tx('Artboard\'a git')+'">'+icon('alt-arrow-right',12)+'<span class="tip">'+tx('Artboard\'a git (süresi orada değişir)')+'</span></button>'+
      '<button type="button" data-a="rm" aria-label="'+tx('Sıradan çıkar')+'">'+icon('close-circle',12)+'<span class="tip">'+tx('Sıradan çıkar')+' <kbd>⌫</kbd></span></button></div><span class="seq-prog"></span>';
    el.querySelector('.t').textContent=b.name;
    const th=el.querySelector('.seq-th');
    if(b.thumb){const img=document.createElement('img');img.alt='';img.src=b.thumb;th.appendChild(img);}
    else th.style.background=st.bg==='solid'?st.solid:st.bg==='gradient'?gradCss(st):'';
    el.title=b.name+' · '+fmt1(c.dur)+' '+tx('sn')+' · '+fmtT(c.start)+' → '+fmtT(c.end)+' '+tx('sn (tıkla: etkin artboard; sürükle: taşı)');
    el.querySelectorAll('.seq-tools button').forEach(x=>x.addEventListener('pointerdown',e=>e.stopPropagation()));
    el.querySelector('[data-a="rm"]').addEventListener('click',e=>{e.stopPropagation();removeClip(c.i);});
    el.querySelector('[data-a="go"]').addEventListener('click',e=>{e.stopPropagation();pickBoard(c.board);setView(false);});
    el.addEventListener('pointerdown',e=>dragClip(e,c));
    lane.appendChild(el);
  });
  // the transition chips over the overlaps
  L.forEach((c,i)=>{
    if(!i)return;const tr=s.transitions[i-1],a=snapOf(L[i-1].board),b=snapOf(c.board),bad=tr.kind==='fly'&&!flyOk(a,b);
    const el=document.createElement('button');el.type='button';
    el.className='seq-tr '+tr.kind+(S.sel&&S.sel.tr===i-1?' on':'')+(bad?' bad':'');
    const w=tr.kind==='cut'?18:Math.max(30,c.tin*pps()),x=tr.kind==='cut'?xOf(c.start)-9:xOf(c.start)+(c.tin*pps()-w)/2;
    el.style.left=x+'px';el.style.width=w+'px';
    el.innerHTML=KIND_SVG[tr.kind]+(tr.kind==='cut'?'':'<small>'+fmt1(tr.dur)+'</small>')+'<span class="tip">'+tx(KINDS[tr.kind].n)+(tr.kind==='cut'?'':' · '+fmt1(tr.dur)+' '+tx('sn'))+(bad?' · '+tx('ortamlar farklı: çapraz solma gibi davranır'):'')+' '+tx('(tıkla: düzenle)')+'</span>';
    el.setAttribute('aria-label',tx('Geçiş: {e}',{e:tx(KINDS[tr.kind].n)}));
    el.addEventListener('pointerdown',e=>e.stopPropagation());
    el.addEventListener('click',e=>{e.stopPropagation();stop();S.sel=S.sel&&S.sel.tr===i-1?null:{tr:i-1};draw();});
    lane.appendChild(el);
  });
  const add=document.createElement('button');add.type='button';add.className='seq-add';add.style.left=(L.length?xOf(T)+12:PAD)+'px';add.setAttribute('aria-label',tx('Sıraya artboard ekle'));
  add.innerHTML=icon('add-circle',18)+'<span class="tip">'+tx('Sıraya artboard ekle')+'</span>';add.addEventListener('click',e=>{e.stopPropagation();addMenu(e.clientX,e.clientY);});lane.appendChild(add);
  const ph=document.createElement('div');ph.className='ph';ph.id='seqPh';view.appendChild(ph);
  drawCard();
}
function drawCard(){
  const old=view.querySelector('.kpop');if(old)old.remove();
  if(!S.sel||S.sel.tr===undefined)return;
  const s=seq(),i=S.sel.tr,tr=s.transitions[i];if(!tr||!L[i+1])return;
  const a=snapOf(L[i].board),b=snapOf(L[i+1].board),ok=flyOk(a,b),match=devsMatch(a,b),maxT=maxTrDur(s,i,boardDur);
  const p=document.createElement('div');p.className='kpop seqc below';p.setAttribute('role','group');p.setAttribute('aria-label',tx('Geçiş@tl'));
  let extra='';
  if(tr.kind==='fade')extra='<span class="row"><span class="lbl">'+tx('Renk')+'</span>'+COLORS.map(([c,n])=>'<button type="button" class="sw" data-color="'+c+'" style="background:'+c+'" aria-pressed="'+((tr.color||'#000000')===c)+'" aria-label="'+tx(n)+'"></button>').join('')+'</span>';
  if(tr.kind==='slide')extra='<span class="row"><span class="lbl">'+tx('Yön')+'</span><span class="eases dirs">'+Object.keys(DIRS).map(d=>'<button type="button" data-dir="'+d+'" aria-pressed="'+((tr.dir||'left')===d)+'">'+icon(DIR_ICON[d],14)+'<span class="tip">'+tx(DIR_NAME[d])+'</span></button>').join('')+'</span></span>';
  let note='';
  if(tr.kind==='fly')note=!ok?'<span class="note bad">'+tx('Ortamlar farklı ({a} → {b}): kamera uçuşu yok, çapraz solma gibi davranır. Birini aynı ortama al.',{a:tx(ENV_NAME[envOf(a)]),b:tx(ENV_NAME[envOf(b)])})+'</span>'
    :match?'<span class="note ok">'+tx('{n} cihaz eşleşti: kamerayla birlikte konumları da süzülür; ekran ve renk çözülür.',{n:a.devices.length})+(lightsMatch(a,b)?' '+tx('Işıklar da.'):'')+'</span>'
    :'<span class="note">'+tx('Cihazlar eşleşmiyor ({a} ↔ {b}): kamera uçar, cihazlar olduğu yerde çapraz solar.',{a:a.devices.length,b:b.devices.length})+'</span>';
  else if(tr.kind==='xfade')note='<span class="note">'+tx('{a}\'nın son {d} sn\'si ile {b}\'nın ilk {d} sn\'si üst üste oynar.',{a:nameOf(L[i].board),b:nameOf(L[i+1].board),d:fmt1(tr.dur)})+'</span>';
  else if(tr.kind==='cut')note='<span class="note">'+tx('Süre yok: son kareden ilk kareye.')+'</span>';
  else if(tr.kind==='fade')note='<span class="note">'+tx('Yarı yolda tek renk: {d} sn söner, {d} sn belirir.',{d:fmt1(tr.dur/2)})+'</span>';
  else if(tr.kind==='slide')note='<span class="note">'+tx('Gelen artboard kayarken kendi animasyonu akar.')+'</span>';
  p.innerHTML='<span class="row"><b></b><span class="grow"></span><button type="button" class="ib sm del" data-a="cut" aria-label="'+tx('Geçişi kaldır')+'">'+icon('trash-bin-minimalistic',14)+'<span class="tip">'+tx('Geçişi kaldır (kesme)')+'</span></button></span>'+
    '<span class="row"><span class="eases kinds" role="group" aria-label="'+tx('Tür')+'">'+KIND_IDS.map(k=>'<button type="button" data-kind="'+k+'" aria-pressed="'+(tr.kind===k)+'">'+KIND_SVG[k]+'<span class="tip">'+tx(KINDS[k].n)+(k==='fly'&&!ok?' · '+tx('ortamlar farklı'):'')+'</span></button>').join('')+'</span>'+
    '<label class="tf"'+(tr.kind==='cut'?' hidden':'')+'><input data-f="dur" value="'+fmt1(tr.dur)+'" aria-label="'+tx('Geçiş süresi (sn)')+'" spellcheck="false"><span>'+tx('sn')+'</span></label>'+
    '<span class="eases" role="group" aria-label="'+tx('Yumuşatma')+'"'+(tr.kind==='cut'?' hidden':'')+'>'+EASES.map(([k,n,path])=>'<button type="button" data-ease="'+k+'" aria-pressed="'+(tr.ease===k)+'"><svg viewBox="0 0 18 12"><path d="'+path+'"/></svg><span class="tip">'+tx(n)+'</span></button>').join('')+'</span></span>'+extra+note;
  p.querySelector('b').textContent=tx('Geçiş@tl')+' · '+nameOf(L[i].board)+' → '+nameOf(L[i+1].board);
  view.appendChild(p);
  const c=L[i+1],cx=xOf(c.start)+Math.max(15,c.tin*pps()/2),left=Math.max(4,Math.min(view.clientWidth-p.offsetWidth-4,cx-p.offsetWidth/2));
  p.style.left=left+'px';p.style.top='30px';p.style.setProperty('--ax',Math.max(10,Math.min(p.offsetWidth-10,cx-left))+'px');
  const change=()=>{dirty();draw();};
  p.querySelectorAll('[data-kind]').forEach(x=>x.addEventListener('click',()=>{const k=x.dataset.kind;if(k===tr.kind)return;const fresh=newTransition(k);
    // the duration carries over between the timed kinds; a cut has none; a flight prefers the smooth ease
    if(tr.kind!=='cut'&&k!=='cut')fresh.dur=tr.dur;s.transitions[i]=fresh;clampTr(i);change();}));
  p.querySelectorAll('[data-ease]').forEach(x=>x.addEventListener('click',()=>{tr.ease=x.dataset.ease;change();}));
  p.querySelectorAll('[data-dir]').forEach(x=>x.addEventListener('click',()=>{tr.dir=x.dataset.dir;change();}));
  p.querySelectorAll('[data-color]').forEach(x=>x.addEventListener('click',()=>{tr.color=x.dataset.color;change();}));
  p.querySelector('[data-a="cut"]').addEventListener('click',()=>{s.transitions[i]=newTransition('cut');change();});
  const tf=p.querySelector('[data-f="dur"]');
  tf.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();tf.blur();}else if(e.key==='Escape'){e.preventDefault();S.sel=null;draw();}});
  tf.addEventListener('change',()=>{const v=parseFloat(tf.value.replace(',','.'));
    if(Number.isFinite(v)){tr.dur=Math.round(Math.max(TR_MIN,Math.min(maxT,v))*100)/100;if(v>maxT+1e-6)toast(tx('Geçiş en çok {d} sn olabilir: iki geçiş aynı artboardda üst üste binemez',{d:fmt1(maxT)}));}
    change();});
  tf.addEventListener('focus',()=>tf.select());
  p.addEventListener('pointerdown',e=>e.stopPropagation());
}
// a transition's duration kept within its clips (and clear of the clips' other transitions)
function clampTr(i){const s=seq(),t=s.transitions[i];if(t.kind==='cut'){t.dur=0;return;}t.dur=Math.round(Math.max(TR_MIN,Math.min(t.dur,maxTrDur(s,i,boardDur)))*100)/100;}
function moveHead(){
  const ph=$('#seqPh');if(ph)ph.style.left=xOf(S.t)+'px';
  const tf=$('#tlT');if(document.activeElement!==tf)tf.value=fmtT(S.t);$('#tlDur').textContent='/ '+fmtT(total())+' '+tx('sn');
  view.querySelectorAll('.seq-clip').forEach(el=>{const c=L[+el.dataset.i];if(!c)return;const u=Math.max(0,Math.min(1,(S.t-c.start)/c.dur));el.querySelector('.seq-prog').style.width=(u*100)+'%';el.classList.toggle('active',c.board===doc.active);});
}

/* ---------- editing the sequence */
function pickBoard(id){stop();if(doc.active!==id)activate(id);setUi({kind:'board'});}
function removeClip(i){
  const s=seq(),c=s.clips[i];if(!c)return;s.clips.splice(i,1);
  if(s.transitions.length){if(i===0)s.transitions.splice(0,1);else s.transitions.splice(i-1,1);}  // its own (left) transition goes with it
  S.sel=null;toast(tx('{b} sıradan çıkarıldı (artboard duruyor)',{b:nameOf(c.board)}));dirty();draw();
}
// moves clip i so it lands before index `to`; a clip keeps the transition on its left
function moveClip(i,to){
  const s=seq(),clip=s.clips[i],trs=s.transitions.slice(),left=i?trs[i-1]:(trs[0]||newTransition());
  s.clips.splice(i,1);trs.splice(i?i-1:0,1);
  const j=to>i?to-1:to;s.clips.splice(j,0,clip);trs.splice(j?j-1:0,0,Object.assign({},left));
  s.transitions=trs.slice(0,Math.max(0,s.clips.length-1));
  s.transitions.forEach((_,k)=>clampTr(k));
  S.sel={clip:j};dirty();draw();
}
function addClip(id,after){
  const s=seq(),at=after===undefined?s.clips.length:after+1;s.clips.splice(at,0,{board:id});
  if(s.clips.length>1)s.transitions.splice(at?at-1:0,0,newTransition());
  s.transitions.forEach((_,k)=>clampTr(k));
  S.sel={clip:at};toast(tx('{b} sıraya eklendi · çapraz solma {d} sn',{b:nameOf(id),d:fmt1(KINDS.xfade.dur)}));dirty();draw();
}
// every board, in canvas order (left to right, then top to bottom), joined by the default transition
function addAll(){
  const s=seq(),ids=doc.boards.slice().sort((a,b)=>Math.abs(a.y-b.y)>200?a.y-b.y:a.x-b.x).map(b=>b.id);
  s.clips=ids.map(board=>({board}));s.transitions=ids.slice(1).map(()=>newTransition());s.transitions.forEach((_,k)=>clampTr(k));
  S.sel=null;S.t=0;toast(tx('{n} artboard sıraya eklendi',{n:ids.length}));dirty();draw();
}
function addMenu(x,y){
  const s=seq(),inSeq=new Set(s.clips.map(c=>c.board));
  openMenu(x,y,[...doc.boards.map(b=>['gallery',(inSeq.has(b.id)?'✓ ':'')+b.name+' · '+fmt1(boardDur(b.id))+' '+tx('sn'),()=>addClip(b.id)]),null,['layers-minimalistic',tx('Tüm artboard\'ları ekle'),addAll,'',!doc.boards.length]]);
}
function loop(e,move,up){const mv=ev=>move(ev),u=ev=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',u);removeEventListener('pointercancel',u);if(up)up(ev);};addEventListener('pointermove',mv);addEventListener('pointerup',u);addEventListener('pointercancel',u);move(e);}
function dragClip(e,c){
  if(e.button!==0)return;e.preventDefault();stop();
  const x0=e.clientX,el=e.currentTarget,r=view.getBoundingClientRect();let moved=false,guide=null,target=null;
  loop(e,ev=>{if(!moved&&Math.abs(ev.clientX-x0)<5)return;moved=true;el.classList.add('drag');
    const x=ev.clientX-r.left;let idx=L.findIndex(k=>x<xOf((k.start+k.end)/2));if(idx<0)idx=L.length;target=idx;
    if(!guide){guide=document.createElement('div');guide.className='seq-drop';view.appendChild(guide);}
    guide.style.left=(idx<L.length?xOf(L[idx].start):xOf(total()))+'px';},
    ()=>{if(guide)guide.remove();el.classList.remove('drag');
      if(!moved){S.sel={clip:c.i};pickBoard(c.board);draw();return;}
      if(target===null||target===c.i||target===c.i+1){draw();return;}
      moveClip(c.i,target);});
}
function scrub(e){if(e.button!==0)return;e.preventDefault();stop();const r=view.getBoundingClientRect();loop(e,ev=>seekTo(Math.round(tOf(ev.clientX-r.left)*fps())/fps()));}

/* ---------- playback */
const live={win:null,frozen:null,mixed:null};  // mixed: the board whose camera / devices / lights hold mixed values now
let over=null,og=null,raf=0,last=0;
function overlay(){
  if(!over){over=document.createElement('canvas');over.className='seq-over';over.hidden=true;frame.appendChild(over);og=over.getContext('2d');}
  const k=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(frame.clientWidth*k)),h=Math.max(1,Math.round(frame.clientHeight*k));
  if(over.width!==w||over.height!==h){over.width=w;over.height=h;}
  return k;
}
function hideOverlay(){if(over){over.hidden=true;}frame.classList.remove('seq-cover');}
// the live board as it is drawn now, at the board's on-screen size: background, items behind, the 3D canvas (its
// visible part), items in front. The 3D render is made current first (the last presented frame may be a frame old).
function captureLive(t){
  const R=boardRect();if(!R)return null;renderNow(2);
  const k=Math.min(window.devicePixelRatio||1,2),c=mkCanvas(Math.max(1,Math.round(R.w*k)),Math.max(1,Math.round(R.h*k))),g=c.getContext('2d');
  g.scale(k,k);paintBg(g,R.w,R.h);paintItems(g,R.w,R.h,false,t);g.drawImage(gl,-R.x,-R.y,frame.clientWidth,frame.clientHeight);paintItems(g,R.w,R.h,true,t);
  return c;
}
let switched=false;  // a board came up during this tick: the clock restarts after it (the switch takes a moment)
// while playing the stage frames the board that came up (it may be off screen on the canvas); scrubbing leaves the view
function showBoard(id,t){if(doc.active!==id){activate(id,S.playing);if(S.playing)fitActive();switched=true;}seekBoard(t);}
// the transition window opens: the outgoing board's frame is frozen (shown by the live scene when it is the active
// board; otherwise it is brought up for that: playback started inside the window)
function enterWindow(f){
  live.win=f.clip;live.frozen=null;
  if(doc.active!==f.a.board){activate(f.a.board,true);fitActive();switched=true;}
  seekBoard(f.a.t);live.frozen=captureLive(f.a.t);
}
// the window closed (or playback stopped in it): the live board gets its own values back
function leaveWindow(){live.win=null;live.frozen=null;hideOverlay();restoreMixed();}
// the board that holds mixed values (it is live: it came up through activate, so its snapshot is current) takes its
// own values at its playhead again
function restoreMixed(){
  const id=live.mixed;if(id==null)return;live.mixed=null;
  const b=boardById(id);if(b&&doc.active===id)applyMix({cam:camOf(b.snap,A.t),devs:devsOf(b.snap,A.t),lights:lightsOf(b.snap,A.t)});
}
function seekTo(t,playing){
  S.t=Math.max(0,Math.min(total(),t));const f=seqAt(L,S.t);if(!f){moveHead();return;}
  const inWin=!!(playing&&f.b&&f.tr&&f.tr.kind!=='cut');
  if(live.win!==null&&(!inWin||live.win!==f.clip))leaveWindow();
  if(inWin){
    if(live.win!==f.clip)enterWindow(f);
    showBoard(f.b.board,f.b.t);
    const tr=f.tr,e=easeOf(tr)(f.u),a=snapOf(f.a.board),b=snapOf(f.b.board);
    if(tr.kind==='fly'&&flyOk(a,b)){
      const mix={cam:mixCam(camOf(a,f.a.t),camOf(b,f.b.t),e)};
      if(devsMatch(a,b))mix.devs=mixList(devsOf(a,f.a.t),devsOf(b,f.b.t),e);
      if(lightsMatch(a,b))mix.lights=mixList(lightsOf(a,f.a.t),lightsOf(b,f.b.t),e);
      applyMix(mix);live.mixed=f.b.board;
    }
    drawOverlay(f,e);
  }else{
    const x=f.b&&f.u>=.5?f.b:f.a;showBoard(x.board,x.t);
  }
  moveHead();
}
function drawOverlay(f,e){
  const R=boardRect(),tr=f.tr;if(!R||!live.frozen){hideOverlay();return;}
  const k=overlay(),bx=R.x*k,by=R.y*k,bw=R.w*k,bh=R.h*k,g=og;
  g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,over.width,over.height);
  if(tr.kind==='fade'){
    if(e<.5)g.drawImage(live.frozen,bx,by,bw,bh);
    g.fillStyle=tr.color||'#000000';g.globalAlpha=1-Math.abs(2*e-1);g.fillRect(0,0,over.width,over.height);g.globalAlpha=1;
    frame.classList.remove('seq-cover');
  }else if(tr.kind==='slide'){
    // both frames move: the incoming one is captured too, and the live layers are covered meanwhile
    const [dx,dy]=DIRS[tr.dir]||DIRS.left,cur=captureLive(f.b.t);
    g.drawImage(live.frozen,bx+dx*e*bw,by+dy*e*bh,bw,bh);if(cur)g.drawImage(cur,bx+dx*(e-1)*bw,by+dy*(e-1)*bh,bw,bh);
    frame.classList.add('seq-cover');
  }else{
    g.globalAlpha=1-e;g.drawImage(live.frozen,bx,by,bw,bh);g.globalAlpha=1;frame.classList.remove('seq-cover');
  }
  over.hidden=false;
}
function play(){
  if(S.playing){stop();return;}
  relayout();if(!L.length)return;
  stopBoard();S.playing=true;A.mute=true;holdHistory(true);fitActive();
  if(S.t>=total()-1e-6)S.t=0;last=performance.now();
  seekTo(S.t,true);
  const tick=now=>{
    if(!S.playing)return;
    let t=S.t+(now-last)/1000;last=now;
    if(t>=total()){if(seq().loop)t%=total();else{t=total();seekTo(t,true);stop();return;}}
    seekTo(t,true);if(switched){switched=false;last=performance.now();}raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);emitBoards();
}
let muteTok=0;
function stop(){
  if(!S.playing)return;S.playing=false;cancelAnimationFrame(raf);
  if(live.win!==null)leaveWindow();else restoreMixed();
  // the recorder compares the fields after this task (animate.js observe runs as a microtask): unmute after it
  const tok=++muteTok;setTimeout(()=>{if(tok===muteTok&&!S.playing)A.mute=false;},0);
  holdHistory(false);emitBoards();
}
function seek(t){stop();seekTo(t,false);}

/* ---------- the view switch (timeline.js draws the tabs' state and routes the bar's buttons and the keys here) */
function setView(on){
  on=!!on;if(S.on===on)return;S.on=on;
  if(!on)stop();
  tl.classList.toggle('seq-on',on);view.hidden=!on;$('#tlBody').hidden=on;
  $('#seqAddAll').hidden=!on;$('#seqExport').hidden=!on;
  sig='';if(on)draw();
}
const active=()=>S.on;
// keys while the Sıra view is shown (from timeline.js's capture handler): true when handled
function key(e){
  const mod=e.metaKey||e.ctrlKey;if(mod||e.altKey)return false;
  const stopIt=()=>{e.preventDefault();e.stopImmediatePropagation();};
  if(e.code==='Space'){stopIt();if(!e.repeat)play();return true;}
  if(e.key==='Home'){stopIt();seek(0);return true;}
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){stopIt();seek(S.t+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:1/fps()));return true;}
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){stopIt();const f=seqAt(L,S.t);if(f){const i=Math.max(0,Math.min(L.length-1,f.clip+(e.key==='ArrowDown'?1:-1)));seek(L[i].start);}return true;}
  if((e.key==='Delete'||e.key==='Backspace')&&S.sel){stopIt();if(S.sel.clip!==undefined)removeClip(S.sel.clip);else{seq().transitions[S.sel.tr]=newTransition('cut');dirty();draw();}return true;}
  if(e.key==='Escape'&&S.sel){stopIt();S.sel=null;draw();return true;}
  return false;
}
$('#seqAddAll').addEventListener('click',addAll);
$('#seqExport').addEventListener('click',()=>{stop();openVideoExport('seq');});
onBoards(()=>{if(S.on)draw();});
new ResizeObserver(()=>{if(S.on)draw();}).observe(view);
// a press anywhere else stops the sequence (the board's own playback does the same, timeline.js); any press that is
// not on the card itself, a chip, a clip, the + button or a menu drops the selection and closes the card (the canvas,
// the panels, the bar, the strip's empty parts alike)
document.addEventListener('pointerdown',e=>{
  if(S.playing&&!e.target.closest('#tlPlay,#tlLoop'))stop();
  if(S.sel&&S.on&&!e.target.closest('#seqView .kpop,#seqView .seq-tr,#seqView .seq-clip,#seqView .seq-add,.menu')){S.sel=null;draw();}
},true);
// the loop toggle of the bar applies to the sequence here
const toggleLoop=()=>{seq().loop=!seq().loop;dirty();draw();};
const SEQ={active,setView,draw,play,stop,seek,key,toggleLoop,playing:()=>S.playing,loop:()=>seq().loop!==false,count:()=>seq().clips.length,time:()=>S.t,parseSeek:t=>{if(Number.isFinite(t))seek(t);}};
export {SEQ};
