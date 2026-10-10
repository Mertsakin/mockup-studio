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
const PREVIEW_SAMPLES=64,PREVIEW_SCALE=.5,SWEEP_GLOW=.45,TRACE_TILE_PX=1e6;
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
  // image backgrounds and 2D items behind the devices must show through: composite on a transparent render instead
  const sweepOn=state.floor&&(state.bg==='solid'||state.bg==='gradient')&&!state.items.some(i=>!i.front);
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
   OIDN also gets noise-free albedo and normal passes of the same view (renderAux): with them it keeps texture detail
   (key legends, screen text) instead of smoothing it as noise. Without them (aux failed) it denoises colour only.
   Returns a 2D canvas with the final image. onProgress(0..1): sampling up to .9, denoising the rest. */
async function renderPathTraced(samples,onProgress,budgetMs=60000){
  stopPreview();
  const env=await loadHdri().catch(()=>null)||gradientEnv(),undoStudio=setupStudio(env),t0=performance.now();
  let raw,aux=null;
  try{
    ensurePT();pt.renderScale=1;pt.setScene(scene,camera);
    // one call per tile of about TRACE_TILE_PX pixels: the page keeps repainting at export sizes (a whole 3840 px
    // sample would block the tab for seconds); pt.samples advances by a fraction per tile
    const n=Math.max(1,Math.ceil(Math.sqrt(renderer.domElement.width*renderer.domElement.height/TRACE_TILE_PX)));pt.tiles.set(n,n);
    while(pt.samples<samples&&(pt.samples<8||performance.now()-t0<budgetMs)){
      pt.renderSample();
      // waiting on a pixel read keeps the GPU queue short (no context loss, the system stays responsive)
      renderer.readRenderTargetPixels(pt.target,0,0,1,1,PX);
      if(onProgress)onProgress(.9*Math.min(1,Math.max(pt.samples/samples,(performance.now()-t0)/budgetMs)));
      await new Promise(r=>setTimeout(r,0));
    }
    present(1e-3);  // practically unfiltered (0 would divide by zero in the filter)
    raw=copyCanvas(renderer.domElement);
    if(!window.__noOidn&&!window.__noAux)try{const ta=performance.now();aux=renderAux(raw.width,raw.height);console.info('Yardımcı geçişler '+Math.round(performance.now()-ta)+' ms');}
      catch(e){console.warn('Albedo/normal geçişleri alınamadı, yalnızca renkle gürültü giderme:',e);}
  }finally{undoStudio();req();}
  if(window.__ptKeep)window.__ptLast={raw:copyCanvas(raw),aux};  // test hook: compare denoiser variants on the same samples
  const tn=performance.now();
  if(!window.__noOidn)try{await denoiseCanvas(raw,aux,p=>{if(onProgress)onProgress(.9+.1*p);});console.info('OIDN '+Math.round(performance.now()-tn)+' ms, '+Math.floor(pt.samples)+' örnek'+(aux?', albedo + normal':''));}
    catch(e){console.warn('OIDN kullanılamadı, basit gürültü giderme ile devam:',e);}
  if(onProgress)onProgress(1);
  return raw;
}
function copyCanvas(src){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;c.getContext('2d').drawImage(src,0,0);return c;}

/* OIDN's auxiliary inputs, rendered by the rasteriser from the same camera while the studio set-up is still applied
   (so screens are the emissive glass, hidden decals stay hidden, the sweep is there). Noise-free ("clean aux"), with
   4x MSAA standing in for the path tracer's pixel jitter. Rendered in horizontal bands of at most AUX_BAND_PX pixels
   (camera view offset), so the float MSAA target stays small at 3840 px. Returns top-down RGB Uint8Arrays (8 bits are
   plenty for a guide image, and a third of the memory of floats at export sizes):
   - albedo: linear base colour (with its map), sRGB-encoded (S2L decodes it per tile); emissive surfaces (screens)
     their emissive image; nothing = black;
   - normal: view-space normals (with normal / bump maps) encoded 0..1; nothing = 0.5 (zero vector).
   Additive / transmissive surfaces are left out: OIDN wants the first diffuse-ish hit behind them. */
const AUX_BAND_PX=2e6;
function renderAux(w,h){
  const bh=Math.max(1,Math.min(h,Math.floor(AUX_BAND_PX/w)));
  const rt=new THREE.WebGLRenderTarget(w,bh,{type:THREE.FloatType,samples:4}),buf=new Float32Array(w*bh*4);
  const meshes=[],made=new Map(),out={albedo:new Uint8Array(w*h*3),normal:new Uint8Array(w*h*3)};
  scene.traverseVisible(x=>{if(x.isMesh&&x.material)meshes.push([x,x.material]);});
  const swap=(m,k)=>{
    if(!made.has(m)){
      const skip=m.blending===THREE.AdditiveBlending||m.transmission>0,base={side:m.side,alphaTest:m.alphaTest,visible:m.visible&&!skip};
      const emit=!!m.emissiveMap,a=new THREE.MeshBasicMaterial(Object.assign({map:emit?m.emissiveMap:m.map||null,alphaMap:m.alphaMap||null,toneMapped:false},base));
      if(emit)a.color.copy(m.emissive);else if(m.color)a.color.copy(m.color);
      ['r','g','b'].forEach(c=>{a.color[c]=Math.min(1,a.color[c]);});
      const n=new THREE.MeshNormalMaterial(Object.assign({normalMap:m.normalMap||null,bumpMap:m.bumpMap||null},base));
      if(m.normalScale)n.normalScale.copy(m.normalScale);if(m.bumpScale!==undefined)n.bumpScale=m.bumpScale;
      made.set(m,{albedo:a,normal:n});
    }
    return made.get(m)[k];
  };
  const bg=scene.background,cc=renderer.getClearColor(new THREE.Color()),ca=renderer.getClearAlpha(),target=renderer.getRenderTarget();
  const view=camera.view&&camera.view.enabled?Object.assign({},camera.view):null;
  try{
    scene.background=null;
    for(const [k,clear,enc] of [['albedo',0,true],['normal',.5,false]]){
      meshes.forEach(([x,m])=>{x.material=Array.isArray(m)?m.map(q=>swap(q,k)):swap(m,k);});
      const o=out[k];
      for(let y0=0;y0<h;y0+=bh){
        y0=Math.min(y0,h-bh);  // the last band is shifted up rather than shrunk: same target, same view size
        camera.setViewOffset(w,h,0,y0,w,bh);
        renderer.setRenderTarget(rt);renderer.setClearColor(new THREE.Color(clear,clear,clear),1);renderer.clear();renderer.render(scene,camera);
        renderer.readRenderTargetPixels(rt,0,0,w,bh,buf);
        for(let r=0;r<bh;r++){const s=(bh-1-r)*w*4,d=(y0+r)*w*3;  // flip to top-down rows, drop alpha, quantise
          for(let x=0;x<w;x++)for(let c=0;c<3;c++){const v=Math.min(1,Math.max(0,buf[s+x*4+c]));o[d+x*3+c]=enc?L2S8[Math.round(v*4095)]:Math.round(v*255);}}
      }
    }
  }finally{
    meshes.forEach(([x,m])=>{x.material=m;});scene.background=bg;
    if(view)camera.setViewOffset(view.fullWidth,view.fullHeight,view.offsetX,view.offsetY,view.width,view.height);else camera.clearViewOffset();
    renderer.setRenderTarget(target);renderer.setClearColor(cc,ca);rt.dispose();
    made.forEach(v=>{v.albedo.dispose();v.normal.dispose();});
  }
  return out;
}

/* Runs OIDN on a 2D canvas in place. The canvas holds sRGB-encoded LDR pixels; the colour is linearised for the
   network and encoded back here (the package's own srgb switch would also bend the albedo and normal channels).
   The image is cut into TILE-sized tiles here, not by the package: its tiler pads every processed tile to the whole
   image while reassembling (quadratic in the tile count: minutes and a frozen tab at 3840 px). The network is built
   once for one tile; neighbouring tiles overlap by OVERLAP px and are blended with a linear ramp. Tiles are
   processed one per task so the page keeps repainting; onProgress(0..1) follows the tiles.
   window.__oidnSrgb = false feeds the sRGB values unchanged (test hook). */
let oidnP=null;
const TILE=512,OVERLAP=32;  // TILE: a multiple of 16 (the UNet's stride)
const S2L=new Float32Array(256).map((_,i)=>{const v=i/255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);});
const L2S=v=>v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055;
const L2S8=new Uint8Array(4096).map((_,i)=>Math.round(255*L2S(i/4095)));  // 12-bit linear -> 8-bit sRGB
async function denoiseCanvas(c,aux,onProgress){
  if(!oidnP)oidnP=import('denoiser').then(({Denoiser})=>{// on its own WebGL context the package switches tfjs to half-float textures (about 30% faster, no visible change)
    const d=new Denoiser('webgl',document.createElement('canvas'));
    d.weightsUrl=new URL('oidn',document.baseURI).href;d.quality='balanced';d.hdr=false;d.srgb=false;d.outputMode='float32';
    d.useTiling=false;d.width=TILE;d.height=TILE;return d;});
  const d=await oidnP,W=c.width,H=c.height,n=W*H,g=c.getContext('2d'),img=g.getImageData(0,0,W,H),a=img.data;
  const lin=window.__oidnSrgb!==false,T=TILE*TILE;
  const col=new Float32Array(T*3),alb=aux?new Float32Array(T*3):null,nrm=aux?new Float32Array(T*3):null;
  const acc=new Float32Array(n*3),wt=new Float32Array(n);  // blended output and the weight each pixel has received
  // tile origins: a stride of TILE - OVERLAP, the last tile pulled back to the edge (never past it)
  const starts=L=>{if(L<=TILE)return [0];const s=[];for(let p=0;;p+=TILE-OVERLAP){if(p+TILE>=L){s.push(L-TILE);break;}s.push(p);}return s;};
  const xs=starts(W),ys=starts(H),total=xs.length*ys.length;let done=0;
  const ramp=(p,o,L)=>{let w=1;if(o>0)w=Math.min(w,(p+1)/OVERLAP);if(o+TILE<L)w=Math.min(w,(TILE-p)/OVERLAP);return w;};
  for(const y0 of ys)for(const x0 of xs){
    for(let ty=0;ty<TILE;ty++){const sy=Math.min(H-1,y0+ty);  // the source is clamped when the image is smaller than a tile
      for(let tx=0;tx<TILE;tx++){const si=sy*W+Math.min(W-1,x0+tx),di=(ty*TILE+tx)*3;
        for(let k=0;k<3;k++){col[di+k]=lin?S2L[a[si*4+k]]:a[si*4+k]/255;if(aux){alb[di+k]=S2L[aux.albedo[si*3+k]];nrm[di+k]=aux.normal[si*3+k]/255;}}}}
    await d.setInputData('color',col,{channels:3});  // no resetInputs between tiles: it marks the network for a rebuild
    if(aux){await d.setInputData('albedo',alb,{channels:3});await d.setInputData('normal',nrm,{channels:3});}
    const out=await d.execute();
    if(!out||out.length!==T*3)throw new Error('OIDN çıktısı geçersiz');
    for(let ty=0;ty<TILE&&y0+ty<H;ty++){const wy=ramp(ty,y0,H);
      for(let tx=0;tx<TILE&&x0+tx<W;tx++){const w=wy*ramp(tx,x0,W),si=(y0+ty)*W+x0+tx,di=(ty*TILE+tx)*3;
        acc[si*3]+=out[di]*w;acc[si*3+1]+=out[di+1]*w;acc[si*3+2]+=out[di+2]*w;wt[si]+=w;}}
    if(onProgress)onProgress(++done/total);
    await new Promise(r=>setTimeout(r,0));
  }
  // a failed GPU pass can come back blank without an error: keep the raw image unless the result has content
  let lit=0,ref=0;
  for(let i=0;i<n;i+=97){lit+=(acc[i*3]+acc[i*3+1]+acc[i*3+2])/wt[i];for(let k=0;k<3;k++)ref+=lin?S2L[a[i*4+k]]:a[i*4+k]/255;}
  if(ref>0&&lit<ref*.5)throw new Error('OIDN çıktısı boş');
  // only the colour changes; the original alpha (transparent backgrounds) stays
  for(let i=0;i<n;i++){const iw=1/wt[i];for(let k=0;k<3;k++){const v=acc[i*3+k]*iw;a[i*4+k]=lin?L2S8[v<=0?0:v>=1?4095:Math.round(v*4095)]:Math.round(255*Math.min(1,Math.max(0,v)));}}
  g.putImageData(img,0,0);
}
let gradient=null;
function gradientEnv(){if(!gradient){gradient=new GradientEquirectTexture(64);gradient.topColor.set('#d6d8dc');gradient.bottomColor.set('#8a8e94');gradient.update();}return gradient;}

/* Preview: called every frame while the scene is idle; builds the studio once, then adds a sample per frame at
   PREVIEW_SCALE resolution until PREVIEW_SAMPLES. Any change (req) calls stopPreview, which restores the scene. */
let preview=null;
function previewTick(){
  if(!hdri){loadHdri().catch(()=>{hdri=null;});return;}  // first time: wait for the HDRI
  if(!preview){ensurePT();preview={undo:setupStudio(hdri)};pt.renderScale=PREVIEW_SCALE;pt.tiles.set(1,1);pt.setScene(scene,camera);}
  if(pt.samples>=PREVIEW_SAMPLES)return;
  pt.renderSample();
  if(pt.samples>=4)present();  // until then the raster image stays on the canvas (no blank flash)
}
function stopPreview(){if(!preview)return;const p=preview;preview=null;p.undo();}
const previewing=()=>!!preview,previewSamples=()=>preview&&pt?pt.samples:0;

export {denoiseCanvas,setDenoise,previewSamples,previewTick,previewing,renderPathTraced,stopPreview};
