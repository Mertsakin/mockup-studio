// The English UI (src/lang.js, src/lang-en.js), end to end in headless Chromium: the studio opened with ?lang=en must
// show no Turkish anywhere the test can reach (the static markup, the menus, the inspectors, the timeline, the
// shortcut sheet, the template gallery, the welcome card, the empty-screen placeholder), the same page opened
// without the parameter in a Turkish browser must still be Turkish, and any other browser gets English (the default).
// node tools/i18n/test-ui-lang.mjs [studio URL]   (a plain `npm run dev` on 5173; no accounts needed)
import {chromium} from 'playwright';

const STUDIO=process.argv[2]||'http://localhost:5173/';
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
// Turkish left over: its own letters, and the function words English never uses
const TR=/[şğıİ]|\b(ve|ile|için|ya da|veya|bir|bu|yok|ekle|sil)\b/i;

const b=await chromium.launch();
const errs=[];
async function open(lang,locale){
  const ctx=await b.newContext({locale,viewport:{width:1440,height:900}}),p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.addInitScript(()=>{window.__noPhotoPreview=true;});
  await p.goto(STUDIO+(lang?'?lang='+lang:''));
  await p.waitForFunction(()=>!document.documentElement.classList.contains('booting')&&window.__app,null,{timeout:60000});
  await p.waitForTimeout(600);
  return p;
}
// every text the page shows or names: text nodes (visible), aria-label / title / placeholder of every element, the
// page title; elements marked lang="…" (the language names themselves) and user content (names of things) are skipped
const texts=p=>p.evaluate(()=>{
  const out=[],seen=new Set(),push=(s,where)=>{s=(s||'').replace(/\s+/g,' ').trim();if(s&&!seen.has(s)){seen.add(s);out.push([s,where]);}};
  push(document.title,'title');
  const skip=el=>el.closest('[lang],.title-in,.nm,#projName,.ren,.ab-ren,.tedit,textarea,input');
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  for(let n=w.nextNode();n;n=w.nextNode()){
    if(n.nodeType===3){const el=n.parentElement;if(!el||skip(el)||/^(SCRIPT|STYLE)$/.test(el.tagName))continue;push(n.nodeValue,el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.className?'.'+String(el.className).split(' ')[0]:''));}
    else{if(skip(n))continue;for(const a of ['aria-label','title','placeholder','alt'])if(n.getAttribute(a))push(n.getAttribute(a),a+'@'+n.tagName.toLowerCase()+(n.id?'#'+n.id:''));}
  }
  return out;
});
const scan=async(p,what)=>{const bad=(await texts(p)).filter(([s])=>TR.test(s));ok(!bad.length,what+': no Turkish left'+(bad.length?' — '+bad.slice(0,12).map(([s,w])=>w+' «'+s.slice(0,60)+'»').join(' | ')+(bad.length>12?' …+'+(bad.length-12):''):''));};
const click=async(p,sel)=>{await p.click(sel);await p.waitForTimeout(250);};

try{
  console.log('English (?lang=en in an English browser)');
  let p=await open('en','en-US');
  ok(await p.evaluate(()=>document.documentElement.lang)==='en','html[lang] is en');
  ok(await p.title()==='Shotlight · studio','the title is English');
  ok(await p.evaluate(()=>localStorage.getItem('shotlight.lang'))==='en','?lang=en is remembered');
  // the welcome card (an empty document)
  await p.evaluate(()=>{const app=window.__app;if(app('hasBoard')())app('clearAll')();});await p.waitForTimeout(400);
  await scan(p,'welcome card');
  // an artboard with the default scene: the inspector (artboard), the dock, the top bar, the layer tree
  await p.evaluate(()=>window.__app('addBoard')());await p.waitForTimeout(800);
  await scan(p,'editor with an artboard');
  // the device inspector and the device menu
  await p.evaluate(()=>{const app=window.__app,state=app('state');state.selected=state.devices[0].id;app('syncAll')();app('setUi')({kind:'device'});});await p.waitForTimeout(300);
  await click(p,'#dock [data-add="device"]');await scan(p,'device inspector + device menu');await p.keyboard.press('Escape');
  // the light inspector and the light menu
  await p.evaluate(()=>{const app=window.__app;app('setUi')({kind:'light'});});await p.waitForTimeout(200);
  await click(p,'#dock [data-add="light"]');await scan(p,'light inspector + light menu');await p.keyboard.press('Escape');
  // a text item: the item inspector with the effect options
  await p.evaluate(()=>{const app=window.__app;const it=app('addText')({});app('selectItem')(it.id);});await p.waitForTimeout(300);
  ok(await p.evaluate(()=>window.__app('state').items[0].text)==='Your headline','a new text item starts with the English default text');
  await scan(p,'text item inspector');
  // Animate: the timeline, a preset, the edit card, the preset menu
  await p.evaluate(()=>{const app=window.__app,state=app('state'),d=state.devices[0];state.selected=d.id;app('syncAll')();app('setUi')({kind:'device'});app('setMode')('animate');app('applyPreset')('rise',d);app('seek')(1.2);});
  await p.waitForTimeout(400);
  await p.evaluate(()=>{document.querySelectorAll('#tlNames .caret')[1].click();});await p.waitForTimeout(300);
  await click(p,'#tlPresetBtn');await scan(p,'timeline + preset menu');await p.keyboard.press('Escape');
  await p.evaluate(()=>{const k=document.querySelector('#tlLanes .lane[data-ref="d1"]:not([data-prop]) .kf');if(k)k.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,clientX:k.getBoundingClientRect().x+3,clientY:k.getBoundingClientRect().y+3}));});
  await p.mouse.up();await p.waitForTimeout(300);await scan(p,'key edit card');
  // the sequence (Sıra) view: a second artboard, all boards added, a transition card, then the export dialog's note
  await p.evaluate(()=>window.__app('addBoard')());await p.waitForTimeout(600);
  await click(p,'#tlTabs [data-view="seq"]');await click(p,'#seqAddAll');
  await p.evaluate(()=>{const c=document.querySelector('#seqView .seq-tr');if(c)c.click();});await p.waitForTimeout(300);
  await scan(p,'sequence view + transition card');
  await click(p,'#exportMenuBtn');await p.waitForTimeout(300);await scan(p,'video export dialog (sequence)');await p.keyboard.press('Escape');await p.waitForTimeout(200);
  await click(p,'#tlTabs [data-view="board"]');
  await p.evaluate(()=>window.__app('setMode')('design'));await p.waitForTimeout(200);
  // the menus: app menu (theme + language), export menu, shortcut sheet
  await click(p,'#appMenuBtn');await scan(p,'app menu');await p.keyboard.press('Escape');
  await click(p,'#exportMenuBtn');await scan(p,'export menu');await p.keyboard.press('Escape');
  await p.evaluate(()=>window.__app('openSheet')());await p.waitForTimeout(200);await scan(p,'keyboard shortcuts sheet');await p.keyboard.press('Escape');
  // the template gallery and the assets tab
  await click(p,'#tabTpl');await p.waitForFunction(()=>document.querySelectorAll('#tplGrid .tpl').length>0,null,{timeout:15000});await scan(p,'templates tab');
  await click(p,'#tabAssets');await scan(p,'assets tab');await click(p,'#tabLayers');
  // the right-click menu on the canvas
  await p.click('#gl',{button:'right'});await p.waitForTimeout(250);await scan(p,'context menu');await p.keyboard.press('Escape');
  // the empty screen's placeholder is drawn into the screen texture
  const ph=await p.evaluate(()=>typeof window.__app('t')==='function'&&window.__app('t')('Ekran görüntünü ekle'));
  ok(ph==='Add your screenshot','the screen placeholder text is translated');
  // the account language switch is in the app menu
  ok(await p.evaluate(()=>[...document.querySelectorAll('#langSeg button')].map(b=>b.textContent+':'+b.getAttribute('aria-pressed')).join(' '))==='Türkçe:false English:true','the app menu shows the language with English pressed');
  await p.context().close();

  console.log('Turkish (no parameter, a Turkish browser; the remembered choice does not leak: a new context)');
  p=await open('','tr-TR');
  ok(await p.evaluate(()=>document.documentElement.lang)==='tr','html[lang] is tr');
  ok(await p.title()==='Shotlight · stüdyo','the title is Turkish');
  ok(await p.evaluate(()=>document.querySelector('#modeSeg [data-mode="design"]').textContent)==='Tasarla','the mode switch reads Tasarla');
  ok(await p.evaluate(()=>window.__app('t')('Geri al'))==='Geri al','t() returns the source text in Turkish');
  await p.context().close();

  console.log('English browser, no parameter: follows the browser');
  p=await open('','en-US');
  ok(await p.evaluate(()=>document.documentElement.lang)==='en','html[lang] follows navigator.language');
  await p.context().close();

  console.log('German browser, no parameter: English is the default');
  p=await open('','de-DE');
  ok(await p.evaluate(()=>document.documentElement.lang)==='en','any other browser language gets English');
  await p.context().close();
}catch(e){console.error(e);fails++;}
finally{await b.close();}
ok(!errs.length,'no page errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
console.log(fails?'\n'+fails+' FAILED':'\nall passed');
process.exit(fails?1:0);
