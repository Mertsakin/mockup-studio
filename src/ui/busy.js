/* Full-screen progress for still exports (a photo-quality render takes half a minute or more): a scrim over the
   whole editor with a card in the dialog style: title, what is happening now, a progress bar, percent and the time
   left, "2 / 5" for batches, and Vazgeç.
   const b = busy('Fotoğraf hazırlanıyor', {stage}); b.step(i, n, name); b.progress(p 0..1 | null: indeterminate); b.close().
   stage(p) names what is happening for the line under the title; the default is the path tracer's stages.
   Cancelling: b.progress throws a CANCEL error once Vazgeç was pressed; the path tracer calls it from its loop
   (via onProgress), so the render stops there and its own finally blocks restore the scene. isCancel(e) tells it apart.
   The card fades in after a moment (CSS): a fast export that ends sooner never flashes it. */
import {t} from '../lang.js';

const CANCEL='cancel';
const isCancel=e=>!!e&&e.message===CANCEL;
let el=null;
function build(){
  el=document.createElement('div');el.className='scrim busy';el.hidden=true;
  el.innerHTML='<div class="dialog busy-card" role="alertdialog" aria-modal="true" aria-labelledby="busyTitle" aria-describedby="busyStage">'+
    '<div class="busy-head"><span class="busy-spin" aria-hidden="true"></span><div><div id="busyTitle" class="busy-title"></div><div id="busyStage" class="busy-stage"></div></div>'+
    '<span class="busy-step"></span></div>'+
    '<div class="prog busy-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div>'+
    '<div class="busy-foot"><span class="busy-pct"></span><span class="busy-eta"></span><button class="btn" type="button"></button></div></div>';
  document.body.appendChild(el);
}
const fmtTime=s=>s<60?Math.max(1,Math.round(s))+' '+t('sn'):Math.floor(s/60)+' '+t('dk')+' '+String(Math.round(s%60)).padStart(2,'0')+' '+t('sn');
// what the path tracer's progress means (render/pathtrace.js: sampling up to .9, then denoising)
const stageOf=p=>t(p==null?'Sahne hazırlanıyor':p<.9?'Işık izleniyor':p<1?'Gürültü temizleniyor':'Dosya hazırlanıyor');

function busy(title,{stage=stageOf}={}){
  if(!el)build();
  const $=s=>el.querySelector(s),bar=$('.busy-prog'),fill=bar.firstChild,btn=$('button');
  let cancelled=false,t0=0,p0=0,last=0;
  const prevFocus=document.activeElement;
  $('.busy-title').textContent=title;$('.busy-step').textContent='';btn.disabled=false;btn.textContent=t('Vazgeç');
  el.hidden=false;btn.focus({preventScroll:true});
  btn.onclick=()=>{cancelled=true;btn.disabled=true;btn.textContent=t('Durduruluyor…');};
  el.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();btn.click();}};
  progress(null);
  function progress(p){
    if(cancelled)throw new Error(CANCEL);
    const now=performance.now();
    bar.classList.toggle('ind',p==null);
    $('.busy-stage').textContent=stage(p);
    if(p==null){t0=0;fill.style.width='';bar.removeAttribute('aria-valuenow');$('.busy-pct').textContent='';$('.busy-eta').textContent='';return;}
    if(!t0){t0=now;p0=p;}  // the pace counts from the first real progress (not the scene set-up)
    fill.style.width=(p*100).toFixed(1)+'%';bar.setAttribute('aria-valuenow',String(Math.round(p*100)));
    $('.busy-pct').textContent=t('%{n}',{n:Math.round(p*100)});
    // the time left from the pace so far, once there is enough of it (updated at most twice a second: no jitter)
    if(now-last>500||p>=1){last=now;const rate=(p-p0)/((now-t0)/1000);$('.busy-eta').textContent=p-p0>.03&&p<1&&rate>0?t('yaklaşık {t} kaldı',{t:fmtTime((1-p)/rate)}):'';}
  }
  return {
    progress,
    // a batch: item i of n; the bar and the time left start over for each
    step(i,n,name){$('.busy-step').textContent=n>1?(i+1)+' / '+n:'';if(name)$('.busy-title').textContent=title+': '+name;last=0;progress(null);},
    get cancelled(){return cancelled;},
    close(){el.hidden=true;el.onkeydown=null;btn.onclick=null;if(prevFocus&&prevFocus.focus)prevFocus.focus({preventScroll:true});}
  };
}
// two frames: the card is on screen before a synchronous render blocks the page
const paint=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

export {busy,isCancel,paint};
