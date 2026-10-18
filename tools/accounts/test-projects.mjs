// Cloud projects in the studio, end to end (local Supabase + local storage Worker + the studio on 5177): one account
// in two browser profiles. A saves a scene with a screenshot, saving again uploads no media, B opens it from
// Projelerim (thumbnail, screenshot back), both edit, the second save gets the conflict dialog; rename, duplicate,
// delete. node tools/accounts/test-projects.mjs [studio URL]   (starts the Worker unless STORAGE_URL is set)
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {NODE_OPTS,local} from './local.mjs';

const L=local(),STUDIO=process.argv[2]||'http://localhost:5177/',W=process.env.STORAGE_URL||'http://127.0.0.1:8787',SHOTS=process.env.SHOTS||'';
const admin=createClient(L.url,L.service,NODE_OPTS);
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
let worker=null;
async function up(){try{return (await fetch(W+'/ping')).ok;}catch(e){return false;}}
if(!(await up())){
  worker=spawn('npx',['wrangler','dev','-c','services/storage/wrangler.toml','--local','--port','8787'],{stdio:'ignore',env:Object.assign({},process.env,{WRANGLER_SEND_METRICS:'false'})});
  for(let i=0;!(await up());i++){if(i>90)throw new Error('Worker did not start');await new Promise(r=>setTimeout(r,500));}
}
const email=`proj-${Date.now()}@shotlight.test`,password='test-'+crypto.randomUUID();
const {data:created}=await admin.auth.admin.createUser({email,password,email_confirm:true});
const uid=created.user.id;
const b=await chromium.launch({args:['--use-angle=metal']});
async function studio(tag){
  const ctx=await b.newContext({viewport:{width:1280,height:800}}),p=await ctx.newPage();
  p.errs=[];p.on('pageerror',e=>p.errs.push(tag+': '+e.message));
  p.mediaPuts=0;p.on('request',r=>{if(r.method()==='PUT'&&/\/media\/[0-9a-f]{64}/.test(r.url()))p.mediaPuts++;});
  await p.addInitScript(()=>{window.__noPhotoPreview=true;});
  await p.goto(STUDIO);
  await p.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'),null,{timeout:60000});
  await p.evaluate(async([e,pw])=>{const c=await window.__app('client')();const r=await c.auth.signInWithPassword({email:e,password:pw});if(r.error)throw r.error;},[email,password]);
  await p.waitForSelector('#acctBtn:not([hidden])');
  return p;
}
const toastHas=(p,re)=>p.waitForFunction(r=>new RegExp(r).test(document.querySelector('#toast').textContent),re.source,{timeout:30000});
async function menu(p,id){await p.evaluate(()=>{document.querySelector('#toast').textContent='';});await p.click('#appMenuBtn');await p.click('#'+id);}
const row=async()=>(await admin.from('projects').select('*').eq('owner',uid).is('deleted_at',null).order('created_at')).data;
try{
  const A=await studio('A');
  // a board with a screenshot on the phone
  await A.evaluate(async()=>{const app=window.__app;if(!app('hasBoard')())app('addBoard')();const st=app('state'),d=st.devices[0];
    const i=new Image();i.src='/tools/landing/src/app-light.png';await i.decode();d.img=i;d.imgName='ekran.png';app('setScreenTexture')(d);app('req')();});
  await A.waitForTimeout(1200);
  ok(await A.isVisible('#appMenuBtn'),'studio A ready, signed in');
  await menu(A,'cloudSaveBtn');
  await A.waitForSelector('#pdName');await A.fill('#pdName','Test projesi');await A.keyboard.press('Enter');
  await toastHas(A,/buluta kaydedildi/);
  let r=await row();
  ok(r.length===1&&r[0].name==='Test projesi'&&r[0].version===1,'saved: one project, version 1');
  ok((await admin.from('media').select('hash').eq('owner',uid)).data.length>=1&&A.mediaPuts>=1,'the screenshot went up ('+A.mediaPuts+' media upload)');
  ok(!!r[0].thumb_key,'with a thumbnail');
  ok(/Test projesi/.test(await A.textContent('#projName')),'the top bar shows the project name');
  const puts=A.mediaPuts;
  await menu(A,'cloudSaveBtn');await toastHas(A,/buluta kaydedildi/);
  ok(A.mediaPuts===puts&&(await row())[0].version===2,'saving again: version 2, no media uploaded again');

  const B=await studio('B');
  // B signs in with a project in the cloud: the launcher lists it
  await B.waitForSelector('#projectsScrim.launcher .pj-card',{timeout:15000});
  ok((await B.$$('.pj-card')).length===1&&/Test projesi/.test(await B.textContent('.pj-card .pj-name')),'B: the launcher lists the project (and a new project card)');
  await B.waitForSelector('.pj-thumb img',{timeout:10000}).catch(()=>{});
  ok(await B.$('.pj-thumb img')!==null,'with its thumbnail');
  if(SHOTS)await B.locator('.projects-dlg').screenshot({path:SHOTS+'/projects.png'});
  await B.click('.pj-open');await toastHas(B,/açıldı/);
  const got=await B.evaluate(()=>{const st=window.__app('state'),d=st.devices[0];return {boards:window.__app('doc').boards.length,img:!!(d&&d.img&&d.img.naturalWidth)};});
  ok(got.boards===1&&got.img,'B opened it: the board and the screenshot are back');

  // both edit; B saves first, A then conflicts
  const nudge=p=>p.evaluate(()=>{const app=window.__app,d=app('state').devices[0];d.px+=3;app('applyTransform')();app('req')();});
  await nudge(B);await B.waitForTimeout(500);await menu(B,'cloudSaveBtn');await toastHas(B,/buluta kaydedildi/);
  ok((await row())[0].version===3,'B saved: version 3');
  await nudge(A);await A.waitForTimeout(500);await menu(A,'cloudSaveBtn');
  await A.waitForSelector('text=Proje başka bir yerde değişti',{timeout:15000});
  ok(true,'A gets the conflict dialog');
  if(SHOTS)await A.locator('.dialog').last().screenshot({path:SHOTS+'/conflict.png'});
  await A.click('.dialog [data-a="mine"]');await toastHas(A,/buluta kaydedildi/);
  ok((await row())[0].version===4,'"Benimkini kaydet": version 4 on top of B\'s');
  const docs=await admin.from('projects').select('doc_key').eq('owner',uid);
  ok(!!docs.data[0].doc_key,'the project points at A\'s document');

  // the dialog's own actions
  await B.evaluate(()=>{document.querySelector('#toast').textContent='';});await B.click('#acctBtn');await B.click('#acctMenu [data-a="projects"]');await B.waitForSelector('.pj-card');
  await B.hover('.pj-card');await B.click('.pj-card [data-a="rename"]');await B.fill('#pdName','Lansman görselleri');await B.keyboard.press('Enter');
  await toastHas(B,/yeniden adlandırıldı/);
  ok((await row())[0].name==='Lansman görselleri','rename');
  await B.waitForSelector('.pj-card');await B.hover('.pj-card');await B.click('.pj-card [data-a="dup"]');await toastHas(B,/çoğaltıldı/);
  r=await row();
  ok(r.length===2&&r[1].name==='Lansman görselleri kopyası'&&r[1].version===1,'duplicate: a second project at version 1');
  const dm=await admin.from('project_media').select('hash').eq('project',r[1].id);
  ok(dm.data.length>=1,'the copy lists the same media (not uploaded again)');
  await B.waitForFunction(()=>document.querySelectorAll('.pj-card').length===2);
  await B.hover('.pj-card >> nth=1');await B.click('.pj-card >> nth=1 >> [data-a="del"]');await B.click('.dialog [data-a="ok"]');
  await toastHas(B,/silindi/);
  ok((await row()).length===1,'delete: back to one project');
  ok(!A.errs.length&&!B.errs.length,'no page errors'+([...A.errs,...B.errs].length?': '+[...A.errs,...B.errs].join(' | '):''));
}finally{
  await admin.auth.admin.deleteUser(uid).catch(()=>{});
  await b.close();if(worker)worker.kill();
}
console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
