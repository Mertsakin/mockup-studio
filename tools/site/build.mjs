// The deployable site (docs/lansman.md): the landing page at the root and the studio under /studio/, in site/.
//   VITE_CAPTURE_URL=https://capture.example.com node tools/site/build.mjs     (npm run build:site)
// Without VITE_CAPTURE_URL the studio has no website capture (the address field is hidden). site/_headers sets
// caching and security headers for Cloudflare Pages (other hosts: the same rules by hand).
import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..'),OUT=path.join(ROOT,'site');
execSync('npx vite build',{cwd:ROOT,stdio:'inherit',env:process.env});
fs.rmSync(OUT,{recursive:true,force:true});
fs.cpSync(path.join(ROOT,'dist'),path.join(OUT,'studio'),{recursive:true});
for(const f of ['style.css','video'])fs.cpSync(path.join(ROOT,'landing',f),path.join(OUT,f),{recursive:true});
fs.cpSync(path.join(ROOT,'brand'),path.join(OUT,'brand'),{recursive:true});
fs.copyFileSync(path.join(ROOT,'brand/favicon.ico'),path.join(OUT,'favicon.ico'));
// the landing page links the studio as ../index.html and the brand files as ../brand/ (it lives in landing/ during development)
fs.writeFileSync(path.join(OUT,'index.html'),fs.readFileSync(path.join(ROOT,'landing/index.html'),'utf8').replaceAll('href="../index.html"','href="studio/"').replaceAll('"../brand/','"brand/'));
fs.writeFileSync(path.join(OUT,'_headers'),`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/studio/*
  X-Frame-Options: SAMEORIGIN

/studio/assets/*
  Cache-Control: public, max-age=31536000, immutable

/studio/player/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600

/studio/oidn/*
  Cache-Control: public, max-age=2592000

/studio/hdri/*
  Cache-Control: public, max-age=2592000

/brand/*
  Cache-Control: public, max-age=604800

/video/*
  Cache-Control: public, max-age=604800
`);
const size=d=>fs.readdirSync(d,{withFileTypes:true}).reduce((a,e)=>a+(e.isDirectory()?size(path.join(d,e.name)):fs.statSync(path.join(d,e.name)).size),0);
const n=d=>fs.readdirSync(d,{withFileTypes:true}).reduce((a,e)=>a+(e.isDirectory()?n(path.join(d,e.name)):1),0);
console.log('site/:',n(OUT),'files,',(size(OUT)/1048576).toFixed(1),'MB','| capture:',process.env.VITE_CAPTURE_URL||'none');
