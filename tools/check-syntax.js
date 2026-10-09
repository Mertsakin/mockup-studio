// Extracts the inline app script from mockup-studio.html and syntax-checks it with Node.
const fs=require('fs'),cp=require('child_process'),os=require('os'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','mockup-studio.html'),'utf8');
const m=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if(!m.length){console.error('inline <script> not found');process.exit(1);}
const tmp=path.join(os.tmpdir(),'mockup-app.js');fs.writeFileSync(tmp,m[0][1]);
const r=cp.spawnSync(process.execPath,['--check',tmp],{stdio:'inherit'});
if(r.status===0)console.log('syntax ok');process.exit(r.status);
