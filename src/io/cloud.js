/* Accounts (docs/uyelik.md): the Supabase session and the user's profile. UI-free; ui/account.js draws it.
   The build is configured by VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (public values; .env.example). Without them
   there are no accounts at all and nothing here loads. supabase-js is imported on first use, so the studio starts as
   fast as before: right away only when a session is stored or the page is the return of a sign-in (PKCE ?code=),
   otherwise when the user opens the sign-in dialog.
   Sign-in: OAuth (Google, GitHub, Apple; VITE_AUTH_PROVIDERS picks which buttons show) or an e-mail link (one-time,
   no password). Both return to the studio's root; the client exchanges the code and removes it from the address. */
const URL_=import.meta.env.VITE_SUPABASE_URL||'',KEY=import.meta.env.VITE_SUPABASE_ANON_KEY||'';
const STORAGE_URL=(import.meta.env.VITE_STORAGE_URL||'').replace(/\/+$/,'');
const PROVIDERS=(import.meta.env.VITE_AUTH_PROVIDERS??'google,github,apple').split(',').map(s=>s.trim()).filter(Boolean);
const cloudEnabled=!!(URL_&&KEY);

let clientP=null;
const subs=new Set();
/* ready: the stored session (if any) has been looked at. fresh: the current user has just signed in, as opposed to a
   session carried over from before (a reload): the page returned from a sign-in (?code= or #access_token=, read before
   the client removes it) or saw nobody signed in first (the gate) */
const auth={user:null,profile:null,ready:false,fresh:false};
// PKCE / implicit return, or the sign-in page handing over a session it saw arrive (src/login.js)
const fromLogin=(()=>{try{const v=sessionStorage.getItem('shotlight.fresh');sessionStorage.removeItem('shotlight.fresh');return !!v;}catch(e){return false;}})();
const cameFromSignIn=/[?&]code=/.test(location.search)||/access_token=/.test(location.hash)||fromLogin;
let sawSignedOut=false;
function client(){
  if(!cloudEnabled)return Promise.reject(new Error('Hesaplar bu sürümde kapalı.'));
  return clientP||(clientP=import('@supabase/supabase-js').then(({createClient})=>{
    const c=createClient(URL_,KEY,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    c.auth.onAuthStateChange((ev,session)=>{
      const u=session?session.user:null,changed=(u&&u.id)!==(auth.user&&auth.user.id);
      if(changed&&u)auth.fresh=cameFromSignIn||sawSignedOut;
      auth.user=u;if(!u){auth.profile=null;auth.fresh=false;sawSignedOut=true;}
      if(changed&&u)loadProfile();
      if(changed||ev==='INITIAL_SESSION'){auth.ready=true;emit();}
    });
    return c;
  }));
}
const emit=()=>subs.forEach(f=>{try{f(auth);}catch(e){console.error(e);}});
// fn(auth) on every change of the signed-in user (and once the stored session is known)
function onAuth(fn){subs.add(fn);if(auth.ready)fn(auth);return ()=>subs.delete(fn);}
async function loadProfile(){
  const c=await client(),{data}=await c.from('profiles').select('*').maybeSingle();
  auth.profile=data||null;emit();
}
// the address the sign-in returns to: the studio's root (/studio/ with addresses, tools/site/routes-plugin.mjs; the
// sign-in page is not where the studio completes it), without a query (a template link would open again)
const returnTo=()=>location.origin+(/^\//.test(import.meta.env.BASE_URL)?import.meta.env.BASE_URL:location.pathname);
async function signInWith(provider){
  const c=await client(),{error}=await c.auth.signInWithOAuth({provider,options:{redirectTo:returnTo()}});
  if(error)throw error;
}
async function signInEmail(email){
  const c=await client(),{error}=await c.auth.signInWithOtp({email,options:{emailRedirectTo:returnTo(),shouldCreateUser:true}});
  if(error)throw error;
}
async function signOut(){const c=await client();await c.auth.signOut();}
async function accessToken(){const c=await client(),{data}=await c.auth.getSession();return data.session?data.session.access_token:null;}
async function rename(name){
  const c=await client(),{data,error}=await c.from('profiles').update({name}).eq('id',auth.user.id).select().single();
  if(error)throw error;auth.profile=data;emit();
}

// a stored session or the return of a sign-in: start the client now (it restores or completes the session)
function storedSession(){
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^sb-.*-auth-token$/.test(k))return true;}}catch(e){/* no storage */}
  return false;
}
if(cloudEnabled&&(storedSession()||/[?&]code=/.test(location.search)||/access_token=|error_description=/.test(location.hash)))client().catch(e=>console.warn('Oturum açılamadı:',e));
else{auth.ready=true;sawSignedOut=true;}

export {PROVIDERS,STORAGE_URL,accessToken,auth,client,cloudEnabled,onAuth,rename,signInEmail,signInWith,signOut};
