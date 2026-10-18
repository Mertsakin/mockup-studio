/* The account (io/cloud.js holds the session). In a build with accounts the studio needs one: nobody signed in is
   sent to the sign-in page (/studio/login: tools/site/routes-plugin.mjs before the page loads, here when the session
   ends). Signed in, the foot of the left panel shows the user's avatar, name, storage and a menu. A build without accounts (no
   VITE_SUPABASE_URL: the render harness, tests, a self-hosted copy) has none of this and opens as before.
   Sign-in: Google, GitHub, Apple (VITE_AUTH_PROVIDERS picks the buttons) or a one-time e-mail link. */
import {auth,client,cloudEnabled,onAuth} from '../io/cloud.js';
import {icon} from './icons.js';
import {showHome} from './home.js';
import {isLeaving,leave} from './projects.js';
import {toLogin} from './router.js';
import {signInForm} from './signin-form.js';
import {$} from '../util.js';

const wrap=$('#acctWrap'),signBtn=$('#signInBtn'),acctBtn=$('#acctBtn'),menu=$('#acctMenu');
// ---------- the studio needs a signed-in user: the sign-in page is its own address (/studio/login, src/login.js)
let cover=null;
if(cloudEnabled){
  // until the stored session is known: a blank cover, so the studio never shows to someone whose session has ended
  if(!auth.ready){cover=document.createElement('div');cover.className='auth-gate pending';document.body.appendChild(cover);}
  wrap.hidden=false;
  onAuth(a=>{
    if(a.user){if(cover){cover.remove();cover=null;}}
    else if(!isLeaving())toLogin();  // the session ended (expired, signed out in another tab); signing out goes there itself
    draw(a);
  });
}

// ---------- the top bar and the account menu
const mb=n=>n<2**30?(n/2**20).toFixed(n<10*2**20?1:0).replace('.',',')+' MB':(n/2**30).toFixed(1).replace('.',',')+' GB';
function initials(a){const n=(a.profile&&a.profile.name)||(a.user&&a.user.email)||'?';return n.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();}
function draw(a){
  const on=!!a.user;
  signBtn.hidden=true;acctBtn.hidden=!on;
  if(!on){closeMenu();return;}
  const p=a.profile||{},url=p.avatar_url||a.user.user_metadata?.avatar_url;
  // avatar, name and the cloud storage used (2 GB in the beta)
  const used=p.storage_bytes||0,name=p.name||(a.user.email||'').split('@')[0];
  acctBtn.innerHTML='<span class="acct-av">'+(url?'<img alt="" referrerpolicy="no-referrer">':'<span class="ini"></span>')+'</span>'+
    '<span class="acct-t"><b></b><span class="acct-bar"><i></i></span><span class="acct-n"></span></span>'+icon('alt-arrow-up',14);
  const av=acctBtn.querySelector('.acct-av').firstChild;if(url)av.src=url;else av.textContent=initials(a);
  acctBtn.querySelector('.acct-t b').textContent=name;
  acctBtn.querySelector('.acct-bar i').style.width=Math.min(100,used/2**31*100).toFixed(1)+'%';
  acctBtn.querySelector('.acct-n').textContent=mb(used)+' / 2 GB';
  acctBtn.setAttribute('aria-label','Hesap: '+(p.name||a.user.email));
  if(!menu.hidden)fillMenu();  // the profile arrived while the menu was open
}
function closeMenu(){if(menu.hidden)return;menu.hidden=true;acctBtn.setAttribute('aria-expanded','false');}
function fillMenu(){
  const p=auth.profile||{},used=p.storage_bytes||0;
  menu.innerHTML='<div class="acct-head"><b></b><span></span></div>'+
    '<div class="mlabel acct-use"></div>'+
    '<div class="msep" role="separator"></div>'+
    '<button class="mi" role="menuitem" type="button" data-a="projects">'+icon('folder-with-files')+'<span>Projelerim…</span></button>'+
    '<div class="msep" role="separator"></div>'+
    '<button class="mi" role="menuitem" type="button" data-a="out">'+icon('logout-2')+'<span>Çıkış yap</span></button>';
  menu.querySelector('.acct-head b').textContent=p.name||'';
  menu.querySelector('.acct-head span').textContent=auth.user.email||'';
  const use=menu.querySelector('.acct-use');use.textContent='Bulutta '+(used/2**20).toFixed(used<10*2**20?1:0).replace('.',',')+' MB / 2 GB kullanılıyor';use.hidden=!auth.profile;
}
function openMenu(){
  fillMenu();
  menu.hidden=false;acctBtn.setAttribute('aria-expanded','true');
  const f=menu.querySelector('.mi:not([disabled])');if(f)f.focus({preventScroll:true});
}
acctBtn.addEventListener('click',e=>{e.stopPropagation();if(menu.hidden)openMenu();else closeMenu();});
menu.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');if(!b)return;closeMenu();
  if(b.dataset.a==='projects')showHome('all');
  else if(b.dataset.a==='out')leave();
});
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!acctBtn.contains(e.target))closeMenu();});
menu.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu();acctBtn.focus();return;}
  const items=[...menu.querySelectorAll('.mi:not([disabled])')],i=items.indexOf(document.activeElement);
  if(e.key==='ArrowDown'&&items.length){e.preventDefault();items[(i+1)%items.length].focus();}
  if(e.key==='ArrowUp'&&items.length){e.preventDefault();items[(i-1+items.length)%items.length].focus();}
});

// ---------- the sign-in dialog (kept for a session that ends in the middle of work; the gate covers the normal case)
function openSignIn(){
  client().catch(()=>{});
  const sc=document.createElement('div');sc.className='scrim';sc.id='signInScrim';
  sc.innerHTML='<div class="dialog signin-dlg" role="dialog" aria-modal="true" aria-labelledby="siT">'+
    '<div class="dh"><span id="siT">Giriş yap</span><button class="ib sm" type="button" data-a="close" aria-label="Kapat">'+icon('close-circle')+'</button></div>'+
    '<div class="db"></div></div>';
  document.body.appendChild(sc);
  const f=signInForm(sc.querySelector('.db'));
  const close=()=>{sc.remove();document.removeEventListener('keydown',key,true);};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  document.addEventListener('keydown',key,true);
  sc.addEventListener('click',e=>{if(e.target===sc||e.target.closest('[data-a="close"]'))close();});
  f.focus();
}
signBtn.addEventListener('click',openSignIn);
export {openSignIn};
