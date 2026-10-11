// Renders the landing page visuals with the product's own export path: node tools/landing/build.mjs [name…]
// Needs tools/landing/src/*.png (node tools/landing/shots.mjs). Output: landing/img/<name>.png
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const S='/tools/landing/src/';
const RENDERS={
  'hero-fan':{W:2000,H:1400,spec:{lights:'Stüdyo',scene:{rx:-6,ry:0,zoom:1.04,panY:-.01},
    devices:[{type:'phone',colorKey:'white',px:-7.6,py:.23,pz:-1.5,ry:18,rz:6,img:S+'app-light.png'},
             {type:'phone',colorKey:'graphite',pz:2,img:S+'app-dark.png'},
             {type:'phone',colorKey:'white',px:7.6,py:.23,pz:-1.5,ry:-18,rz:-6,img:S+'app-gallery.png'}]}},
  'phone-tilt':{W:1300,H:1500,spec:{lights:'Stüdyo',scene:{rx:-8,ry:-24,rz:-9,zoom:1.08},
    devices:[{type:'phone',colorKey:'graphite',img:S+'app-light.png'}]}},
  'tablet-phone':{W:1700,H:1400,spec:{lights:'Yumuşak tavan',scene:{rx:-6,ry:18,zoom:1.08},
    devices:[{type:'tablet',colorKey:'white',px:-4,pz:-2,ry:12,img:S+'showcases-tablet.png',landscape:true},
             {type:'phone',colorKey:'graphite',px:10.5,py:-5.05,pz:4,ry:-14,img:S+'app-gallery.png'}]}},
  'desk':{W:2200,H:1400,spec:{bg:{bg:'solid',solid:'#ffffff'},floor:true,settle:true,shadowOpacity:.5,lights:'Pencere ışığı',scene:{rx:10,ry:-4,zoom:1.22,panY:.03},
    devices:[{type:'monitor',colorKey:'silver',img:S+'studio-monitor.png'},
             {type:'laptop',colorKey:'silver',px:-31,pz:8,ry:22,img:S+'studio-laptop.png'},
             {type:'phone',colorKey:'silver',px:27,pz:10,ry:-22,img:S+'app-light.png'}]}},
  'laptop-dark':{W:2200,H:1400,spec:{bg:{bg:'gradient',bg1:'#232546',bg2:'#0b0c12',gradType:'radial'},floor:true,shadowOpacity:.75,lights:'İki softbox',
    scene:{rx:14,ry:-26,zoom:1.3,panY:.02},devices:[{type:'laptop',colorKey:'graphite',glare:false,lidAngle:108,img:S+'studio-laptop.png'}]}},
  'phone-dramatic':{W:1400,H:1600,spec:{bg:{bg:'solid',solid:'#000000'},floor:true,shadowOpacity:.8,lights:'Dramatik',ambient:.35,
    scene:{rx:-10,ry:28,rz:4,zoom:1.15},devices:[{type:'phone',colorKey:'graphite',img:S+'app-dark.png'}]}},
  'laptop-silver':{W:2000,H:1300,spec:{lights:'Stüdyo',scene:{rx:16,ry:-28,zoom:1.12},
    devices:[{type:'laptop',colorKey:'silver',img:S+'studio-laptop.png'}]}}
};
const names=process.argv.slice(2).length?process.argv.slice(2):Object.keys(RENDERS);
for(const n of names){
  const r=RENDERS[n];if(!r){console.error('unknown render',n);process.exit(2);}
  const out=path.join(ROOT,'landing','img',n+'.png');
  console.log('→',n,r.W+'×'+r.H);
  const res=spawnSync('node',[path.join(ROOT,'tools/render-harness/harness.js'),out,path.join(ROOT,'tools/landing/scene.js')],
    {stdio:'inherit',env:Object.assign({},process.env,{W:r.W,H:r.H,EXPORT:'1',GPU:process.env.GPU??'1',SPEC:JSON.stringify(r.spec)})});
  if(res.status)process.exit(res.status);
}
