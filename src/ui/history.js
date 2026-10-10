import {offer} from '../export/export.js';
import {autosave,fromProjectFile,loadAutosave,toProjectFile} from '../io/project.js';
import {applyDoc,changedBoard,doc,docSignature as signature,docSnapshot as snapshot,fillThumbs} from './boards.js';
import {fitAll} from './workspace.js';
const activeId=()=>doc.active;
import {canvas} from '../render/renderer.js';
import {gizmoHelper} from './gizmo.js';
import {toast} from './toast.js';
import {$} from '../util.js';

/* Undo / redo, autosave and project files.
   History watches the scene instead of hooking every control: every POLL ms it takes a snapshot; when the scene
   differs from the last recorded state and has stayed the same for one poll (a drag, slider or animation has
   finished), the previous state goes on the undo stack. So every kind of edit is covered, and dragging a slider is
   one step. A new action (pointer press or key) first records any change still waiting, so quick consecutive edits
   stay separate steps. Each recorded change is also autosaved (IndexedDB) shortly after.
   The recorded state is the whole document (every artboard); undo / redo jump to the board the step changed. */
const POLL=150,MAX=100;
let past=[],future=[],current=null,currentSig='',pending='',saveTimer=0;
const undoBtn=$('#undoBtn'),redoBtn=$('#redoBtn');
const busy=()=>canvas.classList.contains('dragging')||(gizmoHelper.controls&&gizmoHelper.controls.dragging);
function syncButtons(){undoBtn.disabled=!past.length;redoBtn.disabled=!future.length;}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>autosave(current),400);}
function poll(){
  if(!current||busy())return;
  const s=snapshot(),sig=signature(s);
  if(sig===currentSig){pending='';return;}
  if(sig!==pending){pending=sig;return;}   // still changing: wait until it settles
  past.push(current);if(past.length>MAX)past.shift();future=[];
  current=s;currentSig=sig;pending='';syncButtons();scheduleSave();
}
// leaving the page / switching tabs: record and save right away (timers are throttled or stopped from here on)
function flush(){
  if(!current)return;const s=snapshot(),sig=signature(s);
  if(sig!==currentSig){past.push(current);if(past.length>MAX)past.shift();future=[];current=s;currentSig=sig;pending='';syncButtons();}
  clearTimeout(saveTimer);autosave(current);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
window.addEventListener('pagehide',flush);
function commitNow(){
  if(!current||busy())return;const s=snapshot(),sig=signature(s);
  if(sig!==currentSig){past.push(current);if(past.length>MAX)past.shift();future=[];current=s;currentSig=sig;pending='';syncButtons();scheduleSave();}
}
document.addEventListener('pointerdown',commitNow,true);
document.addEventListener('keydown',e=>{if(!/^(Shift|Control|Alt|Meta)$/.test(e.key))commitNow();},true);
function apply(s,from){applyDoc(s,from?changedBoard(from,s)||activeId():null);current=s;currentSig=signature(s);pending='';syncButtons();scheduleSave();}
function undo(){commitNow();if(!past.length)return;const from=current;future.push(current);apply(past.pop(),from);}
function redo(){if(!future.length)return;const from=current;past.push(current);apply(future.pop(),from);}
undoBtn.addEventListener('click',undo);redoBtn.addEventListener('click',redo);
window.addEventListener('keydown',e=>{
  if(!(e.metaKey||e.ctrlKey)||e.altKey)return;
  const t=e.target;if(t&&(t.tagName==='TEXTAREA'||(t.tagName==='INPUT'&&/^(text|url|number|search)$/.test(t.type))))return;  // native text undo
  const k=e.key.toLowerCase();
  if(k==='z'&&!e.shiftKey){e.preventDefault();undo();}
  else if((k==='z'&&e.shiftKey)||k==='y'){e.preventDefault();redo();}
});

// --- project files
const stamp=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return d.getFullYear()+z(d.getMonth()+1)+z(d.getDate())+'-'+z(d.getHours())+z(d.getMinutes());};
$('#saveProject').addEventListener('click',async()=>{
  try{poll();const text=await toProjectFile(current||snapshot());offer('mockup-proje-'+stamp()+'.mockup.json',new Blob([text],{type:'application/json'}));toast('Proje kaydedildi');}
  catch(e){toast('Proje kaydedilemedi: '+(e.message||e));}
});
const openEl=$('#openProject');
$('#openProjectBtn').addEventListener('click',()=>openEl.click());
openEl.addEventListener('change',async()=>{
  const f=openEl.files[0];openEl.value='';if(!f)return;
  try{const s=await fromProjectFile(await f.text());if(current){past.push(current);future=[];}apply(s);fitAll();fillThumbs();toast('Proje açıldı');}
  catch(e){toast('Proje açılamadı: '+(e.message||e));}
});

// Called once after start-up: restores the last session (unless a template was opened) and starts history.
async function startHistory(templateOpened){
  if(!templateOpened){const s=await loadAutosave();if(s&&s.boards.length&&s.boards.some(b=>b.snap&&b.snap.devices)){applyDoc(s);fitAll();await fillThumbs();toast('Son çalışman geri yüklendi');}}
  current=snapshot();currentSig=signature(current);syncButtons();
  setInterval(poll,POLL);
}

// dev / tests: short description of the stacks (device positions)
const historyInfo=()=>{const f=x=>x.boards.map(b=>b.snap.devices.map(d=>d.py.toFixed(1)+'/'+d.px.toFixed(1)).join(' ')).join(' | ');return {past:past.map(f),current:current&&f(current),future:future.map(f)};};

export {historyInfo,redo,startHistory,undo};
