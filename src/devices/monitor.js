import * as THREE from 'three';
import {flatRR,mesh,slab} from './geometry.js';
import {M} from './materials.js';
import {V3} from '../util.js';

function buildMonitor(m){
  const g=new THREE.Group(),sw=52.8,sh=29.7,bz=.62,W=sw+2*bz,H=sh+2*bz,D=.9,R=.5;
  g.add(mesh(slab(W,H,R,D,.12),m.frame));
  const fg=mesh(flatRR(W-.1,H-.1,R-.05),M.glass);fg.position.z=D/2+.002;g.add(fg);
  const scr=mesh(flatRR(sw,sh,.08),m.screen);scr.position.z=D/2+.004;g.add(scr);
  const glare=mesh(flatRR(sw,sh,.08),M.glare);glare.position.z=D/2+.005;g.add(glare);
  const back=mesh(flatRR(W-.1,H-.1,R-.05),m.back);back.rotation.y=Math.PI;back.position.z=-D/2-.002;g.add(back);
  const hump=mesh(slab(28,17,2.4,2.2,.45),m.frame);hump.position.set(0,-1.5,-D/2-1.0);g.add(hump);
  const baseY=-H/2-8.5;
  const top=new V3(0,-3,-D/2-2.0),bot=new V3(0,baseY,-5.2),dir=top.clone().sub(bot),L=dir.length();
  const neck=mesh(slab(5.2,L,1.0,1.4,.2),m.frame);neck.position.copy(top).add(bot).multiplyScalar(.5);neck.rotation.x=Math.atan2(dir.z,dir.y);g.add(neck);
  const bg=slab(24,15,5,.7,.2);bg.rotateX(-Math.PI/2);bg.translate(0,baseY-.35,-4.6);g.add(mesh(bg,m.frame));
  return {group:g,screen:scr,glare,sw,sh,rotatable:false};
}

export {buildMonitor};
