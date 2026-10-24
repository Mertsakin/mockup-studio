// The entry: the sign-in page (/studio/login, decided before anything is drawn by tools/site/routes-plugin.mjs) loads
// only its form; every other page the studio. A build without accounts has no sign-in page.
// The UI language first (src/lang.js): the English dictionary comes down only when English is chosen, and the static
// markup is translated before either page runs (the page is still hidden under html.booting).
import {LANG,hydrate,setDict} from './lang.js';
const ready=LANG==='en'?import('./lang-en.js').then(m=>setDict(m.default)):Promise.resolve();
ready.then(()=>{
  hydrate();
  if(document.documentElement.classList.contains('route-login'))import('./login.js');
  else import('./main.js');
});
