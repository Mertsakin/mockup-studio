// Signing in: with cloud projects the launcher lists them and its last card starts a new project (the welcome card);
// without any, the welcome card shows right away; a reload with the session carried over continues without it. node tools/accounts/test-launcher.mjs [studio URL]
// (the studio on 5177 with --mode accounts, the storage Worker on 8787)
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {NODE_OPTS,local} from './local.mjs';

const L=local(),STUDIO=process.argv[2]||'http://localhost:5177/',SHOTS=process.env.SHOTS||'';
const admin=createClient(L.url,L.service,NODE_OPTS);
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const email=`launch-${Date.now()}@shotlight.test`,password='test-'+crypto.randomUUID();
const {data:created}=await admin.auth.admin.createUser({email,password,email_confirm:true});
const uid=created.user.id;
const b=await chromium.launch({args:['--use-angle=metal']});
async function signedIn(){
  const ctx=await b.newContext({viewport:{width:1280,height:800}}),p=await ctx.newPage();
  p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
  await p.addInitScript(()=>{window.__noPhotoPreview=true;});
  await p.goto(STUDIO);
  await p.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'),null,{timeout:60000});
  await p.evaluate(async([e,pw])=>{const c=await window.__app('client')();const r=await c.auth.signInWithPassword({email:e,password:pw});if(r.error)throw r.error;},[email,password]);
  await p.waitForSelector('#acctBtn:not([hidden])');
  return p;
}
try{
  console.log('no projects');
  let p=await signedIn();await p.waitForTimeout(1500);
  ok(!(await p.$('#projectsScrim')),'no launcher');
  ok(await p.evaluate(()=>document.documentElement.classList.contains('wl-on')),'the welcome card shows');
  // make a project, then come back
  await p.evaluate(async()=>{const app=window.__app;app('addBoard')();app('req')();});await p.waitForTimeout(600);
  await p.evaluate(()=>{document.querySelector('#toast').textContent='';});
  await p.click('#appMenuBtn');await p.click('#cloudSaveBtn');await p.fill('#pdName','İlk proje');await p.keyboard.press('Enter');
  await p.waitForFunction(()=>/buluta kaydedildi/.test(document.querySelector('#toast').textContent),null,{timeout:30000});
  await p.context().close();

  console.log('with a project');
  p=await signedIn();
  await p.waitForSelector('#projectsScrim.launcher',{timeout:15000});
  ok(true,'the launcher opens');
  const cards=await p.$$eval('#pjGrid > *',els=>els.map(e=>e.className));
  ok(cards.length===2&&cards[0]==='pj-card'&&cards[1]==='pj-new','one project card, then "Yeni proje oluştur" last');
  ok(/İlk proje/.test(await p.textContent('.pj-card .pj-name')),'the project by name');
  if(SHOTS){await p.waitForSelector('.pj-thumb img',{timeout:8000}).catch(()=>{});await p.screenshot({path:SHOTS+'/launcher.png'});}
  await p.click('.pj-new');
  await p.waitForSelector('#projectsScrim',{state:'detached'});
  ok(await p.evaluate(()=>document.documentElement.classList.contains('wl-on')&&window.__app('doc').boards.length===0),'"Yeni proje oluştur": the launcher closes, empty document, the welcome card');
  await p.reload();
  await p.waitForSelector('#acctBtn:not([hidden])',{timeout:20000});await p.waitForTimeout(2500);
  ok(!(await p.$('#projectsScrim')),'a reload (session carried over): no launcher, the studio continues');
  await p.evaluate(()=>window.__app('openProjects')());await p.waitForSelector('#projectsScrim .pj-open');
  await p.click('.pj-open');
  await p.waitForFunction(()=>/açıldı/.test(document.querySelector('#toast').textContent),null,{timeout:20000});
  ok(await p.evaluate(()=>window.__app('doc').boards.length===1&&!document.documentElement.classList.contains('wl-on')),'a project card opens the project');
  await p.evaluate(()=>window.__app('openProjects')());await p.waitForSelector('#projectsScrim:not(.launcher) .pj-new');
  ok(true,'the Projelerim dialog has the new project card too');
  await p.keyboard.press('Escape');
  // signing out and in again in the same page: the launcher again
  await p.click('#acctBtn');await p.click('#acctMenu [data-a="out"]');
  await p.waitForSelector('text=Kaydetmeden çık',{timeout:3000}).then(()=>p.click('[data-a="discard"]')).catch(()=>{});
  await p.waitForSelector('#authGate:not(.pending)',{timeout:10000});
  await p.evaluate(async([e,pw])=>{const c=await window.__app('client')();await c.auth.signInWithPassword({email:e,password:pw});},[email,password]);
  await p.waitForSelector('#projectsScrim.launcher',{timeout:15000});
  ok(true,'signing out and in again: the launcher again');
  // a fresh browser returning from an e-mail link (a session that did not exist before): the launcher
  // (the studio's own link: PKCE, back with ?code=; the gate asks for it, the local mail catcher receives it)
  const ctx2=await b.newContext({viewport:{width:1280,height:800}}),q=await ctx2.newPage();
  await q.goto(STUDIO);await q.waitForSelector('#authGate:not(.pending)',{timeout:30000});
  const since=new Date().toISOString();
  await q.fill('#siEmail',email);await q.click('.si-mail .btn');await q.waitForSelector('#authGate .si-sent-wrap:not([hidden])',{timeout:15000});
  let link=null;
  for(let i=0;i<30&&!link;i++){
    const list=await (await fetch(L.mail+'/api/v1/search?query='+encodeURIComponent('to:'+email))).json();
    const m=(list.messages||[]).find(x=>x.Created>=since)||(list.messages||[])[0];
    if(m){const full=await (await fetch(L.mail+'/api/v1/message/'+m.ID)).json();link=(/(https?:\/\/[^\s"<>]+verify[^\s"<>]+)/.exec(full.Text||full.HTML||'')||[])[1];}
    if(!link)await new Promise(r=>setTimeout(r,500));
  }
  await q.goto(link.replace(/&amp;/g,'&'));
  await q.waitForSelector('#projectsScrim.launcher',{timeout:20000});
  ok(true,'returning from an e-mail link: the launcher');
  await ctx2.close();
  ok(!p.errs.length,'no page errors'+(p.errs.length?': '+p.errs.join(' | '):''));
}finally{
  await admin.auth.admin.deleteUser(uid).catch(()=>{});await b.close();
}
console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
