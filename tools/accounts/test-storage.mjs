// The storage Worker (services/storage/) against the local Supabase and a local R2 (wrangler dev --local): uploads
// with SHA-256 check, deduplication, multipart, quota, project files, isolation between users, account deletion.
// node tools/accounts/test-storage.mjs   (starts the Worker itself on port 8787 unless STORAGE_URL is given)
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {NODE_OPTS,local} from './local.mjs';

const L=local(),admin=createClient(L.url,L.service,NODE_OPTS),W=process.env.STORAGE_URL||'http://127.0.0.1:8787';
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const sha=b=>createHash('sha256').update(b).digest('hex');
const rnd=n=>Buffer.from(crypto.getRandomValues(new Uint8Array(n)).buffer);
// a large random buffer in chunks (getRandomValues takes at most 64 KB)
const big=n=>{const b=Buffer.alloc(n);for(let o=0;o<n;o+=65536)b.set(rnd(Math.min(65536,n-o)),o);return b;};

let worker=null;
if(!process.env.STORAGE_URL){
  worker=spawn('npx',['wrangler','dev','-c','services/storage/wrangler.toml','--local','--port','8787'],{stdio:['ignore','pipe','pipe'],env:Object.assign({},process.env,{WRANGLER_SEND_METRICS:'false'})});
  let log='';worker.stdout.on('data',d=>{log+=d;});worker.stderr.on('data',d=>{log+=d;});
  for(let i=0;;i++){try{if((await fetch(W+'/ping')).ok)break;}catch(e){/* not yet */}
    if(i>90){console.error(log);throw new Error('Worker did not start');}await new Promise(r=>setTimeout(r,500));}
}
async function user(tag){
  const email=`st-${tag}-${Date.now()}@shotlight.test`,password='test-'+crypto.randomUUID();
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;
  const c=createClient(L.url,L.anon,NODE_OPTS),s=await c.auth.signInWithPassword({email,password});if(s.error)throw s.error;
  const tok='Bearer '+s.data.session.access_token;
  const call=(path,init={})=>fetch(W+path,Object.assign({},init,{headers:Object.assign({Authorization:tok},init.headers||{})}));
  return {c,id:data.user.id,call};
}
const A=await user('a'),B=await user('b');
try{
  console.log('auth');
  ok((await fetch(W+'/media/check',{method:'POST',body:'{}'})).status===401,'no token: 401');
  ok((await fetch(W+'/media/check',{method:'POST',headers:{Authorization:'Bearer nope'},body:'{}'})).status===401,'bad token: 401');

  console.log('single upload');
  const png=rnd(4096),h=sha(png);
  const ck=await (await A.call('/media/check',{method:'POST',body:JSON.stringify({hashes:[h]})})).json();
  ok(ck.missing?.[0]===h,'check: a new file is missing');
  const wrong=await A.call('/media/'+sha(rnd(10)),{method:'PUT',headers:{'Content-Type':'image/png'},body:png});
  ok(wrong.status===400,'a body that does not match its hash is refused ('+wrong.status+')');
  const put=await A.call('/media/'+h,{method:'PUT',headers:{'Content-Type':'image/png'},body:png});
  const pj=await put.json();ok(put.ok&&pj.new===true,'upload stores and counts it');
  const again=await (await A.call('/media/'+h,{method:'PUT',headers:{'Content-Type':'image/png'},body:png})).json();
  ok(again.new===false,'the same file again: not counted twice');
  ok((await A.c.from('profiles').select('storage_bytes').single()).data.storage_bytes===4096,'storage_bytes = 4096');
  const get=await A.call('/media/'+h);
  ok(get.ok&&Buffer.from(await get.arrayBuffer()).equals(png)&&/immutable/.test(get.headers.get('cache-control')),'A reads it back (immutable cache)');
  ok((await B.call('/media/'+h)).status===404,'B cannot read A\'s file');
  const exe=await A.call('/media/'+sha(png.subarray(1)),{method:'PUT',headers:{'Content-Type':'application/x-msdownload'},body:png.subarray(1)});
  ok(exe.status===400,'an unknown file type is refused');

  console.log('multipart (6 MB + 1 MB)');
  const vid=big(7*2**20),hv=sha(vid);
  const mpu=await (await A.call('/media/'+hv+'/uploads',{method:'POST',body:JSON.stringify({type:'video/mp4',bytes:vid.length})})).json();
  ok(!!mpu.id,'multipart upload started');
  const p1=await (await A.call(`/media/${hv}/uploads/${encodeURIComponent(mpu.id)}/1`,{method:'PUT',body:vid.subarray(0,6*2**20)})).json();
  const p2=await (await A.call(`/media/${hv}/uploads/${encodeURIComponent(mpu.id)}/2`,{method:'PUT',body:vid.subarray(6*2**20)})).json();
  const done=await A.call(`/media/${hv}/uploads/${encodeURIComponent(mpu.id)}/complete`,{method:'POST',body:JSON.stringify({parts:[{n:1,etag:p1.etag},{n:2,etag:p2.etag}],type:'video/mp4',bytes:vid.length})});
  ok(done.ok&&(await done.json()).new===true,'multipart completes and counts');
  const back=Buffer.from(await (await A.call('/media/'+hv)).arrayBuffer());
  ok(back.equals(vid),'the video reads back byte for byte');

  console.log('quota');
  await admin.from('plan_limits').update({max_bytes:8*2**20}).eq('plan','beta');
  const over=big(2*2**20),ho=sha(over);
  const q=await A.call('/media/'+ho,{method:'PUT',headers:{'Content-Type':'image/png'},body:over});
  ok(q.status===413,'over the quota: 413 ('+q.status+')');
  const gone=await (await A.call('/media/check',{method:'POST',body:JSON.stringify({hashes:[ho]})})).json();
  ok(gone.missing?.[0]===ho,'and the object was removed again');
  await admin.from('plan_limits').update({max_bytes:2147483648}).eq('plan','beta');

  console.log('project files');
  const pr=(await A.c.from('projects').insert({name:'Depolama testi'}).select().single()).data;
  const doc=Buffer.from(JSON.stringify({v:2,boards:[]}));
  ok((await A.call(`/projects/${pr.id}/doc/1.json`,{method:'PUT',body:doc})).ok,'A stores a document of their project');
  ok((await (await A.call(`/projects/${pr.id}/doc/1.json`)).text())===doc.toString(),'and reads it back');
  ok((await B.call(`/projects/${pr.id}/doc/1.json`,{method:'PUT',body:doc})).status===404,'B cannot write into A\'s project');
  ok((await B.call(`/projects/${pr.id}/doc/1.json`)).status===404,'B cannot read A\'s document');
  for(let v=2;v<=13;v++)await A.call(`/projects/${pr.id}/doc/${v}.json`,{method:'PUT',body:doc});
  ok((await A.call(`/projects/${pr.id}/doc/3.json`)).status===404&&(await A.call(`/projects/${pr.id}/doc/4.json`)).ok,'only the latest 10 versions are kept');
  ok((await A.call(`/projects/${pr.id}/thumb.webp`,{method:'PUT',body:big(3*2**20)})).status===413,'a thumbnail over 2 MB is refused');

  console.log('account deletion');
  const del=await A.call('/account',{method:'DELETE'});const dj=await del.json();
  ok(del.ok&&dj.objects>=4,'DELETE /account removes the user\'s objects ('+dj.objects+')');
  const prof=await admin.from('profiles').select('id').eq('id',A.id);
  ok((prof.data||[]).length===0,'and the user with their rows');
  ok((await A.call('/media/'+h)).status===401,'the old token no longer works');
}finally{
  await admin.auth.admin.deleteUser(A.id).catch(()=>{});await admin.auth.admin.deleteUser(B.id).catch(()=>{});
  if(worker)worker.kill();
}
console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
