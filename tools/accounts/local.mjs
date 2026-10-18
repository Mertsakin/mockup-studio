// The local Supabase's addresses and keys (npx supabase status), for the account tests. Local demo values only:
// every local Supabase has the same ones; the hosted project's keys never go in a file.
import {execSync} from 'node:child_process';
let cached=null;
export function local(){
  if(cached)return cached;
  const out=execSync('npx supabase status -o json',{encoding:'utf8',stdio:['ignore','pipe','ignore']});
  const s=JSON.parse(out.slice(out.indexOf('{')));
  return cached={url:s.API_URL,anon:s.ANON_KEY,service:s.SERVICE_ROLE_KEY,mail:s.MAILPIT_URL||s.INBUCKET_URL,db:s.DB_URL};
}
// client options for scripts: no session storage; Node 20 has no WebSocket and the tests never use realtime
export const NODE_OPTS={auth:{persistSession:false},realtime:{transport:class{}}};
// the studio with accounts (npm run dev:accounts, the "accounts" preview): every page has its own address under /studio/
export const STUDIO_URL='http://localhost:5177/studio/';
/* Signs a test user in with a password, as the sign-in page would hand a session over: on /studio/login (src/login.js
   exposes its client in development), then on to the studio, which opens on a fresh sign-in (the home page, or
   where the page was sent away from). Resolves once the studio is up. */
export async function signInAt(p,email,password,studio=STUDIO_URL){
  if(!/\/login$/.test(new URL(p.url()).pathname))await p.goto(studio+'login');
  await p.waitForFunction(()=>window.__login,null,{timeout:60000});
  await p.evaluate(async([e,pw])=>{const c=await window.__login.client(),r=await c.auth.signInWithPassword({email:e,password:pw});if(r.error)throw new Error(r.error.message);},[email,password]);
  await p.waitForURL(u=>!/\/login$/.test(u.pathname),{timeout:30000});
  await p.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'),null,{timeout:60000});
}
