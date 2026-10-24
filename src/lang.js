/* The editor's own language (the UI texts; the document's languages, the store and social texts, are ui/i18n.js).
   The source texts are Turkish, in the markup and in the code: t('Türkçe metin') returns the text in the chosen
   language through its dictionary (lang-en.js; src/boot.js loads it only when English is chosen) and hydrate()
   does the same once for the static markup before anything is drawn (text nodes and the aria-label / title /
   placeholder / alt attributes; one pass, like hydrateIcons). A text that reads differently in two places carries
   a context after '@' ('Geçiş@bg'; in markup data-t="Geçiş@bg"): the dictionary keys it that way, Turkish drops it.
   The choice: ?lang=en (remembered) > localStorage shotlight.lang > the browser's language: Turkish in a Turkish
   browser, English anywhere else (English is the default). No imports: the sign-in page (src/login.js) loads it without the editor. */
const KEY='shotlight.lang';
const LANGS={tr:'Türkçe',en:'English'};
let dict=null;
function pick(){
  let q=null;
  try{q=new URLSearchParams(location.search).get('lang');}catch(e){/* no location */}
  if(q&&LANGS[q]){try{localStorage.setItem(KEY,q);}catch(e){/* private mode */}return q;}
  try{const s=localStorage.getItem(KEY);if(s&&LANGS[s])return s;}catch(e){/* private mode */}
  return (navigator.language||'').slice(0,2).toLowerCase()==='tr'?'tr':'en';
}
const LANG=pick();
const LOCALE=LANG==='tr'?'tr-TR':'en-US';
const DEC=LANG==='tr'?',':'.';
// a number for display: toFixed(d) (d null: as it is) with the language's decimal separator
const fmt=(v,d)=>(d==null?String(v):(+v).toFixed(d)).replace('.',DEC);
function setDict(d){dict=d;}
const strip=s=>{const i=s.indexOf('@');return i>0?s.slice(0,i):s;};
/* The text in the UI language; the Turkish source itself (its context dropped) when there is no translation. {name}
   placeholders are filled from vars; a translated value may hold a singular and a plural form split by '|', picked by
   vars.n ('{n} device|{n} devices'). */
function t(s,vars){
  const hit=dict&&dict[s];
  let r=hit||strip(s);
  if(vars){
    if(hit&&'n' in vars&&r.includes('|')){const p=r.split('|');r=vars.n===1?p[0]:p[1];}
    r=r.replace(/\{(\w+)\}/g,(m,k)=>k in vars?String(vars[k]):m);
  }
  return r;
}
// the language of the page: html[lang] and, when a dictionary is set, the static texts and attributes under root
const ATTRS=['aria-label','title','placeholder','alt'];
function hydrate(root=document.body){
  document.documentElement.lang=LANG;
  if(!dict)return;
  document.title=t(document.title);
  const w=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeType===1&&/^(SCRIPT|STYLE)$/.test(n.tagName)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  for(let n=w.nextNode();n;n=w.nextNode()){
    if(n.nodeType===3){
      const raw=n.nodeValue,key=raw.replace(/\s+/g,' ').trim();if(!key)continue;
      const ctx=n.parentNode&&n.parentNode.childNodes.length===1&&n.parentNode.getAttribute('data-t');
      const v=dict[ctx||key];if(v!==undefined)n.nodeValue=raw.match(/^\s*/)[0]+v+raw.match(/\s*$/)[0];
    }else for(const a of ATTRS){const v=n.getAttribute(a);if(v&&dict[v]!==undefined)n.setAttribute(a,dict[v]);}
  }
}
// remembers the choice; the page reloads so every text, static and built, comes up in the new language
function setLang(code){
  if(!LANGS[code]||code===LANG)return;
  try{localStorage.setItem(KEY,code);}catch(e){/* private mode */}
  const u=new URL(location.href);u.searchParams.delete('lang');location.replace(u.href);
}

export {DEC,LANG,LANGS,LOCALE,fmt,hydrate,setDict,setLang,t};
