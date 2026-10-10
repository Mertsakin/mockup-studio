import * as THREE from 'three';
import {aoPlane,flatRR,hole,innerRadii,mesh,onSide,slab} from './geometry.js';
import {M} from './materials.js';
import {V3} from '../util.js';

/* Generic desktop monitor (cm): thin panel with a crisp chamfer, edge-to-edge front glass, a soft pillow-shaped
   electronics housing on the back, a rounded column with a cable pass-through and a thin chamfered base plate. */
function buildMonitor(m){
  const g=new THREE.Group(),sw=52.8,sh=29.7,bz=.62,W=sw+2*bz,H=sh+2*bz,D=.75,R=.5;
  g.add(mesh(slab(W,H,R,D,.08),m.frame));
  const fg=mesh(flatRR(W-.1,H-.1,R-.05),M.glass);fg.position.z=D/2+.002;g.add(fg);
  const sr=innerRadii(R-.05,bz-.05,bz-.05,bz-.05,bz-.05);  // bezel wider than the corner radius: square
  const scr=mesh(flatRR(sw,sh,sr),m.screen);scr.position.z=D/2+.004;g.add(scr);
  const glare=mesh(flatRR(sw,sh,sr),M.glare);glare.position.z=D/2+.005;g.add(glare);
  // back plate: UVs in cm like the extruded parts, so finish textures keep the same grain size as on the frame
  const bgeo=flatRR(W-.1,H-.1,R-.05),buv=bgeo.attributes.uv;for(let i=0;i<buv.count;i++)buv.setXY(i,buv.getX(i)*(W-.1),buv.getY(i)*(H-.1));
  const back=mesh(bgeo,m.back);back.rotation.y=Math.PI;back.position.z=-D/2-.002;g.add(back);
  // electronics housing: deep rounded edges so it reads as one soft moulded shape, sunk slightly into the panel
  const HT=1.9,hump=mesh(slab(30,18,4.5,HT,.85),m.frame);hump.position.set(0,-1.2,-D/2-HT/2+.1);g.add(hump);
  const baseY=-H/2-8.5,BT=.42;
  const top=new V3(0,-3,-D/2-HT+.4),bot=new V3(0,baseY,-5.2),dir=top.clone().sub(bot),L=dir.length();
  const CT=1.1,neck=mesh(slab(4.4,L,1.2,CT,.32),m.frame);neck.position.copy(top).add(bot).multiplyScalar(.5);neck.rotation.x=Math.atan2(dir.z,dir.y);g.add(neck);
  neck.add(onSide(hole(1.5,.85,.42),'z',-1,new V3(0,-L*.18,-CT/2-.004)));  // cable pass-through on the back of the column
  const bg=slab(23,14,4.5,BT,.14);bg.rotateX(-Math.PI/2);bg.translate(0,baseY-BT/2,-4.6);g.add(mesh(bg,m.frame));
  const ao=aoPlane(23*1.18,14*1.25,.42,baseY-BT+.003,.6);ao.position.z=-4.6;g.add(ao);
  return {group:g,screen:scr,glare,sw,sh,rotatable:false};
}

export {buildMonitor};
