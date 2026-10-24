import {updateChrome} from '../devices/screen.js';
import {fmtDur} from '../devices/video.js';
import {mp4Encoder} from '../export/mp4.js';
import {TYPES} from '../state/constants.js';
import {sel,state} from '../state/state.js';
import {$,$$,mkCanvas} from '../util.js';
import {seek,setMode} from './animate.js';
import {captureOpts,normalizeUrl,putShot,setLiveCapture,shotGroups,shotImage,siteName,viewport} from './capture.js';
import {loadShotVideo} from './image-input.js';
import {syncAll} from './sync.js';
import {fmt,t as tx} from '../lang.js';
import {toast} from './toast.js';

/* "Ekran kaydı": the site opens live inside the studio, in a lightbox, at the selected device's viewport. The page runs
   in the dev server's Chrome (tools/capture/record.mjs, persistent profile: logins and solved bot checks stay) and its
   picture streams here as CDP screencast frames (JPEG) over /api/record/ws; the mouse and keyboard on the canvas go
   back, so cookie banners, logins and verifications are the user's to handle. Başlat encodes while recording: the
   frames drawn on the canvas also go to an H.264 encoder (export/mp4.js) on a FPS clock, each output frame showing
   the newest frame received by its time, so only the compressed video is kept (MAX_MS, 2 min at REC_BPP ≈ 75 MB;
   then it stops by itself). With İmleç on, the pointer (an arrow, a ring on each press) is drawn over the frames:
   it is the page's own cursor position, which the screencast does not show. Durdur finishes the file and puts it
   on the target device screens through the screen-video loader (image-input.js), then switches to Canlandır.
   Keys never reach the studio while the lightbox is open (a capture-phase listener on window); Esc closes it.
   "Ekran görüntüsü al" (the Ekran section's Yakala opens the lightbox for this) asks the server for screenshots of the
   page as it is, one per target viewport (Bu cihaz / Tümü, as the capture endpoint groups them: equal viewports share
   one), the visible area or the whole page, at the capture's own sharpness, and puts them on the screens (putShot). */
const FPS=30,MAX_MS=120000,REC_BPP=.05;  // a screen recording is mostly still: a third of the export's bits per pixel
// the stream's sharpness: the server's cap (record.mjs recordDpr), mirrored here for the label and the canvas
const REC_DPR_MAX=3,REC_PX=3.2e6;
const recordDpr=(w,h,want)=>Math.max(1,Math.floor(Math.min(REC_DPR_MAX,Math.sqrt(REC_PX/(w*h)),Math.max(1,want||1))*4)/4);
const scrim=$('#recScrim'),canvas=$('#recCanvas'),g=canvas.getContext('2d'),stage=$('#recStage'),urlIn=$('#recUrl'),vpEl=$('#recVp'),
  timeEl=$('#recTime'),startBtn=$('#recStart'),windowBtn=$('#recWindow'),statusEl=$('#recStatus'),noteEl=$('#recNote'),autoEl=$('#recAuto'),autoDur=$('#recAutoDur'),
  backBtn=$('#recBack'),reloadBtn=$('#recReload'),shotBtn=$('#recShot'),waitEl=$('#recWait'),waitTxt=$('#recWaitText');
const R={ws:null,open:false,ready:false,dev:null,vp:null,target:'one',shotMode:'full',last:null,rec:null,recT0:0,recEnd:0,timer:0,encoding:false,headed:false,url:'',prevFocus:null,
  cur:{x:0,y:0,in:false},presses:[],shooting:false};
const fmtX=x=>fmt(Math.round(x*4)/4)+'×';
const status=t=>{statusEl.textContent=t||'';statusEl.title=t||'';};
const note=t=>{noteEl.textContent=t||'';noteEl.hidden=!t;};
// the spinner over the page (a screenshot being taken, the recording being encoded); empty: hidden
const wait=t=>{waitTxt.textContent=t||'';waitEl.hidden=!t;};
const waiting=()=>!waitEl.hidden;
const send=m=>{if(R.ws&&R.ws.readyState===1)R.ws.send(JSON.stringify(m));};
const recording=()=>!!R.rec;

/* ---------- open / close */
// target: 'one' / 'all' (which devices the shot or the recording goes to)
function openRecord(url,target){
  if(R.open)return;
  const d=sel();if(!d){toast(tx('Önce bir cihaz ekle.'));return;}
  const vp=viewport(d);if(!vp){toast(tx('Bu cihazın ekranı yok. Kendi çerçeven için önce bir çerçeve PNG’si yükle.'));return;}
  vp.dpr=recordDpr(vp.width,vp.height,vp.dpr);
  R.dev=d;R.vp=vp;R.open=true;R.ready=false;R.headed=false;R.last=null;R.rec=null;R.url='';R.shooting=false;R.prevFocus=document.activeElement;
  if(target)R.target=target;
  vpEl.textContent=tx(TYPES[d.type])+' · '+vp.width+' × '+vp.height+' · '+fmtX(vp.dpr);
  canvas.width=Math.round(vp.width*vp.dpr);canvas.height=Math.round(vp.height*vp.dpr);g.clearRect(0,0,canvas.width,canvas.height);
  urlIn.value=url||'';timeEl.textContent='';note('');wait('');status(tx('Bağlanılıyor…'));
  startBtn.disabled=windowBtn.disabled=backBtn.disabled=reloadBtn.disabled=shotBtn.disabled=true;windowBtn.hidden=false;
  setTarget(R.target);setShotMode(R.shotMode);syncStart();
  scrim.hidden=false;fit();canvas.focus({preventScroll:true});
  connect(url?normalizeUrl(url):'');
}
function closeRecord(){
  if(!R.open)return;
  send({type:'close'});if(R.ws){const ws=R.ws;R.ws=null;try{ws.close();}catch(e){/* gone */}}
  clearInterval(R.timer);if(R.rec){if(R.rec.enc)R.rec.enc.close();if(R.rec.bmp)R.rec.bmp.close();}R.rec=null;R.open=false;R.last=null;pending=null;
  scrim.hidden=true;wait('');
  const f=R.prevFocus;R.prevFocus=null;if(f&&f.focus&&document.contains(f))f.focus({preventScroll:true});
}
// Esc / ×: a running recording would be lost
function requestClose(){
  if(R.encoding)return;
  if(recording()&&!confirm(tx('Kayıt sürüyor. Kapatırsan kayıt atılır. Kapatılsın mı?')))return;
  closeRecord();
}
// the canvas fits the stage at the viewport's CSS size at most (no upscaling: 1 CSS px of the site = 1 px here)
function fit(){
  if(!R.open||!R.vp)return;
  const r=stage.getBoundingClientRect(),s=Math.min(1,(r.width-32)/R.vp.width,(r.height-32)/R.vp.height);
  canvas.style.width=Math.round(R.vp.width*s)+'px';canvas.style.height=Math.round(R.vp.height*s)+'px';
}
addEventListener('resize',fit);

/* ---------- the socket */
function connect(url){
  const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/record/ws');
  ws.binaryType='arraybuffer';R.ws=ws;
  ws.onopen=()=>{ws.send(JSON.stringify({type:'open',url,viewport:{width:R.vp.width,height:R.vp.height},dpr:R.vp.dpr,mobile:R.vp.mobile,dark:captureOpts().dark}));status(tx('Chrome başlatılıyor…'));};
  ws.onmessage=e=>{if(typeof e.data==='string'){let m;try{m=JSON.parse(e.data);}catch(err){return;}handle(m);}else onFrame(e.data);};
  ws.onclose=()=>{
    if(R.ws!==ws)return;R.ws=null;
    if(!R.ready){toast(tx(import.meta.env.DEV?'Kayıt sunucusuna ulaşılamadı. Geliştirme sunucusunu başlat (npm run dev) ve sayfayı yenile.':'Ekran kaydı yalnızca yerel geliştirme sunucusunda çalışır (npm run dev).'));closeRecord();return;}
    if(recording()){status(tx('Bağlantı koptu; alınan kareler kaydediliyor'));stopRecording();return;}
    if(R.open&&!R.encoding){status(tx('Bağlantı koptu. Kapatıp yeniden aç.'));startBtn.disabled=windowBtn.disabled=backBtn.disabled=reloadBtn.disabled=shotBtn.disabled=true;}
  };
}
function handle(m){
  switch(m.type){
    case 'status':status(m.text);if(R.shooting&&m.text)wait(m.text);break;
    case 'ready':R.ready=true;status('');startBtn.disabled=windowBtn.disabled=backBtn.disabled=reloadBtn.disabled=shotBtn.disabled=false;if(R.vp&&m.dpr)R.vp.dpr=m.dpr;break;
    case 'shot':placeShots(m);break;
    case 'nav':R.url=m.url||'';if(document.activeElement!==urlIn&&m.url&&m.url!=='about:blank')urlIn.value=m.url;status(m.loading?tx('Yükleniyor…'):'');break;
    case 'error':status(m.message);toast(m.message);if(R.shooting)endShot();break;
    case 'window':R.headed=true;windowBtn.disabled=true;note(tx('Site ayrı bir Chrome penceresinde açık: orada gez, Başlat / Durdur burada.'));break;
    case 'closed':break;
  }
}
/* ---------- frames: [8 bytes float64 server time][JPEG]; drawn as they come (the newest wins when decoding lags) */
let pending=null,drawing=false;
function onFrame(buf){
  if(buf.byteLength<=8)return;
  const bytes=new Uint8Array(buf,8),t=performance.now();
  R.last=bytes;
  if(R.rec&&t-R.recT0>=MAX_MS)stopRecording();
  pending=bytes;if(!drawing)drawLoop();
}
async function drawLoop(){
  drawing=true;
  try{
    while(pending&&R.open){
      const b=pending;pending=null;
      let bmp;try{bmp=await createImageBitmap(new Blob([b],{type:'image/jpeg'}));}catch(e){continue;}
      if(canvas.width!==bmp.width||canvas.height!==bmp.height){canvas.width=bmp.width;canvas.height=bmp.height;}
      g.drawImage(bmp,0,0);
      if(R.rec){if(R.rec.bmp)R.rec.bmp.close();R.rec.bmp=bmp;pump();}else bmp.close();  // recording: the newest frame for the encoder
    }
  }finally{drawing=false;}
}

/* ---------- input: canvas CSS px -> viewport CSS px; moves coalesce per animation frame */
const pos=e=>{const r=canvas.getBoundingClientRect();return {x:+((e.clientX-r.left)/r.width*R.vp.width).toFixed(1),y:+((e.clientY-r.top)/r.height*R.vp.height).toFixed(1)};};
let move=null,moveRaf=0;
const flushMove=()=>{moveRaf=0;if(move){send(move);move=null;}};
canvas.addEventListener('pointerleave',()=>{R.cur.in=false;});
canvas.addEventListener('pointermove',e=>{if(!R.ready||e.pointerType==='touch')return;const p=pos(e);R.cur={x:p.x,y:p.y,in:true};move={type:'input',kind:'move',...p};if(!moveRaf)moveRaf=requestAnimationFrame(flushMove);});
canvas.addEventListener('pointerdown',e=>{
  canvas.focus({preventScroll:true});if(!R.ready||e.button===2||e.pointerType==='touch')return;e.preventDefault();
  try{canvas.setPointerCapture(e.pointerId);}catch(err){/* no capture */}
  const p=pos(e);R.cur={x:p.x,y:p.y,in:true};if(R.rec)R.presses.push({x:p.x,y:p.y,t:performance.now()});
  flushMove();send({type:'input',kind:'down',button:e.button,clicks:e.detail,...p});
});
canvas.addEventListener('pointerup',e=>{if(!R.ready||e.button===2||e.pointerType==='touch')return;flushMove();send({type:'input',kind:'up',button:e.button,clicks:e.detail,...pos(e)});});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{
  e.preventDefault();if(!R.ready)return;
  const k=e.deltaMode===1?16:e.deltaMode===2?R.vp.height:1;
  send({type:'input',kind:'wheel',dx:Math.round(e.deltaX*k),dy:Math.round(e.deltaY*k),...pos(e)});
},{passive:false});
canvas.addEventListener('paste',e=>{const t=e.clipboardData&&e.clipboardData.getData('text');if(t){e.preventDefault();send({type:'text',text:t});}});
// keys: nothing reaches the studio while the lightbox is open; the canvas forwards them to the site, the toolbar's own
// fields keep theirs (Esc there goes back to the canvas); ⌘/Ctrl+V stays a paste (the paste event carries the text)
function onKey(e){
  if(!R.open)return;
  e.stopImmediatePropagation();
  const t=e.target,inField=t!==canvas&&t.closest&&t.closest('#recBox')&&/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName);
  if(e.key==='Escape'){if(e.type==='keydown'){e.preventDefault();if(inField&&t.tagName!=='BUTTON'){t.blur();canvas.focus();}else requestClose();}return;}
  if(inField)return;
  if(waiting()){e.preventDefault();return;}
  if(t!==canvas)canvas.focus({preventScroll:true});
  if((e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='v')return;
  e.preventDefault();
  if(!R.ready)return;
  send({type:'input',kind:'key',key:e.key,down:e.type==='keydown',ctrl:e.ctrlKey,meta:e.metaKey,alt:e.altKey,shift:e.shiftKey});
}
addEventListener('keydown',onKey,true);addEventListener('keyup',onKey,true);
// the window lost focus (⌘Tab away): the site must not keep a modifier down
addEventListener('blur',()=>{if(R.open&&R.ready)send({type:'input',kind:'release'});});

/* ---------- toolbar */
function go(){const u=urlIn.value.trim();if(!u)return;send({type:'navigate',url:normalizeUrl(u)});canvas.focus({preventScroll:true});}
urlIn.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go();}});
backBtn.addEventListener('click',()=>{send({type:'back'});canvas.focus({preventScroll:true});});
reloadBtn.addEventListener('click',()=>{send({type:'reload'});canvas.focus({preventScroll:true});});
windowBtn.addEventListener('click',()=>{send({type:'openWindow'});windowBtn.disabled=true;canvas.focus({preventScroll:true});});
$('#recClose').addEventListener('click',requestClose);
function setTarget(v){R.target=v;$$('#recTarget button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));}
$$('#recTarget button').forEach(b=>b.addEventListener('click',()=>{setTarget(b.dataset.v);canvas.focus({preventScroll:true});}));
function syncStart(){
  const on=recording();
  startBtn.classList.toggle('on',on);startBtn.innerHTML=(on?'<span class="rec-stop"></span>':'<span class="rec-dot"></span>')+'<span></span>';
  startBtn.lastChild.textContent=tx(on?'Durdur@rec':'Başlat');startBtn.title=on?tx('Kaydı bitir ve cihaza göm'):tx('Ekranı kaydetmeye başla (en çok {n} dk)',{n:MAX_MS/60000});
  timeEl.classList.toggle('on',on);
}
startBtn.addEventListener('click',()=>{if(recording())stopRecording();else startRecording();canvas.focus({preventScroll:true});});
function setShotMode(v){R.shotMode=v;$$('#recShotMode button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));}
$$('#recShotMode button').forEach(b=>b.addEventListener('click',()=>{setShotMode(b.dataset.v);canvas.focus({preventScroll:true});}));

/* ---------- screenshots: the server shoots the page as it is, one per target viewport; the shots go on the screens */
let shotGroupsNow=[];
function takeShot(){
  if(!R.ready||R.shooting||recording()||R.encoding)return;
  const devs=(R.target==='all'?state.devices.slice():[R.dev]).filter(d=>state.devices.includes(d));
  shotGroupsNow=shotGroups(devs);
  if(!shotGroupsNow.length){toast(tx('Görüntünün konacağı ekran kalmadı.'));return;}
  R.shooting=true;shotBtn.disabled=startBtn.disabled=windowBtn.disabled=true;status(tx('Ekran görüntüsü alınıyor…'));wait(tx('Ekran görüntüsü alınıyor…'));
  send({type:'shot',full:R.shotMode==='full',selector:R.shotMode==='full'?captureOpts().selector:'',targets:shotGroupsNow.map(g=>g.target)});
}
function endShot(){R.shooting=false;wait('');shotBtn.disabled=!R.ready;startBtn.disabled=!R.ready;windowBtn.disabled=!R.ready||R.headed;}
async function placeShots(m){
  const groups=shotGroupsNow,url=m.url||R.url;shotGroupsNow=[];
  wait(tx('Görüntü ekrana yerleştiriliyor…'));
  try{
    let n=0;
    for(const g of groups){const src=m.shots&&m.shots[g.target.id];if(!src)continue;const img=await shotImage(src);
      g.devices.forEach(d=>{if(!state.devices.includes(d))return;putShot(d,img,url,url);n++;});}
    if(!n){toast(tx('Ekran görüntüsü alınamadı.'));return;}
    closeRecord();syncAll();
    toast(tx('{s} {n} cihaza yerleştirildi.',{s:siteName(url),n})+(m.missing?' '+tx('Başlangıç seçicisi sayfada bulunamadı: en üstten alındı.'):R.shotMode==='full'?' '+tx('Ekranın üzerinde tekerlekle kaydırabilirsin.'):''));
  }catch(e){toast(e&&e.user?e.message:tx('Ekran görüntüsü yerleştirilemedi.'));}
  finally{endShot();}
}
shotBtn.addEventListener('click',takeShot);

/* ---------- recording: encoded live. R.rec = {enc, cv, cg, W, H, n (frames written), bmp (newest frame), busy} */
const CUR=[[0,0],[0,17],[4.5,13],[7.5,20],[10,19],[7,12.5],[12.5,12.5]];  // an arrow pointer, CSS px, tip at 0,0
function drawCursor(cg,k,now){
  if(!$('#recCursor').checked)return;
  // presses: a ring that grows and fades for 450 ms
  R.presses=R.presses.filter(p=>now-p.t<450);
  for(const p of R.presses){const a=(now-p.t)/450;cg.beginPath();cg.arc(p.x*k,p.y*k,(8+16*a)*k,0,Math.PI*2);
    cg.strokeStyle='rgba(11,104,245,'+(.7*(1-a))+')';cg.lineWidth=3*k;cg.stroke();}
  if(!R.cur.in)return;
  cg.save();cg.translate(R.cur.x*k,R.cur.y*k);cg.scale(k,k);cg.beginPath();CUR.forEach(([x,y],i)=>i?cg.lineTo(x,y):cg.moveTo(x,y));cg.closePath();
  cg.fillStyle='#111';cg.strokeStyle='#fff';cg.lineWidth=1.6;cg.lineJoin='round';cg.stroke();cg.fill();cg.restore();
}
// writes output frames up to now (one per 1/FPS since Başlat), each the newest frame received
async function pump(){
  const r=R.rec;if(!r||r.busy||!r.bmp)return;
  r.busy=true;
  try{
    if(!r.enc){r.W=r.bmp.width-r.bmp.width%2;r.H=r.bmp.height-r.bmp.height%2;r.cv=mkCanvas(r.W,r.H);r.cg=r.cv.getContext('2d');r.enc=await mp4Encoder(r.W,r.H,FPS,REC_BPP);}
    const now=performance.now(),want=Math.floor((now-R.recT0)*FPS/1000)+1,k=r.W/R.vp.width;
    while(r.n<want&&R.rec===r){
      r.cg.drawImage(r.bmp,0,0,r.W,r.H);drawCursor(r.cg,k,R.recT0+r.n*1000/FPS);
      await r.enc.add(r.cv,r.n);r.n++;
    }
  }catch(e){r.failed=e;}
  finally{r.busy=false;}
}
function startRecording(){
  if(!R.ready||recording()||R.encoding)return;
  R.rec={enc:null,n:0,bmp:null,busy:false};R.recT0=performance.now();R.presses=[];
  // the picture on screen at Başlat is the first frame, even if the page never draws again
  if(R.last)createImageBitmap(new Blob([R.last],{type:'image/jpeg'})).then(b=>{if(R.rec&&!R.rec.bmp){R.rec.bmp=b;pump();}else b.close();}).catch(()=>{});
  clearInterval(R.timer);R.timer=setInterval(()=>{timeEl.textContent=fmtDur((performance.now()-R.recT0)/1000);pump();},1000/FPS);
  timeEl.textContent=fmtDur(0);syncStart();status(tx('Kaydediliyor'));
  if(autoEl.checked)send({type:'scroll',dur:Math.max(1,Math.min(30,+autoDur.value||8))});
}
async function stopRecording(){
  if(!recording())return;
  R.recEnd=performance.now();clearInterval(R.timer);
  const r=R.rec;
  while(r.busy)await new Promise(res=>setTimeout(res,5));
  await pump();  // the frames up to Durdur
  R.rec=null;syncStart();
  if(!r.enc||!r.n){if(r.bmp)r.bmp.close();if(r.enc)r.enc.close();status('');toast(tx(r.failed&&r.failed.message==='codec'?'Bu boyutta video kodlanamıyor: daha küçük bir cihaz dene.':'Kayıtta kare yok: sayfa hiç çizilmedi.'));return;}
  R.encoding=true;startBtn.disabled=windowBtn.disabled=shotBtn.disabled=true;status(tx('Video hazırlanıyor…'));wait(tx('Video hazırlanıyor…'));
  const span=r.n/FPS;
  try{
    if(r.failed)throw r.failed;
    const blob=await r.enc.finish();
    await embed(blob,span);
  }catch(e){
    console.warn('Kayıt kodlanamadı:',e);
    status('');toast(tx(e&&e.message==='codec'?'Bu boyutta video kodlanamıyor: daha küçük bir cihaz dene.':'Kayıt videoya çevrilemedi.'));
  }finally{r.enc.close();if(r.bmp)r.bmp.close();R.encoding=false;wait('');startBtn.disabled=!R.ready;shotBtn.disabled=!R.ready;windowBtn.disabled=!R.ready||R.headed;timeEl.textContent='';}
}
// the MP4 goes on the target devices through the screen-video loader (artboard duration from the video, poster null,
// loop on), the lightbox closes and the studio switches to Canlandır
async function embed(blob,span){
  const devs=(R.target==='all'?state.devices.slice():[R.dev]).filter(d=>state.devices.includes(d));
  if(!devs.length){toast(tx('Kaydın gömüleceği cihaz kalmadı.'));return;}
  let host='kayit';try{host=new URL(R.url).hostname.replace(/^www\./,'')||host;}catch(e){/* no url */}
  const file=new File([blob],host+'-kayit.mp4',{type:'video/mp4'}),url=R.url;
  let path='';try{const u=new URL(url);path=u.pathname!=='/'?u.pathname:'';}catch(e){/* no url */}
  closeRecord();
  for(const d of devs){
    await loadShotVideo(d,file);
    if(!d.video)continue;
    d.siteUrl=url;if(d.type==='browser'){d.url=host+path;updateChrome(d);}
  }
  setMode('animate');seek(0);syncAll();
  toast(tx('Kayıt {n} cihaza gömüldü · {d}',{n:devs.length,d:fmtDur(span)}));
}

/* ---------- entry: the capture box's "Siteyi aç…" (dev server only) opens the lightbox with the device's address; the
   target (Bu cihaz / Tümü) is chosen inside, and the last choice stays */
if(import.meta.env.DEV)setLiveCapture(url=>openRecord(url));

export {openRecord};
