import {canvas} from '../render/renderer.js';
import {state} from '../state/state.js';
import {ensureBoard} from './boards.js';
import {icon} from './icons.js';
import {addFrame,addText,editText,itemAt,reorder} from './items.js';
import {layer} from './layers.js';
import {focusSelected} from './navigator.js';
import {pick} from './pointer.js';
import {copyToClipboard,deleteSelection,duplicateSelection,frameSelection,hasClip,inSel,isMulti,paste,select,selectAll,selection,unframeSelection} from './selection.js';
import {fitActive} from './workspace.js';

/* Right-click menu on the live artboard. What is under the pointer becomes the selection (unless it is already part
   of it), then the menu offers what applies: clipboard, duplicate, delete, layer order (devices: in depth, layers.js;
   2D items: paint order), focus, editing a text; on empty space: paste, select all, add text, fit. Keyboard: arrows,
   Enter, Esc. The shortcuts shown are the ones that work without the menu. */
const menu=document.createElement('div');menu.className='menu ctx';menu.setAttribute('role','menu');menu.hidden=true;document.body.appendChild(menu);
const MAC=/Mac|iPhone|iPad/.test(navigator.platform||''),C=MAC?'⌘':'Ctrl+',S=MAC?'⇧':'Shift+';
function close(){if(menu.hidden)return;menu.hidden=true;menu.innerHTML='';}
// items: [icon, label, fn, shortcut, disabled] or null (separator)
function open(x,y,items){
  menu.innerHTML='';
  items.forEach(it=>{
    if(!it){if(menu.lastChild&&!menu.lastChild.classList.contains('msep')){const s=document.createElement('div');s.className='msep';menu.appendChild(s);}return;}
    const b=document.createElement('button');b.type='button';b.className='mi';b.setAttribute('role','menuitem');b.disabled=!!it[4];
    b.innerHTML=icon(it[0])+'<span></span>'+(it[3]?'<kbd></kbd>':'');b.querySelector('span').textContent=it[1];if(it[3])b.querySelector('kbd').textContent=it[3];
    b.addEventListener('click',()=>{close();it[2]();});menu.appendChild(b);
  });
  if(menu.lastChild&&menu.lastChild.classList.contains('msep'))menu.lastChild.remove();
  menu.hidden=false;menu.style.left='0px';menu.style.top='0px';
  const w=menu.offsetWidth,h=menu.offsetHeight;
  menu.style.left=Math.max(8,Math.min(x,innerWidth-w-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-h-8))+'px';
  const f=menu.querySelector('.mi:not(:disabled)');if(f)f.focus({preventScroll:true});
}
const ORDER={front:Infinity,forward:1,backward:-1,back:-Infinity};
function itemsFor(){
  const list=selection(),one=list.length===1?list[0]:null,clip=['clipboard','Yapıştır',paste,C+'V',!hasClip()];
  if(!list.length)return [clip,['layers-minimalistic','Tümünü seç',selectAll,C+'A',!state.devices.length&&!state.items.length],null,
    ['text-square','Metin ekle',()=>{ensureBoard();const it=addText();requestAnimationFrame(()=>editText(it,true));}],['hashtag','Çerçeve ekle',()=>{ensureBoard();addFrame();}],['maximize-square','Artboarda yakınlaş',fitActive,S+'2']];
  const out=[['copy','Kopyala',copyToClipboard,C+'C'],clip,['copy','Çoğalt',duplicateSelection,C+'D'],['trash-bin-minimalistic','Sil',deleteSelection,'⌫'],null];
  // 2D items: frames (Figma's shortcuts)
  const items=list.filter(o=>!o.type);
  if(items.length)out.push(['hashtag','Çerçeveye al',()=>frameSelection(false),'⌥'+C+'G'],['layout-list','Auto layout ekle',()=>frameSelection(true),S+'A'],
    ['layers-minimalistic','Çerçeveden çıkar',unframeSelection,S+C+'G',!items.some(o=>o.kind==='frame')],null);
  if(one&&one.type)out.push(
    ['double-alt-arrow-up','En öne',()=>layer('front'),S+C+']',state.devices.length<2],['alt-arrow-up','Öne',()=>layer('forward'),C+']',state.devices.length<2],
    ['alt-arrow-down','Arkaya',()=>layer('backward'),C+'[',state.devices.length<2],['double-alt-arrow-down','En arkaya',()=>layer('back'),S+C+'[',state.devices.length<2],
    null,['target','Odakla',focusSelected,S+'F']);
  else if(one){
    out.push(['double-alt-arrow-up','En öne',()=>reorder(one.id,ORDER.front),S+C+']'],['alt-arrow-up','Öne',()=>reorder(one.id,ORDER.forward),C+']'],
      ['alt-arrow-down','Arkaya',()=>reorder(one.id,ORDER.backward),C+'['],['double-alt-arrow-down','En arkaya',()=>reorder(one.id,ORDER.back),S+C+'[']);
    if(one.kind==='text')out.push(null,['pen-2','Metni düzenle',()=>editText(one,true),'↵']);
  }
  return out;
}
canvas.addEventListener('contextmenu',e=>{
  e.preventDefault();
  const dev=!itemAt(e.clientX,e.clientY,true)&&pick(e.clientX,e.clientY);
  const hit=itemAt(e.clientX,e.clientY,true)||(dev&&state.devices.find(d=>d.id===dev))||itemAt(e.clientX,e.clientY,false)||null;
  if(hit&&!inSel(hit))select([hit]);else if(!hit&&!isMulti())select([]);
  open(e.clientX,e.clientY,itemsFor());
});
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target))close();},true);
addEventListener('blur',close);addEventListener('resize',close);
menu.addEventListener('keydown',e=>{
  const items=[...menu.querySelectorAll('.mi:not(:disabled)')],i=items.indexOf(document.activeElement);
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();canvas.focus&&canvas.focus();}
  else if(e.key==='ArrowDown'&&items.length){e.preventDefault();items[(i+1)%items.length].focus();}
  else if(e.key==='ArrowUp'&&items.length){e.preventDefault();items[(i-1+items.length)%items.length].focus();}
  else if(e.key==='Tab'){e.preventDefault();close();}
});
