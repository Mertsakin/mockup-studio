import {RT} from '../devices/rt.js';
import {screenPixelWidth,setScreenTexture,updateChrome} from '../devices/screen.js';
import {state} from '../state/state.js';
import {onSyncUI,syncAll} from './sync.js';
import {toast} from './toast.js';
import {$} from '../util.js';

/* "Web sitesinden": captures a URL at a device's own viewport (responsive layout) through the dev server's
   /api/capture (tools/capture/vite-plugin.mjs) and puts the full-page shot on its screen, scrolled to the top.
   Each device keeps its own address (siteUrl); "Tüm cihazlara" uses one address for all of them, and devices that
   need the same viewport share one capture. The device scale factor is chosen so the shot is at least as wide as the
   device's screen texture (4096 px long edge, i.e. sharp at the 3840 px export): a phone at 390 CSS px needs ~5×,
   a laptop at 1440 ~3×. The server caps the page height in device pixels (MAX_PX_H), so a sharper shot reaches
   fewer screens down the page. */
const WIDTH={phone:390,tablet:820,laptop:1440,monitor:1920,browser:1440},DPR_MAX=8;
function viewport(d){
  const o=RT.get(d.id);if(!o||o.model)return null;  // an imported model has no screen
  let a;  // screen width / height as displayed
  if(o.custom){if(!d.screenRect||!d.frameImg)return null;a=(d.screenRect.w*d.frameImg.naturalWidth)/(d.screenRect.h*d.frameImg.naturalHeight);}
  else{a=o.sw/o.sh;if(o.rotatable&&d.landscape)a=1/a;}
  const portrait=a<1,mobile=d.type==='phone'||d.type==='tablet'||((d.type==='page'||d.type==='custom')&&portrait);
  let width=WIDTH[d.type]||(portrait?390:1440);
  if(d.type==='phone'&&!portrait)width=844;else if(d.type==='tablet'&&!portrait)width=1180;
  // scale so the capture is at least as wide as the screen texture (quarter steps keep equal devices sharing one shot)
  const dpr=Math.min(DPR_MAX,Math.max(1,Math.ceil(screenPixelWidth(d)/width*4)/4));
  return {width,height:Math.round(width/a),mobile,dpr};
}
// no scheme: assume https; other schemes go to the server, which refuses them
const normalizeUrl=raw=>/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)?raw:'https://'+raw;
const siteName=url=>new URL(url).hostname.replace(/^www\./,'');
// an error whose message is meant for the user as it is (e.user)
const userError=m=>Object.assign(new Error(m),{user:true});
/* One request to the dev server's endpoint: a full-page shot per target ({id, width, height, mobile, dpr}) ->
   {shots: {id: data URL}, finalUrl}. Shared by this panel and the welcome card (welcome.js), which sends one request
   per viewport to show each device's progress. */
// opts: {wait, dark, selector} (the capture options; defaults: none)
async function captureShots(url,targets,opts={}){
  let r;
  try{r=await fetch('/api/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({url,targets},opts))});}
  // no answer at all: the dev server has stopped (or the page was opened from the build / a file)
  catch(e){throw userError('Yakalama sunucusuna ulaşılamadı. Geliştirme sunucusunu başlat (npm run dev) ve sayfayı yenile.');}
  // a static deployment has no capture endpoint: 404, or an HTML fallback page instead of JSON
  if(r.status===404||!(r.headers.get('content-type')||'').includes('application/json'))throw userError('Web sitesinden yakalama yalnızca yerel geliştirme sunucusunda çalışır (npm run dev).');
  const res=await r.json();if(!r.ok)throw userError('Yakalanamadı: '+(res.error||r.statusText));
  return res;
}
// the capture options in the Ekran section (editor settings, not part of the document)
const captureOpts=()=>({wait:+$('#capWait').value||0,dark:$('#capDark').checked,selector:$('#capSel').value.trim()});
// whether this page can capture at all: only the dev server has the endpoint (a build never asks, so no 404 is logged)
let avail=null;
const captureAvailable=()=>avail||(avail=!import.meta.env.DEV?Promise.resolve(false)
  :fetch('/api/capture/ping').then(r=>r.ok&&(r.headers.get('content-type')||'').includes('application/json')).catch(()=>false));
const shotImage=src=>new Promise((ok,fail)=>{const img=new Image();img.onload=()=>ok(img);img.onerror=()=>fail(userError('Yakalanan görüntü açılamadı.'));img.src=src;});
// puts a captured page on a device's screen, scrolled to the top (siteUrl: the address as the user typed it)
function putShot(d,img,url,siteUrl){
  const final=new URL(url),name=siteName(url);
  if(d.video){d.video.pause();d.video=null;d.videoName='';if(d.tracks)delete d.tracks.scroll;}  // a screen video gives way to the shot (one or the other)
  d.img=img;d.imgName=name;d.scroll=0;d.fit='cover';d.siteUrl=siteUrl;
  if(d.type==='browser'){d.url=name+(final.pathname!=='/'?final.pathname:'');updateChrome(d);}
  setScreenTexture(d);
}
const input=$('#captureUrl'),one=$('#captureBtn'),all=$('#captureAllBtn');
// The field shows the selected device's own address; typing stores it on that device.
input.addEventListener('input',()=>{const d=state.devices.find(x=>x.id===state.selected);if(d)d.siteUrl=input.value.trim();});
onSyncUI(d=>{if(d&&document.activeElement!==input)input.value=d.siteUrl||'';});
// everyDevice=false: only the selected device; true: the same address on every device
async function capture(everyDevice){
  let raw=input.value.trim();if(!raw){input.focus();return;}
  raw=normalizeUrl(raw);
  const devices=everyDevice?state.devices:state.devices.filter(d=>d.id===state.selected);
  const groups=new Map();
  devices.forEach(d=>{const v=viewport(d);if(!v)return;const id=[v.width,v.height,v.mobile?'m':'d',v.dpr].join('-');
    if(!groups.has(id))groups.set(id,{target:Object.assign({id},v),devices:[]});groups.get(id).devices.push(d);});
  if(!groups.size){toast('Yakalanacak ekran yok. Kendi çerçeven için önce bir çerçeve PNG\u2019si yükle.');return;}
  const btn=everyDevice?all:one,label=btn.textContent;
  one.disabled=all.disabled=true;btn.textContent='Yakalanıyor…'+(groups.size>1?' ('+groups.size+' görünüm)':'');
  try{
    const res=await captureShots(raw,[...groups.values()].map(g=>g.target),captureOpts());
    const name=siteName(res.finalUrl||raw);
    for(const g of groups.values()){const img=await shotImage(res.shots[g.target.id]);g.devices.forEach(d=>putShot(d,img,res.finalUrl||raw,input.value.trim()));}
    syncAll();toast(res.missing?'Seçici sayfada bulunamadı: sayfa en üstten yakalandı.':name+(everyDevice?' tüm cihazlara':' bu cihaza')+' yerleştirildi. Ekranın üzerinde tekerlekle kaydırabilirsin.');
  }catch(e){toast(e.user?e.message:'Yakalanamadı: '+(e.message||e));}
  finally{one.disabled=all.disabled=false;btn.textContent=label;}
}
one.addEventListener('click',()=>capture(false));
all.addEventListener('click',()=>capture(true));
input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();capture(false);}});

// the screen recording (record.js) opens the site at the same viewport
export {captureAvailable,captureShots,shotImage,normalizeUrl,putShot,siteName,viewport};
