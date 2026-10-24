// The website capture itself, shared by the dev server's endpoint (tools/capture/vite-plugin.mjs) and the capture
// service for the published studio (server.mjs): one full-page screenshot per target at its own viewport and device
// scale factor, lazy content scrolled into view, cookie / consent overlays removed.
import {DPR_MAX,MAX_H,MAX_PX_H,MAX_PX_W,mobileUA} from './shared.mjs';

const NAV_TIMEOUT=30000;

/* A request body -> {url, targets, o} or {error} (user-facing). body: {url, targets: [{id, width, height, mobile, dpr}],
   wait, dark, selector}. */
function parseRequest(body,maxTargets){
  let url;try{url=new URL(String(body&&body.url||'').trim());}catch(e){return {error:'Geçersiz adres'};}
  if(!/^https?:$/.test(url.protocol))return {error:'Yalnızca http ve https adresleri'};
  const targets=(Array.isArray(body.targets)?body.targets:[]).slice(0,maxTargets).filter(t=>t&&t.id&&t.width>=200&&t.width<=4000&&t.height>=200&&t.height<=4000);
  if(!targets.length)return {error:'Hedef yok'};
  const o={wait:Math.max(0,Math.min(10,+body.wait||0)),dark:!!body.dark,selector:String(body.selector||'').trim().slice(0,200)};
  return {url,targets,o};
}

// b: a Playwright browser. o: {wait (s after load), dark (prefers-color-scheme), selector (start the shot at that
// element's top), guard (async url -> allowed: every request of the page is checked; the service's SSRF guard)}
async function capture(b,url,t,o={}){
  const mobile=!!t.mobile;
  const dpr=Math.min(DPR_MAX,MAX_PX_W/t.width,Math.max(1,+t.dpr||2)),maxH=Math.min(MAX_H,Math.floor(MAX_PX_H/dpr));
  const ctx=await b.newContext({viewport:{width:t.width,height:t.height},deviceScaleFactor:dpr,isMobile:mobile,hasTouch:mobile,
    userAgent:mobileUA(mobile,t.width),locale:'tr-TR',colorScheme:o.dark?'dark':'light'});
  try{
    // the service checks every request the page makes (redirects, frames, images, fetches) against private networks
    if(o.guard)await ctx.route('**/*',async route=>{if(await o.guard(route.request().url()))return route.continue();return route.abort('blockedbyclient');});
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


export {capture,parseRequest};
