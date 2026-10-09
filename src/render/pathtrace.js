import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {DenoiseMaterial,GradientEquirectTexture,ShapedAreaLight,WebGLPathTracer} from 'three-gpu-pathtracer';
import {RT} from '../devices/rt.js';
import {lightTan} from '../lights/mods.js';
import {LIGHT_SCALE,camera,overlays,renderer,req,scene} from './renderer.js';
import {ground,hemi,lightRoot,pivot,wall} from './stage.js';
import {state,view} from '../state/state.js';
import {D2R,V3} from '../util.js';

/* Photo quality (three-gpu-pathtracer): the export (renderPathTraced) and the idle preview (previewTick) share one
   studio set-up (setupStudio), applied to the live scene and undone right after; nothing else ever sees it, because
   any change (req) stops the preview first. During the set-up:
   - the studio lights become area lights of the same size / position (sun: directional), calibrated to the raster
     irradiance (E = intensity * LIGHT_SCALE); the environment is a photographed studio HDRI (Poly Haven, CC0) scaled to
     the same average brightness as before, standing in for hemisphere + reflection environment;
   - screens become emissive glass (MeshBasic does not emit here), glare / contact-shadow decals and overlays hide;
   - clearcoat materials are swapped for coat-less copies: this path tracer renders clearcoat black;
   - with the floor on and a solid / gradient background, a seamless sweep in the background colour replaces the
     shadow catcher (real contact shadows); otherwise the background stays transparent and is composited as usual. */
const SHAPES={softbox:[1.25,.85],strip:[.3,1.5],window:[1,1.3],octa:[1,1,true],umbrella:[1,1,true],dish:[1,1,true],
  flash:[1,1,true],reflector:[1,1,true],bulb:[1,1,true],overcast:[1,1,true]};
const ENV_SCALE=.5,SCREEN_GLOW=.9,HDRI='hdri/photo_studio_01_1k.hdr',ENV_MEAN=.45;  // ENV_MEAN: average radiance of the former gradient
const PREVIEW_SAMPLES=64,PREVIEW_SCALE=.5,SWEEP_GLOW=.45;
let pt=null,denoise=null,hdri=null,hdriScale=1;
const PX=new Float32Array(4);  // the path tracer's target is float

function sweepGeometry(R,gy){
  // floor towards the camera, curving up into a wall behind the subject (fixed to the camera like a real backdrop)
  const zc=-R*1.6,rc=R*2.2,Lf=R*12,La=Math.PI/2*rc,Lw=R*14,g=new THREE.PlaneGeometry(R*30,1,1,160),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const s=(p.getY(i)+.5)*(Lf+La+Lw);let y,z;
    if(s<Lf){z=R*10.4-s;y=gy;}else if(s<Lf+La){const a=(s-Lf)/rc;z=zc-Math.sin(a)*rc;y=gy+rc-Math.cos(a)*rc;}else{z=zc-rc;y=gy+rc+(s-Lf-La);}
    p.setXYZ(i,p.getX(i),y,z);}
  g.computeVertexNormals();return g;
}
function studioLights(){
  const R=view.fitRadius,c=new V3(pivot.position.x,pivot.position.y,0),out=[];
  state.lights.forEach(L=>{
    if(L.intensity<=0)return;
    const az=L.az*D2R,el=L.el*D2R,d=R*L.dist,E=L.intensity*LIGHT_SCALE;
    const pos=new V3(c.x+d*Math.cos(el)*Math.sin(az),c.y+d*Math.sin(el),c.z+d*Math.cos(el)*Math.cos(az));
    let l;
    if(L.mod==='sun'){l=new THREE.DirectionalLight(L.color,E);l.target.position.copy(c);out.push(l.target);}
    else{
      const [sw,sh,round]=SHAPES[L.mod]||[1,1],S=Math.max(lightTan(L)*d,R*.02),w=S*sw,h=S*sh;
      const area=w*h*(round?Math.PI/4:1);
      l=new ShapedAreaLight(L.color,E*d*d/area,w,h);l.isCircular=!!round;
    }
    l.position.copy(pos);l.lookAt(c);out.push(l);
  });
  return out;
}
async function loadHdri(){
  if(hdri)return hdri;
  const tex=await new HDRLoader().loadAsync(HDRI);tex.mapping=THREE.EquirectangularReflectionMapping;
  // scale so the HDRI lights the scene as brightly on average as the gradient it replaces
  const d=tex.image.data,n=d.length/4;let sum=0;for(let i=0;i<d.length;i+=4)sum+=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
  hdriScale=ENV_MEAN/Math.max(1e-4,sum/n);hdri=tex;return tex;
}
function ensurePT(){
  if(pt)return pt;
  pt=new WebGLPathTracer(renderer);
  Object.assign(pt,{renderToCanvas:false,dynamicLowRes:false,minSamples:0,renderDelay:0,fadeDuration:0,bounces:4,filterGlossyFactor:.4});
  pt.tiles.set(1,1);  // one whole sample per call (the default 3x3 tiles need nine calls per sample)
  denoise=new DenoiseMaterial({blending:THREE.NoBlending,premultipliedAlpha:renderer.getContextAttributes().premultipliedAlpha});
  return pt;
}
// Prepares the live scene for path tracing; returns the function that undoes it.
function setupStudio(env){
  const R=view.fitRadius,undo=[],added=[];
  const set=(o,k,v)=>{undo.push([o,k,o[k]]);o[k]=v;};
  set(lightRoot,'visible',false);set(hemi,'visible',false);set(ground,'visible',false);set(wall,'visible',false);
  overlays.forEach(o=>set(o,'visible',false));
  const coatless=new Map();
  RT.forEach(o=>{
    o.holder.traverse(x=>{if(x.userData.ao||x===o.glare)set(x,'visible',false);});
    [[o.screen,o.custom?o.mats.custom:o.mats.screen],...(o.mats.chrome.map?[[null,o.mats.chrome]]:[])].forEach(([meshArg,src])=>{
      const glow=new THREE.MeshPhysicalMaterial({color:0x000000,emissive:0xffffff,emissiveMap:src.map,emissiveIntensity:SCREEN_GLOW,
        roughness:.06,map:o.custom?src.map:null,transparent:!!o.custom,alphaTest:o.custom?.01:0,side:src.side});
      const targets=meshArg?[meshArg]:[];if(!meshArg)o.holder.traverse(x=>{if(x.material===src)targets.push(x);});
      targets.forEach(m=>set(m,'material',glow));added.push(glow);
    });
    // clearcoat renders black in this path tracer: use a coat-less copy whose roughness leans toward the coat's
    o.holder.traverse(x=>{const m=x.material;if(!x.isMesh||!m||!(m.clearcoat>0)||added.includes(m))return;
      if(!coatless.has(m)){const c=m.clone();c.clearcoat=0;c.roughness=m.roughness+(m.clearcoatRoughness-m.roughness)*Math.min(1,m.clearcoat)*.5;coatless.set(m,c);added.push(c);}
      set(x,'material',coatless.get(m));});
  });
  const sweepOn=state.floor&&(state.bg==='solid'||state.bg==='gradient');  // patterns keep their artwork: composite instead
  set(scene,'environment',env);set(scene,'environmentIntensity',ENV_SCALE*(.25+.75*state.ambient)*(env===hdri?hdriScale:1));
  set(scene,'background',sweepOn?env:null);set(scene,'backgroundIntensity',scene.environmentIntensity);
  const extra=new THREE.Group();scene.add(extra);
  if(sweepOn){
    // lit like a real backdrop, plus a little self-glow so it stays close to the chosen background colour
    const mat=new THREE.MeshStandardMaterial({roughness:.9,metalness:0,side:THREE.DoubleSide});
    mat.color.set(state.bg==='solid'?state.solid:state.bg1);mat.emissive.copy(mat.color).multiplyScalar(SWEEP_GLOW);
    const sweep=new THREE.Mesh(sweepGeometry(R,ground.position.y),mat);sweep.position.x=pivot.position.x;extra.add(sweep);added.push(mat,sweep.geometry);
  }
  studioLights().forEach(l=>extra.add(l));
  return ()=>{scene.remove(extra);for(let i=undo.length-1;i>=0;i--){const [o,k,v]=undo[i];o[k]=v;}added.forEach(a=>a.dispose&&a.dispose());};
}
// edge-preserving denoise, tone mapping and sRGB on the way to the canvas
const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2)),qs=new THREE.Scene(),qc=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
quad.frustumCulled=false;qs.add(quad);
// test / tuning hook: denoise strength (sigma, kSigma, threshold)
const setDenoise=o=>{ensurePT();Object.keys(o).forEach(k=>{denoise.uniforms[k].value=o[k];});};
// denoise strength follows the sample count: strong while noisy, lighter as the image converges (keeps text sharp)
// a tiny threshold = practically no filtering (exports, where OIDN runs afterwards)
function present(threshold){
  denoise.uniforms.threshold.value=threshold!==undefined?threshold:Math.max(.08,.5/Math.sqrt(Math.max(1,pt.samples)));
  denoise.map=pt.target.texture;denoise.transparent=scene.background===null;quad.material=denoise;
  renderer.setRenderTarget(null);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(qs,qc);
}

/* Export: path traces at the canvas' current size until `samples` or `budgetMs`, then removes the remaining noise with
   Intel Open Image Denoise (the "denoiser" package, weights self-hosted in public/oidn), keeping the alpha channel.
   Returns a 2D canvas with the final image. onProgress(0..1): sampling up to .9, denoising the rest. */
async function renderPathTraced(samples,onProgress,budgetMs=60000){
  stopPreview();
  const env=await loadHdri().catch(()=>null)||gradientEnv(),undoStudio=setupStudio(env),t0=performance.now();
  let raw;
  try{
    ensurePT();pt.renderScale=1;pt.setScene(scene,camera);
    while(pt.samples<samples&&(pt.samples<8||performance.now()-t0<budgetMs)){
      pt.renderSample();
      // waiting on a pixel read keeps the GPU queue short (no context loss, the system stays responsive)
      renderer.readRenderTargetPixels(pt.target,0,0,1,1,PX);
      if(onProgress)onProgress(.9*Math.min(1,Math.max(pt.samples/samples,(performance.now()-t0)/budgetMs)));
      await new Promise(r=>setTimeout(r,0));
    }
    present(1e-3);  // practically unfiltered (0 would divide by zero in the filter)
    raw=copyCanvas(renderer.domElement);
  }finally{undoStudio();req();}
  const tn=performance.now();
  if(!window.__noOidn)try{await oidn(raw);console.info('OIDN '+Math.round(performance.now()-tn)+' ms, '+Math.floor(pt.samples)+' örnek');}catch(e){console.warn('OIDN kullanılamadı, basit gürültü giderme ile devam:',e);}
  if(onProgress)onProgress(1);
  return raw;
}
function copyCanvas(src){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;c.getContext('2d').drawImage(src,0,0);return c;}
let oidnP=null;
async function oidn(c){
  if(!oidnP)oidnP=import('denoiser').then(({Denoiser})=>{const d=new Denoiser('webgl');
    d.weightsUrl=new URL('oidn',document.baseURI).href;d.quality='balanced';d.hdr=false;d.srgb=window.__oidnSrgb!==undefined?window.__oidnSrgb:true;d.outputMode='imgData';  // srgb: the canvas holds sRGB-encoded LDR pixels
    d.useTiling=true;d.tileSize=256;if('batchSize' in d)d.batchSize=1;  // whole-image passes exceed WebGL's texture limit at export sizes
    return d;});
  const d=await oidnP,g=c.getContext('2d'),src=g.getImageData(0,0,c.width,c.height);
  const out=await d.execute(src);
  if(!out||!out.data||out.data.length!==src.data.length)throw new Error('OIDN çıktısı geçersiz');
  // a failed GPU pass can come back blank without an error: keep the raw image unless the result has content
  const a=src.data,b=out.data;let lit=0,ref=0;
  for(let i=0;i<a.length;i+=4*97){lit+=b[i]+b[i+1]+b[i+2];ref+=a[i]+a[i+1]+a[i+2];}
  if(ref>0&&lit<ref*.5)throw new Error('OIDN çıktısı boş');
  // keep the original alpha (transparent backgrounds); OIDN only cleans the colour
  for(let i=3;i<a.length;i+=4)b[i]=a[i];
  g.putImageData(out,0,0);
}
let gradient=null;
function gradientEnv(){if(!gradient){gradient=new GradientEquirectTexture(64);gradient.topColor.set('#d6d8dc');gradient.bottomColor.set('#8a8e94');gradient.update();}return gradient;}

/* Preview: called every frame while the scene is idle; builds the studio once, then adds a sample per frame at
   PREVIEW_SCALE resolution until PREVIEW_SAMPLES. Any change (req) calls stopPreview, which restores the scene. */
let preview=null;
function previewTick(){
  if(!hdri){loadHdri().catch(()=>{hdri=null;});return;}  // first time: wait for the HDRI
  if(!preview){ensurePT();preview={undo:setupStudio(hdri)};pt.renderScale=PREVIEW_SCALE;pt.setScene(scene,camera);}
  if(pt.samples>=PREVIEW_SAMPLES)return;
  pt.renderSample();
  if(pt.samples>=4)present();  // until then the raster image stays on the canvas (no blank flash)
}
function stopPreview(){if(!preview)return;const p=preview;preview=null;p.undo();}
const previewing=()=>!!preview,previewSamples=()=>preview&&pt?pt.samples:0;

export {setDenoise,previewSamples,previewTick,previewing,renderPathTraced,stopPreview};
