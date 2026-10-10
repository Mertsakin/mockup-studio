import {RT} from '../devices/rt.js';
import {setScreenTexture,updateChrome} from '../devices/screen.js';
import {state} from '../state/state.js';
import {onSyncUI,syncAll} from './sync.js';
import {toast} from './toast.js';
import {$} from '../util.js';

/* "Web sitesinden": captures a URL at a device's own viewport (responsive layout) through the dev server's
   /api/capture (tools/capture/vite-plugin.mjs) and puts the full-page shot on its screen, scrolled to the top.
   Each device keeps its own address (siteUrl); "Tüm cihazlara" uses one address for all of them, and devices that
   need the same viewport share one capture. */
const WIDTH={phone:390,tablet:820,laptop:1440,monitor:1920,browser:1440};
function viewport(d){
  const o=RT.get(d.id);if(!o)return null;
  let a;  // screen width / height as displayed
  if(o.custom){if(!d.screenRect||!d.frameImg)return null;a=(d.screenRect.w*d.frameImg.naturalWidth)/(d.screenRect.h*d.frameImg.naturalHeight);}
  else{a=o.sw/o.sh;if(o.rotatable&&d.landscape)a=1/a;}
  const portrait=a<1,mobile=d.type==='phone'||d.type==='tablet'||((d.type==='page'||d.type==='custom')&&portrait);
  let width=WIDTH[d.type]||(portrait?390:1440);
  if(d.type==='phone'&&!portrait)width=844;else if(d.type==='tablet'&&!portrait)width=1180;
  return {width,height:Math.round(width/a),mobile,dpr:d.type==='monitor'?1.5:2};
}
const input=$('#captureUrl'),one=$('#captureBtn'),all=$('#captureAllBtn');
// The field shows the selected device's own address; typing stores it on that device.
input.addEventListener('input',()=>{const d=state.devices.find(x=>x.id===state.selected);if(d)d.siteUrl=input.value.trim();});
onSyncUI(d=>{if(document.activeElement!==input)input.value=d.siteUrl||'';});
// everyDevice=false: only the selected device; true: the same address on every device
async function capture(everyDevice){
  let raw=input.value.trim();if(!raw){input.focus();return;}
  if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw))raw='https://'+raw;  // no scheme: assume https; other schemes go to the server, which refuses them
  const devices=everyDevice?state.devices:state.devices.filter(d=>d.id===state.selected);
  const groups=new Map();
  devices.forEach(d=>{const v=viewport(d);if(!v)return;const id=[v.width,v.height,v.mobile?'m':'d',v.dpr].join('-');
    if(!groups.has(id))groups.set(id,{target:Object.assign({id},v),devices:[]});groups.get(id).devices.push(d);});
  if(!groups.size){toast('Yakalanacak ekran yok. Kendi çerçeven için önce bir çerçeve PNG\u2019si yükle.');return;}
  const btn=everyDevice?all:one,label=btn.textContent;
  one.disabled=all.disabled=true;btn.textContent='Yakalanıyor…'+(groups.size>1?' ('+groups.size+' görünüm)':'');
  try{
    let r;
    try{r=await fetch('/api/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:raw,targets:[...groups.values()].map(g=>g.target)})});}
    // no answer at all: the dev server has stopped (or the page was opened from the build / a file)
    catch(e){toast('Yakalama sunucusuna ulaşılamadı. Geliştirme sunucusunu başlat (npm run dev) ve sayfayı yenile.');return;}
    // a static deployment has no capture endpoint: 404, or an HTML fallback page instead of JSON
    if(r.status===404||!(r.headers.get('content-type')||'').includes('application/json')){toast('Web sitesinden yakalama yalnızca yerel geliştirme sunucusunda çalışır (npm run dev).');return;}
    const res=await r.json();if(!r.ok)throw new Error(res.error||r.statusText);
    const final=new URL(res.finalUrl||raw),name=final.hostname.replace(/^www\./,'');
    for(const g of groups.values()){
      const img=new Image();img.src=res.shots[g.target.id];await img.decode();
      g.devices.forEach(d=>{d.img=img;d.imgName=name;d.scroll=0;d.fit='cover';d.siteUrl=input.value.trim();
        if(d.type==='browser'){d.url=name+(final.pathname!=='/'?final.pathname:'');updateChrome(d);}
        setScreenTexture(d);});
    }
    syncAll();toast(name+(everyDevice?' tüm cihazlara':' bu cihaza')+' yerleştirildi. Ekranın üzerinde tekerlekle kaydırabilirsin.');
  }catch(e){toast('Yakalanamadı: '+(e.message||e));}
  finally{one.disabled=all.disabled=false;btn.textContent=label;}
}
one.addEventListener('click',()=>capture(false));
all.addEventListener('click',()=>capture(true));
input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();capture(false);}});
