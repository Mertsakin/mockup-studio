import * as THREE from 'three';
import {fitModel} from './rt.js';
import {ANISO,renderer,scene} from '../render/renderer.js';
import {DEFAULT_MODEL_CM} from '../state/constants.js';
import {fmt} from '../lang.js';
import {V3,mkCanvas} from '../util.js';

/* Imported 3D models (GLB / glTF). A model asset is the loaded file: {isModel, src (blob URL), blob, name, bytes,
   scene (the parsed root, never added to a scene itself), long (its longest edge in file units), center, pts (surface
   points for the floor: see extentPoints)}. Snapshots, project files and the autosave treat it like an image or a
   video: referred to by key ('m…', io/project.js), stored as media/<key>.glb in a .mockup.zip. The asset library
   (ui/assets.js) lists it next to the images.
   A device of type 'model' (state.devices) holds one in d.model and is built from a clone of its scene (geometry and
   materials shared, so placing the same file twice costs nothing): holder > orient > group > fit > clone. `fit`
   centres the model and scales it to d.modelSize (cm on its longest edge; DEFAULT_MODEL_CM by default: glTF files
   are in metres, and a 1 m product would dwarf the phones). Materials come from the file as they are: PBR,
   clearcoat, transmission, textures (the path tracer gets coat-less copies like the devices', pathtrace.js).
   On loading, lights and cameras in the file are dropped, instanced meshes become plain meshes (the path tracer reads
   neither) and skinned meshes their bind pose. */
const MODEL_MAX_MB=50;
const isModelFile=f=>!!f&&(/\.(glb|gltf)$/i.test(f.name||'')||/^model\/gltf/.test(f.type||''));
// the loaders arrive with the first model (dynamic imports): a scene without one, and the embed player for it,
// never downloads them
let loader=null;
async function gltfLoader(){
  if(loader)return loader;
  const [{GLTFLoader},{DRACOLoader},{KTX2Loader},{MeshoptDecoder}]=await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),import('three/addons/loaders/DRACOLoader.js'),
    import('three/addons/loaders/KTX2Loader.js'),import('three/addons/libs/meshopt_decoder.module.js')]);
  if(loader)return loader;
  loader=new GLTFLoader();
  // decoders for compressed files (Draco, meshopt, KTX2 textures); the decoder binaries are copies of three's
  // (public/draco, public/basis), fetched on first use
  const base=new URL(import.meta.env.BASE_URL||'./',location.href).href;
  loader.setDRACOLoader(new DRACOLoader().setDecoderPath(base+'draco/'));
  loader.setMeshoptDecoder(MeshoptDecoder);
  try{loader.setKTX2Loader(new KTX2Loader().setTranscoderPath(base+'basis/').detectSupport(renderer));}catch(e){/* no KTX2 textures then */}
  return loader;
}
// a loaded asset from a URL (blob / object URL); rejects with a message the UI can show
async function loadModel(src,name,blob){
  let gltf;
  try{gltf=await (await gltfLoader()).loadAsync(src);}
  catch(e){throw new Error(String(e&&e.message||e).includes('bin')||/\.gltf$/i.test(name||'')?'gltf':'parse',{cause:e});}
  const root=gltf.scene||(gltf.scenes&&gltf.scenes[0]);
  if(!root)throw new Error('empty');
  prepare(root);
  const box=new THREE.Box3().setFromObject(root,true);
  if(box.isEmpty())throw new Error('empty');
  const size=box.getSize(new V3()),long=Math.max(size.x,size.y,size.z)||1;
  if(!blob)blob=await (await fetch(src)).blob();
  return {isModel:true,src,blob,name:name||'Model',bytes:blob.size,scene:root,long,size,center:box.getCenter(new V3()),pts:extentPoints(root)};
}
// a File from the user (the file input, a drop): typed so project files know its extension
async function loadModelFile(file){
  const glb=!/\.gltf$/i.test(file.name||''),blob=new Blob([file],{type:glb?'model/gltf-binary':'model/gltf+json'});
  return loadModel(URL.createObjectURL(blob),(file.name||'Model').replace(/\.(glb|gltf)$/i,''),blob);
}
const ERRORS={gltf:'Bu .gltf dosyası başka dosyalara (.bin, dokular) başvuruyor; tek dosyalık bir .glb kullan.',
  parse:'Model açılamadı. Geçerli bir .glb (glTF 2.0) dosyası seç.',empty:'Dosyada görünür bir geometri yok.'};
const modelError=e=>ERRORS[e&&e.message]||ERRORS.parse;

/* Makes the parsed scene renderable here: no lights or cameras from the file; instanced meshes unrolled and skinned
   meshes frozen (the path tracer reads neither, and a static pose is what a product shot wants); textures filtered
   like the devices' own. */
function prepare(root){
  const drop=[],swap=[];
  root.traverse(o=>{if(o.isLight||o.isCamera)drop.push(o);else if(o.isInstancedMesh||o.isSkinnedMesh)swap.push(o);});
  drop.forEach(o=>o.removeFromParent());
  const m4=new THREE.Matrix4();
  swap.forEach(o=>{
    let r;
    if(o.isInstancedMesh){r=new THREE.Group();for(let i=0;i<o.count;i++){o.getMatrixAt(i,m4);const mesh=new THREE.Mesh(o.geometry,o.material);m4.decompose(mesh.position,mesh.quaternion,mesh.scale);r.add(mesh);}}
    else r=new THREE.Mesh(o.geometry,o.material);
    r.name=o.name;r.position.copy(o.position);r.quaternion.copy(o.quaternion);r.scale.copy(o.scale);
    o.children.slice().forEach(c=>r.add(c));
    if(o.parent)o.parent.add(r);o.removeFromParent();
  });
  root.traverse(o=>{
    if(!o.isMesh)return;
    o.frustumCulled=false;  // fit / holder transforms change often; bounds are cheap to skip
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(!m)return;
      ['map','emissiveMap','normalMap','roughnessMap','metalnessMap','aoMap'].forEach(k=>{if(m[k]&&m[k].isTexture)m[k].anisotropy=ANISO;});
      // materials of the file are shared by every placement; the path tracer and the raster read them as they are
      m.needsUpdate=true;
    });
  });
  root.updateMatrixWorld(true);
}
/* Points that bound the model from below whatever its rotation, for the floor (render/transform.js extents): the
   farthest vertex along each of N directions (a Fibonacci sphere plus the six axes). Exact for the axis directions,
   so an upright or turned model stands exactly on the floor; a tilted one within ~1 % of its radius. Reading every
   vertex once here keeps extents() off the vertex data (a large file would make every transform update crawl). */
const DIRS=(function(){
  const n=250,out=[[0,-1,0],[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]],g=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<n;i++){const y=1-(i/(n-1))*2,r=Math.sqrt(1-y*y),t=g*i;out.push([Math.cos(t)*r,y,Math.sin(t)*r]);}
  return out;
})();
function extentPoints(root){
  const best=new Float64Array(DIRS.length).fill(-Infinity),pt=new Float32Array(DIRS.length*3),v=new V3();
  root.traverse(o=>{
    if(!o.isMesh||!o.geometry||!o.geometry.attributes.position)return;
    const p=o.geometry.attributes.position,mw=o.matrixWorld;
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i).applyMatrix4(mw);
      for(let k=0;k<DIRS.length;k++){const d=DIRS[k],s=v.x*d[0]+v.y*d[1]+v.z*d[2];if(s>best[k]){best[k]=s;pt[k*3]=v.x;pt[k*3+1]=v.y;pt[k*3+2]=v.z;}}
    }
  });
  return pt;
}
// placeholder when the file is missing (a project whose model could not be loaded): a plain grey slab
function missingModel(){
  const g=new THREE.Group(),box=new THREE.Mesh(new THREE.BoxGeometry(7,14.7,1.5),new THREE.MeshStandardMaterial({color:0x9a9ea6,roughness:.7,metalness:0}));
  g.add(box);g.updateMatrixWorld(true);
  return {isModel:true,missing:true,scene:g,long:14.7,center:new V3(),size:new V3(7,14.7,1.5),pts:extentPoints(g)};
}
// the device builder (BUILDERS.model): the asset's scene, centred and scaled by fitModel
function buildModel(m,d){
  const a=d.model||missingModel(),g=new THREE.Group(),fit=new THREE.Group();
  fit.add(a.scene.clone(true));g.add(fit);
  const o={group:g,fit,asset:a,screen:null,glare:null,sw:1,sh:1,rotatable:false,model:true,missing:!!a.missing};
  fitModel(o,d);
  return o;
}
// the model's own size (its file units read as metres, the glTF convention) in cm
const realSizeCm=a=>a?+(a.long*100).toFixed(2):DEFAULT_MODEL_CM;

/* Thumbnail for the asset library: the model alone, lit by the studio's current environment, rendered off-screen
   into a small target (transparent). Cached on the asset. */
const THUMB=192;
let thumbRT=null;
function modelThumb(a){
  if(a.thumb)return a.thumb;
  try{
    const s=new THREE.Scene();s.environment=scene.environment;
    const root=a.scene.clone(true),k=1/a.long;root.scale.setScalar(k);root.position.copy(a.center).multiplyScalar(-k);s.add(root);
    s.add(new THREE.HemisphereLight(0xffffff,0x667788,scene.environment?.6:1.6));
    const sun=new THREE.DirectionalLight(0xffffff,scene.environment?1.2:2.2);sun.position.set(1,1.4,1.2);s.add(sun);
    const r=a.size.length()/2*k,cam=new THREE.PerspectiveCamera(28,1,.01,50),dist=r/Math.sin(14*Math.PI/180)*1.02;
    cam.position.set(.55,.42,1).normalize().multiplyScalar(dist);cam.lookAt(0,0,0);
    if(!thumbRT){thumbRT=new THREE.WebGLRenderTarget(THUMB,THUMB,{samples:4,colorSpace:THREE.SRGBColorSpace,internalFormat:'RGBA8'});thumbRT.isXRRenderTarget=true;}  // tone mapped + sRGB like the screen (accumulation.js)
    const prev=renderer.getRenderTarget(),clear=renderer.getClearAlpha();
    renderer.setRenderTarget(thumbRT);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(s,cam);
    const px=new Uint8Array(THUMB*THUMB*4);renderer.readRenderTargetPixels(thumbRT,0,0,THUMB,THUMB,px);
    renderer.setRenderTarget(prev);renderer.setClearAlpha(clear);
    const c=mkCanvas(THUMB,THUMB),g=c.getContext('2d'),img=g.createImageData(THUMB,THUMB);
    for(let y=0;y<THUMB;y++)img.data.set(px.subarray((THUMB-1-y)*THUMB*4,(THUMB-y)*THUMB*4),y*THUMB*4);  // GL rows run bottom-up
    g.putImageData(img,0,0);a.thumb=c.toDataURL('image/png');
  }catch(e){a.thumb='';}
  return a.thumb;
}
const fmtMB=b=>fmt(b/1e6,b<1e7?1:0)+' MB';

export {MODEL_MAX_MB,buildModel,fmtMB,isModelFile,loadModel,loadModelFile,modelError,modelThumb,realSizeCm};
