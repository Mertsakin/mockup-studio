/* The account (io/cloud.js holds the session). In a build with accounts the studio needs one: until the user is
   signed in, a full-screen sign-in card covers it (the studio behind is inert: no clicks, no shortcuts), and it comes
   back on signing out. Signed in, the top bar shows the user's avatar and a menu. A build without accounts (no
   VITE_SUPABASE_URL: the render harness, tests, a self-hosted copy) has none of this and opens as before.
   Sign-in: Google, GitHub, Apple (VITE_AUTH_PROVIDERS picks the buttons) or a one-time e-mail link. */
import {PROVIDERS,auth,client,cloudEnabled,onAuth,signInEmail,signInWith} from '../io/cloud.js';
import {icon} from './icons.js';
import {showHome} from './home.js';
import {leave} from './projects.js';
import {toast} from './toast.js';
import {$} from '../util.js';

const wrap=$('#acctWrap'),signBtn=$('#signInBtn'),acctBtn=$('#acctBtn'),menu=$('#acctMenu');
// the providers' own marks, as their sign-in guidelines ask (Google in colour, GitHub and Apple in the text colour)
const MARK={
  google:'<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>',
  github:'<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>',
  apple:'<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M16.4 12.8c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9s-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8 2.2-1.3 3.1-2.5c1-1.4 1.4-2.8 1.4-2.9-.1 0-2.6-1-2.6-4.1zM13.9 5.2c.7-.9 1.2-2 1-3.2-1 0-2.2.7-3 1.6-.6.7-1.2 1.9-1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>'};
const NAME={google:'Google',github:'GitHub',apple:'Apple'};

/* The sign-in form inside root: provider buttons, "ya da", the e-mail field, then "E-postanı kontrol et" once the link
   is sent. Shared by the gate and the dialog. */
function signInForm(root){
  root.innerHTML='<div class="si-form">'+
      '<div class="si-prov">'+PROVIDERS.filter(p=>MARK[p]).map(p=>'<button class="btn si-btn" type="button" data-p="'+p+'">'+MARK[p]+'<span>'+NAME[p]+' ile devam et</span></button>').join('')+'</div>'+
      (PROVIDERS.some(p=>MARK[p])?'<div class="si-or"><span>ya da</span></div>':'')+
      '<form class="si-mail" novalidate><label class="lbl" for="siEmail">E-posta</label>'+
        '<input type="email" id="siEmail" autocomplete="email" inputmode="email" placeholder="ad@ornek.com" required aria-describedby="siErr">'+
        '<p class="si-err" id="siErr" role="alert" hidden></p>'+
        '<button class="btn primary" type="submit">'+icon('letter')+'<span>Giriş bağlantısı gönder</span></button></form>'+
    '</div>'+
    '<div class="si-sent-wrap" hidden><div class="si-sent">'+icon('letter')+'<b>E-postanı kontrol et</b><p></p></div>'+
      '<div class="dfoot"><button class="btn" type="button" data-a="back">Başka adres</button></div></div>';
  const q=s=>root.querySelector(s),err=q('#siErr'),email=q('#siEmail');
  const showErr=m=>{err.textContent=m;err.hidden=!m;email.setAttribute('aria-invalid',String(!!m));};
  email.addEventListener('input',()=>showErr(''));
  root.addEventListener('click',async e=>{
    const a=e.target.closest('[data-a="back"]');
    if(a){q('.si-sent-wrap').hidden=true;q('.si-form').hidden=false;email.focus();return;}
    const p=e.target.closest('[data-p]');if(!p)return;
    p.disabled=true;
    try{await signInWith(p.dataset.p);}  // the page goes to the provider and comes back signed in
    catch(er){p.disabled=false;toast(NAME[p.dataset.p]+' ile giriş açılamadı: '+er.message);}
  });
  q('.si-mail').addEventListener('submit',async e=>{
    e.preventDefault();
    const v=email.value.trim();
    if(!v){showErr('E-posta adresini yaz.');email.focus();return;}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){showErr('Bu bir e-posta adresine benzemiyor.');email.focus();return;}
    const b=e.submitter||q('.si-mail .btn');b.disabled=true;
    try{
      await signInEmail(v);
      q('.si-sent p').textContent=v+' adresine bir giriş bağlantısı gönderdik. Bağlantıya bu tarayıcıda tıkla; birkaç dakika içinde gelmezse istenmeyen e-postalara bak.';
      q('.si-form').hidden=true;q('.si-sent-wrap').hidden=false;q('[data-a="back"]').focus();
    }catch(er){showErr(/rate|limit|seconds/i.test(er.message)?'Çok sık denendi; biraz bekleyip yeniden dene.':'Bağlantı gönderilemedi: '+er.message);}
    finally{b.disabled=false;}
  });
  return {focus:()=>(q('.si-btn')||email).focus()};
}

// ---------- the gate: the studio needs a signed-in user
let gate=null;
const shut=on=>{for(const el of document.body.children)if(el!==gate&&el.id!=='toast')el.inert=on;};
function showGate(){
  // already showing the form: leave it (the client's first auth event arrives while the user is typing or has sent the link)
  if(gate&&!gate.classList.contains('pending'))return;
  if(!gate){
    gate=document.createElement('div');document.body.appendChild(gate);
  }
  gate.className='auth-gate';gate.id='authGate';
  gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');gate.setAttribute('aria-labelledby','agT');
  gate.innerHTML='<div class="ag-card"><div class="ag-brand"><img src="favicon.svg" alt="" width="40" height="40"><span>Shotlight</span></div>'+
    '<h1 id="agT">Giriş yap</h1><p class="ag-sub">Projelerin hesabında saklanır, her cihazdan açılır. Beta boyunca ücretsiz.</p><div class="ag-form"></div></div>';
  const f=signInForm(gate.querySelector('.ag-form'));
  shut(true);document.documentElement.classList.add('gated');f.focus();
}
function hideGate(){if(!gate)return;gate.remove();gate=null;shut(false);document.documentElement.classList.remove('gated');}
if(cloudEnabled){
  // until the stored session is known: a blank cover, so the studio never flashes before the gate (or the other way)
  if(!auth.ready){gate=document.createElement('div');gate.className='auth-gate pending';document.body.appendChild(gate);shut(true);}
  wrap.hidden=false;
  onAuth(a=>{if(a.user)hideGate();else showGate();draw(a);});
}

// ---------- the top bar and the account menu
function initials(a){const n=(a.profile&&a.profile.name)||(a.user&&a.user.email)||'?';return n.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();}
function draw(a){
  const on=!!a.user;
  signBtn.hidden=true;acctBtn.hidden=!on;
  if(!on){closeMenu();return;}
  const p=a.profile||{},url=p.avatar_url||a.user.user_metadata?.avatar_url;
  acctBtn.innerHTML=url?'<img alt="" referrerpolicy="no-referrer">':'<span class="ini"></span>';
  if(url)acctBtn.firstChild.src=url;else acctBtn.firstChild.textContent=initials(a);
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
// the provider sent the user back with an error (cancelled, not allowed): say so once
{const h=new URLSearchParams(location.hash.slice(1)),s=new URLSearchParams(location.search),m=h.get('error_description')||s.get('error_description');
  if(m&&cloudEnabled){toast('Giriş tamamlanamadı: '+m.replace(/\+/g,' '));history.replaceState(null,'',location.pathname);}}

export {openSignIn};
