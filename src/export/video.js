import {openExportFrames} from '../devices/video-decode.js';
import {hasVideo,videoDevices} from '../devices/video.js';
import {LRT} from '../lights/runtime.js';
import {pauseLive,renderNow} from '../render/accumulation.js';
import {applyMix} from '../render/mix.js';
import {fontsReady} from '../render/text.js';
import {canvas,overlays,renderer,req,setCrop} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {restore} from '../io/project.js';
import {hasAnim,kindOf} from '../state/anim.js';
import {DIRS,camOf,devsMatch,devsOf,easeOf,flyOk,layoutSeq,lightsMatch,lightsOf,mixCam,mixList,seqAt,seqTotal} from '../state/sequence.js';
import {state,view} from '../state/state.js';
import {A,anyAnim,applyAt,applyNow,onAnim,stop,targets} from '../ui/animate.js';
import {activeBoard,boardById,boardDur,doc,storeActive} from '../ui/boards.js';
import {holdHistory} from '../ui/history.js';
import {invalidateLayout,layout,paintBg,paintItems} from '../ui/layout.js';
import {toast} from '../ui/toast.js';
import {ui} from '../ui/ui-state.js';
import {$,$$,mkCanvas} from '../util.js';
import {exportSize,offer} from './export.js';
import {FORMATS,encoderFor,estimate,webmAlpha} from './encoders.js';

import {dofOn,holdFocus} from '../render/lens.js';
import {scheduleEnv} from '../render/environment.js';
/* Video export (Canlandır): every frame is set up at its time and rendered like the fast still export (progressive
   samples, background and 2D items composited), then encoded to H.264 with WebCodecs and muxed into an MP4.
   Deterministic: frame i shows t = i / fps whatever the machine's speed.
   Motion blur: the frame's samples are spread over half a frame interval around t (a 180° shutter), so only what
   moves blurs, like a real camera. The screenshot scroll is set once per frame (redrawing it per sample is costly).
   Screen videos: their frames come from a WebCodecs decoder walking each video in order (devices/video-decode.js;
   seeking the <video> element is its fallback), drawn once per frame before the samples, so the motion blur
   sub-samples see one still frame.
   Source: the active board, or the sequence (doc.sequence, state/sequence.js): the boards one after another in one
   file. A body frame of the sequence is a frame of its board (restored from the board's snapshot: restore, no
   layout, thumbnails or history meanwhile). A frame inside a transition's window is two renders blended in 2D
   (dissolve, fade through a colour, slide); in a camera flight both boards are rendered with the camera (and the
   matching devices and lights) at the values in between (render/mix.js). The window's frames go in groups: the
   outgoing board is restored once for the group's frames, then the incoming one, since a restore rebuilds the
   scene (a laptop ≈ 0,3 s). The output takes the first clip's shape; another clip is rendered at that aspect (the
   camera reframes its scene; 2D items keep their fractions). */
const SAMPLES=16,DOF_SAMPLES=64,SHUTTER=.5;
const X={res:1920,fps:30,blur:true,format:'mp4',quality:'fast',source:'board'};
/* Photo quality: every frame goes through the path tracer like the still photo export (render/pathtrace.js
   renderPathTraced: studio set-up, BVH, floor calibration, OIDN), with few samples. The fixed seed hands every frame
   the same samples, so what is left of the noise stays put instead of crawling. No motion blur here. Slow: the
   dialog says how slow before it starts, and the estimate is replaced by the measured pace after the first frame. */
const PHOTO_SAMPLES=12,PHOTO_FRAME_MS=20000;
// seconds per frame on an M1 Pro (measured at 1080 x 1080: 0.17 s a sample, 2.6 s OIDN, 0.7 s preparation; ~linear in pixels)
const photoFrameSec=(W,H)=>W*H/1.17e6*(.17*PHOTO_SAMPLES+2.6)+.7;
const GIF_W=720,GIF_FPS=15;  // a GIF is a palette per frame: past these it gets large and slow for little gain
const GROUP_BYTES=3e8;  // a transition's frames are rendered in groups whose two sets of canvases stay under this
const scrim=$('#videoScrim');
const fps=()=>X.format==='gif'?GIF_FPS:X.fps;
// the sequence as a source: two or more clips
const seqLayout=()=>layoutSeq(doc.sequence,boardDur);
const seqReady=()=>doc.sequence.clips.length>=2;
const useSeq=()=>X.source==='seq'&&seqReady();
// the state whose shape the file takes: the first clip's board for the sequence
const shapeState=()=>{if(!useSeq())return state;const b=boardById(doc.sequence.clips[0].board);return b&&b.id!==doc.active?b.snap.state:state;};
// the file's size: the board's shape at the chosen width (a GIF at most GIF_W wide); even sides (H.264, VP9)
const size=()=>{let [w,h]=exportSize(X.res,X.res,shapeState());if(X.format==='gif'&&w>GIF_W){h=Math.round(h*GIF_W/w);w=GIF_W;}return [w-w%2,h-h%2];};
const duration=()=>useSeq()?seqTotal(seqLayout()):state.anim.dur;
const frames=()=>Math.round(duration()*fps());
// a transparent board stays transparent where the format can carry it (WebM with alpha, GIF); MP4 gets white
const transparent=()=>shapeState().bg==='transparent';

let cancel=false;
async function renderVideo(onProgress){
  await fontsReady(state.items);
  const [W,H]=size(),n=frames(),enc=await encoderFor(X.format,W,H,fps(),{alpha:transparent()});  // throws 'codec' when the size cannot be encoded
  const pr=renderer.getPixelRatio(),out=mkCanvas(W,H),g=out.getContext('2d');
  // the background painter whitens empty space for the still export's opaque formats (state.format): the video's own
  // format decides here (a transparent GIF / WebM must stay transparent whatever the still format is)
  const stillFormat=state.format;state.format=enc.alpha?'png':'jpg';
  const hidden=[];LRT.forEach(o=>{if(o.marker.visible){o.marker.visible=false;hidden.push(o.marker);}});overlays.forEach(o=>{if(o.visible){o.visible=false;hidden.push(o);}});
  const seq=useSeq(),home=activeBoard();
  // the sequence drives the scene through other boards: nothing it does is an edit (recorder muted, history held)
  if(seq){storeActive();A.mute=true;holdHistory(true);}
  pauseLive(true);
  let screens=null;  // the screen videos' frame source (decoder or seek), opened per live board
  try{
    setCrop(null);renderer.setPixelRatio(1);renderer.setSize(W,H,false);view.aspect=W/H;applyTransform();
    const dt=1/fps(),S=dofOn()?DOF_SAMPLES:SAMPLES;  // the aperture needs more samples (bokeh)
    // what the live board has: anything in 3D moving (devices, camera, lights) gets motion blur; moving lights also
    // rebuild the reflections per frame; its screen videos get a frame source (the decoder, or the seek path)
    let F=null;const flags=async()=>{F={moving:targets().some(o=>kindOf(o)!=='item'&&hasAnim(o)),lightsMove:state.lights.some(hasAnim),dur:state.anim.dur};
      if(screens){await screens.close();screens=null;}screens=state.devices.some(hasVideo)?await openExportFrames(videoDevices()):null;};
    await flags();
    /* one frame of the live board at its local time t into a context (W x H). mix(t): in a camera flight, the values in
       between to write after the board's own (per sub-sample too); relight: the lights' reflections rebuild per frame */
    const frame=async(gc,t,mix,relight)=>{
      const lightsMove=F.lightsMove||!!relight;
      const setup=(tt,full)=>{applyAt(tt,full?{sync:true,video:false}:{scroll:false});if(mix){const m=mix(tt);m.cam=m.cam||null;applyMix(m);}};
      setup(t,true);if(screens)await screens.show(t);if(lightsMove)scheduleEnv(true);  // screen videos: the exact frame, drawn before the samples
      // the focus is the frame's own (its time): the motion blur sub-samples keep it (render/lens.js)
      holdFocus(true);
      try{
        if(X.quality==='photo'){
          // the background and the items behind go under the render before denoising (as in the still photo export)
          const back=mkCanvas(W,H),bg=back.getContext('2d');paintBg(bg,W,H);paintItems(bg,W,H,false,t);
          const raw=await (await import('../render/pathtrace.js')).renderPathTraced(PHOTO_SAMPLES,null,PHOTO_FRAME_MS,back);
          gc.clearRect(0,0,W,H);gc.drawImage(raw,0,0,W,H);paintItems(gc,W,H,true,t);
        }else{
          if(X.blur&&(F.moving||mix))renderNow(S,j=>{setup(Math.max(0,Math.min(F.dur,t+((j+.5)/S-.5)*SHUTTER*dt)),false);});
          else renderNow(S);
          gc.clearRect(0,0,W,H);
          paintBg(gc,W,H);paintItems(gc,W,H,false,t);gc.drawImage(canvas,0,0,W,H);paintItems(gc,W,H,true,t);
        }
      }finally{holdFocus(false);}
    };
    const breathe=()=>new Promise(r=>setTimeout(r,0));  // let the page breathe (progress, cancel)
    if(!seq){
      for(let i=0;i<n;i++){
        if(cancel)return null;
        await frame(g,i*dt,null);
        await enc.add(out,i);onProgress(i+1,n);await breathe();
      }
      return await enc.finish();
    }
    /* the sequence: the frames in order, grouped into runs of one board and transition windows */
    const L=seqLayout(),runs=[];
    for(let i=0;i<n;i++){
      const f=seqAt(L,i*dt),win=f.b&&f.tr&&f.tr.kind!=='cut',last=runs[runs.length-1];
      if(win){if(last&&last.tr&&last.clip===f.clip)last.frames.push({i,f});else runs.push({clip:f.clip,tr:f.tr,a:f.a.board,b:f.b.board,frames:[{i,f}]});}
      else{const board=f.b&&f.u>=1?f.b.board:f.a.board,t=f.b&&f.u>=1?f.b.t:f.a.t;if(last&&!last.tr&&last.board===board)last.frames.push({i,t});else runs.push({board,frames:[{i,t}]});}
    }
    let shown=null;  // the board whose scene is live now
    const use=async id=>{if(shown===id)return;const b=boardById(id);restore(b.snap);applyTransform();scheduleEnv(true);shown=id;await flags();};
    let done=0;
    for(const run of runs){
      if(!run.tr){
        await use(run.board);
        for(const {i,t} of run.frames){if(cancel)return null;await frame(g,t,null);await enc.add(out,i);onProgress(++done,n);await breathe();}
        continue;
      }
      // a transition: both boards' frames, then the blend. In a flight the camera (and matching devices / lights) of
      // the two boards are mixed at the eased progress; the other board's values come from its snapshot at its time
      const a=boardById(run.a).snap,b=boardById(run.b).snap,tr=run.tr,ease=easeOf(tr),fly=tr.kind==='fly'&&flyOk(a,b),dm=fly&&devsMatch(a,b),lm=fly&&lightsMatch(a,b);
      const mixFor=(sa,ta,sb,tb,e,own)=>tt=>{  // own: 'a' (the live board is a) or 'b'; tt: the sub-sample time of the live board
        const dA=own==='a'?tt-ta:0,dB=own==='b'?tt-tb:0,tA=ta+dA,tB=tb+dB;  // the live board's sub-time moves, the other stays on the frame
        const m={cam:mixCam(camOf(sa,tA),camOf(sb,tB),e)};
        if(dm)m.devs=mixList(devsOf(sa,tA),devsOf(sb,tB),e);if(lm)m.lights=mixList(lightsOf(sa,tA),lightsOf(sb,tB),e);return m;};
      const per=Math.max(1,Math.min(12,Math.floor(GROUP_BYTES/(W*H*4*2))));
      for(let k=0;k<run.frames.length;k+=per){
        const grp=run.frames.slice(k,k+per),ca=[],cb=[];
        await use(run.a);
        for(const {f} of grp){if(cancel)return null;const c=mkCanvas(W,H),e=ease(f.u);await frame(c.getContext('2d'),f.a.t,fly?mixFor(a,f.a.t,b,f.b.t,e,'a'):null,lm);ca.push(c);await breathe();}
        await use(run.b);
        for(const {f} of grp){if(cancel)return null;const c=mkCanvas(W,H),e=ease(f.u);await frame(c.getContext('2d'),f.b.t,fly?mixFor(a,f.a.t,b,f.b.t,e,'b'):null,lm);cb.push(c);await breathe();}
        for(let j=0;j<grp.length;j++){if(cancel)return null;blend(g,W,H,ca[j],cb[j],tr,ease(grp[j].f.u));await enc.add(out,grp[j].i);onProgress(++done,n);}
        await breathe();
      }
    }
    return await enc.finish();
  }finally{
    state.format=stillFormat;enc.close();holdFocus(false);
    if(screens)await screens.close();  // the screens back on their <video> frames
    hidden.forEach(o=>{o.visible=true;});
    if(seq&&home){restore(home.snap);applyTransform();scheduleEnv(true);}  // the board the user had, as it was stored
    pauseLive(false);renderer.setPixelRatio(pr);invalidateLayout();layout();
    applyNow();req();
    if(seq){await new Promise(r=>setTimeout(r,0));A.mute=false;holdHistory(false);}  // the recorder has seen the home board's values again
  }
}
// the two renders of a transition frame into g at progress e (eased)
function blend(g,W,H,ca,cb,tr,e){
  g.clearRect(0,0,W,H);
  if(tr.kind==='fade'){g.drawImage(e<.5?ca:cb,0,0);g.fillStyle=tr.color||'#000000';g.globalAlpha=1-Math.abs(2*e-1);g.fillRect(0,0,W,H);g.globalAlpha=1;return;}
  if(tr.kind==='slide'){const [dx,dy]=DIRS[tr.dir]||DIRS.left;g.drawImage(ca,Math.round(dx*e*W),Math.round(dy*e*H));g.drawImage(cb,Math.round(dx*(e-1)*W),Math.round(dy*(e-1)*H));return;}
  g.drawImage(ca,0,0);g.globalAlpha=e;g.drawImage(cb,0,0);g.globalAlpha=1;  // dissolve (and the flight)
}

/* ---------- dialog */
function syncSetup(){
  const [w,h]=size(),seq=useSeq(),st=shapeState();
  $('#vSrcRow').hidden=!seqReady();
  $$('#vSrc button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===(seq?'seq':'board'))));
  const note=$('#vSrcNote');note.hidden=!seq;
  if(seq){const L=seqLayout(),trs=doc.sequence.transitions.filter(t=>t.kind!=='cut').length;
    note.textContent='Sıra: '+L.map(c=>boardById(c.board).name).join(' → ')+' · '+trs+' geçiş · '+fmtDur(seqTotal(L))+'. Çıktı oranı ilk artboard\'ınki'+(L.some(c=>{const s=boardById(c.board).snap.state;return s.ratio!==st.ratio;})?' (farklı oranlı artboard\'lar bu oranda yeniden kadrajlanır)':'')+'.';}
  $$('#vRes button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===X.res)));
  $$('#vFps button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===X.fps)));
  $('#vRes').closest('.row').hidden=st.ratio==='custom';
  $('#vBlur').checked=X.blur;
  $('#vDur').textContent=fmtDur(duration());
  $('#vFrames').textContent=String(frames());$('#vSize').textContent=w+' × '+h;
  $('#vMb').textContent='~'+Math.max(1,Math.round(estimate(X.format,w,h,fps(),duration())/1e6))+' MB';
  $$('#vFmt button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===X.format)));
  const dur=duration(),fmtNote=FORMATS[X.format].d+(X.format==='gif'&&dur>8?'. '+dur.toFixed(0)+' sn uzun bir GIF büyük olur; kısa bir döngü dene.':'');
  $('#vFmtNote').textContent=fmtNote;
  // a transparent board: which formats keep it (GIF always, WebM where the browser encodes alpha, MP4 never)
  if(transparent()){
    if(X.format==='mp4')$('#vFmtNote').textContent=fmtNote+'. Şeffaf arka plan beyaz olur; şeffaf için GIF.';
    else if(X.format==='gif')$('#vFmtNote').textContent=fmtNote+'. Şeffaf arka plan korunur (kenarlar keskin).';
    else webmAlpha().then(ok=>{if(X.format==='webm')$('#vFmtNote').textContent=fmtNote+(ok?'. Şeffaf arka plan korunur.':'. Bu tarayıcı şeffaf WebM kodlayamıyor; arka plan beyaz olur. Şeffaf için GIF.');});
  }
  $$('#vFps button').forEach(b=>{b.disabled=X.format==='gif';});
  $$('#vQuality button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===X.quality)));
  const photo=X.quality==='photo';$('#vBlurRow').hidden=photo;$('#vQualityNote').hidden=!photo;
  if(photo){const sec=photoFrameSec(w,h)*(frames()+(seq?trFrames():0));$('#vQualityNote').textContent='Her kare yol izlemeyle: kare başına ~'+Math.round(photoFrameSec(w,h))+' sn, bu video için yaklaşık '+(sec<90?Math.round(sec)+' sn':Math.round(sec/60)+' dk')+(seq?' (geçiş kareleri iki kez çizilir)':'')+'. Hareket bulanıklığı yok; uzun sürer, sekmeyi açık tut.';}
  $('#vSave').textContent=FORMATS[X.format].n+' indir';
  const no=typeof VideoEncoder==='undefined'&&X.format!=='gif';  // a GIF needs no WebCodecs
  $('#vWarn').hidden=!no;$('#vWarn').textContent='Bu tarayıcı video kodlamayı desteklemiyor. Chrome, Edge ya da Safari’yi dene.';
  $('#vGo').disabled=no;
}
const fmtDur=s=>s.toFixed(1).replace('.',',')+' sn';
// frames inside transition windows (rendered twice)
const trFrames=()=>{const L=seqLayout(),n=frames(),dt=1/fps();let k=0;for(let i=0;i<n;i++){const f=seqAt(L,i*dt);if(f&&f.b&&f.tr&&f.tr.kind!=='cut')k++;}return k;};
let blob=null;
// source: 'seq' opens with the sequence selected (the Sıra view's button); otherwise the last choice, the sequence
// when the board has nothing to animate but a sequence exists
function openDialog(source){
  if(source)X.source=source;
  if(!seqReady())X.source='board';
  else if(X.source!=='seq'&&!anyAnim()&&!state.devices.some(hasVideo))X.source='seq';
  if(X.source!=='seq'&&!anyAnim()&&!state.devices.some(hasVideo)){toast('Henüz animasyon yok: önce bir anahtar kare, metin efekti ya da ekran videosu ekle');return;}
  stop();blob=null;$('#videoSetup').hidden=false;$('#videoRun').hidden=true;$('#videoTitle').textContent='Video dışa aktar';
  syncSetup();scrim.hidden=false;$('#vGo').focus();
}
function close(){if(running){cancel=true;return;}scrim.hidden=true;$('#exportMenuBtn').focus();}
let running=false;
async function go(){
  $('#videoSetup').hidden=true;$('#videoRun').hidden=false;$('#vSave').hidden=true;$('#vStop').textContent='İptal';
  $('#videoTitle').textContent='Video hazırlanıyor';$('#vBar').style.width='0';
  cancel=false;running=true;const t0=performance.now();
  try{
    blob=await renderVideo((i,n)=>{
      const el=(performance.now()-t0)/1000,eta=el/i*(n-i);
      $('#vBar').style.width=(i/n*100)+'%';$('#vCount').textContent=i+' / '+n+' kare';
      $('#vEta').textContent=i<n?'kalan ~'+(eta<60?Math.ceil(eta)+' sn':Math.ceil(eta/60)+' dk'):'';
    });
    running=false;
    if(!blob){scrim.hidden=true;toast('Video dışa aktarımı iptal edildi');return;}
    $('#videoTitle').textContent='Video hazır';$('#vEta').textContent=(blob.size/1e6).toFixed(1).replace('.',',')+' MB · '+Math.round((performance.now()-t0)/1000)+' sn';
    $('#vStop').textContent='Kapat';$('#vSave').hidden=false;$('#vSave').focus();
  }catch(e){
    running=false;scrim.hidden=true;console.warn('Video dışa aktarılamadı:',e);
    toast(e&&e.message==='codec'?'Bu boyutta video kodlanamıyor. 1080 px dene.':'Video oluşturulamadı. Daha küçük bir çözünürlük dene.');
  }
}
const stamp=()=>{const d=new Date(),z=x=>String(x).padStart(2,'0');return d.getFullYear()+z(d.getMonth()+1)+z(d.getDate())+'-'+z(d.getHours())+z(d.getMinutes());};
$$('#vSrc button').forEach(b=>b.addEventListener('click',()=>{X.source=b.dataset.v;syncSetup();}));
$$('#vRes button').forEach(b=>b.addEventListener('click',()=>{X.res=+b.dataset.v;syncSetup();}));
$$('#vFps button').forEach(b=>b.addEventListener('click',()=>{X.fps=+b.dataset.v;syncSetup();}));
$('#vBlur').addEventListener('change',e=>{X.blur=e.target.checked;});
$('#vGo').addEventListener('click',go);
$('#vCancel').addEventListener('click',close);$('#videoX').addEventListener('click',close);
$('#vStop').addEventListener('click',()=>{if(running)cancel=true;else close();});
$('#vSave').addEventListener('click',()=>{if(blob)offer((useSeq()?'mockup-sira-':'mockup-animasyon-')+stamp()+'.'+FORMATS[X.format].ext,blob);toast('İndirildi');close();});
$$('#vFmt button').forEach(b=>b.addEventListener('click',()=>{X.format=b.dataset.v;syncSetup();}));
$$('#vQuality button').forEach(b=>b.addEventListener('click',()=>{X.quality=b.dataset.v;syncSetup();}));
scrim.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
// in Canlandır the export button opens this dialog instead of the image export popover
$('#exportMenuBtn').addEventListener('click',e=>{if(ui.mode!=='animate')return;e.preventDefault();e.stopImmediatePropagation();openDialog();},true);
onAnim(()=>{if(!scrim.hidden&&!running)syncSetup();});

export {renderVideo,openDialog as openVideoExport,X as videoOptions};
