import {ArrayBufferTarget,Muxer} from 'mp4-muxer';
import {LRT} from '../lights/runtime.js';
import {pauseLive,renderNow} from '../render/accumulation.js';
import {canvas,overlays,renderer,req,setCrop} from '../render/renderer.js';
import {applyTransform} from '../render/transform.js';
import {hasAnim} from '../state/anim.js';
import {state,view} from '../state/state.js';
import {applyAt,applyNow,onAnim,stop} from '../ui/animate.js';
import {invalidateLayout,layout,paintBg,paintItems} from '../ui/layout.js';
import {toast} from '../ui/toast.js';
import {ui} from '../ui/ui-state.js';
import {$,$$,mkCanvas} from '../util.js';
import {exportSize,offer} from './export.js';

/* Video export (Canlandır): every frame is set up at its time and rendered like the fast still export (progressive
   samples, background and 2D items composited), then encoded to H.264 with WebCodecs and muxed into an MP4.
   Deterministic: frame i shows t = i / fps whatever the machine's speed.
   Motion blur: the frame's samples are spread over half a frame interval around t (a 180° shutter), so only what
   moves blurs, like a real camera. The screenshot scroll is set once per frame (redrawing it per sample is costly). */
const SAMPLES=16,SHUTTER=.5,BPP=.16;  // bits per pixel per frame
const X={res:1080,fps:30,blur:true};
const scrim=$('#videoScrim');
const size=()=>{const [w,h]=exportSize(X.res);return [w-w%2,h-h%2];};  // H.264 wants even sizes
const frames=()=>Math.round(state.anim.dur*X.fps);
const bitrate=(w,h)=>Math.round(w*h*X.fps*BPP);

async function pickConfig(w,h){
  if(typeof VideoEncoder==='undefined')return null;
  for(const codec of ['avc1.640034','avc1.640033','avc1.64002a','avc1.4d0034','avc1.42003e']){
    const c={codec,width:w,height:h,bitrate:bitrate(w,h),framerate:X.fps,avc:{format:'avc'}};
    try{const r=await VideoEncoder.isConfigSupported(c);if(r.supported)return r.config;}catch(e){/* next */}
  }
  return null;
}

let cancel=false;
async function renderVideo(onProgress){
  const [W,H]=size(),n=frames(),config=await pickConfig(W,H);
  if(!config)throw new Error('codec');
  const target=new ArrayBufferTarget();
  const muxer=new Muxer({target,video:{codec:'avc',width:W,height:H,frameRate:X.fps},fastStart:'in-memory',firstTimestampBehavior:'offset'});
  let failed=null;
  const enc=new VideoEncoder({output:(chunk,meta)=>muxer.addVideoChunk(chunk,meta),error:e=>{failed=e;}});
  enc.configure(config);
  const pr=renderer.getPixelRatio(),out=mkCanvas(W,H),g=out.getContext('2d');
  const hidden=[];LRT.forEach(o=>{if(o.marker.visible){o.marker.visible=false;hidden.push(o.marker);}});overlays.forEach(o=>{if(o.visible){o.visible=false;hidden.push(o);}});
  pauseLive(true);
  try{
    setCrop(null);renderer.setPixelRatio(1);renderer.setSize(W,H,false);view.aspect=W/H;applyTransform();
    const moving=state.devices.some(hasAnim),dt=1/X.fps;
    for(let i=0;i<n;i++){
      if(cancel)return null;
      if(failed)throw failed;
      const t=i*dt;
      applyAt(t,{sync:true});
      if(X.blur&&moving)renderNow(SAMPLES,j=>{applyAt(Math.max(0,Math.min(state.anim.dur,t+((j+.5)/SAMPLES-.5)*SHUTTER*dt)),{scroll:false});});
      else renderNow(SAMPLES);
      g.clearRect(0,0,W,H);
      if(state.bg==='transparent'){g.fillStyle='#ffffff';g.fillRect(0,0,W,H);}  // MP4 has no alpha
      paintBg(g,W,H);paintItems(g,W,H,false);g.drawImage(canvas,0,0,W,H);paintItems(g,W,H,true);
      const f=new VideoFrame(out,{timestamp:Math.round(i*1e6/X.fps),duration:Math.round(1e6/X.fps)});
      enc.encode(f,{keyFrame:i%(X.fps*2)===0});f.close();
      while(enc.encodeQueueSize>2)await new Promise(r=>setTimeout(r,2));
      onProgress(i+1,n);
      await new Promise(r=>setTimeout(r,0));  // let the page breathe (progress, cancel)
    }
    await enc.flush();
    if(failed)throw failed;
    muxer.finalize();
    return new Blob([target.buffer],{type:'video/mp4'});
  }finally{
    try{if(enc.state!=='closed')enc.close();}catch(e){/* closed */}
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
  $('#vMb').textContent='~'+Math.max(1,Math.round(bitrate(w,h)*state.anim.dur/8e6))+' MB';
  const no=typeof VideoEncoder==='undefined';
  $('#vWarn').hidden=!no;$('#vWarn').textContent='Bu tarayıcı video kodlamayı desteklemiyor. Chrome, Edge ya da Safari’yi dene.';
  $('#vGo').disabled=no;
}
let blob=null;
function openDialog(){
  if(!state.devices.some(hasAnim)){toast('Henüz animasyon yok: önce bir anahtar kare ekle');return;}
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
$('#vSave').addEventListener('click',()=>{if(blob)offer('mockup-animasyon-'+stamp()+'.mp4',blob);toast('İndirildi');close();});
scrim.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
// in Canlandır the export button opens this dialog instead of the image export popover
$('#exportMenuBtn').addEventListener('click',e=>{if(ui.mode!=='animate')return;e.preventDefault();e.stopImmediatePropagation();openDialog();},true);
onAnim(()=>{if(!scrim.hidden&&!running)syncSetup();});

export {renderVideo};
