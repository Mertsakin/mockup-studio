import * as THREE from 'three';
import {DenoiseMaterial,GradientEquirectTexture,ShapedAreaLight,WebGLPathTracer} from 'three-gpu-pathtracer';
import {RT} from '../devices/rt.js';
import {lightTan} from '../lights/mods.js';
import {LIGHT_SCALE,camera,renderer,req,scene} from './renderer.js';
import {ground,hemi,lightRoot,pivot,wall} from './stage.js';
import {state,view} from '../state/state.js';
import {D2R,V3} from '../util.js';

/* Photo-quality export: path traces the scene in place (three-gpu-pathtracer), then restores everything.
   For the duration of the render:
   - the studio lights become area lights of the same size / position, the sun a directional light;
   - screens become emissive glass (MeshBasic does not emit in the path tracer), glare and contact-shadow decals hide;
   - with the floor on and an opaque background, a seamless sweep in the background colour replaces the shadow
     catcher (real contact shadows and occlusion); otherwise (transparent or pattern background) the background stays transparent and the export
     composites it as usual (no floor shadow, like the raster render without a floor). The wall option is ignored.
   Calibration: an area light's radiance is chosen so its irradiance at the subject matches the raster light
   (E = intensity * LIGHT_SCALE); the environment stands in for hemisphere + reflection environment. */
const SHAPES={softbox:[1.25,.85],strip:[.3,1.5],window:[1,1.3],octa:[1,1,true],umbrella:[1,1,true],dish:[1,1,true],
  flash:[1,1,true],reflector:[1,1,true],bulb:[1,1,true],overcast:[1,1,true]};
const ENV_SCALE=.5,SCREEN_GLOW=.9;
let pt=null,denoise=null;
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
/* Renders `samples` path traced samples onto the canvas at its current size. onProgress(0..1). */
async function renderPathTraced(samples,onProgress){
  const R=view.fitRadius,undo=[],added=[];
  const set=(o,k,v)=>{undo.push([o,k,o[k]]);o[k]=v;};
  set(lightRoot,'visible',false);set(hemi,'visible',false);set(ground,'visible',false);set(wall,'visible',false);
  RT.forEach(o=>{
    o.holder.traverse(x=>{if(x.userData.ao||x===o.glare)set(x,'visible',false);});
    [[o.screen,o.custom?o.mats.custom:o.mats.screen],...(o.mats.chrome.map?[[null,o.mats.chrome]]:[])].forEach(([meshArg,src])=>{
      const glow=new THREE.MeshPhysicalMaterial({color:0x000000,emissive:0xffffff,emissiveMap:src.map,emissiveIntensity:SCREEN_GLOW,
        roughness:.12,clearcoat:o.custom?0:1,clearcoatRoughness:.02,map:o.custom?src.map:null,transparent:!!o.custom,alphaTest:o.custom?.01:0,side:src.side});
      const targets=meshArg?[meshArg]:[];if(!meshArg)o.holder.traverse(x=>{if(x.material===src)targets.push(x);});
      targets.forEach(m=>set(m,'material',glow));added.push(glow);
    });
  });
  const sweepOn=state.floor&&(state.bg==='solid'||state.bg==='gradient');  // patterns keep their artwork: composite instead
  const env=new GradientEquirectTexture(64);env.topColor.set('#d6d8dc');env.bottomColor.set('#8a8e94');env.update();added.push(env);
  set(scene,'environment',env);set(scene,'environmentIntensity',ENV_SCALE*(.25+.75*state.ambient));
  set(scene,'background',sweepOn?env:null);set(scene,'backgroundIntensity',scene.environmentIntensity);
  const extra=new THREE.Group();scene.add(extra);
  if(sweepOn){
    const mat=new THREE.MeshStandardMaterial({roughness:.9,metalness:0,side:THREE.DoubleSide});
    mat.color.set(state.bg==='solid'?state.solid:state.bg1);
    const sweep=new THREE.Mesh(sweepGeometry(R,ground.position.y),mat);sweep.position.x=pivot.position.x;extra.add(sweep);added.push(mat,sweep.geometry);
  }
  studioLights().forEach(l=>extra.add(l));
  try{
    if(!pt){pt=new WebGLPathTracer(renderer);
      Object.assign(pt,{renderToCanvas:false,dynamicLowRes:false,minSamples:0,renderDelay:0,fadeDuration:0,bounces:4,filterGlossyFactor:.4});
      denoise=new DenoiseMaterial({blending:THREE.NoBlending,premultipliedAlpha:renderer.getContextAttributes().premultipliedAlpha});}
    pt.setScene(scene,camera);
    while(pt.samples<samples){
      pt.renderSample();
      // waiting on a pixel read keeps the GPU queue short (no context loss) and makes progress real, not queued
      renderer.readRenderTargetPixels(pt.target,0,0,1,1,PX);
      if(onProgress)onProgress(Math.min(1,pt.samples/samples));
      await new Promise(r=>setTimeout(r,0));
    }
    // final present: edge-preserving denoise, tone mapping and sRGB on the way to the canvas
    denoise.map=pt.target.texture;denoise.transparent=scene.background===null;
    const q=new THREE.Mesh(new THREE.PlaneGeometry(2,2),denoise),qs=new THREE.Scene(),qc=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    q.frustumCulled=false;qs.add(q);renderer.setRenderTarget(null);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(qs,qc);q.geometry.dispose();
  }finally{
    scene.remove(extra);
    for(let i=undo.length-1;i>=0;i--){const [o,k,v]=undo[i];o[k]=v;}
    added.forEach(a=>a.dispose&&a.dispose());
    req();
  }
}

export {renderPathTraced};
