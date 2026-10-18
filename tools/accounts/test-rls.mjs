// Row level security and the account functions against the local Supabase (supabase/migrations/): two users, each
// may see and change only their own rows; quota, project limit and the optimistic lock. node tools/accounts/test-rls.mjs
import {createClient} from '@supabase/supabase-js';
import {NODE_OPTS,local} from './local.mjs';

const L=local(),admin=createClient(L.url,L.service,NODE_OPTS);
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};
const hex=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
async function user(tag){
  const email=`test-${tag}-${Date.now()}@shotlight.test`,password='test-'+crypto.randomUUID();
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Test '+tag}});
  if(error)throw error;
  const c=createClient(L.url,L.anon,NODE_OPTS);
  const s=await c.auth.signInWithPassword({email,password});if(s.error)throw s.error;
  return {c,id:data.user.id};
}
const A=await user('a'),B=await user('b');
try{
  console.log('profiles');
  const pa=await A.c.from('profiles').select('*');
  ok(pa.data?.length===1&&pa.data[0].id===A.id&&pa.data[0].name==='Test a','A sees only their own profile, name from the provider metadata');
  const up=await A.c.from('profiles').update({plan:'pro'}).eq('id',A.id);
  ok(!!up.error,'A cannot change their plan ('+(up.error?.code||'no error')+')');
  const sb=await A.c.from('profiles').update({storage_bytes:0}).eq('id',A.id);
  ok(!!sb.error,'A cannot change storage_bytes');
  const nm=await A.c.from('profiles').update({name:'Ayşe'}).eq('id',A.id).select();
  ok(nm.data?.[0]?.name==='Ayşe','A can rename themself');

  console.log('projects');
  const p=await A.c.from('projects').insert({name:'Lansman'}).select().single();
  ok(!p.error&&p.data.owner===A.id&&p.data.version===0,'A creates a project (owner defaults to A)');
  const pid=p.data.id;
  ok(((await B.c.from('projects').select('*')).data||[]).length===0,'B does not see A\'s project');
  const bu=await B.c.from('projects').update({name:'x'}).eq('id',pid).select();
  ok(!bu.data?.length,'B cannot rename A\'s project');
  const bd=await B.c.from('projects').delete().eq('id',pid).select();
  ok(!bd.data?.length,'B cannot delete A\'s project');
  const bi=await B.c.from('projects').insert({name:'stolen',owner:A.id});
  ok(!!bi.error,'B cannot create a project in A\'s name');
  const av=await A.c.from('projects').update({version:99}).eq('id',pid);
  ok(!!av.error,'A cannot set the version directly (only save_project)');

  console.log('media and quota');
  const h1=hex(),h2=hex();
  ok((await A.c.rpc('add_media',{p_hash:h1,p_bytes:1000,p_type:'image/png'})).data===true,'add_media records a new file');
  ok((await A.c.rpc('add_media',{p_hash:h1,p_bytes:1000,p_type:'image/png'})).data===false,'the same file again is free (content addressed)');
  ok((await A.c.from('profiles').select('storage_bytes').single()).data.storage_bytes===1000,'storage_bytes counts it once');
  const big=await A.c.rpc('add_media',{p_hash:h2,p_bytes:3*2**30,p_type:'video/mp4'});
  ok(big.error&&/quota/.test(big.error.message),'over 2 GB: quota error');
  const mi=await A.c.from('media').insert({owner:A.id,hash:h2,bytes:1,type:'image/png'});
  ok(!!mi.error,'A cannot write media rows directly (no quota bypass)');
  ok(((await B.c.from('media').select('*')).data||[]).length===0,'B does not see A\'s media');

  console.log('save_project');
  const s1=await A.c.rpc('save_project',{p_id:pid,p_expected:0,p_doc_key:'d1',p_bytes:2000,p_boards:2,p_hashes:[h1]});
  ok(s1.data===1,'save at version 0 -> 1');
  const s2=await A.c.rpc('save_project',{p_id:pid,p_expected:0,p_doc_key:'d2',p_bytes:2000,p_boards:2,p_hashes:[h1]});
  ok(s2.data===-1,'a second save still expecting 0: conflict (-1)');
  const pm=await A.c.from('project_media').select('*').eq('project',pid);
  ok(pm.data?.length===1&&pm.data[0].hash===h1,'the project lists its media');
  const sb2=await B.c.rpc('save_project',{p_id:pid,p_expected:1,p_doc_key:'evil',p_bytes:1,p_boards:1,p_hashes:[]});
  ok(sb2.error&&/not_found/.test(sb2.error.message),'B cannot save A\'s project (not found)');
  ok((await A.c.from('projects').select('doc_key,version').eq('id',pid).single()).data.doc_key==='d1','A\'s document unchanged');

  console.log('project limit');
  await admin.from('plan_limits').update({max_projects:2}).eq('plan','beta');
  await A.c.from('projects').insert({name:'2'});
  const third=await A.c.from('projects').insert({name:'3'});
  ok(third.error&&/project_limit/.test(third.error.message),'over the plan\'s project count: project_limit');
  await admin.from('plan_limits').update({max_projects:100}).eq('plan','beta');

  console.log('clean-up functions');
  const om=await A.c.rpc('orphan_media',{});
  ok(!!om.error,'orphan_media is not callable by users');
  const fm=await A.c.rpc('forget_media',{p_owner:A.id,p_hash:h1});
  ok(!!fm.error,'forget_media is not callable by users');
}finally{
  await admin.auth.admin.deleteUser(A.id);await admin.auth.admin.deleteUser(B.id);
  const left=await admin.from('profiles').select('id').in('id',[A.id,B.id]);
  ok((left.data||[]).length===0,'deleting the users removes their profiles, projects and media (cascade)');
}
console.log(fails?fails+' failed':'all passed');process.exit(fails?1:0);
