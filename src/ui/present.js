import {hasVideo} from '../devices/video.js';
import {state} from '../state/state.js';
import {A,anyAnim,onAnim,play,seek,setMode,stop} from './animate.js';
import {activate,doc,hasBoard,onBoards} from './boards.js';
import {showGizmo} from './gizmo.js';
import {icon} from './icons.js';
import {select} from './selection.js';
import {setUi,ui} from './ui-state.js';
import {fitPresent,restoreView,viewState} from './workspace.js';
import {t as tx} from '../lang.js';
import {$} from '../util.js';

/* Presentation (Figma's Present): the active artboard alone fills the window (the browser's fullscreen when it
   allows), with every panel, label and handle hidden (html.present, style.css). An animated artboard (keys, text
   effects, screen videos) plays in a loop. ← / → (or the bar's arrows) move between the artboards, Space pauses,
   Esc leaves. The document does not change: the editor's mode, tool and view are put back on leaving.
   Entry: the ▶ in the top bar, "Sunumda göster" in the artboard menus, ⌥⌘⏎. */
const html=document.documentElement,stage=$('#stagearea');
let on=false,prev=null,bar=null,els=null,idleT=0,paused=false;
const animated=()=>anyAnim()||state.devices.some(hasVideo);
const index=()=>doc.boards.findIndex(b=>b.id===doc.active);
const atEnd=()=>A.t>=state.anim.dur-1e-6;

/* --- the floating bar: previous / name and count / next, play-pause for an animated board, leave */
function build(){
  bar=document.createElement('div');bar.className='present-bar';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label',tx('Sunum'));
  bar.innerHTML='<button class="ib" type="button" data-act="prev" aria-label="'+tx('Önceki artboard')+'">'+icon('alt-arrow-left',18)+'<span class="tip">'+tx('Önceki')+' <kbd>←</kbd></span></button>'+
    '<span class="pb-name"><b data-f="name"></b><span data-f="n"></span></span>'+
    '<button class="ib" type="button" data-act="next" aria-label="'+tx('Sonraki artboard')+'">'+icon('alt-arrow-right',18)+'<span class="tip">'+tx('Sonraki')+' <kbd>→</kbd></span></button>'+
    '<button class="ib" type="button" data-act="play" aria-label="'+tx('Duraklat')+'" hidden><span data-f="play"></span><span class="tip"><span data-f="playTip">'+tx('Duraklat')+'</span> <kbd>'+tx('Boşluk')+'</kbd></span></button>'+
    '<span class="vr"></span><button class="ib" type="button" data-act="exit" aria-label="'+tx('Sunumdan çık')+'">'+icon('close-circle',18)+'<span class="tip">'+tx('Çık')+' <kbd>Esc</kbd></span></button>';
  els={name:bar.querySelector('[data-f="name"]'),n:bar.querySelector('[data-f="n"]'),play:bar.querySelector('[data-act="play"]'),
    playIcon:bar.querySelector('[data-f="play"]'),playTip:bar.querySelector('[data-f="playTip"]'),nav:[...bar.querySelectorAll('[data-act="prev"],[data-act="next"]')]};
  const acts={prev:()=>step(-1),next:()=>step(1),play:togglePlay,exit};
  bar.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b){e.stopPropagation();acts[b.dataset.act]();}});
  stage.appendChild(bar);
}
function sync(){
  if(!on)return;const b=doc.boards[index()];if(!b)return;
  els.name.textContent=b.name;els.n.textContent=doc.boards.length>1?(index()+1)+' / '+doc.boards.length:'';
  els.nav.forEach(x=>{x.disabled=doc.boards.length<2;});
  els.play.hidden=!animated();
  const lbl=A.playing?'Duraklat':'Oynat';
  els.playIcon.innerHTML=icon(A.playing?'pause':'play',18);els.play.setAttribute('aria-label',lbl);els.playTip.textContent=lbl;
}
// the bar fades after a while without pointer movement, and comes back on the next
function wake(){
  if(!bar)return;bar.classList.remove('idle');clearTimeout(idleT);
  idleT=setTimeout(()=>{if(on&&!bar.matches(':hover'))bar.classList.add('idle');else if(on)wake();},2500);
}

/* --- playback: an animated board plays from the start, and again when it ends (whatever its own loop setting) */
function startPlayback(){
  if(!animated())return;
  if(ui.mode!=='animate')setMode('animate');
  paused=false;seek(0);if(!A.playing)play();
}
function togglePlay(){
  if(!animated())return;
  if(A.playing){paused=true;stop();}
  else{if(ui.mode!=='animate')setMode('animate');paused=false;if(atEnd())seek(0);play();}
  sync();
}
onAnim(()=>{
  if(!on)return;sync();
  // the loop: play() has finished its last frame (it schedules nothing more), so a new run can start on the next frame
  if(animated()&&!paused&&!A.playing&&atEnd())requestAnimationFrame(()=>{if(on&&!paused&&!A.playing&&atEnd())startPlayback();});
});

/* --- enter, move, leave */
function present(id){
  if(on){if(id!=null&&id!==doc.active)goto(id);return;}
  if(!hasBoard())return;
  if(id!=null&&id!==doc.active)activate(id);
  prev={mode:ui.mode,tool:ui.tool,view:viewState()};
  select([]);showGizmo(false);setUi({tool:'select',space:false});
  if(!bar)build();bar.hidden=false;
  on=true;paused=false;html.classList.add('present');
  if(html.requestFullscreen)html.requestFullscreen().catch(()=>{});  // refused (no gesture, an iframe): in the window
  fitPresent();  // the class has already taken the panels out of the layout; the window's resizes refit (workspace.js)
  startPlayback();sync();wake();
}
function goto(id){
  if(id===doc.active)return;activate(id);fitPresent();startPlayback();sync();
}
function step(d){const n=doc.boards.length;if(n<2)return;goto(doc.boards[(index()+d+n)%n].id);}
function exit(){
  if(!on)return;on=false;stop();clearTimeout(idleT);html.classList.remove('present');bar.hidden=true;
  if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});
  if(prev.mode!==ui.mode)setMode(prev.mode);
  setUi({tool:prev.tool});restoreView(prev.view);prev=null;
}
const presenting=()=>on;
// the browser left fullscreen (its own Esc, or the user): the presentation ends with it
document.addEventListener('fullscreenchange',()=>{if(on&&!document.fullscreenElement)exit();});
onBoards(()=>{
  const btn=$('#presentBtn');if(btn)btn.disabled=!hasBoard();
  if(!on)return;if(!hasBoard()){exit();return;}sync();
});

/* --- input while presenting: keys go to the presentation alone (⌘S still saves), the canvas takes no pointer */
addEventListener('keydown',e=>{
  if(!on){if((e.metaKey||e.ctrlKey)&&e.altKey&&e.key==='Enter'){e.preventDefault();present();}return;}
  if(e.metaKey||e.ctrlKey){if(e.key.toLowerCase()!=='s')e.stopImmediatePropagation();return;}
  e.preventDefault();e.stopImmediatePropagation();wake();
  if(e.repeat&&!/^Arrow/.test(e.key))return;
  switch(e.key){
    case 'Escape':exit();break;
    case 'ArrowRight':case 'ArrowDown':case 'PageDown':step(1);break;
    case 'ArrowLeft':case 'ArrowUp':case 'PageUp':step(-1);break;
    case 'Home':goto(doc.boards[0].id);break;
    case 'End':goto(doc.boards[doc.boards.length-1].id);break;
    case ' ':togglePlay();break;
  }
},true);
const inBar=e=>!!(bar&&e.target instanceof Node&&bar.contains(e.target));
['pointerdown','pointerup','click','dblclick','contextmenu','wheel'].forEach(t=>addEventListener(t,e=>{
  if(!on||inBar(e))return;e.stopImmediatePropagation();if(t==='contextmenu'||t==='wheel')e.preventDefault();
},{capture:true,passive:false}));
addEventListener('pointermove',()=>{if(on)wake();});
const btn=$('#presentBtn');
if(btn){btn.addEventListener('click',()=>present());btn.disabled=!hasBoard();}

export {exit as exitPresent,present,presenting};
