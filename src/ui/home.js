/* The home page (design: wireframes/home.html, after Figma's file browser): where a signed-in user lands on signing
   in, and where the editor's "Ana sayfa" goes back to. A full-screen layer over the editor (the editor behind is inert).
     sidebar   the account (theme, shortcuts, signing out), search, Son kullanılanlar / Projelerim / Şablonlar /
               Çöp kutusu, the storage used
     top bar   back / forward between views; "Projeye dön" while a document is open; the goals on the right
               (Açılış görseli, Sosyal, Mağaza seti, Video: each starts a new, empty project and opens the welcome card
               with that goal, i.e. the address field and the drop area; the store set opens its form) and Diğer
               (blank canvas, capture a site, open a project file, every template)
     content   recommended templates (a big "Bir şablonla başla" panel for an account without projects), then the
               projects as a grid or a list (sorted by last edit, name or creation); the trash with restore and delete
               for good. The work open in the editor that is not (yet) a cloud project shows as the first card,
               "Açık çalışma", so the way back to it is always there (Esc too)
   The data is the user's cloud projects (io/cloud-projects.js); the actions are ui/projects.js's. Opening a project or
   starting one goes to the editor. */
import {auth,cloudEnabled,onAuth} from '../io/cloud.js';
import {listProjects,listTrash,thumbURL} from '../io/cloud-projects.js';
import {activate,clearAll,doc,fillThumbs,storeActive} from './boards.js';
import {holdHistory} from './history.js';
import {icon} from './icons.js';
import {destroyAction,duplicateAction,leave,newProject,openFromCloud,openId,renameAction,restoreAction,signInHooks,trashAction} from './projects.js';
import {openTemplate,templates} from './template-gallery.js';
import {toast} from './toast.js';
import {closeWelcomeModal,openWelcome} from './welcome.js';
import {openStoreDialog} from './store.js';
import {closeHooks} from './history.js';
import {setUi} from './ui-state.js';
import {fitAll} from './workspace.js';
import {$} from '../util.js';

const GOALS=[['land','Açılış görseli','gallery-wide','g1'],['social','Sosyal','heart','g2'],['store','Mağaza seti','smartphone','g3'],['video','Video','play','g4']];
const TITLES={recent:'Son kullanılanlar',all:'Projelerim',templates:'Şablonlar',trash:'Çöp kutusu'};
const KEY='shotlight.home';
let prefs={layout:'grid',sort:'edited',recClosed:false};
try{Object.assign(prefs,JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(e){/* defaults */}
const savePrefs=()=>{try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(e){/* no storage */}};

let el=null,view='recent',past=[],ahead=[],projects=null,trash=null,tpls=[],mixed=[],recShift=0,q='';
// the recommendations take the goals in turn (the set lists them goal by goal: a row of five store sets otherwise)
const interleave=l=>{const by={};l.forEach(t=>(by[t.goal]=by[t.goal]||[]).push(t));const out=[],qs=Object.values(by);for(let i=0;out.length<l.length;i++)qs.forEach(q=>{if(q[i])out.push(q[i]);});return out;};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const ago=t=>{const s=(Date.now()-new Date(t).getTime())/1000;
  if(s<60)return 'az önce';if(s<3600)return Math.floor(s/60)+' dakika önce';if(s<86400)return Math.floor(s/3600)+' saat önce';if(s<172800)return 'dün';
  if(s<604800)return Math.floor(s/86400)+' gün önce';
  return new Date(t).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:new Date(t).getFullYear()===new Date().getFullYear()?undefined:'numeric'});};
const mb=n=>n<2**30?(n/2**20).toFixed(n<10*2**20?1:0).replace('.',',')+' MB':(n/2**30).toFixed(1).replace('.',',')+' GB';
const shown=()=>!!el;

// ---------- showing and hiding
function shut(on){for(const c of document.body.children)if(c!==el&&c.id!=='toast'&&!c.classList.contains('scrim')&&!c.classList.contains('hm-menu')&&!c.classList.contains('wl-modal'))c.inert=on;}
async function showHome(v){
  if(!auth.user)return;
  if(!el){
    el=document.createElement('div');el.id='home';el.className='hm';el.setAttribute('role','region');el.setAttribute('aria-label','Ana sayfa');
    document.body.appendChild(el);document.documentElement.classList.add('home-on');shut(true);
    el.addEventListener('click',onClick);el.addEventListener('input',onInput);el.addEventListener('keydown',onKey);
  }
  past=[];ahead=[];view=v||'recent';
  if(doc.boards.length)storeActive();  // a fresh thumbnail of the open work for its card
  frame();el.querySelector('.hm-nav[data-view="'+view+'"]').focus({preventScroll:true});await load();
}
function hideHome(){if(!el)return;closeMenu();el.remove();el=null;document.documentElement.classList.remove('home-on');shut(false);}
async function load(){
  projects=null;draw();
  try{[projects,tpls]=await Promise.all([listProjects(),templates()]);mixed=interleave(tpls);}catch(e){projects=[];toast('Projeler alınamadı: '+e.message);}
  if(view==='trash')await loadTrash();
  draw();
}
async function loadTrash(){try{trash=await listTrash();}catch(e){trash=[];toast(e.message);}}
function go(v,{push=true}={}){if(v===view)return;if(push){past.push(view);ahead=[];}view=v;q='';const s=el.querySelector('#hmQ');if(s)s.value='';
  if(v==='trash'){trash=null;draw();loadTrash().then(draw);}else draw();}

// ---------- the frame: sidebar and top bar (drawn once per showing; the content redraws)
function frame(){
  const p=auth.profile||{},name=p.name||(auth.user.email||'').split('@')[0],ini=name.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  const used=p.storage_bytes||0,cap=2*2**30;
  el.innerHTML='<aside class="hm-side" aria-label="Gezinme">'+
      '<button class="hm-me" type="button" data-a="me" aria-haspopup="menu"><span class="hm-av">'+(p.avatar_url?'<img alt="" referrerpolicy="no-referrer">':esc(ini))+'</span>'+
        '<span class="hm-mt"><b>'+esc(name)+'</b><span>Beta · ücretsiz</span></span>'+icon('alt-arrow-down',14)+'</button>'+
      '<label class="hm-search">'+icon('magnifer',14)+'<input type="search" id="hmQ" placeholder="Ara" aria-label="Projelerde ve şablonlarda ara"></label>'+
      ['recent:clock-circle','all:folder','templates:widget','trash:trash-bin-minimalistic'].map(x=>{const [v,ic]=x.split(':');
        return '<button class="hm-nav" type="button" data-view="'+v+'">'+icon(ic,16)+'<span>'+TITLES[v]+'</span><span class="hm-n" data-count="'+v+'"></span></button>';}).join('')+
      '<span class="hm-grow"></span>'+
      '<div class="hm-store"><b>Depolama</b><div class="hm-bar"><i style="width:'+Math.min(100,used/cap*100).toFixed(1)+'%"></i></div><span>'+mb(used)+' / 2 GB kullanılıyor</span></div>'+
      '<div class="hm-brand"><img src="favicon.svg" alt="" width="16" height="16">Shotlight · beta</div>'+
    '</aside>'+
    '<main class="hm-main"><header class="hm-top">'+
      '<button class="hm-ib" type="button" data-a="back" aria-label="Geri">'+icon('alt-arrow-left',16)+'</button>'+
      '<button class="hm-ib" type="button" data-a="fwd" aria-label="İleri">'+icon('alt-arrow-right',16)+'</button>'+
      '<h1 id="hmTitle"></h1><span class="hm-sp"></span>'+
      '<button class="hm-back" type="button" data-a="return" id="hmReturn" hidden>'+icon('alt-arrow-left',14)+'Projeye dön</button>'+
      '<div class="hm-goals" role="group" aria-label="Yeni proje başlat">'+GOALS.map(([g,n,ic,c])=>'<button class="hm-goal" type="button" data-goal="'+g+'"><span class="hm-gi '+c+'">'+icon(ic,14)+'</span>'+n+'</button>').join('')+
        '<button class="hm-goal hm-more" type="button" data-a="more" aria-haspopup="menu">Diğer'+icon('alt-arrow-down',14)+'</button></div>'+
    '</header><div class="hm-scroll" id="hmBody"></div></main>';
  if(p.avatar_url)el.querySelector('.hm-av img').src=p.avatar_url;
}

// ---------- the content
const thumbBox=(p,cls)=>'<span class="'+cls+'" data-thumb="'+p.id+'">'+icon('gallery-wide',28)+'</span>';
function fillThumbs2(list){for(const p of list)thumbURL(p).then(u=>{if(!u||!el)return;el.querySelectorAll('[data-thumb="'+p.id+'"]').forEach(t=>{t.innerHTML='<img alt="">';t.firstChild.src=u;});}).catch(()=>{});}
function sorted(l){const c=l.slice();
  if(prefs.sort==='name')c.sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  else if(prefs.sort==='created')c.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  else c.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  return c;}
const match=n=>!q||n.toLocaleLowerCase('tr').includes(q);
function rec(big){
  if(!mixed.length)return '';
  const n=big?8:5,items=[];for(let i=0;i<Math.min(n,mixed.length);i++)items.push(mixed[(i+recShift)%mixed.length]);
  return '<section class="hm-rec'+(big?' big':'')+'" aria-label="Önerilen şablonlar"><div class="hm-rec-h"><h2>'+(big?'Bir şablonla başla':'Önerilen şablonlar')+'</h2>'+
    (big?'<p>ekran görüntülerin şablona sonra eklenir</p>':'')+'<span class="hm-sp"></span>'+
    '<button class="hm-ib" type="button" data-a="recShift" aria-label="Başka öneriler">'+icon('refresh',16)+'</button>'+
    (big?'':'<button class="hm-ib" type="button" data-a="recClose" aria-label="Önerileri kapat">'+icon('close-circle',16)+'</button>')+'</div>'+
    '<div class="hm-rec-grid">'+items.map(t=>tplCard(t)).join('')+'</div>'+
    '<button class="hm-link" type="button" data-view="templates">Tüm şablonlar →</button></section>';
}
const tplCard=t=>'<button class="hm-tp" type="button" data-tpl="'+t.id+'"><span class="hm-tth"><img alt="" loading="lazy" src="templates/'+esc(t.variants.light.thumb)+'"></span>'+
  '<span class="hm-tn"><b>'+esc(t.name)+'</b><span>'+esc(t.goalName)+(t.boards>1?' · '+t.boards+' ekran':'')+(t.motion?' · hareketli':'')+'</span></span></button>';
function cards(list,{trash:isTrash=false}={}){
  const open=openId();
  if(prefs.layout==='list')return '<div class="hm-list" role="list"><div class="hm-row hm-hd"><span></span><span>Ad</span><span>'+(isTrash?'Silinme':'Son düzenleme')+'</span><span>Artboard</span><span>Boyut</span><span></span></div>'+
    list.map(p=>'<div class="hm-row hm-item" role="listitem" tabindex="0" data-id="'+p.id+'">'+thumbBox(p,'hm-lth')+'<span class="hm-nm">'+esc(p.name)+(p.id===open?' <span class="hm-c">· açık</span>':'')+'</span>'+
      '<span class="hm-c">'+ago(isTrash?p.deleted_at:p.updated_at)+'</span><span class="hm-c">'+(p.boards||0)+'</span><span class="hm-c">'+mb(p.bytes||0)+'</span>'+
      '<button class="hm-ib" type="button" data-menu="'+p.id+'" aria-label="'+esc(p.name)+' seçenekleri" aria-haspopup="menu">'+icon('menu-dots',16)+'</button></div>').join('')+'</div>';
  return '<div class="hm-grid" role="list">'+list.map(p=>'<div class="hm-card hm-item" role="listitem" tabindex="0" data-id="'+p.id+'" aria-label="'+esc(p.name)+'">'+
      '<div class="hm-th">'+thumbBox(p,'hm-thi')+(p.id===open?'<span class="hm-badge">Açık</span>':'')+
      '<button class="hm-dots" type="button" data-menu="'+p.id+'" aria-label="'+esc(p.name)+' seçenekleri" aria-haspopup="menu">'+icon('menu-dots',16)+'</button></div>'+
      '<div class="hm-meta"><span class="hm-ico">'+icon('gallery-wide',13)+'</span><span class="hm-mtx"><span class="hm-nm">'+esc(p.name)+'</span><span class="hm-tm">'+
      (isTrash?'Silindi '+ago(p.deleted_at):'Düzenlendi '+ago(p.updated_at))+' · '+(p.boards||0)+' artboard</span></span></div></div>').join('')+'</div>';
}
// the work open in the editor when it is not one of the listed cloud projects (new, never saved, or saved elsewhere)
function openWork(){
  if(!doc.boards.length)return null;
  const id=openId();if(id&&projects&&projects.some(p=>p.id===id))return null;
  const b=doc.boards.find(x=>x.id===doc.active)||doc.boards[0],name=($('#projName').textContent||'').trim();
  return {name:name&&!/^(Mockup stüdyosu|Shotlight|Adsız proje)$/.test(name)?name:'Adsız çalışma',thumb:b&&b.thumb,boards:doc.boards.length};
}
function openCard(w){
  if(prefs.layout==='list')return '<div class="hm-row hm-open" role="listitem" tabindex="0" data-a="return"><span class="hm-lth">'+(w.thumb?'<img alt="" src="'+w.thumb+'">':icon('gallery-wide',20))+'</span>'+
    '<span class="hm-nm">'+esc(w.name)+' <span class="hm-c">· açık, buluta kaydedilmedi</span></span><span class="hm-c">şimdi</span><span class="hm-c">'+w.boards+'</span><span class="hm-c">—</span><span></span></div>';
  return '<div class="hm-card hm-open" role="listitem" tabindex="0" data-a="return" aria-label="Açık çalışmaya dön: '+esc(w.name)+'"><div class="hm-th"><span class="hm-thi">'+(w.thumb?'<img alt="" src="'+w.thumb+'">':icon('gallery-wide',28))+'</span>'+
    '<span class="hm-badge">Açık</span></div><div class="hm-meta"><span class="hm-ico">'+icon('gallery-wide',13)+'</span><span class="hm-mtx"><span class="hm-nm">'+esc(w.name)+'</span>'+
    '<span class="hm-tm">Buluta kaydedilmedi · '+w.boards+' artboard</span></span></div></div>';
}
const withOpen=(html,w)=>w?html.replace(/^(<div class="hm-(?:grid|list)" role="list">(?:<div class="hm-row hm-hd">.*?<\/div>)?)/,'$1'+openCard(w)):html;
function bar(h){
  return '<div class="hm-bar2"><h2>'+h+'</h2><span class="hm-sp"></span>'+
    '<button class="hm-pill" type="button" data-a="sort" aria-haspopup="menu">'+({edited:'Son düzenlenen',name:'Ada göre',created:'Oluşturulma'})[prefs.sort]+icon('alt-arrow-down',14)+'</button>'+
    '<div class="hm-seg" role="group" aria-label="Görünüm"><button type="button" data-layout="grid" aria-pressed="'+(prefs.layout==='grid')+'" aria-label="Izgara">'+icon('widget',16)+'</button>'+
    '<button type="button" data-layout="list" aria-pressed="'+(prefs.layout==='list')+'" aria-label="Liste">'+icon('layout-list',16)+'</button></div></div>';
}
function draw(){
  if(!el)return;
  el.querySelectorAll('.hm-nav').forEach(n=>n.setAttribute('aria-current',n.dataset.view===view?'page':'false'));
  el.querySelector('#hmTitle').textContent=TITLES[view];
  el.querySelector('[data-a="back"]').disabled=!past.length;el.querySelector('[data-a="fwd"]').disabled=!ahead.length;
  el.querySelector('#hmReturn').hidden=!doc.boards.length;
  const n=el.querySelector('[data-count="all"]');n.textContent=projects&&projects.length?projects.length:'';
  const body=el.querySelector('#hmBody');
  if(!projects){body.innerHTML='<p class="hm-empty">Yükleniyor…</p>';return;}
  let h='',thumbs=[];
  if(view==='recent'||view==='all'){
    const w=q?null:openWork();
    if(!projects.length&&!q&&!w){
      h+=rec(true)+'<div class="hm-empty"><h2>Henüz projen yok</h2><p>Bir şablon seç, sağ üstten bir amaçla başla ya da boş tuvalle aç.</p>'+
        '<button class="hm-btn" type="button" data-a="blank">'+icon('add-circle',16)+'Boş tuval</button></div>';
    }else{
      if(view==='recent'&&!prefs.recClosed&&!q)h+=rec(false);
      const all=sorted(projects).filter(p=>match(p.name)),l=view==='recent'&&!q?all.slice(0,8):all;thumbs=l;
      h+=bar(view==='recent'?'Son kullanılanlar':'Tüm projeler ('+projects.length+')')+(l.length||w?withOpen(cards(l),w):'<p class="hm-empty">Bu aramayla eşleşen proje yok.</p>');
      if(view==='recent'&&!q&&projects.length>8)h+='<button class="hm-link" type="button" data-view="all">Tüm projeler ('+projects.length+') →</button>';
    }
  }else if(view==='templates'){
    const l=tpls.filter(t=>match(t.name)||match(t.goalName));
    h+='<div class="hm-bar2"><h2>Şablondan yeni proje</h2></div>'+(l.length?'<div class="hm-tgrid">'+l.map(tplCard).join('')+'</div>':'<p class="hm-empty">Bu aramayla eşleşen şablon yok.</p>');
  }else{
    h+='<p class="hm-notice">Çöp kutusundaki projeler 30 gün sonra kalıcı olarak silinir. Geri getirmek için projenin menüsünü aç.</p>';
    if(!trash)h+='<p class="hm-empty">Yükleniyor…</p>';
    else{const l=sorted(trash).filter(p=>match(p.name));thumbs=l;h+=l.length?cards(l,{trash:true}):'<div class="hm-empty"><h2>Çöp kutusu boş</h2></div>';}
  }
  body.innerHTML=h;fillThumbs2(thumbs);
  const t=el.querySelector('[data-count="trash"]');if(t)t.textContent=trash&&trash.length?trash.length:'';
}

// ---------- menus
let menu=null;
function closeMenu(){if(!menu)return;menu.remove();menu=null;el&&el.querySelectorAll('[aria-expanded="true"]').forEach(b=>b.setAttribute('aria-expanded','false'));}
function openMenu(btn,items,{right=false}={}){
  closeMenu();const r=btn.getBoundingClientRect();
  menu=document.createElement('div');menu.className='hm-menu';menu.setAttribute('role','menu');
  items.forEach(it=>{
    if(!it){const s=document.createElement('div');s.className='hm-msep';menu.appendChild(s);return;}
    const b=document.createElement('button');b.type='button';b.className='hm-mi'+(it.danger?' danger':'')+(it.on?' on':'');b.setAttribute('role','menuitem');
    b.innerHTML='<span></span>'+(it.key?'<kbd>'+it.key+'</kbd>':'');b.firstChild.textContent=it.label;
    b.addEventListener('click',()=>{closeMenu();it.run();});menu.appendChild(b);
  });
  document.body.appendChild(menu);
  const w=menu.offsetWidth,x=right?r.right-w:r.left;menu.style.left=Math.max(8,Math.min(x,innerWidth-w-8))+'px';
  const y=r.bottom+6;menu.style.top=(y+menu.offsetHeight>innerHeight-8?Math.max(8,r.top-menu.offsetHeight-6):y)+'px';
  btn.setAttribute('aria-expanded','true');menu.querySelector('.hm-mi').focus();
  menu.addEventListener('keydown',e=>{
    const l=[...menu.querySelectorAll('.hm-mi')],i=l.indexOf(document.activeElement);
    if(e.key==='ArrowDown'){e.preventDefault();l[(i+1)%l.length].focus();}else if(e.key==='ArrowUp'){e.preventDefault();l[(i-1+l.length)%l.length].focus();}
    else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu();btn.focus();}
  });
}
document.addEventListener('pointerdown',e=>{if(menu&&!menu.contains(e.target)&&!e.target.closest('[aria-haspopup]'))closeMenu();});

// ---------- actions
const byId=id=>(view==='trash'?trash:projects||[]).find(p=>p.id===id);
async function openP(p){
  if(p.id===openId()&&doc.boards.length){hideHome();return;}  // the one already open here
  if(await openFromCloud(p.id))hideHome();
}
async function startTemplate(t){
  if(!(await newProject()))return;
  holdHistory(true);
  try{clearAll();const ids=await openTemplate(t,'light');activate(ids[0]);setUi({kind:'board'});fitAll();hideHome();
    toast(t.name+' şablonuyla yeni proje'+(t.motion?'. Hareketi Canlandır’da önizle.':''));}
  catch(e){toast('Şablon açılamadı: '+(e.message||e));}
  finally{holdHistory(false);}
  fillThumbs();
}
async function blank({capture=false}={}){
  if(!(await newProject()))return;
  hideHome();
  if(capture){const u=$('#wlUrl');if(u&&!$('#wlUrlRow').hidden)u.focus();else toast('Site yakalama bu sürümde kapalı.');}
}
/* a goal: the welcome card as a window over the home page, that goal chosen (the store set: its form). Nothing changes
   until the user starts: then the open work makes way for a new project (asking when it has unsaved changes); once
   the scenes are kept the editor opens on them. Closing the window leaves everything as it was. */
const hooks=()=>({before:()=>newProject(),done:()=>hideHome(),after:()=>hideHome()});
function startGoal(g){
  if(g==='store'){openStoreDialog(undefined,hooks());return;}
  openWelcome(g,hooks());
}
function projectMenu(btn,p){
  const run=f=>async()=>{try{if(await f(p)){await load();}}catch(e){toast(e.message);}};
  if(view==='trash')openMenu(btn,[{label:'Geri getir',run:run(restoreAction)},null,{label:'Kalıcı olarak sil',danger:true,run:run(destroyAction)}],{right:true});
  else openMenu(btn,[{label:'Aç',key:'↵',run:()=>openP(p)},null,{label:'Yeniden adlandır',key:'F2',run:run(renameAction)},{label:'Çoğalt',run:run(duplicateAction)},
    null,{label:'Çöp kutusuna taşı',key:'⌫',danger:true,run:run(trashAction)}],{right:true});
}
function onClick(e){
  const t=e.target;
  const nav=t.closest('[data-view]');if(nav){go(nav.dataset.view);return;}
  const lay=t.closest('[data-layout]');if(lay){prefs.layout=lay.dataset.layout;savePrefs();draw();return;}
  const m=t.closest('[data-menu]');if(m){e.stopPropagation();const p=byId(m.dataset.menu);if(p)projectMenu(m,p);return;}
  const g=t.closest('[data-goal]');if(g){startGoal(g.dataset.goal);return;}
  const tp=t.closest('[data-tpl]');if(tp){const x=tpls.find(y=>y.id===tp.dataset.tpl);if(x)startTemplate(x);return;}
  const a=t.closest('[data-a]');
  if(a){switch(a.dataset.a){
    case 'return':hideHome();return;
    case 'back':if(past.length){ahead.push(view);go(past.pop(),{push:false});}return;
    case 'fwd':if(ahead.length){past.push(view);go(ahead.pop(),{push:false});}return;
    case 'recShift':recShift+=4;draw();return;
    case 'recClose':prefs.recClosed=true;savePrefs();draw();return;
    case 'blank':blank();return;
    case 'sort':openMenu(a,[['edited','Son düzenlenen'],['name','Ada göre'],['created','Oluşturulma']].map(([k,l])=>({label:l,on:prefs.sort===k,run:()=>{prefs.sort=k;savePrefs();draw();}})));return;
    case 'more':openMenu(a,[{label:'Boş tuval',run:()=>blank()},{label:'Siteden yakala…',run:()=>startGoal('land')},null,
      {label:'Proje dosyası aç…',key:'⌘O',run:()=>{hideHome();$('#openProjectBtn').click();}},{label:'Tüm şablonlar',run:()=>go('templates')}],{right:true});return;
    case 'me':{const th=document.documentElement.dataset.theme||'system';
      openMenu(a,[{label:'Tema: sistem',on:th==='system',run:()=>theme('system')},{label:'Tema: açık',on:th==='light',run:()=>theme('light')},{label:'Tema: koyu',on:th==='dark',run:()=>theme('dark')},
        null,{label:'Klavye kısayolları',key:'?',run:()=>{hideHome();$('#keysBtn').click();}},null,{label:'Çıkış yap',run:async()=>{if(await leave())hideHome();}}]);return;}
  }}
  const card=t.closest('.hm-item');if(card&&view!=='trash'){const p=byId(card.dataset.id);if(p)openP(p);}
}
const theme=v=>{const b=document.querySelector('#themeSeg [data-theme="'+v+'"]');if(b)b.click();};
function onInput(e){if(e.target.id==='hmQ'){q=e.target.value.trim().toLocaleLowerCase('tr');draw();}}
// Esc goes back to the open work (on the document: the focus may be anywhere while the home page shows)
document.addEventListener('keydown',e=>{
  if(el&&e.key==='Escape'&&doc.boards.length&&!menu&&!document.querySelector('.scrim:not([hidden]),.wl-modal:not([hidden])')){e.preventDefault();e.stopPropagation();hideHome();}
},true);
function onKey(e){
  const open=e.target.closest&&e.target.closest('.hm-open');if(open&&e.target===open&&e.key==='Enter'){e.preventDefault();hideHome();return;}
  const card=e.target.closest&&e.target.closest('.hm-item');
  if(card&&e.target===card){const p=byId(card.dataset.id);if(!p)return;
    if(e.key==='Enter'&&view!=='trash'){e.preventDefault();openP(p);}
    else if(e.key==='F2'&&view!=='trash'){e.preventDefault();renameAction(p).then(c=>{if(c)load();}).catch(er=>toast(er.message));}
    else if((e.key==='Delete'||e.key==='Backspace')&&view!=='trash'){e.preventDefault();trashAction(p).then(c=>{if(c)load();}).catch(er=>toast(er.message));}
  }
}

// ---------- wiring: signing in lands here; the editor's menus come back here
if(cloudEnabled){
  signInHooks.add(()=>showHome());
  onAuth(a=>{for(const id of ['#homeBtn','#homeTopBtn','#wlClose'])$(id).hidden=!a.user;if(!a.user)hideHome();else if(el){frame();draw();}});
  $('#homeBtn').addEventListener('click',()=>showHome());
  $('#homeTopBtn').addEventListener('click',()=>showHome());
  // the welcome card's close: the window over the home page closes; the editor's own card goes back home
  $('#wlClose').addEventListener('click',()=>{if(!closeWelcomeModal())showHome();});
  // "Projeyi kapat": always back to the home page
  closeHooks.add(()=>{if(auth.user)showHome();});
  $('#cloudOpenBtn').addEventListener('click',()=>showHome('all'));
}

export {hideHome,showHome,shown as homeShown};
