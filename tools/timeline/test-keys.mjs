// The Canlandır timeline's key editing (ui/timeline.js, ui/animate.js), end to end in headless Chromium: selection
// (click, Shift + click, marquee, ⌘A, Esc), moving the selection together, ⌥ ← / → nudge, the row navigator ◀ ◆ ▶,
// double-click keying, ↑ / ↓, the edit card (time, ease, design frame, Sil), transition bars, zoom / pan / paging,
// the clipboard (⌘C / ⌘X / ⌘V / ⌘D), stretch handles, the right-click menu and the bar's time field.
// node tools/timeline/test-keys.mjs [studio URL]   (a plain `npm run dev` on 5173; no accounts needed)
import {chromium} from 'playwright';

const STUDIO=process.argv[2]||'http://localhost:5173/';
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const near=(a,b,eps=.02)=>Math.abs(a-b)<eps;
const sameTimes=(ts,want)=>ts.length===want.length&&ts.every((t,i)=>near(t,want[i]));

const b=await chromium.launch();
const p=await b.newPage({locale:'tr-TR',viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.addInitScript(()=>{window.__noPhotoPreview=true;});
await p.goto(STUDIO);await p.waitForFunction(()=>!document.documentElement.classList.contains('booting')&&window.__app,null,{timeout:60000});
await p.waitForTimeout(800);
await p.evaluate(()=>{const app=window.__app;if(!app('hasBoard')())app('addBoard')();});await p.waitForTimeout(800);

/* ---------- helpers (the page side reads the editor through window.__app, debug.js) */
const ev=(fn,arg)=>p.evaluate(fn,arg);
const wait=ms=>p.waitForTimeout(ms);
// the phone's track times, rounded to 3 decimals
const times=prop=>ev(prop=>{const d=window.__app('state').devices[0];return (d.tracks[prop]||[]).map(k=>+k.t.toFixed(3));},prop);
const sel=()=>ev(()=>window.__app('A').sel.length);
const seg=()=>ev(()=>window.__app('A').seg);
const t=()=>ev(()=>+window.__app('A').t.toFixed(3));
const seek=x=>ev(x=>window.__app('seek')(x),x).then(()=>wait(150));
const center=sel=>ev(sel=>{const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];},sel);
// a diamond of the phone: the summary row (prop null) or a value row
const key=(prop,at)=>ev(([prop,at])=>{const k=[...document.querySelectorAll('#tlLanes .lane[data-ref="d1"]'+(prop?'[data-prop="'+prop+'"]':':not([data-prop])')+' .kf')].find(x=>Math.abs(+x.dataset.t-at)<.02);
  if(!k)return null;const r=k.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];},[prop,at]);
const click=async(c,opts)=>{await p.mouse.click(c[0],c[1],opts);await wait(200);};
const drag=async(from,to,steps=6)=>{await p.mouse.move(from[0],from[1]);await p.mouse.down();await p.mouse.move(from[0]+(to[0]-from[0])*.3,from[1]+(to[1]-from[1])*.3,{steps:2});await p.mouse.move(to[0],to[1],{steps});await p.mouse.up();await wait(250);};
const card=()=>ev(()=>{const c=document.querySelector('#tlLanes .kpop');if(!c)return null;const tf=c.querySelector('#kpT');
  return {title:c.querySelector('b').textContent,time:tf?tf.value:c.querySelector('.tf').textContent,eases:[...c.querySelectorAll('[data-ease]')].map(x=>x.dataset.ease+':'+x.getAttribute('aria-pressed')+(x.disabled?'!':'')).join(' '),design:c.querySelector('#kpDesign')?c.querySelector('#kpDesign').getAttribute('aria-pressed'):null};});
const press=async k=>{await p.keyboard.press(k);await wait(200);};

try{
  // the scene: the phone with "Aşağıdan yüksel" + "Süzülme", the camera's "Yaklaşarak gir", the light's "Solarak yan"
  await ev(()=>{const app=window.__app,state=app('state'),d=state.devices[0];state.selected=d.id;app('syncAll')();app('setUi')({kind:'device'});app('setMode')('animate');
    app('applyPreset')('rise',d);app('applyPreset')('float',d);app('applyPreset')('c-push',state.scene);if(state.lights[0])app('applyPreset')('l-fade',state.lights[0]);app('seek')(1.2);});
  await wait(300);await ev(()=>{document.querySelectorAll('#tlNames .caret')[1].click();});await wait(300);
  ok(sameTimes(await times('py'),[0,1.267,2.5,3.767,5]),'the phone has keys at 0, 1,27, 2,5, 3,77 and 5 s');
  ok(!(await ev(()=>document.querySelector('#keySec'))),'the inspector has no key section (the card replaces it)');

  console.log('selection');
  await click(await key(null,2.5));
  ok(await sel()===2&&near(await t(),2.5),'a click on a summary diamond selects its two keys and seeks there');
  await p.keyboard.down('Shift');await click(await key(null,3.767));await p.keyboard.up('Shift');
  ok(await sel()===4,'Shift + click adds the next diamond');
  await p.keyboard.down('Shift');await click(await key(null,3.767));await p.keyboard.up('Shift');
  ok(await sel()===2,'Shift + click on a selected diamond removes it');
  const k25=await key(null,2.5),kRz=await key('rz',3.767);
  await drag([k25[0]-20,k25[1]-12],[kRz[0]+20,kRz[1]+10]);
  ok(await sel()===4,'a marquee across the rows picks the four keys between 2,5 and 3,77 s');
  let c=await card();ok(c&&c.title==='4 anahtar kare'&&c.time==='2,50','…and the card says "4 anahtar kare · 2,50"');
  await press('Meta+a');ok(await sel()===12,'⌘A (after a press in the timeline) selects every key of the phone');
  await press('Escape');ok(await sel()===0&&!(await card()),'Esc drops the selection and the card');

  console.log('moving');
  await drag([k25[0]-20,k25[1]-12],[kRz[0]+20,kRz[1]+10]);
  const c25=await key(null,2.5),pps=await ev(()=>{const k=[...document.querySelectorAll('#tlLanes .lane:not(.subl) .kf')];const a=k.find(x=>+x.dataset.t===0),e=k.find(x=>+x.dataset.t===5);return (parseFloat(e.style.left)-parseFloat(a.style.left))/5;});
  await drag(c25,[c25[0]-pps*.5,c25[1]]);
  ok(sameTimes(await times('py'),[0,1.267,2,3.267,5])&&sameTimes(await times('rz'),[0,1.267,2,3.267,5]),'dragging a selected diamond moves the four keys together (−0,5 s, snapped to the second)');
  await press('Alt+ArrowLeft');
  ok(sameTimes(await times('py'),[0,1.267,1.967,3.233,5]),'⌥ ← nudges them a frame earlier');
  await press('Alt+ArrowRight');
  ok(sameTimes(await times('py'),[0,1.267,2,3.267,5]),'⌥ → brings them back');
  c=await card();await click(await center('#kpT'));await ev(()=>document.querySelector('#kpT').select());await p.keyboard.type('2,5');await press('Enter');
  ok(sameTimes(await times('py'),[0,1.267,2.5,3.767,5]),'typing 2,5 in the card moves the selection back to 2,5 s');
  await press('Escape');

  console.log('row navigator, double-click, ↑ ↓');
  await seek(1.2);
  await click(await center('#tlNames .tl-name[data-prop="scale"] .kd'));
  ok((await times('scale')).length===1,'◆ on the Ölçek row removes its key at the playhead');
  await click(await center('#tlNames .tl-name[data-prop="scale"] .kd'));
  ok(sameTimes(await times('scale'),[0,1.2]),'…and puts it back');
  await click(await center('#tlNames .tl-name[data-ref="d1"]:not(.subrow) .nx'));
  ok(near(await t(),1.267),'▶ on the phone row jumps to its next key');
  await press('ArrowUp');await press('ArrowUp');
  ok(near(await t(),0),'↑ twice reaches 0 s');
  await press('ArrowDown');ok(near(await t(),1.2),'↓ goes to 1,2 s');
  const lane=await ev(()=>{const l=document.querySelector('#tlLanes .lane[data-prop="py"]'),r=l.getBoundingClientRect();const k=[...document.querySelectorAll('#tlLanes .lane:not(.subl) .kf')];const a=k.find(x=>+x.dataset.t===0).getBoundingClientRect().x+7,e=k.find(x=>+x.dataset.t===5).getBoundingClientRect().x+7;return [a+(e-a)*3.1/5,r.y+r.height/2];});
  await p.mouse.click(lane[0],lane[1]);await wait(120);await p.mouse.click(lane[0],lane[1]);await wait(300);
  ok(sameTimes(await times('py'),[0,1.267,2.5,3.1,3.767,5])&&near(await t(),3.1),'a double-click on the Dikey lane keys it at 3,1 s');
  await press('Delete');
  ok(sameTimes(await times('py'),[0,1.267,2.5,3.767,5])&&await sel()===0,'Delete removes the new key (it was selected)');

  console.log('transitions and the card');
  await click(await center('#tlLanes .lane[data-ref="d1"]:not([data-prop]) .seg-bar[data-t0="2.5"]'));
  let s=await seg();ok(s&&s.prop===null&&near(s.t0,2.5)&&near(s.t1,3.767),'a click on the summary bar selects the transition 2,5 → 3,77');
  c=await card();ok(c&&c.title==='Geçiş'&&/smooth:true/.test(c.eases),'…the card is "Geçiş" with Yumuşak pressed');
  await click(await center('#tlLanes .kpop [data-ease="linear"]'));
  ok(await ev(()=>{const d=window.__app('state').devices[0];return ['py','rz'].every(k=>d.tracks[k].find(x=>Math.abs(x.t-2.5)<.02).ease==='linear');}),'Doğrusal applies to both keys at 2,5 s');
  await click(await key(null,5));c=await card();
  ok(c&&/smooth:true!/.test(c.eases),'the last key: the ease buttons are off');
  await click(await key(null,2.5));await click(await center('#tlLanes .kpop #kpDesign'));
  ok(await ev(()=>window.__app('state').devices[0].designT)===2.5,'the card\'s design-frame button moves the design frame to 2,5 s');
  await ev(()=>{window.__app('state').devices[0].designT=1.2;});
  await press('Escape');

  console.log('zoom and pan');
  for(let i=0;i<3;i++)await click(await center('#tlZoomIn'));
  ok(await ev(()=>document.querySelector('#tlZoom').textContent)==='3.4×'&&(await ev(()=>document.querySelectorAll('.tick.frame').length))>0,'three + clicks: 3,4× with frame ticks on the ruler');
  const labels=()=>ev(()=>[...document.querySelectorAll('#tlLanes .tick:not(.minor):not(.frame) span')].map(x=>x.textContent).join(' '));
  const l0=await labels();const lp=await ev(()=>{const r=document.querySelector('#tlLanes').getBoundingClientRect();return [r.x+300,r.y+60];});
  await p.mouse.move(lp[0],lp[1]);await p.mouse.wheel(300,0);await wait(300);
  ok((await labels())!==l0,'a horizontal wheel pans the view');
  await p.mouse.wheel(-300,0);await wait(200);
  await seek(4.8);ok(/5 sn/.test(await labels()),'seeking out of view pages the view to the playhead');
  await press('Shift+Digit1');ok(await ev(()=>document.querySelector('#tlZoom').textContent)==='1×','⇧1 fits the whole duration');

  console.log('clipboard and stretch');
  await seek(1.2);
  const a25=await key(null,2.5),aRz=await key('rz',3.767);await drag([a25[0]-20,a25[1]-12],[aRz[0]+20,aRz[1]+10]);
  ok(await sel()===4,'four keys selected again');
  await press('Meta+c');await seek(0.5);await press('Meta+v');
  ok(sameTimes(await times('py'),[0,0.5,1.267,1.767,2.5,3.767,5])&&await sel()===4,'⌘C then ⌘V at 0,5 s pastes the four keys there, the gap kept, and selects them');
  await seek(4);await press('Meta+d');
  ok(sameTimes(await times('py'),[0,0.5,1.267,1.767,2.5,3.767,4,5])&&await sel()===2,'⌘D at 4 s duplicates what fits (the key past the end is dropped)');
  await press('Meta+x');
  ok(sameTimes(await times('py'),[0,0.5,1.267,1.767,2.5,3.767,5]),'⌘X cuts the duplicates');
  await press('Meta+v');ok(sameTimes(await times('py'),[0,0.5,1.267,1.767,2.5,3.767,4,5]),'…and ⌘V brings them back at the playhead');
  await press('Meta+x');
  const b25=await key(null,2.5),bRz=await key('rz',3.767);await drag([b25[0]-20,b25[1]-12],[bRz[0]+20,bRz[1]+10]);
  const h=await center('#tlLanes .range i.r');ok(!!h,'a selection apart in time shows the range with stretch handles');
  await drag(h,[h[0]+pps*.6,h[1]]);
  ok(sameTimes(await times('py'),[0,0.5,1.267,1.767,2.5,4.367,5]),'dragging the right handle 0,6 s stretches the selection (3,77 → 4,37)');
  await click(await key(null,2.5),{button:'right'});
  const menu=await ev(()=>[...document.querySelectorAll('.menu.ctx:not([hidden]) .mi')].map(x=>x.textContent.trim()));
  ok(menu.length===10&&menu[0].startsWith('Kopyala')&&/sil/.test(menu[9]),'the right-click menu: clipboard, four eases, design frame, Sil');
  await press('Escape');
  // paste onto another phone
  await ev(()=>{const app=window.__app,s=app('state');app('selectAllKeys')(s.devices[0]);});await press('Meta+c');
  await ev(()=>{const app=window.__app,s=app('state');const d=app('newDevice')('phone');s.devices.push(d);app('rebuild')(d);s.selected=d.id;app('syncAll')();app('setUi')({kind:'device'});app('seek')(0);});await wait(400);
  await ev(()=>{const r=document.querySelector('#tlLanes .ruler'),b=r.getBoundingClientRect();r.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:b.x+30,clientY:b.y+10}));});await p.mouse.up();await wait(100);
  await ev(()=>{const app=window.__app,s=app('state');s.selected=s.devices[1].id;app('syncAll')();app('setUi')({kind:'device'});app('seek')(0);});await wait(200);
  await press('Meta+v');
  ok(await ev(()=>{const d=window.__app('state').devices[1];return !!(d.tracks&&d.tracks.py&&d.tracks.py.length===7);}),'⌘V with the second phone current pastes the first phone\'s keys onto it');

  console.log('the bar\'s time field');
  await click(await center('#tlT'));await ev(()=>document.querySelector('#tlT').select());await p.keyboard.type('2,4');await press('Enter');
  ok(near(await t(),2.4),'typing 2,4 and Enter seeks to 2,4 s');
  await click(await center('#tlT'));await ev(()=>document.querySelector('#tlT').select());await p.keyboard.type('36k');await press('Enter');
  ok(near(await t(),1.2),'typing 36k (frames) seeks to 1,2 s');
  await click(await center('#tlT'));await ev(()=>document.querySelector('#tlT').select());await p.keyboard.type('9');await press('Escape');
  ok(near(await t(),1.2)&&await ev(()=>document.querySelector('#tlT').value)==='1,20','Esc gives the playhead\'s time back');

  ok(!errs.length,'no page errors'+(errs.length?': '+errs.join(' | '):''));
}finally{await b.close();}
console.log(fails?`\n${fails} FAILED`:'\nall checks passed');process.exit(fails?1:0);
