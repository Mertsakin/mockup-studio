// The home page (ui/home.js), end to end: signing in lands on it; without projects it offers templates and a blank
// canvas (the welcome card); with projects it lists them; the goal buttons start a project from a template; the
// editor's "Ana sayfa" comes back; a reload stays in the editor; trash and restore; list view; an e-mail link lands on it.
// node tools/accounts/test-home.mjs [studio URL]   (studio on 5177 with --mode accounts, storage Worker on 8787)
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {NODE_OPTS,local} from './local.mjs';

const L=local(),STUDIO=process.argv[2]||'http://localhost:5177/',SHOTS=process.env.SHOTS||'';
const admin=createClient(L.url,L.service,NODE_OPTS);
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const email=`home-${Date.now()}@shotlight.test`,password='test-'+crypto.randomUUID();
const {data:created}=await admin.auth.admin.createUser({email,password,email_confirm:true});
const uid=created.user.id;
const b=await chromium.launch({args:['--use-angle=metal']});
const errs=[];
async function page(){const ctx=await b.newContext({viewport:{width:1440,height:900}}),p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(e.message));await p.addInitScript(()=>{window.__noPhotoPreview=true;});
  await p.goto(STUDIO);await p.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'),null,{timeout:60000});return p;}
const signIn=p=>p.evaluate(async([e,pw])=>{const c=await window.__app('client')();const r=await c.auth.signInWithPassword({email:e,password:pw});if(r.error)throw r.error;},[email,password]);
const toastHas=(p,re)=>p.waitForFunction(r=>new RegExp(r).test(document.querySelector('#toast').textContent),re.source,{timeout:30000});
const clearToast=p=>p.evaluate(()=>{document.querySelector('#toast').textContent='';});
const boards=p=>p.evaluate(()=>window.__app('doc').boards.length);
try{
  console.log('no projects');
  let p=await page();await signIn(p);
  await p.waitForSelector('#home .hm-rec.big .hm-tp',{timeout:20000});
  ok((await p.$$('.hm-rec .hm-tp')).length===4,'signing in lands on the home page: "Bir şablonla başla" with four templates');
  ok(await p.evaluate(()=>!!document.querySelector('#leftPanel,#appMenuBtn').closest('[inert]')),'the editor behind it is inert');
  ok(await p.isVisible('.hm-empty >> text=Henüz projen yok'),'and "Henüz projen yok"');
  if(SHOTS)await p.screenshot({path:SHOTS+'/home-empty.png'});
  await p.click('.hm-empty [data-a="blank"]');await p.waitForSelector('.wl-modal:not([hidden])');await p.click('#wlBlank');
  await p.waitForSelector('#home',{state:'detached'});
  ok(await p.evaluate(()=>!document.documentElement.classList.contains('wl-on')&&window.__app('doc').boards.length===1),'"Boş tuval" (its window, then the blank artboard): the editor on a new artboard');
  // a project to list: the board, saved to the cloud
  await p.evaluate(()=>{const app=window.__app;if(!app('hasBoard')())app('addBoard')();app('req')();});await p.waitForTimeout(600);
  await clearToast(p);await p.click('#appMenuBtn');await p.click('#cloudSaveBtn');await p.fill('#pdName','Lansman görselleri');await p.keyboard.press('Enter');
  await toastHas(p,/buluta kaydedildi/);
  await p.click('#appMenuBtn');await p.click('#homeBtn');
  await p.waitForSelector('#home .hm-card',{timeout:15000});
  ok(/Lansman görselleri/.test(await p.textContent('.hm-card .hm-nm')),'"Ana sayfa" in the editor\'s menu: the project is listed');
  ok(await p.isVisible('.hm-card .hm-badge'),'marked as the open one');
  await p.waitForSelector('.hm-card .hm-thi img',{timeout:10000}).catch(()=>{});
  ok(!!(await p.$('.hm-card .hm-thi img')),'with its thumbnail');
  ok(!!(await p.$('.hm-rec:not(.big)'))&&(await p.$$('.hm-rec .hm-tp')).length===4,'recommended templates above the projects, one row of four');
  if(SHOTS)await p.screenshot({path:SHOTS+'/home-full.png'});
  await p.click('.hm-card');await p.waitForSelector('#home',{state:'detached'});
  ok(await boards(p)===1,'clicking the open project goes back to it');

  console.log('goal buttons, the way back, reopening, reload');
  ok(await p.isVisible('#homeTopBtn'),'the editor shows a home button at the left of the top bar');
  await p.click('#homeTopBtn');await p.waitForSelector('#home .hm-goal');
  // the goals: the welcome card as a window over the home page; nothing changes until the user starts
  await p.click('.hm-goal[data-goal="social"]');await p.waitForSelector('.wl-modal:not([hidden]) #welcome');
  ok(!!(await p.$('#home'))&&await boards(p)===1,'"Sosyal": the welcome window opens over the home page, the open project stays');
  ok(await p.evaluate(()=>document.querySelector('#welcome [data-goal="social"]').getAttribute('aria-pressed')==='true'),'with Sosyal gönderi chosen');
  ok(await p.waitForFunction(()=>{const u=document.querySelector('#wlUrl'),r=document.querySelector('#wlUrlRow');return r.hidden||document.activeElement===u;},null,{timeout:3000}).then(()=>true,()=>false),'the address field is focused (when capture is on)');
  if(SHOTS)await p.screenshot({path:SHOTS+'/home-goal.png'});
  await p.click('#wlClose');await p.waitForSelector('.wl-modal',{state:'hidden'});
  ok(!!(await p.$('#home'))&&await boards(p)===1,'× closes the window: still on the home page, nothing changed');
  await p.click('.hm-goal[data-goal="video"]');await p.waitForSelector('.wl-modal:not([hidden])');await p.keyboard.press('Escape');await p.waitForSelector('.wl-modal',{state:'hidden'});
  ok(!!(await p.$('#home'))&&!(await p.$('.hm-more')),'Esc closes it too (and there is no Diğer menu)');
  await p.click('.hm-goal[data-goal="store"]');
  ok(await p.waitForSelector('.scrim .store-dlg',{timeout:5000}).then(()=>true,()=>false),'"Mağaza seti": the store set form over the home page');
  await p.keyboard.press('Escape');await p.waitForTimeout(300);
  ok(!!(await p.$('#home'))&&await boards(p)===1,'closing the form leaves everything as it was');
  // starting: screenshots dropped into the window -> scenes -> kept -> the editor on the new project
  await p.click('.hm-goal[data-goal="land"]');await p.waitForSelector('.wl-modal:not([hidden])');
  await p.setInputFiles('#wlFile','tools/landing/src/app-light.png');
  await p.waitForSelector('#wlAdd:not([disabled])',{timeout:30000});
  ok(!!(await p.$('#home')),'the scenes are picked in the window, over the home page');
  await clearToast(p);await p.click('#wlAdd');
  await p.waitForSelector('#home',{state:'detached'});
  ok(await boards(p)>=1&&await p.evaluate(()=>!document.documentElement.classList.contains('wl-on')&&document.querySelector('.wl-modal').hidden),'"Artboard ekle": the editor opens on the new project');
  // "Projeyi kapat" always goes home
  await p.click('#appMenuBtn');await p.click('#closeProject');
  await p.waitForSelector('.dialog [data-a="discard"]',{timeout:3000}).then(()=>p.click('.dialog [data-a="discard"]')).catch(()=>{});
  await p.waitForSelector('#home',{timeout:10000});
  ok(true,'"Projeyi kapat": the home page');
  // a blank artboard from the welcome window: unsaved work for the rest
  await p.click('.hm-goal[data-goal="land"]');await p.waitForSelector('.wl-modal:not([hidden])');await p.click('#wlBlank');await p.waitForSelector('#home',{state:'detached'});
  // unsaved work: listed as "Açık çalışma", the way back
  await p.waitForTimeout(600);
  await p.click('#homeTopBtn');await p.waitForSelector('#home .hm-open');
  ok(/Buluta kaydedilmedi/.test(await p.textContent('#home .hm-open')),'unsaved work shows as the first card');
  ok(!(await p.$('#hmReturn')),'no "Projeye dön" in the top bar (the card is the way back)');
  if(SHOTS)await p.screenshot({path:SHOTS+'/home-open.png'});
  await p.click('#home .hm-open');await p.waitForSelector('#home',{state:'detached'});
  ok(await boards(p)===1,'the card goes back to it');
  await p.click('#homeTopBtn');await p.waitForSelector('#home');await p.keyboard.press('Escape');await p.waitForSelector('#home',{state:'detached'});
  ok(true,'Esc goes back to it too');
  await p.click('#homeTopBtn');await p.waitForSelector('#home .hm-card:not(.hm-open)');
  await clearToast(p);await p.click('.hm-card:not(.hm-open)');
  await p.waitForSelector('text=Yine de aç',{timeout:5000}).then(()=>p.click('.dialog [data-a="ok"]')).catch(()=>{});
  await toastHas(p,/açıldı/);
  ok(await boards(p)===1&&!(await p.$('#home')),'a project card opens the project (unsaved work asks first)');
  await p.reload();await p.waitForSelector('#acctBtn:not([hidden])',{state:'attached',timeout:20000});await p.waitForTimeout(2500);
  ok(!(await p.$('#home')),'a reload stays in the editor');

  console.log('trash, list view');
  await p.click('#appMenuBtn');await p.click('#homeBtn');await p.waitForSelector('#home .hm-card');
  await p.hover('.hm-card');await p.click('.hm-card .hm-dots');await p.click('.hm-menu >> text=Çöp kutusuna taşı');await p.click('.dialog [data-a="ok"]');
  await p.waitForFunction(()=>!document.querySelector('#home .hm-card:not(.hm-open)')&&document.querySelector('#home .hm-open'),null,{timeout:15000}).catch(()=>{});
  ok(await p.isVisible('#home .hm-open'),'moved to the trash: gone from the list; the work still open here shows as "Açık çalışma"');
  await p.click('.hm-nav[data-view="trash"]');await p.waitForSelector('#home .hm-card');
  ok(/Silindi/.test(await p.textContent('.hm-card .hm-tm')),'Çöp kutusu lists it');
  await p.hover('.hm-card');await p.click('.hm-card .hm-dots');await p.click('.hm-menu >> text=Geri getir');
  await p.waitForSelector('#home .hm-empty >> text=Çöp kutusu boş',{timeout:15000});
  await p.click('.hm-nav[data-view="all"]');await p.waitForSelector('#home .hm-card:not(.hm-open)');
  ok(true,'"Geri getir": back in Projelerim');
  await p.click('[data-a="back"]');await p.waitForSelector('.hm-nav[data-view="trash"][aria-current="page"]');
  ok(true,'the back arrow returns to the previous view');
  await p.click('.hm-nav[data-view="all"]');await p.click('[data-layout="list"]');await p.waitForSelector('#home .hm-row.hm-item');
  ok(true,'list view');
  await p.click('[data-layout="grid"]');
  await p.context().close();

  console.log('e-mail link');
  p=await page();await p.waitForSelector('#authGate:not(.pending)',{timeout:30000});
  await p.fill('#siEmail',email);await p.click('.si-mail .btn');await p.waitForSelector('#authGate .si-sent-wrap:not([hidden])',{timeout:15000});
  let link=null;
  for(let i=0;i<30&&!link;i++){const list=await (await fetch(L.mail+'/api/v1/search?query='+encodeURIComponent('to:'+email))).json();const m=(list.messages||[])[0];
    if(m){const full=await (await fetch(L.mail+'/api/v1/message/'+m.ID)).json();link=(/(https?:\/\/[^\s"<>]+verify[^\s"<>]+)/.exec(full.Text||full.HTML||'')||[])[1];}
    if(!link)await new Promise(r=>setTimeout(r,500));}
  await p.goto(link.replace(/&amp;/g,'&'));
  await p.waitForSelector('#home .hm-card',{timeout:20000});
  ok(true,'returning from an e-mail link lands on the home page');
  await p.click('.hm-nav[data-view="trash"]');await p.waitForSelector('.hm-nav[data-view="trash"][aria-current="page"]');
  await p.reload();await p.waitForSelector('#home .hm-nav[data-view="trash"][aria-current="page"]',{timeout:20000});
  ok(true,'a reload on the home page comes back to it, on the same view');
  await p.click('.hm-nav[data-view="all"]');await p.waitForSelector('#home .hm-card');
  await clearToast(p);await p.click('.hm-card');await toastHas(p,/açıldı/);await p.waitForSelector('#home',{state:'detached'});
  await p.click('#appMenuBtn');await p.click('#closeProject');await p.waitForSelector('#home');  // an empty document
  await p.reload();await p.waitForSelector('#home',{timeout:20000});
  ok(!(await p.$('.wl-modal:not([hidden])'))&&await p.isVisible('#home'),'a reload with an empty document: the home page, not the editor\'s welcome card');
  ok(!errs.length,'no page errors'+(errs.length?': '+errs.join(' | '):''));
}finally{await admin.auth.admin.deleteUser(uid).catch(()=>{});await b.close();}
console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
