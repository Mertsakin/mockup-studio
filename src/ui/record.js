import {updateChrome} from '../devices/screen.js';
import {fmtDur} from '../devices/video.js';
import {mp4Encoder} from '../export/mp4.js';
import {TYPES} from '../state/constants.js';
import {sel,state} from '../state/state.js';
import {$,$$,mkCanvas} from '../util.js';
import {seek,setMode} from './animate.js';
import {normalizeUrl,viewport} from './capture.js';
import {loadShotVideo} from './image-input.js';
import {syncAll} from './sync.js';
import {toast} from './toast.js';

/* "Ekran kaydı": the site opens live inside the studio, in a lightbox, at the selected device's viewport. The page runs
   in the dev server's Chrome (tools/capture/record.mjs, persistent profile: logins and solved bot checks stay) and its
   picture streams here as CDP screencast frames (JPEG) over /api/record/ws; the mouse and keyboard on the canvas go
   back, so cookie banners, logins and verifications are the user's to handle. Başlat keeps the incoming frames with
   their arrival time (at most MAX_FRAMES / MAX_MS; then it stops by itself); Durdur resamples them at FPS (each output
   frame shows the last frame received at or before its time), encodes them to an H.264 MP4 (export/mp4.js) and puts
   the video on the target device screens through the screen-video loader (image-input.js), then switches to Canlandır.
   Keys never reach the studio while the lightbox is open (a capture-phase listener on window); Esc closes it. */
const FPS=30,MAX_FRAMES=900,MAX_MS=30000,MIN_GAP=1000/24-1;  // frames kept at most ~24/s: 30 s stays under MAX_FRAMES
// the stream's sharpness: the server's cap (record.mjs recordDpr), mirrored here for the label and the canvas
const REC_DPR_MAX=3,REC_PX=3.2e6;
const recordDpr=(w,h,want)=>Math.max(1,Math.floor(Math.min(REC_DPR_MAX,Math.sqrt(REC_PX/(w*h)),Math.max(1,want||1))*4)/4);
const scrim=$('#recScrim'),canvas=$('#recCanvas'),g=canvas.getContext('2d'),stage=$('#recStage'),urlIn=$('#recUrl'),vpEl=$('#recVp'),
  timeEl=$('#recTime'),startBtn=$('#recStart'),windowBtn=$('#recWindow'),statusEl=$('#recStatus'),noteEl=$('#recNote'),autoEl=$('#recAuto'),autoDur=$('#recAutoDur'),
  backBtn=$('#recBack'),reloadBtn=$('#recReload');
const R={ws:null,open:false,ready:false,dev:null,vp:null,target:'one',last:null,rec:null,recT0:0,recLast:0,recEnd:0,timer:0,encoding:false,headed:false,url:'',prevFocus:null};
const fmtX=x=>(Math.round(x*4)/4).toString().replace('.',',')+'×';
const status=t=>{statusEl.textContent=t||'';statusEl.title=t||'';};
const note=t=>{noteEl.textContent=t||'';noteEl.hidden=!t;};
const send=m=>{if(R.ws&&R.ws.readyState===1)R.ws.send(JSON.stringify(m));};
const recording=()=>!!R.rec;

/* ---------- open / close */
function openRecord(url){
  if(R.open)return;
  const d=sel();if(!d){toast('Ekran kaydı için önce bir cihaz ekle.');return;}
  const vp=viewport(d);if(!vp){toast('Bu cihazın ekranı yok. Kendi çerçeven için önce bir çerçeve PNG’si yükle.');return;}
  vp.dpr=recordDpr(vp.width,vp.height,vp.dpr);
  R.dev=d;R.vp=vp;R.open=true;R.ready=false;R.headed=false;R.last=null;R.rec=null;R.url='';R.prevFocus=document.activeElement;
  vpEl.textContent=TYPES[d.type]+' · '+vp.width+' × '+vp.height+' · '+fmtX(vp.dpr);
  canvas.width=Math.round(vp.width*vp.dpr);canvas.height=Math.round(vp.height*vp.dpr);g.clearRect(0,0,canvas.width,canvas.height);
  urlIn.value=url||'';timeEl.textContent='';note('');status('Bağlanılıyor…');
  startBtn.disabled=windowBtn.disabled=backBtn.disabled=reloadBtn.disabled=true;windowBtn.hidden=false;
  setTarget(R.target);syncStart();
  scrim.hidden=false;fit();canvas.focus({preventScroll:true});
  connect(url?normalizeUrl(url):'');
}
function closeRecord(){
  if(!R.open)return;
  send({type:'close'});if(R.ws){const ws=R.ws;R.ws=null;try{ws.close();}catch(e){/* gone */}}
  clearInterval(R.timer);R.rec=null;R.open=false;R.last=null;pending=null;
  scrim.hidden=true;
  const f=R.prevFocus;R.prevFocus=null;if(f&&f.focus&&document.contains(f))f.focus({preventScroll:true});
}
// Esc / ×: a running recording would be lost
function requestClose(){
  if(R.encoding)return;
  if(recording()&&!confirm('Kayıt sürüyor. Kapatırsan kayıt atılır. Kapatılsın mı?'))return;
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
  ws.onopen=()=>{ws.send(JSON.stringify({type:'open',url,viewport:{width:R.vp.width,height:R.vp.height},dpr:R.vp.dpr,mobile:R.vp.mobile}));status('Chrome başlatılıyor…');};
  ws.onmessage=e=>{if(typeof e.data==='string'){let m;try{m=JSON.parse(e.data);}catch(err){return;}handle(m);}else onFrame(e.data);};
  ws.onclose=()=>{
    if(R.ws!==ws)return;R.ws=null;
    if(!R.ready){toast(import.meta.env.DEV?'Kayıt sunucusuna ulaşılamadı. Geliştirme sunucusunu başlat (npm run dev) ve sayfayı yenile.':'Ekran kaydı yalnızca yerel geliştirme sunucusunda çalışır (npm run dev).');closeRecord();return;}
    if(recording()){status('Bağlantı koptu; alınan kareler kaydediliyor');stopRecording();return;}
    if(R.open&&!R.encoding){status('Bağlantı koptu. Kapatıp yeniden aç.');startBtn.disabled=windowBtn.disabled=backBtn.disabled=reloadBtn.disabled=true;}
  };
}
function handle(m){
  switch(m.type){
    case 'status':status(m.text);break;
    case 'ready':R.ready=true;status('');startBtn.disabled=windowBtn.disabled=backBtn.disabled=reloadBtn.disabled=false;if(R.vp&&m.dpr)R.vp.dpr=m.dpr;break;
    case 'nav':R.url=m.url||'';if(document.activeElement!==urlIn&&m.url&&m.url!=='about:blank')urlIn.value=m.url;status(m.loading?'Yükleniyor…':'');break;
    case 'error':status(m.message);toast(m.message);break;
    case 'window':R.headed=true;windowBtn.disabled=true;note('Site ayrı bir Chrome penceresinde açık: orada gez, Başlat / Durdur burada.');break;
    case 'closed':break;
  }
}
/* ---------- frames: [8 bytes float64 server time][JPEG]; drawn as they come (the newest wins when decoding lags) */
let pending=null,drawing=false;
function onFrame(buf){
  if(buf.byteLength<=8)return;
  const bytes=new Uint8Array(buf,8),t=performance.now();
  R.last=bytes;
  if(R.rec&&t-R.recLast>=MIN_GAP){R.rec.push({t,data:bytes});R.recLast=t;if(R.rec.length>=MAX_FRAMES||t-R.recT0>=MAX_MS)stopRecording();}
  pending=bytes;if(!drawing)drawLoop();
}
async function drawLoop(){
  drawing=true;
  try{
    while(pending&&R.open){
      const b=pending;pending=null;
      let bmp;try{bmp=await createImageBitmap(new Blob([b],{type:'image/jpeg'}));}catch(e){continue;}
      if(canvas.width!==bmp.width||canvas.height!==bmp.height){canvas.width=bmp.width;canvas.height=bmp.height;}
      g.drawImage(bmp,0,0);bmp.close();
    }
  }finally{drawing=false;}
}

/* ---------- input: canvas CSS px -> viewport CSS px; moves coalesce per animation frame */
const pos=e=>{const r=canvas.getBoundingClientRect();return {x:+((e.clientX-r.left)/r.width*R.vp.width).toFixed(1),y:+((e.clientY-r.top)/r.height*R.vp.height).toFixed(1)};};
let move=null,moveRaf=0;
const flushMove=()=>{moveRaf=0;if(move){send(move);move=null;}};
canvas.addEventListener('pointermove',e=>{if(!R.ready||e.pointerType==='touch')return;move={type:'input',kind:'move',...pos(e)};if(!moveRaf)moveRaf=requestAnimationFrame(flushMove);});
canvas.addEventListener('pointerdown',e=>{
  canvas.focus({preventScroll:true});if(!R.ready||e.button===2||e.pointerType==='touch')return;e.preventDefault();
  try{canvas.setPointerCapture(e.pointerId);}catch(err){/* no capture */}
  flushMove();send({type:'input',kind:'down',button:e.button,clicks:e.detail,...pos(e)});
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
  startBtn.lastChild.textContent=on?'Durdur':'Başlat';startBtn.title=on?'Kaydı bitir ve cihaza göm':'Ekranı kaydetmeye başla (en çok '+MAX_MS/1000+' sn)';
  timeEl.classList.toggle('on',on);
}
startBtn.addEventListener('click',()=>{if(recording())stopRecording();else startRecording();canvas.focus({preventScroll:true});});

/* ---------- recording */
function startRecording(){
  if(!R.ready||recording()||R.encoding)return;
  const t=performance.now();R.rec=[];R.recT0=R.recLast=t;
  if(R.last){R.rec.push({t,data:R.last});}  // the picture on screen at Başlat is the first frame, even if the page is still
  clearInterval(R.timer);R.timer=setInterval(()=>{timeEl.textContent=fmtDur((performance.now()-R.recT0)/1000);},100);
  timeEl.textContent=fmtDur(0);syncStart();status('Kaydediliyor');
  if(autoEl.checked)send({type:'scroll',dur:Math.max(1,Math.min(30,+autoDur.value||8))});
}
async function stopRecording(){
  if(!recording())return;
  const frames=R.rec;R.rec=null;R.recEnd=performance.now();clearInterval(R.timer);syncStart();
  if(!frames.length){status('');toast('Kayıtta kare yok: sayfa hiç çizilmedi.');return;}
  R.encoding=true;startBtn.disabled=windowBtn.disabled=true;
  const span=Math.min(MAX_MS/1000,Math.max(1/FPS,(R.recEnd-R.recT0)/1000));
  try{
    const blob=await encode(frames,span,p=>{status('Kodlanıyor %'+Math.round(p*100));timeEl.textContent='%'+Math.round(p*100);});
    await embed(blob,span);
  }catch(e){
    console.warn('Kayıt kodlanamadı:',e);
    status('');toast(e&&e.message==='codec'?'Bu boyutta video kodlanamıyor: daha küçük bir cihaz dene.':'Kayıt videoya çevrilemedi.');
  }finally{R.encoding=false;startBtn.disabled=!R.ready;windowBtn.disabled=!R.ready||R.headed;timeEl.textContent='';}
}
// frames -> MP4 at FPS: output frame i (time i / FPS from the start) shows the last received frame at or before it
async function encode(frames,span,onProgress){
  const n=Math.max(1,Math.round(span*FPS)),t0=frames[0].t;
  const first=await createImageBitmap(new Blob([frames[0].data],{type:'image/jpeg'}));
  const W=first.width-first.width%2,H=first.height-first.height%2;  // H.264 wants even sizes
  const cv=mkCanvas(W,H),cg=cv.getContext('2d');cg.drawImage(first,0,0);first.close();
  const enc=await mp4Encoder(W,H,FPS);
  try{
    let fi=0,drawn=0;
    for(let i=0;i<n;i++){
      const ti=t0+i*1000/FPS;
      while(fi+1<frames.length&&frames[fi+1].t<=ti)fi++;
      if(fi!==drawn){const bmp=await createImageBitmap(new Blob([frames[fi].data],{type:'image/jpeg'}));cg.drawImage(bmp,0,0,W,H);bmp.close();drawn=fi;}
      await enc.add(cv,i);
      if(i%5===0){onProgress((i+1)/n);await new Promise(r=>setTimeout(r,0));}
    }
    onProgress(1);
    return await enc.finish();
  }finally{enc.close();}
}
// the MP4 goes on the target devices through the screen-video loader (artboard duration from the video, poster null,
// loop on), the lightbox closes and the studio switches to Canlandır
async function embed(blob,span){
  const devs=(R.target==='all'?state.devices.slice():[R.dev]).filter(d=>state.devices.includes(d));
  if(!devs.length){toast('Kaydın gömüleceği cihaz kalmadı.');return;}
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
  toast('Kayıt '+devs.length+' cihaza gömüldü · '+fmtDur(span));
}

/* ---------- entry: the capture box's "Ekran kaydı…" opens the lightbox with the device's address */
$('#recordBtn').addEventListener('click',()=>openRecord($('#captureUrl').value.trim()));

export {openRecord};
