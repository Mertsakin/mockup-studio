import {state,selItem} from '../state/state.js';
import {activate,doc,fillThumbs,storeActive} from './boards.js';
import {busy,isCancel,paint} from './busy.js';
import {renderItems} from './layout.js';
import {onSyncUI,syncAll} from './sync.js';
import {toast} from './toast.js';
import {offer,renderExport} from '../export/export.js';
import {t as tx} from '../lang.js';
import {$} from '../util.js';

/* Languages of a document (mağaza görselleri, sosyal: one set of artboards, many languages). doc.langs lists them
   (the first is the base), doc.lang is the one shown. A text item carries its other languages in it.loc
   ({code: text}); it.text is always the text in doc.lang, so the canvas, export and editing in place need nothing
   new. Switching language writes the shown text into loc[from] and puts loc[to] (else the base's) on every
   board: the live one through state.items, the others in their snapshots (their thumbnails are redrawn).
   The translation table (CSV: board, key, item, one column per language) is the way to fill ten languages at once;
   "Tüm diller (ZIP)" exports every board in every language, a folder per language. */
const LANGS=[['tr','Türkçe'],['en','English'],['de','Deutsch'],['fr','Français'],['es','Español'],['it','Italiano'],['pt-BR','Português (Brasil)'],
  ['nl','Nederlands'],['pl','Polski'],['ru','Русский'],['ar','العربية'],['ja','日本語'],['ko','한국어'],['zh-Hans','简体中文']];
const nameOf=c=>(LANGS.find(l=>l[0]===c)||[c,c])[1];

// every text item of the document with its board (the live board's from state, the others' from their snapshots)
function allTexts(){
  const out=[];
  for(const b of doc.boards){const items=b.id===doc.active?state.items:(b.snap&&b.snap.state&&b.snap.state.items)||[];
    items.forEach(it=>{if(it.kind==='text')out.push({b,it,live:b.id===doc.active});});}
  return out;
}
function setLang(to){
  if(!doc.langs.includes(to)||to===doc.lang)return;
  const from=doc.lang,base=doc.langs[0];
  allTexts().forEach(({it})=>{it.loc=it.loc||{};it.loc[from]=it.text;it.text=to in it.loc&&it.loc[to]!==''?it.loc[to]:it.loc[base]??it.text;});
  doc.lang=to;
  doc.boards.forEach(b=>{if(b.id!==doc.active)b.thumb=null;});
  renderItems();syncAll();fillThumbs();
}
function addLang(code){
  if(!doc.langs.length){doc.langs=[code];doc.lang=code;return;}
  if(!doc.langs.includes(code))doc.langs.push(code);
}
function removeLang(code){
  if(code===doc.langs[0])return;
  if(doc.lang===code)setLang(doc.langs[0]);
  doc.langs=doc.langs.filter(c=>c!==code);
  allTexts().forEach(({it})=>{if(it.loc)delete it.loc[code];});
  if(doc.langs.length===1){allTexts().forEach(({it})=>{delete it.loc;});doc.langs=[];doc.lang=null;}
}

/* ---------- CSV: a row per text item; key = board id / item id (names change, ids do not) */
const csvCell=v=>{const s=String(v??'');return /[",\n\r;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
function parseCsv(text){
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;}
    else if(c==='"')q=true;else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;}
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows.filter(r=>r.some(x=>x!==''));
}
function downloadCsv(){
  const langs=doc.langs,head=['artboard','anahtar','öğe',...langs];
  const lines=[head.map(csvCell).join(',')];
  allTexts().forEach(({b,it})=>{const loc=Object.assign({},it.loc||{},{[doc.lang]:it.text});
    lines.push([b.name,b.id+'/'+it.id,it.name||'',...langs.map(l=>loc[l]??'')].map(csvCell).join(','));});
  offer('ceviriler.csv',new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));
}
async function importCsv(file){
  const rows=parseCsv((await file.text()).replace(/^\uFEFF/,''));if(rows.length<2){toast(tx('Tabloda satır yok.'));return;}
  const head=rows[0].map(h=>h.trim()),ki=head.indexOf('anahtar');
  if(ki<0){toast(tx('Tabloda "anahtar" sütunu yok: önce çeviri tablosunu indir, onu doldur.'));return;}
  // language columns: the document's, plus any known code in the header (a new language comes in with the table)
  const cols=head.map((h,i)=>[h,i]).filter(([h])=>LANGS.some(l=>l[0]===h)||doc.langs.includes(h));
  cols.forEach(([h])=>addLang(h));
  const byKey=new Map(allTexts().map(x=>[x.b.id+'/'+x.it.id,x]));let n=0;
  for(const r of rows.slice(1)){const x=byKey.get((r[ki]||'').trim());if(!x)continue;
    x.it.loc=x.it.loc||{};
    cols.forEach(([h,i])=>{const v=r[i];if(v==null||v==='')return;if(h===doc.lang)x.it.text=v;else x.it.loc[h]=v;});n++;}
  doc.boards.forEach(b=>{if(b.id!==doc.active)b.thumb=null;});
  renderItems();syncAll();fillThumbs();sync();
  toast(tx('{n} metin güncellendi',{n})+(cols.length?' · '+cols.map(([h])=>h).join(', '):''));
}

/* ---------- export: every board in every language, a folder per language */
const slug=s=>String(s).toLowerCase().replace(/[çğıöşü]/g,c=>({ç:'c',ğ:'g',ı:'i',ö:'o',ş:'s',ü:'u'})[c]).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'artboard';
async function exportAllLangs(){
  if(doc.langs.length<2)return;
  const back=doc.active,lang0=doc.lang,total=doc.langs.length*doc.boards.length,ext=state.format==='jpg'?'jpg':'png';
  const bz=busy(tx('Diller hazırlanıyor'));let k=0;
  try{
    const JSZip=(await import('jszip')).default,zip=new JSZip();
    for(const l of doc.langs){
      setLang(l);const used={};
      for(const b of doc.boards){bz.step(k++,total,nameOf(l)+' · '+b.name);activate(b.id);await paint();
        let n=slug(b.name);used[n]=(used[n]||0)+1;if(used[n]>1)n+='-'+used[n];
        zip.file(l+'/'+n+'.'+ext,await renderExport(bz.progress));}
    }
    offer('diller.zip',await zip.generateAsync({type:'blob'}));
    toast(tx('{l} dil × {n} artboard indirildi',{l:doc.langs.length,n:doc.boards.length}));
  }catch(e){toast(isCancel(e)?tx('Dışa aktarım durduruldu'):tx('Dışa aktarım tamamlanamadı: {m}',{m:e.message||e}));}
  finally{bz.close();activate(back);setLang(lang0);}
}

/* ---------- UI: the export popover's language row and the languages dialog */
function sync(){
  const on=doc.langs.length>0,sel=$('#langSel');
  $('#langRow').hidden=!on;$('#exportLangs').hidden=doc.langs.length<2;
  $('#langEdit').textContent=tx(on?'Diller ve çeviriler…':'Çok dilli yap…');
  if(on){sel.innerHTML='';doc.langs.forEach(c=>sel.appendChild(new Option(nameOf(c)+(c===doc.langs[0]?' '+tx('(ana dil)'):''),c)));sel.value=doc.lang;}
  // the selected text item: a field per other language
  const box=$('#textLoc'),it=selItem();
  box.hidden=!(on&&it&&it.kind==='text');
  if(!box.hidden&&document.activeElement.closest('#textLoc')==null){
    box.innerHTML='';
    doc.langs.filter(c=>c!==doc.lang).forEach(c=>{
      const l=document.createElement('label');l.className='loc';l.innerHTML='<span></span><textarea rows="1" spellcheck="false"></textarea>';
      l.firstChild.textContent=c;l.title=nameOf(c);const ta=l.lastChild;ta.setAttribute('aria-label',tx('Metin')+', '+nameOf(c));ta.value=(it.loc&&it.loc[c])||'';
      ta.placeholder=c===doc.langs[0]?'':tx('çevrilmedi: ana dil görünür');
      ta.addEventListener('input',()=>{it.loc=it.loc||{};it.loc[c]=ta.value;});
      box.appendChild(l);});
  }
}
onSyncUI(sync);
$('#langSel').addEventListener('change',e=>setLang(e.target.value));
$('#exportLangs').addEventListener('click',exportAllLangs);
$('#langEdit').addEventListener('click',openDialog);

function openDialog(){
  storeActive();
  const sc=document.createElement('div');sc.className='scrim';
  sc.innerHTML='<div class="dialog lang-dlg" role="dialog" aria-modal="true" aria-labelledby="lgT"><div class="dh"><span id="lgT">'+tx('Diller ve çeviriler')+'</span>'+
    '<button class="ib sm" type="button" data-a="close" aria-label="'+tx('Kapat')+'"><span>✕</span></button></div><div class="db">'+
    '<p class="hint-sm">'+tx('Her metin öğesi seçilen dillerde ayrı içerik taşır. Dili Dışa aktar menüsünden değiştir; tuvalde düzenlediğin metin o dile yazılır. On dili birden doldurmak için çeviri tablosunu indir, doldur, geri yükle.')+'</p>'+
    '<div class="row" id="lgBaseRow"><label class="lbl" for="lgBase">'+tx('Ana dil')+'</label><select id="lgBase"></select></div>'+
    '<div class="lang-grid" id="lgList" role="group" aria-label="'+tx('Diller')+'"></div>'+
    '<div class="row"><button class="btn" type="button" data-a="csv">'+tx('Çeviri tablosunu indir (CSV)')+'</button><button class="btn" type="button" data-a="import">'+tx('Tabloyu yükle…')+'</button></div>'+
    '<input type="file" accept=".csv,text/csv" hidden id="lgFile">'+
    '<div class="dfoot"><button class="btn primary" type="button" data-a="close">'+tx('Tamam')+'</button></div></div></div>';
  document.body.appendChild(sc);
  const q=s=>sc.querySelector(s);
  const draw=()=>{
    const base=doc.langs[0];q('#lgBaseRow').hidden=!!base;
    if(!base){const s=q('#lgBase');s.innerHTML='';LANGS.forEach(([c,n])=>s.appendChild(new Option(n,c)));s.value='tr';}
    const list=q('#lgList');list.innerHTML='';
    LANGS.forEach(([c,n])=>{const l=document.createElement('label');l.className='lang';
      l.innerHTML='<input type="checkbox"><span></span>';const cb=l.firstChild;cb.checked=doc.langs.includes(c);cb.disabled=c===base;
      l.lastChild.textContent=n+(c===base?' '+tx('(ana)'):'');
      cb.addEventListener('change',()=>{
        if(cb.checked){if(!doc.langs.length)addLang(q('#lgBase').value);addLang(c);}else removeLang(c);
        draw();sync();});
      list.appendChild(l);});
    q('[data-a="csv"]').disabled=!doc.langs.length;
  };
  draw();
  const close=()=>{sc.remove();document.removeEventListener('keydown',key,true);sync();syncAll();};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  document.addEventListener('keydown',key,true);
  sc.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(e.target===sc){close();return;}if(!a)return;
    if(a.dataset.a==='close')close();else if(a.dataset.a==='csv')downloadCsv();else if(a.dataset.a==='import')q('#lgFile').click();});
  q('#lgFile').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(f){if(!doc.langs.length)addLang(q('#lgBase').value);await importCsv(f);draw();}});
}

export {LANGS,exportAllLangs,setLang};
