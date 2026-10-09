import * as THREE from 'three';
import {phoneDetails} from './details/phone.js';
import {flatRR,innerRadii,lens,mesh,slab} from './geometry.js';
import {M} from './materials.js';

function buildPhone(m){
  const g=new THREE.Group(),W=7.15,H=14.7,D=.8,R=1.05,gi=.09,bz=.18;
  g.add(mesh(slab(W,H,R,D,.13),m.frame));
  const gw=W-2*gi,gh=H-2*gi,gr=R-gi;
  const front=mesh(flatRR(gw,gh,gr),M.glass);front.position.z=D/2+.002;g.add(front);
  const sw=gw-2*bz,sh=gh-2*bz,sr=innerRadii(gr,bz,bz,bz,bz);
  const scr=mesh(flatRR(sw,sh,sr),m.screen);scr.position.z=D/2+.004;g.add(scr);
  const glare=mesh(flatRR(sw,sh,sr),M.glare);glare.position.z=D/2+.006;g.add(glare);
  const hole1=mesh(new THREE.CircleGeometry(.2,40),M.black);hole1.position.set(0,sh/2-.48,D/2+.005);g.add(hole1);
  const ear=mesh(flatRR(1.5,.075,.037),M.port);ear.position.set(0,gh/2-.13,D/2+.004);g.add(ear);
  const back=mesh(flatRR(gw,gh,gr),m.back);back.rotation.y=Math.PI;back.position.z=-D/2-.002;g.add(back);
  const cm=new THREE.Group();cm.add(mesh(slab(2.0,3.3,1.0,.14,.05),m.frame));
  const l1=lens(.6,m.frame);l1.position.set(0,.74,-.1);const l2=lens(.6,m.frame);l2.position.set(0,-.74,-.1);cm.add(l1,l2);
  cm.position.set(W/2-1.55,H/2-2.2,-D/2-.07);g.add(cm);
  const fl=mesh(new THREE.CylinderGeometry(.17,.17,.04,32),M.flash);fl.rotation.x=Math.PI/2;fl.position.set(W/2-3.0,H/2-1.3,-D/2-.02);g.add(fl);
  const mic=mesh(new THREE.CircleGeometry(.05,12),M.hole);mic.rotation.y=Math.PI;mic.position.set(W/2-3.0,H/2-1.85,-D/2-.006);g.add(mic);
  // side buttons: 3.2 mm deep along x after the rotation, standing BTN_OUT proud of the wall (the rest sits inside)
  const BTN_D=.32,BTN_OUT=.127,BTN_W=.06;  // BTN_W: front-to-back width
  [[1,2.6,1.7],[-1,3.3,1.2],[-1,1.85,1.2]].forEach(([sx,y,l])=>{
    const k=mesh(slab(BTN_W,l,BTN_W/2,BTN_D,BTN_W*.3),m.frame);k.rotation.y=Math.PI/2;k.position.set(sx*(W/2+BTN_OUT-BTN_D/2),y,0);g.add(k);});
  phoneDetails(g,m,W,H,D,R);
  return {group:g,screen:scr,glare,sw,sh,rotatable:true,hole:hole1};
}

export {buildPhone};
