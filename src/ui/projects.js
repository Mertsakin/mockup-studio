/* Cloud projects in the studio (io/cloud-projects.js does the work): "Buluta kaydet", the "Projelerim" dialog (open,
   rename, duplicate, delete, save the current work as a new project) and the conflict dialog. Signed in only; the
   menu items stay hidden otherwise. The open document's cloud project ({id, version, name} and whose it is) is
   remembered in the browser, so a reload (the autosave restores the document) still saves into the same project. */
import {auth,cloudEnabled,onAuth} from '../io/cloud.js';
import {createProject,duplicateProject,listProjects,openProject,projectRow,renameProject,saveProject,thumbURL,trashProject} from '../io/cloud-projects.js';
import {doc,storeActive} from './boards.js';
import {historyReady,isDirty,markSaved,putDoc,resetDocument,takeDoc} from './history.js';
import {icon} from './icons.js';
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
let launched=false;  // the launcher has had its chance for this sign-in (reset on signing out)
if(cloudEnabled)onAuth(async a=>{
  const on=!!a.user;saveBtn.hidden=openBtn.hidden=!on;
  if(!on){launched=false;if(cur)remember(null);return;}
  await historyReady;
  const o=owner();
  if(o&&o!==a.user.id){await resetDocument();remember(null);}
  setOwner(a.user.id);showName();
  // signing in: the projects first when there are any; none: the welcome card (an empty document shows it) or the
  // work already open here. A reload with the session carried over continues with what is open; a template link opens
  // the template.
  if(launched||/[?&]template=/.test(location.search))return;
  launched=true;
  if(!a.fresh)return;
  try{const l=await listProjects();if(l.length)openProjects({launcher:true,list:l});}catch(e){console.warn('Projeler alınamadı:',e);}
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
    const name=await askName(asNew?'Yeni proje olarak kaydet':'Buluta kaydet',$('#projName').textContent.replace(/^Mockup stüdyosu$|^Shotlight$/,'')||'Adsız proje','Kaydet');
    if(!name)return false;
    try{p=await createProject(name);}catch(e){toast(e.message);return false;}
  }
  saving=true;
  try{
    storeActive();const d=takeDoc(),thumb=await thumbBlob(d);
    toast('Buluta kaydediliyor…');
    const v=await saveProject(p,d,thumb,(done,total)=>{if(total>2*2**20)toast('Yükleniyor: '+mb(done)+' / '+mb(total));});
    remember(Object.assign({},p,{version:v}));markSaved(p.name);showName();
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

// ---------- the Projelerim dialog
const ago=t=>{const s=(Date.now()-new Date(t).getTime())/1000;
  if(s<60)return 'az önce';if(s<3600)return Math.floor(s/60)+' dk önce';if(s<86400)return Math.floor(s/3600)+' sa önce';if(s<172800)return 'dün';
  return new Date(t).toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:new Date(t).getFullYear()===new Date().getFullYear()?undefined:'numeric'});};
/* The project list. As a dialog ("Projelerim…"), or as the launcher: full screen, shown when a signed-in user who has
   cloud projects starts the studio (pre-loaded list). Either way the last card starts a new project: the document is
   emptied and the welcome card takes over (asks first when the open work has unsaved changes). */
async function openProjects({launcher=false,list:pre=null}={}){
  if(!auth.user){toast('Projelerin için giriş yap.');return;}
  if(document.getElementById('projectsScrim'))return;
  const sc=document.createElement('div');sc.className='scrim'+(launcher?' launcher':'');sc.id='projectsScrim';
  sc.innerHTML='<div class="dialog projects-dlg'+(launcher?' launcher-dlg':'')+'" role="dialog" aria-modal="true" aria-labelledby="pjT">'+
    '<div class="dh"><span id="pjT">'+(launcher?'Projelerin':'Projelerim')+'</span><button class="ib sm" type="button" data-a="close" aria-label="Kapat">'+icon('close-circle')+'</button></div>'+
    '<div class="db">'+(launcher?'<p class="pj-lead">Kaldığın projeyi aç ya da yeni bir proje başlat.</p>':'')+
    '<div class="pj-bar"><label class="fld pj-search">'+icon('magnifer',14)+'<input type="search" id="pjSearch" placeholder="Projelerde ara" aria-label="Projelerde ara"></label>'+
    (launcher?'':'<button class="btn" type="button" data-a="new">'+icon('cloud-check',14)+'<span>Şu anki çalışmayı yeni proje olarak kaydet</span></button>')+'</div>'+
    '<div class="pj-grid" id="pjGrid" aria-live="polite"><p class="pj-empty">Yükleniyor…</p></div></div></div>';
  document.body.appendChild(sc);
  const grid=sc.querySelector('#pjGrid'),search=sc.querySelector('#pjSearch');
  let list=pre||[];
  const close=()=>{sc.remove();document.removeEventListener('keydown',key,true);};
  const key=e=>{if(e.key==='Escape'&&!document.querySelector('.scrim:not(#projectsScrim):not([hidden])')){e.preventDefault();e.stopPropagation();close();}};
  document.addEventListener('keydown',key,true);
  function draw(){
    const q=search.value.trim().toLocaleLowerCase('tr'),shown=list.filter(p=>!q||p.name.toLocaleLowerCase('tr').includes(q)),open=mine();
    grid.innerHTML='';
    if(!list.length)grid.innerHTML='<p class="pj-empty">Bulutta henüz projen yok. Yeni bir proje başlat ya da şu anki çalışmanı kaydet.</p>';
    else if(!shown.length)grid.innerHTML='<p class="pj-empty">Bu aramayla eşleşen proje yok.</p>';
    for(const p of shown){
      const c=document.createElement('div');c.className='pj-card';c.dataset.id=p.id;
      c.innerHTML='<button class="pj-open" type="button"><span class="pj-thumb">'+icon('gallery-wide',24)+'</span><span class="pj-name"></span><span class="pj-meta"></span></button>'+
        '<div class="pj-acts"><button class="ib sm" type="button" data-a="rename" aria-label="Yeniden adlandır">'+icon('pen-2',14)+'</button>'+
        '<button class="ib sm" type="button" data-a="dup" aria-label="Çoğalt">'+icon('copy',14)+'</button>'+
        '<button class="ib sm" type="button" data-a="del" aria-label="Sil">'+icon('trash-bin-minimalistic',14)+'</button></div>';
      c.querySelector('.pj-name').textContent=p.name;
      c.querySelector('.pj-meta').textContent=(open&&open.id===p.id?'Açık · ':'')+(p.boards||0)+' artboard · '+ago(p.updated_at);
      c.querySelector('.pj-open').setAttribute('aria-label',p.name+' projesini aç');
      grid.appendChild(c);
      thumbURL(p).then(u=>{if(!u)return;const t=c.querySelector('.pj-thumb');t.innerHTML='<img alt="">';t.firstChild.src=u;}).catch(()=>{});
    }
    // the last card: a new project
    const n=document.createElement('button');n.type='button';n.className='pj-new';n.dataset.a='newproj';
    n.innerHTML='<span class="pj-new-ic">'+icon('add-circle',28)+'</span><span class="pj-name">Yeni proje oluştur</span><span class="pj-meta">Boş tuval, şablonlar, site yakalama</span>';
    grid.appendChild(n);
  }
  async function load(){try{list=await listProjects();draw();}catch(e){grid.innerHTML='<p class="pj-empty">Projeler yüklenemedi: '+esc(e.message)+'</p>';}}
  async function newProject(){
    if(isDirty()&&!(await confirmBox('Yeni proje','Açık çalışmada kaydedilmemiş değişiklikler var; yeni proje onun yerini alır.','Yeni proje')))return;
    close();await resetDocument();remember(null);
  }
  search.addEventListener('input',draw);
  sc.addEventListener('click',async e=>{
    if(e.target===sc){close();return;}
    const a=e.target.closest('[data-a]'),card=e.target.closest('.pj-card'),p=card&&list.find(x=>x.id===card.dataset.id);
    if(a&&a.dataset.a==='close'){close();return;}
    if(a&&a.dataset.a==='new'){close();await saveToCloud({asNew:true});return;}
    if(a&&a.dataset.a==='newproj'){await newProject();return;}
    if(!p)return;
    if(!a&&e.target.closest('.pj-open')){close();await openFromCloud(p.id);return;}
    if(!a)return;
    try{
      if(a.dataset.a==='rename'){const n=await askName('Yeniden adlandır',p.name,'Kaydet');if(!n||n===p.name)return;await renameProject(p.id,n);
        if(mine()&&cur.id===p.id){remember(Object.assign({},cur,{name:n}));markSaved(n);}toast('Proje yeniden adlandırıldı');}
      else if(a.dataset.a==='dup'){toast('Çoğaltılıyor…');await duplicateProject(p.id);toast(p.name+' çoğaltıldı');}
      else if(a.dataset.a==='del'){if(!(await confirmBox('Projeyi sil',p.name+' silinecek. Açıksa çalışman bu tarayıcıda kalır.','Sil')))return;
        await trashProject(p.id);if(mine()&&cur.id===p.id)remember(null);toast(p.name+' silindi');}
      await load();
    }catch(er){toast(er.message);}
  });
  if(pre)draw();else await load();
  sc.querySelector('.pj-search').hidden=list.length<7;  // search only when there is something to search
  (sc.querySelector('.pj-open')||sc.querySelector('.pj-new')).focus();
}

saveBtn.addEventListener('click',()=>saveToCloud());
openBtn.addEventListener('click',()=>openProjects());

export {forgetLocal,openProjects,saveToCloud};
