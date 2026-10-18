// The studio's addresses (ui/router.js, tools/site/routes-plugin.mjs), end to end: signed out every address goes to
// /studio/login (the editor not loaded) and a reload there never shows the editor; signed in, the home page and its
// views, /studio/edit for unsaved work, /studio/p/<id> once it is a cloud project, the browser's back and forward,
// reloads that stay, a project's link opened signed out (signing in goes on to it), an unknown project (the open
// work stays).
// node tools/accounts/test-routes.mjs [studio URL]   (studio on 5177 with --mode accounts, storage Worker on 8787)
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {NODE_OPTS,STUDIO_URL,local,signInAt} from './local.mjs';

const L=local(),STUDIO=process.argv[2]||STUDIO_URL,admin=createClient(L.url,L.service,NODE_OPTS);
const email='routes-'+Date.now()+'@shotlight.test',password='pw-'+crypto.randomUUID();
const {data:u}=await admin.auth.admin.createUser({email,password,email_confirm:true});
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const b=await chromium.launch({args:['--use-angle=metal']}),errs=[];
const path=p=>new URL(p.url()).pathname;
const at=(p,re)=>p.waitForURL(x=>re.test(x.pathname),{timeout:20000}).then(()=>true,()=>false);
async function page(){const ctx=await b.newContext({viewport:{width:1280,height:800}}),p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(e.message));await p.addInitScript(()=>{window.__noPhotoPreview=true;});return p;}
try{
  let p=await page();
  // signed out
  await p.goto(STUDIO+'projects');await p.waitForSelector('#authGate .ag-card');
  ok(path(p)==='/studio/login','signed out, /studio/projects goes to /studio/login');
  await p.addInitScript(()=>{window.__seen='';const tick=()=>{const tb=document.querySelector('.topbar');if(tb&&tb.offsetParent)window.__seen+='E';if(window.__seen.length<200)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  for(let i=0;i<3;i++){await p.reload();await p.waitForSelector('#authGate .ag-card');}
  await p.waitForTimeout(500);
  ok(!(await p.evaluate(()=>window.__seen))&&!(await p.evaluate(()=>!!window.__app)),'a reload of the sign-in page never shows the editor (nor loads it)');

  // signing in goes on to where the page was sent away from: /studio/projects
  await signInAt(p,email,password,STUDIO);
  ok(await at(p,/^\/studio\/projects$/)&&await p.isVisible('.hm-nav[data-view="all"][aria-current="page"]'),'signed in: on to /studio/projects (the address it was sent away from)');
  await p.click('.hm-nav[data-view="recent"]');
  ok(path(p)==='/studio/','Son kullanılanlar: /studio/');
  await p.click('.hm-nav[data-view="trash"]');
  ok(path(p)==='/studio/trash','Çöp kutusu: /studio/trash');
  await p.goBack();
  ok(await at(p,/^\/studio\/$/)&&await p.isVisible('.hm-nav[data-view="recent"][aria-current="page"]'),'the browser\'s back: the previous view');
  await p.goForward();
  ok(await at(p,/^\/studio\/trash$/)&&await p.isVisible('.hm-nav[data-view="trash"][aria-current="page"]'),'and forward');
  await p.goto(STUDIO+'login');
  ok(await at(p,/^\/studio\/$/),'signed in, /studio/login goes home');

  // unsaved work: /studio/edit; a cloud project: /studio/p/<id>
  await p.waitForSelector('#home [data-a="blank"]');await p.click('#home [data-a="blank"]');await p.click('#wlBlank');await p.waitForSelector('#home',{state:'detached'});
  ok(path(p)==='/studio/edit','a blank artboard: /studio/edit');
  await p.waitForTimeout(1000);await p.reload();await p.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'));await p.waitForTimeout(1500);
  ok(!(await p.$('#home'))&&path(p)==='/studio/edit'&&await p.evaluate(()=>window.__app('doc').boards.length===1),'a reload of /studio/edit: the same work in the editor');
  await p.click('#appMenuBtn');await p.click('#cloudSaveBtn');await p.fill('#pdName','Adres testi');await p.keyboard.press('Enter');
  ok(await at(p,/^\/studio\/p\/[0-9a-f-]+$/),'saved to the cloud: /studio/p/<id> ('+path(p)+')');
  const proj=path(p);
  await p.click('#homeTopBtn');await p.waitForSelector('#home .hm-card');
  ok(path(p)==='/studio/','the home button: /studio/');
  await p.goBack();
  ok(await at(p,/^\/studio\/p\//)&&!(await p.$('#home')),'back: the project in the editor again');
  await p.reload();await p.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'));await p.waitForTimeout(1500);
  ok(path(p)===proj&&!(await p.$('#home')),'a reload of /studio/p/<id>: the project in the editor');
  // a project that cannot be opened: a message, the open work stays, the address says so
  await p.evaluate(()=>{document.querySelector('#toast').textContent='';});
  await p.goto(STUDIO+'p/00000000-0000-0000-0000-000000000000');
  await p.waitForFunction(()=>/açılamadı|bulunamadı|yok/i.test(document.querySelector('#toast').textContent),null,{timeout:20000}).catch(()=>{});
  ok(await at(p,new RegExp('^'+proj+'$'))&&!(await p.$('#home')),'an unknown project: the open work stays, at its own address ('+path(p)+'; "'+(await p.textContent('#toast'))+'")');
  await p.context().close();

  // a project's link, signed out in another browser: the sign-in page, then the project
  p=await page();
  await p.goto(STUDIO.replace(/\/studio\/$/,'')+proj);await p.waitForSelector('#authGate .ag-card');
  ok(path(p)==='/studio/login','a project\'s link signed out: the sign-in page');
  await signInAt(p,email,password,STUDIO);
  ok(await at(p,new RegExp('^'+proj+'$'))&&await p.waitForSelector('#home',{state:'detached',timeout:20000}).then(()=>true,()=>false)&&await p.evaluate(()=>window.__app('doc').boards.length===1),'signing in opens that project');
  ok(!errs.length,'no page errors'+(errs.length?': '+errs.join(' | '):''));
}finally{await admin.auth.admin.deleteUser(u.user.id).catch(()=>{});await b.close();}
console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
