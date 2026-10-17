import {buildRT,disposeRT} from '../devices/runtime.js';
import {RT} from '../devices/rt.js';
import {applyLightPreset} from '../lights/actions.js';
import {LIGHT_PRESETS} from '../lights/mods.js';
import {FONTS} from '../render/text.js';
import {comp} from '../render/stage.js';
import {applyTransform,deviceBox,refit} from '../render/transform.js';
import {STORE_SIZES,ZOOM_MAX,ZOOM_MIN} from '../state/constants.js';
import {newDevice,state,view} from '../state/state.js';
import {activate,addBoard,storeActive} from './boards.js';
import {nodeOf} from './frames.js';
import {addFrame,addText} from './items.js';
import {bgCss,layout,renderItems} from './layout.js';
import {select} from './selection.js';
import {onSyncUI,syncAll} from './sync.js';
import {toast} from './toast.js';
import {setUi} from './ui-state.js';
import {fitAll} from './workspace.js';
import {$,D2R} from '../util.js';

/* Store listing sets (Sıradaki yol 4): App Store / Google Play sized artboards (STORE_SIZES), 3–8 screens with a
   headline and a subtitle each, the user's screenshots in the devices, one colour theme and font for the set, and a
   layout:
   - Klasik: every screen a device low in the frame, text above.
   - Dönüşümlü: the same, the device turned left and right in turn.
   Every screen's headline and subtitle form an auto-layout frame (addTexts).
   - Panorama: the screens are slices of one wide scene (state.pano, lens shift in render/transform.js; boards.js keeps
     the set's scene in sync): the background gradient runs across the set and one device lies across the seam
     between the first two screens.
   Everything stays ordinary studio state afterwards. Exports as 24-bit PNG (no alpha, what the stores ask for). */
const THEMES=[
  {id:'gece',n:'Gece',c1:'#151a3b',c2:'#4c2b7c',ink:'#ffffff',sub:'#cfcaf2',dev:'graphite'},
  {id:'okyanus',n:'Okyanus',c1:'#0e3f73',c2:'#1aa6bf',ink:'#ffffff',sub:'#d3f1f7',dev:'graphite'},
  {id:'gunbatimi',n:'Gün batımı',c1:'#ff8a5b',c2:'#e9407f',ink:'#ffffff',sub:'#ffe6ee',dev:'white'},
  {id:'kagit',n:'Kâğıt',c1:'#f6f2ea',c2:'#e3eaf5',ink:'#14161c',sub:'#5a5f6b',dev:'silver'},
  {id:'nane',n:'Nane',c1:'#e3faf1',c2:'#c6ecff',ink:'#0c3934',sub:'#3e6b66',dev:'white'},
  {id:'mono',n:'Mono',c1:'#101113',c2:'#2b2e35',ink:'#ffffff',sub:'#b9bcc4',dev:'graphite'}
];
const LAYOUTS={classic:'Klasik',tilt:'Dönüşümlü',pano:'Panorama'};
const SAMPLE=['Her şey tek yerde | Görevlerin, notların ve takvimin yan yana.','Odaklan, daha çok bitir | Akıllı listeler önceliği senin yerine belirler.',
  'Ekibinle senkron kal | Paylaşılan panolar, anlık güncellemeler.','Her cihazda seninle | Telefon, tablet ve bilgisayar arasında kesintisiz.',
  'Ücretsiz başla | Kurulum bir dakika sürer.','Gece de rahat | Karanlık mod gözünü yormaz.','Verilerin güvende | Uçtan uca şifreleme.',
  'Hemen indir | Binlerce ekip zaten kullanıyor.'];

const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
const parse=text=>text.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const [h,...s]=l.split('|');return {h:h.trim(),s:s.join('|').trim()};});

/* ---------- one screen: size, background, lights, texts (devices: see below) */
function setupBoard(o,i){
  const sz=o.size,T=o.theme,pano=o.layout==='pano';
  Object.assign(state,{ratio:'custom',customW:sz.w,customH:sz.h,format:'png24',floor:false,wall:false,bg:'gradient',gradType:'linear',
    gradAngle:pano?90:160,bg1:pano?mix(T.c1,T.c2,i/o.n):T.c1,bg2:pano?mix(T.c1,T.c2,(i+1)/o.n):T.c2,bgImg:null,items:[],
    pano:pano?{g:o.g,i,n:o.n}:null});
  Object.assign(state.scene,{rx:-4,ry:0,rz:0,zoom:1,fov:24,panX:0,panY:0});
  applyLightPreset(LIGHT_PRESETS.find(p=>p.n==='Yumuşak tavan')||LIGHT_PRESETS[0]);
  [...RT.keys()].forEach(disposeRT);state.devices=[];state.selected=null;
  bgCss();layout();
  addTexts(o,i);
}
// headline near the top, subtitle under it; both wrap within the safe width
/* The headline and subtitle sit in an auto-layout frame ("Başlık bloğu"): a column as wide as the safe area, hugging
   its height, the texts filling its width (so they wrap there). Editing a headline later re-flows the block; moving the
   block moves both. Portrait: centred, near the top. Landscape: left aligned, on the left, centred vertically. */
function addTexts(o,i){
  const line=o.lines[i]||{h:'',s:''},W=o.size.w,H=o.size.h,land=W>H,T=o.theme;
  const hs=land?.052:.085,ss=land?.024:.04,width=land?.4:.84,margin=land?.07:.06;
  if(!line.h&&!line.s)return;
  const f=addFrame({name:'Başlık bloğu',fillOn:false,radius:0,wMode:'fixed',w:width,hMode:'hug',x:land?margin+width/2:.5,y:.5,
    layout:{dir:'col',gap:+((land?.03:.012)*H/W).toFixed(5),pad:[0,0,0,0],justify:'start',align:land?'start':'center'}});
  const add=(text,size,props)=>{if(!text)return;
    const it=addText(Object.assign({text,font:o.font,size,wMode:'fill',wrap:0,lh:1.08,align:land?'left':'center',color:T.ink},props));it.parent=f.id;};
  add(line.h,hs,{weight:800,ls:-.02,name:'Başlık'});
  add(line.s,ss,{weight:500,lh:1.3,color:T.sub,name:'Alt başlık'});
  renderItems();
  // the block hugs its height, so its stored y is its top edge (it grows downwards when a headline gets longer):
  // the margin (portrait), or centred once its height is known (landscape)
  const n=nodeOf(f);f.y=land&&n?+(.5-n.h/2/H).toFixed(5):margin;
  renderItems();
}

/* ---------- devices and framing
   The camera is set so the device is `frac` of the board's height: the board's height at the target plane is
   vh = 2·eff·tan(fov/2) (eff: camDist), so eff follows from the device's height, and Yakınlık from eff. */
function frame(heightWorld,frac,aspect){
  const v=state.scene.fov*D2R,vh=heightWorld/frac,eff=vh/(2*Math.tan(v/2));
  const h=2*Math.atan(Math.tan(v/2)*aspect),e=Math.min(v,h);
  state.scene.zoom=+Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,view.fitRadius/Math.sin(e/2)*.9/eff)).toFixed(3);
  return vh;
}
const devHeight=d=>{const b=deviceBox(d.id);return b.isEmpty()?14.7:b.max.y-b.min.y;};
function device(o,k,props){
  const d=newDevice(o.size.dev,Object.assign({colorKey:o.theme.dev,glare:true,fit:'cover'},props));
  const img=o.shots[k];if(img){d.img=img;d.imgName=img.dataset.name||'Ekran görüntüsü';}
  state.devices.push(d);buildRT(d);return d;
}
// Klasik / Dönüşümlü: one device per screen, low in the frame (its bottom runs off the board a little)
function soloDevice(o,i){
  const a=o.size.w/o.size.h,land=a>1,turn=o.layout==='tilt'?(i%2?-1:1)*26:land?-14:-8;
  // a tablet on a landscape board lies landscape too
  const d=device(o,i,{ry:turn,rx:0,landscape:land&&o.size.dev==='tablet'});state.selected=d.id;
  refit();applyTransform();
  frame(devHeight(d),land?(o.size.dev==='tablet'?.52:.9):.76,a);
  if(land){state.scene.panX=o.size.dev==='tablet'?.2:.24;state.scene.panY=o.size.dev==='tablet'?-.02:-.12;}else state.scene.panY=-.15;
  applyTransform();
}
// Panorama: devices placed across the whole set, the first one over the seam between screens 1 and 2
function panoDevices(o){
  const a=o.size.w/o.size.h,n=o.n,frac=.62;
  const d0=device(o,0,{rz:-12,ry:14,scale:1.08});refit();applyTransform();
  const Hd=devHeight(d0)/1.08,W=Hd/frac*a,x=k=>(k-n/2)*W;  // board k's left edge (k + .5: its centre)
  d0.px=+x(1).toFixed(2);d0.py=-1;
  for(let i=2;i<n;i++)device(o,i-1,{px:+x(i+.5).toFixed(2),ry:(i%2?-1:1)*12});  // screenshots in order: the seam device has the first
  state.selected=d0.id;
  refit();comp.position.x=0;  // the set's centre stays the frame's centre (the slices are cut from it)
  frame(Hd,frac,a*n);state.scene.panY=-.15;applyTransform();
}

/* ---------- the set */
async function generate(o){
  const base=o.size.store==='App Store'?'App Store':'Google Play';
  o.g=Date.now();o.n=o.single?1:o.n;
  const boards=[];
  for(let i=0;i<o.n;i++){
    const b=addBoard(null,o.size.single?base+' öne çıkan':base+' '+(i+1));boards.push(b);
    setupBoard(o,i);
    if(o.layout!=='pano')soloDevice(o,i);
    renderItems();syncAll();
    await new Promise(r=>requestAnimationFrame(r));
  }
  if(o.layout==='pano'){
    activate(boards[0].id);panoDevices(o);syncAll();
    storeActive();  // the scene goes to the other screens of the set (boards.js syncPano)
  }
  select([]);setUi({kind:'board'});fitAll();
  toast(o.n+' ekranlık '+base+' seti oluşturuldu');
}

/* ---------- dialog */
// pre: screenshots to start with (the welcome card's files); a click event otherwise
function openDialog(pre){
  const sc=document.createElement('div');sc.className='scrim';
  sc.innerHTML='<div class="dialog store-dlg" role="dialog" aria-modal="true" aria-labelledby="stTitle"><div class="dh"><span id="stTitle">Mağaza seti oluştur</span>'+
    '<button class="ib sm" type="button" data-a="cancel" aria-label="Kapat"><span>✕</span></button></div><div class="db">'+
    '<div class="row"><label class="lbl" for="stSize">Ölçü</label><select id="stSize"></select></div>'+
    '<div class="row" id="stCountRow"><span class="lbl">Ekran sayısı</span><div class="seg" id="stCount" role="group" aria-label="Ekran sayısı"></div></div>'+
    '<div class="row"><span class="lbl">Düzen</span><div class="seg" id="stLayout" role="group" aria-label="Düzen"></div></div>'+
    '<div class="row"><span class="lbl">Renk</span><div class="swatches" id="stTheme" role="group" aria-label="Renk teması"></div></div>'+
    '<div class="row"><label class="lbl" for="stFont">Yazı tipi</label><select id="stFont"></select></div>'+
    '<label class="lbl block" for="stLines">Başlıklar: her satır bir ekran, alt başlığı | ile ayır</label><textarea class="tbody" id="stLines" rows="6" spellcheck="false"></textarea>'+
    '<div class="row"><span class="lbl">Ekran görüntüleri</span><span class="cells"><button class="btn" type="button" id="stShotsBtn">Seç…</button></span></div>'+
    '<p class="hint-sm" id="stShotsNote">İstersen sonra da ekleyebilirsin. Sırayla ekranlara yerleşir (dosya adına göre).</p>'+
    '<input type="file" id="stShots" accept="image/*" multiple hidden>'+
    '<div class="dfoot"><button class="btn" type="button" data-a="cancel">Vazgeç</button><button class="btn primary" type="button" data-a="go">Oluştur</button></div></div></div>';
  document.body.appendChild(sc);
  const q=s=>sc.querySelector(s),o={n:5,layout:'classic',theme:THEMES[0],font:'Plus Jakarta Sans',shots:Array.isArray(pre)?pre:[]};
  if(o.shots.length){o.n=Math.max(3,Math.min(8,o.shots.length));q('#stShotsNote').textContent=o.shots.length+' görsel seçildi; sırayla ekranlara yerleşecek.';}
  STORE_SIZES.forEach(z=>q('#stSize').appendChild(new Option(z.store+' · '+z.n+' ('+z.w+' × '+z.h+')',z.id)));
  FONTS.forEach(f=>q('#stFont').appendChild(new Option(f.name,f.name)));q('#stFont').value=o.font;
  [3,4,5,6,7,8].forEach(n=>{const b=document.createElement('button');b.type='button';b.textContent=n;b.dataset.v=n;q('#stCount').appendChild(b);});
  Object.entries(LAYOUTS).forEach(([k,n])=>{const b=document.createElement('button');b.type='button';b.textContent=n;b.dataset.v=k;q('#stLayout').appendChild(b);});
  THEMES.forEach(t=>{const b=document.createElement('button');b.type='button';b.className='sw';b.dataset.v=t.id;b.title=t.n;b.setAttribute('aria-label',t.n);
    b.style.background='linear-gradient(135deg,'+t.c1+','+t.c2+')';q('#stTheme').appendChild(b);});
  q('#stLines').value=SAMPLE.slice(0,o.n).join('\n');
  const sync=()=>{
    const z=STORE_SIZES.find(x=>x.id===q('#stSize').value)||STORE_SIZES[0];
    q('#stCountRow').hidden=!!z.single;
    q('#stCount').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===o.n)));
    q('#stLayout').querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.v===o.layout));b.disabled=!!z.single&&b.dataset.v==='pano';});
    q('#stTheme').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===o.theme.id)));
  };
  q('#stSize').addEventListener('change',sync);
  q('#stCount').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    const prev=o.n;o.n=+b.dataset.v;
    // the sample headlines follow the count while they are untouched
    const cur=q('#stLines').value;if(cur===SAMPLE.slice(0,prev).join('\n'))q('#stLines').value=SAMPLE.slice(0,o.n).join('\n');sync();});
  q('#stLayout').addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!b.disabled){o.layout=b.dataset.v;sync();}});
  q('#stTheme').addEventListener('click',e=>{const b=e.target.closest('button');if(b){o.theme=THEMES.find(t=>t.id===b.dataset.v);sync();}});
  q('#stFont').addEventListener('change',e=>{o.font=e.target.value;});
  q('#stShotsBtn').addEventListener('click',()=>q('#stShots').click());
  q('#stShots').addEventListener('change',async e=>{
    const files=[...e.target.files].sort((a,b)=>a.name.localeCompare(b.name,'tr',{numeric:true}));
    o.shots=await Promise.all(files.map(f=>new Promise(res=>{const img=new Image();img.dataset.name=f.name;img.onload=()=>res(img);img.onerror=()=>res(null);img.src=URL.createObjectURL(f);})));
    o.shots=o.shots.filter(Boolean);q('#stShotsNote').textContent=o.shots.length+' görsel seçildi; sırayla ekranlara yerleşecek.';
  });
  const close=()=>sc.remove();
  sc.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a){if(e.target===sc)close();return;}
    if(a.dataset.a==='cancel'){close();return;}
    const z=STORE_SIZES.find(x=>x.id===q('#stSize').value)||STORE_SIZES[0];
    const lines=parse(q('#stLines').value);
    const n=z.single?1:o.n;
    close();generate({size:z,n,single:!!z.single,layout:z.single&&o.layout==='pano'?'classic':o.layout,theme:o.theme,font:o.font,shots:o.shots,
      lines:[...Array(n)].map((_,i)=>lines[i]||parse(SAMPLE[i%SAMPLE.length])[0])});
  });
  sc.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')close();});
  sync();q('#stSize').focus();
}
$('#storeSetBtn').addEventListener('click',openDialog);

/* ---------- the board's size: one list for the aspect ratios, the store sizes and a custom size. A store size makes the
   artboard exactly that big and switches the export to 24-bit PNG */
const RATIOS=['1:1','4:5','9:16','16:9','4:3','21:9'];
const sizeEl=$('#ratioSel');
{const g=document.createElement('optgroup');g.label='Oran';RATIOS.forEach(r=>g.appendChild(new Option(r,'r:'+r)));sizeEl.appendChild(g);}
['App Store','Google Play'].forEach(st=>{const g=document.createElement('optgroup');g.label=st;
  STORE_SIZES.filter(z=>z.store===st).forEach(z=>g.appendChild(new Option(z.n+' · '+z.w+' × '+z.h,'s:'+z.id)));sizeEl.appendChild(g);});
sizeEl.appendChild(new Option('Özel boyut…','custom'));
sizeEl.addEventListener('change',()=>{
  const v=sizeEl.value;
  if(v.startsWith('r:'))state.ratio=v.slice(2);
  else if(v==='custom')state.ratio='custom';
  else{const z=STORE_SIZES.find(x=>'s:'+x.id===v);if(z){Object.assign(state,{ratio:'custom',customW:z.w,customH:z.h,format:'png24'});toast(z.store+' '+z.n+': '+z.w+' × '+z.h+' px, saydamsız PNG');}}
  layout();syncAll();
});
onSyncUI(()=>{
  if(state.ratio!=='custom'){sizeEl.value='r:'+state.ratio;return;}
  const z=STORE_SIZES.find(x=>x.w===state.customW&&x.h===state.customH);sizeEl.value=z?'s:'+z.id:'custom';
});

export {generate as generateStoreSet,openDialog as openStoreDialog};
