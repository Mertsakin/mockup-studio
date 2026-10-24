/* Cloud projects in the studio (io/cloud-projects.js does the work): "Buluta kaydet", opening, the actions on a project
   (rename, duplicate, trash, restore, delete for good, a new project), signing out, the conflict dialog, and the
   account's own actions ("Verini indir", "Hesabı sil"; the account menus in ui/account.js and ui/home.js call them). The list
   itself is the home page (ui/home.js). Signed in only; the menu items stay hidden otherwise. The open document's cloud
   project ({id, version, name} and whose it is) is remembered in the browser, so a reload (the autosave restores the
   document) still saves into the same project. */
import {auth,cloudEnabled,forgetSession,loadProfile,onAuth,signOut} from '../io/cloud.js';
import {countProjects,createProject,deleteAccount,destroyProject,duplicateProject,exportAccount,openProject,projectRow,renameProject,restoreProject,saveProject,trashProject} from '../io/cloud-projects.js';
import {offer} from '../export/export.js';
import {doc,storeActive} from './boards.js';
import {busy,isCancel} from './busy.js';
import {historyReady,isDirty,markSaved,putDoc,resetDocument,takeDoc} from './history.js';
import {go,parse,toLogin} from './router.js';
import {toast} from './toast.js';
import {LOCALE,fmt,t as tx} from '../lang.js';
import {$} from '../util.js';

const KEY='shotlight.cloud.project';
let cur=null;  // {id, version, name, user}
try{cur=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){cur=null;}
function remember(p){cur=p?{id:p.id,version:p.version,name:p.name,user:auth.user&&auth.user.id}:null;
  try{if(cur)localStorage.setItem(KEY,JSON.stringify(cur));else localStorage.removeItem(KEY);}catch(e){/* no storage */}
  showName();}
function showName(){const el=$('#projName');if(cur&&auth.user){el.title=tx('Bulutta: {n}',{n:cur.name});}}
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
// buttons [value, label, primary, danger]; valid(text): the input must satisfy it (the primary button waits for it)
function dialog(title,body,buttons,{role='dialog',cls='',valid=null}={}){
  return new Promise(res=>{
    const sc=document.createElement('div');sc.className='scrim';
    sc.innerHTML='<div class="dialog '+cls+'" role="'+role+'" aria-modal="true" aria-labelledby="pdT"><div class="dh"><span id="pdT"></span></div><div class="db">'+body+
      '<div class="dfoot">'+buttons.map(([v,l,primary,danger])=>'<button class="btn'+(primary?' primary':'')+(danger?' danger':'')+'" type="button" data-a="'+v+'">'+l+'</button>').join('')+'</div></div></div>';
    sc.querySelector('#pdT').textContent=title;document.body.appendChild(sc);
    const inp=sc.querySelector('input'),prim=sc.querySelector('.btn.primary');
    const good=()=>!inp||!!inp.value.trim()&&(!valid||valid(inp.value));
    const done=v=>{sc.remove();document.removeEventListener('keydown',key,true);res(v==null?null:{v,text:inp?inp.value.trim():''});};
    const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(null);}else if(e.key==='Enter'&&inp&&document.activeElement===inp){e.preventDefault();ok();}};
    const ok=()=>{if(!good()){const er=sc.querySelector('.pd-err');er.hidden=false;inp.setAttribute('aria-invalid','true');inp.focus();return;}done(buttons.find(b=>b[2])[0]);};
    document.addEventListener('keydown',key,true);
    if(inp&&valid&&prim)prim.disabled=true;
    if(inp)inp.addEventListener('input',()=>{sc.querySelector('.pd-err').hidden=true;inp.removeAttribute('aria-invalid');if(valid&&prim)prim.disabled=!good();});
    sc.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(e.target===sc){done(null);return;}if(!a)return;
      const b=buttons.find(x=>x[0]===a.dataset.a);if(b&&b[2]&&inp)ok();else done(a.dataset.a);});
    (inp||sc.querySelector('.btn.primary')||sc.querySelector('.btn')).focus();
    if(inp)inp.select();
  });
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
async function askName(title,def,okLabel){
  const r=await dialog(title,'<label class="lbl block" for="pdName">'+tx('Proje adı')+'</label><input type="text" id="pdName" maxlength="120" spellcheck="false" style="width:100%" value="'+esc(def)+'" aria-describedby="pdErr"><p class="pd-err" id="pdErr" role="alert" hidden>'+tx('Bir ad yaz.')+'</p>',
    [['no',tx('Vazgeç')],['ok',okLabel,true]]);
  return r&&r.v==='ok'?r.text:null;
}
const confirmBox=(title,text,okLabel)=>dialog(title,'<p class="pd-text"></p>'.replace('</p>',esc(text)+'</p>'),[['no',tx('Vazgeç')],['ok',okLabel,true]],{role:'alertdialog'}).then(r=>!!r&&r.v==='ok');

// the active board's thumbnail as a small WebP for the list
async function thumbBlob(d){
  const b=d.boards.find(x=>x.id===d.active)||d.boards[0];if(!b||!b.thumb)return null;
  const img=new Image();img.src=b.thumb;await img.decode().catch(()=>{});if(!img.naturalWidth)return null;
  const k=Math.min(1,480/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');
  c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return new Promise(r=>c.toBlob(r,'image/webp',.82));
}
const mb=n=>fmt(n/2**20,n<10*2**20?1:0)+' MB';
const pad=n=>String(n).padStart(2,'0');

// ---------- save
let saving=false;
async function saveToCloud({asNew=false}={}){
  if(!auth.user){toast(tx('Buluta kaydetmek için giriş yap.'));return false;}
  if(saving)return false;
  if(!doc.boards.length){toast(tx('Kaydedilecek bir artboard yok.'));return false;}
  let p=asNew?null:mine();
  if(!p){
    const name=await askName(tx(asNew?'Yeni proje olarak kaydet':'Buluta kaydet'),$('#projName').textContent.replace(/^Mockup stüdyosu$|^Shotlight$|^Adsız proje$|^Untitled project$/,'')||tx('Adsız proje'),tx('Kaydet'));
    if(!name)return false;
    try{p=await createProject(name);}catch(e){toast(e.message);return false;}
  }
  saving=true;
  try{
    storeActive();const d=takeDoc(),thumb=await thumbBlob(d);
    toast(tx('Buluta kaydediliyor…'));
    const v=await saveProject(p,d,thumb,(done,total)=>{if(total>2*2**20)toast(tx('Yükleniyor: {a} / {b}',{a:mb(done),b:mb(total)}));});
    remember(Object.assign({},p,{version:v}));markSaved(p.name);showName();
    {const r=parse();if(r.name==='edit'||(r.name==='project'&&r.id!==p.id))go({name:'project',id:p.id},{replace:true});}  // the open work is this project now: its address
    toast(tx('{p} buluta kaydedildi',{p:p.name}));return true;
  }catch(e){
    if(e.conflict)return resolveConflict(p);
    if(e.gone){remember(null);toast(e.message+' '+tx('Yeni proje olarak kaydedebilirsin.'));return false;}
    toast(e.quota?tx('Depolama alanın doldu (2 GB). Eski projelerden birini sil.'):tx('Kaydedilemedi: {m}',{m:e.message}));return false;
  }finally{saving=false;}
}
// someone (another tab or device) saved this project after we opened it
async function resolveConflict(p){
  const r=await dialog(tx('Proje başka bir yerde değişti'),'<p class="pd-text">'+esc(tx('{p} sen açtıktan sonra başka bir sekmede ya da cihazda kaydedildi. Ne yapalım?',{p:p.name}))+'</p>',
    [['copy',tx('Kopya olarak kaydet')],['open',tx('Bulutakini aç')],['mine',tx('Benimkini kaydet'),true]],{role:'alertdialog'});
  if(!r)return false;
  if(r.v==='open')return openFromCloud(p.id,{force:true});
  if(r.v==='copy'){remember(null);return saveToCloud({asNew:true});}
  // mine: on top of the latest version (it stays in the document history in R2)
  try{const row=await projectRow(p.id);remember(Object.assign({},p,{version:row.version}));}catch(e){toast(e.message);return false;}
  return saveToCloud();
}

// ---------- open
async function openFromCloud(id,{force=false}={}){
  if(!force&&isDirty()&&!(await confirmBox(tx('Projeyi aç'),tx('Açık çalışmada kaydedilmemiş değişiklikler var; açılacak proje onun yerini alır.'),tx('Yine de aç'))))return false;
  try{
    toast(tx('Proje açılıyor…'));
    const {project,doc:d}=await openProject(id,(n,total)=>{if(total>3)toast(tx('Proje açılıyor…')+' '+n+' / '+total);});
    putDoc(d,project.name);remember(project);
    toast(tx('{p} açıldı',{p:project.name}));return true;
  }catch(e){toast(tx('Proje açılamadı: {m}',{m:e.message}));return false;}
}

// ---------- actions on a project ({id, name}); each returns whether something changed
const openId=()=>{const m=mine();return m?m.id:null;};
async function renameAction(p){
  const n=await askName(tx('Yeniden adlandır'),p.name,tx('Kaydet'));if(!n||n===p.name)return false;
  await renameProject(p.id,n);
  if(openId()===p.id){remember(Object.assign({},cur,{name:n}));markSaved(n);}
  toast(tx('Proje yeniden adlandırıldı'));return true;
}
async function duplicateAction(p){toast(tx('Çoğaltılıyor…'));await duplicateProject(p.id);toast(tx('{p} çoğaltıldı',{p:p.name}));return true;}
async function trashAction(p){
  // the open project goes with it: its work closes here too (it would stay as an "Açık çalışma" card otherwise)
  const open=openId()===p.id;
  const text=tx('{p} çöp kutusuna taşınacak; 30 gün içinde geri getirebilirsin.',{p:p.name})+(open?' '+tx(isDirty()?'Açık olduğu için kapanacak; buluta kaydedilmemiş değişiklikler kaybolur.':'Açık olduğu için kapanacak.'):'');
  if(!(await confirmBox(tx('Çöp kutusuna taşı'),text,tx('Taşı'))))return false;
  await trashProject(p.id);
  if(open){await resetDocument();remember(null);}
  toast(tx('{p} çöp kutusuna taşındı',{p:p.name}));return true;
}
// the open work that is not a cloud project (the home page's "Açık çalışma" card): gone for good after asking
async function discardAction(){
  if(!(await confirmBox(tx('Açık çalışmayı sil'),tx('Bu çalışma buluta kaydedilmedi; silinince geri getirilemez.'),tx('Sil'))))return false;
  await resetDocument();remember(null);toast(tx('Açık çalışma silindi'));return true;
}
async function restoreAction(p){await restoreProject(p.id);toast(tx('{p} geri getirildi',{p:p.name}));return true;}
async function destroyAction(p){
  if(!(await confirmBox(tx('Kalıcı olarak sil'),tx('{p} kalıcı olarak silinecek. Bu geri alınamaz.',{p:p.name}),tx('Kalıcı olarak sil'))))return false;
  await destroyProject(p.id);toast(tx('{p} kalıcı olarak silindi',{p:p.name}));return true;
}
// a new, empty document in place of the open one (asks when it has unsaved changes); false when the user declined
async function newProject(){
  if(isDirty()&&!(await confirmBox(tx('Yeni proje'),tx('Açık çalışmada kaydedilmemiş değişiklikler var; yeni proje onun yerini alır.'),tx('Yeni proje'))))return false;
  await resetDocument();remember(null);return true;
}
// signing out: unsaved work asks first, then this browser's work is emptied (it is no one's once signed out)
let leavingNow=false;
const isLeaving=()=>leavingNow;
async function leave(){
  if(isDirty()){
    const r=await dialog(tx('Çıkış yap'),'<p class="pd-text">'+tx('Kaydedilmemiş değişiklikler var. Çıkınca bu tarayıcıdaki çalışma kapanır.')+'</p>',
      [['cancel',tx('Vazgeç')],['discard',tx('Kaydetmeden çık')],['save',tx('Buluta kaydet ve çık'),true]],{role:'alertdialog'});
    if(!r||r.v==='cancel')return false;
    if(r.v==='save'&&!(await saveToCloud()))return false;
  }
  // the sign-in page once this browser's work is emptied (the signed-out event would go there before it is)
  leavingNow=true;
  try{await signOut();await forgetLocal();toLogin();return true;}
  catch(err){leavingNow=false;toast(tx('Çıkış yapılamadı: {m}',{m:err.message}));return false;}
}

// ---------- the account itself (docs/uyelik.md §5, step 5; the privacy note promises both)
// "Verini indir": every cloud project, the trash included, as project files in one ZIP (io/cloud-projects.js
// exportAccount), with the busy card counting the projects; Vazgeç stops it
let exporting=false;
async function downloadDataAction(){
  if(!auth.user||exporting)return false;
  exporting=true;
  const b=busy(tx('Verin hazırlanıyor'),{stage:p=>tx(p==null?'Projeler indiriliyor':'Dosya hazırlanıyor')});
  try{
    const r=await exportAccount((i,n,name)=>b.step(i,n,name));
    if(!r.total){toast(tx('Bulutta kayıtlı projen yok; indirilecek bir şey yok.'));return false;}
    b.progress(1);
    const d=new Date();offer('shotlight-hesap-'+d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'.zip',r.blob);
    toast(tx('{n} proje indirildi',{n:r.count}));return true;
  }catch(e){
    if(!isCancel(e))toast(tx('Verin indirilemedi: {m}',{m:e.message}));return false;
  }finally{b.close();exporting=false;}
}
/* "Hesabı sil": asks with what goes (projects, the space used), confirmed by typing the words; then the Worker removes
   the files, the rows and the user (DELETE /account). Out as on signing out, without the question (there is nothing
   left to save to): the stored session is dropped (the server may refuse the sign-out of a user who is gone), this
   browser's work is emptied, the sign-in page says the account is gone (src/login.js reads the flag). */
async function deleteAccountAction(){
  if(!auth.user)return false;
  let n=null;try{[n]=await Promise.all([countProjects(),loadProfile()]);}catch(e){/* the question still makes sense without the count */}
  const used=auth.profile&&auth.profile.storage_bytes||0;
  const what=n==null?tx('projelerin ve dosyaların'):(n?'<b>'+tx('{n} proje',{n})+'</b>'+(n>1?' '+tx('(çöp kutusundakiler dahil)'):'')+' '+tx('ve bulutta <b>{mb}</b> dosya',{mb:mb(used)}):tx('bulutta hiç projen yok'));
  const word=tx('Hesabı sil');
  const r=await dialog(word,'<p class="pd-text">'+tx('Hesabın kalıcı olarak silinecek: {what}. Bu geri alınamaz; önce verini indirmek istersen Vazgeç\'e bas.',{what})+'</p>'+
    '<label class="lbl block" for="pdConfirm" style="margin-top:12px">'+tx('Onaylamak için <b>{w}</b> yaz',{w:word})+'</label><input type="text" id="pdConfirm" autocomplete="off" spellcheck="false" style="width:100%" aria-describedby="pdErr"><p class="pd-err" id="pdErr" role="alert" hidden>'+tx('Onaylamak için "{w}" yazman gerekiyor.',{w:word})+'</p>',
    [['no',tx('Vazgeç')],['ok',word,true,true]],{role:'alertdialog',valid:t=>t.trim().toLocaleLowerCase(LOCALE)===word.toLocaleLowerCase(LOCALE)});
  if(!r||r.v!=='ok')return false;
  toast(tx('Hesap siliniyor…'));
  leavingNow=true;
  try{await deleteAccount();}
  catch(e){leavingNow=false;toast(e.auth?tx('Oturum kapalı: yeniden giriş yap.'):tx('Hesap silinemedi: {m}',{m:e.message}));return false;}
  try{await signOut();}catch(e){/* the user is gone: the server may refuse */}
  forgetSession();
  await forgetLocal();
  try{sessionStorage.setItem('shotlight.deleted','1');}catch(e){/* no storage */}
  toLogin();return true;
}

saveBtn.addEventListener('click',()=>saveToCloud());

export {isLeaving,deleteAccountAction,destroyAction,discardAction,downloadDataAction,duplicateAction,leave,newProject,openFromCloud,openId,renameAction,restoreAction,saveToCloud,signInHooks,trashAction};
