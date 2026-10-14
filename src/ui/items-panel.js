import {CHARSETS,FX,FX_EASES,LOOPS,ORDERS,SPLITS,STAGGER,newFx} from '../render/text-fx.js';
import {FONTS,WEIGHT_NAMES,addFontFace,customFonts,fitWeight,keepAnchor,moveAnchor,textBox,weightsOf} from '../render/text.js';
import {selItem,state} from '../state/state.js';
import {A,play,seek,setDuration,setMode} from './animate.js';
import {doc,sizeOf} from './boards.js';
import {icon} from './icons.js';
import {removeItem,reorder,setFront} from './items.js';
import {renderItems} from './layout.js';
import {fDeg,fPct,fX,makeSlider} from './sliders.js';
import {onSyncUI,syncAll} from './sync.js';
import {toast} from './toast.js';
import {$,$$} from '../util.js';

/* Inspector for the selected 2D item (ui.kind 'item'): position, size, rotation, opacity, in front of / behind the
   devices, paint order. Position and width are fractions of the board (shown in %). Text items (kind 'text') get the
   "Metin" section instead of the width: content, font, weight, size, alignment, fill, spacing, box width, shadow. */
const it=()=>selItem()||{};
const after=()=>{renderItems();syncAll();};
[
  {id:'i-x',k:'x',l:'Yatay',min:-.25,max:1.25,step:.001,reset:.5,f:fPct,after},
  {id:'i-y',k:'y',l:'Dikey',min:-.25,max:1.25,step:.001,reset:.5,f:fPct,after},
  {id:'i-w',k:'w',l:'Genişlik',min:.01,max:2,step:.001,reset:.34,f:fPct,after},
  {id:'i-rot',k:'rot',l:'Döndürme',min:-180,max:180,step:1,reset:0,f:fDeg,after}
].forEach(d=>makeSlider($('#itemSliders'),d,it));
makeSlider($('#itemLook'),{id:'i-op',k:'opacity',l:'Opaklık',min:0,max:1,step:.01,reset:1,f:fPct,after},it);

/* ---------- text */
const boardW=()=>sizeOf(state)[0];
// sliders write the value before `after` runs: the box from the previous step keeps the anchor (render/text.js)
let prevBox=null;
const textAfter=()=>{const t=selItem();if(t&&prevBox){const [W,H]=sizeOf(state);moveAnchor(t,W,H,prevBox);}after();};
const edit=fn=>{const t=selItem();if(!t||t.kind!=='text')return;const [W,H]=sizeOf(state);keepAnchor(t,W,H,()=>fn(t));after();};
makeSlider($('#textSizeSlot'),{id:'t-size',k:'size',l:'Boyut',min:.005,max:.3,step:.001,reset:.06,log:true,f:v=>Math.round(v*boardW())+' px',after:textAfter},it);
[
  {id:'t-lh',k:'lh',l:'Satır aralığı',min:.7,max:2.5,step:.01,reset:1.15,f:fX,after:textAfter},
  {id:'t-ls',k:'ls',l:'Harf aralığı',min:-.1,max:.5,step:.005,reset:0,f:fPct,after:textAfter},
  {id:'t-wrap',k:'wrap',l:'Kutu genişliği',min:0,max:30,step:.1,reset:0,note:'0: satırlar yalnızca Enter ile kırılır. Daha büyük değerde metin bu genişlikte kendiliğinden alt satıra geçer.',
    f:v=>v?Math.round(v*(it().size||0)*boardW())+' px':'Otomatik',after:textAfter},
  {id:'t-shadow',k:'shadow',l:'Gölge',min:0,max:1,step:.01,reset:0,f:fPct,after:textAfter}
].forEach(d=>makeSlider($('#textSliders'),d,it));

const body=$('#textBody'),fontEl=$('#textFont'),weightEl=$('#textWeight');
body.addEventListener('input',()=>edit(t=>{t.text=body.value;}));
body.addEventListener('blur',()=>{const t=selItem();if(t&&t.kind==='text'&&!t.text.trim())removeItem(t.id);});
const KIND={sans:'Sans serif',serif:'Serif',monospace:'Eş aralıklı',cursive:'El yazısı'};
Object.entries(KIND).forEach(([k,label])=>{const g=document.createElement('optgroup');g.label=label;
  FONTS.filter(f=>f.kind===k).forEach(f=>g.appendChild(new Option(f.name,f.name)));fontEl.appendChild(g);});
// uploaded fonts (TTF / OTF / WOFF / WOFF2) belong to the document (doc.fonts, saved with it); the menu lists them last
const upGroup=document.createElement('optgroup');upGroup.label='Yüklenen';fontEl.appendChild(upGroup);
const UPLOAD='__upload';let shownCustom='';
function fillCustom(){
  const names=customFonts(),key=names.join('\u0001');if(key===shownCustom)return;shownCustom=key;
  upGroup.innerHTML='';names.forEach(n=>upGroup.appendChild(new Option(n,n)));upGroup.appendChild(new Option('Yazı tipi yükle…',UPLOAD));
}
fillCustom();
const fontFile=document.createElement('input');fontFile.type='file';fontFile.accept='.ttf,.otf,.woff,.woff2,font/*';fontFile.hidden=true;document.body.appendChild(fontFile);
fontFile.addEventListener('change',()=>{
  const f=fontFile.files[0];fontFile.value='';if(!f)return;
  if(f.size>8e6){toast('Yazı tipi dosyası çok büyük (en çok 8 MB).');return;}
  // family name from the file name ("Brand-Bold.woff2" -> "Brand Bold"); a Google font's name gets a suffix
  let family=f.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').replace(/["\\]/g,'').trim().slice(0,40)||'Yazı tipi';
  if(FONTS.some(x=>x.name===family))family+=' (yüklenen)';
  const rd=new FileReader();
  rd.onload=()=>{const data=String(rd.result),old=doc.fonts.find(x=>x.family===family);
    if(old)old.data=data;else doc.fonts.push({family,data});
    addFontFace(family,data);fillCustom();edit(t=>{t.font=family;t.weight=fitWeight(family,t.weight);});};
  rd.onerror=()=>toast('Yazı tipi okunamadı.');rd.readAsDataURL(f);
});
fontEl.addEventListener('change',()=>{
  if(fontEl.value===UPLOAD){fontEl.value=it().font;fontFile.click();return;}
  edit(t=>{t.font=fontEl.value;t.weight=fitWeight(t.font,t.weight);});
});
weightEl.addEventListener('change',()=>edit(t=>{t.weight=+weightEl.value;}));
$('#textItalic').addEventListener('click',()=>edit(t=>{t.italic=!t.italic;}));
$$('#textAlign button').forEach(b=>b.addEventListener('click',()=>{const t=selItem();if(t){t.align=b.dataset.v;after();}}));
$$('#textFill button').forEach(b=>b.addEventListener('click',()=>{const t=selItem();if(t){t.fill=b.dataset.v;after();}}));
[['textColor','color'],['textColor2','color2']].forEach(([id,k])=>$('#'+id).addEventListener('input',e=>{const t=selItem();if(t){t[k]=e.target.value;renderItems();}}));

/* ---------- text effects (render/text-fx.js): entrance, exit, loop; each with its own options under its menu */
const fxOf=ph=>{const t=selItem();return t&&t.fx&&t.fx[ph]||{};};
const fxAfter=()=>{renderItems();syncAll();};
const opt=(el,v,label)=>el.appendChild(new Option(label,v));
const FX_SEL={in:$('#fxIn'),out:$('#fxOut'),loop:$('#fxLoop')};
opt(FX_SEL.in,'','Yok');opt(FX_SEL.out,'','Yok');opt(FX_SEL.loop,'','Yok');
Object.entries(FX).forEach(([k,d])=>{opt(FX_SEL.in,k,d.n);if(!d.inOnly)opt(FX_SEL.out,k,d.n);});
Object.entries(LOOPS).forEach(([k,n])=>opt(FX_SEL.loop,k,n));
// option rows per phase, built once; which rows show depends on the effect type
function seg(parent,label,ph,key,choices){
  // full width (the choices are words): the label is the group's accessible name
  const row=document.createElement('div');row.className='seg seg-wide fxseg';row.setAttribute('role','group');row.setAttribute('aria-label',label);row.dataset.key=key;
  const g=row;
  Object.entries(choices).forEach(([v,n])=>{const b=document.createElement('button');b.type='button';b.dataset.v=v;b.textContent=n;
    // another split gets that split's usual overlap
    b.addEventListener('click',()=>{const f=fxOf(ph);if(f.type){f[key]=v;if(key==='split')f.stagger=STAGGER[v];fxAfter();}});g.appendChild(b);});
  parent.appendChild(row);return row;
}
function pick(parent,label,ph,key,choices){
  const row=document.createElement('div');row.className='row';row.dataset.key=key;const id='fx-'+ph+'-'+key;
  row.innerHTML='<label class="lbl" for="'+id+'"></label><select id="'+id+'"></select>';row.firstChild.textContent=label;
  const el=row.lastChild;Object.entries(choices).forEach(([v,n])=>opt(el,v,n));
  el.addEventListener('change',()=>{const f=fxOf(ph);if(f.type){f[key]=el.value;fxAfter();}});parent.appendChild(row);return row;
}
const fmtS=v=>v.toFixed(2).replace('.',',')+' sn';
const FX_ROWS={};
['in','out'].forEach(ph=>{
  const box=$(ph==='in'?'#fxInOpts':'#fxOutOpts'),get=()=>fxOf(ph),after=()=>{setDuration(state.anim.dur);fxAfter();};
  makeSlider(box,{id:'fx-'+ph+'-t',k:'t',l:'Başlangıç',min:0,max:30,step:.05,reset:0,f:fmtS,after},get);
  makeSlider(box,{id:'fx-'+ph+'-dur',k:'dur',l:'Süre',min:.2,max:6,step:.05,reset:1.2,f:fmtS,after},get);
  FX_ROWS[ph]={box,
    split:seg(box,'Bölme',ph,'split',SPLITS),
    stagger:(makeSlider(box,{id:'fx-'+ph+'-st',k:'stagger',l:'Kademe',min:0,max:1,step:.01,reset:.5,f:fPct,after:fxAfter,
      note:'0: hepsi birlikte, %100: biri bitince diğeri başlar.'},get),box.lastChild),
    order:pick(box,'Sıra',ph,'order',ORDERS),
    ease:pick(box,'Yumuşatma',ph,'ease',FX_EASES),
    chars:pick(box,'Karakterler',ph,'chars',CHARSETS),
    cursor:(()=>{const row=document.createElement('div');row.className='row';row.dataset.key='cursor';
      row.innerHTML='<span class="lbl">İmleç</span><label class="switch"><input type="checkbox" aria-label="Daktilo imleci"><span></span></label>';
      row.querySelector('input').addEventListener('change',e=>{const f=fxOf(ph);if(f.type){f.cursor=e.target.checked;fxAfter();}});box.appendChild(row);return row;})()};
});
{
  const box=$('#fxLoopOpts'),get=()=>fxOf('loop');
  makeSlider(box,{id:'fx-loop-amp',k:'amp',l:'Şiddet',min:0,max:1,step:.01,reset:.5,f:fPct,after:fxAfter},get);
  makeSlider(box,{id:'fx-loop-speed',k:'speed',l:'Hız',min:.1,max:4,step:.05,reset:1,f:v=>v.toFixed(2).replace('.',',')+' /sn',after:fxAfter},get);
}
// which options an effect type uses
const USES={typewriter:['cursor'],scramble:['order','chars'],counter:['ease']};
const usesOf=type=>USES[type]||['split','stagger','order','ease'];
function setFx(ph,type){
  const t=selItem();if(!t||t.kind!=='text')return;t.fx=t.fx||{};
  if(!type){delete t.fx[ph];if(!t.fx.in&&!t.fx.out&&!t.fx.loop)delete t.fx;fxAfter();return;}
  if(ph==='loop'){t.fx.loop={type,amp:(t.fx.loop&&t.fx.loop.amp)??.5,speed:(t.fx.loop&&t.fx.loop.speed)||1};fxAfter();return;}
  const old=t.fx[ph],f=newFx(type,Array.from(t.text.replace(/\s/g,'')).length);
  // an exit ends just before the end of the timeline; a changed type keeps its start
  if(old)f.t=old.t;else if(ph==='out')f.t=Math.max(0,+(state.anim.dur-f.dur-.2).toFixed(2));
  t.fx[ph]=f;setDuration(Math.max(state.anim.dur,f.t+f.dur));fxAfter();
}
Object.entries(FX_SEL).forEach(([ph,el])=>el.addEventListener('change',()=>setFx(ph,el.value)));
$('#fxPlay').addEventListener('click',()=>{
  const t=selItem(),f=t&&t.fx&&(t.fx.in||t.fx.out);setMode('animate');
  seek(f?Math.max(0,f.t-.2):0);if(!A.playing)play();
});
function syncFx(i){
  const fx=i.fx||{};
  Object.entries(FX_SEL).forEach(([ph,el])=>{el.value=fx[ph]?fx[ph].type:'';});
  ['in','out'].forEach(ph=>{const f=fx[ph],R=FX_ROWS[ph];R.box.hidden=!f;if(!f)return;
    const use=usesOf(f.type);['split','stagger','order','ease','chars','cursor'].forEach(k=>{R[k].hidden=!use.includes(k);});
    R.split.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===f.split)));
    ['order','ease','chars'].forEach(k=>{R[k].querySelector('select').value=f[k];});
    R.cursor.querySelector('input').checked=f.cursor!==false;});
  $('#fxLoopOpts').hidden=!fx.loop;
}

/* ---------- common */
const nameEl=$('#itemName');
nameEl.addEventListener('change',()=>{const i=selItem();if(i){i.name=nameEl.value.trim().slice(0,60)||i.name;syncAll();}});
nameEl.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){if(e.key==='Escape')nameEl.value=it().name||'';nameEl.blur();}});
$('#itemDelete').addEventListener('click',()=>{const i=selItem();if(i)removeItem(i.id);});
$('#itemCenterX').addEventListener('click',()=>{const i=selItem();if(i){i.x=.5;after();}});
$('#itemCenterY').addEventListener('click',()=>{const i=selItem();if(i){i.y=.5;after();}});
$$('#itemSide button').forEach(b=>b.addEventListener('click',()=>{const i=selItem();if(i)setFront(i.id,b.dataset.front==='true');}));
const ORDER={top:Infinity,up:1,down:-1,bottom:-Infinity};
$$('[data-order]').forEach(b=>b.addEventListener('click',()=>{const i=selItem();if(i)reorder(i.id,ORDER[b.dataset.order]);}));

const press=(sel,v)=>$$(sel+' button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));
let shownIcon='';
onSyncUI(()=>{
  const i=selItem();if(!i)return;const text=i.kind==='text';
  if(document.activeElement!==nameEl)nameEl.value=i.name;
  $$('#itemSide button').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.front==='true')===!!i.front)));
  const ic=text?'text-square':'gallery';if(ic!==shownIcon){$('#itemIcon').innerHTML=icon(ic);shownIcon=ic;}
  $('#textSec').hidden=!text;$('#fxSec').hidden=!text;$('#s-i-w').closest('.slider').hidden=text;
  if(!text){prevBox=null;return;}
  syncFx(i);
  prevBox=textBox(i,boardW());
  if(document.activeElement!==body&&body.value!==i.text)body.value=i.text;
  fillCustom();fontEl.value=i.font;
  const ws=weightsOf(i.font);
  if(weightEl.dataset.font!==i.font){weightEl.dataset.font=i.font;weightEl.innerHTML='';ws.forEach(w=>weightEl.appendChild(new Option(WEIGHT_NAMES[w]||String(w),String(w))));}
  weightEl.value=String(i.weight);
  $('#textItalic').setAttribute('aria-pressed',String(!!i.italic));
  press('#textAlign',i.align);press('#textFill',i.fill);
  $('#textColor').value=i.color;$('#textColor2').value=i.color2||i.color;$('#textColor2').hidden=i.fill!=='gradient';
});
