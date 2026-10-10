import {selItem} from '../state/state.js';
import {removeItem,reorder,setFront} from './items.js';
import {renderItems} from './layout.js';
import {fDeg,fPct,makeSlider} from './sliders.js';
import {onSyncUI,syncAll} from './sync.js';
import {$,$$} from '../util.js';

/* Inspector for the selected 2D item (ui.kind 'item'): position, size, rotation, opacity, in front of / behind the
   devices, paint order. Position and width are fractions of the board (shown in %). */
const it=()=>selItem()||{};
const after=()=>{renderItems();syncAll();};
[
  {id:'i-x',k:'x',l:'Yatay',min:-.25,max:1.25,step:.001,reset:.5,f:fPct,after},
  {id:'i-y',k:'y',l:'Dikey',min:-.25,max:1.25,step:.001,reset:.5,f:fPct,after},
  {id:'i-w',k:'w',l:'Genişlik',min:.01,max:2,step:.001,reset:.34,f:fPct,after},
  {id:'i-rot',k:'rot',l:'Döndürme',min:-180,max:180,step:1,reset:0,f:fDeg,after}
].forEach(d=>makeSlider($('#itemSliders'),d,it));
makeSlider($('#itemLook'),{id:'i-op',k:'opacity',l:'Opaklık',min:0,max:1,step:.01,reset:1,f:fPct,after},it);

const nameEl=$('#itemName');
nameEl.addEventListener('change',()=>{const i=selItem();if(i){i.name=nameEl.value.trim().slice(0,60)||i.name;syncAll();}});
nameEl.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){if(e.key==='Escape')nameEl.value=it().name||'';nameEl.blur();}});
$('#itemDelete').addEventListener('click',()=>{const i=selItem();if(i)removeItem(i.id);});
$('#itemCenterX').addEventListener('click',()=>{const i=selItem();if(i){i.x=.5;after();}});
$('#itemCenterY').addEventListener('click',()=>{const i=selItem();if(i){i.y=.5;after();}});
$$('#itemSide button').forEach(b=>b.addEventListener('click',()=>{const i=selItem();if(i)setFront(i.id,b.dataset.front==='true');}));
const ORDER={top:Infinity,up:1,down:-1,bottom:-Infinity};
$$('[data-order]').forEach(b=>b.addEventListener('click',()=>{const i=selItem();if(i)reorder(i.id,ORDER[b.dataset.order]);}));

onSyncUI(()=>{
  const i=selItem();if(!i)return;
  if(document.activeElement!==nameEl)nameEl.value=i.name;
  $$('#itemSide button').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.front==='true')===!!i.front)));
});
