/* The sign-in page (/studio/login; src/boot.js loads this instead of the studio, so none of the editor's code comes
   down). The card: the brand, "Giriş yap", the providers and the e-mail link (ui/signin-form.js). Both come back to
   the studio's root with the code; the studio completes the sign-in there. A session that arrives here some other way
   (another tab signs in; the tests' password sign-in) goes on to the studio, to the address the visitor was sent
   away from if there was one (ui/router.js takeNext reads it there). */
import {auth,client,cloudEnabled,onAuth} from './io/cloud.js';
import {ROOT} from './ui/router.js';
import {signInForm} from './ui/signin-form.js';
import {toast} from './ui/toast.js';

const html=document.documentElement;
try{const t=localStorage.getItem('mockup-studio-theme');if(t==='light'||t==='dark')html.dataset.theme=t;}catch(e){/* private mode */}
document.title='Giriş yap · Shotlight';
const gate=document.createElement('div');gate.className='auth-gate';gate.id='authGate';
gate.setAttribute('role','main');gate.setAttribute('aria-labelledby','agT');
gate.innerHTML='<div class="ag-card"><div class="ag-brand"><img src="favicon.svg" alt="" width="40" height="40"><span>Shotlight</span></div>'+
  '<h1 id="agT">Giriş yap</h1><p class="ag-sub">Projelerin hesabında saklanır, her cihazdan açılır. Beta boyunca ücretsiz.</p><div class="ag-form"></div></div>';
document.body.appendChild(gate);html.classList.remove('booting');
const form=signInForm(gate.querySelector('.ag-form'));form.focus();

// the provider sent the visitor back with an error (cancelled, not allowed): say so once
{const h=new URLSearchParams(location.hash.slice(1)),s=new URLSearchParams(location.search),m=h.get('error_description')||s.get('error_description');
  if(m){toast('Giriş tamamlanamadı: '+m.replace(/\+/g,' '));history.replaceState(null,'',location.pathname);}}

// signed in after all: on to the studio (a fresh sign-in there: io/cloud.js reads the flag)
onAuth(a=>{
  if(!a.user)return;
  try{sessionStorage.setItem('shotlight.fresh','1');}catch(e){/* no storage */}
  location.replace(ROOT);
});
// another tab signed in (the session is shared through localStorage)
addEventListener('storage',e=>{if(e.key&&/^sb-.*-auth-token$/.test(e.key)&&e.newValue)client().catch(()=>{});});
if(import.meta.env.DEV)window.__login={client,auth,cloudEnabled};
