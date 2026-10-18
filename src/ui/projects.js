/* Cloud projects in the studio (io/cloud-projects.js does the work): "Buluta kaydet", opening, the actions on a project
   (rename, duplicate, trash, restore, delete for good, a new project), signing out, and the conflict dialog. The list
   itself is the home page (ui/home.js). Signed in only; the menu items stay hidden otherwise. The open document's cloud
   project ({id, version, name} and whose it is) is remembered in the browser, so a reload (the autosave restores the
   document) still saves into the same project. */
import {auth,cloudEnabled,onAuth,signOut} from '../io/cloud.js';
import {createProject,destroyProject,duplicateProject,openProject,projectRow,renameProject,restoreProject,saveProject,trashProject} from '../io/cloud-projects.js';
import {doc,storeActive} from './boards.js';
import {historyReady,isDirty,markSaved,putDoc,resetDocument,takeDoc} from './history.js';
import {go,parse,toLogin} from './router.js';
import {toast} from './toast.js';
import {$} from '../util.js';

const KEY='shotlight.cloud.project';
let cur=null;  // {id, version, name, user}
try{cur=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){cur=null;}
function remember(p){cur=p?{id:p.id,version:p.version,name:p.name,user:auth.user&&auth.user.id}:null;
  try{if(cur)localStorage.setItem(KEY,JSON.stringify(cur));else localStorage.removeItem(KEY);}catch(e){/* no storage */}
  showName();}
function showName(){const el=$('#projName');if(cur&&auth.user){el.title='Bulutta: '+cur.name;}}
const mine=()=>cur&&auth.user&&cur.user===auth.user.id?cur:null;

const saveBtn=$('#cloudSaveBtn'),openBtn=$('#cloudOpenBtn');
/* The work in this browser (the autosave) belongs to whoever signed in with it: signing in as someone else empties it
   first, so a shared computer never shows one person's work to the next (signing out empties it too: ui/account.js).
   Work from before accounts (no owner yet) goes to the first one who signs in. */
const OWNER='shotlight.local.owner';
const owner=()=>{try{return localStorage.getItem(OWNER);}catch(e){return null;}};
const setOwner=id=>{try{if(id)localStorage.setItem(OWNER,id);else localStorage.removeItem(OWNER);}catch(e){/* no storage */}};
// fn() once a user has just signed in (not on a reload with the session carried over): the home page opens (ui/home.js)
const signInHooks=new Set();
let launched=false;  // the sign-in hooks have run for this sign-in (reset on signing out)
if(cloudEnabled)onAuth(async a=>{
  const on=!!a.user;saveBtn.hidden=openBtn.hidden=!on;
  if(!on){launched=false;if(cur)remember(null);return;}
  await historyReady;
  const o=owner();
  if(o&&o!==a.user.id){await resetDocument();remember(null);}
  setOwner(a.user.id);showName();
  // signing in lands on the home page; a reload with the session carried over continues with what is open; a template
  // link opens the template
  if(launched||/[?&]template=/.test(location.search))return;
  launched=true;
  if(a.fresh)signInHooks.forEach(f=>f());
});
// signing out: the document and the autosave are emptied, the work is no longer anyone's here
async function forgetLocal(){await resetDocument();remember(null);setOwner(null);}

// ---------- small dialogs
function dialog(title,body,buttons,{role='dialog',cls=''}={}){
  return new Promise(res=>{
    const sc=document.createElement('div');sc.className='scrim';
    sc.innerHTML='<div class="dialog '+cls+'" role="'+role+'" aria-modal="true" aria-labelledby="pdT"><div class="dh"><span id="pdT"></span></div><div class="db">'+body+
      '<div class="dfoot">'+buttons.map(([v,l,primary])=>'<button class="btn'+(primary?' primary':'')+'" type="button" data-a="'+v+'">'+l+'</button>').join('')+'</div></div></div>';
    sc.querySelector('#pdT').textContent=title;document.body.appendChild(sc);
    const inp=sc.querySelector('input');
    const done=v=>{sc.remove();document.removeEventListener('keydown',key,true);res(v==null?null:{v,text:inp?inp.value.trim():''});};
    const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(null);}else if(e.key==='Enter'&&inp&&document.activeElement===inp){e.preventDefault();ok();}};
    const ok=()=>{if(inp&&!inp.value.trim()){const er=sc.querySelector('.pd-err');er.hidden=false;inp.setAttribute('aria-invalid','true');inp.focus();return;}done(buttons.find(b=>b[2])[0]);};
    document.addEventListener('keydown',key,true);
    if(inp)inp.addEventListener('input',()=>{sc.querySelector('.pd-err').hidden=true;inp.removeAttribute('aria-invalid');});
    sc.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(e.target===sc){done(null);return;}if(!a)return;
      const b=buttons.find(x=>x[0]===a.dataset.a);if(b&&b[2]&&inp)ok();else done(a.dataset.a);});
    (inp||sc.querySelector('.btn.primary')||sc.querySelector('.btn')).focus();
    if(inp)inp.select();
  });
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
async function askName(title,def,okLabel){
  const r=await dialog(title,'<label class="lbl block" for="pdName">Proje adı</label><input type="text" id="pdName" maxlength="120" spellcheck="false" style="width:100%" value="'+esc(def)+'" aria-describedby="pdErr"><p class="pd-err" id="pdErr" role="alert" hidden>Bir ad yaz.</p>',
    [['no','Vazgeç'],['ok',okLabel,true]]);
  return r&&r.v==='ok'?r.text:null;
}
const confirmBox=(title,text,okLabel)=>dialog(title,'<p class="pd-text"></p>'.replace('</p>',esc(text)+'</p>'),[['no','Vazgeç'],['ok',okLabel,true]],{role:'alertdialog'}).then(r=>!!r&&r.v==='ok');

// the active board's thumbnail as a small WebP for the list
async function thumbBlob(d){
  const b=d.boards.find(x=>x.id===d.active)||d.boards[0];if(!b||!b.thumb)return null;
  const img=new Image();img.src=b.thumb;await img.decode().catch(()=>{});if(!img.naturalWidth)return null;
  const k=Math.min(1,480/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');
  c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return new Promise(r=>c.toBlob(r,'image/webp',.82));
}
const mb=n=>(n/2**20).toFixed(n<10*2**20?1:0).replace('.',',')+' MB';

// ---------- save
let saving=false;
async function saveToCloud({asNew=false}={}){
  if(!auth.user){toast('Buluta kaydetmek için giriş yap.');return false;}
  if(saving)return false;
  if(!doc.boards.length){toast('Kaydedilecek bir artboard yok.');return false;}
  let p=asNew?null:mine();
  if(!p){
    const name=await askName(asNew?'Yeni proje olarak kaydet':'Buluta kaydet',$('#projName').textContent.replace(/^Mockup stüdyosu$|^Shotlight$|^Adsız proje$/,'')||'Adsız proje','Kaydet');
    if(!name)return false;
    try{p=await createProject(name);}catch(e){toast(e.message);return false;}
  }
  saving=true;
  try{
    storeActive();const d=takeDoc(),thumb=await thumbBlob(d);
    toast('Buluta kaydediliyor…');
    const v=await saveProject(p,d,thumb,(done,total)=>{if(total>2*2**20)toast('Yükleniyor: '+mb(done)+' / '+mb(total));});
    remember(Object.assign({},p,{version:v}));markSaved(p.name);showName();
    {const r=parse();if(r.name==='edit'||(r.name==='project'&&r.id!==p.id))go({name:'project',id:p.id},{replace:true});}  // the open work is this project now: its address
    toast(p.name+' buluta kaydedildi');return true;
  }catch(e){
    if(e.conflict)return resolveConflict(p);
    if(e.gone){remember(null);toast(e.message+' Yeni proje olarak kaydedebilirsin.');return false;}
    toast(e.quota?'Depolama alanın doldu (2 GB). Eski projelerden birini sil.':'Kaydedilemedi: '+e.message);return false;
  }finally{saving=false;}
}
// someone (another tab or device) saved this project after we opened it
async function resolveConflict(p){
  const r=await dialog('Proje başka bir yerde değişti','<p class="pd-text">'+esc(p.name)+' sen açtıktan sonra başka bir sekmede ya da cihazda kaydedildi. Ne yapalım?</p>',
    [['copy','Kopya olarak kaydet'],['open','Bulutakini aç'],['mine','Benimkini kaydet',true]],{role:'alertdialog'});
  if(!r)return false;
  if(r.v==='open')return openFromCloud(p.id,{force:true});
  if(r.v==='copy'){remember(null);return saveToCloud({asNew:true});}
  // mine: on top of the latest version (it stays in the document history in R2)
  try{const row=await projectRow(p.id);remember(Object.assign({},p,{version:row.version}));}catch(e){toast(e.message);return false;}
  return saveToCloud();
}

// ---------- open
async function openFromCloud(id,{force=false}={}){
  if(!force&&isDirty()&&!(await confirmBox('Projeyi aç','Açık çalışmada kaydedilmemiş değişiklikler var; açılacak proje onun yerini alır.','Yine de aç')))return false;
  try{
    toast('Proje açılıyor…');
    const {project,doc:d}=await openProject(id,(n,total)=>{if(total>3)toast('Proje açılıyor… '+n+' / '+total);});
    putDoc(d,project.name);remember(project);
    toast(project.name+' açıldı');return true;
  }catch(e){toast('Proje açılamadı: '+e.message);return false;}
}

// ---------- actions on a project ({id, name}); each returns whether something changed
const openId=()=>{const m=mine();return m?m.id:null;};
async function renameAction(p){
  const n=await askName('Yeniden adlandır',p.name,'Kaydet');if(!n||n===p.name)return false;
  await renameProject(p.id,n);
  if(openId()===p.id){remember(Object.assign({},cur,{name:n}));markSaved(n);}
  toast('Proje yeniden adlandırıldı');return true;
}
async function duplicateAction(p){toast('Çoğaltılıyor…');await duplicateProject(p.id);toast(p.name+' çoğaltıldı');return true;}
async function trashAction(p){
  if(!(await confirmBox('Çöp kutusuna taşı',p.name+' çöp kutusuna taşınacak; 30 gün içinde geri getirebilirsin. Açıksa çalışman bu tarayıcıda kalır.','Taşı')))return false;
  await trashProject(p.id);if(openId()===p.id)remember(null);toast(p.name+' çöp kutusuna taşındı');return true;
}
async function restoreAction(p){await restoreProject(p.id);toast(p.name+' geri getirildi');return true;}
async function destroyAction(p){
  if(!(await confirmBox('Kalıcı olarak sil',p.name+' kalıcı olarak silinecek. Bu geri alınamaz.','Kalıcı olarak sil')))return false;
  await destroyProject(p.id);toast(p.name+' kalıcı olarak silindi');return true;
}
// a new, empty document in place of the open one (asks when it has unsaved changes); false when the user declined
async function newProject(){
  if(isDirty()&&!(await confirmBox('Yeni proje','Açık çalışmada kaydedilmemiş değişiklikler var; yeni proje onun yerini alır.','Yeni proje')))return false;
  await resetDocument();remember(null);return true;
}
// signing out: unsaved work asks first, then this browser's work is emptied (it is no one's once signed out)
let leavingNow=false;
const isLeaving=()=>leavingNow;
async function leave(){
  if(isDirty()){
    const r=await dialog('Çıkış yap','<p class="pd-text">Kaydedilmemiş değişiklikler var. Çıkınca bu tarayıcıdaki çalışma kapanır.</p>',
      [['cancel','Vazgeç'],['discard','Kaydetmeden çık'],['save','Buluta kaydet ve çık',true]],{role:'alertdialog'});
    if(!r||r.v==='cancel')return false;
    if(r.v==='save'&&!(await saveToCloud()))return false;
  }
  // the sign-in page once this browser's work is emptied (the signed-out event would go there before it is)
  leavingNow=true;
  try{await signOut();await forgetLocal();toLogin();return true;}
  catch(err){leavingNow=false;toast('Çıkış yapılamadı: '+err.message);return false;}
}

saveBtn.addEventListener('click',()=>saveToCloud());

export {isLeaving,destroyAction,duplicateAction,leave,newProject,openFromCloud,openId,renameAction,restoreAction,saveToCloud,signInHooks,trashAction};
