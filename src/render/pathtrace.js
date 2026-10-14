import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {DenoiseMaterial,GradientEquirectTexture,ShapedAreaLight,WebGLPathTracer} from 'three-gpu-pathtracer';
import {RT} from '../devices/rt.js';
import {lightTan} from '../lights/mods.js';
import {LIGHT_SCALE,camera,overlays,renderer,req,scene} from './renderer.js';
import {ground,hemi,lightRoot,pivot,wall} from './stage.js';
import {floorOn as floorShown,state,view} from '../state/state.js';
import {D2R,V3,mkCanvas} from '../util.js';
import {paintGradient} from './backgrounds.js';

/* Photo quality (three-gpu-pathtracer): the export (renderPathTraced) and the idle preview (previewTick) share one
   studio set-up (setupStudio), applied to the live scene and undone right after; nothing else ever sees it, because
   any change (req) stops the preview first. During the set-up:
   - the studio lights become area lights of the same size / position (sun: directional), calibrated to the raster
     irradiance (E = intensity * LIGHT_SCALE); the environment is the raster view's grey studio sweep (the room of
     environment.js, so metal reflects the same bright, even surroundings) with a photographed studio HDRI (Poly Haven,
     CC0) laid over it (max), which adds real softbox highlights; it stands in for hemisphere + reflection environment;
   - screens become emissive glass (MeshBasic does not emit here), glare / contact-shadow decals and overlays hide;
   - clearcoat materials are swapped for coat-less copies: this path tracer renders clearcoat black;
   - with the floor on and a solid / gradient background, an opaque floor disc replaces the shadow catcher (real
     contact shadows). It is calibrated like one (calibrateFloor): an albedo map plus a self-glow map that fills in
     what the lights and the environment put on an unoccluded floor, so the floor shows the background (solid or
     gradient, sampled where each floor point lands on screen; after tone mapping) and darkens only where the devices
     block light, by shadowOpacity at most. Away from the devices the albedo fades to zero and the glow to the plain
     background, and the outer rim fades out (alpha) between two equal colours, so the disc's edge is invisible;
     outside it the export paints the background behind the transparent render. The fade is not what hides the floor
     (stochastic transparency between different colours left a grainy band where perspective squeezes the far floor).
     There is no wall: a backdrop wall in a dark colour used to be what the metal surfaces reflected (silver bodies
     came out black). The background itself is always composited outside, as chosen (solid / gradient exact, no tone
     mapping). */
const SHAPES={softbox:[1.25,.85],strip:[.3,1.5],window:[1,1.3],octa:[1,1,true],umbrella:[1,1,true],dish:[1,1,true],
  flash:[1,1,true],reflector:[1,1,true],bulb:[1,1,true],overcast:[1,1,true]};
const ENV_SCALE=1,SCREEN_GLOW=.9,SCREEN_SPEC=.35,PT_TEX_BUDGET=512*1024*1024,HDRI='hdri/photo_studio_01_1k.hdr',ENV_MEAN=.45;  // ENV_MEAN: the HDRI's average radiance before it is laid over the sweep
// the raster room's sweep (environment.js roomMat), sRGB stops over the equirect's v (0 = zenith)
const ROOM=[[0,'#d6d8dc'],[.45,'#bcc0c5'],[.52,'#9fa3a9'],[1,'#8a8e94']];
const PREVIEW_SAMPLES=64,PREVIEW_SCALE=.5,FLOOR_SOLID=1.6,FLOOR_FADE=6,FLOOR_RIM=.8,TRACE_TILE_PX=1e6;  // floor: full shadows to FLOOR_SOLID x fit radius, none (plain background) at FLOOR_FADE x, the disc's radius; alpha fades over the outer 1 - FLOOR_RIM of it
let pt=null,denoise=null,hdri=null,floorCal=null;  // floorCal: the current set-up's floor, for calibrateFloor
const envUpCache=new Map();
const PX=new Float32Array(4);  // the path tracer's target is float

// radial weight of the floor's shadow catching: 1 inside FLOOR_SOLID / FLOOR_FADE of the disc radius, smoothstep to
// 0 at the rim (floorWeightMap: the same as a texture, for the calibration mask)
const floorWeight=t=>{const a=FLOOR_SOLID/FLOOR_FADE,u=Math.min(1,Math.max(0,(t-a)/(1-a)));return 1-u*u*(3-2*u);};
const radialTex=new Map();
function radialMap(name,f){
  if(radialTex.has(name))return radialTex.get(name);
  const N=512,c=mkCanvas(N,N),g=c.getContext('2d'),gr=g.createRadialGradient(N/2,N/2,0,N/2,N/2,N/2);
  for(let i=0;i<=32;i++){const v=Math.round(255*f(i/32));gr.addColorStop(i/32,`rgb(${v},${v},${v})`);}
  g.fillStyle=gr;g.fillRect(0,0,N,N);const t=new THREE.CanvasTexture(c);radialTex.set(name,t);return t;
}
const floorWeightMap=()=>radialMap('weight',floorWeight);
// the rim's alpha: 1 up to FLOOR_RIM of the radius, smoothstep to 0 at the edge
const floorRimMap=()=>radialMap('rim',t=>{const u=Math.min(1,Math.max(0,(t-FLOOR_RIM)/(1-FLOOR_RIM)));return 1-u*u*(3-2*u);});
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
const texelReader=tex=>tex.type===THREE.HalfFloatType?THREE.DataUtils.fromHalfFloat:v=>v;
// Builds the environment: the raster room's sweep with the HDRI (scaled to ENV_MEAN on average) laid over it.
// The loader hands out half floats (Uint16): decode before summing (summed raw they once made the scale ~1e-5,
// an environment that was effectively off, so the old backdrop wall was all that metal reflected).
async function loadHdri(){
  if(hdri)return hdri;
  const src=await new HDRLoader().loadAsync(HDRI),{width:W,height:H}=src.image,d=src.image.data,f=texelReader(src),n=W*H;
  let sum=0;for(let i=0;i<d.length;i+=4)sum+=.2126*f(d[i])+.7152*f(d[i+1])+.0722*f(d[i+2]);
  const k=ENV_MEAN/Math.max(1e-4,sum/n),out=new Float32Array(n*4),room=new THREE.Color(),a=new THREE.Color(),b=new THREE.Color();
  for(let y=0;y<H;y++){
    const v=(y+.5)/H;let j=1;while(j<ROOM.length-1&&ROOM[j][0]<v)j++;
    const [v0,c0]=ROOM[j-1],[v1,c1]=ROOM[j];room.lerpColors(a.set(c0),b.set(c1),(v-v0)/(v1-v0));  // set(): sRGB -> linear
    for(let x=0;x<W;x++){const i=(y*W+x)*4;
      out[i]=Math.max(room.r,f(d[i])*k);out[i+1]=Math.max(room.g,f(d[i+1])*k);out[i+2]=Math.max(room.b,f(d[i+2])*k);out[i+3]=1;}
  }
  src.dispose();
  // same row order as the source (row 0 = zenith), so flipY stays true like the loader's texture
  hdri=new THREE.DataTexture(out,W,H,THREE.RGBAFormat,THREE.FloatType);hdri.mapping=THREE.EquirectangularReflectionMapping;hdri.flipY=true;hdri.needsUpdate=true;
  return hdri;
}
// Irradiance an up-facing surface receives from the environment at intensity 1, over pi: the radiance a white
// Lambertian floor shows. Cached per texture.
function envUp(tex){
  if(envUpCache.has(tex))return envUpCache.get(tex);
  const {width:W,height:H}=tex.image,d=tex.image.data,f=texelReader(tex);let e=0;
  for(let y=0;y<H;y++){const th=tex.flipY?Math.PI*(y+.5)/H:Math.PI*(1-(y+.5)/H);if(th>=Math.PI/2)continue;  // angle from the zenith
    const w=Math.cos(th)*Math.sin(th)*(Math.PI/H)*(2*Math.PI/W);
    for(let x=0;x<W;x++){const i=(y*W+x)*4;e+=w*(.2126*f(d[i])+.7152*f(d[i+1])+.0722*f(d[i+2]));}}
  envUpCache.set(tex,e/Math.PI);return e/Math.PI;
}
function ensurePT(){
  if(pt)return pt;
  pt=new WebGLPathTracer(renderer);
  Object.assign(pt,{renderToCanvas:false,dynamicLowRes:false,minSamples:0,renderDelay:0,fadeDuration:0,bounces:4,filterGlossyFactor:.4});
  pt.tiles.set(1,1);  // one whole sample per call (the default 3x3 tiles need nine calls per sample)
  denoise=new DenoiseMaterial({blending:THREE.NoBlending,premultipliedAlpha:renderer.getContextAttributes().premultipliedAlpha});
  // the package's filter premultiplies the colour by alpha before tone mapping and sRGB encoding, and the browser then
  // divides the encoded result by alpha: every half-covered pixel (edges on a transparent background, the floor's rim)
  // came out dark and discoloured. Filter straight colour instead; three's premultiplied_alpha_fragment multiplies the
  // encoded colour by alpha at the end, which is what the canvas expects
  const fs=denoise.fragmentShader,patched=fs.replace('centrPx.rgb *= centrPx.a;','').replace('walkPx.rgb *= walkPx.a;','');
  if(patched===fs)console.warn('DenoiseMaterial: premultiply lines not found, half-covered pixels will come out dark');
  denoise.fragmentShader=patched;denoise.needsUpdate=true;
  // the package jitters camera rays with a tent filter one pixel in radius (two pixels wide): visibly softer than the
  // raster's one-pixel box, worst at small export sizes where screen text is only a few pixels tall. Use the same box.
  const ptm=pt._pathTracer.material,pfs=ptm.fragmentShader,
    sharp=pfs.replace('tentFilter( ruv.x ) * ssd.x, tentFilter( ruv.y ) * ssd.y','( ruv.x - 0.5 ) * ssd.x, ( ruv.y - 0.5 ) * ssd.y');
  if(sharp===pfs)console.warn('PhysicalPathTracingMaterial: pixel filter line not found, photo exports stay softer');
  ptm.fragmentShader=sharp;ptm.needsUpdate=true;
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
        roughness:.06,specularIntensity:SCREEN_SPEC,map:o.custom?src.map:null,transparent:!!o.custom,alphaTest:o.custom?.01:0,side:src.side});
      const targets=meshArg?[meshArg]:[];if(!meshArg)o.holder.traverse(x=>{if(x.material===src)targets.push(x);});
      targets.forEach(m=>set(m,'material',glow));added.push(glow);
    });
    // clearcoat renders black in this path tracer: use a coat-less copy whose roughness leans toward the coat's
    o.holder.traverse(x=>{const m=x.material;if(!x.isMesh||!m||!(m.clearcoat>0)||added.includes(m))return;
      if(!coatless.has(m)){const c=m.clone();c.clearcoat=0;c.roughness=m.roughness+(m.clearcoatRoughness-m.roughness)*Math.min(1,m.clearcoat)*.5;coatless.set(m,c);added.push(c);}
      set(x,'material',coatless.get(m));});
  });
  // the render is always transparent and composited over the chosen background (image backgrounds and 2D items
  // behind the devices show through); the floor disc only comes with a solid / gradient colour it can be painted in
  const floorOn=floorShown()&&(state.bg==='solid'||state.bg==='gradient')&&!state.items.some(i=>!i.front);
  set(scene,'environment',env);set(scene,'environmentIntensity',ENV_SCALE*(.25+.75*state.ambient));
  set(scene,'background',null);
  const extra=new THREE.Group();scene.add(extra);
  if(floorOn){
    // a shadow catcher in the background colour: white and glow-less until calibrateFloor measures it (after the path
    // tracer has the scene; both maps exist from the start so the texture set does not change). Lambertian only: a
    // dielectric's grazing-angle sheen would brighten a dark floor with the environment
    const tex=fill=>{const c=mkCanvas(FLOOR_N,FLOOR_N),g=c.getContext('2d');g.fillStyle=fill;g.fillRect(0,0,FLOOR_N,FLOOR_N);return new THREE.CanvasTexture(c);};  // linear values (the tracer stores textures as 8-bit linear)
    const albedo=tex('#fff'),glow=tex('#000');
    const mat=new THREE.MeshPhysicalMaterial({roughness:1,metalness:0,specularIntensity:0,side:THREE.DoubleSide,map:albedo,emissive:0,emissiveMap:glow,transparent:true,alphaMap:floorRimMap()});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(R*FLOOR_FADE*2,R*FLOOR_FADE*2),mat);
    floor.rotation.x=-Math.PI/2;floor.position.set(pivot.position.x,ground.position.y,0);extra.add(floor);added.push(mat,floor.geometry,albedo,glow);
    // the background as painted behind the render, small, to sample where each floor point lands on screen
    const bw=BG_N,bh=Math.max(1,Math.round(BG_N/view.aspect)),bc=mkCanvas(bw,bh),bgc=bc.getContext('2d');
    if(state.bg==='solid'){bgc.fillStyle=state.solid;bgc.fillRect(0,0,bw,bh);}else paintGradient(bgc,bw,bh,state);
    floorCal={mesh:floor,mat,albedo,glow,disc:R*FLOOR_FADE,bgPx:bgc.getImageData(0,0,bw,bh).data,bw,bh,le:envUp(env)*scene.environmentIntensity};
  }else floorCal=null;
  studioLights().forEach(l=>extra.add(l));
  return ()=>{floorCal=null;scene.remove(extra);for(let i=undo.length-1;i>=0;i--){const [o,k,v]=undo[i];o[k]=v;}added.forEach(a=>a.dispose&&a.dispose());};
}
/* Floor calibration, once the path tracer has the scene (setScene). The floor is a shadow catcher: an albedo map
   plus a self-glow map that together show the background wherever nothing blocks the light, and darken where the
   devices do.
   - lightsAt(p): what a white, unoccluded floor shows at p from the studio lights (sun: I sin(el); area light:
     I d^2 cosF cosL / r^2, with I the state intensity; checked against the tracer), plus le, the environment's share;
   - a tiny pass (CAL_PX, CAL_SAMPLES) with a white, glow-less floor measures what the tracer really puts there; per
     visible floor pixel inside the solid zone (box-blurred against the noise) the measured lights' share over the
     model's gives a ratio, and the 80th percentile of the ratios (lit floor, not the shadows) is the model's scale k
     (light shapes, bounce light, env occlusion). A least-squares fit of env share + light scale matched worse;
   - albedo s = shadowOpacity / (k L_ref), so that full shadow = colour (1 - shadowOpacity). Per map texel, with the
     floor point's background colour c = preTone(background where it lands on screen) and its weight w (floorWeight):
     albedo = c s w, glow = c (1 - s w (le + k lightsAt(p))); w fades the shadows out and the glow into the plain
     background towards the rim. preTone gives the radiance that Neutral tone mapping turns into the background colour
     (the background itself is painted untouched). The tracer keeps textures as 8-bit linear, too coarse for dark
     colours, so the maps hold ratios to the brightest colour c0 (per channel, in material.color / emissive) instead.
     The floor still comes out 2-5% darker than the background far from the device (the model's falloff), a soft
     vignette rather than an edge.
   Only the materials are updated afterwards (no BVH rebuild). Async: the first sample after setScene compiles the
   shader (renderSample is a no-op while pt.isCompiling); bails out if the set-up was undone meanwhile. */
const CAL_PX=64,CAL_SAMPLES=24,CAL_BLUR=2,FLOOR_N=256,BG_N=96,PRE_MAX=1.5;  // PRE_MAX: the floor's radiance cap (its glow is real light that bounces onto the devices)
function lightModel(){
  const R=view.fitRadius,c=new V3(pivot.position.x,pivot.position.y,0);
  return state.lights.filter(L=>L.intensity>0).map(L=>{const az=L.az*D2R,el=L.el*D2R,d=R*L.dist;
    const pos=new V3(c.x+d*Math.cos(el)*Math.sin(az),c.y+d*Math.sin(el),c.z+d*Math.cos(el)*Math.cos(az));
    return {sun:L.mod==='sun',I:L.intensity,el,d,pos,n:c.clone().sub(pos).normalize()};});
}
const _v=new V3();
function lightsAt(lights,p){
  let t=0;
  for(const l of lights){
    if(l.sun){t+=l.I*Math.sin(l.el);continue;}
    _v.copy(p).sub(l.pos);const r2=_v.lengthSq(),r=Math.sqrt(r2);if(r<1e-6)continue;
    const cosF=-_v.y/r,cosL=_v.dot(l.n)/r;if(cosF>0&&cosL>0)t+=l.I*l.d*l.d*cosF*cosL/r2;
  }
  return t;
}
// three's NeutralToneMapping (Khronos PBR Neutral), and its inverse: the radiance that maps to colour bg
function neutral(c,ex){
  let r=c.r*ex,g=c.g*ex,b=c.b*ex;const x=Math.min(r,g,b),off=x<.08?x-6.25*x*x:.04;r-=off;g-=off;b-=off;
  const sc=.76,peak=Math.max(r,g,b);if(peak<sc)return [r,g,b];
  const d=.24,np=1-d*d/(peak+d-sc),k=np/peak,m=1-1/(.15*(peak-np)+1);
  return [r*k+(np-r*k)*m,g*k+(np-g*k)*m,b*k+(np-b*k)*m];
}
function preTone(bg){
  const ex=renderer.toneMappingExposure,m=Math.min(bg.r,bg.g,bg.b),c=bg.clone();
  // below the compression knee Neutral only subtracts an offset set by the darkest channel: invert it exactly
  const x=m<.04?Math.sqrt(m)/2.5:m+.04;c.addScalar(x-m).multiplyScalar(1/ex);
  if(Math.max(bg.r,bg.g,bg.b)+.04<.76)return c;
  // above it (highlight roll-off, desaturation): fixed-point iteration on the residual. Neutral never reaches 1,
  // and a floor glowing far above the lights would light the devices from below: capped at PRE_MAX, and the export
  // scales the floor pixels by what is missing (fixFloor)
  for(let i=0;i<40;i++){const o=neutral(c,ex);c.r+=bg.r-o[0];c.g+=bg.g-o[1];c.b+=bg.b-o[2];}
  const mx=Math.max(c.r,c.g,c.b);if(mx>PRE_MAX)c.multiplyScalar(PRE_MAX/mx);
  return c;
}
/* Export only: multiplies the floor's pixels by background / neutral(preTone(background)) per channel, the little that
   the tone-mapped floor falls short of the painted background (near-white backgrounds, PRE_MAX). The floor's pixels
   come from a full-size raster mask taken while the set-up is still applied (fixFloorMask); the ratio is smooth
   (sampled from the small background canvas), so it leaves the gradient and the shadows alone. */
function fixFloorMask(){
  if(!floorCal)return null;
  const fc=floorCal,W=renderer.domElement.width,H=renderer.domElement.height,m0=fc.mat.alphaMap;
  fc.mat.alphaMap=null;  // the rim counts as floor too (a ratio of about 1 does no harm where it is mostly background)
  try{return {mask:floorMask(fc.mesh,W,H,true),bgPx:fc.bgPx,bw:fc.bw,bh:fc.bh,W,H};}finally{fc.mat.alphaMap=m0;}
}
function fixFloor(c,fx){
  const {mask,bgPx,bw,bh,W,H}=fx,g=c.getContext('2d'),img=g.getImageData(0,0,W,H),a=img.data,ratios=new Map(),bg=new THREE.Color(),ex=renderer.toneMappingExposure;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(!mask[(H-1-y)*W+x])continue;  // the mask's rows are bottom-up
    const bi=(Math.min(bh-1,Math.floor(y/H*bh))*bw+Math.min(bw-1,Math.floor(x/W*bw)))*4,key=bgPx[bi]<<16|bgPx[bi+1]<<8|bgPx[bi+2];
    let r=ratios.get(key);
    if(!r){bg.setRGB(S2L[bgPx[bi]],S2L[bgPx[bi+1]],S2L[bgPx[bi+2]]);const o=neutral(preTone(bg),ex);r=[bg.r/Math.max(1e-4,o[0]),bg.g/Math.max(1e-4,o[1]),bg.b/Math.max(1e-4,o[2])].map(v=>Math.min(1.2,Math.max(1,v)));ratios.set(key,r);}
    const i=(y*W+x)*4;for(let k=0;k<3;k++){const v=S2L[a[i+k]]*r[k];a[i+k]=L2S8[v>=1?4095:Math.round(v*4095)];}
  }
  g.putImageData(img,0,0);
}
const p80=a=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length*.8)];};
// artboard position (0..1) of a world point: through the camera, undoing the live view's crop (view offset)
function boardUv(p,out){
  p.project(camera);let u=(p.x+1)/2,v=(1-p.y)/2;const cv=camera.view;
  if(cv&&cv.enabled){u=(cv.offsetX+u*cv.width)/cv.fullWidth;v=(cv.offsetY+v*cv.height)/cv.fullHeight;}
  out[0]=Math.min(1,Math.max(0,u));out[1]=Math.min(1,Math.max(0,v));return out;
}
async function calibrateFloor(){
  const fc=floorCal;if(!fc)return;
  const {mesh,mat,albedo,glow,disc,bgPx,bw,bh,le}=fc,W=renderer.domElement.width,H=renderer.domElement.height,scale=pt.renderScale,tiles=pt.tiles.clone();
  pt.renderScale=Math.min(1,CAL_PX/Math.max(W,H));pt.tiles.set(1,1);
  mat.color.setScalar(1);mat.emissive.setScalar(0);pt.updateMaterials();
  for(let i=0;pt.samples<CAL_SAMPLES&&i<200;i++){pt.renderSample();await new Promise(r=>setTimeout(r,0));if(floorCal!==fc)return;}
  const w=pt.target.width,h=pt.target.height,px=new Float32Array(w*h*4);renderer.readRenderTargetPixels(pt.target,0,0,w,h,px);
  const mask=floorMask(mesh,w,h),lum=new Float32Array(w*h),meas=[],mod=[],lights=lightModel(),gy=mesh.position.y,cam=camera.position,q=new V3();
  for(let i=0;i<w*h;i++)lum[i]=.2126*px[i*4]+.7152*px[i*4+1]+.0722*px[i*4+2];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(!mask[y*w+x])continue;
    // the floor point under this pixel (rows are bottom-up), for the model
    q.set((x+.5)/w*2-1,(y+.5)/h*2-1,.5).unproject(camera).sub(cam);const t=(gy-cam.y)/q.y;if(!(t>0))continue;
    mod.push(lightsAt(lights,q.multiplyScalar(t).add(cam)));
    let s=0,n=0;
    for(let j=Math.max(0,y-CAL_BLUR);j<=Math.min(h-1,y+CAL_BLUR);j++)for(let i=Math.max(0,x-CAL_BLUR);i<=Math.min(w-1,x+CAL_BLUR);i++)if(mask[j*w+i]){s+=lum[j*w+i];n++;}
    meas.push(s/n);
  }
  const ratios=meas.map((m,i)=>Math.max(0,m-le)/mod[i]).filter((r,i)=>mod[i]>1e-4);
  const k=ratios.length>=16?p80(ratios):1,Lref=k*(mod.length?p80(mod):0),O=state.shadowOpacity;  // too little floor in view: trust the model
  const s=Math.min(1,O/Math.max(1e-3,Lref),1/Math.max(1e-3,Lref+le));
  if(window.__ptDebug)console.log('floor: scale',k.toFixed(3),'lights',Lref.toFixed(3),'env',le.toFixed(3),'pixels',meas.length,'albedo',s.toFixed(3));
  // the maps over the disc (canvas row 0 = far side, z = -disc): first the target colour c and the factors per
  // texel (preTone cached per background colour), then bytes as ratios to the brightest colour c0
  const N=FLOOR_N,col=new Float32Array(N*N*3),fa=new Float32Array(N*N),fg=new Float32Array(N*N),c0=[0,0,0];
  const tones=new Map(),bg=new THREE.Color(),uv=[0,0];
  for(let py=0;py<N;py++)for(let qx=0;qx<N;qx++){
    const fx=((qx+.5)/N-.5)*2,fz=((py+.5)/N-.5)*2,wt=floorWeight(Math.hypot(fx,fz)),i=py*N+qx;
    q.set(mesh.position.x+fx*disc,gy,fz*disc);const L=le+k*lightsAt(lights,q);
    boardUv(q.set(mesh.position.x+fx*disc,gy,fz*disc),uv);
    const bi=(Math.min(bh-1,Math.floor(uv[1]*bh))*bw+Math.min(bw-1,Math.floor(uv[0]*bw)))*4,key=bgPx[bi]<<16|bgPx[bi+1]<<8|bgPx[bi+2];
    let c=tones.get(key);if(!c){c=preTone(bg.setRGB(S2L[bgPx[bi]],S2L[bgPx[bi+1]],S2L[bgPx[bi+2]]));tones.set(key,c);}
    col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;c0[0]=Math.max(c0[0],c.r);c0[1]=Math.max(c0[1],c.g);c0[2]=Math.max(c0[2],c.b);
    fa[i]=s*wt;fg[i]=Math.max(0,1-s*wt*L);
  }
  const ga=albedo.image.getContext('2d'),gg=glow.image.getContext('2d'),ia=ga.createImageData(N,N),ig=gg.createImageData(N,N),da=ia.data,dg=ig.data;
  for(let i=0;i<N*N;i++)for(let ch=0;ch<3;ch++){const r=c0[ch]>0?col[i*3+ch]/c0[ch]:0;da[i*4+ch]=Math.round(255*r*fa[i]);dg[i*4+ch]=Math.round(255*r*fg[i]);da[i*4+3]=dg[i*4+3]=255;}
  ga.putImageData(ia,0,0);gg.putImageData(ig,0,0);albedo.needsUpdate=true;glow.needsUpdate=true;
  mat.color.setRGB(c0[0],c0[1],c0[2]);mat.emissive.setRGB(c0[0],c0[1],c0[2]);pt.updateMaterials();
  pt.renderScale=scale;pt.tiles.copy(tiles);pt.reset();
}
function floorMask(mesh,w,h,whole){
  const rt=new THREE.WebGLRenderTarget(w,h),buf=new Uint8Array(w*h*4),out=new Uint8Array(w*h);
  const target=renderer.getRenderTarget(),cc=renderer.getClearColor(new THREE.Color()),ca=renderer.getClearAlpha(),bg=scene.background,m0=mesh.material;
  const white=new THREE.MeshBasicMaterial({map:whole?null:floorWeightMap(),side:THREE.DoubleSide}),black=new THREE.MeshBasicMaterial({color:0});  // whole: the disc, not just the solid zone
  try{
    scene.background=null;renderer.setRenderTarget(rt);
    mesh.material=white;mesh.layers.set(1);camera.layers.set(1);renderer.setClearColor(0,1);renderer.clear();renderer.render(scene,camera);
    renderer.readRenderTargetPixels(rt,0,0,w,h,buf);for(let i=0;i<w*h;i++)out[i]=buf[i*4]>230?1:0;
    mesh.layers.set(0);camera.layers.set(0);mesh.visible=false;scene.overrideMaterial=black;renderer.setClearColor(0xffffff,1);renderer.clear();renderer.render(scene,camera);
    renderer.readRenderTargetPixels(rt,0,0,w,h,buf);for(let i=0;i<w*h;i++)if(buf[i*4]<128)out[i]=0;
  }finally{
    mesh.visible=true;mesh.material=m0;mesh.layers.set(0);camera.layers.set(0);scene.overrideMaterial=null;scene.background=bg;
    renderer.setRenderTarget(target);renderer.setClearColor(cc,ca);rt.dispose();white.dispose();black.dispose();
  }
  return out;
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
  // Khronos Neutral instead of the live view's ACES: identity up to ~0.8, so dark UI backgrounds, the backdrop colour
  // and screen colours come out as chosen instead of being crushed by the ACES toe; only highlights roll off
  const tm=renderer.toneMapping;renderer.toneMapping=THREE.NeutralToneMapping;
  renderer.setRenderTarget(null);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(qs,qc);renderer.toneMapping=tm;
}

/* Export: path traces at the canvas' current size until `samples` or `budgetMs`, then removes the remaining noise with
   Intel Open Image Denoise (the "denoiser" package, weights self-hosted in public/oidn), keeping the alpha channel.
   OIDN also gets noise-free albedo and normal passes of the same view (renderAux): with them it keeps texture detail
   (key legends, screen text) instead of smoothing it as noise. Without them (aux failed) it denoises colour only.
   Returns a 2D canvas with the final image. onProgress(0..1): sampling up to .9, denoising the rest. */
async function renderPathTraced(samples,onProgress,budgetMs=60000){
  stopPreview();
  const env=await loadHdri().catch(()=>null)||gradientEnv(),undoStudio=setupStudio(env),t0=performance.now();
  let raw,aux=null,fix=null;
  try{
    ensurePT();pt.renderScale=1;{const s=textureSizeFor(scene);pt.textureSize.set(s,s);}pt.setScene(scene,camera);await calibrateFloor();
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
    raw=copyCanvas(renderer.domElement);if(floorShown())fix=fixFloorMask();
    if(!window.__noOidn&&!window.__noAux)try{const ta=performance.now();aux=renderAux(raw.width,raw.height);console.info('Yardımcı geçişler '+Math.round(performance.now()-ta)+' ms');}
      catch(e){console.warn('Albedo/normal geçişleri alınamadı, yalnızca renkle gürültü giderme:',e);}
  }finally{undoStudio();req();}
  if(window.__ptKeep)window.__ptLast={raw:copyCanvas(raw),aux};  // test hook: compare denoiser variants on the same samples
  const tn=performance.now();
  if(!window.__noOidn)try{await denoiseCanvas(raw,aux,p=>{if(onProgress)onProgress(.9+.1*p);});console.info('OIDN '+Math.round(performance.now()-tn)+' ms, '+Math.floor(pt.samples)+' örnek'+(aux?', albedo + normal':''));}
    catch(e){console.warn('OIDN kullanılamadı, basit gürültü giderme ile devam:',e);}
  if(fix)fixFloor(raw,fix);
  if(onProgress)onProgress(1);
  return raw;
}
// The path tracer resamples every texture into one 2D array of a single size (1024 px by default, which blurs the
// 4096 px screen texture): the largest power of two that keeps the array within PT_TEX_BUDGET bytes, at most 4096.
const TEX_SLOTS=['map','emissiveMap','normalMap','bumpMap','roughnessMap','metalnessMap','alphaMap','clearcoatMap','clearcoatRoughnessMap','clearcoatNormalMap'];
function textureSizeFor(sc){
  const seen=new Set();
  sc.traverseVisible(x=>{if(!x.isMesh)return;(Array.isArray(x.material)?x.material:[x.material]).forEach(m=>{m&&TEX_SLOTS.forEach(k=>{if(m[k])seen.add(m[k]);});});});
  let s=4096;while(s>1024&&seen.size*s*s*4>PT_TEX_BUDGET)s/=2;return s;
}
function copyCanvas(src){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;c.getContext('2d').drawImage(src,0,0);return c;}

/* OIDN's auxiliary inputs, rendered by the rasteriser from the same camera while the studio set-up is still applied
   (so screens are the emissive glass, hidden decals stay hidden, the floor disc is there). Noise-free ("clean aux"), with
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
      const skip=m.blending===THREE.AdditiveBlending||m.transmission>0,base={side:m.side,alphaTest:m.alphaTest,transparent:m.transparent,opacity:m.opacity,visible:m.visible&&!skip};  // the floor's rim fades in the guides too
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
  if(!preview){ensurePT();const p=preview={undo:setupStudio(hdri),busy:true};pt.renderScale=PREVIEW_SCALE;pt.tiles.set(1,1);pt.textureSize.set(1024,1024);pt.setScene(scene,camera);
    calibrateFloor().finally(()=>{p.busy=false;});}
  if(preview.busy||pt.samples>=PREVIEW_SAMPLES)return;
  pt.renderSample();
  if(pt.samples>=4)present();  // until then the raster image stays on the canvas (no blank flash)
}
function stopPreview(){if(!preview)return;const p=preview;preview=null;p.undo();}
const previewing=()=>!!preview,previewSamples=()=>preview&&pt?pt.samples:0;

export {denoiseCanvas,setDenoise,previewSamples,previewTick,previewing,renderPathTraced,stopPreview};
