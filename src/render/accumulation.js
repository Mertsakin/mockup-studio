import * as THREE from 'three';
import {camera,redraw,renderer,scene} from './renderer.js';

/* ---------- progressive rendering: jittered samples are averaged while the view is still (anti-aliasing + grain-free soft shadows) ---------- */
const seedU={value:0};
function hookSeed(mat){
  if(!mat||mat.isShaderMaterial||mat.userData.seedHooked)return;
  const prev=mat.onBeforeCompile;
  mat.onBeforeCompile=function(sh,r){sh.uniforms.pcssSeed=seedU;if(prev)prev.call(this,sh,r);};
  mat.userData.seedHooked=true;mat.needsUpdate=true;
}
function hookAll(){scene.traverse(o=>{const m=o.material;if(Array.isArray(m))m.forEach(hookSeed);else hookSeed(m);});}
const QUAD_VS='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
const addMat=new THREE.ShaderMaterial({uniforms:{tex:{value:null}},vertexShader:QUAD_VS,
  fragmentShader:'uniform sampler2D tex;varying vec2 vUv;void main(){gl_FragColor=texture2D(tex,vUv);}',
  blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneFactor,
  depthTest:false,depthWrite:false,toneMapped:false});
const showMat=new THREE.ShaderMaterial({uniforms:{tex:{value:null},count:{value:1}},vertexShader:QUAD_VS,
  fragmentShader:'uniform sampler2D tex;uniform float count;varying vec2 vUv;void main(){gl_FragColor=clamp(texture2D(tex,vUv)/count,0.0,1.0);}',
  blending:THREE.NoBlending,depthTest:false,depthWrite:false,toneMapped:false});
const quadScene=new THREE.Scene(),quadCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),addMat);
quad.frustumCulled=false;quadScene.add(quad);
const ACC={frame:null,acc:null,w:0,h:0,type:null,n:0,max:64};
(function(){
  if(renderer.extensions.has('EXT_color_buffer_float'))ACC.type=THREE.HalfFloatType;
})();
function accEnsure(w,h){
  if(!ACC.type)return false;
  if(ACC.frame&&ACC.w===w&&ACC.h===h)return true;
  if(ACC.frame){ACC.frame.dispose();ACC.acc.dispose();}
  try{
    // Each sample is rendered like the screen: per-material tone mapping and sRGB encoding in the shader, stored
    // as plain 8-bit (RGBA8, not SRGB8). three applies tone mapping / output colour space only to the canvas or
    // to targets flagged isXRRenderTarget; in WebGLRenderer the flag has no other effect. Averaging then happens
    // in display space, as in r128.
    ACC.frame=new THREE.WebGLRenderTarget(w,h,{samples:4,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
      colorSpace:THREE.SRGBColorSpace,internalFormat:'RGBA8',depthBuffer:true,stencilBuffer:true});
    ACC.frame.isXRRenderTarget=true;
    ACC.acc=new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,type:ACC.type,depthBuffer:false,stencilBuffer:false});
    ACC.w=w;ACC.h=h;return true;
  }catch(e){ACC.type=null;ACC.frame=null;return false;}
}
function halton(b,i){let f=1,r=0;i+=1;while(i>0){f/=b;r+=f*(i%b);i=Math.floor(i/b);}return r;}
const dbs=new THREE.Vector2();
function renderSample(i){
  renderer.getDrawingBufferSize(dbs);const w=dbs.x,h=dbs.y;
  if(i===0){hookAll();renderer.shadowMap.needsUpdate=true;}
  if(i>0)camera.setViewOffset(w,h,halton(2,i)-.5,halton(3,i)-.5,w,h);
  seedU.value=(i*0.618034)%1*97.0;
  renderer.setRenderTarget(ACC.frame);renderer.clear();renderer.render(scene,camera);
  if(i>0)camera.clearViewOffset();
  quad.material=addMat;addMat.uniforms.tex.value=ACC.frame.texture;
  renderer.setRenderTarget(ACC.acc);if(i===0)renderer.clear();
  renderer.autoClear=false;renderer.render(quadScene,quadCam);renderer.autoClear=true;
}
function present(n){
  quad.material=showMat;showMat.uniforms.tex.value=ACC.acc.texture;showMat.uniforms.count.value=n;
  renderer.setRenderTarget(null);renderer.clear();renderer.render(quadScene,quadCam);
}
function renderNow(samples){
  renderer.getDrawingBufferSize(dbs);
  if(!accEnsure(dbs.x,dbs.y)){hookAll();renderer.shadowMap.needsUpdate=true;renderer.setRenderTarget(null);renderer.render(scene,camera);return;}
  for(let i=0;i<samples;i++)renderSample(i);present(samples);
}
renderer.shadowMap.autoUpdate=false;
function startLoop(){(function loop(){
  requestAnimationFrame(loop);
  if(redraw.dirty){redraw.dirty=false;ACC.n=0;}
  if(ACC.n>=ACC.max)return;
  renderer.getDrawingBufferSize(dbs);
  if(!accEnsure(dbs.x,dbs.y)){hookAll();renderer.shadowMap.needsUpdate=true;renderer.setRenderTarget(null);renderer.render(scene,camera);ACC.n=ACC.max;return;}
  const per=ACC.n===0?1:2;
  for(let k=0;k<per&&ACC.n<ACC.max;k++){renderSample(ACC.n);ACC.n++;}
  present(ACC.n);
})();}

export {renderNow,startLoop};
