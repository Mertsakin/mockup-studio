import {hasVideo,showFrames} from '../devices/video.js';
import {LRT} from '../lights/runtime.js';
import {pauseLive,renderNow} from '../render/accumulation.js';
import {fontsReady} from '../render/text.js';
import {canvas,overlays,renderer,req,setCrop} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {hasAnim,kindOf} from '../state/anim.js';
import {state,view} from '../state/state.js';
import {anyAnim,applyAt,applyNow,onAnim,stop,targets} from '../ui/animate.js';
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
   moves blurs, like a real camera. The screenshot scroll is set once per frame (redrawing it per sample is costly). */
const SAMPLES=16,DOF_SAMPLES=64,SHUTTER=.5;
const X={res:1920,fps:30,blur:true,format:'mp4'};
const GIF_W=720,GIF_FPS=15;  // a GIF is a palette per frame: past these it gets large and slow for little gain
const scrim=$('#videoScrim');
const fps=()=>X.format==='gif'?GIF_FPS:X.fps;
// the file's size: the board's shape at the chosen width (a GIF at most GIF_W wide); even sides (H.264, VP9)
const size=()=>{let [w,h]=exportSize(X.res,X.res);if(X.format==='gif'&&w>GIF_W){h=Math.round(h*GIF_W/w);w=GIF_W;}return [w-w%2,h-h%2];};
const frames=()=>Math.round(state.anim.dur*fps());

let cancel=false;
async function renderVideo(onProgress){
  await fontsReady(state.items);
  // a transparent board stays transparent where the format can carry it (WebM with alpha, GIF); MP4 gets white
  const [W,H]=size(),n=frames(),enc=await encoderFor(X.format,W,H,fps(),{alpha:state.bg==='transparent'});  // throws 'codec' when the size cannot be encoded
  const pr=renderer.getPixelRatio(),out=mkCanvas(W,H),g=out.getContext('2d');
  // the background painter whitens empty space for the still export's opaque formats (state.format): the video's own
  // format decides here (a transparent GIF / WebM must stay transparent whatever the still format is)
  const stillFormat=state.format;state.format=enc.alpha?'png':'jpg';
  const hidden=[];LRT.forEach(o=>{if(o.marker.visible){o.marker.visible=false;hidden.push(o.marker);}});overlays.forEach(o=>{if(o.visible){o.visible=false;hidden.push(o);}});
  pauseLive(true);
  try{
    setCrop(null);renderer.setPixelRatio(1);renderer.setSize(W,H,false);view.aspect=W/H;applyTransform();
    // anything in 3D moving (devices, camera, lights) gets motion blur; moving lights also rebuild the reflections per frame
    const moving=targets().some(o=>kindOf(o)!=='item'&&hasAnim(o)),lightsMove=state.lights.some(hasAnim),video=state.devices.some(hasVideo),dt=1/fps(),S=dofOn()?DOF_SAMPLES:SAMPLES;  // the aperture needs more samples (bokeh)
    for(let i=0;i<n;i++){
      if(cancel)return null;
      const t=i*dt;
      applyAt(t,{sync:true});if(video)await showFrames(t);if(lightsMove)scheduleEnv(true);  // screen videos: the exact frame, drawn before the samples
      // the focus is the frame's own (its time): the motion blur sub-samples keep it (render/lens.js)
      holdFocus(true);
      if(X.blur&&moving)renderNow(S,j=>{applyAt(Math.max(0,Math.min(state.anim.dur,t+((j+.5)/S-.5)*SHUTTER*dt)),{scroll:false});});
      else renderNow(S);
      holdFocus(false);
      g.clearRect(0,0,W,H);
      paintBg(g,W,H);paintItems(g,W,H,false,t);g.drawImage(canvas,0,0,W,H);paintItems(g,W,H,true,t);
      await enc.add(out,i);
      onProgress(i+1,n);
      await new Promise(r=>setTimeout(r,0));  // let the page breathe (progress, cancel)
    }
    return await enc.finish();
  }finally{
    state.format=stillFormat;enc.close();holdFocus(false);
    hidden.forEach(o=>{o.visible=true;});
    pauseLive(false);renderer.setPixelRatio(pr);invalidateLayout();layout();
    applyNow();req();
  }
}

/* ---------- dialog */
function syncSetup(){
  const [w,h]=size();
  $$('#vRes button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===X.res)));
  $$('#vFps button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===X.fps)));
  $('#vRes').closest('.row').hidden=state.ratio==='custom';
  $('#vBlur').checked=X.blur;
  $('#vDur').textContent=state.anim.dur.toFixed(1).replace('.',',')+' sn';
  $('#vFrames').textContent=String(frames());$('#vSize').textContent=w+' × '+h;
  $('#vMb').textContent='~'+Math.max(1,Math.round(estimate(X.format,w,h,fps(),state.anim.dur)/1e6))+' MB';
  $$('#vFmt button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===X.format)));
  const note=FORMATS[X.format].d+(X.format==='gif'&&state.anim.dur>8?'. '+state.anim.dur.toFixed(0)+' sn uzun bir GIF büyük olur; kısa bir döngü dene.':'');
  $('#vFmtNote').textContent=note;
  // a transparent board: which formats keep it (GIF always, WebM where the browser encodes alpha, MP4 never)
  if(state.bg==='transparent'){
    if(X.format==='mp4')$('#vFmtNote').textContent=note+'. Şeffaf arka plan beyaz olur; şeffaf için GIF.';
    else if(X.format==='gif')$('#vFmtNote').textContent=note+'. Şeffaf arka plan korunur (kenarlar keskin).';
    else webmAlpha().then(ok=>{if(X.format==='webm')$('#vFmtNote').textContent=note+(ok?'. Şeffaf arka plan korunur.':'. Bu tarayıcı şeffaf WebM kodlayamıyor; arka plan beyaz olur. Şeffaf için GIF.');});
  }
  $$('#vFps button').forEach(b=>{b.disabled=X.format==='gif';});
  $('#vSave').textContent=FORMATS[X.format].n+' indir';
  const no=typeof VideoEncoder==='undefined'&&X.format!=='gif';  // a GIF needs no WebCodecs
  $('#vWarn').hidden=!no;$('#vWarn').textContent='Bu tarayıcı video kodlamayı desteklemiyor. Chrome, Edge ya da Safari’yi dene.';
  $('#vGo').disabled=no;
}
let blob=null;
function openDialog(){
  if(!anyAnim()&&!state.devices.some(hasVideo)){toast('Henüz animasyon yok: önce bir anahtar kare, metin efekti ya da ekran videosu ekle');return;}
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
$$('#vRes button').forEach(b=>b.addEventListener('click',()=>{X.res=+b.dataset.v;syncSetup();}));
$$('#vFps button').forEach(b=>b.addEventListener('click',()=>{X.fps=+b.dataset.v;syncSetup();}));
$('#vBlur').addEventListener('change',e=>{X.blur=e.target.checked;});
$('#vGo').addEventListener('click',go);
$('#vCancel').addEventListener('click',close);$('#videoX').addEventListener('click',close);
$('#vStop').addEventListener('click',()=>{if(running)cancel=true;else close();});
$('#vSave').addEventListener('click',()=>{if(blob)offer('mockup-animasyon-'+stamp()+'.'+FORMATS[X.format].ext,blob);toast('İndirildi');close();});
$$('#vFmt button').forEach(b=>b.addEventListener('click',()=>{X.format=b.dataset.v;syncSetup();}));
scrim.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
// in Canlandır the export button opens this dialog instead of the image export popover
$('#exportMenuBtn').addEventListener('click',e=>{if(ui.mode!=='animate')return;e.preventDefault();e.stopImmediatePropagation();openDialog();},true);
onAnim(()=>{if(!scrim.hidden&&!running)syncSetup();});

export {renderVideo};
