/* The storage Worker: the studio's files in R2, each user under their own prefix (docs/uyelik.md §4).
     u/<user>/m/<sha256>                    media (images, screen videos, GLB): content addressed, never changes
     u/<user>/p/<project>/doc-<version>.json   a project's document (the last KEEP_DOCS versions are kept)
     u/<user>/p/<project>/thumb.webp         its thumbnail
   Every request carries the user's Supabase access token (Authorization: Bearer …); the Worker checks it with
   Supabase (/auth/v1/user, cached briefly) and only ever builds paths under that user's prefix. Database work goes
   through PostgREST with the same token, so row level security applies (supabase/migrations/): add_media counts a new
   file against the quota, a project's files are reachable only while its row is the user's.
   Routes:
     POST   /media/check                 {hashes}            -> {missing}
     PUT    /media/<hash>                body (≤ 90 MB)       -> {stored, new}     R2 verifies the SHA-256
     POST   /media/<hash>/uploads        {type, bytes}        -> {id}              multipart, for larger files
     PUT    /media/<hash>/uploads/<id>/<n>   body (≥ 5 MB but the last) -> {etag}
     POST   /media/<hash>/uploads/<id>/complete  {parts:[{n, etag}], type, bytes} -> {stored, new}
     DELETE /media/<hash>/uploads/<id>   abort
     GET    /media/<hash>
     PUT    /projects/<id>/doc/<version>.json   body (≤ 20 MB JSON)
     GET    /projects/<id>/doc/<version>.json
     PUT|GET /projects/<id>/thumb.webp   (≤ 2 MB)
     DELETE /account                     every object of the user, then their rows and the user (delete_account)
   Environment: BUCKET (R2), SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS (comma-separated; empty: any, local only).
   No service role key: account deletion runs as the user (supabase/migrations/ delete_account). */

const LIMITS={image:30*2**20,video:200*2**20,model:50*2**20};
const TYPES={'image/png':'image','image/jpeg':'image','image/webp':'image','image/svg+xml':'image','image/gif':'image',
  'video/mp4':'video','video/webm':'video','model/gltf-binary':'model','model/gltf+json':'model'};
const SINGLE_MAX=90*2**20,DOC_MAX=20*2**20,THUMB_MAX=2*2**20,KEEP_DOCS=10,PART_MIN=5*2**20;
const HASH=/^[0-9a-f]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const json=(o,status=200,h={})=>new Response(JSON.stringify(o),{status,headers:Object.assign({'Content-Type':'application/json','Cache-Control':'no-store'},h)});
const fail=(status,error)=>json({error},status);

function cors(req,env){
  const o=req.headers.get('Origin'),list=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!o||(list.length&&!list.includes(o)))return {};
  return {'Access-Control-Allow-Origin':o,'Vary':'Origin','Access-Control-Allow-Methods':'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'86400','Access-Control-Expose-Headers':'ETag'};
}

// token -> user id, kept for a minute (a project save makes many requests)
const seen=new Map();
async function userOf(req,env){
  const m=/^Bearer (.+)$/.exec(req.headers.get('Authorization')||'');if(!m)return null;
  const t=m[1],c=seen.get(t);if(c&&c.until>Date.now())return c.id;
  const r=await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:'Bearer '+t}});
  if(!r.ok)return null;
  const u=await r.json();if(!u||!u.id)return null;
  if(seen.size>2000)seen.clear();
  seen.set(t,{id:u.id,until:Date.now()+60000});
  return u.id;
}
// PostgREST with the user's own token: row level security decides
async function rest(env,token,path,init={}){
  return fetch(env.SUPABASE_URL+'/rest/v1/'+path,Object.assign({},init,{headers:Object.assign({apikey:env.SUPABASE_ANON_KEY,Authorization:token,'Content-Type':'application/json'},init.headers||{})}));
}
async function addMedia(env,token,hash,bytes,type){
  const r=await rest(env,token,'rpc/add_media',{method:'POST',body:JSON.stringify({p_hash:hash,p_bytes:bytes,p_type:type})});
  if(r.ok)return {ok:true,added:await r.json()};
  const e=await r.json().catch(()=>({}));
  return {ok:false,quota:/quota/.test(e.message||''),error:e.message||r.statusText};
}
const ownsProject=async(env,token,id)=>{const r=await rest(env,token,'projects?select=id&id=eq.'+id);return r.ok&&(await r.json()).length===1;};
function typeAndLimit(type,bytes){
  const kind=TYPES[type];if(!kind)return 'Bu dosya türü desteklenmiyor';
  if(!(bytes>0))return 'Boyut eksik';
  if(bytes>LIMITS[kind])return 'Dosya çok büyük (en çok '+Math.round(LIMITS[kind]/2**20)+' MB)';
  return null;
}
async function deletePrefix(bucket,prefix){
  let cursor,n=0;
  do{const l=await bucket.list({prefix,cursor,limit:1000});if(l.objects.length){await bucket.delete(l.objects.map(o=>o.key));n+=l.objects.length;}
    cursor=l.truncated?l.cursor:undefined;}while(cursor);
  return n;
}

async function handle(req,env){
  const url=new URL(req.url),parts=url.pathname.split('/').filter(Boolean),M=req.method;
  if(parts[0]==='ping')return json({ok:true});
  const uid=await userOf(req,env);if(!uid)return fail(401,'Oturum geçersiz');
  const token=req.headers.get('Authorization'),me='u/'+uid+'/';

  // ---------- media
  if(parts[0]==='media'){
    if(M==='POST'&&parts[1]==='check'){
      const {hashes=[]}=await req.json().catch(()=>({}));
      if(!Array.isArray(hashes)||hashes.length>2000||!hashes.every(h=>HASH.test(h)))return fail(400,'Geçersiz liste');
      const missing=[];for(const h of hashes)if(!(await env.BUCKET.head(me+'m/'+h)))missing.push(h);
      return json({missing});
    }
    const hash=parts[1];if(!HASH.test(hash||''))return fail(400,'Geçersiz dosya');
    const key=me+'m/'+hash;
    if(M==='GET'&&parts.length===2){
      const o=await env.BUCKET.get(key);if(!o)return fail(404,'Bulunamadı');
      return new Response(o.body,{headers:{'Content-Type':o.httpMetadata?.contentType||'application/octet-stream','Content-Length':String(o.size),
        'Cache-Control':'private, max-age=31536000, immutable','ETag':o.httpEtag}});
    }
    if(M==='PUT'&&parts.length===2){
      const type=req.headers.get('Content-Type')||'',bytes=+req.headers.get('Content-Length')||0;
      const bad=typeAndLimit(type,bytes);if(bad)return fail(400,bad);
      if(bytes>SINGLE_MAX)return fail(413,'Büyük dosyalar parça parça yüklenir');
      if(await env.BUCKET.head(key)){const a=await addMedia(env,token,hash,bytes,type);return a.ok?json({stored:true,new:false}):fail(a.quota?413:500,a.error);}
      // R2 rejects the body if its SHA-256 is not the name: nobody can store a file under someone else's content address
      try{await env.BUCKET.put(key,req.body,{sha256:hash,httpMetadata:{contentType:type}});}
      catch(e){return fail(400,'Dosya bozuk ya da adı içeriğiyle uyuşmuyor');}
      const a=await addMedia(env,token,hash,bytes,type);
      if(!a.ok){await env.BUCKET.delete(key);return fail(a.quota?413:500,a.quota?'Depolama alanın doldu':a.error);}
      return json({stored:true,new:a.added});
    }
    if(parts[2]==='uploads'){
      if(M==='POST'&&parts.length===3){
        const {type,bytes}=await req.json().catch(()=>({}));const bad=typeAndLimit(type,bytes);if(bad)return fail(400,bad);
        const u=await env.BUCKET.createMultipartUpload(key,{httpMetadata:{contentType:type}});
        return json({id:u.uploadId});
      }
      const id=parts[3];if(!id)return fail(400,'Yükleme yok');
      const up=env.BUCKET.resumeMultipartUpload(key,id);
      if(M==='PUT'&&parts.length===5){
        const n=+parts[4];if(!(n>=1&&n<=10000))return fail(400,'Geçersiz parça');
        const p=await up.uploadPart(n,req.body);return json({etag:p.etag});
      }
      if(M==='POST'&&parts[4]==='complete'){
        const {parts:list=[],type,bytes}=await req.json().catch(()=>({}));const bad=typeAndLimit(type,bytes);if(bad)return fail(400,bad);
        const o=await up.complete(list.map(p=>({partNumber:p.n,etag:p.etag})));
        if(o.size!==bytes){await env.BUCKET.delete(key);return fail(400,'Boyut uyuşmuyor');}
        const a=await addMedia(env,token,hash,bytes,type);
        if(!a.ok){await env.BUCKET.delete(key);return fail(a.quota?413:500,a.quota?'Depolama alanın doldu':a.error);}
        return json({stored:true,new:a.added});
      }
      if(M==='DELETE'){await up.abort();return json({ok:true});}
    }
    return fail(405,'Desteklenmiyor');
  }

  // ---------- projects
  if(parts[0]==='projects'){
    const id=parts[1];if(!UUID.test(id||''))return fail(400,'Geçersiz proje');
    if(!(await ownsProject(env,token,id)))return fail(404,'Bulunamadı');
    const base=me+'p/'+id+'/';
    let key,max,type;
    if(parts[2]==='doc'&&/^doc-?\d+\.json$|^\d+\.json$/.test(parts[3]||'')){key=base+'doc-'+parseInt(parts[3].replace(/\D/g,''),10)+'.json';max=DOC_MAX;type='application/json';}
    else if(parts[2]==='thumb.webp'&&parts.length===3){key=base+'thumb.webp';max=THUMB_MAX;type='image/webp';}
    else return fail(404,'Bulunamadı');
    if(M==='GET'){const o=await env.BUCKET.get(key);if(!o)return fail(404,'Bulunamadı');
      return new Response(o.body,{headers:{'Content-Type':type,'Cache-Control':'private, no-cache','ETag':o.httpEtag}});}
    if(M==='PUT'){
      const bytes=+req.headers.get('Content-Length')||0;if(!(bytes>0)||bytes>max)return fail(413,'Dosya çok büyük');
      await env.BUCKET.put(key,req.body,{httpMetadata:{contentType:type}});
      // documents: keep the latest KEEP_DOCS versions (a short history to fall back on)
      if(type==='application/json'){
        const l=await env.BUCKET.list({prefix:base+'doc-'}),v=l.objects.map(o=>[+o.key.slice(base.length+4,-5),o.key]).sort((a,b)=>b[0]-a[0]);
        const old=v.slice(KEEP_DOCS).map(x=>x[1]);if(old.length)await env.BUCKET.delete(old);
      }
      return json({stored:true});
    }
    return fail(405,'Desteklenmiyor');
  }

  // ---------- the account itself ("Hesabı sil"). The files first: should that fail, the account is as it was and the
  // user can try again; then the rows and the user in one transaction, with the user's own token (delete_account
  // deletes only its caller). The token is useless after this (the user is gone), so the Worker forgets it too.
  if(parts[0]==='account'&&M==='DELETE'){
    const n=await deletePrefix(env.BUCKET,me);
    const r=await rest(env,token,'rpc/delete_account',{method:'POST',body:'{}'});
    if(!r.ok){const e=await r.json().catch(()=>({}));console.error('delete_account:',r.status,e.message||'');return fail(500,'Hesap silinemedi');}
    const rows=await r.json();
    seen.delete(token.slice(7));
    return json({deleted:true,objects:n,projects:rows.projects||0,media:rows.media||0});
  }
  return fail(404,'Bulunamadı');
}

export default {
  async fetch(req,env){
    const h=cors(req,env);
    if(req.method==='OPTIONS')return new Response(null,{status:Object.keys(h).length?204:403,headers:h});
    let res;
    try{res=await handle(req,env);}catch(e){console.error(e);res=fail(500,'Sunucu hatası');}
    const out=new Response(res.body,res);for(const k in h)out.headers.set(k,h[k]);
    return out;
  }
};
