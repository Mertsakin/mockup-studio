import {modOf} from '../lights/mods.js';
import {FX} from '../render/text-fx.js';
import {COLORS,TYPES} from '../state/constants.js';
import {sel,selItem,state} from '../state/state.js';
import {doc,onBoards,sizeOf} from './boards.js';
import {icon} from './icons.js';
import {onSyncUI} from './sync.js';
import {$$} from '../util.js';

/* Inspector sections that fold (section.sec[data-sec]): the header toggles the body; a folded section is one line, its
   title and what is set there (SUMMARY). The choice is remembered per section (this browser); the rarely used ones
   start folded (FOLDED). Header actions (.sh-acts) keep working without toggling. A header button with
   data-chips="<id>" opens the buttons of that (hidden) chip group as a menu (camera angles, light set-ups). */
const KEY='mockup-studio-sections';
const FOLDED=new Set(['board-env','board-light','dev-layer','item-fx','item-layer','left-angles']);
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){/* private mode */}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved));}catch(e){/* ignore */}};
const deg=v=>Math.round(v)+'°';
const BG={transparent:'Yok',solid:'Düz renk',gradient:'Geçiş',image:'Görsel'};
const SUMMARY={
  'board-size':()=>{const [w,h]=sizeOf(state);return (state.ratio==='custom'?'Özel':state.ratio)+' · '+w+' × '+h;},
  'board-camera':()=>{const S=state.scene;return deg(S.ry)+' · '+deg(S.rx)+' · '+S.zoom.toFixed(2)+'×';},
  'board-bg':()=>BG[state.bg]||'',
  'board-env':()=>(state.env==='space'?'Uzay':'Stüdyo')+(state.env!=='space'&&state.floor?' · gölge %'+Math.round(state.shadowOpacity*100):''),
  'board-light':()=>{const n=state.lights.length;return n?modOf(state.lights[0].mod).n+(n>1?' + '+(n-1):''):'Işık yok';},
  'dev-screen':()=>{const d=sel();return d&&d.img?d.imgName||'Görsel':'Görsel yok';},
  'dev-model':()=>{const d=sel();if(!d)return '';const c=COLORS.find(x=>x.k===d.colorKey);return (TYPES[d.type]||'')+(c?' · '+c.n:'');},
  'dev-transform':()=>{const d=sel();return d?d.scale.toFixed(2)+'×':'';},
  'dev-layer':()=>state.devices.length>1?state.devices.length+' cihaz':'',
  'item-text':()=>{const i=selItem();return i&&i.kind==='text'?i.font+' · '+Math.round((i.size||0)*sizeOf(state)[0]):'';},
  'item-fx':()=>{const i=selItem(),f=i&&i.fx;if(!f)return 'Yok';return [f.in&&FX[f.in.type]&&FX[f.in.type].n,f.out&&'çıkış',f.loop&&'sürekli'].filter(Boolean).join(' · ')||'Yok';},
  'item-layer':()=>{const i=selItem();return i?(i.front?'Cihazların önünde':'Cihazların arkasında'):'';},
  // left panel
  'left-boards':()=>{const n=doc.boards.length;return n?n+' artboard':'';},
  'left-angles':()=>{const n=document.getElementById('savedList').children.length;return n?n+' açı':'Yok';},
  'left-assets':()=>{const n=doc.assets.length;return n?n+' varlık':'Yok';},
  'tpl-comps':()=>document.getElementById('comps').children.length+' kompozisyon',
  'tpl-grid':()=>document.getElementById('tplGrid').children.length+' şablon',
  'item-al':()=>{const i=selItem(),l=i&&i.layout;return !l||l.dir==='none'?'Yok':l.dir==='row'?'Yatay':'Dikey';}
};
const secs=[...document.querySelectorAll('section.sec[data-sec]')];
function setOpen(sec,open){
  sec.classList.toggle('folded',!open);const h=sec.querySelector(':scope>.sh');if(h)h.setAttribute('aria-expanded',String(open));
  if(!open)fillSummary(sec);
}
function fillSummary(sec){const s=sec.querySelector(':scope>.sh>.sum'),fn=SUMMARY[sec.dataset.sec];if(s)s.textContent=fn?fn():'';}
secs.forEach(sec=>{
  const id=sec.dataset.sec,h=sec.querySelector(':scope>.sh');if(!h)return;
  h.classList.add('fold');h.tabIndex=0;h.setAttribute('role','button');
  const chev=document.createElement('span');chev.className='chev';chev.innerHTML=icon('alt-arrow-down',12);h.prepend(chev);
  const sum=document.createElement('span');sum.className='sum';const acts=h.querySelector('.sh-acts');h.insertBefore(sum,acts||null);
  const toggle=()=>{const open=sec.classList.contains('folded');setOpen(sec,open);saved[id]=open;save();};
  h.addEventListener('click',e=>{if(e.target.closest('.sh-acts,button,input,select,a'))return;toggle();});
  h.addEventListener('keydown',e=>{if(e.target!==h)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
  setOpen(sec,saved[id]??!FOLDED.has(id));
});
onSyncUI(()=>secs.forEach(sec=>{if(sec.classList.contains('folded'))fillSummary(sec);}));
onBoards(()=>secs.forEach(sec=>{if(sec.classList.contains('folded'))fillSummary(sec);}));

/* ---------- chip groups as header menus */
const menu=document.createElement('div');menu.className='menu';menu.setAttribute('role','menu');menu.hidden=true;menu.style.position='fixed';document.body.appendChild(menu);
const close=()=>{menu.hidden=true;};
$$('[data-chips]').forEach(btn=>btn.addEventListener('click',e=>{
  e.stopPropagation();if(!menu.hidden&&menu.dataset.for===btn.dataset.chips){close();return;}
  const chips=document.getElementById(btn.dataset.chips);if(!chips)return;menu.innerHTML='';menu.dataset.for=btn.dataset.chips;
  chips.querySelectorAll('button').forEach(c=>{const b=document.createElement('button');b.type='button';b.className='mi';b.setAttribute('role','menuitem');
    b.textContent=c.textContent;if(c.getAttribute('aria-pressed')==='true')b.classList.add('on');b.addEventListener('click',()=>{close();c.click();});menu.appendChild(b);});
  menu.hidden=false;const r=btn.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(r.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=(r.bottom+4)+'px';
  const f=menu.querySelector('.mi');if(f)f.focus({preventScroll:true});
}));
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!e.target.closest('[data-chips]'))close();});
menu.addEventListener('keydown',e=>{const items=[...menu.querySelectorAll('.mi')],i=items.indexOf(document.activeElement);
  if(e.key==='Escape'){close();}else if(e.key==='ArrowDown'){e.preventDefault();items[(i+1)%items.length].focus();}else if(e.key==='ArrowUp'){e.preventDefault();items[(i-1+items.length)%items.length].focus();}});
