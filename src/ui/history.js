import {offer} from '../export/export.js';
import {autosave,fromProjectFile,loadAutosave,needsZip,toProjectFile} from '../io/project.js';
import {applyDoc,changedBoard,clearAll,doc,docSignature as signature,docSnapshot as snapshot,fillThumbs} from './boards.js';
import {fitAll} from './workspace.js';
const activeId=()=>doc.active;
import {canvas} from '../render/renderer.js';
import {gizmoHelper} from './gizmo.js';
import {toast} from './toast.js';
import {t as tx} from '../lang.js';
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
// held: a multi-step change is under way (the welcome card building its scenes): nothing is recorded or undone
// until it is released, then the result is one step
let held=false;
const holdHistory=on=>{held=!!on;pending='';};
const busy=()=>held||canvas.classList.contains('dragging')||(gizmoHelper.controls&&gizmoHelper.controls.dragging);
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
  if(!current||held)return;const s=snapshot(),sig=signature(s);
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
function undo(){if(held)return;commitNow();if(!past.length)return;const from=current;future.push(current);apply(past.pop(),from);}
function redo(){if(held||!future.length)return;const from=current;past.push(current);apply(future.pop(),from);}
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
/* Two formats (io/project.js): .mockup.json (images inlined) and, once a screen video is in the document, .mockup.zip
   (project.json + media files). A file saved as .json that now needs the zip asks for a new name. */
const FS=typeof window.showSaveFilePicker==='function';
const FILE_TYPES=[{description:'Shotlight projesi',accept:{'application/json':['.json'],'application/zip':['.zip']}}];
const EXT=/\.mockup\.(json|zip)$/i,ZIP=/\.zip$/i;
let fileHandle=null,fileName='',savedSig=null;  // savedSig: the document as last saved to / opened from a file
/* The saved state outlives a reload: a hash of its signature in localStorage, so the work restored after a reload is
   not "unsaved" when it is just what was saved last (a cloud project's address would ask before opening otherwise). */
const SAVED='shotlight.saved';
const sigHash=x=>{let h=2166136261;for(let i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36)+':'+x.length;};
function setSaved(){savedSig=currentSig;try{if(savedSig)localStorage.setItem(SAVED,sigHash(savedSig));else localStorage.removeItem(SAVED);}catch(e){/* no storage */}}
const stamp=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return d.getFullYear()+z(d.getMonth()+1)+z(d.getDate())+'-'+z(d.getHours())+z(d.getMinutes());};
const withExt=(n,zip)=>{n=String(n||'').trim().replace(/[\\/:*?"<>|]+/g,'-');if(!n)return '';const want='.mockup.'+(zip?'zip':'json');
  return n.toLowerCase().endsWith(want)?n:n.replace(EXT,'').replace(/\.(json|zip)$/i,'')+want;};
const suggested=zip=>withExt(fileName||'mockup-proje-'+stamp(),zip);
function setFileName(n){
  fileName=n||'';const el=$('#projName');
  el.textContent=fileName?fileName.replace(EXT,'').replace(/\.(json|zip)$/i,''):tx('Adsız proje');el.title=fileName?fileName+(fileHandle?'':' '+tx('(indirildi)')):'';
}
// the document as a file: {blob, zip}; a change made a moment ago is recorded first
async function projectFile(){commitNow();return toProjectFile(snapshot());}
async function writable(h){
  // a file opened for reading asks once for permission to write (needs the click / ⌘S that started the save)
  if(h.queryPermission&&(await h.queryPermission({mode:'readwrite'}))!=='granted'&&(await h.requestPermission({mode:'readwrite'}))!=='granted')throw new Error(tx('yazma izni verilmedi'));
  return h.createWritable();
}
async function save(as){
  try{
    commitNow();const zip=needsZip(snapshot());
    if(FS){
      // a .json file cannot hold the video: the zip gets a name of its own (a .zip file keeps taking either content)
      if(fileHandle&&zip&&!ZIP.test(fileHandle.name)){toast(tx('Video ya da 3B model içeren proje .mockup.zip olarak kaydedilir: yeni bir ad seç.'));as=true;}
      if(as||!fileHandle){
        let h;try{h=await window.showSaveFilePicker({suggestedName:suggested(zip),types:FILE_TYPES});}
        catch(e){if(e&&e.name==='AbortError')return false;throw e;}
        fileHandle=h;
      }
      const {blob}=await projectFile(),w=await writable(fileHandle);await w.write(blob);await w.close();
      setFileName(fileHandle.name);setSaved();toast(fileHandle.name+' kaydedildi');return true;
    } else {
      const name=withExt(await askName(suggested(zip)),zip);if(!name)return false;
      const {blob}=await projectFile();offer(name,blob);
      setFileName(name);setSaved();toast(name+' indirildi');return true;
    }
  }catch(e){toast(tx('Proje kaydedilemedi: {m}',{m:e.message||e}));return false;}
}
// fallback name dialog (browsers without the save dialog API)
function askName(def){
  return new Promise(res=>{
    const sc=document.createElement('div');sc.className='scrim';
    sc.innerHTML='<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="saveTitle"><div class="dh"><span id="saveTitle">'+tx('Projeyi kaydet')+'</span></div>'+
      '<div class="db"><label class="lbl block" for="saveName">'+tx('Dosya adı')+'</label><input type="text" id="saveName" spellcheck="false" style="width:100%">'+
      '<p class="hint-sm">'+tx('Dosya, tarayıcının indirme klasörüne kaydedilir.')+'</p><div class="dfoot"><button class="btn" type="button" data-a="no">'+tx('Vazgeç')+'</button><button class="btn primary" type="button" data-a="ok">'+tx('Kaydet')+'</button></div></div></div>';
    document.body.appendChild(sc);const inp=sc.querySelector('#saveName');inp.value=def;inp.focus();inp.setSelectionRange(0,def.replace(EXT,'').length);
    const done=v=>{sc.remove();res(v);};
    sc.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(a)done(a.dataset.a==='ok'?inp.value:null);else if(e.target===sc)done(null);});
    sc.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')done(inp.value);else if(e.key==='Escape')done(null);});
  });
}
$('#saveProject').addEventListener('click',()=>save(false));
$('#saveProjectAs').addEventListener('click',()=>save(true));
// file: a File / Blob (.mockup.json or .mockup.zip) or the JSON text
async function openText(file,handle,name){
  const s=await fromProjectFile(file);if(current){past.push(current);future=[];}apply(s);fitAll();fillThumbs();
  fileHandle=handle||null;setFileName(name);setSaved();toast(tx('{p} açıldı',{p:name||tx('Proje')}));
}
const openEl=$('#openProject');
$('#openProjectBtn').addEventListener('click',async()=>{
  if(typeof window.showOpenFilePicker!=='function'){openEl.click();return;}
  try{
    let h;try{[h]=await window.showOpenFilePicker({types:FILE_TYPES,multiple:false});}catch(e){if(e&&e.name==='AbortError')return;throw e;}
    const f=await h.getFile();await openText(f,h,h.name);
  }catch(e){toast(tx('Proje açılamadı: {m}',{m:e.message||e}));}
});
openEl.addEventListener('change',async()=>{
  const f=openEl.files[0];openEl.value='';if(!f)return;
  try{await openText(f,null,f.name);}catch(e){toast(tx('Proje açılamadı: {m}',{m:e.message||e}));}
});

/* Close the project: an empty document (no artboards, no assets), no current file, the autosave emptied, history
   reset. Unsaved changes (never saved, or changed since the last save / open) ask first: save, discard or cancel. */
function askClose(){
  return new Promise(res=>{
    const sc=document.createElement('div');sc.className='scrim';
    sc.innerHTML='<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="closeTitle"><div class="dh"><span id="closeTitle">'+tx('Projeyi kapat')+'</span></div>'+
      '<div class="db"><p style="margin:0">'+tx('Kaydedilmemiş değişiklikler var. Kapatmadan önce kaydetmek ister misin?')+'</p>'+
      '<div class="dfoot"><button class="btn" type="button" data-a="cancel">'+tx('Vazgeç')+'</button><button class="btn" type="button" data-a="discard">'+tx('Kaydetme')+'</button><button class="btn primary" type="button" data-a="save">'+tx('Kaydet')+'</button></div></div></div>';
    document.body.appendChild(sc);sc.querySelector('[data-a="save"]').focus();
    const done=v=>{sc.remove();res(v);};
    sc.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(a)done(a.dataset.a);else if(e.target===sc)done('cancel');});
    sc.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')done('cancel');});
  });
}
async function closeProject(){
  commitNow();
  const empty=!doc.boards.length&&!doc.assets.length;
  if(!empty&&currentSig!==savedSig){
    const a=await askClose();
    if(a==='cancel')return;
    if(a==='save'&&!(await save(false)))return;
  }
  resetDocument();
  toast(tx('Proje kapatıldı'));
  closeHooks.forEach(f=>f());
}
const closeHooks=new Set();  // fn() after "Projeyi kapat" (the home page opens: ui/home.js)
// an empty document, no file, history and autosave emptied (closing a project; signing out, ui/account.js)
function resetDocument(){
  doc.assets=[];doc.fonts=[];clearAll();
  past=[];future=[];current=snapshot();currentSig=signature(current);pending='';setSaved();syncButtons();
  fileHandle=null;setFileName('');clearTimeout(saveTimer);return autosave(current);
}
$('#closeProject').addEventListener('click',closeProject);

// Called once after start-up: restores the last session (unless a template was opened) and starts history.
// Nothing saved (or the last session had no artboards): the document starts empty, with no artboard.
// The page stays hidden (html.booting) until this is settled, so the default scene never flashes.
let readyResolve;
const historyReady=new Promise(r=>{readyResolve=r;});  // the last session is restored (or found empty)
async function startHistory(templateOpened){
  try{
    if(!templateOpened){
      const s=await loadAutosave();
      if(s&&s.boards.length){applyDoc(s);fitAll();await fillThumbs();toast(tx('Son çalışman geri yüklendi'));}
      else clearAll();
    }
  }finally{document.documentElement.classList.remove('booting');}
  current=snapshot();currentSig=signature(current);syncButtons();
  try{if(currentSig&&localStorage.getItem(SAVED)===sigHash(currentSig))savedSig=currentSig;}catch(e){/* no storage */}
  setInterval(poll,POLL);readyResolve();
}

// dev / tests: short description of the stacks (device positions)
const historyInfo=()=>{const f=x=>x.boards.map(b=>b.snap.devices.map(d=>d.py.toFixed(1)+'/'+d.px.toFixed(1)).join(' ')).join(' | ');return {past:past.map(f),current:current&&f(current),future:future.map(f)};};

/* For the cloud projects (ui/projects.js): the document as it is now (a change made a moment ago recorded first);
   put a document in place of the current one (one undo step, like opening a file); mark the current state as saved
   under a name (the top bar shows it; no file handle: a cloud project is not a file); unsaved changes since then? */
function takeDoc(){commitNow();return snapshot();}
function putDoc(s,name){if(current){past.push(current);future=[];}apply(s);fitAll();fillThumbs();fileHandle=null;setFileName(name);setSaved();}
function markSaved(name){fileHandle=null;setFileName(name);setSaved();}
const isDirty=()=>{commitNow();return !!current&&!!(doc.boards.length||doc.assets.length)&&currentSig!==savedSig;};

export {closeHooks,historyInfo,historyReady,holdHistory,isDirty,markSaved,putDoc,redo,resetDocument,startHistory,takeDoc,undo};
