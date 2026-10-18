import {ensureBoard} from './boards.js';
import {setUi} from './ui-state.js';
import {$} from '../util.js';

/* Keyboard shortcuts, Figma-like: single letters pick a tool or add something, ⌘ / Ctrl + letter acts on the selection.
   This module owns the "add" letters and the cheat sheet (?, also in the app menu); the other keys stay with the
   module they belong to (tools: shell.js, clipboard / frames: selection.js, layers: layers.js, view: workspace.js,
   animation: timeline.js, focus: navigator.js, free transform: transform-box.js). SHEET is the list shown to the user:
   change it together with those handlers. */
const MAC=/Mac|iPhone|iPad/.test(navigator.platform||'');
const C=MAC?'⌘':'Ctrl',S='⇧',O=MAC?'⌥':'Alt';
const SHEET=[
  ['Araçlar',[['V','Seç'],['W','Taşı (eksenler)'],['E','Döndür (eksenler)'],['O','Yörünge'],['H','Kaydır (basılı Boşluk da)'],[C+' T','Cihazı ölçekle (serbest dönüştürme)'+(MAC?'; tarayıcı ⌘T’yi alırsa Ctrl T':'')]]],
  ['Ekle',[['T','Metin aracı: tıkladığın yere'],['F','Çerçeve aracı: tıkla ya da sürükleyerek çiz ('+S+' kare, '+O+' merkezden)'],['A','Artboard'],['D','Cihaz menüsü'],['L','Işık menüsü']]],
  ['Düzen',[[C+' Z','Geri al'],[S+' '+C+' Z','Yinele'],[C+' C / X / V','Kopyala / kes / yapıştır'],[C+' D','Çoğalt'],[C+' A','Tümünü seç'],['Sil','Sil'],
    [S+' tıklama','Seçime ekle / çıkar'],['Oklar','Kaydır (1 px, '+S+' 10 px); auto layout içinde sırayı değiştir'],['Enter','Metni düzenle'],['Esc','Seçimi bırak / aracı iptal et']]],
  ['Çerçeve',[[O+' '+C+' G','Seçimi çerçeveye al'],[S+' A','Auto layout ekle'],[S+' '+C+' G','Çerçeveden çıkar']]],
  ['Sıra',[[C+' ]','Öne'],[C+' [','Arkaya'],[S+' '+C+' ]','En öne'],[S+' '+C+' [','En arkaya']]],
  ['Görünüm',[['Z basılı','Yakınlaştır: tıkla ya da alan sürükle; '+O+' ile tıkla uzaklaş'],[S+' F','Seçili cihaza odaklan'],[S+' 1','Tüm artboardlar'],[S+' 2','Etkin artboard'],[C+' tekerlek','Yakınlaştır'],[O+' tekerlek','Kamera yakınlığı']]],
  ['Animasyon (Canlandır)',[['Boşluk','Oynat / durdur'],['K','Anahtar kare'],['← →','Bir kare ('+S+' 1 sn)'],['Home','Başa dön'],
    [S+' / '+C+' + tık','Anahtar seçimine ekle / çıkar'],['Sürükle (boş alan)','Çerçeve ile anahtar seç'],[C+' A','Katmanın tüm anahtarları (çizelgede)'],['↑ ↓','Önceki / sonraki anahtar kare'],['Çift tık (satır)','O anda anahtar kare'],['⌥ ← →','Seçili anahtarları bir kare kaydır ('+S+' 1 sn)'],['Sil','Seçili anahtarları sil'],['Esc','Anahtar seçimini bırak']]],
  ['Dosya',[[C+' S','Kaydet'],[S+' '+C+' S','Farklı kaydet'],[C+' O','Aç'],['?','Bu liste']]]
];
function openSheet(){
  if(document.querySelector('.keys-dlg'))return;
  const sc=document.createElement('div');sc.className='scrim';
  sc.innerHTML='<div class="dialog keys-dlg" role="dialog" aria-modal="true" aria-labelledby="keysTitle"><div class="dh"><span id="keysTitle">Klavye kısayolları</span>'+
    '<button class="ib sm" type="button" data-close aria-label="Kapat">✕</button></div><div class="db keys"></div></div>';
  const body=sc.querySelector('.keys');
  SHEET.forEach(([title,rows])=>{const g=document.createElement('section');g.innerHTML='<h4></h4><dl></dl>';g.firstChild.textContent=title;
    rows.forEach(([k,what])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');
      k.split(' / ').forEach((part,i)=>{if(i)dt.append(' / ');part.split(' ').forEach(t=>{const kb=document.createElement('kbd');kb.textContent=t;dt.appendChild(kb);});});
      dd.textContent=what;g.lastChild.append(dt,dd);});
    body.appendChild(g);});
  document.body.appendChild(sc);
  const close=()=>sc.remove();
  sc.addEventListener('click',e=>{if(e.target===sc||e.target.closest('[data-close]'))close();});
  sc.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'||e.key==='?')close();});
  sc.querySelector('[data-close]').focus();
}
$('#keysBtn').addEventListener('click',openSheet);

const typing=t=>t&&(/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)||t.isContentEditable);
addEventListener('keydown',e=>{
  // not while a dialog is open (the video dialog's scrim stays in the page, hidden)
  if(typing(e.target)||e.metaKey||e.ctrlKey||e.altKey||e.repeat||[...document.querySelectorAll('.scrim')].some(x=>!x.hidden))return;
  // ? (Shift + / on US layouts, Shift + * key on Turkish ones: e.key is '?' on both)
  if(e.key==='?'||(e.code==='Slash'&&e.shiftKey)){e.preventDefault();openSheet();return;}
  if(e.shiftKey)return;
  const k=e.key.toLowerCase();
  // T / F pick the insert tool: the next click on the artboard places it (insert.js)
  if(k==='t'){e.preventDefault();ensureBoard();setUi({tool:'text'});}
  else if(k==='f'){e.preventDefault();ensureBoard();setUi({tool:'frame'});}
  else if(k==='d'){e.preventDefault();$('#dock [data-add="device"]').click();}
  else if(k==='l'){e.preventDefault();$('#dock [data-add="light"]').click();}
});

export {openSheet};
