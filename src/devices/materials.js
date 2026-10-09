import * as THREE from 'three';
import {ANISO} from '../render/renderer.js';
import {COLORS,THEMES} from '../state/constants.js';
import {mkCanvas,rng} from '../util.js';

/* ---------- shared materials & textures ---------- */
const M={
  glass:new THREE.MeshPhysicalMaterial({color:0x030405,roughness:.18,metalness:0,clearcoat:1,clearcoatRoughness:.04}),
  black:new THREE.MeshBasicMaterial({color:0x000000}),
  lens:new THREE.MeshStandardMaterial({color:0x07080a,roughness:.04,metalness:.6}),
  flash:new THREE.MeshStandardMaterial({color:0xf1ead8,roughness:.3,metalness:0}),
  glare:new THREE.MeshPhysicalMaterial({color:0x000000,metalness:0,roughness:.035,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,envMapIntensity:.45}),
  keycap:new THREE.MeshPhysicalMaterial({color:0x08090a,roughness:.72,metalness:0,clearcoat:.08,clearcoatRoughness:.6}),
  well:new THREE.MeshStandardMaterial({color:0x0b0c0e,roughness:.9,metalness:0}),
  port:new THREE.MeshStandardMaterial({color:0x040405,roughness:.95,metalness:0}),
  portIn:new THREE.MeshStandardMaterial({color:0x6c7078,roughness:.5,metalness:.6}),
  rubber:new THREE.MeshStandardMaterial({color:0x1b1c1f,roughness:.95,metalness:0}),
  hole:new THREE.MeshBasicMaterial({color:0x020203})
};
function tex(c){const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=ANISO;return t;}
/* ---------- procedural surface maps (brushed / bead-blasted metal) ---------- */
function heightToNormal(h,w,hh,k){
  const c=mkCanvas(w,hh),g=c.getContext('2d'),img=g.createImageData(w,hh),d=img.data;
  for(let y=0;y<hh;y++)for(let x=0;x<w;x++){
    const l=h[y*w+(x+w-1)%w],r=h[y*w+(x+1)%w],u=h[((y+hh-1)%hh)*w+x],dn=h[((y+1)%hh)*w+x];
    let nx=(l-r)*k,ny=(dn-u)*k;const L=Math.hypot(nx,ny,1),i=(y*w+x)*4;
    d[i]=(nx/L*.5+.5)*255;d[i+1]=(ny/L*.5+.5)*255;d[i+2]=(1/L*.5+.5)*255;d[i+3]=255;}
  g.putImageData(img,0,0);return c;
}
function grayCanvas(v,w,hh){const c=mkCanvas(w,hh),g=c.getContext('2d'),img=g.createImageData(w,hh),d=img.data;
  for(let i=0;i<w*hh;i++){const q=Math.max(0,Math.min(255,v[i]*255));d[i*4]=d[i*4+1]=d[i*4+2]=q;d[i*4+3]=255;}g.putImageData(img,0,0);return c;}
function dataTex(c,rep){const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep,rep);t.anisotropy=ANISO;return t;}
const SURF=(function(){
  const N=512,out={};
  // brushed: streaks along x, each row its own value plus slow drift and a few deeper scratches
  let r=rng(7),h=new Float32Array(N*N),rough=new Float32Array(N*N);
  const row0=new Float32Array(N),row=new Float32Array(N);for(let y=0;y<N;y++)row0[y]=r()-.5;
  for(let y=0;y<N;y++)row[y]=(row0[(y+N-1)%N]+row0[y]*2+row0[(y+1)%N])/4;
  for(let y=0;y<N;y++){const a=row[y];for(let x=0;x<N;x++){
    const drift=Math.sin((x/N)*Math.PI*2*2+y*.21)*.05;h[y*N+x]=a+drift;rough[y*N+x]=.82+(a+.5)*.24;}}
  for(let k=0;k<26;k++){const y=Math.floor(r()*N),x0=Math.floor(r()*N),len=60+r()*260,dep=.25+r()*.3;
    for(let i=0;i<len;i++){const x=(x0+i)%N;h[y*N+x]-=dep;rough[y*N+x]=.75;}}
  out.brushedN=heightToNormal(h,N,N,.6);out.brushedR=grayCanvas(rough,N,N);
  // bead-blasted: fine isotropic grain
  r=rng(11);h=new Float32Array(N*N);rough=new Float32Array(N*N);
  for(let i=0;i<N*N;i++){h[i]=r();}
  const hb=new Float32Array(N*N);for(let y=0;y<N;y++)for(let x=0;x<N;x++){let s=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)s+=h[((y+dy+N)%N)*N+(x+dx+N)%N];hb[y*N+x]=s/9;rough[y*N+x]=.85+(hb[y*N+x]-.5)*.4;}
  out.blastN=heightToNormal(hb,N,N,1.6);out.blastR=grayCanvas(rough,N,N);
  return out;
})();
const FINISHES={
  brushed:{n:'Fırçalanmış',metal:.93,rough:.36,n2:'brushed',ns:.38,rep:.09},
  blasted:{n:'Kumlanmış',metal:.9,rough:.48,n2:'blast',ns:.35,rep:.5},
  chrome:{n:'Krom',metal:1,rough:.07},
  glossy:{n:'Parlak boya',metal:0,rough:.32,clear:1},
  matte:{n:'Mat',metal:0,rough:.72,n2:'blast',ns:.2,rep:.5}
};
const SURF_TEX={};
function surfTex(kind,rep){
  const key=kind+rep;if(SURF_TEX[key])return SURF_TEX[key];
  const t={normal:dataTex(kind==='brushed'?SURF.brushedN:SURF.blastN,rep),rough:dataTex(kind==='brushed'?SURF.brushedR:SURF.blastR,rep)};
  SURF_TEX[key]=t;return t;
}
function applyFinish(mat,fk,colorHex,opts){
  const f=FINISHES[fk]||FINISHES.brushed;opts=opts||{};
  mat.color.set(colorHex).convertSRGBToLinear();
  mat.metalness=opts.metal!==undefined?opts.metal:f.metal;mat.roughness=opts.rough!==undefined?opts.rough:f.rough;
  mat.clearcoat=f.clear||0;mat.clearcoatRoughness=.05;
  if(f.n2){const t=surfTex(f.n2,f.rep);mat.normalMap=t.normal;mat.normalScale.set(f.ns,f.ns);mat.roughnessMap=t.rough;}
  else{mat.normalMap=null;mat.roughnessMap=null;}
  mat.needsUpdate=true;
}
function makeMats(){
  return {frame:new THREE.MeshPhysicalMaterial(),back:new THREE.MeshPhysicalMaterial(),pad:new THREE.MeshPhysicalMaterial(),band:new THREE.MeshPhysicalMaterial(),
    screen:new THREE.MeshBasicMaterial({toneMapped:false}),chrome:new THREE.MeshBasicMaterial({toneMapped:false}),
    custom:new THREE.MeshBasicMaterial({transparent:true,alphaTest:.01,side:THREE.DoubleSide,toneMapped:false})};
}
function colorPreset(d){return d.colorKey==='custom'?{c:d.custom}:(COLORS.find(x=>x.k===d.colorKey)||COLORS[0]);}
function applyColorTo(m,d){
  if(d.type==='browser'){const t=THEMES[d.theme]||THEMES.light;applyFinish(m.frame,'matte',t.body,{rough:.55});return;}
  const c=colorPreset(d).c;
  applyFinish(m.frame,d.finish,c);
  // back panel: frosted glass on phones/tablets, same metal elsewhere
  if(d.type==='phone'||d.type==='tablet'){applyFinish(m.back,'matte',c,{metal:.15,rough:.42});m.back.clearcoat=.35;m.back.clearcoatRoughness=.25;}
  else applyFinish(m.back,d.finish,c);
  applyFinish(m.pad,'matte',c,{metal:Math.min(.6,(FINISHES[d.finish]||{}).metal||0),rough:.36});m.pad.color.multiplyScalar(.92);m.pad.clearcoat=.4;m.pad.clearcoatRoughness=.3;
  applyFinish(m.band,'matte',c,{metal:0,rough:.6});m.band.color.multiplyScalar(.55).addScalar(.04);
}
const LENS_TEX=(function(){
  const c=mkCanvas(256,256),g=c.getContext('2d');g.fillStyle='#050608';g.fillRect(0,0,256,256);
  const rings=[[118,'#1d2026'],[104,'#0b0c10'],[86,'#22252e'],[78,'#07080b'],[56,'#141a2a'],[44,'#05060a'],[26,'#0d1430'],[14,'#020205']];
  rings.forEach(([rad,col])=>{g.beginPath();g.arc(128,128,rad,0,Math.PI*2);g.fillStyle=col;g.fill();});
  const gr=g.createRadialGradient(108,104,2,118,112,60);gr.addColorStop(0,'rgba(120,90,200,.55)');gr.addColorStop(.5,'rgba(40,90,160,.25)');gr.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gr;g.beginPath();g.arc(128,128,60,0,Math.PI*2);g.fill();
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
})();
M.lensFace=new THREE.MeshPhysicalMaterial({map:LENS_TEX,roughness:.08,metalness:0,clearcoat:1,clearcoatRoughness:.02});

export {FINISHES,M,applyColorTo,makeMats,tex};
