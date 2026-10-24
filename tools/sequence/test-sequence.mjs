// The Sıra (sequence) view and the sequence export (ui/sequence.js, state/sequence.js, export/video.js), end to end
// in headless Chromium: three boards (a phone intro, the same phone from another angle, a laptop + phone set) joined by
// a camera flight and a dissolve; the strip's clips and chips, the transition card, playback through a window (board
// switch, the frozen overlay, no keys recorded, no history step), removing a clip, undo of a transition edit, the
// autosave carrying the sequence; then the MP4 export of the sequence (written to renders/sira.mp4, frames checked
// for the blend) with a frame sheet next to it (renders/sira-frames.png, needs ffmpeg).
// node tools/sequence/test-sequence.mjs [studio URL]   (a plain `npm run dev`; GPU=1 for Metal instead of SwiftShader)
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const STUDIO=process.argv[2]||'http://localhost:5173/';
const OUT=path.resolve('renders');fs.mkdirSync(OUT,{recursive:true});
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const near=(a,b,eps=.02)=>Math.abs(a-b)<eps;

const b=await chromium.launch({args:process.env.GPU?['--use-angle=metal']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.addInitScript(()=>{window.__noPhotoPreview=true;});
await p.goto(STUDIO);await p.waitForFunction(()=>!document.documentElement.classList.contains('booting')&&window.__app,null,{timeout:60000});
await p.waitForTimeout(800);
const ev=(fn,arg)=>p.evaluate(fn,arg);
const wait=ms=>p.waitForTimeout(ms);
const seqJson=()=>ev(()=>JSON.stringify(window.__app('doc').sequence));
const camTracks=()=>ev(()=>{const app=window.__app,doc=app('doc');return doc.boards.map(b=>Object.keys((b.id===doc.active?app('state').scene:b.snap.state.scene).tracks||{}).sort().join(',')).join('|');});
const past=()=>ev(()=>window.__app('historyInfo')().past.length);

try{
  // the document: three boards, 3 s each
  await ev(()=>{
    const app=window.__app,state=app('state');
    app('resetDocument')();app('addBoard')();state.anim.dur=3;
    app('applyPreset')('rise',state.devices[0]);app('applyPreset')('c-push',state.scene);app('renameBoard')(app('doc').active,'Telefon');
    app('addBoard')();state.anim.dur=3;state.scene.ry=-34;state.scene.rx=14;state.bg='solid';state.solid='#f3e3d2';app('applyTransform')();app('bgCss')();
    app('applyPreset')('float',state.devices[0]);app('renameBoard')(app('doc').active,'Telefon · yan');
    app('addBoard')();state.anim.dur=3;app('applyComp')(app('COMPS')[1]);state.bg='solid';state.solid='#1b1d24';app('bgCss')();app('renameBoard')(app('doc').active,'Masa');
    app('setMode')('animate');
  });
  await wait(600);
  await ev(()=>{document.querySelector('#tlTabs [data-view="seq"]').click();});await wait(300);
  ok(await ev(()=>!document.querySelector('#seqView').hidden&&document.querySelector('#tlBody').hidden),'the Sıra tab shows the strip in place of the lanes');
  ok(await ev(()=>!!document.querySelector('#seqView .seq-empty')),'an empty sequence shows the hint');
  await ev(()=>{document.querySelector('#seqAddAll').click();});await wait(400);
  let s=JSON.parse(await seqJson());
  ok(s.clips.length===3&&s.transitions.length===2&&s.transitions.every(t=>t.kind==='xfade'&&near(t.dur,.8)),'"Tüm artboard\'ları ekle": three clips, two dissolves of 0,8 s');
  ok(await ev(()=>document.querySelectorAll('#seqView .seq-clip').length===3&&document.querySelectorAll('#seqView .seq-tr').length===2),'three clip cards and two chips on the strip');
  ok((await ev(()=>document.querySelector('#tlDur').textContent))==='/ 7,40 sn','the bar says 7,40 sn (9 − 0,8 − 0,8)');
  ok(await ev(()=>[...document.querySelectorAll('#seqView .seq-clip .seq-th img')].every(i=>i.clientWidth>20)),'the clips show their thumbnails');

  console.log('the transition card');
  await ev(()=>{document.querySelector('#seqView .seq-tr').click();});await wait(300);
  let card=await ev(()=>{const c=document.querySelector('#seqView .kpop');return c&&{title:c.querySelector('b').textContent,fly:c.querySelector('[data-kind="fly"]').getAttribute('aria-pressed'),note:c.querySelector('.note').textContent};});
  ok(card&&card.title==='Geçiş · Telefon → Telefon · yan','the card names both boards');
  await ev(()=>{document.querySelector('#seqView .kpop [data-kind="fly"]').click();});await wait(300);
  card=await ev(()=>{const c=document.querySelector('#seqView .kpop');return c&&{fly:c.querySelector('[data-kind="fly"]').getAttribute('aria-pressed'),note:c.querySelector('.note').textContent,dur:c.querySelector('[data-f="dur"]').value};});
  ok(card&&card.fly==='true'&&/1 cihaz eşleşti/.test(card.note),'Kamera uçuşu: "1 cihaz eşleşti" (phone → phone)');
  await ev(()=>{const tf=document.querySelector('#seqView .kpop [data-f="dur"]');tf.value='1,0';tf.dispatchEvent(new Event('change'));});await wait(300);
  s=JSON.parse(await seqJson());ok(s.transitions[0].kind==='fly'&&near(s.transitions[0].dur,1),'the duration field sets 1,0 s');
  ok((await ev(()=>document.querySelector('#tlDur').textContent))==='/ 7,20 sn','…and the total is 7,20 sn');
  await ev(()=>{document.querySelectorAll('#seqView .seq-tr')[1].click();});await wait(200);
  await ev(()=>{document.querySelector('#seqView .kpop [data-kind="fly"]').click();});await wait(300);
  card=await ev(()=>{const c=document.querySelector('#seqView .kpop');return c&&c.querySelector('.note').textContent;});
  ok(/eşleşmiyor/.test(card),'phone → laptop set: "Cihazlar eşleşmiyor" (the camera flies, the scenes dissolve)');
  await ev(()=>{document.querySelector('#seqView .kpop [data-kind="xfade"]').click();});await wait(300);
  // the history records a change one or two polls later: settle it now, so the count below is the playback's alone
  const settle=async()=>{await ev(()=>window.__app('takeDoc')());await wait(400);};
  await settle();const p0=await past();

  console.log('playback through the first window (2,0 → 3,0 s)');
  const tracks0=await camTracks();
  await ev(()=>{window.__app('SEQ').seek(1.7);});await wait(200);
  ok((await ev(()=>window.__app('doc').active))===(await ev(()=>window.__app('doc').boards[0].id)),'seeking to 1,7 s shows the first board');
  await ev(()=>{window.__app('SEQ').play();});
  const log=[];let shot=false;for(let i=0;i<24;i++){await wait(100);if(!shot&&log.length&&log[log.length-1].t>2.3){shot=true;await p.screenshot({path:path.join(OUT,'sira-live.png'),clip:{x:160,y:60,width:1120,height:560}});}log.push(await ev(()=>{const app=window.__app,SEQ=app('SEQ'),ov=document.querySelector('.seq-over');return {t:+SEQ.time().toFixed(2),b:app('doc').boards.findIndex(x=>x.id===app('doc').active),over:!!ov&&!ov.hidden,ry:+app('state').scene.ry.toFixed(1),mute:app('A').mute};}));}
  await ev(()=>{window.__app('SEQ').stop();});await wait(100);
  const inWin=log.filter(x=>x.t>2.05&&x.t<2.95);
  ok(log[log.length-1].t>log[0].t,'the sequence time advances ('+log[0].t+' → '+log[log.length-1].t+' s)');
  ok(inWin.length>2&&inWin.every(x=>x.b===1&&x.over),'inside the window the second board is live with the frozen frame over it ('+inWin.length+' samples; renders/sira-live.png)');
  ok(inWin.some(x=>x.ry>-30&&x.ry<24),'…and its camera is in between the two views (ry '+inWin.map(x=>x.ry).join(' ')+')');
  ok(log.every(x=>x.mute),'the recorder is muted while it plays');
  ok(!(await ev(()=>window.__app('A').mute)),'…and unmuted after');
  const after=await ev(()=>{const app=window.__app,doc=app('doc'),b=doc.boards.find(x=>x.id===doc.active);return {ry:+app('state').scene.ry.toFixed(1),board:doc.boards.indexOf(b),t:+app('SEQ').time().toFixed(2),snapRy:b.snap.state.scene.ry,At:+app('A').t.toFixed(2)};});
  ok(after.ry===-34,'the live board has its own camera back (ry −34): '+JSON.stringify(after)+' log end '+JSON.stringify(log[log.length-1]));
  ok(await camTracks()===tracks0,'no camera keys were recorded ('+tracks0+')');
  await settle();ok(await past()===p0,'playback made no history step ('+p0+' → '+await past()+')');

  console.log('editing');
  await ev(()=>{document.querySelectorAll('#seqView .seq-tr')[0].click();});await wait(200);
  await ev(()=>{document.querySelector('#seqView .kpop [data-kind="slide"]').click();});await wait(500);
  s=JSON.parse(await seqJson());ok(s.transitions[0].kind==='slide'&&s.transitions[0].dir==='left','a kind change: slide, direction left');
  await wait(400);await ev(()=>window.__app('undo')());await wait(400);
  s=JSON.parse(await seqJson());ok(s.transitions[0].kind==='fly','undo brings the flight back');
  await ev(()=>{document.querySelectorAll('#seqView .seq-clip')[2].querySelector('[data-a="rm"]').click();});await wait(300);
  s=JSON.parse(await seqJson());ok(s.clips.length===2&&s.transitions.length===1&&s.transitions[0].kind==='fly','✕ on the third clip: two clips, the flight stays');
  await ev(()=>{document.querySelectorAll('#seqView .seq-clip')[0].querySelector('[data-a="rm"]').click();});await wait(300);
  s=JSON.parse(await seqJson());ok(s.clips.length===1&&s.transitions.length===0,'✕ on the first clip: one clip, no transition');
  await ev(()=>{document.querySelector('#seqAddAll').click();});await wait(300);
  await ev(()=>{const app=window.__app,s=app('doc').sequence;s.transitions[0]={kind:'fly',dur:1,ease:'smooth'};s.transitions[1]={kind:'xfade',dur:.6,ease:'linear'};app('emitBoards')();});await wait(600);
  // the autosave: the document comes back with its sequence
  await ev(()=>new Promise(r=>setTimeout(r,900)));
  const saved=await ev(async()=>{const d=await window.__app('loadAutosave')();return d&&JSON.stringify(d.sequence);});
  ok(saved===await seqJson(),'the autosave carries the sequence');
  const removed=await ev(()=>{const app=window.__app,doc=app('doc');const id=doc.boards[1].id;app('removeBoard')(id);return JSON.stringify(doc.sequence);});
  // the middle clip goes with the transition on its left; the one on its right (the dissolve) joins the neighbours
  ok(JSON.parse(removed).clips.length===2&&JSON.parse(removed).transitions.length===1&&JSON.parse(removed).transitions[0].kind==='xfade','deleting a board drops its clip and the transition on its left ('+removed+')');
  await wait(300);await ev(()=>window.__app('undo')());await wait(500);
  s=JSON.parse(await seqJson());ok(s.clips.length===3,'undo of the delete restores the clip');

  console.log('export (MP4, 1080 px, fast)');
  const t0=Date.now();
  const res=await ev(async()=>{
    const app=window.__app,X=app('videoOptions');Object.assign(X,{res:1080,fps:30,blur:true,format:'mp4',quality:'fast',source:'seq'});
    const blob=await app('renderVideo')(()=>{});
    const buf=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<buf.length;i+=0x8000)s+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));
    return {b64:btoa(s),size:blob.size,active:app('doc').active,mute:app('A').mute,ry:app('state').scene.ry};
  });
  const sec=(Date.now()-t0)/1000;
  const mp4=path.join(OUT,'sira.mp4');fs.writeFileSync(mp4,Buffer.from(res.b64,'base64'));
  ok(res.size>50000,'the MP4 is written: renders/sira.mp4, '+(res.size/1e6).toFixed(1)+' MB in '+sec.toFixed(0)+' s');
  ok(!res.mute&&res.ry===-34,'after the export the recorder is unmuted and the home board is live again');
  const want=await ev(()=>{const app=window.__app,L=app('layoutSeq')(app('doc').sequence,app('boardDur')),[w,h]=app('exportSize')(1080,1080,app('doc').boards.find(b=>b.id===app('doc').sequence.clips[0].board).snap.state);return {n:Math.round(app('seqTotal')(L)*30),w:w-w%2,h:h-h%2,total:app('seqTotal')(L)};});
  let probe=null;try{probe=execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,width,height,r_frame_rate','-of','csv=p=0',mp4]).toString().trim();}catch(e){console.log('  (ffprobe yok: kare sayısı denetlenmedi)');}
  if(probe){const [w,h,rate,n]=probe.split(',');ok(+n===want.n&&+w===want.w&&+h===want.h,'ffprobe: '+n+' frames at '+w+'×'+h+' ('+rate+'); expected '+want.n+' = '+want.total.toFixed(1)+' s × 30 at '+want.w+'×'+want.h+' (1080 px: the long edge)');
    // frames: before, inside and after the flight (2,0–3,0 s) and the dissolve (5,4–6,0 s)
    const times=[1.5,2.0,2.3,2.6,2.9,4.5,5.7,6.5],files=[];
    for(const t of times){const f=path.join(OUT,'sira-'+t.toFixed(1).replace('.','_')+'.png');try{execFileSync('ffmpeg',['-v','error','-y','-ss',String(t),'-i',mp4,'-frames:v','1',f]);files.push(f);}catch(e){}}
    if(files.length===times.length){execFileSync('node',[path.resolve('tools/render-harness/sheet.js'),path.join(OUT,'sira-frames.png'),'4','300',...files]);console.log('  frames: renders/sira-frames.png ('+times.join(', ')+' s)');}
  }
}finally{
  if(errs.length){console.log('page errors:');errs.forEach(e=>console.log('  '+e));fails++;}
  await b.close();
}
console.log(fails?fails+' FAIL':'all ok');process.exit(fails?1:0);
