// The studio's addresses (src/ui/router.js), for a build with accounts: the studio lives under an absolute base
// (/studio/) and every page has its own address:
//   /studio/login        the sign-in page alone (the editor's code is not loaded: src/boot.js)
//   /studio/             the home page; /studio/projects, /studio/templates, /studio/trash its other views
//   /studio/p/<id>       a cloud project in the editor; /studio/edit the work that is not (yet) a cloud project
// The plugin puts two things at the top of index.html's <head>, before anything is drawn:
//   <base href>   relative URLs (public files, fetches, images) resolve against the studio's root on any route
//   a script      decides the route from the address and the stored session: nobody signed in (and not the return of
//                 a sign-in) goes to /studio/login, remembering where it was going (localStorage shotlight.next); a
//                 signed-in /studio/login goes home (a ?lang= choice travels with it: src/lang.js). html.route-login /
//                 route-app say which; a home route is covered
//                 as the home page from the first paint (html.home-boot, ui/home.js lifts it)
// In development it also sends / to the base (Vite would only say the page is under /studio/).
const HOME=['','projects','templates','trash'];
const boot=R=>`(function(){var R=${JSON.stringify(R)},h=document.documentElement,p=location.pathname,
r=(p.indexOf(R)===0?p.slice(R.length):p.replace(/^\\//,'')).replace(/\\/+$/,''),s=false;
try{for(var i=0;i<localStorage.length;i++)if(/^sb-.*-auth-token$/.test(localStorage.key(i)))s=true;}catch(e){}
var ret=/[?&]code=/.test(location.search)||/access_token=/.test(location.hash);
if(r==='login'&&ret){history.replaceState(null,'',R+location.search+location.hash);r='';}
else if(r==='login'&&s){history.replaceState(null,'',R);r='';}
else if(r!=='login'&&!s&&!ret){try{if(r||location.search)localStorage.setItem('shotlight.next',r+location.search);}catch(e){}
  var L=/[?&]lang=(tr|en)\b/.exec(location.search);
  history.replaceState(null,'',R+'login'+(/error_description=/.test(location.hash+location.search)?location.search+location.hash:L?'?lang='+L[1]:''));r='login';}
h.classList.add(r==='login'?'route-login':'route-app');
if(r!=='login'&&${JSON.stringify(HOME)}.indexOf(r)>=0)h.classList.add('home-boot');})();`;

export default function routes(base){
  return {
    name:'studio-routes',
    configureServer(server){
      server.middlewares.use((req,res,next)=>{if(req.url==='/'){res.statusCode=302;res.setHeader('Location',base);res.end();return;}next();});
    },
    transformIndexHtml:{order:'pre',handler(html,ctx){
      if(!/(^|[\\/])index\.html$/.test(ctx.filename||ctx.path||''))return html;
      return html.replace(/<meta charset="utf-8">/,m=>m+'\n<base href="'+base+'">\n<script>'+boot(base)+'</script>');
    }}
  };
}
export {HOME};
