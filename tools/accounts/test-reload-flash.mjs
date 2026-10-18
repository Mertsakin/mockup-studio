// A reload on the home page must never show the editor first. Samples what is on screen every frame after a reload
// (the CPU slowed six times, so the session and the last work load late as on a slow machine): "E" = the editor's top
// bar visible with nothing over it. node tools/accounts/test-reload-flash.mjs [studio URL]
// (the studio on 5177 with --mode accounts)
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {NODE_OPTS,local} from './local.mjs';

const L=local(),STUDIO=process.argv[2]||'http://localhost:5177/',admin=createClient(L.url,L.service,NODE_OPTS);
const email='flash-'+Date.now()+'@shotlight.test',password='pw-'+crypto.randomUUID();
const {data:u}=await admin.auth.admin.createUser({email,password,email_confirm:true});
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const b=await chromium.launch({args:['--use-angle=metal']}),p=await b.newPage({viewport:{width:1280,height:800}});
try{
  await p.goto(STUDIO);await p.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'),null,{timeout:60000});
  await p.evaluate(async([e,pw])=>{const c=await window.__app('client')();await c.auth.signInWithPassword({email:e,password:pw});},[email,password]);
  await p.waitForSelector('#home');
  // some work open behind the home page (still open after sign-in), so the last session takes a while to restore
  await p.evaluate(()=>{const app=window.__app;app('addBoard')();app('addBoard')();app('req')();});await p.waitForTimeout(800);
  await p.addInitScript(()=>{window.__samples=[];window.__err='';const raf=window.requestAnimationFrame.bind(window);
    const tick=()=>{const html=document.documentElement,tb=document.querySelector('.topbar');if(!html){raf(tick);return;}
      const covered=!!document.querySelector('#home')||html.classList.contains('home-boot')||!!document.querySelector('#authGate');
      const r=tb&&tb.getBoundingClientRect(),editor=!!(r&&r.width)&&!html.classList.contains('booting');
      window.__samples.push(covered?'H':editor?'E':'-');if(window.__samples.length<300)raf(tick);};
    raf(tick);window.addEventListener('error',e=>window.__err+=e.message+';');});
  const cdp=await p.context().newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
  for(const run of [1,2,3]){
    await p.reload();await p.waitForSelector('#home .hm-nav',{timeout:60000});await p.waitForTimeout(1500);
    const [s,err]=await p.evaluate(()=>[window.__samples.join(''),window.__err]),e=(s.match(/E/g)||[]).length;
    ok(e===0,'reload '+run+': the editor never shows before the home page ('+e+' frames; '+s.replace(/(.)\1+/g,(m,c)=>c+m.length).slice(0,60)+')'+(err?' '+err:''));
  }
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
}finally{await admin.auth.admin.deleteUser(u.user.id).catch(()=>{});await b.close();}
console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
