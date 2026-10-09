import {RT} from '../devices/rt.js';
import {setScreenTexture,updateChrome} from '../devices/screen.js';
import {state} from '../state/state.js';
import {syncAll} from './sync.js';
import {toast} from './toast.js';
import {$} from '../util.js';

/* "Web sitesinden": captures a URL for every device at that device's own viewport (responsive layout) through the
   dev server's /api/capture (tools/capture/vite-plugin.mjs), then puts each full-page shot on its screen, scrolled
   to the top. Devices that need the same viewport share one capture. */
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
const input=$('#captureUrl'),btn=$('#captureBtn'),label=btn.textContent;
async function captureAll(){
  let raw=input.value.trim();if(!raw){input.focus();return;}
  if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw))raw='https://'+raw;  // no scheme: assume https; other schemes go to the server, which refuses them
  const groups=new Map();
  state.devices.forEach(d=>{const v=viewport(d);if(!v)return;const id=[v.width,v.height,v.mobile?'m':'d',v.dpr].join('-');
    if(!groups.has(id))groups.set(id,{target:Object.assign({id},v),devices:[]});groups.get(id).devices.push(d);});
  if(!groups.size){toast('Yakalanacak ekran yok. Kendi çerçeven için önce bir çerçeve PNG’si yükle.');return;}
  btn.disabled=true;btn.textContent='Yakalanıyor… ('+groups.size+' görünüm)';
  try{
    const r=await fetch('/api/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:raw,targets:[...groups.values()].map(g=>g.target)})});
    // a static deployment has no capture endpoint: 404, or an HTML fallback page instead of JSON
    if(r.status===404||!(r.headers.get('content-type')||'').includes('application/json')){toast('Web sitesinden yakalama yalnızca yerel geliştirme sunucusunda çalışır (npm run dev).');return;}
    const res=await r.json();if(!r.ok)throw new Error(res.error||r.statusText);
    const final=new URL(res.finalUrl||raw),name=final.hostname.replace(/^www\./,'');
    for(const g of groups.values()){
      const img=new Image();img.src=res.shots[g.target.id];await img.decode();
      g.devices.forEach(d=>{d.img=img;d.imgName=name;d.scroll=0;d.fit='cover';
        if(d.type==='browser'){d.url=name+(final.pathname!=='/'?final.pathname:'');updateChrome(d);}
        setScreenTexture(d);});
    }
    syncAll();toast(name+' tüm cihazlara yerleştirildi. Ekranın üzerinde tekerlekle kaydırabilirsin.');
  }catch(e){toast('Yakalanamadı: '+(e.message||e));}
  finally{btn.disabled=false;btn.textContent=label;}
}
btn.addEventListener('click',captureAll);
input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();captureAll();}});
