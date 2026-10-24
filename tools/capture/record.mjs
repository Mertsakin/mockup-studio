// Dev-server only: the interactive screen recording behind the studio's "Ekran kaydı" lightbox (src/ui/record.js).
// One WebSocket session at /api/record/ws drives one page in the user's installed Chrome (channel 'chrome', else
// Playwright's Chromium) opened with a persistent profile (~/.mockup-studio/record-profile: logins, cookies and solved
// bot checks survive between sessions) at the device's viewport. The page's picture streams to the client as CDP
// screencast frames (JPEG, binary messages: 8 bytes of float64 timestamp in ms + the JPEG), and the client's mouse /
// keyboard goes back through Playwright's input API, so the site is used from inside the studio like a local remote
// desktop. The recording itself happens on the client (it keeps the frames it receives); the server only streams.
//
// Client -> server (JSON text): open {url, viewport:{width,height}, dpr, mobile, dark} · navigate {url} · back · reload ·
//   input {type: move|down|up|wheel|key, …} · text {text} · scroll {dur} · shot {full, selector, targets:[{id, width,
//   height, mobile, dpr}]} · openWindow · close
// Server -> client (JSON text): ready {headed} · nav {url, title, loading, canBack} · status {text} · error {message} ·
//   shot {shots: {id: data URL}, url, missing} · window {open} · closed
//
// shot: screenshots of the page as it is (logged in, banners closed, scrolled where the user left it) for the device
// screens, one per target viewport: the page is re-laid out at each target's width through CDP's device metrics
// override (the context's own viewport and scale come back afterwards), at the capture's own device scale factor
// (up to DPR_MAX, sharper than the stream), either the visible area or the whole page from the top (or from the
// selector's element) like the capture endpoint.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {DPR_MAX,MAX_H,MAX_PX_H,MAX_PX_W,mobileUA,reason} from '../../services/capture/shared.mjs';

const PROFILE=join(homedir(),'.mockup-studio','record-profile');
const NAV_TIMEOUT=30000,SEND_LIMIT=12e6;  // bytes of frames allowed to queue on the socket before frames are dropped
// Screencast frames come at the window's physical size, not the emulated one, so the device scale factor is forced on
// the window too. Sharpness is capped for the stream and the memory the client keeps: REC_DPR_MAX and REC_PX (pixels
// per frame): a phone records at 3× (1170 px wide), a monitor at ~1.25× (2400 px wide).
const REC_DPR_MAX=3,REC_PX=3.2e6;
export const recordDpr=(w,h,want)=>Math.max(1,Math.floor(Math.min(DPR_MAX,REC_DPR_MAX,MAX_PX_W/w,Math.sqrt(REC_PX/(w*h)),Math.max(1,+want||1))*4)/4);
const MODS={Meta:'meta',Control:'ctrl',Alt:'alt',Shift:'shift'};  // key name -> flag in the client's key messages
let current=null;  // the one active session
let closing=Promise.resolve();  // the previous session's teardown: a new launch waits for it (one Chrome per profile folder)
const LOCKED=/SingletonLock|profile.*in use|ProcessSingleton/i;

class RecordSession{
  constructor(ws){
    this.ws=ws;this.ctx=null;this.page=null;this.cdp=null;this.headed=false;this.opts=null;this.closed=false;this.url='';this.mods=new Set();this.shooting=false;
    ws.on('message',(data,isBinary)=>{if(isBinary)return;let m;try{m=JSON.parse(String(data));}catch(e){return;}this.handle(m).catch(e=>this.fail(e));});
    ws.on('close',()=>this.close());ws.on('error',()=>this.close());
  }
  send(obj){if(this.ws.readyState===1)this.ws.send(JSON.stringify(obj));}
  fail(e){console.warn('[record]',e);this.send({type:'error',message:reason(e)});}
  async handle(m){
    switch(m.type){
      case 'open':return this.open(m);
      case 'navigate':return this.goto(m.url);
      case 'back':if(this.page)await this.page.goBack({waitUntil:'commit',timeout:NAV_TIMEOUT}).catch(e=>this.fail(e));return;
      case 'reload':if(this.page)await this.page.reload({waitUntil:'commit',timeout:NAV_TIMEOUT}).catch(e=>this.fail(e));return;
      case 'input':return this.input(m);
      case 'text':if(this.page&&typeof m.text==='string'&&m.text)await this.page.keyboard.insertText(m.text);return;
      case 'scroll':return this.autoScroll(+m.dur||8);
      case 'shot':return this.shot(m);
      case 'openWindow':return this.openWindow();
      case 'close':return this.close();
    }
  }
  /* ---------- the browser */
  async launch(headed){
    mkdirSync(PROFILE,{recursive:true});
    const o=this.opts,base={headless:!headed,viewport:{width:o.width,height:o.height},deviceScaleFactor:o.dpr,isMobile:o.mobile,hasTouch:o.mobile,
      userAgent:mobileUA(o.mobile,o.width),locale:'tr-TR',colorScheme:o.dark?'dark':'light',ignoreDefaultArgs:['--enable-automation'],
      args:['--disable-blink-features=AutomationControlled','--force-device-scale-factor='+o.dpr,'--hide-scrollbars']};
    // the user's Chrome keeps logins less suspicious than a bare Chromium; Playwright's Chromium is the fallback.
    // The profile's lock may outlive the previous session's close by a moment (a shot, then the window opened again):
    // wait for that teardown, and try again a few times while the lock is still there.
    await closing.catch(()=>{});
    let ctx;
    for(let i=0;;i++){
      try{ctx=await chromium.launchPersistentContext(PROFILE,{...base,channel:'chrome'});break;}
      catch(e){
        if(LOCKED.test(String(e&&e.message))){
          if(i<8){await new Promise(r=>setTimeout(r,500));continue;}
          throw new Error('Kayıt profili başka bir Chrome tarafından kullanılıyor; onu kapat ve yeniden dene',{cause:e});
        }
        ctx=await chromium.launchPersistentContext(PROFILE,{...base,channel:'chromium'});break;
      }
    }
    this.ctx=ctx;this.headed=headed;this.mods.clear();
    const page=ctx.pages()[0]||await ctx.newPage();this.page=page;
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    page.on('dialog',d=>d.dismiss().catch(()=>{}));
    // links that open a new window: follow them in the one page instead
    ctx.on('page',p=>{if(p===this.page)return;const follow=f=>{if(f!==p.mainFrame()||f.url()==='about:blank')return;const u=f.url();p.close().catch(()=>{});this.goto(u);};
      p.on('framenavigated',follow);setTimeout(()=>{if(!p.isClosed()&&p.url()==='about:blank')p.close().catch(()=>{});},5000);});
    page.on('framenavigated',f=>{if(f===page.mainFrame())this.nav(true);});
    page.on('load',()=>this.nav(false));
    page.on('domcontentloaded',()=>this.nav(false));
    page.on('close',()=>{if(!this.closed&&this.page===page){this.send({type:'error',message:'Sayfa kapandı'});this.close();}});
    await this.startCast();
  }
  async startCast(){
    const o=this.opts,cdp=await this.ctx.newCDPSession(this.page);this.cdp=cdp;
    cdp.on('Page.screencastFrame',({data,metadata,sessionId})=>{
      cdp.send('Page.screencastFrameAck',{sessionId}).catch(()=>{});
      if(this.ws.readyState!==1||this.ws.bufferedAmount>SEND_LIMIT)return;  // the client is behind: skip the frame
      const jpeg=Buffer.from(data,'base64'),head=Buffer.alloc(8);
      head.writeDoubleLE(metadata&&metadata.timestamp?metadata.timestamp*1000:Date.now(),0);
      this.ws.send(Buffer.concat([head,jpeg]),{binary:true});
    });
    await cdp.send('Page.startScreencast',{format:'jpeg',quality:80,maxWidth:Math.round(o.width*o.dpr),maxHeight:Math.round(o.height*o.dpr),everyNthFrame:1});
  }
  nav(loading){
    const p=this.page;if(!p||this.closed)return;
    this.url=p.url();
    this.send({type:'nav',url:this.url,loading,title:loading?'':''});
    if(!loading)p.title().then(t=>this.send({type:'nav',url:p.url(),loading:false,title:t})).catch(()=>{});
  }
  async open(m){
    if(this.ctx)return;
    const vp=m.viewport||{},width=Math.round(Math.min(4000,Math.max(200,+vp.width||390))),height=Math.round(Math.min(4000,Math.max(200,+vp.height||844)));
    const dpr=recordDpr(width,height,+m.dpr||2);
    this.opts={width,height,dpr,mobile:!!m.mobile,dark:!!m.dark};
    this.send({type:'status',text:'Chrome başlatılıyor…'});
    await this.launch(false);
    this.send({type:'ready',headed:false,dpr});
    if(m.url)await this.goto(m.url);
  }
  async goto(raw){
    if(!this.page)return;
    let url;try{url=new URL(String(raw||'').trim());}catch(e){this.send({type:'error',message:'Geçersiz adres'});return;}
    if(!/^https?:$/.test(url.protocol)){this.send({type:'error',message:'Yalnızca http ve https adresleri'});return;}
    try{await this.page.goto(url.href,{waitUntil:'commit',timeout:NAV_TIMEOUT});}
    catch(e){if(!this.closed)this.send({type:'error',message:'Sayfa açılamadı ('+reason(e)+')'});this.nav(false);}
  }
  /* ---------- input: CSS px of the viewport; Playwright maps keys and tracks the modifiers itself */
  // Playwright's modifier state follows its own down/up calls; the client's flags say what is really held
  async syncMods(m){
    for(const [k,f] of Object.entries(MODS)){const want=!!m[f],has=this.mods.has(k);
      if(want&&!has){await this.page.keyboard.down(k);this.mods.add(k);}else if(!want&&has){await this.page.keyboard.up(k);this.mods.delete(k);}}
  }
  async input(m){
    const p=this.page;if(!p)return;
    const x=+m.x||0,y=+m.y||0,btn=m.button===2?'right':m.button===1?'middle':'left';
    try{
      switch(m.kind){
        case 'move':await p.mouse.move(x,y);break;
        case 'down':await p.mouse.move(x,y);await p.mouse.down({button:btn,clickCount:Math.max(1,Math.min(3,+m.clicks||1))});break;
        case 'up':await p.mouse.move(x,y);await p.mouse.up({button:btn,clickCount:Math.max(1,Math.min(3,+m.clicks||1))});break;
        case 'wheel':await p.mouse.move(x,y);await p.mouse.wheel(+m.dx||0,+m.dy||0);break;
        case 'key':{
          const key=String(m.key||'');if(!key||key==='Dead'||key==='Unidentified'||key==='Process')return;
          if(MODS[key]){if(m.down)this.mods.add(key);else this.mods.delete(key);}
          else await this.syncMods(m);  // the modifiers the client holds (a ⌘ pressed before the lightbox had focus, say)
          try{if(m.down)await p.keyboard.down(key);else await p.keyboard.up(key);}
          catch(e){
            // a character Playwright's US layout does not know (ş, ğ, €…): type it as text on the way down
            if(m.down&&[...key].length===1&&!m.ctrl&&!m.meta)await p.keyboard.insertText(key);
          }
          break;}
        case 'release':await this.syncMods({});break;  // the lightbox lost focus: no modifier stays down
      }
    }catch(e){if(!this.closed&&!/closed|Target/.test(String(e.message)))console.warn('[record] input',e.message);}
  }
  // smooth scroll to the end of the page in dur seconds (an eased ramp); the user's own wheel cancels it. The page's
  // own CSS smooth scrolling is switched off meanwhile: it would animate every step and lag behind the ramp.
  async autoScroll(dur){
    const p=this.page;if(!p)return;
    await p.evaluate(dur=>new Promise(res=>{
      const el=document.scrollingElement||document.documentElement,y0=el.scrollTop,y1=Math.max(0,el.scrollHeight-innerHeight);
      if(y1<=y0){res();return;}
      const styled=[document.documentElement,document.body].filter(Boolean),prev=styled.map(e=>e.style.scrollBehavior);
      styled.forEach(e=>{e.style.scrollBehavior='auto';});
      let stop=false;const cancel=()=>{stop=true;};addEventListener('wheel',cancel,{once:true});addEventListener('keydown',cancel,{once:true});
      const fin=()=>{styled.forEach((e,i)=>{e.style.scrollBehavior=prev[i];});res();};
      const t0=performance.now(),ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
      const step=()=>{if(stop){fin();return;}const u=Math.min(1,(performance.now()-t0)/(dur*1000));el.scrollTop=y0+(y1-y0)*ease(u);if(u<1)requestAnimationFrame(step);else fin();};
      requestAnimationFrame(step);
    }),Math.max(.5,Math.min(60,dur))).catch(()=>{});
  }
  /* ---------- screenshots of the live page for the device screens (see the top of the file) */
  async shot(m){
    const p=this.page,cdp=this.cdp;if(!p||!cdp||this.shooting)return;
    const o=this.opts,full=!!m.full,selector=String(m.selector||'').trim().slice(0,200);
    const targets=(Array.isArray(m.targets)?m.targets:[]).slice(0,12).filter(t=>t&&t.id&&t.width>=200&&t.width<=4000&&t.height>=200&&t.height<=4000);
    if(!targets.length){this.send({type:'error',message:'Hedef yok'});return;}
    this.shooting=true;
    const y0=await p.evaluate(()=>Math.round(scrollY)).catch(()=>0);
    const shots={};let missing=false;
    try{
      await cdp.send('Page.stopScreencast').catch(()=>{});  // the frames would come at the override's size meanwhile
      for(const t of targets){
        const dpr=Math.min(DPR_MAX,MAX_PX_W/t.width,Math.max(1,+t.dpr||o.dpr)),maxH=Math.min(MAX_H,Math.floor(MAX_PX_H/dpr)),mobile=!!t.mobile;
        this.send({type:'status',text:'Ekran görüntüsü alınıyor…'+(targets.length>1?' ('+t.width+' px)':'')});
        // the page laid out at the target's width and scale; the viewport keeps the target's height (as Playwright's
        // screenshots do: the clip is in document coordinates, captureBeyondViewport renders what lies below)
        await cdp.send('Emulation.setDeviceMetricsOverride',{width:t.width,height:t.height,deviceScaleFactor:dpr,mobile,screenWidth:t.width,screenHeight:t.height});
        await p.waitForTimeout(full?250:120);
        let top=0,height=t.height;
        if(full){
          // walk down so lazy content loads, like the capture endpoint; the shot starts at the top (or the selector)
          await p.evaluate(async max=>{const step=innerHeight*.8,end=Math.min(document.documentElement.scrollHeight,max);
            for(let y=0;y<end;y+=step){scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}scrollTo(0,0);},maxH).catch(()=>{});
          await p.waitForLoadState('networkidle',{timeout:3000}).catch(()=>{});
          await p.waitForTimeout(200);
          const h=await p.evaluate(()=>Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0)).catch(()=>t.height);
          if(selector){const y=await p.evaluate(s=>{try{const e=document.querySelector(s);return e?Math.max(0,Math.round(e.getBoundingClientRect().top+scrollY)):null;}catch(err){return null;}},selector).catch(()=>null);
            if(y==null)missing=true;else top=Math.min(y,Math.max(0,h-t.height));}
          height=Math.max(t.height,Math.min(h-top,maxH));
        }else{
          const lm=await cdp.send('Page.getLayoutMetrics').catch(()=>null);
          top=Math.round(lm&&lm.visualViewport?lm.visualViewport.pageY:await p.evaluate(()=>scrollY).catch(()=>0));
        }
        const r=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:85,captureBeyondViewport:full,clip:{x:0,y:top,width:t.width,height,scale:1}});
        shots[t.id]='data:image/jpeg;base64,'+r.data;
      }
    }catch(e){this.send({type:'error',message:'Ekran görüntüsü alınamadı ('+reason(e)+')'});}
    finally{
      // the context's own emulation comes back (Playwright re-sends it), then the user's scroll position and the stream
      await cdp.send('Emulation.clearDeviceMetricsOverride').catch(()=>{});
      await p.setViewportSize({width:o.width,height:o.height}).catch(()=>{});
      await p.evaluate(y=>scrollTo(0,y),y0).catch(()=>{});
      await cdp.send('Page.startScreencast',{format:'jpeg',quality:80,maxWidth:Math.round(o.width*o.dpr),maxHeight:Math.round(o.height*o.dpr),everyNthFrame:1}).catch(()=>{});
      this.shooting=false;
    }
    if(Object.keys(shots).length)this.send({type:'shot',shots,url:p.url(),missing});
    this.send({type:'status',text:''});
  }
  /* ---------- a titled window with the same profile (one Chrome per profile folder: the headless one closes first) */
  async openWindow(){
    if(!this.ctx||this.headed)return;
    const url=this.url;
    this.send({type:'status',text:'Pencere açılıyor…'});
    await this.teardown();
    await this.launch(true);
    this.send({type:'window',open:true});
    if(url&&url!=='about:blank')await this.goto(url);
  }
  async teardown(){
    const ctx=this.ctx;this.ctx=null;this.page=null;this.cdp=null;
    if(ctx){const p=ctx.close().catch(()=>{});closing=p;await p;}
  }
  async close(){
    if(this.closed)return;this.closed=true;
    if(current===this)current=null;
    await this.teardown();
    this.send({type:'closed'});
    try{this.ws.close();}catch(e){/* gone */}
  }
}

export function onRecordSocket(ws){
  if(current){current.send({type:'error',message:'Başka bir kayıt oturumu açıldı; bu oturum kapatıldı'});current.close();}
  current=new RecordSession(ws);
}
export async function closeRecordSessions(){if(current)await current.close();}
