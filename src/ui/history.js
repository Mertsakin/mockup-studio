import {offer} from '../export/export.js';
import {autosave,fromProjectFile,loadAutosave,toProjectFile} from '../io/project.js';
import {applyDoc,changedBoard,clearAll,doc,docSignature as signature,docSnapshot as snapshot,fillThumbs} from './boards.js';
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
/* Chrome / Edge: the system save / open dialogs (File System Access API) pick the folder and the name, and the file
   is remembered: ⌘S saves over it, "Farklı kaydet…" (⇧⌘S) asks again, "Proje aç…" makes the opened file the current
   one. Elsewhere a small dialog asks for the name and the browser downloads the file. The top bar shows the name. */
const FS=typeof window.showSaveFilePicker==='function';
const FILE_TYPES=[{description:'Mockup stüdyosu projesi',accept:{'application/json':['.json']}}];
const EXT=/\.mockup\.json$/i;
let fileHandle=null,fileName='';
const stamp=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return d.getFullYear()+z(d.getMonth()+1)+z(d.getDate())+'-'+z(d.getHours())+z(d.getMinutes());};
const withExt=n=>{n=String(n||'').trim().replace(/[\\/:*?"<>|]+/g,'-');if(!n)return '';return EXT.test(n)?n:n.replace(/\.json$/i,'')+'.mockup.json';};
const suggested=()=>fileName||'mockup-proje-'+stamp()+'.mockup.json';
function setFileName(n){
  fileName=n||'';const el=$('#projName');
  el.textContent=fileName?fileName.replace(EXT,'').replace(/\.json$/i,''):'Mockup stüdyosu';el.title=fileName?fileName+(fileHandle?'':' (indirildi)'):'';
}
async function projectText(){commitNow();return toProjectFile(snapshot());}  // a change made a moment ago is recorded first
async function writable(h){
  // a file opened for reading asks once for permission to write (needs the click / ⌘S that started the save)
  if(h.queryPermission&&(await h.queryPermission({mode:'readwrite'}))!=='granted'&&(await h.requestPermission({mode:'readwrite'}))!=='granted')throw new Error('yazma izni verilmedi');
  return h.createWritable();
}
async function save(as){
  try{
    if(FS){
      if(as||!fileHandle){
        let h;try{h=await window.showSaveFilePicker({suggestedName:suggested(),types:FILE_TYPES});}
        catch(e){if(e&&e.name==='AbortError')return;throw e;}
        fileHandle=h;
      }
      const text=await projectText(),w=await writable(fileHandle);await w.write(text);await w.close();
      setFileName(fileHandle.name);toast(fileHandle.name+' kaydedildi');
    } else {
      const name=withExt(await askName(suggested()));if(!name)return;
      const text=await projectText();offer(name,new Blob([text],{type:'application/json'}));
      setFileName(name);toast(name+' indirildi');
    }
  }catch(e){toast('Proje kaydedilemedi: '+(e.message||e));}
}
// fallback name dialog (browsers without the save dialog API)
function askName(def){
  return new Promise(res=>{
    const sc=document.createElement('div');sc.className='scrim';
    sc.innerHTML='<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="saveTitle"><div class="dh"><span id="saveTitle">Projeyi kaydet</span></div>'+
      '<div class="db"><label class="lbl block" for="saveName">Dosya adı</label><input type="text" id="saveName" spellcheck="false" style="width:100%">'+
      '<p class="hint-sm">Dosya, tarayıcının indirme klasörüne kaydedilir.</p><div class="dfoot"><button class="btn" type="button" data-a="no">Vazgeç</button><button class="btn primary" type="button" data-a="ok">Kaydet</button></div></div></div>';
    document.body.appendChild(sc);const inp=sc.querySelector('#saveName');inp.value=def;inp.focus();inp.setSelectionRange(0,def.replace(EXT,'').length);
    const done=v=>{sc.remove();res(v);};
    sc.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(a)done(a.dataset.a==='ok'?inp.value:null);else if(e.target===sc)done(null);});
    sc.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')done(inp.value);else if(e.key==='Escape')done(null);});
  });
}
$('#saveProject').addEventListener('click',()=>save(false));
$('#saveProjectAs').addEventListener('click',()=>save(true));
async function openText(text,handle,name){
  const s=await fromProjectFile(text);if(current){past.push(current);future=[];}apply(s);fitAll();fillThumbs();
  fileHandle=handle||null;setFileName(name);toast((name||'Proje')+' açıldı');
}
const openEl=$('#openProject');
$('#openProjectBtn').addEventListener('click',async()=>{
  if(typeof window.showOpenFilePicker!=='function'){openEl.click();return;}
  try{
    let h;try{[h]=await window.showOpenFilePicker({types:FILE_TYPES,multiple:false});}catch(e){if(e&&e.name==='AbortError')return;throw e;}
    const f=await h.getFile();await openText(await f.text(),h,h.name);
  }catch(e){toast('Proje açılamadı: '+(e.message||e));}
});
openEl.addEventListener('change',async()=>{
  const f=openEl.files[0];openEl.value='';if(!f)return;
  try{await openText(await f.text(),null,f.name);}catch(e){toast('Proje açılamadı: '+(e.message||e));}
});

// Called once after start-up: restores the last session (unless a template was opened) and starts history.
// Nothing saved (or the last session had no artboards): the document starts empty, with no artboard.
// The page stays hidden (html.booting) until this is settled, so the default scene never flashes.
async function startHistory(templateOpened){
  try{
    if(!templateOpened){
      const s=await loadAutosave();
      if(s&&s.boards.length){applyDoc(s);fitAll();await fillThumbs();toast('Son çalışman geri yüklendi');}
      else clearAll();
    }
  }finally{document.documentElement.classList.remove('booting');}
  current=snapshot();currentSig=signature(current);syncButtons();
  setInterval(poll,POLL);
}

// dev / tests: short description of the stacks (device positions)
const historyInfo=()=>{const f=x=>x.boards.map(b=>b.snap.devices.map(d=>d.py.toFixed(1)+'/'+d.px.toFixed(1)).join(' ')).join(' | ');return {past:past.map(f),current:current&&f(current),future:future.map(f)};};

export {historyInfo,redo,startHistory,undo};
