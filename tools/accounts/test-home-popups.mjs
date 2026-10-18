// The home page's windows: a goal opens the welcome card over the home page, its "Mağaza seti" swaps it for the store
// form (on top, not behind), a question about unsaved work shows over the window (once), "Boş tuval" opens the same window, a click on the overlay closes each; the account sits at
// the foot of the sidebar (home) and of the left panel (editor). Screenshots to renders/home-popups-*.png.
// node tools/accounts/test-home-popups.mjs [studio URL]   (the studio on 5177 with --mode accounts)
import {chromium} from 'playwright';
import {createClient} from '@supabase/supabase-js';
import {NODE_OPTS,STUDIO_URL,local,signInAt} from './local.mjs';

const L=local(),STUDIO=process.argv[2]||STUDIO_URL,admin=createClient(L.url,L.service,NODE_OPTS);
const email='popups-'+Date.now()+'@shotlight.test',password='pw-'+crypto.randomUUID();
const {data:u}=await admin.auth.admin.createUser({email,password,email_confirm:true});
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const b=await chromium.launch({args:['--use-angle=metal']}),p=await b.newPage({viewport:{width:1280,height:800}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
// what is on top in the middle of the window
const top=()=>p.evaluate(()=>{const e=document.elementFromPoint(innerWidth/2,innerHeight/2);return e?(e.closest('.store-dlg')?'store':e.closest('.wl-modal')?'welcome':e.closest('#home')?'home':'other'):'none';});
const modalOpen=()=>p.evaluate(()=>!document.querySelector('.wl-modal').hidden);
try{
  await signInAt(p,email,password,STUDIO);
  await p.waitForSelector('#home .hm-empty .hm-btn[data-a="blank"]',{timeout:30000});
  ok(await p.isVisible('#home .hm-logo'),'the logo sits at the top of the sidebar');
  ok(await p.evaluate(()=>{const f=document.querySelector('#home .hm-foot');return !!f&&!!f.querySelector('.hm-me')&&!!f.querySelector('.hm-store');}),'the account and the storage share the foot of the sidebar');
  ok(!(await p.$('#hmReturn')),'no "Projeye dön" button');
  await p.screenshot({path:'renders/home-popups-1-home.png'});

  await p.click('#home [data-goal="land"]');await p.waitForTimeout(300);
  ok(await top()==='welcome','a goal opens the welcome card over the home page');
  await p.click('#wlStore');await p.waitForTimeout(300);
  ok(await top()==='store','"Mağaza seti" in the window: the store form shows on top');
  ok(!(await modalOpen()),'… and the welcome window made way for it');
  await p.screenshot({path:'renders/home-popups-2-store.png'});
  await p.mouse.click(20,400);await p.waitForTimeout(200);
  ok(!(await p.$('.store-dlg'))&&(await top())==='home','a click on the store form\'s overlay closes it, back to the home page');

  await p.click('#home [data-a="blank"]');await p.waitForTimeout(300);
  ok(await modalOpen()&&(await top())==='welcome','"Boş tuval" opens the welcome card as a window');
  await p.screenshot({path:'renders/home-popups-3-blank.png'});
  await p.mouse.click(20,400);await p.waitForTimeout(200);
  ok(!(await modalOpen())&&(await p.isVisible('#home')),'a click on the overlay beside the card closes the window, the home page stays');

  // into the editor: the window's blank artboard
  await p.click('#home [data-a="blank"]');await p.waitForTimeout(300);await p.click('#wlBlank');
  await p.waitForFunction(()=>!document.querySelector('#home'),null,{timeout:15000});await p.waitForTimeout(800);
  ok(await p.evaluate(()=>{const w=document.querySelector('#acctWrap');return !!w.closest('#leftPanel')&&!w.closest('.topbar')&&!w.hidden;}),'in the editor the account is at the foot of the left panel');
  ok(await p.evaluate(()=>{const r=document.querySelector('#acctBtn').getBoundingClientRect(),l=document.querySelector('#leftPanel').getBoundingClientRect();return r.width>0&&l.bottom-r.bottom<20;}),'… at its bottom edge');
  await p.click('#acctBtn');await p.waitForTimeout(200);
  ok(await p.evaluate(()=>{const m=document.querySelector('#acctMenu'),r=m.getBoundingClientRect();return !m.hidden&&r.top>0&&r.bottom<=document.querySelector('#acctBtn').getBoundingClientRect().top+4;}),'its menu opens upwards, in view');
  await p.screenshot({path:'renders/home-popups-4-editor.png'});
  // unsaved work open: starting from the welcome window asks first, on top, once however often it is pressed
  await p.keyboard.press('Escape');await p.click('#homeTopBtn');await p.waitForSelector('#home');
  await p.click('#home [data-goal="land"]');await p.waitForSelector('.wl-modal:not([hidden])');
  await p.click('#wlBlank');await p.waitForSelector('.scrim [data-a="ok"]');await p.evaluate(()=>{const b=document.querySelector('#wlBlank');b.click();b.click();});await p.waitForTimeout(300);
  ok(await p.evaluate(()=>document.querySelectorAll('.scrim [data-a="ok"]').length)===1,'unsaved work: one question, however often the button is pressed');
  ok(await p.evaluate(()=>{const d=document.querySelector('.scrim [data-a="ok"]').closest('.scrim');return getComputedStyle(d).zIndex>getComputedStyle(document.querySelector('.wl-modal')).zIndex;}),'… and it is on top of the welcome window');
  await p.screenshot({path:'renders/home-popups-5-ask.png'});
  await p.click('.scrim [data-a="ok"]');await p.waitForSelector('#home',{state:'detached',timeout:15000});
  ok(await p.evaluate(()=>window.__app('doc').boards.length===1),'"Yeni proje": the editor on the new blank artboard');
  ok(!errors.length,'no page errors'+(errors.length?': '+errors.join('; '):''));
}finally{await admin.auth.admin.deleteUser(u.user.id).catch(()=>{});await b.close();}
console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
