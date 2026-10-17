// Dev-server only: full-page website screenshots for the device screens.
// POST /api/capture {url, targets:[{id, width, height, mobile, dpr}]} -> {shots:{id: dataURL}, finalUrl}
// Each target is rendered at its own viewport (responsive layout) at its own device scale factor (dpr: the client
// asks for enough pixels to fill the device's screen texture), lazy content is scrolled into view, cookie / consent
// overlays are removed, and the page is captured down to MAX_H CSS px or MAX_PX_H device px, whichever comes first.
// Not part of the production build: a static deployment needs a separate capture service.
// The interactive screen recording (/api/record/ws, record.mjs) shares the viewport helpers (shared.mjs).
import {chromium} from 'playwright';
import {closeRecordSessions,onRecordSocket} from './record.mjs';
import {DPR_MAX,MAX_PX_W,mobileUA,reason} from './shared.mjs';

const MAX_H=8000,MAX_PX_H=16384,MAX_TARGETS=12,NAV_TIMEOUT=30000;
let browserP=null;
const browser=()=>browserP||(browserP=chromium.launch());

function readJson(req){return new Promise((res,rej)=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e5)req.destroy();});req.on('end',()=>{try{res(JSON.parse(b));}catch(e){rej(e);}});req.on('error',rej);});}
const send=(res,code,obj)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(obj));};

// o: {wait (s after load), dark (prefers-color-scheme), selector (start the shot at that element's top)}
async function capture(url,t,o={}){
  const b=await browser(),mobile=!!t.mobile;
  const dpr=Math.min(DPR_MAX,MAX_PX_W/t.width,Math.max(1,+t.dpr||2)),maxH=Math.min(MAX_H,Math.floor(MAX_PX_H/dpr));
  const ctx=await b.newContext({viewport:{width:t.width,height:t.height},deviceScaleFactor:dpr,isMobile:mobile,hasTouch:mobile,
    userAgent:mobileUA(mobile,t.width),locale:'tr-TR',colorScheme:o.dark?'dark':'light'});
  try{
    const page=await ctx.newPage();
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:NAV_TIMEOUT});
    await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});
    // walk down the page so lazy images / sections load, then back to the top
    await page.evaluate(async max=>{const step=innerHeight*.8,end=Math.min(document.documentElement.scrollHeight,max);
      for(let y=0;y<end;y+=step){scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}scrollTo(0,0);},maxH);
    await page.waitForLoadState('networkidle',{timeout:4000}).catch(()=>{});
    // cookie / consent banners: fixed or sticky elements whose id / class / label says so
    await page.evaluate(()=>{const re=/cookie|consent|gdpr|çerez|kvkk/i;
      for(const el of document.querySelectorAll('body *')){const cs=getComputedStyle(el);if(cs.position!=='fixed'&&cs.position!=='sticky')continue;
        const cls=typeof el.className==='string'?el.className:(el.className&&el.className.baseVal)||'';
        if(re.test((el.id||'')+' '+cls+' '+(el.getAttribute('aria-label')||'')))el.remove();}});
    await page.waitForTimeout(300+Math.round(o.wait*1000));
    const h=await page.evaluate(()=>Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0));
    // a selector: the shot starts at that element's top (a section further down the page); not found: from the top
    let y0=0,missing=false;
    if(o.selector){const y=await page.evaluate(s=>{try{const e=document.querySelector(s);return e?Math.max(0,Math.round(e.getBoundingClientRect().top+scrollY)):null;}catch(err){return null;}},o.selector);
      if(y==null)missing=true;else y0=Math.min(y,Math.max(0,h-t.height));}
    const buf=await page.screenshot({type:'jpeg',quality:85,fullPage:true,clip:{x:0,y:y0,width:t.width,height:Math.max(t.height,Math.min(h-y0,maxH))}});
    return {shot:'data:image/jpeg;base64,'+buf.toString('base64'),finalUrl:page.url(),missing};
  }finally{await ctx.close();}
}

export default function capturePlugin(){
  return {name:'mockup-capture',apply:'serve',
    configureServer(server){
      server.httpServer?.on('close',()=>{if(browserP)browserP.then(b=>b.close()).catch(()=>{});closeRecordSessions();});
      // /api/record/ws: the recording session's socket, upgraded on Vite's own http server (Vite's HMR socket only takes
      // the 'vite-hmr' protocol). The 'ws' server class comes bundled with Playwright (its exported utilsBundle).
      import('playwright-core/lib/utilsBundle').then(({wsServer:WebSocketServer})=>{
        const wss=new WebSocketServer({noServer:true});
        server.httpServer?.on('upgrade',(req,socket,head)=>{
          if(!String(req.url||'').startsWith('/api/record/ws'))return;
          wss.handleUpgrade(req,socket,head,ws=>onRecordSocket(ws));
        });
      }).catch(e=>console.warn('[record] WebSocket sunucusu kurulamadı:',e.message));
      server.middlewares.use('/api/capture',async(req,res)=>{
        // GET /api/capture/ping: lets the page know it can capture (ui/capture.js captureAvailable)
        if(req.method==='GET'&&String(req.url||'').startsWith('/ping'))return send(res,200,{ok:true});
        if(req.method!=='POST')return send(res,405,{error:'POST bekleniyor'});
        let body;try{body=await readJson(req);}catch(e){return send(res,400,{error:'Geçersiz istek'});}
        let url;try{url=new URL(String(body.url||'').trim());}catch(e){return send(res,400,{error:'Geçersiz adres'});}
        if(!/^https?:$/.test(url.protocol))return send(res,400,{error:'Yalnızca http ve https adresleri'});
        const targets=(Array.isArray(body.targets)?body.targets:[]).slice(0,MAX_TARGETS).filter(t=>t&&t.id&&t.width>=200&&t.width<=4000&&t.height>=200&&t.height<=4000);
        if(!targets.length)return send(res,400,{error:'Hedef yok'});
        const o={wait:Math.max(0,Math.min(10,+body.wait||0)),dark:!!body.dark,selector:String(body.selector||'').trim().slice(0,200)};
        const shots={};let finalUrl=url.href,missing=false;
        try{for(const t of targets){const r=await capture(url.href,t,o);shots[t.id]=r.shot;finalUrl=r.finalUrl;missing=missing||r.missing;}}
        catch(e){return send(res,502,{error:'Sayfa açılamadı ('+reason(e)+')'});}
        send(res,200,{shots,finalUrl,missing});
      });
    }};
}
