import * as THREE from 'three';
import {alphaMat,aoPlane,dotTexture,flatRR,hole,innerRadii,mesh,onSide,rrShape,slab,slotTexture} from './geometry.js';
import {buildKeyboard} from './keyboard.js';
import {M} from './materials.js';
import {V3} from '../util.js';

/* Thin generic laptop (cm). Unibody: a lower shell with a soft rounded bottom edge and a top deck with a crisp small
   chamfer; they meet on the vertical wall, leaving only a hairline parting seam. Low-profile keys stand KEY_UP above
   the deck. Generic on purpose: no logo, notch or brand-specific details. */
const W=31.2,Dp=21.8,T=.675,R=1.15,Hl=20.4,Tl=.252;
const CAP_T=.108,KEY_UP=.027,WELL=.135,FEET=.07;
const SPEAKER_TEX=dotTexture(14,90,256,4096,5.2,'#fff');
const VENT_TEX=slotTexture(36,2048,64,'#fff');
function buildLaptop(m){
  const g=new THREE.Group(),H1=T-WELL,yU=T*.38;
  // lower shell
  const lo=slab(W,Dp,R,H1,Math.min(.3,H1*.35));lo.rotateX(-Math.PI/2);lo.translate(0,H1/2,0);g.add(mesh(lo,m.frame));
  // top deck with keyboard and trackpad openings
  const kbW=23.4,kbZ=-Dp*.13,{group:kb,depth:kbD}=buildKeyboard(kbW,CAP_T),tpW=W*.42,tpD=Dp*.31,tpZ=Dp*.285,b=.045;
  const top=rrShape(W-2*b,Dp-2*b,R-b);
  top.holes.push(rrShape(kbW+.3,kbD+.3,.35,0,-kbZ));
  top.holes.push(rrShape(tpW+.08,tpD+.08,.5,0,-tpZ));
  const dD=T-yU,tg=new THREE.ExtrudeGeometry(top,{depth:dD-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:3,curveSegments:32});
  tg.translate(0,0,-(dD-2*b)/2);tg.rotateX(-Math.PI/2);tg.translate(0,yU+dD/2,0);g.add(mesh(tg,m.frame));
  // keyboard well floor: body colour (slightly darker, it sits in shade between the keys); keys stay dark
  const floor=mesh(flatRR(kbW+.4,kbD+.4,.4),m.well);floor.rotation.x=-Math.PI/2;floor.position.set(0,H1+.002,kbZ);g.add(floor);
  kb.position.set(0,T+KEY_UP-CAP_T/2,kbZ);g.add(kb);
  // glass-like trackpad flush with the deck, thin dark gap around it
  const tp=mesh(slab(tpW,tpD,.48,.1,.03),m.pad);tp.geometry.rotateX(-Math.PI/2);tp.position.set(0,T-.055,tpZ);g.add(tp);
  const tfl=mesh(flatRR(tpW+.1,tpD+.1,.52),M.port);tfl.rotation.x=-Math.PI/2;tfl.position.set(0,T-.13,tpZ);g.add(tfl);
  // micro-perforated speaker strips either side of the keyboard
  [-1,1].forEach(sx=>{const s=mesh(new THREE.PlaneGeometry(1.35,kbD-.2),alphaMat(SPEAKER_TEX));s.rotation.x=-Math.PI/2;
    s.position.set(sx*(kbW/2+1.9),T+.002,kbZ);s.userData.decal=true;g.add(s);});
  // ports on the wall: left 2x USB-C, right USB-C + audio jack
  const py=yU+(T-yU)/2,side=(sx,el,z)=>{g.add(onSide(el,'x',sx,new V3(sx*(W/2+.004),py,z)));};
  [-5.4,-3.9].forEach(z=>{side(-1,hole(.8,.24,.12),z);side(-1,hole(.66,.11,.055,M.portIn),z);});
  side(1,hole(.8,.24,.12),-5.4);side(1,hole(.66,.11,.055,M.portIn),-5.4);side(1,mesh(new THREE.CircleGeometry(.12,24),M.port),-3.6);
  // rear vents, long rubber feet
  const vent=mesh(new THREE.PlaneGeometry(W*.5,.16),alphaMat(VENT_TEX));vent.rotation.y=Math.PI;vent.position.set(0,H1*.45,-Dp/2-.006);vent.userData.decal=true;g.add(vent);
  [-1,1].forEach(sz=>{const f=mesh(slab(W-7,.75,.37,FEET,.03),M.rubber);f.geometry.rotateX(-Math.PI/2);f.position.set(0,.02-FEET/2,sz*(Dp/2-2.1));g.add(f);});
  const hinge=mesh(new THREE.CylinderGeometry(T*.36,T*.36,W*.78,40),M.well);hinge.rotation.z=Math.PI/2;hinge.position.set(0,T*.62,-Dp/2+.28);g.add(hinge);
  // lid: aluminium shell, edge-to-edge glass inset by a thin metal rim, slim bezels
  const lid=new THREE.Group();lid.position.set(0,T,-Dp/2+.3);
  const lg=slab(W,Hl,R,Tl,Math.min(.14,Tl*.4));lg.translate(0,Hl/2,-Tl/2);lid.add(mesh(lg,m.frame));
  const rim=.1,gw=W-2*rim,gh=Hl-2*rim;
  const fg=mesh(flatRR(gw,gh,R-rim),M.glass);fg.position.set(0,Hl/2,.002);lid.add(fg);
  // equal bezels on all four sides
  const sideB=.34,topB=.34,chin=.34,sw=gw-2*sideB,sh=gh-topB-chin,sy=rim+chin+sh/2;
  const scr=mesh(flatRR(sw,sh,innerRadii(R-rim,topB,sideB,chin,sideB)),m.screen);scr.position.set(0,sy,.004);lid.add(scr);
  const glare=mesh(flatRR(gw,gh,R-rim),M.glare);glare.position.set(0,Hl/2,.006);lid.add(glare);
  const camY=Hl-rim-topB/2,camR=mesh(new THREE.CircleGeometry(.11,32),M.port);camR.position.set(0,camY,.005);lid.add(camR);
  const camL=mesh(new THREE.CircleGeometry(.055,32),M.lensFace);camL.position.set(0,camY,.0055);lid.add(camL);
  g.add(lid);
  // soft darkening right under the body; it predates the shared helper and has always counted towards framing and
  // centring, so it keeps doing so (fit: true) and existing laptop scenes and templates frame as before
  const ao=aoPlane(W*1.25,Dp*1.25,.42,.022-FEET,.55);ao.userData.fit=true;g.add(ao);
  return {group:g,screen:scr,glare,sw,sh,rotatable:false,lid};
}

export {buildLaptop};
