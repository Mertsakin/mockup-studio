// Headless render harness for mockup-studio.html.
// Usage: node tools/render-harness/harness.js <html> <out.png> [scene.js]
// Env: W, H (pixels), FRAMES (animation frames to run, ~34 for a fully converged progressive render),
//      ACC=1 (force float accumulation targets so the progressive renderer runs), REALPMREM=1 (use three's PMREM; renders black in headless-gl).
// Linux needs a virtual display: xvfb-run -a -s "-screen 0 640x480x24" node ...
const path='';
global.THREE=require(path+'three');
const {createCanvas,Image:NImage,loadImage}=require(path+'canvas');
const {PNG}=require(path+'pngjs');
const fs=require('fs');
const [,,htmlPath,outPath,setupPath]=process.argv;
const W=+process.env.W||640,H=+process.env.H||800;
const gl=require(path+'gl')(W,H,{preserveDrawingBuffer:true,antialias:true,alpha:true,premultipliedAlpha:true});
// texture upload shim: node-canvas -> typed array (honour flipY / premultiply)
let flipY=false,premul=false;
const ps=gl.pixelStorei.bind(gl);
gl.pixelStorei=(p,v)=>{if(p===gl.UNPACK_FLIP_Y_WEBGL)flipY=!!v;else if(p===gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)premul=!!v;else ps(p,v);};
const tex=gl.texImage2D.bind(gl);
function toPixels(src){
  let w=src.width,h=src.height,data;
  if(src.getContext){data=src.getContext('2d').getImageData(0,0,w,h).data;}
  else if(src.data){data=src.data;}
  else {const c=createCanvas(w,h);c.getContext('2d').drawImage(src,0,0);data=c.getContext('2d').getImageData(0,0,w,h).data;}
  let out=new Uint8Array(data.length);
  for(let y=0;y<h;y++){const sy=flipY?h-1-y:y;out.set(data.subarray(sy*w*4,(sy+1)*w*4),y*w*4);}
  if(premul)for(let i=0;i<out.length;i+=4){const a=out[i+3]/255;out[i]*=a;out[i+1]*=a;out[i+2]*=a;}
  return {w,h,out};
}
gl.texImage2D=function(...a){
  if(a.length===6&&a[5]&&typeof a[5]==='object'&&!ArrayBuffer.isView(a[5])){const {w,h,out}=toPixels(a[5]);return tex(a[0],a[1],a[2],w,h,0,a[3],a[4],out);}
  return tex(...a);
};
const tsub=gl.texSubImage2D.bind(gl);
gl.texSubImage2D=function(...a){
  if(a.length===7&&a[6]&&typeof a[6]==='object'&&!ArrayBuffer.isView(a[6])){const {w,h,out}=toPixels(a[6]);return tsub(a[0],a[1],a[2],a[3],w,h,a[4],a[5],out);}
  return tsub(...a);
};
// DOM stubs
const noopEl=()=>({style:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},removeEventListener(){},setAttribute(){},removeAttribute(){},remove(){},appendChild(){},append(){},
  querySelector:()=>noopEl(),querySelectorAll:()=>[],dataset:{},getBoundingClientRect:()=>({left:0,top:0,width:W,height:H}),setPointerCapture(){},
  textContent:'',innerHTML:'',value:'',checked:false,disabled:false,hidden:false,open:false,clientWidth:W,clientHeight:H,closest:()=>null,focus(){},click(){}});
const glCanvas=Object.assign(noopEl(),{width:W,height:H,getContext:()=>gl,style:{}});gl.canvas=glCanvas;const _ge=gl.getExtension.bind(gl);gl.getExtension=n=>process.env.NOLOD&&n==='EXT_shader_texture_lod'?null:_ge(n);
const els={};
global.document={querySelector:s=>s==='#gl'?glCanvas:(els[s]=els[s]||noopEl()),querySelectorAll:()=>[],
  createElement:t=>{if(t==='canvas'){const c=createCanvas(1,1);c.style={};c.addEventListener=()=>{};return c;}return noopEl();},
  activeElement:null,fonts:null,addEventListener(){},createElementNS:(ns,t)=>global.document.createElement(t)};
global.window={devicePixelRatio:1,addEventListener(){},claude:null,__accType:process.env.ACC?THREE.FloatType:undefined};global.addEventListener=()=>{};
global.getComputedStyle=()=>({paddingLeft:'0',paddingRight:'0',paddingTop:'0',paddingBottom:'0'});
global.ResizeObserver=class{observe(){}};
let rafQ=[];global.requestAnimationFrame=cb=>{rafQ.push(cb);return rafQ.length;};global.cancelAnimationFrame=()=>{};
global.localStorage={getItem:()=>null,setItem(){}};
global.Image=class{set src(v){this._src=v;}};
global.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}};
global.navigator={userAgent:'node'};
global.HTMLCanvasElement=createCanvas(1,1).constructor;
global.ImageBitmap=class{};global.OffscreenCanvas=undefined;global.HTMLImageElement=NImage;global.HTMLVideoElement=class{};
const RealRenderer=THREE.WebGLRenderer;
// headless-gl cannot run PMREM; emulate with a mipmapped cube render (preview-quality roughness)
if(!process.env.REALPMREM){THREE.PMREMGenerator.prototype.fromScene=function(sc,sigma,near,far){
  const r=global.__renderer,N=128,faces=[];const tm=r.toneMapping,oe=r.outputEncoding;r.toneMapping=THREE.NoToneMapping;r.outputEncoding=THREE.LinearEncoding;
  const rt=new THREE.WebGLRenderTarget(N,N,{type:THREE.FloatType});
  const dirs=[[1,0,0,0,-1,0],[-1,0,0,0,-1,0],[0,1,0,0,0,1],[0,-1,0,0,0,-1],[0,0,1,0,-1,0],[0,0,-1,0,-1,0]];
  dirs.forEach(([x,y,z,ux,uy,uz])=>{const cam=new THREE.PerspectiveCamera(90,1,near||.1,far||100);cam.up.set(ux,uy,uz);cam.lookAt(x,y,z);
    r.setRenderTarget(rt);r.clear();r.render(sc,cam);const px=new Float32Array(N*N*4);r.readRenderTargetPixels(rt,0,0,N,N,px);
    const u8=new Uint8Array(N*N*4);for(let i=0;i<px.length;i++){let v=i%4===3?1:px[i];v=v/(1+v)*1.6;u8[i]=Math.min(255,Math.pow(Math.min(1,v),1/2.2)*255);}
    const dt=new THREE.DataTexture(u8,N,N);dt.flipY=false;faces.push(dt);});
  r.setRenderTarget(null);r.toneMapping=tm;r.outputEncoding=oe;
  const ct=new THREE.CubeTexture(faces);ct.encoding=THREE.sRGBEncoding;ct.generateMipmaps=true;ct.minFilter=THREE.LinearMipmapLinearFilter;ct.needsUpdate=true;ct.format=THREE.RGBAFormat;
  return {texture:ct,dispose(){}};};}
THREE.WebGLRenderer=function(p){p=Object.assign({},p,{canvas:glCanvas,context:gl});const r=new RealRenderer(p);global.__renderer=r;return r;};
const html=fs.readFileSync(htmlPath,'utf8');
let js=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1])[0];
js=js.replace('/* ---------- init ---------- */','globalThis.__app=(name)=>eval(name);\n/* ---------- init ---------- */');
eval(js);
const app=globalThis.__app;
(async()=>{
  if(setupPath){const setup=require(require('path').resolve(setupPath));await setup(app,{loadImage,createCanvas,W,H});}
  const frames=+process.env.FRAMES||1;
  for(let i=0;i<frames;i++){const q=rafQ;rafQ=[];q.forEach(c=>c());}
  if(global.__override)global.__override();
  const px=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px);
  const png=new PNG({width:W,height:H});
  // composite over light grey for viewing
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const si=((H-1-y)*W+x)*4,di=(y*W+x)*4,a=px[si+3]/255,bg=228;
    for(let k=0;k<3;k++)png.data[di+k]=Math.min(255,px[si+k]+bg*(1-a));png.data[di+3]=255;}
  fs.writeFileSync(outPath,PNG.sync.write(png));console.log('wrote',outPath);
})().catch(e=>{console.error(e);process.exit(1);});
