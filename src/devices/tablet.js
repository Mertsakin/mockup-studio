import * as THREE from 'three';
import {flatRR,hole,lens,mesh,onSide,slab} from './geometry.js';
import {M} from './materials.js';
import {V3} from '../util.js';

function buildTablet(m){
  const g=new THREE.Group(),W=17.9,H=24.8,D=.6,R=1.2,gi=.08,bz=.82;
  g.add(mesh(slab(W,H,R,D,.12),m.frame));
  const gw=W-2*gi,gh=H-2*gi,gr=R-gi;
  const front=mesh(flatRR(gw,gh,gr),M.glass);front.position.z=D/2+.002;g.add(front);
  const sw=gw-2*bz,sh=gh-2*bz,sr=.45;
  const scr=mesh(flatRR(sw,sh,sr),m.screen);scr.position.z=D/2+.004;g.add(scr);
  const glare=mesh(flatRR(sw,sh,sr),M.glare);glare.position.z=D/2+.006;g.add(glare);
  const cam=mesh(new THREE.CircleGeometry(.11,32),M.lensFace);cam.position.set(0,gh/2-bz/2,D/2+.005);g.add(cam);
  const back=mesh(flatRR(gw,gh,gr),m.back);back.rotation.y=Math.PI;back.position.z=-D/2-.002;g.add(back);
  const cm=new THREE.Group();cm.add(mesh(slab(1.5,1.5,.5,.12,.04),m.frame));
  const l=lens(.42,m.frame);l.position.z=-.08;cm.add(l);cm.position.set(W/2-1.4,H/2-1.4,-D/2-.06);g.add(cm);
  const p=mesh(slab(1.6,.12,.06,.26,.04),m.frame);p.rotation.x=Math.PI/2;p.position.set(W/2-3.2,H/2+.03,0);g.add(p);
  [H/2-3.6,H/2-5.3].forEach(y=>{const k=mesh(slab(.12,1.4,.06,.26,.04),m.frame);k.rotation.y=Math.PI/2;k.position.set(W/2+.03,y,0);g.add(k);});
  // speaker grilles on both short edges, charge port, antenna band
  [1,-1].forEach(sy=>{for(let i=0;i<7;i++)[-1,1].forEach(sx=>{const c=mesh(new THREE.CircleGeometry(.045,12),M.hole);
    g.add(onSide(c,'y',sy,new V3(sx*(3.2+i*.2),sy*(H/2+.006),0)));});});
  g.add(onSide(hole(.86,.24,.12),'y',-1,new V3(0,-H/2-.006,0)));
  g.add(onSide(hole(.7,.13,.065,M.portIn),'y',-1,new V3(0,-H/2-.008,0)));
  const bnd=mesh(new THREE.BoxGeometry(.03,.14,D*.6),m.band);bnd.position.set(W/2+.004,H/2-R-1.2,0);g.add(bnd);
  return {group:g,screen:scr,glare,sw,sh,rotatable:true};
}

export {buildTablet};
