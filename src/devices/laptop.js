import * as THREE from 'three';
import {alphaMat,dotTexture,flatRR,hole,mesh,onSide,rrShape,slab,slotTexture} from './geometry.js';
import {buildKeyboard} from './keyboard.js';
import {M} from './materials.js';
import {V3} from '../util.js';

const GRILLE_TEX=dotTexture(150,4,4096,128,7,'#fff');
const VENT_TEX=slotTexture(36,2048,64,'#fff');
function buildLaptop(m){
  const g=new THREE.Group(),W=31.2,Dp=21.8,T=1.15,R=1.0,Hl=20.6,Tl=.5,Tb=T*.56,Tt=T-Tb;
  // bottom case
  const bc=slab(W,Dp,R,Tb,.22);bc.rotateX(-Math.PI/2);bc.translate(0,Tb/2,0);g.add(mesh(bc,m.frame));
  // top case with keyboard well and trackpad opening
  const kbW=24.4,kbZ=-Dp*.12,{group:kb,depth:kbD,capT}=buildKeyboard(kbW),tpW=W*.4,tpD=Dp*.3,tpZ=Dp*.28,b=.06;
  const top=rrShape(W-2*b,Dp-2*b,R-b);
  top.holes.push(rrShape(kbW+.36,kbD+.36,.45,0,-kbZ));
  top.holes.push(rrShape(tpW+.14,tpD+.14,.42,0,-tpZ));
  const tg=new THREE.ExtrudeGeometry(top,{depth:Tt-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:4,curveSegments:24});
  tg.translate(0,0,-(Tt-2*b)/2);tg.rotateX(-Math.PI/2);tg.translate(0,Tb+Tt/2,0);g.add(mesh(tg,m.frame));
  const floor=mesh(flatRR(kbW+.5,kbD+.5,.5),M.well);floor.rotation.x=-Math.PI/2;floor.position.set(0,T-.2,kbZ);g.add(floor);
  kb.position.set(0,T-.2+capT/2,kbZ);g.add(kb);
  const tp=mesh(slab(tpW,tpD,.38,.12,.035),m.pad);tp.geometry.rotateX(-Math.PI/2);tp.position.set(0,T-.075,tpZ);g.add(tp);
  const tfl=mesh(flatRR(tpW+.2,tpD+.2,.45),M.well);tfl.rotation.x=-Math.PI/2;tfl.position.set(0,T-.16,tpZ);g.add(tfl);
  // speaker grille above the keyboard
  const gr=mesh(new THREE.PlaneGeometry(kbW,.62),alphaMat(GRILLE_TEX));gr.rotation.x=-Math.PI/2;gr.position.set(0,T+.003,kbZ-kbD/2-.95);gr.userData.decal=true;g.add(gr);
  // ports: left 2x USB-C, right USB-A + HDMI + audio jack
  const py=Tb*.5,side=(sx,el,z)=>{g.add(onSide(el,'x',sx,new V3(sx*(W/2+.006),py,z)));};
  [-5.6,-4.1].forEach(z=>{side(-1,hole(.9,.3,.15),z);side(-1,hole(.74,.14,.07,M.portIn),z);});
  side(1,hole(1.32,.48,.04),-5.8);const tongue=hole(1.1,.13,.02,M.portIn);g.add(onSide(tongue,'x',1,new V3(W/2+.009,py+.08,-5.8)));
  const hdmi=new THREE.Shape();hdmi.moveTo(-.72,.22);hdmi.lineTo(.72,.22);hdmi.lineTo(.72,-.05);hdmi.lineTo(.55,-.22);hdmi.lineTo(-.55,-.22);hdmi.lineTo(-.72,-.05);hdmi.lineTo(-.72,.22);
  side(1,mesh(new THREE.ShapeGeometry(hdmi),M.port),-3.6);
  side(1,mesh(new THREE.CircleGeometry(.17,24),M.port),2.4);
  const led=mesh(new THREE.CircleGeometry(.05,12),new THREE.MeshBasicMaterial({color:0xd8f5df}));side(1,led,3.3);
  // rear vents and rubber feet
  const vent=mesh(new THREE.PlaneGeometry(W*.55,.3),alphaMat(VENT_TEX));vent.rotation.y=Math.PI;vent.position.set(0,py,-Dp/2-.006);vent.userData.decal=true;g.add(vent);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz])=>{const f=mesh(slab(4.6,.9,.45,.16,.05),M.rubber);f.geometry.rotateX(-Math.PI/2);
    f.position.set(sx*(W/2-4),-.06,sz*(Dp/2-2.2));g.add(f);});
  const hinge=mesh(new THREE.CylinderGeometry(.42,.42,W*.72,32),m.frame);hinge.rotation.z=Math.PI/2;hinge.position.set(0,T*.6,-Dp/2+.2);g.add(hinge);
  // lid
  const lid=new THREE.Group();lid.position.set(0,T,-Dp/2+.25);
  const lg=slab(W,Hl,R,Tl,.15);lg.translate(0,Hl/2,-Tl/2);lid.add(mesh(lg,m.frame));
  const gw=W-.16,gh=Hl-.16;
  const fg=mesh(flatRR(gw,gh,R-.08),M.glass);fg.position.set(0,Hl/2,.002);lid.add(fg);
  const sideB=.7,topB=.95,chin=1.35,sw=gw-2*sideB,sh=gh-topB-chin,sy=.08+chin+sh/2;
  const scr=mesh(flatRR(sw,sh,.22),m.screen);scr.position.set(0,sy,.004);lid.add(scr);
  const glare=mesh(flatRR(sw,sh,.22),M.glare);glare.position.set(0,sy,.006);lid.add(glare);
  const camY=Hl-.08-topB/2,camR=mesh(new THREE.CircleGeometry(.15,32),M.port);camR.position.set(0,camY,.005);lid.add(camR);
  const camL=mesh(new THREE.CircleGeometry(.08,32),M.lensFace);camL.position.set(0,camY,.006);lid.add(camL);
  g.add(lid);
  return {group:g,screen:scr,glare,sw,sh,rotatable:false,lid};
}

export {buildLaptop};
