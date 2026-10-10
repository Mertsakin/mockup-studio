import * as THREE from 'three';
import {M,lin} from './materials.js';
import {ANISO} from '../render/renderer.js';
import {mkCanvas,roundRect} from '../util.js';

/* ---------- geometry helpers ---------- */
function rrShape(w,h,r,cx,cy){
  cx=cx||0;cy=cy||0;
  const s=new THREE.Shape(),hw=w/2,hh=h/2,R=Array.isArray(r)?r:[r,r,r,r];
  const [tl,tr,br,bl]=R.map(v=>Math.max(.0005,Math.min(v,hw,hh)));
  s.moveTo(cx-hw+bl,cy-hh);s.lineTo(cx+hw-br,cy-hh);s.absarc(cx+hw-br,cy-hh+br,br,-Math.PI/2,0,false);
  s.lineTo(cx+hw,cy+hh-tr);s.absarc(cx+hw-tr,cy+hh-tr,tr,0,Math.PI/2,false);
  s.lineTo(cx-hw+tl,cy+hh);s.absarc(cx-hw+tl,cy+hh-tl,tl,Math.PI/2,Math.PI,false);
  s.lineTo(cx-hw,cy-hh+bl);s.absarc(cx-hw+bl,cy-hh+bl,bl,Math.PI,Math.PI*1.5,false);
  return s;
}
// Concentric corners: an opening inset into a rounded outline gets radius = outer radius - wall thickness.
// With unequal walls each corner subtracts the thicker of its two sides. Returns [tl,tr,br,bl] for rrShape.
function innerRadii(r,top,right,bottom,left){
  const f=(a,b)=>Math.max(0,r-Math.max(a,b));
  return [f(top,left),f(top,right),f(bottom,right),f(bottom,left)];
}
function flatRR(w,h,r){
  const g=new THREE.ShapeGeometry(rrShape(w,h,r),24),p=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/w+.5,p.getY(i)/h+.5);
  uv.needsUpdate=true;return g;
}
function slab(w,h,r,d,b){
  const g=new THREE.ExtrudeGeometry(rrShape(w-2*b,h-2*b,r-b),{depth:d-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:5,curveSegments:24});
  g.translate(0,0,-(d-2*b)/2);return g;
}
const mesh=(g,m)=>new THREE.Mesh(g,m);
function lens(r,frameMat){
  const grp=new THREE.Group();
  const ring=mesh(new THREE.CylinderGeometry(r+.11,r+.13,.12,48),frameMat);ring.rotation.x=Math.PI/2;
  const inner=mesh(new THREE.CylinderGeometry(r+.01,r+.01,.13,48),M.lens);inner.rotation.x=Math.PI/2;inner.position.z=-.004;
  const face=mesh(new THREE.CircleGeometry(r,48),M.lensFace);face.rotation.y=Math.PI;face.position.z=-.072;
  grp.add(ring,inner,face);return grp;
}
/* small helpers for openings: dark recessed shapes placed on a surface */
function hole(w,h,r,mat){return mesh(flatRR(w,h,r),mat||M.port);}
function onSide(m,axis,sign,pos){ // orient a flat (+z facing) mesh to face along an axis
  if(axis==='x')m.rotation.y=sign*Math.PI/2;else if(axis==='y')m.rotation.x=-sign*Math.PI/2;else if(sign<0)m.rotation.y=Math.PI;
  m.position.copy(pos);return m;
}
function dotTexture(cols,rows,wpx,hpx,rad,color){
  const c=mkCanvas(wpx,hpx),g=c.getContext('2d');g.fillStyle=color;
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const x=(i+.5+(j%2)*.5)*wpx/(cols+.5),y=(j+.5)*hpx/rows;g.beginPath();g.arc(x,y,rad,0,Math.PI*2);g.fill();}
  const t=new THREE.CanvasTexture(c);t.anisotropy=ANISO;return t;
}
function slotTexture(n,wpx,hpx,color){
  const c=mkCanvas(wpx,hpx),g=c.getContext('2d');g.fillStyle=color;const sw=wpx/n;
  for(let i=0;i<n;i++){roundRect(g,i*sw+sw*.25,hpx*.08,sw*.5,hpx*.84,sw*.25);g.fill();}
  const t=new THREE.CanvasTexture(c);t.anisotropy=ANISO;return t;
}
/* Contact shadow / ambient-occlusion stand-in for the raster renderer: a blurred dark rectangle on the floor plane
   right under where a device touches it (w x d in cm, local XZ). Hidden by applyTransform unless the floor is on and
   the plane faces up; skipped by the path tracer, which computes real contact shadows. */
const AO_TEX={};
function aoTexture(w,d,soft){
  const key=(w/d).toFixed(2)+'/'+soft;if(AO_TEX[key])return AO_TEX[key];
  const W=512,H=Math.max(48,Math.round(512*d/w)),c=mkCanvas(W,H),g=c.getContext('2d'),pad=soft*Math.min(W,H)*.22;
  g.filter='blur('+(pad*.55).toFixed(1)+'px)';g.fillStyle='#000';g.fillRect(pad*1.1,pad*1.1,W-2.2*pad,H-2.2*pad);
  return AO_TEX[key]=new THREE.CanvasTexture(c);
}
function aoPlane(w,d,opacity,y,soft){
  const m=mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:0x000000,alphaMap:aoTexture(w,d,soft||1),transparent:true,opacity,depthWrite:false}));
  m.rotation.x=-Math.PI/2;m.position.y=y;m.userData.decal=true;m.userData.ao=true;m.renderOrder=-1;return m;
}
function alphaMat(t){return new THREE.MeshStandardMaterial({color:lin(0x030304),roughness:1,metalness:0,alphaMap:t,transparent:true,alphaTest:.35,depthWrite:false});}

export {alphaMat,aoPlane,dotTexture,flatRR,hole,innerRadii,lens,mesh,onSide,rrShape,slab,slotTexture};
