// Headless render harness: runs the app in headless Chromium (WebGL2) and writes a PNG.
// Usage: node tools/render-harness/harness.js <out.png> [scene.js]
// Env: W, H (pixels), SAMPLES (progressive samples, default 64 = fully converged; 1 = quick single pass),
//      EXPORT=1 (run the real export path instead: background + encoding, JPEG if out ends in .jpg; QUALITY=photo path traces, use GPU=1),
//      MARKERS=0 (hide light spheres), GPU=1 (ANGLE/Metal instead of SwiftShader: faster, not bit-stable).
// Scene-specific env vars (COLOR, PRESET, …) are passed through to the scene as `env`.
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const [,,outPath,scenePath]=process.argv;
if(!outPath||/\.html$/.test(outPath)){console.error('usage: harness.js <out.png> [scene.js]');process.exit(2);}
const ROOT=path.resolve(__dirname,'..','..');
const W=+process.env.W||640,H=+process.env.H||800,SAMPLES=+process.env.SAMPLES||64;

(async()=>{
  const {createServer}=await import('vite');
  const server=await createServer({root:ROOT,logLevel:'error',server:{port:0,strictPort:false,hmr:false}});
  await server.listen();
  const url=server.resolvedUrls.local[0];
  const browser=await chromium.launch({args:process.env.GPU?['--use-angle=metal']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  let failed=false;
  try{
    const page=await browser.newPage({viewport:{width:1400,height:900}});
    await page.addInitScript(()=>{window.__noPhotoPreview=true;});  // keep renders deterministic
    page.on('pageerror',e=>{failed=true;console.error('page error:',e.message);});
    page.on('console',m=>{const t=m.type(),s=m.text();
      if(t==='error'){failed=true;console.error('console error:',s);}
      else if(t==='warning'){if(!/GPU stall|GL Driver Message/.test(s))console.warn('warn:',s);}
      else if(!s.startsWith('[vite]'))console.log(s);});
    await page.goto(url);
    await Promise.race([page.waitForFunction(()=>window.__app,null,{timeout:60000}),
      new Promise((_,fail)=>page.on('pageerror',e=>fail(new Error('app failed to start: '+e.message))))]);
    await page.evaluate(()=>document.fonts.ready.then(()=>new Promise(r=>setTimeout(r,100))));
    if(scenePath){
      const scene=require(path.resolve(scenePath));
      await page.evaluate(([src,opts])=>(0,eval)('('+src+')')(window.__app,opts),[scene.toString(),{env:process.env,W,H}]);
    }
    // let debounced work (environment rebuild, chrome redraw) settle, then render like an export
    await page.evaluate(()=>new Promise(r=>setTimeout(r,400)));
    const data=process.env.EXPORT?await page.evaluate(async({W,H,quality,format})=>{
      // the real export path (renderExport): background, photo quality, encoding; size from W (long edge) and ratio
      const app=window.__app,st=app('state');st.size=Math.max(W,H);st.format=format;if(quality)st.quality=quality;
      let last=-1;const b=await app('renderExport')(p=>{const q=Math.floor(p*4)*25;if(q!==last){last=q;console.log('export',q+'%');}});
      return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b);});
    },{W,H,quality:process.env.QUALITY,format:/\.jpe?g$/i.test(outPath)?'jpg':'png'}):await page.evaluate(({W,H,SAMPLES,markers})=>{
      const app=window.__app,r=app('renderer'),view=app('view');
      r.setPixelRatio(1);r.setSize(W,H,false);view.aspect=W/H;app('applyTransform')();
      if(!markers)app('LRT').forEach(o=>o.marker.visible=false);
      app('renderNow')(SAMPLES);
      // composite over light grey for viewing
      const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
      g.fillStyle='#e4e4e4';g.fillRect(0,0,W,H);g.drawImage(r.domElement,0,0,W,H);
      return c.toDataURL('image/png');
    },{W,H,SAMPLES,markers:process.env.MARKERS!=='0'});
    fs.mkdirSync(path.dirname(path.resolve(outPath)),{recursive:true});
    fs.writeFileSync(outPath,Buffer.from(data.split(',')[1],'base64'));
    console.log('wrote',outPath);
  }finally{await browser.close();await server.close();}
  if(failed)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1);});
