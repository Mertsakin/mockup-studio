import * as THREE from 'three';
import {apertureCm,apertureSample,dof,dofOn,focusDistance} from './lens.js';
import {camera,crop,onIdle,redraw,renderer,scene,shift} from './renderer.js';

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
// first: samples in the frame right after a change (1 in the studio; the embed player raises it while the scene
// keeps moving, where single-sample PCSS shadows would show their pattern)
const ACC={frame:null,acc:null,w:0,h:0,type:null,n:0,max:64,paused:false,first:1};  // paused: the live loop waits (video export renders)
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
/* one point of the aperture for sample i: the camera moved there (its own x / y axes), the projection shifted by
   P·offset / F so points on the focus plane land where they did (thin lens). Returns the position to restore. */
function lensSample(i){
  const pos=camera.position.clone(),r=apertureCm()/2,[ax,ay]=apertureSample(i,dof().blades),dx=ax*r,dy=ay*r,F=focusDistance();
  const tanV=Math.tan(camera.fov*Math.PI/360)/(camera.zoom||1);
  camera.position.x+=dx;camera.position.y+=dy;camera.updateMatrixWorld();
  shift.dx=dx/(F*tanV*camera.aspect);shift.dy=dy/(F*tanV);camera.updateProjectionMatrix();
  return {pos};
}
function renderSample(i){
  renderer.getDrawingBufferSize(dbs);const w=dbs.x,h=dbs.y;
  if(i===0){hookAll();renderer.shadowMap.needsUpdate=true;}
  // sub-pixel jitter (one drawing-buffer pixel wide), combined with the live crop when there is one
  const c=crop.c,jx=halton(2,i)-.5,jy=halton(3,i)-.5;
  if(i>0){if(c)camera.setViewOffset(c.fw,c.fh,c.x+jx*c.w/w,c.y+jy*c.h/h,c.w,c.h);else camera.setViewOffset(w,h,jx,jy,w,h);}
  seedU.value=i;
  // depth of field: the camera moves within the aperture, the image shifts back so the focus plane stays put
  const lens=dofOn()?lensSample(i):null;
  renderer.setRenderTarget(ACC.frame);renderer.clear();renderer.render(scene,camera);
  if(lens){camera.position.copy(lens.pos);camera.updateMatrixWorld();shift.dx=0;shift.dy=0;camera.updateProjectionMatrix();}
  if(i>0){if(c)camera.setViewOffset(c.fw,c.fh,c.x,c.y,c.w,c.h);else camera.clearViewOffset();}
  quad.material=addMat;addMat.uniforms.tex.value=ACC.frame.texture;
  renderer.setRenderTarget(ACC.acc);if(i===0)renderer.clear();
  renderer.autoClear=false;renderer.render(quadScene,quadCam);renderer.autoClear=true;
}
function present(n){
  quad.material=showMat;showMat.uniforms.tex.value=ACC.acc.texture;showMat.uniforms.count.value=n;
  renderer.setRenderTarget(null);renderer.clear();renderer.render(quadScene,quadCam);
}
// beforeSample(i): called before each sample (video motion blur moves the scene between samples; shadows follow)
function renderNow(samples,beforeSample){
  renderer.getDrawingBufferSize(dbs);
  if(!accEnsure(dbs.x,dbs.y)){if(beforeSample)beforeSample(0);hookAll();renderer.shadowMap.needsUpdate=true;renderer.setRenderTarget(null);renderer.render(scene,camera);return;}
  for(let i=0;i<samples;i++){if(beforeSample){beforeSample(i);renderer.shadowMap.needsUpdate=true;}renderSample(i);}
  present(samples);
}
renderer.shadowMap.autoUpdate=false;
/* Low-end hardware: while the scene keeps changing frame after frame (a drag, an orbit, the embed following the
   pointer), each frame is one fresh sample at full resolution. Where that cannot keep the frame rate, the moving
   frames are drawn smaller (MOTION.scale of the drawing buffer, down to MIN_SCALE) and stretched onto the canvas;
   the scale is learned from the frame interval while moving (EMA over rAF deltas, so GPU time counts too) and kept
   for the next drag. The first still frame is full resolution again and accumulates as before, so the image the
   user stops on (and every export) is unchanged. While converging, slow frames take one sample instead of two.
   window.__noAdapt turns it off (measurements). */
const MOTION={scale:1,ema:0,last:0,lastDirty:-1e9,prev:false,moving:false,lo:null};
const MIN_SCALE=.5,SLOW_MS=24,FAST_MS=15;
function loEnsure(w,h){
  const lo=MOTION.lo;if(lo&&lo.width===w&&lo.height===h)return lo;
  if(lo)lo.dispose();
  MOTION.lo=new THREE.WebGLRenderTarget(w,h,{samples:4,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
    colorSpace:THREE.SRGBColorSpace,internalFormat:'RGBA8',depthBuffer:true,stencilBuffer:true});
  MOTION.lo.isXRRenderTarget=true;return MOTION.lo;
}
function renderMoving(w,h){
  const s=MOTION.scale,lo=loEnsure(Math.max(1,Math.round(w*s)),Math.max(1,Math.round(h*s)));
  hookAll();renderer.shadowMap.needsUpdate=true;seedU.value=0;
  const lens=dofOn()?lensSample(0):null;
  renderer.setRenderTarget(lo);renderer.clear();renderer.render(scene,camera);
  if(lens){camera.position.copy(lens.pos);camera.updateMatrixWorld();shift.dx=0;shift.dy=0;camera.updateProjectionMatrix();}
  quad.material=showMat;showMat.uniforms.tex.value=lo.texture;showMat.uniforms.count.value=1;
  renderer.setRenderTarget(null);renderer.clear();renderer.render(quadScene,quadCam);
}
function pace(now,dirty){
  const dt=MOTION.last?now-MOTION.last:16;MOTION.last=now;
  // moving: changed now and shortly before (pointer events may skip a frame); only those frame intervals say how fast
  // motion can be drawn (an idle gap is not slowness)
  MOTION.moving=dirty&&(MOTION.prev||now-MOTION.lastDirty<150);MOTION.prev=dirty;if(dirty)MOTION.lastDirty=now;
  if(MOTION.moving&&dt<1000){
    MOTION.ema=MOTION.ema?MOTION.ema*.8+dt*.2:dt;
    if(MOTION.ema>SLOW_MS)MOTION.scale=Math.max(MIN_SCALE,MOTION.scale*.9);
    else if(MOTION.ema<FAST_MS)MOTION.scale=Math.min(1,MOTION.scale*1.05);
  }
  return dt;
}
function startLoop(){(function loop(now){
  requestAnimationFrame(loop);
  if(ACC.paused)return;
  const dirty=redraw.dirty,dt=pace(now||performance.now(),dirty);
  if(dirty){redraw.dirty=false;ACC.n=0;}
  // a second changed frame in a row: the scene is moving; draw it small if the hardware needs that
  if(MOTION.moving&&MOTION.scale<.98&&!window.__noAdapt){
    renderer.getDrawingBufferSize(dbs);if(ACC.type){renderMoving(dbs.x,dbs.y);return;}
  }
  // the depth of field needs more samples for smooth blur (the aperture is sampled by them)
  const max=dofOn()?DOF_SAMPLES:ACC.max;
  if(ACC.n>=max){onIdle.forEach(f=>f());return;}
  renderer.getDrawingBufferSize(dbs);
  if(!accEnsure(dbs.x,dbs.y)){hookAll();renderer.shadowMap.needsUpdate=true;renderer.setRenderTarget(null);renderer.render(scene,camera);ACC.n=ACC.max;return;}
  const per=ACC.n===0?ACC.first:(dt>SLOW_MS*1.5&&!window.__noAdapt?1:2);
  for(let k=0;k<per&&ACC.n<max;k++){renderSample(ACC.n);ACC.n++;}
  present(ACC.n);
})();}

const DOF_SAMPLES=192;
const pauseLive=on=>{ACC.paused=on;if(!on)redraw.dirty=true;};
const setFirstSamples=n=>{ACC.first=Math.max(1,Math.min(8,Math.round(n)));};
// motionScale(): the current scale of moving frames (1 = full resolution; the debug harness reads it)
const motionScale=()=>MOTION.scale;
export {DOF_SAMPLES,motionScale,pauseLive,renderNow,setFirstSamples,startLoop};
