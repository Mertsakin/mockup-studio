import {icon} from './icons.js';
import {onUi,setUi,ui} from './ui-state.js';
import {t as tx} from '../lang.js';
import {$} from '../util.js';

/* The dock's selection tools share one button (Figma's move / scale): Seç, Taşı, Döndür. The button shows the tool in
   use (or the last one used) and picks it on a click; the small arrow beside it lists the three. Their keys stay
   V / W / E (shell.js); the button follows ui.tool. */
const TOOLS=[['select','cursor','Seç','V'],['move','move','Taşı (eksenler)','W'],['rotate','restart','Döndür (eksenler)','E']];
const main=$('#selMain'),chev=$('#selChev');
function show(k){
  const t=TOOLS.find(x=>x[0]===k);if(!t)return;
  main.dataset.tool=k;main.setAttribute('aria-label',tx(t[2]));
  main.querySelector('.ti').innerHTML=icon(t[1],18);
  main.querySelector('.tip').innerHTML=tx(t[2])+' <kbd>'+t[3]+'</kbd>'+(k==='select'?' · '+tx('cihazı ölçekle')+' <kbd>⌘T</kbd>':'');
}
onUi(()=>{if(TOOLS.some(t=>t[0]===ui.tool))show(ui.tool);});

const menu=document.createElement('div');menu.className='menu dock-menu';menu.setAttribute('role','menu');menu.hidden=true;document.body.appendChild(menu);
const close=()=>{menu.hidden=true;chev.setAttribute('aria-expanded','false');};
chev.addEventListener('click',e=>{
  e.stopPropagation();if(!menu.hidden){close();return;}
  menu.innerHTML='';
  TOOLS.forEach(([k,ic,n,kb])=>{const b=document.createElement('button');b.type='button';b.className='mi';b.setAttribute('role','menuitem');
    if(ui.tool===k)b.classList.add('on');
    b.innerHTML=icon(ic)+'<span></span><kbd>'+kb+'</kbd>';b.querySelector('span').textContent=tx(n);
    b.addEventListener('click',()=>{close();setUi({tool:k});});menu.appendChild(b);});
  menu.hidden=false;chev.setAttribute('aria-expanded','true');
  const r=main.getBoundingClientRect();menu.style.left=r.left+'px';menu.style.top=(r.top-menu.offsetHeight-8)+'px';
  menu.querySelector('.mi').focus({preventScroll:true});
});
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&e.target!==chev&&!chev.contains(e.target))close();});
menu.addEventListener('keydown',e=>{const items=[...menu.querySelectorAll('.mi')],i=items.indexOf(document.activeElement);
  if(e.key==='Escape'){close();chev.focus();}else if(e.key==='ArrowDown'){e.preventDefault();items[(i+1)%items.length].focus();}else if(e.key==='ArrowUp'){e.preventDefault();items[(i-1+items.length)%items.length].focus();}});
