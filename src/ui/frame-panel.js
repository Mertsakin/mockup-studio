import {DEF_LAYOUT,hModeOf,inFlow,lay,parentOf,wModeOf} from '../render/item-layout.js';
import {selItem,state} from '../state/state.js';
import {sizeOf} from './boards.js';
import {fixHeight,fixWidth,nodeOf,setCenter} from './frames.js';
import {renderItems} from './layout.js';
import {numField} from './numfield.js';
import {onSyncUI,syncAll} from './sync.js';
import {$,$$} from '../util.js';

/* The item inspector's Figma part: position (X, Y: top-left in the parent's space, board px), size (W, H with Sabit /
   Sar / Doldur / % modes; "100%", "fill", "hug" can be typed in W and H), rotation, opacity; for frames the auto
   layout (direction, 3 x 3 alignment, gap, padding, space between, stretch) and the look (fill, corner radius, clip).
   Lengths are shown in board px (the artboard's own size) and stored as fractions (render/item-layout.js). */
const BW=()=>sizeOf(state)[0];
const node=()=>{const i=selItem();return i&&nodeOf(i);};
const after=()=>{renderItems();syncAll();};
const fields=[];
const add=(parent,def)=>{const f=numField(def);parent.appendChild(f.el);fields.push(f);return f;};
const round=v=>Math.round(v*10)/10;
// the parent's inner size (what % and fill refer to)
function parentInner(i){
  const p=parentOf(state.items,i);if(!p){const [W,H]=sizeOf(state);return {w:W,h:H};}
  const n=nodeOf(p),L=lay(p),pad=(L.pad||[0,0,0,0]).map(v=>(v||0)*BW());
  return {w:Math.max(1,n.w-pad[1]-pad[3]),h:Math.max(1,n.h-pad[0]-pad[2])};
}
const isFrame=i=>i&&i.kind==='frame',isImage=i=>i&&!i.kind;

/* ---------- position and size */
const geo=$('#geoGrid');
const pos=axis=>({get:()=>{const n=node();return n?round(axis==='x'?n.x:n.y):null;},
  set:v=>{const i=selItem(),n=node();if(!i||!n||typeof v!=='number'||inFlow(state.items,i))return;
    // the new top-left -> the centre in the parent's space -> back to board px for setCenter
    const p=parentOf(state.items,i),pn=p&&nodeOf(p),[W,H]=sizeOf(state);
    const lx=axis==='x'?v+n.w/2:n.x+n.w/2,ly=axis==='y'?v+n.h/2:n.y+n.h/2;
    if(!pn){i.x=+(lx/W).toFixed(5);i.y=+(ly/H).toFixed(5);}else{i.x=+(lx/pn.w).toFixed(5);i.y=+(ly/pn.h).toFixed(5);}
    after();},
  disabled:()=>{const i=selItem();return !!i&&inFlow(state.items,i);}});
add(geo,Object.assign({id:'nf-x',label:'X',title:'X (px, üst sol köşe)'},pos('x')));
add(geo,Object.assign({id:'nf-y',label:'Y',title:'Y (px, üst sol köşe)'},pos('y')));

// W / H: a number is a fixed size; "50%" a share of the parent; "fill" / "doldur", "hug" / "sar" the modes
const KEY={fill:'fill',doldur:'fill',hug:'hug',sar:'hug',auto:'hug',otomatik:'hug'};
function setSize(axis,v){
  const i=selItem(),n=node();if(!i||!n)return;
  const pctKey=axis==='w'?'wPct':'hPct',modeKey=axis==='w'?'wMode':'hMode';
  if(typeof v==='number'){if(axis==='w')fixWidth(i,Math.max(1,v));else fixHeight(i,Math.max(1,v));after();return;}
  const t=String(v).trim().toLowerCase();
  if(t.endsWith('%')){const q=parseFloat(t.replace(',','.'));if(Number.isFinite(q)){i[modeKey]='pct';i[pctKey]=Math.max(0,q)/100;after();}return;}
  const m=KEY[t];if(m){setMode(axis,m);}
}
function setMode(axis,m){
  const i=selItem(),n=node();if(!i||!n)return;const inner=parentInner(i);
  if(m==='fixed'){if(axis==='w')fixWidth(i,n.w);else fixHeight(i,n.h);}
  else if(m==='pct'){i[axis==='w'?'wMode':'hMode']='pct';i[axis==='w'?'wPct':'hPct']=+((axis==='w'?n.w/inner.w:n.h/inner.h)).toFixed(4);}
  else{if(m==='hug'&&isImage(i))return;i[axis==='w'?'wMode':'hMode']=m;if(m==='hug'&&i.kind==='text'&&axis==='w')i.wrap=0;}
  after();
}
const MODES={fixed:'Sabit',hug:'Sar',fill:'Doldur',pct:'%'};
function sizeField(axis){
  const wrap=document.createElement('div');wrap.className='nfsize';geo.appendChild(wrap);
  const f=add(wrap,{id:'nf-'+axis,label:axis.toUpperCase(),title:(axis==='w'?'Genişlik':'Yükseklik')+' (px, % ya da fill / hug)',
    get:()=>{const n=node();return n?round(axis==='w'?n.w:n.h):null;},set:v=>setSize(axis,v),
    // text and images get their height from their content
    disabled:()=>{const i=selItem();return axis==='h'&&!!i&&!isFrame(i);}});
  const sel=document.createElement('select');sel.className='nfmode';sel.setAttribute('aria-label',(axis==='w'?'Genişlik':'Yükseklik')+' modu');
  Object.entries(MODES).forEach(([k,n])=>sel.appendChild(new Option(n,k)));wrap.appendChild(sel);
  sel.addEventListener('change',()=>setMode(axis,sel.value));
  return {f,sel};
}
const W_=sizeField('w'),H_=sizeField('h');
add(geo,{id:'nf-r',label:'R',title:'Döndürme (°)',suffix:'°',get:()=>{const i=selItem();return i?round(i.rot||0):null;},
  set:v=>{const i=selItem();if(i&&typeof v==='number'){i.rot=+(((v+180)%360+360)%360-180).toFixed(1);after();}}});
add(geo,{id:'nf-op',label:'Opaklık',title:'Opaklık (%)',suffix:'%',min:0,max:100,
  get:()=>{const i=selItem();return i?Math.round((i.opacity??1)*100):null;},set:v=>{const i=selItem();if(i&&typeof v==='number'){i.opacity=v/100;after();}}});
$$('#itemAbs button').forEach(b=>b.addEventListener('click',()=>{
  const i=selItem();if(!i)return;const n=nodeOf(i);
  if(b.dataset.v==='abs'){i.abs=true;if(n)setCenter(i,n.cx,n.cy);}else delete i.abs;
  after();}));

/* ---------- auto layout */
// _main / _cross: the grid's choice, kept while "Eşit aralık" / "Esnet" override it (unticking goes back to it)
const L=()=>{const i=selItem();return i&&isFrame(i)?Object.assign({},DEF_LAYOUT,i.layout||{}):null;};
const setL=o=>{const i=selItem();if(!isFrame(i))return;i.layout=Object.assign({},DEF_LAYOUT,i.layout||{},o);after();};
$$('#alDir button').forEach(b=>b.addEventListener('click',()=>{
  const i=selItem();if(!isFrame(i))return;const v=b.dataset.v;
  // turning auto layout on: the frame hugs its content like a fresh Figma auto layout
  if(v!=='none'&&lay(i).dir==='none'){i.wMode='hug';i.hMode='hug';}
  if(v==='none'){const n=nodeOf(i);if(n){fixWidth(i,n.w);fixHeight(i,n.h);}}
  setL({dir:v});}));
// 3 x 3 alignment: columns are horizontal, rows vertical, whatever the direction (like Figma)
const grid=$('#alGrid'),POS=['start','center','end'];
for(let r=0;r<3;r++)for(let c=0;c<3;c++){const b=document.createElement('button');b.type='button';b.dataset.r=r;b.dataset.c=c;
  b.setAttribute('aria-label',['Üst','Orta','Alt'][r]+' '+['sol','orta','sağ'][c]);b.innerHTML='<i></i>';grid.appendChild(b);
  b.addEventListener('click',()=>{const l=L();if(!l)return;const row=l.dir==='row',main=POS[row?c:r],cross=POS[row?r:c];
    setL({justify:l.justify==='between'?'between':main,align:l.align==='stretch'?'stretch':cross,_main:main,_cross:cross});});}
const lenField=(parent,id,label,title,get,set)=>add(parent,{id,label,title,min:0,get:()=>{const l=L();return l?round(get(l)*BW()):null;},
  set:v=>{if(typeof v==='number'){const l=L();if(l)set(l,Math.max(0,v)/BW());}}});
lenField($('#alGap'),'nf-gap','Aralık','Öğeler arası boşluk (px)',l=>l.gap||0,(l,v)=>setL({gap:+v.toFixed(5)})).el.classList.add('wide');
$('#alBetween').addEventListener('change',e=>{const l=L();if(!l)return;setL({justify:e.target.checked?'between':(l._main||'start')});});
$('#alStretch').addEventListener('change',e=>{const l=L();if(!l)return;setL({align:e.target.checked?'stretch':(l._cross||'start')});});
// padding: horizontal and vertical, or each side
const padBox=$('#alPad'),pad=(l,k)=>(l.pad||[0,0,0,0])[k]||0;
const setPad=(ks,v)=>{const l=L();if(!l)return;const p=(l.pad||[0,0,0,0]).slice();ks.forEach(k=>{p[k]=+v.toFixed(5);});setL({pad:p});};
const PADS=[
  {id:'nf-ph',label:'Yatay',title:'Yatay iç boşluk (px)',ks:[1,3],both:true},{id:'nf-pv',label:'Dikey',title:'Dikey iç boşluk (px)',ks:[0,2],both:true},
  {id:'nf-pt',label:'Üst',title:'Üst iç boşluk (px)',ks:[0]},{id:'nf-pr',label:'Sağ',title:'Sağ iç boşluk (px)',ks:[1]},
  {id:'nf-pb',label:'Alt',title:'Alt iç boşluk (px)',ks:[2]},{id:'nf-pl',label:'Sol',title:'Sol iç boşluk (px)',ks:[3]}];
const padFields=PADS.map(d=>({d,f:lenField(padBox,d.id,d.label,d.title,l=>pad(l,d.ks[0]),(l,v)=>setPad(d.ks,v))}));
let padEach=false;
$('#alPadEach').addEventListener('change',e=>{padEach=e.target.checked;syncAll();});

/* ---------- frame look */
$('#frFillOn').addEventListener('change',e=>{const i=selItem();if(isFrame(i)){i.fillOn=e.target.checked;if(!i.fill)i.fill='#ffffff';after();}});
$('#frFill').addEventListener('input',e=>{const i=selItem();if(isFrame(i)){i.fill=e.target.value;i.fillOn=true;renderItems();}});
add($('#frGrid'),{id:'nf-rad',label:'Köşe',title:'Köşe yarıçapı (px)',min:0,get:()=>{const i=selItem();return isFrame(i)?round((i.radius||0)*BW()):null;},
  set:v=>{const i=selItem();if(isFrame(i)&&typeof v==='number'){i.radius=+(Math.max(0,v)/BW()).toFixed(5);after();}}}).el.classList.add('wide');
$('#frClip').addEventListener('change',e=>{const i=selItem();if(isFrame(i)){i.clip=e.target.checked;after();}});

/* ---------- sync */
onSyncUI(()=>{
  const i=selItem();if(!i)return;
  const fr=isFrame(i),flow=inFlow(state.items,i),p=parentOf(state.items,i),l=fr?lay(i):null;
  fields.forEach(f=>f.sync());
  W_.sel.value=wModeOf(i);H_.sel.value=fr?hModeOf(i):'hug';H_.sel.disabled=!fr;
  [...W_.sel.options].forEach(o=>{o.disabled=o.value==='hug'&&isImage(i);});
  $('#flowNote').hidden=!flow;$('#absRow').hidden=!(p&&lay(p).dir!=='none');$('#centerRow').hidden=flow;
  $$('#itemAbs button').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.v==='abs')===!!i.abs)));
  $('#alSec').hidden=!fr;$('#frameSec').hidden=!fr;
  if(fr){
    $$('#alDir button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===l.dir)));
    $('#alBody').hidden=l.dir==='none';
    const row=l.dir==='row',mi=POS.indexOf(l.justify==='between'?(l._main||'start'):l.justify),ci=POS.indexOf(l.align==='stretch'?(l._cross||'start'):l.align);
    grid.querySelectorAll('button').forEach(b=>{const r=+b.dataset.r,c=+b.dataset.c,on=(row?c:r)===mi&&(row?r:c)===ci;b.setAttribute('aria-pressed',String(on));});
    grid.dataset.dir=l.dir;
    $('#alBetween').checked=l.justify==='between';$('#alStretch').checked=l.align==='stretch';
    padFields.forEach(({d,f})=>{f.el.hidden=padEach?!!d.both:!d.both;});$('#alPadEach').checked=padEach;
    $('#frFillOn').checked=i.fillOn!==false&&!!i.fill;$('#frFill').value=i.fill||'#ffffff';$('#frClip').checked=!!i.clip;
  }
});
