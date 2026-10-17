import {hasBoard,onBoards} from './boards.js';
import {captureAvailable} from './capture.js';
import {onSyncUI} from './sync.js';
import {toast} from './toast.js';
import {$,$$} from '../util.js';

/* The welcome card: an empty document (no artboard) opens on it instead of on a bare canvas
   (wireframes/onboarding.html, alternative A with B's goals). A site address or dropped screenshots / videos lead
   to ready-made scenes; "Ne hazırlıyorsun?" picks what they are for. The panels, the dock and the canvas are out of
   the way while it shows (html.wl-on); it goes as soon as the document has an artboard, whatever made it. The
   address row is there only where capturing works (the dev server), otherwise the drop zone is the way in. */
const root=document.documentElement,card=$('#welcome');
let goal='land',shown=false;

function sync(){
  const on=!hasBoard();
  if(on===shown)return;
  shown=on;card.hidden=!on;root.classList.toggle('wl-on',on);
  if(on)requestAnimationFrame(()=>{const f=!$('#wlUrlRow').hidden?$('#wlUrl'):$('#wlDrop');if(!root.classList.contains('booting'))f.focus();});
}
onBoards(sync);onSyncUI(sync);

captureAvailable().then(ok=>{
  $('#wlUrlRow').hidden=$('#wlOr').hidden=!ok;
  if(!ok)$('#wlSub').textContent='Ekran görüntülerini ya da ekran videonu bırak; telefon, tablet ve dizüstünde hazır sahneler kuralım.';
});

$$('#welcome [data-goal]').forEach(b=>b.addEventListener('click',()=>{
  goal=b.dataset.goal;$$('#welcome [data-goal]').forEach(c=>c.setAttribute('aria-pressed',String(c===b)));
}));

// what the card was given: a site address or files; the scenes are built in the next steps
function start(input){toast('Hazırlanıyor: '+(input.url||input.files.length+' dosya')+' · '+goal);}

$('#wlUrlRow').addEventListener('submit',e=>{e.preventDefault();const v=$('#wlUrl').value.trim();if(!v){$('#wlUrl').focus();return;}start({url:v});});
const drop=$('#wlDrop'),file=$('#wlFile');
drop.addEventListener('click',()=>file.click());
drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();file.click();}});
file.addEventListener('change',()=>{const fs=[...file.files];file.value='';if(fs.length)start({files:fs});});
$('#wlBlank').addEventListener('click',()=>$('#emptyAddBoard').click());
$('#wlOpen').addEventListener('click',()=>$('#openProjectBtn').click());

export {start as startWelcome};
