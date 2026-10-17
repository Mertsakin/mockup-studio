// Dev-server only: full-page website screenshots for the device screens.
// POST /api/capture {url, targets:[{id, width, height, mobile, dpr}]} -> {shots:{id: dataURL}, finalUrl}
// Each target is rendered at its own viewport (responsive layout) at its own device scale factor (dpr: the client
// asks for enough pixels to fill the device's screen texture), lazy content is scrolled into view, cookie / consent
// overlays are removed, and the page is captured down to MAX_H CSS px or MAX_PX_H device px, whichever comes first.
// Not part of the production build: a deployment uses the capture service (services/capture/, same code: core.mjs).
// The interactive screen recording (/api/record/ws, record.mjs) shares the viewport helpers (shared.mjs).
import {chromium} from 'playwright';
import {capture,parseRequest} from '../../services/capture/core.mjs';
import {reason} from '../../services/capture/shared.mjs';
import {closeRecordSessions,onRecordSocket} from './record.mjs';

const MAX_TARGETS=12;
let browserP=null;
const browser=()=>browserP||(browserP=chromium.launch());

function readJson(req){return new Promise((res,rej)=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e5)req.destroy();});req.on('end',()=>{try{res(JSON.parse(b));}catch(e){rej(e);}});req.on('error',rej);});}
const send=(res,code,obj)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(obj));};

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
        const q=parseRequest(body,MAX_TARGETS);if(q.error)return send(res,400,{error:q.error});
        const {url,targets,o}=q,b=await browser();
        const shots={};let finalUrl=url.href,missing=false;
        try{for(const t of targets){const r=await capture(b,url.href,t,o);shots[t.id]=r.shot;finalUrl=r.finalUrl;missing=missing||r.missing;}}
        catch(e){return send(res,502,{error:'Sayfa açılamadı ('+reason(e)+')'});}
        send(res,200,{shots,finalUrl,missing});
      });
    }};
}
