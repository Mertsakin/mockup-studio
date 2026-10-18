/* The studio's addresses (a build with accounts; tools/site/routes-plugin.mjs puts the studio under /studio/ and
   decides the first route before anything is drawn):
     login        /studio/login        the sign-in page (src/login.js; the editor is not loaded)
     home         /studio/ (Son kullanılanlar), /studio/projects, /studio/templates, /studio/trash
     project      /studio/p/<id>       a cloud project in the editor
     edit         /studio/edit         the editor on work that is not (yet) a cloud project
   UI-free: ui/home.js follows the address (popstate) and writes it (showing and leaving the home page, opening a
   project), ui/projects.js when the open work becomes a cloud project. Without accounts (base './') there are no
   addresses: everything here does nothing. */
import {cloudEnabled} from '../io/cloud.js';

const ROOT=import.meta.env.BASE_URL,routing=cloudEnabled&&/^\//.test(ROOT);
const VIEWS={recent:'',all:'projects',templates:'templates',trash:'trash'};
const VIEW_OF=Object.fromEntries(Object.entries(VIEWS).map(([v,p])=>[p,v]));

// the route of an address (the current one by default): {name, view | id}
function parse(pathname=location.pathname){
  const r=(pathname.startsWith(ROOT)?pathname.slice(ROOT.length):pathname.replace(/^\//,'')).replace(/\/+$/,'');
  if(r==='login')return {name:'login'};
  if(r==='edit')return {name:'edit'};
  const m=/^p\/([^/]+)$/.exec(r);if(m)return {name:'project',id:decodeURIComponent(m[1])};
  return {name:'home',view:VIEW_OF[r]||'recent'};
}
const pathFor=r=>ROOT+(r.name==='home'?VIEWS[r.view]||'':r.name==='project'?'p/'+encodeURIComponent(r.id):r.name);
// a new entry for a route (or the current one replaced); nothing when the address is that route already
function go(r,{replace=false}={}){
  if(!routing)return;
  const to=pathFor(r);if(to===location.pathname&&!location.search)return;
  if(replace||to===location.pathname)history.replaceState(null,'',to);else history.pushState(null,'',to);
}
const pops=new Set();
if(routing)addEventListener('popstate',()=>{const r=parse();pops.forEach(f=>f(r));});
// fn(route) when the user goes back or forward
const onRoute=fn=>{pops.add(fn);};
// the sign-in page leaves this for the address it was sent away from (tools/site/routes-plugin.mjs)
const NEXT='shotlight.next';
function takeNext(){try{const n=localStorage.getItem(NEXT);localStorage.removeItem(NEXT);return n?parse(ROOT+n.split('?')[0]):null;}catch(e){return null;}}
// out of the studio to the sign-in page (signing out, a session that ended)
const toLogin=()=>location.replace(ROOT+'login');

export {ROOT,go,onRoute,parse,pathFor,routing,takeNext,toLogin};
