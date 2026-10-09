// Dev-server only: full-page website screenshots for the device screens.
// POST /api/capture {url, targets:[{id, width, height, mobile, dpr}]} -> {shots:{id: dataURL}, finalUrl}
// Each target is rendered at its own viewport (responsive layout), lazy content is scrolled into view, cookie /
// consent overlays are removed, and the page is captured down to MAX_H CSS px. Not part of the production build:
// a static deployment needs a separate capture service.
import {chromium} from 'playwright';

const MAX_H=8000,MAX_TARGETS=12,NAV_TIMEOUT=30000;
const UA_PHONE='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const UA_TABLET='Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
let browserP=null;
const browser=()=>browserP||(browserP=chromium.launch());

function readJson(req){return new Promise((res,rej)=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e5)req.destroy();});req.on('end',()=>{try{res(JSON.parse(b));}catch(e){rej(e);}});req.on('error',rej);});}
// short, user-facing reasons for common navigation failures
function reason(e){const m=String(e&&e.message||e);
  if(/ERR_NAME_NOT_RESOLVED/.test(m))return 'adres bulunamadı';if(/Timeout|ERR_TIMED_OUT/.test(m))return 'sayfa zamanında yüklenmedi';
  if(/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/.test(m))return 'bağlantı kurulamadı';
  if(/ERR_CERT|SSL/.test(m))return 'güvenlik sertifikası geçersiz';if(/ERR_INTERNET_DISCONNECTED/.test(m))return 'internet bağlantısı yok';
  return m.split('\n')[0];}
const send=(res,code,obj)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(obj));};

async function capture(url,t){
  const b=await browser(),mobile=!!t.mobile;
  const ctx=await b.newContext({viewport:{width:t.width,height:t.height},deviceScaleFactor:t.dpr||2,isMobile:mobile,hasTouch:mobile,
    userAgent:mobile?(t.width>600?UA_TABLET:UA_PHONE):undefined,locale:'tr-TR'});
  try{
    const page=await ctx.newPage();
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:NAV_TIMEOUT});
    await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});
    // walk down the page so lazy images / sections load, then back to the top
    await page.evaluate(async max=>{const step=innerHeight*.8,end=Math.min(document.documentElement.scrollHeight,max);
      for(let y=0;y<end;y+=step){scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}scrollTo(0,0);},MAX_H);
    await page.waitForLoadState('networkidle',{timeout:4000}).catch(()=>{});
    // cookie / consent banners: fixed or sticky elements whose id / class / label says so
    await page.evaluate(()=>{const re=/cookie|consent|gdpr|çerez|kvkk/i;
      for(const el of document.querySelectorAll('body *')){const cs=getComputedStyle(el);if(cs.position!=='fixed'&&cs.position!=='sticky')continue;
        const cls=typeof el.className==='string'?el.className:(el.className&&el.className.baseVal)||'';
        if(re.test((el.id||'')+' '+cls+' '+(el.getAttribute('aria-label')||'')))el.remove();}});
    await page.waitForTimeout(300);
    const h=await page.evaluate(()=>Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0));
    const buf=await page.screenshot({type:'jpeg',quality:85,fullPage:true,clip:{x:0,y:0,width:t.width,height:Math.max(t.height,Math.min(h,MAX_H))}});
    return {shot:'data:image/jpeg;base64,'+buf.toString('base64'),finalUrl:page.url()};
  }finally{await ctx.close();}
}

export default function capturePlugin(){
  return {name:'mockup-capture',apply:'serve',
    configureServer(server){
      server.httpServer?.on('close',()=>{if(browserP)browserP.then(b=>b.close()).catch(()=>{});});
      server.middlewares.use('/api/capture',async(req,res)=>{
        if(req.method!=='POST')return send(res,405,{error:'POST bekleniyor'});
        let body;try{body=await readJson(req);}catch(e){return send(res,400,{error:'Geçersiz istek'});}
        let url;try{url=new URL(String(body.url||'').trim());}catch(e){return send(res,400,{error:'Geçersiz adres'});}
        if(!/^https?:$/.test(url.protocol))return send(res,400,{error:'Yalnızca http ve https adresleri'});
        const targets=(Array.isArray(body.targets)?body.targets:[]).slice(0,MAX_TARGETS).filter(t=>t&&t.id&&t.width>=200&&t.width<=4000&&t.height>=200&&t.height<=4000);
        if(!targets.length)return send(res,400,{error:'Hedef yok'});
        const shots={};let finalUrl=url.href;
        try{for(const t of targets){const r=await capture(url.href,t);shots[t.id]=r.shot;finalUrl=r.finalUrl;}}
        catch(e){return send(res,502,{error:'Sayfa açılamadı ('+reason(e)+')'});}
        send(res,200,{shots,finalUrl});
      });
    }};
}
