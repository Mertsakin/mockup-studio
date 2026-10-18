// Signing in with an e-mail link in the studio, end to end, against the local Supabase: the dialog sends the link,
// the local mail catcher (Mailpit) receives it, the page follows it and comes back signed in (PKCE), the profile shows
// in the account menu, signing out returns to "Giriş yap". node tools/accounts/test-signin.mjs [studio URL]
// The studio must run with .env.development.local pointing at the local Supabase (npm run dev, or the "accounts" preview on 5177).
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {NODE_OPTS,local} from './local.mjs';

const L=local(),STUDIO=process.argv[2]||'http://localhost:5177/',SHOTS=process.env.SHOTS||'';
const admin=createClient(L.url,L.service,NODE_OPTS);
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const email=`signin-${Date.now()}@shotlight.test`;
const b=await chromium.launch({args:['--use-angle=metal']}),p=await b.newPage({viewport:{width:1280,height:800}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
try{
  await p.goto(STUDIO);
  await p.waitForFunction(()=>!document.documentElement.classList.contains('booting'),null,{timeout:60000});
  ok(await p.isVisible('#signInBtn'),'"Giriş yap" shows in the top bar');
  ok(await p.evaluate(()=>![...performance.getEntriesByType('resource')].some(r=>/supabase-js|@supabase/.test(r.name))),'supabase-js is not loaded before it is needed');
  await p.click('#signInBtn');
  ok(await p.isVisible('#signInScrim .signin-dlg'),'the sign-in dialog opens');
  if(SHOTS)await p.locator('.signin-dlg').screenshot({path:SHOTS+'/signin.png'});
  await p.click('.si-mail .btn');
  ok(await p.isVisible('#siErr')&&/yaz/.test(await p.textContent('#siErr')),'empty address: an inline error, nothing is sent');
  await p.fill('#siEmail','adres');await p.click('.si-mail .btn');
  ok(/benzemiyor/.test(await p.textContent('#siErr')),'malformed address: an inline error');
  await p.fill('#siEmail',email);
  ok(await p.isHidden('#siErr'),'editing the field clears the error');
  await p.click('.si-mail .btn');
  await p.waitForSelector('#siSent:not([hidden])',{timeout:15000});
  ok(true,'"E-postanı kontrol et" after sending');
  if(SHOTS)await p.locator('.signin-dlg').screenshot({path:SHOTS+'/signin-sent.png'});
  // the local mail catcher
  let link=null;
  for(let i=0;i<30&&!link;i++){
    const list=await (await fetch(L.mail+'/api/v1/search?query='+encodeURIComponent('to:'+email))).json();
    const m=list.messages&&list.messages[0];
    if(m){const full=await (await fetch(L.mail+'/api/v1/message/'+m.ID)).json();link=(/(https?:\/\/[^\s"<>]+verify[^\s"<>]+)/.exec(full.Text||full.HTML||'')||[])[1];}
    if(!link)await new Promise(r=>setTimeout(r,500));
  }
  ok(!!link,'the e-mail with the link arrived');
  await p.goto(link.replace(/&amp;/g,'&'));
  await p.waitForSelector('#acctBtn:not([hidden])',{timeout:20000});
  ok(true,'back in the studio, signed in (avatar in the top bar)');
  ok(!/code=/.test(p.url()),'the sign-in code is gone from the address ('+p.url()+')');
  await p.click('#acctBtn');
  ok((await p.textContent('.acct-head span'))===email,'the menu shows the address');
  await p.waitForFunction(n=>document.querySelector('.acct-head b').textContent===n,email.split('@')[0],{timeout:10000}).catch(()=>{});
  ok((await p.textContent('.acct-head b'))===email.split('@')[0],'and the profile name (from the trigger; the open menu updates when it arrives)');
  await p.click('#acctBtn');
  await p.click('#acctBtn');
  if(SHOTS)await p.screenshot({path:SHOTS+'/signin-menu.png',clip:{x:680,y:0,width:600,height:260}});
  await p.reload();await p.waitForSelector('#acctBtn:not([hidden])',{timeout:20000});
  ok(true,'still signed in after a reload');
  await p.click('#acctBtn');await p.click('#acctMenu [data-a="out"]');
  await p.waitForSelector('#signInBtn:not([hidden])',{timeout:10000});
  ok(await p.isHidden('#acctBtn'),'signed out: "Giriş yap" again');
  ok(!errs.length,'no page errors'+(errs.length?': '+errs.join(' | '):''));
}finally{
  const u=(await admin.auth.admin.listUsers()).data.users.find(x=>x.email===email);if(u)await admin.auth.admin.deleteUser(u.id);
  await b.close();
}
console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
