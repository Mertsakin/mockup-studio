// The capture service for the published studio (the dev server has its own endpoint: tools/capture/vite-plugin.mjs).
// Same request and answer as the dev endpoint, so the studio only changes the address (VITE_CAPTURE_URL):
//   GET  /ping     -> {ok: true}
//   POST /capture  {url, targets: [{id, width, height, mobile, dpr}], wait, dark, selector} -> {shots: {id: dataURL}, finalUrl, missing}
// Runs in a container (Dockerfile; Cloud Run in docs/lansman.md). Environment:
//   PORT              listening port (Cloud Run sets it; default 8080)
//   ALLOWED_ORIGINS   comma-separated origins that may call it (CORS), e.g. https://vitrin.app; empty: any (testing only)
//   DAILY_LIMIT       captures (targets) per client IP per day (default 60; the welcome card spends 4 per address)
//   MAX_CONCURRENT    captures running at once in this instance (default 2; more wait in line)
// Every request the page makes goes through the SSRF guard (guard.mjs). Logs one JSON line per request (no images).
import http from 'node:http';
import {chromium} from 'playwright';
import {capture,parseRequest} from './core.mjs';
import {allowed} from './guard.mjs';
import {reason} from './shared.mjs';

const PORT=+process.env.PORT||8080,MAX_TARGETS=6;
const ORIGINS=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const DAILY_LIMIT=+process.env.DAILY_LIMIT||60,MAX_CONCURRENT=+process.env.MAX_CONCURRENT||2;

// one browser for the instance, launched again if it dies; WebRTC may not reveal or reach local addresses
let browserP=null;
function browser(){
  if(!browserP)browserP=chromium.launch({args:['--webrtc-ip-handling-policy=disable_non_proxied_udp','--force-webrtc-ip-handling-policy']})
    .then(b=>{b.on('disconnected',()=>{browserP=null;});return b;}).catch(e=>{browserP=null;throw e;});
  return browserP;
}
// per-IP daily count (in memory: each instance counts its own; enough for the beta, a shared store comes with accounts)
const used=new Map();let day=new Date().toISOString().slice(0,10);
function spend(ip,n){
  const d=new Date().toISOString().slice(0,10);if(d!==day){day=d;used.clear();}
  const u=used.get(ip)||0;if(u+n>DAILY_LIMIT)return false;used.set(ip,u+n);return true;
}
// a small queue so a burst does not open more pages than the instance's memory holds
let running=0;const waiting=[];
async function slot(){if(running<MAX_CONCURRENT){running++;return;}await new Promise(r=>waiting.push(r));running++;}
function release(){running--;const n=waiting.shift();if(n)n();}

function readJson(req){return new Promise((res,rej)=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e5){req.destroy();rej(new Error('large'));}});
  req.on('end',()=>{try{res(JSON.parse(b));}catch(e){rej(e);}});req.on('error',rej);});}
function cors(req,res){
  const o=req.headers.origin;
  if(o&&(!ORIGINS.length||ORIGINS.includes(o))){res.setHeader('Access-Control-Allow-Origin',o);res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Max-Age','86400');}
  return !o||!ORIGINS.length||ORIGINS.includes(o);
}
const send=(res,code,obj)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(obj));};
const clientIp=req=>String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress||'?';
const log=o=>console.log(JSON.stringify(Object.assign({t:new Date().toISOString()},o)));

const server=http.createServer(async(req,res)=>{
  const ok=cors(req,res),path=(req.url||'').split('?')[0];
  if(req.method==='OPTIONS'){res.statusCode=ok?204:403;return res.end();}
  if(!ok)return send(res,403,{error:'Bu kaynaktan izin yok'});
  if(req.method==='GET'&&(path==='/ping'||path==='/capture/ping'))return send(res,200,{ok:true});
  if(req.method==='GET'&&path==='/healthz')return send(res,200,{ok:true,running,waiting:waiting.length});
  if(path!=='/capture')return send(res,404,{error:'Bulunamadı'});
  if(req.method!=='POST')return send(res,405,{error:'POST bekleniyor'});
  let body;try{body=await readJson(req);}catch(e){return send(res,400,{error:'Geçersiz istek'});}
  const q=parseRequest(body,MAX_TARGETS);if(q.error)return send(res,400,{error:q.error});
  const ip=clientIp(req),t0=Date.now();
  if(!await allowed(q.url.href)){log({ip,url:q.url.href,status:400,why:'private'});return send(res,400,{error:'Bu adres yakalanamaz (yerel ya da özel ağ)'});}
  if(!spend(ip,q.targets.length)){log({ip,url:q.url.href,status:429});return send(res,429,{error:'Bugünkü yakalama hakkın doldu, yarın yeniden dene. Bu arada ekran görüntüsü yükleyebilirsin.'});}
  const shots={};let finalUrl=q.url.href,missing=false;
  await slot();
  try{
    const b=await browser(),o=Object.assign({guard:allowed},q.o);
    for(const t of q.targets){const r=await capture(b,q.url.href,t,o);shots[t.id]=r.shot;finalUrl=r.finalUrl;missing=missing||r.missing;}
  }catch(e){
    log({ip,url:q.url.href,status:502,ms:Date.now()-t0,err:String(e&&e.message||e).split('\n')[0]});
    return send(res,502,{error:'Sayfa açılamadı ('+reason(e)+')'});
  }finally{release();}
  log({ip,url:q.url.href,status:200,targets:q.targets.length,ms:Date.now()-t0});
  send(res,200,{shots,finalUrl,missing});
});
server.requestTimeout=180000;
server.listen(PORT,()=>log({msg:'listening',port:PORT,origins:ORIGINS.length?ORIGINS:'any'}));
for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>{server.close();if(browserP)browserP.then(b=>b.close()).catch(()=>{}).finally(()=>process.exit(0));else process.exit(0);});
