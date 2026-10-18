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
