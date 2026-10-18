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
  ok(true,'signing in lands on the home page: "Bir şablonla başla" with templates');
  ok(await p.evaluate(()=>!!document.querySelector('#leftPanel,#appMenuBtn').closest('[inert]')),'the editor behind it is inert');
  ok(await p.isVisible('.hm-empty >> text=Henüz projen yok'),'and "Henüz projen yok"');
  if(SHOTS)await p.screenshot({path:SHOTS+'/home-empty.png'});
  await p.click('.hm-empty [data-a="blank"]');
  await p.waitForSelector('#home',{state:'detached'});
  ok(await p.evaluate(()=>document.documentElement.classList.contains('wl-on')),'"Boş tuval": the editor with the welcome card');
  // a project to list: a board, saved to the cloud
  await p.evaluate(()=>{const app=window.__app;app('addBoard')();app('req')();});await p.waitForTimeout(600);
  await clearToast(p);await p.click('#appMenuBtn');await p.click('#cloudSaveBtn');await p.fill('#pdName','Lansman görselleri');await p.keyboard.press('Enter');
  await toastHas(p,/buluta kaydedildi/);
  await p.click('#appMenuBtn');await p.click('#homeBtn');
  await p.waitForSelector('#home .hm-card',{timeout:15000});
  ok(/Lansman görselleri/.test(await p.textContent('.hm-card .hm-nm')),'"Ana sayfa" in the editor\'s menu: the project is listed');
  ok(await p.isVisible('.hm-card .hm-badge'),'marked as the open one');
  await p.waitForSelector('.hm-card .hm-thi img',{timeout:10000}).catch(()=>{});
  ok(!!(await p.$('.hm-card .hm-thi img')),'with its thumbnail');
  ok(!!(await p.$('.hm-rec:not(.big)')),'recommended templates above the projects');
  if(SHOTS)await p.screenshot({path:SHOTS+'/home-full.png'});
  await p.click('.hm-card');await p.waitForSelector('#home',{state:'detached'});
  ok(await boards(p)===1,'clicking the open project goes back to it');

  console.log('goal buttons, reopening, reload');
  await p.click('#appMenuBtn');await p.click('#homeBtn');await p.waitForSelector('#home .hm-goal');
  await clearToast(p);await p.click('.hm-goal[data-goal="store"]');
  await toastHas(p,/şablonuyla yeni proje/);
  ok(await boards(p)>=5&&!(await p.$('#home')),'"Mağaza seti": a new project from the store set template (5 boards)');
  await p.click('#appMenuBtn');await p.click('#homeBtn');await p.waitForSelector('#home .hm-card');
  await clearToast(p);await p.click('.hm-card');
  await p.waitForSelector('text=Yine de aç',{timeout:5000}).then(()=>p.click('.dialog [data-a="ok"]')).catch(()=>{});
  await toastHas(p,/açıldı/);
  ok(await boards(p)===1&&!(await p.$('#home')),'a project card opens the project (unsaved template work asks first)');
  await p.reload();await p.waitForSelector('#acctBtn:not([hidden])',{timeout:20000});await p.waitForTimeout(2500);
  ok(!(await p.$('#home')),'a reload stays in the editor');

  console.log('trash, list view');
  await p.click('#appMenuBtn');await p.click('#homeBtn');await p.waitForSelector('#home .hm-card');
  await p.hover('.hm-card');await p.click('.hm-card .hm-dots');await p.click('.hm-menu >> text=Çöp kutusuna taşı');await p.click('.dialog [data-a="ok"]');
  await p.waitForSelector('#home .hm-empty >> text=Henüz projen yok',{timeout:15000});
  ok(true,'moved to the trash: the account is empty again');
  await p.click('.hm-nav[data-view="trash"]');await p.waitForSelector('#home .hm-card');
  ok(/Silindi/.test(await p.textContent('.hm-card .hm-tm')),'Çöp kutusu lists it');
  await p.hover('.hm-card');await p.click('.hm-card .hm-dots');await p.click('.hm-menu >> text=Geri getir');
  await p.waitForSelector('#home .hm-empty >> text=Çöp kutusu boş',{timeout:15000});
  await p.click('.hm-nav[data-view="all"]');await p.waitForSelector('#home .hm-card');
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
  ok(!errs.length,'no page errors'+(errs.length?': '+errs.join(' | '):''));
}finally{await admin.auth.admin.deleteUser(uid).catch(()=>{});await b.close();}
console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
