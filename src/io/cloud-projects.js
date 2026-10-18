/* Cloud projects (docs/uyelik.md §5): the rows in Supabase (projects, media), the files in R2 through the storage
   Worker (services/storage/). UI-free; ui/projects.js draws the list and the dialogs.
   A save: every medium of the document is hashed (SHA-256, content addressed), the Worker is asked which ones it lacks,
   only those are uploaded (multipart above SINGLE_MAX); then the document JSON (its media keys mapped to hashes) goes
   up under a fresh name, and save_project moves the row to the next version only if nobody saved in between
   (optimistic lock). A conflict throws {conflict: true} and leaves the stored version as it was: the fresh name means
   the other device's document is never overwritten. Opening reverses it; media come from the browser cache when the
   same hash was fetched before (immutable). */
import {STORAGE_URL,accessToken,client} from './cloud.js';
import {docFromParts,docParts} from './project.js';

const SINGLE_MAX=80*2**20,PART=32*2**20;
const err=(m,extra)=>Object.assign(new Error(m),extra||{});

async function api(path,init={}){
  if(!STORAGE_URL)throw err('Bulut depolaması bu sürümde kapalı.');
  const t=await accessToken();if(!t)throw err('Oturum kapalı: yeniden giriş yap.',{auth:true});
  const r=await fetch(STORAGE_URL+path,Object.assign({},init,{headers:Object.assign({Authorization:'Bearer '+t},init.headers||{})}));
  if(!r.ok){const e=await r.json().catch(()=>({}));throw err(e.error||r.statusText,{status:r.status,quota:r.status===413});}
  return r;
}
const db=async()=>(await client()).from('projects');

// SHA-256 of a blob, once per blob (a save hashes every medium; the same images go up again and again)
const hashes=new WeakMap();
async function hashOf(b){
  if(hashes.has(b))return hashes.get(b);
  const d=await crypto.subtle.digest('SHA-256',await b.arrayBuffer());
  const h=[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');hashes.set(b,h);return h;
}
// onProgress(done bytes, total bytes) while uploading
async function uploadMedia(items,onProgress){
  const missing=new Set();
  for(let i=0;i<items.length;i+=500){
    const r=await (await api('/media/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hashes:items.slice(i,i+500).map(x=>x.hash)})})).json();
    r.missing.forEach(h=>missing.add(h));
  }
  const todo=items.filter((x,i)=>missing.has(x.hash)&&items.findIndex(y=>y.hash===x.hash)===i);
  const total=todo.reduce((a,x)=>a+x.blob.size,0);let done=0;
  for(const {hash,blob} of todo){
    const type=blob.type||'application/octet-stream';
    if(blob.size<=SINGLE_MAX){await api('/media/'+hash,{method:'PUT',headers:{'Content-Type':type},body:blob});done+=blob.size;onProgress&&onProgress(done,total);continue;}
    const {id}=await (await api('/media/'+hash+'/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,bytes:blob.size})})).json();
    const base='/media/'+hash+'/uploads/'+encodeURIComponent(id),parts=[];
    try{
      for(let o=0,n=1;o<blob.size;o+=PART,n++){
        const {etag}=await (await api(base+'/'+n,{method:'PUT',body:blob.slice(o,o+PART)})).json();
        parts.push({n,etag});done+=Math.min(PART,blob.size-o);onProgress&&onProgress(done,total);
      }
      await api(base+'/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parts,type,bytes:blob.size})});
    }catch(e){api(base,{method:'DELETE'}).catch(()=>{});throw e;}
  }
  return {uploaded:todo.length,bytes:total};
}

const COLS='id,name,version,thumb_key,boards,bytes,created_at,updated_at,deleted_at';
async function listProjects(){
  const {data,error}=await (await db()).select(COLS).is('deleted_at',null).order('updated_at',{ascending:false});
  if(error)throw error;return data;
}
// the trash: projects moved there (purged after 30 days by the nightly clean-up, docs/uyelik.md §8)
async function listTrash(){
  const {data,error}=await (await db()).select(COLS).not('deleted_at','is',null).order('deleted_at',{ascending:false});
  if(error)throw error;return data;
}
async function createProject(name){
  const {data,error}=await (await db()).insert({name:(name||'Adsız proje').slice(0,120)}).select('id,name,version').single();
  if(error)throw err(/project_limit/.test(error.message)?'Proje sınırına ulaştın (100). Eskilerden birini sil.':error.message,{limit:/project_limit/.test(error.message)});
  return data;
}
// a document file name: unique per save, so a save that loses the race never overwrites the winner's document
const docName=()=>'doc-'+(Date.now()*1000+Math.floor(Math.random()*1000))+'.json';
const docPath=(id,key)=>'/projects/'+id+'/doc/'+key.replace(/^doc-/,'');

/* project: {id, version, name}; thumb: a Blob (webp) or null. Returns the new version. */
async function saveProject(project,d,thumb,onProgress){
  const {plain,media}=await docParts(d),items=[];
  for(const [k,b] of media)items.push({key:k,blob:b,hash:await hashOf(b)});
  await uploadMedia(items,onProgress);
  const body=JSON.stringify(Object.assign({app:'mockup-studio'},plain,{media:Object.fromEntries(items.map(x=>[x.key,x.hash]))}));
  const key=docName();
  await api(docPath(project.id,key),{method:'PUT',headers:{'Content-Type':'application/json'},body});
  const c=await client(),uniq=[...new Set(items.map(x=>x.hash))];
  const bytes=new Blob([body]).size+items.filter((x,i)=>items.findIndex(y=>y.hash===x.hash)===i).reduce((a,x)=>a+x.blob.size,0);
  const {data:v,error}=await c.rpc('save_project',{p_id:project.id,p_expected:project.version,p_doc_key:key,p_bytes:bytes,p_boards:d.boards.length,p_hashes:uniq,p_name:project.name||null});
  if(error)throw err(/not_found/.test(error.message)?'Bu proje artık yok (silinmiş olabilir).':error.message,{gone:/not_found/.test(error.message)});
  if(v===-1)throw err('Bu proje başka bir yerde değiştirildi.',{conflict:true});
  if(thumb){try{await api('/projects/'+project.id+'/thumb.webp',{method:'PUT',headers:{'Content-Type':'image/webp'},body:thumb});
    await (await db()).update({thumb_key:'thumb.webp?v='+v}).eq('id',project.id);}catch(e){console.warn('Küçük resim yüklenemedi:',e);}}
  return v;
}
async function projectRow(id){
  const {data,error}=await (await db()).select('id,name,version,doc_key,updated_at').eq('id',id).maybeSingle();
  if(error)throw error;if(!data)throw err('Bu proje bulunamadı.',{gone:true});return data;
}
// onProgress(done, total) in media files
async function openProject(id,onProgress){
  const row=await projectRow(id);
  if(!row.doc_key)throw err('Bu proje henüz hiç kaydedilmemiş.');
  const plain=await (await api(docPath(id,row.doc_key))).json(),keys=Object.entries(plain.media||{}),blobs={};
  let n=0;
  for(const [k,h] of keys){blobs[k]=await (await api('/media/'+h)).blob();onProgress&&onProgress(++n,keys.length);}
  return {project:{id:row.id,name:row.name,version:row.version},doc:await docFromParts(plain,blobs)};
}
async function renameProject(id,name){const {error}=await (await db()).update({name:name.slice(0,120)}).eq('id',id);if(error)throw error;}
async function trashProject(id){const {error}=await (await db()).update({deleted_at:new Date().toISOString()}).eq('id',id);if(error)throw error;}
async function restoreProject(id){const {error}=await (await db()).update({deleted_at:null}).eq('id',id);if(error)throw error;}
// for good: the row (and its media list) goes; files no project uses any more are removed by the nightly clean-up
async function destroyProject(id){const {error}=await (await db()).delete().eq('id',id);if(error)throw error;}
// a copy shares the media (content addressed): only the document and the thumbnail are copied
async function duplicateProject(id,name){
  const row=await projectRow(id);
  const copy=await createProject(name||row.name+' kopyası');
  if(row.doc_key){
    const text=await (await api(docPath(id,row.doc_key))).text(),plain=JSON.parse(text),key=docName();
    await api(docPath(copy.id,key),{method:'PUT',headers:{'Content-Type':'application/json'},body:text});
    const c=await client();
    const {error}=await c.rpc('save_project',{p_id:copy.id,p_expected:0,p_doc_key:key,p_bytes:new Blob([text]).size,p_boards:(plain.boards||[]).length,p_hashes:[...new Set(Object.values(plain.media||{}))],p_name:null});
    if(error)throw error;
    try{const t=await (await api('/projects/'+id+'/thumb.webp')).blob();await api('/projects/'+copy.id+'/thumb.webp',{method:'PUT',headers:{'Content-Type':'image/webp'},body:t});
      await (await db()).update({thumb_key:'thumb.webp?v=1'}).eq('id',copy.id);}catch(e){/* no thumbnail */}
  }
  return copy;
}
// a thumbnail as an object URL (the Worker needs the token, so an <img src> cannot fetch it)
const thumbs=new Map();
async function thumbURL(p){
  if(!p.thumb_key)return null;
  const k=p.id+'|'+p.thumb_key;if(thumbs.has(k))return thumbs.get(k);
  const u=URL.createObjectURL(await (await api('/projects/'+p.id+'/thumb.webp')).blob());thumbs.set(k,u);return u;
}

export {createProject,destroyProject,duplicateProject,hashOf,listProjects,listTrash,openProject,projectRow,renameProject,restoreProject,saveProject,thumbURL,trashProject,uploadMedia};
