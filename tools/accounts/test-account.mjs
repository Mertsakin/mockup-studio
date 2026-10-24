// "Verini indir" and "Hesabı sil" in the studio, end to end (local Supabase + local storage Worker + the studio on
// 5177): an account with two cloud projects (one with a screenshot) downloads its data from the editor's account
// menu as one ZIP (both project files and a README; each file opens with fromProjectFile), then deletes the account
// from the home page's menu: the question waits for the typed words, the Worker removes the files, Supabase the rows
// and the user, the studio lands on the sign-in page with a toast, this browser keeps nothing, and the same e-mail can
// sign up again from nothing. node tools/accounts/test-account.mjs [studio URL]   (starts the Worker unless one answers on 8787)
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import JSZip from 'jszip';
import {NODE_OPTS,STUDIO_URL,local,signInAt} from './local.mjs';

const L=local(),STUDIO=process.argv[2]||STUDIO_URL,W=process.env.STORAGE_URL||'http://127.0.0.1:8787',SHOTS=process.env.SHOTS||'';
const admin=createClient(L.url,L.service,NODE_OPTS);
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
let worker=null;
async function up(){try{return (await fetch(W+'/ping')).ok;}catch(e){return false;}}
if(!(await up())){
  worker=spawn('npx',['wrangler','dev','-c','services/storage/wrangler.toml','--local','--port','8787'],{stdio:'ignore',env:Object.assign({},process.env,{WRANGLER_SEND_METRICS:'false'})});
  for(let i=0;!(await up());i++){if(i>90)throw new Error('Worker did not start');await new Promise(r=>setTimeout(r,500));}
}
const email=`acct-${Date.now()}@shotlight.test`,password='test-'+crypto.randomUUID();
const {data:created}=await admin.auth.admin.createUser({email,password,email_confirm:true});
let uid=created.user.id;
const b=await chromium.launch({args:['--use-angle=metal']});
const ctx=await b.newContext({locale:'tr-TR',viewport:{width:1280,height:800},acceptDownloads:true}),p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{window.__noPhotoPreview=true;});
const toastHas=(p,re)=>p.waitForFunction(r=>new RegExp(r).test(document.querySelector('#toast').textContent),re.source,{timeout:30000});
const clearToast=p=>p.evaluate(()=>{document.querySelector('#toast').textContent='';});
async function saveAs(name){await clearToast(p);await p.click('#appMenuBtn');await p.click('#cloudSaveBtn');await p.waitForSelector('#pdName');await p.fill('#pdName',name);await p.keyboard.press('Enter');await toastHas(p,/buluta kaydedildi/);}
const rows=async()=>(await admin.from('projects').select('*').eq('owner',uid).order('created_at')).data;
try{
  await signInAt(p,email,password,STUDIO);
  await p.waitForSelector('#home [data-a="blank"]',{timeout:15000});await p.click('#home [data-a="blank"]');await p.click('#wlBlank');await p.waitForSelector('#home',{state:'detached'});
  // project one: a board with a screenshot on the phone (a media file in the cloud)
  await p.evaluate(async()=>{const app=window.__app;if(!app('hasBoard')())app('addBoard')();const st=app('state'),d=st.devices[0];
    const i=new Image();i.src='tools/landing/src/app-light.png';await i.decode();d.img=i;d.imgName='ekran.png';app('setScreenTexture')(d);app('req')();});
  await p.waitForTimeout(800);
  await saveAs('Lansman görselleri');
  // project two: a plain board, then into the trash (the download includes it)
  await p.evaluate(async()=>{const app=window.__app;await app('newProject')();app('addBoard')();app('req')();});
  await p.waitForTimeout(600);
  await saveAs('Lansman görselleri');  // the same name: the files must still differ
  let r=await rows();
  ok(r.length===2&&r.every(x=>x.version===1),'two cloud projects, one with a screenshot');
  await admin.from('projects').update({deleted_at:new Date().toISOString()}).eq('id',r[1].id);

  console.log('Verini indir');
  await p.click('#acctBtn');await p.waitForSelector('#acctMenu:not([hidden])');
  ok(!!(await p.$('#acctMenu [data-a="download"]'))&&!!(await p.$('#acctMenu [data-a="delete"].danger')),'the account menu offers Verini indir and Hesabı sil');
  if(SHOTS)await p.screenshot({path:SHOTS+'/account-menu.png',clip:{x:0,y:440,width:300,height:360}});
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:60000}),p.click('#acctMenu [data-a="download"]')]);
  const dir=mkdtempSync(join(tmpdir(),'shotlight-acct-')),file=join(dir,dl.suggestedFilename());await dl.saveAs(file);
  ok(/^shotlight-hesap-\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()),'one ZIP comes down ('+dl.suggestedFilename()+')');
  await toastHas(p,/2 proje indirildi/);
  const zip=await JSZip.loadAsync(readFileSync(file)),names=Object.keys(zip.files).sort();
  ok(names.length===3&&names.includes('README.txt')&&names.includes('Lansman görselleri.mockup.json')&&names.includes('Lansman görselleri (2).mockup.json'),'it holds both project files (the same name numbered) and a README: '+names.join(', '));
  const readme=await zip.file('README.txt').async('string');
  ok(readme.includes('Hesap: '+email)&&readme.includes('(çöp kutusunda)')&&/Projeler \(2\)/.test(readme),'the README names the account, lists the projects and marks the trashed one');
  // each file opens in the studio: the first one with its screenshot back
  const opened=[];
  for(const n of names.filter(x=>x!=='README.txt')){
    const text=await zip.file(n).async('string');
    opened.push(await p.evaluate(async t=>{const d=await window.__app('fromProjectFile')(t);const s=d.boards[0].snap,dev=s.devices[0];return {boards:d.boards.length,img:!!(dev&&dev.img&&s.images[dev.img]&&s.images[dev.img].naturalWidth)};},text));
  }
  ok(opened.length===2&&opened.every(o=>o.boards===1)&&opened.some(o=>o.img),'both files open with fromProjectFile, one with the screenshot');

  console.log('Hesabı sil');
  await p.click('#homeTopBtn');await p.waitForSelector('#home .hm-me',{timeout:15000});
  await p.click('#home .hm-me');await p.click('.hm-menu >> text=Hesabı sil');
  await p.waitForSelector('#pdConfirm',{timeout:5000});
  const dlg=p.locator('.dialog',{has:p.locator('#pdConfirm')});
  const q=await dlg.textContent();
  ok(/2 proje/.test(q)&&/çöp kutusundakiler dahil/.test(q)&&!/0,0 MB/.test(q),'the question counts the projects, the trash included, and the space used now ('+(/bulutta ([\d,]+ MB)/.exec(q)||[])[1]+')');
  const prim=dlg.locator('.btn.primary');
  ok(await prim.isDisabled()&&(await prim.getAttribute('class')).includes('danger'),'"Hesabı sil" waits for the typed words');
  await p.fill('#pdConfirm','hesap');ok(await prim.isDisabled(),'the wrong words: still waiting');
  await p.keyboard.press('Enter');ok(await p.isVisible('#pdErr')&&!!(await p.$('#pdConfirm')),'Enter on them: an inline error, the dialog stays');
  await p.fill('#pdConfirm','Hesabı sil');ok(await prim.isEnabled(),'the right words enable it');
  if(SHOTS)await dlg.screenshot({path:SHOTS+'/account-delete.png'});
  const [res]=await Promise.all([p.waitForResponse(x=>x.request().method()==='DELETE'&&/\/account$/.test(x.url()),{timeout:30000}),prim.click()]);
  const dj=await res.json();
  ok(res.ok()&&dj.deleted&&dj.projects===2&&dj.media===1&&dj.objects>=4,'DELETE /account: 2 projects, 1 file, '+dj.objects+' objects gone');
  await p.waitForURL(u=>/\/studio\/login$/.test(u.pathname),{timeout:20000});
  await p.waitForSelector('#authGate .ag-card',{timeout:15000});
  ok(true,'the studio lands on the sign-in page');
  await toastHas(p,/Hesabın silindi/);
  ok(true,'with "Hesabın silindi"');
  ok(await p.evaluate(()=>{let t=false;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^sb-.*-auth-token/.test(k)||k==='shotlight.cloud.project'||k==='shotlight.local.owner')t=true;}return !t;}),'this browser keeps no session, project or owner');
  ok(((await admin.from('profiles').select('id').eq('id',uid)).data||[]).length===0&&((await admin.from('projects').select('id').eq('owner',uid)).data||[]).length===0,'Supabase: no profile or project rows left');
  ok(!(await admin.auth.admin.getUserById(uid)).data?.user,'and no user');
  const again=await admin.auth.admin.createUser({email,password,email_confirm:true});
  ok(!again.error&&again.data.user.id!==uid,'the same e-mail signs up again as a new user');
  if(!again.error)uid=again.data.user.id;
  ok(!errs.length,'no page errors'+(errs.length?': '+errs.join(' | '):''));
}finally{
  await admin.auth.admin.deleteUser(uid).catch(()=>{});
  await b.close();if(worker)worker.kill();
}
console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
