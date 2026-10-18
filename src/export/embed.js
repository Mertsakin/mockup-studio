import {toProjectFile} from '../io/project.js';
import {state} from '../state/state.js';
import {activeBoard,boardSize,docSnapshot,storeActive} from '../ui/boards.js';
import {toast} from '../ui/toast.js';
import {$} from '../util.js';
import {offer} from './export.js';

/* "Web'e göm": the active artboard as a self-hosted embed. The ZIP holds a mockup/ folder (the player built from
   embed.html: tools/embed/vite-plugin.mjs puts it at player/ with a files.json list; the host page's loader
   mockup-view.js; the scene as a project file; a poster still), an example page and a README with the code to
   paste. The site serves the folder itself; nothing is hosted by us yet. */
const DIR='mockup/';
const MODES={mouse:'Fareyi izler',drag:'Sürükleyince döner',scroll:'Kaydırmayla oynar',loop:'Döngüde oynar',still:'Sabit','mouse+scroll':'Fareyi izler, kaydırmayla oynar','mouse+loop':'Fareyi izler, döngüde oynar'};

// the active board only, without thumbnails or the asset library: what the player reads
function sceneDoc(){
  storeActive();
  const d=docSnapshot();
  return {v:2,layout:d.layout,active:d.active,boards:d.boards.filter(b=>b.id===d.active).map(b=>Object.assign({},b,{thumb:null,x:0,y:0})),fonts:d.fonts};
}
// a data URL as WebP when that is smaller (screenshots are PNGs; WebP at .9 is a fraction of them)
async function toWebp(url,q=.9){
  if(!/^data:image\/(png|jpeg)/.test(url)||url.length<120e3)return url;
  const img=await new Promise((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=fail;i.src=url;});
  const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);
  const w=c.toDataURL('image/webp',q);
  return w.startsWith('data:image/webp')&&w.length<url.length?w:url;
}
const dataBlob=async url=>(await fetch(url)).blob();
const gcd=(a,b)=>b?gcd(b,a%b):a;
const ratioOf=([w,h])=>{const g=gcd(Math.round(w),Math.round(h))||1;return Math.round(w)/g+'/'+Math.round(h)/g;};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

function snippetOf(o){
  const q=new URLSearchParams({src:o.scene});if(o.bg==='transparent')q.set('bg','transparent');
  return '<script src="'+DIR+'mockup-view.js" defer></script>\n'+
    '<mockup-view src="'+DIR+'embed.html?'+q.toString()+'" mode="'+o.mode+'" poster="'+DIR+'poster.webp" ratio="'+o.ratio+'" alt="'+esc(o.alt)+'"></mockup-view>';
}
const README=snippet=>`Shotlight · Web'e göm

1. "mockup" klasörünü sitenin dosyalarının yanına koy (örnek sayfa: index.html).
2. Mockup'ın görüneceği yere şu kodu ekle:

${snippet}

- mode: mouse (fareyi izler), drag (sürükleyince döner), scroll (kaydırmayla oynar), loop (döngüde oynar), still (sabit);
  ikisi + ile birleşebilir: mouse+scroll, mouse+loop.
- ratio: kutunun oranı; genişliği sayfan belirler. Yüksekliği CSS ile de verebilirsin.
- Dosyalar bir sunucudan açılmalı (http/https). Dosyayı çift tıklayıp açınca (file://) tarayıcı sahneyi yüklemez;
  denemek için bu klasörde: npx serve  ya da  python3 -m http.server
- Hareket azaltma tercihi açık ziyaretçiler hareketsiz görüntü görür.
`;
const EXAMPLE=(snippet,name)=>`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}</title>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#18181b;background:#fafafa}main{max-width:960px;margin:0 auto;padding:48px 24px}mockup-view{max-width:560px;margin:24px auto;border-radius:16px;overflow:hidden}</style>
</head>
<body>
<main>
<h1>${esc(name)}</h1>
${snippet}
</main>
</body>
</html>
`;

async function exportEmbed(){
  const b=activeBoard();if(!b){toast('Önce bir artboard ekle.');return;}
  const mode=$('#embMode').value,bg=$('#embBg').value,btn=$('#exportEmbed'),label=btn.textContent;
  btn.disabled=true;btn.textContent='Hazırlanıyor…';
  try{
    const JSZip=(await import('jszip')).default,zip=new JSZip();
    // the player's files (dev: built on the fly by the dev server; build: dist/player/)
    let files;try{const r=await fetch('player/files.json',{cache:'no-store'});if(!r.ok)throw 0;files=await r.json();}
    catch(e){toast('Oynatıcı dosyaları bulunamadı. Stüdyoyu yeniden derle (npm run build) ya da geliştirme sunucusunu yeniden başlat.');return;}
    const model=state.devices.some(d=>d.type==='model');
    const doc=sceneDoc(),pf=await toProjectFile(doc);
    // model decoders only for scenes with a model; the zip reader only for a zip scene (video / model)
    const want=files.filter(f=>(model||!/draco|basis/.test(f))&&(pf.zip||!/jszip/.test(f)));
    await Promise.all(want.map(async f=>{const r=await fetch('player/'+f);if(!r.ok)throw new Error(f);zip.file(DIR+f,await r.blob());}));
    // the scene: images as WebP where that is smaller
    let scene;
    if(pf.zip){scene='scene.mockup.zip';zip.file(DIR+scene,pf.blob);}
    else{const j=JSON.parse(await pf.blob.text());for(const k in j.images)j.images[k]=await toWebp(j.images[k]);
      scene='scene.mockup.json';zip.file(DIR+scene,JSON.stringify(j));}
    if(b.thumb)zip.file(DIR+'poster.webp',await dataBlob(await toWebp(b.thumb,.85)));
    const name=b.name||'Mockup',snippet=snippetOf({scene,mode,bg,ratio:ratioOf(boardSize(b)),alt:name});
    zip.file('README.txt',README(snippet));zip.file('index.html',EXAMPLE(snippet,name));
    const out=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    offer(slug(name)+'-web.zip',out);
    showSnippet(snippet,out.size);
  }catch(e){toast('Gömme paketi hazırlanamadı: '+(e.message||e));}
  finally{btn.disabled=false;btn.textContent=label;}
}
const slug=s=>{const m={ç:'c',ğ:'g',ı:'i',ö:'o',ş:'s',ü:'u',Ç:'c',Ğ:'g',İ:'i',Ö:'o',Ş:'s',Ü:'u'};return String(s).replace(/[çğıöşüÇĞİÖŞÜ]/g,c=>m[c]).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'mockup';};

// after the download: the code to paste, with a copy button
function showSnippet(code,bytes){
  const sc=document.createElement('div');sc.className='scrim';
  sc.innerHTML='<div class="dialog emb-dlg" role="dialog" aria-modal="true" aria-labelledby="embDlgT"><div class="dh"><span id="embDlgT">Gömme kodu</span>'+
    '<button class="ib sm" type="button" data-a="close" aria-label="Kapat"><span>✕</span></button></div><div class="db">'+
    '<ol><li>İndirilen ZIP’teki <b>mockup</b> klasörünü sitenin dosyalarına ekle.</li><li>Mockup’ın görüneceği yere bu kodu yapıştır.</li></ol>'+
    '<textarea class="code" readonly aria-label="Gömme kodu" spellcheck="false"></textarea>'+
    '<p class="hint-sm"></p>'+
    '<div class="dfoot"><button class="btn" type="button" data-a="close">Kapat</button><button class="btn primary" type="button" data-a="copy">Kodu kopyala</button></div></div></div>';
  document.body.appendChild(sc);
  const ta=sc.querySelector('textarea');ta.value=code;
  sc.querySelector('.hint-sm').textContent='Paket '+(bytes/1e6).toLocaleString('tr-TR',{maximumFractionDigits:1})+' MB. '+MODES[$('#embMode').value]+'. Dosyalar bir sunucudan açılmalı (file:// ile çalışmaz).';
  const close=()=>{sc.remove();document.removeEventListener('keydown',key,true);};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  document.addEventListener('keydown',key,true);
  sc.addEventListener('click',async e=>{const a=e.target.closest('[data-a]');if(e.target===sc){close();return;}if(!a)return;
    if(a.dataset.a==='close')close();
    else{try{await navigator.clipboard.writeText(code);a.textContent='Kopyalandı';}catch(err){ta.select();document.execCommand('copy');a.textContent='Kopyalandı';}}});
  sc.querySelector('[data-a="copy"]').focus();
}
$('#exportEmbed').addEventListener('click',exportEmbed);

export {exportEmbed};
