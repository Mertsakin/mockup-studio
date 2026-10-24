// Screen videos in the video export: the WebCodecs decoder (src/devices/video-decode.js) against the seek path,
// end to end in headless Chrome. A phone with a 10 s / 30 fps test video (H.264 MP4, then VP9 WebM; made with
// ffmpeg's geq: a gradient, a white bar whose row is the frame number within its second, a yellow block whose
// column is the second) is exported at 1080 px / 30 fps both ways (window.__noWebCodecs = true forces the seek path), the
// times are compared, frames 60 (2,0 s), 150 (5,0 s) and 297 of both outputs are extracted with ffmpeg and diffed,
// and the fallback's single console.warn is checked. Then the frame cost alone: the screen's frame is set for the 300
// frame times in order on each path (no rendering) and the screen texture is read back to see which source frame it
// shows (the bar's row + the block's column = the frame number), so each path's exactness and per-frame time are
// known. Writes everything to the output folder (default renders/video-decode/) and a side-by-side sheet of the
// 2,0 s frames (source, seek, decoder).
// Usage: node tools/video/test-decode.mjs [outDir]   (Google Chrome for H.264; ffmpeg with libx264 and libvpx-vp9)
import {execFileSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {chromium} from 'playwright';
import pngjs from 'pngjs';
import {createServer} from 'vite';

const {PNG}=pngjs;
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const OUT=path.resolve(process.argv[2]||path.join(ROOT,'renders/video-decode'));
fs.mkdirSync(OUT,{recursive:true});
const FPS=30,DUR=10,CHECK=[60,150,297];  // frames compared between the two paths (multiples of 3: their times are whole microseconds)
// per pixel: the block (top twelfth, the second's tenth of the width) is yellow, the bar (the frame's thirtieth of the
// height) white, the rest a gradient below the probe's thresholds; drawn small and scaled up with nearest neighbour
const BLOCK='lt(Y,H/12)*between(X,W*floor(N/30)/10,W*(floor(N/30)+1)/10-1)',BAR='between(Y,H*mod(N,30)/30,H*(mod(N,30)+1)/30-1)';
const VF="geq=r='if("+BLOCK+",255,if("+BAR+",255,X*200/W))':g='if("+BLOCK+",255,if("+BAR+",255,Y*200/H))':b='if("+BLOCK+",0,if("+BAR+",255,80))',scale=720:1560:flags=neighbor,format=yuv420p";
const ENC={mp4:['-c:v','libx264','-g','60','-profile:v','high','-crf','18','-movflags','+faststart'],
  webm:['-c:v','libvpx-vp9','-g','60','-b:v','3M','-deadline','good','-cpu-used','4']};
const ff=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:['ignore','inherit','inherit']});
function source(ext){
  const f=path.join(OUT,'frames30.'+ext);
  if(!fs.existsSync(f))ff(['-f','lavfi','-i','color=c=black:size=360x780:rate='+FPS+':duration='+DUR+',format=rgb24','-vf',VF,...ENC[ext],f]);
  return f;
}
// frame i of a video file as a PNG (seek by its presentation time)
function frame(file,i,out){ff(['-ss',(i/FPS).toFixed(4),'-i',file,'-frames:v','1',out]);return out;}
function diff(pa,pb){
  const a=PNG.sync.read(fs.readFileSync(pa)),b=PNG.sync.read(fs.readFileSync(pb));
  if(a.width!==b.width||a.height!==b.height)return {max:255,n:a.width*a.height};
  let max=0,n=0;
  for(let i=0;i<a.data.length;i+=4){let m=0;for(let k=0;k<3;k++)m=Math.max(m,Math.abs(a.data[i+k]-b.data[i+k]));if(m>max)max=m;if(m>8)n++;}
  return {max,n};
}
let fails=0;const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m);if(!c)fails++;};

/* ---------- page side (window.__app, src/debug.js) */
async function setup({b64,name,type}){
  const app=window.__app,st=app('state');
  if(!app('hasBoard')())app('addBoard')();
  app('applyComp')({n:'x',items:[{type:'phone'}],scene:{rx:-6,ry:0,rz:0}});
  st.ratio='4:5';app('layout')();
  const d=st.devices[0],bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  await app('loadShotVideo')(d,new File([bytes],name,{type}));
  d.fit='stretch';  // the whole video on the whole screen texture: the probe below reads positions off it
  app('setMode')('animate');
  app('applyPreset')('c-push',st.scene);  // a moving camera: the motion blur sub-samples run too
  app('refit')();app('applyTransform')();app('layout')();app('req')();
  for(const [sel,v] of [['#vRes','1080'],['#vFps','30'],['#vFmt','mp4']])document.querySelector(sel+' button[data-v="'+v+'"]').click();
  await new Promise(r=>setTimeout(r,500));
  return {dur:st.anim.dur,size:[d.video.videoWidth,d.video.videoHeight]};
}
async function run(noWebCodecs){
  window.__noWebCodecs=noWebCodecs;
  const app=window.__app,t0=performance.now(),blob=await app('renderVideo')(()=>{}),ms=performance.now()-t0;
  const b64=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob);});
  return {ms,bytes:blob.size,b64};
}

// the frame cost alone, and which source frame the screen shows at every frame time: the white bar's row is the frame
// within its second, the yellow block's column the second (d.fit = 'stretch', so the texture is the frame itself)
async function probe(path){
  const app=window.__app,d=app('state').devices[0],N=300,F=30,shown=[];
  const which=()=>{
    const c=app('RT').get(d.id).mats.screen.map.image,w=c.width,h=c.height,data=c.getContext('2d').getImageData(0,0,w,h).data;
    let y0=-1,y1=-1;
    for(let y=0;y<h;y++){let n=0,m=0;for(let x=0;x<w;x+=3){const i=(y*w+x)*4;m++;if(data[i]>215&&data[i+1]>215&&data[i+2]>215)n++;}if(n>m*.85){if(y0<0)y0=y;y1=y;}}
    const y=Math.floor(h/40);let x0=-1,x1=-1;
    for(let x=0;x<w;x++){const i=(y*w+x)*4;if(data[i]>215&&data[i+1]>215&&data[i+2]<80){if(x0<0)x0=x;x1=x;}}
    return y0<0||x0<0?-1:Math.floor((x0+x1)/2/w*10)*30+Math.floor((y0+y1)/2/h*30);
  };
  window.__noWebCodecs=path==='seek';
  let s=null,ms=0,open=0;
  if(path==='decode'){const a=performance.now();s=await app('openExportFrames')([d]);open=performance.now()-a;}
  for(let i=0;i<N;i++){const t=i/F,a=performance.now();if(s)await s.show(t);else await app('showFrame')(d,t);ms+=performance.now()-a;shown.push(which());}
  if(s)await s.close();
  return {ms,open,shown};
}

const server=await createServer({root:ROOT,logLevel:'error',server:{port:0,strictPort:false,hmr:false}});
await server.listen();
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal']});
const rows=[];
try{
  for(const ext of ['mp4','webm']){
    const src=source(ext),mime=ext==='mp4'?'video/mp4':'video/webm';  // the ffmpeg encodes drop '-pix_fmt': the filter chain ends in yuv420p
    console.log('\n'+ext.toUpperCase()+' ('+src+')');
    const page=await browser.newPage({locale:'tr-TR',viewport:{width:1400,height:900}});
    const errs=[],warns=[];
    page.on('pageerror',e=>errs.push(String(e)));
    page.on('console',m=>{const s=m.text();if(m.type()==='error')errs.push(s);else if(/WebCodecs ile çözülemedi/.test(s))warns.push(s);});
    await page.addInitScript(()=>{window.__noPhotoPreview=true;});
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(()=>window.__app&&!document.documentElement.classList.contains('booting'),null,{timeout:60000});
    await page.waitForTimeout(500);
    const info=await page.evaluate(setup,{b64:fs.readFileSync(src).toString('base64'),name:'frames30.'+ext,type:mime});
    ok(Math.abs(info.dur-DUR)<.05,'the video loads on the phone ('+info.size.join('×')+', '+info.dur+' s)');
    const files={};
    for(const [name,noWC] of [['seek',true],['decode',false]]){
      const before=warns.length,r=await page.evaluate(run,noWC);
      files[name]=path.join(OUT,ext+'-'+name+'.mp4');fs.writeFileSync(files[name],Buffer.from(r.b64,'base64'));
      const sec=r.ms/1000;rows.push({src:ext,path:name,sec,fps:DUR*FPS/sec,mb:r.bytes/1e6});
      console.log('  '+name.padEnd(7)+(sec.toFixed(1)+' s').padStart(8)+(' ('+(DUR*FPS/sec).toFixed(1)+' kare/sn, '+(r.bytes/1e6).toFixed(1)+' MB)'));
      if(name==='seek')ok(warns.length-before===1,'the seek path (window.__noWebCodecs) warns once: '+(warns[before]||'—'));
      else ok(warns.length===before,'the decoder path does not warn');
    }
    ok(errs.length===0,'no page errors'+(errs.length?': '+errs.join(' | '):''));
    // the same frames out of both files
    for(const i of CHECK){
      const a=frame(files.seek,i,path.join(OUT,ext+'-seek-f'+i+'.png')),b=frame(files.decode,i,path.join(OUT,ext+'-decode-f'+i+'.png')),d=diff(a,b);
      ok(d.max<=24&&d.n<200,'frame '+i+' ('+(i/FPS).toFixed(2)+' s) is the same frame on both paths (max diff '+d.max+', '+d.n+' px > 8)');
    }
    // the frame cost alone and the exactness of each path
    const probes={};
    for(const name of ['seek','decode']){
      const r=await page.evaluate(probe,name),exact=r.shown.filter((f,i)=>f===i).length,lag=r.shown.filter((f,i)=>f===i-1).length,other=r.shown.length-exact-lag;
      probes[name]={exact,lag,other,ms:r.ms};
      console.log('  '+name.padEnd(7)+' frame cost '+(r.ms/300).toFixed(1).padStart(6)+' ms/frame'+(r.open?' (+ '+r.open.toFixed(0)+' ms to open)':'')+' · exact frame '+exact+'/300, one behind '+lag+', other '+other);
      ok(other===0,name+': every frame is the wanted one or the one before it');
    }
    ok(probes.decode.exact>=probes.seek.exact,'the decoder is at least as exact as the seek path');
    ok(probes.decode.ms<probes.seek.ms,'the decoder is faster per frame');
    frame(src,60,path.join(OUT,ext+'-source-f60.png'));
    execFileSync('node',[path.join(ROOT,'tools/render-harness/sheet.js'),path.join(OUT,ext+'-f60-sheet.png'),'3','700',path.join(OUT,ext+'-source-f60.png'),path.join(OUT,ext+'-seek-f60.png'),path.join(OUT,ext+'-decode-f60.png')],{stdio:'inherit'});
    await page.close();
  }
}finally{await browser.close();await server.close();}

console.log('\nsource  path    seconds  frames/s  MB');
rows.forEach(r=>console.log(r.src.padEnd(7)+' '+r.path.padEnd(7)+' '+r.sec.toFixed(1).padStart(7)+' '+r.fps.toFixed(1).padStart(9)+'  '+r.mb.toFixed(1)));
for(const ext of ['mp4','webm']){const s=rows.find(r=>r.src===ext&&r.path==='seek'),d=rows.find(r=>r.src===ext&&r.path==='decode');if(s&&d)console.log(ext+': '+(s.sec/d.sec).toFixed(2)+'× faster with the decoder');}
console.log(fails?'\n'+fails+' FAILED':'\nall ok');
process.exit(fails?1:0);
