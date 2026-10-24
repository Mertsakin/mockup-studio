import {ensureBoard} from './boards.js';
import {setUi} from './ui-state.js';
import {t} from '../lang.js';
import {$} from '../util.js';

/* Keyboard shortcuts, Figma-like: single letters pick a tool or add something, ⌘ / Ctrl + letter acts on the selection.
   This module owns the "add" letters and the cheat sheet (?, also in the app menu); the other keys stay with the
   module they belong to (tools: shell.js, clipboard / frames: selection.js, layers: layers.js, view: workspace.js,
   animation: timeline.js, focus: navigator.js, free transform: transform-box.js). SHEET is the list shown to the user:
   change it together with those handlers. */
const MAC=/Mac|iPhone|iPad/.test(navigator.platform||'');
const C=MAC?'⌘':'Ctrl',S='⇧',O=MAC?'⌥':'Alt';
// the keys and what they do, in the UI language (the key column keeps the symbols; its words go through t too)
const SHEET=()=>[
  [t('Araçlar'),[['V',t('Seç')],['W',t('Taşı (eksenler)')],['E',t('Döndür (eksenler)')],['O',t('Yörünge')],['H',t('Kaydır (basılı Boşluk da)')],[C+' T',t('Cihazı ölçekle (serbest dönüştürme)')+(MAC?'; '+t('tarayıcı ⌘T’yi alırsa Ctrl T'):'')]]],
  [t('Ekle'),[['T',t('Metin aracı: tıkladığın yere')],['F',t('Çerçeve aracı: tıkla ya da sürükleyerek çiz ({s} kare, {o} merkezden)',{s:S,o:O})],['A',t('Artboard')],['D',t('Cihaz menüsü')],['L',t('Işık menüsü')]]],
  [t('Düzen'),[[C+' Z',t('Geri al')],[S+' '+C+' Z',t('Yinele')],[C+' C / X / V',t('Kopyala / kes / yapıştır')],[C+' D',t('Çoğalt')],[C+' A',t('Tümünü seç')],[t('Sil'),t('Sil')],
    [S+' '+t('tıklama'),t('Seçime ekle / çıkar')],[t('Oklar'),t('Kaydır (1 px, {s} 10 px); auto layout içinde sırayı değiştir',{s:S})],['Enter',t('Metni düzenle')],['Esc',t('Seçimi bırak / aracı iptal et')]]],
  [t('Çerçeve'),[[O+' '+C+' G',t('Seçimi çerçeveye al')],[S+' A',t('Auto layout ekle')],[S+' '+C+' G',t('Çerçeveden çıkar')]]],
  [t('Sıra'),[[C+' ]',t('Öne')],[C+' [',t('Arkaya')],[S+' '+C+' ]',t('En öne')],[S+' '+C+' [',t('En arkaya')]]],
  [t('Görünüm'),[[t('Z basılı'),t('Yakınlaştır: tıkla ya da alan sürükle; {o} ile tıkla uzaklaş',{o:O})],[S+' F',t('Seçili cihaza odaklan')],[S+' 1',t('Tüm artboardlar')],[S+' 2',t('Etkin artboard')],[C+' '+t('tekerlek'),t('Yakınlaştır')],[O+' '+t('tekerlek'),t('Kamera yakınlığı')],[O+' '+C+' Enter',t('Sunum: artboard tam ekranda (← → artboardlar, Boşluk oynat / durdur, Esc çıkış)')]]],
  [t('Animasyon (Canlandır)'),[[t('Boşluk'),t('Oynat / durdur')],['K',t('Anahtar kare')],['← →',t('Bir kare ({s} 1 sn)',{s:S})],['Home',t('Başa dön')],
    [S+' / '+C+' + '+t('tık'),t('Anahtar seçimine ekle / çıkar')],[t('Sürükle (boş alan)'),t('Çerçeve ile anahtar seç')],[C+' A',t('Katmanın tüm anahtarları (çizelgede)')],['↑ ↓',t('Önceki / sonraki anahtar kare')],[t('Çift tık (satır)'),t('O anda anahtar kare')],[C+' + '+t('tekerlek'),t('Zaman eksenini yakınlaştır')],[t('Yatay tekerlek'),t('Zaman eksenini kaydır')],[S+' 1',t('Çizelgeyi sığdır (çizelgede)')],[C+' C / '+C+' X / '+C+' V',t('Anahtarları kopyala / kes / imlece yapıştır (çizelgede)')],[C+' D',t('Anahtarları imlece çoğalt (çizelgede)')],[t('Sağ tık (anahtar)'),t('Pano, geçiş türü, tasarım karesi, sil')],[t('Uç tutamaçları'),t('Seçimi zamanda esnet')],['⌥ ← →',t('Seçili anahtarları bir kare kaydır ({s} 1 sn)',{s:S})],[t('Sil'),t('Seçili anahtarları sil')],['Esc',t('Anahtar seçimini bırak')]]],
  [t('Dosya'),[[C+' S',t('Kaydet')],[S+' '+C+' S',t('Farklı kaydet')],[C+' O',t('Aç')],['?',t('Bu liste')]]]
];
function openSheet(){
  if(document.querySelector('.keys-dlg'))return;
  const sc=document.createElement('div');sc.className='scrim';
  sc.innerHTML='<div class="dialog keys-dlg" role="dialog" aria-modal="true" aria-labelledby="keysTitle"><div class="dh"><span id="keysTitle">'+t('Klavye kısayolları')+'</span>'+
    '<button class="ib sm" type="button" data-close aria-label="'+t('Kapat')+'">✕</button></div><div class="db keys"></div></div>';
  const body=sc.querySelector('.keys');
  SHEET().forEach(([title,rows])=>{const g=document.createElement('section');g.innerHTML='<h4></h4><dl></dl>';g.firstChild.textContent=title;
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
