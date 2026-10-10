import {offer,renderExport} from '../export/export.js';
import {MODS,modOf} from '../lights/mods.js';
import {TYPES} from '../state/constants.js';
import {TEMPLATES} from '../state/templates.js';
import {hasAnim} from '../state/anim.js';
import {selItem,state} from '../state/state.js';
import {activate,activeBoard,addBoard,boardSize,doc,duplicateBoard,ensureBoard,hasBoard,onBoards,removeBoard,renameBoard} from './boards.js';
import {renderDome} from './dome.js';
import {setGizmoMode,showGizmo} from './gizmo.js';
import {hydrateIcons,icon} from './icons.js';
import {removeItem,selectItem} from './items.js';
import {onSyncUI,syncAll} from './sync.js';
import {applyTemplate} from './templates.js';
import {toast} from './toast.js';
import {onUi,setUi,ui} from './ui-state.js';
import {fitAll} from './workspace.js';
import {$,$$} from '../util.js';

/* Editor shell: inspector that follows the selection (board / device / light / 2D item), layer tree, tools, menus, theme,
   templates tab and "export all boards". The panels themselves (devices-panel, lights-panel, controls…) keep
   binding their controls by id; this module only arranges and switches them. */
hydrateIcons();
state.showDome=true;  // the light map now lives in the inspector

const DEV_ICON={phone:'smartphone',tablet:'tablet',laptop:'laptop',monitor:'monitor',browser:'window-frame',page:'display',custom:'gallery-wide'};
const LIGHT_ICON={sun:'sun',overcast:'sun-fog',window:'sun-fog',bulb:'lightbulb'};
const typing=t=>t&&(/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)||t.isContentEditable);
function labels(list,base){const n={},seen={};list.forEach(x=>{const b=base(x);n[b]=(n[b]||0)+1;});
  return list.map(x=>{const b=base(x);seen[b]=(seen[b]||0)+1;return n[b]>1?b+' '+seen[b]:b;});}
const devNames=list=>labels(list,d=>TYPES[d.type]||'Cihaz');
const lightNames=list=>labels(list,L=>L.mod==='custom'?'Işık':modOf(L.mod).n);

/* ---------- inspector ---------- */
const insp={board:$('#inspBoard'),device:$('#inspDevice'),light:$('#inspLight'),item:$('#inspItem')};
let lastDevIcon='';
function syncInspector(){
  if((ui.kind==='light'&&!state.lights.length)||(ui.kind==='item'&&!selItem())||(ui.kind==='device'&&!state.devices.length)){setUi({kind:'board'});return;}
  // no artboard: an empty state with a way to make one
  const none=!hasBoard();$('#inspEmpty').hidden=!none;$('#exportMenuBtn').disabled=none;
  for(const k in insp)insp[k].hidden=none||k!==ui.kind;
  const dome=$('#dome'),slot=ui.kind==='light'?$('#domeSlotLight'):$('#domeSlotBoard');if(dome.parentNode!==slot)slot.appendChild(dome);
  const b=activeBoard();if(b&&document.activeElement!==$('#boardName'))$('#boardName').value=b.name;
  const d=state.devices.find(x=>x.id===state.selected);
  if(d&&DEV_ICON[d.type]!==lastDevIcon){lastDevIcon=DEV_ICON[d.type];$('#devIcon').innerHTML=icon(lastDevIcon);}
  const i=state.lights.findIndex(l=>l.id===state.selLight);if(i>=0)$('#lightTitle').textContent=lightNames(state.lights)[i];
  renderDome();
}
$('#boardName').addEventListener('change',e=>renameBoard(doc.active,e.target.value));
$('#boardName').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){if(e.key==='Escape')e.target.value=activeBoard().name;e.target.blur();}});

/* ---------- layer tree ---------- */
const tree=$('#tree'),expanded=new Set();
function node(o){
  const el=document.createElement('div');el.className='node'+(o.child?' child':' board');el.setAttribute('role','treeitem');el.tabIndex=-1;
  el.setAttribute('aria-selected',String(!!o.sel));if(!o.child)el.setAttribute('aria-expanded',String(!!o.open));
  el.innerHTML=(o.child?'':'<button class="tw" type="button" tabindex="-1" aria-label="'+(o.open?'Daralt':'Genişlet')+'">'+icon(o.open?'alt-arrow-down':'alt-arrow-right',12)+'</button>')+
    (o.dot?'<span class="dot" style="background:'+o.dot+'"></span>':icon(o.icon,14))+'<span class="nm"></span>'+(o.anim?'<span class="anim-mark" title="Animasyonlu"></span>':'')+'<span class="act"></span>';
  el.querySelector('.nm').textContent=o.name;
  const act=el.querySelector('.act');
  (o.actions||[]).forEach(([ic,label,fn])=>{const b=document.createElement('button');b.type='button';b.tabIndex=-1;b.setAttribute('aria-label',label);b.title=label;b.innerHTML=icon(ic,14);
    b.addEventListener('click',e=>{e.stopPropagation();fn();});act.appendChild(b);});
  el.addEventListener('click',e=>{if(e.target.closest('.tw')){o.toggle();return;}o.pick();});
  if(o.rename)el.querySelector('.nm').addEventListener('dblclick',e=>{e.stopPropagation();o.rename(el);});
  return el;
}
function startRename(el,b){
  const nm=el.querySelector('.nm'),inp=document.createElement('input');inp.className='ren';inp.value=b.name;inp.setAttribute('aria-label','Artboard adı');
  nm.replaceWith(inp);inp.focus();inp.select();let done=false;
  const end=ok=>{if(done)return;done=true;if(ok)renameBoard(b.id,inp.value);else renderTree();};
  inp.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')end(true);else if(e.key==='Escape')end(false);});
  inp.addEventListener('blur',()=>end(true));
}
function renderTree(){
  const focusedIdx=[...tree.children].indexOf(document.activeElement);
  tree.innerHTML='';
  doc.boards.forEach(b=>{
    const live=b.id===doc.active,open=live||expanded.has(b.id);
    tree.appendChild(node({name:b.name,icon:'frame',open,sel:live&&ui.kind==='board',
      toggle:()=>{if(live)return;expanded.has(b.id)?expanded.delete(b.id):expanded.add(b.id);renderTree();},
      pick:()=>{activate(b.id);setUi({kind:'board'});},rename:el=>startRename(el,b),
      actions:[['copy','Kopyasını oluştur',()=>{duplicateBoard(b.id);fitAll();}],['trash-bin-minimalistic','Sil',()=>removeBoard(b.id)]]}));
    if(!open)return;
    const devs=live?state.devices:b.snap.devices,lights=live?state.lights:b.snap.lights;
    const go=(fn)=>{if(!live)activate(b.id);fn();};
    // 2D items in stacking order: those in front of the devices above them, those behind below the lights
    const items=live?state.items:b.snap.state.items||[];
    const itemNode=it=>tree.appendChild(node({child:true,name:it.name,icon:'gallery',sel:live&&ui.kind==='item'&&state.selItem===it.id,
      pick:()=>go(()=>selectItem(it.id)),actions:live?[['trash-bin-minimalistic','Sil',()=>removeItem(it.id)]]:[]}));
    items.filter(it=>it.front).reverse().forEach(itemNode);
    devNames(devs).forEach((n,i)=>{const d=devs[i];
      tree.appendChild(node({child:true,name:n,icon:DEV_ICON[d.type]||'smartphone',anim:hasAnim(d),sel:live&&ui.kind==='device'&&state.selected===d.id,
        pick:()=>go(()=>{state.selected=d.id;syncAll();setUi({kind:'device'});syncTool();}),
        actions:live?[['trash-bin-minimalistic','Sil',()=>{state.selected=d.id;syncAll();$('#removeDevice').click();}]]:[]}));});
    lightNames(lights).forEach((n,i)=>{const L=lights[i];
      tree.appendChild(node({child:true,name:n,dot:L.color,sel:live&&ui.kind==='light'&&state.selLight===L.id,
        pick:()=>go(()=>{state.selLight=L.id;syncAll();setUi({kind:'light'});}),
        actions:live?[['trash-bin-minimalistic','Sil',()=>{state.selLight=L.id;syncAll();$('#removeLight').click();}]]:[]}));});
    items.filter(it=>!it.front).reverse().forEach(itemNode);
  });
  if(!doc.boards.length){const p=document.createElement('p');p.className='empty';p.style.margin='4px 8px';p.textContent='Artboard yok. + ile ya da A tuşuyla yeni bir artboard ekle.';tree.appendChild(p);return;}
  const items=[...tree.children];(items.find(x=>x.getAttribute('aria-selected')==='true')||items[0]).tabIndex=0;
  if(focusedIdx>=0&&items[focusedIdx])items[focusedIdx].focus();
}
// arrow keys move through the tree, Enter / Space picks, Left / Right collapse / expand
tree.addEventListener('keydown',e=>{
  const items=[...tree.querySelectorAll('.node')],i=items.indexOf(document.activeElement);if(i<0)return;
  const go=j=>{if(items[j]){items.forEach(x=>{x.tabIndex=-1;});items[j].tabIndex=0;items[j].focus();}};
  if(e.key==='ArrowDown'){e.preventDefault();go(i+1);}
  else if(e.key==='ArrowUp'){e.preventDefault();go(i-1);}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();items[i].click();}
  else if((e.key==='ArrowRight'||e.key==='ArrowLeft')&&items[i].classList.contains('board')){
    const open=items[i].getAttribute('aria-expanded')==='true';if((e.key==='ArrowRight')!==open)items[i].querySelector('.tw').click();}
});

/* ---------- tools ---------- */
function syncTool(){
  $$('#dock [data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===ui.tool)));
  if(ui.tool==='move'||ui.tool==='rotate'){setGizmoMode(ui.tool==='move'?'translate':'rotate');showGizmo(ui.kind==='device');}
  else showGizmo(false);
}
function setTool(t){setUi({tool:t});syncTool();}
$$('#dock [data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));

/* ---------- menus ---------- */
let openEl=null,openBtn=null;
function closeMenu(refocus){if(!openEl)return;openEl.hidden=true;const b=openBtn;if(b)b.setAttribute('aria-expanded','false');openEl=openBtn=null;if(refocus&&b)b.focus({preventScroll:true});}
// items: [icon, label, fn] or null (separator); opts.under: below the button (inspector), default above (dock)
function openMenu(menu,btn,items,opts){
  if(openEl===menu&&openBtn===btn){closeMenu();return;}closeMenu();
  if(items){menu.innerHTML='';items.forEach(it=>{
    if(!it){const s=document.createElement('div');s.className='msep';menu.appendChild(s);return;}
    const b=document.createElement('button');b.type='button';b.className='mi';b.setAttribute('role','menuitem');b.innerHTML=icon(it[0])+'<span></span>';b.lastChild.textContent=it[1];
    b.addEventListener('click',()=>{closeMenu();it[2]();});menu.appendChild(b);});}
  menu.hidden=false;openEl=menu;openBtn=btn;btn.setAttribute('aria-expanded','true');
  if(menu.parentNode===$('#stagearea')||menu.parentNode===$('#inspector')){
    const r=btn.getBoundingClientRect(),pr=menu.offsetParent.getBoundingClientRect();
    menu.style.left=Math.max(8,Math.min(r.left-pr.left,pr.width-menu.offsetWidth-8))+'px';
    if(opts&&opts.under){menu.style.top=(r.bottom-pr.top+4)+'px';menu.style.bottom='auto';}else{menu.style.top='auto';menu.style.bottom=(pr.bottom-r.top+8)+'px';}
  }
  const first=menu.querySelector('.mi,select,button');if(first)first.focus({preventScroll:true});
}
document.addEventListener('pointerdown',e=>{if(openEl&&!openEl.contains(e.target)&&!(openBtn&&openBtn.contains(e.target)))closeMenu();});
// arrow keys inside menus
document.addEventListener('keydown',e=>{
  if(!openEl||!openEl.contains(document.activeElement))return;
  const items=[...openEl.querySelectorAll('.mi')],i=items.indexOf(document.activeElement);
  if(e.key==='ArrowDown'&&items.length){e.preventDefault();items[(i+1)%items.length].focus();}
  else if(e.key==='ArrowUp'&&items.length){e.preventDefault();items[(i-1+items.length)%items.length].focus();}
});
$('#appMenuBtn').addEventListener('click',e=>{e.stopPropagation();openMenu($('#appMenu'),e.currentTarget);});
$('#appMenu').addEventListener('click',e=>{if(e.target.closest('.mi'))closeMenu();});
$('#exportMenuBtn').addEventListener('click',e=>{e.stopPropagation();syncExport();openMenu($('#exportMenu'),e.currentTarget);});
// the inspector menu needs a positioned parent
const inspMenu=$('#addMenu').cloneNode(false);inspMenu.id='inspMenu';$('#inspector').style.position='relative';$('#inspector').appendChild(inspMenu);
$('#boardMore').addEventListener('click',e=>{e.stopPropagation();openMenu($('#inspMenu'),e.currentTarget,[
  ['copy','Kopyasını oluştur',()=>{duplicateBoard();fitAll();}],
  ['trash-bin-minimalistic','Artboardı sil',()=>removeBoard(doc.active)]],{under:true});});

// dock: add device / light
$('#dock [data-add="device"]').addEventListener('click',e=>{e.stopPropagation();openMenu($('#addMenu'),e.currentTarget,
  Object.entries(TYPES).map(([k,n])=>[DEV_ICON[k]||'smartphone',n,()=>{ensureBoard();$('#addType').value=k;$('#addDevice').click();setUi({kind:'device'});syncTool();}])
    .concat([null,['widget','Hazır kompozisyonlar…',()=>{selectTab('tpl');}]]));});
$('#dock [data-add="light"]').addEventListener('click',e=>{e.stopPropagation();openMenu($('#addMenu'),e.currentTarget,
  MODS.filter(m=>m.k!=='custom').map(m=>[LIGHT_ICON[m.k]||'sun-2',m.n,()=>{ensureBoard();const n=state.lights.length;$('#addLight').click();
    if(state.lights.length>n){const b=$('#modGrid [data-mod="'+m.k+'"]');if(b)b.click();setUi({kind:'light'});}}]));});
const newBoard=()=>{addBoard();setUi({kind:'board'});fitAll();};
$('#addBoardBtn').addEventListener('click',newBoard);$('#addBoardDock').addEventListener('click',newBoard);$('#emptyAddBoard').addEventListener('click',newBoard);

/* ---------- export popover ---------- */
function syncExport(){
  const b=activeBoard();if(!b){$('#exportNote').textContent='Artboard yok';$('#exportBoards').hidden=true;return;}
  const [w,h]=boardSize(b);
  $('#exportNote').textContent=w+' × '+h+' px'+(state.quality==='photo'?' · fotoğraf kalitesi yarım dakika kadar sürer':'');
  $('#exportBoards').hidden=doc.boards.length<2;
}
['quality','size','format'].forEach(id=>$('#'+id).addEventListener('change',syncExport));
$('#export').addEventListener('click',()=>setTimeout(closeMenu,0));
const slug=s=>{const m={ç:'c',ğ:'g',ı:'i',ö:'o',ş:'s',ü:'u',Ç:'c',Ğ:'g',İ:'i',Ö:'o',Ş:'s',Ü:'u'};return String(s).replace(/[çğıöşüÇĞİÖŞÜ]/g,c=>m[c]).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'artboard';};
$('#exportBoards').addEventListener('click',async()=>{
  const btn=$('#exportBoards'),label=btn.textContent,back=doc.active,files=[],used={};btn.disabled=true;
  try{
    for(let i=0;i<doc.boards.length;i++){
      const b=doc.boards[i];btn.textContent='Hazırlanıyor: '+(i+1)+' / '+doc.boards.length;activate(b.id);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      let name=slug(b.name);used[name]=(used[name]||0)+1;if(used[name]>1)name+='-'+used[name];
      files.push([name+'.'+(state.format==='jpg'?'jpg':'png'),await renderExport()]);
    }
    let JSZip=null;try{JSZip=(await import('jszip')).default;}catch(e){/* separate files */}
    if(JSZip){const z=new JSZip();files.forEach(([n,bl])=>z.file(n,bl));offer('artboardlar.zip',await z.generateAsync({type:'blob'}));}
    else files.forEach(([n,bl])=>offer(n,bl));
    toast(files.length+' artboard indirildi');
  }catch(e){toast('Dışa aktarım tamamlanamadı. Daha küçük bir çözünürlük dene.');}
  finally{activate(back);btn.disabled=false;btn.textContent=label;closeMenu();}
});

/* ---------- left tabs, templates ---------- */
function selectTab(k){
  const lay=k!=='tpl';$('#tabLayers').setAttribute('aria-selected',String(lay));$('#tabTpl').setAttribute('aria-selected',String(!lay));
  $('#paneLayers').hidden=!lay;$('#paneTpl').hidden=lay;
}
$('#tabLayers').addEventListener('click',()=>selectTab('layers'));$('#tabTpl').addEventListener('click',()=>selectTab('tpl'));
const tplGrid=$('#tplGrid');
TEMPLATES.forEach(t=>{const b=document.createElement('button');b.type='button';b.className='tpl';b.title=t.name+': yeni artboard olarak ekle';
  b.innerHTML='<img loading="lazy" alt=""><span></span>';b.querySelector('img').src='showcases/'+t.id+'.jpg';b.querySelector('span').textContent=t.name;
  b.addEventListener('click',()=>{addBoard(null,t.name);applyTemplate(t);setUi({kind:'board'});fitAll();toast(t.name+' yeni artboard olarak eklendi');});
  tplGrid.appendChild(b);});

/* ---------- theme ---------- */
const THEME_KEY='mockup-studio-theme';
function applyTheme(t){if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;else delete document.documentElement.dataset.theme;
  $$('#themeSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===(t||'system'))));}
let theme='system';try{theme=localStorage.getItem(THEME_KEY)||'system';}catch(e){/* private mode */}
applyTheme(theme);
$$('#themeSeg button').forEach(b=>b.addEventListener('click',()=>{applyTheme(b.dataset.theme);try{localStorage.setItem(THEME_KEY,b.dataset.theme);}catch(e){/* ignore */}}));

/* ---------- keys ---------- */
const TOOL_KEYS={v:'select',w:'move',e:'rotate',o:'orbit',h:'hand'};
addEventListener('keydown',e=>{
  if(e.key==='Escape'&&openEl){e.preventDefault();closeMenu(true);return;}
  if(typing(e.target)||e.target.id==='domeSvg')return;
  const k=e.key.toLowerCase(),mod=e.metaKey||e.ctrlKey;
  if(mod&&k==='s'){e.preventDefault();$('#saveProject').click();return;}
  if(mod&&k==='o'){e.preventDefault();$('#openProjectBtn').click();return;}
  if(mod||e.altKey)return;
  if(TOOL_KEYS[k]&&!e.repeat){setTool(TOOL_KEYS[k]);return;}
  if(k==='a'&&!e.repeat){newBoard();return;}
  if(e.key==='Escape'){showGizmo(false);setUi({kind:'board'});return;}
  if(e.key==='Delete'||e.key==='Backspace'){
    if(ui.kind==='device'&&state.devices.length){e.preventDefault();$('#removeDevice').click();}
    else if(ui.kind==='light'){e.preventDefault();$('#removeLight').click();}
    // the artboard itself (the last one too: the canvas is then empty; undo brings it back)
    else if(ui.kind==='board'&&hasBoard()){e.preventDefault();removeBoard(doc.active);}
  }
});

/* ---------- wiring ---------- */
const refresh=()=>{syncInspector();renderTree();};
onUi(()=>{refresh();syncTool();});
onSyncUI(refresh);
onBoards(()=>{refresh();syncExport();});
syncTool();
